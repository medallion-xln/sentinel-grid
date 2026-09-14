import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { EpistemicCategory, EvidenceAuthority, createWorldStateFact, createWorldStateSnapshot } from '../src/stage3f/world-state-v1.js';
import {
  attachOutcome, createDecisionTimeTrace, createFeatureDerivationEvidence, createObservationEvidence,
  createPredictorEvidence, createRecommendationEvidence, createRouterEvaluationEvidence,
} from '../src/stage3f/causal-trace-v1.js';
import {
  CalibrationDomain, CalibrationStatus, ResourceDirectionality, RewardObjectiveRelationship,
  TransitionAssumption, createCalibrationEvidence, createDomainAssessment,
  createEnvironmentCalibration, createEnvironmentIdentity, createSemanticDefinition,
} from '../src/stage3f/environment-calibration-v1.js';
import {
  CounterfactualTiming, LedgerActorType, VetoDisposition, attachLedgerActualOutcome,
  attachLedgerCounterfactual, attachLedgerSelectedAction, attachLedgerVeto,
  createCounterfactualVetoLedger,
} from '../src/stage3f/counterfactual-veto-ledger-v1.js';
import {
  ExperienceEligibilityStatus, ExperiencePurpose, ExperienceValidationStatus,
  OutcomeBindingStatus, PredictionErrorStatus, SHADOW_EXPERIENCE_CONTRACT,
  SHADOW_EXPERIENCE_CONTRACT_HASH, SHADOW_EXPERIENCE_CONTRACT_ID,
  ShadowExperienceContractError, appendExperienceToBuffer, attachExecutedAction,
  attachExperienceActualOutcome, attachExperiencePrediction, createShadowExperience,
  createShadowExperienceBuffer, deriveExperiencePredictionError, evaluateExperienceEligibility,
  freezeExperienceSnapshot, serializeShadowExperience, validateShadowExperience,
  verifyFrozenExperienceSnapshot, verifyShadowExperience, verifyShadowExperienceBuffer,
} from '../src/stage3f/shadow-experience-buffer-v1.js';
import * as publicApi from '../src/index.js';

const allDomains = Object.values(CalibrationDomain);
const moveNorth = Object.freeze({ actionId: 'MOVE', parameters: { direction: 'NORTH' } });
const moveSouth = Object.freeze({ actionId: 'MOVE', parameters: { direction: 'SOUTH' } });
const waitAction = Object.freeze({ actionId: 'WAIT', parameters: {} });

function identity(runtimeIdentity = 'forge-world', environmentVersion = 'FORGE_WORLD_V2') {
  return createEnvironmentIdentity({
    runtimeIdentity, environmentVersion, environmentFamily: 'SENTINEL_FORGE', environmentSchemaVersion: '2',
    structuralSemantics: {
      observationSchemaHash: 'sha256:observation-v2', actionSchemaHash: 'sha256:action-v2',
      objectiveSchemaHash: 'sha256:objective-v2', transitionContractVersion: 'FORGE_TRANSITION_V2',
    },
  });
}

const cp = (env, sourceId, evidenceId) => ({
  environmentId: env.environmentId, environmentVersion: env.environmentVersion, sourceId, evidenceId,
});
const tp = (runtime, sourceId, evidenceId) => ({
  environmentIdentity: runtime.identity, environmentVersion: runtime.version, sourceId, evidenceId,
});
const xp = (env, evidenceId, sourceId = 'stage3f4-test') => cp(env, sourceId, evidenceId);

