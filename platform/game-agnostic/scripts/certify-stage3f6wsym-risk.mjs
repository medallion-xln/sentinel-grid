#!/usr/bin/env node
/* STAGE_3F_6_W_SYM — RISK-STATE SYMMETRIC REQUALIFICATION certification.
 *
 * Measurement only. Re-extracts the unmodified Stage 3F.6-W risk state on FORGE_SYMMETRIC_V2 decision surfaces,
 * audits every historical W field for deployability and shortcut exposure, measures risk-signal quality against
 * decision-relevant targets, separates risk-signal value from router value with the unmodified Stage 3F.6-T router
 * methodology, and classifies every historical W claim.
 *
 *   --phase=open   DEV fits, CAL selects; writes the open-phase report. No fresh, HOLDOUT or OOD row is scored.
 *   (default)      requires the committed open-phase report (recomputed byte for byte) and the fresh confirmatory
 *                  partitions, then evaluates WSYM_HOLDOUT and WSYM_OOD (primary) and the seed-family samples.
 *   --check        recomputes everything and requires a byte-identical certification.
 */
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORE_IDS, HISTORICAL_W, HISTORICAL_W_HASH, STAGE3F6WSYM_OUT, STAGE3F6WSYM_PLAN, STAGE3F6WSYM_PLAN_HASH, STAGE3F6WSYM_PLAN_PATH, STAGE3F6WSYM_SEED_PLAN,
  STAGE3F6WSYM_SEED_PLAN_HASH } from './stage3f6wsym-analysis-plan.mjs';
import { EVALUATION_FILES, FRESH_MANIFEST_PATH, FRESH_PARTITIONS, FRESH_PATH, OPEN_REPORT_PATH, readPriorLineage, seedAudit } from './generate-stage3f6wsym-confirmatory.mjs';
import { PRIV_FEATURES, riskEvidence } from './stage3f6wsym-evidence.mjs';
import { readCorpus } from './generate-stage3f6p1e-policy-evidence.mjs';
import { STAGE3F6TSYM_FEATURE_SET } from './stage3f6tsym-analysis-plan.mjs';
import {
  POLICY_SET_HASH, ROUTED_POLICIES, availablePolicies, bestLabel, bestPolicySet, evaluateStrategy, falseSelectionHarm, fitPolicyRouter, oracleGainCaptured,
  pairedBootstrap, policyRouterHash, routeEpisode, scorePolicies,
} from '../src/stage3f/policy-router-v1.js';
import { DECISION_RISK_STATE_CONTRACT_HASH, RISK_STATE_FIELDS } from '../src/stage3f/decision-risk-state-v1.js';
import { STAGE3F6_METHODOLOGY } from '../src/stage3f/prediction-reliability-v1.js';
import { bootstrapMean, bootstrapPlan, factorGap, pairedFlag, quantile } from '../src/stage3f/policy-requalification-v1.js';
import { atThreshold, aurocOf, averagePrecision, brier, ece10, f1Threshold, fitBinaryLogistic, materiality, predictBinary } from '../src/stage3f/router-value-v1.js';
import { claimVerdict } from '../src/stage3f/nexus-requalification-v1.js';
import {
  RISK_FIELD_IDS, classifyWField, contractFlags, eta, incrementVerdict, pairedAurocDelta, pearson, riskClassification,
} from '../src/stage3f/risk-requalification-v1.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(root, '..', '..');
const at = (r) => path.join(root, r);
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (r) => JSON.parse(readFileSync(at(r), 'utf8'));
const phaseOpen = process.argv.includes('--phase=open');
const checkOnly = process.argv.includes('--check');
const skipTests = process.argv.includes('--skip-tests');
const skipPredecessors = process.argv.includes('--skip-predecessors');
const RESULT = `${STAGE3F6WSYM_OUT}/stage3f6wsym-certification-result.json`;
const plan = STAGE3F6WSYM_PLAN;
const RES = 'RESOURCE_PRESERVING_V1'; const NEX = 'NEXUS_SELECTOR'; const OBJ = 'OBJECTIVE_TARGETING_V1'; const THR = 'THREAT_COVERING_V1';
const SLOT_SOURCE = { [RES]: RES, [NEX]: 'NEXUS_SELECTOR_V1', [OBJ]: OBJ, [THR]: THR };
const CATASTROPHIC = STAGE3F6_METHODOLOGY.catastrophicRegret;
const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
const roundDeep = (v) => (Array.isArray(v) ? v.map(roundDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) : round(v));
const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const rate = (l, fn) => (l.length ? l.filter(fn).length / l.length : null);
const timing = {};
const tick = (label, t0) => { timing[label] = Date.now() - t0; };

/* ================================================================== rows */
/** Router row in the historical shape (NEXUS slot = V1) whose `core` also carries risk, diagnostic and privileged values. */
function wRow(r, ev) {
  const chosen = {}; const regret = {}; const correct = {};
  for (const [slot, p] of Object.entries(SLOT_SOURCE)) { const k = r.policies[p]; chosen[slot] = k; if (k !== null) { regret[slot] = r.actions[k].r; correct[slot] = r.actions[k].o; } }
  const d = ev.diagnostic;
  const core = { ...r.core, ...ev.risk, ...d.objective, ...d.spatial, ...(d.temporal ?? {}), ...ev.priv };
  return { partition: r.partition, recordHash: r.recordHash, combination: r.combination, orientation: r.orientation, core, riskStatus: ev.status, temporalAvailable: d.temporal !== null,
    label: r.label, actions: r.actions, policies: r.policies, lowestMove: r.lowestIdentityMove?.direction ?? null, chosen, regret, correct, maxRegret: Math.max(...Object.values(r.actions).map((a) => a.r)),
    zeroCostOptimal: Object.values(r.actions).some((a) => a.o === 1 && a.c === 0), equivariance: r.equivariance, ev };
}
const nr = (row, p) => (row.chosen[p] === null || row.chosen[p] === undefined ? null : row.maxRegret > 0 ? row.regret[p] / row.maxRegret : 0);
const withEvidence = (rows) => rows.map((r) => wRow(r, riskEvidence(r)));

const corpus = readCorpus();
const byPart = (p) => corpus.filter((r) => r.partition === p);
let t0 = Date.now();
const DEV = withEvidence(byPart('DEV')); const CAL = withEvidence(byPart('CAL'));
tick('evidenceDevCal', t0);

/* ================================================================ targets */
const TARGETS = {
  T0_HISTORICAL: { subset: (r) => [NEX, RES].includes(bestLabel(r)), label: (r) => (bestLabel(r) === NEX ? 1 : 0) },
  T1_CATASTROPHIC_ERROR: { subset: (r) => r.chosen[RES] !== null, label: (r) => (r.regret[RES] >= CATASTROPHIC ? 1 : 0) },
  T2_HIGH_REGRET: { subset: (r) => r.chosen[RES] !== null, label: (r) => (nr(r, RES) >= 0.5 ? 1 : 0) },
  T3_POLICY_DISAGREEMENT: { subset: () => true, label: (r) => (new Set(availablePolicies(r).map((p) => r.regret[p])).size > 1 ? 1 : 0) },
  T4_RESOURCE_FAILURE: { subset: (r) => r.chosen[RES] !== null, label: (r) => (r.correct[RES] === 1 ? 0 : 1) },
  T5_NEXUS_V1_USEFUL: { subset: (r) => r.chosen[NEX] !== null && r.chosen[RES] !== null, label: (r) => (r.regret[NEX] < r.regret[RES] ? 1 : 0) },
  T6_COSTLY_ACTION_OPTIMAL: { subset: () => true, label: (r) => (r.zeroCostOptimal ? 0 : 1) },
};
const DECISION_TARGETS = Object.keys(TARGETS).filter((t) => t !== 'T0_HISTORICAL');
const MIN_CLASS = plan.riskTargets.minPositives;
const classCounts = (rows, t) => { const s = rows.filter(TARGETS[t].subset); const pos = s.filter((r) => TARGETS[t].label(r) === 1).length; return { n: s.length, positives: pos, negatives: s.length - pos }; };
const evaluable = (c) => c.positives >= MIN_CLASS && c.negatives >= MIN_CLASS;

