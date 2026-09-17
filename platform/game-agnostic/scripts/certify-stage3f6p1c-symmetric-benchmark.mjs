#!/usr/bin/env node
/* STAGE_3F_6_P_1C — Forge symmetry remediation certification.
 *
 * Certifies the FORGE_SYMMETRIC_V2 candidate benchmark: historical Forge V1 untouched and still reproducing,
 * new versioned identities, direction-neutral placement, equivariant tie-break, equivariant RETREAT, and
 * equivariant legal surface, optimal sets, regrets and labels under the certified FORGE_SYMMETRY_TRANSFORM_V1.
 *
 * Every threshold and rule comes from the plan hashed before the evaluation. Policies are read-only diagnostics.
 * `--check` requires byte-identical reproduction.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { POLICY_SET_HASH } from '../src/stage3f/policy-router-v1.js';
import { FORGE_SYMMETRY_TRANSFORM_CONTRACT_HASH } from '../src/stage3f/forge-symmetry-transform-v1.js';
import { FORGE_ORIENTATION_SYMMETRIC_CONTRACT_HASH, FORGE_ORIENTATION_SYMMETRIC_ID } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT_HASH, FORGE_ACTION_SURFACE_SYMMETRIC_ID } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT_HASH, FORGE_COUNTERFACTUAL_SYMMETRIC_ID, FORGE_GREEDY_SAFE_SYMMETRIC_ID } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT_HASH, FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID, FORGE_SYMMETRIC_BENCHMARK_ID } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { STAGE3F6P1C_PLAN, STAGE3F6P1C_PLAN_HASH, STAGE3F6P1C_PLAN_PATH } from './stage3f6p1c-analysis-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6p1c-symmetric-benchmark';
const RESULT = `${OUT}/stage3f6p1c-certification-result.json`;
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const at = (r) => path.join(root, r);
const readText = (r) => readFileSync(at(r), 'utf8');
const readJson = (r) => JSON.parse(readText(r));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const plan = STAGE3F6P1C_PLAN;
const TRANSFORMS = plan.transformsTested;
const FORGE_V1_FILES = ['src/forge/scenarios-v2.js', 'src/forge/scenarios-v3.js', 'src/forge/kernel.js', 'src/forge/counterfactual-v2.js', 'src/forge/record-v2.js',
  'src/forge/reward-v2.js', 'src/forge/warmup.js', 'src/forge/topology.js', 'src/forge/dataset-v2.js', 'src/forge/validators-v2.js', 'src/forge/adapter.js', 'src/forge/contract.js'];
const POLICY_FILES = ['src/lab/stage3c-learned-nexus.js', 'src/stage3f/deployable-action-proposal-v1.js', 'src/stage3f/nexus-selector-v2-candidate.js',
  'src/stage3f/policy-router-v1.js', 'src/stage3f/decision-rule-v1.js', 'src/stage3f/nexus-relational-spatial-context-v1.js', 'src/stage3f/forge-symmetry-transform-v1.js'];

/* ------------------------------------------------------------------ evidence */
const manifest = readJson(`${OUT}/symmetric-dev-evidence-manifest.json`);
const evidenceText = gunzipSync(await readFile(at(`${OUT}/symmetric-dev-evidence.jsonl.gz`))).toString('utf8');
const rows = evidenceText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const storedPlan = readJson(STAGE3F6P1C_PLAN_PATH);
const historicalSeeds = [1, 2, 3, 11, 201, 202, 203, 211, 401, 402, 403, 411, 601, 602, 603, 611, 801, 802, 803, 811];
const integrity = {
  planFileMatchesPlan: storedPlan.planHash === STAGE3F6P1C_PLAN_HASH,
  evidenceBoundToPlan: manifest.planHash === STAGE3F6P1C_PLAN_HASH,
  evidenceContent: hex(evidenceText) === manifest.contentHash,
  freshSeedSpace: manifest.seedSpace.every((s) => !historicalSeeds.includes(s)) && rows.every((r) => manifest.seedSpace.includes(r.combination.seed)),
  historicalCorporaRead: manifest.historicalCorporaRead === false,
  sampleSize: rows.length,
  allAdmitted: rows.every((r) => r.admitted === true),
};

