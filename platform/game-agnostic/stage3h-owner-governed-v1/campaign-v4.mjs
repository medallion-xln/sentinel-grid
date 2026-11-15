// Owner-governed campaign runner V4 (connector-v4.mjs; amendment O-6 STAGE3H_NATIVE_MENU_VALIDITY_V1). Derived from
// campaign-v3.mjs by explicit substitution; campaign-v3.mjs is imported, never edited, and its O-5 preflight (machine
// load, concurrent processes, development lock-time margin) and the frozen 1,000 ms policy limit are used UNCHANGED.
// Additions, all fail-closed:
//   - the active registration must name CONNECTOR_V4_ID, carry an allocated namespace record and an owner approval of O-6;
//   - abort semantics: any exception after the replication directory exists writes ABORT.json (error code only, no world
//     identity, no row) and re-throws; the replication is consumed; nothing is retried or replaced;
//   - replication B refuses unless replication A of the SAME registration completed and locked without an ABORT record;
//   - analysis refuses while any ABORT record exists (it also requires both LOCK files, as before).
import { readFileSync, existsSync, mkdirSync, chmodSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { POPULATIONS } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { nativeRowV4, CONNECTOR_V4_ID } from './connector-v4.mjs';
import { preflight, PREFLIGHT } from './campaign-v3.mjs';
import { loadActiveRegistration, loadAuthorization, ownerAdmission, analyseLocked } from './campaign.mjs';
import { LANE, GA, verifyOwnerLane } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const writeOnce = (p, v) => { const fd = openSync(p, 'wx'); writeSync(fd, JSON.stringify(v) + '\n'); closeSync(fd); chmodSync(p, 0o444); return fileSha(p); };
export const V4_REGISTRATION = resolve(LANE, 'registration/ACTIVE_REGISTRATION_V4.json');
export const V4_AUTHORIZATION = resolve(LANE, 'registration/EXECUTION_AUTHORIZATION_V4.json');
export const O6_DECISION = 'AMENDMENT-O6-NATIVE-MENU-VALIDITY';
export { PREFLIGHT };

export function loadV4(path) {
  const reg = loadActiveRegistration(path);
  ok(reg.connector === CONNECTOR_V4_ID, 'REGISTRATION_NOT_FOR_CONNECTOR_V4');
  ok(reg.ownerApproval.decisions?.[O6_DECISION]?.approved === true && reg.ownerApproval.decisions[O6_DECISION].signatureOrTrustedApprovalReference, 'O6_OWNER_APPROVAL_MISSING');
  ok(['A', 'B'].every((r) => Number.isSafeInteger(reg.namespaces?.[r]) && typeof reg.scheduleHashes?.[r] === 'string') && reg.namespaceAllocation?.status === 'ALLOCATED_AFTER_OWNER_APPROVAL', 'NAMESPACES_NOT_ALLOCATED');
  return reg;
}
const runDir = (reg, rep) => resolve(LANE, 'runs', reg.registrationHash.slice(0, 16), rep);

export function runReplicationV4(replication, { registrationPath = V4_REGISTRATION, authorizationPath = V4_AUTHORIZATION, preflightLimits = PREFLIGHT } = {}) {
  ok(['A', 'B'].includes(replication), 'UNKNOWN_REPLICATION');
  verifyOwnerLane();
  const reg = loadV4(registrationPath); loadAuthorization(authorizationPath, reg, replication);
  assertRuntimeIdentity(reg.bindings.runtime);
  const out = runDir(reg, replication);
  ok(!existsSync(out), 'REPLICATION_ALREADY_EXECUTED');
  if (replication === 'B') {
    const a = runDir(reg, 'A');
    ok(existsSync(resolve(a, 'LOCK.json')) && !existsSync(resolve(a, 'ABORT.json')) && J(resolve(a, 'LOCK.json')).registrationHash === reg.registrationHash, 'B_REQUIRES_LOCKED_UNABORTED_A');
  }
  const pre = preflight(preflightLimits);
  mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  try {
    const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
    const plan = schedule(contract.populations, reg.namespaces[replication]);
    ok(scheduleHash(plan) === reg.scheduleHashes[replication] && plan.length === reg.scheduledPerReplication, 'SCHEDULE_MISMATCH');
    ok(fileSha(resolve(GA, reg.bindings.priorExclusions.file)) === reg.bindings.priorExclusions.sha256, 'PRIOR_EXCLUSIONS_CHANGED');
    const ctx = { seen: new Set(), prior: new Set(J(resolve(GA, reg.bindings.priorExclusions.file)).priorWorldHashes) };
    const byPop = Object.fromEntries(POPULATIONS.map((p) => [p, { rows: [], records: [], ledger: [] }]));
    for (const combo of plan) {
      const r = nativeRowV4(combo, ctx), p = byPop[combo.population];
      if (r.rejected) p.records.push({ ...r.rejected, rejected: true });
      else { p.rows.push(r.row); p.ledger.push(r.ledger); p.records.push({ id: r.row.id, cell: combo.cell, band: r.row.band, rejected: false }); }
    }
    const lock = { registrationHash: reg.registrationHash, connector: CONNECTOR_V4_ID, replication, preflight: pre, wallMs: Date.now() - t0, files: {} };
    for (const [pop, p] of Object.entries(byPop)) {
      const sched = {}; for (const c of plan.filter((c) => c.population === pop)) { sched[c.cell] ??= { scheduled: 0, band: c.horizonBand }; sched[c.cell].scheduled++; }
      const admission = ownerAdmission(p.records, sched, reg.amendments.O3.choice);
      lock.files[pop] = { rows: writeOnce(resolve(out, pop + '.rows.json'), p.rows), ledger: writeOnce(resolve(out, pop + '.ledger.json'), p.ledger), admission: writeOnce(resolve(out, pop + '.admission.json'), admission), accepted: p.rows.length, scheduled: p.records.length, admissionPass: admission.pass };
    }
    const lockHash = writeOnce(resolve(out, 'LOCK.json'), lock);
    return { replication, lockHash, counts: Object.fromEntries(Object.entries(lock.files).map(([k, v]) => [k, v.accepted + '/' + v.scheduled])) };
  } catch (e) {
    if (!existsSync(resolve(out, 'LOCK.json'))) writeOnce(resolve(out, 'ABORT.json'), { registrationHash: reg.registrationHash, connector: CONNECTOR_V4_ID, replication, error: String(e.message).split(':')[0], consumed: true, rowsRetained: false, worldIdentityRecorded: false, wallMs: Date.now() - t0 });
    throw e;
  }
}
export function analyseLockedV4() {
  const reg = loadV4(V4_REGISTRATION);
  ok(['A', 'B'].every((r) => !existsSync(resolve(runDir(reg, r), 'ABORT.json'))), 'REPLICATION_ABORTED');
  return analyseLocked({ registrationPath: V4_REGISTRATION });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, rep] = process.argv.slice(2);
  const r = cmd === 'run' ? runReplicationV4(rep) : cmd === 'analyse' ? analyseLockedV4() : (() => { throw Error('USAGE: campaign-v4.mjs run A|B | analyse'); })();
  console.log(JSON.stringify(r));
}
