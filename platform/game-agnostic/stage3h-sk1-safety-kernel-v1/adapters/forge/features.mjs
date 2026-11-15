// SK1 Forge World featurizer — public information only.
// Every feature is a function of (a) the identity-free public projection, (b) the lawful action descriptor and
// (c) the canonical advisory evidence. All are invariant to entity relabelling, menu order and the D4 frame: counts,
// flags, one-hots, distance magnitudes and within-menu statistics. No id, handle, menu position, absolute coordinate,
// direction name, digest, hidden quantity or evaluator output enters. Vocabularies are embedded literals (asserted
// equal to the engine's declared constants by tests/projection.test.mjs), so this file imports nothing from the engine.
import { keysV2, canonicalActionKeys, symmetryReport, PROJECTION_VERSION } from './projection.mjs';
import { validateEvidence, EVIDENCE_CONTRACT } from './evidence.mjs';
import { KernelRejection, sha256 } from '../../kernel/contract.mjs';

export const FORGE_OBSERVATION_CONTRACT = Object.freeze({ id: 'STAGE3H_PUBLIC_DECISION_INFORMATION_V1', version: PROJECTION_VERSION });
export const ACTION_TYPES = Object.freeze(['ATTACK', 'BUILD', 'BYPASS', 'COLLECT', 'MOVE', 'PROTECT', 'REINFORCE', 'REPAIR', 'RESTORE', 'RETREAT', 'TRANSFER', 'WAIT']);
export const ENTITY_KINDS = Object.freeze(['ACTOR', 'BARRIER', 'CIVILIAN', 'CRITICAL_TARGET', 'DEPOT', 'HAZARD', 'HOSTILE', 'INFRASTRUCTURE', 'POWER_SOURCE', 'REPAIR_TARGET', 'RESOURCE', 'SUBSTITUTE']);
const FLAGS = ['hostile', 'critical', 'resource', 'objective', 'inService', 'threatened', 'hub'];
const RELS = ['depends/FROM', 'depends/TO', 'supports/FROM', 'supports/TO', 'threatens/FROM', 'threatens/TO'];
const CLASSES = { hostile: (n) => n.flags.hostile, objective: (n) => n.flags.objective, outOfService: (n) => !n.flags.inService && !n.flags.hostile, resource: (n) => n.flags.resource, hub: (n) => n.flags.hub, threatened: (n) => n.flags.threatened };
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null), bit = (x) => (x === true ? 1 : x === false ? 0 : null);
const man = (r) => (r && num(r.dx) !== null && num(r.dy) !== null ? Math.abs(r.dx) + Math.abs(r.dy) : null), cheb = (r) => (r && num(r.dx) !== null && num(r.dy) !== null ? Math.max(Math.abs(r.dx), Math.abs(r.dy)) : null);
const gap = (n) => n.obj.reduce((a, [req, del]) => a + Math.max(0, req - del), 0);
const nearest = (P, pred, from) => { let best = null; for (const n of P.nodes) if (pred(n)) { const d = Math.abs(n.rel.dx - from.dx) + Math.abs(n.rel.dy - from.dy); if (best === null || d < best) best = d; } return best; };

