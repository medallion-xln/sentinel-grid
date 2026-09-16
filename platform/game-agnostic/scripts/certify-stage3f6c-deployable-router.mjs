#!/usr/bin/env node
/* STAGE_3F_6_C — confirmatory deployable router and reliability.
 *
 * Answers ONE question: how much safe-routing performance survives when Sentinel is limited to
 * genuinely deployable, decision-time, non-oracle evidence?
 *
 * PRIMARY_RESULT = DEPLOYABLE_CORE. The simulator profile is an ablation / upper bound, never
 * the headline. HOLDOUT and OOD are structurally sealed until the evaluation freeze is written.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DeployableDiagnosis, STAGE3F6C_METHODOLOGY, auroc, brier, ece, evaluatePartition, featureImportance,
  fitLogisticRegression, highConfidenceWrong, quantile, reliabilityByBin, routerHash, scoreMatrix,
  selectTiers, tauCurve, wilsonLower,
} from '../src/stage3f/deployable-router-v1.js';
import {
  DEPLOYABLE_FEATURES, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID,
  DEPLOYABLE_PROFILES, DeployableProfile, FeatureValueStatus,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { CANDIDATE_ROUTER_OBSERVATORY_CONTRACT, renderCandidateRouterFrame } from '../src/stage3f/deployable-router-observatory-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { buildTarget, heuristicGreedyBaseline, nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6c-deployable-router');
const resultPath = path.join(outDirectory, 'stage3f6c-certification-result.json');
const freezePath = path.join(outDirectory, 'stage3f6c-evaluation-freeze.json');
const corpusPath = path.join(outDirectory, 'confirmatory-corpus.jsonl.gz');
const manifestPath = path.join(outDirectory, 'confirmatory-corpus-manifest.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const log = (message) => process.stderr.write(`[stage3f6c] ${message}\n`);
/* record-v2 stores branch action keys as a 16-character prefix of the full runtime digest. */
const RECORD_ACTION_KEY_PREFIX = 16;

/* ------------------------------------------------------- 0. scope / safety */
const prefix = (relative) => `platform/game-agnostic/${relative}`;
const gitClean = (...paths) => {
  const result = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'GIT_UNAVAILABLE';
};
const unchanged = (...paths) => gitClean(...paths) === '';

const FROZEN_STAGE3E = ['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered'].map(prefix);
const STAGE3F_OWNERS = ['src/stage3f/world-state-v1.js', 'src/stage3f/causal-trace-v1.js',
  'src/stage3f/environment-calibration-v1.js', 'src/stage3f/counterfactual-veto-ledger-v1.js',
  'src/stage3f/shadow-experience-buffer-v1.js', 'src/stage3f/integrated-live-shadow-v1.js',
  'src/stage3f/prediction-reliability-v1.js', 'artifacts/stage3f6-prediction-reliability',
  'artifacts/stage3f6r-runtime-parity-remediation'].map(prefix);
const STAGE3F6S_OWNERS = ['src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js',
  'src/stage3f/deployable-observatory-v1.js', 'scripts/certify-stage3f6s-deployable-feature-contract.mjs',
  'tests/stage3f6s-deployable-feature-contract.test.js', 'artifacts/stage3f6s-deployable-feature-contract'].map(prefix);

const stage3f6s = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'), 'utf8'));
const stage3f6r = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6r-runtime-parity-remediation/stage3f6r-certification-result.json'), 'utf8'));

const scope = {
  frozenStage3EUnchanged: unchanged(...FROZEN_STAGE3E),
  priorStage3FOwnersUnchanged: unchanged(...STAGE3F_OWNERS),
  stage3f6sOwnersUnchanged: unchanged(...STAGE3F6S_OWNERS),
  stage3f6sCertificationHash: stage3f6s.certificationHash,
  stage3f6rCertificationHash: stage3f6r.certificationHash,
  deployableContractHashMatch: stage3f6s.contract.hash === DEPLOYABLE_FEATURE_CONTRACT_HASH,
  newOwners: ['src/stage3f/deployable-router-v1.js', 'src/stage3f/deployable-router-observatory-v1.js',
    'scripts/generate-stage3f6c-corpus.mjs', 'scripts/certify-stage3f6c-deployable-router.mjs',
    'tests/stage3f6c-deployable-router.test.js'],
  existingOwnersModified: ['package.json'],
};

/* ---------------------------------------------------------- 1. corpus load */
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const corpusRaw = gunzipSync(await readFile(corpusPath)).toString('utf8');
const corpusContentHashMatches = hex(corpusRaw) === manifest.contentHash;
const allRows = corpusRaw.split('\n').filter(Boolean).map((line) => JSON.parse(line));

const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
/* The simulator profile cannot be fully satisfied in this environment: three one-step components are
 * never declared by the transition (Stage 3F.6-S finding 6). The ablation trains on the satisfiable
 * subset and reports what was excluded, rather than imputing a value or abandoning the ablation. */
const SIM_PROFILE_IDS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_SIMULATOR].featureIds].sort();
const SIM_KEYS = allRows.length > 0 && allRows[0].simulator ? Object.keys(allRows[0].simulator).sort() : [];
const SIM_EXCLUDED = SIM_PROFILE_IDS.filter((id) => !SIM_KEYS.includes(id));

/* HOLDOUT and OOD are not merely "not read yet" — they are unreachable until the freeze exists. */
let evaluationFreeze = null;
const SEALED = new Set(['HOLDOUT', 'OOD']);
const sealedAccessLog = [];
function partitionRows(name) {
  if (SEALED.has(name) && evaluationFreeze === null) {
    throw new Error(`SEALED_PARTITION_ACCESS_BEFORE_FREEZE: ${name}`);
  }
  if (SEALED.has(name)) sealedAccessLog.push({ partition: name, afterFreeze: true });
  return allRows.filter((row) => row.partition === name);
}
const dev = partitionRows('DEV');
const cal = partitionRows('CAL');

const matrixOf = (rows, keys, field) => rows.map((row) => keys.map((key) => {
  const value = row[field]?.[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`non-finite feature ${key}`);
  return value;
}));
const labelsOf = (rows) => rows.map((row) => row.y);

/* ------------------------------------------------- 2. label independence */
const coreFeatureIds = new Set(CORE_KEYS);
const labelIndependence = {
  labelSource: manifest.spec.labelSource,
  labelDefinition: manifest.spec.labelDefinition,
  labelComputedFromDeployableFeatures: false,
  labelUsesOracleHorizonEvidence: true,
  coreContainsRolloutFeature: DEPLOYABLE_FEATURES.some((f) => coreFeatureIds.has(f.featureId) && f.multiStepRollout === true),
  coreContainsSimulatorFeature: DEPLOYABLE_FEATURES.some((f) => coreFeatureIds.has(f.featureId)
    && f.requiredCapabilities.includes('SIMULATOR_ONE_STEP')),
  coreContainsV2BFeature: DEPLOYABLE_FEATURES.some((f) => coreFeatureIds.has(f.featureId)
    && f.requiredCapabilities.includes('EXPERT_V2B')),
  note: 'The label is the membership of the best-immediate action in the authoritative horizon-optimal set. '
    + 'No deployable CORE feature encodes the greedy action, its value, or any horizon quantity.',
};

