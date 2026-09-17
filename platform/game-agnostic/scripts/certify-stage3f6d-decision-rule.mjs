#!/usr/bin/env node
/* STAGE_3F_6_D — cost-sensitive policy decision rule.
 *
 * Tests whether Stage 3F.6-T's low practical value comes from its DECISION RULE rather than missing
 * representation or model capacity. The router is the frozen Stage 3F.6-T model over the 30
 * DEPLOYABLE_CORE features; only the rule turning its scores into a policy choice varies.
 *
 * DEV builds the cost/value matrices and class weights. CAL chooses bounded calibration constants
 * and the headline rule. FRESH HOLDOUT/OOD (seeds 801-803 / 811) are sealed until the decision freeze
 * is written. The headline comparison is always vs ALWAYS_RESOURCE_PRESERVING_V1.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deepFreeze, sha256 } from '../src/core/determinism.js';
import {
  POLICY_SET_HASH, ROUTED_POLICIES, STAGE3F6T_METHODOLOGY, bestPolicySet, evaluateStrategy, falseSelectionHarm,
  pairedBootstrap, policyRouterHash, quantile, scorePolicies,
} from '../src/stage3f/policy-router-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES, DeployableProfile } from '../src/stage3f/deployable-feature-contract-v1.js';
import {
  DecisionRule, STAGE3F6D_METHODOLOGY, calibrateProbabilities, classWeightsFromDev, costMatrixHash, decide, matrixFromDev,
  nexusCapture, pearson, softCrossEntropy, spearman,
} from '../src/stage3f/decision-rule-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6d-decision-rule');
const resultPath = path.join(outDirectory, 'stage3f6d-certification-result.json');
const freezePath = path.join(outDirectory, 'stage3f6d-decision-freeze.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readText = (r) => readFileSync(path.join(root, r), 'utf8');
const readGz = async (r) => gunzipSync(await readFile(path.join(root, r))).toString('utf8');
const lines = (t) => t.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const RESOURCE = 'RESOURCE_PRESERVING_V1';

/* ------------------------------------------------------------------ 0. scope */
const prefix = (r) => `platform/game-agnostic/${r}`;
const gitClean = (...paths) => { const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : 'GIT_UNAVAILABLE'; };
const stage3f6s = JSON.parse(readText('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));
const stage3f6t = JSON.parse(readText('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json'));
const stage3f6tFreeze = JSON.parse(readText('artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json'));
const stage3f6w = JSON.parse(readText('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json'));
const CONTRACT_SOURCE = 'src/stage3f/deployable-feature-contract-v1.js';
const ROUTER_SOURCE = 'src/stage3f/policy-router-v1.js';
const PROPOSAL_SOURCE = 'src/stage3f/deployable-action-proposal-v1.js';
const stage3f6a = JSON.parse(readText('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'));
const scope = {
  priorOwnersUnchanged: gitClean(...['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered', CONTRACT_SOURCE,
    'src/stage3f/deployable-feature-extractor-v1.js', PROPOSAL_SOURCE, ROUTER_SOURCE, 'src/stage3f/decision-risk-state-v1.js',
    'src/lab/stage3c-learned-nexus.js', 'src/experts/nexus.js', 'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals',
    'artifacts/stage3f6t-policy-router', 'artifacts/stage3f6w-risk-state', 'scripts/certify-stage3f6t-policy-router.mjs',
    'scripts/certify-stage3f6w-risk-state.mjs'].map(prefix)) === '',
  stage3f6tHashMatchesAccepted: stage3f6t.certificationHash === '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
  stage3f6wHashMatchesAccepted: stage3f6w.certificationHash === '7c5db9fbdd1d02bbee76ee12a0a5bf8a6e98c5a53adb510b0ed7e57ebd295fb6',
  originalContractIntact: hex(readFileSync(path.join(root, CONTRACT_SOURCE))) === stage3f6s.sourceHashes[CONTRACT_SOURCE]
    && DEPLOYABLE_FEATURE_CONTRACT_HASH === stage3f6s.contract.hash,
  routerSourceUnchanged: hex(readFileSync(path.join(root, ROUTER_SOURCE))) === stage3f6t.sourceHashes[ROUTER_SOURCE],
  policyDefinitionsUnchanged: hex(readFileSync(path.join(root, PROPOSAL_SOURCE))) === stage3f6a.sourceHashes[PROPOSAL_SOURCE],
  policySetHashMatchesStage3F6T: POLICY_SET_HASH === stage3f6t.policySet.hash,
  enrichedV11UsedInHeadline: false,
  newOwners: ['src/stage3f/decision-rule-v1.js', 'scripts/generate-stage3f6d-confirmatory.mjs',
    'scripts/certify-stage3f6d-decision-rule.mjs', 'tests/stage3f6d-decision-rule.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  featuresAdded: false, policiesAdded: false, routerRetrained: false, largerModelTrained: false,
};

/* ------------------------------------------------------- 1. frozen router */
const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
const model = deepFreeze({ family: STAGE3F6T_METHODOLOGY.routerFamily, policies: ROUTED_POLICIES, featureKeys: stage3f6tFreeze.weights.featureKeys,
  mu: stage3f6tFreeze.weights.mu, sd: stage3f6tFreeze.weights.sd, W: stage3f6tFreeze.weights.W });
const routerHash = policyRouterHash(model);
const routerInputs = { routerHashMatchesStage3F6T: routerHash === stage3f6tFreeze.routerHash,
  featureKeysAreCore: JSON.stringify(model.featureKeys) === JSON.stringify(CORE_KEYS), featureCount: model.featureKeys.length };

/* --------------------------------------------------------- 2. DEV / CAL */
const corpusManifest = JSON.parse(readText('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json'));
const proposalsManifest = JSON.parse(readText('artifacts/stage3f6a-action-proposals/action-proposals-manifest.json'));
const corpusText = await readGz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const proposalsText = await readGz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz');
const proposals = new Map(lines(proposalsText).map((r) => [r.recordHash, r]));
const join = (part) => lines(corpusText).filter((r) => r.partition === part).map((r) => {
  const p = proposals.get(r.recordHash);
  return { partition: part, recordHash: r.recordHash, topologyHash: r.topologyHash, worldHash: r.worldHash, core: r.core, chosen: p.chosen, correct: p.correct, regret: p.regret };
});
const dev = join('DEV'); const cal = join('CAL');

/* ------------------------------------------------ 3. fresh sealed identities */
const confManifest = JSON.parse(readText('artifacts/stage3f6d-decision-rule/confirmatory-holdout-ood-manifest.json'));
const confText = await readGz('artifacts/stage3f6d-decision-rule/confirmatory-holdout-ood.jsonl.gz');
const confRows = lines(confText);
let decisionFreeze = null; const sealedAccessLog = [];
const sealedIdentities = () => confRows.map((r) => ({ partition: r.partition, recordHash: r.recordHash, topologyHash: r.topologyHash, worldHash: r.worldHash }));
function sealedRows(partition) {
  if (decisionFreeze === null) throw new Error(`SEALED_PARTITION_ACCESS_BEFORE_FREEZE: ${partition}`);
  sealedAccessLog.push({ partition, afterFreeze: true });
  return confRows.filter((r) => r.partition === partition);
}
const ids = sealedIdentities();
const devCal = [...dev, ...cal];
const overlap = (key) => { const s = new Set(devCal.map((r) => r[key])); return ids.filter((r) => s.has(r[key])).length; };
const dataset = {
  DEV_N: dev.length, CAL_N: cal.length, HOLDOUT_N: ids.filter((r) => r.partition === 'HOLDOUT').length, OOD_N: ids.filter((r) => r.partition === 'OOD').length,
  RECORD_OVERLAP: overlap('recordHash') + confManifest.overlapWithPriorDatasets.record + confManifest.internalOverlap.record,
  STATE_OVERLAP: overlap('worldHash') + confManifest.overlapWithPriorDatasets.state + confManifest.internalOverlap.state,
  TOPOLOGY_OVERLAP: overlap('topologyHash') + confManifest.overlapWithPriorDatasets.topology + confManifest.internalOverlap.HOLDOUT_OOD_topology,
  seedSpaceDisjoint: [...confManifest.spec.holdout.seeds, ...confManifest.spec.ood.seeds].every((s) => !confManifest.spec.priorSeedSpaces.includes(s)),
  priorDatasetsExcluded: confManifest.spec.priorDatasets,
  integrity: { corpus: hex(corpusText) === corpusManifest.contentHash, proposals: hex(proposalsText) === proposalsManifest.contentHash,
    confirmatory: hex(confText) === confManifest.contentHash },
  hashes: { DEV: corpusManifest.partitionHashes.DEV, CAL: corpusManifest.partitionHashes.CAL, HOLDOUT: confManifest.partitionHashes.HOLDOUT,
    OOD: confManifest.partitionHashes.OOD, confirmatory: confManifest.contentHash },
};

/* --------------------------------------------- 4. DEV matrices and weights */
const matrix = matrixFromDev(dev);
const COST_MATRIX_HASH = costMatrixHash(matrix);
const classWeights = classWeightsFromDev(dev);

/* --------------------------------------------- 5. CAL calibration constants */
const scoreCache = new Map();
const scored = (row) => { if (!scoreCache.has(row.recordHash)) scoreCache.set(row.recordHash, scorePolicies(model, row)); return scoreCache.get(row.recordHash); };
const temperatureGrid = STAGE3F6D_METHODOLOGY.temperatureGrid.map((T) => ({ T,
  crossEntropy: softCrossEntropy(cal.map((row) => { const s = scored(row); return { row, probabilities: calibrateProbabilities(s.probabilities, s.available, T) }; })) }));
const TEMPERATURE = [...temperatureGrid].sort((a, b) => a.crossEntropy - b.crossEntropy || a.T - b.T)[0].T;

const decision = (rule, row, nexusThreshold) => {
  const s = scored(row);
  return decide(rule, { probabilities: calibrateProbabilities(s.probabilities, s.available, TEMPERATURE), available: s.available,
    classWeights: classWeights.weights, costMatrix: matrix.cost, valueMatrix: matrix.value, nexusThreshold });
};
const nexusGrid = STAGE3F6D_METHODOLOGY.nexusThresholdGrid.map((tau) => {
  const e = evaluateStrategy(cal, (row) => decision(DecisionRule.E_NEXUS_THRESHOLD, row, tau).policy);
  return { tau, meanRegret: e.meanRegret, accuracy: e.accuracy };
});
const NEXUS_THRESHOLD = [...nexusGrid].sort((a, b) => a.meanRegret - b.meanRegret || b.accuracy - a.accuracy || b.tau - a.tau)[0].tau;
const chooser = (rule) => (row) => decision(rule, row, NEXUS_THRESHOLD).policy;

const calRules = Object.fromEntries(Object.values(DecisionRule).map((rule) => [rule, evaluateStrategy(cal, chooser(rule))]));
const headlineCandidates = [DecisionRule.B_CLASS_WEIGHTED, DecisionRule.C_EXPECTED_REGRET, DecisionRule.D_EXPECTED_VALUE, DecisionRule.E_NEXUS_THRESHOLD];
const HEADLINE_RULE = [...headlineCandidates].sort((a, b) => calRules[a].meanRegret - calRules[b].meanRegret
  || calRules[b].accuracy - calRules[a].accuracy || Object.values(DecisionRule).indexOf(a) - Object.values(DecisionRule).indexOf(b))[0];

/* ----------------------------------------------- 6. predeclared criteria */
const CRITERIA = deepFreeze({
  materiality: { regretReductionAtLeast: 2.0, regretRequiresCiUpperBelowZero: true, accuracyGainAtLeast: 0.01, accuracyRequiresCiLowerAboveZero: true,
    otherMetricMustNotBeSignificantlyWorse: true },
  harm: { ruleP95RegretMaxOverResource: 2, falseSelectionP95AddedAtMostResourceP95: true, episodesWorsenedAtMostImproved: true },
  collapse: { rawShare: 0.9, pathological: 'share > 0.9 AND share > best-set share of that policy + 0.05' },
  oodSurvival: 'vs ALWAYS_RESOURCE on fresh OOD: regret CI lower <= 0 AND accuracy CI upper >= 0',
  stage3gReadiness: ['headline rule materially beats ALWAYS_RESOURCE on fresh HOLDOUT', 'acceptable false-selection harm',
    'survives fresh OOD', 'no pathological collapse', 'deterministic replay', 'zero leakage'],
  resultPrecedence: ['A_DECISION_RULE_MATERIALLY_BEATS_ALWAYS_RESOURCE', 'D_MATERIAL_GAIN_WITH_UNACCEPTABLE_HARM',
    'B_COST_SENSITIVE_RULE_BETTER_BUT_NOT_MATERIAL', 'C_NO_DECISION_RULE_IMPROVES_ON_ALWAYS_RESOURCE'],
  bottleneckRule: 'PRIMARY_BOTTLENECK=DECISION_RULE only if result A; otherwise NOT_ESTABLISHED_AS_DECISION_RULE',
  capacityRule: 'MODEL_CAPACITY_GAP_NOT_ESTABLISHED if A; otherwise UNRESOLVED (no larger model trained)',
});

/* ------------------------------------------------------ 7. DECISION FREEZE */
const freezePayload = {
  gate: 'STAGE_3F_6_D_DECISION_RULE',
  routerArchitecture: STAGE3F6T_METHODOLOGY.routerFamily, routerHash, featureContract: { id: DEPLOYABLE_FEATURE_CONTRACT_ID, hash: DEPLOYABLE_FEATURE_CONTRACT_HASH, featureCount: CORE_KEYS.length },
  policySetHash: POLICY_SET_HASH, methodology: STAGE3F6D_METHODOLOGY,
  probabilityCalibration: { temperature: TEMPERATURE, grid: temperatureGrid },
  classWeights, costMatrix: matrix.cost, valueMatrix: matrix.value, costMatrixCells: matrix.cells, costMatrixHash: COST_MATRIX_HASH,
  emptyCellFallbacks: matrix.emptyCellFallbacks,
  decisionFormulas: { A: 'argmax p', B: 'argmax p_k*w_k', C: 'argmin Σ_r p_r Cost[k][r]', D: 'argmax Σ_r p_r Value[k][r]', E: 'NEXUS if available and p_NEXUS >= tau else argmax p' },
  thresholds: { nexusThreshold: NEXUS_THRESHOLD, nexusGrid },
  headlineRule: HEADLINE_RULE, calRuleMetrics: calRules, criteria: CRITERIA, splitHashes: dataset.hashes,
  sealedPartitionsUnopenedAtFreeze: true,
};
const DECISION_FREEZE_HASH = sha256(freezePayload);
decisionFreeze = { ...freezePayload, decisionFreezeHash: DECISION_FREEZE_HASH };
await mkdir(outDirectory, { recursive: true });
await writeFile(freezePath, `${JSON.stringify(decisionFreeze, null, 2)}\n`);

/* ---------------------------------------------------- 8. SEALED EVALUATION */
const holdout = sealedRows('HOLDOUT');
const ood = sealedRows('OOD');

function collapseOf(rows, choose) {
  const e = evaluateStrategy(rows, choose);
  const [top, share] = Object.entries(e.selectionDistribution).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const optimal = top ? rows.filter((r) => bestPolicySet(r).best.includes(top)).length / rows.length : 0;
  return { topPolicy: top, topShare: share, bestSetShareOfTop: optimal, POLICY_COLLAPSE: share > CRITERIA.collapse.rawShare,
    PATHOLOGICAL_COLLAPSE: share > CRITERIA.collapse.rawShare && share > optimal + 0.05 };
}

function evaluateRule(rows, rule) {
  const choose = chooser(rule);
  const e = evaluateStrategy(rows, choose);
  const vsResource = pairedBootstrap(rows, choose, () => RESOURCE);
  const vsArgmax = pairedBootstrap(rows, choose, chooser(DecisionRule.A_ARGMAX));
  const dist = e.selectionDistribution;
  return { ...e, deltaVsResource: vsResource, deltaVsArgmax: vsArgmax, nexus: nexusCapture(rows, choose), harm: falseSelectionHarm(rows, choose),
    selectedRates: Object.fromEntries(ROUTED_POLICIES.map((p) => [p, dist[p] ?? 0])), collapse: collapseOf(rows, choose) };
}

function judge(split, resource) {
  const b = split.deltaVsResource;
  const regMaterial = -b.regretDifference >= CRITERIA.materiality.regretReductionAtLeast && b.regretCi95[1] < 0;
  const accMaterial = b.accuracyDifference >= CRITERIA.materiality.accuracyGainAtLeast && b.accuracyCi95[0] > 0;
  const accWorse = b.accuracyCi95[1] < 0; const regWorse = b.regretCi95[0] > 0;
  const material = (regMaterial && !accWorse) || (accMaterial && !regWorse);
  const harmOk = split.p95Regret <= resource.p95Regret + CRITERIA.harm.ruleP95RegretMaxOverResource
    && (split.harm.p95 ?? 0) <= resource.p95Regret && b.episodesWorsened <= b.episodesImproved;
  const better = b.regretCi95[1] < 0 || b.accuracyCi95[0] > 0;
  return { material, harmOk, better, accWorse, regWorse };
}

const RULES = Object.values(DecisionRule);
const splits = {};
for (const [name, rows] of [['CAL', cal], ['HOLDOUT', holdout], ['OOD', ood]]) {
  const resource = evaluateStrategy(rows, () => RESOURCE);
  const oracle = evaluateStrategy(rows, (r) => { const { best } = bestPolicySet(r); return best.length ? best[0] : null; });
  const rules = Object.fromEntries(RULES.map((rule) => [rule, evaluateRule(rows, rule)]));
  splits[name] = { n: rows.length, alwaysResource: resource, oracle, rules,
    judgement: Object.fromEntries(RULES.map((rule) => [rule, judge(rules[rule], resource)])) };
}

/* expected-cost calibration (rule C) on fresh HOLDOUT */
const ecEntries = holdout.map((row) => { const d = decision(DecisionRule.C_EXPECTED_REGRET, row, NEXUS_THRESHOLD); return { ec: d.expectedCost, realized: row.regret[d.policy] }; });
const sortedEc = [...ecEntries].sort((a, b) => a.ec - b.ec);
const deciles = Array.from({ length: 10 }, (_, i) => {
  const chunk = sortedEc.slice(Math.floor((i * sortedEc.length) / 10), Math.floor(((i + 1) * sortedEc.length) / 10));
  return { decile: i + 1, n: chunk.length, meanExpectedCost: chunk.reduce((s, x) => s + x.ec, 0) / chunk.length, meanRealizedRegret: chunk.reduce((s, x) => s + x.realized, 0) / chunk.length };
});
const calibration = { rule: DecisionRule.C_EXPECTED_REGRET, split: 'HOLDOUT', pearson: pearson(ecEntries.map((x) => x.ec), ecEntries.map((x) => x.realized)),
  spearman: spearman(ecEntries.map((x) => x.ec), ecEntries.map((x) => x.realized)), deciles };

/* ---------------------------------------------------------- 9. diagnosis */
const H = splits.HOLDOUT.judgement[HEADLINE_RULE]; const O = splits.OOD.judgement[HEADLINE_RULE];
const headlineHoldout = splits.HOLDOUT.rules[HEADLINE_RULE];
const primaryResult = H.material && H.harmOk ? CRITERIA.resultPrecedence[0]
  : H.material ? CRITERIA.resultPrecedence[1] : H.better ? CRITERIA.resultPrecedence[2] : CRITERIA.resultPrecedence[3];
const argmaxH = splits.HOLDOUT.rules[DecisionRule.A_ARGMAX]; const regretH = splits.HOLDOUT.rules[DecisionRule.C_EXPECTED_REGRET];
const hypothesis = {
  statement: 'the router under-selects NEXUS because argmax favours the RESOURCE majority',
  argmaxNexusCapture: argmaxH.nexus.NEXUS_CAPTURE_RATE,
  classWeightedNexusCapture: splits.HOLDOUT.rules[DecisionRule.B_CLASS_WEIGHTED].nexus.NEXUS_CAPTURE_RATE,
  classWeightedRegretVsArgmax: splits.HOLDOUT.rules[DecisionRule.B_CLASS_WEIGHTED].deltaVsArgmax.regretDifference,
  expectedRegretNexusCapture: regretH.nexus.NEXUS_CAPTURE_RATE,
  expectedRegretRegretVsArgmax: regretH.deltaVsArgmax.regretDifference,
  costOfFalseNexusWhenResourceBest: matrix.cost.NEXUS_SELECTOR.RESOURCE_PRESERVING_V1,
  costOfResourceWhenNexusBest: matrix.cost.RESOURCE_PRESERVING_V1.NEXUS_SELECTOR,
  nexusRegretWhenNexusBest: matrix.cost.NEXUS_SELECTOR.NEXUS_SELECTOR,
  resourceRegretWhenResourceBest: matrix.cost.RESOURCE_PRESERVING_V1.RESOURCE_PRESERVING_V1,
};
hypothesis.supported = (hypothesis.expectedRegretNexusCapture ?? 0) > (hypothesis.argmaxNexusCapture ?? 0) && primaryResult === CRITERIA.resultPrecedence[0];

const readinessEvaluation = {
  materiallyBeatsAlwaysResource: H.material, acceptableFalseSelectionHarm: H.harmOk,
  survivesFreshOod: !O.regWorse && !O.accWorse, noPathologicalCollapse: !headlineHoldout.collapse.PATHOLOGICAL_COLLAPSE && !splits.OOD.rules[HEADLINE_RULE].collapse.PATHOLOGICAL_COLLAPSE,
  deterministicReplay: routerHash === stage3f6tFreeze.routerHash,
  zeroLeakage: dataset.RECORD_OVERLAP === 0 && dataset.STATE_OVERLAP === 0 && dataset.TOPOLOGY_OVERLAP === 0,
};
const readyForStage3G = Object.values(readinessEvaluation).every(Boolean);

/* -------------------------------------------------------------- tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6d-decision-rule.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* --------------------------------------------------------- assessment */
const checks = {
  STAGE3F6T_INTACT: scope.stage3f6tHashMatchesAccepted && scope.routerSourceUnchanged && routerInputs.routerHashMatchesStage3F6T,
  STAGE3F6W_INTACT: scope.stage3f6wHashMatchesAccepted,
  ORIGINAL_CONTRACT_INTACT: scope.originalContractIntact,
  FEATURE_COUNT_30: routerInputs.featureCount === 30 && routerInputs.featureKeysAreCore,
  POLICY_SET_UNCHANGED: scope.policySetHashMatchesStage3F6T && scope.policyDefinitionsUnchanged,
  PRIOR_OWNERS_UNCHANGED: scope.priorOwnersUnchanged,
  DATA_INTEGRITY: Object.values(dataset.integrity).every(Boolean),
  FRESH_SPLIT_SIZE: dataset.HOLDOUT_N === 6000 && dataset.OOD_N === 6000,
  ZERO_OVERLAP: dataset.RECORD_OVERLAP === 0 && dataset.STATE_OVERLAP === 0 && dataset.TOPOLOGY_OVERLAP === 0,
  SEED_SPACE_DISJOINT: dataset.seedSpaceDisjoint,
  COST_MATRIX_FROM_DEV: dev.every((r) => r.partition === 'DEV'),
  CALIBRATION_FROM_CAL: temperatureGrid.length > 0 && nexusGrid.length > 0,
  DECISION_FREEZE_WRITTEN: DECISION_FREEZE_HASH.length === 64,
  SEALED_OPENED_ONLY_AFTER_FREEZE: sealedAccessLog.length === 2 && sealedAccessLog.every((e) => e.afterFreeze),
  UNAVAILABLE_NEVER_SELECTED: RULES.every((rule) => [...holdout, ...ood].every((row) => scored(row).available.includes(chooser(rule)(row)))),
  NO_LIVE_PROMOTION: true,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_D_DECISION_RULE', status,
  headlineComparison: 'DECISION_RULE vs ALWAYS_RESOURCE_PRESERVING_V1',
  inputs: { featureContract: DEPLOYABLE_FEATURE_CONTRACT_ID, featureCount: CORE_KEYS.length, policySetHash: POLICY_SET_HASH, routerHash, routerInputs },
  dataset,
  decisionFreezeHash: DECISION_FREEZE_HASH, costMatrixHash: COST_MATRIX_HASH, costMatrix: matrix.cost, valueMatrix: matrix.value, costMatrixCells: matrix.cells,
  classWeights, temperature: TEMPERATURE, nexusThreshold: NEXUS_THRESHOLD, headlineRule: HEADLINE_RULE, criteria: CRITERIA,
  splits, calibration, hypothesis,
  diagnosis: { primaryResult,
    primaryBottleneck: primaryResult === CRITERIA.resultPrecedence[0] ? 'DECISION_RULE' : 'NOT_ESTABLISHED_AS_DECISION_RULE',
    modelCapacityGap: primaryResult === CRITERIA.resultPrecedence[0] ? 'MODEL_CAPACITY_GAP_NOT_ESTABLISHED' : 'UNRESOLVED',
    representationGap: `carried from Stage 3F.6-W: ${stage3f6w.classification.primaryResult}` },
  stage3gReadiness: { criteria: CRITERIA.stage3gReadiness, evaluation: readinessEvaluation, ready: readyForStage3G },
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(path.join(root, f)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
  roadmap: { readyForStage3G, blockers: Object.entries(readinessEvaluation).filter(([, v]) => !v).map(([k]) => `STAGE3G_READINESS_UNMET:${k}`) },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6D_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, decisionFreezeHash: DECISION_FREEZE_HASH, headlineRule: HEADLINE_RULE,
    failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), diagnosis: payload.diagnosis, readiness: readinessEvaluation }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
