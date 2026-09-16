#!/usr/bin/env node
/* STAGE_3F_6_S_DEPLOYABLE_FEATURE_CONTRACT — contract substage certification.
 *
 * Certifies WHAT SENTINEL MAY KNOW at decision time, not how well it predicts. It proves:
 * every frozen Stage 3E feature is classified, the admissibility rules were frozen before
 * selection, capability binding actually gates profiles, missing evidence never becomes zero,
 * features are invariant to future outcomes, and the deployable path reads the observation.
 *
 * It makes NO reliability claim, retrains nothing, and tunes no threshold.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEPLOYABLE_ADMISSIBILITY_RULES, DEPLOYABLE_FEATURES, DEPLOYABLE_FEATURE_CONTRACT,
  DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES,
  DeployableProfile, FeatureValueStatus, MISSING_VALUE_SEMANTICS, STAGE3E_DEPENDENCY_SETS,
  Stage3EDeployableStatus, V2B_AVAILABILITY, WORLD_STATE_COVERAGE_AUDIT, classifyStage3EContract,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { DEPLOYABLE_OBSERVATORY_CONTRACT, renderDeployableFrame } from '../src/stage3f/deployable-observatory-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { createWorld, forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import { sha256 } from '../src/core/determinism.js';
import * as H from './stage3f6r-reference-parity-harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6s-deployable-feature-contract');
const resultPath = path.join(outDirectory, 'stage3f6s-certification-result.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = async (relative) => hex(await readFile(path.join(root, relative)));
const readSource = (relative) => readFile(path.join(root, relative), 'utf8');

/* ------------------------------------------------------------------ scope */
const prefix = (relative) => `platform/game-agnostic/${relative}`;
const gitClean = (...paths) => {
  const result = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'GIT_UNAVAILABLE';
};
const unchanged = (...paths) => gitClean(...paths) === '';

const FROZEN_STAGE3E = ['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered',
  'artifacts/stage3de-recovery-canonicalization', 'training/stage3cr3/identity'].map(prefix);
const STAGE3F0_TO_3F4_OWNERS = ['src/stage3f/world-state-v1.js', 'src/stage3f/causal-trace-v1.js',
  'src/stage3f/environment-calibration-v1.js', 'src/stage3f/counterfactual-veto-ledger-v1.js',
  'src/stage3f/shadow-experience-buffer-v1.js', 'artifacts/stage3f0-world-state-contract',
  'artifacts/stage3f1-causal-trace', 'artifacts/stage3f2-environment-calibration',
  'artifacts/stage3f3-counterfactual-veto-ledger', 'artifacts/stage3f4-shadow-experience-buffer'].map(prefix);
const PRIOR_CERTIFICATIONS = ['artifacts/stage3f5-integrated-live-shadow', 'artifacts/stage3f6-prediction-reliability',
  'artifacts/stage3f6r-runtime-parity-remediation', 'src/stage3f/integrated-live-shadow-v1.js',
  'src/stage3f/prediction-reliability-v1.js', 'scripts/stage3f6r-reference-parity-harness.mjs'].map(prefix);

const scope = {
  frozenStage3EUnchanged: unchanged(...FROZEN_STAGE3E),
  stage3f0To3f4OwnersUnchanged: unchanged(...STAGE3F0_TO_3F4_OWNERS),
  priorCertificationsUnchanged: unchanged(...PRIOR_CERTIFICATIONS),
  newOwners: ['src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js',
    'src/stage3f/deployable-observatory-v1.js', 'scripts/certify-stage3f6s-deployable-feature-contract.mjs',
    'tests/stage3f6s-deployable-feature-contract.test.js'],
  existingOwnersModified: ['package.json'],
};

/* --------------------------------------------------- 1. classification */
const frozenModel = JSON.parse(await readFile(path.join(root, 'artifacts/stage3e-routability-intelligence/lr-model.json'), 'utf8'));
const frozenKeys = frozenModel.keys;
const classification = classifyStage3EContract(frozenKeys);
const statusTally = {};
for (const entry of classification) statusTally[entry.deployableStatus] = (statusTally[entry.deployableStatus] ?? 0) + 1;

