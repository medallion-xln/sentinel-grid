/* azl-ref-adapter-v3.js — W0-S search-semantics substrate (ADDITIVE)
 *
 * Wraps AZL.ReferenceAdapter (env v2). Adds NOTHING to the environment dynamics:
 * step(), legalMask(), heuristicValue() and every other v2 entry point are called
 * unchanged. AZL.ReferenceAdapter is never mutated; this module publishes a
 * separate object at AZL.ReferenceAdapterV3.
 *
 * What W0-S establishes, and only this:
 *   - one immutable, canonically hashable SearchContext per search
 *   - one fixed control quantum for every transition
 *   - one fixed horizon in quanta for every rollout
 *   - one root-frozen stance; a simulated crossing produces a replan boundary
 *   - pure, explicit terminal predicates
 *
 * Explicitly NOT in W0-S: action execution durations, cooldowns, world-control
 * actions, faction observations, ZekNova binding, leaf-weight tuning.
 *
 * The leaf used here is reference-heuristic-v1 — the ACTUAL v2 evaluator
 * (sim.heuristicValue). world-control-leaf-v0-development is not declared until
 * W0-L, when its five terms exist.
 *
 * The stance model is synthetic-reference-stance-v1, a development scaffold:
 * reference-colony v2 has no tension system. Any replan-boundary statistic is a
 * mechanism-conformance measurement under that scaffold, NOT an observed
 * behavioral property of ZekNova, and is never used for promotion or tuning.
 */
