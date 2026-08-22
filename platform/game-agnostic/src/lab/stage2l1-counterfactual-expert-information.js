import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { buildStage2J1TwoStepCorpus, recommendBoundedTwoStep, stage2j1TwoStepAdapter } from './stage2j1-bounded-two-step-prime.js';
import { analyzeRelationalDelta, buildStage2K0Corpus, relationalReference } from './stage2k0-nexus-relational-diagnostic.js';
import { STAGE2L0_CAMPAIGN_IDENTITY, STAGE2L0_IMPLEMENTATION_DIGESTS, STAGE2L0_RUNTIME_IDENTITY } from './stage2l0-core-triad-shadow-integration.js';

export const STAGE2L1_STAGE = 'STAGE2L1_COUNTERFACTUAL_EXPERT_INFORMATION_DECISION_DELTA_MEASUREMENT_WITHOUT_AUTHORITY';
export const STAGE2L1_STAGE2L0_CERTIFICATION_HASH = '25430e8174e47e0ff555e31af9e8b132ef3394c283ea207f2995f49abee2c733';
export const STAGE2L1_TOTAL_CASES = 4000;
export const STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE = 0.05;

export const EXPERT_INTERPRETATION_SEARCH_SPACE = deepFreeze([
  {
    id: 'NO_CHANGE_CONTROL',
    rule: 'EXPERT_EVIDENCE_RECORDED_WITH_ZERO_COUNTERFACTUAL_EFFECT',
    maximumOracleEffect: 0,
    maximumNexusEffect: 0,
  },
  {
    id: 'TIE_BREAK_ONLY',
    rule: 'BOUND_EXACT_SEMANTIC_EVIDENCE_TO_THE_MAPPED_ACTION_ONLY_WHEN_PRIME_MARGIN_LE_0_03',
    maximumOracleEffect: 0.030001,
    maximumNexusEffect: 0.030001,
  },
  {
    id: 'BOUNDED_Q_CONTEXT',
    rule: 'ADD_BOUNDED_ACTION_SPECIFIC_EVIDENCE_STRENGTH_TO_THE_EXISTING_PRIME_Q_ONLY',
    maximumOracleEffect: 0.1,
    maximumNexusEffect: 0.1,
  },
  {
    id: 'EVIDENCE_ONLY_RERANK',
    rule: 'RERANK_ONLY_ACTIONS_WITH_EXACT_SEMANTIC_BINDINGS_BY_PLACING_BOUND_EVIDENCE_ABOVE_THE_PRIME_RANGE',
    maximumOracleEffect: 0.250001,
    maximumNexusEffect: 0.250001,
  },
]);

export const EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST = sha256(EXPERT_INTERPRETATION_SEARCH_SPACE);

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const SPLITS = deepFreeze(['DEVELOPMENT', 'VALIDATION', 'FINAL_HOLDOUT']);
const RELEVANCE_CLASSES = deepFreeze(['ORACLE_ONLY', 'NEXUS_ONLY', 'COMBINED', 'NEITHER']);
const MARGIN_BUCKETS = deepFreeze([
  { id: 'MARGIN_0_001', minimum: 0, maximum: 0.01 },
  { id: 'MARGIN_001_003', minimum: 0.01, maximum: 0.03 },
  { id: 'MARGIN_003_006', minimum: 0.03, maximum: 0.06 },
  { id: 'MARGIN_006_010', minimum: 0.06, maximum: 0.1 },
  { id: 'MARGIN_GT_010', minimum: 0.1, maximum: Infinity },
]);

const ORACLE_LABELS = deepFreeze({
  direction: ['UP', 'DOWN', 'STABLE'],
  persistence: ['PERSISTENT', 'NOT_PERSISTENT'],
  reversal: ['REVERSAL', 'NO_REVERSAL'],
  regimeChange: ['TREND_CHANGE', 'LEVEL_CHANGE', 'NO_CHANGE'],
  volatility: ['HIGH_VOLATILITY', 'LOW_VOLATILITY'],
  cycle: ['CYCLICAL', 'NOT_CYCLICAL'],
  timeToThreshold: ['CROSSING_1_TO_3', 'ALREADY_CROSSED', 'NOT_CROSSING'],
});

const ORACLE_SEMANTIC_FAMILIES = deepFreeze([
  'RESOURCE_DEPLETION_RATE', 'RISK_ESCALATION_WINDOW', 'COMBAT_MOMENTUM_REVERSAL', 'ENEMY_PRESSURE_TREND',
  'SUPPLY_TIME_TO_THRESHOLD', 'CYCLIC_VULNERABILITY_TIMING', 'TACTICAL_REGIME_CHANGE', 'DELAYED_POSITION_DETERIORATION',
  'RECOVERY_TREND_PERSISTENCE', 'AMMO_RESERVE_REVERSAL', 'WATER_RESERVE_THRESHOLD', 'REINFORCEMENT_PRESSURE_CYCLE',
  'POWER_LOAD_VOLATILITY', 'DEFENSE_ATTRITION_DIRECTION', 'MISSION_CLOCK_THRESHOLD', 'SETTLEMENT_RECOVERY_REGIME',
  'BOSS_MOMENTUM_REVERSAL', 'SUPPLY_INTERRUPTION_PERSISTENCE', 'PATROL_PRESSURE_VOLATILITY', 'EVACUATION_WINDOW_CYCLE',
]);

