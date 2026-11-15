// Successor preparation, Phase 7: full preflight of candidate REGISTRATION_CANDIDATE_V4 (development-only; no registered
// world, no allocation, no activation, no authorization). Re-verifies every required item from the bound evidence and the
// live tree, reads the clean-clone record, and writes evidence/successor-v4-preflight/preflight.json once.
// Must be launched as plain `node successor-preflight-v4.mjs` (runtime identity check).
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { importClosure } from './register-candidate-v3.mjs';
import { PREFLIGHT } from './campaign-v4.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const hashOf = (r) => { const { registrationHash: _h, ...b } = r; return sha256(stableStringify(b)); };
assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/successor-v4-preflight/preflight.json');
const cand = J('registration/REGISTRATION_CANDIDATE_V4.json'), pred = J('registration/ACTIVE_REGISTRATION_V3.json');
assertRuntimeIdentity(cand.bindings.runtime);
const scan = J('evidence/successor-v4/menu-scan.json'), records = J('evidence/successor-v4/menu-scan-records.json'), replay = J('evidence/successor-v4/menu-scan-replay.json');
const fixtures = J('evidence/successor-v4/fixtures.json'), stats = J('evidence/successor-v4/statistical-validity-v2.json');
const parts = Object.keys(cand.successorEvidence.connectorParity), parity = parts.map((p) => J('evidence/successor-v4/parity/' + p + '.json'));
const tap = readFileSync(resolve(LANE, 'evidence/successor-v4-preflight/tests-v4.tap'), 'utf8'), tapN = (k) => Number((tap.match(new RegExp('^# ' + k + ' (\\d+)', 'm')) ?? [])[1]);
const clone = J('evidence/successor-v4-preflight/clean-clone-verification.json');
const fx = Object.fromEntries(fixtures.results.map((r) => [r.id, r.pass]));
const sum = (f) => parity.reduce((n, p) => n + f(p), 0);
const boundMismatch = Object.entries(cand.bindings.sources).filter(([p, h]) => fsha(p) !== h).map(([p]) => p);
const entries = ['campaign-v4.mjs', 'allocate-namespaces-v4.mjs', 'tests-v4.mjs', 'clone-verify-v4.mjs', 'register-candidate-v4.mjs'];
const unboundImports = [...new Set(entries.flatMap((e) => importClosure(resolve(LANE, e))))].filter((f) => f.startsWith(GA)).map((f) => f.slice(GA.length + 1)).filter((f) => !Object.hasOwn(cand.bindings.sources, f));
const c4 = readFileSync(resolve(LANE, 'campaign-v4.mjs'), 'utf8'), runBody = c4.slice(c4.indexOf('export function runReplicationV4'));

// Recalculated admission on spent worlds under V4 (descriptive; floors unchanged).
const admission = {};
for (const pop of [...new Set(records.records.map((r) => r.trackAPopulation))].sort()) {
  const rs = records.records.filter((r) => r.trackAPopulation === pop), acc = (x) => x.filter((r) => !r.preRejection && r.verdict === 'VALID').length, cells = {};
  for (const r of rs) { cells[r.cell] ??= { n: 0, a: 0 }; cells[r.cell].n++; if (!r.preRejection && r.verdict === 'VALID') cells[r.cell].a++; }
  admission[pop] = { scanned: rs.length, acceptedV4: acc(rs), acceptedV3Equivalent: rs.filter((r) => !r.preRejection).length, rateV4: acc(rs) / rs.length,
    byBand: Object.fromEntries(['H0', 'H2'].map((b) => { const x = rs.filter((r) => r.band === b); return [b, acc(x) / x.length]; })), minAcceptedPerCell: Math.min(...Object.values(cells).map((c) => c.a)), floorsMet: acc(rs) / rs.length >= 0.9 };
}

