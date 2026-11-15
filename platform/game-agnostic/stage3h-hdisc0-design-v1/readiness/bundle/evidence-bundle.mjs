// SENTINEL_EVIDENCE_BUNDLE_V1 — manifest and verifier for the material a protected evaluation needs that is NOT in git.
//   node readiness/bundle/evidence-bundle.mjs manifest [--version N] [--supersedes <manifest file>] [--recipient NAME]... [--include-optional] [--out <path outside the repository>]
//   node readiness/bundle/evidence-bundle.mjs verify --manifest <file> --root <checkout> [--minimum-version N]
//
// A bundle is: the custody-protected source files, the gitignored scientific data an evaluation reads, and the custody
// control files that live inside .git — described by a manifest of identities (path, sha256, size, mode, class).
// THIS TOOL NEVER COPIES, MOVES, PACKS OR TRANSMITS ANYTHING. `manifest` reads and hashes; `verify` reads and hashes.
// Assembling the bundle itself (placing the listed files in an owner-held encrypted container) is an owner action.
//
//   source identity      every entry is bound by sha256 and size; protected entries must also equal the custody list
//   access control       declared in the manifest: OWNER_HELD_ENCRYPTED_CONTAINER, a named recipients list, offline media only
//   integrity            entriesSha256 over the canonical entry list, manifestSha256 over the whole manifest
//   versioning           an explicit integer bundleVersion and an optional `supersedes` link to the previous manifest hash
//   recovery             a verified bundle over a clean checkout is what the SK2-F backup `restore-verify` step restores
//   environment          the manifest pins the runtime; `verify` refuses a different one
// A manifest holds identities only. It contains no file contents, no seed and no world hash.
import { readFileSync, existsSync, statSync, readdirSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const BUNDLE_SCHEMA = 'SENTINEL_EVIDENCE_BUNDLE_V1', TOOL_ID = 'HDISC_EVIDENCE_BUNDLE_TOOL_V1';
export const CLASSES = Object.freeze(['PROTECTED_SOURCE', 'LOCAL_SCIENTIFIC_DATA', 'CUSTODY_CONTROL']);
const HERE = dirname(fileURLToPath(import.meta.url)), GIT = '/usr/bin/git', GA_REL = 'platform/game-agnostic', SK1_REL = `${GA_REL}/stage3h-sk1-safety-kernel-v1`;
export const REPO_DEFAULT = resolve(HERE, '../../../../..');
const sha = (b) => createHash('sha256').update(b).digest('hex'), posix = (p) => p.split(sep).join('/');
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));
const cleanEnv = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' });
const git = (repo, ...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
const importsOf = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);

/** Static relative-import closure of entry modules under `root`. Returns { files, unresolved } as root-relative paths. */
export function linkClosure(root, entries) {
  const files = new Set(), unresolved = new Set(), walk = (abs) => { const rel = posix(relative(root, abs)); if (files.has(rel) || unresolved.has(rel)) return; if (!existsSync(abs)) { unresolved.add(rel); return; } files.add(rel);
    for (const s of importsOf(readFileSync(abs, 'utf8'))) if (s.startsWith('.')) walk(resolve(dirname(abs), s)); };
  for (const e of entries) walk(resolve(root, e)); return { files: [...files].sort(), unresolved: [...unresolved].sort() };
}
/** The runtime the SK1 result was produced on, read from the tracked result record. */
export function recordedRuntime(repo = REPO_DEFAULT) { const r = JSON.parse(readFileSync(resolve(repo, SK1_REL, 'evidence/SK1_VALIDATION_RESULTS.json'), 'utf8')); return { node: r.node, platform: 'darwin-arm64', source: `${SK1_REL}/evidence/SK1_VALIDATION_RESULTS.json field "node"; platform from the SK1.1 reproducibility record` }; }
export const currentRuntime = () => ({ node: process.version, platform: `${process.platform}-${process.arch}` });
const entryOf = (repo, path, cls, role) => { const abs = resolve(repo, path), st = statSync(abs); return { path, class: cls, role, sha256: sha(readFileSync(abs)), size: st.size, mode: (st.mode & 0o777).toString(8).padStart(3, '0') }; };

