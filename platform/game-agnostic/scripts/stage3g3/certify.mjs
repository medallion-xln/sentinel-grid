#!/usr/bin/env node
/* STAGE_3G_3 — PREDICTION LIFECYCLE and MULTI-STEP RESIDUAL ATTRIBUTION certification.
 *
 *   --phase=open   DEV fits every scorer and diagnostic; CAL selects the MLP width and BEST_CAPACITY; writes the open-phase
 *                  report. No sealed row is read.
 *   (default)      requires the committed open report (recomputed byte for byte) and the sealed partitions, evaluates
 *                  STAGE3G3_HOLDOUT and STAGE3G3_OOD once, and writes the certificate.
 *   --check        recomputes everything and requires a byte-identical certificate. Never writes a tracked file.
 * Run every phase through scripts/reproducibility/run-canonical.mjs (SENTINEL_CANONICAL_NUMERICS_V1).
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
enforceCheckModeReadOnly({ checkOnly });

const numerics = await import('../../src/core/canonical-numerics-v1.js');
const CANONICAL = Math.exp === numerics.exp && Math.log === numerics.log && Math.pow === numerics.pow;
if (!CANONICAL) process.stderr.write('[stage3g3] WARNING: not running under SENTINEL_CANONICAL_NUMERICS_V1; the result cannot certify\n');
const P = await import('./plan.mjs');
const { stage3g3Evidence, isEligible, CONTINUATION_STEPS } = await import('./evidence.mjs');
const { fitMlp, scoreMlp, mlpHash, MLP_GRID } = await import('./scorers.mjs');
const { EVALUATION_FILES, priorLineage, seedAudit } = await import('./generate-sealed.mjs');
const { readCorpus } = await import('../generate-stage3f6p1e-policy-evidence.mjs');
const { STAGE3F6P1ASYM_STATE_FEATURES } = await import('../stage3f6p1asym-analysis-plan.mjs');
const { TWIN_TRANSFORMS } = await import('../stage3f6p1asym-evidence.mjs');
const { ORIENTATIONS, TRANSFORM_EQUIVALENT } = await import('../../src/forge-symmetric/orientation-symmetric-v1.js');
const { bootstrapMean, bootstrapPlan } = await import('../../src/stage3f/policy-requalification-v1.js');
const { ece10, fitCandidateLogit, materialGain, modelHash, scoreCandidates, topSet } = await import('../../src/stage3f/free-action-sufficiency-v1.js');
const { PREDICTION_LIFECYCLE_SCHEMA_HASH } = await import('../../src/stage3g/prediction-lifecycle-v1.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const log = (m) => process.stderr.write(`[stage3g3] ${m}\n`);
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const STATE_IDS = STAGE3F6P1ASYM_STATE_FEATURES.featureIds;
const readGz = (f) => gunzipSync(readFileSync(at(f))).toString('utf8');
const K = [2, 3, 4];

/* ================================================================== items */
function prepare(rows, label) {
  const eligible = rows.filter(isEligible); const out = [];
  eligible.forEach((row, i) => {
    const ev = stage3g3Evidence(row); const c = ev.candidates;
    const optimal = c.filter((x) => x.o === 1);
    const hasRetreat = c.some((x) => x.type === 'RETREAT'); const hasMove = c.some((x) => x.type === 'MOVE');
    const optTypes = [...new Set(optimal.map((x) => x.type))].sort().join('+');
    out.push({ row, ev, state: STATE_IDS.map((id) => row.core[id]), multiOptimal: optimal.length > 1,
      groups: { MOVE_ONLY: hasMove && !hasRetreat, RETREAT_ONLY: hasRetreat && !hasMove, MOVE_PLUS_RETREAT_AVAILABLE: hasMove && hasRetreat,
        RETREAT_OPTIMAL: optimal.some((x) => x.type === 'RETREAT'), RETREAT_SUBOPTIMAL: hasRetreat && !optimal.some((x) => x.type === 'RETREAT'),
        OPTIMAL_TYPES_MOVE_PLUS_RETREAT: optTypes === 'MOVE+RETREAT' } });
    if ((i + 1) % 2000 === 0) log(`${label} ${i + 1}/${eligible.length}`);
  });
  return out;
}
const partial = (item, k) => item.ev.labelHorizon + 1 > k;

/* ================================================================== columns */
const CAND = (c) => [...c.blocks.TYPE, ...c.blocks.CANDIDATE, ...c.blocks.GEOMETRY, ...c.GP];
const pairs = (v) => { const out = []; for (let a = 0; a < v.length; a += 1) for (let b = a + 1; b < v.length; b += 1) out.push(v[a] * v[b]); return out; };
const BLOCK = { TYPE: (c) => c.blocks.TYPE, CANDIDATE: (c) => c.blocks.CANDIDATE, GEOMETRY: (c) => c.blocks.GEOMETRY, GP: (c) => c.GP, PRIV: (c) => c.priv,
  PAIRS: (c) => pairs(CAND(c)), OPTION: (c) => c.option, TEMPORAL: (c) => c.temporal };
const REL = { ONESTEP: 0, H2: 1, H3: 2, H4: 3 };
function columns(item, spec, view = (c) => c) {
  const rel = Object.fromEntries(Object.entries(REL).map(([b, t]) => { const v = item.ev.candidates.map((c) => c.T[t]); return [b, { max: Math.max(...v), mean: mean(v) }]; }));
  return item.ev.candidates.map((c0) => {
    const c = view(c0); const cols = [];
    for (const b of spec.main) { if (REL[b] !== undefined) cols.push(c0.T[REL[b]] - rel[b].max, c0.T[REL[b]] - rel[b].mean); else cols.push(...BLOCK[b](c)); }
    for (const b of spec.interact) for (const v of BLOCK[b](c)) for (const s of item.state) cols.push(v * s);
    return cols;
  });
}
const mlpColumns = (item, view = (c) => c) => item.ev.candidates.map((c0) => [...CAND(view(c0)), ...item.state]);
const groupsOf = (items, cols) => items.map((it) => ({ X: cols(it), y: it.ev.candidates.map((c) => c.o) }));
const fitLogit = (items, spec) => fitCandidateLogit(groupsOf(items, (it) => columns(it, spec)));

