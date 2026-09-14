import test from 'node:test';
import assert from 'node:assert/strict';

import { sha256, stableStringify } from '../src/core/determinism.js';
import { EpistemicCategory, EvidenceAuthority, createWorldStateFact, createWorldStateSnapshot } from '../src/stage3f/world-state-v1.js';
import {
  attachOutcome, createDecisionTimeTrace, createFeatureDerivationEvidence, createObservationEvidence,
  createPredictorEvidence, createRecommendationEvidence, createRouterEvaluationEvidence,
} from '../src/stage3f/causal-trace-v1.js';
import {
  CalibrationDomain, CalibrationStatus, ResourceDirectionality, TransitionAssumption,
  createCalibrationEvidence, createDomainAssessment, createEnvironmentCalibration,
  createEnvironmentIdentity, createSemanticDefinition,
} from '../src/stage3f/environment-calibration-v1.js';
import {
  ActionComparisonStatus, CounterfactualTiming, CounterfactualVetoLedgerContractError,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT, COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH,
  COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID, LedgerActorType, LedgerEvaluationStatus,
  LedgerLifecycleStatus, VetoDisposition, VetoReasonCategory,
  attachLedgerActualOutcome, attachLedgerCounterfactual, attachLedgerEvaluation,
  attachLedgerSelectedAction, attachLedgerVeto, createCounterfactualVetoLedger,
  serializeCounterfactualVetoLedger, verifyCounterfactualVetoLedger,
} from '../src/stage3f/counterfactual-veto-ledger-v1.js';
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

const calibrationProvenance = (env, sourceId, evidenceId) => ({
  environmentId: env.environmentId, environmentVersion: env.environmentVersion, sourceId, evidenceId,
});
const traceProvenance = (runtime, sourceId, evidenceId) => ({
  environmentIdentity: runtime.identity, environmentVersion: runtime.version, sourceId, evidenceId,
});
const ledgerProvenance = (env, evidenceId, sourceId = 'stage3f3-test') =>
  calibrationProvenance(env, sourceId, evidenceId);

function semantics(domain) {
  if (domain === CalibrationDomain.ACTION_SEMANTICS) return {
    actionId: 'MOVE', actionVersion: '2', parameters: [], preconditions: [], expectedDirectEffects: [],
    possibleSideEffects: [], resourceCosts: [{ resourceId: 'energy', amount: 2 }], temporalDuration: null,
    failureModes: [], legalityConstraints: [], resultObservability: 'DIRECT',
  };
  if (domain === CalibrationDomain.RESOURCE_SEMANTICS) return {
    resourceId: 'energy', units: 'energy-points', directionality: ResourceDirectionality.INCREASE_DESIRABLE,
    scarcity: 'SCARCE', renewability: 'CONDITIONAL', capacity: { minimum: 0, maximum: 100 },
    consumptionRules: [], generationRules: [], conversionRules: [], strategicRelevance: 'action budget',
  };
  if (domain === CalibrationDomain.TEMPORAL_SEMANTICS) return {
    timeModel: 'DISCRETE', logicalStepSemantics: 'one incumbent transition', tickDuration: null,
    actionDuration: { model: 'ACTION_SPECIFIC', units: 'logical-step' },
    observationCadence: { value: 1, units: 'logical-step' },
    outcomeDelay: { minimum: 0, maximum: 3, units: 'logical-step' },
    episodeHorizon: { maximum: 64, units: 'logical-step' },
    planningHorizon: { certifiedMaximum: 2, units: 'logical-step' },
    temporalUncertainty: { status: 'BOUNDED', wallClockMappingKnown: false },
  };
  if (domain === CalibrationDomain.TRANSITION_SEMANTICS) return {
    assumptions: [{
      type: TransitionAssumption.ACTION_CONDITIONED, value: true,
      epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, evidenceRefs: [],
    }],
  };
  throw new Error(`unsupported fixture semantics ${domain}`);
}

