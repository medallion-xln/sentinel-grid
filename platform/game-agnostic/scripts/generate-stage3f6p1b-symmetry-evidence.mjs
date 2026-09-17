#!/usr/bin/env node
/* STAGE_3F_6_P_1B — Forge directional symmetry evidence (DEV only, diagnostic).
 *
 * For every DEV decision point W of the Stage 3F.6-C corpus and every symmetry T (IDENTITY control plus four
 * rotations/reflections), rebuild W exactly as the certified record did, build T(W) with the diagnostic transform,
 * and measure: transform validity, legal-surface equivariance, official-oracle optimal-set and regret equivariance,
 * GREEDY_SAFE and horizon-class label equivariance, frozen-policy equivariance, and per-direction MOVE optimality.
 *
 * Attribution: where the official optimal set is not equivariant, T(W) is re-scored by a REPLICA of the official
 * oracle whose only change is that continuation ties are broken by each action's identity in W's frame. The replica
 * is verified to reproduce the official oracle exactly (with the official tie-break) on every 10th row in both frames.
 *
 * Nothing historical is modified: no generator, kernel, corpus, record or earlier evidence is written.
 * Usage: --shard=K --shards=N (writes a shard) | --merge --shards=N (writes evidence + manifest).
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildRecordV2 } from '../src/forge/record-v2.js';
import { CONTINUATION_POLICIES, classifyHorizonDependence, evaluateCounterfactualsV2 } from '../src/forge/counterfactual-v2.js';
import { addRewardV2Vectors, emptyRewardV2Vector, rewardV2For, scalarizeRewardV2 } from '../src/forge/reward-v2.js';
import { cloneWorld, forgeActionKey, isTerminal, legalActions, step } from '../src/forge/kernel.js';
import { FORGE_OBSERVER_ID, forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { heuristicGreedyBaseline, nexusRelationalSelector } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { proposeAll } from '../src/stage3f/deployable-action-proposal-v1.js';
import { nexusSelectorV2Candidate } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { INVERSE_TRANSFORM, SYMMETRY_TRANSFORM_IDS, transformAction, transformWorld } from '../src/stage3f/forge-symmetry-transform-v1.js';
import { STAGE3F6P1B_PLAN_HASH } from './stage3f6p1b-analysis-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const OUT = 'artifacts/stage3f6p1b-directional-symmetry';
const hex = (v) => createHash('sha256').update(v).digest('hex');
const K16 = (key) => key.slice(0, 16);
export const STAGE3F6P1B_POLICIES = Object.freeze(['GREEDY', 'RESOURCE_PRESERVING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1']);
const DIRECTIONS = ['EAST', 'NORTH', 'SOUTH', 'WEST'];

/* ---------------------------------------------------------------- replica oracle (diagnostic) */
function transitionV2(world, action) {
  const outcome = step(world, action);
  const vector = rewardV2For({ before: world, after: outcome.state, v1Vector: outcome.rewardVector, events: outcome.events, terminal: outcome.terminal, outcome: outcome.outcome });
  return { state: outcome.state, vector, scalar: scalarizeRewardV2(vector) };
}
export function replicaScalars(world, horizon, tieKey) {
  const policy = CONTINUATION_POLICIES.GREEDY_CONTINUATION_V1;
  const continuation = (w) => {
    let best = null;
    for (const a of legalActions(w)) {
      const r = transitionV2(w, a); const rank = policy.rank({ scalar: r.scalar, vector: r.vector }); const key = tieKey(a);
      if (best === null || rank > best.rank || (rank === best.rank && key < best.key)) best = { a, rank, key };
    }
    return best === null ? null : best.a;
  };
  const scalars = new Map();
  for (const action of legalActions(world)) {
    const immediate = transitionV2(cloneWorld(world), action);
    let current = immediate.state; let accumulated = emptyRewardV2Vector();
    for (let depth = 0; depth < horizon; depth += 1) {
      if (isTerminal(current)) break;
      const next = continuation(current); if (next === null) break;
      const r = transitionV2(current, next); accumulated = addRewardV2Vectors(accumulated, r.vector); current = r.state;
    }
    scalars.set(K16(forgeActionKey(action)), scalarizeRewardV2(addRewardV2Vectors(immediate.vector, accumulated)));
  }
  return scalars;
}
const optimalOf = (scalars) => { const best = Math.max(...scalars.values()); return new Set([...scalars].filter(([, v]) => v === best).map(([k]) => k)); };
const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

