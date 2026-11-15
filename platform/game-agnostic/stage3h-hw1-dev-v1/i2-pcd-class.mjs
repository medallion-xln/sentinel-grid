// H-W1 I-2 per-class PCD validation on one spent observation class (a DEV fixture, not independent evidence). Regenerates the native base world, builds the
// relabel / menu-order / lawful-D4 / public-equivalent hidden-state twins, and checks that the fine and coarse PCD are identical on every twin, that each naive
// digest (negative control) is caught by at least one twin kind, and that every one-field tamper of the projection changes the digest as declared.
import { cloneWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { publicContent } from '../stage3h-safety-feasibility-v1/contract.mjs';
import { projectPublic } from './public-projection.mjs';
import { D4_NON_IDENTITY, d4Twin, relabelTwin, menuTwin, menuOrders, RELABEL_KINDS } from './transforms.mjs';
import { pcd, pcdOfView, NAIVE_PCD, TAMPERS, tamperedPcd } from './i2-pcd.mjs';

/** Up to `cap` public-equivalent hidden-state twins (one non-actor, non-civilian entity's health shifted inside [1, 100] without changing any public field). */
export function hiddenTwins(base, cap = 4) {
  const out = [];
  for (const e of base.world.entities) {
    if (out.length >= cap) break;
    if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
    for (const d of [-20, 20, -10, 10, -5, 5]) {
      const h = e.health + d; if (h < 1 || h > 100) continue;
      const w = cloneWorld(base.world); w.entities.find((x) => x.id === e.id).health = h;
      const view = observableView(w);
      if (publicContent(view) !== base.content) continue;
      out.push({ view }); break;
    }
  }
  return out;
}

export function pcdClass(cand) {
  const t0 = Date.now(), { set, row } = cand, base = nativeWorld(comboOf(row)), label = `${set}:${row.idx}`, v = base.view, n = v.surface.length;
  if (base.rejected || base.worldHash !== row.worldHash) throw Error('BASE_REGENERATION_MISMATCH:' + label);
  const P0 = projectPublic(v), band = base.band, p0 = pcd(P0, band), twins = [];
  for (const kind of RELABEL_KINDS) twins.push({ test: 'RELABEL', view: relabelTwin(v, kind, label).view });
  for (const o of menuOrders(n, label)) twins.push({ test: 'MENU', view: menuTwin(v, o.order).view });
  let d4Unlawful = 0;
  for (const t of D4_NON_IDENTITY) { const w = d4Twin(base.world, t); if (w.lawful) twins.push({ test: 'D4', view: w.view }); else d4Unlawful++; }
  for (const h of hiddenTwins(base)) twins.push({ test: 'HIDDEN', view: h.view });
  const rec = { set, idx: row.idx, cell: row.cell, seed: row.seed, worldHash: row.worldHash, band, fine: p0.fine, coarse: p0.coarse, menu: n, d4Unlawful, twins: {}, naive: {}, tamper: {} };
  const naive0 = Object.fromEntries(Object.entries(NAIVE_PCD).map(([k, f]) => [k, f(v, band)]));
  for (const t of twins) {
    const q = (rec.twins[t.test] ??= { n: 0, fineBad: 0, coarseBad: 0 }), p = pcdOfView(t.view, band);
    q.n++; if (p.fine !== p0.fine) q.fineBad++; if (p.coarse !== p0.coarse) q.coarseBad++;
    for (const [k, f] of Object.entries(NAIVE_PCD)) { const c = ((rec.naive[k] ??= {})[t.test] ??= { n: 0, differs: 0 }); c.n++; if (f(t.view, band) !== naive0[k]) c.differs++; }
  }
  for (const t of TAMPERS) {
    const { pcd: q, enters } = tamperedPcd(P0, band, t);
    rec.tamper[t.name] = { fineChanged: q.fine !== p0.fine, coarseChanged: q.coarse !== p0.coarse, enters };
  }
  rec.ms = Date.now() - t0;
  return rec;
}
