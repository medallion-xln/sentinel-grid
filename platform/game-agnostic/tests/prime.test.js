import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { referenceRescueAdapter } from '../src/adapters/reference-rescue/index.js';
import { recommend } from '../src/prime/root-puct.js';
import { actionKey } from '../src/core/contracts.js';
import { sha256 } from '../src/core/determinism.js';


test('Prime recommendation is deterministic and R0', () => {
  const state = referenceGameAdapter.initialState(42n);
  const a = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 64, seed: 99n });
  const b = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 64, seed: 99n });
  assert.equal(a.recommendationHash, b.recommendationHash);
  assert.equal(a.authority.tier, 'R0');
  assert.equal(a.authority.canDispatch, false);
  assert.equal(a.authority.canMutateLiveWorld, false);
});

test('Prime ranks only legal actions and accounts for every visit', () => {
  const state = referenceGameAdapter.initialState(42n);
  const legalKeys = new Set(referenceGameAdapter.legalActions(state, 'player-1').map(actionKey));
  const recommendation = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 71, seed: 5n });
  assert.equal(recommendation.ranking.every((entry) => legalKeys.has(entry.actionKey)), true);
  assert.equal(recommendation.ranking.reduce((sum, entry) => sum + entry.visits, 0), 71);
});

test('Prime uses uniform priors', () => {
  const state = referenceGameAdapter.initialState(42n);
  const recommendation = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 16, seed: 5n });
  const expected = 1 / recommendation.ranking.length;
  for (const entry of recommendation.ranking) assert.equal(entry.prior, expected);
  assert.equal(recommendation.search.priors, 'uniform');
});

test('Prime does not mutate source state', () => {
  const state = referenceRescueAdapter.initialState(8n);
  const before = sha256(state);
  recommend({ adapter: referenceRescueAdapter, state, observerId: 'controller', simulations: 64, seed: 5n });
  assert.equal(sha256(state), before);
});

test('Prime rejects terminal states', () => {
  const state = referenceGameAdapter.initialState(1n);
  state.scores['player-1'] = state.target;
  assert.throws(() => recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1' }), /terminal/);
});

test('Prime validates search parameters', () => {
  const state = referenceGameAdapter.initialState(1n);
  assert.throws(() => recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 0 }), /simulations/);
  assert.throws(() => recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', cPuct: 0 }), /cPuct/);
});

test('recommendation packet includes replay-critical hashes', () => {
  const state = referenceGameAdapter.initialState(4n);
  const recommendation = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 32, seed: 4n });
  assert.match(recommendation.input.stateHash, /^[a-f0-9]{64}$/);
  assert.match(recommendation.input.observationHash, /^[a-f0-9]{64}$/);
  assert.match(recommendation.input.legalActionsHash, /^[a-f0-9]{64}$/);
  assert.match(recommendation.recommendationHash, /^[a-f0-9]{64}$/);
});
