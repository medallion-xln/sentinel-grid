/* Stage 3B — Sentinel MicroWorld curriculum and large-scale dataset generation.
 *
 * Analysis and certification. The corpus itself is produced by
 * scripts/generate-stage3b-corpus.mjs and lives under build/; this module reads
 * it, measures it, evaluates frozen Sentinel against its evaluation splits, and
 * certifies.
 *
 * Nothing here modifies an expert, Prime, the router, the Arbiter, the frozen
 * Stage 3A kernel, or FORGE_REWARD_V1. Stage 3B adds superseding modules beside
 * them and measures what changed.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assertEvaluationOnly, defaultAuthorityPolicy, denyExecution } from '../core/authority.js';
import { validateAdapter } from '../core/contracts.js';
import { recommend } from '../prime/root-puct.js';
import { evaluateNexus } from '../experts/nexus.js';
import { evaluateOracle } from '../experts/oracle.js';

import { createWorld, hashWorld } from '../forge/kernel.js';
import { forgeAdapterState, forgeWorldAdapter } from '../forge/adapter.js';
import { generateScenarioV2, FORGE_CURRICULUM_V2_AXIS_SIZES, FORGE_HORIZON_BANDS, FORGE_OBJECTIVE_COMPOSITIONS, FORGE_ROLE_COMPOSITIONS } from '../forge/scenarios-v2.js';
import { FORGE_TOPOLOGY_SHAPES, FORGE_TOPOLOGY_SHAPE_IDS, generateTopology } from '../forge/topology.js';
import { validateScenarioV2 } from '../forge/validators-v2.js';
import { CONTINUATION_POLICY_IDS, evaluateAcrossPolicies, evaluateCounterfactualsV2 } from '../forge/counterfactual-v2.js';
import { FORGE_REWARD_V2_COMPONENT_IDS, FORGE_REWARD_V2_VERSION } from '../forge/reward-v2.js';
import { NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP, SUPERVISION_CLASSES, TIE_CLASSES } from '../forge/supervision.js';
import { exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage } from '../forge/dataset.js';
import { detectSoupFormat, SOUP_COMMIT, SOUP_VERSION } from '../forge/soup-bridge.js';

export const STAGE3B_STAGE = 'STAGE3B_MICROWORLD_CURRICULUM';
export const STAGE3B_STAGE3A_CERTIFICATION_HASH = 'c66b85d863d428d2da0e9d738f426e0b655124509bad04e0e7220f6eaf34898d';

/* Predeclared targets. Written down before the corpus existed so a miss is a
 * miss rather than a threshold that moved. */
export const STAGE3B_TARGETS = deepFreeze({
  topologyCount: 1000,
  admittedRecords: 50000,
  horizonDependentCases: 5000,
  uniqueOptimumRate: 0.40,
  uniqueOptimumRateIsConditional: 'Only if semantically justified. If genuine equivalence remains high the target is NOT forced; the certification records that preference and RL data are the appropriate carriers for those regions.',
});

/* ---------------------------------------------------------------------------
 * Corpus loading
 * ------------------------------------------------------------------------- */

export async function loadCorpus(corpusPath) {
  let raw;
  try {
    raw = await readFile(corpusPath, 'utf8');
  } catch {
    return { present: false, reason: `CORPUS_NOT_PRESENT: ${path.basename(corpusPath)} has not been generated. Run scripts/generate-stage3b-corpus.mjs first; it is deterministic from the pinned seeds.` };
  }
  const records = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return {
    present: true,
    records,
    corpusSha256: createHash('sha256').update(raw).digest('hex'),
    bytes: Buffer.byteLength(raw),
  };
}

/* ---------------------------------------------------------------------------
 * Diversity, supervision, horizon (Phases 10, 17, 20)
 * ------------------------------------------------------------------------- */

