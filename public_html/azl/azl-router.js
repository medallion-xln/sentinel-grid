/* AZL Router + Root Fusion.
 * Router: constrained deterministic gating (learned gating MLP deferred until a
 * supervised routing target + eval harness exist - per spec decision policy).
 * Operates at the ROOT only. Enforces hard bounds: search >= 0.50,
 * strategist <= 0.35, scoutRoot <= 0.20, weights normalized to 1.
 * Fusion: masked log-probability product + bounded relational adjustment +
 * temperature + stable softmax + NaN guards + safe fallback chain.
 * Root value: MCTS + Strategist + bounded Oracle trend adjustment + hand-heuristic
 * safety floor (annealed alpha; heuristic never removed until validation proves
 * superiority). */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;

  /* inputs: {
   *   mcts: {policy, rootValue, visitEntropy, qSpread, mask, diag} | null
   *   scoutRoot: {policy, value} | null
   *   strategist: {policy, values{now,m5,m30,session}, confidence} | null
   *   oracle: {alarms, stalenessMs, available} | null
   *   relational: {aux, embedding, stalenessMs, available} | null
   *   novelty (0..1), replayCoverage (0..1), deviceTier ('low'|'mid'|'high'),
   *   criticality (0..1), heuristicValue, validatedSamples
   * } */
  function route(inp) {
    var R = C.ROUTER;
    var wSearch = Math.max(R.searchMin, 0.55);
    var wStrat = 0, wScout = 0, extraSearch = 0, safeFallback = false;
    var stale = function (ms, half) { return isFinite(ms) ? Math.pow(0.5, ms / half) : 0; };
    if (inp.strategist) {
      var conf = inp.strategist.confidence != null ? inp.strategist.confidence : 0.5;
      wStrat = Math.min(R.strategistMax, 0.15 + 0.20 * conf);
      // trust strategist less in novel states (its training coverage is weakest there)
      wStrat *= (1 - 0.5 * (inp.novelty || 0));
    }
    if (inp.scoutRoot) wScout = Math.min(R.scoutRootMax, 0.10);
    // high search disagreement (entropy) or high criticality -> request more search
    if (inp.mcts) {
      var maxEnt = Math.log(countLegal(inp.mcts.mask) || 1);
      var entN = maxEnt > 0 ? inp.mcts.visitEntropy / maxEnt : 0;
      if (entN > 0.85 || (inp.criticality || 0) > 0.7 || (inp.novelty || 0) > 0.8) extraSearch = 1;
    } else safeFallback = true;
    // normalize with search floor
    var rest = wStrat + wScout, cap = 1 - Math.max(R.searchMin, wSearch - rest > 0 ? wSearch : R.searchMin);
    cap = 1 - R.searchMin;
    if (rest > cap && rest > 0) { var s = cap / rest; wStrat *= s; wScout *= s; rest = cap; }
    wSearch = 1 - rest;
    var oracleAdj = 0;
    if (inp.oracle && inp.oracle.available) {
      var f = stale(inp.oracle.stalenessMs, R.staleHalfLifeMs.oracle);
      // alarms are risk probabilities; net pessimism pulls value down within bound
      var a = inp.oracle.alarms, risk = 0; for (var i = 0; i < a.length; i++) risk += a[i];
      risk = risk / a.length;
      oracleAdj = U.clamp(-(risk - 0.5) * 2 * R.oracleValueAdjMax, -R.oracleValueAdjMax, R.oracleValueAdjMax) * f;
    }
    return { searchWeight: wSearch, strategistWeight: wStrat, scoutRootWeight: wScout,
      oracleValueAdj: oracleAdj, relationalScale: inp.relational && inp.relational.available ? stale(inp.relational.stalenessMs, R.staleHalfLifeMs.relational) : 0,
      extraSearchRequest: extraSearch, safeFallback: safeFallback };
    function countLegal(m) { var c = 0; if (m) for (var j = 0; j < m.length; j++) if (m[j]) c++; return c; }
  }

  /* Bounded per-action relational adjustment in log space.
   * adapter.relationalActionBias(aux, out) may map aux findings -> [-1,1] per action;
   * scaled into [-relationalAdjMax, +relationalAdjMax]. Optional. */
  function relationalAdjust(adapter, relational, A, scale, out) {
    out.fill(0);
    if (!relational || !relational.available || scale <= 0) return out;
    if (adapter.relationalActionBias) {
      adapter.relationalActionBias(relational.aux, out);
      var m = C.ROUTER.relationalAdjMax * scale;
      for (var i = 0; i < A; i++) out[i] = U.clamp(out[i], -1, 1) * m;
    }
    return out;
  }

  /* fuse -> { policy, actionIdx, rootValue, forecast, weights, level } */
  function fuse(inp, adapter, A, buffers) {
    var R = C.ROUTER, eps = R.epsilon;
    var w = route(inp);
    var logits = buffers.logits, pol = buffers.policy, relAdj = buffers.relAdj;
    var mask = inp.mcts ? inp.mcts.mask : inp.fallbackMask;
    relationalAdjust(adapter, inp.relational, A, w.relationalScale, relAdj);
    var ok = false;
    if (inp.mcts) {
      for (var i = 0; i < A; i++) {
        if (!mask[i]) { logits[i] = -Infinity; continue; }
        var l = w.searchWeight * Math.log(inp.mcts.policy[i] + eps);
        if (inp.strategist && w.strategistWeight > 0) l += w.strategistWeight * Math.log(inp.strategist.policy[i] + eps);
        if (inp.scoutRoot && w.scoutRootWeight > 0) l += w.scoutRootWeight * Math.log(inp.scoutRoot.policy[i] + eps);
        l += relAdj[i];
        logits[i] = l;
      }
      ok = U.maskedSoftmax(logits, mask, pol, R.fusionTemperature);
      if (ok) { // NaN sweep
        for (var j = 0; j < A; j++) if (!isFinite(pol[j])) { ok = false; break; }
      }
    }
    var level = 0;
    if (!ok) { // fallback chain: scout policy -> heuristic -> safe scripted
      level = fallbackPolicy(inp, adapter, A, mask, pol);
    }
    // root value fusion
    var learned = null;
    if (inp.mcts) {
      learned = inp.mcts.rootValue * 0.7 + (inp.strategist ? inp.strategist.values.now * 0.3 : inp.mcts.rootValue * 0.3);
      learned += w.oracleValueAdj;
    } else if (inp.scoutRoot) learned = inp.scoutRoot.value;
    var HF = C.HEURISTIC_FLOOR;
    var alpha = U.clamp(HF.alphaStart + (HF.alphaMax - HF.alphaStart) * ((inp.validatedSamples || 0) / HF.samplesForMax), HF.alphaStart, HF.alphaMax);
    var hv = inp.heuristicValue != null ? inp.heuristicValue : 0;
    var rootValue = learned == null ? hv : (alpha * learned + (1 - alpha) * hv);
    rootValue = U.clamp(isFinite(rootValue) ? rootValue : hv, -1, 1);
    var forecast = inp.strategist ? {
      now: rootValue, m5: inp.strategist.values.m5, m30: inp.strategist.values.m30, session: inp.strategist.values.session,
      confidence: inp.strategist.confidence
    } : { now: rootValue, m5: null, m30: null, session: null, confidence: null };
    var actionIdx = U.argmax(pol, mask);
    return { policy: pol, actionIdx: actionIdx, rootValue: rootValue, forecast: forecast, weights: w, level: level, heuristicAlpha: alpha };
  }
  function fallbackPolicy(inp, adapter, A, mask, pol) {
    if (inp.scoutRoot && U.isFiniteArr(inp.scoutRoot.policy)) { pol.set(inp.scoutRoot.policy); return 2; } // Level 2: scout w/o search
    // Level 3: hand heuristic action scores
    if (adapter.sim && adapter.sim.actionScores && inp.rootSimState) {
      var sc = new Float32Array(A);
      adapter.sim.actionScores(inp.rootSimState, sc);
      if (U.maskedSoftmax(sc, mask, pol, 0.5)) return 3;
    }
    // Level 4: safe scripted behavior
    pol.fill(0);
    var safe = adapter.safeActionIndex | 0;
    if (mask && !mask[safe]) { for (var i = 0; i < A; i++) if (mask[i]) { safe = i; break; } }
    pol[safe] = 1;
    return 4;
  }
  AZL.Router = { route: route, fuse: fuse, makeBuffers: function (A) { return { logits: new Float32Array(A), policy: new Float32Array(A), relAdj: new Float32Array(A) }; } };
})(typeof self !== 'undefined' ? self : globalThis);
