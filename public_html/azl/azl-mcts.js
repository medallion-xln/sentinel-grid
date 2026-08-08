/* AZL MCTS: real PUCT tree search.
 * Per-edge statistics (P, N, W, Q derived), legal-action-only selection, Dirichlet
 * root noise (self-play), temperature-controlled visit policy, deterministic eval
 * mode, tree reuse with hash validation, terminal handling, sim/ms budgets,
 * cancellation, node cap, diagnostics. Single-perspective backup: all values are the
 * colony's expected outcome in [-1,1]; no sign alternation (single-agent domain -
 * documented in ARCHITECTURE.md).
 * Scout supplies priors + value at expansion. No other expert enters the tree. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;

  function Node(A, state, hash, tick) {
    this.state = state; this.hash = hash; this.tick = tick;
    this.expanded = false; this.terminal = false; this.termValue = 0;
    this.value = 0;                    // scout value at expansion
    this.totalN = 0;
    this.childN = new Int32Array(A);
    this.childW = new Float32Array(A);
    this.childP = new Float32Array(A);
    this.mask = null;                  // Uint8Array copy
    this.children = new Array(A).fill(null);
  }

  /* opts: { adapter, codec, evalFn(state)->{policy,value,mask,hash,tick},
   *         rng, cfg (CONFIG.MCTS override) } */
  function MCTS(opts) {
    this.adapter = opts.adapter; this.codec = opts.codec;
    this.evalFn = opts.evalFn; this.rng = opts.rng || new U.RNG(1234);
    this.cfg = Object.assign({}, C.MCTS, opts.cfg || {});
    this.A = this.codec.A;
    this.root = null; this.nodeCount = 0;
    this._cancel = false;
    this._noise = new Float32Array(this.A);
  }
  MCTS.prototype.cancel = function () { this._cancel = true; };
  MCTS.prototype.reset = function () { this.root = null; this.nodeCount = 0; };
  MCTS.prototype._expand = function (node) {
    var ev = this.evalFn(node.state);
    node.mask = ev.mask.slice ? ev.mask.slice() : new Uint8Array(ev.mask);
    node.childP.set(ev.policy);
    node.value = ev.value;
    node.hash = ev.hash; node.tick = ev.tick;
    node.expanded = true;
    return ev.value;
  };
  MCTS.prototype._makeChild = function (parent, a) {
    var sim = this.adapter.sim;
    var st = sim.clone(parent.state);
    var res = sim.step(st, a, this.rng);
    var child = new Node(this.A, st, 0, sim.tick(st));
    this.nodeCount++;
    if (res.terminal) { child.terminal = true; child.termValue = res.terminalValue; child.expanded = true; }
    return child;
  };
  MCTS.prototype._select = function (node) {
    var best = -1, bestScore = -Infinity, A = this.A;
    var sqrtN = Math.sqrt(node.totalN + 1), c = this.cfg.cPuct, fpu = this.cfg.fpu;
    for (var a = 0; a < A; a++) {
      if (!node.mask[a]) continue;
      var n = node.childN[a];
      var q = n > 0 ? node.childW[a] / n : (node.value - fpu);
      var u = c * node.childP[a] * sqrtN / (1 + n);
      var s = q + u;
      if (s > bestScore) { bestScore = s; best = a; }
    }
    return best;
  };
  MCTS.prototype.addRootNoise = function () {
    if (!this.root || !this.root.expanded) return;
    var eps = this.cfg.dirichletEps, k = 0, A = this.A, i;
    var legal = []; for (i = 0; i < A; i++) if (this.root.mask[i]) legal.push(i);
    if (legal.length < 2) return;
    U.dirichlet(this.rng, this.cfg.dirichletAlpha, legal.length, this._noise);
    for (i = 0; i < legal.length; i++) {
      var a = legal[i];
      this.root.childP[a] = (1 - eps) * this.root.childP[a] + eps * this._noise[i];
    }
  };
  /* Run search. budget: {sims, ms}. mode: 'advise' (deterministic) | 'selfplay' (noise). */
  MCTS.prototype.search = function (rootState, budget, mode) {
    this._cancel = false;
    var sim = this.adapter.sim, A = this.A;
    var enc = this.evalFn.probe(rootState); // {hash, tick} without full eval
    if (!(this.cfg.reuseTree && this.root && this.root.hash === enc.hash)) {
      this.root = new Node(A, sim.clone(rootState), enc.hash, enc.tick);
      this.nodeCount = 1;
    }
    if (!this.root.expanded && !this.root.terminal) {
      var v0 = this._expand(this.root);
      this.root.totalN++; // root expansion counts as a visit for PUCT scaling
      // no backup target above root
      void v0;
    }
    if (mode === 'selfplay') this.addRootNoise();
    var t0 = U.now(), sims = 0, maxDepth = 0;
    var simCap = budget.sims || this.cfg.simBudget.mid, msCap = budget.ms || this.cfg.msBudget.mid;
    var path = []; // pairs pushed flat: node, action
    while (sims < simCap && !this._cancel) {
      if ((sims & 7) === 0 && (U.now() - t0) > msCap) break;
      path.length = 0;
      var node = this.root, v = 0, depth = 0;
      for (;;) {
        if (node.terminal) { v = node.termValue; break; }
        if (!node.expanded) { v = this._expand(node); break; }
        if (this.nodeCount >= this.cfg.maxNodes) { v = node.value; break; } // memory bound: treat as leaf
        var a = this._select(node);
        if (a < 0) { v = node.terminal ? node.termValue : node.value; break; } // all masked safeguard
        path.push(node, a);
        var child = node.children[a];
        if (child === null) { child = this._makeChild(node, a); node.children[a] = child; }
        node = child; depth++;
      }
      for (var p = path.length - 2; p >= 0; p -= 2) {
        var pn = path[p], pa = path[p + 1];
        pn.childN[pa]++; pn.childW[pa] += v; pn.totalN++;
      }
      if (path.length === 0) this.root.totalN++; // immediate-terminal root
      if (depth > maxDepth) maxDepth = depth;
      sims++;
    }
    return this.result(mode, { sims: sims, ms: U.now() - t0, maxDepth: maxDepth, nodes: this.nodeCount });
  };
  MCTS.prototype.result = function (mode, diag) {
    var A = this.A, r = this.root, i;
    var visits = new Float32Array(A), policy = new Float32Array(A);
    var totV = 0, q = 0, qn = 0, qMin = Infinity, qMax = -Infinity;
    for (i = 0; i < A; i++) {
      visits[i] = r.childN[i]; totV += r.childN[i];
      if (r.childN[i] > 0) {
        var qi = r.childW[i] / r.childN[i];
        q += r.childW[i]; qn += r.childN[i];
        if (qi < qMin) qMin = qi; if (qi > qMax) qMax = qi;
      }
    }
    var temp = mode === 'selfplay' ? this.cfg.temperatureSelfPlay : this.cfg.temperatureAdvise;
    if (totV > 0) {
      if (temp <= 0.01) { var b = U.argmax(visits, r.mask); for (i = 0; i < A; i++) policy[i] = i === b ? 1 : 0; }
      else { var s = 0; for (i = 0; i < A; i++) { policy[i] = Math.pow(visits[i], 1 / temp); s += policy[i]; } for (i = 0; i < A; i++) policy[i] = s > 0 ? policy[i] / s : 0; }
    } else if (r.mask) { // budget exhausted before any sim: fall back to priors
      for (i = 0; i < A; i++) policy[i] = r.mask[i] ? r.childP[i] : 0;
    }
    var rootValue = qn > 0 ? q / qn : r.value;
    return {
      visits: visits, policy: policy, rootValue: rootValue, rootPrior: r.childP.slice(),
      mask: r.mask, visitEntropy: U.entropy(normalize(visits)), qSpread: (qn > 0 ? qMax - qMin : 0),
      diag: diag
    };
    function normalize(v) { var s2 = 0, o = new Float32Array(v.length); for (var j = 0; j < v.length; j++) s2 += v[j]; if (s2 > 0) for (var j2 = 0; j2 < v.length; j2++) o[j2] = v[j2] / s2; return o; }
  };
  /* Advance root after a real action; returns true if subtree reused. */
  MCTS.prototype.advance = function (actionId, newStateHash) {
    if (!this.cfg.reuseTree || !this.root) { this.reset(); return false; }
    var child = this.root.children[actionId];
    if (child && !child.terminal && child.expanded) {
      // validate against real next state: child.hash is lazily set at expansion via evalFn
      if (child.hash === newStateHash) { this.root = child; return true; }
    }
    this.reset(); return false;
  };
  AZL.MCTS = MCTS; AZL.MCTSNode = Node;
})(typeof self !== 'undefined' ? self : globalThis);