function buildCalibration({ env = identity(), calibratedDomains = [] } = {}) {
  const evidence = calibratedDomains.map((domain) => createCalibrationEvidence({
    environmentIdentity: env, domain, claimTarget: `${domain}:fixture`, claimType: 'SEMANTIC_DEFINITION',
    claimValue: { present: true }, sourceReference: { contract: 'fixture-v1' },
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    provenance: calibrationProvenance(env, 'fixture-spec', `evidence-${domain}`),
  }));
  const definitions = calibratedDomains.map((domain, index) => {
    const shape = semantics(domain);
    if (domain === CalibrationDomain.TRANSITION_SEMANTICS) {
      shape.assumptions[0].evidenceRefs = [evidence[index].calibrationEvidenceId];
    }
    return createSemanticDefinition({
      environmentIdentity: env, domain, conceptId: `${domain}:fixture`, conceptVersion: '1',
      semantics: shape, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
      evidenceRefs: [evidence[index].calibrationEvidenceId],
      provenance: calibrationProvenance(env, 'fixture-spec', `definition-${domain}`),
    });
  });
  const calibrated = new Set(calibratedDomains);
  const assessments = allDomains.map((domain) => createDomainAssessment({
    environmentIdentity: env, domain,
    status: calibrated.has(domain) ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
    confidence: calibrated.has(domain) ? 1 : null,
    evidenceRefs: calibrated.has(domain)
      ? evidence.filter((entry) => entry.domain === domain).map((entry) => entry.calibrationEvidenceId) : [],
    provenance: calibrationProvenance(env, 'fixture-auditor', `assessment-${domain}`),
  }));
  return createEnvironmentCalibration({
    environmentIdentity: env, calibrationVersion: '1.0.0', evidence,
    semanticDefinitions: definitions, domainAssessments: assessments,
  });
}

function state(env, energy = 31, logicalTime = 10) {
  const runtime = { identity: env.runtimeIdentity, version: env.environmentVersion };
  const fact = createWorldStateFact({
    path: ['resources', 'actor', 'energy'], category: EpistemicCategory.OBSERVED,
    authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION, value: energy, confidence: 1,
    uncertainty: { status: 'BOUNDED', radius: 0 },
    provenance: traceProvenance(runtime, 'forge-observer', `energy-${energy}-${logicalTime}`),
  });
  return createWorldStateSnapshot({ environment: runtime, logicalTime, facts: [fact] });
}

function buildTrace(env = identity(), energy = 31) {
  const world = state(env, energy, 10);
  const runtime = world.environment;
  const observation = createObservationEvidence({
    observationId: `observation-${energy}`, environment: runtime, logicalTime: 10,
    observationDigest: `sha256:${sha256({ energy })}`,
    provenance: traceProvenance(runtime, 'forge-observer', `observation-${energy}`),
  });
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: world,
    featureContract: { id: 'SENTINEL_FEATURE_CONTRACT_V2', version: '2', hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb' },
    featureValues: { energy }, implementation: { id: 'extractor', version: '2', hash: 'sha256:extractor-v2' },
    provenance: traceProvenance(runtime, 'extractor', `feature-${energy}`),
  });
  const predictor = createPredictorEvidence({
    worldStateSnapshot: world, predictor: { id: 'risk-predictor', version: '1' },
    outputSummary: { actionId: 'MOVE', expectedEnergy: energy - 2 }, confidence: 0.8,
    uncertainty: { status: 'BOUNDED', radius: 1 },
    provenance: traceProvenance(runtime, 'risk-predictor', `prediction-${energy}`),
  });
  const router = createRouterEvaluationEvidence({
    featureDerivation: feature, predictorEvidence: [predictor],
    router: { id: 'STAGE3E_ROUTER', version: '3E', hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64' },
    score: 0.92, threshold: 0.9, selectedRoute: 'GREEDY', fallback: { available: true, used: false },
    provenance: traceProvenance(runtime, 'stage3e-router', `router-${energy}`),
  });
  const recommendation = createRecommendationEvidence({
    routerEvaluation: router, proposedAction: moveNorth, recommendedPath: 'GREEDY', confidence: 0.92,
    uncertainty: { status: 'BOUNDED' },
    provenance: traceProvenance(runtime, 'sentinel-shadow', `recommendation-${energy}`),
  });
  return createDecisionTimeTrace({
    observationEvidence: observation, worldStateSnapshot: world, featureDerivation: feature,
    predictorEvidence: [predictor], routerEvaluation: router, recommendation,
  });
}

