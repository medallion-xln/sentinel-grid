import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L4EligibilityCorpus,
  buildStage2L4FreshHoldout,
  buildStage2L4RemediationEvaluation,
  classifyThresholdState,
  evaluateOracleDecisionEligibility,
  ORACLE_ELIGIBILITY_CANDIDATE_SPACE,
  ORACLE_ELIGIBILITY_CANDIDATE_SPACE_DIGEST,
  ORACLE_ELIGIBILITY_RULE,
  ORACLE_ELIGIBILITY_RULE_DIGEST,
  SELECTED_ORACLE_ELIGIBILITY_RULE,
  STAGE2L4_FRESH_HOLDOUT_CASES,
  STAGE2L4_MIN_HEAD_BENEFIT_RETENTION,
  STAGE2L4_MIN_ORACLE_DECISION_DELTA,
  STAGE2L4_STAGE2L3_CERTIFICATION_HASH,
} from '../src/lab/stage2l4-oracle-head-specific-decision-eligibility.js';

let cached;
const build = () => cached ??= buildStage2L4RemediationEvaluation();

test('Stage 2L.4 inherits the exact certified Stage 2L.3 diagnostic', () => {
  assert.equal(STAGE2L4_STAGE2L3_CERTIFICATION_HASH, '0b4be8a8d70925b8c45ffe758282aa93085a7c11d5c6559d9a51e189babcf84d');
  assert.equal(build().provenance.stage2l3Certified, true);
  assert.equal(build().provenance.stage2l3CertificationHash, STAGE2L4_STAGE2L3_CERTIFICATION_HASH);
  assert.equal(build().provenance.stage2l2ResultReproduced, true);
});

test('candidate family is small deterministic and self-digesting', () => {
  assert.equal(ORACLE_ELIGIBILITY_CANDIDATE_SPACE.length, 3);
  assert.equal(sha256(ORACLE_ELIGIBILITY_CANDIDATE_SPACE), ORACLE_ELIGIBILITY_CANDIDATE_SPACE_DIGEST);
  assert.equal(ORACLE_ELIGIBILITY_CANDIDATE_SPACE_DIGEST, 'fd3cc61ac05d3316b9014160ecdd01ba291a23e140482ff830ff6981c5aa8147');
});

test('eligibility corpus is separated across development validation and final holdout', () => {
  const corpus = buildStage2L4EligibilityCorpus();
  assert.equal(corpus.length, 1200);
  assert.deepEqual(build().separatedCorpus, { cases: 1200, developmentCases: 400, validationCases: 400, finalHoldoutCases: 400, semanticFamilyLeakage: false });
});

test('strict causal eligibility freezes before final holdout', () => {
  assert.equal(SELECTED_ORACLE_ELIGIBILITY_RULE.id, 'HEAD_SPECIFIC_CAUSAL_ELIGIBILITY_WITH_STRICT_CYCLE_VALIDITY');
  assert.equal(build().candidateSelection.selected.id, SELECTED_ORACLE_ELIGIBILITY_RULE.id);
  assert.equal(build().candidateSelection.selectedBeforeFinalHoldout, true);
  assert.equal(build().candidateSelection.postHoldoutChanges, 0);
});

test('eligibility architecture emits no action selection', () => {
  assert.equal(build().architecture.oracleHeadSpecificDecisionEligibility, true);
  assert.equal(build().architecture.oracleEligibilityActionSelectionPresent, false);
  assert.equal(ORACLE_ELIGIBILITY_RULE.actionSelection, false);
  assert.equal(sha256(ORACLE_ELIGIBILITY_RULE), ORACLE_ELIGIBILITY_RULE_DIGEST);
});

test('missing malformed and unsupported eligibility fails closed', () => {
  const result = evaluateOracleDecisionEligibility(null, null, null);
  assert.equal(result.eligible, false);
  assert.equal(result.selectedActionPresent, false);
  assert.equal(Object.hasOwn(result, 'selectedAction'), false);
  assert.equal(build().architecture.oracleEligibilityFailsClosed, true);
});

test('zero-harm head rules remain unchanged', () => {
  assert.equal(build().freezes.zeroHarmHeadRulesChanged, false);
  for (const head of ['direction', 'persistence', 'reversal', 'regimeChange', 'volatility']) assert.equal(build().headValueTable[head].harmfulChanges, 0);
});

test('cycle contract requires strict multi-period non-monotonic recurrence', () => {
  assert.equal(ORACLE_ELIGIBILITY_RULE.cycle.minimumCompletePeriods, 3);
  assert.equal(ORACLE_ELIGIBILITY_RULE.cycle.minimumLagCorrelation, 0.9);
  assert.equal(ORACLE_ELIGIBILITY_RULE.cycle.maximumNormalizedPhaseError, 0.2);
  assert.equal(ORACLE_ELIGIBILITY_RULE.cycle.minimumMaterialDirectionReversals, 4);
});

