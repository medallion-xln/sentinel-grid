/* Sentinel Forge World — Stage 3B dataset pipeline.
 *
 * Generation, admission, counterfactual expansion, supervision classification,
 * splits, and export. Written to STREAM: a case is generated, evaluated, reduced
 * to a compact record and released, so corpus size is bounded by disk rather than
 * by memory. Holding sixty thousand worlds and their branch sets in memory at
 * once is how a generator stops being able to scale.
 *
 * Nothing here relaxes the admission gate for volume. A case that fails its
 * semantic claim is rejected at fifty thousand exactly as it was at five hundred.
 */

import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sha256 } from '../core/determinism.js';

import { createWorld, hashWorld, legalActions, topologyHash } from './kernel.js';
import {
  FORGE_ROLE_COMPOSITIONS, FORGE_CURRICULUM_V2_VERSION, FORGE_SCENARIO_V2_VERSION,
  enumerateCurriculumV2, generateScenarioV2,
} from './scenarios-v2.js';
import { FORGE_VALIDATOR_V2_VERSION, validateScenarioV2 } from './validators-v2.js';
import {
  FORGE_ORACLE_V2_VERSION, classifyHorizonDependence, evaluateAcrossPolicies, evaluateCounterfactualsV2,
} from './counterfactual-v2.js';
import { FORGE_REWARD_V2_VERSION } from './reward-v2.js';
import { FORGE_TOPOLOGY_VERSION } from './topology.js';
import {
  FORGE_SUPERVISION_VERSION, PREFERENCE_MINIMUM_GAP, classifySupervision, classifyTie,
} from './supervision.js';

export const FORGE_DATASET_VERSION = 'FORGE_DATASET_V1';
export const FORGE_SPLITS = Object.freeze(['TRAIN', 'VALIDATION', 'HOLDOUT']);

/* ---------------------------------------------------------------------------
 * Splits (Phase 24)
 *
 * Assignment is by TOPOLOGY HASH, not by record. Splitting records at random
 * would put near-identical structures on both sides of the line and let a model
 * score well by having memorised the shape — the leakage this phase exists to
 * prevent. Because the assignment is a hash of the structure, it is stable across
 * runs and independent of generation order.
 * ------------------------------------------------------------------------- */

export function splitForTopology(topologyDigest) {
  const bucket = parseInt(topologyDigest.slice(0, 8), 16) % 100;
  if (bucket < 80) return 'TRAIN';
  if (bucket < 90) return 'VALIDATION';
  return 'HOLDOUT';
}

/* Out-of-distribution is defined by CONSTRUCTION, not by sampling: levels and
 * horizon bands the training curriculum never contains. A holdout drawn from the
 * same distribution measures generalisation across structures; this measures it
 * across regimes. */
export const OOD_SPEC = Object.freeze({
  levels: [6, 7],
  description: 'levels above the training curriculum: larger graphs, deeper dependencies, scarcer resources, longer horizons',
});

/* ---------------------------------------------------------------------------
 * Record construction
 * ------------------------------------------------------------------------- */

