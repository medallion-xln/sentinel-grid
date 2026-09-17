#!/usr/bin/env node
/* STAGE_3F_6_P_1C — fresh DEV diagnostic evidence for the FORGE_SYMMETRIC_V2 candidate benchmark.
 *
 * Bounded fresh DEV sample on a NEW seed space, built by the symmetric generator, scored by the symmetric
 * oracle over the symmetric action surface, and tested against the certified FORGE_SYMMETRY_TRANSFORM_V1
 * geometry: legal surface, optimal set, regret, labels and RETREAT under five transforms.
 *
 * Also recorded, read-only and diagnostic: direction legality/optimality, material placement relative to the
 * actor, fixed-direction baselines, the resource-cost shortcut, and the frozen historical policies.
 * No policy is trained or modified. No historical corpus, generator, oracle or certificate is touched.
 * Usage: --shard=K --shards=N | --merge --shards=N
 */
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { FORGE_TOPOLOGY_SHAPE_IDS } from '../src/forge/topology.js';
import { FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS, FORGE_ROLE_COMPOSITIONS, FORGE_ROLE_COMPOSITION_IDS } from '../src/forge/scenarios-v2.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { forgeActionKey, hashWorld, legalActions, step } from '../src/forge/kernel.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { symmetricLegalActions, toKernelAction } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { evaluateCounterfactualsSymmetricV1, greedySafeSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { TRANSFORM_EQUIVALENT, orientAction, orientWorld } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { DECLARED_ACTION_COST_MODEL, proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { STAGE3F6P1C_PLAN, STAGE3F6P1C_PLAN_HASH } from './stage3f6p1c-analysis-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = 'artifacts/stage3f6p1c-symmetric-benchmark';
const hex = (v) => createHash('sha256').update(v).digest('hex');
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];
const DELTA = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
const TRANSFORMS = STAGE3F6P1C_PLAN.transformsTested;
const SEEDS = STAGE3F6P1C_PLAN.sample.seedSpace;
const TARGET = STAGE3F6P1C_PLAN.sample.target;
export const STAGE3F6P1C_POLICIES = Object.freeze(['GREEDY', 'RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);

/** Deterministic canonical sweep of the curriculum axes over the fresh seed space. */
export function combinations() {
  const out = [];
  for (const seed of SEEDS) for (const level of [0, 1, 2, 3, 4, 5]) for (const horizonBand of FORGE_HORIZON_BAND_IDS) {
    for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) for (const roles of FORGE_ROLE_COMPOSITION_IDS) for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
      out.push({ shape, roles, objectives, horizonBand, level, seed });
    }
  }
  return out;
}

function policyChoices(world, evaluation) {
  const observation = forgeWorldAdapter.observe(forgeAdapterState(world), FORGE_OBSERVER_ID);
  const surface = evaluation.branches.map((b) => ({ actionId: b.actionKey, actionType: b.actionType, targetEntityId: b.action.target?.id ?? null }));
  const out = {};
  const bestImmediate = Math.max(...evaluation.branches.map((b) => b.immediateScalar));
  out.GREEDY = [...evaluation.branches].filter((b) => b.immediateScalar === bestImmediate)
    .sort((a, b) => (a.canonicalKey < b.canonicalKey ? -1 : 1))[0].actionKey;
  for (const p of proposeAll({ observation, legalActions: surface })) {
    if (['RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1'].includes(p.producerId)) out[p.producerId] = p.action?.actionId ?? null;
  }
  const canonicalState = observation.metadata.canonicalState;
  const nexus = evaluateNexus({ canonicalState, legalActions: surface.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const v1 = nexusRelationalSelector({ branches: surface.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  out.NEXUS_SELECTOR_V1 = v1.abstain ? null : v1.actionId;
  out.NEXUS_SELECTOR_V2_CANDIDATE = nexusSelectorV2Candidate({ canonicalState, legalActions: surface }).action?.actionId ?? null;
  return out;
}

export function symmetricRow(combination) {
  const build = (warmupTicks) => generateScenarioSymmetricV1({ ...combination, warmupTicks });
  const warmup = runCalibratedWarmup(combination.seed, build);
  const config = warmup.scenarioConfig;
  const world = warmup.world;
  const history = world.history;
  const historyValid = history.length === warmup.warmupTicks + 1 && history.every((frame, index) => frame.tick === index) && !warmup.channelClamped;
  if (!historyValid) return { admitted: false, reason: 'HISTORY_NOT_VALID' };
  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === combination.roles);
  const validation = validateScenarioV2(world, { ...combination, horizon: config.horizon,
    roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes } });
  if (!validation.valid) return { admitted: false, reason: validation.failedChecks[0] ?? 'INVALID' };

  const horizon = Math.max(1, config.horizon);
  const evaluation = evaluateCounterfactualsSymmetricV1(world, { horizon });
  if (evaluation.branchCount === 0) return { admitted: false, reason: 'NO_LEGAL_ACTIONS' };
  const label = greedySafeSymmetricV1(world, { horizon });
  const size = world.grid.width;
  const optimal = new Set(evaluation.optimalActionKeys);
  const regretOf = new Map(evaluation.branches.map((b) => [b.actionKey, b.regret]));
  const actor = world.entities.find((e) => e.id === 'actor');

  /* the symmetric surface must reach exactly the successor states the kernel surface reaches */
  const symStates = new Set(symmetricLegalActions(world).map((a) => hashWorld(step(world, toKernelAction(world, a)).state)));
  const kernelStates = new Set(legalActions(world).map((a) => hashWorld(step(world, a).state)));
  const successorCoverage = symStates.size === kernelStates.size && [...kernelStates].every((s) => symStates.has(s));

  const moves = evaluation.branches.filter((b) => b.actionType === 'MOVE');
  const directionLegal = Object.fromEntries(DIRECTIONS.map((d) => [d, moves.some((m) => m.action.parameters.direction === d) ? 1 : 0]));
  const directionOptimal = Object.fromEntries(DIRECTIONS.map((d) => {
    const m = moves.find((x) => x.action.parameters.direction === d);
    return [d, m ? (optimal.has(m.actionKey) ? 1 : 0) : null];
  }));
  const lowestIdentityMove = [...moves].sort((a, b) => (a.actionKey < b.actionKey ? -1 : 1))[0] ?? null;
  const material = world.entities.find((e) => e.id === 'material');
  const materialDirection = material === undefined ? null : (() => {
    const dx = material.position.x - actor.position.x; const dy = material.position.y - actor.position.y;
    const exact = DIRECTIONS.find((d) => DELTA[d][0] === dx && DELTA[d][1] === dy);
    return exact ?? (Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'EAST_FAR' : 'WEST_FAR') : (dy > 0 ? 'SOUTH_FAR' : 'NORTH_FAR'));
  })();
  const zeroCostOptimalExists = evaluation.branches.some((b) => optimal.has(b.actionKey) && DECLARED_ACTION_COST_MODEL.cost[b.actionType] === 0);
  const policies = policyChoices(world, evaluation);
  const policyOutcome = Object.fromEntries(STAGE3F6P1C_POLICIES.map((p) => {
    const key = policies[p] ?? null;
    return [p, { chosen: key, actionType: key === null ? null : evaluation.branches.find((b) => b.actionKey === key)?.actionType ?? null,
      correct: key === null ? null : (optimal.has(key) ? 1 : 0), regret: key === null ? null : regretOf.get(key) ?? null }];
  }));

  const transforms = {};
  for (const transform of TRANSFORMS) {
    const orientation = TRANSFORM_EQUIVALENT[transform];
    const transformed = orientWorld(orientation, world);
    const te = evaluateCounterfactualsSymmetricV1(transformed, { horizon });
    const tl = greedySafeSymmetricV1(transformed, { horizon });
    const mapKey = new Map(evaluation.branches.map((b) => [b.actionKey, forgeActionKey(orientAction(orientation, b.action, size))]));
    const actualKeys = new Set(te.branches.map((b) => b.actionKey));
    const legalEquivariant = actualKeys.size === mapKey.size && [...mapKey.values()].every((k) => actualKeys.has(k));
    const mappedOptimal = new Set(evaluation.optimalActionKeys.map((k) => mapKey.get(k)));
    const optimalEquivariant = te.optimalActionKeys.length === mappedOptimal.size && te.optimalActionKeys.every((k) => mappedOptimal.has(k));
    const tRegret = new Map(te.branches.map((b) => [b.actionKey, b.regret]));
    let regretCompared = 0; let regretMismatches = 0;
    for (const b of evaluation.branches) { const mapped = tRegret.get(mapKey.get(b.actionKey)); if (mapped === undefined) continue; regretCompared += 1; if (mapped !== b.regret) regretMismatches += 1; }
    const retreatW = evaluation.branches.find((b) => b.actionType === 'RETREAT');
    const retreatT = te.branches.find((b) => b.actionType === 'RETREAT');
    const retreatEquivariant = retreatW === undefined && retreatT === undefined ? null
      : retreatW !== undefined && retreatT !== undefined && mapKey.get(retreatW.actionKey) === retreatT.actionKey ? 1 : 0;
    transforms[transform] = {
      legalEquivariant: legalEquivariant ? 1 : 0, optimalEquivariant: optimalEquivariant ? 1 : 0,
      regretCompared, regretMismatches, regretEquivariant: regretMismatches === 0 ? 1 : 0,
      labelEquivariant: tl.greedySafe === label.greedySafe && tl.horizonClass === label.horizonClass && tl.greedyRegret === label.greedyRegret ? 1 : 0,
      greedySafeT: tl.greedySafe, retreatEquivariant, canonicalFrameT: te.canonicalFrame, canonicalFrameDigestTiedT: te.canonicalFrameDigestTied ? 1 : 0,
      directionOptimalT: Object.fromEntries(DIRECTIONS.map((d) => { const m = te.branches.find((x) => x.actionType === 'MOVE' && x.action.parameters.direction === d); return [d, m ? (te.optimalActionKeys.includes(m.actionKey) ? 1 : 0) : null]; })),
      mappedOptimalDirectionPreserved: (() => { const src = moves.filter((m) => optimal.has(m.actionKey)); if (!src.length) return null;
        return src.every((m) => te.optimalActionKeys.includes(mapKey.get(m.actionKey))) ? 1 : 0; })(),
    };
  }

  return {
    admitted: true, combination, orientation: config.orientation, worldHash: hashWorld(world), horizon,
    gridSize: size, branchCount: evaluation.branchCount, optimalSetSize: evaluation.tieCount,
    canonicalFrame: evaluation.canonicalFrame, canonicalFrameDigestTied: evaluation.canonicalFrameDigestTied ? 1 : 0,
    successorCoverage: successorCoverage ? 1 : 0,
    greedySafe: label.greedySafe, greedyRegret: label.greedyRegret, horizonClass: label.horizonClass,
    directionLegal, directionOptimal, materialDirection,
    lowestIdentityMove: lowestIdentityMove === null ? null : { direction: lowestIdentityMove.action.parameters.direction, optimal: optimal.has(lowestIdentityMove.actionKey) ? 1 : 0 },
    randomMoveExpectedAccuracy: moves.length ? moves.filter((m) => optimal.has(m.actionKey)).length / moves.length : null,
    moveOptimalRow: moves.some((m) => optimal.has(m.actionKey)) ? 1 : 0, legalMoveCount: moves.length,
    zeroCostOptimalExists: zeroCostOptimalExists ? 1 : 0, policies: policyOutcome, transforms,
  };
}

async function main() {
  const shards = Number(process.argv.find((a) => a.startsWith('--shards='))?.split('=')[1] ?? 1);
  await mkdir(path.join(root, OUT), { recursive: true });
  if (process.argv.includes('--merge')) {
    const rows = [];
    for (let k = 0; k < shards; k += 1) {
      const file = path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`);
      rows.push(...(await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    }
    rows.sort((a, b) => (a.worldHash < b.worldHash ? -1 : 1));
    const content = `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
    const manifest = { schemaVersion: 1, benchmark: STAGE3F6P1C_PLAN.benchmark.id, partition: 'FRESH_DEV_DIAGNOSTIC', planHash: STAGE3F6P1C_PLAN_HASH,
      seedSpace: SEEDS, target: TARGET, admitted: rows.length, historicalCorporaRead: false, sealedPartitionsRead: false,
      contentHash: hex(content), generator: 'scripts/generate-stage3f6p1c-symmetric-evidence.mjs' };
    await writeFile(path.join(root, OUT, 'symmetric-dev-evidence.jsonl.gz'), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    await writeFile(path.join(root, OUT, 'symmetric-dev-evidence-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    for (let k = 0; k < shards; k += 1) await unlink(path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`));
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const shard = Number(process.argv.find((a) => a.startsWith('--shard='))?.split('=')[1] ?? 0);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? TARGET);
  const all = combinations();
  const lines = [];
  for (let index = 0; index < all.length && lines.length * shards < limit; index += 1) {
    if (index % shards !== shard) continue;
    const row = symmetricRow(all[index]);
    if (!row.admitted) continue;
    lines.push(JSON.stringify(row));
    if (lines.length % 50 === 0) process.stderr.write(`[stage3f6p1c shard ${shard}] ${lines.length}\n`);
  }
  await writeFile(path.join(root, OUT, `shard-${shard}-of-${shards}.jsonl`), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ shard, shards, rows: lines.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