/* ---------------------------------------------------------------- policies in one frame */
function policyChoices(world, deep) {
  const state = forgeAdapterState(world);
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const kernel = legalActions(world);
  const surface = kernel.map((a) => ({ actionId: forgeActionKey(a), actionType: a.actionType, targetEntityId: a.target?.id ?? null }));
  const byKey = new Map(kernel.map((a) => [forgeActionKey(a), a]));
  const out = {};
  const greedy = heuristicGreedyBaseline({ branches: deep.branches.map((b) => ({ actionKey: b.actionKey, immediateScalar: b.immediateScalar })) });
  out.GREEDY = greedy.abstain ? null : greedy.actionId;
  for (const p of proposeAll({ observation, legalActions: surface })) if (['RESOURCE_PRESERVING_V1', 'OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1'].includes(p.producerId)) out[p.producerId] = p.action?.actionId ?? null;
  const canonicalState = observation.metadata.canonicalState;
  const nexus = evaluateNexus({ canonicalState, legalActions: surface.map((e) => ({ actionId: e.actionId, targetEntityId: e.targetEntityId })) });
  const v1 = nexusRelationalSelector({ branches: surface.map((e) => ({ actionKey: e.actionId, actionType: e.actionType })) }, nexus);
  out.NEXUS_SELECTOR_V1 = v1.abstain ? null : v1.actionId;
  out.NEXUS_SELECTOR_V2_CANDIDATE = nexusSelectorV2Candidate({ canonicalState, legalActions: surface }).action?.actionId ?? null;
  return { choices: out, byKey };
}

function directionOptimality(world, optimalKeys) {
  const moves = legalActions(world).filter((a) => a.actionType === 'MOVE');
  return Object.fromEntries(DIRECTIONS.map((d) => { const m = moves.find((a) => a.parameters.direction === d); return [d, m ? (optimalKeys.has(K16(forgeActionKey(m))) ? 1 : 0) : null]; }));
}