/* ======================================================= feature validity (DEV/CAL) */
const OPEN_ROWS = [...DEV, ...CAL];
const DIAG_FIELDS = { OBJECTIVE: HISTORICAL_W.diagnosticGroups.OBJECTIVE, SPATIAL: HISTORICAL_W.diagnosticGroups.SPATIAL, TEMPORAL: HISTORICAL_W.diagnosticGroups.TEMPORAL };
const twinKey = (id) => (id.startsWith('risk.') ? ['risk', id] : [id.split('.')[0], null]);
function fieldAudit() {
  const out = {};
  const ids = [...RISK_FIELD_IDS, ...Object.values(DIAG_FIELDS).flat()];
  const threatenedMinusUncovered = (r) => r.core['relational.threatenedEntityCount'] - r.core['relational.uncoveredThreatenedCount'];
  for (const id of ids) {
    const inContract = id.startsWith('risk.');
    const values = OPEN_ROWS.map((r) => r.core[id]);
    const available = OPEN_ROWS.every((r) => (inContract ? r.riskStatus[id] === 'AVAILABLE' : typeof r.core[id] === 'number' && Number.isFinite(r.core[id])));
    const devValues = DEV.map((r) => r.core[id]);
    const constant = available && new Set(devValues).size === 1;
    const identicalCore = available ? CORE_IDS.find((c) => OPEN_ROWS.every((r, i) => r.core[c] === values[i])) ?? null : null;
    const identity = available && OPEN_ROWS.every((r, i) => values[i] === threatenedMinusUncovered(r));
    const twinPairs = OPEN_ROWS.filter((r) => r.ev.twins !== null).flatMap((r) => Object.values(r.ev.twins));
    const [bag, field] = twinKey(id);
    const twinInvariant = twinPairs.every((t) => (bag === 'risk' ? t.risk[field] === 1 : t[bag] === 1));
    const relabelInvariant = !inContract || OPEN_ROWS.every((r) => r.ev.fidelity.relabel === 1);
    const separability = {};
    if (available) {
      for (const [t, spec] of Object.entries(TARGETS)) {
        const s = DEV.filter(spec.subset); const a = aurocOf(s.map((r) => r.core[id]), s.map(spec.label));
        separability[t] = a === null ? null : Math.max(a, 1 - a);
      }
    }
    const cf = inContract ? contractFlags(id) : { NON_DEPLOYABLE: false, ORACLE_ONLY: false, ROLLOUT_REQUIRED: false, FUTURE_STATE_REQUIRED: false };
    const flags = { ...cf, LEAKED: Object.values(separability).some((v) => v !== null && v >= 0.99), UNAVAILABLE: !available, DIVERGENT: !relabelInvariant,
      SHORTCUT_CORRELATED: !twinInvariant, REDUNDANT: constant || identicalCore !== null || identity };
    const c = classifyWField(flags);
    out[id] = { inRiskContract: inContract, class: c.class, failing: c.failing, flags, detail: { constantOnDev: constant, identicalToCore: identicalCore,
      identicalToThreatenedMinusUncovered: identity, twinPairs: twinPairs.length, statuses: inContract ? [...new Set(OPEN_ROWS.map((r) => r.riskStatus[id]))].sort() : null,
      maxSeparabilityDev: Math.max(0, ...Object.values(separability).filter((v) => v !== null)) } };
  }
  return out;
}
t0 = Date.now();
const AUDIT = fieldAudit();
tick('fieldAudit', t0);
const VALID = RISK_FIELD_IDS.filter((id) => AUDIT[id].class === 'DEPLOYABLE');
const ACCEPTED_VALID = HISTORICAL_W.accepted.filter((id) => VALID.includes(id));
const THREAT_STRUCTURE = ['risk.threatRelationCount', 'risk.maxThreatPressure', 'risk.threatenedCriticalCount', 'risk.threatenedDependencyCount'];
const temporalUsable = DIAG_FIELDS.TEMPORAL.every((id) => AUDIT[id].flags.UNAVAILABLE === false);

const FEATURE_SETS = {
  CORE: CORE_IDS,
  CORE_PLUS_ACCEPTED: ACCEPTED_VALID.length ? [...CORE_IDS, ...ACCEPTED_VALID] : null,
  CORE_PLUS_VALID_RISK: VALID.length ? [...CORE_IDS, ...VALID] : null,
  VALID_RISK_ONLY: VALID.length ? VALID : null,
  CORE_PLUS_SPATIAL_ABS: [...CORE_IDS, ...DIAG_FIELDS.SPATIAL],
  CORE_PLUS_OBJECTIVE: [...CORE_IDS, ...DIAG_FIELDS.OBJECTIVE],
  CORE_PLUS_TEMPORAL: temporalUsable ? [...CORE_IDS, ...DIAG_FIELDS.TEMPORAL] : null,
  CORE_PLUS_PRIV_GEOMETRY: [...CORE_IDS, ...PRIV_FEATURES],
  CORE_PLUS_PRIV_GEOMETRY_PLUS_VALID_RISK: VALID.length ? [...CORE_IDS, ...PRIV_FEATURES, ...VALID] : null,
};
const SINGLE_FIELD_SETS = Object.fromEntries(THREAT_STRUCTURE.filter((id) => VALID.includes(id)).map((id) => [`CORE_PLUS_${id}`, [...CORE_IDS, id]]));
const ALL_SETS = { ...FEATURE_SETS, ...SINGLE_FIELD_SETS };
const INCREMENTS = {
  ACCEPTED_vs_CORE: ['CORE', 'CORE_PLUS_ACCEPTED'], VALID_RISK_vs_CORE: ['CORE', 'CORE_PLUS_VALID_RISK'], VALID_RISK_vs_ACCEPTED: ['CORE_PLUS_ACCEPTED', 'CORE_PLUS_VALID_RISK'],
  SPATIAL_vs_CORE: ['CORE', 'CORE_PLUS_SPATIAL_ABS'], OBJECTIVE_vs_CORE: ['CORE', 'CORE_PLUS_OBJECTIVE'], TEMPORAL_vs_CORE: ['CORE', 'CORE_PLUS_TEMPORAL'],
  PRIV_vs_CORE: ['CORE', 'CORE_PLUS_PRIV_GEOMETRY'], PRIV_RISK_vs_PRIV: ['CORE_PLUS_PRIV_GEOMETRY', 'CORE_PLUS_PRIV_GEOMETRY_PLUS_VALID_RISK'],
  ...Object.fromEntries(Object.keys(SINGLE_FIELD_SETS).map((k) => [`${k.replace('CORE_PLUS_', '')}_vs_CORE`, ['CORE', k]])),
};
const vec = (r, keys) => keys.map((k) => r.core[k]);

/* ======================================================= risk models (DEV fit, CAL select) */
function fitModels() {
  const out = {};
  for (const [t, spec] of Object.entries(TARGETS)) {
    const dev = DEV.filter(spec.subset); const y = dev.map(spec.label); const cal = CAL.filter(spec.subset); const yc = cal.map(spec.label);
    const counts = { dev: classCounts(DEV, t), cal: classCounts(CAL, t) };
    if (!evaluable(counts.dev) || !evaluable(counts.cal)) { out[t] = { status: 'INSUFFICIENT_EVIDENCE', counts }; continue; }
    const models = {};
    for (const [name, keys] of Object.entries(ALL_SETS)) {
      if (keys === null) { models[name] = { status: 'NOT_EVALUATED' }; continue; }
      const model = fitBinaryLogistic(dev.map((r) => vec(r, keys)), y);
      const pc = cal.map((r) => predictBinary(model, vec(r, keys)));
      models[name] = { status: 'FITTED', keys, model, calThreshold: f1Threshold(pc, yc).threshold, calAuroc: aurocOf(pc, yc), modelHash: hex(JSON.stringify(model)) };
    }
    out[t] = { status: 'FITTED', counts, models };
  }
  return out;
}

/** The historical W DEV field-selection procedure replayed on the symmetric DEV rows (T0, 2 folds by record-hash parity). */
function historicalSelectionReplay() {
  const spec = TARGETS.T0_HISTORICAL; const dev = DEV.filter(spec.subset);
  const fold = (r) => Number.parseInt(r.recordHash[0], 16) % 2;
  const aurocFor = (keys, k) => { const train = dev.filter((r) => fold(r) !== k); const test = dev.filter((r) => fold(r) === k);
    const m = fitBinaryLogistic(train.map((r) => vec(r, keys)), train.map(spec.label)); return aurocOf(test.map((r) => predictBinary(m, vec(r, keys))), test.map(spec.label)); };
  if (!evaluable(classCounts(DEV, 'T0_HISTORICAL'))) return { status: 'INSUFFICIENT_EVIDENCE' };
  const base = [0, 1].map((k) => aurocFor(CORE_IDS, k));
  return { status: 'EVALUATED', rule: 'usable without imputation, not structurally redundant, mean held-fold delta >= 0.005 (historical W)',
    fields: Object.fromEntries(RISK_FIELD_IDS.map((id) => {
      const a = AUDIT[id];
      if (a.flags.UNAVAILABLE) return [id, { accepted: false, reason: 'NOT_USABLE_WITHOUT_IMPUTATION' }];
      if (a.detail.identicalToCore !== null || a.detail.identicalToThreatenedMinusUncovered) return [id, { accepted: false, reason: 'STRUCTURALLY_REDUNDANT' }];
      const deltas = [0, 1].map((k) => aurocFor([...CORE_IDS, id], k) - base[k]);
      return [id, { accepted: mean(deltas) >= 0.005, foldDeltas: deltas, meanDelta: mean(deltas) }];
    })) };
}