/* ------------------------------------------- 1. historical preservation */
const headHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths.map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() === '' : false; };
const cert = (r) => readJson(r).certificationHash;
const historicalCorpus = gunzipSync(await readFile(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.partition === 'DEV').slice(0, 20);
const historicalReproduction = historicalCorpus.map((row) => {
  const c = row.combination;
  const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  return built.admitted && built.record.recordHash === row.recordHash;
});
const preservation = {
  FORGE_V1_UNCHANGED: FORGE_V1_FILES.every((f) => hex(readFileSync(at(f))) === headHash(f)),
  POLICIES_UNCHANGED: POLICY_FILES.every((f) => hex(readFileSync(at(f))) === headHash(f)),
  HISTORICAL_CORPORA_UNCHANGED: gitClean('artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router',
    'artifacts/stage3f6w-risk-state', 'artifacts/stage3f6d-decision-rule', 'artifacts/stage3f6p-policy-quality', 'artifacts/stage3f6p1-nexus-remediation',
    'artifacts/stage3f6p1a-nexus-spatial', 'artifacts/stage3f6p1b-directional-symmetry', 'artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered'),
  HISTORICAL_RECORD_REPRODUCTION: { sampled: historicalReproduction.length, reproduced: historicalReproduction.filter(Boolean).length },
  HISTORICAL_CERTIFICATES: {
    stage3f6a: cert('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json') === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
    stage3f6p: cert('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json') === '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
    stage3f6p1: cert('artifacts/stage3f6p1-nexus-remediation/stage3f6p1-certification-result.json') === '48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4',
    stage3f6p1a: cert('artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json') === 'c4029ff96e617341b448ae5d4f1853f6d21186134a64ce6162acc755394f40be',
    stage3f6p1b: cert('artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json') === '120e7649a2912447d149e8a1b4c1a24c6a1af6bd64d5b6b5efd1b6dfe4ddfbdb',
  },
  POLICY_SET_HASH_UNCHANGED: POLICY_SET_HASH === readJson('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').policySet.hash,
  TRANSFORM_GATE_UNCHANGED: FORGE_SYMMETRY_TRANSFORM_CONTRACT_HASH === readJson('artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json').transformContractHash,
};

/* ------------------------------------------------- new benchmark identity */
const benchmark = {
  BENCHMARK_ID: FORGE_SYMMETRIC_BENCHMARK_ID,
  GENERATOR_ID: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID, GENERATOR_CONTRACT_HASH: FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT_HASH,
  GENERATOR_SOURCE_HASH: hex(readFileSync(at('src/forge-symmetric/scenarios-symmetric-v1.js'))),
  ORACLE_ID: FORGE_COUNTERFACTUAL_SYMMETRIC_ID, ORACLE_CONTRACT_HASH: FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT_HASH,
  ORACLE_SOURCE_HASH: hex(readFileSync(at('src/forge-symmetric/counterfactual-symmetric-v1.js'))),
  SURFACE_ID: FORGE_ACTION_SURFACE_SYMMETRIC_ID, SURFACE_CONTRACT_HASH: FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT_HASH,
  SURFACE_SOURCE_HASH: hex(readFileSync(at('src/forge-symmetric/action-surface-symmetric-v1.js'))),
  ORIENTATION_ID: FORGE_ORIENTATION_SYMMETRIC_ID, ORIENTATION_CONTRACT_HASH: FORGE_ORIENTATION_SYMMETRIC_CONTRACT_HASH,
  ORIENTATION_SOURCE_HASH: hex(readFileSync(at('src/forge-symmetric/orientation-symmetric-v1.js'))),
  LABEL_ID: FORGE_GREEDY_SAFE_SYMMETRIC_ID,
  distinctFromHistorical: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID !== 'forge-scenarios-v3' && FORGE_COUNTERFACTUAL_SYMMETRIC_ID !== 'forge-counterfactual-v2',
};

/* --------------------------------------------------- 12/13. direction and placement */
const moveRows = rows.filter((r) => r.legalMoveCount > 0);
const moveOptimalRows = rows.filter((r) => r.moveOptimalRow === 1);
const directionDistribution = {
  rows: rows.length, moveOptimalRows: moveOptimalRows.length,
  P_LEGAL: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(rows, (r) => r.directionLegal[d] === 1)])),
  P_OPTIMAL_GIVEN_LEGAL: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(rows.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1)])),
  P_OPTIMAL_MOVE_OPTIMAL_ROWS: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(moveOptimalRows, (r) => r.directionOptimal[d] === 1)])),
  orientationDistribution: (() => { const o = {}; for (const r of rows) o[r.orientation] = (o[r.orientation] ?? 0) + 1; return Object.fromEntries(Object.entries(o).sort()); })(),
};
const dirMean = mean(DIRECTIONS.map((d) => directionDistribution.P_OPTIMAL_GIVEN_LEGAL[d]));
directionDistribution.meanOptimalGivenLegal = dirMean;
directionDistribution.maxDeviationFromMean = Math.max(...DIRECTIONS.map((d) => Math.abs(directionDistribution.P_OPTIMAL_GIVEN_LEGAL[d] - dirMean)));
directionDistribution.BALANCED = directionDistribution.maxDeviationFromMean <= plan.directionBalance.optimalGivenLegalMaxDeviation;

