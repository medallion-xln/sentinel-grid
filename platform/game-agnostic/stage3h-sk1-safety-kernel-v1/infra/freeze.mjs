// SK1 population freeze. For each population: the first <target> pool entries (admission order) whose class build is OK.
// No replacement of unfavourable classes. Writes, by exclusive create:
//   work/manifests/SK1_POPULATION_<P>.json   PRIVATE manifest (seeds, world hashes) — gitignored
//   evidence/SK1_REGISTRY_<P>.json           sealed public-class registry with opaque alias ids — tracked
//   evidence/SK1_POPULATION_<P>.json         public summary (alias -> origin family, counts, digests) — tracked
// Then re-checks both populations against the exclusion context and against each other, and locks VALIDATION outcomes.
//   node infra/freeze.mjs [--write]
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealRegistry, loadRegistry } from '../../stage3h-hw1-dev-v1/i2-registry.mjs';
import { loadSk1Exclusions, contamination } from './exclusions.mjs';
import { loadAllocation } from './allocator.mjs';
import { POOL_FILE } from './pool.mjs';
import { MANIFEST_SCHEMA, manifestPath, summaryPath, registryPath, classDir, classListDigest, lockOutcomes } from './population.mjs';
import { WORK, POPULATIONS, TARGET, MINIMUM, CAP_FRACTION, FAMILY_SPLIT_RULE, populationOfFamily, sha, readJ, fail, writeExclusive } from './common.mjs';

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
export function select(population) {
  const pool = readJ(POOL_FILE), entries = pool.pool[population], built = new Map(), files = readdirSync(classDir(population)).filter((n) => /^range-.*\.json$/.test(n)).sort();
  for (const n of files) for (const c of readJ(resolve(classDir(population), n)).classes) { if (built.has(c.id)) fail('CLASS_BUILT_TWICE:' + c.id); built.set(c.id, c); }
  const selected = [], excluded = {}; let cursor = 0;
  for (; cursor < entries.length && selected.length < TARGET[population]; cursor++) { const c = built.get(entries[cursor].id); if (!c) fail('POOL_ENTRY_NOT_BUILT:' + entries[cursor].id); if (c.status === 'OK') selected.push(c); else excluded[c.status] = (excluded[c.status] ?? 0) + 1; }
  return { pool, files, built, selected, excluded, usedPoolEntries: cursor, unusedPoolEntries: entries.length - cursor };
}
export function freeze(write) {
  const alloc = loadAllocation(), ctx = loadSk1Exclusions(), sel = Object.fromEntries(POPULATIONS.map((p) => [p, select(p)])), out = {};
  for (const p of POPULATIONS) { const s = sel[p]; if (s.selected.length < MINIMUM[p]) return { insufficient: true, population: p, classes: s.selected.length, minimum: MINIMUM[p], target: TARGET[p] };
    const bad = contamination(ctx, s.selected.map((c) => ({ id: c.id, block: c.block, worldHash: c.worldHash, fine: c.fine, coarse: c.coarse, memberHashes: c.members.map((m) => m.worldHash) }))); if (bad.length) fail(`POPULATION_CONTAMINATED:${p}:${JSON.stringify(bad.slice(0, 3))}`);
    if (s.selected.some((c) => populationOfFamily(c.family) !== p)) fail('FAMILY_ROUTED_TO_WRONG_POPULATION:' + p); }
  // cross-population separation: no shared family, world, member world or public class (fine or coarse)
  const E = sel.EXPLORATION.selected, V = sel.VALIDATION.selected, setOf = (xs, f) => new Set(xs.flatMap(f)), inter = (a, b) => [...a].filter((x) => b.has(x)).length;
  const cross = { sharedFamilies: inter(setOf(E, (c) => [c.family]), setOf(V, (c) => [c.family])), sharedBaseWorlds: inter(setOf(E, (c) => [c.worldHash]), setOf(V, (c) => [c.worldHash])),
    sharedMemberWorlds: inter(setOf(E, (c) => c.members.map((m) => m.worldHash)), setOf(V, (c) => c.members.map((m) => m.worldHash))), sharedFinePublicClasses: inter(setOf(E, (c) => [c.fine]), setOf(V, (c) => [c.fine])), sharedCoarsePublicClasses: inter(setOf(E, (c) => [c.coarse]), setOf(V, (c) => [c.coarse])) };
  if (Object.values(cross).some((v) => v !== 0)) fail('CROSS_POPULATION_LEAKAGE:' + JSON.stringify(cross));
  for (const p of POPULATIONS) { const s = sel[p], cap = Math.floor(CAP_FRACTION * TARGET[p]), fam = new Map(); for (const c of s.selected) fam.set(c.family, (fam.get(c.family) ?? 0) + 1);
    if (Math.max(...fam.values()) > cap) fail(`FAMILY_CAP_VIOLATED:${p}`);
    const members = s.selected.map((c) => c.members.length), dataFiles = s.files.map((n) => { const raw = readFileSync(resolve(classDir(p), n)); return { file: n, sha256: sha(raw), bytes: raw.length }; });
    const reg = sealRegistry(`SK1_${p}`, s.selected.map((c) => ({ id: c.id, source: `SK1_${p}`, fine: c.fine, coarse: c.coarse }))), digest = classListDigest(s.selected.map((c) => c.id));
    const manifest = { schema: MANIFEST_SCHEMA, authority: 'R0', stage: 'STAGE3H-SK1', population: p, labels: ['PRIVILEGED', 'GITIGNORED'], allocationHash: alloc.hash, exclusionRegistryHash: ctx.registryHash, classCount: s.selected.length, classListDigest: digest,
      classes: s.selected.map((c) => ({ id: c.id, block: c.block, k: c.k, seed: c.seed, worldHash: c.worldHash, cell: c.cell, family: c.family, fine: c.fine, coarse: c.coarse, members: c.members.length, membersDigest: sha(c.members.map((m) => m.worldHash).join('\n')), projectionSha: c.projectionSha })), dataFiles };
    const summary = { schema: 'SK1_POPULATION_SUMMARY_V1', authority: 'R0', stage: 'STAGE3H-SK1', population: p, labels: ['NO_SEED_IDENTITIES', 'OPAQUE_ALIASES'], frozenAt: new Date().toISOString(), allocationHash: alloc.hash, exclusionRegistryHash: ctx.registryHash,
      targetClasses: TARGET[p], minimumClasses: MINIMUM[p], classCount: s.selected.length, meetsTarget: s.selected.length >= TARGET[p], classListDigest: digest,
      selectionRule: 'admission order of the screened pool; strict index and every sealed registry before truth; global coarse public-class de-duplication; origin-family routing; family cap floor(0.05 x target) dropped in sha256 order; first <target> classes whose build is OK; NO replacement',
      familySplitRule: FAMILY_SPLIT_RULE, families: { count: fam.size, maxCount: Math.max(...fam.values()), cap, counts: Object.fromEntries([...fam].sort()) }, classes: s.selected.map((c) => ({ id: c.id, family: c.family })),
      screen: { blocksScreened: s.pool.blocksScreened.length, worldsScreened: s.pool.worldsScreened, admittedRaw: s.pool.admittedRaw, pooled: s.pool.summary[p].poolSize, usedPoolEntries: s.usedPoolEntries, unusedPoolEntries: s.unusedPoolEntries, funnel: p === 'VALIDATION' ? 'withheld (shared with EXPLORATION; see that summary)' : s.pool.funnel, dropped: s.pool.dropped },
      build: { excludedAtBuild: s.excluded, memberWorlds: members.reduce((a, b) => a + b, 0), membersPerClass: { min: Math.min(...members), median: median(members), max: Math.max(...members) } },
      crossPopulation: cross, dataFiles: dataFiles.map((d) => ({ file: d.file, sha256: d.sha256 })), registry: { file: `evidence/SK1_REGISTRY_${p}.json`, seal: reg.seal, count: reg.count }, outcomes: p === 'VALIDATION' ? 'LOCKED_UNTIL_ONE_PASS_RUN' : 'OPEN_FOR_DEVELOPMENT' };
    if (write) { mkdirSync(resolve(WORK, 'manifests'), { recursive: true }); writeExclusive(registryPath(p), reg); loadRegistry(registryPath(p)); summary.registry.sha256 = sha(readFileSync(registryPath(p)));
      writeExclusive(manifestPath(p), manifest); summary.manifestSha256 = sha(readFileSync(manifestPath(p))); writeExclusive(summaryPath(p), summary); }
    out[p] = { classCount: s.selected.length, meetsTarget: summary.meetsTarget, families: fam.size, maxFamilyCount: summary.families.maxCount, memberWorlds: summary.build.memberWorlds, excludedAtBuild: s.excluded, registrySeal: reg.seal };
  }
  if (write) out.lockedValidationFiles = lockOutcomes('VALIDATION');
  return { ...out, crossPopulation: cross, written: write };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { const r = freeze(process.argv.includes('--write')); console.log(JSON.stringify(r, null, 1)); if (r.insufficient) process.exitCode = 2; }
