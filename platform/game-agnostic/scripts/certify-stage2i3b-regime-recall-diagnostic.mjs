#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import {
  buildStage2I3BRecallDiagnostic,
  STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH,
  STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST,
  STAGE2I3B_STAGE2I3A_OWNER_SHA256,
} from '../src/lab/stage2i3b-regime-recall-diagnostic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const expectedOwners = {
  prime: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  nexus: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  stage2i2: 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf',
  stage2i3: 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9',
  stage2i3a: STAGE2I3B_STAGE2I3A_OWNER_SHA256,
};
const ownerPaths = {
  prime: 'src/prime/root-puct.js',
  oracleV1: 'src/experts/oracle.js',
  nexus: 'src/experts/nexus.js',
  stage2i2: 'src/lab/stage2i2-oracle-task-head-diagnostic.js',
  stage2i3: 'src/lab/stage2i3-oracle-head-remediation.js',
  stage2i3a: 'src/lab/stage2i3a-regime-reversal-separation.js',
};

const [baseline, runtime, campaign, stage2i3a] = await Promise.all([
  'baseline-manifest.json',
  'canonical-runtime-identity.json',
  'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i3a-regime-reversal-separation/stage2i3a-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({
  baseline,
  runtimeIdentity: runtime,
  sentinelRoot: path.resolve(root, '../..'),
  zeknovaRoot: process.env.ZEKNOVA_ROOT || '/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience',
});
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I3B_BLOCKED_BY_RUNTIME_DRIFT');
if (stage2i3a.certificationHash !== STAGE2I3B_STAGE2I3A_CERTIFICATION_HASH || stage2i3a.evidenceDigest !== STAGE2I3B_STAGE2I3A_EVIDENCE_DIGEST || stage2i3a.status !== 'FAIL') throw new Error('STAGE2I3B_BLOCKED_BY_STAGE2I3A_DRIFT');

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2I3B_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2I3BRecallDiagnostic();
const replayEquivalent = sha256(buildStage2I3BRecallDiagnostic()) === sha256(evaluation);
const external = process.env.STAGE2I3B_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I3B_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };
const diagnosticPass = evaluation.status === 'PASS'
  && evaluation.reproduction.stage2i3aResultReproduced
  && evaluation.reproduction.regimeV3FalseNegatives === 60
  && evaluation.attribution.attributed === '60/60'
  && evaluation.attribution.unattributed === 0
  && Boolean(evaluation.rootCause.primary)
  && evaluation.freeze.regimeV4Implemented === false
  && evaluation.freeze.allSuccessfulHeadsUnchanged
  && evaluation.freeze.oracleV2Assembled === false
  && evaluation.safety.authority.tier === 'R0';
const certified = diagnosticPass && replayEquivalent && portability.portabilityStatus === 'PASS';
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
  stage2i3aStatus: stage2i3a.status,
  stage2i3aCertificationHash: stage2i3a.certificationHash,
  stage2i3aEvidenceDigest: stage2i3a.evidenceDigest,
  frozenOwnerSha256: measuredOwners,
  allSuccessfulHeadsUnchanged: evaluation.freeze.allSuccessfulHeadsUnchanged,
  regimeV4Implemented: false,
  regimeProductionChanged: false,
  falseNegativeCorpusDigest: evaluation.falseNegatives.corpusDigest,
  falseNegativesAttributed: evaluation.attribution.attributed,
  primaryRegimeRecallFailureMode: evaluation.rootCause.primary,
  nextRecommendedStage: evaluation.rootCause.nextRecommendedStage,
  evidenceDigest: evaluation.evidenceDigest,
  diagnosticPass,
  replayEquivalent,
  portabilityStatus: portability.portabilityStatus,
  oracleV2Assembled: false,
  oracleProductionReplaced: false,
  primeChanged: false,
  nexusChanged: false,
  expertSelectionInfluence: 0,
  expertActionSelectionApproved: false,
  authority: evaluation.safety.authority,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  authorityTokenIssues: 0,
};
const withoutHash = { ...base, stage2i3bCertified: certified };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i3b-regime-recall-diagnostic');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'regime-recall-diagnostic-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'regime-false-negative-corpus.json'), `${JSON.stringify({ digest: evaluation.falseNegatives.corpusDigest, cases: evaluation.falseNegatives.cases }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3b-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3b-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
