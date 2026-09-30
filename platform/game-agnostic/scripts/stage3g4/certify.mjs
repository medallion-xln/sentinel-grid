#!/usr/bin/env node
/* STAGE_3G_4 — LEVEL-STRATIFIED TEMPORAL REPLICATION certification.
 *
 *   --phase=open            refit the Stage 3G.3 models on its DEV rows (hash-bound), fit the new deployable / search
 *                           diagnostics on DEV and the secondary level-balanced models on the open fit set; write the
 *                           open-phase report. No sealed row is read.
 *   --dry-run --out=<file>  every evaluation code path with the open fit rows standing in for the sealed families
 *                           (alternate rows -> A / B); writes only <file> (outside the repository); no sealed row is read
 *   (default)               the single sealed evaluation; writes the certificate
 *   --check                 recompute and require a byte-identical certificate; never writes a tracked file
 * Run through scripts/reproducibility/run-canonical.mjs (SENTINEL_CANONICAL_NUMERICS_V1).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enforceCheckModeReadOnly } from '../certification/check-mode-guard.mjs';

const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const dryRun = process.argv.includes('--dry-run');
const dryOut = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? null;
enforceCheckModeReadOnly({ checkOnly: checkOnly || dryRun });
if (dryRun && (!dryOut || path.resolve(dryOut).startsWith(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')))) throw new Error('--dry-run requires --out=<file outside the repository>');

const numerics = await import('../../src/core/canonical-numerics-v1.js');
const CANONICAL = Math.exp === numerics.exp && Math.log === numerics.log && Math.pow === numerics.pow;
if (!CANONICAL) process.stderr.write('[stage3g4] WARNING: not running under SENTINEL_CANONICAL_NUMERICS_V1; the result cannot certify\n');
const P = await import('./plan.mjs');
const { stage3g4Evidence, isEligible } = await import('./evidence.mjs');
const { EVALUATION_FILES, priorLineage, readFitRows, seedAudit } = await import('./generate.mjs');
const { readCorpus } = await import('../generate-stage3f6p1e-policy-evidence.mjs');
const { STAGE3F6P1ASYM_STATE_FEATURES } = await import('../stage3f6p1asym-analysis-plan.mjs');
const { TWIN_TRANSFORMS } = await import('../stage3f6p1asym-evidence.mjs');
const { bootstrapMean, bootstrapPlan } = await import('../../src/stage3f/policy-requalification-v1.js');
const { fitCandidateLogit, materialGain, modelHash, scoreCandidates, topSet } = await import('../../src/stage3f/free-action-sufficiency-v1.js');
const { OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH } = await import('../../src/stage3g/observable-option-features-v1.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const log = (m) => process.stderr.write(`[stage3g4] ${m}\n`);
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const STATE_IDS = STAGE3F6P1ASYM_STATE_FEATURES.featureIds;
const K = [2, 3, 4]; const DK = { 2: 'D_H2', 3: 'D_H3', 4: 'D_H4' };

/* ================================================================== items and columns (Stage 3G.3 column logic, unchanged) */
function prepare(rows, label, { depth3Every = 0 } = {}) {
  const eligible = rows.filter(isEligible); const out = [];
  eligible.forEach((row, i) => {
    const ev = stage3g4Evidence(row, { depth3: depth3Every > 0 && i % depth3Every === 0 }); const optimal = ev.candidates.filter((x) => x.o === 1);
    out.push({ row, ev, state: STATE_IDS.map((id) => row.core[id]), level: row.combination.level, multiOptimal: optimal.length > 1, retreatOptimal: optimal.some((x) => x.type === 'RETREAT') });
    if ((i + 1) % 1000 === 0) log(`${label} ${i + 1}/${eligible.length}`);
  });
  return out;
}
const partial = (item, k) => item.ev.labelHorizon + 1 > k;
const CAND = (c) => [...c.blocks.TYPE, ...c.blocks.CANDIDATE, ...c.blocks.GEOMETRY, ...c.GP];
const pairs = (v) => { const out = []; for (let a = 0; a < v.length; a += 1) for (let b = a + 1; b < v.length; b += 1) out.push(v[a] * v[b]); return out; };
const BLOCK = { TYPE: (c) => c.blocks.TYPE, CANDIDATE: (c) => c.blocks.CANDIDATE, GEOMETRY: (c) => c.blocks.GEOMETRY, GP: (c) => c.GP, PRIV: (c) => c.priv,
  PAIRS: (c) => pairs(CAND(c)), OPTION: (c) => c.option, TEMPORAL: (c) => c.temporal, OBS_OPTION: (c) => c.obsOption };
