// SK1.1 Phase 1 — tests of the reproducibility tooling. Every negative control plants a defect in a TEMPORARY copy or
// fixture and requires the tooling to report it; nothing in the repository is modified.
//   /opt/homebrew/bin/node --test repro/repro.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, cpSync, realpathSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importsOf, traceClosure, classify, CLASS, deepDiff, compareHashRecord, listFiles, fileSha, sha, stable, GIT, SK1_LANE, INVENTORY_FILE } from './lib.mjs';
import { freezeChecks, verifyAgainst, SCHEMA } from './inventory.mjs';
import { buildManifest, verifyRestore } from './backup-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), NODE = process.execPath;
const tmp = (t) => { const d = realpathSync(mkdtempSync(join(tmpdir(), 'sk11-test-'))); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const put = (root, rel, text) => { const p = resolve(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };

test('importsOf: static, side-effect and literal dynamic imports are found; a non-literal dynamic import is counted', () => {
  const r = importsOf(`import a from './a.mjs';\nexport { b } from "../b.mjs";\nimport './side.mjs';\nimport { readFileSync } from 'node:fs';\nconst c = await import('./c.mjs');\nconst d = await import(resolve(x));\n// a comment mentioning from './not-an-import.mjs' is ignored`);
  assert.deepEqual(r.static.sort(), ['../b.mjs', './a.mjs', './side.mjs', 'node:fs']); assert.deepEqual(r.dynamicLiteral, ['./c.mjs']); assert.equal(r.dynamicNonLiteral, 1);
});

test('traceClosure: follows relative imports transitively and RECORDS a missing module instead of skipping it', (t) => {
  const d = tmp(t); put(d, 'entry.mjs', `import './lib/a.mjs';\nimport x from 'node:crypto';`); put(d, 'lib/a.mjs', `export * from './b.mjs';\nimport '../gone.mjs';`); put(d, 'lib/b.mjs', 'export const b = 1;');
  const c = traceClosure([resolve(d, 'entry.mjs')]);
  assert.equal(c.size, 4); assert.equal(c.get(resolve(d, 'gone.mjs')).sha256, null); assert.deepEqual(c.get(resolve(d, 'gone.mjs')).importedBy, [resolve(d, 'lib/a.mjs')]);
  assert.equal(c.get(resolve(d, 'lib/b.mjs')).sha256, sha('export const b = 1;')); assert.deepEqual(c.get(resolve(d, 'entry.mjs')).bare, ['node:crypto']);
});

test('classify: the five classes are distinguished, and a protected file that drifted from its identity is flagged', () => {
  const facts = { tracked: new Set(['t/eq.mjs', 't/mod.mjs']), headSha: (r) => (r === 't/eq.mjs' ? 'h1' : 'h2'), protectedMap: new Map([['p/x.mjs', 'pp']]) };
  assert.equal(classify('t/eq.mjs', 'h1', facts).class, CLASS.EQ); assert.deepEqual(classify('t/mod.mjs', 'changed', facts), { class: CLASS.MOD, headSha256: 'h2' });
  assert.deepEqual(classify('p/x.mjs', 'pp', facts), { class: CLASS.PROT, matchesProtectedIdentity: true }); assert.equal(classify('p/x.mjs', 'zz', facts).matchesProtectedIdentity, false);
  assert.equal(classify('u/new.mjs', 'q', facts).class, CLASS.OTHER); assert.equal(classify('gone.mjs', null, facts).class, CLASS.MISSING);
});

test('NEGATIVE CONTROL compareHashRecord / listFiles: a tampered, a removed and an untouched file are told apart', (t) => {
  const d = tmp(t); put(d, 'a.json', '{"a":1}'); put(d, 'sub/b.json', '{"b":2}'); put(d, 'c.json', '{"c":3}');
  const record = Object.fromEntries(listFiles(d).map((f) => [f.path, f.sha256])); assert.deepEqual(compareHashRecord(record, d), []);
  appendFileSync(resolve(d, 'sub/b.json'), ' '); rmSync(resolve(d, 'c.json'));
  const drift = compareHashRecord(record, d); assert.deepEqual(drift.map((r) => r.file).sort(), ['c.json', 'sub/b.json']); assert.equal(drift.find((r) => r.file === 'c.json').current, null);
});

test('deepDiff: keyed rows are matched by path/file; a changed hash, an added and a removed row are each reported', () => {
  const a = { files: [{ file: 'x', sha256: '1' }, { file: 'y', sha256: '2' }], n: 2 }, b = { files: [{ file: 'y', sha256: '2' }, { file: 'x', sha256: '9' }, { file: 'z', sha256: '3' }], n: 2 };
  assert.deepEqual(deepDiff(a, a), []); const d = deepDiff(a, b); assert.equal(d.length, 2); assert.ok(d.some((s) => s.startsWith('$.files[x].sha256')) && d.some((s) => s === '$.files[z]: ADDED'));
  assert.deepEqual(deepDiff({ files: [{ file: 'x' }, { file: 'y' }] }, { files: [{ file: 'x' }] }), ['$.files[y]: REMOVED']);
});

function freezeFixture(t) {
  const d = tmp(t), lane = resolve(d, 'ga/lane'), gaDir = resolve(d, 'ga'), work = resolve(lane, 'work');
  for (const [f, s] of [['kernel/k.mjs', 'k'], ['adapters/forge/f.mjs', 'f'], ['adapters/rescue/r.mjs', 'r'], ['api/a.mjs', 'a'], ['infra/i.mjs', 'i'], ['infra/reg.json', '{}'], ['models/m.json', 'm'], ['models/n.json', 'n'], ['evidence/SK1_POPULATION_EXPLORATION.json', 'pe'], ['evidence/SK1_POPULATION_VALIDATION.json', 'pv'],
    ['evidence/SK1_REGISTRY_EXPLORATION.json', 're'], ['evidence/SK1_REGISTRY_VALIDATION.json', 'rv'], ['evidence/SK1_NAMESPACE_ALLOCATION.json', 'al'], ['infra/exclusion-registry.json', 'ex'], ['evidence/SK1_TRAINING_RECORD.json', 'tr'], ['SK1_DESIGN_FREEZE.md', 'df'], ['work/classes/VALIDATION/s0.json', 'truth']]) put(lane, f, s);
  put(gaDir, 'other/dep.mjs', 'dep'); put(gaDir, 'other/c10.json', 'c10');
  const code = ['kernel/k.mjs', 'adapters/forge/f.mjs', 'adapters/rescue/r.mjs', 'api/a.mjs', 'infra/i.mjs', 'infra/reg.json', 'infra/exclusion-registry.json'], h = (f) => fileSha(resolve(lane, f));
  const fr = { codeHashes: Object.fromEntries(code.map((f) => [f, h(f)])), evaluationDependencies: { 'other/dep.mjs': fileSha(resolve(gaDir, 'other/dep.mjs')) },
    models: { SK1: { file: 'models/m.json', sha256: h('models/m.json') }, SK1_NO_EVIDENCE: { file: 'models/n.json', sha256: h('models/n.json') }, C10: { file: 'other/c10.json', sha256: fileSha(resolve(gaDir, 'other/c10.json')) } },
    populations: { EXPLORATION: { summarySha256: h('evidence/SK1_POPULATION_EXPLORATION.json'), registrySha256: h('evidence/SK1_REGISTRY_EXPLORATION.json') }, VALIDATION: { summarySha256: h('evidence/SK1_POPULATION_VALIDATION.json'), registrySha256: h('evidence/SK1_REGISTRY_VALIDATION.json'), dataFiles: [{ file: 's0.json', sha256: h('work/classes/VALIDATION/s0.json') }] } },
    allocationSha256: h('evidence/SK1_NAMESPACE_ALLOCATION.json'), exclusionRegistrySha256: h('infra/exclusion-registry.json'), trainingRecordSha256: h('evidence/SK1_TRAINING_RECORD.json'), designFreezeSha256: h('SK1_DESIGN_FREEZE.md') };
  return { fr, lane, gaDir, work };
}
const failing = (checks) => checks.filter((c) => !c.ok).map((c) => c.name);

test('freezeChecks: an untouched fixture passes every check', (t) => { const x = freezeFixture(t); assert.deepEqual(failing(freezeChecks(x.fr, x)), []); });

test('NEGATIVE CONTROL freezeChecks: an edited kernel file, an ADDED file in a frozen directory, a changed dependency, model, population summary and validation data file are each detected', (t) => {
  const edits = [['CODE_HASHES', (x) => appendFileSync(resolve(x.lane, 'kernel/k.mjs'), '\n// edit')], ['CODE_FILE_SET_EQUALS_FROZEN_SET', (x) => put(x.lane, 'infra/new-helper.mjs', 'export {}')], ['EVALUATION_DEPENDENCY_HASHES', (x) => appendFileSync(resolve(x.gaDir, 'other/dep.mjs'), ' ')],
    ['MODEL_FILES', (x) => appendFileSync(resolve(x.gaDir, 'other/c10.json'), ' ')], ['POPULATION_SUMMARIES_AND_REGISTRIES', (x) => appendFileSync(resolve(x.lane, 'evidence/SK1_REGISTRY_VALIDATION.json'), ' ')], ['VALIDATION_DATA_FILES (local, gitignored)', (x) => appendFileSync(resolve(x.work, 'classes/VALIDATION/s0.json'), ' ')],
    ['ALLOCATION_EXCLUSION_REGISTRY_TRAINING_RECORD_DESIGN_FREEZE', (x) => rmSync(resolve(x.lane, 'SK1_DESIGN_FREEZE.md'))]];
  for (const [name, edit] of edits) { const x = freezeFixture(t); edit(x); const bad = failing(freezeChecks(x.fr, x)); assert.ok(bad.includes(name), `${name} not detected: ${bad}`); }
});

const coreFixture = () => ({ codeClosure: { files: [{ file: 'a.mjs', sha256: 'aa', class: CLASS.EQ }] }, freezeBinding: { checks: [{ name: 'CODE_HASHES', ok: true }] }, custody: { guardManifestIntact: true, trackedAtHead: 0, matchingRecordedIdentity: 31, protectedIdentities: 31, closureFilesDifferingFromSk1CustodyManifest: [] },
  exclusions: { registry: { declaredHashVerifies: true }, sealedRegistries: [{ name: 'R', matchesRecorded: true }], successor: { registries: [{ file: 's', matchesRecorded: true }] } } });
const okExcl = { loadable: true, blocks901to914Rejected: 14, blocks801to837RejectedBySuccessor: 37 };

test('verifyAgainst: an identical recomputation passes; a missing inventory fails', () => {
  const core = coreFixture(); assert.equal(verifyAgainst({ schema: SCHEMA, core: structuredClone(core) }, core, okExcl).ok, true); assert.equal(verifyAgainst(null, core, okExcl).ok, false);
});

test('NEGATIVE CONTROL verifyAgainst: a tampered hash, a failing freeze check, a tracked protected path, a changed sealed registry and a retired block that is no longer rejected each fail verification', () => {
  const stored = { schema: SCHEMA, core: coreFixture() };
  const cases = [[(c) => { c.codeClosure.files[0].sha256 = 'TAMPERED'; }, okExcl, (r) => r.drift.some((d) => d.includes('a.mjs'))], [(c) => { c.freezeBinding.checks[0].ok = false; }, okExcl, (r) => r.failedChecks.includes('FREEZE:CODE_HASHES')],
    [(c) => { c.custody.trackedAtHead = 1; }, okExcl, (r) => r.failedChecks.includes('CUSTODY:PROTECTED_PATH_TRACKED')], [(c) => { c.custody.matchingRecordedIdentity = 30; }, okExcl, (r) => r.failedChecks.includes('CUSTODY:PROTECTED_FILE_DIFFERS_FROM_RECORDED_IDENTITY')],
    [(c) => { c.exclusions.sealedRegistries[0].matchesRecorded = false; }, okExcl, (r) => r.failedChecks.includes('EXCLUSIONS:SEALED_REGISTRY_CHANGED:R')], [() => {}, { ...okExcl, blocks901to914Rejected: 13 }, (r) => r.failedChecks.includes('EXCLUSIONS:RETIRED_BLOCK_NOT_REJECTED')], [() => {}, { loadable: false }, (r) => r.failedChecks.includes('EXCLUSIONS:LOADER_NOT_LOADABLE')]];
  for (const [mutate, excl, expect] of cases) { const core = coreFixture(); mutate(core); const r = verifyAgainst(stored, core, excl); assert.equal(r.ok, false); assert.ok(expect(r), JSON.stringify(r)); }
});

test('read tracer: records hits and misses and does not change what the traced program prints', (t) => {
  const d = tmp(t), tr = resolve(d, 'trace'); mkdirSync(tr); put(d, 'data.txt', 'hello'); put(d, 'p.mjs', `import { readFileSync, existsSync } from 'node:fs';\nconsole.log(readFileSync(new URL('./data.txt', import.meta.url), 'utf8'), existsSync(new URL('./absent.txt', import.meta.url)));\ntry { readFileSync('${resolve(d, 'nope.json')}'); } catch (e) { console.log(e.code); }`);
  const plain = spawnSync(NODE, [resolve(d, 'p.mjs')], { encoding: 'utf8' }), traced = spawnSync(NODE, ['--import', pathToFileURL(resolve(HERE, 'read-trace-preload.mjs')).href, resolve(d, 'p.mjs')], { encoding: 'utf8', env: { ...process.env, SK11_READ_TRACE_DIR: tr } });
  assert.equal(traced.stdout, plain.stdout); assert.equal(plain.stdout, 'hello false\nENOENT\n');
  const rec = JSON.parse(readFileSync(resolve(tr, readdirSync(tr)[0]), 'utf8')); assert.ok(rec.hit.includes(resolve(d, 'data.txt'))); assert.ok(rec.miss.includes(resolve(d, 'absent.txt')) && rec.miss.includes(resolve(d, 'nope.json')));
});

function repoFixture(t) {
  const d = tmp(t), g = (...a) => execFileSync(GIT, ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'main'); put(d, '.gitignore', 'work/\n'); put(d, 'src/a.mjs', 'export const a = 1;\n'); g('add', '.'); g('commit', '-q', '-m', 'init'); g('update-ref', 'refs/custody/keep', 'HEAD');
  put(d, 'work/private.json', '{"local":true}'); put(d, 'notes.md', 'untracked'); appendFileSync(resolve(d, 'src/a.mjs'), '// uncommitted\n'); put(d, '.git/hooks/pre-push', '#!/bin/sh\nexit 1\n');
  return { d, g };
}

test('backup scope manifest: lists refs, hooks, uncommitted, untracked and ignored experiment data that a clone would not carry', (t) => {
  const { d } = repoFixture(t), m = buildManifest({ repo: d, fileLevelIgnored: ['work/'] });
  assert.deepEqual(m.sections.git.refs.map((r) => r.ref).sort(), ['refs/custody/keep', 'refs/heads/main']); assert.deepEqual(m.sections.custodyControlFiles.files.map((f) => f.path).filter((p) => p !== '.git/info/exclude'), ['.git/hooks/pre-push']);
  assert.deepEqual(m.sections.uncommittedTrackedModifications.files.map((f) => f.path), ['src/a.mjs']); assert.deepEqual(m.sections.untrackedNotIgnored.files.map((f) => f.path), ['notes.md']); assert.deepEqual(m.sections.ignoredExperimentDataFileLevel.files.map((f) => f.path), ['work/private.json']);
  assert.equal(m.scopeSha256, sha(stable(m.sections)));
});

test('restore verification: a faithful copy passes only as a REHEARSAL on the same device; the source itself is never accepted', (t) => {
  const { d } = repoFixture(t), m = buildManifest({ repo: d, fileLevelIgnored: ['work/'] }), copy = resolve(tmp(t), 'restored'); cpSync(d, copy, { recursive: true });
  const rehearsal = verifyRestore(m, copy, { allowSameDevice: true, sourceRepo: d }); assert.equal(rehearsal.contentOk, true); assert.equal(rehearsal.ok, true); assert.equal(rehearsal.label, 'REHEARSAL_ONLY_SAME_DEVICE');
  const strict = verifyRestore(m, copy, { sourceRepo: d }); assert.equal(strict.ok, false); assert.equal(strict.label, 'REJECTED_SAME_DEVICE');
  assert.equal(verifyRestore(m, d, { allowSameDevice: true, sourceRepo: d }).ok, false);
});

test('NEGATIVE CONTROL restore verification: a tampered data file, a missing hook, a moved ref, a clone without local data and a tampered manifest are each rejected', (t) => {
  const { d, g } = repoFixture(t), m = buildManifest({ repo: d, fileLevelIgnored: ['work/'] }), fresh = () => { const c = resolve(tmp(t), 'restored'); cpSync(d, c, { recursive: true }); return c; }, v = (c, mm = m) => verifyRestore(mm, c, { allowSameDevice: true, sourceRepo: d });
  let c = fresh(); appendFileSync(resolve(c, 'work/private.json'), ' '); assert.deepEqual(v(c).mismatched, ['work/private.json']); assert.equal(v(c).ok, false);
  c = fresh(); rmSync(resolve(c, '.git/hooks/pre-push')); assert.deepEqual(v(c).missing, ['.git/hooks/pre-push']);
  c = fresh(); execFileSync(GIT, ['-C', c, 'update-ref', '-d', 'refs/custody/keep']); assert.deepEqual(v(c).refsWrong, ['refs/custody/keep']);
  const clone = resolve(tmp(t), 'clone'); execFileSync(GIT, ['clone', '-q', d, clone], { stdio: 'ignore' }); const r = v(clone); assert.equal(r.ok, false); assert.ok(r.missing.includes('work/private.json') && r.missing.includes('notes.md') && r.refsWrong.includes('refs/custody/keep'));
  const forged = structuredClone(m); forged.sections.ignoredExperimentDataFileLevel.files = []; assert.equal(v(fresh(), forged).error, 'MANIFEST_TAMPERED'); void g;
});

const haveLocal = existsSync(resolve(SK1_LANE, 'work/manifests')) && existsSync(INVENTORY_FILE);
test('INTEGRATION inventory verify against the working tree: no drift from the tracked inventory, the SK1 freeze or the custody records', { skip: haveLocal ? false : 'needs the tracked inventory and the gitignored SK1 working data' }, () => {
  const r = spawnSync(NODE, [resolve(HERE, 'inventory.mjs'), 'verify'], { encoding: 'utf8', maxBuffer: 1 << 26 }), out = JSON.parse(r.stdout);
  assert.equal(out.wroteAnything, false); assert.deepEqual(out.drift, []); assert.deepEqual(out.failedChecks, []); assert.equal(out.result, 'SK1_1_INVENTORY_VERIFY_PASS'); assert.equal(r.status, 0);
});

test('INTEGRATION NEGATIVE CONTROL: one altered hash in the tracked inventory is reported as drift on that file', { skip: existsSync(INVENTORY_FILE) ? false : 'needs the tracked inventory' }, () => {
  const stored = JSON.parse(readFileSync(INVENTORY_FILE, 'utf8')), current = structuredClone(stored.core), victim = stored.core.codeClosure.files.find((f) => f.file.endsWith('kernel/ranking.mjs'));
  victim.sha256 = '0'.repeat(64); const r = verifyAgainst(stored, current, okExcl);
  assert.equal(r.ok, false); assert.ok(r.drift.some((d) => d.includes('kernel/ranking.mjs') && d.includes('sha256')));
  assert.equal(stored.coreSha256 === sha(stable(stored.core)), false, 'the stored core digest no longer matches the altered core');
});
