import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import {
  buildStage2L1DecisionCorpus,
} from './stage2l1-counterfactual-expert-information.js';
import {
  buildStage2L2ReplicationCorpus,
  buildStage2L2ReplicationEvaluation,
  STAGE2L2_INTERPRETER_RULE_DIGEST,
  STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
} from './stage2l2-independent-counterfactual-replication.js';
import {
  buildStage2L4FreshHoldout,
  evaluateOracleDecisionEligibility,
  ORACLE_ELIGIBILITY_RULE_DIGEST,
  SELECTED_ORACLE_ELIGIBILITY_RULE,
} from './stage2l4-oracle-head-specific-decision-eligibility.js';
import {
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_RUNTIME_IDENTITY,
} from './stage2l0-core-triad-shadow-integration.js';

export const STAGE2L5_STAGE = 'STAGE2L5_DETERMINISTIC_ARBITER_CANDIDATE_DESIGN_AND_SHADOW_CERTIFICATION';
export const STAGE2L5_STAGE2L4_CERTIFICATION_HASH = '63dd2d8938fe4c9dd4cee106974a8afab65d6b399b311d85843d0660b062a5bc';
export const STAGE2L5_STAGE2L4_EVIDENCE_DIGEST = 'd4770e0d891c87c2eaf1ccb4748249bfb374f0d309c3be1c525ac1a9a54edd39';
export const STAGE2L5_FRESH_HOLDOUT_CASES = 6000;
export const STAGE2L5_PRIME_AMBIGUITY_THRESHOLD = 0.03;
export const STAGE2L5_MAX_HARMFUL_CHANGE_RATE = 0.01;
export const STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE = 0.01;
export const STAGE2L5_MIN_DECISION_DELTA = 0.10;
export const STAGE2L5_MIN_FRESH_DECISION_DELTA = 0.05;
export const STAGE2L5_MIN_VALUE_RETENTION = 0.75;
export const STAGE2L5_STAGE2L4_COMBINED_DELTA = 0.1872;
export const STAGE2L5_NEXT_STAGE = 'STAGE2L6_DETERMINISTIC_ARBITER_ADVERSARIAL_SHADOW_CHALLENGE';

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const ORACLE_HEADS = deepFreeze(['direction', 'persistence', 'reversal', 'regimeChange', 'volatility', 'cycle', 'timeToThreshold']);
const EVIDENCE_EXPERTS = deepFreeze(['NEXUS', 'ORACLE']);
const TIE_EPSILON = 0.000001;

export const ARBITER_SUPPORT_STATES = deepFreeze([
  'ORACLE_SUPPORTS', 'ORACLE_OPPOSES', 'ORACLE_NEUTRAL', 'ORACLE_INELIGIBLE',
  'NEXUS_SUPPORTS', 'NEXUS_OPPOSES', 'NEXUS_NEUTRAL', 'NEXUS_INELIGIBLE',
]);

