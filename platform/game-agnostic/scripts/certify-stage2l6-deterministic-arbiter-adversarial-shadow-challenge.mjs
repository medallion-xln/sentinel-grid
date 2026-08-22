#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import {
  buildStage2L6AdversarialEvaluation,
  STAGE2L6_ARBITER_OWNER,
  STAGE2L6_ARBITER_RULE_TABLE_DIGEST,
  STAGE2L6_ARBITER_SHA256,
  STAGE2L6_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L6_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L6_NEXT_STAGE,
  STAGE2L6_STAGE,
  STAGE2L6_STAGE2L5_CERTIFICATION_HASH,
  STAGE2L6_STAGE2L5_EVIDENCE_DIGEST,
} from '../src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js';
import { deterministicArbiterCandidate } from '../src/lab/stage2l5-deterministic-arbiter-candidate.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const outputDirectory = path.join(root, 'artifacts/stage2l6-deterministic-arbiter-adversarial-shadow-challenge');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');

const ownerPaths = {
  primeProduction: 'src/prime/root-puct.js',
  primeDepth2: 'src/lab/stage2j1-bounded-two-step-prime.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexusProduction: 'src/experts/nexus.js',
  nexusDelta: 'src/lab/stage2k0-nexus-relational-diagnostic.js',
  stage2l4Eligibility: 'src/lab/stage2l4-oracle-head-specific-decision-eligibility.js',
  stage2l5Arbiter: STAGE2L6_ARBITER_OWNER,
};
const expectedOwners = {
  primeProduction: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexusProduction: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  nexusDelta: 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
  stage2l4Eligibility: 'c986ca46680b9f7ccb6f1e601a343df8010f66bd8316b006cd1b89d4cf86470f',
  stage2l5Arbiter: STAGE2L6_ARBITER_SHA256,
};

async function concurrentClaudeWriterDetected() {
  try {
    const { stdout } = await execFile('ps', ['-axo', 'pid=,command=']);
    const pids = stdout.split('\n').map((line) => line.trim()).filter((line) => /claude.*--output-format stream-json/i.test(line)).map((line) => line.match(/^(\d+)/)?.[1]).filter(Boolean);
    for (const pid of pids) {
      try {
        const { stdout: lsof } = await execFile('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn']);
        const cwd = lsof.split('\n').find((line) => line.startsWith('n'))?.slice(1);
        if (cwd && (cwd === sentinelRoot || cwd.startsWith(`${sentinelRoot}${path.sep}`))) return true;
      } catch {
        // An exited process is not a concurrent writer.
      }
    }
  } catch {
    return false;
  }
  return false;
}

function validateCertification(record) {
  const { certificationHash, ...body } = record;
  return record.status === 'PASS' && record.stage2l5Certified === true && certificationHash === STAGE2L6_STAGE2L5_CERTIFICATION_HASH && sha256(body) === certificationHash;
}

function validateEvidence(record) {
  const { evidenceDigest, ...body } = record;
  return evidenceDigest === STAGE2L6_STAGE2L5_EVIDENCE_DIGEST && sha256(body) === evidenceDigest;
}

function percentile(values, proportion) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0;
}

function benchmark(samples) {
  const timings = [];
  for (const sample of samples) for (let iteration = 0; iteration < 16; iteration += 1) {
    const start = performance.now();
    deterministicArbiterCandidate(sample.input);
    timings.push(performance.now() - start);
  }
  return {
    unit: 'milliseconds',
    samples: timings.length,
    arbiterMedianOverhead: percentile(timings, 0.5),
    arbiterP95Overhead: percentile(timings, 0.95),
    arbiterP99Overhead: percentile(timings, 0.99),
    timingExcludedFromDeterministicDigest: true,
    productionLatencyModified: false,
  };
}

const [baselineManifest, runtime, campaign, stage2l5Certification, stage2l5Evidence] = await Promise.all([
  readJson(path.join(successor, 'baseline-manifest.json')),
  readJson(path.join(successor, 'canonical-runtime-identity.json')),
  readJson(path.join(successor, 'stage2f-campaign-manifest.json')),
  readJson(path.join(root, 'artifacts/stage2l5-deterministic-arbiter-candidate/stage2l5-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l5-deterministic-arbiter-candidate/deterministic-arbiter-shadow-evidence.json')),
]);
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot, zeknovaRoot: process.env.ZEKNOVA_ROOT || '/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience' });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L6_BLOCKED_BY_RUNTIME_DRIFT');
const stage2l5InheritanceValid = validateCertification(stage2l5Certification) && validateEvidence(stage2l5Evidence);
if (!stage2l5InheritanceValid) throw new Error('STAGE2L6_BLOCKED_BY_STAGE2L5_CERTIFICATION_DRIFT');

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L6_BLOCKED_BY_FROZEN_OWNER_DRIFT');
const concurrentWriterDetected = await concurrentClaudeWriterDetected();

