// Supplemental outcome-blind exclusion recount for registration 7c41ba89 (declared in its prospectiveExclusionReporting
// field; fixed and committed BEFORE replication A starts). It is a reporting mechanism only: it never replaces the
// registered runner's admission counts or the registered analysis, and it never writes into a run directory.
//
// prePolicyAdmission() reproduces, call for call, the pre-policy part of the registered connector (connector-v4.mjs guard +
// connector-v3.mjs before nativeLock) with the bound functions: generation and warm-up, validateScenarioV2, terminal and
// task checks, the within-run duplicate-world set, the prior-world exclusion set, the packet-horizon check and the O-6
// menu rule over the 11 policy-facing views. It calls no R/B/N policy, computes no evaluator truth and reads no outcome.
// Fixed rejection precedence (as in the connector): VALIDATOR_INVALID > TERMINAL_AFTER_WARMUP > TASK_NOT_PRESERVED >
// [abort DUPLICATE_WORLD_HASH] > PRIOR_WORLD_EXCLUDED > [abort PACKET_HORIZON_MISMATCH] > NATIVE_MENU_INVALID (EMPTY_MENU |
// DUPLICATE_ACTION_ID) > ACCEPTED.
//
// Usage:
//   node exclusion-recount-v4.mjs validate    spent worlds only: must reproduce the registered connector's admission for all
//                                              9,456 spent worlds (parity evidence) -> evidence/execution-7c41ba89/recount-validation.json
//   node exclusion-recount-v4.mjs reconcile   only after A and B are LOCKED with no ABORT: regenerates the registered A and B
//                                              schedules pre-policy, reads ONLY LOCK.json, <pop>.admission.json and <pop>.ledger.json
//                                              (never rows), reconciles -> evidence/execution-7c41ba89/exclusion-recount.json
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createWorld, hashWorld, isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { sha256, stableStringify } from '../src/core/determinism.js';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { policyFacingViews } from './connector-v4.mjs';
import { validatePolicyFacingViews, INVALID_REASON } from './menu-validity-v1.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { loadV4, V4_REGISTRATION } from './campaign-v4.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);
const J = (p) => JSON.parse(readFileSync(p, 'utf8')), fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const RECOUNT_ID = 'STAGE3H_V4_OUTCOME_BLIND_EXCLUSION_RECOUNT_V1';
export const REASONS = Object.freeze(['VALIDATOR_INVALID', 'TERMINAL_AFTER_WARMUP', 'TASK_NOT_PRESERVED', 'PRIOR_WORLD_EXCLUDED', INVALID_REASON]);

/** Pre-policy admission of one scheduled world, mirroring the registered connector (no policy, no truth). */
export function prePolicyAdmission(combo, ctx) {
  const { seed, population, cell, ...axes } = combo;
  const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), config = warm.scenarioConfig;
  const initial = createWorld(seed, config), validation = validateScenarioV2(initial, config), world = warm.world;
  const id = sha256({ population, ...combo }), base = { id, population, cell, band: axes.horizonBand, seed };
  if (!validation.valid || isTerminal(world) || !warm.taskPreserved) return { ...base, status: 'REJECTED', reason: !validation.valid ? 'VALIDATOR_INVALID' : isTerminal(world) ? 'TERMINAL_AFTER_WARMUP' : 'TASK_NOT_PRESERVED', cause: null, worldHash: null };
  const before = hashWorld(world);
  if (ctx.seen.has(before)) return { ...base, status: 'ABORT', reason: 'DUPLICATE_WORLD_HASH', cause: null, worldHash: before };
  ctx.seen.add(before);
  if (ctx.prior?.has(before)) return { ...base, status: 'REJECTED', reason: 'PRIOR_WORLD_EXCLUDED', cause: null, worldHash: before };
  const view = observableView(world);
  if (bandOf(config.horizon + 1) !== axes.horizonBand) return { ...base, status: 'ABORT', reason: 'PACKET_HORIZON_MISMATCH', cause: null, worldHash: before };
  const verdict = validatePolicyFacingViews(policyFacingViews(world, view));
  if (!verdict.valid) return { ...base, status: 'REJECTED', reason: INVALID_REASON, cause: verdict.cause, worldHash: before };
  return { ...base, status: 'ACCEPTED', reason: null, cause: null, worldHash: before };
}

const tally = (recs) => {
  const by = (f) => { const o = {}; for (const r of recs) { const k = f(r); o[k] ??= { scheduled: 0, accepted: 0, rejected: 0, reasons: {} }; o[k].scheduled++; if (r.status === 'ACCEPTED') o[k].accepted++; else { o[k].rejected++; o[k].reasons[r.reason + (r.cause ? '/' + r.cause : '')] = (o[k].reasons[r.reason + (r.cause ? '/' + r.cause : '')] ?? 0) + 1; } } return o; };
  return { total: by(() => 'ALL').ALL, byPopulation: by((r) => r.population), byPopulationBand: by((r) => r.population + '|' + r.band), byCell: by((r) => r.population + '|' + r.cell) };
};

