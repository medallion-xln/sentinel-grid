import { deepFreeze, sha256 } from '../core/determinism.js';

/* ===========================================================================
 * STAGE_3F_6_A — SENTINEL_DEPLOYABLE_ACTION_PROPOSAL_V1
 *
 * Stage 3F.6-C established two structural findings:
 *   ACTION_COMPUTATION_GAP     CORE can predict whether the greedy action is safe
 *                              but cannot compute that action (no one-step simulator).
 *   INDEPENDENT_FALLBACK_GAP   the only deployable fallback agrees with greedy ~81-85%
 *                              of the time, so there is nothing meaningful to route to.
 *
 *   ROUTING_VALUE REQUIRES POLICY_DIVERSITY
 *   PREDICTING_WHETHER_AN_ACTION_IS_SAFE != GENERATING_THE_ACTION
 *
 * Every producer here computes an action from decision-time evidence only: the observation
 * packet, the legal action surface, and a declared action-cost model. No simulator, no V2B,
 * no multi-step rollout, no future outcome, no sealed label. A producer that cannot justify
 * a choice ABSTAINS; it never invents an action to appear available.
 * ========================================================================= */

export const DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID = 'SENTINEL_DEPLOYABLE_ACTION_PROPOSAL_V1';
export const DEPLOYABLE_ACTION_PROPOSAL_SCHEMA_VERSION = 1;

export class DeployableActionProposalError extends Error {}

export const ProposalCapability = deepFreeze({
  OBSERVATION_SCHEMA_BOUND: 'OBSERVATION_SCHEMA_BOUND',
  LEGAL_ACTION_SURFACE: 'LEGAL_ACTION_SURFACE',
  RELATIONAL_EXPERT: 'RELATIONAL_EXPERT',
  ACTION_COST_MODEL: 'ACTION_COST_MODEL',
});

export const ProposalStatus = deepFreeze({ PROPOSED: 'PROPOSED', ABSTAIN: 'ABSTAIN' });

/**
 * Declared action-cost model.
 *
 * This is environment-declared ACTION/RESOURCE semantics, not a peek into simulator internals:
 * the deploying environment states what each action type costs. The kernel keeps its own private
 * table, so this declaration is verified empirically against observed energy deltas in the tests
 * rather than trusted. A type absent from the model yields UNKNOWN cost, never a default of zero.
 */
export const DECLARED_ACTION_COST_MODEL = deepFreeze({
  modelId: 'FORGE_DECLARED_ENERGY_COST_V1',
  source: 'ENVIRONMENT_DECLARED_ACTION_SEMANTICS',
  verifiedAgainstObservedEnergyDelta: true,
  cost: {
    MOVE: 0, WAIT: 0, RETREAT: 0, COLLECT: 0,
    TRANSFER: 1, PROTECT: 1,
    RESTORE: 2, REINFORCE: 2, REPAIR: 2, ATTACK: 2,
    BYPASS: 3, BUILD: 4,
  },
  unknownCostPolicy: 'ABSTAIN_RATHER_THAN_ASSUME_ZERO',
});

const byActionId = (a, b) => (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0);

function proposal({ producerId, action, confidence, provenance, requiredCapabilities, epistemicBasis, objective, reason = null }) {
  return deepFreeze({
    proposalId: sha256({ producerId, actionId: action?.actionId ?? null, provenance }),
    producerId,
    status: action === null ? ProposalStatus.ABSTAIN : ProposalStatus.PROPOSED,
    action: action === null ? null : { actionId: action.actionId, actionType: action.actionType, targetEntityId: action.targetEntityId ?? null },
    confidence: action === null ? 0 : confidence,
    provenance,
    requiredCapabilities: [...requiredCapabilities].sort(),
    decisionTime: true,
    epistemicBasis,
    objective,
    abstainReason: action === null ? reason : null,
    usesSimulator: false,
    usesMultiStepRollout: false,
    usesV2B: false,
    usesFutureInformation: false,
  });
}

/* ------------------------------------------------------ observed structure */

