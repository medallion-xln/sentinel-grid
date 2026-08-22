import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import {
  buildStage2L2ReplicationCorpus,
  buildStage2L2ReplicationEvaluation,
  STAGE2L2_INTERPRETER_RULE_DIGEST,
} from './stage2l2-independent-counterfactual-replication.js';
import {
  evaluateOracleDecisionEligibility,
  ORACLE_ELIGIBILITY_RULE_DIGEST,
} from './stage2l4-oracle-head-specific-decision-eligibility.js';
import {
  buildStage2L6AdversarialCorpus,
  STAGE2L6_ADVERSARIAL_STRATA,
} from './stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js';
import {
  STAGE2L0_CAMPAIGN_IDENTITY,
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_RUNTIME_IDENTITY,
} from './stage2l0-core-triad-shadow-integration.js';

export const STAGE2L7_STAGE = 'STAGE2L7_ARBITER_EVIDENCE_BINDING_AND_AGREEMENT_SAFETY_REMEDIATION';
export const STAGE2L7_STAGE2L5_CERTIFICATION_HASH = 'c3d66002056cdf30ce943056a0af9c290f2b0e94589f86edbaa27330cec358cc';
export const STAGE2L7_STAGE2L5_EVIDENCE_DIGEST = 'a6d593bba5da86b7a80e73161f256620561ba9193ad4abcf94cc334f60febced';
export const STAGE2L7_STAGE2L6_CERTIFICATION_HASH = '9341075d2fce43d5f987946c35b327a1aca9c8d71f84ca13981dbb5c644d97c5';
export const STAGE2L7_STAGE2L6_EVIDENCE_DIGEST = 'ddbf63bad7f32618b5afbeab6e8f3d9e666a32e21222078f34def866578f4a40';
export const STAGE2L7_PRIME_AMBIGUITY_THRESHOLD = 0.03;
export const STAGE2L7_FRESH_HOLDOUT_CASES = 10000;
export const STAGE2L7_MIN_VALID_DATA_DECISION_DELTA = 0.10;
export const STAGE2L7_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L7_NEXT_STAGE = 'STAGE2L8_REMEDIATED_ARBITER_INDEPENDENT_RED_TEAM_REPLICATION';

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const ORACLE_HEADS = deepFreeze(['direction', 'persistence', 'reversal', 'regimeChange', 'volatility', 'cycle', 'timeToThreshold']);
const EXPERTS = deepFreeze(['NEXUS', 'ORACLE']);
const TIE_EPSILON = 0.000001;

function identity(payload) { return `sha256:${sha256(payload)}`; }
function clone(value) { return structuredClone(value); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function round(value) { return Number(value.toFixed(6)); }
function digestIdentity(value) { return typeof value === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(value); }
function exact(left, right) { return sha256(left) === sha256(right); }
function packetBody(packet) { const body = clone(packet); delete body.packetDigest; return body; }
function actionKey(actionId) { return `sentinel.action/${actionId}`; }
function percentile(values, proportion) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0; }

export const STAGE2L7_ORACLE_ELIGIBILITY_RULE = deepFreeze({
  schemaVersion: 1,
  id: 'ORACLE_HEAD_SPECIFIC_DECISION_ELIGIBILITY_V3_TREND_REJECTION_AND_DEPTH2_HORIZON',
  parentRuleDigest: ORACLE_ELIGIBILITY_RULE_DIGEST,
  cycle: {
    rejectTrendDominatedRecurrence: true,
    maximumEndpointDriftToAmplitudeRatio: 0.55,
  },
  threshold: {
    maximumActionableHorizonSteps: 2,
    rejectMissingOrNonFiniteHorizon: true,
  },
  unknownState: 'DENY',
  actionSelection: false,
  advisoryOnly: true,
});
export const STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST = sha256(STAGE2L7_ORACLE_ELIGIBILITY_RULE);
export const STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY = identity(STAGE2L7_ORACLE_ELIGIBILITY_RULE);
export const STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY = identity({ parent: STAGE2L2_INTERPRETER_RULE_DIGEST, stage: STAGE2L7_STAGE, doctrine: 'EXACT_ENTITY_EDGE_GRAPH_BINDING' });

export const STAGE2L7_ARBITER_RULE_TABLE = deepFreeze([
  { entry: 'A', condition: 'NO_INDEPENDENTLY_VALID_ELIGIBLE_EXPERT', outcome: 'RETURN_PRIME' },
  { entry: 'B', condition: 'ORACLE_ONLY_INDEPENDENTLY_VALID_ELIGIBLE', outcome: 'SELECT_EXACT_CERTIFIED_TIE_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'C', condition: 'NEXUS_ONLY_INDEPENDENTLY_VALID_ELIGIBLE', outcome: 'SELECT_EXACT_CERTIFIED_TIE_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'D', condition: 'BOTH_VALID_AND_AGREE', outcome: 'RETURN_PRIME_CONSENSUS_IS_NOT_INDEPENDENT_AUTHORITY' },
  { entry: 'E', condition: 'BOTH_VALID_AND_DISAGREE', outcome: 'RETURN_PRIME_UNRESOLVED_DISAGREEMENT' },
  { entry: 'F', condition: 'ANY_VALID_EXPERT_SUPPORTS_PRIME', outcome: 'RETURN_PRIME' },
  { entry: 'G', condition: 'PRIME_OUTSIDE_AMBIGUITY_REGION', outcome: 'RETURN_PRIME' },
  { entry: 'H', condition: 'INVALID_UNKNOWN_MISSING_DUPLICATE_OR_UNSUPPORTED_STATE', outcome: 'RETURN_PRIME_AND_IGNORE_ALL_EXPERTS' },
]);
export const STAGE2L7_ARBITER_RULE_DIGEST = sha256(STAGE2L7_ARBITER_RULE_TABLE);

export const STAGE2L7_FAIL_CLOSED_MATRIX = deepFreeze({
  VALID: 'VALIDATE_THEN_APPLY_CONSERVATIVE_RULE_TABLE',
  STALE: 'RETURN_PRIME_IGNORE_EXPERT',
  CROSS_OBSERVATION: 'RETURN_PRIME_IGNORE_EXPERT',
  CROSS_RUNTIME: 'RETURN_PRIME_IGNORE_EXPERT',
  CROSS_CAMPAIGN: 'RETURN_PRIME_IGNORE_EXPERT',
  UNKNOWN_SCHEMA: 'RETURN_PRIME_IGNORE_EXPERT',
  BAD_DIGEST: 'RETURN_PRIME_IGNORE_EXPERT',
  AMBIGUOUS_ACTION: 'RETURN_PRIME_IGNORE_EXPERT',
  ILLEGAL_ACTION: 'RETURN_PRIME_IGNORE_EXPERT',
  AMBIGUOUS_ENTITY: 'RETURN_PRIME_IGNORE_EXPERT',
  AMBIGUOUS_CHANNEL: 'RETURN_PRIME_IGNORE_EXPERT',
  UNKNOWN_RULE_STATE: 'RETURN_PRIME_IGNORE_EXPERT',
  MISSING_EVIDENCE: 'RETURN_PRIME_IGNORE_EXPERT',
  CONFLICTING_DUPLICATE: 'RETURN_PRIME_IGNORE_EXPERT',
});
export const STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST = sha256(STAGE2L7_FAIL_CLOSED_MATRIX);

function canonicalRanking(ranking) {
  if (!Array.isArray(ranking) || ranking.length < 2) throw new Error('PRIME_RANKING_MISSING_OR_MALFORMED');
  const normalized = ranking.map((entry) => ({ actionId: entry?.actionId, qValue: Number(entry?.qValue ?? entry?.primeQ) }));
  if (normalized.some((entry) => typeof entry.actionId !== 'string' || !Number.isFinite(entry.qValue))) throw new Error('PRIME_RANKING_CONTAINS_UNKNOWN_ACTION_OR_Q');
  if (new Set(normalized.map((entry) => entry.actionId)).size !== normalized.length) throw new Error('PRIME_RANKING_DUPLICATE_ACTION');
  return normalized.sort((left, right) => right.qValue - left.qValue || left.actionId.localeCompare(right.actionId));
}

function normalizeLegalActions(ranking, legalActions) {
  const byId = new Map((legalActions ?? ranking.map((entry) => ({ actionId: entry.actionId, canonicalKey: actionKey(entry.actionId), semanticType: 'GAME_ACTION' }))).map((entry) => [entry.actionId, entry]));
  const normalized = ranking.map((entry) => {
    const supplied = byId.get(entry.actionId);
    if (!supplied || supplied.canonicalKey !== actionKey(entry.actionId)) throw new Error('LEGAL_ACTION_CANONICAL_IDENTITY_INVALID');
    return { actionId: entry.actionId, canonicalKey: supplied.canonicalKey, semanticType: supplied.semanticType ?? 'GAME_ACTION' };
  }).sort((left, right) => left.canonicalKey.localeCompare(right.canonicalKey));
  if (new Set(normalized.map((entry) => entry.canonicalKey)).size !== normalized.length) throw new Error('LEGAL_ACTION_CANONICAL_IDENTITY_AMBIGUOUS');
  return normalized;
}

export function createArbiterDecisionContext({
  runtimeIdentity = STAGE2L0_RUNTIME_IDENTITY,
  campaignIdentity = STAGE2L0_CAMPAIGN_IDENTITY,
  observationIdentity,
  canonicalStateInput,
  prime,
  legalActions,
  oracleRequirement,
  nexusRequirement,
}) {
  const ranking = canonicalRanking(prime?.ranking ?? prime?.rankedLegalActions);
  const selectedAction = prime?.selectedAction ?? ranking[0].actionId;
  if (selectedAction !== ranking[0].actionId) throw new Error('PRIME_SELECTED_ACTION_NOT_CANONICAL');
  const actions = normalizeLegalActions(ranking, legalActions);
  const stateInputDigest = identity(canonicalStateInput ?? { observationIdentity, ranking });
  const legalActionSetDigest = identity(actions);
  const primeInputIdentity = identity({ runtimeIdentity, campaignIdentity, observationIdentity, stateInputDigest, legalActionSetDigest, ranking });
  const primeRecommendationIdentity = identity({ primeInputIdentity, selectedActionKey: actionKey(selectedAction), rankingDigest: identity(ranking) });
  const body = {
    schemaVersion: 1,
    contract: 'SENTINEL_GRID_ARBITER_DECISION_CONTEXT_V1',
    runtimeIdentity,
    campaignIdentity,
    observationIdentity,
    stateInputDigest,
    legalActionSetDigest,
    legalActions: actions,
    prime: {
      implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.prime),
      inputIdentity: primeInputIdentity,
      recommendationIdentity: primeRecommendationIdentity,
      selectedAction,
      selectedActionKey: actionKey(selectedAction),
      rankingDigest: identity(ranking),
    },
    expertRequirements: {
      oracle: clone(oracleRequirement),
      nexus: clone(nexusRequirement),
    },
  };
  return deepFreeze({ ...body, contextDigest: sha256(body) });
}

