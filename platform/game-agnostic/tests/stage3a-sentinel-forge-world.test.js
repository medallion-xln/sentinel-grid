import test from 'node:test';
import assert from 'node:assert/strict';

import { validateAdapter } from '../src/core/contracts.js';
import { recommend } from '../src/prime/root-puct.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { evaluateOracle } from '../src/experts/oracle.js';

import {
  FORGE_ACTION_TYPE_NAMES, FORGE_ENTITY_TYPE_NAMES, FORGE_RELATION_TYPE_NAMES,
  FORGE_REWARD_COMPONENT_IDS, FORGE_REWARD_VERSION, ForgeContractError, ForgeIllegalActionError,
  emptyRewardVector, scalarizeReward, validateWorld,
} from '../src/forge/contract.js';
import {
  createWorld, hashWorld, isTerminal, legalActions, observe, score, step, topologyHash,
} from '../src/forge/kernel.js';
import { renderWorld } from '../src/forge/render.js';
import { FORGE_SCENARIO_FAMILY_IDS, FORGE_CURRICULUM_LEVELS, curriculumParameters, generateScenario } from '../src/forge/scenarios.js';
import { admitGeneratedScenario, validateScenario } from '../src/forge/validators.js';
import { counterfactualDigest, evaluateCounterfactuals, regretOf } from '../src/forge/counterfactual.js';
import { forgeAdapterState, forgeWorldAdapter } from '../src/forge/adapter.js';
import { buildReplayRecord, findAbsolutePaths, replaySetDigest, verifyReplayRecord } from '../src/forge/replay.js';
import { exportAll } from '../src/forge/export.js';
import {
  CANDIDATE_STATES, SOUP_COMMIT, TRAINING_PROVENANCE_FIELDS, buildSoupBridge, canTransition,
  detectSoupFormat, soupCanCertify, translatePreferenceToSoup, translateSftToSoup,
  validateTrainingProvenance,
} from '../src/forge/soup-bridge.js';
import { measureAdmissionGateSensitivity } from '../src/lab/stage3a-sentinel-forge-world.js';

const world = (family = 'nexus/dependency_chain', level = 2, seed = 1234) => {
  const config = generateScenario({ family, level, seed });
  return { config, world: createWorld(config.scenarioSeed, config) };
};

/* ---------------------------------------------------------------------------
 * World kernel
 * ------------------------------------------------------------------------- */

test('the contract declares a non-trivial vocabulary', () => {
  assert.ok(FORGE_ENTITY_TYPE_NAMES.length >= 10, 'too few entity types to model anything');
  assert.ok(FORGE_RELATION_TYPE_NAMES.length >= 11);
  assert.ok(FORGE_ACTION_TYPE_NAMES.length >= 12);
  assert.equal(FORGE_REWARD_COMPONENT_IDS.length, 11);
});

test('a generated world is structurally valid and non-terminal', () => {
  const { world: w } = world();
  assert.doesNotThrow(() => validateWorld(w));
  assert.equal(isTerminal(w), false);
  assert.ok(legalActions(w).length >= 2);
});

test('same seed and config regenerate a byte-identical world', () => {
  const a = world('nexus/cycle', 3, 77);
  const b = world('nexus/cycle', 3, 77);
  assert.equal(hashWorld(a.world), hashWorld(b.world));
});

test('different seeds produce different worlds', () => {
  assert.notEqual(hashWorld(world('nexus/cycle', 3, 77).world), hashWorld(world('nexus/cycle', 3, 78).world));
});

test('a world survives a serialize/reload round trip with identity intact', () => {
  const { world: w } = world();
  assert.equal(hashWorld(JSON.parse(JSON.stringify(w))), hashWorld(w));
});

test('step is pure: the source world is never mutated', () => {
  const { world: w } = world();
  const before = hashWorld(w);
  for (const action of legalActions(w)) step(w, action);
  assert.equal(hashWorld(w), before);
});

