/* STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION — Stage 3E reference parity harness.
 *
 * DIAGNOSTIC / REFERENCE ONLY. It proves historical parity against the frozen Stage 3E fixtures and reports, feature
 * by feature, what the deployable runtime can and cannot reproduce. It is never the runtime implementation.
 *
 *   REFERENCE_PARITY_MODE   frozen Stage 3E features (training/stage3e-recovered/features-v2.mjs, imported unmodified,
 *                           byte-checked against the canonical lineage). Depends on reward-V2 immediate semantics,
 *                           frozen greedy identity, greedy-continuation HORIZON ROLLOUT totals, and V2B answers.
 *                           Not simulator-free. Not one-step. Not runtime-safe.
 *   DEPLOYABLE_RUNTIME_MODE the integrated runtime's own feature adapter, measured as-is and not redesigned here.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { deepFreeze } from '../src/core/determinism.js';
import { enumerateCurriculumV2 } from '../src/forge/scenarios-v2.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { replayFinal } from '../src/lab/stage3de-recovery-canonicalization.js';
import {
  STAGE3E_ROUTER_ABSTAIN_ROUTE, evaluateIntegratedStage3ERouter, extractIntegratedStage3EFeatures,
} from '../src/stage3f/integrated-live-shadow-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const round4 = (value) => Number(value.toFixed(4));
const readJson = (relative) => JSON.parse(readFileSync(path.join(ROOT, relative), 'utf8'));
const STAGE3E = 'artifacts/stage3e-routability-intelligence';

export const STAGE3E_SPLIT_NAMES = deepFreeze(['ROUTABILITY_DEV', 'ROUTABILITY_CAL', 'ROUTABILITY_HOLDOUT', 'ROUTABILITY_OOD']);
const PARTITION = deepFreeze({ ROUTABILITY_DEV: 'DEV', ROUTABILITY_CAL: 'CAL', ROUTABILITY_HOLDOUT: 'HOLDOUT', ROUTABILITY_OOD: 'OOD' });
/* Stage 3E curriculum identity, as recorded in training/stage3e-recovered/generate-fresh-stage3e.mjs. */
export const STAGE3E_CURRICULUM = deepFreeze({ levels: [0, 1, 2, 3, 4, 5], seeds: [201, 202, 203], oodLevels: [6, 7], oodSeeds: [211] });

export const FeatureParityStatus = deepFreeze({
  MATCH: 'MATCH', DIVERGENT: 'DIVERGENT', REQUIRES_MULTI_STEP_ROLLOUT: 'REQUIRES_MULTI_STEP_ROLLOUT',
  REQUIRES_V2B: 'REQUIRES_V2B', UNAVAILABLE: 'UNAVAILABLE',
});

export const STAGE3F6R_FEATURE_MODES = deepFreeze({
  REFERENCE_PARITY_MODE: {
    purpose: 'HISTORICAL_STAGE3E_PARITY_ONLY', diagnosticOnly: true, deployable: false,
    simulatorFree: false, oneStepRuntimeSafe: false, permanentRuntimeContract: false,
    dependencies: ['FORGE_REWARD_V2_IMMEDIATE_SEMANTICS', 'FROZEN_GREEDY_IDENTITY_OVER_V2_IMMEDIATE',
      'GREEDY_CONTINUATION_HORIZON_ROLLOUT_TOTALS', 'GENUINE_V2B_ANSWER_FOR_CANDIDATE_FEATURES'],
    implementation: 'training/stage3e-recovered/features-v2.mjs (frozen, imported unmodified)',
    v2bEvidence: 'V2B generations are archive-only; the 5 V2B-dependent features are not recomputed and are reported REQUIRES_V2B',
  },
  DEPLOYABLE_RUNTIME_MODE: {
    purpose: 'CURRENT_INTEGRATED_RUNTIME', implementation: 'src/stage3f/integrated-live-shadow-v1.js extractIntegratedStage3EFeatures',
    redesignedInThisGate: false, newFeaturesAdded: false,
  },
});

const MULTI_STEP_ROLLOUT = ['greedyFuturePotential', 'greedyInfraHealth', 'greedyOptionValue', 'greedyResourceCost',
  'greedyRiskExposure', 'greedyTerminalOutcome', 'greedyTimeCost'];
