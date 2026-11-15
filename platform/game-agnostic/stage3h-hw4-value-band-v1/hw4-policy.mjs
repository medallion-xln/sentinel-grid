// H-W4 Phase 6 inference runtime, STAGE3H_HW4_PUBLIC_POLICY / HW4_POLICY_V1. Adapted from the frozen H-W1 i3-policy.mjs
// with exactly ONE prespecified difference: the feature builder is per-arm (V1 = frozen I-3 rows; V2 = same rows + the
// 8 value-band one-hots). Scoring, standardisation, orbit keys (keysV2 of the UNBANDED projection — the band never enters
// action identity), symmetry fixing, canonical-frame tie-breaking, legality and timing are byte-identical between arms.
// A model is plain JSON; nothing in it is learned from validation or holdout outcomes.
import { projectPublic, keysV2, selectEquivariant } from '../stage3h-hw1-dev-v1/public-projection.mjs';
import { withValueBands } from './hw4-contract-v2.mjs';
import { actionFeaturesV1, actionFeaturesV2, NAMES, BAND_NAMES } from './hw4-features.mjs';
import { FEATURE_VERSION_V1, FEATURE_VERSION_V2 } from './hw4-features.mjs';

export const POLICY_FAMILY = 'STAGE3H_HW4_PUBLIC_POLICY', POLICY_VERSION = 'HW4_POLICY_V1';
export const ARM_FEATURES = Object.freeze({
  V1_PUBLIC_ONLY: { featureVersion: FEATURE_VERSION_V1, names: NAMES, build: actionFeaturesV1 },
  V2_PUBLIC_PLUS_VALUE_BAND: { featureVersion: FEATURE_VERSION_V2, names: [...NAMES, ...BAND_NAMES], build: actionFeaturesV2 },
});

const head = (h, mean, std, row) => { let s = h.b; for (let j = 0; j < h.w.length; j++) s += h.w[j] * ((row[h.cols[j]] - mean[h.cols[j]]) / std[h.cols[j]]); return s; };

export function validateModel(m) {
  const arm = ARM_FEATURES[m.arm];
  if (!arm) throw Error('MODEL_ARM_INVALID');
  if (m.policyFamily !== POLICY_FAMILY || m.policyVersion !== POLICY_VERSION || m.featureVersion !== arm.featureVersion) throw Error('MODEL_VERSION_MISMATCH');
  if (m.mean.length !== arm.names.length || m.std.length !== arm.names.length || m.std.some((s) => !(s > 0))) throw Error('MODEL_STANDARDISATION_INVALID');
  for (const h of Object.values(m.heads)) if (h.cols.length !== h.w.length || h.cols.some((c) => !(c >= 0 && c < arm.names.length)) || !Number.isFinite(h.b) || h.w.some((x) => !Number.isFinite(x))) throw Error('MODEL_HEAD_INVALID');
  const r = m.score.rule, ok = (r === 'NEG_NREG' && m.heads.nreg) || (r === 'SAFE_FIRST' && m.heads.nreg && m.heads.cat && Number.isFinite(m.score.tau)) || (r === 'RISK_WEIGHTED' && m.heads.nreg && m.heads.cat && Number.isFinite(m.score.kappa) && m.score.kappa >= 0);
  if (!ok) throw Error('MODEL_SCORE_RULE_INVALID');
  return m;
}

export function makePolicy(model) {
  validateModel(model);
  const arm = ARM_FEATURES[model.arm];
  const scoreRow = (row) => {
    const nreg = head(model.heads.nreg, model.mean, model.std, row);
    if (model.score.rule === 'NEG_NREG') return -nreg;
    const cat = head(model.heads.cat, model.mean, model.std, row);
    return model.score.rule === 'SAFE_FIRST' ? -(nreg + 1000 * Number(cat > model.score.tau)) : -(nreg + model.score.kappa * cat);
  };
  const decideProjection = (P) => {
    const t0 = performance.now(), { rows } = arm.build(P), scores = rows.map(scoreRow), keys = keysV2(P), sel = selectEquivariant(P, (i) => scores[i]);
    if (!(sel.index >= 0 && sel.index < P.menu.length)) throw Error('POLICY_ILLEGAL_ACTION');
    return { index: sel.index, orbit: keys.map((k, i) => (k === keys[sel.index] ? i : -1)).filter((i) => i >= 0), tied: sel.tied, fixedCount: sel.fixedCount, scores, ms: performance.now() - t0 };
  };
  return { id: model.policyId, arm: model.arm, decideProjection, decide: (view) => decideProjection(projectPublic(view)),
    // audit entry point: V1 decides on the bare public projection; V2 closes over the DEV band adapter (world used ONLY by the fail-closed value-band adapter)
    decideArm: model.arm === 'V2_PUBLIC_PLUS_VALUE_BAND'
      ? (view, world, spread) => decideProjection(withValueBands(projectPublic(view), world, spread))
      : (view) => decideProjection(projectPublic(view)) };
}
