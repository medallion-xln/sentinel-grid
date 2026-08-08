/* AZL Advisor - main-thread orchestrator.
 * Responsibilities: worker lifecycle, decision requests + presentation callbacks,
 * replay tuple logging, delayed outcome attachment, session lifecycle, federated
 * sync loops, governor wiring, graceful degradation (Levels 0-4), diagnostics.
 * The advisor NEVER parses raw game state itself (codec lives in the worker); the
 * main thread only captures adapter snapshots and presents results.
 *
 * Usage:
 *   AZL.Advisor.init({ adapterUrl:'/azl/azl-ref-adapter.js', adapter: liveAdapter,
 *     csrf: window.MEDALLION_CSRF || null, onRecommendation: fn, onDiagnostics: fn })
 *   .then(adv => { adv.startSession(); setInterval(()=>adv.observe(), 1000); ...
 *     adv.decide().then(d => render(d));
 *     adv.recordPlayerAction(actionId); ... adv.endSession(terminalValue); }) */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util, R = AZL.Replay;

  function Advisor(opts) {
    this.opts = opts;
    this.adapter = opts.adapter;             // live adapter (captureSearchState on main thread)
    this.adapterUrl = opts.adapterUrl;
    this.csrf = opts.csrf || null;
    this.store = null; this.clientId = null;
    this.worker = null; this.trainWorker = null;
    this.governor = new AZL.Governor();
    this.level = 3;                          // until worker ready: heuristic fallback
    this.ready = false; this._reqId = 0; this._pending = {};
    this.sessionId = null; this.sessionTuples = [];
    this.lastDecision = null; this._lastDecisionAt = 0;
    this.manifest = null; this.validatedSamples = 0;
    this._workerRestarts = 0;
    this.diag = { level: 3, versions: {}, lastMcts: null, routerWeights: null, replayQueue: 0, training: 'idle', pendingSync: 0, lastAggregation: null, expertFreshness: {} };
  }

  Advisor.prototype._workerUrl = function (name) { return C.BASE + '/workers/' + name + '?v=' + (this.opts.v || C.STATE_SCHEMA_V); };

  Advisor.prototype.init = function () {
    var self2 = this;
    this.governor.start();
    var storeP = (typeof indexedDB !== 'undefined') ? new R.Store().open().catch(function () { return null; }) : Promise.resolve(null);
    return storeP.then(function (store) {
      self2.store = store;
      return store ? AZL.Fed.getClientId(store) : Promise.resolve(U.uuid());
    }).then(function (cid) {
      self2.clientId = cid;
      return self2._refreshManifest();
    }).then(function () {
      return self2._loadWeights();
    }).then(function (weights) {
      return self2._startMctsWorker(weights);
    }).then(function () {
      self2._startTrainingWorker();
      self2._loops();
      return self2;
    }).catch(function (e) {
      // Level 3/4 operation without workers/server - advisor still answers
      self2._log('init degraded: ' + (e && e.message));
      self2.level = 3; self2.diag.level = 3;
      return self2;
    });
  };
  Advisor.prototype._refreshManifest = function () {
    var self2 = this;
    return AZL.Fed.fetchManifest(this.clientId).then(function (m) {
      self2.manifest = m;
      self2.validatedSamples = (m && m.stats && m.stats.validatedSamples) || 0;
      if (m && m.aggregation) self2.diag.lastAggregation = m.aggregation;
    }).catch(function () { self2.manifest = null; });
  };
  Advisor.prototype._loadWeights = function () {
    var self2 = this, out = { scout: null, strategist: null };
    if (!this.store) return Promise.resolve(out);
    return AZL.Fed.loadModel(this.store, 'scout', this.clientId, this.manifest).then(function (s) {
      out.scout = s;
      return AZL.Fed.loadModel(self2.store, 'strategist', self2.clientId, self2.manifest);
    }).then(function (st) { out.strategist = st; return out; }).catch(function () { return out; });
  };
  Advisor.prototype._startMctsWorker = function (weights) {
    var self2 = this;
    return new Promise(function (res, rej) {
      if (typeof Worker === 'undefined') return rej(new Error('workers-unavailable'));
      var w;
      try { w = new Worker(self2._workerUrl('azl-mcts.worker.js')); } catch (e) { return rej(e); }
      self2.worker = w;
      var t = setTimeout(function () { rej(new Error('worker-init-timeout')); }, 30000);
      w.onmessage = function (ev) {
        var msg = ev.data || {};
        if (msg.type === 'ready') {
          clearTimeout(t);
          self2.ready = true; self2.level = msg.level != null ? msg.level : 0;
          self2.diag.level = self2.level; self2.diag.versions = msg.versions || {};
          res(true);
        } else if (msg.type === 'decision') {
          var cb = self2._pending[msg.requestId]; delete self2._pending[msg.requestId];
          if (cb) cb.resolve(msg.payload);
        } else if (msg.type === 'error') {
          var cb2 = self2._pending[msg.requestId]; delete self2._pending[msg.requestId];
          if (cb2) cb2.reject(new Error(msg.error));
        } else if (msg.type === 'freshness') {
          self2.diag.expertFreshness = msg.data || {};
        }
      };
      w.onerror = function (e) {
        self2._log('mcts worker error: ' + (e && e.message));
        self2._restartWorker();
      };
      var gs = self2.governor.state();
      w.postMessage({
        type: 'init', base: C.BASE, adapterUrl: self2.adapterUrl, config: self2.opts.configOverride || null,
        tier: gs.tier,
        scout: weights.scout ? { bytes: weights.scout.bytes, meta: weights.scout.meta } : null,
        strategist: weights.strategist ? { bytes: weights.strategist.bytes, meta: weights.strategist.meta } : null
      });
    });
  };
  Advisor.prototype._restartWorker = function () {
    var self2 = this;
    this.ready = false; this.level = 3; this.diag.level = 3;
    for (var k in this._pending) { this._pending[k].reject(new Error('worker-crashed')); }
    this._pending = {};
    try { if (this.worker) this.worker.terminate(); } catch (e) {}
    this.worker = null;
    if (this._workerRestarts++ < 3) {
      this._loadWeights().then(function (w) { return self2._startMctsWorker(w); }).catch(function () {});
    }
  };
  Advisor.prototype._startTrainingWorker = function () {
    var self2 = this;
    if (typeof Worker === 'undefined') return;
    try {
      var tw = this.trainWorker = new Worker(this._workerUrl('azl-training.worker.js'));
      tw.onmessage = function (ev) {
        var m = ev.data || {};
        if (m.type === 'status') self2.diag.training = m.status;
        if (m.type === 'validatedSamples') self2.validatedSamples = m.count;
      };
      tw.onerror = function () { self2.diag.training = 'crashed'; };
      tw.postMessage({ type: 'init', base: C.BASE, adapterUrl: this.adapterUrl, apiBase: C.API_BASE, csrf: this.csrf, clientId: this.clientId });
      this.governor.subscribe(function (gs) {
        tw.postMessage({ type: 'governor', trainingAllowed: gs.trainingAllowed, selfPlayAllowed: gs.selfPlayAllowed, tier: gs.tier });
        if (self2.worker && self2.ready) self2.worker.postMessage({ type: 'budget', tier: gs.tier, unloadStrategist: gs.unloadStrategist, specialistRefreshMs: gs.specialistRefreshMs });
      });
    } catch (e) { this.trainWorker = null; }
  };
  Advisor.prototype._loops = function () {
    var self2 = this;
    this._syncTimer = setInterval(function () {
      if (!self2.store) return;
      AZL.Replay.sync(self2.store, self2.clientId, self2.csrf).then(function (r) {
        self2.diag.pendingSync = Math.max(0, self2.diag.pendingSync - (r.uploaded || 0));
      }).catch(function () {});
      AZL.Fed.heartbeat(self2.clientId, { tier: self2.governor.state().tier, versions: self2.diag.versions, level: self2.level }, self2.csrf);
    }, C.SYNC.flushMs);
    this._manifestTimer = setInterval(function () { self2._refreshManifest(); }, 5 * 60 * 1000);
  };

  /* Feed real timeline states to the worker ring (Oracle/Relational refresh). ~1/s. */
  Advisor.prototype.observe = function () {
    if (!this.ready || !this.worker) return;
    var st = this.adapter.captureSearchState();
    if (!st) return;
    this.worker.postMessage({ type: 'observe', state: st });
  };

  /* Request a decision. Returns Promise<decisionPayload>. */
  Advisor.prototype.decide = function (opts) {
    var self2 = this;
    opts = opts || {};
    var st = this.adapter.captureSearchState();
    if (!st) return Promise.reject(new Error('no-state'));
    if (!this.ready || !this.worker) return Promise.resolve(this._fallbackDecision(st));
    var gs = this.governor.state();
    var id = ++this._reqId;
    var noveltyP = this.store ? this.store.countByHash(this._lastHash || 0).then(function (c) { return c === 0 ? 1 : 1 / (1 + c); }).catch(function () { return 0.5; }) : Promise.resolve(0.5);
    return noveltyP.then(function (nov) {
      return new Promise(function (res, rej) {
        self2._pending[id] = { resolve: res, reject: rej };
        var timeout = setTimeout(function () {
          if (self2._pending[id]) { delete self2._pending[id]; res(self2._fallbackDecision(st)); }
        }, (gs.mctsBudget.ms + 400) * 3);
        var wrap = self2._pending[id];
        self2._pending[id] = {
          resolve: function (p) { clearTimeout(timeout); wrap.resolve(p); },
          reject: function (e) { clearTimeout(timeout); wrap.resolve(self2._fallbackDecision(st)); void e; }
        };
        self2.worker.postMessage({
          type: 'decide', requestId: id, state: st, mode: 'advise',
          budget: opts.budget || gs.mctsBudget, novelty: nov,
          validatedSamples: self2.validatedSamples, criticality: opts.criticality
        });
      });
    }).then(function (payload) {
      self2.level = payload.level; self2.diag.level = payload.level;
      self2.diag.lastMcts = payload.mcts ? payload.mcts.diag : null;
      self2.diag.routerWeights = payload.weights || null;
      self2._lastHash = payload.stateHash;
      self2.lastDecision = payload; self2._lastDecisionAt = Date.now();
      if (self2.opts.onRecommendation) { try { self2.opts.onRecommendation(payload); } catch (e) {} }
      return payload;
    });
  };
  /* Level 3/4 local fallback when workers or models are unavailable. */
  Advisor.prototype._fallbackDecision = function (st) {
    var ad = this.adapter, A = ad.actions.length;
    var mask = new Uint8Array(A); ad.sim.legalMask(st, mask);
    var pol = new Float32Array(A), level = 4, idx = ad.safeActionIndex | 0;
    if (ad.sim.actionScores) {
      var sc = new Float32Array(A); ad.sim.actionScores(st, sc);
      if (U.maskedSoftmax(sc, mask, pol, 0.5)) { level = 3; idx = U.argmax(pol, mask); }
    }
    if (level === 4) { if (!mask[idx]) { for (var i = 0; i < A; i++) if (mask[i]) { idx = i; break; } } pol.fill(0); pol[idx] = 1; }
    var hv = ad.sim.heuristicValue ? ad.sim.heuristicValue(st) : 0;
    this.level = level; this.diag.level = level;
    var p = { actionIdx: idx, policy: pol, rootValue: hv, forecast: { now: hv, m5: null, m30: null, session: null, confidence: null }, weights: null, level: level, mcts: null, scoutRoot: null, strategist: null, oracle: null, base: null, enrichExtra: null, stateHash: 0, tick: ad.sim.tick(st), heuristicValue: hv };
    this.lastDecision = p; this._lastDecisionAt = Date.now();
    return p;
  };

  Advisor.prototype.startSession = function (meta) {
    this.sessionId = U.uuid(); this.sessionTuples = [];
    this.sessionMeta = meta || {};
    if (this.worker && this.ready) this.worker.postMessage({ type: 'resetRing' });
    return this.sessionId;
  };
  /* Log the player's (or autonomous) action against the last decision. */
  Advisor.prototype.recordPlayerAction = function (actionId, opts) {
    if (!this.lastDecision || !this.sessionId) return null;
    opts = opts || {};
    var d = this.lastDecision;
    var disagree = 0;
    if (d.mcts && d.strategist) { // L1 distance between root policies
      for (var i = 0; i < d.policy.length; i++) disagree += Math.abs((d.mcts.policy[i] || 0) - (d.strategist.policy[i] || 0));
      disagree *= 0.5;
    }
    var t = R.makeTuple({
      sessionId: this.sessionId, gameV: this.adapter.version, stateHash: d.stateHash, tick: d.tick,
      baseVec: d.base ? new Float32Array(d.base) : new Float32Array(0), mask: d.mcts ? d.mcts.mask : null,
      scoutPolicy: d.scoutRoot ? new Float32Array(d.scoutRoot.policy) : null,
      strategistPolicy: d.strategist ? new Float32Array(d.strategist.policy) : null,
      mctsVisits: d.mcts ? new Float32Array(d.mcts.visits) : null,
      mctsRootValue: d.rootValue, routerWeights: d.weights,
      recommendedAction: d.actionIdx, playerAction: actionId,
      followedAdvisor: actionId === d.actionIdx, autonomous: !!opts.autonomous,
      reactionMs: this._lastDecisionAt ? Date.now() - this._lastDecisionAt : null,
      nowHealth: d.heuristicValue, skillBucket: this.opts.skillBucket || null,
      scenario: this.sessionMeta.scenario || null, source: opts.autonomous ? 'auto' : 'player',
      novelty: opts.novelty != null ? opts.novelty : 0, disagreement: disagree,
      modelVersions: this.diag.versions
    });
    if (d.enrichExtra) t.enrichExtra = new Float32Array(d.enrichExtra);
    t.priority = R.computePriority(t);
    this.sessionTuples.push(t);
    if (this.store) { this.store.addTuple(t); this.diag.pendingSync++; this.diag.replayQueue = this.sessionTuples.length; }
    return t;
  };
  /* Call periodically with current colony health to resolve +5m/+30m targets. */
  Advisor.prototype.attachOutcomes = function (nowTick, nowHealth) {
    var changed = R.resolveOutcomes(this.sessionTuples, nowTick, nowHealth);
    if (changed.length && this.store) this.store.updateTuples(changed);
    return changed.length;
  };
  Advisor.prototype.endSession = function (terminalValue) {
    if (!this.sessionId) return;
    R.finalizeSession(this.sessionTuples, terminalValue);
    if (this.store) this.store.updateTuples(this.sessionTuples);
    this.sessionId = null; this.sessionTuples = [];
    if (this.trainWorker) this.trainWorker.postMessage({ type: 'trainRound' });
  };
  Advisor.prototype.getDiagnostics = function () {
    var gs = this.governor.state();
    return Object.assign({}, this.diag, { governor: gs, ready: this.ready, clientId: this.clientId });
  };
  Advisor.prototype._log = function (m) { if (C.DIAG.verbose && typeof console !== 'undefined') console.warn('[AZL]', m); };
  Advisor.prototype.dispose = function () {
    this.governor.stop();
    clearInterval(this._syncTimer); clearInterval(this._manifestTimer);
    try { if (this.worker) this.worker.terminate(); } catch (e) {}
    try { if (this.trainWorker) this.trainWorker.terminate(); } catch (e) {}
  };

  AZL.Advisor = {
    init: function (opts) { return new Advisor(opts).init(); },
    _Class: Advisor
  };
})(typeof self !== 'undefined' ? self : globalThis);
