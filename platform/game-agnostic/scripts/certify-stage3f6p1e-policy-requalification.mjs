#!/usr/bin/env node
/* STAGE_3F_6_P_1E — SYMMETRIC POLICY REQUALIFICATION certification.
 *
 * Measurement, not remediation. Evaluates the frozen policy set on FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1 under the
 * analysis plan hashed and committed before any sealed evidence existed.
 *
 *   --phase=open   DEV and CAL only. Fixes the DEV regime cut points and the CAL selections (strongest regime, best
 *                  single policy, cascade order) and writes the open-phase report. Sealed evidence is never read.
 *   (default)      requires the committed open-phase report, recomputes it byte for byte, then evaluates DEV, CAL,
 *                  sealed HOLDOUT and sealed OOD in that order and writes the certification.
 *   --check        recomputes everything and requires a byte-identical certification.
 *
 * A negative policy result is a valid PASS. The stage fails only on integrity failures.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STAGE3F6P1E_OUT, STAGE3F6P1E_PLAN, STAGE3F6P1E_PLAN_HASH, STAGE3F6P1E_PLAN_PATH, STAGE3F6P1E_POLICY_SET, STAGE3F6P1E_POLICY_SET_HASH, STAGE3F6P1E_POLICY_SOURCES,
} from './stage3f6p1e-analysis-plan.mjs';
import {
  OPEN_PARTITIONS, OPEN_REPORT_PATH, SEALED_PARTITIONS, evidenceFor, evidenceManifestPath, evidencePath, readCorpus,
} from './generate-stage3f6p1e-policy-evidence.mjs';
import {
  auroc, bestSet, bootstrapMean, bootstrapPlan, calibration, cheapestClassAccuracy, classifyPolicy, factorGap, mean, normalizedRegret, pairedFlag,
  perfectSelector, quantile, rate, resourceVerdict, uniformLegalAccuracy, uniformLegalRegret, wilson, zeroCostAvailable, zeroCostOptimal,
} from '../src/stage3f/policy-requalification-v1.js';
import { STAGE3F6_METHODOLOGY } from '../src/stage3f/prediction-reliability-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const RESULT = `${STAGE3F6P1E_OUT}/stage3f6p1e-certification-result.json`;
const plan = STAGE3F6P1E_PLAN;
const ALL = plan.partitions.order;
const DEPLOYABLE = STAGE3F6P1E_POLICY_SET.categories.DEPLOYABLE;
const RES = 'RESOURCE_PRESERVING_V1'; const CONTROL = 'RANDOM_LEGAL_V1'; const GREEDY = 'GREEDY';
const SPECIALISTS = ['OBJECTIVE_TARGETING_V1', 'THREAT_COVERING_V1', 'NEXUS_SELECTOR_V1', 'NEXUS_SELECTOR_V2_CANDIDATE'];
const SETS = plan.complementarity.sets;
const CATASTROPHIC = STAGE3F6_METHODOLOGY.catastrophicRegret;
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));

/* ================================================================== data */
const corpus = readCorpus();
function loadEvidence(phase) {
  const manifest = readJson(evidenceManifestPath(phase));
  const text = gunzipSync(readFileSync(at(evidencePath(phase)))).toString('utf8');
  return { manifest, contentOk: hex(text) === manifest.contentHash, rows: text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) };
}
const open = loadEvidence('open');
const sealed = phaseOpen ? null : loadEvidence('sealed');
const evidence = new Map([...open.rows, ...(sealed?.rows ?? [])].map((e) => [e.recordHash, e]));
const visible = phaseOpen ? OPEN_PARTITIONS : ALL;

/** Joined episode: corpus outcome + evidence. The open phase never builds a sealed row. */
function episode(row) {
  const e = evidence.get(row.recordHash);
  if (e === undefined) throw new Error(`missing evidence for ${row.recordHash}`);
  const choice = Object.fromEntries(Object.entries(e.policies).map(([p, v]) => [p, v.a]));
  choice[GREEDY] = row.policies[GREEDY];
  return { partition: row.partition, recordHash: row.recordHash, core: row.core, combination: row.combination, orientation: row.orientation,
    label: row.label, actions: row.actions, equivarianceSample: row.equivariance !== null, choice, evidence: e };
}
const rows = Object.fromEntries(visible.map((p) => [p, corpus.filter((r) => r.partition === p).map(episode)]));
const pick = (r, p) => r.choice[p] ?? null;

/* ================================================================ regimes */
const devCore = (k) => rows.DEV.map((r) => r.core[k]).sort((a, b) => a - b);
const T = {
  energyMedian: quantile(devCore('resources.actorEnergy'), 0.5),
  surfaceMedian: quantile(devCore('actionSurface.legalActionCount'), 0.5),
  surfaceQuartiles: [0.25, 0.5, 0.75].map((q) => quantile(devCore('actionSurface.legalActionCount'), q)),
};
const BINARY = {
  HOSTILE_PRESENT: (r) => r.core['relational.hostileEntityCount'] > 0,
  UNSUPPORTED_THREAT: (r) => r.core['relational.unsupportedThreatenedCount'] > 0,
  BOTTLENECK: (r) => r.core['relational.bottleneckCount'] > 0,
  CRITICAL_DEPENDENCY: (r) => r.core['relational.criticalDependencyCount'] > 0,
  LOW_ENERGY: (r) => r.core['resources.actorEnergy'] <= T.energyMedian,
  MULTI_OBJECTIVE: (r) => r.core['context.objectiveCount'] >= 2,
  SPARSE_SURFACE: (r) => r.core['actionSurface.legalActionCount'] <= T.surfaceMedian,
  LONG_HORIZON: (r) => ['H3', 'H4'].includes(r.combination.horizonBand),
  ZERO_COST_AVAILABLE: (r) => zeroCostAvailable(r),
  ZERO_COST_OPTIMAL: (r) => zeroCostOptimal(r),
  HORIZON_DEPENDENT: (r) => r.label.horizonClass === 'HORIZON_DEPENDENT',
};
const surfaceQuartile = (r) => { const n = r.core['actionSurface.legalActionCount']; return `Q${1 + T.surfaceQuartiles.filter((q) => n > q).length}`; };
const CATEGORICAL = {
  orientation: (r) => r.orientation, level: (r) => String(r.combination.level), horizonBand: (r) => r.combination.horizonBand,
  objectives: (r) => r.combination.objectives, roles: (r) => r.combination.roles, shape: (r) => r.combination.shape, surfaceQuartile,
};
const regimeSides = Object.entries(BINARY).flatMap(([name, fn]) => [[name, fn], [`NOT_${name}`, (r) => !fn(r)]]);

