#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import {
  buildStage2I2Diagnostic,
  STAGE2I2_ORACLE_V1_SHA256,
  STAGE2I2_ROBUST_TREND_SHA256,
} from '../src/lab/stage2i2-oracle-task-head-diagnostic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const [baseline, runtime, campaign, stage2i0, stage2i1] = await Promise.all([
  'baseline-manifest.json',
  'canonical-runtime-identity.json',
  'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i0-capability-baseline/stage2i0-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2i1-oracle-architecture-challenge/stage2i1-certification-result.json')),
]));

const verification = await verifyDeclaredRuntime({
  baseline,
  runtimeIdentity: runtime,
  sentinelRoot: path.resolve(root, '../..'),
  zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null,
});
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I2_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i0.stage2i0Certified || stage2i0.evidenceDigest !== 'a5bc20e210f90f9b1ebaa8fa69e439468aa995da1fc15285c26b7f75c04b19fe') throw new Error('STAGE2I2_BLOCKED_BY_STAGE2I0_DRIFT');
if (stage2i1.certificationHash !== 'bdf2fcfb9a36b5dd909b7dbeb196962e3c9a1b58d0a92d384c58ea029ff01870' || stage2i1.status !== 'FAIL') throw new Error('STAGE2I2_BLOCKED_BY_STAGE2I1_DRIFT');

const [oracleV1Sha256, robustTrendExpertSha256] = await Promise.all([
  fileSha256(path.join(root, 'src/experts/oracle.js')),
  fileSha256(path.join(root, 'src/lab/stage2i1-oracle-architecture-challenge.js')),
]);
if (oracleV1Sha256 !== STAGE2I2_ORACLE_V1_SHA256) throw new Error('STAGE2I2_BLOCKED_BY_ORACLE_V1_DRIFT');
if (robustTrendExpertSha256 !== STAGE2I2_ROBUST_TREND_SHA256) throw new Error('STAGE2I2_BLOCKED_BY_ROBUST_TREND_DRIFT');

const evaluation = buildStage2I2Diagnostic();
const replayEquivalent = sha256(buildStage2I2Diagnostic()) === sha256(evaluation);
const external = process.env.STAGE2I2_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I2_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = {
  digest: evaluation.evidenceDigest,
  measuredPlatforms,
  crossPlatformDigestMatch,
  portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS',
};
const certified = evaluation.qualityGatePass && replayEquivalent && portability.portabilityStatus === 'PASS';
const base = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  status: certified ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  successorCampaignId: campaign.stage2fCampaignId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  oracleV1Owner: 'platform/game-agnostic/src/experts/oracle.js',
  oracleV1Sha256,
  oracleV1Changed: false,
  robustTrendExpertOwner: 'platform/game-agnostic/src/lab/stage2i1-oracle-architecture-challenge.js',
  robustTrendExpertSha256,
  robustTrendExpertChanged: false,
  evidenceDigest: evaluation.evidenceDigest,
  trustworthyTaskDecompositionProduced: evaluation.qualityGate.trustworthyTaskDecompositionProduced,
  modularOracleV2DesignFrozen: evaluation.oracleV2Design.frozen,
  replayEquivalent,
  portabilityStatus: portability.portabilityStatus,
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
const withoutHash = { ...base, stage2i2Certified: certified };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i2-oracle-task-head-diagnostic');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'oracle-task-head-diagnostic-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'oracle-v2-modular-design.json'), `${JSON.stringify(evaluation.oracleV2Design, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i2-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i2-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
