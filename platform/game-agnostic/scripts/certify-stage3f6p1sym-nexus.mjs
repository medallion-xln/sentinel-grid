#!/usr/bin/env node
/* STAGE_3F_6_P_1_SYM — NEXUS REMEDIATION SYMMETRIC REQUALIFICATION certification.
 *
 * Requalification only. Re-tests the historical Stage 3F.6-P.1 claims on a newly declared sealed seed space, separates
 * nuisance (orientation / identity / order) effects from relational effects, and distinguishes Nexus policy logic from
 * missing input with predeclared linear diagnostic scorers (deployable vs privileged kernel geometry, diagnostic only).
 *
 *   --phase=open   DEV/CAL only: fits the diagnostic scorers on DEV, fixes the DEV regime cut points, writes the report.
 *   (default)      requires the committed open report (recomputed byte for byte) and the fresh partitions.
 *   --check        recomputes everything and requires a byte-identical certification.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCORERS, STAGE3F6P1SYM_OUT, STAGE3F6P1SYM_PLAN, STAGE3F6P1SYM_PLAN_HASH, STAGE3F6P1SYM_PLAN_PATH, STAGE3F6P1SYM_POLICIES, STAGE3F6P1SYM_POLICY_HASH,
  STAGE3F6P1SYM_SEED_PLAN, STAGE3F6P1SYM_SEED_PLAN_HASH, POLICY_SOURCES,
} from './stage3f6p1sym-analysis-plan.mjs';
import { EVALUATION_FILES, FRESH_MANIFEST_PATH, FRESH_PARTITIONS, FRESH_PATH, OPEN_REPORT_PATH, readPriorLineage, seedAudit } from './generate-stage3f6p1sym-confirmatory.mjs';
import { nexusEvidence } from './stage3f6p1sym-evidence.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { NEXUS_V2_CANDIDATE_HASH } from '../src/stage3f/nexus-selector-v2-candidate.js';
import { bootstrapMean, bootstrapPlan, factorGap, pairedFlag } from '../src/stage3f/policy-requalification-v1.js';
import { ece10, fitCandidateLogit, materialGain, modelHash, outcomeOf, scoreCandidates, topSet } from '../src/stage3f/free-action-sufficiency-v1.js';
import { CANDIDATE_SCHEMA_HASH, DEPLOYABLE_BLOCKS, ENTITY_KINDS, claimVerdict, nexusClassification, vectorOf } from '../src/stage3f/nexus-requalification-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const RESULT = `${STAGE3F6P1SYM_OUT}/stage3f6p1sym-certification-result.json`;
const plan = STAGE3F6P1SYM_PLAN;
const V1 = 'NEXUS_SELECTOR_V1'; const V2 = 'NEXUS_SELECTOR_V2_CANDIDATE'; const RES = 'RESOURCE_PRESERVING_V1'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';
const POLICIES = [V1, V2, RES, OBJ, THR, 'RANDOM_LEGAL_V1', 'GREEDY'];
const NEXUS = [V1, V2];
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (l, fn) => (l.length ? l.filter(fn).length / l.length : null);
const dist = (values) => { const c = {}; for (const v of values) c[v] = (c[v] ?? 0) + 1; return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, n]) => [k, round(n / values.length)])); };

/* ================================================================== items */
function item(row) {
  const ev = nexusEvidence(row);
  const maxR = Math.max(...Object.values(row.actions).map((a) => a.r));
  const cands = ev.candidates.map((c) => ({ ...c, maxR, blocks: { ...c.dep, ...c.priv, ONESTEP: [c.i] } }));
  const choice = Object.fromEntries(POLICIES.map((p) => [p, row.policies[p] ?? null]));
  return { row, ev, cands, choice, maxR, core: row.core, orientation: row.orientation, combination: row.combination, label: row.label,
    uniform: mean(cands.map((c) => c.o)), zeroCostOptimal: cands.some((c) => c.o === 1 && c.t && ['MOVE', 'WAIT', 'RETREAT', 'COLLECT'].includes(c.t)) };
}
const outcomeKey = (it, k) => { if (k === null) return null; const c = it.row.actions[k]; return { hit: c.o, regret: c.r, nreg: it.maxR > 0 ? c.r / it.maxR : 0, catastrophic: c.r >= 100 ? 1 : 0, key: k }; };

/* ================================================================== scorers */
const specX = (it, spec) => it.cands.map((c) => vectorOf(c.blocks, SCORERS[spec].blocks));
function fitScorers(dev) {
  return Object.fromEntries(Object.keys(SCORERS).map((spec) => [spec, fitCandidateLogit(dev.map((it) => ({ X: specX(it, spec), y: it.cands.map((c) => c.o) })))]));
}
const scorerMemo = new Map();
function scorerOutcome(model, spec, it) {
  const memo = scorerMemo.get(spec) ?? new WeakMap(); scorerMemo.set(spec, memo);
  if (memo.has(it) && memo.get(it).model === model) return memo.get(it).out;
  const out = scorerOutcomeUncached(model, spec, it); memo.set(it, { model, out }); return out;
}
function scorerOutcomeUncached(model, spec, it) {
  const { scores, probabilities } = scoreCandidates(model, specX(it, spec));
  const chosen = topSet(scores);
  const o = outcomeOf(it.cands, chosen, probabilities);
  return { ...o, chosenTypes: chosen.map((i) => it.cands[i].t), chosen: chosen.map((i) => it.cands[i].key) };
}

