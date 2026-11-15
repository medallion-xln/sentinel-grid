// ASCII Worlds 2.0 evaluation harness. Development/diagnostic evaluation only: no certificate, no authority change, no learning.
import { createGame, stepGame, observe, legalActions, metricsOf, TICK_LIMITS } from '../games.mjs';
import { createController } from '../controllers/index.mjs';
import { sha256 } from '../../src/core/determinism.js';

export const CONDITIONS = ['FIRST_ENCOUNTER', 'REPEATED_SIMILAR', 'CHANGED_INITIAL_STATE', 'CHANGED_OPPONENT', 'UNSEEN_SEED', 'INCREASED_DIFFICULTY', 'DELAYED_OBSERVATION'];
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const pct = (a, q) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };

// Condition-specific state changes. They alter the environment, never the controller.
export const MUTATIONS = {
  CHANGED_INITIAL_STATE: {
    pong: s => { s.playerY = 6; s.ball.y = Math.min(28, s.ball.y + 7); s.observed = { ...s.ball, tick: 0 }; s.obsBuffer = [{ x: s.ball.x, y: s.ball.y, tick: 0 }]; },
    platformer: s => { s.x = 9; s.vx = .5; s.lifeMaxX = 9; s.lifeStartX = 9; },
    fighter: s => { s.fighters[0].x = 52; s.fighters[1].x = 66; },
    racing: s => { const cars = [s.player, ...s.rivals].sort((a, b) => a.s - b.s), last = cars[0]; [s.player.s, last.s] = [last.s, s.player.s]; [s.player.n, last.n] = [last.n, s.player.n]; },
  },
  CHANGED_OPPONENT: {
    pong: s => { s.opponentVariant = 'ADAPTIVE'; },
    platformer: s => { for (const e of s.enemies) { e.speed *= 1.6; e.dir *= -1; } },
    fighter: null, // handled by a different archetype in config
    racing: s => { for (const c of s.rivals) Object.assign(c.driver, { skill: Math.min(.99, c.driver.skill + .03), defend: true, brakeMargin: 1.02 }); },
  },
};

export function runEpisode({ game, controller, seed, difficulty = 3, style = 'ADAPTIVE', condition = 'FIRST_ENCOUNTER', obsDelay = 0, obsDropout = 0, mutate = null,
  inherited = null, maxTicks = null, regretEvery = 0, keepActions = true }) {
  let state = createGame(game, { seed, difficulty, style }); if (mutate) mutate(state);
  const initial = structuredClone(state), ctrl = createController(game, controller, { seed, inherited });
  const limit = Math.min(maxTicks ?? TICK_LIMITS[game], TICK_LIMITS[game]);
  const buffer = [], decisions = [], actions = [], preds = [], calib = [];
  let totalReward = 0, dropRng = (seed * 2654435761) >>> 0, regret = 0, regretSamples = 0, optimal = 0, lastObs = null, illegal = 0, ties = 0, categoryTies = 0, actionable = 0;
  const triggers = {}, strategies = new Set(), firstFailureTick = { value: null };
  while (!state.terminal && state.tick < limit) {
    // Generic delayed/incomplete observation: the controller sees the observation (or state, for the simulator-access incumbent) from `obsDelay` ticks ago; with probability `obsDropout` it sees a stale repeat.
    buffer.push(ctrl.access === 'KNOWN_SIMULATOR_DIAGNOSTIC' ? state : observe(state)); if (buffer.length > obsDelay + 1) buffer.shift();
    dropRng = (Math.imul(dropRng, 1664525) + 1013904223) >>> 0;
    let seen = buffer[0]; if (obsDropout && lastObs && dropRng / 4294967296 < obsDropout) seen = lastObs; lastObs = seen;
    const d = ctrl.access === 'KNOWN_SIMULATOR_DIAGNOSTIC' ? ctrl.decide(seen.terminal ? state : seen) : ctrl.decide(state, { observation: seen });
    const legalNow = legalActions(state), legal = legalNow.includes(d.action);
    if (!legal) illegal++;
    if (legalNow.length > 1) { actionable++; if ((d.qTies ?? 1) > 1) ties++; if ((d.qTieCategories ?? d.qTies ?? 1) > 1) categoryTies++; }
    if (d.adaptationTrigger) { triggers[d.adaptationTrigger.type] = (triggers[d.adaptationTrigger.type] ?? 0) + 1; if (d.adaptationTrigger.to) strategies.add(d.adaptationTrigger.to); }
    if (d.prediction && d.prediction.lead > 8 && d.prediction.lead < 40) preds.push({ ...d.prediction, tick: state.tick });
    if (regretEvery && state.tick % regretEvery === 0) {
      const rewards = legalNow.map(a => stepGame(state, a).reward), best = Math.max(...rewards), chosen = stepGame(state, legal ? d.action : legalNow[0]).reward;
      regret += best - chosen; regretSamples++; if (Math.abs(best - chosen) < 1e-9) optimal++;
    }
    decisions.push({ latencyMs: d.latencyMs ?? 0, branches: d.branches ?? 0, horizon: typeof d.horizon === 'number' ? d.horizon : d.horizon === 'ONE_STEP' ? 1 : null });
    const next = stepGame(state, d.action === 'NO_ACTION_TERMINAL' ? legalNow[0] : d.action);
    totalReward += next.reward; actions.push(d.action); // always hashed; only emitted when keepActions
    if (game === 'pong' && next.lastCrossing && next.lastCrossing.tick === state.tick) {
      for (const p of preds) { const e = p.y - next.lastCrossing.y; calib.push({ error: e, sigma: p.sigma ?? null }); }
      preds.length = 0;
    }
    if (firstFailureTick.value === null && next.events.some(e => /FALL|CONTACT|POINT_LOST|OPPONENT_.*_HIT|OFF_TRACK|BARRIER/.test(e))) firstFailureTick.value = next.tick;
    state = next;
  }
  const terminalDecision = state.terminal ? ctrl.decide(state).action : null;
  const withSigma = calib.filter(c => c.sigma);
  const controllerMetrics = {
    decisionLatencyMeanMs: mean(decisions.map(d => d.latencyMs)), decisionLatencyP95Ms: pct(decisions.map(d => d.latencyMs), .95),
    branchesMean: mean(decisions.map(d => d.branches)), planningHorizonMax: Math.max(0, ...decisions.map(d => d.horizon ?? 0)),
    actionLegalityRate: decisions.length ? 1 - illegal / decisions.length : null, qTieRate: actionable ? ties / actionable : null, crossCategoryTieRate: actionable ? categoryTies / actionable : null,
    adaptationTriggers: triggers, uniqueRetryStrategies: strategies.size, retryStrategies: [...strategies],
    terminalBehavior: state.terminal ? (terminalDecision === 'NO_ACTION_TERMINAL' ? 'NO_ACTION_TERMINAL' : 'EXECUTABLE_ACTION_AFTER_TERMINAL') : 'CENSORED',
    oneStepShapedRewardRegretProxy: regretSamples ? regret / regretSamples : null, oneStepOptimalHitProxy: regretSamples ? optimal / regretSamples : null,
    interceptAbsError: calib.length ? mean(calib.map(c => Math.abs(c.error))) : null,
    calibrationCoverage1Sigma: withSigma.length ? withSigma.filter(c => Math.abs(c.error) <= c.sigma).length / withSigma.length : null,
    calibrationCoverage2Sigma: withSigma.length ? withSigma.filter(c => Math.abs(c.error) <= 2 * c.sigma).length / withSigma.length : null,
    firstFailureTick: firstFailureTick.value,
  };
  return { game, controller, controllerLabel: ctrl.label, capability: ctrl.capability, access: ctrl.access, seed, difficulty, style: game === 'fighter' ? style : null, condition, obsDelay, obsDropout,
    result: state.terminal ? state.result : 'CENSORED_BY_EVALUATION_BUDGET', ticks: state.tick, totalReward, metrics: metricsOf(state), controllerMetrics,
    memory: ctrl.memory(), actionCount: actions.length, actionSequenceHash: sha256(actions), finalStateHash: sha256(state), initialStateHash: sha256(initial), ...(keepActions ? { actions } : {}) };
}

