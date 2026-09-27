/* Sentinel Grid — SENTINEL_CANONICAL_NUMERICS_V1 (Stage 3F reproducibility portability remediation).
 *
 * WHY THIS EXISTS
 * ECMAScript leaves Math.exp, Math.log, Math.log2 and Math.pow / `**` "implementation-approximated". The
 * Stage 2G determinism doctrine (src/experts/expert-contract.js) therefore forbids their floats from reaching a
 * digest. Stage 3F.6 fitted-model certificates did let them reach digests, and two platform dependencies were
 * demonstrated experimentally:
 *   1. V8 evaluates Math.exp with its fdlibm port (base::ieee754::exp). On arm64 builds clang contracts
 *      `a*b + c` inside that C++ into fused multiply-add (-ffp-contract=on); on x86-64 it does not. The two
 *      builds disagree by 1 ULP on ~0.05% of inputs, which gradient descent amplifies into different fitted
 *      coefficient bytes (up to 26 ULP) and different model / certificate hashes.
 *   2. From V8 14 (Node 25+), `**` / Math.pow call the platform's std::pow (flag use_std_math_pow, default true):
 *      Apple libm on macOS, glibc on Linux; V8 12 (Node 22) uses fdlibm pow. Results differ by Node major version
 *      and by C library.
 *
 * WHAT THIS DEFINES
 * One fully specified, platform-independent numerical profile, implemented only with IEEE-754 correctly rounded
 * operations (+, -, *, /, Math.sqrt), integer bit manipulation and BigInt arithmetic — all of which ECMAScript
 * specifies exactly. Its outputs are therefore bit-identical on every conforming engine, CPU and OS.
 *   exp  : fdlibm e_exp with the reduction and polynomial evaluated with single-rounding fused multiply-add
 *          exactly where clang -ffp-contract=on fuses them. This is the arithmetic of record: it reproduces every
 *          stored Stage 3F.6 fitted-model hash bit for bit (see artifacts/stage3f-reproducibility-portability).
 *   log  : fdlibm e_log, separately rounded (bit-identical to V8 12-14 on x86-64; consistent with every record).
 *   log2 : fdlibm e_log2, separately rounded (as log).
 *   pow  : correctly rounded x^y (round-to-nearest-even), with V8's special cases y=2 -> x*x, y=0.5 -> sqrt(x+0).
 *          Correct rounding is the only pow definition that is platform-independent by construction; it also
 *          reproduces the stored Stage 3F.6-D-SYM temperature grid, which fdlibm pow does not.
 * The profile is a definition, not an emulation of any one machine: it is checked against golden vectors, not
 * against the host's native Math.
 */

export const CANONICAL_NUMERICS_ID = 'SENTINEL_CANONICAL_NUMERICS_V1';

/* ------------------------------------------------------------ bit helpers */
const dv = new DataView(new ArrayBuffer(8));
const hiWord = (x) => { dv.setFloat64(0, x); return dv.getInt32(0); };
const loWord = (x) => { dv.setFloat64(0, x); return dv.getUint32(4); };
const withHi = (x, h) => { dv.setFloat64(0, x); dv.setInt32(0, h | 0); return dv.getFloat64(0); };
const withLo = (x, l) => { dv.setFloat64(0, x); dv.setUint32(4, l >>> 0); return dv.getFloat64(0); };
const fromWords = (h, l) => { dv.setUint32(0, h >>> 0); dv.setUint32(4, l >>> 0); return dv.getFloat64(0); };

/* ------------------------------------------ exact BigInt scaled arithmetic */
function decompose(x) { // finite x -> [signed BigInt m, e] with x = m * 2^e exactly
  if (x === 0) return [0n, 0];
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0); const lo = dv.getUint32(4);
  const be = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e;
  if (be === 0) e = -1074; else { m |= 1n << 52n; e = be - 1075; }
  return [hi >>> 31 ? -m : m, e];
}
const bitLength = (m) => m.toString(2).length;
/** 2^e as a double, built from its bit pattern (exact; no engine pow involved). Valid for -1074 <= e <= 1023. */
function pow2(e) {
  if (e >= -1022) return fromWords(((e + 1023) << 20) >>> 0, 0);
  const bit = e + 1074; // subnormal
  return bit >= 32 ? fromWords((1 << (bit - 32)) >>> 0, 0) : fromWords(0, (1 << bit) >>> 0);
}
/** Round the exact value m * 2^e (m BigInt, any sign) to the nearest double, ties to even. */
function roundScaled(m, e) {
  if (m === 0n) return 0;
  const negative = m < 0n; if (negative) m = -m;
  let shift = bitLength(m) - 53;
  if (e + shift < -1074) shift = -1074 - e;
  if (shift > 0) {
    const s = BigInt(shift); const q = m >> s; const r = m - (q << s); const half = 1n << (s - 1n);
    m = (r > half || (r === half && (q & 1n) === 1n)) ? q + 1n : q; e += shift;
  }
  if (m === 0n) return negative ? -0 : 0;
  let v;
  if (e + bitLength(m) > 1024) v = Infinity;
  else { const e1 = Math.max(e, -1022); v = Number(m) * pow2(e1) * pow2(e - e1); } // power-of-two scalings: exact
  return negative ? -v : v;
}