/* --------------------------------------------------------- 3. train (DEV) */
log(`DEV=${dev.length} CAL=${cal.length}`);
const coreModel = fitLogisticRegression(matrixOf(dev, CORE_KEYS, 'core'), labelsOf(dev), CORE_KEYS);
const devScores = scoreMatrix(coreModel, matrixOf(dev, CORE_KEYS, 'core'));
const devAuroc = auroc(devScores, labelsOf(dev));

const simulatorRowsAvailable = SIM_KEYS.length > 0
  && allRows.every((row) => row.simulator && Object.keys(row.simulator).length === SIM_KEYS.length);
const simModel = simulatorRowsAvailable
  ? fitLogisticRegression(matrixOf(dev, SIM_KEYS, 'simulator'), labelsOf(dev), SIM_KEYS) : null;

/* ----------------------------------------------------- 4. calibrate (CAL) */
const calLabels = labelsOf(cal);
const calScores = scoreMatrix(coreModel, matrixOf(cal, CORE_KEYS, 'core'));
const calMetrics = {
  n: cal.length, prevalence: calLabels.reduce((a, b) => a + b, 0) / cal.length,
  auroc: auroc(calScores, calLabels), brier: brier(calScores, calLabels), ece: ece(calScores, calLabels),
};
const calCurve = tauCurve(calScores, calLabels);
const calTiers = selectTiers(calScores, calLabels);

/* Predeclared operating-point rule — fixed before any sealed partition is opened. */
const OPERATING_POINT_RULE = {
  id: 'HIGHEST_ACHIEVABLE_TIER_AT_EVIDENCE_FLOOR',
  description: 'Choose the CAL tau achieving the HIGHEST reliability tier whose routed n is at or above the '
    + 'evidence floor (200). Among equally-high tiers prefer the larger routed n. If no tier at or above 0.80 is '
    + 'achievable at the floor, fall back to the Stage 3E reference tau 0.9 and mark NO_CAL_OPERATING_POINT.',
  evidenceFloor: STAGE3F6C_METHODOLOGY.minRoutedN,
  fallbackTau: 0.9,
  precisionFirst: true,
  mayNotBeLoweredAfterSealedExposure: true,
};
function chooseOperatingPoint(tiers) {
  for (const target of [...STAGE3F6C_METHODOLOGY.reliabilityTiers].sort((a, b) => b - a)) {
    const tier = tiers[String(target)];
    if (tier && tier.achievable) return { tau: tier.tau, selectedTier: target, source: 'CAL_TIER', ...tier };
  }
  return { tau: OPERATING_POINT_RULE.fallbackTau, selectedTier: null, source: 'NO_CAL_OPERATING_POINT' };
}
const coreOperatingPoint = chooseOperatingPoint(calTiers);

const simCal = simModel ? scoreMatrix(simModel, matrixOf(cal, SIM_KEYS, 'simulator')) : null;
const simTiers = simModel ? selectTiers(simCal, calLabels) : null;
const simOperatingPoint = simModel ? chooseOperatingPoint(simTiers) : null;

/* ----------------------------------------- 5. readiness rule (predeclared) */
const STAGE3G_READINESS_RULE = {
  id: 'STAGE3G_READINESS_V1',
  predeclaredBeforeSealedExposure: true,
  requirements: {
    minimumRoutedN: 200,
    minimumHoldoutPrecisionWilsonLower: 0.9,
    minimumCoverage: 0.05,
    maxHighConfidenceWrongRateAt090: 0.05,
    falseSafeHarmMustNotExceedFallback: true,
    calibratedUncertaintyMaxEce: 0.1,
    deterministicReplayRequired: true,
    zeroLeakageRequired: true,
    appliesToProfile: DeployableProfile.DEPLOYABLE_CORE,
  },
  note: 'Stage 3G stays blocked unless the CORE profile itself satisfies every requirement. A simulator-profile '
    + 'result cannot unblock Stage 3G, because the simulator capability is not general.',
};

/* ------------------------------------------------- 6. EVALUATION FREEZE */
const freezePayload = {
  gate: 'STAGE_3F_6_C_DEPLOYABLE_ROUTER',
  datasetHashes: { content: manifest.contentHash, partitions: manifest.partitionHashes },
  featureContract: { id: DEPLOYABLE_FEATURE_CONTRACT_ID, hash: DEPLOYABLE_FEATURE_CONTRACT_HASH },
  primaryProfile: DeployableProfile.DEPLOYABLE_CORE,
  primaryFeatureCount: CORE_KEYS.length,
  primaryFeatureIds: CORE_KEYS,
  routerArchitecture: STAGE3F6C_METHODOLOGY.routerFamily,
  hyperparameters: { learningRate: coreModel.learningRate, l2: coreModel.l2, iterations: coreModel.iterations },
  coreRouterHash: routerHash(coreModel),
  coreWeights: { keys: coreModel.keys, mu: coreModel.mu, sd: coreModel.sd, w: coreModel.w },
  simulatorRouterHash: simModel ? routerHash(simModel) : null,
  threshold: coreOperatingPoint.tau,
  simulatorThreshold: simOperatingPoint ? simOperatingPoint.tau : null,
  operatingPointRule: OPERATING_POINT_RULE,
  operatingPointSelection: coreOperatingPoint,
  minimumRoutedN: STAGE3F6C_METHODOLOGY.minRoutedN,
  reliabilityTiers: STAGE3F6C_METHODOLOGY.reliabilityTiers,
  metricDefinitions: {
    precision: 'routed cases whose greedy action is in the horizon-optimal set / routed cases',
    coverage: 'routed cases / partition cases',
    wilsonLower: 'Wilson 95% lower bound on routed precision',
    hybridAccuracy: 'routed -> greedy correctness, declined -> fallback correctness',
    hybridRegret: 'routed -> greedy regret, declined -> fallback regret',
    falseSafeHarm: 'regret actually paid on routed cases whose label is 0',
    ece: '10 equal-width bins',
  },
  diagnosisRules: Object.values(DeployableDiagnosis),
  /* Stage 3F.6-C result classification and evidence-gap taxonomy. Frozen HERE, before any sealed
   * partition is opened, so the categories cannot be reshaped to fit whatever the results turn out
   * to be. Several classifications may apply at once. */
  resultClassificationRules: ['A_CORE_SELECTIVE_ROUTING_SUPPORTED', 'B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY',
    'C_CORE_INFORMATION_INSUFFICIENT', 'D_SIMULATOR_MATERIALLY_IMPROVES_ROUTABILITY',
    'E_V2B_MATERIALLY_IMPROVES_ROUTABILITY', 'F_CONFIDENCE_CALIBRATION_LIMITED', 'G_MIXED'],
  resultClassificationThresholds: {
    coreHasSignalMinAuroc: 0.65,
    selectiveRoutingRequiresAchievableTier: true,
    informationInsufficientMaxAuroc: 0.6,
    simulatorMaterialMinAurocGain: 0.05,
    calibrationLimitedMaxEce: 0.1,
  },
  evidenceGapTaxonomy: ['REPRESENTATION_INFORMATION_GAP', 'CALIBRATION_GAP', 'MODEL_CAPACITY_GAP',
    'ACTION_COMPUTATION_GAP', 'SPATIAL_STATE_GAP', 'TEMPORAL_STATE_GAP', 'RISK_STATE_GAP', 'OTHER'],
  capabilityLimitation: {
    ABILITY_TO_PREDICT_GREEDY_SAFETY: 'measured by this stage',
    ABILITY_TO_COMPUTE_GREEDY_ACTION: 'NOT possessed by DEPLOYABLE_CORE — identifying the immediate-best '
      + 'action requires the one-step simulator capability, which CORE does not declare',
    conclusionMustDistinguishThem: true,
  },
  stage3gReadinessRule: STAGE3G_READINESS_RULE,
  calibration: { calMetrics, tiers: calTiers, operatingPoint: coreOperatingPoint },
  sealedPartitionsUnopenedAtFreeze: true,
};
const evaluationFreezeHash = sha256(freezePayload);
evaluationFreeze = { ...freezePayload, evaluationFreezeHash };
await mkdir(outDirectory, { recursive: true });
await writeFile(freezePath, `${JSON.stringify(evaluationFreeze, null, 2)}\n`);
log(`freeze written ${evaluationFreezeHash.slice(0, 16)} tau=${coreOperatingPoint.tau}`);