const NEXUS_SEMANTIC_FAMILIES = deepFreeze([
  'CRITICAL_TARGET_DEPENDENCY', 'REDUNDANT_TARGET_PATH', 'SINGLE_POINT_OF_FAILURE', 'ALTERNATE_SUPPORT_PATH',
  'SUPPORT_NETWORK_REMOVAL', 'RESOURCE_DEPENDENCY_CHAIN', 'SETTLEMENT_BOTTLENECK', 'COMMUNICATION_RELAY',
  'DEFENSIVE_NETWORK', 'MISSION_DEPENDENCY', 'POWER_NODE_RESTORATION', 'WATER_PUMP_CRITICALITY',
  'REINFORCEMENT_RELAY_REMOVAL', 'REDUNDANT_SUPPLY_ROUTE', 'PERIMETER_SUPPORT_GRAPH', 'COMMAND_RELAY_BOTTLENECK',
  'PRODUCTION_CHAIN_DEPENDENCY', 'BACKUP_LINK_COUNTERFACTUAL', 'BRIDGE_EDGE_CRITICALITY', 'MULTI_SUPPLIER_REDUNDANCY',
]);

const COMBINED_SEMANTIC_FAMILIES = deepFreeze([
  'CRITICAL_WATER_PUMP_WORSENING_RESERVE', 'CRITICAL_ENEMY_RELAY_RISING_PRESSURE',
  'REDUNDANT_RESOURCE_SOURCE_IMMINENT_DEPLETION', 'BOSS_SUPPORT_NETWORK_CYCLIC_WINDOW',
  'POWER_BOTTLENECK_RISING_LOAD', 'MISSION_RELAY_DELAYED_DETERIORATION',
  'DEFENSIVE_SPOF_ESCALATING_ATTACK', 'ALTERNATE_SUPPLY_ROUTE_FALLING_RESERVE',
  'SETTLEMENT_PUMP_RECOVERY_TREND', 'REINFORCEMENT_NETWORK_REGIME_CHANGE',
  'COMMUNICATION_RELAY_VOLATILE_PRESSURE', 'RESOURCE_CHAIN_THRESHOLD_CROSSING',
  'REDUNDANT_DEFENSE_CYCLIC_EXPOSURE', 'CRITICAL_SUPPORT_MOMENTUM_REVERSAL',
  'BACKUP_POWER_LINK_RECOVERY_PERSISTENCE', 'MISSION_DEPENDENCY_CLOCK_DEPLETION',
  'MULTI_SUPPLIER_LOAD_VOLATILITY', 'PERIMETER_BRIDGE_DELAYED_LOSS',
  'COMMAND_NETWORK_PRESSURE_DIRECTION', 'WATER_ROUTE_REPAIR_REGIME_CHANGE',
]);

const NEITHER_SEMANTIC_FAMILIES = deepFreeze([
  'IRRELEVANT_WEATHER_CONTEXT', 'UNBOUND_BACKGROUND_CHATTER', 'DECORATIVE_ENTITY_GRAPH', 'STABLE_NON_TARGET_RESOURCE',
  'UNRELATED_CYCLE_SIGNAL', 'DISCONNECTED_BACKGROUND_COMPONENT', 'UNBOUND_VOLATILITY', 'NON_ACTIONABLE_HISTORY',
  'OFF_TARGET_REDUNDANCY', 'NON_DECISION_THRESHOLD', 'UNRELATED_RECOVERY_SIGNAL', 'DECORATIVE_RELAY',
  'STABLE_BACKGROUND_PROCESS', 'NON_TARGET_DEPENDENCY', 'IRRELEVANT_REVERSAL', 'DISCONNECTED_SUPPLY_GRAPH',
  'UNBOUND_PRESSURE_TREND', 'NON_ACTIONABLE_BOTTLENECK', 'BACKGROUND_REGIME_CHANGE', 'UNMAPPED_ALTERNATE_PATH',
]);

const FAMILY_BY_RELEVANCE = deepFreeze({
  ORACLE_ONLY: ORACLE_SEMANTIC_FAMILIES,
  NEXUS_ONLY: NEXUS_SEMANTIC_FAMILIES,
  COMBINED: COMBINED_SEMANTIC_FAMILIES,
  NEITHER: NEITHER_SEMANTIC_FAMILIES,
});

function clone(value) { return structuredClone(value); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function round(value) { return Number(value.toFixed(6)); }

function splitForFamilyIndex(index) {
  if (index < 7) return 'DEVELOPMENT';
  if (index < 14) return 'VALIDATION';
  return 'FINAL_HOLDOUT';
}

function rotatedActions(index) {
  return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]);
}

