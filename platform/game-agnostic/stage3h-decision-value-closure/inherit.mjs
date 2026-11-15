// Inheritance for the decision-value closure: committed ASCII V1 lane unchanged since its commit, V1 guard chain
// (14,447 protected files, Stage 3F/3G, ASCII sources, milestones, frozen rule, roster), protocol and evidence hashes.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { verifyInheritance, laneClosure, rawHash } from '../stage3h-ascii-competence-v1/guard.mjs';
import { buildProtocol, protocolHash } from '../stage3h-ascii-competence-v1/protocol.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
export const V1 = resolve(HERE, '../stage3h-ascii-competence-v1');
export const V1_COMMIT = '41ed9a7e45af74753b96035ce2ce590c113a41c2';
export const PROTOCOL_SHA = '9737339c0f9c5ff1f30146b2239821e43f9eefb2d2e6e5967a0827d2455a1b6f';
const ROOT = resolve(HERE, '../../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
export function verifyV1() {
  const base = verifyInheritance();
  let ancestor = true; try { git(['merge-base', '--is-ancestor', V1_COMMIT, 'HEAD']); } catch { ancestor = false; }
  const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-ascii-competence-v1']);
  const result = JSON.parse(readFileSync(resolve(V1, 'RESULT.json'), 'utf8'));
  const evidenceOk = Object.entries(result.evidenceHashes).every(([f, h]) => rawHash(resolve(V1, 'evidence', f)) === h);
  const out = { head: base.head, protectedCount: base.canonicalProtectedCount, asciiSourcesUnchanged: base.asciiSourcesUnchanged, extraSourcesUnchanged: base.extraSourcesUnchanged,
    milestonesAncestors: base.allMilestonesAncestors, frozenRuleHashMatches: base.frozenRuleHashMatches, oraclePath: base.oraclePath, rosterPreserved: base.rosterPreserved,
    v1Commit: V1_COMMIT, v1CommitAncestorOfHead: ancestor, v1LaneCleanSinceCommit: dirty === '', v1LaneClosureMatches: laneClosure().hash === result.laneClosure.hash,
    protocolHashMatches: protocolHash(buildProtocol()) === PROTOCOL_SHA && JSON.parse(readFileSync(resolve(V1, 'evidence/protocol.json'), 'utf8')).protocolSha256 === PROTOCOL_SHA,
    protocolStatus: buildProtocol().status, v1EvidenceHashesMatch: evidenceOk, authority: 'R0' };
  if (!ancestor || dirty !== '' || !out.v1LaneClosureMatches || !out.protocolHashMatches || !evidenceOk || out.protocolStatus !== 'PROPOSED_NOT_REGISTERED') throw Error('V1_INHERITANCE_FAILED:' + JSON.stringify(out));
  return out;
}