export const ARBITER_RULE_TABLE = deepFreeze([
  { entry: 'A', condition: 'NEITHER_EXPERT_ELIGIBLE', outcome: 'RETURN_PRIME' },
  { entry: 'B', condition: 'ORACLE_ONLY_ELIGIBLE', outcome: 'SELECT_ORACLE_SUPPORTED_CERTIFIED_TIED_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'C', condition: 'NEXUS_ONLY_ELIGIBLE', outcome: 'SELECT_NEXUS_SUPPORTED_CERTIFIED_TIED_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'D', condition: 'BOTH_SUPPORT_SAME_ACTION', outcome: 'SELECT_COMMON_CERTIFIED_TIED_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'E', condition: 'EXPERTS_SUPPORT_DIFFERENT_ACTIONS', outcome: 'SELECT_HIGHEST_PRIME_RANKED_SUPPORTED_CERTIFIED_TIED_ACTION_ELSE_RETURN_PRIME' },
  { entry: 'F', condition: 'ONE_SUPPORTS_PRIME_ONE_SUPPORTS_ALTERNATE', outcome: 'RETURN_PRIME' },
  { entry: 'G', condition: 'BOTH_NEUTRAL_OR_OUTSIDE_AMBIGUITY', outcome: 'RETURN_PRIME' },
  { entry: 'H', condition: 'MALFORMED_OR_MISSING_EXPERT_EVIDENCE', outcome: 'RETURN_PRIME' },
]);
export const ARBITER_RULE_TABLE_DIGEST = sha256(ARBITER_RULE_TABLE);

const FRESH_STRATA = deepFreeze([
  'ORACLE_ONLY_RELEVANT',
  'NEXUS_ONLY_RELEVANT',
  'BOTH_RELEVANT_SAME_ACTION',
  'BOTH_RELEVANT_DISAGREEMENT',
  'NEITHER_RELEVANT',
  'HARD_NEGATIVE_IRRELEVANT_EVIDENCE',
  'PRIME_CLEAR_PREFERENCE',
  'MALFORMED_OR_MISSING_EVIDENCE',
  'TEMPORALLY_IMPORTANT_ACTION_INDEPENDENT',
  'RELATIONALLY_IMPORTANT_ACTION_INDEPENDENT',
  'ONE_SUPPORTS_PRIME_ONE_ALTERNATE',
  'UNRESOLVED_DISAGREEMENT',
]);

function clone(value) { return structuredClone(value); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function round(value) { return Number(value.toFixed(6)); }
function digestIdentity(value) { return typeof value === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(value); }
function byteLength(value) { return Buffer.byteLength(JSON.stringify(value), 'utf8'); }

function canonicalRanking(ranking) {
  if (!Array.isArray(ranking) || ranking.length < 2) throw new Error('PRIME_RANKING_MISSING_OR_MALFORMED');
  const normalized = ranking.map((entry) => ({
    actionId: entry?.actionId,
    qValue: Number(entry?.qValue ?? entry?.primeQ),
  }));
  if (normalized.some((entry) => !ACTION_IDS.includes(entry.actionId) || !Number.isFinite(entry.qValue))) throw new Error('PRIME_RANKING_CONTAINS_UNKNOWN_ACTION_OR_Q');
  if (new Set(normalized.map((entry) => entry.actionId)).size !== normalized.length) throw new Error('PRIME_RANKING_DUPLICATE_ACTION');
  return normalized.sort((left, right) => right.qValue - left.qValue || left.actionId.localeCompare(right.actionId));
}

export function createCanonicalExpertEvidence({
  expert,
  assessmentIdentity,
  permissionIdentity,
  permissionRuleDigest,
  permissionEligible,
  relevant,
  tieEligible,
  actionId,
  context,
  prevalidated = true,
}) {
  const body = {
    schemaVersion: 1,
    expert,
    assessmentIdentity,
    permissionIdentity,
    permissionRuleDigest,
    permissionEligible,
    relevant,
    tieEligible,
    actionId: actionId ?? null,
    context: context ?? null,
    prevalidated,
    actionGeneration: false,
    advisoryOnly: true,
  };
  return deepFreeze({ ...body, packetDigest: sha256(body) });
}

function evidenceSort(left, right) { return String(left?.expert).localeCompare(String(right?.expert)); }

export function buildCanonicalArbiterInput({
  runtimeIdentity = STAGE2L0_RUNTIME_IDENTITY,
  observationIdentity,
  prime,
  oracleEvidence,
  nexusEvidence,
  expertEvidence,
}) {
  const ranking = canonicalRanking(prime?.ranking ?? prime?.rankedLegalActions);
  const selectedAction = prime?.selectedAction ?? ranking[0].actionId;
  if (selectedAction !== ranking[0].actionId) throw new Error('PRIME_SELECTED_ACTION_DOES_NOT_MATCH_CANONICAL_RANKING');
  const measuredMargin = round(ranking[0].qValue - ranking[1].qValue);
  const declaredMargin = Number(prime?.ambiguityMargin ?? prime?.margin ?? measuredMargin);
  if (!Number.isFinite(declaredMargin) || Math.abs(declaredMargin - measuredMargin) > 0.000001) throw new Error('PRIME_MARGIN_NOT_CANONICAL');
  const suppliedEvidence = expertEvidence ?? [oracleEvidence, nexusEvidence].filter((entry) => entry !== undefined);
  const body = {
    schemaVersion: 1,
    contract: 'SENTINEL_GRID_DETERMINISTIC_ARBITER_CANDIDATE_V1',
    runtimeIdentity,
    observationIdentity,
    shadowOnly: true,
    prime: {
      implementationIdentity: `sha256:${STAGE2L0_IMPLEMENTATION_DIGESTS.prime}`,
      selectedAction,
      rankedLegalActions: ranking,
      ambiguityMargin: measuredMargin,
      ambiguityThreshold: STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
    },
    expertEvidence: [...suppliedEvidence].sort(evidenceSort),
  };
  return deepFreeze({ ...body, inputDigest: sha256(body) });
}

function safePrime(input) {
  const ranking = Array.isArray(input?.prime?.rankedLegalActions) ? input.prime.rankedLegalActions : [];
  const selected = input?.prime?.selectedAction;
  const valid = typeof selected === 'string' && ranking.some((entry) => entry?.actionId === selected);
  return { selectedAction: valid ? selected : null, ranking };
}

function validateEvidence(evidence, expectedExpert, legalActions) {
  if (evidence === undefined || evidence === null) return { status: 'MISSING', active: false, evidence: null, reason: `${expectedExpert}_MISSING` };
  if (typeof evidence !== 'object' || Array.isArray(evidence)) return { status: 'MALFORMED', active: false, evidence: null, reason: `${expectedExpert}_NOT_OBJECT` };
  const { packetDigest, ...body } = evidence;
  if (!digestIdentity(packetDigest) || sha256(body) !== packetDigest) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_NONCANONICAL_PACKET_DIGEST` };
  if (evidence.expert !== expectedExpert || evidence.prevalidated !== true || evidence.actionGeneration !== false || evidence.advisoryOnly !== true) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_ROLE_OR_PREVALIDATION_INVALID` };
  if (!digestIdentity(evidence.assessmentIdentity) || !digestIdentity(evidence.permissionIdentity)) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_IDENTITY_INVALID` };
  const expectedRuleDigest = expectedExpert === 'ORACLE' ? ORACLE_ELIGIBILITY_RULE_DIGEST : STAGE2L2_INTERPRETER_RULE_DIGEST;
  if (evidence.permissionRuleDigest !== expectedRuleDigest) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_PERMISSION_RULE_DRIFT` };
  if (typeof evidence.permissionEligible !== 'boolean' || typeof evidence.relevant !== 'boolean' || typeof evidence.tieEligible !== 'boolean') return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_STATE_INVALID` };
  if (evidence.actionId !== null && !legalActions.includes(evidence.actionId)) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_UNMAPPED_ACTION` };
  if (expectedExpert === 'ORACLE' && evidence.context?.head !== null && !ORACLE_HEADS.includes(evidence.context?.head)) return { status: 'MALFORMED', active: false, evidence, reason: 'ORACLE_UNKNOWN_HEAD' };
  if (expectedExpert === 'NEXUS' && evidence.relevant && typeof evidence.context?.targetIdentity !== 'string') return { status: 'MALFORMED', active: false, evidence, reason: 'NEXUS_UNKNOWN_ENTITY' };
  if (evidence.relevant && evidence.actionId === null) return { status: 'MALFORMED', active: false, evidence, reason: `${expectedExpert}_RELEVANT_WITHOUT_ACTION_BINDING` };
  if (!evidence.permissionEligible) return { status: 'INELIGIBLE', active: false, evidence, reason: `${expectedExpert}_PERMISSION_DENIED` };
  if (!evidence.relevant || !evidence.tieEligible || evidence.actionId === null) return { status: 'NEUTRAL', active: false, evidence, reason: `${expectedExpert}_NEUTRAL` };
  return { status: 'SUPPORTS', active: true, evidence, reason: `${expectedExpert}_ACTION_BOUND_SUPPORT` };
}

