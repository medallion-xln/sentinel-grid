import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  EpistemicCategory,
  EvidenceAuthority,
  WorldStateContractError,
  createUnknownWorldStateFact,
  createWorldStateFact,
  createWorldStateSnapshot,
  readWorldStateFact,
  serializeWorldStateSnapshot,
  verifyWorldStateSnapshot,
} from '../src/stage3f/world-state-v1.js';
import { sha256 } from '../src/core/determinism.js';
import * as publicApi from '../src/index.js';

const environment = { identity: 'forge-world', version: 'FORGE_WORLD_V2' };
const provenance = (sourceId, evidenceId) => ({
  environmentIdentity: environment.identity,
  environmentVersion: environment.version,
  sourceId,
  evidenceId,
});
const observed = (value = 31) => createWorldStateFact({
  path: ['resources', 'actor', 'energy'],
  category: EpistemicCategory.OBSERVED,
  authority: EvidenceAuthority.AUTHORITATIVE_OBSERVATION,
  value,
  confidence: 1,
  uncertainty: { status: 'BOUNDED', radius: 0 },
  provenance: provenance('forge-observer-v2', 'obs-17-energy'),
});
const predicted = (value = 26) => createWorldStateFact({
  path: ['resources', 'actor', 'energy'],
  category: EpistemicCategory.PREDICTED,
  authority: EvidenceAuthority.CALIBRATED_PREDICTION,
  value,
  confidence: 0.81,
  uncertainty: { status: 'BOUNDED', radius: 3 },
  provenance: {
    ...provenance('oracle-energy-v1', 'prediction-17-energy'),
    prediction: { producerId: 'oracle-energy', producerVersion: '1', calibrated: true, horizon: 1 },
  },
});

test('identical evidence produces identical canonical state and digest', () => {
  const input = { environment, logicalTime: 17, timestamp: '2026-09-10T16:00:00Z', facts: [observed()] };
  const a = createWorldStateSnapshot(input);
  const b = createWorldStateSnapshot(structuredClone(input));
  assert.equal(a.snapshotId, b.snapshotId);
  assert.equal(serializeWorldStateSnapshot(a), serializeWorldStateSnapshot(b));
  assert.equal(verifyWorldStateSnapshot(a), true);
});

test('evidence order and exact duplicates do not affect snapshot identity', () => {
  const o = observed();
  const p = predicted();
  const a = createWorldStateSnapshot({ environment, logicalTime: 17, facts: [o, p, o] });
  const b = createWorldStateSnapshot({ environment, logicalTime: 17, facts: [p, o] });
  assert.equal(a.snapshotId, b.snapshotId);
});

test('predicted state cannot overwrite observed state and remains auditable evidence', () => {
  const snapshot = createWorldStateSnapshot({ environment, logicalTime: 17, facts: [predicted(), observed()] });
  assert.equal(snapshot.facts[0].category, EpistemicCategory.OBSERVED);
  assert.equal(snapshot.facts[0].value, 31);
  assert.equal(snapshot.nonAuthoritativeEvidence[0].category, EpistemicCategory.PREDICTED);
  assert.equal(snapshot.authority.canDispatch, false);
  assert.equal(snapshot.authority.canMutateLiveWorld, false);
});

test('unknown remains explicit and absent information reads as unknown, never a fabricated default', () => {
  const fact = createUnknownWorldStateFact({
    path: ['spatialState', 'entity-7', 'position'], environment,
    sourceId: 'partial-observer', evidenceId: 'obs-17-position', reason: 'SENSOR_OCCLUDED',
  });
  const snapshot = createWorldStateSnapshot({ environment, logicalTime: 17, facts: [fact] });
  assert.equal(readWorldStateFact(snapshot, fact.path).category, EpistemicCategory.UNKNOWN);
  const absent = readWorldStateFact(snapshot, ['constraints', 'weather']);
  assert.equal(absent.category, EpistemicCategory.UNKNOWN);
  assert.equal(absent.value, null);
  assert.equal(absent.provenance.reason, 'NOT_RECORDED');
});

test('derived facts require and retain derivation provenance', () => {
  const input = observed();
  const fact = createWorldStateFact({
    path: ['temporalState', 'actor', 'energyTrend'],
    category: EpistemicCategory.DERIVED,
    authority: EvidenceAuthority.VALIDATED_DERIVATION,
    value: 'FALLING', confidence: 0.9,
    uncertainty: { status: 'BOUNDED', sampleCount: 4 },
    provenance: {
      ...provenance('energy-trend-rule', 'derived-17-energy-trend'),
      derivation: { method: 'FINITE_DIFFERENCE_V1', inputFactIds: [input.factId] },
    },
  });
  assert.equal(fact.provenance.derivation.method, 'FINITE_DIFFERENCE_V1');
  assert.deepEqual(fact.provenance.derivation.inputFactIds, [input.factId]);
});

