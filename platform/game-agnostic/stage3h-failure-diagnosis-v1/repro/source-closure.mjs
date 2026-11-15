// Frozen source identity of the DEV regeneration command (`node run-dev.mjs <set> <shard> <of>`), measured, not listed:
// a child process registers trace-hooks.mjs (every module Node loads) and instruments fs.readFileSync (every data file
// read), then exercises the command's code paths (worldsOf for all three sets, priorWorldHashes, one diagnoseWorld per
// set kind). Each file is then classified: tracked at the base commit (blob compared), or untracked and covered by the
// protected-source package of candidate d8a44ebd with the hash bound in REGISTRATION_CANDIDATE_V4.json. Writes nothing.
// The traced lane may be another checkout (sourceClosure({ root })), e.g. a clean clone that predates repro/.
// Usage: node repro/source-closure.mjs            (prints the closure report)
import { readFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
export const BASE_COMMIT = '38f7c1d6';
export const CANDIDATE = 'stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE_V4.json';
export const PACKAGE = 'stage3h-owner-governed-v1/registration/protected-source-package-d8a44ebd.tar.gz';
export const PACKAGE_RECORD = 'stage3h-owner-governed-v1/evidence/successor-v4-preflight/clean-clone-verification.json';
const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const git = (a, cwd = ROOT) => execFileSync('/usr/bin/git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();

async function child(lane) {
  const fs = (await import('node:fs')).default, { register, syncBuiltinESMExports } = await import('node:module');
  register(pathToFileURL(resolve(HERE, 'trace-hooks.mjs')));
  const reads = new Set(), orig = fs.readFileSync;
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' || p instanceof URL) reads.add(p instanceof URL ? fileURLToPath(p) : resolve(p)); return orig.call(this, p, ...a); };
  syncBuiltinESMExports();
  const run = await import(pathToFileURL(resolve(lane, 'run-dev.mjs')));
  const prior = run.priorWorldHashes();
  for (const set of ['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK']) {
    const ctx = { set, seen: new Set(), prior: set === 'DEV288' ? null : prior, verifyFrozen: true };
    run.diagnoseWorld(run.worldsOf(set)[0], ctx);
  }
  process.stdout.write(JSON.stringify([...reads]));
}

/** The measured closure, classified against the base commit and the protected-source package. */
export function sourceClosure({ root = ROOT, baseCommit = BASE_COMMIT } = {}) {
  root = realpathSync(root); // macOS temp paths alias /var -> /private/var; compare canonical paths only
  const ga = resolve(root, 'platform/game-agnostic'), tmp = mkdtempSync(resolve(tmpdir(), 'sg-closure-')), trace = resolve(tmp, 'trace.txt');
  let reads;
  try {
    reads = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--child', resolve(ga, 'stage3h-failure-diagnosis-v1')], { env: { ...process.env, SG_TRACE_OUT: trace }, encoding: 'utf8', maxBuffer: 64 << 20 }));
    var modules = [...new Set(readFileSync(trace, 'utf8').trim().split('\n'))].map((u) => realpathSync(fileURLToPath(u)));
    reads = reads.map((p) => realpathSync(p));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const rel = (p) => relative(ga, p);
  const files = [...new Set([...modules, ...reads])].filter((p) => !rel(p).startsWith('..')).map(rel).sort();
  const tree = new Map(git(['ls-tree', '-r', baseCommit, '--', 'platform/game-agnostic'], root).split('\n').map((l) => { const [m, p] = l.split('\t'); return [p.replace(/^platform\/game-agnostic\//, ''), m.split(' ')[2]]; }));
  const bound = JSON.parse(readFileSync(resolve(ga, CANDIDATE), 'utf8')).bindings.sources;
  const record = JSON.parse(readFileSync(resolve(ga, PACKAGE_RECORD), 'utf8')).protectedOverlay;
  const entries = files.map((f) => {
    const p = resolve(ga, f), sha256 = fsha(p), kind = modules.includes(p) ? 'MODULE' : 'DATA';
    if (tree.has(f)) return { path: f, kind, sha256, tracked: true, blobMatchesBase: git(['hash-object', p], root) === tree.get(f) };
    return { path: f, kind, sha256, tracked: false, inProtectedPackage: record.files.includes(f), boundSha256: bound[f] ?? null, matchesBound: bound[f] === sha256 };
  });
  const untracked = entries.filter((e) => !e.tracked);
  return { measuredBy: 'trace-hooks.mjs load hook + instrumented fs.readFileSync, exercising run-dev.mjs code paths', baseCommit, files: entries.length,
    modules: entries.filter((e) => e.kind === 'MODULE').length, dataFiles: entries.filter((e) => e.kind === 'DATA').length,
    trackedAllMatchBase: entries.filter((e) => e.tracked).every((e) => e.blobMatchesBase), untracked: untracked.map((e) => e.path),
    untrackedAllInPackageAndBound: untracked.every((e) => e.inProtectedPackage && e.matchesBound), closureSha256: createHash('sha256').update(JSON.stringify(entries.map((e) => [e.path, e.sha256]))).digest('hex'), entries };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--child') await child(process.argv[3]);
  else { const c = sourceClosure(); console.log(JSON.stringify({ ...c, entries: undefined, untrackedEntries: c.entries.filter((e) => !e.tracked) }, null, 1)); }
}