/* ================================================================== strategies and outcomes */
const logitStrategy = (m, spec) => ({ kind: 'LOGIT', m, spec, run: (item, view) => scoreCandidates(m, columns(item, spec, view)) });
const mlpStrategy = (m) => ({ kind: 'MLP', m, run: (item, view) => scoreMlp(m, mlpColumns(item, view)) });
function decide(strategy, item) { const { scores, probabilities } = strategy.run(item); return { idx: topSet(scores), probs: probabilities }; }
function outcome(item, d) {
  const c = item.ev.candidates; const k = d.idx.length; const maxR = Math.max(...Object.values(item.row.actions).map((a) => a.r));
  const set = d.idx.reduce((a, i) => a + c[i].o, 0) / k;
  const exact = d.idx.reduce((a, i) => a + (c[i].key === item.ev.representativeKey ? 1 : 0), 0) / k;
  const regret = d.idx.reduce((a, i) => a + c[i].r, 0) / k;
  const nreg = d.idx.reduce((a, i) => a + (maxR > 0 ? c[i].r / maxR : 0), 0) / k;
  const nearTie = d.idx.reduce((a, i) => a + (c[i].o === 0 && maxR > 0 && c[i].r / maxR <= P.MATERIALITY.NEAR_TIE_NREG ? 1 : 0), 0) / k;
  const pOpt = c.reduce((a, x, i) => a + (x.o ? d.probs[i] : 0), 0);
  return { hit: set, exact, regret, nreg, nearTie, catastrophic: d.idx.reduce((a, i) => a + (c[i].r >= 100 ? 1 : 0), 0) / k, pOpt, conf: d.probs[d.idx[0]] };
}
function summarize(outs) {
  const res = outs.reduce((a, o) => a + (1 - o.hit), 0);
  return { n: outs.length, OPTIMAL_SET_HIT: mean(outs.map((o) => o.hit)), TOP1_EXACT: mean(outs.map((o) => o.exact)), REGRET: mean(outs.map((o) => o.regret)),
    NORMALIZED_REGRET: mean(outs.map((o) => o.nreg)), catastrophicRate: mean(outs.map((o) => o.catastrophic)), pOptimalSet: mean(outs.map((o) => o.pOpt)),
    ece: ece10(outs.map((o) => ({ p: o.conf, y: o.hit }))), NEAR_TIE_SHARE_OF_RESIDUAL: res > 0 ? outs.reduce((a, o) => a + o.nearTie, 0) / res : null };
}
function compare(outA, outB, idx, label) {
  const d = idx.map((i) => ({ h: outA[i].hit - outB[i].hit, n: outA[i].nreg - outB[i].nreg })); const w = d.map(() => 1);
  if (d.length === 0) return { n: 0, top1Difference: null, top1Ci95: null, nregDifference: null, nregCi95: null, MATERIAL: false, statisticallyBetter: false, EMPTY: true };
  const p = bootstrapPlan(d.length, `STAGE3G3:${label}`);
  const diff = { n: d.length, top1Difference: mean(d.map((x) => x.h)), top1Ci95: bootstrapMean(p, d.map((x) => x.h), w), nregDifference: mean(d.map((x) => x.n)), nregCi95: bootstrapMean(p, d.map((x) => x.n), w) };
  return { ...diff, ...materialGain(diff) };
}

/* ================================================================== open phase */
log('preparing DEV and CAL evidence');
const corpus = readCorpus();
const DEV = prepare(corpus.filter((r) => r.partition === 'DEV'), 'DEV');
const CAL = prepare(corpus.filter((r) => r.partition === 'CAL'), 'CAL');
function openPhase() {
  const S = {}; const hashes = {};
  log('fit NEW_LINEAR'); const lin = fitLogit(DEV, P.SCORERS.NEW_LINEAR.spec); S.NEW_LINEAR = logitStrategy(lin, P.SCORERS.NEW_LINEAR.spec); hashes.NEW_LINEAR = modelHash(lin);
  log('fit NEW_INTERACTION'); const inter = fitLogit(DEV, P.SCORERS.NEW_INTERACTION.spec); S.NEW_INTERACTION = logitStrategy(inter, P.SCORERS.NEW_INTERACTION.spec); hashes.NEW_INTERACTION = modelHash(inter);
  const mlpCal = {};
  for (const h of MLP_GRID) { log(`fit MLP ${h}`); const m = fitMlp(groupsOf(DEV, (it) => mlpColumns(it)), h); const s = mlpStrategy(m);
    mlpCal[h] = { hash: mlpHash(m), top1: summarize(CAL.map((it) => outcome(it, decide(s, it)))).OPTIMAL_SET_HIT, s }; }
  const width = [...MLP_GRID].sort((a, b) => (Math.abs(mlpCal[b].top1 - mlpCal[a].top1) > 1e-9 ? mlpCal[b].top1 - mlpCal[a].top1 : a - b))[0];
  S.NEW_NONLINEAR = mlpCal[width].s; hashes.NEW_NONLINEAR = mlpCal[width].hash;
  const calTop = (k) => summarize(CAL.map((it) => outcome(it, decide(S[k], it)))).OPTIMAL_SET_HIT;
  const ci = calTop('NEW_INTERACTION'); const cn = calTop('NEW_NONLINEAR');
  const best = cn - ci > 1e-9 ? 'NEW_NONLINEAR' : 'NEW_INTERACTION';
  S.BEST_CAPACITY = S[best];
  for (const [k, d] of Object.entries(P.DIAGNOSTICS)) {
    log(`fit ${k}`); const rows = d.k ? DEV.filter((it) => partial(it, d.k)) : DEV;
    const m = fitLogit(rows, d.spec); S[k] = logitStrategy(m, d.spec); hashes[k] = modelHash(m);
  }
  const replay = modelHash(fitLogit(DEV, P.SCORERS.NEW_LINEAR.spec));
  const evalOn = (items) => Object.fromEntries(Object.keys(S).map((k) => [k, summarize(items.map((it) => outcome(it, decide(S[k], it))))]));
  const report = roundDeep({
    schemaVersion: 1, stage: P.PLAN.stage, phase: 'OPEN', planHash: P.PLAN_HASH, numericsProfile: CANONICAL ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE',
    lifecycleSchemaHash: PREDICTION_LIFECYCLE_SCHEMA_HASH, eligible: { DEV: DEV.length, CAL: CAL.length }, modelHashes: hashes,
    newLinearBinding: { modelHash: hashes.NEW_LINEAR, stage3g12: P.STAGE3G12_INHERITANCE.NEW_MODEL_HASH, REPRODUCED: hashes.NEW_LINEAR === P.STAGE3G12_INHERITANCE.NEW_MODEL_HASH, replayDeterministic: replay === hashes.NEW_LINEAR },
    calSelection: { mlp: Object.fromEntries(Object.entries(mlpCal).map(([h, v]) => [h, { hash: v.hash, calTop1: v.top1 }])), mlpWidth: width,
      capacity: { NEW_INTERACTION: ci, NEW_NONLINEAR: cn }, BEST_CAPACITY: best, rule: P.SCORERS.BEST_CAPACITY },
    partialCounts: { DEV: Object.fromEntries(K.map((k) => [k, DEV.filter((it) => partial(it, k)).length])), CAL: Object.fromEntries(K.map((k) => [k, CAL.filter((it) => partial(it, k)).length])) },
    results: { DEV: evalOn(DEV), CAL: evalOn(CAL) }, noSealedRowScored: true,
  });
  return { report, S, best };
}
const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(P.OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  const r = open.report;
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: r.reportHash, newLinearBinding: r.newLinearBinding, calSelection: r.calSelection, partialCounts: r.partialCounts,
    CAL: Object.fromEntries(Object.entries(r.results.CAL).map(([k, v]) => [k, v.OPTIMAL_SET_HIT])) }, null, 2));
  process.exit(0);
}

