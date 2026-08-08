/* azl-ref-adapter-v4.js — W0-A' composite state, clone contract, and mask bitsets (ADDITIVE)
 *
 * Wraps AZL.ReferenceAdapterV3 (frozen W0-S). Mutates neither V2 nor V3; publishes
 * AZL.ReferenceAdapterV4.
 *
 * WHY COMPOSITE STATE
 * V2's clone() is a whitelist over 19 named scalars plus regions. Any field added to
 * the flat V2 state is silently dropped on every clone, and MCTS clones constantly —
 * lifecycle counters stored there would reset at clone boundaries and present as
 * search instability. V4 therefore nests the untouched V2 state inside a composite:
 *
 *   { schemaVersion, environmentState, lifecycleState }
 *
 * environmentState continues to use V2's already-certified clone. lifecycleState is
 * cloned explicitly. A future V2 field addition needs no edit here.
 *
 * SCOPE OF THIS SLICE (A1-A5)
 * Composite state, cloneStateV4, mask bitsets/hashes/reasons, and native V2 legality.
 * Lifecycle counters exist and are cloned, but are NEVER ADVANCED here — the overlay
 * is provably inert and a conformance test asserts it. Execution/cooldown/commitment/
 * target mechanics are A6+. The leaf is untouched: reference-heuristic-v1 evaluates
 * environmentState only, and lifecycle state never enters it.
 */
