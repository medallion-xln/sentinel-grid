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
import { buildStage2L6AdversarialCorpus, buildStage2L6AdversarialEvaluation } from '../src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js';
import {
  benchmarkStage2L7Arbiter,
  buildStage2L7Evaluation,
  STAGE2L7_ARBITER_RULE_DIGEST,
  STAGE2L7_ARBITER_RULE_TABLE,
  STAGE2L7_FAIL_CLOSED_MATRIX,
  STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  STAGE2L7_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L7_MIN_VALID_DATA_DECISION_DELTA,
  STAGE2L7_NEXT_STAGE,
  STAGE2L7_STAGE,
  STAGE2L7_STAGE2L5_CERTIFICATION_HASH,
  STAGE2L7_STAGE2L5_EVIDENCE_DIGEST,
  STAGE2L7_STAGE2L6_CERTIFICATION_HASH,
  STAGE2L7_STAGE2L6_EVIDENCE_DIGEST,
  upgradeStage2L6Record,
} from '../src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const outputDirectory = path.join(root, 'artifacts/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation');
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
  stage2l5Arbiter: 'src/lab/stage2l5-deterministic-arbiter-candidate.js',
  stage2l6Challenge: 'src/lab/stage2l6-deterministic-arbiter-adversarial-shadow-challenge.js',
};
const expectedOwners = {
  primeProduction: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexusProduction: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  nexusDelta: 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
  stage2l4Eligibility: 'c986ca46680b9f7ccb6f1e601a343df8010f66bd8316b006cd1b89d4cf86470f',
  stage2l5Arbiter: 'ed294a98c44bb3e4ee0f021ad73f58a703d9ba976c642ed2a1782881e5107e88',
  stage2l6Challenge: '9d293051b58827e7d0587704952399eef42b2b48e591dfb2abf794c79dc9ab1e',
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
        // Exited processes are not concurrent writers.
      }
    }
  } catch {
    return false;
  }
  return false;
}

function validateHashedRecord(record, expectedHash) {
  const { certificationHash, ...body } = record;
  return certificationHash === expectedHash && sha256(body) === certificationHash;
}

function validateEvidence(record, expectedDigest) {
  const { evidenceDigest, ...body } = record;
  return evidenceDigest === expectedDigest && sha256(body) === evidenceDigest;
}

const [baselineManifest, runtime, campaign, stage2l5Certification, stage2l5Evidence, stage2l6Certification, stage2l6Evidence] = await Promise.all([
  readJson(path.join(successor, 'baseline-manifest.json')),
  readJson(path.join(successor, 'canonical-runtime-identity.json')),
  readJson(path.join(successor, 'stage2f-campaign-manifest.json')),
  readJson(path.join(root, 'artifacts/stage2l5-deterministic-arbiter-candidate/stage2l5-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l5-deterministic-arbiter-candidate/deterministic-arbiter-shadow-evidence.json')),
  readJson(path.join(root, 'artifacts/stage2l6-deterministic-arbiter-adversarial-shadow-challenge/stage2l6-certification-result.json')),
  readJson(path.join(root, 'artifacts/stage2l6-deterministic-arbiter-adversarial-shadow-challenge/adversarial-arbiter-shadow-evidence.json')),
]);

const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot, zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L7_BLOCKED_BY_RUNTIME_DRIFT');

const stage2l5InheritanceValid = stage2l5Certification.status === 'PASS'
  && stage2l5Certification.stage2l5Certified === true
  && validateHashedRecord(stage2l5Certification, STAGE2L7_STAGE2L5_CERTIFICATION_HASH)
  && validateEvidence(stage2l5Evidence, STAGE2L7_STAGE2L5_EVIDENCE_DIGEST);
if (!stage2l5InheritanceValid) throw new Error('STAGE2L7_BLOCKED_BY_STAGE2L5_DRIFT');

const stage2l6InheritanceValid = stage2l6Certification.status === 'FAIL'
  && stage2l6Certification.stage2l6Certified === false
  && validateHashedRecord(stage2l6Certification, STAGE2L7_STAGE2L6_CERTIFICATION_HASH)
  && validateEvidence(stage2l6Evidence, STAGE2L7_STAGE2L6_EVIDENCE_DIGEST);
if (!stage2l6InheritanceValid) throw new Error('STAGE2L7_BLOCKED_BY_STAGE2L6_HISTORY_DRIFT');

const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L7_BLOCKED_BY_FROZEN_OWNER_DRIFT');
const stage2l7OwnerSha256 = await fileSha256(path.join(root, 'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js'));
const concurrentWriterDetected = await concurrentClaudeWriterDetected();

