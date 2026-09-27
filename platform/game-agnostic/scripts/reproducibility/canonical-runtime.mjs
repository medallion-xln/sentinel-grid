/* Sentinel canonical verification runtime (preload).
 *
 *   NODE_OPTIONS="--import=<file URL of this module>" node <script> ...
 *
 * Loaded before any repository module, and inherited through NODE_OPTIONS by every child process a certifier
 * spawns (predecessor checks, node --test). It:
 *   1. installs SENTINEL_CANONICAL_NUMERICS_V1 (Math.exp, Math.log, Math.log2, Math.pow) after verifying the golden
 *      vectors, and fails closed if they do not reproduce;
 *   2. registers a load hook that rewrites the pinned `**` site and rejects any other non-exact `**`;
 *   3. with SENTINEL_READONLY=1, refuses every write, rename or deletion of a git-tracked file: an identical write
 *      is skipped as a no-op, a differing one is blocked and its would-be bytes are kept under build/ for review;
 *   4. with SENTINEL_REPRO_LOG=<dir>, records per-process events there (and, with SENTINEL_REPRO_CAPTURE=1,
 *      the certificate payloads a check serialises, so stored and recomputed certificates can be compared).
 * Nothing here changes a repository file. Nothing here changes what a certifier computes except the numerical
 * profile, which is the purpose of the runtime.
 */
import nodeModule from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as numerics from '../../src/core/canonical-numerics-v1.js';
import { CANONICAL_POW_GLOBAL } from './exponentiation-guard.mjs';
import { transform } from './canonical-source-hooks.mjs';

const { createRequire, syncBuiltinESMExports } = nodeModule;
const require = createRequire(import.meta.url);
const fs = require('node:fs');
const fsp = require('node:fs/promises');
/* The platform/game-agnostic root whose modules and tracked files are governed. Defaults to this runtime's own
 * repository; SENTINEL_GA_ROOT names another checkout (used when one runtime verifies a separate clone). */
const GA_ROOT = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

/* 1. numerical profile. Diagnostic modes (guards stay active in both):
 *   SENTINEL_NUMERICS=native      host Math in this process and every child;
 *   SENTINEL_NUMERICS=native-top  host Math in this process only; children (predecessor checks, tests) run the
 *                                 canonical profile, so a stage's own sensitivity is measured without cascade. */
const nativeNumerics = process.env.SENTINEL_NUMERICS === 'native' || process.env.SENTINEL_NUMERICS === 'native-top';
if (process.env.SENTINEL_NUMERICS === 'native-top') process.env.SENTINEL_NUMERICS = 'canonical';
const golden = nativeNumerics ? { failures: [] } : numerics.verifyGolden();
if (golden.failures.length) {
  process.stderr.write(`SENTINEL_CANONICAL_NUMERICS: golden vectors failed on this host: ${JSON.stringify(golden.failures.slice(0, 3))}\n`);
  process.exit(70);
}
if (!nativeNumerics) {
  Math.exp = numerics.exp;
  Math.log = numerics.log;
  Math.log2 = numerics.log2;
  Math.pow = numerics.pow;
  Object.defineProperty(globalThis, CANONICAL_POW_GLOBAL, { value: numerics.pow, enumerable: false, configurable: false, writable: false });
}
const profile = nativeNumerics ? 'HOST_NATIVE' : numerics.CANONICAL_NUMERICS_ID;

/* 2. `**` guard */
if (nativeNumerics) { /* host `**` left untouched */ } else if (typeof nodeModule.registerHooks === 'function') nodeModule.registerHooks({ load: (url, context, nextLoad) => transform(url, nextLoad(url, context)) });
else nodeModule.register(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), 'canonical-source-hooks.mjs')).href);

/* 3-4. read-only guard and event log */
const logDir = process.env.SENTINEL_REPRO_LOG ? path.resolve(process.env.SENTINEL_REPRO_LOG) : null;
const readOnly = process.env.SENTINEL_READONLY === '1';
const events = [];
const captured = [];
const script = path.relative(GA_ROOT, path.resolve(process.argv[1] ?? '')).split(path.sep).join('/');

