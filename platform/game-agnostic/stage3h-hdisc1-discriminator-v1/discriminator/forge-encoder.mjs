// SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1 — Component A for Forge World: HDISC_FORGE_ENCODER_V1.
//
// Public information only: the identity-free public projection (HW1_PUBLIC_PROJECTION_V1), the complete lawful menu
// and canonical advisory evidence (SK1_ADVISORY_EVIDENCE_V1). Nothing else is read.
//
// Four blocks of inputs, so that each arm of the matched ablation ladder is a declared subset:
//   SK1 per-action / SK1 context   exactly the frozen SK1 feature set, computed by a derived, behaviour-identical copy of the
//                                  frozen SK1 featuriser (forge-base/, see its provenance), split into what varies by action and what is shared by the menu
//   geometry                       where a move ENDS and where a TARGET sits relative to every public entity class.
//                                  The SK1 set summarises a target by kind, flags and its distance from the actor, so
//                                  two targets of one kind at one distance are indistinguishable; these inputs separate them
//   contrast                       each action against its own menu and against S0's public top choice
//   relation (ordered pairs)       what holds between TWO actions: same type, same target, how their steps and their
//                                  destinations relate, and signed differences
// Every input is invariant to entity relabelling, menu order and the D4 frame: counts, flags, L1 distances, dot
// products, absolute cross products and within-menu statistics computed with order-independent sums.
//
// Stricter than the frozen SK1 adapter, by design (SK1.1 findings F3 and F4): an action type or entity kind outside
// the vocabulary, or a missing public field, makes the affected actions UNSUPPORTED. Nothing is imputed, and no
// lawful action is removed from the menu.
import { makeForgeFeaturizer, FORGE_OBSERVATION_CONTRACT, ACTION_TYPES, ENTITY_KINDS } from './forge-base/features.mjs';
import { EncoderRejection, stableMean, stableSum } from './encoder.mjs';
import { sha256 } from './canonical.mjs';

export const ENCODER_ID = 'HDISC_FORGE_ENCODER_V1';
export { FORGE_OBSERVATION_CONTRACT };
// The Nexus rationale vocabulary recorded for SK1. PROVISIONAL: a campaign re-derives it from fresh exploration data
// and freezes it; it is an input of the encoder identity, not a learned parameter.
export const PROVISIONAL_VOCABULARY = Object.freeze({ nexusCodes: Object.freeze(['NEXUS_BOTTLENECK', 'NEXUS_CRITICAL_DEPENDENCY', 'NEXUS_CYCLE_DETECTED', 'NEXUS_ISOLATED_ENTITY', 'NEXUS_UNCOVERED_THREAT', 'NEXUS_UNSUPPORTED_THREAT']), nexusReasons: Object.freeze(['STRUCTURE_DRIVEN_PREFERENCE', 'THREAT_DRIVEN_PREFERENCE']) });

const FLAGS = ['hostile', 'critical', 'resource', 'objective', 'inService', 'threatened', 'hub'], ACTION_FIELDS = ['type', 'params', 'target', 'dependent', 'disp', 'toRel', 'cost', 'pre', 'eff', 'energyAfter', 'destTerrain'];
const CLASSES = { hostile: (n) => n.flags.hostile, objective: (n) => n.flags.objective, outOfService: (n) => !n.flags.inService && !n.flags.hostile, resource: (n) => n.flags.resource, hub: (n) => n.flags.hub, threatened: (n) => n.flags.threatened }, CLASS_NAMES = Object.keys(CLASSES);
const fin = (v) => typeof v === 'number' && Number.isFinite(v), vec = (v) => v && fin(v.dx) && fin(v.dy), l1 = (a, b) => Math.abs(a.dx - b.dx) + Math.abs(a.dy - b.dy);
// SK1 features that are identical for every action of a menu (the shared context); everything else varies by action.
const isContext = (name) => name.startsWith('ctx.') || /^ev\.(s0\.(topSize|spread)|nexus\.(abstain|nCodes|rec\.|code\.|reason\.)|expertsAgreeOnType$)/.test(name);
// per-action quantities that are contrasted against the menu and against S0's top choice
const CONTRAST_BASE = ['act.cost', 'act.energyAfter', 'act.dispManhattan', 'act.retreatManhattan', 'act.destHazard', 'act.nUncertainEffects', 'gradient.hostile', 'gradient.objective', 'gradient.outOfService', 'gradient.resource', 'gradient.hub', 'gradient.threatened', 'after.nearestHostile', 'target.manhattan', 'target.path', 'target.objGap', 'ev.s0.z'];
const GEOMETRY = [...CLASS_NAMES.map((c) => `geo.dest.nearest.${c}`), ...CLASS_NAMES.map((c) => `geo.dest.sum.${c}`), 'geo.hasStep', ...CLASS_NAMES.map((c) => `geo.target.nearest.${c}`), ...CLASS_NAMES.map((c) => `geo.target.sum.${c}`), 'geo.target.relations', 'geo.target.sameKindOthers'];
const CONTRAST = [...CONTRAST_BASE.flatMap((f) => [`rel.menu.${f}.minusMean`, `rel.menu.${f}.rankFrac`, `rel.s0top.${f}.diff`]), 'rel.menu.typeShare'];
const RELATION = ['pair.sameType', 'pair.bothStep', 'pair.stepDot', 'pair.stepCrossAbs', 'pair.destManhattan', 'pair.bothTarget', 'pair.sameTarget', 'pair.sameTargetKind', 'pair.targetManhattan',
  'pair.diff.cost', 'pair.diff.energyAfter', 'pair.diff.s0Score', ...CLASS_NAMES.map((c) => `pair.diff.dest.nearest.${c}`), 'pair.diff.targetManhattan', 'pair.s0.aInTopOnly', 'pair.s0.bInTopOnly'];