test('cycle audit corpus contains all ten required families in each split', () => {
  const final = buildStage2L4EligibilityCorpus().filter((record) => record.split === 'FINAL_HOLDOUT_SET' && record.canonicalObservation.temporal.binding.task === 'cycle');
  const families = new Set(final.map((record) => record.semanticFamily.split('/').at(-1)));
  for (const family of ['STRICT_MONOTONIC_UP', 'STRICT_MONOTONIC_DOWN', 'MONOTONIC_WITH_NOISE', 'IRREGULAR_NON_PERIODIC', 'ONE_REVERSAL_ONLY', 'TWO_REVERSALS_NON_PERIODIC', 'TRUE_SHORT_CYCLE', 'TRUE_LONGER_CYCLE', 'CYCLE_WITH_DRIFT', 'CYCLE_WITH_NOISE']) assert.equal(families.has(family), true);
});

test('strict cycle eligibility rejects every false decision signal', () => {
  assert.equal(build().cycleRemediation.cycleDecisionEligibilityDeterministic, true);
  assert.equal(build().cycleRemediation.cycleDecisionEligibilityAccuracy, 1);
  assert.equal(build().cycleRemediation.cycleFalseDecisionEligibilityRate, 0);
  assert.equal(build().cycleRemediation.cycleHarmsAfter, 0);
});

test('all inherited cycle benefits survive the remediation', () => {
  assert.equal(build().cycleRemediation.beneficialBaselineCases, 23);
  assert.equal(build().cycleRemediation.beneficialPreserved, 23);
  assert.equal(build().cycleRemediation.beneficialLost, 0);
  assert.equal(build().cycleRemediation.benefitRetentionRate, 1);
  assert.ok(build().cycleRemediation.benefitRetentionRate >= STAGE2L4_MIN_HEAD_BENEFIT_RETENTION);
});

test('threshold state classification is explicit and deterministic', () => {
  const input = { observationHistory: [{ tick: 0, channels: { alpha: 0.7 } }, { tick: 1, channels: { alpha: 0.8 } }], channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } } };
  assert.equal(classifyThresholdState(input).state, 'REACHED_THIS_DECISION_BOUNDARY');
  assert.equal(classifyThresholdState({ observationHistory: [], channelSemantics: null }).state, 'NO_VALID_THRESHOLD');
  assert.equal(build().thresholdRemediation.thresholdStateExplicit, true);
});

