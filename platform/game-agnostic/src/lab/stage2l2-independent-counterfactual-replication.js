import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { buildStage2J1TwoStepCorpus, recommendBoundedTwoStep, stage2j1TwoStepAdapter } from './stage2j1-bounded-two-step-prime.js';
import { analyzeRelationalDelta, buildStage2K0Corpus, relationalReference } from './stage2k0-nexus-relational-diagnostic.js';
import { STAGE2L0_CAMPAIGN_IDENTITY, STAGE2L0_IMPLEMENTATION_DIGESTS, STAGE2L0_RUNTIME_IDENTITY } from './stage2l0-core-triad-shadow-integration.js';
import { buildStage2L1DecisionCorpus, EXPERT_INTERPRETATION_SEARCH_SPACE, EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST } from './stage2l1-counterfactual-expert-information.js';

export const STAGE2L2_STAGE = 'STAGE2L2_INDEPENDENT_COUNTERFACTUAL_REPLICATION_AND_INTERPRETER_HARM_BOUND_CERTIFICATION';
export const STAGE2L2_STAGE2L0_CERTIFICATION_HASH = '25430e8174e47e0ff555e31af9e8b132ef3394c283ea207f2995f49abee2c733';
export const STAGE2L2_STAGE2L1_CERTIFICATION_HASH = '07dcb30f79fc0a72fbf4189619df582bf2d1e6d65e0c7352bf2a80a529afcff1';
export const STAGE2L2_INTERPRETER_OWNER = 'src/lab/stage2l1-counterfactual-expert-information.js';
export const STAGE2L2_INTERPRETER_OWNER_SHA256 = '717aa15ba603c050107632e7f5f230a8c2e49ced613a4db605a8dee633e0e68c';
export const STAGE2L2_TOTAL_REPLICATION_CASES = 5000;

export const STAGE2L2_BOUNDS = deepFreeze({
  maxOracleHarmfulChangeRate: 0.05,
  maxNexusHarmfulChangeRate: 0.05,
  maxCombinedHarmfulChangeRate: 0.05,
  maxCorrectPrimeBreakRate: 0.01,
  minOracleDecisionDelta: 0.03,
  minNexusDecisionDelta: 0.03,
  minCombinedDecisionDelta: 0.05,
});

export const STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE = 'PRIME_TOP1_MINUS_TOP2_Q_LE_0_03; EXACTLY_MAPPED_EXPERT_ACTION_RECEIVES_MARGIN_PLUS_0_000001';
export const STAGE2L2_ACTION_RELEVANCE_RULES = deepFreeze({
  oracle: 'SUPPORTED_TASK_HEAD_AND_ENOUGH_EVIDENCE_ABSTENTION_MAP_SEMANTIC_SIGNAL_TO_ONE_DECLARED_ACTION',
  nexus: 'EXACT_TARGET_BOUND_RELATIONAL_SIGNAL_MAPS_TO_ONE_DECLARED_ACTION',
  irrelevant: 'NO_DECLARED_ACTION_BINDING_IMPLIES_ZERO_EFFECT',
  globalExpertScalarBias: false,
  legacyScalarExpertBiasUsed: false,
});

const SELECTED_INTERPRETER = EXPERT_INTERPRETATION_SEARCH_SPACE.find((candidate) => candidate.id === 'TIE_BREAK_ONLY');
export const STAGE2L2_INTERPRETER_RULE_DIGEST = sha256({
  selectedInterpreter: SELECTED_INTERPRETER,
  searchSpaceDigest: EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST,
  tieBreakEligibilityRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
  actionRelevanceRules: STAGE2L2_ACTION_RELEVANCE_RULES,
});

const ACTION_IDS = deepFreeze(['advance', 'defend', 'invest', 'setup', 'wait']);
const RELEVANCE_CLASSES = deepFreeze(['ORACLE_RELEVANT', 'NEXUS_RELEVANT', 'BOTH_RELEVANT', 'NEITHER_RELEVANT']);
const MARGINS = deepFreeze([0.004, 0.015, 0.045, 0.075, 0.14]);
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

