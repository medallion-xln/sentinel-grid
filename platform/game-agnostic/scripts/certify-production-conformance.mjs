import { createVerificationReport } from '../src/lab/evidence.js';
import { loadProductionConformanceExpansion } from './production-conformance-context.mjs';

const context = await loadProductionConformanceExpansion();
const output = createVerificationReport([context.report]);
console.log(JSON.stringify({
  pass: output.pass,
  adapterCount: 1,
  checkCount: output.checkCount,
  deterministicEvidenceHash: output.deterministicEvidenceHash,
  executionReportHash: output.executionReportHash,
  adapterLockHash: context.lock.lockHash,
  identity: context.registration.identity,
  usage: context.ingestion.usage(),
}, null, 2));
if (!output.pass) process.exitCode = 1;