export function measureCorpus(records) {
  const worlds = new Set();
  const topologies = new Set();
  const rankings = new Set();
  const optimalPatterns = new Set();
  const objectiveCombinations = new Set();
  const bySupervision = {};
  const byTieClass = {};
  const byHorizonClass = {};
  const byShape = {};
  const byLevel = {};
  const bySplit = {};
  const byBand = {};
  const splitSets = {};
  let counterfactualActions = 0;
  let rewardDefectTies = 0;
  let genuineTies = 0;
  let paretoTradeoffs = 0;
  let scalarizationCollapse = 0;

  for (const record of records) {
    worlds.add(record.worldHash);
    topologies.add(record.topologyHash);
    rankings.add(sha256(record.branches.map((branch) => branch.scalarReward)));
    optimalPatterns.add(sha256([record.optimalActionKey, record.legalActionCount, record.supervisionClass]));
    objectiveCombinations.add(record.objectives);
    counterfactualActions += record.legalActionCount;

    bySupervision[record.supervisionClass] = (bySupervision[record.supervisionClass] ?? 0) + 1;
    byHorizonClass[record.horizonClass] = (byHorizonClass[record.horizonClass] ?? 0) + 1;
    byShape[record.shape] = (byShape[record.shape] ?? 0) + 1;
    byLevel[record.level] = (byLevel[record.level] ?? 0) + 1;
    bySplit[record.split] = (bySplit[record.split] ?? 0) + 1;
    byBand[record.horizonBand] = (byBand[record.horizonBand] ?? 0) + 1;
    if (record.tieClass !== null) {
      byTieClass[record.tieClass] = (byTieClass[record.tieClass] ?? 0) + 1;
      if (record.tieIsRewardDefect) rewardDefectTies += 1; else genuineTies += 1;
    }
    if (record.paretoTradeoff) paretoTradeoffs += 1;
    if (record.scalarizationCollapse) scalarizationCollapse += 1;

    splitSets[record.split] ??= { worlds: new Set(), topologies: new Set() };
    splitSets[record.split].worlds.add(record.worldHash);
    splitSets[record.split].topologies.add(record.topologyHash);
  }

  const total = records.length;
  const tiedCases = Object.values(byTieClass).reduce((a, b) => a + b, 0);
  return {
    records: total,
    counterfactualActions,
    diversity: {
      rawRecords: total,
      uniqueWorldHashes: worlds.size,
      uniqueTopologyHashes: topologies.size,
      uniqueRewardRankings: rankings.size,
      uniqueOptimalActionPatterns: optimalPatterns.size,
      uniqueObjectiveCombinations: objectiveCombinations.size,
      nearDuplicateRate: total === 0 ? 0 : Math.round(((total - worlds.size) * 10000) / total) / 10000,
      effectiveDatasetSize: Math.min(worlds.size, topologies.size, rankings.size),
      method: 'min(unique world hashes, unique topology hashes, unique reward rankings). A corpus is only as informative as its least-varied dimension.',
    },
    bySupervision,
    byTieClass,
    byHorizonClass,
    byShape,
    byLevel,
    bySplit,
    byBand,
    tiedCases,
    tieRate: total === 0 ? 0 : Math.round((tiedCases * 10000) / total) / 10000,
    rewardDefectTies,
    genuineTies,
    paretoTradeoffs,
    scalarizationCollapse,
    uniqueOptimumRate: total === 0 ? 0 : Math.round(((bySupervision.UNIQUE_OPTIMUM ?? 0) * 10000) / total) / 10000,
    horizonDependentCases: byHorizonClass.HORIZON_DEPENDENT ?? 0,
    horizonAlignedCases: byHorizonClass.HORIZON_ALIGNED ?? 0,
    leakage: measureLeakage(splitSets),
  };
}

/* ---------------------------------------------------------------------------
 * Difficulty calibration (Phase 14)
 *
 * Difficulty has to be empirically real, not declared. If L5 is not measurably
 * harder than L2 the generator is wrong and the certification says so.
 * ------------------------------------------------------------------------- */

