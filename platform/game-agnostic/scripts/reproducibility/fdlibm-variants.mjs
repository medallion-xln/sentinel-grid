/* Diagnostic fdlibm variants for the Stage 3F reproducibility root-cause experiments. NOT the canonical profile
 * (see src/core/canonical-numerics-v1.js). Exact JS ports of V8 base::ieee754::exp / ::pow in two compilation models:
 *   separate — every * and + rounded separately (x86-64 builds; bit-identical to V8 12 on x86-64)
 *   fused    — a*b+c within one C expression fused into a single-rounding fma (clang -ffp-contract=on, arm64 builds)
 */
import { fma } from '../../src/core/canonical-numerics-v1.js';

const dv = new DataView(new ArrayBuffer(8));
const hiWord = (x) => { dv.setFloat64(0, x); return dv.getUint32(0); };
const fromWords = (hi, lo) => { dv.setUint32(0, hi >>> 0); dv.setUint32(4, lo >>> 0); return dv.getFloat64(0); };
const HI = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
const LO = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
const setHI = (x, h) => { dv.setFloat64(0, x); dv.setInt32(0, h | 0); return dv.getFloat64(0); };
const setLO = (x, l) => { dv.setFloat64(0, x); dv.setUint32(4, l >>> 0); return dv.getFloat64(0); };

const one = 1.0, halF = [0.5, -0.5];
const o_threshold = 7.09782712893383973096e+02, u_threshold = -7.45133219101941108420e+02;
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const invln2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05;
const P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08, E = 2.718281828459045;
const huge = 1.0e+300, twom1000 = 9.33263618503218878990e-302, two1023 = 8.988465674311579539e307;

export function makeExp(model) {
  const F = model === 'fma';
  return function exp(x) {
    let y, hi = 0.0, lo = 0.0, c, t, twopk, k = 0;
    let hx = hiWord(x);
    const xsb = (hx >>> 31) & 1;
    hx = (hx & 0x7fffffff) >>> 0;
    if (hx >= 0x40862E42) {
      if (hx >= 0x7FF00000) {
        if (Number.isNaN(x)) return x + x;
        return xsb === 0 ? x : 0.0;
      }
      if (x > o_threshold) return huge * huge;
      if (x < u_threshold) return twom1000 * twom1000;
    }
    if (hx > 0x3FD62E42) {
      if (hx < 0x3FF0A2B2) {
        if (x === 1.0) return E;
        hi = x - ln2HI[xsb]; lo = ln2LO[xsb]; k = 1 - xsb - xsb;
      } else {
        k = Math.trunc(F ? fma(invln2, x, halF[xsb]) : invln2 * x + halF[xsb]);
        t = k;
        hi = F ? fma(-t, ln2HI[0], x) : x - t * ln2HI[0];
        lo = t * ln2LO[0];
      }
      x = hi - lo;
    } else if (hx < 0x3E300000) {
      if (huge + x > one) return one + x;
    } else {
      k = 0;
    }
    t = x * x;
    if (k >= -1021) twopk = fromWords((0x3FF00000 + ((k << 20) >>> 0)) >>> 0, 0);
    else twopk = fromWords((0x3FF00000 + ((k + 1000) << 20)) >>> 0, 0);
    if (F) {
      let p = fma(t, P5, P4); p = fma(t, p, P3); p = fma(t, p, P2); p = fma(t, p, P1);
      c = fma(-t, p, x);
    } else {
      c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    }
    if (k === 0) return one - ((x * c) / (c - 2.0) - x);
    y = one - ((lo - (x * c) / (2.0 - c)) - hi);
    if (k >= -1021) { if (k === 1024) return y * 2.0 * two1023; return y * twopk; }
    return y * twopk * twom1000;
  };
}

export const expSeparate = makeExp('separate');
export const expFused = makeExp('fma');

function scalbn(x, n) { // fdlibm scalbn for the subnormal-output path
  const two54 = 1.80143985094819840000e+16, twom54 = 5.55111512312578270212e-17, huge = 1.0e+300, tiny = 1.0e-300;
  let hx = HI(x); let k = (hx & 0x7ff00000) >> 20; const lx = LO(x);
  if (k === 0) { if ((lx | (hx & 0x7fffffff)) === 0) return x; x *= two54; hx = HI(x); k = ((hx & 0x7ff00000) >> 20) - 54; if (n < -50000) return tiny * x; }
  if (k === 0x7ff) return x + x;
  k = k + n;
  if (k > 0x7fe) return huge * Math.sign(x) * huge;
  if (k > 0) return setHI(x, (hx & 0x800fffff) | (k << 20));
  if (k <= -54) { if (n > 50000) return huge * Math.sign(x) * huge; return tiny * Math.sign(x) * tiny; }
  k += 54; x = setHI(x, (hx & 0x800fffff) | (k << 20)); return x * twom54;
}

