// Prospective pure analysis. Accepts numeric rows only; never reads or creates game worlds.
import { createHash } from 'node:crypto';

export const SPEC = Object.freeze({
  id: 'STAGE3H_SELECTOR_ANALYSIS_V2', resamples: 20000, alpha: 0.05,
  primaryFamily: 40, secondaryFamily: 40, safetyFamily: 30, nuisanceFamily: 120,
  pointMateriality: 0.02, seed: 'STAGE3H_SELECTOR_ANALYSIS_V2',
});

function finite(x) { if (!Number.isFinite(x)) throw Error('NONFINITE_VALUE'); return x; }
function random(label) {
  let a = parseInt(createHash('sha256').update(label).digest('hex').slice(0, 8), 16) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function quantile(xs, p) {
  if (!xs.length || !Number.isFinite(p) || p < 0 || p > 1) throw Error('INVALID_QUANTILE');
  const a = xs.map(finite).sort((x, y) => x - y);
  return a[Math.max(0, Math.min(a.length - 1, Math.ceil(p * a.length) - 1))];
}
export function groupCells(rows) {
  const cells = new Map();
  for (const row of rows) {
    if (typeof row.cell !== 'string' || !row.cell) throw Error('CELL_REQUIRED');
    if (!cells.has(row.cell)) cells.set(row.cell, []);
    cells.get(row.cell).push(row);
  }
  if (!cells.size) throw Error('EMPTY_CELLS');
  return [...cells.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, r]) => r);
}
export function metric(row, name) {
  const { R, B, N } = row.metrics;
  switch (name) {
    case 'RB': return finite(R.nreg - B.nreg);
    case 'RN': return finite(R.nreg - N.nreg);
    case 'HIT_RB': return finite(R.hit - B.hit);
    case 'HIT_RN': return finite(R.hit - N.hit);
    case 'CAT_RB': return finite(R.cat - B.cat);
    case 'CAT_RN': return finite(R.cat - N.cat);
    case 'HARM_B': return Math.max(0, finite(R.nreg - B.nreg));
    case 'HARM_N': return Math.max(0, finite(R.nreg - N.nreg));
    case 'BEST_OF_GAP': return finite(R.nreg - Math.min(B.nreg, N.nreg));
    default: throw Error('UNKNOWN_METRIC');
  }
}
function member(row, s) { return (!s.band || row.band === s.band) && (!s.regime || row.regime === s.regime); }
export function estimate(cells, spec) {
  if (!cells.length || cells.some(c => !c.length)) throw Error('EMPTY_CELL');
  let numerator = 0, denominator = 0, squaredWeights = 0, n = 0;
  for (const cell of cells) for (const row of cell) if (member(row, spec)) {
    const w = 1 / (cells.length * cell.length);
    numerator += w * metric(row, spec.metric);
    denominator += w; squaredWeights += w * w; n++;
  }
  return denominator === 0 ? { status: 'UNDEFINED_SUBGROUP', mean: null, n: 0 } : {
    status: 'DEFINED', mean: numerator / denominator, coverage: denominator,
    effectiveN: denominator * denominator / squaredWeights, n,
  };
}
export function primarySpecs() {
  return [
    { key: 'A_H0_SPECIALIST', metric: 'RB', band: 'H0' },
    { key: 'B_H2_AVOIDANCE', metric: 'RN', band: 'H2' },
    { key: 'C_FULL_VS_B', metric: 'RB' },
    { key: 'D_FULL_VS_N', metric: 'RN' },
  ];
}
export function bootstrap(cells, specs, { resamples = SPEC.resamples, label = SPEC.seed, family = SPEC.primaryFamily } = {}) {
  if (!Number.isInteger(resamples) || resamples < 1000 || !Number.isInteger(family) || family < 1) throw Error('INVALID_BOOTSTRAP_SPEC');
  if (new Set(specs.map(s => s.key)).size !== specs.length) throw Error('DUPLICATE_ESTIMAND_KEY');
  const point = specs.map(s => estimate(cells, s));
  const draws = specs.map(() => []), undefinedDraw = specs.map(() => false);
  const r = random(label + ':' + cells.map(c => c.length).join(','));
  for (let b = 0; b < resamples; b++) {
    const sampled = cells.map(c => Array.from({ length: c.length }, () => c[Math.floor(r() * c.length)]));
    specs.forEach((s, i) => {
      const e = estimate(sampled, s);
      if (e.mean === null) undefinedDraw[i] = true; else draws[i].push(e.mean);
    });
  }
  return Object.fromEntries(specs.map((s, i) => {
    if (point[i].mean === null || undefinedDraw[i]) return [s.key, { ...point[i], inference: 'UNAVAILABLE_UNDEFINED_SUBGROUP_DRAW', resamplesRequested: resamples, invalidDrawsNotDropped: true }];
    return [s.key, {
      ...point[i], inference: 'PERCENTILE_DESIGN_ONLY', resamples, family,
      ci95: [quantile(draws[i], 0.025), quantile(draws[i], 0.975)],
      lower: quantile(draws[i], SPEC.alpha / family), upper: quantile(draws[i], 1 - SPEC.alpha / family),
      approximateCenteredLowerP: (1 + draws[i].filter(x => x - point[i].mean <= point[i].mean).length) / (resamples + 1),
      pValueRole: 'DIAGNOSTIC_NOT_GATE',
    }];
  }));
}
export function superiority(e) { return e.inference === 'PERCENTILE_DESIGN_ONLY' && e.mean <= -SPEC.pointMateriality && e.upper < 0; }
export function equalityCheck(rows, band, left, right) {
  const relevant = rows.filter(r => r.band === band);
  if (!relevant.length) return { status: 'UNMEASURED', count: 0 };
  const key = ids => JSON.stringify([...ids].sort());
  const pass = relevant.every(r => key(r.selections[left]) === key(r.selections[right]) && ['regret', 'nreg', 'hit', 'cat'].every(k => r.metrics[left][k] === r.metrics[right][k]));
  return { status: pass ? 'EXACT_IDENTITY_PASS' : 'INVALID_SELECTOR_IDENTITY', count: relevant.length };
}
export function zeroIntroductionUpper(counts, family = SPEC.primaryFamily) {
  if (!counts.length || counts.some(n => !Number.isInteger(n) || n <= 0)) throw Error('INVALID_COUNTS');
  return 1 - Math.pow(SPEC.alpha / family, 1 / (counts.length * Math.min(...counts)));
}
