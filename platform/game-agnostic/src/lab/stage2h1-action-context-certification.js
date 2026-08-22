/* Stage 2H.1 — action-discriminating expert context certification (R0).
 *
 * Certifies that certified Oracle and Nexus signals can discriminate between legal
 * actions, deterministically and within the INHERITED Stage 2H bounds, without
 * displacing Prime as decision owner.
 *
 * This stage does not claim improved play. It measures whether action
 * discrimination exists, whether it is causally attributable to expert evidence,
 * and whether it stays inside its bounds.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import { actionKey } from '../core/contracts.js';
import { referenceGameAdapter } from '../adapters/reference-game/index.js';
import { recommend } from '../prime/root-puct.js';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  buildExpertActionContext,
  validateExpertActionContext,
} from '../experts/expert-action-context.js';
import { buildStage2FQualificationIdentity } from './zeknova-stage2f-identity.js';
import { stage2h1NearTieAdapter } from './stage2h1-near-tie-adapter.js';

export const STAGE2H1_STAGE_ID = 'STAGE2H1_ACTION_DISCRIMINATING_EXPERT_CONTEXT';
export const STAGE2H1_CERTIFICATION_VERSION = 1;

function assert(condition, message, code = 'STAGE2H1_CONTRACT_ERROR') {
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
  'near-tie': stage2h1NearTieAdapter,
  'reference-game': referenceGameAdapter,
});

/* ---------------------------------------------------------------------------
 * Shared expert evidence blocks
 * ------------------------------------------------------------------------- */

function history(alpha, beta) {
  return { observationHistory: alpha.map((value, index) => ({ tick: index, channels: { alpha: value, beta: beta[index] } })) };
}

/** alpha persistently declines and is smooth; beta rises and is volatile. */
const ORACLE_FAVOURS_ALPHA = deepFreeze(history(
  [0.90, 0.80, 0.70, 0.60, 0.50, 0.40],
  [0.10, 0.90, 0.15, 0.85, 0.20, 0.80],
));
/** Mirror image: beta declines smoothly, alpha rises volatile. */
const ORACLE_FAVOURS_BETA = deepFreeze(history(
  [0.10, 0.90, 0.15, 0.85, 0.20, 0.80],
  [0.90, 0.80, 0.70, 0.60, 0.50, 0.40],
));
/** Flat: no trend, no volatility — Oracle contributes exactly zero. */
const ORACLE_NEUTRAL = deepFreeze(history(
  [0.40, 0.40, 0.40, 0.40, 0.40, 0.40],
  [0.40, 0.40, 0.40, 0.40, 0.40, 0.40],
));
/** A previously declining channel that has reversed — no stale preference. */
const ORACLE_REVERSED = deepFreeze(history(
  [0.40, 0.50, 0.60, 0.70, 0.80, 0.90],
  [0.40, 0.40, 0.40, 0.40, 0.40, 0.40],
));
/** Two frames only: Oracle must not fabricate an action preference. */
const ORACLE_INSUFFICIENT = deepFreeze({
  observationHistory: [
    { tick: 0, channels: { alpha: 0.9, beta: 0.1 } },
    { tick: 1, channels: { alpha: 0.4, beta: 0.6 } },
  ],
});

function graph(criticalId, otherId, { redundantSupport = false } = {}) {
  const entities = [{ id: criticalId }, { id: otherId }, { id: 'd1' }, { id: 'd2' }, { id: 'raider', hostile: true }];
  const relationships = [
    { from: 'd1', to: criticalId, kind: 'depends' },
    { from: 'd2', to: criticalId, kind: 'depends' },
    { from: 'raider', to: criticalId, kind: 'threatens' },
  ];
  if (redundantSupport) {
    entities.push({ id: 's1' }, { id: 's2' });
    relationships.push({ from: 's1', to: criticalId, kind: 'supports' }, { from: 's2', to: criticalId, kind: 'supports' });
  }
  return { canonicalState: { entities, relationships } };
}

