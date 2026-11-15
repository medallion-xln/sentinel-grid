// Closure Phase 2 worker: deterministic rebuild of EVERY world the safety-feasibility search constructed (all twin
// families of all 341 classes, whatever their status), recording each world identity and status. No truth, no policy
// decision is needed for identity, so none is computed. Usage: node closure/ledger.mjs <shard> <of>
// Writes work/ledger/shard-<i>-of-<n>.jsonl ('wx'; work/ is gitignored, the merged ledger is the committed artifact).
import { openSync, writeSync, closeSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { comboOf } from '../../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { prng } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld, hiddenSupport, twinFamily } from '../twins.mjs';
import { candidates, DRAWS } from '../search.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), ok = (v, m) => { if (!v) throw Error(m); };

export function classLedger({ set, row }) {
  const combo = comboOf(row), base = nativeWorld(combo);
  ok(!base.rejected && base.worldHash === row.worldHash, 'BASE_REGENERATION_MISMATCH');
  const sup = hiddenSupport(base.config), worlds = [];
  for (const [k, f] of twinFamily(sup.coords, prng(base.worldHash), DRAWS).entries()) {
    const w = nativeWorld(combo, f.spec);
    worlds.push(w.rejected ? [k, null, 'REJECTED:' + w.rejected] : [k, w.worldHash, w.content === base.content ? 'EQUIVALENT' : 'NOT_EQUIVALENT']);
  }
  return { set, idx: row.idx, seed: row.seed, baseWorldHash: base.worldHash, familySize: worlds.length, worlds };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [shard, of] = process.argv.slice(2).map(Number);
  ok(Number.isInteger(shard) && Number.isInteger(of) && shard >= 0 && shard < of, 'USAGE: node closure/ledger.mjs <shard> <of>');
  const dir = resolve(LANE, 'work/ledger'); if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fd = openSync(resolve(dir, `shard-${shard}-of-${of}.jsonl`), 'wx'), mine = candidates().filter((_, i) => i % of === shard);
  for (const c of mine) writeSync(fd, JSON.stringify(classLedger(c)) + '\n');
  closeSync(fd); console.log(JSON.stringify({ shard, of, classes: mine.length }));
}