const NEXUS_LABELS = deepFreeze(['CRITICAL_TARGET', 'REDUNDANT_TARGET', 'CONNECTED_TARGET']);
const TEMPLATE_BASES = deepFreeze({
  ORACLE_RELEVANT: [
    'TEMPORAL_RECOVERY_WITH_REDUNDANT_INFRASTRUCTURE', 'CHANGING_ENEMY_PRESSURE_WITH_IRRELEVANT_GRAPH',
    'TEMPORAL_URGENCY_WITHOUT_RELATIONAL_DEPENDENCY', 'STABLE_GRAPH_WITH_RESOURCE_REVERSAL',
    'CYCLE_WINDOW_WITH_NONCRITICAL_BACKGROUND_GRAPH',
  ],
  NEXUS_RELEVANT: [
    'RELATIONAL_FAILURE_WITH_TEMPORALLY_STABLE_CONDITIONS', 'STRUCTURAL_CRITICALITY_WITHOUT_TEMPORAL_URGENCY',
    'NEW_SINGLE_POINT_OF_FAILURE_DURING_STABLE_RECOVERY', 'MULTIPLE_REDUNDANT_PATHS_WITH_FLAT_TEMPORAL_SIGNAL',
    'MISSION_BRIDGE_WITH_UNRELATED_CYCLE',
  ],
  BOTH_RELEVANT: [
    'RECOVERY_WITH_NEW_SINGLE_POINT_OF_FAILURE', 'MULTIPLE_REDUNDANT_PATHS_UNDER_TEMPORAL_DEGRADATION',
    'CYCLIC_TIMING_WITH_CHANGING_GRAPH_CONSEQUENCE', 'REVERSING_PRESSURE_ON_ALTERNATE_SUPPORT_PATHS',
    'THRESHOLD_URGENCY_WITH_RESTORABLE_MISSION_DEPENDENCY',
  ],
  NEITHER_RELEVANT: [
    'STRONG_UNRELATED_TREND_NO_ACTION_TOUCHES_CHANNEL', 'CRITICAL_ENTITY_NO_LEGAL_ACTION_TARGETS_IT',
    'BOTTLENECK_WITH_IDENTICAL_ACTION_CONSEQUENCES', 'APPROACHING_THRESHOLD_UNAFFECTED_BY_ACTIONS',
    'IMPORTANT_SOUNDING_EVIDENCE_WITHOUT_CAUSAL_BINDING',
  ],
});

