// SK1 DESIGN FIXTURE (development only, never a gating statistic). Re-uses the SPENT H-W4 EXPLORATION (training) classes
// — never H-W4 VALIDATION — restricted to the origin families that the SK1 split rule assigns to EXPLORATION, and adds the
// canonical advisory evidence by regenerating each base world's public view. Output is privileged and gitignored.
//   /opt/homebrew/bin/node infra/dev-fixture.mjs worker <i> <n>
import { readdirSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { nativeWorld } from '../../stage3h-safety-feasibility-v1/twins.mjs';
import { loadAllocation, loadExclusions, blockSchedule } from '../../stage3h-hw4-value-band-v1/hw4-allocator.mjs';
import { projectPublic } from '../adapters/forge/projection.mjs';
import { evidenceForView } from './evidence-source.mjs';
import { GA, WORK, readJ, sha, fail, writeExclusive, populationOfFamily } from './common.mjs';

const [mode, a1, a2] = process.argv.slice(2), i = Number(a1), n = Number(a2);
if (mode !== 'worker' || !(i >= 0 && i < n)) fail('USAGE: node infra/dev-fixture.mjs worker <i> <n>');
const SRC = resolve(GA, 'stage3h-hw4-value-band-v1/work/classes/EXPLORATION'), alloc = loadAllocation(), ctx = loadExclusions(), sched = new Map(), t0 = Date.now();
const comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(blockSchedule(ctx, 'EXPLORATION', b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
const all = readdirSync(SRC).sort().flatMap((f) => readJ(resolve(SRC, f)).classes).filter((c) => c.status === 'OK' && populationOfFamily(c.family) === 'EXPLORATION').sort((x, y) => (sha(x.worldHash) < sha(y.worldHash) ? -1 : 1));
const out = []; let projectionMismatch = 0;
all.forEach((c, j) => { if (j % n !== i) return;
  const w = nativeWorld(comboFor(c.block, c.k)); if (w.rejected || w.worldHash !== c.worldHash) fail('FIXTURE_REGENERATION_MISMATCH');
  const { evidence, lock } = evidenceForView(w.view, w.band), P = projectPublic(w.view); if (JSON.stringify(P) !== JSON.stringify(c.projection)) projectionMismatch++;
  const ix = (ids) => ids.map((id) => lock.menu.indexOf(id)).sort((a, b) => a - b);
  if (JSON.stringify(ix(lock.selections.B)) !== JSON.stringify([...c.B].sort((a, b) => a - b)) || JSON.stringify(ix(lock.selections.N)) !== JSON.stringify([...c.N].sort((a, b) => a - b))) fail('FIXTURE_COMPARATOR_MISMATCH');
  out.push({ id: `FX-${String(j).padStart(4, '0')}`, family: c.family, cell: c.cell, projection: c.projection, evidence, menu: c.menu.map((_, q) => q), B: c.B, N: c.N, members: c.members.map((m) => ({ kind: m.kind, truth: m.truth })) }); });
mkdirSync(resolve(WORK, 'dev-fixture'), { recursive: true });
writeExclusive(resolve(WORK, 'dev-fixture', `fixture-${i}-of-${n}.json`), JSON.stringify({ label: 'SK1_DESIGN_FIXTURE_FROM_SPENT_HW4_EXPLORATION', eligible: all.length, shard: i, of: n, projectionMismatch, classes: out }));
console.log(JSON.stringify({ shard: i, of: n, eligible: all.length, built: out.length, projectionMismatch, seconds: (Date.now() - t0) / 1000 }));
