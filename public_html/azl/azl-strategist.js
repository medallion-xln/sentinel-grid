/* AZL Strategist: strong root evaluator. Runs ONCE per consequential decision, never
 * inside the tree. Residual MLP, width 192 x 4 blocks, head stem 64, ~340K params.
 * Heads: policy, values {now,m5,m30,session}, confidence (sigmoid).
 * Its policy re-ranks/calibrates MCTS at the root under router bounds; it never
 * replaces search. */
(function (g) {
  'use strict';
  var AZL = g.AZL;
  AZL.STRATEGIST_VALUE_KEYS = ['now', 'm5', 'm30', 'session'];
  AZL.makeStrategist = function (codec) {
    var net = new AZL.NN.Net({
      name: 'strategist', input: codec.enrichedLen, width: 192, blocks: 4,
      headStem: 64, policy: codec.A, values: AZL.STRATEGIST_VALUE_KEYS.slice(), confidence: true
    });
    net.role = 'strategist';
    return net;
  };
})(typeof self !== 'undefined' ? self : globalThis);
