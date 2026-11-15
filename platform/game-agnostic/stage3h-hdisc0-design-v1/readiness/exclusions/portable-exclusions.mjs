// HDISC_PORTABLE_EXCLUSIONS_V1 — a portable, fail-closed exclusion loader for a FUTURE allocator.
//
// What it is
//   A prospective re-statement of the exclusion semantics of
//     stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs   loadSuccessorExclusions()
//     stage3h-sk1-safety-kernel-v1/infra/exclusions.mjs          loadSk1Exclusions(), blockFailures, admission, contamination
//     stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs   loadStrictIndex(), preflightNamespace, preflightWorlds
//     stage3h-safety-feasibility-v1/closure/exclusions.mjs       loadExclusionIndex()
//     stage3h-hw1-dev-v1/i2-registry.mjs                         validateRegistry, registryIndex, matchPcd
//   that imports ONLY node built-ins and reads ONLY tracked records. It therefore imports and enforces from a clean
//   checkout of committed source, with no custody-protected file and no privileged local data present.
//
// What it is NOT
//   It does not repair, replace or modify the historical loaders, which are unchanged and still cannot be imported
//   from a clean checkout. Every past population was gated by the historical loaders, not by this file.
//
// Why the historical loaders are not portable: they need exactly two CONSTANTS, each exported by a module whose static
// import graph reaches custody-protected source:
//   EXCLUDED_BLOCKS  (blocks 731 and 732)  from stage3h-owner-governed-v1/allocate-namespaces-v4.mjs  -> connector.mjs -> protected
//   PCD_VERSION      ('HW1_PCD_V1')        from stage3h-hw1-dev-v1/i2-pcd.mjs                         -> transforms.mjs -> protected
// Both are embedded below as literals. readiness/exclusions/exclusions.test.mjs asserts, in a working tree where the
// historical modules can be imported, that the literals equal the originals and that the two contexts are identical.
//
// Error messages are the historical ones, so a caller cannot tell the loaders apart by their refusals.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const LOADER_ID = 'HDISC_PORTABLE_EXCLUSIONS_V1', SUCCESSOR_OF = 'STAGE3H-SK1';
const HERE = dirname(fileURLToPath(import.meta.url));
export const GA_DEFAULT = resolve(HERE, '../../..'); // platform/game-agnostic

