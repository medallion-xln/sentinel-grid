import test from 'node:test';
import assert from 'node:assert/strict';

import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { recommend } from '../src/prime/root-puct.js';
import { sha256 } from '../src/core/determinism.js';
import { SIGNAL_SCALE } from '../src/experts/expert-contract.js';
import { evaluateOracle } from '../src/experts/oracle.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import {
  EXPERT_CONTEXT_SCHEMA_VERSION,
  NEXUS_ADJUSTMENT_BOUND_MICRO,
  ORACLE_ADJUSTMENT_BOUND_MICRO,
  TOTAL_ADJUSTMENT_BOUND_MICRO,
  buildExpertContextEnvelope,
  computeContextAdjustmentMicro,
  deriveContextFeatures,
  validateExpertContextEnvelope,
} from '../src/experts/expert-context.js';
import {
  STAGE2H_CONTEXT_SCENARIOS,
  STAGE2H_SEARCH_FIXTURES,
  STAGE2H_STAGE_ID,
  buildScenarioEnvelope,
  buildStage2HPortabilityDigest,
  certifyStage2HPrimeContext,
  compareFixture,
  runBaselineModeGate,
  runStage2HNegativeGates,
} from '../src/lab/stage2h-prime-context-certification.js';
import {
  buildStage2FCampaignManifest,
  buildStage2FQualificationIdentity,
} from '../src/lab/zeknova-stage2f-identity.js';

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------- */

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

function identity(campaignManifest) {
  return buildStage2FQualificationIdentity({
    campaignManifest,
    sessionId: 'stage2h-test-session',
    samplingIdentity: SAMPLING_ID,
  });
}

function scenario(scenarioId) {
  const found = STAGE2H_CONTEXT_SCENARIOS.find((entry) => entry.scenarioId === scenarioId);
  assert.ok(found, `scenario ${scenarioId} must exist`);
  return found;
}

function envelopeFor(scenarioId) {
  const campaignManifest = testCampaignManifest();
  return buildScenarioEnvelope({ qualificationIdentity: identity(campaignManifest), scenario: scenario(scenarioId) });
}

const FIXTURE = STAGE2H_SEARCH_FIXTURES[0];

function runPrime(expertContext) {
  return recommend({
    adapter: referenceGameAdapter,
    state: referenceGameAdapter.initialState(BigInt(FIXTURE.stateSeed)),
    observerId: FIXTURE.observerId,
    simulations: FIXTURE.simulations,
    seed: BigInt(FIXTURE.seed),
    ...(expertContext === undefined ? {} : { expertContext }),
  });
}

/* ---------------------------------------------------------------------------
 * A — zero expert context reproduces legacy Prime exactly
 * ------------------------------------------------------------------------- */

test('A: expertContextEnabled=false reproduces legacy Prime bit-exactly', () => {
  const gate = runBaselineModeGate();
  assert.equal(gate.bitExact, true);
  for (const entry of gate.fixtures) {
    assert.equal(entry.bitExact, true, entry.fixtureId);
    assert.equal(entry.noContextKey, true, `${entry.fixtureId} baseline packet must carry no expertContext key`);
  }
});

test('A: a baseline packet keeps its exact pre-Stage-2H shape', () => {
  const legacy = runPrime(undefined);
  assert.equal('expertContext' in legacy, false);
  assert.equal(legacy.search.priors, 'uniform');
  assert.equal(legacy.authority.tier, 'R0');
});

/* ---------------------------------------------------------------------------
 * B — neutral context
 * ------------------------------------------------------------------------- */

test('B: neutral expert context yields exactly zero adjustment', () => {
  const envelope = envelopeFor('neutral');
  assert.equal(envelope.adjustmentMicro, 0);
  assert.equal(envelope.oracleAdjustmentMicro, 0);
  assert.equal(envelope.nexusAdjustmentMicro, 0);
});