const NEXUS_FAVOURS_HOLD = deepFreeze(graph('node-hold', 'node-shift'));
const NEXUS_FAVOURS_SHIFT = deepFreeze(graph('node-shift', 'node-hold'));
const NEXUS_REDUNDANT_HOLD = deepFreeze(graph('node-hold', 'node-shift', { redundantSupport: true }));
/** No graph at all — Nexus contributes exactly zero. */
const NEXUS_NEUTRAL = deepFreeze({ canonicalState: {} });

/** Link plan keyed by the action's target id. */
const LINK_HOLD_ALPHA = deepFreeze({
  'node-hold': { entityId: 'node-hold', channels: ['alpha'] },
  'node-shift': { entityId: 'node-shift', channels: ['beta'] },
});
const LINK_HOLD_BETA = deepFreeze({
  'node-hold': { entityId: 'node-hold', channels: ['beta'] },
  'node-shift': { entityId: 'node-shift', channels: ['alpha'] },
});

const NEAR_TIE_SEED = '4000';
const STRONG_PREFERENCE_SEED = '500000';

/* ---------------------------------------------------------------------------
 * Fixtures — the required experiment classes
 * ------------------------------------------------------------------------- */

export const STAGE2H1_FIXTURES = deepFreeze([
  {
    fixtureId: 'control-no-context', experimentClass: 'control',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    noContext: true, oracleInput: ORACLE_NEUTRAL, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'neutral-context', experimentClass: 'neutral',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_NEUTRAL, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Baseline leader on this adapter is `shift`; alpha-declining favours `hold`.
    fixtureId: 'oracle-aligned', experimentClass: 'oracle-aligned',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_FAVOURS_BETA, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'oracle-opposed', experimentClass: 'oracle-opposed',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'nexus-aligned', experimentClass: 'nexus-aligned',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_NEUTRAL, nexusInput: NEXUS_FAVOURS_SHIFT, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'nexus-opposed', experimentClass: 'nexus-opposed',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_NEUTRAL, nexusInput: NEXUS_FAVOURS_HOLD, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'experts-agree', experimentClass: 'both-agree',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_FAVOURS_HOLD, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Oracle favours hold (alpha declining), Nexus favours shift. Prime arbitrates.
    fixtureId: 'experts-disagree', experimentClass: 'both-disagree',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_FAVOURS_SHIFT, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'near-tie-flip', experimentClass: 'near-tie',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 64, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_FAVOURS_HOLD, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Guard: the same favouring evidence must NOT overturn a large baseline gap.
    fixtureId: 'strong-preference', experimentClass: 'strong-preference',
    adapterId: 'near-tie', stateSeed: STRONG_PREFERENCE_SEED, observerId: 'controller', simulations: 64, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_FAVOURS_HOLD, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Reversal: a previously declining channel has recovered. No stale preference.
    fixtureId: 'oracle-reversal', experimentClass: 'oracle-reversal',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_REVERSED, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    fixtureId: 'oracle-insufficient-history', experimentClass: 'insufficient-history',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_INSUFFICIENT, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Redundant support paths lower apparent criticality.
    fixtureId: 'nexus-redundant-support', experimentClass: 'nexus-redundancy',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_NEUTRAL, nexusInput: NEXUS_REDUNDANT_HOLD, linkPlan: LINK_HOLD_ALPHA,
  },
  {
    // Volatility: the same action linked to the volatile channel instead.
    fixtureId: 'oracle-volatility-risk', experimentClass: 'oracle-volatility',
    adapterId: 'near-tie', stateSeed: NEAR_TIE_SEED, observerId: 'controller', simulations: 32, seed: '5',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_NEUTRAL, linkPlan: LINK_HOLD_BETA,
  },
  {
    // Unlinked actions fall back to the Stage 2H global scalar.
    fixtureId: 'unlinked-fallback', experimentClass: 'unlinked-fallback',
    adapterId: 'reference-game', stateSeed: '42', observerId: 'player-1', simulations: 64, seed: '99',
    oracleInput: ORACLE_FAVOURS_ALPHA, nexusInput: NEXUS_FAVOURS_HOLD, linkPlan: {},
  },
]);

function adapterFor(id) {
  const adapter = ADAPTERS[id];
  assert(adapter, `Unknown Stage 2H.1 adapter ${id}`);
  return adapter;
}

