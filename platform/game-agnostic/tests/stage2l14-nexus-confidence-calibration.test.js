/* Stage 2L.14 — Nexus confidence calibration and safe selective delegation.
 *
 * These tests defend the things that would let a confidence stage manufacture a
 * pass: a lowered floor, a leaked split, an optimistic default, a bucket that
 * delegates on evidence the expert itself disclaims.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE2L14_STAGE,
  STAGE2L14_RELIABILITY_FLOOR,
  STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L14_BOUND_METHOD,
  STAGE2L14_BOUND_Z,
  STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
  STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_RATE,
  STAGE2L14_RISK_LADDER,
  STAGE2L14_MARGIN_LADDER,
  STAGE2L14_SPLITS,
  STAGE2L14_SIGNAL_INVENTORY,
  STAGE2L14_CONFIDENCE_BUCKETS,
  STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS,
  STAGE2L14_ADVERSARIAL_CONFIDENCE_CASES,
  STAGE2L14_MINIMUM_ROBUSTNESS_SCORE,
  wilsonLowerBound,
  stage2L14ConfidenceBucket,
  bucketStructurallyEligible,
  buildStage2L14Split,
  runStage2L14Split,
  deriveStage2L14Calibration,
  evaluateStage2L14Delegation,
  runStage2L14AdversarialSuite,
  buildStage2L14Evaluation,
  buildStage2L14PortabilityDigest,
  certifyStage2L14,
} from '../src/lab/stage2l14-nexus-confidence-calibration.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l14-nexus-confidence-calibration-and-safe-delegation');

/* The whole stage runs in tens of seconds. Build it once and share it. */
const evaluation = buildStage2L14Evaluation();
const certification = certifyStage2L14({ evaluation });

/* --------------------------------------------------------------------------
 * Inherited thresholds. These are the constants a failing stage would be
 * tempted to move.
 * ------------------------------------------------------------------------ */

test('the inherited reliability floor is exactly 0.99', () => {
  assert.equal(STAGE2L14_RELIABILITY_FLOOR, 0.99);
  assert.equal(certification.predeclared.reliabilityFloor, 0.99);
  assert.equal(certification.freeze.reliabilityFloorLowered, false);
});

test('inherited harm ceilings are not loosened', () => {
  assert.equal(STAGE2L14_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
  assert.equal(certification.freeze.harmCeilingUnchanged, true);
  assert.equal(certification.freeze.correctPrimeBreakCeilingUnchanged, true);
});

test('the module source declares the floor exactly once and never below 0.99', () => {
  const source = readFileSync(path.join(root, 'src/lab/stage2l14-nexus-confidence-calibration.js'), 'utf8');
  const declarations = [...source.matchAll(/STAGE2L14_RELIABILITY_FLOOR\s*=\s*([0-9.]+)/g)].map((m) => Number(m[1]));
  assert.equal(declarations.length, 1);
  assert.equal(declarations[0], 0.99);
});

test('the conservative bound is a support guard, strictly weaker than the floor', () => {
  assert.equal(STAGE2L14_BOUND_METHOD, 'WILSON_SCORE_LOWER_BOUND');
  assert.ok(STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT < STAGE2L14_RELIABILITY_FLOOR);
  assert.ok(STAGE2L14_BOUND_Z > 0);
});

test('support thresholds are predeclared and non-trivial', () => {
  assert.ok(STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT >= 100);
  assert.ok(STAGE2L14_MINIMUM_DELEGATION_COUNT >= 50);
  assert.ok(STAGE2L14_MINIMUM_DELEGATION_RATE > 0);
});

/* --------------------------------------------------------------------------
 * Wilson bound.
 * ------------------------------------------------------------------------ */

test('the Wilson lower bound is zero on no evidence', () => {
  assert.equal(wilsonLowerBound(0, 0), 0);
});

test('the Wilson lower bound punishes small perfect samples', () => {
  const tiny = wilsonLowerBound(5, 5);
  const large = wilsonLowerBound(500, 500);
  assert.ok(tiny < large, `${tiny} should be below ${large}`);
  assert.ok(tiny < 1);
});

test('the Wilson lower bound never exceeds the observed rate', () => {
  for (const [k, n] of [[1, 2], [9, 10], [90, 100], [990, 1000]]) {
    assert.ok(wilsonLowerBound(k, n) <= k / n);
  }
});

/* Shared fixture: a synthetic signal block in which the expert declares its
 * reasoning fully supported. Overrides below spoil exactly one precondition at
 * a time. */
const PARAMS = { minRiskAdjustment: 500000, minUtilityMargin: 200000 };
const clean = (overrides = {}) => ({
  kind: 'NEXUS_RELATIONAL_UTILITY_V1',
  abstained: false,
  semanticCoverage: 1000000,
  semanticFieldsIncompleteCount: 0,
  perturbationStable: true,
  nexusRobustnessScore: 1000000,
  remainingBlockerCount: 0,
  contradictionCount: 0,
  nexusTopRiskAdjustment: 900000,
  nexusUtilityMargin: 900000,
  ...overrides,
});

/* --------------------------------------------------------------------------
 * Split hygiene. Three disjoint draws, and only CALIBRATION may select.
 * ------------------------------------------------------------------------ */

test('the three splits are declared over disjoint ranges', () => {
  const ranges = Object.values(STAGE2L14_SPLITS).map((r) => [r.from, r.to]).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i += 1) assert.ok(ranges[i][0] >= ranges[i - 1][1]);
  assert.equal(Object.keys(STAGE2L14_SPLITS).length, 3);
});