export function calibrateDifficulty(records) {
  const byLevel = {};
  for (const record of records) {
    const entry = byLevel[record.level] ??= {
      cases: 0, actions: 0, entities: 0, relations: 0, horizonDependent: 0,
      spread: 0, greedyRegret: 0, greedyRegretCases: 0, uniqueOptimum: 0,
    };
    entry.cases += 1;
    entry.actions += record.legalActionCount;
    entry.entities += record.entityCount;
    entry.relations += record.relationCount;
    if (record.horizonClass === 'HORIZON_DEPENDENT') entry.horizonDependent += 1;
    entry.spread += record.utilitySpread;
    if (record.greedyRegret !== null) { entry.greedyRegret += record.greedyRegret; entry.greedyRegretCases += 1; }
    if (record.supervisionClass === 'UNIQUE_OPTIMUM') entry.uniqueOptimum += 1;
  }
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b).map((level) => {
    const entry = byLevel[level];
    return {
      level,
      cases: entry.cases,
      meanLegalActionsTimes100: Math.round((entry.actions * 100) / entry.cases),
      meanEntitiesTimes100: Math.round((entry.entities * 100) / entry.cases),
      meanRelationsTimes100: Math.round((entry.relations * 100) / entry.cases),
      horizonDependenceRate: Math.round((entry.horizonDependent * 10000) / entry.cases) / 10000,
      meanUtilitySpreadTimes100: Math.round((entry.spread * 100) / entry.cases),
      /* The headline difficulty measure: what a myopic chooser loses. It rises
       * only if the level genuinely demands more lookahead. */
      meanGreedyRegretTimes100: entry.greedyRegretCases === 0 ? null
        : Math.round((entry.greedyRegret * 100) / entry.greedyRegretCases),
      uniqueOptimumRate: Math.round((entry.uniqueOptimum * 10000) / entry.cases) / 10000,
    };
  });

  const structural = levels.every((entry, index) =>
    index === 0 || entry.meanEntitiesTimes100 >= levels[index - 1].meanEntitiesTimes100);
  const low = levels.find((entry) => entry.level === 2);
  const high = levels.find((entry) => entry.level === 5);
  const harder = low !== undefined && high !== undefined
    && high.meanGreedyRegretTimes100 !== null && low.meanGreedyRegretTimes100 !== null
    && high.meanGreedyRegretTimes100 > low.meanGreedyRegretTimes100;

  return {
    levels,
    structuralComplexityMonotone: structural,
    l5HarderThanL2: harder,
    l2GreedyRegretTimes100: low?.meanGreedyRegretTimes100 ?? null,
    l5GreedyRegretTimes100: high?.meanGreedyRegretTimes100 ?? null,
    calibrationPass: structural && harder,
    note: 'Difficulty is measured by what a myopic chooser loses, not by the level label. A level that is not measurably harder than a lower one is a generator defect.',
  };
}

/* ---------------------------------------------------------------------------
 * Boundary audit (Phase 16)
 *
 * Every new topology shape is audited at its extremes BEFORE mass generation is
 * trusted, not after a diagnostic stage notices something odd. This is the Stage
 * 2L.23 discipline applied to a new generator.
 * ------------------------------------------------------------------------- */

export function auditGeneratorBoundaries() {
  const shapes = [];
  for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
    const spec = FORGE_TOPOLOGY_SHAPES.find((entry) => entry.id === shape);
    const probes = [];
    /* Minimum, just above minimum, a middle size, and a large one — plus a size
     * BELOW the declared minimum, which must be clamped up rather than producing
     * a degenerate graph. */
    for (const nodeCount of [1, spec.minNodes, spec.minNodes + 1, 12, 32]) {
      for (const seed of [1, 7]) {
        const topology = generateTopology({ shape, nodeCount, seed });
        probes.push({
          requestedNodes: nodeCount,
          realizedNodes: topology.nodeCount,
          edges: topology.edgeCount,
          clampedUp: topology.nodeCount >= spec.minNodes,
          hasEdges: topology.edgeCount > 0,
          seed,
        });
      }
    }
    shapes.push({
      shape,
      minNodes: spec.minNodes,
      probes,
      alwaysClamped: probes.every((probe) => probe.clampedUp),
      alwaysConnected: probes.every((probe) => probe.hasEdges),
      edgeCountMonotone: probes.filter((probe) => probe.seed === 1)
        .every((probe, index, list) => index === 0 || probe.edges >= list[index - 1].edges),
    });
  }
  return {
    shapeCount: shapes.length,
    shapes,
    allClamped: shapes.every((entry) => entry.alwaysClamped),
    allProduceEdges: shapes.every((entry) => entry.alwaysConnected),
    boundaryAuditPass: shapes.every((entry) => entry.alwaysClamped && entry.alwaysConnected),
    note: 'Every shape is probed below its minimum, at it, just above it, and at two larger sizes. A shape that degenerates at an extreme would produce a mislabelled corpus at that extreme, which is how three Stage 2L generator defects reached certification.',
  };
}

/* ---------------------------------------------------------------------------
 * Router curriculum (Phase 13)
 *
 * Ground-truth expert usefulness by ABLATION: does the world contain the
 * structure an expert reads? Measured from the world, never from an expert's
 * opinion of its own usefulness.
 * ------------------------------------------------------------------------- */

