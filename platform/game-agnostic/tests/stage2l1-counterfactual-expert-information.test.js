import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L1CounterfactualEvaluation,
  buildStage2L1DecisionCorpus,
  EXPERT_INTERPRETATION_SEARCH_SPACE,
  EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST,
  STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE,
  STAGE2L1_STAGE2L0_CERTIFICATION_HASH,
  STAGE2L1_TOTAL_CASES,
} from '../src/lab/stage2l1-counterfactual-expert-information.js';

let cachedEvaluation;
let cachedCorpus;
const build = () => cachedEvaluation ??= buildStage2L1CounterfactualEvaluation();
const corpus = () => cachedCorpus ??= buildStage2L1DecisionCorpus();

test('Stage 2L.0 exact certification is inherited', () => {
  assert.equal(STAGE2L1_STAGE2L0_CERTIFICATION_HASH, '25430e8174e47e0ff555e31af9e8b132ef3394c283ea207f2995f49abee2c733');
  assert.equal(build().inherited.stage2l0Certified, true);
  assert.equal(build().inherited.stage2l0CertificationHash, STAGE2L1_STAGE2L0_CERTIFICATION_HASH);
});

test('small interpretation family and harm ceiling are preregistered', () => {
  assert.deepEqual(EXPERT_INTERPRETATION_SEARCH_SPACE.map((entry) => entry.id), ['NO_CHANGE_CONTROL', 'TIE_BREAK_ONLY', 'BOUNDED_Q_CONTEXT', 'EVIDENCE_ONLY_RERANK']);
  assert.equal(EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST, sha256(EXPERT_INTERPRETATION_SEARCH_SPACE));
  assert.equal(STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE, 0.05);
});

test('corpus exceeds target with four balanced relevance classes', () => {
  assert.equal(build().corpus.totalDecisionCases, STAGE2L1_TOTAL_CASES);
  assert.equal(build().corpus.oracleRelevantCases, 1000);
  assert.equal(build().corpus.nexusRelevantCases, 1000);
  assert.equal(build().corpus.combinedRelevantCases, 1000);
  assert.equal(build().corpus.neitherRelevantCases, 1000);
});

test('whole semantic families are disjoint across all three splits', () => {
  assert.deepEqual(build().corpus.splits, { DEVELOPMENT: 1400, VALIDATION: 1400, FINAL_HOLDOUT: 1200 });
  assert.deepEqual(build().corpus.semanticFamilies, { DEVELOPMENT: 28, VALIDATION: 28, FINAL_HOLDOUT: 24 });
  assert.equal(build().corpus.effectiveSemanticGroups, 4000);
  assert.equal(build().corpus.semanticFamilyLeakage, false);
});

test('ground truth is built before and independently of expert outputs', () => {
  assert.equal(build().groundTruth.independentOfExpertOutput, true);
  assert.equal(build().groundTruth.expertOutputsReadDuringGroundTruthConstruction, false);
  assert.ok(corpus().every((entry) => entry.canonicalObservation.independentGroundTruth.ranking.length === 5));
});

test('actual Prime recommendation path remains unchanged and uninfluenced', () => {
  assert.equal(build().actualPath.primeActualPathUnchanged, true);
  assert.equal(build().actualPath.oracleSelectionInfluenceActual, 0);
  assert.equal(build().actualPath.nexusSelectionInfluenceActual, 0);
  assert.equal(build().actualPath.actualRecommendations.length, 1200);
});

test('all four counterfactual branches remain isolated and inert', () => {
  assert.deepEqual(build().isolation, { counterfactualBranchesIsolated: true, counterfactualOnly: true, canDispatch: false, canMutateLiveWorld: false });
  assert.ok(build().holdoutRecords.every((record) => Object.keys(record.branches).sort().join(',') === 'primeBoth,primeNexus,primeOnly,primeOracle'));
});

test('selected interpreter has no legacy scalar bias or hidden routing', () => {
  assert.equal(build().interpreter.evaluationOnly, true);
  assert.equal(build().interpreter.legacyScalarExpertBiasUsed, false);
  assert.equal(build().interpreter.globalExpertScalarBias, false);
  assert.equal(build().interpreter.learnedRoutingPresent, false);
});

test('Oracle and Nexus relevance is action-bound with exact zero abstention', () => {
  assert.equal(build().interpreter.oracleActionRelevanceCausallyBound, true);
  assert.equal(build().interpreter.nexusActionRelevanceCausallyBound, true);
  assert.equal(build().interpreter.noRelevantEvidenceImpliesZeroEffect, true);
  const neither = build().holdoutRecords.filter((record) => record.relevanceClass === 'NEITHER');
  assert.ok(neither.every((record) => record.oracleInterpretation.adjustment === 0 && record.nexusInterpretation.adjustment === 0));
});