/* ================================================================ metrics */
const bootPlans = new Map();
const boot = (partition) => { if (!bootPlans.has(partition)) bootPlans.set(partition, bootstrapPlan(rows[partition].length, partition)); return bootPlans.get(partition); };

/** A virtual chooser (baseline or selector) is represented by per-row key arrays like a policy. */
function policyMetrics(part, choose, { confidence = null, reasons = null, partition = null } = {}) {
  const acting = part.filter((r) => choose(r) !== null);
  const reg = acting.map((r) => r.actions[choose(r)].r).sort((a, b) => a - b);
  const correct = acting.filter((r) => r.actions[choose(r)].o === 1).length;
  const out = {
    n: part.length, proposingN: acting.length, coverage: part.length ? acting.length / part.length : null,
    accuracy: acting.length ? correct / acting.length : null, accuracyWilson95: wilson(correct, acting.length),
    meanRegret: mean(reg), medianRegret: quantile(reg, 0.5), p90Regret: quantile(reg, 0.9), p95Regret: quantile(reg, 0.95), maxRegret: reg.length ? reg[reg.length - 1] : null,
    meanNormalizedRegret: mean(acting.map((r) => normalizedRegret(r, choose(r)))),
    catastrophicN: reg.filter((x) => x >= CATASTROPHIC).length, catastrophicRate: reg.length ? reg.filter((x) => x >= CATASTROPHIC).length / reg.length : null,
    severeNormalizedRate: rate(acting, (r) => normalizedRegret(r, choose(r)) >= 0.5),
    actionTypes: distribution(acting.map((r) => r.actions[choose(r)].t)), declaredCosts: distribution(acting.map((r) => String(r.actions[choose(r)].c))),
    uniformLegalAccuracyOnProposing: mean(acting.map(uniformLegalAccuracy)),
  };
  if (partition !== null && part === rows[partition]) {
    const w = part.map((r) => (choose(r) !== null ? 1 : 0));
    out.meanRegret95 = bootstrapMean(boot(partition), part.map((r) => (choose(r) !== null ? r.actions[choose(r)].r : 0)), w);
    out.meanNormalizedRegret95 = bootstrapMean(boot(partition), part.map((r) => (choose(r) !== null ? normalizedRegret(r, choose(r)) : 0)), w);
    const d = part.map((r) => (choose(r) !== null ? r.actions[choose(r)].o - uniformLegalAccuracy(r) : 0));
    out.aboveChance = { meanDifference: mean(acting.map((r) => r.actions[choose(r)].o - uniformLegalAccuracy(r))), paired95: bootstrapMean(boot(partition), d, w) };
    out.aboveChance.ABOVE_CHANCE = out.aboveChance.paired95 !== null && out.aboveChance.paired95[0] > 0;
  }
  if (reasons !== null) out.abstainReasons = distribution(part.filter((r) => choose(r) === null).map(reasons));
  if (confidence !== null) {
    const pairs = acting.map((r) => ({ confidence: confidence(r), correct: r.actions[choose(r)].o }));
    const constant = new Set(pairs.map((p) => p.confidence)).size <= 1;
    out.confidence = constant ? { status: 'NOT_APPLICABLE_CONSTANT_CONFIDENCE', value: pairs[0]?.confidence ?? null }
      : { meanConfidence: mean(pairs.map((p) => p.confidence)), ...calibration(pairs), auroc: auroc(pairs) };
  }
  return out;
}
function distribution(values) {
  const counts = {}; for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([k, c]) => [k, round(c / values.length)]));
}
const policyChooser = (p) => (r) => pick(r, p);
const chooserOptions = (p, partition) => (DEPLOYABLE.includes(p) || p === CONTROL
  ? { confidence: (r) => r.evidence.policies[p].conf, reasons: (r) => r.evidence.policies[p].why ?? 'NONE', partition } : { partition });

/** Analytic baselines are expectations, not choices: accuracy and regret are averaged per episode. */
function expectationMetrics(part, accuracyOf, regretOf) {
  const usable = part.filter((r) => accuracyOf(r) !== null);
  return { n: part.length, proposingN: usable.length, coverage: part.length ? usable.length / part.length : null,
    accuracy: mean(usable.map(accuracyOf)), meanRegret: mean(usable.map(regretOf)) };
}
const cheapestClassRegret = (r) => { const keys = Object.keys(r.actions).filter((k) => typeof r.actions[k].c === 'number');
  if (keys.length !== Object.keys(r.actions).length) return null; const min = Math.min(...keys.map((k) => r.actions[k].c));
  return mean(keys.filter((k) => r.actions[k].c === min).map((k) => r.actions[k].r)); };

/* ======================================================= open-phase selections */
function strongestRegime(p) {
  const candidates = regimeSides.map(([name, fn]) => {
    const sub = rows.CAL.filter((r) => fn(r) && pick(r, p) !== null);
    return { regime: name, n: sub.length, accuracy: mean(sub.map((r) => r.actions[pick(r, p)].o)) };
  }).filter((c) => c.n >= 200).sort((a, b) => b.accuracy - a.accuracy || (a.regime < b.regime ? -1 : 1));
  return candidates[0] ?? null;
}
function openPhaseReport() {
  const cal = Object.fromEntries(DEPLOYABLE.map((p) => [p, policyMetrics(rows.CAL, policyChooser(p))]));
  const eligible = DEPLOYABLE.filter((p) => cal[p].coverage >= 0.99).sort((a, b) => cal[a].meanRegret - cal[b].meanRegret || cal[b].accuracy - cal[a].accuracy);
  const bestSingle = eligible[0] ?? null;
  const cascade = SPECIALISTS.filter((p) => cal[p].accuracy !== null && cal[p].accuracy > cal[bestSingle].accuracy)
    .sort((a, b) => cal[b].accuracy - cal[a].accuracy || (a < b ? -1 : 1));
  return roundDeep({
    schemaVersion: 1, stage: plan.stage, phase: 'OPEN', planHash: STAGE3F6P1E_PLAN_HASH, policySetHash: STAGE3F6P1E_POLICY_SET_HASH,
    partitions: OPEN_PARTITIONS, openEvidenceContentHash: open.manifest.contentHash,
    devThresholds: T,
    calSelections: {
      bestSingle, bestSingleEligible: eligible,
      cascadeOrder: [...cascade, bestSingle],
      strongestRegime: Object.fromEntries(DEPLOYABLE.map((p) => [p, strongestRegime(p)])),
    },
    descriptive: { DEV: Object.fromEntries(DEPLOYABLE.map((p) => [p, pickSummary(policyMetrics(rows.DEV, policyChooser(p)))])),
      CAL: Object.fromEntries(DEPLOYABLE.map((p) => [p, pickSummary(cal[p])])) },
    sealedEvidenceRead: false,
  });
}
const pickSummary = (m) => ({ proposingN: m.proposingN, coverage: m.coverage, accuracy: m.accuracy, meanRegret: m.meanRegret });

