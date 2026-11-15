// H-W1 I-2 pool aggregation: merge the screen shards of a population's allocated blocks (a PREFIX of the frozen allocation order), resolve global duplicates, apply the
// origin-family cap, and write the ordered pool the class builder walks. Everything here is public and outcome-independent: duplicates are resolved by (block, k) order and the
// family cap by sha256(worldHash) order. Validation outcome fields are written to the git-ignored work file only and are never printed; only counts are printed.
//   node i2-screen-aggregate.mjs <EXPLORATION|VALIDATION> <target> [--write]
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { LANE, loadAllocation, POPULATIONS } from './i2-allocator.mjs';

const SHARDS = resolve(LANE, 'work/i2/screen'), POOL_DIR = resolve(LANE, 'work/i2/pool'), N = 9, PER_BLOCK_H2 = 6384, sha = (s) => createHash('sha256').update(s).digest('hex');
export const CAP_FRACTION = 0.05;
/** Origin family: topology x resource x objective, the first three parts of the schedule cell (shape/roles/objective/band/level). */
export const familyOf = (cell) => cell.split('/').slice(0, 3).join('/');
export const classId = (population, block, k) => `${population}:${block}:${k}`;

const shardFile = (population, block, i) => resolve(SHARDS, `${population}-${block}-shard-${i}-of-${N}.json`);
const hasBlock = (population, block) => Array.from({ length: N }, (_, i) => existsSync(shardFile(population, block, i))).every(Boolean);

/** All shards of one block, checked for completeness: nine shards, every scheduled H2 world accounted for in the funnel. */
export function blockResult(population, block) {
  const funnel = {}, admitted = []; let scheduled = 0;
  for (let i = 0; i < N; i++) {
    const s = JSON.parse(readFileSync(shardFile(population, block, i), 'utf8'));
    if (s.population !== population || s.block !== block || s.shard !== i || s.of !== N) throw Error(`SHARD_IDENTITY_MISMATCH:${population}:${block}:${i}`);
    scheduled += s.scheduled; for (const [k, v] of Object.entries(s.funnel)) funnel[k] = (funnel[k] ?? 0) + v; admitted.push(...s.admitted);
  }
  const accounted = Object.values(funnel).reduce((a, b) => a + b, 0);
  if (scheduled !== PER_BLOCK_H2 || accounted !== scheduled || (funnel.ADMITTED ?? 0) !== admitted.length) throw Error(`SHARDS_INCONSISTENT:${population}:${block}:${scheduled}:${accounted}`);
  return { block, scheduled, funnel, admitted: admitted.sort((a, b) => a.k - b.k) };
}

/** The ordered pool of one population from the blocks screened so far. Throws unless the screened blocks are a prefix of the allocation order. */
export function buildPool(population, target) {
  if (!POPULATIONS.includes(population)) throw Error('UNKNOWN_POPULATION:' + population);
  const planned = loadAllocation().populations[population].blocks, screened = planned.filter((b) => hasBlock(population, b));
  if (JSON.stringify(screened) !== JSON.stringify(planned.slice(0, screened.length))) throw Error('SCREENED_BLOCKS_ARE_NOT_A_PREFIX_OF_THE_ALLOCATION');
  const results = screened.map((b) => blockResult(population, b)), funnel = {}, dropped = {}, seenHash = new Map(), seenCoarse = new Map(), kept = [];
  for (const r of results) for (const [k, v] of Object.entries(r.funnel)) funnel[k] = (funnel[k] ?? 0) + v;
  const drop = (reason) => { dropped[reason] = (dropped[reason] ?? 0) + 1; };
  for (const r of results) for (const a of r.admitted) {
    const id = classId(population, r.block, a.k);
    if (seenHash.has(a.worldHash)) { drop('DUPLICATE_WORLD_HASH'); continue; }
    if (seenCoarse.has(a.coarse)) { drop('COARSE_DUPLICATE_WITHIN_POPULATION'); continue; }
    seenHash.set(a.worldHash, id); seenCoarse.set(a.coarse, id); kept.push({ id, block: r.block, ...a, family: familyOf(a.cell) });
  }
  const cap = Math.floor(CAP_FRACTION * target), byFamily = new Map(); for (const c of kept) byFamily.set(c.family, [...(byFamily.get(c.family) ?? []), c]);
  const capped = new Set(); for (const [, members] of byFamily) if (members.length > cap) for (const c of [...members].sort((x, y) => (sha(x.worldHash) < sha(y.worldHash) ? -1 : 1)).slice(cap)) capped.add(c.id);
  const pool = kept.filter((c) => !capped.has(c.id)); if (capped.size) dropped.FAMILY_CAP = capped.size;
  const share = new Map(); for (const c of pool) share.set(c.family, (share.get(c.family) ?? 0) + 1);
  return { population, target, cap, blocks: screened, planned, perBlock: results.map((r) => ({ block: r.block, admitted: r.admitted.length })), funnel, dropped, admittedRaw: results.reduce((a, r) => a + r.admitted.length, 0), pool,
    families: share.size, maxFamilyCount: Math.max(0, ...share.values()), enough: pool.length >= target };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i2-screen-aggregate.mjs')) {
  const [population, targetArg] = process.argv.slice(2), target = Number(targetArg);
  if (!(target > 0)) throw Error('USAGE: node i2-screen-aggregate.mjs <EXPLORATION|VALIDATION> <target> [--write]');
  const r = buildPool(population, target), summary = { population, target, cap: r.cap, blocksScreened: r.blocks.length, blocksPlanned: r.planned.length, admittedRaw: r.admittedRaw, dropped: r.dropped, poolSize: r.pool.length, families: r.families, maxFamilyCount: r.maxFamilyCount,
    maxFamilyShareOfTarget: r.maxFamilyCount / target, enough: r.enough, perBlockAdmitted: r.perBlock.map((b) => b.admitted), funnel: r.funnel };
  if (population === 'EXPLORATION') summary.reasons = r.pool.reduce((m, c) => ((m[c.reason] = (m[c.reason] ?? 0) + 1), m), {});
  console.log(JSON.stringify(summary, null, 1));
  if (process.argv.includes('--write')) { mkdirSync(POOL_DIR, { recursive: true }); writeFileSync(resolve(POOL_DIR, `pool-${population}.json`), JSON.stringify({ ...summary, pool: r.pool })); console.log(`wrote work/i2/pool/pool-${population}.json (${r.pool.length} classes; git-ignored)`); }
}