function names({ useEvidence, nexusCodes, nexusReasons }) {
  return [
    ...ACTION_TYPES.map((t) => `type.${t}`),
    'act.cost', 'act.energyDelta', 'act.energyAfter', 'act.nPre', 'act.nPreImplied', 'act.nEff', 'act.nUncertainEffects', 'act.dispManhattan', 'act.dispChebyshev', 'act.destHazard', 'act.retreatManhattan', 'act.hasTarget', 'act.hasDependent', 'act.sameTypeInMenu',
    ...Object.keys(CLASSES).map((c) => `gradient.${c}`), 'after.nearestHostile',
    ...ENTITY_KINDS.map((k) => `target.kind.${k}`), ...FLAGS.map((f) => `target.${f}`), 'target.manhattan', 'target.path', 'target.pathUnknown', 'target.chebyshev', ...RELS.map((r) => `target.rel.${r}`), 'target.objGap', 'target.hasObjective',
    ...FLAGS.map((f) => `dependent.${f}`), 'dependent.manhattan', 'dependent.path', 'dependent.pathUnknown',
    'ctx.energy', 'ctx.health', 'ctx.carried', 'ctx.ticksRemaining', 'ctx.borderDistance', 'ctx.tick', 'ctx.gridMax', 'ctx.gridMin', 'ctx.hazardCells', 'ctx.actorOnHazard', 'ctx.nNodes', 'ctx.nHostile', 'ctx.nOutOfService', 'ctx.nThreatened', 'ctx.nCritical', 'ctx.nObjective', 'ctx.objGap',
    'ctx.nearestHostile', 'ctx.nearestThreatened', 'ctx.menuSize', ...ACTION_TYPES.map((t) => `ctx.menu.${t}`), 'ctx.hist.present', 'ctx.hist.n', 'ctx.hist.a', 'ctx.hist.b', 'ctx.hist.c',
    ...(useEvidence ? ['ev.s0.z', 'ev.s0.rankFrac', 'ev.s0.inTop', 'ev.s0.gapToTop', 'ev.s0.topSize', 'ev.s0.spread', 'ev.s0.typeOfTop', 'ev.nexus.abstain', 'ev.nexus.typeMatch', 'ev.expertsAgreeOnType',
      ...ACTION_TYPES.map((t) => `ev.nexus.rec.${t}`), 'ev.nexus.nCodes', ...nexusCodes.map((c) => `ev.nexus.code.${c}`), 'ev.nexus.code.OTHER', ...nexusReasons.map((r) => `ev.nexus.reason.${r}`), 'ev.nexus.reason.OTHER'] : []),
  ];
}
const CATEGORICAL = /^(type\.|target\.kind\.|ev\.nexus\.rec\.|ev\.nexus\.code\.|ev\.nexus\.reason\.|ev\.nexus\.abstain$)/;

