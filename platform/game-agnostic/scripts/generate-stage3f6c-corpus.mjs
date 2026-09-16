#!/usr/bin/env node
/* STAGE_3F_6_C — fresh confirmatory corpus.
 *
 * The Stage 3E / Stage 3F.6 partitions are exposed and cannot confirm anything. This builds a
 * NEW corpus on a disjoint seed space (401/402/403 main, 411 OOD; prior stages used 1/2/3, 11,
 * 201/202/203, 211) with topology-, record- and state-disjoint partitions.
 *
 * Labels come only from authoritative oracle horizon evidence. Features come only from the
 * certified deployable contract. Those two paths never touch.
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enumerateCurriculumV2 } from '../src/forge/scenarios-v2.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { heuristicGreedyBaseline, nexusRelationalSelector, scoreAnswer } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile, FeatureValueStatus }
  from '../src/stage3f/deployable-feature-contract-v1.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6c-deployable-router');
/* --smoke builds a tiny corpus to a separate path, so a wiring check can never be mistaken
 * for, or overwrite, the confirmatory corpus. */
const smokeMode = process.argv.includes('--smoke');
const corpusPath = path.join(outDirectory, smokeMode ? 'smoke-corpus.jsonl.gz' : 'confirmatory-corpus.jsonl.gz');
const manifestPath = path.join(outDirectory, smokeMode ? 'smoke-corpus-manifest.json' : 'confirmatory-corpus-manifest.json');
const SMOKE_TARGETS = Object.freeze({ DEV: 40, CAL: 40, HOLDOUT: 60, OOD: 60 });
const hex = (value) => createHash('sha256').update(value).digest('hex');

export const STAGE3F6C_CORPUS_SPEC = Object.freeze({
  corpusVersion: 'STAGE3F6C_CONFIRMATORY_CORPUS_V1',
  curriculum: 'FORGE_CURRICULUM_V2',
  recordBuilder: 'FORGE_DATASET_V2/buildRecordV2',
  levels: [0, 1, 2, 3, 4, 5],
  seeds: [401, 402, 403],
  oodLevels: [6, 7],
  oodSeeds: [411],
  priorSeedSpaces: { stage3b: [1, 2, 3], stage3b1: [1, 2, 3], stage3bOod: [11], stage3eAndStage3f6: [201, 202, 203], stage3f6Ood: [211] },
  seedSpaceDisjointFromPriorStages: true,
  targets: { DEV: 4000, CAL: 4000, HOLDOUT: 6000, OOD: 6000 },
  partitionAssignment: 'SALTED_TOPOLOGY_HASH_MODULO_WEIGHTS',
  partitionSalt: 'STAGE3F6C_PARTITION_V1',
  labelSource: 'ORACLE_HORIZON_OPTIMAL_SET',
  labelDefinition: 'GREEDY_SAFE = best-immediate action is a member of the authoritative horizon-optimal set',
  featureSource: 'SENTINEL_DEPLOYABLE_FEATURE_CONTRACT_V1',
});

/* Topology -> partition. A topology belongs to exactly one partition by construction, so no
 * structure can appear on both sides of a sealed boundary. */
const MAIN_PARTITIONS = [
  { name: 'DEV', weight: 30 },
  { name: 'CAL', weight: 30 },
  { name: 'HOLDOUT', weight: 40 },
];
export function partitionForTopology(topologyDigest) {
  const salted = sha256({ salt: STAGE3F6C_CORPUS_SPEC.partitionSalt, topologyDigest });
  const bucket = Number.parseInt(salted.slice(0, 8), 16) % 100;
  let cursor = 0;
  for (const entry of MAIN_PARTITIONS) {
    cursor += entry.weight;
    if (bucket < cursor) return entry.name;
  }
  return MAIN_PARTITIONS[MAIN_PARTITIONS.length - 1].name;
}

