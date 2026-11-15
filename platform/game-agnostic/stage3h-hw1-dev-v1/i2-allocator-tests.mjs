// H-W1 I-2 allocator tests: the strict exclusion loader is bound into the real allocator path and fails closed on every excluded identity.
//   node i2-allocator-tests.mjs [--write]   uses the frozen allocation file if present, else the in-memory plan; --write needs the frozen file and all gates passing
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { preflightNamespace } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE, BLOCK, PER_BLOCK, PLAN, FORBIDDEN_BLOCKS, ALLOCATION_FILE, POPULATIONS, loadExclusions, loadAllocation, planAllocation, allocationHash, blockSchedule, blockFailures, scanTextHits, admission } from './i2-allocator.mjs';

const sha = (s) => createHash('sha256').update(s).digest('hex'), file = (f) => sha(readFileSync(resolve(LANE, f)));
const gates = [], gate = (name, pass, detail) => gates.push({ name, pass: Boolean(pass), detail });
const throwsWith = (fn, pat) => { try { fn(); return 'NO_THROW'; } catch (e) { return pat.test(e.message) ? 'OK' : 'WRONG:' + e.message.slice(0, 120); } };
const frozen = existsSync(ALLOCATION_FILE), alloc = frozen ? loadAllocation() : planAllocation(PLAN), ctx = loadExclusions();

// ---- forbidden blocks: named by the owner, rejected by the allocator itself and by every layer under it
const forbidden = Object.fromEntries(Object.keys(FORBIDDEN_BLOCKS).map((b) => { const f = blockFailures(ctx.strict, Number(b)); return [b, { failures: f.length, forbiddenList: f.some((x) => x.startsWith('FORBIDDEN_BLOCK_')), strictIndex: f.some((x) => x.startsWith('EXCLUDED_BLOCK_')) }]; }));
gate('FORBIDDEN_BLOCKS_731_734_951_952_REJECTED_BY_BOTH_LAYERS', Object.values(forbidden).every((v) => v.forbiddenList && v.strictIndex), forbidden);
const synthetic = (b) => ({ populations: { EXPLORATION: { blocks: [b] }, VALIDATION: { blocks: [] } }, scheduleHashes: {}, holdout: { allocated: false } });
const viaSchedule = Object.fromEntries(Object.keys(FORBIDDEN_BLOCKS).map((b) => [b, throwsWith(() => blockSchedule(ctx, 'EXPLORATION', Number(b), synthetic(Number(b))), /NAMESPACE_PREFLIGHT_FAILED/)]));
gate('A_RECORD_LISTING_A_FORBIDDEN_BLOCK_STILL_CANNOT_SCHEDULE_IT', Object.values(viaSchedule).every((v) => v === 'OK'), viaSchedule);
gate('PLANNING_AN_ALLOCATION_WITH_A_FORBIDDEN_BLOCK_THROWS', throwsWith(() => planAllocation({ EXPLORATION: [951], VALIDATION: [] }), /PREFLIGHT_FAILED_BLOCK_951/) === 'OK' && throwsWith(() => planAllocation({ EXPLORATION: [961], VALIDATION: [733] }), /PREFLIGHT_FAILED_BLOCK_733/) === 'OK', null);

// ---- ranges that merely touch an excluded block or contain an OPEN seed
const straddle = { INTO_731: preflightNamespace(ctx.strict, { base: 730 * BLOCK + BLOCK - 100, count: PER_BLOCK }), INTO_951_FROM_950: preflightNamespace(ctx.strict, { base: 951 * BLOCK - 5, count: PER_BLOCK }), OUT_OF_952: preflightNamespace(ctx.strict, { base: 953 * BLOCK - 5, count: PER_BLOCK }) };
gate('RANGE_TOUCHING_AN_EXCLUDED_BLOCK_IS_REJECTED', Object.values(straddle).every((r) => !r.ok), Object.fromEntries(Object.entries(straddle).map(([k, v]) => [k, v.failures[0]])));
const open = [...ctx.strict.index.seeds].filter(([, why]) => /OPEN/.test(why)), openRange = preflightNamespace(ctx.strict, { base: Math.floor(open[0][0] / 100) * 100, count: PER_BLOCK });
gate('RANGE_CONTAINING_RECORDED_OPEN_SEEDS_IS_REJECTED', open.length === 6 && !openRange.ok && openRange.failures.filter((f) => /SPENT_DEV_OPEN_SEED/.test(f)).length === 6, { openSeeds: open.length, failures: openRange.failures.length });
const spentSeed = [...ctx.strict.index.seeds].find(([, why]) => /V4_SEALED/.test(why));
gate('RANGE_CONTAINING_A_V4_SEALED_SEED_IS_REJECTED', Boolean(spentSeed) && !preflightNamespace(ctx.strict, { base: Math.floor(spentSeed[0] / BLOCK) * BLOCK, count: PER_BLOCK }).ok, { seed: spentSeed?.[0] });
gate('MALFORMED_RANGES_ARE_REJECTED', [{ base: 12345, count: 10 }, { base: 961 * BLOCK, count: 0 }, { base: 961 * BLOCK + 0.5, count: 5 }].every((r) => !preflightNamespace(ctx.strict, r).ok), null);

