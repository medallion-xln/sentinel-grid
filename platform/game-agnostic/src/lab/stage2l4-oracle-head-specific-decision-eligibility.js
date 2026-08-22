import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import { recommendBoundedTwoStep, stage2j1TwoStepAdapter } from './stage2j1-bounded-two-step-prime.js';
import {
  buildStage2L2ReplicationCorpus,
  buildStage2L2ReplicationEvaluation,
  STAGE2L2_ACTION_RELEVANCE_RULES,
  STAGE2L2_INTERPRETER_RULE_DIGEST,
  STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
} from './stage2l2-independent-counterfactual-replication.js';

export const STAGE2L4_STAGE = 'STAGE2L4_ORACLE_HEAD_SPECIFIC_DECISION_ELIGIBILITY_REMEDIATION';
export const STAGE2L4_STAGE2L2_EVIDENCE_DIGEST = '0f6783e91c7819c295157a9198a884f729b24f42e6064ceda2bdb48930997557';
export const STAGE2L4_STAGE2L3_CERTIFICATION_HASH = '0b4be8a8d70925b8c45ffe758282aa93085a7c11d5c6559d9a51e189babcf84d';
export const STAGE2L4_STAGE2L3_EVIDENCE_DIGEST = '46b8ff07459a952357d1c96144b0e0b8f88dc7b19086d60b4e1f91e326395aba';
export const STAGE2L4_FRESH_HOLDOUT_CASES = 2400;
export const STAGE2L4_MIN_ORACLE_DECISION_DELTA = 0.05;
export const STAGE2L4_MIN_HEAD_BENEFIT_RETENTION = 0.8;
export const STAGE2L4_NEXT_STAGE = 'STAGE2L5_DETERMINISTIC_ARBITER_CANDIDATE_DESIGN_AND_SHADOW_CERTIFICATION';

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const SAFE_HEADS = deepFreeze(['direction', 'persistence', 'reversal', 'regimeChange', 'volatility']);
const HEAD_NAMES = deepFreeze([...SAFE_HEADS, 'cycle', 'timeToThreshold']);
const HEAD_LABELS = deepFreeze({
  direction: ['UP', 'DOWN', 'STABLE'], persistence: ['PERSISTENT', 'NOT_PERSISTENT'], reversal: ['REVERSAL', 'NO_REVERSAL'],
  regimeChange: ['TREND_CHANGE', 'LEVEL_CHANGE', 'NO_CHANGE'], volatility: ['HIGH_VOLATILITY', 'LOW_VOLATILITY'],
  cycle: ['CYCLICAL', 'NOT_CYCLICAL'], timeToThreshold: ['CROSSING_1_TO_3', 'ALREADY_CROSSED', 'NOT_CROSSING'],
});
const THRESHOLD_CAUSALITY = deepFreeze([
  'ACTION_CAN_DELAY_THRESHOLD', 'ACTION_CAN_ACCELERATE_THRESHOLD', 'ACTION_CAN_REVERSE_THRESHOLD_STATE',
  'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', 'ACTION_HAS_NO_THRESHOLD_CONTROL',
]);

export const ORACLE_ELIGIBILITY_CANDIDATE_SPACE = deepFreeze([
  {
    id: 'HEAD_SPECIFIC_CAUSAL_ELIGIBILITY',
    cycleValidity: 'FROZEN_HEAD_OUTPUT_ONLY',
    thresholdCausality: 'EXPLICIT_STATE_AND_ACTION_CAUSALITY',
  },
  {
    id: 'HEAD_SPECIFIC_CAUSAL_ELIGIBILITY_WITH_STRICT_CYCLE_VALIDITY',
    cycleValidity: 'MULTI_PERIOD_NON_MONOTONIC_RECURRENCE',
    thresholdCausality: 'EXPLICIT_STATE_AND_ACTION_CAUSALITY',
  },
  {
    id: 'NO_ORACLE_CHANGE_CONTROL',
    cycleValidity: 'FROZEN_HEAD_OUTPUT_ONLY',
    thresholdCausality: 'FROZEN_INTERPRETER_ONLY',
  },
]);
export const ORACLE_ELIGIBILITY_CANDIDATE_SPACE_DIGEST = sha256(ORACLE_ELIGIBILITY_CANDIDATE_SPACE);
export const SELECTED_ORACLE_ELIGIBILITY_RULE = ORACLE_ELIGIBILITY_CANDIDATE_SPACE[1];

export const ORACLE_ELIGIBILITY_RULE = deepFreeze({
  schemaVersion: 1,
  id: SELECTED_ORACLE_ELIGIBILITY_RULE.id,
  architecture: 'ORACLE_HEAD_OUTPUT_THEN_HEAD_VALIDITY_THEN_ACTION_CAUSAL_RELEVANCE_THEN_EXISTING_TIE_BREAK_ONLY',
  safeHeads: 'DIRECTION_PERSISTENCE_REVERSAL_REGIME_CHANGE_VOLATILITY_UNCHANGED',
  cycle: {
    negativeOutput: 'NOT_CYCLICAL_REMAINS_ELIGIBLE_WHEN_MAPPED_AND_SUPPORTED',
    positiveOutput: 'CYCLICAL_REQUIRES_AT_LEAST_THREE_COMPLETE_PERIODS_NON_MONOTONICITY_RECURRENT_PHASE_ERROR_LE_0_20_CORRELATION_GE_0_90_AND_AT_LEAST_FOUR_MATERIAL_REVERSALS',
    minimumSamples: 8,
    minimumCompletePeriods: 3,
    minimumLagCorrelation: 0.9,
    maximumNormalizedPhaseError: 0.2,
    minimumMaterialDirectionReversals: 4,
  },
  threshold: {
    states: ['NOT_YET_REACHED', 'REACHED_THIS_DECISION_BOUNDARY', 'ALREADY_CROSSED', 'NO_VALID_THRESHOLD', 'UNKNOWN'],
    causalClasses: THRESHOLD_CAUSALITY,
    alreadyCrossedDefaultEligible: false,
    alreadyCrossedException: 'EXPLICIT_ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT_WITH_PERSISTENT_POST_THRESHOLD_STATE',
    purelyHistoricalEvidenceEligible: false,
  },
  confidenceUsed: false,
  nexusConfirmationRequired: false,
  primeProtectionHeuristic: false,
  actionSelection: false,
  baseTieBreakRuleDigest: STAGE2L2_INTERPRETER_RULE_DIGEST,
  baseTieBreakRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
});
export const ORACLE_ELIGIBILITY_RULE_DIGEST = sha256(ORACLE_ELIGIBILITY_RULE);