function fixture(options = {}) {
  const env = options.env ?? identity();
  const calibration = buildCalibration({ env, calibratedDomains: options.calibratedDomains ?? [] });
  const trace = buildTrace(env, options.energy ?? 31);
  return { env, calibration, trace, ledger: createCounterfactualVetoLedger({ trace, calibration }) };
}

const selectedArgs = (env, action = moveSouth, evidenceId = 'selection-11') => ({
  selectedAction: action, selectedBy: { type: LedgerActorType.INCUMBENT, id: 'incumbent-primary' },
  executedBy: { type: LedgerActorType.INCUMBENT, id: 'incumbent-executor' }, logicalTime: 11,
  actionRef: `action:${action.actionId}:11`, provenance: ledgerProvenance(env, evidenceId),
});
const vetoArgs = (env, disposition = VetoDisposition.VETOED, evidenceId = 'veto-11', reason = null) => ({
  disposition, actor: { type: LedgerActorType.HUMAN, id: 'operator-1' }, reason, logicalTime: 11,
  provenance: ledgerProvenance(env, evidenceId),
});
const counterfactualArgs = (fx, action = moveNorth, evidenceId = 'counterfactual-10') => ({
  candidateAction: action,
  predictionRef: fx.trace.decisionTimeEvent.decisionTimeEvidence.predictorEvidence[0].predictorEvidenceId,
  predictionSource: { id: 'risk-predictor', version: '1' }, predictedOutcome: { expectedEnergy: 29 },
  predictedStateRef: { snapshotType: 'detached-prediction' }, predictedValue: { objective: 0.7 },
  predictedRisk: { failureProbability: 0.1 }, confidence: 0.8,
  uncertainty: { status: 'BOUNDED', radius: 1 }, timing: CounterfactualTiming.DECISION_TIME,
  generatedLogicalTime: 10, logicalTime: 10, provenance: ledgerProvenance(fx.env, evidenceId),
});

function traceWithOutcome(fx, energy = 29, evidenceId = `outcome-${energy}`) {
  return attachOutcome(fx.trace, {
    actualStateSnapshot: state(fx.env, energy, 12), logicalTime: 12,
    outcomeSummary: { energy }, observationCompleteness: 'COMPLETE',
    provenance: traceProvenance(fx.trace.environment, 'outcome-observer', evidenceId),
  });
}