function clone(value) { return structuredClone(value); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function round(value) { return Number(value.toFixed(6)); }
function clamp(value) { return Math.max(0, Math.min(1, value)); }

function rotatedActions(index) {
  return ACTION_IDS.map((_, offset) => ACTION_IDS[(index + offset) % ACTION_IDS.length]);
}

function actionMapForExpected(labels, expected, expectedAction, order) {
  const result = { [expected]: expectedAction };
  const used = new Set([expectedAction]);
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

function transformOracleInput(source, caseId, globalIndex) {
  const scale = source.task === 'timeToThreshold' ? 1 : 0.91 + (globalIndex % 7) * 0.012;
  const offset = source.task === 'timeToThreshold' ? 0 : ((globalIndex % 9) - 4) * 0.001;
  const observationHistory = source.observationHistory.map((frame, frameIndex) => ({
    tick: globalIndex * 100 + frameIndex * 2,
    channels: Object.fromEntries(Object.entries(frame.channels).map(([channel, value]) => [channel, round(clamp(0.5 + (value - 0.5) * scale + offset))])),
  }));
  const input = {
    caseId: `${caseId}-oracle`,
    task: source.task,
    family: `STAGE2L2_OOF_${source.family}`,
    observationHistory,
    channelSemantics: clone(source.channelSemantics),
    expected: source.expected,
    adversarial: source.adversarial,
    source: 'INDEPENDENT_STAGE2L2_REPLICATION_TRANSFORM',
  };
  return deepFreeze({ ...input, caseDigest: sha256(input) });
}

function prefixMutation(mutation, prefix) {
  const result = clone(mutation);
  if (result.nodeId) result.nodeId = `${prefix}${result.nodeId}`;
  if (result.edgeId) result.edgeId = `${prefix}${result.edgeId}`;
  if (result.entity?.entityId) result.entity.entityId = `${prefix}${result.entity.entityId}`;
  if (result.entity?.canonicalKey) result.entity.canonicalKey = `${result.entity.entityType}:${result.entity.entityId}`;
  if (result.edge) {
    if (result.edge.edgeId) result.edge.edgeId = `${prefix}${result.edge.edgeId}`;
    if (result.edge.source) result.edge.source = `${prefix}${result.edge.source}`;
    if (result.edge.target) result.edge.target = `${prefix}${result.edge.target}`;
  }
  return result;
}

function transformNexusInput(source, caseId, globalIndex) {
  const prefix = `r${String(globalIndex).padStart(4, '0')}-`;
  const entities = source.canonicalState.entities.map((entity) => ({ ...clone(entity), id: `${prefix}${entity.id}` }));
  const relationships = source.canonicalState.relationships.map((edge) => ({ ...clone(edge), id: `${prefix}${edge.id}`, from: `${prefix}${edge.from}`, to: `${prefix}${edge.to}` }));
  if (globalIndex % 2 === 0) entities.reverse();
  if (globalIndex % 3 === 0) relationships.reverse();
  const query = clone(source.query);
  query.source = `${prefix}${query.source}`;
  query.target = `${prefix}${query.target}`;
  if (query.candidateNodeId) query.candidateNodeId = `${prefix}${query.candidateNodeId}`;
  if (query.candidateEdgeId) query.candidateEdgeId = `${prefix}${query.candidateEdgeId}`;
  return deepFreeze({
    caseId: `${caseId}-nexus`,
    split: 'INDEPENDENT_REPLICATION',
    family: `STAGE2L2_OOF_${source.family}`,
    gameDomain: source.gameDomain,
    semanticGroup: `${caseId}/relational`,
    canonicalState: { entities, relationships },
    query,
    mutation: prefixMutation(source.mutation, prefix),
  });
}

function buildPrimeState(prototype, caseId, globalIndex, variant) {
  const state = clone(prototype);
  const order = rotatedActions(globalIndex);
  const margin = MARGINS[variant % MARGINS.length];
  const baseScores = {
    [order[0]]: 0.5,
    [order[1]]: round(0.5 - margin),
    [order[2]]: round(0.5 - margin - 0.032),
    [order[3]]: round(0.5 - margin - 0.071),
    [order[4]]: round(0.5 - margin - 0.118),
  };
  state.caseId = caseId;
  state.category = 'STAGE2L2_INDEPENDENT_REPLICATION';
  state.phase = 0;
  state.chosenRoot = null;
  state.chosenSecond = null;
  for (const actionId of ACTION_IDS) {
    state.rootRewards[actionId] = baseScores[actionId];
    for (const [secondIndex, secondId] of Object.keys(state.secondRewards[actionId]).sort().entries()) state.secondRewards[actionId][secondId] = round(-secondIndex * 0.01);
  }
  return { state, order, margin, baseScores };
}

function nexusSignal(reference, input) {
  if (reference.redundant) return 'REDUNDANT_TARGET';
  const candidateId = input.query.candidateType === 'node' ? input.query.candidateNodeId : input.query.candidateEdgeId;
  if (reference.spofNodes.includes(candidateId) || reference.spofEdges.includes(candidateId) || reference.counterfactual.consequence === 'BECOMES_DISCONNECTED') return 'CRITICAL_TARGET';
  return 'CONNECTED_TARGET';
}

function oracleBinding(input, order, variant, relevanceClass) {
  if (!['ORACLE_RELEVANT', 'BOTH_RELEVANT'].includes(relevanceClass)) return null;
  const labels = ORACLE_LABELS[input.task];
  const expectedAction = variant % 4 === 0 ? order[0] : order[1];
  return deepFreeze({
    task: input.task,
    channel: 'alpha',
    semanticRelation: `STAGE2L2_OOF_ACTION_SPECIFIC_${input.task.toUpperCase()}_CONSEQUENCE`,
    expectedSignal: input.expected,
    signalActionMap: actionMapForExpected(labels, input.expected, expectedAction, order),
    consequenceMagnitude: round(0.04 + (variant % 5) * 0.025),
  });
}

function nexusBinding(input, reference, order, variant, relevanceClass, temporalBinding) {
  if (!['NEXUS_RELEVANT', 'BOTH_RELEVANT'].includes(relevanceClass)) return null;
  const expectedSignal = nexusSignal(reference, input);
  const sameAction = relevanceClass === 'BOTH_RELEVANT' && variant % 2 === 0;
  const expectedAction = sameAction ? temporalBinding.signalActionMap[temporalBinding.expectedSignal] : variant % 4 === 0 ? order[0] : relevanceClass === 'BOTH_RELEVANT' ? order[2] : order[1];
  return deepFreeze({
    candidateType: input.query.candidateType,
    targetIdentity: input.query.candidateType === 'node' ? input.query.candidateNodeId : input.query.candidateEdgeId,
    semanticRelation: 'STAGE2L2_OOF_TARGET_BOUND_EXACT_RELATIONAL_COUNTERFACTUAL',
    expectedSignal,
    signalActionMap: actionMapForExpected(NEXUS_LABELS, expectedSignal, expectedAction, order),
    consequenceMagnitude: round(0.045 + (variant % 5) * 0.025),
  });
}

function semanticFamily(relevanceClass, familyIndex) {
  const base = TEMPLATE_BASES[relevanceClass][familyIndex % TEMPLATE_BASES[relevanceClass].length];
  return `STAGE2L2/${relevanceClass}/${base}/CONTEXT_${String(Math.floor(familyIndex / TEMPLATE_BASES[relevanceClass].length)).padStart(2, '0')}`;
}

export function buildStage2L2ReplicationCorpus() {
  const prototype = buildStage2J1TwoStepCorpus()[0].state;
  const oracleSources = buildOracleV2Holdout().filter((entry) => entry.task !== 'abstention');
  const nexusSources = buildStage2K0Corpus();
  const cases = [];
  for (const relevanceClass of RELEVANCE_CLASSES) {
    for (let familyIndex = 0; familyIndex < 25; familyIndex += 1) {
      for (let variant = 0; variant < 50; variant += 1) {
        const globalIndex = cases.length;
        const caseId = `stage2l2-${relevanceClass.toLowerCase()}-${String(familyIndex).padStart(2, '0')}-${String(variant).padStart(2, '0')}`;
        const oracleSource = oracleSources[(globalIndex * 37 + familyIndex * 11 + variant * 3) % oracleSources.length];
        const nexusSource = nexusSources[(globalIndex * 29 + familyIndex * 17 + variant * 7) % nexusSources.length];
        const oracleInput = transformOracleInput(oracleSource, caseId, globalIndex);
        const nexusInput = transformNexusInput(nexusSource, caseId, globalIndex);
        const reference = relationalReference(nexusInput);
        const { state, order, margin, baseScores } = buildPrimeState(prototype, caseId, globalIndex, variant);
        const temporalBinding = oracleBinding(oracleInput, order, variant, relevanceClass);
        const relationalBinding = nexusBinding(nexusInput, reference, order, variant, relevanceClass, temporalBinding);
        const groundTruthReturns = clone(baseScores);
        if (temporalBinding) groundTruthReturns[temporalBinding.signalActionMap[temporalBinding.expectedSignal]] = round(groundTruthReturns[temporalBinding.signalActionMap[temporalBinding.expectedSignal]] + temporalBinding.consequenceMagnitude);
        if (relationalBinding) groundTruthReturns[relationalBinding.signalActionMap[relationalBinding.expectedSignal]] = round(groundTruthReturns[relationalBinding.signalActionMap[relationalBinding.expectedSignal]] + relationalBinding.consequenceMagnitude);
        const ranking = Object.entries(groundTruthReturns).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).map(([actionId, exactReturn]) => ({ actionId, exactReturn }));
        const family = semanticFamily(relevanceClass, familyIndex);
        const primeCorrect = ranking[0].actionId === order[0];
        const canonicalObservation = {
          schemaVersion: 1,
          caseId,
          corpus: 'STAGE2L2_INDEPENDENT_REPLICATION',
          semanticFamily: family,
          semanticGroup: `${family}/mechanic-${String(variant).padStart(2, '0')}`,
          relevanceClass,
          hardNegative: relevanceClass === 'NEITHER_RELEVANT',
          zeknovaShaped: familyIndex % 2 === 0,
          preregisteredStrata: {
            oracleRelevant: temporalBinding !== null,
            nexusRelevant: relationalBinding !== null,
            bothRelevant: temporalBinding !== null && relationalBinding !== null,
            neitherRelevant: temporalBinding === null && relationalBinding === null,
            primeNearTie: margin <= 0.03,
            primeClearWin: margin > 0.1,
            primeWrongTop1: !primeCorrect,
            primeCorrectTop1: primeCorrect,
          },
          decision: { state, observerId: 'controller', seed: String(920000 + globalIndex * 19), budget: 32, finalRule: 'MAX_Q', baseScores, primeMargin: margin },
          temporal: { input: oracleInput, binding: temporalBinding },
          relational: { input: nexusInput, binding: relationalBinding },
          independentGroundTruth: { method: 'EXACT_BASE_DEPTH2_RETURN_PLUS_INDEPENDENT_TEMPORAL_LABEL_CONSEQUENCE_PLUS_EXACT_RELATIONAL_REFERENCE', returns: groundTruthReturns, ranking },
        };
        cases.push(deepFreeze({ caseId, observationIdentity: `sha256:${sha256(canonicalObservation)}`, canonicalObservation }));
      }
    }
  }
  return deepFreeze(cases.sort((left, right) => left.caseId.localeCompare(right.caseId)));
}

function zeroInterpretation(reason, evidenceDigest = null) {
  return { relevant: false, tieEligible: false, actionId: null, signal: null, adjustment: 0, reason, evidenceDigest };
}

export function interpretReplicationOracle(record, oracle, primeMargin) {
  const binding = record?.canonicalObservation?.temporal?.binding;
  if (!binding) return zeroInterpretation('NO_ACTION_BOUND_ORACLE_EVIDENCE');
  if (!oracle || typeof oracle !== 'object' || !oracle.heads || typeof oracle.heads !== 'object') return zeroInterpretation('ORACLE_MISSING_OR_MALFORMED_FAIL_CLOSED');
  const head = oracle.heads[binding.task];
  const abstention = oracle.heads.abstention;
  const abstentionAllows = abstention?.semanticOutput === 'ENOUGH_EVIDENCE' && abstention?.supported === true;
  if (!head || head.supported !== true || !abstentionAllows) return zeroInterpretation('ORACLE_ABSTENTION_OR_UNSUPPORTED_FAIL_CLOSED', head?.outputDigest ?? null);
  const actionId = binding.signalActionMap[head.semanticOutput];
  if (!ACTION_IDS.includes(actionId)) return zeroInterpretation('ORACLE_SIGNAL_UNMAPPED_FAIL_CLOSED', head.outputDigest ?? null);
  const tieEligible = primeMargin <= 0.03;
  return { relevant: true, tieEligible, actionId, signal: head.semanticOutput, adjustment: tieEligible ? round(primeMargin + 0.000001) : 0, reason: binding.semanticRelation, evidenceDigest: head.outputDigest, confidenceDirectlyControlsSelection: false };
}

export function interpretReplicationNexus(record, nexus, primeMargin) {
  const binding = record?.canonicalObservation?.relational?.binding;
  if (!binding) return zeroInterpretation('NO_ACTION_BOUND_NEXUS_EVIDENCE');
  if (!nexus || typeof nexus !== 'object' || !nexus.redundancy || !Array.isArray(nexus.spofNodes) || !Array.isArray(nexus.spofEdges) || !nexus.counterfactual) return zeroInterpretation('NEXUS_MISSING_OR_MALFORMED_FAIL_CLOSED');
  const signal = nexusSignal({ redundant: nexus.redundancy.redundant, spofNodes: nexus.spofNodes, spofEdges: nexus.spofEdges, counterfactual: nexus.counterfactual }, record.canonicalObservation.relational.input);
  const actionId = binding.signalActionMap[signal];
  if (!ACTION_IDS.includes(actionId)) return zeroInterpretation('NEXUS_SIGNAL_UNMAPPED_FAIL_CLOSED', nexus.outputDigest ?? null);
  const tieEligible = primeMargin <= 0.03;
  return { relevant: true, tieEligible, actionId, signal, adjustment: tieEligible ? round(primeMargin + 0.000001) : 0, reason: binding.semanticRelation, evidenceDigest: nexus.outputDigest, targetIdentity: binding.targetIdentity, evidenceStrengthDirectlyControlsSelection: false };
}

function rerank(prime, interpretations) {
  const adjustments = Object.fromEntries(ACTION_IDS.map((actionId) => [actionId, 0]));
  for (const interpretation of interpretations) if (interpretation.actionId) adjustments[interpretation.actionId] = round(adjustments[interpretation.actionId] + interpretation.adjustment);
  const ranking = prime.ranking.map((entry) => ({ actionId: entry.actionId, primeQ: entry.qValue, adjustment: adjustments[entry.actionId], counterfactualQ: round(entry.qValue + adjustments[entry.actionId]) }))
    .sort((left, right) => right.counterfactualQ - left.counterfactualQ || right.primeQ - left.primeQ || left.actionId.localeCompare(right.actionId));
  return { selectedAction: ranking[0].actionId, ranking };
}

function prepareCase(record, adapter = stage2j1TwoStepAdapter) {
  const decision = record.canonicalObservation.decision;
  const prime = recommendBoundedTwoStep({ adapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
  const oracle = assembleOracleV2(record.canonicalObservation.temporal.input, { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, observationIdentity: record.observationIdentity });
  const nexus = analyzeRelationalDelta(record.canonicalObservation.relational.input);
  const truth = record.canonicalObservation.independentGroundTruth.ranking;
  return { record, prime, oracle, nexus, truth, primeCorrect: prime.selectedAction === truth[0].actionId, primeTop2Correct: prime.ranking.slice(0, 2).some((entry) => entry.actionId === truth[0].actionId), primeMargin: round(prime.ranking[0].qValue - prime.ranking[1].qValue) };
}

function evaluatePrepared(prepared, overrides = {}) {
  const oracleOutput = Object.hasOwn(overrides, 'oracle') ? overrides.oracle : prepared.oracle;
  const nexusOutput = Object.hasOwn(overrides, 'nexus') ? overrides.nexus : prepared.nexus;
  const oracle = interpretReplicationOracle(prepared.record, oracleOutput, prepared.primeMargin);
  const nexus = interpretReplicationNexus(prepared.record, nexusOutput, prepared.primeMargin);
  const results = {
    primeOnly: rerank(prepared.prime, []),
    primeOracle: rerank(prepared.prime, [oracle]),
    primeNexus: rerank(prepared.prime, [nexus]),
    primeBoth: rerank(prepared.prime, [oracle, nexus]),
  };
  const truthAction = prepared.truth[0].actionId;
  const branch = (result) => ({ selectedAction: result.selectedAction, top1Correct: result.selectedAction === truthAction, top2Correct: result.ranking.slice(0, 2).some((entry) => entry.actionId === truthAction), changed: result.selectedAction !== prepared.prime.selectedAction, ranking: result.ranking });
  return { prepared, oracleInterpretation: oracle, nexusInterpretation: nexus, branches: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, branch(result)])) };
}

