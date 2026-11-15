// Clean clone of the ACTIVE successor registration (no registered world; nothing executed or authorized). Clones the local
// repository at HEAD (which must contain registration/ACTIVE_REGISTRATION_V4.json, with the lane committed and clean apart
// from evidence/activation-d8a44ebd/) into a fresh temporary directory, overlays the 30 policy-protected bound sources from the
// local byte-preserving package verified in Phase 0 (protected-source-package-d8a44ebd.tar.gz, gitignored), runs
// `node clone-verify-activation-v4.mjs` inside the clone, removes the clone, and writes
// evidence/activation-d8a44ebd/clean-clone-verification.json once.
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const ROOT = resolve(GA, '../..'), git = (a, cwd = ROOT) => execFileSync('/usr/bin/git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();
const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/activation-d8a44ebd/clean-clone-verification.json'); ok(!existsSync(OUT), 'ALREADY_RECORDED');
const reg = JSON.parse(readFileSync(resolve(LANE, 'registration/ACTIVE_REGISTRATION_V4.json'), 'utf8')), commit = git(['rev-parse', 'HEAD']);
ok(git(['cat-file', '-e', commit + ':platform/game-agnostic/stage3h-owner-governed-v1/registration/ACTIVE_REGISTRATION_V4.json']) === '', 'REGISTRATION_NOT_COMMITTED');
const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-owner-governed-v1']).split('\n').filter((l) => l && !/evidence\/activation-d8a44ebd\//.test(l));
ok(dirty.length === 0, 'LANE_NOT_CLEAN:' + JSON.stringify(dirty));
const idc = JSON.parse(readFileSync(resolve(LANE, 'evidence/successor-v4-preflight/clean-clone-verification.json'), 'utf8'));
const pkg = resolve(LANE, 'registration/protected-source-package-d8a44ebd.tar.gz');
ok(fsha(pkg) === idc.protectedOverlay.packageSha256, 'PACKAGE_CHANGED');
const tmp = mkdtempSync(resolve(tmpdir(), 'sg-v4-activation-clone-')), repo = resolve(tmp, 'repo');
let result;
try {
  execFileSync('/usr/bin/git', ['clone', '--quiet', '--no-hardlinks', ROOT, repo]);
  git(['checkout', '--quiet', commit], repo);
  execFileSync('/usr/bin/tar', ['-xzf', pkg, '-C', resolve(repo, 'platform/game-agnostic')]);
  result = JSON.parse(execFileSync(process.execPath, ['clone-verify-activation-v4.mjs'], { cwd: resolve(repo, 'platform/game-agnostic/stage3h-owner-governed-v1'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeExclusive(OUT, {
  schema: 'STAGE3H_V4_ACTIVE_REGISTRATION_CLEAN_CLONE_VERIFICATION_V1', registrationCommit: commit, registrationHash: reg.registrationHash, inheritanceHead: inh.head,
  method: 'git clone of the local repository at the registration commit into a fresh temporary directory; overlay of the 30 policy-protected bound sources from the local byte-preserving package; node clone-verify-activation-v4.mjs inside the clone',
  protectedOverlay: { files: idc.protectedOverlay.files, packageSha256: idc.protectedOverlay.packageSha256, packageCommitted: false }, result, cloneRemovedAfterVerification: !existsSync(tmp), registeredWorldsGenerated: 0, authority: 'R0',
});
console.log(JSON.stringify({ commit, verdict: result.verdict, result }, null, 1));