/* ================================================================== open phase */
const corpus = readCorpus();
const DEV = corpus.filter((r) => r.partition === 'DEV').map(item);
const CAL = corpus.filter((r) => r.partition === 'CAL').map(item);
const quantile50 = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(0.5 * s.length) - 1)]; };
const T = { graphDensityMedian: quantile50(DEV.map((it) => it.core['relational.graphDensity'])) };
const models = fitScorers(DEV);
const replay = modelHash(fitCandidateLogit(DEV.map((it) => ({ X: specX(it, 'NX_DEPLOYABLE'), y: it.cands.map((c) => c.o) }))));
function describe(items) {
  const pol = Object.fromEntries(POLICIES.map((p) => { const o = items.map((it) => outcomeKey(it, it.choice[p])).filter(Boolean);
    return [p, { n: o.length, top1: mean(o.map((x) => x.hit)), nreg: mean(o.map((x) => x.nreg)) }]; }));
  const sc = Object.fromEntries(Object.keys(SCORERS).map((s) => { const o = items.map((it) => scorerOutcome(models[s], s, it));
    return [s, { n: o.length, top1: mean(o.map((x) => x.hit)), nreg: mean(o.map((x) => x.nreg)) }]; }));
  return { policies: pol, scorers: sc, uniform: mean(items.map((it) => it.uniform)) };
}
function openReport() {
  return roundDeep({
    schemaVersion: 1, stage: plan.stage, phase: 'OPEN', planHash: STAGE3F6P1SYM_PLAN_HASH, seedPlanHash: STAGE3F6P1SYM_SEED_PLAN_HASH, policyHash: STAGE3F6P1SYM_POLICY_HASH,
    candidateSchemaHash: CANDIDATE_SCHEMA_HASH, partitions: ['DEV', 'CAL'], devThresholds: T,
    scorers: Object.fromEntries(Object.entries(models).map(([s, m]) => [s, { modelHash: modelHash(m), columns: m.w.length, trainedGroups: m.trainedGroups }])),
    fitDeterministic: replay === modelHash(models.NX_DEPLOYABLE),
    evidenceFidelity: fidelity([...DEV, ...CAL]),
    descriptive: { DEV: describe(DEV), CAL: describe(CAL) }, noSealedRowScored: true,
  });
}
function fidelity(items) {
  const f = (k) => rate(items, (it) => it.ev.fidelity[k] === 1);
  const tw = items.filter((it) => it.ev.twinFeatures !== null).flatMap((it) => Object.values(it.ev.twinFeatures));
  return { world: f('world'), surface: f('surface'), choices: f('choices'), candidateSet: f('candidateSet'), twinRows: items.filter((it) => it.ev.twinFeatures !== null).length,
    deployableFeatureEquivariance: rate(tw, (x) => x.depEqual === 1), privilegedFeatureEquivariance: rate(tw, (x) => x.privEqual === 1), nexusReasonEquivariance: rate(tw, (x) => x.reasonSame === 1) };
}
const open = openReport();
if (phaseOpen) {
  open.reportHash = hex(JSON.stringify(open));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(open, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: open.reportHash, fitDeterministic: open.fitDeterministic, evidenceFidelity: open.evidenceFidelity, devThresholds: T,
    descriptive: open.descriptive }, null, 2));
  process.exit(0);
}

/* ================================================================== confirmatory */
const openStored = readJson(OPEN_REPORT_PATH);
const openRecomputed = { ...open, reportHash: hex(JSON.stringify(open)) };
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const freshManifest = readJson(FRESH_MANIFEST_PATH);
const freshText = gunzipSync(readFileSync(at(FRESH_PATH))).toString('utf8');
const fresh = freshText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PARTS = Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, fresh.filter((r) => r.partition === p).map(item)]));
const [PH, PO] = Object.keys(FRESH_PARTITIONS);

/** Paired comparison; aHit/bHit return a per-item { hit, nreg } or null (excluded). */
function paired(items, a, b, label) {
  const d = items.map((it) => { const x = a(it); const y = b(it); return x && y ? { h: x.hit - y.hit, n: x.nreg - y.nreg } : null; });
  const w = d.map((x) => (x === null ? 0 : 1)); const p = bootstrapPlan(items.length, `STAGE3F6P1SYM:${label}`);
  const valid = d.filter(Boolean);
  const diff = { n: valid.length, top1Difference: mean(valid.map((x) => x.h)), top1Ci95: valid.length ? bootstrapMean(p, d.map((x) => (x ? x.h : 0)), w) : null,
    nregDifference: mean(valid.map((x) => x.n)), nregCi95: valid.length ? bootstrapMean(p, d.map((x) => (x ? x.n : 0)), w) : null };
  return { ...diff, ...materialGain(diff) };
}
const pol = (p) => (it) => outcomeKey(it, it.choice[p]);
const sco = (s) => (it) => scorerOutcome(models[s], s, it);
const uni = (it) => ({ hit: it.uniform, nreg: mean(it.cands.map((c) => (it.maxR > 0 ? c.r / it.maxR : 0))) });
const permutedMean = (p) => (it) => { if (it.choice[p] === null) return null; const o = it.ev.idPermuted.map((perm) => outcomeKey(it, perm[p] ?? it.choice[p]));
  return { hit: mean(o.map((x) => x.hit)), nreg: mean(o.map((x) => x.nreg)) }; };
const onProposing = (p, f) => (it) => (it.choice[p] === null ? null : f(it));

