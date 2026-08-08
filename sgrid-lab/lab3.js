#!/usr/bin/env node
/* Sentinel Grid Stage 1A - Scenario Solvability & Behavioral Validity Certification
 * Certifies that each declared scenario is (1) deterministically losable,
 * (2) deterministically solvable, (3) solvable BECAUSE OF objective-related behavior.
 * Env: reference-colony v2 (azl-ref-adapter-v2.js) - dynamics UNCHANGED, no env v3.
 * Frozen results-v1-health-proxy/ and results-v2/ are never touched.
 * Commands: preflight | scenario-conformance | scenario-smoke | certify [--scenario id]
 *           [--tier smoke|development|certification] | negative | scenario-report
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const ENG = path.join(__dirname, '..', 'public_html', 'azl');

/* ---------- GUARDRAILS-v2 7 evidence-target containment (W0-G.1) ----------
 * Attested evidence is never a write target. Read-shaped commands fall back to a
 * temp directory; evidence-generating commands require an explicit --output-dir. */
const GUARD = require('./governance/frozen-guard');
const GCTX = GUARD.loadGovernanceContext(path.join(__dirname, '..'));
const DEFAULT_OUT = path.join(__dirname, 'results-v2.1', 'scenario-certification');
const EVIDENCE_GENERATING = new Set(['certify', 'scenario-report']);
const OUT = (() => {
  const cmd0 = process.argv[2] || 'help';
  const i = process.argv.indexOf('--output-dir');
  const explicit = i > 0 ? path.resolve(process.argv[i + 1]) : null;
  const target = explicit || DEFAULT_OUT;
  const v = GUARD.checkWritableEvidenceTarget(target, GCTX);
  if (v.writable) return target;
  if (explicit) {
    console.error('lab3: refusing --output-dir; ' + v.reason);
    process.exit(2);
  }
  if (EVIDENCE_GENERATING.has(cmd0)) {
    console.error('lab3: "' + cmd0 + '" generates evidence and the default output path is attested frozen.');
    console.error('      ' + v.reason);
    console.error('      re-run with: node lab3.js ' + cmd0 + ' --output-dir <scratch path>');
    process.exit(2);
  }
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sgrid-lab3-'));
})();
GUARD.assertWritableEvidenceTarget(OUT, GCTX);
['', 'witnesses', 'traces', 'blocked', 'negative-fixtures'].forEach(d => fs.mkdirSync(path.join(OUT, d), { recursive: true }));
const MODULES = ['azl-config.js','azl-util.js','azl-state.js','azl-nn.js','azl-scout.js','azl-strategist.js',
 'azl-oracle.js','azl-relational.js','azl-mcts.js','azl-router.js','azl-weights.js','azl-federated.js',
 'azl-eval.js','azl-ref-adapter-v2.js'];
MODULES.forEach(f => require(path.join(ENG, f)));
const AZL = globalThis.AZL, U = AZL.Util, ad = AZL.ReferenceAdapter;
const A = ad.actions.length, SAFE = ad.safeActionIndex; // 11 = stabilize, never masked
const sha = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 16);
const save = (rel, o) => { const p = path.join(OUT, rel); GUARD.assertWritableEvidenceTarget(p, GCTX); fs.writeFileSync(p, JSON.stringify(o, null, 1)); };
const load = rel => { const p = path.join(OUT, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };

/* ---------- snapshotable xorshift32 (lab-local; algorithm identical to U.RNG) ----------
 * U.RNG holds its state in a closure and cannot be snapshotted; env dynamics only call
 * rng.next(), so a state-exposing twin is a pure lab addition, not an env change. */
class XRNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() { let s = this.s; s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; this.s = s; return s / 4294967296; }
  int(n) { return (this.next() * n) | 0; }
}

/* ---------- action categories ---------- */
const CAT = { gather: [0, 1, 2], trade: [3], defense: [4, 8], housing: [5], infra: [6],
  recruit: [7], diplomacy: [9], explore: [10], stabilize: [11] };
const catOf = a => Object.keys(CAT).find(k => CAT[k].includes(a));

/* ---------- objective-progress interface (pure functions of state + scenario) ---------- */
const clamp01 = x => Math.max(0, Math.min(1, x));
function objectiveProgress(state, scen) {
  const s = state, o = scen.objectiveSpec; let progress = 0, complete = false, failed = false, reason = null;
  const m = {};
  if (s.population <= 0) return { progress: 0, complete: false, failed: true, reason: 'colony_collapse', metrics: { population: 0 }, version: '1' };
  switch (o.kind) {
    case 'sustain-grow': { // survive to horizon, keep pop floor, modest growth
      m.pop = s.population; m.tick = s.t;
      const surv = clamp01(s.t / scen.maximumTicks), grow = clamp01((s.population - o.initPop) / o.growth), floor = s.population >= o.popFloor ? 1 : s.population / o.popFloor;
      progress = 0.45 * surv + 0.35 * grow + 0.20 * floor;
      complete = s.t >= scen.maximumTicks && s.population >= o.popFloor && s.population >= o.initPop + o.growth;
      reason = complete ? 'sustained_and_grew' : null; break; }
    case 'resource-runway': {
      m.food = s.food; m.energy = s.energy; m.pop = s.population;
      progress = 0.4 * clamp01(s.food / o.food) + 0.4 * clamp01(s.energy / o.energy) + 0.2 * clamp01(s.population / o.popFloor);
      complete = s.food >= o.food && s.energy >= o.energy && s.population >= o.popFloor && s.t <= scen.maximumTicks;
      reason = complete ? 'runway_restored' : null; break; }
    case 'threat-endure': {
      m.defense = s.defense; m.pop = s.population; m.tick = s.t;
      progress = 0.5 * clamp01(s.t / scen.maximumTicks) + 0.25 * clamp01(s.population / o.popFloor) + 0.25 * clamp01(s.defense / o.defense);
      complete = s.t >= scen.maximumTicks && s.population >= o.popFloor && s.defense >= o.defense;
      reason = complete ? 'pressure_endured' : null; break; }
    case 'recover': {
      m.pop = s.population; m.food = s.food; m.threatMargin = s.threat - s.defense;
      progress = 0.4 * clamp01(s.population / o.pop) + 0.3 * clamp01(s.food / o.food) + 0.3 * clamp01(1 - Math.max(0, s.threat - s.defense - o.margin) / 30);
      complete = s.population >= o.pop && s.food >= o.food && (s.threat - s.defense) < o.margin && s.t <= scen.maximumTicks;
      reason = complete ? 'capability_restored' : null; break; }
    case 'deadline-build': {
      m.defense = s.defense; m.housing = s.housing; m.tick = s.t;
      progress = 0.5 * clamp01(s.defense / o.defense) + 0.5 * clamp01(s.housing / o.housing);
      complete = s.defense >= o.defense && s.housing >= o.housing && s.t <= o.deadline; // after deadline never counts
      if (s.t > o.deadline && !complete) { failed = true; reason = 'deadline_missed'; }
      else reason = complete ? 'built_in_time' : null; break; }
    case 'fx-const': { progress = clamp01(s[o.field] / o.target); complete = s[o.field] >= o.target; break; }
  }
  return { progress: +progress.toFixed(4), complete, failed, reason, metrics: m, version: '1' };
}

