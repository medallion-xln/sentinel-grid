import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPEC, primarySpecs, groupCells, estimate, bootstrap, superiority, equalityCheck, zeroIntroductionUpper } from './analysis.mjs';
import { selectSets, scoreSet, potentialIntroduction, syntheticRecord, admissionReport, auditSyntheticNuisance, assertIndependentCustody, campaignEntryPoint } from './runner-design.mjs';
import { score as frozenScore } from '../stage3h-canonical-v1/metrics.mjs';
import { orientCell, ORIENTATIONS, INVERSE_ORIENTATION } from '../src/forge-symmetric/orientation-symmetric-v1.js';

const source = readFileSync(new URL('../stage3h1d-development/confirm-core.mjs', import.meta.url), 'utf8');
assert(source.includes("H0: 'NEXUS_ELSE_S0', H2: 'S0'"));
assert(source.includes('sel.NEXUS_ELSE_S0 = sel.NEXUS_V1 ?? sel.S0;'));
assert(source.includes('sel.HORIZON_ROUTED = sel[RULE[band]];'));

let tests = 0;
function check(name, fn) { fn(); tests++; }
function fixture(id, band, benefit = 3) {
  return { synthetic: true, id, cell: band, band, regime: 'OBSERVED_THREAT', admitted: true, elapsedMs: 1,
    publicEnvelope: { menu: ['b', 'n', 'lo', 'hi'], observation: { synthetic: true } }, B: ['b'], nexus: ['n'],
    releaseSyntheticTruth: ({ events }) => { assert.equal(events.at(-1), 'ALL_DECISIONS_LOCKED'); return [{ id: 'b', utility: band === 'H0' ? 100 - benefit : 100 }, { id: 'n', utility: band === 'H0' ? 100 : 100 - benefit }, { id: 'lo', utility: 0 }, { id: 'hi', utility: 100 }]; },
  };
}
check('source rule equalities and fallback for arbitrary handles', () => {
  for (const B of [['a'], ['a', 'b']]) for (const N of [['c'], null]) {
    const h0 = selectSets('H0', B, N), h2 = selectSets('H2', B, N);
    assert.deepEqual(h0.R, h0.N); assert.deepEqual(h2.R, h2.B);
  }
  assert.throws(() => selectSets('H1', ['a'], null));
});
const rows = [syntheticRecord(fixture('s0', 'H0')), syntheticRecord(fixture('s1', 'H2'))];
check('identity controls exact in selections and metrics', () => {
  assert.equal(equalityCheck(rows, 'H0', 'R', 'N').status, 'EXACT_IDENTITY_PASS');
  assert.equal(equalityCheck(rows, 'H2', 'R', 'B').status, 'EXACT_IDENTITY_PASS');
  assert.equal(equalityCheck([], 'H2', 'R', 'B').status, 'UNMEASURED');
});
check('local material benefit does not imply full-population materiality', () => {
  const out = bootstrap(groupCells(rows), primarySpecs(), { resamples: 1000, label: 'SYNTHETIC_ONLY' });
  assert(Math.abs(out.A_H0_SPECIALIST.mean + 0.03) < 1e-12);
  assert(Math.abs(out.C_FULL_VS_B.mean + 0.015) < 1e-12);
  assert(superiority(out.A_H0_SPECIALIST)); assert(superiority(out.B_H2_AVOIDANCE));
  assert(!superiority(out.C_FULL_VS_B)); assert(!superiority(out.D_FULL_VS_N));
  assert.equal(out.A_H0_SPECIALIST.approximateCenteredLowerP, 1 / 1001);
});
check('all four primary criteria are logically feasible', () => {
  const large = [syntheticRecord(fixture('t0', 'H0', 5)), syntheticRecord(fixture('t1', 'H2', 5))];
  assert(Object.values(bootstrap(groupCells(large), primarySpecs(), { resamples: 1000, label: 'SYNTHETIC_ONLY' })).every(superiority));
});
check('conditional subgroup ratio retains source-cell prevalence', () => {
  const row = (cell, regime, b) => ({ cell, regime, metrics: { R: { nreg: 0 }, B: { nreg: b }, N: { nreg: 0 } } });
  const cells = groupCells([row('c1', 'T', 0.8), row('c1', 'X', 0), row('c1', 'X', 0), row('c2', 'T', 0.2)]);
  assert(Math.abs(estimate(cells, { metric: 'RB', regime: 'T' }).mean + 0.35) < 1e-12);
});
check('undefined subgroup draws are not silently discarded', () => {
  const a = { cell: 'x', regime: 'T', metrics: rows[0].metrics }, b = { cell: 'x', regime: 'X', metrics: rows[0].metrics };
  const out = bootstrap([[a, b]], [{ key: 'T', metric: 'RB', regime: 'T' }], { resamples: 1000, label: 'SYNTHETIC_ONLY' });
  assert.equal(out.T.inference, 'UNAVAILABLE_UNDEFINED_SUBGROUP_DRAW');
});
check('uniform tied sets agree with frozen scoring', () => {
  const truth = [{ id: 'a', utility: 100 }, { id: 'b', utility: 0 }];
  const got = scoreSet(['a', 'b'], truth);
  const frozen = frozenScore(['a', 'b'], { utilitySpread: 100, branches: [{ actionKey: 'a', regret: 0 }, { actionKey: 'b', regret: 100 }] });
  assert.equal(got.nreg, frozen.normalizedRegret); assert.equal(got.hit, frozen.hit); assert.equal(got.cat, frozen.catastrophic);
  assert.equal(got.nreg, 0.5);
});
check('worst-coupling support veto and equality exception', () => {
  const t = [{ id: 'a', utility: 100 }, { id: 'b', utility: 0 }];
  assert(potentialIntroduction(['b'], ['a'], t));
  assert(!potentialIntroduction(['a', 'b'], ['a', 'b'], t));
  assert(zeroIntroductionUpper([52, 50]) > 0);
});
check('public inputs, legal menus and truth timing', () => {
  const r = rows[0]; assert.equal(r.publicEnvelopeHashByArm.R, r.publicEnvelopeHashByArm.B);
  assert.equal(r.computeAccounting.simulatorCallsByPublicArms, 0);
  assert.throws(() => syntheticRecord({ ...fixture('illegal', 'H0'), B: ['missing'] }), /ILLEGAL/);
  assert.throws(() => syntheticRecord({ ...fixture('timeout', 'H0'), elapsedMs: 1001 }), /TIMEOUT/);
  assert.throws(() => syntheticRecord({ ...fixture('native', 'H0'), world: {} }), /SYNTHETIC_FIXTURE_ONLY/);
});
check('rejection accounting and independent-unit deduplication', () => {
  const reject = syntheticRecord({ synthetic: true, id: 'reject', cell: 'H0', band: 'H0', admitted: false, reason: 'SYNTHETIC_VALIDATOR_REJECT' });
  const report = admissionReport([rows[0], reject, rows[1]], { H0: 2, H2: 1 });
  assert.equal(report.rejected, 1); assert(!report.replacementAllowed); assert(!report.populationAdmissionPass);
  assert.throws(() => admissionReport([rows[0], rows[0]], { H0: 2 }), /DUPLICATE/);
});
check('candidate-order and identity nuisance maps preserve the original unit', () => {
  const f = fixture('s0', 'H0'); f.publicEnvelope.menu.reverse();
  assert.equal(auditSyntheticNuisance(rows[0], syntheticRecord(f), { b: 'b', n: 'n', lo: 'lo', hi: 'hi' }).dependenceRB, 0);
  const renamed = fixture('s0', 'H0'), map = { b: 'z_b', n: 'z_n', lo: 'z_lo', hi: 'z_hi' };
  renamed.publicEnvelope.menu = renamed.publicEnvelope.menu.map(x => map[x]); renamed.B = ['z_b']; renamed.nexus = ['z_n'];
  const originalRelease = renamed.releaseSyntheticTruth;
  renamed.releaseSyntheticTruth = args => originalRelease(args).map(b => ({ ...b, id: map[b.id] }));
  assert.equal(auditSyntheticNuisance(rows[0], syntheticRecord(renamed), map).countsAsIndependentWorld, false);
});
check('synthetic D4 coordinates retain utility/action bijections', () => {
  for (const orientation of ORIENTATIONS) for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
    const p = { x, y };
    assert.deepEqual(orientCell(INVERSE_ORIENTATION[orientation], orientCell(orientation, p, 5), 5), p);
  } // Frozen coordinate arithmetic only; no orientWorld or world construction.
});
check('custody and execution stay fail-closed', () => {
  const c = { evaluatorIdentity: 'independent-e', custodianIdentity: 'independent-c', reviewerIdentity: 'independent-r', designerIdentity: 'author', conflictDeclarationsSigned: true, ALocked: true, BLocked: true, designerReadBeforeLock: false };
  assert(assertIndependentCustody(c)); assert.throws(() => assertIndependentCustody({ ...c, BLocked: false }));
  assert.throws(() => assertIndependentCustody({ ...c, reviewerIdentity: 'author' }));
  assert.throws(campaignEntryPoint, /NO_NATIVE_RUNNER_OR_ACTIVE_REGISTRATION/);
});
check('families exclude equality controls and use the correct sizes', () => {
  assert.equal(SPEC.primaryFamily, 4 * 5 * 2); assert.equal(SPEC.secondaryFamily, 2 * 2 * 5 * 2);
  assert.equal(SPEC.nuisanceFamily, SPEC.primaryFamily * 3);
  assert(!primarySpecs().some(s => s.metric === 'RN' && s.band === 'H0'));
  assert(!primarySpecs().some(s => s.metric === 'RB' && s.band === 'H2'));
});
console.log(JSON.stringify({ check: 'PASS', tests, kind: 'SOURCE_INSPECTION_AND_SYNTHETIC_ARITHMETIC_ONLY', nativeWorldsInstantiated: 0, campaignPacketsBuilt: 0, sealedDataAccessed: false, performanceEstablished: false, independentMethodReview: 'REVIEW_PENDING' }));
