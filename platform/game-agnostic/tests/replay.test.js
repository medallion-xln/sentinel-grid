import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { recommend } from '../src/prime/root-puct.js';
import { replayRecommendation } from '../src/sdk/replay.js';


test('recommendation replays exactly', () => {
  const state = referenceGameAdapter.initialState(44n);
  const recommendation = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 48, seed: 2n });
  const replay = replayRecommendation({ adapter: referenceGameAdapter, state, recommendation });
  assert.equal(replay.pass, true);
  assert.equal(replay.actualHash, recommendation.recommendationHash);
});

test('replay rejects a different source state', () => {
  const state = referenceGameAdapter.initialState(44n);
  const recommendation = recommend({ adapter: referenceGameAdapter, state, observerId: 'player-1', simulations: 48, seed: 2n });
  const changed = structuredClone(state);
  changed.turn += 1;
  assert.throws(() => replayRecommendation({ adapter: referenceGameAdapter, state: changed, recommendation }), /state hash/);
});