const REL = { ONESTEP: ['T', 0], H2: ['T', 1], H3: ['T', 2], H4: ['T', 3], SEARCH1: ['search', 1], SEARCH2: ['search', 2] };
function columns(item, spec, view = (c) => c) {
  const rel = Object.fromEntries(Object.entries(REL).map(([b, [f, t]]) => { const v = item.ev.candidates.map((c) => c[f][t]); return [b, { max: Math.max(...v), mean: mean(v) }]; }));
  return item.ev.candidates.map((c0) => {
    const c = view(c0); const cols = [];
    for (const b of spec.main) { if (REL[b] !== undefined) { const [f, t] = REL[b]; cols.push(c0[f][t] - rel[b].max, c0[f][t] - rel[b].mean); } else cols.push(...BLOCK[b](c)); }
    for (const b of spec.interact) for (const v of BLOCK[b](c)) for (const s of item.state) cols.push(v * s);
    return cols;
  });
}
const fitLogit = (items, spec) => fitCandidateLogit(items.map((it) => ({ X: columns(it, spec), y: it.ev.candidates.map((c) => c.o) })));
const logitStrategy = (m, spec) => ({ run: (item, view) => scoreCandidates(m, columns(item, spec, view)) });
const plannerStrategy = (d) => ({ planner: d, run: (item) => { if (item.ev.candidates[0].search.length <= d) return null; const s = item.ev.candidates.map((c) => c.search[d]); return { scores: s, probabilities: s.map(() => 1 / s.length) }; } });
function decide(strategy, item) { const r = strategy.run(item); return r === null ? null : { idx: topSet(r.scores), probs: r.probabilities }; }
function outcome(item, d) {
  if (d === null) return null;
  const c = item.ev.candidates; const k = d.idx.length; const maxR = Math.max(...Object.values(item.row.actions).map((a) => a.r));
  return { hit: d.idx.reduce((a, i) => a + c[i].o, 0) / k, regret: d.idx.reduce((a, i) => a + c[i].r, 0) / k,
    nreg: d.idx.reduce((a, i) => a + (maxR > 0 ? c[i].r / maxR : 0), 0) / k, exact: d.idx.reduce((a, i) => a + (c[i].key === item.ev.representativeKey ? 1 : 0), 0) / k };
}
const summ = (outs) => { const o = outs.filter((x) => x !== null); return { n: o.length, OPTIMAL_SET_HIT: mean(o.map((x) => x.hit)), REGRET: mean(o.map((x) => x.regret)), NORMALIZED_REGRET: mean(o.map((x) => x.nreg)), TOP1_EXACT: mean(o.map((x) => x.exact)) }; };
function compare(outA, outB, idx, label) {
  const use = idx.filter((i) => outA[i] !== null && outB[i] !== null);
  if (use.length === 0) return { n: 0, top1Difference: null, top1Ci95: null, nregDifference: null, nregCi95: null, MATERIAL: false, EMPTY: true };
  const d = use.map((i) => ({ h: outA[i].hit - outB[i].hit, n: outA[i].nreg - outB[i].nreg })); const w = d.map(() => 1); const p = bootstrapPlan(d.length, `STAGE3G4:${label}`);
  const diff = { n: d.length, top1Difference: mean(d.map((x) => x.h)), top1Ci95: bootstrapMean(p, d.map((x) => x.h), w), nregDifference: mean(d.map((x) => x.n)), nregCi95: bootstrapMean(p, d.map((x) => x.n), w) };
  return { ...diff, ...materialGain(diff) };
}
/** Per-resample means of a vector (deterministic plan). */
function resampleMeans(values, label) {
  if (!values.length) return null; const p = bootstrapPlan(values.length, `STAGE3G4:${label}`); const out = new Float64Array(p.resamples);
  for (let r = 0; r < p.resamples; r += 1) { let s = 0; const ix = p.indices.subarray(r * p.n, (r + 1) * p.n); for (let j = 0; j < ix.length; j += 1) s += values[ix[j]]; out[r] = s / ix.length; }
  return out;
}
const ci = (arr) => { const s = [...arr].sort((a, b) => a - b); return [s[Math.floor(0.025 * s.length)], s[Math.min(s.length - 1, Math.ceil(0.975 * s.length) - 1)]]; };
function slope(levelGains, label) {
  const pts = levelGains.filter((g) => g.values.length > 0);
  if (pts.length < 3) return { slope: null, ci95: null, levels: pts.length };
  const fit = (ms) => { const W = pts.reduce((a, p) => a + p.values.length, 0); const xb = pts.reduce((a, p) => a + p.level * p.values.length, 0) / W;
    const yb = ms.reduce((a, m, i) => a + m * pts[i].values.length, 0) / W; let num = 0; let den = 0;
    pts.forEach((p, i) => { num += p.values.length * (p.level - xb) * (ms[i] - yb); den += p.values.length * (p.level - xb) * (p.level - xb); }); return num / den; };
  const point = fit(pts.map((p) => mean(p.values)));
  const rs = pts.map((p) => resampleMeans(p.values, `${label}:L${p.level}`)); const R = rs[0].length; const dist = new Float64Array(R);
  for (let r = 0; r < R; r += 1) dist[r] = fit(rs.map((x) => x[r]));
  return { slope: point, ci95: ci(dist), levels: pts.length, perLevel: Object.fromEntries(pts.map((p) => [`L${p.level}`, { n: p.values.length, gain: mean(p.values) }])) };
}
function unpairedDiff(a, b, label) {
  if (!a.length || !b.length) return { difference: null, ci95: null, MATERIAL: false, nA: a.length, nB: b.length };
  const ra = resampleMeans(a, `${label}:A`); const rb = resampleMeans(b, `${label}:B`); const R = Math.min(ra.length, rb.length); const dist = new Float64Array(R);
  for (let r = 0; r < R; r += 1) dist[r] = ra[r] - rb[r];
  const difference = mean(a) - mean(b); const c = ci(dist);
  return { difference, ci95: c, MATERIAL: Math.abs(difference) >= 0.05 && (c[0] > 0 || c[1] < 0), nA: a.length, nB: b.length };
}

/* ================================================================== open phase */
log('preparing Stage 3G.3 DEV rows and the open fit set');
const corpus = readCorpus();
const DEV = prepare(corpus.filter((r) => r.partition === 'DEV'), 'DEV');
const FIT = prepare(readFitRows(), 'FIT');
const g3Open = readJson(P.STAGE3G3_INHERITANCE.OPEN_REPORT_FILE);
function openPhase() {
  const S = {}; const hashes = {};
  const fitAs = (name, items, spec) => { log(`fit ${name}`); const m = fitLogit(items, spec); S[name] = logitStrategy(m, spec); hashes[name] = modelHash(m); };
  const r = P.PRIMARY_MODELS.reused;
  fitAs('NEW_LINEAR', DEV, r.NEW_LINEAR); fitAs('NEW_INTERACTION', DEV, r.NEW_INTERACTION); fitAs('D_ONE_STEP', DEV, r.D_ONE_STEP.spec);
  for (const k of K) fitAs(DK[k], DEV.filter((it) => partial(it, k)), r[DK[k]].spec);
  fitAs('D_OPTION', DEV, r.D_OPTION.spec);
  fitAs('D_OBS_OPTION', DEV, P.PRIMARY_MODELS.new.D_OBS_OPTION.spec);
  fitAs('D_SEARCH_D1', DEV.filter((it) => partial(it, 2)), P.PRIMARY_MODELS.new.D_SEARCH_D1.spec);
  fitAs('D_SEARCH_D2', DEV.filter((it) => partial(it, 3)), P.PRIMARY_MODELS.new.D_SEARCH_D2.spec);
  fitAs('NEW_LINEAR_LB', FIT, P.SECONDARY_MODELS.NEW_LINEAR_LB.spec);
  fitAs('D_H3_LB', FIT.filter((it) => partial(it, 3)), P.SECONDARY_MODELS.D_H3_LB.spec);
  fitAs('D_OBS_OPTION_LB', FIT, P.SECONDARY_MODELS.D_OBS_OPTION_LB.spec);
  for (const d of [0, 1, 2, 3]) S[`PLANNER_D${d}`] = plannerStrategy(d);
  const reusedBinding = Object.fromEntries(['NEW_LINEAR', 'NEW_INTERACTION', 'D_ONE_STEP', 'D_H2', 'D_H3', 'D_H4', 'D_OPTION'].map((k) => [k, { refit: hashes[k], stage3g3: g3Open.modelHashes[k], REPRODUCED: hashes[k] === g3Open.modelHashes[k] }]));
  const evalOn = (items) => Object.fromEntries(Object.keys(S).map((k) => [k, summ(items.map((it) => outcome(it, decide(S[k], it))))]));
  const fitBalance = {}; for (const it of FIT) { const k = `L${it.level}`; fitBalance[k] = (fitBalance[k] ?? 0) + 1; }
  const report = roundDeep({ schemaVersion: 1, stage: P.PLAN.stage, phase: 'OPEN', planHash: P.PLAN_HASH, numericsProfile: CANONICAL ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE',
    observableOptionSchemaHash: OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH, fitSetContentHash: readJson(P.FIT_MANIFEST_PATH).contentHash,
    eligible: { DEV: DEV.length, FIT: FIT.length }, fitEligibleByLevel: fitBalance, modelHashes: hashes, reusedBinding, ALL_REUSED_REPRODUCED: Object.values(reusedBinding).every((b) => b.REPRODUCED),
    results: { DEV: evalOn(DEV), FIT: evalOn(FIT) }, noSealedRowScored: true });
  return { report, S };
}
const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(P.OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: open.report.reportHash, ALL_REUSED_REPRODUCED: open.report.ALL_REUSED_REPRODUCED, reusedBinding: open.report.reusedBinding,
    eligible: open.report.eligible, fitEligibleByLevel: open.report.fitEligibleByLevel,
    DEV: Object.fromEntries(Object.entries(open.report.results.DEV).map(([k, v]) => [k, v.OPTIMAL_SET_HIT])), FIT: Object.fromEntries(Object.entries(open.report.results.FIT).map(([k, v]) => [k, v.OPTIMAL_SET_HIT])) }, null, 2));
  process.exit(0);
}

