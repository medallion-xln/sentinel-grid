import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildFrozenStage2I3ACorpus,
  buildStage2I3CDimensionAwareRemediation,
  evaluateRegimeV4,
  REGIME_V4_SEARCH_SPACE,
  STAGE2I3C_FALSE_NEGATIVE_CORPUS_DIGEST,
  STAGE2I3C_GATE,
  STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH,
  STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST,
} from '../src/lab/stage2i3c-dimension-aware-regime-composition.js';

let cached;
const build = () => cached ??= buildStage2I3CDimensionAwareRemediation();

test('Stage 2I.3B diagnosis reproduces exactly', () => {
  const root = build().rootCauseReproduction;
  assert.equal(build().baseline.stage2i3bCertificationHash, STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH);
  assert.equal(build().baseline.stage2i3bEvidenceDigest, STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST);
  assert.equal(root.stage2i3bResultReproduced, true);
  assert.equal(root.descriptorRecall, 1);
  assert.equal(root.trueRegimeCasesRejectedByPersistence, 60);
  assert.equal(root.falseNegativeCorpusDigest, STAGE2I3C_FALSE_NEGATIVE_CORPUS_DIGEST);
});

test('the exact frozen balanced 1080-case corpus is reused', () => {
  const corpus = buildFrozenStage2I3ACorpus();
  assert.equal(corpus.development.length + corpus.validation.length + corpus.holdout.length, 1080);
  assert.equal(sha256(corpus.development.map((entry) => entry.caseDigest)), build().corpus.partitionDigests.DEVELOPMENT_SET);
  assert.equal(sha256(corpus.validation.map((entry) => entry.caseDigest)), build().corpus.partitionDigests.VALIDATION_SET);
  assert.equal(sha256(corpus.holdout.map((entry) => entry.caseDigest)), build().corpus.partitionDigests.FINAL_HOLDOUT_SET);
  assert.deepEqual(build().corpus.casesPerQuadrant, { REVERSAL_ONLY: 270, REGIME_ONLY: 270, REVERSAL_AND_REGIME: 270, NEITHER: 270 });
  assert.equal(build().corpus.semanticFamilyLeakage, false);
});

test('stable sufficient history is distinct from insufficient history', () => {
  const states = build().processStates;
  assert.equal(states.stablePriorInterpretationAvailable, true);
  assert.equal(states.noDirectionalTrendDistinctFromInsufficientHistory, true);
  assert.equal(states.audit.stableWithSufficientHistory.persistenceV2Interpretation, 'INSUFFICIENT_EVIDENCE');
  assert.equal(states.audit.stableWithSufficientHistory.regimeV4PriorState, 'STABLE');
  assert.equal(states.audit.stableWithSufficientHistory.regimeV4Output, 'NO_CHANGE');
  assert.equal(states.audit.shortHistory.regimeV4Output, 'INSUFFICIENT_EVIDENCE');
  assert.equal(states.audit.missingHistory.regimeV4Output, 'INSUFFICIENT_EVIDENCE');
});

test('Regime V4 changes composition only', () => {
  const composition = build().composition;
  assert.equal(composition.persistenceRequirementsDimensionAware, true);
  assert.equal(composition.multiDimensionConsensusRequired, false);
  assert.equal(composition.validSignificantSingleDimensionChangeAllowed, true);
  assert.equal(composition.processDescriptorImplementationChanged, false);
});

test('small preregistered candidate family is frozen before holdout', () => {
  const search = build().search;
  assert.deepEqual(search.space, REGIME_V4_SEARCH_SPACE);
  assert.equal(search.digest, sha256(REGIME_V4_SEARCH_SPACE));
  assert.equal(search.space.length, 3);
  assert.equal(search.selection.selectedRegimeV4.id, 'DIMENSION_AWARE_WITH_ANOMALY_FILTER');
  assert.equal(search.selection.selectionFrozen, true);
  assert.equal(search.selection.frozenBeforeFinalHoldout, true);
});

test('quality gate is conservative and preregistered', () => {
  assert.equal(STAGE2I3C_GATE.minimumScore, 7);
  assert.equal(STAGE2I3C_GATE.minimumAccuracy, .85);
  assert.equal(STAGE2I3C_GATE.minimumAdversarialAccuracy, .85);
  assert.equal(STAGE2I3C_GATE.maximumReversalOnlyFalseRegimeRate, .1);
  assert.equal(STAGE2I3C_GATE.maximumTemporaryAnomalyFalsePositiveRate, .05);
});

test('stable to trend requires recent persistence but not prior persistence', () => {
  const entry = buildFrozenStage2I3ACorpus().holdout.find((item) => item.family === 'STABLE_TO_TREND_POSITIVE');
  const output = evaluateRegimeV4(entry, build().search.selection.selectedRegimeV4);
  assert.equal(output.semanticOutput, 'TREND_CHANGE');
  assert.equal(output.observation.priorProcessState, 'STABLE');
  assert.equal(output.observation.recentProcessState, 'PERSISTENT_UP');
  assert.equal(output.observation.dimensionEvidence.trend.requirement, 'RECENT_PERSISTENCE_ONLY');
  assert.equal(output.observation.dimensionEvidence.trend.accepted, true);
});

