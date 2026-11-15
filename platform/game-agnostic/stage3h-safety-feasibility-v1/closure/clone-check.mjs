// Clean-clone reproduction of the closure commit, with NO protected-source overlay. Usage: node closure/clone-check.mjs <commit>
// The full checkout is now ~9.8 GB (ascii-suite results), so the clone is a local clone (hardlinked objects) with a
// non-cone sparse checkout of exactly the paths the lane needs: the directories of every module in the lane's static
// import closure (SOURCE_AND_ARCHIVE_MANIFEST.json), the ascii-suite modules file by file, the S0 artifact directory and
// package.json. Then `node closure/reproduce-witnesses.mjs` runs inside the clone; the clone is removed.
// Writes evidence/closure/CLEAN_CLONE.json once.
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
const commit = process.argv[2], git = (a, cwd = ROOT) => execFileSync('/usr/bin/git', ['-C', cwd, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim();
if (!/^[0-9a-f]{40}$/.test(commit ?? '')) throw Error('USAGE: node closure/clone-check.mjs <40-hex commit>');
const manifest = JSON.parse(readFileSync(resolve(LANE, 'evidence/closure/SOURCE_AND_ARCHIVE_MANIFEST.json'), 'utf8'));
const dirs = [...new Set(manifest.externalModules.files.map((f) => f.path.split('/')[0]))].filter((d) => d !== 'ascii-suite');
const patterns = ['/platform/game-agnostic/package.json', '/platform/game-agnostic/stage3h-safety-feasibility-v1/', '/platform/game-agnostic/artifacts/stage3g8-projection-disclosure/',
  ...dirs.map((d) => `/platform/game-agnostic/${d}/`), ...manifest.externalModules.files.filter((f) => f.path.startsWith('ascii-suite/')).map((f) => `/platform/game-agnostic/${f.path}`)];
const tmp = mkdtempSync(resolve(tmpdir(), 'sg-closure-clone-')), repo = resolve(tmp, 'repo');
let out;
try {
  execFileSync('/usr/bin/git', ['clone', '--quiet', '--no-checkout', ROOT, repo]);
  git(['sparse-checkout', 'init', '--no-cone'], repo);
  execFileSync('/usr/bin/git', ['-C', repo, 'sparse-checkout', 'set', '--no-cone', '--stdin'], { input: patterns.join('\n') + '\n' });
  git(['checkout', '--quiet', commit], repo);
  const head = git(['rev-parse', 'HEAD'], repo), clean = git(['status', '--porcelain'], repo) === '';
  const lane = resolve(repo, 'platform/game-agnostic/stage3h-safety-feasibility-v1');
  const devRunsAbsent = !existsSync(resolve(repo, 'platform/game-agnostic/stage3h-failure-diagnosis-v1/dev-runs'));
  const res = JSON.parse(execFileSync(process.execPath, ['closure/reproduce-witnesses.mjs'], { cwd: lane, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, NODE_OPTIONS: '' } }));
  out = { schema: 'STAGE3H_SAFETY_CLOSURE_CLEAN_CLONE_V1', authority: 'R0', commit, cloneHead: head, cloneStatusClean: clean, overlayUsed: false, devRunsAbsent,
    method: 'git clone --no-checkout of the local repository (hardlinked objects), non-cone sparse checkout of the lane, its import-closure directories, the ascii-suite modules file by file, the S0 artifact directory and package.json; node closure/reproduce-witnesses.mjs inside the clone',
    sparsePatterns: patterns, result: res, pass: head === commit && clean && devRunsAbsent && res.allValidReproduce && res.spentBlocksRejected && res.valid === 9 };
} finally { rmSync(tmp, { recursive: true, force: true }); }
out.cloneRemoved = !existsSync(tmp);
writeExclusive(resolve(LANE, 'evidence/closure/CLEAN_CLONE.json'), out);
console.log(JSON.stringify({ ...out, result: { ...out.result, results: undefined } }, null, 1));
