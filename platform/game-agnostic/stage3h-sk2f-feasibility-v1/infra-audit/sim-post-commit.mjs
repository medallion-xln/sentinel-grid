// STAGE 3H-SK2-F Gate 5 — simulate "the import cut has been committed" WITHOUT committing anything.
//
// A scratch git directory is created under the system temp dir. It borrows the real object store read-only through
// objects/info/alternates, and holds ONE extra commit: base HEAD with stage3h-hw1-dev-v1/public-projection.mjs replaced
// by the working-tree (cut) content. Tools are then run with GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE pointing at the
// scratch directory, so they see the post-commit state while reading the real working tree.
//
// Nothing is written to the real repository: no object, no ref, no index entry, no hook. The scratch directory is removed.
// Used by the tests to prove that status.mjs is correct in BOTH states, and available to the parent:
//   node infra-audit/sim-post-commit.mjs -- <command> [args...]     run a command against the simulated state
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, REPO } from '../../stage3h-sk1-1-assurance-v1/repro/lib.mjs';

const PP_REL = 'platform/game-agnostic/stage3h-hw1-dev-v1/public-projection.mjs';

/** Create the scratch state. Returns { env, commit, base, dispose() }. */
export function simulateCommit({ repo = REPO, rel = PP_REL } = {}) {
  const real = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8' }).trim(), base = real('rev-parse', 'HEAD'), realObjects = resolve(real('rev-parse', '--path-format=absolute', '--git-common-dir'), 'objects');
  const tmp = mkdtempSync(resolve(tmpdir(), 'sk2f-sim-')), gitDir = resolve(tmp, 'sim.git'), index = resolve(tmp, 'index');
  const env = { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: repo, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'sk2f-simulation', GIT_AUTHOR_EMAIL: 'simulation@invalid', GIT_COMMITTER_NAME: 'sk2f-simulation', GIT_COMMITTER_EMAIL: 'simulation@invalid', GIT_AUTHOR_DATE: '2026-11-11T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-11T00:00:00Z' };
  const sim = (...a) => execFileSync(GIT, a, { encoding: 'utf8', env, cwd: repo, maxBuffer: 1 << 29 }).trim();
  try {
    execFileSync(GIT, ['init', '-q', '--bare', gitDir], { encoding: 'utf8' });
    mkdirSync(resolve(gitDir, 'objects/info'), { recursive: true }); writeFileSync(resolve(gitDir, 'objects/info/alternates'), realObjects + '\n');
    sim('config', 'core.bare', 'false');
    const exclude = resolve(real('rev-parse', '--path-format=absolute', '--git-common-dir'), 'info/exclude'); if (existsSync(exclude)) { mkdirSync(resolve(gitDir, 'info'), { recursive: true }); copyFileSync(exclude, resolve(gitDir, 'info/exclude')); }
    sim('read-tree', base);
    const blob = sim('hash-object', '-w', '--', resolve(repo, rel)); // written to the scratch object directory only
    sim('update-index', '--cacheinfo', `100644,${blob},${rel}`);
    const tree = sim('write-tree'), commit = sim('commit-tree', tree, '-p', base, '-m', 'SIMULATED import-cut commit (scratch directory only; never part of the real repository)');
    sim('update-ref', 'refs/heads/main', commit); sim('symbolic-ref', 'HEAD', 'refs/heads/main');
    try { sim('update-ref', 'refs/remotes/origin/main', real('rev-parse', 'refs/remotes/origin/main')); } catch { /* no remote-tracking ref to mirror */ }
    return { env, commit, base, tmp, dispose: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
}

/** Run a node script against the simulated state. Returns spawnSync's result. */
export function runSimulated(args, { cwd = REPO } = {}) {
  const s = simulateCommit(); try { return { ...spawnSync(process.execPath, args, { cwd, env: s.env, encoding: 'utf8', maxBuffer: 1 << 28 }), simulatedCommit: s.commit, base: s.base }; } finally { s.dispose(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--'); if (i < 0 || !process.argv[i + 1]) throw Error('USAGE: node infra-audit/sim-post-commit.mjs -- <command> [args...]');
  const s = simulateCommit();
  try { console.error(`[simulation] base ${s.base.slice(0, 8)} + scratch commit ${s.commit.slice(0, 8)} (not in the real repository)`); const r = spawnSync(process.argv[i + 1], process.argv.slice(i + 2), { env: s.env, stdio: 'inherit' }); process.exitCode = r.status ?? 1; }
  finally { s.dispose(); }
}
