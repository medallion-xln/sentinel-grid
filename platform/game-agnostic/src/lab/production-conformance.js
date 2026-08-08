import { performance } from 'node:perf_hooks';
import {
  actionKey,
  validateLegalActions,
  validateObservationPacket,
  validateTransitionResult,
} from '../core/contracts.js';
import { createSeededRandom, deepFreeze, deriveSeed, sha256 } from '../core/determinism.js';
import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { ProductionSnapshotIngestion } from '../sdk/snapshot-ingestion.js';

function serializeError(error) {
  return { name: error?.name ?? 'Error', message: error?.message ?? String(error), details: error?.details };
}

function cloneEnvelope(envelope, snapshotId) {
  const copy = structuredClone(envelope);
  copy.snapshotId = snapshotId;
  return copy;
}

export async function runProductionConformanceExpansion({
  registry,
  registration,
  ingestion,
  envelope,
  profile,
  seed = 707n,
}) {
  const checks = [];
  const diagnostics = {};
  const state = registration.adapter.importSnapshot(structuredClone(envelope.payload), {
    mode: 'detached-snapshot-ingestion',
    formatId: envelope.formatId,
    formatVersion: envelope.formatVersion,
    snapshotId: envelope.snapshotId,
    configuration: registration.configuration,
  });
  const sourceHash = sha256(state);

  async function check(name, fn) {
    const started = performance.now();
    try {
      const details = await fn() ?? {};
      const durationMs = Number((performance.now() - started).toFixed(3));
      diagnostics[name] = durationMs;
      checks.push({ name, pass: true, durationMs, ...details });
    } catch (error) {
      const durationMs = Number((performance.now() - started).toFixed(3));
      diagnostics[name] = durationMs;
      checks.push({ name, pass: false, durationMs, error: serializeError(error) });
    }
  }

  await check('production-scale-profile', () => {
    if (registration.certificationProfile !== 'production-scale-r0') throw new Error('Scale adapter must use production-scale-r0');
    if (!registration.manifest.capabilities.simultaneousActions) throw new Error('Simultaneous actions capability is required');
    return { profileName: registration.certificationProfile, profileVersion: registration.profile.profileVersion };
  });

  const observations = new Map();
  const actionSets = new Map();
  await check('large-variable-observation-surface', () => {
    for (const observerId of profile.observerIds) {
      const observation = validateObservationPacket(registration.adapter.observe(state, observerId), registration.manifest);
      if (observation.features.length < profile.minimumObservationFeatures) throw new Error('Observation feature floor not met');
      observations.set(observerId, observation);
    }
    return { observerCount: observations.size, minimumFeatureCount: Math.min(...[...observations.values()].map((v) => v.features.length)) };
  });

  await check('large-legal-action-surface', () => {
    for (const observerId of profile.observerIds) {
      const actions = validateLegalActions(registration.adapter.legalActions(state, observerId), { terminal: false });
      if (actions.length < profile.minimumLegalActions) throw new Error('Legal action floor not met');
      actionSets.set(observerId, actions);
    }
    return { minimumLegalActionCount: Math.min(...[...actionSets.values()].map((v) => v.length)) };
  });

  await check('multi-observer-private-information', () => {
    const hashes = profile.observerIds.map((id) => sha256(observations.get(id)));
    if (new Set(hashes).size !== hashes.length) throw new Error('Private observer observations are not distinct');
    return { observerCount: hashes.length, distinctObservationHashCount: new Set(hashes).size };
  });

  await check('multi-actor-simultaneous-action-bundles', () => {
    const actors = new Set();
    let simultaneous = 0;
    for (const actions of actionSets.values()) {
      for (const action of actions) {
        actors.add(action.actorId);
        if (action.metadata?.simultaneous === true && Array.isArray(action.parameters?.jointActions)) simultaneous += 1;
      }
    }
    if (actors.size < profile.minimumDecisionActors) throw new Error('Decision actor floor not met');
    if (simultaneous === 0) throw new Error('No simultaneous action bundles found');
    return { decisionActorCount: actors.size, simultaneousBundleCount: simultaneous };
  });

  await check('deterministic-stress-recommendations', () => {
    const hashes = [];
    for (let index = 0; index < profile.deterministicRecommendationRepeats; index += 1) {
      const result = ingestion.recommend({
        handle: ingestion.list()[0].handle,
        observerId: profile.observerIds[0],
        simulations: profile.recommendationSimulations,
        seed,
        cPuct: 1.25,
      });
      hashes.push(result.recommendation.recommendationHash);
    }
    if (new Set(hashes).size !== 1) throw new Error('Repeated stress recommendations diverged');
    return { repeatCount: hashes.length, recommendationHash: hashes[0] };
  });

  await check('long-transition-determinism', () => {
    const run = () => {
      let cursor = registration.adapter.cloneState(state);
      for (let index = 0; index < profile.longTransitionSteps; index += 1) {
        if (registration.adapter.isTerminal(cursor)) break;
        const actions = registration.adapter.legalActions(cursor, profile.observerIds[index % profile.observerIds.length]);
        const action = actions[index % actions.length];
        const stepSeed = deriveSeed(seed, 'stage2c-long-transition', index, actionKey(action));
        cursor = validateTransitionResult(registration.adapter.step(cursor, structuredClone(action), {
          observerId: profile.observerIds[index % profile.observerIds.length],
          seed: stepSeed,
          simulationIndex: index,
          random: createSeededRandom(stepSeed),
          mode: 'detached-simulation',
        })).state;
      }
      return cursor;
    };
    const first = run();
    const second = run();
    if (sha256(first) !== sha256(second)) throw new Error('Long transition rollout is not deterministic');
    if (sha256(state) !== sourceHash) throw new Error('Long transition rollout mutated source state');
    return { transitionSteps: profile.longTransitionSteps, finalStateHash: sha256(first) };
  });

  await check('high-volume-snapshot-ingestion', async () => {
    const entries = Array.from({ length: profile.highVolumeSnapshotCount }, (_, index) => ({
      identity: registration.identity,
      envelope: cloneEnvelope(envelope, `${envelope.snapshotId}-volume-${index}`),
    }));
    const batch = await ingestion.ingestBatch(entries);
    if (!batch.pass || batch.successes.length !== entries.length) throw new Error('High-volume snapshot batch failed');
    return { snapshotCount: batch.successes.length, recordCount: batch.usage.records };
  });

  await check('malformed-snapshot-failure-isolation', async () => {
    const valid = cloneEnvelope(envelope, `${envelope.snapshotId}-isolation-valid`);
    const malformed = cloneEnvelope(envelope, `${envelope.snapshotId}-isolation-malformed`);
    malformed.payload = { unexpected: true };
    const batch = await ingestion.ingestBatch([
      { identity: registration.identity, envelope: valid },
      { identity: registration.identity, envelope: malformed },
      { identity: 'missing:adapter', envelope: valid },
    ]);
    if (batch.successes.length !== 1 || batch.failures.length !== 2) throw new Error('Batch failures were not isolated');
    ingestion.get(batch.successes[0].handle);
    return { successCount: batch.successes.length, failureCount: batch.failures.length };
  });

  await check('snapshot-quota-enforcement', async () => {
    const quotaIngestion = new ProductionSnapshotIngestion({
      registry,
      maxRecords: profile.quotas.maxRecords,
      maxObserversPerSnapshot: profile.quotas.maxObserversPerSnapshot,
      maxFeatureCountPerObserver: profile.quotas.maxFeatureCountPerObserver,
      maxLegalActionsPerObserver: profile.quotas.maxLegalActionsPerObserver,
    });
    const entries = Array.from({ length: profile.quotas.maxRecords + 1 }, (_, index) => ({
      identity: registration.identity,
      envelope: cloneEnvelope(envelope, `${envelope.snapshotId}-quota-${index}`),
    }));
    const batch = await quotaIngestion.ingestBatch(entries);
    if (batch.successes.length !== profile.quotas.maxRecords || batch.failures.length !== 1) throw new Error('Record quota was not enforced');
    return { accepted: batch.successes.length, rejected: batch.failures.length, maxRecords: profile.quotas.maxRecords };
  });

  await check('snapshot-lifecycle-release', () => {
    const before = ingestion.usage().records;
    const handle = ingestion.list().at(-1).handle;
    if (!ingestion.release(handle)) throw new Error('Snapshot release failed');
    let rejected = false;
    try { ingestion.get(handle); } catch { rejected = true; }
    if (!rejected) throw new Error('Released snapshot remained accessible');
    return { before, after: ingestion.usage().records };
  });

  await check('performance-ceilings', () => {
    const observerId = profile.observerIds[0];
    const observeStarted = performance.now();
    registration.adapter.observe(state, observerId);
    const observeMs = performance.now() - observeStarted;
    const legalStarted = performance.now();
    registration.adapter.legalActions(state, observerId);
    const legalActionsMs = performance.now() - legalStarted;
    const recommendationMs = diagnostics['deterministic-stress-recommendations'] ?? 0;
    const batchIngestionMs = diagnostics['high-volume-snapshot-ingestion'] ?? 0;
    const ceilings = profile.performanceCeilingsMs;
    if (observeMs > ceilings.observe || legalActionsMs > ceilings.legalActions || recommendationMs > ceilings.recommendation || batchIngestionMs > ceilings.batchIngestion) {
      throw new Error('A production conformance performance ceiling was exceeded');
    }
    return { ceilingsMs: ceilings };
  });

  await check('source-state-and-authority-boundary', () => {
    if (sha256(state) !== sourceHash) throw new Error('Production conformance mutated source state');
    assertEvaluationOnly(defaultAuthorityPolicy());
    return { sourceStateHash: sourceHash, tier: 'R0', canDispatch: false, canMutateLiveWorld: false };
  });

  return deepFreeze({
    pass: checks.every((check) => check.pass),
    adapter: registration.manifest,
    certification: {
      evidenceKind: 'production-conformance-expansion',
      identity: registration.identity,
      profileVersion: profile.profileVersion,
      packageSha256: registration.packageSha256,
      adapterLockHash: registration.lockHash,
      configurationHash: registration.configurationHash,
    },
    checks,
  });
}
