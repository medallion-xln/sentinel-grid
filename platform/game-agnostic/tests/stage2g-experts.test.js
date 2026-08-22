import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EXPERT_CONTRACT_VERSION,
  MAX_ENTITIES,
  SIGNAL_SCALE,
  assertNoExecutionSurface,
  isExactR0AuthorityBlock,
  quantizeUnit,
  roundHalfAwayFromZero,
  squash,
  validateExpertOutput,
} from '../src/experts/expert-contract.js';
import { ORACLE_EXPERT_ID, evaluateOracle, oracleManifest } from '../src/experts/oracle.js';
import { NEXUS_EXPERT_ID, NEXUS_MAX_DEPTH, evaluateNexus, nexusManifest } from '../src/experts/nexus.js';
import {
  STAGE2G_NEXUS_CASES,
  STAGE2G_ORACLE_CASES,
  STAGE2G_STAGE_ID,
  buildStage2GEvidenceRecord,
  buildStage2GPortabilityDigest,
  certifyStage2GExperts,
  runStage2GNegativeGates,
  validateStage2GEvidenceRecord,
} from '../src/lab/stage2g-expert-certification.js';
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

function testQualificationIdentity(campaignManifest) {
  return buildStage2FQualificationIdentity({
    campaignManifest,
    sessionId: 'stage2g-test-session',
    samplingIdentity: SAMPLING_ID,
  });
}

function history(values, channel = 'supply') {
  return values.map((value, index) => ({ tick: index, channels: { [channel]: value } }));
}

/* ---------------------------------------------------------------------------
 * Shared contract
 * ------------------------------------------------------------------------- */

test('fixed-point helpers are deterministic and symmetric around zero', () => {
  assert.equal(roundHalfAwayFromZero(0.5), 1);
  assert.equal(roundHalfAwayFromZero(-0.5), -1);
  assert.equal(roundHalfAwayFromZero(2.4), 2);
  assert.equal(roundHalfAwayFromZero(-2.4), -2);
  // squash is bounded in (-1, 1) and uses only division.
  assert.ok(squash(1e9) < 1 && squash(1e9) > 0.999);
  assert.ok(squash(-1e9) > -1 && squash(-1e9) < -0.999);
  assert.equal(squash(0), 0);
  assert.equal(quantizeUnit(1.5), SIGNAL_SCALE);
  assert.equal(quantizeUnit(-1.5), -SIGNAL_SCALE);
});

test('expert path uses no non-portable transcendental math', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../src/experts/expert-contract.js', '../src/experts/oracle.js', '../src/experts/nexus.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['Math.tanh', 'Math.exp', 'Math.log', 'Math.pow', 'Math.sin', 'Math.cos', 'Math.random', 'Date.now']) {
      assert.ok(!code.includes(forbidden), `${file} must not use ${forbidden}`);
    }
  }
});

test('execution-surface scan exempts only the exact R0 denial block', () => {
  assert.equal(isExactR0AuthorityBlock({ tier: 'R0', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false }), true);
  assert.equal(isExactR0AuthorityBlock({ tier: 'R0', canDispatch: true, canMutateLiveWorld: false, canIssueAuthorityTokens: false }), false);
  assert.equal(isExactR0AuthorityBlock({ tier: 'R1', canDispatch: false, canMutateLiveWorld: false, canIssueAuthorityTokens: false }), false);
  // A forged authority block is scanned, and its dispatch key is rejected.
  assert.throws(
    () => assertNoExecutionSurface({ authority: { tier: 'R0', canDispatch: true, canMutateLiveWorld: false, canIssueAuthorityTokens: false } }),
    (error) => error.code === 'EXPERT_EXECUTION_SURFACE',
  );
});

test('experts declare no randomness and no wall clock', () => {
  for (const manifest of [oracleManifest, nexusManifest]) {
    assert.equal(manifest.usesRandomness, false);
    assert.equal(manifest.usesWallClock, false);
    assert.equal(manifest.isLearned, false);
    assert.equal(manifest.authorityTier, 'R0');
    assert.equal(manifest.expertContractVersion, EXPERT_CONTRACT_VERSION);
  }
});

