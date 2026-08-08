import { actionKey } from '../core/contracts.js';
import { createSeededRandom, deriveSeed, sha256 } from '../core/determinism.js';

export const LEGACY_ENGINE_ID = 'sentinel-prime-root-puct-v1-development';
export const LEGACY_ACTIONS = Object.freeze([
  'stabilize',
  'scout_region',
  'intercept_contact',
  'fortify_known_route',
  'repair_known_structure',
  'share_intelligence',
]);

const LEGACY_EFFECTS = Object.freeze([
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

export function legacyObservation(state, observerId) {
  const faction = state.factions[observerId];
  if (!faction) throw new Error(`Unknown legacy faction ${observerId}`);
  return [...faction.observation];
}

export function legacyMask(state, observerId) {
  const faction = state.factions[observerId];
  if (!faction) throw new Error(`Unknown legacy faction ${observerId}`);
  return [...faction.legalMask];
}

export function legacyTargets(state, observerId) {
  const faction = state.factions[observerId];
  if (!faction) throw new Error(`Unknown legacy faction ${observerId}`);
  return structuredClone(faction.targetSlots);
}

export function legacyLegalActions(state, observerId) {
  const faction = state.factions[observerId];
  if (!faction) throw new Error(`Unknown legacy faction ${observerId}`);
  if (state.terminal || state.tick >= state.maxTick) return [];
  return faction.legalMask.flatMap((legal, index) => {
    if (!legal) return [];
    const actionName = LEGACY_ACTIONS[index];
    const target = faction.targetSlots[actionName];
    return [{
      actionId: `zeknova.stage1az/${actionName}`,
      actorId: observerId,
      target: structuredClone(target),
      parameters: { legacyActionIndex: index, targetSlot: target.slot },
      metadata: { legacyActionName: actionName, engineIdentity: LEGACY_ENGINE_ID },
    }];
  });
}

export function legacyStep(sourceState, action, { seed, simulationIndex, stochasticAmplitude = 0.015 }) {
  const state = structuredClone(sourceState);
  const observerId = action.actorId;
  const faction = state.factions[observerId];
  const actionIndex = LEGACY_ACTIONS.findIndex((name) => action.actionId === `zeknova.stage1az/${name}`);
  if (!faction || actionIndex < 0 || !faction.legalMask[actionIndex]) throw new Error('Legacy action is illegal');
  const expected = legacyLegalActions(state, observerId).find((candidate) => actionKey(candidate) === actionKey(action));
  if (!expected) throw new Error('Legacy action target is not canonical');
  const transitionSeed = deriveSeed(seed, 'root-transition', simulationIndex, actionKey(action));
  const random = createSeededRandom(transitionSeed);
  const noise = (random() - 0.5) * 2 * stochasticAmplitude;
  const effect = LEGACY_EFFECTS[actionIndex];
  const featureIndex = (actionIndex * 97 + action.target.slot * 13 + state.tick) % 592;
  faction.observation[featureIndex] = Number(clamp(faction.observation[featureIndex] + effect.featureDelta + noise).toFixed(6));
  faction.metrics[effect.metric] = Number(clamp(faction.metrics[effect.metric] + effect.metricDelta + noise, -1, 1).toFixed(6));
  faction.knowledge.epoch += 1;
  state.tick += 1;
  state.terminal = state.tick >= state.maxTick || faction.metrics.stability <= -0.95;
  const reward = Number((effect.reward + noise - Math.max(0, faction.metrics.threat) * 0.01).toFixed(12));
  return { state, reward, terminal: state.terminal, transitionSeed };
}

export function legacyOutcome(state, observerId) {
  const m = state.factions[observerId].metrics;
  const scalar = clamp(
    m.stability * 0.24 + (1 - m.threat) * 0.22 + m.infrastructure * 0.18 +
    m.intelligence * 0.14 + m.resources * 0.10 + m.routeIntegrity * 0.12,
    -1,
    1,
  );
  return Number(scalar.toFixed(12));
}

function select(stats, totalVisits, cPuct, seed, simulationIndex) {
  let best = null;
  let bestScore = -Infinity;
  for (const candidate of stats) {
    const mean = candidate.visits === 0 ? 0 : candidate.valueSum / candidate.visits;
    const exploration = cPuct * candidate.prior * Math.sqrt(totalVisits + 1) / (1 + candidate.visits);
    const tie = createSeededRandom(deriveSeed(seed, 'root-puct-tie', simulationIndex, candidate.key))() * 1e-12;
    const score = mean + exploration + tie;
    if (score > bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

export function legacyRecommend({ state, observerId, seed, simulations, cPuct = 1.25, stochasticAmplitude = 0.015 }) {
  const actions = legacyLegalActions(state, observerId).sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
  const prior = 1 / actions.length;
  const stats = actions.map((action) => ({ key: actionKey(action), action, visits: 0, valueSum: 0, prior }));
  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const selected = select(stats, simulationIndex, cPuct, seed, simulationIndex);
    const result = legacyStep(state, selected.action, { seed, simulationIndex, stochasticAmplitude });
    let value = result.reward;
    if (result.terminal) value = legacyOutcome(result.state, observerId);
    selected.visits += 1;
    selected.valueSum += value;
  }
  const ranking = stats.map((entry) => ({
    actionKey: entry.key,
    visits: entry.visits,
    valueSum: Number(entry.valueSum.toFixed(12)),
    meanValue: Number((entry.visits ? entry.valueSum / entry.visits : 0).toFixed(12)),
  })).sort((a, b) => b.visits - a.visits || b.meanValue - a.meanValue || a.actionKey.localeCompare(b.actionKey));
  const payload = {
    engineId: LEGACY_ENGINE_ID,
    sourceStateHash: sha256(state),
    observerId,
    seed: String(seed),
    simulations,
    cPuct,
    observationHash: sha256(legacyObservation(state, observerId)),
    maskHash: sha256(legacyMask(state, observerId)),
    targetSlotsHash: sha256(legacyTargets(state, observerId)),
    legalActionKeys: actions.map(actionKey),
    ranking,
    selectedActionKey: ranking[0].actionKey,
  };
  return { ...payload, legacyEvidenceHash: sha256(payload) };
}
