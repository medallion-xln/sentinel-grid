// Phase 5 feasibility (DEV, held-out FRESH_CHECK only). Usage: node phase5-feasibility.mjs
// Question: if the IDENTITY defect is removed at its source - the Nexus tie-break, in the selector AND in the Nexus
// comparator arm - which registered-style criteria still fail? This re-specifies the comparator (a different claim);
// it is a feasibility probe, not a proposal and not a registration. Variants:
//   JOINT_TYPE_SET:     N' = whole preferred-type class (uniform) else S0;   R = H0 -> N', H2 -> S0
//   JOINT_TYPE_THEN_S0: N' = S0-argmax within preferred type else S0;        R = H0 -> N', H2 -> S0
// Comparators: B = S0, N = N'. Every arm is handle-free, so IDENTITY dependence is exactly 0 given the per-row verified
// S0-score, Nexus-code and abstention invariance (asserted). Registered estimator code; descriptive DEV evidence only.
import { resolve } from 'node:path';
import { bootstrap, groupCells, superiority, zeroIntroductionUpper } from '../stage3h-activation-readiness-v2/analysis.mjs';
import { LANE, ok, writeExclusive } from './lib.mjs';
import { loadRows } from './h2-mechanism.mjs';
import { scoreIdx, introduction, typeThenS0 } from './candidates.mjs';

const PRIMARIES = [{ key: 'A_H0_SPECIALIST', metric: 'RB', band: 'H0' }, { key: 'B_H2_AVOIDANCE', metric: 'RN', band: 'H2' }, { key: 'C_FULL_VS_B', metric: 'RB' }, { key: 'D_FULL_VS_N', metric: 'RN' }];
const SAFETY = ['HARM_B', 'HARM_N', 'BEST_OF_GAP'].map((key) => ({ key, metric: key }));
const NPRIME = { JOINT_TYPE_SET: (r) => (r.nexus.abstain ? r.sel.B : r.nexus.tieClass), JOINT_TYPE_THEN_S0: (r) => typeThenS0(r) };
const rows = loadRows('FRESH_CHECK').filter((r) => !r.rejected);
ok(rows.every((r) => r.identity.s0ScoresEqual && r.identity.nexusCodesEqual && r.identity.nexusClass !== 'ABSTENTION_CHANGED'), 'INVARIANCE_PRECONDITION');
const out = { schema: 'STAGE3H_FAILURE_DIAGNOSIS_PHASE5_FEASIBILITY_V1', set: 'FRESH_CHECK', authority: 'R0', note: 'comparator re-specified; feasibility only', variants: {} };
for (const [name, np] of Object.entries(NPRIME)) {
  const panels = {};
  for (const pop of [...new Set(rows.map((r) => r.population))]) {
    const cr = rows.filter((r) => r.population === pop).map((r) => {
      const N = np(r), R = r.band === 'H0' ? N : r.sel.B;
      return { id: r.idx, cell: r.cell, band: r.band, regime: r.regime, metrics: { R: scoreIdx(r, R), B: scoreIdx(r, r.sel.B), N: scoreIdx(r, N) }, introB: introduction(r, R, r.sel.B), introN: introduction(r, R, N) };
    });
    const cells = groupCells(cr), prim = bootstrap(cells, PRIMARIES, { family: 40 }), safety = bootstrap(cells, SAFETY, { family: 30 });
    const intro = (k) => { const n = cr.filter((r) => r[k]).length; return { introductions: n, zeroUpper: n ? null : zeroIntroductionUpper(cells.map((c) => c.length), 40) }; };
    panels[pop] = { primaries: Object.fromEntries(Object.entries(prim).map(([k, e]) => [k, { mean: e.mean, upper: e.upper, materialBenefit: superiority(e) }])),
      safety: Object.fromEntries(Object.entries(safety).map(([k, e]) => [k, { mean: e.mean, upper: e.upper, pass: e.upper <= 0.02 }])), introB: intro('introB'), introN: intro('introN'), identityDependence: 0 };
  }
  const ps = Object.values(panels), all = (f) => ps.filter(f).length;
  out.variants[name] = { panels, summary: { allPrimariesMaterial: all((p) => Object.values(p.primaries).every((e) => e.materialBenefit)), HARM_B: all((p) => p.safety.HARM_B.pass), HARM_N: all((p) => p.safety.HARM_N.pass), BEST_OF_GAP: all((p) => p.safety.BEST_OF_GAP.pass),
    zeroIntroB: all((p) => p.introB.introductions === 0), zeroIntroN: all((p) => p.introN.introductions === 0), introN: ps.reduce((a, p) => a + p.introN.introductions, 0), introB: ps.reduce((a, p) => a + p.introB.introductions, 0), identityPass: 'ALL (dependence identically 0)' } };
}
writeExclusive(resolve(LANE, 'evidence/phase5-feasibility.json'), out);
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.variants).map(([k, v]) => [k, { summary: v.summary, bestOf: Object.fromEntries(Object.entries(v.panels).map(([p, x]) => [p, +x.safety.BEST_OF_GAP.upper.toFixed(4)])) }])), null, 1));
