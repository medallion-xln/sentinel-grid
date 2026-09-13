import { defaultAuthorityPolicy, assertEvaluationOnly } from '../core/authority.js';
import { ContractError } from '../core/errors.js';
import { canonicalize, deepFreeze, sha256, stableStringify } from '../core/determinism.js';

export const WORLD_STATE_SCHEMA_VERSION = 1;
export const WORLD_STATE_CONTRACT_ID = 'SENTINEL_WORLD_STATE_V1';

export const EpistemicCategory = deepFreeze({
  OBSERVED: 'OBSERVED',
  DERIVED: 'DERIVED',
  PREDICTED: 'PREDICTED',
  UNKNOWN: 'UNKNOWN',
});

export const EvidenceAuthority = deepFreeze({
  AUTHORITATIVE_OBSERVATION: 'AUTHORITATIVE_OBSERVATION',
  VALIDATED_DERIVATION: 'VALIDATED_DERIVATION',
  CALIBRATED_PREDICTION: 'CALIBRATED_PREDICTION',
  GENERATED_HYPOTHESIS: 'GENERATED_HYPOTHESIS',
  UNKNOWN: 'UNKNOWN',
});

export const WORLD_STATE_SECTIONS = deepFreeze([
  'entities',
  'resources',
  'objectives',
  'relationships',
  'spatialState',
  'temporalState',
  'constraints',
  'recentEvents',
]);

const AUTHORITY_RANK = deepFreeze({
  [EvidenceAuthority.UNKNOWN]: 0,
  [EvidenceAuthority.GENERATED_HYPOTHESIS]: 1,
  [EvidenceAuthority.CALIBRATED_PREDICTION]: 2,
  [EvidenceAuthority.VALIDATED_DERIVATION]: 3,
  [EvidenceAuthority.AUTHORITATIVE_OBSERVATION]: 4,
});

const CATEGORY_AUTHORITIES = deepFreeze({
  [EpistemicCategory.OBSERVED]: [EvidenceAuthority.AUTHORITATIVE_OBSERVATION],
  [EpistemicCategory.DERIVED]: [EvidenceAuthority.VALIDATED_DERIVATION],
  [EpistemicCategory.PREDICTED]: [
    EvidenceAuthority.CALIBRATED_PREDICTION,
    EvidenceAuthority.GENERATED_HYPOTHESIS,
  ],
  [EpistemicCategory.UNKNOWN]: [EvidenceAuthority.UNKNOWN],
});

export class WorldStateContractError extends ContractError {}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new WorldStateContractError(`${name} must be a non-empty string`);
  }
  return value;
}

function normalizePath(path) {
  const parts = Array.isArray(path) ? [...path] : typeof path === 'string' ? path.split('.') : [];
  if (parts.length < 2 || parts.some((part) => typeof part !== 'string' || part.trim() === '' || part.includes('\u001f'))) {
    throw new WorldStateContractError('fact path must contain a section and field identity');
  }
  if (!WORLD_STATE_SECTIONS.includes(parts[0])) {
    throw new WorldStateContractError(`unsupported world-state section: ${parts[0]}`);
  }
  return parts;
}

function normalizeTimestamp(timestamp) {
  if (timestamp === null) return null;
  const value = requireString(timestamp, 'timestamp');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new WorldStateContractError('timestamp must be ISO-8601 or null');
  return parsed.toISOString();
}

function assertEnvironment(environment) {
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
    throw new WorldStateContractError('environment must be an object');
  }
  return deepFreeze({
    identity: requireString(environment.identity, 'environment.identity'),
    version: requireString(environment.version, 'environment.version'),
  });
}

