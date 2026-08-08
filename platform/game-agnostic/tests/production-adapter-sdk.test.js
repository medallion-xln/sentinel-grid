import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverAdapterPackages,
  computeAdapterPackageIntegrity,
} from '../src/sdk/package-discovery.js';
import {
  createAdapterLock,
  readAdapterLock,
  validateAdapterLock,
  verifyDescriptorAgainstLock,
} from '../src/sdk/lockfile.js';
import { resolveAdapterConfiguration } from '../src/sdk/config-schema.js';
import {
  getCertificationProfile,
  validateProfileCompatibility,
} from '../src/sdk/certification-profiles.js';
import { ProductionAdapterRegistry } from '../src/sdk/adapter-registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = path.join(root, 'production-adapters');
const lockFile = path.join(root, 'sentinel-grid.adapters.lock.json');

async function context() {
  const descriptors = await discoverAdapterPackages({ roots: [adapterRoot] });
  const lock = await readAdapterLock(lockFile);
  return { descriptors, lock };
}

test('production adapter discovery finds marked external packages', async () => {
  const { descriptors } = await context();
  assert.equal(descriptors.length, 4);
  assert.deepEqual(descriptors.map((entry) => entry.adapterId), [
    'reference-grid-rescue-adapter',
    'reference-production-arena-adapter',
    'reference-token-race-adapter',
    'zeknova-stage1az-shadow-adapter',
  ]);
});

test('package discovery captures deterministic source integrity', async () => {
  const { descriptors } = await context();
  const descriptor = descriptors[0];
  const repeated = await computeAdapterPackageIntegrity(descriptor.packageRoot);
  assert.equal(repeated.packageSha256, descriptor.packageSha256);
  assert.ok(repeated.entries.length >= 3);
});

test('adapter lock is path-independent', async () => {
  const { lock } = await context();
  const encoded = JSON.stringify(lock);
  assert.equal(encoded.includes(root), false);
  assert.equal(encoded.includes('packageRoot'), false);
  assert.equal(encoded.includes('entryAbsolute'), false);
});

test('adapter lock generation is order-independent', async () => {
  const { descriptors, lock } = await context();
  const configs = Object.fromEntries(lock.packages.map((entry) => [entry.adapterId, entry.configuration]));
  const rebuilt = createAdapterLock([...descriptors].reverse(), configs);
  assert.equal(rebuilt.lockHash, lock.lockHash);
});

test('lock rejects package version drift', async () => {
  const { descriptors, lock } = await context();
  assert.throws(
    () => verifyDescriptorAgainstLock({ ...descriptors[0], packageVersion: '9.9.9' }, lock),
    /packageVersion/,
  );
});

test('lock rejects source integrity drift', async () => {
  const { descriptors, lock } = await context();
  assert.throws(
    () => verifyDescriptorAgainstLock({ ...descriptors[0], packageSha256: '0'.repeat(64) }, lock),
    /packageSha256/,
  );
});

test('lock validates its own canonical hash', async () => {
  const { lock } = await context();
  const corrupted = structuredClone(lock);
  corrupted.packages[0].configuration = { changed: true };
  assert.throws(() => validateAdapterLock(corrupted), /lock hash mismatch/i);
});

test('adapter configuration applies defaults and freezes output', async () => {
  const { descriptors } = await context();
  const token = descriptors.find((entry) => entry.adapterId === 'reference-token-race-adapter');
  const config = resolveAdapterConfiguration(token.configurationSchema, { targetScore: 12 });
  assert.equal(config.targetScore, 12);
  assert.equal(config.purposeLabel, 'production package discovery proof');
  assert.equal(Object.isFrozen(config), true);
});

test('adapter configuration rejects unknown properties', async () => {
  const { descriptors } = await context();
  const token = descriptors.find((entry) => entry.adapterId === 'reference-token-race-adapter');
  assert.throws(
    () => resolveAdapterConfiguration(token.configurationSchema, { targetScore: 10, unauthorized: true }),
    /not allowed/,
  );
});

test('adapter configuration enforces numeric bounds', async () => {
  const { descriptors } = await context();
  const token = descriptors.find((entry) => entry.adapterId === 'reference-token-race-adapter');
  assert.throws(() => resolveAdapterConfiguration(token.configurationSchema, { targetScore: 2 }), />= 4/);
});

test('certification profiles are immutable and named', () => {
  const profile = getCertificationProfile('production-r0');
  assert.equal(profile.requiredAuthority, 'R0');
  assert.equal(Object.isFrozen(profile), true);
  assert.throws(() => getCertificationProfile('unknown-profile'), /Unknown certification profile/);
});

test('capability-specific profile rejects incompatible manifests', () => {
  assert.throws(() => validateProfileCompatibility({
    authority: { tier: 'R0' },
    capabilities: { imperfectInformation: false },
  }, 'imperfect-information-r0'), /imperfectInformation=true/);
});

test('registry loads only exact locked packages', async () => {
  const { descriptors, lock } = await context();
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  assert.equal(registry.lockHash, lock.lockHash);
  assert.equal(registry.list().length, 4);
});

test('registry passes locked configuration into adapter factories', async () => {
  const { descriptors, lock } = await context();
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  const token = registry.get('reference-token-race:reference-token-race-adapter');
  const rescue = registry.get('reference-grid-rescue:reference-grid-rescue-adapter');
  assert.equal(token.adapter.initialState(7n).target, 10);
  assert.equal(rescue.adapter.initialState(11n).energy, 3);
  assert.equal(rescue.adapter.initialState(11n).maxTurns, 5);
});

test('registry rejects duplicate registration', async () => {
  const { descriptors, lock } = await context();
  const registry = new ProductionAdapterRegistry({ lock });
  await registry.registerPackage(descriptors[0]);
  await assert.rejects(() => registry.registerPackage(descriptors[0]), /already registered/);
});

test('production certification binds package, configuration, lock, and profile evidence', async () => {
  const { descriptors, lock } = await context();
  const registry = new ProductionAdapterRegistry({ lock });
  for (const descriptor of descriptors) await registry.registerPackage(descriptor);
  const report = registry.certify('reference-grid-rescue:reference-grid-rescue-adapter', {
    observerId: 'controller', seed: 11n, simulations: 32,
  });
  assert.equal(report.pass, true);
  assert.equal(report.certification.lockHash, lock.lockHash);
  assert.equal(report.certification.profileName, 'imperfect-information-r0');
  assert.equal(report.checks[0].name, 'production-package-lock');
  assert.equal(report.checks[1].name, 'certification-profile');
  assert.equal(report.checks[2].name, 'snapshot-ingestion-contract');
  assert.equal(report.checks[3].name, 'snapshot-format-lock');
  assert.equal(report.checks.length, 19);
});
