// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — Component B: context-dependent, non-additive action-pair comparison.
//
// This file defines two MODEL FAMILIES and how a parameter set of either family is EVALUATED. It contains no parameter,
// fits nothing and can create no parameter: there is no training routine here or anywhere in this lane.
//
//   HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1   (the proposed comparator)
//       raw scorer  g(x_ab),  x_ab = [ phi_a (d) | phi_b (d) | rho_ab (r) | c (k) ]      "evidence that a is safer than b"
//       logit       l(a,b) = 1/2 * [ g(x_ab) - g(x_ba) ]                                 antisymmetric by construction
//       A tree may split on an input of phi_a and on an input of phi_b (or rho) along ONE path. That is what makes the
//       family non-additive: such a term is not a difference of two per-action scores.
//   HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1     (the matched additive control)
//       score       s(y_a),   y_a = [ phi_a (d) | c (k) ]                                 a per-action risk score
//       logit       l(a,b) = s(y_b) - s(y_a)                                             a difference of per-action scores
//
// Both use the same tree format, the same bags, the same link and the same downstream aggregation, so that a future
// comparison of the two differs only in what the trees may look at together.
// Probability semantics (H-DISC-0 pairwise contract): p(a,b) = sigma(l(a,b)) estimates
//       P( L(a) < L(b) ) + 1/2 P( L(a) = L(b) ),  hence p(a,b) + p(b,a) = 1 and p(a,a) = 1/2.
// Pure: the only import is the canonical hashing helper.
import { stable, sha256 } from './canonical.mjs';

export const FAMILIES = Object.freeze({ PAIR: 'HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1', ADDITIVE: 'HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1' });
export const PARAMETER_SCHEMA = 'HDISC_PAIR_MODEL_PARAMETERS_V1';
// A parameter set must say where it came from. Nothing in this stage may produce the first kind.
export const ORIGINS = Object.freeze({ LEARNED: 'LEARNED_UNDER_FROZEN_PREREGISTRATION', SYNTHETIC: 'SYNTHETIC_MATHEMATICAL_WITNESS' });

export class ModelRejection extends Error { constructor(code, detail = '') { super(detail ? `${code}:${detail}` : code); this.name = 'ModelRejection'; this.code = code; this.detail = detail; } }
const reject = (code, detail) => { throw new ModelRejection(code, detail); };
export { sha256 };
/** Hash of a parameter set, excluding the hash field itself. */
export const parametersHash = (p) => { const { parametersHash: _omit, ...rest } = p; return sha256(stable(rest)); };

/** Input layout of a parameter set: the widths and the index ranges of each block. */
export function layoutOf(p) {
  const d = p.layout.descriptor.length, r = p.layout.relation.length, k = p.layout.context.length;
  return p.family === FAMILIES.PAIR ? { d, r, k, width: 2 * d + r + k, phiA: [0, d], phiB: [d, 2 * d], rho: [2 * d, 2 * d + r], ctx: [2 * d + r, 2 * d + r + k] } : { d, r: 0, k, width: d + k, phi: [0, d], ctx: [d, d + k] };
}
const depthOf = (t) => { const go = (n) => (t.f[n] < 0 ? 0 : 1 + Math.max(go(t.l[n]), go(t.r[n]))); return go(0); };

/** Structural validation. Throws; never repairs. A tree is { f, t, l, r, v }: f[n] < 0 marks a leaf with value v[n]. */
export function validateParameters(p) {
  if (!p || typeof p !== 'object') reject('PARAMETERS_NOT_AN_OBJECT'); if (p.schema !== PARAMETER_SCHEMA) reject('PARAMETER_SCHEMA_MISMATCH', String(p.schema));
  if (!Object.values(FAMILIES).includes(p.family)) reject('UNKNOWN_MODEL_FAMILY', String(p.family)); if (!Object.values(ORIGINS).includes(p.origin)) reject('PARAMETER_ORIGIN_NOT_DECLARED', String(p.origin));
  const L = p.layout; if (!L || ![L.descriptor, L.relation, L.context].every((a) => Array.isArray(a) && a.every((n) => typeof n === 'string' && n))) reject('PARAMETER_LAYOUT_MALFORMED');
  const names = [...L.descriptor, ...L.relation, ...L.context]; if (new Set(names).size !== names.length) reject('PARAMETER_LAYOUT_DUPLICATE_NAME');
  if (p.family === FAMILIES.ADDITIVE && L.relation.length) reject('ADDITIVE_FAMILY_CANNOT_TAKE_PAIR_RELATIONS'); if (!L.descriptor.length) reject('PARAMETER_LAYOUT_EMPTY_DESCRIPTOR');
  if (!Array.isArray(p.bags) || !p.bags.length) reject('PARAMETERS_WITHOUT_BAGS'); const { width } = layoutOf(p);
  p.bags.forEach((bag, bi) => { if (!bag || !Array.isArray(bag.trees) || !bag.trees.length) reject('BAG_WITHOUT_TREES', String(bi));
    bag.trees.forEach((t, ti) => { const at = `${bi}/${ti}`, n = t?.f?.length; if (!n || ![t.t, t.l, t.r, t.v].every((a) => Array.isArray(a) && a.length === n)) reject('TREE_MALFORMED', at);
      for (let i = 0; i < n; i++) { if (!Number.isInteger(t.f[i])) reject('TREE_MALFORMED', at);
        if (t.f[i] < 0) { if (typeof t.v[i] !== 'number' || !Number.isFinite(t.v[i])) reject('TREE_LEAF_NOT_FINITE', at); continue; }
        if (t.f[i] >= width) reject('TREE_SPLIT_OUTSIDE_INPUT_LAYOUT', `${at}:${t.f[i]}>=${width}`); if (typeof t.t[i] !== 'number' || !Number.isFinite(t.t[i])) reject('TREE_THRESHOLD_NOT_FINITE', at);
        for (const c of [t.l[i], t.r[i]]) if (!Number.isInteger(c) || c <= i || c >= n) reject('TREE_CHILD_INDEX_INVALID', at); } }); }); // children after parents: no cycle is expressible
  if (p.parametersHash !== undefined && p.parametersHash !== parametersHash(p)) reject('PARAMETERS_HASH_MISMATCH');
  return true;
}
export const treeValue = (t, x) => { let n = 0; while (t.f[n] >= 0) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n]; return t.v[n]; };
const bagValue = (bag, x) => { let s = 0; for (const t of bag.trees) s += treeValue(t, x); return s; };
const sigmoid = (x) => (x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x)));

