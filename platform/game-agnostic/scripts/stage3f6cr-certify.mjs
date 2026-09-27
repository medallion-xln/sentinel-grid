#!/usr/bin/env node
/* STAGE_3F_6_CR — Stage 3F.6 confirmatory reconciliation (the last Stage 3F measurement-integrity step before the
 * formal Stage 3F freeze). Reconciles historical Stage 3F.6, Stage 3F.6-R, STAGE3F6-ERRATUM-001 and the symmetric
 * requalification chain into one claim map, freezes SENTINEL_DECISION_EVALUATION_CONTRACT_V1 (specification only) and
 * a Stage 3G inherited-requirements candidate, and evaluates the Stage 3F exit criteria.
 *
 *   npm run stage3f6cr:certify     (runs under the canonical runtime, read-only for tracked files except this stage's
 *                                   own certificate)
 *   npm run stage3f6cr:check       (never writes; requires byte-identical reproduction)
 *
 * It changes no expert, policy, Router, feature, threshold, corpus, sealed partition, authority or conclusion, and does
 * not perform the formal Stage 3F freeze. Predecessors are reproduced by re-running their own --check commands: W-SYM's
 * check requires P.1-SYM, P.1A-SYM, T-SYM, P.1C, P.1D, P.1E and 3F.6-T to reproduce byte for byte (its transitive gate);
 * D-SYM's freeze and certificate are checked after it.
 *
 * Like the Stage 3F-RP certifier, this is a meta-certifier: it runs the Stage 3F chain, so it cannot be a link in it
 * (scripts/reproducibility/stage3f-chain.mjs, which Stage 3F-RP seals by hash). It is therefore named outside the
 * certify-stage3f* measurement-certifier pattern that Stage 3F-RP's chain-coverage test enumerates; its own tests assert
 * that every measurement certifier remains covered by the chain.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as numerics from '../src/core/canonical-numerics-v1.js';
import { AUTHORITY, CERT, CLAIM_MAP_PATH, CONTRACT_PATH, OUT, PLAN_PATH, PREDECESSOR_CHAIN, REVERIFICATION_PATH, allBindings, buildArtifacts, verifyBinding } from './stage3f6cr-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const fileHash = (f) => hex(readFileSync(at(f)));
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const RESULT = `${OUT}/stage3f6cr-certification-result.json`;
const FULL_SUITE = `${OUT}/stage3f6cr-full-suite.json`;
const checkOnly = process.argv.includes('--check');
const git = (...a) => spawnSync('git', ['-C', top, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 });
const rel = (f) => `platform/game-agnostic/${f}`;
const log = (m) => process.stderr.write(`[stage3f6cr] ${m}\n`);

/* 1. frozen plan artifacts: rebuilt byte for byte, committed, unchanged since the freeze commit */
const { plan, claimMapDoc, contract } = buildArtifacts();
const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
const planFiles = { [PLAN_PATH]: plan, [CLAIM_MAP_PATH]: claimMapDoc, [CONTRACT_PATH]: contract };
const frozenFiles = [PLAN_PATH, CLAIM_MAP_PATH, CONTRACT_PATH, REVERIFICATION_PATH, 'scripts/stage3f6cr-plan.mjs', 'scripts/stage3f6cr-erratum-reverification.mjs'];
const freezeCommit = git('log', '--diff-filter=A', '--format=%H', '--', rel(PLAN_PATH)).stdout.trim().split('\n').filter(Boolean).at(-1) ?? null;
const headBlob = (f) => { const g = spawnSync('git', ['-C', top, 'show', `HEAD:${rel(f)}`], { encoding: 'buffer', maxBuffer: 1 << 26 }); return g.status === 0 ? hex(g.stdout) : null; };
const freezeIntegrity = {
  freezeCommit,
  planArtifactsReproduce: Object.entries(planFiles).every(([f, v]) => existsSync(at(f)) && readFileSync(at(f), 'utf8') === serialise(v)),
  frozenFilesCommittedAtHead: frozenFiles.every((f) => headBlob(f) === fileHash(f)),
  frozenFilesUnchangedSinceFreeze: freezeCommit !== null && git('diff', '--name-only', freezeCommit, 'HEAD', '--', ...frozenFiles.map(rel)).stdout.trim() === '',
};

