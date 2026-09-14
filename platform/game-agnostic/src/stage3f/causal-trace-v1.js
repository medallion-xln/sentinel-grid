import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { ContractError } from '../core/errors.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { assertNoExecutionSurface } from '../experts/expert-contract.js';
import {
  EpistemicCategory,
  WORLD_STATE_CONTRACT_ID,
  verifyWorldStateSnapshot,
} from './world-state-v1.js';

export const CAUSAL_TRACE_SCHEMA_VERSION = 1;
export const CAUSAL_TRACE_CONTRACT_ID = 'SENTINEL_CAUSAL_TRACE_V1';

export const TraceRelationshipType = deepFreeze({
  TEMPORAL_LINK: 'TEMPORAL_LINK',
  DERIVATION_LINK: 'DERIVATION_LINK',
  DECISION_DEPENDENCY: 'DECISION_DEPENDENCY',
  ACTION_BINDING: 'ACTION_BINDING',
  OUTCOME_BINDING: 'OUTCOME_BINDING',
  CAUSAL_CLAIM: 'CAUSAL_CLAIM',
});

export const AttributionStatus = deepFreeze({
  ESTABLISHED: 'ESTABLISHED',
  SUPPORTED: 'SUPPORTED',
  PLAUSIBLE: 'PLAUSIBLE',
  CONFLICTED: 'CONFLICTED',
  UNKNOWN: 'UNKNOWN',
});

export const TraceLifecycleStatus = deepFreeze({
  OPEN: 'OPEN',
  ACTION_BOUND: 'ACTION_BOUND',
  OUTCOME_BOUND: 'OUTCOME_BOUND',
  ATTRIBUTION_AVAILABLE: 'ATTRIBUTION_AVAILABLE',
  INCOMPLETE: 'INCOMPLETE',
  CONFLICTED: 'CONFLICTED',
});

export const ActionMatchStatus = deepFreeze({
  MATCH: 'MATCH',
  PARTIAL_MATCH: 'PARTIAL_MATCH',
  DIFFERENT_ACTION: 'DIFFERENT_ACTION',
  NO_SENTINEL_RECOMMENDATION: 'NO_SENTINEL_RECOMMENDATION',
  UNKNOWN: 'UNKNOWN',
});

export const FailureAttributionCategory = deepFreeze({
  OBSERVATION_FAILURE: 'OBSERVATION_FAILURE',
  STATE_REPRESENTATION_FAILURE: 'STATE_REPRESENTATION_FAILURE',
  FEATURE_DERIVATION_FAILURE: 'FEATURE_DERIVATION_FAILURE',
  PREDICTION_FAILURE: 'PREDICTION_FAILURE',
  ROUTING_FAILURE: 'ROUTING_FAILURE',
  RECOMMENDATION_FAILURE: 'RECOMMENDATION_FAILURE',
  INCUMBENT_DIVERGENCE: 'INCUMBENT_DIVERGENCE',
  OUTCOME_ATTRIBUTION_UNCERTAIN: 'OUTCOME_ATTRIBUTION_UNCERTAIN',
  NO_FAILURE_DETERMINED: 'NO_FAILURE_DETERMINED',
  UNKNOWN: 'UNKNOWN',
});

export const CAUSAL_TRACE_CONTRACT = deepFreeze({
  contractId: CAUSAL_TRACE_CONTRACT_ID,
  schemaVersion: CAUSAL_TRACE_SCHEMA_VERSION,
  stateContract: WORLD_STATE_CONTRACT_ID,
  relationships: Object.values(TraceRelationshipType),
  attributionStatuses: Object.values(AttributionStatus),
  lifecycleStatuses: Object.values(TraceLifecycleStatus),
  traceCompletenessImpliesCausalCertainty: false,
  appendOrientedEvidence: true,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const CAUSAL_TRACE_CONTRACT_HASH = sha256(CAUSAL_TRACE_CONTRACT);

export class CausalTraceContractError extends ContractError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new CausalTraceContractError(`${name} must be an object`);
  return value;
};
const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') throw new CausalTraceContractError(`${name} must be a non-empty string`);
  return value;
};
const requireSha256Digest = (value, name) => {
  requireString(value, name);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new CausalTraceContractError(`${name} must be a canonical sha256 digest`);
  }
  return value;
};
const requireLogicalTime = (value, name = 'logicalTime') => {
  if (!Number.isSafeInteger(value) || value < 0) throw new CausalTraceContractError(`${name} must be a non-negative safe integer`);
  return value;
};
const requireConfidence = (value, name, nullable = false) => {
  if (nullable && value === null) return value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new CausalTraceContractError(`${name} must be in [0,1]${nullable ? ' or null' : ''}`);
  }
  return value;
};
const requireEnum = (value, enumeration, name) => {
  if (!Object.values(enumeration).includes(value)) throw new CausalTraceContractError(`unsupported ${name}: ${value}`);
  return value;
};

function normalizeEnvironment(environment) {
  requireRecord(environment, 'environment');
  return deepFreeze({
    identity: requireString(environment.identity, 'environment.identity'),
    version: requireString(environment.version, 'environment.version'),
  });
}

function sameEnvironment(a, b) {
  return a.identity === b.identity && a.version === b.version;
}