/* ================================================================== sealed evaluation */
const openStored = readJson(P.OPEN_REPORT_PATH);
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify({ ...open.report, reportHash: hex(JSON.stringify(open.report)) });
const sealedManifest = readJson(P.SEALED_MANIFEST_PATH);
const sealedText = readGz(P.SEALED_PATH);
const sealed = sealedText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const SOURCE = { STAGE3G3_HOLDOUT: sealed.filter((r) => r.partition === 'STAGE3G3_HOLDOUT'), STAGE3G3_OOD: sealed.filter((r) => r.partition === 'STAGE3G3_OOD') };
const EVAL = Object.fromEntries(Object.entries(SOURCE).map(([k, rows]) => { log(`preparing ${k}`); return [k, prepare(rows, k)]; }));
const { S } = open;
const MODELS = Object.keys(S);
const DIAG = Object.keys(P.DIAGNOSTICS);
const DK = { 2: 'D_H2', 3: 'D_H3', 4: 'D_H4' };

function integrity(items) {
  let pairs = 0; let equal = 0; const pred = Object.fromEntries(['NEW_LINEAR', 'NEW_INTERACTION', 'NEW_NONLINEAR'].map((k) => [k, { twins: 0, equal: 0 }]));
  let order = 0; const orderEqual = Object.fromEntries(MODELS.map((k) => [k, 0]));
  for (const item of items) {
    order += 1;
    const rev = { ...item, ev: { ...item.ev, candidates: [...item.ev.candidates].reverse() } };
    for (const k of MODELS) {
      const a = topSet(S[k].run(item).scores).map((i) => item.ev.candidates[i].key).sort().join(',');
      const b = topSet(S[k].run(rev).scores).map((i) => rev.ev.candidates[i].key).sort().join(',');
      if (a === b) orderEqual[k] += 1;
    }
    if (item.ev.twinNew === null) continue;
    for (const transform of TWIN_TRANSFORMS) {
      const tn = item.ev.twinNew[transform]; const told = item.ev.twinFeatures[transform];
      for (const c of item.ev.candidates) { pairs += 1; if (tn[c.key] && JSON.stringify(tn[c.key].GP) === JSON.stringify(c.GP) && told[c.key] && JSON.stringify(told[c.key]) === JSON.stringify(c.dep)) equal += 1; }
      if (item.ev.candidates.some((c) => !tn[c.key] || !told[c.key])) { for (const k of Object.keys(pred)) pred[k].twins += 1; continue; }
      const view = (c) => ({ ...c, blocks: { TYPE: told[c.key].slice(0, 3), CANDIDATE: told[c.key].slice(3, 8), GEOMETRY: told[c.key].slice(8, 11) }, GP: tn[c.key].GP });
      for (const k of Object.keys(pred)) {
        pred[k].twins += 1;
        if (topSet(S[k].run(item).scores).join(',') === topSet(S[k].run(item, view).scores).join(',')) pred[k].equal += 1;
      }
    }
  }
  const tw = items.filter((i) => i.ev.twinTemporal !== null).flatMap((i) => Object.values(i.ev.twinTemporal));
  const fc = items.reduce((a, i) => a + i.ev.rolloutFidelity.checked, 0); const fe = items.reduce((a, i) => a + i.ev.rolloutFidelity.equal, 0);
  const sample = items.filter((i) => i.ev.twinNew !== null);
  return { twinRows: sample.length, D4_FEATURE_EQUIVARIANCE: pairs ? equal / pairs : null,
    D4_PREDICTION_EQUIVARIANCE: Object.fromEntries(Object.entries(pred).map(([k, v]) => [k, v.twins ? v.equal / v.twins : null])),
    TEMPORAL_D4_EQUIVARIANCE: tw.length ? mean(tw) : null, temporalTwinChecks: tw.length,
    ID_PERMUTATION_INVARIANCE: mean(sample.map((i) => i.ev.idPermutationNew)),
    CANDIDATE_ORDER_INVARIANCE: Object.fromEntries(MODELS.map((k) => [k, orderEqual[k] / order])),
    ROLLOUT_FIDELITY: fc ? fe / fc : null, rolloutFidelityChecks: fc, ONE_STEP_FIDELITY: mean(items.map((i) => i.ev.oneStepFidelity)),
    PRIVILEGED_KEY_SCAN_HITS: items.reduce((a, i) => a + i.ev.newScanHits, 0), POISON_PROBE_INVARIANCE: mean(sample.map((i) => i.ev.poisonInvariant)) };
}
function cad(items, outs, k, onlyPartial) {
  let total = 0; let sep = 0;
  items.forEach((it, i) => {
    if (onlyPartial && !partial(it, k)) return;
    const d = decide(S.NEW_LINEAR, it); const w = 1 - outs[i].hit; if (w <= 0) return;
    const O = it.ev.candidates.filter((c) => c.o === 1); const W = d.idx.map((j) => it.ev.candidates[j]).filter((c) => c.o === 0);
    total += w; if (Math.min(...O.map((c) => c.T[k - 1])) > Math.max(...W.map((c) => c.T[k - 1]))) sep += w;
  });
  return { residualWeight: total, share: total > 0 ? sep / total : null };
}
function resolution(outs, idx) {
  const base = outs.NEW_LINEAR; const res = idx.reduce((a, i) => a + (1 - base[i].hit), 0);
  return Object.fromEntries(MODELS.filter((k) => k !== 'NEW_LINEAR').map((k) => { let r = 0; let b = 0;
    for (const i of idx) { const d = outs[k][i].hit - base[i].hit; if (d > 0) r += d; else b -= d; }
    return [k, { RESOLVED: res > 0 ? r / res : null, BROKEN: res > 0 ? b / res : null, NET: res > 0 ? (r - b) / res : null }]; }));
}

