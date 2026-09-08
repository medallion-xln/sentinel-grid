/* Sentinel Forge World — Stage 3B curriculum generator.
 *
 * A SUPERSEDING generator. The Stage 3A families are frozen and still reproduce;
 * this one composes four independent axes instead of hard-coding one world per
 * family:
 *
 *   topology shape  x  role composition  x  objective composition  x  horizon band
 *
 * Composition is what buys structural diversity. 15 shapes x 6 role mixes x 8
 * objective compositions x 5 horizon bands x node-count variation gives far more
 * distinct STRUCTURES than 28 hand-written families ever could, and each axis
 * varies something with causal consequences rather than a label.
 *
 * Every generated scenario still passes an independent validator before it may
 * enter a dataset. The gate is not relaxed for scale.
 */

import { createSeededRandom, deriveSeed, randomInt } from '../core/determinism.js';
import { assertForge } from './contract.js';
import { FORGE_TOPOLOGY_SHAPE_IDS, generateTopology } from './topology.js';

export const FORGE_CURRICULUM_V2_VERSION = 'FORGE_CURRICULUM_V2';
export const FORGE_SCENARIO_V2_VERSION = 'forge-scenarios-v2';

/* ---------------------------------------------------------------------------
 * Axes
 * ------------------------------------------------------------------------- */

/* Role mixes. Each changes what the world is MADE of, and each has a different
 * causal consequence: hostiles degrade, civilians raise the cost of failure,
 * substitutes create alternatives, scarcity removes them. */
export const FORGE_ROLE_COMPOSITIONS = Object.freeze([
  { id: 'bare', hostiles: 0, civilians: 0, substitutes: 0, resources: 1, barriers: 0, hazards: 0, description: 'structure alone' },
  { id: 'defended', hostiles: 2, civilians: 1, substitutes: 0, resources: 1, barriers: 0, hazards: 1, description: 'structure under attack with a civilian at stake' },
  { id: 'redundant', hostiles: 0, civilians: 0, substitutes: 3, resources: 2, barriers: 0, hazards: 0, description: 'alternatives available for most failures' },
  { id: 'scarce', hostiles: 1, civilians: 0, substitutes: 1, resources: 1, barriers: 1, hazards: 1, description: 'few resources, one substitute, obstructions' },
  { id: 'populated', hostiles: 1, civilians: 4, substitutes: 1, resources: 2, barriers: 0, hazards: 2, description: 'many civilians exposed to hazards' },
  { id: 'industrial', hostiles: 0, civilians: 1, substitutes: 2, resources: 3, barriers: 1, hazards: 1, description: 'material-rich, depot-driven repair work' },
]);
export const FORGE_ROLE_COMPOSITION_IDS = Object.freeze(FORGE_ROLE_COMPOSITIONS.map((entry) => entry.id));

/* Objective compositions. Single goals and genuine tradeoffs, each expressed in
 * reward-vector terms rather than as prose. */
export const FORGE_OBJECTIVE_COMPOSITIONS = Object.freeze([
  { id: 'reach_target', goals: ['deliver'], description: 'deliver material to one objective node' },
  { id: 'restore_infrastructure', goals: ['restore'], description: 'bring failed structure back into service' },
  { id: 'protect_civilians', goals: ['protect'], description: 'keep civilians alive through the horizon' },
  { id: 'restore_and_protect', goals: ['restore', 'protect'], description: 'both, with one actor and one budget' },
  { id: 'restore_and_conserve', goals: ['restore', 'conserve'], description: 'repair while holding resources back' },
  { id: 'supply_and_defend', goals: ['deliver', 'defend'], description: 'deliver while a hostile degrades the target' },
  { id: 'repair_and_maintain_redundancy', goals: ['restore', 'redundancy'], description: 'repair without spending the last alternative' },
  { id: 'multi_target_delivery', goals: ['deliver', 'deliver'], description: 'two objective nodes competing for one supply' },
]);
export const FORGE_OBJECTIVE_COMPOSITION_IDS = Object.freeze(FORGE_OBJECTIVE_COMPOSITIONS.map((entry) => entry.id));

/* Horizon bands (Phase 9). The band sets the evaluation window AND the world's
 * tick budget, so a long-horizon case has room for a long horizon to matter. */
export const FORGE_HORIZON_BANDS = Object.freeze([
  { id: 'H0', horizon: 0, maxTicksBonus: 0, description: 'one step' },
  { id: 'H1', horizon: 1, maxTicksBonus: 2, description: 'two steps' },
  { id: 'H2', horizon: 3, maxTicksBonus: 4, description: 'three steps' },
  { id: 'H3', horizon: 5, maxTicksBonus: 8, description: 'five steps' },
  { id: 'H4', horizon: 8, maxTicksBonus: 14, description: 'longer bounded planning' },
]);
export const FORGE_HORIZON_BAND_IDS = Object.freeze(FORGE_HORIZON_BANDS.map((entry) => entry.id));

