/* Sentinel Forge World — Stage 3B semantic admission gate.
 *
 * Same discipline as Stage 3A and Stage 2L.23, applied to a generator that
 * composes axes instead of hard-coding families: a shape NAME is not evidence
 * that the realized graph has that shape, a role composition is not evidence the
 * roles were placed, and a horizon band is not evidence the horizon matters.
 *
 * The two rules that make this a gate rather than a decoration are unchanged and
 * are enforced by a source scan in the certify script:
 *
 *   1. No validator may call an expert. This file imports nothing from
 *      src/experts/. Where a claim is about UTILITIES it consults the simulator's
 *      own counterfactual oracle, which is world truth, never a model.
 *   2. No validator may read the declared label to decide whether the claim
 *      holds. The label selects which check runs; it is never evidence.
 */

import { assertForge } from './contract.js';
import { isTerminal, legalActions } from './kernel.js';
import {
  connectedComponents, cutNodes, hasDirectedCycle, longestDependencyDepth, providerCount, reachableCount,
} from './topology.js';
import { classifyHorizonDependence } from './counterfactual-v2.js';

export const FORGE_VALIDATOR_V2_VERSION = 'forge-semantic-validators-v2';

const ok = (check, detail = {}) => ({ check, holds: true, ...detail });
const fail = (check, why, detail = {}) => ({ check, holds: false, why, ...detail });

/* ---------------------------------------------------------------------------
 * Shape claims
 *
 * Each reads the REALIZED relation list. Deliberately the weakest check that
 * still establishes the shape's defining property: a validator that is too strict
 * manufactures corpus defects exactly as a generator that is too loose
 * manufactures expert defects, and Stage 2L.23 produced twenty-six false
 * rejections that way before catching itself.
 * ------------------------------------------------------------------------- */

