// H-W4 world allocator. Adapted from stage3h-hw1-dev-v1/i2-allocator.mjs with TWO differences, both prespecified before
// any world is generated: (1) FORBIDDEN_BLOCKS adds every H-W1 population block (961-976 exploration, 977-988 validation,
// including the text-scan rejects 967/983), so no H-W1 namespace can be scheduled; (2) the reserve uses fresh blocks
// 941-950 / 953-960 / 989-999, which the strict structured exclusion index and the repository text scan must both pass
// (fail closed) before an allocation record can be frozen. HOLDOUT can never be scheduled. Blocks are a RESERVE: a block
// is spent only when its worlds are generated.
//   node hw4-allocator.mjs plan [--write]    preflight the reserve and (with --write) freeze evidence/HW4_NAMESPACE_ALLOCATION.json (exclusive create)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadStrictIndex, preflightNamespace, preflightWorlds } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { schedule, scheduleHash } from '../stage3h-owner-governed-v1/connector.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { loadRegistry, registryIndex, matchPcd } from '../stage3h-hw1-dev-v1/i2-registry.mjs';

export const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..');
export const BLOCK = 1_000_000_000, PER_BLOCK = 12768, ALLOCATION_FILE = resolve(LANE, 'evidence/HW4_NAMESPACE_ALLOCATION.json'), ALLOCATION_SCHEMA = 'STAGE3H_HW4_NAMESPACE_ALLOCATION_V1';
export const POPULATIONS = Object.freeze(['EXPLORATION', 'VALIDATION']);
/** Owner-forbidden blocks for H-W4: V4 registrations, spent DEV blocks, the whole H-W1 allocation, and the text-scan rejects. */
export const FORBIDDEN_BLOCKS = Object.freeze({
  731: 'REGISTRATION_0364164C', 732: 'REGISTRATION_0364164C', 733: 'REGISTRATION_7C41BA89', 734: 'REGISTRATION_7C41BA89',
  951: 'SPENT_DEV_FRESH_EXPLORE', 952: 'SPENT_DEV_FRESH_CHECK', 967: 'REPOSITORY_TEXT_HIT', 983: 'REPOSITORY_TEXT_HIT',
  ...Object.fromEntries([961, 962, 963, 964, 965, 966, 968, 969, 970, 971, 972, 973, 974, 975, 976].map((b) => [b, 'SPENT_HW1_EXPLORATION'])),
  ...Object.fromEntries([977, 978, 979, 980, 981, 982, 984, 985, 986, 987, 988].map((b) => [b, 'SPENT_HW1_VALIDATION'])),
});
const sha = (s) => createHash('sha256').update(s).digest('hex'), fail = (m) => { throw Error(m); };
const SKIP = /(^|\/)(node_modules|\.git|work|scratch|p2r-scratch)$|stage3h-hw[134][^/]*\/evidence\/(I2_|HW4_)(NAMESPACE|POPULATION|REGISTRY)/;

export function scanTextHits(blocks, root = REPO) {
  const lo = new Map(blocks.map((b) => [b, b * BLOCK])), hits = [], re = /\b(\d{3})(\d{9})\b/g;
  (function walk(d) { for (const n of readdirSync(d)) { const p = resolve(d, n); if (SKIP.test(p)) continue; const s = statSync(p);
    if (s.isDirectory()) walk(p); else if (/\.(mjs|js|json|jsonl|md|txt|tsv)$/.test(n) && s.size < 256e6) for (const m of readFileSync(p, 'utf8').matchAll(re)) { const b = Number(m[1]); if (lo.has(b) && Number(m[2]) < PER_BLOCK) hits.push({ block: b, seed: Number(m[0]), file: relative(root, p) }); } } })(root);
  return hits;
}

export function blockFailures(strict, block, hits = []) {
  const base = block * BLOCK, out = [];
  if (!Number.isSafeInteger(block) || String(base).length !== 12) return ['NOT_A_12_DIGIT_BLOCK'];
  if (FORBIDDEN_BLOCKS[block]) out.push(`FORBIDDEN_BLOCK_${block}:${FORBIDDEN_BLOCKS[block]}`);
  out.push(...preflightNamespace(strict, { base, count: PER_BLOCK }).failures);
  for (const h of hits) if (h.block === block) out.push(`REPOSITORY_TEXT_HIT:${h.seed}:${h.file}`);
  return out;
}

const hashOf = (rec) => { const { hash, ...rest } = rec; return sha(JSON.stringify(rest)); };
export const allocationHash = hashOf;
export function loadAllocation(path = ALLOCATION_FILE) {
  if (!existsSync(path)) fail('ALLOCATION_RECORD_MISSING');
  const rec = JSON.parse(readFileSync(path, 'utf8'));
  if (rec.schema !== ALLOCATION_SCHEMA || rec.hash !== hashOf(rec)) fail('ALLOCATION_RECORD_TAMPERED');
  const all = POPULATIONS.flatMap((p) => rec.populations[p].blocks);
  if (new Set(all).size !== all.length || all.some((b) => FORBIDDEN_BLOCKS[b]) || rec.holdout.allocated !== false) fail('ALLOCATION_RECORD_INCONSISTENT');
  return rec;
}

