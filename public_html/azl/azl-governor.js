/* AZL Resource Governor. All browser APIs feature-detected; degrades to static
 * mid-tier defaults in workers/Node. Never blocks rendering: sampling piggybacks on
 * requestAnimationFrame. Scout + heuristic remain the minimum intelligent path. */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;

  function Governor() {
    var GC = C.GOVERNOR;
    this.samples = new Float32Array(GC.sampleWindow); this._si = 0; this._sn = 0;
    this.hidden = false; this.charging = null; this.lastInput = U.now();
    this.frameP95 = 0; this.memPressure = false;
    this._subs = []; this._raf = 0; this._last = 0; this._running = false;
    this.tier = this._detectTier();
  }
  Governor.prototype._detectTier = function () {
    var hc = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
    var dm = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
    if (hc >= 8 && dm >= 8) return 'high';
    if (hc >= 4 && dm >= 4) return 'mid';
    return 'low';
  };
  Governor.prototype.start = function () {
    if (this._running) return; this._running = true;
    var self2 = this;
    if (typeof document !== 'undefined') {
      this.hidden = !!document.hidden;
      document.addEventListener('visibilitychange', function () { self2.hidden = !!document.hidden; self2._emit(); });
      var mark = function () { self2.lastInput = U.now(); };
      ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(function (ev) {
        try { document.addEventListener(ev, mark, { passive: true }); } catch (e) { document.addEventListener(ev, mark); }
      });
    }
    if (typeof navigator !== 'undefined' && navigator.getBattery) {
      navigator.getBattery().then(function (b) {
        self2.charging = b.charging;
        b.addEventListener('chargingchange', function () { self2.charging = b.charging; self2._emit(); });
      }).catch(function () {});
    }
    if (typeof requestAnimationFrame !== 'undefined') {
      var loop = function (t) {
        if (self2._last > 0) {
          var dt = t - self2._last;
          self2.samples[self2._si] = dt; self2._si = (self2._si + 1) % self2.samples.length;
          if (self2._sn < self2.samples.length) self2._sn++;
          if ((self2._si & 15) === 0) self2._recompute();
        }
        self2._last = t;
        if (self2._running) self2._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    this._timer = setInterval(function () { self2._recompute(); self2._emit(); }, 5000);
  };
  Governor.prototype.stop = function () {
    this._running = false;
    if (this._raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this._raf);
    if (this._timer) clearInterval(this._timer);
  };
  Governor.prototype._recompute = function () {
    if (this._sn > 8) {
      var arr = Array.prototype.slice.call(this.samples, 0, this._sn).sort(function (a, b) { return a - b; });
      this.frameP95 = arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];
    }
    this.memPressure = false;
    if (typeof performance !== 'undefined' && performance.memory && performance.memory.jsHeapSizeLimit) {
      this.memPressure = performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit > 0.8;
    }
  };
  Governor.prototype.idleMs = function () { return U.now() - this.lastInput; };
  Governor.prototype.state = function () {
    var GC = C.GOVERNOR;
    var frameBad = this.frameP95 > GC.frameP95BudgetMs && !this.hidden;
    var tier = this.tier;
    if (frameBad && tier !== 'low') tier = tier === 'high' ? 'mid' : 'low'; // step budgets down under load
    var trainingAllowed = !frameBad && (!GC.trainOnlyWhenHiddenOrIdle || this.hidden || this.idleMs() > GC.idleMsBeforeSelfPlay) && !this.memPressure && this.charging !== false;
    var selfPlayAllowed = (this.hidden || this.idleMs() > GC.idleMsBeforeSelfPlay) && !this.memPressure && this.charging !== false && !frameBad;
    return {
      tier: tier, hidden: this.hidden, charging: this.charging, frameP95: this.frameP95,
      memPressure: this.memPressure, idleMs: this.idleMs(),
      trainingAllowed: trainingAllowed, selfPlayAllowed: selfPlayAllowed,
      unloadStrategist: this.memPressure,
      mctsBudget: { sims: C.MCTS.simBudget[tier], ms: C.MCTS.msBudget[tier] },
      specialistRefreshMs: tier === 'low' ? 2500 : (tier === 'mid' ? 1500 : 1000)
    };
  };
  Governor.prototype.subscribe = function (cb) { this._subs.push(cb); };
  Governor.prototype._emit = function () { var s = this.state(); for (var i = 0; i < this._subs.length; i++) { try { this._subs[i](s); } catch (e) {} } };
  AZL.Governor = Governor;
})(typeof self !== 'undefined' ? self : globalThis);
