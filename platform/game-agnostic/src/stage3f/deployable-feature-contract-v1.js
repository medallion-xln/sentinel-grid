import { deepFreeze, sha256 } from '../core/determinism.js';

/* ===========================================================================
 * STAGE_3F_6_S — SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1
 *
 * What Sentinel is ALLOWED to know at decision time. This is an admissibility
 * contract, not a performance contract: nothing here claims a deployable feature
 * set predicts better, only that it can be computed without privileged future
 * knowledge or oracle leakage.
 *
 *   DEPLOYABLE_FEATURE = DECISION_TIME_AVAILABLE and NON_LABEL_DERIVED and NON_FUTURE_LEAKING
 *                        and PROVENANCE_BOUND and DETERMINISTICALLY_RECONSTRUCTABLE
 *   REFERENCE_PARITY  != DEPLOYABLE_VALIDITY
 *
 * The frozen Stage 3E FEATURE_CONTRACT_V2 is untouched and remains reproducible in
 * REFERENCE_PARITY_MODE. Nothing here trains, retrains, tunes, or evaluates a router.
 * ========================================================================= */

export const DEPLOYABLE_FEATURE_CONTRACT_ID = 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1';
export const DEPLOYABLE_FEATURE_CONTRACT_SCHEMA_VERSION = 1;

export class DeployableContractError extends Error {}

export const DeployableProfile = deepFreeze({
  DEPLOYABLE_CORE: 'DEPLOYABLE_CORE',
  DEPLOYABLE_WITH_SIMULATOR: 'DEPLOYABLE_WITH_SIMULATOR',
  DEPLOYABLE_WITH_V2B: 'DEPLOYABLE_WITH_V2B',
});

export const DeployableCapability = deepFreeze({
  OBSERVATION_SCHEMA_BOUND: 'OBSERVATION_SCHEMA_BOUND',
  LEGAL_ACTION_SURFACE: 'LEGAL_ACTION_SURFACE',
  RELATIONAL_EXPERT: 'RELATIONAL_EXPERT',
  SIMULATOR_ONE_STEP: 'SIMULATOR_ONE_STEP',
  EXPERT_V2B: 'EXPERT_V2B',
});

/** MISSING != ZERO. UNKNOWN != FALSE. UNAVAILABLE != NEUTRAL. */
export const FeatureValueStatus = deepFreeze({
  AVAILABLE: 'AVAILABLE',
  UNKNOWN: 'UNKNOWN',
  UNAVAILABLE: 'UNAVAILABLE',
});

export const SourceDomain = deepFreeze({
  OBSERVATION_DERIVED: 'OBSERVATION_DERIVED',
  WORLD_STATE_DERIVED: 'WORLD_STATE_DERIVED',
  CALIBRATION_DERIVED: 'CALIBRATION_DERIVED',
  TRACE_DERIVED: 'TRACE_DERIVED',
  ROUTER_METADATA: 'ROUTER_METADATA',
});

export const Stage3EDeployableStatus = deepFreeze({
  DEPLOYABLE: 'DEPLOYABLE',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  REQUIRES_PRIVILEGED_SIMULATOR: 'REQUIRES_PRIVILEGED_SIMULATOR',
  REQUIRES_MULTI_STEP_ROLLOUT: 'REQUIRES_MULTI_STEP_ROLLOUT',
  REQUIRES_V2B: 'REQUIRES_V2B',
  LABEL_ADJACENT: 'LABEL_ADJACENT',
  AMBIGUOUS: 'AMBIGUOUS',
});

export const RolloutFeatureDisposition = deepFreeze({
  REMOVE: 'REMOVE',
  REDEFINE_ONE_STEP: 'REDEFINE_ONE_STEP',
  KEEP_REFERENCE_ONLY: 'KEEP_REFERENCE_ONLY',
});

/* ---------------------------------------------------------------------------
 * Admissibility rules — frozen BEFORE any feature was selected, so that the rules
 * decide the feature set rather than the desired feature set deciding the rules.
 * ------------------------------------------------------------------------- */