function actionMapForExpected(labels, expected, expectedAction, order) {
  const used = new Set([expectedAction]);
  const result = { [expected]: expectedAction };
  let cursor = 0;
  for (const label of labels) {
    if (label === expected) continue;
    while (used.has(order[cursor % order.length])) cursor += 1;
    result[label] = order[cursor % order.length];
    used.add(result[label]);
    cursor += 1;
  }
  return result;
}

function nexusLabel(reference, input) {
  if (reference.redundant) return 'REDUNDANT_TARGET';
  const candidateId = input.query.candidateType === 'node' ? input.query.candidateNodeId : input.query.candidateEdgeId;
  if (reference.spofNodes.includes(candidateId) || reference.spofEdges.includes(candidateId) || reference.counterfactual.consequence === 'BECOMES_DISCONNECTED') return 'CRITICAL_TARGET';
  return 'CONNECTED_TARGET';
}

function buildPrimeState(prototype, caseId, globalIndex) {
  const state = clone(prototype);
  const order = rotatedActions(globalIndex);
  const margins = [0.005, 0.02, 0.045, 0.08, 0.15];
  const margin = margins[globalIndex % margins.length];
  const baseScores = {
    [order[0]]: 0.5,
    [order[1]]: round(0.5 - margin),
    [order[2]]: round(0.5 - margin - 0.035),
    [order[3]]: round(0.5 - margin - 0.075),
    [order[4]]: round(0.5 - margin - 0.12),
  };
  state.caseId = caseId;
  state.category = 'STAGE2L1_COUNTERFACTUAL_DECISION';
  state.phase = 0;
  state.chosenRoot = null;
  state.chosenSecond = null;
  for (const actionId of ACTION_IDS) {
    state.rootRewards[actionId] = baseScores[actionId];
    const secondIds = Object.keys(state.secondRewards[actionId]).sort();
    for (const [secondIndex, secondId] of secondIds.entries()) state.secondRewards[actionId][secondId] = round(-secondIndex * 0.01);
  }
  return { state, order, margin, baseScores };
}

function buildOracleBinding(input, order, variant, relevanceClass) {
  if (!['ORACLE_ONLY', 'COMBINED'].includes(relevanceClass)) return null;
  const labels = ORACLE_LABELS[input.task];
  if (!labels) throw new Error(`STAGE2L1_UNSUPPORTED_ORACLE_TASK:${input.task}`);
  const primeAlsoSupported = variant % 5 === 0;
  const expectedAction = primeAlsoSupported ? order[0] : order[1];
  return deepFreeze({
    task: input.task,
    channel: 'alpha',
    sourceFamily: input.family,
    semanticRelation: `ACTION_SPECIFIC_${input.task.toUpperCase()}_CONSEQUENCE`,
    expectedSignal: input.expected,
    signalActionMap: actionMapForExpected(labels, input.expected, expectedAction, order),
    consequenceMagnitude: round(0.045 + (variant % 4) * 0.025),
  });
}

function buildNexusBinding(input, reference, order, variant, relevanceClass, oracleBinding) {
  if (!['NEXUS_ONLY', 'COMBINED'].includes(relevanceClass)) return null;
  const expectedLabel = nexusLabel(reference, input);
  const agreement = relevanceClass === 'COMBINED' && variant % 2 === 0;
  const primeAlsoSupported = relevanceClass === 'NEXUS_ONLY' && variant % 5 === 0;
  const expectedAction = agreement ? oracleBinding.signalActionMap[oracleBinding.expectedSignal] : primeAlsoSupported ? order[0] : relevanceClass === 'COMBINED' ? order[2] : order[1];
  const labels = ['CRITICAL_TARGET', 'REDUNDANT_TARGET', 'CONNECTED_TARGET'];
  return deepFreeze({
    candidateType: input.query.candidateType,
    targetIdentity: input.query.candidateType === 'node' ? input.query.candidateNodeId : input.query.candidateEdgeId,
    semanticRelation: 'TARGET_BOUND_EXACT_RELATIONAL_COUNTERFACTUAL',
    expectedSignal: expectedLabel,
    signalActionMap: actionMapForExpected(labels, expectedLabel, expectedAction, order),
    consequenceMagnitude: round(0.05 + (variant % 4) * 0.025),
  });
}

function sourcePools() {
  const oracleCases = buildOracleV2Holdout().filter((entry) => entry.task !== 'abstention');
  const oracleFamilies = [...new Set(oracleCases.map((entry) => `${entry.task}/${entry.family}`))].sort();
  const oracleFamilySplit = new Map(oracleFamilies.map((family, index) => [family, SPLITS[index % SPLITS.length]]));
  const oracle = Object.fromEntries(SPLITS.map((split) => [split, oracleCases.filter((entry) => oracleFamilySplit.get(`${entry.task}/${entry.family}`) === split)]));
  const nexusCases = buildStage2K0Corpus();
  const nexusFamilies = [...new Set(nexusCases.map((entry) => entry.family))].sort();
  const nexusFamilySplit = new Map(nexusFamilies.map((family, index) => [family, SPLITS[index % SPLITS.length]]));
  const nexus = Object.fromEntries(SPLITS.map((split) => [split, nexusCases.filter((entry) => nexusFamilySplit.get(entry.family) === split)]));
  return { oracle, nexus };
}

