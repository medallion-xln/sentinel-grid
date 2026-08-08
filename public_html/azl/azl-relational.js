/* AZL Relational specialist.
 * IMPLEMENTATION STATUS (honest label): DETERMINISTIC RELATIONAL ENCODER, model-ready
 * interface preserved for a trainable GNN/entity-transformer. isLearned=false in
 * metadata. Runs periodically or on topology-changing events; NEVER inside MCTS
 * simulations. Output: fixed 16-float embedding + auxiliary predictions (threatened
 * entities, bottlenecks, isolation, dependency failures).
 *
 * Graph: entities from codec (stable-sorted). Edges by distance threshold plus
 * adapter-declared dependency links. Two rounds of mean message passing over scalar
 * node features (deterministic, no learned weights). */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;

  function Relational(codec, adapter) {
    this.codec = codec;
    this.distThresh = (adapter.relational && adapter.relational.distThresh) || 8;
    this.embedding = new Float32Array(C.RELATIONAL_EMB);
    this.aux = { threatened: [], bottlenecks: [], isolated: [], depFailures: [] };
    this.lastUpdate = 0; this.available = false;
  }
  Relational.prototype.update = function (entities) {
    var n = entities.length, e = this.embedding, i, j;
    e.fill(0); this.aux.threatened.length = 0; this.aux.bottlenecks.length = 0; this.aux.isolated.length = 0; this.aux.depFailures.length = 0;
    if (!n) { this.available = true; this.lastUpdate = U.now(); return { embedding: e, aux: this.aux }; }
    // adjacency by distance + declared deps
    var deg = new Int16Array(n), threat = new Float32Array(n), depOk = new Float32Array(n);
    var nbr = new Array(n); for (i = 0; i < n; i++) nbr[i] = [];
    var idIdx = {}; for (i = 0; i < n; i++) idIdx[entities[i].id] = i;
    var d2t = this.distThresh * this.distThresh;
    for (i = 0; i < n; i++) {
      var a = entities[i];
      threat[i] = a.threat || 0;
      depOk[i] = 1;
      for (j = i + 1; j < n; j++) {
        var b = entities[j], dx = (a.x || 0) - (b.x || 0), dy = (a.y || 0) - (b.y || 0);
        if (dx * dx + dy * dy <= d2t) { nbr[i].push(j); nbr[j].push(i); deg[i]++; deg[j]++; }
      }
      if (a.deps) for (var d = 0; d < a.deps.length; d++) {
        var t = idIdx[a.deps[d]];
        if (t == null) { depOk[i] = 0; this.aux.depFailures.push(a.id); }
        else { if (nbr[i].indexOf(t) < 0) { nbr[i].push(t); nbr[t].push(i); deg[i]++; deg[t]++; } }
      }
    }
    // 2 rounds mean message passing over [threat, depOk, isFriendly]
    var f0 = new Float32Array(n * 3), f1 = new Float32Array(n * 3);
    for (i = 0; i < n; i++) { f0[i * 3] = threat[i]; f0[i * 3 + 1] = depOk[i]; f0[i * 3 + 2] = entities[i].hostile ? -1 : 1; }
    var cur = f0, nxt = f1;
    for (var r = 0; r < 2; r++) {
      for (i = 0; i < n; i++) {
        var s0 = cur[i * 3], s1 = cur[i * 3 + 1], s2 = cur[i * 3 + 2], m = nbr[i].length;
        for (j = 0; j < m; j++) { var k = nbr[i][j]; s0 += cur[k * 3]; s1 += cur[k * 3 + 1]; s2 += cur[k * 3 + 2]; }
        var inv = 1 / (m + 1);
        nxt[i * 3] = s0 * inv; nxt[i * 3 + 1] = s1 * inv; nxt[i * 3 + 2] = s2 * inv;
      }
      var tmp = cur; cur = nxt; nxt = tmp;
    }
    // aggregate embedding (16): global stats + per-type pooled pressure
    var friendly = 0, hostile = 0, isoCount = 0, maxThreatExp = 0, avgDepOk = 0, avgDeg = 0;
    var typePress = {}; // top-3 types by count
    for (i = 0; i < n; i++) {
      var ent = entities[i], exp2 = cur[i * 3]; // propagated threat exposure
      if (ent.hostile) hostile++; else friendly++;
      if (deg[i] === 0 && !ent.hostile) { isoCount++; this.aux.isolated.push(ent.id); }
      if (!ent.hostile && exp2 > 0.35) this.aux.threatened.push({ id: ent.id, exposure: exp2 });
      if (!ent.hostile && deg[i] >= 3 && (ent.critical || exp2 > 0.3)) this.aux.bottlenecks.push(ent.id);
      if (exp2 > maxThreatExp) maxThreatExp = exp2;
      avgDepOk += cur[i * 3 + 1]; avgDeg += deg[i];
      typePress[ent.type] = (typePress[ent.type] || 0) + exp2;
    }
    this.aux.threatened.sort(function (a, b) { return b.exposure - a.exposure; });
    if (this.aux.threatened.length > 8) this.aux.threatened.length = 8;
    avgDepOk /= n; avgDeg /= n;
    var types = Object.keys(typePress).sort();
    var k2 = 0;
    e[k2++] = Math.tanh(n / 32); e[k2++] = Math.tanh(friendly / 24); e[k2++] = Math.tanh(hostile / 12);
    e[k2++] = Math.tanh(avgDeg / 4); e[k2++] = Math.tanh(isoCount / 6); e[k2++] = U.clamp(maxThreatExp, -1, 1);
    e[k2++] = U.clamp(avgDepOk * 2 - 1, -1, 1); e[k2++] = Math.tanh(this.aux.bottlenecks.length / 4);
    for (i = 0; i < 4; i++) e[k2++] = i < types.length ? Math.tanh(typePress[types[i]] / 4) : 0;
    e[k2++] = Math.tanh(this.aux.depFailures.length / 3);
    e[k2++] = Math.tanh(this.aux.threatened.length / 6);
    e[k2++] = hostile > 0 ? Math.tanh(friendly / (hostile + 1) - 1) : 1;
    e[k2++] = 0; // reserved
    this.lastUpdate = U.now(); this.available = true;
    return { embedding: e, aux: this.aux };
  };
  Relational.prototype.stalenessMs = function () { return this.available ? (U.now() - this.lastUpdate) : Infinity; };
  Relational.prototype.getManifest = function () { return { name: 'relational', kind: 'deterministic-baseline', isLearned: false, version: 1 }; };
  Relational.prototype.predict = function () {
    return { policy: null, values: { now: null, m5: null, m30: null, session: null }, uncertainty: this.available ? 0.5 : null, embedding: this.embedding, metadata: this.getManifest() };
  };
  AZL.Relational = Relational;
})(typeof self !== 'undefined' ? self : globalThis);
