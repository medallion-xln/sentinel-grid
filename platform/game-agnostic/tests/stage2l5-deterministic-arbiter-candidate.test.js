import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/core/determinism.js';
import {
  ARBITER_RULE_TABLE,
  ARBITER_RULE_TABLE_DIGEST,
  ARBITER_SUPPORT_STATES,
  buildCanonicalArbiterInput,
  buildStage2L5Evaluation,
  buildStage2L5FreshHoldout,
  deterministicArbiterCandidate,
  runArbiterWithFailureIsolation,
  STAGE2L5_FRESH_HOLDOUT_CASES,
  STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L5_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L5_MIN_DECISION_DELTA,
  STAGE2L5_MIN_FRESH_DECISION_DELTA,
  STAGE2L5_MIN_VALUE_RETENTION,
  STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
  STAGE2L5_STAGE,
} from '../src/lab/stage2l5-deterministic-arbiter-candidate.js';

let cachedEvaluation;
let cachedFresh;
const evaluation = () => cachedEvaluation ??= buildStage2L5Evaluation();
const fresh = () => cachedFresh ??= buildStage2L5FreshHoldout();
const inStratum = (name) => fresh().find((record) => record.canonicalObservation.stratum === name);
const inputFor = (record, overrides = {}) => {
  const observation = record.canonicalObservation;
  return buildCanonicalArbiterInput({
    observationIdentity: record.observationIdentity,
    prime: overrides.prime ?? observation.prime,
    oracleEvidence: Object.hasOwn(overrides, 'oracleEvidence') ? overrides.oracleEvidence : observation.oracleEvidence,
    nexusEvidence: Object.hasOwn(overrides, 'nexusEvidence') ? overrides.nexusEvidence : observation.nexusEvidence,
    expertEvidence: overrides.expertEvidence,
  });
};

test('Stage2L5 declares the requested shadow certification stage', () => {
  assert.equal(STAGE2L5_STAGE, 'STAGE2L5_DETERMINISTIC_ARBITER_CANDIDATE_DESIGN_AND_SHADOW_CERTIFICATION');
});

test('the Prime ambiguity threshold is frozen at 0.03', () => {
  assert.equal(STAGE2L5_PRIME_AMBIGUITY_THRESHOLD, 0.03);
});

test('the arbitration table preregisters entries A through H', () => {
  assert.deepEqual(ARBITER_RULE_TABLE.map((entry) => entry.entry), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
});

test('the arbitration table digest binds the complete table', () => {
  assert.equal(ARBITER_RULE_TABLE_DIGEST, sha256(ARBITER_RULE_TABLE));
});

test('the support model is discrete for Oracle and Nexus', () => {
  assert.equal(ARBITER_SUPPORT_STATES.length, 8);
  assert.ok(ARBITER_SUPPORT_STATES.includes('ORACLE_INELIGIBLE'));
  assert.ok(ARBITER_SUPPORT_STATES.includes('NEXUS_SUPPORTS'));
});

test('the fresh independent holdout contains 6000 preregistered cases', () => {
  assert.equal(fresh().length, STAGE2L5_FRESH_HOLDOUT_CASES);
  assert.equal(STAGE2L5_FRESH_HOLDOUT_CASES, 6000);
});

test('canonical input normalizes legal-action and expert-evidence order', () => {
  const record = inStratum('BOTH_RELEVANT_DISAGREEMENT');
  const observation = record.canonicalObservation;
  const standard = inputFor(record);
  const reordered = inputFor(record, { prime: { ...observation.prime, ranking: [...observation.prime.ranking].reverse() }, expertEvidence: [observation.nexusEvidence, observation.oracleEvidence] });
  assert.equal(standard.inputDigest, reordered.inputDigest);
});

test('Oracle-only eligible support uses rule B', () => {
  const record = inStratum('ORACLE_ONLY_RELEVANT');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'B');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.independentGroundTruth.bestAction);
});

test('Nexus-only eligible support uses rule C', () => {
  const record = inStratum('NEXUS_ONLY_RELEVANT');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'C');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.independentGroundTruth.bestAction);
});