test('the measured splits share no case and are separately digested', () => {
  assert.equal(certification.splits.splitsDisjoint, true);
  assert.equal(certification.splits.overlaps.developmentCalibration, 0);
  assert.equal(certification.splits.overlaps.developmentHoldout, 0);
  assert.equal(certification.splits.overlaps.calibrationHoldout, 0);
  assert.equal(certification.splits.calibrationHoldoutSeparate, true);
  const digests = new Set([
    certification.splits.developmentDigest,
    certification.splits.calibrationDigest,
    certification.splits.finalHoldoutDigest,
  ]);
  assert.equal(digests.size, 3);
});

test('each split carries a usable number of cases', () => {
  assert.ok(certification.splits.developmentCases > 1000);
  assert.ok(certification.splits.calibrationCases > 1000);
  assert.ok(certification.splits.finalHoldoutCases > 1000);
});

test('delegation refuses to score rows from the wrong split', () => {
  for (const splitName of ['CALIBRATION', 'DEVELOPMENT']) {
    const rows = [{ splitName, signals: clean(), movesPrime: true, nexusCorrect: true, primeCorrect: false }];
    assert.throws(
      () => evaluateStage2L14Delegation(rows, evaluation.calibration),
      /STAGE2L14_HOLDOUT_SPLIT_VIOLATION/,
    );
  }
});

test('the split guard runs before any short circuit, including on an empty calibration', () => {
  /* A guard reachable only after an early return is not a guard. Even with no
   * delegating bucket to apply, a wrong-split row must still be rejected. */
  assert.equal(evaluation.calibration.delegatingBuckets.length >= 0, true);
  const rows = [{ splitName: 'DEVELOPMENT', signals: clean({ abstained: true }), movesPrime: false, nexusCorrect: false, primeCorrect: true }];
  assert.throws(
    () => evaluateStage2L14Delegation(rows, evaluation.calibration),
    /STAGE2L14_HOLDOUT_SPLIT_VIOLATION/,
  );
});

test('the raw split builder yields only decidable cases', () => {
  const cases = buildStage2L14Split('DEVELOPMENT');
  assert.ok(cases.length > 1000);
  assert.ok(cases.every((record) => record.decidable === true));
  assert.throws(() => buildStage2L14Split('NOT_A_SPLIT'), /STAGE2L14_UNKNOWN_SPLIT/);
});

/* --------------------------------------------------------------------------
 * The confidence contract itself.
 * ------------------------------------------------------------------------ */

test('a clean, high-risk, high-margin case lands in the HIGH bucket', () => {
  assert.equal(stage2L14ConfidenceBucket(clean(), PARAMS), 'NEXUS_CONFIDENCE_HIGH');
});

test('unknown or missing signals produce no bucket at all', () => {
  assert.equal(stage2L14ConfidenceBucket(null, PARAMS), null);
  assert.equal(stage2L14ConfidenceBucket(undefined, PARAMS), null);
  assert.equal(stage2L14ConfidenceBucket({ kind: 'SOMETHING_ELSE' }, PARAMS), null);
});

