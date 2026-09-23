#!/usr/bin/env node
/* STAGE_3F_6_P_1A_SYM — FREE-ACTION DECISION SUFFICIENCY certification.
 *
 * Measurement only. On eligible states (a zero-cost action is optimal), can a simple, D4-equivariant candidate
 * scorer that reads only deployable decision-time information pick an optimal zero-cost action materially better
 * than chance and than RESOURCE? Diagnostic tiers that read non-deployable information locate what is missing.
 *
 *   --phase=open   DEV fits every model, CAL selects the headline STATE+CANDIDATE variant; writes the open report.
 *                  No fresh or T-SYM row is read.
 *   (default)      requires the committed open report (recomputed byte for byte) and the fresh partitions, then
 *                  evaluates FRESH_HOLDOUT, FRESH_OOD (primary) and TSYM_HOLDOUT, TSYM_OOD (secondary).
 *   --check        recomputes everything and requires a byte-identical certification.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DIAGNOSTIC_SPECS, MODEL_SPECS, STAGE3F6P1ASYM_OUT, STAGE3F6P1ASYM_PLAN, STAGE3F6P1ASYM_PLAN_HASH, STAGE3F6P1ASYM_PLAN_PATH,
  STAGE3F6P1ASYM_STATE_FEATURES, STAGE3F6P1ASYM_STATE_FEATURES_HASH } from './stage3f6p1asym-analysis-plan.mjs';
import { EVALUATION_FILES, FRESH_MANIFEST_PATH, FRESH_PATH, FRESH_SPEC, OPEN_REPORT_PATH, TSYM_FRESH_MANIFEST_PATH, readTsymFresh, seedAudit } from './generate-stage3f6p1asym-confirmatory.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { TWIN_TRANSFORMS, candidateEvidence, isEligible } from './stage3f6p1asym-evidence.mjs';
import { ORIENTATIONS, TRANSFORM_EQUIVALENT, orientDirection } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { bootstrapMean, bootstrapPlan } from '../src/stage3f/policy-requalification-v1.js';
import {
  CANDIDATE_FEATURE_INVENTORY, ERROR_CLASSES, FREE_ACTION_REPRESENTATION_HASH, MATERIAL_TOP1_GAIN, PARTIAL_OBSERVABILITY_CLASSES, attributeError,
  directionOneHot, ece10, fitCandidateLogit, materialGain, modelHash, outcomeOf, scoreCandidates, sufficiencyCategory, topSet,
} from '../src/stage3f/free-action-sufficiency-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const RESULT = `${STAGE3F6P1ASYM_OUT}/stage3f6p1asym-certification-result.json`;
const plan = STAGE3F6P1ASYM_PLAN;
const STATE_IDS = STAGE3F6P1ASYM_STATE_FEATURES.featureIds;
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const DEP_COLUMNS = CANDIDATE_FEATURE_INVENTORY.filter((f) => ['TYPE', 'CANDIDATE', 'GEOMETRY'].includes(f.block)).map((f) => f.id);
const EAST_PRESERVING = ORIENTATIONS.filter((o) => orientDirection(o, 'EAST') === 'EAST');

/* ================================================================== items */
const prepare = (rows) => rows.filter(isEligible).map((row) => ({ row, ev: candidateEvidence(row), state: STATE_IDS.map((id) => row.core[id]) }));
const split = (flat) => ({ TYPE: flat.slice(0, 3), CANDIDATE: flat.slice(3, 8), GEOMETRY: flat.slice(8, 11) });
const BLOCK = { TYPE: (c) => c.blocks.TYPE, CANDIDATE: (c) => c.blocks.CANDIDATE, GEOMETRY: (c) => c.blocks.GEOMETRY, ABS: (c) => c.abs, CANON: (c) => c.canon,
  HIDDEN: (c) => c.hidden, PRIV: (c) => c.priv };
/** Columns of every candidate of one state; `view` substitutes a twin's candidate fields. */
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
const diagSpec = (base, add) => ({ main: [...base.main, ...add], interact: base.interact });
const columnCount = (spec) => columns({ ev: { candidates: [{ i: 0, blocks: { TYPE: [0, 0, 0], CANDIDATE: [0, 0, 0, 0, 0], GEOMETRY: [0, 0, 0] }, abs: [0, 0, 0, 0], canon: [0, 0, 0, 0], hidden: [0, 0, 0, 0], priv: [0, 0, 0, 0, 0, 0, 0] }] }, state: STATE_IDS.map(() => 0) }, spec)[0].length;

