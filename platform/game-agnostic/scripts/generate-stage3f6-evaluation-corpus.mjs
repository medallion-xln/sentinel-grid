#!/usr/bin/env node
/* STAGE 3F.6 — deterministic evaluation corpus.
 *
 * Rebuilds every Stage 3E curriculum combination with the canonical record builder,
 * keeps only the 20,000 decision points that belong to the frozen Stage 3E
 * ROUTABILITY_DEV/CAL/HOLDOUT/OOD matrices (joined by recordHash, never by position),
 * and records compact decision-time evidence for each one:
 *
 *   - combination identity, world/topology identity, World State v1 fact values;
 *   - authoritative branch evidence (immediate V2 scalar, horizon total, regret);
 *   - the greedy action under the Stage 3E contract and under the Stage 3F.5 runtime;
 *   - the Stage 3F.5 runtime feature values that DIFFER from the frozen matrix row.
 *
 * No labels, router scores, or metrics are computed here. The corpus is a pure
 * function of the code and the curriculum; worker count does not change a byte.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { enumerateCurriculumV2 } from '../src/forge/scenarios-v2.js';
import { buildRecordV2 } from '../src/forge/record-v2.js';
import { forgeAdapterState, forgeWorldAdapter, FORGE_OBSERVER_ID } from '../src/forge/adapter.js';
import { heuristicGreedyBaseline } from '../src/lab/stage3c-learned-nexus.js';
import { extractIntegratedStage3EFeatures } from '../src/stage3f/integrated-live-shadow-v1.js';
import { STAGE3F6_CORPUS_SPEC, STAGE3E_SPLITS, compactCorpusCase } from '../src/stage3f/prediction-reliability-corpus-v1.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDirectory = path.join(root, 'artifacts', 'stage3f6-prediction-reliability');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export function stage3f6Combinations() {
  const main = enumerateCurriculumV2({ levels: STAGE3F6_CORPUS_SPEC.levels, seeds: STAGE3F6_CORPUS_SPEC.seeds })
    .map((combination) => ({ combination, ood: false }));
  const ood = enumerateCurriculumV2({ levels: STAGE3F6_CORPUS_SPEC.oodLevels, seeds: STAGE3F6_CORPUS_SPEC.oodSeeds })
    .map((combination) => ({ combination, ood: true }));
  return [...main, ...ood];
}

export async function loadStage3EMatrixIndex() {
  const index = new Map();
  for (const split of STAGE3E_SPLITS) {
    const rows = JSON.parse(await readFile(path.join(root, 'artifacts', 'stage3e-routability-intelligence',
      'replay-fixtures', `matrix-${split}.json`), 'utf8'));
    for (const row of rows) index.set(row.recordHash, { split, f: row.f });
  }
  return index;
}

/** Rebuild one combination and derive its compact evidence. Returns null when not a frozen Stage 3E case. */
export function buildCorpusCase({ combination, ood }, matrixIndex) {
  let built;
  try { built = buildRecordV2(combination, ood); } catch { return { status: 'REJECTED' }; }
  if (!built.admitted) return { status: 'REJECTED' };
  const hit = matrixIndex.get(built.record.recordHash);
  if (!hit) return { status: 'NOT_IN_STAGE3E_SPLIT' };
  const state = forgeAdapterState(built.world);
  const observation = forgeWorldAdapter.observe(state, FORGE_OBSERVER_ID);
  const preliminary = extractIntegratedStage3EFeatures(state, observation, null);
  // Stage 3F.5 runtime candidate semantics: Nexus relational selector, greedy when it abstains.
  const candidateOutput = preliminary.selector.abstain ? preliminary.greedy : preliminary.selector;
  const candidate = { actionId: candidateOutput.actionId,
    producerId: preliminary.selector.abstain ? 'HEURISTIC_GREEDY_IMMEDIATE' : 'NEXUS_RELATIONAL_SELECTOR_V1' };
  const runtime = extractIntegratedStage3EFeatures(state, observation, candidate);
  return { status: 'MATCHED', entry: compactCorpusCase({
    record: built.record, world: built.world, split: hit.split, ood, combination, matrixFeatures: hit.f,
    contractGreedyKey: heuristicGreedyBaseline(built.record).actionId,
    runtimeFeatures: runtime.values, runtimeGreedyKey: runtime.greedy.actionId, runtimeCandidate: candidate,
    runtimeBranchCount: runtime.branches.length,
  }) };
}