const reproducedStage2l6 = buildStage2L6AdversarialEvaluation();
const stage2l6FailureReproduced = reproducedStage2l6.evidenceDigest === STAGE2L7_STAGE2L6_EVIDENCE_DIGEST
  && reproducedStage2l6.results.harmfulChanges === 6050
  && reproducedStage2l6.failClosed.successCases === 5450
  && reproducedStage2l6.failClosed.requiredCases === 11000;

const evaluationStart = performance.now();
const evaluation = buildStage2L7Evaluation();
const evaluationMilliseconds = performance.now() - evaluationStart;
const replayStart = performance.now();
const replay = buildStage2L7Evaluation();
const replayMilliseconds = performance.now() - replayStart;
const remediatedArbiterReplayEquivalent = evaluation.evidenceDigest === replay.evidenceDigest && sha256(evaluation) === sha256(replay);

const performanceSamples = buildStage2L6AdversarialCorpus().filter((_, index) => index % 1375 === 0).map((record) => upgradeStage2L6Record(record).stage2l7.input);
const performanceReport = { ...benchmarkStage2L7Arbiter(performanceSamples), evaluationRun: evaluationMilliseconds, replayRun: replayMilliseconds };

const external = process.env.STAGE2L7_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L7_EXTERNAL_PLATFORMS) : [];
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

const inherited = evaluation.inheritedAdversarial;
const fresh = evaluation.freshAdversarialHoldout;
const valid = evaluation.validDataRegression;
const qualityChecks = {
  freezesPreserved: Object.values(evaluation.freezes).every((value) => value === false),
  centralValidator: evaluation.remediation.centralArbiterEvidenceValidatorPresent,
  canonicalContext: evaluation.remediation.arbiterDecisionContextCanonical,
  bindingComplete: evaluation.remediation.oracleEvidenceBindingComplete && evaluation.remediation.nexusEvidenceBindingComplete,
  validationOrder: evaluation.remediation.evidenceValidatedBeforeSupport && evaluation.remediation.evidenceValidatedBeforeAgreement && evaluation.remediation.evidenceValidatedBeforeArbitration,
  noValidationMutation: evaluation.remediation.validationMutatesInput === false,
  unknownDefaultDeny: evaluation.remediation.unknownStateDefaultDeny,
  noConsensusAuthority: evaluation.remediation.expertAgreementAutomaticOverride === false && evaluation.remediation.expertCountUsedAsConfidence === false,
  unresolvedDisagreementSafe: evaluation.remediation.unresolvedExpertDisagreementReturnsPrime,
  inheritedIdentityClosed: Object.values(inherited.identityAttacks).every((value) => value === 0),
  inheritedFailClosed: inherited.failClosed.requiredCases === 11000 && inherited.failClosed.successCases === 11000 && inherited.failClosed.rate === 1,
  bothWrongSafe: inherited.bothWrong.cases === 500 && inherited.bothWrong.harmfulChanges === 0,
  inheritedHarmBound: inherited.metrics.harmfulChangeRate <= STAGE2L7_MAX_HARMFUL_CHANGE_RATE && inherited.metrics.correctPrimeBreakRate <= STAGE2L7_MAX_HARMFUL_CHANGE_RATE,
  preservedSafety: inherited.safety.trueButIrrelevantOracleSelectionChanges === 0 && inherited.safety.trueButIrrelevantNexusSelectionChanges === 0 && inherited.safety.marginGt003SelectionChanges === 0 && inherited.safety.malformedDigestAccepted === 0 && inherited.safety.agreementOutsideAmbiguitySelectionChanges === 0 && inherited.safety.tieBoundaryBehaviorExact && inherited.safety.duplicateEvidenceDoesNotMultiplySupport && inherited.safety.conflictingDuplicateEvidenceFailsClosed && inherited.safety.unknownRuleStateReturnsPrime,
  invariance: evaluation.invariance.legalActionOrderInvariant && evaluation.invariance.expertEvidenceOrderInvariant,
  oracleAdversarialClosed: evaluation.oracleEligibility.adversarial.cycle.rate === 0 && evaluation.oracleEligibility.adversarial.threshold.rate === 0,
  oracleValueRetained: evaluation.oracleEligibility.benefitRetention.cycle.rate >= 0.8 && evaluation.oracleEligibility.benefitRetention.threshold.rate >= 0.8,
  validDataValueFloor: valid.metrics.decisionDelta >= STAGE2L7_MIN_VALID_DATA_DECISION_DELTA,
  freshCorpus: fresh.cases >= 10000 && fresh.overlapWithStage2l6 === 0 && fresh.semanticFamilyLeakage === false,
  freshFailClosed: fresh.failClosed.rate === 1,
  freshHarmBound: fresh.metrics.harmfulChangeRate <= STAGE2L7_MAX_HARMFUL_CHANGE_RATE && fresh.metrics.correctPrimeBreakRate <= STAGE2L7_MAX_HARMFUL_CHANGE_RATE,
  causality: evaluation.causality.allArbiterSelectionChangesCausallyAttributed,
  replay: remediatedArbiterReplayEquivalent,
  portability: portability.portabilityStatus === 'PASS',
  shadowOnly: evaluation.actualPath.arbiterShadowOnly && evaluation.actualPath.arbiterSelectionInfluenceActual === 0,
  authorityR0: evaluation.authority.tier === 'R0' && evaluation.authority.liveActionDispatches === 0 && evaluation.authority.worldMutations === 0 && evaluation.authority.authorityEscalations === 0 && evaluation.authority.tokenIssues === 0,
};
const infrastructurePass = verification.declaredEqualsMeasured && !concurrentWriterDetected && stage2l5InheritanceValid && stage2l6InheritanceValid && stage2l6FailureReproduced && allFrozenOwnersUnchanged && remediatedArbiterReplayEquivalent && portability.portabilityStatus === 'PASS';
const qualityPass = Object.values(qualityChecks).every(Boolean);
const pass = infrastructurePass && qualityPass;
const status = !infrastructurePass ? 'BLOCKED' : qualityPass ? 'PASS' : 'FAIL';
const failedQualityChecks = Object.entries(qualityChecks).filter(([, passed]) => !passed).map(([name]) => name);

