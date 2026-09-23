import { deepFreeze, sha256 } from '../core/determinism.js';
import { FORGE_RELATION_TYPES } from '../forge/contract.js';
import { curriculumV2Parameters } from '../forge/scenarios-v2.js';
import { DECLARED_ACTION_COST_MODEL, observedThreatStructure } from './deployable-action-proposal-v1.js';
import { NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH } from './nexus-relational-spatial-context-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1A_SYM — FREE-ACTION DECISION SUFFICIENCY primitives.
 *
 * Question: given only decision-time information, can a simple equivariant scorer tell the optimal zero-cost action
 * from the other zero-cost candidates? Offline measurement only; oracle labels are targets, never inputs.
 *
 * Representation tiers (each a strict superset of the previous one):
 *   TYPE       declared action type of the candidate (the minimum needed to name a candidate at all) x state CORE.
 *   CANDIDATE  relations readable from the live legal action surface (SENTINEL_NEXUS_RELATIONAL_SPATIAL_CONTEXT_V1):
 *              MOVE vs the legal RETREAT step, and local traversability (reverse / perpendicular MOVEs legal).
 *   GEOMETRY   MOVE / RETREAT destination vs the grid centre and border, from the OBSERVED actor cell and the
 *              DECLARED curriculum grid size (gridSize = 8 + 2 * observed scenarioLevel).
 * Every deployable field is a relative relation, so the scorer is D4-equivariant by construction; no field reads an
 * action identity, the absolute direction, the hidden orientation, the canonical frame, a kernel position or a
 * successor state. Diagnostic tiers that DO read such information are declared separately and never headline.
 *
 * Ties are never broken by identity: a scorer's decision is the uniform distribution over its top-scoring set.
 * ========================================================================= */

export const FREE_ACTION_REPRESENTATION_ID = 'STAGE3F6P1ASYM_FREE_ACTION_CANDIDATE_REPRESENTATION_V1';
export const ZERO_COST_TYPES = deepFreeze(Object.entries(DECLARED_ACTION_COST_MODEL.cost).filter(([, c]) => c === 0).map(([t]) => t).sort());
const DELTA = deepFreeze({ NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] });
const DIRECTIONS = deepFreeze(['EAST', 'NORTH', 'SOUTH', 'WEST']);
const ACTOR_X = 3; const ACTOR_Y = 4;