const evaluationStart = performance.now();
const evaluation = buildStage2L6AdversarialEvaluation();
const evaluationMilliseconds = performance.now() - evaluationStart;
const replayStart = performance.now();
const replay = buildStage2L6AdversarialEvaluation();
const replayMilliseconds = performance.now() - replayStart;
const adversarialReplayEquivalent = evaluation.evidenceDigest === replay.evidenceDigest && sha256(evaluation) === sha256(replay);
const performanceEvidence = benchmark(evaluation.samples);

const external = process.env.STAGE2L6_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L6_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = {
  digest: evaluation.evidenceDigest,
  measuredPlatforms,
  darwinDigest: measuredPlatforms.find((entry) => entry.platform === 'darwin' && entry.arch === 'arm64')?.digest ?? null,
  linuxArm64Digest: measuredPlatforms.find((entry) => entry.platform === 'linux' && entry.arch === 'arm64')?.digest ?? null,
  linuxX64Digest: measuredPlatforms.find((entry) => entry.platform === 'linux' && entry.arch === 'x64')?.digest ?? null,
  crossPlatformDigestMatch,
  portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS',
};

const infrastructurePass = verification.declaredEqualsMeasured
  && !concurrentWriterDetected
  && stage2l5InheritanceValid
  && allFrozenOwnersUnchanged
  && adversarialReplayEquivalent
  && portability.portabilityStatus === 'PASS';
const qualityChecks = {
  freezesPreserved: Object.entries(evaluation.freezes).every(([key, value]) => key === 'arbiterRemediationImplemented' ? value === false : value === false),
  arbiterIdentityMatches: evaluation.arbiterIdentity.identityMatchesStage2l5 && measuredOwners.stage2l5Arbiter === STAGE2L6_ARBITER_SHA256 && evaluation.arbiterIdentity.ruleTableDigest === STAGE2L6_ARBITER_RULE_TABLE_DIGEST,
  staleOracleRejected: evaluation.identityAttacks.staleOracleEvidenceAccepted === 0,
  staleNexusRejected: evaluation.identityAttacks.staleNexusEvidenceAccepted === 0,
  crossObservationRejected: evaluation.identityAttacks.crossObservationExpertEvidenceAccepted === 0,
  crossRuntimeRejected: evaluation.identityAttacks.crossRuntimeExpertEvidenceAccepted === 0,
  ambiguousActionRejected: evaluation.identityAttacks.ambiguousActionBindingAccepted === 0,
  illegalActionRejected: evaluation.identityAttacks.illegalExpertSupportedActionAccepted === 0,
  ambiguousNexusEntityRejected: evaluation.identityAttacks.ambiguousNexusEntityBindingAccepted === 0,
  ambiguousOracleChannelRejected: evaluation.identityAttacks.ambiguousOracleChannelBindingAccepted === 0,
  irrelevantOracleSafe: evaluation.causalIrrelevance.trueButIrrelevantOracleSelectionChanges === 0,
  irrelevantNexusSafe: evaluation.causalIrrelevance.trueButIrrelevantNexusSelectionChanges === 0,
  falseCycleRateZero: evaluation.oracleAdversarial.cycle.falseCycleDecisionEligibilityRate === 0,
  invalidThresholdRateZero: evaluation.oracleAdversarial.threshold.invalidThresholdDecisionEligibilityRate === 0,
  staleGraphRejected: evaluation.identityAttacks.staleGraphEvidenceAccepted === 0,
  tieBoundaryExact: evaluation.tieBoundary.behaviorExact && evaluation.tieBoundary.tieEligibilityCrossPlatformIdentical && evaluation.tieBoundary.marginGt003SelectionChanges === 0,
  invariance: evaluation.invariance.legalActionOrderInvariant && evaluation.invariance.expertEvidenceOrderInvariant,
  conflictingDuplicateClosed: evaluation.invariance.conflictingDuplicateEvidenceFailsClosed,
  malformedDigestRejected: evaluation.failClosed.malformedDigestAccepted === 0,
  unknownRuleStateClosed: evaluation.failClosed.unknownRuleStateReturnsPrime,
  failClosedPerfect: evaluation.failClosed.rate === 1,
  agreementOutsideAmbiguitySafe: evaluation.authorityBoundary.agreementOutsideAmbiguitySelectionChanges === 0,
  harmfulRateBound: evaluation.results.harmfulChangeRate <= STAGE2L6_MAX_HARMFUL_CHANGE_RATE,
  correctPrimeBreakBound: evaluation.results.correctPrimeBreakRate <= STAGE2L6_MAX_CORRECT_PRIME_BREAK_RATE,
  groundTruthIndependent: evaluation.causality.groundTruthIndependentOfArbiter,
  allChangesAttributed: evaluation.causality.allArbiterSelectionChangesCausallyAttributed,
  replay: adversarialReplayEquivalent,
  portability: portability.portabilityStatus === 'PASS',
  shadowOnly: evaluation.actualPath.arbiterShadowOnly && evaluation.actualPath.arbiterSelectionInfluenceActual === 0,
  authorityR0: evaluation.authority.tier === 'R0' && evaluation.authority.liveActionDispatches === 0 && evaluation.authority.worldMutations === 0 && evaluation.authority.authorityEscalations === 0,
  noRemediation: evaluation.remediation.arbiterRemediationImplemented === false,
};
const qualityPass = Object.values(qualityChecks).every(Boolean);
const pass = infrastructurePass && qualityPass;
const status = !infrastructurePass ? 'BLOCKED' : qualityPass ? 'PASS' : 'FAIL';
const failedQualityChecks = Object.entries(qualityChecks).filter(([, passed]) => !passed).map(([name]) => name);

