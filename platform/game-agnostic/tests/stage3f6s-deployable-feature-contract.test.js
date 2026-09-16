import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  DEPLOYABLE_ADMISSIBILITY_RULES, DEPLOYABLE_CONTRACT_FINDINGS, DEPLOYABLE_FEATURES,
  DEPLOYABLE_FEATURE_CONTRACT, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES,
  DeployableCapability, DeployableContractError, DeployableProfile, FeatureValueStatus,
  MISSING_VALUE_SEMANTICS, OBSERVATION_BINDING, Stage3EDeployableStatus, V2B_AVAILABILITY,
  WORLD_STATE_COVERAGE_AUDIT, classifyStage3EContract, evaluateProfileCapabilities,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { DEPLOYABLE_OBSERVATORY_CONTRACT, renderDeployableFrame } from '../src/stage3f/deployable-observatory-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { createWorld, forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import { sha256 } from '../src/core/determinism.js';
import * as H from '../scripts/stage3f6r-reference-parity-harness.mjs';

const file = (relative) => new URL(`../${relative}`, import.meta.url);
const frozenModel = JSON.parse(readFileSync(file('artifacts/stage3e-routability-intelligence/lr-model.json'), 'utf8'));
const frozenKeys = frozenModel.keys;

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

/* ---------------- A. contract identity ---------------- */

test('contract declares a stable identity and schema version', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.contractId, 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1');
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.schemaVersion, 1);
});

test('contract hash is invariant to object key order', () => {
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort().reverse()) out[key] = reorder(value[key]);
      return out;
    }
    return value;
  };
  assert.equal(sha256(reorder(JSON.parse(JSON.stringify(DEPLOYABLE_FEATURE_CONTRACT)))), DEPLOYABLE_FEATURE_CONTRACT_HASH);
});

test('feature ids are unique, sorted, and every feature carries provenance metadata', () => {
  const ids = DEPLOYABLE_FEATURES.map((entry) => entry.featureId);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, [...ids].sort());
  for (const entry of DEPLOYABLE_FEATURES) {
    assert.ok(entry.semanticDefinition && entry.provenanceRule && entry.sourceDomain && entry.epistemicCategory, entry.featureId);
    assert.equal(entry.decisionTimeAvailable, true, entry.featureId);
    assert.equal(entry.labelDerived, false, entry.featureId);
    assert.equal(entry.futureLeaking, false, entry.featureId);
    assert.equal(entry.deterministicallyReconstructable, true, entry.featureId);
  }
});

test('the frozen Stage 3E feature contract is referenced, not overwritten', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.referenceContract.id, 'SENTINEL_FEATURE_CONTRACT_V2');
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.referenceContract.hash,
    '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb');
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.referenceContract.modified, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.referenceContract.overwritten, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.referenceParityModePreserved, true);
});

/* ---------------- B. classification of the frozen 51 ---------------- */

test('every frozen Stage 3E feature is classified exactly once', () => {
  const classification = classifyStage3EContract(frozenKeys);
  assert.equal(classification.length, 51);
  assert.deepEqual(classification.map((entry) => entry.featureName), frozenKeys);
});

test('classification counts match the inherited dependency structure', () => {
  const tally = {};
  for (const entry of classifyStage3EContract(frozenKeys)) tally[entry.deployableStatus] = (tally[entry.deployableStatus] ?? 0) + 1;
  assert.equal(tally[Stage3EDeployableStatus.DEPLOYABLE], 30);
  assert.equal(tally[Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT], 7);
  assert.equal(tally[Stage3EDeployableStatus.REQUIRES_V2B], 5);
  assert.equal(tally[Stage3EDeployableStatus.REQUIRES_PRIVILEGED_SIMULATOR], 9);
});

test('classification agrees with the Stage 3F.6-R reference parity harness', () => {
  const dependencies = H.featureDependencies(frozenKeys);
  for (const entry of classifyStage3EContract(frozenKeys)) {
    const dependency = dependencies[entry.featureName];
    assert.equal(entry.usesMultiStepRollout, dependency.multiStepRollout, entry.featureName);
    assert.equal(entry.usesV2B, dependency.requiresV2B, entry.featureName);
    assert.equal(entry.usesSimulator, dependency.simulatorDependent, entry.featureName);
  }
});

