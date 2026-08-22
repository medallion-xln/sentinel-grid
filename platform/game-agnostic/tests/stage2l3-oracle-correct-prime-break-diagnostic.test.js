import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L3Diagnostic,
  STAGE2L3_EXPECTED_STAGE2L2_METRICS,
  STAGE2L3_RECOMMENDED_REMEDIATION,
  STAGE2L3_STAGE,
  STAGE2L3_STAGE2L2_CERTIFICATION_HASH,
  STAGE2L3_STAGE2L2_EVIDENCE_DIGEST,
} from '../src/lab/stage2l3-oracle-correct-prime-break-diagnostic.js';

let cached;
const build = () => cached ??= buildStage2L3Diagnostic();

test('Stage 2L.3 inherits the measured Stage 2L.2 failure rather than treating it as certified', () => {
  assert.equal(STAGE2L3_STAGE, 'STAGE2L3_ORACLE_CORRECT_PRIME_BREAK_CAUSAL_DIAGNOSTIC_WITH_FROZEN_INTERPRETER');
  assert.equal(STAGE2L3_STAGE2L2_EVIDENCE_DIGEST, '0f6783e91c7819c295157a9198a884f729b24f42e6064ceda2bdb48930997557');
  assert.equal(STAGE2L3_STAGE2L2_CERTIFICATION_HASH, 'd91c5ae05528d195ca03e8e3e606a3b8538d5454969ac68d598837c6d566ff41');
  assert.equal(build().provenance.inheritedStage2l2Status, 'FAIL');
});

test('Stage 2L.2 result and all branch metrics reproduce exactly', () => {
  assert.equal(build().provenance.stage2l2ResultReproduced, true);
  assert.equal(build().provenance.reproducedEvidenceDigest, STAGE2L3_STAGE2L2_EVIDENCE_DIGEST);
  assert.deepEqual(build().provenance.reproducedMetrics, STAGE2L3_EXPECTED_STAGE2L2_METRICS);
});

test('the canonical corpus extracts exactly 29 Oracle correct-Prime breaks', () => {
  assert.equal(build().harmCorpus.oracleHarmCases, 29);
  assert.equal(build().harmCorpus.cases.length, 29);
  const { corpusDigest, ...body } = build().harmCorpus;
  assert.equal(sha256(body), corpusDigest);
});

test('all 29 end-to-end harm traces preserve every required field', () => {
  assert.deepEqual(build().traceCompleteness, { complete: 29, required: 29, ratio: '29/29' });
  for (const row of build().harmCorpus.cases) {
    assert.ok(row.caseId && row.groundTruthBestAction && row.primeSelectedAction && row.oracleAssessment);
    assert.ok(Array.isArray(row.legalActions) && row.legalActions.length === 5);
    assert.ok(Number.isFinite(row.primeTop1Q) && Number.isFinite(row.primeTop2Q) && Number.isFinite(row.primeQMargin));
    assert.ok(row.actionRelevanceMapping && row.counterfactualInterpretation && row.groundTruth);
    assert.ok(Number.isFinite(row.groundTruthPrimeActionReturn) && Number.isFinite(row.groundTruthOracleMappedActionReturn) && Number.isFinite(row.decisionLoss));
  }
});

test('Prime Oracle Nexus and the frozen interpreter remain unchanged', () => {
  assert.equal(build().freezes.primeChanged, false);
  assert.equal(build().freezes.oracleChanged, false);
  assert.equal(build().freezes.nexusChanged, false);
  assert.equal(build().freezes.interpreterChanged, false);
  assert.equal(build().freezes.actionRelevanceRulesChanged, false);
  assert.equal(build().freezes.tieBreakRuleChanged, false);
});

test('head attribution is complete and localized to cycle and time-to-threshold', () => {
  assert.deepEqual(build().headAttribution.counts, { DIRECTION: 0, PERSISTENCE: 0, REVERSAL: 0, REGIME_CHANGE: 0, VOLATILITY: 0, CYCLE: 17, TIME_TO_THRESHOLD: 12, MULTI_HEAD: 0, OTHER: 0 });
  assert.equal(build().headAttribution.complete, true);
  assert.equal(build().headAttribution.ratio, '29/29');
});