/* --------------------------------------------------- fused multiply-add */
const SPLIT = 134217729; // 2^27 + 1 (Veltkamp)
function fmaExact(a, b, c) {
  const [ma, ea] = decompose(a); const [mb, eb] = decompose(b); const [mc, ec] = decompose(c);
  const mp = ma * mb; const ep = ea + eb;
  if (mp === 0n) return a * b + c;
  if (mc === 0n) return roundScaled(mp, ep);
  const e = Math.min(ep, ec);
  const sum = (mp << BigInt(ep - e)) + (mc << BigInt(ec - e));
  return sum === 0n ? 0 : roundScaled(sum, e);
}
/**
 * fma(a, b, c) = a*b + c with a single IEEE round-to-nearest-even. Error-free transformations (Dekker product,
 * Knuth sum) give the exact result as s + u + v; whenever v provably cannot move the rounding of s + u the fast
 * value is returned, otherwise the exact BigInt path decides. Finite arguments only (all internal uses).
 */
export function fma(a, b, c) {
  const aa = a < 0 ? -a : a; const ab = b < 0 ? -b : b; const ac = c < 0 ? -c : c;
  if (aa < 1e150 && ab < 1e150 && aa * ab > 1e-280 && ac < 1e300) {
    const p = a * b;
    let t = SPLIT * a; const ah = t - (t - a); const al = a - ah;
    t = SPLIT * b; const bh = t - (t - b); const bl = b - bh;
    const e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    const s = p + c; let z = s - p; const tt = (p - (s - z)) + (c - z);
    const u = tt + e; z = u - tt; const v = (tt - (u - z)) + (e - z);
    const r = s + u;
    if (v === 0) return r;
    z = r - s; const w = (s - (r - z)) + (u - z);
    const aw = w < 0 ? -w : w; const av = v < 0 ? -v : v; const ar = r < 0 ? -r : r;
    if (aw + av < ar * 5.551115123125783e-17 && ar > 1e-290) return r; // |w|+|v| < 2^-54|r| <= ulp(r)/4
  }
  return fmaExact(a, b, c);
}

/* -------------------------------------------------------------------- exp */
const EXP = Object.freeze({
  halF: [0.5, -0.5], oThreshold: 7.09782712893383973096e+02, uThreshold: -7.45133219101941108420e+02,
  ln2HI: [6.93147180369123816490e-01, -6.93147180369123816490e-01], ln2LO: [1.90821492927058770002e-10, -1.90821492927058770002e-10],
  invln2: 1.44269504088896338700e+00, P1: 1.66666666666666019037e-01, P2: -2.77777777770155933842e-03,
  P3: 6.61375632143793436117e-05, P4: -1.65339022054652515390e-06, P5: 4.13813679705723846039e-08, E: 2.718281828459045,
  huge: 1.0e+300, twom1000: 9.33263618503218878990e-302, two1023: 8.988465674311579539e307,
});
/** fdlibm e_exp (V8 base::ieee754::exp), fused where clang -ffp-contract=on fuses. */
export function exp(x) {
  const C = EXP;
  let y; let hi = 0; let lo = 0; let c; let t; let k = 0;
  let hx = hiWord(x);
  const xsb = (hx >>> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862E42) {
    if (hx >= 0x7FF00000) { if (Number.isNaN(x)) return x + x; return xsb === 0 ? x : 0; }
    if (x > C.oThreshold) return C.huge * C.huge;
    if (x < C.uThreshold) return C.twom1000 * C.twom1000;
  }
  if (hx > 0x3FD62E42) {
    if (hx < 0x3FF0A2B2) {
      if (x === 1) return C.E;
      hi = x - C.ln2HI[xsb]; lo = C.ln2LO[xsb]; k = 1 - xsb - xsb;
    } else {
      k = Math.trunc(fma(C.invln2, x, C.halF[xsb]));
      t = k;
      hi = fma(-t, C.ln2HI[0], x);
      lo = t * C.ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3E300000) {
    if (C.huge + x > 1) return 1 + x;
  } else {
    k = 0;
  }
  t = x * x;
  const twopk = k >= -1021 ? fromWords((0x3FF00000 + (k << 20)) >>> 0, 0) : fromWords((0x3FF00000 + ((k + 1000) << 20)) >>> 0, 0);
  c = fma(-t, fma(t, fma(t, fma(t, fma(t, C.P5, C.P4), C.P3), C.P2), C.P1), x);
  if (k === 0) return 1 - ((x * c) / (c - 2.0) - x);
  y = 1 - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) { if (k === 1024) return y * 2.0 * C.two1023; return y * twopk; }
  return y * twopk * C.twom1000;
}