/* ======================================================= routers (unmodified 3F.6-T methodology) */
const ROUTER_SETS = { BASE_ROUTER: CORE_IDS, W_ROUTER: FEATURE_SETS.CORE_PLUS_ACCEPTED, W_ROUTER_ALL: FEATURE_SETS.CORE_PLUS_VALID_RISK };
const bestSingleOf = () => {
  const candidates = ROUTED_POLICIES.map((p) => ({ policy: p, ...evaluateStrategy(OPEN_ROWS, () => p) })).filter((e) => e.coverage === 1)
    .sort((a, b) => a.meanRegret - b.meanRegret || ROUTED_POLICIES.indexOf(a.policy) - ROUTED_POLICIES.indexOf(b.policy));
  return { policy: candidates[0]?.policy ?? null, candidates: candidates.map((c) => ({ policy: c.policy, meanRegret: c.meanRegret, accuracy: c.accuracy })) };
};
function calibrate(model, fallbackPolicy) {
  const grid = plan.routers.methodology.confidenceGrid.map((threshold) => {
    const e = evaluateStrategy(CAL, (row) => routeEpisode(model, row, { threshold, fallbackPolicy }).selectedPolicy);
    return { threshold, accuracy: e.accuracy, meanRegret: e.meanRegret, routedShare: rate(CAL, (row) => routeEpisode(model, row, { threshold, fallbackPolicy }).routed) };
  });
  return { grid, threshold: [...grid].sort((a, b) => (a.meanRegret - b.meanRegret) || (b.accuracy - a.accuracy) || (a.threshold - b.threshold))[0].threshold };
}
function softLoss(model, rows) {
  return mean(rows.filter((r) => availablePolicies(r).length > 0).map((r) => {
    const { probabilities } = scorePolicies(model, r); const { best } = bestPolicySet(r);
    return -best.reduce((s, p) => s + (1 / best.length) * Math.log(Math.max(1e-12, probabilities[p])), 0);
  }));
}

/* ================================================================ open phase */
function openPhase() {
  const t = Date.now();
  const fits = fitModels();
  const replay = historicalSelectionReplay();
  const best = bestSingleOf();
  const routers = {};
  for (const [name, keys] of Object.entries(ROUTER_SETS)) {
    if (keys === null) { routers[name] = { status: 'NOT_EVALUATED', reason: 'no historically accepted field is DEPLOYABLE on the symmetric benchmark' }; continue; }
    const model = fitPolicyRouter(DEV, keys);
    const cal = calibrate(model, best.policy);
    routers[name] = { status: 'FITTED', keys, model, routerHash: policyRouterHash(model), calibration: cal, calSoftLoss: softLoss(model, CAL) };
  }
  const replayHash = policyRouterHash(fitPolicyRouter(DEV, CORE_IDS));
  const tsymOpen = readJson('artifacts/stage3f6tsym-router-value/stage3f6tsym-open-phase-report.json');
  const devMedian = (key) => quantile(DEV.map((r) => r.core[key]).sort((a, b) => a - b), 0.5);
  const thresholds = { hostileMedian: devMedian('risk.hostileAliveCount'), energyMedian: devMedian('resources.actorEnergy'), actionMedian: devMedian('actionSurface.legalActionCount') };
  const fidelity = (rows) => Object.fromEntries(['world', 'surface', 'choices', 'relabel', 'twinMapping'].map((k) => [k, rate(rows.filter((r) => r.ev.fidelity[k] !== undefined), (r) => r.ev.fidelity[k] === 1)]));
  const describe = (rows) => Object.fromEntries(Object.entries(routers).filter(([, v]) => v.status === 'FITTED').map(([k, v]) => {
    const e = evaluateStrategy(rows, (row) => routeEpisode(v.model, row, { threshold: v.calibration.threshold, fallbackPolicy: best.policy }).selectedPolicy);
    return [k, { accuracy: e.accuracy, meanRegret: e.meanRegret }];
  }));
  tick('openPhaseModels', t);
  return {
    report: roundDeep({
      schemaVersion: 1, stage: plan.stage, phase: 'OPEN', planHash: STAGE3F6WSYM_PLAN_HASH, seedPlanHash: STAGE3F6WSYM_SEED_PLAN_HASH, historicalWHash: HISTORICAL_W_HASH,
      partitions: ['DEV', 'CAL'], evidenceFidelity: { DEV: fidelity(DEV), CAL: fidelity(CAL) },
      featureAudit: AUDIT, validDeployableWFeatureSet: VALID, validDeployableWFeatureSetHash: hex(JSON.stringify(VALID)), acceptedValid: ACCEPTED_VALID,
      featureSets: ALL_SETS, historicalSelectionReplay: replay,
      riskModels: Object.fromEntries(Object.entries(fits).map(([t, v]) => [t, v.status !== 'FITTED' ? v : { status: v.status, counts: v.counts,
        models: Object.fromEntries(Object.entries(v.models).map(([k, m]) => [k, m.status !== 'FITTED' ? m : { status: m.status, calAuroc: m.calAuroc, calThreshold: m.calThreshold,
          modelHash: m.modelHash, weights: { mu: m.model.mu, sd: m.model.sd, w: m.model.w } }])) }])),
      routers: { bestSingle: best, replayHash, fitDeterministic: routers.BASE_ROUTER.routerHash === replayHash,
        baseRouterIsTsymRouter: routers.BASE_ROUTER.routerHash === tsymOpen.router.routerHash && routers.BASE_ROUTER.calibration.threshold === tsymOpen.router.calibration.threshold,
        headlineCascade: tsymOpen.cascades.HEADLINE,
        fitted: Object.fromEntries(Object.entries(routers).map(([k, v]) => [k, v.status !== 'FITTED' ? v : { keys: v.keys, routerHash: v.routerHash, calibration: v.calibration,
          calSoftLoss: v.calSoftLoss, weights: { mu: v.model.mu, sd: v.model.sd, W: v.model.W } }])) },
      descriptive: { DEV: describe(DEV), CAL: describe(CAL) },
      forensicThresholds: thresholds,
      noSealedRowScored: true,
    }),
    fits, routers, best, thresholds,
  };
}

const open = openPhase();
if (phaseOpen) {
  open.report.reportHash = hex(JSON.stringify(open.report));
  await writeFile(at(OPEN_REPORT_PATH), `${JSON.stringify(open.report, null, 2)}\n`);
  const r = open.report;
  console.log(JSON.stringify({ phase: 'OPEN', reportHash: r.reportHash, valid: r.validDeployableWFeatureSet, acceptedValid: r.acceptedValid,
    classes: Object.fromEntries(Object.entries(r.featureAudit).map(([k, v]) => [k, v.class])), routers: { bestSingle: r.routers.bestSingle.policy, fitDeterministic: r.routers.fitDeterministic,
      baseRouterIsTsymRouter: r.routers.baseRouterIsTsymRouter, thresholds: Object.fromEntries(Object.entries(r.routers.fitted).map(([k, v]) => [k, v.calibration?.threshold ?? v.status])) },
    calAuroc: Object.fromEntries(Object.entries(r.riskModels).map(([t, v]) => [t, v.status !== 'FITTED' ? v.status : Object.fromEntries(Object.entries(v.models).map(([k, m]) => [k, m.calAuroc ?? m.status]))])),
    counts: Object.fromEntries(Object.entries(r.riskModels).map(([t, v]) => [t, v.counts])), replay: r.historicalSelectionReplay, descriptive: r.descriptive, timing }, null, 2));
  process.exit(0);
}

/* ============================================================ confirmatory */
/* predecessors run concurrently with the evaluation; their outcome is awaited before the certificate is assembled */
const predecessorRun = skipPredecessors ? null : new Promise((resolve) => {
  const child = spawn(process.execPath, ['scripts/certify-stage3f6p1sym-nexus.mjs', '--check'], { cwd: root });
  let out = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', () => {});
  child.on('close', (code) => { try { resolve(code === 0 && JSON.parse(out).reproduced === true); } catch { resolve(false); } });
});

const openStored = readJson(OPEN_REPORT_PATH);
const openRecomputed = { ...open.report }; openRecomputed.reportHash = hex(JSON.stringify(open.report));
const OPEN_PHASE_REPRODUCED = JSON.stringify(openStored) === JSON.stringify(openRecomputed);
const freshManifest = readJson(FRESH_MANIFEST_PATH);
const freshText = gunzipSync(readFileSync(at(FRESH_PATH))).toString('utf8');
const fresh = freshText.split('\n').filter(Boolean).map((l) => JSON.parse(l));
const BEST = openStored.routers.bestSingle.policy;
const CASCADE = openStored.routers.headlineCascade;
t0 = Date.now();
const PARTS = Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, withEvidence(fresh.filter((r) => r.partition === p))]));
tick('evidenceFresh', t0);

/* seed-family samples: the first 1000 HOLDOUT-level rows of each prior sealed seed (diagnostic) */
const priorLineage = readPriorLineage();
const SEED_FAMILY_SEEDS = [2021, 2022, 2023, 3021];
t0 = Date.now();
const FAMILIES = Object.fromEntries(SEED_FAMILY_SEEDS.map((s) => [s, withEvidence(priorLineage.rows.filter((r) => r.combination.seed === s).slice(0, 1000))]));
tick('evidenceSeedFamilies', t0);

