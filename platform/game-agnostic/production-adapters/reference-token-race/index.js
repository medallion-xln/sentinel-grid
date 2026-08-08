import { defineAdapter } from '../../src/sdk/define-adapter.js';
import { referenceGameAdapter } from '../../src/adapters/reference-game/index.js';

function validateImportedState(payload, configuration) {
  if (payload.target !== configuration.targetScore) {
    throw new Error(`Snapshot target must equal locked targetScore ${configuration.targetScore}`);
  }
  if (!['player-1', 'player-2'].includes(payload.activePlayer)) throw new Error('Invalid activePlayer');
  if (payload.scores['player-1'] >= payload.target && payload.scores['player-2'] >= payload.target) {
    throw new Error('Both players cannot have reached the target in one canonical snapshot');
  }
  return structuredClone(payload);
}

export function createAdapter(configuration) {
  return defineAdapter({
    manifest() {
      const manifest = referenceGameAdapter.manifest();
      return {
        ...manifest,
        adapterVersion: '1.1.0',
        metadata: {
          ...manifest.metadata,
          packageMode: 'external-production-adapter',
          purposeLabel: configuration.purposeLabel,
          snapshotIngestion: true,
        },
      };
    },
    initialState(seed) {
      const state = referenceGameAdapter.initialState(seed);
      state.target = configuration.targetScore;
      return state;
    },
    cloneState: (state) => referenceGameAdapter.cloneState(state),
    observe: (state, observerId) => referenceGameAdapter.observe(state, observerId),
    legalActions: (state, observerId) => referenceGameAdapter.legalActions(state, observerId),
    step: (state, action, context) => referenceGameAdapter.step(state, action, context),
    isTerminal: (state) => referenceGameAdapter.isTerminal(state),
    outcome: (state, observerId) => referenceGameAdapter.outcome(state, observerId),
    importSnapshot(payload, context) {
      if (context.mode !== 'detached-snapshot-ingestion') throw new Error('Invalid snapshot ingestion mode');
      if (context.formatId !== 'reference-token-race/state-json' || context.formatVersion !== 1) {
        throw new Error('Unsupported snapshot format');
      }
      return validateImportedState(payload, configuration);
    },
  });
}