function semanticShape(domain, evidenceRef) {
  switch (domain) {
    case CalibrationDomain.ACTION_SEMANTICS: return {
      actionId: 'MOVE', actionVersion: '2', parameters: [], preconditions: [], expectedDirectEffects: [],
      possibleSideEffects: [], resourceCosts: [{ resourceId: 'energy', amount: 2 }], temporalDuration: null,
      failureModes: [], legalityConstraints: [], resultObservability: 'DIRECT',
    };
    case CalibrationDomain.RESOURCE_SEMANTICS: return {
      resourceId: 'energy', units: 'energy-points', directionality: ResourceDirectionality.INCREASE_DESIRABLE,
      scarcity: 'SCARCE', renewability: 'CONDITIONAL', capacity: { minimum: 0, maximum: 100 },
      consumptionRules: [], generationRules: [], conversionRules: [], strategicRelevance: 'action budget',
    };
    case CalibrationDomain.OBJECTIVE_SEMANTICS: return {
      objectiveId: 'MISSION', description: 'complete mission', priority: 0,
      successConditions: ['mission complete'], failureConditions: ['terminal failure'], terminality: 'TERMINAL',
      rewardRelationship: { status: RewardObjectiveRelationship.DISTINCT, rewardSignalRef: 'transition.reward' },
      timeHorizon: { type: 'EPISODE', maximumLogicalSteps: 64 },
    };
    case CalibrationDomain.TEMPORAL_SEMANTICS: return {
      timeModel: 'DISCRETE', logicalStepSemantics: 'one accepted transition', tickDuration: null,
      actionDuration: { model: 'ACTION_SPECIFIC', units: 'logical-step' },
      observationCadence: { value: 1, units: 'logical-step' },
      outcomeDelay: { minimum: 0, maximum: 8, units: 'logical-step' },
      episodeHorizon: { maximum: 64, units: 'logical-step' },
      planningHorizon: { certifiedMaximum: 4, units: 'logical-step' },
      temporalUncertainty: { status: 'BOUNDED', wallClockMappingKnown: false },
    };
    case CalibrationDomain.TRANSITION_SEMANTICS: return { assumptions: [{
      type: TransitionAssumption.ACTION_CONDITIONED, value: true,
      epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, evidenceRefs: [evidenceRef],
    }] };
    default: throw new Error(`unsupported calibrated domain ${domain}`);
  }
}

function calibration({ env = identity(), domains = [] } = {}) {
  const evidence = domains.map((domain) => createCalibrationEvidence({
    environmentIdentity: env, domain, claimTarget: `${domain}:fixture`, claimType: 'SEMANTIC_DEFINITION',
    claimValue: { present: true }, sourceReference: { contract: 'fixture-v1' },
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    provenance: cp(env, 'fixture-spec', `evidence-${domain}`),
  }));
  const definitions = domains.map((domain, index) => createSemanticDefinition({
    environmentIdentity: env, domain, conceptId: `${domain}:fixture`, conceptVersion: '1',
    semantics: semanticShape(domain, evidence[index].calibrationEvidenceId),
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    evidenceRefs: [evidence[index].calibrationEvidenceId],
    provenance: cp(env, 'fixture-spec', `definition-${domain}`),
  }));
  const set = new Set(domains);
  const assessments = allDomains.map((domain) => createDomainAssessment({
    environmentIdentity: env, domain, status: set.has(domain) ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
    confidence: set.has(domain) ? 1 : null,
    evidenceRefs: evidence.filter((entry) => entry.domain === domain).map((entry) => entry.calibrationEvidenceId),
    provenance: cp(env, 'fixture-auditor', `assessment-${domain}`),
  }));
  return createEnvironmentCalibration({ environmentIdentity: env, calibrationVersion: '1.0.0',
    evidence, semanticDefinitions: definitions, domainAssessments: assessments });
}

function state(env, energy = 31, logicalTime = 10, predicted = false) {
  const runtime = { identity: env.runtimeIdentity, version: env.environmentVersion };
  const category = predicted ? EpistemicCategory.PREDICTED : EpistemicCategory.OBSERVED;
  const authority = predicted ? EvidenceAuthority.CALIBRATED_PREDICTION : EvidenceAuthority.AUTHORITATIVE_OBSERVATION;
  const provenance = tp(runtime, predicted ? 'state-predictor' : 'forge-observer', `${category}-${energy}-${logicalTime}`);
  if (predicted) provenance.prediction = { producerId: 'state-predictor', producerVersion: '1', calibrated: true, horizon: 1 };
  return createWorldStateSnapshot({ environment: runtime, logicalTime, facts: [createWorldStateFact({
    path: ['resources', 'actor', 'energy'], category, authority, value: energy, confidence: predicted ? 0.8 : 1,
    uncertainty: { status: 'BOUNDED', radius: predicted ? 1 : 0 }, provenance,
  })] });
}

