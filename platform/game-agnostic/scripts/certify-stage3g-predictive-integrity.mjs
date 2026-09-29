#!/usr/bin/env node
/* STAGE_3G_1/3G_2 — EPISTEMIC INTEGRITY + CANONICAL OBSERVABLE ENTITY / SPATIAL STATE certification.
 *
 *   --phase=open   DEV fits every model, CAL selects the NEW variant; writes the open-phase report. No sealed row is read.
 *   (default)      requires the committed open report (recomputed byte for byte) and the sealed partitions, evaluates
 *                  STAGE3G_HOLDOUT / STAGE3G_OOD (primary) and the P.1A-SYM fresh partitions (secondary replication and
 *                  OLD binding), and writes the certificate.
 *   --check        recomputes everything and requires a byte-identical certificate. Never writes a tracked file.
 *
 * Also binds the frozen Stage 3F boundary (hashes, facts, commits, no Stage 3F file changed) and the three Stage 3G
 * schema hashes, and runs the Stage 3G tests.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enforceCheckModeReadOnly } from './certification/check-mode-guard.mjs';

const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
enforceCheckModeReadOnly({ checkOnly });

const { PLAN, PLAN_HASH, PLAN_PATH, OPEN_REPORT_PATH, SEALED_PATH, SEALED_MANIFEST_PATH, RESULT_PATH, OLD_SPEC, NEW_SPECS, OLD_REFERENCE_SPECS,
  NEW_DIAGNOSTICS, OLD_BINDING, STAGE3F_INHERITANCE, SEED_PLAN, SEED_PLAN_HASH, THRESHOLDS } = await import('./stage3g/plan.mjs');
const { EVALUATION_FILES, stage3fLineage, seedAudit } = await import('./generate-stage3g-sealed.mjs');
const { stage3gEvidence, isEligible } = await import('./stage3g/evidence.mjs');
const { readCorpus } = await import('./generate-stage3f6p1e-policy-evidence.mjs');
const { STAGE3F6P1ASYM_STATE_FEATURES } = await import('./stage3f6p1asym-analysis-plan.mjs');
const { FRESH_PATH: P1ASYM_FRESH_PATH, FRESH_MANIFEST_PATH: P1ASYM_FRESH_MANIFEST } = await import('./generate-stage3f6p1asym-confirmatory.mjs');
const { TWIN_TRANSFORMS } = await import('./stage3f6p1asym-evidence.mjs');
const { ORIENTATIONS, TRANSFORM_EQUIVALENT, orientDirection } = await import('../src/forge-symmetric/orientation-symmetric-v1.js');
const { bootstrapMean, bootstrapPlan } = await import('../src/stage3f/policy-requalification-v1.js');
const { directionOneHot, ece10, fitCandidateLogit, materialGain, modelHash, outcomeOf, scoreCandidates, topSet } = await import('../src/stage3f/free-action-sufficiency-v1.js');
const { EPISTEMIC_SCHEMA_HASH } = await import('../src/stage3g/epistemic-provenance-v1.js');
const numerics = await import('../src/core/canonical-numerics-v1.js');
/* The frozen Stage 3F reproducibility contract: byte reproducibility only under SENTINEL_CANONICAL_NUMERICS_V1. Run every
 * phase through scripts/reproducibility/run-canonical.mjs (the npm scripts do). */
const CANONICAL_NUMERICS_ACTIVE = Math.exp === numerics.exp && Math.log === numerics.log && Math.pow === numerics.pow;
if (!CANONICAL_NUMERICS_ACTIVE) process.stderr.write('[stage3g] WARNING: not running under SENTINEL_CANONICAL_NUMERICS_V1; the result cannot certify\n');
const { OBSERVABLE_ENTITY_STATE_SCHEMA_HASH } = await import('../src/stage3g/observable-entity-state-v1.js');
const { ACTION_SEMANTICS_SCHEMA_HASH } = await import('../src/stage3g/action-semantics-v1.js');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..', '..');
const at = (f) => path.join(root, f);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const git = (...a) => spawnSync('git', ['-C', repo, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const log = (m) => process.stderr.write(`[stage3g] ${m}\n`);
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const STATE_IDS = STAGE3F6P1ASYM_STATE_FEATURES.featureIds;
const readGz = (f) => gunzipSync(readFileSync(at(f))).toString('utf8');

/* ================================================================== items and columns */
const prepare = (rows, label) => { const out = []; const eligible = rows.filter(isEligible);
  eligible.forEach((row, i) => { out.push({ row, ev: stage3gEvidence(row), state: STATE_IDS.map((id) => row.core[id]) }); if ((i + 1) % 2000 === 0) log(`${label} ${i + 1}/${eligible.length}`); });
  return out; };
const BLOCK = { TYPE: (c) => c.blocks.TYPE, CANDIDATE: (c) => c.blocks.CANDIDATE, GEOMETRY: (c) => c.blocks.GEOMETRY, GM: (c) => c.GM, GP: (c) => c.GP,
  PRIV: (c) => c.priv, ABS: (c) => c.abs, HIDDEN: (c) => c.hidden };
function columns(item, spec, view = (c) => c) {
  const is = item.ev.candidates.map((c) => c.i); const maxI = Math.max(...is); const meanI = mean(is);
  return item.ev.candidates.map((c0) => {
    const c = view(c0); const cols = [];
    for (const b of spec.main) { if (b === 'ONESTEP') cols.push(c0.i - maxI, c0.i - meanI); else cols.push(...BLOCK[b](c)); }
    for (const b of spec.interact) for (const v of BLOCK[b](c)) for (const s of item.state) cols.push(v * s);
    return cols;
  });
}
const fitSpec = (items, spec) => fitCandidateLogit(items.map((item) => ({ X: columns(item, spec), y: item.ev.candidates.map((c) => c.o) })));
const columnCount = (spec) => spec.main.reduce((a, b) => a + ({ TYPE: 3, CANDIDATE: 5, GEOMETRY: 3, GM: 9, GP: 9, PRIV: 7, ABS: 4, HIDDEN: 4, ONESTEP: 2 })[b], 0)
  + spec.interact.reduce((a, b) => a + ({ TYPE: 3, CANDIDATE: 5, GEOMETRY: 3, GM: 9, GP: 9 })[b] * STATE_IDS.length, 0);
const diagSpec = (base, add) => ({ main: [...base.main, ...add], interact: base.interact });
/** The deployable columns of a NEW spec's main blocks (for residual attribution). */
const depOf = (spec) => (c) => spec.main.filter((b) => ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GM', 'GP'].includes(b)).flatMap((b) => BLOCK[b](c));

/* ================================================================== strategies */
const idxWhere = (item, pred) => { const idx = item.ev.candidates.map((c, i) => (pred(c) ? i : -1)).filter((i) => i >= 0); return idx.length ? idx : item.ev.candidates.map((c, i) => i); };
const CONTROLS = {
  UNIFORM_AMONG_ZERO_COST: (item) => ({ idx: item.ev.candidates.map((c, i) => i) }),
  LOWEST_ACTION_ID: (item) => { const ks = item.ev.candidates.map((c) => c.key); return { idx: [ks.indexOf([...ks].sort()[0])] }; },
  FIXED_DIRECTION_EAST: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.dir === 'EAST') }),
  HIDDEN_BASE_EAST: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.hidden[0] === 1) }),
  RESOURCE_PRESERVING_V1: (item) => { const k = item.row.policies.RESOURCE_PRESERVING_V1; const i = item.ev.candidates.findIndex((c) => c.key === k); return i >= 0 ? { idx: [i] } : null; },
  ONE_STEP_ZERO_COST: (item) => ({ idx: topSet(item.ev.candidates.map((c) => c.i)) }),
};
const modelStrategy = (model, spec) => (item) => { const { scores, probabilities } = scoreCandidates(model, columns(item, spec)); return { idx: topSet(scores), probs: probabilities }; };
const outcome = (item, d) => (d === null ? null : outcomeOf(item.ev.candidates, d.idx, d.probs ?? null));
function summarize(outs) {
  const c = outs.filter((o) => o !== null); const probabilistic = c.length && c[0].pOptimal !== undefined;
  return { n: outs.length, coverage: outs.length ? c.length / outs.length : null, FREE_ACTION_TOP1: mean(c.map((o) => o.hit)), REGRET: mean(c.map((o) => o.regret)),
    NORMALIZED_REGRET: mean(c.map((o) => o.nreg)), catastrophicRate: mean(c.map((o) => o.catastrophic)),
    ...(probabilistic ? { OPTIMAL_SET_HIT_RATE: mean(c.map((o) => o.pOptimal)), crossEntropy: mean(c.map((o) => o.crossEntropy)), brier: mean(c.map((o) => o.brier)),
      ece: ece10(c.map((o) => ({ p: o.confidence, y: o.hit }))) } : {}) };
}
function compare(outA, outB, label) {
  const d = outA.map((a, i) => (a === null || outB[i] === null ? null : { h: a.hit - outB[i].hit, n: a.nreg - outB[i].nreg }));
  const w = d.map((x) => (x === null ? 0 : 1)); const p = bootstrapPlan(d.length, `STAGE3G:${label}`);
  const diff = { n: w.reduce((a, b) => a + b, 0), top1Difference: mean(d.filter(Boolean).map((x) => x.h)), top1Ci95: bootstrapMean(p, d.map((x) => (x ? x.h : 0)), w),
    nregDifference: mean(d.filter(Boolean).map((x) => x.n)), nregCi95: bootstrapMean(p, d.map((x) => (x ? x.n : 0)), w) };
  return { ...diff, ...materialGain(diff) };
}

