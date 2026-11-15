#!/usr/bin/env node
// Development evaluation, not a sealed/certified competence experiment.
import { createGame, stepGame, baselineAction, metricsOf, GAMES, ACTIONS } from './games.mjs';
import { primeDecision } from './prime.mjs';
import { sourceManifest } from './provenance.mjs';
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const game = arg('--game', 'all'), mode = arg('--mode', 'baseline'), seeds = arg('--seeds', '1,2,3').split(',').map(Number), maxTicks = Number(arg('--max-ticks', '600'));
if (!['all', ...GAMES].includes(game) || !['prime', 'baseline', 'uniform'].includes(mode) || !Number.isInteger(maxTicks) || maxTicks < 1 || maxTicks > 4000 || seeds.length > 32) throw Error('Invalid benchmark configuration');
const rows = [];
for (const name of game === 'all' ? GAMES : [game]) for (const seed of seeds) {
  let state = createGame(name, { seed }), rng = seed, regret = 0, optimal = 0;
  while (!state.terminal && state.tick < maxTicks) {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    const action = mode === 'prime' ? primeDecision(state).action : mode === 'baseline' ? baselineAction(state) : ACTIONS[name][Math.floor(rng / 4294967296 * ACTIONS[name].length)];
    const candidates = ACTIONS[name].map(a => stepGame(state, a).reward), next = stepGame(state, action), best = Math.max(...candidates);
    regret += best - next.reward; optimal += Math.abs(best - next.reward) < 1e-9 ? 1 : 0; state = next;
  }
  rows.push({ game: name, mode, seed, ticks: state.tick, result: state.terminal ? state.result : 'CENSORED_BY_EVALUATION_BUDGET', metrics: metricsOf(state),
    oneStepShapedRewardOptimalHit: optimal / state.tick, meanOneStepShapedRewardRegret: regret / state.tick });
}
console.log(JSON.stringify({ status: 'DIAGNOSTIC', certificate: null, authority: 'R0_LOCAL_SIM_ONLY', provenance: sourceManifest(), population: 'DEVELOPMENT_SEEDS_NOT_SEALED',
  warning: 'One-step shaped reward is an environment proxy, not inherited DDV, calibrated competence, or medium-horizon performance. Censored episodes are not losses.', rows }, null, 2));
