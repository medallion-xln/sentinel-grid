#!/usr/bin/env node
/* STAGE_3F_6_T — fresh confirmatory HOLDOUT / OOD for the deployable policy router.
 *
 * The Stage 3F.6-C HOLDOUT/OOD were used for Stage 3F.6-A's sealed policy evaluation and are
 * disclosed as not pristine, so they cannot confirm a routing claim. DEV/CAL remain the fitting and
 * calibration data; this builds NEW sealed partitions on a disjoint seed space and excludes every
 * topology, record and world state already present in the Stage 3F.6-C corpus.
 *
 * Each row carries decision-time DEPLOYABLE_CORE features (router input) and, separately, the
 * authoritative per-policy outcome of the frozen Stage 3F.6-A producers (offline labels only).
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { enumerateCurriculumV2 } from '../src/forge/scenarios-v2.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { buildTarget, heuristicGreedyBaseline, nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { forgeActionKey, legalActions as forgeLegalActions } from '../src/forge/kernel.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import {
  DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile, FeatureValueStatus,
} from '../src/stage3f/deployable-feature-contract-v1.js';
import { DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const priorCorpusPath = path.join(root, 'artifacts', 'stage3f6c-deployable-router', 'confirmatory-corpus.jsonl.gz');
const outDirectory = path.join(root, 'artifacts', 'stage3f6t-policy-router');
const smokeMode = process.argv.includes('--smoke');
const dataPath = path.join(outDirectory, smokeMode ? 'smoke-holdout-ood.jsonl.gz' : 'confirmatory-holdout-ood.jsonl.gz');
const manifestPath = path.join(outDirectory, smokeMode ? 'smoke-holdout-ood-manifest.json' : 'confirmatory-holdout-ood-manifest.json');
const hex = (value) => createHash('sha256').update(value).digest('hex');

export const STAGE3F6T_CONFIRMATORY_SPEC = Object.freeze({
  version: 'STAGE3F6T_CONFIRMATORY_HOLDOUT_OOD_V1',
  curriculum: 'FORGE_CURRICULUM_V2',
  holdout: { levels: [0, 1, 2, 3, 4, 5], seeds: [601, 602, 603] },
  ood: { levels: [6, 7], seeds: [611] },
  priorSeedSpaces: [1, 2, 3, 11, 201, 202, 203, 211, 401, 402, 403, 411],
  targets: smokeMode ? { HOLDOUT: 60, OOD: 60 } : { HOLDOUT: 6000, OOD: 6000 },
  excludes: 'every topologyHash, recordHash and worldHash present in the Stage 3F.6-C corpus',
  reason: 'Stage 3F.6-C HOLDOUT/OOD were exposed by Stage 3F.6-A sealed policy evaluation',
});

export const STAGE3F6T_OUTCOME_PRODUCERS = Object.freeze(['GREEDY', 'NEXUS_SELECTOR', 'RESOURCE_PRESERVING_V1',
  'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1']);

const RECORD_KEY_PREFIX = 16;
const toRecordKey = (actionId) => (typeof actionId === 'string' ? actionId.slice(0, RECORD_KEY_PREFIX) : null);

function orderedCombinations(list, salt) {
  return [...list]
    .map((combination) => ({ combination, key: sha256({ salt, ...combination }) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((entry) => entry.combination);
}

async function main() {
  const priorRaw = gunzipSync(await readFile(priorCorpusPath)).toString('utf8');
  const prior = priorRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const priorTopologies = new Set(prior.map((r) => r.topologyHash));
  const priorRecords = new Set(prior.map((r) => r.recordHash));
  const priorWorlds = new Set(prior.map((r) => r.worldHash));

  const spec = STAGE3F6T_CONFIRMATORY_SPEC;
  for (const seed of [...spec.holdout.seeds, ...spec.ood.seeds]) {
    if (spec.priorSeedSpaces.includes(seed)) throw new Error(`seed ${seed} collides with a prior stage`);
  }

  const coreIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
  const counts = { HOLDOUT: 0, OOD: 0 };
  const rows = [];
  const seenTopology = new Map();
  const seenRecords = new Set();
  const seenWorlds = new Set();
  const rejected = {};
  const reject = (key) => { rejected[key] = (rejected[key] ?? 0) + 1; };
  let attempted = 0;

  const consume = (combinations, partition, isOod) => {
    for (const combination of combinations) {
      if (counts[partition] >= spec.targets[partition]) break;
      attempted += 1;
      const built = buildRecordV2(combination, isOod);
      if (!built.admitted) { reject((built.failedChecks ?? [built.stoppedAt]).join(',')); continue; }
      const record = built.record;

      if (priorTopologies.has(record.topologyHash)) { reject('TOPOLOGY_IN_PRIOR_CORPUS'); continue; }
      if (priorRecords.has(record.recordHash)) { reject('RECORD_IN_PRIOR_CORPUS'); continue; }
      if (priorWorlds.has(record.worldHash)) { reject('WORLD_STATE_IN_PRIOR_CORPUS'); continue; }
      const bound = seenTopology.get(record.topologyHash);
      if (bound !== undefined && bound !== partition) { reject('TOPOLOGY_BOUND_TO_OTHER_PARTITION'); continue; }
      if (seenRecords.has(record.recordHash)) { reject('DUPLICATE_RECORD'); continue; }
      if (seenWorlds.has(record.worldHash)) { reject('DUPLICATE_WORLD_STATE'); continue; }

      const state = forgeAdapterState(built.world);
      const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
      const legalActions = forgeLegalActions(state.world).map((action) => ({
        actionId: forgeActionKey(action), actionType: action.actionType, targetEntityId: action.target?.id ?? null,
        parameters: action.parameters,
      }));
      if (legalActions.length === 0) { reject('NO_LEGAL_ACTIONS'); continue; }

      /* Router input: decision-time DEPLOYABLE_CORE only. A gap disqualifies the row; nothing is imputed. */
      const extracted = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
      const core = {};
      let gap = null;
      for (const id of coreIds) {
        const entry = extracted.features[id];
        if (entry.status !== FeatureValueStatus.AVAILABLE) { gap = `${id}:${entry.status}`; break; }
        core[id] = typeof entry.value === 'boolean' ? (entry.value ? 1 : 0) : entry.value;
      }
      if (gap !== null) { reject(`CORE_FEATURE_UNAVAILABLE:${gap}`); continue; }

      /* Offline labels: authoritative horizon outcome of each frozen Stage 3F.6-A producer. */
      const target = buildTarget(record);
      const optimal = new Set(target.optimalSet);
      const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState,
        legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
      const selector = nexusRelationalSelector(
        { branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
      const chosen = {
        GREEDY: heuristicGreedyBaseline(record).actionId,
        NEXUS_SELECTOR: selector.abstain ? null : toRecordKey(selector.actionId),
      };
      for (const proposal of proposeAll({ observation, legalActions })) {
        chosen[proposal.producerId] = proposal.action === null ? null : toRecordKey(proposal.action.actionId);
      }
      const regretOf = (key) => {
        if (key === null) return null;
        const branch = record.branches.find((b) => b.actionKey === key);
        return branch ? record.optimalScalar - branch.scalarReward : null;
      };

      seenTopology.set(record.topologyHash, partition);
      seenRecords.add(record.recordHash);
      seenWorlds.add(record.worldHash);
      counts[partition] += 1;
      rows.push({
        partition,
        recordHash: record.recordHash,
        topologyHash: record.topologyHash,
        worldHash: record.worldHash,
        combination: { ...combination, ood: isOod },
        core,
        chosen,
        correct: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v === null ? null : (optimal.has(v) ? 1 : 0)])),
        regret: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, regretOf(v)])),
      });
      if (rows.length % 1000 === 0) process.stderr.write(`[stage3f6t] ${rows.length} rows HOLDOUT=${counts.HOLDOUT} OOD=${counts.OOD}\n`);
    }
  };

  consume(orderedCombinations(enumerateCurriculumV2({ levels: spec.holdout.levels, seeds: spec.holdout.seeds }), 'STAGE3F6T_HOLDOUT'), 'HOLDOUT', false);
  consume(orderedCombinations(enumerateCurriculumV2({ levels: spec.ood.levels, seeds: spec.ood.seeds }), 'STAGE3F6T_OOD'), 'OOD', true);

  rows.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const topologiesOf = (name) => new Set(rows.filter((r) => r.partition === name).map((r) => r.topologyHash));
  const holdoutTopologies = topologiesOf('HOLDOUT');
  const manifest = {
    schemaVersion: 1,
    smokeMode,
    spec,
    featureContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    proposalContractHash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH,
    priorCorpusHash: hex(priorRaw),
    attempted,
    admitted: rows.length,
    counts,
    contentHash: hex(content),
    partitionHashes: Object.fromEntries(['HOLDOUT', 'OOD'].map((name) => [name,
      hex(rows.filter((r) => r.partition === name).map((r) => r.recordHash).sort().join('\n'))])),
    overlapWithPriorCorpus: {
      topology: rows.filter((r) => priorTopologies.has(r.topologyHash)).length,
      record: rows.filter((r) => priorRecords.has(r.recordHash)).length,
      state: rows.filter((r) => priorWorlds.has(r.worldHash)).length,
    },
    internalOverlap: {
      HOLDOUT_OOD_topology: [...topologiesOf('OOD')].filter((d) => holdoutTopologies.has(d)).length,
      record: rows.length - new Set(rows.map((r) => r.recordHash)).size,
      state: rows.length - new Set(rows.map((r) => r.worldHash)).size,
    },
    rejected,
    generator: 'scripts/generate-stage3f6t-confirmatory.mjs',
  };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(dataPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ admitted: rows.length, counts, contentHash: manifest.contentHash,
    overlapWithPriorCorpus: manifest.overlapWithPriorCorpus, internalOverlap: manifest.internalOverlap, rejected }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