test('identical ledger evidence produces identical identity and digest', () => {
  const a = fixture().ledger; const b = fixture().ledger;
  assert.equal(a.ledgerEntryId, b.ledgerEntryId); assert.equal(a.ledgerDigest, b.ledgerDigest);
});
test('different causal trace produces a different ledger identity', () => {
  assert.notEqual(fixture({ energy: 31 }).ledger.ledgerEntryId, fixture({ energy: 30 }).ledger.ledgerEntryId);
});
test('Sentinel proposal is preserved exactly from the causal trace', () => {
  const fx = fixture(); const rec = fx.trace.decisionTimeEvent.decisionTimeEvidence.recommendation;
  assert.equal(fx.ledger.projection.sentinelProposal.recommendationId, rec.recommendationId);
  assert.deepEqual(fx.ledger.projection.sentinelProposal.proposedAction, rec.proposedAction);
});
test('selected action is preserved separately', () => {
  const fx = fixture(); const ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env));
  assert.deepEqual(ledger.projection.selectedActions[0].selectedAction, moveSouth);
  assert.deepEqual(ledger.projection.sentinelProposal.proposedAction, moveNorth);
});
test('MATCH does not imply correctness', () => {
  const fx = fixture(); const ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env, moveNorth));
  assert.equal(ledger.projection.comparisonStatus, ActionComparisonStatus.MATCH);
  assert.equal(ledger.projection.selectedActions[0].correctnessStatus, 'UNKNOWN');
});
test('DIFFERENT_ACTION does not imply Sentinel error', () => {
  const fx = fixture(); const ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env));
  assert.equal(ledger.projection.comparisonStatus, ActionComparisonStatus.PARTIAL_MATCH);
  const different = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env, waitAction));
  assert.equal(different.projection.comparisonStatus, ActionComparisonStatus.DIFFERENT_ACTION);
  assert.equal(different.projection.evaluationStatus, LedgerEvaluationStatus.UNRESOLVED);
});
test('veto does not produce negative reward', () => {
  const fx = fixture(); const ledger = attachLedgerVeto(fx.ledger, vetoArgs(fx.env));
  assert.equal(ledger.projection.vetoes[0].negativeRewardAssigned, false);
  assert.equal('reward' in ledger.projection.vetoes[0], false);
});
test('override does not produce negative reward', () => {
  const fx = fixture(); const ledger = attachLedgerVeto(fx.ledger, vetoArgs(fx.env, VetoDisposition.OVERRIDDEN));
  assert.equal(ledger.projection.vetoes[0].negativeRewardAssigned, false);
});
test('absent veto reason remains UNKNOWN', () => {
  const fx = fixture(); const veto = attachLedgerVeto(fx.ledger, vetoArgs(fx.env)).projection.vetoes[0];
  assert.equal(veto.reason.category, VetoReasonCategory.UNKNOWN); assert.equal(veto.reason.confidence, null);
});
test('direct human reason is distinguished from derived classification', () => {
  const fx = fixture();
  const reason = (category, epistemicCategory, evidenceId) => ({ category, description: 'operator supplied context',
    epistemicCategory, confidence: 0.9, provenance: ledgerProvenance(fx.env, evidenceId, 'operator') });
  const direct = attachLedgerVeto(fx.ledger, vetoArgs(fx.env, VetoDisposition.VETOED, 'veto-direct', reason(VetoReasonCategory.SAFETY, EpistemicCategory.OBSERVED, 'direct')));
  const derived = attachLedgerVeto(fx.ledger, vetoArgs(fx.env, VetoDisposition.VETOED, 'veto-derived', reason(VetoReasonCategory.SAFETY, EpistemicCategory.DERIVED, 'derived')));
  assert.equal(direct.projection.vetoes[0].reason.epistemicCategory, EpistemicCategory.OBSERVED);
  assert.equal(derived.projection.vetoes[0].reason.epistemicCategory, EpistemicCategory.DERIVED);
});
test('counterfactual prediction remains PREDICTED', () => {
  const fx = fixture(); const record = attachLedgerCounterfactual(fx.ledger, counterfactualArgs(fx)).projection.counterfactuals[0];
  assert.equal(record.epistemicCategory, EpistemicCategory.PREDICTED);
});
test('unexecuted counterfactual never becomes observed', () => {
  const fx = fixture(); const record = attachLedgerCounterfactual(fx.ledger, counterfactualArgs(fx)).projection.counterfactuals[0];
  assert.equal(record.executed, false); assert.equal(record.observedOutcomeRef, null);
});
test('actual outcome binds separately through the causal trace', () => {
  const fx = fixture(); const trace = traceWithOutcome(fx); const outcome = trace.projection.outcomes[0];
  const ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: outcome.outcomeId });
  assert.equal(ledger.projection.outcomes[0].outcomeId, outcome.outcomeId);
  assert.equal(ledger.projection.outcomes[0].authoritativeStateSnapshotId, outcome.authoritativeStateSnapshotId);
});
test('missing outcome leaves evaluation UNRESOLVED', () => {
  const fx = fixture({ calibratedDomains: [CalibrationDomain.RESOURCE_SEMANTICS] });
  const ledger = attachLedgerEvaluation(fx.ledger, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], status: LedgerEvaluationStatus.SENTINEL_SUPPORTED,
    logicalTime: 12, provenance: ledgerProvenance(fx.env, 'evaluation') });
  assert.equal(ledger.projection.evaluationStatus, LedgerEvaluationStatus.UNRESOLVED);
});
test('outcome can attach later without changing decision identity', () => {
  const fx = fixture(); const trace = traceWithOutcome(fx); const before = fx.ledger.ledgerEntryId;
  const ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  assert.equal(ledger.ledgerEntryId, before); assert.equal(ledger.projection.outcomeStatus, 'BOUND');
});
test('decision-time prediction cannot be rewritten after outcome', () => {
  const fx = fixture(); let ledger = attachLedgerCounterfactual(fx.ledger, counterfactualArgs(fx));
  const frozenId = ledger.projection.counterfactuals[0].counterfactualId;
  const trace = traceWithOutcome(fx); ledger = attachLedgerActualOutcome(ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  assert.equal(ledger.projection.counterfactuals[0].counterfactualId, frozenId);
});
test('post-hoc prediction is distinguished from decision-time prediction', () => {
  const fx = fixture(); const args = { ...counterfactualArgs(fx), predictionRef: 'analysis:post-hoc:1',
    timing: CounterfactualTiming.POST_HOC_ANALYSIS, generatedLogicalTime: 13, logicalTime: 13,
    provenance: ledgerProvenance(fx.env, 'post-hoc') };
  const ledger = attachLedgerCounterfactual(fx.ledger, args);
  assert.equal(ledger.projection.counterfactuals[0].timing, CounterfactualTiming.POST_HOC_ANALYSIS);
});
test('multiple candidate actions are supported', () => {
  const fx = fixture(); let ledger = attachLedgerCounterfactual(fx.ledger, counterfactualArgs(fx));
  ledger = attachLedgerCounterfactual(ledger, { ...counterfactualArgs(fx, waitAction, 'cf-wait'), predictedOutcome: { expectedEnergy: 31 } });
  assert.equal(ledger.projection.counterfactuals.length, 2); assert.equal(ledger.projection.conflicts.counterfactuals, false);
});
test('incumbent and human actor identities are distinguished', () => {
  const fx = fixture(); let ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env));
  ledger = attachLedgerVeto(ledger, vetoArgs(fx.env));
  assert.equal(ledger.projection.selectedActions[0].selectedBy.type, LedgerActorType.INCUMBENT);
  assert.equal(ledger.projection.vetoes[0].actor.type, LedgerActorType.HUMAN);
});
test('selected-by and executed-by are distinguishable', () => {
  const fx = fixture(); const args = selectedArgs(fx.env);
  args.selectedBy = { type: LedgerActorType.HUMAN, id: 'operator-1' };
  const selection = attachLedgerSelectedAction(fx.ledger, args).projection.selectedActions[0];
  assert.notDeepEqual(selection.selectedBy, selection.executedBy);
});
test('calibration insufficiency blocks invalid comparison', () => {
  const fx = fixture(); const trace = traceWithOutcome(fx); let ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  ledger = attachLedgerEvaluation(ledger, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], status: LedgerEvaluationStatus.SENTINEL_SUPPORTED,
    logicalTime: 13, provenance: ledgerProvenance(fx.env, 'evaluation') });
  assert.equal(ledger.projection.evaluationStatus, LedgerEvaluationStatus.INCOMPARABLE);
  assert.equal(ledger.projection.evaluations[0].comparisonNotValid, 'CALIBRATION_INSUFFICIENT');
});

