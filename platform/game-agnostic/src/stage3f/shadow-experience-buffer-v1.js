import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { assertNoExecutionSurface } from '../experts/expert-contract.js';
import { EpistemicCategory, verifyWorldStateSnapshot } from './world-state-v1.js';
import { verifyCausalTrace } from './causal-trace-v1.js';
import {
  CalibrationDomain,
  evaluateCalibrationSufficiency,
  verifyEnvironmentCalibration,
} from './environment-calibration-v1.js';
import {
  CounterfactualTiming,
  LedgerActorType,
  verifyCounterfactualVetoLedger,
} from './counterfactual-veto-ledger-v1.js';

export const SHADOW_EXPERIENCE_SCHEMA_VERSION = 1;
export const SHADOW_EXPERIENCE_CONTRACT_ID = 'SENTINEL_SHADOW_EXPERIENCE_V1';

export const ExperienceValidationStatus = deepFreeze({
  RECORDED: 'RECORDED', VALIDATED: 'VALIDATED', INVALID: 'INVALID',
  CONFLICTED: 'CONFLICTED', INCOMPLETE: 'INCOMPLETE',
});

export const ExperienceEligibilityStatus = deepFreeze({
  ELIGIBLE: 'ELIGIBLE', INELIGIBLE: 'INELIGIBLE', UNRESOLVED: 'UNRESOLVED',
});

export const ExperiencePurpose = deepFreeze({
  TRANSITION_MODEL_TRAINING: 'TRANSITION_MODEL_TRAINING',
  ROUTER_ANALYSIS: 'ROUTER_ANALYSIS',
  PREDICTION_CALIBRATION: 'PREDICTION_CALIBRATION',
  COUNTERFACTUAL_EVALUATION: 'COUNTERFACTUAL_EVALUATION',
  STRATEGIC_POLICY_RESEARCH: 'STRATEGIC_POLICY_RESEARCH',
});

export const PredictionErrorStatus = deepFreeze({
  AVAILABLE: 'AVAILABLE', INCOMPARABLE: 'INCOMPARABLE', UNKNOWN: 'UNKNOWN', CONFLICTED: 'CONFLICTED',
});

export const OutcomeBindingStatus = deepFreeze({
  OUTCOME_BOUND: 'OUTCOME_BOUND', OUTCOME_UNKNOWN: 'OUTCOME_UNKNOWN', OUTCOME_CONFLICTED: 'OUTCOME_CONFLICTED',
});

const PURPOSE_PROFILES = deepFreeze({
  [ExperiencePurpose.TRANSITION_MODEL_TRAINING]: {
    requiredDomains: [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.TRANSITION_SEMANTICS],
    requiresDecisionTimePrediction: false, requiresOutcome: true, permitsHumanIntervention: true,
  },
  [ExperiencePurpose.ROUTER_ANALYSIS]: {
    requiredDomains: [CalibrationDomain.ACTION_SEMANTICS],
    requiresDecisionTimePrediction: false, requiresOutcome: false, permitsHumanIntervention: true,
  },
  [ExperiencePurpose.PREDICTION_CALIBRATION]: {
    requiredDomains: [CalibrationDomain.RESOURCE_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS],
    requiresDecisionTimePrediction: true, requiresOutcome: true, permitsHumanIntervention: true,
  },
  [ExperiencePurpose.COUNTERFACTUAL_EVALUATION]: {
    requiredDomains: [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.TRANSITION_SEMANTICS],
    requiresDecisionTimePrediction: true, requiresOutcome: true, permitsHumanIntervention: true,
  },
  [ExperiencePurpose.STRATEGIC_POLICY_RESEARCH]: {
    requiredDomains: [CalibrationDomain.ACTION_SEMANTICS, CalibrationDomain.OBJECTIVE_SEMANTICS,
      CalibrationDomain.TEMPORAL_SEMANTICS, CalibrationDomain.TRANSITION_SEMANTICS],
    requiresDecisionTimePrediction: false, requiresOutcome: true, permitsHumanIntervention: true,
  },
});

export const SHADOW_EXPERIENCE_CONTRACT = deepFreeze({
  contractId: SHADOW_EXPERIENCE_CONTRACT_ID,
  schemaVersion: SHADOW_EXPERIENCE_SCHEMA_VERSION,
  validationStatuses: Object.values(ExperienceValidationStatus),
  eligibilityStatuses: Object.values(ExperienceEligibilityStatus),
  eligibilityPurposes: Object.values(ExperiencePurpose),
  predictionErrorStatuses: Object.values(PredictionErrorStatus),
  purposeProfiles: PURPOSE_PROFILES,
  appendOrientedEvidence: true,
  recordedImpliesValidated: false,
  validatedImpliesTrainingEligible: false,
  predictedNextStateIsActualNextState: false,
  counterfactualActionIsExecutedAction: false,
  automaticRewardAssignment: false,
  modelTrainingPerformed: false,
  onlineLearningEnabled: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const SHADOW_EXPERIENCE_CONTRACT_HASH = sha256(SHADOW_EXPERIENCE_CONTRACT);

export class ShadowExperienceContractError extends ContractError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new ShadowExperienceContractError(`${name} must be an object`);
  return value;
};
const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') throw new ShadowExperienceContractError(`${name} must be a non-empty string`);
  return value;
};
const requireLogicalTime = (value, name = 'logicalTime') => {
  if (!Number.isSafeInteger(value) || value < 0) throw new ShadowExperienceContractError(`${name} must be a non-negative safe integer`);
  return value;
};
const requireEnum = (value, enumeration, name) => {
  if (!Object.values(enumeration).includes(value)) throw new ShadowExperienceContractError(`unsupported ${name}: ${value}`);
  return value;
};

function seal(body, idField) {
  return deepFreeze({ ...body, [idField]: `sha256:${sha256(body)}` });
}