/** Build a featurizer. config.nexusCodes / nexusReasons are vocabularies frozen at training time from EXPLORATION data. */
export function makeForgeFeaturizer(config = {}) {
  const cfg = { useEvidence: config.useEvidence !== false, nexusCodes: [...(config.nexusCodes ?? [])].sort(), nexusReasons: [...(config.nexusReasons ?? [])].sort() };
  const NAMES = names(cfg), schema = Object.freeze({ id: `SK1_FORGE_FEATURES_V1:${sha256(NAMES.join('\n')).slice(0, 16)}`, names: Object.freeze(NAMES) });
  const categoricalColumns = NAMES.map((n, i) => (CATEGORICAL.test(n) ? i : -1)).filter((i) => i >= 0), nEv = cfg.useEvidence ? NAMES.filter((n) => n.startsWith('ev.')).length : 0;

  function featurize(state, legalActions, evidence) {
    const proj = state.projection;
    if (state.observationContract.id !== FORGE_OBSERVATION_CONTRACT.id || !proj || typeof proj !== 'object' || !Array.isArray(proj.nodes) || !proj.actor) throw new KernelRejection('NOT_A_FORGE_PUBLIC_PROJECTION');
    if (proj.menu !== undefined) throw new KernelRejection('STATE_MUST_NOT_CARRY_A_MENU');
    let P, keys, signatures, fixed;
    try { P = { ...proj, menu: legalActions }; keys = keysV2(P); signatures = canonicalActionKeys(P).keys; fixed = new Set(symmetryReport(P).fixedActions); }
    catch (e) { if (e instanceof KernelRejection) throw e; throw new KernelRejection('MALFORMED_PUBLIC_PROJECTION', String(e.message).slice(0, 80)); }
    const n = legalActions.length, here = { dx: 0, dy: 0 }, isHostile = (x) => x.flags.hostile === true;
    const hist = (proj.history?.channels ?? []).find((c) => c[0] === 'primary') ?? null, tc = proj.terrainCounts ?? {};
    const menuCount = Object.fromEntries(ACTION_TYPES.map((t) => [t, legalActions.filter((a) => a.type === t).length]));
    const ctx = [num(proj.actor.energy), num(proj.actor.health), num(proj.actor.carried), num(proj.actor.ticksRemaining), num(proj.actor.borderDistance), num(proj.tick),
      proj.grid ? Math.max(proj.grid.width, proj.grid.height) : null, proj.grid ? Math.min(proj.grid.width, proj.grid.height) : null, num(tc.ENVIRONMENTAL_HAZARD ?? 0), typeof proj.actor.terrain === 'string' ? Number(proj.actor.terrain === 'ENVIRONMENTAL_HAZARD') : null,
      P.nodes.length, P.nodes.filter(isHostile).length, P.nodes.filter(CLASSES.outOfService).length, P.nodes.filter((x) => x.flags.threatened).length, P.nodes.filter((x) => x.flags.critical).length, P.nodes.filter((x) => x.flags.objective).length, P.nodes.reduce((a, x) => a + gap(x), 0),
      nearest(P, isHostile, here) ?? -1, nearest(P, (x) => x.flags.threatened, here) ?? -1, n, ...ACTION_TYPES.map((t) => menuCount[t]), Number(hist !== null), num(proj.history?.n), hist ? num(hist[1]) : 0, hist ? num(hist[2]) : 0, hist ? num(hist[3]) : 0];
    // ---- advisory evidence (validated; never repaired)
    const ev = cfg.useEvidence ? validateEvidence(evidence, legalActions) : { status: evidence == null ? 'ABSENT' : 'NOT_USED_BY_THIS_MODEL', issues: [], summary: null };
    let evRows = null;
    if (cfg.useEvidence && ev.status !== 'INVALID' && ev.status !== 'ABSENT') {
      const s = evidence.experts.S0, x = evidence.experts.NEXUS, sc = s.scores, mean = sc.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(sc.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n), top = Math.max(...sc), inTop = new Set(s.topSet);
      const topTypes = new Set(s.topSet.map((i) => legalActions[i].type)), codes = new Set(x.rationaleCodes), other = x.rationaleCodes.filter((c) => !cfg.nexusCodes.includes(c)).length;
      const classLevel = [s.topSet.length, top - Math.min(...sc)], reason = x.reason ?? 'NONE';
      evRows = legalActions.map((a, i) => [sd > 0 ? (sc[i] - mean) / sd : 0, n > 1 ? sc.filter((v) => v > sc[i]).length / (n - 1) : 0, Number(inTop.has(i)), top - sc[i], ...classLevel, Number(topTypes.has(a.type)),
        Number(x.abstain), Number(!x.abstain && a.type === x.recommendedType), Number(!x.abstain && topTypes.has(x.recommendedType)), ...ACTION_TYPES.map((t) => Number(!x.abstain && x.recommendedType === t)), x.rationaleCodes.length,
        ...cfg.nexusCodes.map((c) => Number(codes.has(c))), Number(other > 0), ...cfg.nexusReasons.map((r) => Number(reason === r)), Number(!cfg.nexusReasons.includes(reason))]);
    }
    const rows = legalActions.map((a, i) => {
      const t = a.target == null ? null : P.nodes[a.target], d = a.dependent == null ? null : P.nodes[a.dependent], step = a.disp ?? a.toRel ?? null, pre = Array.isArray(a.pre) ? a.pre : null, eff = Array.isArray(a.eff) ? a.eff : null;
      const grad = Object.values(CLASSES).map((pred) => { if (!step) return 0; const before = nearest(P, pred, here), after = nearest(P, pred, step); return before === null || after === null ? 0 : after - before; });
      const act = [num(a.cost), a.energyAfter == null ? 0 : num(a.energyAfter) === null || num(proj.actor.energy) === null ? null : a.energyAfter - proj.actor.energy, a.energyAfter == null ? 0 : num(a.energyAfter), pre ? pre.length : null, pre ? pre.filter((p) => p.endsWith(':IMPLIED_BY_LEGALITY')).length : null,
        eff ? eff.length : null, eff ? eff.filter((e) => e.endsWith(':EU')).length : null, a.disp ? man(a.disp) : 0, a.disp ? cheb(a.disp) : 0, Number(a.destTerrain === 'ENVIRONMENTAL_HAZARD'), a.toRel ? man(a.toRel) : 0, Number(t !== null), Number(d !== null), menuCount[a.type] ?? 0];
      const tgt = t ? [...ENTITY_KINDS.map((k) => Number(k === t.kind)), ...FLAGS.map((f) => bit(t.flags[f])), num(t.dist.manhattan), num(t.dist.path) ?? 0, Number(num(t.dist.path) === null), cheb(t.rel), ...RELS.map((r) => t.rels.filter((q) => `${q.kind}/${q.role}` === r).length), gap(t), Number(t.obj.length > 0)]
        : Array(ENTITY_KINDS.length + FLAGS.length + 4 + RELS.length + 2).fill(0);
      const dep = d ? [...FLAGS.map((f) => bit(d.flags[f])), num(d.dist.manhattan), num(d.dist.path) ?? 0, Number(num(d.dist.path) === null)] : Array(FLAGS.length + 3).fill(0);
      const row = [...ACTION_TYPES.map((x) => Number(x === a.type)), ...act, ...grad, step ? nearest(P, isHostile, step) ?? -1 : nearest(P, isHostile, here) ?? -1, ...tgt, ...dep, ...ctx, ...(cfg.useEvidence ? evRows ? evRows[i] : Array(nEv).fill(null) : [])];
      if (row.length !== NAMES.length) throw new KernelRejection('FEATURE_WIDTH_MISMATCH', `${row.length}/${NAMES.length}`);
      return row;
    });
    // ---- Component A inputs: publicly established, deterministic semantics of each lawful action
    const constraints = legalActions.map((a) => {
      const cs = (Array.isArray(a.pre) ? a.pre : []).map((p) => { const k = p.lastIndexOf(':'), id = p.slice(0, k), st = p.slice(k + 1);
        return st === 'SATISFIED_OBSERVED' ? { code: id, status: 'SATISFIED', basis: 'PUBLIC_DETERMINISTIC', hard: true } : st === 'IMPLIED_BY_LEGALITY' ? { code: id, status: 'SATISFIED', basis: 'IMPLIED_BY_LEGALITY', hard: true }
          : /VIOLATED|UNSATISFIED/.test(st) ? { code: id, status: 'VIOLATED', basis: 'PUBLIC_DETERMINISTIC', hard: true } : { code: id, status: 'UNKNOWN', basis: 'NOT_PUBLICLY_ESTABLISHED', hard: false }; });
      if (!Array.isArray(a.pre)) cs.push({ code: 'PRECONDITIONS_DECLARED', status: 'UNKNOWN', basis: 'NOT_PUBLICLY_ESTABLISHED', hard: false });
      cs.push(a.energyAfter == null ? { code: 'ENERGY_AFTER_NON_NEGATIVE', status: 'UNKNOWN', basis: 'NOT_DECLARED', hard: false } : { code: 'ENERGY_AFTER_NON_NEGATIVE', status: a.energyAfter >= 0 ? 'SATISFIED' : 'VIOLATED', basis: 'PUBLIC_DETERMINISTIC', hard: true });
      return cs;
    });
    const annotations = legalActions.map((a) => [...(Array.isArray(a.eff) ? a.eff : []).map((e) => { const k = e.lastIndexOf(':'); return `${e.slice(k + 1) === 'E1' ? 'DETERMINISTIC_EFFECT' : 'UNCERTAIN_EFFECT'}:${e.slice(0, k)}`; }), ...(a.destTerrain === 'ENVIRONMENTAL_HAZARD' ? ['DESTINATION_IS_PUBLIC_HAZARD'] : [])]);
    return { schema, rows, keys, signatures, selectable: legalActions.map((_, i) => fixed.has(i)), constraints, annotations, evidence: ev };
  }
  return Object.assign(featurize, { schema, config: cfg, categoricalColumns, evidenceContract: cfg.useEvidence ? EVIDENCE_CONTRACT : null, adapterId: 'SK1_FORGE_ADAPTER_V1' });
}

/** A public projection (with its menu) and canonical evidence -> the three arguments of recommend(). */
export function forgeRequest(P, evidence = null) {
  const { menu, ...projection } = P;
  return { state: { observationContract: FORGE_OBSERVATION_CONTRACT, projection }, legalActions: menu, advisoryEvidence: evidence };
}
