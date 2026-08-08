import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalize,
  createSeededRandom,
  deriveSeed,
  randomInt,
  sha256,
  stableStringify,
} from '../src/core/determinism.js';


test('stableStringify sorts object keys recursively', () => {
  assert.equal(stableStringify({ b: 2, a: { d: 4, c: 3 } }), stableStringify({ a: { c: 3, d: 4 }, b: 2 }));
});

test('canonical hashing supports bigint and typed arrays', () => {
  const value = { seed: 9n, bytes: new Uint8Array([3, 1, 2]) };
  assert.match(sha256(value), /^[a-f0-9]{64}$/);
  assert.equal(sha256(value), sha256({ bytes: new Uint8Array([3, 1, 2]), seed: 9n }));
});

test('canonicalization rejects cycles', () => {
  const value = {};
  value.self = value;
  assert.throws(() => canonicalize(value), /cyclic/i);
});

test('seeded random sequence is repeatable', () => {
  const a = createSeededRandom(42n);
  const b = createSeededRandom(42n);
  assert.deepEqual([a(), a(), a(), a()], [b(), b(), b(), b()]);
});

test('different seeds produce different sequences', () => {
  const a = createSeededRandom(1n);
  const b = createSeededRandom(2n);
  assert.notDeepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('deriveSeed is stable and context-sensitive', () => {
  assert.equal(deriveSeed(1n, 'a', 2), deriveSeed(1n, 'a', 2));
  assert.notEqual(deriveSeed(1n, 'a', 2), deriveSeed(1n, 'a', 3));
});

test('randomInt respects range', () => {
  const random = createSeededRandom(10n);
  for (let i = 0; i < 100; i += 1) {
    const value = randomInt(random, 3, 8);
    assert.ok(value >= 3 && value < 8);
  }
});
