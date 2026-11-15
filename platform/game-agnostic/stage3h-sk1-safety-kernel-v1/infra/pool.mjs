// SK1 pool. Aggregates the screened blocks (which must be a prefix of the allocation), removes duplicates, routes every
// admitted class to ONE population by origin family, applies the per-population family cap and assigns opaque aliases.
// Everything here is public-side and independent of any candidate outcome. Coarse public-class duplicates are removed
// GLOBALLY, so EXPLORATION and VALIDATION can share neither a family nor a coarse public class.
//   node infra/pool.mjs [--write]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllocation } from './allocator.mjs';
import { SCREEN_DIR, SHARDS, shardName } from './screen.mjs';
import { WORK, POPULATIONS, TARGET, CAP_FRACTION, familyOf, populationOfFamily, aliasOf, sha, readJ, fail } from './common.mjs';

export const POOL_FILE = resolve(WORK, 'pool/pool.json');
const hasBlock = (b) => Array.from({ length: SHARDS }, (_, i) => existsSync(resolve(SCREEN_DIR, shardName(b, i)))).every(Boolean);
export function blockResult(block, registryHash) {
  const funnel = {}, admitted = []; let scheduled = 0;
  for (let i = 0; i < SHARDS; i++) { const s = readJ(resolve(SCREEN_DIR, shardName(block, i)));
    if (s.block !== block || s.shard !== i || s.of !== SHARDS || s.exclusionRegistryHash !== registryHash) fail(`SHARD_IDENTITY_MISMATCH:${block}:${i}`);
    scheduled += s.scheduled; for (const [k, v] of Object.entries(s.funnel)) funnel[k] = (funnel[k] ?? 0) + v; admitted.push(...s.admitted); }
  if (Object.values(funnel).reduce((a, b) => a + b, 0) !== scheduled || (funnel.ADMITTED ?? 0) !== admitted.length) fail(`SHARDS_INCONSISTENT:${block}`);
  return { block, scheduled, funnel, admitted: admitted.sort((a, b) => a.k - b.k) };
}
export function buildPool() {
  const alloc = loadAllocation(), screened = alloc.blocks.filter(hasBlock);
  if (JSON.stringify(screened) !== JSON.stringify(alloc.blocks.slice(0, screened.length))) fail('SCREENED_BLOCKS_ARE_NOT_A_PREFIX_OF_THE_ALLOCATION');
  const results = screened.map((b) => blockResult(b, alloc.exclusionRegistryHash)), funnel = {}, dropped = {}, seenHash = new Set(), seenCoarse = new Set(), kept = [], drop = (r) => { dropped[r] = (dropped[r] ?? 0) + 1; };
  for (const r of results) { if (r.scheduled !== alloc.perBlock[r.block].h2Combos) fail(`BLOCK_NOT_FULLY_SCREENED:${r.block}`); for (const [k, v] of Object.entries(r.funnel)) funnel[k] = (funnel[k] ?? 0) + v; }
  for (const r of results) for (const a of r.admitted) {
    if (seenHash.has(a.worldHash)) { drop('DUPLICATE_WORLD_HASH'); continue; } if (seenCoarse.has(a.coarse)) { drop('COARSE_DUPLICATE_ACROSS_BOTH_POPULATIONS'); continue; }
    seenHash.add(a.worldHash); seenCoarse.add(a.coarse); const family = familyOf(a.cell); kept.push({ block: r.block, ...a, family, population: populationOfFamily(family) });
  }
  const pool = {}, summary = {};
  for (const p of POPULATIONS) { const mine = kept.filter((c) => c.population === p), cap = Math.floor(CAP_FRACTION * TARGET[p]), byFam = new Map(); for (const c of mine) byFam.set(c.family, [...(byFam.get(c.family) ?? []), c]);
    const capped = new Set(); for (const [, ms] of byFam) if (ms.length > cap) for (const c of [...ms].sort((x, y) => (sha(x.worldHash) < sha(y.worldHash) ? -1 : 1)).slice(cap)) capped.add(c.worldHash);
    const ordered = mine.filter((c) => !capped.has(c.worldHash)); // (block, k) order: the admission order
    const rank = new Map([...ordered].sort((x, y) => (sha(x.worldHash) < sha(y.worldHash) ? -1 : 1)).map((c, i) => [c.worldHash, i + 1]));
    pool[p] = ordered.map((c) => ({ id: aliasOf(p, rank.get(c.worldHash)), ...c })); const fam = new Map(); for (const c of pool[p]) fam.set(c.family, (fam.get(c.family) ?? 0) + 1);
    summary[p] = { target: TARGET[p], cap, admittedRouted: mine.length, droppedFamilyCap: capped.size, poolSize: pool[p].length, families: fam.size, maxFamilyCount: Math.max(0, ...fam.values()), enough: pool[p].length >= TARGET[p] }; }
  const famE = new Set(pool.EXPLORATION.map((c) => c.family)), shared = [...new Set(pool.VALIDATION.map((c) => c.family))].filter((f) => famE.has(f)); if (shared.length) fail('ORIGIN_FAMILY_LEAKAGE');
  return { blocksScreened: screened, blocksAllocated: alloc.blocks.length, worldsScreened: results.reduce((a, r) => a + r.scheduled, 0), admittedRaw: results.reduce((a, r) => a + r.admitted.length, 0), funnel, dropped, summary, sharedFamilies: shared.length, pool };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildPool(), { pool, ...rest } = r; console.log(JSON.stringify(rest, null, 1));
  if (process.argv.includes('--write')) { mkdirSync(resolve(WORK, 'pool'), { recursive: true }); writeFileSync(POOL_FILE, JSON.stringify(r)); console.log('wrote work/pool/pool.json (privileged, gitignored)'); }
}
