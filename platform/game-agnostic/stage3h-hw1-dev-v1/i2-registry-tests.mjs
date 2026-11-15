// H-W1 I-2 registry tests: every tamper of a sealed registry must be rejected on load, and matching must find a class through relabel, menu-order and lawful-D4 twins.
//   node i2-registry-tests.mjs [--write]   records evidence/I2_REGISTRY_TESTS.json only if every gate passes
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { candidates } from '../stage3h-safety-feasibility-v1/search.mjs';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { RELABEL_KINDS, relabelTwin, menuTwin, menuOrders, D4_NON_IDENTITY, d4Twin } from './transforms.mjs';
import { pcdOfView } from './i2-pcd.mjs';
import { sealRegistry, validateRegistry, loadRegistry, registryIndex, matchPcd } from './i2-registry.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ev = (f) => resolve(LANE, 'evidence', f), tmp = mkdtempSync(resolve(tmpdir(), 'hw1-reg-'));
const sha = (f) => createHash('sha256').update(readFileSync(resolve(LANE, f))).digest('hex');
const studied = loadRegistry(ev('I2_REGISTRY_STUDIED_341.json')), dev = loadRegistry(ev('I2_REGISTRY_DEV_H2.json'));
const gates = [], gate = (name, pass, detail) => gates.push({ name, pass: Boolean(pass), detail });

// ---- tamper rejection: each mutation is applied to a deep copy of the studied registry and must throw PCD_REGISTRY_INVALID:<reason>
const rejects = (mutate) => { const r = structuredClone(studied); mutate(r); try { validateRegistry(r); return 'ACCEPTED'; } catch (e) { return String(e.message); } };
const flip = (h) => (h[0] === '0' ? '1' : '0') + h.slice(1);
const TAMPERS = {
  ENTRY_COARSE_MODIFIED: [(r) => { r.entries[7].coarse = flip(r.entries[7].coarse); }, 'SEAL_MISMATCH'],
  ENTRY_FINE_MODIFIED: [(r) => { r.entries[7].fine = flip(r.entries[7].fine); }, 'SEAL_MISMATCH'],
  ENTRY_SOURCE_MODIFIED: [(r) => { r.entries[3].source = 'OTHER'; }, 'SEAL_MISMATCH'],
  ENTRY_ID_MODIFIED: [(r) => { r.entries[3].id += 'x'; }, 'SEAL_MISMATCH'],
  ENTRY_DROPPED_COUNT_UNCHANGED: [(r) => { r.entries.pop(); }, 'COUNT'],
  ENTRY_DROPPED_COUNT_ADJUSTED: [(r) => { r.entries.pop(); r.count--; }, 'SEAL_MISMATCH'],
  ENTRY_ADDED_COUNT_ADJUSTED: [(r) => { r.entries.push({ id: 'ZZ:1', source: 'STUDIED_341', fine: null, coarse: r.entries[0].coarse }); r.count++; }, 'SEAL_MISMATCH'],
  ENTRIES_REORDERED: [(r) => { r.entries.reverse(); }, 'SEAL_MISMATCH'],
  DUPLICATE_ID: [(r) => { r.entries[1].id = r.entries[0].id; }, 'ID_DUPLICATE_OR_EMPTY'],
  EMPTY_ID: [(r) => { r.entries[0].id = ''; }, 'ID_DUPLICATE_OR_EMPTY'],
  SEAL_CORRUPTED: [(r) => { r.seal = flip(r.seal); }, 'SEAL_MISMATCH'],
  SEAL_NOT_HEX: [(r) => { r.seal = 'z'.repeat(64); }, 'SEAL_MISMATCH'],
  SEAL_REMOVED: [(r) => { delete r.seal; }, 'SEAL_MISMATCH'],
  COARSE_NOT_HEX: [(r) => { r.entries[0].coarse = 'g'.repeat(64); }, 'NON_CANONICAL_DIGEST'],
  COARSE_UPPERCASE: [(r) => { r.entries[0].coarse = r.entries[0].coarse.toUpperCase().replace(/[0-9]/g, 'A'); }, 'NON_CANONICAL_DIGEST'],
  COARSE_TRUNCATED: [(r) => { r.entries[0].coarse = r.entries[0].coarse.slice(0, 63); }, 'NON_CANONICAL_DIGEST'],
  COARSE_MISSING: [(r) => { delete r.entries[0].coarse; }, 'NON_CANONICAL_DIGEST'],
  FINE_NOT_HEX: [(r) => { r.entries[0].fine = 'not-a-digest'; }, 'NON_CANONICAL_DIGEST'],
  SCHEMA_WRONG: [(r) => { r.schema = 'OTHER'; }, 'SCHEMA'],
  PCD_VERSION_WRONG: [(r) => { r.pcdVersion = 'HW1_PCD_V0'; }, 'PCD_VERSION'],
  ENTRIES_NOT_ARRAY: [(r) => { r.entries = {}; }, 'COUNT'],
};
const tamperOutcomes = Object.fromEntries(Object.entries(TAMPERS).map(([k, [m, want]]) => { const got = rejects(m); return [k, { want, got, ok: got === 'PCD_REGISTRY_INVALID:' + want || got.startsWith('PCD_REGISTRY_INVALID:' + want + ':') }]; }));
gate('EVERY_REGISTRY_TAMPER_IS_REJECTED_WITH_THE_EXPECTED_REASON', Object.values(tamperOutcomes).every((t) => t.ok), tamperOutcomes);

