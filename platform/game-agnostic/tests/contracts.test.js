import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionKey,
  validateActionDescriptor,
  validateAdapter,
  validateLegalActions,
  validateObservationPacket,
  validateOutcomePacket,
  validateTransitionResult,
} from '../src/core/contracts.js';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';

function observation(features = [1, 2, 3]) {
  return {
    contractVersion: 1,
    gameId: 'game',
    schemaId: 'schema',
    schemaVersion: 1,
    observerId: 'observer',
    sequence: 0,
    features,
    featureShape: [features.length],
    metadata: {},
  };
}

function action(overrides = {}) {
  return {
    actionId: 'opaque::anything',
    actorId: 'actor',
    target: { gameDefined: ['x', 1] },
    parameters: { amount: 1 },
    ...overrides,
  };
}

test('observation dimension is adapter-defined', () => {
  assert.equal(validateObservationPacket(observation([1, 2, 3, 4, 5, 6, 7])).features.length, 7);
});

test('zero-length observation vector is valid when shape agrees', () => {
  assert.equal(validateObservationPacket(observation([])).features.length, 0);
});

test('non-finite observation features are rejected', () => {
  assert.throws(() => validateObservationPacket(observation([Infinity])));
});

test('feature shape must match variable feature count', () => {
  const packet = observation([1, 2]);
  packet.featureShape = [3];
  assert.throws(() => validateObservationPacket(packet), /featureShape/);
});

test('opaque action identifiers and game-defined targets are accepted', () => {
  const validated = validateActionDescriptor(action());
  assert.equal(validated.actionId, 'opaque::anything');
});

test('action key is independent of object key order', () => {
  const a = action({ parameters: { b: 2, a: 1 } });
  const b = action({ parameters: { a: 1, b: 2 } });
  assert.equal(actionKey(a), actionKey(b));
});

test('duplicate legal action descriptors are rejected', () => {
  assert.throws(() => validateLegalActions([action(), action()]), /duplicate/i);
});

test('non-terminal states require at least one legal action', () => {
  assert.throws(() => validateLegalActions([], { terminal: false }), /non-empty/);
});

test('terminal states require no legal actions', () => {
  assert.deepEqual(validateLegalActions([], { terminal: true }), []);
  assert.throws(() => validateLegalActions([action()], { terminal: true }), /empty/);
});

test('transition and outcome packets require finite values', () => {
  assert.throws(() => validateTransitionResult({ state: {}, reward: Infinity, terminal: false, events: [], info: {} }));
  assert.throws(() => validateOutcomePacket({ scalar: NaN, terminal: false, vector: {}, metadata: {} }));
});

test('reference adapter satisfies universal contract', () => {
  assert.equal(validateAdapter(referenceGameAdapter).manifest.gameId, 'reference-token-race');
});

test('adapter with execution surface is rejected', () => {
  const unsafe = { ...referenceGameAdapter, dispatchCommand() {} };
  assert.throws(() => validateAdapter(unsafe), /execution-surface/);
});
