#!/usr/bin/env node
/* Sentinel Grid Intelligence Lab v1 (local, standalone)
 * Phase 1 runner. Evaluates the SAME Grid Core modules the game ships
 * (require()d from public_html/azl - no benchmark-only fork). All results are
 * labeled with module hashes, environment id, and runtime.
 *
 * Sentinel -> module mapping (wire identifiers retained per renaming discipline):
 *   Vanguard=azl-scout  Prime=azl-mcts  Horizon=azl-strategist
 *   Oracle=azl-oracle   Nexus=azl-relational  Arbiter=azl-router
 *
 * Commands:
 *   freeze        write baseline.json (module hashes, config, frozen weights)
 *   conformance   adapter conformance suite (platform deliverable)
 *   health-check  objective-function sanity: health(s_t) vs terminal outcome
 *   ladder --configs C0,C1 --seeds N   paired-seed configuration ladder
 *   sweep         search budget sweep at winning config
 *   screen        action-change-rate first-pass screen
 *   degraded      ruler validation: degraded model must be detected + blocked
 *   inspect       per-decision traces for the decision inspector
 *   aggregate     gates + prereg comparison + Capability Baseline v1 report
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const ENG = path.join(ROOT, 'public_html', 'azl');
const OUT = path.join(__dirname, 'results');
const WDIR = path.join(__dirname, 'weights');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(WDIR, { recursive: true });

const MODULES = ['azl-config.js','azl-util.js','azl-state.js','azl-nn.js','azl-scout.js',
  'azl-strategist.js','azl-oracle.js','azl-relational.js','azl-mcts.js','azl-router.js',
  'azl-weights.js','azl-replay.js','azl-federated.js','azl-eval.js','azl-ref-adapter.js'];
MODULES.forEach(f => require(path.join(ENG, f)));
const AZL = globalThis.AZL, U = AZL.Util;
const ad = AZL.ReferenceAdapter;            // environment under test (reference env)
const ENV_ID = 'reference-colony';
const codec = new AZL.Codec(ad);

/* ---------------- provenance ---------------- */
function sha(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16); }
function provenance() {
  const mods = {}; MODULES.forEach(f => mods[f] = sha(path.join(ENG, f)));
  return { envId: ENV_ID, envVersion: ad.version, actions: ad.actions.length,
    stateSchemaV: AZL.CONFIG.STATE_SCHEMA_V, runtime: 'node ' + process.version + ' (container; NOT browser)',
    moduleHashes: mods, weights: fs.existsSync(path.join(WDIR,'vanguard-v1.f32')) ? {
      vanguard: sha(path.join(WDIR,'vanguard-v1.f32')), horizon: sha(path.join(WDIR,'horizon-v1.f32')) } : null };
}
function save(name, obj) { fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 1)); console.log('wrote results/' + name); }
function load(name) { const p = path.join(OUT, name); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }

/* ---------------- frozen weights ---------------- */
function writeF32(file, f32) { fs.writeFileSync(file, Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)); }
function readF32(file) { const b = fs.readFileSync(file); const ab = new ArrayBuffer(b.length); new Uint8Array(ab).set(b); return ab; }
function frozenNets() {
  const scout = AZL.makeScout(codec), strat = AZL.makeStrategist(codec);
  const sf = path.join(WDIR, 'vanguard-v1.f32'), hf = path.join(WDIR, 'horizon-v1.f32');
  if (fs.existsSync(sf)) {
    if (!AZL.Fed.activateRaw(scout, readF32(sf), { version: 1 }).ok) throw new Error('vanguard weights invalid');
    if (!AZL.Fed.activateRaw(strat, readF32(hf), { version: 1 }).ok) throw new Error('horizon weights invalid');
  } else {
    AZL.distillScout(scout, codec, ad, { rounds: 40, batch: 48 });   // seeded, deterministic
    writeF32(sf, scout.snapshotParams()); writeF32(hf, strat.snapshotParams());
    console.log('distilled + froze v1 weights');
  }
  return { scout, strat };
}

/* ---------------- segmentation (declared for this adapter) ----------------
 * Reference-env segmentation dimension: initial hostility regime, classified
 * from init-state threat growth (calm / standard / hostile). Deterministic. */
function segmentOf(seed) {
  const s = ad.sim.init(seed); const tg = s.threatGrowth;
  return tg < 0.9 ? 'calm' : (tg < 1.1 ? 'standard' : 'hostile');
}