// ---- embedded constants (each asserted equal to its historical source by the equivalence test)
export const BLOCK = 1_000_000_000, PER_BLOCK = 12768;
export const EXCLUDED_BLOCKS_0364164C = Object.freeze([731, 732]);
export const PCD_VERSION = 'HW1_PCD_V1', PCD_REGISTRY_SCHEMA = 'STAGE3H_HW1_I2_PCD_REGISTRY_V1';
export const SK1_REGISTRY_SCHEMA = 'SK1_EXCLUSION_REGISTRY_V1', SK1_LEDGER_SCHEMA = 'SK1_SPEND_LEDGER_V1', INDEX_FORMAT = 'STAGE3H_STRUCTURED_EXCLUSION_INDEX_V1';
export const SK1_LANE_REL = 'stage3h-sk1-safety-kernel-v1', REGISTRY_REL = `${SK1_LANE_REL}/infra/exclusion-registry.json`, LEDGER_REL = `${SK1_LANE_REL}/evidence/SK1_SPEND_LEDGER.json`;
export const EXCLUSION_FILES = Object.freeze({
  prior: 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json',
  v4Allocation: 'stage3h-owner-governed-v1/registration/NAMESPACE_ALLOCATION_V4.json',
  v4Runs: 'stage3h-owner-governed-v1/runs/7c41ba89c5c63489',
  devIdentities: 'stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_WORLD_IDENTITIES.json',
  diagnostic: 'stage3h-safety-feasibility-v1/evidence/closure/DIAGNOSTIC_WORLD_EXCLUSIONS.json',
});
const span = (blocks, reason) => Object.fromEntries(blocks.map((b) => [b, reason]));
/** The blocks the SK1 registry must still list, with their reasons (infra/exclusions.mjs FORBIDDEN_BLOCKS). */
export const REQUIRED_FORBIDDEN_BLOCKS = Object.freeze({
  ...span([731, 732], 'REGISTRATION_0364164C'), ...span([733, 734], 'REGISTRATION_7C41BA89'),
  950: 'EXCLUSION_INTEGRITY_TEXT_HIT', 951: 'SPENT_DEV_FRESH_EXPLORE', 952: 'SPENT_DEV_FRESH_CHECK', 967: 'REPOSITORY_TEXT_HIT', 983: 'REPOSITORY_TEXT_HIT',
  ...span([961, 962, 963, 964, 965, 966, 968, 969, 970, 971, 972, 973, 974, 975, 976], 'SPENT_HW1_EXPLORATION'), ...span([977, 978, 979, 980, 981, 982, 984, 985, 986, 987, 988], 'SPENT_HW1_VALIDATION'),
  ...span([941, 942, 943, 944, 945, 946, 947, 948, 949, 953, 954, 955, 956, 957, 958, 959], 'SPENT_HW4_EXPLORATION'), ...span([960, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999], 'SPENT_HW4_VALIDATION'),
  ...span([901, 902, 903, 904, 905, 906, 907, 908, 909, 910], 'SPENT_HW4B_SCREENED_OBSERVATIONAL'), ...span([911, 912, 913, 914], 'RETIRED_HW4B_RESERVE_NEVER_GENERATED'),
});
export const SEALED = Object.freeze([
  ['STUDIED_341', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_STUDIED_341.json'], ['DEV_H2_BASE_WORLDS', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_DEV_H2.json'],
  ['HW1_EXPLORATION', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_EXPLORATION.json'], ['HW1_VALIDATION', 'stage3h-hw1-dev-v1/evidence/I2_REGISTRY_VALIDATION.json'],
  ['HW4_EXPLORATION', 'stage3h-hw4-value-band-v1/evidence/HW4_REGISTRY_EXPLORATION.json'], ['HW4_VALIDATION', 'stage3h-hw4-value-band-v1/evidence/HW4_REGISTRY_VALIDATION.json'],
  ['HW4B_SCREENED_DEV', 'stage3h-hw4-value-band-v1/evidence/HW4B_REGISTRY_SCREENED.json'],
]);

const sha = (b) => createHash('sha256').update(b).digest('hex'), fileSha = (p) => sha(readFileSync(p)), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), fail = (m) => { throw Error(m); };
const HEX64 = /^[0-9a-f]{64}$/, seed12 = (s) => Number.isSafeInteger(s) && s > 0 && String(s).length === 12;
const hashOf = (rec) => { const { hash, ...rest } = rec; return sha(JSON.stringify(rest)); };

// ---- sealed public-class (PCD) registries: stage3h-hw1-dev-v1/i2-registry.mjs
const pcdFail = (m) => { throw Error('PCD_REGISTRY_INVALID:' + m); }, pcdCheck = (v, m) => { if (!v) pcdFail(m); };
const canonical = (entries) => JSON.stringify(entries.map((e) => [e.id, e.source, e.fine ?? null, e.coarse]));
export function validateRegistry(reg) {
  pcdCheck(reg && reg.schema === PCD_REGISTRY_SCHEMA, 'SCHEMA'); pcdCheck(reg.pcdVersion === PCD_VERSION, 'PCD_VERSION'); pcdCheck(Array.isArray(reg.entries) && reg.entries.length === reg.count, 'COUNT');
  const ids = new Set();
  for (const e of reg.entries) {
    pcdCheck(typeof e.id === 'string' && e.id.length > 0 && !ids.has(e.id), 'ID_DUPLICATE_OR_EMPTY'); ids.add(e.id);
    pcdCheck(typeof e.source === 'string' && HEX64.test(e.coarse) && (e.fine === null || e.fine === undefined || HEX64.test(e.fine)), 'NON_CANONICAL_DIGEST:' + e.id);
  }
  pcdCheck(typeof reg.seal === 'string' && HEX64.test(reg.seal) && reg.seal === sha(canonical(reg.entries)), 'SEAL_MISMATCH');
  return reg;
}
export const loadRegistry = (path) => { let reg; try { reg = JSON.parse(readFileSync(path, 'utf8')); } catch { pcdFail('UNREADABLE:' + path); } return validateRegistry(reg); };
export function registryIndex(regs) {
  const fine = new Map(), coarse = new Map(), add = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(`${e.source}:${e.id}`); };
  for (const r of regs) for (const e of r.entries) { if (e.fine) add(fine, e.fine, e); add(coarse, e.coarse, e); }
  return { fine, coarse, seals: regs.map((r) => ({ name: r.name, count: r.count, seal: r.seal })) };
}
export function matchPcd(index, p) {
  const out = [];
  if (p.fine && index.fine.has(p.fine)) out.push(...index.fine.get(p.fine).map((s) => 'FINE:' + s));
  if (index.coarse.has(p.coarse)) out.push(...index.coarse.get(p.coarse).map((s) => 'COARSE:' + s));
  return out;
}

