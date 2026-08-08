import path from 'node:path';
import { ProductionSnapshotIngestion, buildSnapshotCertificationReport } from '../src/sdk/snapshot-ingestion.js';
import { loadProductionRegistry, readJson, root } from './production-context.mjs';

export const snapshotRoot = path.join(root, 'snapshots');

export async function loadSnapshotCertification() {
  const { lock, registry } = await loadProductionRegistry();
  const runs = await readJson(path.join(root, 'config/snapshot-certification-runs.json'));
  const ingestion = new ProductionSnapshotIngestion({
    registry,
    allowedRoots: [snapshotRoot],
    maxBytes: 1024 * 1024,
  });
  const records = [];
  const reports = [];
  const recommendations = [];
  for (const run of runs) {
    const record = await ingestion.ingestFile({
      identity: run.identity,
      file: path.join(root, run.file),
    });
    const recommendation = record.terminal ? undefined : ingestion.recommend({
      handle: record.handle,
      observerId: run.observerId,
      seed: BigInt(run.seed),
      simulations: run.simulations,
      cPuct: run.cPuct,
    });
    records.push(record);
    recommendations.push(recommendation ?? null);
    reports.push(buildSnapshotCertificationReport(record, recommendation));
  }
  return { lock, registry, ingestion, runs, records, reports, recommendations };
}