/** Deterministic enumeration order that does not correlate with the curriculum axes. */
function orderedCombinations(list, salt) {
  return [...list]
    .map((combination) => ({ combination, key: sha256({ salt, ...combination }) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.combination);
}

function deployableRow(world) {
  const state = forgeAdapterState(world);
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const forgeActions = forgeLegalActions(state.world);
  const descriptors = forgeWorldAdapter.legalActions(state, FORGE_OBSERVER_ID);
  const legalActions = forgeActions.map((action, index) => ({
    actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
    parameters: action.parameters, descriptorIndex: index,
  }));
  /* One-step capability over an ISOLATED copy, used only by the ablation profiles. */
  const simulator = {
    horizonSteps: 1,
    oneStep(actionId) {
      const entry = legalActions.find((candidate) => candidate.actionId === actionId);
      const isolated = forgeWorldAdapter.cloneState(state);
      const result = forgeWorldAdapter.step(isolated, descriptors[entry.descriptorIndex], { observerId: FORGE_OBSERVER_ID });
      return { reward: result.reward, rewardVector: result.info.rewardVector, terminal: result.terminal };
    },
  };
  const core = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  const withSimulator = extractDeployableFeatures({
    observation, legalActions, profile: DeployableProfile.DEPLOYABLE_WITH_SIMULATOR, simulator,
  });
  /* The deployable fallback Sentinel can actually compute: the relational selector. */
  const nexus = evaluateNexus({
    canonicalState: observation.metadata.canonicalState,
    legalActions: legalActions.map((entry) => ({ actionId: entry.actionId, targetEntityId: entry.targetEntityId })),
  });
  const selector = nexusRelationalSelector(
    { branches: legalActions.map((entry) => ({ actionKey: entry.actionId, actionType: entry.actionType })) }, nexus,
  );
  return { core, withSimulator, selector, legalActionCount: legalActions.length };
}

/**
 * Feature values for a profile, as plain numbers, plus an explicit list of what was NOT available.
 * Unavailable features are reported and excluded — never imputed, and never silently collapsing the
 * whole profile. The caller decides whether a gap is fatal for its profile.
 */
function profileValues(result, profile) {
  const values = {};
  const missing = [];
  for (const featureId of DEPLOYABLE_PROFILES[profile].featureIds) {
    const entry = result.features[featureId];
    if (entry.status !== FeatureValueStatus.AVAILABLE) {
      missing.push({ featureId, status: entry.status, reason: entry.reason });
      continue;
    }
    values[featureId] = typeof entry.value === 'boolean' ? (entry.value ? 1 : 0) : entry.value;
  }
  return { values, missing };
}

async function main() {
  const targets = smokeMode ? SMOKE_TARGETS : STAGE3F6C_CORPUS_SPEC.targets;
  const counts = { DEV: 0, CAL: 0, HOLDOUT: 0, OOD: 0 };
  const rows = [];
  const topologyToPartition = new Map();
  const seenRecordHashes = new Set();
  const seenWorldHashes = new Set();
  const rejected = {};
  const featureGaps = {};
  let attempted = 0;

  const mainCombinations = orderedCombinations(
    enumerateCurriculumV2({ levels: STAGE3F6C_CORPUS_SPEC.levels, seeds: STAGE3F6C_CORPUS_SPEC.seeds }),
    'STAGE3F6C_MAIN',
  );
  const oodCombinations = orderedCombinations(
    enumerateCurriculumV2({ levels: STAGE3F6C_CORPUS_SPEC.oodLevels, seeds: STAGE3F6C_CORPUS_SPEC.oodSeeds }),
    'STAGE3F6C_OOD',
  );

  const consume = (combinations, isOod) => {
    for (const combination of combinations) {
      const full = isOod ? counts.OOD >= targets.OOD
        : counts.DEV >= targets.DEV && counts.CAL >= targets.CAL && counts.HOLDOUT >= targets.HOLDOUT;
      if (full) break;
      attempted += 1;

      const built = buildRecordV2(combination, isOod);
      if (!built.admitted) {
        const key = (built.failedChecks ?? [built.stoppedAt]).join(',');
        rejected[key] = (rejected[key] ?? 0) + 1;
        continue;
      }
      const record = built.record;

      /* Disjointness is enforced, not assumed. A topology already bound to another partition,
       * or a repeated record/world identity, is dropped rather than duplicated across a boundary. */
      const partition = isOod ? 'OOD' : partitionForTopology(record.topologyHash);
      const bound = topologyToPartition.get(record.topologyHash);
      if (bound !== undefined && bound !== partition) {
        rejected.TOPOLOGY_ALREADY_BOUND_TO_OTHER_PARTITION = (rejected.TOPOLOGY_ALREADY_BOUND_TO_OTHER_PARTITION ?? 0) + 1;
        continue;
      }
      if (seenRecordHashes.has(record.recordHash)) {
        rejected.DUPLICATE_RECORD = (rejected.DUPLICATE_RECORD ?? 0) + 1;
        continue;
      }
      if (seenWorldHashes.has(record.worldHash)) {
        rejected.DUPLICATE_WORLD_STATE = (rejected.DUPLICATE_WORLD_STATE ?? 0) + 1;
        continue;
      }
      if (counts[partition] >= targets[partition]) continue;

      const deployable = deployableRow(built.world);
      const core = profileValues(deployable.core, DeployableProfile.DEPLOYABLE_CORE);
      if (core.missing.length > 0) {
        // CORE is the primary profile: a gap there disqualifies the row rather than being imputed.
        for (const gap of core.missing) {
          const key = `CORE_FEATURE_UNAVAILABLE:${gap.featureId}:${gap.status}`;
          featureGaps[key] = (featureGaps[key] ?? 0) + 1;
        }
        continue;
      }
      const simulatorProfile = profileValues(deployable.withSimulator, DeployableProfile.DEPLOYABLE_WITH_SIMULATOR);

      /* Labels: authoritative oracle horizon evidence only. */
      const greedy = heuristicGreedyBaseline(record);
      const greedyScore = scoreAnswer(record, greedy);
      if (!greedyScore.scored) {
        rejected.GREEDY_NOT_SCORABLE = (rejected.GREEDY_NOT_SCORABLE ?? 0) + 1;
        continue;
      }
      /* Record branches store the action key as a 16-character prefix (record-v2), while the runtime
       * key is the full digest. Scoring the selector's choice requires the record's own key form —
       * passing the full digest makes every non-abstaining answer unscorable. */
      const fallbackAnswer = deployable.selector.abstain
        ? greedy
        : { actionId: deployable.selector.actionId.slice(0, 16), confidence: 1, abstain: false };
      const fallbackScore = scoreAnswer(record, fallbackAnswer);

      topologyToPartition.set(record.topologyHash, partition);
      seenRecordHashes.add(record.recordHash);
      seenWorldHashes.add(record.worldHash);
      counts[partition] += 1;

      rows.push({
        partition,
        recordHash: record.recordHash,
        topologyHash: record.topologyHash,
        worldHash: record.worldHash,
        combination: { ...combination, ood: isOod },
        y: greedyScore.inOptimalSet ? 1 : 0,
        greedyOk: greedyScore.inOptimalSet ? 1 : 0,
        greedyRegret: greedyScore.regret,
        fallbackOk: fallbackScore.scored && fallbackScore.inOptimalSet ? 1 : 0,
        fallbackRegret: fallbackScore.scored ? fallbackScore.regret : null,
        fallbackScored: fallbackScore.scored ? 1 : 0,
        selectorAbstained: deployable.selector.abstain ? 1 : 0,
        legalActionCount: deployable.legalActionCount,
        core: core.values,
        simulator: simulatorProfile.values,
        simulatorMissing: simulatorProfile.missing.map((gap) => gap.featureId),
      });

      if (rows.length % 500 === 0) {
        process.stderr.write(`[stage3f6c] ${rows.length} rows  DEV=${counts.DEV} CAL=${counts.CAL} HOLDOUT=${counts.HOLDOUT} OOD=${counts.OOD}\n`);
      }
    }
  };

  consume(mainCombinations, false);
  consume(oodCombinations, true);

  rows.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  const content = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const contentHash = hex(content);

  const partitionHash = (name) => hex(rows.filter((row) => row.partition === name)
    .map((row) => row.recordHash).sort().join('\n'));
  const topologiesOf = (name) => new Set(rows.filter((row) => row.partition === name).map((row) => row.topologyHash));
  const overlap = (a, b) => [...topologiesOf(a)].filter((digest) => topologiesOf(b).has(digest)).length;

  const manifest = {
    schemaVersion: 1,
    smokeMode,
    spec: STAGE3F6C_CORPUS_SPEC,
    effectiveTargets: targets,
    deployableContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    attempted,
    admitted: rows.length,
    counts,
    contentHash,
    partitionHashes: Object.fromEntries(['DEV', 'CAL', 'HOLDOUT', 'OOD'].map((name) => [name, partitionHash(name)])),
    partitionTopologyCounts: Object.fromEntries(['DEV', 'CAL', 'HOLDOUT', 'OOD'].map((name) => [name, topologiesOf(name).size])),
    topologyOverlap: {
      DEV_HOLDOUT: overlap('DEV', 'HOLDOUT'), DEV_OOD: overlap('DEV', 'OOD'),
      CAL_HOLDOUT: overlap('CAL', 'HOLDOUT'), CAL_OOD: overlap('CAL', 'OOD'),
      HOLDOUT_OOD: overlap('HOLDOUT', 'OOD'), DEV_CAL: overlap('DEV', 'CAL'),
    },
    recordOverlap: rows.length - new Set(rows.map((row) => row.recordHash)).size,
    stateOverlap: rows.length - new Set(rows.map((row) => row.worldHash)).size,
    prevalence: Object.fromEntries(['DEV', 'CAL', 'HOLDOUT', 'OOD'].map((name) => {
      const subset = rows.filter((row) => row.partition === name);
      return [name, subset.length ? subset.reduce((sum, row) => sum + row.y, 0) / subset.length : null];
    })),
    rejected,
    featureGaps,
    generator: 'scripts/generate-stage3f6c-corpus.mjs',
  };

  await mkdir(outDirectory, { recursive: true });
  await writeFile(corpusPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    admitted: rows.length, counts, contentHash,
    topologyOverlap: manifest.topologyOverlap, recordOverlap: manifest.recordOverlap,
    stateOverlap: manifest.stateOverlap, prevalence: manifest.prevalence,
    rejected, featureGaps,
  }, null, 2));
}

await main();