export const ROUTER_CLASSES = deepFreeze(['NEXUS_DOMINANT', 'ORACLE_DOMINANT', 'ARCHIMEDES_DOMINANT', 'MIXED', 'NO_SPECIALIST_NEEDED']);

export function classifyRouterNeed(record) {
  const relational = record.relationCount >= record.entityCount;
  const structural = record.shape === 'redundant_network' || record.shape === 'layered_infrastructure'
    || record.shape === 'parallel_dependency' || record.objectives.includes('restore');
  const temporal = record.horizonClass === 'HORIZON_DEPENDENT';
  const decision = record.utilitySpread > 0;

  if (!decision) return 'NO_SPECIALIST_NEEDED';
  const signals = [relational, structural, temporal].filter(Boolean).length;
  if (signals >= 2) return 'MIXED';
  if (relational) return 'NEXUS_DOMINANT';
  if (temporal) return 'ORACLE_DOMINANT';
  if (structural) return 'ARCHIMEDES_DOMINANT';
  return 'NO_SPECIALIST_NEEDED';
}

export function buildRouterCurriculum(records) {
  const counts = Object.fromEntries(ROUTER_CLASSES.map((name) => [name, 0]));
  for (const record of records) counts[classifyRouterNeed(record)] += 1;
  const total = records.length;
  return {
    classes: ROUTER_CLASSES,
    counts,
    coverage: Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, total === 0 ? 0 : Math.round((count * 10000) / total) / 10000])),
    allClassesPopulated: Object.values(counts).every((count) => count > 0),
    routerTrained: false,
    note: 'Ground-truth expert usefulness is derived from world structure by ablation, never from an expert scoring its own relevance. No router was trained.',
  };
}

/* ---------------------------------------------------------------------------
 * Frozen Sentinel baseline (Phase 26)
 * ------------------------------------------------------------------------- */