test('clone isolation: branches do not contaminate each other and order does not matter', () => {
  const { world: w } = world('prime/multi_objective_intervention', 3, 5);
  const before = hashWorld(w);
  const actions = legalActions(w);
  const forward = actions.map((action) => hashWorld(step(w, action).state));
  const backward = [...actions].reverse().map((action) => hashWorld(step(w, action).state)).reverse();
  assert.deepEqual(forward, backward);
  assert.equal(hashWorld(w), before);
});

test('world identity is semantic: the event log and version banners are excluded', () => {
  const { world: w } = world();
  const before = hashWorld(w);
  const decorated = structuredClone(w);
  decorated.events = [{ type: 'COSMETIC' }];
  decorated.kernelVersion = 'something-else';
  assert.equal(hashWorld(decorated), before);
});

test('score is integer-valued so equality is exact', () => {
  const { world: w } = world();
  const summary = score(w);
  for (const key of ['objective', 'infrastructure', 'civilian', 'tick', 'total']) {
    assert.ok(Number.isInteger(summary[key]), `${key} is not an integer`);
  }
});

/* ---------------------------------------------------------------------------
 * Legal actions
 * ------------------------------------------------------------------------- */

test('an unknown action type is refused by name and produces no world', () => {
  const { world: w } = world();
  const before = hashWorld(w);
  assert.throws(
    () => step(w, { actionType: 'TELEPORT', actorId: 'actor', target: null, parameters: {} }),
    (error) => error instanceof ForgeIllegalActionError && error.reason === 'UNKNOWN_ACTION_TYPE',
  );
  assert.equal(hashWorld(w), before);
});

test('an unknown actor and an unknown target are each refused by their own name', () => {
  const { world: w } = world();
  assert.throws(() => step(w, { actionType: 'WAIT', actorId: 'ghost', target: null, parameters: {} }),
    (error) => error.reason === 'ACTOR_NOT_FOUND');
  assert.throws(() => step(w, { actionType: 'REPAIR', actorId: 'actor', target: { kind: 'entity', id: 'nope' }, parameters: {} }),
    (error) => error.reason === 'TARGET_NOT_FOUND');
});

test('a terminal world offers no actions and refuses to be stepped', () => {
  const { world: w } = world();
  const terminal = structuredClone(w);
  terminal.tick = terminal.maxTicks;
  assert.equal(isTerminal(terminal), true);
  assert.deepEqual(legalActions(terminal), []);
  assert.throws(() => step(terminal, { actionType: 'WAIT', actorId: 'actor', target: null, parameters: {} }),
    (error) => error.reason === 'TERMINAL_STATE');
});

test('a malformed world is refused at validation rather than silently repaired', () => {
  const { world: w } = world();
  const duplicate = structuredClone(w);
  duplicate.entities.push({ ...duplicate.entities[0] });
  assert.throws(() => legalActions(duplicate), ForgeContractError);

  const unresolved = structuredClone(w);
  unresolved.relations.push({ type: 'dependsOn', from: 'actor', to: 'missing' });
  assert.throws(() => legalActions(unresolved), ForgeContractError);

  const outOfBounds = structuredClone(w);
  outOfBounds.entities[0].position = { x: 999, y: 999 };
  assert.throws(() => legalActions(outOfBounds), ForgeContractError);
});

test('legal actions are returned in canonical order', () => {
  const { world: w } = world();
  const keys = legalActions(w).map((action) => `${action.actionType}|${action.target?.id ?? ''}`);
  const reordered = legalActions(structuredClone(w)).map((action) => `${action.actionType}|${action.target?.id ?? ''}`);
  assert.deepEqual(keys, reordered);
});

/* ---------------------------------------------------------------------------
 * Reward
 * ------------------------------------------------------------------------- */

test('the reward contract is versioned and an unknown version is refused', () => {
  assert.equal(FORGE_REWARD_VERSION, 'FORGE_REWARD_V1');
  assert.equal(scalarizeReward(emptyRewardVector()), 0);
  assert.throws(() => scalarizeReward(emptyRewardVector(), 'FORGE_REWARD_V99'), ForgeContractError);
});