if (phaseOpen) {
  const report = openPhaseReport();
  report.reportHash = hex(JSON.stringify(report));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: report.reportHash, calSelections: report.calSelections, devThresholds: report.devThresholds }, null, 2));
  process.exit(0);
}

/* ======================================================= sealed evaluation */
const openStored = readJson(OPEN_REPORT_PATH);
const openRecomputed = openPhaseReport(); openRecomputed.reportHash = hex(JSON.stringify(openRecomputed));
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const SEL = openStored.calSelections;
const BEST = SEL.bestSingle;
const cascadeChoice = (r) => { for (const p of SEL.cascadeOrder) if (pick(r, p) !== null) return pick(r, p); return null; };

/* ---------------------------------------------------------- phase 3: results */
const REPORTED = [...DEPLOYABLE, CONTROL, GREEDY];
const results = {};
for (const partition of ALL) {
  const part = rows[partition];
  results[partition] = {
    policies: Object.fromEntries(REPORTED.map((p) => [p, policyMetrics(part, policyChooser(p), chooserOptions(p, partition))])),
    baselines: {
      UNIFORM_LEGAL_EXPECTATION: expectationMetrics(part, uniformLegalAccuracy, uniformLegalRegret),
      CHEAPEST_CLASS_UNIFORM: expectationMetrics(part, cheapestClassAccuracy, cheapestClassRegret),
      FIXED_PRIORITY_CASCADE: policyMetrics(part, cascadeChoice, { partition }),
    },
    strongestRegime: Object.fromEntries(DEPLOYABLE.map((p) => {
      const s = SEL.strongestRegime[p]; if (s === null) return [p, null];
      const fn = Object.fromEntries(regimeSides)[s.regime];
      return [p, { regime: s.regime, selectedOn: 'CAL', ...pickSummary(policyMetrics(part.filter(fn), policyChooser(p))) }];
    })),
  };
}
const HOLDOUT_SUPPORTED_LEVELS = [...new Set([...rows.DEV, ...rows.CAL].map((r) => r.combination.level))].sort();
const holdoutSupported = rows.HOLDOUT.filter((r) => HOLDOUT_SUPPORTED_LEVELS.includes(r.combination.level));
results.HOLDOUT_SUPPORTED_LEVELS = { levels: HOLDOUT_SUPPORTED_LEVELS, n: holdoutSupported.length,
  policies: Object.fromEntries(REPORTED.map((p) => [p, pickSummary(policyMetrics(holdoutSupported, policyChooser(p)))])) };