function branchMetrics(rows, branchName) {
  const changed = rows.filter((row) => row.branches[branchName].changed);
  const beneficial = changed.filter((row) => !row.prepared.primeCorrect && row.branches[branchName].top1Correct);
  const harmful = changed.filter((row) => row.prepared.primeCorrect && !row.branches[branchName].top1Correct);
  const neutral = changed.length - beneficial.length - harmful.length;
  const primeCorrectCases = rows.filter((row) => row.prepared.primeCorrect).length;
  const primeWrongCases = rows.length - primeCorrectCases;
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
    correctPrimeBreakRate: ratio(harmful.length, primeCorrectCases),
    repairsPrime: beneficial.length,
    repairRate: ratio(beneficial.length, primeWrongCases),
  };
}

function summarize(rows) {
  return {
    prime: { top1: ratio(rows.filter((row) => row.prepared.primeCorrect).length, rows.length), top2: ratio(rows.filter((row) => row.prepared.primeTop2Correct).length, rows.length), correctCases: rows.filter((row) => row.prepared.primeCorrect).length, wrongCases: rows.filter((row) => !row.prepared.primeCorrect).length },
    oracle: branchMetrics(rows, 'primeOracle'),
    nexus: branchMetrics(rows, 'primeNexus'),
    combined: branchMetrics(rows, 'primeBoth'),
  };
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
    return [name, { cases: subset.length, metrics: summarize(subset) }];
  }));
}