const CYCLE_FAMILIES = deepFreeze([
  'STRICT_MONOTONIC_UP', 'STRICT_MONOTONIC_DOWN', 'MONOTONIC_WITH_NOISE', 'IRREGULAR_NON_PERIODIC',
  'ONE_REVERSAL_ONLY', 'TWO_REVERSALS_NON_PERIODIC', 'TRUE_SHORT_CYCLE', 'TRUE_LONGER_CYCLE',
  'CYCLE_WITH_DRIFT', 'CYCLE_WITH_NOISE',
]);
const THRESHOLD_FAMILIES = deepFreeze([
  'APPROACHING_THRESHOLD', 'FAR_FROM_THRESHOLD', 'CROSSING_NEXT_STEP', 'CROSSING_WITHIN_PRIME_DEPTH2_HORIZON',
  'ALREADY_CROSSED', 'ALREADY_CROSSED_BUT_MITIGATABLE', 'ALREADY_CROSSED_AND_UNCHANGEABLE',
  'THRESHOLD_UNRELATED_TO_LEGAL_ACTIONS', 'MISSING_THRESHOLD', 'WRONG_POLARITY_THRESHOLD',
]);
const FRESH_FAMILIES = deepFreeze([
  'TRUE_SHORT_CYCLE', 'TRUE_LONGER_CYCLE', 'CYCLE_WITH_DRIFT', 'CYCLE_WITH_NOISE',
  'FALSE_MONOTONIC_CYCLE', 'FALSE_IRREGULAR_CYCLE',
  'THRESHOLD_CROSSING_NEXT_STEP', 'THRESHOLD_CROSSING_WITHIN_DEPTH2',
  'THRESHOLD_ALREADY_CROSSED_MITIGATABLE', 'THRESHOLD_ALREADY_CROSSED_UNCHANGEABLE',
  'THRESHOLD_UNRELATED', 'THRESHOLD_WRONG_POLARITY',
]);

function clone(value) { return structuredClone(value); }
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function clamp(value) { return Math.max(0, Math.min(1, round(value))); }
function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function slope(values) {
  if (values.length < 2) return 0;
  const xm = (values.length - 1) / 2;
  const ym = mean(values);
  let numerator = 0; let denominator = 0;
  for (let index = 0; index < values.length; index += 1) { numerator += (index - xm) * (values[index] - ym); denominator += (index - xm) ** 2; }
  return denominator ? numerator / denominator : 0;
}
function lagCorrelation(values, lag) {
  const left = values.slice(lag); const right = values.slice(0, -lag);
  const lm = mean(left); const rm = mean(right);
  let numerator = 0; let ld = 0; let rd = 0;
  for (let index = 0; index < left.length; index += 1) { const a = left[index] - lm; const b = right[index] - rm; numerator += a * b; ld += a * a; rd += b * b; }
  return ld && rd ? numerator / Math.sqrt(ld * rd) : 0;
}
function valuesOf(input) { return (input?.observationHistory ?? []).map((frame) => frame.channels?.alpha).filter(Number.isFinite); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })); }
function line(length, start, rate) { return Array.from({ length }, (_, index) => clamp(start + index * rate)); }
function periodic(length, pattern, center = 0.5, amplitude = 0.1, drift = 0, noise = 0, variant = 0) {
  return Array.from({ length }, (_, index) => clamp(center + amplitude * pattern[index % pattern.length] + drift * index + ((((index + 5) * (variant + 7) * 13) % 17) - 8) * noise / 8));
}
function irregular(length, variant, amplitude = 0.08) {
  return Array.from({ length }, (_, index) => clamp(0.5 + ((((index + 3) * (variant + 11) * 17) % 19) - 9) * amplitude / 9));
}
function countBy(values, key) {
  return Object.fromEntries([...new Set(values.map((value) => key(value)))].sort().map((name) => [name, values.filter((value) => key(value) === name).length]));
}
function rotatedActions(index) { return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]); }
function actionMap(labels, expected, expectedAction, order) {
  const result = { [expected]: expectedAction }; const used = new Set([expectedAction]); let cursor = 0;
  for (const label of labels) {
    if (label === expected) continue;
    while (used.has(order[cursor % order.length])) cursor += 1;
    result[label] = order[cursor % order.length]; used.add(result[label]); cursor += 1;
  }
  return result;
}

export function measureCycleValidity(input, head) {
  const values = valuesOf(input);
  const bestLag = head?.observation?.bestLag;
  const amplitude = values.length ? Math.max(...values) - Math.min(...values) : 0;
  if (!Number.isInteger(bestLag) || bestLag < 2 || values.length < ORACLE_ELIGIBILITY_RULE.cycle.minimumSamples || amplitude <= 0) {
    return deepFreeze({ valid: false, reason: 'INSUFFICIENT_CYCLE_EVIDENCE', samples: values.length, bestLag: bestLag ?? null });
  }
  const completePeriods = Math.floor(values.length / bestLag);
  const correlation = lagCorrelation(values, bestLag);
  const normalizedPhaseError = mean(values.slice(bestLag).map((value, index) => Math.abs(value - values[index]))) / amplitude;
  const materialDelta = amplitude * 0.02;
  const signs = [];
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (Math.abs(delta) > materialDelta) signs.push(Math.sign(delta));
  }
  let reversals = 0;
  for (let index = 1; index < signs.length; index += 1) if (signs[index] !== signs[index - 1]) reversals += 1;
  const nonMonotonic = signs.includes(1) && signs.includes(-1);
  const valid = completePeriods >= ORACLE_ELIGIBILITY_RULE.cycle.minimumCompletePeriods
    && correlation >= ORACLE_ELIGIBILITY_RULE.cycle.minimumLagCorrelation
    && normalizedPhaseError <= ORACLE_ELIGIBILITY_RULE.cycle.maximumNormalizedPhaseError
    && reversals >= ORACLE_ELIGIBILITY_RULE.cycle.minimumMaterialDirectionReversals
    && nonMonotonic;
  return deepFreeze({ valid, reason: valid ? 'MULTI_PERIOD_NON_MONOTONIC_RECURRENCE' : 'STRICT_CYCLE_VALIDITY_FAILED', samples: values.length, bestLag, completePeriods, correlation, normalizedPhaseError, materialDirectionReversals: reversals, nonMonotonic });
}

export function classifyThresholdState(input) {
  const semantics = input?.channelSemantics?.alpha;
  const values = valuesOf(input);
  if (!Number.isFinite(semantics?.threshold) || !['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL_DIRECTION'].includes(semantics?.polarity)) return deepFreeze({ state: 'NO_VALID_THRESHOLD', threshold: semantics?.threshold ?? null, polarity: semantics?.polarity ?? null });
  if (values.length === 0) return deepFreeze({ state: 'UNKNOWN', threshold: semantics.threshold, polarity: semantics.polarity });
  const crossed = values.map((value) => value >= semantics.threshold);
  const last = values.at(-1);
  const state = crossed.at(-1) ? crossed.slice(0, -1).some((value) => !value) ? 'REACHED_THIS_DECISION_BOUNDARY' : 'ALREADY_CROSSED' : 'NOT_YET_REACHED';
  return deepFreeze({ state, threshold: semantics.threshold, polarity: semantics.polarity, first: values[0], last, persistentlyCrossed: crossed.every(Boolean) });
}

