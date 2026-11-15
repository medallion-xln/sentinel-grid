// H-DISC-1 — synthetic mathematical witnesses for the non-additivity gate (REPRESENTATION ONLY).
//
// Everything here is hand-built mathematics. No parameter is learned, sampled or fitted; no world, label or historical
// outcome is involved. A witness shows what a model family CAN represent. It is not evidence that a trained model
// would represent anything useful, and it is not a safety or performance result.
//
// The additive class.  A comparator is ADDITIVE when there is a per-action score s(phi, c) with
//       l(a, b) = s(phi_b, c) - s(phi_a, c)          for every pair of the menu.
// Four consequences, each of which the gate tests on the additive control and violates with a witness:
//   L1 cocycle       l(a,b) + l(b,d) + l(d,a) = 0 for every triple
//   L2 acyclicity    the strict majority relation "p(a,b) > 1/2" is acyclic
//   L3 independence  whether a ranks above b in the aggregated order does not depend on which other actions are present
//   L4 determinism   l(a,b) depends on a only through phi_a (and on b only through phi_b): equal descriptors, equal comparison
// Not part of the inference closure.
import { FAMILIES, ORIGINS, PARAMETER_SCHEMA, parametersHash, validateParameters } from '../discriminator/pair-model.mjs';

const leaf = (v) => v, split = (f, t, l, r) => ({ f, t, l, r });
/** Nested tree description -> the flat { f, t, l, r, v } format (children always after parents). */
export function flatten(node) {
  const T = { f: [], t: [], l: [], r: [], v: [] }, put = (x) => { const i = T.f.length; T.f.push(-1); T.t.push(0); T.l.push(-1); T.r.push(-1); T.v.push(0);
    if (typeof x === 'number') { T.v[i] = x; return i; } T.f[i] = x.f; T.t[i] = x.t; T.l[i] = put(x.l); T.r[i] = put(x.r); return i; };
  put(node); return T;
}
const seal = (p) => { const q = { schema: PARAMETER_SCHEMA, origin: ORIGINS.SYNTHETIC, ...p }; q.parametersHash = parametersHash(q); validateParameters(q); return Object.freeze(q); };
/** A balanced lookup over one categorical input taking the integer values 0..K-1: input index f, one sub-tree per value. */
const lookup = (f, K, sub) => { const go = (lo, hi) => (lo === hi ? sub(lo) : split(f, (lo + hi) >> 1, go(lo, (lo + hi) >> 1), go(((lo + hi) >> 1) + 1, hi))); return go(0, K - 1); };

/**
 * PAIR family witness from a table: one categorical descriptor "suit" with values 0..K-1 and logit table T, where
 * T[x][y] is the evidence that an action of suit x is safer than one of suit y. T must be antisymmetric.
 * Every root-to-leaf path splits on phi_a.suit and then on phi_b.suit: a pure cross-action interaction.
 */
export function pairTableWitness(T, { bags = 1, name = 'suit' } = {}) {
  const K = T.length; for (let x = 0; x < K; x++) for (let y = 0; y < K; y++) if (T[x][y] !== -T[y][x]) throw Error('WITNESS_TABLE_NOT_ANTISYMMETRIC');
  const tree = flatten(lookup(0, K, (x) => lookup(1, K, (y) => leaf(T[x][y]))));
  return seal({ family: FAMILIES.PAIR, layout: { descriptor: [name], relation: [], context: [] }, bags: Array.from({ length: bags }, () => ({ trees: [tree] })) });
}
/** ADDITIVE control from per-suit scores s[x] (higher = riskier): l(a,b) = s[suit_b] - s[suit_a]. */
export function additiveScoreWitness(s, { name = 'suit' } = {}) {
  return seal({ family: FAMILIES.ADDITIVE, layout: { descriptor: [name], relation: [], context: [] }, bags: [{ trees: [flatten(lookup(0, s.length, (x) => leaf(s[x])))] }] });
}
/** The SAME additive scorer written in the PAIR family: one tree reads only phi_b, one reads only phi_a. No cross-action path. */
export function additiveInPairFamily(s, { name = 'suit' } = {}) {
  const K = s.length;
  return seal({ family: FAMILIES.PAIR, layout: { descriptor: [name], relation: [], context: [] }, bags: [{ trees: [flatten(lookup(1, K, (y) => leaf(s[y]))), flatten(lookup(0, K, (x) => leaf(-s[x])))] }] });
}
/**
 * Pair-RELATION witness. Descriptor u in {0,1}; relation "sameCell" in {0,1} between the two actions.
 * When the two actions end in the same cell, the one with the lower u is safer; when they do not, the one with the
 * higher u is safer. The comparison of two actions therefore depends on something that belongs to neither action alone.
 */
export function relationWitness() {
  // input layout: [ phi_a.u (0) | phi_b.u (1) | rho.sameCell (2) ]
  const lowerIsSafer = split(0, 0.5, split(1, 0.5, 0, 1.5), split(1, 0.5, -1.5, 0)), higherIsSafer = split(0, 0.5, split(1, 0.5, 0, -1.5), split(1, 0.5, 1.5, 0));
  return seal({ family: FAMILIES.PAIR, layout: { descriptor: ['u'], relation: ['pair.sameCell'], context: [] }, bags: [{ trees: [flatten(split(2, 0.5, higherIsSafer, lowerIsSafer))] }] });
}
/** CONTEXT-dependent interaction: the cyclic table applies in context k = 1 and the transitive one in k = 0. */
export function contextWitness(Tcycle, Tflat) {
  const K = Tcycle.length, t = (T) => lookup(0, K, (x) => lookup(1, K, (y) => leaf(T[x][y])));
  return seal({ family: FAMILIES.PAIR, layout: { descriptor: ['suit'], relation: [], context: ['k'] }, bags: [{ trees: [flatten(split(2, 0.5, t(Tflat), t(Tcycle)))] }] });
}

// ---------------------------------------------------------------- tests of additivity on a logit or probability matrix
/** L1: the largest |l(a,b) + l(b,c) + l(c,a)| over all triples. Zero (to rounding) exactly when the matrix is additive. */
export function cocycleResidual(L) { const n = L.length; let m = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) if (a !== b && b !== c && a !== c) m = Math.max(m, Math.abs(L[a][b] + L[b][c] + L[c][a])); return m; }
/** The best per-action scores for a logit matrix (least squares) and how far the matrix is from them. */
export function additiveFit(L) { const n = L.length, s = L.map((row) => -row.reduce((x, y) => x + y, 0) / n); let m = 0; for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) m = Math.max(m, Math.abs(L[a][b] - (s[b] - s[a]))); return { scores: s, maxResidual: m }; }
/** L2: does the strict majority relation contain a cycle? If it does, NO per-action score can agree with every comparison. */
export function majorityCycle(P) {
  const n = P.length, state = Array(n).fill(0); let found = null;
  const visit = (v, path) => { state[v] = 1; for (let w = 0; w < n && !found; w++) if (w !== v && P[v][w] > 0.5) { if (state[w] === 1) found = [...path.slice(path.indexOf(w)), w]; else if (state[w] === 0) visit(w, [...path, w]); } state[v] = 2; };
  for (let v = 0; v < n && !found; v++) if (state[v] === 0) visit(v, [v]); return found;
}
