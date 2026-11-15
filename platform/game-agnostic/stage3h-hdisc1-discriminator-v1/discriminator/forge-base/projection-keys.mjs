// H-DISC-1 inference-side Forge projection functions. DERIVED FILE — do not edit by hand; regenerate with audit/derive-forge-base.mjs.
// Source: stage3h-sk1-safety-kernel-v1/adapters/forge/projection.mjs (frozen, unmodified). Every line below is byte-identical to that
// file. Two blocks were REMOVED: the native-view extractor projectPublic(view) with its field tables, and the view read tracer. What
// remains takes a PUBLIC PROJECTION as input: action keys, Weisfeiler-Leman colours, symmetry and the canonical frame.
// Provenance: evidence/HDISC1_FORGE_BASE_PROVENANCE.json. The only import is node:crypto.
import { createHash } from 'node:crypto';
// ---- embedded orientation tables (literal copies of src/forge-symmetric/orientation-symmetric-v1.js; asserted equal by tests/projection.test.mjs)
const ORIENTATIONS = Object.freeze(["R0","R90","R180","R270","MX","MY","MD","MA"]);
const DIRECTION_DELTAS = Object.freeze({"NORTH":[0,-1],"EAST":[1,0],"SOUTH":[0,1],"WEST":[-1,0]});
const ORIENT_TABLE = Object.freeze({"R0":{"NORTH":"NORTH","EAST":"EAST","SOUTH":"SOUTH","WEST":"WEST"},"R90":{"NORTH":"EAST","EAST":"SOUTH","SOUTH":"WEST","WEST":"NORTH"},"R180":{"NORTH":"SOUTH","EAST":"WEST","SOUTH":"NORTH","WEST":"EAST"},"R270":{"NORTH":"WEST","EAST":"NORTH","SOUTH":"EAST","WEST":"SOUTH"},"MX":{"NORTH":"NORTH","EAST":"WEST","SOUTH":"SOUTH","WEST":"EAST"},"MY":{"NORTH":"SOUTH","EAST":"EAST","SOUTH":"NORTH","WEST":"WEST"},"MD":{"NORTH":"WEST","EAST":"SOUTH","SOUTH":"EAST","WEST":"NORTH"},"MA":{"NORTH":"EAST","EAST":"NORTH","SOUTH":"WEST","WEST":"SOUTH"}});
const orientDirection = (t, d) => { const m = ORIENT_TABLE[t]; if (!m || !(d in m)) throw Error('UNKNOWN_ORIENTATION_OR_DIRECTION'); return m[d]; };
const D4_ELEMENTS = ORIENTATIONS;
export const D4_FRAMES = ORIENTATIONS;

export const PROJECTION_VERSION = 'HW1_PUBLIC_PROJECTION_V1';
export const KEY_VERSION = 'HW1_ACTION_KEY_V2';
const H = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const J = JSON.stringify;


// ------------------------------------------------------------------------------------------------------------------ D4 linear maps
const dv = (name) => DIRECTION_DELTAS[name];
/** Linear part of each D4 element on a displacement, derived from orientDirection (East and South images give the matrix columns). */
export const D4_LINEAR = Object.fromEntries(D4_ELEMENTS.map((t) => { const ex = dv(orientDirection(t, 'EAST')), ey = dv(orientDirection(t, 'SOUTH')); return [t, (x, y) => [ex[0] * x + ey[0] * y, ex[1] * x + ey[1] * y]]; }));

// ------------------------------------------------------------------------------------------------------------------ projection
const FLAG_NAMES = ['hostile', 'critical', 'resource', 'objective', 'inService', 'threatened', 'hub'];

/** The projection seen through D4 element t: every relative quantity is mapped, distances/flags/relations are invariant. */
export function frameProjection(P, t) {
  const M = D4_LINEAR[t], rel = (r) => { if (!r) return r; const [dx, dy] = M(r.dx, r.dy); return { dx: dx + 0, dy: dy + 0 }; };
  return { ...P, frame: t,
    nodes: P.nodes.map((n) => { const [sx, sy] = M(n.dir.sx, n.dir.sy); return { ...n, rel: rel(n.rel), dir: { sx: sx + 0, sy: sy + 0 } }; }),
    menu: P.menu.map((a) => ({ ...a, params: a.params.direction !== undefined ? { ...a.params, direction: orientDirection(t, a.params.direction) } : a.params, disp: rel(a.disp), toRel: rel(a.toRel) })) };
}

