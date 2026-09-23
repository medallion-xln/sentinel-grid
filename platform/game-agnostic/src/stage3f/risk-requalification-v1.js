import { deepFreeze } from '../core/determinism.js';
import { RISK_STATE_FIELDS, RiskFieldStatus } from './decision-risk-state-v1.js';
import { aurocOf } from './router-value-v1.js';
import { quantile } from './policy-requalification-v1.js';

/* ===========================================================================
 * STAGE_3F_6_W_SYM — risk-state requalification primitives.
 *
 * Compact risk vectors, the predeclared feature-validity classification, paired AUROC increments, correlation
 * helpers for the observability check and the predeclared risk classification. Deterministic; reads nothing on its
 * own. The Stage 3F.6-W risk contract and extractor are reused unchanged.
 * ========================================================================= */

export const RISK_FIELD_IDS = deepFreeze(RISK_STATE_FIELDS.map((f) => f.fieldId));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

/** `{ fieldId: value }` with null for any status other than AVAILABLE, plus the status of each field. */
export function compactRisk(riskState) {
  const value = {}; const status = {};
  for (const id of RISK_FIELD_IDS) {
    const f = riskState.fields[id];
    value[id] = f.status === RiskFieldStatus.AVAILABLE ? f.value : null; status[id] = f.status;
  }
  return { value, status };
}

/* ------------------------------------------------------------ feature validity */

export const W_FEATURE_CLASS_PRECEDENCE = deepFreeze(['NON_DEPLOYABLE', 'ORACLE_ONLY', 'ROLLOUT_REQUIRED', 'FUTURE_STATE_REQUIRED', 'LEAKED', 'UNAVAILABLE',
  'DIVERGENT', 'SHORTCUT_CORRELATED', 'REDUNDANT']);

/** First failing class in the predeclared precedence; DEPLOYABLE when none fails. Every failing class is listed. */
export function classifyWField(flags) {
  const failing = W_FEATURE_CLASS_PRECEDENCE.filter((k) => flags[k] === true);
  return { class: failing[0] ?? 'DEPLOYABLE', failing };
}

/** Contract-level flags of a historical risk field (the contract is read, never edited). */
export function contractFlags(fieldId) {
  const f = RISK_STATE_FIELDS.find((x) => x.fieldId === fieldId);
  if (!f) return null;
  return { NON_DEPLOYABLE: f.decisionTimeOnly !== true || f.usesSplitMetadata === true, ORACLE_ONLY: f.usesRegret === true || f.usesOptimalPolicyLabel === true,
    ROLLOUT_REQUIRED: f.usesRollout === true, FUTURE_STATE_REQUIRED: f.usesFutureOutcome === true || f.usesTransition === true };
}

/* ------------------------------------------------------------ increments */

/**
 * Paired AUROC difference B - A over the same rows. Each resample draws whole rows with the shared plan indices, so
 * both scorers see identical resamples. Resamples with a single class are skipped.
 */
export function pairedAurocDelta(scoresA, scoresB, labels, plan) {
  const n = labels.length;
  if (plan.n !== n) throw new Error('bootstrap plan size mismatch');
  const a = aurocOf(scoresA, labels); const b = aurocOf(scoresB, labels);
  const deltas = [];
  const sa = new Array(n); const sb = new Array(n); const ly = new Array(n);
  for (let r = 0; r < plan.resamples; r += 1) {
    const base = r * n;
    for (let i = 0; i < n; i += 1) { const j = plan.indices[base + i]; sa[i] = scoresA[j]; sb[i] = scoresB[j]; ly[i] = labels[j]; }
    const x = aurocOf(sa, ly); const y = aurocOf(sb, ly);
    if (x !== null && y !== null) deltas.push(y - x);
  }
  deltas.sort((p, q) => p - q);
  const delta = a === null || b === null ? null : b - a;
  const ci95 = deltas.length ? [quantile(deltas, 0.025), quantile(deltas, 0.975)] : null;
  return { n, positives: labels.filter((y) => y === 1).length, aurocA: a, aurocB: b, delta, ci95, resamples: deltas.length };
}

/** The historical W bar: material = delta >= 0.02 with CI lower > 0; significant = CI lower > 0. */
export function incrementVerdict(d, { minDelta = 0.02 } = {}) {
  const significant = d !== null && d.ci95 !== null && d.ci95[0] > 0;
  return { significant, material: significant && d.delta >= minDelta };
}

/* ------------------------------------------------------------ observability */

export function pearson(x, y) {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => typeof a === 'number' && typeof b === 'number');
  if (pairs.length < 3) return null;
  const mx = mean(pairs.map((p) => p[0])); const my = mean(pairs.map((p) => p[1]));
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [a, b] of pairs) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Correlation ratio (eta) of a numeric value over a categorical factor; 0 = no dependence, 1 = fully determined. */
export function eta(categories, values) {
  const pairs = categories.map((c, i) => [c, values[i]]).filter(([, v]) => typeof v === 'number');
  if (pairs.length < 3) return null;
  const m = mean(pairs.map((p) => p[1]));
  const groups = new Map();
  for (const [c, v] of pairs) { const g = groups.get(c) ?? []; g.push(v); groups.set(c, g); }
  let between = 0; let total = 0;
  for (const g of groups.values()) between += g.length * (mean(g) - m) ** 2;
  for (const [, v] of pairs) total += (v - m) ** 2;
  return total > 0 ? Math.sqrt(between / total) : null;
}

/* ------------------------------------------------------------ classification */

export const RISK_PRIMARY_PRECEDENCE = deepFreeze(['INSUFFICIENT_EVIDENCE', 'GENUINE_RISK_SIGNAL', 'RISK_SIGNAL_WEAK', 'RISK_SIGNAL_REDUNDANT',
  'RISK_SIGNAL_SHORTCUT_CORRELATED', 'RISK_SIGNAL_ABSENT']);
export const RISK_SECONDARY_LABELS = deepFreeze(['RISK_SIGNAL_NOT_ROUTABLE', 'ROUTER_VALUE_NOT_MATERIAL', 'OOD_UNSTABLE', 'PROXY_OF_HIDDEN_GEOMETRY']);

/** Predeclared risk classification. Inputs are FRESH_HOLDOUT / FRESH_OOD quantities computed by the certifier. */
export function riskClassification(e) {
  const holds = {
    INSUFFICIENT_EVIDENCE: e.insufficient,
    GENUINE_RISK_SIGNAL: e.genuine,
    RISK_SIGNAL_SHORTCUT_CORRELATED: e.shortcutCorrelated,
    RISK_SIGNAL_WEAK: e.weak,
    RISK_SIGNAL_REDUNDANT: e.redundant,
    RISK_SIGNAL_NOT_ROUTABLE: e.notRoutable,
    ROUTER_VALUE_NOT_MATERIAL: e.routerValueNotMaterial,
    OOD_UNSTABLE: e.oodUnstable,
    PROXY_OF_HIDDEN_GEOMETRY: e.proxy,
  };
  const signal = RISK_PRIMARY_PRECEDENCE.slice(0, -1).some((k) => holds[k] && k !== 'INSUFFICIENT_EVIDENCE');
  holds.RISK_SIGNAL_ABSENT = !holds.INSUFFICIENT_EVIDENCE && !signal;
  const primary = RISK_PRIMARY_PRECEDENCE.find((k) => holds[k]);
  const labels = [...RISK_PRIMARY_PRECEDENCE, ...RISK_SECONDARY_LABELS].filter((k) => holds[k]);
  return { primary, labels, holds };
}