function makePow(F) { return function pow(x, y) {
  const bp = [1.0, 1.5], dp_h = [0.0, 5.84962487220764160156e-01], dp_l = [0.0, 1.35003920212974897128e-08];
  const one = 1.0, two = 2.0, two53 = 9007199254740992.0, huge = 1.0e300, tiny = 1.0e-300;
  const L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
    L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01;
  const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
    P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
  const lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09;
  const ovt = 8.0085662595372944372e-0017, cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01,
    cp_l = -7.02846165095275826516e-09, ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00,
    ivln2_l = 1.92596299112661746887e-08;
  let z, ax, z_h, z_l, p_h, p_l, y1, t1, t2, r, s, t, u, v, w, i, j, k, yisint, n;
  const hx = HI(x), lx = LO(x), hy = HI(y), ly = LO(y);
  let ix = hx & 0x7fffffff; const iy = hy & 0x7fffffff;
  if ((iy | ly) === 0) return one;
  if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lx !== 0) || iy > 0x7ff00000 || (iy === 0x7ff00000 && ly !== 0)) return x + y;
  yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      k = (iy >> 20) - 0x3ff;
      if (k > 20) { j = ly >>> (52 - k); if (((j << (52 - k)) >>> 0) === ly) yisint = 2 - (j & 1); }
      else if (ly === 0) { j = iy >> (20 - k); if ((j << (20 - k)) === iy) yisint = 2 - (j & 1); }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {
      if (((ix - 0x3ff00000) | lx) === 0) return NaN; // V8: inf**+-1 → y - y (NaN) for |x|==1
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? one / x : x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return Math.sqrt(x);
  }
  ax = Math.abs(x);
  if (lx === 0) {
    if (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000) {
      z = ax; if (hy < 0) z = one / z;
      if (hx < 0) { if (((ix - 0x3ff00000) | yisint) === 0) z = NaN; else if (yisint === 1) z = -z; }
      return z;
    }
  }
  n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;
  s = one; if ((n | (yisint - 1)) === 0) s = -one;
  if (iy > 0x41e00000) {
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? huge * huge : tiny * tiny;
      if (ix >= 0x3ff00000) return hy > 0 ? huge * huge : tiny * tiny;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * huge * huge : s * tiny * tiny;
    if (ix > 0x3ff00000) return hy > 0 ? s * huge * huge : s * tiny * tiny;
    t = ax - one;
    w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    u = ivln2_h * t; v = F ? fma(t, ivln2_l, -(w * ivln2)) : t * ivln2_l - w * ivln2;
    t1 = setLO(u + v, 0); t2 = v - (t1 - u);
  } else {
    let ss, s2, s_h, s_l, t_h, t_l;
    n = 0;
    if (ix < 0x00100000) { ax *= two53; n -= 53; ix = HI(ax); }
    n += (ix >> 20) - 0x3ff;
    j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    if (j <= 0x3988E) k = 0; else if (j < 0xBB67A) k = 1; else { k = 0; n += 1; ix -= 0x00100000; }
    ax = setHI(ax, ix);
    u = ax - bp[k]; v = one / (ax + bp[k]); ss = u * v;
    s_h = setLO(ss, 0);
    t_h = setHI(0, ((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18));
    t_l = ax - (t_h - bp[k]);
    s_l = F ? v * fma(-s_h, t_l, fma(-s_h, t_h, u)) : v * ((u - s_h * t_h) - s_h * t_l);
    s2 = ss * ss;
    r = F ? s2 * s2 * fma(s2, fma(s2, fma(s2, fma(s2, fma(s2, L6, L5), L4), L3), L2), L1) : s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r = F ? fma(s_l, s_h + ss, r) : r + s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = setLO(3.0 + s2 + r, 0);
    t_l = r - ((t_h - 3.0) - s2);
    u = s_h * t_h; v = F ? fma(s_l, t_h, t_l * ss) : s_l * t_h + t_l * ss;
    p_h = setLO(u + v, 0); p_l = v - (p_h - u);
    z_h = cp_h * p_h; z_l = F ? fma(cp_l, p_h, p_l * cp) + dp_l[k] : cp_l * p_h + p_l * cp + dp_l[k];
    t = n;
    t1 = setLO((((z_h + z_l) + dp_h[k]) + t), 0);
    t2 = z_l - (((t1 - t) - dp_h[k]) - z_h);
  }
  y1 = setLO(y, 0);
  p_l = F ? fma(y - y1, t1, y * t2) : (y - y1) * t1 + y * t2; p_h = y1 * t1; z = p_l + p_h;
  j = HI(z); i = LO(z) | 0;
  if (j >= 0x40900000) {
    if (((j - 0x40900000) | i) !== 0) return s * huge * huge;
    if (p_l + ovt > z - p_h) return s * huge * huge;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {
    if (((j - (0xc090cc00 | 0)) | i) !== 0) return s * tiny * tiny;
    if (p_l <= z - p_h) return s * tiny * tiny;
  }
  i = j & 0x7fffffff; k = (i >> 20) - 0x3ff; n = 0;
  if (i > 0x3fe00000) {
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    t = setHI(0, n & ~(0x000fffff >> k));
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  t = setLO(p_l + p_h, 0);
  u = t * lg2_h; v = F ? fma(p_l - (t - p_h), lg2, t * lg2_l) : (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v; w = v - (z - u); t = z * z;
  t1 = F ? fma(-t, fma(t, fma(t, fma(t, fma(t, P5, P4), P3), P2), P1), z) : z - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  r = (z * t1) / ((t1 - two) - (F ? fma(z, w, w) : w + z * w));
  z = one - (r - z);
  j = HI(z); j = (j + ((n << 20) | 0)) | 0;
  if ((j >> 20) <= 0) z = scalbn(z, n);
  else z = setHI(z, (HI(z) + ((n << 20) | 0)) | 0);
  return s * z;
}; }
export const pow = makePow(false);
export const powFused = makePow(true);
