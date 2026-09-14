import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sha256, stableStringify } from '../src/core/determinism.js';
import {
  EpistemicCategory,
  EvidenceAuthority,
  createWorldStateFact,
  createWorldStateSnapshot,
  verifyWorldStateSnapshot,
} from '../src/stage3f/world-state-v1.js';
import {
  ActionMatchStatus,
  AttributionStatus,
  CAUSAL_TRACE_CONTRACT_HASH,
  CAUSAL_TRACE_CONTRACT_ID,
  CausalTraceContractError,
  FailureAttributionCategory,
  TraceLifecycleStatus,
  TraceRelationshipType,
  attachAttribution,
  attachIncumbentAction,
  attachInstrumentationFailure,
  attachOutcome,
  createDecisionTimeTrace,
  createFeatureDerivationEvidence,
  createObservationEvidence,
  createPredictorEvidence,
  createRecommendationEvidence,
  createRouterEvaluationEvidence,
  createTraceEdge,
  serializeCausalTrace,
  verifyCausalTrace,
} from '../src/stage3f/causal-trace-v1.js';
import * as publicApi from '../src/index.js';

const environment = Object.freeze({ identity: 'forge-world', version: 'FORGE_WORLD_V2' });
const featureContract = Object.freeze({
  id: 'SENTINEL_FEATURE_CONTRACT_V2',
  version: '2',
  hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb',
});
const routerIdentity = Object.freeze({
  id: 'STAGE3E_ROUTABILITY_ROUTER',
  version: 'STAGE_3E',
  hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64',
});
const moveNorth = Object.freeze({ actionId: 'MOVE', parameters: { direction: 'NORTH' } });
const moveSouth = Object.freeze({ actionId: 'MOVE', parameters: { direction: 'SOUTH' } });
const waitAction = Object.freeze({ actionId: 'WAIT', parameters: {} });

function provenance(sourceId, evidenceId, bound = environment) {
  return {
    environmentIdentity: bound.identity,
    environmentVersion: bound.version,
    sourceId,
    evidenceId,
  };
}

function observedEnergy(value, logicalTime, bound = environment) {
  return createWorldStateFact({
    path: ['resources', 'actor', 'energy'],
    category: EpistemicCategory.OBSERVED,
    authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION,
    value,
    confidence: 1,
    uncertainty: { status: 'BOUNDED', radius: 0 },
    provenance: provenance('forge-observer-v2', `energy-${logicalTime}-${value}`, bound),
  });
}

function predictedRisk(value, logicalTime, bound = environment) {
  return createWorldStateFact({
    path: ['constraints', 'predictedRisk'],
    category: EpistemicCategory.PREDICTED,
    authority: EvidenceAuthority.CALIBRATED_PREDICTION,
    value,
    confidence: 0.76,
    uncertainty: { status: 'BOUNDED', radius: 0.08 },
    provenance: {
      ...provenance('risk-predictor-v1', `risk-${logicalTime}-${value}`, bound),
      prediction: { producerId: 'risk-predictor', producerVersion: '1', calibrated: true, horizon: 1 },
    },
  });
}

function stateSnapshot({ energy = 31, logicalTime = 10, bound = environment, prediction = true } = {}) {
  const facts = [observedEnergy(energy, logicalTime, bound)];
  if (prediction) facts.push(predictedRisk('LOW', logicalTime, bound));
  return createWorldStateSnapshot({ environment: bound, logicalTime, facts });
}

function predictedOnlySnapshot({ logicalTime = 11, bound = environment } = {}) {
  return createWorldStateSnapshot({
    environment: bound,
    logicalTime,
    facts: [predictedRisk('HIGH', logicalTime, bound)],
  });
}