/** Threat structure read from the OBSERVED canonical state only. */
export function observedThreatStructure(canonicalState) {
  const entities = canonicalState?.entities ?? [];
  const relationships = canonicalState?.relationships ?? [];
  const threatenedBy = new Map();
  const supportedBy = new Map();
  const dependents = new Map();
  for (const entity of entities) { threatenedBy.set(entity.id, 0); supportedBy.set(entity.id, 0); dependents.set(entity.id, 0); }
  for (const relation of relationships) {
    if (relation.kind === 'threatens' && threatenedBy.has(relation.to)) threatenedBy.set(relation.to, threatenedBy.get(relation.to) + 1);
    if (relation.kind === 'supports' && supportedBy.has(relation.to)) supportedBy.set(relation.to, supportedBy.get(relation.to) + 1);
    if (relation.kind === 'depends' && dependents.has(relation.to)) dependents.set(relation.to, dependents.get(relation.to) + 1);
  }
  return {
    threatenedBy, supportedBy, dependents,
    criticalIds: new Set(entities.filter((entity) => entity.critical === true).map((entity) => entity.id)),
    unsupportedThreatened: new Set(entities
      .filter((entity) => (threatenedBy.get(entity.id) ?? 0) > 0 && (supportedBy.get(entity.id) ?? 0) === 0)
      .map((entity) => entity.id)),
  };
}

/* ---------------------------------------------------------------- policies */

/**
 * RESOURCE_PRESERVING — minimize declared resource cost.
 *
 * Deliberately a DIFFERENT objective from greedy: greedy maximizes immediate transition value,
 * this spends as little as possible. It is not a reward maximizer under another name.
 */
export function resourcePreservingProposal({ legalActions }) {
  const base = {
    producerId: 'RESOURCE_PRESERVING_V1',
    objective: 'MINIMIZE_DECLARED_RESOURCE_COST',
    provenance: 'legal action surface + declared action cost model',
    requiredCapabilities: [ProposalCapability.LEGAL_ACTION_SURFACE, ProposalCapability.ACTION_COST_MODEL],
    epistemicBasis: 'DERIVED_FROM_DECLARED_ACTION_SEMANTICS',
  };
  if (!Array.isArray(legalActions) || legalActions.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTIONS' });
  }
  const priced = legalActions.map((action) => ({ action, cost: DECLARED_ACTION_COST_MODEL.cost[action.actionType] }));
  if (priced.some((entry) => typeof entry.cost !== 'number')) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'ACTION_COST_UNKNOWN_FOR_A_LEGAL_ACTION_TYPE' });
  }
  const cheapest = [...priced].sort((a, b) => a.cost - b.cost || byActionId(a.action, b.action))[0];
  const costs = priced.map((entry) => entry.cost);
  const distinct = new Set(costs).size;
  return proposal({
    ...base,
    action: cheapest.action,
    // Confidence reflects how much the cost model actually discriminates, not correctness.
    confidence: distinct <= 1 ? 0 : Math.min(1, (Math.max(...costs) - Math.min(...costs)) / 4),
  });
}

/**
 * OBJECTIVE_TARGETING — act on an objective-bearing entity.
 *
 * Abstains when no legal action touches a critical entity, rather than falling through to an
 * arbitrary action, so its proposals are always justified by observed objective structure.
 */
export function objectiveTargetingProposal({ observation, legalActions }) {
  const base = {
    producerId: 'OBJECTIVE_TARGETING_V1',
    objective: 'ADVANCE_OBSERVED_OBJECTIVE_STRUCTURE',
    provenance: 'observed canonical state (critical entities) + legal action targets',
    requiredCapabilities: [ProposalCapability.OBSERVATION_SCHEMA_BOUND, ProposalCapability.LEGAL_ACTION_SURFACE],
    epistemicBasis: 'OBSERVED',
  };
  if (!Array.isArray(legalActions) || legalActions.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTIONS' });
  }
  const structure = observedThreatStructure(observation?.metadata?.canonicalState);
  const targeting = legalActions.filter((action) => action.targetEntityId !== null && structure.criticalIds.has(action.targetEntityId));
  if (targeting.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTION_TARGETS_AN_OBSERVED_CRITICAL_ENTITY' });
  }
  const preference = ['REPAIR', 'RESTORE', 'REINFORCE', 'PROTECT', 'TRANSFER', 'BUILD', 'SUBSTITUTE', 'COLLECT', 'BYPASS', 'ATTACK', 'MOVE', 'RETREAT', 'WAIT'];
  const rank = (action) => { const index = preference.indexOf(action.actionType); return index === -1 ? preference.length : index; };
  const chosen = [...targeting].sort((a, b) => rank(a) - rank(b) || byActionId(a, b))[0];
  return proposal({ ...base, action: chosen, confidence: Math.min(1, targeting.length / legalActions.length) });
}

/**
 * THREAT_COVERING — cover an observed threatened entity that has no support.
 *
 * Objective is harm avoidance on observed structure, not value maximization.
 */