function trace(env = identity(), energy = 31) {
  const world = state(env, energy, 10); const runtime = world.environment;
  const observation = createObservationEvidence({
    observationId: `observation-${energy}`, environment: runtime, logicalTime: 10,
    observationDigest: `sha256:${sha256({ energy })}`, provenance: tp(runtime, 'forge-observer', `observation-${energy}`),
  });
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: world,
    featureContract: { id: 'SENTINEL_FEATURE_CONTRACT_V2', version: '2', hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb' },
    featureValues: { energy }, implementation: { id: 'extractor', version: '2', hash: 'sha256:extractor-v2' },
    provenance: tp(runtime, 'extractor', `feature-${energy}`),
  });
  const predictor = createPredictorEvidence({ worldStateSnapshot: world,
    predictor: { id: 'state-predictor', version: '1' }, outputSummary: { expectedEnergy: energy - 2 },
    confidence: 0.8, uncertainty: { status: 'BOUNDED', radius: 1 },
    provenance: tp(runtime, 'state-predictor', `prediction-${energy}`) });
  const router = createRouterEvaluationEvidence({ featureDerivation: feature, predictorEvidence: [predictor],
    router: { id: 'STAGE3E_ROUTER', version: '3E', hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64' },
    score: 0.92, threshold: 0.9, selectedRoute: 'GREEDY', fallback: { available: true, used: false },
    provenance: tp(runtime, 'stage3e-router', `router-${energy}`) });
  const recommendation = createRecommendationEvidence({ routerEvaluation: router, proposedAction: moveNorth,
    recommendedPath: 'GREEDY', confidence: 0.92, uncertainty: { status: 'BOUNDED' },
    provenance: tp(runtime, 'sentinel-shadow', `recommendation-${energy}`) });
  return createDecisionTimeTrace({ observationEvidence: observation, worldStateSnapshot: world,
    featureDerivation: feature, predictorEvidence: [predictor], routerEvaluation: router, recommendation });
}

const fullDomains = [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.RESOURCE_SEMANTICS,
  CalibrationDomain.OBJECTIVE_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.TRANSITION_SEMANTICS];

function fixture({ env = identity(), domains = fullDomains, energy = 31, outcomeTime = 12,
  selectedAction = moveSouth, human = false, predictionTiming = CounterfactualTiming.DECISION_TIME } = {}) {
  const cal = calibration({ env, domains }); const baseTrace = trace(env, energy);
  let ledger = createCounterfactualVetoLedger({ trace: baseTrace, calibration: cal });
  ledger = attachLedgerSelectedAction(ledger, { selectedAction,
    selectedBy: { type: human ? LedgerActorType.HUMAN : LedgerActorType.INCUMBENT, id: human ? 'operator-1' : 'incumbent-1' },
    executedBy: { type: LedgerActorType.INCUMBENT, id: 'executor-1' }, logicalTime: 11,
    actionRef: `action:${selectedAction.actionId}:11`, provenance: xp(env, 'selection-11') });
  if (human) ledger = attachLedgerVeto(ledger, { disposition: VetoDisposition.OVERRIDDEN,
    actor: { type: LedgerActorType.HUMAN, id: 'operator-1' }, logicalTime: 11,
    provenance: xp(env, 'human-override') });
  const predictionRef = baseTrace.decisionTimeEvent.decisionTimeEvidence.predictorEvidence[0].predictorEvidenceId;
  ledger = attachLedgerCounterfactual(ledger, { candidateAction: selectedAction,
    predictionRef: predictionTiming === CounterfactualTiming.DECISION_TIME ? predictionRef : 'post-hoc:prediction:1',
    predictionSource: { id: 'state-predictor', version: '1' }, predictedOutcome: { expectedEnergy: energy - 2 },
    predictedStateRef: { snapshotId: `predicted:${energy - 2}` }, confidence: 0.8,
    uncertainty: { status: 'BOUNDED', radius: 1 }, timing: predictionTiming,
    generatedLogicalTime: predictionTiming === CounterfactualTiming.DECISION_TIME ? 10 : outcomeTime + 1,
    logicalTime: predictionTiming === CounterfactualTiming.DECISION_TIME ? 10 : outcomeTime + 1,
    provenance: xp(env, predictionTiming === CounterfactualTiming.DECISION_TIME ? 'prediction-10' : 'prediction-post-hoc') });
  const nextState = state(env, energy - 2, outcomeTime);
  const outcomeTrace = attachOutcome(baseTrace, { actualStateSnapshot: nextState, logicalTime: outcomeTime,
    outcomeSummary: { energy: energy - 2 }, observationCompleteness: 'COMPLETE',
    provenance: tp(baseTrace.environment, 'outcome-observer', `outcome-${outcomeTime}`) });
  ledger = attachLedgerActualOutcome(ledger, { trace: outcomeTrace, outcomeId: outcomeTrace.projection.outcomes[0].outcomeId });
  const shell = createShadowExperience({ trace: outcomeTrace, ledger, calibration: cal, provenance: xp(env, 'experience-shell') });
  return { env, calibration: cal, baseTrace, trace: outcomeTrace, ledger, nextState, shell,
    selectedActionId: ledger.projection.selectedActions[0].selectedActionId,
    counterfactualId: ledger.projection.counterfactuals[0].counterfactualId,
    outcomeId: outcomeTrace.projection.outcomes[0].outcomeId };
}

