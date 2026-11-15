// SK1.1 Phase 1 — backup SCOPE manifest and restore verification. This file never creates a backup, copies a protected
// file, uploads anything or pushes. It lists what an independent backup must contain (identities only) and, later,
// checks a RESTORED copy against that list.
//   /opt/homebrew/bin/node repro/backup-manifest.mjs
//        print a summary of the backup scope (nothing is written)
//   /opt/homebrew/bin/node repro/backup-manifest.mjs --out <file OUTSIDE the repository>
//        write the full scope manifest (exclusive create). Keep it WITH the backup and, separately, its sha256.
//   /opt/homebrew/bin/node repro/backup-manifest.mjs verify --manifest <file> --root <restored repository root> [--allow-same-device]
//        acceptance check on a restored copy: every listed file present with the listed sha256, every ref at the listed
//        object, `git fsck` clean. Exit 0 only if all hold. Without --allow-same-device the restored root must be on a
//        different device than this repository; with it the result is labelled REHEARSAL_ONLY and can never justify
//        INDEPENDENT_BACKUP_VERIFIED=true.
// Why a manifest is needed: a `git clone` or `git bundle` of this repository does NOT contain the custody-protected
// overlay, the gitignored experiment data, uncommitted changes, the hooks or the custody control files.
import { existsSync, statSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GIT, REPO, sha, fileSha, posix, listFiles, stable } from './lib.mjs';

export const SCHEMA = 'SK1_1_BACKUP_SCOPE_MANIFEST_V1';
const REBUILDABLE = /(^|\/)(\.DS_Store|node_modules\/|\.venv[^/]*\/|__pycache__\/)/;
const row = (root, rel) => { const abs = resolve(root, rel); if (!existsSync(abs) || !statSync(abs).isFile()) return { path: rel, size: null, sha256: null }; return { path: rel, size: statSync(abs).size, sha256: fileSha(abs) }; };

/** The backup scope of a repository: identities only. fileLevelIgnored: ignored directories to enumerate file by file. */
export function buildManifest({ repo = REPO, fileLevelIgnored = ['platform/game-agnostic/stage3h-sk1-safety-kernel-v1/work/'] } = {}) {
  const git = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 29 }), z = (s) => s.split('\0').filter(Boolean);
  const refs = git('for-each-ref', '--format=%(refname) %(objectname)').split('\n').filter(Boolean).map((l) => { const [ref, object] = l.split(' '); return { ref, object }; });
  const status = z(git('status', '--porcelain', '-z')), modified = status.filter((l) => !l.startsWith('??')).map((l) => l.slice(3)), untracked = z(git('ls-files', '--others', '--exclude-standard', '-z'));
  const custodyFiles = ['.git/info/exclude', ...['pre-commit', 'pre-merge-commit', 'pre-push'].map((h) => `.git/hooks/${h}`), ...(existsSync(resolve(repo, '.git/custody')) ? readdirSync(resolve(repo, '.git/custody')).sort().map((n) => `.git/custody/${n}`) : [])].filter((f) => existsSync(resolve(repo, f)));
  const tsv = resolve(repo, '.git/custody/protected-identities.tsv'), protectedRows = existsSync(tsv) ? readFileSync(tsv, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c.length >= 5).map((c) => ({ ...row(repo, c[1]), recordedSha256: c[3] })) : [];
  const protectedSet = new Set(protectedRows.map((r) => r.path));
  const ignored = z(git('ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z')).filter((p) => !protectedSet.has(p));
  const fileLevel = fileLevelIgnored.filter((d) => existsSync(resolve(repo, d))).flatMap((d) => listFiles(resolve(repo, d), repo).map((f) => ({ path: f.path, size: f.size, sha256: f.sha256, mode: f.mode })));
  const other = ignored.filter((p) => !fileLevelIgnored.some((d) => p === d || p.startsWith(d))).map((p) => { const abs = resolve(repo, p), dir = p.endsWith('/');
    if (REBUILDABLE.test(p)) return { path: p, kind: dir ? 'directory' : 'file', files: 0, bytes: 0, sha256: null, class: 'REBUILDABLE_OR_OS_ARTIFACT (not enumerated)' }; // environments and OS artifacts are not backup content
    const files = dir ? listFiles(abs, repo).filter((f) => !protectedSet.has(f.path)) : [row(repo, p)];
    return { path: p, kind: dir ? 'directory' : 'file', files: files.length, bytes: files.reduce((s, f) => s + (f.size ?? 0), 0), sha256: dir ? sha(files.map((f) => `${f.path}:${f.sha256}`).join('\n')) : files[0].sha256, class: 'IGNORED_LOCAL_DATA' }; });
  const sections = {
    git: { head: git('rev-parse', 'HEAD').trim(), branch: git('branch', '--show-current').trim(), refs, how: 'git bundle create <backup>/sentinel-grid.bundle --all   (covers every ref: heads, custody refs, stash, remote-tracking); verify with git bundle verify' },
    custodyControlFiles: { why: 'hooks, custody records and the local exclude list (which keeps protected source out of `git add`) live inside .git and are in no bundle or clone', files: custodyFiles.map((f) => row(repo, f)) },
    protectedOverlay: { why: 'custody-protected source: untracked by design, required to run any Stage 3H evaluation', files: protectedRows },
    uncommittedTrackedModifications: { why: 'exist only in this working tree', files: modified.map((f) => row(repo, f)) },
    untrackedNotIgnored: { why: 'exist only in this working tree', files: untracked.map((f) => row(repo, f)) },
    ignoredExperimentDataFileLevel: { why: 'gitignored privileged experiment data (seeds, world hashes, evaluator truth); required to check or audit SK1', roots: fileLevelIgnored, files: fileLevel },
    otherIgnoredEntries: { why: 'every other gitignored path, at directory level; the owner decides which to keep', entries: other },
  };
  const count = (rows) => ({ files: rows.length, bytes: rows.reduce((s, r) => s + (r.size ?? 0), 0), unreadableOrMissing: rows.filter((r) => r.sha256 === null).length });
  const summary = { refs: refs.length, custodyControlFiles: count(sections.custodyControlFiles.files), protectedOverlay: { ...count(protectedRows), matchingRecordedIdentity: protectedRows.filter((r) => r.sha256 === r.recordedSha256).length }, uncommittedTrackedModifications: count(sections.uncommittedTrackedModifications.files), untrackedNotIgnored: count(sections.untrackedNotIgnored.files),
    ignoredExperimentDataFileLevel: count(fileLevel), otherIgnoredEntries: { entries: other.length, files: other.reduce((s, e) => s + e.files, 0), bytes: other.reduce((s, e) => s + e.bytes, 0), rebuildable: other.filter((e) => e.class !== 'IGNORED_LOCAL_DATA').length } };
  return { schema: SCHEMA, authority: 'R0', createdAt: new Date().toISOString(), disclosure: 'Identities only (paths, sizes, modes, sha256, ref object ids). No file content.', neverUpload: 'Protected overlay, gitignored experiment data and this manifest stay on owner-controlled encrypted storage. No remote push, no cloud upload.', summary, sections, scopeSha256: sha(stable(sections)) };
}

