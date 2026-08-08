import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { referenceRescueAdapter } from '../src/adapters/reference-rescue/index.js';
import { deriveSeed, createSeededRandom, sha256 } from '../src/core/determinism.js';


test('token-race observation is variable-size across game states', () => {
  const state = referenceGameAdapter.initialState(1n);
  state.bonusAvailable = true;
  const withBonus = referenceGameAdapter.observe(state, 'player-1');
  state.bonusAvailable = false;
  const withoutBonus = referenceGameAdapter.observe(state, 'player-1');
  assert.notEqual(withBonus.features.length, withoutBonus.features.length);
});

test('rescue adapter uses structured game-defined targets', () => {
  const state = referenceRescueAdapter.initialState(1n);
  const assist = referenceRescueAdapter.legalActions(state, 'controller').find((entry) => entry.actionId.endsWith('/assist'));
  assert.deepEqual(assist.target, { kind: 'site', id: 'north' });
});

test('rescue stochastic scan is deterministic under supplied seed', () => {
  const stateA = referenceRescueAdapter.initialState(3n);
  const stateB = referenceRescueAdapter.initialState(3n);
  const action = referenceRescueAdapter.legalActions(stateA, 'controller').find((entry) => entry.actionId.endsWith('/scan'));
  const seed = deriveSeed(9n, 'scan');
  const resultA = referenceRescueAdapter.step(referenceRescueAdapter.cloneState(stateA), structuredClone(action), {
    observerId: 'controller', seed, simulationIndex: 0, random: createSeededRandom(seed), mode: 'detached-simulation',
  });
  const resultB = referenceRescueAdapter.step(referenceRescueAdapter.cloneState(stateB), structuredClone(action), {
    observerId: 'controller', seed, simulationIndex: 0, random: createSeededRandom(seed), mode: 'detached-simulation',
  });
  assert.equal(sha256(resultA), sha256(resultB));
});

test('adapters reject illegal actions', () => {
  const state = referenceGameAdapter.initialState(2n);
  assert.throws(() => referenceGameAdapter.step(referenceGameAdapter.cloneState(state), {
    actionId: 'not-legal', actorId: 'player-1', target: null, parameters: {},
  }, { observerId: 'player-1' }), /Illegal action/);
});
