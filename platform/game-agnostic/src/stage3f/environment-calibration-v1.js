import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { ContractError } from '../core/errors.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { assertNoExecutionSurface } from '../experts/expert-contract.js';
import { EpistemicCategory, verifyWorldStateSnapshot } from './world-state-v1.js';
import { verifyCausalTrace } from './causal-trace-v1.js';

export const ENVIRONMENT_CALIBRATION_SCHEMA_VERSION = 1;
export const ENVIRONMENT_CALIBRATION_CONTRACT_ID = 'SENTINEL_ENVIRONMENT_CALIBRATION_V1';

export const CalibrationDomain = deepFreeze({
  OBSERVATION_SEMANTICS: 'OBSERVATION_SEMANTICS',
  ACTION_SEMANTICS: 'ACTION_SEMANTICS',
  RESOURCE_SEMANTICS: 'RESOURCE_SEMANTICS',
  OBJECTIVE_SEMANTICS: 'OBJECTIVE_SEMANTICS',
  FAILURE_SEMANTICS: 'FAILURE_SEMANTICS',
  CONSTRAINT_SEMANTICS: 'CONSTRAINT_SEMANTICS',
  TEMPORAL_SEMANTICS: 'TEMPORAL_SEMANTICS',
  TRANSITION_SEMANTICS: 'TRANSITION_SEMANTICS',
});

export const CalibrationStatus = deepFreeze({
  CALIBRATED: 'CALIBRATED',
  PARTIALLY_CALIBRATED: 'PARTIALLY_CALIBRATED',
  INSUFFICIENT: 'INSUFFICIENT',
  CONFLICTED: 'CONFLICTED',
  UNKNOWN: 'UNKNOWN',
});

export const SemanticRelationType = deepFreeze({
  EQUIVALENT: 'EQUIVALENT',
  PARTIALLY_EQUIVALENT: 'PARTIALLY_EQUIVALENT',
  RELATED: 'RELATED',
  INCOMPATIBLE: 'INCOMPATIBLE',
  UNKNOWN: 'UNKNOWN',
});

export const ResourceDirectionality = deepFreeze({
  INCREASE_DESIRABLE: 'INCREASE_DESIRABLE',
  DECREASE_DESIRABLE: 'DECREASE_DESIRABLE',
  CONTEXT_DEPENDENT: 'CONTEXT_DEPENDENT',
  NEUTRAL: 'NEUTRAL',
  UNKNOWN: 'UNKNOWN',
});

export const RewardObjectiveRelationship = deepFreeze({
  CERTIFIED_EQUIVALENT: 'CERTIFIED_EQUIVALENT',
  RELATED: 'RELATED',
  DISTINCT: 'DISTINCT',
  UNKNOWN: 'UNKNOWN',
});

export const TransitionAssumption = deepFreeze({
  DETERMINISTIC: 'DETERMINISTIC',
  STOCHASTIC: 'STOCHASTIC',
  PARTIALLY_OBSERVABLE: 'PARTIALLY_OBSERVABLE',
  ACTION_CONDITIONED: 'ACTION_CONDITIONED',
  EXTERNALLY_INFLUENCED: 'EXTERNALLY_INFLUENCED',
  DELAYED_EFFECTS_POSSIBLE: 'DELAYED_EFFECTS_POSSIBLE',
  HIDDEN_STATE_POSSIBLE: 'HIDDEN_STATE_POSSIBLE',
  NONSTATIONARY: 'NONSTATIONARY',
  UNKNOWN: 'UNKNOWN',
});

export const ENVIRONMENT_CALIBRATION_CONTRACT = deepFreeze({
  contractId: ENVIRONMENT_CALIBRATION_CONTRACT_ID,
  schemaVersion: ENVIRONMENT_CALIBRATION_SCHEMA_VERSION,
  domains: Object.values(CalibrationDomain),
  statuses: Object.values(CalibrationStatus),
  epistemicCategories: Object.values(EpistemicCategory),
  semanticRelations: Object.values(SemanticRelationType),
  structuralSimilarityImpliesSemanticEquivalence: false,
  rewardSignalImpliesObjectiveTruth: false,
  calibrationExistsImpliesSufficiency: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const ENVIRONMENT_CALIBRATION_CONTRACT_HASH = sha256(ENVIRONMENT_CALIBRATION_CONTRACT);

export class EnvironmentCalibrationContractError extends ContractError {}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new EnvironmentCalibrationContractError(`${name} must be an object`);
  return value;
};
const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EnvironmentCalibrationContractError(`${name} must be a non-empty string`);
  }
  return value;
};
const requireKeyString = (value, name) => {
  requireString(value, name);
  if (value.includes('\u001f')) throw new EnvironmentCalibrationContractError(`${name} contains an ambiguous separator`);
  return value;
};
const requireBoolean = (value, name) => {
  if (typeof value !== 'boolean') throw new EnvironmentCalibrationContractError(`${name} must be boolean`);
  return value;
};
const requireEnum = (value, enumeration, name) => {
  if (!Object.values(enumeration).includes(value)) {
    throw new EnvironmentCalibrationContractError(`unsupported ${name}: ${value}`);
  }
  return value;
};
const requireConfidence = (value, name, nullable = false) => {
  if (nullable && value === null) return value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new EnvironmentCalibrationContractError(`${name} must be in [0,1]${nullable ? ' or null' : ''}`);
  }
  return value;
};
const requireOptionalString = (value, name) => value === null ? null : requireString(value, name);

function seal(body, idField) {
  return deepFreeze({ ...body, [idField]: `sha256:${sha256(body)}` });
}