function strategyMetrics(items, f, typesOf) {
  const o = items.map((it) => ({ it, x: f(it) })).filter((e) => e.x !== null);
  const typed = typesOf ? o.map((e) => typesOf(e.it)).filter(Boolean) : [];
  return { n: items.length, proposingN: o.length, coverage: o.length / items.length, top1: mean(o.map((e) => e.x.hit)), meanRegret: mean(o.map((e) => e.x.regret ?? null).filter((v) => v !== null)),
    normalizedRegret: mean(o.map((e) => e.x.nreg)), catastrophicRate: mean(o.map((e) => e.x.catastrophic ?? 0)), actionTypes: typed.length ? dist(typed) : null };
}
const chosenAction = (it, p) => (it.choice[p] === null ? null : it.row.actions[it.choice[p]]);
const optimalTypes = (it) => new Set(it.cands.filter((c) => c.o === 1).map((c) => c.t));
function behaviour(items, p) {
  const acting = items.filter((it) => it.choice[p] !== null);
  const typeOk = acting.filter((it) => optimalTypes(it).has(chosenAction(it, p).t));
  const kindOf = (it) => { const c = it.cands.find((x) => x.key === it.choice[p]); if (!c || c.target === null) return 'NONE';
    const i = c.dep.TARGET.slice(1, 1 + ENTITY_KINDS.length).indexOf(1); return i === -1 ? 'UNKNOWN' : ENTITY_KINDS[i]; };
  const protect = acting.filter((it) => chosenAction(it, p).t === 'PROTECT'); const retreat = acting.filter((it) => chosenAction(it, p).t === 'RETREAT');
  const moves = acting.filter((it) => chosenAction(it, p).t === 'MOVE');
  return {
    proposingN: acting.length, typeAccuracy: rate(acting, (it) => optimalTypes(it).has(chosenAction(it, p).t)), targetAccuracyGivenCorrectType: rate(typeOk, (it) => chosenAction(it, p).o === 1),
    actionTypes: dist(acting.map((it) => chosenAction(it, p).t)), targetKinds: dist(acting.map(kindOf)),
    protect: { selectionRate: protect.length / (acting.length || 1), precision: rate(protect, (it) => chosenAction(it, p).o === 1), optimalRate: rate(acting, (it) => it.cands.some((c) => c.t === 'PROTECT' && c.o === 1)) },
    retreat: { selectionRate: retreat.length / (acting.length || 1), precision: rate(retreat, (it) => chosenAction(it, p).o === 1) },
    zeroCostChoiceRate: rate(acting, (it) => chosenAction(it, p).c === 0), zeroCostOptimalRate: rate(acting, (it) => it.zeroCostOptimal),
    moveDirectionShare: dist(moves.map((it) => chosenAction(it, p).dir)),
    protectRegretShare: (() => { const tot = acting.reduce((s, it) => s + chosenAction(it, p).r, 0); return tot ? protect.reduce((s, it) => s + chosenAction(it, p).r, 0) / tot : null; })(),
    agreementWith: Object.fromEntries([RES, 'GREEDY', V1, V2].filter((q) => q !== p).map((q) => [q, rate(acting, (it) => it.choice[q] === it.choice[p])])),
  };
}
function shortcutAudit(items, p) {
  const acting = items.filter((it) => it.choice[p] !== null);
  const byLevel = (fn) => { const lv = {}; for (const it of acting) { const l = fn(it); if (l === null) continue; lv[l] ??= { n: 0, c: 0 }; lv[l].n += 1; lv[l].c += chosenAction(it, p).o; }
    return Object.fromEntries(Object.entries(lv).sort().map(([k, v]) => [k, { n: v.n, accuracy: v.c / v.n }])); };
  const orient = byLevel((it) => it.orientation); const direction = byLevel((it) => (chosenAction(it, p).t === 'MOVE' ? chosenAction(it, p).dir : null));
  const permHit = (it) => mean(it.ev.idPermuted.map((perm) => it.row.actions[perm[p] ?? it.choice[p]].o));
  const revHit = (it) => it.row.actions[it.ev.idReversed[p] ?? it.choice[p]].o;
  const twinRows = acting.filter((it) => it.ev.twins !== null);
  const twinPairs = twinRows.flatMap((it) => Object.values(it.ev.twins).map((t) => ({ it, k: t[p] })));
  const twinHit = (it) => mean(Object.values(it.ev.twins).map((t) => (t[p] === null ? 0 : it.row.actions[t[p]].o)));
  const targeted = acting.filter((it) => chosenAction(it, p).target !== null);
  const out = {
    ORIENTATION: { levels: orient, ...factorGap(orient) }, ABSOLUTE_DIRECTION: { levels: direction, ...factorGap(direction) },
    ACTION_ID_ORDER: { accuracy: mean(acting.map((it) => chosenAction(it, p).o)), permutedMeanAccuracy: mean(acting.map(permHit)), reversedAccuracy: mean(acting.map(revHit)),
      ACTION_ID_PERMUTATION_DELTA: mean(acting.map((it) => chosenAction(it, p).o - permHit(it))), choiceChangedByAnyPermutation: rate(acting, (it) => it.ev.idPermuted.some((perm) => perm[p] !== it.choice[p])),
      versusPermuted: pairedFlag(acting.map((it) => chosenAction(it, p).o - permHit(it))), versusReversed: pairedFlag(acting.map((it) => chosenAction(it, p).o - revHit(it))) },
    TARGET_ID_ORDER: { targetedChoices: targeted.length, targetChangedByPermutation: rate(targeted, (it) => it.ev.idPermuted.some((perm) => perm[p] !== null && it.row.actions[perm[p]].target !== chosenAction(it, p).target)) },
    D4_TWIN: { rows: twinRows.length, pairs: twinPairs.length, TOP1_EQUIVARIANCE: rate(twinPairs, (x) => x.k === x.it.choice[p]),
      TARGET_EQUIVARIANCE: rate(twinPairs.filter((x) => chosenAction(x.it, p).target !== null), (x) => x.k !== null && x.it.row.actions[x.k].target === chosenAction(x.it, p).target),
      paired: pairedFlag(twinRows.map((it) => chosenAction(it, p).o - twinHit(it))) },
    CANDIDATE_SHUFFLE: { changedRate: rate(acting, (it) => it.ev.shuffleChoices[p] !== it.choice[p]) },
  };
  out.ACTION_ID_ORDER.flag = out.ACTION_ID_ORDER.versusPermuted.flag || out.ACTION_ID_ORDER.versusReversed.flag;
  out.D4_TWIN.flag = out.D4_TWIN.paired.flag;
  return out;
}

