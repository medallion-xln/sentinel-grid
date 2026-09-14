import { deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { renderWorld } from '../forge/render.js';

export const ASCII_OBSERVATORY_CONTRACT_ID = 'SENTINEL_ASCII_OBSERVATORY_V1';
export const ObservatoryView = deepFreeze({
  WORLD: 'WORLD', STATE: 'STATE', DECISION: 'DECISION', TRACE: 'TRACE',
  COUNTERFACTUALS: 'COUNTERFACTUALS', EXPERIENCE: 'EXPERIENCE', METRICS: 'METRICS',
});
export const ASCII_OBSERVATORY_CONTRACT = deepFreeze({
  contractId: ASCII_OBSERVATORY_CONTRACT_ID, schemaVersion: 1,
  views: Object.values(ObservatoryView), readOnly: true, presentationOnly: true,
  decisionInput: false, governedEvidence: false, boundedBuffer: true,
  backpressurePolicy: 'DROP_OLDEST_FRAME_NEVER_BLOCK_RUNTIME',
  prohibitedCapabilities: ['dispatch', 'execute', 'mutate', 'override', 'changeModel', 'changeThreshold', 'changeEnvironment', 'train'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const ASCII_OBSERVATORY_CONTRACT_HASH = sha256(ASCII_OBSERVATORY_CONTRACT);

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const short = (value, full) => value === null || value === undefined ? 'UNKNOWN'
  : full ? String(value) : String(value).replace(/^sha256:/, '').slice(0, 12);
const line = (label, value) => `${label.padEnd(24)} ${value ?? 'UNKNOWN'}`;

export function createBoundedTelemetryProducer({ capacity = 32 } = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 4096) throw new Error('capacity must be an integer in [1,4096]');
  const frames = []; let offered = 0; let dropped = 0; let rejected = 0; let connected = true;
  return Object.freeze({
    offer(frame) {
      offered += 1; if (!connected) { dropped += 1; return false; }
      try { stableStringify(frame); const frozen = deepFreeze(clone(frame));
        if (frames.length >= capacity) { frames.shift(); dropped += 1; }
        frames.push(frozen); return true;
      } catch { rejected += 1; return false; }
    },
    snapshot() { return deepFreeze({ frames: clone(frames), stats: { capacity, size: frames.length, offered, dropped, rejected, connected } }); },
    disconnect() { connected = false; },
    reconnect() { connected = true; },
  });
}

/** The returned surface has no producer, authority, adapter, or execution methods. */
export function createReadOnlyAsciiObservatory(producer) {
  if (!producer || typeof producer.snapshot !== 'function') throw new Error('telemetry producer snapshot required');
  return Object.freeze({
    contractId: ASCII_OBSERVATORY_CONTRACT_ID,
    views: Object.values(ObservatoryView),
    snapshot: () => producer.snapshot(),
    render: ({ view = ObservatoryView.WORLD, index = -1, fullIds = false } = {}) => {
      const state = producer.snapshot(); const resolved = index < 0 ? state.frames.length + index : index;
      const frame = state.frames[resolved];
      if (!frame) return 'SENTINEL ASCII OBSERVATORY\nNO TELEMETRY FRAME';
      return renderAsciiObservatoryFrame(frame, { view, fullIds, telemetryStats: state.stats, aggregate: aggregateFrames(state.frames) });
    },
  });
}

function facts(frame) {
  const all = [...(frame.worldState?.facts ?? []), ...(frame.actualState?.facts ?? [])];
  return all.sort((a, b) => a.path.join('.').localeCompare(b.path.join('.')));
}

export function renderAsciiObservatoryFrame(frame, { view = ObservatoryView.WORLD, fullIds = false, telemetryStats = null, aggregate = null } = {}) {
  if (!Object.values(ObservatoryView).includes(view)) throw new Error(`unsupported observatory view: ${view}`);
  const header = [`SENTINEL ASCII OBSERVATORY :: ${view}`,
    line('health', frame.degradation?.status), line('logical time', frame.logicalTime),
    line('authority', 'R0 / NON-DISPATCHING / INCUMBENT SOLE EXECUTOR')];
  let body = [];
  if (view === ObservatoryView.WORLD) body = frame.world ? [renderWorld(frame.world, { header: false, legend: true })] : ['WORLD UNKNOWN'];
  if (view === ObservatoryView.STATE) body = Object.values({ OBSERVED: 'OBSERVED', DERIVED: 'DERIVED', PREDICTED: 'PREDICTED', UNKNOWN: 'UNKNOWN' })
    .flatMap((category) => { const group = facts(frame).filter((fact) => fact.category === category);
      return [category, ...(group.length ? group.map((fact) => `  ${fact.path.join('.')}=${stableStringify(fact.value)} confidence=${fact.confidence}`) : ['  (none)'])]; });
  if (view === ObservatoryView.DECISION) body = [line('router score', frame.router?.score), line('threshold', frame.router?.threshold),
    line('selected route', frame.router?.selectedRoute), line('recommended action', frame.trace?.recommendation?.proposedAction?.actionId),
    line('incumbent match', frame.trace?.matchingStatus)];
  if (view === ObservatoryView.TRACE) body = [line('trace id', short(frame.trace?.traceId, fullIds)),
    line('trace digest', short(frame.trace?.traceDigest, fullIds)), line('lifecycle', frame.trace?.lifecycleStatus),
    line('observation id', short(frame.trace?.observationId, fullIds)), line('world state id', short(frame.trace?.worldStateId, fullIds)),
    line('feature derivation', short(frame.trace?.featureDerivationId, fullIds)), line('router evaluation', short(frame.trace?.routerEvaluationId, fullIds)),
    line('recommendation id', short(frame.trace?.recommendationId, fullIds)), line('incumbent action id', short(frame.trace?.incumbentActionId, fullIds)),
    line('outcome id', short(frame.trace?.outcomeId, fullIds)), line('outcome status', frame.trace?.outcomeStatus)];
  if (view === ObservatoryView.COUNTERFACTUALS) body = [line('ledger id', short(frame.ledger?.ledgerEntryId, fullIds)),
    line('ledger digest', short(frame.ledger?.ledgerDigest, fullIds)), line('counterfactuals', frame.ledger?.counterfactualCount),
    line('Sentinel proposal', frame.ledger?.sentinelProposal?.proposedAction?.actionId),
    line('incumbent selected', frame.ledger?.selectedActions?.[0]?.selectedAction?.actionId),
    line('actual outcome', frame.ledger?.outcomes?.[0]?.outcomeStatus ?? 'UNKNOWN'),
    line('evaluation', frame.ledger?.evaluations?.at(-1)?.status ?? 'UNRESOLVED'),
    line('veto count', frame.ledger?.vetoes?.length ?? 0),
    ...(frame.ledger?.counterfactuals ?? []).map((v) => `PREDICTED ${v.candidateAction.actionId} confidence=${v.confidence}`),
    ...(frame.ledger?.vetoes ?? []).map((v) => `VETO ${v.disposition} actor=${v.actor.type}:${v.actor.id}`)];
  if (view === ObservatoryView.EXPERIENCE) body = [line('experience id', short(frame.experience?.experienceId, fullIds)),
    line('experience digest', short(frame.experience?.experienceDigest, fullIds)), line('validation', frame.experience?.validationStatus),
    ...['TRANSITION_MODEL_TRAINING', 'ROUTER_ANALYSIS', 'PREDICTION_CALIBRATION', 'COUNTERFACTUAL_EVALUATION', 'STRATEGIC_POLICY_RESEARCH']
      .map((purpose) => line(purpose, frame.experience?.eligibility?.[purpose]?.status ?? 'UNRESOLVED')),
    line('prediction error', frame.experience?.predictionErrorStatus)];
  if (view === ObservatoryView.METRICS) body = [line('producer offered', telemetryStats?.offered), line('buffer size', telemetryStats?.size),
    line('dropped frames', telemetryStats?.dropped), line('rejected frames', telemetryStats?.rejected),
    line('episodes observed', aggregate?.episodes), line('states observed', aggregate?.states),
    line('valid transitions', aggregate?.valid), line('invalid transitions', aggregate?.invalid),
    line('conflicted episodes', aggregate?.conflicted), line('agreement rate', aggregate?.agreementRate),
    line('outcome resolution', aggregate?.outcomeResolutionRate), line('calibration insufficient', aggregate?.calibrationInsufficiencyRate),
    line('routing precision', aggregate?.routingPrecision), line('prediction error', aggregate?.predictionError),
    line('failures', frame.degradation?.failures?.length ?? 0), ...(frame.degradation?.failures ?? []).map((f) => `FAIL ${f.stage}: ${f.reason}`)];
  return [...header, '', ...body].join('\n');
}

function aggregateFrames(frames) {
  const latest = new Map(); for (const frame of frames) latest.set(frame.trace?.traceId ?? `unknown:${frame.logicalTime}`, frame);
  const episodes = [...latest.values()]; const count = (fn) => episodes.filter(fn).length;
  const ratio = (n, d) => d === 0 ? 'UNKNOWN' : (n / d).toFixed(4);
  return { episodes: episodes.length, states: count((f) => f.worldState),
    valid: count((f) => f.experience?.validationStatus === 'VALIDATED'),
    invalid: count((f) => ['INVALID', 'INCOMPLETE'].includes(f.experience?.validationStatus)),
    conflicted: count((f) => f.degradation?.status === 'CONFLICTED'),
    agreementRate: ratio(count((f) => f.trace?.matchingStatus === 'MATCH'), count((f) => f.trace?.matchingStatus)),
    outcomeResolutionRate: ratio(count((f) => f.trace?.outcomeStatus === 'BOUND'), count((f) => f.trace)),
    calibrationInsufficiencyRate: ratio(count((f) => f.degradation?.failures?.some((x) => x.reason === 'CALIBRATION_INSUFFICIENT')), episodes.length),
    routingPrecision: 'UNKNOWN_NOT_ESTABLISHED_IN_STAGE3F5', predictionError: 'UNKNOWN_NOT_ESTABLISHED_IN_STAGE3F5' };
}
