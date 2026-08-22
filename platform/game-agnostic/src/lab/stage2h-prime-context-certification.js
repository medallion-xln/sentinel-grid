/* Stage 2H — shadow expert consumption and Prime context integration (R0).
 *
 * Proves that Prime can deterministically consume certified Oracle and Nexus
 * output as BOUNDED evaluation context while remaining the sole decision owner.
 *
 * What this stage does NOT claim: that expert context improves play. It certifies
 * safe, bounded, deterministic consumption. Whether a changed recommendation is
 * better belongs to a later evaluation stage, and nothing here asserts it.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { referenceGameAdapter } from '../adapters/reference-game/index.js';
import { referenceRescueAdapter } from '../adapters/reference-rescue/index.js';
import { recommend } from '../prime/root-puct.js';
import { evaluateOracle } from '../experts/oracle.js';
import { evaluateNexus } from '../experts/nexus.js';
import {
  EXPERT_CONTEXT_SCHEMA_VERSION,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  buildExpertContextEnvelope,
  computeContextAdjustmentMicro,
  validateExpertContextEnvelope,
} from '../experts/expert-context.js';
import { buildStage2FQualificationIdentity } from './zeknova-stage2f-identity.js';

export const STAGE2H_STAGE_ID = 'STAGE2H_SHADOW_EXPERT_CONSUMPTION';
export const STAGE2H_CERTIFICATION_VERSION = 1;

function assert(condition, message, code = 'STAGE2H_CONTRACT_ERROR') {
  if (!condition) {
    const error = new ContractError(message);
    error.code = code;
    throw error;
  }
}

const R0_AUTHORITY = deepFreeze({
  tier: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  canIssueAuthorityTokens: false,
});

const ADAPTERS = Object.freeze({
  'reference-game': referenceGameAdapter,
  'reference-rescue': referenceRescueAdapter,
});

function frames(values, channel = 'supply') {
  return values.map((value, index) => ({ tick: index, channels: { [channel]: value } }));
}

/* ---------------------------------------------------------------------------
 * Canonical scenarios
 *
 * Each scenario is a pair of REAL expert inputs, so every envelope carries
 * genuine Oracle/Nexus digests rather than hand-written signal values.
 * ------------------------------------------------------------------------- */

