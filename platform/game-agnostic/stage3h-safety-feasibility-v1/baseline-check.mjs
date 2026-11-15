// Phase 1: preserve the baseline. Read-only except for evidence/baseline.json (written once).
// DEV exclusion authority = the structured records (DEV_WORLD_IDENTITIES.json, prior-world-exclusions.json and the
// worldHash fields of the V4 ledgers), not repository text search.
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { evidenceImmutability } from '../stage3h-failure-diagnosis-v1/adjudicate.mjs';
import { describeRecords } from '../stage3h-failure-diagnosis-v1/repro/manifest.mjs';
import { verifyOwnerLane } from '../stage3h-owner-governed-v1/inherit.mjs';
import { AUTHORITY, ROSTER } from '../stage3h-canonical-v1/evidence.mjs';
import { BASE_COMMIT } from './contract.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), GA = resolve(LANE, '..'), ROOT = resolve(GA, '../..');
const git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8')), fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const DIAG = 'stage3h-failure-diagnosis-v1', REPRO = DIAG + '/evidence/reproducibility';

const v4 = evidenceImmutability();
const dossierFinal = readFileSync(resolve(GA, 'stage3h-owner-governed-v1/QUALIFICATION_DOSSIER_7c41ba89.md'), 'utf8').includes('BOUNDED_SELECTOR_QUALIFICATION=BOUNDED_SELECTOR_NOT_QUALIFIED');
const diagnosisDiff = git(['diff', '--name-only', BASE_COMMIT, '--', 'platform/game-agnostic/' + DIAG]);
const diagnosisStatus = git(['status', '--porcelain', '--', 'platform/game-agnostic/' + DIAG]);
const manifest = J(REPRO + '/DEV_RUN_MANIFEST.json'), regen = J(REPRO + '/REGENERATION_VERIFICATION.json');
const now = describeRecords(resolve(GA, DIAG, 'dev-runs'));
const reproMismatch = Object.entries(manifest.records).filter(([k, v]) => now[k]?.rawSha256 !== v.rawSha256 || now[k]?.normalizedSha256 !== v.normalizedSha256).map(([k]) => k);
const inheritance = verifyOwnerLane();
// structured DEV exclusion records
const ids = J(REPRO + '/DEV_WORLD_IDENTITIES.json'), prior = J('stage3h-owner-governed-v1/evidence/prior-world-exclusions.json');
const devHashes = new Set(Object.values(ids.sets).flatMap((s) => s.worldByIdx.filter((x) => !x.startsWith('REJECTED:'))));
const v4Hashes = new Set(); const runs = resolve(GA, 'stage3h-owner-governed-v1/runs/7c41ba89c5c63489');
for (const r of ['A', 'B']) for (const f of readdirSync(resolve(runs, r)).filter((n) => n.endsWith('.ledger.json'))) for (const e of JSON.parse(readFileSync(resolve(runs, r, f), 'utf8'))) v4Hashes.add(e.worldHash);
const priorSet = new Set(prior.priorWorldHashes), dev288 = new Set(ids.sets.DEV288.worldByIdx);
const out = { schema: 'STAGE3H_SAFETY_FEASIBILITY_BASELINE_V1', authority: 'R0', baseCommit: BASE_COMMIT, head: git(['rev-parse', 'HEAD']),
  v4: { evidenceUnchanged: v4.evidenceCommitAncestorOfHead && v4.laneStatusClean && v4.laneDiffVsEvidenceCommit.length === 0 && v4.allBlobsUnchanged, trackedEvidenceFiles: v4.trackedEvidenceFiles, negativeVerdictFinal: dossierFinal },
  diagnosis: { unchangedSinceBase: diagnosisDiff === '' && diagnosisStatus === '', classification: readFileSync(resolve(GA, DIAG, 'RESULT.md'), 'utf8').match(/DIAGNOSIS_CLASSIFICATION=([^\n]+)/)[1] },
  reproducibility: { recordsChecked: Object.keys(manifest.records).length, rawAndNormalizedHashesMatchManifest: reproMismatch.length === 0, mismatches: reproMismatch, regenerationVerdict: regen.verdict,
    manifestBlobUnchanged: git(['diff', '--name-only', BASE_COMMIT, '--', 'platform/game-agnostic/' + REPRO]) === '' },
  protectedFiles: { canonicalProtectedCount: inheritance.protectedCount, rosterPreserved: inheritance.rosterPreserved, milestonesAncestors: inheritance.milestonesAncestors, frozenRuleHashMatches: inheritance.frozenRuleHashMatches },
  roster: ROSTER, authorityConstant: AUTHORITY,
  devExclusion: { authority: 'structured records: ' + REPRO + '/DEV_WORLD_IDENTITIES.json, stage3h-owner-governed-v1/evidence/prior-world-exclusions.json, V4 ledger worldHash fields',
    identitiesSha256: fsha(REPRO + '/DEV_WORLD_IDENTITIES.json'), identitiesShaMatchesManifest: fsha(REPRO + '/DEV_WORLD_IDENTITIES.json') === manifest.worldIdentitiesFile.sha256,
    blocks: ids.blocks, wholeBlocksExcluded: [951, 952].every((b) => ids.blocks[b] && ids.blocks[b].excludedRange[0] === b * 1e9 && ids.blocks[b].excludedRange[1] === b * 1e9 + 999999999),
    devWorldHashes: devHashes.size, freshDevHashesInPriorExclusions: [...devHashes].filter((h) => priorSet.has(h) && !dev288.has(h)).length, devHashesInV4Ledgers: [...devHashes].filter((h) => v4Hashes.has(h)).length,
    priorExclusions: { schema: prior.schema, worldHashes: prior.priorWorldHashes.length, unique: priorSet.size === prior.priorWorldHashes.length, priorSeeds: prior.priorSeeds.length,
      blobUnchanged: git(['diff', '--name-only', BASE_COMMIT, '--', 'platform/game-agnostic/stage3h-owner-governed-v1/evidence/prior-world-exclusions.json']) === '' },
    v4LedgerWorldHashes: v4Hashes.size } };
out.pass = out.v4.evidenceUnchanged && out.v4.negativeVerdictFinal && out.diagnosis.unchangedSinceBase && out.reproducibility.rawAndNormalizedHashesMatchManifest && out.reproducibility.regenerationVerdict === 'REGENERATION_PASS'
  && out.reproducibility.manifestBlobUnchanged && out.protectedFiles.canonicalProtectedCount === 14447 && out.protectedFiles.rosterPreserved && AUTHORITY.tier === 'R0' && AUTHORITY.canDispatch === false && AUTHORITY.canMutateLiveWorld === false
  && out.devExclusion.identitiesShaMatchesManifest && out.devExclusion.wholeBlocksExcluded && out.devExclusion.freshDevHashesInPriorExclusions === 0 && out.devExclusion.devHashesInV4Ledgers === 0 && out.devExclusion.priorExclusions.unique && out.devExclusion.priorExclusions.blobUnchanged;
if (!existsSync(resolve(LANE, 'evidence'))) mkdirSync(resolve(LANE, 'evidence'));
writeExclusive(resolve(LANE, 'evidence/baseline.json'), out);
console.log(JSON.stringify(out, null, 1));