export const FORGE_CURRICULUM_V2_LEVELS = Object.freeze([0, 1, 2, 3, 4, 5]);

export const FORGE_CURRICULUM_V2_MAX_LEVEL = 7;

/**
 * Difficulty parameters.
 *
 * Levels 0-5 are the training curriculum. Levels 6-7 exist only for the
 * out-of-distribution holdout, which is CONSTRUCTED rather than sampled: a
 * holdout drawn from the training distribution measures generalisation across
 * structures, and this measures it across regimes. The formulas are linear in the
 * level, so extending the accepted range leaves levels 0-5 byte-identical.
 */
export function curriculumV2Parameters(level) {
  assertForge(Number.isInteger(level) && level >= 0 && level <= FORGE_CURRICULUM_V2_MAX_LEVEL,
    `Curriculum level must be 0..${FORGE_CURRICULUM_V2_MAX_LEVEL} (0-5 training, 6-7 out-of-distribution)`, { level });
  return {
    level,
    /* Node count grows steeply: structural difficulty is the axis the Stage 3A
     * curriculum moved least, and difficulty has to be measurably real. */
    topologyNodes: 4 + level * 4,
    gridSize: 8 + level * 2,
    energy: 44 - level * 4,
    hazardDensity: level,
    valueSpread: 1 + level,
    scarcity: level,
    maxTicksBase: 10 + level * 3,
  };
}

/* ---------------------------------------------------------------------------
 * Generation
 * ------------------------------------------------------------------------- */

const ROLE_TYPE = { hostiles: 'HOSTILE', civilians: 'CIVILIAN', substitutes: 'SUBSTITUTE', resources: 'RESOURCE', barriers: 'BARRIER' };