/** Acceptance check of a RESTORED copy. Returns { ok, ... }. Reads only. */
export function verifyRestore(manifest, root, { allowSameDevice = false, sourceRepo = REPO, fsck = true } = {}) {
  if (manifest?.schema !== SCHEMA) return { ok: false, error: 'MANIFEST_SCHEMA' };
  const { scopeSha256, sections } = manifest; if (sha(stable(sections)) !== scopeSha256) return { ok: false, error: 'MANIFEST_TAMPERED' };
  if (!existsSync(resolve(root, '.git'))) return { ok: false, error: 'RESTORED_ROOT_IS_NOT_A_REPOSITORY' };
  const sameDevice = existsSync(sourceRepo) && statSync(resolve(root)).dev === statSync(sourceRepo).dev, sameRoot = resolve(root) === resolve(sourceRepo);
  const fileRows = [...sections.custodyControlFiles.files, ...sections.protectedOverlay.files, ...sections.uncommittedTrackedModifications.files, ...sections.untrackedNotIgnored.files, ...sections.ignoredExperimentDataFileLevel.files].filter((r) => r.sha256 !== null);
  const missing = [], mismatched = [], modeChanged = [];
  for (const r of fileRows) { const abs = resolve(root, r.path); if (!existsSync(abs)) { missing.push(r.path); continue; } let h = null; try { h = fileSha(abs); } catch { h = null; } if (h !== r.sha256) mismatched.push(r.path); else if (r.mode && (statSync(abs).mode & 0o777).toString(8).padStart(3, '0') !== r.mode) modeChanged.push(r.path); }
  const g = (...a) => execFileSync(GIT, ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 29, stdio: ['ignore', 'pipe', 'pipe'] });
  const refsWrong = sections.git.refs.filter((r) => { try { return g('rev-parse', '--verify', '--quiet', r.ref).trim() !== r.object; } catch { return true; } }).map((r) => r.ref);
  let fsckOk = null; if (fsck) { try { g('fsck', '--connectivity-only', '--no-dangling'); fsckOk = true; } catch { fsckOk = false; } }
  const contentOk = !missing.length && !mismatched.length && !refsWrong.length && fsckOk !== false;
  return { ok: contentOk && !sameRoot && (allowSameDevice || !sameDevice), contentOk, label: sameRoot ? 'INVALID_RESTORED_ROOT_IS_THE_SOURCE' : sameDevice ? (allowSameDevice ? 'REHEARSAL_ONLY_SAME_DEVICE' : 'REJECTED_SAME_DEVICE') : 'RESTORE_ON_DIFFERENT_DEVICE',
    filesChecked: fileRows.length, missing, mismatched, modeChanged, refsChecked: sections.git.refs.length, refsWrong, fsckOk, sameDeviceAsSource: sameDevice };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (process.argv[2] === 'verify') {
    const mf = arg('--manifest'), root = arg('--root'); if (!mf || !root) throw Error('USAGE: backup-manifest.mjs verify --manifest <file> --root <restored repository root> [--allow-same-device]');
    const r = verifyRestore(JSON.parse(readFileSync(resolve(mf), 'utf8')), resolve(root), { allowSameDevice: process.argv.includes('--allow-same-device') });
    console.log(JSON.stringify({ ...r, result: r.ok && r.label === 'RESTORE_ON_DIFFERENT_DEVICE' ? 'BACKUP_RESTORE_VERIFIED' : r.ok ? 'REHEARSAL_PASSED_NOT_AN_INDEPENDENT_BACKUP' : 'BACKUP_RESTORE_NOT_VERIFIED' }, null, 1)); if (!r.ok) process.exitCode = 1;
  } else {
    const m = buildManifest(), out = arg('--out');
    if (out) { const dest = resolve(out); if (dest.startsWith(REPO + '/')) throw Error('BACKUP_MANIFEST_MUST_BE_WRITTEN_OUTSIDE_THE_REPOSITORY'); writeFileSync(dest, JSON.stringify(m, null, 1) + '\n', { flag: 'wx' }); }
    console.log(JSON.stringify({ wrote: out ? posix(relative(process.cwd(), resolve(out))) : null, head: m.sections.git.head, scopeSha256: m.scopeSha256, summary: m.summary }, null, 1));
  }
}
