/* AZL Reference Adapter + ZekNovaAdapter CONTRACT (the single game integration point).
 *
 * HONEST LABEL: this file ships a REFERENCE colony simulator implementing the full
 * adapter contract. It exists so the entire pipeline (codec -> MCTS -> training ->
 * federation -> eval) runs end-to-end, deterministically, before the real ZekNova
 * state is bound. It is NOT the production game. Binding the real game = implementing
 * this same object shape over real ZekNova state (see docs/DEPLOYMENT.md section 6).
 *
 * ---------------------------- ADAPTER CONTRACT ----------------------------
 * adapter = {
 *   id, version (u32), safeActionIndex,
 *   actions: [{key,label}],                  // order pins ACTION_SPACE_V
 *   baseFeatureSpec: [{key,min,max,def}],    // raw ranges; codec normalizes to [-1,1]
 *   oracleGroups: {resources,threat,population,construction,mobility,health:[featureIdx..]},
 *   relational: {distThresh},
 *   relationalActionBias(aux, out[-1..1 per action])   // optional
 *   captureSearchState()                      // MAIN THREAD live game only: snapshot
 *                                             // real state into a sim-state object
 *   sim: {                                    // pure, worker-safe, deterministic
 *     init(seed) -> state
 *     clone(state) -> state
 *     step(state, actionId, rng) -> {terminal:bool, terminalValue:[-1,1]}  (mutates state)
 *     legalMask(state, outUint8)
 *     toBaseFeatures(state, outFloat32)       // RAW values; codec normalizes
 *     heuristicValue(state) -> [-1,1]         // existing hand evaluator (safety floor)
 *     actionScores(state, outFloat32)         // hand action scores (Level-3 fallback)
 *     entities(state) -> [{id,type,x,y,threat,hostile,critical,deps:[]}]
 *     health(state) -> [-1,1]                 // outcome/target signal
 *     tick(state) -> int
 *   }
 * }
 * ------------------------------------------------------------------------- */