/* ================================================================== evaluation rows */
const openStored = readJson(P.OPEN_REPORT_PATH);
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify({ ...open.report, reportHash: hex(JSON.stringify(open.report)) });
let SOURCE; let sealedText = null; let sealedManifest = null;
if (dryRun) {
  const fitRows = readFitRows();
  SOURCE = { A: fitRows.filter((_, i) => i % 2 === 0), B: fitRows.filter((_, i) => i % 2 === 1) };
} else {
  sealedManifest = readJson(P.SEALED_MANIFEST_PATH); sealedText = gunzipSync(readFileSync(at(P.SEALED_PATH))).toString('utf8');
  const sealed = sealedText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  SOURCE = { A: sealed.filter((r) => r.partition === 'STAGE3G4_A'), B: sealed.filter((r) => r.partition === 'STAGE3G4_B') };
}
const EVAL = Object.fromEntries(Object.entries(SOURCE).map(([f, rows]) => { log(`preparing family ${f}`); return [f, prepare(rows, f, { depth3Every: 16 }).map((it) => ({ ...it, family: f }))]; }));
const ITEMS = [...EVAL.A, ...EVAL.B];
const { S } = open;
const MODELS = Object.keys(S);
log('scoring');
const OUT = Object.fromEntries(MODELS.map((k) => [k, ITEMS.map((it) => outcome(it, decide(S[k], it)))]));
const idxWhere = (f) => ITEMS.map((it, i) => (f(it) ? i : -1)).filter((i) => i >= 0);
const LEVEL_SETS = Object.fromEntries([...P.LEVELS.map((l) => [`L${l}`, [l]]), ...Object.entries(P.BANDS), ['ALL', P.LEVELS]]);
const FAMILIES = { A: ['A'], B: ['B'], POOLED: ['A', 'B'] };
const gainValues = (a, b, idx) => idx.filter((i) => OUT[a][i] !== null && OUT[b][i] !== null).map((i) => OUT[a][i].hit - OUT[b][i].hit);