test('final holdout reaches score nine and beats the strongest baseline', () => {
  const final = build().finalHoldout;
  assert.equal(final.regimeV4Score, 9);
  assert.equal(final.accuracy, 356 / 360);
  assert.equal(final.adversarialAccuracy, 266 / 270);
  assert.equal(final.beatsSimpleBaseline, true);
  assert.ok(final.incrementalValue > 0);
  assert.equal(build().qualityGatePass, true);
});

test('final binary metrics recover complete recall without specificity loss', () => {
  const final = build().finalHoldout;
  assert.equal(final.truePositive, 180);
  assert.equal(final.falsePositive, 4);
  assert.equal(final.falseNegative, 0);
  assert.equal(final.trueNegative, 176);
  assert.equal(final.recall, 1);
  assert.equal(final.specificity, 176 / 180);
});

test('all exact Stage 2I.3B false negatives are recovered', () => {
  assert.deepEqual(build().exactFalseNegativeRecovery, { original60FalseNegatives: 60, recoveredFromOriginal60: 60, stillMissedFromOriginal60: 0 });
  assert.equal(build().finalHoldout.falseNegativesRecovered, 60);
  assert.equal(build().finalHoldout.falseNegativeReductionRate, 1);
});

test('false-positive and anomaly controls are preserved', () => {
  const final = build().finalHoldout;
  assert.equal(final.regimeV3FalsePositives, 4);
  assert.equal(final.falsePositive, 4);
  assert.equal(final.falsePositiveIncrease, 0);
  assert.equal(final.reversalOnlyFalseRegimeRate, 0);
  assert.equal(final.temporaryAnomalyFalsePositiveRate, 4 / 90);
});

test('represented trend transition subclasses all pass', () => {
  const transitions = build().trendTransitions;
  for (const name of ['STABLE_TO_UP', 'STABLE_TO_DOWN', 'UP_TO_DOWN', 'DOWN_TO_UP', 'UP_TO_FASTER_UP', 'DOWN_TO_FASTER_DOWN']) {
    assert.equal(transitions[name].cases, 30);
    assert.equal(transitions[name].accuracy, 1);
  }
  for (const name of ['UP_TO_STABLE', 'DOWN_TO_STABLE', 'UP_TO_SLOWER_UP', 'DOWN_TO_SLOWER_DOWN']) {
    assert.equal(transitions[name].cases, 0);
    assert.equal(transitions[name].accuracy, null);
  }
});

test('level trend and multiple-change holdout labels are perfect', () => {
  const labels = build().finalHoldout.labelAccuracy;
  assert.equal(labels.LEVEL_CHANGE, 1);
  assert.equal(labels.TREND_CHANGE, 1);
  assert.equal(labels.MULTIPLE_CHANGE, 1);
  assert.equal(labels.VOLATILITY_CHANGE, null);
  assert.equal(labels.CYCLE_CHANGE, null);
  assert.equal(build().frozenCorpusResult.labelAccuracy.VOLATILITY_CHANGE, 13 / 30);
  assert.equal(build().frozenCorpusResult.labelAccuracy.CYCLE_CHANGE, 1);
});

test('all four reversal regime quadrants remain semantically separated', () => {
  assert.deepEqual(build().finalHoldout.quadrantAccuracy, { REVERSAL_ONLY: 1, REGIME_ONLY: 1, REVERSAL_AND_REGIME: 1, NEITHER: 86 / 90 });
  assert.equal(build().finalHoldout.distinctFromReversal, true);
});

test('six paired process changes are causally attributed', () => {
  const causal = build().causalAttribution;
  assert.equal(causal.pairs.length, 6);
  assert.ok(causal.pairs.every((pair) => pair.attributed));
  assert.equal(causal.signalCausallyAttributed, true);
});

test('projected Oracle V2 improves Regime while remaining unassembled', () => {
  assert.deepEqual(build().projectedOracleV2.heads, { direction: 10, persistence: 7, reversal: 7, regimeChange: 9, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 });
  assert.equal(build().projectedOracleV2.oracleV2Assembled, false);
  assert.equal(build().projectedOracleV2.oracleProductionReplaced, false);
});

test('successful heads Prime Nexus selection and R0 authority remain frozen', () => {
  const result = build();
  assert.equal(result.freeze.allOtherOracleHeadsUnchanged, true);
  assert.ok(Object.values(result.freeze.changed).every((changed) => changed === false));
  assert.equal(result.freeze.primeChanged, false);
  assert.equal(result.freeze.nexusChanged, false);
  assert.equal(result.safety.expertSelectionInfluence, 0);
  assert.equal(result.safety.expertActionSelectionApproved, false);
  assert.deepEqual(result.safety.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
});

test('Regime V4 output and Stage 2I.3C replay are deterministic', () => {
  const entry = buildFrozenStage2I3ACorpus().holdout[0];
  const candidate = build().search.selection.selectedRegimeV4;
  assert.equal(evaluateRegimeV4(entry, candidate).outputDigest, evaluateRegimeV4(entry, candidate).outputDigest);
  assert.equal(sha256(buildStage2I3CDimensionAwareRemediation()), sha256(buildStage2I3CDimensionAwareRemediation()));
});