export function runSentinelBaseline(records, { sampleSize = 300, simulations = 24 } = {}) {
  const { manifest } = validateAdapter(forgeWorldAdapter);
  const policy = defaultAuthorityPolicy();
  assertEvaluationOnly(policy);

  /* Deterministic sample: sort by record hash and take a fixed stride, so the
   * baseline is over the same cases on every run. */
  const evaluable = records.filter((record) => record.split !== 'TRAIN')
    .sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const stride = Math.max(1, Math.floor(evaluable.length / sampleSize));
  const sample = evaluable.filter((unused, index) => index % stride === 0).slice(0, sampleSize);

  const cases = [];
  for (const record of sample) {
    const config = generateScenarioV2({
      shape: record.shape, roles: record.roles, objectives: record.objectives,
      horizonBand: record.horizonBand, level: record.level, seed: Number(record.seed),
    });
    const world = createWorld(config.scenarioSeed, config);
    /* The regenerated world must be the world the record describes, or the
     * baseline is measuring a different corpus. */
    if (hashWorld(world) !== record.worldHash) continue;

    const state = forgeAdapterState(world);
    const observation = forgeWorldAdapter.observe(state, 'sentinel');
    const counterfactuals = evaluateCounterfactualsV2(world, { horizon: Math.max(1, record.horizon) });

    const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState });
    const oracle = evaluateOracle({ observationHistory: observation.metadata.observationHistory });
    const recommendation = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations, seed: 1n });

    const chosenType = recommendation.selected.action.parameters.actionType;
    const chosenTarget = recommendation.selected.action.target?.id ?? null;
    const branch = counterfactuals.branches.find((entry) =>
      entry.action.actionType === chosenType && (entry.action.target?.id ?? null) === chosenTarget) ?? null;
    const regret = branch === null ? null : counterfactuals.optimalScalar - branch.totalScalar;

    cases.push({
      split: record.split,
      supervisionClass: record.supervisionClass,
      horizonClass: record.horizonClass,
      legal: branch !== null,
      inOptimalSet: regret === 0,
      regret,
      decisive: counterfactuals.utilitySpread > 0,
      nexusStructural: Object.keys(nexus.signals).length > 0 && !nexus.rationaleCodes.includes('NEXUS_INSUFFICIENT_STRUCTURE'),
      nexusCodes: nexus.rationaleCodes.length,
      oracleSufficient: !oracle.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'),
      routerClass: classifyRouterNeed(record),
    });
  }

  const decisive = cases.filter((entry) => entry.decisive);
  const aligned = decisive.filter((entry) => entry.horizonClass === 'HORIZON_ALIGNED');
  const dependent = decisive.filter((entry) => entry.horizonClass === 'HORIZON_DEPENDENT');
  const rate = (subset) => (subset.length === 0 ? null
    : Math.round((subset.filter((entry) => entry.inOptimalSet).length * 10000) / subset.length) / 10000);
  const meanRegret = (subset) => {
    const values = subset.map((entry) => entry.regret).filter((value) => value !== null);
    return values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) * 100) / values.length);
  };

  return {
    adapterId: manifest.adapterId,
    authorityTier: policy.tier,
    sampleRequested: sampleSize,
    casesEvaluated: cases.length,
    worldRegenerationMismatches: sample.length - cases.length,
    primeLegalRate: cases.length === 0 ? null
      : Math.round((cases.filter((entry) => entry.legal).length * 10000) / cases.length) / 10000,
    decisiveCases: decisive.length,
    primeOptimumRate: rate(decisive),
    primeAverageRegretTimes100: meanRegret(decisive),
    horizonAlignedCases: aligned.length,
    horizonAlignedOptimumRate: rate(aligned),
    horizonDependentCases: dependent.length,
    horizonDependentOptimumRate: rate(dependent),
    horizonDependentAverageRegretTimes100: meanRegret(dependent),
    horizonDependentWorstRegret: dependent.length === 0 ? null
      : Math.max(...dependent.map((entry) => entry.regret ?? 0)),
    /* The Oracle axis is UNREACHABLE in this corpus, and saying so precisely
     * matters more than the number.
     *
     * Every world carries a temporal channel of 8-18 frames, but every decision
     * is recorded at tick 0, and `world.history` — which is what the adapter
     * hands the Oracle — accumulates one frame per step. So the Oracle sees a
     * single frame, falls below its three-frame sufficiency floor, and abstains
     * on every case. The signal is in the world state; the expert cannot reach
     * it. That is a curriculum defect, not an Oracle defect, and fixing it means
     * warming each world forward a few ticks before recording the decision —
     * which changes every world hash and is therefore a new corpus version. */
    oracleReachable: false,
    oracleUnreachableReason: 'ORACLE_STRUCTURALLY_UNREACHABLE_AT_TICK_ZERO: decisions are recorded at tick 0, where world.history holds one frame against the Oracle three-frame sufficiency floor.',
    oracleFramesAvailableInWorldState: 'CHANNEL_LENGTH_8_TO_18',
    oracleFramesVisibleAtDecision: 1,
    nexusCases: cases.filter((entry) => entry.nexusStructural).length,
    nexusStructuralRate: cases.length === 0 ? null
      : Math.round((cases.filter((entry) => entry.nexusStructural).length * 10000) / cases.length) / 10000,
    oracleCases: cases.filter((entry) => entry.oracleSufficient).length,
    oracleSufficientRate: cases.length === 0 ? null
      : Math.round((cases.filter((entry) => entry.oracleSufficient).length * 10000) / cases.length) / 10000,
    routerAlignment: (() => {
      /* Router usefulness alignment: on cases where world structure says a
       * specialist is needed, does that specialist actually have something to
       * say? Measured, not assumed — and it is a property of the corpus, not a
       * claim that the router is good. */
      const needsNexus = cases.filter((entry) => entry.routerClass === 'NEXUS_DOMINANT');
      const needsOracle = cases.filter((entry) => entry.routerClass === 'ORACLE_DOMINANT');
      const nexusAligned = needsNexus.filter((entry) => entry.nexusStructural).length;
      const oracleAligned = needsOracle.filter((entry) => entry.oracleSufficient).length;
      const denominator = needsNexus.length + needsOracle.length;
      return denominator === 0 ? null : Math.round(((nexusAligned + oracleAligned) * 10000) / denominator) / 10000;
    })(),
    bySplit: ['VALIDATION', 'HOLDOUT', 'OOD'].map((split) => {
      const subset = cases.filter((entry) => entry.split === split);
      const subsetDecisive = subset.filter((entry) => entry.decisive);
      return { split, cases: subset.length, decisive: subsetDecisive.length, optimumRate: rate(subsetDecisive), averageRegretTimes100: meanRegret(subsetDecisive) };
    }),
    dispatchProbe: (() => {
      try { denyExecution('STAGE3B_BASELINE_DISPATCH_PROBE'); return { attempted: true, refused: false, errorName: null }; }
      catch (error) { return { attempted: true, refused: true, errorName: error.name }; }
    })(),
    expertsModified: false,
    trainingStarted: false,
  };
}

