#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { buildStage2I3Remediation, STAGE2I3_STAGE2I2_OWNER_SHA256 } from '../src/lab/stage2i3-oracle-head-remediation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const [baseline, runtime, campaign, stage2i2] = await Promise.all([
  'baseline-manifest.json',
  'canonical-runtime-identity.json',
  'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i2-oracle-task-head-diagnostic/stage2i2-certification-result.json')),
]));

const verification = await verifyDeclaredRuntime({
  baseline,
  runtimeIdentity: runtime,
  sentinelRoot: path.resolve(root, '../..'),
  zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null,
});
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I3_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i2.stage2i2Certified || stage2i2.certificationHash !== '5c481283d006a82115fcd1c8be8422282eb813f97ad696264d9fdda96406fb6c') throw new Error('STAGE2I3_BLOCKED_BY_STAGE2I2_DRIFT');
const stage2i2OwnerSha256 = await fileSha256(path.join(root, 'src/lab/stage2i2-oracle-task-head-diagnostic.js'));
if (stage2i2OwnerSha256 !== STAGE2I3_STAGE2I2_OWNER_SHA256) throw new Error('STAGE2I3_BLOCKED_BY_FROZEN_HEAD_DRIFT');

const evaluation = buildStage2I3Remediation();
const replayEquivalent = sha256(buildStage2I3Remediation()) === sha256(evaluation);
const external = process.env.STAGE2I3_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I3_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };
const certified = evaluation.qualityGatePass && replayEquivalent && portability.portabilityStatus === 'PASS';
const base = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  status: certified ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  stage2i2Certified: stage2i2.stage2i2Certified,
  stage2i2CertificationHash: stage2i2.certificationHash,
  stage2i2OwnerSha256,
  allFrozenSuccessfulHeadsUnchanged: evaluation.frozenHeads.allFrozenSuccessfulHeadsUnchanged,
  persistenceScoreDefectDetected: evaluation.scoreAudit.persistence.scoreDefectDetected,
  regimeScoreDefectDetected: evaluation.scoreAudit.regime.scoreDefectDetected,
  persistenceV2Score: evaluation.finalHoldout.persistence.v2Score,
  regimeV2Score: evaluation.finalHoldout.regime.v2Score,
  evidenceDigest: evaluation.evidenceDigest,
  qualityGatePass: evaluation.qualityGatePass,
  replayEquivalent,
  portabilityStatus: portability.portabilityStatus,
  oracleV2Assembled: false,
  oracleProductionReplaced: false,
  primeChanged: false,
  nexusChanged: false,
  expertSelectionInfluence: 0,
  expertActionSelectionApproved: false,
  authority: evaluation.authority,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  authorityTokenIssues: 0,
};
const withoutHash = { ...base, stage2i3Certified: certified };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i3-oracle-head-remediation');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'oracle-head-remediation-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'selected-heads.json'), `${JSON.stringify({ selection: evaluation.search.selection, persistence: evaluation.finalHoldout.persistence, regime: evaluation.finalHoldout.regime }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