function validate() {
  // All 9,456 spent worlds, one fresh within-run set per world and no prior set: exactly the parity configuration.
  const PARTS = { OPEN: null, CONFIRM_A: 'stage3h1d-development', CONFIRM_B: 'stage3h1d-development', IN_DISTRIBUTION_CONTROL: 'stage3h1f-development', OOD_LEVEL: 'stage3h1f-development', OOD_ROLES: 'stage3h1f-development', OOD_OBJECTIVES: 'stage3h1f-development', OOD_SHAPES: 'stage3h1f-development' };
  const parts = {}, mismatches = []; let compared = 0;
  for (const [part, dir] of Object.entries(PARTS)) {
    let combos;
    if (!dir) combos = openCombos().map(({ panel, ...c }) => c);
    else { const r = J(resolve(GA, dir, 'results', part, 'rows.json')), s = J(resolve(GA, dir, 'results', part, 'summary.json')); combos = [...(Array.isArray(r) ? r : r.rows).map((y) => y.combo), ...s.rejections.map((y) => y.combo)].map(({ panel, ...c }) => c); }
    const parity = J(resolve(LANE, 'evidence/successor-v4/parity', part + '.json')).records;
    ok(parity.length === combos.length, 'PARITY_LENGTH:' + part);
    combos.forEach((c, i) => {
      const cell = [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), p = parity[i];
      ok(p.seed === c.seed && p.cell === cell, 'PARITY_ORDER:' + part);
      const r = prePolicyAdmission({ population: 'SPENT_' + part, cell, ...c }, { seen: new Set() });
      const expected = p.v4 === 'ROW' ? 'ACCEPTED' : p.v4.replace(/^REJECTED:/, 'REJECTED ');
      const got = r.status === 'ACCEPTED' ? 'ACCEPTED' : r.status + ' ' + r.reason + (r.cause ? '/' + r.cause : '');
      compared++; if (got !== expected || (p.v4 === 'ROW' && r.worldHash !== p.worldHash)) mismatches.push({ part, seed: c.seed, cell, expected, got });
    });
    parts[part] = combos.length;
  }
  // Prior-set behaviour: with the registered 9,407-hash exclusion set every spent world that reaches it is PRIOR_WORLD_EXCLUDED.
  const prior = new Set(J(resolve(LANE, 'evidence/prior-world-exclusions.json')).priorWorldHashes), sample = openCombos().map(({ panel, ...c }) => c);
  const priorCheck = sample.map((c) => prePolicyAdmission({ population: 'SPENT_OPEN', cell: [c.shape, c.roles, c.objectives, c.horizonBand, c.level].join('/'), ...c }, { seen: new Set(), prior }));
  return { compared, parts, mismatches, priorSetCheck: { worlds: priorCheck.length, priorWorldExcluded: priorCheck.filter((r) => r.reason === 'PRIOR_WORLD_EXCLUDED').length },
    verdict: mismatches.length === 0 && compared === 9456 && priorCheck.every((r) => r.reason === 'PRIOR_WORLD_EXCLUDED') ? 'RECOUNT_REPRODUCES_REGISTERED_ADMISSION' : 'RECOUNT_CONTRACT_BLOCKED' };
}

