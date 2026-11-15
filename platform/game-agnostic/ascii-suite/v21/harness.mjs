import { metricsOf, TICK_LIMITS, legalActions } from '../games.mjs';
import { createTemporalController } from './controller.mjs';
import { createAdversary } from './adversaries.mjs';
import { ObservationTransport } from './temporal.mjs';
import { initialWorld, advanceWorld, observe, opponentObservation } from './scenarios.mjs';
import { sha256 } from '../../src/core/determinism.js';
import { fighterFallback } from '../worlds/fighter.mjs';
export const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
export const quantile = (xs, q) => xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : null;
export function runEpisode({ game, seed, difficulty = 5, variant = 'V3', condition = 'NORMAL', scenario = 'STANDARD', slot = null, adversary = null, trace = true, maxTicks = TICK_LIMITS[game] }) {
  const config = { game, seed, difficulty, variant, condition, scenario, slot, adversary };
  let s = initialWorld(config), start = performance.now(), heapBefore = process.memoryUsage().heapUsed;
  const initialHash = sha256(s), controller = createTemporalController(game, variant, 'EVALUATION_PLAYER'), transport = new ObservationTransport('EVALUATION_PLAYER', condition);
  const opponent = adversary ? createAdversary(adversary, 'EVALUATION_OPPONENT') : null, opponentTransport = opponent ? new ObservationTransport('EVALUATION_OPPONENT', condition) : null;
  const actions = [], decisions = [], frames = [], predictions = [], calibration = [], estimates = [], statuses = {}, triggers = {};
  let reward = 0, executed = null, opponentExecuted = null, maximumAge = 0, illegal = 0, opponentIllegal = 0, repeatedTactics = 0, lastTactic = null;
  while (!s.terminal && s.tick < maxTicks) {
    const loopStart = performance.now(), packet = transport.sample(observe(s), s.tick, executed), d = controller.decide(packet);
    const od = opponent ? opponent.decide(opponentTransport.sample(opponentObservation(s), s.tick, opponentExecuted)) : null;
    if (d.action === lastTactic && d.action.startsWith('JUMP')) repeatedTactics++; lastTactic = d.action;
    if (!legalActions(s).includes(d.action)) illegal++;
    if (od && !opponentObservation(s).legalActions.includes(od.action)) opponentIllegal++;
    statuses[d.observationStatus] = (statuses[d.observationStatus] ?? 0) + 1; maximumAge = Math.max(maximumAge, d.observationAge ?? 0);
    if (d.adaptationTrigger) triggers[d.adaptationTrigger.type] = (triggers[d.adaptationTrigger.type] ?? 0) + 1;
    if (d.prediction && d.prediction.lead > 8 && d.prediction.lead < 40) predictions.push({ ...d.prediction, flightScore: s.score?.join(':') });
    const opponentApplied = od ? fighterFallback(s.fighters[1], od.action) : null;
    const next = advanceWorld(s, d.action, od?.action ?? null);
    if (game === 'pong' && next.lastCrossing && next.lastCrossing.tick === next.tick) {
      for (const p of predictions) if (p.flightScore === s.score.join(':')) calibration.push({ error: p.y - next.lastCrossing.y, sigma: p.sigma }); predictions.length = 0;
    }
    if (s.tick % 20 === 0 && d.estimatedState) {
      const observedTruth = observe(s), estimate = d.estimatedState;
      const truth = game === 'platformer' ? observedTruth.body : game === 'pong' ? { playerY: observedTruth.playerY } : observedTruth.me;
      const key = game === 'platformer' || game === 'fighter' ? 'x' : game === 'racing' ? 'n' : 'playerY';
      if (Number.isFinite(estimate[key])) estimates.push({ tick: s.tick, key, absError: Math.abs(estimate[key] - truth[key]), provenance: d.provenance });
    }
    executed = { action: next.audit?.applied ?? d.action, tick: s.tick }; controller.executed(executed.action, s.tick);
    if (opponent) { opponentExecuted = { action: opponentApplied, tick: s.tick }; opponent.executed(opponentApplied, s.tick); }
    const stateHash = sha256(next);
    actions.push({ action: d.action, opponentAction: od?.action ?? null, opponentApplied, applied: next.audit?.applied ?? d.action, stateHash });
    if (trace) frames.push({ receiptTick: s.tick, packet, action: d.action, opponentAction: od?.action ?? null, opponentPacket: opponentTransport ? opponentTransport.last : null,
      observationStatus: d.observationStatus, provenance: d.provenance, uncertainty: d.uncertainty, estimatedState: d.estimatedState, reason: d.reason, failure: d.lastFailure ?? null, adaptationTrigger: d.adaptationTrigger ?? null, prediction: d.prediction ?? null, opponentResponse: od?.opponentResponse ?? null, stateHash });
    decisions.push({ latency: d.latencyMs, estimation: d.estimationLatencyMs, loop: performance.now() - loopStart, branches: d.branches ?? 0, rolloutsUpperBound: d.computeRolloutUpperBound ?? 0, simulationRollouts: d.simulationRollouts ?? null, simulationSteps: d.simulationSteps ?? null, opponentLatency: od?.latencyMs ?? 0 });
    reward += next.reward; s = next;
  }
  const metrics = metricsOf(s), latencies = decisions.map(d => d.latency), wallMs = performance.now() - start;
  const success = game === 'racing' ? metrics.placement === 1 : s.result === 'WIN';
  const catastrophic = game === 'platformer' ? s.result === 'LOSS' : game === 'racing' ? metrics.barrierHits > 0 : s.result === 'LOSS';
  return { schema: 'ASCII_WORLDS_2_1_EPISODE_V1', evidenceStatus: 'DIAGNOSTIC', authority: 'R0', ...config,
    result: s.terminal ? s.result : 'CENSORED_BY_EVALUATION_BUDGET', success: s.terminal ? +success : null, catastrophic: +catastrophic, ticks: s.tick, totalReward: reward, metrics,
    compute: { meanMs: mean(latencies), p50Ms: quantile(latencies, .5), p95Ms: quantile(latencies, .95), p99Ms: quantile(latencies, .99), maxMs: Math.max(0, ...latencies), totalDecisionMs: latencies.reduce((a, b) => a + b, 0),
      estimatorMeanMs: mean(decisions.map(d => d.estimation)), controlLoopMeanMs: mean(decisions.map(d => d.loop)), controlLoopP95Ms: quantile(decisions.map(d => d.loop), .95),
      branchesMean: mean(decisions.map(d => d.branches)), branchesMax: Math.max(0, ...decisions.map(d => d.branches)), publishedSimulationTickUpperBound: decisions.reduce((a, d) => a + d.rolloutsUpperBound, 0),
      instrumentedPlannerSimulationRollouts: variant === 'V2' || variant === 'RULE' ? null : decisions.reduce((a, d) => a + (d.simulationRollouts ?? 0), 0),
      instrumentedPlannerSimulationSteps: variant === 'V2' || variant === 'RULE' ? null : decisions.reduce((a, d) => a + (d.simulationSteps ?? 0), 0),
      opponentDecisionMs: decisions.reduce((a, d) => a + d.opponentLatency, 0), wallMs, heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore, memoryMeasure: 'NET_HEAP_CHANGE_NOT_TOTAL_ALLOCATION; GC_AND_JIT_UNCONTROLLED' },
    timing: { maximumAge, statuses, illegalRequests: illegal, opponentIllegalRequests: opponentIllegal }, estimationAbsError: mean(estimates.map(e => e.absError)),
    REGRET_ONE_STEP_PROXY: null, DOWNSTREAM_DECISION_VALUE: null, opponentAdjustedRegret: null, regretStatus: 'NOT_TESTABLE_WITHOUT_VALID_COUNTERFACTUAL_TARGET; EPISODE_OUTCOMES_SEPARATE',
    calibration: { n: calibration.length, interceptAbsError: mean(calibration.map(c => Math.abs(c.error))), coverage1Sigma: mean(calibration.filter(c => c.sigma > 0).map(c => +(Math.abs(c.error) <= c.sigma))), coverage2Sigma: mean(calibration.filter(c => c.sigma > 0).map(c => +(Math.abs(c.error) <= 2 * c.sigma))) },
    triggers, repeatedTactics, memory: controller.memory(), opponentMemory: opponent?.memory() ?? null,
    initialStateHash: initialHash, actionSequenceHash: sha256(actions.map(a => [a.action, a.opponentAction])), finalStateHash: sha256(s), actions, ...(trace ? { frames } : {}) };
}
export function verifyReplay(episode) {
  let s = initialWorld(episode); if (sha256(s) !== episode.initialStateHash) throw Error('INITIAL_REPLAY_MISMATCH');
  for (const a of episode.actions) { s = advanceWorld(s, a.action, a.opponentAction); if (sha256(s) !== a.stateHash) throw Error('EXACT_ACTION_REPLAY_MISMATCH: ' + s.tick); }
  if (sha256(s) !== episode.finalStateHash) throw Error('FINAL_REPLAY_MISMATCH'); return true;
}
