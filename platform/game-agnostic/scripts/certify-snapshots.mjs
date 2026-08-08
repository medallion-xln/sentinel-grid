import { createVerificationReport } from '../src/lab/evidence.js';
import { loadSnapshotCertification } from './snapshot-context.mjs';

const { lock, records, reports, recommendations } = await loadSnapshotCertification();
const verification = createVerificationReport(reports);
console.log(JSON.stringify({
  pass: verification.pass,
  snapshotCount: records.length,
  checkCount: verification.checkCount,
  lockHash: lock.lockHash,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  executionReportHash: verification.executionReportHash,
  snapshots: records.map((record, index) => ({
    handle: record.handle,
    snapshotId: record.snapshotId,
    identity: record.identity,
    importedStateHash: record.importedStateHash,
    recommendationHash: recommendations[index]?.recommendationHash ?? null,
  })),
}, null, 2));
if (!verification.pass) process.exitCode = 1;