function validateProvenance(category, authority, provenance) {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    throw new WorldStateContractError('fact provenance must be an object');
  }
  requireString(provenance.environmentIdentity, 'provenance.environmentIdentity');
  requireString(provenance.environmentVersion, 'provenance.environmentVersion');
  requireString(provenance.sourceId, 'provenance.sourceId');
  requireString(provenance.evidenceId, 'provenance.evidenceId');

  if (category === EpistemicCategory.DERIVED) {
    const derivation = provenance.derivation;
    if (!derivation || typeof derivation !== 'object') {
      throw new WorldStateContractError('DERIVED facts require derivation provenance');
    }
    requireString(derivation.method, 'provenance.derivation.method');
    if (!Array.isArray(derivation.inputFactIds) || derivation.inputFactIds.length === 0) {
      throw new WorldStateContractError('DERIVED facts require inputFactIds');
    }
    derivation.inputFactIds.forEach((id) => requireString(id, 'provenance.derivation.inputFactIds[]'));
  }

  if (category === EpistemicCategory.PREDICTED) {
    const prediction = provenance.prediction;
    if (!prediction || typeof prediction !== 'object') {
      throw new WorldStateContractError('PREDICTED facts require prediction provenance');
    }
    requireString(prediction.producerId, 'provenance.prediction.producerId');
    requireString(prediction.producerVersion, 'provenance.prediction.producerVersion');
    if (typeof prediction.calibrated !== 'boolean') {
      throw new WorldStateContractError('prediction.calibrated must be boolean');
    }
    if (authority === EvidenceAuthority.CALIBRATED_PREDICTION && prediction.calibrated !== true) {
      throw new WorldStateContractError('CALIBRATED_PREDICTION must carry calibrated=true');
    }
  }

  if (category === EpistemicCategory.UNKNOWN) {
    requireString(provenance.reason, 'provenance.reason');
  }

  return canonicalize(provenance);
}

export function createWorldStateFact({
  path,
  category,
  authority,
  value,
  confidence,
  uncertainty,
  provenance,
}) {
  const normalizedPath = normalizePath(path);
  if (!Object.values(EpistemicCategory).includes(category)) {
    throw new WorldStateContractError(`unsupported epistemic category: ${category}`);
  }
  if (!Object.values(EvidenceAuthority).includes(authority)) {
    throw new WorldStateContractError(`unsupported evidence authority: ${authority}`);
  }
  if (!CATEGORY_AUTHORITIES[category].includes(authority)) {
    throw new WorldStateContractError(`${category} cannot claim ${authority}`);
  }
  if (!uncertainty || typeof uncertainty !== 'object' || Array.isArray(uncertainty)) {
    throw new WorldStateContractError('uncertainty must be explicit');
  }
  requireString(uncertainty.status, 'uncertainty.status');

  if (category === EpistemicCategory.UNKNOWN) {
    if (value !== null || confidence !== null) {
      throw new WorldStateContractError('UNKNOWN facts must use value=null and confidence=null');
    }
  } else if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new WorldStateContractError('known facts require confidence in [0,1]');
  }

  try {
    stableStringify(value);
  } catch (error) {
    throw new WorldStateContractError('fact value is not deterministically serializable', { cause: error.message });
  }

  const body = {
    path: normalizedPath,
    category,
    authority,
    value: canonicalize(value),
    confidence,
    uncertainty: canonicalize(uncertainty),
    provenance: validateProvenance(category, authority, provenance),
  };
  return deepFreeze({ ...body, factId: `sha256:${sha256(body)}` });
}

export function createUnknownWorldStateFact({ path, environment, sourceId, evidenceId, reason }) {
  const bound = assertEnvironment(environment);
  return createWorldStateFact({
    path,
    category: EpistemicCategory.UNKNOWN,
    authority: EvidenceAuthority.UNKNOWN,
    value: null,
    confidence: null,
    uncertainty: { status: 'UNKNOWN', reason },
    provenance: {
      environmentIdentity: bound.identity,
      environmentVersion: bound.version,
      sourceId,
      evidenceId,
      reason,
    },
  });
}

function compareFacts(a, b) {
  const rank = AUTHORITY_RANK[b.authority] - AUTHORITY_RANK[a.authority];
  return rank || a.factId.localeCompare(b.factId);
}

function groupFacts(facts, environment) {
  const groups = new Map();
  for (const fact of facts) {
    const validated = createWorldStateFact(fact);
    if (validated.provenance.environmentIdentity !== environment.identity) {
      throw new WorldStateContractError('fact environment identity mismatch', {
        expected: environment.identity,
        actual: validated.provenance.environmentIdentity,
        factId: validated.factId,
      });
    }
    if (validated.provenance.environmentVersion !== environment.version) {
      throw new WorldStateContractError('fact environment version mismatch', {
        expected: environment.version,
        actual: validated.provenance.environmentVersion,
        factId: validated.factId,
      });
    }
    const key = validated.path.join('\u001f');
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(validated.factId, validated);
  }
  return groups;
}