/* ---------------------------------------------------------------------------
 * Sentinel Oracle — required cases 1..10
 * ------------------------------------------------------------------------- */

test('oracle 1: identical history yields an identical result', () => {
  const input = { observationHistory: history([0.1, 0.2, 0.3, 0.4]) };
  const first = evaluateOracle(structuredClone(input));
  const second = evaluateOracle(structuredClone(input));
  assert.equal(first.outputDigest, second.outputDigest);
  assert.deepEqual(first.signals, second.signals);
});

test('oracle 2: increasing sequence reports a rising trend', () => {
  const output = evaluateOracle({ observationHistory: history([0.1, 0.2, 0.3, 0.4, 0.5]) });
  assert.equal(output.signals['channel:supply:direction'], SIGNAL_SCALE);
  assert.ok(output.signals['channel:supply:slope'] > 0);
  assert.equal(output.signals['channel:supply:persistence'], SIGNAL_SCALE);
  assert.ok(output.rationaleCodes.includes('ORACLE_TREND_RISING'));
});

test('oracle 3: decreasing sequence reports a falling trend', () => {
  const output = evaluateOracle({ observationHistory: history([0.9, 0.7, 0.5, 0.3, 0.1]) });
  assert.equal(output.signals['channel:supply:direction'], -SIGNAL_SCALE);
  assert.ok(output.signals['channel:supply:slope'] < 0);
  assert.ok(output.rationaleCodes.includes('ORACLE_TREND_FALLING'));
});

test('oracle 4: flat sequence is stable with zero slope and volatility', () => {
  const output = evaluateOracle({ observationHistory: history([0.4, 0.4, 0.4, 0.4]) });
  assert.equal(output.signals['channel:supply:slope'], 0);
  assert.equal(output.signals['channel:supply:direction'], 0);
  assert.equal(output.signals['channel:supply:volatility'], 0);
  assert.ok(output.rationaleCodes.includes('ORACLE_TREND_FLAT'));
  assert.ok(output.rationaleCodes.includes('ORACLE_STABLE'));
  assert.ok(output.rationaleCodes.includes('ORACLE_REPEATED_STATE'));
});

test('oracle 5: volatile sequence reports high volatility', () => {
  const volatile = evaluateOracle({ observationHistory: history([0.1, 0.9, 0.15, 0.85, 0.2, 0.8]) });
  const calm = evaluateOracle({ observationHistory: history([0.40, 0.41, 0.42, 0.43, 0.44, 0.45]) });
  assert.ok(volatile.signals['channel:supply:volatility'] > calm.signals['channel:supply:volatility']);
  assert.ok(volatile.rationaleCodes.includes('ORACLE_VOLATILE'));
});

