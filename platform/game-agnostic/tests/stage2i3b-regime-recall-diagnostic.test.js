import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildFrozenStage2I3AHoldout,
  buildStage2I3BRecallDiagnostic,
  STAGE2I3B_HOLDOUT_DIGEST,
  STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH,
  STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST,
} from '../src/lab/stage2i3b-regime-recall-diagnostic.js';

let cached;
const build = () => cached ??= buildStage2I3BRecallDiagnostic();

test('Stage 2I.3A failure and frozen holdout reproduce exactly', () => {
  const reproduction = build().reproduction;
  assert.equal(reproduction.stage2i3aCertificationHash, STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH);
  assert.equal(reproduction.stage2i3aEvidenceDigest, STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST);
  assert.equal(reproduction.stage2i3aResultReproduced, true);
  assert.equal(reproduction.holdoutDigest, STAGE2I3B_HOLDOUT_DIGEST);
  assert.equal(sha256(buildFrozenStage2I3AHoldout().map((entry) => entry.caseDigest)), STAGE2I3B_HOLDOUT_DIGEST);
});

test('Regime V3 confusion totals reproduce all 60 false negatives', () => {
  assert.deepEqual(build().reproduction.confusion, {
    cases: 360, correct: 266, accuracy: 266 / 360,
    truePositive: 120, falsePositive: 4, falseNegative: 60, trueNegative: 176,
    precision: 120 / 124, recall: 120 / 180, specificity: 176 / 180,
    f1: 2 * (120 / 124) * (120 / 180) / ((120 / 124) + (120 / 180)),
  });
});

test('the canonical false-negative corpus contains actual failed holdout cases', () => {
  const falseNegatives = build().falseNegatives;
  assert.equal(falseNegatives.cases.length, 60);
  assert.equal(falseNegatives.corpusDigest, sha256(falseNegatives.cases));
  assert.ok(falseNegatives.cases.every((entry) => entry.caseId.startsWith('stage2i3a-final_holdout_set-')));
  assert.ok(falseNegatives.cases.every((entry) => entry.expected === 'TREND_CHANGE' && entry.predicted === 'NO_CHANGE'));
});

test('all misses are single-dimension trend changes in the regime-only quadrant', () => {
  assert.deepEqual(build().falseNegatives.byChangeType, { LEVEL_CHANGE: 0, TREND_CHANGE: 60, VOLATILITY_CHANGE: 0, CYCLE_CHANGE: 0, MULTIPLE_CHANGE: 0 });
  assert.deepEqual(build().falseNegatives.byQuadrant, { REGIME_ONLY: 60, REVERSAL_AND_REGIME: 0 });
});

test('every false negative carries the complete deterministic descriptor trace', () => {
  const required = ['priorLevel', 'recentLevel', 'levelDelta', 'priorSlope', 'recentSlope', 'slopeDelta', 'relativeSlopeDelta', 'priorVolatility', 'recentVolatility', 'volatilityDelta', 'priorCyclePresent', 'recentCyclePresent', 'priorCycleFrequency', 'recentCycleFrequency', 'priorPersistence', 'recentPersistence', 'reversalPresent'];
  for (const entry of build().falseNegatives.cases) {
    assert.ok(required.every((name) => Object.hasOwn(entry.descriptorTrace, name)));
    assert.equal(entry.windowSufficiency.priorWindowLength, 10);
    assert.equal(entry.windowSufficiency.recentWindowLength, 10);
    assert.equal(entry.windowSufficiency.postChangeObservationCount, 10);
  }
});

test('descriptors detect all true regimes before composition', () => {
  assert.deepEqual(build().descriptorDetection, { trueRegimeCases: 180, descriptorDetectedTrueRegime: 180, descriptorMissedTrueRegime: 0, descriptorRecall: 1 });
});

test('trend misses are caused by the both-window persistence requirement', () => {
  const diagnostic = build().trendDiagnostic;
  assert.equal(diagnostic.cases, 60);
  assert.equal(diagnostic.descriptorDetected, 60);
  assert.equal(diagnostic.descriptorMissed, 0);
  assert.equal(diagnostic.failureCounts.PERSISTENCE_GATE_REJECTED, 60);
  assert.equal(Object.entries(diagnostic.failureCounts).filter(([name]) => name !== 'PERSISTENCE_GATE_REJECTED').every(([, count]) => count === 0), true);
  assert.equal(diagnostic.primaryFailureMode, 'PERSISTENCE_GATE_REJECTED');
});

