import test from 'node:test';
import assert from 'node:assert/strict';
import { runAdapterConformance } from '../src/lab/conformance.js';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { referenceRescueAdapter } from '../src/adapters/reference-rescue/index.js';


test('token-race adapter passes universal conformance', () => {
  const report = runAdapterConformance(referenceGameAdapter, { observerId: 'player-1' });
  assert.equal(report.pass, true);
  assert.equal(report.checks.every((check) => check.pass), true);
  assert.ok(report.checks.length >= 15);
});

test('grid-rescue adapter passes the same universal conformance', () => {
  const report = runAdapterConformance(referenceRescueAdapter, { observerId: 'controller' });
  assert.equal(report.pass, true);
  assert.equal(report.checks.every((check) => check.pass), true);
});

test('conformance reports prohibited execution surface instead of granting authority', () => {
  const unsafe = { ...referenceGameAdapter, executeLiveAction() {} };
  const report = runAdapterConformance(unsafe, { observerId: 'player-1' });
  assert.equal(report.pass, false);
  assert.equal(report.checks[0].name, 'adapter-contract');
});