test('same-action expert agreement uses rule D', () => {
  const record = inStratum('BOTH_RELEVANT_SAME_ACTION');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'D');
  assert.equal(result.decisionChanged, true);
});

test('certified expert disagreement uses rule E and Prime rank', () => {
  const record = inStratum('BOTH_RELEVANT_DISAGREEMENT');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'E');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.ranking[1].actionId);
});

test('one expert supporting Prime forces rule F to return Prime', () => {
  const record = inStratum('ONE_SUPPORTS_PRIME_ONE_ALTERNATE');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'F');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.selectedAction);
});

test('unresolved disagreement returns Prime', () => {
  const record = inStratum('UNRESOLVED_DISAGREEMENT');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'E');
  assert.equal(result.ruleReason, 'UNRESOLVED_EXPERT_DISAGREEMENT_RETURN_PRIME');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.selectedAction);
});

test('clear Prime preference admits no expert selection change', () => {
  const record = inStratum('PRIME_CLEAR_PREFERENCE');
  const result = deterministicArbiterCandidate(inputFor(record));
  assert.equal(result.appliedRule, 'G');
  assert.equal(result.decisionChanged, false);
});

test('missing expert evidence fails closed through rule H', () => {
  const record = inStratum('ORACLE_ONLY_RELEVANT');
  const result = deterministicArbiterCandidate(inputFor(record, { nexusEvidence: null }));
  assert.equal(result.appliedRule, 'H');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.selectedAction);
});

test('a noncanonical Arbiter input digest fails closed', () => {
  const record = inStratum('ORACLE_ONLY_RELEVANT');
  const input = inputFor(record);
  const result = deterministicArbiterCandidate({ ...input, inputDigest: sha256({ forged: true }) });
  assert.equal(result.appliedRule, 'H');
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.selectedAction);
});

test('a noncanonical expert packet digest fails closed', () => {
  const record = inStratum('ORACLE_ONLY_RELEVANT');
  const oracle = { ...record.canonicalObservation.oracleEvidence, packetDigest: sha256({ forged: true }) };
  const result = deterministicArbiterCandidate(inputFor(record, { oracleEvidence: oracle }));
  assert.equal(result.appliedRule, 'H');
});

test('forced Arbiter implementation failure cannot suppress Prime', () => {
  const record = inStratum('ORACLE_ONLY_RELEVANT');
  const result = runArbiterWithFailureIsolation(inputFor(record), () => { throw new Error('FORCED'); });
  assert.equal(result.counterfactualFinalRecommendation, record.canonicalObservation.prime.selectedAction);
});

test('evaluation preserves all inherited certification statuses', () => {
  const provenance = evaluation().provenance;
  assert.equal(provenance.stage2l0Certified, true);
  assert.equal(provenance.stage2l1Certified, true);
  assert.equal(provenance.stage2l2Status, 'FAIL');
  assert.equal(provenance.stage2l2HistoryPreserved, true);
  assert.equal(provenance.stage2l3Certified, true);
  assert.equal(provenance.stage2l4Certified, true);
});

test('evaluation freezes Prime, Oracle, Nexus, eligibility, and ambiguity semantics', () => {
  const freezes = evaluation().freezes;
  assert.equal(freezes.primeChanged, false);
  assert.equal(freezes.oracleCoreChanged, false);
  assert.equal(freezes.nexusChanged, false);
  assert.equal(freezes.oracleEligibilityRuleChanged, false);
  assert.equal(freezes.primeAmbiguityRuleChanged, false);
});

test('frozen corpus exactly reproduces Stage2L4 combined value', () => {
  const frozen = evaluation().frozenCorpus;
  assert.equal(frozen.primeOnlyTop1, 0.445);
  assert.equal(frozen.arbiter.top1, 0.6322);
  assert.equal(frozen.arbiter.decisionDelta, 0.1872);
  assert.equal(frozen.arbiter.beneficialChanges, 936);
  assert.equal(frozen.arbiter.harmfulChanges, 0);
});

