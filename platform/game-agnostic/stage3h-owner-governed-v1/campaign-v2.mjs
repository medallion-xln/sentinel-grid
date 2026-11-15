// Owner-governed campaign runner V2 (for a registration built on connector-v2.mjs). DORMANT, same refusals as campaign.mjs,
// plus: the active registration must name CONNECTOR_V2_ID and lives at registration/ACTIVE_REGISTRATION_V2.json, so the V1
// runner can never execute a V2 registration and vice versa. campaign.mjs is imported, never edited.
import { readFileSync, existsSync, mkdirSync, chmodSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { POPULATIONS } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { nativeRowV2, CONNECTOR_V2_ID } from './connector-v2.mjs';
import { loadActiveRegistration, loadAuthorization, ownerAdmission, analyseLocked } from './campaign.mjs';
import { LANE, GA, verifyOwnerLane } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const writeOnce = (p, v) => { const fd = openSync(p, 'wx'); writeSync(fd, JSON.stringify(v) + '\n'); closeSync(fd); chmodSync(p, 0o444); return fileSha(p); };
export const V2_REGISTRATION = resolve(LANE, 'registration/ACTIVE_REGISTRATION_V2.json');
export const V2_AUTHORIZATION = resolve(LANE, 'registration/EXECUTION_AUTHORIZATION_V2.json');
const loadV2 = (path) => { const reg = loadActiveRegistration(path); ok(reg.connector === CONNECTOR_V2_ID, 'REGISTRATION_NOT_FOR_CONNECTOR_V2'); return reg; };

export function runReplicationV2(replication, { registrationPath = V2_REGISTRATION, authorizationPath = V2_AUTHORIZATION } = {}) {
  ok(['A', 'B'].includes(replication), 'UNKNOWN_REPLICATION');
  verifyOwnerLane();
  const reg = loadV2(registrationPath); loadAuthorization(authorizationPath, reg, replication);
  assertRuntimeIdentity(reg.bindings.runtime);
  const out = resolve(LANE, 'runs', reg.registrationHash.slice(0, 16), replication);
  ok(!existsSync(out), 'REPLICATION_ALREADY_EXECUTED'); mkdirSync(out, { recursive: true });
  const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  const plan = schedule(contract.populations, reg.namespaces[replication]);
  ok(scheduleHash(plan) === reg.scheduleHashes[replication] && plan.length === reg.scheduledPerReplication, 'SCHEDULE_MISMATCH');
  ok(fileSha(resolve(GA, reg.bindings.priorExclusions.file)) === reg.bindings.priorExclusions.sha256, 'PRIOR_EXCLUSIONS_CHANGED');
  const ctx = { seen: new Set(), prior: new Set(J(resolve(GA, reg.bindings.priorExclusions.file)).priorWorldHashes) };
  const byPop = Object.fromEntries(POPULATIONS.map((p) => [p, { rows: [], records: [], ledger: [] }])), t0 = Date.now();
  for (const combo of plan) {
    const r = nativeRowV2(combo, ctx), p = byPop[combo.population];
    if (r.rejected) p.records.push({ ...r.rejected, rejected: true });
    else { p.rows.push(r.row); p.ledger.push(r.ledger); p.records.push({ id: r.row.id, cell: combo.cell, band: r.row.band, rejected: false }); }
  }
  const lock = { registrationHash: reg.registrationHash, connector: CONNECTOR_V2_ID, replication, wallMs: Date.now() - t0, files: {} };
  for (const [pop, p] of Object.entries(byPop)) {
    const sched = {}; for (const c of plan.filter((c) => c.population === pop)) { sched[c.cell] ??= { scheduled: 0, band: c.horizonBand }; sched[c.cell].scheduled++; }
    const admission = ownerAdmission(p.records, sched, reg.amendments.O3.choice);
    lock.files[pop] = { rows: writeOnce(resolve(out, pop + '.rows.json'), p.rows), ledger: writeOnce(resolve(out, pop + '.ledger.json'), p.ledger), admission: writeOnce(resolve(out, pop + '.admission.json'), admission), accepted: p.rows.length, scheduled: p.records.length, admissionPass: admission.pass };
  }
  const lockHash = writeOnce(resolve(out, 'LOCK.json'), lock);
  return { replication, lockHash, counts: Object.fromEntries(Object.entries(lock.files).map(([k, v]) => [k, v.accepted + '/' + v.scheduled])) };
}
export function analyseLockedV2() { loadV2(V2_REGISTRATION); return analyseLocked({ registrationPath: V2_REGISTRATION }); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, rep] = process.argv.slice(2);
  const r = cmd === 'run' ? runReplicationV2(rep) : cmd === 'analyse' ? analyseLockedV2() : (() => { throw Error('USAGE: campaign-v2.mjs run A|B | analyse'); })();
  console.log(JSON.stringify(r));
}
