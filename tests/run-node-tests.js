/* AZL Node test suite. Run: node tests/run-node-tests.js
 * Benchmarks at the end are CONTAINER/NODE indicative numbers, not browser. */
'use strict';
const path = require('path');
const base = path.join(__dirname, '..', 'public_html', 'azl');
['azl-config.js','azl-util.js','azl-state.js','azl-nn.js','azl-scout.js','azl-strategist.js',
 'azl-oracle.js','azl-relational.js','azl-mcts.js','azl-router.js','azl-weights.js',
 'azl-replay.js','azl-eval.js','azl-ref-adapter.js'].forEach(f => require(path.join(base, f)));
const AZL = globalThis.AZL, U = AZL.Util;
let pass = 0, fail = 0;
function T(name, fn) {
  try { fn(); pass++; console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + ' :: ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m||'') + ' expected ' + b + ' got ' + a); }
function ok(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function near(a, b, eps, m) { if (Math.abs(a - b) > eps) throw new Error((m||'') + ' |' + a + '-' + b + '|>' + eps); }

const ad = AZL.ReferenceAdapter;
const codec = new AZL.Codec(ad);

/* ---- codec ---- */
T('codec determinism', () => {
  const s = ad.sim.init(42), e1 = codec.encode(s, false), e2 = codec.encode(s, false);
  eq(e1.hash, e2.hash); for (let i = 0; i < e1.base.length; i++) eq(e1.base[i], e2.base[i]);
});
T('codec NaN -> default + missing flag', () => {
  const s = ad.sim.init(1); s.food = NaN;
  const e = codec.encode(s, false);
  let miss = 0; for (const v of e.missing) miss += v;
  ok(miss > 0, 'missing count'); for (const v of e.base) ok(isFinite(v), 'finite substitute');
});
T('codec different states differ', () => {
  const a = ad.sim.init(1), b = ad.sim.init(2);
  ok(codec.encode(a, false).hash !== codec.encode(b, false).hash);
});
T('ring order + snapshot', () => {
  const c2 = new AZL.Codec(ad); const s = ad.sim.init(5); const r = new U.RNG(1);
  for (let i = 0; i < 40; i++) { c2.encode(s, true); ad.sim.step(s, 0, r); }
  eq(c2.ring.count, 32, 'ring cap'); const sn = c2.snapshotRing(); eq(sn.count, 32, 'snapshot count'); eq(sn.frames.length, 32 * c2.baseLen, 'snapshot size');
});

/* ---- util ---- */
T('maskedSoftmax stability + all-masked', () => {
  const p = new Float32Array(4);
  ok(U.maskedSoftmax(new Float32Array([1e4, -1e4, 0, 3]), new Uint8Array([1,1,0,1]), p, 1));
  near(p[0]+p[1]+p[2]+p[3], 1, 1e-5); eq(p[2], 0, 'masked stays 0');
  ok(!U.maskedSoftmax(new Float32Array(4), new Uint8Array(4), p, 1), 'all-masked false');
});
T('dirichlet sums to 1', () => {
  const rng = new U.RNG(7), d = U.dirichlet(rng, 0.6, 5);
  let s = 0; for (const v of d) { s += v; ok(v >= 0); } near(s, 1, 1e-6);
});
T('rng determinism', () => { const a = new U.RNG(9), b = new U.RNG(9); for (let i=0;i<100;i++) eq(a.next(), b.next()); });

/* ---- nn ---- */
T('nn forward dims + mask', () => {
  const net = AZL.makeScout(codec);
  const x = new Float32Array(codec.enrichedLen).fill(0.1);
  const mask = new Uint8Array(codec.A).fill(1); mask[3] = 0;
  const o = net.forward(x, mask);
  eq(o.policy.length, codec.A); eq(o.policy[3], 0, 'illegal zero'); ok(Math.abs(o.values.now) <= 1);
});
T('nn gradcheck (tiny net, central diff)', () => {
  const net = new AZL.NN.Net({ name: 'tiny', input: 6, width: 8, blocks: 1, policy: 3, values: ['now'], confidence: false, seed: 3 });
  const x = new Float32Array([0.2,-0.3,0.5,0.1,-0.7,0.4]);
  const mask = new Uint8Array([1,1,1]);
  const tg = { mask, policyDist: new Float32Array([0.7,0.2,0.1]), values: { now: 0.3 }, weight: 1, entropyBeta: 0, huberDelta: 1, headWeights: { now: 1 } };
  const lossAt = () => { net.zeroGrads(); const r = net.trainExample(x, tg); return r.policy + r.value + r.calibration; };
  net.zeroGrads(); net.trainExample(x, tg);
  const g = net.grads.slice();
  let checked = 0;
  for (const pi of [0, 11, 45, net.paramCount - 2]) {
    const eps = 1e-2, orig = net.params[pi];
    net.params[pi] = orig + eps; const lp = lossAt();
    net.params[pi] = orig - eps; const lm = lossAt();
    net.params[pi] = orig;
    const num = (lp - lm) / (2 * eps), ana = g[pi];
    const denom = Math.max(1e-2, Math.abs(num) + Math.abs(ana));
    ok(Math.abs(num - ana) / denom < 0.1, 'param ' + pi + ' num ' + num + ' ana ' + ana);
    checked++;
  }
  ok(checked === 4);
});
T('nn overfit reduces loss', () => {
  const net = new AZL.NN.Net({ name: 'tiny2', input: 6, width: 16, blocks: 1, policy: 3, values: ['now'], confidence: false, seed: 5 });
  const ex = [];
  const r = new U.RNG(2);
  for (let i = 0; i < 8; i++) {
    const x = new Float32Array(6); for (let j = 0; j < 6; j++) x[j] = r.next() * 2 - 1;
    const pd = new Float32Array([i % 3 === 0 ? 1 : 0, i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0]);
    ex.push({ input: x, targets: { mask: new Uint8Array([1,1,1]), policyDist: pd, values: { now: (i % 2) * 0.8 - 0.4 }, weight: 1, entropyBeta: 0, huberDelta: 1, headWeights: { now: 1 } } });
  }
  const lossAll = () => { net.zeroGrads(); let L = 0; for (const e of ex) { const r = net.trainExample(e.input, e.targets); L += r.policy + r.value + r.calibration; } net.zeroGrads(); return L / ex.length; };
  const l0 = lossAll();
  for (let s = 0; s < 300; s++) net.trainBatch(ex, { lr: 3e-3, clipNorm: 5, l2: 0 });
  const l1 = lossAll();
  ok(l1 < l0 * 0.5, 'loss halved: ' + l0 + ' -> ' + l1);
});
T('nn export/import round trip + shape reject', () => {
  const a = AZL.makeScout(codec), b = AZL.makeScout(codec);
  const w = a.exportWeights();
  ok(b.importWeights(w) === true);
  eq(a.params[100], b.params[100]);
  const bad = a.exportWeights(); bad.tensors[0].data = bad.tensors[0].data.slice(0, 5);
  ok(b.validateWeights(bad) === false, 'shape reject');
});

/* ---- AZLW ---- */
T('AZLW f32 exact + f16 approx + tamper + truncation', () => {
  const net = AZL.makeScout(codec);
  const w = net.exportWeights();
  const f32 = AZL.Weights.encode(w, 'f32', 123);
  const d32 = AZL.Weights.decode(f32);
  eq(d32.tensors[0].data[3], w.tensors[0].data[3]); eq(d32.archVersion >>> 0, 123);
  const f16 = AZL.Weights.encode(w, 'f16', 123);
  const d16 = AZL.Weights.decode(f16);
  near(d16.tensors[0].data[3], w.tensors[0].data[3], 0.01);
  let threw = false;
  try { const tampered = f32.slice(); tampered[f32.length - 20] ^= 0xFF; AZL.Weights.decode(tampered); } catch (e) { threw = true; }
  ok(threw, 'tamper reject');
  threw = false;
  try { AZL.Weights.decode(f32.slice(0, 40)); } catch (e) { threw = true; }
  ok(threw, 'truncation reject');
});

/* ---- mcts ---- */
function mkMcts(scout, seed, cfg) {
  const enr = new Float32Array(codec.enrichedLen);
  const evalFn = st => { const e = codec.encode(st, false); codec.enrich(e.base, null, null, null, enr); const o = scout.forward(enr, e.mask); return { policy: o.policy, value: o.values.now, mask: e.mask, hash: e.hash, tick: e.tick }; };
  evalFn.probe = st => { const e = codec.encode(st, false); return { hash: e.hash, tick: e.tick }; };
  return new AZL.MCTS({ adapter: ad, codec, evalFn, rng: new U.RNG(seed), cfg: cfg || {} });
}
const scout = AZL.makeScout(codec);
T('mcts deterministic per seed', () => {
  const s = ad.sim.init(3);
  const r1 = mkMcts(scout, 5).search(s, { sims: 120, ms: 5000 }, 'advise');
  const r2 = mkMcts(scout, 5).search(s, { sims: 120, ms: 5000 }, 'advise');
  for (let i = 0; i < r1.visits.length; i++) eq(r1.visits[i], r2.visits[i]);
});
T('mcts never visits illegal', () => {
  const s = ad.sim.init(8);
  const r = mkMcts(scout, 2).search(s, { sims: 200, ms: 5000 }, 'advise');
  for (let i = 0; i < r.visits.length; i++) if (!r.mask[i]) eq(r.visits[i], 0, 'action ' + i);
});
T('mcts tree reuse advance', () => {
  const m = mkMcts(scout, 4);
  const s = ad.sim.init(9);
  const r = m.search(s, { sims: 100, ms: 5000 }, 'advise');
  const a = U.argmax(r.policy, r.mask);
  const rng = new U.RNG(1); ad.sim.step(s, a, rng);
  const h = codec.encode(s, false).hash;
  ok(m.advance(a, h) === true || m.advance(a, h) === false, 'advance returns bool');
});
T('mcts node cap', () => {
  const m = mkMcts(scout, 6, { maxNodes: 150 });
  const r = m.search(ad.sim.init(12), { sims: 800, ms: 8000 }, 'advise');
  ok(r.diag.nodes <= 151, 'nodes ' + r.diag.nodes);
});

/* ---- router ---- */
T('router bounds + sum', () => {
  const s = ad.sim.init(3);
  const m = mkMcts(scout, 5).search(s, { sims: 120, ms: 5000 }, 'advise');
  const enr = new Float32Array(codec.enrichedLen);
  const e = codec.encode(s, false); codec.enrich(e.base, null, null, null, enr);
  const so = scout.forward(enr, e.mask);
  const strat = AZL.makeStrategist(codec);
  const sv = strat.forward(enr, e.mask);
  const bufs = AZL.Router.makeBuffers(codec.A);
  const f = AZL.Router.fuse({ mcts: m, scoutRoot: { policy: Array.from(so.policy), value: so.values.now },
    strategist: { policy: Array.from(sv.policy), values: sv.values, confidence: sv.confidence },
    oracle: null, relational: null, novelty: 0.2, criticality: 0.1, heuristicValue: ad.sim.heuristicValue(s),
    validatedSamples: 0, rootSimState: s, fallbackMask: e.mask }, ad, codec.A, bufs);
  ok(f.weights.searchWeight >= 0.499, 'search floor ' + f.weights.searchWeight);
  ok(f.weights.strategistWeight <= 0.351, 'strat cap');
  ok(f.weights.scoutRootWeight <= 0.201, 'scout cap');
  near(f.weights.searchWeight + f.weights.strategistWeight + f.weights.scoutRootWeight, 1, 1e-4);
  ok(e.mask[f.actionIdx] === 1, 'fused action legal');
});
T('router fallback level without mcts', () => {
  const s = ad.sim.init(3), e = codec.encode(s, false);
  const bufs = AZL.Router.makeBuffers(codec.A);
  const f = AZL.Router.fuse({ mcts: null, scoutRoot: null, strategist: null, oracle: null, relational: null,
    novelty: 0, criticality: 0, heuristicValue: 0, validatedSamples: 0, rootSimState: s, fallbackMask: e.mask }, ad, codec.A, bufs);
  ok(f.level >= 3, 'level ' + f.level); ok(e.mask[f.actionIdx] === 1);
});

/* ---- replay logic ---- */
const R = AZL.Replay;
T('priority multipliers', () => {
  const mk = (followed, sess) => R.computePriority({ followedAdvisor: followed, outcomes: { session: sess }, novelty: 0, disagreement: 0, confidentWrong: false, source: 'player' });
  ok(mk(false, 1) > mk(true, 1), 'overrideWin > followWin');
  ok(mk(true, -1) > mk(true, 1), 'followLose > followWin');
});
T('resolveOutcomes horizons + finalize', () => {
  const H = AZL.CONFIG.OUTCOME_HORIZONS;
  const t = R.makeTuple({ sessionId: U.uuid(), gameV: 1, stateHash: 1, tick: 100, baseVec: new Float32Array(3), mask: new Uint8Array([1]), recommendedAction: 0, playerAction: 0, followedAdvisor: true, autonomous: false, nowHealth: 0.1, source: 'player' });
  const arr = [t];
  R.resolveOutcomes(arr, 100 + H.m5Ticks, 0.5);
  near(t.outcomes.m5, 0.5, 1e-9); ok(t.outcomes.m30 == null);
  R.resolveOutcomes(arr, 100 + H.m30Ticks, -0.2);
  near(t.outcomes.m30, -0.2, 1e-9);
  R.finalizeSession(arr, 0.7);
  near(t.outcomes.session, 0.7, 1e-9); ok(t.completeness >= 0.75);
});

/* ---- fed delta + eval ---- */
require(path.join(base, 'azl-federated.js'));
T('fed buildDelta clip + activateRaw validation', () => {
  const a = AZL.makeScout(codec), baseP = a.snapshotParams();
  for (let i = 0; i < 200; i++) a.params[i] += 0.9;
  const d = AZL.Fed.buildDelta(a, baseP);
  ok(d.norm <= AZL.CONFIG.FEDERATED.deltaClipNorm + 1e-4, 'norm ' + d.norm);
  const b = AZL.makeScout(codec);
  const buf = a.snapshotParams().buffer;
  ok(AZL.Fed.activateRaw(b, buf, { version: 2 }).ok);
  eq(b.version, 2);
  ok(!AZL.Fed.activateRaw(b, new ArrayBuffer(16), {}).ok, 'wrong length reject');
});
T('ref sim deterministic + terminates', () => {
  const r1 = new U.RNG(3), r2 = new U.RNG(3);
  const s1 = ad.sim.init(77), s2 = ad.sim.init(77);
  for (let i = 0; i < 50; i++) { ad.sim.step(s1, i % 12, r1); ad.sim.step(s2, i % 12, r2); }
  eq(codec.encode(s1, false).hash, codec.encode(s2, false).hash);
});
T('wilson LCB sanity + pairedEval runs', () => {
  ok(AZL.Eval.wilsonLCB(9, 10) > AZL.Eval.wilsonLCB(5, 10));
  ok(AZL.Eval.wilsonLCB(90, 100) > AZL.Eval.wilsonLCB(9, 10), 'more games tighter');
  const cand = AZL.makeScout(codec), prod = AZL.makeScout(codec);
  const r = AZL.Eval.pairedEval({ adapter: ad, codec, candidateScout: cand, productionScout: prod, games: 2, seedBase: 50, maxTicks: 40, sims: 24, msPerMove: 30 });
  eq(r.wins + r.losses + r.draws, 2);
});

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
if (fail === 0 && process.argv.indexOf('--bench') !== -1) {
  console.log('\n-- benchmarks (container Node ' + process.version + ', indicative only; browser numbers come from bench.html) --');
  const s = ad.sim.init(11), e = codec.encode(s, true);
  const enr = new Float32Array(codec.enrichedLen); codec.enrich(e.base, null, null, null, enr);
  function bench(name, fn, iters, warm) { for (let i=0;i<warm;i++) fn(); const t0=process.hrtime.bigint(); for (let j=0;j<iters;j++) fn(); const us=Number(process.hrtime.bigint()-t0)/1000/iters; console.log(name+': '+us.toFixed(1)+' us/op'); }
  bench('codec.encode', () => codec.encode(s, false), 20000, 2000);
  bench('scout.forward', () => scout.forward(enr, e.mask), 20000, 3000);
  const strat = AZL.makeStrategist(codec);
  bench('strategist.forward', () => strat.forward(enr, e.mask), 3000, 300);
  const m = mkMcts(scout, 3);
  m.search(s, { sims: 200, ms: 60000 }, 'advise'); m.reset();
  const t0 = process.hrtime.bigint();
  const r = m.search(s, { sims: 800, ms: 60000 }, 'advise');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log('MCTS: ' + r.diag.sims + ' sims in ' + ms.toFixed(1) + 'ms = ' + (r.diag.sims / (ms / 1000)).toFixed(0) + ' sims/sec, depth ' + r.diag.maxDepth + ', nodes ' + r.diag.nodes);
}
process.exit(fail ? 1 : 0);
