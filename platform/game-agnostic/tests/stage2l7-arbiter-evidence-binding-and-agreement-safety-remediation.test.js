import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import { buildStage2L6AdversarialCorpus } from '../src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js';
import {
  buildStage2L7Evaluation,
  buildStage2L7FreshAdversarialHoldout,
  buildStage2L7SeparatedRemediationSets,
  evaluateStage2L7OracleAdversaries,
  remediatedDeterministicArbiter,
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_ARBITER_RULE_TABLE,
  STAGE2L7_FAIL_CLOSED_MATRIX,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_FRESH_HOLDOUT_CASES,
  STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST,
  STAGE2L7_STAGE,
  upgradeStage2L6Record,
  validateArbiterEvidence,
} from '../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';

const inheritedCorpus = buildStage2L6AdversarialCorpus();
const inheritedByStratum = new Map(inheritedCorpus.map((record) => [record.canonicalObservation.stratum, record]));
const freshCorpus = buildStage2L7FreshAdversarialHoldout();
const freshByStratum = new Map(freshCorpus.map((record) => [record.stratum, record]));
const evaluation = buildStage2L7Evaluation();

function inheritedResult(stratum) {
  const upgraded = upgradeStage2L6Record(inheritedByStratum.get(stratum));
  return { upgraded, result: remediatedDeterministicArbiter(upgraded.stage2l7.input) };
}

function freshResult(stratum) {
  const record = freshByStratum.get(stratum);
  return { record, result: remediatedDeterministicArbiter(record.input) };
}