export const DEPLOYABLE_ADMISSIBILITY_RULES = deepFreeze({
  availableBeforeActionExecution: true,
  availableWithoutActualOutcome: true,
  availableWithoutSealedLabels: true,
  availableWithoutHiddenFutureState: true,
  availableWithoutOracleContinuationRollout: true,
  availableWithoutPostHocAnalysis: true,
  deterministicFromGovernedEvidence: true,
  boundToEnvironmentIdentity: true,
  boundToObservationSchemaIdentity: true,
  compatibleWithStage3FEpistemicCategories: true,

  AUTHORITATIVE_SIMULATOR_LOOKAHEAD_ALLOWED: false,
  simulatorException: 'A ONE-STEP simulation on an isolated copy is admissible only inside DEPLOYABLE_WITH_SIMULATOR, '
    + 'and only when the deploying environment declares SIMULATOR_ONE_STEP as a supported runtime capability. It is an '
    + 'environment capability that must be declared, never a universal Sentinel assumption.',
  MULTI_STEP_ROLLOUT_ALLOWED_IN_ANY_PROFILE: false,

  hiddenStateAccessAllowed: false,
  hiddenStateNote: 'The Forge kernel exposes complete world state internally. Internal availability is not deployable '
    + 'admissibility: deployable features read the decision-time observation packet, the legal action surface, and '
    + 'decision-time expert evidence derived from those — never authoritative world state the observer was not given.',
});

export const MISSING_VALUE_SEMANTICS = deepFreeze({
  MISSING_IS_NOT_ZERO: true,
  UNKNOWN_IS_NOT_FALSE: true,
  UNAVAILABLE_IS_NOT_NEUTRAL: true,
  imputationPermitted: false,
  denseVectorGuarantee: false,
  rule: 'A feature whose required capability or evidence is absent reports status UNAVAILABLE (capability not declared) '
    + 'or UNKNOWN (capability declared but evidence insufficient) with value=null. It is never defaulted to 0, false, or a '
    + 'neutral value, and the profile reports itself unsatisfied rather than emitting a dense vector.',
});

/* ---------------------------------------------------------------------------
 * Observation binding.
 *
 * Verified against src/forge/kernel.js observe(): the packet carries a 13-element
 * numeric `features` vector plus metadata.canonicalState / metadata.objectives.
 * A packet whose schema identity does not match fails closed to UNKNOWN rather
 * than reading vector positions blindly.
 * ------------------------------------------------------------------------- */
export const OBSERVATION_BINDING = deepFreeze({
  schemaId: 'sentinel-forge-world/observation',
  schemaVersion: 1,
  vectorLength: 13,
  vector: {
    tick: 0,
    decisionHorizonRemaining: 1,
    energyBudget: 2,
    actorX: 3,
    actorY: 4,
    actorHealth: 5,
    actorMaterial: 6,
    entityCountScalar: 7,
    relationCountScalar: 8,
    unavailableEntityCount: 9,
    hostileAliveCount: 10,
    civilianHealthTotal: 11,
    objectiveShortfall: 12,
  },
  structuredPaths: {
    canonicalState: 'metadata.canonicalState',
    objectives: 'metadata.objectives',
  },
  verifiedAgainst: 'src/forge/kernel.js observe()',
});

/* ---------------------------------------------------------------------------
 * Findings this contract had to resolve about the inherited feature path.
 * ------------------------------------------------------------------------- */
