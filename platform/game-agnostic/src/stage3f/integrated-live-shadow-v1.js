import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { canonicalize, deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { forgeWorldAdapter, FORGE_GAME_ID, FORGE_OBSERVER_ID } from '../forge/adapter.js';
import { FORGE_WORLD_VERSION } from '../forge/contract.js';
import { forgeActionKey, hashWorld, legalActions as forgeLegalActions } from '../forge/kernel.js';
import { createWorld } from '../forge/kernel.js';
import { generateScenario } from '../forge/scenarios.js';
import { heuristicGreedyBaseline, nexusRelationalSelector } from '../lab/stage3c-learned-nexus.js';
import {
  EpistemicCategory, EvidenceAuthority, createWorldStateFact, createWorldStateSnapshot,
} from './world-state-v1.js';
import {
  ActionMatchStatus, attachIncumbentAction, attachOutcome, createDecisionTimeTrace,
  createFeatureDerivationEvidence, createObservationEvidence, createPredictorEvidence,
  createRecommendationEvidence, createRouterEvaluationEvidence,
} from './causal-trace-v1.js';
import {
  CalibrationDomain, CalibrationStatus, ResourceDirectionality, TransitionAssumption,
  createCalibrationEvidence, createDomainAssessment, createEnvironmentCalibration,
  createEnvironmentIdentity, createSemanticDefinition, evaluateCalibrationSufficiency,
  bindWorldStateCalibration, bindCausalTraceCalibration,
} from './environment-calibration-v1.js';
import {
  CounterfactualTiming, LedgerActorType, LedgerEvaluationStatus, VetoDisposition,
  attachLedgerActualOutcome, attachLedgerCounterfactual, attachLedgerEvaluation,
  attachLedgerSelectedAction, attachLedgerVeto, createCounterfactualVetoLedger,
} from './counterfactual-veto-ledger-v1.js';
import {
  ExperiencePurpose, attachExecutedAction, attachExperienceActualOutcome,
  attachExperiencePrediction, createShadowExperience, createShadowExperienceBuffer, appendExperienceToBuffer,
  deriveExperiencePredictionError,
  evaluateExperienceEligibility, validateShadowExperience,
} from './shadow-experience-buffer-v1.js';

const require = createRequire(import.meta.url);
const STAGE3E_MODEL = require('../../artifacts/stage3e-routability-intelligence/lr-model.json');

export const INTEGRATED_LIVE_SHADOW_CONTRACT_ID = 'SENTINEL_INTEGRATED_LIVE_SHADOW_V1';
export const INTEGRATED_LIVE_SHADOW_SCHEMA_VERSION = 1;
export const STAGE3E_ROUTER_HASH = 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64';
export const STAGE3E_ROUTER_FREEZE_HASH = '5a8e22b5c6a6889df658a74d134b376ee79fa1214760204a3265fe01f27c6bd2';
export const FEATURE_CONTRACT_V2_HASH = '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb';
export const STAGE3E_TAU = 0.9;

export const IntegratedDegradationStatus = deepFreeze({
  HEALTHY: 'HEALTHY', DEGRADED: 'DEGRADED', PARTIAL_EVIDENCE: 'PARTIAL_EVIDENCE', CONFLICTED: 'CONFLICTED',
});

export const INTEGRATED_LIVE_SHADOW_CONTRACT = deepFreeze({
  contractId: INTEGRATED_LIVE_SHADOW_CONTRACT_ID,
  schemaVersion: INTEGRATED_LIVE_SHADOW_SCHEMA_VERSION,
  chain: ['OBSERVATION', 'WORLD_STATE', 'CALIBRATION', 'TRACE_ROUTER_RECOMMENDATION',
    'INCUMBENT_EXECUTION', 'COUNTERFACTUAL_LEDGER', 'OUTCOME', 'SHADOW_EXPERIENCE', 'VALIDATION', 'ELIGIBILITY'],
  missingEvidenceImpliesCompletion: false,
  calibrationInsufficientInventsSemantics: false,
  visualizationAffectsDecision: false,
  observatoryReadOnly: true,
  modelTrainingPerformed: false,
  onlineLearningEnabled: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
});
export const INTEGRATED_LIVE_SHADOW_CONTRACT_HASH = sha256(INTEGRATED_LIVE_SHADOW_CONTRACT);

/**
 * STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION. The Stage 3F.5 certificate (eda3d2d6…) is SUPERSEDED, not rewritten.
 * The features computed here are the DEPLOYABLE_RUNTIME_MODE features; they are not Stage 3E feature parity.
 */
export const INTEGRATED_RUNTIME_REMEDIATION = deepFreeze({
  gate: 'STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION',
  supersedesCertificationHash: 'eda3d2d67334dd904a24ff574f4e839e52fb67ec26fb01112b8f21c973b4fbe5',
  routerEquation: 'STAGE3E_CANONICAL_BIAS_LAST',
  incompleteRouterInput: 'FAIL_CLOSED_NO_ROUTE',
  abstentionEvidence: 'LEDGER_AND_EXPERIENCE_PRESERVED_WITHOUT_COUNTERFACTUAL',
  featureMode: 'DEPLOYABLE_RUNTIME_MODE',
  deployableStage3EFeatureParity: false,
  deployableRuntimeFeatureContractRequiresRedesign: true,
});

const runtimeEnvironment = deepFreeze({ identity: FORGE_GAME_ID, version: FORGE_WORLD_VERSION });
const traceProvenance = (sourceId, evidenceId) => ({
  environmentIdentity: runtimeEnvironment.identity, environmentVersion: runtimeEnvironment.version, sourceId, evidenceId,
});
const calibrationProvenance = (identity, sourceId, evidenceId) => ({
  environmentId: identity.environmentId, environmentVersion: identity.environmentVersion, sourceId, evidenceId,
});

function semantics(domain, transitionEvidenceId) {
  if (domain === CalibrationDomain.ACTION_SEMANTICS) return {
    actionId: 'FORGE_ACTION', actionVersion: '1', parameters: [], preconditions: ['listed by adapter'],
    expectedDirectEffects: ['deterministic Forge transition'], possibleSideEffects: [], resourceCosts: [],
    temporalDuration: { value: 1, units: 'logical-step' }, failureModes: [],
    legalityConstraints: ['action must be in adapter legal action set'], resultObservability: 'DIRECT',
  };
  if (domain === CalibrationDomain.RESOURCE_SEMANTICS) return {
    resourceId: 'energy', units: 'energy-points', directionality: ResourceDirectionality.INCREASE_DESIRABLE,
    scarcity: 'SCARCE', renewability: 'CONDITIONAL', capacity: { minimum: 0, maximum: 100 },
    consumptionRules: ['Forge action contract'], generationRules: [], conversionRules: [], strategicRelevance: 'action budget',
  };
  if (domain === CalibrationDomain.OBJECTIVE_SEMANTICS) return {
    objectiveId: 'FORGE_DECLARED_OBJECTIVES', description: 'Complete declared Forge objectives.', priority: 0,
    successConditions: ['all declared objectives complete'], failureConditions: ['Forge terminal failure'], terminality: 'TERMINAL',
    rewardRelationship: { status: 'DISTINCT', rewardSignalRef: 'forge.transition.reward' },
    timeHorizon: { type: 'EPISODE', maximumLogicalSteps: 128 },
  };
  if (domain === CalibrationDomain.TEMPORAL_SEMANTICS) return {
    timeModel: 'DISCRETE', logicalStepSemantics: 'one accepted incumbent transition', tickDuration: null,
    actionDuration: { model: 'FIXED', units: 'logical-step' }, observationCadence: { value: 1, units: 'logical-step' },
    outcomeDelay: { minimum: 0, maximum: 8, units: 'logical-step' }, episodeHorizon: { maximum: 128, units: 'logical-step' },
    planningHorizon: { certifiedMaximum: 3, units: 'logical-step' },
    temporalUncertainty: { status: 'BOUNDED', wallClockMappingKnown: false },
  };
  if (domain === CalibrationDomain.TRANSITION_SEMANTICS) return { assumptions: [{
    type: TransitionAssumption.ACTION_CONDITIONED, value: true, epistemicCategory: EpistemicCategory.OBSERVED,
    confidence: 1, evidenceRefs: [transitionEvidenceId],
  }] };
  throw new Error(`unsupported integrated calibration domain: ${domain}`);
}

export function createForgeIntegratedCalibration({ insufficient = false } = {}) {
  const identity = createEnvironmentIdentity({
    runtimeIdentity: FORGE_GAME_ID, environmentVersion: FORGE_WORLD_VERSION,
    environmentFamily: 'SENTINEL_FORGE', environmentSchemaVersion: '1',
    structuralSemantics: {
      observationSchemaHash: `sha256:${sha256('sentinel-forge-world/observation:v1')}`,
      actionSchemaHash: `sha256:${sha256('sentinel-forge-world/action:v1')}`,
      objectiveSchemaHash: `sha256:${sha256('sentinel-forge-world/objective:v1')}`,
      transitionContractVersion: FORGE_WORLD_VERSION,
    },
  });
  const calibrated = insufficient ? []
    : [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.RESOURCE_SEMANTICS,
      CalibrationDomain.OBJECTIVE_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS,
      CalibrationDomain.TRANSITION_SEMANTICS];
  const evidence = calibrated.map((domain) => createCalibrationEvidence({
    environmentIdentity: identity, domain, claimTarget: `${domain}:FORGE`, claimType: 'SEMANTIC_DEFINITION',
    claimValue: { present: true }, sourceReference: { contract: FORGE_WORLD_VERSION, domain },
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, material: true,
    provenance: calibrationProvenance(identity, 'forge-contract', `integrated-${domain}`),
  }));
  const definitions = calibrated.map((domain, index) => createSemanticDefinition({
    environmentIdentity: identity, domain, conceptId: `${domain}:FORGE`, conceptVersion: '1',
    semantics: semantics(domain, evidence[index].calibrationEvidenceId),
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    evidenceRefs: [evidence[index].calibrationEvidenceId],
    provenance: calibrationProvenance(identity, 'integrated-calibration', `definition-${domain}`),
  }));
  const calibratedSet = new Set(calibrated);
  const assessments = Object.values(CalibrationDomain).map((domain) => createDomainAssessment({
    environmentIdentity: identity, domain,
    status: calibratedSet.has(domain) ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
    confidence: calibratedSet.has(domain) ? 1 : null,
    evidenceRefs: calibratedSet.has(domain) ? evidence.filter((entry) => entry.domain === domain).map((entry) => entry.calibrationEvidenceId) : [],
    provenance: calibrationProvenance(identity, 'integrated-calibration', `assessment-${domain}`),
  }));
  return createEnvironmentCalibration({ environmentIdentity: identity, calibrationVersion: '3F.5.1', evidence,
    semanticDefinitions: definitions, domainAssessments: assessments });
}

function worldFacts(world, observation, logicalTime) {
  const source = `observation:${observation.sequence}:${observation.metadata.worldHash}`;
  const p = (path, value) => createWorldStateFact({ path, category: EpistemicCategory.OBSERVED,
    authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION, value, confidence: 1,
    uncertainty: { status: 'BOUNDED', radius: 0 }, provenance: traceProvenance('forge-adapter', `${source}:${path.join('.')}`) });
  return createWorldStateSnapshot({ environment: runtimeEnvironment, logicalTime, facts: [
    p(['temporalState', 'tick'], world.tick), p(['constraints', 'worldHash'], hashWorld(world)),
    p(['resources', 'actorEnergy'], world.constraints.energy), p(['entities', 'count'], world.entities.length),
    p(['relationships', 'count'], world.relations.length), p(['objectives', 'count'], world.objectives.length),
  ] });
}

const entropy = (counts) => { const total = counts.reduce((a, b) => a + b, 0); if (!total) return 0;
  return +(-counts.filter((c) => c > 0).reduce((sum, c) => sum + (c / total) * Math.log2(c / total), 0)).toFixed(4); };

/**
 * DEPLOYABLE_RUNTIME_MODE feature adapter: Stage 3E Feature Contract v2 field names computed from one-step V1
 * decision-time Forge evidence. This is NOT Stage 3E feature parity (Stage 3F.6-R): 16 derivation features diverge
 * (V1 vs V2 immediate semantics; one-step vs horizon-rollout greedy vectors) and 5 require genuine V2B evidence.
 */
export function extractIntegratedStage3EFeatures(state, observation, candidateRecommendation) {
  const forgeActions = forgeLegalActions(state.world);
  const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const branches = forgeActions.map((action, index) => {
    const descriptor = descriptors[index];
    const result = forgeWorldAdapter.step(state, descriptor, { observerId: FORGE_OBSERVER_ID });
    return { actionKey: forgeActionKey(action), actionType: action.actionType, targetId: action.target?.id ?? null,
      parameters: action.parameters, immediateScalar: result.reward, rewardVector: result.info.rewardVector };
  });
  const immediate = branches.map((entry) => entry.immediateScalar);
  const sorted = [...immediate].sort((a, b) => b - a); const t1 = sorted[0] ?? 0; const t2 = sorted[1] ?? t1; const t3 = sorted[2] ?? t2;
  const mean = immediate.reduce((a, b) => a + b, 0) / (immediate.length || 1);
  const spread = Math.sqrt(immediate.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (immediate.length || 1));
  const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState,
    legalActions: branches.map((entry) => ({ actionId: entry.actionKey, targetEntityId: entry.targetId })) });
  const selector = nexusRelationalSelector({ branches }, nexus);
  const greedy = heuristicGreedyBaseline({ branches });
  const greedyBranch = branches.find((entry) => entry.actionKey === greedy.actionId);
  const candidateBranch = branches.find((entry) => entry.actionKey === candidateRecommendation?.actionId);
  const reward = greedyBranch?.rewardVector ?? {};
  const typeCounts = Object.values(branches.reduce((acc, entry) => { acc[entry.actionType] = (acc[entry.actionType] ?? 0) + 1; return acc; }, {}));
  const moves = branches.filter((entry) => entry.actionType === 'MOVE');
  const nonMove = branches.filter((entry) => entry.actionType !== 'MOVE').map((entry) => entry.immediateScalar).sort((a, b) => b - a);
  const signals = nexus.signals ?? {};
  const values = {
    legalActionCount: branches.length, immediateMargin: t1 - t2, immediateMargin2: t1 - t3,
    immediateSpread: +spread.toFixed(3), immediateEntropy: entropy(immediate.map((v) => Math.max(0, v - Math.min(...immediate) + 1))),
    topTieCount: immediate.filter((v) => v === t1).length, nearTieCount: immediate.filter((v) => t1 - v <= 2).length,
    actionTypeEntropy: entropy(typeCounts), moveCount: moves.length,
    distinctMoveDirections: new Set(moves.map((entry) => entry.parameters?.direction)).size,
    bestNonMoveMargin: nonMove.length ? t1 - nonMove[0] : 0, greedyIsMove: greedyBranch?.actionType === 'MOVE' ? 1 : 0,
    greedyOptionValue: reward.optionValue ?? 0, greedyRiskExposure: reward.riskExposure ?? 0,
    greedyFuturePotential: reward.futureObjectivePotential ?? 0, greedyTerminalOutcome: reward.terminalOutcome ?? 0,
    greedyTimeCost: reward.timeCost ?? 0, greedyResourceCost: reward.resourceCost ?? 0,
    greedyInfraHealth: reward.infrastructureHealth ?? 0, nxBottleneck: signals.bottleneckCount ?? 0,
    nxCriticalDep: signals.criticalDependencyCount ?? 0, nxCycleDetected: (signals.cycleDetected ?? 0) > 0 ? 1 : 0,
    nxCycleNodes: signals.cycleNodeCount ?? 0, nxEdgeCount: signals.edgeCount ?? 0, nxGraphDensity: signals.graphDensity ?? 0,
    nxHostile: signals.hostileEntityCount ?? 0, nxIsolated: signals.isolatedEntityCount ?? 0,
    nxIsolatedRatio: signals.isolatedRatio ?? 0, nxMaxCentrality: signals.maxCentrality ?? 0,
    nxMaxDegree: signals.maxDegree ?? 0, nxMaxDepDepth: signals.maxDependencyDepth ?? 0,
    nxMaxDependents: signals.maxDependents ?? 0, nxThreatened: signals.threatenedEntityCount ?? 0,
    nxUncoveredThreat: signals.uncoveredThreatenedCount ?? 0, nxUnresolvedDep: signals.unresolvedDependencyCount ?? 0,
    nxUnsupportedThreat: signals.unsupportedThreatenedCount ?? 0, nxActionTargeted: signals.actionTargetedEntityCount ?? 0,
    nxConfidence: nexus.confidence ?? 0, nxAbstains: selector.abstain ? 1 : 0,
    greedyEqLearned: greedy.actionId === candidateRecommendation?.actionId ? 1 : 0,
    greedyEqNexus: !selector.abstain && greedy.actionId === selector.actionId ? 1 : 0,
    nexusEqLearned: !selector.abstain && selector.actionId === candidateRecommendation?.actionId ? 1 : 0,
    allThreeAgree: !selector.abstain && greedy.actionId === selector.actionId && greedy.actionId === candidateRecommendation?.actionId ? 1 : 0,
    sameActionType: greedyBranch && candidateBranch && greedyBranch.actionType === candidateBranch.actionType ? 1 : 0,
    sameTarget: greedyBranch && candidateBranch && (greedyBranch.targetId ?? null) === (candidateBranch.targetId ?? null) ? 1 : 0,
    tickProgress: state.world.maxTicks ? +(state.world.tick / state.world.maxTicks).toFixed(4) : 0,
    energy: state.world.constraints.energy, objectiveCount: state.world.objectives.length,
    entityCount: state.world.entities.length, relationCount: state.world.relations.length,
    decisionHorizonRemaining: Math.max(0, state.world.maxTicks - state.world.tick),
  };
  return deepFreeze({ values, branches, greedy, nexus, selector });
}