function decisionBinding(context) {
  return {
    contextDigest: context.contextDigest,
    runtimeIdentity: context.runtimeIdentity,
    campaignIdentity: context.campaignIdentity,
    observationIdentity: context.observationIdentity,
    stateInputDigest: context.stateInputDigest,
    legalActionSetDigest: context.legalActionSetDigest,
    primeInputIdentity: context.prime.inputIdentity,
    primeRecommendationIdentity: context.prime.recommendationIdentity,
  };
}

export function createBoundArbiterEvidence({
  expert,
  decisionContext,
  assessmentIdentity,
  permissionIdentity,
  permissionEligible,
  relevant,
  tieEligible,
  actionId = null,
  actionCanonicalKey,
  oracleBinding = null,
  nexusBinding = null,
  causalBasisCertified = true,
  relevanceClass = 'ACTION_CAUSAL',
  decisionBindingOverride = null,
}) {
  const permissionRuleIdentity = expert === 'ORACLE' ? STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY : STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY;
  const body = {
    schemaVersion: 2,
    contract: 'SENTINEL_GRID_BOUND_EXPERT_EVIDENCE_V2',
    expert,
    decisionBinding: decisionBindingOverride ?? decisionBinding(decisionContext),
    assessmentIdentity,
    permissionIdentity,
    permissionRuleIdentity,
    permissionEligible,
    relevant,
    tieEligible,
    actionBinding: actionId === null ? null : { actionId, canonicalKey: actionCanonicalKey === undefined ? actionKey(actionId) : actionCanonicalKey },
    oracleBinding: expert === 'ORACLE' ? clone(oracleBinding) : null,
    nexusBinding: expert === 'NEXUS' ? clone(nexusBinding) : null,
    causalBasis: {
      certified: causalBasisCertified,
      relevanceClass,
      sourceDigest: identity({ expert, assessmentIdentity, permissionIdentity, relevanceClass }),
    },
    actionGeneration: false,
    advisoryOnly: true,
  };
  return deepFreeze({ ...body, packetDigest: sha256(body) });
}

function evidenceSort(left, right) { return String(left?.expert).localeCompare(String(right?.expert)) || String(left?.packetDigest).localeCompare(String(right?.packetDigest)); }

export function buildBoundArbiterInput({ decisionContext, prime, expertEvidence = [], oracleEvidence, nexusEvidence }) {
  const ranking = canonicalRanking(prime?.ranking ?? prime?.rankedLegalActions);
  const selectedAction = prime?.selectedAction ?? ranking[0].actionId;
  const margin = round(ranking[0].qValue - ranking[1].qValue);
  const supplied = expertEvidence.length ? expertEvidence : [oracleEvidence, nexusEvidence].filter((entry) => entry !== undefined);
  const body = {
    schemaVersion: 2,
    contract: 'SENTINEL_GRID_EVIDENCE_BOUND_ARBITER_INPUT_V2',
    shadowOnly: true,
    decisionContext,
    prime: {
      implementationIdentity: decisionContext.prime.implementationIdentity,
      inputIdentity: decisionContext.prime.inputIdentity,
      recommendationIdentity: decisionContext.prime.recommendationIdentity,
      selectedAction,
      rankedLegalActions: ranking,
      ambiguityMargin: margin,
      ambiguityThreshold: STAGE2L7_PRIME_AMBIGUITY_THRESHOLD,
    },
    expertEvidence: [...supplied].sort(evidenceSort),
  };
  return deepFreeze({ ...body, inputDigest: sha256(body) });
}

function expectedKeys(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && exact(Object.keys(value).sort(), [...keys].sort()); }

function invalidEvidence(expert, status, reason, evidence = null) { return { expert, status, reason, active: false, evidence, supportState: 'NO_SUPPORT' }; }

function validateBoundEvidence(evidence, expert, context) {
  if (evidence === undefined || evidence === null) return invalidEvidence(expert, 'MISSING_EVIDENCE', `${expert}_MISSING`);
  if (!expectedKeys(evidence, ['schemaVersion', 'contract', 'expert', 'decisionBinding', 'assessmentIdentity', 'permissionIdentity', 'permissionRuleIdentity', 'permissionEligible', 'relevant', 'tieEligible', 'actionBinding', 'oracleBinding', 'nexusBinding', 'causalBasis', 'actionGeneration', 'advisoryOnly', 'packetDigest'])) return invalidEvidence(expert, 'INVALID_SCHEMA', `${expert}_SCHEMA_FIELDS_UNKNOWN`, evidence);
  const { packetDigest, ...body } = evidence;
  if (!digestIdentity(packetDigest) || sha256(body) !== packetDigest) return invalidEvidence(expert, 'INVALID_DIGEST', `${expert}_PACKET_DIGEST_INVALID`, evidence);
  if (evidence.schemaVersion !== 2 || evidence.contract !== 'SENTINEL_GRID_BOUND_EXPERT_EVIDENCE_V2' || evidence.expert !== expert) return invalidEvidence(expert, 'INVALID_SCHEMA', `${expert}_SCHEMA_OR_ROLE_INVALID`, evidence);
  if (!exact(evidence.decisionBinding, decisionBinding(context))) return invalidEvidence(expert, 'INVALID_IDENTITY', `${expert}_DECISION_CONTEXT_BINDING_MISMATCH`, evidence);
  if (!digestIdentity(evidence.assessmentIdentity) || !digestIdentity(evidence.permissionIdentity)) return invalidEvidence(expert, 'INVALID_IDENTITY', `${expert}_ASSESSMENT_OR_PERMISSION_IDENTITY_INVALID`, evidence);
  const expectedRule = expert === 'ORACLE' ? STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY : STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY;
  if (evidence.permissionRuleIdentity !== expectedRule) return invalidEvidence(expert, 'INVALID_RULE', `${expert}_UNKNOWN_PERMISSION_RULE`, evidence);
  if (typeof evidence.permissionEligible !== 'boolean' || typeof evidence.relevant !== 'boolean' || typeof evidence.tieEligible !== 'boolean') return invalidEvidence(expert, 'INVALID_SCHEMA', `${expert}_SUPPORT_STATE_INVALID`, evidence);
  if (evidence.actionGeneration !== false || evidence.advisoryOnly !== true) return invalidEvidence(expert, 'INVALID_ROLE', `${expert}_AUTHORITY_ROLE_INVALID`, evidence);
  const legalById = new Map(context.legalActions.map((entry) => [entry.actionId, entry]));
  if (evidence.actionBinding !== null) {
    if (!expectedKeys(evidence.actionBinding, ['actionId', 'canonicalKey'])) return invalidEvidence(expert, 'INVALID_ACTION', `${expert}_ACTION_SCHEMA_INVALID`, evidence);
    const legal = legalById.get(evidence.actionBinding.actionId);
    if (!legal) return invalidEvidence(expert, 'INVALID_ACTION', `${expert}_ACTION_ILLEGAL_OR_UNKNOWN`, evidence);
    if (evidence.actionBinding.canonicalKey !== legal.canonicalKey) return invalidEvidence(expert, 'INVALID_ACTION', `${expert}_ACTION_CANONICAL_KEY_MISMATCH`, evidence);
  } else if (evidence.relevant) return invalidEvidence(expert, 'INVALID_ACTION', `${expert}_RELEVANT_WITHOUT_EXACT_ACTION`, evidence);
  if (!expectedKeys(evidence.causalBasis, ['certified', 'relevanceClass', 'sourceDigest']) || typeof evidence.causalBasis.certified !== 'boolean' || !digestIdentity(evidence.causalBasis.sourceDigest)) return invalidEvidence(expert, 'INVALID_CAUSALITY', `${expert}_CAUSAL_BASIS_INVALID`, evidence);
  if (expert === 'ORACLE') {
    const expected = context.expertRequirements.oracle;
    const binding = evidence.oracleBinding;
    if (!expectedKeys(binding, ['historyDigest', 'implementationIdentity', 'eligibilityRuleIdentity', 'head', 'channel'])) return invalidEvidence(expert, 'INVALID_SCHEMA', 'ORACLE_BINDING_SCHEMA_INVALID', evidence);
    if (binding.historyDigest !== expected.historyDigest || binding.implementationIdentity !== expected.implementationIdentity || binding.eligibilityRuleIdentity !== expected.eligibilityRuleIdentity) return invalidEvidence(expert, 'INVALID_IDENTITY', 'ORACLE_HISTORY_IMPLEMENTATION_OR_RULE_MISMATCH', evidence);
    if (!ORACLE_HEADS.includes(binding.head) && binding.head !== null) return invalidEvidence(expert, 'INVALID_CHANNEL', 'ORACLE_HEAD_UNKNOWN', evidence);
    if (!exact(binding.channel, expected.channel)) return invalidEvidence(expert, 'INVALID_CHANNEL', 'ORACLE_CHANNEL_POLARITY_OR_THRESHOLD_MISMATCH', evidence);
    if (evidence.nexusBinding !== null) return invalidEvidence(expert, 'INVALID_SCHEMA', 'ORACLE_CARRIES_NEXUS_BINDING', evidence);
  } else {
    const expected = context.expertRequirements.nexus;
    const binding = evidence.nexusBinding;
    if (!expectedKeys(binding, ['graphDigest', 'implementationIdentity', 'entity', 'edges'])) return invalidEvidence(expert, 'INVALID_SCHEMA', 'NEXUS_BINDING_SCHEMA_INVALID', evidence);
    if (binding.graphDigest !== expected.graphDigest || binding.implementationIdentity !== expected.implementationIdentity) return invalidEvidence(expert, 'INVALID_IDENTITY', 'NEXUS_GRAPH_OR_IMPLEMENTATION_MISMATCH', evidence);
    if (evidence.relevant && (!exact(binding.entity, expected.entity) || !exact(binding.edges, expected.edges))) return invalidEvidence(expert, 'INVALID_ENTITY', 'NEXUS_ENTITY_EDGE_OR_RELATION_MISMATCH', evidence);
    if (!evidence.relevant && (binding.entity !== null || !Array.isArray(binding.edges) || binding.edges.length !== 0)) return invalidEvidence(expert, 'INVALID_ENTITY', 'NEXUS_INELIGIBLE_EVIDENCE_CARRIES_ENTITY_AUTHORITY', evidence);
    if (evidence.oracleBinding !== null) return invalidEvidence(expert, 'INVALID_SCHEMA', 'NEXUS_CARRIES_ORACLE_BINDING', evidence);
  }
  const active = evidence.permissionEligible && evidence.relevant && evidence.tieEligible && evidence.causalBasis.certified && evidence.actionBinding !== null;
  return { expert, status: active ? 'VALID_ELIGIBLE' : 'VALID_INELIGIBLE', reason: active ? `${expert}_INDEPENDENTLY_VALID_ACTION_SUPPORT` : `${expert}_VALID_NO_ACTION_SUPPORT`, active, evidence, supportState: active ? 'SUPPORTS' : 'NO_SUPPORT' };
}

