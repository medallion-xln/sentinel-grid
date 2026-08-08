import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ProductionSnapshotIngestion } from '../src/sdk/snapshot-ingestion.js';
import { runProductionConformanceExpansion } from '../src/lab/production-conformance.js';
import { loadProductionRegistry, readJson, root } from './production-context.mjs';

export async function loadProductionConformanceExpansion() {
  const { lock, registry } = await loadProductionRegistry();
  const profile = await readJson(path.join(root, 'config/production-conformance-expansion.json'));
  const registration = registry.get(profile.identity);
  const envelope = JSON.parse(await readFile(path.join(root, profile.snapshotFile), 'utf8'));
  const ingestion = new ProductionSnapshotIngestion({
    registry,
    allowedRoots: [path.join(root, 'snapshots')],
    maxBytes: 4 * 1024 * 1024,
    maxRecords: 256,
    maxObserversPerSnapshot: 16,
    maxFeatureCountPerObserver: 8192,
    maxLegalActionsPerObserver: 1024,
  });
  const initialRecord = ingestion.ingestEnvelope({ identity: profile.identity, envelope });
  const report = await runProductionConformanceExpansion({
    registry,
    registration,
    ingestion,
    envelope,
    profile,
    seed: 707n,
  });
  return { lock, registry, registration, profile, envelope, ingestion, initialRecord, report };
}