/* -------------------------------------------------------------------- log */
const Lg1 = 6.666666666666735130e-01; const Lg2 = 3.999999999940941908e-01; const Lg3 = 2.857142874366239149e-01;
const Lg4 = 2.222219843214978396e-01; const Lg5 = 1.818357216161805012e-01; const Lg6 = 1.531383769920937332e-01;
const Lg7 = 1.479819860511658591e-01;
const LN2_HI = 6.93147180369123816490e-01; const LN2_LO = 1.90821492927058770002e-10; const TWO54 = 1.80143985094819840000e+16;

/** fdlibm e_log (V8 base::ieee754::log), separately rounded. */
export function log(x) {
  let hfsq; let f; let s; let z; let R; let w; let t1; let t2; let dk; let k; let hx; let i; let j;
  hx = hiWord(x); const lx = loWord(x);
  k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= TWO54; hx = hiWord(x);
  }
  if (hx >= 0x7FF00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000FFFFF;
  i = (hx + 0x95F64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3FF00000));
  k += (i >> 20);
  f = x - 1.0;
  if ((0x000FFFFF & (2 + hx)) < 3) {
    if (f === 0) { if (k === 0) return 0; dk = k; return dk * LN2_HI + dk * LN2_LO; }
    R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    dk = k; return dk * LN2_HI - ((R - dk * LN2_LO) - f);
  }
  s = f / (2.0 + f); dk = k; z = s * s; i = hx - 0x6147A; w = z * z; j = 0x6B851 - hx;
  t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j; R = t2 + t1;
  if (i > 0) {
    hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
}

/** fdlibm e_log2 (V8 base::ieee754::log2), separately rounded. */
export function log2(x) {
  const ivln2hi = 1.44269504072144627571e+00; const ivln2lo = 1.67517131648865118353e-10;
  let hx = hiWord(x); const lx = loWord(x);
  let k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7FFFFFFF) | lx) === 0) return -Infinity;
    if (hx < 0) return NaN;
    k -= 54; x *= TWO54; hx = hiWord(x);
  }
  if (hx >= 0x7FF00000) return x + x;
  if (hx === 0x3FF00000 && lx === 0) return 0;
  k += (hx >> 20) - 1023;
  hx &= 0x000FFFFF;
  const i = (hx + 0x95F64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3FF00000));
  k += (i >> 20);
  const y = k;
  const f = x - 1.0;
  const hfsq = 0.5 * f * f;
  const s = f / (2.0 + f); const z = s * s; const w = z * z;
  const r = s * (hfsq + (z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))) + w * (Lg2 + w * (Lg4 + w * Lg6))));
  const hi = withLo(f - hfsq, 0);
  const lo = (f - hi) - hfsq + r;
  let valHi = hi * ivln2hi;
  let valLo = (lo + hi) * ivln2lo + lo * ivln2hi;
  const wsum = y + valHi;
  valLo += (y - wsum) + valHi;
  valHi = wsum;
  return valLo + valHi;
}

