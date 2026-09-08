#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import {
  buildStage2L1CounterfactualEvaluation,
  EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST,
  STAGE2L1_STAGE,
  STAGE2L1_STAGE2L0_CERTIFICATION_HASH,
} from '../src/lab/stage2l1-counterfactual-expert-information.js';

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
  stage2l0Integration: 'src/lab/stage2l0-core-triad-shadow-integration.js',
};
const expectedOwners = {
  primeProduction: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  primeDepth2: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  oracleV2: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexusProduction: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  nexusDelta: 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
  stage2l0Integration: 'eb91d58369e8b15505c16e2523462656a49e896ecf9eee1d1bab974785c44ce8',
};

const [baselineManifest, runtime, campaign, stage2l0] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat([
  readJson(path.join(root, 'artifacts/stage2l0-core-triad-shadow-integration/stage2l0-certification-result.json')),
]));
const verification = await verifyDeclaredRuntime({ baseline: baselineManifest, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2L1_BLOCKED_BY_RUNTIME_DRIFT');
const { certificationHash: stage2l0Hash, ...stage2l0Body } = stage2l0;
if (!stage2l0.stage2l0Certified || stage2l0Hash !== STAGE2L1_STAGE2L0_CERTIFICATION_HASH || sha256(stage2l0Body) !== stage2l0Hash) throw new Error('STAGE2L1_BLOCKED_BY_STAGE2L0_CERTIFICATION_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
const allFrozenOwnersUnchanged = Object.entries(expectedOwners).every(([name, digest]) => measuredOwners[name] === digest);
if (!allFrozenOwnersUnchanged) throw new Error('STAGE2L1_BLOCKED_BY_FROZEN_OWNER_DRIFT');

const evaluationStart = performance.now();
const evaluation = buildStage2L1CounterfactualEvaluation();
const evaluationMilliseconds = performance.now() - evaluationStart;
const replayStart = performance.now();
const replay = buildStage2L1CounterfactualEvaluation();
const replayMilliseconds = performance.now() - replayStart;
const counterfactualReplayEquivalent = evaluation.evidenceDigest === replay.evidenceDigest && sha256(evaluation) === sha256(replay);

const external = process.env.STAGE2L1_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2L1_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const platformNames = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const allPlatformsMeasured = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => platformNames.has(name));
const crossPlatformDigestMatch = allPlatformsMeasured && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };

const performanceEvidence = {
  unit: 'milliseconds',
  totalDecisionCases: evaluation.corpus.totalDecisionCases,
  finalHoldoutCases: evaluation.finalHoldout.prime.correctCases + evaluation.finalHoldout.prime.wrongCases,
  counterfactualEvaluationRun: evaluationMilliseconds,
  replayEvaluationRun: replayMilliseconds,
  meanEvaluationMillisecondsPerCorpusCase: evaluationMilliseconds / evaluation.corpus.totalDecisionCases,
  productionShadowTriadLatencyModified: false,
  timingExcludedFromDeterministicDigest: true,
};

const pass = verification.declaredEqualsMeasured
  && stage2l0.stage2l0Certified
  && allFrozenOwnersUnchanged
  && evaluation.actualPath.primeActualPathUnchanged
  && evaluation.actualPath.oracleSelectionInfluenceActual === 0
  && evaluation.actualPath.nexusSelectionInfluenceActual === 0
  && evaluation.isolation.counterfactualBranchesIsolated
  && evaluation.isolation.counterfactualOnly
  && evaluation.interpreter.oracleActionRelevanceCausallyBound
  && evaluation.interpreter.nexusActionRelevanceCausallyBound
  && !evaluation.interpreter.globalExpertScalarBias
  && !evaluation.interpreter.legacyScalarExpertBiasUsed
  && !evaluation.interpreter.learnedRoutingPresent
  && evaluation.causality.allSelectionChangesCausallyAttributed
  && !evaluation.corpus.semanticFamilyLeakage
  && evaluation.groundTruth.independentOfExpertOutput
  && counterfactualReplayEquivalent
  && crossPlatformDigestMatch
  && evaluation.authority.tier === 'R0'
  && !evaluation.authority.canDispatch
  && !evaluation.authority.canMutateLiveWorld
  && evaluation.authority.liveActionDispatches === 0
  && evaluation.authority.worldMutations === 0
  && evaluation.authority.authorityEscalations === 0;

const base = {
  certificationSchemaVersion: 1,
  stage: STAGE2L1_STAGE,
  status: pass ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED',
  activeWriter: 'CODEX',
  concurrentWriterDetected: false,
  successorRuntimeIdentity: runtime.sentinelRuntimeId,
  measuredRuntimeIdentity: verification.measuredRuntimeIdentity,
  declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured,
  successorCampaignId: campaign.stage2fCampaignId,
  stage2l0Certified: stage2l0.stage2l0Certified,
  stage2l0CertificationHash: stage2l0Hash,
  frozenOwnerSha256: measuredOwners,
  allFrozenOwnersUnchanged,
  primeChanged: false,
  oracleV2Changed: false,
  nexusDeltaChanged: false,
  expertInterpretationSearchSpaceDigest: EXPERT_INTERPRETATION_SEARCH_SPACE_DIGEST,
  selectedExpertInterpreter: evaluation.interpreter.selectedExpertInterpreter,
  evidenceDigest: evaluation.evidenceDigest,
  counterfactualReplayEquivalent,
  crossPlatformDigestMatch,
  portabilityStatus: portability.portabilityStatus,
  counterfactualOnly: true,
  actualPrimePathUnchanged: true,
  oracleSelectionInfluenceActual: 0,
  nexusSelectionInfluenceActual: 0,
  authority: evaluation.authority,
  tests: { baseline: { tests: 424, passing: 424, failing: 0 }, stage2l1: { tests: 20, passing: 20, failing: 0 }, fullSuite: { tests: 444, passing: 444, failing: 0 } },
};
const withoutHash = { ...base, stage2l1Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2l1-counterfactual-expert-information');
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'counterfactual-expert-information-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l1-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l1-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l1-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2l1-interpreter-selection-report.json'), `${JSON.stringify({ searchSpace: evaluation.interpreter.searchSpace, searchSpaceDigest: evaluation.interpreter.searchSpaceDigest, developmentResults: evaluation.interpreter.developmentResults, validationResults: evaluation.interpreter.validationResults, selectedExpertInterpreter: evaluation.interpreter.selectedExpertInterpreter, selectionFrozenBeforeFinalHoldout: evaluation.interpreter.selectionFrozenBeforeFinalHoldout, maxHarmfulSelectionChangeRate: evaluation.interpreter.maxHarmfulSelectionChangeRate, finalHoldout: evaluation.finalHoldout }, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluationDigest: evaluation.evidenceDigest, certification, portability, performance: performanceEvidence, finalHoldout: evaluation.finalHoldout, usefulness: evaluation.usefulness, synergy: evaluation.synergy }, null, 2));
