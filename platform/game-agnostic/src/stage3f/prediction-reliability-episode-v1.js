import { performance } from 'node:perf_hooks';

import { deepFreeze } from '../core/determinism.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_GAME_ID, FORGE_OBSERVER_ID } from '../forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../forge/kernel.js';
import {
  beginIntegratedLiveShadowStep, completeIntegratedLiveShadowStep, extractIntegratedStage3EFeatures,
} from './integrated-live-shadow-v1.js';
import { CalibrationDomain } from './environment-calibration-v1.js';
import {
  CounterfactualPredictionKind, DOMAIN_CALIBRATION_REQUIREMENT, ONE_STEP_COMPONENT_DOMAIN, PredictionQuality, RUNTIME_WORLD_STATE_FACTS,
  attributeBaselineError, bindPredictionToOutcome, classifyCalibrationCondition, evaluateOneStepConsequence,
  predictWorldStateBaseline, worldStateDomainCoverage, worldStateFactMap,
} from './prediction-reliability-v1.js';

/* Stage 3F.6 Layer B: one governed integrated-runtime episode on a frozen Stage 3E decision point.
 * The runtime is used exactly as certified in Stage 3F.5; the incumbent (runtime greedy) executes once. */

export function runtimeGreedyIncumbent(state) {
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const greedyKey = extractIntegratedStage3EFeatures(state, observation, null).greedy.actionId;
  const forge = forgeLegalActions(state.world);
  const index = forge.findIndex((action) => forgeActionKey(action) === greedyKey);
  if (index < 0) throw new Error('RUNTIME_GREEDY_ACTION_NOT_LEGAL');
  return { descriptor: forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID)[index], actionKey: greedyKey, actionType: forge[index].actionType };
}

export function runStage3F6Episode({ world, calibration, failureInjection = [], completeFailureInjection = [], skipOutcome = false, telemetrySink = null }) {
  const state = forgeAdapterState(world);
  const incumbent = runtimeGreedyIncumbent(state);
  const pending = beginIntegratedLiveShadowStep({ state, calibration, incumbentAction: incumbent.descriptor, failureInjection, telemetrySink });
  const result = skipOutcome ? null : completeIntegratedLiveShadowStep(pending, { outcomeDelay: 1, failureInjection: completeFailureInjection, telemetrySink });
  return { state, pending, result, incumbent };
}

const ONE_STEP_REQUIRED_DOMAINS = [...new Set(Object.values(ONE_STEP_COMPONENT_DOMAIN).map((domain) => DOMAIN_CALIBRATION_REQUIREMENT[domain]))];
const BASELINE_REQUIRED_DOMAINS = [CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.RESOURCE_SEMANTICS];