test('predicted facts require model identity and calibrated claims require calibration evidence', () => {
  assert.equal(predicted().provenance.prediction.producerId, 'oracle-energy');
  assert.throws(() => createWorldStateFact({
    ...predicted(), factId: undefined,
    provenance: { ...predicted().provenance, prediction: { producerId: 'x', producerVersion: '1', calibrated: false } },
  }), WorldStateContractError);
});

test('malformed epistemic evidence fails closed', () => {
  assert.throws(() => createWorldStateFact({
    path: ['resources', 'energy'], category: EpistemicCategory.UNKNOWN,
    authority: EvidenceAuthority.UNKNOWN, value: 0, confidence: 0,
    uncertainty: { status: 'UNKNOWN' }, provenance: { ...provenance('observer', 'bad'), reason: 'MISSING' },
  }), WorldStateContractError);
  assert.throws(() => createWorldStateFact({
    ...observed(), factId: undefined, category: EpistemicCategory.PREDICTED,
  }), WorldStateContractError);
});

test('environment identity and version mismatches are detected', () => {
  const identityMismatch = { ...observed(), provenance: { ...observed().provenance, environmentIdentity: 'other-world' } };
  const versionMismatch = { ...observed(), provenance: { ...observed().provenance, environmentVersion: 'FORGE_WORLD_V3' } };
  assert.throws(() => createWorldStateSnapshot({ environment, logicalTime: 17, facts: [identityMismatch] }), /identity mismatch/);
  assert.throws(() => createWorldStateSnapshot({ environment, logicalTime: 17, facts: [versionMismatch] }), /version mismatch/);
});

test('contradictory observations are surfaced rather than silently resolved', () => {
  assert.throws(
    () => createWorldStateSnapshot({ environment, logicalTime: 17, facts: [observed(31), observed(32)] }),
    (error) => error instanceof WorldStateContractError
      && error.message === 'contradictory equal-authority evidence'
      && error.details.path.join('.') === 'resources.actor.energy',
  );
});

test('tampering invalidates snapshot identity', () => {
  const snapshot = createWorldStateSnapshot({ environment, logicalTime: 17, facts: [observed()] });
  const tampered = structuredClone(snapshot);
  tampered.facts[0].value = 999;
  assert.throws(() => verifyWorldStateSnapshot(tampered), /digest mismatch/);
});

test('a self-rehashed but non-canonical snapshot still fails verification', () => {
  const tampered = structuredClone(createWorldStateSnapshot({
    environment, logicalTime: 17, facts: [observed(), predicted()],
  }));
  tampered.authorityPrecedence.reverse();
  const { snapshotId: unused, ...body } = tampered;
  tampered.snapshotId = `sha256:${sha256(body)}`;
  assert.throws(() => verifyWorldStateSnapshot(tampered), /non-canonical/);
});

test('ambiguous path separators are rejected', () => {
  assert.throws(() => createUnknownWorldStateFact({
    path: ['resources', 'actor\u001fenergy'], environment,
    sourceId: 'partial-observer', evidenceId: 'bad-path', reason: 'MISSING',
  }), /fact path/);
});

test('World State Contract v1 is available through the package API', () => {
  assert.equal(publicApi.WORLD_STATE_CONTRACT_ID, 'SENTINEL_WORLD_STATE_V1');
  assert.equal(publicApi.createWorldStateSnapshot, createWorldStateSnapshot);
});

test('the stored Stage 3F.0 certification binds the contract and inherited Stage 3E freeze', async () => {
  const artifact = JSON.parse(await readFile(new URL(
    '../artifacts/stage3f0-world-state-contract/stage3f0-certification-result.json',
    import.meta.url,
  ), 'utf8'));
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.contract.id, 'SENTINEL_WORLD_STATE_V1');
  assert.equal(artifact.inherited.stage3eRouterFreezeHash,
    '5a8e22b5c6a6889df658a74d134b376ee79fa1214760204a3265fe01f27c6bd2');
  assert.equal(artifact.inherited.predecessorOwnersModified, false);
  assert.deepEqual(artifact.authority, {
    tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true,
  });
});
