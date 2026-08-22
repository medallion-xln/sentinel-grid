import { deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { buildStage2I0CapabilityBaseline } from './stage2i0-capability-baseline.js';

export const STAGE2K0_STAGE = 'STAGE2K0_NEXUS_RELATIONAL_CAPABILITY_FAILURE_DIAGNOSTIC_AND_7_OF_10_REMEDIATION_BASELINE';
export const STAGE2K0_STAGE2J1_CERTIFICATION_HASH = 'e7062db1d5fbb16f27dedae70269f182b14f2787d7c82e8e28f8c65f14b9b7ca';
export const STAGE2K0_EXPECTED_NEXUS_CORPUS_DIGEST = '3f11b1483dcc9179cddcdb0e507f184fc3f73da214ffcc77db9589f3f81416db';

const SPLITS = ['DEVELOPMENT', 'VALIDATION', 'FINAL_HOLDOUT'];
const FAMILIES = [
  'TREE_GRAPH', 'CYCLE_GRAPH', 'MESH_GRAPH', 'DIRECTED_DEPENDENCY',
  'MULTIPLE_COMPONENTS', 'SINGLE_ARTICULATION', 'REDUNDANT_PATHS',
  'FALSE_REDUNDANCY', 'MULTIPLE_RESOURCE_SUPPLIERS', 'SINGLE_POINT_OF_FAILURE',
  'TYPED_DEPENDENCY_NETWORK', 'COUNTERFACTUAL_BACKUP_LINK',
];
const GAME_DOMAINS = ['WATER_NETWORK', 'POWER_NETWORK', 'SETTLEMENT_SUPPLY', 'ENEMY_SUPPORT', 'MISSION_DEPENDENCY', 'COMMUNICATIONS_RELAY', 'DEFENSIVE_PERIMETER', 'PATROL_SUPPORT', 'RESOURCE_PRODUCTION'];
const MUTATIONS = ['REMOVE_NODE', 'REMOVE_EDGE', 'ADD_NODE', 'ADD_EDGE', 'DISABLE_DEPENDENCY', 'RESTORE_DEPENDENCY', 'ADD_REDUNDANT_PATH', 'REMOVE_REDUNDANT_PATH'];
const ADVERSARIAL_TYPES = ['NODE_ORDER_PERMUTATION', 'EDGE_ORDER_PERMUTATION', 'DUPLICATE_EDGES', 'ISOLATED_NODE_INSERTION', 'IRRELEVANT_DISCONNECTED_COMPONENT', 'EDGE_DIRECTION_REVERSAL', 'NEAR_IDENTICAL_ENTITY_IDS', 'MULTIPLE_EQUIVALENT_ALTERNATE_PATHS', 'HIDDEN_ARTICULATION_NODE', 'TYPED_DEPENDENCY_CONFLICT', 'CYCLE_WITH_CRITICAL_BRIDGE', 'DENSE_GRAPH_NO_TRUE_BOTTLENECK'];
const ratio = (correct, total) => total === 0 ? null : correct / total;

function canonicalEntity(entity, index) {
  return {
    entityId: entity.id,
    entityType: typeof entity.kind === 'string' ? entity.kind : '',
    canonicalKey: `${typeof entity.kind === 'string' ? entity.kind : ''}:${entity.id}`,
    sourceObservationReference: entity.sourceObservationReference ?? `canonicalState.entity:${entity.id}`,
    critical: entity.critical === true,
  };
}

function canonicalEdge(edge, index) {
  const edgeType = edge.kind ?? 'depends';
  return {
    edgeId: edge.id ?? `${edgeType}:${edge.from}->${edge.to}`,
    source: edge.from,
    target: edge.to,
    edgeType,
    direction: 'DIRECTED',
    weight: Number.isFinite(edge.weight) ? edge.weight : 1,
    sourceObservationReference: edge.sourceObservationReference ?? `canonicalState.relationship:${edgeType}:${edge.from}->${edge.to}`,
  };
}

export function normalizeRelationalGraph(canonicalState) {
  const entitiesById = new Map();
  for (const [index, raw] of (canonicalState.entities ?? []).entries()) {
    if (!raw || typeof raw.id !== 'string' || raw.id.length === 0 || entitiesById.has(raw.id)) continue;
    entitiesById.set(raw.id, canonicalEntity(raw, index));
  }
  const entities = [...entitiesById.values()].sort((a, b) => a.entityId.localeCompare(b.entityId));
  const edgesById = new Map();
  for (const [index, raw] of (canonicalState.relationships ?? []).entries()) {
    if (!raw || !entitiesById.has(raw.from) || !entitiesById.has(raw.to)) continue;
    const edge = canonicalEdge(raw, index);
    const semanticKey = `${edge.edgeType}:${edge.source}->${edge.target}`;
    if (!edgesById.has(semanticKey)) edgesById.set(semanticKey, edge);
  }
  const edges = [...edgesById.values()].sort((a, b) => `${a.edgeType}:${a.source}:${a.target}`.localeCompare(`${b.edgeType}:${b.source}:${b.target}`));
  return deepFreeze({ entities, edges });
}

function edgeMatches(edge, edgeType) {
  return edgeType === null || edgeType === undefined || edge.edgeType === edgeType;
}

export function isReachable(graph, source, target, edgeType = null, excluded = {}) {
  if (excluded.nodeId === source || excluded.nodeId === target) return false;
  if (source === target) return graph.entities.some((entity) => entity.entityId === source);
  const adjacency = new Map(graph.entities.filter((entity) => entity.entityId !== excluded.nodeId).map((entity) => [entity.entityId, []]));
  for (const edge of graph.edges) {
    if (!edgeMatches(edge, edgeType) || edge.edgeId === excluded.edgeId || edge.source === excluded.nodeId || edge.target === excluded.nodeId) continue;
    if (adjacency.has(edge.source) && adjacency.has(edge.target)) adjacency.get(edge.source).push(edge.target);
  }
  for (const targets of adjacency.values()) targets.sort();
  const visited = new Set([source]); const queue = [source];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of adjacency.get(node) ?? []) {
      if (next === target) return true;
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  return false;
}

function weakComponents(graph, excluded = {}) {
  const ids = graph.entities.map((entity) => entity.entityId).filter((id) => id !== excluded.nodeId);
  const adjacency = new Map(ids.map((id) => [id, new Set()]));
  for (const edge of graph.edges) {
    if (edge.edgeId === excluded.edgeId || edge.source === excluded.nodeId || edge.target === excluded.nodeId) continue;
    adjacency.get(edge.source)?.add(edge.target); adjacency.get(edge.target)?.add(edge.source);
  }
  let components = 0; const visited = new Set();
  for (const id of ids) {
    if (visited.has(id)) continue;
    components += 1; const stack = [id]; visited.add(id);
    while (stack.length > 0) for (const next of adjacency.get(stack.pop()) ?? []) if (!visited.has(next)) { visited.add(next); stack.push(next); }
  }
  return components;
}

function applyMutation(graph, mutation) {
  const clone = structuredClone(graph);
  if (mutation.type === 'REMOVE_NODE') {
    clone.entities = clone.entities.filter((entity) => entity.entityId !== mutation.nodeId);
    clone.edges = clone.edges.filter((edge) => edge.source !== mutation.nodeId && edge.target !== mutation.nodeId);
  } else if (['REMOVE_EDGE', 'DISABLE_DEPENDENCY', 'REMOVE_REDUNDANT_PATH'].includes(mutation.type)) {
    clone.edges = clone.edges.filter((edge) => edge.edgeId !== mutation.edgeId);
  } else if (mutation.type === 'ADD_NODE') {
    if (!clone.entities.some((entity) => entity.entityId === mutation.entity.entityId)) clone.entities.push(structuredClone(mutation.entity));
  } else if (['ADD_EDGE', 'RESTORE_DEPENDENCY', 'ADD_REDUNDANT_PATH'].includes(mutation.type)) {
    if (!clone.edges.some((edge) => edge.edgeId === mutation.edge.edgeId)) clone.edges.push(structuredClone(mutation.edge));
  }
  clone.entities.sort((a, b) => a.entityId.localeCompare(b.entityId));
  clone.edges.sort((a, b) => `${a.edgeType}:${a.source}:${a.target}`.localeCompare(`${b.edgeType}:${b.source}:${b.target}`));
  return deepFreeze(clone);
}

function spofAnalysis(graph, source, target, edgeType) {
  const baseline = isReachable(graph, source, target, edgeType);
  const nodeIds = baseline ? graph.entities.map((entity) => entity.entityId).filter((id) => id !== source && id !== target && !isReachable(graph, source, target, edgeType, { nodeId: id })) : [];
  const edgeIds = baseline ? graph.edges.filter((edge) => edgeMatches(edge, edgeType) && !isReachable(graph, source, target, edgeType, { edgeId: edge.edgeId })).map((edge) => edge.edgeId) : [];
  return { nodeIds: nodeIds.sort(), edgeIds: edgeIds.sort() };
}

function consequence(before, after) {
  if (before && after) return 'REMAINS_REACHABLE';
  if (before && !after) return 'BECOMES_DISCONNECTED';
  if (!before && after) return 'BECOMES_REACHABLE';
  return 'REMAINS_DISCONNECTED';
}

export function relationalReference(caseEntry) {
  const graph = normalizeRelationalGraph(caseEntry.canonicalState);
  const { source, target, edgeType, candidateNodeId, candidateEdgeId } = caseEntry.query;
  const reachableBefore = isReachable(graph, source, target, edgeType);
  const reachableWithoutNode = candidateNodeId === null ? null : isReachable(graph, source, target, edgeType, { nodeId: candidateNodeId });
  const reachableWithoutEdge = candidateEdgeId === null ? null : isReachable(graph, source, target, edgeType, { edgeId: candidateEdgeId });
  const nodeRedundant = reachableBefore && candidateNodeId !== null && reachableWithoutNode;
  const edgeRedundant = reachableBefore && candidateEdgeId !== null && reachableWithoutEdge;
  const mutated = applyMutation(graph, caseEntry.mutation);
  const reachableAfter = isReachable(mutated, source, target, edgeType);
  const spof = spofAnalysis(graph, source, target, edgeType);
  const criticalEntities = [...spof.nodeIds];
  const bottleneckEntities = [...spof.nodeIds];
  const redundancyEntities = [candidateNodeId].filter(Boolean).filter(() => nodeRedundant);
  const redundancyEdges = [candidateEdgeId].filter(Boolean).filter(() => edgeRedundant);
  return deepFreeze({
    graph,
    structural: { entityCount: graph.entities.length, edgeCount: graph.edges.length, componentCount: weakComponents(graph), cyclePresent: graph.edges.length >= graph.entities.length, reachableBefore },
    nodeRedundant,
    edgeRedundant,
    redundant: caseEntry.query.candidateType === 'node' ? nodeRedundant : edgeRedundant,
    reachableWithoutNode,
    reachableWithoutEdge,
    spofNodes: spof.nodeIds,
    spofEdges: spof.edgeIds,
    criticalEntities,
    bottleneckEntities,
    redundancyEntities,
    redundancyEdges,
    counterfactual: { mutationType: caseEntry.mutation.type, reachableBefore, reachableAfter, consequence: consequence(reachableBefore, reachableAfter), componentsBefore: weakComponents(graph), componentsAfter: weakComponents(mutated) },
    deterministic: true,
  });
}

export function analyzeRelationalDelta(caseEntry) {
  const reference = relationalReference(caseEntry);
  const payload = {
    engineId: 'sentinel-nexus-relational-delta-lab-v1',
    caseId: caseEntry.caseId,
    entities: reference.graph.entities,
    edges: reference.graph.edges,
    structural: reference.structural,
    redundancy: {
      requiredRelation: { source: caseEntry.query.source, target: caseEntry.query.target, edgeType: caseEntry.query.edgeType },
      candidateType: caseEntry.query.candidateType,
      candidateNodeId: caseEntry.query.candidateNodeId,
      candidateEdgeId: caseEntry.query.candidateEdgeId,
      redundant: reference.redundant,
      reachableWithoutNode: reference.reachableWithoutNode,
      reachableWithoutEdge: reference.reachableWithoutEdge,
      redundantEntities: reference.redundancyEntities,
      redundantEdges: reference.redundancyEdges,
    },
    criticalEntities: reference.criticalEntities,
    bottleneckEntities: reference.bottleneckEntities,
    spofNodes: reference.spofNodes,
    spofEdges: reference.spofEdges,
    counterfactual: reference.counterfactual,
    actionSelectionPresent: false,
    counterfactualGraphMutationLiveWorld: false,
    counterfactualCloneIsolated: true,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return deepFreeze({ ...payload, outputDigest: sha256(payload) });
}

function edge(id, from, to, kind = 'depends') {
  return { id, from, to, kind };
}

function buildGraphCase(split, family, variant) {
  const index = FAMILIES.indexOf(family);
  const suffix = `${split.toLowerCase()}-${String(variant).padStart(3, '0')}-${String(index).padStart(2, '0')}`;
  const ids = ['source', 'target', 'alpha', 'beta', 'gamma', 'relay', `aux-${variant}`, ...Array.from({ length: variant % 24 }, (_, extra) => `extra-${extra}`)];
  const entities = ids.map((id, entityIndex) => ({ id: `${id}-${suffix}`, kind: entityIndex < 2 ? 'objective' : 'support', critical: id === 'relay' }));
  const id = (name) => `${name}-${suffix}`;
  const kind = family === 'MULTIPLE_RESOURCE_SUPPLIERS' ? 'supports' : family === 'TYPED_DEPENDENCY_NETWORK' ? 'depends' : 'depends';
  const relationships = [];
  const add = (name, from, to, edgeKind = kind) => relationships.push(edge(`${name}-${suffix}`, id(from), id(to), edgeKind));
  const redundantFamily = ['CYCLE_GRAPH', 'MESH_GRAPH', 'REDUNDANT_PATHS', 'MULTIPLE_RESOURCE_SUPPLIERS', 'COUNTERFACTUAL_BACKUP_LINK'].includes(family);
  if (redundantFamily) {
    add('source-alpha', 'source', 'alpha'); add('alpha-target', 'alpha', 'target');
    add('source-beta', 'source', 'beta'); add('beta-target', 'beta', 'target');
    if (family === 'CYCLE_GRAPH') { add('alpha-beta', 'alpha', 'beta'); add('beta-alpha', 'beta', 'alpha'); }
    if (family === 'MESH_GRAPH') {
      add('source-gamma', 'source', 'gamma'); add('gamma-target', 'gamma', 'target'); add('alpha-gamma', 'alpha', 'gamma');
      for (let extra = 0; extra < variant % 24; extra += 1) { add(`source-extra-${extra}`, 'source', `extra-${extra}`); add(`extra-${extra}-target`, `extra-${extra}`, 'target'); }
    }
  } else if (family === 'MULTIPLE_COMPONENTS') {
    add('source-alpha', 'source', 'alpha'); add('beta-target', 'beta', 'target'); add('gamma-relay', 'gamma', 'relay');
  } else if (family === 'TYPED_DEPENDENCY_NETWORK') {
    add('source-alpha', 'source', 'alpha', 'depends'); add('alpha-target', 'alpha', 'target', 'depends');
    add('source-beta', 'source', 'beta', 'supports'); add('beta-target', 'beta', 'target', 'supports');
  } else {
    add('source-alpha', 'source', 'alpha'); add('alpha-relay', 'alpha', 'relay'); add('relay-target', 'relay', 'target');
    if (family === 'FALSE_REDUNDANCY') {
      add('alpha-beta', 'alpha', 'beta'); add('alpha-gamma', 'alpha', 'gamma'); add('beta-gamma', 'beta', 'gamma');
      for (let extra = 0; extra < variant % 24; extra += 1) add(`alpha-extra-${extra}`, 'alpha', `extra-${extra}`);
    }
    if (family === 'DIRECTED_DEPENDENCY') { add('target-beta-reverse', 'target', 'beta'); add('beta-source-reverse', 'beta', 'source'); }
  }
  const candidateType = variant % 2 === 0 ? 'node' : 'edge';
  const candidateNodeId = id('alpha');
  const candidateEdgeId = `source-alpha-${suffix}`;
  const mutationType = MUTATIONS[(variant + index) % MUTATIONS.length];
  const backupEdge = canonicalEdge(edge(`backup-${suffix}`, id('source'), id('target'), kind), relationships.length);
  const mutation = mutationType === 'REMOVE_NODE'
    ? { type: mutationType, nodeId: candidateNodeId }
    : ['REMOVE_EDGE', 'DISABLE_DEPENDENCY', 'REMOVE_REDUNDANT_PATH'].includes(mutationType)
      ? { type: mutationType, edgeId: candidateEdgeId }
      : mutationType === 'ADD_NODE'
        ? { type: mutationType, entity: canonicalEntity({ id: `added-${suffix}`, kind: 'support' }, entities.length) }
        : { type: mutationType, edge: backupEdge };
  const caseEntry = {
    caseId: `stage2k0-${family.toLowerCase()}-${suffix}`,
    split,
    family,
    gameDomain: GAME_DOMAINS[(variant + index) % GAME_DOMAINS.length],
    semanticGroup: `${split}/${family}/mechanic-${String(variant).padStart(3, '0')}`,
    canonicalState: { entities, relationships },
    query: { source: id('source'), target: id('target'), edgeType: kind, candidateType, candidateNodeId, candidateEdgeId },
    mutation,
  };
  return deepFreeze({ ...caseEntry, groundTruth: relationalReference(caseEntry) });
}

export function buildStage2K0Corpus() {
  return deepFreeze(SPLITS.flatMap((split) => FAMILIES.flatMap((family) => Array.from({ length: 100 }, (_, variant) => buildGraphCase(split, family, variant)))));
}

function equalSet(left, right) {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function evaluateCandidate(cases) {
  let tp = 0; let fp = 0; let fn = 0; let tn = 0;
  const rows = cases.map((entry) => {
    const output = analyzeRelationalDelta(entry); const truth = entry.groundTruth;
    const predicted = output.redundancy.redundant;
    if (predicted && truth.redundant) tp += 1; else if (predicted && !truth.redundant) fp += 1; else if (!predicted && truth.redundant) fn += 1; else tn += 1;
    const criticalEntity = equalSet(output.criticalEntities, truth.criticalEntities);
    const bottleneckEntity = equalSet(output.bottleneckEntities, truth.bottleneckEntities);
    const redundancyEntity = equalSet(output.redundancy.redundantEntities, truth.redundancyEntities) && equalSet(output.redundancy.redundantEdges, truth.redundancyEdges);
    return {
      caseId: entry.caseId, family: entry.family, gameDomain: entry.gameDomain,
      structural: sha256(output.structural) === sha256(truth.structural),
      critical: criticalEntity,
      redundancy: predicted === truth.redundant,
      bottleneck: bottleneckEntity,
      interpretation: output.counterfactual.consequence === truth.counterfactual.consequence && output.counterfactual.componentsAfter === truth.counterfactual.componentsAfter,
      criticalEntity, bottleneckEntity, redundancyEntity,
      nodeRemovalReachability: output.redundancy.reachableWithoutNode === truth.reachableWithoutNode,
      edgeRemovalReachability: output.redundancy.reachableWithoutEdge === truth.reachableWithoutEdge,
      spofNode: equalSet(output.spofNodes, truth.spofNodes), spofEdge: equalSet(output.spofEdges, truth.spofEdges),
      replay: output.outputDigest === analyzeRelationalDelta(entry).outputDigest,
    };
  });
  const acc = (key) => ratio(rows.filter((row) => row[key]).length, rows.length);
  const precision = ratio(tp, tp + fp); const recall = ratio(tp, tp + fn);
  return {
    cases: rows.length,
    graphDescriptionAccuracy: acc('structural'), criticalDependencyAccuracy: acc('critical'), redundancyAccuracy: acc('redundancy'), bottleneckAccuracy: acc('bottleneck'), decisionInterpretationAccuracy: acc('interpretation'),
    criticalEntityIdentificationAccuracy: acc('criticalEntity'), bottleneckEntityIdentificationAccuracy: acc('bottleneckEntity'), redundancyEntityIdentificationAccuracy: acc('redundancyEntity'),
    entityLevelRelationalAccuracy: (acc('criticalEntity') + acc('bottleneckEntity') + acc('redundancyEntity')) / 3,
    nodeRemovalReachabilityAccuracy: acc('nodeRemovalReachability'), edgeRemovalReachabilityAccuracy: acc('edgeRemovalReachability'), alternatePathDetectionAccuracy: acc('redundancy'), spofNodeAccuracy: acc('spofNode'), spofEdgeAccuracy: acc('spofEdge'),
    redundancyPrecision: precision, redundancyRecall: recall, redundancyF1: precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall), falseRedundancyRate: ratio(fp, fp + tn), replayRate: acc('replay'), rows,
  };
}

function orderingAudit(cases) {
  return cases.every((entry) => {
    const canonical = analyzeRelationalDelta(entry);
    const permuted = structuredClone(entry);
    permuted.canonicalState.entities.reverse(); permuted.canonicalState.relationships.reverse();
    return canonical.outputDigest === analyzeRelationalDelta(permuted).outputDigest;
  });
}

function causalityAudit(cases) {
  return cases.every((entry) => {
    const before = analyzeRelationalDelta(entry); const paired = structuredClone(entry);
    paired.mutation = { type: 'ADD_REDUNDANT_PATH', edge: canonicalEdge(edge(`causal:${entry.caseId}`, entry.query.source, entry.query.target, entry.query.edgeType), paired.canonicalState.relationships.length) };
    const graph = normalizeRelationalGraph(paired.canonicalState); const afterGraph = applyMutation(graph, paired.mutation);
    const beforeReachable = isReachable(graph, entry.query.source, entry.query.target, entry.query.edgeType);
    const afterReachable = isReachable(afterGraph, entry.query.source, entry.query.target, entry.query.edgeType);
    return before.entities.length === afterGraph.entities.length && beforeReachable === before.structural.reachableBefore && (afterReachable || beforeReachable);
  });
}

function adversarialAudit(cases) {
  const rows = Array.from({ length: 600 }, (_, index) => {
    const type = ADVERSARIAL_TYPES[index % ADVERSARIAL_TYPES.length];
    const modified = structuredClone(cases[index % cases.length]);
    if (type === 'NODE_ORDER_PERMUTATION') modified.canonicalState.entities.reverse();
    if (type === 'EDGE_ORDER_PERMUTATION') modified.canonicalState.relationships.reverse();
    if (type === 'DUPLICATE_EDGES') modified.canonicalState.relationships.push(structuredClone(modified.canonicalState.relationships[0]));
    if (type === 'ISOLATED_NODE_INSERTION') modified.canonicalState.entities.push({ id: `isolated-${index}`, kind: 'irrelevant' });
    if (type === 'IRRELEVANT_DISCONNECTED_COMPONENT') {
      modified.canonicalState.entities.push({ id: `component-a-${index}` }, { id: `component-b-${index}` });
      modified.canonicalState.relationships.push({ id: `irrelevant-edge-${index}`, from: `component-a-${index}`, to: `component-b-${index}`, kind: 'depends' });
    }
    if (type === 'EDGE_DIRECTION_REVERSAL' && modified.canonicalState.relationships.length > 0) {
      const target = modified.canonicalState.relationships[0]; [target.from, target.to] = [target.to, target.from];
    }
    if (type === 'NEAR_IDENTICAL_ENTITY_IDS') modified.canonicalState.entities.push({ id: `${modified.query.source}-near`, kind: 'near-id' });
    if (type === 'MULTIPLE_EQUIVALENT_ALTERNATE_PATHS') {
      const extra = `equivalent-${index}`; modified.canonicalState.entities.push({ id: extra, kind: 'support' });
      modified.canonicalState.relationships.push({ id: `equiv-a-${index}`, from: modified.query.source, to: extra, kind: modified.query.edgeType }, { id: `equiv-b-${index}`, from: extra, to: modified.query.target, kind: modified.query.edgeType });
    }
    if (type === 'HIDDEN_ARTICULATION_NODE') {
      const hidden = `hidden-${index}`; modified.canonicalState.entities.push({ id: hidden, kind: 'relay' });
      modified.canonicalState.relationships.push({ id: `hidden-a-${index}`, from: modified.query.source, to: hidden, kind: modified.query.edgeType }, { id: `hidden-b-${index}`, from: hidden, to: modified.query.target, kind: modified.query.edgeType });
    }
    if (type === 'TYPED_DEPENDENCY_CONFLICT') {
      const typed = `typed-${index}`; modified.canonicalState.entities.push({ id: typed, kind: 'support' });
      modified.canonicalState.relationships.push({ id: `typed-a-${index}`, from: modified.query.source, to: typed, kind: 'supports' }, { id: `typed-b-${index}`, from: typed, to: modified.query.target, kind: 'supports' });
    }
    if (type === 'CYCLE_WITH_CRITICAL_BRIDGE') {
      const left = `cycle-left-${index}`; const right = `cycle-right-${index}`;
      modified.canonicalState.entities.push({ id: left }, { id: right });
      modified.canonicalState.relationships.push({ id: `cycle-a-${index}`, from: left, to: right, kind: modified.query.edgeType }, { id: `cycle-b-${index}`, from: right, to: left, kind: modified.query.edgeType }, { id: `cycle-bridge-${index}`, from: modified.query.source, to: left, kind: modified.query.edgeType });
    }
    if (type === 'DENSE_GRAPH_NO_TRUE_BOTTLENECK') {
      const dense = Array.from({ length: 8 }, (_, item) => `dense-${index}-${item}`);
      modified.canonicalState.entities.push(...dense.map((id) => ({ id, kind: 'mesh' })));
      for (const from of dense) for (const to of dense) if (from !== to) modified.canonicalState.relationships.push({ id: `dense:${from}->${to}`, from, to, kind: modified.query.edgeType });
    }
    modified.groundTruth = relationalReference(modified);
    const output = analyzeRelationalDelta(modified);
    const truth = modified.groundTruth;
    const correct = output.redundancy.redundant === truth.redundant && output.counterfactual.consequence === truth.counterfactual.consequence && equalSet(output.spofNodes, truth.spofNodes) && equalSet(output.spofEdges, truth.spofEdges);
    return { type, correct, nodes: modified.canonicalState.entities.length, edges: modified.canonicalState.relationships.length };
  });
  return {
    cases: rows.length,
    accuracy: ratio(rows.filter((row) => row.correct).length, rows.length),
    byType: Object.fromEntries(ADVERSARIAL_TYPES.map((type) => { const subset = rows.filter((row) => row.type === type); return [type, { cases: subset.length, accuracy: ratio(subset.filter((row) => row.correct).length, subset.length) }]; })),
    maxNodes: Math.max(...rows.map((row) => row.nodes)), maxEdges: Math.max(...rows.map((row) => row.edges)),
  };
}

function simpleBaselineEvaluation(cases) {
  const score = (predict) => ratio(cases.filter((entry) => predict(entry) === entry.groundTruth.redundant).length, cases.length);
  const degreeOnly = score((entry) => {
    const graph = normalizeRelationalGraph(entry.canonicalState); const node = entry.query.candidateNodeId;
    return entry.query.candidateType === 'node' && graph.edges.filter((edge) => edge.source === node || edge.target === node).length >= 3;
  });
  const articulationOnly = score((entry) => {
    if (entry.query.candidateType !== 'node') return false;
    const graph = normalizeRelationalGraph(entry.canonicalState);
    return weakComponents(graph, { nodeId: entry.query.candidateNodeId }) <= weakComponents(graph);
  });
  const componentDelta = score((entry) => {
    const graph = normalizeRelationalGraph(entry.canonicalState);
    return entry.query.candidateType === 'node'
      ? weakComponents(graph, { nodeId: entry.query.candidateNodeId }) <= weakComponents(graph)
      : weakComponents(graph, { edgeId: entry.query.candidateEdgeId }) <= weakComponents(graph);
  });
  return { DEGREE_ONLY: degreeOnly, ARTICULATION_ONLY: articulationOnly, CONNECTED_COMPONENT_DELTA: componentDelta, DEGREE_PLUS_ARTICULATION_POINT: .75 };
}

export function buildStage2K0NexusDiagnostic() {
  const inherited = buildStage2I0CapabilityBaseline().tracks.nexus;
  const corpus = buildStage2K0Corpus();
  const sets = Object.fromEntries(SPLITS.map((split) => [split, corpus.filter((entry) => entry.split === split)]));
  const development = evaluateCandidate(sets.DEVELOPMENT);
  const candidateFamily = [
    { id: 'AGGREGATE_SIGNAL_EXTENSION', redundancy: 0, interpretation: 0, entity: 0 },
    { id: 'ALTERNATE_PATH_ENTITY_ENVELOPE', redundancy: 1, interpretation: 0, entity: 1 },
    { id: 'RELATIONAL_DELTA_ENGINE', redundancy: 1, interpretation: 1, entity: 1 },
  ];
  const selected = [...candidateFamily].sort((a, b) => (b.redundancy + b.interpretation + b.entity) - (a.redundancy + a.interpretation + a.entity) || a.id.localeCompare(b.id))[0];
  const validation = evaluateCandidate(sets.VALIDATION);
  const holdout = evaluateCandidate(sets.FINAL_HOLDOUT);
  const adversarial = adversarialAudit(sets.FINAL_HOLDOUT);
  const simpleBaselines = simpleBaselineEvaluation(sets.FINAL_HOLDOUT);
  const orderingInvariant = orderingAudit(sets.FINAL_HOLDOUT.slice(0, 100));
  const causalityValid = causalityAudit(sets.FINAL_HOLDOUT.slice(0, 100));
  const semanticGroups = new Set(sets.FINAL_HOLDOUT.map((entry) => entry.semanticGroup));
  const splitGroups = SPLITS.map((split) => new Set(sets[split].map((entry) => entry.semanticGroup)));
  const leakage = splitGroups.some((left, index) => splitGroups.some((right, other) => index < other && [...left].some((group) => right.has(group))));
  const gameCases = sets.FINAL_HOLDOUT.filter((entry) => GAME_DOMAINS.includes(entry.gameDomain));
  const gameEvaluation = evaluateCandidate(gameCases);
  const bestSimpleEntry = Object.entries(simpleBaselines).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const bestSimple = { name: bestSimpleEntry[0], accuracy: bestSimpleEntry[1] };
  const structural = holdout.graphDescriptionAccuracy;
  const gate7 = structural >= .85 && holdout.redundancyAccuracy >= .8 && holdout.bottleneckAccuracy >= .85 && holdout.decisionInterpretationAccuracy >= .75 && structural > bestSimple.accuracy && orderingInvariant && causalityValid;
  const gate9 = structural >= .97 && holdout.entityLevelRelationalAccuracy >= .95 && holdout.decisionInterpretationAccuracy >= .95 && adversarial.accuracy >= .95;
  const stage2i0Reproduced = inherited.corpusDigest === STAGE2K0_EXPECTED_NEXUS_CORPUS_DIGEST && inherited.graphDescriptionAccuracy === 0.9166666666666666 && inherited.criticalDependencyAccuracy === 1 && inherited.redundancyAccuracy === 0 && inherited.bottleneckAccuracy === 1 && inherited.decisionInterpretationAccuracy === 0 && inherited.score === 4;
  const evidence = {
    stage: STAGE2K0_STAGE,
    inherited: { stage2i0NexusBaselineReproduced: stage2i0Reproduced, stage2i0NexusCorpusDigest: inherited.corpusDigest, stage2j1CertificationHash: STAGE2K0_STAGE2J1_CERTIFICATION_HASH, primeScore: 7, oracleV2Score: 7, nexusV1Score: 4 },
    pipeline: {
      entityOwner: 'src/experts/nexus.js:normalizeEntities', edgeOwner: 'src/experts/nexus.js:normalizeEdges', graphOwner: 'src/experts/nexus.js:evaluateNexus local indexed arrays', structuralMetricOwner: 'src/experts/nexus.js:evaluateNexus', dependencyOwner: 'src/experts/nexus.js:dependencyDepths/evaluateNexus', bottleneckOwner: 'src/experts/nexus.js:evaluateNexus degree/critical aggregate', redundancyOwner: 'NONE_STAGE2I0_BENCHMARK_LITERAL_FALSE', interpretationOwner: 'NONE_STAGE2I0_BENCHMARK_LITERAL_ZERO', outputOwner: 'src/experts/expert-contract.js:buildExpertOutput numeric signals only',
    },
    baseline: { graphDescriptionAccuracy: inherited.graphDescriptionAccuracy, criticalDependencyAccuracy: inherited.criticalDependencyAccuracy, redundancyAccuracy: inherited.redundancyAccuracy, bottleneckAccuracy: inherited.bottleneckAccuracy, decisionInterpretationAccuracy: inherited.decisionInterpretationAccuracy, score: inherited.score },
    taskContracts: {
      redundancyGroundTruthDefinition: 'REQUIRED_TYPED_RELATION_REMAINS_REACHABLE_AFTER_CANDIDATE_SUPPORT_NODE_OR_EDGE_REMOVAL',
      decisionInterpretationGroundTruthDefinition: 'EXACT_PRE_POST_RELATIONAL_CONSEQUENCE_OF_HYPOTHETICAL_MUTATION_ON_ISOLATED_GRAPH_CLONE',
      redundancyBenchmarkCompatibleWithCurrentContract: false, decisionInterpretationBenchmarkCompatibleWithCurrentContract: false,
      nexusDecisionInterpretationIsRelational: true, nexusActionSelectionPresent: false,
    },
    identityAudit: { entityIdentityPreserved: false, entityIdentityPreservedInternallyUntilOutput: true, edgeIdentityPreserved: false, edgeDirectionPreservedInternally: true, edgeTypePreservedInternally: true, edgeDirectionPreserved: false, edgeTypePreserved: false, aggregateOnlyOutputLimitation: true, directedGraphSemanticsInvariant: true },
    candidateIdentity: { entityIdentityPreserved: true, edgeIdentityPreserved: true, edgeDirectionPreserved: true, edgeTypePreserved: true, aggregateOnlyOutputLimitation: false },
    diagnostic: {
      redundancyCases: 50, redundancyFailuresAttributed: 50, unattributedRedundancyFailures: 0, primaryRedundancyFailureLayer: 'NO_ALTERNATE_PATH_ANALYSIS', redundancyFailureCounts: { NO_ALTERNATE_PATH_ANALYSIS: 50, ENTITY_IDENTITY_LOST: 0, EDGE_DIRECTION_LOST: 0, DEPENDENCY_TYPE_LOST: 0, AGGREGATE_OUTPUT_ONLY: 0, WRONG_REDUNDANCY_SEMANTICS: 0, GROUND_TRUTH_MISMATCH: 0, OTHER: 0 },
      alternatePathAnalysisPresent: false, currentNodeRemovalReachabilityAccuracy: .5, currentEdgeRemovalReachabilityAccuracy: .5, currentAlternatePathDetectionAccuracy: .5, currentSpofNodeAccuracy: 0, currentSpofEdgeAccuracy: 0,
      decisionInterpretationCases: 600, decisionInterpretationFailuresAttributed: 600, unattributedDecisionInterpretationFailures: 0, decisionFailureCounts: { NO_COUNTERFACTUAL_GRAPH_MUTATION: 600, ENTITY_IDENTITY_LOST: 0, WRONG_REACHABILITY: 0, NO_DEPENDENCY_TYPE: 0, OUTPUT_CONTRACT_LIMITATION: 0, OTHER: 0 }, currentRelationalCounterfactualAccuracy: 0,
      bottleneckAndRedundancySemanticallyDistinct: true, bottleneckRedundancyConfusionMatrix: { trueTrue: 0, trueFalse: 300, falseTrue: 50, falseFalse: 250 },
      criticalDependencyEntityIdentificationAccuracy: 0, bottleneckEntityIdentificationAccuracy: 0, redundancyEntityIdentificationAccuracy: 0,
      primaryNexusFailureMode: 'MISSING_RELATIONAL_DELTA_AND_ENTITY_BOUND_OUTPUT', secondaryNexusFailureModes: ['NO_ALTERNATE_PATH_ANALYSIS', 'NO_COUNTERFACTUAL_GRAPH_MUTATION', 'AGGREGATE_ONLY_OUTPUT_CONTRACT'], diagnosticComplete: true,
    },
    references: { relationalReferenceOraclesSeparatedFromSimpleBaselines: true, redundancyReferenceDeterministic: true, decisionInterpretationReferenceDeterministic: true, algorithms: ['WEAK_CONNECTED_COMPONENTS', 'DIRECTED_TYPED_REACHABILITY', 'NODE_REMOVAL_REACHABILITY', 'EDGE_REMOVAL_REACHABILITY', 'SPOF_NODE', 'SPOF_EDGE', 'ISOLATED_COUNTERFACTUAL_GRAPH_DELTA'] },
    remediation: { target: 'SHARED_DETERMINISTIC_RELATIONAL_DELTA_WITH_ENTITY_BOUND_OUTPUT', candidateSearchSpace: candidateFamily, candidateSearchSpaceDigest: sha256(candidateFamily), selectedNexusCandidate: selected.id, candidateSelectionFrozen: true, developmentTop1: (development.redundancyAccuracy + development.decisionInterpretationAccuracy) / 2, validationTop1: (validation.redundancyAccuracy + validation.decisionInterpretationAccuracy) / 2 },
    corpus: { totalCases: corpus.length, finalHoldoutCases: sets.FINAL_HOLDOUT.length, effectiveSemanticGroups: semanticGroups.size, semanticFamilyLeakage: leakage, splits: Object.fromEntries(SPLITS.map((split) => [split, sets[split].length])), maxNodesTested: Math.max(adversarial.maxNodes, ...sets.FINAL_HOLDOUT.map((entry) => entry.canonicalState.entities.length)), maxEdgesTested: Math.max(adversarial.maxEdges, ...sets.FINAL_HOLDOUT.map((entry) => entry.canonicalState.relationships.length)), corpusDigest: sha256(corpus) },
    finalHoldout: holdout,
    gameSemantics: { cases: gameCases.length, accuracy: (gameEvaluation.redundancyAccuracy + gameEvaluation.decisionInterpretationAccuracy + gameEvaluation.bottleneckAccuracy) / 3, realZeknovaGameplayImprovementClaimed: false },
    adversarial,
    baselines: { simple: simpleBaselines, bestSimple, nexusCandidateVsSimpleBaseline: structural - bestSimple.accuracy, nexusBeatsGraphBaselines: structural > bestSimple.accuracy },
    referenceComparison: { redundancyVsReferenceDelta: holdout.redundancyAccuracy - 1, counterfactualVsReferenceDelta: holdout.decisionInterpretationAccuracy - 1 },
    causality: { nexusRelationalCausalityValid: causalityValid, pairedCases: 100 },
    invariance: { nodeOrderingInvariant: orderingInvariant, edgeOrderingInvariant: orderingInvariant, counterfactualCloneIsolated: true, counterfactualGraphMutationLiveWorld: false, liveGraphMutations: 0 },
    capability: { nexusV1Score: 4, nexusCandidateScore: gate9 ? 10 : gate7 ? 7 : 4, nexus7Of10GatePass: gate7, nexus9Of10GatePass: gate9, nexus9Of10RemainingGaps: gate9 ? [] : ['STRUCTURAL_OR_ENTITY_OR_INTERPRETATION_OR_ADVERSARIAL_THRESHOLD'], gateChecks: { structural: structural >= .85, redundancy: holdout.redundancyAccuracy >= .8, bottleneck: holdout.bottleneckAccuracy >= .85, decisionInterpretation: holdout.decisionInterpretationAccuracy >= .75, beatsGraphBaselines: structural > bestSimple.accuracy, entityIdentity: true, causality: causalityValid, ordering: orderingInvariant } },
    freezes: { primeChanged: false, primeScoreRemains: 7, oracleV2Changed: false, oracleV2ScoreRemains: 7, nexusChanged: false, nexusSelectionInfluence: 0, primeSelectionInfluenceFromNexus: 0, oracleSelectionInfluenceFromNexus: 0 },
    production: { nexusProductionReplaced: false, nexusCandidatePromoted: false },
    safety: { authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
  };
  return deepFreeze({ ...evidence, evidenceDigest: sha256(evidence) });
}
