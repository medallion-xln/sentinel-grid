/* AZL Scout: permanent high-frequency policy/value expert.
 * Runs at every MCTS expansion. ~48K params (enriched 94 -> 96 x 2 residual blocks).
 * Single current-value head in production inference. Hand-rolled kernel, no allocations
 * in the hot path. Distillation: initialize value head from the hand heuristic so the
 * advisor never starts below the existing baseline. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG;
  AZL.makeScout = function (codec) {
    var net = new AZL.NN.Net({
      name: 'scout', input: codec.enrichedLen, width: 96, blocks: 2,
      headStem: 0, policy: codec.A, values: ['now'], confidence: false
    });
    net.role = 'scout';
    return net;
  };
  /* Distill hand heuristic into Scout before real replay exists.
   * Samples states from the adapter simulator, targets value=heuristic(state) and
   * (optionally) a softmax over adapter action scores as weak policy prior. */
  AZL.distillScout = function (scout, codec, adapter, opts) {
    opts = opts || {};
    var rng = new AZL.Util.RNG(opts.seed || 7), T = AZL.CONFIG.TRAINING;
    var rounds = opts.rounds || 60, batch = opts.batch || 48, horizon = opts.horizon || 40;
    var enr = new Float32Array(codec.enrichedLen);
    var scores = adapter.sim.actionScores ? new Float32Array(codec.A) : null;
    var dist = scores ? new Float32Array(codec.A) : null;
    var last = null;
    for (var r = 0; r < rounds; r++) {
      var tuples = [];
      for (var b = 0; b < batch; b++) {
        var s = adapter.sim.init((rng.next() * 1e9) | 0);
        var steps = rng.int(horizon);
        for (var st = 0; st < steps; st++) {
          var enc0 = codec.encode(s, false);
          var a = pickLegal(enc0.mask, rng);
          if (a < 0) break;
          var res = adapter.sim.step(s, a, rng);
          if (res.terminal) { s = adapter.sim.init((rng.next() * 1e9) | 0); }
        }
        var enc = codec.encode(s, false);
        codec.enrich(enc.base, null, null, null, enr);
        var targets = { mask: enc.mask, values: { now: adapter.sim.heuristicValue(s) }, weight: 1, huberDelta: T.huberDelta, headWeights: { now: 1 } };
        if (scores) {
          adapter.sim.actionScores(s, scores);
          AZL.Util.maskedSoftmax(scores, enc.mask, dist, opts.policyTemp || 0.5);
          targets.policyDist = dist.slice();
        }
        tuples.push({ input: enr.slice(), targets: targets });
      }
      last = scout.trainBatch(tuples, { lr: opts.lr || 2e-3, clipNorm: T.clipNorm, l2: T.l2 });
    }
    scout.version = scout.version || 1;
    return last;
    function pickLegal(mask, rng2) {
      var n = 0, i; for (i = 0; i < mask.length; i++) if (mask[i]) n++;
      if (!n) return -1; var k = rng2.int(n);
      for (i = 0; i < mask.length; i++) if (mask[i] && k-- === 0) return i;
      return -1;
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