/* ---------------- configuration ladder ---------------- */
function mkEval(scout, uniform) {
  const enr = new Float32Array(codec.enrichedLen);
  const fn = (state) => {
    const e = codec.encode(state, false);
    if (uniform) {                                   // C2: no learned prior
      let n = 0; for (let i = 0; i < e.mask.length; i++) n += e.mask[i];
      const pol = new Float32Array(codec.A);
      for (let i = 0; i < pol.length; i++) pol[i] = e.mask[i] ? 1 / n : 0;
      return { policy: pol, value: ad.sim.heuristicValue(state), mask: e.mask, hash: e.hash, tick: e.tick };
    }
    codec.enrich(e.base, null, null, null, enr);
    const o = scout.forward(enr, e.mask);
    return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick };
  };
  fn.probe = (state) => { const e = codec.encode(state, false); return { hash: e.hash, tick: e.tick }; };
  return fn;
}
/* One decision under a config. Returns {a, ms, trace}. c5 state held in ctx. */
function decide(cfg, state, nets, mctsInst, ctx) {
  const t0 = process.hrtime.bigint();
  let a = -1, trace = null;
  const e = codec.encode(state, cfg === 'C5');       // C5 feeds the observation ring
  if (cfg === 'C0') {
    const sc = new Float32Array(codec.A); ad.sim.actionScores(state, sc); a = U.argmax(sc, e.mask);
  } else if (cfg === 'C1') {
    const enr = ctx.enr; codec.enrich(e.base, null, null, null, enr);
    a = U.argmax(nets.scout.forward(enr, e.mask).policy, e.mask);
  } else {
    const budget = { sims: ctx.sims, ms: 100000 };   // fixed-compute comparison; wall clock reported separately
    const res = mctsInst.search(state, budget, 'advise');
    if (cfg === 'C2' || cfg === 'C3') a = U.argmax(res.policy, res.mask);
    else {
      let oracleIn = null, relIn = null, enr = ctx.enr;
      if (cfg === 'C5') {
        if (codec.ring.count >= 4 && (e.tick - ctx.lastOracle) >= 10) { ctx.oracle.update(codec.snapshotRing(), e.tick); ctx.lastOracle = e.tick; }
        if ((e.tick - ctx.lastRel) >= 25 || ctx.lastRel < 0) { ctx.rel.update(codec.entities(state)); ctx.lastRel = e.tick; }
        oracleIn = ctx.oracle.available ? { alarms: ctx.oracle.alarms, stalenessMs: ctx.oracle.stalenessMs(), available: true } : null;
        relIn = ctx.rel.available ? { aux: ctx.rel.aux, embedding: ctx.rel.embedding, stalenessMs: ctx.rel.stalenessMs(), available: true } : null;
        codec.enrich(e.base, ctx.oracle.available ? ctx.oracle.embedding : null, ctx.oracle.available ? ctx.oracle.alarms : null, ctx.rel.available ? ctx.rel.embedding : null, enr);
      } else codec.enrich(e.base, null, null, null, enr);
      const so = nets.scout.forward(enr, e.mask);
      const sv = nets.strat.forward(enr, e.mask);
      const fused = AZL.Router.fuse({
        mcts: res, scoutRoot: { policy: Array.from(so.policy), value: so.values.now },
        strategist: { policy: Array.from(sv.policy), values: sv.values, confidence: sv.confidence },
        oracle: oracleIn, relational: relIn, novelty: 0.3, criticality: 0,
        heuristicValue: ad.sim.heuristicValue(state), validatedSamples: 0,
        rootSimState: state, fallbackMask: e.mask }, ad, codec.A, ctx.bufs);
      a = fused.actionIdx;
      trace = { weights: fused.weights, level: fused.level, rootValue: +fused.rootValue.toFixed(3),
        alarms: oracleIn ? Array.from(ctx.oracle.alarms).map(x => +x.toFixed(2)) : null };
    }
  }
  return { a, ms: Number(process.hrtime.bigint() - t0) / 1e6, trace };
}
function makeCtx(cfg, nets, seed) {
  const ctx = { enr: new Float32Array(codec.enrichedLen), bufs: AZL.Router.makeBuffers(codec.A),
    sims: 128, lastOracle: -1, lastRel: -1 };
  if (cfg === 'C5') { ctx.oracle = new AZL.Oracle(codec, ad); ctx.rel = new AZL.Relational(codec, ad); codec.ring.reset(); }
  let mctsInst = null;
  if (cfg !== 'C0' && cfg !== 'C1') {
    const evalFn = mkEval(nets.scout, cfg === 'C2');
    mctsInst = new AZL.MCTS({ adapter: ad, codec, evalFn, rng: new U.RNG(seed ^ 0x51D), cfg: { reuseTree: false } });
  }
  return { ctx, mctsInst };
}
function playEpisode(cfg, seed, nets, opts) {
  opts = opts || {};
  const { ctx, mctsInst } = makeCtx(cfg, nets, seed);
  if (opts.sims) ctx.sims = opts.sims;
  const s = ad.sim.init(seed), rng = new U.RNG(seed ^ 0xE9);
  const maxTicks = opts.maxTicks || 150;
  let terminal = null, msSum = 0, n = 0; const inspect = opts.inspect ? [] : null;
  for (let t = 0; t < maxTicks; t++) {
    const d = decide(cfg, s, nets, mctsInst, ctx);
    if (d.a < 0) break;
    msSum += d.ms; n++;
    if (inspect && d.trace) inspect.push(Object.assign({ tick: ad.sim.tick(s), action: ad.actions[d.a].key }, d.trace));
    const st = ad.sim.step(s, d.a, rng);
    if (st.terminal) { terminal = st.terminalValue; break; }
  }
  return { seed, cfg, score: terminal != null ? terminal : ad.sim.health(s),
    terminal: terminal != null, ticks: n, msPerDecision: +(msSum / Math.max(1, n)).toFixed(2),
    segment: segmentOf(seed), inspect };
}
const SEEDBANK = (n) => Array.from({ length: n }, (_, i) => 1000 + i * 7919);

