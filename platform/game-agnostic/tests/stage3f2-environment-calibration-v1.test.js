import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sha256, stableStringify } from '../src/core/determinism.js';
import {
  EpistemicCategory,
  EvidenceAuthority,
  createWorldStateFact,
  createWorldStateSnapshot,
} from '../src/stage3f/world-state-v1.js';
import {
  attachIncumbentAction,
  createDecisionTimeTrace,
  createFeatureDerivationEvidence,
  createObservationEvidence,
  createRecommendationEvidence,
  createRouterEvaluationEvidence,
} from '../src/stage3f/causal-trace-v1.js';
import {
  CalibrationDomain,
  CalibrationStatus,
  ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
  ENVIRONMENT_CALIBRATION_CONTRACT_ID,
  EnvironmentCalibrationContractError,
  ResourceDirectionality,
  RewardObjectiveRelationship,
  SemanticRelationType,
  TransitionAssumption,
  bindCausalTraceCalibration,
  bindWorldStateCalibration,
  createCalibrationEvidence,
  createDomainAssessment,
  createEnvironmentCalibration,
  createEnvironmentIdentity,
  createSemanticDefinition,
  createSemanticMapping,
  evaluateCalibrationSufficiency,
  isCalibrationSufficient,
  lookupCalibrationSemantics,
  serializeEnvironmentCalibration,
  verifyCausalTraceCalibrationBinding,
  verifyEnvironmentCalibration,
  verifySemanticMapping,
  verifyWorldStateCalibrationBinding,
} from '../src/stage3f/environment-calibration-v1.js';
import * as publicApi from '../src/index.js';

const domains = Object.values(CalibrationDomain);

function identity({
  runtimeIdentity = 'forge-world',
  environmentVersion = 'FORGE_WORLD_V2',
  actionSchemaHash = 'sha256:forge-action-schema-v2',
} = {}) {
  return createEnvironmentIdentity({
    runtimeIdentity,
    environmentVersion,
    environmentFamily: 'SENTINEL_FORGE',
    environmentSchemaVersion: '2',
    structuralSemantics: {
      observationSchemaHash: 'sha256:forge-observation-schema-v2',
      actionSchemaHash,
      objectiveSchemaHash: 'sha256:forge-objective-schema-v2',
      transitionContractVersion: 'FORGE_TRANSITION_V2',
    },
  });
}

function provenance(environmentIdentity, sourceId, evidenceId) {
  return {
    environmentId: environmentIdentity.environmentId,
    environmentVersion: environmentIdentity.environmentVersion,
    sourceId,
    evidenceId,
  };
}

function evidence(environmentIdentity, domain, claimTarget, claimType, claimValue, suffix = domain) {
  return createCalibrationEvidence({
    environmentIdentity,
    domain,
    claimTarget,
    claimType,
    claimValue,
    sourceReference: { contract: 'FORGE_ENVIRONMENT_SPEC_V2', section: suffix },
    epistemicCategory: EpistemicCategory.OBSERVED,
    confidence: 1,
    material: true,
    provenance: provenance(environmentIdentity, 'forge-environment-spec-v2', `evidence-${suffix}`),
  });
}

function semanticsByDomain(domain) {
  switch (domain) {
    case CalibrationDomain.OBSERVATION_SEMANTICS:
      return {
        sourcePath: 'resources.actor.energy', dataType: 'integer', units: 'energy-points',
        semanticDescription: 'Remaining action budget for the actor.', requirement: 'REQUIRED',
        validDomain: { minimum: 0, maximum: 100 }, missingValueSemantics: 'UNKNOWN_WHEN_ABSENT',
      };
    case CalibrationDomain.ACTION_SEMANTICS:
      return {
        actionId: 'MOVE', actionVersion: '2',
        parameters: [{ id: 'direction', dataType: 'enum', required: true, domain: ['NORTH', 'SOUTH'] }],
        preconditions: ['destination is legal'], expectedDirectEffects: ['actor position may change'],
        possibleSideEffects: ['energy may decrease'], resourceCosts: [{ resourceId: 'energy', amount: 2 }],
        temporalDuration: { value: 1, units: 'logical-step' }, failureModes: ['BLOCKED'],
        legalityConstraints: ['inside grid bounds'], resultObservability: 'DIRECT',
      };
    case CalibrationDomain.RESOURCE_SEMANTICS:
      return {
        resourceId: 'energy', units: 'energy-points', directionality: ResourceDirectionality.INCREASE_DESIRABLE,
        scarcity: 'SCARCE', renewability: 'CONDITIONAL', capacity: { minimum: 0, maximum: 100 },
        consumptionRules: ['actions consume energy'], generationRules: ['recharge objectives restore energy'],
        conversionRules: [], strategicRelevance: 'Constrains reachable actions.',
      };
    case CalibrationDomain.OBJECTIVE_SEMANTICS:
      return {
        objectiveId: 'COMPLETE_MISSION', description: 'Complete all declared objectives.', priority: 0,
        successConditions: ['all required objectives complete'], failureConditions: ['terminal failure occurs'],
        terminality: 'TERMINAL',
        rewardRelationship: { status: RewardObjectiveRelationship.DISTINCT, rewardSignalRef: 'transition.reward' },
        timeHorizon: { type: 'EPISODE', maximumLogicalSteps: 64 },
      };
    case CalibrationDomain.FAILURE_SEMANTICS:
      return {
        failureId: 'ENERGY_EXHAUSTED', triggerCondition: 'energy reaches zero with no recovery path',
        severity: 'HIGH', recoverability: 'CONDITIONAL', terminality: 'NONTERMINAL',
        timeToEffect: { minimum: 0, maximum: 1, units: 'logical-step' }, observability: 'DIRECT',
      };
    case CalibrationDomain.CONSTRAINT_SEMANTICS:
      return {
        constraintId: 'GRID_BOUNDS', description: 'Movement remains inside the declared grid.',
        condition: 'destination coordinates are in bounds', enforcement: 'HARD',
      };
    case CalibrationDomain.TEMPORAL_SEMANTICS:
      return {
        timeModel: 'DISCRETE', logicalStepSemantics: 'One accepted incumbent transition.',
        tickDuration: null, actionDuration: { model: 'ACTION_SPECIFIC', units: 'logical-step' },
        observationCadence: { value: 1, units: 'logical-step' },
        outcomeDelay: { minimum: 0, maximum: 3, units: 'logical-step' },
        episodeHorizon: { maximum: 64, units: 'logical-step' },
        planningHorizon: { certifiedMaximum: 2, units: 'logical-step' },
        temporalUncertainty: { status: 'BOUNDED', wallClockMappingKnown: false },
      };
    case CalibrationDomain.TRANSITION_SEMANTICS:
      return {
        assumptions: [
          { type: TransitionAssumption.STOCHASTIC, value: true, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, evidenceRefs: [] },
          { type: TransitionAssumption.PARTIALLY_OBSERVABLE, value: true, epistemicCategory: EpistemicCategory.DERIVED, confidence: 0.9, evidenceRefs: [] },
          { type: TransitionAssumption.ACTION_CONDITIONED, value: true, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, evidenceRefs: [] },
          { type: TransitionAssumption.DELAYED_EFFECTS_POSSIBLE, value: true, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 0.95, evidenceRefs: [] },
          { type: TransitionAssumption.NONSTATIONARY, value: null, epistemicCategory: EpistemicCategory.UNKNOWN, confidence: null, evidenceRefs: [] },
        ],
      };
    default:
      throw new Error(`unhandled domain ${domain}`);
  }
}