test('threshold action causality uses the exact five-class contract', () => {
  assert.equal(build().thresholdRemediation.thresholdActionCausalityBound, true);
  assert.deepEqual(build().thresholdRemediation.causalClasses, ['ACTION_CAN_DELAY_THRESHOLD', 'ACTION_CAN_ACCELERATE_THRESHOLD', 'ACTION_CAN_REVERSE_THRESHOLD_STATE', 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', 'ACTION_HAS_NO_THRESHOLD_CONTROL']);
  assert.equal(build().thresholdRemediation.alreadyCrossedThresholdDecisionEligible, false);
});

test('threshold audit corpus contains every required semantic control', () => {
  const final = buildStage2L4EligibilityCorpus().filter((record) => record.split === 'FINAL_HOLDOUT_SET' && record.canonicalObservation.temporal.binding.task === 'timeToThreshold');
  const families = new Set(final.map((record) => record.semanticFamily.split('/').at(-1)));
  for (const family of ['APPROACHING_THRESHOLD', 'FAR_FROM_THRESHOLD', 'CROSSING_NEXT_STEP', 'CROSSING_WITHIN_PRIME_DEPTH2_HORIZON', 'ALREADY_CROSSED', 'ALREADY_CROSSED_BUT_MITIGATABLE', 'ALREADY_CROSSED_AND_UNCHANGEABLE', 'THRESHOLD_UNRELATED_TO_LEGAL_ACTIONS', 'MISSING_THRESHOLD', 'WRONG_POLARITY_THRESHOLD']) assert.equal(families.has(family), true);
});

test('threshold decision eligibility is exact and preserves all inherited benefits', () => {
  assert.equal(build().thresholdRemediation.thresholdDecisionEligibilityAccuracy, 1);
  assert.equal(build().thresholdRemediation.inheritedThresholdHarmsEligible, 0);
  assert.equal(build().thresholdRemediation.beneficialBaselineCases, 73);
  assert.equal(build().thresholdRemediation.beneficialPreserved, 73);
  assert.equal(build().thresholdRemediation.benefitRetentionRate, 1);
});

test('the exact inherited 29-case corpus is remediated to zero harms', () => {
  assert.deepEqual(build().inheritedHarmRegression, { before: 29, after: 0, cycleBefore: 17, cycleAfter: 0, thresholdBefore: 12, thresholdAfter: 0 });
});

test('remediated Oracle clears safety bounds with increased useful delta', () => {
  assert.deepEqual(build().replication.oracleRemediated, { cases: 5000, top1: 0.55, top2: 1, selectionChanges: 525, beneficialChanges: 525, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.105, harmfulChangeRate: 0, breaksCorrectPrime: 0, correctPrimeBreakRate: 0, repairsPrime: 525 });
  assert.ok(build().replication.oracleRemediated.decisionDelta >= STAGE2L4_MIN_ORACLE_DECISION_DELTA);
});

test('Oracle value and every beneficial repair are retained', () => {
  assert.equal(build().replication.oracleDeltaRetentionRatio, 1.0584677419354838);
  assert.equal(build().replication.oracleBeneficialChangeRetentionRatio, 1);
});

test('combined remediation remains strongly positive and zero-harm', () => {
  assert.deepEqual(build().replication.combinedRemediated, { cases: 5000, top1: 0.6322, top2: 1, selectionChanges: 936, beneficialChanges: 936, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.1872, harmfulChangeRate: 0, breaksCorrectPrime: 0, correctPrimeBreakRate: 0, repairsPrime: 936 });
});

test('Nexus disagreement irrelevant evidence and non-ties remain exact', () => {
  assert.equal(build().replication.nexusBranchOutputBitExact, true);
  assert.equal(build().replication.nexus.decisionDelta, 0.1);
  assert.equal(build().replication.disagreementHarmfulChangesAfterRemediation, 0);
  assert.equal(build().replication.nonTieSelectionChanges, 0);
  assert.equal(build().replication.irrelevantEvidenceSelectionChangeRate, 0);
});

test('head value table reconciles every remediated Oracle intervention', () => {
  const table = build().headValueTable;
  assert.equal(Object.values(table).reduce((sum, head) => sum + head.selectionChanges, 0), 525);
  assert.equal(Object.values(table).reduce((sum, head) => sum + head.beneficialChanges, 0), 525);
  assert.equal(Object.values(table).reduce((sum, head) => sum + head.harmfulChanges, 0), 0);
  assert.deepEqual(table.cycle, { eligibleCases: 68, selectionChanges: 23, beneficialChanges: 23, harmfulChanges: 0, netDecisionDelta: 0.0046, harmRate: 0 });
  assert.deepEqual(table.timeToThreshold, { eligibleCases: 238, selectionChanges: 73, beneficialChanges: 73, harmfulChanges: 0, netDecisionDelta: 0.0146, harmRate: 0 });
});

test('fresh remediation holdout is independent and exceeds the 2000-case floor', () => {
  assert.equal(buildStage2L4FreshHoldout().length, STAGE2L4_FRESH_HOLDOUT_CASES);
  assert.equal(build().freshHoldout.cases, 2400);
  assert.equal(build().freshHoldout.effectiveSemanticGroups, 2400);
  assert.equal(build().freshHoldout.overlapWithStage2l2, 0);
  assert.equal(build().freshHoldout.overlapWithStage2l3HarmCorpus, 0);
});

test('fresh holdout preserves positive value with zero harm', () => {
  assert.equal(build().freshHoldout.oracleDecisionDelta, 0.6229166666666667);
  assert.equal(build().freshHoldout.oracleBeneficialChanges, 1495);
  assert.equal(build().freshHoldout.oracleHarmfulChanges, 0);
  assert.equal(build().freshHoldout.oracleHarmfulChangeRate, 0);
  assert.equal(build().freshHoldout.oracleCorrectPrimeBreakRate, 0);
});

test('all interventions are traced while actual authority remains Prime R0', () => {
  assert.equal(build().causality.allOracleInterventionsCausallyAttributed, true);
  assert.equal(build().causality.inheritedInterventions, 525);
  assert.equal(build().actualPath.actualPrimePathUnchanged, true);
  assert.equal(build().actualPath.arbiterImplemented, false);
  assert.deepEqual(build().authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 });
});

test('eligibility primitive is ready without implementing an Arbiter', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
  assert.equal(build().readiness.oracleDecisionEligibilityCertified, true);
  assert.equal(build().readiness.deterministicArbiterCandidateJustified, true);
  assert.equal(build().readiness.arbiterImplemented, false);
});