if (readOnly) {
  const top = spawnSync('git', ['-C', GA_ROOT, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim();
  const listed = spawnSync('git', ['-C', top, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (!top || listed.status !== 0) { process.stderr.write('SENTINEL_READONLY: git is required to identify tracked files\n'); process.exit(71); }
  const tracked = new Set(listed.stdout.split('\0').filter(Boolean));
  const trackedPath = (file) => {
    if (typeof file !== 'string' && !(file instanceof URL)) return null; // file descriptors are never tracked paths
    const absolute = path.resolve(file instanceof URL ? fileURLToPath(file) : file);
    const relative = path.relative(top, absolute).split(path.sep).join('/');
    return tracked.has(relative) ? { absolute, relative } : null;
  };
  const blockedDir = path.join(GA_ROOT, 'build', 'reproducibility', 'blocked-writes', `${process.pid}`);
  const decide = (operation, file, data) => {
    const target = trackedPath(file);
    if (target === null) return 'PASS';
    let identical = false; let kept = null;
    if (data !== undefined && operation === 'write') {
      const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
      try { identical = fs.readFileSync(target.absolute).equals(bytes); } catch { identical = false; }
      if (!identical) {
        const keep = path.join(blockedDir, target.relative);
        fs.mkdirSync(path.dirname(keep), { recursive: true });
        originals.writeFileSync(keep, bytes);
        kept = path.relative(GA_ROOT, keep).split(path.sep).join('/');
      }
    }
    events.push({ event: identical ? 'TRACKED_WRITE_IDENTICAL_SKIPPED' : 'TRACKED_MUTATION_BLOCKED', operation, file: target.relative, kept, script, argv: process.argv.slice(2) });
    return 'SKIP';
  };
  const originals = { writeFileSync: fs.writeFileSync };
  const wrapSync = (name, operation, dataIndex, pathIndex = 0) => {
    const original = fs[name];
    fs[name] = function guarded(...args) { if (decide(operation, args[pathIndex], args[dataIndex]) === 'SKIP') return undefined; return original.apply(this, args); };
  };
  const wrapAsync = (name, operation, dataIndex, pathIndex = 0) => {
    const original = fsp[name];
    fsp[name] = async function guarded(...args) { if (decide(operation, args[pathIndex], args[dataIndex]) === 'SKIP') return undefined; return original.apply(this, args); };
  };
  const wrapCallback = (name, operation, dataIndex, pathIndex = 0) => {
    const original = fs[name];
    fs[name] = function guarded(...args) {
      if (decide(operation, args[pathIndex], args[dataIndex]) === 'SKIP') { const cb = args[args.length - 1]; if (typeof cb === 'function') process.nextTick(cb, null); return undefined; }
      return original.apply(this, args);
    };
  };
  wrapSync('writeFileSync', 'write', 1); wrapSync('appendFileSync', 'append', 1); wrapSync('renameSync', 'rename', undefined, 1);
  wrapSync('unlinkSync', 'delete', undefined); wrapSync('rmSync', 'delete', undefined); wrapSync('copyFileSync', 'copy', undefined, 1);
  wrapAsync('writeFile', 'write', 1); wrapAsync('appendFile', 'append', 1); wrapAsync('rename', 'rename', undefined, 1);
  wrapAsync('unlink', 'delete', undefined); wrapAsync('rm', 'delete', undefined); wrapAsync('copyFile', 'copy', undefined, 1);
  wrapCallback('writeFile', 'write', 1); wrapCallback('appendFile', 'append', 1); wrapCallback('rename', 'rename', undefined, 1);
  wrapCallback('unlink', 'delete', undefined);
  const originalStream = fs.createWriteStream;
  fs.createWriteStream = function guarded(file, options) {
    if (trackedPath(file) !== null) { decide('stream', file, undefined); throw new Error(`SENTINEL_READONLY: refused write stream to tracked file ${file}`); }
    return originalStream.call(this, file, options);
  };
  syncBuiltinESMExports();
}

if (logDir && process.env.SENTINEL_REPRO_CAPTURE === '1') {
  const KEYS = ['certificationHash', 'evaluationFreezeHash', 'analysisFreezeHash', 'reportHash', 'freezeHash', 'planHash'];
  const stringify = JSON.stringify;
  JSON.stringify = function capturing(value, replacer, space) {
    const out = stringify.call(JSON, value, replacer, space);
    if (value && typeof value === 'object' && !Array.isArray(value) && replacer == null && space == null && typeof out === 'string' && out.length > 200
      && (KEYS.some((k) => Object.prototype.hasOwnProperty.call(value, k)) || ('stage' in value && 'schemaVersion' in value)) && !captured.includes(out)) captured.push(out);
    return out;
  };
}

if (logDir) {
  const writeLog = fs.writeFileSync;
  process.on('exit', (code) => {
    try {
      fs.mkdirSync(logDir, { recursive: true });
      writeLog(path.join(logDir, `${path.basename(script)}.${process.pid}.json`),
        `${JSON.stringify({ script, argv: process.argv.slice(2), exitCode: code, profile, events, captured })}\n`);
    } catch { /* logging must never change an exit status */ }
  });
}