function verifySeal(record, idField, recordType) {
  requireRecord(record, recordType);
  const { [idField]: identity, ...body } = record;
  if (body.recordType !== recordType || identity !== `sha256:${sha256(body)}`) {
    throw new EnvironmentCalibrationContractError(`${recordType} identity mismatch`);
  }
  return record;
}

function canonicalUnordered(values, name, key = stableStringify) {
  if (!Array.isArray(values)) throw new EnvironmentCalibrationContractError(`${name} must be an array`);
  const canonical = values.map((entry) => canonicalize(entry));
  return [...new Map(canonical.map((entry) => [key(entry), entry])).values()]
    .sort((a, b) => key(a).localeCompare(key(b)));
}

function normalizeEvidenceRefs(values, name = 'evidenceRefs') {
  if (!Array.isArray(values)) throw new EnvironmentCalibrationContractError(`${name} must be an array`);
  return [...new Set(values.map((entry) => requireString(entry, `${name}[]`)))].sort();
}

function normalizeProvenance(provenance, environmentIdentity, name = 'provenance') {
  requireRecord(provenance, name);
  assertNoExecutionSurface(provenance, name);
  if (provenance.environmentId !== environmentIdentity.environmentId
      || provenance.environmentVersion !== environmentIdentity.environmentVersion) {
    throw new EnvironmentCalibrationContractError(`${name} environment identity/version mismatch`);
  }
  requireString(provenance.sourceId, `${name}.sourceId`);
  requireString(provenance.evidenceId, `${name}.evidenceId`);
  return canonicalize(provenance);
}

function requireEpistemicConfidence(category, confidence, name) {
  requireEnum(category, EpistemicCategory, `${name}.epistemicCategory`);
  if (category === EpistemicCategory.UNKNOWN) {
    if (confidence !== null) throw new EnvironmentCalibrationContractError(`${name} UNKNOWN semantics require confidence=null`);
    return null;
  }
  return requireConfidence(confidence, `${name}.confidence`);
}

export function createEnvironmentIdentity({
  runtimeIdentity,
  environmentVersion,
  environmentFamily,
  environmentSchemaVersion,
  structuralSemantics,
}) {
  requireRecord(structuralSemantics, 'structuralSemantics');
  const body = {
    recordType: 'SENTINEL_ENVIRONMENT_IDENTITY_V1',
    runtimeIdentity: requireString(runtimeIdentity, 'runtimeIdentity'),
    environmentVersion: requireString(environmentVersion, 'environmentVersion'),
    environmentFamily: requireString(environmentFamily, 'environmentFamily'),
    environmentSchemaVersion: requireString(environmentSchemaVersion, 'environmentSchemaVersion'),
    structuralSemantics: canonicalize({
      observationSchemaHash: requireString(structuralSemantics.observationSchemaHash, 'observationSchemaHash'),
      actionSchemaHash: requireString(structuralSemantics.actionSchemaHash, 'actionSchemaHash'),
      objectiveSchemaHash: requireString(structuralSemantics.objectiveSchemaHash, 'objectiveSchemaHash'),
      transitionContractVersion: requireString(
        structuralSemantics.transitionContractVersion, 'transitionContractVersion',
      ),
    }),
  };
  return seal(body, 'environmentId');
}

export function verifyEnvironmentIdentity(identity) {
  verifySeal(identity, 'environmentId', 'SENTINEL_ENVIRONMENT_IDENTITY_V1');
  const recreated = createEnvironmentIdentity(identity);
  if (stableStringify(recreated) !== stableStringify(identity)) {
    throw new EnvironmentCalibrationContractError('environment identity is digest-valid but non-canonical');
  }
  return true;
}

export function createCalibrationEvidence({
  environmentIdentity,
  domain,
  claimTarget,
  claimType,
  claimValue,
  sourceReference,
  epistemicCategory,
  confidence,
  material = true,
  provenance,
}) {
  verifyEnvironmentIdentity(environmentIdentity);
  const normalizedCategory = requireEnum(epistemicCategory, EpistemicCategory, 'epistemic category');
  const normalizedConfidence = requireEpistemicConfidence(normalizedCategory, confidence, 'calibrationEvidence');
  if (normalizedCategory === EpistemicCategory.UNKNOWN && claimValue !== null) {
    throw new EnvironmentCalibrationContractError('UNKNOWN calibration evidence requires claimValue=null');
  }
  if (claimType === 'RISK_ESTIMATE'
      && ![EpistemicCategory.DERIVED, EpistemicCategory.PREDICTED, EpistemicCategory.UNKNOWN].includes(normalizedCategory)) {
    throw new EnvironmentCalibrationContractError('risk estimates must be DERIVED, PREDICTED, or UNKNOWN');
  }
  if (claimType === 'FAILURE_OCCURRENCE'
      && ![EpistemicCategory.OBSERVED, EpistemicCategory.UNKNOWN].includes(normalizedCategory)) {
    throw new EnvironmentCalibrationContractError('failure occurrence must be OBSERVED or UNKNOWN');
  }
  assertNoExecutionSurface(claimValue, 'claimValue');
  assertNoExecutionSurface(sourceReference, 'sourceReference');
  const body = {
    recordType: 'SENTINEL_CALIBRATION_EVIDENCE_V1',
    environmentId: environmentIdentity.environmentId,
    environmentVersion: environmentIdentity.environmentVersion,
    domain: requireEnum(domain, CalibrationDomain, 'calibration domain'),
    claimTarget: requireKeyString(claimTarget, 'claimTarget'),
    claimType: requireKeyString(claimType, 'claimType'),
    claimValue: canonicalize(claimValue),
    sourceReference: canonicalize(sourceReference),
    epistemicCategory: normalizedCategory,
    confidence: normalizedConfidence,
    material: requireBoolean(material, 'material'),
    provenance: normalizeProvenance(provenance, environmentIdentity),
  };
  return seal(body, 'calibrationEvidenceId');
}

