// STAGE3H_STRUCTURED_EXCLUSION_INDEX_V1: fail-closed loader and allocator preflight over the EXACT structured records
// consumed by stage3h-safety-feasibility-v1/closure/exclusions.mjs. Every record is validated (schema, canonical
// identity formats, uniqueness, declared counts and digests, cross-record references) and ANY inconsistency throws.
// No repository text search. Overlapping identities across sources are kept (each source is recorded), never dropped.
// A future namespace allocator must call loadStrictIndex() and preflightNamespace()/preflightWorlds() and refuse on
// any failure or exception.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadExclusionIndex, EXCLUSION_FILES, BLOCK } from '../../stage3h-safety-feasibility-v1/closure/exclusions.mjs';
import { EXCLUDED_BLOCKS } from '../../stage3h-owner-governed-v1/allocate-namespaces-v4.mjs';

const GA_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const INDEX_FORMAT = 'STAGE3H_STRUCTURED_EXCLUSION_INDEX_V1';
const HEX64 = /^[0-9a-f]{64}$/, fail = (m) => { throw Error('EXCLUSION_INDEX_INVALID:' + m); }, check = (v, m) => { if (!v) fail(m); };
const seed12 = (s) => Number.isSafeInteger(s) && s > 0 && String(s).length === 12;

export function loadStrictIndex(ga = GA_DEFAULT) {
  const read = (p) => { check(existsSync(resolve(ga, p)), 'MISSING_FILE:' + p); return readFileSync(resolve(ga, p)); };
  const J = (p) => { try { return JSON.parse(read(p).toString('utf8')); } catch (e) { if (String(e.message).startsWith('EXCLUSION_INDEX_INVALID')) throw e; fail('UNPARSEABLE:' + p); } };
  const uniqueHex = (xs, name) => { check(Array.isArray(xs) && xs.every((h) => typeof h === 'string' && HEX64.test(h)), 'NON_CANONICAL_HASH:' + name); check(new Set(xs).size === xs.length, 'DUPLICATE_HASH:' + name); };
  // prior registered and spent identities
  const prior = J(EXCLUSION_FILES.prior);
  check(prior.schema === 'STAGE3H_OWNER_GOVERNED_PRIOR_WORLD_EXCLUSIONS_V1', 'PRIOR_SCHEMA'); uniqueHex(prior.priorWorldHashes, 'prior');
  check(prior.priorWorldHashes.length === prior.executedCount + prior.developmentCount, 'PRIOR_COUNT'); check(prior.priorSeeds.every(seed12), 'PRIOR_SEED_FORMAT');
  // registered namespaces
  const alloc = J(EXCLUSION_FILES.v4Allocation), v4Blocks = Object.values(alloc.namespaces).map((b) => { check(Number.isSafeInteger(b) && b % BLOCK === 0 && String(b).length === 12, 'V4_BLOCK_FORMAT'); return b / BLOCK; });
  const runs = resolve(ga, EXCLUSION_FILES.v4Runs), v4 = [];
  for (const r of ['A', 'B']) { check(existsSync(resolve(runs, r)), 'MISSING_V4_RUN:' + r); for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) v4.push(...JSON.parse(readFileSync(resolve(runs, r, f), 'utf8'))); }
  uniqueHex(v4.map((e) => e.worldHash), 'v4'); check(v4.every((e) => seed12(e.seed) && v4Blocks.includes(Math.floor(e.seed / BLOCK))), 'V4_SEED_OUTSIDE_ALLOCATION');
  // DEV identities
  const devBytes = read(EXCLUSION_FILES.devIdentities), dev = JSON.parse(devBytes.toString('utf8'));
  check(dev.schema === 'STAGE3H_DEV_WORLD_IDENTITIES_V1', 'DEV_SCHEMA');
  for (const b of [951, 952]) check(dev.blocks[b] && dev.blocks[b].excludedRange[0] === b * BLOCK && dev.blocks[b].excludedRange[1] === (b + 1) * BLOCK - 1, 'DEV_BLOCK_' + b);
  check(Array.isArray(dev.devOpenSeeds) && dev.devOpenSeeds.length === 6 && dev.devOpenSeeds.every(seed12), 'DEV_OPEN_SEEDS');
  const devBase = [];
  for (const [name, s] of Object.entries(dev.sets)) {
    check(s.worldByIdx.length === s.scheduled, 'DEV_SCHEDULED:' + name);
    const adm = s.worldByIdx.filter((x) => !String(x).startsWith('REJECTED:')); check(adm.length === s.admitted, 'DEV_ADMITTED:' + name);
    uniqueHex(adm, 'dev:' + name); devBase.push(...adm);
  }
  uniqueHex(devBase, 'devAll');
  // diagnostic ledger
  const ledger = J(EXCLUSION_FILES.diagnostic);
  check(ledger.schema === 'STAGE3H_DIAGNOSTIC_WORLD_EXCLUSIONS_V1' && ledger.status === 'SPENT_DIAGNOSTIC', 'LEDGER_SCHEMA');
  uniqueHex(ledger.constructedWorldHashes, 'ledger');
  check(createHash('sha256').update(JSON.stringify(ledger.constructedWorldHashes)).digest('hex') === ledger.constructedWorldHashesSha256, 'LEDGER_DIGEST');
  check(ledger.devBaseWorlds.sha256 === createHash('sha256').update(devBytes).digest('hex') && ledger.devBaseWorlds.worlds === devBase.length, 'LEDGER_DEV_REFERENCE');
  check(JSON.stringify(ledger.seedExclusions.wholeBlocks) === JSON.stringify([951, 952]) && JSON.stringify(ledger.seedExclusions.devOpenSeeds) === JSON.stringify(dev.devOpenSeeds), 'LEDGER_SEED_EXCLUSIONS');
  // merged index (the consumed structure) plus provenance of every identity, overlaps kept
  const index = loadExclusionIndex(ga), sources = new Map(), tag = (h, s) => { if (!sources.has(h)) sources.set(h, []); sources.get(h).push(s); };
  prior.priorWorldHashes.forEach((h) => tag(h, 'PRIOR')); v4.forEach((e) => tag(e.worldHash, 'V4_SEALED')); devBase.forEach((h) => tag(h, 'DEV_BASE')); ledger.constructedWorldHashes.forEach((h) => tag(h, 'DIAGNOSTIC_CONSTRUCTED'));
  check(index.worlds.size === sources.size, 'INDEX_WORLD_COUNT_MISMATCH');
  const blocks = [...index.blocks.keys()].sort((a, b) => a - b);
  for (const b of [...Object.keys(EXCLUDED_BLOCKS).map(Number), ...v4Blocks, 951, 952]) check(index.blocks.has(b), 'INDEX_MISSING_BLOCK_' + b);
  return { format: INDEX_FORMAT, index, sources, counts: { priorWorlds: prior.priorWorldHashes.length, priorSeeds: prior.priorSeeds.length, v4SealedWorlds: v4.length, devBaseWorlds: devBase.length,
    diagnosticConstructedWorlds: ledger.constructedWorldHashes.length, devOpenSeeds: dev.devOpenSeeds.length, excludedBlocks: blocks, distinctExcludedWorlds: index.worlds.size, excludedSeeds: index.seeds.size,
    multiSourceWorlds: [...sources.values()].filter((s) => s.length > 1).length } };
}

