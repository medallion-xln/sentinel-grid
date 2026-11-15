import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { runEpisode, verifyReplay } from './harness.mjs';
import { verifyBaseline, sourceManifest } from './freeze.mjs';
const version = process.argv.find(a => a.startsWith('--version='))?.split('=')[1] ?? 'dev1';
if (!/^[a-z0-9-]+$/.test(version)) throw Error('INVALID_DEV_VERSION');
const directory = new URL(`./results/${version}/`, import.meta.url); if (existsSync(directory)) throw Error('DEVELOPMENT_RUN_ALREADY_EXISTS'); mkdirSync(directory, { recursive: true });
writeFileSync(new URL('identity.json', directory), JSON.stringify({ createdAt: new Date().toISOString(), frozen: verifyBaseline(), ...sourceManifest() }));
const seeds = Array.from({ length: process.argv.includes('--pilot') ? 4 : 8 }, (_, i) => 111001 + i);
const summaries = [];
for (const game of ['platformer', 'pong', 'fighter', 'racing']) for (const condition of ['NORMAL', 'DELAY3', 'JITTER']) for (const variant of ['V2', 'V3']) {
  const group = [];
  for (const seed of seeds) { const e = runEpisode({ game, seed, difficulty: 5, variant, condition, trace: true }); verifyReplay(e);
    writeFileSync(new URL(`${game}-${variant}-${condition}-${seed}.json.gz`, directory), gzipSync(JSON.stringify(e))); const { actions, frames, ...summary } = e; summaries.push(summary); group.push(e); }
  console.log(JSON.stringify({ game, condition, variant, n: group.length, success: group.filter(e => e.success).length / group.length, reward: group.reduce((a, e) => a + e.totalReward, 0) / group.length,
    place: game === 'racing' ? group.reduce((a, e) => a + e.metrics.placement, 0) / group.length : null, returnRate: game === 'pong' ? group.reduce((a, e) => a + e.metrics.returnRate, 0) / group.length : null }));
}
writeFileSync(new URL('summary.json', directory), JSON.stringify(summaries, null, 2)); verifyBaseline();
