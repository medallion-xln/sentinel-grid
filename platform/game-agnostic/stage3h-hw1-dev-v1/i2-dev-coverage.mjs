// H-W1 I-2 defensive exclusion coverage: regenerate every ADMITTED H2 base world of the spent DEV sets (DEV288, FRESH_EXPLORE 951, FRESH_CHECK 952), assert each
// regenerates to its recorded world hash, and record its PCD. These public views are already unsealed DEV material. No sealed (V4) or non-regenerable source is
// regenerated: those are excluded at whole-seed-block / world-hash level by the strict index. H0 worlds are not digested (a PCD carries the horizon band, so an H0
// world can never collide with an H2 population; reported as such in the coverage statement).
//   node i2-dev-coverage.mjs worker <i> <n>        rows k with k % n == i -> work/i2/dev-pcd-shard-<i>-of-<n>.json
//   node i2-dev-coverage.mjs aggregate [--write]   merge, seal, write evidence/I2_REGISTRY_STUDIED_341.json and evidence/I2_REGISTRY_DEV_H2.json
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRows, comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { devWorld, writeExclusive } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { projectPublic } from './public-projection.mjs';
import { pcd } from './i2-pcd.mjs';
import { sealRegistry, loadRegistry } from './i2-registry.mjs';

const LANE = dirname(fileURLToPath(import.meta.url)), WORK = resolve(LANE, 'work/i2'), [mode, a, b] = process.argv.slice(2), SETS = ['DEV288', 'FRESH_EXPLORE', 'FRESH_CHECK'];
const rowsToDigest = () => SETS.flatMap((set) => loadRows(set).filter((r) => !r.rejected && r.band === 'H2').map((r) => ({ set, r })));

if (mode === 'worker') {
  const i = Number(a), n = Number(b), out = []; mkdirSync(WORK, { recursive: true });
  rowsToDigest().forEach(({ set, r }, k) => {
    if (k % n !== i) return;
    const w = devWorld(comboOf(r)); if (w.rejected || w.worldHash !== r.worldHash) throw Error(`REGENERATION_MISMATCH:${set}:${r.idx}`);
    const p = pcd(projectPublic(w.view), w.band); out.push([set, r.idx, r.worldHash, p.fine, p.coarse]);
  });
  writeExclusive(resolve(WORK, `dev-pcd-shard-${i}-of-${n}.json`), out);
  console.log(`dev pcd shard ${i}/${n}: ${out.length} worlds`);
} else if (mode === 'aggregate') {
  const want = rowsToDigest().length, rows = readdirSync(WORK).filter((f) => f.startsWith('dev-pcd-shard-')).flatMap((f) => JSON.parse(readFileSync(resolve(WORK, f), 'utf8')));
  if (rows.length !== want) throw Error(`SHARDS_INCOMPLETE ${rows.length}/${want}`);
  const val = JSON.parse(readFileSync(resolve(LANE, 'evidence/I2_PCD_VALIDATION.json'), 'utf8'));
  if (!val.allPass) throw Error('PCD_VALIDATION_NOT_PASSING');
  const studied = sealRegistry('STUDIED_341', val.classPcds.map(([set, idx, , fine, coarse]) => ({ id: `${set}:${idx}`, source: 'STUDIED_341', fine, coarse })));
  const dev = sealRegistry('DEV_H2_BASE_WORLDS', rows.map(([set, idx, , fine, coarse]) => ({ id: `${set}:${idx}`, source: 'DEV_H2_BASE', fine, coarse })));
  console.log(JSON.stringify({ studied: { count: studied.count, seal: studied.seal }, dev: { count: dev.count, seal: dev.seal, distinctCoarse: new Set(rows.map((r) => r[4])).size, distinctFine: new Set(rows.map((r) => r[3])).size } }));
  if (process.argv.includes('--write')) {
    writeExclusive(resolve(LANE, 'evidence/I2_REGISTRY_STUDIED_341.json'), studied); writeExclusive(resolve(LANE, 'evidence/I2_REGISTRY_DEV_H2.json'), dev);
    loadRegistry(resolve(LANE, 'evidence/I2_REGISTRY_STUDIED_341.json')); loadRegistry(resolve(LANE, 'evidence/I2_REGISTRY_DEV_H2.json')); console.log('recorded and re-verified both registries');
  }
} else throw Error('USAGE: node i2-dev-coverage.mjs worker <i> <n> | aggregate [--write]');