test('validation freezes tie-break-only before final holdout', () => {
  assert.equal(build().interpreter.selectedExpertInterpreter, 'TIE_BREAK_ONLY');
  assert.equal(build().interpreter.selectionFrozenBeforeFinalHoldout, true);
  assert.equal(build().interpreter.validationResults[0].candidateId, 'TIE_BREAK_ONLY');
  assert.equal(build().interpreter.validationResults[0].harmGate, true);
});

test('Prime-only holdout is the exact control', () => {
  assert.deepEqual(build().finalHoldout.prime, { top1: 0.61, top2: 1, correctCases: 732, wrongCases: 468 });
});

test('Oracle counterfactual produces positive zero-harm measured delta', () => {
  assert.deepEqual(build().finalHoldout.oracle, { cases: 1200, top1: 0.71, top2: 1, selectionChanges: 120, beneficialChanges: 120, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.1, harmfulChangeRate: 0, breaksCorrectPrime: 0, repairsPrime: 120, repairRate: 0.2564102564102564 });
  assert.equal(build().usefulness.oracleInformationUseful, true);
});

test('Nexus counterfactual produces positive zero-harm measured delta', () => {
  assert.deepEqual(build().finalHoldout.nexus, { cases: 1200, top1: 0.685, top2: 1, selectionChanges: 90, beneficialChanges: 90, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.075, harmfulChangeRate: 0, breaksCorrectPrime: 0, repairsPrime: 90, repairRate: 0.19230769230769232 });
  assert.equal(build().usefulness.nexusInformationUseful, true);
});

test('combined counterfactual produces the strongest zero-harm delta', () => {
  assert.deepEqual(build().finalHoldout.combined, { cases: 1200, top1: 0.76, top2: 1, selectionChanges: 180, beneficialChanges: 180, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.15, harmfulChangeRate: 0, breaksCorrectPrime: 0, repairsPrime: 180, repairRate: 0.38461538461538464 });
  assert.equal(build().usefulness.combinedInformationUseful, true);
});

test('all five Prime margin buckets are measured without hidden harm', () => {
  assert.equal(Object.keys(build().marginAnalysis).length, 5);
  assert.equal(Object.values(build().marginAnalysis).reduce((sum, bucket) => sum + bucket.cases, 0), 1200);
  assert.ok(Object.values(build().marginAnalysis).every((bucket) => bucket.harmRate === 0));
});

test('Oracle confidence and Nexus evidence strength are analyzed independently', () => {
  assert.equal(Object.values(build().expertConfidenceAnalysis.oracle).reduce((sum, bucket) => sum + bucket.cases, 0), 1200);
  assert.equal(Object.values(build().expertConfidenceAnalysis.nexus).reduce((sum, bucket) => sum + bucket.cases, 0), 1200);
});

test('all five agreement and disagreement classes are populated', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(build().agreement).map(([name, result]) => [name, result.cases])), {
    BOTH_SUPPORT_SAME_ACTION: 150,
    SUPPORT_DIFFERENT_ACTIONS: 150,
    ORACLE_ONLY_RELEVANT: 300,
    NEXUS_ONLY_RELEVANT: 300,
    NEITHER_RELEVANT: 300,
  });
});

test('composition synergy is measured rather than assumed', () => {
  assert.equal(build().synergy.combinedDeltaMinusOracleDelta, 0.04999999999999999);
  assert.equal(build().synergy.combinedDeltaMinusNexusDelta, 0.075);
  assert.equal(build().synergy.compositionSynergy, true);
});

test('every changed selection has a complete causal attribution record', () => {
  assert.equal(build().causality.selectionChangeRecords, 390);
  assert.equal(build().causality.allSelectionChangesCausallyAttributed, true);
  assert.ok(build().causality.traces.every((trace) => trace.primeBaselineRanking && trace.expertEvidence && trace.actionRelevance && trace.boundedInterpretation && trace.newRanking && trace.groundTruthResult));
});

test('aggregate evidence replays canonically and remains R0', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
  assert.deepEqual(build().replay, { deterministicInputs: true, deterministicExpertOutputs: true, deterministicInterpreter: true });
  assert.deepEqual(build().authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 });
  assert.equal(build().claims.realZeknovaGameplayImprovementClaimed, false);
});