const REQUIRES_V2B = ['allThreeAgree', 'greedyEqLearned', 'nexusEqLearned', 'sameActionType', 'sameTarget'];
const ONE_STEP_SIMULATED = ['bestNonMoveMargin', 'greedyIsMove', 'immediateEntropy', 'immediateMargin', 'immediateMargin2',
  'immediateSpread', 'nearTieCount', 'topTieCount'];
const GREEDY_IDENTITY = ['allThreeAgree', 'greedyEqLearned', 'greedyEqNexus', 'sameActionType', 'sameTarget'];

export function featureDependencies(keys) {
  for (const key of [...MULTI_STEP_ROLLOUT, ...REQUIRES_V2B, ...ONE_STEP_SIMULATED, ...GREEDY_IDENTITY]) {
    if (!keys.includes(key)) throw new Error(`feature dependency references unknown frozen feature: ${key}`);
  }
  return deepFreeze(Object.fromEntries(keys.map((key) => [key, {
    multiStepRollout: MULTI_STEP_ROLLOUT.includes(key),
    oneStepSimulated: ONE_STEP_SIMULATED.includes(key),
    greedyIdentityDependent: GREEDY_IDENTITY.includes(key),
    simulatorDependent: MULTI_STEP_ROLLOUT.includes(key) || ONE_STEP_SIMULATED.includes(key) || GREEDY_IDENTITY.includes(key),
    requiresV2B: REQUIRES_V2B.includes(key),
  }])));
}

