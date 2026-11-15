import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { runEpisode, replay } from '../eval/harness.mjs';
import { observe, stepGame } from '../games.mjs';
import { sha256 } from '../../src/core/determinism.js';
import { verifyBaseline, rawHash } from './freeze.mjs';
const out = new URL('./results/phase0/', import.meta.url); mkdirSync(out, { recursive: true });
const published = JSON.parse(readFileSync(new URL('../results/ascii-worlds-2-results.json', import.meta.url)));
const datasets = Object.fromEntries(['pong', 'platformer', 'fighter', 'racing'].map(g => [g, JSON.parse(readFileSync(new URL(`../results/eval-${g}.json`, import.meta.url)))]));
const inventory = { completeMachineResultsRead: true, published, rawDatasets: Object.fromEntries(Object.entries(datasets).map(([g, r]) => [g, { episodes: r.episodes.length, phase5: r.phase5.length, hash: rawHash(new URL(`../results/eval-${g}.json`, import.meta.url)) }])),
  priorReplayVerification: JSON.parse(readFileSync(new URL('../results/rerun-verification.json', import.meta.url))),
  failures: [
    { game: 'platformer', classes: ['OBSERVATION_AGE', 'STATE_ESTIMATION', 'ACTION_TIMING'], cause: 'v2 body starts at observation time, not execution time; retries cannot correct sensor age' },
    { game: 'pong', classes: ['OBSERVATION_AGE', 'STATE_ESTIMATION', 'POLICY'], cause: 'receipt time is missing; large sparse displacement mistaken for serve; shot selection trades return margin for no score benefit' },
    { game: 'fighter', classes: ['OBSERVATION_AGE', 'OPPONENT_QUALITY', 'BENCHMARK_COVERAGE'], cause: 'player reacts immediately; opponents react 2-6 ticks later; fixed styles do not discriminate saturated wins' },
    { game: 'racing', classes: ['OBSERVATION_AGE', 'STATE_ESTIMATION', 'POLICY', 'BENCHMARK_COVERAGE'], cause: 'stale speed/heading causes control error; unrotated grid confounds placement; corner memory not engaged' }
  ] };
const checks = [];
for (const [game, dataset] of Object.entries(datasets)) {
  const kinds = game === 'pong' ? ['SENTINEL', 'SENTINEL_FILTER_ONLY', 'ANALYTIC_INTERCEPT'] : game === 'racing' ? ['SENTINEL', 'RULE_BASED'] : ['SENTINEL'];
  const selected = [...dataset.episodes.filter(e => kinds.includes(e.controller) && e.difficulty === 5), ...dataset.phase5.filter(e => kinds.includes(e.controller) && e.condition === 'DELAYED_OBSERVATION')];
  for (const e of selected) {
    const fresh = runEpisode({ game, controller: e.controller, seed: e.seed, difficulty: e.difficulty, style: e.style ?? 'ADAPTIVE', condition: e.condition, obsDelay: e.obsDelay, obsDropout: e.obsDropout });
    const final = replay({ game, seed: e.seed, difficulty: e.difficulty, style: e.style ?? 'ADAPTIVE' }, fresh.actions);
    const check = { game, controller: e.controller, seed: e.seed, condition: e.condition, difficulty: e.difficulty, style: e.style,
      actionHashMatch: fresh.actionSequenceHash === e.actionSequenceHash, finalHashMatch: fresh.finalStateHash === e.finalStateHash, exactActionReplay: sha256(final) === fresh.finalStateHash };
    if (!check.actionHashMatch || !check.finalHashMatch || !check.exactActionReplay) throw Error('V2_REPRODUCTION_MISMATCH: ' + JSON.stringify(check));
    // Actual controller inputs are generated solely by observe(); full replay is retained, with sampled forensic observations.
    let s = replay({ game, seed: e.seed, difficulty: e.difficulty, style: e.style ?? 'ADAPTIVE' }, []);
    const frames = [];
    for (const a of fresh.actions) { if (s.tick % 50 === 0 || s.events.length) frames.push({ tick: s.tick, observation: observe(s), action: a, stateHash: sha256(s) }); s = stepGame(s, a); }
    writeFileSync(new URL(`${game}-${e.controller}-${e.seed}-${e.style ?? 'DEFAULT'}-${e.condition}.json`, out), JSON.stringify({ ...fresh, frames }), { flag: 'wx' });
    checks.push(check);
  }
  console.log(JSON.stringify({ phase0: game, reproduced: checks.filter(c => c.game === game).length }));
}
writeFileSync(new URL('./results/phase0.json', import.meta.url), JSON.stringify({ status: 'V2_REPRODUCED_NOT_NEW_CONFIRMATORY_EVIDENCE', inheritedSeedsExplicitlyReusedForReproductionOnly: true, inventory, checks, protected: verifyBaseline() }, null, 2), { flag: 'wx' });
