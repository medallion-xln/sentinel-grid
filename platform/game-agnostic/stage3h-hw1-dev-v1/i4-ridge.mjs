// H-W1 I-4 ridge machinery (no dependencies). Features are standardised with training-fold statistics; a fit is the closed-form ridge solution (Cholesky) of
//   (Zc' Zc + lambda * n * I) w = Zc' yc          Zc, yc = centred on the training rows (or on their class means for the within-class ranking fit).
// A Gram cache lets every lambda / label / head share one pass over the rows of a (fold, feature set, centring) combination.
//   standardise(rows, cols)               -> { mean, std } over the full feature width (std 1 where a column is constant)
//   gramOf(Z, y, cls, idx, cols, within)  -> Gram state for the rows `idx`; within = subtract the class mean of every column and label first
//   fitFromGram(g, labelKey, lambda)      -> { cols, w, b }

export function standardise(rows, width) {
  const n = rows.length, mean = new Array(width).fill(0), std = new Array(width).fill(0);
  for (const r of rows) for (let j = 0; j < width; j++) mean[j] += r[j] / n;
  for (const r of rows) for (let j = 0; j < width; j++) std[j] += (r[j] - mean[j]) ** 2 / n;
  return { mean, std: std.map((v) => (v > 1e-18 ? Math.sqrt(v) : 1)) };
}

function cholesky(A) {
  const n = A.length, L = A.map((r) => r.map(() => 0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (!(s > 0)) throw Error('RIDGE_NOT_POSITIVE_DEFINITE'); L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
  }
  return L;
}
function solve(L, b) {
  const n = L.length, y = new Array(n).fill(0), x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

/** Z: standardised rows (arrays), labels: { key: Float64Array|Array aligned with Z }, cls: class index per row, idx: training row indices. */
export function gramOf(Z, labels, cls, idx, cols, within) {
  const d = cols.length, n = idx.length, mz = new Array(d).fill(0), my = {}, keys = Object.keys(labels);
  // per-class means (within) or global means (plain)
  const group = within ? cls : null, sumZ = new Map(), sumY = new Map(), cnt = new Map();
  for (const i of idx) { const g = within ? cls[i] : 0; cnt.set(g, (cnt.get(g) ?? 0) + 1); const sz = sumZ.get(g) ?? sumZ.set(g, new Array(d).fill(0)).get(g); for (let j = 0; j < d; j++) sz[j] += Z[i][cols[j]]; const sy = sumY.get(g) ?? sumY.set(g, {}).get(g); for (const k of keys) sy[k] = (sy[k] ?? 0) + labels[k][i]; }
  const G = Array.from({ length: d }, () => new Float64Array(d)), c = Object.fromEntries(keys.map((k) => [k, new Float64Array(d)]));
  for (const i of idx) {
    const g = within ? cls[i] : 0, m = cnt.get(g), sz = sumZ.get(g), sy = sumY.get(g), x = new Float64Array(d);
    for (let j = 0; j < d; j++) x[j] = Z[i][cols[j]] - sz[j] / m;
    for (let a = 0; a < d; a++) { const xa = x[a]; if (xa === 0) continue; const Ga = G[a]; for (let b = 0; b <= a; b++) Ga[b] += xa * x[b]; }
    for (const k of keys) { const yc = labels[k][i] - sy[k] / m; const ck = c[k]; for (let a = 0; a < d; a++) ck[a] += x[a] * yc; }
  }
  for (let a = 0; a < d; a++) for (let b = a + 1; b < d; b++) G[a][b] = G[b][a];
  // global means for the intercept
  for (const i of idx) { for (let j = 0; j < d; j++) mz[j] += Z[i][cols[j]] / n; for (const k of keys) my[k] = (my[k] ?? 0) + labels[k][i] / n; }
  void group;
  return { cols, n, G, c, mz, my };
}

export function fitFromGram(g, key, lambda) {
  const d = g.cols.length, A = Array.from({ length: d }, (_, a) => Array.from(g.G[a])); for (let a = 0; a < d; a++) A[a][a] += lambda * g.n;
  const w = solve(cholesky(A), Array.from(g.c[key])); let b = g.my[key]; for (let j = 0; j < d; j++) b -= w[j] * g.mz[j];
  return { cols: g.cols, w, b };
}
