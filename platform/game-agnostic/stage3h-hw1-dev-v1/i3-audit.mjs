// H-W1 I-3 policy identity audit driver. Samples EXPLORATION classes, runs i3-audit-class on each, aggregates, and applies the gates.
//   node i3-audit.mjs [--models] [--classes N] [--write]
// Default (synthetic) mode audits the policy CLASS with hand-made integer-weight policies, including an all-ties policy, before any model is trained.
// --models audits the trained models in models/ (written by i4-train.mjs). Neither mode loads VALIDATION or HOLDOUT; built EXPLORATION class files are read from work/ until the population is frozen.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive, prng } from '../stage3h-failure-diagnosis-v1/lib.mjs';
import { LANE, loadAllocation, loadExclusions, blockSchedule } from './i2-allocator.mjs';
import { auditClass, CONTROLS } from './i3-audit-class.mjs';
import { makePolicy, POLICY_FAMILY, POLICY_VERSION } from './i3-policy.mjs';
import { NAMES, FEATURE_VERSION, FEATURE_SETS } from './i3-features.mjs';
import { PROJECTION_VERSION, KEY_VERSION } from './public-projection.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex'), q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const args = process.argv.slice(2), modelsMode = args.includes('--models'), write = args.includes('--write'), count = Number(args[args.indexOf('--classes') + 1]) || 24;
const TESTS = ['RELABEL', 'MENU', 'D4', 'HIDDEN'], BUDGET = { medianMs: 100, maxMs: 1000 };
const POLICY_SOURCES = ['i3-policy.mjs', 'i3-features.mjs', 'public-projection.mjs'], ALLOWED_IMPORT = /^(node:[a-z:_/]+|\.\/(i3-features|public-projection)\.mjs)$/;

function builtClasses() {
  const dir = resolve(LANE, 'work/i2/classes/EXPLORATION');
  return readdirSync(dir).filter((n) => /^range-/.test(n)).sort().flatMap((n) => JSON.parse(readFileSync(resolve(dir, n), 'utf8')).classes).filter((c) => c.status === 'OK');
}

function syntheticPolicies() {
  const W = NAMES.length, rnd = prng('HW1_I3_AUDIT_SYNTHETIC_V1'), full = [...FEATURE_SETS.FULL], types = [...Array(12).keys()], ri = () => Math.round((rnd() - 0.5) * 4), mean = Array(W).fill(0), std = Array(W).fill(1);
  const head = (cols, f) => ({ cols, w: cols.map(f), b: 0 }), mk = (id, heads, score) => makePolicy({ policyId: id, policyFamily: POLICY_FAMILY, policyVersion: POLICY_VERSION, featureVersion: FEATURE_VERSION, mean, std, heads, score });
  return { ZERO_ALL_TIES: mk('ZERO_ALL_TIES', { nreg: head(full, () => 0) }, { rule: 'NEG_NREG' }), RANDOM_INT_NREG: mk('RANDOM_INT_NREG', { nreg: head(full, ri) }, { rule: 'NEG_NREG' }), TYPE_ONLY_NREG: mk('TYPE_ONLY_NREG', { nreg: head(types, ri) }, { rule: 'NEG_NREG' }),
    RANDOM_INT_SAFE_FIRST: mk('RANDOM_INT_SAFE_FIRST', { nreg: head(full, ri), cat: head(full, ri) }, { rule: 'SAFE_FIRST', tau: 0.1 }), RANDOM_INT_RISK_WEIGHTED: mk('RANDOM_INT_RISK_WEIGHTED', { nreg: head(full, ri), cat: head(full, ri) }, { rule: 'RISK_WEIGHTED', kappa: 3 }) };
}