// The dependency sets must agree with the Stage 3F.6-R harness, or the two gates disagree about reality.
const harnessDependencies = H.featureDependencies(frozenKeys);
const classificationAgreesWithHarness = classification.every((entry) => {
  const dependency = harnessDependencies[entry.featureName];
  return dependency.multiStepRollout === entry.usesMultiStepRollout
    && dependency.requiresV2B === entry.usesV2B
    && dependency.simulatorDependent === entry.usesSimulator;
});

/* --------------------------------------------------- 2. decision point */
const seed = 501n;
const world = createWorld(seed, generateScenario({ family: 'prime/adversarial_choice', level: 1, seed }));
const state = forgeAdapterState(world);
const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
const forgeActions = forgeLegalActions(state.world);
const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
const legalActions = forgeActions.map((action, index) => ({
  actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
  parameters: action.parameters, descriptorIndex: index,
}));

/** One-step capability over an ISOLATED copy. Never mutates the decision state. */
const simulator = {
  horizonSteps: 1,
  oneStep(actionId) {
    const entry = legalActions.find((candidate) => candidate.actionId === actionId);
    const isolated = forgeWorldAdapter.cloneState(state);
    const result = forgeWorldAdapter.step(isolated, descriptors[entry.descriptorIndex], { observerId: FORGE_OBSERVER_ID });
    return { reward: result.reward, rewardVector: result.info.rewardVector, terminal: result.terminal };
  },
};

const core = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
const withSimulator = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
const withoutSimulator = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR });
const withV2BAbsent = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator });
const withV2BSubstituted = extractDeployableFeatures({
  observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator,
  v2bAnswer: { actionId: legalActions[0].actionId, provenance: 'SOME_OTHER_PRODUCER' },
});
const withV2BGenuine = extractDeployableFeatures({
  observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator,
  v2bAnswer: { actionId: legalActions[0].actionId, provenance: 'GENUINE_V2B' },
});

const statusesOf = (result) => Object.fromEntries(result.profileFeatureIds.map((id) => [id, result.features[id].status]));
const undeclaredOneStepComponents = withSimulator.profileFeatureIds
  .filter((id) => withSimulator.features[id].status === FeatureValueStatus.UNKNOWN)
  .map((id) => ({ featureId: id, reason: withSimulator.features[id].reason }));

/* ------------------------------------------- 3. missing-value semantics */
const allResults = [core, withSimulator, withoutSimulator, withV2BAbsent, withV2BSubstituted, withV2BGenuine];
const zeroFillViolations = [];
for (const result of allResults) {
  for (const [featureId, entry] of Object.entries(result.features)) {
    if (entry.status !== FeatureValueStatus.AVAILABLE && entry.value !== null) {
      zeroFillViolations.push({ profile: result.profile, featureId, value: entry.value, status: entry.status });
    }
  }
}

const capabilityBinding = {
  simulatorAbsentUnsatisfied: withoutSimulator.profileSatisfied === false,
  simulatorAbsentMissing: withoutSimulator.capabilities.missingCapabilities,
  simulatorAbsentUnavailableCount: withoutSimulator.counts.unavailable,
  simulatorAbsentZeroFilled: withoutSimulator.profileFeatureIds
    .filter((id) => withoutSimulator.features[id].status === FeatureValueStatus.UNAVAILABLE && withoutSimulator.features[id].value !== null).length,
  v2bAbsentUnsatisfied: withV2BAbsent.profileSatisfied === false,
  v2bSubstitutionRefused: withV2BSubstituted.profileSatisfied === false
    && withV2BSubstituted.features['expert.allThreeAgree'].status === FeatureValueStatus.UNAVAILABLE,
  v2bGenuineSatisfied: withV2BGenuine.profileSatisfied === true,
  coreSatisfiedWithoutSimulatorOrV2B: core.profileSatisfied === true,
};