/** Every block a seed range touches is checked (not only the endpoints), plus every explicitly excluded seed. */
export function preflightNamespace(strict, { base, count }) {
  if (!seed12(base) || !Number.isSafeInteger(count) || count < 1 || !seed12(base + count - 1)) return { ok: false, failures: ['INVALID_RANGE'] };
  const failures = [];
  for (let b = Math.floor(base / BLOCK); b <= Math.floor((base + count - 1) / BLOCK); b++) if (strict.index.blocks.has(b)) failures.push(`EXCLUDED_BLOCK_${b}:${strict.index.blocks.get(b)}`);
  for (const [s, why] of strict.index.seeds) if (s >= base && s < base + count) failures.push(`EXCLUDED_SEED_${s}:${why}`);
  return { ok: failures.length === 0, failures };
}
/** World admission preflight: any non-canonical hash, or any recorded identity, fails closed. */
export function preflightWorlds(strict, hashes) {
  const failures = hashes.flatMap((h) => (typeof h !== 'string' || !HEX64.test(h) ? [`NON_CANONICAL_HASH:${String(h).slice(0, 16)}`] : strict.sources.has(h) ? [`EXCLUDED_WORLD:${strict.sources.get(h).join('+')}`] : []));
  return { ok: failures.length === 0, failures };
}