function verifySeal(record, idField, recordType) {
  requireRecord(record, recordType);
  const { [idField]: identity, ...body } = record;
  if (body.recordType !== recordType || identity !== `sha256:${sha256(body)}`) {
    throw new ShadowExperienceContractError(`${recordType} identity mismatch`);
  }
  return record;
}

function normalizeProvenance(value, environment, name = 'provenance') {
  requireRecord(value, name);
  assertNoExecutionSurface(value, name);
  if (value.environmentId !== environment.environmentId || value.environmentVersion !== environment.environmentVersion) {
    throw new ShadowExperienceContractError(`${name} environment identity/version mismatch`);
  }
  requireString(value.sourceId, `${name}.sourceId`);
  requireString(value.evidenceId, `${name}.evidenceId`);
  return canonicalize(value);
}

function requireBoundLineage(trace, ledger, calibration) {
  verifyCausalTrace(trace);
  verifyCounterfactualVetoLedger(ledger);
  verifyEnvironmentCalibration(calibration);
  const decision = trace.decisionTimeEvent.decisionTimeEvidence;
  if (ledger.decisionEpisode.causalTraceRef.traceId !== trace.traceId
      || ledger.decisionEpisode.causalTraceRef.decisionTimeEventId !== trace.decisionTimeEvent.decisionEventId) {
    throw new ShadowExperienceContractError('counterfactual ledger/causal trace mismatch');
  }
  if (ledger.decisionEpisode.calibrationRef.calibrationId !== calibration.calibrationId
      || ledger.decisionEpisode.calibrationRef.calibrationDigest !== calibration.calibrationDigest) {
    throw new ShadowExperienceContractError('counterfactual ledger/calibration mismatch');
  }
  if (ledger.environment.environmentId !== calibration.environmentIdentity.environmentId
      || trace.environment.identity !== calibration.environmentIdentity.runtimeIdentity
      || trace.environment.version !== calibration.environmentIdentity.environmentVersion) {
    throw new ShadowExperienceContractError('experience lineage environment mismatch');
  }
  if (ledger.decisionEpisode.worldStateSnapshotRef.snapshotId !== decision.worldStateSnapshot.snapshotId) {
    throw new ShadowExperienceContractError('experience state_t reference mismatch');
  }
  return decision;
}

function createEpisode(trace, ledger, calibration, provenance) {
  const decision = requireBoundLineage(trace, ledger, calibration);
  const environment = deepFreeze({
    environmentId: calibration.environmentIdentity.environmentId,
    environmentVersion: calibration.environmentIdentity.environmentVersion,
    runtimeIdentity: calibration.environmentIdentity.runtimeIdentity,
  });
  const body = {
    recordType: 'SENTINEL_SHADOW_EXPERIENCE_EPISODE_V1',
    environment,
    logicalTime: trace.logicalTime,
    stateTRef: {
      snapshotId: decision.worldStateSnapshot.snapshotId,
      logicalTime: decision.worldStateSnapshot.time.logicalTime,
      observationEvidenceId: decision.observationEvidence.observationEvidenceId,
    },
    decisionTraceRef: {
      traceId: trace.traceId, decisionTimeEventId: trace.decisionTimeEvent.decisionEventId,
      traceContractHash: trace.contractHash,
    },
    counterfactualLedgerRef: {
      ledgerEntryId: ledger.ledgerEntryId, decisionEpisodeId: ledger.decisionEpisode.decisionEpisodeId,
      ledgerContractHash: ledger.contractHash,
    },
    calibrationRef: ledger.decisionEpisode.calibrationRef,
    sentinelRecommendationRef: {
      recommendationId: decision.recommendation.recommendationId,
      proposedAction: decision.recommendation.proposedAction,
      routerEvaluationId: decision.recommendation.routerEvaluationId,
    },
    partitionGuard: {
      causalEpisodeIdentity: `${trace.traceId}:${trace.decisionTimeEvent.decisionEventId}`,
      stateIdentity: decision.worldStateSnapshot.snapshotId,
      derivedVariantRoot: ledger.ledgerEntryId,
      decisionLogicalTime: trace.logicalTime,
    },
    provenance: normalizeProvenance(provenance, environment),
  };
  return seal(body, 'episodeRecordId');
}

function verifyEpisode(episode) {
  verifySeal(episode, 'episodeRecordId', 'SENTINEL_SHADOW_EXPERIENCE_EPISODE_V1');
  assertNoExecutionSurface(episode, 'experience episode');
  requireString(episode.environment.environmentId, 'episode.environment.environmentId');
  requireString(episode.environment.environmentVersion, 'episode.environment.environmentVersion');
  requireString(episode.environment.runtimeIdentity, 'episode.environment.runtimeIdentity');
  requireLogicalTime(episode.logicalTime, 'episode.logicalTime');
  requireString(episode.stateTRef.snapshotId, 'episode.stateTRef.snapshotId');
  requireLogicalTime(episode.stateTRef.logicalTime, 'episode.stateTRef.logicalTime');
  requireString(episode.decisionTraceRef.traceId, 'episode.decisionTraceRef.traceId');
  requireString(episode.counterfactualLedgerRef.ledgerEntryId, 'episode.counterfactualLedgerRef.ledgerEntryId');
  requireString(episode.calibrationRef.calibrationId, 'episode.calibrationRef.calibrationId');
  normalizeProvenance(episode.provenance, episode.environment, 'episode.provenance');
  const { episodeRecordId: _id, ...body } = episode;
  const experienceId = `sha256:${sha256(body)}`;
  return { episode, experienceId };
}

function createEvent(eventType, logicalTime, payload) {
  return seal({ recordType: 'SENTINEL_EXPERIENCE_APPEND_EVENT_V1', eventType, logicalTime, payload }, 'eventId');
}