/* ================================================================== integrity measures */
function integrity(items, models, newBlock) {
  let pairs = 0; let equal = 0; const pred = Object.fromEntries(Object.keys(models).map((k) => [k, { twins: 0, equal: 0 }]));
  let order = 0; let orderEqual = 0;
  for (const item of items) {
    for (const [k, { model, spec }] of Object.entries(models)) { /* candidate order: score the reversed list, map back */
      if (k !== 'NEW') continue;
      const base = topSet(scoreCandidates(model, columns(item, spec)).scores).map((i) => item.ev.candidates[i].key).sort().join(',');
      const rev = { ...item, ev: { ...item.ev, candidates: [...item.ev.candidates].reverse() } };
      const r = topSet(scoreCandidates(model, columns(rev, spec)).scores).map((i) => rev.ev.candidates[i].key).sort().join(',');
      order += 1; if (base === r) orderEqual += 1;
    }
    if (item.ev.twinNew === null) continue;
    for (const transform of TWIN_TRANSFORMS) {
      const tn = item.ev.twinNew[transform]; const told = item.ev.twinFeatures[transform]; const o = TRANSFORM_EQUIVALENT[transform];
      for (const c of item.ev.candidates) { pairs += 1; const t = tn[c.key]; if (t && JSON.stringify(t[newBlock]) === JSON.stringify(c[newBlock]) && JSON.stringify(t.GM) === JSON.stringify(c.GM) && JSON.stringify(t.GP) === JSON.stringify(c.GP)) equal += 1; }
      if (item.ev.candidates.some((c) => !tn[c.key] || !told[c.key])) { for (const k of Object.keys(pred)) pred[k].twins += 1; continue; }
      const view = (c) => ({ ...c, blocks: { TYPE: told[c.key].slice(0, 3), CANDIDATE: told[c.key].slice(3, 8), GEOMETRY: told[c.key].slice(8, 11) }, GM: tn[c.key].GM, GP: tn[c.key].GP,
        abs: directionOneHot(c.dir === null ? null : orientDirection(o, c.dir)) });
      for (const [k, { model, spec }] of Object.entries(models)) {
        pred[k].twins += 1;
        if (topSet(scoreCandidates(model, columns(item, spec)).scores).join(',') === topSet(scoreCandidates(model, columns(item, spec, view)).scores).join(',')) pred[k].equal += 1;
      }
    }
  }
  const sample = items.filter((i) => i.ev.twinNew !== null);
  const fid = {}; for (const it of items) for (const [k, [n, ok]] of Object.entries(it.ev.fidelity)) { fid[k] ??= [0, 0]; fid[k][0] += n; fid[k][1] += ok; }
  const render = sample.reduce((a, i) => ({ cells: a.cells + i.ev.render.cells, agree: a.agree + i.ev.render.agree, stacked: a.stacked + i.ev.render.stackedEntities }), { cells: 0, agree: 0, stacked: 0 });
  return {
    twinRows: sample.length, featurePairs: pairs, D4_FEATURE_EQUIVARIANCE: pairs ? equal / pairs : null,
    D4_PREDICTION_EQUIVARIANCE: Object.fromEntries(Object.entries(pred).map(([k, v]) => [k, { twins: v.twins, rate: v.twins ? v.equal / v.twins : null }])),
    ID_PERMUTATION_INVARIANCE: mean(sample.map((i) => i.ev.idPermutationNew)), OLD_ID_PERMUTATION_INVARIANCE: mean(items.map((i) => i.ev.idPermutationInvariant)),
    CANDIDATE_ORDER_INVARIANCE: order ? orderEqual / order : null,
    PRIVILEGED_KEY_SCAN_HITS: items.reduce((a, i) => a + i.ev.newScanHits, 0), POISON_PROBE_INVARIANCE: mean(sample.map((i) => i.ev.poisonInvariant)),
    RENDER_AGREEMENT: render.cells ? render.agree / render.cells : null, renderCells: render.cells, stackedEntities: render.stacked,
    E1_EFFECT_FIDELITY: Object.fromEntries(Object.entries(fid).map(([k, [n, ok]]) => [k, { n, rate: n ? ok / n : null }])),
    SURFACE_RETREAT_ID_DEPENDENT_RATE: mean(sample.map((i) => i.ev.surfaceRetreatIdDependent)),
  };
}

