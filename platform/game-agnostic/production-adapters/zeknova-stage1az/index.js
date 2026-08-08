import { defineAdapter } from '../../src/sdk/define-adapter.js';
import { actionKey, assertActionIsLegal } from '../../src/core/contracts.js';

const ACTIONS = Object.freeze([
  'stabilize',
  'scout_region',
  'intercept_contact',
  'fortify_known_route',
  'repair_known_structure',
  'share_intelligence',
]);

const EFFECTS = Object.freeze([
  { reward: 0.18, metric: 'stability', metricDelta: 0.045, featureDelta: 0.025 },
  { reward: 0.11, metric: 'intelligence', metricDelta: 0.055, featureDelta: 0.018 },
  { reward: 0.15, metric: 'threat', metricDelta: -0.05, featureDelta: -0.021 },
  { reward: 0.14, metric: 'routeIntegrity', metricDelta: 0.05, featureDelta: 0.022 },
  { reward: 0.16, metric: 'infrastructure', metricDelta: 0.052, featureDelta: 0.024 },
  { reward: 0.10, metric: 'intelligence', metricDelta: 0.035, featureDelta: 0.015 },
]);

function clamp(value, minimum = -1, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function seedNumber(seed) {
  const normalized = BigInt(seed);
  return Number(BigInt.asUintN(31, normalized));
}

function buildObservation(seed, factionIndex, tick, size) {
  const output = [];
  let x = (seedNumber(seed) * 1103515245 + 12345 + factionIndex * 7919 + tick * 104729) & 0x7fffffff;
  for (let index = 0; index < size; index += 1) {
    x = (Math.imul(1103515245, x) + 12345 + index * 97) & 0x7fffffff;
    output.push(Number((((x % 20001) - 10000) / 10000).toFixed(6)));
  }
  return output;
}

function targetSlots(prefix, offset) {
  const kinds = ['settlement', 'region', 'contact', 'route', 'structure', 'faction'];
  return Object.fromEntries(ACTIONS.map((actionName, index) => [actionName, {
    slot: offset + index,
    id: `${prefix}:${kinds[index]}:${offset + index}`,
    kind: kinds[index],
    known: true,
  }]));
}

function buildFaction(seed, factionIndex, tick, legalMask, prefix, observationSize) {
  const base = {
    stability: 0.65,
    threat: 0.42,
    infrastructure: 0.58,
    intelligence: 0.37,
    resources: 0.51,
    routeIntegrity: 0.55,
  };
  const metrics = Object.fromEntries(Object.entries(base).map(([key, value]) => [
    key,
    Number((value + factionIndex * 0.03 + ((seedNumber(seed) + tick + key.length) % 7 - 3) * 0.005).toFixed(6)),
  ]));
  return {
    observation: buildObservation(seed, factionIndex, tick, observationSize),
    legalMask: [...legalMask],
    targetSlots: targetSlots(prefix, factionIndex * 16),
    metrics,
    knowledge: {
      epoch: Math.floor(tick / 8) + factionIndex,
      knownEntityIds: Array.from({ length: 4 + factionIndex }, (_, index) => `${prefix}:entity:${index}`),
    },
  };
}

function actionDescriptor(state, observerId, actionIndex) {
  const faction = state.factions[observerId];
  const actionName = ACTIONS[actionIndex];
  return {
    actionId: `zeknova.stage1az/${actionName}`,
    actorId: observerId,
    target: structuredClone(faction.targetSlots[actionName]),
    parameters: {
      legacyActionIndex: actionIndex,
      targetSlot: faction.targetSlots[actionName].slot,
    },
    metadata: {
      legacyActionName: actionName,
      engineIdentity: 'sentinel-prime-root-puct-v1-development',
    },
  };
}

function validateState(state, configuration) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('ZekNova state must be an object');
  if (state.stateVersion !== 1) throw new Error('Unsupported ZekNova state version');
  if (state.maxTick !== configuration.maxTick) throw new Error(`Snapshot maxTick must equal locked maxTick ${configuration.maxTick}`);
  if (!state.factions || typeof state.factions !== 'object') throw new Error('ZekNova factions are required');
  if (!state.factions[state.activeFactionId]) throw new Error('activeFactionId must identify a faction');
  for (const [factionId, faction] of Object.entries(state.factions)) {
    if (faction.observation.length !== configuration.observationSize) throw new Error(`${factionId} observation must contain ${configuration.observationSize} features`);
    if (faction.legalMask.length !== configuration.actionCount) throw new Error(`${factionId} legal mask must contain ${configuration.actionCount} entries`);
    if (!faction.legalMask.some(Boolean) && !state.terminal) throw new Error(`${factionId} must expose at least one legal action`);
    for (const [index, actionName] of ACTIONS.entries()) {
      const target = faction.targetSlots[actionName];
      if (!target || target.slot !== faction.targetSlots[actionName].slot) throw new Error(`Missing target slot for ${actionName}`);
      if (!Number.isInteger(target.slot) || target.slot < 0) throw new Error(`Invalid target slot for ${actionName}`);
      if (index >= configuration.actionCount) throw new Error('Action catalog exceeds locked action count');
    }
  }
  return state;
}