function trainedPolicies() {
  const dir = resolve(LANE, 'models'); if (!existsSync(dir)) throw Error('NO_MODELS_DIR: run i4-train.mjs --write first');
  const out = {}, files = readdirSync(dir).filter((n) => /^C\d+_.*\.json$/.test(n)).sort(); if (!files.length) throw Error('NO_MODELS');
  for (const f of files) { const m = JSON.parse(readFileSync(resolve(dir, f), 'utf8')); out[f.replace(/\.json$/, '')] = makePolicy(m); }
  return out;
}

/** Static check: the policy and feature sources import nothing that could carry evaluator, population or label data. */
function importAudit() {
  const out = {};
  for (const f of POLICY_SOURCES) { const src = readFileSync(resolve(LANE, f), 'utf8'), specs = [...src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]); out[f] = { sha256: sha(src), imports: specs, forbidden: f === 'public-projection.mjs' ? specs.filter((s) => !/^(node:[a-z:_/]+|\.\/[a-z0-9-]+\.mjs)$/.test(s) || /evaluator|i2-|hw1-eval|lib\.mjs|scripts|\/src\//.test(s)) : specs.filter((s) => !ALLOWED_IMPORT.test(s)) }; }
  return out;
}

function aggregate(records, names) {
  const per = {}, ctl = {};
  for (const n of names) per[n] = { orbit: {}, index: {} };
  for (const r of records) {
    for (const n of names) for (const kind of ['orbit', 'index']) for (const t of TESTS) { const src = kind === 'orbit' ? r.byTest[n]?.[t] : r.index[n]?.[t]; if (!src) continue; const e = (per[n][kind][t] ??= { n: 0, bad: 0 }); e.n += src.n; e.bad += src.bad; }
    for (const [c, tests] of Object.entries(r.controls)) for (const [t, v] of Object.entries(tests)) { const e = ((ctl[c] ??= {})[t] ??= { n: 0, bad: 0 }); e.n += v.n; e.bad += v.bad; }
  }
  return { per, ctl };
}

export function main() {
  const all = builtClasses(), step = Math.max(1, Math.floor(all.length / count)), sample = all.filter((_, i) => i % step === 0).slice(0, count);
  if (!sample.length) throw Error('NO_BUILT_CLASSES');
  const alloc = loadAllocation(), ctx = loadExclusions([]), sched = new Map(), comboFor = (b, k) => { if (!sched.has(b)) sched.set(b, new Map(blockSchedule(ctx, 'EXPLORATION', b, alloc).map((c) => [c.k, c]))); return sched.get(b).get(k); };
  const policies = modelsMode ? { ZERO_ALL_TIES: syntheticPolicies().ZERO_ALL_TIES, ...trainedPolicies() } : syntheticPolicies(), names = Object.keys(policies), t0 = Date.now(), records = sample.map((c) => auditClass(c, comboFor(c.block, c.k), policies));
  const { per, ctl } = aggregate(records, names), ms = records.flatMap((r) => r.ms), sum = (f) => records.reduce((a, r) => a + f(r), 0), imports = importAudit();
  const totals = { classes: records.length, twins: sum((r) => r.twins), d4Unlawful: sum((r) => r.d4Unlawful), hiddenNonEquivalentRejected: sum((r) => r.hiddenNonEquivalent), decisions: sum((r) => r.legality.decisions), illegal: sum((r) => r.legality.illegal), repeatMismatch: sum((r) => r.repeatMismatch), poisonMismatch: sum((r) => r.poisonMismatch),
    featureFrames: sum((r) => r.features.frames), featureFrameMismatch: sum((r) => r.features.bad), maxReadPaths: Math.max(...records.map((r) => r.reads)), unallowedReads: [...new Set(records.flatMap((r) => r.unallowed))] };
  const idBad = names.flatMap((n) => ['orbit', 'index'].flatMap((k) => TESTS.map((t) => per[n][k][t]?.bad ?? 0))).reduce((a, b) => a + b, 0), testN = Object.fromEntries(TESTS.map((t) => [t, names.reduce((a, n) => a + (per[n].orbit[t]?.n ?? 0), 0)]));
  const controls = Object.fromEntries(Object.entries(CONTROLS).map(([c, d]) => [c, { expected: d.expect, detectedOn: d.expect.map((t) => ({ test: t, ...ctl[c]?.[t] })), allTests: ctl[c] }]));
  const gates = {
    IDENTITY_ZERO_TOLERANCE: idBad === 0, EVERY_TEST_EXERCISED: TESTS.every((t) => testN[t] > 0), LAWFUL_D4_TWINS_PRESENT: testN.D4 > 0, HIDDEN_TWINS_PRESENT: testN.HIDDEN > 0, FEATURES_INVARIANT_UNDER_D4: totals.featureFrameMismatch === 0,
    ALLOWLISTED_READS_ONLY: totals.unallowedReads.length === 0 && totals.maxReadPaths > 0, POISONED_VIEW_IDENTICAL: totals.poisonMismatch === 0, NO_ILLEGAL_ACTIONS: totals.illegal === 0, DETERMINISTIC_REPEAT: totals.repeatMismatch === 0,
    COMPUTE_WITHIN_BUDGET: q(ms, 0.5) <= BUDGET.medianMs && Math.max(...ms) <= BUDGET.maxMs, NEGATIVE_CONTROLS_DETECTED: Object.values(controls).every((c) => c.detectedOn.every((d) => d.bad > 0)),
    NO_FORBIDDEN_IMPORTS: Object.values(imports).every((i) => i.forbidden.length === 0) };
  const card = { architecture: 'standardised linear scorer over integer public-projection features; decision by selectEquivariant (symmetry-fixed actions, maximal score, canonical-frame tie-break); keyV2 orbit evaluated', policyFamily: POLICY_FAMILY, policyVersion: POLICY_VERSION, featureVersion: FEATURE_VERSION, projectionVersion: PROJECTION_VERSION, keyVersion: KEY_VERSION,
    sourceHashes: Object.fromEntries(Object.entries(imports).map(([f, i]) => [f, i.sha256])), featureInventory: { count: NAMES.length, base: FEATURE_SETS.BASE.length, full: FEATURE_SETS.FULL.length, names: NAMES }, trainingObjective: 'per candidate in i4-candidates.mjs: NEG_NREG, RISK_WEIGHTED or SAFE_FIRST over ridge heads for orbit nreg and orbit catastrophe',
    inference: 'deterministic; no randomness, no clock, no I/O; input is the observable view only; output exactly one legal menu index plus its keyV2 orbit', computeBudget: BUDGET, failureAndFallback: 'no abstention and no fallback: an out-of-range decision throws POLICY_ILLEGAL_ACTION and counts as an illegal action' };
  const out = { schema: 'STAGE3H_HW1_I3_POLICY_AUDIT_V1', authority: 'R0', stage: 'I-3', mode: modelsMode ? 'TRAINED_MODELS' : 'SYNTHETIC_POLICY_CLASS', population: 'EXPLORATION', validationAccessed: false, holdoutAccessed: false, policies: names,
    sample: { requested: count, classes: records.map((r) => r.id) }, totals, identityByPolicy: per, testExercised: testN, controls, compute: { decisions: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: Math.max(...ms), budget: BUDGET }, imports, modelCard: card, gates, pass: Object.values(gates).every(Boolean), elapsedSeconds: (Date.now() - t0) / 1000 };
  console.log(JSON.stringify({ mode: out.mode, policies: names.length, totals, testExercised: testN, compute: out.compute, controls: Object.fromEntries(Object.entries(controls).map(([c, d]) => [c, d.detectedOn])), gates, pass: out.pass }, null, 1));
  if (write) { const p = resolve(LANE, modelsMode ? 'evidence/I4_MODEL_IDENTITY_AUDIT.json' : 'evidence/I3_POLICY_AUDIT.json'); writeExclusive(p, out); console.log('written ' + p); }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(LANE, 'i3-audit.mjs')) main();
