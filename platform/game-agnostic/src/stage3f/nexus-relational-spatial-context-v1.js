import { deepFreeze, sha256 } from '../core/determinism.js';
import { observedThreatStructure } from './deployable-action-proposal-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1A — SENTINEL_NEXUS_RELATIONAL_SPATIAL_CONTEXT_V1 (candidate contract)
 *
 * The decision-time relational-spatial facts NEXUS could legitimately read, each with an explicit
 * source, epistemic category and missing semantics, and a deterministic, fail-closed derivation.
 *
 * Boundary. Sources are ONLY the live ObservationPacket and the live legal action interface:
 *   - observation features[3], features[4]      actor cell (OBSERVED)
 *   - canonicalState entities / relationships   relational structure, carries NO positions (OBSERVED)
 *   - legal action parameters                   MOVE direction, RETREAT destination (live action interface)
 *   - legal targeted actions                    adjacency evidence (action range is declared as 1)
 * Kernel entity positions, the grid, terrain and hazards are NOT exposed by either interface. They are
 * PRIVILEGED and no field here reads them. Fields that would need them are declared, never derived.
 *
 * Missing semantics are preserved, never collapsed:
 *   UNKNOWN_POSITION != ZERO_POSITION, NO_POSITION_EVIDENCE != SAME_POSITION,
 *   UNOBSERVED_RELATION != ABSENT_RELATION.
 * Whether any field is accepted is decided by DEV evidence in the Stage 3F.6-P.1A freeze, not here.
 * ========================================================================= */

export const NEXUS_RELATIONAL_SPATIAL_CONTEXT_ID = 'SENTINEL_NEXUS_RELATIONAL_SPATIAL_CONTEXT_V1';

export const EpistemicCategory = deepFreeze({
  OBSERVED: 'OBSERVED', DERIVED_FROM_OBSERVATION: 'DERIVED_FROM_OBSERVATION', AUTHORITATIVE_CURRENT_STATE: 'AUTHORITATIVE_CURRENT_STATE',
  UNAVAILABLE: 'UNAVAILABLE', PRIVILEGED: 'PRIVILEGED',
});

export const Missing = deepFreeze({
  UNKNOWN_POSITION: 'UNKNOWN_POSITION',
  NO_POSITION_EVIDENCE: 'NO_POSITION_EVIDENCE',
  UNKNOWN_HOSTILE_GEOMETRY: 'UNKNOWN_HOSTILE_GEOMETRY',
  NO_ADJACENCY_EVIDENCE: 'NO_ADJACENCY_EVIDENCE',
  UNKNOWN_DIRECTION: 'UNKNOWN_DIRECTION',
});

/** Declared action semantics (the kernel's direction table and targeted-action range), not simulator state. */
export const DECLARED_MOVE_SEMANTICS = deepFreeze({
  directions: { NORTH: { dx: 0, dy: -1 }, EAST: { dx: 1, dy: 0 }, SOUTH: { dx: 0, dy: 1 }, WEST: { dx: -1, dy: 0 } },
  targetedActionRange: 1,
  source: 'ENVIRONMENT_DECLARED_ACTION_SEMANTICS',
});
const ACTOR_X_INDEX = 3;
const ACTOR_Y_INDEX = 4;

/** Section 5 inventory: what Forge exposes at decision time. */
export const SPATIAL_AVAILABILITY = deepFreeze({
  ACTOR_POSITION: { category: EpistemicCategory.OBSERVED, source: 'ObservationPacket.features[3..4] (OBSERVATION_BINDING actorX, actorY)' },
  THREAT_POSITION: { category: EpistemicCategory.PRIVILEGED, source: 'kernel world.entities[].position only; canonicalState carries no positions',
    partialEvidence: 'a legal RETREAT exposes the one-step cell away from the NEAREST live hostile along one axis; a legal ATTACK exposes an adjacent hostile' },
  RELATIONAL_TARGET_POSITION: { category: EpistemicCategory.PRIVILEGED, source: 'kernel only',
    partialEvidence: 'a legal targeted action (PROTECT, REINFORCE, REPAIR, RESTORE, TRANSFER, ATTACK) proves its target is within range 1; absence proves nothing' },
  DEPENDENCY_TARGET_POSITION: { category: EpistemicCategory.PRIVILEGED, source: 'kernel only', partialEvidence: 'same adjacency evidence as relational targets' },
  ADJACENCY: { category: EpistemicCategory.DERIVED_FROM_OBSERVATION, source: 'legal targeted actions + declared range 1; incomplete (energy- and flag-gated)' },
  LEGAL_MOVE_DESTINATIONS: { category: EpistemicCategory.DERIVED_FROM_OBSERVATION, source: 'live MOVE parameters.direction + declared direction deltas + observed actor cell; legality proves the cell is traversable' },
  TERRAIN_AND_HAZARDS: { category: EpistemicCategory.PRIVILEGED, source: 'kernel grid only' },
  ENTITY_VALUE: { category: EpistemicCategory.PRIVILEGED, source: 'kernel entities only; canonicalState carries id, kind, hostile, critical' },
});

