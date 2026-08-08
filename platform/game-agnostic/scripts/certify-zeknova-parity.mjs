import { createVerificationReport } from '../src/lab/evidence.js';
import { loadZekNovaBehavioralParity } from './zeknova-parity-context.mjs';

const parity = await loadZekNovaBehavioralParity();
const verification = createVerificationReport([parity.report]);
console.log(JSON.stringify({
  pass: parity.report.pass,
  identity: parity.registration.identity,
  checkCount: verification.checkCount,
  fixtureCount: parity.fixtures.length,
  baselineHash: parity.baseline.baselineHash,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  executionReportHash: verification.executionReportHash,
  adapterLockHash: parity.lock.lockHash,
  authority: 'R0',
  productionAdapterRegistered: true,
  scriptedNpcExecutorPreserved: true,
}, null, 2));
if (!parity.report.pass) process.exitCode = 1;
