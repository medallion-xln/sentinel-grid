// H-W1 I-3 per-class policy identity audit. For one EXPLORATION class it regenerates the native base world, builds relabel / menu / lawful-D4 / public-equivalent hidden-state twins, and runs
// every policy under test on each: the decided keyV2 orbit must map exactly (tolerance 0). It also records legality, deterministic repeat, read-path tracing (allowlist), a poisoned view with
// every excluded field deleted, per-decision compute, and the behaviour of three negative-control policies that are built to fail. Returns plain counts; the driver aggregates and gates.
import { cloneWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { publicContent } from '../stage3h-safety-feasibility-v1/contract.mjs';
import { projectPublic, frameProjection, traceReads, unallowedReads } from './public-projection.mjs';
import { actionFeatures } from './i3-features.mjs';
import { D4_ELEMENTS, D4_NON_IDENTITY, d4Twin, relabelTwin, menuTwin, menuOrders, RELABEL_KINDS } from './transforms.mjs';

const J = JSON.stringify, sorted = (a) => J([...a].sort((x, y) => x - y)), id = (n) => [...Array(n).keys()];

/** Up to `cap` public-equivalent hidden-state twins: health of one structural/hostile entity shifted inside [1, 100], public content unchanged. */
function hiddenTwins(base, cap = 3) {
  const out = []; let nonEquivalent = 0;
  for (const e of base.world.entities) {
    if (out.length >= cap) break; if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
    for (const d of [-20, 20, -10, 10, -5, 5]) {
      const h = e.health + d; if (h < 1 || h > 100) continue;
      const w = cloneWorld(base.world); w.entities.find((x) => x.id === e.id).health = h; const view = observableView(w);
      if (publicContent(view) !== base.content) { nonEquivalent++; continue; } out.push({ world: w, view }); break;
    }
  }
  // whole-board twin: every damaged structural/hostile entity moves to a different health that its own public bucket still allows, alternating direction so the health ranking changes
  const all = cloneWorld(base.world); let moved = 0, j = 0;
  for (const e of all.entities) {
    if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0 && e.health < 100)) continue;
    for (const d of (j++ % 2 ? [20, 10, 5, -5, -10, -20] : [-20, -10, -5, 5, 10, 20])) {
      const h = e.health + d; if (h < 1 || h > 100) continue; const w = cloneWorld(base.world); w.entities.find((x) => x.id === e.id).health = h;
      if (publicContent(observableView(w)) === base.content) { e.health = h; moved++; break; }
    }
  }
  if (moved) { const view = observableView(all); if (publicContent(view) === base.content) out.push({ world: all, view, kind: 'ALL_SHIFT' }); else nonEquivalent++; }
  return { twins: out, nonEquivalent };
}

/** A deep copy of the view with every field the I-1 field audit excluded removed (digests, provenance, handles, opaque encodings, absolute positions, identity). */
export function poisonedView(view) {
  const v = JSON.parse(JSON.stringify(view));
  delete v.state.sourceStateHash; v.state.entities.forEach((e) => { delete e.provenance; delete e.observedPosition; }); v.semantics.forEach((s) => { delete s.provenance; delete s.ACTION_ID; });
  delete v.observation.metadata.worldHash; delete v.observation.sequence; delete v.observation.features; delete v.observation.metadata.canonicalState; delete v.observation.observerId; v.surface.forEach((s) => { delete s.actionId; });
  return v;
}