function cellReport(fam, lv, tag) {
  const idx = idxWhere((it) => FAMILIES[fam].includes(it.family) && lv.includes(it.level)); if (!idx.length) return { n: 0 };
  const pk = Object.fromEntries(K.map((k) => [k, idx.filter((i) => partial(ITEMS[i], k))]));
  const d3 = pk[4].filter((i) => OUT.PLANNER_D3[i] !== null);
  const cmp = (a, b, ix, t) => compare(OUT[a], OUT[b], ix, `${tag}:${t}:${a}-${b}`);
  const base = summ(idx.map((i) => OUT.NEW_LINEAR[i]));
  const reduction = Object.fromEntries(K.map((k) => { const a = mean(pk[k].map((i) => OUT.NEW_LINEAR[i].regret)); const b = mean(pk[k].map((i) => OUT[DK[k]][i].regret));
    return [DK[k], { regretNew: a, regretWithFuture: b, absolute: a === null ? null : a - b, relative: a ? (a - b) / a : null }]; }));
  return {
    n: idx.length, partialCounts: Object.fromEntries(K.map((k) => [`k${k}`, pk[k].length])), depth3Rows: d3.length,
    BASELINE_OPTIMAL_SET_HIT: base.OPTIMAL_SET_HIT, NORMALIZED_REGRET: base.NORMALIZED_REGRET, REGRET: base.REGRET,
    ONE_STEP_DELTA: cmp('D_ONE_STEP', 'NEW_LINEAR', idx, 'all'),
    H2_DELTA: cmp('D_H2', 'NEW_LINEAR', pk[2], 'p2'), H3_DELTA: cmp('D_H3', 'NEW_LINEAR', pk[3], 'p3'), H4_DELTA: cmp('D_H4', 'NEW_LINEAR', pk[4], 'p4'),
    TEMPORAL_REGRET_REDUCTION: reduction.D_H3, TEMPORAL_REGRET_REDUCTION_BY_HORIZON: reduction,
    HORIZON_DEPENDENT_RATE: mean(idx.map((i) => (ITEMS[i].row.label.horizonClass === 'HORIZON_DEPENDENT' ? 1 : 0))),
    RETREAT_OPTIMAL_RATE: mean(idx.map((i) => (ITEMS[i].retreatOptimal ? 1 : 0))), MULTIPLE_OPTIMAL_RATE: mean(idx.map((i) => (ITEMS[i].multiOptimal ? 1 : 0))),
    OPTION_DELTA: cmp('D_OPTION', 'NEW_LINEAR', idx, 'all'), OBS_OPTION_DELTA: cmp('D_OBS_OPTION', 'NEW_LINEAR', idx, 'all'),
    TEMPORAL_VS_OBS_OPTION: Object.fromEntries(K.map((k) => [DK[k], cmp(DK[k], 'D_OBS_OPTION', pk[k], `p${k}`)])),
    SEARCH: { D_SEARCH_D1: cmp('D_SEARCH_D1', 'NEW_LINEAR', pk[2], 'p2'), D_SEARCH_D2: cmp('D_SEARCH_D2', 'NEW_LINEAR', pk[3], 'p3'),
      D_H2_vs_D_SEARCH_D1: cmp('D_H2', 'D_SEARCH_D1', pk[2], 'p2'), D_H3_vs_D_SEARCH_D2: cmp('D_H3', 'D_SEARCH_D2', pk[3], 'p3'),
      PLANNER: Object.fromEntries([0, 1, 2].map((d) => [`D${d}`, { all: summ(idx.map((i) => OUT[`PLANNER_D${d}`][i])).OPTIMAL_SET_HIT, partial: d === 0 ? null : summ(pk[d + 1].map((i) => OUT[`PLANNER_D${d}`][i])).OPTIMAL_SET_HIT }])),
      PLANNER_D3_SUBSAMPLE: { rows: d3.length, planner: summ(d3.map((i) => OUT.PLANNER_D3[i])).OPTIMAL_SET_HIT, NEW_LINEAR: summ(d3.map((i) => OUT.NEW_LINEAR[i])).OPTIMAL_SET_HIT, D_H4: summ(d3.map((i) => OUT.D_H4[i])).OPTIMAL_SET_HIT } },
    CAD: Object.fromEntries([1, 2, 3, 4].map((k) => { let tot = 0; let sep = 0; for (const i of idx) { if (k > 1 && !partial(ITEMS[i], k)) continue; const d = decide(S.NEW_LINEAR, ITEMS[i]); const w = 1 - OUT.NEW_LINEAR[i].hit; if (w <= 0) continue;
      const c = ITEMS[i].ev.candidates; const O = c.filter((x) => x.o); const W = d.idx.map((j) => c[j]).filter((x) => !x.o); tot += w; if (Math.min(...O.map((x) => x.T[k - 1])) > Math.max(...W.map((x) => x.T[k - 1]))) sep += w; }
      return [`T${k}`, tot > 0 ? sep / tot : null]; })),
    SECONDARY_LB: { NEW_LINEAR_LB: summ(idx.map((i) => OUT.NEW_LINEAR_LB[i])).OPTIMAL_SET_HIT, D_H3_LB_DELTA: cmp('D_H3_LB', 'NEW_LINEAR_LB', pk[3], 'p3'), D_OBS_OPTION_LB_DELTA: cmp('D_OBS_OPTION_LB', 'NEW_LINEAR_LB', idx, 'all') },
    retreat: (() => { const r = idx.filter((i) => ITEMS[i].retreatOptimal); const rk = Object.fromEntries(K.map((k) => [k, r.filter((i) => partial(ITEMS[i], k))]));
      return { n: r.length, RETREAT_BASELINE: summ(r.map((i) => OUT.NEW_LINEAR[i])).OPTIMAL_SET_HIT,
        RETREAT_H2: summ(rk[2].map((i) => OUT.D_H2[i])).OPTIMAL_SET_HIT, RETREAT_H3: summ(rk[3].map((i) => OUT.D_H3[i])).OPTIMAL_SET_HIT, RETREAT_H4: summ(rk[4].map((i) => OUT.D_H4[i])).OPTIMAL_SET_HIT,
        RETREAT_OPTION_BLOCK: summ(r.map((i) => OUT.D_OPTION[i])).OPTIMAL_SET_HIT, RETREAT_OBS_OPTION_BLOCK: summ(r.map((i) => OUT.D_OBS_OPTION[i])).OPTIMAL_SET_HIT,
        RETREAT_TEMPORAL_DELTA: cmp('D_H3', 'NEW_LINEAR', rk[3], 'rp3'), RETREAT_OPTION_DELTA: cmp('D_OPTION', 'NEW_LINEAR', r, 'rall'), RETREAT_OBS_OPTION_DELTA: cmp('D_OBS_OPTION', 'NEW_LINEAR', r, 'rall') }; })(),
  };
}
log('per-level and band reports');
const cells = Object.fromEntries(Object.keys(FAMILIES).map((fam) => [fam, Object.fromEntries(Object.entries(LEVEL_SETS).map(([name, lv]) => [name, cellReport(fam, lv, `${fam}:${name}`)]))]));

/* ================================================================== scaling, partition, retreat trends */
const levelGains = (a, b, k, fams, extra = () => true) => P.LEVELS.map((l) => ({ level: l, values: gainValues(a, b, idxWhere((it) => fams.includes(it.family) && it.level === l && partial(it, k) && extra(it))) }));
const SLOPE = { H3_POOLED: slope(levelGains('D_H3', 'NEW_LINEAR', 3, ['A', 'B']), 'slope-h3'), H2_POOLED: slope(levelGains('D_H2', 'NEW_LINEAR', 2, ['A', 'B']), 'slope-h2'),
  H4_POOLED: slope(levelGains('D_H4', 'NEW_LINEAR', 4, ['A', 'B']), 'slope-h4'), H3_A: slope(levelGains('D_H3', 'NEW_LINEAR', 3, ['A']), 'slope-h3-A'), H3_B: slope(levelGains('D_H3', 'NEW_LINEAR', 3, ['B']), 'slope-h3-B'),
  H3_LB_POOLED: slope(levelGains('D_H3_LB', 'NEW_LINEAR_LB', 3, ['A', 'B']), 'slope-h3-lb'),
  RETREAT_H3: slope(levelGains('D_H3', 'NEW_LINEAR', 3, ['A', 'B'], (it) => it.retreatOptimal), 'slope-retreat-h3'),
  RETREAT_OPTION: slope(P.LEVELS.map((l) => ({ level: l, values: gainValues('D_OPTION', 'NEW_LINEAR', idxWhere((it) => it.level === l && it.retreatOptimal)) })), 'slope-retreat-option'),
  RETREAT_BASELINE: slope(P.LEVELS.map((l) => ({ level: l, values: idxWhere((it) => it.level === l && it.retreatOptimal).map((i) => OUT.NEW_LINEAR[i].hit) })), 'slope-retreat-base') };
const partitionEffect = (k) => { const g = (fam, lv) => gainValues(DK[k], 'NEW_LINEAR', idxWhere((it) => it.family === fam && lv.includes(it.level) && partial(it, k)));
  return Object.fromEntries(Object.entries(LEVEL_SETS).map(([name, lv]) => [name, unpairedDiff(g('A', lv), g('B', lv), `partition-k${k}-${name}`)])); };