function buildFixture({ energy = 31, predictors = 1, bound = environment } = {}) {
  const worldStateSnapshot = stateSnapshot({ energy, bound });
  const observationEvidence = createObservationEvidence({
    observationId: `observation-10-${energy}`,
    environment: bound,
    logicalTime: 10,
    observationDigest: `sha256:${sha256({ energy, logicalTime: 10 })}`,
    provenance: provenance('forge-observer-v2', `observation-10-${energy}`, bound),
  });
  const featureDerivation = createFeatureDerivationEvidence({
    worldStateSnapshot,
    featureContract,
    featureValues: { greedyFuturePotential: 7, greedyResourceCost: 3, energy },
    implementation: { id: 'stage3e-feature-extractor', version: '2', hash: 'sha256:feature-extractor-v2' },
    provenance: provenance('stage3e-feature-extractor', `features-10-${energy}`, bound),
  });
  const predictorEvidence = Array.from({ length: predictors }, (_, index) => createPredictorEvidence({
    worldStateSnapshot,
    predictor: { id: `generic-risk-predictor-${index}`, version: '1' },
    outputSummary: { horizon: 1, riskBand: index === 0 ? 'LOW' : 'MEDIUM' },
    confidence: 0.76 - index * 0.01,
    uncertainty: { status: 'BOUNDED', radius: 0.08 + index * 0.01 },
    provenance: provenance(`generic-risk-predictor-${index}`, `prediction-10-${energy}-${index}`, bound),
  }));
  const routerEvaluation = createRouterEvaluationEvidence({
    featureDerivation,
    predictorEvidence,
    router: routerIdentity,
    score: 0.92,
    threshold: 0.9,
    selectedRoute: 'GREEDY',
    fallback: { available: true, used: false, route: 'INCUMBENT_DEFAULT' },
    provenance: provenance('stage3e-router', `router-10-${energy}`, bound),
  });
  const recommendation = createRecommendationEvidence({
    routerEvaluation,
    proposedAction: moveNorth,
    recommendedPath: 'GREEDY',
    confidence: 0.92,
    uncertainty: { status: 'BOUNDED', marginToThreshold: 0.02 },
    provenance: provenance('sentinel-shadow', `recommendation-10-${energy}`, bound),
  });
  const trace = createDecisionTimeTrace({
    observationEvidence,
    worldStateSnapshot,
    featureDerivation,
    predictorEvidence,
    routerEvaluation,
    recommendation,
  });
  return {
    observationEvidence, worldStateSnapshot, featureDerivation, predictorEvidence,
    routerEvaluation, recommendation, trace,
  };
}

function incumbentAttachment(selectedAction = moveNorth, evidenceId = 'incumbent-action-11') {
  return {
    selectedAction,
    logicalTime: 11,
    provenance: provenance('incumbent-executor', evidenceId),
  };
}

function outcomeAttachment(energy = 28, evidenceId = `outcome-12-${energy}`) {
  return {
    actualStateSnapshot: stateSnapshot({ energy, logicalTime: 12, prediction: false }),
    logicalTime: 12,
    outcomeSummary: { energy, terminal: false },
    observationCompleteness: 'COMPLETE',
    provenance: provenance('forge-outcome-observer', evidenceId),
  };
}

function rehash(record, idField) {
  const copy = structuredClone(record);
  delete copy[idField];
  copy[idField] = `sha256:${sha256(copy)}`;
  return copy;
}

test('identical decision evidence produces identical trace identity and digest', () => {
  const a = buildFixture().trace;
  const b = buildFixture().trace;
  assert.equal(a.traceId, b.traceId);
  assert.equal(a.traceDigest, b.traceDigest);
  assert.equal(serializeCausalTrace(a), serializeCausalTrace(b));
});

test('a different world-state snapshot changes the decision trace identity', () => {
  assert.notEqual(buildFixture({ energy: 31 }).trace.traceId, buildFixture({ energy: 30 }).trace.traceId);
});

test('the exact Stage 3F.0 world-state snapshot reference validates', () => {
  const { trace, worldStateSnapshot } = buildFixture();
  assert.equal(verifyWorldStateSnapshot(worldStateSnapshot), true);
  assert.equal(trace.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot.snapshotId, worldStateSnapshot.snapshotId);
});

