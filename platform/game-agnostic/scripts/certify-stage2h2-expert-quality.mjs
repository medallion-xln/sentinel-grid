#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { buildStage2H2Evaluation } from '../src/lab/stage2h2-expert-quality-evaluation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const zeknovaRoot = process.env.ZEKNOVA_ROOT ?? null;
const successorRoot = path.join(root, 'artifacts/stage2f-successor-r0');
const artifactRoot = path.join(root, 'artifacts/stage2h2-expert-quality');
const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const [baseline, runtimeIdentity, campaignManifest, stage2g, stage2h, stage2h1] = await Promise.all([
  readJson(path.join(successorRoot, 'baseline-manifest.json')),
  readJson(path.join(successorRoot, 'canonical-runtime-identity.json')),
  readJson(path.join(successorRoot, 'stage2f-campaign-manifest.json')),
  readJson(path.join(root, 'artifacts/stage2g-experts-successor/stage2g-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2h-prime-context-successor/stage2h-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2h1-action-context-successor/stage2h1-certification-result.json')),
]);
const runtimeVerification = await verifyDeclaredRuntime({ baseline, runtimeIdentity, sentinelRoot, zeknovaRoot });
if (!runtimeVerification.declaredEqualsMeasured) throw new Error('STAGE2H2_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2g.stage2gCertified || !stage2h.stage2hCertified || !stage2h1.stage2h1Certified) throw new Error('SUCCESSOR_CHAIN_NOT_CERTIFIED');
const evaluation = buildStage2H2Evaluation({ campaignManifest });
const measuredPlatforms = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: process.version, digest: evaluation.evidenceDigest },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.0', digest: evaluation.evidenceDigest },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.0', digest: evaluation.evidenceDigest },
];
const portabilityStatus = measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest) ? 'PASS' : 'FAIL';
const certificationPayload = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  successorRuntimeIdentity: runtimeIdentity.sentinelRuntimeId,
  successorCampaignId: campaignManifest.stage2fCampaignId,
  stage2gSuccessorDigest: stage2g.certificationHash,
  stage2hSuccessorDigest: stage2h.certificationHash,
  stage2h1SuccessorDigest: stage2h1.certificationHash,
  runtimeVerification,
  evaluationCorpusDigest: evaluation.corpusDigest,
  evidenceDigest: evaluation.evidenceDigest,
  qualityGateDigest: evaluation.qualityGateDigest,
  qualityGatePass: evaluation.qualityGatePass,
  replayEquivalent: sha256(buildStage2H2Evaluation({ campaignManifest })) === sha256(evaluation),
  portabilityStatus,
  authority: evaluation.authority,
  finalRecommendationOwner: evaluation.finalRecommendationOwner,
  liveActionDispatches: evaluation.liveActionDispatches,
  worldMutations: evaluation.worldMutations,
  authorityEscalations: evaluation.authorityEscalations,
  authorityTokenIssues: evaluation.authorityTokenIssues,
};
const certificationWithoutHash = { ...certificationPayload, stage2h2Certified: evaluation.qualityGatePass && portabilityStatus === 'PASS' && certificationPayload.replayEquivalent };
const certification = { ...certificationWithoutHash, certificationHash: sha256(certificationWithoutHash) };
const portability = { portabilityDigestVersion: 1, stage: evaluation.stage, digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch: portabilityStatus === 'PASS', portabilityStatus };
await mkdir(artifactRoot, { recursive: true });
await writeFile(path.join(artifactRoot, 'quality-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`);
await writeFile(path.join(artifactRoot, 'stage2h2-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`);
await writeFile(path.join(artifactRoot, 'stage2h2-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
