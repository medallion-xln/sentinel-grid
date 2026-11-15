// Task 4 integrity verification for the reproducibility correction. Read-only except for its own output, written once
// to evidence/reproducibility/INTEGRITY.json. Reuses the existing checks:
//   V4 evidence immutability (adjudicate.mjs#evidenceImmutability), protected-file chain (V4 lane inherit.mjs#verifyOwnerLane:
//   14,447 canonical protected files, milestones, frozen rule, roster, V3 bindings), the 237 sources bound by the V4 candidate,
//   and the registered namespace allocator's own exclusion functions for DEV blocks 951/952.
// Usage (from the lane): node repro/integrity.mjs
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { LANE, GA, ok, writeExclusive } from '../lib.mjs';
import { evidenceImmutability } from '../adjudicate.mjs';
import { verifyOwnerLane } from '../../stage3h-owner-governed-v1/inherit.mjs';
import { blockFailures, scanRepositoryText, FIRST_BLOCK, LAST_BLOCK } from '../../stage3h-owner-governed-v1/allocate-namespaces-v4.mjs';
import { OUT_DIR } from './manifest.mjs';
import { BASE_COMMIT, CANDIDATE } from './source-closure.mjs';

const ROOT = resolve(GA, '../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const fsha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const LANE_REL = 'platform/game-agnostic/stage3h-failure-diagnosis-v1';
ok(!existsSync(resolve(OUT_DIR, 'INTEGRITY.json')), 'ALREADY_RECORDED');

// V4 evidence and verdict
const v4 = evidenceImmutability();
const dossierVerdict = readFileSync(resolve(GA, 'stage3h-owner-governed-v1/QUALIFICATION_DOSSIER_7c41ba89.md'), 'utf8').includes('BOUNDED_SELECTOR_QUALIFICATION=BOUNDED_SELECTOR_NOT_QUALIFIED');
const adjudication = JSON.parse(readFileSync(resolve(LANE, 'evidence/ADJUDICATION_7c41ba89.json'), 'utf8'));
// Protected files
const inheritance = verifyOwnerLane();
const bound = JSON.parse(readFileSync(resolve(GA, CANDIDATE), 'utf8')).bindings.sources;
const boundMismatches = Object.entries(bound).filter(([p, h]) => !existsSync(resolve(GA, p)) || fsha(resolve(GA, p)) !== h).map(([p]) => p);
// Sealed-data access: the measured regeneration closure may contain V4 ledgers (world-hash exclusion) but no row/lock/analysis file
const manifest = JSON.parse(readFileSync(resolve(OUT_DIR, 'DEV_RUN_MANIFEST.json'), 'utf8'));
const v4Files = manifest.sourceIdentity.entries.map((e) => e.path).filter((p) => p.startsWith('stage3h-owner-governed-v1/runs/'));
const sealedOutcomeFiles = v4Files.filter((p) => !/\.ledger\.json$/.test(p));
// DEV exclusion via the registered allocator's own rule (repository-text scan of each candidate block)
const textHits = scanRepositoryText(GA, 951_000_000_000, 953_000_000_000);
const blocks = Object.fromEntries([951, 952].map((b) => [b, { allocatorFailures: blockFailures(b * 1e9, { textHits }), insideV4AllocatorRange: b >= FIRST_BLOCK && b <= LAST_BLOCK,
  hitFiles: [...new Set(textHits.filter((h) => h.value >= b * 1e9 && h.value < (b + 1) * 1e9).map((h) => h.file))].sort() }]));
const identities = JSON.parse(readFileSync(resolve(OUT_DIR, 'DEV_WORLD_IDENTITIES.json'), 'utf8'));
const worldHashes = Object.values(identities.sets).flatMap((s) => s.worldByIdx.filter((x) => !x.startsWith('REJECTED:')));
// Diagnosis unchanged since the base commit
const diagnosisFiles = ['RESULT.md', 'lib.mjs', 'run-dev.mjs', 'candidates.mjs', 'adjudicate.mjs', 'd4-contrast.mjs', 'h2-mechanism.mjs', 'selector-study.mjs', 'phase5-feasibility.mjs',
  ...git(['ls-tree', '-r', '--name-only', BASE_COMMIT, '--', LANE_REL + '/evidence']).split('\n').map((p) => p.slice(LANE_REL.length + 1))];
const diagnosisDiff = git(['diff', '--name-only', BASE_COMMIT, '--', ...diagnosisFiles.map((f) => LANE_REL + '/' + f)]);
const trackedChanges = git(['diff', '--name-only', BASE_COMMIT]).split('\n').filter(Boolean);

const out = { schema: 'STAGE3H_REPRODUCIBILITY_INTEGRITY_V1', authority: 'R0', baseCommit: git(['rev-parse', BASE_COMMIT]), head: git(['rev-parse', 'HEAD']),
  v4EvidenceUnchanged: v4.evidenceCommitAncestorOfHead && v4.laneStatusClean && v4.laneDiffVsEvidenceCommit.length === 0 && v4.allBlobsUnchanged, v4TrackedEvidenceFiles: v4.trackedEvidenceFiles,
  v4NegativeVerdictFinal: dossierVerdict && adjudication.registeredResult === 'BOUNDED_SELECTOR_NOT_QUALIFIED' && adjudication.ownerAdjudication.BOUNDED_SELECTOR_QUALIFICATION === 'NOT_QUALIFIED',
  protectedFiles: { canonicalProtectedCount: inheritance.protectedCount, chain: 'stage3h-owner-governed-v1/inherit.mjs#verifyOwnerLane (throws on any mismatch)', milestonesAncestors: inheritance.milestonesAncestors,
    frozenRuleHashMatches: inheritance.frozenRuleHashMatches, rosterPreserved: inheritance.rosterPreserved, v3BoundFilesUnchanged: inheritance.v3BoundFilesUnchanged,
    v4CandidateBoundSources: Object.keys(bound).length, v4CandidateBoundSourceMismatches: boundMismatches },
  sealedData: { v4FilesInRegenerationClosure: v4Files, sealedRowLockOrAnalysisFilesInClosure: sealedOutcomeFiles,
    note: 'The original regeneration command reads only the worldHash field of the ten V4 ledgers for outcome-blind exclusion. This correction opened no V4 row, LOCK, admission or ANALYSIS file.' },
  devExclusion: { blocks, worldHashesRecorded: worldHashes.length, identitiesFile: 'evidence/reproducibility/DEV_WORLD_IDENTITIES.json', rule: identities.rule },
  diagnosis: { filesChecked: diagnosisFiles.length, changedSinceBase: diagnosisDiff === '' ? [] : diagnosisDiff.split('\n'), resultClassification: readFileSync(resolve(LANE, 'RESULT.md'), 'utf8').match(/DIAGNOSIS_CLASSIFICATION=([^\n]+)/)[1] },
  trackedChangesSinceBase: trackedChanges, newSelectorImplemented: false, newRegistration: false, newCampaign: false };
out.pass = out.v4EvidenceUnchanged && out.v4NegativeVerdictFinal && out.protectedFiles.canonicalProtectedCount === 14447 && boundMismatches.length === 0 && sealedOutcomeFiles.length === 0
  && [951, 952].every((b) => blocks[b].allocatorFailures.includes('REPOSITORY_TEXT_HIT')) && out.diagnosis.changedSinceBase.length === 0;
writeExclusive(resolve(OUT_DIR, 'INTEGRITY.json'), out);
console.log(JSON.stringify(out, null, 1));
