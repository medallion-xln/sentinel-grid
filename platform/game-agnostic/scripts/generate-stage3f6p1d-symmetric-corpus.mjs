#!/usr/bin/env node
/* STAGE_3F_6_P_1D — FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1.
 *
 * A NEW corpus lineage on a fresh seed space under the certified symmetric benchmark. It does not replace,
 * correct or reuse the Forge V1 corpus; the V1 lineage keeps its own identity and still reproduces.
 *
 * Each record separates three things that must never blur:
 *   core      DEPLOYABLE_CORE features — the only router-input surface. A missing CORE feature rejects the
 *             row; nothing is imputed or zero-filled.
 *   label     FORGE_GREEDY_SAFE_SYMMETRIC_V1 outcome fields.
 *   actions   per-action regret and optimal-set membership, plus the frozen policies' choices, so later
 *             stages can evaluate offline without regenerating.
 *
 * Admission order is canonical across the whole lineage, and a candidate whose record, world or topology
 * hash is already claimed anywhere in the lineage is rejected, so every partition pair is disjoint by
 * construction. Generation refuses to start unless every benchmark contract hash matches Stage 3F.6-P.1C.
 * Usage: --shard=K --shards=N [--partition=DEV] | --merge --shards=N | --verify-slice
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { sha256 } from '../src/core/determinism.js';
import { FORGE_TOPOLOGY_SHAPE_IDS } from '../src/forge/topology.js';
import { FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITIONS, FORGE_ROLE_COMPOSITION_IDS } from '../src/forge/scenarios-v2.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { forgeActionKey, hashWorld, topologyHash } from '../src/forge/kernel.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import {
  FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT_HASH, FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID, FORGE_SYMMETRIC_BENCHMARK_ID, generateScenarioSymmetricV1,
} from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT_HASH, FORGE_ACTION_SURFACE_SYMMETRIC_ID } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {
  FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT_HASH, FORGE_COUNTERFACTUAL_SYMMETRIC_ID, FORGE_GREEDY_SAFE_SYMMETRIC_ID,
  evaluateCounterfactualsSymmetricV1, greedySafeSymmetricV1,
} from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { FORGE_ORIENTATION_SYMMETRIC_CONTRACT_HASH, FORGE_ORIENTATION_SYMMETRIC_ID, TRANSFORM_EQUIVALENT, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { DeployableProfile, DEPLOYABLE_FEATURE_CONTRACT_ID, DEPLOYABLE_PROFILES, FeatureValueStatus } from '../src/stage3f/deployable-feature-contract-v1.js';
import { extractDeployableFeatures } from '../src/stage3f/deployable-feature-extractor-v1.js';
import { DECLARED_ACTION_COST_MODEL, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { STAGE3F6P1D_PLAN, STAGE3F6P1D_PLAN_HASH } from './stage3f6p1d-corpus-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = 'artifacts/stage3f6p1d-symmetric-corpus';
const hex = (v) => createHash('sha256').update(v).digest('hex');
const K16 = (k) => k.slice(0, 16);
const plan = STAGE3F6P1D_PLAN;
const PARTITIONS = ['DEV', 'CAL', 'HOLDOUT', 'OOD'];
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const DELTA = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
const CORE_IDS = DEPLOYABLE_PROFILES[DeployableProfile.DEPLOYABLE_CORE].featureIds;
export const STAGE3F6P1D_PRODUCERS = Object.freeze(['GREEDY', 'RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE',
  'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'RANDOM_LEGAL_V1']);

/** Generation refuses to start unless the benchmark is exactly the one Stage 3F.6-P.1C certified. */
export function benchmarkBinding() {
  const certificate = JSON.parse(readFileSync(path.join(root, 'artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json')));
  const b = certificate.benchmark;
  const live = {
    BENCHMARK_ID: FORGE_SYMMETRIC_BENCHMARK_ID, GENERATOR_ID: FORGE_SCENARIO_GENERATOR_SYMMETRIC_ID, ORACLE_ID: FORGE_COUNTERFACTUAL_SYMMETRIC_ID,
    SURFACE_ID: FORGE_ACTION_SURFACE_SYMMETRIC_ID, ORIENTATION_ID: FORGE_ORIENTATION_SYMMETRIC_ID, LABEL_ID: FORGE_GREEDY_SAFE_SYMMETRIC_ID,
    GENERATOR_CONTRACT_HASH: FORGE_SCENARIO_GENERATOR_SYMMETRIC_CONTRACT_HASH, ORACLE_CONTRACT_HASH: FORGE_COUNTERFACTUAL_SYMMETRIC_CONTRACT_HASH,
    SURFACE_CONTRACT_HASH: FORGE_ACTION_SURFACE_SYMMETRIC_CONTRACT_HASH, ORIENTATION_CONTRACT_HASH: FORGE_ORIENTATION_SYMMETRIC_CONTRACT_HASH,
  };
  for (const [key, value] of Object.entries(live)) {
    if (b[key] !== value) throw new Error(`BENCHMARK_MISMATCH: ${key} is ${value} but Stage 3F.6-P.1C certified ${b[key]}`);
  }
  if (certificate.certificationHash !== plan.benchmark.stage3f6p1cCertification) throw new Error('BENCHMARK_MISMATCH: Stage 3F.6-P.1C certification hash differs');
  return { ...live, featureContract: DEPLOYABLE_FEATURE_CONTRACT_ID, featureCount: CORE_IDS.length, stage3f6p1cCertification: certificate.certificationHash };
}

