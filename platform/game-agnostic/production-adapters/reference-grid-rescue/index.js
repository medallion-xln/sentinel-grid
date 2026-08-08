import { defineAdapter } from '../../src/sdk/define-adapter.js';
import { referenceRescueAdapter } from '../../src/adapters/reference-rescue/index.js';

function validateImportedState(payload, configuration) {
  if (payload.maxTurns !== configuration.maxTurns) {
    throw new Error(`Snapshot maxTurns must equal locked maxTurns ${configuration.maxTurns}`);
  }
  const ids = new Set(payload.sites.map((site) => site.id));
  if (ids.size !== payload.sites.length) throw new Error('Snapshot site IDs must be unique');
  return structuredClone(payload);
}

export function createAdapter(configuration) {
  return defineAdapter({
    manifest() {
      const manifest = referenceRescueAdapter.manifest();
      return {
        ...manifest,
        adapterVersion: '1.1.0',
        metadata: {
          ...manifest.metadata,
          packageMode: 'external-production-adapter',
          configuredMaxTurns: configuration.maxTurns,
          snapshotIngestion: true,
        },
      };
    },
    initialState(seed) {
      const state = referenceRescueAdapter.initialState(seed);
      state.energy = configuration.initialEnergy;
      state.maxTurns = configuration.maxTurns;
      return state;
    },
    cloneState: (state) => referenceRescueAdapter.cloneState(state),
    observe: (state, observerId) => referenceRescueAdapter.observe(state, observerId),
    legalActions: (state, observerId) => referenceRescueAdapter.legalActions(state, observerId),
    step: (state, action, context) => referenceRescueAdapter.step(state, action, context),
    isTerminal: (state) => referenceRescueAdapter.isTerminal(state),
    outcome: (state, observerId) => referenceRescueAdapter.outcome(state, observerId),
    importSnapshot(payload, context) {
      if (context.mode !== 'detached-snapshot-ingestion') throw new Error('Invalid snapshot ingestion mode');
      if (context.formatId !== 'reference-grid-rescue/state-json' || context.formatVersion !== 1) {
        throw new Error('Unsupported snapshot format');
      }
      return validateImportedState(payload, configuration);
    },
  });
}