/* ================================================================== residual attribution */
const separates = (O, W, v) => { const vo = O.map(v); const vw = W.map(v); return Math.min(...vo) > Math.max(...vw) || Math.max(...vo) < Math.min(...vw); };
function residuals(items, strategy, spec) {
  const classes = ['REPRESENTED_BUT_MISRANKED', 'PRIVILEGED_ONLY', 'MECHANISTIC', 'TEMPORAL', 'INDISTINGUISHABLE', 'UNKNOWN'];
  const w = Object.fromEntries(classes.map((k) => [k, 0])); const multi = { DEPLOYABLE_SEPARATES: 0, PRIVILEGED_SEPARATES: 0, ONE_STEP_SEPARATES: 0, HORIZON_DEPENDENT: 0 };
  let total = 0; const dep = depOf(spec); const same = (a, b) => a.length === b.length && a.every((v, j) => v === b[j]);
  for (const item of items) {
    const d = strategy(item); const top = new Set(d.idx); const hit = d.idx.reduce((a, i) => a + item.ev.candidates[i].o, 0) / d.idx.length;
    const weight = 1 - hit; if (weight <= 0) continue;
    const O = item.ev.candidates.filter((c) => c.o).map((c) => ({ dep: dep(c), priv: c.priv, i: c.i }));
    const W = item.ev.candidates.filter((c, i) => top.has(i) && !c.o).map((c) => ({ dep: dep(c), priv: c.priv, i: c.i }));
    const depSep = O[0].dep.some((_, j) => separates(O, W, (x) => x.dep[j]));
    const privSep = O[0].priv.some((_, j) => separates(O, W, (x) => x.priv[j]));
    const oneSep = separates(O, W, (x) => x.i);
    const horizon = item.row.label.horizonClass === 'HORIZON_DEPENDENT';
    const identical = O.every((o) => W.some((x) => same(o.dep, x.dep) && same(o.priv, x.priv) && o.i === x.i));
    const primary = depSep ? 'REPRESENTED_BUT_MISRANKED' : privSep ? 'PRIVILEGED_ONLY' : oneSep ? 'MECHANISTIC' : horizon ? 'TEMPORAL' : identical ? 'INDISTINGUISHABLE' : 'UNKNOWN';
    w[primary] += weight; total += weight;
    if (depSep) multi.DEPLOYABLE_SEPARATES += weight; if (privSep) multi.PRIVILEGED_SEPARATES += weight; if (oneSep) multi.ONE_STEP_SEPARATES += weight; if (horizon) multi.HORIZON_DEPENDENT += weight;
  }
  const share = (x) => (total > 0 ? x / total : null);
  return { weightedErrors: total, primaryShare: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, share(v)])),
    PREDICTIVE_OR_TEMPORAL_SHARE: share(w.MECHANISTIC + w.TEMPORAL), multiLabelIncidence: Object.fromEntries(Object.entries(multi).map(([k, v]) => [k, share(v)])) };
}

/* ================================================================== descriptives */
const costStructure = (item) => (item.ev.candidates.filter((c) => c.o).length === 1 ? 'UNIQUE_OPTIMAL_ZERO_COST' : 'MULTIPLE_OPTIMAL_ZERO_COST');
const GROUPINGS = {
  horizonClass: (item) => item.row.label.horizonClass, costStructure,
  optimalTypes: (item) => [...new Set(item.ev.candidates.filter((c) => c.o).map((c) => c.type))].sort().join('+'),
  level: (item) => String(item.row.combination.level), candidateCount: (item) => String(item.ev.candidates.length),
  carrying: (item) => (item.ev.carrying ? 'CARRYING_MATERIAL' : 'NOT_CARRYING'),
};
function breakdowns(items, outs) {
  return Object.fromEntries(Object.entries(GROUPINGS).map(([g, fn]) => {
    const groups = {}; items.forEach((it, i) => { (groups[fn(it)] ??= []).push(i); });
    return [g, Object.fromEntries(Object.entries(groups).sort().map(([k, idx]) => [k, { n: idx.length,
      ...Object.fromEntries(Object.entries(outs).map(([s, o]) => [s, mean(idx.map((i) => o[i]).filter((x) => x !== null).map((x) => x.hit))])) }]))];
  }));
}