test('the expert disclaiming its own basis forces a structurally ineligible bucket', () => {
  for (const [overrides, expected] of [
    [{ abstained: true }, 'NEXUS_CONFIDENCE_INELIGIBLE_ABSTAINED'],
    [{ semanticFieldsIncompleteCount: 1 }, 'NEXUS_CONFIDENCE_INELIGIBLE_SEMANTICS'],
    [{ semanticCoverage: 500000 }, 'NEXUS_CONFIDENCE_INELIGIBLE_SEMANTICS'],
    [{ perturbationStable: false }, 'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE'],
    [{ nexusRobustnessScore: STAGE2L14_MINIMUM_ROBUSTNESS_SCORE - 1 }, 'NEXUS_CONFIDENCE_INELIGIBLE_UNSTABLE'],
  ]) {
    const bucket = stage2L14ConfidenceBucket(clean(overrides), PARAMS);
    assert.equal(bucket, expected);
    assert.equal(bucketStructurallyEligible(bucket), false);
  }
});

test('a blocked or contradicted case is OBSTRUCTED regardless of how strong it looks', () => {
  assert.equal(stage2L14ConfidenceBucket(clean({ remainingBlockerCount: 1 }), PARAMS), 'NEXUS_CONFIDENCE_OBSTRUCTED');
  assert.equal(stage2L14ConfidenceBucket(clean({ contradictionCount: 1 }), PARAMS), 'NEXUS_CONFIDENCE_OBSTRUCTED');
});

test('the HIGH boundary is inclusive at the threshold and exclusive one below', () => {
  assert.equal(stage2L14ConfidenceBucket(clean({
    nexusTopRiskAdjustment: PARAMS.minRiskAdjustment,
    nexusUtilityMargin: PARAMS.minUtilityMargin,
  }), PARAMS), 'NEXUS_CONFIDENCE_HIGH');
  assert.equal(stage2L14ConfidenceBucket(clean({
    nexusTopRiskAdjustment: PARAMS.minRiskAdjustment - 1,
    nexusUtilityMargin: PARAMS.minUtilityMargin,
  }), PARAMS), 'NEXUS_CONFIDENCE_MODERATE');
  assert.equal(stage2L14ConfidenceBucket(clean({
    nexusTopRiskAdjustment: PARAMS.minRiskAdjustment,
    nexusUtilityMargin: PARAMS.minUtilityMargin - 1,
  }), PARAMS), 'NEXUS_CONFIDENCE_MODERATE');
});

test('every structurally ineligible bucket is a declared bucket', () => {
  for (const bucket of STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS) {
    assert.ok(STAGE2L14_CONFIDENCE_BUCKETS.includes(bucket));
  }
  assert.equal(bucketStructurallyEligible(null), false);
});

/* --------------------------------------------------------------------------
 * Signals must be available at decision time and free of answer leakage.
 * ------------------------------------------------------------------------ */

test('every inventoried signal is decision-time available and expert emitted', () => {
  assert.ok(STAGE2L14_SIGNAL_INVENTORY.length >= 16);
  for (const entry of STAGE2L14_SIGNAL_INVENTORY) {
    assert.equal(entry.deterministic, true);
    assert.equal(entry.decisionTimeAvailable, true);
    assert.equal(entry.expertEmitted, true);
    assert.equal(entry.potentialLeakage, false);
  }
});

test('no outcome-bearing field reaches the confidence contract', () => {
  assert.equal(certification.labelLeakageDetected, false);
  assert.deepEqual(certification.labelLeakage.forbiddenInSignals, []);
  const names = STAGE2L14_SIGNAL_INVENTORY.map((entry) => entry.signal);
  for (const forbidden of ['optimalAction', 'groundTruth', 'nexusCorrect', 'primeCorrect', 'utilityMargin', 'family', 'profile', 'objectiveType']) {
    assert.ok(!names.includes(forbidden), `${forbidden} must not be a confidence signal`);
  }
});

/* --------------------------------------------------------------------------
 * Calibration is derived from CALIBRATION alone, and fails closed.
 * ------------------------------------------------------------------------ */