export const DEPLOYABLE_CONTRACT_FINDINGS = deepFreeze([
  {
    id: 'FROZEN_CONTRACT_PROVENANCE_MISLABELLED',
    severity: 'MATERIAL',
    claim: 'The frozen Stage 3E extractor header admits branch rewardVector components as "runtime-visible one-step" '
      + 'evidence, but training records bind rewardVector to the branch TOTAL reward vector — the greedy-continuation '
      + 'horizon rollout total (src/forge/record-v2.js). Seven features were admitted under a one-step justification while '
      + 'carrying multi-step rollout totals.',
    consequence: 'Those seven features are REQUIRES_MULTI_STEP_ROLLOUT here and are excluded from every deployable profile.',
    frozenArtifactModified: false,
  },
  {
    id: 'RUNTIME_ENERGY_FEATURE_BYPASSED_OBSERVATION',
    severity: 'MATERIAL',
    claim: 'The Stage 3F.5 runtime adapter computed `energy` from the authoritative world constraint record — privileged '
      + 'state the observer was never given — rather than from the observation packet. Stage 3F.6 measured '
      + 'REMOVE_RESOURCE_SIGNALS changing 0 of 51 '
      + 'features, because degrading the observation cannot move a feature that never read it.',
    consequence: 'resources.actorEnergy is bound to the observation vector, so resource degradation becomes observable.',
    frozenArtifactModified: false,
  },
  {
    id: 'OBSERVATION_PACKET_REDUNDANT_ENCODING',
    severity: 'ADVISORY',
    claim: 'Entity and relation counts appear twice in the observation packet: numeric vector positions 7 and 8, and the '
      + 'length of metadata.canonicalState.entities / .relationships. The Stage 3F.6 degradation harness edits the '
      + 'structured form only, so the two encodings can disagree under degradation.',
    consequence: 'context.entityCount and context.relationCount bind to canonicalState, the same evidence the relational '
      + 'expert reads, so a degraded observation degrades them consistently.',
    frozenArtifactModified: false,
  },
  {
    id: 'CONTRACT_IS_SPATIALLY_BLIND',
    severity: 'ADVISORY',
    claim: 'No feature in this contract consumes actor position, so HIDE_SPATIAL_INFORMATION changes nothing here. This '
      + 'matches the Stage 3F.6 measurement of 0 features changed, and is a limitation inherited from the Stage 3E feature '
      + 'set, not a defect repaired by this contract.',
    consequence: 'Recorded as a known blind spot rather than presented as a fix.',
    frozenArtifactModified: false,
  },
  {
    id: 'RUNTIME_ONE_STEP_COMPONENTS_SILENTLY_ZERO_FILLED',
    severity: 'MATERIAL',
    claim: 'The environment one-step transition reward vector never declares futureObjectivePotential, optionValue, or '
      + 'terminalOutcome. Across 6723 one-step transitions covering all 28 scenario families at levels 1-3 over 6 seeds, '
      + 'with 0 generation failures, each of the three was declared 0 times; they appear only on the oracle branch TOTAL '
      + 'reward vector, which is a horizon rollout total. Because the Stage 3F.5 runtime adapter read them with a `?? 0` '
      + 'default, the runtime features greedyFuturePotential, greedyOptionValue and greedyTerminalOutcome were constant '
      + 'zero rather than measured quantities.',
    consequence: 'The three corresponding one-step features report UNKNOWN whenever the environment does not declare the '
      + 'component, so an undeclared quantity can never again masquerade as a measured zero.',
    frozenArtifactModified: false,
  },
  {
    id: 'ONE_STEP_CONSEQUENCE_DID_NOT_READ_OBSERVATION',
    severity: 'MATERIAL',
    claim: 'Stage 3F.6 certified oneStepConsequenceReadsObservation=false: the one-step consequence path read privileged '
      + 'state rather than the observation.',
    consequence: 'Every DEPLOYABLE_WITH_SIMULATOR feature is derived from an injected one-step capability over an isolated '
      + 'copy, and the context and relational features that gate it read the observation.',
    frozenArtifactModified: false,
  },
]);

/* ------------------------------------------------------------------ features */

const CAP = DeployableCapability;
const OBS = SourceDomain.OBSERVATION_DERIVED;
const TRACE = SourceDomain.TRACE_DERIVED;
const CORE = DeployableProfile.DEPLOYABLE_CORE;
const SIM = DeployableProfile.DEPLOYABLE_WITH_SIMULATOR;
const V2B = DeployableProfile.DEPLOYABLE_WITH_V2B;

const feature = (definition) => ({
  decisionTimeAvailable: true,
  labelDerived: false,
  futureLeaking: false,
  deterministicallyReconstructable: true,
  missingSemantics: 'UNKNOWN_OR_UNAVAILABLE_NEVER_ZERO',
  multiStepRollout: false,
  ...definition,
});

const observationFeature = (featureId, semanticDefinition, stage3eFeature, evidencePath) => feature({
  featureId,
  semanticDefinition,
  sourceDomain: OBS,
  epistemicCategory: 'OBSERVED',
  requiredCapabilities: [CAP.OBSERVATION_SCHEMA_BOUND],
  profiles: [CORE],
  evidencePath,
  provenanceRule: 'decision-time observation packet, schema-bound',
  observationSensitive: true,
  stage3eFeature,
  stage3eSemanticsUnchanged: true,
  stage3eProvenanceChanged: featureId === 'resources.actorEnergy' || featureId === 'context.entityCount'
    || featureId === 'context.relationCount' || featureId === 'context.objectiveCount',
});

const actionSurfaceFeature = (featureId, semanticDefinition, stage3eFeature) => feature({
  featureId,
  semanticDefinition,
  sourceDomain: SourceDomain.WORLD_STATE_DERIVED,
  epistemicCategory: 'OBSERVED',
  requiredCapabilities: [CAP.LEGAL_ACTION_SURFACE],
  profiles: [CORE],
  evidencePath: 'legalActions[]',
  provenanceRule: 'legal action surface offered by the environment at decision time; action identity and type only, never action value',
  observationSensitive: false,
  stage3eFeature,
  stage3eSemanticsUnchanged: true,
  stage3eProvenanceChanged: false,
});

const relationalFeature = (featureId, signalName, semanticDefinition, stage3eFeature, extraCapabilities = []) => feature({
  featureId,
  semanticDefinition,
  sourceDomain: TRACE,
  epistemicCategory: 'DERIVED',
  requiredCapabilities: [CAP.OBSERVATION_SCHEMA_BOUND, CAP.RELATIONAL_EXPERT, ...extraCapabilities].sort(),
  profiles: [CORE],
  evidencePath: signalName === null ? 'relationalSelector.abstain' : `nexus.signals.${signalName}`,
  provenanceRule: 'relational expert evaluated on the decision-time observation only',
  observationSensitive: true,
  stage3eFeature,
  stage3eSemanticsUnchanged: true,
  stage3eProvenanceChanged: false,
});