/* -------------------------------------------------------------------- pow */
const lnCache = new Map();
function ln2Fixed(P) { // ln 2 = 2 atanh(1/3), scaled by 2^P
  if (!lnCache.has(P)) {
    const one = 1n << BigInt(P); let term = one / 3n; let sum = 0n; let k = 1n;
    while (term !== 0n) { sum += term / k; term /= 9n; k += 2n; }
    lnCache.set(P, 2n * sum);
  }
  return lnCache.get(P);
}
function lnNearOne(M, P) { // ln(M / 2^P) for M/2^P in [1/sqrt2, sqrt2]: 2 atanh((m-1)/(m+1)); truncating division
  const S = 1n << BigInt(P);
  const z = ((M - S) * S) / (M + S); const z2 = (z * z) / S;
  let term = z; let sum = 0n; let k = 1n;
  while (term !== 0n) { sum += term / k; term = (term * z2) / S; k += 2n; }
  return 2n * sum;
}
const SQRT2_NUM = 6369051672525772n; const SQRT2_DEN = 4503599627370496n; // a double near sqrt2; only splits the range
function lnFixed(m, e, P) { // ln(m * 2^e) scaled by 2^P, m > 0
  const bl = bitLength(m); let E = e + bl - 1;
  const Pb = BigInt(P);
  let F = bl - 1 > P ? m >> BigInt(bl - 1 - P) : m << BigInt(P - (bl - 1));
  if (F * SQRT2_DEN > SQRT2_NUM << Pb) { F >>= 1n; E += 1; }
  return BigInt(E) * ln2Fixed(P) + lnNearOne(F, P);
}
function expFixed(T, P) { // exp(T / 2^P) = M * 2^e
  const Pb = BigInt(P); const L = ln2Fixed(P);
  let k = T / L; if (T - k * L < 0n) k -= 1n;
  const r = T - k * L; // [0, ln2)
  const S = 1n << Pb; let term = S; let sum = S; let n = 1n;
  while (term !== 0n) { term = (term * r) / (n * S); sum += term; n += 1n; }
  return [sum, Number(k) - P];
}
function powPositive(x, y) {
  const [xm, xe] = decompose(x); const [ym, ye] = decompose(y);
  for (const P of [192, 320, 640, 1280]) {
    const Pb = BigInt(P);
    let T = ym * lnFixed(xm, xe, P);
    T = ye >= 0 ? T << BigInt(ye) : T / (1n << BigInt(-ye));
    if (T > 710n << Pb) return Infinity;
    if (T < -746n << Pb) return 0;
    const [M, e] = expFixed(T, P);
    const err = 1n << BigInt(Math.max(0, bitLength(M) - P + 24)); // relative error bound 2^-(P-24), generous
    const a = roundScaled(M - err, e); const b = roundScaled(M + err, e);
    if (Object.is(a, b)) return a;
  }
  // Exact or midpoint-adjacent case beyond 1280 bits: the 2560-bit nearest value (exact results are exact here).
  const P = 2560; let T = ym * lnFixed(xm, xe, P); T = ye >= 0 ? T << BigInt(ye) : T / (1n << BigInt(-ye));
  const [M, e] = expFixed(T, P); return roundScaled(M, e);
}
const isOddInteger = (v) => Number.isInteger(v) && Math.abs(v) < 9007199254740992 && Math.abs(v % 2) === 1;
/** Correctly rounded x^y with ECMAScript Number::exponentiate special cases and V8's y=2 / y=0.5 shortcuts. */
export function pow(x, y) {
  if (Number.isNaN(y)) return NaN;
  if (y === 0) return 1;
  if (Number.isNaN(x)) return NaN;
  if (!Number.isFinite(y)) {
    const ax = Math.abs(x);
    if (ax === 1) return NaN;
    if (ax > 1) return y > 0 ? Infinity : 0;
    return y > 0 ? 0 : Infinity;
  }
  if (y === 2) return x * x;
  if (y === 0.5) return x === -Infinity ? Infinity : Math.sqrt(x + 0);
  if (y === 1) return x;
  if (x === 0 || !Number.isFinite(x)) { // ECMAScript Number::exponentiate, exact in every engine
    const negZeroOrInf = Object.is(x, -0) || x === -Infinity;
    const odd = isOddInteger(y);
    if (x === Infinity) return y > 0 ? Infinity : 0;
    if (x === -Infinity) return y > 0 ? (odd ? -Infinity : Infinity) : (odd ? -0 : 0);
    if (negZeroOrInf) return y > 0 ? (odd ? -0 : 0) : (odd ? -Infinity : Infinity);
    return y > 0 ? 0 : Infinity;
  }
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const r = powPositive(-x, y);
    return isOddInteger(y) ? -r : r;
  }
  if (x === 1) return 1;
  return powPositive(x, y);
}

/* ------------------------------------------------------ golden conformance */
/**
 * Bit patterns that pin the profile. Each exp vector below is an input on which fused and separately rounded
 * fdlibm disagree; each pow vector is one on which correct rounding disagrees with fdlibm or glibc pow.
 * Any implementation of this profile, on any host, must reproduce these exactly.
 */