/** The link targets a bundle must make resolvable: the SK1 evaluation-side entry points. */
export const SK1_LINK_TARGETS = Object.freeze(['infra/run.mjs', 'infra/screen.mjs', 'infra/pool.mjs', 'infra/build-class.mjs', 'infra/freeze.mjs', 'infra/train.mjs', 'infra/allocator.mjs', 'infra/exclusions.mjs', 'successor/exclusions-v2.mjs'].map((f) => `${SK1_REL}/${f}`));

/** Read the working tree and list what a bundle must contain. Reads and hashes only. */
export function collectEntries({ repo = REPO_DEFAULT, includeOptional = false } = {}) {
  const common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim(), gitRel = posix(relative(repo, common));
  const rows = readFileSync(resolve(common, 'custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c.length >= 5).map((c) => ({ path: c[1], sha256: c[3], size: Number(c[4]) }));
  const closure = new Set(linkClosure(repo, SK1_LINK_TARGETS).files), problems = [];
  const prot = rows.map((r) => { if (!existsSync(resolve(repo, r.path))) { problems.push(`PROTECTED_FILE_MISSING:${r.path}`); return null; } const e = entryOf(repo, r.path, 'PROTECTED_SOURCE', closure.has(r.path) ? 'SK1_EVALUATION_CLOSURE' : 'CUSTODY_PROTECTED_NOT_IN_THE_SK1_CLOSURE'); if (e.sha256 !== r.sha256) problems.push(`PROTECTED_FILE_DIFFERS_FROM_CUSTODY_LIST:${r.path}`); return e; }).filter(Boolean);
  const dir = (rel) => (existsSync(resolve(repo, rel)) ? readdirSync(resolve(repo, rel)).filter((n) => statSync(resolve(repo, rel, n)).isFile()).sort().map((n) => `${rel}/${n}`) : []);
  const data = [...dir(`${SK1_REL}/work/manifests`).map((p) => [p, 'SK1_CHECK']), ...dir(`${SK1_REL}/work/classes/VALIDATION`).map((p) => [p, 'SK1_CHECK']), ...dir(`${SK1_REL}/work/audit`).map((p) => [p, 'SK1_CHECK']),
    ...(includeOptional ? dir(`${SK1_REL}/work/classes/EXPLORATION`).map((p) => [p, 'SK1_1_AND_SK2_F_EXTRACTION_CHECKS']) : [])].map(([p, role]) => entryOf(repo, p, 'LOCAL_SCIENTIFIC_DATA', role));
  const control = ['hooks/pre-commit', 'hooks/pre-merge-commit', 'hooks/pre-push', 'custody/stage-guard.sh', 'custody/protected-identities.tsv', 'custody/GUARD_MANIFEST.sha256', 'info/exclude'].filter((f) => existsSync(resolve(common, f))).map((f) => entryOf(repo, `${gitRel}/${f}`, 'CUSTODY_CONTROL', 'GUARDS_AND_IDENTITY_LIST'));
  const tracked = new Set(git(repo, 'ls-files', '-z', '--', ...prot.map((e) => e.path)).split('\0').filter(Boolean)); for (const p of tracked) problems.push(`PROTECTED_PATH_TRACKED:${p}`);
  return { head: git(repo, 'rev-parse', 'HEAD').trim(), entries: [...prot, ...data, ...control], problems, linkTargets: [...SK1_LINK_TARGETS] };
}

/** Pure: assemble a manifest from its parts. */
export function composeManifest({ entries, baseCommit, bundleVersion = 1, supersedes = null, recipients = ['OWNER'], runtime, linkTargets = [], purpose = 'inputs of a protected Stage 3H evaluation that are not in git' }) {
  if (!Number.isInteger(bundleVersion) || bundleVersion < 1) throw Error('BUNDLE_VERSION_INVALID'); if (bundleVersion > 1 && !supersedes) throw Error('BUNDLE_VERSION_ABOVE_1_MUST_NAME_WHAT_IT_SUPERSEDES');
  if (!Array.isArray(recipients) || !recipients.length || recipients.some((r) => typeof r !== 'string' || !r)) throw Error('RECIPIENTS_REQUIRED');
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)); for (const e of sorted) if (!CLASSES.includes(e.class) || !/^[0-9a-f]{64}$/.test(e.sha256)) throw Error('ENTRY_INVALID:' + e.path);
  if (new Set(sorted.map((e) => e.path)).size !== sorted.length) throw Error('ENTRY_PATH_DUPLICATED');
  const entriesSha256 = sha(stable(sorted)), counts = Object.fromEntries(CLASSES.map((c) => [c, sorted.filter((e) => e.class === c).length]));
  const m = { schema: BUNDLE_SCHEMA, tool: TOOL_ID, bundleId: `SG-EVB-V${bundleVersion}-${entriesSha256.slice(0, 12)}`, bundleVersion, supersedes, baseCommit, purpose,
    access: { custody: 'OWNER_HELD_ENCRYPTED_CONTAINER', recipients: [...recipients].sort(), transport: 'OFFLINE_MEDIA_ONLY', rules: ['The owner is the only issuer.', 'Only named recipients may hold a copy.', 'Never uploaded, never pushed, never placed in a tracked path.', 'This tool never copies or transmits; it reads and hashes.'] },
    runtime, counts, bytes: sorted.reduce((s, e) => s + e.size, 0), entriesSha256, linkTargets: [...linkTargets], entries: sorted,
    contains: 'identities only: path, class, role, sha256, size and mode. No file content, seed or world hash.' };
  return { ...m, manifestSha256: sha(stable(m)) };
}
export const manifestSelfHash = (m) => { const { manifestSha256, ...rest } = m; return sha(stable(rest)); };
export function buildManifest({ repo = REPO_DEFAULT, bundleVersion = 1, supersedes = null, recipients = ['OWNER'], includeOptional = false } = {}) {
  const c = collectEntries({ repo, includeOptional }); if (c.problems.length) throw Error('WORKING_TREE_NOT_BUNDLEABLE:' + c.problems.slice(0, 3).join(','));
  return composeManifest({ entries: c.entries, baseCommit: c.head, bundleVersion, supersedes, recipients, runtime: recordedRuntime(repo), linkTargets: c.linkTargets });
}

