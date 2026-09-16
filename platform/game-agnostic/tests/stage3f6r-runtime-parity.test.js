import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { createWorld } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import {
  INTEGRATED_LIVE_SHADOW_CONTRACT, INTEGRATED_RUNTIME_REMEDIATION, STAGE3E_ROUTER_ABSTAIN_ROUTE,
  beginIntegratedLiveShadowStep, completeIntegratedLiveShadowStep, evaluateIntegratedStage3ERouter,
  extractIntegratedStage3EFeatures, runIntegratedLiveShadowCampaign,
} from '../src/stage3f/integrated-live-shadow-v1.js';
import { STAGE3D_V2B_ADAPTER_DIRECTORY_ENV, certifyRecoveredStage3DE } from '../src/lab/stage3de-recovery-canonicalization.js';
import * as H from '../scripts/stage3f6r-reference-parity-harness.mjs';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const hash = (relative) => createHash('sha256').update(readFileSync(file(relative))).digest('hex');
const fixtures = H.loadFrozenFixtures();
const REMEDIATION_DIR = 'artifacts/stage3f6r-runtime-parity-remediation';

function campaignState(family, level, seed) {
  return forgeWorldAdapter.cloneState({ ...forgeWorldAdapter.initialState(seed), world: createWorld(seed, generateScenario({ family, level, seed })), sequence: 0 });
}
function correctedRoute(state) {
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const preliminary = extractIntegratedStage3EFeatures(state, observation, null);
  const output = preliminary.selector.abstain ? preliminary.greedy : preliminary.selector;
  const candidate = { actionId: output.actionId, producerId: 'X', producerVersion: '1' };
  return evaluateIntegratedStage3ERouter(extractIntegratedStage3EFeatures(state, observation, candidate).values, candidate);
}
let abstention = null;
function abstentionStep() {
  if (!abstention) {
    const seed = 501; const state = forgeAdapterState(createWorld(seed, generateScenario({ family: 'prime/adversarial_choice', level: 1, seed })));
    const direct = forgeWorldAdapter.step(state, forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID)[0], { observerId: FORGE_OBSERVER_ID });
    const started = beginIntegratedLiveShadowStep({ state });
    abstention = { direct, started, completed: completeIntegratedLiveShadowStep(started) };
  }
  return abstention;
}

/* ---------------- A. router binding ---------------- */
const binding = H.routerBindingProbe(fixtures.model);
test('frozen model shape is 51 weights plus a trailing bias', () => { assert.equal(binding.weightCountCorrect, true); assert.equal(binding.weightCount, 52); });
test('runtime evaluator reads the bias from the last position', () => assert.equal(binding.biasBindingCorrect, true));
test('runtime evaluator binds every one of the 51 weights to its own feature position', () => {
  assert.equal(binding.weightPositionsBound, 51); assert.equal(binding.weightBindingCorrect, true);
});
test('incomplete router input fails closed with no score and no route', () => assert.equal(binding.incompleteInputFailsClosed, true));
test('non-finite router input fails closed with no score and no route', () => assert.equal(binding.nonFiniteInputFailsClosed, true));

const parity = H.routerFixtureParity(fixtures);
test('runtime evaluator reproduces frozen Stage 3E CAL (n=231, precision 0.8182)', () => {
  assert.equal(parity.CAL.measured.routedN, 231); assert.equal(parity.CAL.measured.precision, 0.8182); assert.equal(parity.CAL.parity, true);
});
test('runtime evaluator reproduces frozen Stage 3E HOLDOUT (n=347, precision 0.781, 76 false-safe)', () => {
  assert.equal(parity.HOLDOUT.measured.routedN, 347); assert.equal(parity.HOLDOUT.measured.falseSafeCount, 76); assert.equal(parity.HOLDOUT.parity, true);
});
test('runtime evaluator reproduces frozen Stage 3E OOD (n=881, precision 0.9103, 79 false-safe)', () => {
  assert.equal(parity.OOD.measured.routedN, 881); assert.equal(parity.OOD.measured.falseSafeCount, 79); assert.equal(parity.OOD.parity, true);
});
test('runtime scores equal the canonical replay scores exactly on every fixture row', () => {
  for (const split of ['CAL', 'HOLDOUT', 'OOD']) assert.equal(parity[split].measured.maxAbsoluteScoreDifference, 0, split);
});
test('HOLDOUT route signature equals the frozen Stage 3E determinism signature', () => assert.equal(parity.routeSignatureParity, true));

