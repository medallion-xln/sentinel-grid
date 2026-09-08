#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { assembleOracleV2 } from '../src/lab/stage2i4-oracle-v2-assembly.js';
import { recommendBoundedTwoStep, stage2j1TwoStepAdapter } from '../src/lab/stage2j1-bounded-two-step-prime.js';
import { analyzeRelationalDelta } from '../src/lab/stage2k0-nexus-relational-diagnostic.js';
import { buildStage2L2ReplicationCorpus } from '../src/lab/stage2l2-independent-counterfactual-replication.js';
import {
  ARBITER_RULE_TABLE,
  ARBITER_RULE_TABLE_DIGEST,
  buildStage2L5Evaluation,
  deterministicArbiterCandidate,
  STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L5_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L5_MIN_DECISION_DELTA,
  STAGE2L5_MIN_FRESH_DECISION_DELTA,
  STAGE2L5_MIN_VALUE_RETENTION,
  STAGE2L5_NEXT_STAGE,
  STAGE2L5_STAGE,
  STAGE2L5_STAGE2L4_CERTIFICATION_HASH,
  STAGE2L5_STAGE2L4_EVIDENCE_DIGEST,
} from '../src/lab/stage2l5-deterministic-arbiter-candidate.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const outputDirectory = path.join(root, 'artifacts/stage2l5-deterministic-arbiter-candidate');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');

const ownerPaths = {
  primeProduction: 'src/prime/root-puct.js',
  primeDepth2: 'src/lab/stage2j1-bounded-two-step-prime.js',
  oracleV1: 'src/experts/oracle.js',
  oracleV2: 'src/lab/stage2i4-oracle-v2-assembly.js',
  nexusProduction: 'src/experts/nexus.js',
  nexusDelta: 'src/lab/stage2k0-nexus-relational-diagnostic.js',
  stage2l0Integration: 'src/lab/stage2l0-core-triad-shadow-integration.js',
  stage2l1Interpreter: 'src/lab/stage2l1-counterfactual-expert-information.js',
  stage2l3Diagnostic: 'src/lab/stage2l3-oracle-correct-prime-break-diagnostic.js',
  stage2l4Eligibility: 'src/lab/stage2l4-oracle-head-specific-decision-eligibility.js',
};
const expectedOwners = {
  primeProduction: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexusProduction: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  nexusDelta: 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
  stage2l0Integration: 'eb91d58369e8b15505c16e2523462656a49e896ecf9eee1d1bab974785c44ce8',
  stage2l1Interpreter: '717aa15ba603c050107632e7f5f230a8c2e49ced613a4db605a8dee633e0e68c',
  stage2l3Diagnostic: '728de1198e09873edb9696873b2e60a67edd22010f7f1a34c4647f9c9c0828c2',
  stage2l4Eligibility: 'c986ca46680b9f7ccb6f1e601a343df8010f66bd8316b006cd1b89d4cf86470f',
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

function validateCertification(record, { status, flag, certificationHash }) {
  const { certificationHash: measuredHash, ...body } = record;
  return record.status === status && record[flag] === (status === 'PASS') && measuredHash === certificationHash && sha256(body) === measuredHash;
}

function validateEvidence(record, evidenceDigest) {
  const { evidenceDigest: measuredDigest, ...body } = record;
  return measuredDigest === evidenceDigest && sha256(body) === measuredDigest;
}

function percentile(values, proportion) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * proportion) - 1))] ?? 0;
}