function validateObservationSemantics(semantics) {
  requireString(semantics.sourcePath, 'observation.sourcePath');
  requireString(semantics.dataType, 'observation.dataType');
  requireOptionalString(semantics.units, 'observation.units');
  requireOptionalString(semantics.semanticDescription, 'observation.semanticDescription');
  requireEnum(semantics.requirement, { REQUIRED: 'REQUIRED', OPTIONAL: 'OPTIONAL' }, 'observation requirement');
  requireRecord(semantics.validDomain, 'observation.validDomain');
  requireEnum(semantics.missingValueSemantics, {
    UNKNOWN_WHEN_ABSENT: 'UNKNOWN_WHEN_ABSENT',
    ABSENT_WHEN_MISSING: 'ABSENT_WHEN_MISSING',
    EXPLICIT_DEFAULT: 'EXPLICIT_DEFAULT',
  }, 'missing-value semantics');
  if (semantics.missingValueSemantics === 'EXPLICIT_DEFAULT' && !Object.hasOwn(semantics, 'defaultValue')) {
    throw new EnvironmentCalibrationContractError('EXPLICIT_DEFAULT requires defaultValue');
  }
}

function validateActionSemantics(semantics) {
  requireString(semantics.actionId, 'action.actionId');
  requireString(semantics.actionVersion, 'action.actionVersion');
  for (const field of [
    'parameters', 'preconditions', 'expectedDirectEffects', 'possibleSideEffects', 'resourceCosts',
    'failureModes', 'legalityConstraints',
  ]) canonicalUnordered(semantics[field], `action.${field}`);
  if (semantics.temporalDuration !== null) requireRecord(semantics.temporalDuration, 'action.temporalDuration');
  requireEnum(semantics.resultObservability, {
    DIRECT: 'DIRECT', PARTIAL: 'PARTIAL', DELAYED: 'DELAYED', UNOBSERVABLE: 'UNOBSERVABLE', UNKNOWN: 'UNKNOWN',
  }, 'action result observability');
}

function validateResourceSemantics(semantics) {
  requireString(semantics.resourceId, 'resource.resourceId');
  requireOptionalString(semantics.units, 'resource.units');
  requireEnum(semantics.directionality, ResourceDirectionality, 'resource directionality');
  requireEnum(semantics.scarcity, { SCARCE: 'SCARCE', ABUNDANT: 'ABUNDANT', CONTEXT_DEPENDENT: 'CONTEXT_DEPENDENT', UNKNOWN: 'UNKNOWN' }, 'resource scarcity');
  requireEnum(semantics.renewability, { RENEWABLE: 'RENEWABLE', NONRENEWABLE: 'NONRENEWABLE', CONDITIONAL: 'CONDITIONAL', UNKNOWN: 'UNKNOWN' }, 'resource renewability');
  requireRecord(semantics.capacity, 'resource.capacity');
  for (const field of ['consumptionRules', 'generationRules', 'conversionRules']) {
    canonicalUnordered(semantics[field], `resource.${field}`);
  }
  requireOptionalString(semantics.strategicRelevance, 'resource.strategicRelevance');
}

function validateObjectiveSemantics(semantics) {
  requireString(semantics.objectiveId, 'objective.objectiveId');
  requireOptionalString(semantics.description, 'objective.description');
  if (semantics.priority !== null && (!Number.isSafeInteger(semantics.priority) || semantics.priority < 0)) {
    throw new EnvironmentCalibrationContractError('objective.priority must be a non-negative integer or null');
  }
  canonicalUnordered(semantics.successConditions, 'objective.successConditions');
  canonicalUnordered(semantics.failureConditions, 'objective.failureConditions');
  requireEnum(semantics.terminality, { TERMINAL: 'TERMINAL', NONTERMINAL: 'NONTERMINAL', MIXED: 'MIXED', UNKNOWN: 'UNKNOWN' }, 'objective terminality');
  requireRecord(semantics.rewardRelationship, 'objective.rewardRelationship');
  requireEnum(semantics.rewardRelationship.status, RewardObjectiveRelationship, 'reward-objective relationship');
  if (semantics.timeHorizon !== null) requireRecord(semantics.timeHorizon, 'objective.timeHorizon');
}

function validateFailureSemantics(semantics) {
  requireString(semantics.failureId, 'failure.failureId');
  requireOptionalString(semantics.triggerCondition, 'failure.triggerCondition');
  requireEnum(semantics.severity, { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CATASTROPHIC: 'CATASTROPHIC', UNKNOWN: 'UNKNOWN' }, 'failure severity');
  requireEnum(semantics.recoverability, { RECOVERABLE: 'RECOVERABLE', IRREVERSIBLE: 'IRREVERSIBLE', CONDITIONAL: 'CONDITIONAL', UNKNOWN: 'UNKNOWN' }, 'failure recoverability');
  requireEnum(semantics.terminality, { TERMINAL: 'TERMINAL', NONTERMINAL: 'NONTERMINAL', UNKNOWN: 'UNKNOWN' }, 'failure terminality');
  if (semantics.timeToEffect !== null) requireRecord(semantics.timeToEffect, 'failure.timeToEffect');
  requireEnum(semantics.observability, { DIRECT: 'DIRECT', PARTIAL: 'PARTIAL', DELAYED: 'DELAYED', UNKNOWN: 'UNKNOWN' }, 'failure observability');
}