/* regimes: observed (deployable definitions) and oracle (diagnostic) */
const targetsKind = (it, pred) => it.cands.some((c) => c.target !== null && pred(c));
const REGIMES = {
  observed: {
    HOSTILE_PRESENT: (it) => it.core['relational.hostileEntityCount'] > 0, UNSUPPORTED_THREAT: (it) => it.core['relational.unsupportedThreatenedCount'] > 0,
    DEPENDENCY: (it) => it.core['relational.criticalDependencyCount'] > 0 || it.core['relational.unresolvedDependencyCount'] > 0,
    MULTI_ENTITY_DEPENDENCY: (it) => it.core['relational.maxDependents'] >= 2,
    DENSE_RELATIONAL: (it) => it.core['relational.graphDensity'] > openStored.devThresholds.graphDensityMedian, SPARSE_RELATIONAL: (it) => it.core['relational.graphDensity'] <= openStored.devThresholds.graphDensityMedian,
    OBJECTIVE_RELATION: (it) => it.choice[OBJ] !== null, RESOURCE_RELATION: (it) => targetsKind(it, (c) => c.dep.TARGET[1 + ENTITY_KINDS.indexOf('RESOURCE')] === 1),
    PROTECT_LEGAL: (it) => it.cands.some((c) => c.t === 'PROTECT'), THREAT_DRIVEN: (it) => it.ev.nexusReason === 'THREAT_DRIVEN_PREFERENCE',
  },
  oracle: {
    COSTLY_ACTION_OPTIMAL: (it) => !it.cands.some((c) => c.o === 1 && ['MOVE', 'WAIT', 'RETREAT', 'COLLECT'].includes(c.t)),
    PROTECT_OPTIMAL: (it) => it.cands.some((c) => c.t === 'PROTECT' && c.o === 1), TARGETED_ACTION_OPTIMAL: (it) => it.cands.some((c) => c.target !== null && c.o === 1),
  },
};
function regimeTable(items, label) {
  const out = {};
  for (const [kind, defs] of Object.entries(REGIMES)) for (const [name, fn] of Object.entries(defs)) {
    const sub = items.filter(fn);
    out[name] = { kind, n: sub.length, uniform: mean(sub.map((it) => it.uniform)),
      policies: Object.fromEntries([V1, V2, RES, OBJ, THR].map((p) => { const a = sub.filter((it) => it.choice[p] !== null); return [p, { n: a.length, top1: mean(a.map((it) => chosenAction(it, p).o)) }]; })),
      scorers: Object.fromEntries(['NX_RELATIONAL_ONLY', 'NX_DEPLOYABLE', 'NX_PRIVILEGED'].map((s) => [s, mean(sub.map((it) => sco(s)(it).hit))])),
      relational: Object.fromEntries(NEXUS.map((p) => [p, { vsUniform: paired(sub, onProposing(p, pol(p)), onProposing(p, uni), `${label}:${name}:${p}:uni`),
        vsResource: paired(sub, onProposing(p, pol(p)), onProposing(p, pol(RES)), `${label}:${name}:${p}:res`) }])) };
  }
  return out;
}
/* oracle over a member set; returns per-item { hit, nreg, bestMembers } */
function oracle(items, members) {
  return items.map((it) => { const av = members.filter((m) => it.choice[m] !== null); if (!av.length) return null;
    const best = Math.min(...av.map((m) => chosenAction(it, m).r)); return { hit: best === 0 ? 1 : 0, nreg: it.maxR > 0 ? best / it.maxR : 0, best: av.filter((m) => chosenAction(it, m).r === best) }; });
}
function marginal(items, p) {
  const withP = oracle(items, [RES, OBJ, THR, p]); const without = oracle(items, [RES, OBJ, THR]);
  const bestRows = items.filter((it, i) => withP[i] && withP[i].best.includes(p));
  return { oracleTop1: mean(withP.filter(Boolean).map((x) => x.hit)), oracleWithoutTop1: mean(without.filter(Boolean).map((x) => x.hit)),
    marginalAccuracyGain: mean(withP.filter(Boolean).map((x) => x.hit)) - mean(without.filter(Boolean).map((x) => x.hit)), accuracyWhenBest: mean(bestRows.map((it) => chosenAction(it, p).o)), bestN: bestRows.length };
}
function evaluate(items, label) {
  const strategies = Object.fromEntries([...POLICIES.map((p) => [p, strategyMetrics(items, pol(p), (it) => chosenAction(it, p)?.t ?? null)]),
    ['UNIFORM_LEGAL_EXPECTATION', strategyMetrics(items, uni)], ...Object.keys(SCORERS).map((s) => [s, strategyMetrics(items, sco(s), (it) => sco(s)(it).chosenTypes[0])])]);
  const calibration = Object.fromEntries(Object.keys(SCORERS).map((s) => { const o = items.map(sco(s));
    return [s, { brier: mean(o.map((x) => x.brier)), crossEntropy: mean(o.map((x) => x.crossEntropy)), ece: ece10(o.map((x) => ({ p: x.confidence, y: x.hit }))) }]; }));
  const cmp = (name, a, b) => [name, paired(items, a, b, `${label}:${name}`)];
  const comparisons = Object.fromEntries([
    cmp('V2_vs_V1', onProposing(V1, pol(V2)), onProposing(V1, pol(V1))), cmp('V2_vs_V1_TIE_RANDOMISED', onProposing(V1, permutedMean(V2)), onProposing(V1, permutedMean(V1))),
    cmp('V1_vs_UNIFORM', onProposing(V1, pol(V1)), onProposing(V1, uni)), cmp('V2_vs_UNIFORM', onProposing(V2, pol(V2)), onProposing(V2, uni)),
    cmp('V1_vs_RESOURCE', onProposing(V1, pol(V1)), onProposing(V1, pol(RES))), cmp('V2_vs_RESOURCE', onProposing(V2, pol(V2)), onProposing(V2, pol(RES))),
    cmp('NX_DEPLOYABLE_vs_V1', onProposing(V1, sco('NX_DEPLOYABLE')), onProposing(V1, pol(V1))), cmp('NX_DEPLOYABLE_vs_V2', onProposing(V2, sco('NX_DEPLOYABLE')), onProposing(V2, pol(V2))),
    cmp('NX_RELATIONAL_ONLY_vs_V1', onProposing(V1, sco('NX_RELATIONAL_ONLY')), onProposing(V1, pol(V1))), cmp('NX_RELATIONAL_ONLY_vs_V2', onProposing(V2, sco('NX_RELATIONAL_ONLY')), onProposing(V2, pol(V2))),
    cmp('NX_RELATIONAL_ONLY_vs_RESOURCE', sco('NX_RELATIONAL_ONLY'), pol(RES)), cmp('NX_DEPLOYABLE_vs_NX_RELATIONAL_ONLY', sco('NX_DEPLOYABLE'), sco('NX_RELATIONAL_ONLY')),
    cmp('NX_DEPLOYABLE_vs_RESOURCE', sco('NX_DEPLOYABLE'), pol(RES)), cmp('NX_DEPLOYABLE_vs_UNIFORM', sco('NX_DEPLOYABLE'), uni),
    cmp('NX_PRIVILEGED_vs_NX_DEPLOYABLE', sco('NX_PRIVILEGED'), sco('NX_DEPLOYABLE')), cmp('NX_PRIVILEGED_vs_V1', onProposing(V1, sco('NX_PRIVILEGED')), onProposing(V1, pol(V1))),
    cmp('NX_PRIV_MOVEMENT_ONLY_vs_NX_DEPLOYABLE', sco('NX_PRIV_MOVEMENT_ONLY'), sco('NX_DEPLOYABLE')), cmp('NX_PRIV_TARGET_ONLY_vs_NX_DEPLOYABLE', sco('NX_PRIV_TARGET_ONLY'), sco('NX_DEPLOYABLE')),
    cmp('NX_DEPLOYABLE_ONESTEP_vs_NX_DEPLOYABLE', sco('NX_DEPLOYABLE_ONESTEP'), sco('NX_DEPLOYABLE')), cmp('NX_PRIVILEGED_ONESTEP_vs_NX_PRIVILEGED', sco('NX_PRIVILEGED_ONESTEP'), sco('NX_PRIVILEGED')),
  ]);
  const setV1 = oracle(items, [RES, V1, OBJ, THR]); const setV2 = oracle(items, [RES, V2, OBJ, THR]);
  const idx = new Map(items.map((it, i) => [it, i]));
  const v1BestRows = items.filter((it, i) => setV1[i] && setV1[i].best.includes(V1) && it.choice[V2] !== null);
  const targetedRows = items.filter((it) => it.choice[V1] !== null && it.cands.some((c) => c.target !== null));
  const bestTargeted = (it) => { const t = it.cands.filter((c) => c.target !== null); const r = Math.min(...t.map((c) => c.r)); return { hit: r === 0 ? 1 : 0, nreg: it.maxR > 0 ? r / it.maxR : 0 }; };
  const special = {
    ORACLE_SET_V2_vs_V1: paired(items, (it) => setV2[idx.get(it)], (it) => setV1[idx.get(it)], `${label}:oracleV2V1`),
    V2_vs_V1_WHERE_V1_BEST: paired(v1BestRows, pol(V2), pol(V1), `${label}:v1best`),
    BEST_TARGETED_vs_V1: paired(targetedRows, bestTargeted, pol(V1), `${label}:targeted`),
    oracleTop1: { withV1: mean(setV1.filter(Boolean).map((x) => x.hit)), withV2: mean(setV2.filter(Boolean).map((x) => x.hit)) },
  };
  return { n: items.length, strategies, calibration, comparisons, special,
    behaviour: Object.fromEntries([V1, V2, RES].map((p) => [p, behaviour(items, p)])),
    shortcut: Object.fromEntries(NEXUS.map((p) => [p, shortcutAudit(items, p)])),
    marginal: Object.fromEntries(NEXUS.map((p) => [p, marginal(items, p)])),
    regimes: regimeTable(items, label),
    hostileGap: Object.fromEntries(NEXUS.map((p) => { const a = items.filter((it) => it.choice[p] !== null); const lv = {};
      for (const it of a) { const l = REGIMES.observed.HOSTILE_PRESENT(it) ? 'yes' : 'no'; lv[l] ??= { n: 0, c: 0 }; lv[l].n += 1; lv[l].c += chosenAction(it, p).o; }
      const levels = Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, { n: v.n, accuracy: v.c / v.n }])); return [p, { levels, ...factorGap(levels) }]; })),
    fidelity: fidelity(items),
  };
}
const results = { [PH]: evaluate(PARTS[PH], PH), [PO]: evaluate(PARTS[PO], PO) };
const H = results[PH]; const O = results[PO];

