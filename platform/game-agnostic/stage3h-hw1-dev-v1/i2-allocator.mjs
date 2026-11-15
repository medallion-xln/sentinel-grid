// H-W1 I-2 world allocator. The ONLY path from a seed block to scheduled worlds for an H-W1 population: blockSchedule() refuses unless the block is listed in the frozen
// allocation record AND the strict structured exclusion index passes for the whole 12,768-seed namespace. admission() is the per-world gate (strict world-hash index plus
// the sealed PCD registries). Everything fails closed: any unreadable, tampered or inconsistent input throws. No HOLDOUT namespace can be scheduled.
//   node i2-allocator.mjs plan [--write]    preflight the reserve in PLAN and (with --write) freeze evidence/I2_NAMESPACE_ALLOCATION.json (exclusive create)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadStrictIndex, preflightNamespace, preflightWorlds } from '../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { schedule, scheduleHash } from '../stage3h-owner-governed-v1/connector.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { loadRegistry, registryIndex, matchPcd } from './i2-registry.mjs';

export const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..');
export const BLOCK = 1_000_000_000, PER_BLOCK = 12768, ALLOCATION_FILE = resolve(LANE, 'evidence/I2_NAMESPACE_ALLOCATION.json'), ALLOCATION_SCHEMA = 'STAGE3H_HW1_I2_NAMESPACE_ALLOCATION_V1';
export const POPULATIONS = Object.freeze(['EXPLORATION', 'VALIDATION']);
/** Blocks the owner named as unusable (spent registrations and spent DEV blocks); checked here independently of the strict index (defence in depth). */
export const FORBIDDEN_BLOCKS = Object.freeze({ 731: 'REGISTRATION_0364164C', 732: 'REGISTRATION_0364164C', 733: 'REGISTRATION_7C41BA89', 734: 'REGISTRATION_7C41BA89', 951: 'SPENT_DEV_FRESH_EXPLORE', 952: 'SPENT_DEV_FRESH_CHECK' });
const sha = (s) => createHash('sha256').update(s).digest('hex'), fail = (m) => { throw Error(m); };
const SKIP = /(^|\/)(node_modules|\.git|work|scratch)$|stage3h-hw1-dev-v1\/evidence\/I2_(NAMESPACE|POPULATION)/;

/** Every 12-digit integer inside the first PER_BLOCK seeds of one of the given blocks, found in repository text (V4 allocation rule). work/, scratch/ and this lane's own population records are skipped. */
export function scanTextHits(blocks, root = REPO) {
  const lo = new Map(blocks.map((b) => [b, b * BLOCK])), hits = [], re = /\b(\d{3})(\d{9})\b/g;
  (function walk(d) { for (const n of readdirSync(d)) { const p = resolve(d, n); if (SKIP.test(p)) continue; const s = statSync(p);
    if (s.isDirectory()) walk(p); else if (/\.(mjs|js|json|jsonl|md|txt|tsv)$/.test(n) && s.size < 256e6) for (const m of readFileSync(p, 'utf8').matchAll(re)) { const b = Number(m[1]); if (lo.has(b) && Number(m[2]) < PER_BLOCK) hits.push({ block: b, seed: Number(m[0]), file: relative(root, p) }); } } })(root);
  return hits;
}

/** Whole-namespace preflight of one block: forbidden list, strict index, repository text hits. Returns the failure list (empty = usable). */
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

/** Exclusion context: strict index plus every sealed PCD registry given (studied 341, DEV H2, and the registries of populations generated earlier). */
export function loadExclusions(extraRegistries = []) {
  const strict = loadStrictIndex(), regs = [loadRegistry(resolve(LANE, 'evidence/I2_REGISTRY_STUDIED_341.json')), loadRegistry(resolve(LANE, 'evidence/I2_REGISTRY_DEV_H2.json')), ...extraRegistries.map((p) => loadRegistry(p))];
  return { strict, regs, pcdIndex: registryIndex(regs) };
}