function requireEnvironment(actual, expected, name) {
  const normalized = normalizeEnvironment(actual);
  if (!sameEnvironment(normalized, expected)) {
    throw new CausalTraceContractError(`${name} environment identity/version mismatch`, { expected, actual: normalized });
  }
  return normalized;
}

function normalizeProvenance(provenance, environment, name = 'provenance') {
  requireRecord(provenance, name);
  assertNoExecutionSurface(provenance, name);
  requireEnvironment({
    identity: provenance.environmentIdentity,
    version: provenance.environmentVersion,
  }, environment, name);
  requireString(provenance.sourceId, `${name}.sourceId`);
  requireString(provenance.evidenceId, `${name}.evidenceId`);
  return canonicalize(provenance);
}

function seal(body, idField) {
  return deepFreeze({ ...body, [idField]: `sha256:${sha256(body)}` });
}

function verifySeal(record, idField, recordType) {
  requireRecord(record, recordType);
  const { [idField]: identity, ...body } = record;
  if (body.recordType !== recordType || identity !== `sha256:${sha256(body)}`) {
    throw new CausalTraceContractError(`${recordType} identity mismatch`);
  }
  return record;
}

function canonicalAction(action, name, nullable = false) {
  if (nullable && action === null) return null;
  requireRecord(action, name);
  requireString(action.actionId, `${name}.actionId`);
  assertNoExecutionSurface(action, name);
  return canonicalize(action);
}

export function createObservationEvidence({ observationId, environment, logicalTime, observationDigest, provenance }) {
  const bound = normalizeEnvironment(environment);
  const body = {
    recordType: 'TRACE_OBSERVATION_EVIDENCE_V1',
    observationId: requireString(observationId, 'observationId'),
    environment: bound,
    logicalTime: requireLogicalTime(logicalTime),
    observationDigest: requireSha256Digest(observationDigest, 'observationDigest'),
    provenance: normalizeProvenance(provenance, bound),
  };
  return seal(body, 'observationEvidenceId');
}

export function createFeatureDerivationEvidence({
  worldStateSnapshot,
  featureContract,
  featureValues = null,
  derivationDigest = null,
  implementation,
  provenance,
}) {
  verifyWorldStateSnapshot(worldStateSnapshot);
  const environment = normalizeEnvironment(worldStateSnapshot.environment);
  requireRecord(featureContract, 'featureContract');
  requireRecord(implementation, 'implementation');
  const values = featureValues === null ? null : canonicalize(requireRecord(featureValues, 'featureValues'));
  const computedDigest = values === null ? null : `sha256:${sha256(values)}`;
  if (values === null && derivationDigest === null) {
    throw new CausalTraceContractError('feature values or a deterministic derivation digest are required');
  }
  if (computedDigest !== null && derivationDigest !== null && computedDigest !== derivationDigest) {
    throw new CausalTraceContractError('feature derivation digest mismatch');
  }
  if (derivationDigest !== null) requireSha256Digest(derivationDigest, 'derivationDigest');
  const body = {
    recordType: 'TRACE_FEATURE_DERIVATION_V1',
    environment,
    worldStateSnapshotId: worldStateSnapshot.snapshotId,
    featureContract: canonicalize({
      id: requireString(featureContract.id, 'featureContract.id'),
      version: requireString(featureContract.version, 'featureContract.version'),
      hash: requireString(featureContract.hash, 'featureContract.hash'),
    }),
    featureValues: values,
    derivationDigest: derivationDigest ?? computedDigest,
    implementation: canonicalize({
      id: requireString(implementation.id, 'implementation.id'),
      version: requireString(implementation.version, 'implementation.version'),
      hash: requireString(implementation.hash, 'implementation.hash'),
    }),
    provenance: normalizeProvenance(provenance, environment),
  };
  return seal(body, 'featureDerivationId');
}

export function createPredictorEvidence({
  worldStateSnapshot,
  predictor,
  outputSummary,
  confidence,
  uncertainty,
  provenance,
}) {
  verifyWorldStateSnapshot(worldStateSnapshot);
  const environment = normalizeEnvironment(worldStateSnapshot.environment);
  requireRecord(predictor, 'predictor');
  requireRecord(uncertainty, 'uncertainty');
  requireString(uncertainty.status, 'uncertainty.status');
  requireRecord(outputSummary, 'outputSummary');
  assertNoExecutionSurface(outputSummary, 'outputSummary');
  const body = {
    recordType: 'TRACE_PREDICTOR_EVIDENCE_V1',
    environment,
    worldStateSnapshotId: worldStateSnapshot.snapshotId,
    predictor: canonicalize({
      id: requireString(predictor.id, 'predictor.id'),
      version: requireString(predictor.version, 'predictor.version'),
    }),
    outputSummary: canonicalize(outputSummary),
    confidence: requireConfidence(confidence, 'confidence'),
    uncertainty: canonicalize(uncertainty),
    epistemicCategory: EpistemicCategory.PREDICTED,
    provenance: normalizeProvenance(provenance, environment),
  };
  return seal(body, 'predictorEvidenceId');
}