/* ---------------------------------------------------------------- one row */
export function symmetryRow(row, index) {
  const c = row.combination;
  const built = buildRecordV2({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed }, c.ood);
  if (!built.admitted || built.record.recordHash !== row.recordHash) return { recordHash: row.recordHash, rebuildMismatch: true };
  const { world, record, horizonLength: horizon } = built;
  const dims = { width: world.grid.width, height: world.grid.height };
  const wScalars = new Map(record.branches.map((b) => [b.actionKey, b.scalarReward]));
  const wOptimal = optimalOf(wScalars);
  const wGreedy = heuristicGreedyBaseline(record).actionId;
  const wKernel = legalActions(world);
  const immediateW = new Map(record.branches.map((b) => [b.actionKey, b.immediateScalar]));
  const wPolicies = policyChoices(world, { branches: wKernel.map((a) => ({ actionKey: forgeActionKey(a), immediateScalar: immediateW.get(K16(forgeActionKey(a))) })) });
  const fidelitySample = index % 10 === 0;
  const replicaFidelityW = fidelitySample ? [...replicaScalars(world, horizon, forgeActionKey)].every(([k, v]) => wScalars.get(k) === v) : null;

  const transforms = {};
  for (const id of SYMMETRY_TRANSFORM_IDS) {
    let tw;
    try { tw = transformWorld(id, world); legalActions(tw); } catch (error) { transforms[id] = { valid: false, error: String(error.message) }; continue; }
    const tDims = { width: tw.grid.width, height: tw.grid.height };
    const mapKey = new Map(wKernel.map((a) => [K16(forgeActionKey(a)), K16(forgeActionKey(transformAction(id, a, dims)))]));
    const tKernel = legalActions(tw);
    const tKeys = new Set(tKernel.map((a) => K16(forgeActionKey(a))));
    const mappedKeys = new Set(mapKey.values());
    const legalEquivariant = sameSet(tKeys, mappedKeys);
    const missing = wKernel.filter((a) => !tKeys.has(mapKey.get(K16(forgeActionKey(a))))).map((a) => a.actionType);
    const extra = tKernel.filter((a) => !mappedKeys.has(K16(forgeActionKey(a)))).map((a) => a.actionType);

    const deep = evaluateCounterfactualsV2(tw, { horizon });
    const horizonT = classifyHorizonDependence(tw, { horizon, deepEvaluation: deep });
    const tScalars = new Map(deep.branches.map((b) => [K16(b.actionKey), b.totalScalar]));
    const tOptimal = optimalOf(tScalars);
    const mappedOptimal = new Set([...wOptimal].map((k) => mapKey.get(k)));
    const optimalSetEquivariant = sameSet(tOptimal, mappedOptimal);
    let compared = 0; let mismatches = 0; let maxAbs = 0;
    for (const [k, v] of wScalars) {
      const tk = mapKey.get(k); if (!tScalars.has(tk)) continue;
      compared += 1; const diff = Math.abs((deep.optimalScalar - tScalars.get(tk)) - (record.optimalScalar - v));
      if (diff !== 0) { mismatches += 1; maxAbs = Math.max(maxAbs, diff); }
    }

    let replica = null;
    if (!optimalSetEquivariant) {
      const inverse = INVERSE_TRANSFORM[id];
      const frameKey = (a) => forgeActionKey(transformAction(inverse, a, tDims));
      const rScalars = replicaScalars(tw, horizon, frameKey);
      const rOptimal = optimalOf(rScalars);
      const rBest = Math.max(...rScalars.values());
      let rMis = 0;
      for (const [k, v] of wScalars) { const tk = mapKey.get(k); if (rScalars.has(tk) && (rBest - rScalars.get(tk)) !== (record.optimalScalar - v)) rMis += 1; }
      replica = { optimalSetEquivariant: sameSet(rOptimal, mappedOptimal), regretMismatches: rMis };
    }
    const replicaFidelityT = fidelitySample && id !== 'IDENTITY' ? [...replicaScalars(tw, horizon, forgeActionKey)].every(([k, v]) => tScalars.get(k) === v) : null;

    const tGreedy = heuristicGreedyBaseline({ branches: deep.branches.map((b) => ({ actionKey: K16(b.actionKey), immediateScalar: b.immediateScalar })) }).actionId;
    const tPolicies = policyChoices(tw, deep);
    const policies = Object.fromEntries(STAGE3F6P1B_POLICIES.map((p) => {
      const wChoice = wPolicies.choices[p]; const tChoice = tPolicies.choices[p];
      const mapped = wChoice === null ? null : K16(forgeActionKey(transformAction(id, wPolicies.byKey.get(wChoice), dims)));
      const chosen = tChoice === null ? null : K16(tChoice);
      return [p, { chosenT: chosen, mappedW: mapped, equivariant: chosen === mapped ? 1 : 0,
        chosenTType: tChoice === null ? null : tPolicies.byKey.get(tChoice).actionType, chosenTDirection: tChoice === null ? null : tPolicies.byKey.get(tChoice).parameters?.direction ?? null }];
    }));

    const eastW = wKernel.find((a) => a.actionType === 'MOVE' && a.parameters.direction === 'EAST');
    const eastOptimalW = eastW ? (wOptimal.has(K16(forgeActionKey(eastW))) ? 1 : 0) : null;
    const tMoves = tKernel.filter((a) => a.actionType === 'MOVE').sort((a, b) => (forgeActionKey(a) < forgeActionKey(b) ? -1 : 1));
    transforms[id] = {
      valid: true, gridSwapped: tDims.width !== dims.width, legalEquivariant, legalMissingTypes: missing, legalExtraTypes: extra,
      optimalSetEquivariant, optimalSetSizeT: tOptimal.size, regretCompared: compared, regretMismatches: mismatches, maxAbsRegretDiff: maxAbs,
      replica, replicaFidelityT,
      greedySafeT: tOptimal.has(tGreedy) ? 1 : 0, greedySafeEquivariant: (tOptimal.has(tGreedy) ? 1 : 0) === (wOptimal.has(wGreedy) ? 1 : 0) ? 1 : 0,
      greedyRegretT: horizonT.greedyRegret, horizonClassT: horizonT.horizonClass, horizonClassEquivariant: horizonT.horizonClass === record.horizonClass ? 1 : 0,
      policies,
      directionOptimalT: directionOptimality(tw, tOptimal),
      eastOptimalW, mappedEastDirection: eastW ? transformAction(id, eastW, dims).parameters.direction : null,
      mappedEastOptimalT: eastW ? (tOptimal.has(K16(forgeActionKey(transformAction(id, eastW, dims)))) ? 1 : 0) : null,
      lowestIdentityMoveDirectionT: tMoves[0]?.parameters.direction ?? null,
      lowestIdentityMoveOptimalT: tMoves[0] ? (tOptimal.has(K16(forgeActionKey(tMoves[0]))) ? 1 : 0) : null,
      moveOptimalRowT: tMoves.some((m) => tOptimal.has(K16(forgeActionKey(m)))) ? 1 : 0,
    };
  }
  return { recordHash: row.recordHash, combination: c, grid: dims, horizon, optimalSetSizeW: wOptimal.size, greedySafeW: wOptimal.has(wGreedy) ? 1 : 0,
    greedySafeMatchesCorpus: (wOptimal.has(wGreedy) ? 1 : 0) === row.y ? 1 : 0, horizonClassW: record.horizonClass, replicaFidelityW, transforms };
}