/* ---------------- B. feature parity harness ---------------- */
const dependencies = H.featureDependencies(fixtures.model.keys);
test('seven frozen features require multi-step rollouts and none is labeled one-step', () => {
  const multi = Object.values(dependencies).filter((entry) => entry.multiStepRollout);
  assert.equal(multi.length, 7); assert.ok(multi.every((entry) => entry.oneStepSimulated === false));
});
test('twenty frozen features are simulator dependent and five require V2B', () => {
  assert.equal(Object.values(dependencies).filter((entry) => entry.simulatorDependent).length, 20);
  assert.equal(Object.values(dependencies).filter((entry) => entry.requiresV2B).length, 5);
});
test('reference parity mode is diagnostic only, not simulator-free, not one-step runtime-safe', () => {
  const mode = H.STAGE3F6R_FEATURE_MODES.REFERENCE_PARITY_MODE;
  assert.equal(mode.diagnosticOnly, true); assert.equal(mode.simulatorFree, false); assert.equal(mode.oneStepRuntimeSafe, false);
  assert.equal(mode.permanentRuntimeContract, false); assert.equal(mode.deployable, false);
});
test('deployable runtime declares no Stage 3E feature parity and no redesign in this gate', () => {
  assert.equal(INTEGRATED_RUNTIME_REMEDIATION.featureMode, 'DEPLOYABLE_RUNTIME_MODE');
  assert.equal(INTEGRATED_RUNTIME_REMEDIATION.deployableStage3EFeatureParity, false);
  assert.equal(H.STAGE3F6R_FEATURE_MODES.DEPLOYABLE_RUNTIME_MODE.redesignedInThisGate, false);
});
test('frozen feature source is imported unmodified and byte-identical to the canonical lineage', async () => {
  const extractor = await H.loadFrozenStage3EFeatureExtractor();
  assert.equal(extractor.sourceSha256, hash('training/stage3e-recovered/features-v2.mjs'));
});
test('reference mode reproduces all 46 recomputable frozen features and reports 5 as REQUIRES_V2B', async () => {
  const result = await H.referenceFeatureParity({ fixtures, perPartitionQuota: 2 });
  assert.equal(result.summary.referenceRecomputableFeatures, 46); assert.equal(result.summary.referenceFeatureParity, true);
  assert.equal(result.summary.referenceStatusCounts.REQUIRES_V2B, 5); assert.equal(result.summary.referenceStatusCounts.REQUIRES_MULTI_STEP_ROLLOUT, 7);
  assert.equal(result.summary.deployableStage3EFeatureParity, false);
  assert.equal(result.summary.deployableRuntimeFeatureContractRequiresRedesign, true);
});

