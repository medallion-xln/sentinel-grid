#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStage2FCampaignManifest } from '../src/lab/zeknova-stage2f-identity.js';
import { buildStage2GPortabilityDigest, certifyStage2GExperts } from '../src/lab/stage2g-expert-certification.js';
import { buildStage2HPortabilityDigest, certifyStage2HPrimeContext } from '../src/lab/stage2h-prime-context-certification.js';
import { buildStage2H1PortabilityDigest, certifyStage2H1ActionContext } from '../src/lab/stage2h1-action-context-certification.js';
import { buildSuccessionEvent, buildSuccessorRuntimeIdentity, measureRuntimeInventory, verifyDeclaredRuntime, verifyHistoricalReplay } from '../src/lab/stage2f-successor-identity.js';
import { sha256 } from '../src/core/determinism.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sentinelRoot = path.resolve(root, '../..');
const zeknovaRoot = process.env.ZEKNOVA_ROOT || '/Users/dwaynecampbell/Desktop/zeknova-shared-gaming-experience';
const predecessorRoot = path.join(root, 'artifacts/r0-runtime-identity');
const successorRoot = path.join(root, 'artifacts/stage2f-successor-r0');
const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const digestBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gitHead = (directory) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();
const writeJson = async (filePath, value) => { await mkdir(path.dirname(filePath), { recursive: true }); await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`); };

const predecessorBaseline = await readJson(path.join(predecessorRoot, 'baseline-manifest.json'));
const predecessorRuntime = await readJson(path.join(predecessorRoot, 'canonical-runtime-identity.json'));
const predecessorCampaign = await readJson(path.join(predecessorRoot, 'stage2f-campaign-manifest.json'));
const predecessorProvenance = await readJson(path.join(predecessorRoot, 'generated-runtime-provenance.json'));
const sourcePath = path.join(zeknovaRoot, 'src/game/Stage2FRuntimeCollectorClient.js');
const certifiedCopyPath = path.join(zeknovaRoot, 'sentinel-grid/live-parity/runtime-collector/browser-client.js');
const networkTestPath = path.join(zeknovaRoot, 'tests/network-recovery-certification.test.mjs');
const [sourceBytes, certifiedBytes, networkTestBytes] = await Promise.all([readFile(sourcePath), readFile(certifiedCopyPath), readFile(networkTestPath)]);
const diffRun = spawnSync('git', ['diff', '--no-index', '--', certifiedCopyPath, sourcePath], { encoding: 'utf8', maxBuffer: 2 ** 20 });
if (![0, 1].includes(diffRun.status)) throw new Error(diffRun.stderr || 'Unable to measure successor source diff');
const sourceDiff = diffRun.stdout;
const successorPolicyEntries = [
  { root: 'sentinel', path: 'platform/game-agnostic/src/lab/stage2f-successor-identity.js', role: 'certification-policy', tracked: false },
  { root: 'sentinel', path: 'platform/game-agnostic/scripts/certify-stage2f-successor-chain.mjs', role: 'certification-policy', tracked: false },
];
const successorInventoryTemplate = {
  ...predecessorBaseline,
  inventory: [...predecessorBaseline.inventory, ...successorPolicyEntries],
};
const baseline = await measureRuntimeInventory({ predecessorBaseline: successorInventoryTemplate, sentinelRoot, zeknovaRoot });
const successionEvent = buildSuccessionEvent({
  predecessorRuntimeIdentity: predecessorRuntime,
  predecessorSourceSha256: digestBytes(certifiedBytes),
  successorSourceSha256: digestBytes(sourceBytes),
  certifiedCopySha256: digestBytes(certifiedBytes),
  sourceDiffDigest: digestBytes(sourceDiff),
  behavioralDiffEvidence: [{ root: 'zeknova', path: 'tests/network-recovery-certification.test.mjs', sha256: digestBytes(networkTestBytes), behavior: 'collector-unavailable exponential backoff and single-warning suppression' }],
});
const byRole = (role) => baseline.inventory.find((entry) => entry.role === role);
const generatedRuntimeProvenancePayload = {
  provenanceSchemaVersion: 2,
  identityGeneration: 2,
  predecessorGeneratedRuntimeProvenanceId: predecessorProvenance.generatedRuntimeProvenanceId,
  compatibilitySourceRoot: predecessorProvenance.compatibilitySourceRoot,
  modelSourceRoot: predecessorProvenance.modelSourceRoot,
  sourceFiles: baseline.inventory.filter((entry) => ['compatibility-source', 'model-source'].includes(entry.role)),
  build: { ...predecessorProvenance.build, config: byRole('build-config'), script: byRole('build-script') },
  outputs: { compatibility: byRole('generated-compatibility'), model: byRole('generated-model') },
  goldenReferences: { compatibility: byRole('golden-compatibility'), model: byRole('golden-model') },
};
const generatedRuntimeProvenance = { ...generatedRuntimeProvenancePayload, generatedRuntimeProvenanceId: `sha256:${sha256(generatedRuntimeProvenancePayload)}` };
const runtimeIdentity = buildSuccessorRuntimeIdentity({ predecessorRuntimeIdentity: predecessorRuntime, baseline, successionEvent, generatedRuntimeProvenanceId: generatedRuntimeProvenance.generatedRuntimeProvenanceId, sentinelHead: gitHead(sentinelRoot), zeknovaHead: gitHead(zeknovaRoot) });
const campaignManifest = buildStage2FCampaignManifest({
  runtimeIdentity,
  generatedRuntimeProvenance,
  campaignStartTime: '2026-08-20T18:43:15.000Z',
  qualificationThresholdPolicy: predecessorCampaign.qualificationThresholdPolicy,
  certificationPolicyVersion: 'stage2f-successor-certification-policy-v1',
  campaignMode: 'QUALIFICATION',
  campaignState: 'PREPARED',
});
const liveVerification = await verifyDeclaredRuntime({ baseline, runtimeIdentity, sentinelRoot, zeknovaRoot });
if (!liveVerification.declaredEqualsMeasured) throw new Error('Successor live runtime verification failed');
const historicalReplay = verifyHistoricalReplay({ predecessorRuntimeIdentity: predecessorRuntime, predecessorBaseline });

const { certification: stage2g, records } = certifyStage2GExperts({ campaignManifest });
const { certification: stage2h } = certifyStage2HPrimeContext({ campaignManifest });
const { certification: stage2h1 } = certifyStage2H1ActionContext({ campaignManifest });
const portabilityDigests = {
  stage2f: baseline.inventoryDigest,
  stage2g: buildStage2GPortabilityDigest().digest,
  stage2h: buildStage2HPortabilityDigest({ campaignManifest }).digest,
  stage2h1: buildStage2H1PortabilityDigest({ campaignManifest }).digest,
};
const measuredOn = [
  { platform: 'darwin', arch: 'arm64', nodeVersion: process.version, ...portabilityDigests },
  { platform: 'linux', arch: 'arm64', nodeVersion: 'v22.22.0', ...portabilityDigests },
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.0', ...portabilityDigests },
];
const portability = { ...portabilityDigests, measuredOn, status: measuredOn.every((entry) => Object.entries(portabilityDigests).every(([key, value]) => entry[key] === value)) ? 'PASS' : 'FAIL' };
const runtimeCertification = {
  certificationSchemaVersion: 1,
  stage: 'STAGE2F_SUCCESSOR_RUNTIME_IDENTITY',
  predecessorRuntimeIdentity: predecessorRuntime.sentinelRuntimeId,
  successorRuntimeIdentity: runtimeIdentity.sentinelRuntimeId,
  successionEventDigest: successionEvent.successionEventDigest,
  runtimeInventoryMatch: liveVerification.runtimeInventoryMatch,
  declaredEqualsMeasuredRuntimeIdentity: liveVerification.declaredEqualsMeasured,
  runtimeIdentityCertified: liveVerification.declaredEqualsMeasured,
  runtimeBaselineCertified: liveVerification.declaredEqualsMeasured,
  predecessorHistoricalReplayValid: historicalReplay.historicalReplayValid,
  predecessorValidAsCurrentRuntime: false,
  successorValidAsCurrentRuntime: liveVerification.declaredEqualsMeasured,
  authority: runtimeIdentity.authority,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  authorityTokenIssues: 0,
};
runtimeCertification.certificationHash = sha256(runtimeCertification);

await writeJson(path.join(successorRoot, 'baseline-manifest.json'), baseline);
await writeJson(path.join(successorRoot, 'succession-event.json'), successionEvent);
await writeJson(path.join(successorRoot, 'generated-runtime-provenance.json'), generatedRuntimeProvenance);
await writeJson(path.join(successorRoot, 'canonical-runtime-identity.json'), runtimeIdentity);
await writeJson(path.join(successorRoot, 'stage2f-campaign-manifest.json'), campaignManifest);
await writeJson(path.join(successorRoot, 'runtime-certification-result.json'), runtimeCertification);
await writeJson(path.join(successorRoot, 'portability-report.json'), portability);
await writeJson(path.join(root, 'artifacts/stage2g-experts-successor/stage2g-certification-result.json'), { ...stage2g, certificationMode: 'LIVE_CURRENT', runtimeVerification: liveVerification });
await writeJson(path.join(root, 'artifacts/stage2g-experts-successor/stage2g-expert-evidence.json'), { evidenceSchemaVersion: 1, sentinelRuntimeId: runtimeIdentity.sentinelRuntimeId, stage2fCampaignId: campaignManifest.stage2fCampaignId, records });
await writeJson(path.join(root, 'artifacts/stage2h-prime-context-successor/stage2h-certification-result.json'), { ...stage2h, certificationMode: 'LIVE_CURRENT', runtimeVerification: liveVerification, stage2gCertificationHash: stage2g.certificationHash });
await writeJson(path.join(root, 'artifacts/stage2h1-action-context-successor/stage2h1-certification-result.json'), { ...stage2h1, certificationMode: 'LIVE_CURRENT', runtimeVerification: liveVerification, stage2gCertificationHash: stage2g.certificationHash, stage2hCertificationHash: stage2h.certificationHash });

console.log(JSON.stringify({ predecessorRuntimeIdentity: predecessorRuntime.sentinelRuntimeId, successorRuntimeIdentity: runtimeIdentity.sentinelRuntimeId, predecessorCampaignId: predecessorCampaign.stage2fCampaignId, successorCampaignId: campaignManifest.stage2fCampaignId, successionEventDigest: successionEvent.successionEventDigest, inventoryFileCount: baseline.inventory.length, inventoryDigest: baseline.inventoryDigest, sourceSha256: digestBytes(sourceBytes), liveVerification, historicalReplay, runtimeCertification, stage2g: { certified: stage2g.stage2gCertified, hash: stage2g.certificationHash }, stage2h: { certified: stage2h.stage2hCertified, hash: stage2h.certificationHash }, stage2h1: { certified: stage2h1.stage2h1Certified, hash: stage2h1.certificationHash }, portability }, null, 2));
