import { deepFreeze } from '../core/determinism.js';

/* Stage 3F.6 evaluation corpus contract. Kept separate from the metric module so the
 * corpus identity does not change when evaluation code (not evidence) changes. */

export const STAGE3E_SPLITS = deepFreeze(['ROUTABILITY_DEV', 'ROUTABILITY_CAL', 'ROUTABILITY_HOLDOUT', 'ROUTABILITY_OOD']);
export const STAGE3F6_PARTITION_BY_SPLIT = deepFreeze({
  ROUTABILITY_DEV: 'DEV', ROUTABILITY_CAL: 'CAL', ROUTABILITY_HOLDOUT: 'HOLDOUT', ROUTABILITY_OOD: 'OOD',
});

export const STAGE3F6_CORPUS_SPEC = deepFreeze({
  corpusVersion: 'STAGE3F6_EVALUATION_CORPUS_V1',
  curriculum: 'FORGE_CURRICULUM_V2',
  recordBuilder: 'FORGE_DATASET_V2/buildRecordV2',
  levels: [0, 1, 2, 3, 4, 5], seeds: [201, 202, 203],
  oodLevels: [6, 7], oodSeeds: [211],
  sourceSplits: STAGE3E_SPLITS,
  joinKey: 'recordHash',
  branchKeyPrefixLength: 16,
  runtimeFeatureAdapter: 'STAGE3F5_EXACT_STAGE3E_FEATURE_ADAPTER',
  runtimeCandidateSemantics: 'NEXUS_RELATIONAL_SELECTOR_V1_ELSE_HEURISTIC_GREEDY_IMMEDIATE',
  labelsIncluded: false,
});

/** Stage 3E features whose value depends on the candidate recommendation rather than on world evidence. */
export const STAGE3E_CANDIDATE_FEATURE_KEYS = deepFreeze(['greedyEqLearned', 'nexusEqLearned', 'allThreeAgree', 'sameActionType', 'sameTarget']);

const key16 = (key) => (key === null || key === undefined ? null : String(key).slice(0, 16));

export function compactCorpusCase({
  record, world, split, ood, combination, matrixFeatures, contractGreedyKey,
  runtimeFeatures, runtimeGreedyKey, runtimeCandidate, runtimeBranchCount,
}) {
  if (!STAGE3E_SPLITS.includes(split)) throw new Error(`unknown Stage 3E split: ${split}`);
  const runtimeFeatureDiff = {};
  for (const key of Object.keys(matrixFeatures).sort()) {
    if (Number(runtimeFeatures[key]) !== Number(matrixFeatures[key])) runtimeFeatureDiff[key] = runtimeFeatures[key] ?? null;
  }
  return {
    recordHash: record.recordHash,
    split,
    partition: STAGE3F6_PARTITION_BY_SPLIT[split],
    ood: ood === true,
    combination: {
      shape: combination.shape, roles: combination.roles, objectives: combination.objectives,
      horizonBand: combination.horizonBand, level: combination.level, seed: String(combination.seed),
    },
    worldHash: record.worldHash,
    topologyHash: record.topologyHash,
    horizon: record.horizon,
    tick: record.tick,
    maxTicks: record.maxTicks,
    supervisionClass: record.supervisionClass,
    horizonClass: record.horizonClass,
    optimalScalar: record.optimalScalar,
    worldState: {
      tick: world.tick, energy: world.constraints.energy ?? 0, entities: world.entities.length,
      relations: world.relations.length, objectives: world.objectives.length,
    },
    branches: record.branches.map((branch) => [branch.actionKey, branch.actionType, branch.immediateScalar, branch.scalarReward, branch.regret]),
    contractGreedyKey: key16(contractGreedyKey),
    runtimeGreedyKey: key16(runtimeGreedyKey),
    runtimeCandidate: { producerId: runtimeCandidate.producerId, actionKey: key16(runtimeCandidate.actionId) },
    runtimeBranchCount,
    runtimeFeatureDiff,
  };
}
