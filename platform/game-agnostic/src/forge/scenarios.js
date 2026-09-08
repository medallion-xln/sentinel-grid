/* Sentinel Forge World — scenario families and curriculum.
 *
 * 28 families across the four Sentinel decision surfaces, each with six
 * difficulty levels, generated deterministically from (family, level, seed).
 *
 * A generator declaration is NOT ground truth. That is the whole lesson of Stage
 * 2L.23 — three separate corpus defects there were all one mistake, a family NAME
 * treated as evidence that the produced case had the named property. So nothing
 * in this file is trusted: every generated scenario goes to an independent
 * validator in validators.js before it may enter a dataset, and the validators
 * read the produced world rather than the label attached to it.
 */

import { createSeededRandom, deriveSeed, randomInt } from '../core/determinism.js';
import { FORGE_ENERGY_START } from './kernel.js';
import { assertForge } from './contract.js';

export const FORGE_CURRICULUM_VERSION = 'FORGE_CURRICULUM_V1';
export const FORGE_SCENARIO_VERSION = 'forge-scenarios-v1';

export const FORGE_CURRICULUM_LEVELS = Object.freeze([
  { level: 0, id: 'L0', name: 'trivial' },
  { level: 1, id: 'L1', name: 'simple' },
  { level: 2, id: 'L2', name: 'moderate' },
  { level: 3, id: 'L3', name: 'difficult' },
  { level: 4, id: 'L4', name: 'adversarial' },
  { level: 5, id: 'L5', name: 'compositional' },
]);

/* Difficulty knobs. Every one is a pure function of the level, so a case's
 * difficulty is reproducible from its label rather than from how it happened to
 * be generated. */
export function curriculumParameters(level) {
  assertForge(Number.isInteger(level) && level >= 0 && level <= 5, 'Curriculum level must be 0..5', { level });
  return {
    level,
    entityCount: 4 + level * 2,
    graphDepth: 1 + level,
    relationCount: 2 + level * 2,
    temporalHorizon: 6 + level * 3,
    hazardDensity: level,
    hostileCount: level <= 1 ? 0 : level - 1,
    resourceScarcity: level,
    conflictingObjectives: level >= 4 ? 2 : 1,
    gridSize: 7 + level,
    maxTicks: 8 + level * 2,
    energy: FORGE_ENERGY_START - level * 2,
  };
}

