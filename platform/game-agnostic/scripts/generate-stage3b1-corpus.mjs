#!/usr/bin/env node
/* FORGE_DATASET_V2 corpus generation — sharded across processes.
 *
 * Same sharding discipline as the Stage 3B generator, and for the same reason: a
 * record depends only on its own (shape, roles, objectives, horizon band, level,
 * seed) tuple, so which shard builds it changes nothing, and the merged corpus is
 * sorted by record hash so the output does not depend on which worker finished
 * first. A parallel run is byte-identical to a serial one.
 *
 * What is new in V2 is the decision-point contract. A record is only written once
 * the world has been EVOLVED to the point where the temporal context it claims
 * actually exists:
 *
 *   WORLD_INITIALIZED -> WARMUP_COMPLETE -> HISTORY_VALID
 *                     -> SEMANTIC_ADMISSION_PASS -> DECISION_CAPTURED
 *
 * Each transition is recorded by name. A record that stops short of
 * DECISION_CAPTURED is not written, and the stage it stopped at is counted.
 *
 * Usage:
 *   node scripts/generate-stage3b1-corpus.mjs                 # spawn workers
 *   node scripts/generate-stage3b1-corpus.mjs --worker N OF M  # one shard
 *   node scripts/generate-stage3b1-corpus.mjs --pilot          # small pilot
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { enumerateCurriculumV2 } from '../src/forge/scenarios-v2.js';
import { DECISION_STAGES, buildRecordV2 } from '../src/forge/record-v2.js';
import { evaluateAcrossPolicies } from '../src/forge/counterfactual-v2.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const buildDir = path.join(root, 'build', 'stage3b1-corpus');

export const STAGE3B1_SEEDS = [1, 2, 3];
export const STAGE3B1_LEVELS = [0, 1, 2, 3, 4, 5];
export const STAGE3B1_OOD_LEVELS = [6, 7];
export const STAGE3B1_PILOT_SEEDS = [1];
export const STAGE3B1_PILOT_STRIDE = 7;

function combinations({ pilot }) {
  const main = enumerateCurriculumV2({ levels: STAGE3B1_LEVELS, seeds: pilot ? STAGE3B1_PILOT_SEEDS : STAGE3B1_SEEDS })
    .map((combination) => ({ combination, ood: false }));
  const ood = enumerateCurriculumV2({ levels: STAGE3B1_OOD_LEVELS, seeds: pilot ? [11] : [11] })
    .map((combination) => ({ combination, ood: true }));
  const all = [...main, ...ood];
  return pilot ? all.filter((unused, index) => index % STAGE3B1_PILOT_STRIDE === 0) : all;
}

async function runWorker(index, total, pilot) {
  const all = combinations({ pilot });
  const records = [];
  const stats = {
    generated: 0, admitted: 0, rejected: 0, rejectionsByCheck: {},
    stoppedAt: Object.fromEntries(DECISION_STAGES.map((stage) => [stage, 0])),
    policyProbes: 0, policyInvariant: 0, generationErrors: 0,
  };
  for (let i = index; i < all.length; i += total) {
    const { combination, ood: isOod } = all[i];
    stats.generated += 1;
    let result;
    try {
      result = buildRecordV2(combination, isOod);
    } catch (error) {
      stats.rejected += 1;
      stats.generationErrors += 1;
      const key = `GENERATION_ERROR:${error.code ?? error.name}`;
      stats.rejectionsByCheck[key] = (stats.rejectionsByCheck[key] ?? 0) + 1;
      if (stats.firstGenerationError === undefined) {
        stats.firstGenerationError = `${error.message} ${JSON.stringify(combination)}`;
      }
      continue;
    }
    stats.stoppedAt[result.stoppedAt] += 1;
    if (!result.admitted) {
      stats.rejected += 1;
      for (const check of result.failedChecks) stats.rejectionsByCheck[check] = (stats.rejectionsByCheck[check] ?? 0) + 1;
      continue;
    }
    stats.admitted += 1;
    records.push(result.record);
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

const pilot = process.argv.includes('--pilot');
const workerFlag = process.argv.indexOf('--worker');
if (workerFlag >= 0) {
  await runWorker(Number(process.argv[workerFlag + 1]), Number(process.argv[workerFlag + 3]), pilot);
} else {
  const workers = Math.max(1, Math.min(os.cpus().length, 4));
  await mkdir(buildDir, { recursive: true });
  for (const name of await readdir(buildDir).catch(() => [])) {
    if (name.startsWith('worker-')) await writeFile(path.join(buildDir, name), '');
  }
  const started = Date.now();
  await Promise.all(Array.from({ length: workers }, (unused, index) => new Promise((resolve, reject) => {
    const args = [fileURLToPath(import.meta.url), '--worker', String(index), 'OF', String(workers)];
    if (pilot) args.push('--pilot');
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${index} exited ${code}`))));
  })));
  const elapsed = (Date.now() - started) / 1000;

  const merged = [];
  const stats = {
    generated: 0, admitted: 0, rejected: 0, rejectionsByCheck: {},
    stoppedAt: Object.fromEntries(DECISION_STAGES.map((stage) => [stage, 0])),
    policyProbes: 0, policyInvariant: 0, generationErrors: 0,
  };
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
    for (const stage of DECISION_STAGES) stats.stoppedAt[stage] += workerStats.stoppedAt?.[stage] ?? 0;
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
  const name = pilot ? 'pilot.jsonl' : 'corpus.jsonl';
  await writeFile(path.join(buildDir, name), corpusBody);
  await writeFile(path.join(buildDir, pilot ? 'pilot-stats.json' : 'corpus-stats.json'), `${JSON.stringify({
    ...stats,
    pilot,
    elapsedSeconds: Math.round(elapsed),
    admittedPerSecond: elapsed > 0 ? Math.round(stats.admitted / elapsed) : 0,
    workers,
    corpusSha256: createHash('sha256').update(corpusBody).digest('hex'),
    recordCount: merged.length,
  }, null, 2)}\n`);
  process.stdout.write(`merged ${merged.length} records in ${Math.round(elapsed)}s across ${workers} workers\n`);
}
