import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { sha256 } from '../core/determinism.js';

export const SUCCESSOR_STAGE = 'STAGE2F_SUCCESSOR_RUNTIME_IDENTITY_AND_DEPENDENT_CHAIN_RECERTIFICATION';
export const SUCCESSOR_GENERATION = 2;
export const SUCCESSOR_REASON = 'INTENTIONAL_BEHAVIORAL_CHANGE';
export const SUCCESSOR_ORIGIN = 'ZEK-15_NETWORK_RECOVERY';

const bytesDigest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function assert(condition, message, code = 'SUCCESSOR_IDENTITY_ERROR') {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

function domainDigest(inventory, roles) {
  return sha256(inventory
    .filter((entry) => roles.includes(entry.role))
    .map(({ root, path: filePath, sha256: digest, size }) => ({ root, path: filePath, sha256: digest, size })));
}

export async function measureRuntimeInventory({ predecessorBaseline, sentinelRoot, zeknovaRoot }) {
  const inventory = [];
  for (const entry of predecessorBaseline.inventory) {
    const root = entry.root === 'sentinel' ? sentinelRoot : zeknovaRoot;
    const bytes = await readFile(path.join(root, entry.path));
    inventory.push({ ...entry, sha256: bytesDigest(bytes), size: bytes.length });
  }
  inventory.sort((a, b) => `${a.root}/${a.path}`.localeCompare(`${b.root}/${b.path}`));
  const domains = {
    zeknovaSourceSha256: domainDigest(inventory, ['compatibility-source', 'model-source', 'live-runtime-consumer', 'certified-gameplay-source', 'canonical-state', 'prime', 'router', 'authority', 'provider-bridge', 'telemetry', 'collector']),
    compatibilitySourceSha256: domainDigest(inventory, ['compatibility-source']),
    modelSourceSha256: domainDigest(inventory, ['model-source']),
    canonicalStateSha256: domainDigest(inventory, ['canonical-state']),
    primeSha256: domainDigest(inventory, ['prime']),
    routerSha256: domainDigest(inventory, ['router']),
    authoritySha256: domainDigest(inventory, ['authority']),
    providerBridgeSha256: domainDigest(inventory, ['provider-bridge']),
    telemetrySha256: domainDigest(inventory, ['telemetry']),
    collectorSchemaSha256: domainDigest(inventory, ['collector', 'collector-schema']),
    certificationPolicySha256: domainDigest(inventory, ['certification-policy']),
  };
  return Object.freeze({
    baselineSchemaVersion: 2,
    identityGeneration: SUCCESSOR_GENERATION,
    inventory,
    inventoryDigest: sha256(inventory),
    domains,
  });
}

export function buildSuccessionEvent({ predecessorRuntimeIdentity, predecessorSourceSha256, successorSourceSha256, certifiedCopySha256, sourceDiffDigest, behavioralDiffEvidence }) {
  assert(predecessorRuntimeIdentity?.sentinelRuntimeId, 'Predecessor runtime identity is required');
  assert(predecessorSourceSha256 === certifiedCopySha256, 'Certified copy does not reproduce predecessor source', 'PREDECESSOR_COPY_MISMATCH');
  assert(successorSourceSha256 !== predecessorSourceSha256, 'Successor source must differ from predecessor');
  const payload = {
    successionSchemaVersion: 1,
    stage: SUCCESSOR_STAGE,
    identityGeneration: SUCCESSOR_GENERATION,
    predecessorRuntimeIdentity: predecessorRuntimeIdentity.sentinelRuntimeId,
    reasonCode: SUCCESSOR_REASON,
    changeOrigin: SUCCESSOR_ORIGIN,
    changedRuntimeComponents: ['zeknova:src/game/Stage2FRuntimeCollectorClient.js'],
    sourceDiffDigest,
    behavioralDiffEvidence,
    effectiveAfterStage: 'STAGE2H1_ACTION_DISCRIMINATING_EXPERT_CONTEXT',
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
  };
  return Object.freeze({ ...payload, successionEventDigest: sha256(payload) });
}

export function buildSuccessorRuntimeIdentity({ predecessorRuntimeIdentity, baseline, successionEvent, generatedRuntimeProvenanceId, sentinelHead, zeknovaHead }) {
  assert(successionEvent.predecessorRuntimeIdentity === predecessorRuntimeIdentity.sentinelRuntimeId, 'Succession predecessor link mismatch');
  const byRole = (role) => baseline.inventory.find((entry) => entry.role === role);
  const payload = {
    runtimeIdentitySchemaVersion: 2,
    identityGeneration: SUCCESSOR_GENERATION,
    predecessorRuntimeIdentity: predecessorRuntimeIdentity.sentinelRuntimeId,
    successionEventDigest: successionEvent.successionEventDigest,
    sentinelHead,
    zeknovaHead,
    generatedRuntimeProvenanceId,
    domains: baseline.domains,
    runtimeInventoryDigest: baseline.inventoryDigest,
    generatedCompatibilitySha256: byRole('generated-compatibility').sha256,
    generatedModelSha256: byRole('generated-model').sha256,
    canonicalStateSchemaVersion: 'hash-derived',
    primeImplementation: predecessorRuntimeIdentity.primeImplementation,
    primeVersion: 'hash-derived',
    routerImplementation: predecessorRuntimeIdentity.routerImplementation,
    routerVersion: 'hash-derived',
    authorityPolicyVersion: 'hash-derived-R0',
    providerBridgeVersion: predecessorRuntimeIdentity.providerBridgeVersion,
    telemetryVersion: 'hash-derived',
    collectorSchemaVersion: predecessorRuntimeIdentity.collectorSchemaVersion,
    certificationSchemaVersion: 'successor-v1',
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false },
  };
  return Object.freeze({ ...payload, sentinelRuntimeId: `sha256:${sha256(payload)}` });
}

export async function verifyDeclaredRuntime({ baseline, runtimeIdentity, sentinelRoot, zeknovaRoot }) {
  const measured = await measureRuntimeInventory({ predecessorBaseline: baseline, sentinelRoot, zeknovaRoot });
  const inventoryMatch = measured.inventoryDigest === baseline.inventoryDigest;
  const domainsMatch = sha256(measured.domains) === sha256(runtimeIdentity.domains);
  const identityPayload = Object.fromEntries(Object.entries(runtimeIdentity).filter(([key]) => key !== 'sentinelRuntimeId'));
  const identitySelfValid = `sha256:${sha256(identityPayload)}` === runtimeIdentity.sentinelRuntimeId;
  return Object.freeze({
    certificationMode: 'LIVE_CURRENT',
    declaredRuntimeIdentity: runtimeIdentity.sentinelRuntimeId,
    measuredRuntimeIdentity: inventoryMatch && domainsMatch && identitySelfValid ? runtimeIdentity.sentinelRuntimeId : null,
    declaredEqualsMeasured: inventoryMatch && domainsMatch && identitySelfValid,
    runtimeInventoryMatch: inventoryMatch,
    identitySelfValid,
  });
}

export function verifyHistoricalReplay({ predecessorRuntimeIdentity, predecessorBaseline }) {
  const payload = Object.fromEntries(Object.entries(predecessorRuntimeIdentity).filter(([key]) => key !== 'sentinelRuntimeId'));
  return Object.freeze({
    certificationMode: 'HISTORICAL_REPLAY',
    historicalReplayValid: `sha256:${sha256(payload)}` === predecessorRuntimeIdentity.sentinelRuntimeId,
    inventoryDigest: sha256(predecessorBaseline.inventory),
    validAsCurrentRuntime: false,
  });
}
