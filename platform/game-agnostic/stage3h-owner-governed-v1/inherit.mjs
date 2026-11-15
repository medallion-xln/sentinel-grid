// Inheritance for STAGE3H_OWNER_GOVERNED_QUALIFICATION_V1: chains the decision-value closure (ASCII V1 41ed9a7e,
// guard chain over 14,447 protected files, Stage 3F/3G, milestones, frozen rule, roster), adds the closure commit and
// the unchanged V3 contract/amendment identity. Read-only.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyV1 } from '../stage3h-decision-value-closure/inherit.mjs';
export const LANE = dirname(fileURLToPath(import.meta.url));
export const GA = resolve(LANE, '..');
const ROOT = resolve(GA, '../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
export const CLOSURE_COMMIT = 'a2c7961767926a86752e940ca9b604040c4f62c0';
export const V3 = 'stage3h-final-review-handoff/amendments/v3';
export const V3_AMENDMENT_HASH = '525a00476892ca62414ae55ddea6401a6ee9da86db1f8f4537de3c3e9cd14a5c';
export const V3_COMMIT = '320a07da6de6385dceb054e9c1d6b1048916bfa6';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export function verifyOwnerLane() {
  const v1 = verifyV1();
  let closureAncestor = true; try { git(['merge-base', '--is-ancestor', CLOSURE_COMMIT, 'HEAD']); } catch { closureAncestor = false; }
  const closureClean = git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-decision-value-closure']) === '';
  const target = JSON.parse(readFileSync(resolve(GA, V3, 'review-target.json'), 'utf8'));
  const bindingsOk = Object.entries(target.bindings).filter(([p]) => !p.startsWith('@')).every(([p, h]) => sha(readFileSync(resolve(GA, V3, p))) === h);
  const v3Committed = git(['diff', '--quiet', V3_COMMIT, 'HEAD', '--', 'platform/game-agnostic/' + V3]) === '';
  const out = { ...v1, closureCommit: CLOSURE_COMMIT, closureCommitAncestorOfHead: closureAncestor, closureLaneCleanSinceCommit: closureClean,
    v3AmendmentHash: target.amendmentHash, v3AmendmentHashMatches: target.amendmentHash === V3_AMENDMENT_HASH, v3BoundFilesUnchanged: bindingsOk, v3UnchangedSince320a07da: v3Committed };
  if (!closureAncestor || !closureClean || !out.v3AmendmentHashMatches || !bindingsOk || !v3Committed) throw Error('OWNER_LANE_INHERITANCE_FAILED:' + JSON.stringify(out));
  return out;
}