/** Public-state validation. Returns global issues (affecting every action) and per-action issues. Nothing is repaired. */
function validate(state, legalActions) {
  const P = state.projection, g = [], per = legalActions.map(() => []), num = (v, what) => { if (!fin(v)) g.push(`MISSING_PUBLIC_FIELD:${what}`); };
  if (P.version !== FORGE_OBSERVATION_CONTRACT.version) g.push(`PROJECTION_VERSION_MISMATCH:${String(P.version)}`);
  num(P.tick, 'tick'); num(P.grid?.width, 'grid.width'); num(P.grid?.height, 'grid.height');
  for (const f of ['energy', 'health', 'carried', 'ticksRemaining', 'borderDistance']) num(P.actor?.[f], `actor.${f}`); if (typeof P.actor?.terrain !== 'string') g.push('MISSING_PUBLIC_FIELD:actor.terrain');
  if (!fin(P.history?.n) || !Array.isArray(P.history?.channels) || P.history.channels.some((c) => !Array.isArray(c) || typeof c[0] !== 'string' || !c.slice(1).every(fin))) g.push('MISSING_PUBLIC_FIELD:history');
  if (!P.terrainCounts || typeof P.terrainCounts !== 'object' || Object.values(P.terrainCounts).some((v) => !fin(v))) g.push('MISSING_PUBLIC_FIELD:terrainCounts');
  P.nodes.forEach((n, i) => { if (!ENTITY_KINDS.includes(n?.kind)) g.push(`ENTITY_KIND_OUTSIDE_VOCABULARY:${String(n?.kind)}`);
    if (!vec(n?.rel) || !fin(n?.dist?.manhattan) || !(n.dist.path === null || fin(n.dist.path)) || !n.flags || FLAGS.some((f) => typeof n.flags[f] !== 'boolean') || !Array.isArray(n.rels) || !Array.isArray(n.obj) || n.obj.some((o) => !Array.isArray(o) || !o.every(fin))) g.push(`MISSING_PUBLIC_FIELD:nodes[${i}]`); });
  legalActions.forEach((a, i) => { const bad = (c) => per[i].push(c);
    for (const f of ACTION_FIELDS) if (!Object.prototype.hasOwnProperty.call(a, f)) bad(`MISSING_PUBLIC_FIELD:action.${f}`);
    if (!ACTION_TYPES.includes(a.type)) bad(`ACTION_TYPE_OUTSIDE_VOCABULARY:${String(a.type)}`); if (!fin(a.cost)) bad('MISSING_PUBLIC_FIELD:action.cost');
    if (!Array.isArray(a.pre) || !Array.isArray(a.eff) || [...(a.pre ?? []), ...(a.eff ?? [])].some((s) => typeof s !== 'string')) bad('MISSING_PUBLIC_FIELD:action.semantics');
    for (const f of ['target', 'dependent']) if (!(a[f] === null || (Number.isInteger(a[f]) && a[f] >= 0 && a[f] < P.nodes.length))) bad(`ACTION_REFERENCE_INVALID:${f}`);
    for (const f of ['disp', 'toRel']) if (!(a[f] === null || vec(a[f]))) bad(`MISSING_PUBLIC_FIELD:action.${f}`);
    if (!(a.energyAfter === null || fin(a.energyAfter))) bad('MISSING_PUBLIC_FIELD:action.energyAfter'); if (!(a.destTerrain === null || typeof a.destTerrain === 'string')) bad('MISSING_PUBLIC_FIELD:action.destTerrain'); });
  return { global: [...new Set(g)], per };
}