const routerOf = (name) => open.routers[name];
const chooserOf = (name) => {
  const r = routerOf(name); if (r.status !== 'FITTED') return null;
  const threshold = openStored.routers.fitted[name].calibration.threshold;
  return (row) => routeEpisode(r.model, row, { threshold, fallbackPolicy: BEST }).selectedPolicy;
};
const ROUTERS = Object.fromEntries(Object.keys(ROUTER_SETS).map((k) => [k, chooserOf(k)]).filter(([, v]) => v !== null));
/** Matched-threshold diagnostic: every router at threshold 0 separates the feature contribution from the CAL threshold choice. */
const FULL_COVERAGE = Object.fromEntries(Object.keys(ROUTERS).map((k) => [`${k}_FULL_COVERAGE`, (row) => routeEpisode(routerOf(k).model, row, { threshold: 0, fallbackPolicy: BEST }).selectedPolicy]));
const STRATEGIES = {
  ALWAYS_RESOURCE: () => RES, BEST_SINGLE_POLICY: () => BEST,
  FIXED_PRIORITY_CASCADE_HEADLINE: (row) => CASCADE.find((p) => row.chosen[p] !== null) ?? RES,
  ...ROUTERS, ...FULL_COVERAGE,
  PERFECT_POLICY_SELECTOR: (row) => bestPolicySet(row).best[0] ?? null,
};

function summarize(rows, choose) {
  const e = evaluateStrategy(rows, choose);
  const acting = rows.filter((row) => { const p = choose(row); return p !== null && row.chosen[p] !== null; });
  const regrets = acting.map((row) => row.regret[choose(row)]);
  return { n: rows.length, coverage: e.coverage, accuracy: e.accuracy, meanRegret: e.meanRegret, p95Regret: e.p95Regret,
    meanNormalizedRegret: mean(acting.map((row) => nr(row, choose(row)))), catastrophicRate: regrets.length ? regrets.filter((x) => x >= CATASTROPHIC).length / regrets.length : null,
    selectionDistribution: e.selectionDistribution };
}
function compare(rows, chooseA, chooseB, label) {
  const hb = pairedBootstrap(rows, chooseA, chooseB);
  const d = rows.map((row) => { const a = chooseA(row); const b = chooseB(row); return a === null || b === null || row.chosen[a] === null || row.chosen[b] === null ? null : nr(row, a) - nr(row, b); });
  const ci = bootstrapMean(bootstrapPlan(rows.length, `STAGE3F6WSYM:${label}`), d.map((x) => x ?? 0), d.map((x) => (x === null ? 0 : 1)));
  const diff = { n: hb.n, accuracyDifference: hb.accuracyDifference, accuracyCi95: hb.accuracyCi95, regretDifference: hb.regretDifference, regretCi95: hb.regretCi95,
    normalizedRegretDifference: mean(d.filter((x) => x !== null)), normalizedRegretCi95: ci, episodesImproved: hb.episodesImproved, episodesWorsened: hb.episodesWorsened };
  return { ...diff, ...materiality(diff) };
}

/* ---------------------------------------------------------------- risk quality */
function modelMetrics(rows, t, name) {
  const fit = open.fits[t]; if (fit.status !== 'FITTED') return { status: fit.status };
  const m = fit.models[name]; if (m.status !== 'FITTED') return { status: m.status };
  const spec = TARGETS[t]; const sub = rows.filter(spec.subset); const y = sub.map(spec.label);
  const c = { n: sub.length, positives: y.filter((v) => v === 1).length }; c.negatives = c.n - c.positives;
  if (!evaluable(c)) return { status: 'INSUFFICIENT_EVIDENCE', ...c };
  const p = sub.map((r) => predictBinary(m.model, vec(r, m.keys)));
  const base = m.model.positiveRate; const b = brier(p, y); const bRef = brier(y.map(() => base), y);
  return { status: 'EVALUATED', ...c, baseRate: c.positives / c.n, AUROC: aurocOf(p, y), AUPRC: averagePrecision(p, y), BRIER: b, BRIER_SKILL: bRef > 0 ? 1 - b / bRef : null,
    ECE: ece10(p, y), atCalThreshold: atThreshold(p, y, m.calThreshold) };
}
function scoresOf(rows, t, name) { const m = open.fits[t].models[name]; return rows.map((r) => predictBinary(m.model, vec(r, m.keys))); }
function increments(rows, t, partition) {
  const fit = open.fits[t]; const spec = TARGETS[t];
  if (fit.status !== 'FITTED') return { status: fit.status };
  const sub = rows.filter(spec.subset); const y = sub.map(spec.label);
  const c = { n: sub.length, positives: y.filter((v) => v === 1).length }; c.negatives = c.n - c.positives;
  if (!evaluable(c)) return { status: 'INSUFFICIENT_EVIDENCE', ...c };
  const bplan = bootstrapPlan(sub.length, `STAGE3F6WSYM:${partition}:${t}`);
  return Object.fromEntries(Object.entries(INCREMENTS).map(([k, [a, b]]) => {
    if (fit.models[a]?.status !== 'FITTED' || fit.models[b]?.status !== 'FITTED') return [k, { status: 'NOT_EVALUATED' }];
    const d = pairedAurocDelta(scoresOf(sub, t, a), scoresOf(sub, t, b), y, bplan);
    return [k, { status: 'EVALUATED', ...d, ...incrementVerdict(d) }];
  }));
}

/* ---------------------------------------------------------------- forensics (W1) */
const TH = openStored.forensicThresholds;
const CONDITIONS = {
  UNSUPPORTED_THREAT: (r) => r.core['relational.unsupportedThreatenedCount'] > 0, UNCOVERED_THREAT: (r) => r.core['relational.uncoveredThreatenedCount'] > 0,
  THREATENED_CRITICAL: (r) => r.core['risk.threatenedCriticalCount'] > 0, HIGH_HOSTILE: (r) => r.core['risk.hostileAliveCount'] > 0 && r.core['risk.hostileAliveCount'] >= TH.hostileMedian,
  LOW_ENERGY: (r) => r.core['resources.actorEnergy'] <= TH.energyMedian, MULTI_OBJECTIVE: (r) => r.core['context.objectiveCount'] >= 2,
  BOTTLENECK: (r) => r.core['relational.bottleneckCount'] > 0, FEW_ACTIONS: (r) => r.core['actionSurface.legalActionCount'] <= TH.actionMedian,
  LATE_EPISODE: (r) => r.core['context.tickProgress'] >= 0.5,
};
function forensics(rows, choose) {
  const isError = (r) => !bestPolicySet(r).best.includes(choose(r));
  return Object.fromEntries(Object.entries(CONDITIONS).map(([k, fn]) => {
    const inside = rows.filter(fn); const outside = rows.filter((r) => !fn(r));
    const eIn = rate(inside, isError); const eOut = rate(outside, isError);
    return [k, { nIn: inside.length, nOut: outside.length, errorRateIn: eIn, errorRateOut: eOut, errorRatio: eIn !== null && eOut ? eIn / eOut : null,
      supported: inside.length >= 200 && outside.length >= 200 }];
  }));
}

/* ---------------------------------------------------------------- shortcut audit */
const P1E_NAME = { [RES]: RES, [NEX]: 'NEXUS_SELECTOR_V1', [OBJ]: OBJ, [THR]: THR };
function shortcutAudit(rows, name, partition) {
  const choose = ROUTERS[name]; const keys = ROUTER_SETS[name];
  const riskKeys = keys.filter((k) => k.startsWith('risk.'));
  const twinRows = rows.filter((r) => r.ev.twins !== null);
  let pairs = 0; let riskSame = 0; let inputSame = 0; let maskSame = 0; let actionSame = 0;
  for (const r of twinRows) {
    for (const [transform, t] of Object.entries(r.ev.twins)) {
      pairs += 1;
      const rs = VALID.every((id) => t.risk[id] === 1); if (rs) riskSame += 1;
      const is = r.equivariance[transform].coreFeatureInvariant === 1 && riskKeys.every((id) => t.risk[id] === 1); if (is) inputSame += 1;
      const tw = r.ev.policy.twins[transform];
      const ms = ROUTED_POLICIES.every((slot) => (tw[P1E_NAME[slot]] !== null) === (r.chosen[slot] !== null)); if (ms) maskSame += 1;
      const p = choose(r); if (p !== null && tw[P1E_NAME[p]] === r.chosen[p]) actionSame += 1;
    }
  }
  const byOrientation = {};
  for (const r of rows) { const p = choose(r); const o = byOrientation[r.orientation] ?? { n: 0, correct: 0 }; o.n += 1; o.correct += p !== null && r.correct[p] === 1 ? 1 : 0; byOrientation[r.orientation] = o; }
  const levels = Object.fromEntries(Object.entries(byOrientation).sort().map(([k, v]) => [k, { n: v.n, accuracy: v.correct / v.n }]));
  const idDiffs = rows.map((r) => {
    const p = choose(r); if (p === null || r.chosen[p] === null) return null;
    const perm = r.ev.policy.idPermuted.map((m) => { const k = m[P1E_NAME[p]]; return k === null || k === undefined ? 0 : r.actions[k].o; });
    return r.correct[p] - mean(perm);
  }).filter((x) => x !== null);
  return { RISK_SCORE_EQUIVARIANCE: pairs ? riskSame / pairs : null, ROUTER_INPUT_EQUIVARIANCE: pairs ? inputSame / pairs : null,
    AVAILABILITY_EQUIVARIANCE: pairs ? maskSame / pairs : null, ROUTED_ACTION_EQUIVARIANCE: pairs ? actionSame / pairs : null, twinPairs: pairs,
    ORIENTATION_GAP: { byOrientation: levels, ...factorGap(levels) }, ID_PERMUTATION_DELTA: pairedFlag(idDiffs),
    CANDIDATE_ORDER_INVARIANCE: rate(rows, (r) => r.ev.fidelity.relabel === 1), label: `${partition}:${name}` };
}

