import { CONTRACT_VERSION } from '../../core/constants.js';
import { createSeededRandom } from '../../core/determinism.js';
import { actionKey } from '../../core/contracts.js';
import { defineAdapter } from '../../sdk/define-adapter.js';

const GAME_ID = 'reference-token-race';
const SCHEMA_ID = 'reference-token-race/observation';

function opponentOf(observerId) {
  if (observerId === 'player-1') return 'player-2';
  if (observerId === 'player-2') return 'player-1';
  throw new Error(`Unknown observer: ${observerId}`);
}

function isTerminalState(state) {
  return state.scores['player-1'] >= state.target || state.scores['player-2'] >= state.target;
}

function legalActionsFor(state, observerId) {
  opponentOf(observerId);
  if (isTerminalState(state) || state.activePlayer !== observerId) return [];
  const actions = [
    {
      actionId: 'reference.token-race/take@1',
      actorId: observerId,
      target: null,
      parameters: { amount: 1 },
      metadata: { category: 'progress' },
    },
    {
      actionId: 'reference.token-race/take@2',
      actorId: observerId,
      target: null,
      parameters: { amount: 2 },
      metadata: { category: 'progress' },
    },
  ];
  if (state.bonusAvailable) {
    actions.push({
      actionId: 'reference.token-race/take@bonus',
      actorId: observerId,
      target: { kind: 'shared-bonus', id: 'bonus-1' },
      parameters: { amount: 3 },
      metadata: { category: 'limited-resource' },
    });
  }
  return actions;
}

export const referenceGameAdapter = defineAdapter({
  manifest() {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      adapterId: 'reference-token-race-adapter',
      adapterVersion: '1.0.0',
      deterministic: true,
      observationSchemas: [
        { schemaId: SCHEMA_ID, schemaVersion: 1, variableSize: true },
      ],
      capabilities: {
        imperfectInformation: false,
        stochasticTransitions: false,
        simultaneousActions: false,
        variableObservationSize: true,
      },
      authority: { tier: 'R0', executionInterface: false },
      metadata: { purpose: 'universal-kernel conformance reference game' },
    };
  },

  initialState(seed = 1n) {
    const random = createSeededRandom(seed);
    return {
      turn: 0,
      activePlayer: 'player-1',
      scores: { 'player-1': 0, 'player-2': 0 },
      target: 10,
      bonusAvailable: random() >= 0.5,
    };
  },

  cloneState(state) {
    return structuredClone(state);
  },

  observe(state, observerId) {
    const opponentId = opponentOf(observerId);
    const features = [
      state.scores[observerId],
      state.scores[opponentId],
      state.turn,
      state.activePlayer === observerId ? 1 : 0,
      state.target,
    ];
    if (state.bonusAvailable) features.push(1, 3);
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      schemaId: SCHEMA_ID,
      schemaVersion: 1,
      observerId,
      sequence: state.turn,
      features,
      featureShape: [features.length],
      metadata: {
        informationModel: 'perfect-information',
        featureLayout: state.bonusAvailable ? 'base+bonus' : 'base',
      },
    };
  },

  legalActions(state, observerId) {
    return legalActionsFor(state, observerId);
  },

  step(state, action, { observerId }) {
    if (state.activePlayer !== observerId) throw new Error('Observer is not the active player');
    const legal = legalActionsFor(state, observerId);
    const legalKeys = new Set(legal.map(actionKey));
    if (!legalKeys.has(actionKey(action))) throw new Error('Illegal action');

    state.scores[observerId] += action.parameters.amount;
    state.turn += 1;
    if (action.actionId === 'reference.token-race/take@bonus') state.bonusAvailable = false;
    state.activePlayer = opponentOf(observerId);

    const terminal = isTerminalState(state);
    return {
      state,
      reward: action.parameters.amount / state.target,
      terminal,
      events: [
        { type: 'tokens-taken', actorId: observerId, amount: action.parameters.amount },
      ],
      info: { appliedActionKey: actionKey(action) },
    };
  },

  isTerminal(state) {
    return isTerminalState(state);
  },

  outcome(state, observerId) {
    const opponentId = opponentOf(observerId);
    const difference = state.scores[observerId] - state.scores[opponentId];
    const terminal = isTerminalState(state);
    let scalar = Math.max(-1, Math.min(1, difference / state.target));
    if (terminal) scalar = difference > 0 ? 1 : difference < 0 ? -1 : 0;
    return {
      scalar,
      terminal,
      vector: {
        ownScore: state.scores[observerId],
        opponentScore: state.scores[opponentId],
        scoreDifference: difference,
      },
      metadata: { objective: 'reach target tokens first' },
    };
  },
});