export const STAGE3E_ROUTER_ABSTAIN_ROUTE = 'ABSTAIN_INCOMPLETE_ROUTER_INPUT';

/**
 * Frozen Stage 3E logistic router. The frozen model stores weights in `keys` order with the bias LAST
 * (fit as hstack([standardized X, 1]) @ w): bias = w[keys.length], feature weight i = w[i].
 * Incomplete or non-finite input fails closed: no score and no route to any expert.
 */
export function evaluateIntegratedStage3ERouter(featureValues, candidateRecommendation) {
  if (!candidateRecommendation || typeof candidateRecommendation.actionId !== 'string') throw new Error('STAGE3D_CANDIDATE_EVIDENCE_REQUIRED');
  const { keys, mu, sd, w } = STAGE3E_MODEL;
  if (w.length !== keys.length + 1 || mu.length !== keys.length || sd.length !== keys.length) throw new Error('STAGE3E_MODEL_SHAPE_INVALID');
  let z = w[keys.length];
  let complete = featureValues !== null && typeof featureValues === 'object';
  for (let index = 0; complete && index < keys.length; index += 1) {
    const value = featureValues[keys[index]];
    if (typeof value !== 'number' || !Number.isFinite(value)) complete = false;
    else z += w[index] * ((value - mu[index]) / sd[index]);
  }
  const score = complete ? 1 / (1 + Math.exp(-z)) : null;
  const selectedRoute = score === null || !Number.isFinite(score) ? STAGE3E_ROUTER_ABSTAIN_ROUTE
    : score >= STAGE3E_TAU ? 'GREEDY' : 'LEARNED_NEXUS_V2B';
  return deepFreeze({ score: selectedRoute === STAGE3E_ROUTER_ABSTAIN_ROUTE ? null : score, threshold: STAGE3E_TAU, selectedRoute,
    routerHash: STAGE3E_ROUTER_HASH, freezeHash: STAGE3E_ROUTER_FREEZE_HASH });
}