test('observed state remains distinct from predictive evidence', () => {
  const { trace } = buildFixture();
  const decision = trace.decisionTimeEvent.decisionTimeEvidence;
  assert.equal(decision.worldStateSnapshot.facts[0].category, EpistemicCategory.PREDICTED);
  assert.equal(decision.worldStateSnapshot.facts[1].category, EpistemicCategory.OBSERVED);
  assert.equal(decision.predictorEvidence[0].epistemicCategory, EpistemicCategory.PREDICTED);
});

test('feature derivation binds the exact world-state snapshot and feature digest', () => {
  const { worldStateSnapshot, featureDerivation } = buildFixture();
  assert.equal(featureDerivation.worldStateSnapshotId, worldStateSnapshot.snapshotId);
  assert.equal(featureDerivation.derivationDigest, `sha256:${sha256(featureDerivation.featureValues)}`);
  assert.equal(featureDerivation.featureContract.hash, featureContract.hash);
});

test('router evidence binds the exact feature derivation and predictors', () => {
  const { routerEvaluation, featureDerivation, predictorEvidence } = buildFixture({ predictors: 2 });
  assert.equal(routerEvaluation.featureDerivationId, featureDerivation.featureDerivationId);
  assert.deepEqual(routerEvaluation.predictorEvidenceIds,
    predictorEvidence.map((entry) => entry.predictorEvidenceId).sort());
  assert.equal(routerEvaluation.router.hash, routerIdentity.hash);
});

test('recommendation binds the exact router result', () => {
  const { recommendation, routerEvaluation } = buildFixture();
  assert.equal(recommendation.routerEvaluationId, routerEvaluation.routerEvaluationId);
});

test('recommendation and trace remain structurally R0 and non-dispatching', () => {
  const { trace, recommendation } = buildFixture();
  for (const authority of [trace.authority, recommendation.authority]) {
    assert.equal(authority.tier, 'R0');
    assert.equal(authority.canDispatch, false);
    assert.equal(authority.canMutateLiveWorld, false);
  }
  assert.equal(recommendation.dispatchPermitted, false);
});

test('missing incumbent action remains explicitly UNKNOWN and OPEN', () => {
  const { trace } = buildFixture();
  assert.equal(trace.projection.incumbentActionStatus, 'UNKNOWN');
  assert.equal(trace.projection.lifecycleStatus, TraceLifecycleStatus.OPEN);
});

test('an incumbent action attaches later as a separate immutable event', () => {
  const { trace } = buildFixture();
  const attached = attachIncumbentAction(trace, incumbentAttachment());
  assert.equal(trace.attachments.length, 0);
  assert.equal(attached.attachments.length, 1);
  assert.equal(attached.projection.lifecycleStatus, TraceLifecycleStatus.ACTION_BOUND);
  assert.equal(attached.projection.incumbentActions[0].actor, 'INCUMBENT');
});

test('an exact incumbent action match records MATCH without a causal claim', () => {
  const attached = attachIncumbentAction(buildFixture().trace, incumbentAttachment());
  assert.equal(attached.projection.incumbentActions[0].matchingRecommendationStatus, ActionMatchStatus.MATCH);
  assert.equal(attached.edges.some((edge) => edge.relationshipType === TraceRelationshipType.ACTION_BINDING), true);
  assert.equal(attached.edges.some((edge) => edge.relationshipType === TraceRelationshipType.CAUSAL_CLAIM), false);
});

test('a different incumbent action records DIFFERENT_ACTION', () => {
  const attached = attachIncumbentAction(buildFixture().trace, incumbentAttachment(waitAction));
  assert.equal(attached.projection.incumbentActions[0].matchingRecommendationStatus, ActionMatchStatus.DIFFERENT_ACTION);
});