const EVENT_TYPES = new Set([
  'EXECUTED_ACTION_ATTACHED', 'PREDICTION_ATTACHED', 'ACTUAL_OUTCOME_ATTACHED',
  'VALIDATION_RECORDED', 'ELIGIBILITY_EVALUATED', 'PREDICTION_ERROR_DERIVED',
]);

function verifyEvent(event) {
  verifySeal(event, 'eventId', 'SENTINEL_EXPERIENCE_APPEND_EVENT_V1');
  if (!EVENT_TYPES.has(event.eventType)) throw new ShadowExperienceContractError(`unsupported experience event: ${event.eventType}`);
  requireLogicalTime(event.logicalTime, 'event.logicalTime');
  if (event.logicalTime !== event.payload.logicalTime) throw new ShadowExperienceContractError('event/payload logical time mismatch');
  return event;
}

function verifyExecution(record, episode, experienceId) {
  verifySeal(record, 'executionBindingId', 'SENTINEL_EXPERIENCE_EXECUTED_ACTION_V1');
  if (record.experienceId !== experienceId || record.ledgerEntryId !== episode.counterfactualLedgerRef.ledgerEntryId) {
    throw new ShadowExperienceContractError('executed action experience/ledger mismatch');
  }
  requireRecord(record.executedAction, 'executedAction');
  requireString(record.executedAction.actionId, 'executedAction.actionId');
  if (record.executedBy === null) throw new ShadowExperienceContractError('executed action requires an executor');
  requireEnum(record.executedBy.type, LedgerActorType, 'executed actor');
  requireString(record.executedBy.id, 'executedBy.id');
  if (record.counterfactual !== false) throw new ShadowExperienceContractError('counterfactual action cannot be executed action');
  requireLogicalTime(record.logicalTime, 'execution.logicalTime');
  normalizeProvenance(record.provenance, episode.environment);
  return record;
}

function verifyPrediction(record, episode, experienceId) {
  verifySeal(record, 'predictionBindingId', 'SENTINEL_EXPERIENCE_PREDICTION_V1');
  if (record.experienceId !== experienceId || record.ledgerEntryId !== episode.counterfactualLedgerRef.ledgerEntryId
      || record.epistemicCategory !== EpistemicCategory.PREDICTED || record.actualStateT1Ref !== null) {
    throw new ShadowExperienceContractError('prediction binding is not epistemically isolated');
  }
  requireEnum(record.timing, CounterfactualTiming, 'prediction timing');
  requireLogicalTime(record.generatedLogicalTime, 'prediction.generatedLogicalTime');
  requireLogicalTime(record.logicalTime, 'prediction.logicalTime');
  normalizeProvenance(record.provenance, episode.environment);
  return record;
}

function verifyActualOutcome(record, episode, experienceId) {
  verifySeal(record, 'actualOutcomeBindingId', 'SENTINEL_EXPERIENCE_ACTUAL_OUTCOME_V1');
  if (record.experienceId !== experienceId || record.traceId !== episode.decisionTraceRef.traceId
      || record.epistemicCategory !== EpistemicCategory.OBSERVED) {
    throw new ShadowExperienceContractError('actual outcome is not bound to authoritative trace evidence');
  }
  requireString(record.actualStateT1Ref, 'actualStateT1Ref');
  if (record.predictedStateT1Ref !== null) throw new ShadowExperienceContractError('actual outcome cannot contain predicted state');
  requireLogicalTime(record.logicalTime, 'outcome.logicalTime');
  normalizeProvenance(record.provenance, episode.environment);
  return record;
}

function verifyValidation(record, experienceId) {
  verifySeal(record, 'validationId', 'SENTINEL_EXPERIENCE_VALIDATION_V1');
  if (record.experienceId !== experienceId) throw new ShadowExperienceContractError('validation experience mismatch');
  requireEnum(record.status, ExperienceValidationStatus, 'validation status');
  requireLogicalTime(record.logicalTime, 'validation.logicalTime');
  requireRecord(record.gates, 'validation.gates');
  for (const value of Object.values(record.gates)) {
    if (typeof value !== 'boolean') throw new ShadowExperienceContractError('validation gates must be boolean');
  }
  normalizeProvenance(record.provenance, record.environment, 'validation.provenance');
  return record;
}

function verifyEligibility(record, experienceId) {
  verifySeal(record, 'eligibilityId', 'SENTINEL_EXPERIENCE_ELIGIBILITY_V1');
  if (record.experienceId !== experienceId) throw new ShadowExperienceContractError('eligibility experience mismatch');
  requireEnum(record.purpose, ExperiencePurpose, 'eligibility purpose');
  requireEnum(record.status, ExperienceEligibilityStatus, 'eligibility status');
  if (record.modelTrainingPerformed !== false || record.automaticRewardAssignment !== false) {
    throw new ShadowExperienceContractError('eligibility crossed the learning boundary');
  }
  requireLogicalTime(record.logicalTime, 'eligibility.logicalTime');
  if (stableStringify(record.profile) !== stableStringify(PURPOSE_PROFILES[record.purpose])) {
    throw new ShadowExperienceContractError('eligibility purpose profile mismatch');
  }
  normalizeProvenance(record.provenance, record.environment, 'eligibility.provenance');
  return record;
}

function verifyPredictionError(record, experienceId) {
  verifySeal(record, 'predictionErrorId', 'SENTINEL_EXPERIENCE_PREDICTION_ERROR_V1');
  if (record.experienceId !== experienceId) throw new ShadowExperienceContractError('prediction error experience mismatch');
  requireEnum(record.status, PredictionErrorStatus, 'prediction error status');
  requireLogicalTime(record.logicalTime, 'predictionError.logicalTime');
  normalizeProvenance(record.provenance, record.environment, 'predictionError.provenance');
  return record;
}