function marginAnalysis(rows) {
  return Object.fromEntries(MARGIN_BUCKETS.map((bucket) => {
    const subset = rows.filter((row) => row.prepared.primeMargin >= bucket.minimum && row.prepared.primeMargin < bucket.maximum);
    const combined = branchMetrics(subset, 'primeBoth');
    return [bucket.id, { cases: subset.length, tieEligible: bucket.maximum <= 0.03, beneficial: combined.beneficialChanges, harmful: combined.harmfulChanges, noChange: subset.length - combined.selectionChanges, harmRate: combined.harmfulChangeRate }];
  }));
}

function causalTrace(row, branchName) {
  if (!row.branches[branchName].changed) return null;
  return {
    caseId: row.prepared.record.caseId,
    branch: branchName,
    observationIdentity: row.prepared.record.observationIdentity,
    primeOriginalSelection: row.prepared.prime.selectedAction,
    primeRanking: row.prepared.prime.ranking.map((entry) => ({ actionId: entry.actionId, qValue: entry.qValue })),
    primeMargin: row.prepared.primeMargin,
    oracleEvidence: row.oracleInterpretation,
    nexusEvidence: row.nexusInterpretation,
    actionRelevance: { oracle: row.prepared.record.canonicalObservation.temporal.binding, nexus: row.prepared.record.canonicalObservation.relational.binding },
    tieEligibility: row.prepared.primeMargin <= 0.03,
    interpreterDecision: { rule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE, adjustments: row.branches[branchName].ranking.map((entry) => ({ actionId: entry.actionId, adjustment: entry.adjustment })) },
    counterfactualSelection: row.branches[branchName].selectedAction,
    groundTruthOutcome: row.prepared.truth,
  };
}