test('a parameter-level divergence records PARTIAL_MATCH', () => {
  const attached = attachIncumbentAction(buildFixture().trace, incumbentAttachment(moveSouth));
  assert.equal(attached.projection.incumbentActions[0].matchingRecommendationStatus, ActionMatchStatus.PARTIAL_MATCH);
});

test('missing outcome remains explicitly UNKNOWN and does not force completeness', () => {
  const attached = attachIncumbentAction(buildFixture().trace, incumbentAttachment());
  assert.equal(attached.projection.outcomeStatus, 'UNKNOWN');
  assert.notEqual(attached.projection.lifecycleStatus, 'COMPLETE');
});

test('an actual observed outcome attaches later as separate evidence', () => {
  const attached = attachOutcome(buildFixture().trace, outcomeAttachment());
  assert.equal(attached.projection.outcomeStatus, 'BOUND');
  assert.equal(attached.projection.outcomes[0].epistemicCategory, EpistemicCategory.OBSERVED);
  assert.equal(attached.projection.lifecycleStatus, TraceLifecycleStatus.OUTCOME_BOUND);
});

test('outcome time must match the authoritative state snapshot time', () => {
  const trace = buildFixture().trace;
  assert.throws(() => attachOutcome(trace, {
    ...outcomeAttachment(), logicalTime: 13,
  }), /must match its authoritative state snapshot/);
  assert.equal(trace.attachments.length, 0);
});

test('predicted next state cannot become actual outcome automatically', () => {
  const trace = buildFixture().trace;
  assert.throws(() => attachOutcome(trace, {
    ...outcomeAttachment(),
    actualStateSnapshot: predictedOnlySnapshot({ logicalTime: 12 }),
  }), /requires authoritative observed state evidence/);
  assert.equal(trace.attachments.length, 0);
});

test('outcome attachment cannot rewrite decision-time evidence', () => {
  const trace = buildFixture().trace;
  const before = stableStringify(trace.decisionTimeEvent);
  const after = attachOutcome(trace, outcomeAttachment());
  assert.equal(stableStringify(after.decisionTimeEvent), before);
  assert.equal(after.traceId, trace.traceId);
  assert.notEqual(after.traceDigest, trace.traceDigest);
});

test('duplicate identical incumbent attachment is idempotent', () => {
  const once = attachIncumbentAction(buildFixture().trace, incumbentAttachment());
  const twice = attachIncumbentAction(once, incumbentAttachment());
  assert.equal(twice, once);
  assert.equal(twice.attachments.length, 1);
});

test('duplicate identical outcome attachment is idempotent', () => {
  const once = attachOutcome(buildFixture().trace, outcomeAttachment());
  const twice = attachOutcome(once, outcomeAttachment());
  assert.equal(twice, once);
  assert.equal(twice.attachments.length, 1);
});

test('conflicting incumbent actions are both preserved and mark the trace CONFLICTED', () => {
  const first = attachIncumbentAction(buildFixture().trace, incumbentAttachment(moveNorth, 'action-a'));
  const second = attachIncumbentAction(first, incumbentAttachment(waitAction, 'action-b'));
  assert.equal(second.projection.incumbentActions.length, 2);
  assert.equal(second.projection.incumbentActionStatus, 'CONFLICTED');
  assert.equal(second.projection.lifecycleStatus, TraceLifecycleStatus.CONFLICTED);
});

test('conflicting outcomes are both preserved and mark the trace CONFLICTED', () => {
  const first = attachOutcome(buildFixture().trace, outcomeAttachment(28, 'outcome-a'));
  const second = attachOutcome(first, outcomeAttachment(27, 'outcome-b'));
  assert.equal(second.projection.outcomes.length, 2);
  assert.equal(second.projection.outcomeStatus, 'CONFLICTED');
  assert.equal(second.projection.lifecycleStatus, TraceLifecycleStatus.CONFLICTED);
});