async function runWorker(worker, total, scratch) {
  const matrixIndex = await loadStage3EMatrixIndex();
  const all = stage3f6Combinations(); const lines = []; const counts = { generated: 0, REJECTED: 0, NOT_IN_STAGE3E_SPLIT: 0, MATCHED: 0 };
  for (let index = worker; index < all.length; index += total) {
    counts.generated += 1; const result = buildCorpusCase(all[index], matrixIndex); counts[result.status] += 1;
    if (result.entry) lines.push(JSON.stringify(result.entry));
  }
  await writeFile(path.join(scratch, `w-${worker}.jsonl`), lines.length ? `${lines.join('\n')}\n` : '');
  await writeFile(path.join(scratch, `w-${worker}.counts.json`), JSON.stringify(counts));
}

async function main() {
  const workerFlag = process.argv.indexOf('--worker');
  if (workerFlag >= 0) {
    await runWorker(Number(process.argv[workerFlag + 1]), Number(process.argv[workerFlag + 2]), process.argv[workerFlag + 3]);
    return;
  }
  const workersFlag = process.argv.indexOf('--workers');
  const workers = workersFlag >= 0 ? Number(process.argv[workersFlag + 1]) : Math.max(1, Math.min(os.cpus().length - 2, 8));
  const scratch = path.join(os.tmpdir(), `stage3f6-corpus-${process.pid}`);
  await mkdir(scratch, { recursive: true }); await mkdir(outDirectory, { recursive: true });
  const started = Date.now();
  await Promise.all(Array.from({ length: workers }, (_, worker) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker', String(worker), String(workers), scratch], { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`worker ${worker} exit ${code}`)));
  })));
  const names = (await readdir(scratch)).sort();
  const lines = []; const counts = { generated: 0, REJECTED: 0, NOT_IN_STAGE3E_SPLIT: 0, MATCHED: 0 };
  for (const name of names) {
    const text = await readFile(path.join(scratch, name), 'utf8');
    if (name.endsWith('.counts.json')) { for (const [key, value] of Object.entries(JSON.parse(text))) counts[key] += value; }
    else if (text.trim()) lines.push(...text.trim().split('\n'));
  }
  await rm(scratch, { recursive: true, force: true });
  const keyed = lines.map((line) => [JSON.parse(line).recordHash, line]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  lines.splice(0, lines.length, ...keyed.map(([, line]) => line));
  const body = `${lines.join('\n')}\n`;
  const perSplit = Object.fromEntries(STAGE3E_SPLITS.map((split) => [split, lines.filter((line) => line.includes(`"split":"${split}"`)).length]));
  const manifest = {
    recordType: 'SENTINEL_STAGE3F6_EVALUATION_CORPUS_MANIFEST_V1', corpusSpec: STAGE3F6_CORPUS_SPEC,
    caseCount: lines.length, perSplit, counts, corpusDigest: `sha256:${sha256(body)}`,
    generatorSourceSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    corpusModuleSourceSha256: sha256(await readFile(path.join(root, 'src', 'stage3f', 'prediction-reliability-corpus-v1.js'))),
    labelsIncluded: false, routerScoresIncluded: false, metricsIncluded: false,
  };
  await writeFile(path.join(outDirectory, 'evaluation-corpus.jsonl.gz'), gzipSync(Buffer.from(body), { level: 9 }));
  await writeFile(path.join(outDirectory, 'evaluation-corpus-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ ...manifest, seconds: Math.round((Date.now() - started) / 1000), workers }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