function projectExperience(episode, attachments) {
  const verified = verifyEpisode(episode);
  const { experienceId } = verified;
  if (!Array.isArray(attachments)) throw new ShadowExperienceContractError('attachments must be an array');
  const events = [...new Map(attachments.map((entry) => [verifyEvent(entry).eventId, entry])).values()]
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
  if (events.some((entry) => entry.logicalTime < episode.logicalTime)) {
    throw new ShadowExperienceContractError('experience attachment predates state_t');
  }
  const executions = events.filter((entry) => entry.eventType === 'EXECUTED_ACTION_ATTACHED')
    .map((entry) => verifyExecution(entry.payload, episode, experienceId));
  const predictions = events.filter((entry) => entry.eventType === 'PREDICTION_ATTACHED')
    .map((entry) => verifyPrediction(entry.payload, episode, experienceId));
  const outcomes = events.filter((entry) => entry.eventType === 'ACTUAL_OUTCOME_ATTACHED')
    .map((entry) => verifyActualOutcome(entry.payload, episode, experienceId));
  const validations = events.filter((entry) => entry.eventType === 'VALIDATION_RECORDED')
    .map((entry) => verifyValidation(entry.payload, experienceId));
  const eligibilities = events.filter((entry) => entry.eventType === 'ELIGIBILITY_EVALUATED')
    .map((entry) => verifyEligibility(entry.payload, experienceId));
  const predictionErrors = events.filter((entry) => entry.eventType === 'PREDICTION_ERROR_DERIVED')
    .map((entry) => verifyPredictionError(entry.payload, experienceId));
  const executionConflict = new Set(executions.map((entry) => stableStringify({
    action: entry.executedAction, actor: entry.executedBy, actionRef: entry.actionRef,
  }))).size > 1;
  const outcomeConflict = outcomes.length > 1;
  const conflicts = { executedActions: executionConflict, outcomes: outcomeConflict };
  const conflictFree = !Object.values(conflicts).some(Boolean);
  const latest = (records, idField) => records.length === 0 ? null : [...records]
    .sort((a, b) => a.logicalTime - b.logicalTime || a[idField].localeCompare(b[idField])).at(-1);
  const validation = latest(validations, 'validationId');
  const eligibilityByPurpose = {};
  for (const purpose of Object.values(ExperiencePurpose)) {
    eligibilityByPurpose[purpose] = latest(eligibilities.filter((entry) => entry.purpose === purpose), 'eligibilityId');
  }
  const error = latest(predictionErrors, 'predictionErrorId');
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    contractId: SHADOW_EXPERIENCE_CONTRACT_ID,
    schemaVersion: SHADOW_EXPERIENCE_SCHEMA_VERSION,
    contractHash: SHADOW_EXPERIENCE_CONTRACT_HASH,
    experienceId,
    environment: episode.environment,
    logicalTime: episode.logicalTime,
    episode,
    attachments: events,
    projection: {
      recordingStatus: ExperienceValidationStatus.RECORDED,
      validationStatus: conflictFree ? validation?.status ?? ExperienceValidationStatus.RECORDED
        : ExperienceValidationStatus.CONFLICTED,
      outcomeStatus: outcomes.length === 0 ? OutcomeBindingStatus.OUTCOME_UNKNOWN
        : outcomeConflict ? OutcomeBindingStatus.OUTCOME_CONFLICTED : OutcomeBindingStatus.OUTCOME_BOUND,
      executionStatus: executions.length === 0 ? 'UNKNOWN' : executionConflict ? 'CONFLICTED' : 'BOUND',
      stateTRef: episode.stateTRef,
      sentinelRecommendationRef: episode.sentinelRecommendationRef,
      executedActions: executions,
      predictions,
      actualOutcomes: outcomes,
      validations,
      eligibilities,
      eligibilityByPurpose,
      predictionErrors,
      predictionErrorStatus: error?.status ?? PredictionErrorStatus.UNKNOWN,
      conflicts,
      conflictFree,
      recordedImpliesValidated: false,
      validatedImpliesTrainingEligible: false,
      predictedNextStateIsActualNextState: false,
      counterfactualActionIsExecutedAction: false,
      modelTrainingPerformed: false,
      automaticRewardAssignment: false,
      onlineLearningEnabled: false,
    },
    authority,
  };
  return deepFreeze({ ...body, experienceDigest: `sha256:${sha256(body)}` });
}

export function createShadowExperience({ trace, ledger, calibration, provenance }) {
  return projectExperience(createEpisode(trace, ledger, calibration, provenance), []);
}

export function verifyShadowExperience(experience) {
  if (!isRecord(experience) || experience.contractId !== SHADOW_EXPERIENCE_CONTRACT_ID
      || experience.schemaVersion !== SHADOW_EXPERIENCE_SCHEMA_VERSION
      || experience.contractHash !== SHADOW_EXPERIENCE_CONTRACT_HASH) {
    throw new ShadowExperienceContractError('not a Sentinel Shadow Experience v1 record');
  }
  const { experienceDigest, ...body } = experience;
  if (experienceDigest !== `sha256:${sha256(body)}`) throw new ShadowExperienceContractError('experience digest mismatch');
  assertEvaluationOnly(experience.authority);
  const rebuilt = projectExperience(experience.episode, experience.attachments);
  if (stableStringify(rebuilt) !== stableStringify(experience)) throw new ShadowExperienceContractError('non-canonical experience');
  return true;
}

export function serializeShadowExperience(experience) {
  verifyShadowExperience(experience);
  return stableStringify(experience);
}

function appendEvent(experience, event) {
  verifyShadowExperience(experience);
  verifyEvent(event);
  if (event.logicalTime < experience.logicalTime) throw new ShadowExperienceContractError('attachment predates state_t');
  if (experience.attachments.some((entry) => entry.eventId === event.eventId)) return experience;
  return projectExperience(experience.episode, [...experience.attachments, event]);
}

