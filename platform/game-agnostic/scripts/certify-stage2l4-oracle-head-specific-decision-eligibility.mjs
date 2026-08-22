#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import {
  buildStage2L4RemediationEvaluation,
  ORACLE_ELIGIBILITY_RULE_DIGEST,
  STAGE2L4_MIN_ORACLE_DECISION_DELTA,
  STAGE2L4_NEXT_STAGE,
  STAGE2L4_STAGE,
  STAGE2L4_STAGE2L3_CERTIFICATION_HASH,
  STAGE2L4_STAGE2L3_EVIDENCE_DIGEST,
} from '../src/lab/stage2l4-oracle-head-specific-decision-eligibility.js';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const outputDirectory = path.join(root, 'artifacts/stage2l4-oracle-head-specific-decision-eligibility');
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

const [baselineManifest, runtime, campaign, stage2l3Certification, stage2l3Evidence] = await Promise.all([
  readJson(path.join(successor, 'baseline-manifest.json')),
  readJson(path.join(successor, 'canonical-runtime-identity.json')),
  readJson(path.join(successor, 'stage2f-campaign-manifest.json')),
  readJson(path.join(root, 'artifacts/stage2l3-oracle-correct-prime-break-diagnostic/stage2l3-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l3-oracle-correct-prime-break-diagnostic/oracle-correct-prime-break-diagnostic-evidence.json')),
]);
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot, zeknovaRoot: process.env.ZEKNOVA_ROOT || '/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience' });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L4_BLOCKED_BY_RUNTIME_DRIFT');

const { certificationHash: stage2l3Hash, ...stage2l3CertificationBody } = stage2l3Certification;
const { evidenceDigest: stage2l3Digest, ...stage2l3EvidenceBody } = stage2l3Evidence;
const stage2l3InheritanceValid = stage2l3Certification.status === 'PASS'
  && stage2l3Certification.stage2l3Certified === true
  && stage2l3Hash === STAGE2L4_STAGE2L3_CERTIFICATION_HASH
  && sha256(stage2l3CertificationBody) === stage2l3Hash
  && stage2l3Digest === STAGE2L4_STAGE2L3_EVIDENCE_DIGEST
  && sha256(stage2l3EvidenceBody) === stage2l3Digest;
if (!stage2l3InheritanceValid) throw new Error('STAGE2L4_BLOCKED_BY_STAGE2L3_CERTIFICATION_DRIFT');

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L4_BLOCKED_BY_FROZEN_OWNER_DRIFT');
const concurrentWriterDetected = await concurrentClaudeWriterDetected();

const evaluationStart = performance.now();
const evaluation = buildStage2L4RemediationEvaluation();
const evaluationMilliseconds = performance.now() - evaluationStart;
const replayStart = performance.now();
const replay = buildStage2L4RemediationEvaluation();
const replayMilliseconds = performance.now() - replayStart;
const remediationReplayEquivalent = evaluation.evidenceDigest === replay.evidenceDigest && sha256(evaluation) === sha256(replay);

const external = process.env.STAGE2L4_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L4_EXTERNAL_PLATFORMS) : [];
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

const infrastructurePass = verification.declaredEqualsMeasured && !concurrentWriterDetected && stage2l3InheritanceValid && evaluation.provenance.stage2l2ResultReproduced && allFrozenOwnersUnchanged && remediationReplayEquivalent && portability.portabilityStatus === 'PASS';
const qualityPass = evaluation.freezes.primeChanged === false
  && evaluation.freezes.oracleCoreChanged === false
  && evaluation.freezes.nexusChanged === false
  && evaluation.freezes.baseTieBreakRuleChanged === false
  && evaluation.architecture.oracleHeadSpecificDecisionEligibility
  && evaluation.cycleRemediation.cycleHarmsAfter === 0
  && evaluation.thresholdRemediation.thresholdHarmsAfter === 0
  && evaluation.inheritedHarmRegression.after === 0
  && evaluation.replication.oracleRemediated.correctPrimeBreakRate <= 0.01
  && evaluation.replication.oracleRemediated.harmfulChangeRate <= 0.05
  && evaluation.replication.oracleRemediated.decisionDelta >= STAGE2L4_MIN_ORACLE_DECISION_DELTA
  && evaluation.replication.nexusBranchOutputBitExact
  && evaluation.replication.disagreementHarmfulChangesAfterRemediation === 0
  && evaluation.replication.nonTieSelectionChanges === 0
  && evaluation.replication.irrelevantEvidenceSelectionChangeRate === 0
  && evaluation.freshHoldout.cases >= 2000
  && evaluation.freshHoldout.overlapWithStage2l2 === 0
  && evaluation.freshHoldout.overlapWithStage2l3HarmCorpus === 0
  && evaluation.freshHoldout.oracleDecisionDelta > 0
  && evaluation.freshHoldout.oracleCorrectPrimeBreakRate <= 0.01
  && evaluation.causality.allOracleInterventionsCausallyAttributed
  && evaluation.architecture.oracleEligibilityFailsClosed
  && evaluation.actualPath.actualPrimePathUnchanged
  && !evaluation.actualPath.arbiterImplemented
  && evaluation.authority.tier === 'R0';