/* One-step features carry NEW identities: the Stage 3E names described rollout totals or
 * reward-V2 immediate semantics, and reusing those names for one-step quantities would be
 * exactly the silent redefinition this contract exists to prevent. */
const oneStepFeature = (featureId, semanticDefinition, stage3eFeature, redefinedFromStage3E) => feature({
  featureId,
  semanticDefinition,
  sourceDomain: TRACE,
  epistemicCategory: 'PREDICTED',
  requiredCapabilities: [CAP.LEGAL_ACTION_SURFACE, CAP.SIMULATOR_ONE_STEP].sort(),
  profiles: [SIM],
  evidencePath: 'simulator.oneStep(actionId)',
  provenanceRule: 'exactly one simulated step per legal action on an isolated copy; no continuation policy, no horizon',
  observationSensitive: false,
  horizonSteps: 1,
  stage3eFeature,
  stage3eSemanticsUnchanged: false,
  stage3eProvenanceChanged: true,
  redefinedFromStage3E,
  disposition: RolloutFeatureDisposition.REDEFINE_ONE_STEP,
});

const v2bFeature = (featureId, semanticDefinition, stage3eFeature, requiredCapabilities, unchanged) => feature({
  featureId,
  semanticDefinition,
  sourceDomain: TRACE,
  epistemicCategory: 'DERIVED',
  requiredCapabilities: [...requiredCapabilities].sort(),
  profiles: [V2B],
  evidencePath: 'v2bAnswer.actionId',
  provenanceRule: 'genuine V2B expert answer, provenance-bound; never substituted by another producer and never imputed',
  observationSensitive: false,
  stage3eFeature,
  stage3eSemanticsUnchanged: unchanged,
  stage3eProvenanceChanged: !unchanged,
  redefinedFromStage3E: unchanged ? null
    : 'compares the V2B answer against the ONE-STEP best action; Stage 3E compared against the reward-V2 greedy baseline',
});

const RELATIONAL_SIGNALS = [
  ['relational.bottleneckCount', 'bottleneckCount', 'nxBottleneck'],
  ['relational.criticalDependencyCount', 'criticalDependencyCount', 'nxCriticalDep'],
  ['relational.cycleNodeCount', 'cycleNodeCount', 'nxCycleNodes'],
  ['relational.edgeCount', 'edgeCount', 'nxEdgeCount'],
  ['relational.graphDensity', 'graphDensity', 'nxGraphDensity'],
  ['relational.hostileEntityCount', 'hostileEntityCount', 'nxHostile'],
  ['relational.isolatedEntityCount', 'isolatedEntityCount', 'nxIsolated'],
  ['relational.isolatedRatio', 'isolatedRatio', 'nxIsolatedRatio'],
  ['relational.maxCentrality', 'maxCentrality', 'nxMaxCentrality'],
  ['relational.maxDegree', 'maxDegree', 'nxMaxDegree'],
  ['relational.maxDependencyDepth', 'maxDependencyDepth', 'nxMaxDepDepth'],
  ['relational.maxDependents', 'maxDependents', 'nxMaxDependents'],
  ['relational.threatenedEntityCount', 'threatenedEntityCount', 'nxThreatened'],
  ['relational.unresolvedDependencyCount', 'unresolvedDependencyCount', 'nxUnresolvedDep'],
  ['relational.unsupportedThreatenedCount', 'unsupportedThreatenedCount', 'nxUnsupportedThreat'],
];