function compactRecord({ config, world, validation, counterfactuals, supervision, horizon, tie, split, ood }) {
  const digest = topologyHash(world);
  const body = {
    recordVersion: FORGE_DATASET_VERSION,
    simulatorVersion: config.scenarioVersion,
    rewardVersion: FORGE_REWARD_V2_VERSION,
    oracleVersion: FORGE_ORACLE_V2_VERSION,
    continuationPolicy: counterfactuals.continuationPolicy,
    curriculumVersion: FORGE_CURRICULUM_V2_VERSION,
    validatorVersion: FORGE_VALIDATOR_V2_VERSION,
    topologyVersion: FORGE_TOPOLOGY_VERSION,
    supervisionVersion: FORGE_SUPERVISION_VERSION,

    shape: config.shape,
    roles: config.roles,
    objectives: config.objectives,
    horizonBand: config.horizonBand,
    level: config.level,
    seed: config.seed,
    scenarioSeed: config.scenarioSeed,

    split,
    outOfDistribution: ood,

    worldHash: hashWorld(world),
    topologyHash: digest,
    entityCount: world.entities.length,
    relationCount: world.relations.length,
    objectiveCount: world.objectives.length,
    energy: world.constraints.energy ?? 0,
    tick: world.tick,
    maxTicks: world.maxTicks,

    horizon: counterfactuals.horizon,
    legalActionCount: counterfactuals.branchCount,
    branches: counterfactuals.branches.map((branch) => ({
      actionKey: branch.actionKey.slice(0, 16),
      actionType: branch.action.actionType,
      targetId: branch.action.target?.id ?? null,
      parameters: branch.action.parameters,
      rewardVector: branch.totalRewardVector,
      immediateScalar: branch.immediateScalar,
      scalarReward: branch.totalScalar,
      nextStateHash: branch.resultingStateHash.slice(0, 16),
      horizonStateHash: branch.horizonStateHash.slice(0, 16),
      terminal: branch.terminal,
      regret: counterfactuals.optimalScalar - branch.totalScalar,
    })),
    optimalActionKey: counterfactuals.optimalActionKey === null ? null : counterfactuals.optimalActionKey.slice(0, 16),
    optimalScalar: counterfactuals.optimalScalar,
    utilitySpread: counterfactuals.utilitySpread,
    exactTie: counterfactuals.exactTie,
    tieCount: counterfactuals.tieCount,
    tieClass: tie === null ? null : tie.class,
    tieIsRewardDefect: tie === null ? false : tie.rewardDefect,

    supervisionClass: supervision.supervisionClass,
    supervisionMargin: supervision.margin,
    paretoTradeoff: supervision.pareto?.paretoTradeoff ?? false,
    scalarizationCollapse: supervision.pareto?.scalarizationCollapse ?? false,

    horizonClass: horizon.horizonClass,
    greedyRegret: horizon.greedyRegret,

    admission: {
      admitted: validation.valid,
      checks: validation.checks.map((check) => ({ check: check.check, holds: check.holds })),
    },
  };
  return { ...body, recordHash: sha256(body) };
}

/* ---------------------------------------------------------------------------
 * Generation
 * ------------------------------------------------------------------------- */

/**
 * Generate, admit and evaluate the Stage 3B corpus, streaming shards to disk.
 *
 * `onRecord` sees every admitted record and is the only place the full record
 * exists; the caller decides what to keep. Aggregates returned here are counts
 * and digests, never the corpus itself.
 */