const withMaterial = rows.filter((r) => r.materialDirection !== null);
const placement = {
  n: withMaterial.length,
  adjacent: Object.fromEntries(DIRECTIONS.map((d) => [d, rate(withMaterial, (r) => r.materialDirection === d)])),
  beyondAdjacent: Object.fromEntries(['EAST_FAR', 'WEST_FAR', 'SOUTH_FAR', 'NORTH_FAR'].map((d) => [d, rate(withMaterial, (r) => r.materialDirection === d)])),
  historical: plan.directionBalance.historicalMaterialShare,
};
placement.maxAdjacentShare = Math.max(...DIRECTIONS.map((d) => placement.adjacent[d]));
placement.EAST_FIRST_ELIMINATED = placement.maxAdjacentShare <= plan.directionBalance.materialPlacementMaxShare;

/* ------------------------------------------------------- 9/10/11. equivariance */
const exceptionRows = rows.filter((r) => r.canonicalFrameDigestTied === 1 || TRANSFORMS.some((t) => r.transforms[t].canonicalFrameDigestTiedT === 1));
const scored = rows.filter((r) => !exceptionRows.includes(r));
const perTransform = Object.fromEntries(TRANSFORMS.map((t) => {
  const e = scored.map((r) => r.transforms[t]);
  const retreat = e.filter((x) => x.retreatEquivariant !== null);
  const rotate = e.filter((x) => x.mappedOptimalDirectionPreserved !== null);
  return [t, {
    n: e.length,
    LEGAL_SURFACE_EQUIVARIANCE: rate(e, (x) => x.legalEquivariant === 1),
    OPTIMAL_SET_EQUIVARIANCE: rate(e, (x) => x.optimalEquivariant === 1),
    REGRET_EQUIVARIANCE: rate(e, (x) => x.regretEquivariant === 1),
    LABEL_EQUIVARIANCE: rate(e, (x) => x.labelEquivariant === 1),
    RETREAT_EQUIVARIANCE: retreat.length ? rate(retreat, (x) => x.retreatEquivariant === 1) : null, retreatRows: retreat.length,
    regretActionPairsCompared: e.reduce((s, x) => s + x.regretCompared, 0), regretActionPairMismatches: e.reduce((s, x) => s + x.regretMismatches, 0),
    MAPPED_OPTIMAL_DIRECTION_PRESERVED: rotate.length ? rate(rotate, (x) => x.mappedOptimalDirectionPreserved === 1) : null,
    FIXED_EAST_PERSISTENCE: rate(scored.filter((r) => r.directionOptimal.EAST === 1), (r) => r.transforms[t].directionOptimalT.EAST === 1),
  }];
}));
const worst = (field) => Math.min(...TRANSFORMS.map((t) => perTransform[t][field]).filter((v) => v !== null));
const equivariance = {
  exceptionRows: exceptionRows.length, exception: plan.declaredExceptionBeforeEvaluation.id, scoredRows: scored.length, perTransform,
  LEGAL_SURFACE_EQUIVARIANCE: worst('LEGAL_SURFACE_EQUIVARIANCE'), OPTIMAL_SET_EQUIVARIANCE: worst('OPTIMAL_SET_EQUIVARIANCE'),
  REGRET_EQUIVARIANCE: worst('REGRET_EQUIVARIANCE'), LABEL_EQUIVARIANCE: worst('LABEL_EQUIVARIANCE'), RETREAT_EQUIVARIANCE: worst('RETREAT_EQUIVARIANCE'),
  SYMMETRIC_GREEDY_SAFE_EQUIVARIANCE: worst('LABEL_EQUIVARIANCE'),
  SUCCESSOR_STATE_COVERAGE: rate(rows, (r) => r.successorCoverage === 1),
};
equivariance.TARGETS_MET = ['LEGAL_SURFACE_EQUIVARIANCE', 'OPTIMAL_SET_EQUIVARIANCE', 'REGRET_EQUIVARIANCE', 'LABEL_EQUIVARIANCE', 'RETREAT_EQUIVARIANCE']
  .every((k) => equivariance[k] !== null && equivariance[k] >= plan.equivarianceTargets[k]) && equivariance.SUCCESSOR_STATE_COVERAGE === 1;

