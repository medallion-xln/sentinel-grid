// SK1 screening worker. Applies the FROZEN H-W1 funnel (screenWorld: strict-index and public-class admission BEFORE any
// truth, then the frozen arm-stress rule) under the SK1 exclusion context, which is loaded fail-closed and includes
// every earlier sealed registry and every forbidden block. Output is privileged (seeds, world hashes) and gitignored.
//   node infra/screen.mjs worker <block> <i> <n>
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenWorld } from '../../stage3h-hw1-dev-v1/i2-screen.mjs';
import { loadSk1Exclusions } from './exclusions.mjs';
import { loadAllocation, blockSchedule } from './allocator.mjs';
import { WORK, fail, writeExclusive } from './common.mjs';

export const SCREEN_DIR = resolve(WORK, 'screen'), SHARDS = 9, shardName = (block, i) => `B${block}-shard-${i}-of-${SHARDS}.json`;
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, a1, a2, a3] = process.argv.slice(2), block = Number(a1), i = Number(a2), n = Number(a3), t0 = Date.now();
  if (mode !== 'worker' || n !== SHARDS || !(Number.isInteger(i) && i >= 0 && i < n)) fail(`USAGE: node infra/screen.mjs worker <block> <i> ${SHARDS}`);
  const ctx = loadSk1Exclusions(), combos = blockSchedule(ctx, block, loadAllocation()), seen = new Set(), funnel = {}, admitted = [];
  mkdirSync(SCREEN_DIR, { recursive: true });
  combos.forEach((c, j) => { if (j % n !== i) return; const r = screenWorld(c, ctx, seen); funnel[r.status] = (funnel[r.status] ?? 0) + 1; if (r.status === 'ADMITTED') admitted.push(r); });
  writeExclusive(resolve(SCREEN_DIR, shardName(block, i)), { block, shard: i, of: n, exclusionRegistryHash: ctx.registryHash, scheduled: combos.filter((_, j) => j % n === i).length, seconds: (Date.now() - t0) / 1000, funnel, admitted });
  console.log(JSON.stringify({ block, shard: i, scheduled: combos.filter((_, j) => j % n === i).length, admitted: admitted.length, seconds: (Date.now() - t0) / 1000 }));
}