export function createRouterEvaluationEvidence({
  featureDerivation,
  predictorEvidence = [],
  router,
  score,
  threshold,
  selectedRoute,
  fallback,
  provenance,
}) {
  verifySeal(featureDerivation, 'featureDerivationId', 'TRACE_FEATURE_DERIVATION_V1');
  if (!Array.isArray(predictorEvidence)) throw new CausalTraceContractError('predictorEvidence must be an array');
  predictorEvidence.forEach((entry) => verifySeal(entry, 'predictorEvidenceId', 'TRACE_PREDICTOR_EVIDENCE_V1'));
  const environment = normalizeEnvironment(featureDerivation.environment);
  for (const entry of predictorEvidence) {
    requireEnvironment(entry.environment, environment, 'predictorEvidence');
    if (entry.worldStateSnapshotId !== featureDerivation.worldStateSnapshotId) {
      throw new CausalTraceContractError('predictor evidence references a different world-state snapshot');
    }
  }
  requireRecord(router, 'router');
  requireRecord(fallback, 'fallback');
  assertNoExecutionSurface(fallback, 'fallback');
  const body = {
    recordType: 'TRACE_ROUTER_EVALUATION_V1',
    environment,
    featureDerivationId: featureDerivation.featureDerivationId,
    predictorEvidenceIds: [...new Set(predictorEvidence.map((entry) => entry.predictorEvidenceId))].sort(),
    router: canonicalize({
      id: requireString(router.id, 'router.id'),
      version: requireString(router.version, 'router.version'),
      hash: requireString(router.hash, 'router.hash'),
    }),
    score: requireConfidence(score, 'score'),
    threshold: requireConfidence(threshold, 'threshold'),
    selectedRoute: requireString(selectedRoute, 'selectedRoute'),
    fallback: canonicalize(fallback),
    provenance: normalizeProvenance(provenance, environment),
  };
  return seal(body, 'routerEvaluationId');
}

export function createRecommendationEvidence({
  routerEvaluation,
  proposedAction,
  recommendedPath,
  confidence,
  uncertainty,
  abstained = false,
  provenance,
}) {
  verifySeal(routerEvaluation, 'routerEvaluationId', 'TRACE_ROUTER_EVALUATION_V1');
  if (typeof abstained !== 'boolean') throw new CausalTraceContractError('abstained must be boolean');
  if (abstained !== (proposedAction === null)) {
    throw new CausalTraceContractError('abstained recommendations must use proposedAction=null and non-abstentions must propose an action');
  }
  requireRecord(uncertainty, 'uncertainty');
  requireString(uncertainty.status, 'uncertainty.status');
  const environment = normalizeEnvironment(routerEvaluation.environment);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'TRACE_SHADOW_RECOMMENDATION_V1',
    environment,
    routerEvaluationId: routerEvaluation.routerEvaluationId,
    proposedAction: canonicalAction(proposedAction, 'proposedAction', true),
    recommendedPath: requireString(recommendedPath, 'recommendedPath'),
    confidence: requireConfidence(confidence, 'confidence', true),
    uncertainty: canonicalize(uncertainty),
    abstained,
    authority,
    dispatchPermitted: false,
    provenance: normalizeProvenance(provenance, environment),
  };
  return seal(body, 'recommendationId');
}

export function createTraceEdge({
  environment,
  sourceRef,
  targetRef,
  relationshipType,
  provenance,
  confidence = null,
  attributionStatus,
  causalBasis = null,
}) {
  const bound = normalizeEnvironment(environment);
  const type = requireEnum(relationshipType, TraceRelationshipType, 'relationship type');
  const status = requireEnum(attributionStatus, AttributionStatus, 'attribution status');
  let normalizedBasis = null;
  if (type === TraceRelationshipType.CAUSAL_CLAIM) {
    requireRecord(causalBasis, 'causalBasis');
    requireString(causalBasis.method, 'causalBasis.method');
    if (!Array.isArray(causalBasis.evidenceRefs) || causalBasis.evidenceRefs.length === 0) {
      throw new CausalTraceContractError('CAUSAL_CLAIM requires explicit evidenceRefs');
    }
    causalBasis.evidenceRefs.forEach((entry) => requireString(entry, 'causalBasis.evidenceRefs[]'));
    if (status === AttributionStatus.UNKNOWN) {
      throw new CausalTraceContractError('CAUSAL_CLAIM cannot use UNKNOWN attribution status');
    }
    normalizedBasis = canonicalize({
      ...causalBasis,
      evidenceRefs: [...new Set(causalBasis.evidenceRefs)].sort(),
    });
  } else if (causalBasis !== null) {
    throw new CausalTraceContractError('causalBasis is valid only for an explicit CAUSAL_CLAIM');
  }
  const body = {
    recordType: 'TRACE_RELATIONSHIP_EDGE_V1',
    environment: bound,
    sourceRef: requireString(sourceRef, 'sourceRef'),
    targetRef: requireString(targetRef, 'targetRef'),
    relationshipType: type,
    attributionStatus: status,
    confidence: requireConfidence(confidence, 'confidence', true),
    provenance: normalizeProvenance(provenance, bound),
    causalBasis: normalizedBasis,
  };
  return seal(body, 'edgeId');
}

function derivedProvenance(environment, relationshipType, sourceRef, targetRef) {
  return {
    environmentIdentity: environment.identity,
    environmentVersion: environment.version,
    sourceId: CAUSAL_TRACE_CONTRACT_ID,
    evidenceId: `${relationshipType}:${sourceRef}:${targetRef}`,
  };
}

