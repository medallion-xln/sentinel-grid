import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorld, hashWorld, legalActions } from '../src/forge/kernel.js';
import { generateScenario } from '../src/forge/scenarios.js';
import { admitGeneratedScenario } from '../src/forge/validators.js';
import { evaluateCounterfactuals } from '../src/forge/counterfactual.js';
import { FORGE_REWARD_VERSION, scalarizeReward, emptyRewardVector } from '../src/forge/contract.js';

import {
  FORGE_REWARD_V2_COMPONENT_IDS, FORGE_REWARD_V2_VERSION, objectivePotential, optionPotential,
  potentialsOf, rewardV2For, scalarizeRewardV2, emptyRewardV2Vector,
} from '../src/forge/reward-v2.js';
import {
  CONTINUATION_POLICIES, CONTINUATION_POLICY_IDS, classifyHorizonDependence,
  evaluateAcrossPolicies, evaluateCounterfactualsV2,
} from '../src/forge/counterfactual-v2.js';
import {
  NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP, SUPERVISION_CLASSES, TIE_CLASSES,
  analysePareto, buildTieTaxonomy, classifySupervision, classifyTie, paretoCompare,
} from '../src/forge/supervision.js';
import {
  FORGE_TOPOLOGY_SHAPES, FORGE_TOPOLOGY_SHAPE_IDS, connectedComponents, cutNodes,
  generateTopology, hasDirectedCycle, longestDependencyDepth, reachableCount,
} from '../src/forge/topology.js';
import {
  FORGE_CURRICULUM_V2_AXIS_SIZES, FORGE_HORIZON_BAND_IDS, FORGE_OBJECTIVE_COMPOSITION_IDS,
  FORGE_ROLE_COMPOSITIONS, FORGE_ROLE_COMPOSITION_IDS, curriculumV2Parameters, generateScenarioV2,
} from '../src/forge/scenarios-v2.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { exportPreferenceV2, exportRlV2, exportSftV2, measureLeakage, splitForTopology } from '../src/forge/dataset.js';
import { detectSoupFormat } from '../src/forge/soup-bridge.js';
import { auditGeneratorBoundaries, calibrateDifficulty, classifyRouterNeed } from '../src/lab/stage3b-microworld-curriculum.js';

const v2World = (overrides = {}) => {
  const config = generateScenarioV2({
    shape: 'chain', roles: 'redundant', objectives: 'reach_target',
    horizonBand: 'H2', level: 2, seed: 5, ...overrides,
  });
  return { config, world: createWorld(config.scenarioSeed, config) };
};

/* ---------------------------------------------------------------------------
 * FORGE_REWARD_V1 must remain frozen
 * ------------------------------------------------------------------------- */

test('the Stage 3A reward is untouched', () => {
  assert.equal(FORGE_REWARD_VERSION, 'FORGE_REWARD_V1');
  assert.equal(scalarizeReward({ ...emptyRewardVector(), objectiveProgress: 3, timeCost: 1 }), 29);
});

test('the Stage 3A oracle still produces its own answers', () => {
  const admitted = admitGeneratedScenario(generateScenario({ family: 'nexus/cycle', level: 3, seed: 9001 }));
  assert.equal(admitted.admitted, true);
  const first = evaluateCounterfactuals(admitted.world, { horizon: 3 });
  const second = evaluateCounterfactuals(admitted.world, { horizon: 3 });
  assert.equal(first.optimalActionKey, second.optimalActionKey);
  assert.equal(first.rewardVersion ?? 'FORGE_REWARD_V1', 'FORGE_REWARD_V1');
});

/* ---------------------------------------------------------------------------
 * Reward V2
 * ------------------------------------------------------------------------- */

test('V2 declares twelve components and is versioned separately from V1', () => {
  assert.equal(FORGE_REWARD_V2_VERSION, 'FORGE_REWARD_V2');
  assert.equal(FORGE_REWARD_V2_COMPONENT_IDS.length, 12);
  assert.notEqual(FORGE_REWARD_V2_VERSION, FORGE_REWARD_VERSION);
});