test('scalarization is exact integer arithmetic', () => {
  const vector = { ...emptyRewardVector(), objectiveProgress: 3, timeCost: 1 };
  assert.equal(scalarizeReward(vector), 3 * 10 + 1 * -1);
  assert.ok(Number.isInteger(scalarizeReward(vector)));
});

/* ---------------------------------------------------------------------------
 * Renderer — presentation only
 * ------------------------------------------------------------------------- */

test('the renderer is derived from structured state and never enters world identity', () => {
  const { world: w } = world();
  const before = hashWorld(w);
  const plain = renderWorld(w);
  const decorated = renderWorld(w, { legend: true, header: true });
  assert.notEqual(plain, decorated, 'renderer options had no effect, so the test proves nothing');
  assert.equal(hashWorld(w), before, 'rendering changed world identity');
  assert.ok(plain.split('\n').length >= w.grid.height + 2);
});

test('an out-of-service entity renders differently from a live one', () => {
  const { world: w } = world('nexus/dead_substitute', 2, 3);
  const render = renderWorld(w);
  assert.match(render, /[a-z]/, 'no lower-case glyph, so failed nodes are indistinguishable');
});

/* ---------------------------------------------------------------------------
 * Counterfactual oracle
 * ------------------------------------------------------------------------- */

test('branching evaluates every legal action and leaves the source untouched', () => {
  const { world: w } = world();
  const before = hashWorld(w);
  const cf = evaluateCounterfactuals(w, { horizon: 2 });
  assert.equal(cf.branchCount, legalActions(w).length);
  assert.equal(cf.sourceUnchanged, true);
  assert.equal(hashWorld(w), before);
  assert.equal(cf.exactOptimalAvailable, true);
});

test('branch evaluation order does not change any result', () => {
  const { world: w } = world('prime/adversarial_choice', 4, 11);
  const straight = evaluateCounterfactuals(w, { horizon: 2 });
  const shuffled = evaluateCounterfactuals(w, { horizon: 2, shuffleSeed: 12345 });
  assert.equal(counterfactualDigest(straight), counterfactualDigest(shuffled));
  assert.equal(straight.optimalActionKey, shuffled.optimalActionKey);
});

test('the optimal action has zero regret and every other branch has non-negative regret', () => {
  const { world: w } = world();
  const cf = evaluateCounterfactuals(w, { horizon: 2 });
  assert.equal(regretOf(cf, cf.optimalActionKey), 0);
  for (const branch of cf.branches) assert.ok(regretOf(cf, branch.actionKey) >= 0);
});

test('a longer horizon can change the optimum, which is why the horizon is declared', () => {
  let changed = false;
  for (const family of ['prime/long_horizon_tradeoff', 'nexus/dead_substitute', 'nexus/single_bottleneck']) {
    const { world: w } = world(family, 2, 9001);
    if (evaluateCounterfactuals(w, { horizon: 0 }).optimalActionKey
      !== evaluateCounterfactuals(w, { horizon: 4 }).optimalActionKey) changed = true;
  }
  assert.ok(changed, 'no horizon ever changed an optimum, so the horizon parameter is inert');
});

/* ---------------------------------------------------------------------------
 * Scenarios, curriculum and the admission gate
 * ------------------------------------------------------------------------- */

test('every family is generated, admitted and decidable at every level', () => {
  for (const family of FORGE_SCENARIO_FAMILY_IDS) {
    for (const level of FORGE_CURRICULUM_LEVELS.map((entry) => entry.level)) {
      const result = admitGeneratedScenario(generateScenario({ family, level, seed: 31337 }));
      assert.equal(result.admitted, true, `${family} L${level} rejected: ${result.rejectionReasons.join('; ')}`);
    }
  }
});