function wilsonLower(k, n, z = 1.96) {
  if (n === 0) return 0;
  const p = k / n; const denominator = 1 + (z * z) / n;
  return Math.max(0, ((p + (z * z) / (2 * n)) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denominator);
}

export function loadFrozenFixtures() {
  const rows = Object.fromEntries(STAGE3E_SPLIT_NAMES.map((split) => [split, readJson(`${STAGE3E}/replay-fixtures/matrix-${split}.json`)]));
  const labels = new Map();
  for (const split of STAGE3E_SPLIT_NAMES) for (const row of rows[split]) labels.set(row.recordHash, { split, row });
  return {
    model: readJson(`${STAGE3E}/lr-model.json`), freeze: readJson(`${STAGE3E}/freeze-3e.json`), rows, labels,
    finals: { ROUTABILITY_HOLDOUT: readJson(`${STAGE3E}/final-ROUTABILITY_HOLDOUT.json`), ROUTABILITY_OOD: readJson(`${STAGE3E}/final-ROUTABILITY_OOD.json`) },
    runtimeTests: readJson(`${STAGE3E}/runtime-tests.json`),
  };
}

/** Positional proof: every frozen weight and the bias are read from the correct index by the runtime evaluator. */
export function routerBindingProbe(model) {
  const candidate = { actionId: 'stage3f6r-binding-probe' };
  const base = Object.fromEntries(model.keys.map((key, index) => [key, model.mu[index]]));
  const logit = (p) => Math.log(p / (1 - p));
  const bias = model.w[model.keys.length];
  const atBase = evaluateIntegratedStage3ERouter(base, candidate);
  const positions = model.keys.map((key, index) => {
    const probe = evaluateIntegratedStage3ERouter({ ...base, [key]: model.mu[index] + model.sd[index] }, candidate);
    return probe.score !== null && Math.abs(logit(probe.score) - bias - model.w[index]) < 1e-9;
  });
  const missing = { ...base }; delete missing[model.keys[0]];
  const incomplete = evaluateIntegratedStage3ERouter(missing, candidate);
  const nonFinite = evaluateIntegratedStage3ERouter({ ...base, [model.keys[0]]: Number.NaN }, candidate);
  return deepFreeze({
    featureCount: model.keys.length, weightCount: model.w.length,
    weightCountCorrect: model.w.length === model.keys.length + 1,
    biasBindingCorrect: atBase.score !== null && Math.abs(logit(atBase.score) - bias) < 1e-9,
    weightPositionsBound: positions.filter(Boolean).length,
    weightBindingCorrect: positions.every(Boolean),
    incompleteInputFailsClosed: incomplete.score === null && incomplete.selectedRoute === STAGE3E_ROUTER_ABSTAIN_ROUTE,
    nonFiniteInputFailsClosed: nonFinite.score === null && nonFinite.selectedRoute === STAGE3E_ROUTER_ABSTAIN_ROUTE,
  });
}

/** Replays every frozen fixture row through the runtime evaluator and compares with the frozen Stage 3E results. */
export function routerFixtureParity({ model, freeze, rows, finals, runtimeTests }) {
  const candidate = { actionId: 'stage3e-fixture-replay' };
  const replay = (split) => {
    const list = rows[split];
    const evaluations = list.map((row) => evaluateIntegratedStage3ERouter(row.f, candidate));
    const canonical = replayFinal(list, model, freeze, split).probabilities;
    let routedN = 0; let safeRouted = 0; let abstained = 0; let maxAbsoluteScoreDifference = 0;
    evaluations.forEach((evaluation, index) => {
      if (evaluation.selectedRoute === STAGE3E_ROUTER_ABSTAIN_ROUTE) { abstained += 1; return; }
      maxAbsoluteScoreDifference = Math.max(maxAbsoluteScoreDifference, Math.abs(evaluation.score - canonical[index]));
      if (evaluation.selectedRoute === 'GREEDY') { routedN += 1; safeRouted += list[index].y; }
    });
    return { measured: { n: list.length, routedN, safeRouted, falseSafeCount: routedN - safeRouted,
      precision: routedN ? round4(safeRouted / routedN) : 0, wilsonLower: round4(wilsonLower(safeRouted, routedN)),
      coverage: round4(routedN / list.length), abstained, maxAbsoluteScoreDifference }, routes: evaluations.map((entry) => entry.selectedRoute) };
  };
  const router = freeze.STAGE3E_ROUTER;
  const cal = replay('ROUTABILITY_CAL'); const holdout = replay('ROUTABILITY_HOLDOUT'); const ood = replay('ROUTABILITY_OOD');
  const same = (measured, expected) => Object.entries(expected).every(([key, value]) => measured[key] === value)
    && measured.abstained === 0 && measured.maxAbsoluteScoreDifference === 0;
  const pick = (result) => ({ routedN: result.router.routedN, precision: result.router.precision, wilsonLower: result.router.wilsonLower,
    coverage: result.router.coverage, falseSafeCount: result.router.falseSafeCount });
  const expected = {
    CAL: { routedN: router.calRoutedN, precision: router.calPrecision, wilsonLower: router.calWilsonLower, coverage: router.calCoverage },
    HOLDOUT: pick(finals.ROUTABILITY_HOLDOUT), OOD: pick(finals.ROUTABILITY_OOD),
  };
  const signature = sha256(rows.ROUTABILITY_HOLDOUT.map((row, index) =>
    `${row.recordHash}|${holdout.routes[index] === 'GREEDY' ? 'GREEDY' : 'LEARNED_V2B'}`).join('\n'));
  const result = {
    CAL: { measured: cal.measured, expected: expected.CAL, parity: same(cal.measured, expected.CAL) },
    HOLDOUT: { measured: holdout.measured, expected: expected.HOLDOUT, parity: same(holdout.measured, expected.HOLDOUT) },
    OOD: { measured: ood.measured, expected: expected.OOD, parity: same(ood.measured, expected.OOD) },
    holdoutRouteSignature: signature, frozenRouteSignature: runtimeTests.determinism.signature,
    routeSignatureParity: signature === runtimeTests.determinism.signature,
  };
  return deepFreeze({ ...result, referenceRouterParity: result.CAL.parity && result.HOLDOUT.parity && result.OOD.parity && result.routeSignatureParity });
}

export async function loadFrozenStage3EFeatureExtractor() {
  const relative = 'training/stage3e-recovered/features-v2.mjs';
  const bytes = readFileSync(path.join(ROOT, relative));
  const lineage = readJson('artifacts/stage3de-recovery-canonicalization/lineage-record.json');
  const entry = lineage.inventory.find((item) => item.canonicalPath === relative);
  const sourceSha256 = sha256(bytes);
  if (!entry || entry.sha256 !== sourceSha256) throw new Error('FROZEN_FEATURE_SOURCE_NOT_BYTE_IDENTICAL_TO_LINEAGE');
  const learnedNexusUrl = pathToFileURL(path.join(ROOT, 'src', 'lab', 'stage3c-learned-nexus.js')).href;
  const source = bytes.toString('utf8').replace(/from '([^']+)'/g, (statement, specifier) =>
    (specifier.endsWith('/src/lab/stage3c-learned-nexus.js') ? `from '${learnedNexusUrl}'` : statement));
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return { extractV2: module.extractV2, sourceSha256, lineageClassification: entry.classification };
}

