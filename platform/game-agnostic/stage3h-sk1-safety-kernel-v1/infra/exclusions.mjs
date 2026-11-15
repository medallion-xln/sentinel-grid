// SK1 Gate 0.1 — tracked, fail-closed exclusion registry for every spent Stage 3H population, and its loader.
// The registry (infra/exclusion-registry.json) is the single list of what may never be treated as fresh:
//   * forbidden seed blocks, each with the reason it is spent, retired or rejected
//   * the sealed public-class (PCD) registries of every earlier population, pinned by file sha256 AND registry seal
//   * the strict structured exclusion index (worlds, seeds and blocks of V4, DEV and diagnostic work)
// loadSk1Exclusions() is the ONLY way SK1 code obtains an exclusion context. It throws on a missing, altered or
// internally inconsistent record: there is no partial or degraded mode. The allocator, the screen, the class builder,
// the population freeze and the runner all call it.
//   /opt/homebrew/bin/node infra/exclusions.mjs build [--write]   compose the registry (exclusive create)
//   /opt/homebrew/bin/node infra/exclusions.mjs verify            load it fail-closed and print the bound identities
import { resolve } from 'node:path';
import { loadStrictIndex, preflightNamespace, preflightWorlds } from '../../stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs';
import { loadRegistry, registryIndex, matchPcd } from '../../stage3h-hw1-dev-v1/i2-registry.mjs';
import { LANE, GA, BLOCK, PER_BLOCK, sha, fileSha, readJ, fail, writeExclusive, exists } from './common.mjs';

export const REGISTRY_FILE = resolve(LANE, 'infra/exclusion-registry.json'), REGISTRY_SCHEMA = 'SK1_EXCLUSION_REGISTRY_V1';
const span = (blocks, reason) => Object.fromEntries(blocks.map((b) => [b, reason]));
const FORBIDDEN_BLOCKS = Object.freeze({
  ...span([731, 732], 'REGISTRATION_0364164C'), ...span([733, 734], 'REGISTRATION_7C41BA89'),
  950: 'EXCLUSION_INTEGRITY_TEXT_HIT', 951: 'SPENT_DEV_FRESH_EXPLORE', 952: 'SPENT_DEV_FRESH_CHECK', 967: 'REPOSITORY_TEXT_HIT', 983: 'REPOSITORY_TEXT_HIT',
  ...span([961, 962, 963, 964, 965, 966, 968, 969, 970, 971, 972, 973, 974, 975, 976], 'SPENT_HW1_EXPLORATION'), ...span([977, 978, 979, 980, 981, 982, 984, 985, 986, 987, 988], 'SPENT_HW1_VALIDATION'),
  ...span([941, 942, 943, 944, 945, 946, 947, 948, 949, 953, 954, 955, 956, 957, 958, 959], 'SPENT_HW4_EXPLORATION'), ...span([960, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999], 'SPENT_HW4_VALIDATION'),
  ...span([901, 902, 903, 904, 905, 906, 907, 908, 909, 910], 'SPENT_HW4B_SCREENED_OBSERVATIONAL'), ...span([911, 912, 913, 914], 'RETIRED_HW4B_RESERVE_NEVER_GENERATED'),
});
const SEALED = Object.freeze([
  ['STUDIED_341', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_STUDIED_341.json'], ['DEV_H2_BASE_WORLDS', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_DEV_H2.json'],
  ['HW1_EXPLORATION', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_EXPLORATION.json'], ['HW1_VALIDATION', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_VALIDATION.json'],
  ['HW4_EXPLORATION', 'stage3h-hw4-value-band-v1/evidence/HW4_REGISTRY_EXPLORATION.json'], ['HW4_VALIDATION', 'stage3h-hw4-value-band-v1/evidence/HW4_REGISTRY_VALIDATION.json'],
  ['HW4B_SCREENED_DEV', 'stage3h-hw4-value-band-v1/evidence/HW4B_REGISTRY_SCREENED.json'],
]);
const hashOf = (rec) => { const { hash, ...rest } = rec; return sha(JSON.stringify(rest)); };

