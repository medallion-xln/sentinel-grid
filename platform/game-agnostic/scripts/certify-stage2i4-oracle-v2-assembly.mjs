#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { evaluateOracle } from '../src/experts/oracle.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { assembleOracleV2, buildOracleV2Holdout, buildStage2I4OracleV2Certification, STAGE2I4_STAGE2I3C_CERTIFICATION_HASH, STAGE2I4_STAGE2I3C_EVIDENCE_DIGEST, STAGE2I4_STAGE2I3C_OWNER_SHA256 } from '../src/lab/stage2i4-oracle-v2-assembly.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (target) => JSON.parse(await readFile(target, 'utf8'));
const fileSha256 = async (target) => createHash('sha256').update(await readFile(target)).digest('hex');
const certFiles = {
  stage2i0: 'artifacts/stage2i0-capability-baseline/stage2i0-certification-result.json',
  stage2i2: 'artifacts/stage2i2-oracle-task-head-diagnostic/stage2i2-certification-result.json',
  stage2i3b: 'artifacts/stage2i3b-regime-recall-diagnostic/stage2i3b-certification-result.json',
  stage2i3c: 'artifacts/stage2i3c-dimension-aware-regime-composition/stage2i3c-certification-result.json',
};
const ownerPaths = { prime: 'src/prime/root-puct.js', oracleV1: 'src/experts/oracle.js', nexus: 'src/experts/nexus.js', stage2i2: 'src/lab/stage2i2-oracle-task-head-diagnostic.js', stage2i3: 'src/lab/stage2i3-oracle-head-remediation.js', stage2i3c: 'src/lab/stage2i3c-dimension-aware-regime-composition.js' };
const expectedOwners = { prime: '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc', oracleV1: 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a', nexus: '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144', stage2i2: 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf', stage2i3: 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9', stage2i3c: STAGE2I4_STAGE2I3C_OWNER_SHA256 };

const [baseline, runtime, campaign, stage2i0, stage2i2, stage2i3b, stage2i3c] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((file) => readJson(path.join(successor, file))).concat(Object.values(certFiles).map((file) => readJson(path.join(root, file)))));
const verification = await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!verification.declaredEqualsMeasured) throw new Error('STAGE2I4_BLOCKED_BY_RUNTIME_DRIFT');
if (!stage2i0.stage2i0Certified || !stage2i2.stage2i2Certified || !stage2i3b.stage2i3bCertified || !stage2i3c.stage2i3cCertified || stage2i3c.certificationHash !== STAGE2I4_STAGE2I3C_CERTIFICATION_HASH || stage2i3c.evidenceDigest !== STAGE2I4_STAGE2I3C_EVIDENCE_DIGEST) throw new Error('STAGE2I4_BLOCKED_BY_INHERITED_CERTIFICATION_DRIFT');
const measuredOwners = Object.fromEntries(await Promise.all(Object.entries(ownerPaths).map(async ([name, target]) => [name, await fileSha256(path.join(root, target))])));
if (Object.entries(expectedOwners).some(([name, digest]) => measuredOwners[name] !== digest)) throw new Error('STAGE2I4_BLOCKED_BY_FROZEN_HEAD_DRIFT');

const evaluation = buildStage2I4OracleV2Certification();
const replayEquivalent = sha256(buildStage2I4OracleV2Certification()) === sha256(evaluation);
const external = process.env.STAGE2I4_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2I4_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: evaluation.evidenceDigest }, ...external];
const names = new Set(measuredPlatforms.map((entry) => `${entry.platform}/${entry.arch}`));
const complete = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => names.has(name));
const crossPlatformDigestMatch = complete && measuredPlatforms.every((entry) => entry.digest === evaluation.evidenceDigest);
const portability = { digest: evaluation.evidenceDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };

const sample = buildOracleV2Holdout().find((entry) => entry.task === 'direction');
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const benchmark = (fn) => { const values = []; for (let index = 0; index < 51; index += 1) { const start = performance.now(); fn(); values.push(performance.now() - start); } return median(values); };
const oracleV1MedianRuntimeMs = benchmark(() => evaluateOracle(sample));
const oracleV2MedianRuntimeMs = benchmark(() => assembleOracleV2(sample));
const [oracleV1Source, oracleV2Source] = await Promise.all([readFile(path.join(root, 'src/experts/oracle.js'), 'utf8'), readFile(path.join(root, 'src/lab/stage2i4-oracle-v2-assembly.js'), 'utf8')]);
const performanceEvidence = { unit: 'milliseconds', oracleV1MedianRuntime: oracleV1MedianRuntimeMs, oracleV2MedianRuntime: oracleV2MedianRuntimeMs, oracleV2RuntimeOverheadOrSavings: oracleV2MedianRuntimeMs - oracleV1MedianRuntimeMs, oracleV1SourceLoc: oracleV1Source.trimEnd().split('\n').length, oracleV2SourceLoc: oracleV2Source.trimEnd().split('\n').length };

const pass = evaluation.frozenHeads.allUnchanged && evaluation.architecture.modular && !evaluation.architecture.actionMappingPresent && !evaluation.corpus.semanticFamilyLeakage && evaluation.semanticConsistency.contradictions === 0 && evaluation.semanticConsistency.outputConflictRate === 0 && evaluation.tasks.taskMean >= .85 && evaluation.tasks.reversal.accuracy >= .8 && evaluation.tasks.regimeChange.accuracy >= .8 && evaluation.temporalValue.oracleV2TemporalIncrementalValue > 0 && evaluation.baselines.beatsAllSimpleBaselines && evaluation.crossHeadCausality.valid && evaluation.capability.oracleV2Score >= 7 && evaluation.capability.gate7Pass && replayEquivalent && portability.portabilityStatus === 'PASS' && !evaluation.production.oracleProductionReplaced && !evaluation.production.oracleV2ProductionPromoted && !evaluation.production.primeChanged && !evaluation.production.nexusChanged && evaluation.safety.expertSelectionInfluence === 0 && !evaluation.safety.expertActionSelectionApproved && evaluation.safety.authority.tier === 'R0';
const base = { certificationSchemaVersion: 1, stage: evaluation.stage, status: pass ? 'PASS' : portability.portabilityStatus === 'PASS' ? 'FAIL' : 'BLOCKED', activeWriter: 'CODEX', concurrentWriterDetected: false, successorRuntimeIdentity: runtime.sentinelRuntimeId, measuredRuntimeIdentity: verification.measuredRuntimeIdentity, declaredEqualsMeasuredRuntimeIdentity: verification.declaredEqualsMeasured, successorCampaignId: campaign.stage2fCampaignId, inheritedCertified: { stage2i0: stage2i0.stage2i0Certified, stage2i2: stage2i2.stage2i2Certified, stage2i3b: stage2i3b.stage2i3bCertified, stage2i3c: stage2i3c.stage2i3cCertified }, stage2i3cCertificationHash: stage2i3c.certificationHash, frozenOwnerSha256: measuredOwners, allFrozenHeadsUnchanged: evaluation.frozenHeads.allUnchanged, oracleV2CapabilityScore: evaluation.capability.oracleV2Score, oracleV27Of10GatePass: evaluation.capability.gate7Pass, evidenceDigest: evaluation.evidenceDigest, replayEquivalent, portabilityStatus: portability.portabilityStatus, performance: performanceEvidence, oracleProductionReplaced: false, oracleV2ProductionPromoted: false, primeChanged: false, nexusChanged: false, expertSelectionInfluence: 0, expertActionSelectionApproved: false, authority: evaluation.safety.authority, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 };
const withoutHash = { ...base, stage2i4Certified: pass };
const certification = { ...withoutHash, certificationHash: sha256(withoutHash) };
const outputDirectory = path.join(root, 'artifacts/stage2i4-oracle-v2-assembly'); await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'oracle-v2-aggregate-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'oracle-v2-sample-assessment.json'), `${JSON.stringify(assembleOracleV2(sample), null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i4-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i4-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(outputDirectory, 'stage2i4-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability, performance: performanceEvidence }, null, 2));