/** Negative controls: each is a policy over (view, world) that deliberately breaks one identity rule, so the audit must see it fail. */
export const CONTROLS = {
  HANDLE_ORDER: { expect: ['RELABEL'], decide: (view) => id(view.surface.length).reduce((b, i) => (view.surface[i].actionId < view.surface[b].actionId ? i : b), 0) },
  MENU_POSITION: { expect: ['MENU'], decide: () => 0 },
  HIDDEN_HEALTH: { expect: ['HIDDEN'], decide: (view, world) => { let h = 2166136261; for (const ch of world.entities.map((e) => e.health).join(',')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h % view.surface.length; } }, // decision is a hash of the hidden health vector
};

function makeTwins(base, label) {
  const v = base.view, n = v.surface.length, twins = [];
  for (const kind of RELABEL_KINDS) { const t = relabelTwin(v, kind, label); twins.push({ test: 'RELABEL', kind, view: t.view, world: base.world, map: id(n) }); }
  for (const o of menuOrders(n, label)) { const t = menuTwin(v, o.order); twins.push({ test: 'MENU', kind: o.kind, view: t.view, world: base.world, map: id(n).map((i) => o.order.indexOf(i)) }); }
  let d4Unlawful = 0;
  for (const t of D4_NON_IDENTITY) { const w = d4Twin(base.world, t); if (!w.lawful) { d4Unlawful++; continue; } twins.push({ test: 'D4', kind: t, view: w.view, world: w.world, map: v.surface.map((e) => w.view.surface.findIndex((x) => x.actionId === w.actionMap[e.actionId])) }); }
  const hid = hiddenTwins(base); for (const h of hid.twins) twins.push({ test: 'HIDDEN', kind: h.kind ?? 'HEALTH', view: h.view, world: h.world, map: id(n) });
  return { twins, d4Unlawful, hiddenNonEquivalent: hid.nonEquivalent };
}

const bump = (o, k, f) => { const e = (o[k] ??= { n: 0, bad: 0 }); e.n++; if (f) e.bad++; };

/** policies: { name: { decide(view) } }. cls: the EXPLORATION class record; combo: its schedule entry. */
export function auditClass(cls, combo, policies) {
  const base = nativeWorld(combo), v = base.view, n = v.surface.length; if (base.rejected || base.worldHash !== cls.worldHash) throw Error('BASE_REGENERATION_MISMATCH:' + cls.id);
  const { twins, d4Unlawful, hiddenNonEquivalent } = makeTwins(base, cls.id), rec = { id: cls.id, menu: n, twins: twins.length, d4Unlawful, hiddenNonEquivalent, byTest: {}, index: {}, legality: { decisions: 0, illegal: 0 }, repeatMismatch: 0, poisonMismatch: 0, unallowed: [], reads: 0, ms: [], controls: {}, features: { frames: 0, bad: 0 } };
  const P0 = projectPublic(v), rows0 = J(actionFeatures(P0).rows);
  for (const t of D4_ELEMENTS) { rec.features.frames++; if (J(actionFeatures(frameProjection(P0, t)).rows) !== rows0) rec.features.bad++; }
  for (const [name, pol] of Object.entries(policies)) {
    const d0 = pol.decide(v); rec.ms.push(d0.ms); rec.legality.decisions++; if (!(d0.index >= 0 && d0.index < n) || d0.orbit.some((i) => !(i >= 0 && i < n))) rec.legality.illegal++;
    if (J(pol.decide(v).scores) !== J(d0.scores)) rec.repeatMismatch++;
    const tr = traceReads(v); pol.decide(tr.view); rec.reads = Math.max(rec.reads, tr.reads.size); for (const p of unallowedReads(tr.reads)) if (!rec.unallowed.includes(p)) rec.unallowed.push(p);
    const dp = pol.decide(poisonedView(v)); if (dp.index !== d0.index || sorted(dp.orbit) !== sorted(d0.orbit) || J(dp.scores) !== J(d0.scores)) rec.poisonMismatch++;
    for (const t of twins) {
      const d = pol.decide(t.view); rec.legality.decisions++; if (!(d.index >= 0 && d.index < t.view.surface.length)) rec.legality.illegal++;
      bump((rec.byTest[name] ??= {}), t.test, sorted(d0.orbit.map((i) => t.map[i])) !== sorted(d.orbit)); bump((rec.index[name] ??= {}), t.test, t.map[d0.index] !== d.index);
    }
  }
  for (const [name, c] of Object.entries(CONTROLS)) { const b = c.decide(v, base.world); for (const t of twins) bump((rec.controls[name] ??= {}), t.test, t.map[b] !== c.decide(t.view, t.world)); }
  return rec;
}