(function (g) {
  'use strict';
  var AZL = g.AZL;
  if (!AZL || !AZL.ReferenceAdapter) throw new Error('azl-ref-adapter-v4: AZL.ReferenceAdapter must load first');
  if (!AZL.ReferenceAdapterV3) throw new Error('azl-ref-adapter-v4: AZL.ReferenceAdapterV3 must load first');
  var v2 = AZL.ReferenceAdapter, v3 = AZL.ReferenceAdapterV3;

  /* A6 lifecycle registry — development scaffold, injected rather than hard-coded so
     the adapter carries no undeclared timing values. */
  var LIFECYCLE = null;
  function setLifecycleRegistry(reg) {
    if (!reg || reg.registry_id !== 'reference-action-lifecycle-v0-development')
      throw new Error('setLifecycleRegistry: expected reference-action-lifecycle-v0-development');
    if (!reg.actions || reg.actions.length !== v2.actions.length)
      throw new Error('setLifecycleRegistry: registry must declare every action');
    for (var i = 0; i < reg.actions.length; i++) {
      if (reg.actions[i].index !== i || reg.actions[i].key !== v2.actions[i].key)
        throw new Error('setLifecycleRegistry: action order must match the frozen V2 action order at index ' + i);
    }
    LIFECYCLE = reg; return reg;
  }
  function lifecycleRegistry() {
    if (!LIFECYCLE) throw new Error('lifecycle registry not set — call setLifecycleRegistry() first');
    return LIFECYCLE;
  }

  var STATE_SCHEMA_VERSION = 1;
  var MASK_VERSION = 1;
  var ACTION_SPACE_VERSION = 1;
  var N = v2.actions.length;

  /* ---------------- lifecycle state ----------------
     Fixed action-indexed typed arrays. Never object-keyed by action name: key
     enumeration order is an engine detail and would leak into serialization. */
  function newLifecycleState() {
    return {
      executionQuantaRemaining: new Uint16Array(N),
      cooldownQuantaRemaining: new Uint16Array(N),
      activePlanActionIndex: -1,
      commitmentQuantaRemaining: 0,
      targetFreshUntilQuantum: new Uint32Array(N),
      currentQuantum: 0
    };
  }
  function cloneLifecycleState(ls) {
    return {
      executionQuantaRemaining: new Uint16Array(ls.executionQuantaRemaining),
      cooldownQuantaRemaining: new Uint16Array(ls.cooldownQuantaRemaining),
      activePlanActionIndex: ls.activePlanActionIndex,
      commitmentQuantaRemaining: ls.commitmentQuantaRemaining,
      targetFreshUntilQuantum: new Uint32Array(ls.targetFreshUntilQuantum),
      currentQuantum: ls.currentQuantum
    };
  }
  /* Typed arrays stringify inconsistently across engines; emit explicit ordered ints. */
  function canonicalLifecycle(ls) {
    var toArr = function (t) { var a = []; for (var i = 0; i < t.length; i++) a.push(t[i]); return a; };
    return {
      executionQuantaRemaining: toArr(ls.executionQuantaRemaining),
      cooldownQuantaRemaining: toArr(ls.cooldownQuantaRemaining),
      activePlanActionIndex: ls.activePlanActionIndex,
      commitmentQuantaRemaining: ls.commitmentQuantaRemaining,
      targetFreshUntilQuantum: toArr(ls.targetFreshUntilQuantum),
      currentQuantum: ls.currentQuantum
    };
  }
  function lifecycleIsInert(ls) {
    for (var i = 0; i < N; i++) {
      if (ls.executionQuantaRemaining[i] !== 0) return false;
      if (ls.cooldownQuantaRemaining[i] !== 0) return false;
      if (ls.targetFreshUntilQuantum[i] !== 0) return false;
    }
    return ls.activePlanActionIndex === -1 && ls.commitmentQuantaRemaining === 0 && ls.currentQuantum === 0;
  }

  /* ---------------- composite state ---------------- */
  function initStateV4(seed) {
    return { schemaVersion: STATE_SCHEMA_VERSION, environmentState: v2.sim.init(seed), lifecycleState: newLifecycleState() };
  }
  function fromEnvironmentState(env) {
    return { schemaVersion: STATE_SCHEMA_VERSION, environmentState: env, lifecycleState: newLifecycleState() };
  }
  function cloneStateV4(state) {
    if (!state || state.schemaVersion !== STATE_SCHEMA_VERSION) throw new Error('cloneStateV4: not a V4 composite state');
    return {
      schemaVersion: state.schemaVersion,
      environmentState: v2.sim.clone(state.environmentState),
      lifecycleState: cloneLifecycleState(state.lifecycleState)
    };
  }
  /* Structural check used by FX-CLONE-DROP / FX-CLONE-ALIAS. */
  function isWellFormedV4(state) {
    return !!state && state.schemaVersion === STATE_SCHEMA_VERSION
      && !!state.environmentState && typeof state.environmentState.t === 'number'
      && !!state.lifecycleState
      && state.lifecycleState.executionQuantaRemaining instanceof Uint16Array
      && state.lifecycleState.cooldownQuantaRemaining instanceof Uint16Array
      && state.lifecycleState.targetFreshUntilQuantum instanceof Uint32Array
      && state.lifecycleState.executionQuantaRemaining.length === N;
  }

  /* ---------------- mask ----------------
     Authoritative representation is a fixed action-indexed bitset. `reasons` is
     diagnostic only and never participates in the hash. */
  var GATES = [
    { test: function (s) { return s.materials < 8; }, bits: [4, 5, 6], reason: 'insufficient_materials' },
    { test: function (s) { return s.energy < 4; }, bits: [8, 10], reason: 'insufficient_energy' },
    { test: function (s) { return s.population >= s.housing; }, bits: [7], reason: 'no_housing_capacity' },
    { test: function (s) { return s.credits < 8; }, bits: [9], reason: 'insufficient_credits' },
    { test: function (s) { return s.credits < 5 && !(s.food > 80 || s.energy > 80 || s.materials > 80); }, bits: [3], reason: 'insufficient_credits' },
    { test: function (s) { return s.mobility < 0.2; }, bits: [10], reason: 'insufficient_mobility' }
  ];

  function legalMaskV4(state, ctx, out) {
    if (!isWellFormedV4(state)) throw new Error('legalMaskV4: not a well-formed V4 composite state');
    var errs = v3.validateContext(ctx);
    if (errs.length) throw new Error('legalMaskV4: ' + errs.join('; '));
    var m = out || new Uint8Array(N), i;
    /* 1. native V2 legality, unchanged */
    v2.sim.legalMask(state.environmentState, m);
    var ls = state.lifecycleState;

    /* 2. terminal / replan-boundary: nothing is legal at a node that ends expansion */
    var node = v3.evaluateNode(state.environmentState, ctx, ls.currentQuantum, null,
      state.__envTerminal === true, state.__envTerminalValue || 0);
    if (node.terminal) { for (i = 0; i < N; i++) m[i] = 0; return m; }

    /* 3. cooldown always masks. Execution masks too, EXCEPT for the active plan:
       continuing a committed plan is the point of commitment, and masking it would
       leave only interrupts legal. Cooldown is never overridden by commitment — a
       cooling action does not become legal because you are committed to it. */
    for (i = 0; i < N; i++) {
      if (ls.cooldownQuantaRemaining[i] > 0) { m[i] = 0; continue; }
      if (ls.executionQuantaRemaining[i] > 0 && i !== ls.activePlanActionIndex) m[i] = 0;
    }
    /* 4. target freshness — exclusive boundary; at equality the target is stale */
    if (LIFECYCLE) {
      for (i = 0; i < N; i++) {
        if (LIFECYCLE.actions[i].requiresFreshTarget &&
            !(ls.currentQuantum < ls.targetFreshUntilQuantum[i])) m[i] = 0;
      }
    }
    /* 5. plan commitment — continuing the plan stays legal, declared interrupts stay
       legal, everything else is masked. Applied last so commitment cannot be
       overridden, and so the committed action is never masked into a deadlock. */
    if (ls.commitmentQuantaRemaining > 0 && ls.activePlanActionIndex >= 0) {
      for (i = 0; i < N; i++) {
        var isPlan = (i === ls.activePlanActionIndex);
        var isInterrupt = LIFECYCLE ? !!LIFECYCLE.actions[i].interrupt : false;
        if (!isPlan && !isInterrupt) m[i] = 0;
      }
      /* deliberately NOT forcing m[activePlan] = 1: commitment must not resurrect an
         action masked by cooldown or by native legality. Declared interrupts are the
         guaranteed escape. */
    }
    return m;
  }

  function nativeReasons(state) {
    var s = state.environmentState, r = {};
    for (var gi = 0; gi < GATES.length; gi++) {
      var gt = GATES[gi];
      if (!gt.test(s)) continue;
      for (var bi = 0; bi < gt.bits.length; bi++) {
        var b = gt.bits[bi];
        if (r[v2.actions[b].key] === undefined) r[v2.actions[b].key] = gt.reason;
      }
    }
    return r;
  }

  function maskReasons(state) {
    var s = state.environmentState, r = {}, ls = state.lifecycleState, i;
    for (i = 0; i < N; i++) {
      var k = v2.actions[i].key;
      if (ls.executionQuantaRemaining[i] > 0) r[k] = 'executing';
      else if (ls.cooldownQuantaRemaining[i] > 0) r[k] = 'cooldown';
      else if (LIFECYCLE && LIFECYCLE.actions[i].requiresFreshTarget &&
               !(ls.currentQuantum < ls.targetFreshUntilQuantum[i])) r[k] = 'stale_target';
    }
    if (ls.commitmentQuantaRemaining > 0 && ls.activePlanActionIndex >= 0) {
      for (i = 0; i < N; i++) {
        var kk = v2.actions[i].key;
        var isPlan = (i === ls.activePlanActionIndex);
        var isInt = LIFECYCLE ? !!LIFECYCLE.actions[i].interrupt : false;
        if (!isPlan && !isInt && r[kk] === undefined) r[kk] = 'plan_commitment';
      }
    }
    for (var gi = 0; gi < GATES.length; gi++) {
      var gt = GATES[gi];
      if (!gt.test(s)) continue;
      for (var bi = 0; bi < gt.bits.length; bi++) {
        var b = gt.bits[bi];
        if (r[v2.actions[b].key] === undefined) r[v2.actions[b].key] = gt.reason; // declared precedence
      }
    }
    return r;
  }

  /* LSB-first packing, lowest action index in the lowest bit of the first byte. */
  function maskBitsetHex(m) {
    var bytes = Math.ceil(N / 8), out = '';
    for (var b = 0; b < bytes; b++) {
      var v = 0;
      for (var k = 0; k < 8; k++) { var idx = b * 8 + k; if (idx < N && m[idx]) v |= (1 << k); }
      out += ('0' + v.toString(16)).slice(-2);
    }
    return out;
  }

  /* Native V2 legality only — no lifecycle overlay. Used by the A3 reachability
     witnesses so they measure the environment, not V4's own machinery. */
  function nativeMaskRecord(state) {
    var m = new Uint8Array(N);
    v2.sim.legalMask(state.environmentState, m);
    var hex = maskBitsetHex(m);
    var canonical = '{"action_space_version":' + ACTION_SPACE_VERSION +
      ',"bitset_hex":"' + hex + '","mask_version":' + MASK_VERSION + ',"layer":"native"}';
    return { layer: 'native', bitset_hex: hex, mask_hash: v3.hash64(canonical),
             canonical: canonical, reasons: nativeReasons(state), bits: m };
  }

  function maskRecord(state, ctx, out) {
    var m = legalMaskV4(state, ctx, out);
    var hex = maskBitsetHex(m);
    var canonical = '{"action_space_version":' + ACTION_SPACE_VERSION +
      ',"bitset_hex":"' + hex + '","mask_version":' + MASK_VERSION + '}';
    return {
      action_space_version: ACTION_SPACE_VERSION,
      mask_version: MASK_VERSION,
      bitset_hex: hex,
      mask_hash: v3.hash64(canonical),
      canonical: canonical,
      reasons: maskReasons(state),
      bits: m
    };
  }

  /* ---------------- transition ----------------
     Delegates to the frozen V3 fixed-quantum contract on environmentState.
     Lifecycle counters are NOT advanced in A1-A5. */
  /* A7 exact timing convention, frozen in tests:
       start of quantum -> 1 compute mask · 2 select a legal action · 3 on-start cost
       (declared per_execution_quantum, realized by V2's native per-tick consumption,
       so no extra deduction here) · 4 initialize execution and commitment ·
       5 advance one environment quantum · 6 decrement counters that existed before
       this advance · 7 execution reaching zero initializes cooldown · 8 the newly
       initialized cooldown is NOT decremented in the same quantum.
     For executionQuanta=1, cooldownQuanta=1:
       Q0 start available · Q0 end execution completes and cooldown initializes
       Q1 start cooldown  · Q1 end cooldown reaches zero
       Q2 start available */
  function stepQuantumV4(state, actionIdx, ctx, rng) {
    if (!isWellFormedV4(state)) throw new Error('stepQuantumV4: not a well-formed V4 composite state');
    var reg = lifecycleRegistry(), ls = state.lifecycleState, i;

    /* 1-2. the selected action must be legal in the CURRENT mask */
    var mask = legalMaskV4(state, ctx);
    if (!mask[actionIdx]) {
      var e = new Error('ILLEGAL_ACTION: ' + v2.actions[actionIdx].key + ' is masked (' +
        (maskReasons(state)[v2.actions[actionIdx].key] || 'native_legality') + ')');
      e.code = 'ILLEGAL_ACTION'; e.actionIdx = actionIdx; throw e;
    }
    var a = reg.actions[actionIdx];

    /* 4. initialize execution and commitment — ONLY on a fresh start. Continuing an
       action that is already executing, or re-selecting the action you are already
       committed to, must not restart its counters: doing so makes execution never
       complete and commitment never expire, which deadlocks the mask. */
    if (a.executionQuanta > 0 && ls.executionQuantaRemaining[actionIdx] === 0)
      ls.executionQuantaRemaining[actionIdx] = a.executionQuanta;
    if (a.commitmentQuanta > 0 && ls.activePlanActionIndex !== actionIdx) {
      ls.activePlanActionIndex = actionIdx;
      ls.commitmentQuantaRemaining = a.commitmentQuanta;
    }
    var preCooldown = new Uint16Array(ls.cooldownQuantaRemaining);   /* rule 8 snapshot */

    /* 5. advance exactly one environment quantum via the frozen V3 contract */
    var r = v3.stepQuantum(state.environmentState, actionIdx, ctx, rng);
    ls.currentQuantum += 1;
    state.__envTerminal = r.envTerminal; state.__envTerminalValue = r.envTerminalValue;

    /* 6. decrement what existed before the advance */
    var completed = [];
    for (i = 0; i < N; i++) {
      if (ls.executionQuantaRemaining[i] > 0) {
        ls.executionQuantaRemaining[i] -= 1;
        if (ls.executionQuantaRemaining[i] === 0) completed.push(i);
      }
      if (preCooldown[i] > 0) ls.cooldownQuantaRemaining[i] = preCooldown[i] - 1;
    }
    if (ls.commitmentQuantaRemaining > 0) {
      ls.commitmentQuantaRemaining -= 1;
      if (ls.commitmentQuantaRemaining === 0) ls.activePlanActionIndex = -1;
    }
    /* 7-8. execution reaching zero initializes cooldown, not decremented this quantum */
    for (i = 0; i < completed.length; i++) {
      var ci = completed[i];
      if (reg.actions[ci].cooldownQuanta > 0) ls.cooldownQuantaRemaining[ci] = reg.actions[ci].cooldownQuanta;
    }

    return {
      state: state, ticksAdvanced: r.ticksAdvanced, fullQuantum: r.fullQuantum,
      envTerminal: r.envTerminal, envTerminalValue: r.envTerminalValue,
      quantum: ls.currentQuantum, completedExecutions: completed
    };
  }

  /* A9 synthetic target scaffold — development only, not faction perception. */
  function setTargetFreshness(state, actionIdx, freshUntilQuantumExclusive) {
    state.lifecycleState.targetFreshUntilQuantum[actionIdx] = freshUntilQuantumExclusive;
    return state;
  }
  function isTargetFresh(state, actionIdx) {
    return state.lifecycleState.currentQuantum < state.lifecycleState.targetFreshUntilQuantum[actionIdx];
  }

  /* Leaf: environmentState ONLY. Lifecycle must never enter the evaluator — that
     would be a new leaf version under GUARDRAILS-v2 6.1. */
  function heuristicValueV4(state) { return v2.sim.heuristicValue(state.environmentState); }

  AZL.ReferenceAdapterV4 = {
    id: 'azl-reference-colony-w0a', version: 4,
    stateSchemaVersion: STATE_SCHEMA_VERSION, maskVersion: MASK_VERSION,
    actionSpaceVersion: ACTION_SPACE_VERSION,
    baseAdapterId: v3.id, baseAdapterVersion: v3.version,
    lifecycleAdvancedInThisSlice: true,
    actions: v2.actions, actionCount: N, GATES: GATES,
    initStateV4: initStateV4, fromEnvironmentState: fromEnvironmentState,
    cloneStateV4: cloneStateV4, newLifecycleState: newLifecycleState,
    cloneLifecycleState: cloneLifecycleState, canonicalLifecycle: canonicalLifecycle,
    lifecycleIsInert: lifecycleIsInert, isWellFormedV4: isWellFormedV4,
    legalMaskV4: legalMaskV4, maskRecord: maskRecord, maskBitsetHex: maskBitsetHex,
    maskReasons: maskReasons, stepQuantumV4: stepQuantumV4, heuristicValueV4: heuristicValueV4,
    setLifecycleRegistry: setLifecycleRegistry, lifecycleRegistry: lifecycleRegistry,
    setTargetFreshness: setTargetFreshness, isTargetFresh: isTargetFresh,
    nativeMaskRecord: nativeMaskRecord, nativeReasons: nativeReasons,
    createSearchContext: v3.createSearchContext
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AZL.ReferenceAdapterV4;
})(typeof self !== 'undefined' ? self : globalThis);