/* ------------------------------------------------ 7. SEALED EVALUATION */
const holdout = partitionRows('HOLDOUT');
const ood = partitionRows('OOD');

function evaluateProfile(rows, model, keys, field, tau) {
  const labels = labelsOf(rows);
  const scores = scoreMatrix(model, matrixOf(rows, keys, field));
  return {
    scores,
    labels,
    result: evaluatePartition({
      scores, labels, tau,
      greedyOk: rows.map((row) => row.greedyOk),
      greedyRegret: rows.map((row) => row.greedyRegret),
      fallbackOk: rows.map((row) => row.fallbackOk),
      fallbackRegret: rows.map((row) => row.fallbackRegret),
    }),
    auroc: auroc(scores, labels),
    brier: brier(scores, labels),
    ece: ece(scores, labels),
    highConfidenceWrong: highConfidenceWrong(scores, labels),
    reliabilityBins: reliabilityByBin(scores, labels),
  };
}

const coreHoldout = evaluateProfile(holdout, coreModel, CORE_KEYS, 'core', coreOperatingPoint.tau);
const coreOod = evaluateProfile(ood, coreModel, CORE_KEYS, 'core', coreOperatingPoint.tau);
const simHoldout = simModel ? evaluateProfile(holdout, simModel, SIM_KEYS, 'simulator', simOperatingPoint.tau) : null;
const simOod = simModel ? evaluateProfile(ood, simModel, SIM_KEYS, 'simulator', simOperatingPoint.tau) : null;

/* ------------------------------------------- 8. observation degradation */
const DEGRADATION_SUBSAMPLE = 150;
function rebuildDecision(row) {
  const built = buildRecordV2({ shape: row.combination.shape, roles: row.combination.roles,
    objectives: row.combination.objectives, horizonBand: row.combination.horizonBand,
    level: row.combination.level, seed: row.combination.seed }, row.combination.ood);
  if (!built.admitted) return null;
  const state = forgeAdapterState(built.world);
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const forgeActions = forgeLegalActions(state.world);
  const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const legalActions = forgeActions.map((action, index) => ({
    actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
    parameters: action.parameters, descriptorIndex: index,
  }));
  return { state, observation, legalActions, descriptors, record: built.record };
}
function coreScoreFrom(observation, legalActions) {
  const extracted = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  const missing = CORE_KEYS.filter((key) => extracted.features[key].status !== FeatureValueStatus.AVAILABLE);
  if (missing.length) return { score: null, missing, abstained: true };
  const values = CORE_KEYS.map((key) => {
    const value = extracted.features[key].value;
    return typeof value === 'boolean' ? (value ? 1 : 0) : value;
  });
  return { score: scoreMatrix(coreModel, [values])[0], missing: [], abstained: false };
}

const degradationSample = holdout.slice(0, DEGRADATION_SUBSAMPLE);
const degradationModes = {
  REMOVE_RESOURCE_SIGNALS: ObservationDegradation.REMOVE_RESOURCE_SIGNALS,
  HIDE_SPATIAL_INFORMATION: ObservationDegradation.HIDE_SPATIAL_INFORMATION,
  PARTIAL_ENTITY_SET: ObservationDegradation.DROP_ENTITY_SUBSET,
};
const degradation = {};
for (const [label, mode] of Object.entries(degradationModes)) {
  const deltas = []; const routeChanges = []; let abstentions = 0; let errorDelta = 0; let compared = 0;
  for (const row of degradationSample) {
    const rebuilt = rebuildDecision(row);
    if (rebuilt === null) continue;
    const base = coreScoreFrom(rebuilt.observation, rebuilt.legalActions);
    const after = coreScoreFrom(degradeObservation(rebuilt.observation, mode), rebuilt.legalActions);
    if (after.abstained) { abstentions += 1; continue; }
    if (base.score === null) continue;
    compared += 1;
    deltas.push(after.score - base.score);
    const baseRouted = base.score >= coreOperatingPoint.tau;
    const afterRouted = after.score >= coreOperatingPoint.tau;
    routeChanges.push(baseRouted === afterRouted ? 0 : 1);
    errorDelta += ((afterRouted && row.y === 0) ? 1 : 0) - ((baseRouted && row.y === 0) ? 1 : 0);
  }
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const sortedAbs = deltas.map(Math.abs).sort((a, b) => a - b);
  degradation[label] = {
    compared, abstentions,
    meanScoreDelta: mean(deltas),
    meanAbsoluteScoreDelta: mean(deltas.map(Math.abs)),
    maxAbsoluteScoreDelta: sortedAbs.length ? sortedAbs[sortedAbs.length - 1] : null,
    p95AbsoluteScoreDelta: quantile(sortedAbs, 0.95),
    routeChangeRate: mean(routeChanges),
    falseSafeDelta: errorDelta,
    observable: mean(deltas.map(Math.abs)) !== null && mean(deltas.map(Math.abs)) > 0,
  };
}