export function attachExecutedAction(experience, { ledger, selectedActionId }) {
  verifyShadowExperience(experience);
  verifyCounterfactualVetoLedger(ledger);
  if (ledger.ledgerEntryId !== experience.episode.counterfactualLedgerRef.ledgerEntryId) {
    throw new ShadowExperienceContractError('executed action ledger mismatch');
  }
  if (!ledger.projection.selectedActions.some((entry) => entry.selectedActionId === selectedActionId)) {
    throw new ShadowExperienceContractError('unknown selected action ref');
  }
  let updated = experience;
  for (const selection of ledger.projection.selectedActions) {
    if (selection.executedBy === null) throw new ShadowExperienceContractError('selected action has no executed-by evidence');
    const body = {
      recordType: 'SENTINEL_EXPERIENCE_EXECUTED_ACTION_V1', experienceId: experience.experienceId,
      ledgerEntryId: ledger.ledgerEntryId, selectedActionId: selection.selectedActionId,
      actionRef: selection.actionRef, executedAction: selection.selectedAction,
      selectedBy: selection.selectedBy, executedBy: selection.executedBy,
      logicalTime: selection.logicalTime, counterfactual: false,
      humanIntervention: selection.selectedBy.type === LedgerActorType.HUMAN
        || ledger.projection.vetoes.some((entry) => entry.actor.type === LedgerActorType.HUMAN),
      sentinelProposalMatched: selection.comparisonStatus === 'MATCH',
      provenance: normalizeProvenance(selection.provenance, experience.environment),
    };
    const record = seal(body, 'executionBindingId');
    updated = appendEvent(updated, createEvent('EXECUTED_ACTION_ATTACHED', body.logicalTime, record));
  }
  return updated;
}

export function attachExperiencePrediction(experience, { ledger, counterfactualId }) {
  verifyShadowExperience(experience);
  verifyCounterfactualVetoLedger(ledger);
  if (ledger.ledgerEntryId !== experience.episode.counterfactualLedgerRef.ledgerEntryId) {
    throw new ShadowExperienceContractError('prediction ledger mismatch');
  }
  const prediction = ledger.projection.counterfactuals.find((entry) => entry.counterfactualId === counterfactualId);
  if (!prediction) throw new ShadowExperienceContractError('unknown counterfactual ref');
  const body = {
    recordType: 'SENTINEL_EXPERIENCE_PREDICTION_V1', experienceId: experience.experienceId,
    ledgerEntryId: ledger.ledgerEntryId, counterfactualId: prediction.counterfactualId,
    candidateAction: prediction.candidateAction, predictionRef: prediction.predictionRef,
    predictedStateT1Ref: prediction.predictedStateRef,
    predictedOutcomeRef: prediction.counterfactualId,
    epistemicCategory: EpistemicCategory.PREDICTED,
    timing: prediction.timing, generatedLogicalTime: prediction.generatedLogicalTime,
    logicalTime: prediction.logicalTime, actualStateT1Ref: null,
    provenance: normalizeProvenance(prediction.provenance, experience.environment),
  };
  const record = seal(body, 'predictionBindingId');
  return appendEvent(experience, createEvent('PREDICTION_ATTACHED', body.logicalTime, record));
}

export function attachExperienceActualOutcome(experience, { trace, actualStateSnapshots, outcomeId }) {
  verifyShadowExperience(experience);
  verifyCausalTrace(trace);
  if (trace.traceId !== experience.episode.decisionTraceRef.traceId
      || trace.decisionTimeEvent.decisionEventId !== experience.episode.decisionTraceRef.decisionTimeEventId) {
    throw new ShadowExperienceContractError('actual outcome trace mismatch');
  }
  if (!Array.isArray(actualStateSnapshots)) throw new ShadowExperienceContractError('actualStateSnapshots must be an array');
  if (!trace.projection.outcomes.some((entry) => entry.outcomeId === outcomeId)) throw new ShadowExperienceContractError('unknown outcome ref');
  const snapshots = new Map();
  for (const snapshot of actualStateSnapshots) {
    verifyWorldStateSnapshot(snapshot);
    snapshots.set(snapshot.snapshotId, snapshot);
  }
  let updated = experience;
  for (const outcome of trace.projection.outcomes) {
    const snapshot = snapshots.get(outcome.authoritativeStateSnapshotId);
    if (!snapshot) throw new ShadowExperienceContractError('missing actual state_t1 snapshot for outcome');
    if (snapshot.environment.identity !== experience.environment.runtimeIdentity
        || snapshot.environment.version !== experience.environment.environmentVersion) {
      throw new ShadowExperienceContractError('actual state_t1 environment mismatch');
    }
    const categories = [...new Set(snapshot.facts.map((fact) => fact.category))].sort();
    if (!categories.includes(EpistemicCategory.OBSERVED)) {
      throw new ShadowExperienceContractError('actual state_t1 lacks authoritative observation');
    }
    const body = {
      recordType: 'SENTINEL_EXPERIENCE_ACTUAL_OUTCOME_V1', experienceId: experience.experienceId,
      traceId: trace.traceId, outcomeId: outcome.outcomeId,
      actualStateT1Ref: snapshot.snapshotId, actualOutcomeRef: outcome.outcomeId,
      predictedStateT1Ref: null, epistemicCategory: EpistemicCategory.OBSERVED,
      observationCompleteness: outcome.observationCompleteness,
      observedFactCount: snapshot.facts.filter((fact) => fact.category === EpistemicCategory.OBSERVED).length,
      stateEpistemicCategories: categories,
      logicalTime: outcome.logicalTime,
      provenance: normalizeProvenance({
        environmentId: experience.environment.environmentId,
        environmentVersion: experience.environment.environmentVersion,
        sourceId: outcome.provenance.sourceId, evidenceId: outcome.provenance.evidenceId,
      }, experience.environment),
    };
    if (snapshot.time.logicalTime !== outcome.logicalTime) {
      throw new ShadowExperienceContractError('actual state_t1/outcome logical time mismatch');
    }
    const record = seal(body, 'actualOutcomeBindingId');
    updated = appendEvent(updated, createEvent('ACTUAL_OUTCOME_ATTACHED', body.logicalTime, record));
  }
  return updated;
}

