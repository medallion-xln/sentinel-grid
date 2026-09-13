#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import {
  EpistemicCategory,
  EvidenceAuthority,
  WORLD_STATE_CONTRACT_ID,
  WORLD_STATE_SCHEMA_VERSION,
  WORLD_STATE_SECTIONS,
  createUnknownWorldStateFact,
  createWorldStateFact,
  createWorldStateSnapshot,
  serializeWorldStateSnapshot,
  verifyWorldStateSnapshot,
} from '../src/stage3f/world-state-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f0-world-state-contract');
const artifactPath = path.join(artifactDirectory, 'stage3f0-certification-result.json');
const checkOnly = process.argv.includes('--check');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const environment = { identity: 'forge-world', version: 'FORGE_WORLD_V2' };
const baseProvenance = {
  environmentIdentity: environment.identity,
  environmentVersion: environment.version,
};
const observed = createWorldStateFact({
  path: ['resources', 'actor', 'energy'],
  category: EpistemicCategory.OBSERVED,
  authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION,
  value: 31,
  confidence: 1,
  uncertainty: { status: 'BOUNDED', radius: 0 },
  provenance: { ...baseProvenance, sourceId: 'forge-observer-v2', evidenceId: 'energy-17-observed' },
});
const derived = createWorldStateFact({
  path: ['temporalState', 'actor', 'energyTrend'],
  category: EpistemicCategory.DERIVED,
  authority: EvidenceAuthority.VALIDATED_DERIVATION,
  value: 'FALLING',
  confidence: 0.9,
  uncertainty: { status: 'BOUNDED', sampleCount: 4 },
  provenance: {
    ...baseProvenance,
    sourceId: 'energy-trend-rule-v1',
    evidenceId: 'energy-trend-17',
    derivation: { method: 'FINITE_DIFFERENCE_V1', inputFactIds: [observed.factId] },
  },
});
const predicted = createWorldStateFact({
  path: ['resources', 'actor', 'energy'],
  category: EpistemicCategory.PREDICTED,
  authority: EvidenceAuthority.CALIBRATED_PREDICTION,
  value: 26,
  confidence: 0.81,
  uncertainty: { status: 'BOUNDED', radius: 3 },
  provenance: {
    ...baseProvenance,
    sourceId: 'oracle-energy-v1',
    evidenceId: 'energy-17-predicted',
    prediction: { producerId: 'oracle-energy', producerVersion: '1', calibrated: true, horizon: 1 },
  },
});
const unknown = createUnknownWorldStateFact({
  path: ['spatialState', 'entity-7', 'position'],
  environment,
  sourceId: 'partial-observer',
  evidenceId: 'position-17',
  reason: 'SENSOR_OCCLUDED',
});

const first = createWorldStateSnapshot({
  environment,
  logicalTime: 17,
  timestamp: '2026-09-10T16:00:00Z',
  facts: [observed, derived, predicted, unknown],
});
const reordered = createWorldStateSnapshot({
  environment: structuredClone(environment),
  logicalTime: 17,
  timestamp: '2026-09-10T16:00:00.000Z',
  facts: [unknown, predicted, derived, observed, observed],
});
const recovery = await certifyRecoveredStage3DE();
const sourcePath = path.join(root, 'src', 'stage3f', 'world-state-v1.js');
const sourceHash = sha256(await readFile(sourcePath));

const checks = {
  predecessorStage3DECanonicalizationPass: recovery.status === 'PASS',
  deterministicSerialization: serializeWorldStateSnapshot(first) === serializeWorldStateSnapshot(reordered),
  stableSnapshotIdentity: first.snapshotId === reordered.snapshotId,
  snapshotVerifies: verifyWorldStateSnapshot(first) === true,
  observedProtectedFromPrediction: first.facts.find((fact) => fact.path.join('.') === 'resources.actor.energy')?.category
    === EpistemicCategory.OBSERVED,
  predictionRetainedAsNonAuthoritativeEvidence: first.nonAuthoritativeEvidence.some((fact) =>
    fact.category === EpistemicCategory.PREDICTED && fact.value === 26),
  explicitUnknown: first.facts.some((fact) => fact.category === EpistemicCategory.UNKNOWN
    && fact.value === null && fact.confidence === null),
  derivedProvenanceBound: first.facts.some((fact) => fact.category === EpistemicCategory.DERIVED
    && fact.provenance.derivation.inputFactIds.includes(observed.factId)),
  environmentIdentityBound: first.environment.identity === environment.identity
    && first.environment.version === environment.version,
  allSectionsRepresented: WORLD_STATE_SECTIONS.every((section) => Array.isArray(first.sections[section])),
  authorityR0: first.authority.tier === 'R0',
  cannotDispatch: first.authority.canDispatch === false,
  cannotMutateLiveWorld: first.authority.canMutateLiveWorld === false,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_0_WORLD_STATE_CONTRACT_V1',
  status,
  contract: {
    id: WORLD_STATE_CONTRACT_ID,
    schemaVersion: WORLD_STATE_SCHEMA_VERSION,
    source: 'src/stage3f/world-state-v1.js',
    sourceSha256: sourceHash,
    epistemicCategories: Object.values(EpistemicCategory),
    authorityPrecedence: first.authorityPrecedence,
    sections: WORLD_STATE_SECTIONS,
  },
  inherited: {
    latestCertifiedStage: 'STAGE_3E_ROUTABILITY_INTELLIGENCE',
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze,
    stage3eReplayPass: recovery.status === 'PASS',
    predecessorOwnersModified: false,
  },
  checks,
  authority: {
    tier: first.authority.tier,
    canDispatch: first.authority.canDispatch,
    canMutateLiveWorld: first.authority.canMutateLiveWorld,
    incumbentSoleExecutor: true,
  },
  onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_1_SENTINEL_CAUSAL_TRACE_V1',
};
payload.certificationHash = sha256(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(artifactPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash
    && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({
    check: 'STAGE3F0_CERTIFICATION',
    reproduced,
    storedHash: stored.certificationHash,
    recomputedHash: payload.certificationHash,
  }, null, 2));
  if (!reproduced) process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