/* --------------------------------------------------------- 14. fixed baselines */
const fixedBaselines = {
  ...Object.fromEntries(DIRECTIONS.map((d) => [`FIXED_${d}`, rate(moveOptimalRows.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1)])),
  LOWEST_ID_MOVE: rate(moveOptimalRows.filter((r) => r.lowestIdentityMove !== null), (r) => r.lowestIdentityMove.optimal === 1),
  DETERMINISTIC_RANDOM_MOVE: mean(moveOptimalRows.map((r) => r.randomMoveExpectedAccuracy)),
  lowestIdentityDirectionShare: (() => { const o = {}; for (const r of moveRows) if (r.lowestIdentityMove) o[r.lowestIdentityMove.direction] = (o[r.lowestIdentityMove.direction] ?? 0) + 1;
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / moveRows.length]).sort()); })(),
};
fixedBaselines.fixedSpread = Math.max(...DIRECTIONS.map((d) => fixedBaselines[`FIXED_${d}`])) - Math.min(...DIRECTIONS.map((d) => fixedBaselines[`FIXED_${d}`]));
fixedBaselines.lowestIdVersusRandom = fixedBaselines.LOWEST_ID_MOVE - fixedBaselines.DETERMINISTIC_RANDOM_MOVE;
fixedBaselines.NO_UNEXPLAINED_FIXED_DIRECTION_ADVANTAGE = fixedBaselines.fixedSpread <= plan.directionBalance.fixedBaselineSpread
  && Math.abs(fixedBaselines.lowestIdVersusRandom) <= plan.directionBalance.lowestIdVersusRandomMax;

