#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../src/core/determinism.js';
import { verifyDeclaredRuntime } from '../src/lab/stage2f-successor-identity.js';
import { buildStage2H4Evaluation } from '../src/lab/stage2h4-value-only-diagnostics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const successor = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (name) => JSON.parse(await readFile(name));
const [baseline, runtime, campaign, g, h, h1, h3] = await Promise.all([
  'baseline-manifest.json', 'canonical-runtime-identity.json', 'stage2f-campaign-manifest.json',
].map((name) => readJson(path.join(successor, name))).concat([
  'stage2g-experts-successor/stage2g-certification-result.json',
  'stage2h-prime-context-successor/stage2h-certification-result.json',
  'stage2h1-action-context-successor/stage2h1-certification-result.json',
  'stage2h3-calibration/stage2h3-certification-result.json',
].map((name) => readJson(path.join(root, 'artifacts', name)))));

const runtimeVerification = await verifyDeclaredRuntime({ baseline, runtimeIdentity: runtime, sentinelRoot: path.resolve(root, '../..'), zeknovaRoot: process.env.ZEKNOVA_ROOT ?? null });
if (!runtimeVerification.declaredEqualsMeasured) throw new Error('STAGE2H4_BLOCKED_BY_RUNTIME_DRIFT');
if (!g.stage2gCertified || !h.stage2hCertified || !h1.stage2h1Certified || !h3.stage2h3Certified) throw new Error('STAGE2H4_BLOCKED_BY_SUCCESSOR_CHAIN');
if (g.certificationHash !== '31271de552ff93c35bba0df0cc55f538ef371282c71badd0398e9437a065961e' || h.certificationHash !== '919c5f54ace8b4917bf1cac94eea9c03ee6eadecad8906d9238c384a2b894ec8' || h1.certificationHash !== 'b5e13db14cefdb00164da8781e9a628ff93b4007d93658f6b68b39c9111799ff' || h3.certificationHash !== 'b0245dd4df4577142399532be41dfe126989014d5a54dcddab14f694ad04d05a') throw new Error('STAGE2H4_BLOCKED_BY_PROVENANCE_HASH');

const timed = [];
for (let index = 0; index < 7; index += 1) { const start = performance.now(); buildStage2H4Evaluation({ campaignManifest: campaign }); timed.push(performance.now() - start); }
const evaluation = buildStage2H4Evaluation({ campaignManifest: campaign });
const replayEquivalent = sha256(buildStage2H4Evaluation({ campaignManifest: campaign })) === sha256(evaluation);
const median = [...timed].sort((a, b) => a - b)[Math.floor(timed.length / 2)];
const performanceEvidence = { methodology: '7_COMPLETE_CORPUS_RUNS_MEDIAN_WALL_CLOCK', primeOnlyMedianRuntime: null, primePlusDiagnosticsMedianRuntimeMs: Number(median.toFixed(3)), diagnosticRuntimeOverhead: null, note: 'Existing corpus builder executes all comparison arms; isolated Prime timing is not fabricated.' };
const platformDigest = evaluation.evaluationDigest;
const externalPlatforms = process.env.STAGE2H4_EXTERNAL_PLATFORMS ? JSON.parse(process.env.STAGE2H4_EXTERNAL_PLATFORMS) : [];
const measuredPlatforms = [{ platform: process.platform, arch: process.arch, nodeVersion: process.version, digest: platformDigest }, ...externalPlatforms];
const requiredPlatforms = new Set(measuredPlatforms.map(({ platform, arch }) => `${platform}/${arch}`));
const allPlatformsMeasured = ['darwin/arm64', 'linux/arm64', 'linux/x64'].every((name) => requiredPlatforms.has(name));
const crossPlatformDigestMatch = allPlatformsMeasured && measuredPlatforms.every(({ digest }) => digest === platformDigest);
const portability = { digest: platformDigest, measuredPlatforms, crossPlatformDigestMatch, portabilityStatus: crossPlatformDigestMatch ? 'PASS' : 'PENDING_EXTERNAL_MEASUREMENTS' };
const base = { certificationSchemaVersion: 1, stage: evaluation.stage, status: evaluation.quality.pass ? 'PASS' : 'FAIL', activeWriter: 'CODEX', concurrentWriterDetected: false, successorRuntimeIdentity: runtime.sentinelRuntimeId, successorCampaignId: campaign.stage2fCampaignId, measuredRuntimeIdentity: runtimeVerification.measuredRuntimeIdentity, declaredEqualsMeasuredRuntimeIdentity: runtimeVerification.declaredEqualsMeasured, stage2gSuccessorCertified: g.stage2gCertified, stage2hSuccessorCertified: h.stage2hCertified, stage2h1SuccessorCertified: h1.stage2h1Certified, stage2h3Certified: h3.stage2h3Certified, evaluationDigest: evaluation.evaluationDigest, diagnosticQualityGatePass: evaluation.quality.pass, replayEquivalent, portabilityStatus: portability.portabilityStatus, expertActionSelectionApproved: false, valueOnlyDiagnosticCandidateCertified: false, authority: evaluation.authority, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 };
const certification = { ...base, stage2h4Certified: false, certificationHash: sha256({ ...base, stage2h4Certified: false }) };
const output = path.join(root, 'artifacts/stage2h4-value-only-diagnostics'); await mkdir(output, { recursive: true });
await Promise.all([
  writeFile(path.join(output, 'diagnostic-evidence.json'), `${JSON.stringify(evaluation, null, 2)}\n`),
  writeFile(path.join(output, 'stage2h4-certification-result.json'), `${JSON.stringify(certification, null, 2)}\n`),
  writeFile(path.join(output, 'stage2h4-portability-report.json'), `${JSON.stringify(portability, null, 2)}\n`),
  writeFile(path.join(output, 'stage2h4-performance-report.json'), `${JSON.stringify(performanceEvidence, null, 2)}\n`),
]);
console.log(JSON.stringify({ evaluation, certification, portability, performance: performanceEvidence }, null, 2));
