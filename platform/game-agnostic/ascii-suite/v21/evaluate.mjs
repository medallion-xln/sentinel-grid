import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PLAN } from './plan.mjs';
import { sourceManifest, hash, verifyBaseline } from './freeze.mjs';
import { runEpisode, verifyReplay } from './harness.mjs';
const registration = JSON.parse(readFileSync(new URL('./registration.json', import.meta.url)));
const { preregistrationHash, ...body } = registration;
if (hash(body) !== preregistrationHash || hash(PLAN) !== registration.planHash || sourceManifest().sourceHash !== registration.source.sourceHash) throw Error('REGISTRATION_OR_SOURCE_CHANGED');
verifyBaseline();
const jobs = new Map();
function add(cohort, family, config) {
  const c = { difficulty: 5, condition: 'NORMAL', scenario: 'STANDARD', slot: null, adversary: null, ...config }, key = JSON.stringify(c);
  if (jobs.has(key)) jobs.get(key).cohorts.push(cohort); else jobs.set(key, { ...c, family, cohorts: [cohort] });
}
for (const [family, seeds] of Object.entries(PLAN.heldoutFamilies)) {
  for (const game of PLAN.main.games) {
    for (const condition of PLAN.main.conditions) for (const seed of seeds) for (const variant of PLAN.main.variants) add('MAIN', family, { game, seed, condition, variant });
    for (const condition of PLAN.main.stressConditions) for (const seed of seeds.slice(0, PLAN.main.stressSeedsPerFamily)) for (const variant of ['V2', 'V3']) add('STRESS', family, { game, seed, condition, variant });
    for (const seed of seeds.slice(0, 8)) for (const variant of ['V2', 'V3']) add('DIFFICULTY3', family, { game, seed, variant, difficulty: 3 });
    for (const seed of seeds.slice(0, PLAN.ablations.seedsPerFamily)) for (const variant of PLAN.ablations.variants[game]) add('ABLATION', family, { game, seed, variant, condition: PLAN.ablations.condition });
  }
  for (const difficulty of PLAN.main.normalPongBands) for (const seed of seeds) for (const variant of ['V2', 'V3']) add('PONG_NORMAL_BANDS', family, { game: 'pong', seed, variant, difficulty });
  for (const adversary of PLAN.fighter.adversaries) for (const latency of PLAN.fighter.latencies) for (const seed of seeds.slice(0, PLAN.fighter.seedsPerFamily)) for (const variant of PLAN.fighter.variants)
    add('STRONG_FIGHTER', family, { game: 'fighter', seed, variant, adversary, condition: 'LATENCY_' + latency });
  for (const slot of PLAN.racing.rotatedSlots) for (const condition of PLAN.racing.conditions) for (const seed of seeds.slice(0, PLAN.racing.seedsPerFamily)) for (const variant of PLAN.racing.variants)
    add('ROTATED_GRID', family, { game: 'racing', seed, variant, condition, slot });
  for (const [game, scenarios] of Object.entries(PLAN.scenarios.cases)) for (const scenario of scenarios) for (const condition of PLAN.scenarios.conditions) for (const seed of seeds.slice(0, PLAN.scenarios.seedsPerFamily)) for (const variant of PLAN.scenarios.variants)
    add('BOUNDED_SHIFT', family, { game, seed, variant, condition, scenario, difficulty: game === 'pong' ? 3 : 5 });
}
const directory = new URL('./results/heldout/', import.meta.url); mkdirSync(directory, { recursive: true });
const configs = [...jobs.values()].sort((a, b) => a.game.localeCompare(b.game) || a.seed - b.seed || a.condition.localeCompare(b.condition) || a.variant.localeCompare(b.variant) * (a.seed % 2 ? 1 : -1));
const identity = { registrationHash: preregistrationHash, sourceHash: registration.source.sourceHash, jobCount: configs.length, jobHash: hash(configs), startedAt: new Date().toISOString(), status: 'HELDOUT_DIAGNOSTIC_RUNNING' };
const identityPath = new URL('identity.json', directory);
if (existsSync(identityPath)) { const prior = JSON.parse(readFileSync(identityPath)); if (prior.registrationHash !== identity.registrationHash || prior.jobHash !== identity.jobHash) throw Error('HELDOUT_IDENTITY_MISMATCH'); }
else writeFileSync(identityPath, JSON.stringify(identity, null, 2), { flag: 'wx' });
const summaries = []; let lastUpdate = performance.now(), resumed = 0;
for (let i = 0; i < configs.length; i++) {
  const config = configs[i], filename = hash(config).slice(0, 24), summaryPath = new URL(filename + '.json', directory);
  if (existsSync(summaryPath)) { summaries.push(JSON.parse(readFileSync(summaryPath))); resumed++; continue; }
  const episode = runEpisode({ ...config, trace: true });
  verifyReplay(episode); // Every transition, not merely the final state.
  const { actions, frames, ...summary } = episode;
  const record = { ...summary, family: config.family, cohorts: config.cohorts, exactReplay: true, replayFile: filename + '.json.gz', registrationHash: preregistrationHash };
  writeFileSync(new URL(filename + '.json.gz', directory), gzipSync(JSON.stringify({ ...episode, family: config.family, cohorts: config.cohorts })), { flag: 'wx' });
  writeFileSync(summaryPath, JSON.stringify(record), { flag: 'wx' }); summaries.push(record);
  if (performance.now() - lastUpdate > 15000 || i === configs.length - 1) { console.log(JSON.stringify({ completed: i + 1, total: configs.length, game: config.game, family: config.family, condition: config.condition, resumed })); lastUpdate = performance.now(); }
}
if (sourceManifest().sourceHash !== registration.source.sourceHash) throw Error('SOURCE_CHANGED_DURING_HELDOUT');
writeFileSync(new URL('./results/heldout-summary.json', import.meta.url), JSON.stringify({ ...identity, completedAt: new Date().toISOString(), status: 'HELDOUT_DIAGNOSTIC_COMPLETE_NOT_CERTIFICATE', episodes: summaries, protected: verifyBaseline() }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ status: 'COMPLETE_DIAGNOSTIC', episodes: summaries.length, exactReplayTransitions: 'ALL', sourceHash: registration.source.sourceHash }));
