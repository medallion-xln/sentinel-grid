import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAdapter } from '../src/sdk/define-adapter.js';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';


test('defineAdapter freezes the public adapter surface', () => {
  assert.equal(Object.isFrozen(referenceGameAdapter), true);
});

test('defineAdapter rejects incomplete adapters', () => {
  assert.throws(() => defineAdapter({ manifest() { return {}; } }), /required/);
});
