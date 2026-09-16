import { deepFreeze } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { nexusRelationalSelector } from '../lab/stage3c-learned-nexus.js';
import {
  DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_FEATURES,
  DeployableCapability, DeployableContractError, DeployableProfile, FeatureValueStatus,
  OBSERVATION_BINDING, evaluateProfileCapabilities, profileRequirements,
} from './deployable-feature-contract-v1.js';

/* ===========================================================================
 * STAGE_3F_6_S — deployable feature extractor.
 *
 * Environment-agnostic by construction: it never imports a simulator, never
 * reaches into authoritative world state, and takes every privileged capability
 * as an INJECTED, DECLARED dependency. With no simulator and no V2B expert it
 * still produces a complete, honest DEPLOYABLE_CORE result in which unavailable
 * features are reported as UNAVAILABLE rather than zero.
 * ========================================================================= */

const CAP = DeployableCapability;

/** Matches the frozen Stage 3E entropy helper exactly (4-decimal quantization). */
const entropy = (counts) => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return +(-counts.filter((c) => c > 0).reduce((sum, c) => sum + (c / total) * Math.log2(c / total), 0)).toFixed(4);
};

const available = (value) => ({ value, status: FeatureValueStatus.AVAILABLE, reason: null });
const unavailable = (reason) => ({ value: null, status: FeatureValueStatus.UNAVAILABLE, reason });
const unknown = (reason) => ({ value: null, status: FeatureValueStatus.UNKNOWN, reason });

/** Reward components are reported UNKNOWN when the environment omits them — never defaulted to 0. */
const component = (vector, key) => (vector && Object.hasOwn(vector, key) && typeof vector[key] === 'number'
  ? available(vector[key])
  : unknown(`one-step reward vector does not declare '${key}'`));

function observationIsSchemaBound(observation) {
  return Boolean(observation)
    && observation.schemaId === OBSERVATION_BINDING.schemaId
    && observation.schemaVersion === OBSERVATION_BINDING.schemaVersion
    && Array.isArray(observation.features)
    && observation.features.length === OBSERVATION_BINDING.vectorLength;
}

/**
 * Declared capabilities. A capability is present only when the evidence that backs it is
 * actually supplied: this is what makes a profile able to report itself unsatisfied.
 */
export function declareCapabilities({ observation = null, legalActions = null, simulator = null, v2bAnswer = null } = {}) {
  const capabilities = [];
  const schemaBound = observationIsSchemaBound(observation);
  if (schemaBound) capabilities.push(CAP.OBSERVATION_SCHEMA_BOUND);
  if (Array.isArray(legalActions)) capabilities.push(CAP.LEGAL_ACTION_SURFACE);
  // The relational expert is deterministic and in-repo, but it can only run on an observed canonical state.
  if (schemaBound && observation?.metadata?.canonicalState) capabilities.push(CAP.RELATIONAL_EXPERT);
  if (simulator) capabilities.push(CAP.SIMULATOR_ONE_STEP);
  if (v2bAnswer && v2bAnswer.provenance === 'GENUINE_V2B') capabilities.push(CAP.EXPERT_V2B);
  return capabilities.sort();
}

/**
 * A simulator capability is admissible only if it declares itself one-step. Anything claiming a
 * horizon, a rollout, or a continuation policy is rejected outright in every profile.
 */
function assertOneStepSimulator(simulator) {
  if (!simulator) return;
  if (typeof simulator.oneStep !== 'function') {
    throw new DeployableContractError('SIMULATOR_ONE_STEP capability must expose oneStep(actionId)');
  }
  if (simulator.horizonSteps !== 1) {
    throw new DeployableContractError(
      `SIMULATOR_ONE_STEP capability must declare horizonSteps=1, received ${String(simulator.horizonSteps)}`,
    );
  }
  if (simulator.multiStepRollout === true || typeof simulator.rollout === 'function') {
    throw new DeployableContractError('multi-step rollout is not admissible in any deployable profile');
  }
}

