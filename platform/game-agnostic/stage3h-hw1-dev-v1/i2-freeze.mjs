// H-W1 I-2 population freeze. Takes the ordered pool of a population, walks it in (block, k) order keeping the first <target> classes whose build is OK, and writes the manifest plus
// the sealed PCD registry of the population. Order is enforced: EXPLORATION freezes (and registers its PCDs) before any VALIDATION block is screened; VALIDATION freezes last and
// then removes every permission from the files that carry validation outcomes. A population below its target is INSUFFICIENT_POPULATION: nothing is written and the rule is not relaxed.
//   node i2-freeze.mjs <EXPLORATION|VALIDATION> <target> [--write]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE, loadAllocation } from './i2-allocator.mjs';
import { sealRegistry, loadRegistry } from './i2-registry.mjs';
import { MANIFEST_SCHEMA, manifestPath, classDir, classListDigest, lockValidationOutcomes, loadPopulation } from './i2-population.mjs';
import { CAP_FRACTION } from './i2-screen-aggregate.mjs';

export const MINIMUM = Object.freeze({ EXPLORATION: 1000, VALIDATION: 300 });
const sha = (b) => createHash('sha256').update(b).digest('hex'), registryPath = (p) => resolve(LANE, 'evidence', `I2_REGISTRY_${p}.json`), fileId = (dir, n) => { const raw = readFileSync(resolve(dir, n)); return { file: n, sha256: sha(raw), bytes: raw.length }; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const screenedValidation = () => existsSync(resolve(LANE, 'work/i2/screen')) && readdirSync(resolve(LANE, 'work/i2/screen')).some((n) => /^VALIDATION-/.test(n));

/** The first <target> OK classes of the pool in pool order. Throws if a pool entry that must be consulted has not been built yet. */
export function select(population, target) {
  const pool = JSON.parse(readFileSync(resolve(LANE, 'work/i2/pool', `pool-${population}.json`), 'utf8')), built = new Map(), files = readdirSync(classDir(population)).filter((n) => /^range-.*\.json$/.test(n)).sort();
  for (const n of files) for (const c of JSON.parse(readFileSync(resolve(classDir(population), n), 'utf8')).classes) { if (built.has(c.id)) throw Error('CLASS_BUILT_TWICE:' + c.id); built.set(c.id, c); }
  const selected = [], excluded = {}; let cursor = 0;
  for (; cursor < pool.pool.length && selected.length < target; cursor++) { const e = pool.pool[cursor], c = built.get(e.id); if (!c) throw Error('POOL_ENTRY_NOT_BUILT:' + e.id); if (c.status === 'OK') selected.push(c); else excluded[c.status] = (excluded[c.status] ?? 0) + 1; }
  const consumed = new Set(pool.pool.slice(0, cursor).map((e) => e.id)), builtUnused = [...built.keys()].filter((id) => !consumed.has(id));
  return { pool, built, files, selected, excluded, usedPoolEntries: cursor, unusedPoolEntries: pool.pool.length - cursor, builtUnused };
}

export function freeze(population, target, write) {
  const alloc = loadAllocation(), min = MINIMUM[population]; if (!min) throw Error('UNKNOWN_POPULATION:' + population);
  if (population === 'EXPLORATION' && screenedValidation()) throw Error('VALIDATION_ALREADY_SCREENED_BEFORE_EXPLORATION_REGISTERED');
  if (population === 'VALIDATION') { const m = JSON.parse(readFileSync(manifestPath('EXPLORATION'), 'utf8')); if (sha(readFileSync(registryPath('EXPLORATION'))) !== m.registry.sha256) throw Error('EXPLORATION_REGISTRY_CHANGED_SINCE_FREEZE'); }
  if (target < min) throw Error(`TARGET_BELOW_MINIMUM:${target}<${min}`);
  const s = select(population, target), cap = Math.floor(CAP_FRACTION * target), fam = new Map(); for (const c of s.selected) fam.set(c.family, (fam.get(c.family) ?? 0) + 1);
  if (s.selected.length < target) return { insufficient: true, population, target, minimum: min, classes: s.selected.length, excluded: s.excluded, poolSize: s.pool.pool.length };
  const maxFamily = Math.max(...fam.values()); if (maxFamily > cap) throw Error(`FAMILY_CAP_VIOLATED:${maxFamily}>${cap}`);
  let crossPopulation = null;
  if (population === 'VALIDATION') { // every member world of every validation class against every member world of the frozen exploration population (hashes only)
    const ex = new Set(loadPopulation('EXPLORATION').classes.flatMap((c) => c.members.map((m) => m.worldHash))), overlaps = s.selected.flatMap((c) => c.members).filter((m) => ex.has(m.worldHash)).length;
    if (overlaps) throw Error('MEMBER_WORLD_HASH_OVERLAP_WITH_EXPLORATION:' + overlaps); crossPopulation = { explorationMemberWorlds: ex.size, validationMemberWorlds: s.selected.reduce((a, c) => a + c.members.length, 0), overlaps };
  }
  const members = [...s.built.values()].filter((c) => c.status === 'OK').map((c) => c.members.length), twinsDropped = {};
  for (const c of s.built.values()) for (const [k, v] of Object.entries(c.twinsDropped ?? {})) twinsDropped[k] = (twinsDropped[k] ?? 0) + v;
  const reg = sealRegistry(`HW1_${population}`, s.selected.map((c) => ({ id: c.id, source: `HW1_${population}`, fine: c.fine, coarse: c.coarse })));
  const manifest = { schema: MANIFEST_SCHEMA, authority: 'R0', population, frozenAt: new Date().toISOString(), allocationHash: alloc.hash, targetClasses: target, minimumClasses: min, classCount: s.selected.length, meetsMinimum: s.selected.length >= min,
    selectionRule: 'ordered pool (block, k); strict world index + sealed PCD registries before truth; coarse-PCD dedupe in (block, k) order; origin-family cap floor(0.05 * target) dropped in sha256(worldHash) order; first <target> classes whose build is OK',
    screen: { blocks: s.pool.blocks, perBlockAdmitted: s.pool.perBlockAdmitted, admittedRaw: s.pool.admittedRaw, funnel: s.pool.funnel, dropped: s.pool.dropped, poolSize: s.pool.poolSize, usedPoolEntries: s.usedPoolEntries, unusedPoolEntries: s.unusedPoolEntries },
    build: { excludedAtBuild: s.excluded, builtButUnused: s.builtUnused.length, classesBuilt: s.built.size, labelledWorldsBuilt: [...s.built.values()].reduce((a, c) => a + (c.members?.length ?? 0), 0), twinsDropped, membersPerClass: { min: Math.min(...members), median: median(members), max: Math.max(...members) } },
    crossPopulation, families: { count: fam.size, maxCount: maxFamily, maxShare: maxFamily / s.selected.length, cap, definition: 'topology/resource-role/objective: the first three parts of the schedule cell shape/roles/objective/band/level' },
    classListDigest: classListDigest(s.selected.map((c) => c.id)),
    classes: s.selected.map((c) => ({ id: c.id, block: c.block, k: c.k, seed: c.seed, worldHash: c.worldHash, cell: c.cell, family: c.family, fine: c.fine, coarse: c.coarse, members: c.members.length, membersDigest: sha(c.members.map((m) => m.worldHash).join('\n')), projectionSha: c.projectionSha })),
    dataFiles: s.files.map((n) => fileId(classDir(population), n)), registry: { file: `evidence/I2_REGISTRY_${population}.json`, seal: reg.seal, count: reg.count } };
  if (write) {
    writeExclusive(registryPath(population), reg); loadRegistry(registryPath(population)); manifest.registry.sha256 = sha(readFileSync(registryPath(population)));
    writeExclusive(manifestPath(population), manifest); if (population === 'VALIDATION') manifest.lockedFiles = lockValidationOutcomes();
  }
  return { population, target, classCount: manifest.classCount, meetsMinimum: manifest.meetsMinimum, families: manifest.families, build: manifest.build, screen: { ...manifest.screen, funnel: population === 'EXPLORATION' ? manifest.screen.funnel : 'counts-only-withheld' }, registry: manifest.registry, written: write, lockedFiles: manifest.lockedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i2-freeze.mjs')) {
  const [population, targetArg] = process.argv.slice(2), target = Number(targetArg);
  if (!(target > 0)) throw Error('USAGE: node i2-freeze.mjs <EXPLORATION|VALIDATION> <target> [--write]');
  const r = freeze(population, target, process.argv.includes('--write')); console.log(JSON.stringify(r, null, 1)); if (r.insufficient) process.exitCode = 2;
}