export function createAdapter(configuration) {
  return defineAdapter({
    manifest() {
      return {
        contractVersion: 1,
        gameId: 'zeknova',
        adapterId: 'zeknova-stage1az-shadow-adapter',
        adapterVersion: '1.0.0',
        deterministic: true,
        observationSchemas: [{
          schemaId: 'zeknova/stage1az-faction-observation-592',
          schemaVersion: 1,
          variableSize: false,
        }],
        capabilities: {
          imperfectInformation: true,
          stochasticTransitions: true,
          simultaneousActions: false,
          variableObservationSize: false,
        },
        authority: { tier: 'R0', executionInterface: false },
        metadata: {
          packageMode: 'external-production-adapter',
          sourceLineage: 'Stage 1A-Z',
          engineIdentity: 'sentinel-prime-root-puct-v1-development',
          observationFeatureCount: configuration.observationSize,
          legalActionCount: configuration.actionCount,
          actionCatalog: ACTIONS,
          canonicalTargetSlots: true,
          factionPrivateKnowledge: true,
          snapshotIngestion: true,
          behavioralParity: 'frozen-corpus-certified',
        },
      };
    },

    initialState(seed) {
      const tick = 97;
      return validateState({
        stateVersion: 1,
        tick,
        maxTick: configuration.maxTick,
        activeFactionId: 'forest',
        terminal: false,
        factions: {
          forest: buildFaction(seed, 0, tick, [true, true, true, true, true, true], 'forest', configuration.observationSize),
          desert: buildFaction(BigInt(seed) + 101n, 1, tick, [true, false, true, true, false, true], 'desert', configuration.observationSize),
        },
      }, configuration);
    },

    cloneState(state) {
      return structuredClone(state);
    },

    observe(state, observerId) {
      const faction = state.factions[observerId];
      if (!faction) throw new Error(`Unknown ZekNova observer: ${observerId}`);
      return {
        contractVersion: 1,
        gameId: 'zeknova',
        schemaId: 'zeknova/stage1az-faction-observation-592',
        schemaVersion: 1,
        observerId,
        sequence: state.tick,
        features: [...faction.observation],
        featureShape: [configuration.observationSize],
        metadata: {
          factionPrivate: true,
          knowledgeEpoch: faction.knowledge.epoch,
          knownEntityCount: faction.knowledge.knownEntityIds.length,
          sourceLineage: 'Stage 1A-Z',
        },
      };
    },

    legalActions(state, observerId) {
      const faction = state.factions[observerId];
      if (!faction) throw new Error(`Unknown ZekNova observer: ${observerId}`);
      if (this.isTerminal(state)) return [];
      return faction.legalMask.flatMap((legal, index) => legal ? [actionDescriptor(state, observerId, index)] : []);
    },

    step(state, action, context) {
      if (context?.mode !== 'detached-simulation') throw new Error('ZekNova adapter permits detached simulation only');
      const observerId = action.actorId;
      const faction = state.factions[observerId];
      if (!faction) throw new Error('Action actor must identify a ZekNova faction');
      const legal = this.legalActions(state, observerId);
      assertActionIsLegal(action, legal);
      const index = ACTIONS.findIndex((name) => action.actionId === `zeknova.stage1az/${name}`);
      if (index < 0) throw new Error('Unknown ZekNova Stage 1A-Z action');
      const expected = actionDescriptor(state, observerId, index);
      if (actionKey(expected) !== actionKey(action)) throw new Error('Action target slot or parameters do not match the canonical descriptor');

      const effect = EFFECTS[index];
      const random = typeof context.random === 'function' ? context.random : () => 0.5;
      const noise = (random() - 0.5) * 2 * configuration.stochasticAmplitude;
      const featureIndex = (index * 97 + action.target.slot * 13 + state.tick) % configuration.observationSize;
      faction.observation[featureIndex] = Number(clamp(faction.observation[featureIndex] + effect.featureDelta + noise).toFixed(6));
      faction.metrics[effect.metric] = Number(clamp(faction.metrics[effect.metric] + effect.metricDelta + noise, -1, 1).toFixed(6));
      faction.knowledge.epoch += 1;
      state.tick += 1;
      state.terminal = state.tick >= state.maxTick || faction.metrics.stability <= -0.95;
      const reward = Number((effect.reward + noise - Math.max(0, faction.metrics.threat) * 0.01).toFixed(12));
      return {
        state,
        reward,
        terminal: this.isTerminal(state),
        events: [{
          type: 'zeknova.stage1az/simulated-action',
          actionName: ACTIONS[index],
          observerId,
          targetSlot: action.target.slot,
          seed: String(context.seed),
        }],
        info: {
          authority: 'R0',
          detached: true,
          featureIndex,
          stochasticNoise: Number(noise.toFixed(12)),
        },
      };
    },

    isTerminal(state) {
      return Boolean(state.terminal || state.tick >= state.maxTick);
    },

    outcome(state, observerId) {
      const faction = state.factions[observerId];
      if (!faction) throw new Error(`Unknown ZekNova observer: ${observerId}`);
      const m = faction.metrics;
      const scalar = clamp(
        m.stability * 0.24 +
        (1 - m.threat) * 0.22 +
        m.infrastructure * 0.18 +
        m.intelligence * 0.14 +
        m.resources * 0.10 +
        m.routeIntegrity * 0.12,
        -1,
        1,
      );
      return {
        scalar: Number(scalar.toFixed(12)),
        terminal: this.isTerminal(state),
        vector: {
          stability: m.stability,
          threat: m.threat,
          infrastructure: m.infrastructure,
          intelligence: m.intelligence,
          resources: m.resources,
          routeIntegrity: m.routeIntegrity,
        },
        metadata: {
          observerId,
          scalarization: 'stage1az-shadow-v1',
          authority: 'R0',
        },
      };
    },

    importSnapshot(payload, context) {
      if (context?.mode !== 'detached-snapshot-ingestion') throw new Error('Invalid snapshot ingestion mode');
      if (context.formatId !== 'zeknova/stage1az-faction-state-json' || context.formatVersion !== 1) {
        throw new Error('Unsupported ZekNova snapshot format');
      }
      return structuredClone(validateState(payload, configuration));
    },
  });
}

export { ACTIONS as ZEKNOVA_STAGE1AZ_ACTIONS };
