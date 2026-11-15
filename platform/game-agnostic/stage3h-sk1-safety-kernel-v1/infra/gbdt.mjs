// SK1 estimator training (development side only; the kernel only EVALUATES the trees, see kernel/risk.mjs).
// Bounded model: a bag of B boosted ensembles, each of T depth-limited regression trees on histogram-binned features.
// Fully deterministic: no Math.random, no clock; bootstrap draws come from a seeded integer generator.
import { createHash } from 'node:crypto';

export const DEFAULTS = Object.freeze({ bags: 6, trees: 100, depth: 3, lr: 0.1, minLeaf: 20, lambda: 1, maxBins: 32 });
export function prng(label) { let a = parseInt(createHash('sha256').update(label).digest('hex').slice(0, 8), 16) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Column binning shared by every tree of a fit: thresholds are midpoints between distinct training values. */
export function binColumns(rows, maxBins = DEFAULTS.maxBins) {
  const n = rows.length, d = rows[0].length, bins = [], thr = [];
  for (let j = 0; j < d; j++) {
    const uniq = [...new Set(rows.map((r) => r[j]))].sort((a, b) => a - b); let cuts = [];
    if (uniq.length <= maxBins) for (let k = 0; k + 1 < uniq.length; k++) cuts.push((uniq[k] + uniq[k + 1]) / 2);
    else { const sorted = rows.map((r) => r[j]).sort((a, b) => a - b); for (let q = 1; q < maxBins; q++) { const v = sorted[Math.floor((q * n) / maxBins)], nxt = uniq[uniq.indexOf(v) + 1]; if (nxt !== undefined) { const c = (v + nxt) / 2; if (!cuts.length || c > cuts[cuts.length - 1]) cuts.push(c); } } }
    const col = new Uint8Array(n); for (let i = 0; i < n; i++) { let b = 0; const x = rows[i][j]; while (b < cuts.length && x > cuts[b]) b++; col[i] = b; }
    bins.push(col); thr.push(cuts);
  }
  return { bins, thr, n, d };
}

function fitOne(B, y, w, cfg, loss) {
  const { bins, thr, n, d } = B, F = new Float64Array(n), g = new Float64Array(n), h = new Float64Array(n), live = []; let sw = 0, sy = 0;
  for (let i = 0; i < n; i++) if (w[i] > 0) { live.push(i); sw += w[i]; sy += w[i] * y[i]; }
  const mean = sy / sw, base = loss === 'logistic' ? Math.log(Math.min(1 - 1e-6, Math.max(1e-6, mean)) / (1 - Math.min(1 - 1e-6, Math.max(1e-6, mean)))) : mean; F.fill(base);
  const trees = [], G = new Float64Array(256), H = new Float64Array(256), W = new Float64Array(256);
  for (let t = 0; t < cfg.trees; t++) {
    for (const i of live) { if (loss === 'logistic') { const p = 1 / (1 + Math.exp(-F[i])); g[i] = w[i] * (p - y[i]); h[i] = w[i] * Math.max(1e-6, p * (1 - p)); } else { g[i] = w[i] * (F[i] - y[i]); h[i] = w[i]; } }
    const tree = { f: [], t: [], l: [], r: [], v: [] }, sb = [];
    const grow = (idx, depth) => {
      const node = tree.f.length; tree.f.push(-1); tree.t.push(0); tree.l.push(-1); tree.r.push(-1); tree.v.push(0); sb.push(-1);
      let Gs = 0, Hs = 0, Ws = 0; for (const i of idx) { Gs += g[i]; Hs += h[i]; Ws += w[i]; }
      tree.v[node] = (-Gs / (Hs + cfg.lambda)) * cfg.lr;
      if (depth >= cfg.depth || Ws < 2 * cfg.minLeaf) return node;
      const parent = (Gs * Gs) / (Hs + cfg.lambda); let best = null;
      for (let j = 0; j < d; j++) { const nb = thr[j].length; if (!nb) continue; const col = bins[j];
        for (let b = 0; b <= nb; b++) { G[b] = 0; H[b] = 0; W[b] = 0; }
        for (const i of idx) { const b = col[i]; G[b] += g[i]; H[b] += h[i]; W[b] += w[i]; }
        let gl = 0, hl = 0, wl = 0;
        for (let b = 0; b < nb; b++) { gl += G[b]; hl += H[b]; wl += W[b]; if (wl < cfg.minLeaf || Ws - wl < cfg.minLeaf) continue;
          const gain = (gl * gl) / (hl + cfg.lambda) + ((Gs - gl) * (Gs - gl)) / (Hs - hl + cfg.lambda) - parent; if (gain > 1e-9 && (best === null || gain > best.gain)) best = { gain, j, b }; } }
      if (!best) return node;
      const col = bins[best.j], L = [], R = []; for (const i of idx) (col[i] <= best.b ? L : R).push(i);
      tree.f[node] = best.j; sb[node] = best.b; tree.t[node] = thr[best.j][best.b]; tree.l[node] = grow(L, depth + 1); tree.r[node] = grow(R, depth + 1); return node;
    };
    grow(live, 0);
    // update the scores of the rows this bag was fit on
    for (const i of live) { let nd = 0; while (tree.f[nd] >= 0) nd = bins[tree.f[nd]][i] <= sb[nd] ? tree.l[nd] : tree.r[nd]; F[i] += tree.v[nd]; }
    trees.push(tree);
  }
  return { base, trees };
}

/** Family-bootstrap bag of boosted ensembles. families[i] = origin family of row i. Returns a kernel-readable head. */
export function fitHead(rows, y, families, loss, label, cfg = DEFAULTS, shared = null) {
  const B = shared ?? binColumns(rows, cfg.maxBins), fams = [...new Set(families)].sort(), rnd = prng(label), bags = [];
  for (let b = 0; b < cfg.bags; b++) { const count = new Map(); for (let k = 0; k < fams.length; k++) { const f = fams[Math.floor(rnd() * fams.length)]; count.set(f, (count.get(f) ?? 0) + 1); }
    const w = new Float64Array(rows.length); for (let i = 0; i < rows.length; i++) w[i] = count.get(families[i]) ?? 0; bags.push(fitOne(B, y, w, cfg, loss)); }
  return { link: loss === 'logistic' ? 'logit' : 'identity', bags };
}