/* ================================================================== open phase */
log('preparing DEV and CAL evidence');
const corpus = readCorpus();
const DEV = prepare(corpus.filter((r) => r.partition === 'DEV'), 'DEV');
const CAL = prepare(corpus.filter((r) => r.partition === 'CAL'), 'CAL');
function openPhase() {
  const fits = { OLD: fitSpec(DEV, OLD_SPEC) };
  for (const [k, s] of Object.entries(OLD_REFERENCE_SPECS)) fits[k] = fitSpec(DEV, s);
  const calTop1 = {};
  for (const [k, s] of Object.entries(NEW_SPECS)) { log(`fit ${k}`); fits[k] = fitSpec(DEV, s); calTop1[k] = summarize(CAL.map((it) => outcome(it, modelStrategy(fits[k], s)(it)))).FREE_ACTION_TOP1; }
  const ranking = Object.keys(NEW_SPECS).map((k) => ({ k, top1: calTop1[k], cols: columnCount(NEW_SPECS[k]) }))
    .sort((a, b) => (Math.abs(b.top1 - a.top1) > 1e-9 ? b.top1 - a.top1 : a.cols - b.cols));
  const selected = ranking[0].k; const selectedSpec = NEW_SPECS[selected];
  for (const [k, d] of Object.entries(NEW_DIAGNOSTICS)) { log(`fit ${k}`); fits[k] = fitSpec(DEV, diagSpec(selectedSpec, d.add)); }
  const specs = { OLD: OLD_SPEC, ...OLD_REFERENCE_SPECS, ...NEW_SPECS, ...Object.fromEntries(Object.entries(NEW_DIAGNOSTICS).map(([k, d]) => [k, diagSpec(selectedSpec, d.add)])) };
  const replay = modelHash(fitSpec(DEV, selectedSpec));
  const evalOn = (items) => { const strategies = { ...CONTROLS, ...Object.fromEntries(Object.keys(fits).map((k) => [k, modelStrategy(fits[k], specs[k])])) };
    return Object.fromEntries(Object.entries(strategies).map(([k, fn]) => [k, summarize(items.map((it) => outcome(it, fn(it))))])); };
  const newBlock = selectedSpec.main.includes('GP') ? 'GP' : 'GM';
  const models = { OLD: { model: fits.OLD, spec: OLD_SPEC }, NEW: { model: fits[selected], spec: selectedSpec } };
  const report = roundDeep({
    schemaVersion: 1, stage: PLAN.stage, phase: 'OPEN', planHash: PLAN_HASH, numericsProfile: CANONICAL_NUMERICS_ACTIVE ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE',
    schemaHashes: { epistemic: EPISTEMIC_SCHEMA_HASH, observableEntityState: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, actionSemantics: ACTION_SEMANTICS_SCHEMA_HASH },
    partitions: ['DEV', 'CAL'], eligible: { DEV: DEV.length, CAL: CAL.length },
    models: Object.fromEntries(Object.entries(fits).map(([k, m]) => [k, { modelHash: modelHash(m), columns: m.w.length, spec: specs[k], trainedGroups: m.trainedGroups }])),
    oldBinding: { modelHash: modelHash(fits.OLD), certified: OLD_BINDING.modelHash, OLD_MODEL_REPRODUCED: modelHash(fits.OLD) === OLD_BINDING.modelHash,
      privilegedModelHash: modelHash(fits.OLD_PRIVILEGED), certifiedPrivileged: OLD_BINDING.privilegedModelHash, OLD_PRIVILEGED_MODEL_REPRODUCED: modelHash(fits.OLD_PRIVILEGED) === OLD_BINDING.privilegedModelHash },
    calSelection: { rule: PLAN.recheck.calSelection, ranking, selected, replayHash: replay, deterministic: replay === modelHash(fits[selected]) },
    results: { DEV: evalOn(DEV), CAL: evalOn(CAL) },
    integrity: { DEV: integrity(DEV, models, newBlock), CAL: integrity(CAL, models, newBlock) },
    noSealedRowScored: true,
  });
  return { report, fits, specs, selected, selectedSpec, newBlock, models };
}
const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  const r = open.report;
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: r.reportHash, oldBinding: r.oldBinding, calSelection: r.calSelection,
    CAL: Object.fromEntries(Object.entries(r.results.CAL).map(([k, v]) => [k, v.FREE_ACTION_TOP1])), integrity: r.integrity }, null, 2));
  process.exit(0);
}

/* ================================================================== sealed evaluation */
const openStored = readJson(OPEN_REPORT_PATH);
/* Declared post-generation amendments (artifacts/stage3g-predictive-integrity/stage3g-amendment-*.json). */
const AMENDMENT_PATH = 'artifacts/stage3g-predictive-integrity/stage3g-amendment-001.json';
const AMENDMENT = existsSync(at(AMENDMENT_PATH)) ? readJson(AMENDMENT_PATH) : null;
const AMENDMENTS = AMENDMENT === null ? [] : AMENDMENT.changes;
/** The scientific content of a certificate: what an amendment of the harness may not move. */
const scientificSections = (c) => ({ models: c.models, calSelection: c.calSelection, headline: c.headline, partitions: c.partitions, representation: c.representation,
  oldReproduced: c.oldReproduced, data: c.data, schemaHashes: c.schemaHashes, planHash: c.planHash, openPhaseReportHash: c.openPhaseReportHash, numericsProfile: c.numericsProfile });
const openRecomputed = { ...open.report, reportHash: hex(JSON.stringify(open.report)) };
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const sealedManifest = readJson(SEALED_MANIFEST_PATH);
const sealedText = readGz(SEALED_PATH);
const sealed = sealedText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const p1Manifest = readJson(P1ASYM_FRESH_MANIFEST);
const p1Text = readGz(P1ASYM_FRESH_PATH);
const p1 = p1Text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const SOURCE_ROWS = {
  STAGE3G_HOLDOUT: sealed.filter((r) => r.partition === 'STAGE3G_HOLDOUT'), STAGE3G_OOD: sealed.filter((r) => r.partition === 'STAGE3G_OOD'),
  P1ASYM_HOLDOUT: p1.filter((r) => r.partition === 'FRESH_HOLDOUT'), P1ASYM_OOD: p1.filter((r) => r.partition === 'FRESH_OOD'),
};
const EVAL = Object.fromEntries(Object.entries(SOURCE_ROWS).map(([k, rows]) => { log(`preparing ${k}`); return [k, prepare(rows, k)]; }));
const { fits, specs, selected, selectedSpec, newBlock, models } = open;
const NEW = selected;
const DIAGS = Object.keys(NEW_DIAGNOSTICS);
const strategiesAll = { ...CONTROLS, ...Object.fromEntries(Object.keys(fits).map((k) => [k, modelStrategy(fits[k], specs[k])])) };