export function buildStage2L1DecisionCorpus() {
  const prototype = buildStage2J1TwoStepCorpus()[0].state;
  const pools = sourcePools();
  const cursors = Object.fromEntries(SPLITS.map((split) => [split, { oracle: 0, nexus: 0 }]));
  const cases = [];
  for (const relevanceClass of RELEVANCE_CLASSES) {
    for (const [familyIndex, family] of FAMILY_BY_RELEVANCE[relevanceClass].entries()) {
      const split = splitForFamilyIndex(familyIndex);
      for (let variant = 0; variant < 50; variant += 1) {
        const globalIndex = cases.length;
        const caseId = `stage2l1-${relevanceClass.toLowerCase()}-${String(familyIndex).padStart(2, '0')}-${String(variant).padStart(2, '0')}`;
        const oracleSource = pools.oracle[split][cursors[split].oracle % pools.oracle[split].length];
        const nexusSource = pools.nexus[split][cursors[split].nexus % pools.nexus[split].length];
        cursors[split].oracle += 1;
        cursors[split].nexus += 1;
        const oracleInput = clone(oracleSource);
        const nexusInput = {
          caseId: nexusSource.caseId,
          split: nexusSource.split,
          family: nexusSource.family,
          gameDomain: nexusSource.gameDomain,
          semanticGroup: nexusSource.semanticGroup,
          canonicalState: clone(nexusSource.canonicalState),
          query: clone(nexusSource.query),
          mutation: clone(nexusSource.mutation),
        };
        const nexusTruth = relationalReference(nexusInput);
        const { state, order, margin, baseScores } = buildPrimeState(prototype, caseId, globalIndex);
        const oracleBinding = buildOracleBinding(oracleInput, order, variant, relevanceClass);
        const nexusBinding = buildNexusBinding(nexusInput, nexusTruth, order, variant, relevanceClass, oracleBinding);
        const groundTruthReturns = clone(baseScores);
        if (oracleBinding) groundTruthReturns[oracleBinding.signalActionMap[oracleBinding.expectedSignal]] = round(groundTruthReturns[oracleBinding.signalActionMap[oracleBinding.expectedSignal]] + oracleBinding.consequenceMagnitude);
        if (nexusBinding) groundTruthReturns[nexusBinding.signalActionMap[nexusBinding.expectedSignal]] = round(groundTruthReturns[nexusBinding.signalActionMap[nexusBinding.expectedSignal]] + nexusBinding.consequenceMagnitude);
        const groundTruthRanking = Object.entries(groundTruthReturns).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([actionId, exactReturn]) => ({ actionId, exactReturn }));
        const semanticFamily = `${relevanceClass}/${family}`;
        const canonicalObservation = {
          schemaVersion: 1,
          caseId,
          split,
          semanticFamily,
          semanticGroup: `${semanticFamily}/mechanic-${String(variant).padStart(2, '0')}`,
          relevanceClass,
          decision: { state, observerId: 'controller', seed: String(710000 + globalIndex * 17), budget: 32, finalRule: 'MAX_Q', baseScores, primeMargin: margin },
          temporal: { input: oracleInput, binding: oracleBinding },
          relational: { input: nexusInput, binding: nexusBinding },
          independentGroundTruth: { method: 'EXACT_BASE_DEPTH2_RETURN_PLUS_EXACT_DECLARED_TEMPORAL_CONSEQUENCE_PLUS_EXACT_RELATIONAL_REFERENCE_CONSEQUENCE', returns: groundTruthReturns, ranking: groundTruthRanking },
        };
        cases.push(deepFreeze({ caseId, observationIdentity: `sha256:${sha256(canonicalObservation)}`, canonicalObservation }));
      }
    }
  }
  return deepFreeze(cases.sort((left, right) => left.caseId.localeCompare(right.caseId)));
}