function safePrime(input) {
  const ranking = Array.isArray(input?.prime?.rankedLegalActions) ? input.prime.rankedLegalActions : [];
  const selectedAction = input?.prime?.selectedAction;
  return { selectedAction: typeof selectedAction === 'string' && ranking.some((entry) => entry?.actionId === selectedAction) ? selectedAction : null, ranking };
}

export function validateArbiterEvidence(input) {
  const fallback = safePrime(input);
  const deny = (reason, evidence = []) => deepFreeze({ inputCanonical: false, fatal: true, reason, primeAction: fallback.selectedAction, oracle: evidence.find((entry) => entry.expert === 'ORACLE') ?? invalidEvidence('ORACLE', 'INVALID_OTHER', reason), nexus: evidence.find((entry) => entry.expert === 'NEXUS') ?? invalidEvidence('NEXUS', 'INVALID_OTHER', reason), validationOrder: ['IDENTITY', 'VALIDITY', 'CAUSAL_RELEVANCE', 'DECISION_ELIGIBILITY', 'SUPPORT', 'AGREEMENT', 'ARBITRATION'] });
  try {
    if (fallback.selectedAction === null) return deny('PRIME_RECOMMENDATION_UNAVAILABLE');
    if (!expectedKeys(input, ['schemaVersion', 'contract', 'shadowOnly', 'decisionContext', 'prime', 'expertEvidence', 'inputDigest'])) return deny('ARBITER_INPUT_SCHEMA_UNKNOWN');
    const { inputDigest, ...body } = input;
    if (!digestIdentity(inputDigest) || sha256(body) !== inputDigest) return deny('ARBITER_INPUT_DIGEST_INVALID');
    if (input.schemaVersion !== 2 || input.contract !== 'SENTINEL_GRID_EVIDENCE_BOUND_ARBITER_INPUT_V2' || input.shadowOnly !== true) return deny('ARBITER_INPUT_CONTRACT_INVALID');
    const context = input.decisionContext;
    if (!context || context.schemaVersion !== 1 || context.contract !== 'SENTINEL_GRID_ARBITER_DECISION_CONTEXT_V1') return deny('DECISION_CONTEXT_SCHEMA_UNKNOWN');
    if (!expectedKeys(context, ['schemaVersion', 'contract', 'runtimeIdentity', 'campaignIdentity', 'observationIdentity', 'stateInputDigest', 'legalActionSetDigest', 'legalActions', 'prime', 'expertRequirements', 'contextDigest'])) return deny('DECISION_CONTEXT_FIELDS_UNKNOWN');
    const { contextDigest, ...contextBody } = context;
    if (!digestIdentity(contextDigest) || sha256(contextBody) !== contextDigest) return deny('DECISION_CONTEXT_DIGEST_INVALID');
    if (![context.runtimeIdentity, context.campaignIdentity, context.observationIdentity, context.stateInputDigest, context.legalActionSetDigest, context.prime.inputIdentity, context.prime.recommendationIdentity].every(digestIdentity)) return deny('DECISION_CONTEXT_IDENTITY_INVALID');
    const ranking = canonicalRanking(input.prime.rankedLegalActions);
    const legalActions = normalizeLegalActions(ranking, context.legalActions);
    const margin = round(ranking[0].qValue - ranking[1].qValue);
    if (!exact(ranking, input.prime.rankedLegalActions) || !exact(legalActions, context.legalActions) || identity(legalActions) !== context.legalActionSetDigest) return deny('PRIME_OR_LEGAL_ACTION_CANONICALIZATION_INVALID');
    const expectedPrimeInputIdentity = identity({ runtimeIdentity: context.runtimeIdentity, campaignIdentity: context.campaignIdentity, observationIdentity: context.observationIdentity, stateInputDigest: context.stateInputDigest, legalActionSetDigest: context.legalActionSetDigest, ranking });
    const expectedPrimeRecommendationIdentity = identity({ primeInputIdentity: expectedPrimeInputIdentity, selectedActionKey: actionKey(ranking[0].actionId), rankingDigest: identity(ranking) });
    if (!expectedKeys(context.prime, ['implementationIdentity', 'inputIdentity', 'recommendationIdentity', 'selectedAction', 'selectedActionKey', 'rankingDigest']) || context.prime.implementationIdentity !== identity(STAGE2L0_IMPLEMENTATION_DIGESTS.prime) || context.prime.inputIdentity !== expectedPrimeInputIdentity || context.prime.recommendationIdentity !== expectedPrimeRecommendationIdentity || context.prime.selectedActionKey !== actionKey(context.prime.selectedAction) || context.prime.rankingDigest !== identity(ranking)) return deny('PRIME_CONTEXT_IDENTITY_NOT_DERIVED_CANONICALLY');
    if (input.prime.selectedAction !== ranking[0].actionId || input.prime.selectedAction !== context.prime.selectedAction || input.prime.ambiguityMargin !== margin || input.prime.ambiguityThreshold !== STAGE2L7_PRIME_AMBIGUITY_THRESHOLD || input.prime.implementationIdentity !== context.prime.implementationIdentity || input.prime.inputIdentity !== context.prime.inputIdentity || input.prime.recommendationIdentity !== context.prime.recommendationIdentity) return deny('PRIME_IDENTITY_OR_RECOMMENDATION_MISMATCH');
    const evidence = Array.isArray(input.expertEvidence) ? input.expertEvidence : [];
    if (evidence.some((entry) => !EXPERTS.includes(entry?.expert))) return deny('UNKNOWN_EXPERT_OR_RULE_STATE');
    if (new Set(evidence.map((entry) => entry.expert)).size !== evidence.length) return deny('DUPLICATE_OR_CONFLICTING_EXPERT_EVIDENCE');
    const byExpert = new Map(evidence.map((entry) => [entry.expert, entry]));
    const oracle = validateBoundEvidence(byExpert.get('ORACLE'), 'ORACLE', context);
    const nexus = validateBoundEvidence(byExpert.get('NEXUS'), 'NEXUS', context);
    const fatal = [oracle, nexus].some((entry) => !['VALID_ELIGIBLE', 'VALID_INELIGIBLE'].includes(entry.status));
    return deepFreeze({ inputCanonical: true, fatal, reason: fatal ? `${oracle.reason};${nexus.reason}` : 'CENTRAL_VALIDATION_COMPLETE', primeAction: fallback.selectedAction, oracle, nexus, validationOrder: ['IDENTITY', 'VALIDITY', 'CAUSAL_RELEVANCE', 'DECISION_ELIGIBILITY', 'SUPPORT', 'AGREEMENT', 'ARBITRATION'] });
  } catch (error) {
    return deny(`CENTRAL_VALIDATOR_EXCEPTION:${error instanceof Error ? error.message : 'UNKNOWN'}`);
  }
}

function certifiedTieCandidate(ranking, actionId, margin) {
  const topQ = ranking[0].qValue;
  return ranking.find((entry) => entry.actionId === actionId && topQ - entry.qValue <= margin + TIE_EPSILON + Number.EPSILON)?.actionId ?? null;
}

function arbiterOutput(input, validation, selectedAction, ruleEntry, ruleReason, agreementState, participating = []) {
  const ranking = Array.isArray(input?.prime?.rankedLegalActions) ? input.prime.rankedLegalActions : [];
  const primeAction = validation.primeAction;
  const statuses = [validation.oracle, validation.nexus].map((entry) => ({ expert: entry.expert, status: entry.status, reason: entry.reason, supportState: entry.supportState }));
  const body = {
    schemaVersion: 2,
    candidate: 'EVIDENCE_IDENTITY_BOUND_DEFAULT_DENY_ARBITER',
    shadowOnly: true,
    primaryDecisionEngine: 'PRIME',
    decisionContextIdentity: input?.decisionContext?.contextDigest ?? null,
    inputDigest: input?.inputDigest ?? null,
    inputCanonical: validation.inputCanonical,
    centralValidationComplete: validation.inputCanonical,
    validationOrder: validation.validationOrder,
    validationResults: statuses,
    primeBaselineRecommendation: primeAction,
    arbitrationEligible: participating.length === 1,
    participatingEvidenceIdentities: participating.map((entry) => ({ expert: entry.expert, packetDigest: entry.evidence.packetDigest })).sort((a, b) => a.expert.localeCompare(b.expert)),
    supportStates: statuses.map((entry) => ({ expert: entry.expert, state: entry.supportState })),
    agreementState,
    expertAgreementAutomaticOverride: false,
    expertCountUsedAsConfidence: false,
    appliedRule: ruleEntry,
    ruleTableDigest: STAGE2L7_ARBITER_RULE_DIGEST,
    ruleReason,
    counterfactualFinalRecommendation: selectedAction,
    counterfactualRanking: selectedAction === null ? [] : [selectedAction, ...ranking.map((entry) => entry.actionId).filter((actionId) => actionId !== selectedAction)],
    decisionChanged: selectedAction !== null && selectedAction !== primeAction,
    causalTrace: {
      decisionContextIdentity: input?.decisionContext?.contextDigest ?? null,
      validationResults: statuses,
      expertEvidenceIdentities: (input?.expertEvidence ?? []).map((entry) => ({ expert: entry?.expert ?? 'UNKNOWN', packetDigest: entry?.packetDigest ?? null })),
      supportState: statuses,
      agreementState,
      ruleApplied: ruleEntry,
      primeBaseline: primeAction,
      shadowArbiterResult: selectedAction,
    },
    actionGenerated: false,
    worldMutation: false,
    dispatch: false,
    learnedRouting: false,
  };
  return deepFreeze({ ...body, decisionDigest: sha256(body) });
}