const field = (f) => ({ decisionTime: true, ...f });
export const NEXUS_SPATIAL_CANDIDATE_FIELDS = deepFreeze([
  field({ fieldId: 'moveDirection', semantic: 'declared direction of each legal MOVE', source: 'live legal action parameters.direction',
    epistemicCategory: EpistemicCategory.OBSERVED, requiredCapability: 'LEGAL_ACTION_SURFACE', missingSemantics: Missing.UNKNOWN_DIRECTION,
    derivation: 'parameters.direction if it is a declared direction, else UNKNOWN_DIRECTION', deployable: true, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveAlignsWithRetreat', semantic: 'the MOVE lands on the legal RETREAT cell, i.e. steps away from the nearest live hostile',
    source: 'observed actor cell + live RETREAT parameters + declared direction deltas', epistemicCategory: EpistemicCategory.DERIVED_FROM_OBSERVATION,
    requiredCapability: 'OBSERVATION_SCHEMA_BOUND+LEGAL_ACTION_SURFACE', missingSemantics: `${Missing.NO_POSITION_EVIDENCE} | ${Missing.UNKNOWN_HOSTILE_GEOMETRY}`,
    derivation: 'actor + delta(direction) === RETREAT destination; UNKNOWN when the actor cell or a legal RETREAT is missing', deployable: true, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveOpposesRetreat', semantic: 'the MOVE steps toward the nearest live hostile along the retreat axis',
    source: 'observed actor cell + live RETREAT parameters + declared direction deltas', epistemicCategory: EpistemicCategory.DERIVED_FROM_OBSERVATION,
    requiredCapability: 'OBSERVATION_SCHEMA_BOUND+LEGAL_ACTION_SURFACE', missingSemantics: `${Missing.NO_POSITION_EVIDENCE} | ${Missing.UNKNOWN_HOSTILE_GEOMETRY}`,
    derivation: 'delta(direction) === -(RETREAT destination - actor); UNKNOWN when either is missing', deployable: true, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'adjacentThreatenedEvidence', semantic: 'a legal PROTECT targets an entity with an observed threatens edge (so it is adjacent)',
    source: 'legal PROTECT targets + observed threatens edges', epistemicCategory: EpistemicCategory.DERIVED_FROM_OBSERVATION,
    requiredCapability: 'LEGAL_ACTION_SURFACE+RELATIONAL_EXPERT', missingSemantics: Missing.NO_ADJACENCY_EVIDENCE,
    derivation: 'true if such a PROTECT exists; NO_ADJACENCY_EVIDENCE otherwise (not "not adjacent")', deployable: true, role: 'PROTECT_VS_MOVE' }),
  field({ fieldId: 'adjacentDependencyHubEvidence', semantic: 'a legal PROTECT targets an entity with >= 2 observed dependents',
    source: 'legal PROTECT targets + observed depends edges', epistemicCategory: EpistemicCategory.DERIVED_FROM_OBSERVATION,
    requiredCapability: 'LEGAL_ACTION_SURFACE+RELATIONAL_EXPERT', missingSemantics: Missing.NO_ADJACENCY_EVIDENCE,
    derivation: 'true if such a PROTECT exists; NO_ADJACENCY_EVIDENCE otherwise', deployable: true, role: 'PROTECT_VS_MOVE' }),
  field({ fieldId: 'adjacentCriticalEvidence', semantic: 'a legal PROTECT targets an observed critical entity',
    source: 'legal PROTECT targets + observed critical flag', epistemicCategory: EpistemicCategory.DERIVED_FROM_OBSERVATION,
    requiredCapability: 'LEGAL_ACTION_SURFACE+RELATIONAL_EXPERT', missingSemantics: Missing.NO_ADJACENCY_EVIDENCE,
    derivation: 'true if such a PROTECT exists; NO_ADJACENCY_EVIDENCE otherwise', deployable: true, role: 'PROTECT_VS_MOVE' }),
  field({ fieldId: 'moveChangesThreatenedDistance', semantic: 'MOVE approaches the nearest observed-threatened entity', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveChangesHostileDistance', semantic: 'MOVE leaves the nearest live hostile (all axes)', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveChangesDependencyHubDistance', semantic: 'MOVE approaches the nearest entity with >= 2 dependents', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveChangesCriticalDistance', semantic: 'MOVE approaches the nearest critical entity', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveInterposesThreat', semantic: 'MOVE lands on a shortest path between a hostile and an entity it threatens', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
  field({ fieldId: 'moveChangesThreatenedAdjacency', semantic: 'number of observed-threatened entities adjacent after the MOVE', source: 'kernel entity positions',
    epistemicCategory: EpistemicCategory.PRIVILEGED, requiredCapability: 'NONE_DEPLOYABLE', missingSemantics: Missing.UNKNOWN_POSITION,
    derivation: 'not derivable from the live interfaces; measured offline only', deployable: false, role: 'MOVE_DIRECTION' }),
]);

export const NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT = deepFreeze({
  contractId: NEXUS_RELATIONAL_SPATIAL_CONTEXT_ID,
  schemaVersion: 1,
  invariant: 'SPATIAL_CONTEXT_SUPPORTS_RELATIONAL_REASONING != GENERAL_SPATIAL_PLANNING',
  availability: SPATIAL_AVAILABILITY,
  declaredMoveSemantics: DECLARED_MOVE_SEMANTICS,
  candidateFields: NEXUS_SPATIAL_CANDIDATE_FIELDS,
  forbidden: ['hidden full map state', 'kernel entity positions', 'terrain', 'future positions', 'future trajectories', 'multi-step pathfinding',
    'simulator rollout scores', 'horizon-optimal action', 'regret', 'future reward', 'sealed labels', 'oracle-selected destination',
    'declared action cost (no cheapest / zero-cost choice)'],
  missingSemantics: ['UNKNOWN_POSITION != ZERO_POSITION', 'NO_POSITION_EVIDENCE != SAME_POSITION', 'UNOBSERVED_RELATION != ABSENT_RELATION'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const NEXUS_RELATIONAL_SPATIAL_CONTEXT_HASH = sha256(NEXUS_RELATIONAL_SPATIAL_CONTEXT_CONTRACT);

const isInteger = (v) => typeof v === 'number' && Number.isInteger(v);

/** Deterministic, fail-closed derivation of the DEPLOYABLE candidate fields from the live decision input only. */
export function deriveRelationalSpatialContext(decisionInput) {
  const features = decisionInput?.observationFeatures;
  const legalActions = Array.isArray(decisionInput?.legalActions) ? decisionInput.legalActions : null;
  if (legalActions === null) return deepFreeze({ status: 'UNAVAILABLE', reason: 'NO_LEGAL_ACTION_SURFACE', actorCell: Missing.NO_POSITION_EVIDENCE, moves: [], protectEvidence: null });

  const actorCell = Array.isArray(features) && isInteger(features[ACTOR_X_INDEX]) && isInteger(features[ACTOR_Y_INDEX])
    ? { x: features[ACTOR_X_INDEX], y: features[ACTOR_Y_INDEX] } : Missing.NO_POSITION_EVIDENCE;

  const retreats = legalActions.filter((a) => a.actionType === 'RETREAT');
  const retreat = retreats.length === 1 && isInteger(retreats[0].parameters?.toX) && isInteger(retreats[0].parameters?.toY) ? retreats[0].parameters : null;
  let retreatStep = Missing.UNKNOWN_HOSTILE_GEOMETRY;
  if (actorCell === Missing.NO_POSITION_EVIDENCE) retreatStep = Missing.NO_POSITION_EVIDENCE;
  else if (retreat !== null) {
    const dx = retreat.toX - actorCell.x; const dy = retreat.toY - actorCell.y;
    retreatStep = Math.abs(dx) + Math.abs(dy) === 1 ? { dx, dy } : Missing.UNKNOWN_HOSTILE_GEOMETRY;
  }

  const moves = legalActions.filter((a) => a.actionType === 'MOVE')
    .sort((a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0))
    .map((a) => {
      const delta = DECLARED_MOVE_SEMANTICS.directions[a.parameters?.direction];
      if (delta === undefined) return { actionId: a.actionId, moveDirection: Missing.UNKNOWN_DIRECTION, moveAlignsWithRetreat: Missing.UNKNOWN_DIRECTION, moveOpposesRetreat: Missing.UNKNOWN_DIRECTION };
      const known = typeof retreatStep === 'object';
      return { actionId: a.actionId, moveDirection: a.parameters.direction,
        moveAlignsWithRetreat: known ? delta.dx === retreatStep.dx && delta.dy === retreatStep.dy : retreatStep,
        moveOpposesRetreat: known ? delta.dx === -retreatStep.dx && delta.dy === -retreatStep.dy : retreatStep };
    });

  let protectEvidence = null;
  if (decisionInput?.canonicalState && Array.isArray(decisionInput.canonicalState.entities) && Array.isArray(decisionInput.canonicalState.relationships)) {
    const s = observedThreatStructure(decisionInput.canonicalState);
    const protects = legalActions.filter((a) => a.actionType === 'PROTECT' && typeof a.targetEntityId === 'string');
    const evidence = (pred) => (protects.some((a) => pred(a.targetEntityId)) ? true : Missing.NO_ADJACENCY_EVIDENCE);
    protectEvidence = {
      adjacentThreatenedEvidence: evidence((id) => (s.threatenedBy.get(id) ?? 0) > 0),
      adjacentDependencyHubEvidence: evidence((id) => (s.dependents.get(id) ?? 0) >= 2),
      adjacentCriticalEvidence: evidence((id) => s.criticalIds.has(id)),
    };
  }
  return deepFreeze({ status: actorCell === Missing.NO_POSITION_EVIDENCE ? 'PARTIAL' : 'AVAILABLE', actorCellEvidence: actorCell === Missing.NO_POSITION_EVIDENCE ? Missing.NO_POSITION_EVIDENCE : 'OBSERVED',
    retreatStep, moves, protectEvidence });
}