/* ------------------------------------------------------------------ audit */
export const FeatureClass = deepFreeze({
  DEPLOYABLE: 'DEPLOYABLE', ORACLE_ONLY: 'ORACLE_ONLY', ROLLOUT_REQUIRED: 'ROLLOUT_REQUIRED', FUTURE_STATE_REQUIRED: 'FUTURE_STATE_REQUIRED',
  LEAKED: 'LEAKED', NON_EQUIVARIANT: 'NON_EQUIVARIANT', UNAVAILABLE: 'UNAVAILABLE',
});
const f = (id, block, cls, source, note = null) => ({ id, block, class: cls, source, note });
/** Every per-candidate quantity the stage could read, with its declared class. Empirical audit may only DOWNGRADE. */
export const CANDIDATE_FEATURE_INVENTORY = deepFreeze([
  f('type.WAIT', 'TYPE', 'DEPLOYABLE', 'live legal action actionType'),
  f('type.RETREAT', 'TYPE', 'DEPLOYABLE', 'live legal action actionType'),
  f('type.COLLECT', 'TYPE', 'DEPLOYABLE', 'live legal action actionType'),
  f('declaredCost', 'NONE', 'DEPLOYABLE', 'DECLARED_ACTION_COST_MODEL', 'constant 0 over the eligible candidate set; carries no information and is not a column'),
  f('cand.moveAlignsWithRetreat', 'CANDIDATE', 'DEPLOYABLE', 'observed actor cell + live RETREAT parameters + declared deltas (P.1A contract field)'),
  f('cand.moveOpposesRetreat', 'CANDIDATE', 'DEPLOYABLE', 'observed actor cell + live RETREAT parameters + declared deltas (P.1A contract field)'),
  f('cand.moveWithHostileGeometry', 'CANDIDATE', 'DEPLOYABLE', 'a legal RETREAT exists (hostile geometry partially revealed), on MOVE candidates'),
  f('cand.reverseMoveLegal', 'CANDIDATE', 'DEPLOYABLE', 'live legal MOVE directions (relative: the opposite MOVE is legal)'),
  f('cand.perpendicularMovesLegal', 'CANDIDATE', 'DEPLOYABLE', 'live legal MOVE directions (relative: count of legal perpendicular MOVEs, 0-2)'),
  f('geom.deltaCentreDistance', 'GEOMETRY', 'DEPLOYABLE', 'observed actor cell + declared gridSize(scenarioLevel) + declared deltas'),
  f('geom.destinationOnBorder', 'GEOMETRY', 'DEPLOYABLE', 'observed actor cell + declared gridSize(scenarioLevel) + declared deltas'),
  f('geom.deltaBorderDistance', 'GEOMETRY', 'DEPLOYABLE', 'observed actor cell + declared gridSize(scenarioLevel) + declared deltas'),
  f('diag.absoluteDirection', 'ABSOLUTE_DIRECTION', 'NON_EQUIVARIANT', 'MOVE parameters.direction in the presented frame; changes under every non-identity D4 transform'),
  f('diag.actionIdentityRank', 'NONE', 'NON_EQUIVARIANT', 'rank of the action identity (forgeActionKey); used only by the LOWEST/HIGHEST_ID controls'),
  f('diag.canonicalFrameDirection', 'CANONICAL_FRAME', 'LEAKED', 'direction in the canonical frame, which minimises a digest of the FULL kernel geometry (privileged positions)'),
  f('diag.hiddenOrientationDirection', 'HIDDEN_ORIENTATION', 'ORACLE_ONLY', 'direction in the generator base frame, i.e. the hidden benchmark orientation label'),
  f('diag.privilegedRelations', 'PRIVILEGED', 'UNAVAILABLE', 'kernel entity positions (objective, material, resources, hostiles, threatened, critical, hubs); not exposed by the live interfaces'),
  f('diag.oneStepImmediate', 'ONE_STEP', 'FUTURE_STATE_REQUIRED', 'immediateScalar of the simulated successor state'),
  f('diag.horizonTotal', 'NONE', 'ROLLOUT_REQUIRED', 'totalScalar of the horizon rollout; determines regret exactly, so also LEAKED; never a column'),
  f('oracle.regret', 'NONE', 'ORACLE_ONLY', 'counterfactual regret; target side only'),
  f('oracle.optimal', 'NONE', 'ORACLE_ONLY', 'optimal-set membership; the target'),
  f('row.materialDirection', 'NONE', 'UNAVAILABLE', 'kernel material position relative to the actor; never a column'),
]);

export const FREE_ACTION_REPRESENTATION_CONTRACT = deepFreeze({
  contractId: FREE_ACTION_REPRESENTATION_ID,
  eligibility: 'at least one legal zero-cost action AND the oracle-optimal set contains a zero-cost action',
  candidates: 'the distinct legal zero-cost actions of the presented symmetric surface (declared cost 0)',
  zeroCostTypes: ZERO_COST_TYPES,
  deployableSources: ['ObservationPacket.features[3..4] (actor cell)', 'ObservationPacket.metadata.scenarioLevel', 'ObservationPacket.metadata.canonicalState',
    'live legal actions (actionType, parameters.direction, RETREAT parameters.toX/toY)', 'declared curriculum gridSize(level)', 'declared action cost model', 'declared MOVE deltas'],
  inventory: CANDIDATE_FEATURE_INVENTORY,
  spatialContextContract: NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH,
  tieRule: 'uniform over the top-scoring set; identities never break ties',
  forbidden: ['action identity or its order', 'absolute direction', 'hidden orientation', 'canonical frame', 'kernel positions', 'successor state', 'rollout', 'regret', 'optimal-set membership'],
});
export const FREE_ACTION_REPRESENTATION_HASH = sha256(FREE_ACTION_REPRESENTATION_CONTRACT);