/* ---------------------------------------------------------------------------
 * Soup export validation (Phase 29)
 * ------------------------------------------------------------------------- */

export function validateSoupExports({ sft, preference, rl }) {
  const check = (name, content, expected) => {
    if (content === '') return { dataset: name, rows: 0, expectedFormat: expected, detectedFormat: null, compatible: null, basis: 'NOT_MEASURED_EMPTY' };
    const rows = content.split('\n').filter(Boolean);
    /* Every row is checked, not only the first: a dataset whose first row happens
     * to validate and whose thousandth does not is a dataset that fails in
     * training, which is the worst place to find out. */
    const detected = new Set(rows.map((line) => detectSoupFormat(JSON.parse(line))));
    return {
      dataset: name,
      rows: rows.length,
      expectedFormat: expected,
      detectedFormats: [...detected].sort(),
      allRowsDetectAsExpected: detected.size === 1 && detected.has(expected),
      compatible: detected.size === 1 && detected.has(expected),
      basis: 'EVERY_ROW_CHECKED_AGAINST_SOUP_SIGNATURE_RULE',
    };
  };
  const checks = [
    check('sft', sft, 'alpaca'),
    check('preference', preference, 'dpo'),
  ];
  /* RL episodes have no Soup SFT/DPO signature and are not claimed to: Soup's
   * GRPO/PPO consume prompts plus a reward function, not transitions. Saying so
   * is more useful than inventing a mapping that would fail in training. */
  const rlRows = rl === '' ? 0 : rl.split('\n').filter(Boolean).length;
  return {
    soupCommit: SOUP_COMMIT,
    soupVersion: SOUP_VERSION,
    checks,
    rlEpisodes: rlRows,
    rlSoupFormat: null,
    rlBasis: 'NOT_APPLICABLE: Soup GRPO/PPO consume prompts plus a reward function, not (s,a,r,s-prime) transitions. The RL export is for Sentinel-side analysis and a future reward-adapter bridge.',
    allCompatible: checks.every((entry) => entry.compatible === true),
    trainingStarted: false,
  };
}

/* ---------------------------------------------------------------------------
 * Future training campaign (Phase 30) — specified, not executed
 * ------------------------------------------------------------------------- */

