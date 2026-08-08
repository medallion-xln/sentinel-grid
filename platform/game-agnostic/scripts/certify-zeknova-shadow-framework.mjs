import { createVerificationReport } from '../src/lab/evidence.js';
import { loadZekNovaShadowFrameworkCertification } from './zeknova-shadow-context.mjs';
const shadow = await loadZekNovaShadowFrameworkCertification();
const verification = createVerificationReport([shadow.report]);
console.log(JSON.stringify({
  pass: shadow.report.pass,
  identity: shadow.registration.identity,
  captureCount: shadow.captures.length,
  shadowRecordCount: shadow.evaluations.length,
  checkCount: verification.checkCount,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  executionReportHash: verification.executionReportHash,
  liveEvidenceStatus: shadow.report.certification.liveEvidenceStatus,
  productionPromotionEligible: shadow.report.certification.productionPromotionEligible,
  authority: 'R0',
}, null, 2));
if (!shadow.report.pass) process.exitCode = 1;