/* ---------------------------------------------------------------- observability (diagnostic) */
function observability(rows) {
  const hidden = {
    'priv.resourceMove.OBJECTIVE': rows.map((r) => r.core['priv.resourceMove.OBJECTIVE']), 'priv.resourceMove.MATERIAL': rows.map((r) => r.core['priv.resourceMove.MATERIAL']),
    'priv.resourceMove.HOSTILE': rows.map((r) => r.core['priv.resourceMove.HOSTILE']),
    RESOURCE_CHOSE_EAST: rows.map((r) => (r.chosen[RES] !== null && r.actions[r.chosen[RES]].dir === 'EAST' ? 1 : 0)),
    LOWEST_IDENTITY_MOVE_EAST: rows.map((r) => (r.lowestMove === 'EAST' ? 1 : 0)),
  };
  const orientation = rows.map((r) => r.orientation);
  return Object.fromEntries(VALID.map((id) => {
    const v = rows.map((r) => r.core[id]);
    return [id, { orientationEta: eta(orientation, v), ...Object.fromEntries(Object.entries(hidden).map(([k, h]) => [k, pearson(v, h)])) }];
  }));
}

/* ---------------------------------------------------------------- per partition */
t0 = Date.now();
const partitions = {};
for (const [name, rows] of Object.entries(PARTS)) {
  const strategies = Object.fromEntries(Object.entries(STRATEGIES).map(([k, fn]) => [k, summarize(rows, fn)]));
  const pairsToCompare = [['W_ROUTER', 'BASE_ROUTER'], ['W_ROUTER_ALL', 'BASE_ROUTER'], ['W_ROUTER', 'BEST_SINGLE_POLICY'], ['W_ROUTER_ALL', 'BEST_SINGLE_POLICY'],
    ['BASE_ROUTER', 'BEST_SINGLE_POLICY'], ['W_ROUTER', 'FIXED_PRIORITY_CASCADE_HEADLINE'], ['W_ROUTER_ALL', 'FIXED_PRIORITY_CASCADE_HEADLINE'],
    ['W_ROUTER_FULL_COVERAGE', 'BASE_ROUTER_FULL_COVERAGE'], ['W_ROUTER_ALL_FULL_COVERAGE', 'BASE_ROUTER_FULL_COVERAGE']];
  const comparisons = Object.fromEntries(pairsToCompare.map(([a, b]) => [`${a}_vs_${b}`, STRATEGIES[a] && STRATEGIES[b] ? compare(rows, STRATEGIES[a], STRATEGIES[b], `${name}:${a}:${b}`) : { status: 'NOT_EVALUATED' }]));
  const routerDetail = Object.fromEntries(Object.keys(ROUTERS).map((k) => {
    const threshold = openStored.routers.fitted[k].calibration.threshold; const model = routerOf(k).model;
    return [k, { captured: oracleGainCaptured({ router: strategies[k], bestSingle: strategies.BEST_SINGLE_POLICY, oracle: strategies.PERFECT_POLICY_SELECTOR }),
      falseSelectionHarm: falseSelectionHarm(rows, ROUTERS[k]), routedShare: rate(rows, (row) => routeEpisode(model, row, { threshold, fallbackPolicy: BEST }).routed),
      softLoss: softLoss(model, rows), forensics: forensics(rows, ROUTERS[k]), shortcut: shortcutAudit(rows, k, name) }];
  }));
  const nexusBest = rows.filter((r) => bestLabel(r) === NEX);
  partitions[name] = {
    n: rows.length,
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((t) => [t, classCounts(rows, t)])),
    riskQuality: Object.fromEntries(Object.keys(TARGETS).map((t) => [t, Object.fromEntries(Object.keys(ALL_SETS).map((k) => [k, modelMetrics(rows, t, k)]))])),
    increments: Object.fromEntries(Object.keys(TARGETS).map((t) => [t, increments(rows, t, name)])),
    byLevel: Object.fromEntries(['T0_HISTORICAL', 'T1_CATASTROPHIC_ERROR', 'T4_RESOURCE_FAILURE'].map((t) => [t, Object.fromEntries([...new Set(rows.map((r) => r.combination.level))].sort()
      .map((lv) => { const sub = rows.filter((r) => r.combination.level === lv); return [lv, { CORE: modelMetrics(sub, t, 'CORE').AUROC ?? null, CORE_PLUS_VALID_RISK: modelMetrics(sub, t, 'CORE_PLUS_VALID_RISK').AUROC ?? null,
        n: sub.filter(TARGETS[t].subset).length }]; }))])),
    strategies, comparisons, routers: routerDetail,
    nexusCapture: { nexusUniquelyBestN: nexusBest.length, baseRouterSelectsNexus: rate(nexusBest, (r) => ROUTERS.BASE_ROUTER(r) === NEX),
      wRouterSelectsNexus: ROUTERS.W_ROUTER ? rate(nexusBest, (r) => ROUTERS.W_ROUTER(r) === NEX) : null },
    observability: observability(rows),
    evidenceFidelity: Object.fromEntries(['world', 'surface', 'choices', 'relabel', 'twinMapping'].map((k) => [k, rate(rows.filter((r) => r.ev.fidelity[k] !== undefined), (r) => r.ev.fidelity[k] === 1)])),
    riskTwinInvariance: (() => { const tw = rows.filter((r) => r.ev.twins !== null).flatMap((r) => Object.values(r.ev.twins));
      return { pairs: tw.length, ...Object.fromEntries(RISK_FIELD_IDS.map((id) => [id, rate(tw, (t) => t.risk[id] === 1)])), spatial: rate(tw, (t) => t.spatial === 1),
        objective: rate(tw, (t) => t.objective === 1), temporal: rate(tw, (t) => t.temporal === 1) }; })(),
  };
}
tick('evaluation', t0);
const H = partitions.WSYM_HOLDOUT; const O = partitions.WSYM_OOD;
const seedFamilies = Object.fromEntries([...Object.entries(FAMILIES), ['3022', PARTS.WSYM_HOLDOUT]].map(([s, rows]) => [s, Object.fromEntries(['T0_HISTORICAL', 'T1_CATASTROPHIC_ERROR', 'T4_RESOURCE_FAILURE']
  .map((t) => [t, { CORE: modelMetrics(rows, t, 'CORE').AUROC ?? null, CORE_PLUS_VALID_RISK: modelMetrics(rows, t, 'CORE_PLUS_VALID_RISK').AUROC ?? null,
    VALID_RISK_ONLY: modelMetrics(rows, t, 'VALID_RISK_ONLY').AUROC ?? null, n: rows.filter(TARGETS[t].subset).length }]))]));

/* ================================================================ classification */
const inc = (P, t, k) => (P.increments[t]?.[k]?.status === 'EVALUATED' ? P.increments[t][k] : null);
const sig = (P, t, k) => inc(P, t, k)?.significant === true;
const mat = (P, t, k) => inc(P, t, k)?.material === true;
const RISK_INCS = ['VALID_RISK_vs_CORE', 'ACCEPTED_vs_CORE'];
const ALL_TARGETS = Object.keys(TARGETS);
const proxyFor = (t) => sig(H, t, 'VALID_RISK_vs_CORE') && !sig(H, t, 'PRIV_RISK_vs_PRIV');
const riskEquivariant = [H, O].every((P) => VALID.every((id) => P.riskTwinInvariance[id] === 1));
const genuineTargets = DECISION_TARGETS.filter((t) => mat(H, t, 'VALID_RISK_vs_CORE') && sig(O, t, 'VALID_RISK_vs_CORE') && riskEquivariant && !proxyFor(t));
const significantRisk = ALL_TARGETS.filter((t) => RISK_INCS.some((k) => sig(H, t, k)));
const shortcutFields = Object.entries(AUDIT).filter(([, v]) => v.class === 'SHORTCUT_CORRELATED').map(([k]) => k);
const shortcutSignal = shortcutFields.length > 0 && ALL_TARGETS.some((t) => sig(H, t, 'SPATIAL_vs_CORE'));
const validOnlyInformative = ALL_TARGETS.filter((t) => (H.riskQuality[t].VALID_RISK_ONLY?.AUROC ?? 0) >= 0.65);
const oodUnstableTargets = ALL_TARGETS.filter((t) => RISK_INCS.some((k) => sig(H, t, k) && !sig(O, t, k))
  || ((H.riskQuality[t].VALID_RISK_ONLY?.AUROC ?? 0) >= 0.65 && (H.riskQuality[t].VALID_RISK_ONLY.AUROC - (O.riskQuality[t].VALID_RISK_ONLY?.AUROC ?? 0)) > 0.05));