test('an unknown V2 reward version is refused', () => {
  assert.throws(() => scalarizeRewardV2(emptyRewardV2Vector(), 'FORGE_REWARD_V9'));
});

test('V2 scalarization is exact integer arithmetic', () => {
  const vector = { ...emptyRewardV2Vector(), immediateObjectiveProgress: 2, timeCost: 3 };
  assert.equal(scalarizeRewardV2(vector), 2 * 10 + 3 * -1);
  assert.ok(Number.isInteger(scalarizeRewardV2(vector)));
});

test('the potential terms are pure functions of world state', () => {
  const { world } = v2World();
  assert.deepEqual(potentialsOf(world), potentialsOf(structuredClone(world)));
  assert.ok(Number.isInteger(objectivePotential(world)));
  assert.ok(Number.isInteger(optionPotential(world)));
});

test('potential terms telescope: a no-op transition contributes zero', () => {
  const { world } = v2World();
  const vector = rewardV2For({ before: world, after: world, v1Vector: emptyRewardVector(), events: [] });
  assert.equal(vector.futureObjectivePotential, 0);
  assert.equal(vector.optionValue, 0);
});

test('losing a live substitute lowers option potential', () => {
  const { world } = v2World({ roles: 'redundant' });
  const before = optionPotential(world);
  const damaged = structuredClone(world);
  const substitute = damaged.entities.find((entity) => entity.type === 'SUBSTITUTE');
  assert.ok(substitute !== undefined, 'the redundant role composition placed no substitute');
  substitute.available = false;
  substitute.health = 0;
  assert.ok(optionPotential(damaged) < before, 'option potential ignored the loss of a substitute');
});

/* ---------------------------------------------------------------------------
 * Tie taxonomy — the classification the whole stage turns on
 * ------------------------------------------------------------------------- */

test('every tie class is declared and only two are reward defects', () => {
  assert.equal(TIE_CLASSES.length, 6);
  assert.ok(TIE_CLASSES.includes('GENUINE_STRATEGIC_EQUIVALENCE'));
  assert.ok(TIE_CLASSES.includes('INSUFFICIENT_REWARD_RESOLUTION'));
});

test('a tie whose branches reach one identical world is genuine equivalence, not a defect', () => {
  const branches = [
    { action: { actionType: 'MOVE' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 1 }, resultingStateHash: 'same', horizonStateHash: 'same', totalScalar: 5 },
    { action: { actionType: 'WAIT' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 1 }, resultingStateHash: 'same', horizonStateHash: 'same', totalScalar: 5 },
  ];
  const result = classifyTie({ exactTie: true, optimalScalar: 5, branches });
  assert.equal(result.class, 'GENUINE_STRATEGIC_EQUIVALENCE');
  assert.equal(result.rewardDefect, false);
});

/* The ordering that was wrong on the first attempt: paths that do NOT converge
 * are a reward defect, however different their immediate steps were. */
test('branches that never converge are a reward defect, not horizon aliasing', () => {
  const branches = [
    { action: { actionType: 'MOVE' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 2 }, resultingStateHash: 'x', horizonStateHash: 'p', totalScalar: 5 },
    { action: { actionType: 'REPAIR' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 3 }, resultingStateHash: 'y', horizonStateHash: 'q', totalScalar: 5 },
  ];
  const result = classifyTie({ exactTie: true, optimalScalar: 5, branches });
  assert.equal(result.class, 'INSUFFICIENT_REWARD_RESOLUTION');
  assert.equal(result.rewardDefect, true);
});

test('branches that differ then converge are horizon aliasing, and not a defect', () => {
  const branches = [
    { action: { actionType: 'MOVE' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 2 }, resultingStateHash: 'x', horizonStateHash: 'same', totalScalar: 5 },
    { action: { actionType: 'REPAIR' }, totalRewardVector: { a: 1 }, immediateRewardVector: { a: 3 }, resultingStateHash: 'y', horizonStateHash: 'same', totalScalar: 5 },
  ];
  const result = classifyTie({ exactTie: true, optimalScalar: 5, branches });
  assert.equal(result.class, 'HORIZON_ALIASING');
  assert.equal(result.rewardDefect, false);
});