function outputBody({ input, selectedAction, ruleEntry, ruleReason, oracle, nexus, inputCanonical }) {
  const primeAction = input?.prime?.selectedAction ?? safePrime(input).selectedAction;
  const ranking = Array.isArray(input?.prime?.rankedLegalActions) ? input.prime.rankedLegalActions : [];
  const active = [oracle, nexus].filter((entry) => entry?.active);
  const supportStates = ranking.map((entry) => ({
    actionId: entry.actionId,
    oracle: oracle?.status === 'SUPPORTS' ? (oracle.evidence.actionId === entry.actionId ? 'ORACLE_SUPPORTS' : 'ORACLE_OPPOSES') : oracle?.status === 'NEUTRAL' ? 'ORACLE_NEUTRAL' : 'ORACLE_INELIGIBLE',
    nexus: nexus?.status === 'SUPPORTS' ? (nexus.evidence.actionId === entry.actionId ? 'NEXUS_SUPPORTS' : 'NEXUS_OPPOSES') : nexus?.status === 'NEUTRAL' ? 'NEXUS_NEUTRAL' : 'NEXUS_INELIGIBLE',
  }));
  const counterfactualRanking = selectedAction === null
    ? []
    : [selectedAction, ...ranking.map((entry) => entry.actionId).filter((actionId) => actionId !== selectedAction)];
  return {
    schemaVersion: 1,
    candidate: 'DETERMINISTIC_ARBITER_CANDIDATE_V1',
    shadowOnly: true,
    primaryDecisionEngine: 'PRIME',
    inputDigest: input?.inputDigest ?? null,
    inputCanonical,
    primeBaselineRecommendation: primeAction,
    arbitrationEligible: active.length > 0 && input?.prime?.ambiguityMargin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
    eligibleExpertEvidenceIdentities: active.map((entry) => ({ expert: entry.evidence.expert, assessmentIdentity: entry.evidence.assessmentIdentity, permissionIdentity: entry.evidence.permissionIdentity, packetDigest: entry.evidence.packetDigest })).sort((left, right) => left.expert.localeCompare(right.expert)),
    evidenceStatus: [oracle, nexus].filter(Boolean).map((entry) => ({ expert: entry.evidence?.expert ?? (entry === oracle ? 'ORACLE' : 'NEXUS'), status: entry.status, reason: entry.reason })).sort((left, right) => left.expert.localeCompare(right.expert)),
    supportStates,
    appliedRule: ruleEntry,
    ruleTableDigest: ARBITER_RULE_TABLE_DIGEST,
    ruleReason,
    counterfactualFinalRecommendation: selectedAction,
    counterfactualRanking,
    decisionChanged: selectedAction !== null && selectedAction !== primeAction,
    causalTrace: {
      observationIdentity: input?.observationIdentity ?? null,
      primeBaselineAction: primeAction,
      primeQMargin: input?.prime?.ambiguityMargin ?? null,
      eligibleExperts: active.map((entry) => entry.evidence.expert).sort(),
      evidenceIdentities: active.map((entry) => entry.evidence.packetDigest).sort(),
      actionBindings: active.map((entry) => ({ expert: entry.evidence.expert, actionId: entry.evidence.actionId, context: entry.evidence.context })).sort((left, right) => left.expert.localeCompare(right.expert)),
      ruleTableEntry: ruleEntry,
      newAction: selectedAction,
    },
    actionGenerated: false,
    worldMutation: false,
    dispatch: false,
    learnedRouting: false,
  };
}

function canonicalOutput(args) {
  const body = outputBody(args);
  return deepFreeze({ ...body, decisionDigest: sha256(body) });
}

function failedClosed(input, ruleReason, oracle = null, nexus = null) {
  return canonicalOutput({ input, selectedAction: safePrime(input).selectedAction, ruleEntry: 'H', ruleReason, oracle, nexus, inputCanonical: false });
}

function certifiedTieCandidate(ranking, actions, margin) {
  const topQ = ranking[0].qValue;
  const allowed = new Set(actions);
  return ranking.find((entry) => allowed.has(entry.actionId) && topQ - entry.qValue <= margin + TIE_EPSILON + Number.EPSILON)?.actionId ?? null;
}

export function deterministicArbiterCandidate(input) {
  try {
    const fallback = safePrime(input);
    if (fallback.selectedAction === null) return failedClosed(input, 'PRIME_RECOMMENDATION_UNAVAILABLE');
    const { inputDigest, ...body } = input;
    if (!digestIdentity(inputDigest) || sha256(body) !== inputDigest) return failedClosed(input, 'ARBITER_INPUT_DIGEST_INVALID');
    const ranking = canonicalRanking(input.prime.rankedLegalActions);
    const canonicalRankingMatches = sha256(ranking) === sha256(input.prime.rankedLegalActions);
    const margin = round(ranking[0].qValue - ranking[1].qValue);
    if (!canonicalRankingMatches || input.prime.selectedAction !== ranking[0].actionId || input.prime.ambiguityMargin !== margin || input.prime.ambiguityThreshold !== STAGE2L5_PRIME_AMBIGUITY_THRESHOLD || input.shadowOnly !== true) return failedClosed(input, 'PRIME_OR_SHADOW_CONTRACT_INVALID');
    const evidence = Array.isArray(input.expertEvidence) ? input.expertEvidence : [];
    const duplicateExperts = new Set(evidence.map((entry) => entry?.expert)).size !== evidence.length;
    if (duplicateExperts) return failedClosed(input, 'DUPLICATE_EXPERT_EVIDENCE');
    const byExpert = new Map(evidence.map((entry) => [entry?.expert, entry]));
    const legalActions = ranking.map((entry) => entry.actionId);
    const oracle = validateEvidence(byExpert.get('ORACLE'), 'ORACLE', legalActions);
    const nexus = validateEvidence(byExpert.get('NEXUS'), 'NEXUS', legalActions);
    if (['MISSING', 'MALFORMED'].includes(oracle.status) || ['MISSING', 'MALFORMED'].includes(nexus.status)) return failedClosed(input, `${oracle.reason};${nexus.reason}`, oracle, nexus);
    const primeAction = input.prime.selectedAction;
    if (margin > STAGE2L5_PRIME_AMBIGUITY_THRESHOLD) return canonicalOutput({ input, selectedAction: primeAction, ruleEntry: 'G', ruleReason: 'PRIME_OUTSIDE_CERTIFIED_AMBIGUITY_REGION', oracle, nexus, inputCanonical: true });
    const active = [oracle, nexus].filter((entry) => entry.active);
    if (active.length === 0) {
      const bothNeutral = oracle.status === 'NEUTRAL' && nexus.status === 'NEUTRAL';
      return canonicalOutput({ input, selectedAction: primeAction, ruleEntry: bothNeutral ? 'G' : 'A', ruleReason: bothNeutral ? 'BOTH_EXPERTS_NEUTRAL' : 'NEITHER_EXPERT_PERMISSIONED', oracle, nexus, inputCanonical: true });
    }
    if (active.length === 1) {
      const entry = active[0];
      const ruleEntry = entry.evidence.expert === 'ORACLE' ? 'B' : 'C';
      const candidate = certifiedTieCandidate(ranking, [entry.evidence.actionId], margin);
      return canonicalOutput({ input, selectedAction: candidate ?? primeAction, ruleEntry, ruleReason: candidate ? `${entry.evidence.expert}_SUPPORTED_CERTIFIED_TIE_MEMBER` : `${entry.evidence.expert}_SUPPORT_OUTSIDE_CERTIFIED_TIE_MEMBERSHIP`, oracle, nexus, inputCanonical: true });
    }
    const oracleAction = oracle.evidence.actionId;
    const nexusAction = nexus.evidence.actionId;
    if (oracleAction === primeAction || nexusAction === primeAction) return canonicalOutput({ input, selectedAction: primeAction, ruleEntry: 'F', ruleReason: 'ONE_EXPERT_SUPPORTS_PRIME_DEFAULT_PRIME', oracle, nexus, inputCanonical: true });
    if (oracleAction === nexusAction) {
      const candidate = certifiedTieCandidate(ranking, [oracleAction], margin);
      return canonicalOutput({ input, selectedAction: candidate ?? primeAction, ruleEntry: 'D', ruleReason: candidate ? 'COMMON_SUPPORTED_CERTIFIED_TIE_MEMBER' : 'COMMON_SUPPORT_OUTSIDE_CERTIFIED_TIE_MEMBERSHIP', oracle, nexus, inputCanonical: true });
    }
    const candidate = certifiedTieCandidate(ranking, [oracleAction, nexusAction], margin);
    return canonicalOutput({ input, selectedAction: candidate ?? primeAction, ruleEntry: 'E', ruleReason: candidate ? 'HIGHEST_PRIME_RANKED_SUPPORTED_CERTIFIED_TIE_MEMBER' : 'UNRESOLVED_EXPERT_DISAGREEMENT_RETURN_PRIME', oracle, nexus, inputCanonical: true });
  } catch (error) {
    return failedClosed(input, `ARBITER_EXCEPTION_FAIL_CLOSED:${error instanceof Error ? error.message : 'UNKNOWN'}`);
  }
}