const partitions = {};
for (const [name, items] of Object.entries(EVAL)) {
  log(`evaluating ${name}`);
  const outs = Object.fromEntries(MODELS.map((k) => [k, items.map((it) => outcome(it, decide(S[k], it)))]));
  const all = items.map((_, i) => i);
  const where = (f) => all.filter((i) => f(items[i]));
  const summ = (idx) => Object.fromEntries(MODELS.map((k) => [k, summarize(idx.map((i) => outs[k][i]))]));
  const cmp = (a, b, idx, tag) => compare(outs[a], outs[b], idx, `${name}:${tag}:${a}-vs-${b}`);
  const partialIdx = Object.fromEntries(K.map((k) => [k, where((it) => partial(it, k))]));
  const uniqPartial = Object.fromEntries(K.map((k) => [k, partialIdx[k].filter((i) => !items[i].multiOptimal)]));
  const comparisons = {
    FULL: Object.fromEntries([['BEST_CAPACITY', 'NEW_LINEAR'], ['NEW_INTERACTION', 'NEW_LINEAR'], ['NEW_NONLINEAR', 'NEW_LINEAR'], ...DIAG.map((d) => [d, 'NEW_LINEAR']),
      ['D_OPTION', 'D_ONE_STEP'], ['D_TEMPORAL_FEATURES', 'D_ONE_STEP']].map(([a, b]) => [`${a}_vs_${b}`, cmp(a, b, all, 'FULL')])),
    PARTIAL: Object.fromEntries(K.map((k) => [`k${k}`, {
      n: partialIdx[k].length, labelCompleteShareOfFull: 1 - partialIdx[k].length / items.length,
      [`${DK[k]}_vs_NEW_LINEAR`]: cmp(DK[k], 'NEW_LINEAR', partialIdx[k], `P${k}`), [`${DK[k]}_vs_BEST_CAPACITY`]: cmp(DK[k], 'BEST_CAPACITY', partialIdx[k], `P${k}`),
      [`${DK[k]}_vs_D_OPTION`]: cmp(DK[k], 'D_OPTION', partialIdx[k], `P${k}`), [`${DK[k]}_vs_D_TEMPORAL_FEATURES`]: cmp(DK[k], 'D_TEMPORAL_FEATURES', partialIdx[k], `P${k}`),
      [`${DK[k]}_vs_NEW_LINEAR_UNIQUE_OPTIMAL`]: cmp(DK[k], 'NEW_LINEAR', uniqPartial[k], `U${k}`),
      NEW_LINEAR: summarize(partialIdx[k].map((i) => outs.NEW_LINEAR[i])), [DK[k]]: summarize(partialIdx[k].map((i) => outs[DK[k]][i])),
      BEST_CAPACITY: summarize(partialIdx[k].map((i) => outs.BEST_CAPACITY[i])),
      CR_DIAGNOSTIC: { regretNew: mean(partialIdx[k].map((i) => outs.NEW_LINEAR[i].regret)), regretWithFuture: mean(partialIdx[k].map((i) => outs[DK[k]][i].regret)) },
    }])),
  };
  for (const k of K) { const c = comparisons.PARTIAL[`k${k}`].CR_DIAGNOSTIC; c.absoluteReduction = c.regretNew - c.regretWithFuture; c.relativeReduction = c.regretNew > 0 ? c.absoluteReduction / c.regretNew : null; }
  const retreatGroups = Object.fromEntries(P.PLAN.groups.retreat.map((g) => { const idx = where((it) => it.groups[g]);
    return [g, { n: idx.length, models: idx.length ? Object.fromEntries(['NEW_LINEAR', 'BEST_CAPACITY', 'D_ONE_STEP', ...K.map((k) => DK[k]), 'D_OPTION', 'D_TEMPORAL_FEATURES', 'D_PRIVILEGED_RELATIONS']
        .map((k) => [k, summarize(idx.map((i) => outs[k][i]))])) : null,
      horizonDependentShare: idx.length ? mean(idx.map((i) => (items[i].row.label.horizonClass === 'HORIZON_DEPENDENT' ? 1 : 0))) : null,
      futureOptionCountChosen: idx.length ? mean(idx.map((i) => { const d = decide(S.NEW_LINEAR, items[i]); return mean(d.idx.map((j) => items[i].ev.candidates[j].option[0])); })) : null,
      futureOptionCountOptimal: idx.length ? mean(idx.map((i) => mean(items[i].ev.candidates.filter((c) => c.o).map((c) => c.option[0])))) : null,
      futureHazardExposureChosen: idx.length ? mean(idx.map((i) => { const d = decide(S.NEW_LINEAR, items[i]); return mean(d.idx.map((j) => items[i].ev.candidates[j].temporal[1])); })) : null,
      futureHazardExposureOptimal: idx.length ? mean(idx.map((i) => mean(items[i].ev.candidates.filter((c) => c.o).map((c) => c.temporal[1])))) : null }]; }));
  const ro = where((it) => it.groups.RETREAT_OPTIMAL);
  const retreatComparisons = { BEST_CAPACITY: cmp('BEST_CAPACITY', 'NEW_LINEAR', ro, 'RO'), D_OPTION: cmp('D_OPTION', 'NEW_LINEAR', ro, 'RO'), D_PRIVILEGED_RELATIONS: cmp('D_PRIVILEGED_RELATIONS', 'NEW_LINEAR', ro, 'RO'),
    ...Object.fromEntries(K.map((k) => [DK[k], cmp(DK[k], 'NEW_LINEAR', ro.filter((i) => partial(items[i], k)), `RO${k}`)])),
    nearTieShareOfResidual: summarize(ro.map((i) => outs.NEW_LINEAR[i])).NEAR_TIE_SHARE_OF_RESIDUAL };
  const strata = Object.fromEntries(['H0', 'H1', 'H2', 'H3', 'H4'].map((h) => { const idx = where((it) => it.ev.stratum === h);
    return [h, { n: idx.length, share: idx.length / items.length, models: idx.length ? Object.fromEntries(['NEW_LINEAR', 'BEST_CAPACITY', 'D_ONE_STEP', ...K.map((k) => DK[k]), 'D_OPTION', 'D_TEMPORAL_FEATURES']
      .map((k) => [k, summarize(idx.map((i) => outs[k][i])).OPTIMAL_SET_HIT])) : null,
      residualShare: (() => { const t = all.reduce((a, i) => a + (1 - outs.NEW_LINEAR[i].hit), 0); return t > 0 ? idx.reduce((a, i) => a + (1 - outs.NEW_LINEAR[i].hit), 0) / t : null; })() }]; }));
  const labelHorizon = Object.fromEntries([1, 3, 5, 8].map((h) => { const idx = where((it) => it.ev.labelHorizon === h); return [`h${h}`, { n: idx.length, NEW_LINEAR: idx.length ? summarize(idx.map((i) => outs.NEW_LINEAR[i])).OPTIMAL_SET_HIT : null }]; }));
  const multi = where((it) => it.multiOptimal); const uniq = where((it) => !it.multiOptimal);
  const orient = Object.fromEntries(ORIENTATIONS.map((o) => { const idx = where((it) => it.row.orientation === o); return [o, { n: idx.length, NEW_LINEAR: mean(idx.map((i) => outs.NEW_LINEAR[i].hit)), BEST_CAPACITY: mean(idx.map((i) => outs.BEST_CAPACITY[i].hit)) }]; }));
  partitions[name] = {
    rows: SOURCE[name].length, eligible: items.length, strategies: summ(all), comparisons,
    baselineResidual: { NEW_LINEAR_OPTIMAL_SET_HIT: summarize(outs.NEW_LINEAR).OPTIMAL_SET_HIT, HORIZON_DEPENDENT_RATE: mean(items.map((it) => (it.row.label.horizonClass === 'HORIZON_DEPENDENT' ? 1 : 0))),
      MULTI_OPTIMAL_RATE: multi.length / items.length, RETREAT_OPTIMAL_RATE: ro.length / items.length, RETREAT_AVAILABLE_RATE: where((it) => it.groups.MOVE_PLUS_RETREAT_AVAILABLE).length / items.length },
    multipleOptimal: { MULTI_OPTIMAL_RATE: multi.length / items.length, MULTIPLE_OPTIMAL: summ(multi).NEW_LINEAR, UNIQUE_OPTIMAL: summ(uniq).NEW_LINEAR, ALL: summ(all).NEW_LINEAR,
      SET_MINUS_EXACT_ALL: summ(all).NEW_LINEAR.OPTIMAL_SET_HIT - summ(all).NEW_LINEAR.TOP1_EXACT, SET_MINUS_EXACT_MULTI: multi.length ? summ(multi).NEW_LINEAR.OPTIMAL_SET_HIT - summ(multi).NEW_LINEAR.TOP1_EXACT : null },
    retreat: { groups: retreatGroups, comparisons: retreatComparisons }, strata, labelHorizon,
    decisionEvaluation: { CAD_DIAGNOSTIC: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [`T${k}`, { all: cad(items, outs.NEW_LINEAR, k, false), partial: k >= 2 && k <= 4 ? cad(items, outs.NEW_LINEAR, k, true) : null }])),
      label: 'PRIVILEGED_UPPER_BOUND: every temporal quantity is read from the simulator; nothing here is deployable' },
    residualAttribution: { ALL: resolution(outs, all), HORIZON_DEPENDENT: resolution(outs, where((it) => it.row.label.horizonClass === 'HORIZON_DEPENDENT')), RETREAT_OPTIMAL: resolution(outs, ro), MULTIPLE_OPTIMAL: resolution(outs, multi) },
    orientation: orient, integrity: integrity(items),
  };
}

