#!/usr/bin/env node
/* STAGE_3F_FORMAL_FREEZE certification.
 *
 *   npm run stage3f-freeze:certify   write the freeze certificate (the freeze artifact must already be committed)
 *   npm run stage3f-freeze:check     never writes; requires byte-identical reproduction
 *
 * Certifies that the committed Stage 3F freeze binds exactly the certified record: canonical lineage by commit
 * identity, the freeze artifact rebuilt byte for byte, every bound hash recomputed (semantic and raw, never
 * substituted), and the final scientific boundary reproduced read-only under SENTINEL_CANONICAL_NUMERICS_V1 —
 * Stage 3F-RP --check and Stage 3F.6-CR --check, which recomputes W-SYM (transitively P.1-SYM, P.1A-SYM, T-SYM, P.1E,
 * P.1D, P.1C), the D-SYM freeze and D-SYM. No scientific computation beyond that predecessor verification is performed.
 *
 * Like the Stage 3F.6-CR certifier, this runs the Stage 3F chain and so is named outside the certify-stage3f*
 * measurement-certifier pattern. Its --check path installs the CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE guard.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enforceCheckModeReadOnly, trackedTreeFingerprint } from './certification/check-mode-guard.mjs';
import { CANONICAL_PARENT_COMMIT, CR_CERTIFICATE, EXPERTS, FREEZE_PATH, FREEZE_STAGE_FILES, LINEAGE, RESULT_PATH, STAGE3F_FREEZE_VERSION, buildFreeze } from './stage3f-freeze.mjs';
import { AUTHORITY, CERT } from './stage3f6cr-plan.mjs';

const checkOnly = process.argv.includes('--check');
const guard = enforceCheckModeReadOnly({ checkOnly });

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const rel = (f) => `platform/game-agnostic/${f}`;
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
const git = (...a) => spawnSync('git', ['-C', top, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const log = (m) => process.stderr.write(`[stage3f-freeze] ${m}\n`);
const plainEnv = { ...process.env, NODE_OPTIONS: '' };
const treeBefore = trackedTreeFingerprint(top);

/* 1. canonical lineage (commit identities are fixed; nothing here depends on HEAD's own identity) */
const commitOf = (ref) => { const r = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`); return r.status === 0 ? r.stdout.trim() : null; };
const isAncestor = (a, b) => a !== null && b !== null && git('merge-base', '--is-ancestor', a, b).status === 0;
const parentsOf = (c) => git('rev-list', '--parents', '-n', '1', c).stdout.trim().split(' ').slice(1);
const freezeCommit = git('log', '--diff-filter=A', '--format=%H', '--', rel(FREEZE_PATH)).stdout.trim().split('\n').filter(Boolean).at(-1) ?? null;
const identities = Object.fromEntries(Object.entries(LINEAGE).filter(([k]) => k !== 'CANONICAL_BRANCH').map(([k, sha]) => [k, commitOf(sha) === sha]));
const changedByFreeze = freezeCommit ? git('diff', '--name-only', CANONICAL_PARENT_COMMIT, freezeCommit).stdout.trim().split('\n').filter(Boolean) : null;
const lineage = {
  freezeCommitIsSet: freezeCommit !== null,
  CERTIFIED_COMMIT_IDENTITIES_UNCHANGED: Object.values(identities).every(Boolean),
  PRE_RP_MAIN_ANCESTOR_OF_STAGE3FRP: isAncestor(LINEAGE.PRE_REPRODUCIBILITY_MAIN, LINEAGE.STAGE3FRP_COMMIT),
  STAGE3FRP_PARENT_OF_CONFIRMATORY_PLAN: JSON.stringify(parentsOf(LINEAGE.CONFIRMATORY_PLAN_COMMIT)) === JSON.stringify([LINEAGE.STAGE3FRP_COMMIT]),
  CONFIRMATORY_PLAN_PARENT_OF_CONFIRMATORY: JSON.stringify(parentsOf(LINEAGE.CONFIRMATORY_COMMIT)) === JSON.stringify([LINEAGE.CONFIRMATORY_PLAN_COMMIT]),
  CONFIRMATORY_ANCESTOR_OF_FREEZE: isAncestor(LINEAGE.CONFIRMATORY_COMMIT, freezeCommit),
  FREEZE_ANCESTOR_OF_HEAD: isAncestor(freezeCommit, commitOf('HEAD')),
  NO_MERGE_COMMITS_IN_CERTIFIED_CHAIN: git('rev-list', '--merges', `${LINEAGE.PRE_REPRODUCIBILITY_MAIN}..${LINEAGE.CONFIRMATORY_COMMIT}`).stdout.trim() === '',
  NO_MERGE_COMMITS_IN_FREEZE: freezeCommit !== null && git('rev-list', '--merges', `${LINEAGE.CONFIRMATORY_COMMIT}..${freezeCommit}`).stdout.trim() === '',
  FREEZE_CONTAINS_ONLY_FREEZE_STAGE_WORK: changedByFreeze !== null && changedByFreeze.length > 0 && changedByFreeze.every((f) => FREEZE_STAGE_FILES.includes(f)),
};
const CANONICAL_LINEAGE_VALID = Object.values(lineage).every(Boolean);

/* 2. the freeze artifact: rebuilt byte for byte, committed, unchanged since its freeze commit */
let freeze = null; let buildError = null;
try { freeze = buildFreeze(); } catch (e) { buildError = e.message; }
const headBlob = (f) => { const g = spawnSync('git', ['-C', top, 'show', `HEAD:${rel(f)}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return g.status === 0 ? hex(g.stdout) : null; };
const artifact = {
  builds: freeze !== null, buildError,
  reproducesByteForByte: freeze !== null && existsSync(at(FREEZE_PATH)) && readFileSync(at(FREEZE_PATH), 'utf8') === serialise(freeze),
  committedAtHead: existsSync(at(FREEZE_PATH)) && headBlob(FREEZE_PATH) === hex(readFileSync(at(FREEZE_PATH))),
  unchangedSinceFreezeCommit: freezeCommit !== null && git('diff', '--name-only', freezeCommit, 'HEAD', '--', rel(FREEZE_PATH)).stdout.trim() === '',
  freezeHash: freeze?.freezeHash ?? null,
};