function oracleInterpretation(record, oracle, candidate, primeMargin) {
  const binding = record.canonicalObservation.temporal.binding;
  const zero = { relevant: false, actionId: null, signal: null, strength: 0, adjustment: 0, reason: 'NO_ACTION_BOUND_ORACLE_EVIDENCE', evidenceDigest: null };
  if (!binding || candidate.id === 'NO_CHANGE_CONTROL') return zero;
  const head = oracle.heads[binding.task];
  const abstentionAllows = oracle.heads.abstention.semanticOutput === 'ENOUGH_EVIDENCE' && oracle.heads.abstention.supported;
  const actionId = head?.supported && abstentionAllows ? binding.signalActionMap[head.semanticOutput] : null;
  if (!actionId) return { ...zero, reason: abstentionAllows ? 'UNMAPPED_OR_UNSUPPORTED_TASK_SIGNAL' : 'ORACLE_ABSTENTION_SUPPRESSED_EFFECT', evidenceDigest: head?.outputDigest ?? null };
  const strength = round(Math.max(0.25, Math.min(1, head.confidence / 1_000_000)));
  let adjustment = 0;
  if (candidate.id === 'TIE_BREAK_ONLY' && primeMargin <= 0.03) adjustment = round(primeMargin + 0.000001);
  if (candidate.id === 'BOUNDED_Q_CONTEXT') adjustment = round(Math.min(candidate.maximumOracleEffect, 0.1 * strength));
  if (candidate.id === 'EVIDENCE_ONLY_RERANK') adjustment = round(candidate.maximumOracleEffect * strength);
  return { relevant: true, actionId, signal: head.semanticOutput, strength, adjustment, reason: binding.semanticRelation, evidenceDigest: head.outputDigest, confidence: head.confidence, abstentionAllows };
}

function nexusInterpretation(record, nexus, candidate, primeMargin) {
  const binding = record.canonicalObservation.relational.binding;
  const zero = { relevant: false, actionId: null, signal: null, strength: 0, adjustment: 0, reason: 'NO_ACTION_BOUND_NEXUS_EVIDENCE', evidenceDigest: null };
  if (!binding || candidate.id === 'NO_CHANGE_CONTROL') return zero;
  const signal = nexusLabel({ redundant: nexus.redundancy.redundant, spofNodes: nexus.spofNodes, spofEdges: nexus.spofEdges, counterfactual: nexus.counterfactual }, record.canonicalObservation.relational.input);
  const actionId = binding.signalActionMap[signal];
  if (!actionId) return { ...zero, reason: 'UNMAPPED_RELATIONAL_SIGNAL', evidenceDigest: nexus.outputDigest };
  const strength = signal === 'CRITICAL_TARGET' ? 1 : signal === 'REDUNDANT_TARGET' ? 0.85 : 0.6;
  let adjustment = 0;
  if (candidate.id === 'TIE_BREAK_ONLY' && primeMargin <= 0.03) adjustment = round(primeMargin + 0.000001);
  if (candidate.id === 'BOUNDED_Q_CONTEXT') adjustment = round(Math.min(candidate.maximumNexusEffect, 0.1 * strength));
  if (candidate.id === 'EVIDENCE_ONLY_RERANK') adjustment = round(candidate.maximumNexusEffect * strength);
  return { relevant: true, actionId, signal, strength, adjustment, reason: binding.semanticRelation, evidenceDigest: nexus.outputDigest, targetIdentity: binding.targetIdentity };
}

function rerank(prime, interpretations) {
  const adjustments = Object.fromEntries(ACTION_IDS.map((actionId) => [actionId, 0]));
  for (const interpretation of interpretations) if (interpretation.actionId) adjustments[interpretation.actionId] = round(adjustments[interpretation.actionId] + interpretation.adjustment);
  const ranking = prime.ranking.map((entry) => ({ actionId: entry.actionId, primeQ: entry.qValue, adjustment: adjustments[entry.actionId], counterfactualQ: round(entry.qValue + adjustments[entry.actionId]) }))
    .sort((left, right) => right.counterfactualQ - left.counterfactualQ || right.primeQ - left.primeQ || left.actionId.localeCompare(right.actionId));
  return { selectedAction: ranking[0].actionId, ranking, adjustments };
}

function prepareCase(record) {
  const decision = record.canonicalObservation.decision;
  const prime = recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
  const oracle = assembleOracleV2(record.canonicalObservation.temporal.input, { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, observationIdentity: record.observationIdentity });
  const nexus = analyzeRelationalDelta(record.canonicalObservation.relational.input);
  const truth = record.canonicalObservation.independentGroundTruth.ranking;
  const primeTop2 = prime.ranking.slice(0, 2).map((entry) => entry.actionId);
  return { record, prime, oracle, nexus, truth, primeCorrect: prime.selectedAction === truth[0].actionId, primeTop2Correct: primeTop2.includes(truth[0].actionId), primeMargin: round(prime.ranking[0].qValue - prime.ranking[1].qValue) };
}

function evaluatePreparedCase(prepared, candidate) {
  const oracle = oracleInterpretation(prepared.record, prepared.oracle, candidate, prepared.primeMargin);
  const nexus = nexusInterpretation(prepared.record, prepared.nexus, candidate, prepared.primeMargin);
  const primeOnly = rerank(prepared.prime, []);
  const primeOracle = rerank(prepared.prime, [oracle]);
  const primeNexus = rerank(prepared.prime, [nexus]);
  const primeBoth = rerank(prepared.prime, [oracle, nexus]);
  const truthAction = prepared.truth[0].actionId;
  const branch = (result) => ({ selectedAction: result.selectedAction, top1Correct: result.selectedAction === truthAction, top2Correct: result.ranking.slice(0, 2).some((entry) => entry.actionId === truthAction), changed: result.selectedAction !== prepared.prime.selectedAction, ranking: result.ranking });
  return { prepared, candidateId: candidate.id, oracleInterpretation: oracle, nexusInterpretation: nexus, branches: { primeOnly: branch(primeOnly), primeOracle: branch(primeOracle), primeNexus: branch(primeNexus), primeBoth: branch(primeBoth) } };
}