// ---- consolidated structured index: stage3h-safety-feasibility-v1/closure/exclusions.mjs loadExclusionIndex()
function loadExclusionIndex(ga) {
  const J = (p) => JSON.parse(readFileSync(resolve(ga, p), 'utf8'));
  const blocks = new Map(), seeds = new Map(), worlds = new Map(), add = (m, k, why) => { if (!m.has(k)) m.set(k, why); };
  const prior = J(EXCLUSION_FILES.prior);
  for (const h of prior.priorWorldHashes) add(worlds, h, 'PRIOR_EXECUTED_OR_DEVELOPMENT_WORLD');
  for (const s of prior.priorSeeds) add(seeds, s, 'PRIOR_SEED');
  for (const b of EXCLUDED_BLOCKS_0364164C) add(blocks, b, 'REGISTRATION_0364164C_BLOCK');
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
  return { blocks, seeds, worlds, sources: Object.fromEntries(Object.entries(EXCLUSION_FILES).filter(([k]) => k !== 'v4Runs').map(([k, p]) => [k, { path: p, sha256: fileSha(resolve(ga, p)) }])) };
}

// ---- strict index: stage3h-wider-action-feasibility-v1/exclusion/strict-index.mjs loadStrictIndex()
export function loadStrictIndex(ga = GA_DEFAULT) {
  const sfail = (m) => { throw Error('EXCLUSION_INDEX_INVALID:' + m); }, check = (v, m) => { if (!v) sfail(m); };
  const read = (p) => { check(existsSync(resolve(ga, p)), 'MISSING_FILE:' + p); return readFileSync(resolve(ga, p)); };
  const J = (p) => { try { return JSON.parse(read(p).toString('utf8')); } catch (e) { if (String(e.message).startsWith('EXCLUSION_INDEX_INVALID')) throw e; sfail('UNPARSEABLE:' + p); } };
  const uniqueHex = (xs, name) => { check(Array.isArray(xs) && xs.every((h) => typeof h === 'string' && HEX64.test(h)), 'NON_CANONICAL_HASH:' + name); check(new Set(xs).size === xs.length, 'DUPLICATE_HASH:' + name); };
  const prior = J(EXCLUSION_FILES.prior);
  check(prior.schema === 'STAGE3H_OWNER_GOVERNED_PRIOR_WORLD_EXCLUSIONS_V1', 'PRIOR_SCHEMA'); uniqueHex(prior.priorWorldHashes, 'prior');
  check(prior.priorWorldHashes.length === prior.executedCount + prior.developmentCount, 'PRIOR_COUNT'); check(prior.priorSeeds.every(seed12), 'PRIOR_SEED_FORMAT');
  const alloc = J(EXCLUSION_FILES.v4Allocation), v4Blocks = Object.values(alloc.namespaces).map((b) => { check(Number.isSafeInteger(b) && b % BLOCK === 0 && String(b).length === 12, 'V4_BLOCK_FORMAT'); return b / BLOCK; });
  const runs = resolve(ga, EXCLUSION_FILES.v4Runs), v4 = [];
  for (const r of ['A', 'B']) { check(existsSync(resolve(runs, r)), 'MISSING_V4_RUN:' + r); for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) v4.push(...JSON.parse(readFileSync(resolve(runs, r, f), 'utf8'))); }
  uniqueHex(v4.map((e) => e.worldHash), 'v4'); check(v4.every((e) => seed12(e.seed) && v4Blocks.includes(Math.floor(e.seed / BLOCK))), 'V4_SEED_OUTSIDE_ALLOCATION');
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
  const ledger = J(EXCLUSION_FILES.diagnostic);
  check(ledger.schema === 'STAGE3H_DIAGNOSTIC_WORLD_EXCLUSIONS_V1' && ledger.status === 'SPENT_DIAGNOSTIC', 'LEDGER_SCHEMA');
  uniqueHex(ledger.constructedWorldHashes, 'ledger');
  check(sha(JSON.stringify(ledger.constructedWorldHashes)) === ledger.constructedWorldHashesSha256, 'LEDGER_DIGEST');
  check(ledger.devBaseWorlds.sha256 === sha(devBytes) && ledger.devBaseWorlds.worlds === devBase.length, 'LEDGER_DEV_REFERENCE');
  check(JSON.stringify(ledger.seedExclusions.wholeBlocks) === JSON.stringify([951, 952]) && JSON.stringify(ledger.seedExclusions.devOpenSeeds) === JSON.stringify(dev.devOpenSeeds), 'LEDGER_SEED_EXCLUSIONS');
  const index = loadExclusionIndex(ga), sources = new Map(), tag = (h, s) => { if (!sources.has(h)) sources.set(h, []); sources.get(h).push(s); };
  prior.priorWorldHashes.forEach((h) => tag(h, 'PRIOR')); v4.forEach((e) => tag(e.worldHash, 'V4_SEALED')); devBase.forEach((h) => tag(h, 'DEV_BASE')); ledger.constructedWorldHashes.forEach((h) => tag(h, 'DIAGNOSTIC_CONSTRUCTED'));
  check(index.worlds.size === sources.size, 'INDEX_WORLD_COUNT_MISMATCH');
  const blocks = [...index.blocks.keys()].sort((a, b) => a - b);
  for (const b of [...EXCLUDED_BLOCKS_0364164C, ...v4Blocks, 951, 952]) check(index.blocks.has(b), 'INDEX_MISSING_BLOCK_' + b);
  return { format: INDEX_FORMAT, index, sources, counts: { priorWorlds: prior.priorWorldHashes.length, priorSeeds: prior.priorSeeds.length, v4SealedWorlds: v4.length, devBaseWorlds: devBase.length,
    diagnosticConstructedWorlds: ledger.constructedWorldHashes.length, devOpenSeeds: dev.devOpenSeeds.length, excludedBlocks: blocks, distinctExcludedWorlds: index.worlds.size, excludedSeeds: index.seeds.size,
    multiSourceWorlds: [...sources.values()].filter((s) => s.length > 1).length } };
}
export function preflightNamespace(strict, { base, count }) {
  if (!seed12(base) || !Number.isSafeInteger(count) || count < 1 || !seed12(base + count - 1)) return { ok: false, failures: ['INVALID_RANGE'] };
  const failures = [];
  for (let b = Math.floor(base / BLOCK); b <= Math.floor((base + count - 1) / BLOCK); b++) if (strict.index.blocks.has(b)) failures.push(`EXCLUDED_BLOCK_${b}:${strict.index.blocks.get(b)}`);
  for (const [s, why] of strict.index.seeds) if (s >= base && s < base + count) failures.push(`EXCLUDED_SEED_${s}:${why}`);
  return { ok: failures.length === 0, failures };
}
export function preflightWorlds(strict, hashes) {
  const failures = hashes.flatMap((h) => (typeof h !== 'string' || !HEX64.test(h) ? [`NON_CANONICAL_HASH:${String(h).slice(0, 16)}`] : strict.sources.has(h) ? [`EXCLUDED_WORLD:${strict.sources.get(h).join('+')}`] : []));
  return { ok: failures.length === 0, failures };
}

