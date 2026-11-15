// SENTINEL_EVIDENCE_BUNDLE_V1 — tests on a tiny synthetic fixture, plus a read-only check of the real working tree.
// Run: node --test readiness/bundle/*.test.mjs      No real bundle is created and no protected file is copied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, cpSync, realpathSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { composeManifest, verifyBundle, manifestSelfHash, linkClosure, buildManifest, collectEntries, recordedRuntime, currentRuntime, REPO_DEFAULT, BUNDLE_SCHEMA } from './evidence-bundle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), sha = (b) => createHash('sha256').update(b).digest('hex');
const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' }, git = (dir, ...a) => execFileSync('/usr/bin/git', ['-C', dir, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] });
const RT = { node: 'v0.0.0-fixture', platform: 'fixture-os' };

/** A tiny repository: one tracked entry point, one tracked library, one "protected" untracked module, one ignored data file. */
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hdisc-bundle-'))), put = (rel, text) => { mkdirSync(dirname(resolve(root, rel)), { recursive: true }); writeFileSync(resolve(root, rel), text); };
  put('app/run.mjs', "import { a } from './lib.mjs';\nimport { secret } from '../protected/secret.mjs';\nexport const run = () => a + secret;\n"); put('app/lib.mjs', 'export const a = 1;\n'); put('.gitignore', 'work/\n');
  git(root, 'init', '-q'); writeFileSync(resolve(root, '.git/info/exclude'), 'protected/\n'); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'fixture base');
  put('protected/secret.mjs', 'export const secret = 41;\n'); put('work/data.json', '{"rows":[1,2,3]}\n'); put('.git/hooks/pre-commit', '#!/bin/sh\nexit 0\n');
  const entry = (path, cls, role) => { const b = readFileSync(resolve(root, path)); return { path, class: cls, role, sha256: sha(b), size: b.length, mode: '644' }; };
  const entries = [entry('protected/secret.mjs', 'PROTECTED_SOURCE', 'FIXTURE'), entry('work/data.json', 'LOCAL_SCIENTIFIC_DATA', 'FIXTURE'), entry('.git/hooks/pre-commit', 'CUSTODY_CONTROL', 'FIXTURE')];
  const manifest = composeManifest({ entries, baseCommit: git(root, 'rev-parse', 'HEAD').trim(), recipients: ['OWNER', 'REVIEWER_A'], runtime: RT, linkTargets: ['app/run.mjs'] });
  return { root, manifest, entries, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
const codes = (r) => r.problems.map((p) => p.split(':')[0]);

test('a faithful overlay over a clean checkout verifies', () => { const f = fixture(); try {
  const r = verifyBundle(f.manifest, f.root, { runtime: RT }); assert.deepEqual(r.problems, []); assert.equal(r.ok, true); assert.equal(r.canLink, true); assert.equal(r.entriesPresentAndMatching, 3); assert.equal(r.checkout, 'GIT_CHECKOUT');
  assert.equal(f.manifest.schema, BUNDLE_SCHEMA); assert.deepEqual(f.manifest.counts, { PROTECTED_SOURCE: 1, LOCAL_SCIENTIFIC_DATA: 1, CUSTODY_CONTROL: 1 }); assert.deepEqual(f.manifest.access.recipients, ['OWNER', 'REVIEWER_A']); assert.equal(f.manifest.access.transport, 'OFFLINE_MEDIA_ONLY');
  assert.equal(f.manifest.manifestSha256, manifestSelfHash(f.manifest)); assert.match(f.manifest.bundleId, /^SG-EVB-V1-[0-9a-f]{12}$/);
  assert.ok(!JSON.stringify(f.manifest).includes('secret = 41'), 'a manifest holds identities, never content');
} finally { f.dispose(); } });

test('the manifest is deterministic and independent of entry order', () => { const f = fixture(); try {
  const again = composeManifest({ entries: [...f.entries].reverse(), baseCommit: f.manifest.baseCommit, recipients: ['REVIEWER_A', 'OWNER'], runtime: RT, linkTargets: ['app/run.mjs'] }); assert.equal(again.manifestSha256, f.manifest.manifestSha256);
} finally { f.dispose(); } });

test('NEGATIVE CONTROL: a missing bundle file is reported and the evaluation no longer links', () => { const f = fixture(); try {
  unlinkSync(resolve(f.root, 'protected/secret.mjs')); const r = verifyBundle(f.manifest, f.root, { runtime: RT }); assert.equal(r.ok, false); assert.ok(r.problems.includes('ENTRY_MISSING:protected/secret.mjs')); assert.ok(r.problems.includes('LINK_UNRESOLVED:protected/secret.mjs')); assert.equal(r.canLink, false);
} finally { f.dispose(); } });

test('NEGATIVE CONTROL: an altered file is reported, whether source, data or a guard', () => { for (const p of ['protected/secret.mjs', 'work/data.json', '.git/hooks/pre-commit']) { const f = fixture(); try {
  writeFileSync(resolve(f.root, p), readFileSync(resolve(f.root, p), 'utf8') + ' '); const r = verifyBundle(f.manifest, f.root, { runtime: RT }); assert.equal(r.ok, false); assert.deepEqual(r.problems, [`ENTRY_ALTERED:${p}`]);
} finally { f.dispose(); } } });

test('NEGATIVE CONTROL: a protected path that has been added to git is refused', () => { const f = fixture(); try {
  git(f.root, 'add', '-f', 'protected/secret.mjs'); const r = verifyBundle(f.manifest, f.root, { runtime: RT }); assert.equal(r.ok, false); assert.deepEqual(r.problems, ['PROTECTED_PATH_TRACKED:protected/secret.mjs']);
} finally { f.dispose(); } });

test('NEGATIVE CONTROL: a different runtime is refused', () => { const f = fixture(); try {
  assert.deepEqual(codes(verifyBundle(f.manifest, f.root, { runtime: { node: 'v99.0.0', platform: RT.platform } })), ['RUNTIME_MISMATCH']); assert.deepEqual(codes(verifyBundle(f.manifest, f.root, { runtime: { node: RT.node, platform: 'other-os' } })), ['RUNTIME_MISMATCH']);
  assert.ok(codes(verifyBundle(f.manifest, f.root)).includes('RUNTIME_MISMATCH'), 'the real runtime is not the fixture runtime');
} finally { f.dispose(); } });

test('NEGATIVE CONTROL: a tampered manifest is refused, including one whose entry list was re-pointed', () => { const f = fixture(); try {
  const t1 = structuredClone(f.manifest); t1.access.recipients.push('SOMEONE_ELSE'); assert.deepEqual(codes(verifyBundle(t1, f.root, { runtime: RT })), ['MANIFEST_TAMPERED']);
  writeFileSync(resolve(f.root, 'protected/secret.mjs'), 'export const secret = 0;\n'); const t2 = structuredClone(f.manifest); t2.entries[1].sha256 = sha(readFileSync(resolve(f.root, 'protected/secret.mjs'))); t2.entries[1].size = 24;
  const r2 = verifyBundle(t2, f.root, { runtime: RT }); assert.ok(r2.problems.includes('MANIFEST_TAMPERED') && r2.problems.includes('MANIFEST_ENTRY_LIST_TAMPERED')); assert.equal(r2.ok, false);
  assert.deepEqual(verifyBundle(null, f.root).problems, ['MANIFEST_MISSING_OR_UNKNOWN_SCHEMA']); assert.deepEqual(verifyBundle({ schema: 'OTHER' }, f.root).problems, ['MANIFEST_MISSING_OR_UNKNOWN_SCHEMA']);
} finally { f.dispose(); } });

test('NEGATIVE CONTROL: a directory that is not a git checkout, or lacks the base commit, is refused', () => { const f = fixture(), plain = realpathSync(mkdtempSync(join(tmpdir(), 'hdisc-plain-'))); try {
  cpSync(resolve(f.root, 'app'), resolve(plain, 'app'), { recursive: true }); cpSync(resolve(f.root, 'protected'), resolve(plain, 'protected'), { recursive: true }); cpSync(resolve(f.root, 'work'), resolve(plain, 'work'), { recursive: true }); mkdirSync(resolve(plain, '.git/hooks'), { recursive: true }); cpSync(resolve(f.root, '.git/hooks/pre-commit'), resolve(plain, '.git/hooks/pre-commit'));
  assert.ok(verifyBundle(f.manifest, plain, { runtime: RT }).problems.includes('ROOT_IS_NOT_A_GIT_CHECKOUT'));
  const other = composeManifest({ entries: f.entries, baseCommit: '0'.repeat(40), runtime: RT, linkTargets: ['app/run.mjs'] }); assert.deepEqual(verifyBundle(other, f.root, { runtime: RT }).problems, ['BASE_COMMIT_NOT_IN_CHECKOUT_HISTORY']);
} finally { f.dispose(); rmSync(plain, { recursive: true, force: true }); } });

test('versioning: a later version must name what it supersedes, and a superseded manifest is refused', () => { const f = fixture(); try {
  assert.throws(() => composeManifest({ entries: f.entries, baseCommit: f.manifest.baseCommit, bundleVersion: 2, runtime: RT }), /MUST_NAME_WHAT_IT_SUPERSEDES/);
  const v2 = composeManifest({ entries: f.entries, baseCommit: f.manifest.baseCommit, bundleVersion: 2, supersedes: { bundleVersion: 1, manifestSha256: f.manifest.manifestSha256 }, runtime: RT, linkTargets: ['app/run.mjs'] });
  assert.equal(v2.supersedes.manifestSha256, f.manifest.manifestSha256); assert.match(v2.bundleId, /^SG-EVB-V2-/); assert.equal(verifyBundle(v2, f.root, { runtime: RT, minimumVersion: 2 }).ok, true);
  assert.deepEqual(codes(verifyBundle(f.manifest, f.root, { runtime: RT, minimumVersion: 2 })), ['MANIFEST_SUPERSEDED']);
} finally { f.dispose(); } });

test('a manifest cannot be composed without recipients, with a duplicated path, an unknown class or a bad hash', () => { const f = fixture(); try { const base = { entries: f.entries, baseCommit: f.manifest.baseCommit, runtime: RT };
  assert.throws(() => composeManifest({ ...base, recipients: [] }), /RECIPIENTS_REQUIRED/); assert.throws(() => composeManifest({ ...base, entries: [...f.entries, f.entries[0]] }), /ENTRY_PATH_DUPLICATED/);
  assert.throws(() => composeManifest({ ...base, entries: [{ ...f.entries[0], class: 'PUBLIC' }] }), /ENTRY_INVALID/); assert.throws(() => composeManifest({ ...base, entries: [{ ...f.entries[0], sha256: 'xyz' }] }), /ENTRY_INVALID/); assert.throws(() => composeManifest({ ...base, bundleVersion: 0 }), /BUNDLE_VERSION_INVALID/);
} finally { f.dispose(); } });

test('linkClosure reports every unresolved relative import and never executes a module', () => { const f = fixture(); try {
  assert.deepEqual(linkClosure(f.root, ['app/run.mjs']), { files: ['app/lib.mjs', 'app/run.mjs', 'protected/secret.mjs'], unresolved: [] }); unlinkSync(resolve(f.root, 'app/lib.mjs')); assert.deepEqual(linkClosure(f.root, ['app/run.mjs']).unresolved, ['app/lib.mjs']);
} finally { f.dispose(); } });

const CUSTODY = existsSync(resolve(REPO_DEFAULT, '.git/custody/protected-identities.tsv')) && existsSync(resolve(REPO_DEFAULT, 'platform/game-agnostic/stage3h-canonical-v1/adapters.mjs'));
test('REAL WORKING TREE, read-only: the bundle scope is 31 protected, 19 data and 7 control identities and verifies in place', { skip: CUSTODY ? false : 'the custody-protected overlay is not present in this checkout' }, () => {
  const c = collectEntries(); assert.deepEqual(c.problems, []); const m = buildManifest(), again = buildManifest();
  assert.deepEqual(m.counts, { PROTECTED_SOURCE: 31, LOCAL_SCIENTIFIC_DATA: 19, CUSTODY_CONTROL: 7 }); assert.equal(m.manifestSha256, again.manifestSha256);
  assert.equal(m.entries.filter((e) => e.class === 'PROTECTED_SOURCE' && e.role === 'SK1_EVALUATION_CLOSURE').length, 29); assert.deepEqual(m.runtime.node, recordedRuntime().node);
  const tracked = execFileSync('/usr/bin/git', ['-C', REPO_DEFAULT, 'ls-files', '--', ...m.entries.filter((e) => e.class !== 'CUSTODY_CONTROL').map((e) => e.path)], { encoding: 'utf8', env }).trim(); assert.equal(tracked, '', 'no bundle entry is tracked');
  const r = verifyBundle(m, REPO_DEFAULT); if (currentRuntime().node === m.runtime.node && currentRuntime().platform === m.runtime.platform) { assert.deepEqual(r.problems, []); assert.equal(r.canLink, true); } else assert.deepEqual(codes(r), ['RUNTIME_MISMATCH']);
  const text = JSON.stringify(m); assert.ok(!/"(seed|worldHash|truth)"/.test(text));
});

test('the command line refuses to write a manifest inside the repository', { skip: CUSTODY ? false : 'the custody-protected overlay is not present in this checkout' }, () => {
  const target = resolve(HERE, 'SHOULD_NOT_EXIST.json'), r = spawnSync(process.execPath, [resolve(HERE, 'evidence-bundle.mjs'), 'manifest', '--out', target], { encoding: 'utf8', env });
  assert.equal(r.status, 2); assert.match(r.stderr, /REFUSED/); assert.equal(existsSync(target), false);
});