const PARTITION = Object.fromEntries(K.map((k) => [DK[k], partitionEffect(k)]));

/* ================================================================== integrity */
function integrity(items, offset) {
  let pairs = 0; let equal = 0; const pred = { NEW_LINEAR: [0, 0], NEW_INTERACTION: [0, 0], D_OBS_OPTION: [0, 0] }; let order = 0; const orderEq = Object.fromEntries(MODELS.map((k) => [k, 0]));
  items.forEach((item) => {
    order += 1; const rev = { ...item, ev: { ...item.ev, candidates: [...item.ev.candidates].reverse() } };
    for (const k of MODELS) { const a = decide(S[k], item); const b = decide(S[k], rev); if ((a === null && b === null) || (a && b && a.idx.map((i) => item.ev.candidates[i].key).sort().join() === b.idx.map((i) => rev.ev.candidates[i].key).sort().join())) orderEq[k] += 1; }
    if (item.ev.twinNew === null) return;
    for (const tr of TWIN_TRANSFORMS) {
      const tn = item.ev.twinNew[tr]; const told = item.ev.twinFeatures[tr];
      for (const c of item.ev.candidates) { pairs += 1; if (tn[c.key] && JSON.stringify(tn[c.key].GP) === JSON.stringify(c.GP) && told[c.key] && JSON.stringify(told[c.key]) === JSON.stringify(c.dep)) equal += 1; }
      if (item.ev.candidates.some((c) => !tn[c.key] || !told[c.key])) { for (const k of Object.keys(pred)) pred[k][0] += 1; continue; }
      const view = (c) => ({ ...c, blocks: { TYPE: told[c.key].slice(0, 3), CANDIDATE: told[c.key].slice(3, 8), GEOMETRY: told[c.key].slice(8, 11) }, GP: tn[c.key].GP });
      for (const k of Object.keys(pred)) { pred[k][0] += 1; if (topSet(S[k].run(item).scores).join() === topSet(S[k].run(item, view).scores).join()) pred[k][1] += 1; }
    }
  });
  const tw = (f) => { const v = items.filter((i) => i.ev[f] !== null).flatMap((i) => Object.values(i.ev[f])); return v.length ? mean(v) : null; };
  const sample = items.filter((i) => i.ev.twinNew !== null);
  const fc = items.reduce((a, i) => a + i.ev.rolloutFidelity.checked, 0); const fe = items.reduce((a, i) => a + i.ev.rolloutFidelity.equal, 0);
  return { twinRows: sample.length, D4_FEATURE_EQUIVARIANCE: pairs ? equal / pairs : null, D4_PREDICTION_EQUIVARIANCE: Object.fromEntries(Object.entries(pred).map(([k, [n, e]]) => [k, n ? e / n : null])),
    TEMPORAL_D4: tw('twinTemporal'), SEARCH_D4: tw('twinSearch'), OBS_OPTION_D4: tw('twinObsOption'), ID_PERMUTATION_INVARIANCE: mean(sample.map((i) => i.ev.idPermutationNew)),
    CANDIDATE_ORDER_INVARIANCE: Object.fromEntries(MODELS.map((k) => [k, orderEq[k] / order])), ROLLOUT_FIDELITY: fc ? fe / fc : null, rolloutChecks: fc,
    ONE_STEP_FIDELITY: mean(items.map((i) => i.ev.oneStepFidelity)), SEARCH_FIDELITY: mean(items.map((i) => i.ev.searchFidelity)),
    PRIVILEGED_KEY_SCAN_HITS: items.reduce((a, i) => a + i.ev.newScanHits, 0), POISON_PROBE_INVARIANCE: mean(sample.map((i) => i.ev.poisonInvariant)) };
}
log('integrity');
const INTEGRITY = { A: integrity(EVAL.A), B: integrity(EVAL.B) };
const integrityOk = Object.values(INTEGRITY).every((i) => i.D4_FEATURE_EQUIVARIANCE === 1 && Object.values(i.D4_PREDICTION_EQUIVARIANCE).every((v) => v === 1) && i.TEMPORAL_D4 === 1
  && i.SEARCH_D4 === 1 && i.OBS_OPTION_D4 === 1 && i.ID_PERMUTATION_INVARIANCE === 1 && Object.values(i.CANDIDATE_ORDER_INVARIANCE).every((v) => v === 1)
  && i.ROLLOUT_FIDELITY === 1 && i.ONE_STEP_FIDELITY === 1 && i.SEARCH_FIDELITY === 1 && i.PRIVILEGED_KEY_SCAN_HITS === 0 && i.POISON_PROBE_INVARIANCE === 1);

/* ================================================================== conclusions (pre-registered) */
const hk = (fam, band, k) => cells[fam][band][`H${k}_DELTA`]?.MATERIAL === true;
const bandMaterialBoth = (band, k = 3) => hk('A', band, k) && hk('B', band, k);
const pooledBand = (band) => cells.POOLED[band].H3_DELTA?.top1Difference ?? null;
const [gL, gM, gH] = ['LOW', 'MID', 'HIGH'].map(pooledBand);
const sl = SLOPE.H3_POOLED;
const ordered = gL !== null && gM !== null && gH !== null && gL <= gM && gM <= gH;
const scaling = [];
if (sl.ci95 && sl.ci95[0] > 0 && ordered) scaling.push('MONOTONICALLY_INCREASES');
const bandsOrder = ['LOW', 'MID', 'HIGH']; const firstMat = bandsOrder.findIndex((b) => bandMaterialBoth(b));
if (firstMat > 0) scaling.push('HAS_THRESHOLD');
if ((firstMat >= 0 && bandsOrder.slice(firstMat + 1).some((b) => !bandMaterialBoth(b))) || (!ordered && sl.ci95 && sl.ci95[0] <= 0 && sl.ci95[1] >= 0)) scaling.push('IS_NON_MONOTONIC');
if (sl.ci95 && sl.ci95[0] <= 0 && sl.ci95[1] >= 0 && [gL, gM, gH].every((g) => g !== null) && Math.max(gL, gM, gH) - Math.min(gL, gM, gH) <= 0.02) scaling.push('IS_LEVEL_INDEPENDENT');
if (!scaling.length) scaling.push('INSUFFICIENT_EVIDENCE');
const SCALING = P.RULES.SCALING.order.find((s) => scaling.includes(s));
const THRESHOLD = firstMat > 0 ? bandsOrder[firstMat] : firstMat === 0 ? 'LOW (material from the lowest band)' : 'NONE';
const partitionMaterial = (k) => PARTITION[DK[k]].HIGH.MATERIAL || PARTITION[DK[k]].ALL.MATERIAL;
const H1 = scaling.includes('MONOTONICALLY_INCREASES'); const H2 = scaling.includes('HAS_THRESHOLD');
const H3 = (hk('B', 'HIGH', 3) && !hk('A', 'HIGH', 3)) || partitionMaterial(3);
const H4 = (SLOPE.RETREAT_H3.ci95?.[0] ?? 0) > 0 || (SLOPE.RETREAT_OPTION.ci95?.[0] ?? 0) > 0;
const H5 = !bandsOrder.some((b) => bandMaterialBoth(b));
const regretOk = (fam, band, k) => { const c = cells[fam][band]; const rel = c.TEMPORAL_REGRET_REDUCTION_BY_HORIZON[DK[k]].relative; const nc = c[`H${k}_DELTA`]?.nregCi95;
  return rel !== null && rel >= 0.2 && Array.isArray(nc) && nc[1] < 0; };
