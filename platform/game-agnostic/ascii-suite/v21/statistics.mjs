import { mean, quantile } from './harness.mjs';
export function pairedInterval(differences, level = .95) {
  if (!differences.length) return { n: 0, mean: null, lo: null, hi: null };
  let rng = 0x517cc1b7; const samples = [];
  for (let k = 0; k < 4000; k++) { let sum = 0; for (let j = 0; j < differences.length; j++) { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; sum += differences[Math.floor(rng / 4294967296 * differences.length)]; } samples.push(sum / differences.length); }
  const alpha = (1 - level) / 2;
  return { n: differences.length, mean: mean(differences), lo: quantile(samples, alpha), hi: quantile(samples, 1 - alpha), level, degenerate: new Set(differences).size === 1, caveat: 'conditional seed-population bootstrap, not universal uncertainty or a certificate' };
}
export function wilson(successes, n) {
  if (!n) return null;
  const z = 1.959964, p = successes / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { n, p, lo: c - h, hi: c + h, level: .95 };
}
export function paired(rows, selector, baseline = 'V2', candidate = 'V3', level = .95) {
  const values = [], byFamily = {};
  for (const e of rows.filter(e => e.variant === candidate)) {
    const b = rows.find(b => b.variant === baseline && b.seed === e.seed && b.game === e.game && b.condition === e.condition && b.slot === e.slot && b.adversary === e.adversary && b.scenario === e.scenario && b.difficulty === e.difficulty);
    if (!b) continue; const a = selector(e), v = selector(b); if (!Number.isFinite(a) || !Number.isFinite(v)) continue;
    values.push({ seed: e.seed, family: e.family, difference: a - v });
  }
  const seeds = [...new Set(values.map(v => v.seed))], differences = seeds.map(s => mean(values.filter(v => v.seed === s).map(v => v.difference)));
  for (const f of ['A', 'B']) byFamily[f] = pairedInterval(seeds.filter(s => values.find(v => v.seed === s).family === f).map(s => mean(values.filter(v => v.seed === s).map(v => v.difference))), level);
  return { ...pairedInterval(differences, level), byFamily };
}