const checks = {
  candidateIdentity: hashOf(cand) === cand.registrationHash && cand.status === 'REGISTRATION_PENDING_OWNER_APPROVAL' && cand.ownerApproval === null && cand.ownerApprovalRequired === true,
  predecessorUnchanged: hashOf(pred) === pred.registrationHash && pred.registrationHash === cand.predecessor.registrationHash && Object.entries(pred.bindings.sources).every(([p, h]) => fsha(p) === h) && !existsSync(resolve(LANE, 'runs', pred.registrationHash.slice(0, 16), 'B')),
  allSpentWorldsScanned: scan.worlds === 9456 && records.records.length === 9456 && sha256(stableStringify(records.records)) === scan.recordsSha256,
  fixturesPass: fixtures.verdict === 'ALL_FIXTURES_PASS' && fixtures.requiredCategoriesCovered && tapN('fail') === 0 && tapN('pass') === tapN('tests') && tapN('tests') >= fixtures.total + 6,
  identityComparisons: scan.total.allInvariant && Object.values(scan.byTrackAPopulation).every((p) => p.allInvariant),
  dynamicValidation: fx.F2_DUPLICATE_ID_NATIVE_WITNESS && fx.F7_MULTI_DECISION && fx.F8_MALFORMED_AFTER_VALID_OBSERVATION && fx.F9_TWIN_ONLY_MALFORMATION,
  replayDeterminism: replay.recordsSha256 === scan.recordsSha256 && /^\d+\/\d+$/.test(clone.result.spentScanSpotReplay) && clone.result.spentScanSpotReplay.split('/')[0] === clone.result.spentScanSpotReplay.split('/')[1],
  unchangedAcceptedOutcomes: parity.every((p) => p.verdict === 'PARITY_EXACT') && sum((p) => p.worlds) === 9456 && sum((p) => p.accepted) === sum((p) => p.acceptedEqual) && sum((p) => p.accepted) === scan.total.reachedMenuRule - scan.total.invalid && sum((p) => p.relations.V3_MENU_ABORT ?? 0) === scan.total.invalid && sum((p) => p.identityFailures.length) === 0,
  recalculatedOodAdmission: Object.values(admission).every((a) => a.floorsMet && Object.values(a.byBand).every((r) => r >= 0.9) && a.minAcceptedPerCell >= 2),
  catastropheVetoUnchanged: stats.inferenceMachineryUnchanged && stats.admissionFeasibility.predecessorReproducedExactly && stats.admissionFeasibility.withMenuNotReduced && stats.thresholds.catastropheBound.includes('unchanged'),
  completeSourceHashes: boundMismatch.length === 0 && unboundImports.length === 0,
  cleanClone: clone.result.verdict === 'CLEAN_CLONE_REPRODUCIBLE' && clone.result.candidateHash === cand.registrationHash && clone.result.boundSourceMismatches.length === 0,
  operationalPreflightUnchanged: PREFLIGHT.maxLoadFractionOfCores === 0.25 && PREFLIGHT.devLocks === 96 && PREFLIGHT.lockP99MaxMs === 250 && PREFLIGHT.lockMaxMs === 500 && runBody.indexOf('const pre = preflight(preflightLimits)') < runBody.indexOf('mkdirSync(out'),
  decisionTimeLimitUnchanged: fsha('stage3h-owner-governed-v1/connector.mjs') === pred.bindings.sources['stage3h-owner-governed-v1/connector.mjs'] && readFileSync(resolve(LANE, 'connector.mjs'), 'utf8').includes('elapsedMs <= 1000'),
  nothingRegisteredAllocatedOrAuthorized: cand.namespaces === null && cand.namespaceAllocation.status === 'NOT_ALLOCATED' && ['registration/NAMESPACE_ALLOCATION_V4.json', 'registration/ACTIVE_REGISTRATION_V4.json', 'registration/EXECUTION_AUTHORIZATION_V4.json'].every((p) => !existsSync(resolve(LANE, p))) && !existsSync(resolve(LANE, 'runs', cand.registrationHash.slice(0, 16))),
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
writeExclusive(OUT, { schema: 'STAGE3H_SUCCESSOR_PREFLIGHT_V1', candidateHash: cand.registrationHash, inheritanceHead: inh.head, boundSources: Object.keys(cand.bindings.sources).length, checks, failed,
  admission, parity: { worlds: sum((p) => p.worlds), accepted: sum((p) => p.accepted), acceptedEqual: sum((p) => p.acceptedEqual), retriedPairs: sum((p) => p.retriedPairs), timingFailuresAfterRetry: sum((p) => p.timingFailuresAfterRetry) },
  tests: { tests: tapN('tests'), pass: tapN('pass'), fail: tapN('fail') }, cleanClone: clone.result, unboundImports, boundMismatch,
  verdict: failed.length === 0 ? 'SUCCESSOR_PREFLIGHT_PASS' : 'SUCCESSOR_PREFLIGHT_FAIL', registeredWorldsGenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ verdict: failed.length === 0 ? 'SUCCESSOR_PREFLIGHT_PASS' : 'SUCCESSOR_PREFLIGHT_FAIL', failed, checks, admission }, null, 1));