const DEFINITIONS = [
  /* --- observation-derived context (6) --- */
  observationFeature('context.decisionHorizonRemaining', 'logical steps remaining in the declared decision horizon',
    'decisionHorizonRemaining', 'features[1]'),
  observationFeature('context.tickProgress', 'elapsed fraction of the declared episode horizon, from observed tick and remaining horizon',
    'tickProgress', 'features[0] / (features[0] + features[1])'),
  observationFeature('resources.actorEnergy', 'observed energy budget available at decision time',
    'energy', 'features[2]'),
  observationFeature('context.entityCount', 'number of entities present in the observed canonical state',
    'entityCount', 'metadata.canonicalState.entities.length'),
  observationFeature('context.relationCount', 'number of relationships present in the observed canonical state',
    'relationCount', 'metadata.canonicalState.relationships.length'),
  observationFeature('context.objectiveCount', 'number of objectives disclosed in the decision-time observation',
    'objectiveCount', 'metadata.objectives.length'),

  /* --- legal action surface (4) --- */
  actionSurfaceFeature('actionSurface.legalActionCount', 'number of legal actions offered at decision time', 'legalActionCount'),
  actionSurfaceFeature('actionSurface.actionTypeEntropy', 'Shannon entropy of the legal action type distribution', 'actionTypeEntropy'),
  actionSurfaceFeature('actionSurface.moveCount', 'number of legal MOVE actions', 'moveCount'),
  actionSurfaceFeature('actionSurface.distinctMoveDirections', 'number of distinct legal move directions', 'distinctMoveDirections'),

  /* --- relational expert, observation-only (20) --- */
  ...RELATIONAL_SIGNALS.map(([id, signal, stage3e]) =>
    relationalFeature(id, signal, `relational structure signal '${signal}' over the observed canonical state`, stage3e)),
  relationalFeature('relational.cycleDetected', 'cycleDetected',
    'whether the observed dependency graph contains a cycle', 'nxCycleDetected'),
  relationalFeature('relational.uncoveredThreatenedCount', 'uncoveredThreatenedCount',
    'threatened entities not addressed by any legal action target', 'nxUncoveredThreat', [CAP.LEGAL_ACTION_SURFACE]),
  relationalFeature('relational.actionTargetedEntityCount', 'actionTargetedEntityCount',
    'observed entities addressable by at least one legal action', 'nxActionTargeted', [CAP.LEGAL_ACTION_SURFACE]),
  relationalFeature('relational.confidence', 'confidence',
    'relational structural confidence: how much structure was actually observed. NOT a probability of being correct.', 'nxConfidence'),
  relationalFeature('relational.abstains', null,
    'relational selector abstention: true when the graph reports no actionable structure, or when no legal action exists. '
    + 'Decided from relational rationale codes and the non-emptiness of the legal action surface; never from action values.',
    'nxAbstains', [CAP.LEGAL_ACTION_SURFACE]),

  /* --- one-step simulator profile (16, all new identities) --- */
  oneStepFeature('oneStep.actionValueMargin', 'best minus second-best one-step transition value over legal actions',
    'immediateMargin', 'Stage 3E used the oracle branch reward-V2 immediate scalar; this is one declared environment step'),
  oneStepFeature('oneStep.actionValueMargin2', 'best minus third-best one-step transition value',
    'immediateMargin2', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.actionValueSpread', 'population standard deviation of one-step transition values',
    'immediateSpread', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.actionValueEntropy', 'entropy of shifted one-step transition values',
    'immediateEntropy', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.topValueTieCount', 'legal actions tied at the best one-step value',
    'topTieCount', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.nearValueTieCount', 'legal actions within 2 of the best one-step value',
    'nearTieCount', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.bestNonMoveValueMargin', 'best one-step value minus best non-MOVE one-step value',
    'bestNonMoveMargin', 'one-step redefinition of a reward-V2 immediate quantity'),
  oneStepFeature('oneStep.bestActionIsMove', 'whether the one-step best action is a MOVE',
    'greedyIsMove', 'one-step redefinition: the best action is chosen by one-step value, not by the reward-V2 greedy baseline'),
  oneStepFeature('oneStep.bestActionEqualsRelationalChoice', 'whether the one-step best action equals the relational selector choice',
    'greedyEqNexus', 'one-step redefinition of the greedy identity'),
  oneStepFeature('oneStep.bestActionObjectiveProgressDelta', 'objective-progress potential change across ONE simulated step of the best action',
    'greedyFuturePotential', 'Stage 3E summed this potential over a greedy-continuation horizon rollout; this is a single step with no continuation policy'),
  oneStepFeature('oneStep.bestActionOptionValueDelta', 'option-value change across ONE simulated step of the best action',
    'greedyOptionValue', 'Stage 3E summed this over a horizon rollout; this is a single step'),
  oneStepFeature('oneStep.bestActionInfrastructureHealthDelta', 'infrastructure-health change across ONE simulated step of the best action',
    'greedyInfraHealth', 'Stage 3E summed this over a horizon rollout; this is a single step'),
  oneStepFeature('oneStep.bestActionResourceCost', 'resource cost of ONE simulated step of the best action',
    'greedyResourceCost', 'Stage 3E summed this over a horizon rollout; this is a single step'),
  oneStepFeature('oneStep.bestActionRiskExposure', 'risk exposure of ONE simulated step of the best action',
    'greedyRiskExposure', 'Stage 3E summed this over a horizon rollout; this is a single step'),
  oneStepFeature('oneStep.bestActionTimeCost', 'time cost of ONE simulated step of the best action',
    'greedyTimeCost', 'Stage 3E summed this over a horizon rollout; this is a single step'),
  oneStepFeature('oneStep.bestActionTerminalOutcome', 'terminal outcome reached by ONE simulated step of the best action, if any',
    'greedyTerminalOutcome', 'Stage 3E summed terminal outcome over a horizon rollout; this is a single step'),

  /* --- V2B profile (5) --- */
  v2bFeature('expert.v2bAgreesWithOneStepBest', 'whether the genuine V2B answer equals the one-step best action',
    'greedyEqLearned', [CAP.LEGAL_ACTION_SURFACE, CAP.SIMULATOR_ONE_STEP, CAP.EXPERT_V2B], false),
  v2bFeature('expert.v2bAgreesWithRelationalChoice', 'whether the genuine V2B answer equals the relational selector choice',
    'nexusEqLearned', [CAP.OBSERVATION_SCHEMA_BOUND, CAP.RELATIONAL_EXPERT, CAP.LEGAL_ACTION_SURFACE, CAP.EXPERT_V2B], true),
  v2bFeature('expert.allThreeAgree', 'whether one-step best, relational choice, and genuine V2B answer all agree',
    'allThreeAgree', [CAP.LEGAL_ACTION_SURFACE, CAP.SIMULATOR_ONE_STEP, CAP.RELATIONAL_EXPERT, CAP.OBSERVATION_SCHEMA_BOUND, CAP.EXPERT_V2B], false),
  v2bFeature('expert.v2bSameActionTypeAsOneStepBest', 'whether the V2B answer shares an action type with the one-step best action',
    'sameActionType', [CAP.LEGAL_ACTION_SURFACE, CAP.SIMULATOR_ONE_STEP, CAP.EXPERT_V2B], false),
  v2bFeature('expert.v2bSameTargetAsOneStepBest', 'whether the V2B answer shares a target with the one-step best action',
    'sameTarget', [CAP.LEGAL_ACTION_SURFACE, CAP.SIMULATOR_ONE_STEP, CAP.EXPERT_V2B], false),
];