test('B: neutral context leaves Prime\'s decision bit-identical', () => {
  const envelope = envelopeFor('neutral');
  const baseline = runPrime(undefined);
  const withContext = runPrime(envelope);
  assert.deepEqual(withContext.ranking, baseline.ranking);
  assert.equal(withContext.selected.actionKey, baseline.selected.actionKey);

  // The only difference is the provenance block the packet honestly records.
  const strip = (packet) => {
    const { expertContext, recommendationHash, ...rest } = packet;
    return rest;
  };
  assert.equal(sha256(strip(withContext)), sha256(strip(baseline)));
  assert.notEqual(withContext.recommendationHash, baseline.recommendationHash);
  assert.equal(withContext.expertContext.adjustmentMicro, 0);
});

/* ---------------------------------------------------------------------------
 * C / D / E — single and combined influence
 * ------------------------------------------------------------------------- */

test('C: Oracle-only context produces a deterministic bounded adjustment', () => {
  const rising = envelopeFor('oracle-only-rising');
  const falling = envelopeFor('oracle-only-falling');
  assert.equal(rising.nexusAdjustmentMicro, 0);
  assert.equal(falling.nexusAdjustmentMicro, 0);
  assert.ok(rising.oracleAdjustmentMicro > 0);
  assert.ok(falling.oracleAdjustmentMicro < 0);
  assert.ok(Math.abs(rising.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO);
  assert.ok(Math.abs(falling.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO);
  // Deterministic across rebuilds.
  assert.equal(envelopeFor('oracle-only-rising').contextDigest, rising.contextDigest);
});

test('D: Nexus-only context produces a deterministic bounded adjustment', () => {
  const supported = envelopeFor('nexus-only-supported');
  const isolated = envelopeFor('nexus-only-isolated');
  assert.equal(supported.oracleAdjustmentMicro, 0);
  assert.equal(isolated.oracleAdjustmentMicro, 0);
  assert.ok(supported.nexusAdjustmentMicro > 0);
  assert.ok(isolated.nexusAdjustmentMicro < 0);
  assert.ok(Math.abs(supported.nexusAdjustmentMicro) <= NEXUS_ADJUSTMENT_BOUND_MICRO);
  assert.equal(envelopeFor('nexus-only-isolated').contextDigest, isolated.contextDigest);
});

test('E: combined context composes both experts deterministically', () => {
  const envelope = envelopeFor('combined');
  const expected = envelope.oracleAdjustmentMicro + envelope.nexusAdjustmentMicro;
  const clamped = Math.max(-TOTAL_ADJUSTMENT_BOUND_MICRO, Math.min(TOTAL_ADJUSTMENT_BOUND_MICRO, expected));
  assert.equal(envelope.adjustmentMicro, clamped);
  assert.notEqual(envelope.oracleAdjustmentMicro, 0);
  assert.notEqual(envelope.nexusAdjustmentMicro, 0);
});

/* ---------------------------------------------------------------------------
 * F / G — clamps
 * ------------------------------------------------------------------------- */

test('F: maximum positive adjustment is clamped at the documented bound', () => {
  const envelope = envelopeFor('max-positive');
  assert.equal(envelope.adjustmentMicro, TOTAL_ADJUSTMENT_BOUND_MICRO);

  // Synthetic extreme: every positive feature saturated.
  const extreme = computeContextAdjustmentMicro(deriveContextFeatures({
    oracleSignals: { sufficientHistory: SIGNAL_SCALE, maxVolatility: 0, 'channel:x:direction': SIGNAL_SCALE },
    nexusSignals: { entityCount: 4, threatenedEntityCount: 4, unsupportedThreatenedCount: 0, isolatedRatio: 0, criticalDependencyCount: 0, unresolvedDependencyCount: 0, cycleNodeCount: 0 },
  }));
  assert.equal(extreme.oracleMicro, ORACLE_ADJUSTMENT_BOUND_MICRO);
  assert.equal(extreme.nexusMicro, NEXUS_ADJUSTMENT_BOUND_MICRO);
  assert.equal(extreme.totalMicro, TOTAL_ADJUSTMENT_BOUND_MICRO);
  assert.equal(extreme.totalClamped, true);
  // The combined bound is strictly tighter than the sum of the parts.
  assert.ok(TOTAL_ADJUSTMENT_BOUND_MICRO < ORACLE_ADJUSTMENT_BOUND_MICRO + NEXUS_ADJUSTMENT_BOUND_MICRO);
});

test('G: maximum negative adjustment is clamped at the documented bound', () => {
  const envelope = envelopeFor('max-negative');
  assert.equal(envelope.adjustmentMicro, -TOTAL_ADJUSTMENT_BOUND_MICRO);

  const extreme = computeContextAdjustmentMicro(deriveContextFeatures({
    oracleSignals: { sufficientHistory: SIGNAL_SCALE, maxVolatility: SIGNAL_SCALE, 'channel:x:direction': -SIGNAL_SCALE },
    nexusSignals: { entityCount: 4, threatenedEntityCount: 0, unsupportedThreatenedCount: 0, isolatedRatio: SIGNAL_SCALE, criticalDependencyCount: 4, unresolvedDependencyCount: 4, cycleNodeCount: 4 },
  }));
  assert.equal(extreme.oracleMicro, -ORACLE_ADJUSTMENT_BOUND_MICRO);
  assert.equal(extreme.nexusMicro, -NEXUS_ADJUSTMENT_BOUND_MICRO);
  assert.equal(extreme.totalMicro, -TOTAL_ADJUSTMENT_BOUND_MICRO);
});

test('adjustment stays inside its bound for every canonical scenario', () => {
  for (const entry of STAGE2H_CONTEXT_SCENARIOS) {
    const envelope = envelopeFor(entry.scenarioId);
    assert.ok(Math.abs(envelope.adjustmentMicro) <= TOTAL_ADJUSTMENT_BOUND_MICRO, entry.scenarioId);
    assert.ok(Math.abs(envelope.oracleAdjustmentMicro) <= ORACLE_ADJUSTMENT_BOUND_MICRO, entry.scenarioId);
    assert.ok(Math.abs(envelope.nexusAdjustmentMicro) <= NEXUS_ADJUSTMENT_BOUND_MICRO, entry.scenarioId);
  }
});

/* ---------------------------------------------------------------------------
 * H..N — rejection gates
 * ------------------------------------------------------------------------- */

test('H..N: every forged or malformed context is rejected by Prime', () => {
  const campaignManifest = testCampaignManifest();
  const gates = runStage2HNegativeGates({ campaignManifest, envelope: envelopeFor('combined') });
  assert.ok(gates.length >= 16);
  for (const gate of gates) {
    assert.equal(gate.rejected, true, `negative gate ${gate.name} must reject`);
  }
});

test('H: malformed Oracle output cannot enter the envelope', () => {
  const campaignManifest = testCampaignManifest();
  const qualificationIdentity = identity(campaignManifest);
  const nexusOutput = evaluateNexus({ canonicalState: {} });
  const broken = { ...evaluateOracle({ observationHistory: [] }), outputDigest: `sha256:${'9'.repeat(64)}` };
  assert.throws(
    () => buildExpertContextEnvelope({ qualificationIdentity, observationId: 'x', oracleOutput: broken, nexusOutput }),
    (error) => error.code === 'EXPERT_DIGEST_MISMATCH',
  );
});

test('I: an expert output cannot be swapped into the wrong slot', () => {
  const campaignManifest = testCampaignManifest();
  const qualificationIdentity = identity(campaignManifest);
  const oracleOutput = evaluateOracle({ observationHistory: [] });
  const nexusOutput = evaluateNexus({ canonicalState: {} });
  assert.throws(
    () => buildExpertContextEnvelope({ qualificationIdentity, observationId: 'x', oracleOutput: nexusOutput, nexusOutput: oracleOutput }),
    (error) => error.code === 'EXPERT_CONTEXT_IDENTITY_MISMATCH',
  );
});

test('J/K: runtime and campaign identity substitution are rejected', () => {
  const campaignManifest = testCampaignManifest();
  const envelope = envelopeFor('combined');

  const forgedRuntime = structuredClone(envelope);
  forgedRuntime.sentinelRuntimeId = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateExpertContextEnvelope(forgedRuntime, { campaignManifest }), (error) => error.code === 'RUNTIME_ID_MISMATCH');

  const forgedCampaign = structuredClone(envelope);
  forgedCampaign.stage2fCampaignId = `sha256:${'1'.repeat(64)}`;
  assert.throws(() => validateExpertContextEnvelope(forgedCampaign, { campaignManifest }), (error) => error.code === 'CAMPAIGN_ID_MISMATCH');
});

test('L: expert digest substitution is rejected', () => {
  const envelope = envelopeFor('combined');
  const forged = structuredClone(envelope);
  forged.nexus.outputDigest = `sha256:${'2'.repeat(64)}`;
  assert.throws(() => validateExpertContextEnvelope(forged), (error) => error.code === 'EXPERT_CONTEXT_DIGEST_MISMATCH');
});

test('M: expert context can never make an illegal action legal', () => {
  const legalKeys = new Set(
    referenceGameAdapter.legalActions(referenceGameAdapter.initialState(BigInt(FIXTURE.stateSeed)), FIXTURE.observerId)
      .map((action) => JSON.stringify(action)),
  );
  for (const entry of STAGE2H_CONTEXT_SCENARIOS) {
    const envelope = envelopeFor(entry.scenarioId);
    const baseline = runPrime(undefined);
    const withContext = runPrime(envelope);
    assert.equal(withContext.input.legalActionsHash, baseline.input.legalActionsHash, entry.scenarioId);
    assert.equal(withContext.input.legalActionCount, baseline.input.legalActionCount, entry.scenarioId);
    assert.equal(withContext.ranking.length, baseline.ranking.length, entry.scenarioId);
    for (const ranked of withContext.ranking) {
      assert.ok(legalKeys.has(JSON.stringify(ranked.action)), `${entry.scenarioId} ranked an action outside the legal set`);
    }
  }
});

test('N: forged authority in expert data is rejected, never honoured', () => {
  const envelope = envelopeFor('combined');
  for (const forgery of [
    { canDispatch: true },
    { canMutateLiveWorld: true },
    { canIssueAuthorityTokens: true },
    { tier: 'R2' },
  ]) {
    const forged = structuredClone(envelope);
    forged.authority = { ...forged.authority, ...forgery };
    assert.throws(() => validateExpertContextEnvelope(forged), (error) => error.code === 'AUTHORITY_MISMATCH' || error.code === 'EXPERT_EXECUTION_SURFACE');
  }
});

test('N: expert context cannot carry an action, a target, or priors', () => {
  const envelope = envelopeFor('combined');
  assert.equal(envelope.carriesActionSelection, false);
  assert.equal(envelope.carriesActionPriors, false);
  assert.equal(envelope.finalRecommendationOwner, 'PRIME');
  for (const key of ['action', 'actionKey', 'selected', 'selectedAction', 'priors', 'prior', 'targetEntityId']) {
    assert.equal(key in envelope, false, `envelope must not carry ${key}`);
    const forged = structuredClone(envelope);
    forged[key] = { actionId: 'attack' };
    assert.throws(() => validateExpertContextEnvelope(forged));
  }
});

test('no dispatch, mutation, or authority-token path exists through expert context', () => {
  const envelope = envelopeFor('combined');
  const serialized = JSON.stringify(envelope);
  for (const forbidden of ['dispatch(', 'mutateWorld', 'authorityToken', 'escalateAuthority']) {
    assert.ok(!serialized.includes(forbidden), `expert context must not expose ${forbidden}`);
  }
  // Nothing in the envelope is callable.
  const walk = (value) => {
    if (value === null || typeof value !== 'object') {
      assert.notEqual(typeof value, 'function');
      return;
    }
    for (const entry of Object.values(value)) walk(entry);
  };
  walk(envelope);
  assert.equal(Object.isFrozen(envelope), true);
});

/* ---------------------------------------------------------------------------
 * O / P — replay and portability
 * ------------------------------------------------------------------------- */

test('O: identical observations and expert outputs replay identically', () => {
  for (const entry of STAGE2H_CONTEXT_SCENARIOS) {
    const first = envelopeFor(entry.scenarioId);
    const second = envelopeFor(entry.scenarioId);
    assert.equal(first.contextDigest, second.contextDigest, entry.scenarioId);
    for (const fixture of STAGE2H_SEARCH_FIXTURES) {
      const a = compareFixture({ fixture, envelope: first });
      const b = compareFixture({ fixture, envelope: second });
      assert.equal(a.withContext.recommendationHash, b.withContext.recommendationHash, `${entry.scenarioId}/${fixture.fixtureId}`);
    }
  }
});

test('P: Stage 2H portability digest is stable within this platform', () => {
  const campaignManifest = testCampaignManifest();
  const first = buildStage2HPortabilityDigest({ campaignManifest });
  const second = buildStage2HPortabilityDigest({ campaignManifest });
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});

test('Stage 2H path uses no non-portable transcendental math', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../src/experts/expert-context.js', '../src/lab/stage2h-prime-context-certification.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['Math.tanh', 'Math.exp', 'Math.log', 'Math.pow', 'Math.sin', 'Math.cos', 'Math.random', 'Date.now']) {
      assert.ok(!code.includes(forbidden), `${file} must not use ${forbidden}`);
    }
  }
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('Stage 2H certification passes and stays at R0', () => {
  const campaignManifest = testCampaignManifest();
  const { certification } = certifyStage2HPrimeContext({ campaignManifest });

  assert.equal(certification.stage, STAGE2H_STAGE_ID);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.expertContextSchemaVersion, EXPERT_CONTEXT_SCHEMA_VERSION);

  assert.equal(certification.oracleContextConsumed, true);
  assert.equal(certification.nexusContextConsumed, true);
  assert.equal(certification.primeRemainsDecisionOwner, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.oracleRole, 'ADVISORY_CONTEXT');
  assert.equal(certification.nexusRole, 'ADVISORY_CONTEXT');

  assert.equal(certification.baselineModeBitExact, true);
  assert.equal(certification.neutralContextIsZero, true);
  assert.equal(certification.neutralContextBitExact, true);
  assert.equal(certification.expertAdjustmentBounded, true);
  assert.equal(certification.positiveClampCertified, true);
  assert.equal(certification.negativeClampCertified, true);
  assert.equal(certification.legalActionsPreserved, true);
  assert.equal(certification.priorsUnchanged, true);
  assert.equal(certification.replayEquivalent, true);
  assert.equal(certification.negativeGatesPassed, true);

  assert.equal(certification.expertCanOverrideLegalMask, false);
  assert.equal(certification.expertCanBypassPrime, false);
  assert.equal(certification.expertDispatchPathExists, false);
  assert.equal(certification.expertMutationPathExists, false);
  assert.equal(certification.expertAuthorityTokenPathExists, false);

  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.authorityTokenIssues, 0);
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);

  assert.equal(certification.stage2hCertified, true);
});

test('Stage 2H certification is reproducible and self-excluding', () => {
  const campaignManifest = testCampaignManifest();
  const first = certifyStage2HPrimeContext({ campaignManifest });
  const second = certifyStage2HPrimeContext({ campaignManifest });
  assert.equal(first.certification.certificationHash, second.certification.certificationHash);
  const { certificationHash, ...body } = first.certification;
  assert.ok(!JSON.stringify(body).includes(certificationHash));
});