/* ---------------- C. abstention evidence ---------------- */
test('abstention keeps a valid trace with an abstained recommendation', () => {
  const { completed } = abstentionStep();
  assert.ok(completed.trace); assert.equal(completed.trace.decisionTimeEvent.decisionTimeEvidence.recommendation.abstained, true);
});
test('abstention creates a ledger with NO_SENTINEL_PROPOSAL and no counterfactual', () => {
  const { completed } = abstentionStep();
  assert.ok(completed.ledger);
  assert.equal(completed.ledger.projection.selectedActions[0].comparisonStatus, 'NO_SENTINEL_PROPOSAL');
  assert.equal(completed.ledger.projection.counterfactuals.length, 0);
  assert.equal(completed.ledger.projection.evaluations.at(-1).status, 'INCOMPARABLE');
});
test('abstention creates a validated, buffered experience without a prediction', () => {
  const { completed } = abstentionStep();
  assert.ok(completed.experience); assert.equal(completed.experience.projection.predictions.length, 0);
  assert.equal(completed.experience.projection.validations.at(-1).status, 'VALIDATED');
  assert.equal(completed.experienceBuffer.projection.experiences.length, 1);
});
test('prediction-dependent profiles are ineligible after abstention; router analysis stays eligible', () => {
  const eligibility = abstentionStep().completed.experience.projection.eligibilityByPurpose;
  assert.equal(eligibility.ROUTER_ANALYSIS.status, 'ELIGIBLE');
  for (const purpose of ['PREDICTION_CALIBRATION', 'COUNTERFACTUAL_EVALUATION']) {
    assert.equal(eligibility[purpose].status, 'INELIGIBLE', purpose);
    assert.ok(eligibility[purpose].reasons.includes('DECISION_TIME_PREDICTION_REQUIRED'), purpose);
  }
});
test('abstention is not treated as an instrumentation failure', () => {
  const { completed } = abstentionStep(); assert.equal(completed.degradation.status, 'HEALTHY'); assert.deepEqual([...completed.degradation.failures], []);
});
test('abstention evidence does not alter the incumbent transition', () => {
  const { started, direct } = abstentionStep(); assert.equal(started.transition.info.worldHash, direct.info.worldHash);
});
test('a proposing step still records its decision-time counterfactual and prediction', () => {
  const state = forgeAdapterState(createWorld(3, generateScenario({ family: 'archimedes/repair_network', level: 0, seed: 3 })));
  const completed = completeIntegratedLiveShadowStep(beginIntegratedLiveShadowStep({ state }));
  assert.equal(completed.ledger.projection.counterfactuals.length, 1); assert.equal(completed.experience.projection.predictions.length, 1);
});
test('corrected router abstains on the original disagreement seed; the campaign uses the first proposing seed', () => {
  assert.equal(correctedRoute(campaignState('prime/adversarial_choice', 1, 11)).selectedRoute, 'LEARNED_NEXUS_V2B');
  assert.equal(correctedRoute(campaignState('prime/adversarial_choice', 1, 12)).selectedRoute, 'GREEDY');
  const campaign = runIntegratedLiveShadowCampaign();
  const disagreement = campaign.episodes.find((entry) => entry.id === 'DISAGREEMENT');
  assert.equal(disagreement.seed, 12); assert.equal(disagreement.actionMatch, 'DIFFERENT_ACTION');
});

/* ---------------- D. predecessor reproducibility ---------------- */
test('recovery certification no longer reads the ephemeral scratch path', () => {
  // Comments are stripped: the remediation intentionally documents what it no longer consults.
  const code = readFileSync(file('src/lab/stage3de-recovery-canonicalization.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.equal(/recoveredSourcePath/.test(code), false);
  assert.equal(/\/private\/tmp\//.test(code), false);
});
test('canonical recovery passes with candidate identity bound to the in-repo manifest', async () => {
  const saved = process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV]; delete process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV];
  try {
    const recovery = await certifyRecoveredStage3DE();
    assert.equal(recovery.status, 'PASS');
    assert.equal(recovery.adapter.manifestCompositeHash, recovery.hashes.stage3dV2bCandidate);
    assert.equal(recovery.adapter.status, 'NOT_VERIFIED_ARCHIVE_UNAVAILABLE'); assert.equal(recovery.adapter.gating, false);
  } finally { if (saved !== undefined) process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV] = saved; }
});
test('opt-in archive byte verification reports mismatches without gating canonical PASS', async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stage3f6r-adapter-'));
  const saved = process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV];
  try {
    writeFileSync(path.join(directory, 'adapter_config.json'), '{}');
    process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV] = directory;
    const recovery = await certifyRecoveredStage3DE();
    assert.equal(recovery.adapter.status, 'ADAPTER_BYTES_MISMATCH'); assert.equal(recovery.status, 'PASS');
  } finally {
    if (saved === undefined) delete process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV]; else process.env[STAGE3D_V2B_ADAPTER_DIRECTORY_ENV] = saved;
    rmSync(directory, { recursive: true, force: true });
  }
});

