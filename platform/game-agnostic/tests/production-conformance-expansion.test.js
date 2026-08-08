import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDeterministicEvidence,
  discoverAdapterPackages,
  readAdapterLock,
  ProductionAdapterRegistry,
  ProductionSnapshotIngestion,
  runProductionConformanceExpansion,
  sha256,
} from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const identity = 'reference-production-arena:reference-production-arena-adapter';

async function context() {
  const descriptors = await discoverAdapterPackages({ roots: [path.join(root, 'production-adapters')] });
  const lock = await readAdapterLock(path.join(root, 'sentinel-grid.adapters.lock.json'));
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  const registration = registry.get(identity);
  const envelope = JSON.parse(await readFile(path.join(root, 'snapshots/reference-production-arena/midgame.json'), 'utf8'));
  const profile = JSON.parse(await readFile(path.join(root, 'config/production-conformance-expansion.json'), 'utf8'));
  const ingestion = new ProductionSnapshotIngestion({ registry, maxRecords: 256, maxObserversPerSnapshot: 16, maxFeatureCountPerObserver: 8192, maxLegalActionsPerObserver: 1024 });
  ingestion.ingestEnvelope({ identity, envelope });
  return { descriptors, lock, registry, registration, envelope, profile, ingestion };
}

test('production-scale adapter declares all required capability surfaces', async () => {
  const { registration } = await context();
  assert.equal(registration.certificationProfile, 'production-scale-r0');
  assert.deepEqual(registration.manifest.capabilities, {
    imperfectInformation: true,
    stochasticTransitions: true,
    simultaneousActions: true,
    variableObservationSize: true,
  });
  assert.equal(registration.manifest.authority.tier, 'R0');
});

test('production-scale observations and legal actions meet configured floors', async () => {
  const { registration } = await context();
  const state = registration.adapter.initialState(17n);
  const observation = registration.adapter.observe(state, 'alpha-0');
  const actions = registration.adapter.legalActions(state, 'alpha-0');
  assert.equal(observation.features.length, 2048);
  assert.equal(actions.length, 96);
  assert.equal(actions.every((action) => action.metadata.simultaneous === true), true);
});

test('private observers receive distinct deterministic observations', async () => {
  const { registration } = await context();
  const state = registration.adapter.initialState(17n);
  const ids = ['alpha-0', 'alpha-1', 'beta-0', 'beta-1'];
  const first = ids.map((id) => sha256(registration.adapter.observe(state, id)));
  const second = ids.map((id) => sha256(registration.adapter.observe(state, id)));
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 4);
});

test('Stage 2C production conformance report passes all expansion checks', async () => {
  const ctx = await context();
  const report = await runProductionConformanceExpansion({ ...ctx, seed: 707n });
  assert.equal(report.pass, true);
  assert.equal(report.checks.length, 13);
  assert.equal(report.checks.every((check) => check.pass), true);
  assert.equal(report.checks.at(-1).tier, 'R0');
});

test('Stage 2C production conformance evidence is portable', async () => {
  const leftContext = await context();
  const rightContext = await context();
  const left = await runProductionConformanceExpansion({ ...leftContext, seed: 707n });
  const right = await runProductionConformanceExpansion({ ...rightContext, seed: 707n });
  const leftEvidence = buildDeterministicEvidence([left]);
  const rightEvidence = buildDeterministicEvidence([right]);
  assert.equal(leftEvidence.deterministicEvidenceHash, rightEvidence.deterministicEvidenceHash);
  assert.equal(JSON.stringify(leftEvidence).includes('durationMs'), false);
});