const timer = (metrics, name, fn) => { const start = performance.now(); try { return fn(); } finally { metrics[name] = (metrics[name] ?? 0) + performance.now() - start; } };
const inject = (failureInjection, stage) => { if (failureInjection?.includes(stage)) throw new Error(`INJECTED_${stage}_FAILURE`); };

function makeCandidate(featureSeed) {
  const observation = forgeWorldAdapter.observe(featureSeed, FORGE_OBSERVER_ID);
  const evaluated = extractIntegratedStage3EFeatures(featureSeed, observation, null);
  const output = evaluated.selector.abstain ? evaluated.greedy : evaluated.selector;
  return { actionId: output.actionId,
    producerId: evaluated.selector.abstain ? 'HEURISTIC_GREEDY_IMMEDIATE' : 'NEXUS_RELATIONAL_SELECTOR_V1',
    producerVersion: '1' };
}

function actionDescriptorByKey(state, key) {
  const forge = forgeLegalActions(state.world); const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const index = forge.findIndex((action) => forgeActionKey(action) === key); return index < 0 ? null : descriptors[index];
}

/**
 * Starts one real-shaped step. The incumbent action is selected before any instrumentation and is always
 * executed exactly once through the existing Forge adapter, even if every shadow stage fails.
 */
export function beginIntegratedLiveShadowStep({ state, calibration = createForgeIntegratedCalibration(),
  incumbentAction = null, candidateRecommendation = null, failureInjection = [], humanOverride = false, telemetrySink = null } = {}) {
  const authority = defaultAuthorityPolicy(); assertEvaluationOnly(authority);
  const metrics = {}; const failures = [];
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const legal = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  if (legal.length === 0) throw new Error('NO_LEGAL_INCUMBENT_ACTION');
  const selectedIncumbent = incumbentAction ?? legal[0];
  if (!legal.some((entry) => entry.actionId === selectedIncumbent.actionId)) throw new Error('INCUMBENT_ACTION_NOT_LEGAL');
  const candidate = candidateRecommendation ?? makeCandidate(state);
  const logicalTime = state.sequence * 10;
  let worldState = null; let trace = null; let ledger = null; let experience = null; let router = null; let features = null;
  let calibrationBindings = null;
  try {
    worldState = timer(metrics, 'worldState', () => { inject(failureInjection, 'WORLD_STATE'); return worldFacts(state.world, observation, logicalTime); });
    timer(metrics, 'calibration', () => { inject(failureInjection, 'CALIBRATION');
      return evaluateCalibrationSufficiency(calibration, [CalibrationDomain.ACTION_SEMANTICS]); });
    trace = timer(metrics, 'trace', () => {
      inject(failureInjection, 'TRACE');
      features = timer(metrics, 'featureExtraction', () => extractIntegratedStage3EFeatures(state, observation, candidate));
      router = evaluateIntegratedStage3ERouter(features.values, candidate);
      // Fail closed: the Stage 3F.1 router evidence requires a real score, so incomplete input yields no recommendation.
      if (router.selectedRoute === STAGE3E_ROUTER_ABSTAIN_ROUTE) throw new Error('ROUTER_INPUT_INCOMPLETE_FAIL_CLOSED');
      const observationEvidence = createObservationEvidence({ observationId: `forge:${observation.sequence}:${observation.metadata.worldHash}`,
        environment: runtimeEnvironment, logicalTime, observationDigest: `sha256:${sha256(observation)}`,
        provenance: traceProvenance('forge-adapter', `observation-${observation.sequence}-${observation.metadata.worldHash}`) });
      const feature = createFeatureDerivationEvidence({ worldStateSnapshot: worldState,
        featureContract: { id: 'SENTINEL_FEATURE_CONTRACT_V2', version: '2', hash: FEATURE_CONTRACT_V2_HASH },
        featureValues: features.values, implementation: { id: 'STAGE3F6R_DEPLOYABLE_RUNTIME_FEATURE_ADAPTER_NOT_STAGE3E_PARITY', version: '1', hash: `sha256:${sha256(extractIntegratedStage3EFeatures.toString())}` },
        provenance: traceProvenance('stage3f5-feature-adapter', `features-${worldState.snapshotId}`) });
      const v2bEvidenceAvailable = candidate.producerId === 'LEARNED_NEXUS_SFT_V2B';
      const chosenKey = router.selectedRoute === 'GREEDY' ? features.greedy.actionId
        : v2bEvidenceAvailable ? candidate.actionId : null;
      const proposed = chosenKey === null ? null : actionDescriptorByKey(state, chosenKey);
      const predicted = createPredictorEvidence({ worldStateSnapshot: worldState,
        predictor: { id: candidate.producerId, version: candidate.producerVersion },
        outputSummary: { candidateActionId: candidate.actionId, actualOutcomeKnown: false }, confidence: 0.5,
        uncertainty: { status: 'UNQUANTIFIED' }, provenance: traceProvenance(candidate.producerId, `candidate-${candidate.actionId}`) });
      const routerEvidence = createRouterEvaluationEvidence({ featureDerivation: feature, predictorEvidence: [predicted],
        router: { id: 'STAGE3E_ROUTER', version: '3E', hash: STAGE3E_ROUTER_HASH }, score: router.score,
        threshold: router.threshold, selectedRoute: router.selectedRoute,
        fallback: { available: v2bEvidenceAvailable, used: router.selectedRoute !== 'GREEDY' && v2bEvidenceAvailable },
        provenance: traceProvenance('stage3e-router', `score-${feature.featureDerivationId}`) });
      const recommendation = createRecommendationEvidence({ routerEvaluation: routerEvidence, proposedAction: proposed,
        recommendedPath: proposed === null ? 'ABSTAINED_MISSING_STAGE3D_V2B_EVIDENCE' : router.selectedRoute,
        confidence: proposed === null ? null : router.score, uncertainty: { status: 'MODEL_SCORE_NOT_CAUSAL_CERTAINTY' },
        abstained: proposed === null,
        provenance: traceProvenance('sentinel-shadow', `recommendation-${routerEvidence.routerEvaluationId}`) });
      return createDecisionTimeTrace({ observationEvidence, worldStateSnapshot: worldState, featureDerivation: feature,
        predictorEvidence: [predicted], routerEvaluation: routerEvidence, recommendation });
    });
    calibrationBindings = timer(metrics, 'calibration', () => ({
      worldState: bindWorldStateCalibration(worldState, calibration),
      trace: bindCausalTraceCalibration(trace, calibration),
    }));
  } catch (error) { failures.push({ stage: trace === null ? (worldState === null ? 'WORLD_STATE' : 'DECISION_INSTRUMENTATION') : 'UNKNOWN', reason: error.message }); }

  // This is the sole authoritative transition. It is deliberately outside and after instrumentation's catch boundary.
  const executionStart = performance.now();
  const transition = forgeWorldAdapter.step(state, selectedIncumbent, { observerId: FORGE_OBSERVER_ID });
  metrics.incumbentExecution = performance.now() - executionStart;

  if (trace !== null) {
    try {
      trace = attachIncumbentAction(trace, { selectedAction: selectedIncumbent, logicalTime: logicalTime + 1,
        provenance: traceProvenance('incumbent-executor', `executed-${transition.info.worldHash}`) });
      ledger = timer(metrics, 'ledger', () => {
        inject(failureInjection, 'LEDGER'); let value = createCounterfactualVetoLedger({ trace, calibration });
        value = attachLedgerSelectedAction(value, { selectedAction: selectedIncumbent,
          selectedBy: { type: humanOverride ? LedgerActorType.HUMAN : LedgerActorType.INCUMBENT, id: humanOverride ? 'operator-1' : 'incumbent-policy' },
          executedBy: { type: LedgerActorType.INCUMBENT, id: 'forge-incumbent-executor' }, logicalTime: logicalTime + 1,
          actionRef: `forge-transition:${transition.info.worldHash}`, provenance: calibrationProvenance(calibration.environmentIdentity, 'incumbent-executor', `selected-${transition.info.worldHash}`) });
        if (humanOverride) value = attachLedgerVeto(value, { disposition: VetoDisposition.VETOED,
          actor: { type: LedgerActorType.HUMAN, id: 'operator-1' }, logicalTime: logicalTime + 1,
          provenance: calibrationProvenance(calibration.environmentIdentity, 'operator-1', `override-${transition.info.worldHash}`) });
        const decision = trace.decisionTimeEvent.decisionTimeEvidence;
        // An abstention is a valid Sentinel decision (NO_SENTINEL_PROPOSAL). A counterfactual requires a proposed
        // action, so none is attached; the ledger, selected action, and any veto are still preserved.
        if (decision.recommendation.abstained) return value;
        value = attachLedgerCounterfactual(value, { candidateAction: decision.recommendation.proposedAction,
          predictionRef: decision.predictorEvidence[0].predictorEvidenceId,
          predictionSource: decision.predictorEvidence[0].predictor, predictedOutcome: { status: 'PREDICTED_NOT_OBSERVED' },
          predictedStateRef: { type: 'UNRESOLVED_PREDICTED_STATE' }, predictedValue: null, predictedRisk: null,
          confidence: decision.recommendation.confidence, uncertainty: decision.recommendation.uncertainty,
          timing: CounterfactualTiming.DECISION_TIME, generatedLogicalTime: logicalTime, logicalTime,
          provenance: calibrationProvenance(calibration.environmentIdentity, 'sentinel-shadow', `counterfactual-${trace.traceId}`) });
        return value;
      });
      experience = timer(metrics, 'experience', () => { inject(failureInjection, 'EXPERIENCE');
        let value = createShadowExperience({ trace, ledger, calibration,
          provenance: calibrationProvenance(calibration.environmentIdentity, 'stage3f5', `experience-${trace.traceId}`) });
        value = attachExecutedAction(value, { ledger, selectedActionId: ledger.projection.selectedActions[0].selectedActionId });
        if (ledger.projection.counterfactuals.length > 0) {
          value = attachExperiencePrediction(value, { ledger, counterfactualId: ledger.projection.counterfactuals[0].counterfactualId });
        }
        return value; });
    } catch (error) { failures.push({ stage: ledger === null ? 'LEDGER' : 'EXPERIENCE', reason: error.message }); }
  }
  const pendingBody = { stateBefore: state, nextState: transition.state, transition, calibration, logicalTime,
    worldState, trace, ledger, experience, router, features, calibrationBindings, incumbentAction: selectedIncumbent,
    failures, metrics, humanOverride, authority };
  if (telemetrySink?.offer) {
    const start = performance.now(); try { inject(failureInjection, 'OBSERVATORY'); telemetrySink.offer(projectIntegratedTelemetry(pendingBody)); }
    catch (error) { /* The read-only view is intentionally outside the decision and transition error surface. */ }
    metrics.observatoryProducer = performance.now() - start;
  }
  return deepFreeze(pendingBody);
}