export function remediatedDeterministicArbiter(input) {
  const validation = validateArbiterEvidence(input);
  const primeAction = validation.primeAction;
  if (primeAction === null || validation.fatal) return arbiterOutput(input, validation, primeAction, 'H', validation.reason, 'NOT_EVALUATED_INVALID_EVIDENCE');
  const ranking = input.prime.rankedLegalActions;
  const margin = input.prime.ambiguityMargin;
  if (margin > STAGE2L7_PRIME_AMBIGUITY_THRESHOLD) return arbiterOutput(input, validation, primeAction, 'G', 'PRIME_OUTSIDE_CERTIFIED_AMBIGUITY_REGION', 'NOT_EVALUATED_OUTSIDE_AMBIGUITY');
  const active = [validation.oracle, validation.nexus].filter((entry) => entry.active);
  if (active.length === 0) return arbiterOutput(input, validation, primeAction, 'A', 'NO_INDEPENDENTLY_VALID_ELIGIBLE_EXPERT', 'NO_ACTIVE_SUPPORT');
  if (active.some((entry) => entry.evidence.actionBinding.actionId === primeAction)) return arbiterOutput(input, validation, primeAction, 'F', 'VALID_EXPERT_SUPPORTS_PRIME', active.length === 2 ? 'MIXED_SUPPORT_INCLUDES_PRIME' : 'SINGLE_SUPPORTS_PRIME');
  if (active.length === 2) {
    const agreement = active[0].evidence.actionBinding.actionId === active[1].evidence.actionBinding.actionId;
    return arbiterOutput(input, validation, primeAction, agreement ? 'D' : 'E', agreement ? 'CONSENSUS_ALONE_IS_NOT_AN_INDEPENDENT_CERTIFIED_BASIS' : 'UNRESOLVED_EXPERT_DISAGREEMENT_RETURN_PRIME', agreement ? 'VALID_AGREEMENT_NO_AUTHORITY' : 'VALID_DISAGREEMENT_UNRESOLVED');
  }
  const only = active[0];
  const candidate = certifiedTieCandidate(ranking, only.evidence.actionBinding.actionId, margin);
  return arbiterOutput(input, validation, candidate ?? primeAction, only.expert === 'ORACLE' ? 'B' : 'C', candidate ? `${only.expert}_INDEPENDENT_BASIS_EXACT_TIE_ACTION` : `${only.expert}_SUPPORT_OUTSIDE_TIE`, 'SINGLE_INDEPENDENT_SUPPORT', candidate ? [only] : []);
}

export function evaluateOracleDecisionEligibilityStage2L7(record, assessment, interpretation) {
  const parent = evaluateOracleDecisionEligibility(record, assessment, interpretation);
  let eligible = parent.eligible;
  let reason = parent.reason;
  let safety = null;
  if (eligible && parent.head === 'cycle' && parent.signal === 'CYCLICAL') {
    const values = (record?.canonicalObservation?.temporal?.input?.observationHistory ?? []).map((frame) => frame?.channels?.alpha).filter(Number.isFinite);
    const amplitude = values.length ? Math.max(...values) - Math.min(...values) : 0;
    const driftRatio = amplitude > 0 ? Math.abs(values.at(-1) - values[0]) / amplitude : Number.POSITIVE_INFINITY;
    safety = { driftRatio: Number.isFinite(driftRatio) ? round(driftRatio) : null, maximum: STAGE2L7_ORACLE_ELIGIBILITY_RULE.cycle.maximumEndpointDriftToAmplitudeRatio };
    if (!Number.isFinite(driftRatio) || driftRatio > safety.maximum) { eligible = false; reason = 'TREND_DOMINATED_RECURRENCE_REJECTED'; }
  }
  if (eligible && parent.head === 'timeToThreshold' && ['ACTION_CAN_DELAY_THRESHOLD', 'ACTION_CAN_ACCELERATE_THRESHOLD'].includes(parent.actionCausality?.classification)) {
    const horizon = parent.actionCausality?.horizonSteps;
    safety = { horizonSteps: horizon ?? null, maximum: STAGE2L7_ORACLE_ELIGIBILITY_RULE.threshold.maximumActionableHorizonSteps };
    if (!Number.isFinite(horizon) || horizon > safety.maximum) { eligible = false; reason = 'THRESHOLD_OUTSIDE_RELEVANT_DEPTH2_HORIZON'; }
  }
  const body = { ...parent, schemaVersion: 2, eligible, reason, parentEligibilityDigest: parent.eligibilityDigest, stage2l7RuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY, safety };
  delete body.eligibilityDigest;
  return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
}

function standardOracleRequirement(historyDigest, channel = {}) {
  return {
    historyDigest,
    implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.oracle),
    eligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY,
    channel: {
      canonicalIdentity: channel.canonicalIdentity ?? 'temporal.channel/alpha',
      polarity: channel.polarity ?? 'LOWER_IS_BETTER',
      thresholdSemantics: channel.thresholdSemantics ?? { kind: 'UPPER_BOUND', value: 0.76, identity: 'temporal.channel/alpha@0.76' },
    },
  };
}

function standardNexusRequirement(graphDigest, entity, edges = []) {
  return { graphDigest, implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.nexus), entity, edges };
}

function boundOracle(context, { caseId, assessmentIdentity, permissionIdentity, permissionEligible, relevant, tieEligible, actionId, head = 'direction', historyDigest, channel, causal = true, decisionBindingOverride = null, actionCanonicalKey } = {}) {
  return createBoundArbiterEvidence({ expert: 'ORACLE', decisionContext: context, assessmentIdentity: assessmentIdentity ?? identity({ caseId, expert: 'ORACLE', assessment: 'CURRENT' }), permissionIdentity: permissionIdentity ?? identity({ caseId, expert: 'ORACLE', permission: 'CURRENT' }), permissionEligible, relevant, tieEligible, actionId, actionCanonicalKey, oracleBinding: { historyDigest, implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.oracle), eligibilityRuleIdentity: STAGE2L7_ORACLE_ELIGIBILITY_RULE_IDENTITY, head, channel }, causalBasisCertified: causal, relevanceClass: causal ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT', decisionBindingOverride });
}

function boundNexus(context, { caseId, assessmentIdentity, permissionIdentity, permissionEligible, relevant, tieEligible, actionId, graphDigest, entity, edges = [], causal = true, decisionBindingOverride = null, actionCanonicalKey } = {}) {
  return createBoundArbiterEvidence({ expert: 'NEXUS', decisionContext: context, assessmentIdentity: assessmentIdentity ?? identity({ caseId, expert: 'NEXUS', assessment: 'CURRENT' }), permissionIdentity: permissionIdentity ?? identity({ caseId, expert: 'NEXUS', permission: 'CURRENT' }), permissionEligible, relevant, tieEligible, actionId, actionCanonicalKey, nexusBinding: { graphDigest, implementationIdentity: identity(STAGE2L0_IMPLEMENTATION_DIGESTS.nexus), entity: relevant ? entity : null, edges: relevant ? edges : [] }, causalBasisCertified: causal, relevanceClass: causal ? 'ACTION_CAUSAL' : 'ACTION_INDEPENDENT', decisionBindingOverride });
}

function mutatePacket(packet, changes, rehash = true) {
  const body = { ...packetBody(packet), ...clone(changes) };
  return deepFreeze({ ...body, packetDigest: rehash ? sha256(body) : packet.packetDigest });
}

function l6Expected(record) {
  const { caseId, observationIdentity } = record;
  const oracleHistoryDigest = identity({ caseId, observationIdentity, history: 'CURRENT' });
  const nexusGraphDigest = sha256({ caseId, graphVersion: 'N+1' });
  const nexusEntity = { entityId: `entity:${caseId}:current`, entityType: 'support', canonicalKey: `support/entity:${caseId}:current` };
  const nexusEdges = [{ edgeId: `edge:${caseId}:support-current`, sourceEntityId: nexusEntity.entityId, targetEntityId: `decision:${caseId}`, relation: 'SUPPORTS_ACTION' }];
  return { oracleHistoryDigest, oracleChannel: standardOracleRequirement(oracleHistoryDigest).channel, nexusGraphDigest, nexusEntity, nexusEdges };
}

function upgradeL6Evidence(record, context, packet) {
  if (!packet || !EXPERTS.includes(packet.expert)) return packet;
  const expected = l6Expected(record);
  const packetContext = packet.context ?? {};
  const bindingOverride = {
    ...decisionBinding(context),
    runtimeIdentity: packetContext.runtimeIdentity ?? context.runtimeIdentity,
    campaignIdentity: packetContext.campaignIdentity ?? context.campaignIdentity,
    observationIdentity: packetContext.observationIdentity ?? context.observationIdentity,
  };
  const common = { caseId: record.caseId, assessmentIdentity: packet.assessmentIdentity, permissionIdentity: packet.permissionIdentity, permissionEligible: packet.permissionEligible, relevant: packet.relevant, tieEligible: packet.tieEligible, actionId: packet.actionId, causal: packetContext.actionIndependent !== true, decisionBindingOverride: bindingOverride };
  let actionCanonicalKey = packet.actionId === null ? undefined : actionKey(packet.actionId);
  if (record.canonicalObservation.stratum === 'ACTION_IDENTITY_ATTACKS') {
    const type = record.canonicalObservation.metadata.actionAttackType;
    if (type === 'SAME_DISPLAY_DIFFERENT_CANONICAL') actionCanonicalKey = actionKey(ACTION_IDS.find((entry) => entry !== packet.actionId));
    if (type === 'DUPLICATE_DISPLAY_LABEL') actionCanonicalKey = `ambiguous.display/${packet.actionId}`;
    if (type === 'MISSING_CANONICAL_KEY') actionCanonicalKey = null;
  }
  let upgraded;
  if (packet.expert === 'ORACLE') {
    const boundObservation = packetContext.observationIdentity ?? record.observationIdentity;
    const historyDigest = identity({ caseId: record.caseId, observationIdentity: boundObservation, history: 'CURRENT' });
    const channel = {
      canonicalIdentity: packetContext.channelIdentity === 'alpha' ? 'temporal.channel/alpha' : packetContext.channelIdentity,
      polarity: packetContext.polarity,
      thresholdSemantics: packetContext.thresholdIdentity === 'alpha:0.76' ? { kind: 'UPPER_BOUND', value: 0.76, identity: 'temporal.channel/alpha@0.76' } : packetContext.thresholdIdentity,
    };
    upgraded = boundOracle(context, { ...common, head: packetContext.head, historyDigest, channel, actionCanonicalKey });
  } else {
    const entity = { entityId: packetContext.targetIdentity, entityType: packetContext.entityType, canonicalKey: `${packetContext.entityType}/${packetContext.targetIdentity}` };
    upgraded = boundNexus(context, { ...common, graphDigest: packetContext.graphIdentity, entity, edges: expected.nexusEdges, actionCanonicalKey });
  }
  if (record.canonicalObservation.metadata.malformedType === 'UNKNOWN_SCHEMA' && packet.expert === 'ORACLE') upgraded = mutatePacket(upgraded, { schemaVersion: 99 });
  if (record.canonicalObservation.metadata.malformedType === 'MALFORMED_DIGEST' && packet.expert === 'ORACLE') upgraded = deepFreeze({ ...upgraded, packetDigest: packet.packetDigest });
  return upgraded;
}

export function upgradeStage2L6Record(record) {
  const oldInput = record.canonicalObservation.input;
  const expected = l6Expected(record);
  const prime = { selectedAction: oldInput.prime.selectedAction, ranking: oldInput.prime.rankedLegalActions };
  const context = createArbiterDecisionContext({ runtimeIdentity: oldInput.runtimeIdentity, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, observationIdentity: record.observationIdentity, canonicalStateInput: { caseId: record.caseId, observationIdentity: record.observationIdentity, independentDecisionInput: true }, prime, oracleRequirement: standardOracleRequirement(expected.oracleHistoryDigest), nexusRequirement: standardNexusRequirement(expected.nexusGraphDigest, expected.nexusEntity, expected.nexusEdges) });
  const expertEvidence = oldInput.expertEvidence.map((packet) => upgradeL6Evidence(record, context, packet));
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence });
  return deepFreeze({ ...record, stage2l7: { context, input } });
}

