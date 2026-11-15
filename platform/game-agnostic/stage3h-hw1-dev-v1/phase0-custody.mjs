// H-W1 DEV Phase 0 record. READ-ONLY on the repository. Records the custody and commit baseline that the I-0..I-5 study starts from.
// Contents of protected files are never read here: only the recorded blob ids (.git/custody/protected-identities.tsv).
// Usage: node phase0-custody.mjs [--write]   (--write records evidence/PHASE0_CUSTODY_AND_COMMITS.json once, only if every check passes)
import { readFileSync, statfsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(LANE, '../../..');
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trimEnd();
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const BASE_MAIN = '2937efb720f00e12875cfc0a13a678277b187be4', ORIGINAL_BASELINE = '2d26176ae55f59009796c546fd42f2635e7da5bb';
const EVIDENCE_COMMITS = { custodyAuditLane: '0fa84a77', widerActionLane: '2937efb7' };
const HOOKS = { 'pre-commit': '48b0a8fe', 'pre-merge-commit': '16addf3f', 'pre-push': '36e70802' };

const protectedBlobs = new Set(readFileSync(resolve(ROOT, '.git/custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'))
  .flatMap((l) => l.split('\t').filter((c) => /^[0-9a-f]{40}$/.test(c))));
const reachable = (rev) => { const s = new Set(git(['rev-list', '--objects', rev]).split('\n').map((l) => l.split(' ')[0])); return [...protectedBlobs].filter((b) => s.has(b)).length; };
const refs = git(['for-each-ref', '--format=%(refname) %(objectname)']).split('\n').sort();
const free = statfsSync(ROOT); const freeGiB = Math.floor((free.bavail * free.bsize) / 2 ** 30);
const hooks = Object.fromEntries(Object.keys(HOOKS).map((h) => [h, sha256(readFileSync(resolve(ROOT, '.git/hooks', h))).slice(0, 8)]));
const ancestor = (a, b) => { try { execFileSync('/usr/bin/git', ['-C', ROOT, 'merge-base', '--is-ancestor', a, b]); return true; } catch { return false; } };
const diffNames = (a, b) => git(['diff', '--name-status', a, b]).split('\n').filter(Boolean);
const changedSinceBaseline = diffNames(ORIGINAL_BASELINE, BASE_MAIN);
const additionsOnly = changedSinceBaseline.every((l) => l.startsWith('A\t'));
const unrelatedPaths = changedSinceBaseline.filter((l) => !/\tplatform\/game-agnostic\/(stage3h-custody-audit-v1|stage3h-wider-action-feasibility-v1)\//.test(l));
const fsck = (() => { try { return { ok: true, out: git(['fsck', '--no-dangling']).slice(0, 400) }; } catch (e) { return { ok: false, out: String(e.stderr ?? e.message).slice(0, 400) }; } })();
const protectedOnMain = reachable('main'), protectedOnCodexRef = reachable(refs.find((r) => r.startsWith('refs/codex/')).split(' ')[1]), protectedOnPreRemediation = reachable('refs/custody/pre-remediation-main');
const originMain = git(['rev-parse', 'refs/remotes/origin/main']);

const checks = {
  mainIsBase: git(['rev-parse', 'main']) === BASE_MAIN && git(['rev-parse', 'HEAD']) === BASE_MAIN,
  baselineIsAncestor: ancestor(ORIGINAL_BASELINE, BASE_MAIN),
  evidenceCommitsOnMain: Object.values(EVIDENCE_COMMITS).every((c) => ancestor(c, 'main')),
  evidenceCommitsAdditionsOnlyInTwoLanes: additionsOnly && unrelatedPaths.length === 0,
  protectedBlobsReachableFromMain0: protectedOnMain === 0,
  protectedBlobsStillOnRetainedRefs: protectedOnCodexRef === 30 && protectedOnPreRemediation === 30,
  twelveRefs: refs.length === 12,
  hooksUnchanged: Object.entries(HOOKS).every(([h, p]) => hooks[h] === p),
  originMainUnchanged: originMain.startsWith('e7fe50fd'),
  fsckClean: fsck.ok,
  freeDiskAtLeast8GiB: freeGiB >= 8,
};
const pass = Object.values(checks).every(Boolean);
const out = { schema: 'H_W1_DEV_PHASE0_CUSTODY_AND_COMMITS_V1', authority: 'R0', checkedAt: new Date().toISOString(), baseMain: BASE_MAIN, originalBaseline: ORIGINAL_BASELINE,
  commitsOnMain: Number(git(['rev-list', '--count', 'main'])), evidenceCommits: EVIDENCE_COMMITS, filesAddedSinceBaseline: changedSinceBaseline.length, nonAdditionsSinceBaseline: changedSinceBaseline.filter((l) => !l.startsWith('A\t')).length,
  protectedIdentities: protectedBlobs.size, protectedBlobsReachable: { main: protectedOnMain, codexCheckpointRef: protectedOnCodexRef, preRemediationMain: protectedOnPreRemediation },
  refCount: refs.length, refSnapshotSha256: sha256(refs.join('\n')), originMain, hooksSha256Prefix: hooks, freeDiskGiB: freeGiB, fsck, checks, pass,
  notes: ['The 30 protected blobs stay reachable from the retained refs only. Nothing was pushed, purged or garbage-collected (A5 not authorised).', 'The overlay (31 files) is untracked and excluded via .git/info/exclude and is never staged.', 'R0 runtime-identity drift is a separate open finding and is neither measured nor claimed closed here.'] };
if (process.argv.includes('--write')) { if (!pass) throw Error('PHASE0_NOT_CLEAN_NOT_RECORDED'); writeExclusive(resolve(LANE, 'evidence/PHASE0_CUSTODY_AND_COMMITS.json'), out); }
console.log(JSON.stringify({ pass, checks, protectedBlobsReachable: out.protectedBlobsReachable, filesAddedSinceBaseline: out.filesAddedSinceBaseline, nonAdditionsSinceBaseline: out.nonAdditionsSinceBaseline, unrelatedPaths, freeGiB, refCount: refs.length }, null, 1));