export function completeIntegratedLiveShadowStep(pending, { outcomeDelay = 1, observationCompleteness = 'COMPLETE', telemetrySink = null,
  failureInjection = [] } = {}) {
  const metrics = { ...pending.metrics }; const failures = [...pending.failures];
  let { trace, ledger, experience, calibration } = pending; let actualState = null; let experienceBuffer = null;
  const outcomeTime = pending.logicalTime + 1 + outcomeDelay;
  if (trace !== null) {
    try {
      inject(failureInjection, 'OUTCOME');
      const nextObservation = forgeWorldAdapter.observe(pending.nextState, FORGE_OBSERVER_ID);
      actualState = timer(metrics, 'worldState', () => worldFacts(pending.nextState.world, nextObservation, outcomeTime));
      trace = attachOutcome(trace, { actualStateSnapshot: actualState, logicalTime: outcomeTime,
        outcomeSummary: { reward: pending.transition.reward, terminal: pending.transition.terminal,
          forgeOutcome: pending.transition.info.outcome }, observationCompleteness,
        provenance: traceProvenance('forge-adapter', `outcome-${pending.transition.info.worldHash}`) });
      if (ledger !== null) ledger = timer(metrics, 'ledger', () => {
        let value = attachLedgerActualOutcome(ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
        const counterfactual = value.projection.counterfactuals[0] ?? null;
        value = attachLedgerEvaluation(value, { calibration,
          requiredCapabilities: [CalibrationDomain.ACTION_SEMANTICS],
          // Without a Sentinel proposal there is nothing to compare against the selected action.
          status: counterfactual ? LedgerEvaluationStatus.BOTH_PLAUSIBLE : LedgerEvaluationStatus.INCOMPARABLE,
          metrics: counterfactual ? [{ domain: CalibrationDomain.ACTION_SEMANTICS, metricType: 'ACTION_MATCH',
            predictionRef: counterfactual.counterfactualId,
            actualOutcomeRef: trace.projection.outcomes[0].outcomeId,
            value: { match: trace.projection.incumbentActions[0].matchingRecommendationStatus === ActionMatchStatus.MATCH } }] : [],
          logicalTime: outcomeTime, provenance: calibrationProvenance(calibration.environmentIdentity, 'stage3f5', `ledger-evaluation-${trace.traceId}`) });
        return value;
      });
      if (experience !== null && ledger !== null) experience = timer(metrics, 'experience', () => {
        let value = attachExperienceActualOutcome(experience, { trace, actualStateSnapshots: [actualState], outcomeId: trace.projection.outcomes[0].outcomeId });
        value = validateShadowExperience(value, { trace, ledger, calibration, logicalTime: outcomeTime,
          provenance: calibrationProvenance(calibration.environmentIdentity, 'stage3f5-validator', `validation-${trace.traceId}`) });
        // Every purpose is evaluated, so prediction-dependent profiles are explicitly INELIGIBLE after an abstention.
        for (const purpose of Object.values(ExperiencePurpose)) {
          value = evaluateExperienceEligibility(value, { purpose, calibration, logicalTime: outcomeTime,
            provenance: calibrationProvenance(calibration.environmentIdentity, 'stage3f5-eligibility', `eligibility-${purpose}-${trace.traceId}`) });
        }
        const prediction = value.projection.predictions[0] ?? null;
        value = deriveExperiencePredictionError(value, { calibration,
          requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS],
          components: prediction ? [{ domain: CalibrationDomain.RESOURCE_SEMANTICS, metricType: 'OBSERVED_TRANSITION_AVAILABLE',
            predictionRef: prediction.predictionBindingId,
            actualOutcomeRef: value.projection.actualOutcomes[0].actualOutcomeRef,
            value: { compared: false, reason: 'STAGE3F5_DOES_NOT_ESTABLISH_PREDICTION_RELIABILITY' } }] : [], logicalTime: outcomeTime,
          provenance: calibrationProvenance(calibration.environmentIdentity, 'stage3f5-analysis', `prediction-error-${trace.traceId}`) });
        return value;
      });
      if (experience !== null) {
        experienceBuffer = createShadowExperienceBuffer({ bufferVersion: '3F.5.1' });
        experienceBuffer = appendExperienceToBuffer(experienceBuffer, experience);
      }
    } catch (error) { failures.push({ stage: 'OUTCOME_PIPELINE', reason: error.message }); }
  }
  if (experience?.projection?.eligibilityByPurpose?.ROUTER_ANALYSIS?.status === 'INELIGIBLE'
      && experience.projection.eligibilityByPurpose.ROUTER_ANALYSIS.reasons.includes('CALIBRATION_INSUFFICIENT')) {
    failures.push({ stage: 'CALIBRATION', reason: 'CALIBRATION_INSUFFICIENT' });
  }
  const status = failures.length === 0 ? IntegratedDegradationStatus.HEALTHY
    : trace?.projection?.lifecycleStatus === 'CONFLICTED' ? IntegratedDegradationStatus.CONFLICTED
      : trace === null || ledger === null || experience === null ? IntegratedDegradationStatus.PARTIAL_EVIDENCE
        : IntegratedDegradationStatus.DEGRADED;
  // featureExtraction is measured explicitly but is already contained by trace;
  // incumbentExecution is authoritative work rather than instrumentation.
  const total = Object.entries(metrics).filter(([key]) => !['incumbentExecution', 'featureExtraction'].includes(key))
    .reduce((sum, [, value]) => sum + value, 0); metrics.total = total;
  const resultBody = { recordType: 'SENTINEL_INTEGRATED_LIVE_SHADOW_RESULT_V1', contractId: INTEGRATED_LIVE_SHADOW_CONTRACT_ID,
    contractHash: INTEGRATED_LIVE_SHADOW_CONTRACT_HASH, logicalTime: pending.logicalTime, outcomeTime,
    worldState: pending.worldState, actualState, calibrationBindings: pending.calibrationBindings,
    calibrationRef: { calibrationId: calibration.calibrationId, calibrationDigest: calibration.calibrationDigest },
    trace, ledger, experience, experienceBuffer, incumbentAction: pending.incumbentAction,
    transition: pending.transition, router: pending.router, degradation: { status, failures }, authority: pending.authority };
  const result = deepFreeze({ ...resultBody, resultDigest: `sha256:${sha256(resultBody)}`, metrics: canonicalize(metrics) });
  if (telemetrySink?.offer) { const start = performance.now(); try { telemetrySink.offer(projectIntegratedTelemetry(result)); } catch {}
    metrics.observatoryProducer = (metrics.observatoryProducer ?? 0) + performance.now() - start; }
  return result;
}