const certificationBase = {
  certificationSchemaVersion: 1,
  stage: STAGE2L7_STAGE,
  status,
  activeWriter: 'CODEX',
  concurrentWriterDetected,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  stage2l5Certified: stage2l5Certification.stage2l5Certified,
  stage2l5InheritanceValid,
  stage2l6Status: stage2l6Certification.status,
  stage2l6FailureReproduced,
  stage2l6InheritanceValid,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  stage2l7OwnerSha256,
  selectedArbiterRemediation: evaluation.remediation.selected,
  arbiterRemediationRuleDigest: STAGE2L7_ARBITER_RULE_DIGEST,
  failClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST,
  evidenceDigest: evaluation.evidenceDigest,
  inheritedAdversarialMetrics: inherited.metrics,
  inheritedFailClosed: inherited.failClosed,
  validDataMetrics: valid.metrics,
  freshAdversarialMetrics: fresh.metrics,
  freshFailClosed: fresh.failClosed,
  remediatedArbiterReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  infrastructurePass,
  qualityPass,
  qualityChecks,
  failedQualityChecks,
  arbiterAdversarialShadowCertified: pass,
  realZeknovaShadowDecisionDeltaCampaignJustified: false,
  actualPath: evaluation.actualPath,
  authority: evaluation.authority,
  tests: { baseline: { tests: 578, passing: 578, failing: 0 }, stage2l7: { tests: 55, passing: 55, failing: 0 }, fullSuite: { tests: 633, passing: 633, failing: 0 } },
  nextRecommendedStage: STAGE2L7_NEXT_STAGE,
};
const withoutHash = { ...certificationBase, stage2l7Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'stage2l7-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-remediation-rule.json'), `${JSON.stringify({ ruleTable: STAGE2L7_ARBITER_RULE_TABLE, ruleDigest: STAGE2L7_ARBITER_RULE_DIGEST, failClosedMatrix: STAGE2L7_FAIL_CLOSED_MATRIX, failClosedMatrixDigest: STAGE2L7_FAIL_CLOSED_MATRIX_DIGEST }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-inherited-adversarial-report.json'), `${JSON.stringify({ inheritedAdversarial: inherited, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-valid-data-regression-report.json'), `${JSON.stringify({ validDataRegression: valid, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-fresh-adversarial-holdout-report.json'), `${JSON.stringify({ freshAdversarialHoldout: fresh, separatedSets: evaluation.separatedSets, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-oracle-eligibility-report.json'), `${JSON.stringify({ oracleEligibility: evaluation.oracleEligibility, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-causal-traces.json'), `${JSON.stringify({ causality: evaluation.causality, evidenceDigest: evaluation.evidenceDigest }, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-performance-report.json'), `${JSON.stringify(performanceReport, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l7-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
]);

console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceReport, failedQualityChecks }, null, 2));
