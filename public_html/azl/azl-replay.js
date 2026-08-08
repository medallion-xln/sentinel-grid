/* AZL Replay store (IndexedDB) + outcome attachment + sample priority + PHP sync.
 * Log once, train every expert from the same canonical event.
 * Temporal sequences are NOT duplicated per tuple: reconstructed by (sessionId, tick)
 * ordering over stored base vectors. Node-safe: pure logic (priority, outcome math,
 * sequence reconstruction) is exposed without IndexedDB so it can be unit tested. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;
  var R = AZL.Replay = {};

  /* ---------- pure logic (unit-testable, no browser APIs) ---------- */
  R.computePriority = function (t) {
    var P = C.PRIORITY, p = t.source === 'selfplay' ? P.selfPlayBase : 1.0;
    var followed = t.followedAdvisor, won = (t.outcomes && t.outcomes.session != null) ? t.outcomes.session > 0 : null;
    if (won !== null) {
      if (!followed && won) p *= P.overrideAndWin;
      else if (followed && !won) p *= P.followAndLose;
      else if (!followed && !won) p *= P.overrideAndLose;
      else p *= P.followAndWin;
    }
    if (t.confidentWrong) p *= P.confidentWrongBonus;
    if ((t.novelty || 0) > 0.7) p *= P.noveltyBonus;
    if ((t.disagreement || 0) > 0.5) p *= P.disagreementBonus;
    return p;
  };
  R.outcomeCompleteness = function (o) {
    var n = 0, tot = 4;
    if (o.now != null) n++; if (o.m5 != null) n++; if (o.m30 != null) n++; if (o.session != null) n++;
    return n / tot;
  };
  /* reconstruct last <=RING_SIZE base vectors ending at tuple tick from a session's
   * tuples (sorted asc by tick). Returns {frames,count,width} like Ring.snapshot. */
  R.reconstructSequence = function (sessionTuples, endTick, width) {
    var frames = [], i;
    for (i = 0; i < sessionTuples.length; i++) {
      var t = sessionTuples[i];
      if (t.tick <= endTick) frames.push(t.baseVec);
    }
    if (frames.length > C.RING_SIZE) frames = frames.slice(frames.length - C.RING_SIZE);
    var out = new Float32Array(frames.length * width);
    for (i = 0; i < frames.length; i++) out.set(frames[i], i * width);
    return { frames: out, count: frames.length, width: width };
  };
  R.makeTuple = function (o) { // canonical tuple shape (documented in ARCHITECTURE.md)
    return {
      tupleId: o.tupleId || U.uuid(), sessionId: o.sessionId,
      schemaV: C.STATE_SCHEMA_V, actionV: C.ACTION_SPACE_V, gameV: o.gameV | 0,
      stateHash: o.stateHash >>> 0, tick: o.tick | 0, ts: Date.now(),
      baseVec: o.baseVec,                    // Float32Array(baseLen) - canonical snapshot
      mask: o.mask,                          // Uint8Array(A)
      scoutPolicy: o.scoutPolicy || null, strategistPolicy: o.strategistPolicy || null,
      mctsVisits: o.mctsVisits || null, mctsRootValue: o.mctsRootValue != null ? o.mctsRootValue : null,
      routerWeights: o.routerWeights || null,
      recommendedAction: o.recommendedAction, playerAction: o.playerAction != null ? o.playerAction : null,
      followedAdvisor: o.followedAdvisor != null ? o.followedAdvisor : null,
      autonomous: !!o.autonomous, reactionMs: o.reactionMs || null,
      outcomes: { now: o.nowHealth != null ? o.nowHealth : null, m5: null, m30: null, session: null },
      terminal: null, scoreDelta: null,
      skillBucket: o.skillBucket || null, scenario: o.scenario || null,
      source: o.source || 'player', novelty: o.novelty || 0, surprise: o.surprise || 0,
      confidentWrong: false, disagreement: o.disagreement || 0,
      completeness: 0, priority: 1,
      modelVersions: o.modelVersions || {}
    };
  };
  /* attach horizon outcomes: called with the session's current tick+health; resolves
   * any tuple whose (tick + horizon) <= nowTick. Mutates tuples, returns changed ones. */
  R.resolveOutcomes = function (pending, nowTick, nowHealth) {
    var H = C.OUTCOME_HORIZONS, changed = [];
    for (var i = 0; i < pending.length; i++) {
      var t = pending[i], ch = false;
      if (t.outcomes.m5 == null && nowTick >= t.tick + H.m5Ticks) { t.outcomes.m5 = nowHealth; ch = true; }
      if (t.outcomes.m30 == null && nowTick >= t.tick + H.m30Ticks) { t.outcomes.m30 = nowHealth; ch = true; }
      if (ch) { t.completeness = R.outcomeCompleteness(t.outcomes); t.priority = R.computePriority(t); changed.push(t); }
    }
    return changed;
  };
  R.finalizeSession = function (tuples, terminalValue) {
    for (var i = 0; i < tuples.length; i++) {
      var t = tuples[i];
      t.outcomes.session = terminalValue; t.terminal = terminalValue;
      if (t.outcomes.m5 == null) t.outcomes.m5 = terminalValue;   // truncated horizon -> session result
      if (t.outcomes.m30 == null) t.outcomes.m30 = terminalValue;
      if (t.mctsRootValue != null && t.routerWeights) {
        var conf = t.routerWeights.strategistWeight || 0;
        t.confidentWrong = conf > 0.25 && ((t.mctsRootValue > 0.3 && terminalValue < 0) || (t.mctsRootValue < -0.3 && terminalValue > 0));
      }
      t.completeness = R.outcomeCompleteness(t.outcomes);
      t.priority = R.computePriority(t);
    }
    return tuples;
  };

  /* ---------- IndexedDB store (browser only) ---------- */
  var DB_NAME = 'azl-replay', DB_V = 1;
  function Store() { this.db = null; this._sessionCounts = {}; }
  Store.prototype.open = function () {
    var self2 = this;
    return new Promise(function (res, rej) {
      if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB unavailable'));
      var rq = indexedDB.open(DB_NAME, DB_V);
      rq.onupgradeneeded = function (e) {
        var db = e.target.result;
        var t = db.createObjectStore('tuples', { keyPath: 'tupleId' });
        t.createIndex('bySession', 'sessionId'); t.createIndex('bySessionTick', ['sessionId', 'tick']);
        t.createIndex('bySynced', 'synced'); t.createIndex('byHash', 'stateHash');
        db.createObjectStore('sessions', { keyPath: 'sessionId' });
        db.createObjectStore('meta', { keyPath: 'k' });
        db.createObjectStore('weightsCache', { keyPath: 'k' });
      };
      rq.onsuccess = function (e) { self2.db = e.target.result; res(self2); };
      rq.onerror = function () { rej(rq.error); };
    });
  };
  Store.prototype._tx = function (store, mode) { return this.db.transaction(store, mode).objectStore(store); };
  Store.prototype.put = function (store, obj) {
    var os = this._tx(store, 'readwrite');
    return new Promise(function (res, rej) { var r = os.put(obj); r.onsuccess = function () { res(true); }; r.onerror = function () { rej(r.error); }; });
  };
  Store.prototype.get = function (store, key) {
    var os = this._tx(store, 'readonly');
    return new Promise(function (res, rej) { var r = os.get(key); r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { rej(r.error); }; });
  };
  Store.prototype.addTuple = function (t) {
    var cap = C.PRIORITY.perSessionCap;
    var c = this._sessionCounts[t.sessionId] || 0;
    if (c >= cap) return Promise.resolve(false); // correlated-sample cap
    this._sessionCounts[t.sessionId] = c + 1;
    t.synced = 0;
    // serialize typed arrays for structured clone stability
    return this.put('tuples', t);
  };
  Store.prototype.sessionTuples = function (sessionId) {
    var os = this._tx('tuples', 'readonly'), idx = os.index('bySession');
    return new Promise(function (res, rej) {
      var out = [], r = idx.openCursor(IDBKeyRange.only(sessionId));
      r.onsuccess = function (e) { var cur = e.target.result; if (cur) { out.push(cur.value); cur.continue(); } else { out.sort(function (a, b) { return a.tick - b.tick; }); res(out); } };
      r.onerror = function () { rej(r.error); };
    });
  };
  Store.prototype.updateTuples = function (tuples) {
    var os = this._tx('tuples', 'readwrite');
    return new Promise(function (res, rej) {
      var n = tuples.length; if (!n) return res(0);
      var done = 0;
      for (var i = 0; i < n; i++) { var r = os.put(tuples[i]); r.onsuccess = function () { if (++done === n) res(n); }; r.onerror = function () { rej(r.error); }; }
    });
  };
  /* priority-weighted sample of training tuples (weighted reservoir, A-Res). */
  Store.prototype.sample = function (k, filter) {
    var os = this._tx('tuples', 'readonly');
    return new Promise(function (res, rej) {
      var heap = []; // [key, tuple] smallest key first (linear ok for small k)
      var r = os.openCursor();
      r.onsuccess = function (e) {
        var cur = e.target.result;
        if (!cur) { heap.sort(function (a, b) { return b[0] - a[0]; }); res(heap.map(function (h) { return h[1]; })); return; }
        var t = cur.value;
        if (!filter || filter(t)) {
          var w = Math.max(1e-6, t.priority || 1);
          var key = Math.pow(Math.random(), 1 / w);
          if (heap.length < k) heap.push([key, t]);
          else { var mi = 0; for (var i = 1; i < heap.length; i++) if (heap[i][0] < heap[mi][0]) mi = i; if (key > heap[mi][0]) heap[mi] = [key, t]; }
        }
        cur.continue();
      };
      r.onerror = function () { rej(r.error); };
    });
  };
  Store.prototype.unsynced = function (limit) {
    var os = this._tx('tuples', 'readonly'), idx = os.index('bySynced');
    return new Promise(function (res, rej) {
      var out = [], r = idx.openCursor(IDBKeyRange.only(0));
      r.onsuccess = function (e) { var cur = e.target.result; if (cur && out.length < limit) { out.push(cur.value); cur.continue(); } else res(out); };
      r.onerror = function () { rej(r.error); };
    });
  };
  Store.prototype.countByHash = function (hash) {
    var os = this._tx('tuples', 'readonly'), idx = os.index('byHash');
    return new Promise(function (res) { var r = idx.count(IDBKeyRange.only(hash)); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(0); }; });
  };
  R.Store = Store;

  /* ---------- server sync ---------- */
  function packTuple(t) { // JSON-safe wire form (typed arrays -> plain arrays, rounded)
    var rd = function (a, dp) { if (!a) return null; var o = new Array(a.length); var m = Math.pow(10, dp); for (var i = 0; i < a.length; i++) o[i] = Math.round(a[i] * m) / m; return o; };
    return {
      tupleId: t.tupleId, sessionId: t.sessionId, schemaV: t.schemaV, actionV: t.actionV, gameV: t.gameV,
      stateHash: t.stateHash, tick: t.tick, ts: t.ts,
      baseVec: rd(t.baseVec, 4), mask: t.mask ? Array.from(t.mask) : null,
      scoutPolicy: rd(t.scoutPolicy, 4), strategistPolicy: rd(t.strategistPolicy, 4),
      mctsVisits: t.mctsVisits ? Array.from(t.mctsVisits) : null, mctsRootValue: t.mctsRootValue,
      routerWeights: t.routerWeights, recommendedAction: t.recommendedAction, playerAction: t.playerAction,
      followedAdvisor: t.followedAdvisor, autonomous: t.autonomous, reactionMs: t.reactionMs,
      outcomes: t.outcomes, terminal: t.terminal, skillBucket: t.skillBucket, scenario: t.scenario,
      source: t.source, novelty: t.novelty, surprise: t.surprise, confidentWrong: t.confidentWrong,
      disagreement: t.disagreement, completeness: t.completeness, priority: t.priority, modelVersions: t.modelVersions
    };
  }
  R.sync = function (store, clientId, csrf) {
    return store.unsynced(C.SYNC.replayBatch).then(function (tuples) {
      if (!tuples.length) return { uploaded: 0 };
      var body = { clientId: clientId, tuples: tuples.map(packTuple) };
      return fetch(C.API_BASE + '/index.php?action=replay', {
        method: 'POST', credentials: 'same-origin',
        headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.ok) throw new Error(j.error && j.error.code || 'replay-sync-failed');
        for (var i = 0; i < tuples.length; i++) tuples[i].synced = 1;
        return store.updateTuples(tuples).then(function () { return { uploaded: tuples.length }; });
      });
    });
  };
})(typeof self !== 'undefined' ? self : globalThis);