let multiStepRejected = false;
try {
  extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR,
    simulator: { horizonSteps: 8, oneStep: () => ({ reward: 0 }) } });
} catch { multiStepRejected = true; }
let rolloutCapabilityRejected = false;
try {
  extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR,
    simulator: { horizonSteps: 1, oneStep: () => ({ reward: 0 }), rollout: () => [] } });
} catch { rolloutCapabilityRejected = true; }

/* --------------------------------------------- 4. static leakage audit */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FORBIDDEN_READS = ['totalRewardVector', 'scalarReward', 'regret', 'optimalActionKey', 'optimalScalar',
  'horizonClass', 'supervisionClass', 'supervisionMargin', 'greedyRegret', 'paretoTradeoff', 'outOfDistribution',
  'actualOutcome', 'evaluateCounterfactualsV2', 'GREEDY_CONTINUATION_V1', 'state.world', 'world.constraints',
  'observationHistory', 'sealed', 'holdout'];
const auditedSources = ['src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js'];
const staticLeakage = [];
for (const relative of auditedSources) {
  const source = stripComments(await readSource(relative));
  for (const token of FORBIDDEN_READS) {
    if (source.includes(token)) staticLeakage.push({ source: relative, token });
  }
}

/* ------------------------------ 5. dynamic hindsight / future invariance */
const baselineFeatures = JSON.stringify(withSimulator.features);
const futures = [];
for (const entry of legalActions) {
  const isolated = forgeWorldAdapter.cloneState(state);
  const result = forgeWorldAdapter.step(isolated, descriptors[entry.descriptorIndex], { observerId: FORGE_OBSERVER_ID });
  futures.push({ actionId: entry.actionId, reward: result.reward, terminal: result.terminal });
}
// Re-extract at the SAME decision point after every possible future has been realised elsewhere.
const afterFutures = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
const futureInvariant = JSON.stringify(afterFutures.features) === baselineFeatures;
const distinctFutures = new Set(futures.map((entry) => `${entry.reward}:${entry.terminal}`)).size;
const decisionStateUnmutated = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID).metadata.worldHash === observation.metadata.worldHash;

