// Component B — Action Risk Estimation (bounded, uncertainty-aware, public information only).
// Estimator: a bagged ensemble of shallow boosted regression trees per head.
//   risk head   -> probability that the action is catastrophic in at least one world consistent with the public state
//   regret head -> expected normalised decision regret
// Uncertainty: spread of the bag predictions (each bag is fit on a bootstrap of origin families).
// Every estimate carries one explicit status. A predicted risk is an EMPIRICAL ESTIMATE, never a guarantee:
//   ESTIMATED                     supported by the model
//   UNSUPPORTED_NO_MODEL          no risk model for this observation contract / feature schema
//   UNSUPPORTED_MISSING_INFORMATION   a required public feature is missing or non-finite
//   UNSUPPORTED_NOVEL_CATEGORY    a categorical feature value never seen in development data
//   UNSUPPORTED_EVIDENCE          the model requires advisory evidence and it is absent or invalid
// Numeric features outside the development envelope do not void the estimate; they are counted and inflate the bound.
import { REASON } from './contract.mjs';

export function treeValue(tree, row) { let n = 0; while (tree.f[n] >= 0) n = row[tree.f[n]] <= tree.t[n] ? tree.l[n] : tree.r[n]; return tree.v[n]; }
export function bagScore(bag, row) { let s = bag.base; for (const t of bag.trees) s += treeValue(t, row); return s; }
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
export function headPredict(head, row) {
  const p = head.bags.map((b) => { const s = bagScore(b, row); return head.link === 'logit' ? sigmoid(s) : s; });
  const mean = p.reduce((a, b) => a + b, 0) / p.length, sd = Math.sqrt(p.reduce((a, b) => a + (b - mean) * (b - mean), 0) / p.length);
  return { mean, sd, min: Math.min(...p), max: Math.max(...p), bags: p.length };
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const calibrated = (cal, p) => { if (!cal?.bins?.length) return null; const b = cal.bins.find((x) => p >= x.lo && p < x.hi) ?? cal.bins[cal.bins.length - 1]; return { observedRate: b.rate, n: b.n, lo: b.lo, hi: b.hi }; };

/** Does this model apply to the adapter's feature schema? */
export function modelApplies(model, featurized, observationContract) {
  if (!model) return { ok: false, why: 'NO_MODEL' };
  if (model.observationContract.id !== observationContract.id || model.observationContract.version !== observationContract.version) return { ok: false, why: 'OBSERVATION_CONTRACT_MISMATCH' };
  if (model.schema.id !== featurized.schema.id || model.schema.names.length !== featurized.schema.names.length || model.schema.names.some((n, i) => n !== featurized.schema.names[i])) return { ok: false, why: 'FEATURE_SCHEMA_MISMATCH' };
  return { ok: true };
}

/** One assessment per menu action, in menu order. cfg = model.ranking (z, oodPenalty). */
export function assessRisk(model, featurized, observationContract) {
  const applies = modelApplies(model, featurized, observationContract), ev = featurized.evidence ?? { status: 'ABSENT', issues: [] };
  const evidenceBlocked = applies.ok && model.ranking.requireEvidence === true && ev.status !== 'VALID' && ev.status !== 'PARTIAL';
  return featurized.rows.map((row, i) => {
    const unsupported = (status, reason, detail) => ({ index: i, status, supported: false, reasons: [reason], detail: detail ?? null, risk: null, regret: null, upper: 1, oodCount: 0, oodFeatures: [] });
    if (!applies.ok) return unsupported('UNSUPPORTED_NO_MODEL', REASON.RISK_UNSUPPORTED_NO_MODEL, applies.why);
    if (evidenceBlocked) return unsupported('UNSUPPORTED_EVIDENCE', ev.status === 'ABSENT' ? REASON.EVIDENCE_ABSENT : REASON.EVIDENCE_INVALID, ev.issues.join(';') || null);
    const missing = []; for (let j = 0; j < row.length; j++) if (row[j] === null || row[j] === undefined || !Number.isFinite(row[j])) missing.push(model.schema.names[j]);
    if (row.length !== model.schema.names.length || missing.length) return unsupported('UNSUPPORTED_MISSING_INFORMATION', REASON.RISK_UNSUPPORTED_MISSING_INFORMATION, missing.slice(0, 8).join(','));
    const novel = model.novelty.columns.filter((c, k) => model.novelty.seen[k] === 0 && row[c] !== 0).map((c) => model.schema.names[c]);
    if (novel.length) return unsupported('UNSUPPORTED_NOVEL_CATEGORY', REASON.RISK_UNSUPPORTED_NOVEL_CATEGORY, novel.slice(0, 8).join(','));
    const ood = []; for (let j = 0; j < row.length; j++) if (row[j] < model.envelope.min[j] || row[j] > model.envelope.max[j]) ood.push(model.schema.names[j]);
    const risk = headPredict(model.heads.risk, row), regret = headPredict(model.heads.regret, row);
    const upper = clamp01(risk.mean + model.ranking.z * risk.sd + model.ranking.oodPenalty * ood.length);
    return { index: i, status: 'ESTIMATED', supported: true, reasons: [REASON.RISK_ESTIMATED, ...(ood.length ? [REASON.RISK_OUT_OF_DISTRIBUTION_NUMERIC] : [])], detail: null,
      risk: { estimate: risk.mean, spread: risk.sd, bagMin: risk.min, bagMax: risk.max, bags: risk.bags, upperBound: upper, calibration: calibrated(model.calibration, risk.mean), kind: 'EMPIRICAL_ESTIMATE' },
      regret: { estimate: regret.mean, spread: regret.sd }, upper, oodCount: ood.length, oodFeatures: ood.slice(0, 8) };
  });
}