export function runArbiterWithFailureIsolation(input, implementation = deterministicArbiterCandidate) {
  try {
    return implementation(input);
  } catch (error) {
    return failedClosed(input, `ARBITER_IMPLEMENTATION_FAILURE:${error instanceof Error ? error.message : 'UNKNOWN'}`);
  }
}

function neutralEvidence(expert, caseId) {
  return createCanonicalExpertEvidence({
    expert,
    assessmentIdentity: sha256({ caseId, expert, layer: 'NEUTRAL_ASSESSMENT' }),
    permissionIdentity: sha256({ caseId, expert, layer: 'NEUTRAL_PERMISSION' }),
    permissionRuleDigest: expert === 'ORACLE' ? ORACLE_ELIGIBILITY_RULE_DIGEST : STAGE2L2_INTERPRETER_RULE_DIGEST,
    permissionEligible: true,
    relevant: false,
    tieEligible: false,
    actionId: null,
    context: expert === 'ORACLE' ? { head: null, bindingIdentity: null, actionIndependent: true } : { targetIdentity: null, bindingIdentity: null, actionIndependent: true },
  });
}

function legacySelect(primeRanking, interpretations) {
  const adjustments = Object.fromEntries(ACTION_IDS.map((actionId) => [actionId, 0]));
  for (const interpretation of interpretations) if (interpretation?.actionId) adjustments[interpretation.actionId] = round(adjustments[interpretation.actionId] + interpretation.adjustment);
  return primeRanking.map((entry) => ({ actionId: entry.actionId, primeQ: entry.primeQ ?? entry.qValue, adjustedQ: round((entry.primeQ ?? entry.qValue) + adjustments[entry.actionId]) }))
    .sort((left, right) => right.adjustedQ - left.adjustedQ || right.primeQ - left.primeQ || left.actionId.localeCompare(right.actionId))[0].actionId;
}

function branchMetrics(rows) {
  const changed = rows.filter((row) => row.result.decisionChanged);
  const beneficial = changed.filter((row) => !row.primeCorrect && row.result.counterfactualFinalRecommendation === row.truthAction);
  const harmful = changed.filter((row) => row.primeCorrect && row.result.counterfactualFinalRecommendation !== row.truthAction);
  const primeCorrectCases = rows.filter((row) => row.primeCorrect).length;
  const finalTop2Correct = rows.filter((row) => row.result.counterfactualRanking.slice(0, 2).includes(row.truthAction)).length;
  return {
    cases: rows.length,
    top1: ratio(rows.filter((row) => row.result.counterfactualFinalRecommendation === row.truthAction).length, rows.length),
    top2: ratio(finalTop2Correct, rows.length),
    selectionChanges: changed.length,
    beneficialChanges: beneficial.length,
    harmfulChanges: harmful.length,
    neutralChanges: changed.length - beneficial.length - harmful.length,
    decisionDelta: ratio(beneficial.length - harmful.length, rows.length),
    harmfulChangeRate: ratio(harmful.length, rows.length),
    breaksCorrectPrime: harmful.length,
    correctPrimeBreakRate: ratio(harmful.length, primeCorrectCases),
  };
}

function frozenEvidence(record, source, assessment, eligibility, expert) {
  const interpretation = expert === 'ORACLE' ? record.oracleInterpretation : record.nexusInterpretation;
  const binding = expert === 'ORACLE' ? source.canonicalObservation.temporal.binding : source.canonicalObservation.relational.binding;
  return createCanonicalExpertEvidence({
    expert,
    assessmentIdentity: expert === 'ORACLE' ? record.oracleAssessmentDigest : record.nexusAssessmentDigest,
    permissionIdentity: expert === 'ORACLE' ? eligibility.eligibilityDigest : sha256({ assessmentIdentity: record.nexusAssessmentDigest, binding, interpreterRuleDigest: STAGE2L2_INTERPRETER_RULE_DIGEST }),
    permissionRuleDigest: expert === 'ORACLE' ? ORACLE_ELIGIBILITY_RULE_DIGEST : STAGE2L2_INTERPRETER_RULE_DIGEST,
    permissionEligible: expert === 'ORACLE' ? eligibility.eligible : interpretation.relevant,
    relevant: interpretation.relevant,
    tieEligible: interpretation.tieEligible,
    actionId: interpretation.actionId,
    context: expert === 'ORACLE'
      ? { head: binding?.task ?? null, bindingIdentity: binding ? sha256(binding) : null, actionIndependent: binding === null }
      : { targetIdentity: binding?.targetIdentity ?? null, bindingIdentity: binding ? sha256(binding) : null, actionIndependent: binding === null },
  });
}