export function projectIntegratedTelemetry(value) {
  const trace = value.trace; const experience = value.experience; const ledger = value.ledger;
  return deepFreeze({ schemaVersion: 1, logicalTime: value.logicalTime, outcomeTime: value.outcomeTime ?? null,
    world: value.nextState?.world ?? value.transition?.state?.world ?? null,
    worldState: value.worldState ?? null, actualState: value.actualState ?? null,
    trace: trace ? { traceId: trace.traceId, traceDigest: trace.traceDigest, lifecycleStatus: trace.projection.lifecycleStatus,
      outcomeStatus: trace.projection.outcomeStatus, matchingStatus: trace.projection.incumbentActions[0]?.matchingRecommendationStatus ?? 'UNKNOWN',
      recommendation: trace.decisionTimeEvent.decisionTimeEvidence.recommendation,
      observationId: trace.decisionTimeEvent.decisionTimeEvidence.observationEvidence.observationEvidenceId,
      worldStateId: trace.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot.snapshotId,
      featureDerivationId: trace.decisionTimeEvent.decisionTimeEvidence.featureDerivation.featureDerivationId,
      routerEvaluationId: trace.decisionTimeEvent.decisionTimeEvidence.routerEvaluation.routerEvaluationId,
      recommendationId: trace.decisionTimeEvent.decisionTimeEvidence.recommendation.recommendationId,
      incumbentActionId: trace.projection.incumbentActions[0]?.incumbentActionId ?? null,
      outcomeId: trace.projection.outcomes[0]?.outcomeId ?? null } : null,
    ledger: ledger ? { ledgerEntryId: ledger.ledgerEntryId, ledgerDigest: ledger.ledgerDigest,
      lifecycleStatus: ledger.projection.lifecycleStatus, counterfactualCount: ledger.projection.counterfactuals.length,
      sentinelProposal: ledger.decisionEpisode.sentinelProposal,
      selectedActions: ledger.projection.selectedActions, outcomes: ledger.projection.outcomes,
      evaluations: ledger.projection.evaluations, counterfactuals: ledger.projection.counterfactuals,
      vetoes: ledger.projection.vetoes } : null,
    experience: experience ? { experienceId: experience.experienceId, experienceDigest: experience.experienceDigest,
      validationStatus: experience.projection.validations.at(-1)?.status ?? 'RECORDED',
      eligibility: experience.projection.eligibilityByPurpose,
      predictionErrorStatus: experience.projection.predictionErrors.at(-1)?.status ?? 'UNKNOWN' } : null,
    router: value.router ?? null, degradation: value.degradation ?? { status: value.failures?.length ? 'PARTIAL_EVIDENCE' : 'HEALTHY', failures: value.failures ?? [] },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true } });
}