test('all harmful evidence was technically mapped but causally irrelevant', () => {
  assert.deepEqual(build().actionRelevance, { causallyRelevantHarmCases: 0, technicallyMappedButIrrelevant: 29, wrongActionMappingCases: 0, insufficientEvidenceForOverrideCases: 0, other: 0, complete: true, ratio: '29/29' });
});

test('temporal truth distinguishes cycle errors from already-crossed action errors', () => {
  assert.deepEqual(build().temporalTruthVsDecisionTruth, { temporallyCorrectButDecisionWrong: 12, temporallyWrongAndDecisionWrong: 17, temporallyCorrectAndDecisionCorrectButPrimeGroundTruthConflict: 0 });
});

test('Prime depth-2 contains no double counting and exposes no clean protection signal', () => {
  assert.equal(build().primeDepth2Interaction.doubleCountingOrRedundantContextCases, 0);
  assert.equal(build().primeDepth2Interaction.primeCorrectProtectionSignalObserved, false);
  assert.ok(Object.values(build().primeDepth2Interaction.featureAudit).every((value) => value === false));
});

test('Q-margin forensics use all eligible cases as the harm-rate denominator', () => {
  assert.deepEqual(build().qMarginForensics['0-0.005'], { interval: '[minimum,maximum)', eligibleCases: 409, harmfulCases: 19, harmRateAgainstEligibleCases: 19 / 409 });
  assert.deepEqual(build().qMarginForensics['0.015-0.020'], { interval: '[minimum,maximum)', eligibleCases: 409, harmfulCases: 10, harmRateAgainstEligibleCases: 10 / 409 });
  assert.equal(Object.values(build().qMarginForensics).reduce((sum, bucket) => sum + bucket.harmfulCases, 0), 29);
});

test('head type separates all harm while preserving 429 benefits', () => {
  assert.equal(build().benefitHarmComparison.benefitHarmSeparabilityObserved, true);
  assert.equal(build().benefitHarmComparison.benefitsPreservedByDiagnosticHeadBoundary, 429);
  assert.equal(build().benefitHarmComparison.benefitsInsideHarmfulHeadBoundary, 96);
});

test('confidence is anti-calibrated in harms but does not cleanly discriminate them', () => {
  assert.equal(build().confidenceAudit.harmMeanOracleConfidence, 949602.2068965518);
  assert.equal(build().confidenceAudit.benefitMeanOracleConfidence, 586532.4095238096);
  assert.equal(build().confidenceAudit.harmHighConfidenceCases, 23);
  assert.equal(build().confidenceAudit.benefitHighConfidenceCases, 186);
  assert.equal(build().confidenceAudit.confidenceDiscriminatesHarm, false);
});

test('head-level composition harm accounts for all 554 Oracle changes', () => {
  const heads = build().headAccuracyVsCompositionHarm;
  assert.deepEqual(heads.CYCLE, { eligibleSelectionChanges: 40, beneficialChanges: 23, harmfulChanges: 17, netChangeCount: 6, netDelta: 0.0012, harmRate: 0.425 });
  assert.deepEqual(heads.TIME_TO_THRESHOLD, { eligibleSelectionChanges: 85, beneficialChanges: 73, harmfulChanges: 12, netChangeCount: 61, netDelta: 0.0122, harmRate: 12 / 85 });
  assert.equal(Object.values(heads).reduce((sum, head) => sum + head.eligibleSelectionChanges, 0), 554);
});

test('threshold and cycle audits identify their distinct causal defects', () => {
  assert.equal(build().timeToThresholdAudit.thresholdActionIndependent, 12);
  assert.equal(build().timeToThresholdAudit.thresholdRelevantWithinPrimeHorizon, 0);
  assert.equal(build().cycleAudit.cycleHarmCases, 17);
  assert.equal(build().cycleAudit.cycleTemporallyCorrectHarmCases, 0);
  assert.deepEqual(build().cycleAudit.falsePositiveSourceFamilies, { STAGE2L2_OOF_IRREGULAR_NON_CYCLE: 6, STAGE2L2_OOF_MONOTONIC_NON_CYCLE: 11 });
});