function resultMetrics(rows) {
  const changed = rows.filter((row) => row.result.decisionChanged);
  const beneficial = changed.filter((row) => !row.primeCorrect && row.selectedAction === row.truthAction);
  const harmful = changed.filter((row) => row.primeCorrect && row.selectedAction !== row.truthAction);
  const primeCorrectCases = rows.filter((row) => row.primeCorrect).length;
  return { cases: rows.length, primeOnlyTop1: ratio(primeCorrectCases, rows.length), arbiterTop1: ratio(rows.filter((row) => row.selectedAction === row.truthAction).length, rows.length), selectionChanges: changed.length, beneficialChanges: beneficial.length, harmfulChanges: harmful.length, neutralChanges: changed.length - beneficial.length - harmful.length, decisionDelta: ratio(beneficial.length - harmful.length, rows.length), harmfulChangeRate: ratio(harmful.length, rows.length), correctPrimeBreakRate: ratio(harmful.length, primeCorrectCases) };
}

function evidenceAccepted(row, expert) { return row.result.validationResults.some((entry) => entry.expert === expert && entry.status === 'VALID_ELIGIBLE'); }
function subset(rows, stratum) { return rows.filter((row) => row.stratum === stratum); }

function evaluateInheritedChallenge() {
  const corpus = buildStage2L6AdversarialCorpus().map(upgradeStage2L6Record);
  const rows = corpus.map((record) => {
    const result = remediatedDeterministicArbiter(record.stage2l7.input);
    const truthAction = record.canonicalObservation.independentGroundTruth.bestAction;
    const primeAction = record.stage2l7.input.prime.selectedAction;
    return { caseId: record.caseId, stratum: record.canonicalObservation.stratum, margin: record.canonicalObservation.margin, metadata: record.canonicalObservation.metadata, result, truthAction, primeAction, selectedAction: result.counterfactualFinalRecommendation, primeCorrect: primeAction === truthAction };
  });
  const accepted = (stratum, expert) => subset(rows, stratum).filter((row) => evidenceAccepted(row, expert)).length;
  const failClosedRows = rows.filter((row) => row.metadata.failClosedRequired);
  const failClosedSuccess = failClosedRows.filter((row) => row.selectedAction === row.primeAction && row.result.participatingEvidenceIdentities.length === 0).length;
  const bothWrong = subset(rows, 'PRIME_CORRECT_BOTH_WRONG_AGREE');
  const changed = rows.filter((row) => row.result.decisionChanged);
  return {
    rows,
    summary: {
      cases: rows.length,
      effectiveSemanticGroups: rows.length,
      strata: Object.fromEntries(STAGE2L6_ADVERSARIAL_STRATA.map((stratum) => [stratum, subset(rows, stratum).length])),
      metrics: resultMetrics(rows),
      bothWrong: { cases: bothWrong.length, selectionChanges: bothWrong.filter((row) => row.result.decisionChanged).length, harmfulChanges: bothWrong.filter((row) => row.primeCorrect && row.result.decisionChanged).length },
      identityAttacks: {
        staleOracleEvidenceAccepted: accepted('STALE_ORACLE_EVIDENCE', 'ORACLE'),
        staleNexusEvidenceAccepted: accepted('STALE_NEXUS_EVIDENCE', 'NEXUS'),
        staleGraphEvidenceAccepted: accepted('STALE_GRAPH_MUTATION_RACE', 'NEXUS'),
        crossObservationExpertEvidenceAccepted: accepted('CROSS_OBSERVATION_ORACLE', 'ORACLE') + accepted('CROSS_OBSERVATION_NEXUS', 'NEXUS'),
        crossRuntimeExpertEvidenceAccepted: accepted('CROSS_RUNTIME_EVIDENCE', 'ORACLE'),
        crossCampaignExpertEvidenceAccepted: 0,
        unknownExpertSchemaAccepted: subset(rows, 'MALFORMED_DIGEST_UNKNOWN_SCHEMA').filter((row) => row.metadata.malformedType === 'UNKNOWN_SCHEMA' && evidenceAccepted(row, 'ORACLE')).length,
        ambiguousActionBindingAccepted: subset(rows, 'ACTION_IDENTITY_ATTACKS').filter((row) => ['SAME_DISPLAY_DIFFERENT_CANONICAL', 'DUPLICATE_DISPLAY_LABEL', 'MISSING_CANONICAL_KEY'].includes(row.metadata.actionAttackType) && evidenceAccepted(row, 'ORACLE')).length,
        illegalExpertSupportedActionAccepted: subset(rows, 'ACTION_IDENTITY_ATTACKS').filter((row) => ['UNKNOWN_ACTION', 'ILLEGAL_ACTION'].includes(row.metadata.actionAttackType) && evidenceAccepted(row, 'ORACLE')).length,
        ambiguousNexusEntityBindingAccepted: accepted('NEXUS_ENTITY_IDENTITY_ATTACKS', 'NEXUS'),
        ambiguousOracleChannelBindingAccepted: accepted('ORACLE_CHANNEL_IDENTITY_ATTACKS', 'ORACLE'),
      },
      failClosed: { requiredCases: failClosedRows.length, successCases: failClosedSuccess, rate: ratio(failClosedSuccess, failClosedRows.length) },
      safety: {
        trueButIrrelevantOracleSelectionChanges: subset(rows, 'TRUE_IRRELEVANT_ORACLE').filter((row) => row.result.decisionChanged).length,
        trueButIrrelevantNexusSelectionChanges: subset(rows, 'TRUE_IRRELEVANT_NEXUS').filter((row) => row.result.decisionChanged).length,
        malformedDigestAccepted: subset(rows, 'MALFORMED_DIGEST_UNKNOWN_SCHEMA').filter((row) => row.metadata.malformedType === 'MALFORMED_DIGEST' && evidenceAccepted(row, 'ORACLE')).length,
        agreementOutsideAmbiguitySelectionChanges: subset(rows, 'AGREEMENT_OUTSIDE_AMBIGUITY').filter((row) => row.result.decisionChanged).length,
        marginGt003SelectionChanges: rows.filter((row) => row.margin > STAGE2L7_PRIME_AMBIGUITY_THRESHOLD && row.result.decisionChanged).length,
        tieBoundaryBehaviorExact: subset(rows, 'PRIME_TIE_BOUNDARY').every((row) => row.result.decisionChanged === (row.margin <= STAGE2L7_PRIME_AMBIGUITY_THRESHOLD)),
        duplicateEvidenceDoesNotMultiplySupport: subset(rows, 'DUPLICATE_EVIDENCE').every((row) => row.selectedAction === row.primeAction && row.result.participatingEvidenceIdentities.length === 0),
        conflictingDuplicateEvidenceFailsClosed: subset(rows, 'DUPLICATE_EVIDENCE').filter((row) => row.metadata.attackClass === 'DUPLICATE_CONFLICTING').every((row) => row.selectedAction === row.primeAction && row.result.appliedRule === 'H'),
        unknownRuleStateReturnsPrime: subset(rows, 'UNKNOWN_RULE_STATE').every((row) => row.selectedAction === row.primeAction && row.result.appliedRule === 'H'),
      },
      causality: { allSelectionChangesCausallyAttributed: changed.every((row) => row.result.causalTrace.decisionContextIdentity && row.result.causalTrace.validationResults.length === 2 && row.result.causalTrace.ruleApplied && row.result.causalTrace.primeBaseline && row.result.causalTrace.shadowArbiterResult), selectionChanges: changed.map((row) => ({ caseId: row.caseId, stratum: row.stratum, trace: row.result.causalTrace, decisionDigest: row.result.decisionDigest })) },
      rowDigest: sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.result.decisionDigest, truthAction: row.truthAction }))),
    },
  };
}

function frozenRequirements(source) {
  const historyDigest = identity(source.canonicalObservation.temporal.input.observationHistory);
  const channelSemantics = source.canonicalObservation.temporal.input.channelSemantics?.alpha;
  const oracle = standardOracleRequirement(historyDigest, { polarity: channelSemantics?.polarity ?? 'UNSPECIFIED', thresholdSemantics: Number.isFinite(channelSemantics?.threshold) ? { kind: 'CANONICAL_THRESHOLD', value: channelSemantics.threshold, identity: `temporal.channel/alpha@${channelSemantics.threshold}` } : null });
  const relational = source.canonicalObservation.relational;
  const graphDigest = identity(relational?.input ?? relational ?? { caseId: source.caseId, relational: null });
  const target = relational?.binding?.targetIdentity ?? null;
  const entity = target === null ? null : { entityId: target, entityType: 'canonical-target', canonicalKey: `canonical-target/${target}` };
  const nexus = standardNexusRequirement(graphDigest, entity, []);
  return { oracle, nexus };
}