export function validateShadowExperience(experience, { trace, ledger, calibration, logicalTime, provenance }) {
  verifyShadowExperience(experience);
  let traceIntegrityValid = true;
  let counterfactualReferenceValid = true;
  let calibrationReferenceValid = true;
  try {
    requireBoundLineage(trace, ledger, calibration);
    if (trace.traceId !== experience.episode.decisionTraceRef.traceId) traceIntegrityValid = false;
    if (ledger.ledgerEntryId !== experience.episode.counterfactualLedgerRef.ledgerEntryId) counterfactualReferenceValid = false;
    if (calibration.calibrationId !== experience.episode.calibrationRef.calibrationId) calibrationReferenceValid = false;
  } catch {
    traceIntegrityValid = false; counterfactualReferenceValid = false; calibrationReferenceValid = false;
  }
  const executions = experience.projection.executedActions;
  const outcomes = experience.projection.actualOutcomes;
  const predictions = experience.projection.predictions;
  const actionIdentityBound = executions.length === 1
    && ledger?.projection?.selectedActions?.some((entry) => entry.selectedActionId === executions[0].selectedActionId);
  const outcomeIdentityBound = outcomes.length === 1
    && trace?.projection?.outcomes?.some((entry) => entry.outcomeId === outcomes[0].outcomeId);
  const temporalOrderValid = executions.length === 0 || outcomes.length === 0 ? false
    : experience.episode.stateTRef.logicalTime <= executions[0].logicalTime
      && executions[0].logicalTime <= outcomes[0].logicalTime;
  const authoritativeFieldsUncontaminated = outcomes.length === 0 ? false
    : outcomes.every((entry) => entry.epistemicCategory === EpistemicCategory.OBSERVED
      && !entry.stateEpistemicCategories.includes(EpistemicCategory.PREDICTED));
  const predictionSeparatedFromObservation = predictions.every((prediction) =>
    prediction.epistemicCategory === EpistemicCategory.PREDICTED
      && prediction.actualStateT1Ref === null
      && outcomes.every((outcome) => prediction.predictedStateT1Ref !== outcome.actualStateT1Ref));
  const hindsightLeakageFree = predictions.every((prediction) =>
    prediction.timing === CounterfactualTiming.POST_HOC_ANALYSIS
      || prediction.generatedLogicalTime <= experience.episode.stateTRef.logicalTime);
  const observationProvenanceValid = Boolean(trace?.decisionTimeEvent?.decisionTimeEvidence?.observationEvidence?.provenance);
  const worldStateSchemaValid = Boolean(traceIntegrityValid);
  const environmentIdentityBound = traceIntegrityValid && counterfactualReferenceValid && calibrationReferenceValid;
  const conflictFree = experience.projection.conflictFree
    && (ledger === null || ledger === undefined
      || ledger?.projection?.stage3f4Metadata?.conflictFree === true);
  const gates = {
    observationProvenanceValid, worldStateSchemaValid, environmentIdentityBound, calibrationReferenceValid,
    actionIdentityBound, outcomeIdentityBound, temporalOrderValid, authoritativeFieldsUncontaminated,
    predictionSeparatedFromObservation, traceIntegrityValid, counterfactualReferenceValid,
    hindsightLeakageFree, conflictFree,
  };
  const requiredComplete = [actionIdentityBound, outcomeIdentityBound, temporalOrderValid];
  let status = ExperienceValidationStatus.VALIDATED;
  if (!conflictFree) status = ExperienceValidationStatus.CONFLICTED;
  else if (requiredComplete.some((value) => !value)) status = ExperienceValidationStatus.INCOMPLETE;
  else if (Object.values(gates).some((value) => !value)) status = ExperienceValidationStatus.INVALID;
  const body = {
    recordType: 'SENTINEL_EXPERIENCE_VALIDATION_V1', experienceId: experience.experienceId,
    status, gates, reasons: Object.entries(gates).filter(([, value]) => !value).map(([name]) => name).sort(),
    transitionTiming: {
      transitionStart: experience.episode.stateTRef.logicalTime,
      actionTime: executions.length === 1 ? executions[0].logicalTime : null,
      transitionEnd: outcomes.length === 1 ? outcomes[0].logicalTime : null,
      outcomeDelay: executions.length === 1 && outcomes.length === 1
        ? outcomes[0].logicalTime - executions[0].logicalTime : null,
      logicalDuration: outcomes.length === 1
        ? outcomes[0].logicalTime - experience.episode.stateTRef.logicalTime : null,
      attributionWindowStatus: outcomes.length === 1 ? 'BOUND' : 'UNKNOWN',
    },
    logicalTime: requireLogicalTime(logicalTime),
    environment: experience.environment,
    provenance: normalizeProvenance(provenance, experience.environment),
  };
  const record = seal(body, 'validationId');
  return appendEvent(experience, createEvent('VALIDATION_RECORDED', body.logicalTime, record));
}