const partitions = {};
for (const [name, items] of Object.entries(EVAL)) {
  log(`evaluating ${name}`);
  const outs = Object.fromEntries(Object.entries(strategiesAll).map(([k, fn]) => [k, items.map((it) => outcome(it, fn(it)))]));
  const summary = Object.fromEntries(Object.entries(outs).map(([k, o]) => [k, summarize(o)]));
  const cmp = (a, b) => compare(outs[a], outs[b], `${name}:${a}-vs-${b}`);
  const comparisons = {
    NEW_vs_OLD: cmp(NEW, 'OLD'), NEW_vs_UNIFORM: cmp(NEW, 'UNIFORM_AMONG_ZERO_COST'), NEW_vs_RESOURCE: cmp(NEW, 'RESOURCE_PRESERVING_V1'),
    OLD_vs_UNIFORM: cmp('OLD', 'UNIFORM_AMONG_ZERO_COST'), OLD_vs_RESOURCE: cmp('OLD', 'RESOURCE_PRESERVING_V1'),
    OLD_PRIVILEGED_vs_OLD: cmp('OLD_PRIVILEGED', 'OLD'), OLD_ONE_STEP_vs_OLD: cmp('OLD_ONE_STEP', 'OLD'), OLD_PRIVILEGED_vs_NEW: cmp('OLD_PRIVILEGED', NEW),
    LOWEST_ACTION_ID_vs_NEW: cmp('LOWEST_ACTION_ID', NEW), FIXED_DIRECTION_EAST_vs_NEW: cmp('FIXED_DIRECTION_EAST', NEW),
    ...Object.fromEntries(DIAGS.map((d) => [`${d}_vs_NEW`, cmp(d, NEW)])),
    ...Object.fromEntries(Object.keys(NEW_SPECS).filter((k) => k !== NEW).map((k) => [`${k}_vs_OLD`, cmp(k, 'OLD')])),
  };
  const top = (k) => summary[k].FREE_ACTION_TOP1;
  const gapRecovery = (top('OLD_PRIVILEGED') - top('OLD')) !== 0 ? (top(NEW) - top('OLD')) / (top('OLD_PRIVILEGED') - top('OLD')) : null;
  const orient = Object.fromEntries(ORIENTATIONS.map((o) => { const idx = items.map((it, i) => (it.row.orientation === o ? i : -1)).filter((i) => i >= 0);
    const acc = (k) => mean(idx.map((i) => outs[k][i]).filter((x) => x !== null).map((x) => x.hit));
    return [o, { n: idx.length, UNIFORM: acc('UNIFORM_AMONG_ZERO_COST'), OLD: acc('OLD'), NEW: acc(NEW), gainVsUniform: acc(NEW) - acc('UNIFORM_AMONG_ZERO_COST') }]; }));
  const overallGain = top(NEW) - top('UNIFORM_AMONG_ZERO_COST');
  partitions[name] = {
    rows: SOURCE_ROWS[name].length, eligible: items.length, strategies: summary, comparisons, GAP_RECOVERY: gapRecovery,
    orientation: { perOrientation: orient, overallGain, STABLE: overallGain > 0 && Object.values(orient).every((o) => o.n === 0 || o.gainVsUniform >= 0.5 * overallGain) },
    integrity: integrity(items, models, newBlock),
    breakdowns: breakdowns(items, Object.fromEntries(['UNIFORM_AMONG_ZERO_COST', 'RESOURCE_PRESERVING_V1', 'OLD', 'OLD_PRIVILEGED', NEW, 'D_NEW_PLUS_ONE_STEP', 'D_NEW_PLUS_PRIVILEGED'].map((k) => [k, outs[k]]))),
    residualErrors: { NEW: residuals(items, strategiesAll[NEW], selectedSpec), OLD: residuals(items, strategiesAll.OLD, OLD_SPEC) },
  };
}

/* ================================================================== conclusions (pre-registered rules) */
const H = partitions.STAGE3G_HOLDOUT; const O = partitions.STAGE3G_OOD;
const both = (fn) => fn(H) && fn(O);
const integrityHolds = both((p) => p.integrity.D4_FEATURE_EQUIVARIANCE === 1 && p.integrity.D4_PREDICTION_EQUIVARIANCE.NEW.rate === 1 && p.integrity.ID_PERMUTATION_INVARIANCE === 1
  && p.integrity.CANDIDATE_ORDER_INVARIANCE === 1 && p.integrity.PRIVILEGED_KEY_SCAN_HITS === 0 && p.integrity.POISON_PROBE_INVARIANCE === 1
  && Object.values(p.integrity.E1_EFFECT_FIDELITY).every((x) => x.n === 0 || x.rate === 1) && p.orientation.STABLE
  && !p.comparisons.D_NEW_PLUS_ABSOLUTE_DIRECTION_vs_NEW.MATERIAL);
const IMPROVED = both((p) => p.comparisons.NEW_vs_OLD.MATERIAL) && integrityHolds;
const CLOSED = IMPROVED && both((p) => p.GAP_RECOVERY !== null && p.GAP_RECOVERY >= THRESHOLDS.GAP_RECOVERY_CLOSED && !p.comparisons.D_NEW_PLUS_PRIVILEGED_vs_NEW.MATERIAL
  && p.strategies[NEW].FREE_ACTION_TOP1 >= THRESHOLDS.SUFFICIENT_TOP1 && p.comparisons.NEW_vs_UNIFORM.MATERIAL && p.comparisons.NEW_vs_RESOURCE.MATERIAL);
const PARTIAL = IMPROVED && !CLOSED;
const oneStepMaterial = both((p) => p.comparisons.D_NEW_PLUS_ONE_STEP_vs_NEW.MATERIAL);
const temporalDominant = both((p) => (p.residualErrors.NEW.PREDICTIVE_OR_TEMPORAL_SHARE ?? 0) >= THRESHOLDS.TEMPORAL_RESIDUAL_SHARE);
const TRANSITION_PREDICTION_NOW_JUSTIFIED = (CLOSED || PARTIAL) && (oneStepMaterial || temporalDominant);
const representation = {
  REPRESENTATION_MATERIALLY_IMPROVED: IMPROVED, INTEGRITY: integrityHolds,
  REPRESENTATION_GAP_CLOSED: CLOSED, REPRESENTATION_GAP_PARTIALLY_CLOSED: PARTIAL, REPRESENTATION_GAP_REMAINS: !CLOSED,
  TRANSITION_PREDICTION_NOW_JUSTIFIED, ONE_STEP_MATERIAL_OVER_NEW: oneStepMaterial, RESIDUAL_PREDICTIVE_OR_TEMPORAL_DOMINANT: temporalDominant,
  RESIDUAL_POLICY_QUALITY_SHARE: { STAGE3G_HOLDOUT: H.residualErrors.NEW.primaryShare.REPRESENTED_BUT_MISRANKED, STAGE3G_OOD: O.residualErrors.NEW.primaryShare.REPRESENTED_BUT_MISRANKED },
};

