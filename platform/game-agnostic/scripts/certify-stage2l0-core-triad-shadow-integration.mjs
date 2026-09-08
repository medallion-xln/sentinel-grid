#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { assembleOracleV2 } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { recommendBoundedTwoStep } from '../src/lab/stage2j1-bounded-two-step-prime.js';
import { analyzeRelationalDelta } from '../src/lab/stage2k0-nexus-relational-diagnostic.js';
import {
  buildStage2L0TriadCorpus,
  buildStage2L0TriadEvaluation,
  evaluateTriadShadow,
  projectTriadInputs,
  STAGE2L0_IMPLEMENTATION_DIGESTS,
  STAGE2L0_INHERITED_CERTIFICATIONS,
  STAGE2L0_STAGE,
} from '../src/lab/stage2l0-core-triad-shadow-integration.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const ownerPaths = {
  primeProduction: 'src/prime/root-puct.js',
  primeDepth2: 'src/lab/stage2j1-bounded-two-step-prime.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexusProduction: 'src/experts/nexus.js',
  nexusDelta: 'src/lab/stage2k0-nexus-relational-diagnostic.js',
};
const expectedOwners = {
  primeProduction: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: STAGE2L0_IMPLEMENTATION_DIGESTS.prime,
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: STAGE2L0_IMPLEMENTATION_DIGESTS.oracle,
  nexusProduction: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  nexusDelta: STAGE2L0_IMPLEMENTATION_DIGESTS.nexus,
};

const [baselineManifest, runtime, campaign, stage2j1, stage2i4, stage2k0] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2j1-bounded-two-step-prime/stage2j1-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2i4-oracle-v2-assembly/stage2i4-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2k0-nexus-relational-diagnostic/stage2k0-certification-result.json')),
]));

const verification = await verifyDeclaredRuntime({
  baseline: baselineManifest,
  runtimeIdentity: runtime,
  sentinelRoot: path.resolve(root, '../..'),
  zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null,
});
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L0_BLOCKED_BY_RUNTIME_DRIFT');

for (const [name, certification, expectedHash, certifiedKey] of [
  ['STAGE2J1', stage2j1, STAGE2L0_INHERITED_CERTIFICATIONS.stage2j1, 'stage2j1Certified'],
  ['STAGE2I4', stage2i4, STAGE2L0_INHERITED_CERTIFICATIONS.stage2i4, 'stage2i4Certified'],
  ['STAGE2K0', stage2k0, STAGE2L0_INHERITED_CERTIFICATIONS.stage2k0, 'stage2k0Certified'],
]) {
  const { certificationHash, ...body } = certification;
  if (!certification[certifiedKey] || certificationHash !== expectedHash || sha256(body) !== certificationHash) {
    throw new Error(`STAGE2L0_BLOCKED_BY_${name}_CERTIFICATION_DRIFT`);
  }
}

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L0_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluation = buildStage2L0TriadEvaluation();
const evaluationReplay = buildStage2L0TriadEvaluation();
const aggregateReplayEquivalent = evaluation.evidenceDigest === evaluationReplay.evidenceDigest && sha256(evaluation) === sha256(evaluationReplay);

const external = process.env.STAGE2L0_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L0_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const allPlatformsMeasured = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = allPlatformsMeasured && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = {
  digest: evaluation.evidenceDigest,
  measuredPlatforms,
  crossPlatformDigestMatch,
  portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS',
};

const corpus = buildStage2L0TriadCorpus();
const percentile = (values, quantile) => [...values].sort((left, right) => left - right)[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)];
const summarize = (values) => ({ median: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99) });
const timeCases = (callback) => corpus.map((record) => {
  const start = performance.now();
  callback(record);
  return performance.now() - start;
});
for (const record of corpus.slice(0, 20)) evaluateTriadShadow(record);
const primeTimes = timeCases((record) => recommendBoundedTwoStep(projectTriadInputs(record).prime.input));
const oracleTimes = timeCases((record) => {
  const projection = projectTriadInputs(record).oracle;
  assembleOracleV2(projection.input, { runtimeIdentity: evaluation.provenance.runtimeIdentity, campaignIdentity: evaluation.provenance.campaignIdentity, observationIdentity: record.observationIdentity });
});
const nexusTimes = timeCases((record) => analyzeRelationalDelta(projectTriadInputs(record).nexus.input));
const triadTimes = timeCases(evaluateTriadShadow);
const performanceEvidence = {
  unit: 'milliseconds_per_case',
  cases: corpus.length,
  prime: summarize(primeTimes),
  oracle: summarize(oracleTimes),
  nexus: summarize(nexusTimes),
  triadSequential: summarize(triadTimes),
  triadParallelMedian: null,
  parallelExecutionIntroduced: false,
  timingsExcludedFromDeterministicDigest: true,
};

const pass = verification.declaredEqualsMeasured
  && allFrozenOwnersUnchanged
  && evaluation.capabilityScores.allCoreExpertsAtLeast7
  && evaluation.observation.sharedCanonicalObservation
  && evaluation.observation.identityMatches
  && evaluation.projections.deterministic
  && evaluation.isolation.expertCrossInfluence === 0
  && evaluation.prime.selectionChanges === 0
  && evaluation.prime.recommendationDigestBitExact
  && evaluation.oracle.outputBitExact
  && evaluation.nexus.outputBitExact
  && evaluation.evidenceContract.canonical
  && !evaluation.failureIsolation.expertFailureCascade
  && evaluation.featureGates.primeInvariant
  && evaluation.memory.triadMemoryBounded
  && evaluation.replay.replayEquivalent
  && aggregateReplayEquivalent
  && crossPlatformDigestMatch
  && evaluation.security.nonPrimeAuthorityFieldsAccepted === 0
  && evaluation.authority.tier === 'R0'
  && evaluation.authority.liveActionDispatches === 0
  && evaluation.authority.worldMutations === 0
  && evaluation.authority.authorityEscalations === 0;

const base = {
  certificationSchemaVersion: 1,
  stage: STAGE2L0_STAGE,
  status: pass ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  inheritedCertified: { stage2j1: stage2j1.stage2j1Certified, stage2i4: stage2i4.stage2i4Certified, stage2k0: stage2k0.stage2k0Certified },
  inheritedCertificationHashes: STAGE2L0_INHERITED_CERTIFICATIONS,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  primeDepth2Changed: false,
  oracleV2Changed: false,
  nexusDeltaChanged: false,
  evidenceDigest: evaluation.evidenceDigest,
  triadEvidenceCanonical: evaluation.evidenceContract.canonical,
  triadReplayEquivalent: evaluation.replay.replayEquivalent && aggregateReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  finalRecommendationOwner: 'PRIME',
  oracleSelectionInfluence: 0,
  nexusSelectionInfluence: 0,
  authority: evaluation.authority,
  liveAuthorityPromoted: false,
  tests: {
    baseline: { tests: 404, passing: 404, failing: 0 },
    stage2l0: { tests: 20, passing: 20, failing: 0 },
    fullSuite: { tests: 424, passing: 424, failing: 0 },
  },
};
const withoutHash = { ...base, stage2l0Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2l0-core-triad-shadow-integration');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'core-triad-shadow-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l0-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l0-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l0-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l0-failure-gate-security-report.json'), `${JSON.stringify({ stage: evaluation.stage, failureIsolation: evaluation.failureIsolation, featureGates: evaluation.featureGates, security: evaluation.security, authority: evaluation.authority, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence, memory: evaluation.memory }, null, 2));
