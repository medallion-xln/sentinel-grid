// ASCII Worlds v33.1 lane guard. Read-only over every predecessor: chains the canonical Stage 3H.1 protected set
// (14,447 files incl. 3F/3G freezes, ascii-suite, ascii-quality-v33 evidence) and hash-binds the exact ASCII sources
// this lane audits. Writers use exclusive 'wx' creation and refuse to run beside another writer process.
import { readFileSync, existsSync, readdirSync, lstatSync, openSync, writeSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { verifyProtected as verifyCanonicalProtected } from '../stage3h-canonical-v1/guard.mjs';
import { verifyBaseline } from '../ascii-suite/v21/freeze.mjs';

export const LANE = dirname(fileURLToPath(import.meta.url));
export const GA = resolve(LANE, '..');
export const ROOT = resolve(GA, '../..');
export const rawHash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
export const hashValue = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export function walk(p) {
  if (!existsSync(p)) return [];
  const s = lstatSync(p);
  if (s.isSymbolicLink()) throw Error('GUARD_SYMLINK:' + p);
  return s.isDirectory() ? readdirSync(p).sort().flatMap((n) => walk(resolve(p, n))) : [p];
}
/** Audited ASCII sources (relative to platform/game-agnostic). Any byte change blocks this lane. */
export const SOURCE_ROOTS = Object.freeze(['ascii-suite/v32', 'ascii-suite/v3', 'ascii-suite/worlds', 'ascii-suite/controllers', 'ascii-suite/games.mjs', 'ascii-suite/prime.mjs', 'ascii-suite/v31/render.mjs', 'ascii-suite/training-dev-v1', 'ascii-quality-v33']);
export function sourceHashes() {
  const files = SOURCE_ROOTS.flatMap((r) => walk(resolve(GA, r))).filter((p) => !/\/(runs|screenshots|verification)\//.test(p) || p.endsWith('.json'));
  return Object.fromEntries(files.filter((p) => /\.(mjs|js|json|html|css|md)$/.test(p)).map((p) => [p.slice(GA.length + 1), rawHash(p)]));
}
export function sourceClosure() {
  const files = Object.fromEntries(walk(LANE).filter((p) => /\.(mjs|js|html|css)$/.test(p) && !p.includes('/evidence/') && !p.includes('/artifacts/')).map((p) => [p.slice(LANE.length + 1), rawHash(p)]));
  return { files, hash: hashValue(files) };
}
const INHERITANCE = resolve(LANE, 'inheritance.json');
export function captureInheritance() {
  const canonical = verifyCanonicalProtected(), baseline = verifyBaseline();
  const snapshot = { schema: 'ASCII_V33_1_INHERITANCE_V1', canonicalProtected: canonical, asciiBaseline: baseline, v33Result: rawHash(resolve(GA, 'ascii-quality-v33/RESULT.json')), sources: sourceHashes(), authority: 'R0' };
  writeExclusive(INHERITANCE, snapshot);
  return snapshot;
}
export function verifyInheritance() {
  const snapshot = readJson(INHERITANCE), canonical = verifyCanonicalProtected(), baseline = verifyBaseline(), now = sourceHashes();
  const changed = Object.entries(snapshot.sources).filter(([p, h]) => now[p] !== h).map(([p]) => p);
  if (changed.length) throw Error('ASCII_SOURCE_CHANGED:' + changed.slice(0, 5).join(','));
  if (canonical.count !== snapshot.canonicalProtected.count) throw Error('CANONICAL_PROTECTED_COUNT_CHANGED');
  if (rawHash(resolve(GA, 'ascii-quality-v33/RESULT.json')) !== snapshot.v33Result) throw Error('V33_RESULT_CHANGED');
  return { sourcesUnchanged: true, sourceCount: Object.keys(now).length, canonicalProtected: canonical, asciiBaseline: baseline, v33Unchanged: true, authority: 'R0' };
}
const WRITER = /stage3h\d*-development\/(run|analyze|verify|register|result-run|finalize|privileged|readout|diagnose|evaluate)\.mjs|ascii-quality-v33_1\/(audit|forensics|acceptance|witnesses)\.mjs|stage3h-canonical[^ ]*\/evaluate\.mjs|run-canonical/;
export function concurrentWriters() {
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .split('\n').filter(Boolean).map((l) => { const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); return m && { pid: +m[1], ppid: +m[2], command: m[3] }; }).filter(Boolean);
  const mine = new Set([process.pid, process.ppid]);
  return out.filter((p) => !mine.has(p.pid) && /(^|\/)node\b/.test(p.command.split(' ')[0]) && WRITER.test(p.command)).map((p) => ({ ...p, command: p.command.slice(0, 200) }));
}
export function assertSoleWriter() { const o = concurrentWriters(); if (o.length) throw Error('CONCURRENT_WRITER_PROCESS_PRESENT:' + JSON.stringify(o)); }
export function writeExclusive(path, value) { const fd = openSync(path, 'wx'); writeSync(fd, JSON.stringify(value, null, 1) + '\n'); closeSync(fd); }
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv.includes('--capture') ? captureInheritance() : verifyInheritance();
  console.log(JSON.stringify({ ...out, sources: undefined, sourceCount: Object.keys(out.sources ?? {}).length || out.sourceCount, sourceClosure: sourceClosure().hash }));
}
