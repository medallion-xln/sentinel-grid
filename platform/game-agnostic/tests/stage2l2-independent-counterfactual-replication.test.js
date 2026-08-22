import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L2ReplicationEvaluation,
  STAGE2L2_ACTION_RELEVANCE_RULES,
  STAGE2L2_BOUNDS,
  STAGE2L2_INTERPRETER_OWNER,
  STAGE2L2_INTERPRETER_OWNER_SHA256,
  STAGE2L2_INTERPRETER_RULE_DIGEST,
  STAGE2L2_STAGE2L0_CERTIFICATION_HASH,
  STAGE2L2_STAGE2L1_CERTIFICATION_HASH,
  STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
  STAGE2L2_TOTAL_REPLICATION_CASES,
} from '../src/lab/stage2l2-independent-counterfactual-replication.js';

let cached;
const build = () => cached ??= buildStage2L2ReplicationEvaluation();

test('Stage 2L.0 and Stage 2L.1 certifications are inherited exactly', () => {
  assert.equal(STAGE2L2_STAGE2L0_CERTIFICATION_HASH, '25430e8174e47e0ff555e31af9e8b132ef3394c283ea207f2995f49abee2c733');
  assert.equal(STAGE2L2_STAGE2L1_CERTIFICATION_HASH, '07dcb30f79fc0a72fbf4189619df582bf2d1e6d65e0c7352bf2a80a529afcff1');
  assert.equal(build().inherited.stage2l0Certified, true);
  assert.equal(build().inherited.stage2l1Certified, true);
});

test('the selected interpreter owner and exact rule remain frozen', () => {
  assert.equal(STAGE2L2_INTERPRETER_OWNER, 'src/lab/stage2l1-counterfactual-expert-information.js');
  assert.equal(STAGE2L2_INTERPRETER_OWNER_SHA256, '717aa15ba603c050107632e7f5f230a8c2e49ced613a4db605a8dee633e0e68c');
  assert.equal(build().freezes.interpreterChanged, false);
  assert.equal(build().freezes.interpreterRuleDigest, STAGE2L2_INTERPRETER_RULE_DIGEST);
  assert.equal(build().interpreter.selectedExpertInterpreter, 'TIE_BREAK_ONLY');
});

test('harm and useful-delta bounds are preregistered without weakening', () => {
  assert.deepEqual(STAGE2L2_BOUNDS, { maxOracleHarmfulChangeRate: 0.05, maxNexusHarmfulChangeRate: 0.05, maxCombinedHarmfulChangeRate: 0.05, maxCorrectPrimeBreakRate: 0.01, minOracleDecisionDelta: 0.03, minNexusDecisionDelta: 0.03, minCombinedDecisionDelta: 0.05 });
  assert.deepEqual(build().preregisteredBounds, STAGE2L2_BOUNDS);
  assert.equal(build().freezes.interpreterPostReplicationChanges, 0);
});

test('Stage 2L.1 corpus accounting reconciles 4000 total and 1200 holdout', () => {
  assert.deepEqual(build().stage2l1Accounting, { totalCorpusCases: 4000, developmentCases: 1400, validationCases: 1400, finalHoldoutCases: 1200, primeCorrectFinalHoldoutCases: 732, primeWrongFinalHoldoutCases: 468, expertAgreementFinalHoldoutCases: 1200, reconciled: true });
});

test('replication corpus has 5000 identities with zero Stage 2L.1 overlap', () => {
  assert.equal(build().corpus.totalReplicationCases, STAGE2L2_TOTAL_REPLICATION_CASES);
  assert.equal(build().corpus.exactCaseIdentityOverlapWithStage2l1, 0);
  assert.equal(build().corpus.semanticTemplateOverlapWithStage2l1, 0);
  assert.equal(build().corpus.replicationOverlapWithStage2l1, 0);
});

test('out-of-family corpus has balanced strata and no family leakage', () => {
  assert.equal(build().corpus.effectiveSemanticGroups, 5000);
  assert.equal(build().corpus.semanticTemplates, 100);
  assert.deepEqual(build().corpus.strata, { ORACLE_RELEVANT: 1250, NEXUS_RELEVANT: 1250, BOTH_RELEVANT: 1250, NEITHER_RELEVANT: 1250 });
  assert.equal(build().corpus.semanticFamilyLeakage, false);
});

test('all 1250 hard negatives remain exact no-change cases', () => {
  assert.equal(build().corpus.irrelevantExpertEvidenceCases, 1250);
  assert.equal(build().tieBound.irrelevantEvidenceSelectionChangeRate, 0);
});

test('Prime control contains large correct and wrong replication strata', () => {
  assert.deepEqual(build().metrics.prime, { top1: 0.445, top2: 1, correctCases: 2225, wrongCases: 2775 });
  assert.ok(build().metrics.prime.correctCases >= 1000);
});