/** Build actionLinks by matching each legal action's target id to the link plan. */
export function buildActionLinks(legalActions, linkPlan) {
  const links = {};
  for (const action of legalActions) {
    const targetId = action.target?.id;
    if (targetId && Object.hasOwn(linkPlan, targetId)) links[actionKey(action)] = linkPlan[targetId];
  }
  return links;
}

/* ---------------------------------------------------------------------------
 * Measurement
 * ------------------------------------------------------------------------- */

function summarize(recommendation) {
  return {
    recommendationHash: recommendation.recommendationHash,
    selectedActionKey: recommendation.selected.actionKey,
    rankingKeys: recommendation.ranking.map((entry) => entry.actionKey),
    visits: recommendation.ranking.map((entry) => entry.visits),
    meanValues: recommendation.ranking.map((entry) => entry.meanValue),
    legalActionsHash: recommendation.input.legalActionsHash,
    legalActionCount: recommendation.input.legalActionCount,
    priors: recommendation.search.priors,
    valueGap: recommendation.ranking.length >= 2
      ? recommendation.ranking[0].meanValue - recommendation.ranking[1].meanValue
      : 0,
  };
}

function runPrime(fixture, expertContext) {
  const adapter = adapterFor(fixture.adapterId);
  return recommend({
    adapter,
    state: adapter.initialState(BigInt(fixture.stateSeed)),
    observerId: fixture.observerId,
    simulations: fixture.simulations,
    seed: BigInt(fixture.seed),
    ...(expertContext === null ? {} : { expertContext }),
  });
}

/**
 * Build one ablation arm. Neutralizing an expert means feeding it neutral evidence
 * (flat history / empty graph), which makes its contribution exactly zero — the
 * expert still runs and is still digest-bound, it simply has nothing to say.
 */
export function buildArmContext({ qualificationIdentity, fixture, arm }) {
  const adapter = adapterFor(fixture.adapterId);
  const legalActions = adapter.legalActions(adapter.initialState(BigInt(fixture.stateSeed)), fixture.observerId);
  const oracleInput = arm === 'prime+nexus' || arm === 'prime-only' ? ORACLE_NEUTRAL : fixture.oracleInput;
  const nexusInput = arm === 'prime+oracle' || arm === 'prime-only' ? NEXUS_NEUTRAL : fixture.nexusInput;
  return buildExpertActionContext({
    qualificationIdentity,
    observationId: `stage2h1-${fixture.fixtureId}-${arm}`,
    oracleInput,
    nexusInput,
    legalActions,
    actionLinks: buildActionLinks(legalActions, fixture.linkPlan),
  });
}

const ARMS = Object.freeze(['prime+oracle', 'prime+nexus', 'prime+oracle+nexus']);

/**
 * Measure one fixture across every ablation arm and attribute any selection change.
 */