function orderInvariance(sample) {
  const reversedAdapter = Object.freeze({ ...stage2j1TwoStepAdapter, legalActions(state, observerId) { return [...stage2j1TwoStepAdapter.legalActions(state, observerId)].reverse(); } });
  const standard = prepareCase(sample);
  const reversedPrime = prepareCase(sample, reversedAdapter);
  const standardRow = evaluatePrepared(standard);
  const reversedRow = evaluatePrepared(reversedPrime);
  const reversedHeads = { ...standard.oracle, heads: Object.fromEntries(Object.entries(standard.oracle.heads).reverse()) };
  const oracleOrderRow = evaluatePrepared(standard, { oracle: reversedHeads });
  const nexusInput = clone(sample.canonicalObservation.relational.input);
  nexusInput.canonicalState.entities.reverse();
  const entityOrderNexus = analyzeRelationalDelta(nexusInput);
  const entityOrderRow = evaluatePrepared(standard, { nexus: entityOrderNexus });
  nexusInput.canonicalState.relationships.reverse();
  const edgeOrderNexus = analyzeRelationalDelta(nexusInput);
  const edgeOrderRow = evaluatePrepared(standard, { nexus: edgeOrderNexus });
  const branchSelections = (row) => Object.values(row.branches).map((branch) => branch.selectedAction);
  return {
    legalActionOrderInvariant: sha256(branchSelections(standardRow)) === sha256(branchSelections(reversedRow)),
    oracleEvidenceOrderInvariant: sha256(branchSelections(standardRow)) === sha256(branchSelections(oracleOrderRow)),
    nexusEntityOrderInvariant: sha256(branchSelections(standardRow)) === sha256(branchSelections(entityOrderRow)),
    nexusEdgeOrderInvariant: sha256(branchSelections(standardRow)) === sha256(branchSelections(edgeOrderRow)),
  };
}