test('environment identity mismatch fails closed without changing existing evidence', () => {
  const trace = buildFixture().trace;
  const bad = { identity: 'other-world', version: environment.version };
  assert.throws(() => attachIncumbentAction(trace, {
    ...incumbentAttachment(), provenance: provenance('incumbent-executor', 'bad-identity', bad),
  }), /environment identity\/version mismatch/);
  assert.equal(trace.attachments.length, 0);
});

test('environment version mismatch is surfaced and fails closed', () => {
  const trace = buildFixture().trace;
  const bad = { identity: environment.identity, version: 'FORGE_WORLD_V3' };
  assert.throws(() => attachOutcome(trace, {
    ...outcomeAttachment(), provenance: provenance('outcome-observer', 'bad-version', bad),
  }), /environment identity\/version mismatch/);
  assert.equal(trace.attachments.length, 0);
});

test('malformed provenance is rejected', () => {
  assert.throws(() => createObservationEvidence({
    observationId: 'bad', environment, logicalTime: 10, observationDigest: 'sha256:bad',
    provenance: { sourceId: 'observer' },
  }), CausalTraceContractError);
});

test('required relationship types are represented and preserved', () => {
  const withAction = attachIncumbentAction(buildFixture().trace, incumbentAttachment());
  const completeEvidence = attachOutcome(withAction, outcomeAttachment());
  const types = new Set(completeEvidence.edges.map((edge) => edge.relationshipType));
  for (const type of [
    TraceRelationshipType.TEMPORAL_LINK,
    TraceRelationshipType.DERIVATION_LINK,
    TraceRelationshipType.DECISION_DEPENDENCY,
    TraceRelationshipType.ACTION_BINDING,
    TraceRelationshipType.OUTCOME_BINDING,
  ]) assert.equal(types.has(type), true);
});

test('a temporal link never becomes a causal claim automatically', () => {
  const { trace } = buildFixture();
  const temporal = trace.edges.find((edge) => edge.relationshipType === TraceRelationshipType.TEMPORAL_LINK);
  assert.ok(temporal);
  assert.equal(temporal.causalBasis, null);
  assert.equal(trace.edges.some((edge) => edge.relationshipType === TraceRelationshipType.CAUSAL_CLAIM), false);
});

test('derivation links remain distinguishable from temporal links', () => {
  const types = buildFixture().trace.edges.map((edge) => edge.relationshipType);
  assert.equal(types.includes(TraceRelationshipType.DERIVATION_LINK), true);
  assert.equal(types.includes(TraceRelationshipType.TEMPORAL_LINK), true);
  assert.notEqual(TraceRelationshipType.DERIVATION_LINK, TraceRelationshipType.TEMPORAL_LINK);
});

test('unsupported relationship types fail validation', () => {
  const { trace } = buildFixture();
  assert.throws(() => createTraceEdge({
    environment, sourceRef: trace.traceId, targetRef: 'target', relationshipType: 'PRECEDES_THEREFORE_CAUSES',
    attributionStatus: AttributionStatus.UNKNOWN, provenance: provenance('analyst', 'bad-edge'),
  }), /unsupported relationship type/);
});

test('malformed edges fail validation', () => {
  assert.throws(() => createTraceEdge({
    environment, sourceRef: '', targetRef: 'target', relationshipType: TraceRelationshipType.TEMPORAL_LINK,
    attributionStatus: AttributionStatus.UNKNOWN, provenance: provenance('analyst', 'malformed-edge'),
  }), /sourceRef/);
});

test('causal claims require explicit evidence and cannot use UNKNOWN', () => {
  assert.throws(() => createTraceEdge({
    environment, sourceRef: 'a', targetRef: 'b', relationshipType: TraceRelationshipType.CAUSAL_CLAIM,
    attributionStatus: AttributionStatus.SUPPORTED, causalBasis: { method: 'REVIEW', evidenceRefs: [] },
    provenance: provenance('reviewer', 'empty-basis'),
  }), /explicit evidenceRefs/);
  assert.throws(() => createTraceEdge({
    environment, sourceRef: 'a', targetRef: 'b', relationshipType: TraceRelationshipType.CAUSAL_CLAIM,
    attributionStatus: AttributionStatus.UNKNOWN, causalBasis: { method: 'REVIEW', evidenceRefs: ['e'] },
    provenance: provenance('reviewer', 'unknown-claim'),
  }), /cannot use UNKNOWN/);
});