function contextFeatures(observation, schemaBound) {
  if (!schemaBound) {
    const reason = 'observation packet does not match the bound observation schema identity';
    return {
      'context.decisionHorizonRemaining': unknown(reason),
      'context.tickProgress': unknown(reason),
      'resources.actorEnergy': unknown(reason),
      'context.entityCount': unknown(reason),
      'context.relationCount': unknown(reason),
      'context.objectiveCount': unknown(reason),
    };
  }
  const vector = observation.features;
  const index = OBSERVATION_BINDING.vector;
  const tick = vector[index.tick];
  const remaining = vector[index.decisionHorizonRemaining];
  const maxTicks = tick + remaining;
  const canonical = observation.metadata?.canonicalState ?? null;
  const objectives = observation.metadata?.objectives ?? null;

  return {
    'context.decisionHorizonRemaining': available(Math.max(0, remaining)),
    'context.tickProgress': available(maxTicks ? +(tick / maxTicks).toFixed(4) : 0),
    'resources.actorEnergy': available(vector[index.energyBudget]),
    'context.entityCount': Array.isArray(canonical?.entities)
      ? available(canonical.entities.length)
      : unknown('observed canonical state discloses no entity collection'),
    'context.relationCount': Array.isArray(canonical?.relationships)
      ? available(canonical.relationships.length)
      : unknown('observed canonical state discloses no relationship collection'),
    'context.objectiveCount': Array.isArray(objectives)
      ? available(objectives.length)
      : unknown('observation discloses no objective list'),
  };
}

function actionSurfaceFeatures(legalActions) {
  if (!Array.isArray(legalActions)) {
    const reason = 'LEGAL_ACTION_SURFACE capability not declared';
    return {
      'actionSurface.legalActionCount': unavailable(reason),
      'actionSurface.actionTypeEntropy': unavailable(reason),
      'actionSurface.moveCount': unavailable(reason),
      'actionSurface.distinctMoveDirections': unavailable(reason),
    };
  }
  const typeCounts = Object.values(legalActions.reduce((acc, action) => {
    acc[action.actionType] = (acc[action.actionType] ?? 0) + 1;
    return acc;
  }, {}));
  const moves = legalActions.filter((action) => action.actionType === 'MOVE');
  return {
    'actionSurface.legalActionCount': available(legalActions.length),
    'actionSurface.actionTypeEntropy': available(entropy(typeCounts)),
    'actionSurface.moveCount': available(moves.length),
    'actionSurface.distinctMoveDirections': available(new Set(moves.map((action) => action.parameters?.direction)).size),
  };
}

const RELATIONAL_SIGNAL_BY_FEATURE = deepFreeze({
  'relational.bottleneckCount': 'bottleneckCount',
  'relational.criticalDependencyCount': 'criticalDependencyCount',
  'relational.cycleNodeCount': 'cycleNodeCount',
  'relational.edgeCount': 'edgeCount',
  'relational.graphDensity': 'graphDensity',
  'relational.hostileEntityCount': 'hostileEntityCount',
  'relational.isolatedEntityCount': 'isolatedEntityCount',
  'relational.isolatedRatio': 'isolatedRatio',
  'relational.maxCentrality': 'maxCentrality',
  'relational.maxDegree': 'maxDegree',
  'relational.maxDependencyDepth': 'maxDependencyDepth',
  'relational.maxDependents': 'maxDependents',
  'relational.threatenedEntityCount': 'threatenedEntityCount',
  'relational.unresolvedDependencyCount': 'unresolvedDependencyCount',
  'relational.unsupportedThreatenedCount': 'unsupportedThreatenedCount',
  'relational.uncoveredThreatenedCount': 'uncoveredThreatenedCount',
  'relational.actionTargetedEntityCount': 'actionTargetedEntityCount',
});