test('declares the exact Stage2L7 contract', () => assert.equal(STAGE2L7_STAGE, 'STAGE2L7_ARBITER_EVIDENCE_BINDING_AND_AGREEMENT_SAFETY_REMEDIATION'));
test('freezes an eight-entry deterministic rule table', () => assert.deepEqual(STAGE2L7_ARBITER_RULE_TABLE.map((entry) => entry.entry), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']));
test('binds the rule digest to the rule table', () => assert.equal(STAGE2L7_ARBITER_RULE_DIGEST, sha256(STAGE2L7_ARBITER_RULE_TABLE)));
test('publishes every canonical fail-closed matrix state', () => assert.deepEqual(Object.keys(STAGE2L7_FAIL_CLOSED_MATRIX), ['VALID', 'STALE', 'CROSS_OBSERVATION', 'CROSS_RUNTIME', 'CROSS_CAMPAIGN', 'UNKNOWN_SCHEMA', 'BAD_DIGEST', 'AMBIGUOUS_ACTION', 'ILLEGAL_ACTION', 'AMBIGUOUS_ENTITY', 'AMBIGUOUS_CHANNEL', 'UNKNOWN_RULE_STATE', 'MISSING_EVIDENCE', 'CONFLICTING_DUPLICATE']));
test('binds the fail-closed matrix digest', () => assert.equal(STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST, sha256(STAGE2L7_FAIL_CLOSED_MATRIX)));
test('binds the Oracle eligibility wrapper digest', () => assert.equal(STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST, evaluation.oracleEligibility.wrapperRuleDigest));

test('creates separated development and validation corpora', () => { const sets = buildStage2L7SeparatedRemediationSets(); assert.equal(sets.development.length, 1500); assert.equal(sets.validation.length, 1500); });
test('keeps development and validation semantic families disjoint', () => { const sets = buildStage2L7SeparatedRemediationSets(); const development = new Set(sets.development.map((record) => record.semanticFamily)); assert.equal(sets.validation.some((record) => development.has(record.semanticFamily)), false); });
test('creates the preregistered 10000-case final holdout', () => assert.equal(freshCorpus.length, STAGE2L7_FRESH_HOLDOUT_CASES));
test('uses unique fresh semantic groups', () => assert.equal(new Set(freshCorpus.map((record) => record.semanticGroup)).size, STAGE2L7_FRESH_HOLDOUT_CASES));

test('creates a canonical decision context identity', () => { const { upgraded } = inheritedResult('PRIME_TIE_BOUNDARY'); assert.equal(sha256(Object.fromEntries(Object.entries(upgraded.stage2l7.context).filter(([key]) => key !== 'contextDigest'))), upgraded.stage2l7.context.contextDigest); });
test('creates a canonical bound input digest', () => { const { upgraded } = inheritedResult('PRIME_TIE_BOUNDARY'); const { inputDigest, ...body } = upgraded.stage2l7.input; assert.equal(sha256(body), inputDigest); });
test('uses bound expert evidence schema v2', () => { const { upgraded } = inheritedResult('PRIME_TIE_BOUNDARY'); assert.ok(upgraded.stage2l7.input.expertEvidence.every((entry) => entry.schemaVersion === 2)); });
test('central validation does not mutate evidence', () => { const { upgraded } = inheritedResult('PRIME_TIE_BOUNDARY'); const before = sha256(upgraded.stage2l7.input); validateArbiterEvidence(upgraded.stage2l7.input); assert.equal(sha256(upgraded.stage2l7.input), before); });
test('validation order is identity through arbitration', () => { const { upgraded } = inheritedResult('PRIME_TIE_BOUNDARY'); assert.deepEqual(validateArbiterEvidence(upgraded.stage2l7.input).validationOrder, ['IDENTITY', 'VALIDITY', 'CAUSAL_RELEVANCE', 'DECISION_ELIGIBILITY', 'SUPPORT', 'AGREEMENT', 'ARBITRATION']); });

test('rejects stale Oracle evidence', () => assert.equal(inheritedResult('STALE_ORACLE_EVIDENCE').result.appliedRule, 'H'));
test('rejects stale Nexus evidence', () => assert.equal(inheritedResult('STALE_NEXUS_EVIDENCE').result.appliedRule, 'H'));
test('rejects cross-observation evidence', () => assert.equal(inheritedResult('CROSS_OBSERVATION_ORACLE').result.appliedRule, 'H'));
test('rejects cross-runtime evidence', () => assert.equal(inheritedResult('CROSS_RUNTIME_EVIDENCE').result.appliedRule, 'H'));
test('rejects cross-campaign evidence', () => assert.equal(freshResult('CROSS_CAMPAIGN').result.appliedRule, 'H'));
test('rejects unknown schemas', () => assert.equal(freshResult('SCHEMA_UPGRADE').result.appliedRule, 'H'));
test('rejects altered payloads with reused digests', () => assert.equal(freshResult('REUSED_DIGEST_ALTERED_PAYLOAD').result.appliedRule, 'H'));
test('rejects renamed action identity', () => assert.equal(freshResult('RENAMED_ACTION').result.appliedRule, 'H'));
test('rejects same-label changed graph topology', () => assert.equal(freshResult('GRAPH_SAME_LABEL_CHANGED_TOPOLOGY').result.appliedRule, 'H'));
test('rejects same-tail changed Oracle history', () => assert.equal(freshResult('HISTORY_SAME_TAIL_DIFFERENT_DIGEST').result.appliedRule, 'H'));
test('returns Prime for an unknown expert/rule state', () => assert.equal(freshResult('UNKNOWN_RULE_STATE').result.appliedRule, 'H'));
test('fails closed on conflicting duplicate evidence', () => assert.equal(freshResult('CONFLICTING_DUPLICATE').result.appliedRule, 'H'));

test('wrong expert agreement has no selection authority', () => { const { result } = inheritedResult('PRIME_CORRECT_BOTH_WRONG_AGREE'); assert.equal(result.decisionChanged, false); assert.equal(result.appliedRule, 'D'); });
test('right expert agreement is still not automatic authority', () => { const { result } = inheritedResult('PRIME_WRONG_BOTH_RIGHT_AGREE'); assert.equal(result.decisionChanged, false); assert.equal(result.appliedRule, 'D'); });
test('valid expert disagreement returns Prime', () => { const { result } = inheritedResult('PRIME_WRONG_ORACLE_RIGHT_NEXUS_WRONG'); assert.equal(result.decisionChanged, false); assert.equal(result.appliedRule, 'E'); });
test('agreement outside ambiguity returns Prime', () => { const { result } = freshResult('AGREE_OUTSIDE_AMBIGUITY'); assert.equal(result.decisionChanged, false); assert.equal(result.appliedRule, 'G'); });
test('expert count is never used as confidence', () => assert.equal(inheritedResult('PRIME_CORRECT_BOTH_WRONG_AGREE').result.expertCountUsedAsConfidence, false));

test('inherits all 16500 Stage2L6 cases', () => assert.equal(evaluation.inheritedAdversarial.metrics.cases, 16500));
test('achieves perfect inherited fail-closed rate', () => assert.deepEqual(evaluation.inheritedAdversarial.failClosed, { requiredCases: 11000, successCases: 11000, rate: 1 }));
test('eliminates both-wrong consensus harm', () => assert.deepEqual(evaluation.inheritedAdversarial.bothWrong, { cases: 500, selectionChanges: 0, harmfulChanges: 0 }));
test('eliminates inherited harmful changes', () => { assert.equal(evaluation.inheritedAdversarial.metrics.harmfulChanges, 0); assert.equal(evaluation.inheritedAdversarial.metrics.correctPrimeBreakRate, 0); });
test('rejects every inherited identity attack class', () => assert.ok(Object.values(evaluation.inheritedAdversarial.identityAttacks).every((value) => value === 0)));
test('preserves all inherited safety properties', () => assert.ok(Object.entries(evaluation.inheritedAdversarial.safety).every(([key, value]) => key.endsWith('Exact') || key.endsWith('Support') || key.endsWith('Closed') || key.endsWith('Prime') ? value === true : value === 0)));

test('retains exact valid-data positive value floor', () => assert.equal(evaluation.validDataRegression.metrics.decisionDelta, 0.1342));
test('keeps valid-data harmful changes at zero', () => assert.equal(evaluation.validDataRegression.metrics.harmfulChanges, 0));
test('retains 671 independently supported valid corrections', () => assert.equal(evaluation.validDataRegression.metrics.beneficialChanges, 671));
test('fresh holdout has zero prior overlap', () => assert.equal(evaluation.freshAdversarialHoldout.overlapWithStage2l6, 0));
test('fresh holdout has perfect fail-closed rate', () => assert.equal(evaluation.freshAdversarialHoldout.failClosed.rate, 1));
test('fresh holdout causes no harmful Prime breaks', () => { assert.equal(evaluation.freshAdversarialHoldout.metrics.harmfulChangeRate, 0); assert.equal(evaluation.freshAdversarialHoldout.metrics.correctPrimeBreakRate, 0); });

test('closes the false-cycle eligibility rate', () => assert.equal(evaluateStage2L7OracleAdversaries().cycle.rate, 0));
test('closes the invalid-threshold eligibility rate', () => assert.equal(evaluateStage2L7OracleAdversaries().threshold.rate, 0));
test('retains all beneficial Cycle decisions', () => assert.equal(evaluation.oracleEligibility.benefitRetention.cycle.rate, 1));
test('retains all beneficial Threshold decisions', () => assert.equal(evaluation.oracleEligibility.benefitRetention.threshold.rate, 1));

test('is invariant to legal action order', () => assert.equal(evaluation.invariance.legalActionOrderInvariant, true));
test('is invariant to expert evidence order', () => assert.equal(evaluation.invariance.expertEvidenceOrderInvariant, true));
test('attributes every selection change causally', () => assert.equal(evaluation.causality.allArbiterSelectionChangesCausallyAttributed, true));
test('records replay-equivalent deterministic evidence', () => assert.equal(evaluation.replay.remediatedArbiterReplayEquivalent, true));
test('remains shadow-only with zero actual influence', () => assert.deepEqual(evaluation.actualPath, { arbiterShadowOnly: true, arbiterSelectionInfluenceActual: 0, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 }));
test('retains R0 authority with Prime as final owner', () => { assert.equal(evaluation.authority.tier, 'R0'); assert.equal(evaluation.authority.finalRecommendationOwner, 'PRIME'); assert.equal(evaluation.authority.liveActionDispatches, 0); });
test('does not justify a real campaign before independent replication', () => assert.equal(evaluation.readiness.realZeknovaShadowDecisionDeltaCampaignJustified, false));