test('Oracle positive delta fails only the strict correct-Prime protection bound', () => {
  assert.deepEqual(build().metrics.oracle, { cases: 5000, top1: 0.5442, top2: 1, selectionChanges: 554, beneficialChanges: 525, harmfulChanges: 29, neutralChanges: 0, decisionDelta: 0.0992, harmfulChangeRate: 0.0058, breaksCorrectPrime: 29, correctPrimeBreakRate: 0.01303370786516854, repairsPrime: 525, repairRate: 0.1891891891891892 });
  assert.ok(build().metrics.oracle.decisionDelta >= STAGE2L2_BOUNDS.minOracleDecisionDelta);
  assert.ok(build().metrics.oracle.harmfulChangeRate <= STAGE2L2_BOUNDS.maxOracleHarmfulChangeRate);
  assert.ok(build().metrics.oracle.correctPrimeBreakRate > STAGE2L2_BOUNDS.maxCorrectPrimeBreakRate);
  assert.equal(build().replicated.oracleReplicatedUseful, false);
});

test('Nexus independently replicates within every frozen bound', () => {
  assert.deepEqual(build().metrics.nexus, { cases: 5000, top1: 0.545, top2: 1, selectionChanges: 500, beneficialChanges: 500, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.1, harmfulChangeRate: 0, breaksCorrectPrime: 0, correctPrimeBreakRate: 0, repairsPrime: 500, repairRate: 0.18018018018018017 });
  assert.equal(build().replicated.nexusReplicatedUseful, true);
});

test('combined information independently replicates within every frozen bound', () => {
  assert.deepEqual(build().metrics.combined, { cases: 5000, top1: 0.6262, top2: 1, selectionChanges: 936, beneficialChanges: 921, harmfulChanges: 15, neutralChanges: 0, decisionDelta: 0.1812, harmfulChangeRate: 0.003, breaksCorrectPrime: 15, correctPrimeBreakRate: 0.006741573033707865, repairsPrime: 921, repairRate: 0.3318918918918919 });
  assert.equal(build().replicated.combinedReplicatedUseful, true);
});

test('composition synergy is measured without making it a pass substitute', () => {
  assert.deepEqual(build().synergy, { combinedDeltaMinusOracleDelta: 0.082, combinedDeltaMinusNexusDelta: 0.0812, compositionSynergy: true });
});

test('same-action disagreement and single-expert strata are all stressed', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(build().agreement).map(([name, result]) => [name, result.cases])), { BOTH_SUPPORT_SAME_ACTION: 437, SUPPORT_DIFFERENT_ACTIONS: 576, ORACLE_ONLY_RELEVANT: 1023, NEXUS_ONLY_RELEVANT: 1487, NEITHER_RELEVANT: 1477 });
  assert.deepEqual(build().disagreement, { cases: 576, selectionChanges: 176, beneficialChanges: 176, harmfulChanges: 0, harmfulChangeRate: 0 });
});

test('tie eligibility is exact and every non-tie remains invariant', () => {
  assert.equal(STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE, 'PRIME_TOP1_MINUS_TOP2_Q_LE_0_03; EXACTLY_MAPPED_EXPERT_ACTION_RECEIVES_MARGIN_PLUS_0_000001');
  assert.equal(build().tieBound.nonTieCases, 3000);
  assert.equal(build().tieBound.nonTieSelectionChanges, 0);
  assert.equal(Object.values(build().marginAnalysis).reduce((sum, bucket) => sum + bucket.cases, 0), 5000);
});

test('confidence and evidence strength do not become hidden authority', () => {
  assert.equal(build().interpreter.oracleConfidenceDirectlyControlsSelection, false);
  assert.equal(build().interpreter.nexusEvidenceStrengthDirectlyControlsSelection, false);
  assert.deepEqual(build().interpreter.actionRelevanceRules, STAGE2L2_ACTION_RELEVANCE_RULES);
  assert.equal(build().freezes.actionRelevanceRulesChanged, false);
});

test('every selection change has a complete causal trace', () => {
  assert.equal(build().causality.selectionChangeRecords, 1990);
  assert.equal(build().causality.allSelectionChangesCausallyAttributed, true);
  assert.ok(build().causality.traces.every((trace) => trace.primeOriginalSelection && trace.primeRanking && Number.isFinite(trace.primeMargin) && trace.oracleEvidence && trace.nexusEvidence && trace.actionRelevance && typeof trace.tieEligibility === 'boolean' && trace.interpreterDecision && trace.counterfactualSelection && trace.groundTruthOutcome));
});

test('ground truth remains independent exact bounded evidence', () => {
  assert.deepEqual(build().groundTruth, { independentOfExpertOutput: true, expertOutputsReadDuringGroundTruthConstruction: false, exactBoundedOutcomeAndReferenceMethods: true });
});

test('legal action Oracle and Nexus ordering controls are invariant', () => {
  assert.deepEqual(build().invariance, { legalActionOrderInvariant: true, oracleEvidenceOrderInvariant: true, nexusEntityOrderInvariant: true, nexusEdgeOrderInvariant: true });
});

test('missing abstaining malformed and irrelevant experts fail closed', () => {
  assert.deepEqual(build().failureIsolation, { attempts: 6, allFailedClosed: true, counterfactualInterpreterFailsClosed: true });
});

test('failed replication remains canonical R0 and does not justify an Arbiter', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
  assert.equal(build().readiness.deterministicArbiterCandidateJustified, false);
  assert.deepEqual(build().actualPath, { counterfactualOnly: true, actualPrimePathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 });
  assert.deepEqual(build().authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 });
  assert.deepEqual(build().claims, { realZeknovaDecisionDeltaMeasured: false, realZeknovaGameplayImprovementClaimed: false });
});