/* 3. hash-type discipline */
const records = [];
const collect = (v, where) => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('RAW_FILE_SHA256' in v && 'BOUND_SEMANTIC_HASH' in v && 'file' in v) records.push({ where, ...v });
    for (const [k, x] of Object.entries(v)) collect(x, `${where}.${k}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => collect(x, `${where}[${i}]`));
};
if (freeze) collect(freeze.sections, 'sections');
const hashTypes = freeze === null ? { recordsChecked: 0, HASH_TYPES_UNAMBIGUOUS: false } : (() => {
  const raw = (f) => hex(readFileSync(at(f)));
  const semanticOk = records.every((r) => r.RAW_FILE_SHA256 === raw(r.file) && (r.BOUND_SEMANTIC_HASH === null
    || (r.BOUND_SEMANTIC_HASH.value === readJson(r.file)[r.BOUND_SEMANTIC_HASH.field] && r.BOUND_SEMANTIC_HASH.value !== r.RAW_FILE_SHA256)));
  const b = freeze.bound;
  const cr = readJson(CR_CERTIFICATE);
  const pairs = {
    CLAIM_MAP: b.CLAIM_MAP_BOUND_SEMANTIC_HASH === cr.claimMap.claimMapHash && b.CLAIM_MAP_RAW_FILE_SHA256 === cr.artifactHashes['artifacts/stage3f6cr-confirmatory-reconciliation/stage3f6cr-claim-map.json'] && b.CLAIM_MAP_BOUND_SEMANTIC_HASH !== b.CLAIM_MAP_RAW_FILE_SHA256,
    DECISION_EVALUATION_CONTRACT: b.DECISION_EVALUATION_CONTRACT_BOUND_SEMANTIC_HASH === cr.decisionEvaluationContract.contractHash && b.DECISION_EVALUATION_CONTRACT_RAW_FILE_SHA256 === cr.decisionEvaluationContract.fileSha256
      && b.DECISION_EVALUATION_CONTRACT_BOUND_SEMANTIC_HASH !== b.DECISION_EVALUATION_CONTRACT_RAW_FILE_SHA256,
    CONFIRMATORY_CERTIFICATE: b.CONFIRMATORY_CERTIFICATE_HASH.type === 'BOUND_SEMANTIC_HASH' && b.CONFIRMATORY_CERTIFICATE_HASH.value === cr.certificationHash,
    STAGE3FRP_CERTIFICATE: b.STAGE3FRP_CERTIFICATE_HASH.type === 'BOUND_SEMANTIC_HASH' && b.STAGE3FRP_CERTIFICATE_HASH.value === readJson(CERT.RP).certificationHash,
    ERRATUM: b.ERRATUM_HASH.type === 'RAW_FILE_SHA256' && b.ERRATUM_HASH.BOUND_SEMANTIC_HASH === null && b.ERRATUM_HASH.value === raw(CERT.ERRATUM),
  };
  return { recordsChecked: records.length, pairs, HASH_TYPES_UNAMBIGUOUS: records.length > 0 && semanticOk && Object.values(pairs).every(Boolean) };
})();

/* 4. predecessor reproduction, read-only, canonical profile */
function runJson(args, label) {
  log(`reproducing ${label}`);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: plainEnv });
  let out = null; try { out = JSON.parse(r.stdout); } catch { out = null; }
  return { exitCode: r.status, out };
}
const crReportPath = at('build/stage3f6cr/predecessors-report.json');
rmSync(crReportPath, { force: true }); // gitignored; a stale report from an earlier run must never be read
const rp = runJson(['scripts/certify-stage3frp-reproducibility-portability.mjs', '--check'], 'Stage 3F-RP');
const crRun = runJson(['scripts/reproducibility/run-canonical.mjs', 'scripts/stage3f6cr-certify.mjs', '--check'], 'Stage 3F.6-CR (runs the symmetric chain)');
const crReport = existsSync(crReportPath) ? JSON.parse(readFileSync(crReportPath, 'utf8')) : null;
const bound = freeze?.bound ?? {};
const direct = Object.fromEntries(['W_SYM', 'D_SYM_FREEZE', 'D_SYM'].map((id) => { const c = crReport?.checks.find((x) => x.id === id);
  return [id, c ? { status: c.status, recomputedHash: c.recomputedHash, matchesBound: c.recomputedHash === bound.SYMMETRIC_CHAIN_ROOT_HASHES?.[id] } : null]; }));
const transitive = freeze?.sections.symmetricChain.reproducedBy.transitiveGates ?? {};
const symmetricStatus = Object.fromEntries((freeze?.sections.symmetricChain.order ?? []).map((id) => {
  if (direct[id]) return [id, direct[id].status === 'BYTE_EXACT' && direct[id].matchesBound ? 'BYTE_EXACT' : 'NOT_REPRODUCED'];
  const via = Object.entries(transitive).filter(([, g]) => g.reproducesTransitively.includes(id)).map(([k]) => k);
  const reached = (x) => x === 'W_SYM' ? direct.W_SYM?.status === 'BYTE_EXACT' : Object.entries(transitive).some(([k, g]) => g.reproducesTransitively.includes(x) && reached(k));
  return [id, via.length > 0 && reached(id) ? 'BYTE_EXACT_TRANSITIVELY_VIA_W_SYM' : 'NOT_REPRODUCED'];
}));
const reproduction = {
  STAGE3FRP: { reproduced: rp.exitCode === 0 && rp.out?.reproduced === true && rp.out?.status === 'PASS', recomputedHash: rp.out?.recomputedHash ?? null,
    matchesBound: rp.out?.recomputedHash === bound.STAGE3FRP_CERTIFICATE_HASH?.value },
  STAGE3F6CR: { reproduced: crRun.exitCode === 0 && crRun.out?.reproduced === true && crRun.out?.status === 'PASS', recomputedHash: crRun.out?.recomputedHash ?? null,
    matchesBound: crRun.out?.recomputedHash === bound.CONFIRMATORY_CERTIFICATE_HASH?.value },
  symmetricChain: symmetricStatus,
  predecessorRunComplete: crReport?.complete === true, predecessorRunTrackedTreeUnchanged: crReport?.trackedTreeUnchanged === true,
  numericsProfile: 'SENTINEL_CANONICAL_NUMERICS_V1 (scripts/reproducibility/run-canonical.mjs and verify-stage3f.mjs)',
  historicalStage3F6: 'not re-run: documented SUPERSEDED_NOT_REPRODUCIBLE_AT_ANY_COMMIT; STAGE3F6-ERRATUM-001 bound',
};
const SYMMETRIC_CHAIN_INTACT = Object.keys(symmetricStatus).length === 9 && Object.values(symmetricStatus).every((s) => s === 'BYTE_EXACT' || s === 'BYTE_EXACT_TRANSITIVELY_VIA_W_SYM');
const CONFIRMATORY_CERTIFICATE_REPRODUCED = reproduction.STAGE3F6CR.reproduced && reproduction.STAGE3F6CR.matchesBound;

/* 5. tests */
log('running freeze tests');
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/stage3f-freeze.test.js'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, env: plainEnv });
const count = (k) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(tests.stdout ?? '')?.[1] ?? -1);
const testMetrics = { pass: count('pass'), fail: count('fail'), skipped: count('skipped') };

/* 6. bindings */
const s = freeze?.sections;
const cr = readJson(CR_CERTIFICATE);
const bindings = freeze === null ? {} : {
  STAGE3F_SCIENTIFIC_COMPLETE: cr.status === 'PASS' && cr.conclusion.STAGE3F_SCIENTIFIC_COMPLETE === true && cr.conclusion.READY_FOR_3F_FREEZE === true,
  CANONICAL_LINEAGE_VALID,
  CONFIRMATORY_CERTIFICATE_REPRODUCED,
  SYMMETRIC_CHAIN_INTACT,
  STAGE3FRP_REPRODUCED: reproduction.STAGE3FRP.reproduced && reproduction.STAGE3FRP.matchesBound,
  FREEZE_ARTIFACT_REPRODUCED: artifact.builds && artifact.reproducesByteForByte && artifact.committedAtHead && artifact.unchangedSinceFreezeCommit,
  IMMUTABLE_FACTS_BOUND: Object.keys(s.immutableFacts.values).length === 18 && Object.entries(s.immutableFacts.values).every(([k, v]) => cr.immutableFactsCandidate[k]?.value === v && cr.immutableFactsCandidate[k]?.supported === true),
  DECISION_EVALUATION_CONTRACT_BOUND: s.decisionEvaluationContract.record.BOUND_SEMANTIC_HASH.value === cr.decisionEvaluationContract.contractHash && s.decisionEvaluationContract.modifiedByFreeze === false,
  REPRODUCIBILITY_CONTRACT_BOUND: s.reproducibilityContract.SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED === true && s.reproducibilityContract.NODE22_CERTIFIED === true && s.reproducibilityContract.NODE26_CERTIFIED === true
    && s.reproducibilityContract.HOST_NATIVE_MATH_BYTE_CANONICAL === false,
  ERRATUM_BOUND: s.erratum.historicalStage3F6.REPRODUCIBLE === false && bound.ERRATUM_HASH.value === hex(readFileSync(at(CERT.ERRATUM))),
  R0_BOUND: JSON.stringify(s.authorityState.canonicalForm) === JSON.stringify(AUTHORITY) && s.authorityState.STAGE3F_COMPLETION_IMPLIES_PROMOTION === false,
  ARCHITECTURE_ROSTER_BOUND: s.architectureRoster.EXPERT_COUNT === 9 && JSON.stringify(s.architectureRoster.experts) === JSON.stringify(EXPERTS) && s.architectureRoster.rules.EXPERT_10_ADDED === false,
  STAGE3G_ENTRY_REQUIREMENTS_BOUND: s.stage3gEntryRequirements.adoptedAsStage3GEntryRequirements === true && Object.keys(s.stage3gEntryRequirements.required).length === 10,
  CHECK_MODE_INVARIANT_BOUND: s.checkModeInvariant.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE === true,
  CERTIFIER_CHAIN_EXCEPTION_DOCUMENTED: s.certifierChainException.CERTIFIER_CHAIN_EXCEPTION_DOCUMENTED === true,
  EPISTEMIC_PROVENANCE_BOUND: s.epistemicProvenance.EPISTEMIC_PROVENANCE_REQUIRED === true && s.epistemicProvenance.EPISTEMIC_LEVEL_SCHEMA === 'TO_BE_DEFINED_IN_STAGE3G',
  HASH_TYPES_UNAMBIGUOUS: hashTypes.HASH_TYPES_UNAMBIGUOUS,
  TESTS_PASS: tests.status === 0 && testMetrics.fail === 0 && testMetrics.pass > 0,
  TRACKED_TREE_UNCHANGED_DURING_VERIFICATION: trackedTreeFingerprint(top) === treeBefore,
};
const status = freeze !== null && Object.values(bindings).every(Boolean) ? 'PASS' : 'FAIL';
const pass = status === 'PASS';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_FORMAL_FREEZE_CERTIFICATION', STAGE3F_FREEZE_VERSION, status, measurementStage: false, newScientificEvidence: false,
  freeze: { file: FREEZE_PATH, freezeCommit, ...artifact },
  lineage: { ...LINEAGE, CANONICAL_PARENT_COMMIT, checks: lineage, identities, changedByFreeze, CANONICAL_LINEAGE_VALID, CONFIRMATORY_COMMIT_IS_ANCESTOR: lineage.CONFIRMATORY_ANCESTOR_OF_FREEZE },
  bound: freeze?.bound ?? null,
  hashTypes, reproduction, bindings, tests: testMetrics,
  conclusion: {
    STAGE_3F_FREEZE: status,
    STAGE3F_STATUS: pass ? 'FROZEN' : 'NOT_FROZEN', STAGE3F_COMPLETION: pass ? '100%' : 'INCOMPLETE', READY_FOR_STAGE3G: pass, STAGE3G_STARTED: false,
    note: 'Stage 3G is not started by this certificate. Stage 3F completion does not change authority.',
  },
  authority: AUTHORITY,
  roadmap: { NEXT_STAGE: pass ? 'STAGE_3G (not started here)' : 'resolve the failing bindings and re-certify', BLOCKERS: Object.entries(bindings).filter(([, v]) => !v).map(([k]) => k) },
  sourceHashes: Object.fromEntries(['scripts/stage3f-freeze.mjs', 'scripts/stage3f-freeze-certify.mjs', 'scripts/certification/check-mode-guard.mjs', 'tests/stage3f-freeze.test.js'].map((f) => [f, hex(readFileSync(at(f)))])),
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = existsSync(at(RESULT_PATH)) ? readJson(RESULT_PATH) : null;
  const reproduced = stored !== null && stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F_FREEZE_CERTIFICATION', reproduced, status, storedHash: stored?.certificationHash ?? null, recomputedHash: payload.certificationHash,
    trackedWriteAttempts: guard.attempts().length, blockers: payload.roadmap.BLOCKERS, tests: testMetrics }, null, 2));
  if (!reproduced || !pass || guard.attempts().length > 0) process.exitCode = 1;
} else {
  await writeFile(at(RESULT_PATH), serialise(payload));
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, conclusion: payload.conclusion, bindings, reproduction, blockers: payload.roadmap.BLOCKERS }, null, 2));
  if (!pass) process.exitCode = 1;
}
