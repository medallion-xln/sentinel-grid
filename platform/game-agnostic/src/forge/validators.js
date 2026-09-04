/* Sentinel Forge World — semantic validators and the admission gate.
 *
 * generate -> validate -> assert -> admit. A scenario that fails its own family's
 * claim is REJECTED, not quietly relabelled and not quietly kept.
 *
 * Two rules make this a gate rather than a decoration, and both are enforced by
 * a source scan in the certify script rather than left to good intentions:
 *
 *   1. NO VALIDATOR MAY CALL THE EXPERT IT VALIDATES FOR. A "cycle" validator
 *      that asked Nexus whether there was a cycle would be scoring the corpus with
 *      the thing the corpus is supposed to score. This file imports nothing from
 *      src/experts/, and the scan enforces that.
 *
 *   2. NO VALIDATOR MAY READ THE FAMILY LABEL to decide whether the claim holds.
 *      The label picks WHICH validator runs; it is never evidence.
 *
 * A validator that is too strict is exactly as damaging as a generator that is
 * too loose — Stage 2L.23 manufactured twenty-six false corpus defects that way
 * before catching itself — so each check below is the weakest one that still
 * establishes the family's claim, and each says in words what it is testing.
 */

import { sha256 } from '../core/determinism.js';
import { assertForge } from './contract.js';
import { evaluateCounterfactuals } from './counterfactual.js';
import { createWorld, isTerminal, legalActions } from './kernel.js';

export const FORGE_VALIDATOR_VERSION = 'forge-semantic-validators-v1';

/* Oracle's own minimum. Kept as a local literal on purpose: importing it from the
 * expert would make this file depend on the thing it is meant to be independent
 * of, and the value is part of the CLAIM, not of the head. */
export const ORACLE_SUFFICIENT_FRAMES = 3;
export const PERSISTENCE_THRESHOLD_PERCENT = 72;   // Stage 2L.22 semantic constant.
export const REVERSAL_MARGIN = 1;
export const REGIME_SLOPE_RATIO = 2;
export const VOLATILITY_RATIO = 2;

const ok = (check, detail = {}) => ({ check, holds: true, ...detail });
const fail = (check, why, detail = {}) => ({ check, holds: false, why, ...detail });

/* ---------------------------------------------------------------------------
 * Graph primitives — plain algorithms over the produced relation list.
 * ------------------------------------------------------------------------- */

function dependsAdjacency(world) {
  const map = new Map(world.entities.map((entity) => [entity.id, []]));
  for (const relation of world.relations) {
    if (relation.type === 'dependsOn') map.get(relation.from).push(relation.to);
  }
  for (const list of map.values()) list.sort();
  return map;
}

function hasCycle(adjacency) {
  const state = new Map([...adjacency.keys()].map((id) => [id, 0]));
  const stack = [];
  const visit = (node) => {
    state.set(node, 1);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      if (state.get(next) === 1) return true;
      if (state.get(next) === 0 && visit(next)) return true;
    }
    stack.pop();
    state.set(node, 2);
    return false;
  };
  for (const node of [...adjacency.keys()].sort()) {
    if (state.get(node) === 0 && visit(node)) return true;
  }
  return false;
}

function longestChainFrom(adjacency, start) {
  /* Longest simple path in the dependsOn DAG from `start`. Bounded by node count,
   * and cycle-safe via the visited set. */
  let best = 0;
  const walk = (node, depth, seen) => {
    if (depth > best) best = depth;
    for (const next of adjacency.get(node) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next, depth + 1, seen);
      seen.delete(next);
    }
  };
  walk(start, 0, new Set([start]));
  return best;
}

function reachableFrom(adjacency, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  seen.delete(start);
  return seen;
}

function supportsInto(world, id) {
  return world.relations.filter((relation) => relation.type === 'supports' && relation.to === id);
}

function entityById(world, id) {
  return world.entities.find((entity) => entity.id === id) ?? null;
}

/* ---------------------------------------------------------------------------
 * Series primitives
 * ------------------------------------------------------------------------- */

function firstDifferences(series) {
  const deltas = [];
  for (let i = 1; i < series.length; i += 1) deltas.push(series[i] - series[i - 1]);
  return deltas;
}

function meanSlopeTimes100(series) {
  if (series.length < 2) return 0;
  return Math.round(((series[series.length - 1] - series[0]) * 100) / (series.length - 1));
}

