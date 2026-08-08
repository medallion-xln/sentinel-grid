#!/usr/bin/env node
/* Sentinel Grid Lab - Phase 1.2 runner (env v2, outcome-vector scoring).
 * v1 runner (lab.js) and its results are FROZEN in results-v1-health-proxy/.
 * Scoring here is an OUTCOME VECTOR with a declared aggregation - not the
 * health() composite and not the heuristic evaluator's weighting:
 *   survived        1 unless population collapse terminal        (weight .35)
 *   ticksFrac       survival time / 2400                          (.15)
 *   popN            final population / 120                        (.20)
 *   infraN          final infrastructure / 100                    (.10)
 *   exploredN       final exploration (0..1)                      (.10)
 *   threatContained 1 - final threat / 160                        (.10)
 * Honesty note: all signals derive from state (nothing else exists), but none
 * reuse health()'s weighting, and survival is a real event, not a composite.
 * Commands: freeze2 | ladder2 --configs C0,C1,C2,C3,RND [--from I --to J]
 *           identity | sweep2 --sims N [--from --to] | latency6 | aggregate2 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ENG = path.join(__dirname, '..', 'public_html', 'azl');
const OUT = path.join(__dirname, 'results-v2'); fs.mkdirSync(OUT, { recursive: true });
const WDIR = path.join(__dirname, 'weights-v2'); fs.mkdirSync(WDIR, { recursive: true });
const MODULES = ['azl-config.js','azl-util.js','azl-state.js','azl-nn.js','azl-scout.js','azl-strategist.js',
 'azl-oracle.js','azl-relational.js','azl-mcts.js','azl-router.js','azl-weights.js','azl-federated.js',
 'azl-eval.js','azl-ref-adapter-v2.js'];
MODULES.forEach(f => require(path.join(ENG, f)));
const AZL = globalThis.AZL, U = AZL.Util, ad = AZL.ReferenceAdapter, codec = new AZL.Codec(ad);
const HORIZON = 2400, SEEDS = Array.from({ length: 28 }, (_, i) => 1000 + i * 7919);
const W = { survived: .35, ticksFrac: .15, popN: .20, infraN: .10, exploredN: .10, threatContained: .10 };
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);
const save = (n, o) => { fs.writeFileSync(path.join(OUT, n), JSON.stringify(o, null, 1)); console.log('wrote results-v2/' + n); };
const load = n => { const p = path.join(OUT, n); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const segOf = seed => { const s = ad.sim.init(seed); return s.threatGrowth < 0.9 ? 'calm' : (s.threatGrowth < 1.1 ? 'standard' : 'hostile'); };

function nets() {
  const scout = AZL.makeScout(codec), strat = AZL.makeStrategist(codec);
  const sf = path.join(WDIR, 'vanguard-v2env.f32');
  if (fs.existsSync(sf)) {
    AZL.Fed.activateRaw(scout, readF32(sf), { version: 1 });
    AZL.Fed.activateRaw(strat, readF32(path.join(WDIR, 'horizon-v2env.f32')), { version: 1 });
  } else {
    AZL.distillScout(scout, codec, ad, { rounds: 40, batch: 48 }); // same recipe as v1, under env v2
    fs.writeFileSync(sf, Buffer.from(scout.snapshotParams().buffer));
    fs.writeFileSync(path.join(WDIR, 'horizon-v2env.f32'), Buffer.from(strat.snapshotParams().buffer));
    console.log('distilled + froze weights under env v2');
  }
  return { scout, strat };
}
function readF32(f) { const b = fs.readFileSync(f); const ab = new ArrayBuffer(b.length); new Uint8Array(ab).set(b); return ab; }
function mkEval(scout, uniform) {
  const enr = new Float32Array(codec.enrichedLen);
  const fn = st => { const e = codec.encode(st, false);
    if (uniform) { let n = 0; for (const v of e.mask) n += v; const pol = new Float32Array(codec.A);
      for (let i = 0; i < pol.length; i++) pol[i] = e.mask[i] ? 1 / n : 0;
      return { policy: pol, value: ad.sim.heuristicValue(st), mask: e.mask, hash: e.hash, tick: e.tick }; }
    codec.enrich(e.base, null, null, null, enr);
    const o = scout.forward(enr, e.mask);
    return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick }; };
  fn.probe = st => { const e = codec.encode(st, false); return { hash: e.hash, tick: e.tick }; };
  return fn;
}
function decideFactory(cfg, N, seed) {
  const enr = new Float32Array(codec.enrichedLen);
  let m = null;
  if (cfg === 'C2' || cfg === 'C3') m = new AZL.MCTS({ adapter: ad, codec, evalFn: mkEval(N.scout, cfg === 'C2'), rng: new U.RNG(seed ^ 0x51D), cfg: { reuseTree: false } });
  const mask = new Uint8Array(codec.A), sc = new Float32Array(codec.A);
  const rrng = new U.RNG(seed ^ 0xABCD);
  return (s, sims) => {
    if (cfg === 'C0') { ad.sim.legalMask(s, mask); ad.sim.actionScores(s, sc); return U.argmax(sc, mask); }
    if (cfg === 'RND') { ad.sim.legalMask(s, mask); let i = rrng.int(codec.A); for (let k = 0; k < codec.A; k++, i = (i + 1) % codec.A) if (mask[i]) return i; return 0; }
    if (cfg === 'C1') { const e = codec.encode(s, false); codec.enrich(e.base, null, null, null, enr); return U.argmax(N.scout.forward(enr, e.mask).policy, e.mask); }
    const r = m.search(s, { sims, ms: 1e9 }, 'advise'); return U.argmax(r.policy, r.mask);
  };
}
function episode(cfg, seed, N, sims) {
  const dec = decideFactory(cfg, N, seed);
  const s = ad.sim.init(seed), rng = new U.RNG(seed ^ 0xE9);
  let tv = null, lat = [];
  let t = 0;
  for (; t < HORIZON; t++) {
    const t0 = process.hrtime.bigint();
    const a = dec(s, sims);
    lat.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const st = ad.sim.step(s, a, rng);
    if (st.terminal) { tv = st.terminalValue; break; }
  }
  const vec = { survived: tv === -1 ? 0 : 1, ticksFrac: +(Math.min(t + 1, HORIZON) / HORIZON).toFixed(3),
    popN: +(s.population / 120).toFixed(3), infraN: +(s.infra / 100).toFixed(3),
    exploredN: +s.explored.toFixed(3), threatContained: +(1 - s.threat / 160).toFixed(3) };
  let agg = 0; for (const k in W) agg += W[k] * vec[k];
  return { seed, cfg, segment: segOf(seed), vec, agg: +agg.toFixed(4), collapsedAt: tv === -1 ? t : null, lat: lat.slice(5) };
}
const pct = (arr, p) => { const a = arr.slice().sort((x, y) => x - y); return +(a[Math.min(a.length - 1, Math.floor(a.length * p))]).toFixed(2); };

const cmd = process.argv[2] || 'help';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };

if (cmd === 'freeze2') {
  nets();
  const mods = {}; MODULES.forEach(f => mods[f] = sha(path.join(ENG, f)));
  save('baseline2.json', { frozenAt: new Date().toISOString(), envId: 'reference-colony', envVersion: 2,
    horizon: HORIZON, scoringWeights: W, moduleHashes: mods,
    weights: { vanguard: sha(path.join(WDIR, 'vanguard-v2env.f32')), horizon: sha(path.join(WDIR, 'horizon-v2env.f32')) },
    runtime: 'node ' + process.version });
} else if (cmd === 'ladder2') {
  const N = nets(); const cfgs = arg('configs', 'C0').split(',');
  const from = parseInt(arg('from', '0'), 10), to = parseInt(arg('to', String(SEEDS.length)), 10);
  const sims = parseInt(arg('sims', '128'), 10);
  for (const cfg of cfgs) {
    const file = 'ladder2-' + cfg + '.json';
    const prev = load(file) || { cfg, sims, episodes: [] };
    for (const sd of SEEDS.slice(from, to)) {
      if (prev.episodes.some(e => e.seed === sd)) continue;
      const e = episode(cfg, sd, N, sims);
      const latArr = e.lat; delete e.lat;
      e.latP50 = pct(latArr, .5); e.latP95 = pct(latArr, .95); e.latP99 = pct(latArr, .99);
      prev.episodes.push(e);
      fs.writeFileSync(path.join(OUT, file), JSON.stringify(prev)); // incremental
      console.log(cfg, sd, 'agg', e.agg, 'survived', e.vec.survived, e.collapsedAt ? 'collapsed@' + e.collapsedAt : '', 'p50', e.latP50 + 'ms');
    }
    console.log(file, 'now has', prev.episodes.length, 'episodes');
  }
} else if (cmd === 'identity') { // are C4/C5 fused actions still identical to C3?
  const N = nets(); const bufs = AZL.Router.makeBuffers(codec.A); const enr = new Float32Array(codec.enrichedLen);
  const states = [];
  for (const sd of SEEDS.slice(0, 6)) { const s = ad.sim.init(sd), rng = new U.RNG(sd);
    for (let t = 0; t < 200 && states.length < 60; t++) { if (t % 20 === 0) states.push(ad.sim.clone(s));
      const m2 = new Uint8Array(codec.A); ad.sim.legalMask(s, m2); let i = rng.int(codec.A);
      for (let k = 0; k < codec.A; k++, i = (i + 1) % codec.A) if (m2[i]) break;
      if (ad.sim.step(s, i, rng).terminal) break; } }
  const m = new AZL.MCTS({ adapter: ad, codec, evalFn: mkEval(N.scout, false), rng: new U.RNG(9), cfg: { reuseTree: false } });
  let diff = 0;
  for (const st of states) {
    const r = m.search(st, { sims: 128, ms: 1e9 }, 'advise');
    const c3 = U.argmax(r.policy, r.mask);
    const e = codec.encode(st, false); codec.enrich(e.base, null, null, null, enr);
    const so = N.scout.forward(enr, e.mask), sv = N.strat.forward(enr, e.mask);
    const f = AZL.Router.fuse({ mcts: r, scoutRoot: { policy: Array.from(so.policy), value: so.values.now },
      strategist: { policy: Array.from(sv.policy), values: sv.values, confidence: sv.confidence },
      oracle: null, relational: null, novelty: .3, criticality: 0, heuristicValue: ad.sim.heuristicValue(st),
      validatedSamples: 0, rootSimState: st, fallbackMask: e.mask }, ad, codec.A, bufs);
    if (f.actionIdx !== c3) diff++;
  }
  save('identity.json', { states: states.length, c4c5_actions_differing_from_C3: diff,
    conclusion: diff === 0 ? 'C4/C5 inherit C3 quality exactly under env v2 (verified on ' + states.length + ' states)' : 'DIVERGENCE - run C4/C5 ladder fully' });
  console.log(load('identity.json'));
} else if (cmd === 'sweep2') {
  const N = nets(); const sims = parseInt(arg('sims', '64'), 10);
  const from = parseInt(arg('from', '0'), 10), to = parseInt(arg('to', '8'), 10);
  const file = 'sweep2.json'; const prev = load(file) || { rows: [] };
  let row = prev.rows.find(r => r.sims === sims); if (!row) { row = { sims, eps: [] }; prev.rows.push(row); }
  for (const sd of SEEDS.slice(from, to)) { if (row.eps.some(e => e.seed === sd)) continue;
    const e = episode('C2', sd, N, sims); delete e.lat; row.eps.push({ seed: sd, agg: e.agg, survived: e.vec.survived });
    console.log('sims', sims, sd, 'agg', e.agg); }
  row.meanAgg = +(row.eps.reduce((a, e) => a + e.agg, 0) / row.eps.length).toFixed(3);
  row.survRate = +(row.eps.reduce((a, e) => a + e.survived, 0) / row.eps.length).toFixed(2);
  save(file, prev);
} else if (cmd === 'aggregate2') {
  const CF = ['C0', 'C1', 'C2', 'C3', 'RND']; const L = {};
  CF.forEach(c => { L[c] = load('ladder2-' + c + '.json'); if (!L[c] || L[c].episodes.length < SEEDS.length) throw new Error('incomplete ' + c); L[c].episodes.sort((a, b) => a.seed - b.seed); });
  const stat = c => { const E = L[c].episodes; const m = {}; for (const k in W) m[k] = +(E.reduce((a, e) => a + e.vec[k], 0) / E.length).toFixed(3);
    return { meanAgg: +(E.reduce((a, e) => a + e.agg, 0) / E.length).toFixed(3), vec: m,
      collapses: E.filter(e => e.vec.survived === 0).length,
      latP50: pct(E.map(e => e.latP50), .5), latP95: pct(E.map(e => e.latP95), .5) }; };
  const paired = (A, B) => { let w = 0, l = 0, d = 0; const segs = {};
    L[A].episodes.forEach((ea, i) => { const eb = L[B].episodes[i]; const df = eb.agg - ea.agg;
      const s = ea.segment; segs[s] = segs[s] || { n: 0, w: 0, l: 0 }; segs[s].n++;
      if (df > 0.02) { w++; segs[s].w++; } else if (df < -0.02) { l++; segs[s].l++; } else d++; });
    const segOut = {}; let veto = null;
    for (const k in segs) { const g = segs[k];
      if (g.n < 8) { segOut[k] = { n: g.n, verdict: 'insufficient data' }; continue; }
      const lcb = AZL.Eval.wilsonLCB(g.w, g.w + g.l || 1); segOut[k] = { n: g.n, w: g.w, l: g.l, lcb: +lcb.toFixed(3) };
      if (lcb < 0.35 && g.l > g.w) veto = k; }
    return { wins: w, losses: l, draws: d, winRate: +((w / Math.max(1, w + l))).toFixed(3),
      lcb: +AZL.Eval.wilsonLCB(w, w + l || 1).toFixed(3), segments: segOut, segmentVeto: veto }; };
  const S = {}; CF.forEach(c => S[c] = stat(c));
  const cmp = { C2_vs_C0: paired('C0', 'C2'), C2_vs_RND: paired('RND', 'C2'), C3_vs_C1: paired('C1', 'C3'), C2_vs_C3: paired('C3', 'C2'), C1_vs_C0: paired('C0', 'C1') };
  const prereg = JSON.parse(fs.readFileSync(path.join(__dirname, 'prereg2.json'), 'utf8'));
  const agg = { generatedAt: new Date().toISOString(), baseline: load('baseline2.json'), stats: S, comparisons: cmp,
    sweep: load('sweep2.json'), identity: load('identity.json'), prereg };
  save('capability-baseline-v2.json', agg);
  const md = `# Sentinel Grid - Capability Baseline v2 (env v2, outcome-vector scoring)

Environment: reference-colony **v2** (hardened, losable; heuristic collapses 19/20 unaided). Horizon ${HORIZON} ticks.
Scoring: declared vector ${JSON.stringify(W)} - survival is a real event; no reuse of health() weighting.
Provenance: results-v2/baseline2.json. Latency: warmed (first 5 decisions/episode discarded), per-config P50/P95.
v1 (health-proxy) results FROZEN at results-v1-health-proxy/ - do not compare across scoring versions.

## Ladder (28 paired seeds)
| Config | meanAgg | collapses | survived | popN | infraN | exploredN | threat | latP50 | latP95 |
|---|---|---|---|---|---|---|---|---|---|
${CF.map(c => '| ' + [c, S[c].meanAgg, S[c].collapses + '/28', S[c].vec.survived, S[c].vec.popN, S[c].vec.infraN, S[c].vec.exploredN, S[c].vec.threatContained, S[c].latP50 + 'ms', S[c].latP95 + 'ms'].join(' | ') + ' |').join('\n')}

## Paired comparisons (agg, tie eps .02)
${Object.entries(cmp).map(([k, v]) => '- **' + k + '**: ' + v.wins + 'W/' + v.losses + 'L/' + v.draws + 'D, winRate ' + v.winRate + ', LCB ' + v.lcb + (v.segmentVeto ? ' **SEGMENT VETO: ' + v.segmentVeto + '**' : '') + ' | segs ' + JSON.stringify(v.segments)).join('\n')}

## Budget sweep (C2)
${JSON.stringify((agg.sweep || {}).rows && agg.sweep.rows.map(r => ({ sims: r.sims, meanAgg: r.meanAgg, survRate: r.survRate, n: r.eps.length })))}

## C4/C5 status
${(agg.identity || {}).conclusion || 'not run'}

## Preregistration outcomes
${prereg.expectations.map(e => '- ' + e.id + ': ' + e.text + ' -> **' + evalPre(e, cmp, S) + '**').join('\n')}

## Pending (real environment / local machine)
Full sweep + degraded-ruler re-validation under v2 (one command each, heavier than container budget); human ranking of real ZekNova states; adapter feasibility; browser device runs; environment_id PHP wiring (migration shipped).
`;
  fs.writeFileSync(path.join(OUT, 'CAPABILITY_BASELINE_v2.md'), md);
  console.log('wrote results-v2/CAPABILITY_BASELINE_v2.md');
} else console.log('freeze2 | ladder2 | identity | sweep2 | aggregate2');

function evalPre(e, cmp, S) {
  if (e.kind === 'gain') { const c = cmp[e.comparison]; return (c.winRate > 0.53 && c.lcb > 0.5) ? 'MATCHED (lcb ' + c.lcb + ')' : 'NOT CONFIRMED (wr ' + c.winRate + ', lcb ' + c.lcb + ') - see alternative'; }
  if (e.kind === 'parity') { const c = cmp[e.comparison]; return (c.winRate >= 0.35 && c.winRate <= 0.65) ? 'MATCHED (parity band)' : 'SURPRISE (wr ' + c.winRate + ') - investigate'; }
  if (e.kind === 'collapse-prone') return S[e.config].collapses >= 14 ? 'MATCHED (' + S[e.config].collapses + '/28 collapsed)' : 'SURPRISE (' + S[e.config].collapses + '/28)';
  if (e.kind === 'gamed-survival') return (S.RND.vec.survived >= 0.8 && S.RND.meanAgg < S.C2.meanAgg) ? 'MATCHED (RND survives but loses on agg)' : 'CHECK (RND surv ' + S.RND.vec.survived + ', agg ' + S.RND.meanAgg + ')';
  return '?';
}