test('different vectors with an equal scalar are scalarization collapse', () => {
  const branches = [
    { action: { actionType: 'MOVE' }, totalRewardVector: { a: 1, b: 0 }, immediateRewardVector: { a: 1 }, resultingStateHash: 'x', horizonStateHash: 'p', totalScalar: 5 },
    { action: { actionType: 'REPAIR' }, totalRewardVector: { a: 0, b: 1 }, immediateRewardVector: { a: 1 }, resultingStateHash: 'y', horizonStateHash: 'q', totalScalar: 5 },
  ];
  const result = classifyTie({ exactTie: true, optimalScalar: 5, branches });
  assert.equal(result.class, 'ACCIDENTAL_REWARD_COLLAPSE');
  assert.equal(result.rewardDefect, true);
});

test('V2 resolves reward-defect ties on the Stage 3A corpus and preserves genuine ones', () => {
  const before = [];
  const after = [];
  for (const family of ['nexus/dependency_chain', 'nexus/dead_substitute', 'oracle/reversal', 'prime/adversarial_choice']) {
    for (let level = 0; level <= 5; level += 1) {
      const admitted = admitGeneratedScenario(generateScenario({ family, level, seed: 9001 }));
      if (!admitted.admitted) continue;
      before.push({ family, level, counterfactuals: evaluateCounterfactuals(admitted.world, { horizon: 3 }) });
      after.push({ family, level, counterfactuals: evaluateCounterfactualsV2(admitted.world, { horizon: 4 }) });
    }
  }
  const taxonomyBefore = buildTieTaxonomy(before);
  const taxonomyAfter = buildTieTaxonomy(after);
  assert.ok(taxonomyAfter.rewardDefectCases < taxonomyBefore.rewardDefectCases,
    'V2 did not reduce reward-defect ties, so it is not doing the job it was added for');
  const genuineBefore = taxonomyBefore.genuineEquivalenceCases + taxonomyBefore.horizonAliasingCases;
  const genuineAfter = taxonomyAfter.genuineEquivalenceCases + taxonomyAfter.horizonAliasingCases;
  assert.ok(genuineAfter >= genuineBefore, 'V2 destroyed genuine ties, which is manufacturing labels');
});

/* ---------------------------------------------------------------------------
 * Pareto and supervision
 * ------------------------------------------------------------------------- */

test('Pareto comparison orients cost components correctly', () => {
  assert.equal(paretoCompare({ deliveredValue: 2, timeCost: 1 }, { deliveredValue: 1, timeCost: 1 }), 'PARETO_DOMINATING');
  assert.equal(paretoCompare({ deliveredValue: 1, timeCost: 1 }, { deliveredValue: 1, timeCost: 2 }), 'PARETO_DOMINATING');
  assert.equal(paretoCompare({ deliveredValue: 2, timeCost: 2 }, { deliveredValue: 1, timeCost: 1 }), 'PARETO_INCOMPARABLE');
  assert.equal(paretoCompare({ deliveredValue: 1 }, { deliveredValue: 1 }), 'PARETO_EQUIVALENT');
});

test('supervision classes are exhaustive and thresholds are declared', () => {
  assert.equal(SUPERVISION_CLASSES.length, 5);
  assert.ok(NEAR_TIE_MARGIN > 0);
  assert.ok(PREFERENCE_MINIMUM_GAP >= NEAR_TIE_MARGIN);
});

test('a clear single winner is UNIQUE_OPTIMUM and a narrow one is NEAR_TIE', () => {
  const make = (runnerUp) => ({
    exactTie: false, optimalScalar: 10, branches: [
      { actionKey: 'a', action: { actionType: 'MOVE' }, totalScalar: 10, totalRewardVector: {}, immediateRewardVector: {}, resultingStateHash: 'x', horizonStateHash: 'x' },
      { actionKey: 'b', action: { actionType: 'WAIT' }, totalScalar: runnerUp, totalRewardVector: {}, immediateRewardVector: {}, resultingStateHash: 'y', horizonStateHash: 'y' },
    ],
  });
  assert.equal(classifySupervision(make(10 - NEAR_TIE_MARGIN)).supervisionClass, 'UNIQUE_OPTIMUM');
  assert.equal(classifySupervision(make(10 - 1)).supervisionClass, 'NEAR_TIE');
});