function selectReferenceSample(labels, quota) {
  const corpusFile = path.join(ROOT, 'artifacts', 'stage3f6-prediction-reliability', 'evaluation-corpus.jsonl.gz');
  const manifestFile = path.join(ROOT, 'artifacts', 'stage3f6-prediction-reliability', 'evaluation-corpus-manifest.json');
  if (existsSync(corpusFile) && existsSync(manifestFile)) {
    const text = gunzipSync(readFileSync(corpusFile)).toString('utf8');
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (`sha256:${sha256(text)}` === manifest.corpusDigest) {
      const entries = text.trim().split('\n').map((line) => JSON.parse(line));
      const picks = Object.values(PARTITION).flatMap((partition) => entries.filter((entry) => entry.partition === partition)
        .map((entry) => [sha256(`STAGE3F6R_REFERENCE:${entry.recordHash}`), entry]).sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(0, quota).map(([, entry]) => ({ recordHash: entry.recordHash, ood: entry.ood,
          combination: { ...entry.combination, seed: Number(entry.combination.seed) } })));
      return { source: 'STAGE3F6_EVALUATION_CORPUS_DIGEST_VERIFIED', corpusDigest: manifest.corpusDigest, picks, corpusEntries: entries };
    }
  }
  const combos = [
    ...enumerateCurriculumV2({ levels: STAGE3E_CURRICULUM.levels, seeds: STAGE3E_CURRICULUM.seeds }).map((combination) => ({ combination, ood: false })),
    ...enumerateCurriculumV2({ levels: STAGE3E_CURRICULUM.oodLevels, seeds: STAGE3E_CURRICULUM.oodSeeds }).map((combination) => ({ combination, ood: true })),
  ];
  const counts = Object.fromEntries(Object.values(PARTITION).map((partition) => [partition, 0])); const picks = [];
  for (let index = 0; index < combos.length && Object.values(counts).some((count) => count < quota); index += 97) {
    let built; try { built = buildRecordV2(combos[index].combination, combos[index].ood); } catch { continue; }
    const hit = built.admitted ? labels.get(built.record.recordHash) : null;
    if (!hit || counts[PARTITION[hit.split]] >= quota) continue;
    counts[PARTITION[hit.split]] += 1;
    picks.push({ recordHash: built.record.recordHash, ood: combos[index].ood, combination: combos[index].combination, built });
  }
  return { source: 'DETERMINISTIC_CURRICULUM_SCAN_STRIDE_97', corpusDigest: null, picks, corpusEntries: null };
}