// ---- SK1 registry context: infra/exclusions.mjs loadSk1Exclusions()
function loadSk1Context(ga, registryFile, extraRegistries) {
  if (!existsSync(registryFile)) fail('SK1_EXCLUSION_REGISTRY_MISSING');
  let rec; try { rec = readJ(registryFile); } catch { fail('SK1_EXCLUSION_REGISTRY_UNREADABLE'); }
  if (rec.schema !== SK1_REGISTRY_SCHEMA || rec.failClosed !== true || rec.hash !== hashOf(rec)) fail('SK1_EXCLUSION_REGISTRY_TAMPERED');
  for (const [b, why] of Object.entries(REQUIRED_FORBIDDEN_BLOCKS)) if (rec.forbiddenBlocks[b] !== why) fail(`SK1_EXCLUSION_REGISTRY_MISSING_BLOCK:${b}`);
  if (rec.sealedRegistries.length !== SEALED.length) fail('SK1_EXCLUSION_REGISTRY_SEALED_SET_CHANGED');
  const regs = rec.sealedRegistries.map((e, i) => {
    if (e.name !== SEALED[i][0] || e.file !== SEALED[i][1]) fail(`SK1_EXCLUSION_REGISTRY_SEALED_SET_CHANGED:${e.name}`);
    const p = resolve(ga, e.file); if (!existsSync(p)) fail(`SEALED_REGISTRY_MISSING:${e.name}`);
    if (fileSha(p) !== e.sha256) fail(`SEALED_REGISTRY_FILE_CHANGED:${e.name}`);
    const reg = loadRegistry(p); if (reg.seal !== e.seal || reg.count !== e.count) fail(`SEALED_REGISTRY_SEAL_CHANGED:${e.name}`); return reg;
  });
  for (const p of extraRegistries) regs.push(loadRegistry(p));
  const strict = loadStrictIndex(ga);
  if (JSON.stringify(strict.counts) !== JSON.stringify(rec.strictIndex.counts)) fail('STRICT_INDEX_COUNTS_CHANGED');
  return { registry: rec, registryHash: rec.hash, strict, regs, pcdIndex: registryIndex(regs), forbidden: rec.forbiddenBlocks };
}

