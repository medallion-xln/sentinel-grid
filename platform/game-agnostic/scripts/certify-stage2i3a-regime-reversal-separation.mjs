#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { buildStage2I3ASeparation, STAGE2I3A_STAGE2I2_OWNER_SHA256, STAGE2I3A_STAGE2I3_OWNER_SHA256 } from '../src/lab/stage2i3a-regime-reversal-separation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const [baseline, runtime, campaign, stage2i3] = await Promise.all([
  'baseline-manifest.json',
  'canonical-runtime-identity.json',
  'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i3-oracle-head-remediation/stage2i3-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I3A_BLOCKED_BY_RUNTIME_DRIFT');
if (stage2i3.status !== 'FAIL' || stage2i3.certificationHash !== '75a9308cba3a16dcfafdef0214df607f2812f2052b5aaa1d76746e86f6e5573c' || stage2i3.evidenceDigest !== '1be4b3081d9b3350c433bb4718f0deb42603c63426fa45689cb426e30c21434b') throw new Error('STAGE2I3A_BLOCKED_BY_STAGE2I3_DRIFT');
const [stage2i2OwnerSha256, stage2i3OwnerSha256] = await Promise.all([fileSha256(path.join(root, 'src/lab/stage2i2-oracle-task-head-diagnostic.js')), fileSha256(path.join(root, 'src/lab/stage2i3-oracle-head-remediation.js'))]);
if (stage2i2OwnerSha256 !== STAGE2I3A_STAGE2I2_OWNER_SHA256 || stage2i3OwnerSha256 !== STAGE2I3A_STAGE2I3_OWNER_SHA256) throw new Error('STAGE2I3A_BLOCKED_BY_FROZEN_HEAD_DRIFT');

const evaluation = buildStage2I3ASeparation();
const replayEquivalent = sha256(buildStage2I3ASeparation()) === sha256(evaluation);
const external = process.env.STAGE2I3A_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I3A_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const names = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => names.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };
const certified = evaluation.qualityGatePass && replayEquivalent && portability.portabilityStatus === 'PASS';
const base = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  status: certified ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  declaredRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  stage2i3Status: stage2i3.status,
  stage2i3CertificationHash: stage2i3.certificationHash,
  stage2i3EvidenceDigest: stage2i3.evidenceDigest,
  stage2i2OwnerSha256,
  stage2i3OwnerSha256,
  persistenceV2Changed: evaluation.frozenHeads.changed.persistenceV2,
  allOtherSuccessfulHeadsUnchanged: evaluation.frozenHeads.allOtherSuccessfulHeadsUnchanged,
  regimeV3Score: evaluation.finalHoldout.regimeV3Score,
  regimeDistinctFromReversal: evaluation.finalHoldout.distinctFromReversal,
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
const withoutHash = { ...base, stage2i3aCertified: certified };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i3a-regime-reversal-separation');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'regime-reversal-separation-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'selected-regime-v3.json'), `${JSON.stringify({ selection: evaluation.search.selection, holdout: evaluation.finalHoldout }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3a-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3a-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