export const DEPLOYABLE_FEATURES = deepFreeze(
  [...DEFINITIONS].sort((a, b) => (a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : 0)),
);

const PROFILE_ORDER = [CORE, SIM, V2B];
const featureIdsFor = (profile) => {
  const included = PROFILE_ORDER.slice(0, PROFILE_ORDER.indexOf(profile) + 1);
  return DEPLOYABLE_FEATURES
    .filter((entry) => entry.profiles.some((name) => included.includes(name)))
    .map((entry) => entry.featureId)
    .sort();
};
const capabilitiesFor = (profile) => {
  const included = PROFILE_ORDER.slice(0, PROFILE_ORDER.indexOf(profile) + 1);
  const set = new Set();
  for (const entry of DEPLOYABLE_FEATURES) {
    if (entry.profiles.some((name) => included.includes(name))) {
      for (const capability of entry.requiredCapabilities) set.add(capability);
    }
  }
  return [...set].sort();
};

export const DEPLOYABLE_PROFILES = deepFreeze({
  [CORE]: {
    profile: CORE,
    requiredCapabilities: capabilitiesFor(CORE),
    featureIds: featureIdsFor(CORE),
    featureCount: featureIdsFor(CORE).length,
    worksWithoutSimulator: true,
    worksWithoutV2B: true,
    multiStepRollout: false,
    extendsProfile: null,
  },
  [SIM]: {
    profile: SIM,
    requiredCapabilities: capabilitiesFor(SIM),
    featureIds: featureIdsFor(SIM),
    featureCount: featureIdsFor(SIM).length,
    worksWithoutSimulator: false,
    worksWithoutV2B: true,
    multiStepRollout: false,
    extendsProfile: CORE,
  },
  [V2B]: {
    profile: V2B,
    requiredCapabilities: capabilitiesFor(V2B),
    featureIds: featureIdsFor(V2B),
    featureCount: featureIdsFor(V2B).length,
    worksWithoutSimulator: false,
    worksWithoutV2B: false,
    multiStepRollout: false,
    extendsProfile: SIM,
  },
});

/* ------------------------------------------------- Stage 3E classification */

const MULTI_STEP_ROLLOUT = ['greedyFuturePotential', 'greedyInfraHealth', 'greedyOptionValue', 'greedyResourceCost',
  'greedyRiskExposure', 'greedyTerminalOutcome', 'greedyTimeCost'];
const REQUIRES_V2B = ['allThreeAgree', 'greedyEqLearned', 'nexusEqLearned', 'sameActionType', 'sameTarget'];
const ONE_STEP_SIMULATED = ['bestNonMoveMargin', 'greedyIsMove', 'immediateEntropy', 'immediateMargin', 'immediateMargin2',
  'immediateSpread', 'nearTieCount', 'topTieCount'];