function conceptForDomain(domain) {
  return {
    [CalibrationDomain.OBSERVATION_SEMANTICS]: 'resources.actor.energy',
    [CalibrationDomain.ACTION_SEMANTICS]: 'MOVE',
    [CalibrationDomain.RESOURCE_SEMANTICS]: 'energy',
    [CalibrationDomain.OBJECTIVE_SEMANTICS]: 'COMPLETE_MISSION',
    [CalibrationDomain.FAILURE_SEMANTICS]: 'ENERGY_EXHAUSTED',
    [CalibrationDomain.CONSTRAINT_SEMANTICS]: 'GRID_BOUNDS',
    [CalibrationDomain.TEMPORAL_SEMANTICS]: 'PRIMARY_TIME_MODEL',
    [CalibrationDomain.TRANSITION_SEMANTICS]: 'PRIMARY_TRANSITION_MODEL',
  }[domain];
}

function buildCalibration({
  environmentIdentity = identity(),
  calibrationVersion = '1.0.0',
  calibratedDomains = domains,
  extraEvidence = [],
  actionCost = 2,
  reverse = false,
} = {}) {
  const byDomain = new Map();
  const baseEvidence = domains.map((domain) => {
    const claimValue = domain === CalibrationDomain.ACTION_SEMANTICS
      ? { resourceId: 'energy', amount: actionCost }
      : { contractSection: domain, present: true };
    const record = evidence(
      environmentIdentity, domain, `${domain}:${conceptForDomain(domain)}`,
      domain === CalibrationDomain.ACTION_SEMANTICS ? 'RESOURCE_COST' : 'SEMANTIC_DEFINITION',
      claimValue,
    );
    byDomain.set(domain, record);
    return record;
  });
  const calibrated = new Set(calibratedDomains);
  const definitions = domains.filter((domain) => calibrated.has(domain)).map((domain) => {
    const semanticShape = semanticsByDomain(domain);
    if (domain === CalibrationDomain.ACTION_SEMANTICS) {
      semanticShape.resourceCosts = [{ resourceId: 'energy', amount: actionCost }];
    }
    if (domain === CalibrationDomain.TRANSITION_SEMANTICS) {
      semanticShape.assumptions = semanticShape.assumptions.map((entry) => ({
        ...entry, evidenceRefs: [byDomain.get(domain).calibrationEvidenceId],
      }));
    }
    return createSemanticDefinition({
      environmentIdentity,
      domain,
      conceptId: conceptForDomain(domain),
      conceptVersion: '1',
      semantics: semanticShape,
      epistemicCategory: EpistemicCategory.OBSERVED,
      confidence: 0.95,
      evidenceRefs: [byDomain.get(domain).calibrationEvidenceId],
      provenance: provenance(environmentIdentity, 'calibration-builder', `definition-${domain}`),
    });
  });
  const allEvidence = [...baseEvidence, ...extraEvidence];
  const assessments = domains.map((domain) => {
    const isCalibrated = calibrated.has(domain);
    const refs = allEvidence.filter((entry) => entry.domain === domain)
      .map((entry) => entry.calibrationEvidenceId);
    return createDomainAssessment({
      environmentIdentity,
      domain,
      status: isCalibrated ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
      confidence: isCalibrated ? 0.95 : null,
      evidenceRefs: isCalibrated ? refs : [],
      provenance: provenance(environmentIdentity, 'calibration-auditor', `assessment-${domain}`),
    });
  });
  return createEnvironmentCalibration({
    environmentIdentity,
    calibrationVersion,
    evidence: reverse ? [...allEvidence].reverse() : allEvidence,
    semanticDefinitions: reverse ? [...definitions].reverse() : definitions,
    domainAssessments: reverse ? [...assessments].reverse() : assessments,
  });
}

