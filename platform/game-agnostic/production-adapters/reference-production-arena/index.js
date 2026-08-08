import { defineAdapter } from '../../src/sdk/define-adapter.js';
import { createSeededRandom, deriveSeed } from '../../src/core/determinism.js';

const OBSERVERS = Object.freeze(['alpha-0', 'alpha-1', 'beta-0', 'beta-1']);

function teamOf(observerId) {
  if (!OBSERVERS.includes(observerId)) throw new Error(`Unknown observer: ${observerId}`);
  return observerId.startsWith('alpha') ? 'alpha' : 'beta';
}

function makeInitialState(seed, configuration) {
  const random = createSeededRandom(deriveSeed(seed, 'production-arena-initial'));
  return {
    tick: 0,
    maxTicks: configuration.maxTicks,
    boardSize: configuration.boardSize,
    score: { alpha: 0, beta: 0 },
    privateSignals: Object.fromEntries(OBSERVERS.map((id, index) => [id, Math.floor(random() * 100000) + index])),
    hazards: Array.from({ length: configuration.boardSize }, () => Math.floor(random() * 1000)),
  };
}

function validateImportedState(payload, configuration) {
  if (payload.maxTicks !== configuration.maxTicks) throw new Error('Snapshot maxTicks must match locked configuration');
  if (payload.boardSize !== configuration.boardSize) throw new Error('Snapshot boardSize must match locked configuration');
  if (payload.hazards.length !== configuration.boardSize) throw new Error('Snapshot hazards length must equal boardSize');
  if (!OBSERVERS.every((id) => Number.isInteger(payload.privateSignals[id]))) throw new Error('Snapshot private signals are incomplete');
  return structuredClone(payload);
}

export function createAdapter(configuration) {
  return defineAdapter({
    manifest() {
      return {
        contractVersion: 1,
        gameId: 'reference-production-arena',
        adapterId: 'reference-production-arena-adapter',
        adapterVersion: '1.0.0',
        deterministic: true,
        observationSchemas: [{ schemaId: 'reference-production-arena/observation', schemaVersion: 1, variableSize: true }],
        capabilities: {
          imperfectInformation: true,
          stochasticTransitions: true,
          simultaneousActions: true,
          variableObservationSize: true,
        },
        authority: { tier: 'R0', executionInterface: false },
        metadata: {
          purpose: 'production-scale conformance expansion fixture',
          packageMode: 'external-production-adapter',
          snapshotIngestion: true,
          observationSize: configuration.observationSize,
          legalActionCount: configuration.legalActionCount,
          actorCount: OBSERVERS.length,
        },
      };
    },
    initialState(seed) { return makeInitialState(seed, configuration); },
    cloneState(state) { return structuredClone(state); },
    observe(state, observerId) {
      const team = teamOf(observerId);
      const privateSignal = state.privateSignals[observerId];
      const opponent = team === 'alpha' ? 'beta' : 'alpha';
      const features = Array.from({ length: configuration.observationSize }, (_, index) => {
        const hazard = state.hazards[index % state.hazards.length];
        const wave = ((index * 31 + privateSignal + state.tick * 17) % 1009) / 1009;
        const scoreDelta = (state.score[team] - state.score[opponent]) / 1000;
        return wave + hazard / 10000 + scoreDelta;
      });
      return {
        contractVersion: 1,
        gameId: 'reference-production-arena',
        schemaId: 'reference-production-arena/observation',
        schemaVersion: 1,
        observerId,
        sequence: state.tick,
        features,
        featureShape: [configuration.observationSize],
        metadata: { team, privateSignalBucket: privateSignal % 97, simultaneousDecisionSurface: true },
      };
    },
    legalActions(state, observerId) {
      if (state.tick >= state.maxTicks) return [];
      const team = teamOf(observerId);
      const allies = OBSERVERS.filter((id) => id.startsWith(team));
      return Array.from({ length: configuration.legalActionCount }, (_, index) => ({
        actionId: `reference.production-arena/joint-plan@${index}`,
        actorId: `joint:${team}`,
        target: { kind: 'sector', id: `sector-${index % configuration.boardSize}` },
        parameters: {
          jointActions: allies.map((actorId, slot) => ({ actorId, maneuver: (index + slot) % 8 })),
          magnitude: (index % 11) + 1,
          phase: state.tick % 4,
        },
        metadata: { simultaneous: true, participantCount: allies.length },
      }));
    },
    step(state, action, context) {
      const next = structuredClone(state);
      const team = String(action.actorId).endsWith('alpha') ? 'alpha' : 'beta';
      const opponent = team === 'alpha' ? 'beta' : 'alpha';
      const stochastic = context.random();
      const magnitude = Number(action.parameters.magnitude);
      const hazardIndex = Number(String(action.target.id).split('-').at(-1)) % next.hazards.length;
      const hazardPenalty = next.hazards[hazardIndex] / 1000;
      const gain = magnitude / 10 + stochastic - hazardPenalty;
      next.score[team] += gain;
      next.score[opponent] += (1 - stochastic) * 0.05;
      next.tick += 1;
      next.hazards[hazardIndex] = (next.hazards[hazardIndex] + Math.floor(stochastic * 97) + 1) % 1001;
      return {
        state: next,
        reward: gain,
        terminal: next.tick >= next.maxTicks,
        events: [{ type: 'joint-plan-evaluated', team, hazardIndex }],
        info: { mode: context.mode, simultaneous: true },
      };
    },
    isTerminal(state) { return state.tick >= state.maxTicks; },
    outcome(state, observerId) {
      const team = teamOf(observerId);
      const opponent = team === 'alpha' ? 'beta' : 'alpha';
      return {
        scalar: state.score[team] - state.score[opponent],
        terminal: state.tick >= state.maxTicks,
        vector: { ownScore: state.score[team], opponentScore: state.score[opponent], tick: state.tick },
        metadata: { team },
      };
    },
    importSnapshot(payload, context) {
      if (context.mode !== 'detached-snapshot-ingestion') throw new Error('Invalid snapshot ingestion mode');
      if (context.formatId !== 'reference-production-arena/state-json' || context.formatVersion !== 1) throw new Error('Unsupported snapshot format');
      return validateImportedState(payload, configuration);
    },
  });
}