/** Exclusion context: strict index plus EVERY sealed registry from earlier stages (studied 341, DEV H2, H-W1 exploration and validation). */
export function loadExclusions(extraRegistries = []) {
  const HW1 = resolve(GA, 'stage3h-hw1-dev-v1/evidence');
  const strict = loadStrictIndex(), regs = [loadRegistry(resolve(HW1, 'I2_REGISTRY_STUDIED_341.json')), loadRegistry(resolve(HW1, 'I2_REGISTRY_DEV_H2.json')),
    loadRegistry(resolve(HW1, 'I2_REGISTRY_EXPLORATION.json')), loadRegistry(resolve(HW1, 'I2_REGISTRY_VALIDATION.json')), ...extraRegistries.map((p) => loadRegistry(p))];
  return { strict, regs, pcdIndex: registryIndex(regs) };
}

let contractCache = null;
const contract = () => (contractCache ??= JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8')));

export function blockSchedule(ctx, population, block, allocation = loadAllocation()) {
  if (population === 'HOLDOUT') fail('HOLDOUT_GENERATION_NOT_AUTHORIZED');
  if (!POPULATIONS.includes(population)) fail('UNKNOWN_POPULATION:' + population);
  if (!allocation.populations[population].blocks.includes(block)) fail(`BLOCK_NOT_ALLOCATED_TO_${population}:${block}`);
  const f = blockFailures(ctx.strict, block); if (f.length) fail('NAMESPACE_PREFLIGHT_FAILED:' + f.join('|'));
  const full = schedule(contract().populations, block * BLOCK);
  if (full.length !== PER_BLOCK || scheduleHash(full) !== allocation.scheduleHashes[block]) fail('SCHEDULE_HASH_MISMATCH:' + block);
  return full.map((c, k) => ({ ...c, k })).filter((c) => c.horizonBand === 'H2');
}

export function admission(ctx, worldHash, p) {
  const w = preflightWorlds(ctx.strict, [worldHash]); if (!w.ok) return { ok: false, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] };
  const m = matchPcd(ctx.pcdIndex, p); if (m.length) return { ok: false, reason: m.some((x) => x.startsWith('FINE:')) ? 'PCD_FINE_MATCH' : 'PCD_COARSE_MATCH', detail: m[0] };
  return { ok: true };
}

export function planAllocation(reserve) {
  const all = POPULATIONS.flatMap((p) => reserve[p]); if (new Set(all).size !== all.length) fail('POPULATION_BLOCKS_NOT_DISJOINT');
  const ctx = loadExclusions(), hits = scanTextHits(all), perBlock = {}, hashes = {};
  for (const b of all) { const f = blockFailures(ctx.strict, b, hits); if (f.length) fail(`PREFLIGHT_FAILED_BLOCK_${b}:${f.join('|')}`); const full = schedule(contract().populations, b * BLOCK); hashes[b] = scheduleHash(full); perBlock[b] = { combos: full.length, h2Combos: full.filter((c) => c.horizonBand === 'H2').length, seedRange: [b * BLOCK, b * BLOCK + PER_BLOCK - 1], preflight: 'PASS', textHitsInRange: 0 }; }
  const rec = { schema: ALLOCATION_SCHEMA, authority: 'R0', stage: 'H-W4', populations: Object.fromEntries(POPULATIONS.map((p) => [p, { blocks: reserve[p] }])), holdout: { allocated: false, generated: 0, note: 'HOLDOUT is not allocated and cannot be scheduled (H-W4 owner directive: no holdout).' },
    forbiddenBlocks: FORBIDDEN_BLOCKS, strictIndexCounts: ctx.strict.counts, registrySeals: ctx.pcdIndex.seals, scheduleHashes: hashes, perBlock,
    textScan: { root: 'repository', skipped: ['node_modules', '.git', 'work', 'scratch', 'p2r-scratch', 'this lane population records'], rule: 'any 12-digit integer inside the first 12,768 seeds of a block rejects the block (V4 rule)' },
    note: 'Blocks are a RESERVE: a block is spent only when its worlds are generated. The block-to-population mapping is fixed here, before any world is generated or any candidate is evaluated.' };
  rec.hash = hashOf(rec); return rec;
}

/** The H-W4 reserve: fresh blocks only, disjoint from every H-W1 population and every forbidden block. Block 950 is
 * excluded: its base seed appears in EXCLUSION_INTEGRITY.json (repository text scan rejects it). */
export const PLAN = Object.freeze({ EXPLORATION: [941, 942, 943, 944, 945, 946, 947, 948, 949, 953, 954, 955, 956, 957, 958, 959], VALIDATION: [960, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999] });

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'hw4-allocator.mjs') && process.argv[2] === 'plan') {
  const rec = planAllocation(PLAN); console.log(JSON.stringify({ hash: rec.hash, populations: rec.populations, strict: rec.strictIndexCounts }, null, 1));
  if (process.argv.includes('--write')) { writeExclusive(ALLOCATION_FILE, rec); loadAllocation(); console.log('frozen evidence/HW4_NAMESPACE_ALLOCATION.json'); }
}
