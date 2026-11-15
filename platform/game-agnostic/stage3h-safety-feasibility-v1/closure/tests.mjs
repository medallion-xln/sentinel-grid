// Closure tests: node --test closure/tests.mjs   (from the lane)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { evaluateCounterfactualsSymmetricV1 } from '../../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { nativeLock } from '../../stage3h-owner-governed-v1/connector.mjs';
import { loadRows, comboOf } from '../../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { classVerdict } from '../contract.mjs';
import { nativeWorld, hiddenSupport } from '../twins.mjs';
import { loadExclusionIndex, validateSeedRange, excludedWorld, BLOCK } from './exclusions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), ROOT = resolve(LANE, '../../..');
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const dossier = J('evidence/closure/WITNESS_DOSSIER.json'), ledger = J('evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json');

test('two-arm class verdict: swapped labels refute every deterministic, set-valued and randomized member', () => {
  const sel = { B: [0], N: [1] }, w1 = { truth: [100, -10, 50] }, w2 = { truth: [-5, 100, 50] }; // w1: N cat; w2: B cat
  const v = classVerdict(sel, [w1, w2]);
  assert.equal(v.deterministicS0Safe, false); assert.equal(v.deterministicNexusSafe, false);
  assert.equal(v.subsetsSafeEverywhere, 0); assert.equal(v.randomizedMinWorstCaseIntroductionProbability, 0.5); assert.equal(v.anyClassMemberSafe, false);
});
test('two-arm class verdict: one-sided class leaves a safe arm', () => {
  const v = classVerdict({ B: [0], N: [1] }, [{ truth: [100, -10] }, { truth: [100, 50] }]);
  assert.equal(v.deterministicS0Safe, true); assert.equal(v.randomizedMinWorstCaseIntroductionProbability, 0);
});
test('two-arm class verdict: a mixed-safety tie set leaves a safe subset (the invalid witness case)', () => {
  const v = classVerdict({ B: [0, 2], N: [1] }, [{ truth: [-90, -2, 100] }, { truth: [-50, 100, 100] }]);
  assert.equal(v.deterministicS0Safe, false); assert.equal(v.anyClassMemberSafe, true);
});
test('generator-support model accepts native configs and rejects out-of-range draws', () => {
  const row = loadRows('FRESH_CHECK').find((r) => r.idx === 9837), base = nativeWorld(comboOf(row));
  assert.equal(hiddenSupport(base.config).inSupport, true);
  const bad = structuredClone(base.config), node = bad.entities.find((e) => e.id === 'n1'); node.value = 99;
  assert.equal(hiddenSupport(bad).inSupport, false);
  const bad2 = structuredClone(base.config); bad2.entities.find((e) => e.id === 'n0').health = 60;
  assert.equal(hiddenSupport(bad2).inSupport, false);
});
test('primary witness reproduces natively: identical public view, identical frozen decisions, reversed labels', () => {
  const w = dossier.witnesses.find((x) => x.set === 'FRESH_CHECK' && x.idx === 9837), combo = comboOf(loadRows('FRESH_CHECK').find((r) => r.idx === 9837));
  const W1 = nativeWorld(combo, w.hiddenSpecs.w1), W2 = nativeWorld(combo, w.hiddenSpecs.w2);
  assert.equal(W1.worldHash, w.worldHashes.w1); assert.equal(W2.worldHash, w.worldHashes.w2); assert.notEqual(W1.worldHash, W2.worldHash);
  assert.equal(W1.content, W2.content);
  const f1 = nativeLock(W1.view, W1.band), f2 = nativeLock(W2.view, W2.band);
  assert.deepEqual(f1.selections, f2.selections);
  const reg = (W, ids) => { const t = evaluateCounterfactualsSymmetricV1(W.world, { horizon: W.horizon }); return ids.map((id) => t.branches.find((b) => b.actionKey === id).regret); };
  assert.deepEqual([reg(W1, f1.selections.B), reg(W1, f1.selections.N), reg(W2, f2.selections.B), reg(W2, f2.selections.N)], [[93], [105], [105], [79]]);
});
test('exclusion index rejects every spent block and seed and every recorded world, without text search', () => {
  const idx = loadExclusionIndex();
  for (const b of [951, 952]) for (const s of [0, 12767, 500_000_000, BLOCK - 1]) assert.equal(validateSeedRange(idx, b * BLOCK + s, 1).ok, false, `block ${b} seed ${s}`);
  for (const b of [731, 732, 733, 734]) assert.equal(validateSeedRange(idx, b * BLOCK, 12768).ok, false);
  assert.equal(validateSeedRange(idx, 202610090101, 1).ok, false);
  assert.equal(validateSeedRange(idx, 100 * BLOCK, 12768).ok, true, 'synthetic unrecorded block (test value only, not an allocation)');
  assert.equal(excludedWorld(idx, ledger.constructedWorldHashes[0]), 'SPENT_DIAGNOSTIC_CONSTRUCTED_WORLD');
  assert.equal(excludedWorld(idx, dossier.witnesses[0].worldHashes.w1 === dossier.witnesses[0].worldHashes.base ? dossier.witnesses[0].worldHashes.w2 : dossier.witnesses[0].worldHashes.w1), 'SPENT_DIAGNOSTIC_CONSTRUCTED_WORLD');
  assert.equal(excludedWorld(idx, dossier.witnesses[0].worldHashes.base), 'SPENT_DEV_BASE_WORLD');
  assert.equal(excludedWorld(idx, '0'.repeat(64)), null);
  const src = readFileSync(resolve(HERE, 'exclusions.mjs'), 'utf8');
  assert.ok(!/scanRepositoryText|matchAll\(\/\\b\\d\{12\}/.test(src), 'validator must not use repository text search');
});
test('every witness world (valid pairs) is in the ledger or the DEV base records', () => {
  const idx = loadExclusionIndex();
  for (const w of dossier.witnesses) for (const k of ['w1', 'w2']) assert.ok(excludedWorld(idx, w.worldHashes[k]), `${w.idx} ${k}`);
});
test('ledger integrity: hash list digest, count, and no overlap with DEV base, prior or sealed worlds', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(ledger.constructedWorldHashes)).digest('hex'), ledger.constructedWorldHashesSha256);
  assert.equal(new Set(ledger.constructedWorldHashes).size, ledger.constructedWorldHashes.length);
  const idx = loadExclusionIndex(), others = ledger.constructedWorldHashes.filter((h) => idx.worlds.get(h) !== 'SPENT_DIAGNOSTIC_CONSTRUCTED_WORLD');
  assert.equal(others.length, 0, 'a constructed world collides with a DEV base, prior or sealed world');
});
test('committed search evidence is unchanged since the owner commit 8749fd44', () => {
  const diff = execFileSync('/usr/bin/git', ['-C', ROOT, 'diff', '--name-only', '8749fd442f3872faadd7cf76b4aea91bc0d51ffa', '--', 'platform/game-agnostic/stage3h-safety-feasibility-v1/search', 'platform/game-agnostic/stage3h-safety-feasibility-v1/evidence/witness.json', 'platform/game-agnostic/stage3h-safety-feasibility-v1/evidence/feasibility.json'], { encoding: 'utf8' }).trim();
  assert.equal(diff, '');
});