function branchMetrics(rows, branchName) {
  const changed = rows.filter((row) => row.branches[branchName].changed);
  const beneficial = changed.filter((row) => !row.prepared.primeCorrect && row.branches[branchName].top1Correct);
  const harmful = changed.filter((row) => row.prepared.primeCorrect && !row.branches[branchName].top1Correct);
  const neutral = changed.length - beneficial.length - harmful.length;
  return {
    cases: rows.length,
    top1: ratio(rows.filter((row) => row.branches[branchName].top1Correct).length, rows.length),
    top2: ratio(rows.filter((row) => row.branches[branchName].top2Correct).length, rows.length),
    selectionChanges: changed.length,
    beneficialChanges: beneficial.length,
    harmfulChanges: harmful.length,
    neutralChanges: neutral,
    decisionDelta: ratio(beneficial.length - harmful.length, rows.length),
    harmfulChangeRate: ratio(harmful.length, rows.length),
    breaksCorrectPrime: harmful.length,
    repairsPrime: beneficial.length,
    repairRate: ratio(beneficial.length, rows.filter((row) => !row.prepared.primeCorrect).length),
  };
}

function summarizeRows(rows) {
  const prime = {
    top1: ratio(rows.filter((row) => row.prepared.primeCorrect).length, rows.length),
    top2: ratio(rows.filter((row) => row.prepared.primeTop2Correct).length, rows.length),
    correctCases: rows.filter((row) => row.prepared.primeCorrect).length,
    wrongCases: rows.filter((row) => !row.prepared.primeCorrect).length,
  };
  return { prime, oracle: branchMetrics(rows, 'primeOracle'), nexus: branchMetrics(rows, 'primeNexus'), combined: branchMetrics(rows, 'primeBoth') };
}

function selectedCandidate(validationResults) {
  const ranked = validationResults.map((result) => {
    const branches = [result.metrics.oracle, result.metrics.nexus, result.metrics.combined];
    const harmGate = branches.every((branch) => branch.harmfulChangeRate <= STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE);
    const score = branches.reduce((sum, branch) => sum + branch.decisionDelta, 0);
    return { ...result, harmGate, selectionScore: score };
  }).sort((left, right) => Number(right.harmGate) - Number(left.harmGate) || right.selectionScore - left.selectionScore || right.metrics.combined.top1 - left.metrics.combined.top1 || left.candidateId.localeCompare(right.candidateId));
  return { selected: ranked[0].candidateId, ranked: ranked.map(({ rows, ...entry }) => entry) };
}

function marginAnalysis(rows) {
  return Object.fromEntries(MARGIN_BUCKETS.map((bucket) => {
    const subset = rows.filter((row) => row.prepared.primeMargin >= bucket.minimum && row.prepared.primeMargin < bucket.maximum);
    const harmful = subset.filter((row) => row.prepared.primeCorrect && row.branches.primeBoth.changed && !row.branches.primeBoth.top1Correct).length;
    const beneficial = subset.filter((row) => !row.prepared.primeCorrect && row.branches.primeBoth.changed && row.branches.primeBoth.top1Correct).length;
    return [bucket.id, { cases: subset.length, beneficial, harmful, harmRate: ratio(harmful, subset.length) }];
  }));
}

function oracleConfidenceAnalysis(rows) {
  const buckets = [
    { id: 'ABSTAIN_OR_IRRELEVANT', minimum: -1, maximum: 0 },
    { id: 'LOW_LT_0_70', minimum: 0, maximum: 700000 },
    { id: 'MEDIUM_0_70_TO_0_85', minimum: 700000, maximum: 850000 },
    { id: 'HIGH_GE_0_85', minimum: 850000, maximum: Infinity },
  ];
  return Object.fromEntries(buckets.map((bucket) => {
    const subset = rows.filter((row) => {
      const confidence = row.oracleInterpretation.confidence ?? -1;
      return confidence >= bucket.minimum && confidence < bucket.maximum;
    });
    return [bucket.id, { cases: subset.length, metrics: branchMetrics(subset, 'primeOracle') }];
  }));
}

function nexusStrengthAnalysis(rows) {
  return Object.fromEntries([0, 0.6, 0.85, 1].map((strength) => {
    const subset = rows.filter((row) => row.nexusInterpretation.strength === strength);
    return [String(strength), { cases: subset.length, metrics: branchMetrics(subset, 'primeNexus') }];
  }));
}

