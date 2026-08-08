/* AZL MCTS Worker.
 * Owns: codec (+ ring of REAL states), Scout (in-tree), Strategist (root only),
 * Oracle + Relational caches, Router fusion, PUCT tree with reuse.
 * Message protocol:
 *   init {base, adapterUrl, tier, scout?, strategist?}   -> ready {level, versions}
 *   observe {state}                                       (ring push + specialist refresh)
 *   decide {requestId, state, budget, mode, novelty, validatedSamples, criticality}
 *                                                        -> decision {requestId, payload}
 *   updateWeights {model, bytes, meta}                   -> weightsResult
 *   budget {tier, unloadStrategist, specialistRefreshMs}
 *   resetRing {} | advance {actionId, stateHash}
 * Oracle consumes BASE vectors only (anti-recursion). Specialist embeddings are
 * cached at the root and held constant across the tree, per the expert hierarchy. */
(function () {
  'use strict';
  var ctx = self;
  var A = null, codec = null, scout = null, strategist = null, oracle = null, relational = null;
  var mcts = null, bufs = null, enr = null, rootEnr = null, adapter = null;
  var tier = 'mid', specialistRefreshMs = 1000, strategistLoaded = true;
  var lastOracleAt = 0, lastRelHash = 0, level = 3;

  ctx.onmessage = function (ev) {
    var m = ev.data || {};
    try {
      if (m.type === 'init') return init(m);
      if (m.type === 'observe') return observe(m);
      if (m.type === 'decide') return decide(m);
      if (m.type === 'updateWeights') return updateWeights(m);
      if (m.type === 'budget') return budget(m);
      if (m.type === 'resetRing') { if (codec) codec.ring.reset(); return; }
      if (m.type === 'advance') { if (mcts) mcts.advance(m.actionId, m.stateHash); return; }
    } catch (e) {
      ctx.postMessage({ type: 'error', requestId: m.requestId, error: String(e && e.message || e) });
    }
  };

  function init(m) {
    var base = m.base || '/azl';
    ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js', 'azl-strategist.js',
     'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js', 'azl-weights.js',
     'azl-federated.js'].forEach(function (f) { importScripts(base + '/' + f); });
    importScripts(m.adapterUrl.indexOf('/') === 0 || m.adapterUrl.indexOf('http') === 0 ? m.adapterUrl : base + '/' + m.adapterUrl);
    A = ctx.AZL;
    if (m.config) deepMerge(A.CONFIG, m.config);
    adapter = ctx.AZL_ADAPTER || A.ReferenceAdapter; // real game exports globalThis.AZL_ADAPTER
    codec = new A.Codec(adapter);
    scout = A.makeScout(codec);
    strategist = A.makeStrategist(codec);
    oracle = new A.Oracle(codec, adapter);
    relational = new A.Relational(codec, adapter);
    bufs = A.Router.makeBuffers(codec.A);
    enr = new Float32Array(codec.enrichedLen);
    rootEnr = new Float32Array(codec.enrichedLen);
    tier = m.tier || 'mid';
    var distilled = false;
    var okS = m.scout ? A.Fed.activateRaw(scout, m.scout.bytes, m.scout.meta) : { ok: false };
    if (!okS.ok) { A.distillScout(scout, codec, adapter, { rounds: 14, batch: 40 }); scout.version = 0; distilled = true; }
    var okT = m.strategist ? A.Fed.activateRaw(strategist, m.strategist.bytes, m.strategist.meta) : { ok: false };
    if (!okT.ok) strategist.version = 0;
    var evalFn = function (state) {
      var e = codec.encode(state, false);
      // enrichment inside the tree = base + ROOT-CACHED specialist slots (constant)
      codec.enrich(e.base, oracle.available ? oracle.embedding : null, oracle.available ? oracle.alarms : null, relational.available ? relational.embedding : null, enr);
      var o = scout.forward(enr, e.mask);
      if (!isFinite(o.values.now)) throw new Error('scout-nan');
      return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick };
    };
    evalFn.probe = function (state) { var e = codec.encode(state, false); return { hash: e.hash, tick: e.tick }; };
    mcts = new A.MCTS({ adapter: adapter, codec: codec, evalFn: evalFn, rng: new A.Util.RNG(0xC0FFEE) });
    level = 0;
    ctx.postMessage({
      type: 'ready', level: level, distilled: distilled,
      versions: {
        scout: scout.version, strategist: strategist.version,
        scoutArch: A.Fed.archVersion(scout), strategistArch: A.Fed.archVersion(strategist),
        oracle: oracle.getManifest(), relational: relational.getManifest(),
        adapter: adapter.id + '@' + adapter.version, schema: A.CONFIG.STATE_SCHEMA_V
      }
    });
  }
  function deepMerge(dst, src) { for (var k in src) { if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') deepMerge(dst[k], src[k]); else dst[k] = src[k]; } }

  function refreshSpecialists(state, enc, force) {
    var now = A.Util.now();
    if (force || (now - lastOracleAt) >= specialistRefreshMs) {
      oracle.update(codec.snapshotRing(), enc.tick);
      lastOracleAt = now;
    }
    var ents = codec.entities(state);
    var f = new A.Util.Fnv();
    for (var i = 0; i < ents.length; i++) { var id = ents[i].id; for (var j = 0; j < id.length; j++) f.byte(id.charCodeAt(j)); f.byte(ents[i].hostile ? 1 : 0); }
    var topo = f.done();
    if (force || topo !== lastRelHash) { relational.update(ents); lastRelHash = topo; }
  }

  function observe(m) {
    var enc = codec.encode(m.state, true); // real timeline -> push ring
    refreshSpecialists(m.state, enc, false);
    ctx.postMessage({ type: 'freshness', data: { oracleMs: oracle.stalenessMs(), relationalMs: relational.stalenessMs(), ringCount: codec.ring.count } });
  }

  function decide(m) {
    var t0 = A.Util.now();
    var state = m.state;
    var enc = codec.encode(state, true);
    if (enc.allMasked) {
      return ctx.postMessage({ type: 'decision', requestId: m.requestId, payload: safePayload(state, enc) });
    }
    refreshSpecialists(state, enc, codec.ring.count < 3);
    codec.enrich(enc.base, oracle.available ? oracle.embedding : null, oracle.available ? oracle.alarms : null, relational.available ? relational.embedding : null, rootEnr);
    var payloadLevel = 0, mctsRes = null, scoutRoot = null, stratOut = null;
    // Scout root view (also PUCT priors come from the same net inside the tree)
    try {
      var so = scout.forward(rootEnr, enc.mask);
      scoutRoot = { policy: Array.from(so.policy), value: so.values.now };
    } catch (e) { payloadLevel = 3; }
    if (payloadLevel === 0) {
      try {
        var budget2 = { sims: (m.budget && m.budget.sims) || A.CONFIG.MCTS.simBudget[tier], ms: (m.budget && m.budget.ms) || A.CONFIG.MCTS.msBudget[tier] };
        mctsRes = mcts.search(state, budget2, m.mode || 'advise');
        // extra-search request honored once, half budget
        var pre = A.Router.route(routerInputs(mctsRes, scoutRoot, null, m));
        if (pre.extraSearchRequest) mctsRes = mcts.search(state, { sims: Math.ceil(budget2.sims / 2), ms: Math.ceil(budget2.ms / 2) }, m.mode || 'advise');
      } catch (e) { mctsRes = null; payloadLevel = scoutRoot ? 2 : 3; }
    }
    if (payloadLevel === 0 && strategistLoaded) {
      try {
        var sv = strategist.forward(rootEnr, enc.mask);
        stratOut = { policy: Array.from(sv.policy), values: { now: sv.values.now, m5: sv.values.m5, m30: sv.values.m30, session: sv.values.session }, confidence: sv.confidence };
      } catch (e) { stratOut = null; }
    }
    var hv = adapter.sim.heuristicValue(state);
    var fused = A.Router.fuse({
      mcts: mctsRes, scoutRoot: scoutRoot, strategist: stratOut,
      oracle: oracle.available ? { alarms: oracle.alarms, stalenessMs: oracle.stalenessMs(), available: true } : null,
      relational: relational.available ? { aux: relational.aux, embedding: relational.embedding, stalenessMs: relational.stalenessMs(), available: true } : null,
      novelty: m.novelty || 0, criticality: m.criticality != null ? m.criticality : maxAlarm(),
      heuristicValue: hv, validatedSamples: m.validatedSamples || 0,
      rootSimState: state, fallbackMask: enc.mask
    }, adapter, codec.A, bufs);
    var payload = {
      actionIdx: fused.actionIdx, policy: Array.from(fused.policy), rootValue: fused.rootValue,
      forecast: fused.forecast, weights: fused.weights, level: Math.max(fused.level, payloadLevel),
      heuristicAlpha: fused.heuristicAlpha,
      mcts: mctsRes ? {
        visits: Array.from(mctsRes.visits), policy: Array.from(mctsRes.policy), rootValue: mctsRes.rootValue,
        visitEntropy: mctsRes.visitEntropy, qSpread: mctsRes.qSpread, mask: Array.from(mctsRes.mask), diag: mctsRes.diag
      } : null,
      scoutRoot: scoutRoot, strategist: stratOut,
      oracle: oracle.available ? { alarms: Array.from(oracle.alarms), alarmKeys: A.ORACLE_ALARM_KEYS } : null,
      relational: relational.available ? { aux: relational.aux } : null,
      base: Array.from(enc.base), enrichExtra: Array.from(rootEnr.slice(codec.baseLen)),
      stateHash: enc.hash, tick: enc.tick, heuristicValue: hv, totalMs: A.Util.now() - t0
    };
    ctx.postMessage({ type: 'decision', requestId: m.requestId, payload: payload });
  }
  function maxAlarm() { if (!oracle.available) return 0; var mx = 0; for (var i = 0; i < oracle.alarms.length; i++) if (oracle.alarms[i] > mx) mx = oracle.alarms[i]; return mx; }
  function routerInputs(mctsRes, scoutRoot, stratOut, m) {
    return { mcts: mctsRes, scoutRoot: scoutRoot, strategist: stratOut, oracle: oracle.available ? { alarms: oracle.alarms, stalenessMs: oracle.stalenessMs(), available: true } : null, relational: null, novelty: m.novelty || 0, criticality: m.criticality || 0 };
  }
  function safePayload(state, enc) {
    var idx = adapter.safeActionIndex | 0, pol = new Array(codec.A).fill(0); pol[idx] = 1;
    var hv = adapter.sim.heuristicValue(state);
    return { actionIdx: idx, policy: pol, rootValue: hv, forecast: { now: hv, m5: null, m30: null, session: null, confidence: null }, weights: null, level: 4, mcts: null, scoutRoot: null, strategist: null, oracle: null, relational: null, base: Array.from(enc.base), enrichExtra: null, stateHash: enc.hash, tick: enc.tick, heuristicValue: hv, totalMs: 0 };
  }
  function updateWeights(m) {
    var net = m.model === 'scout' ? scout : (m.model === 'strategist' ? strategist : null);
    if (!net) return ctx.postMessage({ type: 'weightsResult', model: m.model, ok: false, error: 'unknown-model' });
    var r = A.Fed.activateRaw(net, m.bytes, m.meta);
    if (r.ok && net === scout && mcts) mcts.reset(); // priors changed -> stale tree
    ctx.postMessage({ type: 'weightsResult', model: m.model, ok: r.ok, error: r.error || null, version: r.version || null });
  }
  function budget(m) {
    if (m.tier) tier = m.tier;
    if (m.specialistRefreshMs) specialistRefreshMs = m.specialistRefreshMs;
    if (m.unloadStrategist != null) strategistLoaded = !m.unloadStrategist;
  }
})();
