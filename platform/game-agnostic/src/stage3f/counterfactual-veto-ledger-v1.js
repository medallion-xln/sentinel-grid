import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { assertNoExecutionSurface } from '../experts/expert-contract.js';
import { EpistemicCategory } from './world-state-v1.js';
import { verifyCausalTrace } from './causal-trace-v1.js';
import {
  bindCausalTraceCalibration,
  bindWorldStateCalibration,
  evaluateCalibrationSufficiency,
  verifyEnvironmentCalibration,
} from './environment-calibration-v1.js';

export const COUNTERFACTUAL_VETO_LEDGER_SCHEMA_VERSION = 1;
export const COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID = 'SENTINEL_COUNTERFACTUAL_VETO_LEDGER_V1';

export const LedgerActorType = deepFreeze({
  SENTINEL: 'SENTINEL', INCUMBENT: 'INCUMBENT', HUMAN: 'HUMAN',
  SYSTEM_POLICY: 'SYSTEM_POLICY', UNKNOWN: 'UNKNOWN',
});

export const ActionComparisonStatus = deepFreeze({
  MATCH: 'MATCH', PARTIAL_MATCH: 'PARTIAL_MATCH', DIFFERENT_ACTION: 'DIFFERENT_ACTION',
  NO_SENTINEL_PROPOSAL: 'NO_SENTINEL_PROPOSAL', NO_SELECTED_ACTION: 'NO_SELECTED_ACTION', UNKNOWN: 'UNKNOWN',
});

export const VetoDisposition = deepFreeze({
  ACCEPTED: 'ACCEPTED', OVERRIDDEN: 'OVERRIDDEN', VETOED: 'VETOED', IGNORED: 'IGNORED',
  NOT_APPLICABLE: 'NOT_APPLICABLE', UNKNOWN: 'UNKNOWN',
});

export const VetoReasonCategory = deepFreeze({
  SAFETY: 'SAFETY', LEGALITY: 'LEGALITY', POLICY: 'POLICY', OBJECTIVE_CONFLICT: 'OBJECTIVE_CONFLICT',
  RESOURCE_CONSTRAINT: 'RESOURCE_CONSTRAINT', TIMING: 'TIMING', UNCERTAINTY: 'UNCERTAINTY',
  HUMAN_PREFERENCE: 'HUMAN_PREFERENCE', INCUMBENT_STRATEGY: 'INCUMBENT_STRATEGY',
  MISSING_INFORMATION: 'MISSING_INFORMATION', EXECUTION_CONSTRAINT: 'EXECUTION_CONSTRAINT',
  OTHER: 'OTHER', UNKNOWN: 'UNKNOWN',
});

export const CounterfactualTiming = deepFreeze({
  DECISION_TIME: 'DECISION_TIME', POST_HOC_ANALYSIS: 'POST_HOC_ANALYSIS',
});

export const LedgerEvaluationStatus = deepFreeze({
  UNRESOLVED: 'UNRESOLVED', SENTINEL_SUPPORTED: 'SENTINEL_SUPPORTED',
  SELECTED_ACTION_SUPPORTED: 'SELECTED_ACTION_SUPPORTED', BOTH_PLAUSIBLE: 'BOTH_PLAUSIBLE',
  BOTH_POOR: 'BOTH_POOR', INCOMPARABLE: 'INCOMPARABLE', CONFLICTED: 'CONFLICTED', UNKNOWN: 'UNKNOWN',
});

export const LedgerLifecycleStatus = deepFreeze({
  OPEN: 'OPEN', SELECTION_BOUND: 'SELECTION_BOUND', VETO_BOUND: 'VETO_BOUND',
  COUNTERFACTUAL_BOUND: 'COUNTERFACTUAL_BOUND', OUTCOME_BOUND: 'OUTCOME_BOUND',
  EVALUATED: 'EVALUATED', INCOMPLETE: 'INCOMPLETE', CONFLICTED: 'CONFLICTED',
});