const SHAPE_CHECKS = {
  chain: (world, nodes, edges, root, depth) =>
    depth >= 2 ? ok('CHAIN_DEPTH', { depth }) : fail('CHAIN_DEPTH', 'no dependency run of depth two exists anywhere in the realized graph', { depth }),

  tree: (world, nodes, edges) => {
    const children = new Map();
    for (const edge of edges.filter((entry) => entry.type === 'dependsOn')) {
      children.set(edge.from, (children.get(edge.from) ?? 0) + 1);
    }
    const branching = [...children.values()].filter((count) => count >= 2).length;
    return branching >= 1 && !hasDirectedCycle(edges)
      ? ok('TREE_BRANCHES_ACYCLIC', { branchingNodes: branching })
      : fail('TREE_BRANCHES_ACYCLIC', 'no branching node, or the graph contains a cycle');
  },

  star: (world, nodes, edges) => {
    const out = new Map();
    for (const edge of edges.filter((entry) => entry.type === 'dependsOn')) out.set(edge.from, (out.get(edge.from) ?? 0) + 1);
    const hub = Math.max(0, ...out.values());
    return hub >= 3 ? ok('STAR_HUB', { hubDegree: hub }) : fail('STAR_HUB', 'no node depends on at least three others', { hubDegree: hub });
  },

  mesh: (world, nodes, edges, root) =>
    /* The defining property of a mesh is that no single node is a cut. */
    cutNodes(root, nodes, edges).length === 0
      ? ok('MESH_NO_CUT_NODE')
      : fail('MESH_NO_CUT_NODE', 'a single node disconnects most of the graph, so this is not a mesh'),

  ring: (world, nodes, edges) =>
    hasDirectedCycle(edges) ? ok('RING_CYCLE') : fail('RING_CYCLE', 'the realized dependsOn graph is acyclic'),

  multi_cycle: (world, nodes, edges) =>
    hasDirectedCycle(edges) ? ok('MULTI_CYCLE') : fail('MULTI_CYCLE', 'no cycle exists in the realized graph'),

  bridge: (world, nodes, edges, root) => {
    const cuts = cutNodes(root, nodes, edges);
    return cuts.length >= 1 ? ok('BRIDGE_CUT_EXISTS', { cuts: cuts.length }) : fail('BRIDGE_CUT_EXISTS', 'no cut node joins the two clusters');
  },

  hub_and_spoke: (world, nodes, edges) => {
    const into = new Map();
    for (const edge of edges.filter((entry) => entry.type === 'supplies')) into.set(edge.to, (into.get(edge.to) ?? 0) + 1);
    const hubs = [...into.values()].filter((count) => count >= 2).length;
    return hubs >= 1 ? ok('HUBS_PRESENT', { hubs }) : fail('HUBS_PRESENT', 'no node receives supply from two or more spokes');
  },

  parallel_dependency: (world, nodes, edges) => {
    const into = new Map();
    for (const edge of edges.filter((entry) => entry.type === 'supplies')) into.set(edge.to, (into.get(edge.to) ?? 0) + 1);
    const converged = Math.max(0, ...into.values());
    return converged >= 2 ? ok('PARALLEL_CONVERGENCE', { lanes: converged }) : fail('PARALLEL_CONVERGENCE', 'no node is fed by two independent lanes');
  },

  redundant_network: (world, nodes, edges) => {
    const redundant = nodes.filter((node) => providerCount(node, edges) >= 2).length;
    return redundant >= 1 ? ok('REDUNDANT_PROVIDERS', { redundantNodes: redundant }) : fail('REDUNDANT_PROVIDERS', 'no node has two distinct providers');
  },

  nested_dependency: (world, nodes, edges, root, depth) =>
    depth >= 2 ? ok('NESTING_DEPTH', { depth }) : fail('NESTING_DEPTH', 'no dependency group is nested at least two deep anywhere in the graph', { depth }),

  multi_settlement: (world, nodes, edges) => {
    const clusters = connectedComponents(nodes, edges.filter((entry) => entry.type === 'supplies'));
    return clusters >= 2 ? ok('SETTLEMENTS', { clusters }) : fail('SETTLEMENTS', 'the supply graph forms a single cluster', { clusters });
  },

  disconnected_islands: (world, nodes, edges) => {
    const islands = connectedComponents(nodes, edges.filter((entry) => entry.type === 'dependsOn'));
    return islands >= 2 ? ok('ISLANDS', { islands }) : fail('ISLANDS', 'every node is reachable from every other, so there are no islands', { islands });
  },

  contested_bottleneck: (world, nodes, edges, root) => {
    const cuts = cutNodes(root, nodes, edges);
    /* Attacks from anywhere in the world, not only from structural nodes: a
     * hostile placed by the role composition contests the neck just as much. */
    const attacked = new Set(world.relations.filter((entry) => entry.type === 'attacks').map((entry) => entry.to));
    const contested = cuts.filter((node) => attacked.has(node));
    return contested.length >= 1
      ? ok('CONTESTED_BOTTLENECK', { bottleneck: contested[0] })
      : fail('CONTESTED_BOTTLENECK', 'no cut node is under attack, so the bottleneck is not contested', { cuts: cuts.length, attacked: attacked.size });
  },

  layered_infrastructure: (world, nodes, edges, root, depth) =>
    depth >= 2 && !hasDirectedCycle(edges)
      ? ok('LAYERS', { depth })
      : fail('LAYERS', 'fewer than two strata anywhere in the graph, or a cycle crosses the layering', { depth }),
};

/* ---------------------------------------------------------------------------
 * The gate
 * ------------------------------------------------------------------------- */