export async function generateCorpus({
  seeds = [1, 2, 3],
  levels = [0, 1, 2, 3, 4, 5],
  outputDir = null,
  shardSize = 5000,
  policySampleEvery = 200,
  onRecord = null,
  limit = Infinity,
} = {}) {
  const combinations = enumerateCurriculumV2({ levels, seeds });

  const stats = {
    generated: 0,
    admitted: 0,
    rejected: 0,
    rejectionsByCheck: {},
    bySupervision: {},
    byHorizonClass: {},
    byShape: {},
    byLevel: {},
    bySplit: {},
    byTieClass: {},
    counterfactualActions: 0,
    policyProbes: 0,
    policyInvariant: 0,
    policyDependent: 0,
  };
  const worldHashes = new Set();
  const topologyHashes = new Set();
  const rankingHashes = new Set();
  const optimalPatternHashes = new Set();
  const objectiveCombinations = new Set();
  const recordHashes = [];

  let shard = [];
  let shardIndex = 0;
  const shardFiles = [];
  const flush = async () => {
    if (outputDir === null || shard.length === 0) { shard = []; return; }
    const name = `shard-${String(shardIndex).padStart(4, '0')}.jsonl`;
    await writeFile(path.join(outputDir, name), `${shard.map((record) => JSON.stringify(record)).join('\n')}\n`);
    shardFiles.push({ file: name, records: shard.length, sha256: createHash('sha256').update(shard.map((r) => JSON.stringify(r)).join('\n')).digest('hex') });
    shardIndex += 1;
    shard = [];
  };
  if (outputDir !== null) await mkdir(outputDir, { recursive: true });

  for (const combination of combinations) {
    if (stats.generated >= limit) break;
    stats.generated += 1;

    const config = generateScenarioV2(combination);
    const world = createWorld(config.scenarioSeed, config);
    const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === combination.roles);
    const validation = validateScenarioV2(world, {
      ...combination,
      horizon: config.horizon,
      roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes },
    });

    if (!validation.valid) {
      stats.rejected += 1;
      for (const check of validation.failedChecks) {
        stats.rejectionsByCheck[check] = (stats.rejectionsByCheck[check] ?? 0) + 1;
      }
      continue;
    }

    /* The horizon band sets the window; H0 still gets a real window so the case
     * has counterfactual content, and the horizon CLASS records whether the
     * window mattered. */
    const horizonLength = Math.max(1, config.horizon);
    const counterfactuals = evaluateCounterfactualsV2(world, { horizon: horizonLength });
    const supervision = classifySupervision(counterfactuals);
    const tie = classifyTie(counterfactuals);
    const horizon = classifyHorizonDependence(world, { horizon: horizonLength, deepEvaluation: counterfactuals });

    const digest = topologyHash(world);
    const ood = combination.level > 5;
    const split = ood ? 'OOD' : splitForTopology(digest);

    const record = compactRecord({ config, world, validation, counterfactuals, supervision, horizon, tie, split, ood });

    stats.admitted += 1;
    stats.counterfactualActions += counterfactuals.branchCount;
    stats.bySupervision[supervision.supervisionClass] = (stats.bySupervision[supervision.supervisionClass] ?? 0) + 1;
    stats.byHorizonClass[horizon.horizonClass] = (stats.byHorizonClass[horizon.horizonClass] ?? 0) + 1;
    stats.byShape[combination.shape] = (stats.byShape[combination.shape] ?? 0) + 1;
    stats.byLevel[combination.level] = (stats.byLevel[combination.level] ?? 0) + 1;
    stats.bySplit[split] = (stats.bySplit[split] ?? 0) + 1;
    if (tie !== null) stats.byTieClass[tie.class] = (stats.byTieClass[tie.class] ?? 0) + 1;

    worldHashes.add(record.worldHash);
    topologyHashes.add(digest);
    rankingHashes.add(sha256(counterfactuals.ranking));
    optimalPatternHashes.add(sha256([record.optimalActionKey, record.legalActionCount, record.supervisionClass]));
    objectiveCombinations.add(combination.objectives);
    recordHashes.push(record.recordHash);

    /* Policy-family agreement is sampled rather than run on every case: it costs
     * three oracle passes, and a sample is enough to characterise how much the
     * corpus depends on one continuation story. */
    if (stats.admitted % policySampleEvery === 0) {
      const across = evaluateAcrossPolicies(world, { horizon: horizonLength });
      stats.policyProbes += 1;
      if (across.policyInvariant) stats.policyInvariant += 1; else stats.policyDependent += 1;
    }

    if (onRecord !== null) onRecord(record);
    shard.push(record);
    if (shard.length >= shardSize) await flush();
  }
  await flush();

  const raw = stats.admitted;
  return {
    datasetVersion: FORGE_DATASET_VERSION,
    ...stats,
    shardFiles,
    diversity: {
      rawRecords: raw,
      uniqueWorldHashes: worldHashes.size,
      uniqueTopologyHashes: topologyHashes.size,
      uniqueRewardRankings: rankingHashes.size,
      uniqueOptimalActionPatterns: optimalPatternHashes.size,
      uniqueObjectiveCombinations: objectiveCombinations.size,
      nearDuplicateRate: raw === 0 ? 0 : Math.round(((raw - worldHashes.size) * 10000) / raw) / 10000,
      /* EFFECTIVE_DATASET_SIZE, defined deterministically: the smallest of the
       * three independent diversity counts. A corpus is only as informative as
       * its least-varied dimension, and quoting the raw count would overstate it
       * by exactly the redundancy the smallest count exposes. */
      effectiveDatasetSize: Math.min(worldHashes.size, topologyHashes.size, rankingHashes.size),
      method: 'min(unique world hashes, unique topology hashes, unique reward rankings)',
    },
    recordSetDigest: sha256([...recordHashes].sort()),
    admissionRate: stats.generated === 0 ? 0 : Math.round((stats.admitted * 10000) / stats.generated) / 10000,
  };
}