function validateConstraintSemantics(semantics) {
  requireString(semantics.constraintId, 'constraint.constraintId');
  requireOptionalString(semantics.description, 'constraint.description');
  requireOptionalString(semantics.condition, 'constraint.condition');
  requireEnum(semantics.enforcement, { HARD: 'HARD', SOFT: 'SOFT', EXTERNAL: 'EXTERNAL', UNKNOWN: 'UNKNOWN' }, 'constraint enforcement');
}

function validateTemporalSemantics(semantics) {
  requireEnum(semantics.timeModel, { DISCRETE: 'DISCRETE', CONTINUOUS: 'CONTINUOUS', HYBRID: 'HYBRID', UNKNOWN: 'UNKNOWN' }, 'time model');
  requireOptionalString(semantics.logicalStepSemantics, 'temporal.logicalStepSemantics');
  for (const field of [
    'tickDuration', 'actionDuration', 'observationCadence', 'outcomeDelay', 'episodeHorizon', 'planningHorizon',
  ]) if (semantics[field] !== null) requireRecord(semantics[field], `temporal.${field}`);
  requireRecord(semantics.temporalUncertainty, 'temporal.temporalUncertainty');
}

function validateTransitionSemantics(semantics) {
  if (!Array.isArray(semantics.assumptions)) {
    throw new EnvironmentCalibrationContractError('transition.assumptions must be an array');
  }
  const types = new Set();
  for (const [index, assumption] of semantics.assumptions.entries()) {
    requireRecord(assumption, `transition.assumptions[${index}]`);
    requireEnum(assumption.type, TransitionAssumption, 'transition assumption');
    if (types.has(assumption.type)) throw new EnvironmentCalibrationContractError('duplicate transition assumption type');
    types.add(assumption.type);
    if (assumption.value !== null) requireBoolean(assumption.value, 'transition assumption value');
    const category = requireEnum(assumption.epistemicCategory, EpistemicCategory, 'transition epistemic category');
    requireEpistemicConfidence(category, assumption.confidence, 'transition assumption');
    normalizeEvidenceRefs(assumption.evidenceRefs, 'transition assumption evidenceRefs');
  }
}

const DOMAIN_VALIDATORS = {
  [CalibrationDomain.OBSERVATION_SEMANTICS]: validateObservationSemantics,
  [CalibrationDomain.ACTION_SEMANTICS]: validateActionSemantics,
  [CalibrationDomain.RESOURCE_SEMANTICS]: validateResourceSemantics,
  [CalibrationDomain.OBJECTIVE_SEMANTICS]: validateObjectiveSemantics,
  [CalibrationDomain.FAILURE_SEMANTICS]: validateFailureSemantics,
  [CalibrationDomain.CONSTRAINT_SEMANTICS]: validateConstraintSemantics,
  [CalibrationDomain.TEMPORAL_SEMANTICS]: validateTemporalSemantics,
  [CalibrationDomain.TRANSITION_SEMANTICS]: validateTransitionSemantics,
};

function normalizeSemantics(domain, semantics) {
  requireRecord(semantics, 'semantics');
  assertNoExecutionSurface(semantics, 'semantics');
  DOMAIN_VALIDATORS[domain](semantics);
  const normalized = canonicalize(semantics);
  if (domain === CalibrationDomain.ACTION_SEMANTICS) {
    for (const field of [
      'parameters', 'preconditions', 'expectedDirectEffects', 'possibleSideEffects', 'resourceCosts',
      'failureModes', 'legalityConstraints',
    ]) normalized[field] = canonicalUnordered(normalized[field], `action.${field}`);
  }
  if (domain === CalibrationDomain.RESOURCE_SEMANTICS) {
    for (const field of ['consumptionRules', 'generationRules', 'conversionRules']) {
      normalized[field] = canonicalUnordered(normalized[field], `resource.${field}`);
    }
  }
  if (domain === CalibrationDomain.OBJECTIVE_SEMANTICS) {
    normalized.successConditions = canonicalUnordered(normalized.successConditions, 'objective.successConditions');
    normalized.failureConditions = canonicalUnordered(normalized.failureConditions, 'objective.failureConditions');
  }
  if (domain === CalibrationDomain.TRANSITION_SEMANTICS) {
    normalized.assumptions = normalized.assumptions.map((assumption) => ({
      ...assumption,
      evidenceRefs: normalizeEvidenceRefs(assumption.evidenceRefs, 'transition assumption evidenceRefs'),
    })).sort((a, b) => a.type.localeCompare(b.type));
  }
  return normalized;
}

export function createSemanticDefinition({
  environmentIdentity,
  domain,
  conceptId,
  conceptVersion,
  semantics,
  epistemicCategory,
  confidence,
  evidenceRefs,
  provenance,
}) {
  verifyEnvironmentIdentity(environmentIdentity);
  const normalizedDomain = requireEnum(domain, CalibrationDomain, 'calibration domain');
  const category = requireEnum(epistemicCategory, EpistemicCategory, 'epistemic category');
  const refs = normalizeEvidenceRefs(evidenceRefs);
  if (category !== EpistemicCategory.UNKNOWN && refs.length === 0) {
    throw new EnvironmentCalibrationContractError('known semantic definitions require calibration evidence');
  }
  const body = {
    recordType: 'SENTINEL_SEMANTIC_DEFINITION_V1',
    environmentId: environmentIdentity.environmentId,
    environmentVersion: environmentIdentity.environmentVersion,
    domain: normalizedDomain,
    conceptId: requireString(conceptId, 'conceptId'),
    conceptVersion: requireString(conceptVersion, 'conceptVersion'),
    semantics: normalizeSemantics(normalizedDomain, semantics),
    epistemicCategory: category,
    confidence: requireEpistemicConfidence(category, confidence, 'semanticDefinition'),
    evidenceRefs: refs,
    provenance: normalizeProvenance(provenance, environmentIdentity),
  };
  return seal(body, 'semanticDefinitionId');
}