/* --------------------------------------------------------- deployable derivation */

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const destinationOf = (actor, a) => {
  if (a.actionType === 'MOVE' && DELTA[a.parameters?.direction]) return { x: actor.x + DELTA[a.parameters.direction][0], y: actor.y + DELTA[a.parameters.direction][1] };
  if (a.actionType === 'RETREAT' && isInt(a.parameters?.toX) && isInt(a.parameters?.toY)) return { x: a.parameters.toX, y: a.parameters.toY };
  return null;
};

/**
 * Deployable per-candidate fields from the live decision input ONLY: { observation, legalActions }.
 * legalActions: [{ actionId, actionType, parameters }]. Returns { key -> { TYPE, CANDIDATE, GEOMETRY } } for the
 * zero-cost candidates, keyed by the caller's `key(action)`. Reads no identity (the key is only a label).
 */
export function deriveDeployableCandidates({ observation, legalActions }, key) {
  const feats = observation.features;
  const actor = isInt(feats?.[ACTOR_X]) && isInt(feats?.[ACTOR_Y]) ? { x: feats[ACTOR_X], y: feats[ACTOR_Y] } : null;
  const level = observation.metadata?.scenarioLevel;
  const size = isInt(level) ? curriculumV2Parameters(level).gridSize : null;
  const retreats = legalActions.filter((a) => a.actionType === 'RETREAT');
  const retreatDest = actor !== null && retreats.length === 1 ? destinationOf(actor, retreats[0]) : null;
  const retreatStep = retreatDest && Math.abs(retreatDest.x - actor.x) + Math.abs(retreatDest.y - actor.y) === 1 ? { dx: retreatDest.x - actor.x, dy: retreatDest.y - actor.y } : null;
  const legalDirs = new Set(legalActions.filter((a) => a.actionType === 'MOVE').map((a) => a.parameters?.direction));
  const c = size === null ? null : (size - 1) / 2;
  const centre = (p) => Math.abs(p.x - c) + Math.abs(p.y - c);
  const border = (p) => Math.min(p.x, p.y, size - 1 - p.x, size - 1 - p.y);
  const out = new Map();
  for (const a of legalActions) {
    if (DECLARED_ACTION_COST_MODEL.cost[a.actionType] !== 0) continue;
    const k = key(a); if (out.has(k)) continue;
    const TYPE = [a.actionType === 'WAIT' ? 1 : 0, a.actionType === 'RETREAT' ? 1 : 0, a.actionType === 'COLLECT' ? 1 : 0];
    let CANDIDATE = [0, 0, 0, 0, 0];
    if (a.actionType === 'MOVE' && DELTA[a.parameters?.direction]) {
      const [dx, dy] = DELTA[a.parameters.direction];
      const reverse = DIRECTIONS.find((d) => DELTA[d][0] === -dx && DELTA[d][1] === -dy);
      const perpendicular = DIRECTIONS.filter((d) => DELTA[d][0] * dx + DELTA[d][1] * dy === 0 && legalDirs.has(d)).length;
      CANDIDATE = [retreatStep && dx === retreatStep.dx && dy === retreatStep.dy ? 1 : 0, retreatStep && dx === -retreatStep.dx && dy === -retreatStep.dy ? 1 : 0,
        retreatStep ? 1 : 0, legalDirs.has(reverse) ? 1 : 0, perpendicular];
    }
    let GEOMETRY = [0, 0, 0];
    const dest = actor === null ? null : destinationOf(actor, a);
    if (dest !== null && size !== null) GEOMETRY = [centre(dest) - centre(actor), border(dest) === 0 ? 1 : 0, border(dest) - border(actor)];
    out.set(k, { TYPE, CANDIDATE, GEOMETRY, actionType: a.actionType });
  }
  return out;
}

/** State-level fields used by every tier (sorted DEPLOYABLE_CORE ids, as stored in the corpus). */
export const stateVector = (core, featureIds) => featureIds.map((id) => core[id]);

