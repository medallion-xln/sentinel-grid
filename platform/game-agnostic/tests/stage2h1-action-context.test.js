import test from 'node:test';
import assert from 'node:assert/strict';

import { recommend } from '../src/prime/root-puct.js';
import { actionKey } from '../src/core/contracts.js';
import { SIGNAL_SCALE } from '../src/experts/expert-contract.js';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  buildExpertActionContext,
  deriveEntityRelations,
  deriveNexusActionMicro,
  deriveOracleActionMicro,
  validateExpertActionContext,
} from '../src/experts/expert-action-context.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import {
  STAGE2H1_FIXTURES,
  STAGE2H1_STAGE_ID,
  buildActionLinks,
  buildArmContext,
  buildStage2H1PortabilityDigest,
  certifyStage2H1ActionContext,
  measureFixture,
  runStage2H1NegativeGates,
} from '../src/lab/stage2h1-action-context-certification.js';
import { stage2h1NearTieAdapter } from '../src/lab/stage2h1-near-tie-adapter.js';
import {
  buildStage2FCampaignManifest,
  buildStage2FQualificationIdentity,
} from '../src/lab/zeknova-stage2f-identity.js';

const RUNTIME_ID = `sha256:${'a'.repeat(64)}`;
const PROVENANCE_ID = `sha256:${'b'.repeat(64)}`;
const SAMPLING_ID = 'c'.repeat(64);

function testCampaignManifest() {
  return buildStage2FCampaignManifest({
    runtimeIdentity: {
      sentinelRuntimeId: RUNTIME_ID,
      generatedRuntimeProvenanceId: PROVENANCE_ID,
      canonicalStateSchemaVersion: 'hash-derived',
      primeVersion: 'hash-derived',
      routerVersion: 'hash-derived',
      authorityPolicyVersion: 'hash-derived-R0',
    },
    generatedRuntimeProvenance: { generatedRuntimeProvenanceId: PROVENANCE_ID },
    campaignStartTime: '2026-08-14T18:18:48.681Z',
    qualificationThresholdPolicy: { minRecordCount: 1000 },
  });
}

function identity() {
  return buildStage2FQualificationIdentity({
    campaignManifest: testCampaignManifest(),
    sessionId: 'stage2h1-test-session',
    samplingIdentity: SAMPLING_ID,
  });
}

function fixture(id) {
  const found = STAGE2H1_FIXTURES.find((entry) => entry.fixtureId === id);
  assert.ok(found, `fixture ${id} must exist`);
  return found;
}

function contextFor(id, arm = 'prime+oracle+nexus') {
  return buildArmContext({ qualificationIdentity: identity(), fixture: fixture(id), arm });
}

const NEAR_TIE_SEED = 4000n;

function nearTieLegalActions() {
  return stage2h1NearTieAdapter.legalActions(stage2h1NearTieAdapter.initialState(NEAR_TIE_SEED), 'controller');
}

/* ---------------------------------------------------------------------------
 * Action-specific scoring
 * ------------------------------------------------------------------------- */

test('action context assigns different adjustments to different legal actions', () => {
  const context = contextFor('experts-agree');
  const combined = Object.values(context.actions).map((entry) => entry.combinedAdjustmentMicro);
  assert.equal(combined.length, 2);
  assert.notEqual(combined[0], combined[1], 'Stage 2H.1 must discriminate between actions');
});

test('Oracle scores an action only from the channels it addresses', () => {
  const signals = {
    sufficientHistory: SIGNAL_SCALE,
    'channel:alpha:direction': -SIGNAL_SCALE,
    'channel:alpha:persistence': SIGNAL_SCALE,
    'channel:alpha:volatility': 0,
    'channel:beta:direction': SIGNAL_SCALE,
    'channel:beta:persistence': SIGNAL_SCALE,
    'channel:beta:volatility': SIGNAL_SCALE,
  };
  // Persistent decline the action addresses → positive, clamped at the bound.
  assert.equal(deriveOracleActionMicro(signals, ['alpha']).micro, ORACLE_ADJUSTMENT_BOUND_MICRO);
  // A reversed, volatile channel → negative. No stale reward for an obsolete response.
  assert.ok(deriveOracleActionMicro(signals, ['beta']).micro < 0);
  // Unlinked → exactly zero, no fabricated preference.
  assert.equal(deriveOracleActionMicro(signals, []).micro, 0);
  // Insufficient history → exactly zero.
  assert.equal(deriveOracleActionMicro({ sufficientHistory: 0 }, ['alpha']).micro, 0);
});