/* ================================================================== integrity of the boundary, data and freeze */
const headBlob = (f) => { const g = spawnSync('git', ['-C', repo, 'show', `HEAD:platform/game-agnostic/${f}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return g.status === 0 ? hex(g.stdout) : null; };
const selfHash = (doc, field) => { const { [field]: h, ...body } = doc; return hex(JSON.stringify(body)) === h; };
const stage3f = (() => {
  const inh = STAGE3F_INHERITANCE; const freeze = readJson(inh.FREEZE_FILE); const cert = readJson(inh.CERTIFICATE_FILE);
  /* Amendment 001 (second defect): only Stage 3F-protected paths are diffed, so later commits elsewhere cannot move this
   * certificate. Protected: every Stage 3F artifact, doc, script, source module and test, and the frozen infrastructure
   * Stage 3F certified against (core, Forge, symmetric Forge, reproducibility and check-mode tooling). */
  const PROTECTED = ['artifacts/stage3f*/**', 'docs/STAGE3F*', 'scripts/*stage3f*', 'scripts/reproducibility/**', 'scripts/certification/**',
    'src/stage3f/**', 'src/core/**', 'src/forge/**', 'src/forge-symmetric/**', 'tests/*stage3f*'].map((p) => `:(glob)platform/game-agnostic/${p}`);
  const protectedChanges = git('diff', '--name-only', inh.FREEZE_CERTIFICATION_COMMIT, 'HEAD', '--', ...PROTECTED).stdout.trim().split('\n').filter(Boolean);
  const facts = freeze.sections.immutableFacts.values;
  return {
    FREEZE_HASH_BOUND: freeze.freezeHash === inh.STAGE3F_FREEZE_HASH && selfHash(freeze, 'freezeHash'),
    CERTIFICATION_HASH_BOUND: cert.certificationHash === inh.STAGE3F_CERTIFICATION_HASH && selfHash(cert, 'certificationHash') && cert.status === 'PASS',
    CERTIFICATE_BINDS_FREEZE: cert.freeze.freezeHash === inh.STAGE3F_FREEZE_HASH,
    STATUS_FROZEN: cert.conclusion.STAGE3F_STATUS === 'FROZEN' && cert.conclusion.READY_FOR_STAGE3G === true,
    IMMUTABLE_FACTS_HASH_BOUND: hex(JSON.stringify(freeze.sections.immutableFacts)) === inh.IMMUTABLE_FACTS_HASH && freeze.bound.IMMUTABLE_FACTS_HASH === inh.IMMUTABLE_FACTS_HASH,
    FACTS_UNCHANGED: JSON.stringify(facts) === JSON.stringify(inh.FACTS),
    FREEZE_COMMITS_ANCESTORS: git('merge-base', '--is-ancestor', inh.FREEZE_COMMIT, 'HEAD').status === 0 && git('merge-base', '--is-ancestor', inh.FREEZE_CERTIFICATION_COMMIT, 'HEAD').status === 0,
    NO_STAGE3F_FILE_CHANGED: protectedChanges.length === 0, stage3fProtectedChangesSinceFreeze: protectedChanges, protectedPaths: PROTECTED,
    AUTHORITY_R0: freeze.authority.tier === 'R0' && freeze.authority.canDispatch === false && freeze.authority.canMutateLiveWorld === false,
  };
})();
const planFile = readJson(PLAN_PATH);
const schemaBinding = {
  PLAN_BOUND: planFile.planHash === PLAN_HASH,
  EPISTEMIC_SCHEMA_BOUND: planFile.plan.schemas.epistemic.hash === EPISTEMIC_SCHEMA_HASH && openStored.schemaHashes.epistemic === EPISTEMIC_SCHEMA_HASH,
  OBSERVABLE_STATE_SCHEMA_BOUND: planFile.plan.schemas.observableEntityState.hash === OBSERVABLE_ENTITY_STATE_SCHEMA_HASH && openStored.schemaHashes.observableEntityState === OBSERVABLE_ENTITY_STATE_SCHEMA_HASH,
  ACTION_SEMANTICS_SCHEMA_BOUND: planFile.plan.schemas.actionSemantics.hash === ACTION_SEMANTICS_SCHEMA_HASH && openStored.schemaHashes.actionSemantics === ACTION_SEMANTICS_SCHEMA_HASH,
};
const freezeDiscipline = (() => {
  const g = (f) => `platform/game-agnostic/${f}`;
  const commits = git('log', '--format=%H', '--', g(PLAN_PATH)).stdout.trim().split('\n').filter(Boolean);
  const commit = commits.at(-1) ?? null;
  const files = commit ? git('show', '--name-only', '--format=', commit).stdout.trim().split('\n').filter(Boolean) : [];
  const generatedAt = sealedManifest.generatedAtHead ?? null;
  const evalChanged = generatedAt === null ? 'NO_GENERATION_COMMIT' : git('diff', '--name-only', generatedAt, '--', ...EVALUATION_FILES.map(g)).stdout.trim();
  /* A declared amendment may change a listed evaluation file after generation only from its recorded pre-amendment bytes
   * (at the generation commit) to its recorded post-amendment bytes; anything else still fails. */
  const blobAt = (c, f) => { const b = spawnSync('git', ['-C', repo, 'show', `${c}:${g(f)}`], { encoding: 'buffer', maxBuffer: 1 << 28 }); return b.status === 0 ? hex(b.stdout) : null; };
  const amended = generatedAt === null ? [] : evalChanged.split('\n').filter(Boolean);
  const amendmentCovers = amended.every((f) => AMENDMENTS.some((a) => g(a.file) === f && blobAt(generatedAt, a.file) === a.beforeSha256 && hex(readFileSync(at(a.file))) === a.afterSha256));
  const out = { freezeCommit: commit, planAndOpenReportInFreezeCommit: files.includes(g(PLAN_PATH)) && files.includes(g(OPEN_REPORT_PATH)),
    noSealedOrResultInFreezeCommit: !files.some((f) => /stage3g-predictive-integrity\/(sealed-partitions|stage3g-certification-result)/.test(f)),
    evaluationFilesAtHead: EVALUATION_FILES.every((f) => headBlob(f) === hex(readFileSync(at(f)))),
    sealedGeneratedAtHead: generatedAt, sealedGeneratedAfterFreeze: generatedAt !== null && commit !== null && git('merge-base', '--is-ancestor', commit, generatedAt).status === 0,
    evaluationFilesUnchangedSinceGeneration: evalChanged === '' || amendmentCovers, amendedAfterGeneration: amended.map((f) => f.replace('platform/game-agnostic/', '')) };
  out.FROZEN_BEFORE_SEALED = commit !== null && Object.entries(out).filter(([k]) => !['freezeCommit', 'sealedGeneratedAtHead', 'amendedAfterGeneration'].includes(k)).every(([, v]) => v === true);
  return out;
})();
const lineage = stage3fLineage();
const sets = { record: new Set(lineage.rows.map((r) => r.recordHash)), world: new Set(lineage.rows.map((r) => r.worldHash)), topology: new Set(lineage.rows.map((r) => r.topologyHash)) };
const sealedEq = sealed.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const data = {
  sealedContentHash: hex(sealedText), contentBound: hex(sealedText) === sealedManifest.contentHash, planBound: sealedManifest.planHash === PLAN_HASH,
  seedPlanBound: sealedManifest.seedPlanHash === SEED_PLAN_HASH, seedAudit: seedAudit(lineage.rows), priorLineage: lineage.sources, priorRows: lineage.rows.length,
  counts: { STAGE3G_HOLDOUT: SOURCE_ROWS.STAGE3G_HOLDOUT.length, STAGE3G_OOD: SOURCE_ROWS.STAGE3G_OOD.length },
  levels: Object.fromEntries(['STAGE3G_HOLDOUT', 'STAGE3G_OOD'].map((p) => [p, [...new Set(SOURCE_ROWS[p].map((r) => r.combination.level))].sort()])),
  overlapWithLineage: Object.fromEntries(Object.entries(sets).map(([k, s]) => [k, sealed.filter((r) => s.has(r[`${k}Hash`])).length])),
  internalDuplicates: Object.fromEntries(['record', 'world', 'topology'].map((k) => [k, sealed.length - new Set(sealed.map((r) => r[`${k}Hash`])).size])),
  equivarianceChecks: sealedEq.length, SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, mean(sealedEq.map((x) => (x[k] === 1 ? 1 : 0)))])),
  benchmarkBound: JSON.stringify(sealedManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
  p1asymFreshBound: hex(p1Text) === p1Manifest.contentHash && p1Manifest.contentHash === OLD_BINDING.freshContentHash,
};
const oldReproduced = {
  OLD_MODEL_REPRODUCED: openStored.oldBinding.OLD_MODEL_REPRODUCED === true, OLD_PRIVILEGED_MODEL_REPRODUCED: openStored.oldBinding.OLD_PRIVILEGED_MODEL_REPRODUCED === true,
  P1ASYM_HOLDOUT_TOP1: round(partitions.P1ASYM_HOLDOUT.strategies.OLD.FREE_ACTION_TOP1), P1ASYM_OOD_TOP1: round(partitions.P1ASYM_OOD.strategies.OLD.FREE_ACTION_TOP1),
  P1ASYM_PRIVILEGED_HOLDOUT_TOP1: round(partitions.P1ASYM_HOLDOUT.strategies.OLD_PRIVILEGED.FREE_ACTION_TOP1), P1ASYM_PRIVILEGED_OOD_TOP1: round(partitions.P1ASYM_OOD.strategies.OLD_PRIVILEGED.FREE_ACTION_TOP1),
};
oldReproduced.OLD_CERTIFIED_NUMBERS_REPRODUCED = oldReproduced.P1ASYM_HOLDOUT_TOP1 === OLD_BINDING.certifiedTop1.FRESH_HOLDOUT && oldReproduced.P1ASYM_OOD_TOP1 === OLD_BINDING.certifiedTop1.FRESH_OOD
  && oldReproduced.P1ASYM_PRIVILEGED_HOLDOUT_TOP1 === OLD_BINDING.certifiedPrivilegedTop1.FRESH_HOLDOUT && oldReproduced.P1ASYM_PRIVILEGED_OOD_TOP1 === OLD_BINDING.certifiedPrivilegedTop1.FRESH_OOD;
const libRaw = ['src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js'].map((f) => readFileSync(at(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
const libImports = libRaw.map((s) => [...s.matchAll(/^import [^;]*from '([^']+)';/gm)].map((m) => m[1]));
const libSources = libRaw.map((s) => s.replace(/^import [^;]*;$/gm, '').replace(/'[^'\n]*'|`[^`]*`/g, "''"));
const staticAudit = {
  DERIVATION_IMPORTS_NO_ORACLE: libImports.every((l) => l.length > 0 && l.every((i) => !/(counterfactual|oracle|warmup|scenarios|kernel\.js|policy-requalification|dataset|supervision|forge-symmetric)/.test(i))),
  derivationImports: libImports,
  ONLY_VISIBLE_MAP_READS_WORLD: (libSources[0].match(/world\./g) ?? []).length > 0 && !/world\./.test(libSources[1]),
  NO_ROLLOUT_OR_SUCCESSOR_IN_DERIVATION: libSources.every((s) => !/\bstep\(|symmetricStep|rollout|horizonTotal|regret|optimal/.test(s)),
  NEW_SPECS_DEPLOYABLE_ONLY: Object.values(NEW_SPECS).every((s) => [...s.main, ...s.interact].every((b) => ['TYPE', 'CANDIDATE', 'GEOMETRY', 'GM', 'GP'].includes(b))),
  FITS_ON_DEV_ONLY: [...readFileSync(at('scripts/certify-stage3g-predictive-integrity.mjs'), 'utf8').matchAll(/fitSpec\(([A-Z]+),/g)].every((m) => m[1] === 'DEV'),
};
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  log('running Stage 3G tests');
  /* Amendment 001: the canonical runner already sets --test-reporter=tap in NODE_OPTIONS; a second one makes node --test refuse to start. */
  const reporter = /--test-reporter(=|\s)/.test(process.env.NODE_OPTIONS ?? '') ? [] : ['--test-reporter=tap'];
  const r = spawnSync(process.execPath, ['--test', ...reporter, 'tests/stage3g-epistemic-integrity.test.js', 'tests/stage3g-observable-state.test.js'],
    { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 1 << 28 });
  testsStatus = r.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const checks = {
  CANONICAL_NUMERICS: CANONICAL_NUMERICS_ACTIVE && openStored.numericsProfile === numerics.CANONICAL_NUMERICS_ID,
  STAGE3F_INHERITANCE_INTACT: Object.entries(stage3f).filter(([k]) => !['stage3fProtectedChangesSinceFreeze', 'protectedPaths'].includes(k)).every(([, v]) => v === true),
  STAGE3G_SCHEMAS_BOUND: Object.values(schemaBinding).every(Boolean),
  OPEN_PHASE_REPRODUCED, FIT_DETERMINISTIC: openStored.calSelection.deterministic === true,
  OLD_REPRESENTATION_REPRODUCED: Object.values(oldReproduced).filter((v) => typeof v === 'boolean').every(Boolean),
  FROZEN_BEFORE_SEALED: freezeDiscipline.FROZEN_BEFORE_SEALED,
  SEALED_INTEGRITY: data.contentBound && data.planBound && data.seedPlanBound && data.benchmarkBound && data.p1asymFreshBound
    && Object.values(data.overlapWithLineage).every((v) => v === 0) && Object.values(data.internalDuplicates).every((v) => v === 0)
    && data.seedAudit.priorSeedOverlap.length === 0 && data.seedAudit.priorRowOverlap.length === 0 && data.seedAudit.partitionOverlap.length === 0
    && data.counts.STAGE3G_HOLDOUT === SEED_PLAN.sizes.HOLDOUT && data.counts.STAGE3G_OOD === SEED_PLAN.sizes.OOD,
  SEALED_SYMMETRY_INTACT: data.equivarianceChecks > 0 && Object.values(data.SYMMETRY_CHECKS).every((v) => v === 1),
  EVIDENCE_FIDELITY: Object.values(EVAL).every((items) => items.every((it) => it.ev.worldFidelity === 1 && it.ev.candidateSetFidelity === 1)),
  STATIC_AUDIT: Object.entries(staticAudit).filter(([k]) => k !== 'derivationImports').every(([, v]) => v === true),
  AUTHORITY_R0: PLAN.authority.tier === 'R0' && !PLAN.authority.canDispatch && !PLAN.authority.canMutateLiveWorld && !PLAN.authority.onlineLearningEnabled && !PLAN.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
/* Amendment 001: the recomputed scientific sections must equal those of the preserved first sealed run exactly. */
const amendmentVerification = (() => {
  if (AMENDMENT === null) return null;
  const first = readJson(AMENDMENT.firstRun.file);
  const draft = roundDeep({ models: openStored.models, calSelection: openStored.calSelection, headline: { OLD: 'OLD (P.1A-SYM SC_GEOMETRY_MAIN)', NEW }, partitions, representation,
    oldReproduced, data, schemaHashes: { epistemic: EPISTEMIC_SCHEMA_HASH, observableEntityState: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, actionSemantics: ACTION_SEMANTICS_SCHEMA_HASH },
    planHash: PLAN_HASH, openPhaseReportHash: openStored.reportHash, numericsProfile: CANONICAL_NUMERICS_ACTIVE ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE' });
  const { certificationHash: fh, ...fb } = first;
  return { amendmentId: AMENDMENT.amendmentId, amendmentFileSha256: hex(readFileSync(at(AMENDMENT_PATH))),
    FIRST_RUN_CERTIFICATE_INTACT: hex(JSON.stringify(fb)) === fh && fh === AMENDMENT.firstRun.certificationHash && first.status === 'FAIL'
      && JSON.stringify(Object.entries(first.checks).filter(([, v]) => !v).map(([k]) => k)) === JSON.stringify(AMENDMENT.firstRun.failedChecks),
    firstRunScientificHash: hex(JSON.stringify(scientificSections(first))), recomputedScientificHash: hex(JSON.stringify(scientificSections(draft))),
    SCIENTIFIC_RESULT_UNCHANGED: hex(JSON.stringify(scientificSections(first))) === hex(JSON.stringify(scientificSections(draft))) && hex(JSON.stringify(scientificSections(first))) === AMENDMENT.firstRun.scientificHash };
})();
if (amendmentVerification !== null) checks.AMENDMENT_001_SCIENTIFIC_INVARIANCE = amendmentVerification.FIRST_RUN_CERTIFICATE_INTACT && amendmentVerification.SCIENTIFIC_RESULT_UNCHANGED;
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const payload = roundDeep({
  schemaVersion: 1, stage: PLAN.stage, status, numericsProfile: CANONICAL_NUMERICS_ACTIVE ? numerics.CANONICAL_NUMERICS_ID : 'HOST_NATIVE', planHash: PLAN_HASH, openPhaseReportHash: openStored.reportHash, seedPlanHash: SEED_PLAN_HASH,
  schemaHashes: { epistemic: EPISTEMIC_SCHEMA_HASH, observableEntityState: OBSERVABLE_ENTITY_STATE_SCHEMA_HASH, actionSemantics: ACTION_SEMANTICS_SCHEMA_HASH },
  stage3fInheritance: { ...STAGE3F_INHERITANCE, verification: stage3f }, schemaBinding, freeze: freezeDiscipline, data, oldReproduced,
  models: openStored.models, calSelection: openStored.calSelection, headline: { OLD: 'OLD (P.1A-SYM SC_GEOMETRY_MAIN)', NEW }, partitions, representation,
  staticAudit, amendments: amendmentVerification, checks, tests: testMetrics, authority: PLAN.authority,
  disclosures: {
    OBSERVABILITY: 'entity positions are exposed because Forge declares perfect information and renders every entity; this is an environment declaration, not a general claim about other games',
    SURFACE_RETREAT_TIE_BREAK: 'the frozen Stage 3F symmetric RETREAT breaks distance ties with the canonical frame, whose digest reads entity id strings; renaming entities inside the world can move RETREAT (rate reported per partition as SURFACE_RETREAT_ID_DEPENDENT_RATE). The Stage 3G representation is invariant to identities for a fixed offered action set.',
    LEVEL_COVERAGE: 'canonical admission order: STAGE3G_HOLDOUT covers the low curriculum levels in data.levels',
    UNEXPOSED_ATTRIBUTES: 'entity value, cost, risk and non-actor health remain UNAVAILABLE; errors they would explain appear in the residual taxonomy as PRIVILEGED_ONLY only when a kernel relation separates them, otherwise as UNKNOWN',
  },
  scope: { newOwners: ['src/stage3g/epistemic-provenance-v1.js', 'src/stage3g/observable-entity-state-v1.js', 'src/stage3g/action-semantics-v1.js',
    'scripts/stage3g/plan.mjs', 'scripts/stage3g/evidence.mjs', 'scripts/stage3g-plan.mjs', 'scripts/generate-stage3g-sealed.mjs', 'scripts/certify-stage3g-predictive-integrity.mjs',
    'tests/stage3g-epistemic-integrity.test.js', 'tests/stage3g-observable-state.test.js'],
  expertsModified: false, policiesModified: false, routerModified: false, stage3fArtifactsModified: false, worldModelTrained: false, counterfactualPredictionStarted: false },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = existsSync(at(RESULT_PATH)) ? readJson(RESULT_PATH) : null;
  const reproduced = stored !== null && stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3G_CERTIFICATION', reproduced, status, storedHash: stored?.certificationHash ?? null, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT_PATH), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), representation }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