function complete(fx) {
  let experience = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  experience = attachExperiencePrediction(experience, { ledger: fx.ledger, counterfactualId: fx.counterfactualId });
  experience = attachExperienceActualOutcome(experience, { trace: fx.trace, actualStateSnapshots: [fx.nextState], outcomeId: fx.outcomeId });
  return validateShadowExperience(experience, { trace: fx.trace, ledger: fx.ledger, calibration: fx.calibration,
    logicalTime: fx.nextState.time.logicalTime + 1, provenance: xp(fx.env, 'validation') });
}

function eligible(experience, fx, purpose = ExperiencePurpose.TRANSITION_MODEL_TRAINING) {
  return evaluateExperienceEligibility(experience, { purpose, calibration: fx.calibration,
    logicalTime: fx.nextState.time.logicalTime + 2, provenance: xp(fx.env, `eligibility-${purpose}`) });
}

test('identical episode evidence produces identical experience identity', () => {
  assert.equal(fixture().shell.experienceId, fixture().shell.experienceId);
});
test('distinct causal episode identity prevents false deduplication', () => {
  assert.notEqual(fixture({ energy: 31 }).shell.experienceId, fixture({ energy: 30 }).shell.experienceId);
});
test('state_t binds correctly', () => {
  const fx = fixture(); assert.equal(fx.shell.projection.stateTRef.snapshotId,
    fx.trace.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot.snapshotId);
});
test('executed action binds correctly', () => {
  const fx = fixture(); const ex = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  assert.deepEqual(ex.projection.executedActions[0].executedAction, moveSouth);
});
test('Sentinel recommendation does not substitute for executed action', () => {
  const fx = fixture(); const ex = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  assert.deepEqual(ex.projection.sentinelRecommendationRef.proposedAction, moveNorth);
  assert.deepEqual(ex.projection.executedActions[0].executedAction, moveSouth);
});
test('predicted state remains separate from actual state', () => {
  const fx = fixture(); const ex = complete(fx);
  assert.notEqual(ex.projection.predictions[0].predictedStateT1Ref, ex.projection.actualOutcomes[0].actualStateT1Ref);
  assert.equal(ex.projection.predictions[0].actualStateT1Ref, null);
});
test('predicted outcome remains separate from actual outcome', () => {
  const fx = fixture(); const ex = complete(fx);
  assert.notEqual(ex.projection.predictions[0].predictedOutcomeRef, ex.projection.actualOutcomes[0].actualOutcomeRef);
});
test('recorded episode can be incomplete', () => assert.equal(fixture().shell.projection.recordingStatus, ExperienceValidationStatus.RECORDED));
test('incomplete episode remains recorded', () => {
  const fx = fixture(); const ex = validateShadowExperience(fx.shell, { trace: fx.trace, ledger: fx.ledger,
    calibration: fx.calibration, logicalTime: 13, provenance: xp(fx.env, 'incomplete-validation') });
  assert.equal(ex.projection.validationStatus, ExperienceValidationStatus.INCOMPLETE);
  assert.equal(ex.projection.recordingStatus, ExperienceValidationStatus.RECORDED);
});
test('incomplete episode fails appropriate eligibility', () => {
  const fx = fixture(); let ex = validateShadowExperience(fx.shell, { trace: fx.trace, ledger: fx.ledger,
    calibration: fx.calibration, logicalTime: 13, provenance: xp(fx.env, 'validation') });
  ex = eligible(ex, fx); assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.INELIGIBLE);
});
test('valid complete episode passes structural validation', () => assert.equal(complete(fixture()).projection.validationStatus, ExperienceValidationStatus.VALIDATED));
test('validated does not imply eligible', () => {
  const fx = fixture({ domains: [] }); let ex = complete(fx); ex = eligible(ex, fx);
  assert.equal(ex.projection.validationStatus, ExperienceValidationStatus.VALIDATED);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.INELIGIBLE);
});
test('purpose-specific eligibility works', () => {
  const fx = fixture(); let ex = complete(fx); ex = eligible(ex, fx, ExperiencePurpose.TRANSITION_MODEL_TRAINING);
  ex = eligible(ex, fx, ExperiencePurpose.PREDICTION_CALIBRATION);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.ELIGIBLE);
  assert.equal(ex.projection.eligibilityByPurpose.PREDICTION_CALIBRATION.status, ExperienceEligibilityStatus.ELIGIBLE);
});
test('transition-model eligibility can differ from prediction-calibration eligibility', () => {
  const fx = fixture(); let ex = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  ex = attachExperienceActualOutcome(ex, { trace: fx.trace, actualStateSnapshots: [fx.nextState], outcomeId: fx.outcomeId });
  ex = validateShadowExperience(ex, { trace: fx.trace, ledger: fx.ledger, calibration: fx.calibration,
    logicalTime: 13, provenance: xp(fx.env, 'validation') });
  ex = eligible(ex, fx, ExperiencePurpose.TRANSITION_MODEL_TRAINING);
  ex = eligible(ex, fx, ExperiencePurpose.PREDICTION_CALIBRATION);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.ELIGIBLE);
  assert.equal(ex.projection.eligibilityByPurpose.PREDICTION_CALIBRATION.status, ExperienceEligibilityStatus.INELIGIBLE);
});
test('malformed provenance fails closed', () => {
  const fx = fixture(); assert.throws(() => createShadowExperience({ trace: fx.trace, ledger: fx.ledger,
    calibration: fx.calibration, provenance: { environmentId: fx.env.environmentId } }), /provenance/);
});
test('environment mismatch fails closed', () => {
  const fx = fixture(); const other = calibration({ env: identity('other-world') });
  assert.throws(() => createShadowExperience({ trace: fx.trace, ledger: fx.ledger, calibration: other,
    provenance: xp(fx.env, 'bad') }), /mismatch/);
});
test('calibration mismatch fails closed', () => {
  const fx = fixture(); const changed = calibration({ env: fx.env, domains: [] });
  assert.throws(() => createShadowExperience({ trace: fx.trace, ledger: fx.ledger, calibration: changed,
    provenance: xp(fx.env, 'bad') }), /calibration mismatch/);
});
test('action identity mismatch fails closed', () => {
  const fx = fixture(); assert.throws(() => attachExecutedAction(fx.shell,
    { ledger: fx.ledger, selectedActionId: 'sha256:unknown' }), /unknown selected/);
});
test('outcome identity mismatch fails closed', () => {
  const fx = fixture(); assert.throws(() => attachExperienceActualOutcome(fx.shell,
    { trace: fx.trace, actualStateSnapshots: [fx.nextState], outcomeId: 'sha256:unknown' }), /unknown outcome/);
});
test('temporal inversion fails closed', () => {
  const fx = fixture(); const copy = structuredClone(fx.shell); copy.logicalTime = 99;
  assert.throws(() => verifyShadowExperience(copy));
});
test('predicted field contamination blocks authoritative attachment', () => {
  const fx = fixture(); const predicted = state(fx.env, 29, 12, true);
  assert.throws(() => attachExperienceActualOutcome(fx.shell, { trace: fx.trace,
    actualStateSnapshots: [predicted], outcomeId: fx.outcomeId }), /actual state_t1/);
});
test('post-hoc prediction blocks prediction-learning eligibility without decision-time prediction', () => {
  const fx = fixture({ predictionTiming: CounterfactualTiming.POST_HOC_ANALYSIS }); let ex = complete(fx);
  ex = eligible(ex, fx, ExperiencePurpose.PREDICTION_CALIBRATION);
  const result = ex.projection.eligibilityByPurpose.PREDICTION_CALIBRATION;
  assert.equal(result.status, ExperienceEligibilityStatus.INELIGIBLE);
  assert.ok(result.reasons.includes('POST_HOC_PREDICTION_NOT_DECISION_TIME'));
});
test('counterfactual action cannot become executed action', () => {
  const fx = fixture(); const ex = complete(fx);
  assert.equal(ex.projection.executedActions[0].counterfactual, false);
  assert.equal(ex.projection.predictions[0].candidateAction.actionId, ex.projection.executedActions[0].executedAction.actionId);
});
test('human veto does not become negative reward', () => {
  const fx = fixture({ human: true }); const ex = complete(fx);
  assert.equal(ex.projection.automaticRewardAssignment, false); assert.equal('reward' in ex, false);
});
test('human intervention episode remains representable', () => {
  const fx = fixture({ human: true }); const ex = complete(fx);
  assert.equal(ex.projection.executedActions[0].humanIntervention, true);
});
test('incumbent disagreement remains representable', () => {
  const fx = fixture(); const ex = complete(fx);
  assert.equal(ex.projection.executedActions[0].sentinelProposalMatched, false);
});
test('missing prediction can allow non-prediction use', () => {
  const fx = fixture(); let ex = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  ex = attachExperienceActualOutcome(ex, { trace: fx.trace, actualStateSnapshots: [fx.nextState], outcomeId: fx.outcomeId });
  ex = validateShadowExperience(ex, { trace: fx.trace, ledger: fx.ledger, calibration: fx.calibration,
    logicalTime: 13, provenance: xp(fx.env, 'validation') }); ex = eligible(ex, fx);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.ELIGIBLE);
});
test('missing actual outcome blocks outcome-dependent eligibility', () => {
  const fx = fixture(); let ex = validateShadowExperience(fx.shell, { trace: fx.trace, ledger: fx.ledger,
    calibration: fx.calibration, logicalTime: 13, provenance: xp(fx.env, 'validation') }); ex = eligible(ex, fx);
  assert.ok(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.reasons.includes('AUTHORITATIVE_OUTCOME_REQUIRED'));
});
test('conflicting executed actions are preserved', () => {
  const fx = fixture(); let conflictingLedger = attachLedgerSelectedAction(fx.ledger, { selectedAction: waitAction,
    selectedBy: { type: LedgerActorType.INCUMBENT, id: 'incumbent-1' }, executedBy: { type: LedgerActorType.INCUMBENT, id: 'executor-1' },
    logicalTime: 11, actionRef: 'action:WAIT:11', provenance: xp(fx.env, 'selection-conflict') });
  let ex = attachExecutedAction(fx.shell, { ledger: conflictingLedger, selectedActionId: fx.selectedActionId });
  assert.equal(ex.projection.executedActions.length, 2); assert.equal(ex.projection.conflicts.executedActions, true);
});
test('conflicting outcomes are preserved', () => {
  const fx = fixture(); const otherState = state(fx.env, 28, 12);
  let conflictingTrace = attachOutcome(fx.trace, { actualStateSnapshot: otherState, logicalTime: 12,
    outcomeSummary: { energy: 28 }, observationCompleteness: 'COMPLETE',
    provenance: tp(fx.trace.environment, 'outcome-observer', 'outcome-conflict') });
  const ex = attachExperienceActualOutcome(fx.shell, { trace: conflictingTrace,
    actualStateSnapshots: [fx.nextState, otherState], outcomeId: conflictingTrace.projection.outcomes[0].outcomeId });
  assert.equal(ex.projection.actualOutcomes.length, 2); assert.equal(ex.projection.outcomeStatus, OutcomeBindingStatus.OUTCOME_CONFLICTED);
});
test('conflict blocks eligibility', () => {
  const fx = fixture(); let conflictingLedger = attachLedgerSelectedAction(fx.ledger, { selectedAction: waitAction,
    selectedBy: { type: LedgerActorType.INCUMBENT, id: 'other' }, executedBy: { type: LedgerActorType.INCUMBENT, id: 'other' },
    logicalTime: 11, actionRef: 'action:WAIT:11', provenance: xp(fx.env, 'conflict') });
  let ex = attachExecutedAction(fx.shell, { ledger: conflictingLedger, selectedActionId: fx.selectedActionId });
  ex = validateShadowExperience(ex, { trace: fx.trace, ledger: conflictingLedger, calibration: fx.calibration,
    logicalTime: 13, provenance: xp(fx.env, 'validation') }); ex = eligible(ex, fx);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.INELIGIBLE);
});
test('duplicate attachment is idempotent', () => {
  const fx = fixture(); const once = attachExecutedAction(fx.shell, { ledger: fx.ledger, selectedActionId: fx.selectedActionId });
  assert.equal(attachExecutedAction(once, { ledger: fx.ledger, selectedActionId: fx.selectedActionId }), once);
});
test('identical payload but different episode remains distinct', () => {
  const a = fixture({ energy: 31 }); const b = fixture({ energy: 30 });
  const buffer = appendExperienceToBuffer(appendExperienceToBuffer(createShadowExperienceBuffer({ bufferVersion: '1' }), a.shell), b.shell);
  assert.equal(buffer.projection.experienceIds.length, 2);
});
test('prediction error calculated only when calibration is sufficient', () => {
  const fx = fixture(); let ex = complete(fx); const pred = ex.projection.predictions[0]; const out = ex.projection.actualOutcomes[0];
  ex = deriveExperiencePredictionError(ex, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS],
    components: [{ domain: CalibrationDomain.RESOURCE_SEMANTICS, metricType: 'RESOURCE_ERROR',
      predictionRef: pred.predictionRef, actualOutcomeRef: out.actualOutcomeRef, value: 0 }],
    logicalTime: 14, provenance: xp(fx.env, 'prediction-error') });
  assert.equal(ex.projection.predictionErrorStatus, PredictionErrorStatus.AVAILABLE);
});
test('insufficient calibration makes prediction comparison INCOMPARABLE', () => {
  const fx = fixture({ domains: [] }); let ex = complete(fx);
  ex = deriveExperiencePredictionError(ex, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], logicalTime: 14,
    provenance: xp(fx.env, 'prediction-error') });
  assert.equal(ex.projection.predictionErrorStatus, PredictionErrorStatus.INCOMPARABLE);
});
test('delayed outcome is supported', () => {
  const fx = fixture({ outcomeTime: 17 }); const ex = complete(fx);
  assert.equal(ex.projection.validationStatus, ExperienceValidationStatus.VALIDATED);
  assert.equal(ex.projection.actualOutcomes[0].logicalTime - ex.projection.executedActions[0].logicalTime, 6);
});
test('unknown attribution window remains representable through temporal calibration', () => {
  const fx = fixture({ domains: [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.TRANSITION_SEMANTICS] });
  let ex = validateShadowExperience(fx.shell, { trace: fx.trace, ledger: fx.ledger, calibration: fx.calibration,
    logicalTime: 13, provenance: xp(fx.env, 'unknown-window-validation') });
  assert.equal(ex.projection.validations[0].transitionTiming.attributionWindowStatus, 'UNKNOWN');
  ex = eligible(complete(fx), fx);
  assert.equal(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.status, ExperienceEligibilityStatus.INELIGIBLE);
  assert.ok(ex.projection.eligibilityByPurpose.TRANSITION_MODEL_TRAINING.reasons.includes('CALIBRATION_INSUFFICIENT'));
});
test('authoritative-field contamination is detected by verifier', () => {
  const ex = complete(fixture()); const copy = structuredClone(ex);
  copy.projection.actualOutcomes[0].epistemicCategory = EpistemicCategory.PREDICTED;
  assert.throws(() => verifyShadowExperience(copy));
});
test('hindsight leakage is detected for mislabeled decision-time evidence', () => {
  const fx = fixture(); const copy = structuredClone(fx.ledger);
  copy.projection.counterfactuals[0].generatedLogicalTime = 20;
  assert.throws(() => attachExperiencePrediction(fx.shell, { ledger: copy, counterfactualId: fx.counterfactualId }));
});

