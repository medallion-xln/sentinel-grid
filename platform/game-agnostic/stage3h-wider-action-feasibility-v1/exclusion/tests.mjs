// Fail-closed synthetic collision and tamper tests for the structured exclusion index. node --test exclusion/tests.mjs
// Tamper tests run on a temporary copy of the structured records; the repository records are never modified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { loadStrictIndex, preflightNamespace, preflightWorlds } from './strict-index.mjs';
import { loadExclusionIndex, validateSeedRange, EXCLUSION_FILES, BLOCK } from '../../stage3h-safety-feasibility-v1/closure/exclusions.mjs';

const GA = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const strict = loadStrictIndex();
const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
function tamperedCopy(mutate) {
  const tmp = mkdtempSync(resolve(tmpdir(), 'sg-excl-'));
  for (const p of Object.values(EXCLUSION_FILES)) { mkdirSync(dirname(resolve(tmp, p)), { recursive: true }); cpSync(resolve(GA, p), resolve(tmp, p), { recursive: true }); }
  mutate(tmp); return tmp;
}
const throwsOn = (mutate, code) => { const tmp = tamperedCopy(mutate); try { assert.throws(() => loadStrictIndex(tmp), new RegExp(code)); } finally { rmSync(tmp, { recursive: true, force: true }); } };

test('strict index loads the exact structured records with the recorded counts', () => {
  const c = strict.counts;
  assert.equal(c.diagnosticConstructedWorlds, 48910); assert.equal(c.devBaseWorlds, 25676); assert.equal(c.devOpenSeeds, 6);
  assert.equal(c.priorWorlds, 9407); assert.equal(c.v4SealedWorlds, 25377);
  for (const b of [731, 732, 733, 734, 951, 952]) assert.ok(c.excludedBlocks.includes(b), 'block ' + b);
});
test('namespace preflight fails closed on every spent block, boundary and recorded seed', () => {
  for (const [base, count] of [[951 * BLOCK, 1], [952 * BLOCK + BLOCK - 1, 1], [950 * BLOCK + BLOCK - 10, 20], [731 * BLOCK, 12768], [734 * BLOCK + 5, 12768]]) assert.equal(preflightNamespace(strict, { base, count }).ok, false, `${base}+${count}`);
  for (const s of J(EXCLUSION_FILES.devIdentities).devOpenSeeds) assert.equal(preflightNamespace(strict, { base: s, count: 1 }).ok, false);
  for (const s of J(EXCLUSION_FILES.prior).priorSeeds.slice(0, 5)) assert.equal(preflightNamespace(strict, { base: s, count: 1 }).ok, false);
  assert.equal(preflightNamespace(strict, { base: 950 * BLOCK, count: 0 }).ok, false); assert.equal(preflightNamespace(strict, { base: 12.5, count: 3 }).ok, false);
  assert.equal(preflightNamespace(strict, { base: 100 * BLOCK, count: 12768 }).ok, true, 'synthetic unrecorded block: test value only, not an allocation');
});
test('a range whose spent blocks lie strictly inside it is rejected (the closure validator checks only endpoint blocks)', () => {
  const r = { base: 950 * BLOCK, count: 3 * BLOCK + 1 }; // blocks 950..953: 951 and 952 are interior
  assert.equal(preflightNamespace(strict, r).ok, false);
  assert.equal(validateSeedRange(loadExclusionIndex(), r.base, r.count).ok, true, 'documents the endpoint-only limitation of closure/exclusions.mjs');
});
test('world preflight fails closed on every recorded identity source and on non-canonical hashes', () => {
  const ledger = J(EXCLUSION_FILES.diagnostic), dev = J(EXCLUSION_FILES.devIdentities), prior = J(EXCLUSION_FILES.prior);
  const devHash = dev.sets.FRESH_CHECK.worldByIdx.find((x) => !x.startsWith('REJECTED:'));
  for (const h of [ledger.constructedWorldHashes[0], ledger.constructedWorldHashes.at(-1), devHash, prior.priorWorldHashes[0]]) assert.equal(preflightWorlds(strict, [h]).ok, false);
  for (const bad of [devHash.toUpperCase(), devHash.slice(1), 'not-a-hash', null]) assert.equal(preflightWorlds(strict, [bad]).ok, false);
  assert.equal(preflightWorlds(strict, ['0'.repeat(64)]).ok, true);
});
test('tampered or missing records make the loader throw (fail closed)', () => {
  const edit = (p, f) => (tmp) => { const x = JSON.parse(readFileSync(resolve(tmp, p), 'utf8')); f(x); writeFileSync(resolve(tmp, p), JSON.stringify(x, null, 1) + '\n'); };
  throwsOn(edit(EXCLUSION_FILES.diagnostic, (x) => { x.constructedWorldHashes[7] = x.constructedWorldHashes[7].replace(/^./, (c) => (c === 'a' ? 'b' : 'a')); }), 'LEDGER_DIGEST');
  throwsOn(edit(EXCLUSION_FILES.diagnostic, (x) => { x.constructedWorldHashes.push(x.constructedWorldHashes[0]); }), 'DUPLICATE_HASH:ledger');
  throwsOn(edit(EXCLUSION_FILES.diagnostic, (x) => { x.constructedWorldHashes[3] = x.constructedWorldHashes[3].toUpperCase(); }), 'NON_CANONICAL_HASH:ledger');
  throwsOn((tmp) => writeFileSync(resolve(tmp, EXCLUSION_FILES.devIdentities), readFileSync(resolve(tmp, EXCLUSION_FILES.devIdentities), 'utf8') + ' '), 'LEDGER_DEV_REFERENCE');
  throwsOn((tmp) => unlinkSync(resolve(tmp, EXCLUSION_FILES.devIdentities)), 'MISSING_FILE');
  throwsOn(edit(EXCLUSION_FILES.devIdentities, (x) => { x.devOpenSeeds.pop(); }), 'DEV_OPEN_SEEDS');
  throwsOn(edit(EXCLUSION_FILES.prior, (x) => { x.priorWorldHashes[0] = 'zz'; }), 'NON_CANONICAL_HASH:prior');
  throwsOn(edit(EXCLUSION_FILES.v4Allocation, (x) => { x.namespaces.A = 735 * BLOCK; }), 'V4_SEED_OUTSIDE_ALLOCATION');
});