/** Pure evaluation of an already-executed episode. Measured separately as Stage 3F.6 overhead. */
export function evaluateStage3F6Episode({ run, calibration, novelty = 'UNKNOWN', decisionFacts = null, outcomeOverride = undefined }) {
  const start = performance.now();
  const { pending, result, incumbent } = run;
  const decisionLogicalTime = pending.logicalTime;
  const outcomeLogicalTime = result?.outcomeTime ?? null;
  const outcomeStatus = outcomeOverride ?? (result?.trace?.projection?.outcomeStatus === 'BOUND' ? 'OBSERVED' : 'UNKNOWN');
  const actualEnvironment = result?.actualState?.environment?.identity ?? FORGE_GAME_ID;
  const oneStep = evaluateOneStepConsequence({
    branches: pending.features?.branches ?? null, executedActionKey: incumbent.actionKey,
    actualRewardVector: pending.transition.info.rewardVector, actualScalarReward: pending.transition.reward, calibration,
    guard: { environmentIdentity: FORGE_GAME_ID, predictionEnvironmentIdentity: pending.worldState?.environment?.identity ?? FORGE_GAME_ID,
      decisionLogicalTime, generatedLogicalTime: decisionLogicalTime, outcomeLogicalTime: pending.logicalTime + 1,
      outcomeStatus: pending.features ? 'OBSERVED' : 'UNKNOWN' },
  });
  const facts = decisionFacts ?? worldStateFactMap(pending.worldState);
  const actualFacts = worldStateFactMap(result?.actualState);
  const baseline = predictWorldStateBaseline({ facts, actionType: incumbent.actionType, calibration });
  const worldState = baseline.predictions.map((prediction) => {
    const meta = RUNTIME_WORLD_STATE_FACTS[prediction.path];
    const verdict = bindPredictionToOutcome({
      prediction: { classId: baseline.predictorId, domain: prediction.domain, value: prediction.value, confidence: null,
        timing: 'DECISION_TIME', generatedLogicalTime: decisionLogicalTime, environmentIdentity: FORGE_GAME_ID },
      outcome: { value: actualFacts[prediction.path]?.value ?? null, logicalTime: outcomeLogicalTime, environmentIdentity: actualEnvironment, status: outcomeStatus },
      environmentIdentity: FORGE_GAME_ID, decisionLogicalTime,
      calibrationSufficient: classifyCalibrationCondition(calibration, [DOMAIN_CALIBRATION_REQUIREMENT[prediction.domain]]) === 'CALIBRATED',
      reference: meta.identity ? null : (facts[prediction.path]?.value ?? null), identity: meta.identity,
    });
    return { ...prediction, actual: actualFacts[prediction.path]?.value ?? null, quality: prediction.abstained && verdict.quality !== PredictionQuality.INCOMPARABLE
      ? PredictionQuality.UNKNOWN : verdict.quality, reason: prediction.abstained ? (meta.identity ? 'IDENTITY_FACT_NOT_PREDICTABLE' : 'BASELINE_ABSTAINED') : verdict.reason,
    error: verdict.error ?? null, absoluteError: verdict.absoluteError ?? null, attribution: attributeBaselineError({ verdict, prediction, calibration }) };
  });
  const decision = pending.trace?.decisionTimeEvent?.decisionTimeEvidence ?? null;
  const counterfactual = result?.ledger?.projection?.counterfactuals?.[0] ?? pending.ledger?.projection?.counterfactuals?.[0] ?? null;
  const counterfactualKind = !counterfactual?.candidateAction ? CounterfactualPredictionKind.NO_COUNTERFACTUAL_PROPOSAL
    : counterfactual.candidateAction.actionId === incumbent.descriptor.actionId ? CounterfactualPredictionKind.EXECUTED_ACTION_PREDICTION
      : CounterfactualPredictionKind.UNEXECUTED_COUNTERFACTUAL_PREDICTION;
  const evidence = {
    recordType: 'SENTINEL_STAGE3F6_EPISODE_EVIDENCE_V1',
    decisionLogicalTime, outcomeLogicalTime, predictionGeneratedLogicalTime: decisionLogicalTime,
    executedActionKey: incumbent.actionKey, executedActionType: incumbent.actionType,
    oneStep, worldState,
    router: pending.router ? { score: pending.router.score, threshold: pending.router.threshold, selectedRoute: pending.router.selectedRoute } : null,
    recommendation: decision ? { abstained: decision.recommendation.abstained, confidence: decision.recommendation.confidence,
      path: decision.recommendation.recommendedPath } : null,
    predictorEvidence: decision ? { producerId: decision.predictorEvidence[0].predictor.id, confidence: decision.predictorEvidence[0].confidence,
      uncertainty: decision.predictorEvidence[0].uncertainty?.status ?? null } : null,
    counterfactual: { kind: counterfactualKind, predictedContentPresent: Boolean(counterfactual && (counterfactual.predictedValue !== null
      || counterfactual.predictedRisk !== null || counterfactual.predictedStateRef?.type !== 'UNRESOLVED_PREDICTED_STATE')),
    scoredAsExecuted: false },
    calibration: { calibrationId: calibration.calibrationId, overallStatus: calibration.overallStatus,
      oneStepCondition: classifyCalibrationCondition(calibration, ONE_STEP_REQUIRED_DOMAINS),
      baselineCondition: classifyCalibrationCondition(calibration, BASELINE_REQUIRED_DOMAINS) },
    domainCoverage: worldStateDomainCoverage(facts), novelty,
    degradation: result?.degradation ?? { status: pending.failures.length ? 'PARTIAL_EVIDENCE' : 'HEALTHY', failures: pending.failures },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
  };
  return deepFreeze({ ...evidence, evaluationMs: performance.now() - start });
}

export function projectPredictionTelemetry(evidence, aggregate = null) {
  const score = evidence.router?.score ?? null;
  const bin = typeof score === 'number' ? `[${(Math.min(9, Math.floor(score * 10)) / 10).toFixed(1)},${((Math.min(9, Math.floor(score * 10)) + 1) / 10).toFixed(1)}]` : 'UNKNOWN';
  const attributions = [...evidence.oneStep.components, ...evidence.worldState].map((entry) => entry.attribution).filter(Boolean);
  return deepFreeze({
    schemaVersion: 1, decisionLogicalTime: evidence.decisionLogicalTime, outcomeLogicalTime: evidence.outcomeLogicalTime,
    executedAction: `${evidence.executedActionType}:${evidence.executedActionKey.slice(0, 12)}`,
    predictedNextState: evidence.worldState.map((entry) => ({ path: entry.path, value: entry.value, abstained: entry.abstained })),
    actualNextState: evidence.worldState.map((entry) => ({ path: entry.path, value: entry.actual })),
    worldStateErrors: evidence.worldState.map((entry) => ({ path: entry.path, quality: entry.quality, error: entry.error, attribution: entry.attribution })),
    oneStep: { privileged: true, scalar: evidence.oneStep.scalar,
      components: evidence.oneStep.components.map((entry) => ({ component: entry.component, domain: entry.domain, predicted: entry.predicted, actual: entry.actual, quality: entry.quality })) },
    confidence: { routerScore: score, predictorEvidenceConfidence: evidence.predictorEvidence?.confidence ?? null,
      predictorEvidenceConfidenceSemantics: 'CONSTANT_PLACEHOLDER_NOT_CALIBRATABLE', oneStepConfidence: 'NOT_AVAILABLE' },
    reliabilityBin: bin,
    abstention: { routerAbstained: evidence.router ? evidence.router.selectedRoute !== 'GREEDY' : null,
      recommendationAbstained: evidence.recommendation?.abstained ?? null, baselineAbstentions: evidence.worldState.filter((entry) => entry.abstained).length },
    novelty: evidence.novelty, calibration: evidence.calibration, counterfactual: evidence.counterfactual,
    errorAttribution: attributions.length ? [...new Set(attributions)].sort() : ['NONE'],
    domainCoverage: evidence.domainCoverage, aggregate,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
  });
}