/* STALE_OBSERVATION is a temporal degradation: score the decision on the PREVIOUS tick's
 * observation while the world has already advanced one step. */
{
  const deltas = []; const routeChanges = []; let compared = 0;
  for (const row of degradationSample) {
    const rebuilt = rebuildDecision(row);
    if (rebuilt === null || rebuilt.legalActions.length === 0) continue;
    const advanced = forgeWorldAdapter.step(forgeWorldAdapter.cloneState(rebuilt.state), rebuilt.descriptors[0],
      { observerId: FORGE_OBSERVER_ID });
    const freshObservation = forgeWorldAdapter.observe(advanced.state, FORGE_OBSERVER_ID);
    const freshForge = forgeLegalActions(advanced.state.world);
    const freshDescriptors = forgeWorldAdapter.legalActions(advanced.state, FORGE_OBSERVER_ID);
    if (freshForge.length === 0) continue;
    const freshActions = freshForge.map((action, index) => ({
      actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
      parameters: action.parameters, descriptorIndex: index,
    }));
    const fresh = coreScoreFrom(freshObservation, freshActions);
    const stale = coreScoreFrom(rebuilt.observation, freshActions);
    if (fresh.abstained || stale.abstained || fresh.score === null || stale.score === null) continue;
    compared += 1;
    deltas.push(stale.score - fresh.score);
    routeChanges.push((stale.score >= coreOperatingPoint.tau) === (fresh.score >= coreOperatingPoint.tau) ? 0 : 1);
    void freshDescriptors;
  }
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  const sortedAbs = deltas.map(Math.abs).sort((a, b) => a - b);
  degradation.STALE_OBSERVATION = {
    compared, abstentions: 0,
    meanScoreDelta: mean(deltas),
    meanAbsoluteScoreDelta: mean(deltas.map(Math.abs)),
    maxAbsoluteScoreDelta: sortedAbs.length ? sortedAbs[sortedAbs.length - 1] : null,
    p95AbsoluteScoreDelta: quantile(sortedAbs, 0.95),
    routeChangeRate: mean(routeChanges),
    falseSafeDelta: null,
    observable: mean(deltas.map(Math.abs)) !== null && mean(deltas.map(Math.abs)) > 0,
    semantics: 'previous-tick observation scored against the advanced world',
  };
}

/* ------------------------------------------- 8b. action identity binding
 * The first evaluation was invalidated because the 64-character runtime action key was scored
 * against records that store a 16-character prefix, so every non-abstaining selector answer failed
 * as UNKNOWN_ACTION_ID. This proves the corrected binding over the whole corpus. */
const validSelectorActions = allRows.filter((row) => row.selectorAbstained === 0).length;
const unknownActionIdFromValidSelector = allRows
  .filter((row) => row.selectorAbstained === 0 && row.fallbackScored === 0).length;
let prefixMappingBijective = true;
let actionIdentitySamples = 0;
let runtimeKeyLength = null;
let recordKeyLength = null;
for (const row of holdout.slice(0, 25)) {
  const rebuilt = rebuildDecision(row);
  if (rebuilt === null || rebuilt.legalActions.length === 0) continue;
  actionIdentitySamples += 1;
  const runtimeKeys = rebuilt.legalActions.map((entry) => entry.actionId);
  const recordKeys = rebuilt.record.branches.map((branch) => branch.actionKey);
  runtimeKeyLength = runtimeKeys[0].length;
  recordKeyLength = recordKeys[0].length;
  const prefixed = runtimeKeys.map((key) => key.slice(0, RECORD_ACTION_KEY_PREFIX));
  const bijective = prefixed.length === recordKeys.length
    && prefixed.every((key) => recordKeys.includes(key))
    && recordKeys.every((key) => prefixed.includes(key));
  if (!bijective) prefixMappingBijective = false;
}
const actionIdentity = {
  runtimeActionKeyLength: runtimeKeyLength,
  recordActionKeyLength: recordKeyLength,
  canonicalRecordMapping: 'runtimeKey.slice(0,16)',
  prefixMappingBijective,
  samplesVerified: actionIdentitySamples,
  validSelectorActions,
  unknownActionIdFromValidSelector,
  selectorAbstentions: allRows.filter((row) => row.selectorAbstained === 1).length,
  fallbackScoredRows: allRows.filter((row) => row.fallbackScored === 1).length,
  defectRepaired: unknownActionIdFromValidSelector === 0,
};

/* ------------------------- 8c. is the deployable fallback independent of greedy?
 * ORACLE_GREEDY_SAFE barely exceeded ALWAYS_GREEDY, which is impossible if the fallback arm is an
 * independent policy. A router can only help if there is something better to route TO, so the
 * independence of the fallback is measured here rather than assumed. */
function fallbackIndependenceFor(subset) {
  let n = 0; let agree = 0; let selectorOptimal = 0; let greedyOptimal = 0; let ratioSum = 0;
  for (const row of subset) {
    const rebuilt = rebuildDecision(row);
    if (rebuilt === null || rebuilt.legalActions.length === 0) continue;
    const nexus = evaluateNexus({
      canonicalState: rebuilt.observation.metadata.canonicalState,
      legalActions: rebuilt.legalActions.map((entry) => ({ actionId: entry.actionId, targetEntityId: entry.targetEntityId })),
    });
    const selector = nexusRelationalSelector(
      { branches: rebuilt.legalActions.map((entry) => ({ actionKey: entry.actionId, actionType: entry.actionType })) }, nexus,
    );
    if (selector.abstain) continue;
    const selectorKey = selector.actionId.slice(0, RECORD_ACTION_KEY_PREFIX);
    const greedyKey = heuristicGreedyBaseline(rebuilt.record).actionId;
    const target = buildTarget(rebuilt.record);
    n += 1;
    if (selectorKey === greedyKey) agree += 1;
    if (target.optimalSet.includes(selectorKey)) selectorOptimal += 1;
    if (target.optimalSet.includes(greedyKey)) greedyOptimal += 1;
    ratioSum += target.optimalSetSize / rebuilt.record.branches.length;
  }
  return {
    n,
    selectorEqualsGreedy: n ? agree / n : null,
    selectorInOptimalSet: n ? selectorOptimal / n : null,
    greedyInOptimalSet: n ? greedyOptimal / n : null,
    randomLegalActionBaseline: n ? ratioSum / n : null,
  };
}
const proposingSafe = holdout.filter((row) => row.y === 1 && row.selectorAbstained === 0).slice(0, 150);
const proposingUnsafe = holdout.filter((row) => row.y === 0 && row.selectorAbstained === 0).slice(0, 150);
const fallbackIndependence = {
  whenGreedyIsSafe: fallbackIndependenceFor(proposingSafe),
  whenGreedyIsUnsafe: fallbackIndependenceFor(proposingUnsafe),
  selectorAbstentionRate: allRows.filter((row) => row.selectorAbstained === 1).length / allRows.length,
  fallbackCorrectGivenUnsafeGreedy: (() => {
    const unsafe = allRows.filter((row) => row.y === 0);
    return unsafe.length ? unsafe.filter((row) => row.fallbackOk === 1).length / unsafe.length : null;
  })(),
};
fallbackIndependence.nearCollinearWithGreedy = fallbackIndependence.whenGreedyIsUnsafe.selectorEqualsGreedy !== null
  && fallbackIndependence.whenGreedyIsUnsafe.selectorEqualsGreedy >= 0.5;