test('every frozen feature maps to a deployable counterpart', () => {
  const mapping = DEPLOYABLE_FEATURE_CONTRACT.stage3eMapping;
  for (const key of frozenKeys) assert.ok(mapping[key], `unmapped frozen feature: ${key}`);
  assert.equal(Object.keys(mapping).length, 51);
});

test('rollout-derived features are label-adjacent and excluded from every profile under their old identity', () => {
  const rollout = classifyStage3EContract(frozenKeys)
    .filter((entry) => entry.deployableStatus === Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT);
  assert.equal(rollout.length, 7);
  for (const entry of rollout) {
    assert.equal(entry.labelAdjacent, true, entry.featureName);
    assert.equal(entry.usesFutureState, true, entry.featureName);
    assert.equal(DEPLOYABLE_FEATURES.some((f) => f.featureId === entry.featureName), false, entry.featureName);
  }
});

test('redefined rollout features receive a new identity and one-step semantics', () => {
  const rollout = classifyStage3EContract(frozenKeys)
    .filter((entry) => entry.deployableStatus === Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT);
  for (const entry of rollout) {
    const replacement = DEPLOYABLE_FEATURES.find((f) => f.featureId === entry.deployableReplacementFeatureId);
    assert.ok(replacement, entry.featureName);
    assert.notEqual(replacement.featureId, entry.featureName);
    assert.equal(replacement.stage3eSemanticsUnchanged, false);
    assert.equal(replacement.horizonSteps, 1);
    assert.ok(replacement.redefinedFromStage3E.length > 0);
  }
});

/* ---------------- C. admissibility rules ---------------- */

test('admissibility rules deny authoritative simulator lookahead by default', () => {
  assert.equal(DEPLOYABLE_ADMISSIBILITY_RULES.AUTHORITATIVE_SIMULATOR_LOOKAHEAD_ALLOWED, false);
  assert.equal(DEPLOYABLE_ADMISSIBILITY_RULES.hiddenStateAccessAllowed, false);
  assert.equal(DEPLOYABLE_ADMISSIBILITY_RULES.availableWithoutOracleContinuationRollout, true);
  assert.equal(DEPLOYABLE_ADMISSIBILITY_RULES.availableWithoutSealedLabels, true);
});

test('multi-step rollout is inadmissible in every profile', () => {
  assert.equal(DEPLOYABLE_ADMISSIBILITY_RULES.MULTI_STEP_ROLLOUT_ALLOWED_IN_ANY_PROFILE, false);
  for (const entry of DEPLOYABLE_FEATURES) assert.equal(entry.multiStepRollout, false, entry.featureId);
  for (const profile of Object.values(DEPLOYABLE_PROFILES)) assert.equal(profile.multiStepRollout, false, profile.profile);
});

/* ---------------- D. profiles and capability binding ---------------- */

test('profiles are monotonic: core is a subset of simulator, which is a subset of V2B', () => {
  const coreIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
  const simIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_SIMULATOR].featureIds;
  const v2bIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_WITH_V2B].featureIds;
  for (const id of coreIds) assert.ok(simIds.includes(id), id);
  for (const id of simIds) assert.ok(v2bIds.includes(id), id);
  assert.equal(coreIds.length, 30);
  assert.equal(simIds.length, 46);
  assert.equal(v2bIds.length, 51);
});

test('DEPLOYABLE_CORE runs with neither a simulator nor a V2B expert', () => {
  assert.equal(core.profileSatisfied, true);
  assert.equal(core.counts.available, 30);
  assert.equal(core.counts.unavailable, 0);
  const definition = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE];
  assert.equal(definition.worksWithoutSimulator, true);
  assert.equal(definition.worksWithoutV2B, true);
  assert.equal(definition.requiredCapabilities.includes(DeployableCapability.SIMULATOR_ONE_STEP), false);
  assert.equal(definition.requiredCapabilities.includes(DeployableCapability.EXPERT_V2B), false);
});

test('a profile whose capability is absent reports itself unsatisfied', () => {
  const withoutSimulator = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR });
  assert.equal(withoutSimulator.profileSatisfied, false);
  assert.deepEqual(withoutSimulator.capabilities.missingCapabilities, [DeployableCapability.SIMULATOR_ONE_STEP]);
  assert.equal(withoutSimulator.counts.unavailable, 16);
});

