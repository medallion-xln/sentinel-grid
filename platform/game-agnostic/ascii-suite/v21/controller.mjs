import { createController } from '../controllers/index.mjs';
import { createPlatformerPlanner } from './controllers/platformer.mjs';
import { createSentinelPong } from './controllers/pong.mjs';
import { createFighterPlanner } from './controllers/fighter.mjs';
import { createSentinelRacer } from './controllers/racing.mjs';
import { TemporalEstimator } from './estimator.mjs';
import { deepFreeze } from './temporal.mjs';
export const VARIANTS = ['V2', 'V3', 'RAW_LATEST_OBSERVATION', 'AGE_AWARE_ESTIMATION', 'AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY', 'AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY', 'NO_UNCERTAINTY', 'NO_ACTION_HISTORY', 'NO_MEMORY', 'NO_OPPONENT_MODEL', 'SHORT_HORIZON', 'NO_STRATEGIC_ACTION', 'SHOT_PLANNER', 'RULE'];
export function createTemporalController(game, variant, episodeId) {
  if (!VARIANTS.includes(variant)) throw Error('UNKNOWN_VARIANT');
  const isV2 = variant === 'V2' || variant === 'RULE';
  const estimation = !['RAW_LATEST_OBSERVATION'].includes(variant), uncertainty = !['RAW_LATEST_OBSERVATION', 'AGE_AWARE_ESTIMATION', 'AGE_AWARE_ESTIMATION_WITH_ACTION_HISTORY', 'NO_UNCERTAINTY'].includes(variant),
    actionHistory = !['RAW_LATEST_OBSERVATION', 'AGE_AWARE_ESTIMATION', 'AGE_AWARE_ESTIMATION_WITH_UNCERTAINTY', 'NO_ACTION_HISTORY'].includes(variant);
  const estimator = new TemporalEstimator(game, episodeId, { estimation: !isV2 && estimation, uncertainty: !isV2 && uncertainty, actionHistory: !isV2 && actionHistory });
  const v2kind = variant === 'RULE' ? { pong: 'ANALYTIC_INTERCEPT', platformer: 'RULE_BASELINE', fighter: 'RULE_BASELINE', racing: 'RULE_BASED' }[game] : game === 'pong' ? 'SENTINEL_FILTER_ONLY' : 'SENTINEL';
  const inner = isV2 ? createController(game, v2kind).inner : game === 'platformer' ? createPlatformerPlanner({ memory: variant !== 'NO_MEMORY', robust: uncertainty, horizon: variant === 'SHORT_HORIZON' ? 28 : 45 })
    : game === 'pong' ? createSentinelPong({ strategic: variant === 'SHOT_PLANNER', uncertainty })
    : game === 'fighter' ? createFighterPlanner({ opponentModel: variant !== 'NO_OPPONENT_MODEL', riskWeight: uncertainty ? .3 : 0, horizon: variant === 'SHORT_HORIZON' ? 18 : 28 })
    : createSentinelRacer({ memory: variant !== 'NO_MEMORY', robust: uncertainty, racecraft: variant !== 'NO_STRATEGIC_ACTION', horizon: variant === 'SHORT_HORIZON' ? 24 : 40 });
  let previousRaw = null, previousDecision = null;
  return { game, variant, access: 'OBSERVATION_ONLY',
    decide(packet) {
      const start = performance.now();
      const estimated = estimator.update(packet);
      const o = isV2 ? packet.payload ?? previousRaw : estimated.observation;
      if (packet.payload) previousRaw = packet.payload;
      if (!o) return { action: game === 'fighter' || game === 'platformer' ? 'WAIT' : 'HOLD', reason: 'no observation: safe idle', observationStatus: 'MISSING_OBSERVATION', provenance: 'UNKNOWN', branches: 0, horizon: 0, latencyMs: performance.now() - start, estimationLatencyMs: estimated.latencyMs };
      const d = inner.decide(deepFreeze(structuredClone(o)));
      const latencyMs = performance.now() - start;
      previousDecision = { ...d, source: variant, sourceTick: packet.receiptTick, controller: isV2 ? 'FROZEN_V2_' + v2kind : 'TEMPORAL_TASK_' + game.toUpperCase() + '_V3', variant,
        observationId: estimated.observed?.observationId ?? packet.observationId, observationAge: estimated.gate.age, observationStatus: estimated.gate.status,
        estimatedState: game === 'platformer' ? o.body : game === 'pong' ? { playerY: o.playerY, ballObserved: o.ball, prediction: d.prediction } : o.me,
        uncertainty: estimated.uncertainty, provenance: estimated.provenance, authoritativeObservation: estimated.observed,
        estimationLatencyMs: estimated.latencyMs, predictionSteps: estimated.predictionSteps, latencyMs,
        replanReason: estimated.gate.fresh ? 'NEW_AUTHORITATIVE_OBSERVATION' : 'TIME_ADVANCED_WITHOUT_NEW_MEASUREMENT', memoryUsed: variant !== 'NO_MEMORY' && ['platformer', 'racing', 'fighter'].includes(game), evidenceStatus: 'DIAGNOSTIC_TASK_CONTROLLER_NOT_NINE_EXPERT_MOE',
        estimatedActionExecutionTick: packet.receiptTick, computeRolloutUpperBound: (d.branches ?? 0) * (typeof d.horizon === 'number' ? d.horizon : 0) + estimated.predictionSteps };
      return previousDecision;
    },
    executed(action, tick) { estimator.executed(action, tick); },
    memory: () => inner.memorySnapshot?.() ?? null,
    lastDecision: () => previousDecision,
  };
}