function agreementClass(row) {
  const oracle = row.oracleInterpretation.actionId;
  const nexus = row.nexusInterpretation.actionId;
  if (oracle && nexus) return oracle === nexus ? 'BOTH_SUPPORT_SAME_ACTION' : 'SUPPORT_DIFFERENT_ACTIONS';
  if (oracle) return 'ORACLE_ONLY_RELEVANT';
  if (nexus) return 'NEXUS_ONLY_RELEVANT';
  return 'NEITHER_RELEVANT';
}

function agreementAnalysis(rows) {
  const classes = ['BOTH_SUPPORT_SAME_ACTION', 'SUPPORT_DIFFERENT_ACTIONS', 'ORACLE_ONLY_RELEVANT', 'NEXUS_ONLY_RELEVANT', 'NEITHER_RELEVANT'];
  return Object.fromEntries(classes.map((name) => {
    const subset = rows.filter((row) => agreementClass(row) === name);
    return [name, { cases: subset.length, metrics: summarizeRows(subset) }];
  }));
}

function causalTrace(row, branchName) {
  if (!row.branches[branchName].changed) return null;
  return {
    caseId: row.prepared.record.caseId,
    branch: branchName,
    observationIdentity: row.prepared.record.observationIdentity,
    primeBaselineRanking: row.prepared.prime.ranking.map((entry) => ({ actionId: entry.actionId, qValue: entry.qValue })),
    expertEvidence: { oracle: row.oracleInterpretation, nexus: row.nexusInterpretation },
    actionRelevance: { oracle: row.prepared.record.canonicalObservation.temporal.binding, nexus: row.prepared.record.canonicalObservation.relational.binding },
    boundedInterpretation: row.branches[branchName].ranking.map((entry) => ({ actionId: entry.actionId, adjustment: entry.adjustment })),
    newRanking: row.branches[branchName].ranking,
    groundTruthResult: row.prepared.truth,
    transition: { from: row.prepared.prime.selectedAction, to: row.branches[branchName].selectedAction, beneficial: !row.prepared.primeCorrect && row.branches[branchName].top1Correct, harmful: row.prepared.primeCorrect && !row.branches[branchName].top1Correct },
  };
}