test('causal basis evidence order and duplicates do not change edge identity', () => {
  const common = {
    environment, sourceRef: 'source', targetRef: 'target',
    relationshipType: TraceRelationshipType.CAUSAL_CLAIM,
    attributionStatus: AttributionStatus.SUPPORTED,
    provenance: provenance('reviewer', 'ordered-basis'),
  };
  const a = createTraceEdge({
    ...common, causalBasis: { method: 'REVIEW_V1', evidenceRefs: ['b', 'a', 'a'] },
  });
  const b = createTraceEdge({
    ...common, causalBasis: { method: 'REVIEW_V1', evidenceRefs: ['a', 'b'] },
  });
  assert.equal(a.edgeId, b.edgeId);
  assert.deepEqual(a.causalBasis.evidenceRefs, ['a', 'b']);
});

test('an explicit supported attribution can add an auditable causal claim', () => {
  const trace = attachOutcome(attachIncumbentAction(buildFixture().trace, incumbentAttachment()), outcomeAttachment());
  const action = trace.projection.incumbentActions[0];
  const outcome = trace.projection.outcomes[0];
  const attributed = attachAttribution(trace, {
    status: AttributionStatus.SUPPORTED,
    failureCategory: FailureAttributionCategory.NO_FAILURE_DETERMINED,
    explanation: 'Independent review supports the bounded action-to-outcome claim.',
    evidenceRefs: [action.incumbentActionId, outcome.outcomeId],
    confidence: 0.7,
    causalClaim: {
      sourceRef: action.incumbentActionId,
      targetRef: outcome.outcomeId,
      basis: { method: 'INDEPENDENT_REVIEW_V1', evidenceRefs: [action.incumbentActionId, outcome.outcomeId] },
    },
    logicalTime: 13,
    provenance: provenance('independent-reviewer', 'attribution-13'),
  });
  assert.equal(attributed.edges.filter((edge) => edge.relationshipType === TraceRelationshipType.CAUSAL_CLAIM).length, 1);
  assert.equal(attributed.projection.attributionStatus, AttributionStatus.SUPPORTED);
});

test('attribution UNKNOWN is retained as derived evidence', () => {
  const trace = buildFixture().trace;
  const attributed = attachAttribution(trace, {
    status: AttributionStatus.UNKNOWN,
    failureCategory: FailureAttributionCategory.UNKNOWN,
    explanation: 'No outcome evidence is available.', evidenceRefs: [], logicalTime: 13,
    provenance: provenance('trace-auditor', 'unknown-attribution'),
  });
  assert.equal(attributed.projection.attributionStatus, AttributionStatus.UNKNOWN);
  assert.equal(attributed.projection.attributions[0].status, AttributionStatus.UNKNOWN);
});

test('attribution CONFLICTED is retained and marks the projection CONFLICTED', () => {
  const trace = buildFixture().trace;
  const attributed = attachAttribution(trace, {
    status: AttributionStatus.CONFLICTED,
    failureCategory: FailureAttributionCategory.OUTCOME_ATTRIBUTION_UNCERTAIN,
    explanation: 'Two evidence sources disagree.', evidenceRefs: ['source-a', 'source-b'], confidence: 0.5,
    logicalTime: 13, provenance: provenance('trace-auditor', 'conflicted-attribution'),
  });
  assert.equal(attributed.projection.attributionStatus, AttributionStatus.CONFLICTED);
  assert.equal(attributed.projection.lifecycleStatus, TraceLifecycleStatus.CONFLICTED);
});