function automaticEdge(environment, sourceRef, targetRef, relationshipType, attributionStatus, confidence = null) {
  return createTraceEdge({
    environment, sourceRef, targetRef, relationshipType, attributionStatus, confidence,
    provenance: derivedProvenance(environment, relationshipType, sourceRef, targetRef),
  });
}

function requireCanonicalRecord(actual, expected, recordType) {
  if (stableStringify(actual) !== stableStringify(expected)) {
    throw new CausalTraceContractError(`${recordType} is digest-valid but semantically invalid`);
  }
  return actual;
}

function verifyDecisionBindings(decision) {
  const observation = verifySeal(decision.observationEvidence, 'observationEvidenceId', 'TRACE_OBSERVATION_EVIDENCE_V1');
  verifyWorldStateSnapshot(decision.worldStateSnapshot);
  const feature = verifySeal(decision.featureDerivation, 'featureDerivationId', 'TRACE_FEATURE_DERIVATION_V1');
  const predictors = decision.predictorEvidence;
  if (!Array.isArray(predictors)) throw new CausalTraceContractError('predictorEvidence must be an array');
  predictors.forEach((entry) => verifySeal(entry, 'predictorEvidenceId', 'TRACE_PREDICTOR_EVIDENCE_V1'));
  const router = verifySeal(decision.routerEvaluation, 'routerEvaluationId', 'TRACE_ROUTER_EVALUATION_V1');
  const recommendation = verifySeal(decision.recommendation, 'recommendationId', 'TRACE_SHADOW_RECOMMENDATION_V1');
  const environment = normalizeEnvironment(decision.worldStateSnapshot.environment);
  requireCanonicalRecord(observation, createObservationEvidence({
    observationId: observation.observationId,
    environment,
    logicalTime: observation.logicalTime,
    observationDigest: observation.observationDigest,
    provenance: observation.provenance,
  }), observation.recordType);
  requireCanonicalRecord(feature, createFeatureDerivationEvidence({
    worldStateSnapshot: decision.worldStateSnapshot,
    featureContract: feature.featureContract,
    featureValues: feature.featureValues,
    derivationDigest: feature.derivationDigest,
    implementation: feature.implementation,
    provenance: feature.provenance,
  }), feature.recordType);
  predictors.forEach((predictor) => requireCanonicalRecord(predictor, createPredictorEvidence({
    worldStateSnapshot: decision.worldStateSnapshot,
    predictor: predictor.predictor,
    outputSummary: predictor.outputSummary,
    confidence: predictor.confidence,
    uncertainty: predictor.uncertainty,
    provenance: predictor.provenance,
  }), predictor.recordType));
  requireCanonicalRecord(router, createRouterEvaluationEvidence({
    featureDerivation: feature,
    predictorEvidence: predictors,
    router: router.router,
    score: router.score,
    threshold: router.threshold,
    selectedRoute: router.selectedRoute,
    fallback: router.fallback,
    provenance: router.provenance,
  }), router.recordType);
  requireCanonicalRecord(recommendation, createRecommendationEvidence({
    routerEvaluation: router,
    proposedAction: recommendation.proposedAction,
    recommendedPath: recommendation.recommendedPath,
    confidence: recommendation.confidence,
    uncertainty: recommendation.uncertainty,
    abstained: recommendation.abstained,
    provenance: recommendation.provenance,
  }), recommendation.recordType);
  for (const [name, candidate] of [
    ['observationEvidence', observation], ['featureDerivation', feature], ['routerEvaluation', router],
    ['recommendation', recommendation], ...predictors.map((entry) => ['predictorEvidence', entry]),
  ]) requireEnvironment(candidate.environment, environment, name);
  if (observation.logicalTime !== decision.worldStateSnapshot.time.logicalTime) {
    throw new CausalTraceContractError('observation and world-state logical time mismatch');
  }
  if (feature.worldStateSnapshotId !== decision.worldStateSnapshot.snapshotId) {
    throw new CausalTraceContractError('feature derivation is not bound to the decision world-state snapshot');
  }
  const predictorIds = predictors.map((entry) => entry.predictorEvidenceId).sort();
  if (stableStringify(router.predictorEvidenceIds) !== stableStringify(predictorIds)
      || router.featureDerivationId !== feature.featureDerivationId) {
    throw new CausalTraceContractError('router inputs are not bound to the decision evidence');
  }
  if (recommendation.routerEvaluationId !== router.routerEvaluationId) {
    throw new CausalTraceContractError('recommendation is not bound to the router evaluation');
  }
  assertEvaluationOnly(recommendation.authority);
  return environment;
}