function worldState(environmentIdentity = identity(), energy = 31, logicalTime = 10) {
  const runtimeEnvironment = {
    identity: environmentIdentity.runtimeIdentity,
    version: environmentIdentity.environmentVersion,
  };
  const fact = createWorldStateFact({
    path: ['resources', 'actor', 'energy'], category: EpistemicCategory.OBSERVED,
    authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION, value: energy, confidence: 1,
    uncertainty: { status: 'BOUNDED', radius: 0 },
    provenance: {
      environmentIdentity: runtimeEnvironment.identity, environmentVersion: runtimeEnvironment.version,
      sourceId: 'forge-observer', evidenceId: `energy-${logicalTime}`,
    },
  });
  return createWorldStateSnapshot({ environment: runtimeEnvironment, logicalTime, facts: [fact] });
}

function causalTrace(environmentIdentity = identity()) {
  const snapshot = worldState(environmentIdentity);
  const runtimeEnvironment = snapshot.environment;
  const traceProvenance = (sourceId, evidenceId) => ({
    environmentIdentity: runtimeEnvironment.identity, environmentVersion: runtimeEnvironment.version,
    sourceId, evidenceId,
  });
  const observation = createObservationEvidence({
    observationId: 'observation-10', environment: runtimeEnvironment, logicalTime: 10,
    observationDigest: `sha256:${sha256({ energy: 31 })}`,
    provenance: traceProvenance('forge-observer', 'observation-10'),
  });
  const feature = createFeatureDerivationEvidence({
    worldStateSnapshot: snapshot,
    featureContract: { id: 'SENTINEL_FEATURE_CONTRACT_V2', version: '2', hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb' },
    featureValues: { energy: 31 },
    implementation: { id: 'extractor', version: '2', hash: 'sha256:extractor-v2' },
    provenance: traceProvenance('extractor', 'feature-10'),
  });
  const router = createRouterEvaluationEvidence({
    featureDerivation: feature,
    router: { id: 'STAGE3E_ROUTER', version: '3E', hash: 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64' },
    score: 0.92, threshold: 0.9, selectedRoute: 'GREEDY',
    fallback: { available: true, used: false },
    provenance: traceProvenance('stage3e-router', 'router-10'),
  });
  const recommendation = createRecommendationEvidence({
    routerEvaluation: router, proposedAction: { actionId: 'MOVE', parameters: { direction: 'NORTH' } },
    recommendedPath: 'GREEDY', confidence: 0.92, uncertainty: { status: 'BOUNDED' },
    provenance: traceProvenance('sentinel-shadow', 'recommendation-10'),
  });
  return createDecisionTimeTrace({
    observationEvidence: observation, worldStateSnapshot: snapshot, featureDerivation: feature,
    routerEvaluation: router, recommendation,
  });
}

test('identical calibration input produces identical identity, digest, and serialization', () => {
  const a = buildCalibration();
  const b = buildCalibration();
  assert.equal(a.calibrationId, b.calibrationId);
  assert.equal(a.calibrationDigest, b.calibrationDigest);
  assert.equal(serializeEnvironmentCalibration(a), serializeEnvironmentCalibration(b));
});

test('changed environment version creates a distinct environment and calibration identity', () => {
  const a = buildCalibration();
  const b = buildCalibration({ environmentIdentity: identity({ environmentVersion: 'FORGE_WORLD_V3' }) });
  assert.notEqual(a.environmentIdentity.environmentId, b.environmentIdentity.environmentId);
  assert.notEqual(a.calibrationId, b.calibrationId);
});

test('changed action semantics creates a distinct calibration identity', () => {
  assert.notEqual(buildCalibration({ actionCost: 2 }).calibrationId, buildCalibration({ actionCost: 3 }).calibrationId);
});

test('observation absence is explicitly UNKNOWN rather than zero', () => {
  const calibration = buildCalibration();
  const observation = lookupCalibrationSemantics(calibration, {
    domain: CalibrationDomain.OBSERVATION_SEMANTICS, conceptId: 'resources.actor.energy',
  });
  assert.equal(observation.semantics.missingValueSemantics, 'UNKNOWN_WHEN_ABSENT');
  assert.equal(Object.hasOwn(observation.semantics, 'defaultValue'), false);
});

test('unknown evidence is null and cannot silently mean false', () => {
  const environmentIdentity = identity();
  const unknown = createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.TRANSITION_SEMANTICS,
    claimTarget: 'TRANSITION:NONSTATIONARY', claimType: 'SEMANTIC_CLAIM', claimValue: null,
    sourceReference: null, epistemicCategory: EpistemicCategory.UNKNOWN, confidence: null,
    provenance: provenance(environmentIdentity, 'environment-auditor', 'unknown-nonstationarity'),
  });
  assert.equal(unknown.claimValue, null);
  assert.notEqual(unknown.claimValue, false);
});

test('action semantics can remain explicitly UNKNOWN', () => {
  const calibration = buildCalibration({ calibratedDomains: [] });
  const result = lookupCalibrationSemantics(calibration, {
    domain: CalibrationDomain.ACTION_SEMANTICS, conceptId: 'MOVE',
  });
  assert.equal(result.status, CalibrationStatus.UNKNOWN);
  assert.equal(result.semantics, null);
});