/** Check an overlay placed over a checkout against a manifest. Reads and hashes only; never copies. */
export function verifyBundle(manifest, root, { runtime = currentRuntime(), minimumVersion = 1 } = {}) {
  const problems = [], add = (p) => problems.push(p);
  if (!manifest || manifest.schema !== BUNDLE_SCHEMA) return { ok: false, problems: ['MANIFEST_MISSING_OR_UNKNOWN_SCHEMA'], canLink: false };
  if (manifest.manifestSha256 !== manifestSelfHash(manifest)) add('MANIFEST_TAMPERED'); if (manifest.entriesSha256 !== sha(stable(manifest.entries))) add('MANIFEST_ENTRY_LIST_TAMPERED');
  if (manifest.bundleVersion < minimumVersion) add(`MANIFEST_SUPERSEDED:version ${manifest.bundleVersion} < ${minimumVersion}`);
  if (!manifest.access || manifest.access.custody !== 'OWNER_HELD_ENCRYPTED_CONTAINER' || !Array.isArray(manifest.access.recipients) || !manifest.access.recipients.length) add('ACCESS_DECLARATION_MISSING');
  if (!manifest.runtime || manifest.runtime.node !== runtime.node) add(`RUNTIME_MISMATCH:node ${runtime.node} != pinned ${manifest.runtime?.node}`); else if (manifest.runtime.platform !== runtime.platform) add(`RUNTIME_MISMATCH:platform ${runtime.platform} != pinned ${manifest.runtime.platform}`);
  let present = 0; for (const e of manifest.entries) { const abs = resolve(root, e.path); if (!existsSync(abs)) { add(`ENTRY_MISSING:${e.path}`); continue; } const b = readFileSync(abs); if (b.length !== e.size || sha(b) !== e.sha256) { add(`ENTRY_ALTERED:${e.path}`); continue; } present++; }
  // nothing protected may be tracked, and the checkout must contain the base commit
  let checkout = 'GIT_CHECKOUT'; const prot = manifest.entries.filter((e) => e.class === 'PROTECTED_SOURCE').map((e) => e.path);
  try { for (const p of git(root, 'ls-files', '-z', '--', ...prot).split('\0').filter(Boolean)) add(`PROTECTED_PATH_TRACKED:${p}`); try { git(root, 'merge-base', '--is-ancestor', manifest.baseCommit, 'HEAD'); } catch { add('BASE_COMMIT_NOT_IN_CHECKOUT_HISTORY'); } }
  catch { checkout = 'NOT_A_GIT_CHECKOUT'; add('ROOT_IS_NOT_A_GIT_CHECKOUT'); }
  const link = linkClosure(root, manifest.linkTargets ?? []); for (const u of link.unresolved) add(`LINK_UNRESOLVED:${u}`);
  const canLink = link.unresolved.length === 0 && (manifest.linkTargets ?? []).length > 0;
  return { ok: problems.length === 0, problems, bundleId: manifest.bundleId, bundleVersion: manifest.bundleVersion, entries: manifest.entries.length, entriesPresentAndMatching: present, checkout, runtime, linkTargets: (manifest.linkTargets ?? []).length, filesInLinkClosure: link.files.length, canLink,
    statement: problems.length === 0 ? 'Every listed identity is present and matches, nothing protected is tracked, the runtime is the pinned one and every declared entry point links.' : 'NOT VERIFIED' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, ...rest] = process.argv.slice(2), opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; }, all = (k) => rest.flatMap((v, i) => (v === k ? [rest[i + 1]] : []));
  if (mode === 'manifest') {
    const sup = opt('--supersedes'), prev = sup ? JSON.parse(readFileSync(sup, 'utf8')) : null, recipients = all('--recipient');
    const m = buildManifest({ bundleVersion: Number(opt('--version') ?? 1), supersedes: prev ? { bundleVersion: prev.bundleVersion, manifestSha256: prev.manifestSha256 } : null, recipients: recipients.length ? recipients : ['OWNER'], includeOptional: rest.includes('--include-optional') });
    const out = opt('--out');
    if (out) { const abs = resolve(out), rel = relative(REPO_DEFAULT, abs); if (!rel.startsWith('..')) { console.error('REFUSED: --out must point outside the repository; a bundle manifest is issued by the owner, not committed by this tool'); process.exit(2); }
      const fd = openSync(abs, 'wx'); writeSync(fd, JSON.stringify(m, null, 1) + '\n'); closeSync(fd); console.log(JSON.stringify({ written: abs, bundleId: m.bundleId, manifestSha256: m.manifestSha256 }, null, 1)); }
    else console.log(JSON.stringify(m, null, 1));
  } else if (mode === 'verify') {
    const mf = opt('--manifest'), root = opt('--root'); if (!mf || !root) { console.error('USAGE: verify --manifest <file> --root <checkout> [--minimum-version N]'); process.exit(2); }
    const r = verifyBundle(JSON.parse(readFileSync(mf, 'utf8')), resolve(root), { minimumVersion: Number(opt('--minimum-version') ?? 1) }); console.log(JSON.stringify(r, null, 1)); console.log(r.ok ? 'EVIDENCE_BUNDLE_VERIFIED' : 'EVIDENCE_BUNDLE_NOT_VERIFIED'); if (!r.ok) process.exitCode = 1;
  } else { console.error('USAGE: node readiness/bundle/evidence-bundle.mjs manifest [...] | verify --manifest <file> --root <checkout>'); process.exit(2); }
}
