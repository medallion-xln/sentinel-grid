// H-W1 I-1 per-class audit. For one spent observation class (a DEV fixture, not independent evidence) it regenerates the native base world, builds the
// relabel / menu / D4 / hidden-state twins, and records: projection reads, keyV1 regression, keyV2 uniqueness, mapped-key invariance with negative
// controls, projection equality, equivariant-selection results for the I-1 selector and three naive tie-breaks, canonical-frame and symmetry
// invariance, comparator stability at the keyV2 level, and the field-role statistics. Returns plain counts; the driver aggregates and gates.
import { cloneWorld } from '../src/forge/kernel.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { comboOf } from '../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { nativeWorld } from '../stage3h-safety-feasibility-v1/twins.mjs';
import { publicContent } from '../stage3h-safety-feasibility-v1/contract.mjs';
import { semanticKey } from '../stage3h-wider-action-feasibility-v1/intersect.mjs';
import { projectPublic, frameProjection, keyV1, keysV2, traceReads, unallowedReads, symmetryReport, canonicalFrame } from './public-projection.mjs';
import { D4_NON_IDENTITY, d4Twin, relabelTwin, menuTwin, menuOrders, RELABEL_KINDS } from './transforms.mjs';
import { compareKeys, SELECTORS, SCORES } from './i1-audit-checks.mjs';
import { comparatorSummary, compareComparators } from './i1-audit-comparators.mjs';

const J = JSON.stringify;
/** The three BYPASS key collisions recorded in KEY_COLLISIONS.json (spent DEV classes). */
export const BYPASS_TARGETS = [['FRESH_CHECK', 6236], ['FRESH_EXPLORE', 5593], ['FRESH_CHECK', 6198]];
const groups = (keys) => Object.values(keys.reduce((m, k, i) => ((m[k] ??= []).push(i), m), {})).filter((g) => g.length > 1);
const CMP_KINDS = new Set(['O2R1_EQUIVALENT', 'RANDOM_1', 'REVERSE']);

/** Field-role statistics: what resourceFlag, observationTimestamp, provenance and sequence actually are in this view. */
function fieldStats(v) {
  const st = v.state, es = st.entities, uniq = (f) => [...new Set(es.map((e) => J(f(e))))].sort();
  return { resourceByKind: [...new Set(es.map((e) => `${e.entityKind}:${e.resourceFlag}`))].sort(), tick: v.observation.metadata.tick, timestamp: st.observationTimestamp,
    entityTimestampEqualsTick: es.every((e) => e.observationTimestamp === st.observationTimestamp), logicalTimeEqualsTick: es.every((e) => e.provenance.logicalTime === st.observationTimestamp),
    digestIsStateHash: es.every((e) => e.provenance.sourceStateHash === st.sourceStateHash), provenanceConstants: uniq((e) => [e.provenance.access, e.provenance.schemaId, e.provenance.epistemicSchemaHash]),
    sequence: v.observation.sequence, observerId: v.observation.observerId, entityCount: es.length };
}

/** Up to `cap` public-equivalent hidden-state twins: one per structural/hostile entity, health shifted inside [1, 100] without changing any public field. */
function hiddenTwinSet(base, cap = 4) {
  const out = []; let nonEquivalent = 0;
  for (const e of base.world.entities) {
    if (out.length >= cap) break;
    if (e.type === 'ACTOR' || e.type === 'CIVILIAN' || !(e.health > 0)) continue;
    for (const d of [-20, 20, -10, 10, -5, 5]) {
      const h = e.health + d; if (h < 1 || h > 100) continue;
      const w = cloneWorld(base.world); w.entities.find((x) => x.id === e.id).health = h;
      const view = observableView(w);
      if (publicContent(view) !== base.content) { nonEquivalent++; continue; }
      out.push({ world: w, view }); break;
    }
  }
  return { twins: out, nonEquivalent };
}