test('Oracle-only, Nexus-only, and combined branches are equivalent', () => {
  const frozen = evaluation().frozenCorpus;
  assert.equal(frozen.oracleOnlyArbiterBranchEquivalent, true);
  assert.equal(frozen.nexusOnlyArbiterBranchEquivalent, true);
  assert.equal(frozen.combinedRemediatedBranchEquivalent, true);
});

test('inherited agreement measurement remains 437/89/89/0', () => {
  const agreement = evaluation().frozenCorpus.agreement;
  assert.deepEqual([agreement.inheritedRawCases, agreement.inheritedSelectionChanges, agreement.inheritedBeneficialChanges, agreement.inheritedHarmfulChanges], [437, 89, 89, 0]);
});

test('inherited disagreement measurement remains 576/176/176/0', () => {
  const disagreement = evaluation().frozenCorpus.disagreement;
  assert.deepEqual([disagreement.inheritedRawCases, disagreement.inheritedSelectionChanges, disagreement.inheritedBeneficialChanges, disagreement.inheritedHarmfulChanges], [576, 176, 176, 0]);
});

test('frozen safety and value-retention bounds pass', () => {
  const frozen = evaluation().frozenCorpus;
  assert.ok(frozen.arbiter.decisionDelta >= STAGE2L5_MIN_DECISION_DELTA);
  assert.ok(frozen.arbiter.harmfulChangeRate <= STAGE2L5_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(frozen.arbiter.correctPrimeBreakRate <= STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.ok(frozen.valueRetentionRatio >= STAGE2L5_MIN_VALUE_RETENTION);
  assert.equal(frozen.nonAmbiguousPrimeCasesChanged, 0);
  assert.equal(frozen.irrelevantExpertEvidenceSelectionChangeRate, 0);
});

test('fresh holdout generalizes above its preregistered value bound without harm', () => {
  const holdout = evaluation().freshHoldout;
  assert.equal(holdout.cases, 6000);
  assert.equal(holdout.arbiter.decisionDelta, 1 / 3);
  assert.ok(holdout.arbiter.decisionDelta >= STAGE2L5_MIN_FRESH_DECISION_DELTA);
  assert.equal(holdout.arbiter.harmfulChanges, 0);
  assert.equal(holdout.arbiter.correctPrimeBreakRate, 0);
});

test('fresh holdout has all preregistered strata and zero inherited overlap', () => {
  const holdout = evaluation().freshHoldout;
  assert.equal(Object.keys(holdout.strata).length, 12);
  assert.ok(Object.values(holdout.strata).every((count) => count === 500));
  assert.equal(holdout.effectiveSemanticGroups, 6000);
  assert.equal(holdout.overlapWithStages2l1Through2l4, 0);
});

test('all selection changes carry complete causal attribution', () => {
  const causality = evaluation().causality;
  assert.equal(causality.allArbiterSelectionChangesCausallyAttributed, true);
  assert.equal(causality.traces.length, 2936);
});

test('malformed evidence, invariance, and failure isolation audits pass', () => {
  const result = evaluation();
  assert.equal(result.malformedEvidence.malformedExpertEvidenceFailsClosed, true);
  assert.ok(Object.values(result.invariance).every(Boolean));
  assert.ok(Object.values(result.failureIsolation).every(Boolean));
});

test('shadow, role, memory, advanced-system, and authority boundaries remain closed', () => {
  const result = evaluation();
  assert.ok(Object.values(result.roleIsolation).every((value) => value === 0));
  assert.equal(result.memory.arbiterMemoryBounded, true);
  assert.equal(result.shadowStatus.arbiterShadowOnly, true);
  assert.equal(result.shadowStatus.arbiterSelectionInfluenceActual, 0);
  assert.equal(result.advancedSystems.learnedRoutingPresent, false);
  assert.equal(result.advancedSystems.horizonPresent, false);
  assert.equal(result.authority.tier, 'R0');
  assert.equal(result.production.arbiterProductionPromoted, false);
});

test('the evidence digest binds the complete deterministic payload', () => {
  const result = evaluation();
  const { evidenceDigest, ...body } = result;
  assert.equal(evidenceDigest, sha256(body));
});
