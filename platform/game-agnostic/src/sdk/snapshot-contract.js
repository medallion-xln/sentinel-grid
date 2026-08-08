import { SNAPSHOT_CONTRACT_VERSION } from '../core/constants.js';
import { ContractError } from '../core/errors.js';
import { deepFreeze } from '../core/determinism.js';
import { validateJsonValue } from '../core/contracts.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new ContractError(message, details);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function identifier(value, path) {
  assert(typeof value === 'string' && value.length > 0, `${path} is required`);
  assert(value.length <= 256, `${path} must not exceed 256 characters`);
  assert(!value.includes('\u0000'), `${path} must not contain NUL`);
  return value;
}

export function snapshotFormatKey(format) {
  return `${format.formatId}@${format.formatVersion}`;
}

export function validateSnapshotFormatDescriptor(format, path = '$format') {
  assert(isRecord(format), `${path} must be an object`);
  identifier(format.formatId, `${path}.formatId`);
  assert(Number.isInteger(format.formatVersion) && format.formatVersion >= 1, `${path}.formatVersion must be a positive integer`);
  identifier(format.schema, `${path}.schema`);
  identifier(format.schemaSha256, `${path}.schemaSha256`);
  assert(/^[a-f0-9]{64}$/.test(format.schemaSha256), `${path}.schemaSha256 must be SHA-256 hex`);
  identifier(format.importerMethod, `${path}.importerMethod`);
  return format;
}

export function validateSnapshotEnvelope(envelope) {
  assert(isRecord(envelope), 'Snapshot envelope must be an object');
  assert(envelope.snapshotContractVersion === SNAPSHOT_CONTRACT_VERSION, `snapshotContractVersion must equal ${SNAPSHOT_CONTRACT_VERSION}`);
  identifier(envelope.gameId, 'snapshot.gameId');
  identifier(envelope.adapterId, 'snapshot.adapterId');
  identifier(envelope.adapterVersion, 'snapshot.adapterVersion');
  identifier(envelope.snapshotId, 'snapshot.snapshotId');
  identifier(envelope.formatId, 'snapshot.formatId');
  assert(Number.isInteger(envelope.formatVersion) && envelope.formatVersion >= 1, 'snapshot.formatVersion must be a positive integer');
  assert(Array.isArray(envelope.observers) && envelope.observers.length > 0, 'snapshot.observers must be non-empty');
  const observerSet = new Set();
  for (const observer of envelope.observers) {
    identifier(observer, 'snapshot.observers[]');
    assert(!observerSet.has(observer), 'snapshot.observers must be unique');
    observerSet.add(observer);
  }
  assert(Object.hasOwn(envelope, 'payload'), 'snapshot.payload is required');
  validateJsonValue(envelope.payload, 'snapshot.payload');
  assert(isRecord(envelope.metadata), 'snapshot.metadata is required');
  validateJsonValue(envelope.metadata, 'snapshot.metadata');
  return deepFreeze(structuredClone(envelope));
}

export function findSnapshotFormat(registration, envelope) {
  const format = registration.snapshotFormats.find(
    (candidate) => candidate.formatId === envelope.formatId && candidate.formatVersion === envelope.formatVersion,
  );
  assert(format, `Snapshot format is not locked for adapter: ${envelope.formatId}@${envelope.formatVersion}`);
  return format;
}