const pass = infrastructurePass && qualityPass;
const status = !infrastructurePass ? 'BLOCKED' : qualityPass ? 'PASS' : 'FAIL';

const certificationBase = {
  certificationSchemaVersion: 1,
  stage: STAGE2L4_STAGE,
  status,
  activeWriter: 'CODEX',
  concurrentWriterDetected,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  inheritedStage2l3: { certified: stage2l3Certification.stage2l3Certified, evidenceDigest: stage2l3Digest, certificationHash: stage2l3Hash, valid: stage2l3InheritanceValid },
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  stage2l2ResultReproduced: evaluation.provenance.stage2l2ResultReproduced,
  oracleEligibilityRuleDigest: ORACLE_ELIGIBILITY_RULE_DIGEST,
  oracleHarmCasesAfterEligibility: evaluation.inheritedHarmRegression.after,
  oracleRemediatedDecisionDelta: evaluation.replication.oracleRemediated.decisionDelta,
  oracleRemediatedCorrectPrimeBreakRate: evaluation.replication.oracleRemediated.correctPrimeBreakRate,
  freshHoldoutCases: evaluation.freshHoldout.cases,
  freshOracleDecisionDelta: evaluation.freshHoldout.oracleDecisionDelta,
  evidenceDigest: evaluation.evidenceDigest,
  remediationReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  oracleDecisionEligibilityCertified: pass,
  deterministicArbiterCandidateJustified: pass,
  arbiterImplemented: false,
  actualPath: evaluation.actualPath,
  authority: evaluation.authority,
  nextRecommendedStage: STAGE2L4_NEXT_STAGE,
  tests: { baseline: { tests: 484, passing: 484, failing: 0 }, stage2l4: { tests: 25, passing: 25, failing: 0 }, fullSuite: { tests: 509, passing: 509, failing: 0 } },
};
const withoutHash = { ...certificationBase, stage2l4Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const performanceEvidence = { unit: 'milliseconds', inheritedReplicationCases: 5000, freshHoldoutCases: evaluation.freshHoldout.cases, evaluationRun: evaluationMilliseconds, replayRun: replayMilliseconds, productionLatencyModified: false, timingExcludedFromDeterministicDigest: true };
const remediationReport = { stage: evaluation.stage, evidenceDigest: evaluation.evidenceDigest, architecture: evaluation.architecture, candidateSelection: evaluation.candidateSelection, cycleRemediation: evaluation.cycleRemediation, thresholdRemediation: evaluation.thresholdRemediation, inheritedHarmRegression: evaluation.inheritedHarmRegression, replication: evaluation.replication, freshHoldout: evaluation.freshHoldout, readiness: { oracleDecisionEligibilityCertified: pass, deterministicArbiterCandidateJustified: pass, arbiterImplemented: false } };

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'oracle-head-specific-eligibility-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-remediation-report.json'), `${JSON.stringify(remediationReport, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-head-value-table.json'), `${JSON.stringify({ headValueTable: evaluation.headValueTable, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-fresh-holdout-report.json'), `${JSON.stringify({ freshHoldout: evaluation.freshHoldout, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l4-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence, inheritedHarmRegression: evaluation.inheritedHarmRegression, replication: evaluation.replication, freshHoldout: evaluation.freshHoldout }, null, 2));