export function buildRegistry() {
  const strict = loadStrictIndex();
  const rec = { schema: REGISTRY_SCHEMA, authority: 'R0', stage: 'STAGE3H-SK1 Gate 0.1', failClosed: true,
    statement: 'Every block and every sealed registry listed here is SPENT, RETIRED or REJECTED. None of it may be allocated, screened, admitted or described as fresh by any later stage.',
    forbiddenBlocks: FORBIDDEN_BLOCKS,
    hw4bInterruptedScreening: { blocks: '901-910', status: 'SPENT_OBSERVATIONAL_EVIDENCE', screenedWorlds: 63840, admittedIdentities: 885, poolEntries: 837, registry: 'HW4B_SCREENED_DEV',
      rule: 'Comparator outcomes of these worlds were read by the frozen screening rule. They are never fresh, whether or not any candidate policy evaluated them. The 837-entry pool may not be promoted or reused.',
      retiredReserve: { blocks: '911-914', status: 'RETIRED_NEVER_GENERATED', rule: 'Retired prospectively with the closed H-W4B lane so that no later stage can treat an allocated-but-unused reserve as available.' } },
    sealedRegistries: SEALED.map(([name, rel]) => { const reg = loadRegistry(resolve(GA, rel)); if (reg.name !== name) fail(`REGISTRY_NAME_UNEXPECTED:${rel}`); return { name, file: rel, sha256: fileSha(resolve(GA, rel)), seal: reg.seal, count: reg.count }; }),
    strictIndex: { loader: 'stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs', format: strict.format, counts: strict.counts },
    enforcement: { loader: 'infra/exclusions.mjs loadSk1Exclusions()', consumers: ['infra/allocator.mjs', 'infra/screen.mjs', 'infra/build-class.mjs', 'infra/freeze.mjs', 'infra/run.mjs'], seedRule: `a block b covers the 12-digit seeds b*${BLOCK} .. b*${BLOCK}+${PER_BLOCK - 1}` },
    identityRule: 'New tracked records use opaque aliases. A class id of the form population:block:k encodes the seed and is not used.' };
  rec.hash = hashOf(rec); return rec;
}

/** Fail-closed exclusion context. extraRegistries: sealed registries created later in THIS lane (absolute paths). */
export function loadSk1Exclusions({ registryFile = REGISTRY_FILE, extraRegistries = [] } = {}) {
  if (!exists(registryFile)) fail('SK1_EXCLUSION_REGISTRY_MISSING');
  let rec; try { rec = readJ(registryFile); } catch { fail('SK1_EXCLUSION_REGISTRY_UNREADABLE'); }
  if (rec.schema !== REGISTRY_SCHEMA || rec.failClosed !== true || rec.hash !== hashOf(rec)) fail('SK1_EXCLUSION_REGISTRY_TAMPERED');
  // the tracked record must still say what this code requires: no entry may have been dropped
  for (const [b, why] of Object.entries(FORBIDDEN_BLOCKS)) if (rec.forbiddenBlocks[b] !== why) fail(`SK1_EXCLUSION_REGISTRY_MISSING_BLOCK:${b}`);
  if (rec.sealedRegistries.length !== SEALED.length) fail('SK1_EXCLUSION_REGISTRY_SEALED_SET_CHANGED');
  const regs = rec.sealedRegistries.map((e, i) => {
    if (e.name !== SEALED[i][0] || e.file !== SEALED[i][1]) fail(`SK1_EXCLUSION_REGISTRY_SEALED_SET_CHANGED:${e.name}`);
    const p = resolve(GA, e.file); if (!exists(p)) fail(`SEALED_REGISTRY_MISSING:${e.name}`);
    if (fileSha(p) !== e.sha256) fail(`SEALED_REGISTRY_FILE_CHANGED:${e.name}`);
    const reg = loadRegistry(p); if (reg.seal !== e.seal || reg.count !== e.count) fail(`SEALED_REGISTRY_SEAL_CHANGED:${e.name}`); return reg;
  });
  for (const p of extraRegistries) regs.push(loadRegistry(p));
  const strict = loadStrictIndex(); // throws EXCLUSION_INDEX_INVALID on any inconsistency
  if (JSON.stringify(strict.counts) !== JSON.stringify(rec.strictIndex.counts)) fail('STRICT_INDEX_COUNTS_CHANGED');
  return { registry: rec, registryHash: rec.hash, strict, regs, pcdIndex: registryIndex(regs), forbidden: rec.forbiddenBlocks };
}

