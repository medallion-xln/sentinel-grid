// STAGE 3H-SK1.1 — abstention, risk-coverage and failure analysis (READ-ONLY DIAGNOSTIC, authority R0).
//   node diagnostics/analyze.mjs            recompute and print a summary
//   node diagnostics/analyze.mjs --write    create evidence/SK1_1_RISK_COVERAGE.json and evidence/SK1_1_FAILURE_ATTRIBUTION.json (exclusive)
//   node diagnostics/analyze.mjs check      recompute and compare byte-for-byte with the stored files; writes nothing
//
// Inputs are TRACKED evidence only: the SK1.1 decision-failure matrix and the committed SK1 validation result. It needs
// no privileged local data and imports only node built-ins, so it runs from a clean checkout.
// Everything here describes one SPENT validation population. Alternative thresholds, counterfactual acceptance rules and
// risk-coverage points are POST_HOC_DIAGNOSTIC: none of them is a proposed operating point and none may be used to fit
// or select a policy. "No observed introduction" is an observation on sampled member worlds, never a statement of safety.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), SK1 = resolve(LANE, '../stage3h-sk1-safety-kernel-v1');
const MATRIX_FILE = resolve(LANE, 'evidence/SK1_1_DECISION_FAILURE_MATRIX.json'), RESULT_FILE = resolve(SK1, 'evidence/SK1_VALIDATION_RESULTS.json');
const OUT = { riskCoverage: resolve(LANE, 'evidence/SK1_1_RISK_COVERAGE.json'), attribution: resolve(LANE, 'evidence/SK1_1_FAILURE_ATTRIBUTION.json') };
const sha = (b) => createHash('sha256').update(b).digest('hex'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), J = JSON.stringify;
const r4 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e4) / 1e4), r6 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e6) / 1e6);
const sum = (a) => a.reduce((x, y) => x + y, 0), mean = (a) => (a.length ? sum(a) / a.length : null), count = (a, f) => a.filter(f).length;
const quant = (a) => { const s = [...a].filter((x) => x !== null).sort((x, y) => x - y), q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null); return { n: s.length, min: r4(s[0] ?? null), p10: r4(q(0.1)), p25: r4(q(0.25)), p50: r4(q(0.5)), p75: r4(q(0.75)), p90: r4(q(0.9)), max: r4(s[s.length - 1] ?? null), mean: r4(mean(s)) }; };
/** AUROC with average ranks for ties: P(score of a positive > score of a negative) + 0.5 P(equal). */
const auroc = (pairs) => { const pos = count(pairs, (x) => x[1]), neg = pairs.length - pos; if (!pos || !neg) return null; const s = [...pairs].sort((a, b) => a[0] - b[0]); let rs = 0, i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (s[k][1]) rs += avg; i = j + 1; } return r4((rs - (pos * (pos + 1)) / 2) / (pos * neg)); };
// exact binomial tail and Clopper-Pearson one-sided 95% upper bound (bisection)
const logC = (n, k) => { let s = 0; for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i); return s; };
const binCdf = (k, n, p) => { if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0; let s = 0; for (let i = 0; i <= k; i++) s += Math.exp(logC(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p)); return Math.min(1, s); };
export const cpUpper = (k, n, alpha = 0.05) => { if (k >= n) return 1; let lo = 0, hi = 1; for (let it = 0; it < 80; it++) { const mid = (lo + hi) / 2; if (binCdf(k, n, mid) > alpha) lo = mid; else hi = mid; } return hi; };
/** Smallest n with which at most k observed failures give a one-sided (1-alpha) upper bound <= r. */
export const sampleSizeFor = (r, k, alpha = 0.05) => { let n = Math.max(k + 1, Math.floor(Math.log(alpha) / Math.log(1 - r)) - 2); while (cpUpper(k, n, alpha) > r) n++; return n; };
// The frozen evaluator's cluster bootstrap, reproduced: same generator, seed label and resample count as
// stage3h-sk1-safety-kernel-v1/infra/evaluate.mjs bootCI. Reconciled below against the committed paired contrasts.
const RESAMPLES = 10000, BOOTSTRAP_SEED = 'HW1_CLUSTER_BOOTSTRAP_V1';
const prng = (label) => { let a = parseInt(sha(label).slice(0, 8), 16) >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export function bootCI(values, clusters) {
  const by = new Map(); values.forEach((v, i) => { const e = by.get(clusters[i]) ?? by.set(clusters[i], { s: 0, n: 0 }).get(clusters[i]); e.s += v; e.n++; });
  const cl = [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, e]) => e), rnd = prng(BOOTSTRAP_SEED), out = new Float64Array(RESAMPLES);
  for (let r = 0; r < RESAMPLES; r++) { let s = 0, n = 0; for (let k = 0; k < cl.length; k++) { const e = cl[Math.floor(rnd() * cl.length)]; s += e.s; n += e.n; } out[r] = s / n; }
  out.sort(); const at = (p) => out[Math.min(RESAMPLES - 1, Math.floor(p * RESAMPLES))];
  return { point: sum(values) / values.length, lower025: at(0.025), upper975: at(0.975), upper95: at(0.95), clusters: cl.length };
}
const ci = (b) => ({ point: r4(b.point), lower025: r4(b.lower025), upper975: r4(b.upper975), upper95: r4(b.upper95), clusters: b.clusters });
const tab = (rows, key, cols) => { const m = new Map(); for (const r of rows) { const k = String(key(r)); const e = m.get(k) ?? m.set(k, Object.fromEntries(Object.keys(cols).map((c) => [c, 0]))).get(k); for (const [c, f] of Object.entries(cols)) e[c] += Number(f(r)); } return Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))); };

