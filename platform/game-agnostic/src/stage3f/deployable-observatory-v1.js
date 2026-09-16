import { deepFreeze, sha256 } from '../core/determinism.js';
import { PREDICTION_OBSERVATORY_CONTRACT, PredictionObservatoryView } from './prediction-observatory-v1.js';
import { DEPLOYABLE_FEATURE_CONTRACT_HASH, DEPLOYABLE_FEATURE_CONTRACT_ID, FeatureValueStatus } from './deployable-feature-contract-v1.js';

/* Stage 3F.6-S minimal Observatory addition: one read-only DEPLOYABLE view showing which
 * features a deployment-like configuration can actually compute. Presentation only — it is
 * never a decision input, and it adds no capability to the runtime. */

export const DeployableObservatoryView = deepFreeze({ ...PredictionObservatoryView, DEPLOYABLE: 'DEPLOYABLE' });

export const DEPLOYABLE_OBSERVATORY_CONTRACT = deepFreeze({
  contractId: 'SENTINEL_ASCII_OBSERVATORY_DEPLOYABLE_V1',
  schemaVersion: 1,
  extends: { contractId: PREDICTION_OBSERVATORY_CONTRACT.contractId, legacyViewsUnchanged: PREDICTION_OBSERVATORY_CONTRACT.views },
  views: Object.values(DeployableObservatoryView),
  readOnly: true,
  presentationOnly: true,
  decisionInput: false,
  governedEvidence: false,
  prohibitedCapabilities: PREDICTION_OBSERVATORY_CONTRACT.prohibitedCapabilities,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});

export const DEPLOYABLE_OBSERVATORY_CONTRACT_HASH = sha256(DEPLOYABLE_OBSERVATORY_CONTRACT);

const line = (label, value) => `${label.padEnd(26)} ${value ?? 'UNKNOWN'}`;
const MARK = deepFreeze({
  [FeatureValueStatus.AVAILABLE]: '+',
  [FeatureValueStatus.UNKNOWN]: '?',
  [FeatureValueStatus.UNAVAILABLE]: '-',
});

/** Renders one extraction result. Shows UNKNOWN and UNAVAILABLE explicitly; never prints a zero for missing evidence. */
export function renderDeployableFrame(result) {
  if (!result) return 'SENTINEL ASCII OBSERVATORY :: DEPLOYABLE\nNO DEPLOYABLE EXTRACTION';
  const capabilities = result.capabilities;
  return [
    'SENTINEL ASCII OBSERVATORY :: DEPLOYABLE',
    line('contract', DEPLOYABLE_FEATURE_CONTRACT_ID),
    line('contract hash', DEPLOYABLE_FEATURE_CONTRACT_HASH.slice(0, 16)),
    line('profile', result.profile),
    line('profile satisfied', String(result.profileSatisfied)),
    line('capabilities present', capabilities.availableCapabilities.join(',') || 'none'),
    line('capabilities missing', capabilities.missingCapabilities.join(',') || 'none'),
    line('authority', 'R0 / NON-DISPATCHING / INCUMBENT SOLE EXECUTOR'),
    '',
    line('features in profile', result.counts.inProfile),
    line('available', result.counts.available),
    line('unknown', result.counts.unknown),
    line('unavailable', result.counts.unavailable),
    line('dense vector', String(result.denseVector)),
    line('imputed', String(result.imputed)),
    '',
    'FEATURES (+ available  ? unknown  - unavailable)',
    ...result.profileFeatureIds.map((featureId) => {
      const entry = result.features[featureId];
      const shown = entry.status === FeatureValueStatus.AVAILABLE ? String(entry.value) : entry.status;
      return `  ${MARK[entry.status]} ${featureId.padEnd(46)} ${shown}`;
    }),
  ].join('\n');
}

/** Read-only: exposes views and render only. No producer, adapter, runtime, or authority surface. */
export function createDeployableObservatory(producer) {
  if (!producer || typeof producer.snapshot !== 'function') throw new Error('deployable observatory requires a snapshot producer');
  return Object.freeze({
    contractId: DEPLOYABLE_OBSERVATORY_CONTRACT.contractId,
    views: Object.values(DeployableObservatoryView),
    snapshot: () => producer.snapshot(),
    render: ({ index = -1 } = {}) => {
      const state = producer.snapshot();
      const results = state.results ?? [];
      const result = results[index < 0 ? results.length + index : index];
      return renderDeployableFrame(result ?? null);
    },
  });
}