test('oracle 6: insufficient history degrades instead of guessing', () => {
  const output = evaluateOracle({ observationHistory: history([0.3, 0.4]) });
  assert.equal(output.signals.sufficientHistory, 0);
  assert.equal(output.signals['channel:supply:slope'], 0);
  assert.equal(output.confidence, 0);
  assert.ok(output.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'));
});

test('oracle 7: malformed and unavailable optional history are handled', () => {
  // Absent history is legal.
  const absent = evaluateOracle({});
  assert.equal(absent.signals.historyFrameCount, 0);
  assert.ok(absent.rationaleCodes.includes('ORACLE_NO_CHANNELS'));

  // A channel present in only some frames degrades to a partial-history signal.
  const partial = evaluateOracle({
    observationHistory: [
      { tick: 0, channels: { supply: 0.2 } },
      { tick: 1, channels: { supply: 0.3, pressure: 0.5 } },
      { tick: 2, channels: { supply: 0.4, pressure: 0.4 } },
      { tick: 3, channels: { supply: 0.5, pressure: 0.3 } },
    ],
  });
  assert.equal(partial.signals.partialChannelCount, 1);
  assert.ok(partial.rationaleCodes.includes('ORACLE_PARTIAL_CHANNEL_HISTORY'));

  // Structurally malformed history is rejected, not silently coerced.
  assert.throws(() => evaluateOracle({ observationHistory: [{ tick: 'x', channels: {} }] }), (error) => error.code === 'EXPERT_INPUT_INVALID');
  assert.throws(() => evaluateOracle({ observationHistory: [{ tick: 0, channels: { supply: Number.NaN } }] }), (error) => error.code === 'EXPERT_INPUT_INVALID');
  assert.throws(() => evaluateOracle({ observationHistory: 'not-an-array' }), (error) => error.code === 'EXPERT_INPUT_INVALID');
});

test('oracle 8: replay of the same certified observations is equivalent', () => {
  for (const testCase of STAGE2G_ORACLE_CASES) {
    const original = evaluateOracle(structuredClone(testCase.input));
    const replayed = evaluateOracle(structuredClone(testCase.input));
    assert.equal(original.inputDigest, replayed.inputDigest, testCase.caseId);
    assert.equal(original.outputDigest, replayed.outputDigest, testCase.caseId);
  }
});

test('oracle 9: canonical digest is stable across key and frame ordering', () => {
  const ordered = evaluateOracle({
    observationHistory: [
      { tick: 0, channels: { alpha: 0.1, beta: 0.9 } },
      { tick: 1, channels: { alpha: 0.2, beta: 0.8 } },
      { tick: 2, channels: { alpha: 0.3, beta: 0.7 } },
    ],
  });
  const shuffled = evaluateOracle({
    observationHistory: [
      { channels: { beta: 0.7, alpha: 0.3 }, tick: 2 },
      { channels: { beta: 0.9, alpha: 0.1 }, tick: 0 },
      { channels: { alpha: 0.2, beta: 0.8 }, tick: 1 },
    ],
  });
  assert.equal(ordered.outputDigest, shuffled.outputDigest);
});

test('oracle 10: output is inert R0 with no execution surface', () => {
  const output = evaluateOracle({ observationHistory: history([0.1, 0.2, 0.3]) });
  validateExpertOutput(output);
  assert.equal(output.authority.tier, 'R0');
  assert.equal(output.authority.canDispatch, false);
  assert.equal(output.authority.canMutateLiveWorld, false);
  assert.equal(output.authority.canIssueAuthorityTokens, false);
  assert.equal(output.advisoryOnly, true);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(output.expertId, ORACLE_EXPERT_ID);
  // No key anywhere names an execution surface, and nothing is callable.
  assertNoExecutionSurface(output, 'oracleOutput');
});

/* ---------------------------------------------------------------------------
 * Sentinel Nexus — required cases 1..10
 * ------------------------------------------------------------------------- */

test('nexus 1: identical graph yields an identical result', () => {
  const input = STAGE2G_NEXUS_CASES[0].input;
  const first = evaluateNexus(structuredClone(input));
  const second = evaluateNexus(structuredClone(input));
  assert.equal(first.outputDigest, second.outputDigest);
});

test('nexus 2: disconnected entities are reported as isolated', () => {
  const output = evaluateNexus({ canonicalState: { entities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], relationships: [] } });
  assert.equal(output.signals.entityCount, 3);
  assert.equal(output.signals.isolatedEntityCount, 3);
  assert.equal(output.signals.isolatedRatio, SIGNAL_SCALE);
  assert.ok(output.rationaleCodes.includes('NEXUS_ISOLATED_ENTITY'));
  assert.ok(output.rationaleCodes.includes('NEXUS_NO_RELATIONSHIPS'));
});

test('nexus 3: a single critical dependency is identified', () => {
  const output = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'core', critical: true }, { id: 'alpha' }, { id: 'beta' }],
      relationships: [
        { from: 'alpha', to: 'core', kind: 'depends' },
        { from: 'beta', to: 'core', kind: 'depends' },
      ],
    },
  });
  assert.equal(output.signals.criticalDependencyCount, 1);
  assert.equal(output.signals.maxDependents, 2);
  assert.ok(output.rationaleCodes.includes('NEXUS_CRITICAL_DEPENDENCY'));
});