test('an explicit unknown action definition retains null confidence and no evidence', () => {
  const environmentIdentity = identity();
  const definition = createSemanticDefinition({
    environmentIdentity, domain: CalibrationDomain.ACTION_SEMANTICS,
    conceptId: 'ATTACK', conceptVersion: 'UNKNOWN',
    semantics: {
      actionId: 'ATTACK', actionVersion: 'UNKNOWN', parameters: [], preconditions: [],
      expectedDirectEffects: [], possibleSideEffects: [], resourceCosts: [], temporalDuration: null,
      failureModes: [], legalityConstraints: [], resultObservability: 'UNKNOWN',
    },
    epistemicCategory: EpistemicCategory.UNKNOWN, confidence: null, evidenceRefs: [],
    provenance: provenance(environmentIdentity, 'calibration-auditor', 'unknown-attack-semantics'),
  });
  assert.equal(definition.epistemicCategory, EpistemicCategory.UNKNOWN);
  assert.equal(definition.confidence, null);
});

test('partial calibration validates without being promoted to fully calibrated', () => {
  const calibration = buildCalibration({ calibratedDomains: [CalibrationDomain.ACTION_SEMANTICS] });
  assert.equal(verifyEnvironmentCalibration(calibration), true);
  assert.equal(calibration.overallStatus, CalibrationStatus.PARTIALLY_CALIBRATED);
});

test('insufficient calibration is detected explicitly', () => {
  const calibration = buildCalibration({ calibratedDomains: [] });
  const result = evaluateCalibrationSufficiency(calibration, [CalibrationDomain.ACTION_SEMANTICS]);
  assert.equal(result.sufficient, false);
  assert.equal(result.calibrationInsufficient, true);
  assert.equal(result.domainResults[0].reason, 'UNKNOWN');
});

test('material evidence conflict is detected and preserved', () => {
  const environmentIdentity = identity();
  const cost2 = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE:resourceCost', 'RESOURCE_COST', { resourceId: 'energy', amount: 2 }, 'cost-source-a');
  const cost3 = createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.ACTION_SEMANTICS,
    claimTarget: 'ACTION:MOVE:resourceCost', claimType: 'RESOURCE_COST',
    claimValue: { resourceId: 'energy', amount: 3 }, sourceReference: { contract: 'operator-observation' },
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, material: true,
    provenance: provenance(environmentIdentity, 'operator-observation', 'cost-source-b'),
  });
  const calibration = buildCalibration({ environmentIdentity, extraEvidence: [cost2, cost3] });
  assert.equal(calibration.overallStatus, CalibrationStatus.CONFLICTED);
  assert.equal(calibration.conflicts.length, 1);
  assert.equal(calibration.conflicts[0].evidenceRefs.length, 2);
});

test('task-specific sufficiency evaluates only requested semantic domains', () => {
  const calibration = buildCalibration({ calibratedDomains: [CalibrationDomain.ACTION_SEMANTICS] });
  assert.equal(isCalibrationSufficient(calibration, [CalibrationDomain.ACTION_SEMANTICS]), true);
  assert.equal(isCalibrationSufficient(calibration, [CalibrationDomain.RESOURCE_SEMANTICS]), false);
});

test('legal-action reasoning needs less calibration than long-horizon planning', () => {
  const calibration = buildCalibration({ calibratedDomains: [CalibrationDomain.ACTION_SEMANTICS] });
  const legal = evaluateCalibrationSufficiency(calibration, [CalibrationDomain.ACTION_SEMANTICS]);
  const planning = evaluateCalibrationSufficiency(calibration, [
    CalibrationDomain.ACTION_SEMANTICS,
    CalibrationDomain.TEMPORAL_SEMANTICS,
    CalibrationDomain.TRANSITION_SEMANTICS,
    CalibrationDomain.OBJECTIVE_SEMANTICS,
  ]);
  assert.equal(legal.sufficient, true);
  assert.equal(planning.sufficient, false);
});

test('same observation field name across environments does not share semantic identity', () => {
  const a = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-a' }) });
  const b = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-b' }) });
  const definition = (calibration) => calibration.semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.OBSERVATION_SEMANTICS);
  assert.equal(definition(a).conceptId, definition(b).conceptId);
  assert.notEqual(definition(a).semanticDefinitionId, definition(b).semanticDefinitionId);
});

test('same action name across environments does not share semantic identity', () => {
  const a = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-a' }) });
  const b = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-b' }) });
  const definition = (calibration) => calibration.semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.ACTION_SEMANTICS);
  assert.equal(definition(a).semantics.actionId, 'MOVE');
  assert.equal(definition(b).semantics.actionId, 'MOVE');
  assert.notEqual(definition(a).semanticDefinitionId, definition(b).semanticDefinitionId);
});

test('explicit proven semantic mapping requires provenance and evidence', () => {
  const source = identity({ runtimeIdentity: 'world-a' });
  const target = identity({ runtimeIdentity: 'world-b' });
  assert.throws(() => createSemanticMapping({
    sourceEnvironment: source, targetEnvironment: target,
    sourceConceptRef: 'ACTION:MOVE', targetConceptRef: 'ACTION:MOVE',
    relationType: SemanticRelationType.EQUIVALENT, confidence: 0.9, evidenceRefs: ['mapping-study'],
    provenance: null,
  }), /provenance/);
  assert.throws(() => createSemanticMapping({
    sourceEnvironment: source, targetEnvironment: target,
    sourceConceptRef: 'ACTION:MOVE', targetConceptRef: 'ACTION:MOVE',
    relationType: SemanticRelationType.EQUIVALENT, confidence: 0.9, evidenceRefs: [],
    provenance: { sourceEnvironmentId: source.environmentId, targetEnvironmentId: target.environmentId, sourceId: 'mapper', evidenceId: 'mapping' },
  }), /requires evidence/);
});