/* ---------------- E/F. errata, history, authority ---------------- */
test('historical Stage 3F.5 certificate is preserved and its runtime source is superseded', () => {
  const certificate = JSON.parse(readFileSync(file('artifacts/stage3f5-integrated-live-shadow/stage3f5-certification-result.json'), 'utf8'));
  assert.equal(certificate.certificationHash, 'eda3d2d67334dd904a24ff574f4e839e52fb67ec26fb01112b8f21c973b4fbe5');
  assert.notEqual(hash('src/stage3f/integrated-live-shadow-v1.js'), certificate.sourceHashes['src/stage3f/integrated-live-shadow-v1.js']);
  for (const relative of ['src/stage3f/ascii-observatory-v1.js', 'scripts/sentinel-observatory.mjs', 'tests/stage3f5-integrated-live-shadow-v1.test.js']) {
    assert.equal(hash(relative), certificate.sourceHashes[relative], relative);
  }
});
test('Stage 3F.5 erratum records supersession, findings, and remaining guarantees', () => {
  const erratum = JSON.parse(readFileSync(file(`${REMEDIATION_DIR}/erratum-stage3f5-integrated-live-shadow.json`), 'utf8'));
  assert.equal(erratum.statusAfterErratum, 'SUPERSEDED'); assert.equal(erratum.historicalArtifactModified, false);
  assert.deepEqual(erratum.findings.map((entry) => entry.id).sort(),
    ['ABSTENTION_EVIDENCE_LOSS', 'CAMPAIGN_CHECK_CONTINGENT_ON_MISBINDING', 'FEATURE_CONTRACT_DIVERGENCE', 'ROUTER_POSITIONAL_MISBINDING']);
  assert.deepEqual([...erratum.guaranteesRemainingValid].sort(),
    ['DETERMINISTIC_EVIDENCE_BEHAVIOR', 'FAILURE_ISOLATION', 'INCUMBENT_SOLE_EXECUTION', 'R0_AUTHORITY', 'READ_ONLY_OBSERVATORY']);
});
test('Stage 3E erratum records topology reuse and multi-step features without rewriting history', () => {
  const erratum = JSON.parse(readFileSync(file(`${REMEDIATION_DIR}/erratum-stage3e-routability-intelligence.json`), 'utf8'));
  assert.equal(erratum.historicalArtifactsModified, false);
  assert.deepEqual(erratum.findings.map((entry) => entry.id).sort(),
    ['MULTI_STEP_ROLLOUT_FEATURES', 'ONE_STEP_DESCRIPTION_PARTIALLY_INACCURATE', 'SPLIT_OVERLAP_CLAIM_SCOPE', 'TOPOLOGY_REUSE']);
});
test('Stage 3F.6 diagnostic PARTIAL certificate is preserved when present', { skip: !existsSync(file('artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json')) }, () => {
  const certificate = JSON.parse(readFileSync(file('artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json'), 'utf8'));
  assert.equal(certificate.certificationHash, '399f71c9cc0b2758e610133454e2f137436339a04a2117a1323a0a0bc3616a84');
  assert.equal(certificate.status, 'PARTIAL');
});
test('remediated runtime keeps R0 authority and incumbent sole execution', () => {
  assert.deepEqual(INTEGRATED_LIVE_SHADOW_CONTRACT.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true });
  assert.equal(INTEGRATED_LIVE_SHADOW_CONTRACT.modelTrainingPerformed, false); assert.equal(INTEGRATED_LIVE_SHADOW_CONTRACT.onlineLearningEnabled, false);
});
test('router abstain route constant is distinct from both expert routes', () => {
  assert.notEqual(STAGE3E_ROUTER_ABSTAIN_ROUTE, 'GREEDY'); assert.notEqual(STAGE3E_ROUTER_ABSTAIN_ROUTE, 'LEARNED_NEXUS_V2B');
});
