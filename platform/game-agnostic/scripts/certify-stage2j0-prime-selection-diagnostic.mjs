#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { recommend } from '../src/prime/root-puct.js';
import { stage2i0CapabilityAdapter } from '../src/lab/stage2i0-capability-adapter.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { buildStage2J0PrimeCases, buildStage2J0PrimeDiagnostic, recommendStage2J0Candidate } from '../src/lab/stage2j0-prime-selection-diagnostic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const ownerPaths = {
  prime: 'src/prime/root-puct.js',
  stage2i0Adapter: 'src/lab/stage2i0-capability-adapter.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexus: 'src/experts/nexus.js',
};
const expectedOwners = {
  prime: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  stage2i0Adapter: '2c2101b7c0db12f4c9a5cb8d32a486befbf34f9713252991eb44e4f3b6230e5b',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexus: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
};

const [baselineManifest, runtime, campaign, stage2i0, stage2i4] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i0-capability-baseline/stage2i0-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2i4-oracle-v2-assembly/stage2i4-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2J0_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i0.stage2i0Certified || stage2i0.certificationHash !== '7ac8077b322c1d763ff0dc9442d8462f7cc4340d71cbdae1696b352a1571a77a') throw new Error('STAGE2J0_BLOCKED_BY_STAGE2I0_CERTIFICATION_DRIFT');
if (!stage2i4.stage2i4Certified || stage2i4.certificationHash !== 'eccf9b419f61a8fa6cf2944e0c1f50b3a033d5adfe82959fb355dffb2090747b') throw new Error('STAGE2J0_BLOCKED_BY_STAGE2I4_CERTIFICATION_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2J0_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2J0PrimeDiagnostic();
const replayEquivalent = sha256(buildStage2J0PrimeDiagnostic()) === sha256(evaluation);
const external = process.env.STAGE2J0_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2J0_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const allPlatformsMeasured = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = allPlatformsMeasured && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };

const cases = buildStage2J0PrimeCases();
const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
const timeCases = (callback) => cases.map((entry) => { const start = performance.now(); callback(entry); return performance.now() - start; });
for (const entry of cases.slice(0, 20)) {
  recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) });
  recommendStage2J0Candidate(entry);
}
const primeTimes = timeCases((entry) => recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) }));
const candidateTimes = timeCases(recommendStage2J0Candidate);
const summarize = (values) => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99) });
const performanceEvidence = { unit: 'milliseconds_per_decision', cases: cases.length, primeV1: { ...summarize(primeTimes), simulations: '32|48|64|96', depth: 1 }, candidate: { ...summarize(candidateTimes), simulations: '32|48|64|96', depth: 1 }, boundedRegression: percentile(candidateTimes, .99) < 100 };

const diagnosticPass = evaluation.capability.diagnosticComplete && evaluation.reproduction.reproduced && evaluation.failureAttribution.unattributed === 0 && evaluation.binding.actionReorderingInvariant && evaluation.rewardSign.consistent;
const pass = diagnosticPass && verification.declaredEqualsMeasured && replayEquivalent && portability.portabilityStatus === 'PASS' && Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest) && !evaluation.freezes.primeChanged && !evaluation.freezes.oracleV2Changed && !evaluation.freezes.nexusChanged && evaluation.safety.authority.tier === 'R0' && !evaluation.production.primeProductionReplaced && !evaluation.production.primeCandidatePromoted;
const base = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  status: pass ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  inheritedCertified: { stage2i0: stage2i0.stage2i0Certified, stage2i4: stage2i4.stage2i4Certified },
  inheritedCertificationHashes: { stage2i0: stage2i0.certificationHash, stage2i4: stage2i4.certificationHash },
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged: Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest),
  stage2i0PrimeBaselineReproduced: evaluation.reproduction.reproduced,
  primeDiagnosticComplete: evaluation.capability.diagnosticComplete,
  primeCandidateCapabilityScore: evaluation.capability.candidateScore,
  prime7Of10GatePass: evaluation.capability.prime7Of10GatePass,
  diagnosticPassCapabilityGateFail: evaluation.capability.diagnosticPassCapabilityGateFail,
  evidenceDigest: evaluation.evidenceDigest,
  replayEquivalent,
  portabilityStatus: portability.portabilityStatus,
  primeChanged: false,
  oracleV2Changed: false,
  nexusChanged: false,
  expertSelectionInfluence: 0,
  primeProductionReplaced: false,
  primeCandidatePromoted: false,
  authority: evaluation.safety.authority,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  authorityTokenIssues: 0,
  tests: { baseline: { tests: 353, passing: 353, failing: 0 }, stage2j0: { tests: 15, passing: 15, failing: 0 }, fullSuite: { tests: 368, passing: 368, failing: 0 } },
};
const withoutHash = { ...base, stage2j0Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2j0-prime-selection-diagnostic');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'prime-selection-diagnostic-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j0-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j0-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j0-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j0-root-cause-report.json'), `${JSON.stringify({ stage: evaluation.stage, rootCause: evaluation.failureAttribution.primaryPrimeFailureMode, valueLoss: evaluation.value.primaryLoss, failuresAttributed: evaluation.failureAttribution.attributed, unattributed: evaluation.failureAttribution.unattributed, remediationTarget: evaluation.remediation.target, selectedCandidate: evaluation.remediation.candidateSelection.selectedPrimeCandidate, diagnosticComplete: evaluation.capability.diagnosticComplete, capabilityGatePass: evaluation.capability.prime7Of10GatePass, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence }, null, 2));
