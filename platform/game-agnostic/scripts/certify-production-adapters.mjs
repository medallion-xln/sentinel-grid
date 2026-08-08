import { createVerificationReport } from '../src/lab/evidence.js';
import { certifyProductionRegistry } from './production-context.mjs';

const { lock, registry, reports } = await certifyProductionRegistry();
const verification = createVerificationReport(reports);
console.log(JSON.stringify({
  pass: verification.pass,
  adapterCount: registry.list().length,
  checkCount: verification.checkCount,
  lockHash: lock.lockHash,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  executionReportHash: verification.executionReportHash,
  registrations: registry.list(),
}, null, 2));
if (!verification.pass) process.exitCode = 1;