/* ============================================================== strategies */
const idxWhere = (item, pred) => { const idx = item.ev.candidates.map((c, i) => (pred(c) ? i : -1)).filter((i) => i >= 0); return idx.length ? idx : item.ev.candidates.map((c, i) => i); };
const idxOfKey = (item, key) => item.ev.candidates.findIndex((c) => c.key === key);
const byKey = (keyFn) => (item) => { const k = keyFn(item); if (k === null || k === undefined) return null; const i = idxOfKey(item, k); return i >= 0 ? { idx: [i] } : { keys: [k] }; };
const CONTROLS = {
  UNIFORM_AMONG_ZERO_COST: (item) => ({ idx: item.ev.candidates.map((c, i) => i) }),
  LOWEST_ACTION_ID: (item) => { const ks = item.ev.candidates.map((c) => c.key); return { idx: [ks.indexOf([...ks].sort()[0])] }; },
  HIGHEST_ACTION_ID: (item) => { const ks = item.ev.candidates.map((c) => c.key); return { idx: [ks.indexOf([...ks].sort().at(-1))] }; },
  FIXED_DIRECTION_EAST: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.dir === 'EAST') }),
  FIXED_DIRECTION_NORTH: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.dir === 'NORTH') }),
  FIXED_DIRECTION_SOUTH: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.dir === 'SOUTH') }),
  FIXED_DIRECTION_WEST: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.dir === 'WEST') }),
  HIDDEN_BASE_EAST: (item) => ({ idx: idxWhere(item, (c) => c.type === 'MOVE' && c.hidden[0] === 1) }),
};
const POLICIES = {
  RESOURCE_PRESERVING_V1: byKey((item) => item.row.policies.RESOURCE_PRESERVING_V1),
  RESOURCE_ID_REVERSED: byKey((item) => item.ev.resourceIdReversed),
  NEXUS_SELECTOR_V1: byKey((item) => item.row.policies.NEXUS_SELECTOR_V1),
};
const REFERENCES = {
  GREEDY: byKey((item) => item.row.policies.GREEDY),
  ONE_STEP_ZERO_COST: (item) => { const is = item.ev.candidates.map((c) => c.i); return { idx: topSet(is) }; },
};
const HEURISTICS = {
  NON_WAIT_UNIFORM: (item) => ({ idx: idxWhere(item, (c) => c.type !== 'WAIT') }),
  RETREAT_ALIGNED: (item) => (item.ev.candidates.some((c) => c.type === 'RETREAT')
    ? { idx: idxWhere(item, (c) => c.type === 'RETREAT' || (c.type === 'MOVE' && c.blocks.CANDIDATE[0] === 1)) } : { idx: idxWhere(item, (c) => c.type === 'MOVE') }),
  TOWARD_CENTRE: (item) => ({ idx: idxWhere(item, (c) => (c.type === 'MOVE' || c.type === 'RETREAT') && c.blocks.GEOMETRY[0] < 0) }),
};
const modelStrategy = (model, spec) => (item) => { const { scores, probabilities } = scoreCandidates(model, columns(item, spec)); return { idx: topSet(scores), probs: probabilities }; };

function outcome(item, d) {
  if (d === null) return null;
  if (d.idx) return outcomeOf(item.ev.candidates, d.idx, d.probs ?? null);
  const a = d.keys.map((k) => item.row.actions[k]); const maxR = item.ev.candidates[0].maxR;
  return { hit: mean(a.map((x) => x.o)), regret: mean(a.map((x) => x.r)), nreg: mean(a.map((x) => (maxR > 0 ? x.r / maxR : 0))), catastrophic: mean(a.map((x) => (x.r >= 100 ? 1 : 0))) };
}
function summarize(outs) {
  const c = outs.filter((o) => o !== null); const probabilistic = c.length && c[0].pOptimal !== undefined;
  return { n: outs.length, coverage: outs.length ? c.length / outs.length : null, top1: mean(c.map((o) => o.hit)), regret: mean(c.map((o) => o.regret)),
    normalizedRegret: mean(c.map((o) => o.nreg)), catastrophicRate: mean(c.map((o) => o.catastrophic)),
    ...(probabilistic ? { pOptimalSet: mean(c.map((o) => o.pOptimal)), crossEntropy: mean(c.map((o) => o.crossEntropy)), brier: mean(c.map((o) => o.brier)),
      ece: ece10(c.map((o) => ({ p: o.confidence, y: o.hit }))), meanConfidence: mean(c.map((o) => o.confidence)) } : {}) };
}
function compare(outA, outB, label) {
  const d = outA.map((a, i) => (a === null || outB[i] === null ? null : { h: a.hit - outB[i].hit, n: a.nreg - outB[i].nreg }));
  const w = d.map((x) => (x === null ? 0 : 1)); const p = bootstrapPlan(d.length, `STAGE3F6P1ASYM:${label}`);
  const diff = { n: w.reduce((a, b) => a + b, 0), top1Difference: mean(d.filter(Boolean).map((x) => x.h)), top1Ci95: bootstrapMean(p, d.map((x) => (x ? x.h : 0)), w),
    nregDifference: mean(d.filter(Boolean).map((x) => x.n)), nregCi95: bootstrapMean(p, d.map((x) => (x ? x.n : 0)), w) };
  return { ...diff, ...materialGain(diff) };
}

/* ============================================================== descriptives */
const costStructure = (item) => { const oz = item.ev.candidates.filter((c) => c.o).length; return oz === 1 ? 'UNIQUE_OPTIMAL_ZERO_COST' : 'MULTIPLE_OPTIMAL_ZERO_COST'; };
const mixed = (item) => Object.values(item.row.actions).some((a) => a.o === 1 && a.c > 0);
const optTypes = (item) => [...new Set(item.ev.candidates.filter((c) => c.o).map((c) => c.type))].sort().join('+');
const GROUPINGS = {
  candidateCount: (item) => String(item.ev.candidates.length), orientation: (item) => item.row.orientation, optimalTypes: optTypes,
  costStructure, mixedOptimalSet: (item) => (mixed(item) ? 'MIXED' : 'ZERO_COST_ONLY'), horizonClass: (item) => item.row.label.horizonClass,
  level: (item) => String(item.row.combination.level), topology: (item) => item.row.combination.shape,
};
const tally = (items, fn) => { const t = {}; for (const it of items) { const k = fn(it); t[k] = (t[k] ?? 0) + 1; } return Object.fromEntries(Object.entries(t).sort()); };
function population(rows, items) {
  return { rows: rows.length, eligible: items.length, eligibleShare: rows.length ? items.length / rows.length : null,
    UNIQUE_OPTIMAL_ZERO_COST: items.filter((i) => costStructure(i) === 'UNIQUE_OPTIMAL_ZERO_COST').length,
    MULTIPLE_OPTIMAL_ZERO_COST: items.filter((i) => costStructure(i) === 'MULTIPLE_OPTIMAL_ZERO_COST').length,
    MIXED_OPTIMAL_SET: items.filter(mixed).length, meanZeroCostCandidates: mean(items.map((i) => i.ev.candidates.length)),
    candidateTypes: tally(items.flatMap((i) => i.ev.candidates.map((c) => ({ c }))), (x) => x.c.type), ...Object.fromEntries(Object.entries(GROUPINGS).map(([k, fn]) => [k, tally(items, fn)])) };
}
function breakdowns(items, outsByStrategy) {
  return Object.fromEntries(Object.entries(GROUPINGS).map(([g, fn]) => {
    const groups = {}; items.forEach((it, i) => { const k = fn(it); (groups[k] ??= []).push(i); });
    return [g, Object.fromEntries(Object.entries(groups).sort().map(([k, idx]) => [k, { n: idx.length,
      ...Object.fromEntries(Object.entries(outsByStrategy).map(([s, outs]) => [s, mean(idx.map((i) => outs[i]).filter((o) => o !== null).map((o) => o.hit))])) }]))];
  }));
}