/* ---------------------------------------------------------------------------
 * Exporters (Phases 21-23)
 *
 * Each honours the supervision class. That is the whole mechanism by which
 * supervision density rises without a single fabricated distinction: a case goes
 * to the dataset that can represent it truthfully, and to no other.
 * ------------------------------------------------------------------------- */

function describeAction(branch) {
  const target = branch.targetId === null ? '' : ` ${branch.targetId}`;
  const keys = Object.keys(branch.parameters ?? {}).sort();
  const parameters = keys.length === 0 ? '' : ` (${keys.map((key) => `${key}=${branch.parameters[key]}`).join(', ')})`;
  return `${branch.actionType}${target}${parameters}`;
}

export function buildPrompt(record) {
  const objectives = `${record.objectiveCount} open objective(s)`;
  const actions = record.branches.map((branch, index) => `  ${index}. ${describeAction(branch)}`).join('\n');
  return [
    '# Sentinel Forge World — decision',
    `topology: ${record.shape}  roles: ${record.roles}  objectives: ${record.objectives}  horizon band: ${record.horizonBand}  level: L${record.level}`,
    `entities: ${record.entityCount}  relations: ${record.relationCount}  energy: ${record.energy}  tick: ${record.tick}/${record.maxTicks}`,
    `${objectives}`,
    '',
    'legal actions:',
    actions,
    '',
    'Choose exactly one legal action.',
  ].join('\n');
}

/**
 * SFT.
 *
 * UNIQUE_OPTIMUM gives a single completion. EXACT_EQUIVALENCE gives a completion
 * that NAMES every equal optimum, because teaching a lexicographic tie-break as
 * if it were world truth is teaching a fact about the sorting function. Every
 * other class is excluded and counted.
 */
export function exportSftV2(records) {
  const lines = [];
  const excluded = {};
  for (const record of records) {
    const cls = record.supervisionClass;
    if (cls === 'UNIQUE_OPTIMUM') {
      const optimal = record.branches.find((branch) => branch.actionKey === record.optimalActionKey);
      if (optimal === undefined) { excluded.NO_OPTIMUM = (excluded.NO_OPTIMUM ?? 0) + 1; continue; }
      lines.push(JSON.stringify({
        instruction: buildPrompt(record),
        output: describeAction(optimal),
        forge_metadata: {
          recordHash: record.recordHash, supervisionClass: cls, optimalUtility: record.optimalScalar,
          margin: record.supervisionMargin, rewardVersion: record.rewardVersion, split: record.split,
        },
      }));
    } else if (cls === 'EXACT_EQUIVALENCE') {
      const optima = record.branches.filter((branch) => branch.scalarReward === record.optimalScalar);
      if (optima.length < 2) { excluded.DEGENERATE_EQUIVALENCE = (excluded.DEGENERATE_EQUIVALENCE ?? 0) + 1; continue; }
      lines.push(JSON.stringify({
        instruction: buildPrompt(record),
        output: `Equally optimal (${optima.length}): ${optima.map(describeAction).join(' | ')}`,
        forge_metadata: {
          recordHash: record.recordHash, supervisionClass: cls, equalOptima: optima.length,
          optimalUtility: record.optimalScalar, rewardVersion: record.rewardVersion, split: record.split,
        },
      }));
    } else {
      excluded[cls] = (excluded[cls] ?? 0) + 1;
    }
  }
  return { content: lines.join('\n'), count: lines.length, excluded };
}

/**
 * Preference pairs.
 *
 * Emitted only where a preference genuinely exists: a strictly positive utility
 * gap of at least the predeclared minimum, OR Pareto dominance. Never between
 * actions the world scores the same.
 */