function totalVariation(series) {
  return firstDifferences(series).reduce((total, delta) => total + Math.abs(delta), 0);
}

/* ---------------------------------------------------------------------------
 * Per-family validators.
 *
 * Each returns a list of named checks. A scenario is admitted only if every check
 * holds — and the check names travel with the record, so a rejection says which
 * property was missing rather than only that something was.
 * ------------------------------------------------------------------------- */

const VALIDATORS = {
  'nexus/dependency_chain': (world, config) => {
    const adjacency = dependsAdjacency(world);
    const depth = Math.max(0, ...[...adjacency.keys()].map((id) => longestChainFrom(adjacency, id)));
    return [depth >= Math.min(2, config.curriculumParameters.graphDepth + 1)
      ? ok('CHAIN_DEPTH', { depth })
      : fail('CHAIN_DEPTH', 'no dependsOn chain of the declared depth exists', { depth })];
  },

  'nexus/dead_substitute': (world) => {
    const checks = [];
    const substituteEdges = world.relations.filter((relation) => relation.type === 'substitutes');
    checks.push(substituteEdges.length > 0
      ? ok('SUBSTITUTE_EDGE_PRESENT', { count: substituteEdges.length })
      : fail('SUBSTITUTE_EDGE_PRESENT', 'no substitutes edge exists'));
    /* The load-bearing check. "Dead" means the substitute CANNOT carry the
     * dependency now — unavailable or destroyed — and the node it would stand in
     * for must itself actually have failed. A scenario where the substitute is
     * merely absent is a different family. */
    const dead = substituteEdges.filter((relation) => {
      const substitute = entityById(world, relation.from);
      const failed = entityById(world, relation.to);
      if (substitute === null || failed === null) return false;
      const substituteCannotCarry = !substitute.available || substitute.health <= 0;
      const targetHasFailed = !failed.available || failed.health <= 0;
      return substituteCannotCarry && targetHasFailed;
    });
    checks.push(dead.length > 0
      ? ok('SUBSTITUTE_CANNOT_CARRY', { count: dead.length })
      : fail('SUBSTITUTE_CANNOT_CARRY', 'every substitute is able to carry its dependency, so nothing is dead'));
    /* And the consequence: the simulator must not offer BYPASS, or the family's
     * whole difficulty evaporates. This checks the ACTION SET, which is the
     * observable form of the claim. */
    const bypassOffered = legalActions(world).some((action) => action.actionType === 'BYPASS');
    checks.push(!bypassOffered
      ? ok('BYPASS_NOT_AVAILABLE')
      : fail('BYPASS_NOT_AVAILABLE', 'a bypass is offered, so a live substitute exists'));
    return checks;
  },

  'nexus/live_substitute': (world) => {
    const substituteEdges = world.relations.filter((relation) => relation.type === 'substitutes');
    const live = substituteEdges.filter((relation) => {
      const substitute = entityById(world, relation.from);
      const failed = entityById(world, relation.to);
      return substitute !== null && failed !== null
        && substitute.available && substitute.health > 0
        && (!failed.available || failed.health <= 0);
    });
    return [
      live.length > 0
        ? ok('SUBSTITUTE_CAN_CARRY', { count: live.length })
        : fail('SUBSTITUTE_CAN_CARRY', 'no substitute is both live and standing in for a failed node'),
    ];
  },

  'nexus/redundant_infrastructure': (world) => {
    const objective = world.objectives[0].entityId;
    const feeders = world.relations.filter(
      (relation) => (relation.type === 'supplies' || relation.type === 'supports') && relation.to === objective,
    );
    const distinct = new Set(feeders.map((relation) => relation.from));
    return [distinct.size >= 2
      ? ok('INDEPENDENT_PATHS', { paths: distinct.size })
      : fail('INDEPENDENT_PATHS', 'fewer than two independent providers reach the objective', { paths: distinct.size })];
  },

  'nexus/single_bottleneck': (world) => {
    const adjacency = dependsAdjacency(world);
    const objective = world.objectives[0].entityId;
    const baseline = reachableFrom(adjacency, objective);
    if (baseline.size === 0) return [fail('BOTTLENECK_EXISTS', 'the objective depends on nothing')];
    /* A true bottleneck: removing it disconnects strictly more than half of what
     * the objective can otherwise reach, and it is the ONLY node that does so. */
    const cutters = [];
    for (const candidate of [...baseline].sort()) {
      const reduced = new Map([...adjacency].map(([id, list]) => [id, list.filter((next) => next !== candidate)]));
      reduced.set(candidate, []);
      const remaining = reachableFrom(reduced, objective);
      remaining.delete(candidate);
      if (remaining.size * 2 < baseline.size) cutters.push(candidate);
    }
    return [cutters.length === 1
      ? ok('BOTTLENECK_EXISTS', { bottleneck: cutters[0], reachable: baseline.size })
      : fail('BOTTLENECK_EXISTS', `expected exactly one cut node, found ${cutters.length}`, { cutters })];
  },

  'nexus/multi_hop_dependency': (world) => {
    const adjacency = dependsAdjacency(world);
    const objective = world.objectives[0].entityId;
    const depth = longestChainFrom(adjacency, objective);
    return [depth >= 3
      ? ok('MULTI_HOP', { depth })
      : fail('MULTI_HOP', 'the objective is not at least three dependency hops deep', { depth })];
  },

  'nexus/cycle': (world) => {
    const adjacency = dependsAdjacency(world);
    return [hasCycle(adjacency)
      ? ok('CYCLE_PRESENT')
      : fail('CYCLE_PRESENT', 'the dependsOn graph is acyclic')];
  },

  'nexus/distributed_value': (world) => {
    const valued = world.entities.filter((entity) => entity.value > 0);
    const total = valued.reduce((sum, entity) => sum + entity.value, 0);
    const largest = valued.reduce((max, entity) => (entity.value > max ? entity.value : max), 0);
    /* Distributed means no single node holds a majority of the value. */
    return [
      valued.length >= 3
        ? ok('VALUE_BEARER_COUNT', { count: valued.length })
        : fail('VALUE_BEARER_COUNT', 'fewer than three nodes carry value', { count: valued.length }),
      total > 0 && largest * 2 <= total
        ? ok('VALUE_NOT_CONCENTRATED', { largest, total })
        : fail('VALUE_NOT_CONCENTRATED', 'one node holds a majority of all value', { largest, total }),
    ];
  },

  'nexus/conflicting_objectives': (world) => {
    const checks = [world.objectives.length >= 2
      ? ok('MULTIPLE_OBJECTIVES', { count: world.objectives.length })
      : fail('MULTIPLE_OBJECTIVES', 'only one objective exists')];
    const requiredBy = new Map();
    for (const relation of world.relations.filter((entry) => entry.type === 'requires')) {
      requiredBy.set(relation.to, (requiredBy.get(relation.to) ?? 0) + 1);
    }
    const contested = [...requiredBy.entries()].filter(([, count]) => count >= 2);
    checks.push(contested.length > 0
      ? ok('SHARED_SCARCE_RESOURCE', { contested: contested.map(([id]) => id) })
      : fail('SHARED_SCARCE_RESOURCE', 'no resource is required by more than one objective'));
    return checks;
  },

  'oracle/monotonic_trend': (world) => {
    const series = world.channels.primary;
    const deltas = firstDifferences(series);
    const allUp = deltas.every((delta) => delta > 0);
    const allDown = deltas.every((delta) => delta < 0);
    return [
      series.length >= ORACLE_SUFFICIENT_FRAMES
        ? ok('SUFFICIENT_FRAMES', { frames: series.length })
        : fail('SUFFICIENT_FRAMES', 'too few frames to establish a trend', { frames: series.length }),
      allUp || allDown
        ? ok('STRICTLY_MONOTONE', { direction: allUp ? 'UP' : 'DOWN' })
        : fail('STRICTLY_MONOTONE', 'the series changes direction somewhere in the window'),
    ];
  },

  'oracle/reversal': (world) => {
    const series = world.channels.primary;
    /* Search EVERY split, not only the midpoint. Testing the midpoint alone is
     * exactly the over-strict rule that manufactured nine false defects in Stage
     * 2L.23: a real reversal at frame 3 of 10 is invisible to a midpoint test. */
    let best = null;
    for (let split = 2; split <= series.length - 2; split += 1) {
      const before = meanSlopeTimes100(series.slice(0, split + 1));
      const after = meanSlopeTimes100(series.slice(split));
      const opposed = (before > 0 && after < 0) || (before < 0 && after > 0);
      const margin = Math.min(Math.abs(before), Math.abs(after));
      if (opposed && (best === null || margin > best.margin)) best = { split, before, after, margin };
    }
    return [best !== null && best.margin >= REVERSAL_MARGIN * 100
      ? ok('SIGN_CHANGE_WITH_MARGIN', best)
      : fail('SIGN_CHANGE_WITH_MARGIN', 'no split produces opposed slopes clearing the margin', { best })];
  },

  'oracle/regime_change': (world) => {
    const series = world.channels.primary;
    let best = null;
    for (let split = 2; split <= series.length - 2; split += 1) {
      const before = Math.abs(meanSlopeTimes100(series.slice(0, split + 1)));
      const after = Math.abs(meanSlopeTimes100(series.slice(split)));
      const low = Math.min(before, after);
      const high = Math.max(before, after);
      const ratio = low === 0 ? (high > 0 ? Infinity : 0) : high / low;
      if (best === null || ratio > best.ratio) best = { split, before, after, ratio };
    }
    return [best !== null && best.ratio >= REGIME_SLOPE_RATIO
      ? ok('SLOPE_REGIME_SHIFT', best)
      : fail('SLOPE_REGIME_SHIFT', 'no split produces materially different slopes', { best })];
  },

  'oracle/volatility_shift': (world) => {
    const series = world.channels.primary;
    const half = Math.floor(series.length / 2);
    const early = totalVariation(series.slice(0, half + 1));
    const late = totalVariation(series.slice(half));
    return [late >= early * VOLATILITY_RATIO && late > 0
      ? ok('VOLATILITY_INCREASED', { early, late })
      : fail('VOLATILITY_INCREASED', 'late-window variation does not materially exceed early-window variation', { early, late })];
  },

  'oracle/cycle_temporal': (world) => {
    const series = world.channels.primary;
    const deltas = firstDifferences(series);
    /* At least one full oscillation means at least two direction changes. */
    let changes = 0;
    let previous = 0;
    for (const delta of deltas) {
      const sign = Math.sign(delta);
      if (sign !== 0 && previous !== 0 && sign !== previous) changes += 1;
      if (sign !== 0) previous = sign;
    }
    return [changes >= 2
      ? ok('FULL_OSCILLATION', { directionChanges: changes })
      : fail('FULL_OSCILLATION', 'fewer than two direction changes, so no complete cycle', { directionChanges: changes })];
  },

  'oracle/persistence': (world) => {
    const series = world.channels.primary;
    const deltas = firstDifferences(series).filter((delta) => delta !== 0);
    if (deltas.length === 0) return [fail('PERSISTENT_DIRECTION', 'the series never moves')];
    const up = deltas.filter((delta) => delta > 0).length;
    const consistency = Math.round((Math.max(up, deltas.length - up) * 100) / deltas.length);
    return [consistency >= PERSISTENCE_THRESHOLD_PERCENT
      ? ok('PERSISTENT_DIRECTION', { consistency })
      : fail('PERSISTENT_DIRECTION', 'direction consistency is below the persistence threshold', { consistency })];
  },

  'oracle/threshold_crossing': (world, config) => {
    const series = world.channels.primary;
    const last = series[series.length - 1];
    const threshold = config.thresholdValue ?? last + 1;
    const slope = meanSlopeTimes100(series);
    /* The corrected Stage 2L.20 rule. The series must NOT have crossed yet, and
     * the trend must project it across. Requiring the crossing INSIDE the window —
     * the inverted form found in an earlier corpus — guarantees the series has
     * already crossed and makes the label false by construction. */
    return [
      last < threshold
        ? ok('NOT_YET_CROSSED', { last, threshold })
        : fail('NOT_YET_CROSSED', 'the series has already crossed the threshold', { last, threshold }),
      slope > 0
        ? ok('PROJECTS_ACROSS', { slope, threshold })
        : fail('PROJECTS_ACROSS', 'the trend does not project across the threshold', { slope }),
    ];
  },

  'oracle/insufficient_history': (world) => {
    const frames = world.channels.primary.length;
    return [frames < ORACLE_SUFFICIENT_FRAMES
      ? ok('BELOW_SUFFICIENCY', { frames, required: ORACLE_SUFFICIENT_FRAMES })
      : fail('BELOW_SUFFICIENCY', 'enough frames exist for the question to be answerable', { frames })];
  },

  'archimedes/repair_network': (world) => {
    const damaged = world.entities.filter((entity) => entity.health > 0 && entity.health < 100 && entity.faction !== 'hostile');
    return [damaged.length >= 2
      ? ok('MULTIPLE_REPAIRABLE', { count: damaged.length })
      : fail('MULTIPLE_REPAIRABLE', 'fewer than two repairable nodes exist', { count: damaged.length })];
  },

  'archimedes/material_shortage': (world) => {
    const supply = world.entities.reduce((total, entity) => total + (entity.resources.material ?? 0) + (entity.type === 'RESOURCE' && entity.available ? entity.value : 0), 0);
    const demand = world.entities.reduce((total, entity) => total + (entity.flags.demand ?? 0), 0)
      + world.objectives.reduce((total, objective) => total + objective.requiredValue - objective.deliveredValue, 0);
    return [demand > supply
      ? ok('DEMAND_EXCEEDS_SUPPLY', { supply, demand })
      : fail('DEMAND_EXCEEDS_SUPPLY', 'available material meets or exceeds demand, so nothing is scarce', { supply, demand })];
  },

  'archimedes/load_balancing': (world) => {
    const objective = world.objectives[0].entityId;
    const bearers = supportsInto(world, objective).map((relation) => entityById(world, relation.from)).filter(Boolean);
    if (bearers.length < 2) return [fail('PARALLEL_BEARERS', 'fewer than two supporting nodes', { count: bearers.length })];
    const loads = bearers.map((entity) => entity.value).sort((a, b) => a - b);
    const uneven = loads[loads.length - 1] >= loads[0] * 2 && loads[loads.length - 1] > loads[0];
    return [
      ok('PARALLEL_BEARERS', { count: bearers.length }),
      uneven ? ok('LOAD_UNEVEN', { loads }) : fail('LOAD_UNEVEN', 'load is already balanced across bearers', { loads }),
    ];
  },

  'archimedes/damaged_infrastructure': (world) => {
    const below = world.entities.filter(
      (entity) => (entity.type === 'INFRASTRUCTURE' || entity.type === 'REPAIR_TARGET') && entity.health > 0 && entity.health < 40,
    );
    return [below.length >= 1
      ? ok('BELOW_DAMAGE_THRESHOLD', { count: below.length })
      : fail('BELOW_DAMAGE_THRESHOLD', 'no structural node sits below the damage threshold', { count: below.length })];
  },

  'archimedes/construction_sequencing': (world) => {
    const planned = new Set(world.entities.filter((entity) => entity.flags.planned === true).map((entity) => entity.id));
    const ordered = world.relations.some(
      (relation) => relation.type === 'dependsOn' && planned.has(relation.from) && planned.has(relation.to),
    );
    return [
      planned.size >= 2 ? ok('PLANNED_NODES', { count: planned.size }) : fail('PLANNED_NODES', 'fewer than two planned nodes', { count: planned.size }),
      ordered ? ok('SEQUENCE_CONSTRAINT') : fail('SEQUENCE_CONSTRAINT', 'no planned node depends on another planned node'),
    ];
  },

  'archimedes/redundant_structural_paths': (world) => {
    const objective = world.objectives[0].entityId;
    const bearers = supportsInto(world, objective);
    return [bearers.length >= 2
      ? ok('REDUNDANT_SUPPORTS', { count: bearers.length })
      : fail('REDUNDANT_SUPPORTS', 'fewer than two supports edges bear the objective', { count: bearers.length })];
  },

  'prime/mixed_expert_problem': (world) => {
    const relational = world.relations.filter((relation) => relation.type === 'dependsOn').length > 0;
    const temporal = (world.channels.primary?.length ?? 0) >= ORACLE_SUFFICIENT_FRAMES;
    return [
      relational ? ok('RELATIONAL_STRUCTURE_PRESENT') : fail('RELATIONAL_STRUCTURE_PRESENT', 'no dependsOn structure to reason about'),
      temporal ? ok('TEMPORAL_SIGNAL_PRESENT') : fail('TEMPORAL_SIGNAL_PRESENT', 'no readable temporal signal'),
    ];
  },

  'prime/resource_constrained_planning': (world) => {
    /* The claim is that energy CANNOT cover every useful action. Measured against
     * the produced world's own action costs, not asserted from the level. */
    const energy = world.constraints.energy ?? 0;
    const repairable = world.entities.filter((entity) => entity.health > 0 && entity.health < 100 && entity.faction !== 'hostile').length;
    const cost = repairable * 2;
    return [cost > energy
      ? ok('ENERGY_INSUFFICIENT', { energy, cost, repairable })
      : fail('ENERGY_INSUFFICIENT', 'energy covers every useful action, so nothing is constrained', { energy, cost })];
  },

  'prime/multi_objective_intervention': (world) => {
    const open = world.objectives.filter((objective) => objective.deliveredValue < objective.requiredValue);
    return [open.length >= 2
      ? ok('MULTIPLE_OPEN_OBJECTIVES', { count: open.length })
      : fail('MULTIPLE_OPEN_OBJECTIVES', 'fewer than two objectives are open', { count: open.length })];
  },

  'prime/adversarial_choice': (world) => {
    const objectiveIds = new Set(world.objectives.map((objective) => objective.entityId));
    const attacking = world.relations.filter(
      (relation) => relation.type === 'attacks' && objectiveIds.has(relation.to)
        && (entityById(world, relation.from)?.health ?? 0) > 0,
    );
    return [attacking.length > 0
      ? ok('OBJECTIVE_UNDER_ATTACK', { count: attacking.length })
      : fail('OBJECTIVE_UNDER_ATTACK', 'no live hostile is degrading an objective-bearing node')];
  },

  'prime/long_horizon_tradeoff': (world) => {
    /* The only validator that runs the ORACLE, and it is the counterfactual
     * oracle — the simulator's own exact branching — not an expert. The claim IS
     * about utilities, so it can only be established by computing them: the
     * immediate-best action must differ from the horizon-best action. */
    const shallow = evaluateCounterfactuals(world, { horizon: 0 });
    const deep = evaluateCounterfactuals(world, { horizon: 4 });
    const differs = shallow.optimalActionKey !== null && deep.optimalActionKey !== null
      && shallow.optimalActionKey !== deep.optimalActionKey;
    return [
      deep.branchCount >= 2 ? ok('CHOICE_EXISTS', { branches: deep.branchCount }) : fail('CHOICE_EXISTS', 'fewer than two legal actions'),
      differs
        ? ok('HORIZON_CHANGES_OPTIMUM', { shallow: shallow.optimalActionKey, deep: deep.optimalActionKey })
        : fail('HORIZON_CHANGES_OPTIMUM', 'the immediate-best action is already the horizon-best action, so there is no tradeoff'),
    ];
  },
};