export const COUNTERFACTUAL_VETO_LEDGER_CONTRACT = deepFreeze({
  contractId: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID,
  schemaVersion: COUNTERFACTUAL_VETO_LEDGER_SCHEMA_VERSION,
  actors: Object.values(LedgerActorType),
  actionComparisonStatuses: Object.values(ActionComparisonStatus),
  vetoDispositions: Object.values(VetoDisposition),
  vetoReasonCategories: Object.values(VetoReasonCategory),
  counterfactualTiming: Object.values(CounterfactualTiming),
  evaluationStatuses: Object.values(LedgerEvaluationStatus),
  appendOrientedEvidence: true,
  disagreementImpliesNegativeReward: false,
  agreementImpliesCorrectness: false,
  unexecutedCounterfactualIsObservedOutcome: false,
  automaticRewardAssignment: false,
  trainingEligibilityDecided: false,
  onlineLearningEnabled: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH = sha256(COUNTERFACTUAL_VETO_LEDGER_CONTRACT);

export class CounterfactualVetoLedgerContractError extends ContractError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new CounterfactualVetoLedgerContractError(`${name} must be an object`);
  return value;
};
const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CounterfactualVetoLedgerContractError(`${name} must be a non-empty string`);
  }
  return value;
};
const requireLogicalTime = (value, name = 'logicalTime') => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CounterfactualVetoLedgerContractError(`${name} must be a non-negative safe integer`);
  }
  return value;
};
const requireConfidence = (value, name, nullable = false) => {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new CounterfactualVetoLedgerContractError(`${name} must be in [0,1]${nullable ? ' or null' : ''}`);
  }
  return value;
};
const requireEnum = (value, enumeration, name) => {
  if (!Object.values(enumeration).includes(value)) {
    throw new CounterfactualVetoLedgerContractError(`unsupported ${name}: ${value}`);
  }
  return value;
};

function seal(body, idField) {
  return deepFreeze({ ...body, [idField]: `sha256:${sha256(body)}` });
}

function verifySeal(record, idField, recordType) {
  requireRecord(record, recordType);
  const { [idField]: identity, ...body } = record;
  if (body.recordType !== recordType || identity !== `sha256:${sha256(body)}`) {
    throw new CounterfactualVetoLedgerContractError(`${recordType} identity mismatch`);
  }
  return record;
}

function environmentRef(calibration) {
  return deepFreeze({
    environmentId: calibration.environmentIdentity.environmentId,
    environmentVersion: calibration.environmentIdentity.environmentVersion,
    runtimeIdentity: calibration.environmentIdentity.runtimeIdentity,
  });
}

function normalizeProvenance(value, environment, name = 'provenance') {
  requireRecord(value, name);
  assertNoExecutionSurface(value, name);
  if (value.environmentId !== environment.environmentId
      || value.environmentVersion !== environment.environmentVersion) {
    throw new CounterfactualVetoLedgerContractError(`${name} environment identity/version mismatch`);
  }
  requireString(value.sourceId, `${name}.sourceId`);
  requireString(value.evidenceId, `${name}.evidenceId`);
  return canonicalize(value);
}

function canonicalAction(action, name) {
  requireRecord(action, name);
  requireString(action.actionId, `${name}.actionId`);
  assertNoExecutionSurface(action, name);
  return canonicalize(action);
}

function normalizeActor(actor, name) {
  requireRecord(actor, name);
  return canonicalize({
    type: requireEnum(actor.type, LedgerActorType, `${name}.type`),
    id: requireString(actor.id, `${name}.id`),
  });
}

function compareAction(proposal, selectedAction) {
  if (proposal.abstained || proposal.proposedAction === null) return ActionComparisonStatus.NO_SENTINEL_PROPOSAL;
  if (stableStringify(proposal.proposedAction) === stableStringify(selectedAction)) return ActionComparisonStatus.MATCH;
  if (proposal.proposedAction.actionId === selectedAction.actionId) return ActionComparisonStatus.PARTIAL_MATCH;
  return ActionComparisonStatus.DIFFERENT_ACTION;
}

function createEvent(eventType, logicalTime, payload) {
  return seal({ recordType: 'SENTINEL_LEDGER_APPEND_EVENT_V1', eventType, logicalTime, payload }, 'eventId');
}

const supportedEvents = new Set([
  'SELECTED_ACTION_ATTACHED', 'VETO_ATTACHED', 'COUNTERFACTUAL_ATTACHED',
  'ACTUAL_OUTCOME_ATTACHED', 'EVALUATION_ATTACHED',
]);

function verifyEvent(event) {
  verifySeal(event, 'eventId', 'SENTINEL_LEDGER_APPEND_EVENT_V1');
  if (!supportedEvents.has(event.eventType)) {
    throw new CounterfactualVetoLedgerContractError(`unsupported ledger event type: ${event.eventType}`);
  }
  requireLogicalTime(event.logicalTime, 'event.logicalTime');
  if (event.logicalTime !== event.payload.logicalTime) {
    throw new CounterfactualVetoLedgerContractError('event logical time does not match payload');
  }
  return event;
}