/* ================================================================== claims, classification */
const bothMaterial = (k) => H.comparisons[k].MATERIAL && O.comparisons[k].MATERIAL;
const replicated = (p) => ['ORIENTATION', 'ABSOLUTE_DIRECTION', 'ACTION_ID_ORDER', 'D4_TWIN'].filter((f) => H.shortcut[p][f].flag && O.shortcut[p][f].flag);
function genuineRelational(p) {
  const hits = Object.keys(H.regimes).filter((name) => { const h = H.regimes[name]; const o = O.regimes[name];
    return h.kind === 'observed' && h.policies[p].n >= plan.regimes.minN && h.relational[p].vsUniform.MATERIAL && h.relational[p].vsResource.MATERIAL
      && (o.relational[p].vsUniform.top1Ci95?.[0] ?? -1) > 0 && (o.relational[p].vsResource.top1Ci95?.[0] ?? -1) > 0; });
  return { regimes: hits, holds: hits.length > 0 && replicated(p).length === 0 };
}
const v1b = H.behaviour[V1]; const v2b = H.behaviour[V2];
const claims = {
  C1_PROTECT_BIAS_MAIN_CAUSE: { evidence: { protectSelection: v1b.protect.selectionRate, protectRegretShare: v1b.protectRegretShare },
    verdict: claimVerdict({ survives: v1b.protect.selectionRate >= 0.8 && v1b.protectRegretShare >= 0.8, partial: v1b.protect.selectionRate >= 0.8 || v1b.protectRegretShare >= 0.8 }) },
  C2_TARGET_NOT_MAIN_DEFECT: { evidence: { targetAccuracyGivenCorrectType: v1b.targetAccuracyGivenCorrectType, typeAccuracy: v1b.typeAccuracy },
    verdict: claimVerdict({ survives: v1b.targetAccuracyGivenCorrectType >= 0.9, partial: v1b.targetAccuracyGivenCorrectType >= 0.7 }) },
  C3_V2_STANDALONE_MATERIAL_IMPROVEMENT: { evidence: { raw: { holdout: H.comparisons.V2_vs_V1, ood: O.comparisons.V2_vs_V1 }, tieRandomised: { holdout: H.comparisons.V2_vs_V1_TIE_RANDOMISED, ood: O.comparisons.V2_vs_V1_TIE_RANDOMISED } },
    verdict: claimVerdict({ survives: bothMaterial('V2_vs_V1') && bothMaterial('V2_vs_V1_TIE_RANDOMISED'), partial: H.comparisons.V2_vs_V1.MATERIAL }) },
  C4_V2_GAIN_FROM_MOVE_RESOURCE_COLLINEAR: { evidence: { v2MoveShare: v2b.actionTypes.MOVE ?? 0, v2AgreementWithResource: v2b.agreementWith[RES] },
    verdict: claimVerdict({ survives: (v2b.actionTypes.MOVE ?? 0) >= 0.5 && v2b.agreementWith[RES] >= 0.5, partial: (v2b.actionTypes.MOVE ?? 0) >= 0.5 || v2b.agreementWith[RES] >= 0.5 }) },
  C5_V2_REDUCES_POLICY_SET_VALUE: { evidence: { oracleTop1: H.special.oracleTop1, diff: H.special.ORACLE_SET_V2_vs_V1 },
    verdict: claimVerdict({ survives: (H.special.ORACLE_SET_V2_vs_V1.top1Ci95?.[1] ?? 0) < 0 }) },
  C6_V2_WORSE_WHERE_V1_BEST: { evidence: H.special.V2_vs_V1_WHERE_V1_BEST, verdict: claimVerdict({ survives: (H.special.V2_vs_V1_WHERE_V1_BEST.top1Ci95?.[1] ?? 0) < 0 }) },
  C7_V1_VALUE_FROM_GREEDY_COLLINEARITY: { evidence: { v1AgreementWithGreedy: v1b.agreementWith.GREEDY },
    verdict: claimVerdict({ survives: v1b.agreementWith.GREEDY >= 0.5, partial: v1b.agreementWith.GREEDY >= 0.25 }) },
  C8_REMEDIATION_REQUIRES_MISSING_REPRESENTATION: { evidence: { holdout: H.comparisons.NX_PRIVILEGED_vs_NX_DEPLOYABLE, ood: O.comparisons.NX_PRIVILEGED_vs_NX_DEPLOYABLE },
    verdict: claimVerdict({ survives: bothMaterial('NX_PRIVILEGED_vs_NX_DEPLOYABLE'), partial: H.comparisons.NX_PRIVILEGED_vs_NX_DEPLOYABLE.MATERIAL || O.comparisons.NX_PRIVILEGED_vs_NX_DEPLOYABLE.MATERIAL }) },
  C9_V1_THREAT_REGIME_INSENSITIVE: { evidence: H.hostileGap[V1], verdict: claimVerdict({ survives: !H.hostileGap[V1].flag }) },
  C10_ENTITY_TARGETED_ORACLE_NOT_MATERIAL: { evidence: H.special.BEST_TARGETED_vs_V1, verdict: claimVerdict({ survives: !H.special.BEST_TARGETED_vs_V1.MATERIAL }) },
  C11_V2_SIMULATOR_FREE: { evidence: { candidateHash: NEXUS_V2_CANDIDATE_HASH, sourceHash: STAGE3F6P1SYM_POLICIES.sourceSha256['src/stage3f/nexus-selector-v2-candidate.js'] },
    verdict: claimVerdict({ survives: NEXUS_V2_CANDIDATE_HASH === STAGE3F6P1SYM_POLICIES.remediated.historicalCandidateHash
      && STAGE3F6P1SYM_POLICIES.sourceSha256['src/stage3f/nexus-selector-v2-candidate.js'] === STAGE3F6P1SYM_POLICIES.remediated.historicalSourceHash }) },
  C12_V1_PRESERVED: { evidence: { holdoutChoiceFidelity: H.fidelity.choices, oodChoiceFidelity: O.fidelity.choices }, verdict: claimVerdict({ survives: H.fidelity.choices === 1 && O.fidelity.choices === 1 }) },
};
const nexusClass = Object.fromEntries(NEXUS.map((p) => {
  const g = genuineRelational(p);
  const inputs = { proposingN: H.strategies[p].proposingN, nuisanceDependence: replicated(p).length > 0, replicatedNuisance: replicated(p), genuineRelational: g.holds, genuineRegimes: g.regimes,
    representationBlocked: bothMaterial('NX_PRIVILEGED_vs_NX_DEPLOYABLE'), policyLogicLimited: bothMaterial(p === V1 ? 'NX_RELATIONAL_ONLY_vs_V1' : 'NX_RELATIONAL_ONLY_vs_V2'),
    marginalAccuracyGain: H.marginal[p].marginalAccuracyGain, accuracyWhenBest: H.marginal[p].accuracyWhenBest };
  return [p, { inputs, ...nexusClassification(inputs) }];
}));
const verdicts = Object.values(claims).map((c) => c.verdict).filter((v) => v !== 'NOT_RETESTABLE');
const architecture = {
  OBSERVATION_INFRASTRUCTURE: nexusClass[V1].holds.REPRESENTATION_BLOCKED,
  NEXUS: bothMaterial('NX_PRIV_TARGET_ONLY_vs_NX_DEPLOYABLE') || H.comparisons.NX_PRIV_TARGET_ONLY_vs_NX_DEPLOYABLE.MATERIAL,
  ACTION_SEMANTICS_INFRASTRUCTURE: H.comparisons.NX_PRIV_MOVEMENT_ONLY_vs_NX_DEPLOYABLE.MATERIAL,
  ARCHIMEDES: bothMaterial('NX_PRIVILEGED_ONESTEP_vs_NX_PRIVILEGED'), ORACLE: 'NOT_ASSESSED', EXPERT_10: false,
};
const p1a = readJson('artifacts/stage3f6p1asym-free-action/stage3f6p1asym-certification-result.json');