/* ============================================================== equivariance */
function equivariance(items, strategies) {
  let pairs = 0; let equal = 0; const perColumn = DEP_COLUMNS.map(() => 0);
  const pred = Object.fromEntries(Object.keys(strategies).map((k) => [k, { twins: 0, equal: 0 }]));
  for (const item of items) {
    if (item.ev.twinFeatures === null) continue;
    for (const transform of TWIN_TRANSFORMS) {
      const tf = item.ev.twinFeatures[transform]; const o = TRANSFORM_EQUIVALENT[transform];
      for (const c of item.ev.candidates) { pairs += 1; const t = tf[c.key]; if (t && JSON.stringify(t) === JSON.stringify(c.dep)) equal += 1; else if (t) t.forEach((v, j) => { if (v !== c.dep[j]) perColumn[j] += 1; }); else perColumn.forEach((_, j) => { perColumn[j] += 1; }); }
      if (item.ev.candidates.some((c) => !tf[c.key])) { for (const k of Object.keys(pred)) pred[k].twins += 1; continue; }
      const view = (c) => ({ ...c, blocks: split(tf[c.key]), abs: directionOneHot(c.dir === null ? null : orientDirection(o, c.dir)) });
      for (const [k, { model, spec }] of Object.entries(strategies)) {
        const base = topSet(scoreCandidates(model, columns(item, spec)).scores).join(',');
        const twin = topSet(scoreCandidates(model, columns(item, spec, view)).scores).join(',');
        pred[k].twins += 1; if (base === twin) pred[k].equal += 1;
      }
    }
  }
  return { featurePairs: pairs, FEATURE_EQUIVARIANCE: pairs ? equal / pairs : null, nonEquivariantColumns: DEP_COLUMNS.filter((_, j) => perColumn[j] > 0),
    ID_PERMUTATION_INVARIANCE: mean(items.map((i) => i.ev.idPermutationInvariant)),
    PREDICTION_EQUIVARIANCE: Object.fromEntries(Object.entries(pred).map(([k, v]) => [k, { twins: v.twins, rate: v.twins ? v.equal / v.twins : null }])) };
}

/* ============================================================== attribution */
function attribution(items, strategy, spec) {
  const w = Object.fromEntries(ERROR_CLASSES.map((k) => [k, 0])); const multi = { OBJECTIVE: 0, RESOURCE: 0, THREAT: 0, RELATIONAL: 0, MECHANISTIC: 0, DEPLOYABLY_DISTINGUISHABLE: 0 };
  let total = 0;
  const depOf = (c) => spec.main.filter((b) => ['TYPE', 'CANDIDATE', 'GEOMETRY'].includes(b)).flatMap((b) => BLOCK[b](c));
  for (const item of items) {
    const d = strategy(item); const top = new Set(d.idx); const hit = d.idx.reduce((a, i) => a + item.ev.candidates[i].o, 0) / d.idx.length;
    const weight = 1 - hit; if (weight <= 0) continue;
    const O = item.ev.candidates.filter((c) => c.o).map((c) => ({ dep: depOf(c), priv: c.priv, i: c.i }));
    const W = item.ev.candidates.filter((c, i) => top.has(i) && !c.o).map((c) => ({ dep: depOf(c), priv: c.priv, i: c.i }));
    const a = attributeError({ O, W, horizonDependent: item.row.label.horizonClass === 'HORIZON_DEPENDENT' });
    w[a.primary] += weight; total += weight;
    for (const g of a.separating) multi[g] += weight; if (a.mechanistic) multi.MECHANISTIC += weight; if (a.deployablyDistinguishable) multi.DEPLOYABLY_DISTINGUISHABLE += weight;
  }
  const share = (x) => (total > 0 ? x / total : null);
  return { weightedErrors: total, primaryShare: Object.fromEntries(Object.entries(w).map(([k, v]) => [k, share(v)])),
    PARTIAL_OBSERVABILITY: share(PARTIAL_OBSERVABILITY_CLASSES.reduce((a, k) => a + w[k], 0)), multiLabelIncidence: Object.fromEntries(Object.entries(multi).map(([k, v]) => [k, share(v)])) };
}