function relationalFeatures(observation, legalActions, hasRelational) {
  const ids = [...Object.keys(RELATIONAL_SIGNAL_BY_FEATURE), 'relational.cycleDetected', 'relational.confidence', 'relational.abstains'];
  if (!hasRelational) {
    const reason = 'RELATIONAL_EXPERT capability not declared (no observed canonical state)';
    return { values: Object.fromEntries(ids.map((id) => [id, unavailable(reason)])), nexus: null, selector: null };
  }

  const hasActions = Array.isArray(legalActions);
  const nexus = evaluateNexus({
    canonicalState: observation.metadata.canonicalState,
    legalActions: hasActions ? legalActions.map((action) => ({ actionId: action.actionId, targetEntityId: action.targetEntityId ?? null })) : [],
  });
  const signals = nexus.signals ?? {};
  // The selector reads action TYPE and identity only; it never reads an action's value.
  const selector = hasActions
    ? nexusRelationalSelector({ branches: legalActions.map((action) => ({ actionKey: action.actionId, actionType: action.actionType })) }, nexus)
    : null;

  const values = {};
  for (const [featureId, signal] of Object.entries(RELATIONAL_SIGNAL_BY_FEATURE)) {
    // Action-conditioned relational signals are meaningless without the legal action surface.
    if (!hasActions && (featureId === 'relational.uncoveredThreatenedCount' || featureId === 'relational.actionTargetedEntityCount')) {
      values[featureId] = unavailable('LEGAL_ACTION_SURFACE capability not declared');
      continue;
    }
    values[featureId] = typeof signals[signal] === 'number'
      ? available(signals[signal])
      : unknown(`relational expert did not report '${signal}'`);
  }
  values['relational.cycleDetected'] = typeof signals.cycleDetected === 'number'
    ? available(signals.cycleDetected > 0 ? 1 : 0)
    : unknown("relational expert did not report 'cycleDetected'");
  values['relational.confidence'] = typeof nexus.confidence === 'number'
    ? available(nexus.confidence)
    : unknown('relational expert did not report confidence');
  values['relational.abstains'] = selector
    ? available(selector.abstain ? 1 : 0)
    : unavailable('LEGAL_ACTION_SURFACE capability not declared');

  return { values, nexus, selector };
}

const ONE_STEP_IDS = deepFreeze([
  'oneStep.actionValueMargin', 'oneStep.actionValueMargin2', 'oneStep.actionValueSpread', 'oneStep.actionValueEntropy',
  'oneStep.topValueTieCount', 'oneStep.nearValueTieCount', 'oneStep.bestNonMoveValueMargin', 'oneStep.bestActionIsMove',
  'oneStep.bestActionEqualsRelationalChoice', 'oneStep.bestActionObjectiveProgressDelta', 'oneStep.bestActionOptionValueDelta',
  'oneStep.bestActionInfrastructureHealthDelta', 'oneStep.bestActionResourceCost', 'oneStep.bestActionRiskExposure',
  'oneStep.bestActionTimeCost', 'oneStep.bestActionTerminalOutcome',
]);

