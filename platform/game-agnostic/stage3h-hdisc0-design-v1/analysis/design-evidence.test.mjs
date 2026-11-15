// H-DISC-0 design-evidence tests. Run: node --test analysis/*.test.mjs
// Tracked evidence only; runs from a clean checkout. Nothing here trains, tunes or evaluates a policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyse, PLAN, pairedPower, criticalB, discordance, smallestN } from './design-evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), STORED = readFileSync(resolve(HERE, '../evidence/HDISC0_DESIGN_EVIDENCE.json'), 'utf8'), D = JSON.parse(STORED);

test('the analysis is a pure function of tracked evidence and reproduces the stored record byte for byte', () => {
  const res = analyse(); assert.deepEqual(res.issues, []); assert.equal(JSON.stringify(res.out, null, 1) + '\n', STORED);
  assert.ok(D.labels.includes('NO_TRAINING') && D.labels.includes('NOT_AN_H_DISC_PERFORMANCE_RESULT') && D.labels.includes('PLANNING_ASSUMPTIONS_NOT_RESULTS'));
  assert.equal(D.source.modelHash, 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b');
});

test('the recorded attribution is re-derived exactly', () => {
  const a = D.attribution;
  assert.deepEqual([a.validationForcedChoiceFailures, a.validationWithinMenuOrdering, a.validationRankingContract, a.validationNoSafeAlternative], [39, 34, 5, 0]);
  assert.deepEqual([a.uniqueAcceptedValidationFailures, a.acceptedValidationFailuresThatAreOrderingErrors], [2, 2]); assert.deepEqual([a.explorationOutOfBagFailures, a.explorationOutOfBagOrdering, a.explorationOutOfBagRankingContract], [55, 48, 7]);
  assert.equal(a.validationClassesWithAnEvaluatorSafeLegalAction, 600); assert.equal(a.validationClasses, 600); assert.equal(a.explorationClassesWithAnEvaluatorSafeLegalAction, 1000);
});

test('identifiability is not asserted in either direction, and the indistinguishable explanations are recorded as such', () => {
  const e = D.explanations; assert.equal(e.A_incorrectRiskDifferencesBetweenLegalActions.status, 'SUPPORTED'); assert.match(e.B_sharedModellingBiasAmongBags.status, /CAUSE_NOT_IDENTIFIED/);
  assert.match(e.C_publicObservationEquivalenceHidingSafetyRelevantDifferences.status, /NOT_ESTABLISHED_FOR_CHOOSING_A_ROBUSTLY_SAFE_ACTION/); assert.match(e.distinguishability.B_from_C, /^NOT_DISTINGUISHABLE_FROM_EXISTING_EVIDENCE/);
  const banned = /^(publiclyIdentifiable|safeActionIdentifiable|learnable|proposedThreshold|recommendedThreshold|selectedThreshold|operatingPoint|hdiscPerformance)$/i;
  const scan = (v) => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { assert.ok(!banned.test(k), k); scan(x); } }; scan(D);
});

test('pairwise baselines are internally consistent', () => {
  for (const pop of Object.values(D.pairBaseline.introductionLabel)) { assert.equal(pop.pooled.pairs, pop.sameActionType.pairs + pop.differentActionType.pairs);
    const w = (pop.sameActionType.correctlyOrdered * pop.sameActionType.pairs + pop.differentActionType.correctlyOrdered * pop.differentActionType.pairs) / pop.pooled.pairs; assert.ok(Math.abs(w - pop.pooled.correctlyOrdered) < 2e-4);
    assert.ok(pop.menusWithEveryPairCorrect <= pop.menusWithASafeAndAnUnsafeAction && pop.pooled.correctlyOrdered > 0.5 && pop.pooled.correctlyOrdered < 1); }
  assert.equal(D.topChoice.historicalValidation.topChoiceUnsafe, 39); assert.equal(D.topChoice.historicalValidation.topChoiceCatastrophic, 52);
});

