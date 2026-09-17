#!/usr/bin/env node
/* STAGE_3F_6_T — deployable policy router retraining.
 *
 * Headline question: does a deployable router over the FROZEN Stage 3F.6-A policy set beat simply
 * always using the best single deployable policy (RESOURCE_PRESERVING_V1)? Beating greedy is not
 * the bar — Stage 3F.6-A already showed a single policy does that.
 *
 * DEV fits, CAL calibrates the confidence threshold. HOLDOUT/OOD are FRESH partitions on a disjoint
 * seed space (the Stage 3F.6-C sealed rows were exposed by Stage 3F.6-A), and are structurally
 * unreachable until the evaluation freeze is written.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NON_DEPLOYABLE_REFERENCE, POLICY_SET, POLICY_SET_HASH, ROUTED_POLICIES, CONTROL_POLICY, STAGE3F6T_METHODOLOGY,
  availablePolicies, bestLabel, bestPolicySet, evaluateStrategy, falseSelectionHarm, fitPolicyRouter,
  opportunityDistribution, oracleGainCaptured, pairedBootstrap, policyRouterHash, quantile, routeEpisode,
  scorePolicies, selectionConfusion, selectionEce,
} from '../src/stage3f/policy-router-v1.js';
import {
  DEPLOYABLE_FEATURES, DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { auroc } from '../src/stage3f/deployable-router-v1.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6t-policy-router');
const resultPath = path.join(outDirectory, 'stage3f6t-certification-result.json');
const freezePath = path.join(outDirectory, 'stage3f6t-evaluation-freeze.json');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const hex = (value) => createHash('sha256').update(value).digest('hex');
const readText = (relative) => readFileSync(path.join(root, relative), 'utf8');
const readGzText = async (relative) => gunzipSync(await readFile(path.join(root, relative))).toString('utf8');
const parseLines = (text) => text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/* ------------------------------------------------------------- 0. scope */
const prefix = (relative) => `platform/game-agnostic/${relative}`;
const gitClean = (...paths) => {
  const result = spawnSync('git', ['-C', repositoryRoot, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'GIT_UNAVAILABLE';
};
const unchanged = (...paths) => gitClean(...paths) === '';

const stage3f6a = JSON.parse(readText('artifacts/stage3f6a-action-proposals/stage3f6a-certification-result.json'));
const stage3f6c = JSON.parse(readText('artifacts/stage3f6c-deployable-router/stage3f6c-certification-result.json'));
const stage3f6s = JSON.parse(readText('artifacts/stage3f6s-deployable-feature-contract/stage3f6s-certification-result.json'));

const PROPOSAL_SOURCE = 'src/stage3f/deployable-action-proposal-v1.js';
const scope = {
  frozenStage3EUnchanged: unchanged(...['artifacts/stage3e-routability-intelligence', 'training/stage3e-recovered'].map(prefix)),
  priorOwnersUnchanged: unchanged(...[
    'src/stage3f/world-state-v1.js', 'src/stage3f/deployable-feature-contract-v1.js', 'src/stage3f/deployable-feature-extractor-v1.js',
    'src/stage3f/deployable-router-v1.js', PROPOSAL_SOURCE, 'src/lab/stage3c-learned-nexus.js', 'src/experts/nexus.js',
    'scripts/generate-stage3f6a-proposals.mjs', 'scripts/certify-stage3f6a-action-proposals.mjs',
    'artifacts/stage3f6s-deployable-feature-contract', 'artifacts/stage3f6c-deployable-router', 'artifacts/stage3f6a-action-proposals',
  ].map(prefix)),
  stage3f6aHashMatchesAccepted: stage3f6a.certificationHash === '2753335e7d97e77758dd90f71d9eb22274cba23cd187485c2338cd857eedb6ca',
  stage3f6cHashMatchesAccepted: stage3f6c.certificationHash === '40ae3b415eeca2c1774a5f4ce2e2904bb189d4d83f98f26c1614eccce5dd0051',
  /* Policy definitions unchanged: the proposal source is byte-identical to what Stage 3F.6-A certified. */
  policyDefinitionsUnchanged: hex(readFileSync(path.join(root, PROPOSAL_SOURCE))) === stage3f6a.sourceHashes[PROPOSAL_SOURCE],
  featureContractHashMatchesStage3F6S: stage3f6s.contract.hash === DEPLOYABLE_FEATURE_CONTRACT_HASH,
  newOwners: ['src/stage3f/policy-router-v1.js', 'scripts/generate-stage3f6t-confirmatory.mjs',
    'scripts/certify-stage3f6t-policy-router.mjs', 'tests/stage3f6t-policy-router.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'],
  policiesAdded: false, policiesModified: false, worldStateExpanded: false,
};

/* ------------------------------------------------------ 1. DEV / CAL */
const corpusManifest = JSON.parse(readText('artifacts/stage3f6c-deployable-router/confirmatory-corpus-manifest.json'));
const proposalsManifest = JSON.parse(readText('artifacts/stage3f6a-action-proposals/action-proposals-manifest.json'));
const corpusText = await readGzText('artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz');
const proposalsText = await readGzText('artifacts/stage3f6a-action-proposals/action-proposals.jsonl.gz');
const trainingIntegrity = {
  corpusHashMatches: hex(corpusText) === corpusManifest.contentHash,
  proposalsHashMatches: hex(proposalsText) === proposalsManifest.contentHash,
  proposalsBoundToCorpus: proposalsManifest.sourceCorpusHash === corpusManifest.contentHash,
};
const corpus = parseLines(corpusText);
const proposals = new Map(parseLines(proposalsText).map((row) => [row.recordHash, row]));
const joinTraining = (partition) => corpus.filter((row) => row.partition === partition).map((row) => {
  const p = proposals.get(row.recordHash);
  if (!p) throw new Error(`no Stage 3F.6-A proposal for ${row.recordHash}`);
  return { partition, recordHash: row.recordHash, topologyHash: row.topologyHash, worldHash: row.worldHash,
    combination: row.combination, core: row.core, chosen: p.chosen, correct: p.correct, regret: p.regret };
});
/* Only DEV and CAL are ever joined; the exposed Stage 3F.6-C HOLDOUT/OOD are not used at all. */
const dev = joinTraining('DEV');
const cal = joinTraining('CAL');

const CORE_KEYS = [...DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds].sort();
const coreFeatureAudit = {
  featureCount: CORE_KEYS.length,
  noSimulatorFeature: CORE_KEYS.every((id) => !DEPLOYABLE_FEATURES.find((f) => f.featureId === id).requiredCapabilities.includes('SIMULATOR_ONE_STEP')),
  noV2BFeature: CORE_KEYS.every((id) => !DEPLOYABLE_FEATURES.find((f) => f.featureId === id).requiredCapabilities.includes('EXPERT_V2B')),
  noRolloutFeature: CORE_KEYS.every((id) => DEPLOYABLE_FEATURES.find((f) => f.featureId === id).multiStepRollout === false),
};

/* ------------------------------------------ 2. fresh sealed identities */
const confirmatoryManifest = JSON.parse(readText('artifacts/stage3f6t-policy-router/confirmatory-holdout-ood-manifest.json'));
const confirmatoryText = await readGzText('artifacts/stage3f6t-policy-router/confirmatory-holdout-ood.jsonl.gz');
const confirmatoryHashMatches = hex(confirmatoryText) === confirmatoryManifest.contentHash;
let evaluationFreeze = null;
const sealedAccessLog = [];
const confirmatoryRows = parseLines(confirmatoryText);
/* Before the freeze only identities are visible — enough to prove disjointness, never labels or features. */
const sealedIdentities = () => confirmatoryRows.map((row) => ({ partition: row.partition, recordHash: row.recordHash,
  topologyHash: row.topologyHash, worldHash: row.worldHash }));
function sealedRows(partition) {
  if (evaluationFreeze === null) throw new Error(`SEALED_PARTITION_ACCESS_BEFORE_FREEZE: ${partition}`);
  sealedAccessLog.push({ partition, afterFreeze: true });
  return confirmatoryRows.filter((row) => row.partition === partition);
}

const ids = sealedIdentities();
const trainingIds = [...dev, ...cal];
const setOf = (rows, key) => new Set(rows.map((row) => row[key]));
const overlapCount = (rows, reference, key) => rows.filter((row) => reference.has(row[key])).length;
const dataset = {
  DEV_N: dev.length, CAL_N: cal.length,
  HOLDOUT_N: ids.filter((r) => r.partition === 'HOLDOUT').length,
  OOD_N: ids.filter((r) => r.partition === 'OOD').length,
  RECORD_OVERLAP: overlapCount(ids, setOf(trainingIds, 'recordHash'), 'recordHash')
    + (dev.length + cal.length - setOf(trainingIds, 'recordHash').size),
  STATE_OVERLAP: overlapCount(ids, setOf(trainingIds, 'worldHash'), 'worldHash')
    + (dev.length + cal.length - setOf(trainingIds, 'worldHash').size),
  TOPOLOGY_OVERLAP: overlapCount(ids, setOf(trainingIds, 'topologyHash'), 'topologyHash')
    + overlapCount(dev, setOf(cal, 'topologyHash'), 'topologyHash')
    + confirmatoryManifest.internalOverlap.HOLDOUT_OOD_topology,
  overlapWithAllPriorStage3F6CRows: confirmatoryManifest.overlapWithPriorCorpus,
  confirmatoryInternalOverlap: confirmatoryManifest.internalOverlap,
  confirmatorySeedSpace: confirmatoryManifest.spec,
  trainingIntegrity,
  confirmatoryHashMatches,
  hashes: {
    DEV: corpusManifest.partitionHashes.DEV, CAL: corpusManifest.partitionHashes.CAL,
    HOLDOUT: confirmatoryManifest.partitionHashes.HOLDOUT, OOD: confirmatoryManifest.partitionHashes.OOD,
    trainingCorpus: corpusManifest.contentHash, trainingProposals: proposalsManifest.contentHash,
    confirmatory: confirmatoryManifest.contentHash,
  },
  exposureDecision: 'Stage 3F.6-C HOLDOUT/OOD were exposed by Stage 3F.6-A sealed evaluation, so fresh confirmatory '
    + 'HOLDOUT/OOD were generated on seeds 601-603 / 611, disjoint from every prior seed space and excluding every '
    + 'prior topology, record and world state.',
};

/* ------------------------------------------------------ 3. fit (DEV) */
const model = fitPolicyRouter(dev, CORE_KEYS);
const routerHash = policyRouterHash(model);
const replayHash = policyRouterHash(fitPolicyRouter(dev, CORE_KEYS));

/* Best single always-available deployable policy on DEV/CAL — the headline comparator and the
 * fallback when the router declines. Chosen here, before any sealed row is visible. */
const devCal = [...dev, ...cal];
const alwaysCandidates = ROUTED_POLICIES.map((policy) => ({ policy, ...evaluateStrategy(devCal, () => policy) }))
  .filter((entry) => entry.coverage === 1)
  .sort((a, b) => a.meanRegret - b.meanRegret || ROUTED_POLICIES.indexOf(a.policy) - ROUTED_POLICIES.indexOf(b.policy));
if (alwaysCandidates.length === 0) throw new Error('no always-available deployable policy on DEV/CAL');
const BEST_SINGLE_POLICY = alwaysCandidates[0].policy;

/* ------------------------------------------- 4. calibrate threshold (CAL) */
const calGrid = STAGE3F6T_METHODOLOGY.confidenceGrid.map((threshold) => {
  const choose = (row) => routeEpisode(model, row, { threshold, fallbackPolicy: BEST_SINGLE_POLICY }).selectedPolicy;
  const evaluated = evaluateStrategy(cal, choose);
  const routedShare = cal.filter((row) => routeEpisode(model, row, { threshold, fallbackPolicy: BEST_SINGLE_POLICY }).routed).length / cal.length;
  return { threshold, routedShare, accuracy: evaluated.accuracy, meanRegret: evaluated.meanRegret,
    selectionAccuracy: evaluated.selectionAccuracy };
});
const chosenThreshold = [...calGrid].sort((a, b) => (a.meanRegret - b.meanRegret)
  || (b.accuracy - a.accuracy) || (a.threshold - b.threshold))[0].threshold;
const routerChoose = (row) => routeEpisode(model, row, { threshold: chosenThreshold, fallbackPolicy: BEST_SINGLE_POLICY }).selectedPolicy;
const fullCoverageChoose = (row) => routeEpisode(model, row, { threshold: 0, fallbackPolicy: BEST_SINGLE_POLICY }).selectedPolicy;

/* ------------------------------------------- 5. frozen regime definitions */
const devEnergy = dev.map((row) => row.core['resources.actorEnergy']).sort((a, b) => a - b);
const ENERGY_MEDIAN = quantile(devEnergy, 0.5);
const standardized = (row) => CORE_KEYS.map((key, j) => (row.core[key] - model.mu[j]) / model.sd[j]);
const devStandardized = dev.map(standardized);
function noveltyDistance(row) {
  const x = standardized(row);
  let best = Infinity;
  for (const y of devStandardized) {
    let dist = 0;
    for (let j = 0; j < x.length; j += 1) { const delta = x[j] - y[j]; dist += delta * delta; if (dist >= best) break; }
    if (dist < best) best = dist;
  }
  return Math.sqrt(best);
}
const calNovelty = cal.map(noveltyDistance).sort((a, b) => a - b);
const NOVELTY_Q50 = quantile(calNovelty, 0.5);
const NOVELTY_Q90 = quantile(calNovelty, 0.9);

const REGIMES = {
  RESOURCE_PRESSURE: (row) => (row.core['resources.actorEnergy'] <= ENERGY_MEDIAN ? 'LOW_ENERGY' : 'HIGH_ENERGY'),
  OBJECTIVE_PRESSURE: (row) => (row.core['context.objectiveCount'] >= 2 ? 'MULTI_OBJECTIVE' : 'SINGLE_OBJECTIVE'),
  THREAT_PRESSURE: (row) => (row.core['relational.unsupportedThreatenedCount'] > 0 ? 'UNSUPPORTED_THREAT' : 'NO_UNSUPPORTED_THREAT'),
  DEPENDENCY_STRUCTURE: (row) => (row.core['relational.criticalDependencyCount'] > 0 ? 'CRITICAL_DEPENDENCY' : 'NO_CRITICAL_DEPENDENCY'),
  STATE_NOVELTY: (row) => { const d = noveltyDistance(row); return d <= NOVELTY_Q50 ? 'FAMILIAR' : d <= NOVELTY_Q90 ? 'MODERATE' : 'NOVEL'; },
  ENVIRONMENT_SHAPE: (row) => `shape:${row.combination.shape}`,
  ENVIRONMENT_OBJECTIVES: (row) => `objectives:${row.combination.objectives}`,
};
const GAP_REGIMES = {
  RISK_STATE_GAP: (row) => row.core['relational.unsupportedThreatenedCount'] > 0,
  OBJECTIVE_STRUCTURE_GAP: (row) => row.core['context.objectiveCount'] >= 2,
  TEMPORAL_STATE_GAP: (row) => row.core['context.tickProgress'] >= 0.5,
};

/* --------------------------------------- 6. predeclared decision rules */
const MATERIALITY = { minAccuracyGain: 0.02, minRegretReduction: 2.0, minEvidenceN: 2000, minRegimeN: 200 };
const RESULT_RULES = {
  A_ROUTING_MATERIALLY_BEATS_BEST_SINGLE_POLICY: 'accuracy gain >= 0.02 with CI lower > 0, OR regret reduction >= 2.0 with CI upper < 0',
  E_MIXED_ACCURACY_REGRET_TRADEOFF: 'one metric significantly better and the other significantly worse',
  D_ROUTING_WORSE_THAN_BEST_SINGLE_POLICY: 'regret CI lower > 0 and accuracy CI upper <= 0',
  B_ROUTING_STATISTICALLY_BETTER_BUT_NOT_MATERIAL: 'regret CI upper < 0 or accuracy CI lower > 0, below materiality',
  C_ROUTING_EQUIVALENT_TO_BEST_SINGLE_POLICY: 'both confidence intervals include zero',
  precedence: ['A', 'D', 'E', 'B', 'C'],
};
const VALUE_RULES = { HIGH: 'material AND regret oracle-gain captured >= 0.5', MODERATE: 'material AND captured >= 0.2',
  LOW: 'otherwise', NEGATIVE: 'router regret significantly higher than best single policy' };
const COLLAPSE_RULE = { share: STAGE3F6T_METHODOLOGY.policyCollapseShare, optimalityMargin: STAGE3F6T_METHODOLOGY.policyCollapseOptimalityMargin,
  definition: 'max selected share > 0.9 AND exceeds that policy\'s share of best-set membership by > 0.05' };
const CAPACITY_RULES = {
  POLICY_SET_LIMITED: 'CAL oracle regret gain over best single policy < 2.0',
  INFORMATION_LIMITED: 'max univariate DEV AUROC separating NEXUS-best from RESOURCE-best < 0.65 and DEV-CAL selection gap < 0.02',
  CLASS_IMBALANCE_LIMITED: 'majority policy selected >= 90% while minority uniquely-best recall < 0.2',
  CALIBRATION_LIMITED: 'selection ECE on CAL > 0.10',
  MODEL_CAPACITY_LIMITED: 'NOT_ESTABLISHABLE without a larger model (forbidden); reported POSSIBLE only if univariate '
    + 'separability >= 0.65 and no overfitting, yet minority recall < 0.2',
  precedence: ['POLICY_SET_LIMITED', 'INFORMATION_LIMITED', 'CLASS_IMBALANCE_LIMITED', 'CALIBRATION_LIMITED', 'MODEL_CAPACITY_LIMITED'],
};
const STAGE3G_READINESS_RULE = {
  id: 'STAGE3G_READINESS_V2_POLICY_ROUTING',
  predeclaredBeforeSealedExposure: true,
  requirements: {
    materialImprovementOverBestSinglePolicyOnHoldout: true,
    oodNotSignificantlyWorseThanBestSinglePolicy: true,
    minimumHoldoutN: MATERIALITY.minEvidenceN,
    deterministicReplay: true,
    zeroLeakage: true,
    acceptableFalseSelectionHarm: 'episodes worsened <= episodes improved AND false-selection p95 added regret <= best single policy p95 regret',
    nonTrivialPolicyDiversity: 'no policy collapse AND at least two policies each selected on >= 5% of episodes',
  },
};

/* --------------------------------------------------- 7. EVALUATION FREEZE */
const freezePayload = {
  gate: 'STAGE_3F_6_T_POLICY_ROUTER',
  policySet: POLICY_SET, policySetHash: POLICY_SET_HASH,
  featureContract: { profile: 'DEPLOYABLE_CORE', hash: DEPLOYABLE_FEATURE_CONTRACT_HASH, featureIds: CORE_KEYS },
  methodology: STAGE3F6T_METHODOLOGY,
  routerHash,
  weights: { featureKeys: model.featureKeys, mu: model.mu, sd: model.sd, W: model.W },
  bestSinglePolicy: BEST_SINGLE_POLICY,
  threshold: chosenThreshold,
  calibrationGrid: calGrid,
  splitHashes: dataset.hashes,
  regimeThresholds: { ENERGY_MEDIAN, NOVELTY_Q50, NOVELTY_Q90 },
  materiality: MATERIALITY, resultRules: RESULT_RULES, valueRules: VALUE_RULES, collapseRule: COLLAPSE_RULE,
  capacityRules: CAPACITY_RULES, stage3gReadinessRule: STAGE3G_READINESS_RULE,
  sealedPartitionsUnopenedAtFreeze: true,
};
const evaluationFreezeHash = sha256(freezePayload);
evaluationFreeze = { ...freezePayload, evaluationFreezeHash };
await mkdir(outDirectory, { recursive: true });
await writeFile(freezePath, `${JSON.stringify(evaluationFreeze, null, 2)}\n`);

/* ----------------------------------------------------- 8. SEALED EVALUATION */
const holdout = sealedRows('HOLDOUT');
const ood = sealedRows('OOD');

const oracleChoose = (row) => { const { best } = bestPolicySet(row); return best.length ? best[0] : null; };
const STRATEGIES = {
  ALWAYS_GREEDY: () => NON_DEPLOYABLE_REFERENCE,
  ALWAYS_RESOURCE_PRESERVING: () => 'RESOURCE_PRESERVING_V1',
  ALWAYS_NEXUS_SELECTOR: () => 'NEXUS_SELECTOR',
  ALWAYS_OBJECTIVE_TARGETING: () => 'OBJECTIVE_TARGETING_V1',
  ALWAYS_THREAT_COVERING: () => 'THREAT_COVERING_V1',
  RANDOM_LEGAL_CONTROL: () => CONTROL_POLICY,
  ROUTED_POLICY_SET: routerChoose,
  ROUTED_POLICY_SET_FULL_COVERAGE: fullCoverageChoose,
  ORACLE_POLICY_SET: oracleChoose,
};

function collapse(rows, choose) {
  const evaluated = evaluateStrategy(rows, choose);
  const shares = evaluated.selectionDistribution;
  const [topPolicy, topShare] = Object.entries(shares).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const optimalShare = topPolicy ? rows.filter((row) => bestPolicySet(row).best.includes(topPolicy)).length / rows.length : 0;
  return {
    topPolicy, topShare, optimalShareOfTopPolicy: optimalShare,
    POLICY_COLLAPSE: topShare > COLLAPSE_RULE.share && topShare > optimalShare + COLLAPSE_RULE.optimalityMargin,
    rawOver90: topShare > COLLAPSE_RULE.share,
    policiesSelectedOnAtLeast5Percent: Object.values(shares).filter((share) => share >= 0.05).length,
  };
}

function regimeTable(rows, classify) {
  const groups = {};
  for (const row of rows) { const key = classify(row); (groups[key] = groups[key] ?? []).push(row); }
  return Object.fromEntries(Object.entries(groups).sort().map(([key, members]) => {
    const r = evaluateStrategy(members, routerChoose);
    const s = evaluateStrategy(members, () => BEST_SINGLE_POLICY);
    const o = evaluateStrategy(members, oracleChoose);
    const opportunity = opportunityDistribution(members);
    return [key, {
      n: members.length, supported: members.length >= MATERIALITY.minRegimeN,
      routerAccuracy: r.accuracy, routerRegret: r.meanRegret,
      bestSingleAccuracy: s.accuracy, bestSingleRegret: s.meanRegret,
      oracleAccuracy: o.accuracy, oracleRegret: o.meanRegret,
      routerMinusBestSingleRegret: r.meanRegret - s.meanRegret,
      resourceUniquelyBest: opportunity.RESOURCE_PRESERVING_V1, nexusUniquelyBest: opportunity.NEXUS_SELECTOR,
      threatUniquelyBest: opportunity.THREAT_COVERING_V1, objectiveUniquelyBest: opportunity.OBJECTIVE_TARGETING_V1,
      tie: opportunity.TIE, routerSelection: r.selectionDistribution,
    }];
  }));
}

function evaluateSplit(rows, label) {
  const strategies = Object.fromEntries(Object.entries(STRATEGIES).map(([name, choose]) => [name, evaluateStrategy(rows, choose)]));
  const router = strategies.ROUTED_POLICY_SET;
  const bestSingle = strategies.ALWAYS_RESOURCE_PRESERVING;
  const oracle = strategies.ORACLE_POLICY_SET;
  const bootstrap = pairedBootstrap(rows, routerChoose, () => BEST_SINGLE_POLICY);
  const routedShare = rows.filter((row) => routeEpisode(model, row, { threshold: chosenThreshold, fallbackPolicy: BEST_SINGLE_POLICY }).routed).length / rows.length;
  return {
    label, n: rows.length, strategies,
    routerCoverage: routedShare,
    routerMinusBestSingle: { accuracy: router.accuracy - bestSingle.accuracy, meanRegret: router.meanRegret - bestSingle.meanRegret, bootstrap },
    oracleGainCaptured: oracleGainCaptured({ router, bestSingle, oracle }),
    collapse: collapse(rows, routerChoose),
    confusion: selectionConfusion(rows, routerChoose),
    opportunity: opportunityDistribution(rows),
    falseSelectionHarm: falseSelectionHarm(rows, routerChoose),
    bestSingleP95Regret: bestSingle.p95Regret,
  };
}

const splits = {
  DEV: evaluateSplit(dev, 'DEV'),
  CAL: evaluateSplit(cal, 'CAL'),
  HOLDOUT: evaluateSplit(holdout, 'HOLDOUT'),
  OOD: evaluateSplit(ood, 'OOD'),
};

const regimes = {
  HOLDOUT: Object.fromEntries(Object.entries(REGIMES).map(([name, fn]) => [name, regimeTable(holdout, fn)])),
  OOD: Object.fromEntries(Object.entries(REGIMES).map(([name, fn]) => [name, regimeTable(ood, fn)])),
};

/* ------------------------------------------- 9. representation gaps */
function gapConcentration(rows, predicate) {
  const inRegime = rows.filter(predicate);
  const overall = falseSelectionHarm(rows, routerChoose).rate;
  const inside = inRegime.length ? falseSelectionHarm(inRegime, routerChoose).rate : null;
  const ratio = overall && inside !== null ? inside / overall : null;
  return { regimeN: inRegime.length, falseSelectionRateInRegime: inside, falseSelectionRateOverall: overall,
    concentrationRatio: ratio, concentrated: inRegime.length >= MATERIALITY.minRegimeN && ratio !== null && ratio >= 1.25 };
}
const representationGaps = {
  RISK_STATE_GAP: { HOLDOUT: gapConcentration(holdout, GAP_REGIMES.RISK_STATE_GAP), OOD: gapConcentration(ood, GAP_REGIMES.RISK_STATE_GAP) },
  OBJECTIVE_STRUCTURE_GAP: { HOLDOUT: gapConcentration(holdout, GAP_REGIMES.OBJECTIVE_STRUCTURE_GAP), OOD: gapConcentration(ood, GAP_REGIMES.OBJECTIVE_STRUCTURE_GAP) },
  TEMPORAL_STATE_GAP: { proxy: 'context.tickProgress >= 0.5 (late episode); no history feature exists in CORE',
    HOLDOUT: gapConcentration(holdout, GAP_REGIMES.TEMPORAL_STATE_GAP), OOD: gapConcentration(ood, GAP_REGIMES.TEMPORAL_STATE_GAP) },
  SPATIAL_STATE_GAP: { measurable: false,
    reason: 'DEPLOYABLE_CORE contains no spatial evidence, so no spatial regime can be defined from router input; the '
      + 'Stage 3F.6-S spatial blind spot is carried forward unchanged and unmeasured here.' },
  fixedInThisStage: false,
};

/* ------------------------------------------- 10. capacity diagnosis */
const nexusVsResource = dev.filter((row) => ['NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1'].includes(bestLabel(row)));
const univariate = CORE_KEYS.map((key) => {
  const a = auroc(nexusVsResource.map((row) => row.core[key]), nexusVsResource.map((row) => (bestLabel(row) === 'NEXUS_SELECTOR' ? 1 : 0)));
  return { key, auroc: a, separability: a === null ? null : Math.max(a, 1 - a) };
}).sort((x, y) => (y.separability ?? 0) - (x.separability ?? 0));
const maxSeparability = univariate[0]?.separability ?? 0;
const calSelectionEntries = cal.map((row) => {
  const scored = scorePolicies(model, row);
  return { confidence: scored.confidence, correct: bestPolicySet(row).best.includes(scored.selected) };
});
const selectionEceCal = selectionEce(calSelectionEntries);
const devCalSelectionGap = splits.DEV.strategies.ROUTED_POLICY_SET.selectionAccuracy - splits.CAL.strategies.ROUTED_POLICY_SET.selectionAccuracy;
const minorityRecall = splits.CAL.confusion.recall.NEXUS_SELECTOR.selectedWhenUniquelyBest ?? 0;
const calOracleRegretGain = splits.CAL.strategies.ALWAYS_RESOURCE_PRESERVING.meanRegret - splits.CAL.strategies.ORACLE_POLICY_SET.meanRegret;
const capacityFlags = {
  POLICY_SET_LIMITED: calOracleRegretGain < 2.0,
  INFORMATION_LIMITED: maxSeparability < 0.65 && Math.abs(devCalSelectionGap) < 0.02,
  CLASS_IMBALANCE_LIMITED: (splits.CAL.collapse.topShare ?? 0) >= 0.9 && minorityRecall < 0.2,
  CALIBRATION_LIMITED: selectionEceCal !== null && selectionEceCal > 0.1,
  MODEL_CAPACITY_LIMITED: maxSeparability >= 0.65 && Math.abs(devCalSelectionGap) < 0.02 && minorityRecall < 0.2 ? 'POSSIBLE_NOT_ESTABLISHED' : false,
};
const capacityDiagnosis = {
  flags: capacityFlags,
  primary: CAPACITY_RULES.precedence.find((key) => capacityFlags[key]) ?? 'UNDETERMINED',
  evidence: { maxUnivariateSeparability: maxSeparability, topSeparatingFeatures: univariate.slice(0, 5),
    devCalSelectionGap, minorityNexusRecallOnCal: minorityRecall, selectionEceCal, calOracleRegretGain,
    calTopSelectedShare: splits.CAL.collapse.topShare },
  largerModelTrained: false,
};

/* ------------------------------------------------ 11. classification */
function classify(split) {
  const { bootstrap } = split.routerMinusBestSingle;
  const [accLo, accHi] = bootstrap.accuracyCi95;
  const [regLo, regHi] = bootstrap.regretCi95;
  const material = (bootstrap.accuracyDifference >= MATERIALITY.minAccuracyGain && accLo > 0)
    || (-bootstrap.regretDifference >= MATERIALITY.minRegretReduction && regHi < 0);
  const accBetter = accLo > 0; const accWorse = accHi < 0;
  const regBetter = regHi < 0; const regWorse = regLo > 0;
  let result;
  if (material) result = 'A_ROUTING_MATERIALLY_BEATS_BEST_SINGLE_POLICY';
  else if (regWorse && accHi <= 0) result = 'D_ROUTING_WORSE_THAN_BEST_SINGLE_POLICY';
  else if ((regBetter && accWorse) || (accBetter && regWorse)) result = 'E_MIXED_ACCURACY_REGRET_TRADEOFF';
  else if (regBetter || accBetter) result = 'B_ROUTING_STATISTICALLY_BETTER_BUT_NOT_MATERIAL';
  else result = 'C_ROUTING_EQUIVALENT_TO_BEST_SINGLE_POLICY';
  const captured = split.oracleGainCaptured.regret;
  const value = regWorse ? 'NEGATIVE' : material && captured !== null && captured >= 0.5 ? 'HIGH'
    : material && captured !== null && captured >= 0.2 ? 'MODERATE' : 'LOW';
  return { result, value, material, accBetter, accWorse, regBetter, regWorse };
}
const holdoutClass = classify(splits.HOLDOUT);
const oodClass = classify(splits.OOD);
const secondary = [
  splits.HOLDOUT.collapse.POLICY_COLLAPSE ? 'POLICY_COLLAPSE' : null,
  (splits.HOLDOUT.oracleGainCaptured.regret ?? 0) < 0.2 ? 'LOW_ORACLE_GAIN_CAPTURE' : null,
  oodClass.regWorse ? 'OOD_DEGRADATION' : null,
].filter(Boolean);

const worsened = splits.HOLDOUT.routerMinusBestSingle.bootstrap.episodesWorsened;
const improved = splits.HOLDOUT.routerMinusBestSingle.bootstrap.episodesImproved;
const readinessEvaluation = {
  materialImprovementOverBestSinglePolicyOnHoldout: holdoutClass.material,
  oodNotSignificantlyWorseThanBestSinglePolicy: !oodClass.regWorse,
  minimumHoldoutN: holdout.length >= MATERIALITY.minEvidenceN,
  deterministicReplay: routerHash === replayHash,
  zeroLeakage: dataset.RECORD_OVERLAP === 0 && dataset.STATE_OVERLAP === 0 && dataset.TOPOLOGY_OVERLAP === 0,
  acceptableFalseSelectionHarm: worsened <= improved
    && (splits.HOLDOUT.falseSelectionHarm.p95 ?? 0) <= (splits.HOLDOUT.bestSingleP95Regret ?? 0),
  nonTrivialPolicyDiversity: !splits.HOLDOUT.collapse.POLICY_COLLAPSE && splits.HOLDOUT.collapse.policiesSelectedOnAtLeast5Percent >= 2,
};
const readyForStage3G = Object.values(readinessEvaluation).every(Boolean);

/* ------------------------------------------------ 12. candidate freeze */
const candidate = {
  architecture: STAGE3F6T_METHODOLOGY.routerFamily, routerHash, policySetHash: POLICY_SET_HASH,
  featureContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH, threshold: chosenThreshold, fallbackPolicy: BEST_SINGLE_POLICY,
  trainingSplitHashes: { DEV: dataset.hashes.DEV, CAL: dataset.hashes.CAL },
  evaluationFreezeHash, promotedToLiveRuntime: false, onlineLearningEnabled: false,
};
const candidateHash = sha256(candidate);

/* -------------------------------------------------------------- tests */
let testMetrics = { pass: 0, fail: 0, skipped: 0 };
let testsStatus = 0;
if (!skipTests) {
  const run = spawnSync('node', ['--test', 'tests/stage3f6t-policy-router.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = run.status ?? 1;
  const read = (label) => Number(new RegExp(`^# ${label} (\\d+)$`, 'm').exec(run.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

/* --------------------------------------------------------- assessment */
const checks = {
  POLICY_DEFINITIONS_UNCHANGED: scope.policyDefinitionsUnchanged,
  FEATURE_CONTRACT_HASH_MATCHES: scope.featureContractHashMatchesStage3F6S,
  CORE_HAS_NO_SIMULATOR_FEATURE: coreFeatureAudit.noSimulatorFeature,
  CORE_HAS_NO_V2B_FEATURE: coreFeatureAudit.noV2BFeature,
  CORE_HAS_NO_ROLLOUT_FEATURE: coreFeatureAudit.noRolloutFeature,
  CORE_FEATURE_COUNT_30: CORE_KEYS.length === 30,
  TRAINING_INTEGRITY: Object.values(trainingIntegrity).every(Boolean),
  CONFIRMATORY_HASH_MATCHES: confirmatoryHashMatches,
  FRESH_CONFIRMATORY_SIZE: dataset.HOLDOUT_N === 6000 && dataset.OOD_N === 6000,
  RECORD_OVERLAP_ZERO: dataset.RECORD_OVERLAP === 0,
  STATE_OVERLAP_ZERO: dataset.STATE_OVERLAP === 0,
  TOPOLOGY_OVERLAP_ZERO: dataset.TOPOLOGY_OVERLAP === 0,
  NO_OVERLAP_WITH_EXPOSED_SPLITS: Object.values(confirmatoryManifest.overlapWithPriorCorpus).every((v) => v === 0),
  THRESHOLD_FROM_CAL: calGrid.some((entry) => entry.threshold === chosenThreshold),
  EVALUATION_FREEZE_WRITTEN: evaluationFreezeHash.length === 64,
  SEALED_OPENED_ONLY_AFTER_FREEZE: sealedAccessLog.length === 2 && sealedAccessLog.every((e) => e.afterFreeze),
  DETERMINISTIC_TRAINING: routerHash === replayHash,
  BEST_SINGLE_POLICY_COMPARISON_COMPUTED: typeof splits.HOLDOUT.routerMinusBestSingle.accuracy === 'number',
  ORACLE_GAIN_FRACTION_COMPUTED: splits.HOLDOUT.oracleGainCaptured.accuracyDenominator !== undefined,
  POLICY_COLLAPSE_COMPUTED: typeof splits.HOLDOUT.collapse.POLICY_COLLAPSE === 'boolean',
  FALSE_SELECTION_HARM_COMPUTED: typeof splits.HOLDOUT.falseSelectionHarm.falseSelections === 'number',
  UNAVAILABLE_NEVER_SELECTED: [...holdout, ...ood].every((row) => availablePolicies(row).includes(routerChoose(row))),
  STAGE3F6A_INTACT: scope.stage3f6aHashMatchesAccepted,
  STAGE3F6C_INTACT: scope.stage3f6cHashMatchesAccepted,
  PRIOR_OWNERS_UNCHANGED: scope.priorOwnersUnchanged,
  FROZEN_STAGE3E_UNCHANGED: scope.frozenStage3EUnchanged,
  NO_LIVE_PROMOTION: candidate.promotedToLiveRuntime === false,
  NO_ONLINE_LEARNING: candidate.onlineLearningEnabled === false,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1,
  stage: 'STAGE_3F_6_T_POLICY_ROUTER',
  status,
  headlineComparison: 'ROUTED_POLICY_SET vs ALWAYS_RESOURCE_PRESERVING_V1',
  policySet: { hash: POLICY_SET_HASH, definition: POLICY_SET, count: ROUTED_POLICIES.length },
  dataset,
  featureContract: { profile: 'DEPLOYABLE_CORE', hash: DEPLOYABLE_FEATURE_CONTRACT_HASH, featureCount: CORE_KEYS.length, audit: coreFeatureAudit },
  router: { family: STAGE3F6T_METHODOLOGY.routerFamily, routerHash, replayHash, threshold: chosenThreshold,
    fallbackPolicy: BEST_SINGLE_POLICY, bestSingleSelection: alwaysCandidates, calibrationGrid: calGrid,
    selectionAccuracy: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, v.strategies.ROUTED_POLICY_SET.selectionAccuracy])) },
  evaluationFreezeHash,
  splits,
  regimes,
  representationGaps,
  capacityDiagnosis,
  classification: { HOLDOUT: holdoutClass, OOD: oodClass, primaryResult: holdoutClass.result,
    secondaryResult: secondary.length ? secondary.join('+') : null, routerValueConclusion: holdoutClass.value },
  stage3gReadiness: { rule: STAGE3G_READINESS_RULE, evaluation: readinessEvaluation, ready: readyForStage3G },
  candidate: { ...candidate, candidateHash, frozen: true },
  scope,
  checks,
  tests: testMetrics,
  sourceHashes: Object.fromEntries(scope.newOwners.map((file) => [file, hex(readFileSync(path.join(root, file)))])),
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, shadowOnly: true, incumbentSoleExecutor: true },
  learning: { modelTrainingPerformed: true, trainedOn: 'DEV_ONLY', calibratedOn: 'CAL_ONLY', offlineCandidateOnly: true,
    largerModelTrained: false, onlineLearningEnabled: false, promotedToLiveRuntime: false },
  roadmap: {
    readyForStage3G,
    blockers: Object.entries(readinessEvaluation).filter(([, ok]) => !ok).map(([key]) => `STAGE3G_READINESS_UNMET:${key}`),
  },
};
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = JSON.parse(await readFile(resultPath, 'utf8'));
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6T_CERTIFICATION', reproduced, status,
    storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  const h = splits.HOLDOUT; const o = splits.OOD;
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, evaluationFreezeHash, routerHash,
    threshold: chosenThreshold, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    holdout: { router: h.strategies.ROUTED_POLICY_SET, resource: h.strategies.ALWAYS_RESOURCE_PRESERVING,
      oracle: h.strategies.ORACLE_POLICY_SET, diff: h.routerMinusBestSingle, captured: h.oracleGainCaptured, collapse: h.collapse },
    ood: { router: o.strategies.ROUTED_POLICY_SET, resource: o.strategies.ALWAYS_RESOURCE_PRESERVING, diff: o.routerMinusBestSingle },
    classification: payload.classification, readiness: payload.stage3gReadiness.evaluation }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
