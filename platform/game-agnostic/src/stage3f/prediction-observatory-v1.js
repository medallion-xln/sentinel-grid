import { deepFreeze, sha256, stableStringify } from '../core/determinism.js';
import { ASCII_OBSERVATORY_CONTRACT, ObservatoryView, createReadOnlyAsciiObservatory } from './ascii-observatory-v1.js';

/* Stage 3F.6 extension of the read-only ASCII Observatory. The seven certified Stage 3F.5 views are
 * delegated byte-for-byte to the unmodified v1 renderer; PREDICTION is added alongside them. */

export const PredictionObservatoryView = deepFreeze({ ...ObservatoryView, PREDICTION: 'PREDICTION' });
export const PREDICTION_OBSERVATORY_CONTRACT = deepFreeze({
  contractId: 'SENTINEL_ASCII_OBSERVATORY_PREDICTION_V1', schemaVersion: 1,
  extends: { contractId: ASCII_OBSERVATORY_CONTRACT.contractId, legacyViewsUnchanged: ASCII_OBSERVATORY_CONTRACT.views },
  views: Object.values(PredictionObservatoryView), readOnly: true, presentationOnly: true, decisionInput: false,
  governedEvidence: false, boundedBuffer: true, backpressurePolicy: ASCII_OBSERVATORY_CONTRACT.backpressurePolicy,
  prohibitedCapabilities: ASCII_OBSERVATORY_CONTRACT.prohibitedCapabilities,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const PREDICTION_OBSERVATORY_CONTRACT_HASH = sha256(PREDICTION_OBSERVATORY_CONTRACT);

const line = (label, value) => `${label.padEnd(26)} ${value ?? 'UNKNOWN'}`;
const show = (value) => (value === null || value === undefined ? 'UNKNOWN' : typeof value === 'object' ? stableStringify(value) : String(value));

export function renderPredictionFrame(frame, { telemetryStats = null } = {}) {
  const p = frame.prediction;
  const header = ['SENTINEL ASCII OBSERVATORY :: PREDICTION', line('health', frame.degradation?.status), line('logical time', frame.logicalTime),
    line('authority', 'R0 / NON-DISPATCHING / INCUMBENT SOLE EXECUTOR')];
  if (!p) return [...header, '', 'PREDICTION EVIDENCE UNKNOWN (no Stage 3F.6 evaluation attached to this frame)'].join('\n');
  const a = p.aggregate ?? {};
  const body = [
    line('executed action', p.executedAction), line('decision -> outcome', `${p.decisionLogicalTime} -> ${show(p.outcomeLogicalTime)}`),
    '', 'WORLD STATE (reference baseline, not a Sentinel capability)',
    '  path                       predicted   actual      quality                attribution',
    ...p.worldStateErrors.map((entry, index) => `  ${entry.path.padEnd(26)} ${show(p.predictedNextState[index].value).slice(0, 10).padEnd(11)} ${show(p.actualNextState[index].value).slice(0, 10).padEnd(11)} ${String(entry.quality).padEnd(22)} ${entry.attribution ?? '-'}`),
    '', 'ONE-STEP CONSEQUENCE (decision-time, PRIVILEGED simulator lookahead)',
    ...p.oneStep.components.filter((entry) => entry.predicted !== 0 || entry.actual !== 0).map((entry) =>
      `  ${entry.component.padEnd(22)} ${entry.domain.padEnd(14)} predicted=${show(entry.predicted)} actual=${show(entry.actual)} ${entry.quality}`),
    `  scalar                 predicted=${show(p.oneStep.scalar.predicted)} actual=${show(p.oneStep.scalar.actual)} ${p.oneStep.scalar.quality}`,
    '', line('router confidence', p.confidence.routerScore === null ? 'UNKNOWN' : p.confidence.routerScore.toFixed(4)),
    line('reliability bin', p.reliabilityBin),
    line('predictor confidence', `${show(p.confidence.predictorEvidenceConfidence)} (${p.confidence.predictorEvidenceConfidenceSemantics})`),
    line('one-step confidence', p.confidence.oneStepConfidence),
    line('router abstained', show(p.abstention.routerAbstained)), line('recommendation abstained', show(p.abstention.recommendationAbstained)),
    line('baseline abstentions', p.abstention.baselineAbstentions), line('state novelty', p.novelty),
    line('calibration (one-step)', p.calibration.oneStepCondition), line('calibration (baseline)', p.calibration.baselineCondition),
    line('counterfactual', `${p.counterfactual.kind} scored=${p.counterfactual.predictedContentPresent ? 'ELIGIBLE' : 'UNRESOLVED_NO_PREDICTED_CONTENT'}`),
    line('domain coverage', `${p.domainCoverage.covered.length}/8 missing=${p.domainCoverage.missing.join(',') || 'none'}`),
    line('error attribution', p.errorAttribution.join(',')),
    '', 'CERTIFIED AGGREGATES (read from Stage 3F.6 artifact)',
    line('one-step exact', show(a.oneStepExactAccuracy)), line('high-confidence wrong 0.90', show(a.highConfidenceWrong090)),
    line('router coverage', show(a.coverage)), line('router ECE', show(a.ece)), line('prediction error p95', show(a.errorP95)),
    line('status', show(a.status)),
    '', line('producer offered', telemetryStats?.offered), line('dropped frames', telemetryStats?.dropped),
  ];
  return [...header, '', ...body].join('\n');
}

/** Read-only: exposes only views, snapshot, and render. No producer, adapter, runtime, or authority surface. */
export function createPredictionObservatory(producer) {
  if (!producer || typeof producer.snapshot !== 'function') throw new Error('telemetry producer snapshot required');
  // Legacy views go through the unmodified certified v1 observatory over the legacy (non-prediction) frames.
  const legacy = createReadOnlyAsciiObservatory({ snapshot: () => {
    const state = producer.snapshot(); return deepFreeze({ frames: state.frames.filter((frame) => !frame.prediction), stats: state.stats });
  } });
  return Object.freeze({
    contractId: PREDICTION_OBSERVATORY_CONTRACT.contractId,
    views: Object.values(PredictionObservatoryView),
    snapshot: () => producer.snapshot(),
    render: ({ view = PredictionObservatoryView.PREDICTION, index = -1, fullIds = false } = {}) => {
      if (!Object.values(PredictionObservatoryView).includes(view)) throw new Error(`unsupported observatory view: ${view}`);
      const state = producer.snapshot();
      if (view !== PredictionObservatoryView.PREDICTION) return legacy.render({ view, index, fullIds });
      const predictionFrames = state.frames.filter((frame) => frame.prediction);
      const frame = predictionFrames[index < 0 ? predictionFrames.length + index : index];
      return frame ? renderPredictionFrame(frame, { telemetryStats: state.stats }) : 'SENTINEL ASCII OBSERVATORY :: PREDICTION\nNO PREDICTION FRAME';
    },
  });
}