test('the frozen calibration is reproducible from the calibration split alone', () => {
  const again = deriveStage2L14Calibration(runStage2L14Split('CALIBRATION'));
  assert.equal(again.calibrationDigest, evaluation.calibration.calibrationDigest);
  assert.deepEqual(again.parameters, evaluation.calibration.parameters);
  assert.deepEqual(again.delegatingBuckets, evaluation.calibration.delegatingBuckets);
});

test('the sweep covers the full predeclared ladder', () => {
  assert.equal(evaluation.calibration.sweep.length, STAGE2L14_RISK_LADDER.length * STAGE2L14_MARGIN_LADDER.length);
});

test('a structurally ineligible bucket never delegates, however it measures', () => {
  for (const bucket of STAGE2L14_STRUCTURALLY_INELIGIBLE_BUCKETS) {
    assert.equal(evaluation.calibration.buckets[bucket].delegates, false);
    assert.equal(evaluation.calibration.buckets[bucket].structurallyEligible, false);
  }
});

test('no bucket below the floor is marked as delegating', () => {
  for (const [name, stats] of Object.entries(evaluation.calibration.buckets)) {
    if (stats.delegates) {
      assert.ok(stats.reliability >= STAGE2L14_RELIABILITY_FLOOR, `${name} delegates at ${stats.reliability}`);
      assert.ok(stats.opportunities >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT);
      assert.ok(stats.wilsonLowerBound >= STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT);
    }
  }
});

/* --------------------------------------------------------------------------
 * Adversarial: everything unmeasured, malformed or unseen must abstain.
 * ------------------------------------------------------------------------ */

test('every adversarial confidence probe fails closed', () => {
  const suite = runStage2L14AdversarialSuite(evaluation.calibration);
  assert.equal(Object.keys(suite).length, STAGE2L14_ADVERSARIAL_CONFIDENCE_CASES.length);
  for (const [name, result] of Object.entries(suite)) {
    assert.equal(result.failsClosed, true, `${name} did not fail closed`);
  }
  assert.equal(certification.securityRegressionPass, true);
});

test('an unseen bucket name delegates under no circumstances', () => {
  const suite = runStage2L14AdversarialSuite(evaluation.calibration);
  assert.equal(suite.UNSEEN_BUCKET.delegates, false);
  assert.equal(suite.UNKNOWN_SIGNAL_KIND.delegates, false);
  assert.equal(suite.MISSING_SIGNALS.delegates, false);
});

/* --------------------------------------------------------------------------
 * Delegation accounting on the final holdout.
 * ------------------------------------------------------------------------ */

test('the holdout is scored against the frozen calibration digest', () => {
  assert.equal(certification.delegation.calibrationDigest, evaluation.calibration.calibrationDigest);
  assert.equal(certification.delegation.casesEvaluated, certification.splits.finalHoldoutCases);
});

test('zero delegation is reported as zero delegation, not as an empty eligible set', () => {
  assert.ok(certification.delegation.structurallyEligibleRecommendations > 0);
  assert.equal(
    certification.delegation.nexusEligibleRecommendations === 0,
    certification.calibration.delegatingBuckets.length === 0,
  );
});

test('delegation is never forced and the floor is never lowered to obtain it', () => {
  assert.equal(certification.delegation.delegationForced, false);
  assert.equal(certification.delegation.reliabilityFloorLowered, false);
});

test('a zero-delegation result cannot pass the utility gate', () => {
  if (certification.delegation.nexusDelegations === 0) {
    assert.equal(certification.utilityPass, false);
    assert.equal(certification.reliabilityPass, false);
    assert.equal(certification.minimumDelegationSupportPass, false);
  }
});

test('harm and Prime-protection accounting is internally consistent', () => {
  const d = certification.delegation;
  assert.equal(d.correctPrimeBreaks, d.harmfulChanges);
  assert.ok(d.harmfulOpportunitiesRejected <= d.harmfulOpportunities);
  assert.ok(d.beneficialOpportunitiesCaptured <= d.beneficialOpportunities);
  assert.ok(d.nexusDelegations <= d.casesEvaluated);
});

/* --------------------------------------------------------------------------
 * Certification gates and outcome classification.
 * ------------------------------------------------------------------------ */