/** Canonical combination sweep for one partition: seeds x levels x horizon bands x objectives x roles x shapes. */
export function combinationsFor(partition) {
  const out = [];
  for (const seed of plan.seeds[partition]) for (const level of plan.splits.levels[partition]) for (const horizonBand of FORGE_HORIZON_BAND_IDS) {
    for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) for (const roles of FORGE_ROLE_COMPOSITION_IDS) for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
      out.push({ shape, roles, objectives, horizonBand, level, seed });
    }
  }
  return out;
}

function coreFeatures(observation, legalActions) {
  const extracted = extractDeployableFeatures({ observation, legalActions, profile: DeployableProfile.DEPLOYABLE_CORE });
  const values = {}; const missing = [];
  for (const featureId of CORE_IDS) {
    const entry = extracted.features[featureId];
    if (entry.status !== FeatureValueStatus.AVAILABLE) { missing.push({ featureId, status: entry.status }); continue; }
    values[featureId] = typeof entry.value === 'boolean' ? (entry.value ? 1 : 0) : entry.value;
  }
  return { values, missing };
}

function policyChoices(world, observation, evaluation) {
  const surface = evaluation.branches.map((b) => ({ actionId: b.actionKey, actionType: b.actionType, targetEntityId: b.action.target?.id ?? null }));
  const out = {};
  const bestImmediate = Math.max(...evaluation.branches.map((b) => b.immediateScalar));
  out.GREEDY = [...evaluation.branches].filter((b) => b.immediateScalar === bestImmediate).sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1))[0].actionKey;
  for (const proposal of proposeAll({ observation, legalActions: surface })) out[proposal.producerId] = proposal.action?.actionId ?? null;
  const canonicalState = observation.metadata.canonicalState;
  const nexus = evaluateNexus({ canonicalState, legalActions: surface.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const v1 = nexusRelationalSelector({ branches: surface.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  out.NEXUS_SELECTOR_V1 = v1.abstain ? null : v1.actionId;
  out.NEXUS_SELECTOR_V2_CANDIDATE = nexusSelectorV2Candidate({ canonicalState, legalActions: surface }).action?.actionId ?? null;
  return Object.fromEntries(STAGE3F6P1D_PRODUCERS.map((p) => [p, out[p] === undefined || out[p] === null ? null : K16(out[p])]));
}

function equivarianceCheck(world, horizon, evaluation, label, observation, legalSurface) {
  const size = world.grid.width;
  const baseCore = coreFeatures(observation, legalSurface).values;
  const perTransform = {};
  for (const transform of plan.equivarianceGate.transforms) {
    const orientation = TRANSFORM_EQUIVALENT[transform];
    const transformed = orientWorld(orientation, world);
    const te = evaluateCounterfactualsSymmetricV1(transformed, { horizon });
    const tl = greedySafeSymmetricV1(transformed, { horizon });
    const mapKey = new Map(evaluation.branches.map((b) => [b.actionKey, forgeActionKey(orientAction(orientation, b.action, size))]));
    const actual = new Set(te.branches.map((b) => b.actionKey));
    /* the frozen generator can emit the same action descriptor twice (a duplicated dependsOn relation yields two
     * identical BYPASS actions), so optimal keys are a MULTISET; equivariance is compared over distinct identities. */
    const transformedOptimal = new Set(te.optimalActionKeys);
    const mappedOptimal = new Set(evaluation.optimalActionKeys.map((k) => mapKey.get(k)));
    const tRegret = new Map(te.branches.map((b) => [b.actionKey, b.regret]));
    const tObservation = forgeWorldAdapter.observe(forgeAdapterState(transformed), FORGE_OBSERVER_ID);
    const tSurface = te.branches.map((b) => ({ actionId: b.actionKey, actionType: b.actionType, targetEntityId: b.action.target?.id ?? null }));
    const tCore = coreFeatures(tObservation, tSurface).values;
    perTransform[transform] = {
      legal: actual.size === mapKey.size && [...mapKey.values()].every((k) => actual.has(k)) ? 1 : 0,
      optimal: transformedOptimal.size === mappedOptimal.size && [...transformedOptimal].every((k) => mappedOptimal.has(k)) ? 1 : 0,
      regret: evaluation.branches.every((b) => tRegret.get(mapKey.get(b.actionKey)) === b.regret) ? 1 : 0,
      label: tl.greedySafe === label.greedySafe && tl.greedyRegret === label.greedyRegret && tl.horizonClass === label.horizonClass ? 1 : 0,
      coreFeatureInvariant: JSON.stringify(tCore) === JSON.stringify(baseCore) ? 1 : 0,
    };
  }
  return perTransform;
}

export function corpusRecord(partition, combination, combinationIndex, { withEquivariance = false } = {}) {
  const warmup = runCalibratedWarmup(combination.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...combination, warmupTicks }));
  const config = warmup.scenarioConfig;
  const world = warmup.world;
  const history = world.history;
  if (!(history.length === warmup.warmupTicks + 1 && history.every((frame, index) => frame.tick === index) && !warmup.channelClamped)) return { admitted: false, reason: 'HISTORY_NOT_VALID' };
  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === combination.roles);
  const validation = validateScenarioV2(world, { ...combination, horizon: config.horizon,
    roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes } });
  if (!validation.valid) return { admitted: false, reason: validation.failedChecks[0] ?? 'INVALID_SCENARIO' };

  const horizon = Math.max(1, config.horizon);
  const evaluation = evaluateCounterfactualsSymmetricV1(world, { horizon });
  if (evaluation.branchCount === 0) return { admitted: false, reason: 'NO_LEGAL_ACTIONS' };
  const label = greedySafeSymmetricV1(world, { horizon });
  const observation = forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
  const legalSurface = evaluation.branches.map((b) => ({ actionId: b.actionKey, actionType: b.actionType, targetEntityId: b.action.target?.id ?? null }));
  const core = coreFeatures(observation, legalSurface);
  if (core.missing.length > 0) return { admitted: false, reason: `CORE_FEATURE_UNAVAILABLE:${core.missing[0].featureId}:${core.missing[0].status}` };

  const optimal = new Set(evaluation.optimalActionKeys);
  const actor = world.entities.find((entity) => entity.id === 'actor');
  const material = world.entities.find((entity) => entity.id === 'material');
  const actions = Object.fromEntries(evaluation.branches.map((b) => [K16(b.actionKey), {
    t: b.actionType, target: b.action.target?.id ?? null, dir: b.action.parameters?.direction ?? null,
    c: DECLARED_ACTION_COST_MODEL.cost[b.actionType] ?? null, i: b.immediateScalar, s: b.totalScalar, r: b.regret, o: optimal.has(b.actionKey) ? 1 : 0,
  }]));
  const moves = evaluation.branches.filter((b) => b.actionType === 'MOVE');
  const body = {
    corpusId: plan.corpusId, benchmarkId: FORGE_SYMMETRIC_BENCHMARK_ID, oracleId: FORGE_COUNTERFACTUAL_SYMMETRIC_ID, labelId: FORGE_GREEDY_SAFE_SYMMETRIC_ID,
    partition, combination, orientation: config.orientation, canonicalFrame: evaluation.canonicalFrame,
    worldHash: hashWorld(world), topologyHash: topologyHash(world), horizon, optimalScalar: evaluation.optimalScalar, actions,
    label: { labelId: label.labelId, greedySafe: label.greedySafe, greedyRegret: label.greedyRegret, horizonClass: label.horizonClass, optimalSetSize: label.optimalSetSize },
  };
  return {
    admitted: true, partition, combinationIndex, combination, orientation: config.orientation,
    recordHash: sha256(body), worldHash: body.worldHash, topologyHash: body.topologyHash, horizon,
    core: core.values, coreMissing: core.missing, label: body.label, actions,
    policies: policyChoices(world, observation, evaluation),
    materialDirection: material === undefined ? null : (DIRECTIONS.find((d) => DELTA[d][0] === material.position.x - actor.position.x && DELTA[d][1] === material.position.y - actor.position.y) ?? 'BEYOND_ADJACENT'),
    directionLegal: Object.fromEntries(DIRECTIONS.map((d) => [d, moves.some((m) => m.action.parameters.direction === d) ? 1 : 0])),
    directionOptimal: Object.fromEntries(DIRECTIONS.map((d) => { const m = moves.find((x) => x.action.parameters.direction === d); return [d, m ? (optimal.has(m.actionKey) ? 1 : 0) : null]; })),
    lowestIdentityMove: moves.length === 0 ? null : (() => { const m = [...moves].sort((a, b) => (a.actionKey < b.actionKey ? -1 : 1))[0];
      return { direction: m.action.parameters.direction, optimal: optimal.has(m.actionKey) ? 1 : 0 }; })(),
    randomMoveExpectedAccuracy: moves.length ? moves.filter((m) => optimal.has(m.actionKey)).length / moves.length : null,
    moveOptimalRow: moves.some((m) => optimal.has(m.actionKey)) ? 1 : 0,
    zeroCostOptimalExists: evaluation.branches.some((b) => optimal.has(b.actionKey) && DECLARED_ACTION_COST_MODEL.cost[b.actionType] === 0) ? 1 : 0,
    duplicateActionKeys: evaluation.branches.length - new Set(evaluation.branches.map((b) => b.actionKey)).size,
    equivariance: withEquivariance ? equivarianceCheck(world, horizon, evaluation, label, observation, legalSurface) : null,
  };
}