function decisionReference(trace, calibration) {
  verifyCausalTrace(trace);
  verifyEnvironmentCalibration(calibration);
  const runtime = trace.environment;
  if (runtime.identity !== calibration.environmentIdentity.runtimeIdentity
      || runtime.version !== calibration.environmentIdentity.environmentVersion) {
    throw new CounterfactualVetoLedgerContractError('trace/calibration environment mismatch');
  }
  const decision = trace.decisionTimeEvent.decisionTimeEvidence;
  const recommendation = decision.recommendation;
  const worldStateCalibrationBinding = bindWorldStateCalibration(decision.worldStateSnapshot, calibration);
  const causalTraceCalibrationBinding = bindCausalTraceCalibration(trace, calibration);
  const environment = environmentRef(calibration);
  const body = {
    recordType: 'SENTINEL_LEDGER_DECISION_EPISODE_V1',
    environment,
    logicalTime: trace.logicalTime,
    worldStateSnapshotRef: {
      snapshotId: decision.worldStateSnapshot.snapshotId,
      calibrationBindingId: worldStateCalibrationBinding.worldStateCalibrationBindingId,
    },
    causalTraceRef: {
      traceId: trace.traceId,
      decisionTimeEventId: trace.decisionTimeEvent.decisionEventId,
      calibrationBindingId: causalTraceCalibrationBinding.causalTraceCalibrationBindingId,
    },
    calibrationRef: causalTraceCalibrationBinding.calibrationRef,
    sentinelProposal: {
      actor: { type: LedgerActorType.SENTINEL, id: 'SENTINEL' },
      recommendationId: recommendation.recommendationId,
      proposedAction: recommendation.proposedAction,
      confidence: recommendation.confidence,
      uncertainty: recommendation.uncertainty,
      routerEvaluationId: recommendation.routerEvaluationId,
      worldStateSnapshotId: decision.worldStateSnapshot.snapshotId,
      predictorEvidenceRefs: decision.predictorEvidence.map((entry) => entry.predictorEvidenceId).sort(),
      abstained: recommendation.abstained,
      authority: recommendation.authority,
      dispatchPermitted: false,
    },
  };
  const ledgerEntryId = `sha256:${sha256(body)}`;
  return seal({ ...body, ledgerEntryId }, 'decisionEpisodeId');
}

function verifyDecisionReference(decision, trace = null, calibration = null) {
  verifySeal(decision, 'decisionEpisodeId', 'SENTINEL_LEDGER_DECISION_EPISODE_V1');
  const { decisionEpisodeId: _id, ...bodyWithLedgerId } = decision;
  const { ledgerEntryId, ...body } = bodyWithLedgerId;
  if (ledgerEntryId !== `sha256:${sha256(body)}`) {
    throw new CounterfactualVetoLedgerContractError('ledger entry identity mismatch');
  }
  assertEvaluationOnly(decision.sentinelProposal.authority);
  if (decision.sentinelProposal.dispatchPermitted !== false) {
    throw new CounterfactualVetoLedgerContractError('Sentinel proposal cannot dispatch');
  }
  if (trace && calibration) {
    const recreated = decisionReference(trace, calibration);
    if (stableStringify(recreated) !== stableStringify(decision)) {
      throw new CounterfactualVetoLedgerContractError('trace or calibration reference mismatch');
    }
  }
  return decision;
}

function verifySelectedAction(record, decision) {
  verifySeal(record, 'selectedActionId', 'SENTINEL_LEDGER_SELECTED_ACTION_V1');
  if (record.ledgerEntryId !== decision.ledgerEntryId) throw new CounterfactualVetoLedgerContractError('selected action ledger mismatch');
  canonicalAction(record.selectedAction, 'selectedAction');
  normalizeActor(record.selectedBy, 'selectedBy');
  if (record.executedBy !== null) normalizeActor(record.executedBy, 'executedBy');
  if (record.comparisonStatus !== compareAction(decision.sentinelProposal, record.selectedAction)) {
    throw new CounterfactualVetoLedgerContractError('selected action comparison status mismatch');
  }
  normalizeProvenance(record.provenance, decision.environment);
  return record;
}