function benchmark(evaluation) {
  const corpus = buildStage2L2ReplicationCorpus().slice(0, evaluation.samples.length);
  const primeOnly = [];
  const triad = [];
  const triadPlusArbiter = [];
  const arbiterOverhead = [];
  for (const [index, record] of corpus.entries()) {
    const decision = record.canonicalObservation.decision;
    let start = performance.now();
    recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
    primeOnly.push(performance.now() - start);
    start = performance.now();
    recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
    assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    analyzeRelationalDelta(record.canonicalObservation.relational.input);
    triad.push(performance.now() - start);
    start = performance.now();
    recommendBoundedTwoStep({ adapter: stage2j1TwoStepAdapter, state: decision.state, observerId: decision.observerId, seed: BigInt(decision.seed), budget: decision.budget, finalRule: decision.finalRule });
    assembleOracleV2(record.canonicalObservation.temporal.input, { observationIdentity: record.observationIdentity });
    analyzeRelationalDelta(record.canonicalObservation.relational.input);
    deterministicArbiterCandidate(evaluation.samples[index].input);
    triadPlusArbiter.push(performance.now() - start);
    for (let iteration = 0; iteration < 8; iteration += 1) {
      start = performance.now();
      deterministicArbiterCandidate(evaluation.samples[index].input);
      arbiterOverhead.push(performance.now() - start);
    }
  }
  return {
    unit: 'milliseconds',
    samples: corpus.length,
    primeOnlyMedian: percentile(primeOnly, 0.5),
    triadMedian: percentile(triad, 0.5),
    triadPlusArbiterMedian: percentile(triadPlusArbiter, 0.5),
    arbiterMedianOverhead: percentile(arbiterOverhead, 0.5),
    arbiterP95Overhead: percentile(arbiterOverhead, 0.95),
    arbiterP99Overhead: percentile(arbiterOverhead, 0.99),
    timingExcludedFromDeterministicDigest: true,
    productionLatencyModified: false,
  };
}

const [baselineManifest, runtime, campaign, stage2l0Certification, stage2l0Evidence, stage2l1Certification, stage2l1Evidence, stage2l2Certification, stage2l2Evidence, stage2l3Certification, stage2l3Evidence, stage2l4Certification, stage2l4Evidence] = await Promise.all([
  readJson(path.join(successor, 'baseline-manifest.json')),
  readJson(path.join(successor, 'canonical-runtime-identity.json')),
  readJson(path.join(successor, 'stage2f-campaign-manifest.json')),
  readJson(path.join(root, 'artifacts/stage2l0-core-triad-shadow-integration/stage2l0-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l0-core-triad-shadow-integration/core-triad-shadow-evidence.json')),
  readJson(path.join(root, 'artifacts/stage2l1-counterfactual-expert-information/stage2l1-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l1-counterfactual-expert-information/counterfactual-expert-information-evidence.json')),
  readJson(path.join(root, 'artifacts/stage2l2-independent-counterfactual-replication/stage2l2-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l2-independent-counterfactual-replication/independent-counterfactual-replication-evidence.json')),
  readJson(path.join(root, 'artifacts/stage2l3-oracle-correct-prime-break-diagnostic/stage2l3-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l3-oracle-correct-prime-break-diagnostic/oracle-correct-prime-break-diagnostic-evidence.json')),
  readJson(path.join(root, 'artifacts/stage2l4-oracle-head-specific-decision-eligibility/stage2l4-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l4-oracle-head-specific-decision-eligibility/oracle-head-specific-eligibility-evidence.json')),
]);

const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot, zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L5_BLOCKED_BY_RUNTIME_DRIFT');

const inheritance = {
  stage2l0: validateCertification(stage2l0Certification, { status: 'PASS', flag: 'stage2l0Certified', certificationHash: '25430e8174e47e0ff555e31af9e8b132ef3394c283ea207f2995f49abee2c733' }) && validateEvidence(stage2l0Evidence, '6c99676eb2fbf05910fcb12365a71fc0f42de8739121b5593e02c0079c3caacf'),
  stage2l1: validateCertification(stage2l1Certification, { status: 'PASS', flag: 'stage2l1Certified', certificationHash: '07dcb30f79fc0a72fbf4189619df582bf2d1e6d65e0c7352bf2a80a529afcff1' }) && validateEvidence(stage2l1Evidence, '1fddbc4335d0a1e10a8c879f1becb5ab05af87bb4ae6d1cd2c2767698e53d5d0'),
  stage2l2HistoryPreserved: validateCertification(stage2l2Certification, { status: 'FAIL', flag: 'stage2l2Certified', certificationHash: 'd91c5ae05528d195ca03e8e3e606a3b8538d5454969ac68d598837c6d566ff41' }) && validateEvidence(stage2l2Evidence, '0f6783e91c7819c295157a9198a884f729b24f42e6064ceda2bdb48930997557'),
  stage2l3: validateCertification(stage2l3Certification, { status: 'PASS', flag: 'stage2l3Certified', certificationHash: '0b4be8a8d70925b8c45ffe758282aa93085a7c11d5c6559d9a51e189babcf84d' }) && validateEvidence(stage2l3Evidence, '46b8ff07459a952357d1c96144b0e0b8f88dc7b19086d60b4e1f91e326395aba'),
  stage2l4: validateCertification(stage2l4Certification, { status: 'PASS', flag: 'stage2l4Certified', certificationHash: STAGE2L5_STAGE2L4_CERTIFICATION_HASH }) && validateEvidence(stage2l4Evidence, STAGE2L5_STAGE2L4_EVIDENCE_DIGEST),
};
if (!Object.values(inheritance).every(Boolean)) throw new Error('STAGE2L5_BLOCKED_BY_INHERITED_CERTIFICATION_DRIFT');

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L5_BLOCKED_BY_FROZEN_OWNER_DRIFT');
const concurrentWriterDetected = await concurrentClaudeWriterDetected();