/* ---------------------------------------- 6. observation degradation */
const degradationResponse = {};
for (const mode of Object.values(ObservationDegradation)) {
  if (mode === ObservationDegradation.STALE_OBSERVATION) continue;
  const degraded = degradeObservation(observation, mode);
  const after = extractDeployableFeatures({ observation: degraded, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  const changed = core.profileFeatureIds.filter((id) =>
    JSON.stringify(core.features[id].value) !== JSON.stringify(after.features[id].value)
    || core.features[id].status !== after.features[id].status);
  degradationResponse[mode] = { featuresChanged: changed.length, changed };
}
const schemaMismatch = extractDeployableFeatures({
  observation: { ...observation, schemaId: 'foreign/observation' }, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE,
});
const failsClosedOnForeignSchema = schemaMismatch.profileSatisfied === false
  && core.profileFeatureIds.every((id) => schemaMismatch.features[id].status !== FeatureValueStatus.AVAILABLE
    || DEPLOYABLE_FEATURES.find((f) => f.featureId === id).sourceDomain !== 'OBSERVATION_DERIVED');

/* ------------------------------------------------- 7. contract identity */
const reorderDeep = (value) => {
  if (Array.isArray(value)) return value.map(reorderDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort().reverse()) out[key] = reorderDeep(value[key]);
    return out;
  }
  return value;
};
const keyOrderInvariant = sha256(reorderDeep(JSON.parse(JSON.stringify(DEPLOYABLE_FEATURE_CONTRACT)))) === DEPLOYABLE_FEATURE_CONTRACT_HASH;
const repeat = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
const extractionDeterministic = JSON.stringify(repeat.features) === baselineFeatures;

/* ------------------------------------------------ 8. router compatibility */
const coreIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
const routerCompatibility = {
  frozenRouterFeatureCount: frozenKeys.length,
  deployableCoreFeatureCount: coreIds.length,
  reproducesFrozen51FeatureVector: false,
  status: 'INCOMPATIBLE_WITHOUT_RETRAINING',
  reason: 'The frozen Stage 3E router consumes 51 standardized features in a fixed key order, 21 of which are not '
    + 'admissible here (7 rollout-derived, 5 V2B-dependent, 9 simulator-dependent). DEPLOYABLE_CORE supplies 30 and '
    + 'DEPLOYABLE_WITH_SIMULATOR supplies 46 under redefined identities, so the frozen weight vector cannot be applied.',
  routerRetrained: false,
  routerThresholdsTuned: false,
  retrainingAuthorized: false,
  nextStepRequiresAuthorization: 'Retraining or refitting any router on this contract is out of scope for Stage 3F.6-S.',
};

/* ------------------------------------------------ 9. reference parity kept */
const referenceParityPreserved = H.STAGE3F6R_FEATURE_MODES.REFERENCE_PARITY_MODE.oneStepRuntimeSafe === false
  && H.STAGE3F6R_FEATURE_MODES.REFERENCE_PARITY_MODE.simulatorFree === false
  && DEPLOYABLE_FEATURE_CONTRACT.referenceContract.modified === false
  && DEPLOYABLE_FEATURE_CONTRACT.referenceContract.overwritten === false;
const frozenContractHashIntact = DEPLOYABLE_FEATURE_CONTRACT.referenceContract.hash
  === '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb';

/* ----------------------------------------------------------- 10. tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 };
let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6s-deployable-feature-contract.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* ---------------------------------------------------------- assessment */
const rolloutFeatures = classification.filter((entry) => entry.deployableStatus === Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT);
const checks = {
  EVERY_FROZEN_FEATURE_CLASSIFIED: classification.length === frozenKeys.length && classification.length === 51,
  CLASSIFICATION_AGREES_WITH_STAGE3F6R_HARNESS: classificationAgreesWithHarness,
  CLASSIFICATION_COUNTS: statusTally[Stage3EDeployableStatus.DEPLOYABLE] === 30
    && statusTally[Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT] === 7
    && statusTally[Stage3EDeployableStatus.REQUIRES_V2B] === 5
    && statusTally[Stage3EDeployableStatus.REQUIRES_PRIVILEGED_SIMULATOR] === 9,
  ADMISSIBILITY_RULES_FROZEN: DEPLOYABLE_ADMISSIBILITY_RULES.AUTHORITATIVE_SIMULATOR_LOOKAHEAD_ALLOWED === false
    && DEPLOYABLE_ADMISSIBILITY_RULES.MULTI_STEP_ROLLOUT_ALLOWED_IN_ANY_PROFILE === false
    && DEPLOYABLE_ADMISSIBILITY_RULES.hiddenStateAccessAllowed === false,
  NO_MULTI_STEP_FEATURE_IN_ANY_PROFILE: DEPLOYABLE_FEATURES.every((entry) => entry.multiStepRollout === false)
    && Object.values(DEPLOYABLE_PROFILES).every((profile) => profile.multiStepRollout === false),
  ROLLOUT_FEATURES_REDEFINED_WITH_NEW_IDENTITY: rolloutFeatures.every((entry) => {
    const replacement = DEPLOYABLE_FEATURES.find((f) => f.featureId === entry.deployableReplacementFeatureId);
    return replacement && replacement.featureId !== entry.featureName && replacement.stage3eSemanticsUnchanged === false
      && replacement.horizonSteps === 1;
  }),
  PROFILES_MONOTONIC: coreIds.every((id) => DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_SIMULATOR].featureIds.includes(id))
    && DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_SIMULATOR].featureIds
      .every((id) => DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_V2B].featureIds.includes(id)),
  CORE_RUNS_WITHOUT_SIMULATOR_AND_WITHOUT_V2B: capabilityBinding.coreSatisfiedWithoutSimulatorOrV2B
    && DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].worksWithoutSimulator
    && DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].worksWithoutV2B,
  CAPABILITY_BINDING_GATES_PROFILES: capabilityBinding.simulatorAbsentUnsatisfied && capabilityBinding.v2bAbsentUnsatisfied,
  MISSING_IS_NEVER_ZERO: zeroFillViolations.length === 0 && MISSING_VALUE_SEMANTICS.imputationPermitted === false,
  NO_DENSE_VECTOR_GUARANTEE: allResults.every((result) => result.denseVector === false && result.imputed === false),
  V2B_SUBSTITUTION_REFUSED: capabilityBinding.v2bSubstitutionRefused && V2B_AVAILABILITY.substitutionPermitted === false,
  V2B_GENUINE_SATISFIES_PROFILE: capabilityBinding.v2bGenuineSatisfied,
  MULTI_STEP_SIMULATOR_REJECTED: multiStepRejected && rolloutCapabilityRejected,
  STATIC_LEAKAGE_CLEAN: staticLeakage.length === 0,
  FUTURE_OUTCOME_INVARIANT: futureInvariant && distinctFutures > 1 && decisionStateUnmutated,
  DEPLOYABLE_PATH_READS_OBSERVATION: degradationResponse[ObservationDegradation.REMOVE_RESOURCE_SIGNALS].featuresChanged > 0
    && degradationResponse[ObservationDegradation.HIDE_RELATIONSHIPS].featuresChanged > 0
    && degradationResponse[ObservationDegradation.REMOVE_OBJECTIVE_INFORMATION].featuresChanged > 0,
  FAILS_CLOSED_ON_FOREIGN_SCHEMA: failsClosedOnForeignSchema,
  CONTRACT_HASH_KEY_ORDER_INVARIANT: keyOrderInvariant,
  EXTRACTION_DETERMINISTIC: extractionDeterministic,
  REFERENCE_PARITY_MODE_PRESERVED: referenceParityPreserved && frozenContractHashIntact,
  FROZEN_STAGE3E_UNCHANGED: scope.frozenStage3EUnchanged,
  STAGE3F0_TO_3F4_OWNERS_UNCHANGED: scope.stage3f0To3f4OwnersUnchanged,
  PRIOR_CERTIFICATIONS_UNCHANGED: scope.priorCertificationsUnchanged,
  NO_ROUTER_RETRAINING: routerCompatibility.routerRetrained === false && routerCompatibility.routerThresholdsTuned === false
    && DEPLOYABLE_FEATURE_CONTRACT.modelTrainingPerformed === false && DEPLOYABLE_FEATURE_CONTRACT.onlineLearningEnabled === false,
  WORLD_STATE_NOT_EXPANDED: WORLD_STATE_COVERAGE_AUDIT.worldStateExpandedInThisStage === false,
  OBSERVATORY_READ_ONLY: DEPLOYABLE_OBSERVATORY_CONTRACT.readOnly === true
    && DEPLOYABLE_OBSERVATORY_CONTRACT.decisionInput === false,
  AUTHORITY_R0: DEPLOYABLE_FEATURE_CONTRACT.authority.tier === 'R0'
    && DEPLOYABLE_FEATURE_CONTRACT.authority.canDispatch === false
    && DEPLOYABLE_FEATURE_CONTRACT.authority.canMutateLiveWorld === false,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};