function decisionEdges(decision, environment) {
  const edges = [
    automaticEdge(environment, decision.observationEvidence.observationEvidenceId,
      decision.worldStateSnapshot.snapshotId, TraceRelationshipType.TEMPORAL_LINK, AttributionStatus.ESTABLISHED),
    automaticEdge(environment, decision.worldStateSnapshot.snapshotId,
      decision.featureDerivation.featureDerivationId, TraceRelationshipType.DERIVATION_LINK, AttributionStatus.ESTABLISHED),
    automaticEdge(environment, decision.featureDerivation.featureDerivationId,
      decision.routerEvaluation.routerEvaluationId, TraceRelationshipType.DECISION_DEPENDENCY, AttributionStatus.ESTABLISHED),
    automaticEdge(environment, decision.routerEvaluation.routerEvaluationId,
      decision.recommendation.recommendationId, TraceRelationshipType.DECISION_DEPENDENCY, AttributionStatus.ESTABLISHED),
  ];
  for (const predictor of decision.predictorEvidence) {
    edges.push(automaticEdge(environment, decision.worldStateSnapshot.snapshotId,
      predictor.predictorEvidenceId, TraceRelationshipType.DERIVATION_LINK, AttributionStatus.ESTABLISHED));
    edges.push(automaticEdge(environment, predictor.predictorEvidenceId,
      decision.routerEvaluation.routerEvaluationId, TraceRelationshipType.DECISION_DEPENDENCY, AttributionStatus.ESTABLISHED));
  }
  return edges;
}

function matchAction(recommendation, selectedAction) {
  if (recommendation.abstained || recommendation.proposedAction === null) return ActionMatchStatus.NO_SENTINEL_RECOMMENDATION;
  if (stableStringify(recommendation.proposedAction) === stableStringify(selectedAction)) return ActionMatchStatus.MATCH;
  if (recommendation.proposedAction.actionId === selectedAction.actionId) return ActionMatchStatus.PARTIAL_MATCH;
  return ActionMatchStatus.DIFFERENT_ACTION;
}

function createEvent(eventType, logicalTime, payload) {
  return seal({ recordType: 'TRACE_APPEND_EVENT_V1', eventType, logicalTime, payload }, 'eventId');
}

function verifyEvent(event) {
  verifySeal(event, 'eventId', 'TRACE_APPEND_EVENT_V1');
  requireLogicalTime(event.logicalTime, 'event.logicalTime');
  if (!['INCUMBENT_ACTION_ATTACHED', 'OUTCOME_ATTACHED', 'ATTRIBUTION_ATTACHED', 'INSTRUMENTATION_FAILURE'].includes(event.eventType)) {
    throw new CausalTraceContractError(`unsupported trace event type: ${event.eventType}`);
  }
  return event;
}

function verifyIncumbentAction(record, decision, traceId, environment) {
  verifySeal(record, 'incumbentActionId', 'TRACE_INCUMBENT_ACTION_V1');
  requireEnvironment(record.environment, environment, record.recordType);
  if (record.traceId !== traceId || record.actionSlotId !== `${traceId}:INCUMBENT_ACTION`
      || record.actor !== 'INCUMBENT') {
    throw new CausalTraceContractError('incumbent action is not bound to this trace action slot');
  }
  requireLogicalTime(record.logicalTime, 'incumbentAction.logicalTime');
  const action = canonicalAction(record.selectedAction, 'incumbentAction.selectedAction');
  if (record.matchingRecommendationStatus !== matchAction(decision.recommendation, action)) {
    throw new CausalTraceContractError('incumbent action recommendation match status is invalid');
  }
  normalizeProvenance(record.provenance, environment, 'incumbentAction.provenance');
  return record;
}