test('capability evaluation reports exactly which capabilities are missing', () => {
  const evaluation = evaluateProfileCapabilities(DeployableProfile.DEPLOYABLE_WITH_V2B,
    [DeployableCapability.OBSERVATION_SCHEMA_BOUND, DeployableCapability.LEGAL_ACTION_SURFACE]);
  assert.equal(evaluation.satisfied, false);
  assert.ok(evaluation.missingCapabilities.includes(DeployableCapability.SIMULATOR_ONE_STEP));
  assert.ok(evaluation.missingCapabilities.includes(DeployableCapability.EXPERT_V2B));
  assert.ok(evaluation.missingCapabilities.includes(DeployableCapability.RELATIONAL_EXPERT));
});

/* ---------------- E. missing-value semantics ---------------- */

test('MISSING is never ZERO: unavailable and unknown features carry a null value', () => {
  const results = [
    core, withSimulator,
    extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR }),
    extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator }),
  ];
  for (const result of results) {
    for (const [featureId, entry] of Object.entries(result.features)) {
      if (entry.status !== FeatureValueStatus.AVAILABLE) {
        assert.equal(entry.value, null, `${result.profile}:${featureId} was defaulted instead of reported missing`);
        assert.ok(entry.reason, `${result.profile}:${featureId} gives no reason for being missing`);
      }
    }
  }
  assert.equal(MISSING_VALUE_SEMANTICS.MISSING_IS_NOT_ZERO, true);
  assert.equal(MISSING_VALUE_SEMANTICS.UNKNOWN_IS_NOT_FALSE, true);
  assert.equal(MISSING_VALUE_SEMANTICS.UNAVAILABLE_IS_NOT_NEUTRAL, true);
});

test('no extraction promises a dense vector or imputes values', () => {
  for (const result of [core, withSimulator]) {
    assert.equal(result.denseVector, false);
    assert.equal(result.imputed, false);
  }
  assert.equal(MISSING_VALUE_SEMANTICS.imputationPermitted, false);
  assert.equal(MISSING_VALUE_SEMANTICS.denseVectorGuarantee, false);
});

test('an undeclared one-step reward component is UNKNOWN, not zero', () => {
  const partial = {
    horizonSteps: 1,
    oneStep: () => ({ reward: 3, rewardVector: { optionValue: 2 } }),
  };
  const result = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator: partial });
  assert.equal(result.features['oneStep.bestActionOptionValueDelta'].status, FeatureValueStatus.AVAILABLE);
  assert.equal(result.features['oneStep.bestActionOptionValueDelta'].value, 2);
  assert.equal(result.features['oneStep.bestActionRiskExposure'].status, FeatureValueStatus.UNKNOWN);
  assert.equal(result.features['oneStep.bestActionRiskExposure'].value, null);
});

test('components the environment never declares stay UNKNOWN across many decision points', () => {
  const undeclared = ['futureObjectivePotential', 'optionValue', 'terminalOutcome'];
  let sampled = 0;
  for (const family of ['prime/adversarial_choice', 'prime/resource_constrained_planning',
    'prime/multi_objective_intervention', 'nexus/single_bottleneck']) {
    for (let s = 500; s < 504; s += 1) {
      const localSeed = BigInt(s);
      const localState = forgeAdapterState(createWorld(localSeed, generateScenario({ family, level: 1, seed: localSeed })));
      const localDescriptors = forgeWorldAdapter.legalActions(localState, FORGE_OBSERVER_ID);
      if (localDescriptors.length === 0) continue;
      for (const descriptor of localDescriptors) {
        const isolated = forgeWorldAdapter.cloneState(localState);
        const stepped = forgeWorldAdapter.step(isolated, descriptor, { observerId: FORGE_OBSERVER_ID });
        sampled += 1;
        for (const key of undeclared) {
          assert.equal(Object.hasOwn(stepped.info.rewardVector ?? {}, key), false,
            `${family}/${s} unexpectedly declares ${key}; this test's premise must be re-derived`);
        }
      }
      const localObservation = forgeWorldAdapter.observe(localState, FORGE_OBSERVER_ID);
      const localActions = forgeLegalActions(localState.world).map((action, index) => ({
        actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
        parameters: action.parameters, descriptorIndex: index,
      }));
      const localSimulator = {
        horizonSteps: 1,
        oneStep(actionId) {
          const entry = localActions.find((candidate) => candidate.actionId === actionId);
          const isolated = forgeWorldAdapter.cloneState(localState);
          const result = forgeWorldAdapter.step(isolated, localDescriptors[entry.descriptorIndex], { observerId: FORGE_OBSERVER_ID });
          return { reward: result.reward, rewardVector: result.info.rewardVector, terminal: result.terminal };
        },
      };
      const result = extractDeployableFeatures({
        observation: localObservation, legalActions: localActions,
        profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator: localSimulator,
      });
      for (const featureId of ['oneStep.bestActionObjectiveProgressDelta', 'oneStep.bestActionOptionValueDelta',
        'oneStep.bestActionTerminalOutcome']) {
        assert.equal(result.features[featureId].status, FeatureValueStatus.UNKNOWN, featureId);
        assert.equal(result.features[featureId].value, null, `${featureId} was zero-filled instead of reported UNKNOWN`);
      }
    }
  }
  assert.ok(sampled > 20, 'too few transitions sampled for this claim to mean anything');
});