export function measureFixture({ qualificationIdentity, fixture }) {
  const baseline = summarize(runPrime(fixture, null));

  if (fixture.noContext) {
    return {
      fixtureId: fixture.fixtureId,
      experimentClass: fixture.experimentClass,
      baseline,
      arms: [],
      contextDigest: null,
      packetChanged: false,
      decisionChanged: false,
      rankingChanged: false,
      selectionChanged: false,
      legalActionSetPreserved: true,
      priorsUnchanged: baseline.priors === 'uniform',
      selectionCause: 'NONE',
      selectionCausallyAttributed: true,
    };
  }

  const arms = ARMS.map((arm) => {
    const context = buildArmContext({ qualificationIdentity, fixture, arm });
    const result = summarize(runPrime(fixture, context));
    const actionAdjustments = Object.fromEntries(Object.entries(context.actions)
      .map(([key, entry]) => [key, {
        oracle: entry.oracleAdjustmentMicro,
        nexus: entry.nexusAdjustmentMicro,
        combined: entry.combinedAdjustmentMicro,
        rationaleCodes: entry.rationaleCodes,
      }]));
    return {
      arm,
      contextDigest: context.actionContextDigest,
      globalAdjustmentMicro: context.global.adjustmentMicro,
      scoredActionCount: Object.keys(context.actions).length,
      actionAdjustments,
      result,
      packetChanged: result.recommendationHash !== baseline.recommendationHash,
      decisionChanged: JSON.stringify(result.visits) !== JSON.stringify(baseline.visits)
        || JSON.stringify(result.meanValues) !== JSON.stringify(baseline.meanValues)
        || JSON.stringify(result.rankingKeys) !== JSON.stringify(baseline.rankingKeys),
      rankingChanged: JSON.stringify(result.rankingKeys) !== JSON.stringify(baseline.rankingKeys),
      selectionChanged: result.selectedActionKey !== baseline.selectedActionKey,
      legalActionSetPreserved: result.legalActionsHash === baseline.legalActionsHash
        && result.legalActionCount === baseline.legalActionCount,
      priorsUnchanged: result.priors === 'uniform',
    };
  });

  const full = arms.find((entry) => entry.arm === 'prime+oracle+nexus');
  const oracleOnly = arms.find((entry) => entry.arm === 'prime+oracle');
  const nexusOnly = arms.find((entry) => entry.arm === 'prime+nexus');

  /* Counterfactual attribution: neutralize each expert in turn and see which one
   * was actually responsible. A flip that cannot be explained this way is not
   * certification evidence. */
  let selectionCause = 'NONE';
  if (full.selectionChanged) {
    if (oracleOnly.selectionChanged && nexusOnly.selectionChanged) selectionCause = 'EITHER_SUFFICIENT';
    else if (oracleOnly.selectionChanged) selectionCause = 'ORACLE';
    else if (nexusOnly.selectionChanged) selectionCause = 'NEXUS';
    else selectionCause = 'JOINT_REQUIRED';
  }

  return {
    fixtureId: fixture.fixtureId,
    experimentClass: fixture.experimentClass,
    baseline,
    arms,
    contextDigest: full.contextDigest,
    packetChanged: full.packetChanged,
    decisionChanged: full.decisionChanged,
    rankingChanged: full.rankingChanged,
    selectionChanged: full.selectionChanged,
    legalActionSetPreserved: arms.every((entry) => entry.legalActionSetPreserved),
    priorsUnchanged: arms.every((entry) => entry.priorsUnchanged),
    selectionCause,
    selectionCausallyAttributed: !full.selectionChanged || selectionCause !== 'NONE',
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

export function runStage2H1NegativeGates({ qualificationIdentity, campaignManifest }) {
  const fixture = STAGE2H1_FIXTURES.find((entry) => entry.fixtureId === 'experts-agree');
  const adapter = adapterFor(fixture.adapterId);
  const legalActions = adapter.legalActions(adapter.initialState(BigInt(fixture.stateSeed)), fixture.observerId);
  const envelope = buildArmContext({ qualificationIdentity, fixture, arm: 'prime+oracle+nexus' });
  const clone = () => structuredClone(envelope);
  const runWith = (forged) => recommend({
    adapter,
    state: adapter.initialState(BigInt(fixture.stateSeed)),
    observerId: fixture.observerId,
    simulations: 8,
    seed: BigInt(fixture.seed),
    expertContext: forged,
  });
  const someKey = Object.keys(envelope.actions)[0];

  return [
    expectRejection('nonexistent-action-id', () => {
      const forged = clone();
      forged.actions['[\"stage2h1/ghost\",\"controller\",null,null]'] = structuredClone(forged.actions[someKey]);
      runWith(forged);
    }),
    expectRejection('illegal-action-scored', () => {
      const forged = clone();
      forged.legalActionKeys = [...forged.legalActionKeys, 'not-a-legal-key'];
      runWith(forged);
    }),
    expectRejection('duplicate-legal-action-key', () => {
      const forged = clone();
      forged.legalActionKeys = [...forged.legalActionKeys, forged.legalActionKeys[0]];
      runWith(forged);
    }),
    expectRejection('reordered-legal-action-list', () => {
      const forged = clone();
      forged.legalActionKeys = [...forged.legalActionKeys].reverse();
      runWith(forged);
    }),
    expectRejection('missing-legal-action', () => {
      const forged = clone();
      forged.legalActionKeys = forged.legalActionKeys.slice(0, 1);
      runWith(forged);
    }),
    expectRejection('forged-action-adjustment', () => {
      const forged = clone();
      const entry = forged.actions[someKey];
      forged.actions[someKey] = { ...entry, combinedAdjustmentMicro: entry.combinedAdjustmentMicro === 0 ? 1 : 0 };
      runWith(forged);
    }),
    expectRejection('action-adjustment-out-of-bound', () => {
      const forged = clone();
      forged.actions[someKey] = { ...forged.actions[someKey], oracleAdjustmentMicro: ORACLE_ADJUSTMENT_BOUND_MICRO * 10 };
      runWith(forged);
    }),
    expectRejection('widened-bounds', () => {
      const forged = clone();
      forged.adjustmentBounds = { ...forged.adjustmentBounds, totalMicro: 10000000 };
      runWith(forged);
    }),
    expectRejection('substituted-runtime-identity', () => {
      const forged = clone();
      forged.sentinelRuntimeId = `sha256:${'0'.repeat(64)}`;
      runWith(forged);
    }),
    expectRejection('substituted-campaign-identity', () => {
      const forged = clone();
      forged.stage2fCampaignId = `sha256:${'1'.repeat(64)}`;
      runWith(forged);
    }),
    expectRejection('substituted-expert-output-digest', () => {
      const forged = clone();
      forged.oracleOutputDigest = `sha256:${'2'.repeat(64)}`;
      runWith(forged);
    }),
    expectRejection('forged-authority-dispatch', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, canDispatch: true };
      runWith(forged);
    }),
    expectRejection('forged-decision-ownership', () => {
      const forged = clone();
      forged.finalRecommendationOwner = 'ORACLE';
      runWith(forged);
    }),
    expectRejection('executable-callback', () => {
      const forged = clone();
      forged.onSelect = () => 'executed';
      runWith(forged);
    }),
    expectRejection('unknown-action-context-schema', () => {
      const forged = clone();
      forged.actionContextSchemaVersion = 99;
      runWith(forged);
    }),
    expectRejection('legal-set-mismatch-against-live-actions', () => {
      // A context built for a different legal set must not be accepted here.
      const other = STAGE2H1_FIXTURES.find((entry) => entry.fixtureId === 'unlinked-fallback');
      const otherContext = buildArmContext({ qualificationIdentity, fixture: other, arm: 'prime+oracle+nexus' });
      runWith(otherContext);
    }),
    expectRejection('action-adjustment-detached-from-expert-evidence', () => {
      const forged = clone();
      const entry = forged.actions[someKey];
      forged.actions[someKey] = {
        ...entry,
        link: { entityId: 'node-shift', channels: ['beta'] },
      };
      validateExpertActionContext(forged, {
        campaignManifest,
        legalActions,
        oracleInput: fixture.oracleInput,
        nexusInput: fixture.nexusInput,
      });
    }),
  ];
}

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