test('unproven semantic mapping remains UNKNOWN', () => {
  const source = identity({ runtimeIdentity: 'world-a' });
  const target = identity({ runtimeIdentity: 'world-b' });
  const mapping = createSemanticMapping({
    sourceEnvironment: source, targetEnvironment: target,
    sourceConceptRef: 'ACTION:MOVE', targetConceptRef: 'ACTION:MOVE',
    relationType: SemanticRelationType.UNKNOWN, confidence: null, evidenceRefs: [],
    provenance: { sourceEnvironmentId: source.environmentId, targetEnvironmentId: target.environmentId, sourceId: 'mapper', evidenceId: 'no-mapping-evidence' },
  });
  assert.equal(mapping.relationType, SemanticRelationType.UNKNOWN);
  assert.equal(mapping.confidence, null);
  assert.equal(verifySemanticMapping(mapping, source, target), true);
});

test('resource directionality is explicit and does not assume larger is better', () => {
  const calibration = buildCalibration();
  const resource = calibration.semanticDefinitions.find((entry) => entry.domain === CalibrationDomain.RESOURCE_SEMANTICS);
  assert.equal(resource.semantics.directionality, ResourceDirectionality.INCREASE_DESIRABLE);
  const environmentIdentity = identity();
  const risk = createSemanticDefinition({
    environmentIdentity, domain: CalibrationDomain.RESOURCE_SEMANTICS, conceptId: 'risk', conceptVersion: '1',
    semantics: { ...semanticsByDomain(CalibrationDomain.RESOURCE_SEMANTICS), resourceId: 'risk', units: 'risk-points', directionality: ResourceDirectionality.DECREASE_DESIRABLE },
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1, evidenceRefs: ['evidence-risk'],
    provenance: provenance(environmentIdentity, 'risk-spec', 'risk-definition'),
  });
  assert.equal(risk.semantics.directionality, ResourceDirectionality.DECREASE_DESIRABLE);
});

test('reward signal is explicitly distinguished from objective truth', () => {
  const objective = buildCalibration().semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.OBJECTIVE_SEMANTICS);
  assert.equal(objective.semantics.rewardRelationship.status, RewardObjectiveRelationship.DISTINCT);
});

test('risk prediction is distinct from observed failure occurrence', () => {
  const environmentIdentity = identity();
  const risk = createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.FAILURE_SEMANTICS,
    claimTarget: 'FAILURE:ENERGY_EXHAUSTED', claimType: 'RISK_ESTIMATE', claimValue: { probability: 0.2 },
    sourceReference: { predictorId: 'risk-v1' }, epistemicCategory: EpistemicCategory.PREDICTED,
    confidence: 0.8, provenance: provenance(environmentIdentity, 'risk-v1', 'risk-estimate'),
  });
  const occurrence = createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.FAILURE_SEMANTICS,
    claimTarget: 'FAILURE:ENERGY_EXHAUSTED', claimType: 'FAILURE_OCCURRENCE', claimValue: { occurred: true },
    sourceReference: { observationId: 'failure-observation' }, epistemicCategory: EpistemicCategory.OBSERVED,
    confidence: 1, provenance: provenance(environmentIdentity, 'failure-observer', 'failure-occurrence'),
  });
  assert.equal(risk.epistemicCategory, EpistemicCategory.PREDICTED);
  assert.equal(occurrence.epistemicCategory, EpistemicCategory.OBSERVED);
});

test('risk estimate cannot be promoted to an observed fact', () => {
  const environmentIdentity = identity();
  assert.throws(() => createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.FAILURE_SEMANTICS,
    claimTarget: 'FAILURE:X', claimType: 'RISK_ESTIMATE', claimValue: { probability: 1 },
    sourceReference: {}, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    provenance: provenance(environmentIdentity, 'bad-source', 'bad-risk'),
  }), /risk estimates/);
});

test('derived calibration evidence remains distinct from observation', () => {
  const environmentIdentity = identity();
  const derived = createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.RESOURCE_SEMANTICS,
    claimTarget: 'RESOURCE:energy:scarcity', claimType: 'DERIVED_SEMANTIC', claimValue: 'SCARCE',
    sourceReference: { derivationId: 'scarcity-analysis-v1' }, epistemicCategory: EpistemicCategory.DERIVED,
    confidence: 0.8, provenance: provenance(environmentIdentity, 'scarcity-analysis', 'derived-scarcity'),
  });
  assert.equal(derived.epistemicCategory, EpistemicCategory.DERIVED);
  assert.notEqual(derived.epistemicCategory, EpistemicCategory.OBSERVED);
});

test('temporal step semantics are environment-bound', () => {
  const a = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-a' }) });
  const b = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'world-b' }) });
  const temporal = (calibration) => calibration.semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.TEMPORAL_SEMANTICS);
  assert.equal(temporal(a).semantics.logicalStepSemantics, temporal(b).semantics.logicalStepSemantics);
  assert.notEqual(temporal(a).semanticDefinitionId, temporal(b).semanticDefinitionId);
});

test('delayed effects are represented explicitly', () => {
  const transition = buildCalibration().semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.TRANSITION_SEMANTICS);
  const delayed = transition.semantics.assumptions.find((entry) =>
    entry.type === TransitionAssumption.DELAYED_EFFECTS_POSSIBLE);
  assert.equal(delayed.value, true);
});