/* ---------------- commands ---------------- */
const cmd = process.argv[2] || 'help';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

if (cmd === 'freeze') {
  frozenNets();
  const base = { frozenAt: new Date().toISOString(), provenance: provenance(),
    search: AZL.CONFIG.MCTS, arbiterBounds: AZL.CONFIG.ROUTER, heuristic: 'adapter-built-in v' + ad.version };
  save('baseline.json', base);
  console.log('BASELINE FROZEN');

} else if (cmd === 'conformance') {
  const r = { envId: ENV_ID, checks: {}, pass: true };
  const chk = (k, fn) => { try { fn(); r.checks[k] = 'pass'; } catch (e) { r.checks[k] = 'FAIL: ' + e.message; r.pass = false; } };
  chk('determinism', () => { const a = ad.sim.init(7), b = ad.sim.init(7), r1 = new U.RNG(1), r2 = new U.RNG(1);
    for (let i = 0; i < 60; i++) { ad.sim.step(a, i % codec.A, r1); ad.sim.step(b, i % codec.A, r2); }
    if (codec.encode(a, false).hash !== codec.encode(b, false).hash) throw new Error('hash drift'); });
  chk('cloneIsolation', () => { const s = ad.sim.init(9); const h = codec.encode(s, false).hash;
    const c = ad.sim.clone(s); const rr = new U.RNG(2); for (let i = 0; i < 30; i++) ad.sim.step(c, 0, rr);
    if (codec.encode(s, false).hash !== h) throw new Error('clone mutated original'); });
  chk('legalMaskNonEmpty', () => { const s = ad.sim.init(3), rr = new U.RNG(3), m = new Uint8Array(codec.A);
    for (let i = 0; i < 120; i++) { ad.sim.legalMask(s, m); if (!Array.from(m).some(x => x)) throw new Error('empty mask pre-terminal');
      const st = ad.sim.step(s, U.argmax(new Float32Array(codec.A).fill(1), m), rr); if (st.terminal) break; } });
  chk('boundedSignals', () => { const s = ad.sim.init(5), rr = new U.RNG(5);
    for (let i = 0; i < 100; i++) { const h = ad.sim.health(s), v = ad.sim.heuristicValue(s);
      if (!isFinite(h) || Math.abs(h) > 1.001 || !isFinite(v) || Math.abs(v) > 1.001) throw new Error('signal out of range');
      ad.sim.step(s, i % codec.A, rr); } });
  chk('noHiddenInfoInEncode', () => { const s = ad.sim.init(11); const e1 = codec.encode(s, false);
    const c = ad.sim.clone(s); const e2 = codec.encode(c, false);
    if (e1.hash !== e2.hash) throw new Error('encode not a pure function of state'); });
  { const s = ad.sim.init(1); const t0 = process.hrtime.bigint(); const rr = new U.RNG(1);
    for (let i = 0; i < 20000; i++) { const c = ad.sim.clone(s); ad.sim.step(c, i % codec.A, rr); }
    r.cloneStepMicros = +(Number(process.hrtime.bigint() - t0) / 1000 / 20000).toFixed(2);
    r.checks.forwardModelPerf = r.cloneStepMicros < 20 ? 'pass (' + r.cloneStepMicros + 'us)' : 'FAIL: ' + r.cloneStepMicros + 'us > 20us target'; }
  save('conformance.json', r);
  console.log(r.pass ? 'CONFORMANCE PASS' : 'CONFORMANCE FAIL');

} else if (cmd === 'health-check') {
  // Programmatic proxy for Step 2 on the reference env: does health(s_t) predict terminal outcome?
  // (Human ranking against real ZekNova states remains REQUIRED and PENDING.)
  const nets = frozenNets(); const pts = [];
  for (const seed of SEEDBANK(24)) {
    const s = ad.sim.init(seed), rng = new U.RNG(seed ^ 0xE9); const hist = [];
    let terminal = null;
    for (let t = 0; t < 200; t++) {
      if (t % 10 === 0) hist.push(ad.sim.health(s));
      const sc = new Float32Array(codec.A); const m = new Uint8Array(codec.A);
      ad.sim.legalMask(s, m); ad.sim.actionScores(s, sc);
      const st = ad.sim.step(s, U.argmax(sc, m), rng);
      if (st.terminal) { terminal = st.terminalValue; break; }
    }
    const fin = terminal != null ? terminal : ad.sim.health(s);
    hist.forEach((h, i) => pts.push({ h, fin, frac: i / hist.length }));
  }
  const corr = (sel) => { const P = pts.filter(sel); const n = P.length;
    const mh = P.reduce((a, p) => a + p.h, 0) / n, mf = P.reduce((a, p) => a + p.fin, 0) / n;
    let num = 0, dh = 0, df = 0; P.forEach(p => { num += (p.h - mh) * (p.fin - mf); dh += (p.h - mh) ** 2; df += (p.fin - mf) ** 2; });
    return +(num / Math.sqrt(dh * df + 1e-12)).toFixed(3); };
  const out = { note: 'reference-env programmatic check; HUMAN ranking on real ZekNova states still required',
    pearsonAll: corr(() => true), pearsonEarly: corr(p => p.frac < 0.34), pearsonLate: corr(p => p.frac >= 0.67), samples: pts.length };
  save('health-check.json', out); console.log(out);

} else if (cmd === 'ladder') {
  const nets = frozenNets();
  const seeds = SEEDBANK(parseInt(arg('seeds', '28'), 10));
  const cfgs = arg('configs', 'C0').split(',');
  for (const cfg of cfgs) {
    const t0 = Date.now(); const eps = seeds.map(sd => playEpisode(cfg, sd, nets, { sims: parseInt(arg('sims', '128'), 10) }));
    save('ladder-' + cfg + '.json', { cfg, sims: parseInt(arg('sims', '128'), 10), episodes: eps, wallMs: Date.now() - t0 });
    const mean = eps.reduce((a, e) => a + e.score, 0) / eps.length;
    console.log(cfg + ': mean ' + mean.toFixed(3) + ', ' + eps.filter(e => e.terminal && e.score < 0).length + ' collapses, ' +
      (eps.reduce((a, e) => a + e.msPerDecision, 0) / eps.length).toFixed(1) + 'ms/decision');
  }

} else if (cmd === 'sweep') {
  const nets = frozenNets(); const seeds = SEEDBANK(16); const rows = [];
  const scfg = arg('config', 'C3');
  for (const sims of [50, 100, 200, 400]) {
    const eps = seeds.map(sd => playEpisode(scfg, sd, nets, { sims }));
    rows.push({ sims, mean: +(eps.reduce((a, e) => a + e.score, 0) / eps.length).toFixed(3),
      msPerDecision: +(eps.reduce((a, e) => a + e.msPerDecision, 0) / eps.length).toFixed(1) });
    console.log(JSON.stringify(rows[rows.length - 1]));
  }
  const prev = load('sweep.json'); const entry = { config: scfg, rows };
  save('sweep.json', prev && prev.entries ? { entries: prev.entries.filter(e=>e.config!==scfg).concat([entry]), seeds: seeds.length } : { entries: [entry], seeds: seeds.length });

} else if (cmd === 'screen') {
  // action-change-rate first-pass screen across C2->C3->C4->C5 on shared sampled states
  const nets = frozenNets(); const states = [];
  for (const seed of SEEDBANK(10)) { const s = ad.sim.init(seed), rng = new U.RNG(seed);
    for (let t = 0; t < 60; t++) { if (t % 4 === 0 && states.length < 160) states.push(ad.sim.clone(s));
      const m = new Uint8Array(codec.A); ad.sim.legalMask(s, m);
      const st = ad.sim.step(s, (() => { for (let i = rng.int(codec.A), k = 0; k < codec.A; k++, i = (i + 1) % codec.A) if (m[i]) return i; return 0; })(), rng);
      if (st.terminal) break; } }
  const pick = {};
  for (const cfg of ['C0', 'C2', 'C3', 'C4', 'C5']) {
    const { ctx, mctsInst } = makeCtx(cfg, nets, 77); ctx.sims = 128; pick[cfg] = [];
    for (const st of states) { if (mctsInst) mctsInst.reset && mctsInst.reset(); pick[cfg].push(decide(cfg, ad.sim.clone(st), nets, mctsInst, ctx).a); }
  }
  const rate = (a, b) => +(pick[a].filter((x, i) => x !== pick[b][i]).length / states.length).toFixed(3);
  const out = { states: states.length, sims: 128,
    'C2_vs_C0 (does search change actions?)': rate('C2', 'C0'),
    'C3_vs_C2 (do Vanguard priors change search?)': rate('C3', 'C2'),
    'C4_vs_C3 (does Horizon change fused actions?)': rate('C4', 'C3'),
    'C5_vs_C4 (do Oracle+Nexus change fused actions?)': rate('C5', 'C4') };
  save('screen.json', out); console.log(out);

} else if (cmd === 'degraded') {
  // Ruler validation: a deliberately broken Vanguard must be detected and BLOCKED.
  const nets = frozenNets();
  const bad = AZL.makeScout(codec); bad.params.set(nets.scout.params);
  const rng = new U.RNG(666); for (let i = 0; i < bad.params.length; i++) bad.params[i] += (rng.next() * 2 - 1) * 0.8;
  const seeds = SEEDBANK(16);
  const good = seeds.map(sd => playEpisode('C3', sd, nets, {}));
  const degr = seeds.map(sd => playEpisode('C3', sd, { scout: bad, strat: nets.strat }, {}));
  let w = 0, l = 0; seeds.forEach((sd, i) => { const d = degr[i].score - good[i].score; if (d > 0.02) w++; else if (d < -0.02) l++; });
  const lcb = AZL.Eval.wilsonLCB(w, w + l || 1);
  const blocked = !(w + l >= 8 && (w / Math.max(1, w + l)) > 0.53 && lcb > 0.5);
  save('degraded.json', { goodMean: +(good.reduce((a, e) => a + e.score, 0) / 16).toFixed(3),
    degradedMean: +(degr.reduce((a, e) => a + e.score, 0) / 16).toFixed(3), degradedWins: w, degradedLosses: l, lcb: +lcb.toFixed(3), blocked });
  console.log(blocked ? 'RULER OK: degraded model DETECTED AND BLOCKED' : 'RULER FAILURE: degraded model passed the gate');

} else if (cmd === 'inspect') {
  const nets = frozenNets();
  for (const seed of [1000, 22913]) {
    const ep = playEpisode('C5', seed, nets, { inspect: true, maxTicks: 60 });
    save('inspect-' + seed + '.json', { seed, segment: ep.segment, score: ep.score, decisions: ep.inspect });
  }
  console.log('decision traces written');

} else if (cmd === 'aggregate') {
  const CFGS = ['C0', 'C1', 'C2', 'C3', 'C4', 'C5'];
  const L = {}; CFGS.forEach(c => { L[c] = load('ladder-' + c + '.json'); if (!L[c]) throw new Error('missing ladder-' + c); });
  const paired = (A, B) => {  // does B beat A? per-seed, with segments + min-sample veto
    const segs = {}; let w = 0, l = 0, d = 0, mA = 0, mB = 0;
    L[A].episodes.forEach((ea, i) => { const eb = L[B].episodes[i]; const diff = eb.score - ea.score;
      mA += ea.score; mB += eb.score;
      const s = ea.segment; segs[s] = segs[s] || { n: 0, w: 0, l: 0 }; segs[s].n++;
      if (diff > 0.02) { w++; segs[s].w++; } else if (diff < -0.02) { l++; segs[s].l++; } else d++; });
    const n = L[A].episodes.length;
    const segOut = {}; let veto = null;
    for (const k in segs) { const g = segs[k];
      if (g.n < 8) { segOut[k] = { n: g.n, verdict: 'insufficient data' }; continue; }
      const slcb = AZL.Eval.wilsonLCB(g.w, g.w + g.l || 1);
      segOut[k] = { n: g.n, wins: g.w, losses: g.l, lcb: +slcb.toFixed(3) };
      if (slcb < 0.35 && g.l > g.w) veto = k; }
    return { meanA: +(mA / n).toFixed(3), meanB: +(mB / n).toFixed(3), wins: w, losses: l, draws: d,
      winRate: +((w / Math.max(1, w + l))).toFixed(3), lcb: +AZL.Eval.wilsonLCB(w, w + l || 1).toFixed(3),
      segments: segOut, segmentVeto: veto };
  };
  const cmp = { 'C1_vs_C0': paired('C0', 'C1'), 'C2_vs_C0': paired('C0', 'C2'), 'C3_vs_C2': paired('C2', 'C3'),
    'C4_vs_C3': paired('C3', 'C4'), 'C5_vs_C3': paired('C3', 'C5'), 'C5_vs_C0': paired('C0', 'C5') };
  const lat = {}; CFGS.forEach(c => lat[c] = +(L[c].episodes.reduce((a, e) => a + e.msPerDecision, 0) / L[c].episodes.length).toFixed(1));
  const prereg = JSON.parse(fs.readFileSync(path.join(__dirname, 'prereg.json'), 'utf8'));
  const evalExp = (e) => { const c = cmp[e.comparison]; if (!c) return 'no data';
    if (e.expect === 'parity') return Math.abs(c.meanB - c.meanA) <= 0.05 ? 'MATCHED (parity)' : 'SURPRISE: |' + (c.meanB - c.meanA).toFixed(3) + '| > 0.05 - investigate before celebrating';
    if (e.expect === 'B-better') return (c.winRate > 0.53 && c.lcb > 0.5) ? 'MATCHED (gain confirmed, lcb ' + c.lcb + ')' : 'NOT CONFIRMED (winRate ' + c.winRate + ', lcb ' + c.lcb + ') - see alternative hypothesis';
    return '?'; };
  prereg.expectations.forEach(e => e.result = evalExp(e));
  const agg = { generatedAt: new Date().toISOString(), provenance: provenance(),
    scoring: 'terminal value, else health at 150-tick horizon; paired seeds; tie eps 0.02; sims=' + L.C3.sims,
    comparisons: cmp, msPerDecision: lat,
    sweep: load('sweep.json'), screen: load('screen.json'), degraded: load('degraded.json'),
    conformance: load('conformance.json'), healthCheck: load('health-check.json'), prereg };
  save('capability-baseline.json', agg);
  fs.writeFileSync(path.join(OUT, 'CAPABILITY_BASELINE_v1.md'), report(agg, L));
  console.log('wrote results/CAPABILITY_BASELINE_v1.md');

} else {
  console.log('commands: freeze conformance health-check ladder sweep screen degraded inspect aggregate');
}