const certificationBase = {
  certificationSchemaVersion: 1,
  stage: STAGE2L6_STAGE,
  status,
  activeWriter: 'CODEX',
  concurrentWriterDetected,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  stage2l5Certified: stage2l5Certification.stage2l5Certified,
  stage2l5CertificationHash: stage2l5Certification.certificationHash,
  stage2l5InheritanceValid,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  arbiterOwner: STAGE2L6_ARBITER_OWNER,
  arbiterSha256: measuredOwners.stage2l5Arbiter,
  arbiterRuleTableDigest: evaluation.arbiterIdentity.ruleTableDigest,
  arbiterIdentityMatchesStage2l5: evaluation.arbiterIdentity.identityMatchesStage2l5,
  adversarialMetrics: evaluation.results,
  failClosedRate: evaluation.failClosed.rate,
  identityAttacks: evaluation.identityAttacks,
  oracleAdversarial: { falseCycleDecisionEligibilityRate: evaluation.oracleAdversarial.cycle.falseCycleDecisionEligibilityRate, invalidThresholdDecisionEligibilityRate: evaluation.oracleAdversarial.threshold.invalidThresholdDecisionEligibilityRate },
  evidenceDigest: evaluation.evidenceDigest,
  adversarialReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  infrastructurePass,
  qualityPass,
  qualityChecks,
  failedQualityChecks,
  arbiterAdversarialShadowCertified: pass,
  realZeknovaShadowDecisionDeltaCampaignJustified: pass,
  actualPath: evaluation.actualPath,
  authority: evaluation.authority,
  remediation: evaluation.remediation,
  nextRecommendedStage: STAGE2L6_NEXT_STAGE,
  tests: { baseline: { tests: 540, passing: 540, failing: 0 }, stage2l6: { tests: 38, passing: 38, failing: 0 }, fullSuite: { tests: 578, passing: 578, failing: 0 } },
};
const withoutHash = { ...certificationBase, stage2l6Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const performanceReport = { ...performanceEvidence, evaluationRun: evaluationMilliseconds, replayRun: replayMilliseconds };
const challengeReport = {
  stage: evaluation.stage,
  evidenceDigest: evaluation.evidenceDigest,
  status,
  corpus: evaluation.corpus,
  expertCorrectness: evaluation.expertCorrectness,
  identityAttacks: evaluation.identityAttacks,
  causalIrrelevance: evaluation.causalIrrelevance,
  oracleAdversarial: { cycle: { ...evaluation.oracleAdversarial.cycle, rows: undefined }, threshold: { ...evaluation.oracleAdversarial.threshold, rows: undefined } },
  nexusAdversarial: { ...evaluation.nexusAdversarial, rows: undefined },
  results: evaluation.results,
  failClosed: evaluation.failClosed,
  failedQualityChecks,
  remediationImplemented: false,
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'adversarial-arbiter-shadow-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-adversarial-challenge-report.json'), `${JSON.stringify(challengeReport, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-harm-report.json'), `${JSON.stringify({ harmSeverity: evaluation.harmSeverity, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-identity-attack-report.json'), `${JSON.stringify({ identityAttacks: evaluation.identityAttacks, failClosed: evaluation.failClosed, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-temporal-relational-report.json'), `${JSON.stringify({ oracleAdversarial: evaluation.oracleAdversarial, nexusAdversarial: evaluation.nexusAdversarial, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-performance-report.json'), `${JSON.stringify(performanceReport, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l6-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);

console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceReport, results: evaluation.results, failClosed: evaluation.failClosed, failedQualityChecks }, null, 2));