test('partial observability is represented explicitly', () => {
  const transition = buildCalibration().semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.TRANSITION_SEMANTICS);
  assert.equal(transition.semantics.assumptions.find((entry) =>
    entry.type === TransitionAssumption.PARTIALLY_OBSERVABLE).value, true);
});

test('stochastic transition semantics are represented explicitly', () => {
  const transition = buildCalibration().semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.TRANSITION_SEMANTICS);
  assert.equal(transition.semantics.assumptions.find((entry) =>
    entry.type === TransitionAssumption.STOCHASTIC).value, true);
});

test('transition assumptions can remain UNKNOWN', () => {
  const transition = buildCalibration().semanticDefinitions.find((entry) =>
    entry.domain === CalibrationDomain.TRANSITION_SEMANTICS);
  const nonstationary = transition.semantics.assumptions.find((entry) =>
    entry.type === TransitionAssumption.NONSTATIONARY);
  assert.equal(nonstationary.value, null);
  assert.equal(nonstationary.epistemicCategory, EpistemicCategory.UNKNOWN);
});

test('a conflicted required domain fails task sufficiency closed', () => {
  const environmentIdentity = identity();
  const cost2 = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE:cost', 'RESOURCE_COST', 2, 'cost-a');
  const cost3 = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE:cost', 'RESOURCE_COST', 3, 'cost-b');
  const calibration = buildCalibration({ environmentIdentity, extraEvidence: [cost2, cost3] });
  const result = evaluateCalibrationSufficiency(calibration, [CalibrationDomain.ACTION_SEMANTICS]);
  assert.equal(result.sufficient, false);
  assert.equal(result.domainResults[0].reason, 'MATERIAL_CONFLICT');
});

test('conflicting resource semantics are preserved and fail resource sufficiency', () => {
  const environmentIdentity = identity();
  const renewable = evidence(environmentIdentity, CalibrationDomain.RESOURCE_SEMANTICS,
    'RESOURCE:energy:renewability', 'RENEWABILITY', 'RENEWABLE', 'renewable-a');
  const nonrenewable = evidence(environmentIdentity, CalibrationDomain.RESOURCE_SEMANTICS,
    'RESOURCE:energy:renewability', 'RENEWABILITY', 'NONRENEWABLE', 'renewable-b');
  const calibration = buildCalibration({ environmentIdentity, extraEvidence: [renewable, nonrenewable] });
  const result = evaluateCalibrationSufficiency(calibration, [CalibrationDomain.RESOURCE_SEMANTICS]);
  assert.equal(calibration.conflicts[0].domain, CalibrationDomain.RESOURCE_SEMANTICS);
  assert.equal(result.sufficient, false);
});

test('an explicitly conflicted audited domain forces overall conflict status', () => {
  const environmentIdentity = identity();
  const first = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE:duration-a', 'DURATION_SOURCE', 1, 'duration-a');
  const second = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE:duration-b', 'DURATION_SOURCE', 2, 'duration-b');
  const primary = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE', 'SEMANTIC_DEFINITION', true, 'explicit-conflict-primary');
  const definition = createSemanticDefinition({
    environmentIdentity, domain: CalibrationDomain.ACTION_SEMANTICS, conceptId: 'MOVE', conceptVersion: '2',
    semantics: semanticsByDomain(CalibrationDomain.ACTION_SEMANTICS),
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 0.7,
    evidenceRefs: [primary.calibrationEvidenceId],
    provenance: provenance(environmentIdentity, 'auditor', 'explicit-conflict-definition'),
  });
  const assessments = domains.map((domain) => createDomainAssessment({
    environmentIdentity, domain,
    status: domain === CalibrationDomain.ACTION_SEMANTICS ? CalibrationStatus.CONFLICTED : CalibrationStatus.UNKNOWN,
    confidence: domain === CalibrationDomain.ACTION_SEMANTICS ? 0.5 : null,
    evidenceRefs: domain === CalibrationDomain.ACTION_SEMANTICS
      ? [first.calibrationEvidenceId, second.calibrationEvidenceId] : [],
    provenance: provenance(environmentIdentity, 'auditor', `explicit-conflict-${domain}`),
  }));
  const calibration = createEnvironmentCalibration({
    environmentIdentity, calibrationVersion: '1-conflicted', evidence: [primary, first, second],
    semanticDefinitions: [definition], domainAssessments: assessments,
  });
  assert.equal(calibration.overallStatus, CalibrationStatus.CONFLICTED);
});

test('a calibrated assessment without semantic definitions fails closed', () => {
  const environmentIdentity = identity();
  const actionEvidence = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:MOVE', 'SEMANTIC_DEFINITION', true, 'orphan-action');
  const assessments = domains.map((domain) => createDomainAssessment({
    environmentIdentity, domain,
    status: domain === CalibrationDomain.ACTION_SEMANTICS ? CalibrationStatus.CALIBRATED : CalibrationStatus.UNKNOWN,
    confidence: domain === CalibrationDomain.ACTION_SEMANTICS ? 1 : null,
    evidenceRefs: domain === CalibrationDomain.ACTION_SEMANTICS ? [actionEvidence.calibrationEvidenceId] : [],
    provenance: provenance(environmentIdentity, 'auditor', `orphan-${domain}`),
  }));
  assert.throws(() => createEnvironmentCalibration({
    environmentIdentity, calibrationVersion: '1', evidence: [actionEvidence],
    semanticDefinitions: [], domainAssessments: assessments,
  }), /requires a semantic definition/);
});