/* ---------------------------------------------------------------------------
 * Topology
 * ------------------------------------------------------------------------- */

test('every declared shape generates edges at its minimum size and above', () => {
  for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
    const spec = FORGE_TOPOLOGY_SHAPES.find((entry) => entry.id === shape);
    for (const nodeCount of [spec.minNodes, spec.minNodes + 3, 20]) {
      const topology = generateTopology({ shape, nodeCount, seed: 3 });
      assert.ok(topology.edgeCount > 0, `${shape} at ${nodeCount} nodes produced no edges`);
      assert.ok(topology.nodeCount >= spec.minNodes, `${shape} was not clamped to its minimum`);
    }
  }
});

test('a request below the minimum is clamped up rather than degenerating', () => {
  for (const shape of FORGE_TOPOLOGY_SHAPE_IDS) {
    const topology = generateTopology({ shape, nodeCount: 1, seed: 1 });
    assert.ok(topology.nodeCount >= 3);
    assert.ok(topology.edgeCount > 0);
  }
});

test('ring and multi_cycle realize a cycle, chain and tree do not', () => {
  for (const shape of ['ring', 'multi_cycle']) {
    assert.equal(hasDirectedCycle(generateTopology({ shape, nodeCount: 8, seed: 2 }).edges), true, `${shape} has no cycle`);
  }
  for (const shape of ['chain', 'tree']) {
    assert.equal(hasDirectedCycle(generateTopology({ shape, nodeCount: 8, seed: 2 }).edges), false, `${shape} contains a cycle`);
  }
});

test('disconnected_islands really is disconnected and mesh really is not', () => {
  const islands = generateTopology({ shape: 'disconnected_islands', nodeCount: 9, seed: 4 });
  assert.ok(connectedComponents(islands.nodes, islands.edges) >= 2);
  const mesh = generateTopology({ shape: 'mesh', nodeCount: 9, seed: 4 });
  assert.equal(connectedComponents(mesh.nodes, mesh.edges), 1);
});

/* The bug that stopped the gate making progress: depth must be polynomial. */
test('dependency depth is computed in polynomial time on a dense graph', () => {
  const mesh = generateTopology({ shape: 'mesh', nodeCount: 28, seed: 9 });
  const started = Date.now();
  const depth = longestDependencyDepth(mesh.nodes[0], mesh.edges);
  assert.ok(Date.now() - started < 1000, 'depth computation took over a second, so it is not polynomial');
  assert.ok(depth > 0);
});

test('reachableCount and cutNodes agree with the shape they describe', () => {
  const bridge = generateTopology({ shape: 'bridge', nodeCount: 10, seed: 6 });
  const root = bridge.nodes.reduce((best, node) =>
    (reachableCount(node, bridge.edges) > reachableCount(best, bridge.edges) ? node : best), bridge.nodes[0]);
  assert.ok(reachableCount(root, bridge.edges) > 0);
  assert.ok(cutNodes(root, bridge.nodes, bridge.edges).length >= 1, 'a bridge has no cut node');
});

/* ---------------------------------------------------------------------------
 * Composed curriculum and its gate
 * ------------------------------------------------------------------------- */

test('the curriculum composes four axes into tens of thousands of combinations', () => {
  assert.equal(FORGE_CURRICULUM_V2_AXIS_SIZES.shapes, 15);
  assert.equal(FORGE_CURRICULUM_V2_AXIS_SIZES.horizonBands, 5);
  assert.ok(FORGE_CURRICULUM_V2_AXIS_SIZES.combinationsPerSeed > 20000);
});

test('curriculum parameters are a pure function of the level and grow with it', () => {
  for (const level of [0, 1, 2, 3, 4, 5]) assert.deepEqual(curriculumV2Parameters(level), curriculumV2Parameters(level));
  assert.ok(curriculumV2Parameters(5).topologyNodes > curriculumV2Parameters(0).topologyNodes);
  assert.ok(curriculumV2Parameters(5).energy < curriculumV2Parameters(0).energy);
  assert.throws(() => curriculumV2Parameters(9));
});