test('curriculum parameters are a pure function of the level', () => {
  for (const { level } of FORGE_CURRICULUM_LEVELS) {
    assert.deepEqual(curriculumParameters(level), curriculumParameters(level));
  }
  assert.ok(curriculumParameters(5).entityCount > curriculumParameters(0).entityCount);
  assert.throws(() => curriculumParameters(9), ForgeContractError);
});

/* The gate's own control. Without this, a 100% admission rate would be
 * indistinguishable from a gate that cannot reject. */
test('the admission gate refuses a scenario validated against the wrong family', () => {
  const sensitivity = measureAdmissionGateSensitivity();
  assert.ok(sensitivity.probeCount >= 5);
  assert.equal(sensitivity.allCaught, true,
    `mislabelled scenarios were admitted: ${JSON.stringify(sensitivity.probes.filter((p) => !p.caught))}`);
  for (const probe of sensitivity.probes) {
    assert.equal(probe.honestClaimHolds, true, `${probe.generatedAs} failed its own claim`);
    assert.equal(probe.mislabelledClaimRejected, true, `${probe.generatedAs} passed as ${probe.validatedAs}`);
  }
});

test('a dead-substitute world offers no bypass and a live-substitute world does', () => {
  const dead = world('nexus/dead_substitute', 2, 71).world;
  assert.equal(legalActions(dead).some((action) => action.actionType === 'BYPASS'), false);
  const validated = validateScenario(dead, generateScenario({ family: 'nexus/dead_substitute', level: 2, seed: 71 }));
  assert.equal(validated.valid, true);
});

test('the cycle family really contains a cycle and the acyclic families do not', () => {
  const cyclic = generateScenario({ family: 'nexus/cycle', level: 3, seed: 5 });
  assert.equal(validateScenario(createWorld(cyclic.scenarioSeed, cyclic), cyclic).valid, true);
  const chain = generateScenario({ family: 'nexus/dependency_chain', level: 3, seed: 5 });
  const asCycle = validateScenario(createWorld(chain.scenarioSeed, chain), { ...chain, family: 'nexus/cycle' });
  assert.equal(asCycle.valid, false);
});

/* ---------------------------------------------------------------------------
 * Sentinel adapter
 * ------------------------------------------------------------------------- */

test('Forge World validates as an ordinary Sentinel adapter', () => {
  const { manifest } = validateAdapter(forgeWorldAdapter);
  assert.equal(manifest.gameId, 'sentinel-forge-world');
  assert.equal(manifest.authority.tier, 'R0');
  assert.equal(manifest.authority.executionInterface, false);
  assert.equal(manifest.deterministic, true);
});

test('the adapter never exposes the counterfactual oracle to Sentinel', () => {
  const { world: w } = world();
  const state = forgeAdapterState(w);
  const observation = forgeWorldAdapter.observe(state, 'sentinel');
  const serialized = JSON.stringify(observation);
  for (const forbidden of ['optimalAction', 'optimalScalar', 'totalScalar', 'counterfactual', 'regret']) {
    assert.equal(serialized.includes(forbidden), false, `the observation leaks ${forbidden}`);
  }
});

test('Prime, Nexus and Oracle all run against Forge World through ordinary contracts', () => {
  const { world: w } = world('prime/mixed_expert_problem', 3, 42);
  const state = forgeAdapterState(w);
  const observation = forgeWorldAdapter.observe(state, 'sentinel');

  const recommendation = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations: 24, seed: 1n });
  assert.equal(recommendation.recommendationHash.length, 64);
  assert.ok(recommendation.selected.action.parameters.actionType);

  const nexus = evaluateNexus({ canonicalState: observation.metadata.canonicalState });
  assert.equal(nexus.expertId, 'sentinel-nexus-relational');
  const oracle = evaluateOracle({ observationHistory: observation.metadata.observationHistory });
  assert.equal(oracle.expertId, 'sentinel-oracle-temporal');
});

