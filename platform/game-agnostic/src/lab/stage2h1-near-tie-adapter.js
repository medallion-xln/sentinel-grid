/* Stage 2H.1 — deterministic near-tie fixture adapter (certification use only).
 *
 * WHY THIS EXISTS. Both certified reference adapters have structurally large value
 * gaps between their legal actions: a scan of 2560 (state, simulations, seed)
 * combinations found a minimum baseline mean-value gap of 0.1, which the inherited
 * 0.02/0.03 expert bounds cannot and must not overcome. Measuring whether bounded
 * expert evidence can change a ranking therefore needs a state where the baseline
 * actions are genuinely close — not a widened bound.
 *
 * This adapter makes the gap an explicit, inspectable parameter. `epsilon` is the
 * exact reward advantage of `shift` over `hold`:
 *
 *   epsilon small  → a legitimate near-tie; bounded expert evidence may tip it.
 *   epsilon large  → a strong Prime preference; expert evidence must NOT tip it.
 *
 * Both cases are certified, and the second is the guard: it proves expert context
 * cannot overpower a substantially superior baseline action.
 *
 * This is a lab fixture. It is not registered in the production adapter registry,
 * carries no execution interface, and is R0 like everything else.
 */

import { CONTRACT_VERSION } from '../core/constants.js';
import { defineAdapter } from '../sdk/define-adapter.js';

const GAME_ID = 'stage2h1-near-tie';
const SCHEMA_ID = 'stage2h1-near-tie/observation';

/** Reward advantage of `shift` over `hold`, in reward units. */
export const NEAR_TIE_EPSILON = 0.004;
/** A gap far outside the reachable expert differential (0.06). */
export const STRONG_PREFERENCE_EPSILON = 0.5;

const ACTIONS = Object.freeze([
  Object.freeze({
    actionId: 'stage2h1/hold',
    actorId: 'controller',
    target: Object.freeze({ kind: 'node', id: 'node-hold' }),
    parameters: Object.freeze({ mode: 'hold' }),
    metadata: Object.freeze({ category: 'stabilize' }),
  }),
  Object.freeze({
    actionId: 'stage2h1/shift',
    actorId: 'controller',
    target: Object.freeze({ kind: 'node', id: 'node-shift' }),
    parameters: Object.freeze({ mode: 'shift' }),
    metadata: Object.freeze({ category: 'reallocate' }),
  }),
]);

/** The canonical action descriptors, for building action links in fixtures. */
export function nearTieActions() {
  return ACTIONS.map((action) => structuredClone(action));
}

export const stage2h1NearTieAdapter = defineAdapter({
  manifest() {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      adapterId: 'stage2h1-near-tie-adapter',
      adapterVersion: '1.0.0',
      deterministic: true,
      observationSchemas: [{ schemaId: SCHEMA_ID, schemaVersion: 1, variableSize: false }],
      capabilities: {
        imperfectInformation: false,
        stochasticTransitions: false,
        simultaneousActions: false,
        variableObservationSize: false,
      },
      authority: { tier: 'R0', executionInterface: false },
      metadata: { purpose: 'Stage 2H.1 near-tie and strong-preference certification fixture' },
    };
  },

  initialState(seed = 0n) {
    // The seed carries the gap in reward micro-units, keeping states deterministic
    // and self-describing: seed 4 → epsilon 0.000004 * 1e3 = 0.004.
    const micro = Number(BigInt(seed));
    return {
      epsilonMicro: micro,
      baseReward: 0.5,
      step: 0,
      maxSteps: 2,
    };
  },

  cloneState(state) {
    return structuredClone(state);
  },

  observe(state, observerId) {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      schemaId: SCHEMA_ID,
      schemaVersion: 1,
      observerId,
      sequence: state.step,
      features: [state.baseReward, state.epsilonMicro / 1000000, state.step],
      metadata: { gap: state.epsilonMicro },
    };
  },

  legalActions(state, observerId) {
    if (state.step >= state.maxSteps) return [];
    return ACTIONS.map((action) => ({ ...structuredClone(action), actorId: observerId }));
  },

  step(state, action) {
    const next = structuredClone(state);
    next.step += 1;
    const epsilon = state.epsilonMicro / 1000000;
    const reward = action.parameters.mode === 'shift' ? state.baseReward + epsilon : state.baseReward;
    return { state: next, reward, terminal: next.step >= next.maxSteps, events: [], info: {} };
  },

  isTerminal(state) {
    return state.step >= state.maxSteps;
  },

  outcome(state, observerId) {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: GAME_ID,
      observerId,
      terminal: state.step >= state.maxSteps,
      scalar: state.baseReward,
      vector: { base: state.baseReward },
      metadata: { observerId },
    };
  },
});