test('a composed scenario generates deterministically and is admitted', () => {
  const a = v2World();
  const b = v2World();
  assert.equal(hashWorld(a.world), hashWorld(b.world));
  const roleSpec = FORGE_ROLE_COMPOSITIONS.find((entry) => entry.id === 'redundant');
  const validation = validateScenarioV2(a.world, {
    shape: 'chain', roles: 'redundant', objectives: 'reach_target', horizonBand: 'H2', level: 2,
    horizon: a.config.horizon,
    roleComposition: { hostiles: roleSpec.hostiles, civilians: roleSpec.civilians, substitutes: roleSpec.substitutes },
  });
  assert.equal(validation.valid, true, validation.rejectionReasons.join('; '));
});

/* The gate's control: a scenario validated against the wrong shape must fail. */
test('the admission gate refuses a world validated against a different shape', () => {
  const { config, world } = v2World({ shape: 'chain' });
  const honest = validateScenarioV2(world, { shape: 'chain', horizon: config.horizon });
  assert.equal(honest.valid, true);
  const mislabelled = validateScenarioV2(world, { shape: 'ring', horizon: config.horizon });
  assert.equal(mislabelled.valid, false, 'a chain passed as a ring, so the shape check is a decoration');
  assert.ok(mislabelled.failedChecks.includes('RING_CYCLE'));
});

test('a world whose horizon band exceeds its remaining ticks is refused', () => {
  const { config, world } = v2World();
  const exhausted = structuredClone(world);
  exhausted.tick = exhausted.maxTicks - 1;
  const validation = validateScenarioV2(exhausted, { shape: 'chain', horizon: 99 });
  assert.equal(validation.valid, false);
  assert.ok(validation.failedChecks.includes('HORIZON_FITS'));
});

test('every generator shape passes its boundary audit', () => {
  const audit = auditGeneratorBoundaries();
  assert.equal(audit.shapeCount, 15);
  assert.equal(audit.boundaryAuditPass, true, JSON.stringify(audit.shapes.filter((entry) => !entry.alwaysClamped || !entry.alwaysConnected)));
});

/* ---------------------------------------------------------------------------
 * Continuation policies and horizon
 * ------------------------------------------------------------------------- */

test('the policy family is named, deterministic and plural', () => {
  assert.equal(CONTINUATION_POLICY_IDS.length, 3);
  for (const id of CONTINUATION_POLICY_IDS) assert.equal(typeof CONTINUATION_POLICIES[id].rank, 'function');
});

test('policy agreement is computed on optimal SETS, not on a tie-break', () => {
  const { world } = v2World();
  const across = evaluateAcrossPolicies(world, { horizon: 3 });
  assert.equal(across.policyCount, 3);
  assert.ok(['POLICY_INVARIANT_OPTIMUM', 'POLICY_DEPENDENT_OPTIMUM'].includes(across.agreementClass));
  if (across.policyInvariant) assert.ok(across.sharedOptimalActionKeys.length > 0);
});

test('V2 branching leaves the source world untouched and is order-independent', () => {
  const { world } = v2World();
  const before = hashWorld(world);
  const straight = evaluateCounterfactualsV2(world, { horizon: 3 });
  const shuffled = evaluateCounterfactualsV2(world, { horizon: 3, shuffleSeed: 77 });
  assert.equal(straight.sourceUnchanged, true);
  assert.equal(hashWorld(world), before);
  assert.deepEqual(straight.branches.map((branch) => branch.totalScalar), shuffled.branches.map((branch) => branch.totalScalar));
});

test('horizon dependence compares optimal sets under one reward', () => {
  const { world } = v2World({ horizonBand: 'H3' });
  const classification = classifyHorizonDependence(world, { horizon: 5 });
  assert.ok(['HORIZON_ALIGNED', 'HORIZON_DEPENDENT'].includes(classification.horizonClass));
  assert.ok(classification.greedyRegret === null || classification.greedyRegret >= 0);
  if (classification.horizonClass === 'HORIZON_ALIGNED') assert.ok(classification.overlapCount > 0);
  else assert.equal(classification.overlapCount, 0);
});

