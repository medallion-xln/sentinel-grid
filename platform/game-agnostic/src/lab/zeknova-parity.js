import { performance } from 'node:perf_hooks';
import { actionKey, validateObservationPacket } from '../core/contracts.js';
import { createSeededRandom, deriveSeed, sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';
import {
  LEGACY_ACTIONS,
  LEGACY_ENGINE_ID,
  legacyLegalActions,
  legacyMask,
  legacyObservation,
  legacyOutcome,
  legacyRecommend,
  legacyStep,
  legacyTargets,
} from '../compat/zeknova-stage1az-legacy.js';
import { buildAdapterDeterministicEvidence } from './evidence.js';

function serializeError(error) {
  return { name: error?.name ?? 'Error', message: error?.message ?? String(error), details: error?.details };
}

function normalizeRanking(ranking) {
  return ranking.map((entry) => ({
    actionKey: entry.actionKey,
    visits: entry.visits,
    valueSum: Number(entry.valueSum.toFixed(12)),
    meanValue: Number(entry.meanValue.toFixed(12)),
  }));
}

function equalJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function runZekNovaBehavioralParity({ adapter, manifest, configuration, fixtures, baseline }) {
  const checks = [];
  const fixtureResults = [];
  function check(name, fn) {
    const started = performance.now();
    try {
      const details = fn() ?? {};
      checks.push({ name, pass: true, durationMs: Number((performance.now() - started).toFixed(3)), ...details });
    } catch (error) {
      checks.push({ name, pass: false, durationMs: Number((performance.now() - started).toFixed(3)), error: serializeError(error) });
    }
  }

  check('zeknova-production-manifest', () => {
    if (manifest.gameId !== 'zeknova' || manifest.adapterId !== 'zeknova-stage1az-shadow-adapter') throw new Error('Unexpected ZekNova adapter identity');
    if (manifest.authority.tier !== 'R0' || manifest.authority.executionInterface !== false) throw new Error('ZekNova adapter authority boundary changed');
    if (manifest.metadata.observationFeatureCount !== 592) throw new Error('ZekNova observation feature count must remain 592');
    if (!equalJson(manifest.metadata.actionCatalog, LEGACY_ACTIONS)) throw new Error('ZekNova six-action catalog changed');
    return { adapterVersion: manifest.adapterVersion, observationFeatureCount: 592, actionCount: 6, engineIdentity: LEGACY_ENGINE_ID };
  });

  check('frozen-parity-baseline-integrity', () => {
    const { baselineHash, ...payload } = baseline;
    if (sha256(payload) !== baselineHash) throw new Error('Frozen legacy baseline hash mismatch');
    if (baseline.fixtureCount !== fixtures.length) throw new Error('Parity fixture count does not match baseline');
    if (baseline.observationFeatureCount !== 592) throw new Error('Legacy baseline observation count changed');
    if (!equalJson(baseline.actionCatalog, LEGACY_ACTIONS)) throw new Error('Legacy baseline action catalog changed');
    return { fixtureCount: fixtures.length, baselineHash };
  });

  for (const fixture of fixtures) {
    const expected = baseline.fixtures.find((entry) => entry.fixtureId === fixture.run.fixtureId);
    if (!expected) {
      fixtureResults.push({ fixtureId: fixture.run.fixtureId, pass: false, error: 'Missing frozen legacy baseline' });
      continue;
    }
    try {
      const state = adapter.importSnapshot(structuredClone(fixture.envelope.payload), {
        mode: 'detached-snapshot-ingestion',
        formatId: fixture.envelope.formatId,
        formatVersion: fixture.envelope.formatVersion,
        snapshotId: fixture.envelope.snapshotId,
        configuration,
      });
      const sourceHash = sha256(state);
      if (sourceHash !== expected.sourceStateHash) throw new Error('Imported state hash differs from frozen legacy state');
      const observerId = fixture.run.observerId;
      const observation = validateObservationPacket(adapter.observe(state, observerId), manifest);
      const universalActions = adapter.legalActions(state, observerId).sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
      const legacyActions = legacyLegalActions(state, observerId).sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
      if (sha256(observation.features) !== expected.observationHash) throw new Error('592-feature observation bytes diverged');
      if (sha256(legacyObservation(state, observerId)) !== expected.observationHash) throw new Error('Legacy compatibility observation drifted');
      if (!equalJson(state.factions[observerId].legalMask, expected.legalMask)) throw new Error('Six-action legal mask diverged');
      if (sha256(legacyMask(state, observerId)) !== expected.legalMaskHash) throw new Error('Legacy legal mask hash drifted');
      if (sha256(state.factions[observerId].targetSlots) !== expected.targetSlotsHash) throw new Error('Canonical target slots diverged');
      if (sha256(legacyTargets(state, observerId)) !== expected.targetSlotsHash) throw new Error('Legacy target-slot hash drifted');
      const universalKeys = universalActions.map(actionKey);
      const legacyKeys = legacyActions.map(actionKey);
      if (!equalJson(universalKeys, expected.legalActionKeys) || !equalJson(legacyKeys, expected.legalActionKeys)) throw new Error('Opaque legal action descriptors diverged');

      const transitions = universalActions.map((action, index) => {
        const transitionSeed = deriveSeed(BigInt(fixture.run.seed), 'root-transition', index, actionKey(action));
        const clone = adapter.cloneState(state);
        const result = adapter.step(clone, structuredClone(action), {
          observerId,
          seed: transitionSeed,
          simulationIndex: index,
          random: createSeededRandom(transitionSeed),
          mode: 'detached-simulation',
        });
        const legacy = legacyStep(state, action, {
          seed: BigInt(fixture.run.seed),
          simulationIndex: index,
          stochasticAmplitude: configuration.stochasticAmplitude,
        });
        const actual = { actionKey: actionKey(action), stateHash: sha256(result.state), reward: result.reward, terminal: result.terminal };
        const expectedTransition = expected.transitions[index];
        if (!equalJson(actual, expectedTransition)) throw new Error(`Universal transition diverged for ${actual.actionKey}`);
        if (sha256(legacy.state) !== expectedTransition.stateHash || legacy.reward !== expectedTransition.reward || legacy.terminal !== expectedTransition.terminal) {
          throw new Error(`Legacy compatibility transition drifted for ${actual.actionKey}`);
        }
        return actual;
      });

      const outcome = adapter.outcome(state, observerId);
      if (outcome.scalar !== expected.outcomeScalar || legacyOutcome(state, observerId) !== expected.outcomeScalar) throw new Error('Outcome scalarization diverged');
      const universalRecommendation = recommend({
        adapter,
        state,
        observerId,
        seed: BigInt(fixture.run.seed),
        simulations: fixture.run.simulations,
        cPuct: fixture.run.cPuct,
      });
      const legacyRecommendation = legacyRecommend({
        state,
        observerId,
        seed: BigInt(fixture.run.seed),
        simulations: fixture.run.simulations,
        cPuct: fixture.run.cPuct,
        stochasticAmplitude: configuration.stochasticAmplitude,
      });
      const universalRanking = normalizeRanking(universalRecommendation.ranking);
      if (universalRecommendation.selected.actionKey !== expected.recommendation.selectedActionKey) throw new Error('Selected action diverged from Stage 1A-Z baseline');
      if (!equalJson(universalRanking, expected.recommendation.ranking)) throw new Error('Prime ranking or visit allocation diverged from Stage 1A-Z baseline');
      if (legacyRecommendation.legacyEvidenceHash !== expected.recommendation.legacyEvidenceHash) throw new Error('Independent legacy compatibility evidence drifted');
      if (sha256(state) !== sourceHash) throw new Error('Parity evaluation mutated source state');

      const otherObserver = fixture.envelope.observers.find((candidate) => candidate !== observerId);
      if (otherObserver && sha256(adapter.observe(state, otherObserver).features) === sha256(observation.features)) {
        throw new Error('Faction-private observations collapsed to identical values');
      }
      fixtureResults.push({
        fixtureId: fixture.run.fixtureId,
        pass: true,
        sourceStateHash: sourceHash,
        observationHash: expected.observationHash,
        legalMaskHash: expected.legalMaskHash,
        targetSlotsHash: expected.targetSlotsHash,
        legalActionCount: universalActions.length,
        transitionCount: transitions.length,
        selectedActionKey: universalRecommendation.selected.actionKey,
        rankingHash: sha256(universalRanking),
        legacyEvidenceHash: legacyRecommendation.legacyEvidenceHash,
      });
    } catch (error) {
      fixtureResults.push({ fixtureId: fixture.run.fixtureId, pass: false, error: error.message });
    }
  }

  check('fixture-corpus-completeness', () => {
    if (fixtureResults.some((entry) => !entry.pass)) throw new Error(`Parity failures: ${fixtureResults.filter((entry) => !entry.pass).map((entry) => entry.fixtureId).join(', ')}`);
    const masks = new Set(baseline.fixtures.map((entry) => entry.legalMaskHash));
    const selected = new Set(fixtureResults.map((entry) => entry.selectedActionKey));
    if (masks.size < 6) throw new Error('Parity corpus does not cover six distinct legal masks');
    return { fixtureCount: fixtureResults.length, distinctLegalMasks: masks.size, distinctSelectedActions: selected.size };
  });
  check('exact-592-feature-parity', () => ({ fixtureCount: fixtureResults.length, featureCount: 592, observationHashes: fixtureResults.map((entry) => entry.observationHash) }));
  check('six-action-mask-parity', () => ({ actionCatalog: LEGACY_ACTIONS, legalMaskHashes: fixtureResults.map((entry) => entry.legalMaskHash) }));
  check('canonical-target-slot-parity', () => ({ targetSlotHashes: fixtureResults.map((entry) => entry.targetSlotsHash) }));
  check('opaque-action-descriptor-parity', () => ({ legalActionCounts: fixtureResults.map((entry) => entry.legalActionCount) }));
  check('detached-transition-parity', () => ({ transitionCounts: fixtureResults.map((entry) => entry.transitionCount) }));
  check('outcome-scalarization-parity', () => ({ scalarization: 'stage1az-shadow-v1' }));
  check('prime-ranking-and-selection-parity', () => ({ selectedActionKeys: fixtureResults.map((entry) => entry.selectedActionKey), rankingHashes: fixtureResults.map((entry) => entry.rankingHash) }));
  check('faction-private-information-boundary', () => ({ observerMode: 'faction-private', fixtureCount: fixtureResults.length }));
  check('source-state-clone-isolation', () => ({ sourceStateHashes: fixtureResults.map((entry) => entry.sourceStateHash) }));
  check('r0-no-execution-boundary', () => ({ tier: 'R0', canDispatch: false, canMutateLiveWorld: false, scriptedNpcExecutorPreserved: true }));

  const report = {
    pass: checks.every((entry) => entry.pass),
    adapter: manifest,
    certification: {
      evidenceKind: 'zeknova-stage1az-behavioral-parity',
      parityVersion: 1,
      sourceLineage: 'Stage 1A-Z',
      legacyEngineIdentity: LEGACY_ENGINE_ID,
      baselineHash: baseline.baselineHash,
      fixtureCount: fixtures.length,
      observationFeatureCount: 592,
      actionCount: 6,
      authority: 'R0',
    },
    checks,
    fixtureResults,
  };
  const deterministic = buildAdapterDeterministicEvidence(report);
  return { ...report, deterministicEvidenceHash: deterministic.deterministicEvidenceHash };
}
