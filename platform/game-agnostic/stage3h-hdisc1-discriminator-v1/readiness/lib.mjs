// H-DISC-1 readiness tooling — shared helpers (evaluation side; never imported by the inference closure).
// Git is always called read-only against the repository. The environment is INHERITED on purpose, so that a test can
// point GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE at a scratch git directory and observe the state "this lane has been
// committed" without committing anything. Commands that act on a temporary clone or fixture use cleanEnv() instead, so
// that such variables never leak into them.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..'), GIT = '/usr/bin/git';
export const GA_REL = 'platform/game-agnostic', LANE_REL = `${GA_REL}/stage3h-hdisc1-discriminator-v1`, HDISC0_REL = `${GA_REL}/stage3h-hdisc0-design-v1`, SK1_REL = `${GA_REL}/stage3h-sk1-safety-kernel-v1`, SK2F_REL = `${GA_REL}/stage3h-sk2f-feasibility-v1`;
export const sha = (b) => createHash('sha256').update(b).digest('hex'), fileSha = (p) => sha(readFileSync(p)), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), posix = (p) => p.split(sep).join('/');
export const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v ?? null));
export const cleanEnv = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' });
/** Read-only git against the repository, simulation-aware (inherits the environment). */
export const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
export const gitBytes = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
export const head = () => git('rev-parse', 'HEAD').trim();
/** Is the state being observed a scratch simulation rather than the real repository? */
export const simulated = () => Boolean(process.env.GIT_DIR);
/** Is a repository-relative file tracked at HEAD and byte-equal to its committed blob? */
export function committedAtHead(rel) {
  let blob = null; try { blob = sha(gitBytes('show', `HEAD:${rel}`)); } catch { /* not tracked at HEAD */ }
  const abs = resolve(REPO, rel), cur = existsSync(abs) ? fileSha(abs) : null; return { file: rel, tracked: blob !== null, equalsHead: blob !== null && blob === cur, sha256: cur };
}
export const isTrackedAtHead = (rel) => { try { git('cat-file', '-e', `HEAD:${rel}`); return true; } catch { return false; } };