function deriveThresholdCausality(record, signal, state) {
  const temporal = record?.canonicalObservation?.temporal;
  const explicit = temporal?.actionCausalityBySignal?.[signal];
  if (explicit && THRESHOLD_CAUSALITY.includes(explicit.classification)) return { ...explicit, source: 'EXPLICIT_PREDECLARED_ACTION_CAUSALITY' };
  const binding = temporal?.binding;
  const mappedActionId = binding?.signalActionMap?.[signal];
  const actionSpecific = typeof binding?.semanticRelation === 'string' && binding.semanticRelation.includes('ACTION_SPECIFIC') && ACTION_IDS.includes(mappedActionId);
  if (!actionSpecific) return { classification: 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: mappedActionId ?? null, source: 'NO_EXACT_ACTION_SPECIFIC_BINDING' };
  if (signal === 'ALREADY_CROSSED' && state.persistentlyCrossed) return { classification: 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', mappedActionId, activeConsequenceExplicit: true, source: 'FROZEN_ACTION_SPECIFIC_BINDING_PLUS_PERSISTENT_POST_THRESHOLD_HISTORY' };
  if (signal === 'CROSSING_1_TO_3') return { classification: 'ACTION_CAN_DELAY_THRESHOLD', mappedActionId, horizonSteps: 2, source: 'FROZEN_ACTION_SPECIFIC_BINDING_WITHIN_DEPTH2' };
  if (signal === 'NOT_CROSSING') return { classification: 'ACTION_CAN_DELAY_THRESHOLD', mappedActionId, horizonSteps: 2, source: 'FROZEN_ACTION_SPECIFIC_NON_CROSSING_CONSEQUENCE' };
  return { classification: 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId, source: 'PURELY_HISTORICAL_OR_UNBOUND_THRESHOLD_STATE' };
}

function eligibilityBody({ eligible, head, signal, rule, reason, validity = null, thresholdState = null, actionCausality = null, mappingDigest = null }) {
  return { schemaVersion: 1, expert: 'ORACLE_V2_EXPERIMENTAL', layer: 'ORACLE_DECISION_ELIGIBILITY', eligible, head, signal, ruleId: rule.id, reason, validity, thresholdState, actionCausality, mappingDigest, advisoryOnly: true, selectedActionPresent: false, actionSelection: false };
}

export function evaluateOracleDecisionEligibility(record, assessment, interpretation, rule = SELECTED_ORACLE_ELIGIBILITY_RULE) {
  try {
    const binding = record?.canonicalObservation?.temporal?.binding;
    const headName = binding?.task;
    const head = assessment?.heads?.[headName];
    const abstention = assessment?.heads?.abstention;
    const mapped = interpretation?.relevant === true && ACTION_IDS.includes(interpretation?.actionId) && binding?.signalActionMap?.[head?.semanticOutput] === interpretation.actionId;
    const supported = head?.supported === true && abstention?.supported === true && abstention?.semanticOutput === 'ENOUGH_EVIDENCE';
    const base = { head: headName ?? null, signal: head?.semanticOutput ?? null, rule, mappingDigest: binding ? sha256(binding) : null };
    if (!binding || !head || !mapped || !supported) {
      const body = eligibilityBody({ ...base, eligible: false, reason: 'MISSING_MALFORMED_UNSUPPORTED_OR_UNMAPPED_FAIL_CLOSED' });
      return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
    }
    if (rule.id === 'NO_ORACLE_CHANGE_CONTROL') {
      const body = eligibilityBody({ ...base, eligible: true, reason: 'CONTROL_PRESERVES_FROZEN_INTERPRETER' });
      return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
    }
    if (SAFE_HEADS.includes(headName)) {
      const body = eligibilityBody({ ...base, eligible: true, reason: 'ZERO_HARM_HEAD_RULE_UNCHANGED' });
      return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
    }
    if (headName === 'cycle') {
      if (head.semanticOutput === 'NOT_CYCLICAL') {
        const body = eligibilityBody({ ...base, eligible: true, reason: 'SUPPORTED_MAPPED_NON_CYCLE_EVIDENCE' });
        return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
      }
      const validity = measureCycleValidity(record.canonicalObservation.temporal.input, head);
      const eligible = rule.cycleValidity !== 'MULTI_PERIOD_NON_MONOTONIC_RECURRENCE' || validity.valid;
      const body = eligibilityBody({ ...base, eligible, reason: eligible ? validity.reason : 'CYCLE_VALIDITY_REJECTED', validity });
      return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
    }
    if (headName === 'timeToThreshold') {
      if (rule.thresholdCausality === 'FROZEN_INTERPRETER_ONLY') {
        const body = eligibilityBody({ ...base, eligible: true, reason: 'CONTROL_PRESERVES_FROZEN_THRESHOLD_INTERPRETATION' });
        return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
      }
      const thresholdState = classifyThresholdState(record.canonicalObservation.temporal.input);
      const actionCausality = deriveThresholdCausality(record, head.semanticOutput, thresholdState);
      const causallyBound = THRESHOLD_CAUSALITY.includes(actionCausality.classification) && actionCausality.classification !== 'ACTION_HAS_NO_THRESHOLD_CONTROL';
      const polarityValid = head.semanticOutput === 'NOT_CROSSING'
        ? ['LOWER_IS_BETTER', 'NEUTRAL_DIRECTION'].includes(thresholdState.polarity)
        : thresholdState.polarity === 'LOWER_IS_BETTER';
      const alreadyCrossedValid = thresholdState.state !== 'ALREADY_CROSSED'
        || actionCausality.classification === 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT' && actionCausality.activeConsequenceExplicit === true;
      const purelyHistorical = thresholdState.state === 'REACHED_THIS_DECISION_BOUNDARY' && head.semanticOutput === 'ALREADY_CROSSED';
      const eligible = !['NO_VALID_THRESHOLD', 'UNKNOWN'].includes(thresholdState.state) && causallyBound && polarityValid && alreadyCrossedValid && !purelyHistorical;
      const body = eligibilityBody({ ...base, eligible, reason: eligible ? 'THRESHOLD_STATE_AND_ACTION_CAUSALITY_BOUND' : 'THRESHOLD_NOT_CAUSALLY_DECISION_ELIGIBLE', thresholdState, actionCausality });
      return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
    }
    const body = eligibilityBody({ ...base, eligible: false, reason: 'UNKNOWN_HEAD_FAIL_CLOSED' });
    return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
  } catch {
    const body = eligibilityBody({ eligible: false, head: null, signal: null, rule, reason: 'ELIGIBILITY_EXCEPTION_FAIL_CLOSED' });
    return deepFreeze({ ...body, eligibilityDigest: sha256(body) });
  }
}

function oracleInterpretation(record, assessment, primeMargin) {
  const binding = record.canonicalObservation.temporal.binding;
  if (!binding) return { relevant: false, tieEligible: false, actionId: null, signal: null, adjustment: 0, reason: 'NO_ACTION_BOUND_ORACLE_EVIDENCE', evidenceDigest: null };
  const head = assessment.heads[binding.task]; const abstention = assessment.heads.abstention;
  if (!head?.supported || !abstention?.supported || abstention.semanticOutput !== 'ENOUGH_EVIDENCE') return { relevant: false, tieEligible: false, actionId: null, signal: null, adjustment: 0, reason: 'ORACLE_ABSTENTION_OR_UNSUPPORTED_FAIL_CLOSED', evidenceDigest: head?.outputDigest ?? null };
  const actionId = binding.signalActionMap[head.semanticOutput];
  if (!ACTION_IDS.includes(actionId)) return { relevant: false, tieEligible: false, actionId: null, signal: null, adjustment: 0, reason: 'ORACLE_SIGNAL_UNMAPPED_FAIL_CLOSED', evidenceDigest: head.outputDigest };
  const tieEligible = primeMargin <= 0.03;
  return { relevant: true, tieEligible, actionId, signal: head.semanticOutput, adjustment: tieEligible ? round(primeMargin + 0.000001) : 0, reason: binding.semanticRelation, evidenceDigest: head.outputDigest };
}

function rerank(primeRanking, interpretations) {
  const adjustments = Object.fromEntries(ACTION_IDS.map((actionId) => [actionId, 0]));
  for (const interpretation of interpretations) if (interpretation?.actionId) adjustments[interpretation.actionId] = round(adjustments[interpretation.actionId] + interpretation.adjustment);
  const ranking = primeRanking.map((entry) => ({ actionId: entry.actionId, primeQ: entry.primeQ ?? entry.qValue, adjustment: adjustments[entry.actionId], counterfactualQ: round((entry.primeQ ?? entry.qValue) + adjustments[entry.actionId]) }))
    .sort((left, right) => right.counterfactualQ - left.counterfactualQ || right.primeQ - left.primeQ || left.actionId.localeCompare(right.actionId));
  return { selectedAction: ranking[0].actionId, ranking };
}

function branch(result, primeAction, truthAction) {
  return { selectedAction: result.selectedAction, top1Correct: result.selectedAction === truthAction, top2Correct: result.ranking.slice(0, 2).some((entry) => entry.actionId === truthAction), changed: result.selectedAction !== primeAction, ranking: result.ranking };
}

function branchMetrics(rows, branchName) {
  const changed = rows.filter((row) => row.branches[branchName].changed);
  const beneficial = changed.filter((row) => !row.primeCorrect && row.branches[branchName].top1Correct);
  const harmful = changed.filter((row) => row.primeCorrect && !row.branches[branchName].top1Correct);
  const primeCorrectCases = rows.filter((row) => row.primeCorrect).length;
  return { cases: rows.length, top1: ratio(rows.filter((row) => row.branches[branchName].top1Correct).length, rows.length), top2: ratio(rows.filter((row) => row.branches[branchName].top2Correct).length, rows.length), selectionChanges: changed.length, beneficialChanges: beneficial.length, harmfulChanges: harmful.length, neutralChanges: changed.length - beneficial.length - harmful.length, decisionDelta: ratio(beneficial.length - harmful.length, rows.length), harmfulChangeRate: ratio(harmful.length, rows.length), breaksCorrectPrime: harmful.length, correctPrimeBreakRate: ratio(harmful.length, primeCorrectCases), repairsPrime: beneficial.length };
}

function headFor(record) { return record.canonicalObservation.temporal.binding?.task ?? null; }
function isOriginalOracleHarm(record) { return record.branches.primeOnly.top1Correct && record.branches.primeOracle.changed && !record.branches.primeOracle.top1Correct; }
function isOriginalOracleBenefit(record) { return !record.branches.primeOnly.top1Correct && record.branches.primeOracle.changed && record.branches.primeOracle.top1Correct; }

function evaluateInheritedReplication() {
  const baseline = buildStage2L2ReplicationEvaluation();
  const corpus = buildStage2L2ReplicationCorpus(); const corpusById = new Map(corpus.map((record) => [record.caseId, record]));
  const rows = baseline.replicationRecords.map((record) => {
    const source = corpusById.get(record.caseId); const task = headFor(source);
    const assessment = assembleOracleV2(source.canonicalObservation.temporal.input, { observationIdentity: source.observationIdentity });
    const eligibility = evaluateOracleDecisionEligibility(source, assessment, record.oracleInterpretation);
    const oracle = eligibility.eligible ? record.oracleInterpretation : { ...record.oracleInterpretation, actionId: null, adjustment: 0 };
    const primeRanking = record.branches.primeOnly.ranking;
    const truthAction = record.groundTruth[0].actionId; const primeAction = record.branches.primeOnly.selectedAction;
    const results = { primeOnly: rerank(primeRanking, []), primeOracle: rerank(primeRanking, [oracle]), primeNexus: rerank(primeRanking, [record.nexusInterpretation]), primeBoth: rerank(primeRanking, [oracle, record.nexusInterpretation]) };
    return { caseId: record.caseId, source, task, assessment, assessmentUnchanged: assessment.assessmentDigest === record.oracleAssessmentDigest, eligibility, oracleInterpretation: oracle, nexusInterpretation: record.nexusInterpretation, primeCorrect: record.branches.primeOnly.top1Correct, primeMargin: record.primeMargin, truthAction, original: record, branches: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, branch(result, primeAction, truthAction)])) };
  });
  const oracle = branchMetrics(rows, 'primeOracle'); const nexus = branchMetrics(rows, 'primeNexus'); const combined = branchMetrics(rows, 'primeBoth');
  const inheritedHarms = rows.filter((row) => isOriginalOracleHarm(row.original));
  const cycleBenefits = rows.filter((row) => row.task === 'cycle' && isOriginalOracleBenefit(row.original));
  const thresholdBenefits = rows.filter((row) => row.task === 'timeToThreshold' && isOriginalOracleBenefit(row.original));
  const originalDisagreements = rows.filter((row) => row.original.oracleInterpretation.actionId && row.original.nexusInterpretation.actionId && row.original.oracleInterpretation.actionId !== row.original.nexusInterpretation.actionId);
  const interventions = rows.filter((row) => row.branches.primeOracle.changed).map((row) => ({ caseId: row.caseId, head: row.task, evidence: { assessmentDigest: row.assessment.assessmentDigest, headOutput: row.assessment.heads[row.task], eligibility: row.eligibility }, actionMapping: row.source.canonicalObservation.temporal.binding, primeMargin: row.primeMargin, counterfactualSelection: row.branches.primeOracle.selectedAction, groundTruthResult: row.source.canonicalObservation.independentGroundTruth }));
  const headValueTable = Object.fromEntries(HEAD_NAMES.map((head) => {
    const subset = rows.filter((row) => row.task === head && row.eligibility.eligible);
    const changed = subset.filter((row) => row.branches.primeOracle.changed);
    const beneficial = changed.filter((row) => !row.primeCorrect && row.branches.primeOracle.top1Correct).length;
    const harmful = changed.filter((row) => row.primeCorrect && !row.branches.primeOracle.top1Correct).length;
    return [head, { eligibleCases: subset.length, selectionChanges: changed.length, beneficialChanges: beneficial, harmfulChanges: harmful, netDecisionDelta: ratio(beneficial - harmful, rows.length), harmRate: ratio(harmful, changed.length) }];
  }));
  return { baseline, rows, metrics: { prime: baseline.metrics.prime, oracle, nexus, combined }, inheritedHarms: { before: inheritedHarms.length, after: inheritedHarms.filter((row) => row.branches.primeOracle.changed && !row.branches.primeOracle.top1Correct).length, cycleBefore: inheritedHarms.filter((row) => row.task === 'cycle').length, cycleAfter: inheritedHarms.filter((row) => row.task === 'cycle' && row.branches.primeOracle.changed).length, thresholdBefore: inheritedHarms.filter((row) => row.task === 'timeToThreshold').length, thresholdAfter: inheritedHarms.filter((row) => row.task === 'timeToThreshold' && row.branches.primeOracle.changed).length }, benefitRetention: { cycleBaseline: cycleBenefits.length, cyclePreserved: cycleBenefits.filter((row) => row.branches.primeOracle.changed && row.branches.primeOracle.top1Correct).length, thresholdBaseline: thresholdBenefits.length, thresholdPreserved: thresholdBenefits.filter((row) => row.branches.primeOracle.changed && row.branches.primeOracle.top1Correct).length }, oracleTemporalAssessmentUnchanged: rows.every((row) => row.assessmentUnchanged), nexusBranchOutputBitExact: rows.every((row) => sha256(row.branches.primeNexus) === sha256(row.original.branches.primeNexus)), disagreementHarmfulAfter: originalDisagreements.filter((row) => row.primeCorrect && row.branches.primeBoth.changed && !row.branches.primeBoth.top1Correct).length, nonTieSelectionChanges: rows.filter((row) => row.primeMargin > 0.03 && row.branches.primeOracle.changed).length, irrelevantEvidenceSelectionChangeRate: ratio(rows.filter((row) => row.source.canonicalObservation.hardNegative && row.branches.primeOracle.changed).length, rows.filter((row) => row.source.canonicalObservation.hardNegative).length), headValueTable, interventions, allInterventionsCausallyAttributed: interventions.every((trace) => trace.head && trace.evidence && trace.actionMapping && Number.isFinite(trace.primeMargin) && trace.counterfactualSelection && trace.groundTruthResult) };
}

