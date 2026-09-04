/* Sentinel Forge World — FORGE_REWARD_V2.
 *
 * A SUPERSEDING module. FORGE_REWARD_V1 is frozen and untouched: every Stage 3A
 * certification continues to reproduce byte-identically, and V2 is computed as a
 * pure function of (world before, world after, the V1 vector) rather than by
 * editing the kernel.
 *
 * WHY V2 EXISTS, AND WHY IT IS NOT TIE-BREAKING
 *
 * The Stage 3B tie taxonomy measured 416 tied cases and found 381 of them in one
 * class: branches that reach materially different worlds, are STILL different at
 * the end of the horizon, and carry identical accumulated reward.
 *
 * The cause is structural. V1 is a pure FLOW reward — it sums what happened along
 * the way and has no term for the value of the world it left behind. Two paths
 * with the same flow therefore score the same however differently they end. That
 * is not a missing tiebreaker; it is a missing dimension.
 *
 * V2 adds two POTENTIAL terms, each a difference Φ(after) − Φ(before) of a
 * function of world state:
 *
 *   futureObjectivePotential — how much closer the world now is to satisfying
 *     its objectives, counting reachability and not merely delivery.
 *   optionValue — how much room to act the world still has: live substitutes,
 *     redundant supply paths, surviving structure.
 *
 * Because both are differences of a potential, they TELESCOPE across a complete
 * trajectory: over a full episode to a terminal state their sum collapses to
 * Φ(end) − Φ(start), so they cannot reorder complete trajectories. They only
 * separate TRUNCATED horizons — which is exactly the case the taxonomy found and
 * exactly the case the counterfactual oracle scores. That is the argument for
 * their admissibility, and it is why they are potentials rather than free-standing
 * bonuses.
 *
 * The other components are V1's, renamed only where the brief's vocabulary is
 * clearer. Nothing was added to break a tie.
 */

import { deepFreeze } from '../core/determinism.js';
import { ForgeContractError } from './contract.js';
import { controlledActor, legalActions } from './kernel.js';

export const FORGE_REWARD_V2_VERSION = 'FORGE_REWARD_V2';

export const FORGE_REWARD_V2_COMPONENTS = deepFreeze([
  { id: 'immediateObjectiveProgress', sense: 'benefit', kind: 'flow', description: 'objective units satisfied by this transition' },
  { id: 'futureObjectivePotential', sense: 'benefit', kind: 'potential', description: 'change in how close the world is to satisfying its objectives, counting reachability' },
  { id: 'deliveredValue', sense: 'benefit', kind: 'flow', description: 'value actually delivered to objective-bearing nodes' },
  { id: 'restoredDependencyValue', sense: 'benefit', kind: 'flow', description: 'value of dependencies restored, bypassed or rebuilt' },
  { id: 'preservedValue', sense: 'benefit', kind: 'flow', description: 'value that would have been lost and was not' },
  { id: 'civilianSafety', sense: 'benefit', kind: 'flow', description: 'civilian health preserved' },
  { id: 'infrastructureHealth', sense: 'benefit', kind: 'flow', description: 'net infrastructure health change' },
  { id: 'optionValue', sense: 'benefit', kind: 'potential', description: 'change in the room the world leaves to act: live substitutes, redundant paths, surviving structure' },
  { id: 'riskExposure', sense: 'cost', kind: 'flow', description: 'risk the actor took on' },
  { id: 'resourceCost', sense: 'cost', kind: 'flow', description: 'resources and energy consumed' },
  { id: 'timeCost', sense: 'cost', kind: 'flow', description: 'ticks spent' },
  { id: 'terminalOutcome', sense: 'signed', kind: 'terminal', description: 'positive on objective completion, negative on terminal failure' },
]);

export const FORGE_REWARD_V2_COMPONENT_IDS = deepFreeze(FORGE_REWARD_V2_COMPONENTS.map((entry) => entry.id));

/* Integer weights. A weight change MUST create a new version id, for the same
 * reason it did in V1: a stored scalar is only interpretable against the weights
 * that produced it. */
export const FORGE_REWARD_V2_WEIGHTS = deepFreeze({
  immediateObjectiveProgress: 10,
  futureObjectivePotential: 4,
  deliveredValue: 4,
  restoredDependencyValue: 3,
  preservedValue: 3,
  civilianSafety: 6,
  infrastructureHealth: 2,
  optionValue: 2,
  riskExposure: -2,
  resourceCost: -1,
  timeCost: -1,
  terminalOutcome: 25,
});

export const FORGE_REWARD_V2_COST_COMPONENTS = deepFreeze(['riskExposure', 'resourceCost', 'timeCost']);

export function emptyRewardV2Vector() {
  const vector = {};
  for (const id of FORGE_REWARD_V2_COMPONENT_IDS) vector[id] = 0;
  return vector;
}

export function addRewardV2Vectors(a, b) {
  const sum = {};
  for (const id of FORGE_REWARD_V2_COMPONENT_IDS) sum[id] = (a[id] ?? 0) + (b[id] ?? 0);
  return sum;
}

export function scalarizeRewardV2(vector, version = FORGE_REWARD_V2_VERSION) {
  if (version !== FORGE_REWARD_V2_VERSION) {
    throw new ForgeContractError(`Unknown reward version: ${version}`, { known: FORGE_REWARD_V2_VERSION });
  }
  let total = 0;
  for (const id of FORGE_REWARD_V2_COMPONENT_IDS) total += (vector[id] ?? 0) * FORGE_REWARD_V2_WEIGHTS[id];
  return total;
}

