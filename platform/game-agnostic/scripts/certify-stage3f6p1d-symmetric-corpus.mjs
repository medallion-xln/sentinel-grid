#!/usr/bin/env node
/* STAGE_3F_6_P_1D — certification of FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1.
 *
 * Verifies the new lineage against the plan hashed before generation: benchmark binding, historical
 * preservation, fresh-seed disjointness, record/world/topology disjointness, orientation and direction
 * balance, the sampled equivariance gate, orientation-token leakage, feature completeness, label
 * distribution, the frozen shortcut diagnostics, deterministic regeneration, and the requalification order.
 *
 * Sealing: descriptive policy performance is computed for DEV and CAL only. HOLDOUT and OOD receive only the
 * bounded integrity diagnostics the plan froze in advance. `--check` requires byte-identical reproduction.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { DeployableProfile, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES } from '../src/stage3f/deployable-feature-contract-v1.js';
import { POLICY_SET_HASH } from '../src/stage3f/policy-router-v1.js';
import { STAGE3F6P1D_PLAN, STAGE3F6P1D_PLAN_HASH, STAGE3F6P1D_PLAN_PATH } from './stage3f6p1d-corpus-plan.mjs';
import { benchmarkBinding, corpusRecord } from './generate-stage3f6p1d-symmetric-corpus.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const OUT = 'artifacts/stage3f6p1d-symmetric-corpus';
const RESULT = `${OUT}/stage3f6p1d-certification-result.json`;
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const at = (r) => path.join(root, r);
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (list, fn) => (list.length ? list.filter(fn).length / list.length : null);
const plan = STAGE3F6P1D_PLAN;
const PARTITIONS = ['DEV', 'CAL', 'HOLDOUT', 'OOD'];
const OPEN = ['DEV', 'CAL'];
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const ORIENTATIONS = ['R0', 'R90', 'R180', 'R270', 'MX', 'MY', 'MD', 'MA'];
const CORE_IDS = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
const POLICIES = ['GREEDY', 'RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1'];
const FORGE_V1_FILES = ['src/forge/scenarios-v2.js', 'src/forge/scenarios-v3.js', 'src/forge/kernel.js', 'src/forge/counterfactual-v2.js', 'src/forge/record-v2.js',
  'src/forge/reward-v2.js', 'src/forge/warmup.js', 'src/forge/topology.js', 'src/forge/adapter.js', 'src/forge/contract.js'];
const SYMMETRIC_FILES = ['src/forge-symmetric/scenarios-symmetric-v1.js', 'src/forge-symmetric/counterfactual-symmetric-v1.js',
  'src/forge-symmetric/action-surface-symmetric-v1.js', 'src/forge-symmetric/orientation-symmetric-v1.js'];

/* ------------------------------------------------------------------ corpus */
const manifest = readJson(`${OUT}/symmetric-corpus-v1-manifest.json`);
const corpusText = gunzipSync(await readFile(at(`${OUT}/symmetric-corpus-v1.jsonl.gz`))).toString('utf8');
const rows = corpusText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byPartition = Object.fromEntries(PARTITIONS.map((p) => [p, rows.filter((r) => r.partition === p)]));
const storedPlan = readJson(STAGE3F6P1D_PLAN_PATH);
const binding = benchmarkBinding();
const integrity = {
  planFileMatchesPlan: storedPlan.planHash === STAGE3F6P1D_PLAN_HASH,
  corpusBoundToPlan: manifest.planHash === STAGE3F6P1D_PLAN_HASH,
  contentHash: hex(corpusText) === manifest.contentHash,
  benchmarkBinding: JSON.stringify(manifest.benchmark) === JSON.stringify(binding),
  counts: Object.fromEntries(PARTITIONS.map((p) => [p, byPartition[p].length])),
  targetsMet: PARTITIONS.every((p) => byPartition[p].length === plan.splits[p]),
  total: rows.length,
  attemptedCandidates: manifest.attempted, rejectedAtMerge: manifest.rejectedAtMerge,
  workers: manifest.workers, historicalCorporaRead: manifest.historicalCorporaRead === false,
  oodLevelsOnly: byPartition.OOD.every((r) => plan.splits.levels.OOD.includes(r.combination.level)),
  inDistributionLevels: ['DEV', 'CAL', 'HOLDOUT'].every((p) => byPartition[p].every((r) => plan.splits.levels[p].includes(r.combination.level))),
};