(function (g) {
  'use strict';
  var AZL = g.AZL, U = AZL.Util;
  var ACTIONS = [
    { key: 'gather_food', label: 'Gather food' }, { key: 'gather_energy', label: 'Gather energy' },
    { key: 'gather_materials', label: 'Gather materials' }, { key: 'trade', label: 'Trade surplus' },
    { key: 'build_defense', label: 'Build defenses' }, { key: 'build_housing', label: 'Build housing' },
    { key: 'build_infra', label: 'Build infrastructure' }, { key: 'recruit', label: 'Recruit colonists' },
    { key: 'defend', label: 'Active defense' }, { key: 'diplomacy_talks', label: 'Diplomacy talks' },
    { key: 'explore', label: 'Explore region' }, { key: 'stabilize', label: 'Stabilize colony' }
  ];
  var SESSION_TICKS = 2400;
  function mkSpec() {
    var s = [], push = function (k, mn, mx, df) { s.push({ key: k, min: mn, max: mx, def: df }); };
    push('food', 0, 200, 50); push('energy', 0, 200, 50); push('materials', 0, 200, 50); push('credits', 0, 400, 60);
    push('population', 0, 120, 20); push('housing', 0, 120, 24); push('morale', 0, 1, 0.6);
    push('defense', 0, 100, 10); push('infra', 0, 100, 8); push('threat', 0, 100, 8);
    push('threatGrowth', -2, 4, 0.4); push('diplomacy', -1, 1, 0); push('mobility', 0, 1, 0.8);
    push('constructionQ', 0, 10, 0); push('constructionP', 0, 1, 0); push('explored', 0, 1, 0.1);
    push('tick', 0, SESSION_TICKS, 0); push('foodRate', -5, 8, 1); push('energyRate', -5, 8, 1);
    push('matRate', -5, 8, 0.8); push('popPressure', 0, 3, 0.5); push('threatRatio', 0, 5, 0.5);
    push('healthC', -1, 1, 0);
    // per-region (4 regions x 6 features = 24) -> total 47? pad to 56 with derived
    for (var r = 0; r < 4; r++) {
      push('r' + r + '_res', 0, 100, 30); push('r' + r + '_threat', 0, 100, 5);
      push('r' + r + '_access', 0, 1, r === 0 ? 1 : 0.3); push('r' + r + '_dev', 0, 100, r === 0 ? 20 : 0);
      push('r' + r + '_hostiles', 0, 20, 0); push('r' + r + '_link', 0, 1, r === 0 ? 1 : 0);
    }
    while (s.length < 56) push('pad' + s.length, 0, 1, 0);
    return s;
  }
  var SPEC = mkSpec();
  var IDX = {}; SPEC.forEach(function (f, i) { IDX[f.key] = i; });
  function init(seed) {
    var rng = new U.RNG(seed || 42);
    var st = { seed: seed >>> 0, t: 0, food: 50, energy: 50, materials: 50, credits: 60, population: 20, housing: 24, morale: 0.6, defense: 10, infra: 8, threat: 8, threatGrowth: 0.35 + rng.next() * 0.2, diplomacy: 0, mobility: 0.8, constructionQ: 0, constructionP: 0, explored: 0.1, regions: [], rngState: 0 };
    for (var r = 0; r < 4; r++) st.regions.push({ res: 25 + rng.next() * 30, threat: r * 4 + rng.next() * 6, access: r === 0 ? 1 : 0.25 + rng.next() * 0.2, dev: r === 0 ? 20 : 0, hostiles: r > 1 ? rng.int(3) : 0, link: r === 0 ? 1 : 0 });
    st.rngState = rng.state();
    return st;
  }
  function clone(s) {
    var c = { seed: s.seed, t: s.t, food: s.food, energy: s.energy, materials: s.materials, credits: s.credits, population: s.population, housing: s.housing, morale: s.morale, defense: s.defense, infra: s.infra, threat: s.threat, threatGrowth: s.threatGrowth, diplomacy: s.diplomacy, mobility: s.mobility, constructionQ: s.constructionQ, constructionP: s.constructionP, explored: s.explored, rngState: s.rngState, regions: [] };
    for (var i = 0; i < s.regions.length; i++) { var r = s.regions[i]; c.regions.push({ res: r.res, threat: r.threat, access: r.access, dev: r.dev, hostiles: r.hostiles, link: r.link }); }
    return c;
  }
  function health(s) {
    var res = Math.min(1, (s.food + s.energy + s.materials) / 240);
    var pop = Math.min(1, s.population / 60) * s.morale;
    var safety = 1 / (1 + Math.max(0, s.threat - s.defense) / 25);
    var growth = Math.min(1, (s.infra + s.explored * 30) / 80);
    return U.clamp((res * 0.3 + pop * 0.3 + safety * 0.25 + growth * 0.15) * 2 - 1, -1, 1);
  }
  function legalMask(s, out) {
    out.fill(1);
    if (s.materials < 8) { out[4] = 0; out[5] = 0; out[6] = 0; }
    if (s.credits < 5) out[3] = s.food > 80 || s.energy > 80 || s.materials > 80 ? 1 : 0;
    if (s.population >= s.housing) out[7] = 0;
    if (s.credits < 8) out[9] = 0;
    if (s.mobility < 0.2) out[10] = 0;
    if (s.energy < 4) { out[8] = 0; out[10] = 0; }
  }
  function step(s, a, rng) {
    var noise = function (k) { return (rng.next() - 0.5) * k; };
    var eat = s.population * 0.06, burn = s.population * 0.04 + s.infra * 0.02;
    s.food += 1 + s.infra * 0.02 - eat; s.energy += 1 + s.infra * 0.03 - burn; s.materials += 0.4;
    switch (a) {
      case 0: s.food += 5 + s.population * 0.05 + noise(2); break;
      case 1: s.energy += 5 + s.infra * 0.08 + noise(2); break;
      case 2: s.materials += 4 + noise(1.5); s.energy -= 1; break;
      case 3: { var surplus = Math.max(0, s.food - 60) + Math.max(0, s.energy - 60) + Math.max(0, s.materials - 60);
        var sold = Math.min(20, surplus); s.credits += sold * 0.8 + noise(1); s.food -= sold * 0.4; s.energy -= sold * 0.3; s.materials -= sold * 0.3; break; }
      case 4: s.materials -= 8; s.defense += 4 + noise(1); s.constructionQ = Math.min(10, s.constructionQ + 1); break;
      case 5: s.materials -= 8; s.housing += 5; s.constructionQ = Math.min(10, s.constructionQ + 1); break;
      case 6: s.materials -= 8; s.energy -= 2; s.infra += 3 + noise(0.5); s.constructionQ = Math.min(10, s.constructionQ + 1); break;
      case 7: if (s.population < s.housing) { s.population += 2; s.credits -= 3; } break;
      case 8: { s.energy -= 4; var rep = Math.min(s.threat, s.defense * 0.35 + s.population * 0.05 + noise(2)); s.threat -= Math.max(0, rep); s.morale += 0.01; break; }
      case 9: s.credits -= 8; s.diplomacy = U.clamp(s.diplomacy + 0.08 + noise(0.04), -1, 1); s.threatGrowth = Math.max(0.05, s.threatGrowth - 0.02); break;
      case 10: { s.energy -= 3; s.explored = Math.min(1, s.explored + 0.05);
        var r = s.regions[1 + rng.int(3)]; r.access = Math.min(1, r.access + 0.15); r.link = r.access > 0.6 ? 1 : r.link;
        s.credits += 2 + noise(2); break; }
      case 11: s.morale = U.clamp(s.morale + 0.03, 0, 1); s.food -= 1; s.energy -= 1; s.threat = Math.max(0, s.threat - 0.5); break;
    }
    // construction pipeline
    if (s.constructionQ > 0) { s.constructionP += 0.25 * s.mobility; if (s.constructionP >= 1) { s.constructionP = 0; s.constructionQ--; } }
    // threat evolution + hostiles pressure
    s.threat += s.threatGrowth * (1 - s.diplomacy * 0.4) + noise(0.6);
    var hostiles = 0; for (var i2 = 0; i2 < 4; i2++) hostiles += s.regions[i2].hostiles;
    if (rng.next() < 0.02) s.regions[1 + rng.int(3)].hostiles++;
    s.threat += hostiles * 0.05;
    if (s.threat > s.defense + 20) { // raid
      var dmg = (s.threat - s.defense) * 0.05;
      s.population = Math.max(0, s.population - dmg * 0.5); s.food = Math.max(0, s.food - dmg); s.morale = U.clamp(s.morale - 0.02, 0, 1);
      s.threat *= 0.85;
    }
    s.mobility = U.clamp(0.9 - Math.max(0, s.threat - s.defense) / 120 - (s.constructionQ > 6 ? 0.15 : 0), 0.05, 1);
    if (s.food <= 0) { s.population = Math.max(0, s.population - 1); s.morale = U.clamp(s.morale - 0.03, 0, 1); s.food = 0; }
    if (s.energy < 0) s.energy = 0; if (s.materials < 0) s.materials = 0; if (s.credits < 0) s.credits = 0;
    s.threat = U.clamp(s.threat, 0, 100); s.defense = U.clamp(s.defense, 0, 100); s.infra = U.clamp(s.infra, 0, 100);
    s.housing = Math.min(120, s.housing); s.population = Math.min(120, s.population);
    s.t++;
    var terminal = false, tv = 0;
    if (s.population <= 0) { terminal = true; tv = -1; }
    else if (s.t >= SESSION_TICKS) { terminal = true; tv = health(s); }
    return { terminal: terminal, terminalValue: tv };
  }
  function toBaseFeatures(s, out) {
    out[IDX.food] = s.food; out[IDX.energy] = s.energy; out[IDX.materials] = s.materials; out[IDX.credits] = s.credits;
    out[IDX.population] = s.population; out[IDX.housing] = s.housing; out[IDX.morale] = s.morale;
    out[IDX.defense] = s.defense; out[IDX.infra] = s.infra; out[IDX.threat] = s.threat;
    out[IDX.threatGrowth] = s.threatGrowth; out[IDX.diplomacy] = s.diplomacy; out[IDX.mobility] = s.mobility;
    out[IDX.constructionQ] = s.constructionQ; out[IDX.constructionP] = s.constructionP; out[IDX.explored] = s.explored;
    out[IDX.tick] = s.t; out[IDX.foodRate] = 1 + s.infra * 0.02 - s.population * 0.06;
    out[IDX.energyRate] = 1 + s.infra * 0.03 - s.population * 0.04; out[IDX.matRate] = 0.4;
    out[IDX.popPressure] = s.housing > 0 ? s.population / s.housing : 3;
    out[IDX.threatRatio] = s.defense > 0 ? s.threat / s.defense : 5;
    out[IDX.healthC] = health(s);
    for (var r = 0; r < 4; r++) {
      var reg = s.regions[r], b = IDX['r' + r + '_res'];
      out[b] = reg.res; out[b + 1] = reg.threat; out[b + 2] = reg.access; out[b + 3] = reg.dev; out[b + 4] = reg.hostiles; out[b + 5] = reg.link;
    }
    for (var i = IDX['r3_link'] + 1; i < SPEC.length; i++) out[i] = 0;
  }
  function heuristicValue(s) { return health(s); }
  function actionScores(s, out) {
    out.fill(0);
    out[0] = (60 - s.food) / 30; out[1] = (60 - s.energy) / 30; out[2] = (40 - s.materials) / 25;
    out[3] = (s.food > 90 || s.energy > 90) ? 1 : -0.5;
    out[4] = (s.threat - s.defense) / 15; out[5] = (s.population / Math.max(1, s.housing)) * 2 - 1;
    out[6] = (30 - s.infra) / 25; out[7] = s.population < s.housing - 4 ? 0.8 : -1;
    out[8] = (s.threat - s.defense) / 12; out[9] = s.threatGrowth > 0.4 ? 0.7 : 0;
    out[10] = (0.6 - s.explored); out[11] = s.morale < 0.4 ? 1 : 0.05;
  }
  function entities(s) {
    var e = [{ id: 'colony', type: 'core', x: 0, y: 0, threat: U.clamp((s.threat - s.defense) / 60, 0, 1), hostile: false, critical: true, deps: ['r0'] }];
    for (var r = 0; r < 4; r++) {
      var reg = s.regions[r];
      e.push({ id: 'r' + r, type: 'region', x: r * 6, y: 0, threat: U.clamp(reg.threat / 60, 0, 1), hostile: false, critical: r === 0, deps: r > 0 && reg.link ? ['r' + (r - 1)] : [] });
      if (reg.hostiles > 0) e.push({ id: 'h' + r, type: 'hostile', x: r * 6 + 2, y: 3, threat: U.clamp(reg.hostiles / 6, 0, 1), hostile: true, critical: false, deps: [] });
    }
    return e;
  }
  var adapter = {
    id: 'azl-reference-colony', version: 1, safeActionIndex: 11,
    isReferenceSimulator: true, // honest label - real ZekNova binding replaces this flag
    actions: ACTIONS, baseFeatureSpec: SPEC,
    oracleGroups: {
      resources: [IDX.food, IDX.energy, IDX.materials, IDX.credits, IDX.foodRate, IDX.energyRate],
      threat: [IDX.threat, IDX.threatGrowth, IDX.threatRatio],
      population: [IDX.population, IDX.morale, IDX.popPressure],
      construction: [IDX.constructionQ, IDX.constructionP, IDX.infra],
      mobility: [IDX.mobility, IDX.explored],
      health: [IDX.healthC]
    },
    relational: { distThresh: 7 },
    relationalActionBias: function (aux, out) {
      out.fill(0);
      if (aux.threatened.length) { out[4] += 0.6; out[8] += 0.6; }     // defend what is exposed
      if (aux.depFailures.length || aux.isolated.length) out[10] += 0.5; // reconnect via exploration
      if (aux.bottlenecks.length) out[6] += 0.4;                        // infra relieves bottlenecks
    },
    captureSearchState: function () { return null; }, // live-game binding supplies this
    sim: { init: init, clone: clone, step: step, legalMask: legalMask, toBaseFeatures: toBaseFeatures, heuristicValue: heuristicValue, actionScores: actionScores, entities: entities, health: health, tick: function (s) { return s.t; } }
  };
  AZL.ReferenceAdapter = adapter;
})(typeof self !== 'undefined' ? self : globalThis);