test('the exact sign-test critical value and the paired power function are correct', () => {
  // critical value: smallest b with P(B >= b | D, 1/2) <= alpha
  const tail = (b, n) => { let s = 0; for (let k = b; k <= n; k++) { let c = 1; for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1); s += c / 2 ** n; } return s; };
  for (const n of [1, 4, 5, 10, 17, 30]) { const c = criticalB(n, 0.05); if (c <= n) assert.ok(tail(c, n) <= 0.05); assert.ok(c === 0 || tail(c - 1, n) > 0.05, `n=${n}`); }
  assert.equal(criticalB(4, 0.05), 5); assert.equal(criticalB(5, 0.05), 5); // four discordant pairs can never reject; five must all favour the candidate
  // brute force over the trinomial for a small N
  const N = 14, pb = 0.3, pc = 0.1, f = (n) => (n <= 1 ? 1 : n * f(n - 1)); let brute = 0;
  for (let b = 0; b <= N; b++) for (let c = 0; c + b <= N; c++) { const p = (f(N) / (f(b) * f(c) * f(N - b - c))) * pb ** b * pc ** c * (1 - pb - pc) ** (N - b - c); if (b + c > 0 && b >= criticalB(b + c, 0.05)) brute += p; }
  assert.ok(Math.abs(pairedPower(N, pb, pc) - brute) < 1e-10);
  // size: with no true difference the rejection rate does not exceed alpha; power grows with N and with the effect
  for (const n of [50, 200, 600]) assert.ok(pairedPower(n, 0.05, 0.05) <= 0.05 + 1e-12);
  assert.ok(pairedPower(400, 0.06, 0.03) < pairedPower(800, 0.06, 0.03)); assert.ok(pairedPower(600, 0.06, 0.03) < pairedPower(600, 0.06, 0.01)); assert.equal(pairedPower(600, 0, 0), 0);
});

test('discordance models respect the marginals and their ordering', () => {
  const p0 = 0.065, p1 = 0.0325; for (const [m, phi] of [['INDEPENDENT', 0], ['EMPIRICAL_ASSOCIATION', 0.32], ['NESTED', 0]]) { const d = discordance(p0, p1, m, phi); assert.ok(Math.abs(d.pb + d.both - p0) < 1e-12 && Math.abs(d.pc + d.both - p1) < 1e-12 && d.pb >= 0 && d.pc >= -1e-15); }
  assert.equal(discordance(p0, p1, 'NESTED').pc, 0); assert.ok(Math.abs(discordance(p0, p1, 'INDEPENDENT').both - p0 * p1) < 1e-15);
  const pw = (m, phi) => { const d = discordance(p0, p1, m, phi); return pairedPower(540, d.pb, d.pc); }; assert.ok(pw('INDEPENDENT', 0) < pw('EMPIRICAL_ASSOCIATION', 0.32) && pw('EMPIRICAL_ASSOCIATION', 0.32) < pw('NESTED', 0));
  const n = smallestN(p0, p1, 'INDEPENDENT', 0), d = discordance(p0, p1, 'INDEPENDENT', 0); assert.ok(pairedPower(n, d.pb, d.pc) >= 0.8 && pairedPower(n - 1, d.pb, d.pc) < 0.8);
});

test('the 600-class assumption is examined, not assumed; the recommendation follows its stated rule', () => {
  const h = D.power.theHalvingClaimExamined, r = D.power.recommendedPlan;
  assert.ok(h.atPlanningDesignEffect.exactPowerIndependent < 0.8); assert.match(h.verdict, /^NOT_SUPPORTED_UNDER_CONSERVATIVE_ASSUMPTIONS/); assert.equal(D.planningInputs.clustering.planningDesignEffect, 1.5);
  assert.equal(r.status, 'PLANNING_RECOMMENDATION_NOT_AN_ALLOCATION'); assert.equal(r.recommendedValidationClasses, Math.ceil((r.effectiveClassesNeeded * 1.5) / 50) * 50); assert.ok(r.powerAtRecommended.halving_independent >= 0.8); assert.equal(r.totalClasses.holdout, 0);
  assert.deepEqual({ ...PLAN }, { explorationClasses: 1000, validationClasses: 600, holdoutClasses: 0, alpha: 0.05, power: 0.8, status: 'PLANNING_VALUES_NOT_AN_ALLOCATION' });
});

test('relative improvement is kept apart from the zero-introduction requirement', () => {
  const z = D.power.relativeImprovementIsNotQualification.probabilityOfZeroIntroductionsIn600;
  assert.ok(z['0.0325'] < 1e-6 && z['0.065'] < 1e-12); assert.ok(Math.abs(z['0.001'] - Math.pow(0.999, 600)) < 1e-6); assert.ok(D.power.relativeImprovementIsNotQualification.rateNeededForEvenOddsOfZero < 0.0013);
});