export const FORGE_SCENARIO_FAMILIES = Object.freeze([
  // ---- NEXUS: relational structure -------------------------------------
  { id: 'nexus/dependency_chain', surface: 'NEXUS', claim: 'a linear dependsOn chain of at least the declared depth exists' },
  { id: 'nexus/dead_substitute', surface: 'NEXUS', claim: 'a failed dependency target has a substitute that cannot currently carry it' },
  { id: 'nexus/live_substitute', surface: 'NEXUS', claim: 'a failed dependency target has a substitute that can carry it now' },
  { id: 'nexus/redundant_infrastructure', surface: 'NEXUS', claim: 'at least two independent paths reach the objective node' },
  { id: 'nexus/single_bottleneck', surface: 'NEXUS', claim: 'exactly one node lies on every path to the objective' },
  { id: 'nexus/multi_hop_dependency', surface: 'NEXUS', claim: 'the objective depends on a node at least three hops away' },
  { id: 'nexus/cycle', surface: 'NEXUS', claim: 'the dependsOn graph contains a genuine cycle' },
  { id: 'nexus/distributed_value', surface: 'NEXUS', claim: 'value is spread across many nodes rather than concentrated' },
  { id: 'nexus/conflicting_objectives', surface: 'NEXUS', claim: 'two objectives compete for the same limited resource' },
  // ---- ORACLE: temporal structure ---------------------------------------
  { id: 'oracle/monotonic_trend', surface: 'ORACLE', claim: 'the driving channel is strictly monotone across the window' },
  { id: 'oracle/reversal', surface: 'ORACLE', claim: 'the channel slope genuinely changes sign with a margin' },
  { id: 'oracle/regime_change', surface: 'ORACLE', claim: 'the channel has two segments with materially different slopes' },
  { id: 'oracle/volatility_shift', surface: 'ORACLE', claim: 'second-half variation materially exceeds first-half variation' },
  { id: 'oracle/cycle_temporal', surface: 'ORACLE', claim: 'the channel completes at least one full oscillation' },
  { id: 'oracle/persistence', surface: 'ORACLE', claim: 'the direction of change is consistent above the persistence threshold' },
  { id: 'oracle/threshold_crossing', surface: 'ORACLE', claim: 'the last observed value is below the threshold and the trend projects across it' },
  { id: 'oracle/insufficient_history', surface: 'ORACLE', claim: 'fewer frames are available than the Oracle needs to answer' },
  // ---- ARCHIMEDES: structural repair ------------------------------------
  { id: 'archimedes/repair_network', surface: 'ARCHIMEDES', claim: 'multiple damaged nodes are reachable and repairable' },
  { id: 'archimedes/material_shortage', surface: 'ARCHIMEDES', claim: 'available material is strictly less than total demand' },
  { id: 'archimedes/load_balancing', surface: 'ARCHIMEDES', claim: 'load is unevenly distributed across parallel supporting nodes' },
  { id: 'archimedes/damaged_infrastructure', surface: 'ARCHIMEDES', claim: 'at least one structural node is below the damage threshold' },
  { id: 'archimedes/construction_sequencing', surface: 'ARCHIMEDES', claim: 'a planned node depends on another planned node' },
  { id: 'archimedes/redundant_structural_paths', surface: 'ARCHIMEDES', claim: 'at least two supports edges bear the same node' },
  // ---- PRIME: composed decision -----------------------------------------
  { id: 'prime/mixed_expert_problem', surface: 'PRIME', claim: 'the world carries both a relational structure and a temporal signal' },
  { id: 'prime/resource_constrained_planning', surface: 'PRIME', claim: 'energy is insufficient to take every useful action' },
  { id: 'prime/multi_objective_intervention', surface: 'PRIME', claim: 'more than one objective is open at once' },
  { id: 'prime/adversarial_choice', surface: 'PRIME', claim: 'a hostile actively degrades an objective-bearing node' },
  { id: 'prime/long_horizon_tradeoff', surface: 'PRIME', claim: 'the immediate-best action is not the horizon-best action' },
]);

export const FORGE_SCENARIO_FAMILY_IDS = Object.freeze(FORGE_SCENARIO_FAMILIES.map((entry) => entry.id));
export const FORGE_SCENARIO_SURFACES = Object.freeze([...new Set(FORGE_SCENARIO_FAMILIES.map((entry) => entry.surface))].sort());

/* ---------------------------------------------------------------------------
 * Generation primitives
 * ------------------------------------------------------------------------- */

function emptyGrid(size, hazardDensity, random) {
  const cells = new Array(size * size).fill(0);
  /* Walls on a fixed interior lattice, then hazards. Both seeded; neither reads
   * anything outside this function. */
  for (let index = 0; index < hazardDensity; index += 1) {
    const x = randomInt(random, 1, size - 1);
    const y = randomInt(random, 1, size - 1);
    cells[y * size + x] = 2;
  }
  for (let index = 0; index < Math.max(0, hazardDensity - 1); index += 1) {
    const x = randomInt(random, 1, size - 1);
    const y = randomInt(random, 1, size - 1);
    if (cells[y * size + x] === 0) cells[y * size + x] = 1;
  }
  return { width: size, height: size, cells };
}

function entity(id, type, x, y, overrides = {}) {
  return {
    id, type,
    position: { x, y },
    health: 100,
    available: true,
    value: 0,
    cost: 0,
    risk: 0,
    faction: type === 'HOSTILE' ? 'hostile' : type === 'ACTOR' ? 'sentinel' : 'neutral',
    flags: {},
    resources: {},
    ...overrides,
  };
}