/* --------------------------------------------------------- diagnostic derivation */

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const PRIVILEGED_RELATIONS = deepFreeze(['OBJECTIVE', 'MATERIAL', 'RESOURCE', 'HOSTILE', 'THREATENED', 'CRITICAL', 'HUB']);
/** Offline only: change of nearest-distance to each privileged entity class (kernel positions). */
export function privilegedRelations(world, candidates) {
  const actorEntity = world.entities.find((e) => e.id === 'actor');
  const actor = actorEntity.position;
  const canonical = { entities: world.entities.map((e) => ({ id: e.id })),
    relationships: world.relations.map((r) => ({ from: r.from, to: r.to, kind: FORGE_RELATION_TYPES[r.type]?.nexusKind ?? r.type })) };
  const s = observedThreatStructure(canonical);
  const objectiveIds = new Set(world.objectives.map((o) => o.entityId));
  const classes = {
    OBJECTIVE: world.entities.filter((e) => objectiveIds.has(e.id)),
    MATERIAL: world.entities.filter((e) => e.id === 'material'),
    RESOURCE: world.entities.filter((e) => e.type === 'RESOURCE'),
    HOSTILE: world.entities.filter((e) => (e.type === 'HOSTILE' || e.faction === 'hostile') && e.health > 0 && e.id !== 'actor'),
    THREATENED: world.entities.filter((e) => (s.threatenedBy.get(e.id) ?? 0) > 0),
    CRITICAL: world.entities.filter((e) => e.flags?.critical === true || objectiveIds.has(e.id)),
    HUB: world.entities.filter((e) => (s.dependents.get(e.id) ?? 0) >= 2),
  };
  const nearest = (p, list) => (list.length ? Math.min(...list.map((e) => manhattan(p, e.position))) : null);
  const out = new Map();
  for (const [k, a] of candidates) {
    const dest = destinationOf(actor, a) ?? actor;
    out.set(k, PRIVILEGED_RELATIONS.map((rel) => { const d0 = nearest(actor, classes[rel]); return d0 === null ? 0 : nearest(dest, classes[rel]) - d0; }));
  }
  return out;
}
export const directionOneHot = (dir) => DIRECTIONS.map((d) => (d === dir ? 1 : 0));

/* --------------------------------------------------------- conditional logit */

/**
 * Candidate-set softmax scorer with a set-valued target: maximise log sum_{a in optimal} p(a).
 * DEV standardisation of every column, zeros init, full-batch gradient descent, l2 on all weights (no bias: it
 * cancels in a within-state softmax). Deterministic.
 */
export function fitCandidateLogit(groups, { learningRate = 0.1, l2 = 1e-3, iterations = 2000 } = {}) {
  const d = groups[0].X[0].length;
  let n = 0; const mu = new Float64Array(d); const sd = new Float64Array(d);
  for (const g of groups) for (const x of g.X) { n += 1; for (let j = 0; j < d; j += 1) mu[j] += x[j]; }
  for (let j = 0; j < d; j += 1) mu[j] /= n;
  for (const g of groups) for (const x of g.X) for (let j = 0; j < d; j += 1) sd[j] += (x[j] - mu[j]) ** 2;
  for (let j = 0; j < d; j += 1) { sd[j] = Math.sqrt(sd[j] / n); if (sd[j] === 0) sd[j] = 1; }
  const Z = groups.map((g) => ({ X: g.X.map((x) => Float64Array.from(x, (v, j) => (v - mu[j]) / sd[j])), y: g.y }));
  const w = new Float64Array(d); const G = groups.length;
  for (let it = 0; it < iterations; it += 1) {
    const grad = new Float64Array(d);
    for (const g of Z) {
      const s = g.X.map((x) => { let z = 0; for (let j = 0; j < d; j += 1) z += w[j] * x[j]; return z; });
      const m = Math.max(...s); const e = s.map((v) => Math.exp(v - m)); const tot = e.reduce((a, b) => a + b, 0);
      const pOpt = e.reduce((a, v, i) => a + (g.y[i] ? v : 0), 0);
      for (let i = 0; i < g.X.length; i += 1) {
        const coef = e[i] / tot - (g.y[i] ? e[i] / pOpt : 0);
        if (coef === 0) continue;
        const x = g.X[i]; for (let j = 0; j < d; j += 1) grad[j] += coef * x[j];
      }
    }
    for (let j = 0; j < d; j += 1) w[j] -= learningRate * (grad[j] / G + l2 * w[j]);
  }
  return deepFreeze({ mu: [...mu], sd: [...sd], w: [...w], trainedGroups: G, trainedCandidates: n });
}

