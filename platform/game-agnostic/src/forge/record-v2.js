/* Sentinel Forge World — the FORGE_DATASET_V2 record builder.
 *
 * Extracted so that the generator and the certification run the SAME code. The
 * certification verifies shard-independence by rebuilding records in a single
 * process and comparing their hashes to what the four workers wrote; that check
 * is worth nothing if the two paths are separate copies of the same logic, since
 * the copies could drift and the comparison would still pass.
 *
 * A record is a pure function of its (shape, roles, objectives, horizon band,
 * level, seed) tuple. That is what makes sharding by combination index safe: the
 * shard a case lands in changes nothing about the case.
 *
 * The decision-point contract is enforced here, in order, and a record that stops
 * short of DECISION_CAPTURED is not written:
 *
 *   WORLD_INITIALIZED -> WARMUP_COMPLETE -> HISTORY_VALID
 *                     -> SEMANTIC_ADMISSION_PASS -> DECISION_CAPTURED
 */

import { hashWorld, observe, topologyHash } from './kernel.js';
import { FORGE_ROLE_COMPOSITIONS } from './scenarios-v2.js';
import { generateScenarioV3 } from './scenarios-v3.js';
import { ORACLE_HEAD_TEMPORAL_CONTRACT, oracleHeadReachability, runCalibratedWarmup, validateTemporalFamily } from './warmup.js';
import { toOracleHeadInput } from './oracle-surface.js';
import { validateScenarioV2 } from './validators-v2.js';
import { classifyHorizonDependence, evaluateCounterfactualsV2 } from './counterfactual-v2.js';
import { classifySupervision, classifyTie } from './supervision.js';
import { FORGE_DATASET_V2_VERSION, splitForTopologyV2 } from './dataset-v2.js';
import { FORGE_REWARD_V2_VERSION } from './reward-v2.js';
import { evaluateOracle } from '../experts/oracle.js';
import { assembleOracleV2 } from '../lab/stage2i4-oracle-v2-assembly.js';
import { deepFreeze, sha256 } from '../core/determinism.js';

export const DECISION_STAGES = deepFreeze([
  'WORLD_INITIALIZED', 'WARMUP_COMPLETE', 'HISTORY_VALID', 'SEMANTIC_ADMISSION_PASS', 'DECISION_CAPTURED',
]);