/** Fail-closed successor exclusion context (successor/exclusions-v2.mjs loadSuccessorExclusions()), from tracked records only. */
export function loadPortableExclusions({ ga = GA_DEFAULT, registryFile = resolve(ga, REGISTRY_REL), ledgerFile = resolve(ga, LEDGER_REL) } = {}) {
  const lane = resolve(ga, SK1_LANE_REL);
  if (!existsSync(ledgerFile)) fail('SK1_SPEND_LEDGER_MISSING');
  let led; try { led = readJ(ledgerFile); } catch { fail('SK1_SPEND_LEDGER_UNREADABLE'); }
  if (led.schema !== SK1_LEDGER_SCHEMA) fail('SK1_SPEND_LEDGER_INVALID');
  const regs = [[led.populations.EXPLORATION.registry, led.populations.EXPLORATION.registrySha256], [led.populations.VALIDATION.registry, led.populations.VALIDATION.registrySha256], [led.unusedRegistry.file, led.unusedRegistry.sha256]];
  for (const [f, h] of regs) { const p = resolve(lane, f); if (!existsSync(p)) fail('SK1_REGISTRY_MISSING:' + f); if (fileSha(p) !== h) fail('SK1_REGISTRY_FILE_CHANGED:' + f); }
  const listed = [...led.blocks.screenedAndSpent, ...led.blocks.reserveNeverGenerated, ...led.blocks.rejectedAtPreflight];
  if (listed.length !== 37 || listed.some((b) => typeof led.statuses[b] !== 'string')) fail('SK1_SPEND_LEDGER_BLOCK_LIST_CHANGED');
  const ctx = loadSk1Context(ga, registryFile, regs.map(([f]) => resolve(lane, f)));
  return { ...ctx, forbidden: { ...ctx.forbidden, ...led.statuses }, successorOf: SUCCESSOR_OF, ledgerSha256: fileSha(ledgerFile), loaderId: LOADER_ID };
}

/** Why a block may not be used. Empty array = usable. */
export function blockFailures(ctx, block) {
  if (!Number.isSafeInteger(block) || String(block * BLOCK).length !== 12) return ['NOT_A_12_DIGIT_BLOCK'];
  const out = []; if (ctx.forbidden[block]) out.push(`FORBIDDEN_BLOCK_${block}:${ctx.forbidden[block]}`);
  out.push(...preflightNamespace(ctx.strict, { base: block * BLOCK, count: PER_BLOCK }).failures); return out;
}
/** World / public-class admission; any recorded identity rejects. */
export function admission(ctx, worldHash, p) {
  const w = preflightWorlds(ctx.strict, [worldHash]); if (!w.ok) return { ok: false, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] };
  const m = matchPcd(ctx.pcdIndex, p); if (m.length) return { ok: false, reason: m.some((x) => x.startsWith('FINE:')) ? 'PCD_FINE_MATCH' : 'PCD_COARSE_MATCH', detail: m[0] };
  return { ok: true };
}
/** Re-check a whole population. Returns the contaminated entries (empty = clean). */
export function contamination(ctx, classes) {
  const bad = [];
  for (const c of classes) {
    const f = blockFailures(ctx, c.block); if (f.length) { bad.push({ id: c.id, reason: f[0].split(':')[0].startsWith('FORBIDDEN') ? 'FORBIDDEN_BLOCK' : 'EXCLUDED_NAMESPACE', detail: f[0] }); continue; }
    const hashes = [c.worldHash, ...(c.memberHashes ?? [])], w = preflightWorlds(ctx.strict, hashes); if (!w.ok) { bad.push({ id: c.id, reason: 'STRICT_WORLD_INDEX', detail: w.failures[0] }); continue; }
    const m = matchPcd(ctx.pcdIndex, { fine: c.fine, coarse: c.coarse }).filter((x) => !(c.ownRegistry && x.includes(`${c.ownRegistry}:${c.id}`))); if (m.length) bad.push({ id: c.id, reason: 'PCD_MATCH', detail: m[0] });
  }
  return bad;
}