const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_6_S_DEPLOYABLE_FEATURE_CONTRACT',
  status,
  contract: {
    id: DEPLOYABLE_FEATURE_CONTRACT_ID,
    hash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    featureCount: DEPLOYABLE_FEATURE_CONTRACT.featureCount,
    keyOrderInvariant,
    referenceContract: DEPLOYABLE_FEATURE_CONTRACT.referenceContract,
    admissibilityRules: DEPLOYABLE_ADMISSIBILITY_RULES,
    missingValueSemantics: MISSING_VALUE_SEMANTICS,
    observationBinding: DEPLOYABLE_FEATURE_CONTRACT.observationBinding,
    findings: DEPLOYABLE_FEATURE_CONTRACT.findings,
  },
  stage3eClassification: {
    frozenFeatureCount: frozenKeys.length,
    tally: statusTally,
    agreesWithStage3F6RHarness: classificationAgreesWithHarness,
    dependencySets: STAGE3E_DEPENDENCY_SETS,
    perFeature: classification,
  },
  profiles: Object.fromEntries(Object.entries(DEPLOYABLE_PROFILES).map(([name, definition]) => [name, {
    requiredCapabilities: definition.requiredCapabilities,
    featureCount: definition.featureCount,
    worksWithoutSimulator: definition.worksWithoutSimulator,
    worksWithoutV2B: definition.worksWithoutV2B,
    multiStepRollout: definition.multiStepRollout,
    featureIds: definition.featureIds,
  }])),
  capabilityBinding,
  evidence: {
    decisionPoint: { seed: String(seed), family: 'prime/adversarial_choice', level: 1, legalActionCount: legalActions.length },
    coreCounts: core.counts,
    simulatorCounts: withSimulator.counts,
    v2bGenuineCounts: withV2BGenuine.counts,
    undeclaredOneStepComponents,
    statusesCore: statusesOf(core),
    zeroFillViolations,
  },
  futureInvariance: { futureInvariant, distinctFutures, decisionStateUnmutated, futuresEvaluated: futures.length },
  observationDegradation: degradationResponse,
  foreignSchema: { failsClosed: failsClosedOnForeignSchema, counts: schemaMismatch.counts },
  staticLeakage: { forbiddenReads: FORBIDDEN_READS, auditedSources, violations: staticLeakage },
  worldStateCoverageAudit: WORLD_STATE_COVERAGE_AUDIT,
  v2bAvailability: V2B_AVAILABILITY,
  routerCompatibility,
  observatory: { contractId: DEPLOYABLE_OBSERVATORY_CONTRACT.contractId, views: DEPLOYABLE_OBSERVATORY_CONTRACT.views,
    readOnly: DEPLOYABLE_OBSERVATORY_CONTRACT.readOnly, decisionInput: DEPLOYABLE_OBSERVATORY_CONTRACT.decisionInput,
    sampleFrameLines: renderDeployableFrame(core).split('\n').length },
  scope,
  checks,
  tests: testMetrics,
  sourceHashes: Object.fromEntries(await Promise.all([
    'src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js',
    'src/stage3f/deployable-observatory-v1.js', 'scripts/certify-stage3f6s-deployable-feature-contract.mjs',
    'tests/stage3f6s-deployable-feature-contract.test.js',
  ].map(async (file) => [file, await fileHash(file)]))),
  authority: DEPLOYABLE_FEATURE_CONTRACT.authority,
  learning: { modelTrainingPerformed: false, weightsUpdated: false, routerRetrained: false,
    onlineLearningEnabled: false, newPredictiveModelCreated: false, thresholdsTuned: false },
  roadmap: {
    readyForConfirmatoryStage3F6: false,
    readyForStage3G: false,
    blockers: ['DEPLOYABLE_CONTRACT_HAS_NO_COMPATIBLE_ROUTER',
      'CONFIRMATORY_STAGE3F6_REQUIRES_NEW_TOPOLOGY_DISJOINT_HOLDOUT_AND_OOD_SPLITS'],
    nextRecommendedAction: 'Decide whether to authorize fitting a router on DEPLOYABLE_CORE or DEPLOYABLE_WITH_SIMULATOR, '
      + 'then authorize fresh topology-disjoint, disjoint-seed HOLDOUT/OOD generation for a confirmatory Stage 3F.6.',
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6S_CERTIFICATION', reproduced, status,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await mkdir(outDirectory, { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, checks,
    classification: statusTally, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
