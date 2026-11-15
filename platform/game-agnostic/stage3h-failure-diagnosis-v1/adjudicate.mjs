// Phase 1: formal owner adjudication of registration 7c41ba89 (recorded on the owner's session instruction of
// 2026-10-22; not a cryptographic signature). Reads only git metadata and the published dossier summary values;
// opens no V4 row, ledger or ANALYSIS.json content. Verifies that every tracked V4 lane file is byte-identical to
// the evidence commit, then writes evidence/ADJUDICATION_7c41ba89.json exactly once.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { LANE, GA, ok, writeExclusive } from './lib.mjs';

const ROOT = resolve(GA, '../..'), V4 = 'platform/game-agnostic/stage3h-owner-governed-v1';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
export const REGISTRATION = '7c41ba89c5c63489b4b4b6351716889460996b688e8ab897197a64a6fb7014cc';
export const REGISTRATION_COMMIT = '01d4cc34cdee7f498f413396708f14acf13e2d33';
export const EVIDENCE_COMMIT = 'e46329ccc76fb93c6db835b505e466b3cf952b13';

export function evidenceImmutability() {
  ok(git('cat-file', '-t', REGISTRATION_COMMIT) === 'commit' && git('cat-file', '-t', EVIDENCE_COMMIT) === 'commit', 'COMMITS_MISSING');
  let ancestor = true; try { git('merge-base', '--is-ancestor', EVIDENCE_COMMIT, 'HEAD'); } catch { ancestor = false; }
  const status = git('status', '--porcelain', '--', V4), diff = git('diff', '--name-only', EVIDENCE_COMMIT, '--', V4);
  const tracked = git('ls-tree', '-r', EVIDENCE_COMMIT, '--', V4 + '/runs/7c41ba89c5c63489', V4 + '/QUALIFICATION_DOSSIER_7c41ba89.md', V4 + '/registration/ACTIVE_REGISTRATION_V4.json', V4 + '/evidence/execution-7c41ba89')
    .split('\n').filter(Boolean).map((l) => { const [meta, path] = l.split('\t'); return { path: path.slice(V4.length + 1), blob: meta.split(' ')[2] }; });
  const working = tracked.map((t) => ({ ...t, workingBlob: git('hash-object', resolve(ROOT, V4, t.path)) }));
  return { evidenceCommitAncestorOfHead: ancestor, laneStatusClean: status === '', laneDiffVsEvidenceCommit: diff === '' ? [] : diff.split('\n'),
    trackedEvidenceFiles: working.length, allBlobsUnchanged: working.every((w) => w.blob === w.workingBlob), files: working.map(({ path, blob }) => ({ path, blob })) };
}

export function adjudication() {
  const imm = evidenceImmutability();
  ok(imm.evidenceCommitAncestorOfHead && imm.laneStatusClean && imm.laneDiffVsEvidenceCommit.length === 0 && imm.allBlobsUnchanged, 'V4_EVIDENCE_CHANGED');
  return {
    schema: 'STAGE3H_V4_OWNER_ADJUDICATION_V1', authority: 'R0', date: '2026-10-22',
    registration: REGISTRATION, registrationCommit: REGISTRATION_COMMIT, evidenceCommit: EVIDENCE_COMMIT,
    registeredResult: 'BOUNDED_SELECTOR_NOT_QUALIFIED', registeredDisposition: 'BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_HARM',
    registrationStatus: 'COMPLETE_AND_IRREVOCABLY_CONSUMED',
    ownerAdjudication: {
      DECISION_VALUE: 'STRONG_REPLICATED_POSITIVE_EVIDENCE', IDENTITY_INVARIANCE: 'FAILED', CATASTROPHE_VETO_VS_N: 'FAILED', BEST_OF_GAP: 'FAILED',
      BOUNDED_SELECTOR_QUALIFICATION: 'NOT_QUALIFIED', FULL_CANONICAL_STAGE3H_CERTIFIED: false, INDEPENDENT_REVIEW: false, CANONICAL_MOE_GAIN: 'NOT_ESTABLISHED',
    },
    publishedBasis: {
      source: 'QUALIFICATION_DOSSIER_7c41ba89.md (published aggregates only; nothing recomputed)',
      decisionValue: 'all four primaries MATERIAL_BENEFIT in 10/10 panels (R-B -0.193..-0.250; R-N -0.176..-0.225; H0 R-B -0.387..-0.499; H2 R-N -0.353..-0.449)',
      identity: 'IDENTITY (O-2R.1) nuisance fails in 10/10 panels, maximum adjusted upper bound 0.075-0.119 against 0.02; D4 and ORDER pass 40/40',
      catastropheVsN: '35 introductions vs Nexus-else-S0, all at H2 where R = S0; zero-introduction veto fails in 9/10 panels; vs S0 0 introductions, pass 20/20',
      bestOfGap: 'adjusted upper bound of R - min(B, N) 0.0205-0.0232 > 0.02 in 5/10 panels',
    },
    rule: 'Passing regret comparisons cannot override the three failed qualification requirements. The registered criteria are conjunctive: material regret benefit is necessary, not sufficient. The IDENTITY nuisance, catastrophe zero-introduction (vs N) and best-of-gap failures are valid registered failures; the small best-of-gap exceedances are not treated as irrelevant, and the 0.02 thresholds are not relaxed.',
    immutability: { ...imm, rule: 'Original V4 evidence and verdict are immutable. No V4 output is modified, rerun, rescored, refiltered, reinterpreted or retuned.' },
    reanalysisPerformed: false, v4DecisionRowsRead: false, v4AnalysisContentRead: false,
    researchStates: { V4_OWNER_GOVERNED_STUDY: 'COMPLETE_QUALIFIED_NEGATIVE', ORIGINAL_FROZEN_SELECTOR: 'NOT_QUALIFIED', CANONICAL_STAGE3H: 'INCOMPLETE' },
    recordedBy: 'Claude session on the owner\'s instruction; session instruction, not a signature', ownerGoverned: true, independentReviewer: null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'adjudicate.mjs')) {
  const rec = adjudication();
  writeExclusive(resolve(LANE, 'evidence/ADJUDICATION_7c41ba89.json'), rec);
  console.log(JSON.stringify({ written: 'evidence/ADJUDICATION_7c41ba89.json', trackedEvidenceFiles: rec.immutability.trackedEvidenceFiles, allBlobsUnchanged: rec.immutability.allBlobsUnchanged }));
}