test('certification requires every gate, so any failed gate blocks the pass', () => {
  const gates = [
    'reliabilityPass', 'conservativeReliabilityBoundPass', 'minimumDelegationSupportPass',
    'utilityPass', 'harmCeilingPass', 'primeProtectionPass', 'securityRegressionPass',
  ];
  const allPass = gates.every((gate) => certification[gate] === true);
  assert.equal(certification.stage2l14Certified, allPass && !certification.labelLeakageDetected && certification.splits.splitsDisjoint);
  assert.equal(certification.status, certification.stage2l14Certified ? 'PASS' : 'FAIL');
});

test('a failure carries exactly one named failure mode, a pass carries none', () => {
  if (certification.stage2l14Certified) {
    assert.equal(certification.failureMode, null);
  } else {
    assert.ok(['INSUFFICIENT_RELIABILITY', 'INSUFFICIENT_SUPPORT', 'FAILED_GENERALIZATION'].includes(certification.failureMode));
  }
});

test('the outcome class is one of the declared classes and matches the failure mode', () => {
  const map = {
    A_SAFE_DELEGATION_CERTIFIED: null,
    B_RELIABLE_REGION_EXISTS_BUT_TOO_SMALL: 'INSUFFICIENT_SUPPORT',
    C_SIGNAL_EXISTS_BELOW_RELIABILITY_FLOOR: 'INSUFFICIENT_RELIABILITY',
    D_CONFIDENCE_DOES_NOT_GENERALIZE: 'FAILED_GENERALIZATION',
  };
  assert.ok(Object.hasOwn(map, certification.nexusConfidenceOutcome));
  assert.equal(certification.failureMode, map[certification.nexusConfidenceOutcome]);
});

test('safety posture is unchanged: R0, shadow only, Prime owns the recommendation', () => {
  assert.equal(certification.stage, STAGE2L14_STAGE);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
});

test('this stage changed neither the expert, the benchmark nor the arbiter', () => {
  assert.equal(certification.freeze.nexusExpertChanged, false);
  assert.equal(certification.freeze.benchmarkUnchanged, true);
  assert.equal(certification.freeze.groundTruthUnchanged, true);
  assert.equal(certification.freeze.arbiterChanged, false);
});

test('the inherited portability limitation is recorded, not remediated', () => {
  assert.match(certification.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
  const report = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l14-portability-report.json'), 'utf8'));
  assert.equal(report.portabilityStatus, 'DIGEST_PRODUCED_SINGLE_PLATFORM');
  assert.deepEqual(report.disagreeing, []);
});

/* --------------------------------------------------------------------------
 * Determinism and stored evidence.
 * ------------------------------------------------------------------------ */

test('the certification is byte-stable across an independent rebuild', () => {
  const again = certifyStage2L14({ evaluation: buildStage2L14Evaluation() });
  assert.equal(again.certificationHash, certification.certificationHash);
  assert.equal(again.evidenceDigest, certification.evidenceDigest);
  assert.equal(certification.confidenceModelDeterministic, true);
  assert.equal(certification.invariance.replayEquivalent, true);
});

test('the portability witness is a function of the certification alone', () => {
  const a = buildStage2L14PortabilityDigest(certification);
  const b = buildStage2L14PortabilityDigest(certification);
  assert.equal(a.digest, b.digest);
});

test('the stored certification artifact matches the recomputed one', () => {
  const stored = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l14-certification-result.json'), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, certification.status);
  assert.equal(stored.nexusConfidenceOutcome, certification.nexusConfidenceOutcome);
  assert.equal(stored.failureMode, certification.failureMode);
});

test('the reliability-bucket artifact reports the generalization grid it was judged on', () => {
  const buckets = JSON.parse(readFileSync(path.join(artifactRoot, 'stage2l14-reliability-buckets.json'), 'utf8'));
  assert.equal(buckets.generalizationGrid.length, STAGE2L14_RISK_LADDER.length * STAGE2L14_MARGIN_LADDER.length);
  for (const cell of buckets.generalizationGrid) {
    for (const split of ['development', 'calibration', 'finalHoldout']) {
      assert.ok(Object.hasOwn(cell, split));
      assert.ok(Number.isInteger(cell[split].n));
    }
  }
});