/* ================================================================== conclusions (pre-registered) */
const H = partitions.STAGE3G3_HOLDOUT; const O = partitions.STAGE3G3_OOD;
const mat = (p, path) => path.reduce((a, k) => a?.[k], p)?.MATERIAL === true;
const kMaterial = (p, k) => { const c = p.comparisons.PARTIAL[`k${k}`];
  return c[`${DK[k]}_vs_NEW_LINEAR`].MATERIAL && c[`${DK[k]}_vs_BEST_CAPACITY`].MATERIAL && (c[`${DK[k]}_vs_NEW_LINEAR_UNIQUE_OPTIMAL`].top1Ci95?.[0] ?? 0) > 0; };
const temporalK = K.filter((k) => kMaterial(H, k) && kMaterial(O, k));
const H1 = temporalK.length > 0;
const H1_OOD_STABLE = K.filter((k) => kMaterial(H, k)).some((k) => kMaterial(O, k));
const H2 = mat(H, ['comparisons', 'FULL', 'BEST_CAPACITY_vs_NEW_LINEAR']) && mat(O, ['comparisons', 'FULL', 'BEST_CAPACITY_vs_NEW_LINEAR']);
const H3 = mat(H, ['comparisons', 'FULL', 'D_OPTION_vs_NEW_LINEAR']) && mat(O, ['comparisons', 'FULL', 'D_OPTION_vs_NEW_LINEAR']);
const retreatClasses = (() => {
  const both = (f) => f(H) && f(O);
  const out = [];
  if (both((p) => p.retreat.comparisons.BEST_CAPACITY.MATERIAL)) out.push('RANKING_LIMITED');
  if (K.some((k) => both((p) => p.retreat.comparisons[DK[k]].MATERIAL))) out.push('TEMPORAL_LIMITED');
  if (both((p) => p.retreat.comparisons.D_OPTION.MATERIAL)) out.push('OPTION_PRESERVATION_LIMITED');
  if (both((p) => p.retreat.comparisons.D_PRIVILEGED_RELATIONS.MATERIAL)) out.push('ACTION_SEMANTICS_LIMITED');
  if (both((p) => (p.retreat.comparisons.nearTieShareOfResidual ?? 0) >= P.MATERIALITY.LABEL_STRUCTURE_SHARE)) out.push('LABEL_STRUCTURE_LIMITED');
  return out;
})();
const RETREAT_CLASSIFICATION = retreatClasses.length === 0 ? 'UNRESOLVED' : retreatClasses.length === 1 ? retreatClasses[0] : 'MIXED';
const H4 = retreatClasses.includes('ACTION_SEMANTICS_LIMITED') || retreatClasses.includes('RANKING_LIMITED');
const H5 = [H, O].every((p) => p.multipleOptimal.SET_MINUS_EXACT_ALL >= P.MATERIALITY.MATERIAL_TOP1_GAIN);
const supported = { H1_MULTI_STEP_TEMPORAL: H1, H2_RANKING_OR_UTILITY: H2, H3_OPTION_PRESERVATION: H3, H4_RETREAT_SPECIFIC: H4, H5_MULTIPLE_OPTIMAL_LABEL_STRUCTURE: H5 };
const H6 = Object.values(supported).filter(Boolean).length >= 2;
const TRANSITION = H1;
const WORLD_MODEL = TRANSITION && temporalK.some((k) => [H, O].every((p) => p.comparisons.PARTIAL[`k${k}`][`${DK[k]}_vs_D_OPTION`].MATERIAL && p.comparisons.PARTIAL[`k${k}`][`${DK[k]}_vs_D_TEMPORAL_FEATURES`].MATERIAL));
const integrityOk = [H, O].every((p) => { const i = p.integrity; return i.D4_FEATURE_EQUIVARIANCE === 1 && Object.values(i.D4_PREDICTION_EQUIVARIANCE).every((v) => v === 1)
  && i.TEMPORAL_D4_EQUIVARIANCE === 1 && i.ID_PERMUTATION_INVARIANCE === 1 && Object.values(i.CANDIDATE_ORDER_INVARIANCE).every((v) => v === 1)
  && i.ROLLOUT_FIDELITY === 1 && i.ONE_STEP_FIDELITY === 1 && i.PRIVILEGED_KEY_SCAN_HITS === 0 && i.POISON_PROBE_INVARIANCE === 1; });