export const CANONICAL_NUMERICS_GOLDEN = Object.freeze([
  // [function, x, y|null, expected] — IEEE-754 bit patterns in hexadecimal
  ["log", "454ea2206bd4f3c3", null, "404dc893c489e9c6"],
  ["log2", "454ea2206bd4f3c3", null, "40557bf8496d8870"],
  ["exp", "4081f341ac957198", null, "73b9e366dcaf87d7"],
  ["exp", "bff2617124bf6fb8", null, "3fd44a0f6a2ceb2f"],
  ["exp", "3ff45de462535a84", null, "400c91f903ea2700"],
  ["exp", "4083388d9e643cba", null, "77647ec391eedb72"],
  ["exp", "407f4e1a27a34e6a", null, "6d1893133b0ec4c4"],
  ["exp", "3ffa91e934b2aba0", null, "40150ce3b1357e48"],
  ["exp", "404fb6b83a0fb5e6", null, "45a6baeb6c5eaf72"],
  ["exp", "c002c6f66f0dc3ad", null, "3fb87bf410f67ac4"],
  ["log", "443997cd1dc9bebd", null, "4047cd4744623542"],
  ["log2", "443997cd1dc9bebd", null, "40512b5f0aa1dcab"],
  ["log", "44d0ec8e786c611e", null, "404b0f917919e1aa"],
  ["log2", "44d0ec8e786c611e", null, "4053852f269ac6b7"],
  ["log", "446084aab4709ce3", null, "40489f66d5251c4e"],
  ["log2", "446084aab4709ce3", null, "4051c2f174334d2b"],
  ["log", "3bfd29b335422ad7", null, "c045e16c17da295d"],
  ["log2", "3bfd29b335422ad7", null, "c04f9124e2d30ef0"],
  ["log", "3f07be9a7b7e082a", null, "c02401404a5fe4f9"],
  ["log2", "3f07be9a7b7e082a", null, "c02cdc6753570e07"],
  ["log", "42a1310a9cd050af", null, "403de08d7f69a017"],
  ["log2", "42a1310a9cd050af", null, "40458d43b91ed9ba"],
  ["log", "4515124994df1647", null, "404c8e83d6f5f93c"],
  ["log2", "4515124994df1647", null, "4054996bff830606"],
  ["log", "4187c48defb3640e", null, "4031b973ba8093e1"],
  ["log2", "4187c48defb3640e", null, "40399228db0206fd"],
  ["log", "3d717968ca833cd9", null, "c03ba34367ceecac"],
  ["log2", "3d717968ca833cd9", null, "c043efb94077497f"],
  ["pow", "404d1788eb0bca27", "4019aa2b79fb3cf5", "424881fcf1c82571"],
  ["pow", "3fee8fdc839e319d", "c014e2bf55fd7427", "3ff45774f41a158f"],
  ["pow", "404dbe831a1823a3", "3fe999999999999a", "403a4672283cabb9"],
  ["pow", "3fe94e1184844aa5", "3fe5555555555555", "3feb5d4de34935a7"],
  ["pow", "40507d9566f27277", "c01775e900b32884", "3db77bcfc0889bef"],
  ["pow", "3fe7462db308878f", "401dcd79f331ad76", "3fb7e0a51e33a75f"],
  ["pow", "403052ac877878b8", "3fd5555555555555", "40044b206123a9f5"],
  ["pow", "4042265b331a3bad", "c00e555b4c70f722", "3eb46bb64ec29895"],
  ["pow", "404854901caa5d32", "3fd0000000000000", "40052117bb0c39d1"],
  ["pow", "3fe1c1e55fff0bc9", "c01cde09324fae35", "405187c9b06021a6"],
  ["pow", "4047eb28a02d87d0", "40219615e9f05c40", "4300c06a99685470"],
  ["pow", "3f866d1069205280", "3fe5555555555555", "3fa93f5bc6980bcf"],
]);

export function bitsOf(x) { dv.setFloat64(0, x); return dv.getBigUint64(0).toString(16).padStart(16, '0'); }
export function fromBits(hex) { dv.setBigUint64(0, BigInt(`0x${hex}`)); return dv.getFloat64(0); }

export function verifyGolden(golden = CANONICAL_NUMERICS_GOLDEN) {
  const fns = { exp, log, log2, pow };
  const failures = [];
  for (const [name, x, y, expected] of golden) {
    const got = bitsOf(y === null ? fns[name](fromBits(x)) : fns[name](fromBits(x), fromBits(y)));
    if (got !== expected) failures.push({ name, x, y, expected, got });
  }
  return { checked: golden.length, failures };
}
