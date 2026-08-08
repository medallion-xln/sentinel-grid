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
const output = createVerificationReport(reports);
console.log(JSON.stringify({
  ...output,
  evidenceReportCount: output.evidenceReportCount,
  adapterCount: production.registry.list().length,
  adapterLockHash: production.lock.lockHash,
  registeredAdapterCount: production.registry.list().length,
  snapshotCount: snapshots.records.length,
  productionConformanceReportCount: 1,
  zeknovaParityReportCount: 1,
  zeknovaParityFixtureCount: parity.fixtures.length,
  zeknovaParityBaselineHash: parity.baseline.baselineHash,
  zeknovaProductionAdapterRegistered: true,
  zeknovaShadowFrameworkReportCount: 1,
  zeknovaShadowReplayCaptureCount: shadow.captures.length,
  stage2fFrameworkReportCount: 1,
  stage2fFrameworkCheckCount: stage2f.report.checks.length,
  authenticLiveRecordCount: 0,
  sustainedShadowCampaignCertified: false,
  controlledShadowEvaluationEligible: false,
  authorityPromotionEligible: false,
  controlledDecisionStatus: stage2f.report.decision.status,
  liveRepositoryParityStatus: 'pending-authentic-live-captures',
  productionShadowPromotionEligible: false,
  registrations: production.registry.list(),
  snapshotHandles: snapshots.records.map((record) => record.handle),
}, null, 2));
if (!output.pass) process.exitCode = 1;