/* ============================================================== audit */
function aurocPooled(values, labels) {
  const idx = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const pos = labels.filter((y) => y === 1).length; const neg = labels.length - pos; if (!pos || !neg) return null;
  let rank = 0; let i = 0;
  while (i < idx.length) { let j = i; while (j < idx.length && values[idx[j]] === values[idx[i]]) j += 1; const avg = (i + 1 + j) / 2; for (let k = i; k < j; k += 1) if (labels[idx[k]] === 1) rank += avg; i = j; }
  const a = (rank - (pos * (pos + 1)) / 2) / (pos * neg); return Math.max(a, 1 - a);
}
function featureAudit(devItems, equivByPartition, allItems) {
  const cands = devItems.flatMap((i) => i.ev.candidates);
  const nonEq = new Set(Object.values(equivByPartition).flatMap((e) => e.nonEquivariantColumns));
  const idPerm = Object.values(equivByPartition).every((e) => e.ID_PERMUTATION_INVARIANCE === 1);
  const finite = DEP_COLUMNS.map((_, j) => allItems.every((i) => i.ev.candidates.every((c) => Number.isFinite(c.dep[j]))));
  return Object.fromEntries(CANDIDATE_FEATURE_INVENTORY.map((f) => {
    const j = DEP_COLUMNS.indexOf(f.id);
    if (j < 0 || f.class !== 'DEPLOYABLE') return [f.id, { declared: f.class, class: f.class, block: f.block, source: f.source }];
    const sep = aurocPooled(cands.map((c) => c.dep[j]), cands.map((c) => c.o));
    const flags = { NON_EQUIVARIANT: nonEq.has(f.id) || !idPerm, LEAKED: sep !== null && sep >= 0.99, UNAVAILABLE: !finite[j] };
    const failing = Object.entries(flags).filter(([, v]) => v).map(([k]) => k);
    return [f.id, { declared: f.class, class: failing[0] ?? 'DEPLOYABLE', block: f.block, source: f.source, devSeparability: sep, flags }];
  }));
}

/* ================================================================ open phase */
const corpus = readCorpus();
const DEV = prepare(corpus.filter((r) => r.partition === 'DEV'));
const CAL = prepare(corpus.filter((r) => r.partition === 'CAL'));
function openPhase() {
  const fits = {}; const calEval = {};
  for (const [name, spec] of Object.entries(MODEL_SPECS)) {
    fits[name] = fitSpec(DEV, spec);
    calEval[name] = summarize(CAL.map((item) => outcome(item, modelStrategy(fits[name], spec)(item))));
  }
  const variants = Object.entries(MODEL_SPECS).filter(([, s]) => s.role === 'HEADLINE_CANDIDATE_VARIANT').map(([k, s]) => ({ k, top1: calEval[k].top1, cols: columnCount(s) }))
    .sort((a, b) => (Math.abs(b.top1 - a.top1) > 1e-9 ? b.top1 - a.top1 : a.cols - b.cols));
  const selected = variants[0].k; const selectedSpec = MODEL_SPECS[selected];
  const replay = modelHash(fitSpec(DEV, selectedSpec));
  for (const [name, d] of Object.entries(DIAGNOSTIC_SPECS)) fits[name] = fitSpec(DEV, diagSpec(selectedSpec, d.add));
  const specs = { ...MODEL_SPECS, ...Object.fromEntries(Object.entries(DIAGNOSTIC_SPECS).map(([k, d]) => [k, diagSpec(selectedSpec, d.add)])) };
  const strategiesOn = (items) => evaluateAll(items, fits, specs);
  const dev = strategiesOn(DEV); const cal = strategiesOn(CAL);
  const equiv = { DEV: equivariance(DEV, modelsFor(fits, specs)), CAL: equivariance(CAL, modelsFor(fits, specs)) };
  const report = roundDeep({
    schemaVersion: 1, stage: plan.stage, phase: 'OPEN', planHash: STAGE3F6P1ASYM_PLAN_HASH, representationHash: FREE_ACTION_REPRESENTATION_HASH,
    stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH, partitions: ['DEV', 'CAL'],
    population: { DEV: population(corpus.filter((r) => r.partition === 'DEV'), DEV), CAL: population(corpus.filter((r) => r.partition === 'CAL'), CAL) },
    featureAudit: featureAudit(DEV, equiv, [...DEV, ...CAL]),
    models: Object.fromEntries(Object.entries(fits).map(([k, m]) => [k, { modelHash: modelHash(m), columns: m.w.length, spec: specs[k], trainedGroups: m.trainedGroups }])),
    calSelection: { rule: plan.models.calSelection, ranking: variants, selected, replayHash: replay, deterministic: replay === modelHash(fits[selected]) },
    evidenceFidelity: fidelity([...DEV, ...CAL]),
    results: { DEV: dev.summary, CAL: cal.summary }, equivariance: equiv, noSealedRowScored: true,
  });
  return { report, fits, specs, selected };
}
function modelsFor(fits, specs) { return Object.fromEntries(Object.keys(fits).map((k) => [k, { model: fits[k], spec: specs[k] }])); }
function allStrategies(fits, specs) {
  return { ...CONTROLS, ...POLICIES, ...REFERENCES, ...HEURISTICS, ...Object.fromEntries(Object.keys(fits).map((k) => [k, modelStrategy(fits[k], specs[k])])) };
}
function evaluateAll(items, fits, specs) {
  const strategies = allStrategies(fits, specs);
  const outs = Object.fromEntries(Object.entries(strategies).map(([k, fn]) => [k, items.map((item) => outcome(item, fn(item)))]));
  return { outs, summary: Object.fromEntries(Object.entries(outs).map(([k, o]) => [k, summarize(o)])) };
}
const fidelity = (items) => ({ rows: items.length, world: mean(items.map((i) => i.ev.worldFidelity)), candidateSet: mean(items.map((i) => i.ev.candidateSetFidelity)),
  twinRows: items.filter((i) => i.ev.twinFeatures !== null).length });