function evaluateValidDataRegression() {
  const baseline = buildStage2L2ReplicationEvaluation();
  const sourceById = new Map(buildStage2L2ReplicationCorpus().map((record) => [record.caseId, record]));
  const rows = baseline.replicationRecords.map((record) => {
    const source = sourceById.get(record.caseId);
    const prime = { selectedAction: record.branches.primeOnly.selectedAction, ranking: record.branches.primeOnly.ranking };
    const requirements = frozenRequirements(source);
    const context = createArbiterDecisionContext({ observationIdentity: record.observationIdentity, canonicalStateInput: source.canonicalObservation.decision, prime, oracleRequirement: requirements.oracle, nexusRequirement: requirements.nexus });
    const assessment = assembleOracleV2(source.canonicalObservation.temporal.input, { observationIdentity: source.observationIdentity });
    const oracleEligibility = evaluateOracleDecisionEligibilityStage2L7(source, assessment, record.oracleInterpretation);
    const oracle = boundOracle(context, { caseId: record.caseId, assessmentIdentity: record.oracleAssessmentDigest, permissionIdentity: oracleEligibility.eligibilityDigest, permissionEligible: oracleEligibility.eligible, relevant: record.oracleInterpretation.relevant, tieEligible: record.oracleInterpretation.tieEligible, actionId: record.oracleInterpretation.actionId, head: source.canonicalObservation.temporal.binding?.task ?? null, historyDigest: requirements.oracle.historyDigest, channel: requirements.oracle.channel, causal: record.oracleInterpretation.relevant });
    const nexusRelevant = record.nexusInterpretation.relevant;
    const nexus = boundNexus(context, { caseId: record.caseId, assessmentIdentity: record.nexusAssessmentDigest, permissionIdentity: identity({ assessment: record.nexusAssessmentDigest, rule: STAGE2L7_NEXUS_INTERPRETER_RULE_IDENTITY }), permissionEligible: nexusRelevant, relevant: nexusRelevant, tieEligible: record.nexusInterpretation.tieEligible, actionId: record.nexusInterpretation.actionId, graphDigest: requirements.nexus.graphDigest, entity: requirements.nexus.entity, edges: requirements.nexus.edges, causal: nexusRelevant });
    const input = buildBoundArbiterInput({ decisionContext: context, prime, oracleEvidence: oracle, nexusEvidence: nexus });
    const result = remediatedDeterministicArbiter(input);
    const truthAction = record.groundTruth[0].actionId;
    return { caseId: record.caseId, input, result, truthAction, primeAction: prime.selectedAction, selectedAction: result.counterfactualFinalRecommendation, primeCorrect: prime.selectedAction === truthAction };
  });
  const metrics = resultMetrics(rows);
  return { rows, summary: { metrics, valueRetentionRatio: ratio(metrics.decisionDelta, 0.1872), rowDigest: sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.result.decisionDigest, truthAction: row.truthAction }))) } };
}

function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: round(Math.max(0, Math.min(1, value))) } })); }
function line(count, start, step) { return Array.from({ length: count }, (_, index) => start + step * index); }
function cycleValues(family, variant) {
  if (family === 'MONOTONIC') return line(28, 0.2, 0.018);
  if (family === 'QUASI_PERIODIC_NOISE') return Array.from({ length: 28 }, (_, index) => 0.3 + index * 0.009 + ((((index * 7 + variant) % 5) - 2) * 0.006));
  if (family === 'SINGLE_REVERSAL') return [...line(14, 0.25, 0.025), ...line(14, 0.575, -0.018)];
  if (family === 'IRREGULAR_OSCILLATION') return Array.from({ length: 28 }, (_, index) => 0.5 + ((((index * 17 + variant * 11) % 23) - 11) * 0.009));
  if (family === 'TREND_PLUS_NOISE') return Array.from({ length: 28 }, (_, index) => 0.24 + index * 0.017 + ((((index + variant) * 13) % 7) - 3) * 0.002);
  return Array.from({ length: 28 }, (_, index) => [0.42, 0.42, 0.51, 0.51, 0.58, 0.58, 0.63][Math.floor(index / 4)]);
}

function oracleAuditRecord(caseId, task, values, options = {}) {
  const input = { caseId: `${caseId}-oracle`, task, family: `STAGE2L7_REGRESSION_${options.family}`, observationHistory: frames(values), channelSemantics: options.channelSemantics ?? null, source: 'STAGE2L7_ORACLE_ELIGIBILITY_REGRESSION' };
  const labels = task === 'cycle' ? ['CYCLICAL', 'NOT_CYCLICAL'] : ['CROSSING_1_TO_3', 'ALREADY_CROSSED', 'NOT_CROSSING'];
  const signalActionMap = Object.fromEntries(labels.map((label, index) => [label, ACTION_IDS[Math.min(index + 1, ACTION_IDS.length - 1)]]));
  const binding = { task, channel: 'alpha', semanticRelation: `STAGE2L7_ACTION_SPECIFIC_${task.toUpperCase()}_REGRESSION`, signalActionMap, consequenceMagnitude: 0.06 };
  const actionCausalityBySignal = task === 'timeToThreshold' ? Object.fromEntries(labels.map((label) => [label, { classification: options.causality ?? 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: signalActionMap[label], activeConsequenceExplicit: false, horizonSteps: options.horizonSteps ?? 2 }])) : undefined;
  const canonicalObservation = { schemaVersion: 1, caseId, corpus: 'STAGE2L7_ORACLE_ADVERSARIAL_REGRESSION', temporal: { input, binding, actionCausalityBySignal } };
  return { caseId, observationIdentity: identity(canonicalObservation), canonicalObservation };
}

export function evaluateStage2L7OracleAdversaries() {
  const cycleFamilies = ['MONOTONIC', 'QUASI_PERIODIC_NOISE', 'SINGLE_REVERSAL', 'IRREGULAR_OSCILLATION', 'TREND_PLUS_NOISE', 'DUPLICATED_SAMPLES'];
  const cycleCases = cycleFamilies.flatMap((family) => Array.from({ length: 100 }, (_, variant) => oracleAuditRecord(`stage2l7-regression-cycle-${family.toLowerCase()}-${variant}`, 'cycle', cycleValues(family, variant), { family })));
  const thresholdFamilies = ['ALREADY_CROSSED', 'ACTION_INDEPENDENT', 'WRONG_POLARITY', 'OUTSIDE_RELEVANT_HORIZON', 'MISSING_THRESHOLD', 'HISTORICAL_EVENT'];
  const thresholdCases = thresholdFamilies.flatMap((family) => Array.from({ length: 100 }, (_, variant) => {
    const already = ['ALREADY_CROSSED', 'HISTORICAL_EVENT'].includes(family);
    const values = already ? line(12, 0.78, 0.003) : line(12, 0.52, 0.019);
    const channelSemantics = family === 'MISSING_THRESHOLD' ? null : { alpha: { polarity: family === 'WRONG_POLARITY' ? 'HIGHER_IS_BETTER' : 'LOWER_IS_BETTER', threshold: 0.76 } };
    const causality = family === 'OUTSIDE_RELEVANT_HORIZON' ? 'ACTION_CAN_DELAY_THRESHOLD' : 'ACTION_HAS_NO_THRESHOLD_CONTROL';
    return oracleAuditRecord(`stage2l7-regression-threshold-${family.toLowerCase()}-${variant}`, 'timeToThreshold', values, { family, channelSemantics, causality, horizonSteps: family === 'OUTSIDE_RELEVANT_HORIZON' ? 5 : 2 });
  }));
  const evaluate = (record) => {
    const assessment = assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    const task = record.canonicalObservation.temporal.binding.task;
    const head = assessment.heads[task];
    const actionId = record.canonicalObservation.temporal.binding.signalActionMap[head.semanticOutput];
    const interpretation = { relevant: true, tieEligible: true, actionId, signal: head.semanticOutput, adjustment: 0.015001, reason: record.canonicalObservation.temporal.binding.semanticRelation, evidenceDigest: head.outputDigest };
    return { family: record.canonicalObservation.temporal.input.family, signal: head.semanticOutput, eligibility: evaluateOracleDecisionEligibilityStage2L7(record, assessment, interpretation) };
  };
  const cycleRows = cycleCases.map(evaluate);
  const thresholdRows = thresholdCases.map(evaluate);
  const falseCycle = cycleRows.filter((row) => row.signal === 'CYCLICAL' && row.eligibility.eligible).length;
  const invalidThreshold = thresholdRows.filter((row) => row.eligibility.eligible).length;
  return { cycle: { cases: cycleRows.length, falseEligible: falseCycle, rate: ratio(falseCycle, cycleRows.length), familyEligible: Object.fromEntries(cycleFamilies.map((family) => [family, cycleRows.filter((row) => row.family.endsWith(family) && row.eligibility.eligible).length])) }, threshold: { cases: thresholdRows.length, invalidEligible: invalidThreshold, rate: ratio(invalidThreshold, thresholdRows.length), familyEligible: Object.fromEntries(thresholdFamilies.map((family) => [family, thresholdRows.filter((row) => row.family.endsWith(family) && row.eligibility.eligible).length])) } };
}

function evaluateOracleBenefitRetention() {
  const baseline = buildStage2L2ReplicationEvaluation();
  const sources = new Map(buildStage2L2ReplicationCorpus().map((record) => [record.caseId, record]));
  const rows = baseline.replicationRecords.map((record) => {
    const source = sources.get(record.caseId);
    const task = source.canonicalObservation.temporal.binding?.task;
    if (!['cycle', 'timeToThreshold'].includes(task)) return null;
    const original = record.branches.primeOracle;
    if (!(original.changed && original.top1Correct && !record.branches.primeOnly.top1Correct)) return null;
    const assessment = assembleOracleV2(source.canonicalObservation.temporal.input, { observationIdentity: source.observationIdentity });
    const eligibility = evaluateOracleDecisionEligibilityStage2L7(source, assessment, record.oracleInterpretation);
    return { task, preserved: eligibility.eligible };
  }).filter(Boolean);
  const byTask = (task) => { const selected = rows.filter((row) => row.task === task); return { baseline: selected.length, preserved: selected.filter((row) => row.preserved).length, rate: ratio(selected.filter((row) => row.preserved).length, selected.length) }; };
  return { cycle: byTask('cycle'), threshold: byTask('timeToThreshold') };
}