/* ---------------- report ---------------- */
function report(agg, L) {
  const c = agg.comparisons, lat = agg.msPerDecision;
  const verdict = (cc, gain) => gain ? (cc.winRate > 0.53 && cc.lcb > 0.5 ? 'GAIN' : 'no confirmed gain') : (Math.abs(cc.meanB - cc.meanA) <= 0.05 ? 'parity' : 'DIVERGENCE');
  const ledgerRow = (s, cost, q, acr, dep, status) => '| ' + [s, cost, q, acr, dep, status].join(' | ') + ' |';
  const scr = agg.screen || {};
  return `# Sentinel Grid - Capability Baseline v1

Environment: **${agg.provenance.envId}** (reference environment - real-ZekNova numbers PENDING adapter binding)
Runtime: ${agg.provenance.runtime}. Browser/device numbers PENDING (bench.html).
Scoring: ${agg.scoring}
Module hashes + frozen weights: results/baseline.json (weights ${JSON.stringify(agg.provenance.weights)})

## Q1 - Does Prime earn its cost?
| Comparison | means | winRate | LCB | verdict |
|---|---|---|---|---|
| C1 (Vanguard greedy) vs C0 (heuristic) | ${c.C1_vs_C0.meanA} -> ${c.C1_vs_C0.meanB} | ${c.C1_vs_C0.winRate} | ${c.C1_vs_C0.lcb} | ${verdict(c.C1_vs_C0, false)} |
| C2 (search, uniform prior) vs C0 | ${c.C2_vs_C0.meanA} -> ${c.C2_vs_C0.meanB} | ${c.C2_vs_C0.winRate} | ${c.C2_vs_C0.lcb} | ${verdict(c.C2_vs_C0, true)} |
| C3 (Vanguard+Prime) vs C2 | ${c.C3_vs_C2.meanA} -> ${c.C3_vs_C2.meanB} | ${c.C3_vs_C2.winRate} | ${c.C3_vs_C2.lcb} | ${verdict(c.C3_vs_C2, true)} |

## Q2 - Does each Sentinel earn its latency?
ms/decision: C0 ${lat.C0} | C1 ${lat.C1} | C2 ${lat.C2} | C3 ${lat.C3} | C4 ${lat.C4} | C5 ${lat.C5}

Action-change screen (${scr.states || '?'} shared states): search vs heuristic ${scr['C2_vs_C0 (does search change actions?)']}; Vanguard priors ${scr['C3_vs_C2 (do Vanguard priors change search?)']}; Horizon ${scr['C4_vs_C3 (does Horizon change fused actions?)']}; Oracle+Nexus ${scr['C5_vs_C4 (do Oracle+Nexus change fused actions?)']}

| Comparison | means | winRate | LCB | verdict |
|---|---|---|---|---|
| C4 (+Horizon) vs C3 | ${c.C4_vs_C3.meanA} -> ${c.C4_vs_C3.meanB} | ${c.C4_vs_C3.winRate} | ${c.C4_vs_C3.lcb} | ${verdict(c.C4_vs_C3, false)} |
| C5 (full stack) vs C3 | ${c.C5_vs_C3.meanA} -> ${c.C5_vs_C3.meanB} | ${c.C5_vs_C3.winRate} | ${c.C5_vs_C3.lcb} | ${verdict(c.C5_vs_C3, false)} |
| C5 vs C0 | ${c.C5_vs_C0.meanA} -> ${c.C5_vs_C0.meanB} | ${c.C5_vs_C0.winRate} | ${c.C5_vs_C0.lcb} | ${verdict(c.C5_vs_C0, true)} |

## Q3 - Segmentation (initial hostility regime; min n=8 or 'insufficient data')
${JSON.stringify(c.C5_vs_C0.segments)} ${c.C5_vs_C0.segmentVeto ? '**SEGMENT VETO: ' + c.C5_vs_C0.segmentVeto + '**' : '(no segment veto fired)'}

## Q4 - Compute envelope
Node numbers above are engineering indicators. Budget sweep: ${JSON.stringify((agg.sweep || {}).entries || (agg.sweep||{}).rows)}
REAL browser cold/warm P50-P99 and device tiers: **PENDING** (run /azl/bench.html on target devices).

## Ruler validation
Degraded-Vanguard test: ${JSON.stringify(agg.degraded)} -> ${agg.degraded && agg.degraded.blocked ? 'harness correctly BLOCKED the degraded model' : 'HARNESS FAILED'}

## Conformance (platform deliverable)
${JSON.stringify((agg.conformance || {}).checks)}

## Objective-function check
${JSON.stringify(agg.healthCheck)}

## Preregistration outcomes
${agg.prereg.expectations.map(e => '- ' + e.id + ': ' + e.text + ' -> **' + e.result + '**').join('\n')}

## Sentinel Value Ledger (v1, reference env)
| Sentinel | ms/decision context | Quality effect | Action-change | Depends on | Status |
|---|---|---|---|---|---|
${ledgerRow('Heuristic (C0)', lat.C0, 'baseline', '-', '-', 'production baseline')}
${ledgerRow('Vanguard alone (C1)', lat.C1, verdict(c.C1_vs_C0, false) + ' vs C0', '-', 'measured only with Prime', 'candidate evaluator')}
${ledgerRow('Prime, uniform (C2)', lat.C2, verdict(c.C2_vs_C0, true) + ' vs C0', scr['C2_vs_C0 (does search change actions?)'], 'forward model', c.C2_vs_C0.winRate > 0.53 ? 'ESSENTIAL' : 'under review')}
${ledgerRow('Vanguard priors (C3-C2)', lat.C3, verdict(c.C3_vs_C2, true), scr['C3_vs_C2 (do Vanguard priors change search?)'], 'Prime', c.C3_vs_C2.winRate > 0.53 ? 'earning its cost' : 'promising but untrained')}
${ledgerRow('Horizon (C4-C3)', (lat.C4 - lat.C3).toFixed(1) + ' added', verdict(c.C4_vs_C3, false), scr['C4_vs_C3 (does Horizon change fused actions?)'], 'root only', Math.abs(c.C4_vs_C3.meanB - c.C4_vs_C3.meanA) <= 0.02 ? 'possible no-op until trained' : 'active influence')}
${ledgerRow('Oracle+Nexus+Arbiter (C5-C3)', (lat.C5 - lat.C3).toFixed(1) + ' added', verdict(c.C5_vs_C3, false), scr['C5_vs_C4 (do Oracle+Nexus change fused actions?)'], 'ring / entity graph', 'deterministic baselines')}
| Temporal candidate | not built | unknown | - | real replay volume | deferred |

## Decision gates (auto-drafted; confirm before acting)
${gateText(c, agg)}

## Pending - requires Dwayne / real environment
1. Real ZekNova adapter binding (feasibility question FIRST: detached-clone tick loop)
2. Human ranking validation of ZekNova health() (50 states) - the check above is a reference-env proxy only
3. Browser + device latency via bench.html (cold/warm P50/P95/P99, low-end device)
4. Shadow advising in real sessions + real-vs-benchmark distribution comparison
5. environment_id schema partitioning (multi-tenancy) before any second environment
`;
}
function gateText(c, agg) {
  const out = [];
  out.push(c.C2_vs_C0.winRate > 0.53 && c.C2_vs_C0.lcb > 0.5
    ? '- Prime improves quality over the heuristic -> keep investing in search + compute allocation'
    : '- Prime gain NOT confirmed vs heuristic -> investigate the preregistered alternative (stochastic step / shallow depth) before adding Sentinels');
  out.push(c.C3_vs_C2.winRate > 0.53 ? '- Vanguard priors improve search -> keep in-tree' : '- Vanguard priors not yet adding over uniform search -> expected pre-training; revisit after real-replay training');
  out.push(Math.abs(c.C4_vs_C3.meanB - c.C4_vs_C3.meanA) <= 0.05 && c.C4_vs_C3.winRate <= 0.53
    ? '- Horizon adds no measurable value yet -> keep interface, consider disabling in routine production until trained'
    : '- Horizon shows measurable influence -> evaluate by decision class');
  out.push(Math.abs(c.C5_vs_C3.meanB - c.C5_vs_C3.meanA) <= 0.05
    ? '- Full stack ~ parity with C3 -> Arbiter/Oracle/Nexus not yet earning cost; acceptable pre-training, watch after learning begins'
    : (c.C5_vs_C3.winRate > 0.53 ? '- Full stack beats C3 -> deterministic specialists earning their cost' : '- Full stack UNDERPERFORMS C3 -> Arbiter dilution suspected; check bounds'));
  const swp = agg.sweep && (agg.sweep.entries ? (agg.sweep.entries.find(e=>e.config==='C2')||agg.sweep.entries[0]).rows : agg.sweep.rows);
  if (swp && swp.length >= 2) {
    const r = swp; const lo = r[0], hi = r[r.length - 1];
    if (Math.abs(hi.mean - lo.mean) <= 0.05) out.push('- Budget sweep: ' + lo.sims + ' sims ~ ' + hi.sims + ' sims -> LOWER the default budget (latency win: ' + lo.msPerDecision + 'ms vs ' + hi.msPerDecision + 'ms)');
    else out.push('- Budget sweep: quality scales with sims -> keep tiered budgets, raise where devices allow');
  }
  return out.join('\n');
}
