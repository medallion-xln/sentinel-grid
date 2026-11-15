#!/usr/bin/env node
// Held-out evaluation runner (Phase 6/7). Usage: node eval/run.mjs --game pong|platformer|fighter|racing
// Reads the pre-registration, runs the registered controllers on held-out seeds and the Phase 5 conditions, writes results/eval-<game>.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runEpisode, runCondition, CONDITIONS } from './harness.mjs';
import { PRIMARY_BASELINE } from '../controllers/index.mjs';
import { sourceManifest } from '../provenance.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const game = arg('--game'), regText = readFileSync(new URL('./preregistration.json', import.meta.url), 'utf8'), reg = JSON.parse(regText);
if (!['pong', 'platformer', 'fighter', 'racing'].includes(game)) throw Error('--game required');
const INCUMBENT_CAP = { pong: 5000, platformer: 1500, fighter: 900, racing: 1500 };
const strip = e => { const { memory, ...rest } = e; return { ...rest, memoryFailures: memory?.failures?.length ?? null }; };
const log = msg => process.stderr.write(`[${game} ${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
const started = Date.now(), episodes = [], phase5 = [];
const { incumbent, baselines, sentinel } = reg.controllers[game];
const styles = game === 'fighter' ? reg.fighterArchetypes : ['ADAPTIVE'];
for (const difficulty of reg.difficultyTiers[game]) for (const style of styles) {
  for (const controller of [...sentinel, ...baselines, incumbent]) {
    const seeds = controller === incumbent ? reg.incumbentHeldOutSeeds : reg.heldOutSeeds;
    for (const seed of seeds) episodes.push(strip(runEpisode({ game, controller, seed, difficulty, style, regretEvery: 10, keepActions: false, maxTicks: controller === incumbent ? INCUMBENT_CAP[game] : null })));
    log(`tier ${difficulty} ${style} ${controller} done (${episodes.length} episodes)`);
  }
}
const p5controllers = [...new Set(['SENTINEL', ...sentinel, PRIMARY_BASELINE[game]])];
for (const controller of p5controllers) for (const seed of reg.phase5Seeds) for (const condition of CONDITIONS) {
  const eps = runCondition({ game, controller, seed, difficulty: reg.phase5BaseDifficulty[game], condition, style: 'ADAPTIVE', altStyle: 'COUNTER_ATTACKER', heldOutSeed: seed + reg.phase5UnseenSeedOffset });
  phase5.push(...eps.map(strip));
}
log(`phase 5 done (${phase5.length} episodes)`);
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL(`../results/eval-${game}.json`, import.meta.url), JSON.stringify({ schema: 'ASCII_WORLDS_2_EVALUATION_V1', game, status: 'DIAGNOSTIC', certificate: null, authority: 'R0_LOCAL_SIM_ONLY',
  preregistrationSha256: createHash('sha256').update(regText).digest('hex'), provenance: sourceManifest(), runtimeSeconds: (Date.now() - started) / 1000, episodes, phase5 }));
log(`wrote results/eval-${game}.json in ${((Date.now() - started) / 1000).toFixed(0)} s`);