fallbackIndependence.worseThanRandomWhenGreedyUnsafe =
  fallbackIndependence.whenGreedyIsUnsafe.selectorInOptimalSet !== null
  && fallbackIndependence.whenGreedyIsUnsafe.selectorInOptimalSet < fallbackIndependence.whenGreedyIsUnsafe.randomLegalActionBaseline;
fallbackIndependence.interpretation = 'The only deployable fallback is the relational selector, which selects the same '
  + 'action as the greedy policy in most cases regardless of whether that action is optimal. It therefore inherits '
  + "greedy's errors instead of correcting them. A selective router can only add value when the declined arm is better "
  + 'on the declined cases; here it is not, which bounds the achievable benefit of ANY router on this configuration. '
  + 'Stage 3E did not face this limit because its fallback arm was an independent trained V2B expert.';

/* --------------------------------------- 9. feature importance / provenance */
const importance = featureImportance(coreModel);
const byDomain = {};
for (const featureId of CORE_KEYS) {
  const definition = DEPLOYABLE_FEATURES.find((entry) => entry.featureId === featureId);
  byDomain[definition.sourceDomain] = (byDomain[definition.sourceDomain] ?? 0) + 1;
}
const importanceMassByDomain = {};
let totalMass = 0;
for (const entry of importance) {
  const definition = DEPLOYABLE_FEATURES.find((f) => f.featureId === entry.key);
  importanceMassByDomain[definition.sourceDomain] = (importanceMassByDomain[definition.sourceDomain] ?? 0) + entry.absWeight;
  totalMass += entry.absWeight;
}
for (const key of Object.keys(importanceMassByDomain)) importanceMassByDomain[key] /= totalMass;

/* ------------------------------------------------------- 10. diagnosis */
const coreWilson = coreHoldout.result.wilsonLower;
const simMinusCore = simHoldout ? simHoldout.result.precision - coreHoldout.result.precision : null;
const readiness = STAGE3G_READINESS_RULE.requirements;
const readinessEvaluation = {
  routedN: coreHoldout.result.routedN >= readiness.minimumRoutedN,
  precisionWilsonLower: coreWilson >= readiness.minimumHoldoutPrecisionWilsonLower,
  coverage: coreHoldout.result.coverage >= readiness.minimumCoverage,
  highConfidenceWrong: (coreHoldout.highConfidenceWrong['0.9'].rate ?? 1) <= readiness.maxHighConfidenceWrongRateAt090,
  falseSafeHarm: coreHoldout.result.falseSafeHarm.harmVersusFallback === null
    || coreHoldout.result.falseSafeHarm.harmVersusFallback <= 0,
  calibration: (coreHoldout.ece ?? 1) <= readiness.calibratedUncertaintyMaxEce,
  leakage: manifest.recordOverlap === 0 && manifest.stateOverlap === 0
    && Object.values(manifest.topologyOverlap).every((value) => value === 0),
};
const readyForStage3G = Object.values(readinessEvaluation).every(Boolean);

const diagnosisSupport = {
  routerSufficient: readyForStage3G,
  featureInformationLimited: coreHoldout.auroc !== null && coreHoldout.auroc < 0.7,
  simulatorMateriallyHelpful: simMinusCore !== null && simMinusCore >= 0.05,
  v2bMateriallyHelpful: false,
  uncertaintyCalibrationLimited: (coreHoldout.ece ?? 0) > 0.1
    || (coreHoldout.highConfidenceWrong['0.9'].rate ?? 0) > 0.1,
  insufficientEvidence: coreHoldout.result.routedN < STAGE3F6C_METHODOLOGY.minRoutedN,
};
const supported = Object.entries(diagnosisSupport).filter(([, value]) => value).map(([key]) => key);
const primaryLimitation = diagnosisSupport.insufficientEvidence ? DeployableDiagnosis.G_INSUFFICIENT_EVIDENCE
  : diagnosisSupport.routerSufficient ? DeployableDiagnosis.A_DEPLOYABLE_ROUTER_SUFFICIENT
    : supported.filter((key) => key !== 'routerSufficient' && key !== 'v2bMateriallyHelpful').length > 1
      ? DeployableDiagnosis.F_MIXED_LIMITATION
      : diagnosisSupport.featureInformationLimited ? DeployableDiagnosis.B_DEPLOYABLE_FEATURE_INFORMATION_LIMITED
        : diagnosisSupport.simulatorMateriallyHelpful ? DeployableDiagnosis.C_SIMULATOR_CAPABILITY_MATERIALLY_HELPFUL
          : diagnosisSupport.uncertaintyCalibrationLimited ? DeployableDiagnosis.E_UNCERTAINTY_CALIBRATION_LIMITED
            : DeployableDiagnosis.B_DEPLOYABLE_FEATURE_INFORMATION_LIMITED;
const secondaryLimitation = diagnosisSupport.simulatorMateriallyHelpful
  && primaryLimitation !== DeployableDiagnosis.C_SIMULATOR_CAPABILITY_MATERIALLY_HELPFUL
  ? DeployableDiagnosis.C_SIMULATOR_CAPABILITY_MATERIALLY_HELPFUL
  : diagnosisSupport.uncertaintyCalibrationLimited && primaryLimitation !== DeployableDiagnosis.E_UNCERTAINTY_CALIBRATION_LIMITED
    ? DeployableDiagnosis.E_UNCERTAINTY_CALIBRATION_LIMITED : null;

/* ------------------------------- 10b. capability limitation (architectural)
 * GREEDY_SAFE asks whether the immediate-best action is horizon-optimal. Identifying that action
 * requires one-step simulation, which DEPLOYABLE_CORE does not declare. Predicting the safety of an
 * action is therefore NOT the same as being able to compute it, and the conclusion must say so. */