test('a Prime recommendation over Forge World replays identically', () => {
  const { world: w } = world();
  const state = forgeAdapterState(w);
  const first = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations: 24, seed: 1n });
  const second = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations: 24, seed: 1n });
  assert.equal(first.recommendationHash, second.recommendationHash);
});

test('every action Prime can choose is one the simulator actually offers', () => {
  const { world: w } = world('nexus/single_bottleneck', 3, 8);
  const state = forgeAdapterState(w);
  const offered = new Set(legalActions(w).map((action) => `${action.actionType}|${action.target?.id ?? ''}`));
  for (const action of forgeWorldAdapter.legalActions(state, 'sentinel')) {
    assert.ok(offered.has(`${action.parameters.actionType}|${action.target?.id ?? ''}`));
  }
});

/* ---------------------------------------------------------------------------
 * Replay
 * ------------------------------------------------------------------------- */

function makeRecord(family = 'nexus/dependency_chain', level = 2, seed = 1234) {
  const { config, world: w } = world(family, level, seed);
  const counterfactuals = evaluateCounterfactuals(w, { horizon: 2 });
  const validation = validateScenario(w, config);
  return buildReplayRecord({ world: w, scenario: config, counterfactuals, validation });
}

test('a replay record verifies its own self-excluding hash', () => {
  const record = makeRecord();
  assert.equal(verifyReplayRecord(record), true);
  assert.equal(record.recordHash.length, 64);
});

test('a tampered record fails verification', () => {
  const record = makeRecord();
  assert.equal(verifyReplayRecord({ ...record, optimalUtility: record.optimalUtility + 1 }), false);
  assert.equal(verifyReplayRecord({ ...record, state: { ...record.state, worldHash: 'x'.repeat(64) } }), false);
});

test('records are reproducible from the same inputs', () => {
  assert.equal(makeRecord().recordHash, makeRecord().recordHash);
});

test('no absolute filesystem path appears anywhere in a replay record', () => {
  const record = makeRecord();
  assert.deepEqual(findAbsolutePaths(record), []);
});

test('the replay set digest is order-independent', () => {
  const records = [makeRecord('nexus/cycle', 1, 3), makeRecord('oracle/reversal', 2, 4), makeRecord('prime/adversarial_choice', 3, 5)];
  assert.equal(replaySetDigest(records), replaySetDigest([...records].reverse()));
});

/* ---------------------------------------------------------------------------
 * Dataset export
 * ------------------------------------------------------------------------- */

test('every export format is produced deterministically and in canonical order', () => {
  const records = [makeRecord('nexus/cycle', 1, 3), makeRecord('oracle/reversal', 2, 4), makeRecord('prime/adversarial_choice', 3, 5)];
  const first = exportAll(records);
  const second = exportAll([...records].reverse());
  assert.equal(first.datasetHash, second.datasetHash, 'export order changed the output');
  assert.equal(first.datasets.jsonl.count, 3);
  assert.ok(first.datasets.rl_episode.count > 0);
});

test('SFT excludes exact ties rather than inventing a correct answer', () => {
  const tied = makeRecord('oracle/monotonic_trend', 2, 9001);
  const result = exportAll([tied]);
  if (tied.exactTie) {
    assert.equal(result.datasets.sft.count, 0);
    assert.equal(result.datasets.sft.excludedTies, 1);
  } else {
    assert.equal(result.datasets.sft.count, 1);
  }
});

test('preference pairs always carry a strictly positive utility gap', () => {
  const records = FORGE_SCENARIO_FAMILY_IDS.slice(0, 8).map((family) => makeRecord(family, 3, 55));
  const { datasets } = exportAll(records);
  for (const line of datasets.preference.content.split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    assert.ok(row.metadata.utilityGap > 0, 'a zero-gap pair is not a preference');
    assert.notEqual(row.chosen, row.rejected);
  }
});

/* ---------------------------------------------------------------------------
 * Soup bridge
 * ------------------------------------------------------------------------- */