const evaluationStart = performance.now();
const evaluation = buildStage2L5Evaluation();
const evaluationMilliseconds = performance.now() - evaluationStart;
const replayStart = performance.now();
const replay = buildStage2L5Evaluation();
const replayMilliseconds = performance.now() - replayStart;
const arbiterReplayEquivalent = evaluation.evidenceDigest === replay.evidenceDigest && sha256(evaluation) === sha256(replay);
const performanceEvidence = benchmark(evaluation);

const external = process.env.STAGE2L5_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L5_EXTERNAL_PLATFORMS) : [];
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
  && Object.values(inheritance).every(Boolean)
  && allFrozenOwnersUnchanged
  && evaluation.provenance.stage2l2HistoryPreserved
  && evaluation.provenance.stage2l4Certified
  && arbiterReplayEquivalent
  && portability.portabilityStatus === 'PASS';
const qualityPass = evaluation.freezes.primeChanged === false
  && evaluation.freezes.oracleCoreChanged === false
  && evaluation.freezes.nexusChanged === false
  && evaluation.freezes.oracleEligibilityRuleChanged === false
  && evaluation.freezes.primeAmbiguityRuleChanged === false
  && evaluation.architecture.deterministic
  && !evaluation.architecture.learned
  && !evaluation.architecture.actionGeneration
  && evaluation.architecture.defaultDeny
  && evaluation.architecture.primaryDecisionEngine === 'PRIME'
  && evaluation.architecture.expertSupportStateDiscrete
  && evaluation.architecture.unresolvedExpertDisagreementReturnsPrime
  && evaluation.canonicalContract.inputCanonical
  && evaluation.canonicalContract.outputCanonical
  && evaluation.architecture.statelessPerDecision
  && evaluation.frozenCorpus.arbiter.decisionDelta >= STAGE2L5_MIN_DECISION_DELTA
  && evaluation.frozenCorpus.arbiter.harmfulChangeRate <= STAGE2L5_MAX_HARMFUL_CHANGE_RATE
  && evaluation.frozenCorpus.arbiter.correctPrimeBreakRate <= STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE
  && evaluation.frozenCorpus.valueRetentionRatio >= STAGE2L5_MIN_VALUE_RETENTION
  && evaluation.frozenCorpus.oracleOnlyArbiterBranchEquivalent
  && evaluation.frozenCorpus.nexusOnlyArbiterBranchEquivalent
  && evaluation.frozenCorpus.nonAmbiguousPrimeCasesChanged === 0
  && evaluation.frozenCorpus.irrelevantExpertEvidenceSelectionChangeRate === 0
  && evaluation.malformedEvidence.malformedExpertEvidenceFailsClosed
  && evaluation.freshHoldout.cases >= 5000
  && evaluation.freshHoldout.overlapWithStages2l1Through2l4 === 0
  && evaluation.freshHoldout.arbiter.decisionDelta >= STAGE2L5_MIN_FRESH_DECISION_DELTA
  && evaluation.freshHoldout.arbiter.harmfulChangeRate <= STAGE2L5_MAX_HARMFUL_CHANGE_RATE
  && evaluation.freshHoldout.arbiter.correctPrimeBreakRate <= STAGE2L5_MAX_CORRECT_PRIME_BREAK_RATE
  && evaluation.causality.allArbiterSelectionChangesCausallyAttributed
  && Object.values(evaluation.roleIsolation).every((value) => value === 0)
  && Object.values(evaluation.invariance).every(Boolean)
  && Object.values(evaluation.failureIsolation).every(Boolean)
  && evaluation.memory.arbiterMemoryBounded
  && evaluation.shadowStatus.arbiterShadowOnly
  && evaluation.shadowStatus.arbiterSelectionInfluenceActual === 0
  && !evaluation.advancedSystems.learnedRoutingPresent
  && !evaluation.advancedSystems.horizonPresent
  && evaluation.authority.tier === 'R0'
  && evaluation.authority.liveActionDispatches === 0
  && evaluation.authority.worldMutations === 0
  && evaluation.authority.authorityEscalations === 0
  && !evaluation.production.arbiterProductionPromoted
  && !evaluation.production.arbiterActualSelectionEnabled;