const conclusions = {
  hypotheses: { ...supported, H6_MIXED: H6 }, temporalMaterialK: temporalK,
  MULTI_STEP_TEMPORAL_VALUE_MEASURED: true, MULTI_STEP_TEMPORAL_VALUE_MATERIAL: H1, MULTI_STEP_TEMPORAL_VALUE_OOD_STABLE: H1_OOD_STABLE,
  RANKING_CAPACITY_LIMITATION_MEASURED: true, RANKING_CAPACITY_LIMITATION_MATERIAL: H2, OPTION_PRESERVATION_VALUE_MEASURED: true, OPTION_PRESERVATION_VALUE_MATERIAL: H3,
  RETREAT_RESIDUAL_CLASSIFIED: true, RETREAT_CLASSIFICATION, retreatClasses, MULTIPLE_OPTIMAL_EFFECT_MATERIAL: H5,
  TRANSITION_PREDICTION_NOW_JUSTIFIED: TRANSITION, WORLD_MODEL_WORK_NOW_JUSTIFIED: WORLD_MODEL, READY_FOR_3G_COUNTERFACTUAL_PREDICTION: TRANSITION, INTEGRITY: integrityOk,
  privilegedLabel: 'every D_* diagnostic is a PRIVILEGED_UPPER_BOUND computed from simulator futures; none is deployable',
};

