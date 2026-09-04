/* Sentinel Forge World — procedural topology generators.
 *
 * Stage 3A's 504 cases rested on 105 distinct topologies. Scaling seeds against
 * that would have multiplied records without multiplying anything a model could
 * learn from — the fake-sample-size failure, applied to structure instead of to
 * counts.
 *
 * This module generates the STRUCTURE — which nodes exist and how they relate —
 * independently of placement, values and objectives, so structural diversity can
 * be measured and targeted directly. Fifteen named shapes, each with node count,
 * branching and depth varying under the seed.
 *
 * Every shape is a real causal arrangement, not a relabelling: a star and a mesh
 * of the same node count fail differently, and the difference is what the
 * relational experts are being asked to see.
 */

import { createSeededRandom, deriveSeed, randomInt } from '../core/determinism.js';
import { assertForge } from './contract.js';

export const FORGE_TOPOLOGY_VERSION = 'FORGE_TOPOLOGY_V1';

export const FORGE_TOPOLOGY_SHAPES = Object.freeze([
  { id: 'chain', minNodes: 3, description: 'a single linear dependency run' },
  { id: 'tree', minNodes: 4, description: 'branching dependencies from one root' },
  { id: 'star', minNodes: 4, description: 'many leaves depending on one hub' },
  { id: 'mesh', minNodes: 4, description: 'densely cross-linked nodes with no single cut' },
  { id: 'ring', minNodes: 3, description: 'a single closed dependency cycle' },
  { id: 'multi_cycle', minNodes: 6, description: 'two or more interlocking cycles' },
  { id: 'bridge', minNodes: 6, description: 'two clusters joined by exactly one edge' },
  { id: 'hub_and_spoke', minNodes: 6, description: 'several hubs, each with its own spokes, linked at the top' },
  { id: 'parallel_dependency', minNodes: 5, description: 'independent parallel runs converging on one node' },
  { id: 'redundant_network', minNodes: 5, description: 'every node reachable by at least two distinct paths' },
  { id: 'nested_dependency', minNodes: 6, description: 'dependency groups nested inside dependency groups' },
  { id: 'multi_settlement', minNodes: 8, description: 'several self-contained clusters with light coupling' },
  { id: 'disconnected_islands', minNodes: 6, description: 'clusters with no path between them at all' },
  { id: 'contested_bottleneck', minNodes: 7, description: 'one node every path must cross, under threat' },
  { id: 'layered_infrastructure', minNodes: 8, description: 'strata where each layer depends only on the one below' },
]);

export const FORGE_TOPOLOGY_SHAPE_IDS = Object.freeze(FORGE_TOPOLOGY_SHAPES.map((entry) => entry.id));

/**
 * Build a structural graph.
 *
 * Returns node ids and typed edges only. Placement, health, value and objectives
 * are decided by the scenario layer, which keeps "what shape is this" separate
 * from "what is it made of" and lets both vary independently.
 */