function snapshotFixture() {
  const fx = fixture(); let ex = eligible(complete(fx), fx);
  const buffer = appendExperienceToBuffer(createShadowExperienceBuffer({ bufferVersion: 'BUFFER_V1' }), ex);
  const args = { buffer, purpose: ExperiencePurpose.TRANSITION_MODEL_TRAINING,
    calibrationConstraints: [{ environmentId: fx.env.environmentId, calibrationId: fx.calibration.calibrationId }] };
  return { fx, ex, buffer, args, snapshot: freezeExperienceSnapshot(args) };
}

test('frozen experience snapshot is deterministic', () => {
  const { args, snapshot } = snapshotFixture(); assert.equal(snapshot.snapshotDigest, freezeExperienceSnapshot(args).snapshotDigest);
});
test('frozen snapshot remains immutable after later buffer additions', () => {
  const { snapshot, buffer } = snapshotFixture(); const before = snapshot.snapshotDigest;
  const later = fixture({ energy: 30 }).shell; appendExperienceToBuffer(buffer, later);
  assert.equal(snapshot.snapshotDigest, before); assert.equal(Object.isFrozen(snapshot), true);
});
test('snapshot digest changes when included experience changes', () => {
  const first = snapshotFixture(); const fx2 = fixture({ energy: 30 }); const ex2 = eligible(complete(fx2), fx2);
  const buffer2 = appendExperienceToBuffer(first.buffer, ex2);
  const second = freezeExperienceSnapshot({ ...first.args, buffer: buffer2 });
  assert.notEqual(first.snapshot.snapshotDigest, second.snapshotDigest);
});
test('eligibility profile is recorded in snapshot', () => {
  assert.equal(snapshotFixture().snapshot.eligibilityProfile, ExperiencePurpose.TRANSITION_MODEL_TRAINING);
});
test('deterministic replay passes', () => {
  const a = complete(fixture()); const b = complete(fixture()); assert.equal(a.experienceDigest, b.experienceDigest);
  assert.equal(serializeShadowExperience(a), serializeShadowExperience(b));
});
test('key-order invariance passes', () => {
  const fx = fixture(); const reordered = { sourceId: 'stage3f4-test', evidenceId: 'experience-shell',
    environmentVersion: fx.env.environmentVersion, environmentId: fx.env.environmentId };
  const shell = createShadowExperience({ trace: fx.trace, ledger: fx.ledger, calibration: fx.calibration, provenance: reordered });
  assert.equal(shell.experienceId, fx.shell.experienceId);
});
test('buffer verifier and deduplication are deterministic', () => {
  const ex = complete(fixture()); let buffer = createShadowExperienceBuffer({ bufferVersion: '1' });
  buffer = appendExperienceToBuffer(buffer, ex); const duplicate = appendExperienceToBuffer(buffer, ex);
  assert.equal(duplicate, buffer); assert.equal(verifyShadowExperienceBuffer(buffer), true);
});
test('frozen snapshot verifier rejects mutation', () => {
  const snapshot = snapshotFixture().snapshot; assert.equal(verifyFrozenExperienceSnapshot(snapshot), true);
  assert.throws(() => verifyFrozenExperienceSnapshot({ ...snapshot, snapshotDigest: 'sha256:bad' }));
});
test('contract is versioned and publicly exported', () => {
  assert.equal(SHADOW_EXPERIENCE_CONTRACT_ID, 'SENTINEL_SHADOW_EXPERIENCE_V1');
  assert.equal(SHADOW_EXPERIENCE_CONTRACT_HASH, sha256(SHADOW_EXPERIENCE_CONTRACT));
  assert.equal(publicApi.SHADOW_EXPERIENCE_CONTRACT_HASH, SHADOW_EXPERIENCE_CONTRACT_HASH);
});
test('RECORDED, VALIDATED, and ELIGIBLE remain distinct', () => {
  assert.notEqual(ExperienceValidationStatus.RECORDED, ExperienceValidationStatus.VALIDATED);
  assert.notEqual(ExperienceValidationStatus.VALIDATED, ExperienceEligibilityStatus.ELIGIBLE);
  assert.equal(SHADOW_EXPERIENCE_CONTRACT.recordedImpliesValidated, false);
  assert.equal(SHADOW_EXPERIENCE_CONTRACT.validatedImpliesTrainingEligible, false);
});
test('all purpose profiles are explicit', () => {
  for (const purpose of Object.values(ExperiencePurpose)) assert.ok(SHADOW_EXPERIENCE_CONTRACT.purposeProfiles[purpose]);
});
test('prediction and actual-state contract invariant is explicit', () => assert.equal(SHADOW_EXPERIENCE_CONTRACT.predictedNextStateIsActualNextState, false));
test('counterfactual and executed-action invariant is explicit', () => assert.equal(SHADOW_EXPERIENCE_CONTRACT.counterfactualActionIsExecutedAction, false));
test('no model training, reward assignment, or online learning occurs', () => {
  assert.equal(SHADOW_EXPERIENCE_CONTRACT.modelTrainingPerformed, false);
  assert.equal(SHADOW_EXPERIENCE_CONTRACT.automaticRewardAssignment, false);
  assert.equal(SHADOW_EXPERIENCE_CONTRACT.onlineLearningEnabled, false);
});
test('R0 authority remains intact', () => {
  const ex = fixture().shell; assert.equal(ex.authority.tier, 'R0');
  assert.equal(ex.authority.canDispatch, false); assert.equal(ex.authority.canMutateLiveWorld, false);
});
test('unknown prediction error is first-class', () => assert.equal(fixture().shell.projection.predictionErrorStatus, PredictionErrorStatus.UNKNOWN));
test('outcome unknown is first-class', () => assert.equal(fixture().shell.projection.outcomeStatus, OutcomeBindingStatus.OUTCOME_UNKNOWN));
test('validation with bad external lineage records diagnostic failure rather than authority', () => {
  const fx = fixture(); const ex = validateShadowExperience(fx.shell, { trace: null, ledger: null,
    calibration: null, logicalTime: 13, provenance: xp(fx.env, 'diagnostic') });
  assert.equal(ex.projection.validationStatus, ExperienceValidationStatus.INCOMPLETE);
  assert.equal(ex.authority.tier, 'R0');
});
test('prediction error refuses unknown evidence refs', () => {
  const fx = fixture(); const ex = complete(fx);
  assert.throws(() => deriveExperiencePredictionError(ex, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], components: [{
      domain: CalibrationDomain.RESOURCE_SEMANTICS, metricType: 'RESOURCE_ERROR',
      predictionRef: 'unknown', actualOutcomeRef: fx.outcomeId, value: 1 }],
    logicalTime: 14, provenance: xp(fx.env, 'error') }), /unknown prediction/);
});
test('experience verifier accepts canonical records and rejects digest tampering', () => {
  const ex = complete(fixture()); assert.equal(verifyShadowExperience(ex), true);
  assert.throws(() => verifyShadowExperience({ ...ex, experienceDigest: 'sha256:bad' }), /digest/);
});
test('contract error type is stable', () => {
  const fx = fixture(); assert.throws(() => attachExecutedAction(fx.shell,
    { ledger: fx.ledger, selectedActionId: 'bad' }), ShadowExperienceContractError);
});
