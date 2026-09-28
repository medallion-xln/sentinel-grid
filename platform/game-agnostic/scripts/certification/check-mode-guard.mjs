/* CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE — the read-only certification invariant frozen by the Stage 3F formal freeze.
 *
 * A `--check` path may read tracked state, rebuild explicitly gitignored ephemeral payloads, recompute results and
 * compare hashes. It may not rewrite plans, freezes, manifests, certification artifacts or source: in check mode every
 * write, append, rename, copy-over, truncation or deletion that touches a git-tracked path throws, and an identical
 * rewrite is refused as well (the Stage 3F-RP runtime guard skips identical rewrites; that tolerance covered historical
 * certifiers and is not extended to new ones). At exit the tracked tree must be exactly as it was; otherwise the process
 * exits non-zero.
 *
 * Every certification or verification script introduced from the Stage 3F freeze onward calls
 * enforceCheckModeReadOnly() before doing any work (enforced by tests/stage3f-freeze.test.js over FUTURE_CERTIFIER_PATTERN).
 * Historical Stage 3F certifiers are not retrofitted: their certified source hashes stay intact and their check-mode
 * writes are documented as exceptions in the Stage 3F freeze.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INVARIANT_ID = 'CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE';
/** Certification scripts that must install this guard: the Stage 3F freeze and every later stage. */
export const FUTURE_CERTIFIER_PATTERN = /^(certify-)?stage(3f-freeze|3[g-z]|[4-9])[a-z0-9-]*\.mjs$/;

const WRITE_FLAGS = /[wa+]/;
const git = (cwd, ...args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'buffer', maxBuffer: 1 << 28 });

/** Tracked-tree fingerprint: status of tracked files plus the full diff against HEAD (covers already-dirty files). */
export function trackedTreeFingerprint(cwd) {
  const status = git(cwd, 'status', '--porcelain=v1', '-z', '--untracked-files=no');
  const diff = git(cwd, 'diff', '--no-ext-diff', '--binary', 'HEAD');
  if (status.status !== 0 || diff.status !== 0) throw new Error(`${INVARIANT_ID}: git is required to fingerprint the tracked tree`);
  return `${status.stdout.toString('hex')}:${diff.stdout.length}:${diff.stdout.toString('base64')}`;
}

/**
 * Install the guard when `checkOnly` is true. Returns { active, attempts() } where attempts() lists every refused
 * operation (each one also threw inside the caller).
 */
export function enforceCheckModeReadOnly({ checkOnly, cwd = process.cwd() } = {}) {
  if (!checkOnly) return { active: false, attempts: () => [] };
  const top = git(cwd, 'rev-parse', '--show-toplevel').stdout.toString().trim();
  const listed = git(top || cwd, 'ls-files', '-z');
  if (!top || listed.status !== 0) throw new Error(`${INVARIANT_ID}: git is required to identify tracked files`);
  const tracked = new Set(listed.stdout.toString().split('\0').filter(Boolean));
  const before = trackedTreeFingerprint(top);
  const attempts = [];

  const relativeOf = (file) => {
    if (typeof file !== 'string' && !(file instanceof URL) && !Buffer.isBuffer(file)) return null; // descriptors
    const absolute = path.resolve(file instanceof URL ? fileURLToPath(file) : String(file));
    return path.relative(top, absolute).split(path.sep).join('/');
  };
  const touchesTracked = (file) => {
    const rel = relativeOf(file);
    if (rel === null || rel.startsWith('..')) return null;
    if (tracked.has(rel)) return rel;
    const prefix = rel === '' ? '' : `${rel}/`;
    for (const t of tracked) if (t.startsWith(prefix)) return rel; // a directory holding tracked files
    return null;
  };
  const refuse = (operation, ...files) => {
    for (const file of files) {
      const rel = touchesTracked(file);
      if (rel !== null) {
        attempts.push({ operation, file: rel });
        throw new Error(`${INVARIANT_ID}: --check refused ${operation} of tracked path ${rel}`);
      }
    }
  };
  const isWriteFlag = (flags) => (typeof flags === 'string' ? WRITE_FLAGS.test(flags) : typeof flags === 'number' && (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_TRUNC)) !== 0);

  const guards = {
    writeFile: (a) => refuse('write', a[0]), appendFile: (a) => refuse('append', a[0]), rename: (a) => refuse('rename', a[0], a[1]),
    unlink: (a) => refuse('delete', a[0]), rm: (a) => refuse('delete', a[0]), rmdir: (a) => refuse('delete', a[0]),
    copyFile: (a) => refuse('copy', a[1]), cp: (a) => refuse('copy', a[1]), truncate: (a) => refuse('truncate', a[0]),
    symlink: (a) => refuse('symlink', a[1]), link: (a) => refuse('link', a[1]), chmod: (a) => refuse('chmod', a[0]), utimes: (a) => refuse('utimes', a[0]),
    open: (a) => { if (isWriteFlag(a[1])) refuse('open-for-write', a[0]); },
  };
  for (const [name, check] of Object.entries(guards)) {
    const sync = `${name}Sync`;
    if (typeof fs[sync] === 'function') { const original = fs[sync]; fs[sync] = function guarded(...args) { check(args); return original.apply(this, args); }; }
    if (typeof fs[name] === 'function') {
      const original = fs[name];
      fs[name] = function guarded(...args) {
        try { check(args); } catch (error) { const cb = args[args.length - 1]; if (typeof cb === 'function') { process.nextTick(cb, error); return undefined; } throw error; }
        return original.apply(this, args);
      };
    }
    if (typeof fsp[name] === 'function') { const original = fsp[name]; fsp[name] = async function guarded(...args) { check(args); return original.apply(this, args); }; }
  }
  const originalStream = fs.createWriteStream;
  fs.createWriteStream = function guarded(file, options) { refuse('stream', file); return originalStream.call(this, file, options); };
  syncBuiltinESMExports();

  process.on('exit', () => {
    let after;
    try { after = trackedTreeFingerprint(top); } catch { after = null; }
    if (after !== before) {
      process.stderr.write(`[${INVARIANT_ID}] tracked state changed during a --check run\n`);
      process.exitCode = 3;
    }
  });
  return { active: true, attempts: () => attempts.map((a) => ({ ...a })) };
}