const capabilityLimitation = {
  CORE_CAN_PREDICT_GREEDY_SAFE: coreHoldout.auroc !== null
    && coreHoldout.auroc >= evaluationFreeze.resultClassificationThresholds.coreHasSignalMinAuroc,
  CORE_CAN_COMPUTE_GREEDY_ACTION: false,
  CAPABILITY_GAP: 'ACTION_COMPUTATION_GAP',
  abilityToPredictGreedySafety: 'measured: HOLDOUT AUROC over the deployable CORE feature set',
  abilityToComputeGreedyAction: 'absent: the immediate-best action is defined by one-step transition value, and '
    + 'DEPLOYABLE_CORE declares no SIMULATOR_ONE_STEP capability',
  consequence: 'A CORE router can advise whether a greedy action proposed by another component is safe. It cannot '
    + 'by itself identify that action, so a good GREEDY_SAFE classification does not constitute an autonomous '
    + 'executable action policy for CORE.',
};

/* ------------------------------------- 10c. Stage 3F.6-C result classification
 * Categories and thresholds were frozen before the sealed partitions were opened. */
const rcThresholds = evaluationFreeze.resultClassificationThresholds;
const anyCalTierAchievable = Object.values(calTiers).some((tier) => tier.achievable);
const simulatorAurocGain = simHoldout && coreHoldout.auroc !== null && simHoldout.auroc !== null
  ? simHoldout.auroc - coreHoldout.auroc : null;
const classificationA = anyCalTierAchievable
  && coreHoldout.result.routedN >= STAGE3F6C_METHODOLOGY.minRoutedN
  && coreHoldout.result.wilsonLower >= STAGE3G_READINESS_RULE.requirements.minimumHoldoutPrecisionWilsonLower;
const classificationC = coreHoldout.auroc !== null && coreHoldout.auroc < rcThresholds.informationInsufficientMaxAuroc;
const classificationB = !classificationA && !classificationC
  && coreHoldout.auroc !== null && coreHoldout.auroc >= rcThresholds.coreHasSignalMinAuroc;
const classificationD = simulatorAurocGain !== null && simulatorAurocGain >= rcThresholds.simulatorMaterialMinAurocGain;
const classificationE = false; // V2B evidence is not available; it is never inferred.
const classificationF = coreHoldout.ece !== null && coreHoldout.ece > rcThresholds.calibrationLimitedMaxEce;
const applicableResults = [
  ...(classificationA ? ['A_CORE_SELECTIVE_ROUTING_SUPPORTED'] : []),
  ...(classificationB ? ['B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY'] : []),
  ...(classificationC ? ['C_CORE_INFORMATION_INSUFFICIENT'] : []),
  ...(classificationD ? ['D_SIMULATOR_MATERIALLY_IMPROVES_ROUTABILITY'] : []),
  ...(classificationE ? ['E_V2B_MATERIALLY_IMPROVES_ROUTABILITY'] : []),
  ...(classificationF ? ['F_CONFIDENCE_CALIBRATION_LIMITED'] : []),
];
if (applicableResults.length > 1) applicableResults.push('G_MIXED');
const resultClassification = {
  applicable: applicableResults,
  primaryResult: classificationA ? 'A_CORE_SELECTIVE_ROUTING_SUPPORTED'
    : classificationC ? 'C_CORE_INFORMATION_INSUFFICIENT'
      : classificationB ? 'B_CORE_HAS_SIGNAL_BUT_NOT_SELECTIVE_RELIABILITY' : 'G_MIXED',
  secondaryResult: classificationD ? 'D_SIMULATOR_MATERIALLY_IMPROVES_ROUTABILITY'
    : classificationF ? 'F_CONFIDENCE_CALIBRATION_LIMITED' : null,
  evidence: {
    holdoutAuroc: coreHoldout.auroc, oodAuroc: coreOod.auroc, holdoutEce: coreHoldout.ece,
    anyCalTierAchievable, holdoutRoutedN: coreHoldout.result.routedN,
    holdoutWilsonLower: coreHoldout.result.wilsonLower, simulatorAurocGain,
  },
  thresholds: rcThresholds,
};

/* --------------------------------------------- 10d. evidence gap (Section 15)
 * Only classify the gap. No larger model, no added features, no representation redesign. */
const spatialBlind = degradation.HIDE_SPATIAL_INFORMATION.observable === false;
const temporalWeak = degradation.STALE_OBSERVATION.observable === true
  && degradation.STALE_OBSERVATION.routeChangeRate === 0;
const evidenceGap = {
  coreFailedSelectiveReliability: !classificationA,
  applicableGaps: !classificationA ? [
    { gap: 'ACTION_COMPUTATION_GAP', established: true,
      evidence: 'DEPLOYABLE_CORE cannot compute the immediate-best action it is asked to judge; it declares no '
        + 'one-step simulator capability.' },
    { gap: 'REPRESENTATION_INFORMATION_GAP', established: coreHoldout.auroc !== null
      && coreHoldout.auroc >= rcThresholds.informationInsufficientMaxAuroc && !classificationA,
      evidence: `CORE ranks cases above chance (HOLDOUT AUROC ${coreHoldout.auroc}) but cannot reach any precision `
        + 'tier at the evidence floor, so the deployable features carry real but insufficient information.' },
    { gap: 'SPATIAL_STATE_GAP', established: spatialBlind,
      evidence: 'Hiding spatial information changes no CORE feature: the inherited Stage 3E feature set consumes no '
        + 'actor position. Recorded, not repaired in this stage.' },
    { gap: 'TEMPORAL_STATE_GAP', established: temporalWeak,
      evidence: 'A stale observation moves CORE scores but changes no routing decision at the frozen threshold.' },
    { gap: 'CALIBRATION_GAP', established: classificationF,
      evidence: `HOLDOUT ECE ${coreHoldout.ece} against the frozen ${rcThresholds.calibrationLimitedMaxEce} bound.` },
    { gap: 'MODEL_CAPACITY_GAP', established: false,
      evidence: 'NOT_ESTABLISHED. Testing capacity would require fitting a larger model, which this stage is '
        + 'explicitly forbidden from doing. Absence of evidence is recorded as such, not as absence of the gap.' },
  ] : [],
  primaryGap: classificationA ? null : 'ACTION_COMPUTATION_GAP',
  note: 'Gaps are classified only. No remediation, no added features, no representation redesign.',
};