/* ================================================================== integrity */
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const git = (...a) => spawnSync('git', ['-C', repositoryRoot, ...a], { encoding: 'utf8' });
const freeze = (() => {
  const planRepo = `platform/game-agnostic/${STAGE3F6P1SYM_PLAN_PATH}`;
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', planRepo).stdout.trim().split('\n').filter(Boolean);
  const commit = commits[commits.length - 1] ?? null;
  const files = commit ? git('show', '--name-only', '--format=', commit).stdout.trim().split('\n').filter(Boolean) : [];
  const out = { freezeCommit: commit, planAndOpenReportInFreezeCommit: files.includes(planRepo) && files.includes(`platform/game-agnostic/${OPEN_REPORT_PATH}`),
    evaluationFilesInFreezeCommit: EVALUATION_FILES.every((f) => files.includes(`platform/game-agnostic/${f}`)),
    noFreshOrResultInFreezeCommit: !files.some((f) => /fresh-confirmatory|stage3f6p1sym-certification-result/.test(f)),
    freshGeneratedAtHead: freshManifest.generatedAtHead,
    freshGeneratedAfterFreeze: commit !== null && git('merge-base', '--is-ancestor', commit, freshManifest.generatedAtHead).status === 0,
    evaluationFilesUnchangedSinceGeneration: git('diff', '--quiet', freshManifest.generatedAtHead, '--', ...EVALUATION_FILES.map((f) => `platform/game-agnostic/${f}`)).status === 0 };
  out.FROZEN_BEFORE_SEALED_DATA = commit !== null && out.planAndOpenReportInFreezeCommit && out.evaluationFilesInFreezeCommit && out.noFreshOrResultInFreezeCommit && out.freshGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const prior = readPriorLineage();
const priorSets = { record: new Set(prior.rows.map((r) => r.recordHash)), world: new Set(prior.rows.map((r) => r.worldHash)), topology: new Set(prior.rows.map((r) => r.topologyHash)) };
const comboKey = (r) => JSON.stringify([r.combination.shape, r.combination.roles, r.combination.objectives, r.combination.horizonBand, r.combination.level, r.combination.seed]);
const priorCombos = new Set(prior.rows.map(comboKey));
const eq = fresh.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const freshIntegrity = {
  contentHash: hex(freshText), contentBound: hex(freshText) === freshManifest.contentHash, planBound: freshManifest.planHash === STAGE3F6P1SYM_PLAN_HASH,
  seedPlanBound: freshManifest.seedPlanHash === STAGE3F6P1SYM_SEED_PLAN_HASH, seedAudit: seedAudit(prior.rows),
  seedsUsed: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, [...new Set(fresh.filter((r) => r.partition === p).map((r) => r.combination.seed))]])),
  counts: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, PARTS[p].length])), stats: freshManifest.stats, priorLineage: prior.sources,
  RECORD_OVERLAP: fresh.filter((r) => priorSets.record.has(r.recordHash)).length, STATE_OVERLAP: fresh.filter((r) => priorSets.world.has(r.worldHash)).length,
  TOPOLOGY_OVERLAP: fresh.filter((r) => priorSets.topology.has(r.topologyHash)).length, DERIVED_VARIANT_LEAKAGE: fresh.filter((r) => priorCombos.has(comboKey(r))).length,
  DUPLICATE_HASHES: ['recordHash', 'worldHash', 'topologyHash'].reduce((s, f) => s + fresh.length - new Set(fresh.map((r) => r[f])).size, 0),
  levels: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, [...new Set(fresh.filter((r) => r.partition === p).map((r) => r.combination.level))].sort()])),
  equivarianceChecks: eq.length, SYMMETRY: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, rate(eq, (x) => x[k] === 1)])),
  benchmarkBound: JSON.stringify(freshManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
};
const planFile = readJson(STAGE3F6P1SYM_PLAN_PATH);
const policyIntegrity = { sourcesMatchPlan: POLICY_SOURCES.every((f) => planFile.policies.sourceSha256[f] === hex(readFileSync(at(f)))),
  sourcesMatchHead: POLICY_SOURCES.every((f) => headBytesHash(f) === hex(readFileSync(at(f)))), v2CandidateHash: NEXUS_V2_CANDIDATE_HASH === STAGE3F6P1SYM_POLICIES.remediated.historicalCandidateHash };