test('passing a precomputed evaluation does not change the classification', () => {
  const { world } = v2World();
  const deep = evaluateCounterfactualsV2(world, { horizon: 3 });
  const fresh = classifyHorizonDependence(world, { horizon: 3 });
  const reused = classifyHorizonDependence(world, { horizon: 3, deepEvaluation: deep });
  assert.equal(fresh.horizonClass, reused.horizonClass);
  assert.equal(fresh.greedyRegret, reused.greedyRegret);
});

/* ---------------------------------------------------------------------------
 * Splits, exports and Soup
 * ------------------------------------------------------------------------- */

test('split assignment is a pure function of the topology hash', () => {
  const digest = 'a'.repeat(64);
  assert.equal(splitForTopology(digest), splitForTopology(digest));
  assert.ok(['TRAIN', 'VALIDATION', 'HOLDOUT'].includes(splitForTopology(digest)));
});

test('leakage control reports zero overlap when splits are disjoint', () => {
  const result = measureLeakage({
    TRAIN: { worlds: new Set(['a']), topologies: new Set(['t1']) },
    HOLDOUT: { worlds: new Set(['b']), topologies: new Set(['t2']) },
  });
  assert.equal(result.exactWorldOverlap, 0);
  assert.equal(result.topologyLeakageControlPass, true);
});

test('leakage control detects a shared topology', () => {
  const result = measureLeakage({
    TRAIN: { worlds: new Set(['a']), topologies: new Set(['t1']) },
    HOLDOUT: { worlds: new Set(['b']), topologies: new Set(['t1']) },
  });
  assert.equal(result.topologyLeakage, 1);
  assert.equal(result.topologyLeakageControlPass, false);
});

function fakeRecord(overrides = {}) {
  return {
    recordHash: 'h', shape: 'chain', roles: 'bare', objectives: 'reach_target', horizonBand: 'H2',
    level: 2, split: 'TRAIN', entityCount: 8, relationCount: 7, objectiveCount: 1, energy: 30,
    tick: 0, maxTicks: 16, legalActionCount: 2, worldHash: 'w', topologyHash: 't',
    supervisionClass: 'UNIQUE_OPTIMUM', supervisionMargin: 9, horizonClass: 'HORIZON_ALIGNED',
    rewardVersion: 'FORGE_REWARD_V2', continuationPolicy: 'GREEDY_CONTINUATION_V1',
    optimalActionKey: 'k1', optimalScalar: 20, utilitySpread: 12, exactTie: false,
    branches: [
      { actionKey: 'k1', actionType: 'REPAIR', targetId: 'n1', parameters: {}, rewardVector: {}, immediateScalar: 5, scalarReward: 20, nextStateHash: 'x', terminal: false, regret: 0 },
      { actionKey: 'k2', actionType: 'WAIT', targetId: null, parameters: {}, rewardVector: {}, immediateScalar: 1, scalarReward: 8, nextStateHash: 'y', terminal: false, regret: 12 },
    ],
    ...overrides,
  };
}

test('SFT takes unique optima and names every equal optimum for equivalences', () => {
  const unique = exportSftV2([fakeRecord()]);
  assert.equal(unique.count, 1);
  assert.equal(detectSoupFormat(JSON.parse(unique.content)), 'alpaca');

  const equivalent = exportSftV2([fakeRecord({
    supervisionClass: 'EXACT_EQUIVALENCE', exactTie: true, optimalScalar: 20,
    branches: [
      { actionKey: 'k1', actionType: 'MOVE', targetId: null, parameters: {}, rewardVector: {}, immediateScalar: 5, scalarReward: 20, nextStateHash: 'x', terminal: false, regret: 0 },
      { actionKey: 'k2', actionType: 'WAIT', targetId: null, parameters: {}, rewardVector: {}, immediateScalar: 5, scalarReward: 20, nextStateHash: 'y', terminal: false, regret: 0 },
    ],
  })]);
  assert.equal(equivalent.count, 1);
  const row = JSON.parse(equivalent.content);
  assert.match(row.output, /Equally optimal \(2\)/, 'an equivalence was taught as a single arbitrary winner');
});

