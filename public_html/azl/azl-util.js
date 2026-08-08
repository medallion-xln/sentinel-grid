/* AZL utilities: deterministic RNG, hashing, numeric guards, masked stable softmax. */
(function (g) {
  'use strict';
  var AZL = g.AZL = g.AZL || {};
  var U = AZL.Util = {};

  // xorshift32 - deterministic, fast, good enough for search noise / selfplay
  U.RNG = function (seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    this.next = function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    this.int = function (n) { return (this.next() * n) | 0; };
    this.state = function () { return s; };
  };
  // Marsaglia-Tsang gamma sampler (alpha>0), for Dirichlet root noise
  U.gamma = function (rng, alpha) {
    if (alpha < 1) { var u = rng.next(); return U.gamma(rng, alpha + 1) * Math.pow(u || 1e-12, 1 / alpha); }
    var d = alpha - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      var x, v, u1, u2;
      do { u1 = rng.next(); u2 = rng.next(); x = Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; var un = rng.next() || 1e-12;
      if (Math.log(un) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
    }
  };
  U.dirichlet = function (rng, alpha, k, out) {
    var s = 0, i; out = out || new Float32Array(k);
    for (i = 0; i < k; i++) { out[i] = U.gamma(rng, alpha); s += out[i]; }
    if (s <= 0) { for (i = 0; i < k; i++) out[i] = 1 / k; return out; }
    for (i = 0; i < k; i++) out[i] /= s; return out;
  };

  // FNV-1a 32-bit over a byte feed
  U.Fnv = function () {
    var h = 0x811c9dc5;
    this.byte = function (b) { h ^= (b & 0xff); h = Math.imul(h, 0x01000193) >>> 0; };
    this.u32 = function (v) { this.byte(v); this.byte(v >>> 8); this.byte(v >>> 16); this.byte(v >>> 24); };
    this.f32q = function (f) { this.u32(Math.round(f * 10000) | 0); }; // quantized -> stable hash
    this.done = function () { return h >>> 0; };
  };
  U.hashVec = function (vec, mask, versions) {
    var f = new U.Fnv(), i;
    for (i = 0; i < versions.length; i++) f.u32(versions[i]);
    for (i = 0; i < vec.length; i++) f.f32q(vec[i]);
    if (mask) for (i = 0; i < mask.length; i++) f.byte(mask[i]);
    return f.done();
  };

  U.isFiniteArr = function (a) { for (var i = 0; i < a.length; i++) { if (!isFinite(a[i])) return false; } return true; };
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.l2norm = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s); };

  // Stable masked softmax. Writes probs into out. Returns false if no legal action.
  U.maskedSoftmax = function (logits, mask, out, temperature) {
    var n = logits.length, i, m = -Infinity, t = (temperature && temperature > 0) ? temperature : 1.0;
    for (i = 0; i < n; i++) if ((!mask || mask[i]) && logits[i] > m) m = logits[i];
    if (m === -Infinity) { for (i = 0; i < n; i++) out[i] = 0; return false; }
    var s = 0;
    for (i = 0; i < n; i++) {
      if (!mask || mask[i]) { var e = Math.exp((logits[i] - m) / t); if (!isFinite(e)) e = 0; out[i] = e; s += e; }
      else out[i] = 0;
    }
    if (!(s > 0) || !isFinite(s)) { // degenerate -> uniform over legal
      var c = 0; for (i = 0; i < n; i++) if (!mask || mask[i]) c++;
      if (!c) return false;
      for (i = 0; i < n; i++) out[i] = (!mask || mask[i]) ? 1 / c : 0; return true;
    }
    for (i = 0; i < n; i++) out[i] /= s;
    return true;
  };
  U.entropy = function (p) { var h = 0; for (var i = 0; i < p.length; i++) if (p[i] > 0) h -= p[i] * Math.log(p[i]); return h; };
  U.argmax = function (a, mask) { var b = -1, bv = -Infinity; for (var i = 0; i < a.length; i++) if ((!mask || mask[i]) && a[i] > bv) { bv = a[i]; b = i; } return b; };
  U.sampleDist = function (p, rng, mask) {
    var r = rng.next(), c = 0, last = -1;
    for (var i = 0; i < p.length; i++) { if (mask && !mask[i]) continue; last = i; c += p[i]; if (r <= c) return i; }
    return last;
  };
  U.uuid = function (rng) {
    var r = rng || { next: Math.random.bind(Math) }, s = '';
    for (var i = 0; i < 32; i++) s += ((r.next() * 16) | 0).toString(16);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-4' + s.slice(13, 16) + '-a' + s.slice(17, 20) + '-' + s.slice(20, 32);
  };
  U.now = function () { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); };
})(typeof self !== 'undefined' ? self : globalThis);