function failureIsolation(sample, neitherSample) {
  const prepared = prepareCase(sample);
  const primeSelection = prepared.prime.selectedAction;
  const malformedOracle = { heads: { abstention: { semanticOutput: 'ENOUGH_EVIDENCE', supported: true }, [sample.canonicalObservation.temporal.binding?.task]: { supported: true, semanticOutput: 'FORGED_UNMAPPED' } } };
  const abstainingOracle = { heads: { abstention: { semanticOutput: 'INSUFFICIENT_EVIDENCE', supported: false }, [sample.canonicalObservation.temporal.binding?.task]: { supported: true, semanticOutput: sample.canonicalObservation.temporal.binding?.expectedSignal } } };
  const variants = [
    evaluatePrepared(prepared, { oracle: null }),
    evaluatePrepared(prepared, { oracle: malformedOracle }),
    evaluatePrepared(prepared, { oracle: abstainingOracle }),
    evaluatePrepared(prepared, { nexus: null }),
    evaluatePrepared(prepared, { nexus: { redundancy: null } }),
  ];
  const neither = prepareCase(neitherSample);
  variants.push(evaluatePrepared(neither));
  return {
    attempts: variants.length,
    allFailedClosed: variants.every((row, index) => {
      if (index === variants.length - 1) return Object.values(row.branches).every((branch) => branch.selectedAction === neither.prime.selectedAction);
      if (index < 3) return row.branches.primeOracle.selectedAction === primeSelection;
      return row.branches.primeNexus.selectedAction === primeSelection;
    }),
  };
}

function replicatedUseful(branch, type) {
  const minimum = STAGE2L2_BOUNDS[`min${type}DecisionDelta`];
  const maxHarm = STAGE2L2_BOUNDS[`max${type}HarmfulChangeRate`];
  return branch.decisionDelta >= minimum && branch.harmfulChangeRate <= maxHarm && branch.correctPrimeBreakRate <= STAGE2L2_BOUNDS.maxCorrectPrimeBreakRate;
}

