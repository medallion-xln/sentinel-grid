import { referenceGameAdapter } from '../src/adapters/reference-game/index.js';
import { recommend } from '../src/prime/root-puct.js';

const state = referenceGameAdapter.initialState(42n);
const recommendation = recommend({
  adapter: referenceGameAdapter,
  state,
  observerId: 'player-1',
  simulations: 128,
  seed: 42n,
});

console.log(JSON.stringify(recommendation, null, 2));
