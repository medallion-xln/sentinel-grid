import { deepFreeze, sha256 } from '../core/determinism.js';
import { FORGE_ENTITY_TYPE_NAMES } from '../forge/contract.js';
import { DECLARED_ACTION_COST_MODEL, observedThreatStructure } from './deployable-action-proposal-v1.js';
import { deriveDeployableCandidates, privilegedRelations } from './free-action-sufficiency-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1_SYM — Nexus requalification primitives.
 *
 * Per-candidate features over EVERY legal action (Nexus acts mostly on costly, entity-targeted actions):
 *   DEPLOYABLE  from the live decision input only: the observed canonical relational state, the legal action
 *               surface and the observed actor cell (the Stage 3F.6-P.1A-SYM deployable geometry). No identity,
 *               no absolute direction, no position of any entity other than the actor.
 *   PRIVILEGED  diagnostic only: kernel positions of task entities (never a runtime input).
 * Plus the predeclared historical-claim rules and the Nexus classification. Deterministic; reads nothing itself.
 * ========================================================================= */

export const ACTION_TYPES = deepFreeze(Object.keys(DECLARED_ACTION_COST_MODEL.cost).sort());
export const ENTITY_KINDS = deepFreeze([...FORGE_ENTITY_TYPE_NAMES]);
const THREAT_ORDER = ['REINFORCE', 'PROTECT', 'REPAIR', 'SUBSTITUTE', 'ATTACK', 'TRANSFER', 'COLLECT', 'MOVE', 'RETREAT', 'WAIT'];
const STRUCTURE_ORDER = ['REPAIR', 'SUBSTITUTE', 'REINFORCE', 'TRANSFER', 'COLLECT', 'PROTECT', 'MOVE', 'ATTACK', 'RETREAT', 'WAIT'];
export const NEXUS_REASONS = deepFreeze(['THREAT_DRIVEN_PREFERENCE', 'STRUCTURE_DRIVEN_PREFERENCE']);

export const CANDIDATE_SCHEMA = deepFreeze({
  schemaId: 'STAGE3F6P1SYM_NEXUS_CANDIDATE_REPRESENTATION_V1',
  blocks: {
    TYPE: { columns: ACTION_TYPES.map((t) => `type.${t}`), source: 'legal action actionType', class: 'DEPLOYABLE' },
    COST: { columns: ['declaredCost'], source: 'DECLARED_ACTION_COST_MODEL', class: 'DEPLOYABLE' },
    TARGET: { columns: ['target.present', ...ENTITY_KINDS.map((k) => `target.kind.${k}`), 'target.hostile', 'target.critical', 'target.threatenedBy',
      'target.supportedBy', 'target.dependents', 'target.unsupportedThreatened'], source: 'observed canonical state (entity kind/hostile/critical, observed relationship edges)', class: 'DEPLOYABLE' },
    NEXUS: { columns: ['nexus.v1TypeRank', 'nexus.v2Admissible'], source: 'Nexus diagnosis over the observed state (the rank of the action type in the active V1 preference order; the V2 PROTECT gate)', class: 'DEPLOYABLE' },
    GEOMETRY: { columns: ['cand.moveAlignsWithRetreat', 'cand.moveOpposesRetreat', 'cand.moveWithHostileGeometry', 'cand.reverseMoveLegal', 'cand.perpendicularMovesLegal',
      'geom.deltaCentreDistance', 'geom.destinationOnBorder', 'geom.deltaBorderDistance'], source: 'Stage 3F.6-P.1A-SYM deployable candidate fields (zeros for actions that do not move the actor)', class: 'DEPLOYABLE' },
    REASON_X_TYPE: { columns: ACTION_TYPES.map((t) => `threatDriven*type.${t}`), source: 'observed Nexus threat-driven flag multiplied by TYPE', class: 'DEPLOYABLE' },
    PRIV_MOVEMENT: { columns: ['OBJECTIVE', 'MATERIAL', 'RESOURCE', 'HOSTILE', 'THREATENED', 'CRITICAL', 'HUB'].map((r) => `priv.move.deltaNearest.${r}`),
      source: 'kernel entity positions: change of nearest distance from the actor to each entity class if the action moves the actor (P.1A-SYM privilegedRelations)', class: 'UNAVAILABLE' },
    PRIV_TARGET: { columns: ['priv.target.distanceFromActor', 'priv.target.distanceToNearestHostile', 'priv.target.isObjectiveEntity', 'priv.target.isMaterial'],
      source: 'kernel entity positions and objective membership for the targeted entity', class: 'UNAVAILABLE' },
    ONESTEP: { columns: ['onestep.immediateScalar'], source: 'one-step successor reward (simulator)', class: 'FUTURE_STATE_REQUIRED' },
  },
  forbidden: ['action identity or its ordering', 'absolute MOVE direction', 'hidden or canonical orientation', 'regret', 'optimal-set membership', 'successor state (except the declared ONESTEP diagnostic)', 'rollout totals'],
});
export const CANDIDATE_SCHEMA_HASH = sha256(CANDIDATE_SCHEMA);
export const DEPLOYABLE_BLOCKS = deepFreeze(['TYPE', 'COST', 'TARGET', 'NEXUS', 'GEOMETRY', 'REASON_X_TYPE']);