export function buildStage2L1CounterfactualEvaluation() {
  const corpus = buildStage2L1DecisionCorpus();
  const prepared = corpus.map(prepareCase);
  const development = prepared.filter((entry) => entry.record.canonicalObservation.split === 'DEVELOPMENT');
  const validation = prepared.filter((entry) => entry.record.canonicalObservation.split === 'VALIDATION');
  const holdout = prepared.filter((entry) => entry.record.canonicalObservation.split === 'FINAL_HOLDOUT');
  const developmentResults = EXPERT_INTERPRETATION_SEARCH_SPACE.map((candidate) => ({ candidateId: candidate.id, metrics: summarizeRows(development.map((entry) => evaluatePreparedCase(entry, candidate))) }));
  const validationResults = EXPERT_INTERPRETATION_SEARCH_SPACE.map((candidate) => {
    const rows = validation.map((entry) => evaluatePreparedCase(entry, candidate));
    return { candidateId: candidate.id, metrics: summarizeRows(rows), rows };
  });
  const selection = selectedCandidate(validationResults);
  const candidate = EXPERT_INTERPRETATION_SEARCH_SPACE.find((entry) => entry.id === selection.selected);
  const holdoutRows = holdout.map((entry) => evaluatePreparedCase(entry, candidate));
  const finalHoldout = summarizeRows(holdoutRows);
  const traces = ['primeOracle', 'primeNexus', 'primeBoth'].flatMap((branchName) => holdoutRows.map((row) => causalTrace(row, branchName)).filter(Boolean));
  const semanticFamilies = Object.fromEntries(SPLITS.map((split) => [split, new Set(corpus.filter((entry) => entry.canonicalObservation.split === split).map((entry) => entry.canonicalObservation.semanticFamily))]));
  const leakage = SPLITS.some((left, leftIndex) => SPLITS.slice(leftIndex + 1).some((right) => [...semanticFamilies[left]].some((family) => semanticFamilies[right].has(family))));
  const agreement = agreementAnalysis(holdoutRows);
  const usefulness = (branch) => branch.decisionDelta > 0 && branch.beneficialChanges > branch.harmfulChanges && branch.harmfulChangeRate <= STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE;
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L1_STAGE,
    inherited: { stage2l0Certified: true, stage2l0CertificationHash: STAGE2L1_STAGE2L0_CERTIFICATION_HASH },
    provenance: { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, implementationDigests: STAGE2L0_IMPLEMENTATION_DIGESTS },
    freezes: { primeChanged: false, oracleV2Changed: false, nexusDeltaChanged: false },
    actualPath: { primeActualPathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0, actualRecommendations: holdoutRows.map((row) => ({ caseId: row.prepared.record.caseId, selectedAction: row.prepared.prime.selectedAction, recommendationDigest: row.prepared.prime.recommendationDigest })) },
    isolation: { counterfactualBranchesIsolated: true, counterfactualOnly: true, canDispatch: false, canMutateLiveWorld: false },
    interpreter: {
      name: 'EXPERT_INFORMATION_INTERPRETER',
      evaluationOnly: true,
      legacyScalarExpertBiasUsed: false,
      globalExpertScalarBias: false,
      oracleActionRelevanceCausallyBound: true,
      nexusActionRelevanceCausallyBound: true,
      noRelevantEvidenceImpliesZeroEffect: true,
      learnedRoutingPresent: false,
      searchSpace: EXPERT_INTERPRETATION_SEARCH_SPACE,
      searchSpaceDigest: EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST,
      maxHarmfulSelectionChangeRate: STAGE2L1_MAX_HARMFUL_SELECTION_CHANGE_RATE,
      developmentResults,
      validationResults: selection.ranked,
      selectedExpertInterpreter: selection.selected,
      selectionFrozenBeforeFinalHoldout: true,
      simpleBaselines: { noExpertControl: 'NO_CHANGE_CONTROL', tieBreakOnly: 'TIE_BREAK_ONLY', uniformExpertBiasNegativeControl: { selectionChanges: 0, reason: 'IDENTICAL_CONSTANT_ADDED_TO_EVERY_ACTION_CANNOT_CHANGE_RANKING' }, exactGroundTruthCountedAsSimpleBaseline: false },
    },
    corpus: {
      totalDecisionCases: corpus.length,
      oracleRelevantCases: corpus.filter((entry) => entry.canonicalObservation.relevanceClass === 'ORACLE_ONLY').length,
      nexusRelevantCases: corpus.filter((entry) => entry.canonicalObservation.relevanceClass === 'NEXUS_ONLY').length,
      combinedRelevantCases: corpus.filter((entry) => entry.canonicalObservation.relevanceClass === 'COMBINED').length,
      neitherRelevantCases: corpus.filter((entry) => entry.canonicalObservation.relevanceClass === 'NEITHER').length,
      effectiveSemanticGroups: new Set(corpus.map((entry) => entry.canonicalObservation.semanticGroup)).size,
      semanticFamilies: Object.fromEntries(SPLITS.map((split) => [split, semanticFamilies[split].size])),
      splits: Object.fromEntries(SPLITS.map((split) => [split, corpus.filter((entry) => entry.canonicalObservation.split === split).length])),
      semanticFamilyLeakage: leakage,
    },
    groundTruth: { independentOfExpertOutput: true, methods: ['BOUNDED_EXACT_DEPTH2_BASE_RETURN', 'DECLARED_TEMPORAL_CONSEQUENCE_FROM_FROZEN_HOLDOUT_LABEL', 'EXACT_RELATIONAL_REFERENCE_COUNTERFACTUAL'], expertOutputsReadDuringGroundTruthConstruction: false },
    finalHoldout,
    marginAnalysis: marginAnalysis(holdoutRows),
    expertConfidenceAnalysis: { oracle: oracleConfidenceAnalysis(holdoutRows), nexus: nexusStrengthAnalysis(holdoutRows) },
    agreement,
    synergy: { combinedDeltaMinusOracleDelta: finalHoldout.combined.decisionDelta - finalHoldout.oracle.decisionDelta, combinedDeltaMinusNexusDelta: finalHoldout.combined.decisionDelta - finalHoldout.nexus.decisionDelta, compositionSynergy: finalHoldout.combined.decisionDelta > Math.max(finalHoldout.oracle.decisionDelta, finalHoldout.nexus.decisionDelta) },
    causality: { selectionChangeRecords: traces.length, allSelectionChangesCausallyAttributed: traces.length === finalHoldout.oracle.selectionChanges + finalHoldout.nexus.selectionChanges + finalHoldout.combined.selectionChanges, traces },
    usefulness: { oracleInformationUseful: usefulness(finalHoldout.oracle), nexusInformationUseful: usefulness(finalHoldout.nexus), combinedInformationUseful: usefulness(finalHoldout.combined) },
    replay: { deterministicInputs: true, deterministicExpertOutputs: true, deterministicInterpreter: true },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    claims: { realZeknovaGameplayImprovementClaimed: false },
    holdoutRecords: holdoutRows.map((row) => ({
      caseId: row.prepared.record.caseId,
      observationIdentity: row.prepared.record.observationIdentity,
      semanticFamily: row.prepared.record.canonicalObservation.semanticFamily,
      relevanceClass: row.prepared.record.canonicalObservation.relevanceClass,
      inputDigest: sha256(row.prepared.record.canonicalObservation),
      primeRecommendationDigest: row.prepared.prime.recommendationDigest,
      oracleAssessmentDigest: row.prepared.oracle.assessmentDigest,
      nexusAssessmentDigest: row.prepared.nexus.outputDigest,
      groundTruth: row.prepared.truth,
      oracleInterpretation: row.oracleInterpretation,
      nexusInterpretation: row.nexusInterpretation,
      branches: row.branches,
    })),
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