/* ---------------- F. V2B availability ---------------- */

test('V2B is unavailable in general environments and is never substituted', () => {
  assert.equal(V2B_AVAILABILITY.substitutionPermitted, false);
  assert.equal(V2B_AVAILABILITY.imputationPermitted, false);
  assert.equal(V2B_AVAILABILITY.runtimeExpertPresent, false);
});

test('an answer that is not provenance-bound to V2B is refused, not accepted as V2B', () => {
  const substituted = extractDeployableFeatures({
    observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator,
    v2bAnswer: { actionId: legalActions[0].actionId, provenance: 'SOME_OTHER_PRODUCER' },
  });
  assert.equal(substituted.profileSatisfied, false);
  for (const featureId of Object.keys(substituted.features)) {
    if (featureId.startsWith('expert.')) {
      assert.equal(substituted.features[featureId].status, FeatureValueStatus.UNAVAILABLE, featureId);
      assert.match(substituted.features[featureId].reason, /substitution is not permitted|not declared/);
    }
  }
});

test('a genuine V2B answer satisfies the V2B profile', () => {
  const genuine = extractDeployableFeatures({
    observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_V2B, simulator,
    v2bAnswer: { actionId: legalActions[0].actionId, provenance: 'GENUINE_V2B' },
  });
  assert.equal(genuine.profileSatisfied, true);
  assert.equal(genuine.features['expert.v2bAgreesWithOneStepBest'].status, FeatureValueStatus.AVAILABLE);
});

/* ---------------- G. simulator discipline ---------------- */

test('a simulator that does not declare exactly one step is rejected', () => {
  assert.throws(() => extractDeployableFeatures({
    observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR,
    simulator: { horizonSteps: 5, oneStep: () => ({ reward: 0 }) },
  }), DeployableContractError);
});

test('a simulator exposing a rollout capability is rejected', () => {
  assert.throws(() => extractDeployableFeatures({
    observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR,
    simulator: { horizonSteps: 1, oneStep: () => ({ reward: 0 }), rollout: () => [] },
  }), DeployableContractError);
});

test('one-step simulation does not mutate the decision state', () => {
  const before = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID).metadata.worldHash;
  extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
  assert.equal(forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID).metadata.worldHash, before);
});

/* ---------------- H. leakage ---------------- */

test('no deployable source reads label, outcome, rollout, or authoritative world state', () => {
  const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const forbidden = ['totalRewardVector', 'scalarReward', 'optimalActionKey', 'optimalScalar', 'horizonClass',
    'supervisionClass', 'actualOutcome', 'evaluateCounterfactualsV2', 'GREEDY_CONTINUATION_V1', 'state.world', 'world.constraints'];
  for (const relative of ['src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js']) {
    const source = strip(readFileSync(file(relative), 'utf8'));
    for (const token of forbidden) assert.equal(source.includes(token), false, `${relative} reads ${token}`);
  }
});

test('features are invariant to which future actually occurs', () => {
  const before = JSON.stringify(withSimulator.features);
  const outcomes = new Set();
  for (const entry of legalActions) {
    const isolated = forgeWorldAdapter.cloneState(state);
    const result = forgeWorldAdapter.step(isolated, descriptors[entry.descriptorIndex], { observerId: FORGE_OBSERVER_ID });
    outcomes.add(`${result.reward}:${result.terminal}`);
  }
  assert.ok(outcomes.size > 1, 'the decision point must have materially different futures for this test to mean anything');
  const after = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
  assert.equal(JSON.stringify(after.features), before);
});

test('extraction is deterministic', () => {
  const a = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
  const b = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator });
  const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(hash(a.features), hash(b.features));
});