export const FORGE_VALIDATED_FAMILIES = Object.freeze(Object.keys(VALIDATORS).sort());

/* ---------------------------------------------------------------------------
 * The gate
 * ------------------------------------------------------------------------- */

export function validateScenario(world, config) {
  const validator = VALIDATORS[config.family];
  assertForge(validator !== undefined, 'No semantic validator is declared for this family', { family: config.family });
  const checks = validator(world, config);
  const failed = checks.filter((check) => !check.holds);
  return {
    validatorVersion: FORGE_VALIDATOR_VERSION,
    family: config.family,
    level: config.level,
    checks,
    checkCount: checks.length,
    valid: failed.length === 0,
    failedChecks: failed.map((check) => check.check),
    rejectionReasons: failed.map((check) => `${check.check}: ${check.why}`),
  };
}

/**
 * generate -> validate -> assert -> admit.
 *
 * `admitted` is false for anything that fails, and the reason travels with it.
 * Callers may not admit a case by any other route: there is no second entry point
 * that skips the validator.
 */
export function admitScenario({ config, generate }) {
  const world = generate(config);
  const validation = validateScenario(world, config);
  const usable = !isTerminal(world) && legalActions(world).length >= 2;
  const checks = [...validation.checks];
  if (!usable) {
    checks.push(fail('DECIDABLE', 'the world is terminal or offers fewer than two legal actions, so no decision exists'));
  }
  const valid = validation.valid && usable;
  return {
    admitted: valid,
    world: valid ? world : null,
    validation: { ...validation, checks, valid, decidable: usable },
    rejectionReasons: valid ? [] : [
      ...validation.rejectionReasons,
      ...(usable ? [] : ['DECIDABLE: the world is terminal or offers fewer than two legal actions']),
    ],
  };
}

/** Convenience wrapper binding the gate to the kernel's constructor. */
export function admitGeneratedScenario(config) {
  return admitScenario({ config, generate: (entry) => createWorld(entry.scenarioSeed, entry) });
}

export function admissionDigest(results) {
  return sha256(results.map((entry) => [entry.validation.family, entry.validation.level, entry.admitted, entry.validation.failedChecks]));
}