test('nexus 4: multiple dependency paths are measured to full depth', () => {
  const output = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'sink' }, { id: 'mid-a' }, { id: 'mid-b' }, { id: 'root' }],
      relationships: [
        { from: 'root', to: 'mid-a', kind: 'depends' },
        { from: 'root', to: 'mid-b', kind: 'depends' },
        { from: 'mid-a', to: 'sink', kind: 'depends' },
        { from: 'mid-b', to: 'sink', kind: 'depends' },
      ],
    },
  });
  assert.equal(output.signals.maxDependencyDepth, 2);
  assert.equal(output.signals.maxDependents, 2);
  assert.equal(output.signals.cycleDetected, 0);
});

test('nexus 5: cycles are detected and terminate', () => {
  const output = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'p' }, { id: 'q' }, { id: 'r' }],
      relationships: [
        { from: 'p', to: 'q', kind: 'depends' },
        { from: 'q', to: 'r', kind: 'depends' },
        { from: 'r', to: 'p', kind: 'depends' },
      ],
    },
  });
  assert.equal(output.signals.cycleDetected, SIGNAL_SCALE);
  assert.ok(output.signals.cycleNodeCount >= 2);
  assert.ok(output.rationaleCodes.includes('NEXUS_CYCLE_DETECTED'));
  assert.ok(output.signals.maxDependencyDepth <= NEXUS_MAX_DEPTH);
});

test('nexus 6: missing optional relationship data degrades safely', () => {
  const noRelationships = evaluateNexus({ canonicalState: { entities: [{ id: 'solo' }] } });
  assert.equal(noRelationships.signals.edgeCount, 0);
  assert.ok(noRelationships.rationaleCodes.includes('NEXUS_NO_RELATIONSHIPS'));

  const noState = evaluateNexus({});
  assert.equal(noState.signals.entityCount, 0);
  assert.ok(noState.rationaleCodes.includes('NEXUS_EMPTY_GRAPH'));

  const malformed = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'ok' }, { id: 'ok' }, { noId: true }],
      relationships: [{ from: 'ok', kind: 'depends' }, { from: 'ok', to: 'ok', kind: 'teleports' }, { from: 'ok', to: 'ghost', kind: 'depends' }],
    },
  });
  assert.equal(malformed.signals.entityCount, 1);
  assert.equal(malformed.signals.unresolvedDependencyCount, 1);
  assert.ok(malformed.rationaleCodes.includes('NEXUS_DUPLICATE_ENTITY'));
  assert.ok(malformed.rationaleCodes.includes('NEXUS_MALFORMED_ENTITIES'));
  assert.ok(malformed.rationaleCodes.includes('NEXUS_MALFORMED_RELATIONSHIPS'));
  assert.ok(malformed.rationaleCodes.includes('NEXUS_UNKNOWN_EDGE_KIND'));
  assert.ok(malformed.rationaleCodes.includes('NEXUS_UNRESOLVED_DEPENDENCY'));
});

test('nexus 7: oversized graphs are bounded deterministically', () => {
  const entities = Array.from({ length: MAX_ENTITIES + 50 }, (unused, index) => ({ id: `e-${String(index).padStart(5, '0')}` }));
  const output = evaluateNexus({ canonicalState: { entities, relationships: [] } });
  assert.equal(output.signals.entityCount, MAX_ENTITIES);
  assert.ok(output.rationaleCodes.includes('NEXUS_GRAPH_TRUNCATED'));

  // Truncation is stable: the same oversized input truncates the same way.
  const again = evaluateNexus({ canonicalState: { entities: [...entities], relationships: [] } });
  assert.equal(output.outputDigest, again.outputDigest);
});

