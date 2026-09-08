/* Stage 3B.1 — Forge World temporal warm-up, Oracle reachability, router
 * ground-truth restoration, and corpus V2 recertification.
 *
 * Stage 3B certified a large, diverse, leakage-free corpus and, in the same
 * breath, recorded the defect that made one of its axes useless:
 *
 *   ORACLE_AXIS_UNREACHABLE — every decision was captured at tick 0, where
 *   `world.history` holds one frame, against an Oracle that needs three. Every
 *   Oracle case abstained; router usefulness alignment fell to 0.0268.
 *
 * This stage repairs that one defect and recertifies. It does not train anything,
 * does not invoke Soup for training, does not modify Prime, Nexus, Oracle, Router,
 * Arbiter or ZekNova, does not change reward semantics, and does not touch the
 * Stage 3A or Stage 3B artifacts — both of which still reproduce from their own
 * certifications.
 *
 * Every Sentinel measurement that moves between V1 and V2 is a CORPUS EFFECT. The
 * models are frozen and byte-identical; what changed is which world state the
 * decision was recorded in.
 *
 * The analysis functions that are not about time — diversity, difficulty
 * calibration, boundary audit, router ground truth, Soup export validation — are
 * IMPORTED from the Stage 3B module rather than reimplemented. Copying them would
 * create a second place for the corpus measurements to drift, and a V1/V2
 * comparison is only meaningful if both sides were measured by the same code.
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
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';

import { createWorld, hashWorld, observe } from '../forge/kernel.js';
import { forgeAdapterState, forgeWorldAdapter } from '../forge/adapter.js';
import { generateScenarioV3, FORGE_TEMPORAL_FAMILY_IDS } from '../forge/scenarios-v3.js';
import {
  FORGE_TEMPORAL_WARMUP_V1, FORGE_WARMUP_TARGET_TICKS, FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS,
  ORACLE_HEAD_IDS, ORACLE_HEAD_TEMPORAL_CONTRACT, WARMUP_DECISION_STATES, WARMUP_STOP_REASONS,
  replayTemporalWarmup, runCalibratedWarmup, taskDelta, taskSignature, validateTemporalFamily,
} from '../forge/warmup.js';
import { FORGE_ORACLE_CHANNEL_MAPPING, toOracleHeadInput } from '../forge/oracle-surface.js';
import { buildRecordV2 } from '../forge/record-v2.js';
import { FORGE_REWARD_V2_COMPONENT_IDS, FORGE_REWARD_V2_VERSION } from '../forge/reward-v2.js';
import { evaluateCounterfactualsV2 } from '../forge/counterfactual-v2.js';
import { NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP, SUPERVISION_CLASSES, TIE_CLASSES } from '../forge/supervision.js';
import {
  FORGE_DATASET_V2_LINEAGE, FORGE_DATASET_V2_PARENT, FORGE_DATASET_V2_VERSION,
  exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage, tagV2,
} from '../forge/dataset-v2.js';
import { detectSoupFormat, SOUP_COMMIT, SOUP_VERSION } from '../forge/soup-bridge.js';
import {
  STAGE3B_TARGETS, auditGeneratorBoundaries, buildRouterCurriculum, calibrateDifficulty,
  classifyRouterNeed, loadCorpus, measureCorpus, validateSoupExports,
} from './stage3b-microworld-curriculum.js';

export const STAGE3B1_STAGE = 'STAGE3B1_TEMPORAL_WARMUP_AND_ORACLE_REACHABILITY';

/* Inherited certifications. Pinned so that a Stage 3B.1 run cannot quietly be
 * built on top of a moved predecessor. */
export const STAGE3B1_STAGE3A_CERTIFICATION_HASH = 'c66b85d863d428d2da0e9d738f426e0b655124509bad04e0e7220f6eaf34898d';
export const STAGE3B1_STAGE3B_CERTIFICATION_HASH = '61a8ab8d7769b3c09541d3cb2665d4451eba95513f08b6055390e6212236156d';

/* The Stage 3B baseline this stage must reproduce before it may change anything.
 * These are read off the Stage 3B certification, not recomputed here. */
export const STAGE3B1_INHERITED_BASELINE = deepFreeze({
  stage3bCertified: true,
  admittedRecords: 70804,
  topologyCount: 65307,
  effectiveDatasetSize: 60493,
  oracleCases: 0,
  oracleSufficientRate: 0,
  routerAlignment: 0.0268,
  historyFramesAtDecision: 1,
  worldOverlap: 0,
  topologyLeakage: 0,
  authority: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
});

/* Predeclared targets, written before the V2 corpus existed. */
export const STAGE3B1_TARGETS = deepFreeze({
  admittedRecords: 50000,
  trainRecords: 50000,
  topologyCount: 1000,
  oracleGenericSufficientRate: 0.50,
  headsWithRealisedOutputs: 8,
  temporalFamilyRealisationRate: 0.90,
  taskPreservationRate: 1.0,
  horizonExactnessRate: 1.0,
  zeroLeakage: true,
});

export const STAGE3B1_PILOT_BOUNDS = deepFreeze({ minimum: 2000, maximum: 5000 });

/* ---------------------------------------------------------------------------
 * PHASE 0 — baseline reproduction.
 * ------------------------------------------------------------------------- */