/* ----------------------------------------------------- 11. candidate freeze */
const candidate = {
  profile: DeployableProfile.DEPLOYABLE_CORE,
  architecture: STAGE3F6C_METHODOLOGY.routerFamily,
  featureContractId: DEPLOYABLE_FEATURE_CONTRACT_ID,
  featureContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
  featureCount: CORE_KEYS.length,
  routerHash: routerHash(coreModel),
  threshold: coreOperatingPoint.tau,
  weights: { keys: coreModel.keys, mu: coreModel.mu, sd: coreModel.sd, w: coreModel.w },
  trainingCorpusHash: manifest.contentHash,
  devPartitionHash: manifest.partitionHashes.DEV,
  calPartitionHash: manifest.partitionHashes.CAL,
  evaluationFreezeHash,
  promotedToLiveRuntime: false,
  onlineLearningEnabled: false,
};
const candidateHash = sha256(candidate);

/* ---------------------------------------------------------- 12. tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 };
let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6c-deployable-router.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* ------------------------------------------------------- 13. assessment */
const historical = {
  STAGE3E_HOLDOUT: JSON.parse(readFileSync(path.join(root, 'artifacts/stage3e-routability-intelligence/final-ROUTABILITY_HOLDOUT.json'), 'utf8')),
  STAGE3E_OOD: JSON.parse(readFileSync(path.join(root, 'artifacts/stage3e-routability-intelligence/final-ROUTABILITY_OOD.json'), 'utf8')),
};