/** Why a block may not be used. Empty array = usable. */
export function blockFailures(ctx, block) {
  if (!Number.isSafeInteger(block) || String(block * BLOCK).length !== 12) return ['NOT_A_12_DIGIT_BLOCK'];
  const out = []; if (ctx.forbidden[block]) out.push(`FORBIDDEN_BLOCK_${block}:${ctx.forbidden[block]}`);
  out.push(...preflightNamespace(ctx.strict, { base: block * BLOCK, count: PER_BLOCK }).failures); return out;
}
/** World / public-class admission. Same contract as the frozen H-W1 gate; any recorded identity rejects. */
export function admission(ctx, worldHash, p) {
  const w = preflightWorlds(ctx.strict, [worldHash]); if (!w.ok) return { ok: false, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] };
  const m = matchPcd(ctx.pcdIndex, p); if (m.length) return { ok: false, reason: m.some((x) => x.startsWith('FINE:')) ? 'PCD_FINE_MATCH' : 'PCD_COARSE_MATCH', detail: m[0] };
  return { ok: true };
}
/** Re-check a whole population against the exclusion context. Returns the list of contaminated entries (empty = clean).
 *  Used by the freeze and again by the runner, so a contaminated manifest cannot be evaluated. */
export function contamination(ctx, classes) {
  const bad = [];
  for (const c of classes) {
    const f = blockFailures(ctx, c.block); if (f.length) { bad.push({ id: c.id, reason: f[0].split(':')[0].startsWith('FORBIDDEN') ? 'FORBIDDEN_BLOCK' : 'EXCLUDED_NAMESPACE', detail: f[0] }); continue; }
    const hashes = [c.worldHash, ...(c.memberHashes ?? [])], w = preflightWorlds(ctx.strict, hashes); if (!w.ok) { bad.push({ id: c.id, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] }); continue; }
    const m = matchPcd(ctx.pcdIndex, { fine: c.fine, coarse: c.coarse }).filter((x) => !(c.ownRegistry && x.includes(`${c.ownRegistry}:${c.id}`))); if (m.length) bad.push({ id: c.id, reason: 'PCD_MATCH', detail: m[0] });
  }
  return bad;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'build') { const rec = buildRegistry(); console.log(JSON.stringify({ hash: rec.hash, forbiddenBlocks: Object.keys(rec.forbiddenBlocks).length, sealedRegistries: rec.sealedRegistries.map((r) => `${r.name}:${r.count}`), strict: rec.strictIndex.counts.distinctExcludedWorlds }, null, 1));
    if (process.argv.includes('--write')) { writeExclusive(REGISTRY_FILE, rec); loadSk1Exclusions(); console.log('written infra/exclusion-registry.json'); } }
  else if (mode === 'verify') { const ctx = loadSk1Exclusions(); console.log(JSON.stringify({ registryHash: ctx.registryHash, forbiddenBlocks: Object.keys(ctx.forbidden).length, sealed: ctx.pcdIndex.seals, strictCounts: ctx.strict.counts }, null, 1)); console.log('SK1_EXCLUSIONS_LOADED_FAIL_CLOSED'); }
  else fail('USAGE: node infra/exclusions.mjs build [--write] | verify');
}