test('SFT excludes the classes that cannot be represented truthfully', () => {
  for (const cls of ['INSUFFICIENTLY_RESOLVED', 'PARETO_TRADEOFF', 'NEAR_TIE']) {
    const result = exportSftV2([fakeRecord({ supervisionClass: cls })]);
    assert.equal(result.count, 0, `${cls} produced an SFT row`);
    assert.equal(result.excluded[cls], 1);
  }
});

test('preference pairs are never emitted between equivalent actions', () => {
  const equivalent = exportPreferenceV2([fakeRecord({ supervisionClass: 'EXACT_EQUIVALENCE' })]);
  assert.equal(equivalent.count, 0);
  const tradeoff = exportPreferenceV2([fakeRecord({ supervisionClass: 'PARETO_TRADEOFF' })]);
  assert.equal(tradeoff.count, 0);
});

test('preference pairs carry a gap at or above the declared minimum and detect as dpo', () => {
  const result = exportPreferenceV2([fakeRecord()]);
  assert.equal(result.count, 1);
  const row = JSON.parse(result.content);
  assert.ok(row.forge_metadata.utilityGap >= PREFERENCE_MINIMUM_GAP);
  assert.notEqual(row.chosen, row.rejected);
  assert.equal(detectSoupFormat(row), 'dpo');
});

test('a gap below the minimum is skipped rather than emitted', () => {
  const narrow = exportPreferenceV2([fakeRecord({
    optimalScalar: 20,
    branches: [
      { actionKey: 'k1', actionType: 'REPAIR', targetId: null, parameters: {}, rewardVector: {}, immediateScalar: 5, scalarReward: 20, nextStateHash: 'x', terminal: false, regret: 0 },
      { actionKey: 'k2', actionType: 'WAIT', targetId: null, parameters: {}, rewardVector: {}, immediateScalar: 1, scalarReward: 19, nextStateHash: 'y', terminal: false, regret: 1 },
    ],
  })]);
  assert.equal(narrow.count, 0);
  assert.equal(narrow.skipped.GAP_BELOW_MINIMUM, 1);
});

test('RL keeps what the other exporters reject', () => {
  const rejected = fakeRecord({ supervisionClass: 'INSUFFICIENTLY_RESOLVED' });
  assert.equal(exportSftV2([rejected]).count, 0);
  assert.equal(exportRlV2([rejected]).count, rejected.branches.length);
});

test('exports are order-independent for RL and stable for SFT', () => {
  const records = [fakeRecord({ recordHash: 'a' }), fakeRecord({ recordHash: 'b' })];
  assert.equal(exportRlV2(records).count, exportRlV2([...records].reverse()).count);
  assert.equal(exportSftV2(records).count, 2);
});

/* ---------------------------------------------------------------------------
 * Router and difficulty
 * ------------------------------------------------------------------------- */

test('a case with no utility spread needs no specialist', () => {
  assert.equal(classifyRouterNeed(fakeRecord({ utilitySpread: 0 })), 'NO_SPECIALIST_NEEDED');
});

test('difficulty calibration reports monotone structure and a harder L5', () => {
  const records = [];
  for (const level of [0, 1, 2, 3, 4, 5]) {
    for (let index = 0; index < 4; index += 1) {
      records.push(fakeRecord({
        level, entityCount: 5 + level * 4, relationCount: 4 + level * 3,
        greedyRegret: level * 3, utilitySpread: 10 + level,
        horizonClass: level >= 3 ? 'HORIZON_DEPENDENT' : 'HORIZON_ALIGNED',
      }));
    }
  }
  const calibration = calibrateDifficulty(records);
  assert.equal(calibration.structuralComplexityMonotone, true);
  assert.equal(calibration.l5HarderThanL2, true);
  assert.equal(calibration.calibrationPass, true);
});

test('difficulty calibration fails when L5 is not harder than L2', () => {
  const records = [];
  for (const level of [0, 1, 2, 3, 4, 5]) {
    records.push(fakeRecord({ level, entityCount: 5 + level, greedyRegret: 3 }));
  }
  assert.equal(calibrateDifficulty(records).l5HarderThanL2, false);
});
