import { deepFreeze, sha256 } from '../core/determinism.js';

export const STAGE2H2_QUALITY_GATE = deepFreeze({
  gateVersion: 1,
  registeredBeforeEvaluation: true,
  maximumCombinedHarmfulSelectionChangeRate: 0.05,
  maximumNoSignalRegressionRate: 0.01,
  maximumStrongPrimePreferenceHarmRate: 0.01,
  positiveValueRequirement: 'COMBINED_ACCURACY_DELTA_GT_ZERO_OR_TARGET_SIGNAL_REGIME_POSITIVE_VALUE',
});

export const STAGE2H2_QUALITY_GATE_DIGEST = sha256(STAGE2H2_QUALITY_GATE);
