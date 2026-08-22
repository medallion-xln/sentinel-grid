/* Sentinel Nexus — Stage 2G deterministic relational expert (R0).
 *
 * Reasons over an explicit relationship graph carried by canonical state:
 * dependencies, support, threat, bottlenecks, isolation, single points of failure,
 * cycles and unresolved references.
 *
 * Game-agnostic by construction. Nexus never infers relationships from geometry or
 * game semantics; it consumes edges the adapter already declared. Turning a game's
 * world into {from, to, kind} edges is adapter/canonicalization work, which is why
 * the legacy browser azl-relational distance-threshold adjacency is NOT ported here.
 */

import {
  EXPERT_CONTRACT_VERSION,
  MAX_EDGES,
  MAX_ENTITIES,
  SIGNAL_SCALE,
  buildExpertOutput,
  normalizeExpertInput,
  quantizeRatio,
  quantizeUnit,
} from './expert-contract.js';

export const NEXUS_EXPERT_ID = 'sentinel-nexus-relational';
export const NEXUS_EXPERT_VERSION = 1;

/** Dependency depth is capped so a pathological graph stays bounded. */
export const NEXUS_MAX_DEPTH = 64;
/** Relationship vocabulary. Unknown kinds are ignored, never guessed at. */
export const NEXUS_EDGE_KINDS = Object.freeze(['depends', 'supports', 'threatens']);

const BOOL_TRUE = SIGNAL_SCALE;
const BOOL_FALSE = 0;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Deterministic entity list: sorted by id, first occurrence wins. */
function normalizeEntities(raw, rationaleCodes) {
  if (!Array.isArray(raw)) {
    if (raw !== undefined && raw !== null) rationaleCodes.add('NEXUS_MALFORMED_ENTITIES');
    return [];
  }
  const seen = new Map();
  let duplicates = 0;
  let malformed = 0;
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0) { malformed += 1; continue; }
    if (seen.has(entry.id)) { duplicates += 1; continue; }
    seen.set(entry.id, {
      id: entry.id,
      kind: typeof entry.kind === 'string' ? entry.kind : '',
      hostile: entry.hostile === true,
      critical: entry.critical === true,
    });
  }
  if (duplicates > 0) rationaleCodes.add('NEXUS_DUPLICATE_ENTITY');
  if (malformed > 0) rationaleCodes.add('NEXUS_MALFORMED_ENTITIES');
  const sorted = [...seen.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (sorted.length > MAX_ENTITIES) {
    rationaleCodes.add('NEXUS_GRAPH_TRUNCATED');
    return sorted.slice(0, MAX_ENTITIES);
  }
  return sorted;
}

/** Deterministic edge list: sorted by (kind, from, to), deduped, resolved. */
function normalizeEdges(raw, indexById, rationaleCodes) {
  if (!Array.isArray(raw)) {
    if (raw !== undefined && raw !== null) rationaleCodes.add('NEXUS_MALFORMED_RELATIONSHIPS');
    return { edges: [], unresolved: 0, ignoredKinds: 0 };
  }
  const unique = new Map();
  let unresolved = 0;
  let ignoredKinds = 0;
  let malformed = 0;
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.from !== 'string' || typeof entry.to !== 'string' || typeof entry.kind !== 'string') {
      malformed += 1;
      continue;
    }
    if (!NEXUS_EDGE_KINDS.includes(entry.kind)) { ignoredKinds += 1; continue; }
    if (!indexById.has(entry.from) || !indexById.has(entry.to)) { unresolved += 1; continue; }
    const key = `${entry.kind} ${entry.from} ${entry.to}`;
    if (!unique.has(key)) unique.set(key, { kind: entry.kind, from: entry.from, to: entry.to });
  }
  if (malformed > 0) rationaleCodes.add('NEXUS_MALFORMED_RELATIONSHIPS');
  if (unresolved > 0) rationaleCodes.add('NEXUS_UNRESOLVED_DEPENDENCY');
  if (ignoredKinds > 0) rationaleCodes.add('NEXUS_UNKNOWN_EDGE_KIND');
  const sorted = [...unique.keys()].sort().map((key) => unique.get(key));
  if (sorted.length > MAX_EDGES) {
    rationaleCodes.add('NEXUS_GRAPH_TRUNCATED');
    return { edges: sorted.slice(0, MAX_EDGES), unresolved, ignoredKinds };
  }
  return { edges: sorted, unresolved, ignoredKinds };
}