function reconcile() {
  const reg = loadV4(V4_REGISTRATION), base = resolve(LANE, 'runs', reg.registrationHash.slice(0, 16));
  const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json')), prior = new Set(J(resolve(GA, reg.bindings.priorExclusions.file)).priorWorldHashes);
  ok(fileSha(resolve(GA, reg.bindings.priorExclusions.file)) === reg.bindings.priorExclusions.sha256, 'PRIOR_EXCLUSIONS_CHANGED');
  const out = { replications: {} };
  for (const rep of ['A', 'B']) {
    const dir = resolve(base, rep), lockPath = resolve(dir, 'LOCK.json');
    ok(existsSync(lockPath) && !existsSync(resolve(dir, 'ABORT.json')), 'REPLICATION_NOT_LOCKED_OR_ABORTED:' + rep);
    const lock = J(lockPath); ok(lock.registrationHash === reg.registrationHash && lock.replication === rep, 'LOCK_IDENTITY:' + rep);
    const plan = schedule(contract.populations, reg.namespaces[rep]); ok(scheduleHash(plan) === reg.scheduleHashes[rep], 'SCHEDULE_MISMATCH:' + rep);
    const ctx = { seen: new Set(), prior }, recs = plan.map((c) => prePolicyAdmission(c, ctx)), pops = {}, failures = [];
    for (const [pop, f] of Object.entries(lock.files)) {
      // Lock hashes verified for all three files; rows are hashed as bytes only, never parsed.
      const files = Object.fromEntries(['rows', 'ledger', 'admission'].map((k) => [k, resolve(dir, pop + '.' + k + '.json')]));
      const hashesOk = Object.entries(files).every(([k, p]) => fileSha(p) === f[k]);
      const admission = J(files.admission), ledger = J(files.ledger), mine = recs.filter((r) => r.population === pop);
      const acceptedIds = new Set(mine.filter((r) => r.status === 'ACCEPTED').map((r) => r.id)), ledgerIds = new Set(ledger.map((x) => x.id));
      const ledgerById = new Map(ledger.map((x) => [x.id, x])), identityMismatch = [...acceptedIds].filter((id) => !ledgerIds.has(id)).length + [...ledgerIds].filter((id) => !acceptedIds.has(id)).length;
      const hashMismatch = mine.filter((r) => r.status === 'ACCEPTED' && ledgerById.has(r.id) && (ledgerById.get(r.id).worldHash !== r.worldHash || ledgerById.get(r.id).seed !== r.seed || ledgerById.get(r.id).cell !== r.cell)).length;
      const cellMismatch = Object.entries(admission.cells).filter(([cell, c]) => { const x = mine.filter((r) => r.cell === cell); return x.length !== c.scheduled || x.filter((r) => r.status === 'ACCEPTED').length !== c.accepted || x.filter((r) => r.status !== 'ACCEPTED').length !== c.rejected; }).map(([cell]) => cell);
      const pass = hashesOk && identityMismatch === 0 && hashMismatch === 0 && cellMismatch.length === 0 && mine.length === f.scheduled && acceptedIds.size === f.accepted && admission.accepted === f.accepted && mine.every((r) => r.status !== 'ABORT');
      if (!pass) failures.push(pop);
      pops[pop] = { scheduled: mine.length, lockedAccepted: f.accepted, recountAccepted: acceptedIds.size, lockedRejected: f.scheduled - f.accepted, recountRejected: mine.filter((r) => r.status === 'REJECTED').length,
        lockHashesVerified: hashesOk, worldLevelAcceptedIdentityMismatches: identityMismatch, worldHashSeedCellMismatches: hashMismatch, cellCountMismatches: cellMismatch, admissionPassLocked: f.admissionPass, pass };
    }
    out.replications[rep] = { lockSha256: fileSha(lockPath), scheduled: recs.length, aborts: recs.filter((r) => r.status === 'ABORT').length, populations: pops, failures, ...tally(recs),
      nativeMenuInvalid: recs.filter((r) => r.reason === INVALID_REASON).map((r) => ({ population: r.population, cell: r.cell, band: r.band, cause: r.cause })), pass: failures.length === 0 && recs.every((r) => r.status !== 'ABORT') };
  }
  out.reconciliation = Object.values(out.replications).every((r) => r.pass) ? 'RECONCILED_EXACT' : 'RECONCILIATION_FAILURE';
  out.limitations = ['the registered runner records no rejection reason: reasons are reconciled per cell in aggregate only (rejected count per cell = locked count), not world by world',
    'accepted worlds are reconciled world by world (id, seed, cell and world hash against the locked ledger); rejected worlds are identified as the scheduled complement of the accepted set'];
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'exclusion-recount-v4.mjs')) {
  const mode = process.argv[2]; ok(['validate', 'reconcile'].includes(mode), 'USAGE: exclusion-recount-v4.mjs validate|reconcile');
  assertSoleWriter(); const inh = verifyOwnerLane();
  const dir = resolve(LANE, 'evidence/execution-7c41ba89'); if (!existsSync(dir)) mkdirSync(dir);
  const file = resolve(dir, mode === 'validate' ? 'recount-validation.json' : 'exclusion-recount.json'); ok(!existsSync(file), 'ALREADY_WRITTEN');
  const t0 = Date.now(), result = mode === 'validate' ? validate() : reconcile();
  writeExclusive(file, { schema: RECOUNT_ID + '_' + mode.toUpperCase(), recountScriptSha256: fileSha(resolve(LANE, 'exclusion-recount-v4.mjs')), inheritanceHead: inh.head, ...result, wallMs: Date.now() - t0, policiesInvoked: 0, truthComputed: false, outcomeFilesRead: false, authority: 'R0' });
  console.log(JSON.stringify(mode === 'validate' ? { verdict: result.verdict, compared: result.compared, mismatches: result.mismatches.length, priorSetCheck: result.priorSetCheck } : { reconciliation: result.reconciliation, A: result.replications.A?.total, B: result.replications.B?.total }, null, 1));
}