// ---- identities of what was loaded (works on a historical context as well: same shape)
const digestMap = (m) => sha(JSON.stringify([...m.entries()].sort((a, b) => (String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0))));
/** A canonical, order-independent description of an exclusion context. Two contexts with equal digests reject the same things. */
export function contextIdentity(ctx) {
  const forbidden = Object.entries(ctx.forbidden).sort((a, b) => Number(a[0]) - Number(b[0]));
  const id = { registryHash: ctx.registryHash, forbiddenBlocks: forbidden.length, forbiddenSha256: sha(JSON.stringify(forbidden)),
    strict: { format: ctx.strict.format, counts: ctx.strict.counts, blocksSha256: digestMap(ctx.strict.index.blocks), seedsSha256: digestMap(ctx.strict.index.seeds), worldsSha256: digestMap(ctx.strict.index.worlds), sourcesSha256: digestMap(ctx.strict.sources), sourceFiles: ctx.strict.index.sources },
    registries: ctx.regs.map((r) => ({ name: r.name, count: r.count, seal: r.seal })), pcd: { fineKeys: ctx.pcdIndex.fine.size, coarseKeys: ctx.pcdIndex.coarse.size, fineSha256: digestMap(ctx.pcdIndex.fine), coarseSha256: digestMap(ctx.pcdIndex.coarse) },
    successorOf: ctx.successorOf ?? null, ledgerSha256: ctx.ledgerSha256 ?? null };
  return { ...id, identitySha256: sha(JSON.stringify(id)) };
}
/** Every file the loader reads, relative to platform/game-agnostic, with its sha256. All are tracked records. */
export function inputFiles(ga = GA_DEFAULT) {
  const runs = resolve(ga, EXCLUSION_FILES.v4Runs), ledgers = ['A', 'B'].flatMap((r) => (existsSync(resolve(runs, r)) ? readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json')).sort().map((n) => `${EXCLUSION_FILES.v4Runs}/${r}/${n}`) : []));
  const led = existsSync(resolve(ga, LEDGER_REL)) ? readJ(resolve(ga, LEDGER_REL)) : null, sk1 = led ? [led.populations.EXPLORATION.registry, led.populations.VALIDATION.registry, led.unusedRegistry.file].map((f) => `${SK1_LANE_REL}/${f}`) : [];
  const rels = [REGISTRY_REL, LEDGER_REL, ...sk1, ...SEALED.map(([, f]) => f), EXCLUSION_FILES.prior, EXCLUSION_FILES.v4Allocation, EXCLUSION_FILES.devIdentities, EXCLUSION_FILES.diagnostic, ...ledgers];
  return rels.map((f) => ({ file: f, sha256: existsSync(resolve(ga, f)) ? fileSha(resolve(ga, f)) : null }));
}
/** Compare the inputs on disk with a pinned list. Returns the differences (empty = identical). */
export function verifyInputPins(pins, ga = GA_DEFAULT) {
  const now = new Map(inputFiles(ga).map((r) => [r.file, r.sha256])), want = new Map(pins.map((r) => [r.file, r.sha256])), out = [];
  for (const [f, h] of want) if (now.get(f) !== h) out.push(`${now.has(f) && now.get(f) !== null ? 'CHANGED' : 'MISSING'}:${f}`);
  for (const f of now.keys()) if (!want.has(f)) out.push(`UNPINNED_INPUT:${f}`);
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctx = loadPortableExclusions(), id = contextIdentity(ctx);
  console.log(JSON.stringify({ loader: LOADER_ID, forbiddenBlocks: id.forbiddenBlocks, registries: id.registries.map((r) => `${r.name}:${r.count}`), strictCounts: { ...ctx.strict.counts, excludedBlocks: ctx.strict.counts.excludedBlocks.length }, identitySha256: id.identitySha256, inputs: inputFiles().length }, null, 1));
  console.log('HDISC_PORTABLE_EXCLUSIONS_LOADED_FAIL_CLOSED');
}
