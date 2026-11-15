// Closure Phase 1: frozen inheritance at HEAD (read-only; writes evidence/closure/inheritance.json once).
// Uses /usr/bin/git (the PATH git is a wrapper that decorates diff output). No sealed V4 outcome is read.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { evidenceImmutability } from '../../stage3h-failure-diagnosis-v1/adjudicate.mjs';
import { describeRecords } from '../../stage3h-failure-diagnosis-v1/repro/manifest.mjs';
import { verifyOwnerLane } from '../../stage3h-owner-governed-v1/inherit.mjs';
import { AUTHORITY, ROSTER } from '../../stage3h-canonical-v1/evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
export const DIAG_BASE = '8d15408195b469b1ec5a7162e1bf6b16efb9b1aa', OWNER_COMMIT = '8749fd442f3872faadd7cf76b4aea91bc0d51ffa';
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 }).trim();
const sha = (b) => createHash('sha256').update(b).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const P = (p) => 'platform/game-agnostic/' + p;

export function inheritance() {
  const head = git(['rev-parse', 'HEAD']);
  const v4 = evidenceImmutability();
  const dossierFinal = readFileSync(resolve(GA, 'stage3h-owner-governed-v1/QUALIFICATION_DOSSIER_7c41ba89.md'), 'utf8').includes('BOUNDED_SELECTOR_QUALIFICATION=BOUNDED_SELECTOR_NOT_QUALIFIED');
  // failure diagnosis: unchanged since its last commit (8d154081) through HEAD, and clean in the working tree
  const diagDiff = git(['diff', '--name-only', DIAG_BASE, 'HEAD', '--', P('stage3h-failure-diagnosis-v1')]), diagStatus = git(['status', '--porcelain', '--', P('stage3h-failure-diagnosis-v1')]);
  const manifest = J('stage3h-failure-diagnosis-v1/evidence/reproducibility/DEV_RUN_MANIFEST.json'), now = describeRecords(resolve(GA, 'stage3h-failure-diagnosis-v1/dev-runs'));
  const reproMismatch = Object.entries(manifest.records).filter(([k, v]) => now[k]?.rawSha256 !== v.rawSha256 || now[k]?.normalizedSha256 !== v.normalizedSha256).map(([k]) => k);
  const chain = verifyOwnerLane();
  // native Forge World V2: every source bound by the V4 candidate (incl. the 57 src/ files) and src/ unchanged since 8d154081
  const bound = J('stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE_V4.json').bindings.sources;
  const boundMismatch = Object.entries(bound).filter(([p, h]) => !existsSync(resolve(GA, p)) || sha(readFileSync(resolve(GA, p))) !== h).map(([p]) => p);
  const srcDiff = git(['diff', '--name-only', DIAG_BASE, 'HEAD', '--', P('src')]);
  // owner commit 8749fd44: what it modified (vs added), and the custody status of the 30 protected package files
  const ownerNonAdds = git(['diff', '--name-status', DIAG_BASE, OWNER_COMMIT]).split('\n').filter((l) => l && !l.startsWith('A\t'));
  const record = J('stage3h-owner-governed-v1/evidence/successor-v4-preflight/clean-clone-verification.json').protectedOverlay;
  const custody = record.files.map((f) => { let blob = null; try { blob = execFileSync('/usr/bin/git', ['-C', ROOT, 'show', `${OWNER_COMMIT}:${P(f)}`], { maxBuffer: 64 << 20 }); } catch {}
    return { path: f, trackedAtOwnerCommit: blob !== null, committedBytesEqualBound: blob !== null && sha(blob) === bound[f] }; });
  const lane = git(['status', '--porcelain', '--untracked-files=all', '--', P('stage3h-safety-feasibility-v1')]).split('\n').filter((l) => l && !l.includes('/closure/') && !l.includes('/evidence/closure/'));
  const out = { schema: 'STAGE3H_SAFETY_CLOSURE_INHERITANCE_V1', authority: 'R0', head, headIsDescendantOfDiagnosisBase: (() => { try { git(['merge-base', '--is-ancestor', DIAG_BASE, 'HEAD']); return true; } catch { return false; } })(),
    v4: { verdict: dossierFinal ? 'BOUNDED_SELECTOR_NOT_QUALIFIED' : 'UNKNOWN', evidenceFiles: v4.trackedEvidenceFiles, byteIdentical: v4.evidenceCommitAncestorOfHead && v4.laneStatusClean && v4.laneDiffVsEvidenceCommit.length === 0 && v4.allBlobsUnchanged },
    failureDiagnosis: { unchangedSince8d154081: diagDiff === '' && diagStatus === '', classification: readFileSync(resolve(GA, 'stage3h-failure-diagnosis-v1/RESULT.md'), 'utf8').match(/DIAGNOSIS_CLASSIFICATION=([^\n]+)/)[1] },
    reproducibilityManifest: { records: Object.keys(manifest.records).length, rawAndNormalizedMatch: reproMismatch.length === 0, mismatches: reproMismatch },
    protectedFiles: { count: chain.protectedCount, milestonesAncestors: chain.milestonesAncestors, frozenRuleHashMatches: chain.frozenRuleHashMatches, v3BoundFilesUnchanged: chain.v3BoundFilesUnchanged },
    nativeForgeWorldV2: { v4BoundSources: Object.keys(bound).length, boundSourceMismatches: boundMismatch, srcChangedSince8d154081: srcDiff === '' ? [] : srcDiff.split('\n') },
    roster: { roster: ROSTER, preserved: chain.rosterPreserved }, authority: AUTHORITY,
    ownerCommit8749fd44: { commit: OWNER_COMMIT, modifiedOrDeleted: ownerNonAdds, frozenFilesModified: ownerNonAdds.filter((l) => !/docs\/stage3f5-integrated-live-shadow\.md|game-agnostic\/package\.json/.test(l)),
      safetyFeasibilityLaneCommitted: true, safetyFeasibilityLaneWorkingTreeMatches: lane.length === 0,
      protectedPackageFilesNowTracked: custody.filter((c) => c.trackedAtOwnerCommit).length, protectedPackageFiles: custody.length, committedProtectedBytesEqualBound: custody.every((c) => c.committedBytesEqualBound),
      custodyNote: 'The owner commit 8749fd44 added the 30 protected-source package files to Git. The prior custody rule (stage3h-owner-governed-v1/.gitignore, evidence/successor-v4-preflight) kept protected bytes out of Git without separate authorization; no authorization record for this change was found. The committed bytes equal the bound hashes. Recorded, not reverted; owner decision.' } };
  out.pass = out.headIsDescendantOfDiagnosisBase && out.v4.verdict === 'BOUNDED_SELECTOR_NOT_QUALIFIED' && out.v4.byteIdentical && out.v4.evidenceFiles === 57 && out.failureDiagnosis.unchangedSince8d154081
    && out.reproducibilityManifest.rawAndNormalizedMatch && out.protectedFiles.count === 14447 && boundMismatch.length === 0 && out.nativeForgeWorldV2.srcChangedSince8d154081.length === 0
    && chain.rosterPreserved && AUTHORITY.tier === 'R0' && AUTHORITY.canDispatch === false && AUTHORITY.canMutateLiveWorld === false && out.ownerCommit8749fd44.frozenFilesModified.length === 0;
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(LANE, 'evidence/closure'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const out = inheritance(); writeExclusive(resolve(dir, 'inheritance.json'), out);
  console.log(JSON.stringify(out, null, 1));
}