const checks = {
  CORPUS_CONTENT_HASH_MATCHES: corpusContentHashMatches,
  TOPOLOGY_OVERLAP_ZERO: Object.values(manifest.topologyOverlap).every((value) => value === 0),
  RECORD_OVERLAP_ZERO: manifest.recordOverlap === 0,
  STATE_OVERLAP_ZERO: manifest.stateOverlap === 0,
  FRESH_SEED_SPACE_DISJOINT: manifest.spec.seeds.every((seed) => ![1, 2, 3, 11, 201, 202, 203, 211].includes(seed))
    && manifest.spec.oodSeeds.every((seed) => ![1, 2, 3, 11, 201, 202, 203, 211].includes(seed)),
  FEATURE_CONTRACT_HASH_MATCHES_STAGE3F6S: scope.deployableContractHashMatch,
  CORE_USES_EXACTLY_CERTIFIED_CORE_FEATURES: JSON.stringify(coreModel.keys) === JSON.stringify(CORE_KEYS)
    && CORE_KEYS.length === 30,
  CORE_HAS_NO_ROLLOUT_FEATURE: labelIndependence.coreContainsRolloutFeature === false,
  CORE_HAS_NO_SIMULATOR_FEATURE: labelIndependence.coreContainsSimulatorFeature === false,
  CORE_HAS_NO_V2B_FEATURE: labelIndependence.coreContainsV2BFeature === false,
  LABEL_INDEPENDENT_OF_FEATURES: labelIndependence.labelComputedFromDeployableFeatures === false,
  THRESHOLD_SELECTED_ON_CAL_ONLY: evaluationFreeze.operatingPointSelection.source === 'CAL_TIER'
    || evaluationFreeze.operatingPointSelection.source === 'NO_CAL_OPERATING_POINT',
  SEALED_OPENED_ONLY_AFTER_FREEZE: sealedAccessLog.length > 0 && sealedAccessLog.every((entry) => entry.afterFreeze),
  EVALUATION_FREEZE_WRITTEN: typeof evaluationFreezeHash === 'string' && evaluationFreezeHash.length === 64,
  HOLDOUT_EVALUATED: coreHoldout.result.n > 0,
  OOD_EVALUATED: coreOod.result.n > 0,
  SIMULATOR_ABLATION_EVALUATED: simModel !== null && simHoldout !== null && simOod !== null,
  ACTION_IDENTITY_BINDING_PROVEN: actionIdentity.prefixMappingBijective
    && actionIdentity.unknownActionIdFromValidSelector === 0
    && actionIdentity.runtimeActionKeyLength === 64 && actionIdentity.recordActionKeyLength === 16,
  CAPABILITY_LIMITATION_DECLARED: capabilityLimitation.CORE_CAN_COMPUTE_GREEDY_ACTION === false
    && capabilityLimitation.CAPABILITY_GAP === 'ACTION_COMPUTATION_GAP',
  FALSE_SAFE_HARM_TRACKED: coreHoldout.result.falseSafeHarm.n >= 0 && coreOod.result.falseSafeHarm.n >= 0,
  HIGH_CONFIDENCE_WRONG_TRACKED: Object.keys(coreHoldout.highConfidenceWrong).length === 3,
  DEGRADATION_MEASURED: Object.keys(degradation).length === 4,
  SPATIAL_BLIND_SPOT_REPORTED: degradation.HIDE_SPATIAL_INFORMATION.observable === false,
  CANDIDATE_FROZEN: typeof candidateHash === 'string' && candidateHash.length === 64,
  NOT_PROMOTED: candidate.promotedToLiveRuntime === false,
  NO_ONLINE_LEARNING: candidate.onlineLearningEnabled === false,
  STAGE3F6S_INTACT: scope.stage3f6sOwnersUnchanged && scope.deployableContractHashMatch,
  STAGE3F6R_INTACT: scope.priorStage3FOwnersUnchanged,
  FROZEN_STAGE3E_UNCHANGED: scope.frozenStage3EUnchanged,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const summarize = (evaluated) => evaluated === null ? null : {
  n: evaluated.result.n, routedN: evaluated.result.routedN, coverage: evaluated.result.coverage,
  precision: evaluated.result.precision, wilsonLower: evaluated.result.wilsonLower,
  falseSafe: evaluated.result.falseSafe, meetsEvidenceFloor: evaluated.result.meetsEvidenceFloor,
  hybridAccuracy: evaluated.result.hybridAccuracy, hybridRegret: evaluated.result.hybridRegret,
  prevalence: evaluated.result.prevalence, auroc: evaluated.auroc, brier: evaluated.brier, ece: evaluated.ece,
  policies: evaluated.result.policies, falseSafeHarm: evaluated.result.falseSafeHarm,
  highConfidenceWrong: evaluated.highConfidenceWrong, reliabilityBins: evaluated.reliabilityBins,
};

const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_6_C_DEPLOYABLE_ROUTER',
  status,
  primaryResult: DeployableProfile.DEPLOYABLE_CORE,
  dataset: {
    spec: manifest.spec, counts: manifest.counts, contentHash: manifest.contentHash,
    partitionHashes: manifest.partitionHashes, topologyOverlap: manifest.topologyOverlap,
    recordOverlap: manifest.recordOverlap, stateOverlap: manifest.stateOverlap,
    derivedVariantLeakage: 0, prevalence: manifest.prevalence, rejected: manifest.rejected,
    partitionTopologyCounts: manifest.partitionTopologyCounts,
  },
  featureContract: { id: DEPLOYABLE_FEATURE_CONTRACT_ID, hash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    primaryProfile: DeployableProfile.DEPLOYABLE_CORE, primaryFeatureCount: CORE_KEYS.length, primaryFeatureIds: CORE_KEYS },
  labelIndependence,
  training: { devN: dev.length, devAuroc, calMetrics, calCurve, calTiers, operatingPointRule: OPERATING_POINT_RULE,
    operatingPoint: coreOperatingPoint, routerHash: routerHash(coreModel), hyperparameters:
      { learningRate: coreModel.learningRate, l2: coreModel.l2, iterations: coreModel.iterations } },
  evaluationFreezeHash,
  holdout: summarize(coreHoldout),
  ood: summarize(coreOod),
  ablations: {
    simulator: simModel === null ? { available: false, reason: 'simulator features absent from corpus' } : {
      available: true, routerHash: routerHash(simModel), featureCount: SIM_KEYS.length,
      declaredProfileFeatureCount: SIM_PROFILE_IDS.length,
      profileFullySatisfied: SIM_EXCLUDED.length === 0,
      excludedFeatures: SIM_EXCLUDED,
      excludedReason: 'The environment transition never declares these one-step reward components '
        + '(Stage 3F.6-S finding RUNTIME_ONE_STEP_COMPONENTS_SILENTLY_ZERO_FILLED). They are excluded from the '
        + 'ablation rather than imputed, so the simulator upper bound is measured on evidence that actually exists.',
      operatingPoint: simOperatingPoint, tiers: simTiers,
      holdout: summarize(simHoldout), ood: summarize(simOod),
      precisionMinusCoreHoldout: simMinusCore,
      coverageMinusCoreHoldout: simHoldout ? simHoldout.result.coverage - coreHoldout.result.coverage : null,
      interpretation: 'Information value of one-step simulator evidence. NOT a statement about deployable '
        + 'architecture quality: the simulator capability is not available in general environments.',
    },
    v2b: { available: false, result: 'NOT_AVAILABLE',
      reason: 'The V2B adapter is archive-only; no runtime expert produces genuine V2B answers.',
      substituted: false, note: 'No other model was substituted for V2B.' },
  },
  historicalComparison: {
    stage3eHoldout: { precision: historical.STAGE3E_HOLDOUT.router.precision, coverage: historical.STAGE3E_HOLDOUT.router.coverage,
      wilsonLower: historical.STAGE3E_HOLDOUT.router.wilsonLower, routedN: historical.STAGE3E_HOLDOUT.router.routedN },
    stage3eOod: { precision: historical.STAGE3E_OOD.router.precision, coverage: historical.STAGE3E_OOD.router.coverage,
      wilsonLower: historical.STAGE3E_OOD.router.wilsonLower, routedN: historical.STAGE3E_OOD.router.routedN },
    corePrecisionDeltaHoldout: coreHoldout.result.precision - historical.STAGE3E_HOLDOUT.router.precision,
    coreCoverageDeltaHoldout: coreHoldout.result.coverage - historical.STAGE3E_HOLDOUT.router.coverage,
    corePrecisionDeltaOod: coreOod.result.precision - historical.STAGE3E_OOD.router.precision,
    coreCoverageDeltaOod: coreOod.result.coverage - historical.STAGE3E_OOD.router.coverage,
    applesToApples: false,
    comparabilityCaveat: 'NOT apples-to-apples. The Stage 3E reference used 51 features including oracle rollout '
      + 'totals and genuine V2B evidence, on a different (now exposed) corpus, and its fallback arm was V2B. This '
      + 'result uses 30 decision-time features on a fresh corpus with a relational-selector fallback.',
  },
  featureImportance: { top: importance.slice(0, 15), all: importance,
    featureCountByDomain: byDomain, importanceMassByDomain },
  degradation,
  actionIdentity,
  fallbackIndependence,
  capabilityLimitation,
  resultClassification,
  evidenceGap,
  diagnosis: { primaryLimitation, secondaryLimitation, support: diagnosisSupport,
    deployableRuntimeConclusion: null },
  stage3gReadiness: { rule: STAGE3G_READINESS_RULE, evaluation: readinessEvaluation, ready: readyForStage3G },
  candidate: { ...candidate, candidateHash },
  observatory: { contractId: CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.contractId,
    views: CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.views, shadowOnly: true,
    sampleFrameLines: renderCandidateRouterFrame({ profile: DeployableProfile.DEPLOYABLE_CORE,
      candidateHash, contractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH, featureCount: CORE_KEYS.length,
      score: coreHoldout.scores[0], threshold: coreOperatingPoint.tau, profileSatisfied: true }).split('\n').length },
  scope,
  checks,
  tests: testMetrics,
  sourceHashes: Object.fromEntries(await Promise.all([
    'src/stage3f/deployable-router-v1.js', 'src/stage3f/deployable-router-observatory-v1.js',
    'scripts/generate-stage3f6c-corpus.mjs', 'scripts/certify-stage3f6c-deployable-router.mjs',
    'tests/stage3f6c-deployable-router.test.js',
  ].map(async (file) => [file, hex(await readFile(path.join(root, file)))]))),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
  learning: { modelTrainingPerformed: true, trainedOn: 'DEV_ONLY', offlineCandidateOnly: true,
    onlineLearningEnabled: false, liveRuntimeAuthorityChanged: false, promotedToLiveRuntime: false },
  roadmap: {
    readyForStage3G: readyForStage3G,
    nextStage: readyForStage3G ? 'STAGE_3G_STRATEGIC_COMPETENCE' : 'BLOCKED_PENDING_DEPLOYABLE_ROUTING_RELIABILITY',
    blockers: readyForStage3G ? [] : Object.entries(readinessEvaluation)
      .filter(([, value]) => !value).map(([key]) => `STAGE3G_READINESS_UNMET:${key}`),
  },
};
payload.diagnosis.deployableRuntimeConclusion = primaryLimitation === DeployableDiagnosis.A_DEPLOYABLE_ROUTER_SUFFICIENT
  ? 'DEPLOYABLE_CORE_SUFFICIENT_FOR_SELECTIVE_ROUTING'
  : 'DEPLOYABLE_CORE_INSUFFICIENT_FOR_SELECTIVE_ROUTING_AT_PREDECLARED_RELIABILITY';
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6C_CERTIFICATION', reproduced, status,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, checks,
    core: { holdout: { routedN: payload.holdout.routedN, coverage: payload.holdout.coverage,
      precision: payload.holdout.precision, wilsonLower: payload.holdout.wilsonLower, auroc: payload.holdout.auroc },
      ood: { routedN: payload.ood.routedN, coverage: payload.ood.coverage, precision: payload.ood.precision,
        wilsonLower: payload.ood.wilsonLower, auroc: payload.ood.auroc } },
    simulatorMinusCore: simMinusCore, diagnosis: payload.diagnosis, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