export function exportPreferenceV2(records, { minimumGap = PREFERENCE_MINIMUM_GAP } = {}) {
  const lines = [];
  const skipped = {};
  for (const record of records) {
    if (record.supervisionClass === 'EXACT_EQUIVALENCE' || record.supervisionClass === 'PARETO_TRADEOFF') {
      skipped[record.supervisionClass] = (skipped[record.supervisionClass] ?? 0) + 1;
      continue;
    }
    const chosen = record.branches.find((branch) => branch.actionKey === record.optimalActionKey);
    if (chosen === undefined) continue;
    const worst = [...record.branches].sort((a, b) => a.scalarReward - b.scalarReward)[0];
    const gap = record.optimalScalar - worst.scalarReward;
    if (gap < minimumGap) { skipped.GAP_BELOW_MINIMUM = (skipped.GAP_BELOW_MINIMUM ?? 0) + 1; continue; }
    lines.push(JSON.stringify({
      prompt: buildPrompt(record),
      chosen: describeAction(chosen),
      rejected: describeAction(worst),
      forge_metadata: {
        recordHash: record.recordHash, utilityGap: gap, regretGap: worst.regret,
        supervisionClass: record.supervisionClass, horizonClass: record.horizonClass,
        rewardVersion: record.rewardVersion, split: record.split,
      },
    }));
  }
  return { content: lines.join('\n'), count: lines.length, skipped };
}

/**
 * RL episodes.
 *
 * Deliberately the broadest dataset: it keeps everything the other two reject,
 * because a continuous reward landscape can represent an equivalence or a
 * tradeoff faithfully where a single-label format cannot.
 */
export function exportRlV2(records) {
  const lines = [];
  for (const record of records) {
    for (const branch of record.branches) {
      lines.push(JSON.stringify({
        state: record.worldHash,
        state_features: {
          shape: record.shape, level: record.level, entities: record.entityCount,
          relations: record.relationCount, energy: record.energy, tick: record.tick,
        },
        action: branch.actionType,
        action_key: branch.actionKey,
        reward: branch.scalarReward,
        reward_vector: branch.rewardVector,
        next_state: branch.nextStateHash,
        done: branch.terminal,
        forge_metadata: {
          recordHash: record.recordHash, rewardVersion: record.rewardVersion,
          continuationPolicy: record.continuationPolicy, supervisionClass: record.supervisionClass,
          split: record.split,
        },
      }));
    }
  }
  return { content: lines.join('\n'), count: lines.length };
}

/* ---------------------------------------------------------------------------
 * Leakage control (Phase 24)
 * ------------------------------------------------------------------------- */

export function measureLeakage(byS) {
  const splits = Object.keys(byS);
  const worldOverlap = {};
  const topologyOverlap = {};
  for (let i = 0; i < splits.length; i += 1) {
    for (let j = i + 1; j < splits.length; j += 1) {
      const a = byS[splits[i]];
      const b = byS[splits[j]];
      const pair = `${splits[i]}|${splits[j]}`;
      worldOverlap[pair] = [...a.worlds].filter((hash) => b.worlds.has(hash)).length;
      topologyOverlap[pair] = [...a.topologies].filter((hash) => b.topologies.has(hash)).length;
    }
  }
  const exactWorldOverlap = Object.values(worldOverlap).reduce((a, b) => a + b, 0);
  const topologyLeakage = Object.values(topologyOverlap).reduce((a, b) => a + b, 0);
  return {
    worldOverlapByPair: worldOverlap,
    topologyOverlapByPair: topologyOverlap,
    exactWorldOverlap,
    topologyLeakage,
    /* Splits are assigned by topology hash, so a topology can only appear in one
     * split by construction. A non-zero count here would mean the assignment
     * function is not a function of the topology, which is a bug, not a tuning
     * decision. */
    topologyLeakageControlPass: topologyLeakage === 0 && exactWorldOverlap === 0,
  };
}