let contractCache = null;
const contract = () => (contractCache ??= JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8')));

/** Scheduled combos of an allocated block for one population, H2 only (seeds are those of the full 12,768-world schedule). Refuses unallocated blocks, HOLDOUT, and any preflight failure. */
export function blockSchedule(ctx, population, block, allocation = loadAllocation()) {
  if (population === 'HOLDOUT') fail('HOLDOUT_GENERATION_NOT_AUTHORIZED');
  if (!POPULATIONS.includes(population)) fail('UNKNOWN_POPULATION:' + population);
  if (!allocation.populations[population].blocks.includes(block)) fail(`BLOCK_NOT_ALLOCATED_TO_${population}:${block}`);
  const f = blockFailures(ctx.strict, block); if (f.length) fail('NAMESPACE_PREFLIGHT_FAILED:' + f.join('|'));
  const full = schedule(contract().populations, block * BLOCK);
  if (full.length !== PER_BLOCK || scheduleHash(full) !== allocation.scheduleHashes[block]) fail('SCHEDULE_HASH_MISMATCH:' + block);
  return full.map((c, k) => ({ ...c, k })).filter((c) => c.horizonBand === 'H2');
}

/** Per-world admission gate: strict world-hash index and PCD registries. Not outcome-dependent. */
export function admission(ctx, worldHash, p) {
  const w = preflightWorlds(ctx.strict, [worldHash]); if (!w.ok) return { ok: false, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] };
  const m = matchPcd(ctx.pcdIndex, p); if (m.length) return { ok: false, reason: m.some((x) => x.startsWith('FINE:')) ? 'PCD_FINE_MATCH' : 'PCD_COARSE_MATCH', detail: m[0] };
  return { ok: true };
}

/** Preflight a reserve and build the allocation record. Throws if any block fails; nothing is partially allocated. */
export function planAllocation(reserve) {
  const all = POPULATIONS.flatMap((p) => reserve[p]); if (new Set(all).size !== all.length) fail('POPULATION_BLOCKS_NOT_DISJOINT');
  const ctx = loadExclusions(), hits = scanTextHits(all), perBlock = {}, hashes = {};
  for (const b of all) { const f = blockFailures(ctx.strict, b, hits); if (f.length) fail(`PREFLIGHT_FAILED_BLOCK_${b}:${f.join('|')}`); const full = schedule(contract().populations, b * BLOCK); hashes[b] = scheduleHash(full); perBlock[b] = { combos: full.length, h2Combos: full.filter((c) => c.horizonBand === 'H2').length, seedRange: [b * BLOCK, b * BLOCK + PER_BLOCK - 1], preflight: 'PASS', textHitsInRange: 0 }; }
  const rec = { schema: ALLOCATION_SCHEMA, authority: 'R0', populations: Object.fromEntries(POPULATIONS.map((p) => [p, { blocks: reserve[p] }])), holdout: { allocated: false, generated: 0, note: 'HOLDOUT is not allocated and cannot be scheduled; it is generated only after a candidate is frozen and authorized (I-6).' },
    forbiddenBlocks: FORBIDDEN_BLOCKS, strictIndexCounts: ctx.strict.counts, registrySeals: ctx.pcdIndex.seals, scheduleHashes: hashes, perBlock,
    textScan: { root: 'repository', skipped: ['node_modules', '.git', 'work', 'scratch', 'this lane population records'], rule: 'any 12-digit integer inside the first 12,768 seeds of a block rejects the block (V4 rule)' },
    note: 'Blocks are a RESERVE: a block is spent only when its worlds are generated. The block-to-population mapping is fixed here, before any world is generated or any candidate evaluated.' };
  rec.hash = hashOf(rec); return rec;
}

/** The reserve. 967 and 983 are absent: each has a 12-digit seed inside its first 12,768 seeds in another lane's episode file, so the text scan rejects them. */
export const PLAN = Object.freeze({ EXPLORATION: [961, 962, 963, 964, 965, 966, 968, 969, 970, 971, 972, 973, 974, 975, 976], VALIDATION: [977, 978, 979, 980, 981, 982, 984, 985, 986, 987, 988] });

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i2-allocator.mjs') && process.argv[2] === 'plan') {
  const rec = planAllocation(PLAN); console.log(JSON.stringify({ hash: rec.hash, populations: rec.populations, perBlock: Object.fromEntries(Object.entries(rec.perBlock).slice(0, 2)), strict: rec.strictIndexCounts }));
  if (process.argv.includes('--write')) { writeExclusive(ALLOCATION_FILE, rec); loadAllocation(); console.log('frozen evidence/I2_NAMESPACE_ALLOCATION.json'); }
}