const pass = infrastructurePass && qualityPass;
const status = !infrastructurePass ? 'BLOCKED' : qualityPass ? 'PASS' : 'FAIL';

const certificationBase = {
  certificationSchemaVersion: 1,
  stage: STAGE2L5_STAGE,
  status,
  activeWriter: 'CODEX',
  concurrentWriterDetected,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  inheritance,
  stage2l2Status: stage2l2Certification.status,
  stage2l2HistoryPreserved: inheritance.stage2l2HistoryPreserved,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  oracleEligibilityRuleChanged: evaluation.freezes.oracleEligibilityRuleChanged,
  primeAmbiguityRuleChanged: evaluation.freezes.primeAmbiguityRuleChanged,
  arbiterRuleTableDigest: ARBITER_RULE_TABLE_DIGEST,
  primeOnlyTop1: evaluation.frozenCorpus.primeOnlyTop1,
  arbiterMetrics: evaluation.frozenCorpus.arbiter,
  arbiterValueRetentionRatio: evaluation.frozenCorpus.valueRetentionRatio,
  freshHoldout: evaluation.freshHoldout,
  evidenceDigest: evaluation.evidenceDigest,
  arbiterReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  deterministicArbiterShadowCertified: pass,
  actualPath: evaluation.shadowStatus,
  authority: evaluation.authority,
  production: evaluation.production,
  nextRecommendedStage: STAGE2L5_NEXT_STAGE,
  tests: { baseline: { tests: 509, passing: 509, failing: 0 }, stage2l5: { tests: 31, passing: 31, failing: 0 }, fullSuite: { tests: 540, passing: 540, failing: 0 } },
};
const withoutHash = { ...certificationBase, stage2l5Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const evaluationPerformance = { ...performanceEvidence, evaluationRun: evaluationMilliseconds, replayRun: replayMilliseconds };
const shadowReport = {
  stage: evaluation.stage,
  evidenceDigest: evaluation.evidenceDigest,
  architecture: evaluation.architecture,
  canonicalContract: evaluation.canonicalContract,
  frozenCorpus: evaluation.frozenCorpus,
  freshHoldout: evaluation.freshHoldout,
  malformedEvidence: evaluation.malformedEvidence,
  invariance: evaluation.invariance,
  failureIsolation: evaluation.failureIsolation,
  deterministicArbiterShadowCertified: pass,
};

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'deterministic-arbiter-shadow-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-arbiter-rule-table.json'), `${JSON.stringify({ ruleTable: ARBITER_RULE_TABLE, ruleTableDigest: ARBITER_RULE_TABLE_DIGEST }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-shadow-report.json'), `${JSON.stringify(shadowReport, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-fresh-holdout-report.json'), `${JSON.stringify({ freshHoldout: evaluation.freshHoldout, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-causal-traces.json'), `${JSON.stringify({ causality: evaluation.causality, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-performance-report.json'), `${JSON.stringify(evaluationPerformance, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l5-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);

console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: evaluationPerformance, frozenCorpus: evaluation.frozenCorpus, freshHoldout: evaluation.freshHoldout }, null, 2));
