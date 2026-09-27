#!/usr/bin/env node
/* Stage 3F.6-CR — independent re-verification of the Stage 3F.6 erratum's provenance finding.
 *
 *   node scripts/stage3f6cr-erratum-reverification.mjs [--out=PATH]
 *
 * STAGE3F6-ERRATUM-001 states that the historical Stage 3F.6 certificate faithfully measured the pre-remediation
 * runtime, and that it stopped reproducing only because Stage 3F.6-R changed three runtime/recovery files (and edited
 * the certifier and tests) in the same commit. This script repeats that experiment from committed state:
 *   AT_HEAD                 the committed certifier recomputes the certificate at HEAD;
 *   PRE_REMEDIATION_RUNTIME the same, in a temporary worktree where only the three files named by the erratum are
 *                           restored to their bytes before 2ee28987 (the remediation commit).
 * Both run under the canonical runtime (read-only, SENTINEL_CANONICAL_NUMERICS_V1) with payload capture, and each
 * recomputation is compared with the stored certificate top-level section by section. Needs the Stage 3F.6 evaluation
 * corpus payload. Writes only under build/ and to --out.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffLeaves } from './reproducibility/certificate-diff.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const top = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const REMEDIATION_COMMIT = '2ee28987f123c8d543b03341199738c6de40c5b8';
const ERRATUM = 'artifacts/stage3f6-errata/erratum-stage3f6-prediction-reliability.json';
const STORED = 'artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json';
const PAYLOAD = 'artifacts/stage3f6-prediction-reliability/evaluation-corpus.jsonl.gz';
const RESTORED = ['platform/game-agnostic/src/stage3f/integrated-live-shadow-v1.js', 'platform/game-agnostic/src/lab/stage3de-recovery-canonicalization.js',
  'platform/game-agnostic/scripts/canonicalize-stage3de-recovery.mjs'];
const git = (cwd, ...a) => spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

const erratum = JSON.parse(readFileSync(at(ERRATUM), 'utf8'));
const named = erratum.causedBy.runtimeFilesChanged.map((s) => s.split(' ')[0]);
if (JSON.stringify(named.map((f) => `platform/game-agnostic/${f}`)) !== JSON.stringify(RESTORED)) throw new Error('erratum names different runtime files than this script restores');
if (!existsSync(at(PAYLOAD))) throw new Error(`missing ${PAYLOAD}: run scripts/reproducibility/verify-stage3f.mjs --rebuild-evidence --only=3F6_EVALUATION_CORPUS`);
const stored = JSON.parse(readFileSync(at(STORED), 'utf8'));

function recompute(gaRoot, label) {
  const logDir = path.join(root, 'build', 'stage3f6cr', `log-${label}`);
  rmSync(logDir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, ['scripts/reproducibility/run-canonical.mjs', 'scripts/certify-stage3f6-prediction-reliability.mjs', '--check'],
    { cwd: gaRoot, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, SENTINEL_REPRO_LOG: logDir, SENTINEL_REPRO_CAPTURE: '1' } });
  const own = readdirSync(logDir).filter((f) => f.startsWith('certify-stage3f6-prediction-reliability.mjs.'))
    .map((f) => JSON.parse(readFileSync(path.join(logDir, f), 'utf8'))).find((e) => e.argv.includes('--check'));
  const candidates = (own?.captured ?? []).map((t) => JSON.parse(t)).filter((o) => o.stage === stored.stage);
  if (!candidates.length) return { label, exitCode: r.status, paired: false };
  const best = candidates.map((c) => ({ c, leaves: diffLeaves(stored, { ...c, certificationHash: c.certificationHash ?? stored.certificationHash }) }))
    .sort((a, b) => a.leaves.length - b.leaves.length)[0];
  const sections = Object.fromEntries(Object.keys(stored).map((k) => [k, best.leaves.filter((l) => l.path === `.${k}` || l.path.startsWith(`.${k}.`) || l.path.startsWith(`.${k}[`)).length]));
  return { label, exitCode: r.status, paired: true, recomputedStatus: best.c.status, differingFields: best.leaves.length,
    identicalSections: Object.keys(sections).filter((k) => sections[k] === 0), differingSections: Object.fromEntries(Object.entries(sections).filter(([, n]) => n > 0)),
    differingPaths: best.leaves.length <= 100 ? best.leaves.map((l) => l.path) : null };
}

const atHead = recompute(root, 'at-head');
const wt = path.join(root, 'build', 'stage3f6cr', 'pre-remediation-worktree');
git(top, 'worktree', 'remove', '--force', wt); rmSync(wt, { recursive: true, force: true });
mkdirSync(path.dirname(wt), { recursive: true });
if (git(top, 'worktree', 'add', '--detach', wt, 'HEAD').status !== 0) throw new Error('worktree add failed');
let pre;
try {
  for (const f of RESTORED) writeFileSync(path.join(wt, f), git(top, 'show', `${REMEDIATION_COMMIT}^:${f}`).stdout);
  copyFileSync(at(PAYLOAD), path.join(wt, 'platform', 'game-agnostic', PAYLOAD));
  pre = recompute(path.join(wt, 'platform', 'game-agnostic'), 'pre-remediation');
} finally {
  git(top, 'worktree', 'remove', '--force', wt);
}

const MEASUREMENT = ['corpus', 'evaluationSnapshot', 'snapshotSelection', 'partitions', 'leakage', 'freeze', 'predictionInventory', 'structuralFindings',
  'runtimeBindingDefects', 'designDerived', 'stage3eSealedReplay', 'layerA', 'layerB', 'degradation', 'calibrationRelationship', 'uncertainty', 'sealedNovelty',
  'diagnosis', 'observatoryAggregate'];
/* The residual fields the erratum discloses for the pre-remediation run (its verification.withPreRemediationRuntime.remainingDifferences):
 * status and the environment diagnosis/blockers of the predecessor checks, tests 104/106 and the exit criteria they drive, and the
 * certifier/test source hashes. Leaf counts depend on the diff tool (this one counts every predecessor flag, diagnosis field and
 * shifted blocker index separately), so the categories are compared, not the count. */
