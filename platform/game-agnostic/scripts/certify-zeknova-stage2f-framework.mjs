import { createVerificationReport } from '../src/lab/evidence.js';
import { loadStage2FFrameworkCertification } from './zeknova-stage2f-context.mjs';
const context = await loadStage2FFrameworkCertification();
const verification = createVerificationReport([context.report]);
console.log(JSON.stringify({
  pass: context.report.pass,
  identity: context.registration.identity,
  checkCount: verification.checkCount,
  replayRecordCount: context.replayRecords.length,
  authenticLiveRecordCount: context.report.certification.authenticLiveRecordCount,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  controlledShadowEvaluationEligible: context.report.certification.controlledShadowEvaluationEligible,
  authorityPromotionEligible: context.report.certification.authorityPromotionEligible,
  decisionStatus: context.report.decision.status,
  authority: 'R0',
}, null, 2));
if (!context.report.pass) process.exitCode = 1;