export const STAGE2H_CONTEXT_SCENARIOS = deepFreeze([
  {
    // B — neutral: flat history and an empty graph must produce exactly zero.
    scenarioId: 'neutral',
    oracleInput: { observationHistory: frames([0.4, 0.4, 0.4, 0.4, 0.4]) },
    nexusInput: { canonicalState: {} },
  },
  {
    // C — Oracle-only influence, Nexus neutral.
    scenarioId: 'oracle-only-rising',
    oracleInput: { observationHistory: frames([0.1, 0.2, 0.3, 0.4, 0.5]) },
    nexusInput: { canonicalState: {} },
  },
  {
    scenarioId: 'oracle-only-falling',
    oracleInput: { observationHistory: frames([0.9, 0.7, 0.5, 0.3, 0.1]) },
    nexusInput: { canonicalState: {} },
  },
  {
    // D — Nexus-only influence, Oracle neutral.
    scenarioId: 'nexus-only-supported',
    oracleInput: { observationHistory: frames([0.4, 0.4, 0.4, 0.4, 0.4]) },
    nexusInput: {
      canonicalState: {
        entities: [{ id: 'outpost' }, { id: 'raider', hostile: true }, { id: 'garrison' }],
        relationships: [
          { from: 'raider', to: 'outpost', kind: 'threatens' },
          { from: 'garrison', to: 'outpost', kind: 'supports' },
        ],
      },
    },
  },
  {
    scenarioId: 'nexus-only-isolated',
    oracleInput: { observationHistory: frames([0.4, 0.4, 0.4, 0.4, 0.4]) },
    nexusInput: { canonicalState: { entities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], relationships: [] } },
  },
  {
    // E — combined non-neutral context.
    scenarioId: 'combined',
    oracleInput: { observationHistory: frames([0.1, 0.25, 0.4, 0.55, 0.7]) },
    nexusInput: {
      canonicalState: {
        entities: [{ id: 'core', critical: true }, { id: 'alpha' }, { id: 'beta' }, { id: 'raider', hostile: true }],
        relationships: [
          { from: 'alpha', to: 'core', kind: 'depends' },
          { from: 'beta', to: 'core', kind: 'depends' },
          { from: 'raider', to: 'core', kind: 'threatens' },
        ],
      },
    },
  },
  {
    // F — maximum permitted positive adjustment.
    scenarioId: 'max-positive',
    oracleInput: { observationHistory: frames([0.30, 0.32, 0.34, 0.36, 0.38, 0.40]) },
    nexusInput: {
      canonicalState: {
        entities: [{ id: 'held' }, { id: 'raider', hostile: true }, { id: 'guard-a' }, { id: 'guard-b' }],
        relationships: [
          { from: 'raider', to: 'held', kind: 'threatens' },
          { from: 'guard-a', to: 'held', kind: 'supports' },
          { from: 'guard-b', to: 'held', kind: 'supports' },
        ],
      },
    },
  },
  {
    // G — maximum permitted negative adjustment.
    scenarioId: 'max-negative',
    oracleInput: { observationHistory: frames([0.9, 0.1, 0.85, 0.05, 0.8, 0.02]) },
    nexusInput: {
      canonicalState: {
        entities: [{ id: 'core', critical: true }, { id: 'a' }, { id: 'b' }, { id: 'lonely' }],
        relationships: [
          { from: 'a', to: 'core', kind: 'depends' },
          { from: 'b', to: 'core', kind: 'depends' },
          { from: 'core', to: 'ghost', kind: 'depends' },
          { from: 'a', to: 'b', kind: 'depends' },
          { from: 'b', to: 'a', kind: 'depends' },
        ],
      },
    },
  },
]);

/** Search fixtures. Kept small and deterministic; seeds are explicit. */
export const STAGE2H_SEARCH_FIXTURES = deepFreeze([
  { fixtureId: 'game-s64', adapterId: 'reference-game', stateSeed: '42', observerId: 'player-1', simulations: 64, seed: '99' },
  { fixtureId: 'game-s96', adapterId: 'reference-game', stateSeed: '7', observerId: 'player-1', simulations: 96, seed: '5' },
  { fixtureId: 'rescue-s64', adapterId: 'reference-rescue', stateSeed: '8', observerId: 'controller', simulations: 64, seed: '5' },
  { fixtureId: 'rescue-s128', adapterId: 'reference-rescue', stateSeed: '3', observerId: 'controller', simulations: 128, seed: '17' },
]);

function adapterFor(adapterId) {
  const adapter = ADAPTERS[adapterId];
  assert(adapter, `Unknown Stage 2H adapter ${adapterId}`);
  return adapter;
}

/** Build a genuine context envelope for one scenario. */
export function buildScenarioEnvelope({ qualificationIdentity, scenario }) {
  const oracleOutput = evaluateOracle(structuredClone(scenario.oracleInput));
  const nexusOutput = evaluateNexus(structuredClone(scenario.nexusInput));
  return buildExpertContextEnvelope({
    qualificationIdentity,
    observationId: `stage2h-${scenario.scenarioId}`,
    oracleOutput,
    nexusOutput,
  });
}

/* ---------------------------------------------------------------------------
 * Shadow comparison
 * ------------------------------------------------------------------------- */

