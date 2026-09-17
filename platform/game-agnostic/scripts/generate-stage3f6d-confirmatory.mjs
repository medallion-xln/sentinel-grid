#!/usr/bin/env node
/* STAGE_3F_6_D — fresh confirmatory HOLDOUT / OOD for the cost-sensitive decision rule.
 *
 * The Stage 3F.6-T HOLDOUT/OOD were opened by Stage 3F.6-T and are exposed. Any decision rule designed
 * after reading those results needs NEW confirmatory partitions. This builds them on a seed space
 * disjoint from every prior Stage 3F.6 dataset and excludes every topology, record and world state
 * present in BOTH the Stage 3F.6-C corpus and the Stage 3F.6-T confirmatory set.
 *
 * Row format matches Stage 3F.6-T: decision-time DEPLOYABLE_CORE features (router input) plus the
 * authoritative per-policy outcomes of the frozen Stage 3F.6-A producers (offline labels only).
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
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_PROFILES, DeployableProfile, FeatureValueStatus } from '../src/stage3f/deployable-feature-contract-v1.js';
import { DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PRIOR_DATASETS = [
  'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz',
  'artifacts/stage3f6t-policy-router/confirmatory-holdout-ood.jsonl.gz',
];
const outDirectory = path.join(root, 'artifacts', 'stage3f6d-decision-rule');
const smokeMode = process.argv.includes('--smoke');
const dataPath = path.join(outDirectory, smokeMode ? 'smoke-holdout-ood.jsonl.gz' : 'confirmatory-holdout-ood.jsonl.gz');
const manifestPath = path.join(outDirectory, smokeMode ? 'smoke-holdout-ood-manifest.json' : 'confirmatory-holdout-ood-manifest.json');
const hex = (value) => createHash('sha256').update(value).digest('hex');

export const STAGE3F6D_CONFIRMATORY_SPEC = Object.freeze({
  version: 'STAGE3F6D_CONFIRMATORY_HOLDOUT_OOD_V1',
  curriculum: 'FORGE_CURRICULUM_V2',
  holdout: { levels: [0, 1, 2, 3, 4, 5], seeds: [801, 802, 803] },
  ood: { levels: [6, 7], seeds: [811] },
  priorSeedSpaces: [1, 2, 3, 11, 201, 202, 203, 211, 401, 402, 403, 411, 601, 602, 603, 611],
  priorDatasets: PRIOR_DATASETS,
  targets: smokeMode ? { HOLDOUT: 60, OOD: 60 } : { HOLDOUT: 6000, OOD: 6000 },
  reason: 'Stage 3F.6-T HOLDOUT/OOD were opened by Stage 3F.6-T; the decision rule is designed after inspecting them',
});

const RECORD_KEY_PREFIX = 16;
const toRecordKey = (actionId) => (typeof actionId === 'string' ? actionId.slice(0, RECORD_KEY_PREFIX) : null);
const orderedCombinations = (list, salt) => [...list]
  .map((combination) => ({ combination, key: sha256({ salt, ...combination }) }))
  .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((e) => e.combination);

async function main() {
  const spec = STAGE3F6D_CONFIRMATORY_SPEC;
  for (const seed of [...spec.holdout.seeds, ...spec.ood.seeds]) {
    if (spec.priorSeedSpaces.includes(seed)) throw new Error(`seed ${seed} collides with a prior stage`);
  }
  const priorHashes = {};
  const priorTopologies = new Set(); const priorRecords = new Set(); const priorWorlds = new Set();
  for (const relative of PRIOR_DATASETS) {
    const raw = gunzipSync(await readFile(path.join(root, relative))).toString('utf8');
    priorHashes[relative] = hex(raw);
    for (const r of raw.split('\n').filter(Boolean).map((l) => JSON.parse(l))) {
      priorTopologies.add(r.topologyHash); priorRecords.add(r.recordHash); priorWorlds.add(r.worldHash);
    }
  }

  const coreIds = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
  const counts = { HOLDOUT: 0, OOD: 0 };
  const rows = []; const seenTopology = new Map(); const seenRecords = new Set(); const seenWorlds = new Set();
  const rejected = {}; const reject = (k) => { rejected[k] = (rejected[k] ?? 0) + 1; };
  let attempted = 0;

  const consume = (combinations, partition, isOod) => {
    for (const combination of combinations) {
      if (counts[partition] >= spec.targets[partition]) break;
      attempted += 1;
      const built = buildRecordV2(combination, isOod);
      if (!built.admitted) { reject((built.failedChecks ?? [built.stoppedAt]).join(',')); continue; }
      const record = built.record;
      if (priorTopologies.has(record.topologyHash)) { reject('TOPOLOGY_IN_PRIOR_DATASET'); continue; }
      if (priorRecords.has(record.recordHash)) { reject('RECORD_IN_PRIOR_DATASET'); continue; }
      if (priorWorlds.has(record.worldHash)) { reject('WORLD_STATE_IN_PRIOR_DATASET'); continue; }
      const bound = seenTopology.get(record.topologyHash);
      if (bound !== undefined && bound !== partition) { reject('TOPOLOGY_BOUND_TO_OTHER_PARTITION'); continue; }
      if (seenRecords.has(record.recordHash)) { reject('DUPLICATE_RECORD'); continue; }
      if (seenWorlds.has(record.worldHash)) { reject('DUPLICATE_WORLD_STATE'); continue; }

      const state = forgeAdapterState(built.world);
      const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
      const legalActions = forgeLegalActions(state.world).map((a) => ({
        actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null, parameters: a.parameters,
      }));
      if (legalActions.length === 0) { reject('NO_LEGAL_ACTIONS'); continue; }
      const extracted = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
      const core = {}; let gap = null;
      for (const id of coreIds) {
        const e = extracted.features[id];
        if (e.status !== FeatureValueStatus.AVAILABLE) { gap = `${id}:${e.status}`; break; }
        core[id] = typeof e.value === 'boolean' ? (e.value ? 1 : 0) : e.value;
      }
      if (gap !== null) { reject(`CORE_FEATURE_UNAVAILABLE:${gap}`); continue; }

      const optimal = new Set(buildTarget(record).optimalSet);
      const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState,
        legalActions: legalActions.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
      const selector = nexusRelationalSelector({ branches: legalActions.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
      const chosen = { GREEDY: heuristicGreedyBaseline(record).actionId, NEXUS_SELECTOR: selector.abstain ? null : toRecordKey(selector.actionId) };
      for (const p of proposeAll({ observation, legalActions })) chosen[p.producerId] = p.action === null ? null : toRecordKey(p.action.actionId);
      const regretOf = (key) => { if (key === null) return null; const b = record.branches.find((x) => x.actionKey === key); return b ? record.optimalScalar - b.scalarReward : null; };

      seenTopology.set(record.topologyHash, partition); seenRecords.add(record.recordHash); seenWorlds.add(record.worldHash);
      counts[partition] += 1;
      rows.push({ partition, recordHash: record.recordHash, topologyHash: record.topologyHash, worldHash: record.worldHash,
        combination: { ...combination, ood: isOod }, core, chosen,
        correct: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, v === null ? null : (optimal.has(v) ? 1 : 0)])),
        regret: Object.fromEntries(Object.entries(chosen).map(([k, v]) => [k, regretOf(v)])) });
      if (rows.length % 1000 === 0) process.stderr.write(`[stage3f6d] ${rows.length} rows HOLDOUT=${counts.HOLDOUT} OOD=${counts.OOD}\n`);
    }
  };
  consume(orderedCombinations(enumerateCurriculumV2({ levels: spec.holdout.levels, seeds: spec.holdout.seeds }), 'STAGE3F6D_HOLDOUT'), 'HOLDOUT', false);
  consume(orderedCombinations(enumerateCurriculumV2({ levels: spec.ood.levels, seeds: spec.ood.seeds }), 'STAGE3F6D_OOD'), 'OOD', true);

  rows.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
  const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
  const topologiesOf = (name) => new Set(rows.filter((r) => r.partition === name).map((r) => r.topologyHash));
  const holdoutTopologies = topologiesOf('HOLDOUT');
  const manifest = {
    schemaVersion: 1, smokeMode, spec, featureContractHash: DEPLOYABLE_FEATURE_CONTRACT_HASH,
    proposalContractHash: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH, priorDatasetHashes: priorHashes,
    attempted, admitted: rows.length, counts, contentHash: hex(content),
    partitionHashes: Object.fromEntries(['HOLDOUT', 'OOD'].map((n) => [n, hex(rows.filter((r) => r.partition === n).map((r) => r.recordHash).sort().join('\n'))])),
    overlapWithPriorDatasets: {
      topology: rows.filter((r) => priorTopologies.has(r.topologyHash)).length,
      record: rows.filter((r) => priorRecords.has(r.recordHash)).length,
      state: rows.filter((r) => priorWorlds.has(r.worldHash)).length,
    },
    internalOverlap: {
      HOLDOUT_OOD_topology: [...topologiesOf('OOD')].filter((d) => holdoutTopologies.has(d)).length,
      record: rows.length - new Set(rows.map((r) => r.recordHash)).size,
      state: rows.length - new Set(rows.map((r) => r.worldHash)).size,
    },
    rejected, generator: 'scripts/generate-stage3f6d-confirmatory.mjs',
  };
  await mkdir(outDirectory, { recursive: true });
  await writeFile(dataPath, gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ admitted: rows.length, counts, contentHash: manifest.contentHash,
    overlapWithPriorDatasets: manifest.overlapWithPriorDatasets, internalOverlap: manifest.internalOverlap, rejected }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