export function createWorldStateSnapshot({ environment, logicalTime, timestamp = null, facts }) {
  const boundEnvironment = assertEnvironment(environment);
  if (!Number.isSafeInteger(logicalTime) || logicalTime < 0) {
    throw new WorldStateContractError('logicalTime must be a non-negative safe integer');
  }
  if (!Array.isArray(facts)) throw new WorldStateContractError('facts must be an array');
  const groups = groupFacts(facts, boundEnvironment);
  const selectedFacts = [];
  const nonAuthoritativeEvidence = [];

  for (const key of [...groups.keys()].sort()) {
    const candidates = [...groups.get(key).values()].sort(compareFacts);
    const topRank = AUTHORITY_RANK[candidates[0].authority];
    const top = candidates.filter((candidate) => AUTHORITY_RANK[candidate.authority] === topRank);
    const values = new Set(top.map((candidate) => sha256(candidate.value)));
    if (values.size > 1) {
      throw new WorldStateContractError('contradictory equal-authority evidence', {
        path: candidates[0].path,
        factIds: top.map((candidate) => candidate.factId),
      });
    }
    selectedFacts.push(top[0]);
    nonAuthoritativeEvidence.push(...candidates.filter((candidate) => candidate.factId !== top[0].factId));
  }

  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);
  const normalizedTimestamp = normalizeTimestamp(timestamp);
  const body = {
    contractId: WORLD_STATE_CONTRACT_ID,
    schemaVersion: WORLD_STATE_SCHEMA_VERSION,
    environment: boundEnvironment,
    time: {
      logicalTime,
      timestamp: normalizedTimestamp,
      timestampStatus: normalizedTimestamp === null ? 'UNKNOWN' : 'OBSERVED',
    },
    facts: selectedFacts,
    nonAuthoritativeEvidence: nonAuthoritativeEvidence.sort((a, b) =>
      a.path.join('\u001f').localeCompare(b.path.join('\u001f')) || compareFacts(a, b)),
    sections: Object.fromEntries(WORLD_STATE_SECTIONS.map((section) => [
      section,
      selectedFacts.filter((fact) => fact.path[0] === section).map((fact) => fact.factId),
    ])),
    epistemicCategories: EpistemicCategory,
    authorityPrecedence: Object.entries(AUTHORITY_RANK)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name),
    authority,
  };
  return deepFreeze({ ...body, snapshotId: `sha256:${sha256(body)}` });
}

export function verifyWorldStateSnapshot(snapshot) {
  if (!snapshot || snapshot.contractId !== WORLD_STATE_CONTRACT_ID || snapshot.schemaVersion !== WORLD_STATE_SCHEMA_VERSION) {
    throw new WorldStateContractError('not a Sentinel World State v1 snapshot');
  }
  const { snapshotId, ...body } = snapshot;
  if (snapshotId !== `sha256:${sha256(body)}`) throw new WorldStateContractError('world-state snapshot digest mismatch');
  assertEvaluationOnly(snapshot.authority);
  if (!Array.isArray(snapshot.facts) || !Array.isArray(snapshot.nonAuthoritativeEvidence)) {
    throw new WorldStateContractError('world-state evidence collections must be arrays');
  }
  const rebuilt = createWorldStateSnapshot({
    environment: snapshot.environment,
    logicalTime: snapshot.time?.logicalTime,
    timestamp: snapshot.time?.timestamp,
    facts: [...snapshot.facts, ...snapshot.nonAuthoritativeEvidence],
  });
  if (stableStringify(rebuilt) !== stableStringify(snapshot)) {
    throw new WorldStateContractError('world-state snapshot is digest-valid but non-canonical');
  }
  return true;
}

export function serializeWorldStateSnapshot(snapshot) {
  verifyWorldStateSnapshot(snapshot);
  return stableStringify(snapshot);
}

export function readWorldStateFact(snapshot, path) {
  verifyWorldStateSnapshot(snapshot);
  const normalized = normalizePath(path);
  const found = snapshot.facts.find((fact) => fact.path.length === normalized.length
    && fact.path.every((part, index) => part === normalized[index]));
  if (found) return found;
  return createUnknownWorldStateFact({
    path: normalized,
    environment: snapshot.environment,
    sourceId: WORLD_STATE_CONTRACT_ID,
    evidenceId: `${snapshot.snapshotId}:${normalized.join('.')}:not-recorded`,
    reason: 'NOT_RECORDED',
  });
}