/** Feature-by-feature comparison of REFERENCE_PARITY_MODE and DEPLOYABLE_RUNTIME_MODE against frozen fixture values. */
export async function referenceFeatureParity({ fixtures, perPartitionQuota = 25 }) {
  const extractor = await loadFrozenStage3EFeatureExtractor();
  const keys = fixtures.model.keys; const dependencies = featureDependencies(keys);
  const sample = selectReferenceSample(fixtures.labels, perPartitionQuota);
  const tally = Object.fromEntries(keys.map((key) => [key, { referenceCompared: 0, referenceEqual: 0, deployableCompared: 0, deployableEqual: 0 }]));
  for (const pick of sample.picks) {
    const built = pick.built ?? buildRecordV2(pick.combination, pick.ood);
    if (!built.admitted || built.record.recordHash !== pick.recordHash) throw new Error(`REFERENCE_REBUILD_MISMATCH ${pick.recordHash}`);
    const frozen = fixtures.labels.get(pick.recordHash).row.f;
    const reference = extractor.extractV2(built.record, null);
    const state = forgeAdapterState(built.world);
    const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
    const preliminary = extractIntegratedStage3EFeatures(state, observation, null);
    const output = preliminary.selector.abstain ? preliminary.greedy : preliminary.selector;
    const deployable = extractIntegratedStage3EFeatures(state, observation, { actionId: output.actionId,
      producerId: preliminary.selector.abstain ? 'HEURISTIC_GREEDY_IMMEDIATE' : 'NEXUS_RELATIONAL_SELECTOR_V1', producerVersion: '1' }).values;
    for (const key of keys) {
      if (!dependencies[key].requiresV2B) {
        tally[key].referenceCompared += 1; if (reference[key] === frozen[key]) tally[key].referenceEqual += 1;
      }
      tally[key].deployableCompared += 1; if (deployable[key] === frozen[key]) tally[key].deployableEqual += 1;
    }
  }
  let corpusDivergence = null;
  if (sample.corpusEntries) {
    corpusDivergence = Object.fromEntries(keys.map((key) => [key, 0]));
    for (const entry of sample.corpusEntries) for (const key of Object.keys(entry.runtimeFeatureDiff)) corpusDivergence[key] += 1;
  }
  const S = FeatureParityStatus;
  const perFeature = keys.map((key, index) => {
    const count = tally[key]; const dependency = dependencies[key];
    const referenceExact = count.referenceCompared > 0 && count.referenceEqual === count.referenceCompared;
    const deployableExact = count.deployableEqual === count.deployableCompared && (corpusDivergence === null || corpusDivergence[key] === 0);
    return {
      index, feature: key, ...dependency,
      referenceStatus: dependency.requiresV2B ? S.REQUIRES_V2B : !referenceExact ? S.DIVERGENT
        : dependency.multiStepRollout ? S.REQUIRES_MULTI_STEP_ROLLOUT : S.MATCH,
      referenceValuesReproduced: dependency.requiresV2B ? null : referenceExact,
      deployableStatus: dependency.requiresV2B ? S.REQUIRES_V2B : dependency.multiStepRollout ? S.REQUIRES_MULTI_STEP_ROLLOUT
        : deployableExact ? S.MATCH : S.DIVERGENT,
      deployableSampleEqual: count.deployableEqual, sampleCompared: count.deployableCompared,
      deployableCorpusDivergentCases: corpusDivergence === null ? null : corpusDivergence[key],
    };
  });
  const tallyStatus = (field) => Object.fromEntries(Object.values(S).map((status) => [status, perFeature.filter((entry) => entry[field] === status).length]));
  const recomputable = perFeature.filter((entry) => !entry.requiresV2B);
  const summary = {
    featureCount: keys.length,
    multiStepFrozenFeatureCount: perFeature.filter((entry) => entry.multiStepRollout).length,
    simulatorDependentFeatureCount: perFeature.filter((entry) => entry.simulatorDependent).length,
    v2bDependentFeatureCount: perFeature.filter((entry) => entry.requiresV2B).length,
    referenceRecomputableFeatures: recomputable.length,
    referenceRecomputedExactly: recomputable.filter((entry) => entry.referenceValuesReproduced).length,
    referenceFeatureParity: recomputable.every((entry) => entry.referenceValuesReproduced),
    referenceStatusCounts: tallyStatus('referenceStatus'),
    deployableStatusCounts: tallyStatus('deployableStatus'),
    deployableStage3EFeatureParity: perFeature.every((entry) => entry.deployableStatus === S.MATCH),
    deployableRuntimeFeatureContractRequiresRedesign: perFeature.some((entry) =>
      [S.REQUIRES_MULTI_STEP_ROLLOUT, S.REQUIRES_V2B].includes(entry.deployableStatus)),
  };
  return deepFreeze({ modes: STAGE3F6R_FEATURE_MODES, sampleSource: sample.source, corpusDigest: sample.corpusDigest,
    sampleSize: sample.picks.length, perPartitionQuota, frozenExtractorSourceSha256: extractor.sourceSha256, perFeature, summary });
}
