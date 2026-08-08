import { readFile, writeFile } from 'node:fs/promises';
import { CONTRACT_VERSION, KERNEL_VERSION } from '../core/constants.js';
import { ContractError } from '../core/errors.js';
import { deepFreeze, sha256 } from '../core/determinism.js';
import { resolveAdapterConfiguration } from './config-schema.js';

export const ADAPTER_LOCK_VERSION = 2;

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function lockPayload(packages) {
  return {
    lockVersion: ADAPTER_LOCK_VERSION,
    contractVersion: CONTRACT_VERSION,
    kernelVersion: KERNEL_VERSION,
    packages,
  };
}

function lockSnapshotFormats(descriptor) {
  return descriptor.snapshotFormats.map((format) => ({
    formatId: format.formatId,
    formatVersion: format.formatVersion,
    schema: format.schema,
    schemaSha256: format.schemaSha256,
    importerMethod: format.importerMethod,
  }));
}

export function createAdapterLock(descriptors, configurations = {}) {
  assert(Array.isArray(descriptors) && descriptors.length > 0, 'descriptors must be a non-empty array');
  const packages = descriptors.map((descriptor) => {
    const configuration = resolveAdapterConfiguration(
      descriptor.configurationSchema,
      configurations[descriptor.adapterId] ?? {},
    );
    return {
      packageName: descriptor.packageName,
      packageVersion: descriptor.packageVersion,
      packageSha256: descriptor.packageSha256,
      entry: descriptor.entry,
      entrySha256: descriptor.entrySha256,
      configSchema: descriptor.configSchema,
      configSchemaSha256: descriptor.configSchemaSha256,
      gameId: descriptor.gameId,
      adapterId: descriptor.adapterId,
      adapterVersion: descriptor.adapterVersion,
      factoryExport: descriptor.factoryExport,
      certificationProfile: descriptor.certificationProfile,
      snapshotFormats: lockSnapshotFormats(descriptor),
      snapshotFormatsHash: sha256(lockSnapshotFormats(descriptor)),
      configuration,
      configurationHash: sha256(configuration),
    };
  }).sort((a, b) => `${a.packageName}:${a.adapterId}`.localeCompare(`${b.packageName}:${b.adapterId}`));
  const payload = lockPayload(packages);
  return deepFreeze({ ...payload, lockHash: sha256(payload) });
}

export function validateAdapterLock(lock) {
  assert(lock && typeof lock === 'object' && !Array.isArray(lock), 'Adapter lock must be an object');
  assert(lock.lockVersion === ADAPTER_LOCK_VERSION, `lockVersion must equal ${ADAPTER_LOCK_VERSION}`);
  assert(lock.contractVersion === CONTRACT_VERSION, `contractVersion must equal ${CONTRACT_VERSION}`);
  assert(lock.kernelVersion === KERNEL_VERSION, `kernelVersion must equal ${KERNEL_VERSION}`);
  assert(Array.isArray(lock.packages) && lock.packages.length > 0, 'lock.packages must be non-empty');
  const payload = lockPayload(lock.packages);
  assert(lock.lockHash === sha256(payload), 'Adapter lock hash mismatch');
  const identities = new Set();
  for (const entry of lock.packages) {
    for (const field of [
      'packageName','packageVersion','packageSha256','entry','entrySha256','configSchema','configSchemaSha256',
      'gameId','adapterId','adapterVersion','factoryExport','certificationProfile','snapshotFormatsHash','configurationHash',
    ]) {
      assert(typeof entry[field] === 'string' && entry[field].length > 0, `Lock entry ${field} is required`);
    }
    assert(Array.isArray(entry.snapshotFormats) && entry.snapshotFormats.length > 0,
      `Lock entry snapshotFormats must be non-empty for ${entry.adapterId}`);
    const keys = new Set();
    for (const format of entry.snapshotFormats) {
      for (const field of ['formatId','schema','schemaSha256','importerMethod']) {
        assert(typeof format[field] === 'string' && format[field].length > 0,
          `Snapshot lock entry ${field} is required for ${entry.adapterId}`);
      }
      assert(Number.isInteger(format.formatVersion) && format.formatVersion >= 1,
        `Snapshot formatVersion must be positive for ${entry.adapterId}`);
      const key = `${format.formatId}@${format.formatVersion}`;
      assert(!keys.has(key), 'Duplicate snapshot format in lock', { key });
      keys.add(key);
    }
    assert(entry.snapshotFormatsHash === sha256(entry.snapshotFormats), `Snapshot format hash mismatch for ${entry.adapterId}`);
    assert(entry.configurationHash === sha256(entry.configuration), `Configuration hash mismatch for ${entry.adapterId}`);
    const identity = `${entry.gameId}:${entry.adapterId}`;
    assert(!identities.has(identity), 'Duplicate adapter lock identity', { identity });
    identities.add(identity);
  }
  return lock;
}

export async function readAdapterLock(file) {
  return validateAdapterLock(JSON.parse(await readFile(file, 'utf8')));
}

export async function writeAdapterLock(file, lock) {
  validateAdapterLock(lock);
  await writeFile(file, `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

export function findLockedAdapter(lock, descriptor) {
  validateAdapterLock(lock);
  const entry = lock.packages.find((candidate) => candidate.packageName === descriptor.packageName && candidate.adapterId === descriptor.adapterId);
  assert(entry, `Adapter is not present in the lock: ${descriptor.adapterId}`);
  return entry;
}

export function verifyDescriptorAgainstLock(descriptor, lock) {
  const entry = findLockedAdapter(lock, descriptor);
  const comparisons = [
    'packageVersion','packageSha256','entry','entrySha256','configSchema','configSchemaSha256',
    'gameId','adapterId','adapterVersion','factoryExport','certificationProfile',
  ];
  for (const field of comparisons) {
    assert(descriptor[field] === entry[field], `Adapter lock mismatch for ${descriptor.adapterId}: ${field}`, {
      expected: entry[field], actual: descriptor[field],
    });
  }
  const descriptorFormats = lockSnapshotFormats(descriptor);
  assert(sha256(descriptorFormats) === entry.snapshotFormatsHash,
    `Adapter lock mismatch for ${descriptor.adapterId}: snapshotFormatsHash`);
  return entry;
}