function verifyVeto(record, decision) {
  verifySeal(record, 'vetoRecordId', 'SENTINEL_LEDGER_VETO_V1');
  if (record.ledgerEntryId !== decision.ledgerEntryId) throw new CounterfactualVetoLedgerContractError('veto ledger mismatch');
  requireEnum(record.disposition, VetoDisposition, 'veto disposition');
  normalizeActor(record.actor, 'veto.actor');
  requireEnum(record.reason.category, VetoReasonCategory, 'veto reason category');
  requireEnum(record.reason.epistemicCategory, EpistemicCategory, 'veto reason epistemic category');
  if (record.reason.category === VetoReasonCategory.UNKNOWN) {
    if (record.reason.description !== null || record.reason.confidence !== null || record.reason.provenance !== null) {
      throw new CounterfactualVetoLedgerContractError('UNKNOWN veto reason must remain empty');
    }
  } else {
    requireString(record.reason.description, 'veto reason description');
    requireConfidence(record.reason.confidence, 'veto reason confidence');
    normalizeProvenance(record.reason.provenance, decision.environment, 'veto.reason.provenance');
    if (![EpistemicCategory.OBSERVED, EpistemicCategory.DERIVED].includes(record.reason.epistemicCategory)) {
      throw new CounterfactualVetoLedgerContractError('classified veto reasons must be OBSERVED or DERIVED');
    }
  }
  normalizeProvenance(record.provenance, decision.environment);
  return record;
}

function verifyCounterfactual(record, decision) {
  verifySeal(record, 'counterfactualId', 'SENTINEL_LEDGER_COUNTERFACTUAL_V1');
  if (record.ledgerEntryId !== decision.ledgerEntryId) throw new CounterfactualVetoLedgerContractError('counterfactual ledger mismatch');
  canonicalAction(record.candidateAction, 'candidateAction');
  requireString(record.predictionRef, 'predictionRef');
  requireRecord(record.predictionSource, 'predictionSource');
  requireString(record.predictionSource.id, 'predictionSource.id');
  requireString(record.predictionSource.version, 'predictionSource.version');
  requireEnum(record.timing, CounterfactualTiming, 'counterfactual timing');
  if (record.epistemicCategory !== EpistemicCategory.PREDICTED || record.executed !== false
      || record.observedOutcomeRef !== null) {
    throw new CounterfactualVetoLedgerContractError('unexecuted counterfactual must remain PREDICTED and unobserved');
  }
  if (record.timing === CounterfactualTiming.DECISION_TIME) {
    if (record.generatedLogicalTime > decision.logicalTime) {
      throw new CounterfactualVetoLedgerContractError('post-outcome prediction cannot be labeled decision-time');
    }
    if (!decision.sentinelProposal.predictorEvidenceRefs.includes(record.predictionRef)) {
      throw new CounterfactualVetoLedgerContractError('decision-time counterfactual must bind Stage 3F.1 predictor evidence');
    }
  }
  requireConfidence(record.confidence, 'counterfactual confidence');
  requireRecord(record.uncertainty, 'counterfactual uncertainty');
  assertNoExecutionSurface(record.predictedOutcome, 'predictedOutcome');
  assertNoExecutionSurface(record.predictedStateRef, 'predictedStateRef');
  normalizeProvenance(record.provenance, decision.environment);
  return record;
}

function verifyOutcomeRef(record, decision) {
  verifySeal(record, 'ledgerOutcomeBindingId', 'SENTINEL_LEDGER_OUTCOME_BINDING_V1');
  if (record.ledgerEntryId !== decision.ledgerEntryId
      || record.traceId !== decision.causalTraceRef.traceId
      || record.epistemicCategory !== EpistemicCategory.OBSERVED) {
    throw new CounterfactualVetoLedgerContractError('outcome is not bound to the authoritative causal trace');
  }
  requireString(record.outcomeId, 'outcomeId');
  requireString(record.authoritativeStateSnapshotId, 'authoritativeStateSnapshotId');
  normalizeProvenance(record.provenance, decision.environment);
  return record;
}

function verifyEvaluation(record, decision) {
  verifySeal(record, 'evaluationId', 'SENTINEL_LEDGER_EVALUATION_V1');
  if (record.ledgerEntryId !== decision.ledgerEntryId) throw new CounterfactualVetoLedgerContractError('evaluation ledger mismatch');
  requireEnum(record.status, LedgerEvaluationStatus, 'evaluation status');
  if (record.automaticRewardAssignment !== false || record.trainingEligibilityDecided !== false) {
    throw new CounterfactualVetoLedgerContractError('evaluation crossed the learning boundary');
  }
  normalizeProvenance(record.provenance, decision.environment);
  return record;
}