/* ---------------------------------------------------------- phase 4: shortcut audit */
function accuracyByLevel(part, p, levelOf) {
  const levels = {};
  for (const r of part) { const k = pick(r, p); if (k === null) continue; const l = levelOf(r, k); if (l === null) continue;
    levels[l] ??= { n: 0, correct: 0 }; levels[l].n += 1; levels[l].correct += r.actions[k].o; }
  return Object.fromEntries(Object.entries(levels).sort().map(([l, v]) => [l, { n: v.n, accuracy: v.correct / v.n }]));
}
function shortcutAudit(partition, p) {
  const part = rows[partition];
  const acting = part.filter((r) => pick(r, p) !== null);
  const orientation = accuracyByLevel(part, p, (r) => r.orientation);
  const direction = accuracyByLevel(part, p, (r, k) => (r.actions[k].t === 'MOVE' ? r.actions[k].dir : null));
  const moves = acting.filter((r) => r.actions[pick(r, p)].t === 'MOVE');
  const permutedAccuracy = (r) => mean(r.evidence.idPermuted.map((perm) => (perm[p] === null ? r.actions[pick(r, p)].o : r.actions[perm[p]].o)));
  const reversedCorrect = (r) => (r.evidence.idReversed[p] === null ? r.actions[pick(r, p)].o : r.actions[r.evidence.idReversed[p]].o);
  const twinRows = acting.filter((r) => r.evidence.twins !== null);
  const twinPairs = twinRows.flatMap((r) => Object.values(r.evidence.twins).map((t) => ({ r, k: t[p] })));
  const twinAccuracy = (r) => mean(Object.values(r.evidence.twins).map((t) => (t[p] === null ? 0 : r.actions[t[p]].o)));
  const nuisance = {
    ORIENTATION: { levels: orientation, ...factorGap(orientation) },
    ABSOLUTE_DIRECTION: { levels: direction, ...factorGap(direction), chosenDirectionShare: distribution(moves.map((r) => r.actions[pick(r, p)].dir)),
      note: 'share is behavioural preference; only accuracy dependence is a shortcut' },
    ACTION_ID_ORDER: {
      accuracy: mean(acting.map((r) => r.actions[pick(r, p)].o)), permutedMeanAccuracy: mean(acting.map(permutedAccuracy)), reversedAccuracy: mean(acting.map(reversedCorrect)),
      choiceChangedByReversal: rate(acting, (r) => r.evidence.idReversed[p] !== pick(r, p)),
      choiceChangedByAnyPermutation: rate(acting, (r) => r.evidence.idPermuted.some((perm) => perm[p] !== pick(r, p))),
      versusPermuted: pairedFlag(acting.map((r) => r.actions[pick(r, p)].o - permutedAccuracy(r))),
      versusReversed: pairedFlag(acting.map((r) => r.actions[pick(r, p)].o - reversedCorrect(r))),
    },
    D4_TWIN: {
      sampledRows: twinRows.length, pairs: twinPairs.length,
      choiceEquivariance: rate(twinPairs, (x) => x.k === pick(x.r, p)), abstentionEquivariance: rate(twinPairs, (x) => x.k !== null),
      originalAccuracy: mean(twinRows.map((r) => r.actions[pick(r, p)].o)), twinAccuracy: mean(twinRows.map(twinAccuracy)),
      paired: pairedFlag(twinRows.map((r) => r.actions[pick(r, p)].o - twinAccuracy(r))),
    },
    SEED_FAMILY: { status: 'NOT_IDENTIFIABLE', seedsUsed: [...new Set(part.map((r) => r.combination.seed))], note: plan.shortcutAudit.nuisanceFactors.SEED_FAMILY },
  };
  nuisance.ACTION_ID_ORDER.flag = nuisance.ACTION_ID_ORDER.versusPermuted.flag || nuisance.ACTION_ID_ORDER.versusReversed.flag;
  nuisance.D4_TWIN.flag = nuisance.D4_TWIN.paired.flag;
  const task = {};
  for (const name of ['ZERO_COST_AVAILABLE', 'ZERO_COST_OPTIMAL', 'LOW_ENERGY', 'HOSTILE_PRESENT']) {
    const levels = accuracyByLevel(part, p, (r) => (BINARY[name](r) ? 'yes' : 'no'));
    task[name] = { levels, ...factorGap(levels) };
  }
  for (const name of ['shape', 'level', 'surfaceQuartile']) { const levels = accuracyByLevel(part, p, CATEGORICAL[name]); task[name] = { levels, ...factorGap(levels) }; }
  return { proposingN: acting.length, nuisance, task };
}
const NUISANCE_KEYS = ['ORIENTATION', 'ABSOLUTE_DIRECTION', 'ACTION_ID_ORDER', 'D4_TWIN'];
const TASK_KEYS = ['ZERO_COST_AVAILABLE', 'ZERO_COST_OPTIMAL', 'shape', 'level', 'LOW_ENERGY', 'HOSTILE_PRESENT', 'surfaceQuartile'];
const shortcut = Object.fromEntries(ALL.map((partition) => [partition, Object.fromEntries([...DEPLOYABLE, CONTROL].map((p) => [p, shortcutAudit(partition, p)]))]));
const replicated = Object.fromEntries([...DEPLOYABLE, CONTROL].map((p) => [p, {
  NUISANCE_DEPENDENCE: Object.fromEntries(NUISANCE_KEYS.map((k) => [k, shortcut.CAL[p].nuisance[k].flag && shortcut.HOLDOUT[p].nuisance[k].flag])),
  REGIME_DEPENDENT: Object.fromEntries(TASK_KEYS.map((k) => [k, shortcut.CAL[p].task[k].flag && shortcut.HOLDOUT[p].task[k].flag])),
}]));
for (const p of Object.keys(replicated)) replicated[p].ANY_NUISANCE_DEPENDENCE = Object.values(replicated[p].NUISANCE_DEPENDENCE).some(Boolean);

/* RESOURCE's declared artifact baseline: the cost prior with no tie information. */
function costPrior(partition) {
  const part = rows[partition];
  const w = part.map((r) => (pick(r, RES) !== null && cheapestClassAccuracy(r) !== null ? 1 : 0));
  const d = part.map((r, i) => (w[i] ? r.actions[pick(r, RES)].o - cheapestClassAccuracy(r) : 0));
  const usable = part.filter((r, i) => w[i]);
  const paired95 = bootstrapMean(boot(partition), d, w);
  return { n: usable.length, resourceAccuracy: mean(usable.map((r) => r.actions[pick(r, RES)].o)), cheapestClassUniformAccuracy: mean(usable.map(cheapestClassAccuracy)),
    meanDifference: mean(usable.map((r) => r.actions[pick(r, RES)].o - cheapestClassAccuracy(r))), paired95,
    COST_PRIOR_EXPLAINS: paired95 !== null && paired95[1] < 0.05, REASONING_BEYOND_COST_PRIOR: paired95 !== null && paired95[0] > 0,
    P_RESOURCE_CHOOSES_ZERO_COST: rate(usable, (r) => r.actions[pick(r, RES)].c === 0), P_ZERO_COST_OPTIMAL: rate(part, zeroCostOptimal),
    P_RESOURCE_CORRECT_GIVEN_ZERO_COST_OPTIMAL: rate(usable.filter(zeroCostOptimal), (r) => r.actions[pick(r, RES)].o === 1),
    P_RESOURCE_CORRECT_GIVEN_NO_ZERO_COST_OPTIMAL: rate(usable.filter((r) => !zeroCostOptimal(r)), (r) => r.actions[pick(r, RES)].o === 1),
    meanCheapestClassSize: mean(usable.map((r) => { const m = Math.min(...Object.values(r.actions).map((a) => a.c)); return Object.values(r.actions).filter((a) => a.c === m).length; })) };
}
const resourceArtifact = Object.fromEntries(ALL.map((p) => [p, costPrior(p)]));

/* ---------------------------------------------------------- phase 5: complementarity */
const oracleSummary = (part, members) => { const o = perfectSelector(part, members, pick, CONTROL);
  return { members, accuracy: mean(o.map((x) => x.correct)), meanRegret: mean(o.map((x) => x.regret)), meanNormalizedRegret: mean(o.map((x) => x.normalized)), coverage: mean(o.map((x) => (x.covered ? 1 : 0))) }; };
