import { ContractError } from '../core/errors.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { EPISTEMIC_SCHEMA_HASH, createEpistemicRecord } from './epistemic-provenance-v1.js';
import { ACTION_SEMANTICS_SCHEMA_HASH } from './action-semantics-v1.js';

/* ===========================================================================
 * STAGE_3G_3 — SENTINEL_PREDICTION_LIFECYCLE_V1
 *
 * A specification-level lifecycle for predictions, built on SENTINEL_EPISTEMIC_PROVENANCE_V1. It is infrastructure, not an
 * expert: it holds no model, casts no vote and has no authority. It answers one question deterministically — may this
 * prediction still be used, and has reality resolved it? — from logical time and hashes only (no wall clock).
 *
 * A prediction is about the future of one action context (the executed action: E3; an unexecuted alternative: E4). It is
 * never written into the authoritative lane: toEpistemicRecord() yields an E3/E4 record, which the epistemic state admits to
 * the provisional lane (E3) or refuses (E4), exactly as the Stage 3G.1 promotion rules require.
 *
 * Statuses: VALID -> STALE -> (RESOLVED_CONFIRMED | RESOLVED_REFUTED | INVALID); VALID -> INVALID; VALID -> RESOLVED_*.
 * INVALID and RESOLVED_* are terminal. STALE predictions may still be resolved against reality (for FPE accounting) but may
 * not be used for a new decision.
 * ========================================================================= */

export const PREDICTION_LIFECYCLE_ID = 'SENTINEL_PREDICTION_LIFECYCLE_V1';
export const PredictionStatus = deepFreeze({ VALID: 'VALID', STALE: 'STALE', INVALID: 'INVALID', RESOLVED_CONFIRMED: 'RESOLVED_CONFIRMED', RESOLVED_REFUTED: 'RESOLVED_REFUTED' });
const TERMINAL = deepFreeze(['INVALID', 'RESOLVED_CONFIRMED', 'RESOLVED_REFUTED']);
export const PREDICTION_FIELDS = deepFreeze(['predictionId', 'sourceStateHash', 'actionContextHash', 'createdAtLogicalTick', 'targetHorizon', 'confidence',
  'validityConditions', 'invalidationConditions', 'provenance', 'epistemicClass', 'access', 'status']);

/** Declared, ordered rules. The first rule that fires decides the transition. */
export const LIFECYCLE_RULES = deepFreeze([
  { id: 'L1_TERMINAL_IS_FINAL', effect: 'an INVALID or RESOLVED_* prediction never changes status again' },
  { id: 'L2_ACTION_SEMANTICS_VERSION_CHANGED', effect: 'INVALID: the action contract the prediction assumed no longer applies' },
  { id: 'L3_ACTION_UNAVAILABLE', effect: 'INVALID: the predicted action (executed context) is no longer offered, or the offered action set changed before execution' },
  { id: 'L4_PRECONDITION_FALSE', effect: 'INVALID: a required precondition is now observed false' },
  { id: 'L5_REQUIRED_ENTITY_CHANGED', effect: 'INVALID: an entity the prediction depends on changed in a way the prediction did not account for (before the target tick)' },
  { id: 'L6_RESOLVED_BY_OBSERVATION', effect: 'RESOLVED_CONFIRMED / RESOLVED_REFUTED: an authoritative observation at or after the target tick agrees / contradicts (only for predictions about the executed action)' },
  { id: 'L7_CONTRADICTED_BEFORE_TARGET', effect: 'INVALID: an authoritative observation before the target tick contradicts an assumption of the prediction' },
  { id: 'L8_HORIZON_EXPIRED', effect: 'INVALID: the target tick has passed with no resolving observation (a counterfactual E4 prediction always ends here: its branch is never observed)' },
  { id: 'L9_SOURCE_SUPERSEDED', effect: 'STALE: a newer authoritative state than the prediction\'s source exists; the prediction may be resolved later but must not drive a new decision' },
  { id: 'L10_UNCHANGED', effect: 'status unchanged' },
]);
export const STALE_RULES = deepFreeze(['L9_SOURCE_SUPERSEDED']);
export const INVALIDATION_RULES = deepFreeze(['L2_ACTION_SEMANTICS_VERSION_CHANGED', 'L3_ACTION_UNAVAILABLE', 'L4_PRECONDITION_FALSE', 'L5_REQUIRED_ENTITY_CHANGED', 'L7_CONTRADICTED_BEFORE_TARGET', 'L8_HORIZON_EXPIRED']);