const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  const r = open.report;
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: r.reportHash, selected: r.calSelection, population: { DEV: r.population.DEV.eligible, CAL: r.population.CAL.eligible },
    featureClasses: Object.fromEntries(Object.entries(r.featureAudit).map(([k, v]) => [k, v.class])), fidelity: r.evidenceFidelity,
    CAL: Object.fromEntries(Object.entries(r.results.CAL).map(([k, v]) => [k, v.top1])), equivariance: r.equivariance }, null, 2));
  process.exit(0);
}

/* ============================================================ confirmatory */
const openStored = readJson(OPEN_REPORT_PATH);
const openRecomputed = { ...open.report }; openRecomputed.reportHash = hex(JSON.stringify(open.report));
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const freshManifest = readJson(FRESH_MANIFEST_PATH);
const freshText = gunzipSync(readFileSync(at(FRESH_PATH))).toString('utf8');
const fresh = freshText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const tsym = readTsymFresh();
const SOURCE_ROWS = {
  FRESH_HOLDOUT: fresh.filter((r) => r.partition === 'FRESH_HOLDOUT'), FRESH_OOD: fresh.filter((r) => r.partition === 'FRESH_OOD'),
  TSYM_HOLDOUT: tsym.filter((r) => r.partition === 'FRESH_HOLDOUT'), TSYM_OOD: tsym.filter((r) => r.partition === 'FRESH_OOD'),
};
const EVAL = Object.fromEntries(Object.entries(SOURCE_ROWS).map(([k, rows]) => [k, prepare(rows)]));
const { fits, specs } = open; const B = openStored.calSelection.selected; const S = 'STATE_ONLY';
const models = modelsFor(fits, specs);
const DIAGS = Object.keys(DIAGNOSTIC_SPECS);
/** Shortcuts a deployed policy could actually exploit (identity order, absolute direction); oracle-only and leaked diagnostics are reported, not counted.
 * D_ABSOLUTE_DIRECTION extends the headline candidate spec, so it is compared with that model only. */
const SHORTCUT_CONTROLS = ['LOWEST_ACTION_ID', 'HIGHEST_ACTION_ID', 'FIXED_DIRECTION_EAST', 'FIXED_DIRECTION_NORTH', 'FIXED_DIRECTION_SOUTH', 'FIXED_DIRECTION_WEST'];
const shortcutsFor = (m) => (m === B ? [...SHORTCUT_CONTROLS, 'D_ABSOLUTE_DIRECTION'] : SHORTCUT_CONTROLS);
const BREAKDOWN_STRATEGIES = ['UNIFORM_AMONG_ZERO_COST', 'RESOURCE_PRESERVING_V1', 'RESOURCE_ID_REVERSED', S, B, 'D_PRIVILEGED_RELATIONS', 'D_ONE_STEP', 'D_HIDDEN_ORIENTATION', 'ONE_STEP_ZERO_COST'];

function groupGap(outs, items, inGroup, label) {
  const hits = outs.map((o) => (o === null ? null : o.hit)); const p = bootstrapPlan(items.length, `STAGE3F6P1ASYM:${label}`);
  const gapOf = (idx) => { let a = 0; let na = 0; let b = 0; let nb = 0; for (const i of idx) { if (hits[i] === null) continue; if (inGroup(items[i])) { a += hits[i]; na += 1; } else { b += hits[i]; nb += 1; } } return na && nb ? a / na - b / nb : null; };
  const stats = []; for (let r = 0; r < p.resamples; r += 1) { const g = gapOf(p.indices.subarray(r * p.n, (r + 1) * p.n)); if (g !== null) stats.push(g); }
  stats.sort((x, y) => x - y);
  return { gap: gapOf(items.map((_, i) => i)), ci95: [stats[Math.floor(0.025 * stats.length)], stats[Math.min(stats.length - 1, Math.ceil(0.975 * stats.length) - 1)]] };
}