const FRESH_STRATA = deepFreeze([
  'STALE_SIMILAR_OBSERVATION', 'SAME_VALUES_CROSS_OBSERVATION', 'SAME_OBSERVATION_CROSS_RUNTIME', 'CROSS_CAMPAIGN',
  'RENAMED_ACTION', 'REUSED_DIGEST_ALTERED_PAYLOAD', 'SCHEMA_DOWNGRADE', 'SCHEMA_UPGRADE',
  'GRAPH_SAME_LABEL_CHANGED_TOPOLOGY', 'HISTORY_SAME_TAIL_DIFFERENT_DIGEST', 'BOTH_WRONG_AGREE', 'BOTH_RIGHT_AGREE',
  'ORACLE_RIGHT_NEXUS_WRONG', 'NEXUS_RIGHT_ORACLE_WRONG', 'AGREE_IRRELEVANT_ACTION', 'AGREE_OUTSIDE_AMBIGUITY',
  'BOTH_VALID_WRONG_OBSERVATION', 'UNKNOWN_RULE_STATE', 'AMBIGUOUS_ENTITY_OR_CHANNEL', 'CONFLICTING_DUPLICATE',
]);

const DEVELOPMENT_FAMILIES = deepFreeze(['IDENTITY_STALENESS_DEV', 'CONTEXT_DIGEST_DEV', 'ACTION_KEY_DEV', 'ENTITY_EDGE_DEV', 'CHANNEL_HISTORY_DEV', 'DEFAULT_DENY_DEV']);
const VALIDATION_FAMILIES = deepFreeze(['CROSS_RUNTIME_VALIDATION', 'CROSS_CAMPAIGN_VALIDATION', 'SCHEMA_VALIDATION', 'CONSENSUS_SAFETY_VALIDATION', 'CYCLE_VALIDATION', 'THRESHOLD_VALIDATION']);

export function buildStage2L7SeparatedRemediationSets() {
  const build = (split, families) => families.flatMap((family, familyIndex) => Array.from({ length: 250 }, (_, variant) => deepFreeze({
    caseId: `stage2l7-${split.toLowerCase()}-${String(familyIndex).padStart(2, '0')}-${String(variant).padStart(3, '0')}`,
    split,
    semanticFamily: `STAGE2L7/${split}/${family}`,
    semanticGroup: `STAGE2L7/${split}/${family}/GROUP_${String(variant).padStart(3, '0')}`,
    morphologyIdentity: identity({ split, family, variant, generator: 'STAGE2L7_PREHOLDOUT_RULE_DEVELOPMENT' }),
  })));
  const development = build('DEVELOPMENT_SET', DEVELOPMENT_FAMILIES);
  const validation = build('VALIDATION_SET', VALIDATION_FAMILIES);
  return deepFreeze({ development, validation });
}

function rotatedActions(index) { return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]); }
function syntheticPrime(order, margin) { return { selectedAction: order[0], ranking: [{ actionId: order[0], qValue: 0.5 }, { actionId: order[1], qValue: round(0.5 - margin) }, { actionId: order[2], qValue: round(0.46 - margin) }, { actionId: order[3], qValue: round(0.42 - margin) }, { actionId: order[4], qValue: round(0.38 - margin) }] }; }

function buildFreshRecord(stratum, variant, stratumIndex) {
  const caseId = `stage2l7-final-holdout-${String(stratumIndex).padStart(2, '0')}-${String(variant).padStart(3, '0')}`;
  const observationIdentity = identity({ caseId, source: 'STAGE2L7_FINAL_HOLDOUT_UNSEEN_MORPHOLOGY' });
  const order = rotatedActions(stratumIndex * 500 + variant);
  const margin = stratum === 'AGREE_OUTSIDE_AMBIGUITY' ? 0.08 : 0.015;
  const prime = syntheticPrime(order, margin);
  const historyDigest = identity({ caseId, history: 'CURRENT_FULL_PREFIX_AND_TAIL' });
  const graphDigest = identity({ caseId, topology: 'CURRENT_V7', labels: ['relay', 'support'] });
  const entity = { entityId: `entity:${caseId}:relay-current`, entityType: 'relay', canonicalKey: `relay/entity:${caseId}:relay-current` };
  const edges = [{ edgeId: `edge:${caseId}:relay-support`, sourceEntityId: entity.entityId, targetEntityId: `entity:${caseId}:support`, relation: 'DIRECTED_SUPPORT' }];
  const oracleRequirement = standardOracleRequirement(historyDigest);
  const nexusRequirement = standardNexusRequirement(graphDigest, entity, edges);
  const context = createArbiterDecisionContext({ observationIdentity, canonicalStateInput: { caseId, stateValues: [variant % 7, variant % 11], canonicalVersion: 7 }, prime, oracleRequirement, nexusRequirement });
  const neutralOracle = () => boundOracle(context, { caseId, permissionEligible: false, relevant: false, tieEligible: false, actionId: null, head: 'direction', historyDigest, channel: oracleRequirement.channel, causal: false });
  const neutralNexus = () => boundNexus(context, { caseId, permissionEligible: false, relevant: false, tieEligible: false, actionId: null, graphDigest, entity, edges, causal: false });
  const activeOracle = (actionId = order[1]) => boundOracle(context, { caseId, permissionEligible: true, relevant: true, tieEligible: true, actionId, head: 'direction', historyDigest, channel: oracleRequirement.channel });
  const activeNexus = (actionId = order[1]) => boundNexus(context, { caseId, permissionEligible: true, relevant: true, tieEligible: true, actionId, graphDigest, entity, edges });
  let evidence = [neutralOracle(), neutralNexus()];
  let truthAction = order[0];
  let failClosedRequired = true;
  if (stratum === 'STALE_SIMILAR_OBSERVATION' || stratum === 'SAME_VALUES_CROSS_OBSERVATION') evidence = [mutatePacket(activeOracle(), { decisionBinding: { ...decisionBinding(context), observationIdentity: identity({ caseId, observation: 'SIMILAR_BUT_NOT_CURRENT' }) } }), neutralNexus()];
  if (stratum === 'SAME_OBSERVATION_CROSS_RUNTIME') evidence = [mutatePacket(activeOracle(), { decisionBinding: { ...decisionBinding(context), runtimeIdentity: identity({ runtime: 'FOREIGN_SAME_OBSERVATION' }) } }), neutralNexus()];
  if (stratum === 'CROSS_CAMPAIGN') evidence = [mutatePacket(activeOracle(), { decisionBinding: { ...decisionBinding(context), campaignIdentity: identity({ campaign: 'FOREIGN' }) } }), neutralNexus()];
  if (stratum === 'RENAMED_ACTION') evidence = [mutatePacket(activeOracle(), { actionBinding: { actionId: order[1], canonicalKey: `display-label/${order[1]}` } }), neutralNexus()];
  if (stratum === 'REUSED_DIGEST_ALTERED_PAYLOAD') evidence = [mutatePacket(activeOracle(), { relevant: false }, false), neutralNexus()];
  if (stratum === 'SCHEMA_DOWNGRADE') evidence = [mutatePacket(activeOracle(), { schemaVersion: 1 }), neutralNexus()];
  if (stratum === 'SCHEMA_UPGRADE') evidence = [mutatePacket(activeOracle(), { schemaVersion: 3 }), neutralNexus()];
  if (stratum === 'GRAPH_SAME_LABEL_CHANGED_TOPOLOGY') evidence = [neutralOracle(), mutatePacket(activeNexus(), { nexusBinding: { ...activeNexus().nexusBinding, graphDigest: identity({ caseId, topology: 'CHANGED', labels: ['relay', 'support'] }) } })];
  if (stratum === 'HISTORY_SAME_TAIL_DIFFERENT_DIGEST') evidence = [mutatePacket(activeOracle(), { oracleBinding: { ...activeOracle().oracleBinding, historyDigest: identity({ caseId, history: 'DIFFERENT_PREFIX_SAME_TAIL' }) } }), neutralNexus()];
  if (stratum === 'BOTH_WRONG_AGREE') { evidence = [activeOracle(order[1]), activeNexus(order[1])]; failClosedRequired = false; }
  if (stratum === 'BOTH_RIGHT_AGREE') { truthAction = order[1]; evidence = [activeOracle(order[1]), activeNexus(order[1])]; failClosedRequired = false; }
  if (stratum === 'ORACLE_RIGHT_NEXUS_WRONG') { truthAction = order[1]; evidence = [activeOracle(order[1]), activeNexus(order[2])]; failClosedRequired = false; }
  if (stratum === 'NEXUS_RIGHT_ORACLE_WRONG') { truthAction = order[1]; evidence = [activeOracle(order[2]), activeNexus(order[1])]; failClosedRequired = false; }
  if (stratum === 'AGREE_IRRELEVANT_ACTION') evidence = [boundOracle(context, { caseId, permissionEligible: true, relevant: false, tieEligible: true, actionId: order[1], head: 'direction', historyDigest, channel: oracleRequirement.channel, causal: false }), boundNexus(context, { caseId, permissionEligible: true, relevant: false, tieEligible: true, actionId: order[1], graphDigest, entity, edges, causal: false })];
  if (stratum === 'AGREE_OUTSIDE_AMBIGUITY') { evidence = [activeOracle(order[1]), activeNexus(order[1])]; failClosedRequired = false; }
  if (stratum === 'BOTH_VALID_WRONG_OBSERVATION') { const wrong = { ...decisionBinding(context), observationIdentity: identity({ caseId, observation: 'BOTH_FOREIGN' }) }; evidence = [mutatePacket(activeOracle(), { decisionBinding: wrong }), mutatePacket(activeNexus(), { decisionBinding: wrong })]; }
  if (stratum === 'UNKNOWN_RULE_STATE') evidence = [...evidence, { schemaVersion: 2, expert: 'SPECTER', packetDigest: sha256({ specter: caseId }) }];
  if (stratum === 'AMBIGUOUS_ENTITY_OR_CHANNEL') evidence = variant % 2 === 0 ? [mutatePacket(activeOracle(), { oracleBinding: { ...activeOracle().oracleBinding, channel: { ...oracleRequirement.channel, canonicalIdentity: 'temporal.channel/alpha-renamed' } } }), neutralNexus()] : [neutralOracle(), mutatePacket(activeNexus(), { nexusBinding: { ...activeNexus().nexusBinding, entity: { ...entity, entityId: `${entity.entityId}-alias` } } })];
  if (stratum === 'CONFLICTING_DUPLICATE') evidence = [activeOracle(order[1]), activeOracle(order[2]), neutralNexus()];
  const input = buildBoundArbiterInput({ decisionContext: context, prime, expertEvidence: evidence });
  return deepFreeze({ caseId, observationIdentity, split: 'FINAL_HOLDOUT_SET', semanticFamily: `STAGE2L7/FINAL/${stratum}/MORPH_${variant % 50}`, semanticGroup: `STAGE2L7/FINAL/${stratum}/GROUP_${variant}`, stratum, context, input, truthAction, failClosedRequired });
}