const transitionK = K.filter((k) => ['MID', 'HIGH'].every((band) => ['A', 'B'].every((fam) => hk(fam, band, k) && cells[fam][band].TEMPORAL_VS_OBS_OPTION[DK[k]].MATERIAL && regretOk(fam, band, k)))
  && !partitionMaterial(k) && integrityOk);
const TRANSITION = transitionK.length > 0;
const materialCells = []; for (const band of ['MID', 'HIGH']) for (const fam of ['A', 'B']) for (const k of K) if (hk(fam, band, k)) materialCells.push({ band, fam, k });
const OBS_SUFFICIENT = materialCells.length === 0 ? 'NOT_TESTABLE' : materialCells.every(({ band, fam, k }) => !cells[fam][band].TEMPORAL_VS_OBS_OPTION[DK[k]].MATERIAL);
const searchCells = materialCells.filter((c) => c.k === 2 || c.k === 3);
const SEARCH_SUFFICIENT = searchCells.length === 0 ? 'NOT_TESTABLE' : searchCells.every(({ band, fam, k }) => !cells[fam][band].SEARCH[k === 2 ? 'D_H2_vs_D_SEARCH_D1' : 'D_H3_vs_D_SEARCH_D2'].MATERIAL);
const WORLD_MODEL = TRANSITION && OBS_SUFFICIENT !== true && SEARCH_SUFFICIENT !== true;
const conclusions = {
  hypotheses: { H1_LEVEL_SCALING: H1, H2_THRESHOLD_EFFECT: H2, H3_PARTITION_ARTIFACT: H3, H4_RETREAT_LEVEL_INTERACTION: H4, H5_NO_STABLE_TEMPORAL_EFFECT: H5 },
  LEVEL_STRATIFICATION_COMPLETE: P.LEVELS.every((l) => ['A', 'B'].every((f) => (cells[f][`L${l}`].n ?? 0) > 0)),
  TEMPORAL_VALUE_LEVEL_SCALING: SCALING, scalingLabels: scaling, TEMPORAL_VALUE_THRESHOLD_MEASURED: true, THRESHOLD,
  TEMPORAL_VALUE_REPLICATED: bandsOrder.some((b) => bandMaterialBoth(b)),
  TEMPORAL_VALUE_MATERIAL_MID_LEVEL: K.some((k) => hk('A', 'MID', k) && hk('B', 'MID', k)), TEMPORAL_VALUE_MATERIAL_HIGH_LEVEL: K.some((k) => hk('A', 'HIGH', k) && hk('B', 'HIGH', k)),
  LEVEL_EFFECT_MEASURED: sl.ci95 !== null, PARTITION_EFFECT_MEASURED: P.LEVELS.every((l) => PARTITION.D_H3[`L${l}`].ci95 !== null),
  PARTITION_CONFOUND_RESOLVED: sl.ci95 !== null && P.LEVELS.every((l) => PARTITION.D_H3[`L${l}`].ci95 !== null),
  PARTITION_EFFECT_MATERIAL: K.some(partitionMaterial), RETREAT_LEVEL_EFFECT_MEASURED: SLOPE.RETREAT_H3.ci95 !== null,
  OBSERVABLE_OPTION_FEATURES_SUFFICIENT: OBS_SUFFICIENT, DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT: SEARCH_SUFFICIENT,
  TRANSITION_PREDICTION_NOW_JUSTIFIED: TRANSITION, transitionK, WORLD_MODEL_WORK_NOW_JUSTIFIED: WORLD_MODEL, READY_FOR_3G_COUNTERFACTUAL_PREDICTION: TRANSITION,
  ORACLE_TEMPORAL_MODELLING_ON_CRITICAL_PATH: TRANSITION, INTEGRITY: integrityOk,
  privilegedLabel: 'D_ONE_STEP, D_H2-D_H4, D_OPTION, D_SEARCH_*, PLANNER_* and every CAD / CR / DDV figure are PRIVILEGED_UPPER_BOUNDS from the simulator; only NEW_LINEAR, NEW_INTERACTION and D_OBS_OPTION read deployable inputs',
};

