// Consolidated structured exclusion index for future confirmatory namespace and world validation.
// Consumes ONLY structured records (no repository text search):
//   stage3h-owner-governed-v1/evidence/prior-world-exclusions.json         prior executed/development world hashes and seeds
//   stage3h-owner-governed-v1/allocate-namespaces-v4.mjs EXCLUDED_BLOCKS   blocks 731/732 (registration 0364164c)
//   stage3h-owner-governed-v1/registration/NAMESPACE_ALLOCATION_V4.json    blocks consumed by registration 7c41ba89
//   stage3h-owner-governed-v1/runs/7c41ba89c5c63489/{A,B}/*.ledger.json    worldHash/seed fields only (no outcome)
//   stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json   DEV blocks 951/952, OPEN seeds, DEV base worlds
//   stage3h-safety-feasibility-v1/evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json   every constructed diagnostic world
// A future registration must bind this module and these files and call validateSeedRange() and excludedWorld() in its
// pre-allocation and pre-admission gates. The frozen V4 allocator does not consume this index.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EXCLUDED_BLOCKS } from '../../stage3h-owner-governed-v1/allocate-namespaces-v4.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GA = resolve(HERE, '../..');
export const BLOCK = 1_000_000_000;
export const EXCLUSION_FILES = Object.freeze({
  prior: 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json',
  v4Allocation: 'stage3h-owner-governed-v1/registration/NAMESPACE_ALLOCATION_V4.json',
  v4Runs: 'stage3h-owner-governed-v1/runs/7c41ba89c5c63489',
  devIdentities: 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json',
  diagnostic: 'stage3h-safety-feasibility-v1/evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json',
});

export function loadExclusionIndex(ga = GA) {
  const J = (p) => JSON.parse(readFileSync(resolve(ga, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(ga, p))).digest('hex');
  const blocks = new Map(), seeds = new Map(), worlds = new Map(), add = (m, k, why) => { if (!m.has(k)) m.set(k, why); };
  const prior = J(EXCLUSION_FILES.prior);
  for (const h of prior.priorWorldHashes) add(worlds, h, 'PRIOR_EXECUTED_OR_DEVELOPMENT_WORLD');
  for (const s of prior.priorSeeds) add(seeds, s, 'PRIOR_SEED');
  for (const b of Object.keys(EXCLUDED_BLOCKS).map(Number)) add(blocks, b, 'REGISTRATION_0364164C_BLOCK');
  for (const base of Object.values(J(EXCLUSION_FILES.v4Allocation).namespaces)) add(blocks, base / BLOCK, 'REGISTRATION_7C41BA89_CONSUMED_BLOCK');
  const runs = resolve(ga, EXCLUSION_FILES.v4Runs);
  for (const r of ['A', 'B']) for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) for (const e of JSON.parse(readFileSync(resolve(runs, r, f), 'utf8'))) { add(worlds, e.worldHash, 'V4_SEALED_WORLD'); add(seeds, e.seed, 'V4_SEALED_SEED'); }
  const dev = J(EXCLUSION_FILES.devIdentities);
  for (const b of Object.keys(dev.blocks).map(Number)) add(blocks, b, 'SPENT_DEV_BLOCK');
  for (const s of dev.devOpenSeeds) add(seeds, s, 'SPENT_DEV_OPEN_SEED');
  for (const s of Object.values(dev.sets)) for (const x of s.worldByIdx) if (!x.startsWith('REJECTED:')) add(worlds, x, 'SPENT_DEV_BASE_WORLD');
  const diag = J(EXCLUSION_FILES.diagnostic);
  for (const b of diag.seedExclusions.wholeBlocks) add(blocks, b, 'SPENT_DEV_BLOCK');
  for (const h of diag.constructedWorldHashes) add(worlds, h, 'SPENT_DIAGNOSTIC_CONSTRUCTED_WORLD');
  return { blocks, seeds, worlds, sources: Object.fromEntries(Object.entries(EXCLUSION_FILES).filter(([k]) => k !== 'v4Runs').map(([k, p]) => [k, { path: p, sha256: fsha(p) }])) };
}

/** Failures for a proposed seed range [base, base + count): any seed in an excluded whole block or on an excluded seed list. */
export function validateSeedRange(index, base, count) {
  if (!Number.isSafeInteger(base) || !Number.isSafeInteger(count) || count < 1) return { ok: false, failures: ['INVALID_RANGE'] };
  const failures = new Set();
  for (const b of new Set([Math.floor(base / BLOCK), Math.floor((base + count - 1) / BLOCK)])) if (index.blocks.has(b)) failures.add(`EXCLUDED_BLOCK_${b}:${index.blocks.get(b)}`);
  for (const [s, why] of index.seeds) if (s >= base && s < base + count) failures.add(`EXCLUDED_SEED:${why}`);
  return { ok: failures.size === 0, failures: [...failures] };
}
/** Exclusion reason for a world hash, or null. */
export const excludedWorld = (index, hash) => index.worlds.get(hash) ?? null;