/* ================================================================== boundary, data, freeze */
const headBlob = (f) => { const g = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return g.status === 0 ? hex(g.stdout) : null; };
const selfHash = (doc, field) => { const { [field]: h, ...body } = doc; return hex(JSON.stringify(body)) === h; };
const glob = (paths) => paths.map((p) => `:(glob)platform/game-agnostic/${p}`);
const inheritance = (() => {
  const f = P.STAGE3F_INHERITANCE; const freeze = readJson(f.FREEZE_FILE); const cert = readJson(f.CERTIFICATE_FILE);
  const PROTECTED3F = glob(['artifacts/stage3f*/**', 'docs/STAGE3F*', 'scripts/*stage3f*', 'scripts/reproducibility/**', 'scripts/certification/**', 'src/stage3f/**', 'src/core/**', 'src/forge/**', 'src/forge-symmetric/**', 'tests/*stage3f*']);
  const g = P.STAGE3G12_INHERITANCE; const g12 = readJson(g.CERTIFICATE_FILE);
  const changed3f = git('diff', '--name-only', f.FREEZE_CERTIFICATION_COMMIT, 'HEAD', '--', ...PROTECTED3F).stdout.trim().split('\n').filter(Boolean);
  const changed3g = git('diff', '--name-only', g.CERTIFICATION_COMMIT, 'HEAD', '--', ...glob(g.PROTECTED_PATHS)).stdout.trim().split('\n').filter(Boolean);
  return {
    STAGE3F_FREEZE_HASH_BOUND: freeze.freezeHash === f.STAGE3F_FREEZE_HASH && selfHash(freeze, 'freezeHash'),
    STAGE3F_CERTIFICATION_HASH_BOUND: cert.certificationHash === f.STAGE3F_CERTIFICATION_HASH && selfHash(cert, 'certificationHash') && cert.status === 'PASS',
    STAGE3F_FACTS_UNCHANGED: JSON.stringify(freeze.sections.immutableFacts.values) === JSON.stringify(f.FACTS) && hex(JSON.stringify(freeze.sections.immutableFacts)) === f.IMMUTABLE_FACTS_HASH,
    STAGE3F_PROTECTED_UNCHANGED: changed3f.length === 0,
    STAGE3G12_CERTIFICATION_BOUND: g12.certificationHash === g.CERTIFICATION_HASH && selfHash(g12, 'certificationHash') && g12.status === 'PASS',
    STAGE3G12_CONCLUSIONS: g12.representation.REPRESENTATION_GAP_CLOSED === true && g12.representation.TRANSITION_PREDICTION_NOW_JUSTIFIED === false,
    STAGE3G12_PROTECTED_UNCHANGED: changed3g.length === 0,
    COMMITS_ANCESTORS: [f.FREEZE_CERTIFICATION_COMMIT, g.FREEZE_COMMIT, g.CERTIFICATION_COMMIT].every((c) => git('merge-base', '--is-ancestor', c, 'HEAD').status === 0),
    protectedChanges: { stage3f: changed3f, stage3g12: changed3g },
  };
})();
const AMENDMENTS = readdirSync(at(P.OUT)).filter((f) => /^stage3g3-amendment-\d{3}\.json$/.test(f)).sort().map((f) => ({ file: f, ...readJson(`${P.OUT}/${f}`) }));
const freeze = (() => {
  const g = (f) => `platform/game-agnostic/${f}`;
  const commit = git('log', '--format=%H', '--', g(P.PLAN_PATH)).stdout.trim().split('\n').filter(Boolean).at(-1) ?? null;
  const files = commit ? git('show', '--name-only', '--format=', commit).stdout.trim().split('\n').filter(Boolean) : [];
  const gen = sealedManifest.generatedAtHead ?? null;
  const changed = gen === null ? ['NO_GENERATION_COMMIT'] : git('diff', '--name-only', gen, '--', ...EVALUATION_FILES.map(g)).stdout.trim().split('\n').filter(Boolean);
  const blobAt = (c, f) => { const b = spawnSync('git', ['-C', repo, 'show', `${c}:${g(f)}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return b.status === 0 ? hex(b.stdout) : null; };
  /* a changed evaluation file is accepted only along the declared amendment chain: generation bytes -> ... -> current bytes */
  const chainOk = (file) => { const links = AMENDMENTS.flatMap((a) => a.changes.filter((c) => g(c.file) === file));
    if (!links.length || blobAt(gen, links[0].file) !== links[0].beforeSha256) return false;
    for (let i = 1; i < links.length; i += 1) if (links[i].beforeSha256 !== links[i - 1].afterSha256) return false;
    return hex(readFileSync(at(links.at(-1).file))) === links.at(-1).afterSha256; };
  const out = { freezeCommit: commit, planAndOpenReportInFreezeCommit: files.includes(g(P.PLAN_PATH)) && files.includes(g(P.OPEN_REPORT_PATH)),
    noSealedOrResultInFreezeCommit: !files.some((f) => /stage3g3-temporal-attribution\/(sealed-partitions|stage3g3-certification-result)/.test(f)),
    evaluationFilesAtHead: EVALUATION_FILES.every((f) => headBlob(f) === hex(readFileSync(at(f)))), sealedGeneratedAtHead: gen,
    sealedGeneratedAfterFreeze: gen !== null && commit !== null && git('merge-base', '--is-ancestor', commit, gen).status === 0,
    evaluationFilesUnchangedSinceGeneration: changed.every(chainOk), amendedAfterGeneration: changed.map((f) => f.replace('platform/game-agnostic/', '')) };
  out.FROZEN_BEFORE_SEALED = commit !== null && out.planAndOpenReportInFreezeCommit && out.noSealedOrResultInFreezeCommit && out.evaluationFilesAtHead && out.sealedGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const lineage = priorLineage();
const sets = { record: new Set(lineage.rows.map((r) => r.recordHash)), world: new Set(lineage.rows.map((r) => r.worldHash)), topology: new Set(lineage.rows.map((r) => r.topologyHash)) };
const eq = sealed.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const data = {
  sealedContentHash: hex(sealedText), contentBound: hex(sealedText) === sealedManifest.contentHash, planBound: sealedManifest.planHash === P.PLAN_HASH, seedPlanBound: sealedManifest.seedPlanHash === P.SEED_PLAN_HASH,
  seedAudit: seedAudit(lineage.rows), priorLineage: lineage.sources, priorRows: lineage.rows.length,
  counts: Object.fromEntries(Object.entries(SOURCE).map(([k, v]) => [k, v.length])), levels: Object.fromEntries(Object.entries(SOURCE).map(([k, v]) => [k, [...new Set(v.map((r) => r.combination.level))].sort()])),
  overlapWithLineage: Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, sealed.filter((r) => s.has(r[`${k}Hash`])).length])),
  internalDuplicates: Object.fromEntries(['record', 'world', 'topology'].map((k) => [k, sealed.length - new Set(sealed.map((r) => r[`${k}Hash`])).size])),
  SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, mean(eq.map((x) => (x[k] === 1 ? 1 : 0)))])), equivarianceChecks: eq.length,
  benchmarkBound: JSON.stringify(sealedManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
};
const lifecycleSource = readFileSync(at('src/stage3g/prediction-lifecycle-v1.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const staticAudit = {
  LIFECYCLE_NO_WALL_CLOCK: !/Date\.|performance\.now|process\.hrtime|Math\.random/.test(lifecycleSource),
  LIFECYCLE_NO_SIMULATOR: ![...lifecycleSource.matchAll(/from '([^']+)'/g)].some((m) => /forge|counterfactual|oracle|stage3g3/.test(m[1])),
  RUNTIME_CONTRACTS_DO_NOT_IMPORT_ROLLOUTS: ['src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js', 'src/stage3g/prediction-lifecycle-v1.js']
    .every((f) => !/stage3g3|counterfactual|reward-v2/.test(readFileSync(at(f), 'utf8'))),
  FITS_ON_DEV_ONLY: [...readFileSync(at('scripts/stage3g3/certify.mjs'), 'utf8').matchAll(/fit(?:Logit|Mlp)\(([A-Za-z]+)/g)].every((m) => ['DEV', 'rows', 'groupsOf'].includes(m[1])),
};
let tests = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 1;
{
  log('running Stage 3G.3 tests');
  const reporter = /--test-reporter(=|\s)/.test(process.env.NODE_OPTIONS ?? '') ? [] : ['--test-reporter=tap'];
  const r = spawnSync(process.execPath, ['--test', ...reporter, 'tests/stage3g3-prediction-lifecycle.test.js', 'tests/stage3g3-temporal-attribution.test.js'], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
  testsStatus = r.status ?? 1; const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  tests = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const planFile = readJson(P.PLAN_PATH);
const checks = {
  CANONICAL_NUMERICS: CANONICAL && openStored.numericsProfile === numerics.CANONICAL_NUMERICS_ID,
  INHERITANCE_INTACT: Object.entries(inheritance).filter(([k]) => k !== 'protectedChanges').every(([, v]) => v === true),
  PLAN_BOUND: planFile.planHash === P.PLAN_HASH && openStored.planHash === P.PLAN_HASH,
  LIFECYCLE_SCHEMA_BOUND: planFile.plan.lifecycle.hash === PREDICTION_LIFECYCLE_SCHEMA_HASH && openStored.lifecycleSchemaHash === PREDICTION_LIFECYCLE_SCHEMA_HASH,
  OPEN_PHASE_REPRODUCED, NEW_LINEAR_REPRODUCES_STAGE3G12: openStored.newLinearBinding.REPRODUCED === true && openStored.newLinearBinding.replayDeterministic === true,
  FROZEN_BEFORE_SEALED: freeze.FROZEN_BEFORE_SEALED,
  SEALED_INTEGRITY: data.contentBound && data.planBound && data.seedPlanBound && data.benchmarkBound && Object.values(data.overlapWithLineage).every((v) => v === 0)
    && Object.values(data.internalDuplicates).every((v) => v === 0) && data.seedAudit.priorSeedOverlap.length === 0 && data.seedAudit.priorRowOverlap.length === 0
    && data.seedAudit.partitionOverlap.length === 0 && data.counts.STAGE3G3_HOLDOUT === P.SEED_PLAN.sizes.HOLDOUT && data.counts.STAGE3G3_OOD === P.SEED_PLAN.sizes.OOD,
  SEALED_SYMMETRY_INTACT: data.equivarianceChecks > 0 && Object.values(data.SYMMETRY_CHECKS).every((v) => v === 1),
  EVIDENCE_FIDELITY: Object.values(EVAL).every((items) => items.every((it) => it.ev.worldFidelity === 1 && it.ev.candidateSetFidelity === 1)),
  DIAGNOSTIC_INTEGRITY: integrityOk, STATIC_AUDIT: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: P.PLAN.authority.tier === 'R0' && !P.PLAN.authority.canDispatch && !P.PLAN.authority.canMutateLiveWorld && !P.PLAN.authority.onlineLearningEnabled && !P.PLAN.authority.promotedToLiveRuntime,
  TESTS_PASS: testsStatus === 0 && tests.fail === 0 && tests.pass > 0,
};
const scientific = (c) => ({ planHash: c.planHash, openPhaseReportHash: c.openPhaseReportHash, numericsProfile: c.numericsProfile, lifecycleSchemaHash: c.lifecycleSchemaHash,
  modelHashes: c.modelHashes, calSelection: c.calSelection, partitions: c.partitions, conclusions: c.conclusions, data: c.data });
const draft = roundDeep({ planHash: P.PLAN_HASH, openPhaseReportHash: openStored.reportHash, numericsProfile: CANONICAL ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE',
  lifecycleSchemaHash: PREDICTION_LIFECYCLE_SCHEMA_HASH, modelHashes: openStored.modelHashes, calSelection: openStored.calSelection, partitions, conclusions, data });
let amendments = null;
if (AMENDMENTS.length) {
  const firstRun = readJson(AMENDMENTS[0].firstRun.file); const { certificationHash: fh, ...fb } = firstRun;
  const recomputed = hex(JSON.stringify(scientific(draft)));
  amendments = { ids: AMENDMENTS.map((a) => a.amendmentId), files: Object.fromEntries(AMENDMENTS.map((a) => [a.file, hex(readFileSync(at(`${P.OUT}/${a.file}`)))])),
    FIRST_RUN_CERTIFICATE_INTACT: hex(JSON.stringify(fb)) === fh && fh === AMENDMENTS[0].firstRun.certificationHash,
    firstRunScientificHash: hex(JSON.stringify(scientific(firstRun))), recomputedScientificHash: recomputed,
    SCIENTIFIC_RESULT_UNCHANGED: recomputed === hex(JSON.stringify(scientific(firstRun))) && recomputed === AMENDMENTS[0].firstRun.scientificHash };
  checks.AMENDMENT_SCIENTIFIC_INVARIANCE = amendments.FIRST_RUN_CERTIFICATE_INTACT && amendments.SCIENTIFIC_RESULT_UNCHANGED;
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const OWNERS = ['src/stage3g/prediction-lifecycle-v1.js', 'scripts/stage3g3/plan.mjs', 'scripts/stage3g3/evidence.mjs', 'scripts/stage3g3/scorers.mjs', 'scripts/stage3g3/plan-cli.mjs',
  'scripts/stage3g3/generate-sealed.mjs', 'scripts/stage3g3/certify.mjs', 'tests/stage3g3-prediction-lifecycle.test.js', 'tests/stage3g3-temporal-attribution.test.js'];
const payload = roundDeep({
  schemaVersion: 1, stage: P.PLAN.stage, status, ...draft, seedPlanHash: P.SEED_PLAN_HASH, inheritance, freeze, staticAudit, amendments, checks, tests, authority: P.PLAN.authority,
  disclosures: {
    LABEL_LEAK_GUARD: P.HORIZONS.labelLeakGuard, PRIVILEGED: conclusions.privilegedLabel,
    SCRIPT_LOCATION: 'Stage 3G.3 scripts live under scripts/stage3g3/ because the frozen Stage 3G.1/3G.2 test suite enumerates the top-level stage3g scripts exactly; each Stage 3G.3 CLI installs the check-mode guard',
    NO_SECONDARY_REPLICATION: 'evaluated on the Stage 3G.3 sealed partitions only',
    LEVEL_COVERAGE: 'canonical admission order: STAGE3G3_HOLDOUT covers the low curriculum levels listed in data.levels',
  },
  scope: { owners: OWNERS, expertsModified: false, routerModified: false, nexusModified: false, stage3fModified: false, stage3g12Modified: false, worldModelTrained: false, retreatRepaired: false, counterfactualPredictionStarted: false },
});
payload.sourceHashes = Object.fromEntries(OWNERS.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));
if (checkOnly) {
  const stored = existsSync(at(P.RESULT_PATH)) ? readJson(P.RESULT_PATH) : null;
  const reproduced = stored !== null && stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3G3_CERTIFICATION', reproduced, status, storedHash: stored?.certificationHash ?? null, recomputedHash: payload.certificationHash, tests }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(P.RESULT_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), conclusions }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