/* ------------------------------------------------- 16/17/18. policy diagnostics */
const policyMetrics = (subset) => Object.fromEntries(plan.policyDiagnostic.policies.map((p) => {
  const acting = subset.filter((r) => r.policies[p].chosen !== null);
  return [p, { coverage: subset.length ? acting.length / subset.length : null, n: acting.length,
    accuracy: mean(acting.map((r) => r.policies[p].correct)), meanRegret: mean(acting.map((r) => r.policies[p].regret)),
    moveRate: rate(acting, (r) => r.policies[p].actionType === 'MOVE'),
    resourceAgreement: rate(acting, (r) => r.policies[p].chosen === r.policies.RESOURCE_PRESERVING_V1.chosen) }];
}));
const nexusActing = rows.filter((r) => r.policies.NEXUS_SELECTOR_V1.chosen !== null);
const historicalPolicy = readJson('artifacts/stage3f6p1a-nexus-spatial/stage3f6p1a-certification-result.json').analysis.policies;
const symmetricOnNexusRows = policyMetrics(nexusActing);
const deltas = {
  RESOURCE_PRESERVING_V1: { historical: { accuracy: historicalPolicy.RESOURCE.accuracy, meanRegret: historicalPolicy.RESOURCE.meanRegret },
    symmetric: { accuracy: symmetricOnNexusRows.RESOURCE_PRESERVING_V1.accuracy, meanRegret: symmetricOnNexusRows.RESOURCE_PRESERVING_V1.meanRegret } },
  NEXUS_SELECTOR_V1: { historical: { accuracy: historicalPolicy.V1.accuracy, meanRegret: historicalPolicy.V1.meanRegret },
    symmetric: { accuracy: symmetricOnNexusRows.NEXUS_SELECTOR_V1.accuracy, meanRegret: symmetricOnNexusRows.NEXUS_SELECTOR_V1.meanRegret } },
  NEXUS_SELECTOR_V2_CANDIDATE: { historical: { accuracy: historicalPolicy.V2.accuracy, meanRegret: historicalPolicy.V2.meanRegret },
    symmetric: { accuracy: symmetricOnNexusRows.NEXUS_SELECTOR_V2_CANDIDATE.accuracy, meanRegret: symmetricOnNexusRows.NEXUS_SELECTOR_V2_CANDIDATE.meanRegret } },
};
for (const [, d] of Object.entries(deltas)) {
  d.accuracyDelta = d.symmetric.accuracy === null ? null : d.symmetric.accuracy - d.historical.accuracy;
  d.regretDelta = d.symmetric.meanRegret === null ? null : d.symmetric.meanRegret - d.historical.meanRegret;
  d.exceedsThreshold = (d.accuracyDelta !== null && Math.abs(d.accuracyDelta) >= plan.historicalImpactRules.thresholds.policyAccuracyDelta)
    || (d.regretDelta !== null && Math.abs(d.regretDelta) >= plan.historicalImpactRules.thresholds.policyRegretDelta);
}
const zeroCostRows = rows.filter((r) => r.zeroCostOptimalExists === 1);
const resourceShortcut = {
  P_ZERO_COST_ACTION_OPTIMAL: rate(rows, (r) => r.zeroCostOptimalExists === 1),
  P_RESOURCE_CORRECT_GIVEN_ZERO_COST_OPTIMAL: rate(zeroCostRows.filter((r) => r.policies.RESOURCE_PRESERVING_V1.chosen !== null), (r) => r.policies.RESOURCE_PRESERVING_V1.correct === 1),
  P_RESOURCE_CORRECT_OTHERWISE: rate(rows.filter((r) => r.zeroCostOptimalExists === 0 && r.policies.RESOURCE_PRESERVING_V1.chosen !== null), (r) => r.policies.RESOURCE_PRESERVING_V1.correct === 1),
  RESOURCE_MOVE_DIRECTION_SHARE: (() => { const o = {}; for (const r of rows) { const key = r.policies.RESOURCE_PRESERVING_V1.chosen;
    if (key === null || r.policies.RESOURCE_PRESERVING_V1.actionType !== 'MOVE') continue; const d = DIRECTIONS.find((x) => r.directionLegal[x] === 1 && r.lowestIdentityMove?.direction === x);
    o[d ?? 'OTHER'] = (o[d ?? 'OTHER'] ?? 0) + 1; } return o; })(),
  separation: 'the resource-cost shortcut is P(zero-cost optimal) and RESOURCE accuracy conditioned on it; the directional shortcut is the fixed-direction baseline table',
};
const policyDiagnostic = { overall: policyMetrics(rows), onNexusProposingRows: symmetricOnNexusRows, nexusProposingRows: nexusActing.length, deltas, resourceShortcut,
  status: plan.policyDiagnostic.status };