function projectLedger(decisionEpisode, attachments) {
  const decision = verifyDecisionReference(decisionEpisode);
  if (!Array.isArray(attachments)) throw new CounterfactualVetoLedgerContractError('attachments must be an array');
  const events = [...new Map(attachments.map((entry) => [verifyEvent(entry).eventId, entry])).values()]
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
  for (const event of events) {
    if (event.logicalTime < decision.logicalTime) throw new CounterfactualVetoLedgerContractError('attachment predates decision episode');
  }
  const selections = events.filter((entry) => entry.eventType === 'SELECTED_ACTION_ATTACHED')
    .map((entry) => verifySelectedAction(entry.payload, decision));
  const vetoes = events.filter((entry) => entry.eventType === 'VETO_ATTACHED')
    .map((entry) => verifyVeto(entry.payload, decision));
  const counterfactuals = events.filter((entry) => entry.eventType === 'COUNTERFACTUAL_ATTACHED')
    .map((entry) => verifyCounterfactual(entry.payload, decision));
  const outcomes = events.filter((entry) => entry.eventType === 'ACTUAL_OUTCOME_ATTACHED')
    .map((entry) => verifyOutcomeRef(entry.payload, decision));
  const evaluations = events.filter((entry) => entry.eventType === 'EVALUATION_ATTACHED')
    .map((entry) => verifyEvaluation(entry.payload, decision));
  const selectionConflict = new Set(selections.map((entry) => stableStringify({
    selectedAction: entry.selectedAction, selectedBy: entry.selectedBy, executedBy: entry.executedBy,
  }))).size > 1;
  const vetoConflict = new Set(vetoes.map((entry) => stableStringify({
    disposition: entry.disposition, actor: entry.actor,
    reason: {
      category: entry.reason.category, description: entry.reason.description,
      epistemicCategory: entry.reason.epistemicCategory, confidence: entry.reason.confidence,
    },
    policyRef: entry.policyRef,
  }))).size > 1;
  const outcomeConflict = outcomes.length > 1;
  const candidateGroups = new Map();
  for (const item of counterfactuals) {
    const key = stableStringify(item.candidateAction);
    candidateGroups.set(key, [...(candidateGroups.get(key) ?? []), item.counterfactualId]);
  }
  const counterfactualConflict = [...candidateGroups.values()].some((ids) => ids.length > 1);
  const evaluationStatuses = new Set(evaluations.map((entry) => entry.status));
  const evaluationConflict = evaluationStatuses.size > 1;
  const conflicted = selectionConflict || vetoConflict || outcomeConflict || counterfactualConflict || evaluationConflict;
  let lifecycleStatus = LedgerLifecycleStatus.OPEN;
  if (selections.length) lifecycleStatus = LedgerLifecycleStatus.SELECTION_BOUND;
  if (vetoes.length) lifecycleStatus = LedgerLifecycleStatus.VETO_BOUND;
  if (counterfactuals.length) lifecycleStatus = LedgerLifecycleStatus.COUNTERFACTUAL_BOUND;
  if (outcomes.length) lifecycleStatus = LedgerLifecycleStatus.OUTCOME_BOUND;
  if (evaluations.length) lifecycleStatus = LedgerLifecycleStatus.EVALUATED;
  if (conflicted) lifecycleStatus = LedgerLifecycleStatus.CONFLICTED;
  const latestEvaluation = evaluations.length === 0 ? null : [...evaluations]
    .sort((a, b) => a.logicalTime - b.logicalTime || a.evaluationId.localeCompare(b.evaluationId)).at(-1);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    contractId: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID,
    schemaVersion: COUNTERFACTUAL_VETO_LEDGER_SCHEMA_VERSION,
    contractHash: COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH,
    ledgerEntryId: decision.ledgerEntryId,
    environment: decision.environment,
    logicalTime: decision.logicalTime,
    decisionEpisode,
    attachments: events,
    projection: {
      lifecycleStatus,
      sentinelProposal: decision.sentinelProposal,
      selectedActionStatus: selections.length === 0 ? 'UNKNOWN' : selectionConflict ? 'CONFLICTED' : 'BOUND',
      comparisonStatus: selections.length === 0 ? ActionComparisonStatus.NO_SELECTED_ACTION
        : selectionConflict ? ActionComparisonStatus.UNKNOWN : selections[0].comparisonStatus,
      vetoStatus: vetoes.length === 0 ? VetoDisposition.UNKNOWN : vetoConflict ? 'CONFLICTED' : vetoes[0].disposition,
      outcomeStatus: outcomes.length === 0 ? 'UNKNOWN' : outcomeConflict ? 'CONFLICTED' : 'BOUND',
      evaluationStatus: conflicted ? LedgerEvaluationStatus.CONFLICTED
        : latestEvaluation?.status ?? LedgerEvaluationStatus.UNRESOLVED,
      selectedActions: selections,
      vetoes,
      counterfactuals,
      outcomes,
      evaluations,
      conflicts: {
        selectedActions: selectionConflict, vetoes: vetoConflict,
        counterfactuals: counterfactualConflict, outcomes: outcomeConflict, evaluations: evaluationConflict,
      },
      stage3f4Metadata: {
        evaluationResolved: !conflicted && latestEvaluation !== null
          && ![LedgerEvaluationStatus.UNRESOLVED, LedgerEvaluationStatus.UNKNOWN, LedgerEvaluationStatus.INCOMPARABLE]
            .includes(latestEvaluation.status),
        outcomeAuthoritative: outcomes.length === 1,
        calibrationSufficient: latestEvaluation?.calibrationSufficient ?? false,
        conflictFree: !conflicted,
        decisionTimePredictionAvailable: counterfactuals.some((entry) => entry.timing === CounterfactualTiming.DECISION_TIME),
        trainingEligibilityDecided: false,
      },
      disagreementImpliesNegativeReward: false,
      agreementImpliesCorrectness: false,
      automaticRewardAssignment: false,
      onlineLearningEnabled: false,
    },
    authority,
  };
  return deepFreeze({ ...body, ledgerDigest: `sha256:${sha256(body)}` });
}

