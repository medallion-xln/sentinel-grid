// Gate 3 — architectural portability: the SAME kernel serves a second existing game through a thin adapter, with no change
// to that game's mechanics. No risk model exists for it, so the kernel ranks, explains and ABSTAINS. No decision gain is claimed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceRescueAdapter as game } from '../../src/adapters/reference-rescue/index.js';
import { createSeededRandom } from '../../src/core/determinism.js';
import { createRecommendationApi } from '../api/recommend.mjs';
import { rescueRequest, rescueFeaturizer } from '../adapters/rescue/adapter.mjs';
import { KernelRejection } from '../kernel/index.mjs';

const api = createRecommendationApi({ game: 'rescue' });
test('the kernel inspects the complete native menu of the second game on every turn of a seeded episode', () => {
  for (const seed of [1n, 7n, 42n]) { const state = game.initialState(seed), random = createSeededRandom(seed); let turns = 0;
    while (!game.isTerminal(state) && turns < 20) { const obs = game.observe(state, 'controller'), legal = game.legalActions(state, 'controller'), r = rescueRequest(obs, legal), rec = api.recommend(r.state, r.legalActions, r.advisoryEvidence);
      assert.equal(rec.rankedActions.length, legal.length); assert.equal(rec.recommendedActionOrAbstention.kind, 'ABSTAIN'); assert.equal(rec.recommendedActionOrAbstention.reason, 'ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE');
      assert.ok(rec.rankedActions.every((a) => a.riskStatus === 'UNSUPPORTED_NO_MODEL')); assert.equal(rec.safetyAssessment.qualification.status, 'NO_MODEL'); assert.equal(rec.authority.canDispatch, false);
      assert.equal(api.replay(r, rec.decisionHash).reproduced, true); assert.ok(rescueFeaturizer(r.state, r.legalActions, null).keys.every((k) => !/north|east|south/.test(k)), 'an action key carries public attributes, never a site id');
      game.step(state, legal[0], { observerId: 'controller', seed, simulationIndex: 0, random, mode: 'detached-simulation' }); turns++; } // the test, not the kernel, advances the game
    assert.ok(turns > 0); }
});
test('hidden information stays hidden: unknown sites and their risk never reach the request', () => { const state = game.initialState(3n), obs = game.observe(state, 'controller'), r = rescueRequest(obs, game.legalActions(state, 'controller'));
  const hidden = state.sites.filter((s) => !s.known); assert.ok(hidden.length > 0); assert.equal(r.state.knownSites.length, state.sites.length - hidden.length); });
test('the API refuses to act in the second game too', () => { const state = game.initialState(1n), r = rescueRequest(game.observe(state, 'controller'), game.legalActions(state, 'controller'));
  assert.throws(() => api.recommend(r.state, r.legalActions, null, { mode: 'EXECUTE' }), (e) => e instanceof KernelRejection && e.code === 'EXECUTION_OR_MUTATION_REQUESTED'); assert.equal(api.execute, undefined); assert.deepEqual(api.describe().refuses, ['execute', 'dispatch', 'mutate']); });