// ---- file-level failures: truncated JSON, missing file, non-JSON
const fileFail = (name, text) => { const p = resolve(tmp, name); if (text !== null) writeFileSync(p, text); try { loadRegistry(p); return 'ACCEPTED'; } catch (e) { return String(e.message).split(':').slice(0, 2).join(':'); } };
const raw = readFileSync(ev('I2_REGISTRY_STUDIED_341.json'), 'utf8');
const fileOutcomes = { TRUNCATED: fileFail('t.json', raw.slice(0, raw.length >> 1)), MISSING: fileFail('missing.json', null), NOT_JSON: fileFail('n.json', 'not json'), EMPTY: fileFail('e.json', ''), ONE_DIGEST_CHAR_EDITED_ON_DISK: fileFail('d.json', raw.replace(studied.entries[5].coarse, flip(studied.entries[5].coarse))) };
gate('UNREADABLE_OR_EDITED_REGISTRY_FILES_FAIL_CLOSED', Object.values(fileOutcomes).every((v) => v.startsWith('PCD_REGISTRY_INVALID')), fileOutcomes);

// ---- seal properties: seal is independent of input order, and sensitive to every entry
const shuffled = [...studied.entries].reverse(), resealed = sealRegistry('STUDIED_341', shuffled);
gate('SEAL_IS_INDEPENDENT_OF_GENERATION_ORDER', resealed.seal === studied.seal && resealed.count === studied.count, { seal: studied.seal.slice(0, 12) });
let sensitive = 0, probes = 0; for (let k = 0; k < studied.entries.length; k += 17) { probes++; const e = structuredClone(studied.entries); e[k].coarse = flip(e[k].coarse); if (sealRegistry('STUDIED_341', e).seal !== studied.seal) sensitive++; }
gate('SEAL_CHANGES_WHEN_ANY_PROBED_ENTRY_CHANGES', sensitive === probes, { probes, sensitive });
const dupSeal = (() => { try { sealRegistry('X', [studied.entries[0], studied.entries[0]]); return 'ACCEPTED'; } catch (e) { return String(e.message); } })();
gate('SEALING_A_DUPLICATE_ID_IS_REFUSED', dupSeal.startsWith('PCD_REGISTRY_INVALID:ID_DUPLICATE'), dupSeal);