export function createDomainAssessment({
  environmentIdentity,
  domain,
  status,
  confidence,
  evidenceRefs,
  provenance,
}) {
  verifyEnvironmentIdentity(environmentIdentity);
  const normalizedStatus = requireEnum(status, CalibrationStatus, 'calibration status');
  const refs = normalizeEvidenceRefs(evidenceRefs);
  if ([CalibrationStatus.CALIBRATED, CalibrationStatus.PARTIALLY_CALIBRATED].includes(normalizedStatus)
      && refs.length === 0) {
    throw new EnvironmentCalibrationContractError('calibrated domain assessments require evidence');
  }
  if (normalizedStatus === CalibrationStatus.CONFLICTED && refs.length < 2) {
    throw new EnvironmentCalibrationContractError('CONFLICTED domain assessment requires at least two evidence references');
  }
  if (normalizedStatus === CalibrationStatus.UNKNOWN && confidence !== null) {
    throw new EnvironmentCalibrationContractError('UNKNOWN domain assessment requires confidence=null');
  }
  const body = {
    recordType: 'SENTINEL_CALIBRATION_DOMAIN_ASSESSMENT_V1',
    environmentId: environmentIdentity.environmentId,
    environmentVersion: environmentIdentity.environmentVersion,
    domain: requireEnum(domain, CalibrationDomain, 'calibration domain'),
    status: normalizedStatus,
    confidence: requireConfidence(confidence, 'domain confidence', true),
    evidenceRefs: refs,
    provenance: normalizeProvenance(provenance, environmentIdentity),
  };
  return seal(body, 'domainAssessmentId');
}

function recreateEvidence(record, identity) {
  return createCalibrationEvidence({
    environmentIdentity: identity,
    domain: record.domain,
    claimTarget: record.claimTarget,
    claimType: record.claimType,
    claimValue: record.claimValue,
    sourceReference: record.sourceReference,
    epistemicCategory: record.epistemicCategory,
    confidence: record.confidence,
    material: record.material,
    provenance: record.provenance,
  });
}

function recreateDefinition(record, identity) {
  return createSemanticDefinition({
    environmentIdentity: identity,
    domain: record.domain,
    conceptId: record.conceptId,
    conceptVersion: record.conceptVersion,
    semantics: record.semantics,
    epistemicCategory: record.epistemicCategory,
    confidence: record.confidence,
    evidenceRefs: record.evidenceRefs,
    provenance: record.provenance,
  });
}

function recreateAssessment(record, identity) {
  return createDomainAssessment({
    environmentIdentity: identity,
    domain: record.domain,
    status: record.status,
    confidence: record.confidence,
    evidenceRefs: record.evidenceRefs,
    provenance: record.provenance,
  });
}

function requireReproduces(record, recreated, name) {
  if (stableStringify(record) !== stableStringify(recreated)) {
    throw new EnvironmentCalibrationContractError(`${name} is digest-valid but non-canonical`);
  }
}