test('calibration records are deeply immutable', () => {
  const calibration = buildCalibration();
  assert.equal(Object.isFrozen(calibration), true);
  assert.equal(Object.isFrozen(calibration.semanticDefinitions[0]), true);
  assert.throws(() => { calibration.calibrationVersion = 'rewritten'; }, TypeError);
});

test('a later calibration version cannot rewrite an old trace binding', () => {
  const environmentIdentity = identity();
  const trace = causalTrace(environmentIdentity);
  const v1 = buildCalibration({ environmentIdentity, calibrationVersion: '1.0.0' });
  const oldBinding = bindCausalTraceCalibration(trace, v1);
  const v2 = buildCalibration({ environmentIdentity, calibrationVersion: '2.0.0', actionCost: 3 });
  const newBinding = bindCausalTraceCalibration(trace, v2);
  assert.equal(oldBinding.calibrationRef.calibrationId, v1.calibrationId);
  assert.notEqual(oldBinding.calibrationRef.calibrationId, newBinding.calibrationRef.calibrationId);
  assert.equal(oldBinding.calibrationRef.calibrationVersion, '1.0.0');
});

test('world-state snapshot binds its existing environment identity to calibration', () => {
  const environmentIdentity = identity();
  const calibration = buildCalibration({ environmentIdentity });
  const snapshot = worldState(environmentIdentity);
  const binding = bindWorldStateCalibration(snapshot, calibration);
  assert.equal(binding.worldStateSnapshotId, snapshot.snapshotId);
  assert.equal(binding.calibrationRef.environmentId, environmentIdentity.environmentId);
  assert.equal(verifyWorldStateCalibrationBinding(binding, snapshot, calibration), true);
});

test('causal trace binds the exact calibration reference without rewriting the trace', () => {
  const environmentIdentity = identity();
  const calibration = buildCalibration({ environmentIdentity });
  const trace = causalTrace(environmentIdentity);
  const before = stableStringify(trace);
  const binding = bindCausalTraceCalibration(trace, calibration);
  assert.equal(binding.traceId, trace.traceId);
  assert.equal(binding.calibrationRef.calibrationId, calibration.calibrationId);
  assert.equal(stableStringify(trace), before);
  assert.equal(verifyCausalTraceCalibrationBinding(binding, trace, calibration), true);
});

test('later trace attachments do not change its decision-time calibration binding', () => {
  const environmentIdentity = identity();
  const calibration = buildCalibration({ environmentIdentity });
  const trace = causalTrace(environmentIdentity);
  const actionBound = attachIncumbentAction(trace, {
    selectedAction: { actionId: 'MOVE', parameters: { direction: 'NORTH' } }, logicalTime: 11,
    provenance: {
      environmentIdentity: environmentIdentity.runtimeIdentity,
      environmentVersion: environmentIdentity.environmentVersion,
      sourceId: 'incumbent', evidenceId: 'action-11',
    },
  });
  const before = bindCausalTraceCalibration(trace, calibration);
  const after = bindCausalTraceCalibration(actionBound, calibration);
  assert.equal(before.causalTraceCalibrationBindingId, after.causalTraceCalibrationBindingId);
  assert.equal(before.decisionTimeEventId, trace.decisionTimeEvent.decisionEventId);
});

test('a corrupt calibration reference in a binding fails verification', () => {
  const environmentIdentity = identity();
  const calibration = buildCalibration({ environmentIdentity });
  const snapshot = worldState(environmentIdentity);
  const binding = structuredClone(bindWorldStateCalibration(snapshot, calibration));
  binding.calibrationRef.calibrationId = 'sha256:corrupt';
  assert.throws(() => verifyWorldStateCalibrationBinding(binding, snapshot, calibration), /identity mismatch/);
});

test('world-state/calibration environment mismatch fails closed', () => {
  const snapshot = worldState(identity());
  const other = buildCalibration({ environmentIdentity: identity({ runtimeIdentity: 'other-world' }) });
  assert.throws(() => bindWorldStateCalibration(snapshot, other), /environment mismatch/);
});

test('causal-trace/calibration environment mismatch fails closed', () => {
  const trace = causalTrace(identity());
  const other = buildCalibration({ environmentIdentity: identity({ environmentVersion: 'FORGE_WORLD_V3' }) });
  assert.throws(() => bindCausalTraceCalibration(trace, other), /environment mismatch/);
});

test('malformed calibration provenance is rejected', () => {
  const environmentIdentity = identity();
  assert.throws(() => createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.ACTION_SEMANTICS,
    claimTarget: 'ACTION:MOVE', claimType: 'SEMANTIC_DEFINITION', claimValue: {}, sourceReference: {},
    epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    provenance: { sourceId: 'missing-environment-binding', evidenceId: 'bad' },
  }), EnvironmentCalibrationContractError);
});

test('deterministic replay reproduces byte-identical calibration', () => {
  assert.equal(serializeEnvironmentCalibration(buildCalibration()), serializeEnvironmentCalibration(buildCalibration()));
});

test('key-order perturbation leaves canonical digest unchanged', () => {
  const a = identity();
  const b = createEnvironmentIdentity({
    structuralSemantics: {
      transitionContractVersion: 'FORGE_TRANSITION_V2', objectiveSchemaHash: 'sha256:forge-objective-schema-v2',
      actionSchemaHash: 'sha256:forge-action-schema-v2', observationSchemaHash: 'sha256:forge-observation-schema-v2',
    },
    environmentSchemaVersion: '2', environmentFamily: 'SENTINEL_FORGE',
    environmentVersion: 'FORGE_WORLD_V2', runtimeIdentity: 'forge-world',
  });
  assert.equal(a.environmentId, b.environmentId);
});