/**
 * Longest dependency chain per node, cycle-safe and depth-capped.
 * Iterative DFS: recursion would be unbounded on adversarial graphs.
 */
function dependencyDepths(nodeCount, dependenciesOf) {
  const color = new Array(nodeCount).fill(0); // 0 unvisited, 1 on stack, 2 done
  const depth = new Array(nodeCount).fill(0);
  const cyclicNodes = new Set();

  for (let root = 0; root < nodeCount; root += 1) {
    if (color[root] !== 0) continue;
    color[root] = 1;
    const stack = [{ node: root, cursor: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const dependencies = dependenciesOf[frame.node];
      if (frame.cursor < dependencies.length) {
        const next = dependencies[frame.cursor];
        frame.cursor += 1;
        if (color[next] === 0) {
          color[next] = 1;
          stack.push({ node: next, cursor: 0 });
        } else if (color[next] === 1) {
          cyclicNodes.add(next);
          cyclicNodes.add(frame.node);
        }
      } else {
        let best = 0;
        for (const next of dependencies) {
          if (color[next] === 2) {
            const candidate = depth[next] + 1;
            if (candidate > best) best = candidate;
          }
        }
        depth[frame.node] = best > NEXUS_MAX_DEPTH ? NEXUS_MAX_DEPTH : best;
        color[frame.node] = 2;
        stack.pop();
      }
    }
  }
  return { depth, cyclicNodes };
}

/**
 * Evaluate relational structure over canonical state.
 * Missing or malformed optional relationship data degrades into rationale codes.
 */
export function evaluateNexus(input) {
  const normalized = normalizeExpertInput(input);
  const rationaleCodes = new Set();
  const state = normalized.canonicalState ?? {};

  const entities = normalizeEntities(state.entities, rationaleCodes);
  const indexById = new Map(entities.map((entity, index) => [entity.id, index]));
  const { edges, unresolved } = normalizeEdges(state.relationships, indexById, rationaleCodes);

  const nodeCount = entities.length;
  const degree = new Array(nodeCount).fill(0);
  const dependenciesOf = Array.from({ length: nodeCount }, () => []);
  const dependentCount = new Array(nodeCount).fill(0);
  const supportedBy = new Array(nodeCount).fill(0);
  const threatenedBy = new Array(nodeCount).fill(0);

  for (const edge of edges) {
    const from = indexById.get(edge.from);
    const to = indexById.get(edge.to);
    degree[from] += 1;
    degree[to] += 1;
    if (edge.kind === 'depends') {
      dependenciesOf[from].push(to);
      dependentCount[to] += 1;
    } else if (edge.kind === 'supports') {
      supportedBy[to] += 1;
    } else if (edge.kind === 'threatens') {
      threatenedBy[to] += 1;
    }
  }
  // Adjacency is already deterministic: edges arrive in sorted order.

  const { depth, cyclicNodes } = dependencyDepths(nodeCount, dependenciesOf);

  let isolatedCount = 0;
  let criticalDependencyCount = 0;
  let bottleneckCount = 0;
  let threatenedCount = 0;
  let unsupportedThreatenedCount = 0;
  let maxDependents = 0;
  let maxDepth = 0;
  let maxDegree = 0;
  let hostileCount = 0;

  for (let index = 0; index < nodeCount; index += 1) {
    const entity = entities[index];
    if (entity.hostile) hostileCount += 1;
    if (degree[index] === 0) isolatedCount += 1;
    if (dependentCount[index] >= 2) criticalDependencyCount += 1;
    if (threatenedBy[index] > 0) {
      threatenedCount += 1;
      if (supportedBy[index] === 0) unsupportedThreatenedCount += 1;
    }
    if (degree[index] >= 3 && (entity.critical || threatenedBy[index] > 0)) bottleneckCount += 1;
    if (dependentCount[index] > maxDependents) maxDependents = dependentCount[index];
    if (depth[index] > maxDepth) maxDepth = depth[index];
    if (degree[index] > maxDegree) maxDegree = degree[index];
  }

  // Action-to-entity coverage, only when legal actions expose a target entity.
  const targetedEntities = new Set();
  for (const action of normalized.legalActions) {
    const target = action.targetEntityId;
    if (typeof target === 'string' && indexById.has(target)) targetedEntities.add(target);
  }
  let uncoveredThreatenedCount = 0;
  for (let index = 0; index < nodeCount; index += 1) {
    if (threatenedBy[index] > 0 && !targetedEntities.has(entities[index].id)) uncoveredThreatenedCount += 1;
  }

  const maxPossibleDegree = nodeCount > 1 ? nodeCount - 1 : 1;
  const signals = {
    entityCount: nodeCount,
    edgeCount: edges.length,
    hostileEntityCount: hostileCount,
    isolatedEntityCount: isolatedCount,
    isolatedRatio: nodeCount > 0 ? quantizeRatio(isolatedCount, nodeCount) : 0,
    unresolvedDependencyCount: unresolved,
    criticalDependencyCount,
    bottleneckCount,
    threatenedEntityCount: threatenedCount,
    unsupportedThreatenedCount,
    uncoveredThreatenedCount,
    actionTargetedEntityCount: targetedEntities.size,
    maxDependents,
    maxDependencyDepth: maxDepth,
    maxDegree,
    maxCentrality: quantizeRatio(maxDegree, maxPossibleDegree),
    cycleDetected: cyclicNodes.size > 0 ? BOOL_TRUE : BOOL_FALSE,
    cycleNodeCount: cyclicNodes.size,
    graphDensity: nodeCount > 1 ? quantizeUnit(edges.length / (nodeCount * (nodeCount - 1))) : 0,
  };

  if (nodeCount === 0) rationaleCodes.add('NEXUS_EMPTY_GRAPH');
  if (edges.length === 0 && nodeCount > 0) rationaleCodes.add('NEXUS_NO_RELATIONSHIPS');
  if (isolatedCount > 0) rationaleCodes.add('NEXUS_ISOLATED_ENTITY');
  if (criticalDependencyCount > 0) rationaleCodes.add('NEXUS_CRITICAL_DEPENDENCY');
  if (bottleneckCount > 0) rationaleCodes.add('NEXUS_BOTTLENECK');
  if (cyclicNodes.size > 0) rationaleCodes.add('NEXUS_CYCLE_DETECTED');
  if (unsupportedThreatenedCount > 0) rationaleCodes.add('NEXUS_UNSUPPORTED_THREAT');
  if (uncoveredThreatenedCount > 0 && normalized.legalActions.length > 0) rationaleCodes.add('NEXUS_UNCOVERED_THREAT');
  if (maxDepth >= NEXUS_MAX_DEPTH) rationaleCodes.add('NEXUS_DEPTH_CAPPED');

  // Confidence reflects how much structure was actually observed.
  const confidence = nodeCount === 0
    ? 0
    : edges.length === 0
      ? quantizeRatio(1, 4)
      : quantizeRatio(edges.length < nodeCount ? edges.length : nodeCount, nodeCount);

  return buildExpertOutput({
    expertId: NEXUS_EXPERT_ID,
    expertVersion: NEXUS_EXPERT_VERSION,
    normalizedInput: normalized,
    signals,
    confidence,
    rationaleCodes: [...rationaleCodes],
  });
}

export const nexusManifest = Object.freeze({
  expertId: NEXUS_EXPERT_ID,
  expertVersion: NEXUS_EXPERT_VERSION,
  expertContractVersion: EXPERT_CONTRACT_VERSION,
  kind: 'deterministic-relational',
  isLearned: false,
  usesRandomness: false,
  usesWallClock: false,
  authorityTier: 'R0',
});