test('the raw Forge SFT row matches no Soup format signature', () => {
  assert.equal(detectSoupFormat({ prompt: 'p', completion: 'c' }), null,
    'if this ever detects, the translation below is unnecessary and the bridge should say so');
});

test('the Forge preference row is already Soup dpo', () => {
  assert.equal(detectSoupFormat({ prompt: 'p', chosen: 'a', rejected: 'b' }), 'dpo');
});

test('translation makes the SFT export detectable as alpaca', () => {
  const sft = JSON.stringify({ prompt: 'p', completion: 'c', metadata: { recordHash: 'x' } });
  const translated = translateSftToSoup(sft);
  assert.equal(translated.soupFormat, 'alpaca');
  assert.equal(detectSoupFormat(JSON.parse(translated.content)), 'alpaca');
});

test('preference translation preserves the dpo signature', () => {
  const row = JSON.stringify({ prompt: 'p', chosen: 'a', rejected: 'b', metadata: {} });
  assert.equal(detectSoupFormat(JSON.parse(translatePreferenceToSoup(row).content)), 'dpo');
});

test('the bridge checks itself against Soup detection and records the control', () => {
  const records = FORGE_SCENARIO_FAMILY_IDS.slice(0, 10).map((family) => makeRecord(family, 3, 606));
  const bridge = buildSoupBridge({ datasets: exportAll(records).datasets });
  assert.equal(bridge.soupCommit, SOUP_COMMIT);
  assert.equal(bridge.allCompatible, true);
  assert.equal(bridge.translationIsNecessary, true, 'the untranslated row detected as something, so translation is not doing work');
  assert.equal(bridge.trainingExecuted, false);
});

/* ---------------------------------------------------------------------------
 * Training provenance and governance
 * ------------------------------------------------------------------------- */

test('a complete provenance envelope is accepted and an incomplete one is rejected', () => {
  const complete = Object.fromEntries(TRAINING_PROVENANCE_FIELDS.map((field) => [field, `v_${field}`]));
  assert.equal(validateTrainingProvenance(complete).accepted, true);

  for (const field of TRAINING_PROVENANCE_FIELDS) {
    const missing = { ...complete };
    delete missing[field];
    const result = validateTrainingProvenance(missing);
    assert.equal(result.accepted, false, `a candidate missing ${field} was accepted`);
    assert.equal(result.rejectionReason, 'INCOMPLETE_TRAINING_PROVENANCE');
  }
  assert.equal(validateTrainingProvenance({ ...complete, SEED: '' }).accepted, false);
  assert.equal(validateTrainingProvenance(null).accepted, false);
});

test('Soup can reach TRAINED and can never reach CERTIFIED', () => {
  assert.equal(canTransition('GENERATED', 'TRAINED', 'SOUP').allowed, true);
  assert.equal(soupCanCertify(), false);
  for (const from of CANDIDATE_STATES) {
    assert.equal(canTransition(from, 'CERTIFIED', 'SOUP').allowed, false, `SOUP certified from ${from}`);
    assert.equal(canTransition(from, 'CERTIFIED', 'SENTINEL_LAB').allowed, false, `the lab certified from ${from}`);
  }
});

test('only Sentinel certification may assign CERTIFIED, and only from SHADOW_EVALUATED', () => {
  assert.equal(canTransition('SHADOW_EVALUATED', 'CERTIFIED', 'SENTINEL_GRID_CERTIFICATION').allowed, true);
  assert.equal(canTransition('CANDIDATE', 'CERTIFIED', 'SENTINEL_GRID_CERTIFICATION').allowed, false);
  assert.equal(canTransition('CERTIFIED', 'REJECTED', 'SENTINEL_LAB').allowed, false, 'CERTIFIED must be terminal');
});

test('the governance state machine rejects unknown states rather than guessing', () => {
  assert.throws(() => canTransition('MADE_UP', 'CERTIFIED', 'SOUP'), ForgeContractError);
});
