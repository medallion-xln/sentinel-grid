// DEV-only selector definitions over this lane's stored public decision-time fields. A selector reads ONLY
// band, regime, the S0 tie set and per-action S0 scores/descriptors, and the Nexus output (abstention, reason, pick,
// preferred-type class). It never reads r.u (evaluator truth) or r.m. Each returns menu indices.
// view = 'orig' or 'twin': the twin Nexus pick is the O-2R.1 IDENTITY twin's pick mapped back, reconstructed by the
// mechanism verified per row in run-dev.mjs (lexically smallest opaque handle `opaque-(n-i)` in the preferred-type class).
export const o2rHandle = (r, i) => `opaque-${r.menuSize - i}`;
export function nexusPick(r, view = 'orig') {
  if (r.nexus.abstain) return null;
  if (view === 'orig') return r.nexus.pick;
  return r.nexus.tieClass.reduce((b, i) => (b === null || o2rHandle(r, i) < o2rHandle(r, b) ? i : b), null);
}
const S0 = (r) => r.sel.B;
const NX = (r, v) => { const p = nexusPick(r, v); return p === null ? r.sel.B : [p]; };
/** Identity-free Nexus: within Nexus's preferred action type, the S0-argmax set (ties kept); S0 when Nexus abstains. */
export const typeThenS0 = (r) => { if (r.nexus.abstain) return r.sel.B; const c = r.nexus.tieClass, s = c.map((i) => r.pub.actions[i].s), m = Math.max(...s); return c.filter((_, k) => s[k] === m); };
const threat = (r) => r.nexus.reason === 'THREAT_DRIVEN_PREFERENCE';

export const SELECTORS = {
  FROZEN_H0_NEXUS_H2_S0: (r, v) => (r.band === 'H0' ? NX(r, v) : S0(r)),
  S0_ONLY: (r) => S0(r),
  NEXUS_ELSE_S0: (r, v) => NX(r, v),
  TYPE_THEN_S0_H0: (r) => (r.band === 'H0' ? typeThenS0(r) : S0(r)),
  TYPE_SET_H0: (r) => (r.band === 'H0' ? (r.nexus.abstain ? S0(r) : r.nexus.tieClass) : S0(r)),
  THREAT_GATED_H0: (r, v) => (r.band === 'H0' && threat(r) ? NX(r, v) : S0(r)),
  TYPE_THEN_S0_THREAT_GATED_H0: (r) => (r.band === 'H0' && threat(r) ? typeThenS0(r) : S0(r)),
};
/** Selectors whose decision cannot depend on action handles (given row-verified S0-score and Nexus-code invariance). */
export const HANDLE_FREE = new Set(['S0_ONLY', 'TYPE_THEN_S0_H0', 'TYPE_SET_H0', 'TYPE_THEN_S0_THREAT_GATED_H0']);

/** Truth-side scoring identical to frozen metrics.mjs#score / runner-design potentialIntroduction (evaluator only). */
export function scoreIdx(r, idx) {
  const max = Math.max(...r.u), spread = max - Math.min(...r.u), reg = idx.map((i) => max - r.u[i]);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { nreg: mean(reg.map((x) => (spread ? x / spread : 0))), regret: mean(reg), hit: mean(reg.map((x) => Number(x === 0))), cat: mean(reg.map((x) => Number(x >= 100))) };
}
export function introduction(r, cand, base) {
  if (JSON.stringify([...cand].sort()) === JSON.stringify([...base].sort())) return false;
  const max = Math.max(...r.u);
  return cand.some((i) => max - r.u[i] >= 100) && base.some((i) => max - r.u[i] < 100);
}
