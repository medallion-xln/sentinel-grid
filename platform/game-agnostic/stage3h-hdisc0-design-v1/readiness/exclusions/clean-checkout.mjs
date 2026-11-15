// HDISC_PORTABLE_EXCLUSIONS_V1 — clean-checkout probe (read-only on the repository; works in a temporary export).
//   node readiness/exclusions/clean-checkout.mjs
// 1. Export from HEAD (git archive) exactly the tracked records the portable loader reads.
// 2. Copy the portable loader and its self-check next to them (HEAD does not need to contain this lane).
// 3. Confirm the export holds no custody-protected file and no privileged work/ data.
// 4. Run the self-check there, in a child process whose working directory is the export.
// 5. Try to import the HISTORICAL loaders there. Whenever the import fails on a module that IS tracked at HEAD, add
//    it from HEAD and retry, so that the reported blocker is the first module that is in no commit.
// The temporary directory is removed afterwards. Nothing is written to the repository.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { resolve, dirname, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inputFiles, GA_DEFAULT } from './portable-exclusions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), GIT = '/usr/bin/git', GA_REL = 'platform/game-agnostic', LANE_REL = `${GA_REL}/stage3h-hdisc0-design-v1`;
const sha = (b) => createHash('sha256').update(b).digest('hex');
const cleanEnv = () => { const e = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' }; return e; }; // no GIT_* and no NODE_* variables leak into the probe
/** Static import specifiers of a module (import ... from, export ... from, bare import). */
export const importsOf = (src) => [...src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);

export function runCleanCheckoutProbe({ ga = GA_DEFAULT, keep = false } = {}) {
  const repo = resolve(ga, '../..'), git = (...a) => execFileSync(GIT, ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
  const head = git('rev-parse', 'HEAD').trim(), inputs = inputFiles(ga).map((r) => `${GA_REL}/${r.file}`), tmp = realpathSync(mkdtempSync(join(tmpdir(), 'hdisc-clean-'))); // real path: the system temp dir is a symlink
  try {
    // 1. tracked inputs from HEAD
    const untracked = inputs.filter((f) => { try { git('cat-file', '-e', `HEAD:${f}`); return false; } catch { return true; } });
    const tar = execFileSync(GIT, ['-C', repo, 'archive', '--format=tar', 'HEAD', '--', ...inputs.filter((f) => !untracked.includes(f))], { maxBuffer: 1 << 28, env: cleanEnv() });
    execFileSync('/usr/bin/tar', ['-x', '-C', tmp], { input: tar, maxBuffer: 1 << 28 });
    // 2. the portable loader and self-check
    const laneExcl = resolve(tmp, LANE_REL, 'readiness/exclusions'); mkdirSync(laneExcl, { recursive: true });
    for (const f of ['portable-exclusions.mjs', 'selfcheck.mjs']) copyFileSync(resolve(HERE, f), resolve(laneExcl, f));
    // 3. what the export contains
    const walk = (d) => readdirSync(d).flatMap((n) => { const p = resolve(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; }), files = walk(tmp).map((p) => relative(tmp, p).split(sep).join('/'));
    let protectedPaths = []; try { const common = execFileSync(GIT, ['-C', repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', env: cleanEnv() }).trim(); protectedPaths = readFileSync(resolve(common, 'custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[1]).filter(Boolean); } catch { /* no custody list available: nothing to compare against */ }
    const contents = { files: files.length, trackedInputsExported: inputs.length - untracked.length, inputsNotTrackedAtHead: untracked, protectedFilesPresent: files.filter((f) => protectedPaths.includes(f)), workDataPresent: files.filter((f) => /(^|\/)work\//.test(f)), gitDirectoryPresent: existsSync(resolve(tmp, '.git')) };
    // 4. self-check inside the export
    const loaderSrc = readFileSync(resolve(laneExcl, 'portable-exclusions.mjs'), 'utf8'), selfSrc = readFileSync(resolve(laneExcl, 'selfcheck.mjs'), 'utf8');
    const closure = { loaderImports: importsOf(loaderSrc), selfcheckImports: importsOf(selfSrc) };
    closure.loaderImportsOnlyNodeBuiltins = closure.loaderImports.every((s) => s.startsWith('node:')); closure.selfcheckImportsOnlyBuiltinsAndTheLoader = closure.selfcheckImports.every((s) => s.startsWith('node:') || s === './portable-exclusions.mjs');
    const run = spawnSync(process.execPath, [resolve(laneExcl, 'selfcheck.mjs')], { cwd: tmp, encoding: 'utf8', maxBuffer: 1 << 26, env: cleanEnv() }), text = run.stdout ?? '';
    let self = null; try { self = JSON.parse(text.slice(0, text.lastIndexOf('}') + 1)); } catch { /* reported below */ }
    const selfcheck = { exit: run.status, verdictLine: text.trim().split('\n').pop() ?? null, ok: self?.ok === true, contextIdentitySha256: self?.contextIdentitySha256 ?? null, positiveOk: self?.positive?.ok ?? null, negativeControls: self ? { total: self.negativeControls.total, passed: self.negativeControls.passed, byGroup: self.negativeControls.byGroup } : null, stderrTail: (run.stderr ?? '').trim().split('\n').slice(-2).join(' | ') || null };
    // 5. the historical loaders in the same export
    const historical = {}; let added = 0;
    for (const [name, rel] of [['loadSk1Exclusions', `${GA_REL}/stage3h-sk1-safety-kernel-v1/infra/exclusions.mjs`], ['loadSuccessorExclusions', `${GA_REL}/stage3h-sk1-safety-kernel-v1/successor/exclusions-v2.mjs`]]) {
      const ensure = (f) => { const to = resolve(tmp, f); if (existsSync(to)) return true; try { const blob = execFileSync(GIT, ['-C', repo, 'show', `HEAD:${f}`], { maxBuffer: 1 << 28, env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] }); mkdirSync(dirname(to), { recursive: true }); writeFileSync(to, blob); added++; return true; } catch { return false; } };
      ensure(rel); let result = null;
      for (let i = 0; i < 600 && result === null; i++) {
        const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(resolve(tmp, rel))}); console.log('IMPORTED');`], { cwd: tmp, encoding: 'utf8', env: cleanEnv() });
        if (r.status === 0 && /IMPORTED/.test(r.stdout)) { result = { importable: true, firstMissingModule: null }; break; }
        const m = /Cannot find module '([^']+)'/.exec(r.stderr ?? ''); if (!m) { result = { importable: false, firstMissingModule: null, error: (r.stderr ?? '').trim().split('\n').slice(0, 3).join(' | ') }; break; }
        const missing = relative(tmp, m[1]).split(sep).join('/'); if (!ensure(missing)) result = { importable: false, firstMissingModule: missing, trackedAtHead: false, custodyProtected: protectedPaths.includes(missing) };
      }
      historical[name] = result ?? { importable: false, firstMissingModule: null, error: 'DID_NOT_CONVERGE' };
    }
    const ok = contents.protectedFilesPresent.length === 0 && contents.workDataPresent.length === 0 && untracked.length === 0 && closure.loaderImportsOnlyNodeBuiltins && closure.selfcheckImportsOnlyBuiltinsAndTheLoader && selfcheck.ok;
    return { head, method: 'git archive HEAD of the loader\'s tracked inputs into a temporary directory; loader and self-check copied in; child process with a clean environment', contents, closure, selfcheck, historicalLoadersInTheSameExport: { ...historical, trackedModulesAddedFromHeadWhileTrying: added }, loaderSha256: sha(loaderSrc), selfcheckSha256: sha(selfSrc), ok };
  } finally { if (!keep) rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = runCleanCheckoutProbe(); console.log(JSON.stringify(res, null, 1)); console.log(res.ok ? 'HDISC_PORTABLE_EXCLUSIONS_CLEAN_CHECKOUT_PASS' : 'HDISC_PORTABLE_EXCLUSIONS_CLEAN_CHECKOUT_FAILED'); if (!res.ok) process.exitCode = 1;
}