function verifyOutcome(record, traceId, environment) {
  verifySeal(record, 'outcomeId', 'TRACE_OUTCOME_EVIDENCE_V1');
  requireEnvironment(record.environment, environment, record.recordType);
  if (record.traceId !== traceId || record.outcomeSlotId !== `${traceId}:OUTCOME`
      || record.epistemicCategory !== EpistemicCategory.OBSERVED) {
    throw new CausalTraceContractError('outcome evidence is not authoritatively bound to this trace outcome slot');
  }
  requireSha256Digest(record.authoritativeStateSnapshotId, 'outcome.authoritativeStateSnapshotId');
  requireLogicalTime(record.logicalTime, 'outcome.logicalTime');
  if (!['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(record.observationCompleteness)) {
    throw new CausalTraceContractError(`unsupported observationCompleteness: ${record.observationCompleteness}`);
  }
  assertNoExecutionSurface(record.outcomeSummary, 'outcome.outcomeSummary');
  normalizeProvenance(record.provenance, environment, 'outcome.provenance');
  return record;
}

function verifyAttribution(record, traceId, environment) {
  verifySeal(record, 'attributionId', 'TRACE_ATTRIBUTION_V1');
  requireEnvironment(record.environment, environment, record.recordType);
  if (record.traceId !== traceId) throw new CausalTraceContractError('attribution is not bound to this trace');
  requireEnum(record.status, AttributionStatus, 'attribution status');
  requireEnum(record.failureCategory, FailureAttributionCategory, 'failure attribution category');
  requireString(record.explanation, 'attribution.explanation');
  requireLogicalTime(record.logicalTime, 'attribution.logicalTime');
  requireConfidence(record.confidence, 'attribution.confidence', true);
  if (!Array.isArray(record.evidenceRefs)) throw new CausalTraceContractError('attribution.evidenceRefs must be an array');
  record.evidenceRefs.forEach((entry) => requireString(entry, 'attribution.evidenceRefs[]'));
  const canonicalEvidenceRefs = [...new Set(record.evidenceRefs)].sort();
  if (stableStringify(record.evidenceRefs) !== stableStringify(canonicalEvidenceRefs)) {
    throw new CausalTraceContractError('attribution evidenceRefs are not canonical');
  }
  if (record.causalClaim !== null) {
    const edge = createTraceEdge({
      environment,
      sourceRef: record.causalClaim.sourceRef,
      targetRef: record.causalClaim.targetRef,
      relationshipType: TraceRelationshipType.CAUSAL_CLAIM,
      attributionStatus: record.status,
      confidence: record.confidence,
      provenance: record.provenance,
      causalBasis: record.causalClaim.basis,
    });
    if (stableStringify(record.causalClaim.basis) !== stableStringify(edge.causalBasis)) {
      throw new CausalTraceContractError('causal claim basis is not canonical');
    }
  }
  normalizeProvenance(record.provenance, environment, 'attribution.provenance');
  return record;
}

function verifyInstrumentationFailure(record, traceId, environment) {
  verifySeal(record, 'failureEvidenceId', 'TRACE_INSTRUMENTATION_FAILURE_V1');
  requireEnvironment(record.environment, environment, record.recordType);
  if (record.traceId !== traceId) throw new CausalTraceContractError('instrumentation failure is not bound to this trace');
  requireString(record.failureType, 'instrumentationFailure.failureType');
  requireString(record.reason, 'instrumentationFailure.reason');
  requireLogicalTime(record.logicalTime, 'instrumentationFailure.logicalTime');
  normalizeProvenance(record.provenance, environment, 'instrumentationFailure.provenance');
  return record;
}

function projectTrace(decisionEvent, attachments) {
  verifySeal(decisionEvent, 'decisionEventId', 'TRACE_DECISION_TIME_EVIDENCE_V1');
  const decision = decisionEvent.decisionTimeEvidence;
  const environment = verifyDecisionBindings(decision);
  const events = [...new Map(attachments.map((event) => [verifyEvent(event).eventId, event])).values()]
    .sort((a, b) => a.eventId.localeCompare(b.eventId));
  const actions = events.filter((event) => event.eventType === 'INCUMBENT_ACTION_ATTACHED')
    .map((event) => verifyIncumbentAction(event.payload, decision, decisionEvent.traceId, environment));
  const outcomes = events.filter((event) => event.eventType === 'OUTCOME_ATTACHED')
    .map((event) => verifyOutcome(event.payload, decisionEvent.traceId, environment));
  const attributions = events.filter((event) => event.eventType === 'ATTRIBUTION_ATTACHED')
    .map((event) => verifyAttribution(event.payload, decisionEvent.traceId, environment));
  const failures = events.filter((event) => event.eventType === 'INSTRUMENTATION_FAILURE')
    .map((event) => verifyInstrumentationFailure(event.payload, decisionEvent.traceId, environment));
  for (const event of events) {
    if (event.logicalTime !== event.payload.logicalTime) {
      throw new CausalTraceContractError('append event logical time does not match its payload');
    }
    if (event.logicalTime < decision.worldStateSnapshot.time.logicalTime) {
      throw new CausalTraceContractError('attachment predates decision-time evidence');
    }
  }
  const actionConflict = new Set(actions.map((entry) => entry.incumbentActionId)).size > 1;
  const outcomeConflict = new Set(outcomes.map((entry) => entry.outcomeId)).size > 1;
  const edges = decisionEdges(decision, environment);
  for (const action of actions) {
    edges.push(automaticEdge(environment, decision.recommendation.recommendationId, action.incumbentActionId,
      TraceRelationshipType.ACTION_BINDING,
      action.matchingRecommendationStatus === ActionMatchStatus.MATCH ? AttributionStatus.SUPPORTED : AttributionStatus.UNKNOWN));
  }
  for (const outcome of outcomes) {
    for (const action of actions) {
      edges.push(automaticEdge(environment, action.incumbentActionId, outcome.outcomeId,
        TraceRelationshipType.OUTCOME_BINDING, AttributionStatus.ESTABLISHED));
    }
  }
  for (const attribution of attributions) {
    if (attribution.causalClaim !== null) {
      edges.push(createTraceEdge({
        environment,
        sourceRef: attribution.causalClaim.sourceRef,
        targetRef: attribution.causalClaim.targetRef,
        relationshipType: TraceRelationshipType.CAUSAL_CLAIM,
        attributionStatus: attribution.status,
        confidence: attribution.confidence,
        provenance: attribution.provenance,
        causalBasis: attribution.causalClaim.basis,
      }));
    }
  }
  const uniqueEdges = [...new Map(edges.map((edge) => [edge.edgeId, edge])).values()]
    .sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const attributionStatuses = [...new Set(attributions.map((entry) => entry.status))].sort();
  const attributionStatus = attributionStatuses.length === 0
    ? AttributionStatus.UNKNOWN
    : attributionStatuses.includes(AttributionStatus.CONFLICTED)
      ? AttributionStatus.CONFLICTED
      : attributionStatuses.includes(AttributionStatus.UNKNOWN)
        ? AttributionStatus.UNKNOWN
        : attributionStatuses.includes(AttributionStatus.PLAUSIBLE)
          ? AttributionStatus.PLAUSIBLE
          : attributionStatuses.includes(AttributionStatus.SUPPORTED)
            ? AttributionStatus.SUPPORTED
            : AttributionStatus.ESTABLISHED;
  let lifecycleStatus = TraceLifecycleStatus.OPEN;
  if (actions.length > 0) lifecycleStatus = TraceLifecycleStatus.ACTION_BOUND;
  if (outcomes.length > 0) lifecycleStatus = TraceLifecycleStatus.OUTCOME_BOUND;
  if (attributions.length > 0) lifecycleStatus = TraceLifecycleStatus.ATTRIBUTION_AVAILABLE;
  if (failures.length > 0) lifecycleStatus = TraceLifecycleStatus.INCOMPLETE;
  if (actionConflict || outcomeConflict || attributions.some((entry) => entry.status === AttributionStatus.CONFLICTED)) {
    lifecycleStatus = TraceLifecycleStatus.CONFLICTED;
  }
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    contractId: CAUSAL_TRACE_CONTRACT_ID,
    schemaVersion: CAUSAL_TRACE_SCHEMA_VERSION,
    contractHash: CAUSAL_TRACE_CONTRACT_HASH,
    traceId: decisionEvent.traceId,
    environment,
    logicalTime: decision.worldStateSnapshot.time.logicalTime,
    decisionTimeEvent: decisionEvent,
    attachments: events,
    edges: uniqueEdges,
    projection: {
      lifecycleStatus,
      incumbentActionStatus: actions.length === 0 ? 'UNKNOWN' : actionConflict ? 'CONFLICTED' : 'BOUND',
      outcomeStatus: outcomes.length === 0 ? 'UNKNOWN' : outcomeConflict ? 'CONFLICTED' : 'BOUND',
      attributionStatus,
      attributionStatuses,
      incumbentActions: actions,
      outcomes,
      attributions,
      instrumentationFailures: failures,
      traceCompletenessImpliesCausalCertainty: false,
    },
    authority,
  };
  return deepFreeze({ ...body, traceDigest: `sha256:${sha256(body)}` });
}

