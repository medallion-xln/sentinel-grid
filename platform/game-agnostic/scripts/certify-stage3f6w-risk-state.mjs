#!/usr/bin/env node
/* STAGE_3F_6_W — decision-state enrichment (risk state).
 *
 * Question: what information is missing when the router cannot tell that NEXUS (or another
 * deployable policy) beats RESOURCE_PRESERVING? First target: RISK_STATE.
 *
 * DEV/CAL ONLY. Every prior HOLDOUT/OOD is exposed and is never read. Field selection happens inside
 * DEV (2-fold); the incremental-information test is run ONCE on CAL, which selection never touched.
 * The analysis plan is hashed and written to disk before any metric is computed.
 * No router is tuned, retrained for promotion, or enlarged. Diagnostic models only measure information.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSeededRandom, deepFreeze, sha256 } from '../src/core/determinism.js';
import { auroc, fitLogisticRegression, scoreMatrix } from '../src/stage3f/deployable-router-v1.js';
import {
  ROUTED_POLICIES, STAGE3F6T_METHODOLOGY, availablePolicies, bestLabel, bestPolicySet, fitPolicyRouter,
  policyRouterHash, quantile, routeEpisode, scorePolicies,
} from '../src/stage3f/policy-router-v1.js';
import {
  DEPLOYABLE_FEATURE_CONTRACT, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES, DeployableProfile,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import {
  DECISION_RISK_STATE_CONTRACT, DECISION_RISK_STATE_CONTRACT_HASH, DECISION_RISK_STATE_CONTRACT_ID, RISK_STATE_FIELDS,
  RiskFieldStatus, extractDecisionRiskState,
} from '../src/stage3f/decision-risk-state-v1.js';
import { ObservationDegradation, degradeObservation } from '../src/stage3f/prediction-reliability-v1.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6w-risk-state');
const resultPath = path.join(outDirectory, 'stage3f6w-certification-result.json');
const planPath = path.join(outDirectory, 'stage3f6w-analysis-plan.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const readText = (relative) => readFileSync(path.join(root, relative), 'utf8');
const readGz = async (relative) => gunzipSync(await readFile(path.join(root, relative))).toString('utf8');
const lines = (text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/* ------------------------------------------------------------------ 0. scope */
const prefix = (relative) => `platform/game-agnostic/${relative}`;
const gitClean = (...paths) => {
  const r = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'GIT_UNAVAILABLE';
};
const stage3f6s = JSON.parse(readText('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));
const stage3f6a = JSON.parse(readText('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'));
const stage3f6t = JSON.parse(readText('artifacts/stage3f6t-policy-router/stage3f6t-certification-result.json'));
const stage3f6tFreeze = JSON.parse(readText('artifacts/stage3f6t-policy-router/stage3f6t-evaluation-freeze.json'));
const CONTRACT_SOURCE = 'src/stage3f/deployable-feature-contract-v1.js';
const ROUTER_SOURCE = 'src/stage3f/policy-router-v1.js';
const scope = {
  priorOwnersUnchanged: gitClean(...[
    'artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered', CONTRACT_SOURCE,
    'src/stage3f/deployable-feature-extractor-v1.js', 'src/stage3f/deployable-action-proposal-v1.js', ROUTER_SOURCE,
    'src/lab/stage3c-learned-nexus.js', 'src/experts/nexus.js', 'artifacts/stage3f6s-deployable-feature-contract',
    'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals', 'artifacts/stage3f6t-policy-router',
    'scripts/certify-stage3f6t-policy-router.mjs', 'scripts/generate-stage3f6t-confirmatory.mjs',
  ].map(prefix)) === '',
  stage3f6aHashMatchesAccepted: stage3f6a.certificationHash === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  stage3f6tHashMatchesAccepted: stage3f6t.certificationHash === '5d6910dd39405ee9f9fc2868f1309ff84998d30f7128e7a60b36644ca9056582',
  coreContractSourceUnchanged: hex(readFileSync(path.join(root, CONTRACT_SOURCE))) === stage3f6s.sourceHashes[CONTRACT_SOURCE],
  coreContractHashUnchanged: DEPLOYABLE_FEATURE_CONTRACT_HASH === stage3f6s.contract.hash,
  stage3f6tRouterSourceUnchanged: hex(readFileSync(path.join(root, ROUTER_SOURCE))) === stage3f6t.sourceHashes[ROUTER_SOURCE],
  newOwners: ['src/stage3f/decision-risk-state-v1.js', 'scripts/generate-stage3f6w-risk-evidence.mjs',
    'scripts/certify-stage3f6w-risk-state.mjs', 'tests/stage3f6w-risk-state.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  policiesAdded: false, routerTuned: false, largerModelTrained: false, worldStateExpanded: false,
};

/* --------------------------------------------------------- 1. DEV/CAL data */
const corpusManifest = JSON.parse(readText('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json'));
const proposalsManifest = JSON.parse(readText('artifacts/stage3f6a-action-proposals/action-proposals-manifest.json'));
const riskManifest = JSON.parse(readText('artifacts/stage3f6w-risk-state/risk-evidence-manifest.json'));
const corpusText = await readGz('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const proposalsText = await readGz('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz');
const riskText = await readGz('artifacts/stage3f6w-risk-state/risk-evidence.jsonl.gz');
const integrity = {
  corpus: hex(corpusText) === corpusManifest.contentHash,
  proposals: hex(proposalsText) === proposalsManifest.contentHash,
  riskEvidence: hex(riskText) === riskManifest.contentHash,
  riskEvidenceBoundToCorpus: riskManifest.sourceCorpusHash === corpusManifest.contentHash,
  riskEvidenceBoundToContract: riskManifest.riskContractHash === DECISION_RISK_STATE_CONTRACT_HASH,
  riskEvidenceCoreRebuildMismatches: riskManifest.coreRebuildMismatches,
};
const proposals = new Map(lines(proposalsText).map((r) => [r.recordHash, r]));
const riskByHash = new Map(lines(riskText).map((r) => [r.recordHash, r]));
const DEVELOPMENT_PARTITIONS = ['DEV', 'CAL'];
const rows = lines(corpusText).filter((r) => DEVELOPMENT_PARTITIONS.includes(r.partition)).map((r) => {
  const p = proposals.get(r.recordHash); const e = riskByHash.get(r.recordHash);
  if (!p || !e) throw new Error(`missing proposal or risk evidence for ${r.recordHash}`);
  return { partition: r.partition, recordHash: r.recordHash, core: r.core, chosen: p.chosen, correct: p.correct,
    regret: p.regret, risk: e.risk, diagnostic: e.diagnostic };
});
const dev = rows.filter((r) => r.partition === 'DEV');
const cal = rows.filter((r) => r.partition === 'CAL');
const sealedAccess = { holdoutOrOodRowsRead: rows.some((r) => !DEVELOPMENT_PARTITIONS.includes(r.partition)),
  riskEvidencePartitions: [...new Set([...riskByHash.values()].map((r) => r.partition))].sort() };

const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
const RISK_IDS = RISK_STATE_FIELDS.map((f) => f.fieldId);
const GROUPS = {
  OBJECTIVE: ['objective.shortfall', 'objective.criticalEntityCount'],
  SPATIAL: ['spatial.actorX', 'spatial.actorY'],
  TEMPORAL: ['temporal.historyLength', 'temporal.primaryNetChange', 'temporal.primaryRecentChange', 'temporal.primaryMeanAbsChange'],
};

/* ------------------------------------------------------ 2. ANALYSIS PLAN */
const PLAN = deepFreeze({
  gate: 'STAGE_3F_6_W_RISK_STATE',
  data: { partitions: DEVELOPMENT_PARTITIONS, sealedPartitionsUsed: false },
  primaryTarget: 'binary: NEXUS_SELECTOR uniquely best (1) vs RESOURCE_PRESERVING_V1 uniquely best (0); other rows excluded',
  diagnosticModel: { family: 'LOGISTIC_REGRESSION_STANDARDIZED_BIAS_LAST (Stage 3E family)', iterations: 2000, learningRate: 0.1, l2: 1e-3 },
  multinomialDiagnostic: { family: STAGE3F6T_METHODOLOGY.routerFamily, iterations: STAGE3F6T_METHODOLOGY.iterations,
    metric: 'CAL soft-target cross-entropy over available policies', purpose: 'information measurement only; not a router candidate' },
  fieldSelection: {
    where: 'DEV only, 2 folds by recordHash first hex digit parity',
    usableIf: 'status AVAILABLE on every DEV and CAL row (no imputation)',
    acceptIf: 'mean held-fold AUROC(CORE + field) - AUROC(CORE) >= 0.005',
    structuralRejectIf: 'field is identical to a CORE feature, or to the CORE identity threatened - uncovered',
  },
  incrementalTest: { fit: 'DEV', evaluate: 'CAL once', bootstrap: { resamples: 1000, seed: '6003', statistic: 'paired AUROC delta over CAL rows' } },
  materiality: { minAurocDelta: 0.02, requireCiLowerAboveZero: true, minBinaryN: 500 },
  classification: {
    precedence: ['E_INSUFFICIENT_EVIDENCE', 'C_DIFFERENT_REPRESENTATION_GAP_DOMINATES', 'A_RISK_STATE_ADDS_MATERIAL_INFORMATION',
      'B_CURRENT_RISK_SIGNALS_INSUFFICIENT', 'D_NO_INCREMENTAL_INFORMATION_FOUND'],
    E: 'DEV or CAL binary n < 500',
    C: 'a diagnostic group (objective/spatial/temporal) is material and its delta exceeds the risk delta',
    A: 'accepted risk fields non-empty and CORE+ACCEPTED delta material',
    B: 'risk delta CI lower > 0 but below materiality, or accepted fields exist but CI includes zero',
    D: 'no group or risk delta with CI lower > 0',
  },
  enrichedContractRule: 'create SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1_1 only if accepted fields exist AND CAL delta CI lower > 0',
  forensics: {
    router: 'frozen Stage 3F.6-T router (weights from its evaluation freeze), threshold 0, fallback RESOURCE_PRESERVING_V1',
    split: 'CAL (out-of-sample for a DEV-trained router)',
    error: 'selected policy outside the minimum-regret best set',
    conditions: ['UNSUPPORTED_THREAT', 'UNCOVERED_THREAT', 'THREATENED_CRITICAL', 'HIGH_HOSTILE', 'LOW_ENERGY', 'LOW_ACTOR_HEALTH',
      'MULTI_OBJECTIVE', 'BOTTLENECK', 'FEW_ACTIONS', 'LATE_EPISODE', 'NOVEL_STATE'],
    thresholds: 'medians and novelty quantiles computed on DEV / CAL before any error is counted',
  },
  readiness: { READY_FOR_STAGE3G: false, freshConfirmatoryRequiredIf: 'A or C', routerRetrainReadyIf: 'A' },
});
const PLAN_HASH = sha256(PLAN);
await mkdir(outDirectory, { recursive: true });
await writeFile(planPath, `${JSON.stringify({ ...PLAN, planHash: PLAN_HASH }, null, 2)}\n`);

/* ------------------------------------------------------------ helpers */
const valueOf = (row, key) => {
  if (Object.hasOwn(row.core, key)) return row.core[key];
  if (key.startsWith('risk.')) return row.risk[key].status === RiskFieldStatus.AVAILABLE ? row.risk[key].value : null;
  const group = key.split('.')[0];
  const bag = row.diagnostic[group];
  return bag && typeof bag[key] === 'number' ? bag[key] : null;
};
const binaryRows = (subset) => subset.filter((r) => ['NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1'].includes(bestLabel(r)));
const labelOf = (r) => (bestLabel(r) === 'NEXUS_SELECTOR' ? 1 : 0);
const usableEverywhere = (key) => rows.every((r) => { const v = valueOf(r, key); return typeof v === 'number' && Number.isFinite(v); });
const matrix = (subset, keys) => subset.map((r) => keys.map((k) => valueOf(r, k)));
const MODEL_OPTS = { iterations: PLAN.diagnosticModel.iterations };

function binaryAuroc(train, test, keys) {
  const model = fitLogisticRegression(matrix(train, keys), train.map(labelOf), keys, MODEL_OPTS);
  const scores = scoreMatrix(model, matrix(test, keys));
  const labels = test.map(labelOf);
  const logloss = mean(scores.map((p, i) => { const q = Math.min(1 - 1e-12, Math.max(1e-12, p)); return -(labels[i] * Math.log(q) + (1 - labels[i]) * Math.log(1 - q)); }));
  return { auroc: auroc(scores, labels), logloss, scores, labels };
}

function pairedAurocBootstrap(scoresA, scoresB, labels, { resamples, seed }) {
  const n = labels.length;
  const random = createSeededRandom(BigInt(seed));
  const deltas = [];
  for (let r = 0; r < resamples; r += 1) {
    const idx = Array.from({ length: n }, () => Math.floor(random() * n));
    const la = idx.map((i) => labels[i]);
    const a = auroc(idx.map((i) => scoresA[i]), la); const b = auroc(idx.map((i) => scoresB[i]), la);
    if (a !== null && b !== null) deltas.push(b - a);
  }
  deltas.sort((x, y) => x - y);
  return { resamples: deltas.length, ci95: [quantile(deltas, 0.025), quantile(deltas, 0.975)] };
}

function mutualInformationBits(values, labels) {
  const distinct = [...new Set(values)].sort((a, b) => a - b);
  let bins;
  if (distinct.length <= 10) bins = values.map((v) => distinct.indexOf(v));
  else {
    const sorted = [...values].sort((a, b) => a - b);
    const cuts = Array.from({ length: 9 }, (_, i) => quantile(sorted, (i + 1) / 10));
    bins = values.map((v) => cuts.filter((c) => v > c).length);
  }
  const n = values.length; const joint = new Map(); const pb = new Map(); const py = new Map();
  for (let i = 0; i < n; i += 1) {
    const k = `${bins[i]}:${labels[i]}`;
    joint.set(k, (joint.get(k) ?? 0) + 1); pb.set(bins[i], (pb.get(bins[i]) ?? 0) + 1); py.set(labels[i], (py.get(labels[i]) ?? 0) + 1);
  }
  let mi = 0;
  for (const [k, c] of joint) {
    const [b, y] = k.split(':');
    const pxy = c / n; mi += pxy * Math.log2(pxy / ((pb.get(Number(b)) / n) * (py.get(Number(y)) / n)));
  }
  return mi;
}

function separability(subset, key, labelFn) {
  const members = subset.filter((r) => typeof valueOf(r, key) === 'number');
  const values = members.map((r) => valueOf(r, key)); const labels = members.map(labelFn);
  const pos = values.filter((_, i) => labels[i] === 1); const neg = values.filter((_, i) => labels[i] === 0);
  const a = auroc(values, labels);
  const variance = (v) => { const m = mean(v); return mean(v.map((x) => (x - m) ** 2)); };
  const pooled = Math.sqrt(((pos.length * variance(pos)) + (neg.length * variance(neg))) / Math.max(1, pos.length + neg.length));
  return { n: members.length, positives: pos.length, auroc: a, separability: a === null ? null : Math.max(a, 1 - a),
    cohensD: pooled > 0 ? (mean(pos) - mean(neg)) / pooled : 0, mutualInformationBits: mutualInformationBits(values, labels) };
}

/* ------------------------------------------------------ 3. error forensics */
const frozenModel = deepFreeze({ family: STAGE3F6T_METHODOLOGY.routerFamily, policies: ROUTED_POLICIES,
  featureKeys: stage3f6tFreeze.weights.featureKeys, mu: stage3f6tFreeze.weights.mu, sd: stage3f6tFreeze.weights.sd, W: stage3f6tFreeze.weights.W });
const frozenRouterHashMatches = policyRouterHash(frozenModel) === stage3f6tFreeze.routerHash;
const routerChoose = (row) => routeEpisode(frozenModel, row, { threshold: stage3f6tFreeze.threshold, fallbackPolicy: stage3f6tFreeze.bestSinglePolicy }).selectedPolicy;

const devMedian = (key) => quantile(dev.map((r) => valueOf(r, key)).sort((a, b) => a - b), 0.5);
const THRESHOLDS = {
  hostileMedian: devMedian('risk.hostileAliveCount'), energyMedian: devMedian('resources.actorEnergy'),
  healthMedian: devMedian('risk.actorHealth'), actionMedian: devMedian('actionSurface.legalActionCount'),
};
const standardize = (r) => frozenModel.featureKeys.map((k, j) => (r.core[k] - frozenModel.mu[j]) / frozenModel.sd[j]);
const devZ = dev.map(standardize);
const nnDistance = (r) => { const x = standardize(r); let best = Infinity;
  for (const y of devZ) { let d = 0; for (let j = 0; j < x.length; j += 1) { const t = x[j] - y[j]; d += t * t; if (d >= best) break; } if (d < best) best = d; }
  return Math.sqrt(best); };
const calNovelty = cal.map(nnDistance);
THRESHOLDS.noveltyQ90 = quantile([...calNovelty].sort((a, b) => a - b), 0.9);
const noveltyByHash = new Map(cal.map((r, i) => [r.recordHash, calNovelty[i]]));

const CONDITIONS = {
  UNSUPPORTED_THREAT: (r) => r.core['relational.unsupportedThreatenedCount'] > 0,
  UNCOVERED_THREAT: (r) => r.core['relational.uncoveredThreatenedCount'] > 0,
  THREATENED_CRITICAL: (r) => valueOf(r, 'risk.threatenedCriticalCount') > 0,
  HIGH_HOSTILE: (r) => valueOf(r, 'risk.hostileAliveCount') > 0 && valueOf(r, 'risk.hostileAliveCount') >= THRESHOLDS.hostileMedian,
  LOW_ENERGY: (r) => r.core['resources.actorEnergy'] <= THRESHOLDS.energyMedian,
  LOW_ACTOR_HEALTH: (r) => valueOf(r, 'risk.actorHealth') < THRESHOLDS.healthMedian,
  MULTI_OBJECTIVE: (r) => r.core['context.objectiveCount'] >= 2,
  BOTTLENECK: (r) => r.core['relational.bottleneckCount'] > 0,
  FEW_ACTIONS: (r) => r.core['actionSurface.legalActionCount'] <= THRESHOLDS.actionMedian,
  LATE_EPISODE: (r) => r.core['context.tickProgress'] >= 0.5,
  NOVEL_STATE: (r) => noveltyByHash.get(r.recordHash) > THRESHOLDS.noveltyQ90,
};
const isError = (r) => !bestPolicySet(r).best.includes(routerChoose(r));
const calErrors = cal.filter(isError);
const rate = (subset, fn) => (subset.length ? subset.filter(fn).length / subset.length : null);
const forensics = Object.fromEntries(Object.entries(CONDITIONS).map(([name, fn]) => {
  const inside = cal.filter(fn); const outside = cal.filter((r) => !fn(r));
  const eIn = rate(inside, isError); const eOut = rate(outside, isError);
  return [name, { nIn: inside.length, nOut: outside.length, errorRateIn: eIn, errorRateOut: eOut,
    errorRatio: eIn !== null && eOut ? eIn / eOut : null,
    nexusBestIn: rate(inside, (r) => bestLabel(r) === 'NEXUS_SELECTOR'), nexusBestOut: rate(outside, (r) => bestLabel(r) === 'NEXUS_SELECTOR'),
    resourceBestIn: rate(inside, (r) => bestLabel(r) === 'RESOURCE_PRESERVING_V1'), resourceBestOut: rate(outside, (r) => bestLabel(r) === 'RESOURCE_PRESERVING_V1'),
    supported: inside.length >= 200 && outside.length >= 200 }];
}));
const errorAnatomy = {
  routerErrorN: calErrors.length, calN: cal.length, errorRate: calErrors.length / cal.length,
  missedNexus: calErrors.filter((r) => bestLabel(r) === 'NEXUS_SELECTOR').length,
  wronglyLeftResource: calErrors.filter((r) => bestLabel(r) === 'RESOURCE_PRESERVING_V1').length,
  otherErrors: calErrors.filter((r) => !['NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1'].includes(bestLabel(r))).length,
};

/* ------------------------------------------------ 4. per-field separability */
const devBinary = binaryRows(dev); const calBinary = binaryRows(cal);
const CANDIDATE_KEYS = [...RISK_IDS, ...GROUPS.OBJECTIVE, ...GROUPS.SPATIAL, ...GROUPS.TEMPORAL];
const fieldSeparability = Object.fromEntries(CANDIDATE_KEYS.map((key) => [key, {
  nexusVsResource: separability(devBinary, key, labelOf),
  objectiveBestVsRest: separability(dev, key, (r) => (bestLabel(r) === 'OBJECTIVE_TARGETING_V1' ? 1 : 0)),
  threatBestVsRest: separability(dev, key, (r) => (bestLabel(r) === 'THREAT_COVERING_V1' ? 1 : 0)),
}]));

/* ------------------------------------------------ 5. field selection (DEV) */
const foldOf = (r) => (Number.parseInt(r.recordHash[0], 16) % 2);
const folds = [0, 1].map((k) => ({ train: devBinary.filter((r) => foldOf(r) !== k), test: devBinary.filter((r) => foldOf(r) === k) }));
const foldBase = folds.map((f) => binaryAuroc(f.train, f.test, CORE_KEYS).auroc);
const structuralRejection = (key) => {
  const vals = rows.map((r) => valueOf(r, key));
  for (const coreKey of CORE_KEYS) if (rows.every((r, i) => r.core[coreKey] === vals[i])) return `identical to CORE feature ${coreKey}`;
  if (rows.every((r, i) => vals[i] === r.core['relational.threatenedEntityCount'] - r.core['relational.uncoveredThreatenedCount'])) {
    return 'identical to the CORE identity relational.threatenedEntityCount - relational.uncoveredThreatenedCount';
  }
  return null;
};
const selection = RISK_IDS.map((key) => {
  const def = RISK_STATE_FIELDS.find((f) => f.fieldId === key);
  if (!usableEverywhere(key)) {
    const statuses = [...new Set(rows.map((r) => r.risk[key].status))].sort();
    return { fieldId: key, candidateName: def.candidateName, accepted: false, reason: 'NOT_USABLE_WITHOUT_IMPUTATION', statuses };
  }
  const structural = structuralRejection(key);
  if (structural) return { fieldId: key, candidateName: def.candidateName, accepted: false, reason: 'STRUCTURALLY_REDUNDANT', detail: structural };
  const deltas = folds.map((f, i) => binaryAuroc(f.train, f.test, [...CORE_KEYS, key]).auroc - foldBase[i]);
  const meanDelta = mean(deltas);
  return { fieldId: key, candidateName: def.candidateName, accepted: meanDelta >= 0.005, reason: meanDelta >= 0.005 ? 'INCREMENTAL_INFORMATION_ON_DEV' : 'NO_MEASURABLE_INCREMENT_ON_DEV',
    foldDeltas: deltas, meanDelta };
});
const ACCEPTED = selection.filter((s) => s.accepted).map((s) => s.fieldId);
const USABLE_RISK = selection.filter((s) => s.reason !== 'NOT_USABLE_WITHOUT_IMPUTATION' && s.reason !== 'STRUCTURALLY_REDUNDANT').map((s) => s.fieldId);

/* ------------------------------------------- 6. incremental information (CAL) */
function incremental(label, keys) {
  const usable = keys.filter(usableEverywhere);
  if (usable.length === 0) return { label, keys, usableKeys: [], evaluated: false, reason: 'no usable field without imputation' };
  const base = binaryAuroc(devBinary, calBinary, CORE_KEYS);
  const enriched = binaryAuroc(devBinary, calBinary, [...CORE_KEYS, ...usable]);
  const boot = pairedAurocBootstrap(base.scores, enriched.scores, base.labels, PLAN.incrementalTest.bootstrap);
  const delta = enriched.auroc - base.auroc;
  return { label, keys, usableKeys: usable, evaluated: true, coreAuroc: base.auroc, enrichedAuroc: enriched.auroc, delta,
    ci95: boot.ci95, coreLogloss: base.logloss, enrichedLogloss: enriched.logloss,
    significant: boot.ci95[0] > 0, material: delta >= PLAN.materiality.minAurocDelta && boot.ci95[0] > 0 };
}
const riskAccepted = ACCEPTED.length ? incremental('CORE_PLUS_ACCEPTED_RISK', ACCEPTED) : { label: 'CORE_PLUS_ACCEPTED_RISK', evaluated: false, reason: 'no field accepted on DEV', delta: 0, significant: false, material: false };
const riskAllUsable = incremental('CORE_PLUS_ALL_USABLE_RISK', USABLE_RISK);
const groupTests = Object.fromEntries(Object.entries(GROUPS).map(([g, keys]) => [g, incremental(`CORE_PLUS_${g}`, keys)]));

function softLoss(model, subset, keys) {
  return mean(subset.filter((r) => availablePolicies(r).length > 0).map((r) => {
    const merged = { ...r, core: Object.fromEntries(keys.map((k) => [k, valueOf(r, k)])) };
    const { probabilities } = scorePolicies(model, merged);
    const { best } = bestPolicySet(r);
    return -best.reduce((s, p) => s + (1 / best.length) * Math.log(Math.max(1e-12, probabilities[p])), 0);
  }));
}
const withKeys = (subset, keys) => subset.map((r) => ({ ...r, core: Object.fromEntries(keys.map((k) => [k, valueOf(r, k)])) }));
const multiCoreKeys = CORE_KEYS; const multiRiskKeys = [...CORE_KEYS, ...(ACCEPTED.length ? ACCEPTED : USABLE_RISK)];
const multiCore = fitPolicyRouter(withKeys(dev, multiCoreKeys), multiCoreKeys);
const multiRisk = fitPolicyRouter(withKeys(dev, multiRiskKeys), multiRiskKeys);
const multinomial = { riskKeysUsed: ACCEPTED.length ? 'ACCEPTED' : 'ALL_USABLE', coreCalLoss: softLoss(multiCore, cal, multiCoreKeys),
  enrichedCalLoss: softLoss(multiRisk, cal, multiRiskKeys), promoted: false, isRouterCandidate: false };
multinomial.delta = multinomial.enrichedCalLoss - multinomial.coreCalLoss;

/* replay determinism of the incremental test */
const replay = binaryAuroc(devBinary, calBinary, CORE_KEYS).auroc;

/* ----------------------------------------------------- 7. classification */
const riskSignal = riskAccepted.evaluated ? riskAccepted : riskAllUsable;
const dominantGroup = Object.values(groupTests).filter((t) => t.evaluated && t.material && t.delta > (riskSignal.delta ?? 0))
  .sort((a, b) => b.delta - a.delta)[0] ?? null;
const applicable = [];
if (devBinary.length < PLAN.materiality.minBinaryN || calBinary.length < PLAN.materiality.minBinaryN) applicable.push('E_INSUFFICIENT_EVIDENCE');
if (dominantGroup) applicable.push('C_DIFFERENT_REPRESENTATION_GAP_DOMINATES');
if (riskAccepted.material) applicable.push('A_RISK_STATE_ADDS_MATERIAL_INFORMATION');
if (!riskAccepted.material && (riskSignal.significant || ACCEPTED.length > 0)) applicable.push('B_CURRENT_RISK_SIGNALS_INSUFFICIENT');
const anySignificant = riskSignal.significant || Object.values(groupTests).some((t) => t.significant);
if (!anySignificant) applicable.push('D_NO_INCREMENTAL_INFORMATION_FOUND');
const ordered = PLAN.classification.precedence.filter((c) => applicable.includes(c));
const primaryResult = ordered[0] ?? 'D_NO_INCREMENTAL_INFORMATION_FOUND';
const secondaryResult = ordered[1] ?? null;

const enrichedJustified = ACCEPTED.length > 0 && riskAccepted.evaluated && riskAccepted.significant;
const ENRICHED_CONTRACT = enrichedJustified ? deepFreeze({
  contractId: 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1_1',
  extends: { id: DEPLOYABLE_FEATURE_CONTRACT_ID, hash: DEPLOYABLE_FEATURE_CONTRACT_HASH, modified: false },
  riskStateContract: { id: DECISION_RISK_STATE_CONTRACT_ID, hash: DECISION_RISK_STATE_CONTRACT_HASH },
  delta: { added: ACCEPTED, removed: [], coreFeaturesUnchanged: CORE_KEYS.length },
  featureIds: [...CORE_KEYS, ...ACCEPTED], featureCount: CORE_KEYS.length + ACCEPTED.length,
  status: 'CANDIDATE_REQUIRES_FRESH_CONFIRMATION',
}) : null;

const spatial = groupTests.SPATIAL; const temporal = groupTests.TEMPORAL; const objective = groupTests.OBJECTIVE;
const temporalCoverage = rows.filter((r) => r.diagnostic.temporal !== null).length / rows.length;
const representation = {
  RISK_STATE_GAP: riskAccepted.material ? 'MATERIAL_INFORMATION_ADDED' : riskSignal.significant ? 'INFORMATION_PRESENT_BUT_NOT_MATERIAL' : 'NOT_SUPPORTED',
  SPATIAL_STATE_GAP: {
    DO_POLICY_ERRORS_DEPEND_ON_SPATIAL_CONFIGURATION: spatial.evaluated ? (spatial.significant ? 'ACTOR_POSITION_ADDS_INFORMATION' : 'NO_EVIDENCE_FROM_ACTOR_POSITION') : 'SPATIAL_STATE_EVIDENCE_UNAVAILABLE',
    entityLayout: 'SPATIAL_STATE_EVIDENCE_UNAVAILABLE — the governed observation exposes only actor position, not entity positions',
    subsystemAdded: false,
  },
  TEMPORAL_INFORMATION_LIKELY_REQUIRED: temporalCoverage < 0.9 || !temporal.evaluated ? 'UNKNOWN' : temporal.material ? true : false,
  temporalHistoryCoverage: temporalCoverage,
  OBJECTIVE_STRUCTURE_GAP: {
    independentInformation: objective.evaluated && objective.material ? 'MATERIAL' : objective.significant ? 'PRESENT_NOT_MATERIAL' : 'NOT_SUPPORTED',
    errorConcentrationMultiObjective: forensics.MULTI_OBJECTIVE.errorRatio,
  },
};

/* ----------------------------------------------------- 8. leakage + degradation */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const riskSource = stripComments(readText('src/stage3f/decision-risk-state-v1.js'));
const LEAK_PATTERNS = {
  FUTURE_OUTCOME: [/\.step\(/, /\bnextState\b/, /\.resultingStateHash\b/, /\.transition\(/, /\.terminal\b/, /evaluateCounterfactuals/, /rollout\(/],
  LABEL: [/\.optimalSet\b/, /\.optimalActionKey\b/, /\.correct\b/, /buildTarget/, /bestLabel/, /bestPolicySet/],
  REGRET: [/\.regret\b/, /\.scalarReward\b/, /\.totalRewardVector\b/, /\.optimalScalar\b/],
  SEALED_SPLIT: [/\.partition\b/, /HOLDOUT/, /\bOOD\b/, /\.recordHash\b/],
  HIDDEN_WORLD_STATE: [/state\.world/, /\bworld\./, /constraints/, /observationHistory/, /from '..\/forge\//, /from '..\/lab\//],
};
/* Audit correction (disclosed): the first run used /state_t\+1/, which matched the contract's own
 * prohibitedSources documentation string rather than any access path. It was replaced by patterns that
 * detect actual transition access. The contract itself was not changed. */
const STATIC_AUDIT_CORRECTION = { removedPattern: '/state_t\\+1/', reason: 'matched documentation string in prohibitedSources, not code access',
  addedPatterns: ['/\\bnextState\\b/', '/\\.resultingStateHash\\b/', '/\\.transition\\(/'], contractModified: false };
const staticLeakage = Object.fromEntries(Object.entries(LEAK_PATTERNS).map(([k, pats]) => [k, pats.filter((p) => p.test(riskSource)).map(String)]));

const devSample = dev.slice(0, 24);
const corpusCombination = new Map(lines(corpusText).map((r) => [r.recordHash, r.combination]));
const rebuildFast = (hash) => {
  const c = corpusCombination.get(hash);
  const b = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  const state = forgeAdapterState(b.world);
  const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const legalActions = forgeLegalActions(state.world).map((a) => ({ actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null }));
  return { state, descriptors, legalActions, observation: forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID) };
};
let futureInvariant = true; let hiddenStateBypass = false; let degradedVisible = 0; let degradedEligible = 0; let absentUnknown = true;
for (const row of devSample) {
  const d = rebuildFast(row.recordHash);
  const before = JSON.stringify(extractDecisionRiskState({ observation: d.observation, legalActions: d.legalActions }));
  for (const desc of d.descriptors) forgeWorldAdapter.step(forgeWorldAdapter.cloneState(d.state), desc, { observerId: FORGE_OBSERVER_ID });
  if (JSON.stringify(extractDecisionRiskState({ observation: d.observation, legalActions: d.legalActions })) !== before) futureInvariant = false;
  /* Hidden-state bypass: change the authoritative world AFTER observing; the risk state read from the
   * observation must not move. */
  const mutated = forgeWorldAdapter.cloneState(d.state);
  for (const e of mutated.world.entities) if (e.type === 'HOSTILE') e.health = 0;
  mutated.world.relations = [];
  if (JSON.stringify(extractDecisionRiskState({ observation: d.observation, legalActions: d.legalActions })) !== before) hiddenStateBypass = true;
  const base = extractDecisionRiskState({ observation: d.observation, legalActions: d.legalActions }).fields;
  if ((base['risk.threatRelationCount'].value ?? 0) > 0) {
    degradedEligible += 1;
    const after = extractDecisionRiskState({ observation: degradeObservation(d.observation, ObservationDegradation.REMOVE_THREAT_INFORMATION), legalActions: d.legalActions }).fields;
    const changed = ['risk.threatRelationCount', 'risk.maxThreatPressure', 'risk.threatenedCriticalCount']
      .some((k) => after[k].status !== RiskFieldStatus.AVAILABLE || after[k].value !== base[k].value);
    if (changed) degradedVisible += 1;
  }
  const stripped = structuredClone(d.observation); delete stripped.metadata.canonicalState.relationships;
  const absent = extractDecisionRiskState({ observation: stripped, legalActions: d.legalActions }).fields;
  if (absent['risk.threatRelationCount'].status !== RiskFieldStatus.UNKNOWN || absent['risk.threatRelationCount'].value !== null) absentUnknown = false;
}
const dynamic = { sampled: devSample.length, futureOutcomeInvariant: futureInvariant, hiddenWorldStateBypass: hiddenStateBypass,
  degradationEligible: degradedEligible, degradationVisible: degradedVisible,
  observationDegradationVisible: degradedEligible > 0 && degradedVisible === degradedEligible, absentRelationshipsYieldUnknown: absentUnknown };

/* -------------------------------------------------------------- tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6w-risk-state.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* --------------------------------------------------------- assessment */
const noLeak = (k) => staticLeakage[k].length === 0;
const checks = {
  STAGE3F6A_INTACT: scope.stage3f6aHashMatchesAccepted,
  STAGE3F6T_INTACT: scope.stage3f6tHashMatchesAccepted && scope.stage3f6tRouterSourceUnchanged && frozenRouterHashMatches,
  PRIOR_OWNERS_UNCHANGED: scope.priorOwnersUnchanged,
  CORE_CONTRACT_UNCHANGED: scope.coreContractSourceUnchanged && scope.coreContractHashUnchanged,
  DATA_INTEGRITY: integrity.corpus && integrity.proposals && integrity.riskEvidence && integrity.riskEvidenceBoundToCorpus
    && integrity.riskEvidenceBoundToContract && integrity.riskEvidenceCoreRebuildMismatches === 0,
  NO_SEALED_SPLIT_ACCESS: !sealedAccess.holdoutOrOodRowsRead && sealedAccess.riskEvidencePartitions.join(',') === 'CAL,DEV',
  RISK_CONTRACT_DETERMINISTIC: sha256(DECISION_RISK_STATE_CONTRACT) === DECISION_RISK_STATE_CONTRACT_HASH,
  NO_FUTURE_OUTCOME_ACCESS: noLeak('FUTURE_OUTCOME'),
  NO_LABEL_ACCESS: noLeak('LABEL'),
  NO_REGRET_ACCESS: noLeak('REGRET'),
  NO_SEALED_METADATA_ACCESS: noLeak('SEALED_SPLIT'),
  NO_HIDDEN_WORLD_STATE_ACCESS: noLeak('HIDDEN_WORLD_STATE') && !dynamic.hiddenWorldStateBypass,
  FUTURE_OUTCOME_INVARIANT: dynamic.futureOutcomeInvariant,
  OBSERVATION_DEGRADATION_VISIBLE: dynamic.observationDegradationVisible,
  MISSING_IS_NOT_ZERO: dynamic.absentRelationshipsYieldUnknown,
  PLAN_WRITTEN_BEFORE_METRICS: typeof PLAN_HASH === 'string',
  INCREMENTAL_TEST_DETERMINISTIC: replay === (riskAccepted.coreAuroc ?? riskAllUsable.coreAuroc),
  REJECTED_FIELDS_RECORDED: selection.every((s) => s.accepted || typeof s.reason === 'string'),
  FORENSICS_ON_FROZEN_ROUTER: frozenRouterHashMatches,
  NO_ROUTER_PROMOTION: multinomial.promoted === false,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const freshRequired = primaryResult === 'A_RISK_STATE_ADDS_MATERIAL_INFORMATION' || primaryResult === 'C_DIFFERENT_REPRESENTATION_GAP_DOMINATES'
  || secondaryResult === 'A_RISK_STATE_ADDS_MATERIAL_INFORMATION';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_6_W_RISK_STATE', status,
  planHash: PLAN_HASH,
  baselineEvidence: { stage3f6tHoldout: { alwaysResourceAccuracy: 0.6142, routedAccuracy: 0.6153, oracleAccuracy: 0.7063,
    oracleGainCapturedAccuracy: stage3f6t.splits.HOLDOUT.oracleGainCaptured.accuracy, oracleGainCapturedRegret: stage3f6t.splits.HOLDOUT.oracleGainCaptured.regret } },
  data: { DEV_N: dev.length, CAL_N: cal.length, devBinaryN: devBinary.length, calBinaryN: calBinary.length, integrity, sealedAccess },
  forensics: { split: 'CAL', thresholds: THRESHOLDS, anatomy: errorAnatomy, conditions: forensics },
  riskStateContract: { id: DECISION_RISK_STATE_CONTRACT_ID, hash: DECISION_RISK_STATE_CONTRACT_HASH, contract: DECISION_RISK_STATE_CONTRACT },
  fieldSeparability,
  fieldSelection: selection, acceptedFields: ACCEPTED, rejectedFields: selection.filter((s) => !s.accepted),
  informationGain: { riskAccepted, riskAllUsable, groups: groupTests, multinomial },
  representation,
  enrichedContract: ENRICHED_CONTRACT ? { ...ENRICHED_CONTRACT, hash: sha256(ENRICHED_CONTRACT) } : null,
  leakage: { static: staticLeakage, dynamic, auditCorrection: STATIC_AUDIT_CORRECTION },
  classification: { applicable: ordered, primaryResult, secondaryResult },
  scope, checks, tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((f) => [f, hex(readFileSync(path.join(root, f)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false },
  learning: { diagnosticModelsOnly: true, routerCandidatePromoted: false, largerModelTrained: false, onlineLearningEnabled: false },
  roadmap: {
    FRESH_CONFIRMATORY_SPLITS_REQUIRED: freshRequired,
    READY_FOR_ROUTER_RETRAIN: primaryResult === 'A_RISK_STATE_ADDS_MATERIAL_INFORMATION',
    READY_FOR_STAGE3G: false,
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6W_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash,
    recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, planHash: PLAN_HASH,
    failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), classification: payload.classification,
    accepted: ACCEPTED, informationGain: { riskAccepted: { ...riskAccepted, scores: undefined }, riskAllUsable, groups: groupTests, multinomial },
    representation, roadmap: payload.roadmap }, (k, v) => (k === 'scores' || k === 'labels' ? undefined : v), 2));
  if (status !== 'PASS') process.exitCode = 1;
}