export function generateTopology({ shape, nodeCount, seed }) {
  assertForge(FORGE_TOPOLOGY_SHAPE_IDS.includes(shape), 'Unknown topology shape', { shape });
  const spec = FORGE_TOPOLOGY_SHAPES.find((entry) => entry.id === shape);
  const n = Math.max(spec.minNodes, nodeCount);
  const random = createSeededRandom(deriveSeed(seed, 'forge-topology', shape, String(n)));
  const nodes = Array.from({ length: n }, (unused, index) => `n${index}`);
  const edges = [];
  const add = (type, from, to) => {
    if (from === to) return;
    if (edges.some((edge) => edge.type === type && edge.from === from && edge.to === to)) return;
    edges.push({ type, from, to });
  };

  switch (shape) {
    case 'chain':
      for (let i = 0; i + 1 < n; i += 1) add('dependsOn', nodes[i], nodes[i + 1]);
      break;

    case 'tree': {
      const branching = randomInt(random, 2, 4);
      for (let i = 1; i < n; i += 1) add('dependsOn', nodes[Math.floor((i - 1) / branching)], nodes[i]);
      break;
    }

    case 'star':
      for (let i = 1; i < n; i += 1) add('dependsOn', nodes[0], nodes[i]);
      break;

    case 'mesh': {
      /* Enough cross-links that no single node is a cut vertex. */
      for (let i = 0; i < n; i += 1) {
        for (let step = 1; step <= 2; step += 1) add('dependsOn', nodes[i], nodes[(i + step) % n]);
      }
      break;
    }

    case 'ring':
      for (let i = 0; i < n; i += 1) add('dependsOn', nodes[i], nodes[(i + 1) % n]);
      break;

    case 'multi_cycle': {
      const split = Math.max(3, Math.floor(n / 2));
      for (let i = 0; i < split; i += 1) add('dependsOn', nodes[i], nodes[(i + 1) % split]);
      for (let i = split; i < n; i += 1) {
        const next = i + 1 >= n ? split : i + 1;
        add('dependsOn', nodes[i], nodes[next]);
      }
      add('dependsOn', nodes[0], nodes[split]);
      break;
    }

    case 'bridge': {
      const half = Math.floor(n / 2);
      for (let i = 0; i + 1 < half; i += 1) add('supplies', nodes[i], nodes[i + 1]);
      for (let i = half; i + 1 < n; i += 1) add('supplies', nodes[i], nodes[i + 1]);
      /* The single edge joining the two clusters. Removing it disconnects them. */
      add('dependsOn', nodes[half - 1], nodes[half]);
      break;
    }

    case 'hub_and_spoke': {
      const hubCount = Math.max(2, Math.floor(n / 4));
      const hubs = nodes.slice(0, hubCount);
      for (let i = hubCount; i < n; i += 1) add('supplies', nodes[i], hubs[i % hubCount]);
      for (let i = 1; i < hubs.length; i += 1) add('dependsOn', hubs[0], hubs[i]);
      break;
    }

    case 'parallel_dependency': {
      const lanes = Math.max(2, Math.min(4, Math.floor((n - 1) / 2)));
      const perLane = Math.floor((n - 1) / lanes);
      for (let lane = 0; lane < lanes; lane += 1) {
        const start = 1 + lane * perLane;
        for (let i = 0; i + 1 < perLane; i += 1) add('supplies', nodes[start + i + 1], nodes[start + i]);
        if (perLane > 0) add('supplies', nodes[start], nodes[0]);
      }
      break;
    }

    case 'redundant_network':
      for (let i = 1; i < n; i += 1) {
        add('supplies', nodes[i], nodes[0]);
        add('supplies', nodes[i], nodes[1 + (i % Math.max(1, n - 1))]);
      }
      break;

    case 'nested_dependency': {
      const groupSize = Math.max(2, Math.floor(n / 3));
      for (let g = 0; g * groupSize < n; g += 1) {
        const base = g * groupSize;
        for (let i = 1; i < groupSize && base + i < n; i += 1) add('dependsOn', nodes[base], nodes[base + i]);
        if (g > 0) add('dependsOn', nodes[(g - 1) * groupSize], nodes[base]);
      }
      break;
    }

    case 'multi_settlement': {
      const clusters = Math.max(2, Math.floor(n / 4));
      const size = Math.floor(n / clusters);
      for (let c = 0; c < clusters; c += 1) {
        const base = c * size;
        for (let i = 1; i < size && base + i < n; i += 1) add('supplies', nodes[base + i], nodes[base]);
        if (c > 0) add('substitutes', nodes[base], nodes[(c - 1) * size]);
      }
      break;
    }

    case 'disconnected_islands': {
      const islands = Math.max(2, Math.floor(n / 3));
      const size = Math.floor(n / islands);
      for (let island = 0; island < islands; island += 1) {
        const base = island * size;
        for (let i = 1; i < size && base + i < n; i += 1) add('dependsOn', nodes[base], nodes[base + i]);
      }
      /* No edge crosses between islands. That is the point of the shape. */
      break;
    }

    case 'contested_bottleneck': {
      const neck = nodes[1];
      const upstream = Math.max(2, Math.floor((n - 2) / 2));
      add('dependsOn', nodes[0], neck);
      for (let i = 0; i < upstream; i += 1) add('dependsOn', neck, nodes[2 + i]);
      for (let i = 2 + upstream; i < n; i += 1) add('attacks', nodes[i], neck);
      break;
    }

    case 'layered_infrastructure': {
      const layers = Math.max(3, Math.min(5, Math.floor(n / 3)));
      const perLayer = Math.max(1, Math.floor(n / layers));
      for (let layer = 0; layer + 1 < layers; layer += 1) {
        for (let i = 0; i < perLayer; i += 1) {
          const upper = layer * perLayer + i;
          const lower = (layer + 1) * perLayer + (i % perLayer);
          if (upper < n && lower < n) add('dependsOn', nodes[upper], nodes[lower]);
        }
      }
      break;
    }

    default:
      break;
  }

  edges.sort((a, b) => {
    const ka = `${a.type} ${a.from} ${a.to}`;
    const kb = `${b.type} ${b.from} ${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return { shape, nodes, edges, nodeCount: n, edgeCount: edges.length, topologyVersion: FORGE_TOPOLOGY_VERSION };
}

/* ---------------------------------------------------------------------------
 * Structural predicates.
 *
 * Used by the Stage 3B validators. Plain graph algorithms over the REALIZED edge
 * list — none of them reads the shape name, because the shape name is the claim
 * being checked, not evidence for it.
 * ------------------------------------------------------------------------- */

function adjacency(edges, types) {
  const map = new Map();
  for (const edge of edges) {
    if (!types.includes(edge.type)) continue;
    if (!map.has(edge.from)) map.set(edge.from, []);
    map.get(edge.from).push(edge.to);
  }
  for (const list of map.values()) list.sort();
  return map;
}

export function hasDirectedCycle(edges, types = ['dependsOn']) {
  const graph = adjacency(edges, types);
  const state = new Map();
  const visit = (node) => {
    state.set(node, 1);
    for (const next of graph.get(node) ?? []) {
      if (state.get(next) === 1) return true;
      if (!state.has(next) && visit(next)) return true;
    }
    state.set(node, 2);
    return false;
  };
  for (const node of [...graph.keys()].sort()) {
    if (!state.has(node) && visit(node)) return true;
  }
  return false;
}

export function connectedComponents(nodes, edges) {
  const parent = new Map(nodes.map((node) => [node, node]));
  const find = (node) => {
    while (parent.get(node) !== node) {
      parent.set(node, parent.get(parent.get(node)));
      node = parent.get(node);
    }
    return node;
  };
  for (const edge of edges) {
    if (!parent.has(edge.from) || !parent.has(edge.to)) continue;
    parent.set(find(edge.from), find(edge.to));
  }
  return new Set(nodes.map((node) => find(node))).size;
}

/** Nodes whose removal disconnects strictly more than half of what root reaches. */
export function cutNodes(root, nodes, edges, types = ['dependsOn', 'supplies', 'supports']) {
  const reach = (excluded) => {
    const graph = adjacency(edges.filter((edge) => edge.from !== excluded && edge.to !== excluded), types);
    const seen = new Set([root]);
    const queue = [root];
    while (queue.length > 0) {
      const node = queue.shift();
      for (const next of graph.get(node) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    seen.delete(root);
    return seen;
  };
  const baseline = reach(null);
  if (baseline.size === 0) return [];
  return [...baseline].sort().filter((candidate) => reach(candidate).size * 2 < baseline.size);
}

/** Count of distinct direct providers into a node. */
export function providerCount(node, edges, types = ['supplies', 'supports']) {
  return new Set(edges.filter((edge) => types.includes(edge.type) && edge.to === node).map((edge) => edge.from)).size;
}

/**
 * Longest dependency run reachable from `root`.
 *
 * Memoized DFS in O(V+E). The first version enumerated every simple path with
 * backtracking, which is exponential — on a 24-node mesh the Stage 3B admission
 * gate stopped making progress entirely. A cycle makes the longest simple path
 * ill-defined, so a node on a cycle reports the node count: the graph is at least
 * that deep, and any threshold asking "is it deep enough" is answered correctly
 * without pretending to a precision that does not exist.
 */
export function longestDependencyDepth(root, edges) {
  const graph = adjacency(edges, ['dependsOn']);
  const nodeCount = new Set([...graph.keys(), ...edges.map((edge) => edge.to)]).size;
  const memo = new Map();
  const onStack = new Set();

  const depthFrom = (node) => {
    if (memo.has(node)) return memo.get(node);
    if (onStack.has(node)) return nodeCount;
    onStack.add(node);
    let best = 0;
    for (const next of graph.get(node) ?? []) {
      const candidate = 1 + depthFrom(next);
      if (candidate > best) best = candidate;
    }
    onStack.delete(node);
    memo.set(node, best);
    return best;
  };
  return depthFrom(root);
}

/** Reachable-set size from `root`, O(V+E). Used to pick a canonical analysis root. */
export function reachableCount(root, edges, types = ['dependsOn', 'supplies', 'supports']) {
  const graph = adjacency(edges, types);
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of graph.get(node) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return seen.size - 1;
}