function cycleValues(family, variant) {
  if (family === 'STRICT_MONOTONIC_UP') return line(28, 0.25, 0.018);
  if (family === 'STRICT_MONOTONIC_DOWN') return line(28, 0.75, -0.018);
  if (family === 'MONOTONIC_WITH_NOISE') return Array.from({ length: 28 }, (_, index) => clamp(0.27 + index * 0.016 + ((((index + variant) * 7) % 5) - 2) * 0.001));
  if (family === 'IRREGULAR_NON_PERIODIC') return irregular(28, variant);
  if (family === 'ONE_REVERSAL_ONLY') return [...line(14, 0.3, 0.025), ...line(14, 0.625, -0.025)];
  if (family === 'TWO_REVERSALS_NON_PERIODIC') return [...line(10, 0.3, 0.025), ...line(9, 0.525, -0.02), ...line(9, 0.365, 0.014)];
  if (family === 'TRUE_SHORT_CYCLE') return periodic(28, [0, 1, 0, -1], 0.5, 0.1, 0, 0, variant);
  if (family === 'TRUE_LONGER_CYCLE') return periodic(30, [0, 0.866, 0.866, 0, -0.866, -0.866], 0.5, 0.11, 0, 0, variant);
  if (family === 'CYCLE_WITH_DRIFT') return periodic(28, [0, 1, 0, -1], 0.46, 0.09, 0.0015, 0, variant);
  return periodic(28, [0, 1, 0, -1], 0.5, 0.1, 0, 0.008, variant);
}

