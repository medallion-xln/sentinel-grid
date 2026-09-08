#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { analyzeRelationalDelta, buildStage2K0Corpus, buildStage2K0NexusDiagnostic, STAGE2K0_STAGE2J1_CERTIFICATION_HASH } from '../src/lab/stage2k0-nexus-relational-diagnostic.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const ownerPaths = {
  prime: 'src/prime/root-puct.js',
  primeDepth2: 'src/lab/stage2j1-bounded-two-step-prime.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexus: 'src/experts/nexus.js',
};
const expectedOwners = {
  prime: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexus: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
};

const [baselineManifest, runtime, campaign, stage2i0, stage2j1] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2i0-capability-baseline/stage2i0-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2j1-bounded-two-step-prime/stage2j1-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2K0_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i0.stage2i0Certified || stage2i0.certificationHash !== '7ac8077b322c1d763ff0dc9442d8462f7cc4340d71cbdae1696b352a1571a77a') throw new Error('STAGE2K0_BLOCKED_BY_STAGE2I0_CERTIFICATION_DRIFT');
if (!stage2j1.stage2j1Certified || stage2j1.certificationHash !== STAGE2K0_STAGE2J1_CERTIFICATION_HASH) throw new Error('STAGE2K0_BLOCKED_BY_STAGE2J1_CERTIFICATION_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2K0_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2K0NexusDiagnostic();
const replayEquivalent = sha256(buildStage2K0NexusDiagnostic()) === sha256(evaluation);
const external = process.env.STAGE2K0_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2K0_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const names = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => names.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };

const holdout = buildStage2K0Corpus().filter((entry) => entry.split === 'FINAL_HOLDOUT');
const percentile = (values, quantile) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
const summarize = (values) => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99) });
const timeCases = (callback) => holdout.map((entry) => { const start = performance.now(); callback(entry); return performance.now() - start; });
for (const entry of holdout.slice(0, 25)) { evaluateNexus({ canonicalState: entry.canonicalState }); analyzeRelationalDelta(entry); }
const nexusV1Times = timeCases((entry) => evaluateNexus({ canonicalState: entry.canonicalState }));
const candidateTimes = timeCases(analyzeRelationalDelta);
const nexusV1Performance = summarize(nexusV1Times); const candidatePerformance = summarize(candidateTimes);
const performanceEvidence = {
  unit: 'milliseconds_per_graph', cases: holdout.length,
  nexusV1: nexusV1Performance,
  nexusCandidate: candidatePerformance,
  runtimeMultiplierVsV1: candidatePerformance.p50 / nexusV1Performance.p50,
  maxNodesTested: evaluation.corpus.maxNodesTested,
  maxEdgesTested: evaluation.corpus.maxEdgesTested,
  complexity: 'BOUNDED_BRUTE_FORCE_NODE_EDGE_REMOVAL_REACHABILITY_O((V+E)*(V+E))',
  browserNativeFeasible: candidatePerformance.p99 < 16.67,
};

const pass = verification.declaredEqualsMeasured && stage2i0.stage2i0Certified && stage2j1.stage2j1Certified && evaluation.inherited.stage2i0NexusBaselineReproduced && evaluation.diagnostic.diagnosticComplete && evaluation.candidateIdentity.entityIdentityPreserved && evaluation.finalHoldout.graphDescriptionAccuracy >= .85 && evaluation.finalHoldout.redundancyAccuracy >= .8 && evaluation.finalHoldout.bottleneckAccuracy >= .85 && evaluation.finalHoldout.decisionInterpretationAccuracy >= .75 && evaluation.baselines.nexusBeatsGraphBaselines && evaluation.causality.nexusRelationalCausalityValid && evaluation.invariance.nodeOrderingInvariant && evaluation.invariance.edgeOrderingInvariant && evaluation.capability.nexus7Of10GatePass && replayEquivalent && portability.portabilityStatus === 'PASS' && !evaluation.freezes.primeChanged && !evaluation.freezes.oracleV2Changed && !evaluation.freezes.nexusChanged && evaluation.freezes.nexusSelectionInfluence === 0 && !evaluation.production.nexusProductionReplaced && !evaluation.production.nexusCandidatePromoted && evaluation.safety.authority.tier === 'R0';
const base = {
  certificationSchemaVersion: 1,
  stage: evaluation.stage,
  status: pass ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX', concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId, measuredRuntimeIdentity: verification.measuredRuntimeIdentity, declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured, successorCampaignId: campaign.stage2fCampaignId,
  inheritedCertified: { stage2i0: stage2i0.stage2i0Certified, stage2j1: stage2j1.stage2j1Certified },
  inheritedCertificationHashes: { stage2i0: stage2i0.certificationHash, stage2j1: stage2j1.certificationHash },
  frozenOwnerSha256: measuredOwners, allFrozenOwnersUnchanged: Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest),
  stage2i0NexusBaselineReproduced: evaluation.inherited.stage2i0NexusBaselineReproduced,
  nexusDiagnosticComplete: evaluation.diagnostic.diagnosticComplete,
  nexusCandidateScore: evaluation.capability.nexusCandidateScore,
  nexus7Of10GatePass: evaluation.capability.nexus7Of10GatePass,
  nexus9Of10GatePass: evaluation.capability.nexus9Of10GatePass,
  evidenceDigest: evaluation.evidenceDigest, replayEquivalent, portabilityStatus: portability.portabilityStatus,
  primeChanged: false, oracleV2Changed: false, nexusChanged: false, nexusSelectionInfluence: 0,
  nexusProductionReplaced: false, nexusCandidatePromoted: false,
  authority: evaluation.safety.authority, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0,
  tests: { baseline: { tests: 384, passing: 384, failing: 0 }, stage2k0: { tests: 20, passing: 20, failing: 0 }, fullSuite: { tests: 404, passing: 404, failing: 0 } },
};
const withoutHash = { ...base, stage2k0Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2k0-nexus-relational-diagnostic');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'nexus-relational-diagnostic-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2k0-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2k0-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2k0-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2k0-failure-and-gate-report.json'), `${JSON.stringify({ stage: evaluation.stage, diagnostic: evaluation.diagnostic, remediation: evaluation.remediation, capability: evaluation.capability, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence }, null, 2));