export class PredictionLifecycleError extends ContractError {}
const req = (cond, msg) => { if (!cond) throw new PredictionLifecycleError(msg); };
const isHash = (v) => typeof v === 'string' && v.length > 0;
const isTick = (v) => Number.isSafeInteger(v) && v >= 0;

/** Hash of an action context: the action (type, parameters, target), the offered action set and the semantics version. */
export function actionContextHash({ actionSignature, legalActionSetHash, actionSemanticsVersion = ACTION_SEMANTICS_SCHEMA_HASH, executed }) {
  return sha256({ actionSignature: canonicalize(actionSignature), legalActionSetHash, actionSemanticsVersion, executed: executed === true });
}

/**
 * Create a prediction. Every Stage 3G.3 field is required. `predicted` is { path, value } about targetTick =
 * createdAtLogicalTick + targetHorizon. executed=false makes it a counterfactual (E4).
 */
export function createPrediction({ sourceStateHash, actionSignature, legalActionSetHash, actionSemanticsVersion = ACTION_SEMANTICS_SCHEMA_HASH, executed,
  createdAtLogicalTick, targetHorizon, predicted, confidence, requiredEntities = {}, requiredPreconditions = [], provenance, access = 'DEPLOYABLE' }) {
  req(isHash(sourceStateHash), 'sourceStateHash is required');
  req(actionSignature && typeof actionSignature.actionType === 'string', 'actionSignature.actionType is required');
  req(isHash(legalActionSetHash), 'legalActionSetHash is required');
  req(typeof executed === 'boolean', 'executed must be boolean (E3 for the executed action, E4 for an unexecuted alternative)');
  req(isTick(createdAtLogicalTick), 'createdAtLogicalTick must be a non-negative safe integer');
  req(Number.isSafeInteger(targetHorizon) && targetHorizon >= 1, 'targetHorizon must be a positive safe integer (ticks ahead)');
  req(predicted && Array.isArray(predicted.path) && predicted.path.length > 0, 'predicted.path is required');
  req(typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1, 'confidence must be in [0,1]');
  req(provenance && isHash(provenance.producerId) && isHash(provenance.producerVersion), 'provenance.producerId and producerVersion are required');
  req(['DEPLOYABLE', 'PRIVILEGED', 'ORACLE'].includes(access), 'unknown access');
  stableStringify(predicted.value);
  const body = {
    lifecycleId: PREDICTION_LIFECYCLE_ID, sourceStateHash,
    actionContextHash: actionContextHash({ actionSignature, legalActionSetHash, actionSemanticsVersion, executed }),
    actionContext: canonicalize({ actionSignature, legalActionSetHash, actionSemanticsVersion, executed }),
    createdAtLogicalTick, targetHorizon, targetTick: createdAtLogicalTick + targetHorizon, predicted: canonicalize(predicted), confidence,
    validityConditions: canonicalize({ requiredEntities, requiredPreconditions: [...requiredPreconditions].sort(), actionSemanticsVersion, legalActionSetHash, sourceStateHash }),
    invalidationConditions: [...INVALIDATION_RULES, ...STALE_RULES],
    provenance: canonicalize({ ...provenance, epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH }),
    epistemicClass: executed ? 'E3' : 'E4', access, status: 'VALID', statusReason: null,
  };
  return deepFreeze({ ...body, predictionId: `sha256:${sha256(body)}` });
}

/**
 * Deterministic status transition. context: { logicalTick, currentSourceStateHash, actionSemanticsVersion, legalActionSetHash,
 * actionStillOffered, preconditions: { id: boolean }, entityHashes: { entityId: hash }, observation?: { logicalTick, path, value } }.
 * Returns a new frozen prediction (the id is unchanged: identity is the content at creation; status is lifecycle state).
 */