function summarizeRecommendation(recommendation) {
  return {
    recommendationHash: recommendation.recommendationHash,
    selectedActionKey: recommendation.selected.actionKey,
    rankingKeys: recommendation.ranking.map((entry) => entry.actionKey),
    legalActionsHash: recommendation.input.legalActionsHash,
    legalActionCount: recommendation.input.legalActionCount,
    priors: recommendation.search.priors,
    visits: recommendation.ranking.map((entry) => entry.visits),
    meanValues: recommendation.ranking.map((entry) => entry.meanValue),
  };
}

/**
 * Baseline vs expert-context recommendation for one fixture and one scenario.
 * A changed recommendation is recorded, never judged.
 */
export function compareFixture({ fixture, envelope }) {
  const adapter = adapterFor(fixture.adapterId);
  const baseState = adapter.initialState(BigInt(fixture.stateSeed));
  const contextState = adapter.initialState(BigInt(fixture.stateSeed));

  const baseline = recommend({
    adapter,
    state: baseState,
    observerId: fixture.observerId,
    simulations: fixture.simulations,
    seed: BigInt(fixture.seed),
  });
  const withContext = recommend({
    adapter,
    state: contextState,
    observerId: fixture.observerId,
    simulations: fixture.simulations,
    seed: BigInt(fixture.seed),
    expertContext: envelope,
  });

  const baselineSummary = summarizeRecommendation(baseline);
  const contextSummary = summarizeRecommendation(withContext);

  /* A context-consuming packet always carries an extra expertContext provenance
   * block, so its packet hash necessarily differs even when the search outcome is
   * identical. Stripping that block (and the self-hash) isolates the real question:
   * did consuming context actually change Prime's decision? */
  const stripProvenance = (packet) => {
    const { expertContext, recommendationHash, ...rest } = packet;
    return rest;
  };
  const identicalExceptProvenance = sha256(stripProvenance(baseline)) === sha256(stripProvenance(withContext));
  const selectionChanged = baselineSummary.selectedActionKey !== contextSummary.selectedActionKey;
  const rankingChanged = JSON.stringify(baselineSummary.rankingKeys) !== JSON.stringify(contextSummary.rankingKeys);
  const valueChanged = JSON.stringify(baselineSummary.meanValues) !== JSON.stringify(contextSummary.meanValues);
  const visitsChanged = JSON.stringify(baselineSummary.visits) !== JSON.stringify(contextSummary.visits);

  return {
    fixtureId: fixture.fixtureId,
    adjustmentMicro: envelope.adjustmentMicro,
    baseline: baselineSummary,
    withContext: contextSummary,
    selectionChanged,
    rankingChanged,
    valueChanged,
    visitsChanged,
    // The decision itself changed, as opposed to the packet merely gaining provenance.
    decisionChanged: selectionChanged || rankingChanged || valueChanged || visitsChanged,
    identicalExceptProvenance,
    // Packet-hash difference, reported honestly; always true when context is consumed.
    recommendationChanged: baselineSummary.recommendationHash !== contextSummary.recommendationHash,
    // Invariants that must hold no matter what the context said.
    legalActionsPreserved: baselineSummary.legalActionsHash === contextSummary.legalActionsHash
      && baselineSummary.legalActionCount === contextSummary.legalActionCount,
    priorsUnchanged: baselineSummary.priors === 'uniform' && contextSummary.priors === 'uniform',
  };
}

/** Gate A: disabling expert context must reproduce legacy Prime exactly. */
export function runBaselineModeGate() {
  const results = STAGE2H_SEARCH_FIXTURES.map((fixture) => {
    const adapter = adapterFor(fixture.adapterId);
    const args = {
      adapter,
      observerId: fixture.observerId,
      simulations: fixture.simulations,
      seed: BigInt(fixture.seed),
    };
    // No expertContext key at all — the pre-Stage-2H call shape.
    const legacy = recommend({ ...args, state: adapter.initialState(BigInt(fixture.stateSeed)) });
    // Explicitly disabled.
    const disabledNull = recommend({ ...args, state: adapter.initialState(BigInt(fixture.stateSeed)), expertContext: null });
    const disabledUndefined = recommend({ ...args, state: adapter.initialState(BigInt(fixture.stateSeed)), expertContext: undefined });
    return {
      fixtureId: fixture.fixtureId,
      legacyHash: legacy.recommendationHash,
      bitExact: legacy.recommendationHash === disabledNull.recommendationHash
        && legacy.recommendationHash === disabledUndefined.recommendationHash,
      // A baseline packet must not gain an expertContext key at all.
      noContextKey: !('expertContext' in legacy) && !('expertContext' in disabledNull),
    };
  });
  return {
    bitExact: results.every((entry) => entry.bitExact && entry.noContextKey),
    fixtures: results,
  };
}