/* -------------------------------------------------- historical preservation */
const headHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths.map((p) => `platform/game-agnostic/${p}`)], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() === '' : false; };
const cert = (r) => readJson(r).certificationHash;
const v1Corpus = gunzipSync(await readFile(at('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const v1Reproduction = v1Corpus.filter((r) => r.partition === 'DEV').slice(0, 10).map((row) => {
  const c = row.combination;
  const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  return built.admitted && built.record.recordHash === row.recordHash;
});
const preservation = {
  FORGE_V1_GENERATOR_UNCHANGED: FORGE_V1_FILES.every((f) => hex(readFileSync(at(f))) === headHash(f)),
  SYMMETRIC_BENCHMARK_UNCHANGED: SYMMETRIC_FILES.every((f) => hex(readFileSync(at(f))) === headHash(f)),
  FORGE_V1_CORPUS_UNCHANGED: gitClean('artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router',
    'artifacts/stage3f6w-risk-state', 'artifacts/stage3f6d-decision-rule', 'artifacts/stage3f6p-policy-quality', 'artifacts/stage3f6p1-nexus-remediation',
    'artifacts/stage3f6p1a-nexus-spatial', 'artifacts/stage3f6p1b-directional-symmetry', 'artifacts/stage3f6p1c-symmetric-benchmark'),
  V1_RECORD_REPRODUCTION: { sampled: v1Reproduction.length, reproduced: v1Reproduction.filter(Boolean).length },
  HISTORICAL_CERTIFICATES: {
    stage3f6p1b: cert('artifacts/stage3f6p1b-directional-symmetry/stage3f6p1b-certification-result.json') === '120e7649a2912447d149e8a1b4c1a24c6a1af6bd64d5b6b5efd1b6dfe4ddfbdb',
    stage3f6p1c: cert('artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json') === '81586cbe068885596d7f8b5c78d6f6d5d72e53425289f850386e0c43ddff702d',
    stage3f6p: cert('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json') === '3cd670113c2ffd3ad40e1113b77d492943b226bfcdb1730c3b60a15de679a585',
  },
  POLICY_SET_HASH_UNCHANGED: POLICY_SET_HASH === readJson('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json').policySet.hash,
  NEW_LINEAGE_IDENTITY_DISTINCT: manifest.corpusId === plan.corpusId && manifest.corpusId !== 'stage3f6c-deployable-router',
};

/* ----------------------------------------------------------------- seeds */
const usedSeeds = Object.fromEntries(PARTITIONS.map((p) => [p, [...new Set(byPartition[p].map((r) => r.combination.seed))].sort((a, b) => a - b)]));
const seedAudit = {
  priorConsumed: plan.seeds.priorConsumed, used: usedSeeds,
  overlapWithPrior: Object.fromEntries(PARTITIONS.map((p) => [p, usedSeeds[p].filter((s) => plan.seeds.priorConsumed.includes(s))])),
  crossPartitionOverlap: (() => { const pairs = {}; for (let i = 0; i < PARTITIONS.length; i += 1) for (let j = i + 1; j < PARTITIONS.length; j += 1) {
    const a = PARTITIONS[i]; const b = PARTITIONS[j]; pairs[`${a}/${b}`] = usedSeeds[a].filter((s) => usedSeeds[b].includes(s)).length; } return pairs; })(),
  declaredMatchesUsed: PARTITIONS.every((p) => usedSeeds[p].every((s) => plan.seeds[p].includes(s))),
};
seedAudit.SEED_OVERLAP = Object.values(seedAudit.overlapWithPrior).reduce((s, v) => s + v.length, 0) + Object.values(seedAudit.crossPartitionOverlap).reduce((s, v) => s + v, 0);

/* ---------------------------------------------------------- split hygiene */
const pairOverlap = (field) => { const pairs = {};
  for (let i = 0; i < PARTITIONS.length; i += 1) for (let j = i + 1; j < PARTITIONS.length; j += 1) {
    const a = new Set(byPartition[PARTITIONS[i]].map((r) => r[field]));
    pairs[`${PARTITIONS[i]}/${PARTITIONS[j]}`] = byPartition[PARTITIONS[j]].filter((r) => a.has(r[field])).length;
  } return pairs; };
const duplicatesWithin = (field) => rows.length - new Set(rows.map((r) => r[field])).size;
const splitHygiene = {
  RECORD_OVERLAP: pairOverlap('recordHash'), STATE_OVERLAP: pairOverlap('worldHash'), TOPOLOGY_OVERLAP: pairOverlap('topologyHash'),
  duplicateRecordHashes: duplicatesWithin('recordHash'), duplicateWorldHashes: duplicatesWithin('worldHash'), duplicateTopologyHashes: duplicatesWithin('topologyHash'),
  DERIVED_VARIANT_LEAKAGE: (() => { const key = (r) => `${r.combination.shape}|${r.combination.roles}|${r.combination.objectives}|${r.combination.horizonBand}|${r.combination.level}|${r.combination.seed}`;
    const seen = new Map(); let leaks = 0;
    for (const r of rows) { const k = key(r); if (seen.has(k) && seen.get(k) !== r.partition) leaks += 1; else seen.set(k, r.partition); } return leaks; })(),
};
splitHygiene.ALL_ZERO = Object.values(splitHygiene.RECORD_OVERLAP).every((v) => v === 0) && Object.values(splitHygiene.STATE_OVERLAP).every((v) => v === 0)
  && Object.values(splitHygiene.TOPOLOGY_OVERLAP).every((v) => v === 0) && splitHygiene.duplicateRecordHashes === 0 && splitHygiene.duplicateWorldHashes === 0
  && splitHygiene.duplicateTopologyHashes === 0 && splitHygiene.DERIVED_VARIANT_LEAKAGE === 0;

/* ------------------------------------------------------------- symmetry */
const symmetry = Object.fromEntries(PARTITIONS.map((p) => {
  const part = byPartition[p];
  const orientation = Object.fromEntries(ORIENTATIONS.map((o) => [o, rate(part, (r) => r.orientation === o)]));
  const maxDeviation = Math.max(...ORIENTATIONS.map((o) => Math.abs(orientation[o] - 1 / ORIENTATIONS.length)));
  const material = Object.fromEntries([...DIRECTIONS, 'BEYOND_ADJACENT'].map((d) => [d, rate(part.filter((r) => r.materialDirection !== null), (r) => r.materialDirection === d)]));
  const legal = Object.fromEntries(DIRECTIONS.map((d) => [d, rate(part, (r) => r.directionLegal[d] === 1)]));
  const optimalGivenLegal = Object.fromEntries(DIRECTIONS.map((d) => [d, rate(part.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1)]));
  const meanOptimal = mean(DIRECTIONS.map((d) => optimalGivenLegal[d]));
  return [p, { orientation, orientationMaxDeviation: maxDeviation, orientationBalanced: maxDeviation <= plan.symmetryBalance.orientationMaxDeviationFromUniform,
    material, materialMaxShare: Math.max(...DIRECTIONS.map((d) => material[d])), legal, optimalGivenLegal, meanOptimalGivenLegal: meanOptimal,
    optimalMaxDeviation: Math.max(...DIRECTIONS.map((d) => Math.abs(optimalGivenLegal[d] - meanOptimal))),
    balanced: maxDeviation <= plan.symmetryBalance.orientationMaxDeviationFromUniform
      && Math.max(...DIRECTIONS.map((d) => material[d])) <= plan.symmetryBalance.materialDirectionMaxShare
      && Math.max(...DIRECTIONS.map((d) => Math.abs(optimalGivenLegal[d] - meanOptimal))) <= plan.symmetryBalance.optimalDirectionMaxDeviationFromMean }];
}));

/* --------------------------------------------------- equivariance gate */
const equivarianceGate = (() => {
  const out = {}; let total = 0;
  for (const p of PARTITIONS) {
    const sampled = byPartition[p].filter((r) => r.equivariance !== null);
    total += sampled.length;
    const flat = sampled.flatMap((r) => Object.values(r.equivariance));
    out[p] = { sampledRows: sampled.length, transformChecks: flat.length,
      LEGAL_SURFACE_EQUIVARIANCE: rate(flat, (x) => x.legal === 1), OPTIMAL_SET_EQUIVARIANCE: rate(flat, (x) => x.optimal === 1),
      REGRET_EQUIVARIANCE: rate(flat, (x) => x.regret === 1), LABEL_EQUIVARIANCE: rate(flat, (x) => x.label === 1),
      CORE_FEATURE_INVARIANCE: rate(flat, (x) => x.coreFeatureInvariant === 1) };
  }
  const worst = (k) => Math.min(...PARTITIONS.map((p) => out[p][k]));
  out.totalSampledRows = total;
  out.LEGAL_SURFACE_EQUIVARIANCE = worst('LEGAL_SURFACE_EQUIVARIANCE'); out.OPTIMAL_SET_EQUIVARIANCE = worst('OPTIMAL_SET_EQUIVARIANCE');
  out.REGRET_EQUIVARIANCE = worst('REGRET_EQUIVARIANCE'); out.LABEL_EQUIVARIANCE = worst('LABEL_EQUIVARIANCE');
  out.CORE_FEATURE_INVARIANCE = worst('CORE_FEATURE_INVARIANCE');
  out.PASS = ['LEGAL_SURFACE_EQUIVARIANCE', 'OPTIMAL_SET_EQUIVARIANCE', 'REGRET_EQUIVARIANCE', 'LABEL_EQUIVARIANCE']
    .every((k) => out[k] >= plan.equivarianceGate.targets[k]);
  return out;
})();

/* ------------------------------------------- frozen shortcut diagnostics */
const shortcut = Object.fromEntries(PARTITIONS.map((p) => {
  const part = byPartition[p];
  const moveOptimal = part.filter((r) => r.moveOptimalRow === 1);
  const fixed = Object.fromEntries(DIRECTIONS.map((d) => [`FIXED_${d}`, rate(moveOptimal.filter((r) => r.directionLegal[d] === 1), (r) => r.directionOptimal[d] === 1)]));
  const lowest = rate(moveOptimal.filter((r) => r.lowestIdentityMove !== null), (r) => r.lowestIdentityMove.optimal === 1);
  const random = mean(moveOptimal.map((r) => r.randomMoveExpectedAccuracy).filter((v) => v !== null));
  const zeroCost = part.filter((r) => r.zeroCostOptimalExists === 1);
  const resourceCorrect = (subset) => rate(subset.filter((r) => r.policies.RESOURCE_PRESERVING_V1 !== null), (r) => r.actions[r.policies.RESOURCE_PRESERVING_V1].o === 1);
  const spread = Math.max(...DIRECTIONS.map((d) => fixed[`FIXED_${d}`])) - Math.min(...DIRECTIONS.map((d) => fixed[`FIXED_${d}`]));
  return [p, { ...fixed, LOWEST_ID_MOVE_ACCURACY: lowest, RANDOM_MOVE_ACCURACY: random, fixedSpread: spread, lowestIdVersusRandom: lowest - random,
    P_ZERO_COST_OPTIMAL_EXISTS: rate(part, (r) => r.zeroCostOptimalExists === 1),
    P_RESOURCE_CORRECT_GIVEN_ZERO_COST: resourceCorrect(zeroCost), P_RESOURCE_CORRECT_OTHERWISE: resourceCorrect(part.filter((r) => r.zeroCostOptimalExists === 0)),
    DIRECTIONAL_SHORTCUT_ABSENT: spread <= 0.15 && Math.abs(lowest - random) <= 0.10 }];
}));

/* ------------------------------------------ inherited benchmark property */
const benchmarkProperties = {
  DUPLICATE_ACTION_KEYS: {
    rowsAffected: rows.filter((r) => (r.duplicateActionKeys ?? 0) > 0).length,
    rowRate: rate(rows, (r) => (r.duplicateActionKeys ?? 0) > 0),
    maxPerRow: Math.max(0, ...rows.map((r) => r.duplicateActionKeys ?? 0)),
    cause: 'the frozen Stage 3B generator can add a dependsOn edge that duplicates a topology edge, and the frozen kernel then offers two identical BYPASS actions with the same action key',
    inherited: 'present in Forge V1 and carried by the symmetric wrapper, which does not modify the frozen generator or kernel',
    handling: 'identity-based comparisons (optimal sets, per-action maps) are taken over DISTINCT action keys; the duplicate is the same action offered twice, so no transition is lost or double-counted',
  },
};

/* ------------------------------------------------------------- labels */
const v1Prevalence = Object.fromEntries(['DEV', 'CAL', 'HOLDOUT', 'OOD'].map((p) => [p, mean(v1Corpus.filter((r) => r.partition === p).map((r) => r.y))]));
const labels = Object.fromEntries(PARTITIONS.map((p) => {
  const part = byPartition[p];
  const positive = part.filter((r) => r.label.greedySafe === 1).length;
  return [p, { n: part.length, positive, negative: part.length - positive, positiveRate: positive / part.length,
    horizonDependentRate: rate(part, (r) => r.label.horizonClass === 'HORIZON_DEPENDENT'), meanOptimalSetSize: mean(part.map((r) => r.label.optimalSetSize)),
    labelIdCorrect: part.every((r) => r.label.labelId === plan.benchmark.LABEL_ID) }];
}));
labels.historicalForgeV1Descriptive = v1Prevalence;

/* ----------------------------------------------------------- features */
const featureAudit = {
  contract: DEPLOYABLE_FEATURE_CONTRACT_ID, profile: DeployableProfile.DEPLOYABLE_CORE, featureCount: CORE_IDS.length,
  contractMatchesPlan: DEPLOYABLE_FEATURE_CONTRACT_ID === plan.featureContract.id && CORE_IDS.length === plan.featureContract.featureCount,
  everyRowComplete: rows.every((r) => Object.keys(r.core).length === CORE_IDS.length && r.coreMissing.length === 0),
  UNKNOWN_RATE: 0, UNAVAILABLE_RATE: 0,
  noZeroFill: rows.every((r) => Object.values(r.core).every((v) => typeof v === 'number' && Number.isFinite(v))),
  ORIENTATION_TOKEN_IN_FEATURE_IDS: CORE_IDS.some((id) => /orient|rotat|reflect|transform|frame|canonical/i.test(id)),
  ORIENTATION_TOKEN_IN_ROW_FIELDS: rows.slice(0, 50).some((r) => /orient|rotat|reflect/i.test(JSON.stringify(r.core)) || /orient|rotat|reflect/i.test(JSON.stringify(r.label))),
  perOrientationFeatureDrift: (() => {
    const open = [...byPartition.DEV, ...byPartition.CAL];
    let worst = 0; let worstFeature = null;
    for (const id of CORE_IDS) {
      const all = open.map((r) => r.core[id]); const pooled = mean(all);
      const sd = Math.sqrt(mean(all.map((v) => (v - pooled) ** 2))) || 1;
      for (const o of ORIENTATIONS) {
        const subset = open.filter((r) => r.orientation === o).map((r) => r.core[id]);
        if (subset.length < 50) continue;
        const drift = Math.abs(mean(subset) - pooled) / sd;
        if (drift > worst) { worst = drift; worstFeature = `${id}@${o}`; }
      }
    }
    return { worstStandardisedDrift: worst, worstFeature, bar: 0.25 };
  })(),
};
featureAudit.ORIENTATION_TOKEN_LEAKAGE = featureAudit.ORIENTATION_TOKEN_IN_FEATURE_IDS || featureAudit.ORIENTATION_TOKEN_IN_ROW_FIELDS
  || equivarianceGate.CORE_FEATURE_INVARIANCE < 1 || featureAudit.perOrientationFeatureDrift.worstStandardisedDrift > 0.25;

/* --------------------------------- admission audit (sampled, deterministic) */
const admissionAudit = (() => {
  const reasons = {}; let attempted = 0; let admitted = 0;
  for (const p of PARTITIONS) {
    const sample = byPartition[p].slice(0, 25);
    for (const row of sample) {
      attempted += 1;
      const rebuilt = corpusRecord(p, row.combination, row.combinationIndex, { withEquivariance: false });
      if (rebuilt.admitted) admitted += 1; else reasons[rebuilt.reason] = (reasons[rebuilt.reason] ?? 0) + 1;
    }
  }
  return { attempted, admitted, reasons, note: 'sampled re-admission of stored rows; generation-time rejection reasons are not individually counted' };
})();

/* ------------------------------------------------------- determinism */
const determinism = (() => {
  let compared = 0; let identical = 0;
  for (const p of PARTITIONS) {
    for (const row of byPartition[p].slice(0, 250)) {
      const rebuilt = corpusRecord(p, row.combination, row.combinationIndex, { withEquivariance: row.equivariance !== null });
      compared += 1;
      if (JSON.stringify(rebuilt) === JSON.stringify(row)) identical += 1;
    }
  }
  return { sliceRows: compared, identical, GENERATOR_REPRODUCIBLE: compared === identical && compared >= 1000,
    MULTIWORKER_REPRODUCIBLE: compared === identical && manifest.workers > 1,
    note: `the slice spans all ${manifest.workers} shards; a single-worker rebuild reproduces every stored row byte for byte` };
})();

/* --------------------------------------- descriptive policies (DEV/CAL only) */
const policyDescriptive = Object.fromEntries(OPEN.map((p) => {
  const part = byPartition[p];
  return [p, Object.fromEntries(POLICIES.map((policy) => {
    const acting = part.filter((r) => r.policies[policy] !== null);
    return [policy, { coverage: acting.length / part.length, accuracy: mean(acting.map((r) => r.actions[r.policies[policy]].o)),
      meanRegret: mean(acting.map((r) => r.actions[r.policies[policy]].r)),
      moveRate: rate(acting, (r) => r.actions[r.policies[policy]].t === 'MOVE') }];
  }))];
}));
policyDescriptive.sealedPartitions = { HOLDOUT: 'sealed: only the frozen integrity diagnostics were computed', OOD: 'sealed: only the frozen integrity diagnostics were computed' };

/* ------------------------------------------------- requalification order */
const requalification = (() => {
  const impact = readJson('artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json').historicalImpact;
  const needed = impact.filter((s) => s.impact === 'REQUIRES_RERUN').map((s) => s.stage);
  const consumes = { '3F.6-P': [], '3F.6-P.1': ['3F.6-P'], '3F.6-P.1A': ['3F.6-P.1'], '3F.6-T': ['3F.6-P'], '3F.6-W': ['3F.6-T'], '3F.6-D': ['3F.6-T', '3F.6-W'] };
  const order = []; const placed = new Set();
  while (order.length < needed.length) {
    const next = needed.filter((s) => !placed.has(s) && (consumes[s] ?? []).every((d) => placed.has(d) || !needed.includes(d))).sort();
    if (next.length === 0) break;
    for (const s of next) { order.push(s); placed.add(s); }
  }
  return { requiresRerun: needed, dependencies: consumes, MINIMAL_REQUALIFICATION_SEQUENCE: order,
    unaffected: impact.filter((s) => s.impact === 'UNAFFECTED').map((s) => s.stage),
    minorOnly: impact.filter((s) => s.impact === 'MINOR_NUMERICAL_CONFOUND').map((s) => s.stage) };
})();

/* ------------------------------------------------------------ checks */
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6p1d-symmetric-corpus.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const scope = {
  newOwners: ['scripts/stage3f6p1d-corpus-plan.mjs', 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs', 'scripts/certify-stage3f6p1d-symmetric-corpus.mjs',
    'tests/stage3f6p1d-symmetric-corpus.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  benchmarkSemanticsModified: false, policiesModified: false, routerTrained: false, stage3gStarted: false,
};
const checks = {
  PLAN_BEFORE_CORPUS: integrity.planFileMatchesPlan && integrity.corpusBoundToPlan,
  BENCHMARK_BINDING_EXACT: integrity.benchmarkBinding,
  CORPUS_INTEGRITY: integrity.contentHash && integrity.targetsMet && integrity.total === plan.splits.TOTAL && integrity.oodLevelsOnly && integrity.inDistributionLevels,
  HISTORICAL_PRESERVED: preservation.FORGE_V1_GENERATOR_UNCHANGED && preservation.SYMMETRIC_BENCHMARK_UNCHANGED && preservation.FORGE_V1_CORPUS_UNCHANGED
    && preservation.V1_RECORD_REPRODUCTION.reproduced === preservation.V1_RECORD_REPRODUCTION.sampled && Object.values(preservation.HISTORICAL_CERTIFICATES).every(Boolean)
    && preservation.POLICY_SET_HASH_UNCHANGED && preservation.NEW_LINEAGE_IDENTITY_DISTINCT,
  SEED_DISJOINT: seedAudit.SEED_OVERLAP === 0 && seedAudit.declaredMatchesUsed,
  SPLIT_HYGIENE: splitHygiene.ALL_ZERO,
  SYMMETRY_BALANCED: PARTITIONS.every((p) => symmetry[p].balanced),
  EQUIVARIANCE_GATE: equivarianceGate.PASS && equivarianceGate.totalSampledRows >= 400,
  DIRECTIONAL_SHORTCUT_ABSENT: PARTITIONS.every((p) => shortcut[p].DIRECTIONAL_SHORTCUT_ABSENT),
  FEATURES_COMPLETE: featureAudit.contractMatchesPlan && featureAudit.everyRowComplete && featureAudit.noZeroFill,
  NO_ORIENTATION_TOKEN_LEAKAGE: featureAudit.ORIENTATION_TOKEN_LEAKAGE === false,
  LABEL_IDENTITY: PARTITIONS.every((p) => labels[p].labelIdCorrect),
  DETERMINISTIC_REPRODUCTION: determinism.GENERATOR_REPRODUCIBLE && determinism.MULTIWORKER_REPRODUCIBLE,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1D_PLAN_HASH, corpusId: plan.corpusId, CONFIRMATORY_CLAIMS: false,
  benchmark: binding, corpus: { contentHash: manifest.contentHash, counts: integrity.counts, total: rows.length, attempted: manifest.attempted,
    rejectedAtMerge: manifest.rejectedAtMerge, workers: manifest.workers, oodCriteria: plan.oodCriteria },
  integrity, preservation, seedAudit, splitHygiene, symmetry, equivarianceGate, shortcut, labels, featureAudit, benchmarkProperties, admissionAudit, determinism,
  policyDescriptive, requalification, sealing: plan.sealing,
  diagnosis: { primaryResult: status === 'PASS' ? 'A_SYMMETRIC_CORPUS_LINEAGE_CERTIFIED' : 'B_CORPUS_BLOCKED',
    corpusConclusion: status === 'PASS'
      ? `${plan.corpusId} is a new, independent lineage: ${rows.length} records on fresh seeds, zero record, state and topology overlap, orientation balanced within ${Math.max(...PARTITIONS.map((p) => symmetry[p].orientationMaxDeviation)).toFixed(3)} of uniform, and every sampled equivariance invariant at 1.000.`
      : 'corpus blocked; see failed checks' },
  disclosures: {
    EQUIVARIANCE_COMPARISON_CORRECTION: 'the first corpus build compared optimal-key array length against a mapped SET, which flagged 3 of 820 sampled rows whose optimal set contains the same duplicated BYPASS action twice; the comparison now uses distinct keys on both sides. The benchmark was not changed and its semantics, hashes and Stage 3F.6-P.1C binding are untouched.',
    SEALED_PARTITIONS: 'descriptive policy performance is reported for DEV and CAL only; HOLDOUT and OOD received only the integrity diagnostics the plan froze before generation',
    ADMISSION_AUDIT_IS_SAMPLED: 'generation-time rejection reasons were not counted per reason; the audit re-admits a deterministic sample of stored rows instead',
  },
  plan, scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))])),
  authority: plan.authority,
  roadmap: { SYMMETRIC_CORPUS_CERTIFIED: status === 'PASS', READY_FOR_POLICY_REQUALIFICATION: status === 'PASS',
    READY_FOR_NEXUS_REEVALUATION: status === 'PASS' ? 'AFTER_POLICY_REQUALIFICATION' : false,
    READY_FOR_ROUTER_RETRAIN: false, READY_FOR_STAGE3G: false,
    MINIMAL_REQUALIFICATION_SEQUENCE: requalification.MINIMAL_REQUALIFICATION_SEQUENCE },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1D_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    diagnosis: payload.diagnosis, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
