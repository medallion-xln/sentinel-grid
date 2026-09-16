import { deepFreeze, sha256 } from '../core/determinism.js';
import { DEPLOYABLE_OBSERVATORY_CONTRACT, DeployableObservatoryView } from './deployable-observatory-v1.js';

/* Stage 3F.6-C minimal Observatory addition: a shadow view of the CANDIDATE deployable router.
 *
 * Presentation only. The candidate never routes anything in the live runtime, and this view
 * adds no capability. Kept in its own file so the certified Stage 3F.6-S observatory source
 * hash stays byte-identical. */

export const CandidateRouterView = deepFreeze({ ...DeployableObservatoryView, CANDIDATE_ROUTER: 'CANDIDATE_ROUTER' });

export const CANDIDATE_ROUTER_OBSERVATORY_CONTRACT = deepFreeze({
  contractId: 'SENTINEL_ASCII_OBSERVATORY_CANDIDATE_ROUTER_V1',
  schemaVersion: 1,
  extends: { contractId: DEPLOYABLE_OBSERVATORY_CONTRACT.contractId, legacyViewsUnchanged: DEPLOYABLE_OBSERVATORY_CONTRACT.views },
  views: Object.values(CandidateRouterView),
  readOnly: true,
  presentationOnly: true,
  decisionInput: false,
  shadowOnly: true,
  replacesIncumbentRouter: false,
  promotedToLiveRuntime: false,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});

export const CANDIDATE_ROUTER_OBSERVATORY_CONTRACT_HASH = sha256(CANDIDATE_ROUTER_OBSERVATORY_CONTRACT);

const line = (label, value) => `${label.padEnd(26)} ${value ?? 'UNKNOWN'}`;

/**
 * Render one candidate decision. `route` is what the candidate WOULD advise; the incumbent
 * remains the sole executor, which the frame states rather than implies.
 */
export function renderCandidateRouterFrame(frame) {
  if (!frame) return 'SENTINEL ASCII OBSERVATORY :: CANDIDATE_ROUTER\nNO CANDIDATE DECISION';
  const routed = frame.score !== null && frame.score !== undefined && frame.score >= frame.threshold;
  return [
    'SENTINEL ASCII OBSERVATORY :: CANDIDATE_ROUTER',
    line('router profile', frame.profile ?? 'DEPLOYABLE_CORE'),
    line('candidate hash', frame.candidateHash ? frame.candidateHash.slice(0, 16) : 'UNKNOWN'),
    line('contract hash', frame.contractHash ? frame.contractHash.slice(0, 16) : 'UNKNOWN'),
    line('feature count', frame.featureCount),
    '',
    line('candidate score', frame.score === null || frame.score === undefined ? 'UNKNOWN' : frame.score.toFixed(6)),
    line('threshold', frame.threshold),
    line('candidate route', routed ? 'VOUCH_GREEDY' : 'DECLINE_TO_FALLBACK'),
    line('confidence semantics', 'MODEL_SCORE_NOT_CAUSAL_CERTAINTY'),
    line('profile satisfied', String(frame.profileSatisfied ?? 'UNKNOWN')),
    '',
    line('shadow only', 'true'),
    line('promoted to runtime', 'false'),
    line('authority', 'R0 / NON-DISPATCHING / INCUMBENT SOLE EXECUTOR'),
  ].join('\n');
}

/** Read-only: views and render only. No producer, adapter, runtime, or authority surface. */
export function createCandidateRouterObservatory(producer) {
  if (!producer || typeof producer.snapshot !== 'function') throw new Error('candidate router observatory requires a snapshot producer');
  return Object.freeze({
    contractId: CANDIDATE_ROUTER_OBSERVATORY_CONTRACT.contractId,
    views: Object.values(CandidateRouterView),
    snapshot: () => producer.snapshot(),
    render: ({ index = -1 } = {}) => {
      const state = producer.snapshot();
      const frames = state.candidateFrames ?? [];
      const frame = frames[index < 0 ? frames.length + index : index];
      return renderCandidateRouterFrame(frame ?? null);
    },
  });
}