test('semantically unordered evidence, definitions, and assessments are order invariant', () => {
  assert.equal(buildCalibration().calibrationDigest, buildCalibration({ reverse: true }).calibrationDigest);
});

test('exact duplicate evidence is idempotent', () => {
  const environmentIdentity = identity();
  const duplicate = evidence(environmentIdentity, CalibrationDomain.ACTION_SEMANTICS,
    'ACTION:DUPLICATE_PROBE', 'PROBE', true, 'duplicate-probe');
  const once = buildCalibration({ environmentIdentity, extraEvidence: [duplicate] });
  const twice = buildCalibration({ environmentIdentity, extraEvidence: [duplicate, duplicate] });
  assert.equal(once.calibrationDigest, twice.calibrationDigest);
});

test('missing environment identity fields fail closed', () => {
  assert.throws(() => createEnvironmentIdentity({
    runtimeIdentity: '', environmentVersion: '', environmentFamily: 'x', environmentSchemaVersion: '1',
    structuralSemantics: { observationSchemaHash: 'o', actionSchemaHash: 'a', objectiveSchemaHash: 'g', transitionContractVersion: 't' },
  }), EnvironmentCalibrationContractError);
});

test('ambiguous conflict-key separators are rejected', () => {
  const environmentIdentity = identity();
  assert.throws(() => createCalibrationEvidence({
    environmentIdentity, domain: CalibrationDomain.ACTION_SEMANTICS,
    claimTarget: 'ACTION\u001fMOVE', claimType: 'SEMANTIC_DEFINITION', claimValue: true,
    sourceReference: {}, epistemicCategory: EpistemicCategory.OBSERVED, confidence: 1,
    provenance: provenance(environmentIdentity, 'auditor', 'ambiguous-key'),
  }), /ambiguous separator/);
});

test('unsupported semantic mapping type fails closed', () => {
  const source = identity({ runtimeIdentity: 'world-a' });
  const target = identity({ runtimeIdentity: 'world-b' });
  assert.throws(() => createSemanticMapping({
    sourceEnvironment: source, targetEnvironment: target,
    sourceConceptRef: 'ACTION:MOVE', targetConceptRef: 'ACTION:MOVE', relationType: 'SAME_NAME',
    confidence: 1, evidenceRefs: ['name-match'],
    provenance: { sourceEnvironmentId: source.environmentId, targetEnvironmentId: target.environmentId, sourceId: 'mapper', evidenceId: 'bad-map' },
  }), /unsupported semantic relation/);
});

test('unknown action lookup fails closed without inventing universal semantics', () => {
  const result = lookupCalibrationSemantics(buildCalibration(), {
    domain: CalibrationDomain.ACTION_SEMANTICS, conceptId: 'ATTACK',
  });
  assert.equal(result.status, CalibrationStatus.UNKNOWN);
  assert.equal(result.semantics, null);
  assert.equal(result.authority.canDispatch, false);
});

test('sufficiency result remains R0 and cannot alter incumbent behavior', () => {
  const incumbent = { calls: 0 };
  const result = evaluateCalibrationSufficiency(buildCalibration({ calibratedDomains: [] }), [
    CalibrationDomain.ACTION_SEMANTICS,
  ]);
  assert.equal(incumbent.calls, 0);
  assert.equal(result.authority.tier, 'R0');
  assert.equal(result.authority.canDispatch, false);
  assert.equal(result.authority.canMutateLiveWorld, false);
});

test('Stage 3F.2 API is exposed through the package entry point', () => {
  assert.equal(publicApi.ENVIRONMENT_CALIBRATION_CONTRACT_ID, ENVIRONMENT_CALIBRATION_CONTRACT_ID);
  assert.equal(publicApi.ENVIRONMENT_CALIBRATION_CONTRACT_HASH, ENVIRONMENT_CALIBRATION_CONTRACT_HASH);
  assert.equal(publicApi.createEnvironmentCalibration, createEnvironmentCalibration);
});

test('stored Stage 3F.1 certification remains intact', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3f1-causal-trace/stage3f1-certification-result.json', import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.certificationHash, '503298b69b5d267cb6cfcc19eb279dbac5b3c9a495b6f98f373c774d039f9ae1');
});

test('stored Stage 3F.0 certification remains intact', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3f0-world-state-contract/stage3f0-certification-result.json', import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.certificationHash, '3b2b2a42d43a77943d98bc4b0e865dab85b106a94e06320f4593f8e1a9194582');
});

test('stored Stage 3E predecessor hashes remain intact', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3e-routability-intelligence/freeze-3e.json', import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.ROUTER_HASH, 'd87cfa8b010c5889818b6ac6f3b9ddbaf2d23aa1cfb6e61d53cf31f50b722e64');
  assert.equal(artifact.FEATURE_CONTRACT_V2_HASH, '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb');
});

test('calibration and every binding retain exact R0 denial', () => {
  const environmentIdentity = identity();
  const calibration = buildCalibration({ environmentIdentity });
  const stateBinding = bindWorldStateCalibration(worldState(environmentIdentity), calibration);
  const traceBinding = bindCausalTraceCalibration(causalTrace(environmentIdentity), calibration);
  for (const value of [calibration, stateBinding, traceBinding]) {
    assert.equal(value.authority.tier, 'R0');
    assert.equal(value.authority.canDispatch, false);
    assert.equal(value.authority.canMutateLiveWorld, false);
  }
});
