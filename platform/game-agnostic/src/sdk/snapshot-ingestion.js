import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ContractError, SnapshotIngestionError } from '../core/errors.js';
import {
  validateLegalActions,
  validateObservationPacket,
  validateOutcomePacket,
} from '../core/contracts.js';
import { deepFreeze, sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';
import { validateJsonDocument } from './config-schema.js';
import { findSnapshotFormat, validateSnapshotEnvelope } from './snapshot-contract.js';

function assert(condition, message, details = undefined) {
  if (!condition) throw new SnapshotIngestionError(message, details);
}

function isWithin(root, target) {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function bytesSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function observerEvidence(adapter, manifest, state, observers, terminal) {
  return observers.map((observerId) => {
    const observation = validateObservationPacket(adapter.observe(state, observerId), manifest);
    const legalActions = validateLegalActions(adapter.legalActions(state, observerId), { terminal });
    const outcome = validateOutcomePacket(adapter.outcome(state, observerId));
    assert(outcome.terminal === terminal, 'Snapshot outcome terminal flag disagrees with adapter terminal state', { observerId });
    return {
      observerId,
      observationHash: sha256(observation),
      featureCount: observation.features.length,
      legalActionsHash: sha256(legalActions),
      legalActionCount: legalActions.length,
      outcomeHash: sha256(outcome),
    };
  });
}

export class ProductionSnapshotIngestion {
  #registry;
  #allowedRoots;
  #maxBytes;
  #limits;
  #records = new Map();
  #states = new Map();

  constructor({
    registry,
    allowedRoots = [],
    maxBytes = 16 * 1024 * 1024,
    maxRecords = 1024,
    maxObserversPerSnapshot = 64,
    maxFeatureCountPerObserver = 1_000_000,
    maxLegalActionsPerObserver = 100_000,
  }) {
    assert(registry && typeof registry.get === 'function', 'A ProductionAdapterRegistry is required');
    assert(Array.isArray(allowedRoots), 'allowedRoots must be an array');
    assert(Number.isInteger(maxBytes) && maxBytes > 0, 'maxBytes must be a positive integer');
    for (const [name, value] of Object.entries({ maxRecords, maxObserversPerSnapshot, maxFeatureCountPerObserver, maxLegalActionsPerObserver })) {
      assert(Number.isInteger(value) && value > 0, `${name} must be a positive integer`);
    }
    this.#registry = registry;
    this.#allowedRoots = allowedRoots.map((entry) => path.resolve(entry));
    this.#maxBytes = maxBytes;
    this.#limits = deepFreeze({ maxRecords, maxObserversPerSnapshot, maxFeatureCountPerObserver, maxLegalActionsPerObserver });
  }

  get maxBytes() { return this.#maxBytes; }
  get limits() { return this.#limits; }

  usage() {
    return deepFreeze({ records: this.#records.size, states: this.#states.size, limits: this.#limits });
  }

  async ingestFile({ identity, file }) {
    const requested = path.resolve(file);
    const stat = await lstat(requested).catch((error) => {
      throw new SnapshotIngestionError('Unable to stat snapshot file', { cause: error.message });
    });
    assert(!stat.isSymbolicLink(), 'Snapshot file may not be a symbolic link');
    assert(stat.isFile(), 'Snapshot path must be a regular file');
    assert(stat.size <= this.#maxBytes, 'Snapshot file exceeds the configured byte limit', {
      size: stat.size, maxBytes: this.#maxBytes,
    });
    const resolved = await realpath(requested);
    if (this.#allowedRoots.length > 0) {
      const roots = await Promise.all(this.#allowedRoots.map((entry) => realpath(entry)));
      assert(roots.some((root) => isWithin(root, resolved)), 'Snapshot file is outside approved roots');
    }
    const bytes = await readFile(resolved);
    assert(bytes.length <= this.#maxBytes, 'Snapshot file exceeds the configured byte limit');
    let envelope;
    try { envelope = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new SnapshotIngestionError('Snapshot file must contain valid JSON', { cause: error.message }); }
    return this.ingestEnvelope({
      identity,
      envelope,
      source: {
        sourceType: 'file',
        sourceByteLength: bytes.length,
        sourceBytesSha256: bytesSha256(bytes),
      },
    });
  }

  ingestEnvelope({ identity, envelope, source = { sourceType: 'memory' } }) {
    const registration = this.#registry.get(identity);
    const validatedEnvelope = validateSnapshotEnvelope(envelope);
    assert(validatedEnvelope.observers.length <= this.#limits.maxObserversPerSnapshot, 'Snapshot observer count exceeds configured quota', {
      observerCount: validatedEnvelope.observers.length, maxObserversPerSnapshot: this.#limits.maxObserversPerSnapshot,
    });
    assert(validatedEnvelope.gameId === registration.manifest.gameId, 'Snapshot gameId does not match registered adapter');
    assert(validatedEnvelope.adapterId === registration.manifest.adapterId, 'Snapshot adapterId does not match registered adapter');
    assert(validatedEnvelope.adapterVersion === registration.manifest.adapterVersion, 'Snapshot adapterVersion does not match registered adapter');

    const format = findSnapshotFormat(registration, validatedEnvelope);
    const payloadHashBefore = sha256(validatedEnvelope.payload);
    const validatedPayload = validateJsonDocument(format.schemaDocument, validatedEnvelope.payload, '$snapshot.payload');
    const importer = registration.adapter[format.importerMethod];
    assert(typeof importer === 'function', `Snapshot importer method is unavailable: ${format.importerMethod}`);

    let importedState;
    try {
      importedState = importer(structuredClone(validatedPayload), {
        mode: 'detached-snapshot-ingestion',
        formatId: format.formatId,
        formatVersion: format.formatVersion,
        snapshotId: validatedEnvelope.snapshotId,
        configuration: registration.configuration,
      });
    } catch (error) {
      throw new SnapshotIngestionError(`Adapter snapshot importer rejected the snapshot: ${error.message}`, { cause: error.message });
    }
    assert(importedState !== undefined, 'Snapshot importer must return a state');
    assert(sha256(validatedEnvelope.payload) === payloadHashBefore, 'Snapshot importer mutated the source payload');

    const adapter = registration.adapter;
    const importedStateHash = sha256(importedState);
    const clone = adapter.cloneState(importedState);
    assert(sha256(clone) === importedStateHash, 'Imported snapshot state failed clone-content fidelity');
    assert(clone !== importedState, 'Adapter.cloneState must isolate the imported snapshot state');

    const terminalFirst = adapter.isTerminal(importedState);
    const terminalSecond = adapter.isTerminal(importedState);
    assert(typeof terminalFirst === 'boolean' && terminalFirst === terminalSecond, 'Imported snapshot terminal evaluation is not deterministic');
    const observers = observerEvidence(adapter, registration.manifest, importedState, validatedEnvelope.observers, terminalFirst);
    for (const observer of observers) {
      assert(observer.featureCount <= this.#limits.maxFeatureCountPerObserver, 'Snapshot observation exceeds configured feature quota', {
        observerId: observer.observerId, featureCount: observer.featureCount, maxFeatureCountPerObserver: this.#limits.maxFeatureCountPerObserver,
      });
      assert(observer.legalActionCount <= this.#limits.maxLegalActionsPerObserver, 'Snapshot legal action count exceeds configured quota', {
        observerId: observer.observerId, legalActionCount: observer.legalActionCount, maxLegalActionsPerObserver: this.#limits.maxLegalActionsPerObserver,
      });
    }
    assert(sha256(importedState) === importedStateHash, 'Snapshot validation mutated the imported state');

    const envelopeHash = sha256(validatedEnvelope);
    const handle = `snapshot:${sha256({
      identity,
      lockHash: registration.lockHash,
      envelopeHash,
      importedStateHash,
    })}`;
    const record = deepFreeze({
      snapshotContractVersion: validatedEnvelope.snapshotContractVersion,
      handle,
      identity,
      snapshotId: validatedEnvelope.snapshotId,
      gameId: validatedEnvelope.gameId,
      adapterId: validatedEnvelope.adapterId,
      adapterVersion: validatedEnvelope.adapterVersion,
      adapterManifest: registration.manifest,
      formatId: validatedEnvelope.formatId,
      formatVersion: validatedEnvelope.formatVersion,
      envelopeHash,
      payloadHash: payloadHashBefore,
      importedStateHash,
      terminal: terminalFirst,
      observers,
      source: {
        sourceType: source.sourceType ?? 'memory',
        sourceByteLength: source.sourceByteLength ?? null,
        sourceBytesSha256: source.sourceBytesSha256 ?? null,
      },
      provenance: {
        packageName: registration.packageName,
        packageVersion: registration.packageVersion,
        packageSha256: registration.packageSha256,
        configurationHash: registration.configurationHash,
        adapterLockHash: registration.lockHash,
        snapshotSchemaSha256: format.schemaSha256,
      },
      authority: {
        tier: 'R0',
        canDispatch: false,
        canMutateLiveWorld: false,
      },
    });

    const existing = this.#records.get(handle);
    if (existing) return existing;
    assert(this.#records.size < this.#limits.maxRecords, 'Snapshot record quota exceeded', {
      recordCount: this.#records.size, maxRecords: this.#limits.maxRecords,
    });
    this.#records.set(handle, record);
    this.#states.set(handle, adapter.cloneState(importedState));
    return record;
  }


async ingestBatch(entries, { continueOnError = true } = {}) {
  assert(Array.isArray(entries), 'Snapshot batch entries must be an array');
  const successes = [];
  const failures = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      const record = entry.file
        ? await this.ingestFile({ identity: entry.identity, file: entry.file })
        : this.ingestEnvelope({ identity: entry.identity, envelope: entry.envelope, source: entry.source });
      successes.push({ index, handle: record.handle, identity: record.identity, snapshotId: record.snapshotId });
    } catch (error) {
      const failure = { index, identity: entry?.identity ?? null, name: error?.name ?? 'Error', message: error?.message ?? String(error) };
      failures.push(failure);
      if (!continueOnError) throw error;
    }
  }
  return deepFreeze({ pass: failures.length === 0, successes, failures, usage: this.usage() });
}

  recommend({ handle, observerId, simulations = 128, seed = 1n, cPuct = 1.4 }) {
    const record = this.get(handle);
    assert(record.observers.some((entry) => entry.observerId === observerId), 'Observer is not declared by the snapshot');
    assert(!record.terminal, 'Cannot recommend from a terminal snapshot');
    const registration = this.#registry.get(record.identity);
    const state = this.#states.get(handle);
    assert(state, 'Snapshot state is unavailable');
    const stateHash = sha256(state);
    const packet = recommend({
      adapter: registration.adapter,
      state: registration.adapter.cloneState(state),
      observerId,
      simulations,
      seed,
      cPuct,
    });
    assert(sha256(state) === stateHash, 'Snapshot recommendation mutated stored state');
    return deepFreeze({
      snapshot: record,
      recommendation: packet,
      recommendationHash: sha256(packet),
    });
  }

  get(handle) {
    const record = this.#records.get(handle);
    assert(record, `Snapshot handle is not registered: ${handle}`);
    return record;
  }

  list() {
    return deepFreeze([...this.#records.values()].sort((a, b) => a.handle.localeCompare(b.handle)));
  }

  release(handle) {
    const existed = this.#records.delete(handle);
    this.#states.delete(handle);
    return existed;
  }

  releaseAll() {
    const released = this.#records.size;
    this.#records.clear();
    this.#states.clear();
    return released;
  }
}

export function buildSnapshotCertificationReport(record, recommendation = undefined) {
  if (!record || typeof record !== 'object') throw new ContractError('Snapshot record is required');
  const checks = [
    { name: 'snapshot-envelope-contract', pass: true, envelopeHash: record.envelopeHash },
    { name: 'snapshot-schema-validation', pass: true, snapshotSchemaSha256: record.provenance.snapshotSchemaSha256 },
    { name: 'snapshot-package-lock', pass: true, adapterLockHash: record.provenance.adapterLockHash, packageSha256: record.provenance.packageSha256 },
    { name: 'snapshot-imported-state', pass: true, importedStateHash: record.importedStateHash },
    { name: 'snapshot-observer-contracts', pass: true, observers: record.observers },
    { name: 'snapshot-r0-boundary', pass: true, ...record.authority },
  ];
  if (recommendation) {
    checks.push({
      name: 'snapshot-prime-recommendation',
      pass: true,
      recommendationHash: recommendation.recommendationHash,
      selectedActionKey: recommendation.recommendation.selected.actionKey,
    });
  }
  return deepFreeze({
    pass: checks.every((check) => check.pass),
    adapter: record.adapterManifest,
    certification: {
      evidenceKind: 'production-snapshot-ingestion',
      identity: record.identity,
      snapshotId: record.snapshotId,
      envelopeHash: record.envelopeHash,
      payloadHash: record.payloadHash,
      importedStateHash: record.importedStateHash,
      adapterLockHash: record.provenance.adapterLockHash,
      snapshotSchemaSha256: record.provenance.snapshotSchemaSha256,
    },
    checks,
  });
}