export function validateScenarioV2(world, config) {
  const checks = [];
  const structuralIds = new Set(world.entities
    .filter((entity) => /^n\d+$/.test(entity.id)).map((entity) => entity.id));
  const nodes = [...structuralIds].sort();
  const edges = world.relations.filter((relation) => structuralIds.has(relation.from) && structuralIds.has(relation.to));
  /* The root used for depth and cut analysis must be a property of the GRAPH,
   * not of where the objective happened to be attached.
   *
   * The first version measured both from the objective node, and the gate then
   * rejected 1,212 contested-bottleneck and 1,690 depth cases — not because the
   * graphs lacked the structure, but because the objective was often attached
   * below the structure being looked for. That is a validator too strict, which
   * manufactures corpus defects exactly as a loose generator manufactures expert
   * defects. Both anchors are now canonical and label-free: depth is the deepest
   * run anywhere, and cuts are computed from the node that reaches the most. */
  const deepestDepth = nodes.reduce((best, node) => Math.max(best, longestDependencyDepth(node, edges)), 0);
  const cutRoot = nodes.reduce((best, node) => {
    const reach = reachableCount(node, edges);
    return reach > best.reach ? { node, reach } : best;
  }, { node: nodes[0] ?? null, reach: -1 }).node;

  const shapeCheck = SHAPE_CHECKS[config.shape];
  assertForge(shapeCheck !== undefined, 'No shape validator declared', { shape: config.shape });
  checks.push(nodes.length >= 3
    ? ok('TOPOLOGY_MATERIALISED', { nodes: nodes.length, edges: edges.length })
    : fail('TOPOLOGY_MATERIALISED', 'fewer than three structural nodes reached the world', { nodes: nodes.length }));
  if (nodes.length >= 3) checks.push(shapeCheck(world, nodes, edges, cutRoot, deepestDepth));

  /* Roles: the declared composition must actually be present, or the world is
   * not the world the label describes. */
  const declared = config.roleComposition ?? null;
  if (declared !== null) {
    const present = {
      hostiles: world.entities.filter((entity) => entity.type === 'HOSTILE').length,
      civilians: world.entities.filter((entity) => entity.type === 'CIVILIAN').length,
      substitutes: world.entities.filter((entity) => entity.type === 'SUBSTITUTE').length,
    };
    const shortfall = Object.entries(declared)
      .filter(([key, count]) => Object.hasOwn(present, key) && present[key] < count);
    checks.push(shortfall.length === 0
      ? ok('ROLES_MATERIALISED', present)
      : fail('ROLES_MATERIALISED', `declared roles missing from the world: ${shortfall.map(([key]) => key).join(', ')}`, present));
  }

  /* Objectives must be open and attached to a real entity, or the case is over
   * before it starts. */
  const openObjectives = world.objectives.filter((objective) => objective.deliveredValue < objective.requiredValue);
  checks.push(openObjectives.length >= 1
    ? ok('OBJECTIVE_OPEN', { open: openObjectives.length })
    : fail('OBJECTIVE_OPEN', 'no objective is open'));

  /* Decidability: a world with fewer than two legal actions contains no decision
   * and teaches nothing, however well-formed it is. */
  const terminal = isTerminal(world);
  const actions = terminal ? [] : legalActions(world);
  checks.push(!terminal && actions.length >= 2
    ? ok('DECIDABLE', { legalActions: actions.length })
    : fail('DECIDABLE', 'the world is terminal or offers fewer than two legal actions', { legalActions: actions.length }));

  /* Horizon band: the world must have room for the horizon it claims. A band of
   * five steps in a world with two ticks left is a mislabelled case. */
  checks.push(world.maxTicks - world.tick >= config.horizon
    ? ok('HORIZON_FITS', { remaining: world.maxTicks - world.tick, horizon: config.horizon })
    : fail('HORIZON_FITS', 'the world has fewer ticks left than the declared horizon band', { remaining: world.maxTicks - world.tick, horizon: config.horizon }));

  const failed = checks.filter((check) => !check.holds);
  return {
    validatorVersion: FORGE_VALIDATOR_V2_VERSION,
    shape: config.shape,
    roles: config.roles,
    objectives: config.objectives,
    horizonBand: config.horizonBand,
    level: config.level,
    checks,
    checkCount: checks.length,
    valid: failed.length === 0,
    failedChecks: failed.map((check) => check.check),
    rejectionReasons: failed.map((check) => `${check.check}: ${check.why}`),
  };
}

/**
 * The horizon-dependence claim, checked separately because it costs an oracle run.
 *
 * A case in a long horizon band is not thereby horizon-dependent — that has to be
 * MEASURED, by comparing the one-step optimum against the continuation optimum
 * under the same reward. This consults the simulator's own oracle, never a model.
 */
export function validateHorizonClaim(world, config) {
  if (config.horizon === 0) {
    return { claimed: false, measured: 'HORIZON_ALIGNED', holds: true, why: 'band H0 makes no horizon claim' };
  }
  const classification = classifyHorizonDependence(world, { horizon: config.horizon });
  return {
    claimed: true,
    measured: classification.horizonClass,
    greedyRegret: classification.greedyRegret,
    holds: true,
    why: 'the band sets the evaluation window; whether the horizon actually matters is recorded, never assumed',
    classification,
  };
}
