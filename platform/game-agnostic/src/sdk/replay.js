import { ReplayError } from '../core/errors.js';
import { sha256 } from '../core/determinism.js';
import { recommend } from '../prime/root-puct.js';

export function replayRecommendation({ adapter, state, recommendation }) {
  if (!recommendation?.search || !recommendation?.input) {
    throw new ReplayError('Invalid recommendation packet');
  }
  const stateHash = sha256(state);
  if (stateHash !== recommendation.input.stateHash) {
    throw new ReplayError('Replay state hash does not match recommendation input', {
      expected: recommendation.input.stateHash,
      actual: stateHash,
    });
  }

  const replayed = recommend({
    adapter,
    state,
    observerId: recommendation.input.observerId,
    seed: BigInt(recommendation.search.seed),
    simulations: recommendation.search.simulations,
    cPuct: recommendation.search.cPuct,
  });

  return Object.freeze({
    pass: replayed.recommendationHash === recommendation.recommendationHash,
    expectedHash: recommendation.recommendationHash,
    actualHash: replayed.recommendationHash,
    replayed,
  });
}