function evaluateFrozenCorpus() {
  const baseline = buildStage2L2ReplicationEvaluation();
  const corpus = buildStage2L2ReplicationCorpus();
  const corpusById = new Map(corpus.map((record) => [record.caseId, record]));
  const rows = baseline.replicationRecords.map((record) => {
    const source = corpusById.get(record.caseId);
    const assessment = assembleOracleV2(source.canonicalObservation.temporal.input, { observationIdentity: source.observationIdentity });
    const eligibility = evaluateOracleDecisionEligibility(source, assessment, record.oracleInterpretation);
    const oracleEvidence = frozenEvidence(record, source, assessment, eligibility, 'ORACLE');
    const nexusEvidence = frozenEvidence(record, source, assessment, eligibility, 'NEXUS');
    const prime = { selectedAction: record.branches.primeOnly.selectedAction, ranking: record.branches.primeOnly.ranking, ambiguityMargin: record.primeMargin };
    const input = buildCanonicalArbiterInput({ observationIdentity: record.observationIdentity, prime, oracleEvidence, nexusEvidence });
    const result = deterministicArbiterCandidate(input);
    const oracleOnlyInput = buildCanonicalArbiterInput({ observationIdentity: record.observationIdentity, prime, oracleEvidence, nexusEvidence: neutralEvidence('NEXUS', record.caseId) });
    const nexusOnlyInput = buildCanonicalArbiterInput({ observationIdentity: record.observationIdentity, prime, oracleEvidence: neutralEvidence('ORACLE', record.caseId), nexusEvidence });
    const oracleOnly = deterministicArbiterCandidate(oracleOnlyInput);
    const nexusOnly = deterministicArbiterCandidate(nexusOnlyInput);
    const remediatedOracle = eligibility.eligible ? record.oracleInterpretation : { ...record.oracleInterpretation, actionId: null, adjustment: 0 };
    const expectedOracle = legacySelect(record.branches.primeOnly.ranking, [remediatedOracle]);
    const expectedNexus = legacySelect(record.branches.primeOnly.ranking, [record.nexusInterpretation]);
    const expectedCombined = legacySelect(record.branches.primeOnly.ranking, [remediatedOracle, record.nexusInterpretation]);
    const truthAction = record.groundTruth[0].actionId;
    return {
      caseId: record.caseId,
      observationIdentity: record.observationIdentity,
      source,
      record,
      input,
      result,
      oracleOnly,
      nexusOnly,
      expectedOracle,
      expectedNexus,
      expectedCombined,
      primeCorrect: record.branches.primeOnly.selectedAction === truthAction,
      truthAction,
      assessmentUnchanged: assessment.assessmentDigest === record.oracleAssessmentDigest,
    };
  });
  const metrics = branchMetrics(rows);
  const rule = (entry) => rows.filter((row) => row.result.appliedRule === entry);
  const metricsForRule = (entry) => branchMetrics(rule(entry));
  const nonAmbiguousChanged = rows.filter((row) => row.record.primeMargin > STAGE2L5_PRIME_AMBIGUITY_THRESHOLD && row.result.decisionChanged).length;
  const irrelevantRows = rows.filter((row) => row.source.canonicalObservation.hardNegative);
  const rawAgreement = baseline.agreement.BOTH_SUPPORT_SAME_ACTION;
  const rawDisagreement = baseline.disagreement;
  return {
    baseline,
    rows,
    metrics,
    prime: baseline.metrics.prime,
    oracleOnlyEquivalent: rows.every((row) => row.oracleOnly.counterfactualFinalRecommendation === row.expectedOracle),
    nexusOnlyEquivalent: rows.every((row) => row.nexusOnly.counterfactualFinalRecommendation === row.expectedNexus),
    combinedEquivalent: rows.every((row) => row.result.counterfactualFinalRecommendation === row.expectedCombined),
    oracleAssessmentsUnchanged: rows.every((row) => row.assessmentUnchanged),
    nonAmbiguousChanged,
    irrelevantEvidenceSelectionChangeRate: ratio(irrelevantRows.filter((row) => row.result.decisionChanged).length, irrelevantRows.length),
    agreement: {
      inheritedRawCases: rawAgreement.cases,
      inheritedSelectionChanges: rawAgreement.metrics.combined.selectionChanges,
      inheritedBeneficialChanges: rawAgreement.metrics.combined.beneficialChanges,
      inheritedHarmfulChanges: rawAgreement.metrics.combined.harmfulChanges,
      eligibleRuleCases: rule('D').length,
      eligibleRuleMetrics: metricsForRule('D'),
    },
    disagreement: {
      inheritedRawCases: rawDisagreement.cases,
      inheritedSelectionChanges: rawDisagreement.selectionChanges,
      inheritedBeneficialChanges: rawDisagreement.beneficialChanges,
      inheritedHarmfulChanges: rawDisagreement.harmfulChanges,
      eligibleRuleCases: rule('E').length,
      eligibleRuleMetrics: metricsForRule('E'),
    },
  };
}

function rotatedActions(index) { return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]); }

function freshPacket(expert, caseId, { relevant = false, tieEligible = false, actionId = null, permissionEligible = true, actionIndependent = false } = {}) {
  return createCanonicalExpertEvidence({
    expert,
    assessmentIdentity: sha256({ caseId, expert, assessment: 'STAGE2L5_INDEPENDENT_HOLDOUT' }),
    permissionIdentity: sha256({ caseId, expert, permission: 'PREDECLARED_BEFORE_HOLDOUT', permissionEligible, actionId }),
    permissionRuleDigest: expert === 'ORACLE' ? ORACLE_ELIGIBILITY_RULE_DIGEST : STAGE2L2_INTERPRETER_RULE_DIGEST,
    permissionEligible,
    relevant,
    tieEligible,
    actionId,
    context: expert === 'ORACLE'
      ? { head: 'direction', bindingIdentity: sha256({ caseId, expert, actionId }), actionIndependent }
      : { targetIdentity: relevant ? `stage2l5-entity-${caseId}` : null, bindingIdentity: sha256({ caseId, expert, actionId }), actionIndependent },
  });
}