export function createCounterfactualVetoLedger({ trace, calibration }) {
  return projectLedger(decisionReference(trace, calibration), []);
}

export function verifyCounterfactualVetoLedger(ledger) {
  if (!isRecord(ledger) || ledger.contractId !== COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID
      || ledger.schemaVersion !== COUNTERFACTUAL_VETO_LEDGER_SCHEMA_VERSION
      || ledger.contractHash !== COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH) {
    throw new CounterfactualVetoLedgerContractError('not a Sentinel Counterfactual/Veto Ledger v1 record');
  }
  const { ledgerDigest, ...body } = ledger;
  if (ledgerDigest !== `sha256:${sha256(body)}`) throw new CounterfactualVetoLedgerContractError('ledger digest mismatch');
  assertEvaluationOnly(ledger.authority);
  const rebuilt = projectLedger(ledger.decisionEpisode, ledger.attachments);
  if (stableStringify(rebuilt) !== stableStringify(ledger)) {
    throw new CounterfactualVetoLedgerContractError('ledger is digest-valid but non-canonical');
  }
  return true;
}

export function serializeCounterfactualVetoLedger(ledger) {
  verifyCounterfactualVetoLedger(ledger);
  return stableStringify(ledger);
}

function appendEvent(ledger, event) {
  verifyCounterfactualVetoLedger(ledger);
  verifyEvent(event);
  if (event.logicalTime < ledger.logicalTime) throw new CounterfactualVetoLedgerContractError('attachment predates decision episode');
  if (ledger.attachments.some((entry) => entry.eventId === event.eventId)) return ledger;
  return projectLedger(ledger.decisionEpisode, [...ledger.attachments, event]);
}

export function attachLedgerSelectedAction(ledger, {
  selectedAction, selectedBy, executedBy = null, logicalTime, actionRef, provenance,
}) {
  verifyCounterfactualVetoLedger(ledger);
  const action = canonicalAction(selectedAction, 'selectedAction');
  const body = {
    recordType: 'SENTINEL_LEDGER_SELECTED_ACTION_V1',
    ledgerEntryId: ledger.ledgerEntryId,
    selectedAction: action,
    selectedBy: normalizeActor(selectedBy, 'selectedBy'),
    executedBy: executedBy === null ? null : normalizeActor(executedBy, 'executedBy'),
    logicalTime: requireLogicalTime(logicalTime),
    actionRef: requireString(actionRef, 'actionRef'),
    comparisonStatus: compareAction(ledger.decisionEpisode.sentinelProposal, action),
    correctnessStatus: 'UNKNOWN',
    provenance: normalizeProvenance(provenance, ledger.environment),
  };
  const record = seal(body, 'selectedActionId');
  return appendEvent(ledger, createEvent('SELECTED_ACTION_ATTACHED', body.logicalTime, record));
}

export function attachLedgerVeto(ledger, {
  disposition, actor, reason = null, logicalTime, policyRef = null, provenance,
}) {
  verifyCounterfactualVetoLedger(ledger);
  let normalizedReason;
  if (reason === null) {
    normalizedReason = {
      category: VetoReasonCategory.UNKNOWN, description: null, epistemicCategory: EpistemicCategory.UNKNOWN,
      confidence: null, provenance: null,
    };
  } else {
    requireRecord(reason, 'reason');
    normalizedReason = {
      category: requireEnum(reason.category, VetoReasonCategory, 'veto reason category'),
      description: requireString(reason.description, 'reason.description'),
      epistemicCategory: requireEnum(reason.epistemicCategory, EpistemicCategory, 'reason.epistemicCategory'),
      confidence: requireConfidence(reason.confidence, 'reason.confidence'),
      provenance: normalizeProvenance(reason.provenance, ledger.environment, 'reason.provenance'),
    };
  }
  const body = {
    recordType: 'SENTINEL_LEDGER_VETO_V1', ledgerEntryId: ledger.ledgerEntryId,
    disposition: requireEnum(disposition, VetoDisposition, 'veto disposition'),
    actor: normalizeActor(actor, 'actor'), reason: canonicalize(normalizedReason),
    logicalTime: requireLogicalTime(logicalTime),
    policyRef: policyRef === null ? null : requireString(policyRef, 'policyRef'),
    negativeRewardAssigned: false,
    provenance: normalizeProvenance(provenance, ledger.environment),
  };
  const record = seal(body, 'vetoRecordId');
  return appendEvent(ledger, createEvent('VETO_ATTACHED', body.logicalTime, record));
}

