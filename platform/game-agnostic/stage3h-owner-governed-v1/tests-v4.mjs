// Tests for the successor candidate (amendment O-6, connector-v4, campaign-v4, namespace procedure). Run as plain
// `node tests-v4.mjs` (TAP). Development and spent worlds only; no registered world, no allocation, no activation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { runFixtures } from './menu-validity-fixtures.mjs';
import { loadV4, runReplicationV4, analyseLockedV4, PREFLIGHT as P4, V4_REGISTRATION } from './campaign-v4.mjs';
import { PREFLIGHT as P3 } from './campaign-v3.mjs';
import { validateNamespacePlan, blockFailures, allocate, ALLOCATION_FILE } from './allocate-namespaces-v4.mjs';
import { LANE, GA } from './inherit.mjs';

const fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
for (const f of runFixtures()) test('fixture ' + f.id, () => assert.ok(f.pass, JSON.stringify(f.detail)));

test('every source bound by predecessor 0364164c is byte-identical (nativeLock and its 1,000 ms limit included)', () => {
  const reg = JSON.parse(readFileSync(resolve(LANE, 'registration/ACTIVE_REGISTRATION_V3.json'), 'utf8'));
  const changed = Object.entries(reg.bindings.sources).filter(([p, h]) => fsha(p) !== h).map(([p]) => p);
  assert.deepEqual(changed, []);
  assert.ok(readFileSync(resolve(LANE, 'connector.mjs'), 'utf8').includes('ok(elapsedMs <= 1000 && baseline.modelHash === S0_HASH'));
});
test('O-5 preflight is the frozen V3 object with unchanged limits', () => {
  assert.equal(P4, P3);
  assert.deepEqual({ ...P4 }, { maxLoadFractionOfCores: 0.25, devLocks: 96, lockP99MaxMs: 250, lockMaxMs: 500 });
});
test('connector-v4 reaches policies only through nativeRowV3, after validating every policy-facing view', () => {
  const src = readFileSync(resolve(LANE, 'connector-v4.mjs'), 'utf8');
  assert.ok(!/adapters\.mjs|baseline\.mjs|invokeNexus|currentBaseline|nativeLock|evaluateCounterfactuals/.test(src));
  const body = src.slice(src.indexOf('export function nativeRowV4'));
  assert.ok(body.indexOf('validatePolicyFacingViews(') < body.indexOf('if (verdict.valid) return nativeRowV3(combo, ctx)'));
});
test('campaign-v4 refuses the predecessor registration and is dormant without a V4 registration', () => {
  assert.throws(() => loadV4(resolve(LANE, 'registration/ACTIVE_REGISTRATION_V3.json')), /REGISTRATION_NOT_FOR_CONNECTOR_V4/);
  assert.ok(!existsSync(V4_REGISTRATION));
  assert.throws(() => runReplicationV4('C'), /UNKNOWN_REPLICATION/);
  assert.throws(() => runReplicationV4('A'), /NO_ACTIVE_REGISTRATION/);
  assert.throws(() => analyseLockedV4(), /NO_ACTIVE_REGISTRATION/);
});
test('namespace procedure refuses excluded blocks, prior seeds, text hits and overlap (synthetic bases only)', () => {
  assert.ok(validateNamespacePlan({ A: 100000000000, B: 101000000000 }).ok);
  assert.deepEqual(blockFailures(731000000000), ['EXCLUDED_BLOCK_731']);
  assert.deepEqual(blockFailures(732000000000), ['EXCLUDED_BLOCK_732']);
  assert.ok(blockFailures(100000000000, { priorSeeds: [100000000005] }).includes('PRIOR_SEED_IN_RANGE'));
  assert.ok(blockFailures(100000000000, { textHits: [{ file: 'x', value: 100000012767 }] }).includes('REPOSITORY_TEXT_HIT'));
  assert.deepEqual(blockFailures(100000000000, { textHits: [{ file: 'x', value: 100000012768 }] }), []);
  assert.ok(validateNamespacePlan({ A: 100000000000, B: 100000000000 }).failures.includes('A_B_NOT_DISJOINT'));
  assert.deepEqual(blockFailures(12345), ['NOT_A_12_DIGIT_BLOCK_BASE']);
});
test('allocation refuses without owner approval of the successor and nothing is allocated', () => {
  const candPath = resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V4.json');
  if (existsSync(candPath)) assert.throws(() => allocate(JSON.parse(readFileSync(candPath, 'utf8')).registrationHash), /OWNER_APPROVAL_OF_SUCCESSOR_REQUIRED/);
  else assert.throws(() => allocate('0'.repeat(64)));
  assert.ok(!existsSync(resolve(LANE, ALLOCATION_FILE)));
});