/* ---------- additive adapter extension (legacy ad untouched; opt-in via feature detection) ---------- */
const adX = Object.assign(Object.create(ad), {
  getScenarioDefinition: id => SCEN[id] || null,
  getObjectiveProgress: (state, scen) => objectiveProgress(state, scen),
  getTerminalOutcome: (state, scen) => { const p = objectiveProgress(state, scen);
    return { survived: state.population > 0, objectiveComplete: p.complete, objectiveFailed: p.failed, progress: p.progress }; },
  getScenarioMetrics: (state, scen) => objectiveProgress(state, scen).metrics,
});

/* ---------- scenario definitions ---------- */
const TH = { fullWitnessMinimumCompletionRate: 0.80, ablatedMaximumCompletionRate: 0.20,
  minimumProgressDifference: 0.25, minimumPairedSeeds: 30, revisionVersion: 0 };
const SCEN = {
  'stable-baseline': { id: 'stable-baseline', version: '1', title: 'Stable Baseline',
    objective: 'Maintain viability and achieve modest population growth over the full horizon',
    objectiveSpec: { kind: 'sustain-grow', initPop: 20, growth: 4, popFloor: 14 },
    initialStateParameters: {}, maximumTicks: 1200,
    relevantActionCategories: ['gather', 'defense', 'recruit', 'housing'],
    prohibitedShortcutBehaviors: [{ id: 'stab-dominance', actionCategory: 'stabilize', maxActionShare: 0.60,
      detector: 'action-share', rationale: 'waiting forever must not satisfy a growth objective' }],
    behavioralThreshold: { ...TH }, ablatedCategories: ['gather'],
    failureWitness: 'SPAM-recruit', successWitness: 'GUARDIAN', successWitnessType: 'scripted' },
  'scarcity': { id: 'scarcity', version: '1', title: 'Scarcity',
    objective: 'Restore food and energy runway to sustainable levels while preserving a viable population',
    objectiveSpec: { kind: 'resource-runway', food: 60, energy: 60, popFloor: 10 },
    initialStateParameters: { food: 12, energy: 12, materials: 6, credits: 6, population: 18 }, maximumTicks: 600,
    relevantActionCategories: ['gather', 'trade'],
    prohibitedShortcutBehaviors: [{ id: 'explore-spam', actionCategory: 'explore', maxActionShare: 0.50,
      detector: 'action-share', rationale: 'exploration is unrelated to the resource-restoration objective' }],
    behavioralThreshold: { ...TH }, ablatedCategories: ['gather', 'trade'],
    failureWitness: 'STAB', successWitness: 'HARVESTER', successWitnessType: 'scripted' },
  'escalating-threat': { id: 'escalating-threat', version: '1', title: 'Escalating Threat',
    objective: 'Survive strong escalating pressure to the horizon while preserving population and building real defense',
    objectiveSpec: { kind: 'threat-endure', popFloor: 12, defense: 28 },
    initialStateParameters: { threatGrowth: 0.9, threat: 20 }, maximumTicks: 1200,
    relevantActionCategories: ['defense', 'diplomacy', 'gather'],
    prohibitedShortcutBehaviors: [{ id: 'pop-elimination', actionCategory: 'recruit', maxActionShare: 0.0,
      detector: 'ghost-colony', rationale: 'surviving by never supporting population is the ghost-colony exploit' }],
    behavioralThreshold: { ...TH }, ablatedCategories: ['defense', 'diplomacy'],
    failureWitness: 'C0', successWitness: 'SENTINEL-SCRIPT', successWitnessType: 'scripted' },
  'recovery': { id: 'recovery', version: '2', title: 'Recovery',
    objective: 'Recover a damaged, raided colony to population viability, food stability, and safety',
    objectiveSpec: { kind: 'recover', pop: 14, food: 40, margin: 12 },
    initialStateParameters: { population: 7, housing: 20, food: 9, energy: 16, materials: 24, credits: 10, defense: 10, threat: 26, threatGrowth: 0.7, morale: 0.25 },
    maximumTicks: 800, relevantActionCategories: ['defense', 'gather', 'recruit'],
    prohibitedShortcutBehaviors: [{ id: 'infra-spam', actionCategory: 'infra', maxActionShare: 0.40,
      detector: 'action-share', rationale: 'building unrelated infrastructure is not recovery' }],
    behavioralThreshold: { ...TH }, ablatedCategories: ['defense', 'recruit'],
    failureWitness: 'STAB', successWitness: 'MEDIC', successWitnessType: 'scripted' },
  'infrastructure-dependency': { id: 'infrastructure-dependency', version: '1', title: 'Infrastructure Dependency',
    objective: 'Protect, repair, or reroute a causal dependency', objectiveSpec: { kind: 'blocked' },
    initialStateParameters: {}, maximumTicks: 0, relevantActionCategories: [], prohibitedShortcutBehaviors: [],
    behavioralThreshold: { ...TH }, ablatedCategories: [], failureWitness: null, successWitness: null, successWitnessType: null },
  'deadline': { id: 'deadline', version: '1', title: 'Deadline',
    objective: 'Construct required defensive and housing capability before a fixed deadline',
    objectiveSpec: { kind: 'deadline-build', defense: 34, housing: 44, deadline: 520 },
    initialStateParameters: {}, maximumTicks: 520,
    relevantActionCategories: ['defense', 'housing', 'gather'],
    prohibitedShortcutBehaviors: [{ id: 'explore-spam', actionCategory: 'explore', maxActionShare: 0.50,
      detector: 'action-share', rationale: 'exploration does not construct the required capability' }],
    behavioralThreshold: { ...TH }, ablatedCategories: ['defense', 'housing'],
    failureWitness: 'C0', successWitness: 'FOREMAN', successWitnessType: 'scripted' },
};