test('Oracle stops favouring an action once the trend reverses', () => {
  const declining = {
    sufficientHistory: SIGNAL_SCALE,
    'channel:alpha:direction': -SIGNAL_SCALE,
    'channel:alpha:persistence': SIGNAL_SCALE,
    'channel:alpha:volatility': 0,
  };
  const reversed = { ...declining, 'channel:alpha:direction': SIGNAL_SCALE };
  assert.ok(deriveOracleActionMicro(declining, ['alpha']).micro > 0);
  assert.equal(deriveOracleActionMicro(reversed, ['alpha']).micro, 0);
});

test('Nexus scores an action from the relational standing of its target', () => {
  const relations = deriveEntityRelations({
    entities: [{ id: 'core' }, { id: 'lonely' }, { id: 'd1' }, { id: 'd2' }, { id: 'raider', hostile: true }],
    relationships: [
      { from: 'd1', to: 'core', kind: 'depends' },
      { from: 'd2', to: 'core', kind: 'depends' },
      { from: 'raider', to: 'core', kind: 'threatens' },
    ],
  });
  const critical = deriveNexusActionMicro(relations, 'core');
  const isolated = deriveNexusActionMicro(relations, 'lonely');
  assert.ok(critical.micro > 0);
  assert.ok(isolated.micro < 0);
  assert.ok(critical.codes.includes('NEXUS_ACTION_CRITICAL_DEPENDENCY'));
  assert.ok(isolated.codes.includes('NEXUS_ACTION_ISOLATED'));
  // Unknown or unlinked targets fabricate nothing.
  assert.equal(deriveNexusActionMicro(relations, 'ghost').micro, 0);
  assert.equal(deriveNexusActionMicro(relations, null).micro, 0);
  assert.equal(deriveNexusActionMicro(deriveEntityRelations({}), 'core').micro, 0);
});

test('a redundant support path lowers apparent criticality', () => {
  const base = {
    entities: [{ id: 'core' }, { id: 'd1' }, { id: 'd2' }, { id: 's1' }, { id: 's2' }],
    relationships: [
      { from: 'd1', to: 'core', kind: 'depends' },
      { from: 'd2', to: 'core', kind: 'depends' },
    ],
  };
  const plain = deriveNexusActionMicro(deriveEntityRelations(base), 'core');
  const redundant = deriveNexusActionMicro(deriveEntityRelations({
    ...base,
    relationships: [...base.relationships, { from: 's1', to: 'core', kind: 'supports' }, { from: 's2', to: 'core', kind: 'supports' }],
  }), 'core');
  assert.ok(redundant.micro < plain.micro);
  assert.ok(redundant.codes.includes('NEXUS_ACTION_REDUNDANT_SUPPORT'));
});

test('per-entity derivation agrees with the certified Nexus aggregates', () => {
  const state = {
    entities: [{ id: 'core' }, { id: 'lonely' }, { id: 'd1' }, { id: 'raider', hostile: true }],
    relationships: [
      { from: 'd1', to: 'core', kind: 'depends' },
      { from: 'raider', to: 'core', kind: 'threatens' },
    ],
  };
  const { entityCount, relations } = deriveEntityRelations(state);
  const nexus = evaluateNexus({ canonicalState: state });
  assert.equal(entityCount, nexus.signals.entityCount);
  const isolated = [...relations.values()].filter((entry) => entry.degree === 0).length;
  assert.equal(isolated, nexus.signals.isolatedEntityCount);
  const threatened = [...relations.values()].filter((entry) => entry.threatenedBy > 0).length;
  assert.equal(threatened, nexus.signals.threatenedEntityCount);
});

/* ---------------------------------------------------------------------------
 * Bounds
 * ------------------------------------------------------------------------- */