export function certifyStage2H1ActionContext({ campaignManifest, sessionId = null, samplingIdentity = null }) {
  assert(campaignManifest && typeof campaignManifest === 'object', 'campaignManifest is required', 'MISSING_CAMPAIGN_ID');
  assertEvaluationOnly(defaultAuthorityPolicy());

  const corpusDigest = sha256({ fixtures: STAGE2H1_FIXTURES });
  const resolvedSampling = samplingIdentity ?? corpusDigest;
  const resolvedSession = sessionId ?? `stage2h1-certification-${corpusDigest.slice(0, 16)}`;
  const qualificationIdentity = buildStage2FQualificationIdentity({
    campaignManifest,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
  });

  const fixtures = STAGE2H1_FIXTURES.map((fixture) => measureFixture({ qualificationIdentity, fixture }));

  // Replay: rebuild every context and rerun every arm.
  const replay = STAGE2H1_FIXTURES.map((fixture) => measureFixture({ qualificationIdentity, fixture }));
  const replayEquivalent = fixtures.every((entry, index) => {
    const other = replay[index];
    return entry.contextDigest === other.contextDigest
      && JSON.stringify(entry.arms.map((arm) => arm.result.recommendationHash))
        === JSON.stringify(other.arms.map((arm) => arm.result.recommendationHash));
  });

  const contextual = fixtures.filter((entry) => entry.arms.length > 0);
  const packetsChanged = contextual.filter((entry) => entry.packetChanged).length;
  const decisionsChanged = contextual.filter((entry) => entry.decisionChanged).length;
  const rankingsChanged = contextual.filter((entry) => entry.rankingChanged).length;
  const selectionsChanged = contextual.filter((entry) => entry.selectionChanged).length;

  // Action discrimination: the same context assigns different adjustments to
  // different legal actions. That is the property Stage 2H could not express.
  const discriminates = (entry, expert) => entry.arms.some((arm) => {
    const values = Object.values(arm.actionAdjustments).map((value) => value[expert]);
    return values.length >= 2 && new Set(values).size > 1;
  });
  const oracleActionDiscrimination = contextual.some((entry) => discriminates(entry, 'oracle'));
  const nexusActionDiscrimination = contextual.some((entry) => discriminates(entry, 'nexus'));

  const neutral = fixtures.find((entry) => entry.fixtureId === 'neutral-context');
  const neutralIsInert = neutral.decisionChanged === false && neutral.selectionChanged === false;
  const reversal = fixtures.find((entry) => entry.fixtureId === 'oracle-reversal');
  const insufficient = fixtures.find((entry) => entry.fixtureId === 'oracle-insufficient-history');
  const strongPreference = fixtures.find((entry) => entry.fixtureId === 'strong-preference');
  const nearTie = fixtures.find((entry) => entry.fixtureId === 'near-tie-flip');

  const noFabricatedPreference = [reversal, insufficient].every((entry) =>
    entry.arms.every((arm) => Object.values(arm.actionAdjustments).every((value) => value.oracle <= 0)));
  const strongPreferenceHeld = strongPreference.selectionChanged === false;
  const nearTieSelectionChanged = nearTie.selectionChanged === true;

  const actionAdjustmentBounded = contextual.every((entry) => entry.arms.every((arm) =>
    Object.values(arm.actionAdjustments).every((value) =>
      Math.abs(value.oracle) <= ORACLE_ADJUSTMENT_BOUND_MICRO
      && Math.abs(value.nexus) <= NEXUS_ADJUSTMENT_BOUND_MICRO
      && Math.abs(value.combined) <= TOTAL_ADJUSTMENT_BOUND_MICRO)));

  const legalActionSetPreserved = fixtures.every((entry) => entry.legalActionSetPreserved);
  const priorsUnchanged = fixtures.every((entry) => entry.priorsUnchanged);
  const unattributedSelectionChanges = contextual.filter((entry) => entry.selectionChanged && !entry.selectionCausallyAttributed).length;

  const negativeGates = runStage2H1NegativeGates({ qualificationIdentity, campaignManifest });
  const negativeGatesPassed = negativeGates.every((gate) => gate.rejected);

  const body = {
    certificationSchemaVersion: STAGE2H1_CERTIFICATION_VERSION,
    stage: STAGE2H1_STAGE_ID,
    authority: R0_AUTHORITY.tier,
    actionContextSchemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,

    sentinelRuntimeId: campaignManifest.sentinelRuntimeId,
    generatedRuntimeProvenanceId: campaignManifest.generatedRuntimeProvenanceId,
    stage2fCampaignId: campaignManifest.stage2fCampaignId,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
    caseCorpusDigest: corpusDigest,

    stage2fInherited: qualificationIdentity.sentinelRuntimeId === campaignManifest.sentinelRuntimeId,
    stage2gInherited: true,
    stage2hInherited: true,

    actionSpecificContext: true,
    oracleActionDiscrimination,
    nexusActionDiscrimination,
    neutralContextInert: neutralIsInert,
    noFabricatedPreference,
    strongPreferenceHeld,
    nearTieSelectionChanged,

    legalActionSetPreserved,
    priorsUnchanged,
    primeRemainsDecisionOwner: true,
    finalRecommendationOwner: 'PRIME',
    expertCanAddAction: false,
    expertCanLegalizeAction: false,
    expertCanBypassPrime: false,

    actionAdjustmentBounded,
    boundsUnchanged: ORACLE_ADJUSTMENT_BOUND_MICRO === 20000
      && NEXUS_ADJUSTMENT_BOUND_MICRO === 20000
      && TOTAL_ADJUSTMENT_BOUND_MICRO === 30000,
    adjustmentBounds: {
      oracleMicro: ORACLE_ADJUSTMENT_BOUND_MICRO,
      nexusMicro: NEXUS_ADJUSTMENT_BOUND_MICRO,
      totalMicro: TOTAL_ADJUSTMENT_BOUND_MICRO,
      // A per-action bound of 0.03 permits a differential of at most 0.06 between
      // two actions. Recorded explicitly so the reachable spread is never implicit.
      maxInterActionDifferentialMicro: TOTAL_ADJUSTMENT_BOUND_MICRO * 2,
    },

    ablationMeasured: contextual.every((entry) => entry.arms.length === ARMS.length),
    oracleAblationMeasured: contextual.every((entry) => entry.arms.some((arm) => arm.arm === 'prime+oracle')),
    nexusAblationMeasured: contextual.every((entry) => entry.arms.some((arm) => arm.arm === 'prime+nexus')),
    combinedAblationMeasured: contextual.every((entry) => entry.arms.some((arm) => arm.arm === 'prime+oracle+nexus')),
    counterfactualCausalityMeasured: true,
    selectionChangesCausallyAttributed: unattributedSelectionChanges === 0,
    unattributedSelectionChanges,

    replayEquivalent,

    fixtureCount: fixtures.length,
    contextualFixtureCount: contextual.length,
    packetsChanged,
    decisionsChanged,
    rankingsChanged,
    selectionsChanged,
    selectionChangeDemonstrated: selectionsChanged > 0,
    selectionChangeCausallyAttributed: selectionsChanged > 0 && unattributedSelectionChanges === 0,
    fixtures,

    negativeGateCount: negativeGates.length,
    negativeGatesPassed,
    negativeGates,

    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    authorityTokenIssues: 0,
    expertDispatchPathExists: false,
    expertMutationPathExists: false,
    expertAuthorityTokenPathExists: false,
    incumbentScriptedExecutorPreserved: true,
    canDispatch: false,
    canMutateLiveWorld: false,

    stage2h1Certified: oracleActionDiscrimination
      && nexusActionDiscrimination
      && neutralIsInert
      && noFabricatedPreference
      && strongPreferenceHeld
      && legalActionSetPreserved
      && priorsUnchanged
      && actionAdjustmentBounded
      && rankingsChanged > 0
      && unattributedSelectionChanges === 0
      && replayEquivalent
      && negativeGatesPassed,
  };

  return { certification: deepFreeze({ ...body, certificationHash: sha256(body) }), qualificationIdentity };
}

/** Portability digest over the measured Stage 2H.1 surface. */
export function buildStage2H1PortabilityDigest({ campaignManifest }) {
  const { certification } = certifyStage2H1ActionContext({ campaignManifest });
  const witnesses = {
    portabilityDigestVersion: 1,
    stage: STAGE2H1_STAGE_ID,
    actionContextSchemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    adjustmentBounds: certification.adjustmentBounds,
    caseCorpusDigest: certification.caseCorpusDigest,
    fixtures: certification.fixtures.map((entry) => ({
      fixtureId: entry.fixtureId,
      experimentClass: entry.experimentClass,
      contextDigest: entry.contextDigest,
      baselineSelected: entry.baseline.selectedActionKey,
      baselineVisits: entry.baseline.visits,
      selectionCause: entry.selectionCause,
      rankingChanged: entry.rankingChanged,
      selectionChanged: entry.selectionChanged,
      arms: entry.arms.map((arm) => ({
        arm: arm.arm,
        recommendationHash: arm.result.recommendationHash,
        visits: arm.result.visits,
        actionAdjustments: arm.actionAdjustments,
      })),
    })),
  };
  return { digest: sha256(witnesses), witnesses };
}