/* ---------------------------------------------------------------------------
 * Potentials
 *
 * Both are integer functions of world state alone — no history, no action, no
 * randomness — so Φ(after) − Φ(before) is exactly reproducible and the telescoping
 * argument above holds.
 * ------------------------------------------------------------------------- */

const entityById = (world, id) => world.entities.find((entity) => entity.id === id) ?? null;

/**
 * How close the world is to satisfying its objectives.
 *
 * Counts three things a pure delivery count misses: the shortfall itself, whether
 * the material needed to close it is in hand or still lying on the ground, and
 * how far the actor is from the node it must deliver to. All three are real
 * properties of the world that V1's flow reward genuinely cannot see.
 */
export function objectivePotential(world) {
  let potential = 0;
  const actor = controlledActor(world);
  const carried = actor === null ? 0 : (actor.resources.material ?? 0);

  for (const objective of world.objectives) {
    const shortfall = Math.max(0, objective.requiredValue - objective.deliveredValue);
    potential -= shortfall * 2;
    if (shortfall === 0) continue;

    /* Material in hand is closer to delivered than material on the floor. */
    potential += Math.min(shortfall, carried);

    const target = entityById(world, objective.entityId);
    if (target !== null && actor !== null) {
      const distance = Math.abs(actor.position.x - target.position.x) + Math.abs(actor.position.y - target.position.y);
      potential -= distance;
    }
    /* An objective whose bearer has failed is further away than one whose bearer
     * is standing, even at identical delivered value. */
    if (target !== null && (!target.available || target.health <= 0)) potential -= 5;
  }
  return potential;
}

/**
 * How much room the world leaves to act.
 *
 * Redundancy that survives, substitutes still able to carry a dependency, and
 * unbroken structure. A branch that spends the last substitute and a branch that
 * keeps it can produce identical flow reward and leave very different worlds;
 * this is the term that notices.
 */
export function optionPotential(world) {
  let potential = 0;
  for (const entity of world.entities) {
    if (!entity.available || entity.health <= 0) continue;
    if (entity.type === 'SUBSTITUTE') potential += 4;
    else if (entity.type === 'INFRASTRUCTURE' || entity.type === 'REPAIR_TARGET') potential += 1;
    else if (entity.type === 'RESOURCE') potential += 2;
  }
  /* Redundant supply into an objective is worth more than the same edge count
   * spread across unrelated nodes. */
  const objectiveIds = new Set(world.objectives.map((objective) => objective.entityId));
  for (const relation of world.relations) {
    if ((relation.type === 'supplies' || relation.type === 'supports') && objectiveIds.has(relation.to)) {
      const source = entityById(world, relation.from);
      if (source !== null && source.available && source.health > 0) potential += 2;
    }
    if (relation.type === 'substitutes') {
      const substitute = entityById(world, relation.from);
      if (substitute !== null && substitute.available && substitute.health > 0) potential += 3;
    }
  }
  potential += (world.constraints.energy ?? 0);
  return potential;
}

/* ---------------------------------------------------------------------------
 * V2 transition reward
 * ------------------------------------------------------------------------- */

/**
 * Build the V2 vector for one transition.
 *
 * Every flow component is carried across from the V1 vector the frozen kernel
 * already produced; only the two potential terms and the restored-dependency term
 * are new. That keeps V2 auditable against V1 rather than being a second,
 * independent theory of the same transition.
 */
export function rewardV2For({ before, after, v1Vector, events = [], terminal = false, outcome = 'ONGOING' }) {
  const vector = emptyRewardV2Vector();

  vector.immediateObjectiveProgress = v1Vector.objectiveProgress ?? 0;
  vector.deliveredValue = v1Vector.deliveredValue ?? 0;
  vector.preservedValue = v1Vector.preservedValue ?? 0;
  vector.civilianSafety = v1Vector.civilianSafety ?? 0;
  vector.infrastructureHealth = v1Vector.infrastructureHealth ?? 0;
  vector.riskExposure = v1Vector.riskExposure ?? 0;
  vector.resourceCost = v1Vector.resourceCost ?? 0;
  vector.timeCost = v1Vector.timeCost ?? 0;

  /* Restoring or routing around a failed dependency is a distinct kind of good
   * from delivering value, and V1 folded both into preservedValue. */
  let restored = 0;
  for (const event of events) {
    if (event.type === 'RESTORED' || event.type === 'BYPASSED' || event.type === 'BUILT') {
      const id = event.id ?? event.via ?? null;
      const entity = id === null ? null : entityById(after, id);
      restored += entity === null ? 5 : Math.max(1, entity.value);
    }
  }
  vector.restoredDependencyValue = restored;

  vector.futureObjectivePotential = objectivePotential(after) - objectivePotential(before);
  vector.optionValue = optionPotential(after) - optionPotential(before);

  vector.terminalOutcome = terminal ? (outcome === 'SUCCESS' ? 1 : -1) : 0;

  return vector;
}

/** Both potentials, for reporting and for the telescoping test. */
export function potentialsOf(world) {
  return { objectivePotential: objectivePotential(world), optionPotential: optionPotential(world) };
}

/* Legal-action count is a diagnostic of option value, not a reward component:
 * rewarding it directly would pay an agent for standing where the menu is long. */
export function legalActionBreadth(world) {
  try { return legalActions(world).length; } catch { return 0; }
}