/* Free cells in a fixed scan order. Deterministic placement without search. */
function freeCells(grid, taken) {
  const cells = [];
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.cells[y * grid.width + x] !== 0) continue;
      if (taken.has(`${x},${y}`)) continue;
      cells.push({ x, y });
    }
  }
  return cells;
}

/* ---------------------------------------------------------------------------
 * Temporal channel construction
 *
 * The Oracle families live here. Noise is expressed as a FRACTION of the shape
 * parameter, never as an independent magnitude — the Stage 2L.23 joint-sampling
 * law. Sampling slope and jitter independently is precisely how that arc
 * produced three families whose extremes contradicted their own labels.
 * ------------------------------------------------------------------------- */

function jitterOf(shapeMagnitude, level, random) {
  const fraction = level >= 4 ? 3 : level >= 2 ? 2 : 1;   // tenths of the shape
  const amplitude = Math.max(0, Math.floor((shapeMagnitude * fraction) / 10));
  return () => (amplitude === 0 ? 0 : randomInt(random, -amplitude, amplitude + 1));
}

function buildChannel(family, params, random) {
  const n = params.temporalHorizon;
  const slope = 3 + params.level;
  const jitter = jitterOf(slope, params.level, random);
  const base = 40;
  const series = [];

  switch (family) {
    case 'oracle/monotonic_trend':
      /* Jitter is bounded strictly below the slope so monotonicity survives every
       * level. A family that stops being monotone at L4 would be mislabelled at
       * L4, which is the defect this construction exists to make impossible. */
      for (let i = 0; i < n; i += 1) series.push(base + i * slope + Math.max(-slope + 1, Math.min(slope - 1, jitter())));
      break;
    case 'oracle/reversal': {
      const turn = Math.floor(n / 2);
      for (let i = 0; i < n; i += 1) {
        const value = i <= turn ? base + i * slope : base + turn * slope - (i - turn) * slope;
        series.push(value + jitter());
      }
      break;
    }
    case 'oracle/regime_change': {
      const turn = Math.floor(n / 2);
      for (let i = 0; i < n; i += 1) {
        const value = i <= turn ? base + i * slope : base + turn * slope + (i - turn) * slope * 4;
        series.push(value + jitter());
      }
      break;
    }
    case 'oracle/volatility_shift': {
      const half = Math.floor(n / 2);
      for (let i = 0; i < n; i += 1) {
        const amplitude = i < half ? 1 : 12 + params.level * 3;
        series.push(base + (i % 2 === 0 ? amplitude : -amplitude));
      }
      break;
    }
    case 'oracle/cycle_temporal': {
      const period = Math.max(4, Math.floor(n / 2));
      const amplitude = 15 + params.level * 2;
      for (let i = 0; i < n; i += 1) {
        const phase = i % period;
        const triangle = phase < period / 2 ? phase : period - phase;
        series.push(base + Math.round((triangle * amplitude * 2) / period));
      }
      break;
    }
    case 'oracle/persistence':
      for (let i = 0; i < n; i += 1) series.push(base + i * slope + Math.max(-slope + 1, Math.min(slope - 1, jitter())));
      break;
    case 'oracle/threshold_crossing':
      /* Rising, and finishing strictly BELOW the threshold with the crossing
       * projected ahead. Stage 2L.20 found the inverted form of this rule in an
       * earlier corpus: requiring the crossing inside the window guarantees the
       * series has already crossed, which makes the label false. */
      for (let i = 0; i < n; i += 1) series.push(base + i * slope);
      break;
    case 'oracle/insufficient_history':
      for (let i = 0; i < 2; i += 1) series.push(base + i * slope);
      break;
    default:
      /* Non-Oracle families still carry a signal so Oracle has something to read,
       * but nothing downstream claims a temporal property about them. */
      for (let i = 0; i < n; i += 1) series.push(base + i * (params.level + 1));
      break;
  }
  return series;
}

/* ---------------------------------------------------------------------------
 * Scenario generation
 * ------------------------------------------------------------------------- */