export function attachLedgerCounterfactual(ledger, {
  candidateAction, predictionRef, predictionSource, predictedOutcome,
  predictedStateRef = null, predictedValue = null, predictedRisk = null,
  confidence, uncertainty, timing, generatedLogicalTime, logicalTime, provenance,
}) {
  verifyCounterfactualVetoLedger(ledger);
  requireRecord(predictionSource, 'predictionSource');
  requireRecord(uncertainty, 'uncertainty');
  const body = {
    recordType: 'SENTINEL_LEDGER_COUNTERFACTUAL_V1', ledgerEntryId: ledger.ledgerEntryId,
    candidateAction: canonicalAction(candidateAction, 'candidateAction'),
    predictionRef: requireString(predictionRef, 'predictionRef'),
    predictionSource: canonicalize({
      id: requireString(predictionSource.id, 'predictionSource.id'),
      version: requireString(predictionSource.version, 'predictionSource.version'),
    }),
    predictedOutcome: canonicalize(predictedOutcome),
    predictedStateRef: predictedStateRef === null ? null : canonicalize(predictedStateRef),
    predictedValue: predictedValue === null ? null : canonicalize(predictedValue),
    predictedRisk: predictedRisk === null ? null : canonicalize(predictedRisk),
    confidence: requireConfidence(confidence, 'confidence'), uncertainty: canonicalize(uncertainty),
    epistemicCategory: EpistemicCategory.PREDICTED,
    timing: requireEnum(timing, CounterfactualTiming, 'counterfactual timing'),
    generatedLogicalTime: requireLogicalTime(generatedLogicalTime, 'generatedLogicalTime'),
    logicalTime: requireLogicalTime(logicalTime),
    executed: false, observedOutcomeRef: null,
    provenance: normalizeProvenance(provenance, ledger.environment),
  };
  const record = seal(body, 'counterfactualId');
  verifyCounterfactual(record, ledger.decisionEpisode);
  return appendEvent(ledger, createEvent('COUNTERFACTUAL_ATTACHED', body.logicalTime, record));
}

export function attachLedgerActualOutcome(ledger, { trace, outcomeId }) {
  verifyCounterfactualVetoLedger(ledger);
  verifyCausalTrace(trace);
  if (trace.traceId !== ledger.decisionEpisode.causalTraceRef.traceId
      || trace.decisionTimeEvent.decisionEventId !== ledger.decisionEpisode.causalTraceRef.decisionTimeEventId) {
    throw new CounterfactualVetoLedgerContractError('trace mismatch');
  }
  if (trace.environment.identity !== ledger.environment.runtimeIdentity
      || trace.environment.version !== ledger.environment.environmentVersion) {
    throw new CounterfactualVetoLedgerContractError('outcome trace environment mismatch');
  }
  if (!trace.projection.outcomes.some((entry) => entry.outcomeId === outcomeId)) {
    throw new CounterfactualVetoLedgerContractError('unknown or missing causal-trace outcome ref');
  }
  let updated = ledger;
  for (const outcome of trace.projection.outcomes) {
    const body = {
      recordType: 'SENTINEL_LEDGER_OUTCOME_BINDING_V1', ledgerEntryId: ledger.ledgerEntryId,
      traceId: trace.traceId, outcomeId: outcome.outcomeId,
      authoritativeStateSnapshotId: outcome.authoritativeStateSnapshotId,
      outcomeStatus: outcome.observationCompleteness,
      epistemicCategory: EpistemicCategory.OBSERVED,
      logicalTime: outcome.logicalTime,
      provenance: normalizeProvenance({
        environmentId: ledger.environment.environmentId,
        environmentVersion: ledger.environment.environmentVersion,
        sourceId: outcome.provenance.sourceId,
        evidenceId: outcome.provenance.evidenceId,
      }, ledger.environment),
    };
    const record = seal(body, 'ledgerOutcomeBindingId');
    updated = appendEvent(updated, createEvent('ACTUAL_OUTCOME_ATTACHED', body.logicalTime, record));
  }
  return updated;
}