/* ---------------- I. observation binding ---------------- */

test('the observation binding matches the kernel observation packet', () => {
  assert.equal(observation.schemaId, OBSERVATION_BINDING.schemaId);
  assert.equal(observation.schemaVersion, OBSERVATION_BINDING.schemaVersion);
  assert.equal(observation.features.length, OBSERVATION_BINDING.vectorLength);
});

test('removing resource signals from the observation changes a deployable feature', () => {
  const degraded = degradeObservation(observation, ObservationDegradation.REMOVE_RESOURCE_SIGNALS);
  const after = extractDeployableFeatures({ observation: degraded, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  assert.notEqual(after.features['resources.actorEnergy'].value, core.features['resources.actorEnergy'].value);
});

test('hiding relationships and objectives degrades the deployable core', () => {
  for (const mode of [ObservationDegradation.HIDE_RELATIONSHIPS, ObservationDegradation.REMOVE_OBJECTIVE_INFORMATION,
    ObservationDegradation.REMOVE_THREAT_INFORMATION, ObservationDegradation.DROP_ENTITY_SUBSET]) {
    const degraded = degradeObservation(observation, mode);
    const after = extractDeployableFeatures({ observation: degraded, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
    const changed = core.profileFeatureIds.filter((id) =>
      JSON.stringify(core.features[id].value) !== JSON.stringify(after.features[id].value));
    assert.ok(changed.length > 0, `${mode} changed no deployable feature`);
  }
});

test('a foreign observation schema fails closed instead of reading vector positions blindly', () => {
  const foreign = extractDeployableFeatures({
    observation: { ...observation, schemaId: 'foreign/observation' }, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE,
  });
  assert.equal(foreign.profileSatisfied, false);
  assert.equal(foreign.features['resources.actorEnergy'].status, FeatureValueStatus.UNKNOWN);
  assert.equal(foreign.features['resources.actorEnergy'].value, null);
});

/* ---------------- J. audits, observatory, authority ---------------- */

test('the World State coverage audit is honest about spatial blindness and risk', () => {
  assert.equal(WORLD_STATE_COVERAGE_AUDIT.worldStateExpandedInThisStage, false);
  assert.equal(WORLD_STATE_COVERAGE_AUDIT.spatial.REQUIRED_FOR_DEPLOYABLE_FEATURES, false);
  assert.equal(WORLD_STATE_COVERAGE_AUDIT.sectionDomainMismatch.riskIsPredictionDomainButNotWorldStateSection, true);
  const degraded = degradeObservation(observation, ObservationDegradation.HIDE_SPATIAL_INFORMATION);
  const after = extractDeployableFeatures({ observation: degraded, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  const changed = core.profileFeatureIds.filter((id) =>
    JSON.stringify(core.features[id].value) !== JSON.stringify(after.features[id].value));
  assert.equal(changed.length, 0, 'the contract claims spatial blindness; this must actually hold');
});

test('recorded findings are non-empty and never claim a frozen artifact was modified', () => {
  assert.ok(DEPLOYABLE_CONTRACT_FINDINGS.length >= 5);
  for (const finding of DEPLOYABLE_CONTRACT_FINDINGS) {
    assert.equal(finding.frozenArtifactModified, false, finding.id);
    assert.ok(finding.claim && finding.consequence, finding.id);
  }
});

test('the observatory addition is read-only and is not a decision input', () => {
  assert.equal(DEPLOYABLE_OBSERVATORY_CONTRACT.readOnly, true);
  assert.equal(DEPLOYABLE_OBSERVATORY_CONTRACT.decisionInput, false);
  assert.equal(DEPLOYABLE_OBSERVATORY_CONTRACT.presentationOnly, true);
  const frame = renderDeployableFrame(core);
  assert.match(frame, /SENTINEL ASCII OBSERVATORY :: DEPLOYABLE/);
  assert.match(frame, /R0 \/ NON-DISPATCHING/);
});

test('nothing in this contract trains, retrains, or tunes anything', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.routerRetrained, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.routerThresholdsTuned, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.modelTrainingPerformed, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.onlineLearningEnabled, false);
});

test('authority stays R0 and non-dispatching', () => {
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.authority.tier, 'R0');
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.authority.canDispatch, false);
  assert.equal(DEPLOYABLE_FEATURE_CONTRACT.authority.canMutateLiveWorld, false);
});