function oneStepFeatures(legalActions, simulator, selector) {
  if (!simulator || !Array.isArray(legalActions)) {
    const reason = !simulator ? 'SIMULATOR_ONE_STEP capability not declared' : 'LEGAL_ACTION_SURFACE capability not declared';
    return { values: Object.fromEntries(ONE_STEP_IDS.map((id) => [id, unavailable(reason)])), best: null };
  }
  if (legalActions.length === 0) {
    const reason = 'no legal action exists at this decision point';
    return { values: Object.fromEntries(ONE_STEP_IDS.map((id) => [id, unknown(reason)])), best: null };
  }

  const outcomes = legalActions.map((action) => {
    const result = simulator.oneStep(action.actionId);
    return { action, value: result.reward, rewardVector: result.rewardVector ?? null };
  });
  const values = outcomes.map((entry) => entry.value);
  const sorted = [...values].sort((a, b) => b - a);
  const t1 = sorted[0]; const t2 = sorted[1] ?? t1; const t3 = sorted[2] ?? t2;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const spread = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  const minimum = Math.min(...values);
  // Deterministic tie-break by action identity, so an equal-value tie cannot depend on enumeration order.
  const best = [...outcomes].sort((a, b) => (b.value - a.value)
    || (a.action.actionId < b.action.actionId ? -1 : a.action.actionId > b.action.actionId ? 1 : 0))[0];
  const nonMove = outcomes.filter((entry) => entry.action.actionType !== 'MOVE').map((entry) => entry.value).sort((a, b) => b - a);
  const reward = best.rewardVector;

  return {
    best,
    values: {
      'oneStep.actionValueMargin': available(t1 - t2),
      'oneStep.actionValueMargin2': available(t1 - t3),
      'oneStep.actionValueSpread': available(+spread.toFixed(3)),
      'oneStep.actionValueEntropy': available(entropy(values.map((value) => Math.max(0, value - minimum + 1)))),
      'oneStep.topValueTieCount': available(values.filter((value) => value === t1).length),
      'oneStep.nearValueTieCount': available(values.filter((value) => t1 - value <= 2).length),
      'oneStep.bestNonMoveValueMargin': nonMove.length
        ? available(t1 - nonMove[0])
        : unknown('no legal non-MOVE action exists at this decision point'),
      'oneStep.bestActionIsMove': available(best.action.actionType === 'MOVE' ? 1 : 0),
      'oneStep.bestActionEqualsRelationalChoice': selector
        ? available(!selector.abstain && best.action.actionId === selector.actionId ? 1 : 0)
        : unavailable('RELATIONAL_EXPERT capability not declared'),
      'oneStep.bestActionObjectiveProgressDelta': component(reward, 'futureObjectivePotential'),
      'oneStep.bestActionOptionValueDelta': component(reward, 'optionValue'),
      'oneStep.bestActionInfrastructureHealthDelta': component(reward, 'infrastructureHealth'),
      'oneStep.bestActionResourceCost': component(reward, 'resourceCost'),
      'oneStep.bestActionRiskExposure': component(reward, 'riskExposure'),
      'oneStep.bestActionTimeCost': component(reward, 'timeCost'),
      'oneStep.bestActionTerminalOutcome': component(reward, 'terminalOutcome'),
    },
  };
}

const V2B_IDS = deepFreeze([
  'expert.v2bAgreesWithOneStepBest', 'expert.v2bAgreesWithRelationalChoice', 'expert.allThreeAgree',
  'expert.v2bSameActionTypeAsOneStepBest', 'expert.v2bSameTargetAsOneStepBest',
]);

function v2bFeatures(v2bAnswer, legalActions, best, selector) {
  if (!v2bAnswer || v2bAnswer.provenance !== 'GENUINE_V2B') {
    const reason = v2bAnswer
      ? 'answer is not provenance-bound to the genuine V2B expert; substitution is not permitted'
      : 'EXPERT_V2B capability not declared';
    return Object.fromEntries(V2B_IDS.map((id) => [id, unavailable(reason)]));
  }
  const answerAction = Array.isArray(legalActions)
    ? legalActions.find((action) => action.actionId === v2bAnswer.actionId) ?? null
    : null;
  const agreesWithBest = best ? available(best.action.actionId === v2bAnswer.actionId ? 1 : 0) : unavailable('SIMULATOR_ONE_STEP capability not declared');
  const agreesWithRelational = selector
    ? available(!selector.abstain && selector.actionId === v2bAnswer.actionId ? 1 : 0)
    : unavailable('RELATIONAL_EXPERT capability not declared');

  return {
    'expert.v2bAgreesWithOneStepBest': agreesWithBest,
    'expert.v2bAgreesWithRelationalChoice': agreesWithRelational,
    'expert.allThreeAgree': best && selector
      ? available(!selector.abstain && best.action.actionId === selector.actionId && best.action.actionId === v2bAnswer.actionId ? 1 : 0)
      : unavailable('allThreeAgree requires both SIMULATOR_ONE_STEP and RELATIONAL_EXPERT'),
    'expert.v2bSameActionTypeAsOneStepBest': best && answerAction
      ? available(best.action.actionType === answerAction.actionType ? 1 : 0)
      : best ? unknown('the V2B answer does not correspond to a legal action at this decision point')
        : unavailable('SIMULATOR_ONE_STEP capability not declared'),
    'expert.v2bSameTargetAsOneStepBest': best && answerAction
      ? available((best.action.targetEntityId ?? null) === (answerAction.targetEntityId ?? null) ? 1 : 0)
      : best ? unknown('the V2B answer does not correspond to a legal action at this decision point')
        : unavailable('SIMULATOR_ONE_STEP capability not declared'),
  };
}