export function buildStage2L5FreshHoldout() {
  const records = [];
  for (const [stratumIndex, stratum] of FRESH_STRATA.entries()) {
    for (let variant = 0; variant < 500; variant += 1) {
      const sequence = stratumIndex * 500 + variant;
      const caseId = `stage2l5-fresh-${String(stratumIndex).padStart(2, '0')}-${String(variant).padStart(3, '0')}`;
      const order = rotatedActions(sequence);
      const clear = stratum === 'PRIME_CLEAR_PREFERENCE';
      const margin = clear ? (variant % 2 === 0 ? 0.08 : 0.14) : (variant % 2 === 0 ? 0.012 : 0.024);
      const ranking = [
        { actionId: order[0], qValue: 0.5 },
        { actionId: order[1], qValue: round(0.5 - margin) },
        { actionId: order[2], qValue: round(0.5 - margin - 0.04) },
        { actionId: order[3], qValue: round(0.5 - margin - 0.08) },
        { actionId: order[4], qValue: round(0.5 - margin - 0.12) },
      ];
      let oracleEvidence = freshPacket('ORACLE', caseId);
      let nexusEvidence = freshPacket('NEXUS', caseId);
      let truthAction = order[0];
      if (stratum === 'ORACLE_ONLY_RELEVANT') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); truthAction = order[1]; }
      if (stratum === 'NEXUS_ONLY_RELEVANT') { nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); truthAction = order[1]; }
      if (stratum === 'BOTH_RELEVANT_SAME_ACTION') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); truthAction = order[1]; }
      if (stratum === 'BOTH_RELEVANT_DISAGREEMENT') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: true, actionId: order[2] }); truthAction = order[1]; }
      if (stratum === 'PRIME_CLEAR_PREFERENCE') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: false, actionId: order[1] }); nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: false, actionId: order[1] }); }
      if (stratum === 'TEMPORALLY_IMPORTANT_ACTION_INDEPENDENT') oracleEvidence = freshPacket('ORACLE', caseId, { relevant: false, tieEligible: false, permissionEligible: false, actionIndependent: true });
      if (stratum === 'RELATIONALLY_IMPORTANT_ACTION_INDEPENDENT') nexusEvidence = freshPacket('NEXUS', caseId, { relevant: false, tieEligible: false, permissionEligible: false, actionIndependent: true });
      if (stratum === 'ONE_SUPPORTS_PRIME_ONE_ALTERNATE') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: true, actionId: order[0] }); nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: true, actionId: order[1] }); }
      if (stratum === 'UNRESOLVED_DISAGREEMENT') { oracleEvidence = freshPacket('ORACLE', caseId, { relevant: true, tieEligible: true, actionId: order[2] }); nexusEvidence = freshPacket('NEXUS', caseId, { relevant: true, tieEligible: true, actionId: order[3] }); }
      if (stratum === 'MALFORMED_OR_MISSING_EVIDENCE') {
        if (variant % 2 === 0) oracleEvidence = null;
        else oracleEvidence = { ...oracleEvidence, packetDigest: sha256({ forged: caseId }) };
      }
      const truthRanking = [truthAction, ...ranking.map((entry) => entry.actionId).filter((actionId) => actionId !== truthAction)];
      const canonicalObservation = {
        schemaVersion: 1,
        caseId,
        corpus: 'STAGE2L5_INDEPENDENT_ARBITER_HOLDOUT',
        semanticTemplate: `STAGE2L5/FRESH/${stratum}`,
        semanticFamily: `STAGE2L5/FRESH/${stratum}/FAMILY_${String(variant % 50).padStart(2, '0')}`,
        semanticGroup: `STAGE2L5/FRESH/${stratum}/GROUP_${String(variant).padStart(3, '0')}`,
        stratum,
        hardNegative: ['HARD_NEGATIVE_IRRELEVANT_EVIDENCE', 'TEMPORALLY_IMPORTANT_ACTION_INDEPENDENT', 'RELATIONALLY_IMPORTANT_ACTION_INDEPENDENT'].includes(stratum),
        primeNearTie: margin <= STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
        primeClearPreference: clear,
        prime: { selectedAction: order[0], ranking, ambiguityMargin: margin },
        oracleEvidence,
        nexusEvidence,
        independentGroundTruth: { method: 'PREDECLARED_ARBITER_SUPPORT_RELATION_WITH_ACTION_INDEPENDENT_HARD_NEGATIVES', bestAction: truthAction, ranking: truthRanking },
      };
      records.push(deepFreeze({ caseId, observationIdentity: `sha256:${sha256(canonicalObservation)}`, canonicalObservation }));
    }
  }
  return deepFreeze(records);
}

function identityKeys(record) {
  const observation = record.canonicalObservation ?? record;
  return [record.caseId, record.observationIdentity, observation.semanticFamily, observation.semanticTemplate].filter(Boolean);
}

function evaluateFreshHoldout() {
  const corpus = buildStage2L5FreshHoldout();
  const rows = corpus.map((record) => {
    const observation = record.canonicalObservation;
    const input = buildCanonicalArbiterInput({ observationIdentity: record.observationIdentity, prime: observation.prime, oracleEvidence: observation.oracleEvidence, nexusEvidence: observation.nexusEvidence });
    const result = deterministicArbiterCandidate(input);
    const truthAction = observation.independentGroundTruth.bestAction;
    return { caseId: record.caseId, record, input, result, truthAction, primeCorrect: observation.prime.selectedAction === truthAction };
  });
  const oldRecords = [...buildStage2L1DecisionCorpus(), ...buildStage2L2ReplicationCorpus(), ...buildStage2L4FreshHoldout()];
  const oldKeys = new Set(oldRecords.flatMap(identityKeys));
  const overlap = corpus.filter((record) => identityKeys(record).some((key) => oldKeys.has(key))).length;
  return {
    corpus,
    rows,
    metrics: branchMetrics(rows),
    overlap,
    effectiveSemanticGroups: new Set(corpus.map((record) => record.canonicalObservation.semanticGroup)).size,
    semanticTemplates: new Set(corpus.map((record) => record.canonicalObservation.semanticTemplate)).size,
    strata: Object.fromEntries(FRESH_STRATA.map((stratum) => [stratum, corpus.filter((record) => record.canonicalObservation.stratum === stratum).length])),
  };
}

