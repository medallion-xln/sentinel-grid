// H-W1 I-4 training dataset (EXPLORATION population only). One row per menu action. Inputs are the public features of i3-features.mjs; offline native outcomes appear ONLY as labels
// (class-mean orbit nreg, orbit catastrophe indicator) and never as a feature. A decision is the keyV2 orbit of the chosen action, so labels are orbit-level: nreg = uniform mean over the
// orbit then mean over member worlds; cat = the orbit holds a regret >= 100 action in ANY member world (class-safe means no member is catastrophic).
//   buildDataset(classes) -> { W, N, X(flat), classOf, start, labels{nreg,cat}, het, typeOf, classes[] }
//   pick(ds, ci, scoreAt) -> menu index chosen exactly as selectEquivariant would (symmetry-fixed actions, canonical-frame tie-break); orbitOf(ds, ci, i) -> keyV2-equal indices
import { actionFeatures, NAMES } from './i3-features.mjs';
import { keysV2, symmetryReport, canonicalActionKeys } from './public-projection.mjs';
import { scoreIndexSet } from './hw1-eval.mjs';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, N_TYPES = NAMES.findIndex((n) => !n.startsWith('type.'));
export const TYPE_NAMES = NAMES.slice(0, N_TYPES).map((n) => n.slice(5));

export function buildDataset(classes) {
  const W = NAMES.length, per = classes.map((c) => {
    const P = c.projection, { rows } = actionFeatures(P), keys = keysV2(P), n = P.menu.length;
    if (n !== c.menu.length || c.members.some((m) => m.truth.length !== n)) throw Error('DATASET_MENU_TRUTH_MISMATCH:' + c.id);
    const orbits = keys.map((k) => keys.map((kk, j) => (kk === k ? j : -1)).filter((j) => j >= 0)), sc = c.members.map((m) => orbits.map((o) => scoreIndexSet(o, m.truth)));
    const sym = symmetryReport(P);
    return { rows, n, keys, orbits, canon: canonicalActionKeys(P).keys, fixed: sym.fixedActions, nreg: orbits.map((_, a) => mean(sc.map((s) => s[a].nreg))), cat: orbits.map((_, a) => Number(sc.some((s) => s[a].cat))),
      het: orbits.map((_, a) => { const k = sc.filter((s) => s[a].cat).length; return Number(k > 0 && k < sc.length); }) };
  });
  const total = per.reduce((a, p) => a + p.n, 0), X = new Float64Array(total * W), classOf = new Int32Array(total), typeOf = new Int8Array(total), start = [], labels = { nreg: new Float64Array(total), cat: new Float64Array(total) }, het = new Uint8Array(total);
  let r = 0;
  per.forEach((p, ci) => {
    start.push(r);
    for (let i = 0; i < p.n; i++, r++) { X.set(p.rows[i], r * W); classOf[r] = ci; typeOf[r] = p.rows[i].slice(0, N_TYPES).indexOf(1); labels.nreg[r] = p.nreg[i]; labels.cat[r] = p.cat[i]; het[r] = p.het[i]; }
  });
  return { W, N: total, X, classOf, typeOf, start, labels, het, classes: per.map((p, ci) => ({ id: classes[ci].id, family: classes[ci].family, n: p.n, keys: p.keys, orbits: p.orbits, canon: p.canon, fixed: p.fixed, nreg: p.nreg, cat: p.cat })) };
}

export const orbitOf = (ds, ci, i) => ds.classes[ci].orbits[i];

/** Same selection semantics as public-projection.selectEquivariant, over precomputed symmetry and canonical keys. */
export function pick(ds, ci, scoreAt) {
  const c = ds.classes[ci], base = ds.start[ci], cand = c.fixed.length ? c.fixed : [...Array(c.n).keys()];
  let best = null;
  for (const i of cand) { const s = scoreAt(base + i); if (best === null || s > best.s || (s === best.s && c.canon[i] < c.canon[best.i])) best = { i, s }; }
  return best.i;
}