export function generateScenarioV2({ shape, roles, objectives, horizonBand, level, seed }) {
  assertForge(FORGE_TOPOLOGY_SHAPE_IDS.includes(shape), 'Unknown topology shape', { shape });
  assertForge(FORGE_ROLE_COMPOSITION_IDS.includes(roles), 'Unknown role composition', { roles });
  assertForge(FORGE_OBJECTIVE_COMPOSITION_IDS.includes(objectives), 'Unknown objective composition', { objectives });
  assertForge(FORGE_HORIZON_BAND_IDS.includes(horizonBand), 'Unknown horizon band', { horizonBand });

  const params = curriculumV2Parameters(level);
  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === roles);
  const objectiveSpec = FORGE_OBJECTIVE_COMPOSITIONS.find((entry) => entry.id === objectives);
  const bandSpec = FORGE_HORIZON_BANDS.find((entry) => entry.id === horizonBand);

  const scenarioSeed = deriveSeed(seed, 'forge-v2', shape, roles, objectives, horizonBand, String(level));
  const random = createSeededRandom(scenarioSeed);

  /* Node count varies with the seed as well as the level, so two cases of the
   * same level and shape are not automatically the same structure. */
  const nodeCount = params.topologyNodes + randomInt(random, 0, 4);
  const topology = generateTopology({ shape, nodeCount, seed: scenarioSeed });

  const size = params.gridSize;
  const cells = new Array(size * size).fill(0);
  for (let index = 0; index < params.hazardDensity + roleSpec.hazards; index += 1) {
    cells[randomInt(random, 1, size - 1) * size + randomInt(random, 1, size - 1)] = 2;
  }
  for (let index = 0; index < Math.max(0, params.hazardDensity - 1); index += 1) {
    const at = randomInt(random, 1, size - 1) * size + randomInt(random, 1, size - 1);
    if (cells[at] === 0) cells[at] = 1;
  }
  const grid = { width: size, height: size, cells };

  const taken = new Set();
  const entities = [];
  const freeCells = () => {
    const free = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (grid.cells[y * size + x] !== 0) continue;
        if (taken.has(`${x},${y}`)) continue;
        free.push({ x, y });
      }
    }
    return free;
  };
  const place = (id, type, overrides = {}) => {
    const free = freeCells();
    assertForge(free.length > 0, 'Scenario grid exhausted', { shape, level });
    const cell = free[randomInt(random, 0, free.length)];
    taken.add(`${cell.x},${cell.y}`);
    const created = {
      id, type, position: { x: cell.x, y: cell.y }, health: 100, available: true,
      value: 0, cost: 0, risk: 0,
      faction: type === 'HOSTILE' ? 'hostile' : type === 'ACTOR' ? 'sentinel' : 'neutral',
      flags: {}, resources: {},
      ...overrides,
    };
    entities.push(created);
    return created;
  };
  const placeNear = (id, type, anchor, overrides = {}) => {
    const candidates = [
      { x: anchor.position.x + 1, y: anchor.position.y }, { x: anchor.position.x - 1, y: anchor.position.y },
      { x: anchor.position.x, y: anchor.position.y + 1 }, { x: anchor.position.x, y: anchor.position.y - 1 },
    ].filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < size && cell.y < size)
      .filter((cell) => grid.cells[cell.y * size + cell.x] === 0 && !taken.has(`${cell.x},${cell.y}`));
    if (candidates.length === 0) return place(id, type, overrides);
    const cell = candidates[0];
    taken.add(`${cell.x},${cell.y}`);
    const created = {
      id, type, position: { x: cell.x, y: cell.y }, health: 100, available: true,
      value: 0, cost: 0, risk: 0, faction: type === 'HOSTILE' ? 'hostile' : 'neutral', flags: {}, resources: {},
      ...overrides,
    };
    entities.push(created);
    return created;
  };

  const actor = place('actor', 'ACTOR', { risk: 1, resources: { material: 0 } });

  /* Topology nodes become structural entities. Value is spread rather than
   * concentrated so no single node trivially dominates every decision. */
  const nodeType = (index) => {
    if (index % 7 === 0) return 'POWER_SOURCE';
    if (index % 5 === 0) return 'DEPOT';
    if (index % 3 === 0) return 'REPAIR_TARGET';
    return 'INFRASTRUCTURE';
  };
  const structural = topology.nodes.map((id, index) => place(id, nodeType(index), {
    value: 2 + randomInt(random, 0, params.valueSpread + 2),
    health: index % 4 === 0 ? 20 + randomInt(random, 0, 30) : 100,
    available: !(index % 6 === 5),
    flags: index % 6 === 5 ? { planned: false } : {},
  }));

  const relations = topology.edges.map((edge) => ({ ...edge }));

  /* Objectives: attached to real topology nodes, so an objective is always
   * embedded in the structure rather than bolted beside it. */
  const objectiveList = [];
  const deliverCount = objectiveSpec.goals.filter((goal) => goal === 'deliver').length;
  const primaryNode = structural[randomInt(random, 0, structural.length)];
  primaryNode.flags = { ...primaryNode.flags, critical: true, acceptsMaterial: true };
  primaryNode.available = true;
  primaryNode.value = 12 + params.valueSpread;
  objectiveList.push({ id: 'objective-primary', entityId: primaryNode.id, requiredValue: 8 + level, deliveredValue: 0 });

  if (deliverCount > 1 || objectiveSpec.goals.includes('protect') || objectiveSpec.goals.includes('restore')) {
    const secondNode = structural[(structural.indexOf(primaryNode) + Math.max(1, Math.floor(structural.length / 2))) % structural.length];
    if (secondNode !== primaryNode) {
      secondNode.flags = { ...secondNode.flags, critical: true, acceptsMaterial: true };
      secondNode.available = true;
      objectiveList.push({ id: 'objective-secondary', entityId: secondNode.id, requiredValue: 5 + level, deliveredValue: 0 });
    }
  }

  /* Goal-specific furniture, each with a causal effect rather than a label. */
  if (objectiveSpec.goals.includes('restore')) {
    const failed = structural[randomInt(random, 0, structural.length)];
    if (failed.id !== primaryNode.id) { failed.available = false; failed.health = 0; }
    relations.push({ type: 'dependsOn', from: primaryNode.id, to: failed.id });
  }
  if (objectiveSpec.goals.includes('redundancy')) {
    const a = structural[0];
    const b = structural[structural.length - 1];
    relations.push({ type: 'supports', from: a.id, to: primaryNode.id });
    relations.push({ type: 'supports', from: b.id, to: primaryNode.id });
  }
  if (objectiveSpec.goals.includes('conserve')) {
    /* Scarcity is expressed as an energy budget below what the open work costs. */
    params.energy = Math.max(6, Math.floor(params.energy / 2));
  }

  /* Roles. */
  for (const [key, type] of Object.entries(ROLE_TYPE)) {
    const count = roleSpec[key] ?? 0;
    for (let index = 0; index < count; index += 1) {
      const scarcityCut = key === 'resources' ? Math.max(1, params.scarcity) : 0;
      const created = place(`${type.toLowerCase()}-${index}`, type, {
        value: key === 'resources' ? Math.max(2, 10 + level - scarcityCut * 2)
          : key === 'civilians' ? 10 : key === 'substitutes' ? 6 : 0,
        risk: key === 'hostiles' ? 4 : 0,
      });
      if (key === 'hostiles') {
        const victim = objectiveSpec.goals.includes('defend') ? primaryNode : structural[randomInt(random, 0, structural.length)];
        relations.push({ type: 'attacks', from: created.id, to: victim.id });
      }
      if (key === 'substitutes') {
        const failed = structural.find((entity) => !entity.available) ?? structural[randomInt(random, 0, structural.length)];
        relations.push({ type: 'substitutes', from: created.id, to: failed.id });
      }
    }
  }

  /* Material the actor can reach, otherwise a delivery objective is unreachable
   * and the case would be rejected as undecidable rather than being hard. */
  placeNear('material', 'RESOURCE', actor, { value: 8 + level });

  relations.sort((a, b) => {
    const ka = `${a.type} ${a.from} ${a.to}`;
    const kb = `${b.type} ${b.from} ${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  /* A temporal channel so the Oracle surface has something to read in every
   * world, with the shape driven by the seed rather than fixed. */
  const channelKind = randomInt(random, 0, 5);
  const frames = 8 + level * 2;
  const slope = 2 + level;
  const primary = [];
  for (let i = 0; i < frames; i += 1) {
    const base = 40;
    if (channelKind === 0) primary.push(base + i * slope);
    else if (channelKind === 1) primary.push(base - i * slope);
    else if (channelKind === 2) primary.push(i <= frames / 2 ? base + i * slope : base + Math.floor(frames / 2) * slope - (i - Math.floor(frames / 2)) * slope);
    else if (channelKind === 3) primary.push(base + (i % 2 === 0 ? slope * 3 : -slope * 3));
    else primary.push(base + Math.round(Math.sin(i) * 0) + (i < frames / 2 ? i : frames - i) * slope);
  }

  return {
    generator: 'v2',
    /* The frozen kernel records `scenarioConfig.family` on the world, and the
     * adapter puts it in the ObservationPacket metadata, which must be
     * JSON-compatible. A composed scenario has no single family, so one is
     * composed from the axes. hashWorld excludes it — verified — so adding it
     * leaves every generated world byte-identical and the corpus valid. */
    family: `v2/${shape}/${roles}/${objectives}/${horizonBand}`,
    shape, roles, objectives, horizonBand, level,
    seed: String(seed),
    scenarioSeed: String(scenarioSeed),
    horizon: bandSpec.horizon,
    surface: 'COMPOSED',
    curriculumVersion: FORGE_CURRICULUM_V2_VERSION,
    scenarioVersion: FORGE_SCENARIO_V2_VERSION,
    topologyShape: shape,
    topologyNodeCount: topology.nodeCount,
    topologyEdgeCount: topology.edgeCount,
    grid,
    entities,
    relations,
    objectives: objectiveList,
    constraints: { energy: params.energy },
    hazards: [],
    channels: { primary },
    maxTicks: params.maxTicksBase + bandSpec.maxTicksBonus,
    curriculumParameters: params,
  };
}

/** Every axis combination, in canonical order. The enumeration IS the curriculum. */
export function enumerateCurriculumV2({ levels = FORGE_CURRICULUM_V2_LEVELS, seeds = [1] } = {}) {
  const combinations = [];
  for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
    for (const roles of FORGE_ROLE_COMPOSITION_IDS) {
      for (const objectives of FORGE_OBJECTIVE_COMPOSITION_IDS) {
        for (const horizonBand of FORGE_HORIZON_BAND_IDS) {
          for (const level of levels) {
            for (const seed of seeds) combinations.push({ shape, roles, objectives, horizonBand, level, seed });
          }
        }
      }
    }
  }
  return combinations;
}

export const FORGE_CURRICULUM_V2_AXIS_SIZES = Object.freeze({
  shapes: FORGE_TOPOLOGY_SHAPE_IDS.length,
  roleCompositions: FORGE_ROLE_COMPOSITION_IDS.length,
  objectiveCompositions: FORGE_OBJECTIVE_COMPOSITION_IDS.length,
  horizonBands: FORGE_HORIZON_BAND_IDS.length,
  levels: FORGE_CURRICULUM_V2_LEVELS.length,
  combinationsPerSeed: FORGE_TOPOLOGY_SHAPE_IDS.length * FORGE_ROLE_COMPOSITION_IDS.length
    * FORGE_OBJECTIVE_COMPOSITION_IDS.length * FORGE_HORIZON_BAND_IDS.length * FORGE_CURRICULUM_V2_LEVELS.length,
});