const rankIn = (order, type) => { const i = order.indexOf(type); return i === -1 ? 1 : i / order.length; };

/**
 * Deployable per-candidate blocks from { observation, legalActions } only, keyed by the caller's key(action).
 * legalActions: [{ actionId, actionType, targetEntityId, parameters }]. nexusReason is the observed V1 diagnosis reason.
 */
export function deployableCandidateBlocks({ observation, legalActions }, key, nexusReason) {
  const cs = observation.metadata.canonicalState;
  const s = observedThreatStructure(cs);
  const ents = new Map(cs.entities.map((e) => [e.id, e]));
  const geo = deriveDeployableCandidates({ observation, legalActions: legalActions.map((a) => ({ ...a })) }, key);
  const threatDriven = nexusReason === 'THREAT_DRIVEN_PREFERENCE' ? 1 : 0;
  const order = nexusReason === 'THREAT_DRIVEN_PREFERENCE' ? THREAT_ORDER : nexusReason === 'STRUCTURE_DRIVEN_PREFERENCE' ? STRUCTURE_ORDER : null;
  const out = new Map();
  for (const a of legalActions) {
    const k = key(a); if (out.has(k)) continue;
    const TYPE = ACTION_TYPES.map((t) => (t === a.actionType ? 1 : 0));
    const t = a.targetEntityId ? ents.get(a.targetEntityId) : null;
    const TARGET = t ? [1, ...ENTITY_KINDS.map((kd) => (kd === t.kind ? 1 : 0)), t.hostile ? 1 : 0, t.critical ? 1 : 0, s.threatenedBy.get(t.id) ?? 0,
      s.supportedBy.get(t.id) ?? 0, s.dependents.get(t.id) ?? 0, s.unsupportedThreatened.has(t.id) ? 1 : 0] : new Array(1 + ENTITY_KINDS.length + 6).fill(0);
    const NEXUS = [order === null ? 1 : rankIn(order, a.actionType), a.actionType !== 'PROTECT' || (t && (s.threatenedBy.get(t.id) ?? 0) > 0) ? 1 : 0];
    const g = geo.get(k);
    const GEOMETRY = g ? [...g.CANDIDATE, ...g.GEOMETRY] : new Array(8).fill(0);
    out.set(k, { TYPE, COST: [DECLARED_ACTION_COST_MODEL.cost[a.actionType] ?? 0], TARGET, NEXUS, GEOMETRY, REASON_X_TYPE: TYPE.map((v) => v * threatDriven) });
  }
  return out;
}

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Diagnostic only: kernel geometry per candidate. candidates: [[key, kernelAction]]. */
export function privilegedCandidateBlocks(world, candidates) {
  const move = privilegedRelations(world, candidates);
  const actor = world.entities.find((e) => e.id === 'actor').position;
  const hostiles = world.entities.filter((e) => (e.type === 'HOSTILE' || e.faction === 'hostile') && e.health > 0 && e.id !== 'actor');
  const objectiveIds = new Set(world.objectives.map((o) => o.entityId));
  const out = new Map();
  for (const [k, a] of candidates) {
    const t = a.target?.id ? world.entities.find((e) => e.id === a.target.id) : null;
    const PRIV_TARGET = t ? [manhattan(actor, t.position), hostiles.length ? Math.min(...hostiles.map((h) => manhattan(t.position, h.position))) : -1,
      objectiveIds.has(t.id) ? 1 : 0, t.id === 'material' ? 1 : 0] : [0, 0, 0, 0];
    out.set(k, { PRIV_MOVEMENT: move.get(k), PRIV_TARGET });
  }
  return out;
}

export const vectorOf = (blocks, names) => names.flatMap((b) => blocks[b]);

/* ------------------------------------------------------------ classification */

/** Historical-claim verdict from a SURVIVE test and an optional PARTIAL test. */
export const claimVerdict = ({ testable = true, survives, partial = false, insufficient = false }) => (!testable ? 'NOT_RETESTABLE'
  : insufficient ? 'INSUFFICIENT_EVIDENCE' : survives ? 'SURVIVES' : partial ? 'PARTIALLY_SURVIVES' : 'INVALIDATED');

/** Predeclared Nexus classification, first match is primary; every holding label is listed. */
export function nexusClassification(e) {
  const holds = {
    INSUFFICIENT_EVIDENCE: e.proposingN < 200,
    SHORTCUT_DEPENDENT: e.nuisanceDependence,
    GENUINE_RELATIONAL_COMPETENCE: e.genuineRelational,
    REPRESENTATION_BLOCKED: e.representationBlocked,
    POLICY_LOGIC_LIMITED: e.policyLogicLimited,
    REDESIGN_CANDIDATE: e.marginalAccuracyGain >= 0.02 && e.accuracyWhenBest < 0.5,
    WEAK_BUT_DISTINCT: e.marginalAccuracyGain >= 0.02,
    REDUNDANT: e.marginalAccuracyGain < 0.02,
  };
  const order = Object.keys(holds);
  const primary = order.find((k) => holds[k]);
  return { primary, labels: order.filter((k) => holds[k]), holds };
}