export function threatCoveringProposal({ observation, legalActions }) {
  const base = {
    producerId: 'THREAT_COVERING_V1',
    objective: 'COVER_OBSERVED_UNSUPPORTED_THREAT',
    provenance: 'observed canonical state (threatens/supports relations) + legal action targets',
    requiredCapabilities: [ProposalCapability.OBSERVATION_SCHEMA_BOUND, ProposalCapability.LEGAL_ACTION_SURFACE],
    epistemicBasis: 'OBSERVED',
  };
  if (!Array.isArray(legalActions) || legalActions.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTIONS' });
  }
  const structure = observedThreatStructure(observation?.metadata?.canonicalState);
  const covering = legalActions.filter((action) => action.targetEntityId !== null && structure.unsupportedThreatened.has(action.targetEntityId));
  if (covering.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTION_COVERS_AN_OBSERVED_UNSUPPORTED_THREAT' });
  }
  const preference = ['PROTECT', 'REINFORCE', 'RESTORE', 'REPAIR', 'SUBSTITUTE', 'ATTACK', 'TRANSFER', 'COLLECT', 'BYPASS', 'BUILD', 'MOVE', 'RETREAT', 'WAIT'];
  const rank = (action) => { const index = preference.indexOf(action.actionType); return index === -1 ? preference.length : index; };
  const chosen = [...covering].sort((a, b) => rank(a) - rank(b) || byActionId(a, b))[0];
  return proposal({ ...base, action: chosen, confidence: Math.min(1, covering.length / legalActions.length) });
}

/** RANDOM_LEGAL — deterministic control, seeded from the observed world digest. */
export function randomLegalProposal({ observation, legalActions }) {
  const base = {
    producerId: 'RANDOM_LEGAL_V1',
    objective: 'CONTROL_NO_OBJECTIVE',
    provenance: 'legal action surface + observed world digest as deterministic seed',
    requiredCapabilities: [ProposalCapability.LEGAL_ACTION_SURFACE, ProposalCapability.OBSERVATION_SCHEMA_BOUND],
    epistemicBasis: 'DERIVED',
  };
  if (!Array.isArray(legalActions) || legalActions.length === 0) {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_LEGAL_ACTIONS' });
  }
  const digest = observation?.metadata?.worldHash;
  if (typeof digest !== 'string') {
    return proposal({ ...base, action: null, confidence: 0, reason: 'NO_OBSERVED_DIGEST_FOR_DETERMINISTIC_SEED' });
  }
  const sorted = [...legalActions].sort(byActionId);
  const index = Number.parseInt(digest.slice(0, 8), 16) % sorted.length;
  return proposal({ ...base, action: sorted[index], confidence: 0 });
}

export const DEPLOYABLE_PROPOSAL_PRODUCERS = deepFreeze([
  { producerId: 'RESOURCE_PRESERVING_V1', objective: 'MINIMIZE_DECLARED_RESOURCE_COST', produce: resourcePreservingProposal },
  { producerId: 'OBJECTIVE_TARGETING_V1', objective: 'ADVANCE_OBSERVED_OBJECTIVE_STRUCTURE', produce: objectiveTargetingProposal },
  { producerId: 'THREAT_COVERING_V1', objective: 'COVER_OBSERVED_UNSUPPORTED_THREAT', produce: threatCoveringProposal },
  { producerId: 'RANDOM_LEGAL_V1', objective: 'CONTROL_NO_OBJECTIVE', produce: randomLegalProposal },
]);

export function proposeAll({ observation, legalActions }) {
  return deepFreeze(DEPLOYABLE_PROPOSAL_PRODUCERS.map((producer) => producer.produce({ observation, legalActions })));
}

export const DEPLOYABLE_ACTION_PROPOSAL_CONTRACT = deepFreeze({
  contractId: DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_ID,
  schemaVersion: DEPLOYABLE_ACTION_PROPOSAL_SCHEMA_VERSION,
  requiredProposalFields: ['proposalId', 'producerId', 'action', 'confidence', 'provenance',
    'requiredCapabilities', 'decisionTime', 'epistemicBasis'],
  missingProposalSemantics: 'ABSTAIN_NEVER_A_FABRICATED_ACTION',
  capabilities: Object.values(ProposalCapability).sort(),
  declaredActionCostModel: DECLARED_ACTION_COST_MODEL,
  producers: DEPLOYABLE_PROPOSAL_PRODUCERS.map((entry) => ({ producerId: entry.producerId, objective: entry.objective })),
  objectivesAreDistinct: true,
  prohibited: {
    simulator: true, multiStepRollout: true, v2b: true, futureInformation: true, sealedLabel: true,
  },
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, shadowOnly: true },
  routerTrainedInThisStage: false,
  thresholdsTunedInThisStage: false,
});

export const DEPLOYABLE_ACTION_PROPOSAL_CONTRACT_HASH = sha256(DEPLOYABLE_ACTION_PROPOSAL_CONTRACT);