test('level cases are a perfect positive control outside persistence composition', () => {
  const control = build().levelPositiveControl;
  assert.equal(control.cases, 30);
  assert.equal(control.descriptorRecall, 1);
  assert.equal(control.finalRegimeRecall, 1);
});

test('persistence audit measures both true-positive loss and false-positive prevention', () => {
  const gate = build().persistenceGate;
  assert.equal(gate.trueRegimeCasesRejected, 60);
  assert.equal(gate.falseRegimeCasesCorrectlyRejected, 13);
  assert.equal(gate.truePositiveLossRate, 1 / 3);
  assert.equal(gate.falsePositivePreventionRate, 13 / 17);
});

test('no explicit multi-dimension consensus gate exists', () => {
  const consensus = build().consensus;
  assert.equal(consensus.actualRequiredConsensusCount, 1);
  assert.equal(consensus.explicitMultiDimensionRequirement, false);
  assert.equal(consensus.trueRegimeCasesWithOneValidDimension, 90);
  assert.equal(consensus.trueRegimeCasesWithTwoPlusValidDimensions, 90);
  assert.equal(consensus.oneDimensionTrueRegimeRecall, 1 / 3);
  assert.equal(consensus.multiDimensionTrueRegimeRecall, 1);
});

test('any-dimension baseline forensics reconcile both exact accuracies', () => {
  assert.deepEqual(build().anyDimensionBaseline.comparisons, { BOTH_CORRECT: 230, V3_ONLY_CORRECT: 36, BASELINE_ONLY_CORRECT: 90, BOTH_WRONG: 4 });
});

test('precision recall curve contains only the four frozen variants and promotes none', () => {
  const curve = build().variantCurve;
  assert.equal(curve.preRegisteredOnly, true);
  assert.equal(curve.promoted, false);
  assert.equal(curve.variants.length, 4);
  assert.deepEqual(curve.variants.map((entry) => entry.variant), ['MULTI_DIMENSION_WINDOW_DELTA', 'PERSISTENCE_GATED_WINDOW_DELTA', 'CONSENSUS_PROCESS_CHANGE', 'HIERARCHICAL_PROCESS_CHANGE']);
  assert.equal(curve.variants[0].recall, 1);
  assert.equal(curve.variants[2].recall, 2 / 3);
});

test('single dimensions remain valid regime-change semantics', () => {
  assert.deepEqual(build().singleDimensionRegimeValidity, { LEVEL_CHANGE_ONLY: true, TREND_CHANGE_ONLY: true, VOLATILITY_CHANGE_ONLY: true, CYCLE_CHANGE_ONLY: true });
});

test('semantic separation preserves reversal precision while exposing trend recall loss', () => {
  const semantic = build().semanticSeparation;
  assert.equal(semantic.reversalSameRegime.accuracy, 1);
  assert.equal(semantic.trendStrengthChange.accuracy, 0);
  assert.equal(semantic.persistentReversalNewRegime.accuracy, 1);
  assert.equal(semantic.temporaryReversal.accuracy, 1);
});

test('all false negatives are attributed to persistence gating', () => {
  const result = build();
  assert.deepEqual(result.attribution.counts, { PERSISTENCE_GATE_SUPPRESSION: 60 });
  assert.equal(result.attribution.attributed, '60/60');
  assert.equal(result.attribution.unattributed, 0);
  assert.equal(result.rootCause.primary, 'PERSISTENCE_GATING');
  assert.equal(result.rootCause.nextRecommendedStage, 'STAGE2I3C_DIMENSION_AWARE_PERSISTENCE_COMPOSITION_REMEDIATION');
});

test('Regime V4 production Oracle Prime Nexus and R0 safety remain frozen', () => {
  const result = build();
  assert.equal(result.freeze.regimeV4Implemented, false);
  assert.equal(result.freeze.regimeProductionChanged, false);
  assert.equal(result.freeze.allSuccessfulHeadsUnchanged, true);
  assert.equal(result.freeze.oracleV2Assembled, false);
  assert.equal(result.freeze.primeChanged, false);
  assert.equal(result.freeze.nexusChanged, false);
  assert.equal(result.safety.expertSelectionInfluence, 0);
  assert.deepEqual(result.safety.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('Stage 2I.3B diagnostic replay is deterministic', () => {
  assert.equal(sha256(buildStage2I3BRecallDiagnostic()), sha256(buildStage2I3BRecallDiagnostic()));
});