export function auditClass(cand) {
  const t0 = Date.now(), { set, row } = cand, base = nativeWorld(comboOf(row)), v = base.view, label = `${set}:${row.idx}`, n = v.surface.length;
  if (base.rejected || base.worldHash !== row.worldHash) throw Error('BASE_REGENERATION_MISMATCH:' + label);
  const tr = traceReads(v), P0 = projectPublic(tr.view), unallowed = unallowedReads(tr.reads);
  const id = [...Array(n).keys()], keys = keysV2(P0), k1 = v.surface.map((_, i) => keyV1(P0, i));
  const B = { view: v, world: base.world, P: P0 }, twins = [];
  for (const kind of RELABEL_KINDS) { const t = relabelTwin(v, kind, label); twins.push({ test: 'RELABEL', kind, view: t.view, world: base.world, P: projectPublic(t.view), map: id }); }
  for (const o of menuOrders(n, label)) { const t = menuTwin(v, o.order); twins.push({ test: 'MENU', kind: o.kind, view: t.view, world: base.world, P: projectPublic(t.view), map: id.map((i) => o.order.indexOf(i)) }); }
  let d4Unlawful = 0;
  for (const t of D4_NON_IDENTITY) {
    const w = d4Twin(base.world, t); if (!w.lawful) { d4Unlawful++; continue; }
    twins.push({ test: 'D4', kind: t, view: w.view, world: w.world, P: projectPublic(w.view), framed: frameProjection(P0, t), map: v.surface.map((e) => w.view.surface.findIndex((x) => x.actionId === w.actionMap[e.actionId])) });
  }
  const hid = hiddenTwinSet(base);
  for (const h of hid.twins) twins.push({ test: 'HIDDEN', kind: 'HEALTH', view: h.view, world: h.world, P: projectPublic(h.view), map: id });

  const rec = { set, idx: row.idx, cell: row.cell, menu: n, nodes: P0.nodes.length, fields: fieldStats(v), unallowed, v1Bad: v.surface.filter((_, i) => k1[i] !== semanticKey(v, i)).length,
    dupV1: groups(k1).length, dupV2: groups(keys).length, d4Lawful: twins.filter((t) => t.test === 'D4').length, d4Unlawful, hiddenNonEquivalent: hid.nonEquivalent,
    keys: {}, proj: {}, select: {}, canon: { n: 0, bad: 0 }, comparators: {} };
  const sym0 = symmetryReport(P0), cf0 = canonicalFrame(P0), orbits0 = J(sym0.orbitSizes);
  rec.sym = { stabiliser: sym0.stabiliser, discrete: sym0.nodeColoursDiscrete, nontrivialOrbits: sym0.nontrivialOrbits, fixed: sym0.fixedActions.length, waitFixed: sym0.waitFixed, symmetric: sym0.symmetric, isoFailed: sym0.isoFailed, canonicalStabiliser: cf0.stabiliserSize };
  const picks = {}; for (const s of Object.keys(SELECTORS)) for (const sc of Object.keys(SCORES)) picks[`${s}/${sc}`] = SELECTORS[s](P0, v, SCORES[sc](P0));
  rec.ties = Object.fromEntries(Object.keys(SCORES).map((sc) => { const s = SCORES[sc](P0), m = Math.max(...id.map(s)); return [sc, id.filter((i) => s(i) === m).length]; }));
  const base0 = comparatorSummary(v, base.band);
  for (const t of twins) {
    const a = (rec.keys[t.test] ??= { n: 0, real: 0, leaks: {}, twins: 0 }), r = compareKeys(t.test, B, t);
    a.twins++; a.n += r.n; a.real += r.real; for (const [k, c] of Object.entries(r.leaks)) a.leaks[k] = (a.leaks[k] ?? 0) + c;
    if (t.test === 'RELABEL' || t.test === 'HIDDEN') { const p = (rec.proj[t.test] ??= { n: 0, bad: 0, digestDiffers: 0 }); p.n++; if (J(t.P) !== J(P0)) p.bad++; if (t.view.state.sourceStateHash !== v.state.sourceStateHash) p.digestDiffers++; }
    for (const [name, pick] of Object.entries(picks)) {
      const [s, sc] = name.split('/'), q = ((rec.select[name] ??= {})[t.test] ??= { n: 0, bad: 0 });
      q.n++; if (t.map[pick] !== SELECTORS[s](t.P, t.view, SCORES[sc](t.P))) q.bad++;
    }
    if (t.test !== 'HIDDEN') { const ct = canonicalFrame(t.P), st = symmetryReport(t.P); rec.canon.n++; if (ct.digest !== cf0.digest || ct.stabiliserSize !== cf0.stabiliserSize || J(st.orbitSizes) !== orbits0) rec.canon.bad++; }
    if (t.test === 'HIDDEN' || t.test === 'D4' || CMP_KINDS.has(t.kind)) {
      const c = compareComparators(base0, comparatorSummary(t.view, base.band), t.framed ?? P0, t.P, t.map), q = (rec.comparators[t.test] ??= { n: 0, maxScoreDiff: 0 });
      q.n++; q.maxScoreDiff = Math.max(q.maxScoreDiff, c.s0MaxScoreDiff);
      for (const [k, ok] of Object.entries(c)) if (typeof ok === 'boolean') q[k] = (q[k] ?? 0) + (ok ? 1 : 0);
    }
  }
  if (BYPASS_TARGETS.some(([s, i]) => s === set && i === row.idx)) {
    const dep = (i) => (P0.menu[i].dependent == null ? null : `${P0.nodes[P0.menu[i].dependent].kind}:${P0.nodes[P0.menu[i].dependent].flags.resource}`);
    rec.bypass = { keyV1Groups: groups(k1).map((g) => ({ actions: g, type: P0.menu[g[0]].type, dependents: g.map(dep) })), keyV2Groups: groups(keys).length, keyV2Distinct: new Set(keys).size === keys.length };
  }
  rec.ms = Date.now() - t0;
  return rec;
}