const partitions = {};
for (const [name, items] of Object.entries(EVAL)) {
  const { outs, summary } = evaluateAll(items, fits, specs);
  const cmp = (a, b) => compare(outs[a], outs[b], `${name}:${a}-vs-${b}`);
  const comparisons = {};
  for (const m of [S, B, ...DIAGS, ...Object.keys(HEURISTICS), 'ONE_STEP_ZERO_COST']) { comparisons[`${m}_vs_UNIFORM`] = cmp(m, 'UNIFORM_AMONG_ZERO_COST'); comparisons[`${m}_vs_RESOURCE`] = cmp(m, 'RESOURCE_PRESERVING_V1'); }
  comparisons[`${B}_vs_${S}`] = cmp(B, S);
  for (const d of DIAGS) comparisons[`${d}_vs_${B}`] = cmp(d, B);
  for (const c of [...Object.keys(CONTROLS).filter((k) => k !== 'UNIFORM_AMONG_ZERO_COST'), 'RESOURCE_PRESERVING_V1', 'RESOURCE_ID_REVERSED']) comparisons[`${c}_vs_UNIFORM`] = cmp(c, 'UNIFORM_AMONG_ZERO_COST');
  comparisons.RESOURCE_vs_RESOURCE_ID_REVERSED = cmp('RESOURCE_PRESERVING_V1', 'RESOURCE_ID_REVERSED');
  for (const m of [S, B]) for (const c of shortcutsFor(m)) comparisons[`${c}_vs_${m}`] = cmp(c, m);
  const orient = Object.fromEntries(ORIENTATIONS.map((o) => { const idx = items.map((it, i) => (it.row.orientation === o ? i : -1)).filter((i) => i >= 0);
    const acc = (k) => mean(idx.map((i) => outs[k][i]).filter((x) => x !== null).map((x) => x.hit));
    return [o, { n: idx.length, UNIFORM: acc('UNIFORM_AMONG_ZERO_COST'), RESOURCE: acc('RESOURCE_PRESERVING_V1'), [S]: acc(S), [B]: acc(B), gainVsUniform: acc(B) - acc('UNIFORM_AMONG_ZERO_COST') }]; }));
  const overallGain = summary[B].top1 - summary.UNIFORM_AMONG_ZERO_COST.top1;
  partitions[name] = {
    population: population(SOURCE_ROWS[name], items), evidenceFidelity: fidelity(items), strategies: summary, comparisons,
    orientation: { perOrientation: orient, overallGain, STABLE: overallGain > 0 && Object.values(orient).every((o) => o.gainVsUniform >= 0.5 * overallGain) },
    resourceOrientationGap: groupGap(outs.RESOURCE_PRESERVING_V1, items, (it) => EAST_PRESERVING.includes(it.row.orientation), `${name}:resource-orientation-gap`),
    equivariance: equivariance(items, { [S]: models[S], [B]: models[B], D_ABSOLUTE_DIRECTION: models.D_ABSOLUTE_DIRECTION }),
    breakdowns: breakdowns(items, Object.fromEntries(BREAKDOWN_STRATEGIES.map((k) => [k, outs[k]]))),
    errorAttribution: { [B]: attribution(items, allStrategies(fits, specs)[B], specs[B]), [S]: attribution(items, allStrategies(fits, specs)[S], specs[S]) },
  };
}
const FH = partitions.FRESH_HOLDOUT; const FO = partitions.FRESH_OOD;

/* ================================================================ conclusions */
const allEquiv = ['FRESH_HOLDOUT', 'FRESH_OOD'].every((p) => partitions[p].equivariance.FEATURE_EQUIVARIANCE === 1 && partitions[p].equivariance.ID_PERMUTATION_INVARIANCE === 1);
const categoryOf = (m) => sufficiencyCategory({
  holdoutN: FH.population.eligible, oodN: FO.population.eligible,
  vsUniformHoldout: FH.comparisons[`${m}_vs_UNIFORM`], vsResourceHoldout: FH.comparisons[`${m}_vs_RESOURCE`],
  vsUniformOod: FO.comparisons[`${m}_vs_UNIFORM`], vsResourceOod: FO.comparisons[`${m}_vs_RESOURCE`],
  equivariant: allEquiv && ['FRESH_HOLDOUT', 'FRESH_OOD'].every((p) => partitions[p].equivariance.PREDICTION_EQUIVARIANCE[m].rate === 1)
    && (m !== B || FH.orientation.STABLE || !(FH.comparisons[`${m}_vs_UNIFORM`].MATERIAL)),
  top1Holdout: FH.strategies[m].top1,
  shortcutControlMaterial: shortcutsFor(m).some((c) => FH.comparisons[`${c}_vs_UNIFORM`].MATERIAL && FH.comparisons[`${c}_vs_${m}`].MATERIAL),
});
const categories = { STATE_ONLY: categoryOf(S), STATE_PLUS_CANDIDATE: categoryOf(B) };
const bCat = categories.STATE_PLUS_CANDIDATE.primary;
const sufficientB = bCat === 'REPRESENTATION_SUFFICIENT_POLICY_WEAK';
const diagGain = (d) => { const c = FH.comparisons[`${d}_vs_${B}`]; return c.top1Difference >= MATERIAL_TOP1_GAIN && c.top1Ci95[0] > 0; };
const ACTION_SEMANTICS_REQUIRED = !sufficientB && diagGain('D_PRIVILEGED_RELATIONS');
const TRANSITION_PREDICTION_REQUIRED = !sufficientB && diagGain('D_ONE_STEP');
const temporalShare = FH.errorAttribution[B].primaryShare.TEMPORAL ?? 0;
const resGap = FH.resourceOrientationGap;
const roadmap = {
  FREE_ACTION_DECISION_MEASURED: null,
  CURRENT_POLICY_SHORTCUT_CONFIRMED: FH.comparisons.RESOURCE_vs_RESOURCE_ID_REVERSED.top1Ci95[0] > 0 && resGap.gap >= 0.15 && resGap.ci95[0] > 0,
  DEPLOYABLE_STATE_SUFFICIENT: categories.STATE_ONLY.primary === 'REPRESENTATION_SUFFICIENT_POLICY_WEAK',
  DEPLOYABLE_CANDIDATE_REPRESENTATION_SUFFICIENT: sufficientB,
  POLICY_REPAIR_JUSTIFIED: ['REPRESENTATION_SUFFICIENT_POLICY_WEAK', 'REPRESENTATION_PARTIALLY_SUFFICIENT'].includes(bCat),
  PREDICTIVE_REPRESENTATION_REQUIRED: !sufficientB && (ACTION_SEMANTICS_REQUIRED || TRANSITION_PREDICTION_REQUIRED || temporalShare >= 0.25),
  ACTION_SEMANTICS_REQUIRED, TRANSITION_PREDICTION_REQUIRED,
  ROUTER_2_0_JUSTIFIED: false, READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false,
  STAGE3F_STATUS: 'OPEN (requalifications remaining: 3F.6-P.1, W, D)',
};

