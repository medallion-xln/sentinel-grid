// Successor preparation, Phase 7 clean clone (no registered world; nothing allocated, activated or authorized).
// 1. Packages the candidate's bound sources that are untracked by project policy (protected bytes are never committed)
//    into registration/protected-source-package-<candidate8>.tar.gz (gitignored), byte-preserving.
// 2. Clones the local repository at HEAD (which must contain the candidate, with the lane committed and clean) into a fresh
//    temporary directory, overlays the package, runs `node clone-verify-v4.mjs` inside the clone, removes the clone.
// 3. Writes evidence/successor-v4-preflight/clean-clone-verification.json once.
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
const OUT = resolve(LANE, 'evidence/successor-v4-preflight/clean-clone-verification.json'); ok(!existsSync(OUT), 'ALREADY_RECORDED');
const cand = JSON.parse(readFileSync(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V4.json'), 'utf8'));
const commit = git(['rev-parse', 'HEAD']);
ok(git(['cat-file', '-e', commit + ':platform/game-agnostic/stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE_V4.json']) === '', 'CANDIDATE_NOT_COMMITTED');
const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-owner-governed-v1']).split('\n').filter((l) => l && !/evidence\/successor-v4-preflight\//.test(l));
ok(dirty.length === 0, 'LANE_NOT_CLEAN:' + JSON.stringify(dirty));

const tracked = new Set(git(['ls-files', '--', 'platform/game-agnostic']).split('\n').map((f) => f.replace(/^platform\/game-agnostic\//, '')));
const untracked = Object.keys(cand.bindings.sources).filter((f) => !tracked.has(f)).sort();
const pkg = resolve(LANE, 'registration/protected-source-package-' + cand.registrationHash.slice(0, 8) + '.tar.gz');
ok(!existsSync(pkg), 'PACKAGE_EXISTS');
const list = resolve(tmpdir(), 'sg-successor-package-list-' + process.pid); writeFileSync(list, untracked.join('\n') + '\n');
execFileSync('/usr/bin/tar', ['-czf', pkg, '-C', GA, '-T', list]); rmSync(list);
ok(git(['check-ignore', '-q', pkg]) === '', 'PACKAGE_NOT_GITIGNORED');

const tmp = mkdtempSync(resolve(tmpdir(), 'sg-successor-clone-')), repo = resolve(tmp, 'repo');
let result;
try {
  execFileSync('/usr/bin/git', ['clone', '--quiet', '--no-hardlinks', ROOT, repo]);
  git(['checkout', '--quiet', commit], repo);
  execFileSync('/usr/bin/tar', ['-xzf', pkg, '-C', resolve(repo, 'platform/game-agnostic')]);
  const out = execFileSync(process.execPath, ['clone-verify-v4.mjs'], { cwd: resolve(repo, 'platform/game-agnostic/stage3h-owner-governed-v1'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  result = JSON.parse(out);
} finally { rmSync(tmp, { recursive: true, force: true }); }
writeExclusive(OUT, {
  schema: 'STAGE3H_SUCCESSOR_CLEAN_CLONE_VERIFICATION_V1', candidateHash: cand.registrationHash, commit, inheritanceHead: inh.head,
  method: 'git clone of the local repository at the commit containing the candidate into a fresh temporary directory; overlay of the policy-protected bound sources (untracked by project policy) from a local byte-preserving package; node clone-verify-v4.mjs inside the clone',
  protectedOverlay: { files: untracked, packageSha256: fsha(pkg), packageCommitted: false, reason: 'protected source bytes are not committed without separate authorization' },
  result, cloneRemovedAfterVerification: !existsSync(tmp), registeredWorldsGenerated: 0, authority: 'R0',
});
console.log(JSON.stringify({ commit, overlay: untracked.length, verdict: result.verdict, result }, null, 1));