async function main() {
  const binding = benchmarkBinding();
  const shards = Number(process.argv.find((a) => a.startsWith('--shards='))?.split('=')[1] ?? 1);
  await mkdir(path.join(root, OUT), { recursive: true });

  if (process.argv.includes('--merge') || process.argv.includes('--verify-slice')) {
    const verifySlice = process.argv.includes('--verify-slice');
    const candidates = [];
    for (let k = 0; k < shards; k += 1) {
      const file = path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`);
      candidates.push(...(await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    }
    candidates.sort((a, b) => (PARTITIONS.indexOf(a.partition) - PARTITIONS.indexOf(b.partition)) || (a.combinationIndex - b.combinationIndex));
    const claimedRecord = new Set(); const claimedWorld = new Set(); const claimedTopology = new Set();
    const admitted = []; const counts = Object.fromEntries(PARTITIONS.map((p) => [p, 0])); const rejected = {};
    for (const candidate of candidates) {
      if (counts[candidate.partition] >= plan.splits[candidate.partition]) continue;
      const clash = claimedRecord.has(candidate.recordHash) ? 'RECORD_HASH_CLAIMED'
        : claimedWorld.has(candidate.worldHash) ? 'WORLD_HASH_CLAIMED' : claimedTopology.has(candidate.topologyHash) ? 'TOPOLOGY_HASH_CLAIMED' : null;
      if (clash !== null) { rejected[clash] = (rejected[clash] ?? 0) + 1; continue; }
      claimedRecord.add(candidate.recordHash); claimedWorld.add(candidate.worldHash); claimedTopology.add(candidate.topologyHash);
      counts[candidate.partition] += 1; admitted.push(candidate);
    }
    const content = `${admitted.map((r) => JSON.stringify(r)).join('\n')}\n`;
    if (verifySlice) {
      const slice = PARTITIONS.flatMap((p) => admitted.filter((r) => r.partition === p).slice(0, 250));
      console.log(JSON.stringify({ verifySlice: true, rows: slice.length, sliceHash: hex(`${slice.map((r) => JSON.stringify(r)).join('\n')}\n`) }));
      return;
    }
    const manifest = {
      schemaVersion: 1, corpusId: plan.corpusId, planHash: STAGE3F6P1D_PLAN_HASH, benchmark: binding,
      seeds: plan.seeds, targets: plan.splits, counts, attempted: candidates.length, admitted: admitted.length,
      rejectedAtMerge: rejected, oodCriteria: plan.oodCriteria.OOD_CRITERIA,
      sealed: ['HOLDOUT', 'OOD'], historicalCorporaRead: false, contentHash: hex(content),
      generator: 'scripts/generate-stage3f6p1d-symmetric-corpus.mjs', workers: shards,
    };
    await writeFile(path.join(root, OUT, 'symmetric-corpus-v1.jsonl.gz'), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    await writeFile(path.join(root, OUT, 'symmetric-corpus-v1-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    for (let k = 0; k < shards; k += 1) await unlink(path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`));
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  const shard = Number(process.argv.find((a) => a.startsWith('--shard='))?.split('=')[1] ?? 0);
  const only = process.argv.find((a) => a.startsWith('--partition='))?.split('=')[1] ?? null;
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
  const lines = [];
  for (const partition of PARTITIONS) {
    if (only !== null && partition !== only) continue;
    const cap = limit || Math.ceil((plan.splits[partition] / shards) * 1.3);
    const all = combinationsFor(partition);
    let produced = 0;
    for (let index = 0; index < all.length && produced < cap; index += 1) {
      if (index % shards !== shard) continue;
      const record = corpusRecord(partition, all[index], index, { withEquivariance: index % 25 === 0 });
      if (!record.admitted) continue;
      lines.push(JSON.stringify(record)); produced += 1;
      if (produced % 100 === 0) process.stderr.write(`[stage3f6p1d ${partition} shard ${shard}] ${produced}/${cap}\n`);
    }
  }
  await writeFile(path.join(root, OUT, `shard-${shard}-of-${shards}.jsonl`), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ shard, shards, rows: lines.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