// ------------------------------------------------------------------------------------------------------------------ keys
const flags6 = (n) => [n.flags.critical, n.flags.objective, n.flags.hostile, n.flags.threatened, n.flags.inService, n.flags.hub];
const relKinds = (n) => n.rels.map((r) => [r.kind, r.role]).sort();
/** keyV1: identical bytes to stage3h-wider-action-feasibility-v1/intersect.mjs semanticKey (checked by the I-1 audit). */
export function keyV1(P, i) {
  const a = P.menu[i], t = a.target == null ? null : P.nodes[a.target];
  return J({ type: a.type, displacement: a.disp, target: t ? { kind: t.kind, rel: t.rel, flags: flags6(t), relationships: relKinds(t) } : null, params: Object.keys(a.params).length ? a.params : null });
}
const dependentBlock = (n) => ({ kind: n.kind, rel: n.rel, dist: n.dist, dir: n.dir, flags: [...flags6(n), n.flags.resource], relationships: relKinds(n) });
/** keyV2: keyV1 plus the dependent entity's public attribute block (resourceFlag included) plus the actor-relative RETREAT destination. */
export function keyV2(P, i) { const a = P.menu[i], d = a.dependent == null ? null : P.nodes[a.dependent]; return J([keyV1(P, i), d ? dependentBlock(d) : null, a.toRel]); }
export const keysV2 = (P) => P.menu.map((_, i) => keyV2(P, i));

// ------------------------------------------------------------------------------------------------------------------ WL colours
const nodeAttr = (n) => [n.kind, FLAG_NAMES.map((f) => n.flags[f]), n.rel, n.dist, n.dir, n.obj];
const cmpJ = (a, b) => { const x = J(a), y = J(b); return x < y ? -1 : x > y ? 1 : 0; };
/** Weisfeiler-Leman colours (fixed number of rounds so that two graphs are comparable). `tags` individualise nodes for the isomorphism search. */
export function refine(P, tags = null) {
  const n = P.nodes.length, out = P.nodes.map(() => []), inc = P.nodes.map(() => []);
  P.nodes.forEach((x, i) => x.rels.forEach((r) => { out[i].push([r.kind, r.role, r.to]); inc[r.to].push([r.kind, r.role, i]); }));
  let col = P.nodes.map((x, i) => H(J([nodeAttr(x), tags ? tags[i] : 0])));
  for (let k = 0; k < Math.max(2, n); k++) col = col.map((c, i) => H(J([c, out[i].map(([a, b, t]) => [a, b, col[t]]).sort(cmpJ), inc[i].map(([a, b, f]) => [a, b, col[f]]).sort(cmpJ)])));
  return col;
}
/** Colour-based action signature (identity-free; frame-dependent through rel/disp/direction). */
export const actionSig = (P, col, i) => { const a = P.menu[i]; return J([a.type, a.params, a.cost, a.pre, a.eff, a.energyAfter, a.destTerrain, a.disp, a.toRel, a.target == null ? null : col[a.target], a.dependent == null ? null : col[a.dependent]]); };
const sigRef = (a, phi) => J([a.type, a.params, a.cost, a.pre, a.eff, a.energyAfter, a.destTerrain, a.disp, a.toRel, a.target == null ? null : phi ? phi[a.target] : a.target, a.dependent == null ? null : phi ? phi[a.dependent] : a.dependent]);
const globals = (P) => [P.tick, P.grid, P.actor, P.history, P.terrainCounts];
/** Identity-free digest of the framed projection: globals + sorted node colours + sorted action signatures. */
export function structureDigest(P, t) { const Pt = frameProjection(P, t), col = refine(Pt); return H(J([globals(Pt), [...col].sort(), Pt.menu.map((_, i) => actionSig(Pt, col, i)).sort()])); }

// ------------------------------------------------------------------------------------------------------------------ exact isomorphism / symmetry
function verifyIso(A, B, phi) {
  if (new Set(phi).size !== phi.length || phi.some((v) => v === undefined)) return null;
  for (let u = 0; u < A.nodes.length; u++) {
    const a = A.nodes[u], b = B.nodes[phi[u]];
    if (J(nodeAttr(a)) !== J(nodeAttr(b)) || J(a.rels.map((r) => [r.kind, r.role, phi[r.to]]).sort(cmpJ)) !== J(b.rels.map((r) => [r.kind, r.role, r.to]).sort(cmpJ))) return null;
  }
  const sigB = new Map(B.menu.map((a, j) => [sigRef(a, null), j])), amap = A.menu.map((a) => sigB.get(sigRef(a, phi)));
  if (amap.some((j) => j === undefined) || new Set(amap).size !== amap.length || J(globals(A)) !== J(globals(B))) return null;
  return { phi, actionMap: amap };
}
function search(A, B, tA, tB, depth) {
  const cA = refine(A, tA), cB = refine(B, tB);
  if (J([...cA].sort()) !== J([...cB].sort())) return null;
  const classes = new Map(); cA.forEach((c, i) => (classes.get(c) ?? classes.set(c, []).get(c)).push(i));
  const open = [...classes.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).find(([, m]) => m.length > 1);
  if (!open) { const at = new Map(cB.map((c, i) => [c, i])); return verifyIso(A, B, cA.map((c) => at.get(c))); }
  const [col, mem] = open;
  for (let v = 0; v < cB.length; v++) { if (cB[v] !== col) continue; const a = tA.slice(), b = tB.slice(); a[mem[0]] = 1000 + depth; b[v] = 1000 + depth; const r = search(A, B, a, b, depth + 1); if (r) return r; }
  return null;
}
/** An isomorphism A -> B of the identity-free structures (nodes, relations, menu), with optional forced node pairs; null if none exists. */
export function isomorphism(A, B, forced = []) {
  if (A.nodes.length !== B.nodes.length || A.menu.length !== B.menu.length) return null;
  const tA = Array(A.nodes.length).fill(0), tB = Array(B.nodes.length).fill(0);
  forced.forEach(([u, v], k) => { tA[u] = k + 1; tB[v] = k + 1; });
  return search(A, B, tA, tB, 0);
}