/* ---------- scenario schema validation ---------- */
function validateScenario(sc) {
  const errs = [];
  if (!sc.id || !sc.version || !sc.objective) errs.push('missing id/version/objective');
  if (sc.successWitnessType === 'model-dependent' && !sc.modelDependentCaveat) errs.push('model-dependent witness missing permanent caveat');
  (sc.prohibitedShortcutBehaviors || []).forEach(p => { if (!p.detector) errs.push('prohibited shortcut "' + p.id + '" has no active detector'); });
  if (sc.behavioralThreshold && sc.behavioralThreshold.revisionVersion > 1) errs.push('behavioral threshold revised more than once');
  return errs;
}

/* ---------- witness controllers (deterministic, mask-aware, auditable) ---------- */
function pick(mask, prefs) { for (const [a, reason] of prefs) if (a >= 0 && mask[a]) return { a, reason }; return { a: SAFE, reason: 'fallback: stabilize' }; }
const CONTROLLERS = {
  GUARDIAN: { id: 'GUARDIAN', version: '2', mk: scen => (s, mask) => pick(mask, [
    [s.threat > s.defense + 6 ? 4 : -1, 'threat margin low -> build defense'],
    [s.threat > s.defense + 6 ? 8 : -1, 'threat margin low -> active defense'],
    [s.food < 32 ? 0 : -1, 'food buffer low -> gather food'],
    [s.energy < 26 ? 1 : -1, 'energy buffer low -> gather energy'],
    [s.materials < 12 ? 2 : -1, 'materials low -> gather materials'],
    [s.diplomacy < 0.45 && s.threatGrowth > 0.55 ? 9 : -1, 'pressure growing -> diplomacy'],
    [s.population >= s.housing - 3 && s.population < scen.objectiveSpec.initPop + scen.objectiveSpec.growth + 2 ? 5 : -1, 'housing tight -> build housing'],
    [s.population < scen.objectiveSpec.initPop + scen.objectiveSpec.growth && s.food > 30 && s.energy > 22 && s.credits >= 3 ? 7 : -1, 'growth objective -> recruit'],
    [s.credits < 6 && s.population < scen.objectiveSpec.initPop + scen.objectiveSpec.growth ? 10 : -1, 'fund recruitment -> explore'],
    [s.materials < 30 ? 2 : -1, 'stock materials'], [11, 'steady state -> stabilize']]) },
  HARVESTER: { id: 'HARVESTER', version: '1', mk: scen => (s, mask) => pick(mask, [
    [s.threat > s.defense + 10 ? 8 : -1, 'raid imminent -> defend'],
    [s.food < scen.objectiveSpec.food + 6 ? 0 : -1, 'runway objective -> gather food'],
    [s.energy < scen.objectiveSpec.energy + 6 ? 1 : -1, 'runway objective -> gather energy'],
    [s.materials < 10 ? 2 : -1, 'materials floor'], [11, 'hold -> stabilize']]) },
  'SENTINEL-SCRIPT': { id: 'SENTINEL-SCRIPT', version: '1', mk: scen => (s, mask) => pick(mask, [
    [s.food < 24 ? 0 : -1, 'food floor -> gather food'],
    [s.energy < 20 ? 1 : -1, 'energy floor -> gather energy'],
    [s.threat > s.defense + 2 && s.materials >= 8 ? 4 : -1, 'escalation -> build defense'],
    [s.threat > s.defense + 2 ? 8 : -1, 'escalation -> active defense'],
    [s.diplomacy < 0.6 ? 9 : -1, 'cut threat growth -> diplomacy'],
    [s.defense < scen.objectiveSpec.defense && s.materials >= 8 ? 4 : -1, 'defense objective -> build defense'],
    [s.materials < 24 ? 2 : -1, 'stock materials for defense'],
    [s.population < scen.objectiveSpec.popFloor + 2 && s.food > 34 ? 7 : -1, 'population floor -> recruit'],
    [11, 'hold -> stabilize']]) },
  MEDIC: { id: 'MEDIC', version: '3', mk: scen => (s, mask) => pick(mask, [
    [s.threat > s.defense + 10 && s.energy >= 4 ? 8 : -1, 'stop raids -> active defense'],
    [s.threat > s.defense + 10 && s.materials >= 8 ? 4 : -1, 'stop raids -> build defense'],
    [s.threat > s.defense + 10 ? 11 : -1, 'stop raids -> stabilize'],
    [s.food < scen.objectiveSpec.food + 4 ? 0 : -1, 'restore food to objective'],
    [s.energy < 18 ? 1 : -1, 'restore energy'],
    [s.population < scen.objectiveSpec.pop + 2 && s.food > 30 && s.credits >= 3 ? 7 : -1, 'restore population -> recruit'],
    [s.credits < 9 && s.population < scen.objectiveSpec.pop + 2 ? 10 : -1, 'fund recruitment -> explore'],
    [s.materials < 10 ? 2 : -1, 'materials floor'],
    [s.threat > s.defense + 4 ? 8 : -1, 'consolidate safety'], [11, 'consolidate -> stabilize']]) },
  FOREMAN: { id: 'FOREMAN', version: '1', mk: scen => (s, mask) => pick(mask, [
    [s.food < 22 ? 0 : -1, 'food floor'], [s.energy < 18 ? 1 : -1, 'energy floor'],
    [s.defense < scen.objectiveSpec.defense && s.materials >= 8 ? 4 : -1, 'deadline objective -> build defense'],
    [s.housing < scen.objectiveSpec.housing && s.materials >= 8 ? 5 : -1, 'deadline objective -> build housing'],
    [2, 'feed the build queue -> gather materials'], [11, 'hold']]) },
  C0: { id: 'C0-heuristic', version: 'env', mk: () => { const sc = new Float32Array(A);
    return (s, mask) => { ad.sim.actionScores(s, sc); return { a: U.argmax(sc, mask), reason: 'heuristic argmax' }; }; } },
  RANDOM: { id: 'RANDOM', version: '1', mk: (scen, seed) => { const r = new XRNG((seed ^ 0xABCD) >>> 0);
    return (s, mask) => { let i = r.int(A); for (let k = 0; k < A; k++, i = (i + 1) % A) if (mask[i]) return { a: i, reason: 'random legal' }; return { a: SAFE, reason: 'fallback' }; }; } },
  STAB: { id: 'STAB', version: '1', mk: () => () => ({ a: SAFE, reason: 'always stabilize' }) },
  'SPAM-recruit': { id: 'SPAM-recruit', version: '1', mk: () => (s, mask) => mask[7] ? { a: 7, reason: 'spam recruit' } : { a: SAFE, reason: 'recruit illegal -> stabilize' } },
  'FX-EXPLORER': { id: 'FX-EXPLORER', version: '1', mk: () => (s, mask) => mask[10] ? { a: 10, reason: 'spam explore' } : { a: SAFE, reason: 'fallback' } },
  'FX-NONDET': { id: 'FX-NONDET', version: '1', mk: () => (s, mask) => { const i = Math.floor(Math.random() * A); return { a: mask[i] ? i : SAFE, reason: 'nondeterministic' }; } },
  'FX-THROW': { id: 'FX-THROW', version: '1', mk: () => (s) => { if (s.t >= 10) throw new Error('planted controller exception'); return { a: SAFE, reason: 'pre-crash' }; } },
};

