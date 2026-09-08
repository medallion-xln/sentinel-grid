#!/usr/bin/env node
/* Stage 3B corpus generation — sharded across processes.
 *
 * Generation is embarrassingly parallel and deterministic per combination: a
 * record depends only on its own (shape, roles, objectives, horizon band, level,
 * seed) tuple. Sharding by combination INDEX therefore preserves byte-identical
 * output — the shard a case lands in changes nothing about the case, and the
 * merged corpus is sorted by record hash so the result does not depend on which
 * worker finished first.
 *
 * Usage:
 *   node scripts/generate-stage3b-corpus.mjs                 # spawn workers
 *   node scripts/generate-stage3b-corpus.mjs --worker N OF M  # one shard
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { createWorld, hashWorld, topologyHash } from '../src/forge/kernel.js';
import { FORGE_ROLE_COMPOSITIONS, enumerateCurriculumV2, generateScenarioV2 } from '../src/forge/scenarios-v2.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { classifyHorizonDependence, evaluateAcrossPolicies, evaluateCounterfactualsV2 } from '../src/forge/counterfactual-v2.js';
import { classifySupervision, classifyTie } from '../src/forge/supervision.js';
import { FORGE_DATASET_VERSION, splitForTopology } from '../src/forge/dataset.js';
import { FORGE_REWARD_V2_VERSION } from '../src/forge/reward-v2.js';
import { sha256 } from '../src/core/determinism.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const buildDir = path.join(root, 'build', 'stage3b-corpus');

export const STAGE3B_SEEDS = [1, 2, 3];
export const STAGE3B_LEVELS = [0, 1, 2, 3, 4, 5];
export const STAGE3B_OOD_LEVELS = [6, 7];

function buildRecord(combination, ood) {
  const config = generateScenarioV2(combination);
  const world = createWorld(config.scenarioSeed, config);
  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === combination.roles);
  const validation = validateScenarioV2(world, {
    ...combination,
    horizon: config.horizon,
    roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes },
  });
  if (!validation.valid) return { admitted: false, failedChecks: validation.failedChecks };

  const horizonLength = Math.max(1, config.horizon);
  const counterfactuals = evaluateCounterfactualsV2(world, { horizon: horizonLength });
  const supervision = classifySupervision(counterfactuals);
  const tie = classifyTie(counterfactuals);
  const horizon = classifyHorizonDependence(world, { horizon: horizonLength, deepEvaluation: counterfactuals });
  const digest = topologyHash(world);
  const split = ood ? 'OOD' : splitForTopology(digest);

  const body = {
    recordVersion: FORGE_DATASET_VERSION,
    rewardVersion: FORGE_REWARD_V2_VERSION,
    continuationPolicy: counterfactuals.continuationPolicy,
    shape: combination.shape, roles: combination.roles, objectives: combination.objectives,
    horizonBand: combination.horizonBand, level: combination.level,
    seed: String(combination.seed), scenarioSeed: config.scenarioSeed,
    split, outOfDistribution: ood,
    worldHash: hashWorld(world), topologyHash: digest,
    entityCount: world.entities.length, relationCount: world.relations.length,
    objectiveCount: world.objectives.length, energy: world.constraints.energy ?? 0,
    tick: world.tick, maxTicks: world.maxTicks,
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
  return { admitted: true, record: { ...body, recordHash: sha256(body) }, world, horizonLength };
}

async function runWorker(index, total) {
  const main = enumerateCurriculumV2({ levels: STAGE3B_LEVELS, seeds: STAGE3B_SEEDS })
    .map((combination) => ({ combination, ood: false }));
  const ood = enumerateCurriculumV2({ levels: STAGE3B_OOD_LEVELS, seeds: [11] })
    .map((combination) => ({ combination, ood: true }));
  const all = [...main, ...ood];

  const records = [];
  const stats = { generated: 0, admitted: 0, rejected: 0, rejectionsByCheck: {}, policyProbes: 0, policyInvariant: 0, generationErrors: 0 };
  for (let i = index; i < all.length; i += total) {
    const { combination, ood: isOod } = all[i];
    stats.generated += 1;
    /* A single malformed combination must not discard the whole shard. It is
     * counted as a named rejection and the run fails at the end if any occurred —
     * loud, but not destructive: the first attempt lost twenty minutes of
     * completed work to one out-of-range level in the OOD block. */
    let result;
    try {
      result = buildRecord(combination, isOod);
    } catch (error) {
      stats.rejected += 1;
      stats.generationErrors = (stats.generationErrors ?? 0) + 1;
      const key = `GENERATION_ERROR:${error.code ?? error.name}`;
      stats.rejectionsByCheck[key] = (stats.rejectionsByCheck[key] ?? 0) + 1;
      if (stats.firstGenerationError === undefined) {
        stats.firstGenerationError = `${error.message} ${JSON.stringify(combination)}`;
      }
      continue;
    }
    if (!result.admitted) {
      stats.rejected += 1;
      for (const check of result.failedChecks) stats.rejectionsByCheck[check] = (stats.rejectionsByCheck[check] ?? 0) + 1;
      continue;
    }
    stats.admitted += 1;
    records.push(result.record);
    /* Policy-family agreement, sampled: three oracle passes is too much to pay on
     * every case, and a sample answers the question being asked — how much does
     * this corpus depend on one continuation story. */
    if (stats.admitted % 500 === 0) {
      const across = evaluateAcrossPolicies(result.world, { horizon: result.horizonLength });
      stats.policyProbes += 1;
      if (across.policyInvariant) stats.policyInvariant += 1;
    }
  }
  await mkdir(buildDir, { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join('\n');
  await writeFile(path.join(buildDir, `worker-${index}.jsonl`), body === '' ? '' : `${body}\n`);
  await writeFile(path.join(buildDir, `worker-${index}.stats.json`), `${JSON.stringify(stats)}\n`);
  process.stdout.write(`worker ${index}/${total}: generated ${stats.generated} admitted ${stats.admitted} rejected ${stats.rejected}\n`);
}

const workerFlag = process.argv.indexOf('--worker');
if (workerFlag >= 0) {
  await runWorker(Number(process.argv[workerFlag + 1]), Number(process.argv[workerFlag + 3]));
} else {
  const workers = Math.max(1, Math.min(os.cpus().length, 4));
  await mkdir(buildDir, { recursive: true });
  for (const name of await readdir(buildDir).catch(() => [])) {
    if (name.startsWith('worker-')) await writeFile(path.join(buildDir, name), '');
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: workers }, (unused, index) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', String(index), 'OF', String(workers)], {
      cwd: root, stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${index} exited ${code}`))));
  })));
  const elapsed = (Date.now() - started) / 1000;

  /* Merge. Sorting by record hash makes the corpus independent of which worker
   * finished first, which is what keeps a parallel run byte-identical to a serial
   * one. */
  const merged = [];
  const stats = { generated: 0, admitted: 0, rejected: 0, rejectionsByCheck: {}, policyProbes: 0, policyInvariant: 0, generationErrors: 0 };
  for (let index = 0; index < workers; index += 1) {
    const lines = (await readFile(path.join(buildDir, `worker-${index}.jsonl`), 'utf8')).split('\n').filter(Boolean);
    for (const line of lines) merged.push(JSON.parse(line));
    const workerStats = JSON.parse(await readFile(path.join(buildDir, `worker-${index}.stats.json`), 'utf8'));
    stats.generated += workerStats.generated;
    stats.admitted += workerStats.admitted;
    stats.rejected += workerStats.rejected;
    stats.generationErrors += workerStats.generationErrors ?? 0;
    stats.policyProbes += workerStats.policyProbes;
    stats.policyInvariant += workerStats.policyInvariant;
    for (const [check, count] of Object.entries(workerStats.rejectionsByCheck)) {
      stats.rejectionsByCheck[check] = (stats.rejectionsByCheck[check] ?? 0) + count;
    }
  }
  if (stats.generationErrors > 0) {
    process.stderr.write(`GENERATION_ERRORS=${stats.generationErrors}\n`);
    process.stderr.write('  A combination failed to build. The corpus is incomplete and must not be certified.\n');
    process.exitCode = 1;
  }
  merged.sort((a, b) => (a.recordHash < b.recordHash ? -1 : a.recordHash > b.recordHash ? 1 : 0));
  const corpusBody = `${merged.map((record) => JSON.stringify(record)).join('\n')}\n`;
  await writeFile(path.join(buildDir, 'corpus.jsonl'), corpusBody);
  await writeFile(path.join(buildDir, 'corpus-stats.json'), `${JSON.stringify({
    ...stats,
    elapsedSeconds: Math.round(elapsed),
    admittedPerSecond: Math.round(stats.admitted / elapsed),
    workers,
    corpusSha256: createHash('sha256').update(corpusBody).digest('hex'),
    recordCount: merged.length,
  }, null, 2)}\n`);
  process.stdout.write(`merged ${merged.length} records in ${Math.round(elapsed)}s across ${workers} workers\n`);
}