const cmpMaterial = (P, k) => P.comparisons[k]?.MATERIAL === true;
const cmpWorse = (P, k) => P.comparisons[k]?.ACCURACY_WORSE === true || P.comparisons[k]?.NORMALIZED_REGRET_WORSE === true;
const evaluableTargets = ALL_TARGETS.filter((t) => evaluable(H.targetCounts[t]) && open.fits[t].status === 'FITTED');
const classification = riskClassification({
  insufficient: evaluableTargets.length === 0,
  genuine: genuineTargets.length > 0,
  shortcutCorrelated: shortcutSignal,
  weak: significantRisk.length > 0 && genuineTargets.length === 0,
  redundant: validOnlyInformative.length > 0 && significantRisk.length === 0,
  notRoutable: !cmpMaterial(H, 'W_ROUTER_vs_BASE_ROUTER') && !cmpMaterial(H, 'W_ROUTER_ALL_vs_BASE_ROUTER'),
  routerValueNotMaterial: !cmpMaterial(H, 'W_ROUTER_vs_BEST_SINGLE_POLICY') && !cmpMaterial(H, 'W_ROUTER_ALL_vs_BEST_SINGLE_POLICY'),
  oodUnstable: oodUnstableTargets.length > 0,
  proxy: ALL_TARGETS.some(proxyFor),
});

/* ================================================================ historical claims */
const W = readJson('artifacts/stage3f6w-risk-state/stage3f6w-certification-result.json');
const t0Counts = H.targetCounts.T0_HISTORICAL; const t0Ok = evaluable(t0Counts) && open.fits.T0_HISTORICAL.status === 'FITTED';
const primaryRouter = ROUTERS.W_ROUTER ? 'W_ROUTER' : 'W_ROUTER_ALL';
const w1 = ['HIGH_HOSTILE', 'UNCOVERED_THREAT', 'BOTTLENECK'].map((k) => H.routers.BASE_ROUTER.forensics[k]);
const w1Hits = w1.filter((f) => f.supported && f.errorRatio !== null && f.errorRatio >= 1.25).length;
const historicalCode = (() => {
  if (!t0Ok || t0Counts.n < 500) return 'E_INSUFFICIENT_EVIDENCE';
  const risk = inc(H, 'T0_HISTORICAL', 'ACCEPTED_vs_CORE') ?? inc(H, 'T0_HISTORICAL', 'VALID_RISK_vs_CORE');
  const groups = ['SPATIAL_vs_CORE', 'OBJECTIVE_vs_CORE', 'TEMPORAL_vs_CORE'].map((k) => inc(H, 'T0_HISTORICAL', k)).filter(Boolean);
  if (groups.some((g) => g.material && g.delta > (risk?.delta ?? 0))) return 'C_DIFFERENT_REPRESENTATION_GAP_DOMINATES';
  if (inc(H, 'T0_HISTORICAL', 'ACCEPTED_vs_CORE')?.material) return 'A_RISK_STATE_ADDS_MATERIAL_INFORMATION';
  if (risk?.significant || ACCEPTED_VALID.length > 0) return 'B_CURRENT_RISK_SIGNALS_INSUFFICIENT';
  return 'D_NO_INCREMENTAL_INFORMATION_FOUND';
})();
const rejected = Object.fromEntries(W.fieldSelection.filter((f) => f.reason === 'STRUCTURALLY_REDUNDANT' || f.reason === 'NOT_USABLE_WITHOUT_IMPUTATION').map((f) => [f.fieldId, f.detail ?? f.reason]));
const structuralHolds = {
  'risk.hostileAliveCount': AUDIT['risk.hostileAliveCount'].detail.identicalToCore === 'relational.hostileEntityCount',
  'risk.coveredThreatCount': AUDIT['risk.coveredThreatCount'].detail.identicalToThreatenedMinusUncovered === true,
  'risk.threatenedCivilianCount': AUDIT['risk.threatenedCivilianCount'].detail.identicalToCore === 'relational.unresolvedDependencyCount',
  'risk.threatCoverageRatio': AUDIT['risk.threatCoverageRatio'].flags.UNAVAILABLE === true,
};
const nHolds = Object.values(structuralHolds).filter(Boolean).length;
const wFs = H.routers[primaryRouter]?.falseSelectionHarm.rate; const bFs = H.routers.BASE_ROUTER.falseSelectionHarm.rate;
const claimDefs = {
  W1_ROUTER_ERRORS_CONCENTRATE_IN_THREAT_STATES: { historical: 'frozen 3F.6-T router CAL error ratio HIGH_HOSTILE 2.04, UNCOVERED_THREAT 1.88, BOTTLENECK 2.05',
    measured: Object.fromEntries(['HIGH_HOSTILE', 'UNCOVERED_THREAT', 'BOTTLENECK'].map((k, i) => [k, w1[i].errorRatio])),
    verdict: claimVerdict({ insufficient: w1.every((f) => !f.supported), survives: w1Hits >= 2, partial: w1Hits === 1 }) },
  W2_THREAT_STRUCTURE_ALREADY_IN_CORE: { historical: 'threat-structure fields had no DEV increment (mean delta <= 0)',
    measured: Object.fromEntries(THREAT_STRUCTURE.map((id) => [id, VALID.includes(id) ? inc(H, 'T0_HISTORICAL', `${id}_vs_CORE`)?.delta ?? null : AUDIT[id].class])),
    verdict: claimVerdict({ insufficient: !t0Ok, survives: THREAT_STRUCTURE.every((id) => !VALID.includes(id) || !sig(H, 'T0_HISTORICAL', `${id}_vs_CORE`)) }) },
  W3_RETREAT_OPTION_REAL_BUT_NOT_MATERIAL: { historical: 'CAL delta +0.0103 [0.0045, 0.0161], below 0.02',
    measured: { class: AUDIT['risk.retreatOptionCount'].class, increment: inc(H, 'T0_HISTORICAL', 'ACCEPTED_vs_CORE') },
    verdict: claimVerdict({ insufficient: !t0Ok, survives: sig(H, 'T0_HISTORICAL', 'ACCEPTED_vs_CORE') && !mat(H, 'T0_HISTORICAL', 'ACCEPTED_vs_CORE') }) },
  W4_MINIMALITY_ALL_NOT_BETTER: { historical: 'all usable risk +0.0064 < accepted +0.0103', measured: inc(H, 'T0_HISTORICAL', 'VALID_RISK_vs_ACCEPTED'),
    verdict: claimVerdict({ testable: ACCEPTED_VALID.length > 0, insufficient: !t0Ok, survives: !sig(H, 'T0_HISTORICAL', 'VALID_RISK_vs_ACCEPTED') }) },
  W5_ACTOR_POSITION_SMALL_INCREMENT: { historical: 'CORE + actor x/y +0.0061 [0.0018, 0.0098]', measured: { increment: inc(H, 'T0_HISTORICAL', 'SPATIAL_vs_CORE'), class: AUDIT['spatial.actorX'].class },
    verdict: claimVerdict({ insufficient: !t0Ok, survives: sig(H, 'T0_HISTORICAL', 'SPATIAL_vs_CORE') }) },
  W6_OBJECTIVE_NOT_A_GAP: { historical: 'CORE + objective -0.0002', measured: inc(H, 'T0_HISTORICAL', 'OBJECTIVE_vs_CORE'),
    verdict: claimVerdict({ insufficient: !t0Ok, survives: !sig(H, 'T0_HISTORICAL', 'OBJECTIVE_vs_CORE') }) },
  W7_CORE_RANKS_NEXUS_VS_RESOURCE: { historical: 'CORE CAL AUROC 0.7878', measured: H.riskQuality.T0_HISTORICAL.CORE?.AUROC ?? null,
    verdict: claimVerdict({ insufficient: !t0Ok, survives: (H.riskQuality.T0_HISTORICAL.CORE?.AUROC ?? 0) >= 0.75, partial: (H.riskQuality.T0_HISTORICAL.CORE?.AUROC ?? 0) >= 0.65 }) },
  W8_NEXUS_CAPTURE_FAILS_DESPITE_SIGNAL: { historical: 'missed NEXUS was the largest router error class (588 of 848 CAL errors)', measured: H.nexusCapture,
    verdict: claimVerdict({ insufficient: H.nexusCapture.nexusUniquelyBestN < MIN_CLASS || !t0Ok,
      survives: (H.nexusCapture.baseRouterSelectsNexus ?? 1) < 0.5 && (H.riskQuality.T0_HISTORICAL.CORE?.AUROC ?? 0) >= 0.65, partial: (H.nexusCapture.baseRouterSelectsNexus ?? 1) < 0.5 }) },
  W9_PRIMARY_B_INSUFFICIENT: { historical: W.classification.primaryResult, measured: historicalCode, verdict: claimVerdict({ insufficient: historicalCode === 'E_INSUFFICIENT_EVIDENCE', survives: historicalCode === 'B_CURRENT_RISK_SIGNALS_INSUFFICIENT' }) },
  W10_STRUCTURAL_REJECTIONS_HOLD: { historical: rejected, measured: structuralHolds, verdict: claimVerdict({ survives: nHolds === 4, partial: nHolds > 0 }) },
  W11_LEAK_FREE_DECISION_TIME: { historical: 'risk fields read the observation packet and legal surface only',
    measured: { sourceUnchanged: hex(readFileSync(at('src/stage3f/decision-risk-state-v1.js'))) === W.sourceHashes['src/stage3f/decision-risk-state-v1.js'],
      contractUnchanged: DECISION_RISK_STATE_CONTRACT_HASH === HISTORICAL_W.riskContractHash, decisionTimeByContract: RISK_STATE_FIELDS.every((f) => Object.values(contractFlags(f.fieldId)).every((v) => v === false)),
      relabelInvariant: [H, O].every((P) => P.evidenceFidelity.relabel === 1) },
    verdict: null },
  W12_NO_ROUTING_GAIN: { historical: 'result B: no router retrain (routerRetrainReadyIf A)', measured: H.comparisons[`${primaryRouter}_vs_BASE_ROUTER`],
    verdict: claimVerdict({ survives: !cmpMaterial(H, `${primaryRouter}_vs_BASE_ROUTER`) }) },
  W13_FALSE_SELECTION_HARM_UNCHANGED: { historical: 'enrichment was not expected to change false-selection harm', measured: { base: bFs, enriched: wFs },
    verdict: claimVerdict({ survives: !(bFs - wFs >= 0.02) }) },
  W14_OOD: { historical: 'no OOD claim (DEV/CAL only)', measured: { oodUnstableTargets }, verdict: claimVerdict({ testable: false, survives: false }) },
};
claimDefs.W11_LEAK_FREE_DECISION_TIME.verdict = claimVerdict({ survives: Object.values(claimDefs.W11_LEAK_FREE_DECISION_TIME.measured).every(Boolean) });
const claims = claimDefs;
const verdicts = Object.values(claims).map((c) => c.verdict).filter((v) => v !== 'NOT_RETESTABLE');