function complementarity(partition, setName) {
  const part = rows[partition]; const members = SETS[setName];
  const full = oracleSummary(part, members);
  const bests = part.map((r) => bestSet(r, members, pick));
  const perPolicy = Object.fromEntries(members.map((p) => {
    const bestRows = part.filter((r, i) => bests[i].best.includes(p));
    const uniqueRows = part.filter((r, i) => bests[i].best.length === 1 && bests[i].best[0] === p);
    const misselected = part.filter((r, i) => pick(r, p) !== null && !bests[i].best.includes(p));
    const without = oracleSummary(part, members.filter((m) => m !== p));
    const lift = Object.fromEntries(Object.entries(BINARY).map(([name, fn]) => {
      const base = rate(part, fn); const inside = rate(uniqueRows, fn);
      return [name, { prevalence: base, inUniquelyBest: inside, lift: base && inside !== null ? inside / base : null }];
    }));
    return [p, {
      uniquelyBestN: uniqueRows.length, tiedBestN: bestRows.length - uniqueRows.length, bestN: bestRows.length,
      accuracyWhenBest: mean(bestRows.map((r) => r.actions[pick(r, p)].o)), meanRegretWhenBest: mean(bestRows.map((r) => r.actions[pick(r, p)].r)),
      accuracyWhenUniquelyBest: mean(uniqueRows.map((r) => r.actions[pick(r, p)].o)),
      regretAvoidedVsResourcePerEpisode: p === RES ? 0 : uniqueRows.filter((r) => pick(r, RES) !== null).reduce((s, r) => s + r.actions[pick(r, RES)].r - r.actions[pick(r, p)].r, 0) / part.length,
      regretIntroducedWhenMisselected: mean(misselected.map((r) => r.actions[pick(r, p)].r - bestSet(r, members, pick).bestRegret)),
      misselectedN: misselected.length,
      marginal: { accuracyGain: full.accuracy - without.accuracy, meanRegretReduction: without.meanRegret - full.meanRegret,
        meanNormalizedRegretReduction: without.meanNormalizedRegret - full.meanNormalizedRegret, oracleWithout: without },
      uniquelyBestRegimeLift: lift,
    }];
  }));
  const jaccard = {};
  for (const a of members) for (const b of members) if (a < b) {
    const A = new Set(part.filter((r, i) => bests[i].best.includes(a)).map((r) => r.recordHash));
    const B = part.filter((r, i) => bests[i].best.includes(b)).map((r) => r.recordHash);
    const inter = B.filter((h) => A.has(h)).length; const union = A.size + B.length - inter;
    jaccard[`${a}|${b}`] = union ? inter / union : null;
  }
  const labels = bests.map((b) => (b.best.length === 0 ? 'NONE_AVAILABLE' : b.best.length === 1 ? b.best[0] : 'TIE'));
  return { set: setName, members, oracle: full, bestLabelShare: distribution(labels), perPolicy, jaccardOfBestSets: jaccard };
}
const complement = Object.fromEntries(ALL.map((partition) => [partition, Object.fromEntries(Object.keys(SETS).map((s) => [s, complementarity(partition, s)]))]));

function headroom(partition, setName) {
  const part = rows[partition];
  const o = perfectSelector(part, SETS[setName], pick, CONTROL);
  const bestKey = (r) => pick(r, BEST) ?? pick(r, CONTROL);
  const dAcc = part.map((r, i) => o[i].correct - r.actions[bestKey(r)].o);
  const dReg = part.map((r, i) => r.actions[bestKey(r)].r - o[i].regret);
  const dNr = part.map((r, i) => normalizedRegret(r, bestKey(r)) - o[i].normalized);
  const plan95 = boot(partition);
  return { set: setName, bestSingle: BEST, accuracyHeadroom: mean(dAcc), accuracyHeadroom95: bootstrapMean(plan95, dAcc),
    meanRegretHeadroom: mean(dReg), meanRegretHeadroom95: bootstrapMean(plan95, dReg), normalizedRegretHeadroom: mean(dNr), normalizedRegretHeadroom95: bootstrapMean(plan95, dNr),
    relativeRegretRecovered: (() => { const base = mean(part.map((r) => r.actions[bestKey(r)].r)); return base ? mean(dReg) / base : null; })() };
}
const headrooms = Object.fromEntries(ALL.map((partition) => [partition, Object.fromEntries(Object.keys(SETS).map((s) => [s, headroom(partition, s)]))]));
const cascadeGain = Object.fromEntries(ALL.map((partition) => {
  const part = rows[partition]; const bestKey = (r) => pick(r, BEST) ?? pick(r, CONTROL);
  const d = part.map((r) => r.actions[cascadeChoice(r)].o - r.actions[bestKey(r)].o);
  return [partition, { accuracyGainOverBestSingle: mean(d), paired95: bootstrapMean(boot(partition), d) }];
}));
const ROUTING_HEADROOM_MATERIAL = headrooms.HOLDOUT.HISTORICAL_ROUTED.accuracyHeadroom95[0] >= 0.05;

/* competence matrix: every cell is computed from evidence */
const AXES = { temporal_LONG_HORIZON: BINARY.LONG_HORIZON, temporal_HORIZON_DEPENDENT: BINARY.HORIZON_DEPENDENT, relational_BOTTLENECK: BINARY.BOTTLENECK,
  relational_CRITICAL_DEPENDENCY: BINARY.CRITICAL_DEPENDENCY, resource_LOW_ENERGY: BINARY.LOW_ENERGY, objective_MULTI_OBJECTIVE: BINARY.MULTI_OBJECTIVE,
  threat_UNSUPPORTED_THREAT: BINARY.UNSUPPORTED_THREAT, hostile: BINARY.HOSTILE_PRESENT, nonHostile: (r) => !BINARY.HOSTILE_PRESENT(r),
  lowCost_ZERO_COST_OPTIMAL: BINARY.ZERO_COST_OPTIMAL, highCost_NO_ZERO_COST_OPTIMAL: (r) => !BINARY.ZERO_COST_OPTIMAL(r),
  sparseSurface: BINARY.SPARSE_SURFACE, denseSurface: (r) => !BINARY.SPARSE_SURFACE(r), all: () => true };
function competenceMatrix(partition) {
  const part = rows[partition];
  return Object.fromEntries(DEPLOYABLE.map((p) => {
    const set = SETS[plan.complementarity.marginalSet[p]];
    return [p, Object.fromEntries(Object.entries(AXES).map(([axis, fn]) => {
      const sub = part.filter(fn); const acting = sub.filter((r) => pick(r, p) !== null);
      const unique = sub.filter((r) => { const b = bestSet(r, set, pick).best; return b.length === 1 && b[0] === p; });
      return [axis, { n: sub.length, proposingN: acting.length, accuracy: mean(acting.map((r) => r.actions[pick(r, p)].o)), uniquelyBestShare: sub.length ? unique.length / sub.length : null }];
    }))];
  }));
}
const competence = { HOLDOUT: competenceMatrix('HOLDOUT'), OOD: competenceMatrix('OOD'), CAL: competenceMatrix('CAL') };