/** config: { nexusCodes, nexusReasons } — the frozen evidence vocabulary. */
export function makeForgeEncoder(config = PROVISIONAL_VOCABULARY) {
  const base = makeForgeFeaturizer({ useEvidence: true, nexusCodes: config.nexusCodes, nexusReasons: config.nexusReasons }), names = base.schema.names, col = (nm) => { const i = names.indexOf(nm); if (i < 0) throw new EncoderRejection('BASE_FEATURE_MISSING', nm); return i; };
  const ctxIdx = names.map((nm, i) => (isContext(nm) ? i : -1)).filter((i) => i >= 0), actIdx = names.map((nm, i) => (isContext(nm) ? -1 : i)).filter((i) => i >= 0), cb = CONTRAST_BASE.map(col);
  const sk1Descriptor = actIdx.map((i) => names[i]), sk1Context = ctxIdx.map((i) => names[i]);
  const allDescriptor = [...sk1Descriptor, ...GEOMETRY, ...CONTRAST];
  const schema = Object.freeze({ id: `${ENCODER_ID}:${sha256(['descriptor', ...allDescriptor, 'relation', ...RELATION, 'context', ...sk1Context].join('\n')).slice(0, 16)}`, baseFeatureSchema: base.schema.id, descriptor: Object.freeze(allDescriptor), relation: Object.freeze([...RELATION]), context: Object.freeze([...sk1Context]) });
  // the input sets of the ablation ladder, as declared subsets of this encoder's schema
  const featureSets = Object.freeze({ M0: { descriptor: sk1Descriptor, relation: [], context: sk1Context }, M1: { descriptor: sk1Descriptor, relation: [], context: sk1Context },
    M2: { descriptor: [...schema.descriptor], relation: [], context: sk1Context }, M3a: { descriptor: [...schema.descriptor], relation: [], context: sk1Context }, M3: { descriptor: [...schema.descriptor], relation: [...RELATION], context: sk1Context } });

  function encode(state, legalActions, evidence) {
    const P0 = state?.projection; if (!state || state.observationContract?.id !== FORGE_OBSERVATION_CONTRACT.id || !P0 || typeof P0 !== 'object' || !Array.isArray(P0.nodes) || !P0.actor) throw new EncoderRejection('NOT_A_FORGE_PUBLIC_PROJECTION');
    if (state.observationContract.version !== FORGE_OBSERVATION_CONTRACT.version) throw new EncoderRejection('OBSERVATION_CONTRACT_MISMATCH', String(state.observationContract.version));
    const n = legalActions.length, issues = validate(state, legalActions); let F;
    try { F = base(state, legalActions, evidence ?? null); } catch (e) { throw new EncoderRejection('PUBLIC_STATE_NOT_ENCODABLE', String(e?.code ?? e?.message).slice(0, 80)); }
    if (F.evidence.status !== 'VALID') issues.global.push(`ADVISORY_EVIDENCE_NOT_VALID:${F.evidence.status}`);
    const nodes = P0.nodes, here = { dx: 0, dy: 0 }, nearest = (pred, from, skip = -1) => { let best = -1; nodes.forEach((x, q) => { if (q !== skip && vec(x.rel) && x.flags && pred(x)) { const d = l1(x.rel, from); if (best < 0 || d < best) best = d; } }); return best; };
    const step = legalActions.map((a) => (vec(a.disp) ? a.disp : vec(a.toRel) ? a.toRel : null)), dest = step.map((s) => s ?? here), tgt = legalActions.map((a) => (Number.isInteger(a.target) && nodes[a.target] ? nodes[a.target] : null));
    const total = (pred, from, skip = -1) => { const ds = []; nodes.forEach((x, q) => { if (q !== skip && vec(x.rel) && x.flags && pred(x)) ds.push(l1(x.rel, from)); }); return stableSum(ds); };
    const destNear = legalActions.map((_, i) => CLASS_NAMES.map((c) => nearest(CLASSES[c], dest[i])));
    const geometry = legalActions.map((a, i) => [...destNear[i], ...CLASS_NAMES.map((c) => total(CLASSES[c], dest[i])), Number(step[i] !== null), ...CLASS_NAMES.map((c) => (tgt[i] && vec(tgt[i].rel) ? nearest(CLASSES[c], tgt[i].rel, a.target) : 0)), ...CLASS_NAMES.map((c) => (tgt[i] && vec(tgt[i].rel) ? total(CLASSES[c], tgt[i].rel, a.target) : 0)), tgt[i] ? tgt[i].rels?.length ?? null : 0, tgt[i] ? nodes.filter((x, q) => q !== a.target && x.kind === tgt[i].kind).length : 0]);
    // contrasts against the menu and against S0's public top set (order-independent arithmetic)
    const s0 = evidence?.experts?.S0, top = Array.isArray(s0?.topSet) ? s0.topSet.filter((q) => Number.isInteger(q) && q >= 0 && q < n) : [], colVals = cb.map((j) => F.rows.map((row) => row[j]));
    const contrast = legalActions.map((a, i) => [...cb.flatMap((_, q) => { const v = colVals[q], x = v[i]; if (!fin(x) || !v.every(fin) || !top.length) return [null, null, null]; return [x - stableMean(v), n > 1 ? v.filter((y) => y < x).length / (n - 1) : 0, x - stableMean(top.map((t) => v[t]))]; }), legalActions.filter((b) => b.type === a.type).length / n]);
    const descriptors = F.rows.map((row, i) => [...actIdx.map((j) => row[j]), ...geometry[i], ...contrast[i]]), context = F.rows.length ? ctxIdx.map((j) => F.rows[0][j]) : [];
    const supported = legalActions.map((_, i) => !issues.global.length && !issues.per[i].length && descriptors[i].every(fin) && context.every(fin));
    const unsupportedReasons = legalActions.map((_, i) => (supported[i] ? [] : [...issues.global, ...issues.per[i], ...(!issues.global.length && !issues.per[i].length ? ['MISSING_PUBLIC_DESCRIPTOR'] : [])]));
    const excluded = F.constraints.map((cs) => cs.some((c) => c.hard === true && c.status === 'VIOLATED' && c.basis === 'PUBLIC_DETERMINISTIC'));
    const score = Array.isArray(s0?.scores) ? s0.scores : [], inTop = new Set(top);
    const relation = (i, j) => { const a = legalActions[i], b = legalActions[j], si = step[i], sj = step[j], both = si !== null && sj !== null, bt = tgt[i] !== null && tgt[j] !== null;
      const r = [Number(a.type === b.type), Number(both), both ? si.dx * sj.dx + si.dy * sj.dy + 0 : 0, both ? Math.abs(si.dx * sj.dy - si.dy * sj.dx) : 0, l1(dest[i], dest[j]), Number(bt), Number(bt && a.target === b.target), Number(bt && tgt[i].kind === tgt[j].kind), bt && vec(tgt[i].rel) && vec(tgt[j].rel) ? l1(tgt[i].rel, tgt[j].rel) : 0,
        a.cost - b.cost, (a.energyAfter ?? 0) - (b.energyAfter ?? 0), fin(score[i]) && fin(score[j]) ? score[i] - score[j] : null, ...CLASS_NAMES.map((_, q) => destNear[i][q] - destNear[j][q]), bt ? tgt[i].dist.manhattan - tgt[j].dist.manhattan : 0, Number(inTop.has(i) && !inTop.has(j)), Number(inTop.has(j) && !inTop.has(i))];
      return r.every(fin) ? r.map((v) => v + 0) : null; };
    return { schema, keys: F.keys, signatures: F.signatures, types: legalActions.map((a) => String(a.type)), excluded, supported, unsupportedReasons, descriptors, context, constraints: F.constraints, annotations: F.annotations, relation, evidence: F.evidence, n };
  }
  return Object.assign(encode, { schema, featureSets, encoderId: ENCODER_ID, observationContract: FORGE_OBSERVATION_CONTRACT, evidenceContract: base.evidenceContract, config: { nexusCodes: [...config.nexusCodes], nexusReasons: [...config.nexusReasons] }, synthetic: false });
}