/**
 * Per-bag logits l_b(a, b) for one ORDERED pair. Inputs are numeric arrays in the layout of the parameter set.
 * rhoAB / rhoBA are the pair-relation inputs for the two orders (both are needed: antisymmetry does not require rho_ba = -rho_ab).
 * Returns null when any input is missing or not finite: an unsupported comparison is reported, never imputed.
 */
export function pairLogits(p, phiA, phiB, rhoAB, rhoBA, ctx) {
  const L = layoutOf(p), ok = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));
  if (!ok(phiA, L.d) || !ok(phiB, L.d) || !ok(ctx, L.k)) return null;
  if (p.family === FAMILIES.ADDITIVE) { const ya = [...phiA, ...ctx], yb = [...phiB, ...ctx]; return p.bags.map((bag) => bagValue(bag, yb) - bagValue(bag, ya)); }
  if (!ok(rhoAB, L.r) || !ok(rhoBA, L.r)) return null;
  const xab = [...phiA, ...phiB, ...rhoAB, ...ctx], xba = [...phiB, ...phiA, ...rhoBA, ...ctx];
  return p.bags.map((bag) => (bagValue(bag, xab) - bagValue(bag, xba)) / 2);
}
/** Ensemble comparison for one ordered pair: probability, logit, and the disagreement between bags. */
export function comparePair(p, phiA, phiB, rhoAB, rhoBA, ctx) {
  return summariseLogits(pairLogits(p, phiA, phiB, rhoAB, rhoBA, ctx));
}
/** Shared aggregation keeps cached additive comparisons bit-identical to individual pair evaluation. */
export function summariseLogits(ls) {
  if (ls === null || ls.some((v) => !Number.isFinite(v))) return null;
  const s = [...ls].sort((a, b) => a - b); let t = 0; for (const v of s) t += v; const mean = t / s.length; // order-independent sum
  let q = 0; for (const v of s) q += (v - mean) * (v - mean); const sd = Math.sqrt(q / s.length), sign = Math.sign(mean);
  return { probability: mean === 0 ? 0.5 : sigmoid(mean), logit: mean, bagLogitSpread: sd, bags: ls.length, bagAgreement: sign === 0 ? null : ls.filter((v) => Math.sign(v) === sign).length / ls.length };
}

/** Evaluate additive trees once per action, preserving missing-input abstention. */
export function additiveMenuScores(p, descriptors, ctx) {
  if (p.family !== FAMILIES.ADDITIVE) throw new ModelRejection('ADDITIVE_MODEL_REQUIRED');
  const L = layoutOf(p), ok = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === 'number' && Number.isFinite(v));
  return descriptors.map((phi) => ok(phi, L.d) && ok(ctx, L.k) ? p.bags.map((bag) => bagValue(bag, [...phi, ...ctx])) : null);
}

/** Capacity record used by the matched-ablation contract. */
export function capacityOf(p) {
  let nodes = 0, leaves = 0, depth = 0, trees = 0; for (const bag of p.bags) { trees = Math.max(trees, bag.trees.length); for (const t of bag.trees) { nodes += t.f.length; leaves += t.f.filter((f) => f < 0).length; depth = Math.max(depth, depthOf(t)); } }
  return { family: p.family, bags: p.bags.length, treesPerBag: trees, maxDepth: depth, totalNodes: nodes, totalLeaves: leaves, inputWidth: layoutOf(p).width };
}
/**
 * Does a parameter set of the pair family actually USE a cross-action interaction? True when some root-to-leaf path
 * splits on an input of phi_a AND on an input of phi_b (crossActionPath: the non-vacuity rule of the matched-ablation
 * contract for arm M3a), or splits on a pair-relation input (relationSplit). A pair-family parameter set with neither
 * is an additive scorer in disguise, and a comparison built on it would be vacuous.
 */
export function hasCrossActionInteraction(p) {
  if (p.family !== FAMILIES.PAIR) return { value: false, crossActionPath: false, relationSplit: false, crossActionPaths: 0, relationSplits: 0, reason: 'ADDITIVE_FAMILY' };
  const L = layoutOf(p), inR = (i, [lo, hi]) => i >= lo && i < hi; let cross = 0, rel = 0;
  for (const bag of p.bags) for (const t of bag.trees) { const walk = (n, a, b) => { if (t.f[n] < 0) { if (a && b) cross++; return; } const f = t.f[n], a2 = a || inR(f, L.phiA), b2 = b || inR(f, L.phiB); if (inR(f, L.rho)) rel++; walk(t.l[n], a2, b2); walk(t.r[n], a2, b2); }; walk(0, false, false); }
  return { value: cross > 0 || rel > 0, crossActionPath: cross > 0, relationSplit: rel > 0, crossActionPaths: cross, relationSplits: rel };
}