export function summarizeTimings(samples) {
  const keys = [...new Set(samples.flatMap((sample) => Object.keys(sample)))].sort();
  return Object.fromEntries(keys.map((key) => { const values = samples.map((sample) => sample[key] ?? 0).sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / (values.length || 1); const q = (p) => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ?? 0;
    return [key, { meanMs: +mean.toFixed(6), p95Ms: +q(0.95).toFixed(6), p99Ms: +q(0.99).toFixed(6) }]; }));
}

function chooseRecommendedIncumbent(state, candidate) {
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const feature = extractIntegratedStage3EFeatures(state, observation, candidate);
  const route = evaluateIntegratedStage3ERouter(feature.values, candidate);
  return actionDescriptorByKey(state, route.selectedRoute === 'GREEDY' ? feature.greedy.actionId : candidate.actionId);
}

/** A deterministic, bounded live-shaped campaign. Timing diagnostics are explicitly excluded from campaign identity. */
export function runIntegratedLiveShadowCampaign({ telemetrySink = null } = {}) {
  const modes = [
    { id: 'AGREEMENT', family: 'archimedes/repair_network', level: 0, seed: 3, agreement: true },
    // Stage 3F.6-R: seed 11 abstains under the corrected router (score 0.7056), so it cannot exercise disagreement.
    // Seed 12 is the first seed >= 11 in this family/level where the corrected router proposes an action (erratum).
    { id: 'DISAGREEMENT', family: 'prime/adversarial_choice', level: 1, seed: 12, disagreement: true },
    { id: 'DELAYED_OUTCOME', family: 'archimedes/repair_network', level: 2, seed: 4, outcomeDelay: 4 },
    { id: 'UNKNOWN_OUTCOME', family: 'archimedes/repair_network', level: 3, seed: 12, unresolved: true },
    { id: 'INVALID_INELIGIBLE', family: 'archimedes/repair_network', level: 1, seed: 8, insufficient: true },
    { id: 'CALIBRATION_FAILURE', family: 'prime/adversarial_choice', level: 4, seed: 19, beginFailures: ['CALIBRATION'] },
    { id: 'COUNTERFACTUAL', family: 'archimedes/repair_network', level: 4, seed: 6 },
    { id: 'HUMAN_OVERRIDE', family: 'archimedes/repair_network', level: 5, seed: 1, humanOverride: true, disagreement: true },
  ];
  const results = []; const timingSamples = [];
  for (const mode of modes) {
    const config = generateScenario({ family: mode.family, level: mode.level, seed: mode.seed });
    const state = forgeWorldAdapter.cloneState({ ...forgeWorldAdapter.initialState(mode.seed), world: createWorld(mode.seed, config), sequence: 0 });
    const candidate = makeCandidate(state); const legal = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
    const recommended = chooseRecommendedIncumbent(state, candidate);
    let incumbent = mode.agreement ? recommended : legal[0];
    if (mode.disagreement) incumbent = legal.find((entry) => entry.actionId !== recommended.actionId)
      ?? legal.find((entry) => stableAction(entry) !== stableAction(recommended)) ?? legal.at(-1);
    const started = beginIntegratedLiveShadowStep({ state, calibration: createForgeIntegratedCalibration({ insufficient: mode.insufficient }),
      incumbentAction: incumbent, candidateRecommendation: candidate, failureInjection: mode.beginFailures ?? [],
      humanOverride: mode.humanOverride, telemetrySink });
    const completed = mode.unresolved ? null : completeIntegratedLiveShadowStep(started, { outcomeDelay: mode.outcomeDelay ?? 1, telemetrySink });
    const evidence = completed ?? started;
    timingSamples.push(evidence.metrics);
    results.push(deepFreeze({ id: mode.id, family: mode.family, seed: mode.seed,
      status: completed?.degradation?.status ?? (started.failures.length ? IntegratedDegradationStatus.PARTIAL_EVIDENCE : IntegratedDegradationStatus.HEALTHY),
      worldStateDigest: evidence.worldState?.snapshotId ?? null,
      calibrationId: evidence.calibrationRef?.calibrationId ?? evidence.calibration?.calibrationId ?? null,
      traceId: evidence.trace?.traceId ?? null, traceDigest: evidence.trace?.traceDigest ?? null,
      ledgerEntryId: evidence.ledger?.ledgerEntryId ?? null, ledgerDigest: evidence.ledger?.ledgerDigest ?? null,
      experienceId: evidence.experience?.experienceId ?? null, experienceDigest: evidence.experience?.experienceDigest ?? null,
      experienceBufferDigest: evidence.experienceBuffer?.bufferDigest ?? null,
      actionMatch: evidence.trace?.projection?.incumbentActions?.[0]?.matchingRecommendationStatus ?? 'UNKNOWN',
      outcomeStatus: evidence.trace?.projection?.outcomeStatus ?? 'UNKNOWN',
      validationStatus: evidence.experience?.projection?.validations?.at(-1)?.status ?? 'UNRESOLVED',
      eligibilityStatus: evidence.experience?.projection?.eligibilityByPurpose?.ROUTER_ANALYSIS?.status ?? 'UNRESOLVED',
      counterfactualCount: evidence.ledger?.projection?.counterfactuals?.length ?? 0,
      humanOverride: mode.humanOverride === true, failures: evidence.failures ?? evidence.degradation?.failures ?? [],
      incumbentWorldHash: evidence.transition.info.worldHash,
    }));
  }
  const governed = { recordType: 'SENTINEL_INTEGRATED_LIVE_SHADOW_CAMPAIGN_V1', contractHash: INTEGRATED_LIVE_SHADOW_CONTRACT_HASH,
    stage3eRouterHash: STAGE3E_ROUTER_HASH, featureContractHash: FEATURE_CONTRACT_V2_HASH, episodes: results,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
    visualizationExcludedFromIdentity: true, modelTrainingPerformed: false, onlineLearningEnabled: false };
  return deepFreeze({ ...governed, campaignHash: `sha256:${sha256(governed)}`, performance: summarizeTimings(timingSamples) });
}

function stableAction(action) { return JSON.stringify(canonicalize(action)); }
