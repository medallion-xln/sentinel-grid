/* AZL Evaluation harness.
 * Candidate-vs-production comparison on IDENTICAL frozen seeds (paired design):
 * each seed is played once with candidate Scout and once with production Scout,
 * same MCTS budget, same adapter; score = session health at horizon (or terminal).
 * Win = candidate score exceeds production by > tie epsilon. Reports win rate,
 * Wilson lower confidence bound, mean scores, and value calibration proxy.
 * Runs in the training worker when the governor allows; results POST to
 * /api/azl -> evaluations for the promotion gate. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;
  var E = AZL.Eval = {};

  E.wilsonLCB = function (wins, n, z) {
    if (!n) return 0; z = z || 1.96;
    var p = wins / n, z2 = z * z;
    var denom = 1 + z2 / n;
    var center = p + z2 / (2 * n);
    var rad = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
    return Math.max(0, (center - rad) / denom);
  };

  /* Play one bounded episode with a given scout net; returns {score, calibErr, ticks}.
   * Deterministic per (seed, net weights): advise mode, no root noise, fixed budgets. */
  function playEpisode(adapter, codec, scout, seed, opts) {
    var enr = new Float32Array(codec.enrichedLen);
    var evalFn = function (state) {
      var e = codec.encode(state, false);
      codec.enrich(e.base, null, null, null, enr);
      var o = scout.forward(enr, e.mask);
      return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick };
    };
    evalFn.probe = function (state) { var e = codec.encode(state, false); return { hash: e.hash, tick: e.tick }; };
    var m = new AZL.MCTS({ adapter: adapter, codec: codec, evalFn: evalFn, rng: new U.RNG(seed ^ 0xA5A5A5), cfg: { reuseTree: false } });
    var s = adapter.sim.init(seed), rng = new U.RNG(seed ^ 0x1234);
    var maxTicks = opts.maxTicks, budget = { sims: opts.sims, ms: opts.msPerMove };
    var calibSum = 0, calibN = 0, terminalV = null;
    for (var t = 0; t < maxTicks; t++) {
      var res = m.search(s, budget, 'advise');
      var a = U.argmax(res.policy, res.mask);
      if (a < 0) break;
      if ((t % 10) === 0) { calibSum += Math.abs(res.rootValue - adapter.sim.health(s)); calibN++; }
      var st = adapter.sim.step(s, a, rng);
      if (st.terminal) { terminalV = st.terminalValue; break; }
    }
    var score = terminalV != null ? terminalV : adapter.sim.health(s);
    return { score: score, calibErr: calibN ? calibSum / calibN : null, ticks: t };
  }

  /* opts: {adapter, codec, candidateScout, productionScout, games, seedBase,
   *        maxTicks, sims, msPerMove, tieEps, onProgress} */
  E.pairedEval = function (opts) {
    var games = opts.games || C.PROMOTION.minGames;
    var tie = opts.tieEps != null ? opts.tieEps : 0.02;
    var wins = 0, losses = 0, draws = 0, cSum = 0, pSum = 0, cCal = 0, pCal = 0, calN = 0;
    var scen = new U.Fnv();
    for (var i = 0; i < games; i++) {
      var seed = ((opts.seedBase || 1000) + i * 7919) >>> 0;
      scen.u32(seed);
      var c = playEpisode(opts.adapter, opts.codec, opts.candidateScout, seed, opts);
      var p = playEpisode(opts.adapter, opts.codec, opts.productionScout, seed, opts);
      cSum += c.score; pSum += p.score;
      if (c.calibErr != null && p.calibErr != null) { cCal += c.calibErr; pCal += p.calibErr; calN++; }
      if (c.score > p.score + tie) wins++;
      else if (p.score > c.score + tie) losses++;
      else draws++;
      if (opts.onProgress) opts.onProgress(i + 1, games);
    }
    var decisive = wins + losses;
    var wr = decisive ? wins / decisive : 0.5;
    return {
      games: games, wins: wins, losses: losses, draws: draws,
      winRate: wr, lcb: E.wilsonLCB(wins, decisive || 1),
      candMean: cSum / games, prodMean: pSum / games,
      candCalibErr: calN ? cCal / calN : null, prodCalibErr: calN ? pCal / calN : null,
      scenarioHash: scen.done().toString(16)
    };
  };

  E.passesGate = function (r) {
    var P = C.PROMOTION;
    return (r.wins + r.losses + r.draws) >= P.minGames && r.winRate > P.winRateGate && r.lcb > P.lcbGate;
  };
})(typeof self !== 'undefined' ? self : globalThis);