/* ---------------------------------------------------------- phase 6: classification */
function classificationInputs(partition, p) {
  const m = results[partition].policies[p]; const setName = plan.complementarity.marginalSet[p];
  const c = complement[partition][setName].perPolicy[p];
  return { proposingN: m.proposingN, nuisanceDependence: replicated[p].ANY_NUISANCE_DEPENDENCE,
    artifactExplains: p === RES ? resourceArtifact.HOLDOUT.COST_PRIOR_EXPLAINS : false,
    marginalAccuracyGain: c.marginal.accuracyGain, marginalNormalizedRegretReduction: c.marginal.meanNormalizedRegretReduction,
    aboveChance: m.aboveChance.ABOVE_CHANCE, accuracyWhenBest: c.accuracyWhenBest, marginalSet: setName };
}
const classification = Object.fromEntries(DEPLOYABLE.map((p) => {
  const inputs = classificationInputs('HOLDOUT', p);
  const holdoutAcc = results.HOLDOUT.policies[p].accuracy; const oodAcc = results.OOD.policies[p].accuracy;
  return [p, { class: classifyPolicy(inputs), calClass: classifyPolicy(classificationInputs('CAL', p)), inputs,
    annotations: [holdoutAcc !== null && oodAcc !== null && oodAcc - holdoutAcc <= -0.10 ? 'OOD_DEGRADES' : 'OOD_HOLDS',
      ...(results.HOLDOUT.policies[p].coverage < 0.10 ? ['LOW_COVERAGE'] : [])] }];
}));
const RESOURCE_VERDICT = resourceVerdict({ costPriorExplains: resourceArtifact.HOLDOUT.COST_PRIOR_EXPLAINS,
  reasoningBeyondCostPrior: resourceArtifact.HOLDOUT.REASONING_BEYOND_COST_PRIOR, nuisanceDependence: replicated[RES].ANY_NUISANCE_DEPENDENCE });

/* historical comparison (Stage 3F.6-P, Forge V1 DEV+CAL): descriptive; different worlds and regret scale */
const historical = readJson('artifacts/stage3f6p-policy-quality/stage3f6p-certification-result.json');
const alias = (p) => (p === 'NEXUS_SELECTOR_V1' ? 'NEXUS_SELECTOR' : p);
const historicalComparison = Object.fromEntries([...DEPLOYABLE, CONTROL, GREEDY].map((p) => {
  const h = historical.absoluteQuality[alias(p)]?.overall ?? null; const now = results.HOLDOUT.policies[p];
  const hClass = historical.classification[alias(p)] ?? null; const nowClass = classification[p]?.class ?? null;
  return [p, { historicalAccuracy: h?.accuracy ?? null, symmetricHoldoutAccuracy: now.accuracy, accuracyChange: h ? now.accuracy - h.accuracy : null,
    historicalCoverage: h?.coverage ?? null, symmetricHoldoutCoverage: now.coverage,
    historicalClass: hClass, symmetricClass: nowClass, conclusion: hClass === null || nowClass === null ? 'NOT_CLASSIFIED_HISTORICALLY' : hClass === nowClass ? 'SURVIVES' : 'INVALIDATED' }];
}));
historicalComparison.ORACLE_HISTORICAL_ROUTED = { historicalAccuracy: historical.ceilings.ORACLE_CURRENT_POLICY_SET.accuracy,
  symmetricHoldoutAccuracy: complement.HOLDOUT.HISTORICAL_ROUTED.oracle.accuracy,
  accuracyChange: complement.HOLDOUT.HISTORICAL_ROUTED.oracle.accuracy - historical.ceilings.ORACLE_CURRENT_POLICY_SET.accuracy };

/* ================================================================ integrity */
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const git = (...args) => spawnSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' });
const freeze = (() => {
  const planRepoPath = `platform/game-agnostic/${STAGE3F6P1E_PLAN_PATH}`;
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', planRepoPath).stdout.trim().split('\n').filter(Boolean);
  const freezeCommit = commits[commits.length - 1] ?? null;
  const files = freezeCommit ? git('show', '--name-only', '--format=', freezeCommit).stdout.trim().split('\n').filter(Boolean) : [];
  const planChangedSince = freezeCommit ? git('diff', '--name-only', freezeCommit, 'HEAD', '--', planRepoPath, `platform/game-agnostic/${OPEN_REPORT_PATH}`,
    'platform/game-agnostic/scripts/stage3f6p1e-analysis-plan.mjs').stdout.trim() : 'NO_FREEZE_COMMIT';
  return {
    freezeCommit, filesInFreezeCommit: files,
    planAndOpenReportInFreezeCommit: files.includes(planRepoPath) && files.includes(`platform/game-agnostic/${OPEN_REPORT_PATH}`),
    noSealedArtifactInFreezeCommit: !files.some((f) => /policy-evidence-sealed|stage3f6p1e-certification-result/.test(f)),
    planUnchangedSinceFreeze: planChangedSince === '',
    planAndOpenReportAtHead: [STAGE3F6P1E_PLAN_PATH, OPEN_REPORT_PATH].every((f) => headBytesHash(f) === hex(readFileSync(at(f)))),
  };
})();
freeze.FROZEN_BEFORE_HOLDOUT = freeze.freezeCommit !== null && freeze.planAndOpenReportInFreezeCommit && freeze.noSealedArtifactInFreezeCommit && freeze.planUnchangedSinceFreeze && freeze.planAndOpenReportAtHead;

const planFile = readJson(STAGE3F6P1E_PLAN_PATH);
const sourcesNow = Object.fromEntries(STAGE3F6P1E_POLICY_SOURCES.map((f) => [f, hex(readFileSync(at(f)))]));
const policyIntegrity = {
  planFileMatchesModule: planFile.planHash === STAGE3F6P1E_PLAN_HASH && planFile.policySetHash === STAGE3F6P1E_POLICY_SET_HASH,
  policySourcesMatchFrozenPlan: STAGE3F6P1E_POLICY_SOURCES.every((f) => planFile.policySet.sourceSha256[f] === sourcesNow[f]),
  policySourcesMatchHead: STAGE3F6P1E_POLICY_SOURCES.every((f) => headBytesHash(f) === sourcesNow[f]),
};