export function generateScenario({ family, level, seed }) {
  assertForge(FORGE_SCENARIO_FAMILY_IDS.includes(family), 'Unknown scenario family', { family });
  const params = curriculumParameters(level);
  const scenarioSeed = deriveSeed(seed, 'forge-scenario', family, String(level));
  const random = createSeededRandom(scenarioSeed);

  const grid = emptyGrid(params.gridSize, params.hazardDensity, random);
  const taken = new Set();
  const entities = [];
  const relations = [];
  const objectives = [];

  const place = (id, type, overrides = {}) => {
    const free = freeCells(grid, taken);
    assertForge(free.length > 0, 'Scenario grid has no free cell left', { family, level });
    const cell = free[randomInt(random, 0, free.length)];
    taken.add(`${cell.x},${cell.y}`);
    const created = entity(id, type, cell.x, cell.y, overrides);
    entities.push(created);
    return created;
  };
  /* Adjacent placement, used wherever the actor must be able to act on a node in
   * the first tick. Falls back to any free cell rather than failing the whole
   * scenario, and the validator will catch a case where that mattered. */
  const placeNear = (id, type, anchor, overrides = {}) => {
    const candidates = [
      { x: anchor.position.x + 1, y: anchor.position.y },
      { x: anchor.position.x - 1, y: anchor.position.y },
      { x: anchor.position.x, y: anchor.position.y + 1 },
      { x: anchor.position.x, y: anchor.position.y - 1 },
    ].filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < grid.width && cell.y < grid.height)
      .filter((cell) => grid.cells[cell.y * grid.width + cell.x] === 0)
      .filter((cell) => !taken.has(`${cell.x},${cell.y}`));
    if (candidates.length === 0) return place(id, type, overrides);
    const cell = candidates[0];
    taken.add(`${cell.x},${cell.y}`);
    const created = entity(id, type, cell.x, cell.y, overrides);
    entities.push(created);
    return created;
  };

  const actor = place('actor', 'ACTOR', { risk: 1, resources: { material: 0 } });
  const target = placeNear('target', 'CRITICAL_TARGET', actor, { value: 20, flags: { critical: true, acceptsMaterial: true } });
  objectives.push({ id: 'objective-primary', entityId: target.id, requiredValue: 10, deliveredValue: 0 });

  const surface = FORGE_SCENARIO_FAMILIES.find((entry) => entry.id === family).surface;

  switch (family) {
    case 'nexus/dependency_chain': {
      let previous = target;
      for (let depth = 0; depth < params.graphDepth + 1; depth += 1) {
        const node = place(`chain-${depth}`, 'INFRASTRUCTURE', { value: 5 });
        relations.push({ type: 'dependsOn', from: previous.id, to: node.id });
        previous = node;
      }
      break;
    }
    case 'nexus/dead_substitute': {
      const failed = placeNear('failed', 'INFRASTRUCTURE', target, { available: false, health: 0, value: 8 });
      /* Present, related, and unable to carry the dependency: available=false and
       * health=0. "Dead" has to be a measurable property of the substitute, not a
       * word in the family name. */
      place('substitute', 'SUBSTITUTE', { available: false, health: 0, value: 8 });
      relations.push({ type: 'dependsOn', from: target.id, to: failed.id });
      relations.push({ type: 'substitutes', from: 'substitute', to: failed.id });
      break;
    }
    case 'nexus/live_substitute': {
      const failed = placeNear('failed', 'INFRASTRUCTURE', target, { available: false, health: 0, value: 8 });
      place('substitute', 'SUBSTITUTE', { available: true, health: 100, value: 8 });
      relations.push({ type: 'dependsOn', from: target.id, to: failed.id });
      relations.push({ type: 'substitutes', from: 'substitute', to: failed.id });
      break;
    }
    case 'nexus/redundant_infrastructure': {
      const a = place('path-a', 'INFRASTRUCTURE', { value: 6 });
      const b = place('path-b', 'INFRASTRUCTURE', { value: 6 });
      relations.push({ type: 'supplies', from: a.id, to: target.id });
      relations.push({ type: 'supplies', from: b.id, to: target.id });
      break;
    }
    case 'nexus/single_bottleneck': {
      const neck = place('bottleneck', 'INFRASTRUCTURE', { value: 12, flags: { critical: true } });
      relations.push({ type: 'dependsOn', from: target.id, to: neck.id });
      for (let index = 0; index < params.graphDepth + 1; index += 1) {
        const feeder = place(`feeder-${index}`, 'INFRASTRUCTURE', { value: 3 });
        relations.push({ type: 'dependsOn', from: neck.id, to: feeder.id });
      }
      break;
    }
    case 'nexus/multi_hop_dependency': {
      let previous = target;
      for (let depth = 0; depth < Math.max(3, params.graphDepth); depth += 1) {
        const node = place(`hop-${depth}`, 'INFRASTRUCTURE', { value: 4 });
        relations.push({ type: 'dependsOn', from: previous.id, to: node.id });
        previous = node;
      }
      break;
    }
    case 'nexus/cycle': {
      const length = Math.max(3, params.graphDepth + 1);
      const ring = [];
      for (let index = 0; index < length; index += 1) ring.push(place(`ring-${index}`, 'INFRASTRUCTURE', { value: 4 }));
      for (let index = 0; index < length; index += 1) {
        relations.push({ type: 'dependsOn', from: ring[index].id, to: ring[(index + 1) % length].id });
      }
      relations.push({ type: 'dependsOn', from: target.id, to: ring[0].id });
      break;
    }
    case 'nexus/distributed_value': {
      for (let index = 0; index < params.entityCount; index += 1) {
        const node = place(`value-${index}`, 'INFRASTRUCTURE', { value: 4 });
        relations.push({ type: 'supplies', from: node.id, to: target.id });
      }
      break;
    }
    case 'nexus/conflicting_objectives': {
      const second = place('target-b', 'CRITICAL_TARGET', { value: 20, flags: { critical: true, acceptsMaterial: true } });
      objectives.push({ id: 'objective-secondary', entityId: second.id, requiredValue: 10, deliveredValue: 0 });
      const shared = place('shared-supply', 'DEPOT', { value: 10, flags: { acceptsMaterial: true } });
      relations.push({ type: 'requires', from: target.id, to: shared.id });
      relations.push({ type: 'requires', from: second.id, to: shared.id });
      break;
    }
    case 'archimedes/repair_network': {
      for (let index = 0; index < params.graphDepth + 2; index += 1) {
        const node = place(`damaged-${index}`, 'REPAIR_TARGET', { health: 20 + index * 5, value: 5 });
        relations.push({ type: 'supports', from: node.id, to: target.id });
      }
      break;
    }
    case 'archimedes/material_shortage': {
      const demand = 20 + params.level * 5;
      const supply = Math.max(1, Math.floor(demand / 3));
      place('depot', 'DEPOT', { value: supply, resources: { material: supply } });
      const node = place('needs-material', 'INFRASTRUCTURE', { value: demand, flags: { acceptsMaterial: true, demand } });
      relations.push({ type: 'requires', from: node.id, to: 'depot' });
      break;
    }
    case 'archimedes/load_balancing': {
      const heavy = place('bearer-heavy', 'INFRASTRUCTURE', { value: 20, health: 30 });
      const light = place('bearer-light', 'INFRASTRUCTURE', { value: 2, health: 100 });
      relations.push({ type: 'supports', from: heavy.id, to: target.id });
      relations.push({ type: 'supports', from: light.id, to: target.id });
      break;
    }
    case 'archimedes/damaged_infrastructure': {
      const node = placeNear('structure', 'INFRASTRUCTURE', target, { health: 15, value: 10 });
      relations.push({ type: 'supports', from: node.id, to: target.id });
      break;
    }
    case 'archimedes/construction_sequencing': {
      const first = place('planned-first', 'INFRASTRUCTURE', { available: false, health: 0, value: 6, flags: { planned: true } });
      const second = place('planned-second', 'INFRASTRUCTURE', { available: false, health: 0, value: 6, flags: { planned: true } });
      relations.push({ type: 'dependsOn', from: second.id, to: first.id });
      relations.push({ type: 'supports', from: second.id, to: target.id });
      break;
    }
    case 'archimedes/redundant_structural_paths': {
      const a = place('strut-a', 'INFRASTRUCTURE', { value: 5 });
      const b = place('strut-b', 'INFRASTRUCTURE', { value: 5 });
      relations.push({ type: 'supports', from: a.id, to: target.id });
      relations.push({ type: 'supports', from: b.id, to: target.id });
      break;
    }
    case 'prime/mixed_expert_problem': {
      const node = place('relational', 'INFRASTRUCTURE', { value: 8 });
      relations.push({ type: 'dependsOn', from: target.id, to: node.id });
      break;
    }
    case 'prime/resource_constrained_planning': {
      /* The count is derived from the ENERGY BUDGET, not from entityCount.
       *
       * The first version placed `entityCount` repairables and the admission gate
       * rejected all eighteen cases: at every level the energy budget comfortably
       * covered every repair, so the family claimed a constraint that was not in
       * the world it produced. The generator was wrong and the validator was
       * right, which is the only reason the gate is worth having. */
      const repairCost = 2;
      const count = Math.floor((params.energy / repairCost)) + 2;
      for (let index = 0; index < count; index += 1) {
        place(`repairable-${index}`, 'REPAIR_TARGET', { health: 30, value: 5 });
      }
      break;
    }
    case 'prime/multi_objective_intervention': {
      const second = place('target-b', 'CRITICAL_TARGET', { value: 20, flags: { critical: true, acceptsMaterial: true } });
      objectives.push({ id: 'objective-secondary', entityId: second.id, requiredValue: 10, deliveredValue: 0 });
      break;
    }
    case 'prime/adversarial_choice': {
      const hostile = place('hostile', 'HOSTILE', { risk: 5, value: 0 });
      relations.push({ type: 'attacks', from: hostile.id, to: target.id });
      place('civilian', 'CIVILIAN', { value: 10 });
      break;
    }
    case 'prime/long_horizon_tradeoff': {
      /* An immediately attractive collectable, and a structural repair that pays
       * more only once the horizon is rolled forward. Whether the tradeoff is
       * REAL is decided by the validator running the oracle, not by this comment. */
      placeNear('quick-resource', 'RESOURCE', actor, { value: 3 });
      const structural = place('slow-structure', 'INFRASTRUCTURE', { health: 10, value: 25 });
      relations.push({ type: 'supports', from: structural.id, to: target.id });
      break;
    }
    default:
      break;
  }

  /* Shared furniture: material for delivery, hostiles and civilians by level. */
  if (surface !== 'ORACLE') {
    placeNear('material', 'RESOURCE', actor, { value: 10 + params.level });
  }
  for (let index = 0; index < params.hostileCount; index += 1) {
    if (entities.some((candidate) => candidate.id === `hostile-${index}`)) continue;
    place(`hostile-${index}`, 'HOSTILE', { risk: 4, value: 0 });
  }

  const channels = { primary: buildChannel(family, params, random) };
  if (family === 'prime/mixed_expert_problem') channels.secondary = buildChannel('oracle/monotonic_trend', params, random);

  return {
    family,
    level,
    seed: String(seed),
    scenarioSeed: String(scenarioSeed),
    surface,
    curriculumVersion: FORGE_CURRICULUM_VERSION,
    scenarioVersion: FORGE_SCENARIO_VERSION,
    grid,
    entities,
    relations: relations.sort((a, b) => {
      const ka = `${a.type} ${a.from} ${a.to}`;
      const kb = `${b.type} ${b.from} ${b.to}`;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }),
    objectives,
    constraints: { energy: params.energy },
    hazards: [],
    channels,
    maxTicks: params.maxTicks,
    curriculumParameters: params,
  };
}
