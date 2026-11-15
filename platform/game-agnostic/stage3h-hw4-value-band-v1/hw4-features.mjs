// H-W4 Phase 4 feature contract: ONE prespecified feature builder per arm, identical except for the value-band terms.
// V1 arm  = the frozen H-W1 I-3 public-only features, byte-identical (imported, not copied; source-hashed by the gates).
// V2 arm  = the same rows with exactly 8 appended band one-hots (target/dependent x V0/V1/V2/P). No other difference.
// Every band feature is a function of the DEV V2 contract's ordinal alone: identity-free, menu-order-free, D4-invariant
// (the band is an intrinsic node attribute), and absent for non-structural nodes (all-zero row, fail-closed 'X' never encoded).
import { NAMES, actionFeatures as v1ActionFeatures, FEATURE_SETS } from '../stage3h-hw1-dev-v1/i3-features.mjs';

export const FEATURE_VERSION_V1 = 'HW4_V1_PUBLIC_ONLY_DEV_V1';
export const FEATURE_VERSION_V2 = 'HW4_V2_PUBLIC_PLUS_VALUE_BAND_DEV_V1';
export const BAND_NAMES = ['target.band.V0', 'target.band.V1', 'target.band.V2', 'target.band.P', 'dependent.band.V0', 'dependent.band.V1', 'dependent.band.V2', 'dependent.band.P'];
export const V2_EXTRA = BAND_NAMES.length;

const oneHot = (b) => (b === 0 ? [1, 0, 0, 0] : b === 1 ? [0, 1, 0, 0] : b === 2 ? [0, 0, 1, 0] : b === 'P' ? [0, 0, 0, 1] : [0, 0, 0, 0]);

/** V2 arm features: identical V1 rows + the 8 band one-hots. Throws if a banded projection is missing .band (fail closed). */
export function actionFeaturesV2(P) {
  const base = v1ActionFeatures(P);
  const rows = P.menu.map((a, i) => {
    if (P.nodes[a.target ?? 0] && a.target != null && P.nodes[a.target].band === undefined) throw Error('V2_BAND_MISSING_ON_TARGET');
    if (a.dependent != null && P.nodes[a.dependent].band === undefined) throw Error('V2_BAND_MISSING_ON_DEPENDENT');
    const t = a.target == null ? [0, 0, 0, 0] : oneHot(P.nodes[a.target].band), d = a.dependent == null ? [0, 0, 0, 0] : oneHot(P.nodes[a.dependent].band);
    return [...base.rows[i], ...t, ...d];
  });
  return { names: [...NAMES, ...BAND_NAMES], rows };
}
/** V1 arm features: the frozen I-3 rows unchanged. */
export function actionFeaturesV1(P) { return v1ActionFeatures(P); }
export { NAMES, FEATURE_SETS };