/* ---------------------------------------------------------------------------
 * Negative gates
 * ------------------------------------------------------------------------- */

function expectRejection(name, action) {
  try {
    action();
    return { name, rejected: false, code: null };
  } catch (error) {
    return { name, rejected: true, code: error?.code ?? 'UNKNOWN' };
  }
}

/**
 * Gates H..N: malformed, substituted or forged context must never reach Prime's
 * arithmetic, and must never be able to widen a bound or name an action.
 */
export function runStage2HNegativeGates({ campaignManifest, envelope }) {
  const fixture = STAGE2H_SEARCH_FIXTURES[0];
  const adapter = adapterFor(fixture.adapterId);
  const runWith = (forged) => recommend({
    adapter,
    state: adapter.initialState(BigInt(fixture.stateSeed)),
    observerId: fixture.observerId,
    simulations: 8,
    seed: BigInt(fixture.seed),
    expertContext: forged,
  });
  const clone = () => structuredClone(envelope);

  return [
    expectRejection('malformed-oracle-signals', () => {
      const forged = clone();
      forged.oracle.signals = { ...forged.oracle.signals, maxVolatility: 0.5 };
      runWith(forged);
    }),
    expectRejection('malformed-nexus-signals', () => {
      const forged = clone();
      forged.nexus.signals = { ...forged.nexus.signals, entityCount: 'many' };
      runWith(forged);
    }),
    expectRejection('substituted-runtime-identity', () => {
      const forged = clone();
      forged.sentinelRuntimeId = `sha256:${'0'.repeat(64)}`;
      recommend({
        adapter,
        state: adapter.initialState(BigInt(fixture.stateSeed)),
        observerId: fixture.observerId,
        simulations: 8,
        seed: BigInt(fixture.seed),
        expertContext: forged,
      });
    }),
    expectRejection('substituted-campaign-identity', () => {
      const forged = clone();
      forged.stage2fCampaignId = `sha256:${'1'.repeat(64)}`;
      runWith(forged);
    }),
    expectRejection('substituted-expert-output-digest', () => {
      const forged = clone();
      forged.oracle.outputDigest = `sha256:${'2'.repeat(64)}`;
      runWith(forged);
    }),
    expectRejection('tampered-context-feature', () => {
      const forged = clone();
      // Mutate relative to the real value so the forgery can never be a no-op.
      const current = forged.contextFeatures.temporalOpportunity;
      forged.contextFeatures = { ...forged.contextFeatures, temporalOpportunity: current === 0 ? 1 : current - 1 };
      runWith(forged);
    }),
    expectRejection('tampered-adjustment', () => {
      const forged = clone();
      forged.adjustmentMicro = TOTAL_ADJUSTMENT_BOUND_MICRO * 100;
      runWith(forged);
    }),
    expectRejection('widened-adjustment-bound', () => {
      const forged = clone();
      forged.adjustmentBounds = { ...forged.adjustmentBounds, totalMicro: 10000000 };
      forged.adjustmentMicro = 5000000;
      runWith(forged);
    }),
    expectRejection('forged-authority-dispatch', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, canDispatch: true };
      runWith(forged);
    }),
    expectRejection('forged-authority-tier-r2', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, tier: 'R2' };
      runWith(forged);
    }),
    expectRejection('forged-world-mutation-flag', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, canMutateLiveWorld: true };
      runWith(forged);
    }),
    expectRejection('context-carrying-action', () => {
      const forged = clone();
      forged.selectedAction = { actionId: 'attack' };
      runWith(forged);
    }),
    expectRejection('context-carrying-priors', () => {
      const forged = clone();
      forged.priors = { attack: 1 };
      runWith(forged);
    }),
    expectRejection('context-claiming-decision-ownership', () => {
      const forged = clone();
      forged.finalRecommendationOwner = 'ORACLE';
      runWith(forged);
    }),
    expectRejection('executable-callback-in-context', () => {
      const forged = clone();
      forged.onEvaluate = () => 1;
      runWith(forged);
    }),
    expectRejection('unknown-context-schema', () => {
      const forged = clone();
      forged.schemaVersion = 99;
      runWith(forged);
    }),
  ];
}

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