// ---- matching: base classes match themselves; relabel / menu / lawful-D4 twins match; an unrelated digest does not
const idx = registryIndex([studied, dev]), cs = candidates(), picks = cs.filter((_, k) => k % 14 === 0), twinResults = { classes: 0, selfFine: 0, selfCoarse: 0, relabel: [0, 0], menu: [0, 0], d4: [0, 0], notFoundBase: 0 };
for (const c of picks) {
  const base = nativeWorld(comboOf(c.row)), v = base.view, label = `${c.set}:${c.row.idx}`, band = base.band, p0 = pcdOfView(v, band), hit = matchPcd(idx, p0), tags = (kind) => hit.filter((h) => h.startsWith(kind));
  twinResults.classes++; if (tags('FINE:').some((h) => h.includes(`STUDIED_341:${label}`))) twinResults.selfFine++; if (tags('COARSE:').some((h) => h.includes(`STUDIED_341:${label}`))) twinResults.selfCoarse++; if (!hit.length) twinResults.notFoundBase++;
  const check = (bucket, view) => { twinResults[bucket][1]++; const m = matchPcd(idx, pcdOfView(view, band)); if (m.some((h) => h.includes(`STUDIED_341:${label}`)) && m.some((h) => h.startsWith('FINE:'))) twinResults[bucket][0]++; };
  for (const kind of RELABEL_KINDS) check('relabel', relabelTwin(v, kind, label).view);
  for (const o of menuOrders(v.surface.length, label)) check('menu', menuTwin(v, o.order).view);
  for (const t of D4_NON_IDENTITY) { const w = d4Twin(base.world, t); if (w.lawful) check('d4', w.view); }
}
gate('EVERY_PROBED_BASE_CLASS_MATCHES_ITSELF_ON_FINE_AND_COARSE', twinResults.classes > 0 && twinResults.selfFine === twinResults.classes && twinResults.selfCoarse === twinResults.classes, twinResults);
gate('RELABEL_MENU_AND_D4_TWINS_ARE_EXCLUDED_AS_THE_SAME_CLASS', ['relabel', 'menu', 'd4'].every((k) => twinResults[k][1] > 0 && twinResults[k][0] === twinResults[k][1]), { relabel: twinResults.relabel, menu: twinResults.menu, d4: twinResults.d4 });
const rnd = (s) => createHash('sha256').update(s).digest('hex');
gate('UNRELATED_DIGESTS_DO_NOT_MATCH', matchPcd(idx, { fine: rnd('a'), coarse: rnd('b') }).length === 0, null);
gate('COARSE_ONLY_COLLISION_IS_REPORTED_AS_COARSE', (() => { const m = matchPcd(idx, { fine: rnd('c'), coarse: studied.entries[0].coarse }); return m.length > 0 && m.every((h) => h.startsWith('COARSE:')); })(), null);
gate('REGISTRIES_COVER_EXPECTED_POPULATIONS', studied.count === 341 && dev.count === 12844 && new Set(dev.entries.map((e) => e.fine)).size === dev.count, { studied: studied.count, dev: dev.count });

const out = { schema: 'STAGE3H_HW1_I2_REGISTRY_TESTS_V1', authority: 'R0', checkedAt: new Date().toISOString(), registries: idx.seals, note: 'The seal detects accidental or inconsistent modification. It is not a signature: a writer who recomputes the seal can forge a registry, so the seals are also recorded in committed evidence.',
  sourceHashes: Object.fromEntries(['i2-registry.mjs', 'i2-registry-tests.mjs', 'i2-pcd.mjs'].map((f) => [f, sha(f)])), tamperOutcomes, fileOutcomes, matching: twinResults, gates, allPass: gates.every((g) => g.pass) };
console.log(JSON.stringify({ allPass: out.allPass, failed: gates.filter((g) => !g.pass), matching: twinResults, tamperChecks: Object.keys(tamperOutcomes).length }, null, 1));
if (process.argv.includes('--write')) { if (!out.allPass) throw Error('I2_REGISTRY_TESTS_NOT_PASSING_NOT_RECORDED'); writeExclusive(ev('I2_REGISTRY_TESTS.json'), out); console.log('recorded evidence/I2_REGISTRY_TESTS.json'); }