export function evaluateExperienceEligibility(experience, { purpose, calibration, logicalTime, provenance }) {
  verifyShadowExperience(experience);
  verifyEnvironmentCalibration(calibration);
  const normalizedPurpose = requireEnum(purpose, ExperiencePurpose, 'eligibility purpose');
  if (calibration.calibrationId !== experience.episode.calibrationRef.calibrationId) {
    throw new ShadowExperienceContractError('eligibility calibration mismatch');
  }
  const profile = PURPOSE_PROFILES[normalizedPurpose];
  const sufficiency = evaluateCalibrationSufficiency(calibration, profile.requiredDomains);
  const validation = [...experience.projection.validations]
    .sort((a, b) => a.logicalTime - b.logicalTime || a.validationId.localeCompare(b.validationId)).at(-1) ?? null;
  const reasons = [];
  let status = ExperienceEligibilityStatus.ELIGIBLE;
  if (validation === null) {
    status = ExperienceEligibilityStatus.UNRESOLVED; reasons.push('VALIDATION_NOT_RECORDED');
  } else if (validation.status !== ExperienceValidationStatus.VALIDATED) {
    status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push(`VALIDATION_${validation.status}`);
  }
  if (!sufficiency.sufficient) { status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push('CALIBRATION_INSUFFICIENT'); }
  if (!experience.projection.conflictFree) { status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push('CONFLICTED_EVIDENCE'); }
  if (profile.requiresOutcome && experience.projection.actualOutcomes.length !== 1) {
    status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push('AUTHORITATIVE_OUTCOME_REQUIRED');
  }
  const decisionPredictions = experience.projection.predictions.filter((entry) => entry.timing === CounterfactualTiming.DECISION_TIME);
  if (profile.requiresDecisionTimePrediction && decisionPredictions.length === 0) {
    status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push('DECISION_TIME_PREDICTION_REQUIRED');
  }
  if (normalizedPurpose === ExperiencePurpose.PREDICTION_CALIBRATION
      && experience.projection.predictions.some((entry) => entry.timing === CounterfactualTiming.POST_HOC_ANALYSIS)
      && decisionPredictions.length === 0) {
    status = ExperienceEligibilityStatus.INELIGIBLE; reasons.push('POST_HOC_PREDICTION_NOT_DECISION_TIME');
  }
  const body = {
    recordType: 'SENTINEL_EXPERIENCE_ELIGIBILITY_V1', experienceId: experience.experienceId,
    purpose: normalizedPurpose, profile, status, reasons: [...new Set(reasons)].sort(),
    validationRef: validation?.validationId ?? null,
    calibrationId: calibration.calibrationId, calibrationSufficient: sufficiency.sufficient,
    calibrationSufficiencyRef: sufficiency.sufficiencyDigest,
    humanInterventionPresent: experience.projection.executedActions.some((entry) => entry.humanIntervention),
    modelTrainingPerformed: false, automaticRewardAssignment: false,
    logicalTime: requireLogicalTime(logicalTime),
    environment: experience.environment,
    provenance: normalizeProvenance(provenance, experience.environment),
  };
  const record = seal(body, 'eligibilityId');
  return appendEvent(experience, createEvent('ELIGIBILITY_EVALUATED', body.logicalTime, record));
}

export function deriveExperiencePredictionError(experience, {
  calibration, requiredCapabilities, components = [], logicalTime, provenance,
}) {
  verifyShadowExperience(experience);
  verifyEnvironmentCalibration(calibration);
  if (calibration.calibrationId !== experience.episode.calibrationRef.calibrationId) {
    throw new ShadowExperienceContractError('prediction error calibration mismatch');
  }
  if (!Array.isArray(components)) throw new ShadowExperienceContractError('components must be an array');
  const sufficiency = evaluateCalibrationSufficiency(calibration, requiredCapabilities);
  const hasPrediction = experience.projection.predictions.length > 0;
  const hasOutcome = experience.projection.actualOutcomes.length === 1;
  let status = PredictionErrorStatus.AVAILABLE;
  if (!experience.projection.conflictFree) status = PredictionErrorStatus.CONFLICTED;
  else if (!hasPrediction || !hasOutcome) status = PredictionErrorStatus.UNKNOWN;
  else if (!sufficiency.sufficient) status = PredictionErrorStatus.INCOMPARABLE;
  const normalizedComponents = status !== PredictionErrorStatus.AVAILABLE ? [] : components.map((component) => {
    requireRecord(component, 'prediction error component');
    const domain = requireString(component.domain, 'component.domain');
    if (!sufficiency.requiredCapabilities.some((entry) => entry.domain === domain)) {
      throw new ShadowExperienceContractError('prediction error component domain was not required');
    }
    if (!experience.projection.predictions.some((entry) =>
      entry.predictionBindingId === component.predictionRef || entry.predictionRef === component.predictionRef)) {
      throw new ShadowExperienceContractError('prediction error component has unknown prediction ref');
    }
    if (!experience.projection.actualOutcomes.some((entry) => entry.actualOutcomeRef === component.actualOutcomeRef)) {
      throw new ShadowExperienceContractError('prediction error component has unknown actual outcome ref');
    }
    requireString(component.metricType, 'component.metricType');
    assertNoExecutionSurface(component.value, 'component.value');
    return canonicalize(component);
  });
  if (status === PredictionErrorStatus.AVAILABLE && normalizedComponents.length === 0) {
    throw new ShadowExperienceContractError('available prediction error requires calibrated components');
  }
  const body = {
    recordType: 'SENTINEL_EXPERIENCE_PREDICTION_ERROR_V1', experienceId: experience.experienceId,
    status, comparisonNotValid: status === PredictionErrorStatus.INCOMPARABLE ? 'CALIBRATION_INSUFFICIENT' : null,
    calibrationId: calibration.calibrationId, calibrationSufficient: sufficiency.sufficient,
    calibrationSufficiencyRef: sufficiency.sufficiencyDigest,
    components: [...new Map(normalizedComponents.map((entry) => [stableStringify(entry), entry])).values()]
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    logicalTime: requireLogicalTime(logicalTime),
    environment: experience.environment,
    provenance: normalizeProvenance(provenance, experience.environment),
  };
  const record = seal(body, 'predictionErrorId');
  return appendEvent(experience, createEvent('PREDICTION_ERROR_DERIVED', body.logicalTime, record));
}