/* ================================================================== boundary, data, freeze */
const headBlob = (f) => { const g = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return g.status === 0 ? hex(g.stdout) : null; };
const selfHash = (doc, field) => { const { [field]: h, ...body } = doc; return hex(JSON.stringify(body)) === h; };
const glob = (paths) => paths.map((p) => `:(glob)platform/game-agnostic/${p}`);
const inheritance = (() => {
  const f = P.PLAN.inheritance.stage3f; const freeze = readJson(f.FREEZE_FILE); const cert = readJson(f.CERTIFICATE_FILE);
  const g12 = P.PLAN.inheritance.stage3g12; const g3 = P.STAGE3G3_INHERITANCE; const c12 = readJson(g12.CERTIFICATE_FILE); const c3 = readJson(g3.CERTIFICATE_FILE);
  const PROT3F = glob(['artifacts/stage3f*/**', 'docs/STAGE3F*', 'scripts/*stage3f*', 'scripts/reproducibility/**', 'scripts/certification/**', 'src/stage3f/**', 'src/core/**', 'src/forge/**', 'src/forge-symmetric/**', 'tests/*stage3f*']);
  const diff = (base, paths) => git('diff', '--name-only', base, 'HEAD', '--', ...paths).stdout.trim().split('\n').filter(Boolean);
  const ch = { stage3f: diff(f.FREEZE_CERTIFICATION_COMMIT, PROT3F), stage3g12: diff(g12.CERTIFICATION_COMMIT, glob(g12.PROTECTED_PATHS)), stage3g3: diff(g3.CERTIFICATION_COMMIT, glob(g3.PROTECTED_PATHS)) };
  return { STAGE3F_FREEZE_HASH_BOUND: freeze.freezeHash === f.STAGE3F_FREEZE_HASH && selfHash(freeze, 'freezeHash'), STAGE3F_CERTIFICATION_BOUND: cert.certificationHash === f.STAGE3F_CERTIFICATION_HASH && selfHash(cert, 'certificationHash'),
    STAGE3G12_CERTIFICATION_BOUND: c12.certificationHash === g12.CERTIFICATION_HASH && selfHash(c12, 'certificationHash') && c12.status === 'PASS',
    STAGE3G3_CERTIFICATION_BOUND: c3.certificationHash === g3.CERTIFICATION_HASH && selfHash(c3, 'certificationHash') && c3.status === 'PASS',
    STAGE3G3_CONCLUSIONS: c3.conclusions.TRANSITION_PREDICTION_NOW_JUSTIFIED === false && c3.conclusions.WORLD_MODEL_WORK_NOW_JUSTIFIED === false && c3.lifecycleSchemaHash === g3.LIFECYCLE_SCHEMA_HASH,
    PROTECTED_UNCHANGED: Object.values(ch).every((v) => v.length === 0), protectedChanges: ch };
})();
const AMENDMENTS = readdirSync(at(P.OUT)).filter((f) => /^stage3g4-amendment-\d{3}\.json$/.test(f)).sort().map((f) => ({ file: f, ...readJson(`${P.OUT}/${f}`) }));
const freeze = (() => {
  if (dryRun) return { FROZEN_BEFORE_SEALED: false, dryRun: true };
  const g = (f) => `platform/game-agnostic/${f}`;
  const commit = git('log', '--format=%H', '--', g(P.PLAN_PATH)).stdout.trim().split('\n').filter(Boolean).at(-1) ?? null;
  const files = commit ? git('show', '--name-only', '--format=', commit).stdout.trim().split('\n').filter(Boolean) : [];
  const gen = sealedManifest.generatedAtHead ?? null;
  const changed = gen === null ? ['NO_GENERATION_COMMIT'] : git('diff', '--name-only', gen, '--', ...EVALUATION_FILES.map(g)).stdout.trim().split('\n').filter(Boolean);
  const blobAt = (c, f) => { const b = spawnSync('git', ['-C', repo, 'show', `${c}:${g(f)}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return b.status === 0 ? hex(b.stdout) : null; };
  const chainOk = (file) => { const links = AMENDMENTS.flatMap((a) => a.changes.filter((c) => g(c.file) === file));
    if (!links.length || blobAt(gen, links[0].file) !== links[0].beforeSha256) return false;
    for (let i = 1; i < links.length; i += 1) if (links[i].beforeSha256 !== links[i - 1].afterSha256) return false;
    return hex(readFileSync(at(links.at(-1).file))) === links.at(-1).afterSha256; };
  const out = { freezeCommit: commit, planOpenFitInFreezeCommit: [P.PLAN_PATH, P.OPEN_REPORT_PATH, P.FIT_MANIFEST_PATH, P.SPEC_PATH].every((f) => files.includes(g(f))),
    noSealedOrResultInFreezeCommit: !files.some((f) => /stage3g4-level-replication\/(sealed-partitions|stage3g4-certification-result)/.test(f)),
    evaluationFilesAtHead: EVALUATION_FILES.every((f) => headBlob(f) === hex(readFileSync(at(f)))), sealedGeneratedAtHead: gen,
    sealedGeneratedAfterFreeze: gen !== null && commit !== null && git('merge-base', '--is-ancestor', commit, gen).status === 0,
    evaluationFilesUnchangedSinceGeneration: changed.every(chainOk), amendedAfterGeneration: changed.map((f) => f.replace('platform/game-agnostic/', '')) };
  out.FROZEN_BEFORE_SEALED = commit !== null && out.planOpenFitInFreezeCommit && out.noSealedOrResultInFreezeCommit && out.evaluationFilesAtHead && out.sealedGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const data = (() => {
  const fitRows = readFitRows(); const fitM = readJson(P.FIT_MANIFEST_PATH);
  const rows = [...SOURCE.A, ...SOURCE.B];
  const balance = {}; for (const r of rows) { const k = `${r.partition}:L${r.combination.level}:${r.combination.horizonBand}`; balance[k] = (balance[k] ?? 0) + 1; }
  const eligibleByFamilyLevel = Object.fromEntries(['A', 'B'].map((f) => [f, Object.fromEntries(P.LEVELS.map((l) => [`L${l}`, EVAL[f].filter((it) => it.level === l).length]))]));
  if (dryRun) return { dryRun: true, balance, eligibleByFamilyLevel };
  const lineage = priorLineage(); const all = [...lineage.rows, ...fitRows];
  const sets = { record: new Set(all.map((r) => r.recordHash)), world: new Set(all.map((r) => r.worldHash)), topology: new Set(all.map((r) => r.topologyHash)) };
  const eq = rows.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
  const q = P.SEED_PLAN.quotas.sealedPerFamilyLevelBand;
  return { sealedContentHash: hex(sealedText), contentBound: hex(sealedText) === sealedManifest.contentHash, planBound: sealedManifest.planHash === P.PLAN_HASH, seedPlanBound: sealedManifest.seedPlanHash === P.SEED_PLAN_HASH,
    fitContentBound: fitM.contentHash === openStored.fitSetContentHash, seedAudit: seedAudit(lineage.rows), priorRows: lineage.rows.length, fitRows: fitRows.length,
    overlapWithLineageAndFit: Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, rows.filter((r) => s.has(r[`${k}Hash`])).length])),
    internalDuplicates: Object.fromEntries(['record', 'world', 'topology'].map((k) => [k, rows.length - new Set(rows.map((r) => r[`${k}Hash`])).size])),
    LEVEL_BAND_BALANCED: Object.keys(balance).length === 2 * P.LEVELS.length * P.HORIZON_BANDS.length && Object.values(balance).every((v) => v === q), balanceCells: Object.keys(balance).length,
    eligibleByFamilyLevel, SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, mean(eq.map((x) => (x[k] === 1 ? 1 : 0)))])), equivarianceChecks: eq.length,
    benchmarkBound: JSON.stringify(sealedManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark) };
})();
let tests = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 1;
{
  log('running Stage 3G.4 tests');
  const reporter = /--test-reporter(=|\s)/.test(process.env.NODE_OPTIONS ?? '') ? [] : ['--test-reporter=tap'];
  const r = spawnSync(process.execPath, ['--test', ...reporter, 'tests/stage3g4-level-replication.test.js'], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
  testsStatus = r.status ?? 1; const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  tests = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const planFile = readJson(P.PLAN_PATH);
const checks = {
  CANONICAL_NUMERICS: CANONICAL && openStored.numericsProfile === numerics.CANONICAL_NUMERICS_ID,
  INHERITANCE_INTACT: Object.entries(inheritance).filter(([k]) => k !== 'protectedChanges').every(([, v]) => v === true),
  PLAN_BOUND: planFile.planHash === P.PLAN_HASH && openStored.planHash === P.PLAN_HASH, OPEN_PHASE_REPRODUCED,
  STAGE3G3_MODELS_REPRODUCED: openStored.ALL_REUSED_REPRODUCED === true, OBSERVABLE_OPTION_SCHEMA_BOUND: openStored.observableOptionSchemaHash === OBSERVABLE_OPTION_FEATURES_SCHEMA_HASH,
  FROZEN_BEFORE_SEALED: freeze.FROZEN_BEFORE_SEALED,
  SEALED_INTEGRITY: !dryRun && data.contentBound && data.planBound && data.seedPlanBound && data.fitContentBound && data.benchmarkBound && Object.values(data.overlapWithLineageAndFit).every((v) => v === 0)
    && Object.values(data.internalDuplicates).every((v) => v === 0) && data.seedAudit.priorRowOverlap.length === 0 && data.seedAudit.stillReservedTouched.length === 0,
  LEVEL_BAND_BALANCE: !dryRun && data.LEVEL_BAND_BALANCED, SEALED_SYMMETRY_INTACT: !dryRun && data.equivarianceChecks > 0 && Object.values(data.SYMMETRY_CHECKS).every((v) => v === 1),
  EVIDENCE_FIDELITY: ITEMS.every((it) => it.ev.worldFidelity === 1 && it.ev.candidateSetFidelity === 1), DIAGNOSTIC_INTEGRITY: integrityOk,
  AUTHORITY_R0: P.PLAN.authority.tier === 'R0' && !P.PLAN.authority.canDispatch && !P.PLAN.authority.canMutateLiveWorld && !P.PLAN.authority.onlineLearningEnabled && !P.PLAN.authority.promotedToLiveRuntime,
  TESTS_PASS: testsStatus === 0 && tests.fail === 0 && tests.pass > 0,
};
const scientific = (c) => ({ planHash: c.planHash, openPhaseReportHash: c.openPhaseReportHash, numericsProfile: c.numericsProfile, modelHashes: c.modelHashes, cells: c.cells, slope: c.slope, partition: c.partition, conclusions: c.conclusions, data: c.data });
const draft = roundDeep({ planHash: P.PLAN_HASH, openPhaseReportHash: openStored.reportHash, numericsProfile: CANONICAL ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE', modelHashes: openStored.modelHashes,
  cells, slope: SLOPE, partition: PARTITION, conclusions, data });
let amendments = null;
if (AMENDMENTS.length && !dryRun) {
  const first = AMENDMENTS[0].firstRun; const recomputed = hex(JSON.stringify(scientific(draft)));
  if (first.producedCertificate === false) { amendments = { ids: AMENDMENTS.map((a) => a.amendmentId), FIRST_RUN_PRODUCED_NO_RESULT: true, recomputedScientificHash: recomputed }; checks.AMENDMENT_FIRST_RUN_UNOBSERVED = first.scientificOutputObserved === false; }
  else { const fr = readJson(first.file); const { certificationHash: fh, ...fb } = fr; const fsh = hex(JSON.stringify(scientific(fr)));
    amendments = { ids: AMENDMENTS.map((a) => a.amendmentId), FIRST_RUN_CERTIFICATE_INTACT: hex(JSON.stringify(fb)) === fh && fh === first.certificationHash, firstRunScientificHash: fsh, recomputedScientificHash: recomputed, SCIENTIFIC_RESULT_UNCHANGED: fsh === recomputed && fsh === first.scientificHash };
    checks.AMENDMENT_SCIENTIFIC_INVARIANCE = amendments.FIRST_RUN_CERTIFICATE_INTACT && amendments.SCIENTIFIC_RESULT_UNCHANGED; }
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const OWNERS = ['src/stage3g/observable-option-features-v1.js', 'scripts/stage3g4/plan.mjs', 'scripts/stage3g4/evidence.mjs', 'scripts/stage3g4/plan-cli.mjs', 'scripts/stage3g4/generate.mjs', 'scripts/stage3g4/certify.mjs', 'tests/stage3g4-level-replication.test.js', P.SPEC_PATH];
const payload = roundDeep({ schemaVersion: 1, stage: P.PLAN.stage, status, dryRun, ...draft, seedPlanHash: P.SEED_PLAN_HASH, integrity: INTEGRITY, inheritance, freeze, amendments, checks, tests, authority: P.PLAN.authority,
  disclosures: { PRIVILEGED: conclusions.privilegedLabel, PRIMARY_MODELS: 'Stage 3G.3 fitted models reused byte for byte (fitted on levels 0-1 DEV rows); the level-balanced refits are SECONDARY',
    DEPTH3: 'PLANNER_D3 on every 16th eligible row only',
    SEARCH_DEPTH1_EQUALS_H2: 'a depth-1 exhaustive search value equals the H2 truncated oracle return by construction (the greedy continuation already takes the one-step maximum), so D_SEARCH_D1 duplicates D_H2 and the D_H2 vs D_SEARCH_D1 comparison is trivially null; the informative bounded-search controls are DEPTH_2 (every row) and DEPTH_3 (subsample)', ORACLE: 'no Oracle-expert evidence is produced; ORACLE_TEMPORAL_MODELLING_ON_CRITICAL_PATH answers whether temporal modelling is on the critical path' },
  scope: { owners: OWNERS, expertsModified: false, routerModified: false, worldModelTrained: false, retreatRepaired: false, earlierStagesModified: false } });
payload.sourceHashes = Object.fromEntries(OWNERS.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));
if (dryRun) {
  await writeFile(dryOut, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ dryRun: true, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), conclusions }, null, 2));
} else if (checkOnly) {
  const stored = existsSync(at(P.RESULT_PATH)) ? readJson(P.RESULT_PATH) : null;
  const reproduced = stored !== null && stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3G4_CERTIFICATION', reproduced, status, storedHash: stored?.certificationHash ?? null, recomputedHash: payload.certificationHash, tests }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(P.RESULT_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), conclusions }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