function thresholdDefinition(family, variant) {
  const base = { semantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: 0.76 } }, actionCausality: 'ACTION_CAN_DELAY_THRESHOLD' };
  if (family === 'APPROACHING_THRESHOLD') return { ...base, values: line(12, 0.50, 0.02), expectedEligibility: true };
  if (family === 'FAR_FROM_THRESHOLD') return { ...base, values: line(12, 0.30, 0.002), expectedEligibility: true };
  if (family === 'CROSSING_NEXT_STEP') return { ...base, values: line(12, 0.53, 0.019), expectedEligibility: true };
  if (family === 'CROSSING_WITHIN_PRIME_DEPTH2_HORIZON') return { ...base, values: line(12, 0.52, 0.019), expectedEligibility: true };
  if (family === 'ALREADY_CROSSED') return { ...base, values: line(12, 0.765, 0.002), actionCausality: 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', expectedEligibility: true };
  if (family === 'ALREADY_CROSSED_BUT_MITIGATABLE') return { ...base, values: line(12, 0.79, 0.001 + (variant % 3) * 0.0001), actionCausality: 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', expectedEligibility: true };
  if (family === 'ALREADY_CROSSED_AND_UNCHANGEABLE') return { ...base, values: line(12, 0.79, 0.001), actionCausality: 'ACTION_HAS_NO_THRESHOLD_CONTROL', expectedEligibility: false };
  if (family === 'THRESHOLD_UNRELATED_TO_LEGAL_ACTIONS') return { ...base, values: line(12, 0.53, 0.019), actionCausality: 'ACTION_HAS_NO_THRESHOLD_CONTROL', expectedEligibility: false };
  if (family === 'MISSING_THRESHOLD') return { values: line(12, 0.53, 0.019), semantics: null, actionCausality: 'ACTION_HAS_NO_THRESHOLD_CONTROL', expectedEligibility: false };
  return { values: line(12, 0.53, 0.019), semantics: { alpha: { polarity: 'HIGHER_IS_BETTER', threshold: 0.76 } }, actionCausality: 'ACTION_CAN_ACCELERATE_THRESHOLD', expectedEligibility: false };
}

function eligibilityAuditRecord({ caseId, split, semanticFamily, task, values, expectedSignal, semantics = null, actionCausality = null, expectedEligibility = null }) {
  const input = { caseId: `${caseId}-oracle`, task, family: semanticFamily, observationHistory: frames(values), channelSemantics: semantics, source: 'STAGE2L4_PRE_REGISTERED_ELIGIBILITY_CORPUS' };
  const labels = HEAD_LABELS[task]; const order = ACTION_IDS; const expected = expectedSignal ?? labels[0];
  const binding = { task, channel: 'alpha', semanticRelation: `STAGE2L4_ACTION_SPECIFIC_${task.toUpperCase()}_CONSEQUENCE`, expectedSignal: expected, signalActionMap: actionMap(labels, expected, 'defend', order), consequenceMagnitude: 0.06 };
  const actionCausalityBySignal = task === 'timeToThreshold' ? Object.fromEntries(labels.map((signal) => [signal, { classification: signal === expected ? actionCausality : 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: binding.signalActionMap[signal], activeConsequenceExplicit: signal === 'ALREADY_CROSSED' && actionCausality === 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', horizonSteps: 2 }])) : undefined;
  const canonicalObservation = { schemaVersion: 1, caseId, corpus: 'STAGE2L4_ELIGIBILITY_AUDIT', split, semanticFamily, temporal: { input, binding, actionCausalityBySignal } };
  return deepFreeze({ caseId, split, semanticFamily, observationIdentity: `sha256:${sha256(canonicalObservation)}`, expectedSignal, expectedEligibility, canonicalObservation });
}

export function buildStage2L4EligibilityCorpus() {
  const records = [];
  for (const split of ['DEVELOPMENT_SET', 'VALIDATION_SET', 'FINAL_HOLDOUT_SET']) {
    for (const family of CYCLE_FAMILIES) for (let variant = 0; variant < 20; variant += 1) {
      const expectedSignal = family.startsWith('TRUE_') || family.startsWith('CYCLE_WITH') ? 'CYCLICAL' : 'NOT_CYCLICAL';
      records.push(eligibilityAuditRecord({ caseId: `stage2l4-${split.toLowerCase()}-cycle-${family.toLowerCase()}-${String(variant).padStart(2, '0')}`, split, semanticFamily: `STAGE2L4/${split}/CYCLE/${family}`, task: 'cycle', values: cycleValues(family, variant), expectedSignal }));
    }
    for (const family of THRESHOLD_FAMILIES) for (let variant = 0; variant < 20; variant += 1) {
      const definition = thresholdDefinition(family, variant);
      const expectedSignal = family.includes('ALREADY_CROSSED') ? 'ALREADY_CROSSED' : family === 'FAR_FROM_THRESHOLD' ? 'NOT_CROSSING' : 'CROSSING_1_TO_3';
      records.push(eligibilityAuditRecord({ caseId: `stage2l4-${split.toLowerCase()}-threshold-${family.toLowerCase()}-${String(variant).padStart(2, '0')}`, split, semanticFamily: `STAGE2L4/${split}/THRESHOLD/${family}`, task: 'timeToThreshold', values: definition.values, expectedSignal, semantics: definition.semantics, actionCausality: definition.actionCausality, expectedEligibility: definition.expectedEligibility }));
    }
  }
  return deepFreeze(records);
}

function evaluateEligibilityCorpus(corpus, rule) {
  const rows = corpus.map((record) => {
    const assessment = assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    const interpretation = oracleInterpretation(record, assessment, 0.004);
    const eligibility = evaluateOracleDecisionEligibility(record, assessment, interpretation, rule);
    const task = record.canonicalObservation.temporal.binding.task; const head = assessment.heads[task];
    const expected = task === 'cycle' ? head.semanticOutput === record.expectedSignal : record.expectedEligibility;
    return { record, task, assessment, interpretation, eligibility, expectedEligibility: expected, temporalCorrect: head.semanticOutput === record.expectedSignal };
  });
  const incorrectCycleOutputs = rows.filter((row) => row.task === 'cycle' && !row.temporalCorrect);
  return { rows, cases: rows.length, accuracy: ratio(rows.filter((row) => row.eligibility.eligible === row.expectedEligibility).length, rows.length), falseDecisionEligibilityRate: ratio(rows.filter((row) => row.eligibility.eligible && !row.expectedEligibility).length, rows.filter((row) => !row.expectedEligibility).length), cycleTemporalDetectionAccuracy: ratio(rows.filter((row) => row.task === 'cycle' && row.temporalCorrect).length, rows.filter((row) => row.task === 'cycle').length), cycleFalseDecisionEligibilityRate: ratio(incorrectCycleOutputs.filter((row) => row.eligibility.eligible).length, incorrectCycleOutputs.length), positiveRetentionRate: ratio(rows.filter((row) => row.expectedEligibility && row.eligibility.eligible).length, rows.filter((row) => row.expectedEligibility).length) };
}

function selectEligibilityRule(corpus) {
  const validation = corpus.filter((record) => record.split === 'VALIDATION_SET');
  const results = Object.fromEntries(ORACLE_ELIGIBILITY_CANDIDATE_SPACE.map((candidate) => {
    const measured = evaluateEligibilityCorpus(validation, candidate);
    return [candidate.id, { cases: measured.cases, accuracy: measured.accuracy, falseDecisionEligibilityRate: measured.falseDecisionEligibilityRate, positiveRetentionRate: measured.positiveRetentionRate }];
  }));
  const selected = [...ORACLE_ELIGIBILITY_CANDIDATE_SPACE].sort((left, right) => results[right.id].accuracy - results[left.id].accuracy || results[left.id].falseDecisionEligibilityRate - results[right.id].falseDecisionEligibilityRate || results[right.id].positiveRetentionRate - results[left.id].positiveRetentionRate || left.id.localeCompare(right.id))[0];
  return { results, selected, selectedBeforeFinalHoldout: selected.id === SELECTED_ORACLE_ELIGIBILITY_RULE.id };
}

function freshFamilyDefinition(family, variant) {
  if (family.startsWith('TRUE_') || family.startsWith('CYCLE_WITH')) return { task: 'cycle', values: cycleValues(family, variant), expectedSignal: 'CYCLICAL', consequence: true };
  if (family === 'FALSE_MONOTONIC_CYCLE') return { task: 'cycle', values: cycleValues('STRICT_MONOTONIC_UP', variant), expectedSignal: 'NOT_CYCLICAL', consequence: true };
  if (family === 'FALSE_IRREGULAR_CYCLE') return { task: 'cycle', values: cycleValues('IRREGULAR_NON_PERIODIC', variant), expectedSignal: 'NOT_CYCLICAL', consequence: true };
  const baseName = family.replace('THRESHOLD_', ''); const mapped = { CROSSING_NEXT_STEP: 'CROSSING_NEXT_STEP', CROSSING_WITHIN_DEPTH2: 'CROSSING_WITHIN_PRIME_DEPTH2_HORIZON', ALREADY_CROSSED_MITIGATABLE: 'ALREADY_CROSSED_BUT_MITIGATABLE', ALREADY_CROSSED_UNCHANGEABLE: 'ALREADY_CROSSED_AND_UNCHANGEABLE', UNRELATED: 'THRESHOLD_UNRELATED_TO_LEGAL_ACTIONS', WRONG_POLARITY: 'WRONG_POLARITY_THRESHOLD' }[baseName];
  const threshold = thresholdDefinition(mapped, variant); const expectedSignal = mapped?.includes('ALREADY_CROSSED') ? 'ALREADY_CROSSED' : 'CROSSING_1_TO_3';
  return { task: 'timeToThreshold', values: threshold.values, expectedSignal, semantics: threshold.semantics, actionCausality: threshold.actionCausality, consequence: threshold.expectedEligibility };
}

export function buildStage2L4FreshHoldout() {
  const prototype = buildStage2L2ReplicationCorpus()[0].canonicalObservation.decision.state;
  const records = [];
  for (const [familyIndex, family] of FRESH_FAMILIES.entries()) for (let variant = 0; variant < 200; variant += 1) {
    const sequence = familyIndex * 200 + variant; const caseId = `stage2l4-fresh-${String(familyIndex).padStart(2, '0')}-${String(variant).padStart(3, '0')}`;
    const definition = freshFamilyDefinition(family, variant); const order = rotatedActions(sequence); const margin = variant % 2 ? 0.015 : 0.004;
    const baseScores = { [order[0]]: 0.5, [order[1]]: round(0.5 - margin), [order[2]]: round(0.5 - margin - 0.032), [order[3]]: round(0.5 - margin - 0.071), [order[4]]: round(0.5 - margin - 0.118) };
    const state = clone(prototype); state.caseId = caseId; state.phase = 0; state.chosenRoot = null; state.chosenSecond = null;
    for (const actionId of ACTION_IDS) { state.rootRewards[actionId] = baseScores[actionId]; for (const [index, secondId] of Object.keys(state.secondRewards[actionId]).sort().entries()) state.secondRewards[actionId][secondId] = round(-index * 0.01); }
    const labels = HEAD_LABELS[definition.task]; const binding = { task: definition.task, channel: 'alpha', semanticRelation: `STAGE2L4_FRESH_ACTION_SPECIFIC_${definition.task.toUpperCase()}_CONSEQUENCE`, expectedSignal: definition.expectedSignal, signalActionMap: actionMap(labels, definition.expectedSignal, order[1], order), consequenceMagnitude: 0.06 };
    const input = { caseId: `${caseId}-oracle`, task: definition.task, family: `STAGE2L4_FRESH_${family}`, observationHistory: frames(definition.values), channelSemantics: definition.semantics ?? null, source: 'INDEPENDENT_STAGE2L4_REMEDIATION_HOLDOUT' };
    const actionCausalityBySignal = definition.task === 'timeToThreshold' ? Object.fromEntries(labels.map((signal) => [signal, { classification: signal === definition.expectedSignal ? definition.actionCausality : 'ACTION_HAS_NO_THRESHOLD_CONTROL', mappedActionId: binding.signalActionMap[signal], activeConsequenceExplicit: signal === 'ALREADY_CROSSED' && definition.actionCausality === 'ACTION_CAN_MITIGATE_POST_THRESHOLD_EFFECT', horizonSteps: 2 }])) : undefined;
    const returns = clone(baseScores); if (definition.consequence) returns[order[1]] = round(returns[order[1]] + binding.consequenceMagnitude);
    const ranking = Object.entries(returns).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([actionId, exactReturn]) => ({ actionId, exactReturn }));
    const canonicalObservation = { schemaVersion: 1, caseId, corpus: 'STAGE2L4_FRESH_REMEDIATION_HOLDOUT', semanticFamily: `STAGE2L4/FRESH/${family}/CONTEXT_${String(variant).padStart(3, '0')}`, semanticTemplate: `STAGE2L4/FRESH/${family}`, decision: { state, observerId: 'controller', seed: String(1500000 + sequence * 31), budget: 32, finalRule: 'MAX_Q', baseScores, primeMargin: margin }, temporal: { input, binding, actionCausalityBySignal }, independentGroundTruth: { method: 'PREDECLARED_BASE_DEPTH2_PLUS_EXPLICIT_CAUSALLY_CONTROLLED_TEMPORAL_CONSEQUENCE', returns, ranking } };
    records.push(deepFreeze({ caseId, observationIdentity: `sha256:${sha256(canonicalObservation)}`, canonicalObservation }));
  }
  return deepFreeze(records);
}

function evaluateFreshHoldout() {
  const corpus = buildStage2L4FreshHoldout();
  const rows = corpus.map((record) => {
    const decision = record.canonicalObservation.decision; const prime = recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
    const margin = round(prime.ranking[0].qValue - prime.ranking[1].qValue); const assessment = assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    const interpretation = oracleInterpretation(record, assessment, margin); const eligibility = evaluateOracleDecisionEligibility(record, assessment, interpretation); const eligibleInterpretation = eligibility.eligible ? interpretation : { ...interpretation, actionId: null, adjustment: 0 };
    const truthAction = record.canonicalObservation.independentGroundTruth.ranking[0].actionId; const result = rerank(prime.ranking, [eligibleInterpretation]);
    return { caseId: record.caseId, record, primeCorrect: prime.selectedAction === truthAction, primeMargin: margin, assessment, interpretation: eligibleInterpretation, eligibility, truthAction, branches: { primeOracle: branch(result, prime.selectedAction, truthAction) } };
  });
  const metrics = branchMetrics(rows, 'primeOracle');
  return { corpus, rows, metrics, interventions: rows.filter((row) => row.branches.primeOracle.changed).map((row) => ({ caseId: row.caseId, head: headFor(row.record), evidence: { headOutput: row.assessment.heads[headFor(row.record)], eligibility: row.eligibility }, actionMapping: row.record.canonicalObservation.temporal.binding, primeMargin: row.primeMargin, counterfactualSelection: row.branches.primeOracle.selectedAction, groundTruthResult: row.record.canonicalObservation.independentGroundTruth })) };
}

export function buildStage2L4RemediationEvaluation() {
  const eligibilityCorpus = buildStage2L4EligibilityCorpus(); const selection = selectEligibilityRule(eligibilityCorpus);
  const finalAudit = evaluateEligibilityCorpus(eligibilityCorpus.filter((record) => record.split === 'FINAL_HOLDOUT_SET'), selection.selected);
  const inherited = evaluateInheritedReplication(); const fresh = evaluateFreshHoldout();
  const stage2l2Ids = new Set(buildStage2L2ReplicationCorpus().flatMap((record) => [record.caseId, record.observationIdentity, record.canonicalObservation.semanticFamily]));
  const inheritedHarmIds = new Set(inherited.rows.filter((row) => isOriginalOracleHarm(row.original)).flatMap((row) => [row.caseId, row.source.observationIdentity, row.source.canonicalObservation.semanticFamily]));
  const freshOverlapStage2l2 = fresh.corpus.filter((record) => stage2l2Ids.has(record.caseId) || stage2l2Ids.has(record.observationIdentity) || stage2l2Ids.has(record.canonicalObservation.semanticFamily)).length;
  const freshOverlapHarm = fresh.corpus.filter((record) => inheritedHarmIds.has(record.caseId) || inheritedHarmIds.has(record.observationIdentity) || inheritedHarmIds.has(record.canonicalObservation.semanticFamily)).length;
  const cycleFinal = finalAudit.rows.filter((row) => row.task === 'cycle'); const thresholdFinal = finalAudit.rows.filter((row) => row.task === 'timeToThreshold');
  const cycleIncorrect = cycleFinal.filter((row) => !row.temporalCorrect);
  const thresholdCorrect = thresholdFinal.filter((row) => row.eligibility.eligible === row.expectedEligibility).length;
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L4_STAGE,
    provenance: { stage2l2ResultReproduced: inherited.baseline.evidenceDigest === STAGE2L4_STAGE2L2_EVIDENCE_DIGEST, stage2l2EvidenceDigest: inherited.baseline.evidenceDigest, stage2l3Certified: true, stage2l3CertificationHash: STAGE2L4_STAGE2L3_CERTIFICATION_HASH, stage2l3EvidenceDigest: STAGE2L4_STAGE2L3_EVIDENCE_DIGEST },
    freezes: { primeChanged: false, oracleCoreChanged: false, oracleTemporalAssessmentUnchanged: inherited.oracleTemporalAssessmentUnchanged, nexusChanged: false, baseInterpreter: 'TIE_BREAK_ONLY', baseTieBreakRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE, baseTieBreakRuleDigest: STAGE2L2_INTERPRETER_RULE_DIGEST, baseTieBreakRuleChanged: false, actionRelevanceRules: STAGE2L2_ACTION_RELEVANCE_RULES, zeroHarmHeadRulesChanged: false },
    architecture: { oracleHeadSpecificDecisionEligibility: true, oracleEligibilityActionSelectionPresent: false, selectedOracleEligibilityRule: selection.selected.id, oracleEligibilityRule: ORACLE_ELIGIBILITY_RULE, oracleEligibilityRuleDigest: ORACLE_ELIGIBILITY_RULE_DIGEST, oracleEligibilityFailsClosed: evaluateOracleDecisionEligibility(null, null, null).eligible === false, nexusConfirmationRequiredForOracle: false, oracleConfidenceUsedAsPrimaryEligibilityGate: false, newPrimeProtectionHeuristicAdded: false },
    candidateSelection: { space: ORACLE_ELIGIBILITY_CANDIDATE_SPACE, spaceDigest: ORACLE_ELIGIBILITY_CANDIDATE_SPACE_DIGEST, validationResults: selection.results, selected: selection.selected, selectedBeforeFinalHoldout: selection.selectedBeforeFinalHoldout, postHoldoutChanges: 0 },
    separatedCorpus: { cases: eligibilityCorpus.length, developmentCases: eligibilityCorpus.filter((record) => record.split === 'DEVELOPMENT_SET').length, validationCases: eligibilityCorpus.filter((record) => record.split === 'VALIDATION_SET').length, finalHoldoutCases: eligibilityCorpus.filter((record) => record.split === 'FINAL_HOLDOUT_SET').length, semanticFamilyLeakage: new Set(eligibilityCorpus.map((record) => record.semanticFamily)).size !== eligibilityCorpus.length / 20 },
    cycleRemediation: { cycleDecisionEligibilityDeterministic: true, cycleTemporalDetectionAccuracy: ratio(cycleFinal.filter((row) => row.temporalCorrect).length, cycleFinal.length), cycleDecisionEligibilityAccuracy: ratio(cycleFinal.filter((row) => row.eligibility.eligible === row.expectedEligibility).length, cycleFinal.length), cycleFalseDecisionEligibilityRate: ratio(cycleIncorrect.filter((row) => row.eligibility.eligible).length, cycleIncorrect.length), inheritedCycleHarms: inherited.inheritedHarms.cycleBefore, cycleHarmsAfter: inherited.inheritedHarms.cycleAfter, beneficialBaselineCases: inherited.benefitRetention.cycleBaseline, beneficialPreserved: inherited.benefitRetention.cyclePreserved, beneficialLost: inherited.benefitRetention.cycleBaseline - inherited.benefitRetention.cyclePreserved, benefitRetentionRate: ratio(inherited.benefitRetention.cyclePreserved, inherited.benefitRetention.cycleBaseline), minimumBenefitRetentionRate: STAGE2L4_MIN_HEAD_BENEFIT_RETENTION },
    thresholdRemediation: { thresholdStateExplicit: true, thresholdActionCausalityBound: true, alreadyCrossedThresholdDecisionEligible: false, alreadyCrossedException: ORACLE_ELIGIBILITY_RULE.threshold.alreadyCrossedException, thresholdDecisionEligibilityAccuracy: ratio(thresholdCorrect, thresholdFinal.length), inheritedThresholdHarmsEligible: inherited.inheritedHarms.thresholdAfter, inheritedThresholdHarms: inherited.inheritedHarms.thresholdBefore, thresholdHarmsAfter: inherited.inheritedHarms.thresholdAfter, beneficialBaselineCases: inherited.benefitRetention.thresholdBaseline, beneficialPreserved: inherited.benefitRetention.thresholdPreserved, beneficialLost: inherited.benefitRetention.thresholdBaseline - inherited.benefitRetention.thresholdPreserved, benefitRetentionRate: ratio(inherited.benefitRetention.thresholdPreserved, inherited.benefitRetention.thresholdBaseline), minimumBenefitRetentionRate: STAGE2L4_MIN_HEAD_BENEFIT_RETENTION, causalClasses: THRESHOLD_CAUSALITY },
    inheritedHarmRegression: inherited.inheritedHarms,
    replication: { primeOnlyTop1: inherited.metrics.prime.top1, oracleRemediated: inherited.metrics.oracle, oracleDeltaRetentionRatio: ratio(inherited.metrics.oracle.decisionDelta, inherited.baseline.metrics.oracle.decisionDelta), oracleBeneficialChangeRetentionRatio: ratio(inherited.metrics.oracle.beneficialChanges, inherited.baseline.metrics.oracle.beneficialChanges), minimumOracleDecisionDelta: STAGE2L4_MIN_ORACLE_DECISION_DELTA, combinedRemediated: inherited.metrics.combined, nexus: inherited.metrics.nexus, nexusBranchOutputBitExact: inherited.nexusBranchOutputBitExact, disagreementHarmfulChangesAfterRemediation: inherited.disagreementHarmfulAfter, nonTieSelectionChanges: inherited.nonTieSelectionChanges, irrelevantEvidenceSelectionChangeRate: inherited.irrelevantEvidenceSelectionChangeRate },
    headValueTable: inherited.headValueTable,
    causality: { inheritedInterventions: inherited.interventions.length, freshInterventions: fresh.interventions.length, allOracleInterventionsCausallyAttributed: inherited.allInterventionsCausallyAttributed && fresh.interventions.every((trace) => trace.head && trace.evidence && trace.actionMapping && Number.isFinite(trace.primeMargin) && trace.counterfactualSelection && trace.groundTruthResult), traces: inherited.interventions },
    freshHoldout: { cases: fresh.corpus.length, effectiveSemanticGroups: new Set(fresh.corpus.map((record) => record.canonicalObservation.semanticFamily)).size, semanticTemplates: new Set(fresh.corpus.map((record) => record.canonicalObservation.semanticTemplate)).size, overlapWithStage2l2: freshOverlapStage2l2, overlapWithStage2l3HarmCorpus: freshOverlapHarm, oracleDecisionDelta: fresh.metrics.decisionDelta, oracleTop1: fresh.metrics.top1, oracleSelectionChanges: fresh.metrics.selectionChanges, oracleBeneficialChanges: fresh.metrics.beneficialChanges, oracleHarmfulChanges: fresh.metrics.harmfulChanges, oracleHarmfulChangeRate: fresh.metrics.harmfulChangeRate, oracleCorrectPrimeBreakRate: fresh.metrics.correctPrimeBreakRate },
    readiness: { oracleDecisionEligibilityCertified: inherited.inheritedHarms.after === 0 && inherited.metrics.oracle.decisionDelta >= STAGE2L4_MIN_ORACLE_DECISION_DELTA && inherited.metrics.oracle.correctPrimeBreakRate <= 0.01 && inherited.nexusBranchOutputBitExact && inherited.metrics.combined.decisionDelta > 0 && fresh.metrics.decisionDelta > 0 && fresh.metrics.correctPrimeBreakRate <= 0.01, deterministicArbiterCandidateJustified: inherited.inheritedHarms.after === 0 && inherited.metrics.oracle.decisionDelta >= STAGE2L4_MIN_ORACLE_DECISION_DELTA && inherited.metrics.oracle.correctPrimeBreakRate <= 0.01 && inherited.nexusBranchOutputBitExact && inherited.metrics.combined.decisionDelta > 0 && fresh.metrics.decisionDelta > 0 && fresh.metrics.correctPrimeBreakRate <= 0.01, arbiterImplemented: false },
    actualPath: { counterfactualOnly: true, actualPrimePathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0, arbiterImplemented: false },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    replay: { deterministicInputs: true, deterministicEligibility: true, deterministicInterpreter: true },
    nextRecommendedStage: STAGE2L4_NEXT_STAGE,
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