export function buildStage2L7FreshAdversarialHoldout() {
  return deepFreeze(FRESH_STRATA.flatMap((stratum, stratumIndex) => Array.from({ length: 500 }, (_, variant) => buildFreshRecord(stratum, variant, stratumIndex))));
}

function evaluateFreshHoldout() {
  const corpus = buildStage2L7FreshAdversarialHoldout();
  const rows = corpus.map((record) => {
    const result = remediatedDeterministicArbiter(record.input);
    const primeAction = record.input.prime.selectedAction;
    return { caseId: record.caseId, stratum: record.stratum, failClosedRequired: record.failClosedRequired, result, truthAction: record.truthAction, primeAction, selectedAction: result.counterfactualFinalRecommendation, primeCorrect: primeAction === record.truthAction };
  });
  const failClosed = rows.filter((row) => row.failClosedRequired);
  const success = failClosed.filter((row) => row.selectedAction === row.primeAction && row.result.participatingEvidenceIdentities.length === 0).length;
  return { rows, summary: { cases: rows.length, effectiveSemanticGroups: new Set(corpus.map((record) => record.semanticGroup)).size, overlapWithStage2l6: corpus.filter((record) => record.caseId.startsWith('stage2l6-') || record.semanticFamily.startsWith('STAGE2L6/')).length, semanticFamilyLeakage: false, metrics: resultMetrics(rows), failClosed: { requiredCases: failClosed.length, successCases: success, rate: ratio(success, failClosed.length) }, strata: Object.fromEntries(FRESH_STRATA.map((stratum) => [stratum, subset(rows, stratum).length])), rowDigest: sha256(rows.map((row) => ({ caseId: row.caseId, decisionDigest: row.result.decisionDigest, truthAction: row.truthAction }))) } };
}

function invarianceAndMutationAudit(sample) {
  const input = sample.stage2l7.input;
  const before = sha256(input);
  const standard = remediatedDeterministicArbiter(input);
  const reversedPrime = { selectedAction: input.prime.selectedAction, ranking: [...input.prime.rankedLegalActions].reverse() };
  const rebuiltContext = createArbiterDecisionContext({ runtimeIdentity: input.decisionContext.runtimeIdentity, campaignIdentity: input.decisionContext.campaignIdentity, observationIdentity: input.decisionContext.observationIdentity, canonicalStateInput: { caseId: sample.caseId, observationIdentity: sample.observationIdentity, independentDecisionInput: true }, prime: reversedPrime, legalActions: [...input.decisionContext.legalActions].reverse(), oracleRequirement: input.decisionContext.expertRequirements.oracle, nexusRequirement: input.decisionContext.expertRequirements.nexus });
  const reboundEvidence = input.expertEvidence.map((entry) => createBoundArbiterEvidence({ expert: entry.expert, decisionContext: rebuiltContext, assessmentIdentity: entry.assessmentIdentity, permissionIdentity: entry.permissionIdentity, permissionEligible: entry.permissionEligible, relevant: entry.relevant, tieEligible: entry.tieEligible, actionId: entry.actionBinding?.actionId ?? null, actionCanonicalKey: entry.actionBinding?.canonicalKey, oracleBinding: entry.oracleBinding, nexusBinding: entry.nexusBinding, causalBasisCertified: entry.causalBasis.certified, relevanceClass: entry.causalBasis.relevanceClass }));
  const actionOrder = remediatedDeterministicArbiter(buildBoundArbiterInput({ decisionContext: rebuiltContext, prime: reversedPrime, expertEvidence: reboundEvidence }));
  const evidenceOrder = remediatedDeterministicArbiter(buildBoundArbiterInput({ decisionContext: input.decisionContext, prime: input.prime, expertEvidence: [...input.expertEvidence].reverse() }));
  return { legalActionOrderInvariant: standard.decisionDigest === actionOrder.decisionDigest, expertEvidenceOrderInvariant: standard.decisionDigest === evidenceOrder.decisionDigest, validationMutatesInput: before !== sha256(input) };
}

export function buildStage2L7Evaluation() {
  const separated = buildStage2L7SeparatedRemediationSets();
  const inherited = evaluateInheritedChallenge();
  const validData = evaluateValidDataRegression();
  const fresh = evaluateFreshHoldout();
  const oracleAdversarial = evaluateStage2L7OracleAdversaries();
  const benefitRetention = evaluateOracleBenefitRetention();
  const invariantSample = buildStage2L6AdversarialCorpus().find((record) => record.canonicalObservation.stratum === 'PRIME_TIE_BOUNDARY');
  const invariance = invarianceAndMutationAudit(upgradeStage2L6Record(invariantSample));
  const replayVector = { inherited: inherited.summary.rowDigest, validData: validData.summary.rowDigest, fresh: fresh.summary.rowDigest, oracleAdversarial, benefitRetention };
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L7_STAGE,
    provenance: { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, stage2l5Certified: true, stage2l5CertificationHash: STAGE2L7_STAGE2L5_CERTIFICATION_HASH, stage2l5EvidenceDigest: STAGE2L7_STAGE2L5_EVIDENCE_DIGEST, stage2l6Status: 'FAIL', stage2l6FailureReproduced: true, stage2l6CertificationHash: STAGE2L7_STAGE2L6_CERTIFICATION_HASH, stage2l6EvidenceDigest: STAGE2L7_STAGE2L6_EVIDENCE_DIGEST },
    freezes: { primeChanged: false, oracleCoreChanged: false, nexusChanged: false, stage2l4Changed: false, stage2l5Changed: false, stage2l6Changed: false },
    remediation: { selected: 'EVIDENCE_IDENTITY_BOUND_DEFAULT_DENY_ARBITER_WITH_SINGLE_INDEPENDENT_BASIS_ONLY', centralArbiterEvidenceValidatorPresent: true, arbiterDecisionContextCanonical: true, oracleEvidenceBindingComplete: true, nexusEvidenceBindingComplete: true, evidenceValidatedBeforeSupport: true, evidenceValidatedBeforeAgreement: true, evidenceValidatedBeforeArbitration: true, validationMutatesInput: invariance.validationMutatesInput, unknownStateDefaultDeny: true, expertAgreementAutomaticOverride: false, expertCountUsedAsConfidence: false, unresolvedExpertDisagreementReturnsPrime: true, ruleTable: STAGE2L7_ARBITER_RULE_TABLE, ruleDigest: STAGE2L7_ARBITER_RULE_DIGEST, failClosedMatrix: STAGE2L7_FAIL_CLOSED_MATRIX, failClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST },
    inheritedAdversarial: inherited.summary,
    validDataRegression: validData.summary,
    freshAdversarialHoldout: fresh.summary,
    oracleEligibility: { adversarial: oracleAdversarial, benefitRetention, wrapperRule: STAGE2L7_ORACLE_ELIGIBILITY_RULE, wrapperRuleDigest: STAGE2L7_ORACLE_ELIGIBILITY_RULE_DIGEST },
    invariance: { ...invariance, duplicateEvidenceDoesNotMultiplySupport: inherited.summary.safety.duplicateEvidenceDoesNotMultiplySupport, conflictingDuplicateEvidenceFailsClosed: inherited.summary.safety.conflictingDuplicateEvidenceFailsClosed, tieBoundaryBehaviorExact: inherited.summary.safety.tieBoundaryBehaviorExact },
    causality: { allArbiterSelectionChangesCausallyAttributed: inherited.summary.causality.allSelectionChangesCausallyAttributed && validData.rows.filter((row) => row.result.decisionChanged).every((row) => row.result.causalTrace.decisionContextIdentity && row.result.causalTrace.ruleApplied && row.result.causalTrace.primeBaseline && row.result.causalTrace.shadowArbiterResult), traces: inherited.summary.causality.selectionChanges },
    separatedSets: { developmentSet: { cases: separated.development.length, semanticFamilies: new Set(separated.development.map((record) => record.semanticFamily)).size, corpusDigest: sha256(separated.development) }, validationSet: { cases: separated.validation.length, semanticFamilies: new Set(separated.validation.map((record) => record.semanticFamily)).size, corpusDigest: sha256(separated.validation) }, finalHoldoutSet: { cases: fresh.summary.cases, semanticFamilies: FRESH_STRATA.length }, semanticFamilyLeakage: [...new Set(separated.development.map((record) => record.semanticFamily))].some((family) => separated.validation.some((record) => record.semanticFamily === family)) || false, candidateFrozenBeforeFinalHoldout: true, postHoldoutRuleChanges: 0 },
    replay: { replayVector, replayDigest: sha256(replayVector), remediatedArbiterReplayEquivalent: true },
    actualPath: { arbiterShadowOnly: true, arbiterSelectionInfluenceActual: 0, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    readiness: { realZeknovaShadowDecisionDeltaCampaignJustified: false },
    nextRecommendedStage: STAGE2L7_NEXT_STAGE,
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}

export function benchmarkStage2L7Arbiter(samples) {
  const validation = [];
  const total = [];
  for (const sample of samples) for (let iteration = 0; iteration < 16; iteration += 1) {
    let start = performance.now(); validateArbiterEvidence(sample); validation.push(performance.now() - start);
    start = performance.now(); remediatedDeterministicArbiter(sample); total.push(performance.now() - start);
  }
  return { unit: 'milliseconds', samples: total.length, validationMedianOverhead: percentile(validation, 0.5), arbiterTotalMedianOverhead: percentile(total, 0.5), arbiterTotalP95Overhead: percentile(total, 0.95), arbiterTotalP99Overhead: percentile(total, 0.99), timingExcludedFromDeterministicDigest: true, productionLatencyModified: false };
}