test('nexus 8: replay of the same certified graphs is equivalent', () => {
  for (const testCase of STAGE2G_NEXUS_CASES) {
    const original = evaluateNexus(structuredClone(testCase.input));
    const replayed = evaluateNexus(structuredClone(testCase.input));
    assert.equal(original.inputDigest, replayed.inputDigest, testCase.caseId);
    assert.equal(original.outputDigest, replayed.outputDigest, testCase.caseId);
  }
});

test('nexus 9: canonical digest is stable across entity and edge ordering', () => {
  const ordered = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      relationships: [
        { from: 'a', to: 'b', kind: 'depends' },
        { from: 'b', to: 'c', kind: 'depends' },
      ],
    },
  });
  const shuffled = evaluateNexus({
    canonicalState: {
      entities: [{ id: 'c' }, { id: 'a' }, { id: 'b' }],
      relationships: [
        { kind: 'depends', to: 'c', from: 'b' },
        { to: 'b', kind: 'depends', from: 'a' },
      ],
    },
  });
  assert.deepEqual(ordered.signals, shuffled.signals);
});

test('nexus 10: output is inert R0 with no execution surface', () => {
  const output = evaluateNexus(STAGE2G_NEXUS_CASES[0].input);
  validateExpertOutput(output);
  assert.equal(output.authority.tier, 'R0');
  assert.equal(output.authority.canDispatch, false);
  assert.equal(output.authority.canMutateLiveWorld, false);
  assert.equal(output.advisoryOnly, true);
  assert.equal(Object.isFrozen(output), true);
  assert.equal(output.expertId, NEXUS_EXPERT_ID);
  assertNoExecutionSurface(output, 'nexusOutput');
});

test('experts never mutate their inputs', () => {
  const oracleInput = { observationHistory: history([0.1, 0.2, 0.3]) };
  const oracleBefore = JSON.stringify(oracleInput);
  evaluateOracle(oracleInput);
  assert.equal(JSON.stringify(oracleInput), oracleBefore);

  const nexusInput = structuredClone(STAGE2G_NEXUS_CASES[0].input);
  const nexusBefore = JSON.stringify(nexusInput);
  evaluateNexus(nexusInput);
  assert.equal(JSON.stringify(nexusInput), nexusBefore);
});

/* ---------------------------------------------------------------------------
 * Stage 2F provenance inheritance and certification
 * ------------------------------------------------------------------------- */

test('evidence records inherit the Stage 2F identity verbatim', () => {
  const campaignManifest = testCampaignManifest();
  const identity = testQualificationIdentity(campaignManifest);
  const output = evaluateOracle({ observationHistory: history([0.1, 0.2, 0.3]) });
  const record = buildStage2GEvidenceRecord({
    qualificationIdentity: identity,
    observationId: 'obs-1',
    recordId: 'rec-1',
    expertOutput: output,
  });

  assert.equal(record.sentinelRuntimeId, campaignManifest.sentinelRuntimeId);
  assert.equal(record.generatedRuntimeProvenanceId, campaignManifest.generatedRuntimeProvenanceId);
  assert.equal(record.stage2fCampaignId, campaignManifest.stage2fCampaignId);
  assert.equal(record.expertOutputDigest, output.outputDigest);
  assert.equal(record.expertInputDigest, output.inputDigest);
  assert.equal(record.countsTowardStage2FQualification, false);
  assert.equal(record.consumedBy, 'shadow-evaluation-only');
  validateStage2GEvidenceRecord(record, { campaignManifest });
});

test('Stage 2G evidence can never inflate Stage 2F qualification', () => {
  const campaignManifest = testCampaignManifest();
  const identity = testQualificationIdentity(campaignManifest);
  // The frozen campaign is PREPARED, so nothing derived from it is qualification-eligible.
  assert.equal(identity.qualificationEligible, false);
  const record = buildStage2GEvidenceRecord({
    qualificationIdentity: identity,
    observationId: 'obs-2',
    recordId: 'rec-2',
    expertOutput: evaluateNexus(STAGE2G_NEXUS_CASES[0].input),
  });
  assert.equal(record.qualificationEligible, false);
  assert.equal(record.countsTowardStage2FQualification, false);
});