// ---- repository text hits (the V4 rule): blocks 967 and 983 carry a seed from another lane
const hits = scanTextHits([967, 983, 961]);
gate('REPOSITORY_TEXT_HITS_REJECT_A_BLOCK', hits.some((h) => h.block === 967) && hits.some((h) => h.block === 983) && !hits.some((h) => h.block === 961) && blockFailures(ctx.strict, 967, hits).some((f) => /REPOSITORY_TEXT_HIT/.test(f)) && throwsWith(() => planAllocation({ EXPLORATION: [967], VALIDATION: [] }), /REPOSITORY_TEXT_HIT/) === 'OK', { hits: hits.map((h) => `${h.block}:${h.seed}`) });

// ---- allocation record integrity and use
const tmp = mkdtempSync(resolve(tmpdir(), 'hw1-alloc-')), tamper = (name, mutate) => { const r = structuredClone(alloc); mutate(r); const p = resolve(tmp, name + '.json'); writeFileSync(p, JSON.stringify(r)); return throwsWith(() => loadAllocation(p), /ALLOCATION_RECORD_/); };
const tamperOut = { BLOCK_ADDED: tamper('a', (r) => r.populations.EXPLORATION.blocks.push(951)), BLOCK_MOVED_ACROSS_POPULATIONS: tamper('b', (r) => r.populations.VALIDATION.blocks.push(r.populations.EXPLORATION.blocks.shift())), HOLDOUT_FLIPPED: tamper('c', (r) => { r.holdout.allocated = true; }),
  FORBIDDEN_BLOCK_ADDED_AND_REHASHED: (() => { const r = structuredClone(alloc); r.populations.VALIDATION.blocks.push(952); r.hash = allocationHash(r); const p = resolve(tmp, 'f.json'); writeFileSync(p, JSON.stringify(r)); return throwsWith(() => loadAllocation(p), /ALLOCATION_RECORD_INCONSISTENT/); })(),
  HOLDOUT_FLIPPED_AND_REHASHED: (() => { const r = structuredClone(alloc); r.holdout.allocated = true; r.hash = allocationHash(r); const p = resolve(tmp, 'g.json'); writeFileSync(p, JSON.stringify(r)); return throwsWith(() => loadAllocation(p), /ALLOCATION_RECORD_INCONSISTENT/); })(), SCHEDULE_HASH_CHANGED: tamper('d', (r) => { r.scheduleHashes[961] = sha('x'); }), HASH_REMOVED: tamper('e', (r) => { delete r.hash; }) };
gate('TAMPERED_ALLOCATION_RECORDS_FAIL_CLOSED', Object.values(tamperOut).every((v) => v === 'OK'), tamperOut);
gate('MISSING_ALLOCATION_RECORD_FAILS_CLOSED', throwsWith(() => loadAllocation(resolve(tmp, 'nope.json')), /ALLOCATION_RECORD_MISSING/) === 'OK', null);
const forged = structuredClone(alloc); forged.scheduleHashes[961] = sha('forged'); forged.hash = undefined;
gate('SCHEDULE_HASH_MISMATCH_IS_DETECTED_AT_SCHEDULING', throwsWith(() => blockSchedule(ctx, 'EXPLORATION', 961, forged), /SCHEDULE_HASH_MISMATCH/) === 'OK', null);
gate('UNALLOCATED_BLOCK_AND_WRONG_POPULATION_ARE_REFUSED', throwsWith(() => blockSchedule(ctx, 'EXPLORATION', 989, alloc), /BLOCK_NOT_ALLOCATED/) === 'OK' && throwsWith(() => blockSchedule(ctx, 'EXPLORATION', alloc.populations.VALIDATION.blocks[0], alloc), /BLOCK_NOT_ALLOCATED_TO_EXPLORATION/) === 'OK' && throwsWith(() => blockSchedule(ctx, 'VALIDATION', alloc.populations.EXPLORATION.blocks[0], alloc), /BLOCK_NOT_ALLOCATED_TO_VALIDATION/) === 'OK', null);
gate('HOLDOUT_CANNOT_BE_SCHEDULED_AND_IS_NOT_ALLOCATED', throwsWith(() => blockSchedule(ctx, 'HOLDOUT', 990, alloc), /HOLDOUT_GENERATION_NOT_AUTHORIZED/) === 'OK' && alloc.holdout.allocated === false && alloc.holdout.generated === 0 && throwsWith(() => blockSchedule(ctx, 'HOLDOUT', alloc.populations.EXPLORATION.blocks[0], alloc), /HOLDOUT_GENERATION_NOT_AUTHORIZED/) === 'OK', null);
gate('OVERLAPPING_POPULATIONS_ARE_REJECTED', throwsWith(() => planAllocation({ EXPLORATION: [961, 962], VALIDATION: [962] }), /POPULATION_BLOCKS_NOT_DISJOINT/) === 'OK', null);