const GREEDY_IDENTITY = ['allThreeAgree', 'greedyEqLearned', 'greedyEqNexus', 'sameActionType', 'sameTarget'];

export const STAGE3E_DEPENDENCY_SETS = deepFreeze({ MULTI_STEP_ROLLOUT, REQUIRES_V2B, ONE_STEP_SIMULATED, GREEDY_IDENTITY });

/**
 * Classify one frozen Stage 3E feature. The dependency sets are the same ones the Stage 3F.6-R
 * reference parity harness uses, so the two gates cannot silently disagree about what depends on what.
 */
export function classifyStage3EFeature(featureName, index) {
  const multiStep = MULTI_STEP_ROLLOUT.includes(featureName);
  const v2b = REQUIRES_V2B.includes(featureName);
  const simulated = multiStep || ONE_STEP_SIMULATED.includes(featureName) || GREEDY_IDENTITY.includes(featureName);
  const replacement = DEPLOYABLE_FEATURES.find((entry) => entry.stage3eFeature === featureName) ?? null;

  const deployableStatus = multiStep ? Stage3EDeployableStatus.REQUIRES_MULTI_STEP_ROLLOUT
    : v2b ? Stage3EDeployableStatus.REQUIRES_V2B
      : simulated ? Stage3EDeployableStatus.REQUIRES_PRIVILEGED_SIMULATOR
        : Stage3EDeployableStatus.DEPLOYABLE;

  return deepFreeze({
    index,
    featureName,
    frozenSource: multiStep ? 'ORACLE_BRANCH_TOTAL_REWARD_VECTOR_HORIZON_ROLLOUT'
      : ONE_STEP_SIMULATED.includes(featureName) ? 'ORACLE_BRANCH_IMMEDIATE_SCALAR_REWARD_V2'
        : v2b || featureName === 'greedyEqNexus' ? 'EXPERT_AGREEMENT_IDENTITY'
          : featureName.startsWith('nx') ? 'RELATIONAL_EXPERT_SIGNAL' : 'DECISION_STATE_CONTEXT',
    decisionTimeAvailable: true,
    usesCurrentObservationOnly: !simulated && !v2b,
    usesSimulator: simulated,
    usesMultiStepRollout: multiStep,
    usesV2B: v2b,
    usesFutureState: multiStep,
    labelAdjacent: multiStep,
    deployableStatus,
    reason: multiStep
      ? 'binds the branch TOTAL reward vector, the greedy-continuation rollout total; the Stage 3E label is defined over the same rollouts'
      : v2b ? 'requires a genuine V2B expert answer, which no general deployment environment guarantees'
        : simulated ? 'requires simulating legal actions; admissible only as a declared one-step environment capability'
          : 'derivable from the decision-time observation or the legal action surface',
    deployableReplacementFeatureId: replacement?.featureId ?? null,
    deployableReplacementRedefined: replacement ? replacement.stage3eSemanticsUnchanged === false : null,
    disposition: multiStep ? RolloutFeatureDisposition.REDEFINE_ONE_STEP : null,
  });
}

export function classifyStage3EContract(featureNames) {
  return deepFreeze(featureNames.map((name, index) => classifyStage3EFeature(name, index)));
}

/* --------------------------------------------------------- coverage audits */

export const WORLD_STATE_COVERAGE_AUDIT = deepFreeze({
  worldStateSections: ['entities', 'resources', 'objectives', 'relationships', 'spatialState', 'temporalState', 'constraints', 'recentEvents'],
  predictionDomains: ['entities', 'resources', 'objectives', 'relationships', 'spatialState', 'constraints', 'risk', 'temporalState'],
  sectionDomainMismatch: {
    riskIsPredictionDomainButNotWorldStateSection: true,
    recentEventsIsWorldStateSectionButNotPredictionDomain: true,
  },
  spatial: {
    REQUIRED_FOR_DEPLOYABLE_FEATURES: false,
    CURRENTLY_AVAILABLE: true,
    CAN_BE_DERIVED_FROM_CURRENT_OBSERVATION: true,
    WOULD_REQUIRE_NEW_ARCHITECTURE: false,
    note: 'Actor position is present in the observation (vector 3,4) and spatialState is a World State section, but no '
      + 'inherited Stage 3E feature consumes position. This contract stays spatially blind rather than inventing a feature.',
  },
  risk: {
    REQUIRED_FOR_DEPLOYABLE_FEATURES: false,
    CURRENTLY_AVAILABLE: false,
    CAN_BE_DERIVED_FROM_CURRENT_OBSERVATION: true,
    WOULD_REQUIRE_NEW_ARCHITECTURE: false,
    note: 'risk is a Stage 3F prediction domain with no corresponding World State section. Threat structure reaches '
      + 'deployable features through observed relational signals (threatened / unsupported / uncovered counts), not a risk fact.',
  },
  constraints: {
    REQUIRED_FOR_DEPLOYABLE_FEATURES: true,
    CURRENTLY_AVAILABLE: true,
    CAN_BE_DERIVED_FROM_CURRENT_OBSERVATION: true,
    WOULD_REQUIRE_NEW_ARCHITECTURE: false,
    note: 'The energy budget is observed directly at vector position 2 and is consumed by resources.actorEnergy.',
  },
  worldStateExpandedInThisStage: false,
  calibrationStatusClaims: 'NONE. The Stage 3F.2 artifact records no resolved per-domain calibration status, so no feature '
    + 'in this contract is conditioned on a calibration-status claim.',
});