/* ================================================================ integrity */
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const git = (...a) => spawnSync('git', ['-C', repositoryRoot, ...a], { encoding: 'utf8' });
const freeze = (() => {
  const g = (r) => `platform/game-agnostic/${r}`;
  const planRepo = g(STAGE3F6P1ASYM_PLAN_PATH);
  const commits = git('log', '--format=%H', '--', planRepo).stdout.trim().split('\n').filter(Boolean);
  const commit = commits[0] ?? null;
  const history = [...commits].reverse().map((c) => { const files = git('show', '--name-only', '--format=', c).stdout.trim().split('\n').filter(Boolean);
    return { commit: c, planAndOpenReport: files.includes(planRepo) && files.includes(g(OPEN_REPORT_PATH)), noFreshOrResult: !files.some((f) => /stage3f6p1asym-free-action\/(fresh-confirmatory|stage3f6p1asym-certification-result)/.test(f)) }; });
  const generatedAt = freshManifest.generatedAtHead ?? null;
  const descends = generatedAt !== null && commit !== null && git('merge-base', '--is-ancestor', commit, generatedAt).status === 0;
  const evalChanged = generatedAt === null ? 'NO_GENERATION_COMMIT' : git('diff', '--name-only', generatedAt, '--', ...EVALUATION_FILES.map(g)).stdout.trim();
  const out = { freezeCommit: commit, history, planAndOpenReportInFreezeCommits: history.length > 0 && history.every((h) => h.planAndOpenReport),
    noFreshOrResultInFreezeCommits: history.every((h) => h.noFreshOrResult),
    planAndOpenReportAtHead: [STAGE3F6P1ASYM_PLAN_PATH, OPEN_REPORT_PATH].every((f) => headBytesHash(f) === hex(readFileSync(at(f)))),
    freshGeneratedAtHead: generatedAt, freshGeneratedAfterFreeze: descends, evaluationFilesUnchangedSinceGeneration: evalChanged === '' };
  out.FROZEN_BEFORE_FRESH_AND_SEALED = commit !== null && out.planAndOpenReportInFreezeCommits && out.noFreshOrResultInFreezeCommits && out.planAndOpenReportAtHead
    && out.freshGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const lineage = [...corpus, ...tsym];
const lineageSets = { record: new Set(lineage.map((r) => r.recordHash)), world: new Set(lineage.map((r) => r.worldHash)), topology: new Set(lineage.map((r) => r.topologyHash)) };
const freshEq = fresh.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const freshIntegrity = {
  contentHash: hex(freshText), contentBound: hex(freshText) === freshManifest.contentHash, planBound: freshManifest.planHash === STAGE3F6P1ASYM_PLAN_HASH,
  counts: Object.fromEntries(Object.keys(FRESH_SPEC).map((p) => [p, SOURCE_ROWS[p].length])), stats: freshManifest.stats,
  seedAudit: seedAudit(lineage),
  overlapWithLineage: Object.fromEntries(Object.entries(lineageSets).map(([k, set]) => [k, fresh.filter((r) => set.has(r[`${k}Hash`])).length])),
  internalDuplicates: Object.fromEntries(['record', 'world', 'topology'].map((k) => [k, fresh.length - new Set(fresh.map((r) => r[`${k}Hash`])).size])),
  levels: Object.fromEntries(Object.keys(FRESH_SPEC).map((p) => [p, [...new Set(SOURCE_ROWS[p].map((r) => r.combination.level))].sort()])),
  equivarianceChecks: freshEq.length, SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, mean(freshEq.map((x) => (x[k] === 1 ? 1 : 0)))])),
  benchmarkBound: JSON.stringify(freshManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
  tsymFreshBound: readJson(TSYM_FRESH_MANIFEST_PATH).contentHash === plan.predecessors.tsymFreshContentHash,
};
const allItems = [...DEV, ...CAL, ...Object.values(EVAL).flat()];
const metricVerification = {
  uniformIsExactExpectation: Object.values(EVAL).every((items) => items.every((it) => Math.abs(outcome(it, CONTROLS.UNIFORM_AMONG_ZERO_COST(it)).hit - it.ev.candidates.filter((c) => c.o).length / it.ev.candidates.length) < 1e-12)),
  hitsBounded: Object.values(partitions).every((p) => Object.values(p.strategies).every((s) => s.top1 === null || (s.top1 >= 0 && s.top1 <= 1))),
  everyEligibleHasOptimalCandidate: allItems.every((it) => it.ev.candidates.some((c) => c.o === 1)),
  resourceAlwaysZeroCost: allItems.every((it) => idxOfKey(it, it.row.policies.RESOURCE_PRESERVING_V1) >= 0),
  evidenceFidelity: allItems.every((it) => it.ev.worldFidelity === 1 && it.ev.candidateSetFidelity === 1),
};
const libSource = readFileSync(at('src/stage3f/free-action-sufficiency-v1.js'), 'utf8');
const derivation = libSource.slice(libSource.indexOf('export function deriveDeployableCandidates'), libSource.indexOf('/** State-level fields'));
const selfSource = readFileSync(at('scripts/certify-stage3f6p1asym-free-action.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const staticAudit = {
  HEADLINE_SPECS_DEPLOYABLE_ONLY: Object.values(MODEL_SPECS).every((s) => [...s.main, ...s.interact].every((b) => ['TYPE', 'CANDIDATE', 'GEOMETRY'].includes(b))),
  DERIVATION_READS_NO_PRIVILEGED_STATE: !/world|\.position|entities|immediateScalar|\.i\b|regret|orientation|canonicalOrientation/.test(derivation),
  FITS_ON_DEV_ONLY: [...selfSource.matchAll(/fitSpec\(([A-Z]+),/g)].every((m) => m[1] === 'DEV'),
  NO_DEEP_OR_WORLD_MODEL: !/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(selfSource + libSource),
};
let predecessorChecks = { skipped: true };
if (!skipPredecessors) {
  const run = (s) => { const r = spawnSync(process.execPath, [s, '--check'], { cwd: root, encoding: 'utf8' }); try { return r.status === 0 && JSON.parse(r.stdout).reproduced === true; } catch { return false; } };
  predecessorChecks = { stage3f6p1c: run('scripts/certify-stage3f6p1c-symmetric-benchmark.mjs'), stage3f6p1d: run('scripts/certify-stage3f6p1d-symmetric-corpus.mjs'),
    stage3f6p1e: run('scripts/certify-stage3f6p1e-policy-requalification.mjs'), stage3f6tsym: run('scripts/certify-stage3f6tsym-router-value.mjs') };
}
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const r = spawnSync(process.execPath, ['--test', 'tests/stage3f6p1asym-free-action.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = r.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const planFile = readJson(STAGE3F6P1ASYM_PLAN_PATH);
const checks = {
  PREDECESSORS_REPRODUCE: skipPredecessors || Object.values(predecessorChecks).every(Boolean),
  PLAN_BOUND: planFile.planHash === STAGE3F6P1ASYM_PLAN_HASH,
  REPRESENTATION_BOUND: planFile.representationHash === FREE_ACTION_REPRESENTATION_HASH && openStored.representationHash === FREE_ACTION_REPRESENTATION_HASH,
  STATE_FEATURES_BOUND: planFile.stateFeaturesHash === STAGE3F6P1ASYM_STATE_FEATURES_HASH && openStored.stateFeaturesHash === STAGE3F6P1ASYM_STATE_FEATURES_HASH,
  CORPUS_BOUND: readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').contentHash === plan.predecessors.corpusContentHash,
  FROZEN_BEFORE_FRESH_AND_SEALED: freeze.FROZEN_BEFORE_FRESH_AND_SEALED,
  OPEN_PHASE_REPRODUCED,
  FIT_DETERMINISTIC: openStored.calSelection.deterministic === true,
  HEADLINE_FEATURES_ALL_DEPLOYABLE: Object.values(openStored.featureAudit).filter((f) => f.declared === 'DEPLOYABLE' && f.block !== 'NONE').every((f) => f.class === 'DEPLOYABLE'),
  FRESH_INTEGRITY: freshIntegrity.contentBound && freshIntegrity.planBound && freshIntegrity.benchmarkBound && freshIntegrity.tsymFreshBound
    && Object.values(freshIntegrity.overlapWithLineage).every((v) => v === 0) && Object.values(freshIntegrity.internalDuplicates).every((v) => v === 0)
    && Object.values(freshIntegrity.seedAudit).every((s) => s.declaredForPartition && !s.usedByLineage && !s.inPriorConsumed)
    && Object.keys(FRESH_SPEC).every((p) => freshIntegrity.counts[p] === FRESH_SPEC[p].n),
  FRESH_SYMMETRY_INTACT: freshIntegrity.equivarianceChecks > 0 && Object.values(freshIntegrity.SYMMETRY_CHECKS).every((v) => v === 1),
  METRICS_VERIFIED: Object.values(metricVerification).every(Boolean),
  STATIC_AUDIT: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: plan.authority.tier === 'R0' && !plan.authority.canDispatch && !plan.authority.canMutateLiveWorld && !plan.authority.onlineLearningEnabled && !plan.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
roadmap.FREE_ACTION_DECISION_MEASURED = status === 'PASS';
const payload = roundDeep({
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1ASYM_PLAN_HASH, representationHash: FREE_ACTION_REPRESENTATION_HASH,
  stateFeaturesHash: STAGE3F6P1ASYM_STATE_FEATURES_HASH, openPhaseReportHash: openStored.reportHash, freeze, predecessorChecks,
  data: { benchmarkId: 'FORGE_SYMMETRIC_V2', corpusContentHash: plan.predecessors.corpusContentHash, fresh: freshIntegrity },
  featureAudit: featureAudit(DEV, { ...openStored.equivariance, ...Object.fromEntries(Object.entries(partitions).map(([k, v]) => [k, v.equivariance])) }, allItems),
  models: openStored.models, calSelection: openStored.calSelection,
  headline: { STATE_ONLY: S, STATE_PLUS_CANDIDATE: B }, partitions, categories, roadmap,
  diagnosticGains: Object.fromEntries(DIAGS.map((d) => [d, FH.comparisons[`${d}_vs_${B}`]])),
  metricVerification, staticAudit,
  disclosures: {
    LEVEL_COVERAGE: 'canonical admission order: FRESH_HOLDOUT covers the low curriculum levels in data.fresh.levels; DEV/CAL cover levels 0-1',
    TSYM_PARTITIONS: plan.partitions.TSYM_HOLDOUT,
    STATE_ONLY_DEFINITION: plan.models.stateOnly,
    NO_ABSTENTION: 'no scorer abstains; abstention is not measured',
  },
  checks, tests: testMetrics, authority: plan.authority,
  scope: { newOwners: ['scripts/stage3f6p1asym-analysis-plan.mjs', 'scripts/generate-stage3f6p1asym-confirmatory.mjs', 'scripts/stage3f6p1asym-evidence.mjs',
    'scripts/certify-stage3f6p1asym-free-action.mjs', 'src/stage3f/free-action-sufficiency-v1.js', 'tests/stage3f6p1asym-free-action.test.js'],
  existingOwnersModified: ['package.json', '.gitignore'], policiesModified: false, expertsAdded: false, routerModified: false, stage3gStarted: false },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1ASYM_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, { primary: v.primary, secondary: v.secondary }])), roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
