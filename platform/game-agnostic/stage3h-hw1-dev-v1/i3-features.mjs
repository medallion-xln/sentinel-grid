// H-W1 I-3 public-only per-action features. Every feature is a function of the I-1 public projection alone (projectPublic), and each one is invariant to entity relabelling, menu order and
// the lawful D4 frame: only counts, flags, categorical one-hots, manhattan/chebyshev magnitudes and displacement-gradient differences are used (all integers). No entity id, action handle,
// menu position, absolute coordinate, direction name, digest, hidden quantity, evaluator output or comparator output enters. Vocabularies come from the engine's declared constants.
//   actionFeatures(P)  -> { names, rows }  rows[i] is the numeric vector of menu action i, in the fixed order of `names`
//   FEATURE_SETS       -> { BASE, FULL } index lists into `names` (FULL adds type x context interactions)
import { FORGE_ACTION_TYPE_NAMES, FORGE_ENTITY_TYPE_NAMES } from '../src/forge/contract.js';

export const FEATURE_VERSION = 'HW1_PUBLIC_FEATURES_V1';
const TYPES = FORGE_ACTION_TYPE_NAMES, KINDS = FORGE_ENTITY_TYPE_NAMES, FLAGS = ['hostile', 'critical', 'resource', 'objective', 'inService', 'threatened', 'hub'];
const RELS = ['depends/FROM', 'depends/TO', 'supports/FROM', 'supports/TO', 'threatens/FROM', 'threatens/TO'];
const CLASSES = { hostile: (n) => n.flags.hostile, objective: (n) => n.flags.objective, outOfService: (n) => !n.flags.inService && !n.flags.hostile, resource: (n) => n.flags.resource, hub: (n) => n.flags.hub, threatened: (n) => n.flags.threatened };
const CONTEXT = ['energy', 'ticksRemaining', 'nHostile', 'nOutOfService', 'objGap'];
const fin = (x) => (Number.isFinite(x) ? x : 0), man = (r) => Math.abs(r.dx) + Math.abs(r.dy), cheb = (r) => Math.max(Math.abs(r.dx), Math.abs(r.dy));
const gap = (n) => n.obj.reduce((a, [req, del]) => a + Math.max(0, req - del), 0);

export const NAMES = [
  ...TYPES.map((t) => `type.${t}`),
  'cost', 'energyDelta', 'energyAfter', 'nPre', 'nEff', 'nUncertain', 'dispManhattan', 'dispChebyshev', 'destHazard', 'retreatManhattan', 'hasTarget', 'hasDependent',
  ...Object.keys(CLASSES).map((c) => `gradient.${c}`),
  ...KINDS.map((k) => `target.kind.${k}`), ...FLAGS.map((f) => `target.${f}`), 'target.manhattan', 'target.path', 'target.pathUnknown', 'target.chebyshev', ...RELS.map((r) => `target.rel.${r}`), 'target.objGap', 'target.hasObjective',
  ...FLAGS.map((f) => `dependent.${f}`), 'dependent.manhattan', 'dependent.path',
  ...TYPES.flatMap((t) => CONTEXT.map((c) => `type.${t}*${c}`)),
];
const nBase = NAMES.indexOf(`type.${TYPES[0]}*${CONTEXT[0]}`);
export const FEATURE_SETS = Object.freeze({ BASE: Object.freeze([...Array(nBase).keys()]), FULL: Object.freeze([...NAMES.keys()]) });

function context(P) {
  const hostile = P.nodes.filter((n) => n.flags.hostile).length, out = P.nodes.filter(CLASSES.outOfService).length, objGap = P.nodes.reduce((a, n) => a + gap(n), 0);
  return { energy: P.actor.energy, ticksRemaining: P.actor.ticksRemaining, nHostile: hostile, nOutOfService: out, objGap };
}
const nearest = (P, pred, from) => { let best = null; for (const n of P.nodes) if (pred(n)) { const d = Math.abs(n.rel.dx - from.dx) + Math.abs(n.rel.dy - from.dy); if (best === null || d < best) best = d; } return best; };
const rels = (n) => RELS.map((r) => n.rels.filter((x) => `${x.kind}/${x.role}` === r).length);

export function actionFeatures(P) {
  const ctx = context(P), here = { dx: 0, dy: 0 };
  const rows = P.menu.map((a) => {
    const t = a.target == null ? null : P.nodes[a.target], d = a.dependent == null ? null : P.nodes[a.dependent], step = a.disp ?? a.toRel ?? null, type = TYPES.map((x) => Number(x === a.type));
    const grad = Object.values(CLASSES).map((pred) => { if (!step) return 0; const before = nearest(P, pred, here), after = nearest(P, pred, step); return before === null || after === null ? 0 : after - before; });
    const act = [a.cost, a.energyAfter == null ? 0 : a.energyAfter - P.actor.energy, a.energyAfter ?? 0, a.pre.length, a.eff.length, a.eff.filter((e) => e.endsWith(':EU')).length,
      a.disp ? man(a.disp) : 0, a.disp ? cheb(a.disp) : 0, Number(a.destTerrain === 'ENVIRONMENTAL_HAZARD'), a.toRel ? man(a.toRel) : 0, Number(t !== null), Number(d !== null)].map(fin);
    const tgt = t ? [...KINDS.map((k) => Number(k === t.kind)), ...FLAGS.map((f) => Number(t.flags[f])), t.dist.manhattan, fin(t.dist.path), Number(!Number.isFinite(t.dist.path)), cheb(t.rel), ...rels(t), gap(t), Number(t.obj.length > 0)] : Array(KINDS.length + FLAGS.length + 4 + RELS.length + 2).fill(0);
    const dep = d ? [...FLAGS.map((f) => Number(d.flags[f])), d.dist.manhattan, fin(d.dist.path)] : Array(FLAGS.length + 2).fill(0);
    const inter = type.flatMap((x) => CONTEXT.map((c) => x * ctx[c]));
    return [...type, ...act, ...grad, ...tgt.map(fin), ...dep.map(fin), ...inter];
  });
  if (rows.some((r) => r.length !== NAMES.length)) throw Error('FEATURE_WIDTH_MISMATCH');
  return { names: NAMES, rows };
}
