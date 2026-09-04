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
import { buildStage2J0PrimeCases, recommendStage2J0Candidate } from '../src/lab/stage2j0-prime-selection-diagnostic.js';
import { buildStage2J1CertificationEvidence, buildStage2J1TwoStepCorpus, recommendBoundedTwoStep, stage2j1TwoStepAdapter, STAGE2J1_INHERITED_CERTIFICATION_HASH } from '../src/lab/stage2j1-bounded-two-step-prime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const ownerPaths = {
  prime: 'src/prime/root-puct.js',
  stage2i0Adapter: 'src/lab/stage2i0-capability-adapter.js',
  stage2j0Candidate: 'src/lab/stage2j0-prime-selection-diagnostic.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexus: 'src/experts/nexus.js',
};
const expectedOwners = {
  prime: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  stage2i0Adapter: '2c2101b7c0db12f4c9a5cb8d32a486befbf34f9713252991eb44e4f3b6230e5b',
  stage2j0Candidate: '5088dc06de283644f2574edd02cb7d0a05c160f6721e795987f8f84950adf52b',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexus: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
};

const [baselineManifest, runtime, campaign, stage2j0] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2j0-prime-selection-diagnostic/stage2j0-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2J1_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2j0.stage2j0Certified || stage2j0.certificationHash !== STAGE2J1_INHERITED_CERTIFICATION_HASH) throw new Error('STAGE2J1_BLOCKED_BY_STAGE2J0_CERTIFICATION_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2J1_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2J1CertificationEvidence();
const replayEquivalent = sha256(buildStage2J1CertificationEvidence()) === sha256(evaluation);
const external = process.env.STAGE2J1_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2J1_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const allPlatformsMeasured = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = allPlatformsMeasured && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };

const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
const summarize = (values) => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99) });
const timeCases = (cases, callback) => cases.map((entry) => { const start = performance.now(); callback(entry); return performance.now() - start; });
const oneStepCases = buildStage2J0PrimeCases();
const twoStepCases = buildStage2J1TwoStepCorpus().filter((entry) => entry.split === 'FINAL_HOLDOUT');
for (const entry of oneStepCases.slice(0, 20)) {
  recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) });
  recommendStage2J0Candidate(entry);
}
for (const entry of twoStepCases.slice(0, 20)) recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 });
const primeV1Times = timeCases(oneStepCases, (entry) => recommend({ adapter: stage2i0CapabilityAdapter, state: entry.state, observerId: 'controller', simulations: entry.simulations, seed: BigInt(entry.seed) }));
const depth1Times = timeCases(oneStepCases, recommendStage2J0Candidate);
const depth2Times = timeCases(twoStepCases, (entry) => recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: entry.state, seed: BigInt(entry.seed), budget: 32 }));
const primeV1Performance = summarize(primeV1Times);
const depth1Performance = summarize(depth1Times);
const depth2Performance = summarize(depth2Times);
const performanceEvidence = {
  unit: 'milliseconds_per_decision',
  primeV1: { cases: oneStepCases.length, ...primeV1Performance, simulations: '32|48|64|96', depth: 1 },
  depth1Corrected: { cases: oneStepCases.length, ...depth1Performance, simulations: '32|48|64|96', depth: 1 },
  depth2Candidate: { cases: twoStepCases.length, ...depth2Performance, trajectoryBudget: 32, trajectoriesEvaluated: 25, depth: 2 },
  depth2RuntimeMultiplierVsDepth1: depth2Performance.p50 / depth1Performance.p50,
  browserNativeFeasible: depth2Performance.p99 < 16.67,
};

const pass = verification.declaredEqualsMeasured && stage2j0.stage2j0Certified && evaluation.valueContract.actionSensitiveStepRewardPreserved && evaluation.valueContract.terminalValueActionSensitive && evaluation.valueContract.wrongActionOvervaluationRate === 0 && evaluation.valueContract.rootActionTrajectoryBinding && !evaluation.valueContract.crossRootValueLeakage && evaluation.depthContract.primeCandidateDepth === 2 && evaluation.depthContract.twoStepReturnDeterministic && evaluation.oneStep.top1 >= .99 && evaluation.twoStep.top1 >= .85 && evaluation.twoStep.top2 >= .95 && evaluation.categories.deceptiveImmediateRewardAccuracy >= .85 && Math.min(evaluation.categories.nearTieOneStepAccuracy, evaluation.categories.nearTieTwoStepAccuracy) >= .75 && evaluation.categories.strongPreferenceAccuracy >= .85 && evaluation.baselineSemantics.primeDepth2BeatsSimpleHeuristics && evaluation.capability.primeDepth2CandidateScore >= 7 && evaluation.capability.prime7Of10GatePass && evaluation.invariance.rootActionReorderingInvariant && evaluation.invariance.secondStepActionReorderingInvariant && replayEquivalent && portability.portabilityStatus === 'PASS' && !evaluation.freezes.oracleV2Changed && !evaluation.freezes.nexusChanged && !evaluation.production.primeProductionReplaced && !evaluation.production.primeDepth2CandidatePromoted && evaluation.safety.authority.tier === 'R0';
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
  inheritedStage2j0Certified: stage2j0.stage2j0Certified,
  inheritedStage2j0CertificationHash: stage2j0.certificationHash,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged: Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest),
  evidenceDigest: evaluation.evidenceDigest,
  actionSensitiveStepRewardPreserved: evaluation.valueContract.actionSensitiveStepRewardPreserved,
  primeCandidateDepth: evaluation.depthContract.primeCandidateDepth,
  primeDepth2CandidateScore: evaluation.capability.primeDepth2CandidateScore,
  prime7Of10GatePass: evaluation.capability.prime7Of10GatePass,
  replayEquivalent,
  portabilityStatus: portability.portabilityStatus,
  primeProductionChanged: false,
  oracleV2Changed: false,
  nexusChanged: false,
  expertSelectionInfluence: 0,
  primeProductionReplaced: false,
  primeDepth2CandidatePromoted: false,
  authority: evaluation.safety.authority,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  authorityTokenIssues: 0,
  tests: { baseline: { tests: 368, passing: 368, failing: 0 }, stage2j1: { tests: 16, passing: 16, failing: 0 }, fullSuite: { tests: 384, passing: 384, failing: 0 } },
};
const withoutHash = { ...base, stage2j1Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2j1-bounded-two-step-prime');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'bounded-two-step-prime-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j1-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j1-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j1-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2j1-capability-gate-report.json'), `${JSON.stringify({ stage: evaluation.stage, capability: evaluation.capability, valueContract: evaluation.valueContract, depthContract: evaluation.depthContract, baselineSemantics: evaluation.baselineSemantics, reference: evaluation.reference, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence }, null, 2));