test('polarity remains bound and regime and reversal heads cause no harms', () => {
  assert.deepEqual(build().polarityAudit.classifications, { HIGHER_IS_BETTER: 0, LOWER_IS_BETTER: 12, NEUTRAL_DIRECTION: 0, UNKNOWN_POLARITY: 17 });
  assert.equal(build().polarityAudit.oracleHarmChannelPolarityBound, true);
  assert.equal(build().polarityAudit.polarityMisinterpretationCases, 0);
  assert.deepEqual(build().regimeReversalAudit, { reversalHeadHarmCases: 0, regimeChangeHeadHarmCases: 0, temporallyCorrectButWronglyInterpreted: 0 });
});

test('frozen Nexus supports Prime in 14 harms and is irrelevant in 15', () => {
  assert.deepEqual(build().nexusOnOracleHarmCases, { nexusSupportsPrimeInOracleHarmCases: 14, nexusSupportsOracleInOracleHarmCases: 0, nexusNeutralInOracleHarmCases: 0, nexusIrrelevantInOracleHarmCases: 15 });
});

test('combined branch recovers 14 harms and accounts for all remaining 15', () => {
  assert.equal(build().combinedForensics.combinedStillHarmful, 15);
  assert.equal(build().combinedForensics.combinedRecoveredToPrime, 14);
  assert.equal(build().combinedForensics.combinedRecoveredToOtherCorrectAction, 0);
  assert.equal(build().combinedForensics.combinedUnchangedOther, 0);
  assert.equal(build().combinedForensics.all29OracleHarmsAccountedInCombinedBranch, true);
});

test('return-loss severity and semantic family attribution are complete', () => {
  assert.deepEqual(build().returnGapAnalysis.buckets, { '0-0.01': 0, '0.01-0.03': 0, '0.03-0.06': 10, '0.06-0.10': 14, '>0.10': 5 });
  assert.equal(build().returnGapAnalysis.meanHarmReturnLoss, 0.08244827586206899);
  assert.equal(build().returnGapAnalysis.medianHarmReturnLoss, 0.08);
  assert.equal(build().returnGapAnalysis.maxHarmReturnLoss, 0.15);
  assert.deepEqual(build().semanticFamilyBreakdown.counts, { RESOURCE_DEPLETION: 1, ENEMY_PRESSURE: 2, REVERSAL: 7, CYCLE_TIMING: 5, REGIME_CHANGE: 0, RECOVERY: 6, THRESHOLD: 8, OTHER: 0 });
});

test('all harms have one primary taxonomy and one bounded unimplemented remediation', () => {
  assert.deepEqual(build().failureTaxonomy.counts, { TEMPORAL_ASSESSMENT_WRONG: 17, ACTION_RELEVANCE_TOO_BROAD: 12, ACTION_MAPPING_WRONG: 0, DECISION_IMPLICATION_TOO_STRONG: 0, PRIME_CONTEXT_DOUBLE_COUNTING: 0, CONFIDENCE_UNRELIABLE: 0, HORIZON_MISMATCH: 0, POLARITY_ERROR: 0, OTHER: 0 });
  assert.equal(build().failureTaxonomy.oracleHarmsAttributed, '29/29');
  assert.equal(build().failureTaxonomy.unattributedOracleHarms, 0);
  assert.equal(build().remediationHypothesis.recommendedStage2l4, STAGE2L3_RECOMMENDED_REMEDIATION);
  assert.equal(build().remediationHypothesis.exactlyOneBoundedProposal, true);
  assert.equal(build().remediationHypothesis.implemented, false);
});

test('diagnostic remains canonical counterfactual-only R0 evidence', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
  assert.equal(build().freezes.interpreterRemediationImplemented, false);
  assert.equal(build().freezes.tieBreakThresholdChanged, false);
  assert.equal(build().freezes.arbiterImplemented, false);
  assert.deepEqual(build().actualPath, { counterfactualOnly: true, actualPrimePathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 });
  assert.deepEqual(build().authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 });
});