const corpusManifest = readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json');
const allRows = ALL.flatMap((p) => rows[p]);
const pairOverlap = (field) => { let total = 0; for (let i = 0; i < ALL.length; i += 1) for (let j = i + 1; j < ALL.length; j += 1) {
  const a = new Set(corpus.filter((r) => r.partition === ALL[i]).map((r) => r[field])); total += corpus.filter((r) => r.partition === ALL[j] && a.has(r[field])).length; } return total; };
const equivarianceFlags = corpus.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const corpusIntegrity = {
  contentHash: corpusManifest.contentHash, contentHashBound: corpusManifest.contentHash === plan.corpus.contentHash,
  counts: Object.fromEntries(ALL.map((p) => [p, rows[p].length])),
  RECORD_OVERLAP: pairOverlap('recordHash'), STATE_OVERLAP: pairOverlap('worldHash'), TOPOLOGY_OVERLAP: pairOverlap('topologyHash'),
  DUPLICATE_RECORD_HASHES: corpus.length - new Set(corpus.map((r) => r.recordHash)).size,
  equivarianceTransformChecks: equivarianceFlags.length,
  SYMMETRY_CHECKS: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, rate(equivarianceFlags, (x) => x[k] === 1)])),
  stage3f6p1dCertificate: readJson('artifacts/stage3f6p1d-symmetric-corpus/stage3f6p1d-certification-result.json').certificationHash === plan.corpus.stage3f6p1dCertification,
  stage3f6p1cCertificate: readJson('artifacts/stage3f6p1c-symmetric-benchmark/stage3f6p1c-certification-result.json').certificationHash === plan.corpus.stage3f6p1cCertification,
  stage3f6pCertificate: historical.certificationHash === plan.corpus.historicalStage3f6pCertification,
};
const evidenceIntegrity = (() => {
  const all = [...open.rows, ...sealed.rows];
  const bound = (m, phase, parts) => m.planHash === STAGE3F6P1E_PLAN_HASH && m.policySetHash === STAGE3F6P1E_POLICY_SET_HASH
    && m.corpusContentHash === plan.corpus.contentHash && m.phase === phase && m.partitions.join(',') === parts.join(',');
  return {
    openContent: open.contentOk, sealedContent: sealed.contentOk,
    openBound: bound(open.manifest, 'open', OPEN_PARTITIONS), sealedBound: bound(sealed.manifest, 'sealed', SEALED_PARTITIONS),
    rows: all.length, everyCorpusRowCovered: corpus.every((r) => evidence.has(r.recordHash)) && all.length === corpus.length,
    FIDELITY_WORLD: rate(all, (e) => e.fidelity.world === 1), FIDELITY_SURFACE: rate(all, (e) => e.fidelity.surface === 1),
    FIDELITY_CHOICES: rate(all, (e) => e.fidelity.choices === 1),
    FIDELITY_TWIN_MAPPING: rate(all.filter((e) => e.twins !== null), (e) => e.fidelity.twinMapping === 1),
    twinRows: all.filter((e) => e.twins !== null).length,
  };
})();
const replay = (() => {
  let compared = 0; let identical = 0;
  for (const p of ALL) for (const row of corpus.filter((r) => r.partition === p).slice(0, 50)) {
    compared += 1; if (JSON.stringify(evidenceFor(row)) === JSON.stringify(evidence.get(row.recordHash))) identical += 1;
  }
  for (const p of ALL) for (const row of corpus.filter((r) => r.partition === p && r.equivariance !== null).slice(0, 10)) {
    compared += 1; if (JSON.stringify(evidenceFor(row)) === JSON.stringify(evidence.get(row.recordHash))) identical += 1;
  }
  return { compared, identical, DETERMINISTIC: compared === identical && compared > 0 };
})();
const metricVerification = {
  oracleNeverWorseThanMember: ALL.every((p) => Object.values(SETS).every((members) => {
    const o = perfectSelector(rows[p], members, pick, CONTROL);
    return rows[p].every((r, i) => members.every((m) => pick(r, m) === null || r.actions[pick(r, m)].r >= o[i].regret));
  })),
  marginalNonNegative: ALL.every((p) => Object.values(complement[p]).every((c) => Object.values(c.perPolicy).every((x) => x.marginal.accuracyGain >= -1e-12 && x.marginal.meanRegretReduction >= -1e-12))),
  normalizedRegretBounded: allRows.every((r) => REPORTED.every((p) => pick(r, p) === null || (normalizedRegret(r, pick(r, p)) >= 0 && normalizedRegret(r, pick(r, p)) <= 1))),
  optimalIffZeroRegret: allRows.every((r) => Object.values(r.actions).every((a) => (a.o === 1) === (a.r === 0))),
  storedChoicesLegal: allRows.every((r) => REPORTED.every((p) => pick(r, p) === null || pick(r, p) in r.actions)),
  expectationsBounded: allRows.every((r) => { const u = uniformLegalAccuracy(r); const c = cheapestClassAccuracy(r); return u >= 0 && u <= 1 && (c === null || (c >= 0 && c <= 1)); }),
};
const selfSource = readFileSync(at('scripts/certify-stage3f6p1e-policy-requalification.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const staticAudit = {
  NO_ROUTER_TRAINING: !/fitPolicyRouter\(|fitLogisticRegression\(|scoreMatrix\(/.test(selfSource),
  NO_DECISION_RULE_TUNING: !/from '[^']*decision-rule-v1|routeEpisode\(/.test(selfSource),
  NO_POLICY_WRITE: !/writeFile\([^)]*src\//.test(selfSource),
};

let predecessorChecks = { skipped: true };
if (!skipPredecessors) {
  const run = (script) => { const r = spawnSync(process.execPath, [script, '--check'], { cwd: root, encoding: 'utf8' });
    try { const out = JSON.parse(r.stdout); return r.status === 0 && out.reproduced === true; } catch { return false; } };
  predecessorChecks = { stage3f6p1c: run('scripts/certify-stage3f6p1c-symmetric-benchmark.mjs'), stage3f6p1d: run('scripts/certify-stage3f6p1d-symmetric-corpus.mjs'),
    stage3f6p: run('scripts/certify-stage3f6p-policy-quality.mjs') };
}
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const r = spawnSync(process.execPath, ['--test', 'tests/stage3f6p1e-policy-requalification.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = r.status ?? 1;
  const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}

const checks = {
  PREDECESSORS_REPRODUCE: skipPredecessors || Object.values(predecessorChecks).every(Boolean),
  PREDECESSOR_CERTIFICATES_INTACT: corpusIntegrity.stage3f6p1dCertificate && corpusIntegrity.stage3f6p1cCertificate && corpusIntegrity.stage3f6pCertificate,
  CORPUS_BOUND: corpusIntegrity.contentHashBound,
  CORPUS_LINEAGE_CLEAN: corpusIntegrity.RECORD_OVERLAP === 0 && corpusIntegrity.STATE_OVERLAP === 0 && corpusIntegrity.TOPOLOGY_OVERLAP === 0 && corpusIntegrity.DUPLICATE_RECORD_HASHES === 0,
  SYMMETRY_INTACT: Object.values(corpusIntegrity.SYMMETRY_CHECKS).every((v) => v === 1),
  PLAN_BOUND: policyIntegrity.planFileMatchesModule,
  FROZEN_BEFORE_HOLDOUT: freeze.FROZEN_BEFORE_HOLDOUT,
  OPEN_PHASE_REPRODUCED,
  POLICY_DEFINITIONS_UNCHANGED: policyIntegrity.policySourcesMatchFrozenPlan && policyIntegrity.policySourcesMatchHead,
  EVIDENCE_BOUND: evidenceIntegrity.openContent && evidenceIntegrity.sealedContent && evidenceIntegrity.openBound && evidenceIntegrity.sealedBound && evidenceIntegrity.everyCorpusRowCovered,
  EVIDENCE_FIDELITY: evidenceIntegrity.FIDELITY_WORLD === 1 && evidenceIntegrity.FIDELITY_SURFACE === 1 && evidenceIntegrity.FIDELITY_CHOICES === 1 && evidenceIntegrity.FIDELITY_TWIN_MAPPING === 1,
  EVIDENCE_REPLAY_DETERMINISTIC: replay.DETERMINISTIC,
  METRICS_VERIFIED: Object.values(metricVerification).every(Boolean),
  NO_ROUTER_TRAINING_OR_TUNING: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: plan.authority.tier === 'R0' && !plan.authority.canDispatch && !plan.authority.canMutateLiveWorld && !plan.authority.onlineLearningEnabled && !plan.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const readiness = {
  SYMMETRY_CERTIFIED: checks.PREDECESSOR_CERTIFICATES_INTACT && checks.SYMMETRY_INTACT && checks.PREDECESSORS_REPRODUCE,
  CORPUS_LINEAGE_CLEAN: checks.CORPUS_BOUND && checks.CORPUS_LINEAGE_CLEAN,
  POLICY_RESULTS_REPRODUCIBLE: checks.EVIDENCE_FIDELITY && checks.EVIDENCE_REPLAY_DETERMINISTIC,
  AFFECTED_POLICIES_REQUALIFIED: status === 'PASS' && DEPLOYABLE.every((p) => typeof classification[p].class === 'string'),
  EXPERT_DIVERSITY_READY: status === 'PASS',
  ROUTER_VALUE_AUDIT_READY: status === 'PASS',
  ROUTING_HEADROOM_MATERIAL,
  R0_INTACT: checks.AUTHORITY_R0,
  READY_FOR_STAGE3G: false,
};

const payload = roundDeep({
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6P1E_PLAN_HASH, policySetHash: STAGE3F6P1E_POLICY_SET_HASH,
  openPhaseReportHash: openStored.reportHash, evidence: { open: open.manifest.contentHash, sealed: sealed.manifest.contentHash },
  benchmark: { BENCHMARK_ID: plan.corpus.benchmarkId, stage3f6p1cCertification: plan.corpus.stage3f6p1cCertification },
  corpus: corpusIntegrity, freeze, policyIntegrity, evidenceIntegrity, replay, calSelections: SEL, devThresholds: openStored.devThresholds,
  results, shortcut, replicatedFlags: replicated, resourceArtifact, complementarity: complement, headroom: headrooms, cascadeGain, competence,
  classification, resourceVerdict: RESOURCE_VERDICT, historicalComparison, metricVerification, staticAudit, predecessorChecks,
  disclosures: {
    LEVEL_COVERAGE: `DEV and CAL contain curriculum levels ${HOLDOUT_SUPPORTED_LEVELS.join(',')} only (the corpus plan declared 0-5; admission quotas fill before higher levels). HOLDOUT adds level 2; OOD is 6-7. HOLDOUT is also reported on the DEV/CAL-supported levels.`,
    SEALED_PRIOR_EXPOSURE: plan.partitions.priorExposure,
    SEED_FAMILY: plan.shortcutAudit.nuisanceFactors.SEED_FAMILY,
    ORACLE_FALLBACK: plan.complementarity.oracleFallback,
    RAW_REGRET_SCALE: 'raw regret and the catastrophic bar (100) come from a different corpus scale; normalized regret and accuracy are the comparable quantities',
    PREDECESSOR_STAGE3F5_STAGE3F6: 'Stage 3F.5 (documented SUPERSEDED by 3F.6-R) and Stage 3F.6 prediction reliability do not reproduce on --check because 3F.6-R changed the runtime they certified; Stage 3F.6 has no erratum. Neither is an input to this stage.',
  },
  scope: { newOwners: ['scripts/stage3f6p1e-analysis-plan.mjs', 'scripts/generate-stage3f6p1e-policy-evidence.mjs', 'scripts/certify-stage3f6p1e-policy-requalification.mjs',
    'src/stage3f/policy-requalification-v1.js', 'tests/stage3f6p1e-policy-requalification.test.js'], existingOwnersModified: ['package.json', '.gitignore'],
  policiesModified: false, routerTrained: false, benchmarkModified: false, corpusModified: false, stage3gStarted: false },
  checks, tests: testMetrics, readiness, authority: plan.authority,
  roadmap: { STAGE3F_STATUS: status === 'PASS' ? 'OPEN_REQUALIFICATION_IN_PROGRESS' : 'BLOCKED', ...readiness },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6P1E_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    classification: Object.fromEntries(Object.entries(classification).map(([p, c]) => [p, c.class])), resourceVerdict: RESOURCE_VERDICT, readiness }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
