import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertEvaluationOnly,
  defaultAuthorityPolicy,
  denyExecution,
} from '../src/core/authority.js';


test('default authority is frozen R0 default denial', () => {
  const policy = defaultAuthorityPolicy();
  assert.equal(policy.tier, 'R0');
  assert.equal(policy.canDispatch, false);
  assert.equal(policy.canMutateLiveWorld, false);
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(assertEvaluationOnly(policy), true);
});

test('R0 policy cannot be weakened', () => {
  const unsafe = { ...defaultAuthorityPolicy(), canDispatch: true };
  assert.throws(() => assertEvaluationOnly(unsafe), /R0/);
});

test('execution request is denied', () => {
  assert.throws(() => denyExecution('dispatch'), /denied at R0/i);
});