export function createDecisionTimeTrace({
  observationEvidence,
  worldStateSnapshot,
  featureDerivation,
  predictorEvidence = [],
  routerEvaluation,
  recommendation,
}) {
  if (!Array.isArray(predictorEvidence)) throw new CausalTraceContractError('predictorEvidence must be an array');
  predictorEvidence.forEach((entry) => verifySeal(entry, 'predictorEvidenceId', 'TRACE_PREDICTOR_EVIDENCE_V1'));
  const decisionTimeEvidence = deepFreeze({
    observationEvidence,
    worldStateSnapshot,
    featureDerivation,
    predictorEvidence: [...predictorEvidence].sort((a, b) => a.predictorEvidenceId.localeCompare(b.predictorEvidenceId)),
    routerEvaluation,
    recommendation,
  });
  verifyDecisionBindings(decisionTimeEvidence);
  const decisionBody = {
    recordType: 'TRACE_DECISION_TIME_EVIDENCE_V1',
    decisionTimeEvidence,
  };
  const traceId = `sha256:${sha256(decisionBody)}`;
  const decisionEvent = seal({ ...decisionBody, traceId }, 'decisionEventId');
  return projectTrace(decisionEvent, []);
}

export function verifyCausalTrace(trace) {
  if (!isRecord(trace) || trace.contractId !== CAUSAL_TRACE_CONTRACT_ID
      || trace.schemaVersion !== CAUSAL_TRACE_SCHEMA_VERSION || trace.contractHash !== CAUSAL_TRACE_CONTRACT_HASH) {
    throw new CausalTraceContractError('not a Sentinel Causal Trace v1 record');
  }
  const { traceDigest, ...body } = trace;
  if (traceDigest !== `sha256:${sha256(body)}`) throw new CausalTraceContractError('causal trace digest mismatch');
  assertEvaluationOnly(trace.authority);
  const rebuilt = projectTrace(trace.decisionTimeEvent, trace.attachments);
  if (stableStringify(rebuilt) !== stableStringify(trace)) {
    throw new CausalTraceContractError('causal trace is digest-valid but non-canonical');
  }
  return true;
}

export function serializeCausalTrace(trace) {
  verifyCausalTrace(trace);
  return stableStringify(trace);
}

function appendEvent(trace, event) {
  verifyCausalTrace(trace);
  verifyEvent(event);
  if (event.logicalTime < trace.logicalTime) throw new CausalTraceContractError('attachment predates decision-time evidence');
  const existing = trace.attachments.find((entry) => entry.eventId === event.eventId);
  if (existing) return trace;
  return projectTrace(trace.decisionTimeEvent, [...trace.attachments, event]);
}

export function attachIncumbentAction(trace, { selectedAction, logicalTime, provenance }) {
  verifyCausalTrace(trace);
  const environment = trace.environment;
  const action = canonicalAction(selectedAction, 'selectedAction');
  const body = {
    recordType: 'TRACE_INCUMBENT_ACTION_V1',
    environment,
    traceId: trace.traceId,
    actionSlotId: `${trace.traceId}:INCUMBENT_ACTION`,
    selectedAction: action,
    actor: 'INCUMBENT',
    logicalTime: requireLogicalTime(logicalTime),
    matchingRecommendationStatus: matchAction(trace.decisionTimeEvent.decisionTimeEvidence.recommendation, action),
    provenance: normalizeProvenance(provenance, environment),
  };
  const record = seal(body, 'incumbentActionId');
  return appendEvent(trace, createEvent('INCUMBENT_ACTION_ATTACHED', body.logicalTime, record));
}