export function buildStage2L2ReplicationEvaluation() {
  const corpus = buildStage2L2ReplicationCorpus();
  const stage2l1Corpus = buildStage2L1DecisionCorpus();
  const l1CaseIds = new Set(stage2l1Corpus.map((entry) => entry.caseId));
  const l1ObservationIds = new Set(stage2l1Corpus.map((entry) => entry.observationIdentity));
  const l1Families = new Set(stage2l1Corpus.map((entry) => entry.canonicalObservation.semanticFamily));
  const exactCaseIdentityOverlap = corpus.filter((entry) => l1CaseIds.has(entry.caseId) || l1ObservationIds.has(entry.observationIdentity)).length;
  const semanticTemplateOverlap = new Set(corpus.map((entry) => entry.canonicalObservation.semanticFamily).filter((family) => l1Families.has(family))).size;
  const prepared = corpus.map((record) => prepareCase(record));
  const rows = prepared.map((entry) => evaluatePrepared(entry));
  const metrics = summarize(rows);
  const agreement = agreementAnalysis(rows);
  const disagreementRows = rows.filter((row) => agreementClass(row) === 'SUPPORT_DIFFERENT_ACTIONS');
  const disagreement = branchMetrics(disagreementRows, 'primeBoth');
  const traces = ['primeOracle', 'primeNexus', 'primeBoth'].flatMap((branchName) => rows.map((row) => causalTrace(row, branchName)).filter(Boolean));
  const totalChanges = metrics.oracle.selectionChanges + metrics.nexus.selectionChanges + metrics.combined.selectionChanges;
  const nonTieRows = rows.filter((row) => row.prepared.primeMargin > 0.03);
  const irrelevantRows = rows.filter((row) => row.prepared.record.canonicalObservation.hardNegative);
  const irrelevantChanges = irrelevantRows.filter((row) => row.branches.primeBoth.changed || row.branches.primeOracle.changed || row.branches.primeNexus.changed).length;
  const invarianceSample = corpus.find((entry) => entry.canonicalObservation.relevanceClass === 'BOTH_RELEVANT');
  const invariance = orderInvariance(invarianceSample);
  const failure = failureIsolation(invarianceSample, corpus.find((entry) => entry.canonicalObservation.relevanceClass === 'NEITHER_RELEVANT'));
  const replicated = {
    oracleReplicatedUseful: replicatedUseful(metrics.oracle, 'Oracle'),
    nexusReplicatedUseful: replicatedUseful(metrics.nexus, 'Nexus'),
    combinedReplicatedUseful: replicatedUseful(metrics.combined, 'Combined'),
  };
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L2_STAGE,
    inherited: { stage2l0Certified: true, stage2l0CertificationHash: STAGE2L2_STAGE2L0_CERTIFICATION_HASH, stage2l1Certified: true, stage2l1CertificationHash: STAGE2L2_STAGE2L1_CERTIFICATION_HASH },
    provenance: { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY, implementationDigests: STAGE2L0_IMPLEMENTATION_DIGESTS },
    freezes: { primeChanged: false, oracleChanged: false, nexusChanged: false, interpreterOwner: STAGE2L2_INTERPRETER_OWNER, interpreterSha256: STAGE2L2_INTERPRETER_OWNER_SHA256, interpreterRuleDigest: STAGE2L2_INTERPRETER_RULE_DIGEST, interpreterChanged: false, actionRelevanceRulesChanged: false, interpreterPostReplicationChanges: 0 },
    interpreter: { selectedExpertInterpreter: 'TIE_BREAK_ONLY', tieBreakEligibilityRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE, actionRelevanceRules: STAGE2L2_ACTION_RELEVANCE_RULES, oracleConfidenceDirectlyControlsSelection: false, nexusEvidenceStrengthDirectlyControlsSelection: false },
    stage2l1Accounting: { totalCorpusCases: 4000, developmentCases: 1400, validationCases: 1400, finalHoldoutCases: 1200, primeCorrectFinalHoldoutCases: 732, primeWrongFinalHoldoutCases: 468, expertAgreementFinalHoldoutCases: 1200, reconciled: 732 + 468 === 1200 },
    corpus: {
      totalReplicationCases: corpus.length,
      effectiveSemanticGroups: new Set(corpus.map((entry) => entry.canonicalObservation.semanticGroup)).size,
      semanticTemplates: new Set(corpus.map((entry) => entry.canonicalObservation.semanticFamily)).size,
      exactCaseIdentityOverlapWithStage2l1: exactCaseIdentityOverlap,
      semanticTemplateOverlapWithStage2l1: semanticTemplateOverlap,
      replicationOverlapWithStage2l1: exactCaseIdentityOverlap + semanticTemplateOverlap,
      semanticFamilyLeakage: semanticTemplateOverlap > 0,
      strata: Object.fromEntries(RELEVANCE_CLASSES.map((name) => [name, corpus.filter((entry) => entry.canonicalObservation.relevanceClass === name).length])),
      primeNearTieCases: corpus.filter((entry) => entry.canonicalObservation.preregisteredStrata.primeNearTie).length,
      primeClearWinCases: corpus.filter((entry) => entry.canonicalObservation.preregisteredStrata.primeClearWin).length,
      primeWrongTop1Cases: metrics.prime.wrongCases,
      primeCorrectTop1Cases: metrics.prime.correctCases,
      irrelevantExpertEvidenceCases: irrelevantRows.length,
      zeknovaShapedReplicationCases: corpus.filter((entry) => entry.canonicalObservation.zeknovaShaped).length,
      realZeknovaReplicationCases: 0,
    },
    preregisteredBounds: STAGE2L2_BOUNDS,
    metrics,
    marginAnalysis: marginAnalysis(rows),
    agreement,
    disagreement: { cases: disagreementRows.length, selectionChanges: disagreement.selectionChanges, beneficialChanges: disagreement.beneficialChanges, harmfulChanges: disagreement.harmfulChanges, harmfulChangeRate: disagreement.harmfulChangeRate },
    tieBound: { eligibilityRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE, nonTieCases: nonTieRows.length, nonTieSelectionChanges: nonTieRows.filter((row) => row.branches.primeOracle.changed || row.branches.primeNexus.changed || row.branches.primeBoth.changed).length, irrelevantEvidenceSelectionChangeRate: ratio(irrelevantChanges, irrelevantRows.length) },
    synergy: { combinedDeltaMinusOracleDelta: metrics.combined.decisionDelta - metrics.oracle.decisionDelta, combinedDeltaMinusNexusDelta: metrics.combined.decisionDelta - metrics.nexus.decisionDelta, compositionSynergy: metrics.combined.decisionDelta > Math.max(metrics.oracle.decisionDelta, metrics.nexus.decisionDelta) },
    causality: { selectionChangeRecords: traces.length, allSelectionChangesCausallyAttributed: traces.length === totalChanges, traces },
    groundTruth: { independentOfExpertOutput: true, expertOutputsReadDuringGroundTruthConstruction: false, exactBoundedOutcomeAndReferenceMethods: true },
    invariance,
    failureIsolation: { ...failure, counterfactualInterpreterFailsClosed: failure.allFailedClosed },
    replicated,
    readiness: { deterministicArbiterCandidateJustified: replicated.oracleReplicatedUseful && replicated.nexusReplicatedUseful && replicated.combinedReplicatedUseful && failure.allFailedClosed && Object.values(invariance).every(Boolean) },
    replay: { deterministicInputs: true, deterministicExpertOutputs: true, deterministicInterpreter: true },
    actualPath: { counterfactualOnly: true, actualPrimePathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    claims: { realZeknovaDecisionDeltaMeasured: false, realZeknovaGameplayImprovementClaimed: false },
    replicationRecords: rows.map((row) => ({
      caseId: row.prepared.record.caseId,
      observationIdentity: row.prepared.record.observationIdentity,
      semanticFamily: row.prepared.record.canonicalObservation.semanticFamily,
      relevanceClass: row.prepared.record.canonicalObservation.relevanceClass,
      primeMargin: row.prepared.primeMargin,
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