/**
 * Exact symmetry of the view: D4 stabiliser, node-colour discreteness, action orbits under the full group {(t, phi)}, and the actions fixed by every
 * group element. An equivariant policy must choose a fixed action (always non-empty when WAIT is legal: WAIT has no target and no parameters).
 */
export function symmetryReport(P) {
  const P0 = frameProjection(P, 'R0'), col0 = refine(P0), digests = Object.fromEntries(D4_ELEMENTS.map((t) => [t, structureDigest(P0, t)]));
  const stabiliser = D4_ELEMENTS.filter((t) => digests[t] === digests.R0), n = P0.menu.length, parent = [...Array(n).keys()];
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x]))), union = (a, b) => { parent[find(a)] = find(b); };
  const discrete = new Set(col0).size === col0.length;
  let isoFound = 0, isoFailed = 0;
  if (!(discrete && stabiliser.length === 1)) {
    const sig0 = P0.menu.map((_, j) => actionSig(P0, col0, j));
    for (const t of stabiliser) {
      const Pt = frameProjection(P, t), colT = refine(Pt);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if ((t === 'R0' && i === j) || actionSig(Pt, colT, i) !== sig0[j]) continue;
        const a = Pt.menu[i], b = P0.menu[j], forced = [];
        if (a.target != null) forced.push([a.target, b.target]); if (a.dependent != null) forced.push([a.dependent, b.dependent]);
        const r = isomorphism(Pt, P0, forced);
        if (r && r.actionMap[i] === j) { union(i, j); isoFound++; } else isoFailed++;
      }
    }
  }
  const orbit = P0.menu.map((_, i) => find(i)), size = new Map(); orbit.forEach((o) => size.set(o, (size.get(o) ?? 0) + 1));
  const fixed = P0.menu.map((_, i) => i).filter((i) => size.get(orbit[i]) === 1);
  return { digests, stabiliser, nodeColoursDiscrete: discrete, nodeColourClasses: new Set(col0).size, nodes: col0.length, orbitSizes: [...size.values()].sort((a, b) => b - a), nontrivialOrbits: [...size.values()].filter((s) => s > 1).length,
    fixedActions: fixed, waitFixed: fixed.some((i) => P0.menu[i].type === 'WAIT'), symmetric: stabiliser.length > 1 || !discrete || [...size.values()].some((s) => s > 1), isoFound, isoFailed };
}

/** Minimal-digest D4 frames. Fixed actions have the same signature in every minimal frame, so any minimal frame orders them identically. */
export function canonicalFrame(P) {
  const digests = Object.fromEntries(D4_ELEMENTS.map((t) => [t, structureDigest(P, t)])), min = Object.values(digests).sort()[0];
  const frames = D4_ELEMENTS.filter((t) => digests[t] === min);
  return { digest: min, frames, frame: frames[0], stabiliserSize: frames.length };
}
/** Identity-free total order key of an action in the canonical frame (equal for actions of one orbit only if they are equivalent). */
export function canonicalActionKeys(P) { const c = canonicalFrame(P), Pt = frameProjection(P, c.frame), col = refine(Pt); return { canonical: c, keys: Pt.menu.map((_, i) => actionSig(Pt, col, i)) }; }

/**
 * Equivariant selection from an invariant score: restrict to actions fixed by the view's symmetry group, maximise `score(i)` (which must itself be
 * an invariant function of the projection), break exact ties by the canonical-frame action signature. Returns { index, tied, fixed }.
 */
export function selectEquivariant(P, score, sym = symmetryReport(P)) {
  const { keys } = canonicalActionKeys(P), cand = sym.fixedActions.length ? sym.fixedActions : P.menu.map((_, i) => i);
  let best = null, tied = 0;
  for (const i of cand) {
    const s = score(i);
    if (best === null || s > best.s) { best = { i, s }; tied = 1; } else if (s === best.s) { tied++; if (keys[i] < keys[best.i]) best = { i, s }; }
  }
  return { index: best.i, tied, fixedCount: cand.length, menu: P.menu.length };
}
