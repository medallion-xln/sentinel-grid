import { defaultAuthorityPolicy, assertEvaluationOnly } from '../core/authority.js';
import { ROOT_PUCT_ENGINE_ID } from '../core/constants.js';
import {
  actionKey,
  assertActionIsLegal,
  validateAdapter,
  validateLegalActions,
  validateObservationPacket,
  validateOutcomePacket,
  validateTransitionResult,
} from '../core/contracts.js';
import { buildRecommendationPacket } from '../core/recommendation.js';
import { createSeededRandom, deriveSeed, sha256 } from '../core/determinism.js';

function validateSearchArguments({ observerId, simulations, seed, cPuct }) {
  if (typeof observerId !== 'string' || observerId.length === 0) throw new Error('observerId is required');
  if (!Number.isInteger(simulations) || simulations <= 0) throw new Error('simulations must be a positive integer');
  if (typeof seed !== 'bigint' && !(typeof seed === 'number' && Number.isSafeInteger(seed)) && !(typeof seed === 'string' && /^-?\d+$/.test(seed))) {
    throw new Error('seed must be a bigint, safe integer, or integer string');
  }
  if (!Number.isFinite(cPuct) || cPuct <= 0) throw new Error('cPuct must be finite and greater than zero');
}

function selectCandidate(stats, totalVisits, cPuct, seed, simulationIndex) {
  let selected = null;
  let selectedScore = -Infinity;
  for (const candidate of stats.values()) {
    const mean = candidate.visits === 0 ? 0 : candidate.valueSum / candidate.visits;
    const exploration = cPuct * candidate.prior * Math.sqrt(totalVisits + 1) / (1 + candidate.visits);
    const tieRandom = createSeededRandom(deriveSeed(seed, 'root-puct-tie', simulationIndex, candidate.key));
    const score = mean + exploration + tieRandom() * 1e-12;
    if (score > selectedScore) {
      selectedScore = score;
      selected = candidate;
    }
  }
  return selected;
}

export function recommend({
  adapter,
  state,
  observerId,
  simulations = 128,
  seed = 1n,
  cPuct = 1.4,
}) {
  validateSearchArguments({ observerId, simulations, seed, cPuct });
  const { manifest } = validateAdapter(adapter);
  const authority = defaultAuthorityPolicy();
  assertEvaluationOnly(authority);

  const sourceStateHash = sha256(state);
  if (adapter.isTerminal(state)) throw new Error('Cannot recommend from a terminal state');

  const observation = validateObservationPacket(adapter.observe(state, observerId), manifest);
  if (sha256(state) !== sourceStateHash) throw new Error('Adapter.observe mutated the source state');

  const legalActions = validateLegalActions(adapter.legalActions(state, observerId), { terminal: false });
  if (sha256(state) !== sourceStateHash) throw new Error('Adapter.legalActions mutated the source state');

  const orderedActions = [...legalActions].sort((a, b) => actionKey(a).localeCompare(actionKey(b)));
  const prior = 1 / orderedActions.length;
  const stats = new Map(orderedActions.map((action) => {
    const key = actionKey(action);
    return [key, {
      key,
      action: structuredClone(action),
      visits: 0,
      valueSum: 0,
      prior,
      terminalSamples: 0,
    }];
  }));

  for (let simulationIndex = 0; simulationIndex < simulations; simulationIndex += 1) {
    const selected = selectCandidate(stats, simulationIndex, cPuct, seed, simulationIndex);
    assertActionIsLegal(selected.action, legalActions);

    const actionBefore = sha256(selected.action);
    const clone = adapter.cloneState(state);
    if (sha256(clone) !== sourceStateHash) throw new Error('Adapter.cloneState changed state content');

    const transitionSeed = deriveSeed(seed, 'root-transition', simulationIndex, selected.key);
    const result = validateTransitionResult(adapter.step(clone, structuredClone(selected.action), {
      observerId,
      seed: transitionSeed,
      simulationIndex,
      random: createSeededRandom(transitionSeed),
      mode: 'detached-simulation',
    }));

    if (sha256(state) !== sourceStateHash) throw new Error('Adapter.step mutated the source state');
    if (sha256(selected.action) !== actionBefore) throw new Error('Adapter.step mutated the selected action descriptor');
    if (result.terminal !== adapter.isTerminal(result.state)) throw new Error('TransitionResult.terminal disagrees with adapter.isTerminal');

    let value = result.reward;
    if (result.terminal) {
      const terminalOutcome = validateOutcomePacket(adapter.outcome(result.state, observerId));
      if (!terminalOutcome.terminal) throw new Error('Terminal state produced a non-terminal OutcomePacket');
      value = terminalOutcome.scalar;
      selected.terminalSamples += 1;
    }
    if (!Number.isFinite(value)) throw new Error('Search evaluation must be finite');

    selected.visits += 1;
    selected.valueSum += value;
  }

  const ranking = [...stats.values()]
    .map((entry) => ({
      action: entry.action,
      visits: entry.visits,
      valueSum: entry.valueSum,
      meanValue: entry.visits === 0 ? 0 : entry.valueSum / entry.visits,
      prior: entry.prior,
      terminalSamples: entry.terminalSamples,
    }))
    .sort((a, b) =>
      b.visits - a.visits ||
      b.meanValue - a.meanValue ||
      actionKey(a.action).localeCompare(actionKey(b.action))
    );

  if (sha256(state) !== sourceStateHash) throw new Error('Recommendation mutated the source state');

  return buildRecommendationPacket({
    adapterManifest: manifest,
    sourceStateHash,
    observation,
    legalActions: orderedActions,
    ranking,
    selected: ranking[0].action,
    seed,
    simulations,
    cPuct,
    engineId: ROOT_PUCT_ENGINE_ID,
    authority,
  });
}