export function attachLedgerEvaluation(ledger, {
  calibration, requiredCapabilities, status, metrics = [], logicalTime, provenance,
}) {
  verifyCounterfactualVetoLedger(ledger);
  verifyEnvironmentCalibration(calibration);
  if (calibration.calibrationId !== ledger.decisionEpisode.calibrationRef.calibrationId
      || calibration.calibrationDigest !== ledger.decisionEpisode.calibrationRef.calibrationDigest) {
    throw new CounterfactualVetoLedgerContractError('calibration mismatch');
  }
  if (!Array.isArray(metrics)) throw new CounterfactualVetoLedgerContractError('metrics must be an array');
  const sufficiency = evaluateCalibrationSufficiency(calibration, requiredCapabilities);
  const conflicts = ledger.projection.conflicts;
  const conflicted = Object.values(conflicts).some(Boolean);
  const hasOutcome = ledger.projection.outcomes.length === 1;
  let resolvedStatus = requireEnum(status, LedgerEvaluationStatus, 'evaluation status');
  let comparisonNotValid = null;
  if (conflicted) resolvedStatus = LedgerEvaluationStatus.CONFLICTED;
  else if (!hasOutcome) resolvedStatus = LedgerEvaluationStatus.UNRESOLVED;
  else if (!sufficiency.sufficient) {
    resolvedStatus = LedgerEvaluationStatus.INCOMPARABLE;
    comparisonNotValid = 'CALIBRATION_INSUFFICIENT';
  }
  const normalizedMetrics = !hasOutcome || !sufficiency.sufficient || conflicted ? []
    : metrics.map((metric) => {
      requireRecord(metric, 'metric');
      const domain = requireString(metric.domain, 'metric.domain');
      if (!sufficiency.requiredCapabilities.some((entry) => entry.domain === domain)) {
        throw new CounterfactualVetoLedgerContractError('metric domain was not declared as a required capability');
      }
      requireString(metric.metricType, 'metric.metricType');
      requireString(metric.predictionRef, 'metric.predictionRef');
      requireString(metric.actualOutcomeRef, 'metric.actualOutcomeRef');
      if (!ledger.projection.outcomes.some((entry) => entry.outcomeId === metric.actualOutcomeRef)) {
        throw new CounterfactualVetoLedgerContractError('metric does not bind an actual outcome');
      }
      const predictionRefs = new Set([
        ...ledger.decisionEpisode.sentinelProposal.predictorEvidenceRefs,
        ...ledger.projection.counterfactuals.flatMap((entry) => [entry.counterfactualId, entry.predictionRef]),
      ]);
      if (!predictionRefs.has(metric.predictionRef)) {
        throw new CounterfactualVetoLedgerContractError('metric does not bind ledger prediction evidence');
      }
      assertNoExecutionSurface(metric.value, 'metric.value');
      return canonicalize(metric);
    });
  const definitiveStatuses = new Set([
    LedgerEvaluationStatus.SENTINEL_SUPPORTED, LedgerEvaluationStatus.SELECTED_ACTION_SUPPORTED,
    LedgerEvaluationStatus.BOTH_PLAUSIBLE, LedgerEvaluationStatus.BOTH_POOR,
  ]);
  if (definitiveStatuses.has(resolvedStatus) && normalizedMetrics.length === 0) {
    throw new CounterfactualVetoLedgerContractError('definitive evaluation requires outcome-grounded metrics');
  }
  const body = {
    recordType: 'SENTINEL_LEDGER_EVALUATION_V1', ledgerEntryId: ledger.ledgerEntryId,
    status: resolvedStatus, requestedStatus: status,
    calibrationId: calibration.calibrationId,
    calibrationSufficient: sufficiency.sufficient,
    calibrationSufficiencyRef: sufficiency.sufficiencyDigest,
    requiredCapabilities: sufficiency.requiredCapabilities,
    comparisonNotValid,
    metrics: [...new Map(normalizedMetrics.map((entry) => [stableStringify(entry), entry])).values()]
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
    actualOutcomeRefs: ledger.projection.outcomes.map((entry) => entry.outcomeId).sort(),
    logicalTime: requireLogicalTime(logicalTime),
    automaticRewardAssignment: false, trainingEligibilityDecided: false,
    provenance: normalizeProvenance(provenance, ledger.environment),
  };
  const record = seal(body, 'evaluationId');
  return appendEvent(ledger, createEvent('EVALUATION_ATTACHED', body.logicalTime, record));
}
