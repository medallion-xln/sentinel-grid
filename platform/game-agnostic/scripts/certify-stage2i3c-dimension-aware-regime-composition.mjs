#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import {
  buildStage2I3CDimensionAwareRemediation,
  STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH,
  STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST,
  STAGE2I3C_STAGE2I3B_OWNER_SHA256,
} from '../src/lab/stage2i3c-dimension-aware-regime-composition.js';

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
  stage2i3a: 'd2371ec2f73df191c6f5055e06d4abe25e59737bd8b376dd57182e3dd9481779',
  stage2i3b: STAGE2I3C_STAGE2I3B_OWNER_SHA256,
};
const ownerPaths = {
  prime: 'src/prime/root-puct.js',
  oracleV1: 'src/experts/oracle.js',
  nexus: 'src/experts/nexus.js',
  stage2i2: 'src/lab/stage2i2-oracle-task-head-diagnostic.js',
  stage2i3: 'src/lab/stage2i3-oracle-head-remediation.js',
  stage2i3a: 'src/lab/stage2i3a-regime-reversal-separation.js',
  stage2i3b: 'src/lab/stage2i3b-regime-recall-diagnostic.js',
};

const [baseline, runtime, campaign, stage2i3b] = await Promise.all([
  'baseline-manifest.json',
  'canonical-runtime-identity.json',
  'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i3b-regime-recall-diagnostic/stage2i3b-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT || '/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience' });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I3C_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i3b.stage2i3bCertified || stage2i3b.certificationHash !== STAGE2I3C_STAGE2I3B_CERTIFICATION_HASH || stage2i3b.evidenceDigest !== STAGE2I3C_STAGE2I3B_EVIDENCE_DIGEST) throw new Error('STAGE2I3C_BLOCKED_BY_STAGE2I3B_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2I3C_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2I3CDimensionAwareRemediation();
const replayEquivalent = sha256(buildStage2I3CDimensionAwareRemediation()) === sha256(evaluation);
const external = process.env.STAGE2I3C_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I3C_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const names = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => names.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };
const diagnosticPass = evaluation.rootCauseReproduction.stage2i3bResultReproduced
  && evaluation.rootCauseReproduction.descriptorRecall === 1
  && evaluation.composition.persistenceRequirementsDimensionAware
  && evaluation.finalHoldout.regimeV4Score >= 7
  && evaluation.finalHoldout.accuracy >= evaluation.qualityGate.minimumAccuracy
  && evaluation.finalHoldout.adversarialAccuracy >= evaluation.qualityGate.minimumAdversarialAccuracy
  && evaluation.finalHoldout.incrementalValue > 0
  && evaluation.finalHoldout.beatsSimpleBaseline
  && evaluation.finalHoldout.distinctFromReversal
  && evaluation.finalHoldout.reversalOnlyFalseRegimeRate <= evaluation.qualityGate.maximumReversalOnlyFalseRegimeRate
  && evaluation.finalHoldout.temporaryAnomalyFalsePositiveRate <= evaluation.qualityGate.maximumTemporaryAnomalyFalsePositiveRate
  && evaluation.causalAttribution.signalCausallyAttributed
  && evaluation.freeze.allOtherOracleHeadsUnchanged
  && evaluation.projectedOracleV2.oracleV2Assembled === false
  && evaluation.freeze.primeChanged === false
  && evaluation.freeze.nexusChanged === false
  && evaluation.safety.expertSelectionInfluence === 0
  && evaluation.safety.authority.tier === 'R0'
  && evaluation.qualityGatePass;
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
  stage2i3bCertificationHash: stage2i3b.certificationHash,
  stage2i3bEvidenceDigest: stage2i3b.evidenceDigest,
  stage2i3bResultReproduced: evaluation.rootCauseReproduction.stage2i3bResultReproduced,
  frozenOwnerSha256: measuredOwners,
  processDescriptorImplementationChanged: false,
  persistenceV2Changed: false,
  reversalHeadChanged: false,
  reversalSeparationLogicChanged: false,
  selectedRegimeV4: evaluation.search.selection.selectedRegimeV4.id,
  regimeV4Score: evaluation.finalHoldout.regimeV4Score,
  evidenceDigest: evaluation.evidenceDigest,
  qualityGatePass: evaluation.qualityGatePass,
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
const withoutHash = { ...base, stage2i3cCertified: certified };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i3c-dimension-aware-regime-composition');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'dimension-aware-regime-composition-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'selected-regime-v4.json'), `${JSON.stringify({ search: evaluation.search, finalHoldout: evaluation.finalHoldout, exactFalseNegativeRecovery: evaluation.exactFalseNegativeRecovery }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3c-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i3c-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability }, null, 2));
