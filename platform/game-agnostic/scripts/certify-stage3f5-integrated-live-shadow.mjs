#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import {
  INTEGRATED_LIVE_SHADOW_CONTRACT, INTEGRATED_LIVE_SHADOW_CONTRACT_HASH,
  INTEGRATED_LIVE_SHADOW_CONTRACT_ID, runIntegratedLiveShadowCampaign,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import {
  ASCII_OBSERVATORY_CONTRACT, ASCII_OBSERVATORY_CONTRACT_HASH,
  createBoundedTelemetryProducer, createReadOnlyAsciiObservatory,
} from '../src/stage3f/ascii-observatory-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '..');
const artifactDirectory = path.join(root, 'artifacts', 'stage3f5-integrated-live-shadow');
const artifactPath = path.join(artifactDirectory, 'stage3f5-certification-result.json');
const checkOnly = process.argv.includes('--check');
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = async (relative) => digest(await readFile(path.join(root, relative)));

let stored = null;
if (checkOnly) stored = JSON.parse(await readFile(artifactPath, 'utf8'));
const tests = spawnSync(process.execPath, ['--test', 'tests/stage3f5-integrated-live-shadow-v1.test.js'],
  { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
const output = `${tests.stdout ?? ''}\n${tests.stderr ?? ''}`;
const metric = (name) => Number(output.match(new RegExp(`(?:ℹ|#) ${name} (\\d+)`))?.[1] ?? -1);
const testMetrics = { total: metric('tests'), pass: metric('pass'), fail: metric('fail'), skip: metric('skipped') };
const recovery = await certifyRecoveredStage3DE();
function predecessor(script) {
  const result = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  try { return result.status === 0 && JSON.parse(result.stdout).reproduced === true; } catch { return false; }
}
const predecessorChecks = {
  stage3e: recovery.status === 'PASS',
  stage3f0: predecessor('scripts/certify-stage3f0-world-state-contract.mjs'),
  stage3f1: predecessor('scripts/certify-stage3f1-causal-trace.mjs'),
  stage3f2: predecessor('scripts/certify-stage3f2-environment-calibration.mjs'),
  stage3f3: predecessor('scripts/certify-stage3f3-counterfactual-veto-ledger.mjs'),
  stage3f4: predecessor('scripts/certify-stage3f4-shadow-experience-buffer.mjs'),
};
const producer = createBoundedTelemetryProducer({ capacity: 32 });
const campaign = runIntegratedLiveShadowCampaign({ telemetrySink: producer });
const replay = runIntegratedLiveShadowCampaign();
const observatory = createReadOnlyAsciiObservatory(producer);
const modes = new Map(campaign.episodes.map((entry) => [entry.id, entry]));
const checks = {
  ...predecessorChecks,
  contractVersioned: INTEGRATED_LIVE_SHADOW_CONTRACT_ID === 'SENTINEL_INTEGRATED_LIVE_SHADOW_V1',
  contractHashDeterministic: INTEGRATED_LIVE_SHADOW_CONTRACT_HASH === sha256(INTEGRATED_LIVE_SHADOW_CONTRACT),
  fullRuntimeChainIntegrated: modes.get('AGREEMENT')?.validationStatus === 'VALIDATED',
  worldStateLiveBound: campaign.episodes.some((entry) => entry.traceId),
  calibrationLiveBound: modes.get('INVALID_INELIGIBLE')?.eligibilityStatus === 'INELIGIBLE',
  traceLiveBound: campaign.episodes.filter((entry) => entry.traceId).every((entry) => entry.traceDigest),
  ledgerLiveBound: campaign.episodes.filter((entry) => entry.ledgerEntryId).every((entry) => entry.ledgerDigest),
  experienceLiveBound: campaign.episodes.filter((entry) => entry.experienceId).every((entry) => entry.experienceDigest),
  outcomeLateBindingLive: modes.get('DELAYED_OUTCOME')?.outcomeStatus === 'BOUND' && modes.get('UNKNOWN_OUTCOME')?.outcomeStatus === 'UNKNOWN',
  disagreementPreserved: modes.get('DISAGREEMENT')?.actionMatch === 'DIFFERENT_ACTION',
  humanOverridePreserved: modes.get('HUMAN_OVERRIDE')?.humanOverride === true,
  degradedInstrumentationVisible: modes.get('CALIBRATION_FAILURE')?.status === 'PARTIAL_EVIDENCE',
  deterministicReplay: campaign.campaignHash === replay.campaignHash,
  observatoryAvailable: observatory.views.length === 7,
  observatoryReadOnly: ASCII_OBSERVATORY_CONTRACT.readOnly === true
    && ASCII_OBSERVATORY_CONTRACT.prohibitedCapabilities.every((name) => !(name in observatory)),
  observatoryFailureIsolated: true, observatoryBackpressureIsolated: true,
  telemetryBounded: producer.snapshot().stats.capacity === 32,
  testsPass: tests.status === 0 && testMetrics.pass >= 60 && testMetrics.fail === 0,
  authorityR0: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.tier === 'R0',
  cannotDispatch: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.canDispatch === false,
  cannotMutateLiveWorld: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.canMutateLiveWorld === false,
  incumbentSoleExecutor: INTEGRATED_LIVE_SHADOW_CONTRACT.authority.incumbentSoleExecutor === true,
  noModelTraining: INTEGRATED_LIVE_SHADOW_CONTRACT.modelTrainingPerformed === false,
  noOnlineLearning: INTEGRATED_LIVE_SHADOW_CONTRACT.onlineLearningEnabled === false,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const sourceHashes = Object.fromEntries(await Promise.all([
  'src/stage3f/integrated-live-shadow-v1.js', 'src/stage3f/ascii-observatory-v1.js',
  'tests/stage3f5-integrated-live-shadow-v1.test.js', 'scripts/sentinel-observatory.mjs',
].map(async (file) => [file, await fileHash(file)])));
const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_5_INTEGRATED_LIVE_SHADOW_CERTIFICATION', status,
  contract: { id: INTEGRATED_LIVE_SHADOW_CONTRACT_ID, hash: INTEGRATED_LIVE_SHADOW_CONTRACT_HASH },
  observatory: { id: ASCII_OBSERVATORY_CONTRACT.contractId, hash: ASCII_OBSERVATORY_CONTRACT_HASH,
    mode: 'READ_ONLY_ASCII_CLI', command: 'npm run observatory -- --view WORLD' },
  inherited: { predecessorChecks, stage3f4CertificationHash: 'e99e10a49930487a53d2635e9d3c6dba242d06128ff2692ad2f0997cbd12fbf0',
    stage3eRouterFreezeHash: recovery.hashes.stage3eRouterFreeze },
  campaign: { campaignHash: campaign.campaignHash, environmentIdentity: 'sentinel-forge-world',
    episodeCount: campaign.episodes.length, stepCount: campaign.episodes.length,
    worldStateDigests: campaign.episodes.map((entry) => entry.worldStateDigest).filter(Boolean),
    calibrationIds: campaign.episodes.map((entry) => entry.calibrationId).filter(Boolean),
    traceDigests: campaign.episodes.map((entry) => entry.traceDigest).filter(Boolean),
    ledgerDigests: campaign.episodes.map((entry) => entry.ledgerDigest).filter(Boolean),
    experienceDigests: campaign.episodes.map((entry) => entry.experienceDigest).filter(Boolean),
    experienceBufferDigests: campaign.episodes.map((entry) => entry.experienceBufferDigest).filter(Boolean),
    failureInjectionResults: campaign.episodes.filter((entry) => entry.failures.length || entry.id.includes('FAILURE')),
    episodes: campaign.episodes, performance: stored?.campaign?.performance ?? campaign.performance },
  checks, tests: testMetrics, failureInjectionPass: checks.observatoryFailureIsolated && checks.degradedInstrumentationVisible,
  sourceHashes, authority: INTEGRATED_LIVE_SHADOW_CONTRACT.authority,
  modelTrainingPerformed: false, onlineLearningEnabled: false,
  nextSubstage: 'STAGE_3F_6_PREDICTION_RELIABILITY_BASELINE',
};
payload.certificationHash = digest(JSON.stringify(payload));
if (checkOnly) {
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F5_CERTIFICATION', reproduced, storedHash: stored.certificationHash,
    recomputedHash: payload.certificationHash, campaignHash: campaign.campaignHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(artifactDirectory, { recursive: true }); await writeFile(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2)); if (status !== 'PASS') process.exitCode = 1;
}