export const V2B_AVAILABILITY = deepFreeze({
  status: 'UNAVAILABLE_IN_GENERAL_ENVIRONMENTS',
  runtimeExpertPresent: false,
  evidence: 'The V2B adapter is archive-only (Stage 3F.6-R); no runtime expert produces genuine V2B answers.',
  substitutionPermitted: false,
  imputationPermitted: false,
  substitutionNote: 'Another candidate producer must never be presented as V2B. Without the genuine expert the five V2B '
    + 'features report UNAVAILABLE and the DEPLOYABLE_WITH_V2B profile reports itself unsatisfied.',
});

/* --------------------------------------------------------------- contract */

function buildContract() {
  const mapping = {};
  for (const entry of DEPLOYABLE_FEATURES) {
    if (!entry.stage3eFeature) continue;
    mapping[entry.stage3eFeature] = {
      featureId: entry.featureId,
      semanticsUnchanged: entry.stage3eSemanticsUnchanged,
      provenanceChanged: entry.stage3eProvenanceChanged,
      profile: entry.profiles[0],
    };
  }
  return {
    contractId: DEPLOYABLE_FEATURE_CONTRACT_ID,
    schemaVersion: DEPLOYABLE_FEATURE_CONTRACT_SCHEMA_VERSION,
    referenceContract: {
      id: 'SENTINEL_FEATURE_CONTRACT_V2',
      hash: '063423b125c584fb5dcbca74276f12880540c9613c0b84834d0977310f8921cb',
      status: 'FROZEN_HISTORICAL_REFERENCE_ONLY',
      modified: false,
      overwritten: false,
      note: 'REFERENCE_PARITY_MODE is preserved unchanged; this contract neither replaces nor edits it.',
    },
    admissibilityRules: DEPLOYABLE_ADMISSIBILITY_RULES,
    missingValueSemantics: MISSING_VALUE_SEMANTICS,
    observationBinding: OBSERVATION_BINDING,
    capabilities: Object.values(DeployableCapability).sort(),
    profiles: DEPLOYABLE_PROFILES,
    featureCount: DEPLOYABLE_FEATURES.length,
    features: DEPLOYABLE_FEATURES,
    featureIds: DEPLOYABLE_FEATURES.map((entry) => entry.featureId).sort(),
    stage3eMapping: Object.fromEntries(Object.keys(mapping).sort().map((key) => [key, mapping[key]])),
    worldStateCoverageAudit: WORLD_STATE_COVERAGE_AUDIT,
    v2bAvailability: V2B_AVAILABILITY,
    findings: DEPLOYABLE_CONTRACT_FINDINGS,
    referenceParityModePreserved: true,
    routerRetrained: false,
    routerThresholdsTuned: false,
    modelTrainingPerformed: false,
    onlineLearningEnabled: false,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, incumbentSoleExecutor: true },
  };
}

export const DEPLOYABLE_FEATURE_CONTRACT = deepFreeze(buildContract());

/** sha256 canonicalizes before hashing, so object key order cannot change contract identity. */
export const DEPLOYABLE_FEATURE_CONTRACT_HASH = sha256(DEPLOYABLE_FEATURE_CONTRACT);

export function featureById(featureId) {
  return DEPLOYABLE_FEATURES.find((entry) => entry.featureId === featureId) ?? null;
}

export function profileRequirements(profile) {
  const definition = DEPLOYABLE_PROFILES[profile];
  if (!definition) throw new DeployableContractError(`unknown deployable profile: ${profile}`);
  return definition;
}

/** A profile is satisfied only when every capability it declares is actually present. */
export function evaluateProfileCapabilities(profile, availableCapabilities) {
  const definition = profileRequirements(profile);
  const present = new Set(availableCapabilities);
  const missing = definition.requiredCapabilities.filter((capability) => !present.has(capability));
  return deepFreeze({
    profile,
    requiredCapabilities: definition.requiredCapabilities,
    availableCapabilities: [...present].sort(),
    missingCapabilities: missing,
    satisfied: missing.length === 0,
  });
}