const selfSource = readFileSync(at('scripts/certify-stage3f6p1sym-nexus.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const derivation = readFileSync(at('src/stage3f/nexus-requalification-v1.js'), 'utf8').split('export function privilegedCandidateBlocks')[0].split('export function deployableCandidateBlocks')[1] ?? '';
const staticAudit = {
  DEPLOYABLE_SCORERS_USE_DEPLOYABLE_BLOCKS_ONLY: JSON.stringify(SCORERS.NX_DEPLOYABLE.blocks) === JSON.stringify(DEPLOYABLE_BLOCKS) && DEPLOYABLE_BLOCKS.every((b) => !/PRIV|ONESTEP/.test(b))
    && SCORERS.NX_RELATIONAL_ONLY.blocks.every((b) => DEPLOYABLE_BLOCKS.includes(b) && b !== 'GEOMETRY'),
  DEPLOYABLE_DERIVATION_READS_NO_KERNEL_STATE: !/world|\.position|entities\.find|immediateScalar|regret|orientation/.test(derivation),
  FITS_ON_DEV_ONLY: [...selfSource.matchAll(/fitScorers\(([A-Z]+)\)/g)].every((m) => m[1] === 'DEV') && [...selfSource.matchAll(/fitCandidateLogit\(([A-Z]+)\./g)].every((m) => m[1] === 'DEV'),
  NO_DEEP_OR_WORLD_MODEL: !/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(selfSource),
};
let predecessorChecks = { skipped: true };
if (!skipPredecessors) {
  const run = (s) => { const r = spawnSync(process.execPath, [s, '--check'], { cwd: root, encoding: 'utf8' }); try { return r.status === 0 && JSON.parse(r.stdout).reproduced === true; } catch { return false; } };
  predecessorChecks = { stage3f6p1asym_transitive: run('scripts/certify-stage3f6p1asym-free-action.mjs'),
    note: 'P.1A-SYM --check requires P.1C, P.1D, P.1E and 3F.6-T-SYM to reproduce byte for byte' };
}
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const r = spawnSync(process.execPath, ['--test', 'tests/stage3f6p1sym-nexus.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = r.status ?? 1; const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const fid = (f) => f.world === 1 && f.surface === 1 && f.choices === 1 && f.candidateSet === 1 && f.deployableFeatureEquivariance === 1 && f.privilegedFeatureEquivariance === 1 && f.nexusReasonEquivariance === 1;
const checks = {
  PREDECESSORS_REPRODUCE: skipPredecessors || predecessorChecks.stage3f6p1asym_transitive === true,
  PLAN_BOUND: planFile.planHash === STAGE3F6P1SYM_PLAN_HASH && planFile.seedPlanHash === STAGE3F6P1SYM_SEED_PLAN_HASH && planFile.policyHash === STAGE3F6P1SYM_POLICY_HASH,
  FROZEN_BEFORE_SEALED_DATA: freeze.FROZEN_BEFORE_SEALED_DATA, OPEN_PHASE_REPRODUCED, FIT_DETERMINISTIC: openStored.fitDeterministic === true,
  SEED_DECLARATION_CLEAN: freshIntegrity.seedAudit.overlapWithPriorSeeds.length === 0 && freshIntegrity.seedAudit.usedByPriorRows.length === 0 && freshIntegrity.seedAudit.holdoutOodOverlap.length === 0
    && Object.values(freshIntegrity.seedsUsed).flat().every((s) => [...STAGE3F6P1SYM_SEED_PLAN.declared.HOLDOUT, ...STAGE3F6P1SYM_SEED_PLAN.declared.OOD].includes(s)),
  FRESH_LINEAGE_CLEAN: freshIntegrity.contentBound && freshIntegrity.planBound && freshIntegrity.seedPlanBound && freshIntegrity.benchmarkBound && freshIntegrity.RECORD_OVERLAP === 0
    && freshIntegrity.STATE_OVERLAP === 0 && freshIntegrity.TOPOLOGY_OVERLAP === 0 && freshIntegrity.DERIVED_VARIANT_LEAKAGE === 0 && freshIntegrity.DUPLICATE_HASHES === 0
    && Object.values(freshIntegrity.counts).every((n) => n === 6000),
  FRESH_SYMMETRY_INTACT: freshIntegrity.equivarianceChecks > 0 && Object.values(freshIntegrity.SYMMETRY).every((v) => v === 1),
  POLICY_DEFINITIONS_UNCHANGED: Object.values(policyIntegrity).every(Boolean),
  EVIDENCE_FIDELITY_AND_FEATURE_EQUIVARIANCE: fid(openStored.evidenceFidelity) && fid(H.fidelity) && fid(O.fidelity),
  STATIC_AUDIT: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: plan.authority.tier === 'R0' && !plan.authority.canDispatch && !plan.authority.canMutateLiveWorld && !plan.authority.onlineLearningEnabled && !plan.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const roadmap = {
  NEXUS_REQUALIFIED: status === 'PASS',
  HISTORICAL_P1_SURVIVES: verdicts.every((v) => v === 'SURVIVES') ? true : verdicts.some((v) => v === 'SURVIVES' || v === 'PARTIALLY_SURVIVES') ? 'PARTIAL' : false,
  GENUINE_RELATIONAL_VALUE_MEASURED: NEXUS.some((p) => nexusClass[p].holds.GENUINE_RELATIONAL_COMPETENCE),
  NEXUS_POLICY_REPAIR_JUSTIFIED: bothMaterial('NX_RELATIONAL_ONLY_vs_V1') && bothMaterial('NX_RELATIONAL_ONLY_vs_RESOURCE'),
  NEXUS_REPRESENTATION_BLOCKED: nexusClass[V1].holds.REPRESENTATION_BLOCKED, SPATIAL_STATE_REQUIRED: bothMaterial('NX_PRIVILEGED_vs_NX_DEPLOYABLE'),
  ACTION_SEMANTICS_REQUIRED: H.comparisons.NX_PRIV_MOVEMENT_ONLY_vs_NX_DEPLOYABLE.MATERIAL || p1a.roadmap.ACTION_SEMANTICS_REQUIRED === true,
  TRANSITION_PREDICTION_REQUIRED: bothMaterial('NX_PRIVILEGED_ONESTEP_vs_NX_PRIVILEGED') || bothMaterial('NX_DEPLOYABLE_ONESTEP_vs_NX_DEPLOYABLE'),
  ROUTER_2_0_JUSTIFIED: false, READY_FOR_STAGE3F6W_REQUALIFICATION: status === 'PASS', READY_FOR_STAGE3F6D_REQUALIFICATION: false, READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false,
  STAGE3F_STATUS: 'OPEN (requalifications remaining: 3F.6-W, 3F.6-D)',
};
const payload = roundDeep({
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1SYM_PLAN_HASH, seedPlanHash: STAGE3F6P1SYM_SEED_PLAN_HASH, policyHash: STAGE3F6P1SYM_POLICY_HASH,
  candidateSchemaHash: CANDIDATE_SCHEMA_HASH, openPhaseReportHash: openStored.reportHash, freeze, predecessorChecks,
  data: { benchmarkId: 'FORGE_SYMMETRIC_V2', corpusContentHash: plan.predecessors.corpusContentHash, fresh: freshIntegrity },
  policies: STAGE3F6P1SYM_POLICIES, scorers: openStored.scorers, results, claims, nexusClassification: nexusClass, architecture, roadmap,
  disclosures: {
    PRIVILEGED_DIAGNOSTIC_ONLY: 'NX_PRIVILEGED* scorers read kernel entity positions no interface exposes; they are upper references, never deployable and never a repair',
    SCORERS_ARE_NOT_NEXUS: 'the NX_* scorers test what the inputs can support; they are not Nexus versions and were not promoted',
    C11_STATIC_ONLY: 'the historical dynamic poison probe was not re-run; the claim is re-verified statically by source and candidate hash',
    TRANSITIVE_PREDECESSORS: 'P.1A-SYM --check reproduces byte for byte only when P.1C, P.1D, P.1E and 3F.6-T-SYM do',
  },
  checks, tests: testMetrics, policyIntegrity, staticAudit, authority: plan.authority,
  scope: { newOwners: ['scripts/stage3f6p1sym-analysis-plan.mjs', 'scripts/generate-stage3f6p1sym-confirmatory.mjs', 'scripts/stage3f6p1sym-evidence.mjs', 'scripts/certify-stage3f6p1sym-nexus.mjs',
    'src/stage3f/nexus-requalification-v1.js', 'tests/stage3f6p1sym-nexus.test.js'], existingOwnersModified: ['package.json', '.gitignore'], nexusModified: false, policiesTrained: false, stage3gStarted: false },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1SYM_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    classification: Object.fromEntries(NEXUS.map((p) => [p, { primary: nexusClass[p].primary, labels: nexusClass[p].labels }])),
    claims: Object.fromEntries(Object.entries(claims).map(([k, v]) => [k, v.verdict])), roadmap, architecture }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
