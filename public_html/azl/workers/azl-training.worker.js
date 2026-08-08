/* AZL Training Worker.
 * Runs only when the governor allows (hidden tab / idle / charging). Duties:
 *  - priority-weighted replay sampling from IndexedDB
 *  - local Scout + Strategist optimization (player + self-play streams)
 *  - delta construction vs exact base version + validated upload
 *  - idle self-play using current Scout + PUCT (source='selfplay' tuples)
 *  - candidate evaluation (paired seeds) when the manifest advertises one
 * Messages in: init, governor {trainingAllowed, selfPlayAllowed, tier}, trainRound
 * Messages out: status, validatedSamples, log */
(function () {
  'use strict';
  var ctx = self;
  var A = null, adapter = null, codec = null, scout = null, strategist = null, store = null;
  var clientId = null, csrf = null, apiBase = null;
  var scoutBase = null, stratBase = null; // param snapshots at last server sync
  var trainingAllowed = false, selfPlayAllowed = false, tier = 'mid';
  var loopTimer = null, busy = false, validated = 0, manifest = null;

  ctx.onmessage = function (ev) {
    var m = ev.data || {};
    try {
      if (m.type === 'init') return init(m);
      if (m.type === 'governor') { trainingAllowed = !!m.trainingAllowed; selfPlayAllowed = !!m.selfPlayAllowed; if (m.tier) tier = m.tier; return; }
      if (m.type === 'trainRound') return void queueRound();
    } catch (e) { post('log', { error: String(e && e.message || e) }); }
  };
  function post(type, data) { var o = data || {}; o.type = type; ctx.postMessage(o); }
  function status(s) { post('status', { status: s }); }

  function init(m) {
    var base = m.base || '/azl';
    ['azl-config.js', 'azl-util.js', 'azl-state.js', 'azl-nn.js', 'azl-scout.js', 'azl-strategist.js',
     'azl-oracle.js', 'azl-relational.js', 'azl-mcts.js', 'azl-router.js', 'azl-weights.js',
     'azl-replay.js', 'azl-federated.js', 'azl-eval.js'].forEach(function (f) { importScripts(base + '/' + f); });
    importScripts(m.adapterUrl.indexOf('/') === 0 || m.adapterUrl.indexOf('http') === 0 ? m.adapterUrl : base + '/' + m.adapterUrl);
    A = ctx.AZL;
    adapter = ctx.AZL_ADAPTER || A.ReferenceAdapter;
    codec = new A.Codec(adapter);
    scout = A.makeScout(codec); strategist = A.makeStrategist(codec);
    clientId = m.clientId; csrf = m.csrf || null; apiBase = m.apiBase || A.CONFIG.API_BASE;
    new A.Replay.Store().open().then(function (s) {
      store = s;
      return syncModels();
    }).then(function () {
      loopTimer = setInterval(tick, 20000);
      status('ready');
    }).catch(function (e) { status('degraded'); post('log', { error: String(e && e.message || e) }); });
  }
  function syncModels() {
    return A.Fed.fetchManifest(clientId).then(function (man) {
      manifest = man;
      validated = (man.stats && man.stats.validatedSamples) || 0;
      post('validatedSamples', { count: validated });
      return Promise.all([pull('scout', scout), pull('strategist', strategist)]);
    }).catch(function () { // offline: distill bootstrap so training still moves forward
      if (scout.version === 0 && !scoutBase) { A.distillScout(scout, codec, adapter, { rounds: 20, batch: 48 }); }
      scoutBase = scout.snapshotParams(); stratBase = strategist.snapshotParams();
    });
  }
  function pull(model, net) {
    return A.Fed.loadModel(store, model, clientId, manifest).then(function (w) {
      if (w) { var r = A.Fed.activateRaw(net, w.bytes, w.meta); if (!r.ok) post('log', { error: model + ' activate: ' + r.error }); }
      else if (model === 'scout' && net.version === 0) A.distillScout(net, codec, adapter, { rounds: 20, batch: 48 });
      if (model === 'scout') scoutBase = net.snapshotParams(); else stratBase = net.snapshotParams();
    });
  }

  function tick() {
    if (busy || !store) return;
    if (selfPlayAllowed) return void queueSelfPlay();
    if (trainingAllowed) return void queueRound();
  }
  function queueRound() {
    if (busy || !store) return;
    busy = true; status('training');
    var T = A.CONFIG.TRAINING;
    store.sample(Math.max(T.batch * 4, 256), function (t) { return t.completeness > 0 && t.baseVec && t.baseVec.length; })
      .then(function (pool) {
        if (pool.length < T.minTuplesToTrain) { status('idle:need-data(' + pool.length + ')'); busy = false; return maybeEvaluate(); }
        var exS = [], exT = [];
        for (var i = 0; i < pool.length; i++) {
          var ex = toExamples(pool[i]);
          if (ex) { exS.push(ex.scout); exT.push(ex.strategist); }
        }
        var lastS = null, lastT = null;
        for (var s = 0; s < T.stepsPerRound; s++) {
          var batchS = pick(exS, T.batch), batchT = pick(exT, T.batch);
          lastS = scout.trainBatch(batchS, { lr: T.lr, clipNorm: T.clipNorm, l2: T.l2 });
          lastT = strategist.trainBatch(batchT, { lr: T.lr, clipNorm: T.clipNorm, l2: T.l2 });
        }
        post('log', { train: { scoutLoss: lastS && lastS.totalLoss, strategistLoss: lastT && lastT.totalLoss, pool: pool.length } });
        return uploadIfDue(pool.length).then(function () { busy = false; status('idle'); });
      }).catch(function (e) { busy = false; status('idle'); post('log', { error: 'round: ' + String(e && e.message || e) }); });
  }
  function pick(arr, n) { var out = []; for (var i = 0; i < n; i++) out.push(arr[(Math.random() * arr.length) | 0]); return out; }
  function toExamples(t) {
    var baseLen = codec.baseLen, extraLen = codec.enrichedLen - baseLen;
    var input = new Float32Array(codec.enrichedLen);
    input.set(t.baseVec.subarray ? t.baseVec : new Float32Array(t.baseVec), 0);
    if (t.enrichExtra && t.enrichExtra.length === extraLen) input.set(t.enrichExtra.subarray ? t.enrichExtra : new Float32Array(t.enrichExtra), baseLen);
    var mask = t.mask ? (t.mask instanceof Uint8Array ? t.mask : new Uint8Array(t.mask)) : null;
    if (!mask) return null;
    var T = A.CONFIG.TRAINING;
    var polT = policyTarget(t);
    var z = t.outcomes.session != null ? t.outcomes.session : (t.outcomes.m30 != null ? t.outcomes.m30 : t.outcomes.m5);
    if (z == null) return null;
    var w = Math.min(8, Math.max(0.1, t.priority || 1));
    var confT = (t.mctsRootValue != null && t.outcomes.session != null) ? Math.max(0, 1 - Math.abs(t.mctsRootValue - t.outcomes.session)) : null;
    return {
      scout: { input: input, targets: { mask: mask, policyDist: polT, values: { now: z }, weight: w, entropyBeta: T.entropyBeta, huberDelta: T.huberDelta, headWeights: { now: 1 } } },
      strategist: { input: input, targets: { mask: mask, policyDist: polT, values: { now: t.outcomes.now, m5: t.outcomes.m5, m30: t.outcomes.m30, session: t.outcomes.session }, confidenceTarget: confT, weight: w, entropyBeta: T.entropyBeta, huberDelta: T.huberDelta, headWeights: T.valueHeadWeights } }
    };
  }
  /* Policy target: normalized MCTS visits (search-improved), blended toward the
   * player's actual action when they overrode the advisor AND the session was won
   * (outcome-conditioned behavioral cloning). Losing overrides stay pure-search. */
  function policyTarget(t) {
    var An = codec.A, out = new Float32Array(An), i, s = 0;
    if (t.mctsVisits) { for (i = 0; i < An; i++) { out[i] = t.mctsVisits[i]; s += out[i]; } }
    if (s > 0) { for (i = 0; i < An; i++) out[i] /= s; } else if (t.playerAction != null) out[t.playerAction] = 1;
    if (t.playerAction != null && t.followedAdvisor === false && t.outcomes.session != null && t.outcomes.session > 0) {
      for (i = 0; i < An; i++) out[i] *= 0.6;
      out[t.playerAction] += 0.4;
    }
    return out;
  }
  function uploadIfDue(sampleCount) {
    var jobs = [];
    jobs.push(uploadOne('scout', scout, scoutBase, sampleCount));
    jobs.push(uploadOne('strategist', strategist, stratBase, sampleCount));
    return Promise.all(jobs);
  }
  function uploadOne(model, net, baseP, sampleCount) {
    var serving = manifest && manifest.models && manifest.models[model] && manifest.models[model].serving;
    var bootstrap = !serving || !serving.version;
    var payload, norm;
    if (bootstrap) { payload = net.snapshotParams(); norm = A.Util.l2norm(payload); }
    else {
      if (net.version !== serving.version || !baseP) return Promise.resolve(null); // stale base -> skip
      var d = A.Fed.buildDelta(net, baseP);
      if (!d) return Promise.resolve(null);
      payload = d.delta; norm = d.norm;
    }
    return A.Fed.uploadUpdate(store, {
      clientId: clientId, model: model, baseVersion: bootstrap ? 0 : net.version,
      delta: payload, norm: norm, sampleCount: sampleCount, completeness: 1,
      csrf: csrf, bootstrap: bootstrap, archVersion: A.Fed.archVersion(net)
    }).then(function (r) {
      if (r && r.ok) post('log', { uploaded: model, bootstrap: bootstrap });
      return r;
    }).catch(function () { return null; });
  }

  /* ---------------- self-play ---------------- */
  function queueSelfPlay() {
    busy = true; status('selfplay');
    try {
      var made = selfPlayEpisode();
      post('log', { selfplay: made });
    } catch (e) { post('log', { error: 'selfplay: ' + String(e && e.message || e) }); }
    busy = false; status('idle');
  }
  function selfPlayEpisode() {
    var U = A.Util, seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    var rng = new U.RNG(seed);
    var enr = new Float32Array(codec.enrichedLen);
    var evalFn = function (state) {
      var e = codec.encode(state, false);
      codec.enrich(e.base, null, null, null, enr);
      var o = scout.forward(enr, e.mask);
      return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick };
    };
    evalFn.probe = function (state) { var e = codec.encode(state, false); return { hash: e.hash, tick: e.tick }; };
    var m = new A.MCTS({ adapter: adapter, codec: codec, evalFn: evalFn, rng: rng, cfg: { reuseTree: false } });
    var s = adapter.sim.init(seed);
    var sessionId = U.uuid(), tuples = [], maxMoves = 240, sims = tier === 'low' ? 48 : 96;
    var terminalV = null;
    for (var mv = 0; mv < maxMoves; mv++) {
      var res = m.search(s, { sims: sims, ms: 60 }, 'selfplay');
      var a = (mv < 20) ? U.sampleDist(res.policy, rng, res.mask) : U.argmax(res.policy, res.mask);
      if (a < 0) break;
      var enc = codec.encode(s, false);
      var t = A.Replay.makeTuple({
        sessionId: sessionId, gameV: adapter.version, stateHash: enc.hash, tick: enc.tick,
        baseVec: enc.base.slice(), mask: enc.mask.slice(),
        mctsVisits: res.visits.slice(), mctsRootValue: res.rootValue,
        recommendedAction: U.argmax(res.policy, res.mask), playerAction: a,
        followedAdvisor: null, autonomous: true, nowHealth: adapter.sim.health(s),
        source: 'selfplay', modelVersions: { scout: scout.version }
      });
      tuples.push(t);
      var st = adapter.sim.step(s, a, rng);
      A.Replay.resolveOutcomes(tuples, adapter.sim.tick(s), adapter.sim.health(s));
      if (st.terminal) { terminalV = st.terminalValue; break; }
    }
    A.Replay.finalizeSession(tuples, terminalV != null ? terminalV : adapter.sim.health(s));
    var writes = [];
    for (var i = 0; i < tuples.length; i++) writes.push(store.addTuple(tuples[i]));
    return Promise.all(writes).then(function () { return tuples.length; });
  }

  /* ---------------- candidate evaluation ---------------- */
  function maybeEvaluate() {
    if (!manifest) return;
    ['scout'].forEach(function (model) {
      var mm = manifest.models && manifest.models[model];
      if (!mm || !mm.candidate || !mm.serving || !mm.serving.version) return;
      status('evaluating');
      A.Fed.fetchWeights(model, mm.candidate.version, clientId).then(function (cw) {
        var cand = scout.clone();
        var r = A.Fed.activateRaw(cand, cw.bytes, cw.meta);
        if (!r.ok) return;
        var prod = scout.clone(); // current serving weights already active on scout
        var g = tier === 'low' ? 8 : 16;
        var result = A.Eval.pairedEval({ adapter: adapter, codec: codec, candidateScout: cand, productionScout: prod, games: g, seedBase: (Date.now() / 1000) | 0, maxTicks: 240, sims: 48, msPerMove: 40 });
        cand.dispose();
        return A.Fed.reportEvaluation({
          clientId: clientId, model: model, candidateVersion: mm.candidate.version, baseVersion: mm.serving.version,
          games: result.games, wins: result.wins, losses: result.losses, draws: result.draws,
          candMean: result.candMean, prodMean: result.prodMean, deviceTier: tier, scenarioHash: result.scenarioHash
        }, csrf);
      }).then(function () { status('idle'); }).catch(function () { status('idle'); });
    });
  }
})();