test('bounds are inherited from Stage 2H and not widened', () => {
  assert.equal(ORACLE_ADJUSTMENT_BOUND_MICRO, 20000);
  assert.equal(NEXUS_ADJUSTMENT_BOUND_MICRO, 20000);
  assert.equal(TOTAL_ADJUSTMENT_BOUND_MICRO, 30000);
});

test('every per-action adjustment stays inside its bound', () => {
  for (const entry of STAGE2H1_FIXTURES) {
    if (entry.noContext) continue;
    const context = contextFor(entry.fixtureId);
    for (const action of Object.values(context.actions)) {
      assert.ok(Math.abs(action.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO, entry.fixtureId);
      assert.ok(Math.abs(action.nexusAdjustmentMicro) <= NEXUS_ADJUSTMENT_BOUND_MICRO, entry.fixtureId);
      assert.ok(Math.abs(action.combinedAdjustmentMicro) <= TOTAL_ADJUSTMENT_BOUND_MICRO, entry.fixtureId);
    }
  }
});

/* ---------------------------------------------------------------------------
 * Legal-action invariants
 * ------------------------------------------------------------------------- */

test('the legal action set is identical before and after expert context', () => {
  for (const entry of STAGE2H1_FIXTURES) {
    if (entry.noContext) continue;
    const measured = measureFixture({ qualificationIdentity: identity(), fixture: entry });
    assert.equal(measured.legalActionSetPreserved, true, entry.fixtureId);
    for (const arm of measured.arms) {
      assert.equal(arm.result.legalActionsHash, measured.baseline.legalActionsHash, entry.fixtureId);
      assert.equal(arm.result.legalActionCount, measured.baseline.legalActionCount, entry.fixtureId);
      assert.equal(arm.result.rankingKeys.length, measured.baseline.rankingKeys.length, entry.fixtureId);
      assert.deepEqual([...arm.result.rankingKeys].sort(), [...measured.baseline.rankingKeys].sort(), entry.fixtureId);
    }
  }
});

test('an illegal or unknown action can never be scored', () => {
  const legalActions = nearTieLegalActions();
  assert.throws(
    () => buildExpertActionContext({
      qualificationIdentity: identity(),
      observationId: 'x',
      oracleInput: {},
      nexusInput: {},
      legalActions,
      actionLinks: { 'not-a-legal-action-key': { entityId: 'core', channels: ['alpha'] } },
    }),
    (error) => error.code === 'ACTION_CONTEXT_ILLEGAL_ACTION',
  );
});

test('duplicate legal actions are rejected', () => {
  const legalActions = nearTieLegalActions();
  assert.throws(
    () => buildExpertActionContext({
      qualificationIdentity: identity(),
      observationId: 'x',
      oracleInput: {},
      nexusInput: {},
      legalActions: [...legalActions, structuredClone(legalActions[0])],
      actionLinks: {},
    }),
    (error) => error.code === 'ACTION_CONTEXT_DUPLICATE_ACTION' || error.code === 'ACTION_CONTEXT_INVALID',
  );
});

test('Prime rejects a context built for a different legal set', () => {
  const context = contextFor('experts-agree');
  assert.throws(
    () => recommend({
      adapter: stage2h1NearTieAdapter,
      state: stage2h1NearTieAdapter.initialState(NEAR_TIE_SEED),
      observerId: 'someone-else',
      simulations: 8,
      seed: 5n,
      expertContext: context,
    }),
    (error) => error.code === 'ACTION_CONTEXT_LEGAL_SET_MISMATCH',
  );
});

/* ---------------------------------------------------------------------------
 * Provenance and negative gates
 * ------------------------------------------------------------------------- */

test('an action adjustment cannot exist independently of its expert evidence', () => {
  const target = fixture('experts-agree');
  const context = contextFor('experts-agree');
  const legalActions = nearTieLegalActions();
  // Honest context re-verifies against the originating expert inputs.
  validateExpertActionContext(context, {
    campaignManifest: testCampaignManifest(),
    legalActions,
    oracleInput: target.oracleInput,
    nexusInput: target.nexusInput,
  });
  // Swapping the declared link detaches the adjustment from its evidence.
  const forged = structuredClone(context);
  const key = Object.keys(forged.actions)[0];
  forged.actions[key] = { ...forged.actions[key], link: { entityId: 'node-shift', channels: ['beta'] } };
  assert.throws(
    () => validateExpertActionContext(forged, {
      campaignManifest: testCampaignManifest(),
      legalActions,
      oracleInput: target.oracleInput,
      nexusInput: target.nexusInput,
    }),
    (error) => error.code === 'ACTION_CONTEXT_TAMPERED' || error.code === 'ACTION_CONTEXT_DIGEST_MISMATCH',
  );
});

test('every negative gate rejects', () => {
  const gates = runStage2H1NegativeGates({ qualificationIdentity: identity(), campaignManifest: testCampaignManifest() });
  assert.ok(gates.length >= 16);
  for (const gate of gates) assert.equal(gate.rejected, true, `negative gate ${gate.name} must reject`);
});

test('action context carries no dispatch, mutation or authority path', () => {
  const context = contextFor('experts-agree');
  assert.equal(context.authority.tier, 'R0');
  assert.equal(context.authority.canDispatch, false);
  assert.equal(context.authority.canMutateLiveWorld, false);
  assert.equal(context.finalRecommendationOwner, 'PRIME');
  assert.equal(context.carriesActionSelection, false);
  assert.equal(context.carriesActionPriors, false);
  assert.equal(Object.isFrozen(context), true);
  const walk = (value) => {
    if (value === null || typeof value !== 'object') {
      assert.notEqual(typeof value, 'function');
      return;
    }
    for (const entry of Object.values(value)) walk(entry);
  };
  walk(context);
});

/* ---------------------------------------------------------------------------
 * Experiment classes
 * ------------------------------------------------------------------------- */

test('neutral context leaves Prime\'s decision unchanged', () => {
  const measured = measureFixture({ qualificationIdentity: identity(), fixture: fixture('neutral-context') });
  assert.equal(measured.decisionChanged, false);
  assert.equal(measured.selectionChanged, false);
  for (const arm of measured.arms) {
    for (const action of Object.values(arm.actionAdjustments)) assert.equal(action.combined, 0);
  }
});

test('a near-tie selection change is real, bounded, and causally attributed', () => {
  const measured = measureFixture({ qualificationIdentity: identity(), fixture: fixture('near-tie-flip') });
  assert.equal(measured.selectionChanged, true);
  assert.equal(measured.rankingChanged, true);
  assert.equal(measured.legalActionSetPreserved, true);
  assert.notEqual(measured.selectionCause, 'NONE');
  assert.equal(measured.selectionCausallyAttributed, true);
});

test('expert context cannot overturn a strong Prime preference', () => {
  const measured = measureFixture({ qualificationIdentity: identity(), fixture: fixture('strong-preference') });
  assert.equal(measured.selectionChanged, false);
  // The same favouring evidence that flipped the near-tie is present here.
  const full = measured.arms.find((arm) => arm.arm === 'prime+oracle+nexus');
  assert.ok(Object.values(full.actionAdjustments).some((value) => value.combined > 0));
});

test('experts disagreeing leaves Prime as arbiter', () => {
  const measured = measureFixture({ qualificationIdentity: identity(), fixture: fixture('experts-disagree') });
  assert.equal(measured.selectionChanged, false);
  assert.equal(measured.legalActionSetPreserved, true);
});

test('ablation arms are measured independently', () => {
  const measured = measureFixture({ qualificationIdentity: identity(), fixture: fixture('experts-agree') });
  const arms = measured.arms.map((arm) => arm.arm);
  assert.deepEqual(arms, ['prime+oracle', 'prime+nexus', 'prime+oracle+nexus']);
  const oracleOnly = measured.arms[0];
  const nexusOnly = measured.arms[1];
  // Neutralizing one expert zeroes exactly that expert's contribution.
  for (const value of Object.values(oracleOnly.actionAdjustments)) assert.equal(value.nexus, 0);
  for (const value of Object.values(nexusOnly.actionAdjustments)) assert.equal(value.oracle, 0);
});

test('unlinked actions fall back to Stage 2H global behaviour', () => {
  const context = contextFor('unlinked-fallback');
  assert.equal(Object.keys(context.actions).length, 0);
  assert.equal(typeof context.global.adjustmentMicro, 'number');
});

/* ---------------------------------------------------------------------------
 * Replay, portability, certification
 * ------------------------------------------------------------------------- */

test('replay reproduces identical contexts and Prime results', () => {
  for (const entry of STAGE2H1_FIXTURES) {
    const first = measureFixture({ qualificationIdentity: identity(), fixture: entry });
    const second = measureFixture({ qualificationIdentity: identity(), fixture: entry });
    assert.equal(first.contextDigest, second.contextDigest, entry.fixtureId);
    assert.deepEqual(
      first.arms.map((arm) => arm.result.recommendationHash),
      second.arms.map((arm) => arm.result.recommendationHash),
      entry.fixtureId,
    );
  }
});

test('Stage 2H.1 path uses no non-portable transcendental math', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of [
    '../src/experts/expert-action-context.js',
    '../src/lab/stage2h1-action-context-certification.js',
    '../src/lab/stage2h1-near-tie-adapter.js',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['Math.tanh', 'Math.exp', 'Math.log', 'Math.pow', 'Math.sin', 'Math.cos', 'Math.random', 'Date.now']) {
      assert.ok(!code.includes(forbidden), `${file} must not use ${forbidden}`);
    }
  }
});