test('deterministic replay reproduces identical trace evidence', () => {
  const build = () => attachOutcome(
    attachIncumbentAction(buildFixture({ predictors: 2 }).trace, incumbentAttachment()),
    outcomeAttachment(),
  );
  const a = build();
  const b = build();
  assert.equal(a.traceDigest, b.traceDigest);
  assert.equal(serializeCausalTrace(a), serializeCausalTrace(b));
  assert.equal(verifyCausalTrace(a), true);
});

test('canonical key order does not change component or trace identities', () => {
  const a = buildFixture();
  const reorderedFeatures = { energy: 31, greedyResourceCost: 3, greedyFuturePotential: 7 };
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: a.worldStateSnapshot, featureContract: { ...featureContract },
    featureValues: reorderedFeatures,
    implementation: { hash: 'sha256:feature-extractor-v2', version: '2', id: 'stage3e-feature-extractor' },
    provenance: provenance('stage3e-feature-extractor', 'features-10-31'),
  });
  assert.equal(feature.featureDerivationId, a.featureDerivation.featureDerivationId);
});

test('zero predictor sources are supported without inventing predictions', () => {
  const { trace, routerEvaluation } = buildFixture({ predictors: 0 });
  assert.deepEqual(trace.decisionTimeEvent.decisionTimeEvidence.predictorEvidence, []);
  assert.deepEqual(routerEvaluation.predictorEvidenceIds, []);
});

test('multiple predictor sources are order-independent', () => {
  const fixture = buildFixture({ predictors: 2 });
  const trace = createDecisionTimeTrace({
    ...fixture,
    predictorEvidence: [...fixture.predictorEvidence].reverse(),
  });
  assert.equal(trace.traceId, fixture.trace.traceId);
});

test('reordered late attachments converge on the same materialized trace', () => {
  const firstOrder = attachOutcome(
    attachIncumbentAction(buildFixture().trace, incumbentAttachment()), outcomeAttachment(),
  );
  const secondOrder = attachIncumbentAction(
    attachOutcome(buildFixture().trace, outcomeAttachment()), incumbentAttachment(),
  );
  assert.equal(firstOrder.traceDigest, secondOrder.traceDigest);
  assert.equal(serializeCausalTrace(firstOrder), serializeCausalTrace(secondOrder));
});

test('late incumbent action is accepted after an outcome and remains separately bound', () => {
  const outcomeFirst = attachOutcome(buildFixture().trace, outcomeAttachment());
  const actionLater = attachIncumbentAction(outcomeFirst, { ...incumbentAttachment(), logicalTime: 14 });
  assert.equal(actionLater.projection.incumbentActionStatus, 'BOUND');
  assert.equal(actionLater.projection.outcomeStatus, 'BOUND');
});

test('an attachment that predates decision-time evidence fails closed', () => {
  const trace = buildFixture().trace;
  assert.throws(() => attachIncumbentAction(trace, { ...incumbentAttachment(), logicalTime: 9 }), /predates/);
  assert.equal(trace.attachments.length, 0);
});

test('instrumentation failure preserves decision evidence and cannot alter incumbent execution', () => {
  const incumbent = { calls: 0, execute() { this.calls += 1; } };
  const trace = buildFixture().trace;
  const before = stableStringify(trace.decisionTimeEvent);
  const failed = attachInstrumentationFailure(trace, {
    failureType: 'WRITE_FAILURE', reason: 'Evidence sink unavailable', logicalTime: 11,
    provenance: provenance('trace-instrumentation', 'write-failure-11'),
  });
  assert.equal(incumbent.calls, 0);
  assert.equal(stableStringify(failed.decisionTimeEvent), before);
  assert.equal(failed.projection.lifecycleStatus, TraceLifecycleStatus.INCOMPLETE);
  assert.equal(failed.authority.canDispatch, false);
  assert.equal(failed.authority.canMutateLiveWorld, false);
});

