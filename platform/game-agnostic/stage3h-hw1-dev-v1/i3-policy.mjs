// H-W1 I-3 experimental policy runtime, STAGE3H_HW1_PUBLIC_POLICY / HW1_POLICY_V1. decide(view) is a deterministic map from the public view to exactly one legal native action (no abstention,
// no randomisation, no fallback to a comparator): projectPublic(view) -> actionFeatures -> fixed-order linear heads -> scalar score -> selectEquivariant (restricted to actions fixed by the view's symmetry,
// exact ties broken by the canonical-frame action signature, never by handle, menu position or alphabet). The evaluated decision is the keyV2 orbit of the chosen action (contract: residual duplicates).
// A model is plain JSON (weights, standardisation, score rule); nothing in it is learned from validation or holdout outcomes.
// Score rules (higher wins): NEG_NREG = -nreg; SAFE_FIRST = -(nreg + 1000 * [cat > tau]); RISK_WEIGHTED = -(nreg + kappa * cat). `cat` is a learned catastrophe-risk head, not an evaluator output.
//   makePolicy(model) -> { id, decide(view), decideProjection(P) }       decide returns { index, orbit, tied, fixedCount, scores, ms }
import { projectPublic, keysV2, selectEquivariant } from './public-projection.mjs';
import { actionFeatures, FEATURE_VERSION, NAMES } from './i3-features.mjs';

export const POLICY_FAMILY = 'STAGE3H_HW1_PUBLIC_POLICY', POLICY_VERSION = 'HW1_POLICY_V1';

/** Standardised linear head over the model's feature columns, summed in the fixed column order (integers in, so equal inputs give bit-equal outputs). */
const head = (h, mean, std, row) => { let s = h.b; for (let j = 0; j < h.w.length; j++) s += h.w[j] * ((row[h.cols[j]] - mean[h.cols[j]]) / std[h.cols[j]]); return s; };

export function validateModel(m) {
  if (m.policyFamily !== POLICY_FAMILY || m.policyVersion !== POLICY_VERSION || m.featureVersion !== FEATURE_VERSION) throw Error('MODEL_VERSION_MISMATCH');
  if (m.mean.length !== NAMES.length || m.std.length !== NAMES.length || m.std.some((s) => !(s > 0))) throw Error('MODEL_STANDARDISATION_INVALID');
  for (const h of Object.values(m.heads)) if (h.cols.length !== h.w.length || h.cols.some((c) => !(c >= 0 && c < NAMES.length)) || !Number.isFinite(h.b) || h.w.some((x) => !Number.isFinite(x))) throw Error('MODEL_HEAD_INVALID');
  const r = m.score.rule, ok = (r === 'NEG_NREG' && m.heads.nreg) || (r === 'SAFE_FIRST' && m.heads.nreg && m.heads.cat && Number.isFinite(m.score.tau)) || (r === 'RISK_WEIGHTED' && m.heads.nreg && m.heads.cat && Number.isFinite(m.score.kappa) && m.score.kappa >= 0);
  if (!ok) throw Error('MODEL_SCORE_RULE_INVALID');
  return m;
}

export function makePolicy(model) {
  validateModel(model);
  const scoreRow = (row) => {
    const nreg = head(model.heads.nreg, model.mean, model.std, row);
    if (model.score.rule === 'NEG_NREG') return -nreg;
    const cat = head(model.heads.cat, model.mean, model.std, row);
    return model.score.rule === 'SAFE_FIRST' ? -(nreg + 1000 * Number(cat > model.score.tau)) : -(nreg + model.score.kappa * cat);
  };
  const decideProjection = (P) => {
    const t0 = performance.now(), { rows } = actionFeatures(P), scores = rows.map(scoreRow), keys = keysV2(P), sel = selectEquivariant(P, (i) => scores[i]);
    if (!(sel.index >= 0 && sel.index < P.menu.length)) throw Error('POLICY_ILLEGAL_ACTION');
    return { index: sel.index, orbit: keys.map((k, i) => (k === keys[sel.index] ? i : -1)).filter((i) => i >= 0), tied: sel.tied, fixedCount: sel.fixedCount, scores, ms: performance.now() - t0 };
  };
  return { id: model.policyId, decideProjection, decide: (view) => decideProjection(projectPublic(view)) };
}
