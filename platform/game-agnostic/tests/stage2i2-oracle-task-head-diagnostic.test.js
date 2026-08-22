import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2I2Diagnostic,
  evaluateStage2I2Head,
  STAGE2I2_GROUND_TRUTH,
  STAGE2I2_HEADS,
} from '../src/lab/stage2i2-oracle-task-head-diagnostic.js';

let cached;
const build = () => cached ??= buildStage2I2Diagnostic();

test('Stage 2I.2 freezes inherited scores and production owners', () => {
  const result = build();
  assert.deepEqual(result.baseline.scores, { prime: 4, oracle: 3, nexus: 4 });
  assert.equal(result.frozenOwners.oracleV1Changed, false);
  assert.equal(result.frozenOwners.robustTrendExpertChanged, false);
});

test('all independent task-head contracts are bounded digest-carrying and abstention capable', () => {
  const result = build();
  assert.deepEqual(Object.keys(result.contracts), STAGE2I2_HEADS);
  for (const contract of Object.values(result.contracts)) {
    assert.equal(contract.consumesBoundedHistory, true);
    assert.equal(contract.maximumFrames, 32);
    assert.equal(contract.ownSemanticOutputOnly, true);
    assert.equal(contract.deterministicConfidence, true);
    assert.equal(contract.canAbstain, true);
    assert.equal(contract.carriesDigest, true);
  }
});

test('every task ground truth is deterministic benchmarkable and populated', () => {
  const result = build();
  assert.deepEqual(Object.keys(result.groundTruth), Object.keys(STAGE2I2_GROUND_TRUTH));
  for (const groundTruth of Object.values(result.groundTruth)) {
    assert.equal(groundTruth.deterministic, true);
    assert.equal(groundTruth.benchmarkable, true);
    assert.ok(groundTruth.cases > 0);
    assert.ok(groundTruth.effectiveSemanticGroups > 0);
  }
});

test('temporal observations are decoupled from value and polarity bound', () => {
  const result = build();
  assert.equal(result.semanticPolicy.temporalObservationValueCoupling, false);
  assert.equal(result.semanticPolicy.channelPolarityBound, true);
  assert.equal(result.semanticPolicy.valueInterpretationRequiresExplicitPolarity, true);
  assert.equal(result.semanticPolicy.permittedPolarities.length, 4);
});

test('Stage 2I.1 corpus is reused without a training or family-leakage path', () => {
  const result = build();
  assert.equal(result.corpus.sourceStage2i1Cases, 2040);
  assert.ok(result.corpus.reusedStage2i1Cases > 1000);
  assert.equal(result.corpus.semanticFamilyLeakage, false);
  assert.equal(result.corpus.partitionStrategy, 'HEAD_SPECIFIC_DIAGNOSTIC_NO_TRAINING');
});

test('diagnostic identifies strong and weak heads using the frozen rubric', () => {
  const result = build();
  assert.ok(result.results.direction.score >= 7);
  assert.ok(result.results.reversal.score >= 7);
  assert.ok(result.results.regimeChange.score < 7);
  assert.equal(result.results.persistence.beatsRelevantSimpleBaseline, false);
  assert.equal(result.dispositions.regimeChange, 'REDESIGN');
  assert.equal(result.dispositions.persistence, 'REPLACE');
});

test('task-specific adverse and error metrics are recorded', () => {
  const result = build();
  assert.ok(Number.isFinite(result.results.direction.adversarialAccuracy));
  assert.ok(Number.isFinite(result.results.persistence.falsePositiveRate));
  assert.ok(Number.isFinite(result.results.reversal.adversarialAccuracy));
  assert.ok(Number.isFinite(result.results.volatility.magnitudeError));
  assert.ok(Number.isFinite(result.results.cycle.falsePositiveRate));
  assert.ok(Number.isFinite(result.results.timeToThreshold.abstentionRate));
  assert.ok(Number.isFinite(result.results.abstention.falseConfidenceRate));
  assert.ok(Number.isFinite(result.results.abstention.falseAbstentionRate));
});

test('history-requiring heads report independent incremental values and baselines', () => {
  const result = build();
  for (const name of ['direction', 'reversal', 'regimeChange', 'cycle', 'timeToThreshold']) {
    assert.ok(Number.isFinite(result.results[name].incrementalValue));
    assert.equal(typeof result.results[name].beatsRelevantSimpleBaseline, 'boolean');
    assert.ok(result.results[name].relevantSimpleBaseline.name);
  }
});

test('each head produces frozen advisory output with a deterministic digest', () => {
  const input = { observationHistory: Array.from({ length: 10 }, (_, tick) => ({ tick, channels: { alpha: .2 + tick * .04 } })) };
  for (const head of STAGE2I2_HEADS) {
    const options = head === 'TIME_TO_THRESHOLD_HEAD' ? {} : undefined;
    const headInput = head === 'TIME_TO_THRESHOLD_HEAD' ? { ...input, channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .8 } } } : input;
    const first = evaluateStage2I2Head(head, headInput, options);
    const second = evaluateStage2I2Head(head, headInput, options);
    assert.equal(first.outputDigest, second.outputDigest);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(first.advisoryOnly, true);
    assert.deepEqual(first.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  }
});

test('Oracle V2 modular design contains no action mapping', () => {
  const result = build();
  assert.equal(result.oracleV2Design.frozen, true);
  assert.equal(result.oracleV2Design.structuredTemporalAssessment, true);
  assert.equal(result.oracleV2Design.genericScalarTemporalValueRequired, false);
  assert.equal(result.oracleV2Design.actionMappingPresent, false);
  assert.equal(result.oracleV2Design.requirements7Of10.requiredHeadMinimums.REGIME_CHANGE_HEAD, 7);
});

test('production selection and R0 authority stay frozen', () => {
  const result = build();
  assert.equal(result.oracleProductionReplaced, false);
  assert.equal(result.primeChanged, false);
  assert.equal(result.nexusChanged, false);
  assert.equal(result.expertSelectionInfluence, 0);
  assert.equal(result.expertActionSelectionApproved, false);
  assert.equal(result.finalRecommendationOwner, 'PRIME');
  assert.deepEqual(result.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('diagnostic replay is deterministic', () => {
  assert.equal(sha256(buildStage2I2Diagnostic()), sha256(buildStage2I2Diagnostic()));
});