/** Scores and softmax probabilities for one state's candidates (order-free: each candidate scored independently). */
export function scoreCandidates(model, X) {
  const s = X.map((x) => { let z = 0; for (let j = 0; j < x.length; j += 1) z += model.w[j] * ((x[j] - model.mu[j]) / model.sd[j]); return Math.round(z * 1e9) / 1e9; });
  const m = Math.max(...s); const e = s.map((v) => Math.exp(v - m)); const tot = e.reduce((a, b) => a + b, 0);
  return { scores: s, probabilities: e.map((v) => v / tot) };
}
export const modelHash = (m) => sha256({ mu: m.mu, sd: m.sd, w: m.w });

/* --------------------------------------------------------- per-row outcome */

/**
 * Outcome of a decision given as a set of equally-likely chosen candidates (uniform ties).
 * c: [{ key, o, r, maxR }]; chosen: array of indices. probs optional (for probabilistic metrics).
 */
export function outcomeOf(c, chosen, probs = null) {
  const k = chosen.length;
  const hit = chosen.reduce((a, i) => a + c[i].o, 0) / k;
  const regret = chosen.reduce((a, i) => a + c[i].r, 0) / k;
  const nreg = chosen.reduce((a, i) => a + (c[i].maxR > 0 ? c[i].r / c[i].maxR : 0), 0) / k;
  const catastrophic = chosen.reduce((a, i) => a + (c[i].r >= 100 ? 1 : 0), 0) / k;
  const out = { hit, regret, nreg, catastrophic };
  if (probs !== null) {
    const pOpt = c.reduce((a, x, i) => a + (x.o ? probs[i] : 0), 0);
    const conf = probs[chosen[0]];
    out.pOptimal = pOpt; out.crossEntropy = -Math.log(Math.max(pOpt, 1e-12)); out.confidence = conf;
    out.brier = chosen.reduce((a, i) => a + (conf - c[i].o) ** 2, 0) / k;
  }
  return out;
}
export const topSet = (scores) => { const m = Math.max(...scores); return scores.map((s, i) => (s === m ? i : -1)).filter((i) => i >= 0); };

export function ece10(pairs) {
  const b = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
  for (const { p, y } of pairs) { const k = Math.min(9, Math.floor(p * 10)); b[k].n += 1; b[k].p += p; b[k].y += y; }
  const n = pairs.length;
  return n ? b.reduce((s, x) => s + (x.n ? (x.n / n) * Math.abs(x.p / x.n - x.y / x.n) : 0), 0) : null;
}

/* --------------------------------------------------------- error attribution */

export const ERROR_CLASSES = deepFreeze(['OBJECTIVE', 'RESOURCE', 'THREAT', 'RELATIONAL', 'MECHANISTIC', 'TEMPORAL', 'ACTION_ID_AMBIGUITY', 'UNKNOWN']);
const RELATION_GROUPS = deepFreeze({ OBJECTIVE: ['OBJECTIVE'], RESOURCE: ['MATERIAL', 'RESOURCE'], THREAT: ['HOSTILE', 'THREATENED'], RELATIONAL: ['CRITICAL', 'HUB'] });
const separates = (O, W, v) => { const vo = O.map(v); const vw = W.map(v); return Math.min(...vo) > Math.max(...vw) || Math.max(...vo) < Math.min(...vw); };

/**
 * Predeclared attribution of one residual error. O: optimal candidates, W: wrongly preferred candidates (the
 * non-optimal members of the top set), each { dep: deployable vector, priv: privileged relations, i: one-step
 * immediate }. horizonDependent: oracle label class. The primary class names the first signal that strictly separates
 * O from W; `deployablyDistinguishable` (the deployable vectors differ at all) is reported alongside, never as a class,
 * because a difference in deployable fields does not show that those fields carry the answer.
 */