test('portability digest is stable within this platform', () => {
  const campaignManifest = testCampaignManifest();
  const first = buildStage2H1PortabilityDigest({ campaignManifest });
  const second = buildStage2H1PortabilityDigest({ campaignManifest });
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});

test('Stage 2H.1 certification passes and stays at R0', () => {
  const { certification } = certifyStage2H1ActionContext({ campaignManifest: testCampaignManifest() });

  assert.equal(certification.stage, STAGE2H1_STAGE_ID);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.actionContextSchemaVersion, ACTION_CONTEXT_SCHEMA_VERSION);

  assert.equal(certification.actionSpecificContext, true);
  assert.equal(certification.oracleActionDiscrimination, true);
  assert.equal(certification.nexusActionDiscrimination, true);
  assert.equal(certification.neutralContextInert, true);
  assert.equal(certification.noFabricatedPreference, true);
  assert.equal(certification.strongPreferenceHeld, true);

  assert.equal(certification.legalActionSetPreserved, true);
  assert.equal(certification.priorsUnchanged, true);
  assert.equal(certification.primeRemainsDecisionOwner, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.expertCanAddAction, false);
  assert.equal(certification.expertCanLegalizeAction, false);
  assert.equal(certification.expertCanBypassPrime, false);

  assert.equal(certification.actionAdjustmentBounded, true);
  assert.equal(certification.boundsUnchanged, true);
  assert.ok(certification.rankingsChanged > 0);
  assert.equal(certification.unattributedSelectionChanges, 0);

  assert.equal(certification.oracleAblationMeasured, true);
  assert.equal(certification.nexusAblationMeasured, true);
  assert.equal(certification.combinedAblationMeasured, true);
  assert.equal(certification.counterfactualCausalityMeasured, true);

  assert.equal(certification.replayEquivalent, true);
  assert.equal(certification.negativeGatesPassed, true);

  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.authorityTokenIssues, 0);
  assert.equal(certification.expertDispatchPathExists, false);
  assert.equal(certification.expertMutationPathExists, false);
  assert.equal(certification.expertAuthorityTokenPathExists, false);

  assert.equal(certification.stage2h1Certified, true);
});

test('Stage 2H.1 certification is reproducible and self-excluding', () => {
  const campaignManifest = testCampaignManifest();
  const first = certifyStage2H1ActionContext({ campaignManifest });
  const second = certifyStage2H1ActionContext({ campaignManifest });
  assert.equal(first.certification.certificationHash, second.certification.certificationHash);
  const { certificationHash, ...body } = first.certification;
  assert.ok(!JSON.stringify(body).includes(certificationHash));
});

test('buildActionLinks only links actions that expose a target', () => {
  const legalActions = nearTieLegalActions();
  const links = buildActionLinks(legalActions, { 'node-hold': { entityId: 'node-hold', channels: ['alpha'] } });
  assert.equal(Object.keys(links).length, 1);
  assert.ok(legalActions.some((action) => actionKey(action) === Object.keys(links)[0]));
});