/* ---------- episode runner ---------- */
function initScenario(scen, seed) {
  const s = ad.sim.init(seed);
  Object.assign(s, scen.initialStateParameters); // deterministic scenario initialization; dynamics untouched
  return s;
}
function runEpisode(scen, controllerKey, seed, opts) {
  opts = opts || {};
  const ctrl = CONTROLLERS[controllerKey]; const act = ctrl.mk(scen, seed);
  const s = opts.startState ? ad.sim.clone(opts.startState) : initScenario(scen, seed);
  const rng = new XRNG(opts.rngState != null ? 1 : (seed ^ 0xE9)); if (opts.rngState != null) rng.s = opts.rngState >>> 0;
  const rng0 = rng.s;
  const hist = new Array(A).fill(0); const traceParts = []; let illegal = 0, err = null;
  const mask = new Uint8Array(A);
  let firstCompleteTick = null, terminal = null, p = objectiveProgress(s, scen);
  if (p.complete && !opts.allowTrivial) return { status: 'TRIVIAL_AT_INITIALIZATION', seed };
  const maxT = scen.maximumTicks;
  for (let t = 0; t < maxT; t++) {
    ad.sim.legalMask(s, mask);
    let d;
    try { d = act(s, mask, scen); } catch (e) { err = String(e.message); break; }
    let a = d.a;
    if (!mask[a]) { illegal++; a = SAFE; }
    if (opts.ablatedCategories && opts.ablatedCategories.includes(catOf(a))) a = SAFE; // ablation: replace, deterministically
    hist[a]++; traceParts.push(a);
    const st = ad.sim.step(s, a, rng);
    p = objectiveProgress(s, scen);
    if (p.complete && firstCompleteTick == null) { firstCompleteTick = ad.sim.tick(s); break; } // objective answered -> episode over
    if (st.terminal) { terminal = st.terminalValue; break; }
    if (p.failed && p.reason === 'deadline_missed') break;
  }
  const prog = objectiveProgress(s, scen);
  return { scenario: scen.id, scenarioVersion: scen.version, runnerVersion: 2, seed, controller: ctrl.id + '@' + ctrl.version,
    status: err ? 'INSTRUMENT_ERROR' : 'RAN', error: err,
    survived: s.population > 0 && terminal !== -1, collapsedAt: terminal === -1 ? ad.sim.tick(s) : null,
    complete: firstCompleteTick != null, firstCompleteTick, finalProgress: prog.progress, finalReason: prog.reason,
    metrics: prog.metrics, ticks: ad.sim.tick(s), illegalAttempts: illegal,
    actionHistogram: hist, actionShare: hist.map(h => +(h / Math.max(1, traceParts.length)).toFixed(3)),
    traceHash: sha(traceParts.join(',')), stateHash: sha(JSON.stringify({ f: s.food, e: s.energy, p: s.population, d: s.defense, h: s.housing, t: s.t, th: s.threat })),
    rngInitialState: rng0, environmentVersion: ad.version };
}