export function evaluatePrediction(prediction, context) {
  req(isTick(context?.logicalTick), 'context.logicalTick is required');
  const next = (status, statusReason) => deepFreeze({ ...prediction, status, statusReason });
  const v = prediction.validityConditions;
  if (TERMINAL.includes(prediction.status)) return prediction;                                           // L1
  if (context.actionSemanticsVersion !== undefined && context.actionSemanticsVersion !== v.actionSemanticsVersion) return next('INVALID', 'L2_ACTION_SEMANTICS_VERSION_CHANGED');
  const beforeExecution = context.logicalTick === prediction.createdAtLogicalTick;
  if (context.actionStillOffered === false || (beforeExecution && context.legalActionSetHash !== undefined && context.legalActionSetHash !== v.legalActionSetHash)) return next('INVALID', 'L3_ACTION_UNAVAILABLE');
  for (const id of v.requiredPreconditions) if (context.preconditions && context.preconditions[id] === false) return next('INVALID', 'L4_PRECONDITION_FALSE');
  const obs = context.observation;
  const samePath = obs && JSON.stringify(obs.path) === JSON.stringify(prediction.predicted.path);
  if (context.logicalTick < prediction.targetTick) {
    for (const [id, h] of Object.entries(v.requiredEntities)) if (context.entityHashes && context.entityHashes[id] !== undefined && context.entityHashes[id] !== h) return next('INVALID', 'L5_REQUIRED_ENTITY_CHANGED');
  }
  if (samePath && obs.logicalTick >= prediction.targetTick && prediction.epistemicClass === 'E3') {
    return next(stableStringify(obs.value) === stableStringify(prediction.predicted.value) ? 'RESOLVED_CONFIRMED' : 'RESOLVED_REFUTED', 'L6_RESOLVED_BY_OBSERVATION');
  }
  if (samePath && obs.logicalTick < prediction.targetTick && obs.contradictsAssumption === true) return next('INVALID', 'L7_CONTRADICTED_BEFORE_TARGET');
  if (context.logicalTick > prediction.targetTick) return next('INVALID', 'L8_HORIZON_EXPIRED');
  if (context.currentSourceStateHash !== undefined && context.currentSourceStateHash !== prediction.sourceStateHash) return next('STALE', 'L9_SOURCE_SUPERSEDED');
  return prediction;                                                                                      // L10
}

/** A prediction may inform a NEW decision only while VALID. Resolution never makes it usable again. */
export const usableForDecision = (p) => p.status === 'VALID';

/** The epistemic record of a prediction: E3 (executed context) or E4 (counterfactual). Never E0/E1/E2. */
export function toEpistemicRecord(prediction) {
  return createEpistemicRecord({ path: prediction.predicted.path, value: prediction.predicted.value, epistemicClass: prediction.epistemicClass,
    source: { sourceId: prediction.provenance.producerId, kind: prediction.epistemicClass === 'E3' ? 'PREDICTIVE_MODEL' : 'COUNTERFACTUAL_MODEL', version: prediction.provenance.producerVersion },
    sourceStateHash: prediction.sourceStateHash, timestamp: { logicalTime: prediction.createdAtLogicalTick, targetTime: prediction.targetTick },
    confidence: prediction.confidence, access: prediction.access });
}

export const PREDICTION_LIFECYCLE_SCHEMA = deepFreeze({
  schemaId: PREDICTION_LIFECYCLE_ID, schemaVersion: 1, fields: PREDICTION_FIELDS, statuses: Object.keys(PredictionStatus), terminal: TERMINAL,
  rules: LIFECYCLE_RULES, staleRules: STALE_RULES, invalidationRules: INVALIDATION_RULES,
  time: 'logical ticks only; no wall-clock input anywhere in the lifecycle',
  isolation: 'predictions enter epistemic state only as E3 (provisional lane) or E4 (refused); they never occupy or overwrite the authoritative lane',
  role: 'INFRASTRUCTURE: no model, no vote, no authority', epistemicSchemaHash: EPISTEMIC_SCHEMA_HASH, actionSemanticsSchemaHash: ACTION_SEMANTICS_SCHEMA_HASH,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
});
export const PREDICTION_LIFECYCLE_SCHEMA_HASH = sha256(PREDICTION_LIFECYCLE_SCHEMA);
