// SK1 namespace allocator. Every entry point obtains its exclusion context from loadSk1Exclusions() (fail closed) and
// refuses a forbidden, excluded, unallocated or schedule-mismatched block. One reserve of fresh blocks is screened once;
// each admitted class is routed to EXPLORATION or VALIDATION by its origin family (common.mjs FAMILY_SPLIT_RULE), so
// the two populations share no family. HOLDOUT does not exist here and cannot be scheduled.
// The allocation record carries block numbers and schedule hashes only — no seed, seed range or world identity.
//   node infra/allocator.mjs probe <b...>            fail-closed preflight (no writes)
//   node infra/allocator.mjs plan <b...> [--write]   preflight and freeze evidence/SK1_NAMESPACE_ALLOCATION.json (exclusive create)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schedule, scheduleHash } from '../../stage3h-owner-governed-v1/connector.mjs';
import { loadSk1Exclusions, blockFailures } from './exclusions.mjs';
import { GA, REPO, EVIDENCE, BLOCK, PER_BLOCK, POPULATIONS, TARGET, MINIMUM, CAP_FRACTION, FAMILY_SPLIT_RULE, sha, readJ, fail, writeExclusive, exists } from './common.mjs';

export const ALLOCATION_FILE = resolve(EVIDENCE, 'SK1_NAMESPACE_ALLOCATION.json'), ALLOCATION_SCHEMA = 'SK1_NAMESPACE_ALLOCATION_V1';
const hashOf = (rec) => { const { hash, ...rest } = rec; return sha(JSON.stringify(rest)); };
let contractCache = null; const contract = () => (contractCache ??= readJ(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json')));
// private working data and the population/registry/allocation records of the hw and sk1 lanes are not scanned (they legitimately hold identities)
const SKIP = /(^|\/)(node_modules|\.git|work|work4b|scratch|p2r-scratch)$|stage3h-(hw[14]|sk1)[^/]*\/evidence\/[A-Z0-9]+_(NAMESPACE|POPULATION|REGISTRY)/;

/** Repository text scan (V4 rule): any 12-digit integer inside the first 12,768 seeds of a candidate block rejects it. Returns counts only. */
export function scanTextHits(blocks, root = REPO) {
  const want = new Set(blocks), hits = new Map(blocks.map((b) => [b, 0])), re = /\b(\d{3})(\d{9})\b/g;
  (function walk(d) { for (const n of readdirSync(d)) { const p = resolve(d, n); if (SKIP.test(p)) continue; const s = statSync(p);
    if (s.isDirectory()) walk(p); else if (/\.(mjs|js|json|jsonl|md|txt|tsv)$/.test(n) && s.size < 256e6) for (const m of readFileSync(p, 'utf8').matchAll(re)) { const b = Number(m[1]); if (want.has(b) && Number(m[2]) < PER_BLOCK) hits.set(b, hits.get(b) + 1); } } })(root);
  return hits;
}

export function loadAllocation(path = ALLOCATION_FILE) {
  if (!exists(path)) fail('SK1_ALLOCATION_RECORD_MISSING');
  const rec = readJ(path);
  if (rec.schema !== ALLOCATION_SCHEMA || rec.hash !== hashOf(rec)) fail('SK1_ALLOCATION_RECORD_TAMPERED');
  if (new Set(rec.blocks).size !== rec.blocks.length || rec.holdout.allocated !== false) fail('SK1_ALLOCATION_RECORD_INCONSISTENT');
  return rec;
}

/** The H2 schedule of one allocated block. Refuses anything the exclusion registry or the allocation does not permit. */
export function blockSchedule(ctx, block, allocation = loadAllocation()) {
  if (!ctx || !ctx.registryHash || !ctx.strict || !ctx.pcdIndex) fail('EXCLUSION_CONTEXT_REQUIRED');
  if (allocation.exclusionRegistryHash !== ctx.registryHash) fail('ALLOCATION_BOUND_TO_A_DIFFERENT_EXCLUSION_REGISTRY');
  const f = blockFailures(ctx, block); if (f.length) fail('NAMESPACE_PREFLIGHT_FAILED:' + f.join('|'));
  if (!allocation.blocks.includes(block)) fail(`BLOCK_NOT_ALLOCATED:${block}`);
  const full = schedule(contract().populations, block * BLOCK);
  if (full.length !== PER_BLOCK || scheduleHash(full) !== allocation.scheduleHashes[block]) fail('SCHEDULE_HASH_MISMATCH:' + block);
  return full.map((c, k) => ({ ...c, k })).filter((c) => c.horizonBand === 'H2');
}

export function planAllocation(blocks, { scan = true } = {}) {
  if (!blocks.length || new Set(blocks).size !== blocks.length) fail('BLOCK_LIST_INVALID');
  const ctx = loadSk1Exclusions(), hits = scan ? scanTextHits(blocks) : null, hashes = {}, perBlock = {};
  for (const b of blocks) {
    const f = blockFailures(ctx, b); if (hits && hits.get(b) > 0) f.push(`REPOSITORY_TEXT_HIT_COUNT:${hits.get(b)}`);
    if (f.length) fail(`PREFLIGHT_FAILED_BLOCK_${b}:${f.join('|')}`);
    const full = schedule(contract().populations, b * BLOCK); hashes[b] = scheduleHash(full); perBlock[b] = { combos: full.length, h2Combos: full.filter((c) => c.horizonBand === 'H2').length, preflight: 'PASS', textHitsInRange: hits ? hits.get(b) : null };
  }
  const rec = { schema: ALLOCATION_SCHEMA, authority: 'R0', stage: 'STAGE3H-SK1', blocks, populations: Object.fromEntries(POPULATIONS.map((p) => [p, { target: TARGET[p], minimum: MINIMUM[p], familyCap: Math.floor(CAP_FRACTION * TARGET[p]) }])),
    familySplitRule: FAMILY_SPLIT_RULE, holdout: { allocated: false, generated: 0, note: 'No held-out or sealed population exists in SK1 and none can be scheduled by this allocator.' },
    exclusionRegistryHash: ctx.registryHash, sealedRegistries: ctx.pcdIndex.seals, strictIndexCounts: ctx.strict.counts, scheduleHashes: hashes, perBlock,
    reserveRule: 'Blocks are a reserve screened strictly in the listed order (prefix rule). A block is spent when its worlds are generated. Every admitted class is routed by origin family; no replacement of unfavourable classes.',
    textScan: scan ? { rule: 'any 12-digit integer inside the first 12,768 seeds of a block rejects the block', result: 'no hit in any allocated block' } : null };
  rec.hash = hashOf(rec); return rec;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...args] = process.argv.slice(2), blocks = args.filter((a) => a !== '--write').map(Number);
  if (mode === 'probe') { const ctx = loadSk1Exclusions(), hits = scanTextHits(blocks); for (const b of blocks) { const f = blockFailures(ctx, b); if (hits.get(b) > 0) f.push(`REPOSITORY_TEXT_HIT_COUNT:${hits.get(b)}`); console.log(b, f.length ? 'REJECT:' + f.join('|') : 'OK'); } }
  else if (mode === 'plan') { const rec = planAllocation(blocks); console.log(JSON.stringify({ hash: rec.hash, blocks: rec.blocks.length, exclusionRegistryHash: rec.exclusionRegistryHash, populations: rec.populations }, null, 1));
    if (process.argv.includes('--write')) { writeExclusive(ALLOCATION_FILE, rec); loadAllocation(); console.log('frozen ' + relative(REPO, ALLOCATION_FILE)); } }
  else fail('USAGE: node infra/allocator.mjs probe <b...> | plan <b...> [--write]');
}
