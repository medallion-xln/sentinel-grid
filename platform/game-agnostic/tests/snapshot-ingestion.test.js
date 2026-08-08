import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverAdapterPackages,
  readAdapterLock,
  ProductionAdapterRegistry,
  ProductionSnapshotIngestion,
  buildSnapshotCertificationReport,
  buildDeterministicEvidence,
  validateSnapshotEnvelope,
  validateJsonDocument,
  sha256,
} from '../src/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = path.join(root, 'production-adapters');
const lockFile = path.join(root, 'sentinel-grid.adapters.lock.json');
const snapshotRoot = path.join(root, 'snapshots');
const tokenFile = path.join(snapshotRoot, 'reference-token-race/midgame.json');
const rescueFile = path.join(snapshotRoot, 'reference-grid-rescue/midgame.json');

async function makeContext(options = {}) {
  const descriptors = await discoverAdapterPackages({ roots: [adapterRoot] });
  const lock = await readAdapterLock(lockFile);
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  const ingestion = new ProductionSnapshotIngestion({
    registry,
    allowedRoots: options.allowedRoots ?? [snapshotRoot],
    maxBytes: options.maxBytes ?? 1024 * 1024,
  });
  return { descriptors, lock, registry, ingestion };
}

async function tokenEnvelope() {
  return JSON.parse(await readFile(tokenFile, 'utf8'));
}

test('discovery binds snapshot format schemas and importer methods', async () => {
  const { descriptors } = await makeContext();
  for (const descriptor of descriptors) {
    assert.equal(descriptor.snapshotFormats.length, 1);
    assert.match(descriptor.snapshotFormats[0].schemaSha256, /^[a-f0-9]{64}$/);
    assert.equal(descriptor.snapshotFormats[0].importerMethod, 'importSnapshot');
    assert.equal(Object.isFrozen(descriptor.snapshotFormats[0]), true);
  }
});

test('adapter lock binds snapshot format and schema integrity', async () => {
  const { lock } = await makeContext();
  for (const entry of lock.packages) {
    assert.equal(entry.snapshotFormats.length, 1);
    assert.equal(entry.snapshotFormatsHash, sha256(entry.snapshotFormats));
  }
});

test('file ingestion validates and stores an opaque snapshot handle', async () => {
  const { ingestion } = await makeContext();
  const record = await ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: tokenFile,
  });
  assert.match(record.handle, /^snapshot:[a-f0-9]{64}$/);
  assert.equal(record.terminal, false);
  assert.equal(record.observers.length, 1);
  assert.equal(record.authority.tier, 'R0');
  assert.equal(record.authority.canDispatch, false);
  assert.equal(Object.hasOwn(record, 'state'), false);
  assert.equal(record.source.sourceType, 'file');
  assert.match(record.source.sourceBytesSha256, /^[a-f0-9]{64}$/);
});

test('ingesting the same canonical snapshot is idempotent', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  const left = ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  });
  const right = ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope: structuredClone(envelope),
  });
  assert.equal(left.handle, right.handle);
  assert.equal(ingestion.list().length, 1);
});

test('snapshot envelope contract rejects duplicate observers', async () => {
  const envelope = await tokenEnvelope();
  envelope.observers = ['player-1', 'player-1'];
  assert.throws(() => validateSnapshotEnvelope(envelope), /unique/);
});

test('snapshot schema rejects unknown game-owned fields', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  envelope.payload.unauthorized = true;
  assert.throws(() => ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  }), /not allowed/);
});

test('snapshot schema rejects invalid nested values', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  envelope.payload.scores['player-1'] = -1;
  assert.throws(() => ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  }), />= 0/);
});

test('adapter-specific importer enforces locked configuration', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  envelope.payload.target = 11;
  assert.throws(() => ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  }), /locked targetScore/);
});

test('snapshot identity must match the locked adapter', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  envelope.adapterVersion = '9.9.9';
  assert.throws(() => ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  }), /adapterVersion/);
});

test('snapshot files outside approved roots are rejected', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sgrid-snapshot-outside-'));
  const outside = path.join(directory, 'snapshot.json');
  await writeFile(outside, await readFile(tokenFile));
  const { ingestion } = await makeContext();
  await assert.rejects(() => ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: outside,
  }), /outside approved roots/);
});

test('symbolic-link snapshot files are rejected', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sgrid-snapshot-link-'));
  const link = path.join(directory, 'snapshot.json');
  await symlink(tokenFile, link);
  const { ingestion } = await makeContext({ allowedRoots: [directory] });
  await assert.rejects(() => ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: link,
  }), /symbolic link/);
});

test('snapshot byte limits are enforced before parsing', async () => {
  const { ingestion } = await makeContext({ maxBytes: 32 });
  await assert.rejects(() => ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: tokenFile,
  }), /byte limit/);
});

test('Prime recommends deterministically from a detached snapshot handle', async () => {
  const { ingestion } = await makeContext();
  const record = await ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: tokenFile,
  });
  const left = ingestion.recommend({
    handle: record.handle, observerId: 'player-1', seed: 91n, simulations: 64, cPuct: 1.25,
  });
  const right = ingestion.recommend({
    handle: record.handle, observerId: 'player-1', seed: 91n, simulations: 64, cPuct: 1.25,
  });
  assert.equal(left.recommendationHash, right.recommendationHash);
  assert.equal(left.recommendation.authority.tier, 'R0');
  assert.equal(left.recommendation.authority.canDispatch, false);
  assert.equal(Object.hasOwn(left.snapshot, 'state'), false);
});

