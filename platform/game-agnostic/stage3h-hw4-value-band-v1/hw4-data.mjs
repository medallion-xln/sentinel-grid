// H-W4 Phase 6 training dataset (EXPLORATION population only). Adapted from the frozen H-W1 i4-data.mjs with exactly ONE
// difference: the per-action feature rows come from the arm's builder (V1 = frozen I-3 rows; V2 = same rows + 8 band
// one-hots). Orbit keys, symmetry, canonical keys, and the offline native outcomes (labels ONLY: orbit-mean nreg, orbit
// catastrophe indicator) are byte-identical between arms — the band never enters action identity.
//   buildDataset(classes, arm) -> { W, N, X(flat), classOf, start, labels{nreg,cat}, het, typeOf, classes[] }
//   pick(ds, ci, scoreAt) — same selection semantics as selectEquivariant (symmetry-fixed, canonical tie-break).
import { NAMES } from '../stage3h-hw1-dev-v1/i3-features.mjs';
import { keysV2, symmetryReport, canonicalActionKeys } from '../stage3h-hw1-dev-v1/public-projection.mjs';
import { scoreIndexSet } from '../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { ARM_FEATURES } from './hw4-policy.mjs';

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, N_TYPES = NAMES.findIndex((n) => !n.startsWith('type.'));
export const TYPE_NAMES = NAMES.slice(0, N_TYPES).map((n) => n.slice(5));

export function buildDataset(classes, armKey) {
  const arm = ARM_FEATURES[armKey]; if (!arm) throw Error('UNKNOWN_ARM:' + armKey);
  const W = arm.names.length, per = classes.map((c) => {
    const P = armKey === 'V2_PUBLIC_PLUS_VALUE_BAND' ? c.projectionBanded : c.projection;
    if (!P) throw Error('ARM_PROJECTION_MISSING:' + c.id);
    if (armKey === 'V2_PUBLIC_PLUS_VALUE_BAND' && c.valueSpread === undefined) throw Error('V2_VALUE_SPREAD_MISSING:' + c.id);
    const { rows } = arm.build(P), keys = keysV2(P), n = P.menu.length;
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