// Replays an exact action sequence from the same initial configuration; used to prove outcomes are reproducible.
export function replay({ game, seed, difficulty, style = 'ADAPTIVE', mutate = null }, actions) {
  let s = createGame(game, { seed, difficulty, style }); if (mutate) mutate(s);
  for (const a of actions) { if (s.terminal) break; s = stepGame(s, a === 'NO_ACTION_TERMINAL' ? legalActions(s)[0] : a); }
  return s;
}

// Runs one condition for one controller and returns the episodes (REPEATED_SIMILAR runs twice; the second carries explicit memory).
export function runCondition({ game, controller, seed, difficulty, condition, style = 'ADAPTIVE', heldOutSeed, altStyle = 'AGGRESSIVE', maxTicks = null }) {
  const base = { game, controller, seed, difficulty, style, condition, maxTicks, keepActions: false };
  if (condition === 'FIRST_ENCOUNTER') return [runEpisode(base)];
  if (condition === 'REPEATED_SIMILAR') { const first = runEpisode({ ...base, condition: 'REPEATED_SIMILAR_ATTEMPT_1' }); return [first, runEpisode({ ...base, condition: 'REPEATED_SIMILAR_ATTEMPT_2', inherited: first.memory })]; }
  if (condition === 'CHANGED_INITIAL_STATE') return [runEpisode({ ...base, mutate: MUTATIONS.CHANGED_INITIAL_STATE[game] })];
  if (condition === 'CHANGED_OPPONENT') return [game === 'fighter' ? runEpisode({ ...base, style: altStyle }) : runEpisode({ ...base, mutate: MUTATIONS.CHANGED_OPPONENT[game] })];
  if (condition === 'UNSEEN_SEED') return [runEpisode({ ...base, seed: heldOutSeed })];
  if (condition === 'INCREASED_DIFFICULTY') return [runEpisode({ ...base, difficulty: Math.min(5, difficulty + 2) })];
  if (condition === 'DELAYED_OBSERVATION') return [runEpisode({ ...base, obsDelay: 3, obsDropout: .1 })];
  throw Error('Unknown condition ' + condition);
}