/* 2. evidence bindings (claims, erratum, requirements, exit criteria, immutable facts) */
const bindings = allBindings(plan, claimMapDoc).map(({ where, binding }) => ({ where, holds: verifyBinding(binding).holds }));
const bindingSummary = { total: bindings.length, holding: bindings.filter((b) => b.holds).length, failing: bindings.filter((b) => !b.holds).map((b) => b.where) };

/* 3. predecessor reproduction (transitively complete; see header) */
function reproduce() {
  const report = at('build/stage3f6cr/predecessors-report.json');
  const r = spawnSync(process.execPath, ['scripts/reproducibility/verify-stage3f.mjs', '--check', '--only=W_SYM,D_SYM_FREEZE,D_SYM', '--label=stage3f6cr-predecessors', `--report=${report}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, NODE_OPTIONS: '' } });
  if (!existsSync(report)) return { ran: false, exitCode: r.status };
  const rep = JSON.parse(readFileSync(report, 'utf8'));
  return { ran: true, complete: rep.complete === true, trackedTreeUnchanged: rep.trackedTreeUnchanged,
    checks: rep.checks.map((c) => ({ id: c.id, status: c.status, storedHash: c.storedHash, recomputedHash: c.recomputedHash })) };
}
log('reproducing predecessors (W-SYM transitive gate, D-SYM freeze, D-SYM)');
const predecessors = reproduce();
const predecessorsReproduced = predecessors.ran && predecessors.complete && predecessors.trackedTreeUnchanged
  && ['W_SYM', 'D_SYM_FREEZE', 'D_SYM'].every((id) => predecessors.checks.find((c) => c.id === id)?.status === 'BYTE_EXACT');

/* 4. erratum reconciliation */
const erratum = plan.erratumReconciliation;
const erratumChecks = {
  ERRATUM_PRESENT_AND_UNMODIFIED: readJson(CERT.ERRATUM).erratumId === 'STAGE3F6-ERRATUM-001' && erratum.erratumSha256 === fileHash(CERT.ERRATUM)
    && git('log', '--format=%H', '--', rel(CERT.ERRATUM)).stdout.trim().split('\n').filter(Boolean).length === 1,
  EVERY_CLAIM_CLASSIFIED: erratum.claims.every((c) => ['RESOLVED', 'STILL_APPLIES', 'SUPERSEDED', 'INVALIDATED_BY_NEW_EVIDENCE'].includes(c.classification)),
  PROVENANCE_RECONFIRMED: Object.values(erratum.provenanceFindings).every((f) => f.reconfirmed === true),
  REVERIFICATION_BOUND: erratum.reverification.sha256 === fileHash(REVERIFICATION_PATH),
};
const ERRATUM_RECONCILED = Object.values(erratumChecks).every(Boolean);

/* 5. contract and runtime bindings */
const contractBinding = { contractId: contract.contractId, contractHash: contract.contractHash, fileSha256: fileHash(CONTRACT_PATH),
  frozenAtFreezeCommit: freezeCommit !== null && git('cat-file', '-e', `${freezeCommit}:${rel(CONTRACT_PATH)}`).status === 0, specificationOnly: contract.status === 'SPECIFICATION_ONLY' && contract.implementsWorldModel === false };
const runtimeBinding = {
  remediatedIntegratedRuntimeSha256: fileHash('src/stage3f/integrated-live-shadow-v1.js'), stage3f6rCertificationHash: readJson(CERT.S3F6R).certificationHash,
  canonicalNumerics: { id: numerics.CANONICAL_NUMERICS_ID, moduleSha256: fileHash('src/core/canonical-numerics-v1.js'), runtimeSha256: fileHash('scripts/reproducibility/canonical-runtime.mjs'),
    stage3frpCertificationHash: readJson(CERT.RP).certificationHash },
  note: 'This certifier computes no floating-point measurement; every predecessor recomputation runs through scripts/reproducibility/verify-stage3f.mjs, which always installs SENTINEL_CANONICAL_NUMERICS_V1 and the read-only guard.',
};

/* 6. exit criteria */
const criterion = (name) => plan.exitCriteria[name].every((b) => verifyBinding(b).holds);
const fullSuite = existsSync(at(FULL_SUITE)) ? readJson(FULL_SUITE) : null;
const exitCriteria = {
  SYMMETRY_CERTIFIED: criterion('SYMMETRY_CERTIFIED'), CORPUS_CLEAN: criterion('CORPUS_CLEAN'), CORPUS_SEALED: criterion('CORPUS_SEALED'),
  POLICY_RESULTS_REPRODUCIBLE: criterion('POLICY_RESULTS_REPRODUCIBLE') && predecessorsReproduced,
  EXPERT_DIVERSITY_MEASURED: criterion('EXPERT_DIVERSITY_MEASURED'), ROUTER_VALUE_MEASURED: criterion('ROUTER_VALUE_MEASURED'),
  RISK_SIGNAL_VALUE_MEASURED: criterion('RISK_SIGNAL_VALUE_MEASURED'), DECISION_RULE_VALUE_MEASURED: criterion('DECISION_RULE_VALUE_MEASURED'),
  SHORTCUTS_AUDITED: criterion('SHORTCUTS_AUDITED'), REPRESENTATION_GAP_MEASURED: criterion('REPRESENTATION_GAP_MEASURED'),
  ERRATUM_RECONCILED, DECISION_EVALUATION_CONTRACT_FROZEN: contractBinding.frozenAtFreezeCommit && contractBinding.specificationOnly && contractBinding.fileSha256 === fileHash(CONTRACT_PATH),
  STAGE3F_REPRODUCIBILITY_PORTABLE: criterion('STAGE3F_REPRODUCIBILITY_PORTABLE'), R0_INTACT: criterion('R0_INTACT'),
};

/* 7. tests */
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/stage3f6cr-confirmatory-reconciliation.test.js'],
  { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, NODE_OPTIONS: '' } }); // as Stage 3F.6-D-SYM: the reporter is set here, once
const count = (k) => Number(new RegExp(`^# ${k} (\\d+)$`, 'm').exec(tests.stdout ?? '')?.[1] ?? -1);
const testMetrics = { pass: count('pass'), fail: count('fail'), skipped: count('skipped') };

const checks = {
  PLAN_ARTIFACTS_REPRODUCE: freezeIntegrity.planArtifactsReproduce,
  FROZEN_FILES_COMMITTED_AND_UNCHANGED: freezeIntegrity.frozenFilesCommittedAtHead && freezeIntegrity.frozenFilesUnchangedSinceFreeze,
  EVERY_EVIDENCE_BINDING_HOLDS: bindingSummary.failing.length === 0,
  PREDECESSORS_REPRODUCE_BYTE_FOR_BYTE: predecessorsReproduced,
  ERRATUM_RECONCILED,
  DECISION_EVALUATION_CONTRACT_BOUND: exitCriteria.DECISION_EVALUATION_CONTRACT_FROZEN,
  FULL_SUITE_RECORDED_AND_PASSING: fullSuite !== null && fullSuite.platform.fail === 0 && fullSuite.platform.pass > 0,
  TESTS_PASS: tests.status === 0 && testMetrics.fail === 0 && testMetrics.pass > 0,
  AUTHORITY_R0: JSON.stringify(plan.authority) === JSON.stringify(AUTHORITY),
};
const STAGE3F_SCIENTIFIC_COMPLETE = Object.values(exitCriteria).every(Boolean);
const status = Object.values(checks).every(Boolean) && STAGE3F_SCIENTIFIC_COMPLETE ? 'PASS' : 'FAIL';
const READY_FOR_3F_FREEZE = status === 'PASS';

const claimLabel = (id) => claimMapDoc.claims.find((c) => c.id === id)?.classification;
const payload = {
  schemaVersion: 1, stage: plan.stage, status, measurementStage: false,
  baseline: { predecessorChain: PREDECESSOR_CHAIN, stage3fdsymCertificationHash: readJson(CERT.DSYM).certificationHash },
  plan: { planHash: plan.planHash, freezeCommit, ...freezeIntegrity },
  historical3F6: plan.historical3F6,
  erratumReconciliation: { ...erratumChecks, ERRATUM_RECONCILED, classifications: Object.fromEntries(erratum.claims.map((c) => [c.id, c.classification])) },
  claimMap: { claimMapHash: claimMapDoc.claimMapHash, byClaim: Object.fromEntries(claimMapDoc.claims.map((c) => [c.id, c.classification])),
    headline: { RESOURCE: claimLabel('RESOURCE_COMPETENCE'), NEXUS_V1: claimLabel('NEXUS_V1_COMPETENCE'), NEXUS_V2: claimLabel('NEXUS_V2_COMPETENCE'),
      OBJECTIVE: claimLabel('OBJECTIVE_COMPETENCE'), THREAT: claimLabel('THREAT_COMPETENCE'), COMPLEMENTARITY: claimLabel('EXPERT_COMPLEMENTARITY'),
      ROUTER: claimLabel('ROUTER_VALUE'), RISK_STATE: claimLabel('RISK_STATE_VALUE'), DECISION_RULE: claimLabel('DECISION_RULE_VALUE'),
      REPRESENTATION: claimLabel('STATE_REPRESENTATION_SUFFICIENCY'), SPATIAL_STATE: claimLabel('SPATIAL_OBSERVABILITY'), ACTION_SEMANTICS: claimLabel('ACTION_SEMANTICS'),
      TRANSITION_PREDICTION: claimLabel('TRANSITION_PREDICTION_NEED'), OOD: claimLabel('OOD_STABILITY'), FALSE_SELECTION_HARM: claimLabel('FALSE_SELECTION_HARM') } },
  decisionEvaluationContract: contractBinding,
  inheritedRequirements: Object.fromEntries(plan.inheritedRequirements.requirements.map((r) => [r.id, r.status])),
  notEvidenceSupported: Object.keys(plan.inheritedRequirements.notEvidenceSupported).filter((k) => k !== 'note'),
  immutableFactsCandidate: Object.fromEntries(Object.entries(plan.immutableFactsCandidate).filter(([k]) => k !== 'qualification')
    .map(([k, f]) => [k, { value: f.value, supported: f.evidence.every((b) => verifyBinding(b).holds) }])),
  exitCriteria, predecessors, bindings: bindingSummary, runtimeBinding,
  artifactHashes: Object.fromEntries([...frozenFiles, FULL_SUITE].filter((f) => existsSync(at(f))).map((f) => [f, fileHash(f)])),
  fullSuite, checks, tests: testMetrics,
  conclusion: { STAGE3F_SCIENTIFIC_COMPLETE, READY_FOR_3F_FREEZE, READY_FOR_STAGE3G: false,
    note: 'READY_FOR_STAGE3G stays false until the separate formal Stage 3F freeze commit exists. The formal freeze is not performed here.' },
  authority: AUTHORITY,
  roadmap: { NEXT_RECOMMENDED_ACTION: READY_FOR_3F_FREEZE ? 'Perform the separate, formal Stage 3F freeze commit binding this certificate, the claim map, the Decision Evaluation Contract and the inherited-requirements candidate.' : 'Resolve the listed blockers, then re-certify.',
    BLOCKERS: [...Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), ...Object.entries(exitCriteria).filter(([, v]) => !v).map(([k]) => `EXIT_CRITERION:${k}`), ...(READY_FOR_3F_FREEZE ? ['FORMAL_3F_FREEZE_COMMIT_NOT_YET_MADE'] : [])] },
  sourceHashes: Object.fromEntries(['scripts/stage3f6cr-certify.mjs', 'scripts/stage3f6cr-plan.mjs', 'scripts/stage3f6cr-erratum-reverification.mjs',
    'tests/stage3f6cr-confirmatory-reconciliation.test.js'].map((f) => [f, fileHash(f)])),
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = existsSync(at(RESULT)) ? readJson(RESULT) : null;
  const reproduced = stored !== null && stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6CR_CERTIFICATION', reproduced, status, storedHash: stored?.certificationHash ?? null, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), serialise(payload));
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    exitCriteria, conclusion: payload.conclusion, claimMap: payload.claimMap.headline, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
