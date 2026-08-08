/* AZL Oracle: temporal specialist.
 * IMPLEMENTATION STATUS (honest label): DETERMINISTIC FIRST IMPLEMENTATION, not a
 * trained temporal network. It fulfills the Oracle contract (16-float trend embedding
 * + 6 alarm probabilities, refresh cadence, staleness, anti-recursion) so a trainable
 * TCN can be dropped in behind the same interface once real outcome-labeled sequences
 * exist. isLearned=false is reported in metadata; nothing downstream may claim
 * otherwise.
 *
 * Anti-recursion rule: consumes the ring of BASE vectors only (never Oracle-enriched
 * vectors). Runs ~1/s, on meaningful state change, or after critical events.
 *
 * Method: per adapter-declared feature group, ordinary least-squares slope over the
 * window, second-difference acceleration, and volatility; squashed via tanh into the
 * embedding. Alarms are logistic transforms of group slopes/levels with hysteresis. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;
  var ALARM_KEYS = AZL.ORACLE_ALARM_KEYS = ['resourceCollapse', 'threatAcceleration', 'populationInstability', 'constructionDeadlock', 'mobilityDeadlock', 'irreversibleFailure'];

  function Oracle(codec, adapter) {
    this.codec = codec;
    // adapter.oracleGroups: { resources:[idx..], threat:[..], population:[..], construction:[..], mobility:[..], health:[..] }
    this.groups = adapter.oracleGroups || autoGroups(codec.baseLen);
    this.embedding = new Float32Array(C.ORACLE_EMB);
    this.alarms = new Float32Array(C.ORACLE_ALARMS);
    this.lastUpdate = 0; this.updatedTick = -1; this.available = false;
    this._prevAlarms = new Float32Array(C.ORACLE_ALARMS);
  }
  function autoGroups(n) { // fallback: quintile grouping, documented as low-signal
    var q = Math.max(1, Math.floor(n / 6)), gsp = {}, keys = ['resources', 'threat', 'population', 'construction', 'mobility', 'health'];
    for (var k = 0; k < 6; k++) { var a = []; for (var i = k * q; i < Math.min(n, (k + 1) * q); i++) a.push(i); gsp[keys[k]] = a; }
    return gsp;
  }
  function stats(frames, count, width, idxs) {
    // mean series over group idxs, then slope (OLS), accel (2nd diff mean), vol (std of diffs), level (last)
    if (count < 3 || !idxs.length) return { slope: 0, accel: 0, vol: 0, level: 0 };
    var y = new Float64Array(count), t, i;
    for (t = 0; t < count; t++) { var s = 0; for (i = 0; i < idxs.length; i++) s += frames[t * width + idxs[i]]; y[t] = s / idxs.length; }
    var mx = (count - 1) / 2, my = 0; for (t = 0; t < count; t++) my += y[t]; my /= count;
    var num = 0, den = 0; for (t = 0; t < count; t++) { num += (t - mx) * (y[t] - my); den += (t - mx) * (t - mx); }
    var slope = den > 0 ? num / den : 0;
    var acc = 0, vol = 0, dPrev = null, nd = 0;
    for (t = 1; t < count; t++) { var d = y[t] - y[t - 1]; vol += d * d; if (dPrev != null) { acc += d - dPrev; nd++; } dPrev = d; }
    vol = Math.sqrt(vol / (count - 1));
    acc = nd ? acc / nd : 0;
    return { slope: slope, accel: acc, vol: vol, level: y[count - 1] };
  }
  var GK = ['resources', 'threat', 'population', 'construction', 'mobility', 'health'];
  Oracle.prototype.update = function (ringSnap, tick) {
    var f = ringSnap.frames, cnt = ringSnap.count, w = ringSnap.width;
    if (cnt < 3) { this.available = false; return null; }
    var e = this.embedding, gi = 0, S = {};
    for (var k = 0; k < GK.length; k++) S[GK[k]] = stats(f, cnt, w, this.groups[GK[k]] || []);
    // embedding: [slope,accel] per group (12) + [vol resources, vol threat, level health, count/cap] = 16
    for (var k2 = 0; k2 < GK.length; k2++) { e[gi++] = Math.tanh(S[GK[k2]].slope * 40); e[gi++] = Math.tanh(S[GK[k2]].accel * 80); }
    e[gi++] = Math.tanh(S.resources.vol * 20);
    e[gi++] = Math.tanh(S.threat.vol * 20);
    e[gi++] = U.clamp(S.health.level, -1, 1);
    e[gi++] = cnt / this.codec.ring.cap;
    // alarms via logistic on directional evidence, with hysteresis (0.1 stickiness)
    var a = this.alarms, sig = function (x) { return 1 / (1 + Math.exp(-x)); };
    var raw = [
      sig(-S.resources.slope * 60 - S.resources.level * 1.5),                 // resource collapse
      sig(S.threat.slope * 60 + S.threat.accel * 120),                        // threat acceleration
      sig(-S.population.slope * 60 + S.population.vol * 10 - S.population.level), // population instability
      sig(-Math.abs(S.construction.slope) * 80 + 2 - 4 * Math.max(0, S.construction.level + 0.5)), // construction deadlock (stalled + low)
      sig(-S.mobility.level * 2 - S.mobility.slope * 40),                     // mobility deadlock
      sig(-S.health.slope * 50 - S.health.level * 2 + S.threat.level * 1.5)   // irreversible failure risk
    ];
    for (var j = 0; j < 6; j++) { a[j] = 0.85 * raw[j] + 0.15 * this._prevAlarms[j]; this._prevAlarms[j] = a[j]; }
    this.lastUpdate = U.now(); this.updatedTick = tick; this.available = true;
    return { embedding: e, alarms: a };
  };
  Oracle.prototype.stalenessMs = function () { return this.available ? (U.now() - this.lastUpdate) : Infinity; };
  Oracle.prototype.getManifest = function () { return { name: 'oracle', kind: 'deterministic-baseline', isLearned: false, version: 1 }; };
  Oracle.prototype.predict = function () { // uniform-interface shim (embedding producer)
    return { policy: null, values: { now: null, m5: null, m30: null, session: null }, uncertainty: this.available ? 0.5 : null, embedding: this.embedding, metadata: this.getManifest() };
  };
  AZL.Oracle = Oracle;
})(typeof self !== 'undefined' ? self : globalThis);