export function analyse() {
  const matrixText = readFileSync(MATRIX_FILE, 'utf8'), M = JSON.parse(matrixText), stored = readJ(RESULT_FILE), rows = M.rows, AC = M.actionColumns, col = (a, k) => a[AC.indexOf(k)];
  if (!M.reconciliation.exact) throw Error('MATRIX_NOT_RECONCILED');
  if (sha(readFileSync(RESULT_FILE)) !== M.source.validationResultsSha256) throw Error('SK1_RESULT_IDENTITY_MISMATCH');
  const fam = rows.map((r) => r.family), failing = (r) => r.failure !== null, accepted = (r) => !r.sk1.abstained, tau = rows[0].sk1.margins.tau;
  const A = rows.filter(accepted), B = rows.filter((r) => !accepted(r)), Fx = rows.filter(failing), FA = Fx.filter(accepted), FB = Fx.filter((r) => !accepted(r)), NB = B.filter((r) => !failing(r));
  const issues = [], need = (name, ok) => { if (!ok) issues.push(name); };

  // ---------------- Phase 3: abstention effectiveness
  const counts = { classes: rows.length, accepted: A.length, abstained: B.length, forcedChoiceFailingClasses: Fx.length, failingWithheldByAbstention: FB.length, failingAcceptedDespiteCriterion: FA.length,
    forcedChoicesWithNoObservedIntroductionWithheld: NB.length, ofThoseForcedChoiceCatastrophicInSomeMember: count(NB, (r) => r.policies.SK1_FORCED.catAny), ofThoseNoCatastropheObserved: count(NB, (r) => !r.policies.SK1_FORCED.catAny),
    acceptedWithNoObservedIntroduction: A.length - FA.length, acceptedCatastrophicInSomeMember: count(A, (r) => r.policies.SK1_FORCED.catAny),
    failureRate: { accepted: r4(FA.length / A.length), abstained: r4(FB.length / B.length), all: r4(Fx.length / rows.length) }, abstentionsPerFailureWithheld: r4(B.length / FB.length),
    note: 'A forced choice with no observed introduction is NOT thereby safe: the observation covers the sampled member worlds of one class under one evaluator.' };
  need('counts', A.length === stored.policies.SK1_AS_SPECIFIED.decidedClasses && FB.length === stored.uncertainty.failingAmongAbstained && FA.length === stored.uncertainty.failingAmongDecided);
  need('acceptIffBoundAtMostTau', rows.every((r) => accepted(r) === (r.sk1.risk.upperBound <= tau)));
  const cohorts = { ACCEPTED: A, ABSTAINED: B, FAILING_ALL: Fx, FAILING_ABSTAINED: FB, FAILING_ACCEPTED: FA, NOT_FAILING_ABSTAINED: NB, NOT_FAILING_ACCEPTED: A.filter((r) => !failing(r)) };
  const dist = (f) => Object.fromEntries(Object.entries(cohorts).map(([k, v]) => [k, quant(v.map(f))]));
  const distributions = { modelEstimatedQuantities: 'estimate, spread, upperBound and expectedRegret are MODEL OUTPUTS for the top-ranked action; they are not observed outcomes',
    riskEstimate: dist((r) => r.sk1.risk.estimate), bagSpread: dist((r) => r.sk1.risk.spread), riskUpperBound: dist((r) => r.sk1.risk.upperBound), expectedRegret: dist((r) => r.sk1.expectedRegret),
    tauMargin: dist((r) => r.sk1.margins.tauMargin), tierEdgeMargin: dist((r) => r.sk1.margins.tierEdgeMargin), runnerUpBoundGap: dist((r) => r.sk1.margins.runnerUp?.upperGap ?? null), runnerUpRegretGap: dist((r) => r.sk1.margins.runnerUp?.regretGap ?? null),
    selectableActionsUnderTau: dist((r) => r.sk1.margins.selectableUnderTau), menuSize: dist((r) => r.menuSize) };
  const y = (r) => Number(failing(r));
  const discrimination = { target: 'forced-choice class introduces against S0 or Nexus (observed outcome)', aurocOverAllClasses: { riskUpperBound: auroc(rows.map((r) => [r.sk1.risk.upperBound, y(r)])), riskEstimate: auroc(rows.map((r) => [r.sk1.risk.estimate, y(r)])), bagSpread: auroc(rows.map((r) => [r.sk1.risk.spread, y(r)])), expectedRegret: auroc(rows.map((r) => [r.sk1.expectedRegret, y(r)])) },
    aurocWithinAbstained: { riskUpperBound: auroc(B.map((r) => [r.sk1.risk.upperBound, y(r)])), riskEstimate: auroc(B.map((r) => [r.sk1.risk.estimate, y(r)])), bagSpread: auroc(B.map((r) => [r.sk1.risk.spread, y(r)])) },
    committedAurocOfBound: stored.uncertainty.aurocBoundPredictsIntroduction,
    // which part of the bound does the work? POST_HOC_DIAGNOSTIC — the frozen tiers and ranking are unchanged; this only re-reads the frozen top action's numbers
    POST_HOC_DIAGNOSTIC_componentsOfTheCriterion: { topActionEstimateAtMostTau: { classes: count(rows, (r) => r.sk1.risk.estimate <= tau), failing: count(Fx, (r) => r.sk1.risk.estimate <= tau) }, topActionBoundAtMostTau: { classes: A.length, failing: FA.length },
      rejectedOnlyBecauseOfSpreadOrEnvelopePenalty: { classes: count(B, (r) => r.sk1.risk.estimate <= tau), failing: count(FB, (r) => r.sk1.risk.estimate <= tau) }, rejectedByEstimateAlone: { classes: count(B, (r) => r.sk1.risk.estimate > tau), failing: count(FB, (r) => r.sk1.risk.estimate > tau) } } };
  need('aurocOfBound', Math.abs(discrimination.aurocOverAllClasses.riskUpperBound - stored.uncertainty.aurocBoundPredictsIntroduction) < 1e-3);

  // ---------------- risk-coverage curve (descriptive; POST_HOC_DIAGNOSTIC)
  const order = [...rows].sort((a, b) => a.sk1.risk.upperBound - b.sk1.risk.upperBound || (a.alias < b.alias ? -1 : 1));
  let cF = 0, cS = 0, cN = 0, cC = 0, cR = 0; const curve = order.map((r, i) => { cF += y(r); cS += Number(r.policies.SK1_FORCED.introS0); cN += Number(r.policies.SK1_FORCED.introNexus); cC += Number(r.policies.SK1_FORCED.catAny); cR += r.policies.SK1_FORCED.nreg;
    return { k: i + 1, bound: r.sk1.risk.upperBound, failing: cF, introS0: cS, introNexus: cN, catastrophic: cC, meanNreg: cR / (i + 1) }; });
  // a point is reportable only where the next class has a strictly larger bound (a threshold cannot split equal bounds)
  const reportable = curve.filter((p, i) => i === curve.length - 1 || curve[i + 1].bound > p.bound);
  const at = (k) => { const p = [...reportable].reverse().find((q) => q.k <= k) ?? reportable[0]; return { coverage: r4(p.k / rows.length), classes: p.k, maxBound: r6(p.bound), failingClasses: p.failing, introVsS0: p.introS0, introVsNexus: p.introNexus, catastrophicClasses: p.catastrophic, observedFailureRate: r6(p.failing / p.k), classLevelUpper95: r6(cpUpper(p.failing, p.k)), meanNreg: r4(p.meanNreg) }; };
  const firstFail = curve.find((p) => p.failing > 0), zeroPrefix = [...reportable].reverse().find((p) => p.failing === 0) ?? null;
  const riskCoverage = { label: 'POST_HOC_DIAGNOSTIC', ordering: 'classes ordered by the frozen risk upper bound of the frozen top-ranked action; no threshold other than the frozen tau=0.2 was ever applied by the policy',
    warning: 'Descriptive curve on a spent population. No point on it is a proposed operating point. The class-level bounds treat classes as independent; classes cluster by origin family, so they are optimistic.',
    frozenOperatingPoint: at(A.length), byCoverage: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((c) => at(Math.floor(c * rows.length))),
    largestPrefixWithNoObservedFailure: zeroPrefix && { classes: zeroPrefix.k, coverage: r4(zeroPrefix.k / rows.length), maxBound: r6(zeroPrefix.bound), classLevelUpper95: r6(cpUpper(0, zeroPrefix.k)) }, boundOfFirstObservedFailure: r6(firstFail.bound), rankOfFirstObservedFailure: firstFail.k,
    distinctBoundValues: reportable.length, curve: reportable.map((p) => [p.k, r6(p.bound), p.failing, p.introS0, p.introNexus, p.catastrophic, r4(p.meanNreg)]), curveColumns: ['classes', 'maxBound', 'failingClasses', 'introVsS0', 'introVsNexus', 'catastrophicClasses', 'meanNreg'] };
  need('operatingPointIsTheAcceptedSet', riskCoverage.frozenOperatingPoint.classes === A.length && riskCoverage.frozenOperatingPoint.failingClasses === FA.length);
  for (const s of stored.uncertainty.selective) need('selective:' + s.coverage, curve[s.classes - 1].failing === s.failingClasses);

  // ---------------- breakdowns
  const cols = { classes: () => 1, accepted, abstained: (r) => !accepted(r), failing, failingAccepted: (r) => failing(r) && accepted(r), failingAbstained: (r) => failing(r) && !accepted(r) };
  const byFamilyRows = tab(rows, (r) => r.family, cols), famVals = Object.values(byFamilyRows);
  const breakdowns = { byTopActionType: tab(rows, (r) => r.sk1.type, cols), byCellSuffix: tab(rows, (r) => r.cellSuffix, cols), byHorizon: tab(rows, (r) => r.horizon, cols),
    horizonEffect: new Set(rows.map((r) => r.horizon)).size === 1 ? 'NOT_ESTIMABLE: every class has the same horizon band' : 'see byHorizon',
    byDecidingStage: tab(rows, (r) => r.sk1.margins.decidedBy, cols), byForcedSetEqualsS0: tab(rows, (r) => r.policies.SK1_FORCED.equalsS0, cols), byS0TopFeatureOfChosenAction: tab(rows, (r) => r.publicFeatures['ev.s0.inTop'], cols), byNexusTypeMatch: tab(rows, (r) => r.publicFeatures['ev.nexus.typeMatch'], cols), byExpertsAgreeOnType: tab(rows, (r) => r.evidence.expertsAgreeOnType, cols),
    byLeaveOneBagOutKindFlip: tab(rows, (r) => (r.sk1.stability.looKindChanges > 0 ? 'FLIPS_IN_AT_LEAST_ONE' : 'STABLE'), cols), byOutsideNumericEnvelope: tab(rows, (r) => (r.sk1.ood > 0 ? 'OUTSIDE' : 'INSIDE'), cols),
    originFamilies: { families: famVals.length, withAnyFailing: count(famVals, (v) => v.failing > 0), withAnyAcceptedFailing: count(famVals, (v) => v.failingAccepted > 0), withNoAcceptedClass: count(famVals, (v) => v.accepted === 0), withEveryClassAccepted: count(famVals, (v) => v.abstained === 0),
      failingClassesInTop5Families: sum(famVals.map((v) => v.failing).sort((a, b) => b - a).slice(0, 5)), acceptanceRateAcrossFamilies: quant(famVals.map((v) => v.accepted / v.classes)) }, byFamily: byFamilyRows };

  // ---------------- calibration (source-defined vs descriptive)
  const acts = rows.flatMap((r) => r.actions.map((a) => ({ est: col(a, 'estimate'), up: col(a, 'upper'), cat: col(a, 'cat') !== 'NONE' ? 1 : 0, top: col(a, 'inForcedSet') === 1 && col(a, 'index') === r.sk1.forcedSet[0], acc: accepted(r) }))).filter((a) => a.est !== null);
  const bins = (key, set) => Array.from({ length: 10 }, (_, b) => { const lo = b / 10, hi = b === 9 ? 1.0000001 : (b + 1) / 10, in_ = set.filter((x) => x[key] >= lo && x[key] < hi); return { lo, hi: Math.min(1, hi), n: in_.length, meanPredicted: in_.length ? r4(mean(in_.map((x) => x[key]))) : null, observedRate: in_.length ? r4(mean(in_.map((x) => x.cat))) : null }; });
  const ece = (bs, n) => r4(sum(bs.map((b) => (b.n ? (b.n / n) * Math.abs(b.meanPredicted - b.observedRate) : 0))));
  const estBins = bins('est', acts), upBins = bins('up', acts), tops = acts.filter((a) => a.top), topsA = tops.filter((a) => a.acc), topsB = tops.filter((a) => !a.acc);
  const sel = (set) => ({ decisions: set.length, sumOfRiskEstimates: r4(sum(set.map((a) => a.est))), sumOfRiskUpperBounds: r4(sum(set.map((a) => a.up))), observedCatastrophicInSomeMember: sum(set.map((a) => a.cat)), meanEstimate: r4(mean(set.map((a) => a.est))), meanUpperBound: r4(mean(set.map((a) => a.up))), observedRate: r4(mean(set.map((a) => a.cat))) });
  const calibration = { riskEstimate: { status: 'SOURCE_DEFINED_METRICS_PRESENT', source: 'SK1_VALIDATION_RESULTS.json calibration (frozen run)', target: 'action is catastrophic in at least one member world of the class', actions: stored.calibration.actions, expectedCalibrationError: r4(stored.calibration.expectedCalibrationError), brier: r4(stored.calibration.brier), auroc: r4(stored.calibration.auroc), baseRate: r4(stored.calibration.baseRate),
      recomputedFromMatrix: { actions: acts.length, expectedCalibrationError: ece(estBins, acts.length), bins: estBins }, scope: 'This calibrates the per-action CATASTROPHE estimate. It is not a calibration of the probability that a recommendation INTRODUCES a catastrophe against a comparator, which the model does not estimate.' },
    bagSpreadUncertainty: { status: 'NOT_VERIFIED', reason: 'No source-defined calibration metric exists for the bag-spread bound (mean + 1 sd across 10 family-bootstrap bags). It is a heuristic margin, not a calibrated interval, and is not assumed calibrated.',
      POST_HOC_DIAGNOSTIC_boundVersusObservedRate: { bins: upBins, binsWhereObservedRateExceedsMeanBound: count(upBins, (b) => b.n > 0 && b.observedRate > b.meanPredicted), note: 'Descriptive only: how often actions in each bound bin were catastrophic in some member. It does not verify the bound as a confidence statement.' } },
    POST_HOC_DIAGNOSTIC_selectedActions: { note: 'Model-estimated sums against observed counts for the top-ranked action of each class. Selection of the minimum-risk action could bias estimates downward (optimism); this checks the direction.', accepted: sel(topsA), abstained: sel(topsB), all: sel(tops) },
    introductionVersusCatastrophe: { accepted: { catastrophicInSomeMember: count(A, (r) => r.policies.SK1_FORCED.catAny), introducingAgainstAComparator: FA.length }, abstained: { catastrophicInSomeMember: count(B, (r) => r.policies.SK1_FORCED.catAny), introducingAgainstAComparator: FB.length },
      note: 'The estimator targets catastrophe; the qualification gate counts introductions. A catastrophic choice is not an introduction when the comparator set is also catastrophic in that member world.' } };
  // within-menu discrimination and sharpness of the frozen estimator (descriptive; POST_HOC_DIAGNOSTIC)
  const perMenu = rows.map((r) => { const xs = r.actions.filter((a) => col(a, "estimate") !== null).map((a) => ({ est: col(a, "estimate"), up: col(a, "upper"), cat: col(a, "cat") !== "NONE" ? 1 : 0 })); return { est: auroc(xs.map((x) => [x.est, x.cat])), up: auroc(xs.map((x) => [x.up, x.cat])), lowestEstimateIsCatastrophic: [...xs].sort((a, b) => a.est - b.est)[0].cat, anySafe: xs.some((x) => !x.cat) }; });
  const both = perMenu.filter((m) => m.est !== null), safeActs = acts.filter((a) => !a.cat), catActs = acts.filter((a) => a.cat);
  calibration.POST_HOC_DIAGNOSTIC_withinMenuDiscrimination = { note: "Does the estimate order the actions of ONE menu correctly? Calibration across menus does not imply this.", menusWithBothCatastrophicAndNonCatastrophicActions: both.length, meanWithinMenuAurocOfEstimate: r4(mean(both.map((m) => m.est))), meanWithinMenuAurocOfBound: r4(mean(both.map((m) => m.up))),
    menusWhereTheLowestEstimateActionIsCatastrophicInSomeMember: count(perMenu, (m) => m.lowestEstimateIsCatastrophic === 1), menusWithAtLeastOneActionNeverCatastrophic: count(perMenu, (m) => m.anySafe), menus: perMenu.length };
  calibration.POST_HOC_DIAGNOSTIC_sharpness = { note: "How low does the estimate go for actions that were never catastrophic in any sampled member, and how often would the frozen criterion admit each kind of action?", lowestEstimateOfAnyAction: r4(Math.min(...acts.map((a) => a.est))),
    actionsNeverCatastrophicInSampledMembers: { n: safeActs.length, estimate: quant(safeActs.map((a) => a.est)), boundAtMostTau: count(safeActs, (a) => a.up <= tau) }, actionsCatastrophicInSomeMember: { n: catActs.length, estimate: quant(catActs.map((a) => a.est)), boundAtMostTau: count(catActs, (a) => a.up <= tau) } };
  need('calibrationActions', acts.length === stored.calibration.actions);
  need('calibrationEce', Math.abs(calibration.riskEstimate.recomputedFromMatrix.expectedCalibrationError - stored.calibration.expectedCalibrationError) < 2e-3);

  // ---------------- matched-cohort comparison (same classes, every policy)
  const P = ['S0', 'NEXUS', 'C10', 'SK1_FORCED'], either = (p) => p.introS0 || p.introNexus;
  const cohortStats = (set) => Object.fromEntries(P.map((k) => [k, { classes: set.length, introVsS0: count(set, (r) => r.policies[k].introS0), introVsNexus: count(set, (r) => r.policies[k].introNexus), classesIntroducingAgainstEither: count(set, (r) => either(r.policies[k])), catastrophicClasses: count(set, (r) => r.policies[k].catAny), meanNreg: r4(mean(set.map((r) => r.policies[k].nreg))) }]));
  const pairedVs = (set, other) => { const f = set.map((r) => r.family), d = (g) => bootCI(set.map((r) => g(r.policies.SK1_FORCED) - g(r.policies[other])), f); return { introVsS0: ci(d((p) => Number(p.introS0))), introVsNexus: ci(d((p) => Number(p.introNexus))), introducingAgainstEither: ci(d((p) => Number(either(p)))), catastrophicClass: ci(d((p) => Number(p.catAny))), nreg: ci(d((p) => p.nreg)) }; };
  const matched = { note: 'Same classes for every policy. SK1 chose which classes to accept; the comparators did not. The ACCEPTED cohort therefore shows whether the kernel\'s gain there is more than a selection of classes that are easy for everyone.',
    ACCEPTED: { policies: cohortStats(A), sk1MinusC10: pairedVs(A, 'C10'), sk1MinusS0: pairedVs(A, 'S0'), sk1MinusNexus: pairedVs(A, 'NEXUS') }, ABSTAINED: { policies: cohortStats(B), sk1MinusC10: pairedVs(B, 'C10') }, ALL: { policies: cohortStats(rows), sk1MinusC10: pairedVs(rows, 'C10') },
    fallbackIsNotAutomaticallySafe: { onAbstainedClasses: { s0IntroducesVsNexus: count(B, (r) => r.policies.S0.introNexus), nexusIntroducesVsS0: count(B, (r) => r.policies.NEXUS.introS0), s0CatastrophicInSomeMember: count(B, (r) => r.policies.S0.catAny), nexusCatastrophicInSomeMember: count(B, (r) => r.policies.NEXUS.catAny), c10IntroducesAgainstEither: count(B, (r) => either(r.policies.C10)), classes: B.length } } };
  const sp = stored.paired.SK1_FORCED_minus_C10, mine = bootCI(rows.map((r) => Number(r.policies.SK1_FORCED.introS0) - Number(r.policies.C10.introS0)), fam);
  need('bootstrapReproducesCommittedPairedContrast', mine.point === sp.introVsS0.point && mine.lower025 === sp.introVsS0.lower025 && mine.upper975 === sp.introVsS0.upper975);
  for (const k of P) need('cohortAll:' + k, matched.ALL.policies[k].introVsS0 === stored.policies[k === 'SK1_FORCED' ? 'SK1_FORCED_CHOICE' : k].introVsS0 && matched.ALL.policies[k].introVsNexus === stored.policies[k === 'SK1_FORCED' ? 'SK1_FORCED_CHOICE' : k].introVsNexus);

  // ---------------- assurance arithmetic used by the contract design (pure statistics, no policy)
  const famFail = bootCI(A.map((r) => y(r)), A.map((r) => r.family));
  const assurance = { acceptedDecisions: A.length, acceptedFailingClasses: FA.length, observedRate: r6(FA.length / A.length), classLevelClopperPearsonUpper95: r6(cpUpper(FA.length, A.length)), familyClusterBootstrapUpper95: r6(famFail.upper95), familiesAmongAccepted: famFail.clusters,
    zeroEventUpper95IfNoFailureHadBeenObserved: r6(cpUpper(0, A.length)), sampleSizeForUpper95: Object.fromEntries([0.05, 0.02, 0.01, 0.005, 0.002, 0.001].map((r) => [String(r), { zeroFailures: sampleSizeFor(r, 0), atMostOne: sampleSizeFor(r, 1), atMostTwo: sampleSizeFor(r, 2) }])),
    note: 'Decided-class counts needed for a one-sided 95% Clopper-Pearson bound, assuming independent decisions. Clustered data need more; the design effect must be estimated prospectively.',
    // a decision set equal to a comparator set cannot introduce against that comparator by definition, so it is not evidence about it
    exposureAdjusted: (() => { const eS = A.filter((r) => !r.policies.SK1_FORCED.equalsS0), eN = A.filter((r) => !r.policies.SK1_FORCED.equalsNexus), iS = count(eS, (r) => r.policies.SK1_FORCED.introS0), iN = count(eN, (r) => r.policies.SK1_FORCED.introNexus);
      return { note: "Denominators restricted to accepted decisions whose set differs from the comparator set.", vsS0: { exposedDecisions: eS.length, introductions: iS, upper95: r6(cpUpper(iS, eS.length)) }, vsNexus: { exposedDecisions: eN.length, introductions: iN, upper95: r6(cpUpper(iN, eN.length)) }, acceptedEqualToS0: A.length - eS.length, acceptedEqualToNexus: A.length - eN.length }; })(),
    // one-way ANOVA intraclass correlation of the forced-choice failure indicator across origin families: a PLANNING number only
    POST_HOC_DIAGNOSTIC_designEffect: (() => { const g = new Map(); rows.forEach((r) => { const e = g.get(r.family) ?? g.set(r.family, []).get(r.family); e.push(y(r)); }); const gs = [...g.values()], N = rows.length, K = gs.length, gm = mean(rows.map(y));
      const ssb = sum(gs.map((v) => v.length * (mean(v) - gm) ** 2)), ssw = sum(gs.map((v) => sum(v.map((x) => (x - mean(v)) ** 2)))), msb = ssb / (K - 1), msw = ssw / (N - K), m0 = (N - sum(gs.map((v) => v.length ** 2)) / N) / (K - 1), icc = Math.max(0, (msb - msw) / (msb + (m0 - 1) * msw)), mbar = N / K;
      return { indicator: "forced-choice class introduces against S0 or Nexus (all 600 classes, 39 events)", families: K, meanClassesPerFamily: r4(mbar), largestFamily: Math.max(...gs.map((v) => v.length)), intraclassCorrelation: r4(icc), designEffect: r4(1 + (mbar - 1) * icc), note: "Estimated on a spent population with few events; use only to size a future campaign, and re-estimate on fresh EXPLORATION data before any freeze." }; })() };

  // ---------------- Phase 2 / 4: failure taxonomy and the accepted failures
  const fcols = { classes: () => 1, accepted: (r) => r.failure.accepted, vsS0: (r) => r.failure.vsS0, vsNexus: (r) => r.failure.vsNexus, onBase: (r) => r.failure.onBase };
  const taxonomy = { failingClasses: Fx.length, vsS0: count(Fx, (r) => r.failure.vsS0), vsNexus: count(Fx, (r) => r.failure.vsNexus), vsBoth: count(Fx, (r) => r.failure.vsS0 && r.failure.vsNexus), vsS0Only: count(Fx, (r) => r.failure.vsS0 && !r.failure.vsNexus), vsNexusOnly: count(Fx, (r) => !r.failure.vsS0 && r.failure.vsNexus),
    byRankingStage: tab(Fx, (r) => r.failure.rankingStage, fcols), byChosenCatastrophicIn: tab(Fx, (r) => r.failure.chosenCatastrophicIn, fcols), byBaseOrTwinOnly: tab(Fx, (r) => (r.failure.onBase ? 'BASE_WORLD' : 'TWIN_ONLY'), fcols), byComparatorRelation: tab(Fx, (r) => r.failure.comparatorRelation, fcols), byTopActionType: tab(Fx, (r) => r.sk1.type, fcols),
    safeAlternative: { existsInEveryFailingClass: Fx.every((r) => r.alternatives.safeOtherCount > 0), existsInEveryClass: rows.every((r) => r.alternatives.safeCount > 0), failingWhereASafeAlternativeMetTheFrozenCriterion: count(Fx, (r) => r.alternatives.safeAlternativeUnderTau), failingWhereASafeAlternativeSharedTheTier: count(Fx, (r) => r.alternatives.safeAlternativeSharesTier),
      failingWhereTheEstimateRankedSomeSafeAlternativeSafer: count(Fx, (r) => r.alternatives.estimateRanksSomeSafeAlternativeSafer), failingWhereTheBoundRankedSomeSafeAlternativeSafer: count(Fx, (r) => r.alternatives.boundRanksSomeSafeAlternativeSafer), failingWhereTheBoundRankedTheUnsafeChoiceSaferThanEverySafeAlternative: count(Fx, (r) => !r.alternatives.boundRanksSomeSafeAlternativeSafer),
      rankOfBestSafeAlternative: quant(Fx.map((r) => r.alternatives.bestSafeAlternative?.rank ?? null)), boundGapBestSafeAlternativeMinusChosen: quant(Fx.map((r) => (r.alternatives.bestSafeAlternative ? r.alternatives.bestSafeAlternative.upper - r.sk1.risk.upperBound : null))) },
    stability: { failingWhereLeaveOneBagOutChangesTheForcedSet: count(Fx, (r) => r.sk1.stability.looForcedSetChanges > 0), nonFailingWhereItChanges: count(rows.filter((r) => !failing(r)), (r) => r.sk1.stability.looForcedSetChanges > 0), acceptedWhereLeaveOneBagOutFlipsToAbstain: count(A, (r) => r.sk1.stability.looKindChanges > 0), abstainedWhereItFlipsToRecommend: count(B, (r) => r.sk1.stability.looKindChanges > 0) },
    allClasses: { forcedSetIsASafeSet: count(rows, (r) => r.alternatives.forcedSetSafe), classesWhereSomeSafeActionMeetsTheFrozenCriterion: count(rows, (r) => r.actions.some((a) => col(a, 'selectable') === 1 && col(a, 'upper') !== null && col(a, 'upper') <= tau && col(a, 'introS0') === 0 && col(a, 'introNexus') === 0)),
      abstainedClassesWhereTheForcedSetWasSafe: count(B, (r) => r.alternatives.forcedSetSafe) } };
  need('taxonomy', taxonomy.vsS0 === stored.policies.SK1_FORCED_CHOICE.introVsS0 && taxonomy.vsNexus === stored.policies.SK1_FORCED_CHOICE.introVsNexus && taxonomy.vsBoth === stored.failureBreakdown.SK1_FORCED_CHOICE.both);
  const decode = (r) => r.actions.map((a) => Object.fromEntries(AC.map((k, i) => [k, a[i]])));
  const acceptedFailures = FA.map((r) => ({ alias: r.alias, family: r.family, horizon: r.horizon, menuSize: r.menuSize, memberWorlds: r.members, recommended: { set: r.sk1.forcedSet, type: r.sk1.type, reason: r.sk1.reason, decisionHash: r.sk1.decisionHash }, outcome: r.failure, policies: r.policies,
    risk: r.sk1.risk, tier: r.sk1.tier, expectedRegret: r.sk1.expectedRegret, outsideNumericEnvelope: r.sk1.ood, margins: r.sk1.margins, stability: r.sk1.stability, alternatives: r.alternatives, publicFeatures: r.publicFeatures, evidence: r.evidence, rankedActions: decode(r) }));
  need('acceptedFailureEvents', sum(acceptedFailures.map((f) => Number(f.outcome.vsS0))) === stored.policies.SK1_AS_SPECIFIED.introVsS0 && sum(acceptedFailures.map((f) => Number(f.outcome.vsNexus))) === stored.policies.SK1_AS_SPECIFIED.introVsNexus);
  const perFailingClass = Fx.map((r) => ({ alias: r.alias, family: r.family, accepted: r.failure.accepted, vsS0: r.failure.vsS0, vsNexus: r.failure.vsNexus, onBase: r.failure.onBase, type: r.sk1.type, chosenCatastrophicIn: r.failure.chosenCatastrophicIn, comparatorRelation: r.failure.comparatorRelation, rankingStage: r.failure.rankingStage,
    estimate: r.sk1.risk.estimate, spread: r.sk1.risk.spread, upperBound: r6(r.sk1.risk.upperBound), tier: r.sk1.tier, tauMargin: r.sk1.margins.tauMargin, safeAlternatives: r.alternatives.safeOtherCount, bestSafeAlternative: r.alternatives.bestSafeAlternative, looForcedSetChanges: r.sk1.stability.looForcedSetChanges }));

  const src = { matrixSha256: sha(matrixText), validationResultsSha256: M.source.validationResultsSha256, analyzerSha256: sha(readFileSync(fileURLToPath(import.meta.url))) }, labels = ['READ_ONLY_DIAGNOSTIC', 'SPENT_VALIDATION_POPULATION', 'POST_HOC_DIAGNOSTIC', 'NOT_VALIDATION_MATERIAL_FOR_ANY_FUTURE_POLICY'];
  const head = (schema) => ({ schema, authority: 'R0', stage: 'STAGE3H-SK1.1', labels, source: src, reconciliation: { exact: issues.length === 0, issues } });
  return { issues,
    riskCoverage: { ...head('SK1_1_RISK_COVERAGE_V1'), frozenCriterion: { tau, tierWidth: 0.1, z: 1, statement: 'recommend only if the top-ranked action\'s risk upper bound is at most tau; unchanged by this analysis' }, counts, distributions, discrimination, riskCoverage, breakdowns, calibration, matchedCohorts: matched, assuranceArithmetic: assurance },
    attribution: { ...head('SK1_1_FAILURE_ATTRIBUTION_V1'), taxonomy, acceptedFailures, perFailingClass } };
}
const text = (o) => JSON.stringify(o, null, 1) + '\n';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', res = analyse(), t = { riskCoverage: text(res.riskCoverage), attribution: text(res.attribution) };
  console.log(J({ mode, reconciliation: { exact: res.issues.length === 0, issues: res.issues }, sha256: { riskCoverage: sha(t.riskCoverage), attribution: sha(t.attribution) } }, null, 1));
  if (res.issues.length) { console.log('SK1_1_ANALYSIS_RECONCILIATION_FAILED'); process.exitCode = 1; }
  else if (mode === '--write') { for (const k of Object.keys(OUT)) { const fd = openSync(OUT[k], 'wx'); writeSync(fd, t[k]); closeSync(fd); } console.log('written evidence/SK1_1_RISK_COVERAGE.json and evidence/SK1_1_FAILURE_ATTRIBUTION.json'); }
  else if (mode === 'check') { const same = Object.keys(OUT).every((k) => readFileSync(OUT[k], 'utf8') === t[k]); console.log(same ? 'SK1_1_ANALYSIS_CHECK_PASS' : 'SK1_1_ANALYSIS_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode === 'print') console.log(t[process.argv[3] ?? 'riskCoverage']);
  else if (mode !== 'dry') throw Error('USAGE: node diagnostics/analyze.mjs [--write | check | print riskCoverage|attribution]');
}