// ---- the real schedule of an allocated block: H2 only, seeds inside the block, unique, disjoint across the whole reserve
const all = POPULATIONS.flatMap((p) => alloc.populations[p].blocks), seen = new Set(); let dup = 0, outside = 0, nonH2 = 0, total = 0;
for (const p of POPULATIONS) for (const b of alloc.populations[p].blocks) for (const c of blockSchedule(ctx, p, b, alloc)) { total++; if (seen.has(c.seed)) dup++; seen.add(c.seed); if (Math.floor(c.seed / BLOCK) !== b) outside++; if (c.horizonBand !== 'H2') nonH2++; }
gate('SCHEDULED_SEEDS_ARE_UNIQUE_INSIDE_THEIR_BLOCK_AND_DISJOINT_ACROSS_POPULATIONS', total === all.length * (PER_BLOCK / 2) && dup === 0 && outside === 0 && nonH2 === 0, { blocks: all.length, scheduledH2Worlds: total, dup, outside, nonH2 });
const strictSeedHits = [...seen].filter((s) => ctx.strict.index.seeds.has(s)).length;
gate('NO_SCHEDULED_SEED_IS_AN_EXCLUDED_SEED', strictSeedHits === 0, { checked: seen.size, hits: strictSeedHits });

// ---- per-world admission gate
const spentHash = [...ctx.strict.sources.keys()][0], studied = ctx.regs[0].entries[0], rnd = (s) => sha(s);
const adm = { SPENT_WORLD_HASH: admission(ctx, spentHash, { fine: rnd('f'), coarse: rnd('c') }), NON_CANONICAL_HASH: admission(ctx, 'abc', { fine: rnd('f'), coarse: rnd('c') }), PCD_FINE_MATCH: admission(ctx, rnd('w1'), { fine: studied.fine, coarse: rnd('c') }), PCD_COARSE_MATCH: admission(ctx, rnd('w2'), { fine: rnd('f'), coarse: studied.coarse }), CLEAN: admission(ctx, rnd('w3'), { fine: rnd('f3'), coarse: rnd('c3') }) };
gate('ADMISSION_REJECTS_SPENT_NONCANONICAL_AND_PCD_MATCHES_AND_ACCEPTS_CLEAN', !adm.SPENT_WORLD_HASH.ok && adm.SPENT_WORLD_HASH.reason === 'STRICT_WORLD_INDEX' && !adm.NON_CANONICAL_HASH.ok && adm.PCD_FINE_MATCH.reason === 'PCD_FINE_MATCH' && adm.PCD_COARSE_MATCH.reason === 'PCD_COARSE_MATCH' && adm.CLEAN.ok, Object.fromEntries(Object.entries(adm).map(([k, v]) => [k, v.ok ? 'ADMIT' : v.reason])));
const every109 = [...ctx.strict.sources.keys()].every((h) => !admission(ctx, h, { fine: rnd(h), coarse: rnd(h + 'c') }).ok);
gate('EVERY_ONE_OF_THE_109082_EXCLUDED_WORLDS_IS_REJECTED_BY_ADMISSION', ctx.strict.sources.size === 109082 && every109, { worlds: ctx.strict.sources.size });
gate('STRUCTURED_EXCLUSIONS_ARE_THE_EXPECTED_SET', ctx.strict.counts.distinctExcludedWorlds === 109082 && ctx.strict.counts.excludedSeeds === 25499 && ctx.strict.counts.devOpenSeeds === 6 && JSON.stringify(ctx.strict.counts.excludedBlocks) === '[731,732,733,734,951,952]', ctx.strict.counts);

const out = { schema: 'STAGE3H_HW1_I2_ALLOCATOR_TESTS_V1', authority: 'R0', checkedAt: new Date().toISOString(), allocationSource: frozen ? 'FROZEN_FILE' : 'IN_MEMORY_PLAN', allocationHash: alloc.hash, registrySeals: ctx.pcdIndex.seals,
  sourceHashes: Object.fromEntries(['i2-allocator.mjs', 'i2-allocator-tests.mjs', 'i2-registry.mjs'].map((f) => [f, file(f)])), gates, allPass: gates.every((g) => g.pass) };
console.log(JSON.stringify({ allocationSource: out.allocationSource, allPass: out.allPass, failed: gates.filter((g) => !g.pass), gates: gates.length }, null, 1));
if (process.argv.includes('--write')) { if (!frozen || !out.allPass) throw Error('I2_ALLOCATOR_TESTS_NOT_RECORDED:' + (frozen ? 'FAILING' : 'ALLOCATION_NOT_FROZEN')); writeExclusive(resolve(LANE, 'evidence/I2_ALLOCATOR_TESTS.json'), out); console.log('recorded evidence/I2_ALLOCATOR_TESTS.json'); }