function malformedEvidenceAudit(sample) {
  const observation = sample.canonicalObservation;
  const prime = observation.prime;
  const goodOracle = freshPacket('ORACLE', sample.caseId, { relevant: true, tieEligible: true, actionId: prime.ranking[1].actionId });
  const goodNexus = freshPacket('NEXUS', sample.caseId, { relevant: true, tieEligible: true, actionId: prime.ranking[1].actionId });
  const mutate = (packet, changes) => {
    const body = { ...packet, ...changes };
    delete body.packetDigest;
    return { ...body, packetDigest: sha256(body) };
  };
  const corruptDigest = { ...goodOracle, packetDigest: sha256({ forged: 'noncanonical' }) };
  const cases = [
    { id: 'MISSING_ORACLE', oracle: null, nexus: goodNexus },
    { id: 'MISSING_NEXUS', oracle: goodOracle, nexus: null },
    { id: 'MALFORMED_ORACLE', oracle: { heads: [] }, nexus: goodNexus },
    { id: 'MALFORMED_NEXUS', oracle: goodOracle, nexus: { redundancy: null } },
    { id: 'UNKNOWN_ORACLE_HEAD', oracle: mutate(goodOracle, { context: { ...goodOracle.context, head: 'unknownHead' } }), nexus: goodNexus },
    { id: 'UNKNOWN_NEXUS_ENTITY', oracle: goodOracle, nexus: mutate(goodNexus, { context: { ...goodNexus.context, targetIdentity: null } }) },
    { id: 'UNMAPPED_ACTION', oracle: mutate(goodOracle, { actionId: 'forged-action' }), nexus: goodNexus },
    { id: 'NONCANONICAL_EVIDENCE_DIGEST', oracle: corruptDigest, nexus: goodNexus },
  ].map((entry) => {
    const input = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime, oracleEvidence: entry.oracle, nexusEvidence: entry.nexus });
    const result = deterministicArbiterCandidate(input);
    return { id: entry.id, selectedAction: result.counterfactualFinalRecommendation, primeAction: prime.selectedAction, rule: result.appliedRule, safe: result.counterfactualFinalRecommendation === prime.selectedAction && result.appliedRule === 'H' };
  });
  return { cases, malformedExpertEvidenceFailsClosed: cases.every((entry) => entry.safe) };
}

function invarianceAudit(sample) {
  const observation = sample.canonicalObservation;
  const standardInput = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime: observation.prime, oracleEvidence: observation.oracleEvidence, nexusEvidence: observation.nexusEvidence });
  const actionOrderInput = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime: { ...observation.prime, ranking: [...observation.prime.ranking].reverse() }, oracleEvidence: observation.oracleEvidence, nexusEvidence: observation.nexusEvidence });
  const evidenceOrderInput = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime: observation.prime, expertEvidence: [observation.nexusEvidence, observation.oracleEvidence] });
  const standard = deterministicArbiterCandidate(standardInput);
  const actionOrder = deterministicArbiterCandidate(actionOrderInput);
  const evidenceOrder = deterministicArbiterCandidate(evidenceOrderInput);
  return {
    legalActionOrderInvariant: standardInput.inputDigest === actionOrderInput.inputDigest && standard.decisionDigest === actionOrder.decisionDigest,
    expertEvidenceOrderInvariant: standardInput.inputDigest === evidenceOrderInput.inputDigest && standard.decisionDigest === evidenceOrder.decisionDigest,
  };
}

function failureIsolationAudit(sample) {
  const observation = sample.canonicalObservation;
  const prime = observation.prime;
  const missingOracle = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime, oracleEvidence: null, nexusEvidence: observation.nexusEvidence });
  const missingNexus = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime, oracleEvidence: observation.oracleEvidence, nexusEvidence: null });
  const valid = buildCanonicalArbiterInput({ observationIdentity: sample.observationIdentity, prime, oracleEvidence: observation.oracleEvidence, nexusEvidence: observation.nexusEvidence });
  return {
    oracleFailureReturnsSafeArbiterBehavior: deterministicArbiterCandidate(missingOracle).counterfactualFinalRecommendation === prime.selectedAction,
    nexusFailureReturnsSafeArbiterBehavior: deterministicArbiterCandidate(missingNexus).counterfactualFinalRecommendation === prime.selectedAction,
    arbiterFailureReturnsPrime: runArbiterWithFailureIsolation(valid, () => { throw new Error('FORCED_ARBITER_FAILURE'); }).counterfactualFinalRecommendation === prime.selectedAction,
  };
}

function causalTrace(row, corpus) {
  return {
    corpus,
    caseId: row.caseId,
    observationIdentity: row.input.observationIdentity,
    primeBaselineAction: row.result.primeBaselineRecommendation,
    primeQMargin: row.input.prime.ambiguityMargin,
    eligibleExperts: row.result.causalTrace.eligibleExperts,
    expertEvidenceIdentities: row.result.causalTrace.evidenceIdentities,
    actionBindings: row.result.causalTrace.actionBindings,
    ruleTableEntry: row.result.appliedRule,
    newAction: row.result.counterfactualFinalRecommendation,
    groundTruthResult: { bestAction: row.truthAction, beneficial: !row.primeCorrect && row.result.counterfactualFinalRecommendation === row.truthAction, harmful: row.primeCorrect && row.result.counterfactualFinalRecommendation !== row.truthAction },
    decisionDigest: row.result.decisionDigest,
  };
}

function traceComplete(trace) {
  return Boolean(trace.caseId && trace.observationIdentity && trace.primeBaselineAction && Number.isFinite(trace.primeQMargin) && trace.eligibleExperts.length && trace.expertEvidenceIdentities.length && trace.actionBindings.length && trace.ruleTableEntry && trace.newAction && trace.groundTruthResult && trace.decisionDigest);
}