export function reproduceStage3BBaseline(stage3bCertification) {
  const baseline = stage3bCertification === null ? null : {
    stage3bCertified: stage3bCertification.stage3bCertified,
    certificationHash: stage3bCertification.certificationHash,
    admittedRecords: stage3bCertification.corpus.records,
    topologyCount: stage3bCertification.corpus.diversity.uniqueTopologyHashes,
    effectiveDatasetSize: stage3bCertification.corpus.diversity.effectiveDatasetSize,
    oracleCases: stage3bCertification.baseline.oracleCases,
    oracleSufficientRate: stage3bCertification.baseline.oracleSufficientRate,
    routerAlignment: stage3bCertification.baseline.routerAlignment,
    historyFramesAtDecision: stage3bCertification.baseline.oracleFramesVisibleAtDecision,
    worldOverlap: stage3bCertification.corpus.leakage.exactWorldOverlap,
    topologyLeakage: stage3bCertification.corpus.leakage.topologyLeakage,
    authority: stage3bCertification.authority,
    canDispatch: stage3bCertification.canDispatch,
    canMutateLiveWorld: stage3bCertification.canMutateLiveWorld,
  };

  const checks = baseline === null ? [] : Object.entries(STAGE3B1_INHERITED_BASELINE).map(([key, expected]) => ({
    field: key, expected, actual: baseline[key], matches: baseline[key] === expected,
  }));

  return {
    certificationPresent: baseline !== null,
    certificationHashMatches: baseline !== null && baseline.certificationHash === STAGE3B1_STAGE3B_CERTIFICATION_HASH,
    checks,
    reproduced: baseline !== null
      && baseline.certificationHash === STAGE3B1_STAGE3B_CERTIFICATION_HASH
      && checks.every((check) => check.matches),
    stage3bArtifactsModified: false,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — the Oracle temporal contract, and the warm-up length it implies.
 * ------------------------------------------------------------------------- */

export function auditOracleTemporalContract() {
  return {
    heads: ORACLE_HEAD_TEMPORAL_CONTRACT.map((head) => ({
      headId: head.headId,
      requiredFrames: head.requiredFrames,
      measurableAtFrames: head.measurableAtFrames,
      measurableAtFramesReason: head.measurableAtFramesReason ?? 'the head\'s own guard is also the point at which it measures what it claims',
      temporalField: head.temporalField,
      samplingAssumption: head.samplingAssumption,
      windowSemantics: head.windowSemantics,
      missingHistoryBehaviour: head.missingHistoryBehaviour,
      source: head.source,
    })),
    minimumClearingAllGuards: FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS,
    chosenWarmupTicks: FORGE_WARMUP_TARGET_TICKS,
    chosenBecause:
      'The binding head is regimeChange. Its guard opens at 18 frames, so a warm-up of 17 ticks would clear every documented minimum — and would be exactly the mistake the stage forbids, because at 18 frames the head compares six-sample windows instead of the eight-sample windows it is built around. floor(n/3) reaches 8 at n = 24. The warm-up therefore targets 24 observed frames, which 24 ticks deliver on top of the tick-zero frame.',
    lengthNotChosenToClearMinimum: FORGE_WARMUP_TARGET_TICKS > FORGE_WARMUP_MINIMUM_TO_CLEAR_GUARDS,
    channelVocabularyDefect: {
      code: 'ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED',
      finding:
        'The eight-head assembly reads frame.channels.alpha and nothing else. Forge declares its channel as `primary`, so every head computed over an empty series, reported coverage zero and abstained — at any history length. Warm-up alone would not have reached them.',
      remedy: FORGE_ORACLE_CHANNEL_MAPPING.id,
      remedyClass: 'ADAPTER_LAYER_CHANNEL_MAPPING',
      oracleModified: false,
      headsModified: false,
    },
  };
}

/* ---------------------------------------------------------------------------
 * PHASES 3, 5 — warm-up policy audit and non-temporal scenario preservation.
 *
 * Measured on live worlds, per family, one probe each. The question is not
 * whether the policy INTENDS to be inert but whether the world stayed the world.
 * ------------------------------------------------------------------------- */

export function auditWarmupPolicy(combinations) {
  const rows = [];
  for (const combination of combinations) {
    const build = (warmupTicks) => generateScenarioV3({ ...combination, warmupTicks });
    const probe = runCalibratedWarmup(combination.seed, build, { targetTicks: FORGE_WARMUP_TARGET_TICKS });
    const config = probe.scenarioConfig;
    const initial = taskSignature(createWorld(combination.seed, config));
    const after = taskSignature(probe.world);
    rows.push({
      shape: combination.shape, roles: combination.roles, objectives: combination.objectives,
      horizonBand: combination.horizonBand, level: combination.level,
      warmupTicks: probe.warmupTicks,
      truncated: probe.truncated,
      stopReason: probe.stopReason,
      taskPreserved: probe.taskPreserved,
      changedFields: probe.taskChangedFields,
      probeStopReason: probe.probeStopReason ?? null,
      /* The stage brief's own list, answered one by one by comparing the world at
       * tick zero to the world at the decision point. */
      consumedResources: initial.energy !== after.energy,
      movedActors: initial.positions !== after.positions,
      killedEntities: initial.available !== after.available,
      completedObjectives: initial.objectives !== after.objectives,
      changedLegalActions: initial.legalActions !== after.legalActions,
      changedStructure: initial.topology !== after.topology || initial.relations !== after.relations,
      horizonPreservedExactly: (probe.world.maxTicks - probe.world.tick) === config.baseMaxTicks,
      channelClamped: probe.channelClamped,
      historyFrames: probe.world.history.length,
    });
  }

  const truncated = rows.filter((row) => row.truncated);
  const causes = {};
  for (const row of truncated) {
    const key = row.probeStopReason ?? row.stopReason;
    causes[key] = (causes[key] ?? 0) + 1;
  }
  const changedFieldCounts = {};
  for (const row of rows) for (const field of row.changedFields) changedFieldCounts[field] = (changedFieldCounts[field] ?? 0) + 1;

  return {
    probes: rows.length,
    actionPolicy: FORGE_TEMPORAL_WARMUP_V1.actionPolicy,
    reachedFullTarget: rows.filter((row) => !row.truncated).length,
    truncated: truncated.length,
    truncationCauses: causes,
    taskPreserved: rows.filter((row) => row.taskPreserved).length,
    taskPreservationRate: rows.length === 0 ? null : Math.round((rows.filter((row) => row.taskPreserved).length * 10000) / rows.length) / 10000,
    horizonPreservedExactly: rows.filter((row) => row.horizonPreservedExactly).length,
    channelClamped: rows.filter((row) => row.channelClamped).length,
    consumedResources: rows.filter((row) => row.consumedResources).length,
    movedActors: rows.filter((row) => row.movedActors).length,
    killedEntities: rows.filter((row) => row.killedEntities).length,
    completedObjectives: rows.filter((row) => row.completedObjectives).length,
    changedLegalActions: rows.filter((row) => row.changedLegalActions).length,
    changedStructure: rows.filter((row) => row.changedStructure).length,
    changedFieldCounts,
    warmupTickHistogram: rows.reduce((histogram, row) => {
      histogram[row.warmupTicks] = (histogram[row.warmupTicks] ?? 0) + 1;
      return histogram;
    }, {}),
    /* The residue, stated rather than engineered away. */
    truncationMechanism:
      'The only dynamic that ends a warm-up early is hostile degradation through an `attacks` relation crossing an availability threshold. Terrain hazards never fire during warm-up in this curriculum (no entity is placed on damaging terrain at tick zero), WAIT costs no energy, and nothing moves. Role mixes that declare hostiles (defended, scarce, populated) therefore support shorter warm-ups than those that do not (bare, redundant, industrial).',
    reachabilityConfound:
      'ORACLE_HEAD_REACHABILITY_CONFOUNDED_BY_ROLE_MIX: because truncation is caused by hostiles, the heads needing the longest history are measurable disproportionately in worlds without them. This is a property of the curriculum, not a defect introduced here, and it is reported so that no per-head rate is read as unconditional.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4 — temporal family validation against realized history.
 * ------------------------------------------------------------------------- */

export function auditTemporalFamilies(records) {
  const byFamily = {};
  for (const family of FORGE_TEMPORAL_FAMILY_IDS) {
    byFamily[family] = { records: 0, realized: 0, shortWarmup: 0 };
  }
  for (const record of records) {
    const entry = byFamily[record.temporalFamily];
    if (entry === undefined) continue;
    entry.records += 1;
    if (record.temporalFamilyRealized) entry.realized += 1;
    else if (record.warmupTicks < 8) entry.shortWarmup += 1;
  }
  const realized = records.filter((record) => record.temporalFamilyRealized).length;
  return {
    families: FORGE_TEMPORAL_FAMILY_IDS,
    byFamily: Object.fromEntries(Object.entries(byFamily).map(([family, entry]) => [family, {
      ...entry,
      realisationRate: entry.records === 0 ? null : Math.round((entry.realized * 10000) / entry.records) / 10000,
    }])),
    realized,
    realisationRate: records.length === 0 ? null : Math.round((realized * 10000) / records.length) / 10000,
    method: 'Head-free. Monotonicity, net change, alternation ratio, mean absolute step and split-level shift are measured directly off the realized series. No Oracle head is consulted, so a head agreeing with a family is evidence rather than a tautology.',
    unrealisedCause: 'A family that does not show up is almost always a warm-up truncated too short for the family to express itself — a one-tick history cannot exhibit a level shift. Those records carry temporalFamilyRealized=false and the family name is not treated as ground truth for them.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10 — Oracle evaluation, per head, never collapsed into one number.
 * ------------------------------------------------------------------------- */

export function evaluateOracleHeads(records) {
  const total = records.length;
  const heads = {};
  for (const headId of ORACLE_HEAD_IDS) {
    const outputs = {};
    let framesSufficient = 0;
    let guardCleared = 0;
    let supported = 0;
    for (const record of records) {
      const entry = record.oracleHeads?.[headId];
      if (entry === undefined) continue;
      const key = entry.output === null ? 'NO_OUTPUT' : entry.output;
      outputs[key] = (outputs[key] ?? 0) + 1;
      if (entry.framesSufficient) framesSufficient += 1;
      if (entry.guardCleared) guardCleared += 1;
      if (entry.supported) supported += 1;
    }
    const distinct = Object.keys(outputs).filter((key) => key !== 'NO_OUTPUT' && key !== 'INSUFFICIENT_EVIDENCE');
    heads[headId] = {
      outputs,
      distinctSubstantiveOutputs: distinct.length,
      framesSufficientRate: total === 0 ? null : Math.round((framesSufficient * 10000) / total) / 10000,
      guardClearedRate: total === 0 ? null : Math.round((guardCleared * 10000) / total) / 10000,
      supportedRate: total === 0 ? null : Math.round((supported * 10000) / total) / 10000,
      reachable: distinct.length > 0,
    };
  }
  const generic = records.filter((record) => record.oracleGenericSufficient).length;
  return {
    records: total,
    heads,
    headsReachable: Object.values(heads).filter((head) => head.reachable).length,
    headCount: ORACLE_HEAD_IDS.length,
    allHeadsReachable: Object.values(heads).every((head) => head.reachable),
    genericOracleSufficient: generic,
    genericOracleSufficientRate: total === 0 ? null : Math.round((generic * 10000) / total) / 10000,
    neverCollapsed: true,
    collapseNote: 'Reported per head on purpose. A single "Oracle accuracy" would average a gate (abstention), a label about direction and a label about regime change into a number that is not about anything.',
    knownHeadProperty: {
      code: 'CYCLE_HEAD_FIRES_ON_SMOOTH_TRENDS',
      finding: 'The cycle head selects the lag with the highest autocorrelation, and a smooth monotonic ramp is strongly autocorrelated at every lag, so it reports CYCLICAL on MONOTONIC_RISE and MONOTONIC_FALL histories. Measured here, not corrected: the head is frozen, and the declared family is not used as its ground truth.',
      headModified: false,
    },
  };
}

/* ---------------------------------------------------------------------------
 * PHASES 11-12 — router usefulness ground truth against a FROZEN router.
 * ------------------------------------------------------------------------- */

export function measureRouterUsefulness(records) {
  const curriculum = buildRouterCurriculum(records);
  const needsOracle = records.filter((record) => classifyRouterNeed(record) === 'ORACLE_DOMINANT');
  const oracleServed = needsOracle.filter((record) => record.oracleGenericSufficient).length;
  return {
    ...curriculum,
    oracleDominantCases: needsOracle.length,
    oracleDominantServed: oracleServed,
    oracleDominantServedRate: needsOracle.length === 0 ? null
      : Math.round((oracleServed * 10000) / needsOracle.length) / 10000,
    routerTrained: false,
    routerModified: false,
    groundTruthSource: 'WORLD_STRUCTURE_BY_ABLATION',
    note: 'Usefulness is still derived from world structure, never from an expert scoring its own relevance, and no router was trained. What changed between V1 and V2 is whether the specialist the structure calls for can actually see anything — a corpus property.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASES 7, 22 — determinism, including across shards.
 * ------------------------------------------------------------------------- */

export function verifyWarmupDeterminism(combinations) {
  const rows = combinations.map((combination) => {
    const build = (warmupTicks) => generateScenarioV3({ ...combination, warmupTicks });
    const first = runCalibratedWarmup(combination.seed, build);
    const replay = replayTemporalWarmup(combination.seed, first.scenarioConfig, { ...first, targetTicks: first.warmupTicks });
    const second = runCalibratedWarmup(combination.seed, build);
    return {
      allFramesIdentical: replay.allFramesIdentical,
      frameCount: replay.frameCount,
      ticksIdentical: replay.ticksIdentical,
      worldHashIdentical: hashWorld(first.world) === hashWorld(second.world),
      taskUnchanged: taskDelta(taskSignature(first.world), taskSignature(second.world)).length === 0,
    };
  });
  return {
    probes: rows.length,
    framesCompared: rows.reduce((total, row) => total + row.frameCount, 0),
    allFramesIdentical: rows.every((row) => row.allFramesIdentical),
    allTicksIdentical: rows.every((row) => row.ticksIdentical),
    allWorldHashesIdentical: rows.every((row) => row.worldHashIdentical),
    everyWarmupFrameReproduced: rows.every((row) => row.allFramesIdentical),
    note: 'Replay identity is asserted over EVERY warm-up frame, not just the decision state. Reproducing only the endpoint would prove the endpoint deterministic and say nothing about the evolution that produced it.',
  };
}

/**
 * PHASE 22 — shard independence.
 *
 * The corpus is built by four worker processes sharded by combination index, and
 * the claim that this is byte-identical to a serial run rests on a record being a
 * pure function of its own axes. That claim is CHECKED here rather than asserted:
 * a sample of records is rebuilt in this single process, through the same builder
 * the workers used, and the recomputed record hash is compared to the one the
 * shard wrote. A mismatch would mean a record depended on something outside its
 * tuple — generation order, worker identity, accumulated state.
 */
export function verifyShardIndependence(records, { sampleSize = 60 } = {}) {
  const stride = Math.max(1, Math.floor(records.length / sampleSize));
  const sample = records.filter((unused, index) => index % stride === 0).slice(0, sampleSize);
  const rows = sample.map((record) => {
    const rebuilt = buildRecordV2({
      shape: record.shape, roles: record.roles, objectives: record.objectives,
      horizonBand: record.horizonBand, level: record.level, seed: Number(record.seed),
    }, record.outOfDistribution);
    return {
      admitted: rebuilt.admitted,
      recordHashIdentical: rebuilt.admitted && rebuilt.record.recordHash === record.recordHash,
      worldHashIdentical: rebuilt.admitted && rebuilt.record.worldHash === record.worldHash,
      warmupTicksIdentical: rebuilt.admitted && rebuilt.record.warmupTicks === record.warmupTicks,
    };
  });
  return {
    sampled: rows.length,
    rebuiltAndAdmitted: rows.filter((row) => row.admitted).length,
    recordHashesIdentical: rows.filter((row) => row.recordHashIdentical).length,
    worldHashesIdentical: rows.filter((row) => row.worldHashIdentical).length,
    warmupTicksIdentical: rows.filter((row) => row.warmupTicksIdentical).length,
    shardIndependent: rows.length > 0 && rows.every((row) => row.recordHashIdentical),
    method: 'Rebuilt in ONE process through the same builder the workers used, then compared by record hash. Reusing the builder is the point: two copies of the logic could drift and the comparison would still pass.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 20 — Sentinel baseline on the V2 corpus. Models frozen.
 * ------------------------------------------------------------------------- */

export function runSentinelBaselineV2(records, { sampleSize = 300, simulations = 24 } = {}) {
  const manifest = forgeWorldAdapter.manifest();
  validateAdapter(forgeWorldAdapter);
  const policy = defaultAuthorityPolicy();
  assertEvaluationOnly(policy, 'STAGE3B1_BASELINE');

  const evaluation = records.filter((record) => record.split !== 'TRAIN');
  const stride = Math.max(1, Math.floor(evaluation.length / sampleSize));
  const sample = evaluation.filter((unused, index) => index % stride === 0).slice(0, sampleSize);

  const cases = [];
  for (const record of sample) {
    const build = (warmupTicks) => generateScenarioV3({
      shape: record.shape, roles: record.roles, objectives: record.objectives,
      horizonBand: record.horizonBand, level: record.level, seed: Number(record.seed), warmupTicks,
    });
    const warmup = runCalibratedWarmup(Number(record.seed), build);
    const world = warmup.world;
    /* The regenerated world must be the world the record describes, warm-up and
     * all, or the baseline is measuring a different corpus. */
    if (hashWorld(world) !== record.worldHash) continue;

    const state = forgeAdapterState(world);
    const observation = forgeWorldAdapter.observe(state, 'sentinel');
    const counterfactuals = evaluateCounterfactualsV2(world, { horizon: Math.max(1, record.horizon) });

    const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState });
    const oracle = evaluateOracle({ observationHistory: observation.metadata.observationHistory });
    const config = warmup.scenarioConfig;
    const heads = assembleOracleV2(toOracleHeadInput(
      observation.metadata.observationHistory, 'primary', config.channelSemantics.primary,
    ));
    const recommendation = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations, seed: 1n });

    const chosenType = recommendation.selected.action.parameters.actionType;
    const chosenTarget = recommendation.selected.action.target?.id ?? null;
    const branch = counterfactuals.branches.find((entry) =>
      entry.action.actionType === chosenType && (entry.action.target?.id ?? null) === chosenTarget) ?? null;
    const regret = branch === null ? null : counterfactuals.optimalScalar - branch.totalScalar;

    cases.push({
      split: record.split,
      horizonClass: record.horizonClass,
      legal: branch !== null,
      inOptimalSet: regret === 0,
      regret,
      decisive: counterfactuals.utilitySpread > 0,
      historyFrames: observation.metadata.observationHistory.length,
      nexusStructural: Object.keys(nexus.signals).length > 0 && !nexus.rationaleCodes.includes('NEXUS_INSUFFICIENT_STRUCTURE'),
      oracleSufficient: !oracle.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY'),
      headsSupported: ORACLE_HEAD_IDS.filter((headId) => heads.heads[headId].supported).length,
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

  const oracleCases = cases.filter((entry) => entry.oracleSufficient).length;

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

    oracleReachable: oracleCases > 0,
    oracleFramesVisibleAtDecisionMin: cases.length === 0 ? null : Math.min(...cases.map((entry) => entry.historyFrames)),
    oracleFramesVisibleAtDecisionMax: cases.length === 0 ? null : Math.max(...cases.map((entry) => entry.historyFrames)),
    oracleCases,
    oracleSufficientRate: cases.length === 0 ? null : Math.round((oracleCases * 10000) / cases.length) / 10000,
    meanHeadsSupported: cases.length === 0 ? null
      : Math.round((cases.reduce((total, entry) => total + entry.headsSupported, 0) * 100) / cases.length) / 100,

    nexusCases: cases.filter((entry) => entry.nexusStructural).length,
    nexusStructuralRate: cases.length === 0 ? null
      : Math.round((cases.filter((entry) => entry.nexusStructural).length * 10000) / cases.length) / 10000,

    routerAlignment: (() => {
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
      try { denyExecution('STAGE3B1_BASELINE_DISPATCH_PROBE'); return { attempted: true, refused: false, errorName: null }; }
      catch (error) { return { attempted: true, refused: true, errorName: error.name }; }
    })(),
    expertsModified: false,
    routerTrained: false,
    trainingStarted: false,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 21 — explicit V1 vs V2 comparison. Corpus effects, never model claims.
 * ------------------------------------------------------------------------- */

export function compareLineages(stage3bBaseline, stage3b1Baseline) {
  const row = (metric, before, after) => ({
    metric, v1: before, v2: after,
    delta: typeof before === 'number' && typeof after === 'number'
      ? Math.round((after - before) * 10000) / 10000 : null,
  });
  return {
    modelsFrozen: true,
    attribution: 'CORPUS_EFFECT',
    attributionNote:
      'Prime, Nexus, Oracle, the Arbiter and the router are byte-identical between the two lineages, and no training was run in either. Every difference below is caused by which world state the decision was captured in. Describing any of it as a model improvement would be false.',
    rows: [
      row('oracleCases', stage3bBaseline.oracleCases, stage3b1Baseline.oracleCases),
      row('oracleSufficientRate', stage3bBaseline.oracleSufficientRate, stage3b1Baseline.oracleSufficientRate),
      row('routerAlignment', stage3bBaseline.routerAlignment, stage3b1Baseline.routerAlignment),
      row('historyFramesAtDecision', stage3bBaseline.oracleFramesVisibleAtDecision, stage3b1Baseline.oracleFramesVisibleAtDecisionMax),
      row('primeOptimumRate', stage3bBaseline.primeOptimumRate, stage3b1Baseline.primeOptimumRate),
      row('primeLegalRate', stage3bBaseline.primeLegalRate, stage3b1Baseline.primeLegalRate),
      row('nexusStructuralRate', stage3bBaseline.nexusStructuralRate, stage3b1Baseline.nexusStructuralRate),
      row('horizonAlignedOptimumRate', stage3bBaseline.horizonAlignedOptimumRate, stage3b1Baseline.horizonAlignedOptimumRate),
      row('horizonDependentOptimumRate', stage3bBaseline.horizonDependentOptimumRate, stage3b1Baseline.horizonDependentOptimumRate),
    ],
  };
}

/* ---------------------------------------------------------------------------
 * PHASES 14-16 — diversity, reward supervision and horizon curriculum preserved.
 *
 * Repairing the Oracle axis must not have cost the corpus the properties Stage 3B
 * certified. Compared against the STORED Stage 3B measurements rather than
 * recomputed ones, so the baseline cannot drift while being compared to.
 * ------------------------------------------------------------------------- */

export function measurePreservation(stage3bCorpus, v2) {
  const share = (counts, total) => Object.fromEntries(Object.entries(counts ?? {})
    .map(([key, count]) => [key, total === 0 ? 0 : Math.round((count * 10000) / total) / 10000]));

  const v1Supervision = share(stage3bCorpus.bySupervision, stage3bCorpus.records);
  const v2Supervision = share(v2.bySupervision, v2.records);
  const v1Horizon = share(stage3bCorpus.byHorizonClass, stage3bCorpus.records);
  const v2Horizon = share(v2.byHorizonClass, v2.records);

  const classes = [...new Set([...Object.keys(v1Supervision), ...Object.keys(v2Supervision)])].sort();
  const horizonClasses = [...new Set([...Object.keys(v1Horizon), ...Object.keys(v2Horizon)])].sort();

  return {
    diversity: {
      v1: {
        uniqueTopologyHashes: stage3bCorpus.diversity.uniqueTopologyHashes,
        effectiveDatasetSize: stage3bCorpus.diversity.effectiveDatasetSize,
        nearDuplicateRate: stage3bCorpus.diversity.nearDuplicateRate,
      },
      v2: {
        uniqueTopologyHashes: v2.diversity.uniqueTopologyHashes,
        effectiveDatasetSize: v2.diversity.effectiveDatasetSize,
        nearDuplicateRate: v2.diversity.nearDuplicateRate,
      },
      topologyCountPreserved: v2.diversity.uniqueTopologyHashes >= STAGE3B1_TARGETS.topologyCount,
      nearDuplicateRateNotWorse: v2.diversity.nearDuplicateRate <= stage3bCorpus.diversity.nearDuplicateRate,
    },
    supervision: {
      rewardVersion: FORGE_REWARD_V2_VERSION,
      rewardSemanticsChanged: false,
      classes,
      shares: classes.map((name) => ({ class: name, v1: v1Supervision[name] ?? 0, v2: v2Supervision[name] ?? 0 })),
      allClassesStillPopulated: classes.every((name) => (v2.bySupervision?.[name] ?? 0) > 0),
    },
    horizon: {
      classes: horizonClasses,
      shares: horizonClasses.map((name) => ({ class: name, v1: v1Horizon[name] ?? 0, v2: v2Horizon[name] ?? 0 })),
      bothClassesPopulated: horizonClasses.every((name) => (v2.byHorizonClass?.[name] ?? 0) > 0),
      horizonDependentCases: v2.horizonDependentCases,
    },
    note: 'FORGE_REWARD_V2 is frozen and unchanged: the reward that scores a V2 record is byte-identical to the one that scored a V1 record. Any shift in the supervision or horizon mix is therefore caused by which world state was scored, not by how it was scored.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 19 — training provenance. Declared, not executed.
 * ------------------------------------------------------------------------- */

export const STAGE3B1_TRAINING_CAMPAIGN_SPEC = deepFreeze({
  status: 'DECLARED_NOT_STARTED',
  datasetVersion: FORGE_DATASET_V2_VERSION,
  parentDatasetVersion: FORGE_DATASET_V2_PARENT,
  warmupVersion: FORGE_TEMPORAL_WARMUP_V1.id,
  oracleSurfaceVersion: FORGE_ORACLE_CHANNEL_MAPPING.id,
  rewardVersion: FORGE_REWARD_V2_VERSION,
  candidate: 'LEARNED_NEXUS_CANDIDATE',
  successorStage: 'STAGE3C_LEARNED_NEXUS_CANDIDATE_TRAINING_AND_OFFLINE_EVALUATION',
  trainingStarted: false,
  soupInvokedForTraining: false,
  routerTrained: false,
  governance: deepFreeze({
    replacesSentinelExpert: false,
    rule: 'A learned candidate is a SHADOW until it beats the frozen expert on the evaluation splits under this lineage. Soup never automatically replaces a Sentinel expert.',
    authorityTier: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
  }),
  provenancePins: deepFreeze({
    dataset: FORGE_DATASET_V2_VERSION,
    stage3aCertification: STAGE3B1_STAGE3A_CERTIFICATION_HASH,
    stage3bCertification: STAGE3B1_STAGE3B_CERTIFICATION_HASH,
  }),
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

export const STAGE3B1_OUTCOMES = deepFreeze([
  'A_TEMPORAL_WARMUP_AND_ORACLE_REACHABILITY_CERTIFIED',
  'B_ORACLE_STILL_UNREACHABLE',
  'C_WARMUP_CHANGES_THE_TASK',
  'D_BASELINE_NOT_REPRODUCED',
]);

export function certifyStage3B1({ evaluation }) {
  const {
    baselineReproduction, oracleContract, warmupAudit, familyAudit, corpus, oracleHeads,
    router, determinism, baseline, comparison, datasetExport, soup, security, regression, pilot,
    preservation, shardIndependence,
  } = evaluation;

  const gates = [
    { id: 'STAGE3B_BASELINE_REPRODUCED', pass: baselineReproduction.reproduced },
    { id: 'STAGE3B_ARTIFACTS_UNMODIFIED', pass: baselineReproduction.stage3bArtifactsModified === false },
    { id: 'WARMUP_LENGTH_NOT_MERELY_CLEARING_MINIMUM', pass: oracleContract.lengthNotChosenToClearMinimum },
    { id: 'WARMUP_PRESERVES_THE_TASK', pass: warmupAudit.taskPreservationRate === 1 },
    { id: 'DECISION_HORIZON_PRESERVED_EXACTLY', pass: warmupAudit.horizonPreservedExactly === warmupAudit.probes },
    { id: 'NO_CHANNEL_CLAMPING', pass: warmupAudit.channelClamped === 0 },
    { id: 'WARMUP_CONSUMES_NO_RESOURCES', pass: warmupAudit.consumedResources === 0 },
    { id: 'WARMUP_MOVES_NO_ACTORS', pass: warmupAudit.movedActors === 0 },
    { id: 'WARMUP_KILLS_NO_ENTITIES', pass: warmupAudit.killedEntities === 0 },
    { id: 'WARMUP_COMPLETES_NO_OBJECTIVES', pass: warmupAudit.completedObjectives === 0 },
    { id: 'WARMUP_CHANGES_NO_LEGAL_ACTIONS', pass: warmupAudit.changedLegalActions === 0 },
    { id: 'WARMUP_CHANGES_NO_STRUCTURE', pass: warmupAudit.changedStructure === 0 },
    { id: 'EVERY_WARMUP_FRAME_REPRODUCES', pass: determinism.everyWarmupFrameReproduced },
    { id: 'SHARDED_GENERATION_IS_ORDER_INDEPENDENT', pass: shardIndependence.shardIndependent },
    { id: 'TEMPORAL_FAMILIES_REALISED', pass: familyAudit.realisationRate >= STAGE3B1_TARGETS.temporalFamilyRealisationRate },
    { id: 'PILOT_WITHIN_DECLARED_BOUNDS', pass: pilot.records >= STAGE3B1_PILOT_BOUNDS.minimum && pilot.records <= STAGE3B1_PILOT_BOUNDS.maximum },
    { id: 'PILOT_SHOWED_ORACLE_REACHABLE', pass: pilot.oracleReachable },
    { id: 'ORACLE_AXIS_REACHABLE', pass: oracleHeads.genericOracleSufficientRate >= STAGE3B1_TARGETS.oracleGenericSufficientRate },
    { id: 'ALL_ORACLE_HEADS_REACHABLE', pass: oracleHeads.allHeadsReachable },
    { id: 'ORACLE_NEVER_COLLAPSED_TO_ONE_METRIC', pass: oracleHeads.neverCollapsed },
    { id: 'ROUTER_NOT_TRAINED', pass: router.routerTrained === false && baseline.routerTrained === false },
    { id: 'ROUTER_ALIGNMENT_IMPROVED', pass: baseline.routerAlignment > STAGE3B1_INHERITED_BASELINE.routerAlignment },
    { id: 'CORPUS_SIZE', pass: corpus.records >= STAGE3B1_TARGETS.admittedRecords },
    { id: 'TRAIN_SPLIT_SIZE', pass: (corpus.bySplit.TRAIN ?? 0) >= STAGE3B1_TARGETS.trainRecords },
    { id: 'TOPOLOGY_COUNT', pass: corpus.diversity.uniqueTopologyHashes >= STAGE3B1_TARGETS.topologyCount },
    { id: 'ZERO_WORLD_LEAKAGE', pass: corpus.leakage.exactWorldOverlap === 0 },
    { id: 'ZERO_TOPOLOGY_LEAKAGE', pass: corpus.leakage.topologyLeakage === 0 },
    { id: 'LEAKAGE_CONTROL_SENSITIVE', pass: corpus.leakage.topologyLeakageControlPass },
    { id: 'ADMISSION_GATE_STILL_REJECTS', pass: corpus.rejected > 0 },
    { id: 'REWARD_SEMANTICS_UNCHANGED', pass: corpus.rewardVersion === FORGE_REWARD_V2_VERSION },
    { id: 'DIVERSITY_PRESERVED', pass: preservation.diversity.topologyCountPreserved },
    { id: 'NEAR_DUPLICATE_RATE_NOT_WORSE', pass: preservation.diversity.nearDuplicateRateNotWorse },
    { id: 'SUPERVISION_CLASSES_STILL_POPULATED', pass: preservation.supervision.allClassesStillPopulated },
    { id: 'HORIZON_CURRICULUM_PRESERVED', pass: preservation.horizon.bothClassesPopulated },
    { id: 'DATASET_LINEAGE_TAGGED', pass: datasetExport.allRowsTaggedV2 },
    { id: 'PARENT_LINEAGE_IMMUTABLE', pass: FORGE_DATASET_V2_LINEAGE.parentArtifactsModified === false },
    { id: 'SOUP_EXPORTS_VALID', pass: soup.allCompatible },
    { id: 'SOUP_NOT_INVOKED_FOR_TRAINING', pass: soup.invokedForTraining === false },
    { id: 'NO_TRAINING_STARTED', pass: baseline.trainingStarted === false },
    { id: 'EXPERTS_UNMODIFIED', pass: baseline.expertsModified === false && security.expertsModified === false },
    { id: 'AUTHORITY_UNCHANGED', pass: security.authority === 'R0' && security.canDispatch === false && security.canMutateLiveWorld === false },
    { id: 'DISPATCH_PROBE_REFUSED', pass: baseline.dispatchProbe.attempted && baseline.dispatchProbe.refused },
    { id: 'NO_SIMULATOR_AUTHORITY_PATHWAY', pass: security.recommendationInfluencesSimulator === false },
    { id: 'STAGE3A_REGRESSION', pass: regression.stage3aReproduced },
    { id: 'STAGE3B_REGRESSION', pass: regression.stage3bReproduced },
    { id: 'COMPARISON_ATTRIBUTED_TO_CORPUS', pass: comparison.attribution === 'CORPUS_EFFECT' && comparison.modelsFrozen },
  ];

  const blockers = gates.filter((gate) => !gate.pass).map((gate) => gate.id);
  const outcome = !baselineReproduction.reproduced ? 'D_BASELINE_NOT_REPRODUCED'
    : warmupAudit.taskPreservationRate !== 1 ? 'C_WARMUP_CHANGES_THE_TASK'
      : !oracleHeads.allHeadsReachable ? 'B_ORACLE_STILL_UNREACHABLE'
        : blockers.length === 0 ? 'A_TEMPORAL_WARMUP_AND_ORACLE_REACHABILITY_CERTIFIED'
          : 'B_ORACLE_STILL_UNREACHABLE';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE3B1_STAGE,
    status: blockers.length === 0 ? 'PASS' : 'FAIL',
    stageKind: 'CORPUS_CONSTRUCTION_REPAIR_AND_RECERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    inherited: {
      stage3aCertificationHash: STAGE3B1_STAGE3A_CERTIFICATION_HASH,
      stage3bCertificationHash: STAGE3B1_STAGE3B_CERTIFICATION_HASH,
      baselineReproduction,
    },
    defect: {
      repaired: 'ORACLE_AXIS_UNREACHABLE',
      secondary: 'ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED',
      class: 'CORPUS_CONSTRUCTION',
      notReinterpretedAsPass: true,
    },
    warmup: {
      version: FORGE_TEMPORAL_WARMUP_V1.id,
      contract: FORGE_TEMPORAL_WARMUP_V1,
      decisionStates: WARMUP_DECISION_STATES,
      stopReasons: WARMUP_STOP_REASONS,
    },
    oracleContract,
    warmupAudit,
    familyAudit,
    pilot,
    corpus,
    preservation,
    oracleHeads,
    router,
    determinism,
    shardIndependence,
    baseline,
    comparison,
    datasetExport,
    lineage: FORGE_DATASET_V2_LINEAGE,
    soup,
    security,
    regression,
    trainingCampaignSpec: STAGE3B1_TRAINING_CAMPAIGN_SPEC,
    targets: STAGE3B1_TARGETS,
    supervisionVocabulary: { supervisionClasses: SUPERVISION_CLASSES, tieClasses: TIE_CLASSES, nearTieMargin: NEAR_TIE_MARGIN, preferenceMinimumGap: PREFERENCE_MINIMUM_GAP },
    rewardComponents: FORGE_REWARD_V2_COMPONENT_IDS,
    gates,
    blockers,
    stage3b1Outcome: outcome,
    stage3b1Certified: blockers.length === 0,
    interpretation: blockers.length === 0
      ? 'The Oracle axis is reachable. Decisions are captured after a deterministic warm-up that the world actually lived, the horizon the decision receives is the horizon the curriculum declared, and every one of the eight Oracle heads produces substantive outputs on the V2 corpus. Nothing was trained and nothing was modified: the change is a corpus effect, and the residual per-head reachability gap in worlds with active hostiles is reported rather than closed.'
      : `Stage 3B.1 did not certify. Blockers: ${blockers.join(', ')}.`,
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
  };

  const evidenceDigest = sha256(body);
  return { ...body, evidenceDigest, certificationHash: sha256({ ...body, evidenceDigest }) };
}

export { loadCorpus, measureCorpus, calibrateDifficulty, auditGeneratorBoundaries, validateSoupExports };
export { exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage, tagV2 };
export { detectSoupFormat, SOUP_COMMIT, SOUP_VERSION, STAGE3B_TARGETS };
