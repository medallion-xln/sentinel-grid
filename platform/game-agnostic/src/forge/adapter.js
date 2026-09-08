/* Sentinel Forge World — Sentinel Grid adapter.
 *
 * Forge World appears to Sentinel as an ordinary environment provider, through
 * the SAME Adapter SDK contract ZekNova and the reference adapter use. There are
 * no Forge-specific decision shortcuts: Prime, the router and the experts see an
 * ObservationPacket, a legal action set and an OutcomePacket, and cannot tell
 * they are looking at a simulator.
 *
 * That is the point of the phase. If Forge needed its own decision path, the
 * measurement it produces would be about Forge's path rather than about Sentinel,
 * and every number downstream would describe a system nobody runs.
 *
 * The counterfactual oracle is deliberately NOT reachable from here. Sentinel
 * must not be able to consult world truth while deciding — an adapter that leaked
 * the optimal action would turn the shadow evaluation into a copying exercise.
 */

import { CONTRACT_VERSION } from '../core/constants.js';
import { defineAdapter } from '../sdk/define-adapter.js';
import { FORGE_WORLD_VERSION } from './contract.js';
import {
  FORGE_KERNEL_VERSION,
  cloneWorld,
  controlledActor,
  hashWorld,
  isTerminal,
  legalActions as forgeLegalActions,
  observe as forgeObserve,
  score,
  step as forgeStep,
  terminalStatus,
} from './kernel.js';

export const FORGE_ADAPTER_VERSION = '1.0.0';
export const FORGE_GAME_ID = 'sentinel-forge-world';
export const FORGE_OBSERVATION_SCHEMA_ID = 'sentinel-forge-world/observation';
export const FORGE_OBSERVER_ID = 'sentinel';

/* Bridge state: the Forge world plus the sequence counter the ObservationPacket
 * contract requires. Kept as plain JSON so structuredClone is a complete clone. */
export function forgeAdapterState(world) {
  return { world: cloneWorld(world), sequence: 0 };
}

export const forgeWorldAdapter = defineAdapter({
  manifest() {
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: FORGE_GAME_ID,
      adapterId: 'sentinel-forge-world-adapter',
      adapterVersion: FORGE_ADAPTER_VERSION,
      deterministic: true,
      observationSchemas: [
        { schemaId: FORGE_OBSERVATION_SCHEMA_ID, schemaVersion: 1, variableSize: false },
      ],
      capabilities: {
        imperfectInformation: false,
        stochasticTransitions: false,
        simultaneousActions: false,
        variableObservationSize: false,
      },
      authority: { tier: 'R0', executionInterface: false },
      metadata: {
        purpose: 'deterministic counterfactual training substrate',
        worldVersion: FORGE_WORLD_VERSION,
        kernelVersion: FORGE_KERNEL_VERSION,
        /* Declared so a reader of the manifest alone can see the boundary. */
        counterfactualOracleExposed: false,
      },
    };
  },

  /* The SDK signature takes a seed; Forge worlds are built by the scenario layer,
   * so this exists to satisfy the contract and produces the smallest legal world.
   * Real use goes through forgeAdapterState(world). */
  initialState(seed = 1n) {
    const width = 5;
    const height = 5;
    return {
      world: {
        schemaVersion: 1,
        worldVersion: FORGE_WORLD_VERSION,
        kernelVersion: FORGE_KERNEL_VERSION,
        seed: String(seed),
        scenarioFamily: 'kernel/minimal',
        scenarioLevel: 0,
        tick: 0,
        maxTicks: 4,
        grid: { width, height, cells: new Array(width * height).fill(0) },
        entities: [
          {
            id: 'actor', type: 'ACTOR', position: { x: 1, y: 1 }, health: 100, available: true,
            value: 0, cost: 0, risk: 0, faction: 'sentinel', flags: {}, resources: { material: 0 },
          },
          {
            id: 'target', type: 'CRITICAL_TARGET', position: { x: 2, y: 1 }, health: 100, available: true,
            value: 10, cost: 0, risk: 0, faction: 'neutral', flags: { critical: true, acceptsMaterial: true }, resources: {},
          },
        ],
        relations: [],
        objectives: [{ id: 'objective-primary', entityId: 'target', requiredValue: 5, deliveredValue: 0 }],
        constraints: { energy: 10 },
        hazards: [],
        events: [],
        channels: { primary: [40, 43, 46, 49] },
        history: [{ tick: 0, channels: { primary: 40 } }],
        terminalReason: null,
      },
      sequence: 0,
    };
  },

  cloneState(state) {
    return structuredClone(state);
  },

  observe(state, observerId) {
    const view = forgeObserve(state.world, observerId);
    return {
      contractVersion: CONTRACT_VERSION,
      gameId: FORGE_GAME_ID,
      schemaId: FORGE_OBSERVATION_SCHEMA_ID,
      schemaVersion: 1,
      observerId,
      sequence: state.sequence,
      features: view.features,
      featureShape: [view.features.length],
      metadata: {
        tick: view.tick,
        worldHash: view.worldHash,
        scenarioFamily: state.world.scenarioFamily,
        scenarioLevel: state.world.scenarioLevel,
        /* Carried so the expert layer can read canonical relational state and
         * temporal history without a second call into the simulator. These are
         * observations, not answers: no utility, ranking or optimal action
         * appears anywhere in this packet. */
        canonicalState: view.canonicalState,
        observationHistory: view.observationHistory,
        objectives: view.objectives,
      },
    };
  },

  legalActions(state, observerId) {
    if (observerId !== FORGE_OBSERVER_ID) throw new Error(`Unknown observer: ${observerId}`);
    return forgeLegalActions(state.world).map((action) => ({
      actionId: action.actionId,
      actorId: observerId,
      target: action.target,
      parameters: { ...action.parameters, actionType: action.actionType, forgeActorId: action.actorId },
      metadata: { category: action.actionType.toLowerCase() },
    }));
  },

  step(state, action, { observerId }) {
    const forgeAction = {
      actionType: action.parameters.actionType,
      actorId: action.parameters.forgeActorId,
      target: action.target,
      parameters: Object.fromEntries(
        Object.entries(action.parameters).filter(([key]) => key !== 'actionType' && key !== 'forgeActorId'),
      ),
    };
    const outcome = forgeStep(state.world, forgeAction);
    const next = { world: outcome.state, sequence: state.sequence + 1 };
    return {
      state: next,
      reward: outcome.scalarReward,
      terminal: outcome.terminal,
      events: outcome.events,
      info: {
        observerId,
        rewardVector: outcome.rewardVector,
        outcome: outcome.outcome,
        worldHash: hashWorld(outcome.state),
      },
    };
  },

  isTerminal(state) {
    return isTerminal(state.world);
  },

  outcome(state, observerId) {
    const status = terminalStatus(state.world);
    const summary = score(state.world);
    return {
      scalar: summary.total,
      terminal: status.terminal,
      vector: {
        objective: summary.objective,
        infrastructure: summary.infrastructure,
        civilian: summary.civilian,
        tick: summary.tick,
      },
      metadata: {
        observerId,
        outcome: status.outcome,
        reason: status.reason,
        worldHash: hashWorld(state.world),
      },
    };
  },
});

/** The actor id the Forge kernel uses, exposed for record-building. */
export function forgeControlledActorId(state) {
  return controlledActor(state.world)?.id ?? null;
}
