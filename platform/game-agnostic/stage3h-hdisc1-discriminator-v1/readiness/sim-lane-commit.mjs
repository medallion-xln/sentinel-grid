// H-DISC-1 readiness — observe the state "the H-DISC-1 lane has been committed" WITHOUT committing anything.
//   node readiness/sim-lane-commit.mjs -- <command> [args...]     run a command against the simulated state
// A scratch git directory under the system temp dir borrows the real object store read-only (objects/info/alternates)
// and holds ONE extra commit: the base HEAD plus the current content of this lane. Commands run with GIT_DIR /
// GIT_WORK_TREE / GIT_INDEX_FILE pointing at the scratch directory see that state while reading the real working tree.
// Nothing is written to the real repository: no object, ref, index entry or hook. The scratch directory is removed.
// After the lane really is committed the simulation is a no-op with the same tree.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { GIT, REPO, LANE_REL, cleanEnv } from './lib.mjs';

/** Returns { env, commit, base, dispose() }. `paths` are repository-relative paths whose working-tree content is committed in the scratch state. */
export function simulateLaneCommit({ repo = REPO, paths = [LANE_REL] } = {}) {
  const real = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', env: cleanEnv() }).trim(), base = real('rev-parse', 'HEAD'), common = real('rev-parse', '--path-format=absolute', '--git-common-dir');
  const tmp = mkdtempSync(resolve(tmpdir(), 'hdisc1-sim-')), gitDir = resolve(tmp, 'sim.git'), index = resolve(tmp, 'index');
  const env = { ...cleanEnv(), GIT_DIR: gitDir, GIT_WORK_TREE: repo, GIT_INDEX_FILE: index, GIT_AUTHOR_NAME: 'hdisc1-simulation', GIT_AUTHOR_EMAIL: 'simulation@invalid', GIT_COMMITTER_NAME: 'hdisc1-simulation', GIT_COMMITTER_EMAIL: 'simulation@invalid', GIT_AUTHOR_DATE: '2026-11-11T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-11T00:00:00Z' };
  const sim = (...a) => execFileSync(GIT, a, { encoding: 'utf8', env, cwd: repo, maxBuffer: 1 << 29 }).trim();
  try {
    execFileSync(GIT, ['init', '-q', '--bare', gitDir], { encoding: 'utf8', env: cleanEnv() });
    mkdirSync(resolve(gitDir, 'objects/info'), { recursive: true }); writeFileSync(resolve(gitDir, 'objects/info/alternates'), resolve(common, 'objects') + '\n');
    sim('config', 'core.bare', 'false');
    const exclude = resolve(common, 'info/exclude'); if (existsSync(exclude)) { mkdirSync(resolve(gitDir, 'info'), { recursive: true }); copyFileSync(exclude, resolve(gitDir, 'info/exclude')); } // keeps protected paths out, as in the real repository
    sim('read-tree', base);
    sim('add', '-A', '--', ...paths); // objects go to the scratch object directory only
    const tree = sim('write-tree'), commit = sim('commit-tree', tree, '-p', base, '-m', 'SIMULATED H-DISC-1 lane commit (scratch directory only; never part of the real repository)');
    sim('update-ref', 'refs/heads/main', commit); sim('symbolic-ref', 'HEAD', 'refs/heads/main');
    return { env, commit, base, tmp, gitDir, dispose: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (e) { rmSync(tmp, { recursive: true, force: true }); throw e; }
}
/** Run a node script against the simulated state. */
export function runSimulated(args, { cwd = REPO, paths } = {}) {
  const s = simulateLaneCommit({ paths }); try { return { ...spawnSync(process.execPath, args, { cwd, env: s.env, encoding: 'utf8', maxBuffer: 1 << 28 }), simulatedCommit: s.commit, base: s.base }; } finally { s.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--'); if (i < 0 || !process.argv[i + 1]) throw Error('USAGE: node readiness/sim-lane-commit.mjs -- <command> [args...]');
  const s = simulateLaneCommit();
  try { console.error(`[simulation] base ${s.base.slice(0, 8)} + scratch commit ${s.commit.slice(0, 8)} (not in the real repository)`); const r = spawnSync(process.argv[i + 1], process.argv.slice(i + 2), { env: s.env, stdio: 'inherit' }); process.exitCode = r.status ?? 1; }
  finally { s.dispose(); }
}