test('negative gates reject every forged expert output and identity', () => {
  const campaignManifest = testCampaignManifest();
  const identity = testQualificationIdentity(campaignManifest);
  const gates = runStage2GNegativeGates({
    qualificationIdentity: identity,
    campaignManifest,
    baselineOutput: evaluateOracle({ observationHistory: history([0.1, 0.2, 0.3]) }),
  });
  assert.ok(gates.length >= 12);
  for (const gate of gates) {
    assert.equal(gate.rejected, true, `negative gate ${gate.name} must reject`);
  }
});

test('Stage 2G certification passes and stays at R0', () => {
  const campaignManifest = testCampaignManifest();
  const { certification, records } = certifyStage2GExperts({ campaignManifest });

  assert.equal(certification.stage, STAGE2G_STAGE_ID);
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.oracleCertified, true);
  assert.equal(certification.nexusCertified, true);
  assert.equal(certification.oracleDeterministic, true);
  assert.equal(certification.nexusDeterministic, true);
  assert.equal(certification.oracleReplayEquivalent, true);
  assert.equal(certification.nexusReplayEquivalent, true);
  assert.equal(certification.stage2fProvenanceInherited, true);
  assert.equal(certification.runtimeIdentityBound, true);
  assert.equal(certification.campaignBound, true);
  assert.equal(certification.expertOutputDigestBound, true);
  assert.equal(certification.negativeGatesPassed, true);
  assert.equal(certification.stage2gCertified, true);

  // Hard safety contract.
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.authorityTokenIssues, 0);
  assert.equal(certification.incumbentScriptedExecutorPreserved, true);

  // Prime and the router are untouched in this pass.
  assert.equal(certification.primeIntegration, 'none-prime-unmodified');
  assert.equal(certification.routerIntegration, 'none-shadow-envelope-only');

  assert.equal(records.length, STAGE2G_ORACLE_CASES.length + STAGE2G_NEXUS_CASES.length);
});

test('certification is reproducible byte for byte', () => {
  const campaignManifest = testCampaignManifest();
  const first = certifyStage2GExperts({ campaignManifest });
  const second = certifyStage2GExperts({ campaignManifest });
  assert.equal(first.certification.certificationHash, second.certification.certificationHash);
  assert.equal(first.certification.evidenceDigest, second.certification.evidenceDigest);
});

test('certification hash is self-excluding', () => {
  const campaignManifest = testCampaignManifest();
  const { certification } = certifyStage2GExperts({ campaignManifest });
  const { certificationHash, ...body } = certification;
  assert.ok(!JSON.stringify(body).includes(certificationHash));
});

test('portability digest is stable within this platform', () => {
  const first = buildStage2GPortabilityDigest();
  const second = buildStage2GPortabilityDigest();
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^[a-f0-9]{64}$/);
});

test('stored portability artifact still reproduces its recorded digest', async () => {
  const { readFile } = await import('node:fs/promises');
  let stored;
  try {
    stored = JSON.parse(await readFile(new URL('../artifacts/stage2g-experts/stage2g-portability-report.json', import.meta.url), 'utf8'));
  } catch {
    // No artifact in this tree (fresh clone): nothing to guard yet.
    return;
  }
  const measured = buildStage2GPortabilityDigest();
  // A recorded PASS must keep reproducing, or it is drift rather than evidence.
  assert.equal(stored.digest, measured.digest, 'stored portability digest no longer reproduces');
  assert.deepEqual(stored.disagreeingPlatforms ?? [], [], 'a recorded platform disagrees with the current digest');
  assert.notEqual(stored.portabilityStatus, 'FAIL');
  if (stored.portabilityStatus === 'PASS') {
    assert.ok(stored.platformsPassed.length >= 2, 'PASS requires at least two measured platforms');
    for (const entry of stored.measuredPlatforms) {
      assert.equal(entry.digest, measured.digest, `recorded platform ${entry.platform}/${entry.arch} must reproduce the digest`);
    }
  }
});
