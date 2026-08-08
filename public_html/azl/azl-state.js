/* AZL Canonical State Codec.
 * The ONLY module allowed to turn raw adapter state into model inputs.
 * Produces: base flat vector, enriched vector (base + reserved specialist slots),
 * 32-snapshot ring of BASE vectors (Oracle anti-recursion: never enriched),
 * entity view, legal mask, stable hash, schema/norm/action versions, missing-value mask. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;

  function Codec(adapter) {
    if (!adapter || !adapter.baseFeatureSpec || !adapter.actions) throw new Error('AZL.Codec: adapter contract missing');
    this.adapter = adapter;
    this.spec = adapter.baseFeatureSpec;           // [{key,min,max,def}]
    this.baseLen = this.spec.length;
    this.A = adapter.actions.length;
    this.enrichedLen = this.baseLen + C.ORACLE_EMB + C.ORACLE_ALARMS + C.RELATIONAL_EMB;
    this.versions = [C.STATE_SCHEMA_V, C.NORM_V, C.ACTION_SPACE_V, adapter.version | 0];
    // preallocated buffers (no allocation on hot path)
    this._raw = new Float32Array(this.baseLen);
    this.base = new Float32Array(this.baseLen);
    this.missing = new Uint8Array(this.baseLen);
    this.enriched = new Float32Array(this.enrichedLen);
    this.mask = new Uint8Array(this.A);
    this.ring = new Ring(C.RING_SIZE, this.baseLen);
    this.actionKeyHash = (function (acts) { var f = new U.Fnv(); for (var i = 0; i < acts.length; i++) { var k = acts[i].key; for (var j = 0; j < k.length; j++) f.byte(k.charCodeAt(j)); f.byte(124); } return f.done(); })(adapter.actions);
  }
  // Encode a SEARCH state (worker) or live snapshot (main) into base vector + mask.
  // pushRing=true only for real timeline states (never for tree simulation states).
  Codec.prototype.encode = function (simState, pushRing) {
    var a = this.adapter, n = this.baseLen, i;
    a.sim.toBaseFeatures(simState, this._raw);
    for (i = 0; i < n; i++) {
      var v = this._raw[i], s = this.spec[i];
      if (!isFinite(v)) { v = s.def; this.missing[i] = 1; } else this.missing[i] = 0;
      // normalize to [-1,1] with explicit clamp
      var t = (s.max === s.min) ? 0 : (v - s.min) / (s.max - s.min);
      this.base[i] = U.clamp(t * 2 - 1, -1, 1);
    }
    a.sim.legalMask(simState, this.mask);
    var legal = false; for (i = 0; i < this.A; i++) if (this.mask[i]) { legal = true; break; }
    if (pushRing) this.ring.push(this.base);
    return {
      base: this.base, mask: this.mask, missing: this.missing, allMasked: !legal,
      hash: U.hashVec(this.base, this.mask, this.versions),
      versions: this.versions, tick: a.sim.tick(simState)
    };
  };
  // Build enriched vector = base + oracle(emb+alarms) + relational(emb).
  // Missing specialists MUST be zero-filled (reserved slots), per contract.
  Codec.prototype.enrich = function (base, oracleEmb, oracleAlarms, relEmb, out) {
    out = out || this.enriched;
    var o = 0, i;
    out.set(base, 0); o = this.baseLen;
    for (i = 0; i < C.ORACLE_EMB; i++) out[o++] = oracleEmb ? oracleEmb[i] : 0;
    for (i = 0; i < C.ORACLE_ALARMS; i++) out[o++] = oracleAlarms ? oracleAlarms[i] : 0;
    for (i = 0; i < C.RELATIONAL_EMB; i++) out[o++] = relEmb ? relEmb[i] : 0;
    return out;
  };
  Codec.prototype.entities = function (simState) {
    var e = this.adapter.sim.entities(simState) || [];
    // stable deterministic ordering: type then id
    e.sort(function (a, b) { return a.type < b.type ? -1 : a.type > b.type ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return e;
  };
  Codec.prototype.snapshotRing = function () { return this.ring.snapshot(); };

  function Ring(cap, width) {
    this.cap = cap; this.width = width; this.count = 0; this.head = 0;
    this.buf = new Float32Array(cap * width);
  }
  Ring.prototype.push = function (vec) {
    this.buf.set(vec, this.head * this.width);
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) this.count++;
  };
  // returns {frames: Float32Array(count*width) oldest->newest copy, count, width}
  Ring.prototype.snapshot = function () {
    var out = new Float32Array(this.count * this.width), w = this.width;
    var start = (this.head - this.count + this.cap) % this.cap;
    for (var i = 0; i < this.count; i++) {
      var src = ((start + i) % this.cap) * w;
      out.set(this.buf.subarray(src, src + w), i * w);
    }
    return { frames: out, count: this.count, width: w };
  };
  Ring.prototype.reset = function () { this.count = 0; this.head = 0; };

  AZL.Codec = Codec; AZL.Ring = Ring;
})(typeof self !== 'undefined' ? self : globalThis);