for (const [label, domain] of [
  ['resource comparison requires resource semantics', CalibrationDomain.RESOURCE_SEMANTICS],
  ['temporal comparison requires temporal semantics', CalibrationDomain.TEMPORAL_SEMANTICS],
  ['transition comparison requires transition semantics', CalibrationDomain.TRANSITION_SEMANTICS],
]) test(label, () => {
  const fx = fixture(); const trace = traceWithOutcome(fx); let ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  ledger = attachLedgerEvaluation(ledger, { calibration: fx.calibration, requiredCapabilities: [domain],
    status: LedgerEvaluationStatus.BOTH_PLAUSIBLE, logicalTime: 13, provenance: ledgerProvenance(fx.env, `eval-${domain}`) });
  assert.equal(ledger.projection.evaluationStatus, LedgerEvaluationStatus.INCOMPARABLE);
});

test('sufficient outcome-grounded comparison preserves calibrated metrics', () => {
  const fx = fixture({ calibratedDomains: [CalibrationDomain.RESOURCE_SEMANTICS] });
  const trace = traceWithOutcome(fx); let ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  ledger = attachLedgerEvaluation(ledger, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], status: LedgerEvaluationStatus.SENTINEL_SUPPORTED,
    metrics: [{ domain: CalibrationDomain.RESOURCE_SEMANTICS, metricType: 'PREDICTION_ERROR',
      predictionRef: fx.trace.decisionTimeEvent.decisionTimeEvidence.predictorEvidence[0].predictorEvidenceId,
      actualOutcomeRef: trace.projection.outcomes[0].outcomeId, value: 0 }],
    logicalTime: 13, provenance: ledgerProvenance(fx.env, 'evaluation') });
  assert.equal(ledger.projection.evaluationStatus, LedgerEvaluationStatus.SENTINEL_SUPPORTED);
  assert.equal(ledger.projection.evaluations[0].metrics.length, 1);
});
test('conflicting selected actions are preserved', () => {
  const fx = fixture(); let ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env, moveNorth, 'select-a'));
  ledger = attachLedgerSelectedAction(ledger, selectedArgs(fx.env, waitAction, 'select-b'));
  assert.equal(ledger.projection.selectedActions.length, 2); assert.equal(ledger.projection.lifecycleStatus, LedgerLifecycleStatus.CONFLICTED);
});
test('conflicting veto reasons are preserved', () => {
  const fx = fixture(); const reason = (category, id) => ({ category, description: id,
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, provenance: ledgerProvenance(fx.env, id) });
  let ledger = attachLedgerVeto(fx.ledger, vetoArgs(fx.env, VetoDisposition.VETOED, 'veto-a', reason(VetoReasonCategory.SAFETY, 'reason-a')));
  ledger = attachLedgerVeto(ledger, vetoArgs(fx.env, VetoDisposition.VETOED, 'veto-b', reason(VetoReasonCategory.POLICY, 'reason-b')));
  assert.equal(ledger.projection.vetoes.length, 2); assert.equal(ledger.projection.conflicts.vetoes, true);
});
test('conflicting outcome evidence is preserved', () => {
  const fx = fixture(); let trace = traceWithOutcome(fx, 29, 'outcome-a');
  trace = attachOutcome(trace, { actualStateSnapshot: state(fx.env, 28, 12), logicalTime: 12,
    outcomeSummary: { energy: 28 }, observationCompleteness: 'COMPLETE',
    provenance: traceProvenance(fx.trace.environment, 'outcome-observer', 'outcome-b') });
  let ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  ledger = attachLedgerActualOutcome(ledger, { trace, outcomeId: trace.projection.outcomes[1].outcomeId });
  assert.equal(ledger.projection.outcomes.length, 2); assert.equal(ledger.projection.conflicts.outcomes, true);
});
test('conflicted episode cannot produce definitive evaluation', () => {
  const fx = fixture({ calibratedDomains: [CalibrationDomain.RESOURCE_SEMANTICS] });
  let ledger = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env, moveNorth, 'a'));
  ledger = attachLedgerSelectedAction(ledger, selectedArgs(fx.env, waitAction, 'b'));
  ledger = attachLedgerEvaluation(ledger, { calibration: fx.calibration, requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS],
    status: LedgerEvaluationStatus.SENTINEL_SUPPORTED, logicalTime: 13, provenance: ledgerProvenance(fx.env, 'eval') });
  assert.equal(ledger.projection.evaluationStatus, LedgerEvaluationStatus.CONFLICTED);
});
test('definitive evaluation without outcome-grounded metrics fails closed', () => {
  const fx = fixture({ calibratedDomains: [CalibrationDomain.RESOURCE_SEMANTICS] });
  const trace = traceWithOutcome(fx); const ledger = attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId });
  assert.throws(() => attachLedgerEvaluation(ledger, { calibration: fx.calibration,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], status: LedgerEvaluationStatus.SENTINEL_SUPPORTED,
    logicalTime: 13, provenance: ledgerProvenance(fx.env, 'empty-evaluation') }), /outcome-grounded metrics/);
});
test('duplicate identical attachment is idempotent', () => {
  const fx = fixture(); const once = attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env));
  const twice = attachLedgerSelectedAction(once, selectedArgs(fx.env)); assert.equal(twice, once);
});
test('evidence order normalization is deterministic', () => {
  const fx = fixture(); const select = selectedArgs(fx.env); const veto = vetoArgs(fx.env);
  const a = attachLedgerVeto(attachLedgerSelectedAction(fx.ledger, select), veto);
  const b = attachLedgerSelectedAction(attachLedgerVeto(fx.ledger, veto), select);
  assert.equal(a.ledgerDigest, b.ledgerDigest); assert.equal(serializeCounterfactualVetoLedger(a), serializeCounterfactualVetoLedger(b));
});
test('same-name action across environments does not merge', () => {
  const a = fixture({ env: identity('world-a') }); const b = fixture({ env: identity('world-b') });
  assert.notEqual(a.ledger.ledgerEntryId, b.ledger.ledgerEntryId);
});
test('environment mismatch fails closed', () => {
  const fx = fixture(); assert.throws(() => attachLedgerSelectedAction(fx.ledger,
    { ...selectedArgs(fx.env), provenance: ledgerProvenance(identity('other-world'), 'bad') }), /environment/);
});
test('calibration mismatch fails closed', () => {
  const fx = fixture(); const other = buildCalibration({ env: identity('other-world') });
  assert.throws(() => attachLedgerEvaluation(fx.ledger, { calibration: other,
    requiredCapabilities: [CalibrationDomain.RESOURCE_SEMANTICS], status: LedgerEvaluationStatus.UNKNOWN,
    logicalTime: 12, provenance: ledgerProvenance(fx.env, 'eval') }), /calibration mismatch/);
});
test('trace mismatch fails closed', () => {
  const fx = fixture(); const other = fixture({ energy: 30 }); const trace = traceWithOutcome(other);
  assert.throws(() => attachLedgerActualOutcome(fx.ledger, { trace, outcomeId: trace.projection.outcomes[0].outcomeId }), /trace mismatch/);
});
test('DISAGREEMENT is structurally distinct from NEGATIVE_REWARD', () => {
  assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT.disagreementImpliesNegativeReward, false);
  assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT.automaticRewardAssignment, false);
});
test('agreement is structurally distinct from correctness', () => {
  assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT.agreementImpliesCorrectness, false);
});
test('R0 authority and non-dispatch invariants hold', () => {
  const ledger = fixture().ledger; assert.equal(ledger.authority.tier, 'R0');
  assert.equal(ledger.authority.canDispatch, false); assert.equal(ledger.authority.canMutateLiveWorld, false);
  assert.equal(ledger.decisionEpisode.sentinelProposal.dispatchPermitted, false);
});
test('online learning and training eligibility remain disabled', () => {
  const ledger = fixture().ledger; assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT.onlineLearningEnabled, false);
  assert.equal(ledger.projection.stage3f4Metadata.trainingEligibilityDecided, false);
});
test('contract is versioned, deterministic, and publicly exported', () => {
  assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT_ID, 'SENTINEL_COUNTERFACTUAL_VETO_LEDGER_V1');
  assert.equal(COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH, sha256(COUNTERFACTUAL_VETO_LEDGER_CONTRACT));
  assert.equal(publicApi.COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH, COUNTERFACTUAL_VETO_LEDGER_CONTRACT_HASH);
});
test('canonical verifier rejects tampering and accepts valid ledgers', () => {
  const ledger = fixture().ledger; assert.equal(verifyCounterfactualVetoLedger(ledger), true);
  assert.throws(() => verifyCounterfactualVetoLedger({ ...ledger, ledgerDigest: 'sha256:bad' }), /digest/);
});
test('missing trace and calibration refs fail closed', () => {
  const fx = fixture(); assert.throws(() => createCounterfactualVetoLedger({ trace: null, calibration: fx.calibration }));
  assert.throws(() => createCounterfactualVetoLedger({ trace: fx.trace, calibration: null }));
});
test('invalid actors fail closed and preserve prior evidence', () => {
  const fx = fixture(); const before = fx.ledger.ledgerDigest;
  assert.throws(() => attachLedgerSelectedAction(fx.ledger, { ...selectedArgs(fx.env), selectedBy: { type: 'ORACLE', id: 'x' } }), /selectedBy\.type/);
  assert.equal(fx.ledger.ledgerDigest, before);
});
test('counterfactual without provenance fails closed', () => {
  const fx = fixture(); assert.throws(() => attachLedgerCounterfactual(fx.ledger, { ...counterfactualArgs(fx), provenance: null }), /provenance/);
});
test('post-hoc prediction mislabeled as decision-time fails closed', () => {
  const fx = fixture(); assert.throws(() => attachLedgerCounterfactual(fx.ledger,
    { ...counterfactualArgs(fx), generatedLogicalTime: 13, logicalTime: 13 }), /post-outcome/);
});
test('decision-time counterfactual requires a Stage 3F.1 predictor ref', () => {
  const fx = fixture(); assert.throws(() => attachLedgerCounterfactual(fx.ledger,
    { ...counterfactualArgs(fx), predictionRef: 'invented-prediction' }), /Stage 3F.1 predictor/);
});
test('malformed provenance fails closed', () => {
  const fx = fixture(); assert.throws(() => attachLedgerVeto(fx.ledger,
    { ...vetoArgs(fx.env), provenance: {
      environmentId: fx.env.environmentId, environmentVersion: fx.env.environmentVersion,
    } }), /sourceId/);
});
test('unknown candidate action fails validation', () => {
  const fx = fixture(); assert.throws(() => attachLedgerCounterfactual(fx.ledger,
    { ...counterfactualArgs(fx), candidateAction: {} }), /actionId/);
});
test('duplicate veto is idempotent while a distinct late veto is preserved as conflict', () => {
  const fx = fixture(); const args = vetoArgs(fx.env); const once = attachLedgerVeto(fx.ledger, args);
  assert.equal(attachLedgerVeto(once, args), once);
  const late = attachLedgerVeto(once, { ...args, disposition: VetoDisposition.OVERRIDDEN,
    logicalTime: 12, provenance: ledgerProvenance(fx.env, 'late-veto') });
  assert.equal(late.projection.vetoes.length, 2); assert.equal(late.projection.conflicts.vetoes, true);
});
test('duplicate outcome is idempotent', () => {
  const fx = fixture(); const trace = traceWithOutcome(fx); const args = { trace, outcomeId: trace.projection.outcomes[0].outcomeId };
  const once = attachLedgerActualOutcome(fx.ledger, args); assert.equal(attachLedgerActualOutcome(once, args), once);
});
test('counterfactual prediction version conflict is preserved', () => {
  const fx = fixture(); let ledger = attachLedgerCounterfactual(fx.ledger, counterfactualArgs(fx));
  ledger = attachLedgerCounterfactual(ledger, { ...counterfactualArgs(fx, moveNorth, 'version-conflict'),
    predictionSource: { id: 'risk-predictor', version: '2' }, predictedOutcome: { expectedEnergy: 27 } });
  assert.equal(ledger.projection.counterfactuals.length, 2); assert.equal(ledger.projection.conflicts.counterfactuals, true);
});
test('no attachment API can mutate live world or incumbent behavior', () => {
  const fx = fixture(); const snapshot = stableStringify(fx.trace.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot);
  attachLedgerVeto(fx.ledger, vetoArgs(fx.env));
  assert.equal(stableStringify(fx.trace.decisionTimeEvent.decisionTimeEvidence.worldStateSnapshot), snapshot);
});
test('all lifecycle records retain deterministic serialization after clone replay', () => {
  const fx = fixture(); const ledger = attachLedgerCounterfactual(
    attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env)), counterfactualArgs(fx));
  const clone = structuredClone(ledger); assert.equal(verifyCounterfactualVetoLedger(clone), true);
  assert.equal(serializeCounterfactualVetoLedger(clone), serializeCounterfactualVetoLedger(ledger));
});
test('contract error type is stable', () => {
  const fx = fixture(); assert.throws(() => attachLedgerSelectedAction(fx.ledger, selectedArgs(fx.env, {})), CounterfactualVetoLedgerContractError);
});