(function (g) {
  'use strict';
  var AZL = g.AZL;
  if (!AZL || !AZL.ReferenceAdapter) throw new Error('azl-ref-adapter-v3: AZL.ReferenceAdapter must load first');
  var base = AZL.ReferenceAdapter;

  var SCHEMA_VERSION = 1;
  var STANCE_MODEL = 'synthetic-reference-stance-v1';
  var STANCE_MODEL_STATUS = 'development-scaffold';
  var LEAF_VERSION = 'reference-heuristic-v1';

  /* Development defaults. NOT frozen production values (W0-S is not W0-A'/W0-L). */
  var DEV_DEFAULTS = {
    schemaVersion: SCHEMA_VERSION,
    environmentId: 'reference-colony-v2',
    factionId: 'reference-faction',
    rootStance: 'defensive',
    objectiveProfileId: 'reference-defensive-v0',
    leafVersion: LEAF_VERSION,
    stanceModelVersion: STANCE_MODEL,
    stanceModelStatus: STANCE_MODEL_STATUS,
    syntheticThreshold: 0.72,
    controlQuantumTicks: 30,
    horizonQuanta: 40,
    seed: 18427
  };

  var REQUIRED = ['schemaVersion', 'environmentId', 'factionId', 'rootStance', 'objectiveProfileId',
    'leafVersion', 'stanceModelVersion', 'stanceModelStatus', 'syntheticThreshold',
    'controlQuantumTicks', 'horizonQuanta', 'seed'];

  var STANCES = ['collaborative', 'cautious', 'defensive', 'hostile', 'total-war'];

  /* ---------- canonical serialization (mirrors canonical-json-v1) ---------- */
  function canonical(v) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'boolean') return v ? 'true' : 'false';
    if (t === 'number') {
      if (!isFinite(v)) throw new Error('canonical: non-finite number');
      return (v === Math.floor(v) && Math.abs(v) < 1e21) ? String(v) : JSON.stringify(v);
    }
    if (t === 'string') return JSON.stringify(v);
    if (t === 'undefined') throw new Error('canonical: undefined rejected');
    if (t === 'function') throw new Error('canonical: function rejected');
    if (Object.prototype.toString.call(v) === '[object Array]') {
      var a = []; for (var i = 0; i < v.length; i++) a.push(canonical(v[i]));
      return '[' + a.join(',') + ']';
    }
    var keys = Object.keys(v).sort(function (x, y) { return x < y ? -1 : x > y ? 1 : 0; });
    var parts = [];
    for (var k = 0; k < keys.length; k++) parts.push(JSON.stringify(keys[k]) + ':' + canonical(v[keys[k]]));
    return '{' + parts.join(',') + '}';
  }

  /* FNV-1a 64 rendered as 16 hex chars — no crypto dependency in the browser path.
     The Node-side test suite additionally binds the context with SHA-256. */
  function hash64(str) {
    var h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 ^= (c + i); h2 = (h2 * 0x01000193) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }

  /* ---------- SearchContext ---------- */

  function validateContext(c) {
    var errs = [];
    if (!c || typeof c !== 'object') return ['context is not an object'];
    for (var i = 0; i < REQUIRED.length; i++) {
      if (c[REQUIRED[i]] === undefined || c[REQUIRED[i]] === null) errs.push('missing field: ' + REQUIRED[i]);
    }
    if (errs.length) return errs;
    if (c.schemaVersion !== SCHEMA_VERSION) errs.push('unknown schemaVersion: ' + c.schemaVersion);
    if (STANCES.indexOf(c.rootStance) < 0) errs.push('unknown rootStance: ' + c.rootStance);
    if (!(c.controlQuantumTicks > 0) || c.controlQuantumTicks !== Math.floor(c.controlQuantumTicks))
      errs.push('controlQuantumTicks must be a positive integer');
    if (!(c.horizonQuanta > 0) || c.horizonQuanta !== Math.floor(c.horizonQuanta))
      errs.push('horizonQuanta must be a positive integer');
    if (c.leafVersion !== LEAF_VERSION) errs.push('W0-S runs only reference-heuristic-v1, got ' + c.leafVersion);
    if (!Object.isFrozen(c)) errs.push('context is not frozen');
    return errs;
  }

  function createSearchContext(overrides) {
    var c = {};
    for (var k in DEV_DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEV_DEFAULTS, k)) c[k] = DEV_DEFAULTS[k];
    if (overrides) for (var o in overrides) if (Object.prototype.hasOwnProperty.call(overrides, o)) c[o] = overrides[o];
    Object.freeze(c);
    var errs = validateContext(c);
    if (errs.length) throw new Error('invalid SearchContext: ' + errs.join('; '));
    return c;
  }

  function contextCanonical(c) { return canonical(c); }
  function contextHash(c) { return hash64(canonical(c)); }
  function transitionBudget(c, simulations) { return simulations * c.horizonQuanta; }

  /* ---------- synthetic stance scaffold ----------
     reference-colony v2 has no tension. This derives a bounded [0,1] pressure
     signal from existing state so the replan-boundary MECHANISM can be exercised.
     It is a scaffold, versioned as such, and asserts nothing about ZekNova. */
  function syntheticTension(s) {
    var def = s.defense || 0, thr = s.threat || 0;
    var t = (thr - def) / 60;
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function stanceForTension(t, ctx) { return t >= ctx.syntheticThreshold ? 'hostile' : ctx.rootStance; }

  /* ---------- fixed-quantum transition ----------
     Advances exactly controlQuantumTicks of environment time by calling the
     UNCHANGED v2 step() that many times. Action durations and cooldowns are
     W0-A' work and are deliberately absent. */
  /* v2 step() MUTATES state in place and returns {terminal, terminalValue}.
     A quantum is controlQuantumTicks env steps. If the environment declares a
     terminal mid-quantum, the transition ends there: a terminal is a terminal,
     not a padded quantum. The fixed-quantum invariant therefore applies to every
     NON-terminal transition, which is what search comparability requires. */
  function stepQuantum(state, actionIdx, ctx, rng) {
    var errs = validateContext(ctx);
    if (errs.length) throw new Error('stepQuantum: ' + errs.join('; '));
    var advanced = 0, envTerminal = false, envTerminalValue = 0;
    for (var i = 0; i < ctx.controlQuantumTicks; i++) {
      var r = base.sim.step(state, actionIdx, rng);
      advanced++;
      if (r && r.terminal) { envTerminal = true; envTerminalValue = r.terminalValue; break; }
    }
    return {
      state: state, ticksAdvanced: advanced,
      fullQuantum: advanced === ctx.controlQuantumTicks,
      envTerminal: envTerminal, envTerminalValue: envTerminalValue
    };
  }

  /* ---------- pure terminal predicates ----------
     Only explicit, directly checkable state conditions. "Irreversibly failed" is
     not among them. Returns {terminal, kind, value|null, requiresReplan, ...}. */
  function evaluateNode(state, ctx, quantaElapsed, objective, envTerminal, envTerminalValue) {
    var tension = syntheticTension(state);
    var predicted = stanceForTension(tension, ctx);

    if (predicted !== ctx.rootStance) {
      return {
        terminal: true, kind: 'replan-boundary', requiresReplan: true,
        predictedNextStance: predicted, reason: 'synthetic_tension_threshold_crossed',
        stanceModelVersion: ctx.stanceModelVersion, syntheticTension: tension,
        value: base.sim.heuristicValue(state),   // current search's unchanged leaf
        transitionBonus: 0                       // never a bonus
      };
    }
    if (objective && typeof objective.complete === 'function' && objective.complete(state)) {
      return { terminal: true, kind: 'objective-complete', requiresReplan: false, value: 1.0, transitionBonus: 0 };
    }
    if (objective && typeof objective.destroyed === 'function' && objective.destroyed(state)) {
      return { terminal: true, kind: 'protected-object-destroyed', requiresReplan: false, value: -1.0, transitionBonus: 0 };
    }
    if ((state.population || 0) <= 0) {
      return { terminal: true, kind: 'faction-eliminated', requiresReplan: false, value: -1.0, transitionBonus: 0 };
    }
    if (envTerminal) {
      return { terminal: true, kind: 'environment-terminal', requiresReplan: false,
        value: envTerminalValue, transitionBonus: 0 };
    }
    if (objective && objective.deadlineTick != null && base.sim.tick(state) >= objective.deadlineTick) {
      return { terminal: true, kind: 'deadline-incomplete', requiresReplan: false, value: -1.0, transitionBonus: 0 };
    }
    if (quantaElapsed >= ctx.horizonQuanta) {
      return { terminal: true, kind: 'horizon', requiresReplan: false, value: base.sim.heuristicValue(state), transitionBonus: 0 };
    }
    return { terminal: false, kind: null, requiresReplan: false, value: null, transitionBonus: 0 };
  }

  /* ---------- root-frozen legal mask ----------
     Recomputed per node from live state, but the STANCE it is computed under is
     always ctx.rootStance. Next-stance actions never appear inside this tree. */
  function legalMask(state, ctx, out) {
    var errs = validateContext(ctx);
    if (errs.length) throw new Error('legalMask: ' + errs.join('; '));
    var m = out || new Uint8Array(base.actions.length);
    base.sim.legalMask(state, m);
    return m;
  }

  /* ---------- leaf record: identity carried by every backed-up value ---------- */
  function leafRecord(state, ctx, leafContentHash) {
    return {
      leaf_version: ctx.leafVersion,
      leaf_content_hash: leafContentHash || null,
      search_context_hash: contextHash(ctx),
      root_stance: ctx.rootStance,
      objective_profile_id: ctx.objectiveProfileId,
      value: base.sim.heuristicValue(state)
    };
  }

  var v3 = {
    id: 'azl-reference-colony-w0s', version: 3, schemaVersion: SCHEMA_VERSION,
    isReferenceSimulator: true,
    baseAdapterId: base.id, baseAdapterVersion: base.version,
    STANCES: STANCES, DEV_DEFAULTS: DEV_DEFAULTS, REQUIRED_CONTEXT_FIELDS: REQUIRED,
    LEAF_VERSION: LEAF_VERSION, STANCE_MODEL: STANCE_MODEL,
    createSearchContext: createSearchContext,
    validateContext: validateContext,
    contextCanonical: contextCanonical,
    contextHash: contextHash,
    transitionBudget: transitionBudget,
    syntheticTension: syntheticTension,
    stanceForTension: stanceForTension,
    stepQuantum: stepQuantum,
    evaluateNode: evaluateNode,
    legalMask: legalMask,
    leafRecord: leafRecord,
    canonical: canonical, hash64: hash64,
    sim: base.sim, actions: base.actions   // read-through; v2 dynamics unchanged
  };

  AZL.ReferenceAdapterV3 = v3;
  if (typeof module !== 'undefined' && module.exports) module.exports = v3;
})(typeof self !== 'undefined' ? self : globalThis);
