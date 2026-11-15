// Gate 0.1 — the exclusion registry is fail-closed and is actually enforced by the allocator (negative controls).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSk1Exclusions, blockFailures, admission, contamination, REGISTRY_FILE } from '../infra/exclusions.mjs';
import { planAllocation, blockSchedule } from '../infra/allocator.mjs';
import { loadPopulation, loadManifest } from '../infra/population.mjs';
import { GA } from '../infra/common.mjs';

const ctx = loadSk1Exclusions(), tmp = mkdtempSync(join(tmpdir(), 'sk1-excl-'));
test.after(() => rmSync(tmp, { recursive: true, force: true }));
test('every spent or retired block is forbidden, including 901-910 and 911-914', () => {
  for (let b = 901; b <= 910; b++) assert.match(blockFailures(ctx, b)[0], /FORBIDDEN_BLOCK_\d+:SPENT_HW4B_SCREENED_OBSERVATIONAL/);
  for (let b = 911; b <= 914; b++) assert.match(blockFailures(ctx, b)[0], /RETIRED_HW4B_RESERVE_NEVER_GENERATED/);
  for (const b of [731, 734, 941, 959, 960, 961, 977, 988, 989, 999, 950, 951, 952, 967, 983]) assert.ok(blockFailures(ctx, b).length > 0, String(b));
  assert.equal(ctx.registry.hw4bInterruptedScreening.screenedWorlds, 63840); assert.equal(ctx.registry.hw4bInterruptedScreening.admittedIdentities, 885); assert.equal(ctx.registry.hw4bInterruptedScreening.poolEntries, 837);
});
test('the allocator refuses to plan or schedule a forbidden block', () => {
  for (const b of [901, 905, 910, 911, 914, 941, 960, 977]) assert.throws(() => planAllocation([b], { scan: false }), /PREFLIGHT_FAILED_BLOCK/);
  const forged = { blocks: [905], exclusionRegistryHash: ctx.registryHash, scheduleHashes: {}, holdout: { allocated: false } }; // a hand-made allocation record cannot unlock a forbidden block
  assert.throws(() => blockSchedule(ctx, 905, forged), /NAMESPACE_PREFLIGHT_FAILED:FORBIDDEN_BLOCK_905/);
  assert.throws(() => blockSchedule(ctx, 801, { blocks: [802], exclusionRegistryHash: ctx.registryHash, scheduleHashes: {} }), /BLOCK_NOT_ALLOCATED/);
  assert.throws(() => blockSchedule(ctx, 801, { blocks: [801], exclusionRegistryHash: 'other', scheduleHashes: {} }), /ALLOCATION_BOUND_TO_A_DIFFERENT_EXCLUSION_REGISTRY/);
  assert.throws(() => blockSchedule(null, 801, { blocks: [801] }), /EXCLUSION_CONTEXT_REQUIRED/);
});
test('every sealed registry rejects a known fine and a known coarse public class, under any world hash', () => {
  for (const reg of ctx.regs) { const e = reg.entries[0]; assert.equal(admission(ctx, 'f'.repeat(64), { fine: e.fine, coarse: 'f'.repeat(64) }).reason, 'PCD_FINE_MATCH', reg.name); assert.equal(admission(ctx, 'e'.repeat(64), { fine: 'e'.repeat(64), coarse: e.coarse }).reason, 'PCD_COARSE_MATCH', reg.name); }
  assert.equal(ctx.regs.length, 7); assert.equal(ctx.regs.find((r) => r.name === 'HW4B_SCREENED_DEV').count, 885);
  const known = ctx.strict.sources.keys().next().value; assert.equal(admission(ctx, known, { fine: 'a'.repeat(64), coarse: 'b'.repeat(64) }).reason, 'STRICT_WORLD_INDEX');
  assert.equal(admission(ctx, 'c'.repeat(64), { fine: 'a'.repeat(64), coarse: 'b'.repeat(64) }).ok, true);
});
test('a contaminated population is detected entry by entry', () => { const e = ctx.regs[5].entries[3], known = ctx.strict.sources.keys().next().value, clean = { id: 'OK', block: 801, worldHash: 'c'.repeat(64), fine: 'a'.repeat(64), coarse: 'b'.repeat(64) };
  const bad = contamination(ctx, [clean, { ...clean, id: 'BLOCK', block: 905 }, { ...clean, id: 'PCD', coarse: e.coarse }, { ...clean, id: 'WORLD', worldHash: known }, { ...clean, id: 'TWIN', memberHashes: [known] }]);
  assert.deepEqual(bad.map((b) => [b.id, b.reason]), [['BLOCK', 'FORBIDDEN_BLOCK'], ['PCD', 'PCD_MATCH'], ['WORLD', 'STRICT_WORLD_INDEX'], ['TWIN', 'STRICT_WORLD_INDEX']]); });
test('the loader fails closed on a missing, edited or thinned registry', () => {
  assert.throws(() => loadSk1Exclusions({ registryFile: join(tmp, 'absent.json') }), /SK1_EXCLUSION_REGISTRY_MISSING/);
  const rec = JSON.parse(readFileSync(REGISTRY_FILE, 'utf8')), put = (name, r) => { const p = join(tmp, name); writeFileSync(p, JSON.stringify(r)); return p; };
  const dropped = JSON.parse(JSON.stringify(rec)); delete dropped.forbiddenBlocks['905']; assert.throws(() => loadSk1Exclusions({ registryFile: put('dropped.json', dropped) }), /SK1_EXCLUSION_REGISTRY_TAMPERED/);
  const reseal = JSON.parse(JSON.stringify(rec)); reseal.sealedRegistries[6].seal = '0'.repeat(64); assert.throws(() => loadSk1Exclusions({ registryFile: put('reseal.json', reseal) }), /SK1_EXCLUSION_REGISTRY_TAMPERED/);
  writeFileSync(join(tmp, 'garbage.json'), '{'); assert.throws(() => loadSk1Exclusions({ registryFile: join(tmp, 'garbage.json') }), /SK1_EXCLUSION_REGISTRY_UNREADABLE/);
});
test('no held-out population can be named, and VALIDATION cannot be opened for development', () => { assert.throws(() => loadManifest('HOLDOUT'), /UNKNOWN_OR_UNAUTHORIZED_POPULATION/); assert.throws(() => loadPopulation('SEALED', 'RUN'), /UNKNOWN_OR_UNAUTHORIZED_POPULATION/); });