export function attributeError({ O, W, horizonDependent }) {
  const same = (a, b) => a.length === b.length && a.every((v, j) => v === b[j]);
  const deployablyDistinguishable = !O.every((o) => W.some((w) => same(o.dep, w.dep)));
  const separating = [];
  for (const [group, rels] of Object.entries(RELATION_GROUPS)) {
    if (rels.some((rel) => { const j = PRIVILEGED_RELATIONS.indexOf(rel); return separates(O, W, (x) => x.priv[j]); })) separating.push(group);
  }
  const mechanistic = separates(O, W, (x) => x.i);
  const base = { separating, mechanistic, deployablyDistinguishable };
  if (separating.length) return { primary: separating[0], ...base };
  if (mechanistic) return { primary: 'MECHANISTIC', ...base };
  if (horizonDependent) return { primary: 'TEMPORAL', ...base };
  const identical = O.every((o) => W.some((w) => same(o.dep, w.dep) && same(o.priv, w.priv) && o.i === w.i));
  return { primary: identical ? 'ACTION_ID_AMBIGUITY' : 'UNKNOWN', ...base };
}
export const PARTIAL_OBSERVABILITY_CLASSES = deepFreeze(['OBJECTIVE', 'RESOURCE', 'THREAT', 'RELATIONAL']);

/* --------------------------------------------------------- conclusions */

export const MATERIAL_TOP1_GAIN = 0.05;
export const SUFFICIENT_TOP1 = 0.5;

/** diff: { top1Difference, top1Ci95, nregDifference, nregCi95 } (model minus comparator). */
export function materialGain(diff) {
  if (!diff.top1Ci95 || !diff.nregCi95) return { MATERIAL: false, statisticallyBetter: false, NREG_WORSE: false, EMPTY: true };
  return { MATERIAL: diff.top1Difference >= MATERIAL_TOP1_GAIN && diff.top1Ci95[0] > 0 && !(diff.nregCi95[0] > 0),
    statisticallyBetter: diff.top1Ci95[0] > 0 && !(diff.nregCi95[0] > 0), NREG_WORSE: diff.nregCi95[0] > 0 };
}

/**
 * Predeclared category for one representation. e: { holdoutN, oodN, vsUniformHoldout, vsResourceHoldout, vsUniformOod,
 * vsResourceOod (materialGain results), equivariant, top1Holdout, shortcutControlMaterial }.
 */
export function sufficiencyCategory(e) {
  const materialH = e.vsUniformHoldout.MATERIAL && e.vsResourceHoldout.MATERIAL;
  const materialO = e.vsUniformOod.MATERIAL && e.vsResourceOod.MATERIAL;
  const holds = {
    INSUFFICIENT_EVIDENCE: e.holdoutN < 1000 || e.oodN < 500,
    REPRESENTATION_SUFFICIENT_POLICY_WEAK: materialH && materialO && e.equivariant && e.top1Holdout >= SUFFICIENT_TOP1,
    REPRESENTATION_PARTIALLY_SUFFICIENT: materialH && materialO && e.equivariant && e.top1Holdout < SUFFICIENT_TOP1,
    SHORTCUT_ONLY_GAIN: (materialH && !e.equivariant) || (!materialH && e.shortcutControlMaterial),
    REPRESENTATION_INSUFFICIENT: !(materialH && materialO && e.equivariant),
    OOD_UNSTABLE: materialH && !materialO,
  };
  const order = ['INSUFFICIENT_EVIDENCE', 'REPRESENTATION_SUFFICIENT_POLICY_WEAK', 'REPRESENTATION_PARTIALLY_SUFFICIENT', 'SHORTCUT_ONLY_GAIN', 'REPRESENTATION_INSUFFICIENT'];
  const primary = order.find((k) => holds[k]);
  return { primary, secondary: Object.keys(holds).filter((k) => holds[k] && k !== primary), holds };
}