/* ================================================================== integrity */
const headBytesHash = (r) => { const g = spawnSync('git', ['-C', repositoryRoot, 'show', `HEAD:platform/game-agnostic/${r}`], { encoding: 'buffer' }); return g.status === 0 ? hex(g.stdout) : null; };
const git = (...a) => spawnSync('git', ['-C', repositoryRoot, ...a], { encoding: 'utf8' });
const freeze = (() => {
  const planRepo = `platform/game-agnostic/${STAGE3F6WSYM_PLAN_PATH}`;
  const commits = git('log', '--diff-filter=A', '--format=%H', '--', planRepo).stdout.trim().split('\n').filter(Boolean);
  const commit = commits[commits.length - 1] ?? null;
  const files = commit ? git('show', '--name-only', '--format=', commit).stdout.trim().split('\n').filter(Boolean) : [];
  const out = { freezeCommit: commit, planAndOpenReportInFreezeCommit: files.includes(planRepo) && files.includes(`platform/game-agnostic/${OPEN_REPORT_PATH}`),
    evaluationFilesInFreezeCommit: EVALUATION_FILES.every((f) => files.includes(`platform/game-agnostic/${f}`)),
    noFreshOrResultInFreezeCommit: !files.some((f) => /stage3f6wsym-risk-requalification\/(fresh-confirmatory|stage3f6wsym-certification-result)/.test(f)),
    freshGeneratedAtHead: freshManifest.generatedAtHead,
    freshGeneratedAfterFreeze: commit !== null && git('merge-base', '--is-ancestor', commit, freshManifest.generatedAtHead).status === 0,
    evaluationFilesUnchangedSinceGeneration: git('diff', '--quiet', freshManifest.generatedAtHead, '--', ...EVALUATION_FILES.map((f) => `platform/game-agnostic/${f}`)).status === 0 };
  out.FROZEN_BEFORE_SEALED_DATA = commit !== null && out.planAndOpenReportInFreezeCommit && out.evaluationFilesInFreezeCommit && out.noFreshOrResultInFreezeCommit && out.freshGeneratedAfterFreeze && out.evaluationFilesUnchangedSinceGeneration;
  return out;
})();
const priorSets = { record: new Set(priorLineage.rows.map((r) => r.recordHash)), world: new Set(priorLineage.rows.map((r) => r.worldHash)), topology: new Set(priorLineage.rows.map((r) => r.topologyHash)) };
const comboKey = (r) => JSON.stringify([r.combination.shape, r.combination.roles, r.combination.objectives, r.combination.horizonBand, r.combination.level, r.combination.seed]);
const priorCombos = new Set(priorLineage.rows.map(comboKey));
const eq = fresh.filter((r) => r.equivariance !== null).flatMap((r) => Object.values(r.equivariance));
const freshIntegrity = {
  contentHash: hex(freshText), contentBound: hex(freshText) === freshManifest.contentHash, planBound: freshManifest.planHash === STAGE3F6WSYM_PLAN_HASH,
  seedPlanBound: freshManifest.seedPlanHash === STAGE3F6WSYM_SEED_PLAN_HASH, seedAudit: seedAudit(priorLineage.rows),
  seedsUsed: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, [...new Set(fresh.filter((r) => r.partition === p).map((r) => r.combination.seed))]])),
  counts: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, PARTS[p].length])), stats: freshManifest.stats, priorLineage: priorLineage.sources,
  RECORD_OVERLAP: fresh.filter((r) => priorSets.record.has(r.recordHash)).length, STATE_OVERLAP: fresh.filter((r) => priorSets.world.has(r.worldHash)).length,
  TOPOLOGY_OVERLAP: fresh.filter((r) => priorSets.topology.has(r.topologyHash)).length, DERIVED_VARIANT_LEAKAGE: fresh.filter((r) => priorCombos.has(comboKey(r))).length,
  DUPLICATE_HASHES: ['recordHash', 'worldHash', 'topologyHash'].reduce((s, f) => s + fresh.length - new Set(fresh.map((r) => r[f])).size, 0),
  levels: Object.fromEntries(Object.keys(FRESH_PARTITIONS).map((p) => [p, [...new Set(fresh.filter((r) => r.partition === p).map((r) => r.combination.level))].sort()])),
  equivarianceChecks: eq.length, SYMMETRY: Object.fromEntries(['legal', 'optimal', 'regret', 'label', 'coreFeatureInvariant'].map((k) => [k, rate(eq, (x) => x[k] === 1)])),
  benchmarkBound: JSON.stringify(freshManifest.benchmark) === JSON.stringify(readJson('artifacts/stage3f6p1d-symmetric-corpus/symmetric-corpus-v1-manifest.json').benchmark),
};
const planFile = readJson(STAGE3F6WSYM_PLAN_PATH);
const p1symPlan = readJson('artifacts/stage3f6p1sym-nexus-requalification/stage3f6p1sym-analysis-plan.json');
const moduleIntegrity = {
  riskModuleUnchanged: claims.W11_LEAK_FREE_DECISION_TIME.measured.sourceUnchanged, riskEvidenceHelperUnchanged: hex(readFileSync(at('scripts/generate-stage3f6w-risk-evidence.mjs'))) === W.sourceHashes['scripts/generate-stage3f6w-risk-evidence.mjs'],
  policySourcesUnchanged: Object.entries(p1symPlan.policies.sourceSha256).every(([f, h]) => hex(readFileSync(at(f))) === h && headBytesHash(f) === h),
  routerMethodologyUnchanged: POLICY_SET_HASH === plan.policySet.stage3f6tPolicySetHash && JSON.stringify(plan.routers.methodology) === JSON.stringify(planFile.routers.methodology),
  baseRouterIsTsymRouter: openStored.routers.baseRouterIsTsymRouter === true,
};
const selfSource = readFileSync(at('scripts/certify-stage3f6wsym-risk.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const staticAudit = {
  HEADLINE_ROUTERS_READ_DEPLOYABLE_INPUTS_ONLY: Object.entries(ROUTER_SETS).every(([, keys]) => keys === null || keys.every((k) => CORE_IDS.includes(k) || VALID.includes(k))),
  NO_PRIVILEGED_OR_SHORTCUT_INPUT_IN_HEADLINE: Object.values(ROUTER_SETS).every((keys) => keys === null || keys.every((k) => !/^(priv|spatial|temporal|objective)\./.test(k))),
  FITS_ON_DEV_ONLY: [...selfSource.matchAll(/fitPolicyRouter\(([A-Z]+),/g)].every((m) => m[1] === 'DEV') && [...selfSource.matchAll(/fitBinaryLogistic\(([a-z]+)\./g)].every((m) => ['dev', 'train'].includes(m[1])),
  NO_DEEP_OR_WORLD_MODEL: !/from '[^']*(jepa|neural|tensorflow|onnx|world-model)/i.test(selfSource),
};
const predecessorOk = predecessorRun === null ? null : await predecessorRun;
const predecessorChecks = skipPredecessors ? { skipped: true } : { stage3f6p1sym_transitive: predecessorOk,
  note: 'P.1-SYM --check runs P.1A-SYM --check, which requires P.1C, P.1D, P.1E and 3F.6-T-SYM to reproduce byte for byte' };
let testMetrics = { pass: 0, fail: 0, skipped: 0 }; let testsStatus = 0;
if (!skipTests) {
  const r = spawnSync(process.execPath, ['--test', 'tests/stage3f6wsym-risk.test.js'], { cwd: root, encoding: 'utf8' });
  testsStatus = r.status ?? 1; const read = (l) => Number(new RegExp(`^# ${l} (\\d+)$`, 'm').exec(r.stdout ?? '')?.[1] ?? 0);
  testMetrics = { pass: read('pass'), fail: read('fail'), skipped: read('skipped') };
}
const fid = (f) => ['world', 'surface', 'choices', 'relabel', 'twinMapping'].every((k) => f[k] === 1);
const checks = {
  PREDECESSORS_REPRODUCE: skipPredecessors || predecessorOk === true,
  PLAN_BOUND: planFile.planHash === STAGE3F6WSYM_PLAN_HASH && planFile.seedPlanHash === STAGE3F6WSYM_SEED_PLAN_HASH && planFile.historicalWHash === HISTORICAL_W_HASH,
  FROZEN_BEFORE_SEALED_DATA: freeze.FROZEN_BEFORE_SEALED_DATA, OPEN_PHASE_REPRODUCED, FIT_DETERMINISTIC: openStored.routers.fitDeterministic === true,
  SEED_DECLARATION_CLEAN: freshIntegrity.seedAudit.overlapWithPriorSeeds.length === 0 && freshIntegrity.seedAudit.usedByPriorRows.length === 0 && freshIntegrity.seedAudit.holdoutOodOverlap.length === 0
    && freshIntegrity.seedAudit.duplicates === 0 && Object.values(freshIntegrity.seedsUsed).flat().every((s) => [...STAGE3F6WSYM_SEED_PLAN.declared.HOLDOUT, ...STAGE3F6WSYM_SEED_PLAN.declared.OOD].includes(s)),
  FRESH_LINEAGE_CLEAN: freshIntegrity.contentBound && freshIntegrity.planBound && freshIntegrity.seedPlanBound && freshIntegrity.benchmarkBound && freshIntegrity.RECORD_OVERLAP === 0
    && freshIntegrity.STATE_OVERLAP === 0 && freshIntegrity.TOPOLOGY_OVERLAP === 0 && freshIntegrity.DERIVED_VARIANT_LEAKAGE === 0 && freshIntegrity.DUPLICATE_HASHES === 0
    && Object.values(freshIntegrity.counts).every((n) => n === 6000),
  FRESH_SYMMETRY_INTACT: freshIntegrity.equivarianceChecks > 0 && Object.values(freshIntegrity.SYMMETRY).every((v) => v === 1),
  MODULES_UNCHANGED: Object.values(moduleIntegrity).every(Boolean),
  EVIDENCE_FIDELITY: fid(openStored.evidenceFidelity.DEV) && fid(openStored.evidenceFidelity.CAL) && fid(H.evidenceFidelity) && fid(O.evidenceFidelity),
  STATIC_AUDIT: Object.values(staticAudit).every(Boolean),
  AUTHORITY_R0: plan.authority.tier === 'R0' && !plan.authority.canDispatch && !plan.authority.canMutateLiveWorld && !plan.authority.onlineLearningEnabled && !plan.authority.promotedToLiveRuntime,
  TESTS_PASS: skipTests || (testsStatus === 0 && testMetrics.fail === 0 && testMetrics.pass > 0),
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';
const wMaterialOver = (b) => ['W_ROUTER', 'W_ROUTER_ALL'].some((a) => cmpMaterial(H, `${a}_vs_${b}`) && !cmpWorse(O, `${a}_vs_${b}`));
const calibrated = ['T0_HISTORICAL', 'T1_CATASTROPHIC_ERROR'].every((t) => [H, O].every((P) => { const m = P.riskQuality[t].CORE_PLUS_VALID_RISK; return m?.status === 'EVALUATED' && m.ECE <= 0.05; }));
const roadmap = {
  W_REQUALIFIED: status === 'PASS',
  HISTORICAL_W_SURVIVES: verdicts.every((v) => v === 'SURVIVES') ? true : verdicts.some((v) => v === 'SURVIVES' || v === 'PARTIALLY_SURVIVES') ? 'PARTIAL' : false,
  GENUINE_RISK_SIGNAL_MEASURED: classification.holds.GENUINE_RISK_SIGNAL,
  RISK_SIGNAL_DEPLOYABLE: VALID.length > 0 && riskEquivariant && [H, O].every((P) => P.evidenceFidelity.relabel === 1) && claims.W11_LEAK_FREE_DECISION_TIME.verdict === 'SURVIVES',
  RISK_SIGNAL_CALIBRATED: calibrated,
  RISK_SIGNAL_OOD_STABLE: !classification.holds.OOD_UNSTABLE && significantRisk.length > 0,
  RISK_SIGNAL_IMPROVES_DECISIONS: wMaterialOver('BEST_SINGLE_POLICY'),
  RISK_SIGNAL_IMPROVES_ROUTING: wMaterialOver('BASE_ROUTER'),
  ROUTER_2_0_JUSTIFIED: false,
  RISK_STATE_USEFUL_FOR_3G: classification.holds.GENUINE_RISK_SIGNAL && calibrated,
  READY_FOR_STAGE3F6D_REQUALIFICATION: status === 'PASS', READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false,
  STAGE3F_STATUS: 'OPEN (requalification remaining: 3F.6-D)',
};
const payload = roundDeep({
  schemaVersion: 1, stage: plan.stage, status, planHash: STAGE3F6WSYM_PLAN_HASH, seedPlanHash: STAGE3F6WSYM_SEED_PLAN_HASH, historicalWHash: HISTORICAL_W_HASH,
  openPhaseReportHash: openStored.reportHash, freeze, predecessorChecks,
  data: { benchmarkId: 'FORGE_SYMMETRIC_V2', corpusContentHash: plan.predecessors.corpusContentHash, fresh: freshIntegrity },
  historicalW: HISTORICAL_W,
  featureValidity: { audit: openStored.featureAudit, VALID_DEPLOYABLE_W_FEATURE_SET: VALID, VALID_DEPLOYABLE_W_FEATURE_SET_HASH: openStored.validDeployableWFeatureSetHash,
    acceptedValid: ACCEPTED_VALID, historicalSelectionReplay: openStored.historicalSelectionReplay },
  results: { partitions, seedFamilies, headlineCascade: CASCADE, bestSingle: BEST },
  derived: { genuineTargets, significantRiskTargets: significantRisk, validOnlyInformativeTargets: validOnlyInformative, oodUnstableTargets, proxyTargets: ALL_TARGETS.filter(proxyFor),
    shortcutFields, riskEquivariant, historicalResultCodeOnHoldout: historicalCode },
  classification, claims, roadmap,
  disclosures: {
    PRIVILEGED_DIAGNOSTIC_ONLY: 'priv.* features read kernel entity positions no interface exposes; they appear only in diagnostic models and never in a headline router',
    SPATIAL_IS_ABSOLUTE_FRAME: 'the historical W spatial diagnostic reads absolute actor x/y, which a D4 twin changes; any value it carries is orientation-bound',
    TARGETS_ARE_LABELS: 'every risk target is computed from oracle regret or optimality and is used only as a label, never as an input',
    SEED_FAMILY_SAMPLES: 'seed-family rows (2021, 2022, 2023, 3021) were generated and used by earlier stages; they are diagnostic here, never confirmatory',
    TRANSITIVE_PREDECESSORS: 'P.1-SYM --check reproduces byte for byte only when P.1A-SYM, P.1C, P.1D, P.1E and 3F.6-T-SYM do',
    LATENCY_NOT_HASHED: 'wall-clock timings are printed to the console and are not part of the certificate',
  },
  checks, tests: testMetrics, moduleIntegrity, staticAudit, authority: plan.authority,
  scope: { newOwners: ['scripts/stage3f6wsym-analysis-plan.mjs', 'scripts/generate-stage3f6wsym-confirmatory.mjs', 'scripts/stage3f6wsym-evidence.mjs', 'scripts/certify-stage3f6wsym-risk.mjs',
    'src/stage3f/risk-requalification-v1.js', 'tests/stage3f6wsym-risk.test.js'], existingOwnersModified: ['package.json', '.gitignore'], routerModified: false, nexusModified: false,
  riskContractModified: false, policiesTrained: false, stage3gStarted: false },
});
payload.sourceHashes = Object.fromEntries(payload.scope.newOwners.map((f) => [f, hex(readFileSync(at(f)))]));
payload.certificationHash = hex(JSON.stringify(payload));

const latency = (() => { const rows = PARTS.WSYM_HOLDOUT.slice(0, 500); const out = {};
  for (const k of Object.keys(ROUTERS)) { const s = process.hrtime.bigint(); for (const r of rows) ROUTERS[k](r); out[k] = Number(process.hrtime.bigint() - s) / 1e3 / rows.length; }
  return { microsecondsPerDecision: out, stageTimingMs: timing }; })();

if (checkOnly) {
  const stored = readJson(RESULT);
  const reproduced = stored.certificationHash === payload.certificationHash && JSON.stringify(stored) === JSON.stringify(payload);
  console.log(JSON.stringify({ check: 'STAGE3F6WSYM_CERTIFICATION', reproduced, status, storedHash: stored.certificationHash, recomputedHash: payload.certificationHash, tests: testMetrics }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(RESULT), `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    classification: { primary: classification.primary, labels: classification.labels }, claims: Object.fromEntries(Object.entries(claims).map(([k, v]) => [k, v.verdict])), roadmap, latency }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