export function attachOutcome(trace, {
  actualStateSnapshot,
  logicalTime,
  outcomeSummary,
  observationCompleteness,
  provenance,
}) {
  verifyCausalTrace(trace);
  verifyWorldStateSnapshot(actualStateSnapshot);
  const environment = trace.environment;
  requireEnvironment(actualStateSnapshot.environment, environment, 'actualStateSnapshot');
  const normalizedLogicalTime = requireLogicalTime(logicalTime);
  if (actualStateSnapshot.time.logicalTime !== normalizedLogicalTime) {
    throw new CausalTraceContractError('outcome logical time must match its authoritative state snapshot');
  }
  if (!actualStateSnapshot.facts.some((fact) => fact.category === EpistemicCategory.OBSERVED)) {
    throw new CausalTraceContractError('actual outcome requires authoritative observed state evidence');
  }
  if (!['COMPLETE', 'PARTIAL', 'UNKNOWN'].includes(observationCompleteness)) {
    throw new CausalTraceContractError(`unsupported observationCompleteness: ${observationCompleteness}`);
  }
  assertNoExecutionSurface(outcomeSummary, 'outcomeSummary');
  const body = {
    recordType: 'TRACE_OUTCOME_EVIDENCE_V1',
    environment,
    traceId: trace.traceId,
    outcomeSlotId: `${trace.traceId}:OUTCOME`,
    authoritativeStateSnapshotId: actualStateSnapshot.snapshotId,
    epistemicCategory: EpistemicCategory.OBSERVED,
    outcomeSummary: canonicalize(outcomeSummary),
    logicalTime: normalizedLogicalTime,
    observationCompleteness,
    provenance: normalizeProvenance(provenance, environment),
  };
  const record = seal(body, 'outcomeId');
  return appendEvent(trace, createEvent('OUTCOME_ATTACHED', body.logicalTime, record));
}

export function attachAttribution(trace, {
  status,
  failureCategory,
  explanation,
  evidenceRefs,
  confidence = null,
  causalClaim = null,
  logicalTime,
  provenance,
}) {
  verifyCausalTrace(trace);
  const environment = trace.environment;
  const normalizedStatus = requireEnum(status, AttributionStatus, 'attribution status');
  const category = requireEnum(failureCategory, FailureAttributionCategory, 'failure attribution category');
  if (!Array.isArray(evidenceRefs)) throw new CausalTraceContractError('evidenceRefs must be an array');
  const refs = [...new Set(evidenceRefs.map((entry) => requireString(entry, 'evidenceRefs[]')))].sort();
  let normalizedClaim = null;
  if (causalClaim !== null) {
    requireRecord(causalClaim, 'causalClaim');
    requireRecord(causalClaim.basis, 'causalClaim.basis');
    requireString(causalClaim.sourceRef, 'causalClaim.sourceRef');
    requireString(causalClaim.targetRef, 'causalClaim.targetRef');
    requireString(causalClaim.basis.method, 'causalClaim.basis.method');
    if (!Array.isArray(causalClaim.basis.evidenceRefs) || causalClaim.basis.evidenceRefs.length === 0) {
      throw new CausalTraceContractError('causal claim requires explicit basis evidence');
    }
    if (normalizedStatus === AttributionStatus.UNKNOWN) {
      throw new CausalTraceContractError('UNKNOWN attribution cannot assert a causal claim');
    }
    normalizedClaim = canonicalize({
      ...causalClaim,
      basis: {
        ...causalClaim.basis,
        evidenceRefs: [...new Set(causalClaim.basis.evidenceRefs.map((entry) =>
          requireString(entry, 'causalClaim.basis.evidenceRefs[]')))].sort(),
      },
    });
  }
  const body = {
    recordType: 'TRACE_ATTRIBUTION_V1',
    environment,
    traceId: trace.traceId,
    status: normalizedStatus,
    failureCategory: category,
    explanation: requireString(explanation, 'explanation'),
    evidenceRefs: refs,
    confidence: requireConfidence(confidence, 'confidence', true),
    causalClaim: normalizedClaim,
    logicalTime: requireLogicalTime(logicalTime),
    provenance: normalizeProvenance(provenance, environment),
  };
  const record = seal(body, 'attributionId');
  return appendEvent(trace, createEvent('ATTRIBUTION_ATTACHED', body.logicalTime, record));
}

export function attachInstrumentationFailure(trace, { failureType, reason, logicalTime, provenance }) {
  verifyCausalTrace(trace);
  const environment = trace.environment;
  const body = {
    recordType: 'TRACE_INSTRUMENTATION_FAILURE_V1',
    environment,
    traceId: trace.traceId,
    failureType: requireString(failureType, 'failureType'),
    reason: requireString(reason, 'reason'),
    logicalTime: requireLogicalTime(logicalTime),
    provenance: normalizeProvenance(provenance, environment),
  };
  const record = seal(body, 'failureEvidenceId');
  return appendEvent(trace, createEvent('INSTRUMENTATION_FAILURE', body.logicalTime, record));
}