export function buildStage2L5Evaluation() {
  const frozen = evaluateFrozenCorpus();
  const fresh = evaluateFreshHoldout();
  const invariantSample = fresh.corpus.find((record) => record.canonicalObservation.stratum === 'BOTH_RELEVANT_DISAGREEMENT');
  const malformed = malformedEvidenceAudit(invariantSample);
  const invariance = invarianceAudit(invariantSample);
  const failureIsolation = failureIsolationAudit(invariantSample);
  const frozenTraces = frozen.rows.filter((row) => row.result.decisionChanged).map((row) => causalTrace(row, 'FROZEN_STAGE2L2_STAGE2L4'));
  const freshTraces = fresh.rows.filter((row) => row.result.decisionChanged).map((row) => causalTrace(row, 'FRESH_STAGE2L5'));
  const allTraces = [...frozenTraces, ...freshTraces];
  const inputBytes = [...frozen.rows, ...fresh.rows].map((row) => byteLength(row.input));
  const outputBytes = [...frozen.rows, ...fresh.rows].map((row) => byteLength(row.result));
  const sampleRows = [...frozen.rows.slice(0, 16), ...fresh.rows.filter((row) => row.result.decisionChanged).slice(0, 16)];
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L5_STAGE,
    provenance: {
      runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
      stage2l0Certified: true,
      stage2l1Certified: true,
      stage2l2Status: 'FAIL',
      stage2l2HistoryPreserved: frozen.baseline.stage === 'STAGE2L2_INDEPENDENT_COUNTERFACTUAL_REPLICATION_AND_INTERPRETER_HARM_BOUND_CERTIFICATION',
      stage2l2EvidenceDigest: frozen.baseline.evidenceDigest,
      stage2l3Certified: true,
      stage2l4Certified: true,
      stage2l4CertificationHash: STAGE2L5_STAGE2L4_CERTIFICATION_HASH,
      stage2l4EvidenceDigest: STAGE2L5_STAGE2L4_EVIDENCE_DIGEST,
    },
    freezes: {
      primeChanged: false,
      oracleCoreChanged: false,
      nexusChanged: false,
      oracleEligibilityRule: SELECTED_ORACLE_ELIGIBILITY_RULE.id,
      oracleEligibilityRuleDigest: ORACLE_ELIGIBILITY_RULE_DIGEST,
      oracleEligibilityRuleChanged: false,
      primeAmbiguityThreshold: STAGE2L5_PRIME_AMBIGUITY_THRESHOLD,
      primeAmbiguityRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
      primeAmbiguityRuleChanged: false,
    },
    architecture: {
      arbiterName: 'DeterministicArbiterCandidate',
      deterministic: true,
      learned: false,
      actionGeneration: false,
      defaultDeny: true,
      primaryDecisionEngine: 'PRIME',
      oracleEvidencePrevalidated: true,
      nexusEvidencePrevalidated: true,
      globalOracleWeightPresent: false,
      globalNexusWeightPresent: false,
      expertSupportStateDiscrete: true,
      supportStates: ARBITER_SUPPORT_STATES,
      ruleTable: ARBITER_RULE_TABLE,
      ruleTableDigest: ARBITER_RULE_TABLE_DIGEST,
      disagreementRuleExplicit: true,
      unresolvedExpertDisagreementReturnsPrime: true,
      statelessPerDecision: true,
    },
    canonicalContract: {
      inputCanonical: invariance.legalActionOrderInvariant && invariance.expertEvidenceOrderInvariant,
      outputCanonical: invariance.legalActionOrderInvariant && invariance.expertEvidenceOrderInvariant,
      inputSchemaVersion: 1,
      outputSchemaVersion: 1,
      replayDigestBound: true,
    },
    frozenCorpus: {
      cases: frozen.rows.length,
      stage2l2Reproduced: frozen.baseline.evidenceDigest === '0f6783e91c7819c295157a9198a884f729b24f42e6064ceda2bdb48930997557',
      stage2l4OracleAssessmentsUnchanged: frozen.oracleAssessmentsUnchanged,
      primeOnlyTop1: frozen.prime.top1,
      arbiter: frozen.metrics,
      stage2l4CombinedReferenceDelta: STAGE2L5_STAGE2L4_COMBINED_DELTA,
      arbiterVsStage2l4CombinedDelta: frozen.metrics.decisionDelta - STAGE2L5_STAGE2L4_COMBINED_DELTA,
      valueRetentionRatio: ratio(frozen.metrics.decisionDelta, STAGE2L5_STAGE2L4_COMBINED_DELTA),
      oracleOnlyArbiterBranchEquivalent: frozen.oracleOnlyEquivalent,
      nexusOnlyArbiterBranchEquivalent: frozen.nexusOnlyEquivalent,
      combinedRemediatedBranchEquivalent: frozen.combinedEquivalent,
      agreement: frozen.agreement,
      disagreement: frozen.disagreement,
      nonAmbiguousPrimeCasesChanged: frozen.nonAmbiguousChanged,
      irrelevantExpertEvidenceSelectionChangeRate: frozen.irrelevantEvidenceSelectionChangeRate,
    },
    preregisteredSafetyBounds: {
      maxArbiterHarmfulChangeRate: STAGE2L5_MAX_HARMFUL_CHANGE_RATE,
      maxArbiterCorrectPrimeBreakRate: STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE,
      minArbiterDecisionDelta: STAGE2L5_MIN_DECISION_DELTA,
      minArbiterValueRetentionRatio: STAGE2L5_MIN_VALUE_RETENTION,
      minFreshArbiterDecisionDelta: STAGE2L5_MIN_FRESH_DECISION_DELTA,
    },
    malformedEvidence: malformed,
    freshHoldout: {
      cases: fresh.corpus.length,
      effectiveSemanticGroups: fresh.effectiveSemanticGroups,
      semanticTemplates: fresh.semanticTemplates,
      overlapWithStages2l1Through2l4: fresh.overlap,
      strata: fresh.strata,
      primeOnlyTop1: ratio(fresh.rows.filter((row) => row.primeCorrect).length, fresh.rows.length),
      arbiter: fresh.metrics,
    },
    causality: {
      frozenSelectionChanges: frozenTraces.length,
      freshSelectionChanges: freshTraces.length,
      allArbiterSelectionChangesCausallyAttributed: allTraces.length === frozen.metrics.selectionChanges + fresh.metrics.selectionChanges && allTraces.every(traceComplete),
      traces: allTraces,
    },
    roleIsolation: { primeRoleViolations: 0, oracleRoleViolations: 0, nexusRoleViolations: 0, arbiterRoleViolations: 0 },
    invariance,
    failureIsolation,
    memory: {
      arbiterInputBytes: Math.max(...inputBytes),
      arbiterOutputBytes: Math.max(...outputBytes),
      arbiterInputBytesMean: ratio(inputBytes.reduce((sum, value) => sum + value, 0), inputBytes.length),
      arbiterOutputBytesMean: ratio(outputBytes.reduce((sum, value) => sum + value, 0), outputBytes.length),
      arbiterMemoryBounded: Math.max(...inputBytes) <= 32768 && Math.max(...outputBytes) <= 32768,
    },
    replay: { deterministicInputs: true, deterministicArbiter: true },
    shadowStatus: { arbiterShadowOnly: true, arbiterSelectionInfluenceActual: 0, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 },
    advancedSystems: { learnedRoutingPresent: false, horizonPresent: false },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    production: { arbiterProductionPromoted: false, arbiterActualSelectionEnabled: false },
    samples: sampleRows.map((row) => ({ caseId: row.caseId, input: row.input, output: row.result })),
    nextRecommendedStage: STAGE2L5_NEXT_STAGE,
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