const DISCLOSED_RESIDUAL = [/^\.status$/, /^\.inherited\.predecessorChecks\./, /^\.inherited\.environmentDiagnosis\./, /^\.tests\.(pass|fail)$/,
  /^\.exitCriteria\.(TESTS_PASS|PREDECESSORS_INTACT)$/, /^\.sourceHashes\.(scripts\/certify-stage3f6-prediction-reliability\.mjs|tests\/stage3f6-prediction-reliability-v1\.test\.js)$/, /^\.roadmap\.blockers\[\d+\]$/];
const result = {
  schemaVersion: 1, experiment: 'STAGE3F6CR_ERRATUM_REVERIFICATION_V1', erratumId: erratum.erratumId, storedCertificationHash: stored.certificationHash,
  remediationCommit: REMEDIATION_COMMIT, restoredFiles: RESTORED, numericsProfile: 'SENTINEL_CANONICAL_NUMERICS_V1',
  atHead, preRemediationRuntime: pre, measurementSections: MEASUREMENT,
  findings: {
    NOT_REPRODUCIBLE_AT_HEAD: atHead.paired && atHead.differingFields > 0,
    MEASUREMENTS_DIFFER_AT_HEAD: atHead.paired && MEASUREMENT.some((k) => atHead.differingSections[k]),
    MEASUREMENTS_FAITHFUL_TO_PRE_REMEDIATION_RUNTIME: pre.paired && MEASUREMENT.every((k) => !pre.differingSections[k]),
    PRE_REMEDIATION_RESIDUAL_SECTIONS: pre.paired ? Object.keys(pre.differingSections) : null,
    PRE_REMEDIATION_RESIDUALS_WITHIN_ERRATUM_DISCLOSURE: pre.paired && pre.differingPaths !== null && pre.differingPaths.every((p) => DISCLOSED_RESIDUAL.some((re) => re.test(p))),
    ERRATUM_RECORDED_AT_HEAD_DIFFERING_FIELDS: erratum.verification.atHead.differingFields,
    ERRATUM_RECORDED_PRE_REMEDIATION_DIFFERING_FIELDS: erratum.verification.withPreRemediationRuntime.differingFields,
  },
};
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
if (out) writeFileSync(path.resolve(out), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.findings, null, 2));
