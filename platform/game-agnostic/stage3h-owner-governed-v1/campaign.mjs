// Owner-governed campaign runner. DORMANT: every entry point refuses unless an ACTIVE owner-governed registration and a
// matching once-only execution authorization exist on disk, all bound source hashes and the exact runtime match, and the
// replication's output directory does not yet exist. Outputs are written once (wx), made read-only, and only counts and
// hashes are printed (designer blinding is procedural: same-person custody, see AMENDMENT). Analysis runs only after
// both replications are locked.
import { readFileSync, existsSync, mkdirSync, chmodSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { admissionReport, assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { POPULATIONS } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { nativeRow, schedule, scheduleHash } from './connector.mjs';
import { analyseNativePanel, ownerGovernedDisposition } from './analysis-native.mjs';
import { LANE, GA, verifyOwnerLane } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const registrationHash = (reg) => { const { registrationHash: _h, ...body } = reg; return sha256(stableStringify(body)); };
const writeOnce = (p, v) => { const fd = openSync(p, 'wx'); writeSync(fd, JSON.stringify(v) + '\n'); closeSync(fd); chmodSync(p, 0o444); return fileSha(p); };

export function loadActiveRegistration(path) {
  ok(existsSync(path), 'NO_ACTIVE_REGISTRATION');
  const reg = J(path);
  ok(reg.status === 'ACTIVE_OWNER_GOVERNED' && reg.reviewMode === 'OWNER_GOVERNED' && reg.independentMethodReview === false, 'REGISTRATION_NOT_ACTIVE_OWNER_GOVERNED');
  ok(reg.registrationHash === registrationHash(reg), 'REGISTRATION_HASH_MISMATCH');
  const scopes = ['SCOPE-DDV', 'SCOPE-TCA', 'SCOPE-PRIME', 'SCOPE-REGIME', 'SCOPE-THRESHOLDS'];
  ok(reg.ownerApproval && scopes.every((s) => reg.ownerApproval.decisions?.[s]?.approved === true && reg.ownerApproval.decisions[s].signatureOrTrustedApprovalReference), 'OWNER_SCOPE_APPROVAL_MISSING');
  ok(reg.ownerApproval.intendedOutcome === 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION', 'INTENDED_OUTCOME_NOT_BOUNDED');
  for (const [f, h] of Object.entries(reg.bindings.sources)) ok(fileSha(resolve(GA, f)) === h, 'BOUND_SOURCE_CHANGED:' + f);
  return reg;
}
export function loadAuthorization(path, reg, replication) {
  ok(existsSync(path), 'NO_EXECUTION_AUTHORIZATION');
  const a = J(path);
  ok(a.type === 'EXECUTE_ONCE' && a.registrationHash === reg.registrationHash && (a.replications ?? []).includes(replication), 'AUTHORIZATION_DOES_NOT_COVER_THIS_RUN');
  ok(a.ownerIdentity && a.signatureOrTrustedApprovalReference && a.date, 'AUTHORIZATION_UNSIGNED');
  return a;
}

/** Admission report: V3 admissionReport logic with the per-cell floor selected by owner choice O-3.
 * KEEP_V3_HALF_PER_CELL reproduces V3 exactly (tested); MIN_TWO_PER_CELL requires >= 2 accepted per cell.
 * Population (0.9), per-band (0.9) and effective-N (2100) floors are unchanged in both options. */
export function ownerAdmission(rows, sched, choice) {
  ok(['KEEP_V3_HALF_PER_CELL', 'MIN_TWO_PER_CELL'].includes(choice), 'O3_CHOICE_REQUIRED');
  const v3 = admissionReport(rows, sched);
  if (choice === 'KEEP_V3_HALF_PER_CELL') return { ...v3, o3: choice };
  const cs = Object.values(v3.cells), accepted = v3.accepted;
  const pass = accepted / rows.length >= 0.9 && cs.every((c) => c.accepted >= 2) && v3.effectiveN >= 2100 && Object.values(v3.perBand).every((b) => b.pass);
  return { ...v3, pass, o3: choice, cellFloor: 2 };
}

/** Execute one registered replication exactly once. */
export function runReplication(replication, { registrationPath = resolve(LANE, 'registration/ACTIVE_REGISTRATION.json'), authorizationPath = resolve(LANE, 'registration/EXECUTION_AUTHORIZATION.json') } = {}) {
  ok(['A', 'B'].includes(replication), 'UNKNOWN_REPLICATION');
  verifyOwnerLane();
  const reg = loadActiveRegistration(registrationPath); loadAuthorization(authorizationPath, reg, replication);
  assertRuntimeIdentity(reg.bindings.runtime);
  const out = resolve(LANE, 'runs', reg.registrationHash.slice(0, 16), replication);
  ok(!existsSync(out), 'REPLICATION_ALREADY_EXECUTED'); mkdirSync(out, { recursive: true });
  const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  const plan = schedule(contract.populations, reg.namespaces[replication]);
  ok(scheduleHash(plan) === reg.scheduleHashes[replication] && plan.length === reg.scheduledPerReplication, 'SCHEDULE_MISMATCH');
  const prior = new Set(J(resolve(GA, reg.bindings.priorExclusions.file)).priorWorldHashes);
  ok(fileSha(resolve(GA, reg.bindings.priorExclusions.file)) === reg.bindings.priorExclusions.sha256, 'PRIOR_EXCLUSIONS_CHANGED');
  const ctx = { seen: new Set(), prior }, byPop = Object.fromEntries(POPULATIONS.map((p) => [p, { rows: [], records: [], ledger: [] }])), t0 = Date.now();
  for (const combo of plan) {
    const r = nativeRow(combo, ctx), p = byPop[combo.population];
    if (r.rejected) p.records.push({ ...r.rejected, rejected: true });
    else { p.rows.push(r.row); p.ledger.push(r.ledger); p.records.push({ id: r.row.id, cell: combo.cell, band: r.row.band, rejected: false }); }
  }
  const lock = { registrationHash: reg.registrationHash, replication, wallMs: Date.now() - t0, files: {} };
  for (const [pop, p] of Object.entries(byPop)) {
    const sched = {}; for (const c of plan.filter((c) => c.population === pop)) { sched[c.cell] ??= { scheduled: 0, band: c.horizonBand }; sched[c.cell].scheduled++; }
    const admission = ownerAdmission(p.records, sched, reg.amendments.O3.choice);
    lock.files[pop] = { rows: writeOnce(resolve(out, pop + '.rows.json'), p.rows), ledger: writeOnce(resolve(out, pop + '.ledger.json'), p.ledger), admission: writeOnce(resolve(out, pop + '.admission.json'), admission), accepted: p.rows.length, scheduled: p.records.length, admissionPass: admission.pass };
  }
  const lockHash = writeOnce(resolve(out, 'LOCK.json'), lock);
  return { replication, lockHash, counts: Object.fromEntries(Object.entries(lock.files).map(([k, v]) => [k, v.accepted + '/' + v.scheduled])) };
}

/** Analysis: only after BOTH replications are locked and their hashes verify. */
export function analyseLocked({ registrationPath = resolve(LANE, 'registration/ACTIVE_REGISTRATION.json') } = {}) {
  const reg = loadActiveRegistration(registrationPath), base = resolve(LANE, 'runs', reg.registrationHash.slice(0, 16));
  const panels = []; let admissionPass = true;
  for (const rep of ['A', 'B']) {
    const lockPath = resolve(base, rep, 'LOCK.json'); ok(existsSync(lockPath), 'REPLICATION_NOT_LOCKED:' + rep);
    const lock = J(lockPath); ok(lock.registrationHash === reg.registrationHash, 'LOCK_REGISTRATION_MISMATCH');
    for (const pop of POPULATIONS) {
      const f = lock.files[pop]; ok(fileSha(resolve(base, rep, pop + '.rows.json')) === f.rows, 'LOCKED_ROWS_CHANGED');
      admissionPass &&= f.admissionPass;
      panels.push({ key: rep + '/' + pop, report: analyseNativePanel(J(resolve(base, rep, pop + '.rows.json')), { label: reg.analysisLabel + '/' + rep + '/' + pop }) });
    }
  }
  const disposition = ownerGovernedDisposition({ ownerApproval: reg.ownerApproval, registered: true, panels, admissionPass, integrityPass: true });
  const analysisHash = writeOnce(resolve(base, 'ANALYSIS.json'), { registrationHash: reg.registrationHash, panels, disposition });
  return { analysisHash, disposition };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, rep] = process.argv.slice(2);
  const r = cmd === 'run' ? runReplication(rep) : cmd === 'analyse' ? analyseLocked() : (() => { throw Error('USAGE: campaign.mjs run A|B | analyse'); })();
  console.log(JSON.stringify(r));
}