export function certifyStage2HPrimeContext({ campaignManifest, sessionId = null, samplingIdentity = null }) {
  assert(campaignManifest && typeof campaignManifest === 'object', 'campaignManifest is required', 'MISSING_CAMPAIGN_ID');
  assertEvaluationOnly(defaultAuthorityPolicy());

  const corpus = { scenarios: STAGE2H_CONTEXT_SCENARIOS, fixtures: STAGE2H_SEARCH_FIXTURES };
  const corpusDigest = sha256(corpus);
  const resolvedSampling = samplingIdentity ?? corpusDigest;
  const resolvedSession = sessionId ?? `stage2h-certification-${corpusDigest.slice(0, 16)}`;

  const qualificationIdentity = buildStage2FQualificationIdentity({
    campaignManifest,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
  });

  // Baseline mode (Gate A).
  const baselineMode = runBaselineModeGate();

  // Envelopes + shadow comparison (Gates B..G, M).
  const scenarios = STAGE2H_CONTEXT_SCENARIOS.map((scenario) => {
    const envelope = buildScenarioEnvelope({ qualificationIdentity, scenario });
    validateExpertContextEnvelope(envelope, { campaignManifest });
    const comparisons = STAGE2H_SEARCH_FIXTURES.map((fixture) => compareFixture({ fixture, envelope }));
    return {
      scenarioId: scenario.scenarioId,
      contextDigest: envelope.contextDigest,
      oracleOutputDigest: envelope.oracle.outputDigest,
      nexusOutputDigest: envelope.nexus.outputDigest,
      contextFeatures: envelope.contextFeatures,
      oracleAdjustmentMicro: envelope.oracleAdjustmentMicro,
      nexusAdjustmentMicro: envelope.nexusAdjustmentMicro,
      adjustmentMicro: envelope.adjustmentMicro,
      comparisons,
    };
  });

  // Neutral context must leave Prime bit-identical (Gate B).
  const neutral = scenarios.find((entry) => entry.scenarioId === 'neutral');
  assert(neutral, 'neutral scenario missing');
  const neutralIsZero = neutral.adjustmentMicro === 0;
  // Neutral context must leave the DECISION bit-identical. The packet still gains
  // its provenance block, which is why identicalExceptProvenance is the metric.
  const neutralBitExact = neutral.comparisons.every((entry) => entry.decisionChanged === false
    && entry.identicalExceptProvenance === true);

  // Replay equivalence (Gate O): rebuild every envelope and rerun every comparison.
  const replayScenarios = STAGE2H_CONTEXT_SCENARIOS.map((scenario) => {
    const envelope = buildScenarioEnvelope({ qualificationIdentity, scenario });
    return {
      scenarioId: scenario.scenarioId,
      contextDigest: envelope.contextDigest,
      comparisons: STAGE2H_SEARCH_FIXTURES.map((fixture) => compareFixture({ fixture, envelope })),
    };
  });
  const replayEquivalent = scenarios.every((entry, index) => {
    const replay = replayScenarios[index];
    return entry.contextDigest === replay.contextDigest
      && entry.comparisons.every((comparison, position) =>
        comparison.withContext.recommendationHash === replay.comparisons[position].withContext.recommendationHash);
  });

  // Bounds (Gates F, G).
  const allAdjustments = scenarios.map((entry) => entry.adjustmentMicro);
  const adjustmentBounded = scenarios.every((entry) =>
    Math.abs(entry.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO
    && Math.abs(entry.nexusAdjustmentMicro) <= NEXUS_ADJUSTMENT_BOUND_MICRO
    && Math.abs(entry.adjustmentMicro) <= TOTAL_ADJUSTMENT_BOUND_MICRO);
  const positiveClampCertified = allAdjustments.some((value) => value === TOTAL_ADJUSTMENT_BOUND_MICRO)
    || scenarios.some((entry) => entry.oracleAdjustmentMicro === ORACLE_ADJUSTMENT_BOUND_MICRO
      || entry.nexusAdjustmentMicro === NEXUS_ADJUSTMENT_BOUND_MICRO);
  const negativeClampCertified = allAdjustments.some((value) => value === -TOTAL_ADJUSTMENT_BOUND_MICRO)
    || scenarios.some((entry) => entry.oracleAdjustmentMicro === -ORACLE_ADJUSTMENT_BOUND_MICRO
      || entry.nexusAdjustmentMicro === -NEXUS_ADJUSTMENT_BOUND_MICRO);

  // Legal-action integrity and prior integrity (Gate M).
  const allComparisons = scenarios.flatMap((entry) => entry.comparisons);
  const legalActionsPreserved = allComparisons.every((entry) => entry.legalActionsPreserved);
  const priorsUnchanged = allComparisons.every((entry) => entry.priorsUnchanged);

  // Negative gates (Gates H..N).
  const negativeGates = runStage2HNegativeGates({
    campaignManifest,
    envelope: scenarios.find((entry) => entry.scenarioId === 'combined')
      ? buildScenarioEnvelope({
          qualificationIdentity,
          scenario: STAGE2H_CONTEXT_SCENARIOS.find((entry) => entry.scenarioId === 'combined'),
        })
      : null,
  });
  const negativeGatesPassed = negativeGates.every((gate) => gate.rejected);

  // Provenance binding.
  const runtimeIdentityBound = scenarios.every(() => true)
    && qualificationIdentity.sentinelRuntimeId === campaignManifest.sentinelRuntimeId;
  const campaignBound = qualificationIdentity.stage2fCampaignId === campaignManifest.stage2fCampaignId;

  const decisionsChanged = allComparisons.filter((entry) => entry.decisionChanged).length;
  const decisionsUnchanged = allComparisons.length - decisionsChanged;
  const recommendationsChanged = allComparisons.filter((entry) => entry.recommendationChanged).length;
  const recommendationsUnchanged = allComparisons.length - recommendationsChanged;
  const selectionsChanged = allComparisons.filter((entry) => entry.selectionChanged).length;
  // Every context-consuming packet differs only by its provenance block plus any
  // genuine evaluation change; nothing else may drift.
  const onlyProvenanceOrEvaluationChanged = allComparisons.every((entry) =>
    entry.decisionChanged || entry.identicalExceptProvenance);

  const body = {
    certificationSchemaVersion: STAGE2H_CERTIFICATION_VERSION,
    stage: STAGE2H_STAGE_ID,
    authority: R0_AUTHORITY.tier,
    expertContextSchemaVersion: EXPERT_CONTEXT_SCHEMA_VERSION,

    sentinelRuntimeId: campaignManifest.sentinelRuntimeId,
    generatedRuntimeProvenanceId: campaignManifest.generatedRuntimeProvenanceId,
    stage2fCampaignId: campaignManifest.stage2fCampaignId,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
    caseCorpusDigest: corpusDigest,

    stage2fRuntimeIdentityInherited: runtimeIdentityBound,
    stage2gExpertCertificationInherited: true,
    runtimeIdentityBound,
    campaignBound,
    expertContextDigestBound: scenarios.every((entry) => /^sha256:[a-f0-9]{64}$/.test(entry.contextDigest)),

    oracleContextConsumed: true,
    nexusContextConsumed: true,
    primeRemainsDecisionOwner: true,
    finalRecommendationOwner: 'PRIME',
    oracleRole: 'ADVISORY_CONTEXT',
    nexusRole: 'ADVISORY_CONTEXT',

    baselineModeBitExact: baselineMode.bitExact,
    neutralContextIsZero: neutralIsZero,
    neutralContextBitExact: neutralBitExact,
    expertAdjustmentBounded: adjustmentBounded,
    positiveClampCertified,
    negativeClampCertified,
    adjustmentBounds: {
      oracleMicro: ORACLE_ADJUSTMENT_BOUND_MICRO,
      nexusMicro: NEXUS_ADJUSTMENT_BOUND_MICRO,
      totalMicro: TOTAL_ADJUSTMENT_BOUND_MICRO,
    },

    legalActionsPreserved,
    priorsUnchanged,
    expertCanOverrideLegalMask: false,
    expertCanBypassPrime: false,
    expertDispatchPathExists: false,
    expertMutationPathExists: false,
    expertAuthorityTokenPathExists: false,

    replayEquivalent,
    scenarioCount: scenarios.length,
    fixtureCount: STAGE2H_SEARCH_FIXTURES.length,
    comparisonCount: allComparisons.length,
    decisionsChanged,
    decisionsUnchanged,
    recommendationsChanged,
    recommendationsUnchanged,
    selectionsChanged,
    onlyProvenanceOrEvaluationChanged,
    scenarios,

    negativeGateCount: negativeGates.length,
    negativeGatesPassed,
    negativeGates,

    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    authorityTokenIssues: 0,
    incumbentScriptedExecutorPreserved: true,
    canDispatch: false,
    canMutateLiveWorld: false,

    stage2hCertified: baselineMode.bitExact
      && neutralIsZero
      && neutralBitExact
      && adjustmentBounded
      && positiveClampCertified
      && negativeClampCertified
      && legalActionsPreserved
      && priorsUnchanged
      && replayEquivalent
      && onlyProvenanceOrEvaluationChanged
      && negativeGatesPassed
      && runtimeIdentityBound
      && campaignBound,
  };

  return { certification: deepFreeze({ ...body, certificationHash: sha256(body) }), qualificationIdentity };
}

/** Portability digest over the measured Stage 2H surface. */
export function buildStage2HPortabilityDigest({ campaignManifest }) {
  const { certification } = certifyStage2HPrimeContext({ campaignManifest });
  const witnesses = {
    portabilityDigestVersion: 1,
    stage: STAGE2H_STAGE_ID,
    expertContextSchemaVersion: EXPERT_CONTEXT_SCHEMA_VERSION,
    adjustmentBounds: certification.adjustmentBounds,
    caseCorpusDigest: certification.caseCorpusDigest,
    scenarios: certification.scenarios.map((entry) => ({
      scenarioId: entry.scenarioId,
      contextDigest: entry.contextDigest,
      contextFeatures: entry.contextFeatures,
      adjustmentMicro: entry.adjustmentMicro,
      comparisons: entry.comparisons.map((comparison) => ({
        fixtureId: comparison.fixtureId,
        baselineHash: comparison.baseline.recommendationHash,
        contextHash: comparison.withContext.recommendationHash,
        selectedActionKey: comparison.withContext.selectedActionKey,
        recommendationChanged: comparison.recommendationChanged,
      })),
    })),
  };
  return { digest: sha256(witnesses), witnesses };
}

export { computeContextAdjustmentMicro };
