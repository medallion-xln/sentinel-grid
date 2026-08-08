/* AZL NN kernel. Hand-rolled Float32Array math (no TF.js): residual MLP trunk,
 * policy head (masked softmax), N tanh value heads, optional sigmoid confidence head.
 * Exact analytic backprop + Adam + global-norm clip. Zero allocation in predict()
 * after construction. One params buffer + tensor table (drives the binary weight codec).
 *
 * spec = { name, input, width, blocks, headStem (0=direct heads), policy:A,
 *          values:['now',...], confidence:bool } */
(function (g) {
  'use strict';
  var AZL = g.AZL, U = AZL.Util;
  var NN = AZL.NN = {};

  function Net(spec) {
    this.spec = spec;
    var t = this.tensors = [];   // {name, shape, offset, size}
    var off = 0;
    function T(name, shape) { var sz = shape.reduce(function (a, b) { return a * b; }, 1); t.push({ name: name, shape: shape, offset: off, size: sz }); off += sz; }
    var I = spec.input, W = spec.width, S = spec.headStem | 0, A = spec.policy, VK = spec.values || [];
    T('proj.W', [W, I]); T('proj.b', [W]);
    for (var b = 0; b < spec.blocks; b++) { T('blk' + b + '.W1', [W, W]); T('blk' + b + '.b1', [W]); T('blk' + b + '.W2', [W, W]); T('blk' + b + '.b2', [W]); }
    if (S > 0) {
      T('pstem.W', [S, W]); T('pstem.b', [S]); T('pol.W', [A, S]); T('pol.b', [A]);
      T('vstem.W', [S, W]); T('vstem.b', [S]);
      for (var k = 0; k < VK.length; k++) { T('val.' + VK[k] + '.w', [S]); T('val.' + VK[k] + '.b', [1]); }
      if (spec.confidence) { T('conf.w', [S]); T('conf.b', [1]); }
    } else {
      T('pol.W', [A, W]); T('pol.b', [A]);
      for (var k2 = 0; k2 < VK.length; k2++) { T('val.' + VK[k2] + '.w', [W]); T('val.' + VK[k2] + '.b', [1]); }
      if (spec.confidence) { T('conf.w', [W]); T('conf.b', [1]); }
    }
    this.paramCount = off;
    this.params = new Float32Array(off);
    this.grads = new Float32Array(off);
    this._m = null; this._v = null; this._adamT = 0;
    this.byName = {}; for (var i = 0; i < t.length; i++) this.byName[t[i].name] = t[i];
    // activation buffers (batch=1)
    this.x = new Float32Array(I);
    this.h = [];      // trunk activations: h[0]=post-proj, h[b+1]=post-block b
    for (var j = 0; j <= spec.blocks; j++) this.h.push(new Float32Array(W));
    this.blkA = []; this.blkPre = [];
    for (var j2 = 0; j2 < spec.blocks; j2++) { this.blkA.push(new Float32Array(W)); this.blkPre.push(new Float32Array(W)); }
    this.stemP = S > 0 ? new Float32Array(S) : null;
    this.stemV = S > 0 ? new Float32Array(S) : null;
    this.logits = new Float32Array(A);
    this.out = { policy: new Float32Array(A), values: {}, confidence: 0.5, uncertainty: null };
    for (var k3 = 0; k3 < VK.length; k3++) this.out.values[VK[k3]] = 0;
    // backward scratch
    this.dh = new Float32Array(W); this.dh2 = new Float32Array(W); this.dA = new Float32Array(W);
    this.dStemP = S > 0 ? new Float32Array(S) : null; this.dStemV = S > 0 ? new Float32Array(S) : null;
    this.dLogits = new Float32Array(A);
    this._vPre = new Float32Array(VK.length); // pre-tanh per head
    this._cPre = 0;
    this.version = 0; // weight version (set on import)
    this.initHe();
  }
  Net.prototype.view = function (name) { var d = this.byName[name]; return this.params.subarray(d.offset, d.offset + d.size); };
  Net.prototype.gview = function (name) { var d = this.byName[name]; return this.grads.subarray(d.offset, d.offset + d.size); };
  Net.prototype.initHe = function (seed) {
    var rng = new U.RNG(seed || 0x51F0A7);
    for (var i = 0; i < this.tensors.length; i++) {
      var d = this.tensors[i], v = this.params.subarray(d.offset, d.offset + d.size);
      if (d.shape.length === 2) {
        var fanIn = d.shape[1], s = Math.sqrt(2 / fanIn);
        for (var j = 0; j < v.length; j++) { // Box-Muller normal
          var u1 = rng.next() || 1e-9, u2 = rng.next();
          v[j] = s * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        }
      } else if (d.shape.length === 1 && d.name.indexOf('.w') === d.name.length - 2) {
        var s2 = Math.sqrt(1 / d.shape[0]);
        for (var j2 = 0; j2 < v.length; j2++) { var a1 = rng.next() || 1e-9, a2 = rng.next(); v[j2] = s2 * Math.sqrt(-2 * Math.log(a1)) * Math.cos(2 * Math.PI * a2); }
      } else v.fill(0);
    }
  };
  function mvAdd(W, x, b, out, rows, cols) { // out = W x + b
    for (var r = 0; r < rows; r++) { var s = b ? b[r] : 0, ro = r * cols; for (var c = 0; c < cols; c++) s += W[ro + c] * x[c]; out[r] = s; }
  }
  function reluIn(a) { for (var i = 0; i < a.length; i++) if (a[i] < 0) a[i] = 0; }
  // dx += W^T dy ; dW += dy x^T ; db += dy
  function backLinear(W, x, dy, dW, db, dx, rows, cols) {
    for (var r = 0; r < rows; r++) {
      var d = dy[r]; if (d === 0) continue; var ro = r * cols;
      db[r] += d;
      for (var c = 0; c < cols; c++) { dW[ro + c] += d * x[c]; if (dx) dx[c] += d * W[ro + c]; }
    }
  }
  Net.prototype.forward = function (input, mask) {
    var sp = this.spec, W = sp.width;
    this.x.set(input.subarray ? input.subarray(0, sp.input) : input);
    mvAdd(this.view('proj.W'), this.x, this.view('proj.b'), this.h[0], W, sp.input); reluIn(this.h[0]);
    for (var b = 0; b < sp.blocks; b++) {
      var inH = this.h[b], a = this.blkA[b], pre = this.blkPre[b], outH = this.h[b + 1];
      mvAdd(this.view('blk' + b + '.W1'), inH, this.view('blk' + b + '.b1'), a, W, W); reluIn(a);
      mvAdd(this.view('blk' + b + '.W2'), a, this.view('blk' + b + '.b2'), pre, W, W);
      for (var i = 0; i < W; i++) { var p = inH[i] + pre[i]; pre[i] = p; outH[i] = p > 0 ? p : 0; }
    }
    var top = this.h[sp.blocks], S = sp.headStem | 0, A = sp.policy, VK = sp.values || [];
    var polIn = top, valIn = top;
    if (S > 0) {
      mvAdd(this.view('pstem.W'), top, this.view('pstem.b'), this.stemP, S, W); reluIn(this.stemP); polIn = this.stemP;
      mvAdd(this.view('vstem.W'), top, this.view('vstem.b'), this.stemV, S, W); reluIn(this.stemV); valIn = this.stemV;
      mvAdd(this.view('pol.W'), polIn, this.view('pol.b'), this.logits, A, S);
    } else mvAdd(this.view('pol.W'), polIn, this.view('pol.b'), this.logits, A, W);
    U.maskedSoftmax(this.logits, mask, this.out.policy, 1.0);
    var dIn = (S > 0) ? S : W;
    for (var k = 0; k < VK.length; k++) {
      var w = this.view('val.' + VK[k] + '.w'), s = this.view('val.' + VK[k] + '.b')[0];
      for (var c = 0; c < dIn; c++) s += w[c] * valIn[c];
      this._vPre[k] = s; this.out.values[VK[k]] = Math.tanh(s);
    }
    if (sp.confidence) {
      var cw = this.view('conf.w'), cs = this.view('conf.b')[0];
      for (var c2 = 0; c2 < dIn; c2++) cs += cw[c2] * valIn[c2];
      this._cPre = cs; this.out.confidence = 1 / (1 + Math.exp(-cs));
    }
    return this.out;
  };
  // Uniform model interface
  Net.prototype.predict = function (input, opts) {
    var o = this.forward(input, opts && opts.mask);
    return { policy: o.policy, values: o.values, uncertainty: this.spec.confidence ? (1 - o.confidence) : null, embedding: null, metadata: { name: this.spec.name, version: this.version, learned: true } };
  };
  function huberGrad(err, delta) { return Math.abs(err) <= delta ? err : delta * (err > 0 ? 1 : -1); }
  function huberLoss(err, delta) { var a = Math.abs(err); return a <= delta ? 0.5 * err * err : delta * (a - 0.5 * delta); }
  // One example: targets = { policyDist|null, actionIdx|null(one-hot fallback), mask,
  //   values:{key:target|null}, confidenceTarget|null, weight, entropyBeta, huberDelta, headWeights }
  Net.prototype.trainExample = function (input, t) {
    var sp = this.spec, W = sp.width, A = sp.policy, VK = sp.values || [], S = sp.headStem | 0;
    this.forward(input, t.mask);
    var w = (t.weight != null ? t.weight : 1), eb = t.entropyBeta || 0, hd = t.huberDelta || 1.0;
    var lp = 0, lv = 0, lc = 0, i, k;
    this.dLogits.fill(0);
    var p = this.out.policy;
    var hasPol = !!(t.policyDist || (t.actionIdx != null && t.actionIdx >= 0));
    if (hasPol) {
      var H = eb > 0 ? U.entropy(p) : 0;
      for (i = 0; i < A; i++) {
        if (t.mask && !t.mask[i]) continue;
        var tp = t.policyDist ? t.policyDist[i] : (i === t.actionIdx ? 1 : 0);
        if (tp > 0) lp += -w * tp * Math.log(p[i] + 1e-9);
        var gce = (p[i] - tp);
        var gent = eb > 0 ? eb * p[i] * (Math.log(p[i] + 1e-9) + H) : 0; // d(-eb*H)/dlogit
        this.dLogits[i] = w * (gce + gent);
      }
      if (eb > 0) lp += -w * eb * H;
    }
    // value heads: dL/dpre = w * hw * huber'(err) * (1 - tanh^2)
    var dValIn = (S > 0) ? this.dStemV : this.dh; if (S === 0) this.dh.fill(0); else this.dStemV.fill(0);
    var dIn = (S > 0) ? S : W, valIn = (S > 0) ? this.stemV : this.h[sp.blocks];
    var anyVal = false;
    for (k = 0; k < VK.length; k++) {
      var key = VK[k], tv = t.values ? t.values[key] : null;
      if (tv == null || !isFinite(tv)) continue;
      anyVal = true;
      var hw = (t.headWeights && t.headWeights[key] != null) ? t.headWeights[key] : 1;
      var pred = this.out.values[key], err = pred - tv;
      lv += w * hw * huberLoss(err, hd);
      var dpre = w * hw * huberGrad(err, hd) * (1 - pred * pred);
      var wv = this.view('val.' + key + '.w'), gw = this.gview('val.' + key + '.w');
      this.gview('val.' + key + '.b')[0] += dpre;
      for (i = 0; i < dIn; i++) { gw[i] += dpre * valIn[i]; dValIn[i] += dpre * wv[i]; }
    }
    if (sp.confidence && t.confidenceTarget != null && isFinite(t.confidenceTarget)) {
      var c = this.out.confidence, ct = t.confidenceTarget;
      lc += w * (-(ct * Math.log(c + 1e-9) + (1 - ct) * Math.log(1 - c + 1e-9)));
      var dc = w * (c - ct);
      var cw2 = this.view('conf.w'), gcw = this.gview('conf.w');
      this.gview('conf.b')[0] += dc;
      for (i = 0; i < dIn; i++) { gcw[i] += dc * valIn[i]; dValIn[i] += dc * cw2[i]; }
      anyVal = true;
    }
    // policy path back into trunk-top gradient (this.dh accumulates trunk-top grad)
    if (S > 0) {
      this.dh.fill(0);
      if (hasPol) {
        this.dStemP.fill(0);
        backLinear(this.view('pol.W'), this.stemP, this.dLogits, this.gview('pol.W'), this.gview('pol.b'), this.dStemP, A, S);
        for (i = 0; i < S; i++) if (this.stemP[i] <= 0) this.dStemP[i] = 0;
        backLinear(this.view('pstem.W'), this.h[sp.blocks], this.dStemP, this.gview('pstem.W'), this.gview('pstem.b'), this.dh, S, W);
      }
      if (anyVal) {
        for (i = 0; i < S; i++) if (this.stemV[i] <= 0) dValIn[i] = 0;
        backLinear(this.view('vstem.W'), this.h[sp.blocks], dValIn, this.gview('vstem.W'), this.gview('vstem.b'), this.dh, S, W);
      }
    } else if (hasPol) {
      backLinear(this.view('pol.W'), this.h[sp.blocks], this.dLogits, this.gview('pol.W'), this.gview('pol.b'), this.dh, A, W);
    }
    // trunk backward through residual blocks
    var dTop = this.dh;
    for (var b = sp.blocks - 1; b >= 0; b--) {
      var pre = this.blkPre[b], a = this.blkA[b], inH = this.h[b];
      for (i = 0; i < W; i++) if (pre[i] <= 0) dTop[i] = 0; // relu on (inH + z)
      this.dA.fill(0);
      backLinear(this.view('blk' + b + '.W2'), a, dTop, this.gview('blk' + b + '.W2'), this.gview('blk' + b + '.b2'), this.dA, W, W);
      for (i = 0; i < W; i++) if (a[i] <= 0) this.dA[i] = 0;
      this.dh2.fill(0);
      backLinear(this.view('blk' + b + '.W1'), inH, this.dA, this.gview('blk' + b + '.W1'), this.gview('blk' + b + '.b1'), this.dh2, W, W);
      for (i = 0; i < W; i++) dTop[i] += this.dh2[i]; // skip connection
    }
    for (i = 0; i < W; i++) if (this.h[0][i] <= 0) dTop[i] = 0;
    backLinear(this.view('proj.W'), this.x, dTop, this.gview('proj.W'), this.gview('proj.b'), null, W, sp.input);
    return { policy: lp, value: lv, calibration: lc };
  };
  Net.prototype.zeroGrads = function () { this.grads.fill(0); };
  Net.prototype.adamStep = function (opts) {
    opts = opts || {};
    var lr = opts.lr || 1e-3, clip = opts.clipNorm || 0, wd = opts.l2 || 0;
    if (!this._m) { this._m = new Float32Array(this.paramCount); this._v = new Float32Array(this.paramCount); }
    var gn = U.l2norm(this.grads), scale = 1;
    if (clip > 0 && gn > clip) scale = clip / (gn + 1e-12);
    this._adamT++;
    var b1 = 0.9, b2 = 0.999, e = 1e-8, t = this._adamT;
    var bc1 = 1 - Math.pow(b1, t), bc2 = 1 - Math.pow(b2, t);
    var P = this.params, G = this.grads, M = this._m, V = this._v;
    for (var i = 0; i < P.length; i++) {
      var gi = G[i] * scale + wd * P[i];
      if (!isFinite(gi)) gi = 0; // NaN guard
      M[i] = b1 * M[i] + (1 - b1) * gi;
      V[i] = b2 * V[i] + (1 - b2) * gi * gi;
      P[i] -= lr * (M[i] / bc1) / (Math.sqrt(V[i] / bc2) + e);
    }
    return { gradNorm: gn, clipped: scale < 1 };
  };
  // trainBatch per uniform interface. tuples: [{input, targets}]
  Net.prototype.trainBatch = function (tuples, opts) {
    opts = opts || {};
    var t0 = U.now(), lp = 0, lv = 0, lc = 0;
    this.zeroGrads();
    for (var i = 0; i < tuples.length; i++) {
      var r = this.trainExample(tuples[i].input, tuples[i].targets);
      lp += r.policy; lv += r.value; lc += r.calibration;
    }
    var n = Math.max(1, tuples.length), inv = 1 / n;
    for (var j = 0; j < this.grads.length; j++) this.grads[j] *= inv;
    var st = this.adamStep(opts);
    if (!U.isFiniteArr(this.params)) throw new Error('AZL.NN: non-finite params after step');
    return { totalLoss: (lp + lv + lc) * inv, policyLoss: lp * inv, valueLoss: lv * inv, calibrationLoss: lc * inv, examples: tuples.length, durationMs: U.now() - t0, gradNorm: st.gradNorm };
  };
  Net.prototype.exportWeights = function () {
    var out = [];
    for (var i = 0; i < this.tensors.length; i++) {
      var d = this.tensors[i];
      out.push({ name: d.name, shape: d.shape.slice(), data: this.params.slice(d.offset, d.offset + d.size) });
    }
    return { name: this.spec.name, version: this.version, tensors: out };
  };
  Net.prototype.importWeights = function (bundle) {
    if (!this.validateWeights(bundle)) throw new Error('AZL.NN: weight validation failed for ' + this.spec.name);
    for (var i = 0; i < bundle.tensors.length; i++) {
      var t = bundle.tensors[i], d = this.byName[t.name];
      this.params.set(t.data, d.offset);
    }
    this.version = bundle.version | 0;
    this._m = null; this._v = null; this._adamT = 0;
    return true;
  };
  Net.prototype.validateWeights = function (bundle) {
    if (!bundle || !bundle.tensors) return false;
    var seen = 0;
    for (var i = 0; i < bundle.tensors.length; i++) {
      var t = bundle.tensors[i], d = this.byName[t.name];
      if (!d) return false;
      var sz = t.shape.reduce(function (a, b) { return a * b; }, 1);
      if (sz !== d.size || t.data.length !== d.size) return false;
      if (!U.isFiniteArr(t.data)) return false;
      seen++;
    }
    return seen === this.tensors.length;
  };
  Net.prototype.getManifest = function () { return { name: this.spec.name, params: this.paramCount, version: this.version, spec: this.spec }; };
  Net.prototype.clone = function () { var n = new Net(this.spec); n.params.set(this.params); n.version = this.version; return n; };
  Net.prototype.snapshotParams = function () { return this.params.slice(); };
  Net.prototype.dispose = function () { this.params = this.grads = this._m = this._v = null; };
  NN.Net = Net;
})(typeof self !== 'undefined' ? self : globalThis);