test('missing observation reference fails closed', () => {
  const fixture = buildFixture();
  assert.throws(() => createDecisionTimeTrace({ ...fixture, observationEvidence: null }), CausalTraceContractError);
});

test('a corrupt supplied feature digest fails closed', () => {
  const { worldStateSnapshot } = buildFixture();
  assert.throws(() => createFeatureDerivationEvidence({
    worldStateSnapshot, featureContract, featureValues: { energy: 31 }, derivationDigest: 'sha256:corrupt',
    implementation: { id: 'extractor', version: '2', hash: 'sha256:extractor' },
    provenance: provenance('extractor', 'corrupt-features'),
  }), /feature derivation digest mismatch/);
});

test('a malformed reference-only feature digest fails closed', () => {
  const { worldStateSnapshot } = buildFixture();
  assert.throws(() => createFeatureDerivationEvidence({
    worldStateSnapshot, featureContract, featureValues: null, derivationDigest: 'sha256:corrupt',
    implementation: { id: 'extractor', version: '2', hash: 'sha256:extractor' },
    provenance: provenance('extractor', 'malformed-reference'),
  }), /canonical sha256 digest/);
});

test('an unknown router reference fails trace verification', () => {
  const fixture = buildFixture();
  const tampered = structuredClone(fixture.routerEvaluation);
  tampered.featureDerivationId = 'sha256:unknown';
  assert.throws(() => createRecommendationEvidence({
    routerEvaluation: tampered, proposedAction: moveNorth, recommendedPath: 'GREEDY', confidence: 0.9,
    uncertainty: { status: 'BOUNDED' }, provenance: provenance('sentinel-shadow', 'tampered-router'),
  }), /identity mismatch/);
});

test('a self-rehashed recommendation cannot forge dispatch permission', () => {
  const fixture = buildFixture();
  const recommendation = structuredClone(fixture.recommendation);
  recommendation.dispatchPermitted = true;
  const forged = rehash(recommendation, 'recommendationId');
  assert.throws(() => createDecisionTimeTrace({ ...fixture, recommendation: forged }), /semantically invalid/);
});

test('missing world-state evidence fails closed', () => {
  const fixture = buildFixture();
  assert.throws(() => createDecisionTimeTrace({ ...fixture, worldStateSnapshot: null }));
});

test('a duplicate recommendation collection is rejected by the singular decision contract', () => {
  const fixture = buildFixture();
  assert.throws(() => createDecisionTimeTrace({
    ...fixture, recommendation: [fixture.recommendation, fixture.recommendation],
  }), /must be an object/);
});

test('trace contract is available through the public package API', () => {
  assert.equal(publicApi.CAUSAL_TRACE_CONTRACT_ID, CAUSAL_TRACE_CONTRACT_ID);
  assert.equal(publicApi.CAUSAL_TRACE_CONTRACT_HASH, CAUSAL_TRACE_CONTRACT_HASH);
  assert.equal(publicApi.createDecisionTimeTrace, createDecisionTimeTrace);
});

test('stored Stage 3F.0 certification remains intact', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3f0-world-state-contract/stage3f0-certification-result.json', import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.certificationHash, '3b2b2a42d43a77943d98bc4b0e865dab85b106a94e06320f4593f8e1a9194582');
});

test('stored Stage 3E router and feature contract hashes remain intact', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3e-routability-intelligence/freeze-3e.json', import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.ROUTER_HASH, routerIdentity.hash);
  assert.equal(artifact.FEATURE_CONTRACT_V2_HASH, featureContract.hash);
});

test('the contract explicitly denies the completeness-to-causality inference', () => {
  const trace = attachOutcome(attachIncumbentAction(buildFixture().trace, incumbentAttachment()), outcomeAttachment());
  assert.equal(trace.projection.traceCompletenessImpliesCausalCertainty, false);
  assert.equal(trace.edges.some((edge) => edge.relationshipType === TraceRelationshipType.CAUSAL_CLAIM), false);
});