async function main() {
  const shards = Number(process.argv.find((a) => a.startsWith('--shards='))?.split('=')[1] ?? 1);
  const corpusRaw = gunzipSync(await readFile(path.join(root, 'artifacts/stage3f6c-deployable-router/confirmatory-corpus.jsonl.gz'))).toString('utf8');
  const devRows = corpusRaw.split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.partition === 'DEV');
  await mkdir(path.join(root, OUT), { recursive: true });
  if (process.argv.includes('--merge')) {
    const out = [];
    for (let k = 0; k < shards; k += 1) {
      const file = path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`);
      out.push(...(await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    }
    out.sort((a, b) => (a.recordHash < b.recordHash ? -1 : 1));
    const content = `${out.map((r) => JSON.stringify(r)).join('\n')}\n`;
    const manifest = { schemaVersion: 1, partition: 'DEV', planHash: STAGE3F6P1B_PLAN_HASH, sealedPartitionsRead: false, sourceCorpusHash: hex(corpusRaw),
      devRows: devRows.length, evaluated: out.length, rebuildMismatches: out.filter((r) => r.rebuildMismatch).length, transforms: SYMMETRY_TRANSFORM_IDS, policies: STAGE3F6P1B_POLICIES,
      contentHash: hex(content), generator: 'scripts/generate-stage3f6p1b-symmetry-evidence.mjs' };
    await writeFile(path.join(root, OUT, 'symmetry-evidence-dev.jsonl.gz'), gzipSync(Buffer.from(content, 'utf8'), { level: 9 }));
    await writeFile(path.join(root, OUT, 'symmetry-evidence-dev-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    for (let k = 0; k < shards; k += 1) await unlink(path.join(root, OUT, `shard-${k}-of-${shards}.jsonl`));
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  const shard = Number(process.argv.find((a) => a.startsWith('--shard='))?.split('=')[1] ?? 0);
  const limit = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);
  const lines = [];
  devRows.forEach((row, index) => {
    if (index % shards !== shard || (limit && index >= limit)) return;
    lines.push(JSON.stringify(symmetryRow(row, index)));
    if (lines.length % 100 === 0) process.stderr.write(`[stage3f6p1b shard ${shard}] ${lines.length}\n`);
  });
  await writeFile(path.join(root, OUT, `shard-${shard}-of-${shards}.jsonl`), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ shard, shards, rows: lines.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