/**
 * Extract the deployable feature set for one decision point.
 *
 * Every privileged capability is injected and declared. Nothing here reads authoritative
 * world state, future outcomes, labels, or a continuation rollout.
 */
export function extractDeployableFeatures({
  observation = null,
  legalActions = null,
  profile = DeployableProfile.DEPLOYABLE_CORE,
  simulator = null,
  v2bAnswer = null,
} = {}) {
  const definition = profileRequirements(profile);
  assertOneStepSimulator(simulator);

  const declared = declareCapabilities({ observation, legalActions, simulator, v2bAnswer });
  const capabilities = evaluateProfileCapabilities(profile, declared);
  const schemaBound = declared.includes(CAP.OBSERVATION_SCHEMA_BOUND);
  const hasRelational = declared.includes(CAP.RELATIONAL_EXPERT);

  const relational = relationalFeatures(observation, legalActions, hasRelational);
  // Simulator-derived evidence is computed only when the profile actually admits it.
  const admitsSimulator = profile !== DeployableProfile.DEPLOYABLE_CORE;
  const oneStep = admitsSimulator
    ? oneStepFeatures(legalActions, simulator, relational.selector)
    : { values: Object.fromEntries(ONE_STEP_IDS.map((id) => [id, unavailable('feature is not part of the DEPLOYABLE_CORE profile')])), best: null };
  const admitsV2B = profile === DeployableProfile.DEPLOYABLE_WITH_V2B;
  const expert = admitsV2B
    ? v2bFeatures(v2bAnswer, legalActions, oneStep.best, relational.selector)
    : Object.fromEntries(V2B_IDS.map((id) => [id, unavailable(`feature is not part of the ${profile} profile`)]));

  const all = {
    ...contextFeatures(observation, schemaBound),
    ...actionSurfaceFeatures(legalActions),
    ...relational.values,
    ...oneStep.values,
    ...expert,
  };

  const features = {};
  for (const featureId of DEPLOYABLE_FEATURES.map((entry) => entry.featureId)) {
    if (!Object.hasOwn(all, featureId)) throw new DeployableContractError(`extractor produced no value for contract feature: ${featureId}`);
    features[featureId] = deepFreeze({ featureId, ...all[featureId] });
  }
  for (const featureId of Object.keys(all)) {
    if (!features[featureId]) throw new DeployableContractError(`extractor produced a value outside the contract: ${featureId}`);
  }

  const inProfile = definition.featureIds;
  const tally = (status) => inProfile.filter((id) => features[id].status === status).length;

  return deepFreeze({
    contractId: DEPLOYABLE_FEATURE_CONTRACT_ID,
    contractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    profile,
    capabilities,
    profileSatisfied: capabilities.satisfied,
    features,
    profileFeatureIds: inProfile,
    counts: {
      inProfile: inProfile.length,
      available: tally(FeatureValueStatus.AVAILABLE),
      unknown: tally(FeatureValueStatus.UNKNOWN),
      unavailable: tally(FeatureValueStatus.UNAVAILABLE),
    },
    denseVector: false,
    imputed: false,
  });
}

/**
 * Ordered feature values for a profile. Deliberately returns status-carrying entries rather
 * than a dense numeric vector: densifying is where MISSING silently becomes ZERO.
 */
export function deployableFeatureEntries(result) {
  return deepFreeze(result.profileFeatureIds.map((featureId) => result.features[featureId]));
}