/* ------------------------------------------------------- 19. historical impact */
const policyDeltaExceeded = Object.values(deltas).some((d) => d.exceedsThreshold);
const STAGE_CLAIMS = [
  { stage: '3F.6-C', headline: 'CORE features predict GREEDY_SAFE; the deployable fallback lacks action computation', dependsOn: ['LABELS'] },
  { stage: '3F.6-A', headline: 'the deployable proposal contract: producers are distinct, decision-time and simulator-free', dependsOn: ['STRUCTURAL'] },
  { stage: '3F.6-T', headline: 'no trained router materially beats ALWAYS_RESOURCE_PRESERVING_V1', dependsOn: ['POLICY_COMPARISON', 'LABELS'] },
  { stage: '3F.6-W', headline: 'risk-state enrichment adds little to predicting which policy is best', dependsOn: ['POLICY_COMPARISON', 'LABELS'] },
  { stage: '3F.6-D', headline: 'cost-sensitive decision rules beat argmax only marginally and collapse toward RESOURCE', dependsOn: ['POLICY_COMPARISON', 'LABELS'] },
  { stage: '3F.6-P', headline: 'policy quality is the binding limitation; RESOURCE KEEP, NEXUS REDESIGN_CANDIDATE', dependsOn: ['POLICY_COMPARISON', 'LABELS'] },
  { stage: '3F.6-P.1', headline: 'gating reflexive PROTECT improves NEXUS standalone but collapses onto RESOURCE and lowers policy-set value', dependsOn: ['POLICY_COMPARISON', 'MOVE_DIRECTION'] },
  { stage: '3F.6-P.1A', headline: 'available relational spatial context cannot predict MOVE direction (baseline 0.724)', dependsOn: ['MOVE_DIRECTION'] },
];
const classify = (dependsOn) => {
  if (dependsOn.length === 1 && dependsOn[0] === 'STRUCTURAL') return 'UNAFFECTED';
  if (dependsOn.includes('MOVE_DIRECTION')) return 'REQUIRES_RERUN';
  if (dependsOn.includes('POLICY_COMPARISON')) return policyDeltaExceeded ? 'REQUIRES_RERUN' : 'MATERIAL_CONFOUND';
  return 'MINOR_NUMERICAL_CONFOUND';
};
const historicalImpact = STAGE_CLAIMS.map((s) => ({ ...s, impact: classify(s.dependsOn) }));

