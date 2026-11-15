// Owner-governed campaign runner V3 (connector-v3.mjs; O-2R.1). Derived from campaign-v2.mjs by explicit substitution,
// plus O-5: a fail-closed preflight that runs BEFORE the replication directory exists, so a refused start never consumes
// the once-only replication. The 1,000 ms policy limit is unchanged. Original V2 header follows.
// Owner-governed campaign runner V2 (for a registration built on connector-v2.mjs). DORMANT, same refusals as campaign.mjs,
// plus: the active registration must name CONNECTOR_V2_ID and lives at registration/ACTIVE_REGISTRATION_V2.json, so the V1
// runner can never execute a V2 registration and vice versa. campaign.mjs is imported, never edited.
import { readFileSync, existsSync, mkdirSync, chmodSync, openSync, writeSync, closeSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { POPULATIONS } from '../stage3h-final-review-handoff/amendments/v3/analysis.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { nativeRowV3, CONNECTOR_V3_ID } from './connector-v3.mjs';
import { nativeLock } from './connector.mjs';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { loadActiveRegistration, loadAuthorization, ownerAdmission, analyseLocked } from './campaign.mjs';
import { LANE, GA, verifyOwnerLane } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const writeOnce = (p, v) => { const fd = openSync(p, 'wx'); writeSync(fd, JSON.stringify(v) + '\n'); closeSync(fd); chmodSync(p, 0o444); return fileSha(p); };
export const V3_REGISTRATION = resolve(LANE, 'registration/ACTIVE_REGISTRATION_V3.json');
export const V3_AUTHORIZATION = resolve(LANE, 'registration/EXECUTION_AUTHORIZATION_V3.json');
const loadV3 = (path) => { const reg = loadActiveRegistration(path); ok(reg.connector === CONNECTOR_V3_ID, 'REGISTRATION_NOT_FOR_CONNECTOR_V3'); return reg; };
export const PREFLIGHT = Object.freeze({ maxLoadFractionOfCores: 0.25, devLocks: 96, lockP99MaxMs: 250, lockMaxMs: 500 });
/** O-5 preflight on DEVELOPMENT worlds only (STAGE3H1 OPEN). Throws before any registered world or output exists. */
export function preflight(limits = PREFLIGHT) {
  const load = loadavg()[0], cores = cpus().length;
  ok(load <= limits.maxLoadFractionOfCores * cores, 'PREFLIGHT_LOAD_TOO_HIGH:' + load.toFixed(2) + '/' + cores);
  const others = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n').filter((l) => /node .*(stage3h|campaign-v|--test)/.test(l) && !l.trim().startsWith(String(process.pid)));
  ok(others.length === 0, 'PREFLIGHT_CONCURRENT_NODE_PROCESS:' + others.length);
  const dev = openCombos().map(({ panel, ...c }) => c), ms = [];
  for (let i = 0; i < limits.devLocks; i++) { const c = dev[(i * 37) % dev.length], w = runCalibratedWarmup(c.seed, (t) => generateScenarioSymmetricV1({ ...c, warmupTicks: t })).world; ms.push(nativeLock(observableView(w), c.horizonBand).compute.elapsedMs); }
  ms.sort((a, b) => a - b); const p99 = ms[Math.min(ms.length - 1, Math.ceil(0.99 * ms.length) - 1)], max = ms.at(-1);
  ok(p99 <= limits.lockP99MaxMs && max <= limits.lockMaxMs, 'PREFLIGHT_LOCK_TIME_MARGIN:' + p99.toFixed(1) + '/' + max.toFixed(1));
  return { load, cores, p99, max, limits };
}

export function runReplicationV3(replication, { registrationPath = V3_REGISTRATION, authorizationPath = V3_AUTHORIZATION, preflightLimits = PREFLIGHT } = {}) {
  ok(['A', 'B'].includes(replication), 'UNKNOWN_REPLICATION');
  verifyOwnerLane();
  const reg = loadV3(registrationPath); loadAuthorization(authorizationPath, reg, replication);
  assertRuntimeIdentity(reg.bindings.runtime);
  const out = resolve(LANE, 'runs', reg.registrationHash.slice(0, 16), replication);
  ok(!existsSync(out), 'REPLICATION_ALREADY_EXECUTED');
  const pre = preflight(preflightLimits);
  mkdirSync(out, { recursive: true });
  const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  const plan = schedule(contract.populations, reg.namespaces[replication]);
  ok(scheduleHash(plan) === reg.scheduleHashes[replication] && plan.length === reg.scheduledPerReplication, 'SCHEDULE_MISMATCH');
  ok(fileSha(resolve(GA, reg.bindings.priorExclusions.file)) === reg.bindings.priorExclusions.sha256, 'PRIOR_EXCLUSIONS_CHANGED');
  const ctx = { seen: new Set(), prior: new Set(J(resolve(GA, reg.bindings.priorExclusions.file)).priorWorldHashes) };
  const byPop = Object.fromEntries(POPULATIONS.map((p) => [p, { rows: [], records: [], ledger: [] }])), t0 = Date.now();
  for (const combo of plan) {
    const r = nativeRowV3(combo, ctx), p = byPop[combo.population];
    if (r.rejected) p.records.push({ ...r.rejected, rejected: true });
    else { p.rows.push(r.row); p.ledger.push(r.ledger); p.records.push({ id: r.row.id, cell: combo.cell, band: r.row.band, rejected: false }); }
  }
  const lock = { registrationHash: reg.registrationHash, connector: CONNECTOR_V3_ID, replication, preflight: pre, wallMs: Date.now() - t0, files: {} };
  for (const [pop, p] of Object.entries(byPop)) {
    const sched = {}; for (const c of plan.filter((c) => c.population === pop)) { sched[c.cell] ??= { scheduled: 0, band: c.horizonBand }; sched[c.cell].scheduled++; }
    const admission = ownerAdmission(p.records, sched, reg.amendments.O3.choice);
    lock.files[pop] = { rows: writeOnce(resolve(out, pop + '.rows.json'), p.rows), ledger: writeOnce(resolve(out, pop + '.ledger.json'), p.ledger), admission: writeOnce(resolve(out, pop + '.admission.json'), admission), accepted: p.rows.length, scheduled: p.records.length, admissionPass: admission.pass };
  }
  const lockHash = writeOnce(resolve(out, 'LOCK.json'), lock);
  return { replication, lockHash, counts: Object.fromEntries(Object.entries(lock.files).map(([k, v]) => [k, v.accepted + '/' + v.scheduled])) };
}
export function analyseLockedV3() { loadV3(V3_REGISTRATION); return analyseLocked({ registrationPath: V3_REGISTRATION }); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, rep] = process.argv.slice(2);
  const r = cmd === 'run' ? runReplicationV3(rep) : cmd === 'analyse' ? analyseLockedV3() : (() => { throw Error('USAGE: campaign-v3.mjs run A|B | analyse'); })();
  console.log(JSON.stringify(r));
}