/* ---------- shortcut detection ---------- */
function shortcutCheck(scen, ep) {
  const fails = [];
  for (const p of scen.prohibitedShortcutBehaviors || []) {
    if (p.detector === 'action-share') {
      const share = CAT[p.actionCategory].reduce((a, i) => a + ep.actionShare[i], 0);
      if (share > p.maxActionShare) fails.push({ id: p.id, share: +share.toFixed(3), max: p.maxActionShare });
    } else if (p.detector === 'ghost-colony') {
      if (ep.complete && ep.metrics.pop != null && ep.metrics.pop < 6) fails.push({ id: p.id, pop: ep.metrics.pop });
    }
  }
  return fails;
}

/* ---------- seed banks (nested: smoke ⊂ development ⊂ certification) ---------- */
const bank = (scenId, n) => { const base = 5000 + [...scenId].reduce((a, c) => a + c.charCodeAt(0), 0) * 131;
  return Array.from({ length: n }, (_, i) => base + i * 9973); };
const TIERN = { smoke: 6, development: 16, certification: 30 };

/* ---------- certification ---------- */
function certifyScenario(scenId, tier) {
  const scen = SCEN[scenId]; const errs = validateScenario(scen);
  if (errs.length) return { scenario: scenId, certified: false, status: 'INSTRUMENT_ERROR', schemaErrors: errs };
  if (scen.objectiveSpec.kind === 'blocked') return blockedRecord(scenId);
  const seeds = bank(scenId, TIERN[tier]); const R = { scenario: scenId, tier, seeds: seeds.length };

  // determinism: same seed twice, identical trace
  const d1 = runEpisode(scen, scen.successWitness, seeds[0]), d2 = runEpisode(scen, scen.successWitness, seeds[0]);
  R.deterministic = d1.traceHash === d2.traceHash && d1.stateHash === d2.stateHash;
  if (!R.deterministic) return Object.assign(R, { certified: false, status: 'NONDETERMINISTIC' });

  // trivial-at-init guard
  const t0 = objectiveProgress(initScenario(scen, seeds[0]), scen);
  if (t0.complete) return Object.assign(R, { certified: false, status: 'TRIVIAL_AT_INITIALIZATION' });

  const runAll = (ctrlKey, extra) => seeds.map(sd => {
    const rel = 'witnesses/' + scenId + '-' + ctrlKey + (extra && extra.ablatedCategories ? '-ablated' : '') + '-' + sd + '.json';
    const prev = load(rel);
    if (prev && prev.runnerVersion === 2 && prev.scenarioVersion === scen.version && prev.environmentVersion === ad.version && prev.controller === (CONTROLLERS[ctrlKey].id + '@' + CONTROLLERS[ctrlKey].version) && prev.status !== 'INSTRUMENT_ERROR') return prev;
    const ep = runEpisode(scen, ctrlKey, sd, extra || {}); save(rel, ep); return ep; });

  // failure witness
  const F = runAll(scen.failureWitness);
  const fFail = F.filter(e => e.status === 'RAN' && (!e.survived || (!e.complete && e.finalReason !== null) || (!e.complete)));
  const fMechanical = F.every(e => e.status === 'RAN');
  R.failureWitness = { controller: scen.failureWitness, failedObjective: F.filter(e => !e.complete).length,
    collapses: F.filter(e => !e.survived).length, instrumentErrors: F.filter(e => e.status === 'INSTRUMENT_ERROR').length,
    pass: fMechanical && F.filter(e => !e.complete).length >= Math.ceil(seeds.length * 0.8) };

  // success witness
  const S = runAll(scen.successWitness);
  const sRate = S.filter(e => e.complete).length / seeds.length;
  const sIllegal = S.reduce((a, e) => a + e.illegalAttempts, 0);
  const short = S.filter(e => e.complete).flatMap(e => shortcutCheck(scen, e));
  R.successWitness = { controller: scen.successWitness, type: scen.successWitnessType, completionRate: +sRate.toFixed(3),
    meanCompleteTick: Math.round(S.filter(e => e.firstCompleteTick).reduce((a, e) => a + e.firstCompleteTick, 0) / Math.max(1, S.filter(e => e.firstCompleteTick).length)),
    illegalAttempts: sIllegal, shortcutViolations: short.length,
    pass: sRate >= scen.behavioralThreshold.fullWitnessMinimumCompletionRate && sIllegal === 0 && short.length === 0 };
  if (sRate === 0) return Object.assign(R, { certified: false, status: 'UNSOLVABLE' });
  if (short.length > 0) return Object.assign(R, { certified: false, status: 'SHORTCUT_DEPENDENT', shortcut: short.slice(0, 3) });

  // behavioral witness: paired, identical init state + RNG state, ablated categories replaced by SAFE
  const pairs = seeds.map(sd => {
    const rel = 'witnesses/' + scenId + '-pair-' + sd + '.json'; const prev = load(rel);
    if (prev && prev.runnerVersion === 2 && prev.scenarioVersion === scen.version) return prev;
    const st = initScenario(scen, sd); const rngState = (sd ^ 0xE9) >>> 0;
    const full = runEpisode(scen, scen.successWitness, sd, { startState: st, rngState });
    const abl = runEpisode(scen, scen.successWitness, sd, { startState: st, rngState, ablatedCategories: scen.ablatedCategories });
    const rec = { scenarioVersion: scen.version, runnerVersion: 2, seed: sd, full: { complete: full.complete, progress: full.finalProgress, survived: full.survived },
      ablated: { complete: abl.complete, progress: abl.finalProgress, survived: abl.survived } };
    save(rel, rec); return rec; });
  const fullRate = pairs.filter(p => p.full.complete).length / pairs.length;
  const ablRate = pairs.filter(p => p.ablated.complete).length / pairs.length;
  const dProg = pairs.reduce((a, p) => a + (p.full.progress - p.ablated.progress), 0) / pairs.length;
  const th = scen.behavioralThreshold;
  R.behavioralWitness = { ablatedCategories: scen.ablatedCategories, fullCompletionRate: +fullRate.toFixed(3),
    ablatedCompletionRate: +ablRate.toFixed(3), meanProgressReduction: +dProg.toFixed(3),
    pass: fullRate >= th.fullWitnessMinimumCompletionRate && (ablRate <= th.ablatedMaximumCompletionRate || dProg >= th.minimumProgressDifference) };

  R.certified = R.failureWitness.pass && R.successWitness.pass && R.behavioralWitness.pass && R.deterministic;
  R.status = R.certified ? 'PASS' : 'FAIL';
  if (scen.successWitnessType === 'model-dependent') R.status = 'MODEL_DEPENDENT_CAVEAT';
  return R;
}
function blockedRecord(scenId) {
  const src = fs.readFileSync(path.join(ENG, 'azl-ref-adapter-v2.js'), 'utf8');
  const evidence = src.split('\n').map((l, i) => ({ n: i + 1, l })).filter(x => /\.link|\.access|deps/.test(x.l) && !/entities|toBaseFeatures|out\[b/.test(x.l)).slice(0, 6).map(x => x.n + ': ' + x.l.trim());
  const rec = { scenario: scenId, certified: false, status: 'BLOCKED_UNREPRESENTABLE',
    missingMechanics: ['no dependency read by simulation dynamics (link/access are written, never read)',
      'no breakable route or per-entity failure state', 'no repair/reroute/replace action',
      'entities() dependency graph is an analytical view constructed for the relational encoder'],
    whyProxyInvalid: 'raising the scalar `infra` neither breaks nor restores any dependency; certifying it would test counter accumulation, the exact exploit this framework exists to reject',
    downstreamConsequence: 'Nexus cannot receive a meaningful deterministic dependency-scenario evaluation in reference environment v2; Nexus evaluation is deferred to ZekNova binding or a separately authorized env v3',
    codeEvidence: evidence };
  save('blocked/infrastructure-dependency.json', rec); return rec;
}

/* ---------- preflight ---------- */
function preflight() {
  const rows = Object.keys(SCEN).map(id => {
    if (SCEN[id].objectiveSpec.kind === 'blocked') return { scenarioId: id, representable: false, decision: 'BLOCKED_MISSING_DYNAMICS',
      missingMechanics: blockedRecord(id).missingMechanics };
    const o = SCEN[id].objectiveSpec;
    return { scenarioId: id, representable: true, decision: 'REPRESENTABLE',
      requiredStateFields: Object.keys(objectiveProgress(initScenario(SCEN[id], 1), SCEN[id]).metrics),
      requiredActions: SCEN[id].relevantActionCategories.flatMap(c => CAT[c]).map(a => ad.actions[a].key), missingMechanics: [] };
  });
  save('representability.json', { generatedAt: new Date().toISOString(), rows }); return rows;
}

/* ---------- CLI ---------- */
const cmd = process.argv[2] || 'help';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

if (cmd === 'preflight') {
  preflight().forEach(r => console.log(r.scenarioId, '->', r.decision));

} else if (cmd === 'scenario-conformance') {
  const checks = {};
  { const a = new U.RNG(12345), b = new XRNG(12345); let ok = true;
    for (let i = 0; i < 1000; i++) if (a.next() !== b.next()) { ok = false; break; }
    checks.xrngSequenceIdentity = ok ? 'pass' : 'FAIL'; }
  { const r = new XRNG(777); r.next(); r.next(); const snap = r.s; const x = r.next();
    const r2 = new XRNG(1); r2.s = snap; checks.rngSnapshotRestore = r2.next() === x ? 'pass' : 'FAIL'; }
  { checks.legacyAdapterUntouched = (!ad.getScenarioDefinition && typeof adX.getScenarioDefinition === 'function') ? 'pass' : 'FAIL'; }
  { const s = initScenario(SCEN['scarcity'], 42); const p1 = adX.getObjectiveProgress(s, SCEN['scarcity']); const p2 = adX.getObjectiveProgress(s, SCEN['scarcity']);
    checks.objectiveProgressDeterministic = JSON.stringify(p1) === JSON.stringify(p2) && p1.progress >= 0 && p1.progress <= 1 ? 'pass' : 'FAIL'; }
  { const bad = { ...SCEN['scarcity'], successWitnessType: 'model-dependent' };
    checks.modelDependentCaveatRequired = validateScenario(bad).length > 0 ? 'pass' : 'FAIL'; }
  { const bad2 = { ...SCEN['scarcity'], prohibitedShortcutBehaviors: [{ id: 'x' }] };
    checks.shortcutDetectorRequired = validateScenario(bad2).length > 0 ? 'pass' : 'FAIL'; }
  { const ep1 = runEpisode(SCEN['scarcity'], 'HARVESTER', 42), ep2 = runEpisode(SCEN['scarcity'], 'HARVESTER', 42);
    checks.witnessDeterminism = ep1.traceHash === ep2.traceHash ? 'pass' : 'FAIL'; }
  { const st = initScenario(SCEN['scarcity'], 42);
    const f1 = runEpisode(SCEN['scarcity'], 'HARVESTER', 42, { startState: st, rngState: 42 ^ 0xE9 });
    const f2 = runEpisode(SCEN['scarcity'], 'HARVESTER', 42, { startState: st, rngState: 42 ^ 0xE9 });
    checks.pairedStartAlignment = f1.traceHash === f2.traceHash ? 'pass' : 'FAIL'; }
  const pass = Object.values(checks).every(v => v === 'pass');
  save('conformance-scenario.json', { checks, pass });
  console.log(checks); console.log(pass ? 'SCENARIO CONFORMANCE PASS' : 'SCENARIO CONFORMANCE FAIL');

} else if (cmd === 'certify') {
  const tier = arg('tier', 'certification'); const only = arg('scenario', null);
  const ids = only ? [only] : Object.keys(SCEN);
  const results = ids.map(id => { const r = certifyScenario(id, tier); console.log(id, '->', r.status); return r; });
  const all = load('certification.json') || { results: {} };
  results.forEach(r => all.results[r.scenario] = r);
  all.tier = tier; all.generatedAt = new Date().toISOString();
  all.manifest = manifest(); save('certification.json', all);

} else if (cmd === 'scenario-smoke') {
  ['scarcity', 'escalating-threat'].forEach(id => { const r = certifyScenario(id, 'smoke');
    console.log(id, r.status, JSON.stringify({ f: r.failureWitness && r.failureWitness.pass, s: r.successWitness && { rate: r.successWitness.completionRate }, b: r.behavioralWitness && { full: r.behavioralWitness.fullCompletionRate, abl: r.behavioralWitness.ablatedCompletionRate } })); });

} else if (cmd === 'negative') {
  const out = {};
  out.impossible = certifyScenario.call(null, ...(() => { SCEN['fx-impossible'] = { ...SCEN['scarcity'], id: 'fx-impossible', objectiveSpec: { kind: 'fx-const', field: 'food', target: 100000 }, prohibitedShortcutBehaviors: [], failureWitness: 'STAB', successWitness: 'HARVESTER' }; return ['fx-impossible', 'smoke']; })()).status;
  out.trivial = (() => { SCEN['fx-trivial'] = { ...SCEN['scarcity'], id: 'fx-trivial', objectiveSpec: { kind: 'fx-const', field: 'population', target: 1 }, prohibitedShortcutBehaviors: [] }; return certifyScenario('fx-trivial', 'smoke').status; })();
  out.shortcut = (() => { SCEN['fx-shortcut'] = { ...SCEN['scarcity'], id: 'fx-shortcut', objectiveSpec: { kind: 'fx-const', field: 'explored', target: 0.8 }, initialStateParameters: { energy: 300, food: 200, population: 12 }, maximumTicks: 300, successWitness: 'FX-EXPLORER', failureWitness: 'STAB', prohibitedShortcutBehaviors: [{ id: 'explore-spam', actionCategory: 'explore', maxActionShare: 0.5, detector: 'action-share', rationale: 'fixture' }], ablatedCategories: ['explore'] }; return certifyScenario('fx-shortcut', 'smoke').status; })();
  out.nondet = (() => { SCEN['fx-nondet'] = { ...SCEN['scarcity'], id: 'fx-nondet', successWitness: 'FX-NONDET', prohibitedShortcutBehaviors: [] }; return certifyScenario('fx-nondet', 'smoke').status; })();
  out.instrumentError = (() => { SCEN['fx-error'] = { ...SCEN['scarcity'], id: 'fx-error', successWitness: 'FX-THROW', failureWitness: 'FX-THROW', prohibitedShortcutBehaviors: [] };
    const ep = runEpisode(SCEN['fx-error'], 'FX-THROW', 42); return ep.status; })();
  out.survivalNotEnough = (() => { const ep = runEpisode(SCEN['stable-baseline'], 'SENTINEL-SCRIPT', 5042); return ep.survived && !ep.complete ? 'SURVIVED_BUT_NOT_COMPLETE(correctly not certified)' : 'CHECK(' + ep.survived + ',' + ep.complete + ')'; })();
  ['fx-impossible','fx-trivial','fx-shortcut','fx-nondet','fx-error'].forEach(k => delete SCEN[k]);
  save('negative-fixtures/results.json', out); console.log(out);

} else if (cmd === 'scenario-report') {
  const cert = load('certification.json'); const rep = load('representability.json'); const neg = load('negative-fixtures/results.json');
  const conf = load('conformance-scenario.json');
  { const p = path.join(OUT, 'SCENARIO_CERTIFICATION.md'); GUARD.assertWritableEvidenceTarget(p, GCTX); fs.writeFileSync(p, report(cert, rep, neg, conf)); }
  console.log('wrote SCENARIO_CERTIFICATION.md');
} else console.log('preflight | scenario-conformance | scenario-smoke | certify [--scenario id] [--tier t] | negative | scenario-report');

function manifest() {
  const mods = {}; MODULES.forEach(f => mods[f] = sha(fs.readFileSync(path.join(ENG, f))));
  return { environment_id: 'reference-colony', environment_version: ad.version, adapter_extension: 'additive-v1',
    scenario_schema_version: '1', scenario_versions: Object.fromEntries(Object.entries(SCEN).map(([k, v]) => [k, v.version])),
    objective_progress_version: '1', witness_controller_versions: Object.fromEntries(Object.entries(CONTROLLERS).map(([k, v]) => [k, v.version])),
    behavioral_threshold: TH, seed_bank: 'per-scenario base + i*9973 (nested smoke⊂dev⊂cert)',
    rng: 'xorshift32 (lab-snapshotable twin; 1000-step sequence-verified against AZL.Util.RNG)',
    action_space_version: 1, state_schema_version: AZL.CONFIG.STATE_SCHEMA_V, moduleHashes: mods, timestamp: new Date().toISOString() };
}
function report(cert, rep, neg, conf) {
  const M = cert.manifest; const rows = Object.values(cert.results);
  const cell = r => r.certified ? 'YES' : r.status;
  const line = r => '| ' + [SCEN[r.scenario] ? SCEN[r.scenario].title : r.scenario,
    r.status === 'BLOCKED_UNREPRESENTABLE' ? 'NO' : 'yes',
    r.failureWitness ? (r.failureWitness.pass ? 'PASS' : 'FAIL') : '—',
    r.successWitness ? (r.successWitness.pass ? 'PASS' : 'FAIL') : '—',
    r.successWitness ? (SCEN[r.scenario] || {}).successWitnessType : '—',
    r.behavioralWitness ? (r.behavioralWitness.pass ? 'PASS' : 'FAIL') : '—',
    r.successWitness ? (r.successWitness.shortcutViolations === 0 ? 'PASS' : 'FAIL') : '—',
    r.deterministic === undefined ? '—' : (r.deterministic ? 'PASS' : 'FAIL'), cell(r)].join(' | ') + ' |';
  const q = r => {
    if (r.status === 'BLOCKED_UNREPRESENTABLE') return '### ' + r.scenario + '\nBLOCKED. ' + r.missingMechanics.join('; ') + '.\nDownstream: ' + r.downstreamConsequence;
    const sc = SCEN[r.scenario];
    return '### ' + sc.title + '\n' +
      '- Can it be lost? ' + (r.failureWitness.pass ? 'Yes — ' + r.failureWitness.controller + ' fails the objective in ' + r.failureWitness.failedObjective + '/' + r.seeds + ' seeds (' + r.failureWitness.collapses + ' full collapses).' : 'NOT DEMONSTRATED') + '\n' +
      '- Can it be won? ' + (r.successWitness.pass ? 'Yes — ' + r.successWitness.controller + ' completes ' + (r.successWitness.completionRate * 100).toFixed(0) + '% (mean tick ' + r.successWitness.meanCompleteTick + ').' : 'NOT DEMONSTRATED (' + (r.successWitness.completionRate * 100).toFixed(0) + '%)') + '\n' +
      '- Intended behavior: ' + sc.relevantActionCategories.join(', ') + ' (' + sc.objective + ')\n' +
      '- Causal evidence: ablating [' + sc.ablatedCategories.join(', ') + '] drops completion ' + (r.behavioralWitness.fullCompletionRate * 100).toFixed(0) + '% → ' + (r.behavioralWitness.ablatedCompletionRate * 100).toFixed(0) + '% (mean progress −' + r.behavioralWitness.meanProgressReduction + ') across ' + r.seeds + ' paired seeds from identical state+RNG.\n' +
      '- Witness type: ' + sc.successWitnessType + '\n' +
      '- Shortcut check: ' + (r.successWitness.shortcutViolations === 0 ? 'no prohibited-category dominance' : 'VIOLATIONS'); };
  return `# Sentinel Grid — Scenario Certification (Stage 1A)

Environment: reference-colony **v${M.environment_version}** (dynamics unchanged; no env v3). Tier: **${cert.tier}** (${TIERN[cert.tier]} seeds/scenario, nested smoke⊂dev⊂cert).
RNG: ${M.rng}. Paired behavioral runs start from identical state + identical xorshift32 uint32; later draw counts may diverge and single-trajectory equality is not required — evidence is the paired-seed distribution.
Frozen results-v1-health-proxy/ and results-v2/ untouched. Adapter extended **additively** (legacy adapter has no scenario methods: verified).

## Certification matrix
| Scenario | Representable | Failure witness | Success witness | Witness type | Behavioral witness | Shortcut check | Deterministic | Certified |
|---|---|---|---|---|---|---|---|---|
${rows.map(line).join('\n')}

## Per-scenario evidence
${rows.map(q).join('\n\n')}

## Preregistered behavioral thresholds (revisionVersion 0 — never revised)
full ≥ ${TH.fullWitnessMinimumCompletionRate} · ablated ≤ ${TH.ablatedMaximumCompletionRate} OR progress Δ ≥ ${TH.minimumProgressDifference} · paired seeds ≥ ${TH.minimumPairedSeeds}. Shortcut default share ≤ 0.50 (escalating-threat ghost-colony detector: complete-with-pop<6 rejected).

## Negative fixtures (framework must reject)
${JSON.stringify(neg)}
Schema-level rejections (unit): model-dependent witness without caveat; prohibited shortcut without detector — both verified in scenario-conformance.

## Scenario conformance
${JSON.stringify((conf || {}).checks)}

## Objective-progress interface
{progress∈[0,1], complete, failed, reason, metrics, version} — pure function of (state, scenario); completion after a deadline never counts; survival is never sufficient for completion.

## Known limitations
- Recovery "maintain for interval" was dropped to keep objective progress a pure state function; noted for Stage 1B.
- infrastructure-dependency: BLOCKED_UNREPRESENTABLE (see blocked/). Nexus evaluation deferred to ZekNova binding or separately authorized env v3.
- Failure-witness choice is per-scenario (heuristic where it genuinely fails; STAB/SPAM where the heuristic would pass) — each is declared in the scenario definition.

## Reproduction
node lab3.js preflight && node lab3.js scenario-conformance && node lab3.js certify && node lab3.js negative && node lab3.js scenario-report

## Manifest
${JSON.stringify(M, null, 1)}
`;
}