export function buildRecordV2(combination, ood) {
  const build = (warmupTicks) => generateScenarioV3({ ...combination, warmupTicks });
  const warmup = runCalibratedWarmup(combination.seed, build);
  const config = warmup.scenarioConfig;
  const world = warmup.world;

  /* HISTORY_VALID: the frames are real, one per tick, in order, and the channel
   * never ran off its declared end. A history that fails this is not a shorter
   * history — it is a history that would lie to the Oracle about a flat trend. */
  const history = world.history;
  const ticksOrdered = history.every((frame, index) => frame.tick === index);
  const historyValid = history.length === warmup.warmupTicks + 1 && ticksOrdered && !warmup.channelClamped;
  if (!historyValid) {
    return { admitted: false, stoppedAt: 'WARMUP_COMPLETE', failedChecks: ['HISTORY_NOT_VALID'] };
  }

  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === combination.roles);
  const validation = validateScenarioV2(world, {
    ...combination,
    horizon: config.horizon,
    roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes },
  });
  if (!validation.valid) return { admitted: false, stoppedAt: 'HISTORY_VALID', failedChecks: validation.failedChecks };

  const horizonLength = Math.max(1, config.horizon);
  const counterfactuals = evaluateCounterfactualsV2(world, { horizon: horizonLength });
  const supervision = classifySupervision(counterfactuals);
  const tie = classifyTie(counterfactuals);
  const horizon = classifyHorizonDependence(world, { horizon: horizonLength, deepEvaluation: counterfactuals });
  const digest = topologyHash(world);
  const split = ood ? 'OOD' : splitForTopologyV2(digest);

  /* The Oracle axis, measured per head. Two evaluations, deliberately separate:
   * the generic expert (which reads any channel name) and the eight-head assembly
   * through the declared channel mapping. Collapsing them into one number would
   * hide exactly the distinction this stage exists to restore. */
  const observation = observe(world);
  const series = observation.observationHistory.map((frame) => frame.channels.primary);
  const familyCheck = validateTemporalFamily(config.temporalFamily, series);
  const generic = evaluateOracle({ observationHistory: observation.observationHistory });
  const genericSufficient = !generic.rationaleCodes.includes('ORACLE_INSUFFICIENT_HISTORY');
  const heads = assembleOracleV2(toOracleHeadInput(observation.observationHistory, 'primary', config.channelSemantics.primary));
  const reachability = oracleHeadReachability(observation.observationHistory.length);

  const oracleHeads = {};
  for (const head of ORACLE_HEAD_TEMPORAL_CONTRACT) {
    const emitted = heads.heads[head.headId];
    oracleHeads[head.headId] = {
      output: emitted.semanticOutput,
      supported: emitted.supported,
      framesSufficient: reachability.heads[head.headId].semanticallyMeasurable,
      guardCleared: reachability.heads[head.headId].guardCleared,
    };
  }

  const body = {
    recordVersion: FORGE_DATASET_V2_VERSION,
    rewardVersion: FORGE_REWARD_V2_VERSION,
    simulatorVersion: config.scenarioVersion,
    continuationPolicy: counterfactuals.continuationPolicy,
    shape: combination.shape, roles: combination.roles, objectives: combination.objectives,
    horizonBand: combination.horizonBand, level: combination.level,
    seed: String(combination.seed), scenarioSeed: config.scenarioSeed,
    split, outOfDistribution: ood,
    worldHash: hashWorld(world), topologyHash: digest,
    entityCount: world.entities.length, relationCount: world.relations.length,
    objectiveCount: world.objectives.length, energy: world.constraints.energy ?? 0,
    tick: world.tick, maxTicks: world.maxTicks,

    /* Temporal provenance. */
    warmupVersion: warmup.warmupVersion,
    warmupTicks: warmup.warmupTicks,
    warmupTargetTicks: warmup.targetTicks,
    warmupTruncated: warmup.truncated,
    warmupStopReason: warmup.stopReason,
    warmupTaskPreserved: warmup.taskPreserved,
    calibrationPasses: warmup.calibrationPasses,
    historyFrames: observation.observationHistory.length,
    decisionHorizonRemaining: world.maxTicks - world.tick,
    decisionHorizonDeclared: config.baseMaxTicks,
    horizonPreservedExactly: (world.maxTicks - world.tick) === config.baseMaxTicks,
    temporalFamily: config.temporalFamily,
    temporalFamilyRealized: familyCheck.holds,
    temporalFamilyCriterion: familyCheck.criterion,
    oracleGenericSufficient: genericSufficient,
    oracleHeads,

    horizon: counterfactuals.horizon, legalActionCount: counterfactuals.branchCount,
    branches: counterfactuals.branches.map((branch) => ({
      actionKey: branch.actionKey.slice(0, 16),
      actionType: branch.action.actionType,
      targetId: branch.action.target?.id ?? null,
      parameters: branch.action.parameters,
      rewardVector: branch.totalRewardVector,
      immediateScalar: branch.immediateScalar,
      scalarReward: branch.totalScalar,
      nextStateHash: branch.resultingStateHash.slice(0, 16),
      terminal: branch.terminal,
      regret: counterfactuals.optimalScalar - branch.totalScalar,
    })),
    optimalActionKey: counterfactuals.optimalActionKey === null ? null : counterfactuals.optimalActionKey.slice(0, 16),
    optimalScalar: counterfactuals.optimalScalar,
    utilitySpread: counterfactuals.utilitySpread,
    exactTie: counterfactuals.exactTie, tieCount: counterfactuals.tieCount,
    tieClass: tie === null ? null : tie.class,
    tieIsRewardDefect: tie === null ? false : tie.rewardDefect,
    supervisionClass: supervision.supervisionClass,
    supervisionMargin: supervision.margin,
    paretoTradeoff: supervision.pareto?.paretoTradeoff ?? false,
    scalarizationCollapse: supervision.pareto?.scalarizationCollapse ?? false,
    horizonClass: horizon.horizonClass,
    greedyRegret: horizon.greedyRegret,
  };
  return { admitted: true, stoppedAt: 'DECISION_CAPTURED', record: { ...body, recordHash: sha256(body) }, world, horizonLength };
}