export function createShadowExperienceBuffer({ bufferVersion }) {
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const identityBody = {
    recordType: 'SENTINEL_SHADOW_EXPERIENCE_BUFFER_V1',
    schemaVersion: 1, bufferVersion: requireString(bufferVersion, 'bufferVersion'), authority,
  };
  const bufferId = `sha256:${sha256(identityBody)}`;
  const body = { ...identityBody, bufferId, entries: [], projection: { experiences: [], experienceIds: [] } };
  return deepFreeze({ ...body, bufferDigest: `sha256:${sha256(body)}` });
}

export function verifyShadowExperienceBuffer(buffer) {
  requireRecord(buffer, 'buffer');
  const { bufferDigest, ...body } = buffer;
  if (body.recordType !== 'SENTINEL_SHADOW_EXPERIENCE_BUFFER_V1'
      || bufferDigest !== `sha256:${sha256(body)}`) throw new ShadowExperienceContractError('buffer digest mismatch');
  assertEvaluationOnly(buffer.authority);
  const identityBody = {
    recordType: body.recordType, schemaVersion: body.schemaVersion,
    bufferVersion: body.bufferVersion, authority: body.authority,
  };
  if (buffer.bufferId !== `sha256:${sha256(identityBody)}`) throw new ShadowExperienceContractError('buffer identity mismatch');
  const rebuilt = buildBuffer(identityBody, buffer.entries);
  if (stableStringify(rebuilt) !== stableStringify(buffer)) throw new ShadowExperienceContractError('non-canonical buffer');
  return true;
}

function buildBuffer(identityBody, entries) {
  const normalized = [...new Map(entries.map((entry) => {
    verifyShadowExperience(entry);
    return [entry.experienceDigest, entry];
  })).values()].sort((a, b) => a.experienceDigest.localeCompare(b.experienceDigest));
  const byId = new Map();
  for (const experience of normalized) {
    const current = byId.get(experience.experienceId);
    if (!current || experience.attachments.length > current.attachments.length
        || (experience.attachments.length === current.attachments.length
          && experience.experienceDigest.localeCompare(current.experienceDigest) > 0)) {
      byId.set(experience.experienceId, experience);
    }
  }
  const experiences = [...byId.values()].sort((a, b) => a.experienceId.localeCompare(b.experienceId));
  const bufferId = `sha256:${sha256(identityBody)}`;
  const body = {
    ...identityBody, bufferId, entries: normalized,
    projection: { experiences, experienceIds: experiences.map((entry) => entry.experienceId) },
  };
  return deepFreeze({ ...body, bufferDigest: `sha256:${sha256(body)}` });
}

export function appendExperienceToBuffer(buffer, experience) {
  verifyShadowExperienceBuffer(buffer);
  verifyShadowExperience(experience);
  if (buffer.entries.some((entry) => entry.experienceDigest === experience.experienceDigest)) return buffer;
  const identityBody = {
    recordType: buffer.recordType, schemaVersion: buffer.schemaVersion,
    bufferVersion: buffer.bufferVersion, authority: buffer.authority,
  };
  return buildBuffer(identityBody, [...buffer.entries, experience]);
}

export function freezeExperienceSnapshot({ buffer, purpose, calibrationConstraints = [], snapshotVersion = '1' }) {
  verifyShadowExperienceBuffer(buffer);
  const normalizedPurpose = requireEnum(purpose, ExperiencePurpose, 'snapshot eligibility purpose');
  if (!Array.isArray(calibrationConstraints)) throw new ShadowExperienceContractError('calibrationConstraints must be an array');
  const included = buffer.projection.experiences.filter((experience) =>
    experience.projection.eligibilityByPurpose[normalizedPurpose]?.status === ExperienceEligibilityStatus.ELIGIBLE);
  const experienceIds = included.map((entry) => entry.experienceId).sort();
  const partitionGuard = included.map((entry) => ({
    experienceId: entry.experienceId,
    causalEpisodeIdentity: entry.episode.partitionGuard.causalEpisodeIdentity,
    stateIdentity: entry.episode.partitionGuard.stateIdentity,
    derivedVariantRoot: entry.episode.partitionGuard.derivedVariantRoot,
  })).sort((a, b) => a.experienceId.localeCompare(b.experienceId));
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_FROZEN_EXPERIENCE_SNAPSHOT_V1', schemaVersion: 1,
    snapshotVersion: requireString(snapshotVersion, 'snapshotVersion'),
    eligibilityProfile: normalizedPurpose,
    experienceIds,
    experienceDigests: included.map((entry) => entry.experienceDigest).sort(),
    calibrationConstraints: [...new Map(calibrationConstraints.map((entry) => {
      requireRecord(entry, 'calibration constraint');
      requireString(entry.environmentId, 'constraint.environmentId');
      requireString(entry.calibrationId, 'constraint.calibrationId');
      const normalized = canonicalize(entry);
      return [stableStringify(normalized), normalized];
    })).values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    partitionGuard,
    createdFromBufferVersion: buffer.bufferVersion,
    createdFromBufferId: buffer.bufferId,
    createdFromBufferDigest: buffer.bufferDigest,
    modelTrainingPerformed: false,
    authority,
  };
  const snapshotId = `sha256:${sha256(body)}`;
  return deepFreeze({ ...body, snapshotId, snapshotDigest: `sha256:${sha256({ ...body, snapshotId })}` });
}

export function verifyFrozenExperienceSnapshot(snapshot) {
  requireRecord(snapshot, 'snapshot');
  const { snapshotId, snapshotDigest, ...body } = snapshot;
  if (body.recordType !== 'SENTINEL_FROZEN_EXPERIENCE_SNAPSHOT_V1'
      || snapshotId !== `sha256:${sha256(body)}`
      || snapshotDigest !== `sha256:${sha256({ ...body, snapshotId })}`) {
    throw new ShadowExperienceContractError('frozen experience snapshot identity mismatch');
  }
  assertEvaluationOnly(snapshot.authority);
  return true;
}
