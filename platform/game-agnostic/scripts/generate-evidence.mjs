import { mkdir, writeFile } from 'node:fs/promises';
import { createVerificationReport } from '../src/lab/evidence.js';
import { certifyProductionRegistry } from './production-context.mjs';
import { loadSnapshotCertification } from './snapshot-context.mjs';
import { loadProductionConformanceExpansion } from './production-conformance-context.mjs';
import { loadZekNovaBehavioralParity } from './zeknova-parity-context.mjs';
import { loadZekNovaShadowFrameworkCertification } from './zeknova-shadow-context.mjs';
import { loadStage2FFrameworkCertification } from './zeknova-stage2f-context.mjs';

const production = await certifyProductionRegistry();
const snapshots = await loadSnapshotCertification();
const expansion = await loadProductionConformanceExpansion();
const parity = await loadZekNovaBehavioralParity();
const shadow = await loadZekNovaShadowFrameworkCertification();
const stage2f = await loadStage2FFrameworkCertification();
const reports = [...production.reports, ...snapshots.reports, expansion.report, parity.report, shadow.report, stage2f.report];
const verification = createVerificationReport(reports);
const productionVerification = createVerificationReport(production.reports);
const snapshotVerification = createVerificationReport(snapshots.reports);
const expansionVerification = createVerificationReport([expansion.report]);
const parityVerification = createVerificationReport([parity.report]);
const shadowVerification = createVerificationReport([shadow.report]);
const stage2fVerification = createVerificationReport([stage2f.report]);
const artifacts = new URL('../artifacts/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const summary = {
  stage: 'Stage 2F-Z',
  kernelVersion: '0.9.0',
  adapterLockHash: production.lock.lockHash,
  registeredAdapterCount: production.registry.list().length,
  registrations: production.registry.list(),
  snapshotCount: snapshots.records.length,
  snapshotHandles: snapshots.records.map((record) => record.handle),
  snapshotEvidenceHash: snapshotVerification.deterministicEvidenceHash,
  productionConformanceEvidenceHash: expansionVerification.deterministicEvidenceHash,
  productionConformanceCheckCount: expansionVerification.checkCount,
  zeknovaParityEvidenceHash: parityVerification.deterministicEvidenceHash,
  zeknovaParityCheckCount: parityVerification.checkCount,
  zeknovaParityFixtureCount: parity.fixtures.length,
  zeknovaParityBaselineHash: parity.baseline.baselineHash,
  zeknovaProductionAdapterRegistered: true,
  zeknovaShadowFrameworkEvidenceHash: shadowVerification.deterministicEvidenceHash,
  zeknovaShadowFrameworkCheckCount: shadowVerification.checkCount,
  zeknovaShadowReplayCaptureCount: shadow.captures.length,
  stage2fFrameworkEvidenceHash: stage2fVerification.deterministicEvidenceHash,
  stage2fFrameworkCheckCount: stage2fVerification.checkCount,
  authenticLiveRecordCount: stage2f.report.certification.authenticLiveRecordCount,
  sustainedShadowCampaignCertified: false,
  controlledShadowEvaluationEligible: stage2f.report.certification.controlledShadowEvaluationEligible,
  authorityPromotionEligible: stage2f.report.certification.authorityPromotionEligible,
  controlledDecisionStatus: stage2f.report.decision.status,
  liveRepositoryParityStatus: 'pending-authentic-live-captures',
  productionShadowPromotionEligible: false,
  evidenceReportCount: verification.evidenceReportCount,
  checkCount: verification.checkCount,
  deterministicEvidenceHash: verification.deterministicEvidenceHash,
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  scriptedNpcExecutorPreserved: true,
  humanAuthorizationRequired: true,
};
await Promise.all([
  writeFile(new URL('deterministic-evidence.json', artifacts), `${JSON.stringify(verification.deterministicEvidence, null, 2)}\n`),
  writeFile(new URL('execution-diagnostics.json', artifacts), `${JSON.stringify(verification.executionDiagnostics, null, 2)}\n`),
  writeFile(new URL('verification-report.json', artifacts), `${JSON.stringify({ ...verification, ...summary }, null, 2)}\n`),
  writeFile(new URL('production-adapter-certification.json', artifacts), `${JSON.stringify({ pass: production.reports.every((report) => report.pass), adapterLockHash: production.lock.lockHash, registrations: production.registry.list(), deterministicEvidenceHash: productionVerification.deterministicEvidenceHash }, null, 2)}\n`),
  writeFile(new URL('snapshot-ingestion-certification.json', artifacts), `${JSON.stringify({ pass: snapshots.reports.every((report) => report.pass), snapshotCount: snapshots.records.length, snapshotHandles: snapshots.records.map((record) => record.handle), deterministicEvidenceHash: snapshotVerification.deterministicEvidenceHash }, null, 2)}\n`),
  writeFile(new URL('production-conformance-expansion.json', artifacts), `${JSON.stringify({ pass: expansion.report.pass, identity: expansion.registration.identity, checkCount: expansionVerification.checkCount, deterministicEvidenceHash: expansionVerification.deterministicEvidenceHash, report: expansion.report }, null, 2)}\n`),
  writeFile(new URL('zeknova-behavioral-parity.json', artifacts), `${JSON.stringify({ pass: parity.report.pass, identity: parity.registration.identity, baselineHash: parity.baseline.baselineHash, fixtureCount: parity.fixtures.length, checkCount: parityVerification.checkCount, deterministicEvidenceHash: parityVerification.deterministicEvidenceHash, report: parity.report }, null, 2)}\n`),
  writeFile(new URL('zeknova-shadow-framework-certification.json', artifacts), `${JSON.stringify({ pass: shadow.report.pass, identity: shadow.registration.identity, replayCaptureCount: shadow.captures.length, checkCount: shadowVerification.checkCount, deterministicEvidenceHash: shadowVerification.deterministicEvidenceHash, liveEvidenceStatus: shadow.report.certification.liveEvidenceStatus, productionPromotionEligible: shadow.report.certification.productionPromotionEligible, report: shadow.report }, null, 2)}\n`),
  writeFile(new URL('zeknova-stage2f-framework-certification.json', artifacts), `${JSON.stringify({ pass: stage2f.report.pass, identity: stage2f.registration.identity, replayRecordCount: stage2f.replayRecords.length, authenticLiveRecordCount: 0, checkCount: stage2fVerification.checkCount, deterministicEvidenceHash: stage2fVerification.deterministicEvidenceHash, controlledDecisionStatus: stage2f.report.decision.status, controlledShadowEvaluationEligible: false, authorityPromotionEligible: false, report: stage2f.report }, null, 2)}\n`),
  writeFile(new URL('stage2f-z-certification-summary.json', artifacts), `${JSON.stringify(summary, null, 2)}\n`),
]);
console.log(JSON.stringify({ pass: verification.pass, ...summary, executionReportHash: verification.executionReportHash }, null, 2));
if (!verification.pass) process.exitCode = 1;