function detectConflicts(evidence, environmentIdentity) {
  const groups = new Map();
  for (const entry of evidence) {
    if (entry.epistemicCategory === EpistemicCategory.UNKNOWN) continue;
    const key = `${entry.domain}\u001f${entry.claimTarget}\u001f${entry.claimType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  const conflicts = [];
  for (const entries of groups.values()) {
    const values = new Map(entries.map((entry) => [stableStringify(entry.claimValue), entry.claimValue]));
    if (values.size < 2) continue;
    const sample = entries[0];
    const body = {
      recordType: 'SENTINEL_CALIBRATION_CONFLICT_V1',
      environmentId: environmentIdentity.environmentId,
      environmentVersion: environmentIdentity.environmentVersion,
      domain: sample.domain,
      claimTarget: sample.claimTarget,
      claimType: sample.claimType,
      conflictingValues: [...values.values()].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
      evidenceRefs: entries.map((entry) => entry.calibrationEvidenceId).sort(),
      material: entries.some((entry) => entry.material),
      provenance: canonicalize({
        environmentId: environmentIdentity.environmentId,
        environmentVersion: environmentIdentity.environmentVersion,
        sourceId: ENVIRONMENT_CALIBRATION_CONTRACT_ID,
        evidenceId: `CONFLICT:${sample.domain}:${sample.claimTarget}:${sample.claimType}`,
      }),
    };
    conflicts.push(seal(body, 'conflictId'));
  }
  return conflicts.sort((a, b) => a.conflictId.localeCompare(b.conflictId));
}

function deriveOverallStatus(assessments, conflicts) {
  if (conflicts.some((conflict) => conflict.material)
      || assessments.some((assessment) => assessment.status === CalibrationStatus.CONFLICTED)) {
    return CalibrationStatus.CONFLICTED;
  }
  const statuses = assessments.map((entry) => entry.status);
  if (statuses.every((status) => status === CalibrationStatus.CALIBRATED)) return CalibrationStatus.CALIBRATED;
  if (statuses.every((status) => status === CalibrationStatus.UNKNOWN)) return CalibrationStatus.UNKNOWN;
  if (statuses.some((status) => [CalibrationStatus.CALIBRATED, CalibrationStatus.PARTIALLY_CALIBRATED].includes(status))) {
    return CalibrationStatus.PARTIALLY_CALIBRATED;
  }
  return CalibrationStatus.INSUFFICIENT;
}

function buildCalibration({ environmentIdentity, calibrationVersion, evidence, semanticDefinitions, domainAssessments }) {
  verifyEnvironmentIdentity(environmentIdentity);
  const normalizedEvidence = [...new Map(evidence.map((entry) => {
    verifySeal(entry, 'calibrationEvidenceId', 'SENTINEL_CALIBRATION_EVIDENCE_V1');
    const recreated = recreateEvidence(entry, environmentIdentity);
    requireReproduces(entry, recreated, entry.recordType);
    return [entry.calibrationEvidenceId, entry];
  })).values()].sort((a, b) => a.calibrationEvidenceId.localeCompare(b.calibrationEvidenceId));
  const evidenceIds = new Set(normalizedEvidence.map((entry) => entry.calibrationEvidenceId));
  const definitions = [...new Map(semanticDefinitions.map((entry) => {
    verifySeal(entry, 'semanticDefinitionId', 'SENTINEL_SEMANTIC_DEFINITION_V1');
    const recreated = recreateDefinition(entry, environmentIdentity);
    requireReproduces(entry, recreated, entry.recordType);
    for (const ref of entry.evidenceRefs) {
      if (!evidenceIds.has(ref)) throw new EnvironmentCalibrationContractError('semantic definition has unknown evidence reference');
    }
    return [entry.semanticDefinitionId, entry];
  })).values()].sort((a, b) => a.semanticDefinitionId.localeCompare(b.semanticDefinitionId));
  const assessments = domainAssessments.map((entry) => {
    verifySeal(entry, 'domainAssessmentId', 'SENTINEL_CALIBRATION_DOMAIN_ASSESSMENT_V1');
    const recreated = recreateAssessment(entry, environmentIdentity);
    requireReproduces(entry, recreated, entry.recordType);
    for (const ref of entry.evidenceRefs) {
      if (!evidenceIds.has(ref)) throw new EnvironmentCalibrationContractError('domain assessment has unknown evidence reference');
    }
    return entry;
  }).sort((a, b) => a.domain.localeCompare(b.domain));
  const expectedDomains = Object.values(CalibrationDomain).sort();
  if (stableStringify(assessments.map((entry) => entry.domain)) !== stableStringify(expectedDomains)) {
    throw new EnvironmentCalibrationContractError('domainAssessments must contain every calibration domain exactly once');
  }
  for (const assessment of assessments) {
    if ([CalibrationStatus.CALIBRATED, CalibrationStatus.PARTIALLY_CALIBRATED].includes(assessment.status)
        && !definitions.some((definition) => definition.domain === assessment.domain)) {
      throw new EnvironmentCalibrationContractError('calibrated domain assessment requires a semantic definition');
    }
  }
  const conflicts = detectConflicts(normalizedEvidence, environmentIdentity);
  const overallStatus = deriveOverallStatus(assessments, conflicts);
  const domainConfidences = assessments.map((entry) => entry.confidence);
  const overallConfidence = domainConfidences.some((value) => value === null)
    ? null : Math.min(...domainConfidences);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_ENVIRONMENT_CALIBRATION_RECORD_V1',
    contractId: ENVIRONMENT_CALIBRATION_CONTRACT_ID,
    schemaVersion: ENVIRONMENT_CALIBRATION_SCHEMA_VERSION,
    contractHash: ENVIRONMENT_CALIBRATION_CONTRACT_HASH,
    environmentIdentity,
    calibrationVersion: requireString(calibrationVersion, 'calibrationVersion'),
    evidence: normalizedEvidence,
    semanticDefinitions: definitions,
    domainAssessments: assessments,
    conflicts,
    overallStatus,
    overallConfidence,
    structuralSimilarityImpliesSemanticEquivalence: false,
    rewardSignalImpliesObjectiveTruth: false,
    authority,
  };
  const calibrationId = `sha256:${sha256(body)}`;
  return deepFreeze({ ...body, calibrationId, calibrationDigest: `sha256:${sha256({ ...body, calibrationId })}` });
}

export function createEnvironmentCalibration({
  environmentIdentity,
  calibrationVersion,
  evidence,
  semanticDefinitions,
  domainAssessments,
}) {
  if (!Array.isArray(evidence) || !Array.isArray(semanticDefinitions) || !Array.isArray(domainAssessments)) {
    throw new EnvironmentCalibrationContractError('evidence, semanticDefinitions, and domainAssessments must be arrays');
  }
  return buildCalibration({ environmentIdentity, calibrationVersion, evidence, semanticDefinitions, domainAssessments });
}

export function verifyEnvironmentCalibration(calibration) {
  requireRecord(calibration, 'calibration');
  if (calibration.contractId !== ENVIRONMENT_CALIBRATION_CONTRACT_ID
      || calibration.schemaVersion !== ENVIRONMENT_CALIBRATION_SCHEMA_VERSION
      || calibration.contractHash !== ENVIRONMENT_CALIBRATION_CONTRACT_HASH) {
    throw new EnvironmentCalibrationContractError('not a Sentinel Environment Calibration v1 record');
  }
  const { calibrationId, calibrationDigest, ...body } = calibration;
  if (calibrationId !== `sha256:${sha256(body)}`
      || calibrationDigest !== `sha256:${sha256({ ...body, calibrationId })}`) {
    throw new EnvironmentCalibrationContractError('environment calibration digest mismatch');
  }
  assertEvaluationOnly(calibration.authority);
  const rebuilt = buildCalibration(calibration);
  if (stableStringify(rebuilt) !== stableStringify(calibration)) {
    throw new EnvironmentCalibrationContractError('environment calibration is digest-valid but non-canonical');
  }
  return true;
}

export function serializeEnvironmentCalibration(calibration) {
  verifyEnvironmentCalibration(calibration);
  return stableStringify(calibration);
}

function normalizeRequirements(requiredCapabilities) {
  if (!Array.isArray(requiredCapabilities) || requiredCapabilities.length === 0) {
    throw new EnvironmentCalibrationContractError('requiredCapabilities must be a non-empty array');
  }
  const normalized = requiredCapabilities.map((requirement) => {
    const value = typeof requirement === 'string' ? { domain: requirement } : requireRecord(requirement, 'requirement');
    return {
      domain: requireEnum(value.domain, CalibrationDomain, 'required calibration domain'),
      allowPartial: value.allowPartial === undefined ? false : requireBoolean(value.allowPartial, 'allowPartial'),
      minimumConfidence: value.minimumConfidence === undefined
        ? 0 : requireConfidence(value.minimumConfidence, 'minimumConfidence'),
    };
  }).sort((a, b) => a.domain.localeCompare(b.domain));
  if (new Set(normalized.map((entry) => entry.domain)).size !== normalized.length) {
    throw new EnvironmentCalibrationContractError('requiredCapabilities cannot repeat a domain');
  }
  return normalized;
}

export function evaluateCalibrationSufficiency(calibration, requiredCapabilities) {
  verifyEnvironmentCalibration(calibration);
  const requirements = normalizeRequirements(requiredCapabilities);
  const assessments = new Map(calibration.domainAssessments.map((entry) => [entry.domain, entry]));
  const results = requirements.map((requirement) => {
    const assessment = assessments.get(requirement.domain);
    const materialConflicts = calibration.conflicts.filter((conflict) =>
      conflict.material && conflict.domain === requirement.domain).map((conflict) => conflict.conflictId);
    let reason = 'SUFFICIENT';
    if (materialConflicts.length > 0 || assessment.status === CalibrationStatus.CONFLICTED) reason = 'MATERIAL_CONFLICT';
    else if (assessment.status === CalibrationStatus.UNKNOWN) reason = 'UNKNOWN';
    else if (assessment.status === CalibrationStatus.INSUFFICIENT) reason = 'INSUFFICIENT';
    else if (assessment.status === CalibrationStatus.PARTIALLY_CALIBRATED && !requirement.allowPartial) reason = 'PARTIAL_NOT_ALLOWED';
    else if (assessment.confidence === null || assessment.confidence < requirement.minimumConfidence) reason = 'CONFIDENCE_BELOW_REQUIREMENT';
    return deepFreeze({
      ...requirement,
      status: assessment.status,
      confidence: assessment.confidence,
      sufficient: reason === 'SUFFICIENT',
      reason,
      materialConflicts,
    });
  });
  const sufficient = results.every((entry) => entry.sufficient);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_CALIBRATION_SUFFICIENCY_RESULT_V1',
    calibrationId: calibration.calibrationId,
    requiredCapabilities: requirements,
    domainResults: results,
    sufficient,
    calibrationInsufficient: !sufficient,
    authority,
  };
  return deepFreeze({ ...body, sufficiencyDigest: `sha256:${sha256(body)}` });
}

export function isCalibrationSufficient(calibration, requiredCapabilities) {
  return evaluateCalibrationSufficiency(calibration, requiredCapabilities).sufficient;
}

export function lookupCalibrationSemantics(calibration, { domain, conceptId, conceptVersion = null }) {
  verifyEnvironmentCalibration(calibration);
  const normalizedDomain = requireEnum(domain, CalibrationDomain, 'calibration domain');
  const normalizedConceptId = requireString(conceptId, 'conceptId');
  const normalizedVersion = conceptVersion === null ? null : requireString(conceptVersion, 'conceptVersion');
  const matches = calibration.semanticDefinitions.filter((definition) =>
    definition.domain === normalizedDomain
      && definition.conceptId === normalizedConceptId
      && (normalizedVersion === null || definition.conceptVersion === normalizedVersion));
  const materialConflicts = calibration.conflicts.filter((conflict) =>
    conflict.material && conflict.domain === normalizedDomain).map((conflict) => conflict.conflictId);
  const status = materialConflicts.length > 0 || matches.length > 1
    ? CalibrationStatus.CONFLICTED
    : matches.length === 0 ? CalibrationStatus.UNKNOWN : matches[0].epistemicCategory === EpistemicCategory.UNKNOWN
      ? CalibrationStatus.UNKNOWN : CalibrationStatus.CALIBRATED;
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_CALIBRATION_SEMANTIC_LOOKUP_V1',
    calibrationId: calibration.calibrationId,
    domain: normalizedDomain,
    conceptId: normalizedConceptId,
    conceptVersion: normalizedVersion,
    status,
    definitions: matches,
    materialConflicts,
    semantics: status === CalibrationStatus.CALIBRATED ? matches[0].semantics : null,
    authority,
  };
  return deepFreeze({ ...body, lookupDigest: `sha256:${sha256(body)}` });
}

export function createSemanticMapping({
  sourceEnvironment,
  targetEnvironment,
  sourceConceptRef,
  targetConceptRef,
  relationType,
  confidence,
  evidenceRefs,
  provenance,
}) {
  verifyEnvironmentIdentity(sourceEnvironment);
  verifyEnvironmentIdentity(targetEnvironment);
  requireRecord(provenance, 'provenance');
  assertNoExecutionSurface(provenance, 'provenance');
  if (provenance.sourceEnvironmentId !== sourceEnvironment.environmentId
      || provenance.targetEnvironmentId !== targetEnvironment.environmentId) {
    throw new EnvironmentCalibrationContractError('mapping provenance environment mismatch');
  }
  requireString(provenance.sourceId, 'provenance.sourceId');
  requireString(provenance.evidenceId, 'provenance.evidenceId');
  const relation = requireEnum(relationType, SemanticRelationType, 'semantic relation');
  const refs = normalizeEvidenceRefs(evidenceRefs);
  if (relation === SemanticRelationType.UNKNOWN) {
    if (confidence !== null) throw new EnvironmentCalibrationContractError('UNKNOWN mapping requires confidence=null');
  } else if (refs.length === 0) {
    throw new EnvironmentCalibrationContractError('proven semantic mapping requires evidence');
  }
  const body = {
    recordType: 'SENTINEL_SEMANTIC_MAPPING_V1',
    sourceEnvironmentId: sourceEnvironment.environmentId,
    sourceEnvironmentVersion: sourceEnvironment.environmentVersion,
    targetEnvironmentId: targetEnvironment.environmentId,
    targetEnvironmentVersion: targetEnvironment.environmentVersion,
    sourceConceptRef: requireString(sourceConceptRef, 'sourceConceptRef'),
    targetConceptRef: requireString(targetConceptRef, 'targetConceptRef'),
    relationType: relation,
    confidence: relation === SemanticRelationType.UNKNOWN
      ? null : requireConfidence(confidence, 'mapping confidence'),
    evidenceRefs: refs,
    provenance: canonicalize(provenance),
  };
  return seal(body, 'semanticMappingId');
}

export function verifySemanticMapping(mapping, sourceEnvironment, targetEnvironment) {
  verifySeal(mapping, 'semanticMappingId', 'SENTINEL_SEMANTIC_MAPPING_V1');
  const recreated = createSemanticMapping({
    sourceEnvironment,
    targetEnvironment,
    sourceConceptRef: mapping.sourceConceptRef,
    targetConceptRef: mapping.targetConceptRef,
    relationType: mapping.relationType,
    confidence: mapping.confidence,
    evidenceRefs: mapping.evidenceRefs,
    provenance: mapping.provenance,
  });
  requireReproduces(mapping, recreated, mapping.recordType);
  return true;
}

function requireRuntimeEnvironment(environment, identity, name) {
  requireRecord(environment, `${name}.environment`);
  if (environment.identity !== identity.runtimeIdentity
      || environment.version !== identity.environmentVersion) {
    throw new EnvironmentCalibrationContractError(`${name}/calibration environment mismatch`);
  }
}

function calibrationReference(calibration) {
  return deepFreeze({
    contractId: calibration.contractId,
    contractHash: calibration.contractHash,
    calibrationId: calibration.calibrationId,
    calibrationDigest: calibration.calibrationDigest,
    calibrationVersion: calibration.calibrationVersion,
    environmentId: calibration.environmentIdentity.environmentId,
    environmentVersion: calibration.environmentIdentity.environmentVersion,
  });
}

export function bindWorldStateCalibration(worldStateSnapshot, calibration) {
  verifyWorldStateSnapshot(worldStateSnapshot);
  verifyEnvironmentCalibration(calibration);
  requireRuntimeEnvironment(worldStateSnapshot.environment, calibration.environmentIdentity, 'world-state');
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_WORLD_STATE_CALIBRATION_BINDING_V1',
    worldStateSnapshotId: worldStateSnapshot.snapshotId,
    calibrationRef: calibrationReference(calibration),
    authority,
  };
  return seal(body, 'worldStateCalibrationBindingId');
}

export function bindCausalTraceCalibration(trace, calibration) {
  verifyCausalTrace(trace);
  verifyEnvironmentCalibration(calibration);
  requireRuntimeEnvironment(trace.environment, calibration.environmentIdentity, 'causal-trace');
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const body = {
    recordType: 'SENTINEL_CAUSAL_TRACE_CALIBRATION_BINDING_V1',
    traceId: trace.traceId,
    decisionTimeEventId: trace.decisionTimeEvent.decisionEventId,
    calibrationRef: calibrationReference(calibration),
    authority,
  };
  return seal(body, 'causalTraceCalibrationBindingId');
}

export function verifyWorldStateCalibrationBinding(binding, worldStateSnapshot, calibration) {
  verifySeal(binding, 'worldStateCalibrationBindingId', 'SENTINEL_WORLD_STATE_CALIBRATION_BINDING_V1');
  const recreated = bindWorldStateCalibration(worldStateSnapshot, calibration);
  requireReproduces(binding, recreated, binding.recordType);
  return true;
}

export function verifyCausalTraceCalibrationBinding(binding, trace, calibration) {
  verifySeal(binding, 'causalTraceCalibrationBindingId', 'SENTINEL_CAUSAL_TRACE_CALIBRATION_BINDING_V1');
  const recreated = bindCausalTraceCalibration(trace, calibration);
  requireReproduces(binding, recreated, binding.recordType);
  return true;
}