test('snapshot certification evidence is portable and provenance-bound', async () => {
  const { ingestion } = await makeContext();
  const record = await ingestion.ingestFile({
    identity: 'reference-grid-rescue:reference-grid-rescue-adapter',
    file: rescueFile,
  });
  const recommendation = ingestion.recommend({
    handle: record.handle, observerId: 'controller', seed: 17n, simulations: 32, cPuct: 1.25,
  });
  const report = buildSnapshotCertificationReport(record, recommendation);
  const evidence = buildDeterministicEvidence([report]);
  assert.equal(report.pass, true);
  assert.equal(report.checks.length, 7);
  assert.equal(report.checks[5].tier, 'R0');
  assert.match(evidence.deterministicEvidenceHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(evidence).includes(root), false);
});

test('terminal snapshots can be ingested but not searched', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  envelope.snapshotId = 'terminal-token-race';
  envelope.payload.scores['player-1'] = 10;
  envelope.payload.activePlayer = 'player-2';
  const record = ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope,
  });
  assert.equal(record.terminal, true);
  assert.throws(() => ingestion.recommend({
    handle: record.handle, observerId: 'player-1',
  }), /terminal snapshot/);
});

test('released handles no longer expose snapshot metadata or state', async () => {
  const { ingestion } = await makeContext();
  const record = await ingestion.ingestFile({
    identity: 'reference-token-race:reference-token-race-adapter',
    file: tokenFile,
  });
  assert.equal(ingestion.release(record.handle), true);
  assert.equal(ingestion.release(record.handle), false);
  assert.throws(() => ingestion.get(record.handle), /not registered/);
});

test('generic document validation does not apply configuration defaults', () => {
  const schema = {
    type: 'object',
    properties: { required: { type: 'integer' }, optional: { type: 'integer', default: 9 } },
    required: ['required'],
    additionalProperties: false,
  };
  const document = validateJsonDocument(schema, { required: 3 });
  assert.deepEqual(document, { required: 3 });
});


test('snapshot ingestion enforces record quotas without evicting accepted records', async () => {
  const { descriptors, lock, registry } = await makeContext();
  assert.equal(descriptors.length, 4);
  const ingestion = new ProductionSnapshotIngestion({ registry, maxRecords: 2 });
  const envelope = await tokenEnvelope();
  const batch = await ingestion.ingestBatch(Array.from({ length: 3 }, (_, index) => ({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope: { ...structuredClone(envelope), snapshotId: `quota-${index}` },
  })));
  assert.equal(batch.successes.length, 2);
  assert.equal(batch.failures.length, 1);
  assert.equal(ingestion.usage().records, 2);
  for (const success of batch.successes) assert.equal(ingestion.get(success.handle).snapshotId.startsWith('quota-'), true);
});

test('snapshot batches isolate malformed entries and continue safely', async () => {
  const { ingestion } = await makeContext();
  const valid = await tokenEnvelope();
  valid.snapshotId = 'batch-valid';
  const malformed = structuredClone(valid);
  malformed.snapshotId = 'batch-malformed';
  malformed.payload = { invalid: true };
  const batch = await ingestion.ingestBatch([
    { identity: 'reference-token-race:reference-token-race-adapter', envelope: valid },
    { identity: 'reference-token-race:reference-token-race-adapter', envelope: malformed },
  ]);
  assert.equal(batch.pass, false);
  assert.equal(batch.successes.length, 1);
  assert.equal(batch.failures.length, 1);
  assert.equal(ingestion.get(batch.successes[0].handle).snapshotId, 'batch-valid');
});

test('snapshot observer and surface quotas fail closed', async () => {
  const { registry } = await makeContext();
  const arena = JSON.parse(await readFile(path.join(snapshotRoot, 'reference-production-arena/midgame.json'), 'utf8'));
  const observerLimited = new ProductionSnapshotIngestion({ registry, maxObserversPerSnapshot: 2 });
  assert.throws(() => observerLimited.ingestEnvelope({
    identity: 'reference-production-arena:reference-production-arena-adapter', envelope: arena,
  }), /observer count/);
  const featureLimited = new ProductionSnapshotIngestion({ registry, maxFeatureCountPerObserver: 1024 });
  assert.throws(() => featureLimited.ingestEnvelope({
    identity: 'reference-production-arena:reference-production-arena-adapter', envelope: arena,
  }), /feature quota/);
  const actionLimited = new ProductionSnapshotIngestion({ registry, maxLegalActionsPerObserver: 32 });
  assert.throws(() => actionLimited.ingestEnvelope({
    identity: 'reference-production-arena:reference-production-arena-adapter', envelope: arena,
  }), /legal action count/);
});

test('releaseAll clears opaque records and states together', async () => {
  const { ingestion } = await makeContext();
  const envelope = await tokenEnvelope();
  for (let index = 0; index < 3; index += 1) ingestion.ingestEnvelope({
    identity: 'reference-token-race:reference-token-race-adapter',
    envelope: { ...structuredClone(envelope), snapshotId: `release-all-${index}` },
  });
  assert.equal(ingestion.releaseAll(), 3);
  assert.equal(ingestion.usage().records, 0);
  assert.equal(ingestion.usage().states, 0);
});