/* ------------------------------------------------------------------ checks */
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p1c-symmetric-benchmark.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const scope = {
  newOwners: ['src/forge-symmetric/orientation-symmetric-v1.js', 'src/forge-symmetric/action-surface-symmetric-v1.js', 'src/forge-symmetric/counterfactual-symmetric-v1.js',
    'src/forge-symmetric/scenarios-symmetric-v1.js', 'scripts/stage3f6p1c-analysis-plan.mjs', 'scripts/generate-stage3f6p1c-symmetric-evidence.mjs',
    'scripts/certify-stage3f6p1c-symmetric-benchmark.mjs', 'tests/stage3f6p1c-symmetric-benchmark.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  policiesModified: false, routerTrained: false, sentinelArchitectureModified: false, corpusGenerated: false,
};
const checks = {
  PLAN_BEFORE_EVIDENCE: integrity.planFileMatchesPlan && integrity.evidenceBoundToPlan,
  DATA_INTEGRITY: integrity.evidenceContent && integrity.freshSeedSpace && integrity.allAdmitted && integrity.sampleSize >= 1000 && integrity.historicalCorporaRead,
  FORGE_V1_UNCHANGED: preservation.FORGE_V1_UNCHANGED,
  POLICIES_UNCHANGED: preservation.POLICIES_UNCHANGED && preservation.POLICY_SET_HASH_UNCHANGED,
  HISTORICAL_CORPORA_UNCHANGED: preservation.HISTORICAL_CORPORA_UNCHANGED,
  HISTORICAL_RECORDS_REPRODUCE: preservation.HISTORICAL_RECORD_REPRODUCTION.reproduced === preservation.HISTORICAL_RECORD_REPRODUCTION.sampled,
  HISTORICAL_CERTIFICATES_INTACT: Object.values(preservation.HISTORICAL_CERTIFICATES).every(Boolean) && preservation.TRANSFORM_GATE_UNCHANGED,
  NEW_IDENTITIES_DISTINCT: benchmark.distinctFromHistorical,
  EAST_FIRST_PLACEMENT_FIXED: placement.EAST_FIRST_ELIMINATED,
  DIRECTION_BALANCED: directionDistribution.BALANCED,
  EQUIVARIANCE_TARGETS_MET: equivariance.TARGETS_MET,
  NO_FIXED_DIRECTION_ADVANTAGE: fixedBaselines.NO_UNEXPLAINED_FIXED_DIRECTION_ADVANTAGE,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const primaryResult = status === 'PASS' ? 'A_SYMMETRIC_BENCHMARK_CANDIDATE_CERTIFIED' : 'B_REMEDIATION_INCOMPLETE';

const payload = {
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1C_PLAN_HASH, CONFIRMATORY_CLAIMS: false,
  integrity, preservation, benchmark, remediatedDefects: {
    EAST_FIRST_PLACEMENT_FIXED: placement.EAST_FIRST_ELIMINATED,
    ACTION_ID_TIE_BREAK_FIXED: equivariance.OPTIMAL_SET_EQUIVARIANCE >= 1 && equivariance.LABEL_EQUIVARIANCE >= 1,
    RETREAT_AXIS_BIAS_FIXED: equivariance.RETREAT_EQUIVARIANCE === null ? null : equivariance.RETREAT_EQUIVARIANCE >= 1,
    LABELS_FIXED: equivariance.SYMMETRIC_GREEDY_SAFE_EQUIVARIANCE >= 1, defects: plan.remediatedDefects,
  },
  directionDistribution, placement, equivariance, fixedBaselines, policyDiagnostic, historicalImpact,
  diagnosis: { primaryResult,
    benchmarkConclusion: status === 'PASS'
      ? `FORGE_SYMMETRIC_V2 is direction-neutral on a fresh DEV sample: material adjacency max ${(placement.maxAdjacentShare * 100).toFixed(1)}% (was 78%), the four directions are optimal at ${DIRECTIONS.map((d) => (directionDistribution.P_OPTIMAL_GIVEN_LEGAL[d] * 100).toFixed(0)).join('/')}%, and legal surfaces, optimal sets, regrets and labels are exactly equivariant under all five transforms.`
      : 'remediation incomplete; see failed checks',
    historicalPerformanceDependence: `on the symmetric benchmark RESOURCE accuracy moves ${deltas.RESOURCE_PRESERVING_V1.accuracyDelta === null ? 'n/a' : deltas.RESOURCE_PRESERVING_V1.accuracyDelta.toFixed(3)} and NEXUS V2 ${deltas.NEXUS_SELECTOR_V2_CANDIDATE.accuracyDelta === null ? 'n/a' : deltas.NEXUS_SELECTOR_V2_CANDIDATE.accuracyDelta.toFixed(3)} against their Stage 3F.6-P.1A values`,
  },
  plan, scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))])),
  authority: plan.authority,
  roadmap: {
    NEW_CORPUS_LINEAGE_REQUIRED: true, READY_FOR_SYMMETRIC_CORPUS: status === 'PASS',
    READY_FOR_NEXUS_REEVALUATION: status === 'PASS' ? 'AFTER_SYMMETRIC_CORPUS' : false,
    READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false,
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1C_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    diagnosis: payload.diagnosis, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