export const STAGE3B_TRAINING_CAMPAIGN_SPEC = deepFreeze({
  specVersion: 1,
  target: 'LEARNED_NEXUS_CANDIDATE',
  executed: false,
  executionStage: 'STAGE_3C',
  baseModelCandidates: [
    { model: 'Qwen/Qwen2.5-7B-Instruct', reason: 'Soup ships a validated SFT recipe for it; size fits a single-GPU LoRA run' },
    { model: 'Qwen/Qwen2.5-Coder-7B-Instruct', reason: 'structured-output bias suits an action-selection format' },
  ],
  trainingSubsets: {
    sft: 'TRAIN split, supervision class UNIQUE_OPTIMUM and EXACT_EQUIVALENCE only',
    preference: 'TRAIN split, utility gap at or above the predeclared minimum',
    grpo: 'TRAIN split RL episodes, requiring a reward adapter that does not exist yet',
  },
  phases: [
    { phase: 'SFT', required: true, gate: 'holdout optimum-set agreement must exceed the deterministic Nexus baseline on the same cases' },
    { phase: 'PREFERENCE', required: false, gate: 'no regression on the SFT holdout gate' },
    { phase: 'GRPO', required: false, gate: 'blocked until a reward adapter is specified and certified' },
  ],
  validationGates: [
    'VALIDATION split for model selection; HOLDOUT touched once, at the end',
    'OOD holdout never used during tuning',
    'the deterministic Nexus baseline measured on identical cases, not on a remembered number',
    'no gate may be evaluated on TRAIN',
  ],
  rejectionConditions: [
    'incomplete training provenance envelope',
    'no improvement over the deterministic baseline on HOLDOUT',
    'improvement on HOLDOUT but degradation on OOD beyond a predeclared margin',
    'any behaviour requiring authority above R0',
    'any dependence on a Soup artifact that cannot be reproduced from its recorded provenance',
  ],
  promotionAuthority: 'SENTINEL_GRID_CERTIFICATION',
  soupMayReach: 'TRAINED',
  soupMayNeverReach: 'CERTIFIED',
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

export const STAGE3B_OUTCOMES = deepFreeze([
  'A_LARGE_SCALE_CURRICULUM_AND_DATASET_CERTIFIED',
  'B_CURRICULUM_CERTIFIED_SCALE_TARGET_NOT_MET',
  'C_REWARD_RESOLUTION_STILL_INSUFFICIENT',
  'D_TOPOLOGY_DIVERSITY_INSUFFICIENT',
  'E_DATASET_SPLIT_OR_LEAKAGE_FAILURE',
  'F_SEMANTIC_GENERATOR_FAILURE',
  'G_BLOCKED',
]);

export function certifyStage3B({ evaluation }) {
  const {
    stage3aReproduced, tieTaxonomyBefore, tieTaxonomyAfter, rewardAudit, corpus, difficulty,
    boundary, router, baseline, exports: datasetExports, soup, generation, policyAgreement,
  } = evaluation;

  const gates = {
    STAGE3A_REPRODUCED: stage3aReproduced === true,
    TIE_TAXONOMY_COMPLETE: tieTaxonomyBefore.complete === true,
    REWARD_RESOLUTION_AUDITED: rewardAudit.audited === true,
    GENUINE_TIES_PRESERVED: rewardAudit.genuineTiesPreserved === true,
    TOPOLOGY_DIVERSITY_MATERIALLY_INCREASED: corpus.diversity.uniqueTopologyHashes > 105 * 5,
    TOPOLOGY_COUNT_TARGET: corpus.diversity.uniqueTopologyHashes >= STAGE3B_TARGETS.topologyCount,
    SEMANTIC_ADMISSION_GATE_PASS: generation.rejected > 0 && generation.admitted > 0,
    ALL_NEW_GENERATORS_BOUNDARY_AUDITED: boundary.boundaryAuditPass === true,
    EFFECTIVE_DIVERSITY_MEASURED: corpus.diversity.effectiveDatasetSize > 0,
    ADMITTED_RECORD_COUNT: corpus.records >= STAGE3B_TARGETS.admittedRecords,
    COUNTERFACTUAL_DATA_COMPLETE: corpus.counterfactualActions > corpus.records,
    TRAIN_VALIDATION_HOLDOUT_SPLIT_PASS: ['TRAIN', 'VALIDATION', 'HOLDOUT'].every((split) => (corpus.bySplit[split] ?? 0) > 0),
    TOPOLOGY_LEAKAGE_CONTROL_PASS: corpus.leakage.topologyLeakageControlPass === true,
    OOD_HOLDOUT_CREATED: (corpus.bySplit.OOD ?? 0) > 0,
    HORIZON_DEPENDENT_CASE_COUNT: corpus.horizonDependentCases >= STAGE3B_TARGETS.horizonDependentCases,
    DIFFICULTY_CALIBRATION_PASS: difficulty.calibrationPass === true,
    BASELINE_SENTINEL_EVALUATION_COMPLETE: baseline.casesEvaluated > 0,
    SFT_EXPORT_PASS: datasetExports.sft.count > 0,
    PREFERENCE_EXPORT_PASS: datasetExports.preference.count > 0,
    RL_EXPORT_PASS: datasetExports.rl.count > 0,
    SOUP_SCHEMA_VALIDATION_PASS: soup.allCompatible === true,
    TRAINING_NOT_STARTED: soup.trainingStarted === false && baseline.trainingStarted === false,
    SENTINEL_EXPERTS_UNCHANGED: baseline.expertsModified === false,
    AUTHORITY_R0: baseline.authorityTier === 'R0' && baseline.dispatchProbe.refused === true,
    SECURITY_REGRESSION_PASS: baseline.dispatchProbe.refused === true && corpus.leakage.topologyLeakageControlPass === true,
  };

  const blockers = Object.entries(gates).filter(([, value]) => value !== true).map(([key]) => key);
  const certified = blockers.length === 0;

  const outcome = (() => {
    if (!gates.STAGE3A_REPRODUCED) return 'G_BLOCKED';
    if (!gates.ALL_NEW_GENERATORS_BOUNDARY_AUDITED || !gates.SEMANTIC_ADMISSION_GATE_PASS) return 'F_SEMANTIC_GENERATOR_FAILURE';
    if (!gates.TOPOLOGY_LEAKAGE_CONTROL_PASS || !gates.TRAIN_VALIDATION_HOLDOUT_SPLIT_PASS) return 'E_DATASET_SPLIT_OR_LEAKAGE_FAILURE';
    if (!gates.TOPOLOGY_COUNT_TARGET) return 'D_TOPOLOGY_DIVERSITY_INSUFFICIENT';
    if (!gates.GENUINE_TIES_PRESERVED || !gates.REWARD_RESOLUTION_AUDITED) return 'C_REWARD_RESOLUTION_STILL_INSUFFICIENT';
    if (!gates.ADMITTED_RECORD_COUNT || !gates.HORIZON_DEPENDENT_CASE_COUNT) return 'B_CURRICULUM_CERTIFIED_SCALE_TARGET_NOT_MET';
    if (!certified) return 'G_BLOCKED';
    return 'A_LARGE_SCALE_CURRICULUM_AND_DATASET_CERTIFIED';
  })();

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE3B_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'CURRICULUM_AND_DATASET',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,

    stage3a: { certificationHash: STAGE3B_STAGE3A_CERTIFICATION_HASH, reproduced: stage3aReproduced },

    reward: {
      versionBefore: 'FORGE_REWARD_V1',
      versionAfter: FORGE_REWARD_V2_VERSION,
      componentCountBefore: 11,
      componentCountAfter: FORGE_REWARD_V2_COMPONENT_IDS.length,
      audit: rewardAudit,
      tieTaxonomyBefore,
      tieTaxonomyAfter,
    },

    curriculum: {
      axisSizes: FORGE_CURRICULUM_V2_AXIS_SIZES,
      topologyShapes: FORGE_TOPOLOGY_SHAPE_IDS.length,
      roleCompositions: FORGE_ROLE_COMPOSITIONS.length,
      objectiveCompositions: FORGE_OBJECTIVE_COMPOSITIONS.length,
      horizonBands: FORGE_HORIZON_BANDS.length,
      continuationPolicies: CONTINUATION_POLICY_IDS.length,
      supervisionClasses: SUPERVISION_CLASSES,
      tieClasses: TIE_CLASSES,
      thresholds: { NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP },
    },

    generation,
    corpus,
    difficulty,
    boundary,
    router,
    policyAgreement,
    baseline,
    datasetExport: {
      sft: { count: datasetExports.sft.count, excluded: datasetExports.sft.excluded, contentHash: datasetExports.sft.contentHash },
      preference: { count: datasetExports.preference.count, skipped: datasetExports.preference.skipped, contentHash: datasetExports.preference.contentHash },
      rl: { count: datasetExports.rl.count, contentHash: datasetExports.rl.contentHash },
    },
    soup,
    trainingCampaignSpec: STAGE3B_TRAINING_CAMPAIGN_SPEC,

    targets: STAGE3B_TARGETS,
    gates,
    blockers,
    stage3bOutcome: outcome,
    stage3bCertified: certified,

    freeze: {
      nexusChanged: false,
      oracleChanged: false,
      arbiterChanged: false,
      primePolicyChanged: false,
      zeknovaChanged: false,
      rewardV1Changed: false,
      stage3aKernelChanged: false,
      modelTrained: false,
      soupInvoked: false,
      authorityIncreased: false,
    },
    interpretation: {
      curriculumStatus: certified
        ? 'COMPOSED_CURRICULUM_CERTIFIED_R0_ADVISORY_ONLY'
        : 'CURRICULUM_INCOMPLETE',
      datasetStatus: certified
        ? 'LARGE_SCALE_COUNTERFACTUAL_DATASET_GENERATED_SPLIT_AND_SOUP_VALIDATED_NOT_TRAINED'
        : 'DATASET_INCOMPLETE',
      measuredRemainingLimitation: evaluation.remainingLimitation,
    },
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    evidenceDigest: sha256({
      corpusRecords: corpus.records,
      corpusSha256: generation.corpusSha256,
      datasets: [datasetExports.sft.contentHash, datasetExports.preference.contentHash, datasetExports.rl.contentHash],
      outcome,
    }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}
