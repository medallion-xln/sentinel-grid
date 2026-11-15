// STAGE 3H-SK2-F — selective-assurance feasibility analysis (READ-ONLY DIAGNOSTIC, authority R0).
//   node diagnostics/feasibility.mjs            recompute and print the verdict block
//   node diagnostics/feasibility.mjs --write    create evidence/SK2F_FEASIBILITY.json (exclusive)
//   node diagnostics/feasibility.mjs check      recompute and compare byte-for-byte; writes nothing
// Inputs are TRACKED evidence only (the SK2-F exploration matrix, the SK1 training record, the SK1.1 validation matrix).
// Node built-ins plus two pure statistics helpers from the SK1.1 lane. Runs from a clean checkout.
//
// Rules this analysis keeps
//   * The research targets (risk 0.01, confidence 0.95, coverage 0.40) are INPUTS fixed by the owner mandate. Nothing
//     here derives, moves or recommends a threshold, and no statistic of the spent validation population selects anything.
//   * The spent validation population appears only as HISTORICAL arithmetic that was already disclosed.
//   * Every alternative-cutoff or risk-coverage figure is POST_HOC_EXPLORATORY_ONLY.
//   * Endpoints are comparator-relative INTRODUCTIONS. They are not the risk model's catastrophe labels, and the
//     model's calibration on catastrophe is not evidence of calibration on introductions.
//   * An abstention is the absence of a recommendation. It is never counted as a safe native-world outcome.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { cpUpper, bootCI } from '../../stage3h-sk1-1-assurance-v1/diagnostics/analyze.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..');
const EXP_FILE = resolve(LANE, 'evidence/SK2F_EXPLORATION_MATRIX.json'), VAL_FILE = resolve(GA, 'stage3h-sk1-1-assurance-v1/evidence/SK1_1_DECISION_FAILURE_MATRIX.json'), TRAIN_FILE = resolve(GA, 'stage3h-sk1-safety-kernel-v1/evidence/SK1_TRAINING_RECORD.json');
export const OUT_FILE = resolve(LANE, 'evidence/SK2F_FEASIBILITY.json');
export const TARGET = Object.freeze({ selectiveRisk: 0.01, confidence: 0.95, minimumCoverage: 0.40, status: 'RESEARCH_TARGETS_NOT_RATIFIED' });
const sha = (b) => createHash('sha256').update(b).digest('hex'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8')), J = JSON.stringify;
const r4 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e4) / 1e4), r6 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e6) / 1e6);
const sum = (a) => a.reduce((x, y) => x + y, 0), mean = (a) => (a.length ? sum(a) / a.length : null), count = (a, f) => a.filter(f).length;
const quant = (a) => { const s = a.filter((x) => x !== null && x !== undefined).sort((x, y) => x - y), q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null); return { n: s.length, min: r4(s[0] ?? null), p10: r4(q(0.1)), p25: r4(q(0.25)), p50: r4(q(0.5)), p75: r4(q(0.75)), p90: r4(q(0.9)), max: r4(s[s.length - 1] ?? null), mean: r4(mean(s)) }; };
const auroc = (pairs) => { const pos = count(pairs, (x) => x[1]), neg = pairs.length - pos; if (!pos || !neg) return null; const s = [...pairs].sort((a, b) => a[0] - b[0]); let rs = 0, i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1][0] === s[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (s[k][1]) rs += avg; i = j + 1; } return (rs - (pos * (pos + 1)) / 2) / (pos * neg); };
/** P(X <= k) for X ~ Binomial(n, p), by the pmf recurrence. */
export const binCdf = (k, n, p) => { if (k < 0) return 0; if (k >= n) return 1; let pmf = Math.exp(n * Math.log1p(-p)), s = pmf; const ratio = p / (1 - p); for (let i = 0; i < k; i++) { pmf *= ((n - i) / (i + 1)) * ratio; s += pmf; } return Math.min(1, s); };
/** Largest count of events with which a one-sided (1-alpha) Clopper-Pearson upper bound is still <= r, or -1. */
export const passCount = (n, r, alpha) => { let k = -1; while (k + 1 <= n && binCdf(k + 1, n, r) <= alpha) k++; return k; };
/** Probability of meeting "upper bound <= r" with n decisions when the true rate is p. */
export const passProbability = (n, r, alpha, p) => { const k = passCount(n, r, alpha); return k < 0 ? 0 : binCdf(k, n, p); };
/** Smallest n from which the pass probability stays at or above `power` (the discrete power curve is saw-toothed). */
export function requiredN(r, alpha, p, power, cap = 200000) {
  let k = -1, lastBelow = 0; const step = (n) => { while (binCdf(k + 1, n, r) <= alpha) k++; return k < 0 ? 0 : binCdf(k, n, p); };
  for (let n = 1; n <= cap; n++) { if (step(n) < power) lastBelow = n; else if (n - lastBelow > 4 * Math.ceil(1 / r)) return lastBelow + 1; }
  return null;
}
/** One-way ANOVA intraclass correlation of a 0/1 indicator across clusters, and the Kish design effect. */
function designEffect(values, clusters) {
  const g = new Map(); values.forEach((v, i) => (g.get(clusters[i]) ?? g.set(clusters[i], []).get(clusters[i])).push(v)); const gs = [...g.values()], N = values.length, K = gs.length;
  if (K < 2 || N <= K) return { clusters: K, icc: null, designEffect: null };
  const gm = mean(values), ssb = sum(gs.map((v) => v.length * (mean(v) - gm) ** 2)), ssw = sum(gs.map((v) => sum(v.map((x) => (x - mean(v)) ** 2)))), msb = ssb / (K - 1), msw = ssw / (N - K), m0 = (N - sum(gs.map((v) => v.length ** 2)) / N) / (K - 1);
  const icc = msb + (m0 - 1) * msw > 0 ? Math.max(0, (msb - msw) / (msb + (m0 - 1) * msw)) : 0, cv2 = sum(gs.map((v) => (v.length - N / K) ** 2)) / K / (N / K) ** 2, mbar = N / K;
  return { clusters: K, meanClusterSize: r4(mbar), largestCluster: Math.max(...gs.map((v) => v.length)), icc: r6(icc), designEffect: r4(1 + (mbar * (1 + cv2) - 1) * icc), note: 'Kish design effect with unequal cluster sizes: 1 + (m(1+cv^2) - 1) * icc' };
}
const ci = (b) => ({ point: r6(b.point), lower025: r6(b.lower025), upper975: r6(b.upper975), upper95: r6(b.upper95), clusters: b.clusters });
const DEFF_GRID = [1, 1.11, 1.5, 2, 3];

/** The three endpoints and every bound, for one cohort description { eligible:[rows], view: (row)=>decision view }. */
function endpointBlock(name, eligible, view, note) {
  const acc = eligible.filter((r) => view(r).accepted), n = acc.length, N = eligible.length, A = count(acc, (r) => view(r).introS0), B = count(acc, (r) => view(r).introNexus), C = count(acc, (r) => view(r).union);
  const expS = acc.filter((r) => !view(r).equalsS0), expN = acc.filter((r) => !view(r).equalsNexus), fam = acc.map((r) => r.family), u = acc.map((r) => Number(view(r).union));
  const de = designEffect(u, fam), boot = n ? bootCI(u, fam) : null, cov = bootCI(eligible.map((r) => Number(view(r).accepted)), eligible.map((r) => r.family));
  const famWith = new Set(acc.filter((r) => view(r).union).map((r) => r.family)).size, famAcc = new Set(fam).size;
  return { reading: name, note, eligibleClasses: N, acceptedDecisions: n,
    SELECTIVE_COVERAGE: { value: r6(n / N), exact95: [r6(1 - cpUpper(N - n, N, 0.025)), r6(cpUpper(n, N, 0.025))], familyClustered95: [r6(cov.lower025), r6(cov.upper975)], meetsMinimumCoveragePoint: n / N >= TARGET.minimumCoverage, lowerBoundMeetsMinimumCoverage: Math.min(1 - cpUpper(N - n, N, 0.025), cov.lower025) >= TARGET.minimumCoverage },
    endpoints: {
      A_INTRODUCTION_VS_S0: { acceptedIntroductions: A, rate: r6(A / n), exposedDecisions: expS.length, exposedRate: r6(A / expS.length), exactUpper95: r6(cpUpper(A, n)), exactUpper97_5_ifClaimedJointlyWithB: r6(cpUpper(A, n, 0.025)), exposedExactUpper97_5: r6(cpUpper(A, expS.length, 0.025)) },
      B_INTRODUCTION_VS_NEXUS: { acceptedIntroductions: B, rate: r6(B / n), exposedDecisions: expN.length, exposedRate: r6(B / expN.length), exactUpper95: r6(cpUpper(B, n)), exactUpper97_5_ifClaimedJointlyWithA: r6(cpUpper(B, n, 0.025)), exposedExactUpper97_5: r6(cpUpper(B, expN.length, 0.025)) },
      C_UNION_INTRODUCTION: { uniqueAcceptedFailingClasses: C, comparatorRelativeEvents: A + B, classesFailingBothComparators: A + B - C, SELECTIVE_FAILURE_RATE: r6(C / n), FULL_POPULATION_INTRODUCTION_RATE: r6(C / N), exactUpper95: r6(cpUpper(C, n)), supportsOnePercentUpperBound: cpUpper(C, n) <= TARGET.selectiveRisk, pointEstimateAtMostTarget: C / n <= TARGET.selectiveRisk } },
    originFamilies: { amongAccepted: famAcc, withAnAcceptedFailure: famWith, familyLevelRate: r6(famWith / famAcc), familyLevelExactUpper95: r6(cpUpper(famWith, famAcc)), ...de, effectiveSampleSize: de.designEffect ? Math.floor(n / de.designEffect) : n,
      familyClusterBootstrapOfUnionRate: boot && { ...ci(boot), caveat: 'percentile cluster bootstrap; with a handful of events it is unstable and tends to be narrower than the exact bound' },
      designEffectSensitivity: DEFF_GRID.map((d) => ({ designEffect: d, effectiveDecisions: Math.floor(n / d), conservativeUpper95: r6(cpUpper(C, Math.floor(n / d))), note: 'same observed count on n/deff independent decisions' })) } };
}
function curve(eligible, view, label) {
  const order = [...eligible].sort((a, b) => view(a).upper - view(b).upper || (a.alias < b.alias ? -1 : 1)), N = order.length; let cF = 0, cS = 0, cN = 0, cC = 0;
  const pts = order.map((r, i) => { const v = view(r); cF += Number(v.union); cS += Number(v.introS0); cN += Number(v.introNexus); cC += Number(v.catAny); return { k: i + 1, bound: v.upper, failing: cF, s0: cS, nexus: cN, cat: cC }; });
  const rep = pts.filter((p, i) => i === pts.length - 1 || pts[i + 1].bound > p.bound), at = (k) => { const p = [...rep].reverse().find((q) => q.k <= k) ?? rep[0]; return { coverage: r4(p.k / N), classes: p.k, largestBound: r6(p.bound), unionFailing: p.failing, vsS0: p.s0, vsNexus: p.nexus, catastrophic: p.cat, rate: r6(p.failing / p.k), exactUpper95: r6(cpUpper(p.failing, p.k)) }; };
  const first = pts.find((p) => p.failing > 0) ?? null, zero = [...rep].reverse().find((p) => p.failing === 0) ?? null;
  return { label, reading: 'POST_HOC_EXPLORATORY_ONLY', byCoverage: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((c) => at(Math.floor(c * N))), firstFailureAtRank: first?.k ?? null, firstFailureBound: first ? r6(first.bound) : null, longestFailureFreePrefix: zero ? { classes: zero.k, coverage: r4(zero.k / N), largestBound: r6(zero.bound) } : null,
    largestCoverageWithPointRateAtMostTarget: (() => { const ok = rep.filter((p) => p.failing / p.k <= TARGET.selectiveRisk); const p = ok[ok.length - 1]; return p ? { classes: p.k, coverage: r4(p.k / N), rate: r6(p.failing / p.k) } : null; })(),
    largestCoverageWithExactUpper95AtMostTarget: (() => { const ok = rep.filter((p) => cpUpper(p.failing, p.k) <= TARGET.selectiveRisk); const p = ok[ok.length - 1]; return p ? { classes: p.k, coverage: r4(p.k / N), failing: p.failing } : null; })() };
}
const ks = (a, b) => { const xs = [...new Set([...a, ...b])].sort((x, y) => x - y), sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y); let i = 0, j = 0, d = 0; for (const x of xs) { while (i < sa.length && sa[i] <= x) i++; while (j < sb.length && sb[j] <= x) j++; d = Math.max(d, Math.abs(i / sa.length - j / sb.length)); } return r4(d); };

export function analyse() {
  const expText = readFileSync(EXP_FILE, 'utf8'), E = JSON.parse(expText), valText = readFileSync(VAL_FILE, 'utf8'), V = JSON.parse(valText), T = readJ(TRAIN_FILE), arm = T.arms.find((a) => a.arm === 'PRIMARY');
  const issues = [], need = (name, ok) => { if (!ok) issues.push(name); };
  need('explorationMatrixReconciled', E.reconciliation.exact === true); need('validationMatrixReconciled', V.reconciliation.exact === true);
  need('sameFrozenModel', E.source.modelHash === V.source.modelHash && E.source.modelHash === arm.model.modelHash); need('trainingRecordIdentity', sha(readFileSync(TRAIN_FILE)) === E.source.trainingRecordSha256);
  const tau = E.frozenCriterion.tau, ER = E.rows, EO = ER.filter((r) => r.outOfBag), AC = E.actionColumns, col = (a, k) => a[AC.indexOf(k)], VC = V.actionColumns, vcol = (a, k) => a[VC.indexOf(k)];
  need('frozenTau', tau === 0.2 && arm.outOfFold.chosenTau.tau === 0.2 && ER.every((r) => r.inSample.accepted === (r.inSample.upper <= tau)));
  // historical validation, already disclosed: expressed in the same view shape
  const vView = (r) => ({ accepted: !r.sk1.abstained, introS0: r.policies.SK1_FORCED.introS0, introNexus: r.policies.SK1_FORCED.introNexus, union: r.failure !== null, catAny: r.policies.SK1_FORCED.catAny, equalsS0: r.policies.SK1_FORCED.equalsS0, equalsNexus: r.policies.SK1_FORCED.equalsNexus, upper: r.sk1.risk.upperBound, type: r.sk1.type });
  const VR = V.rows, vAcc = VR.filter((r) => vView(r).accepted);
  need('baseline', VR.length === 600 && vAcc.length === 304 && VR.length - vAcc.length === 296 && count(vAcc, (r) => vView(r).union) === 2 && count(vAcc, (r) => vView(r).introS0) + count(vAcc, (r) => vView(r).introNexus) === 3 && count(VR, (r) => vView(r).union) === 39 && count(VR, (r) => vView(r).union && !vView(r).accepted) === 37);

  // ================= Gate 1 / 2: endpoints and bounds
  const IS = endpointBlock('EXPLORATION_IN_SAMPLE', ER, (r) => r.inSample, 'frozen rule on the classes the model was fit on; resubstitution, OPTIMISTIC');
  const OOB = endpointBlock('EXPLORATION_OUT_OF_BAG', EO, (r) => r.outOfBag, 'diagnostic estimator from out-of-bag bags only; NOT the frozen rule; fewer and weaker bags per class, so it is PESSIMISTIC about the frozen rule and accepts more classes than it');
  const HV = endpointBlock('HISTORICAL_VALIDATION', VR, vView, 'spent one-pass validation of the frozen rule; historical arithmetic only; drives no selection');
  const oofT = arm.outOfFold.ruleT2, oof = oofT.find((x) => x.tau === tau), oofFull = oofT[oofT.length - 1], oofT1 = arm.outOfFold.ruleT1.find((x) => x.tierWidth === arm.outOfFold.chosenTierWidth);
  const OOF = { reading: 'EXPLORATION_OUT_OF_FOLD_REFERENCE', note: 'recorded by the trainer before validation was opened: five family-grouped folds, each scored by a model fit on the other four. The honest development figure for the frozen rule. Aggregate only; cited, not recomputed.',
    eligibleClasses: 1000, acceptedDecisions: oof.decided, SELECTIVE_COVERAGE: { value: oof.coverage, exact95: [r6(1 - cpUpper(1000 - oof.decided, 1000, 0.025)), r6(cpUpper(oof.decided, 1000, 0.025))], familyClustered95: null, meetsMinimumCoveragePoint: oof.coverage >= TARGET.minimumCoverage, lowerBoundMeetsMinimumCoverage: 1 - cpUpper(1000 - oof.decided, 1000, 0.025) >= TARGET.minimumCoverage },
    endpoints: { A_INTRODUCTION_VS_S0: 'NOT_RECORDED_AT_THIS_THRESHOLD', B_INTRODUCTION_VS_NEXUS: 'NOT_RECORDED_AT_THIS_THRESHOLD', C_UNION_INTRODUCTION: { uniqueAcceptedFailingClasses: oof.failingClasses, SELECTIVE_FAILURE_RATE: r6(oof.rate), FULL_POPULATION_INTRODUCTION_RATE: r6(oof.failingClasses / 1000), exactUpper95: r6(cpUpper(oof.failingClasses, oof.decided)), supportsOnePercentUpperBound: cpUpper(oof.failingClasses, oof.decided) <= TARGET.selectiveRisk, pointEstimateAtMostTarget: oof.rate <= TARGET.selectiveRisk } },
    originFamilies: { status: 'NOT_AVAILABLE: per-class out-of-fold decisions were not persisted', designEffectSensitivity: DEFF_GRID.map((d) => ({ designEffect: d, effectiveDecisions: Math.floor(oof.decided / d), conservativeUpper95: r6(cpUpper(oof.failingClasses, Math.floor(oof.decided / d))) })) },
    fullCoverage: { forcedChoiceFailingClasses: oofFull.failingClasses, introVsS0: oofT1.introVsS0, introVsNexus: oofT1.introVsNexus }, thresholdGrid: oofT.map((x) => ({ tau: x.tau, accepted: x.decided, coverage: x.coverage, unionFailing: x.failingClasses, rate: r6(x.rate), exactUpper95: x.decided ? r6(cpUpper(x.failingClasses, x.decided)) : null })),
    howTheFrozenThresholdWasChosen: arm.outOfFold.chosenTau.branch };
  const pooledK = oof.failingClasses + HV.endpoints.C_UNION_INTRODUCTION.uniqueAcceptedFailingClasses, pooledN = oof.decided + HV.acceptedDecisions;
  const pooled = { label: 'POST_HOC_EXPLORATORY_ONLY', note: 'out-of-fold development plus historical validation. Different models (fold models vs the frozen model) and a spent population: descriptive only, not a test.', unionFailing: pooledK, acceptedDecisions: pooledN, rate: r6(pooledK / pooledN), exactUpper95: r6(cpUpper(pooledK, pooledN)), supportsOnePercentUpperBound: cpUpper(pooledK, pooledN) <= TARGET.selectiveRisk };
  need('historicalBound', Math.abs(HV.endpoints.C_UNION_INTRODUCTION.exactUpper95 - 0.020564) < 1e-6 && HV.endpoints.C_UNION_INTRODUCTION.supportsOnePercentUpperBound === false);

  // ================= sample size
  const r = TARGET.selectiveRisk, RATES = [0.007, 0.005, 0.0033, 0.002, 0.001], covs = [0.40, 0.434, 0.507];
  const design = (alpha) => RATES.map((p) => { const n80 = requiredN(r, alpha, p, 0.8), n90 = requiredN(r, alpha, p, 0.9); return { trueRate: p, acceptedDecisionsFor80: n80, acceptedDecisionsFor90: n90, passingCountAtN80: n80 ? passCount(n80, r, alpha) : null,
    eligibleValidationClassesFor80: Object.fromEntries(covs.map((c) => [`coverage_${c}`, Object.fromEntries([1, 1.11, 1.5, 2].map((d) => [`deff_${d}`, n80 ? Math.ceil((n80 * d) / c) : null]))])) }; });
  const FEASIBLE_N = [300, 500, 700, 1000, 1400, 2000, 3000, 6000], powerAt = (alpha) => FEASIBLE_N.map((n) => ({ acceptedDecisions: n, passingCount: passCount(n, r, alpha), passProbability: Object.fromEntries(RATES.map((p) => [String(p), r4(passProbability(n, r, alpha, p))])),
    largestTrueRateWith80PercentPower: (() => { let lo = 0, hi = r; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (passProbability(n, r, alpha, mid) >= 0.8) lo = mid; else hi = mid; } return r6(lo); })() }));
  const sk1Scale = { admittedClassesPerScreenedBlock: r4(2298 / 26), sk1ValidationClasses: 600, sk1TotalAdmitted: 2298, sk1BlocksScreened: 26, source: 'SK1_RESULT.md: 26 blocks screened, 2,298 admitted, 600 validation classes' };
  const n80at07 = requiredN(r, 0.05, 0.007, 0.8), valNeeded = Math.ceil((n80at07 * 1.11) / 0.434);
  const sampleSize = { target: TARGET, assumption: 'exact one-sided binomial test of H0: rate >= 0.01; independent decisions; multiply by the design effect and divide by coverage to get eligible classes',
    primaryClaimUnionAtAlpha05: design(0.05), twoComparatorClaimsBonferroniAlpha025: design(0.025), simultaneousClaims: 'One claim on the UNION endpoint at 95% bounds both comparator endpoints, because each comparator event is a subset of the union. Separate comparator claims (for example on exposure-adjusted denominators) need 97.5% each.',
    passProbabilityAtFeasibleSizes: { unionAlpha05: powerAt(0.05), bonferroniAlpha025: powerAt(0.025) }, scaleReference: sk1Scale,
    atTheRateSK1Shows: { trueRate: 0.007, acceptedDecisionsFor80PercentPower: n80at07, eligibleValidationClasses: valNeeded, multipleOfSk1Validation: r4(valNeeded / 600), screenedBlocksIfAllAdmittedClassesWereValidation: Math.ceil(valNeeded / (2298 / 26)), assumptions: 'design effect 1.11, coverage 0.434' } };

  // ---- paired design for a discrimination hypothesis: a new policy against frozen SK1 on the SAME fresh classes, full coverage.
  // McNemar-type normal approximation, one-sided 5%, 80% power, under the conservative assumption that the two policies fail independently.
  const mcnemar = (p0, p1) => { const b = p0 * (1 - p1), c = p1 * (1 - p0), d = b - c, n = ((1.6449 * Math.sqrt(b + c) + 0.8416 * Math.sqrt(b + c - d * d)) ** 2) / (d * d); return { baselineTop1UnsafeRate: p0, candidateTop1UnsafeRate: r4(p1), relativeReduction: r4(1 - p1 / p0), classesNeeded: Math.ceil(n), classesNeededWithDesignEffect1_11: Math.ceil(n * 1.11) }; };
  const p0 = r6(39 / 600);
  sampleSize.discriminationHypothesisPairedDesign = { note: "top-1 unsafe rate = forced-choice union introduction rate at full coverage; baseline is the frozen SK1 figure on historical validation, used as a planning value only", outOfFoldDevelopmentBaseline: r6(oofFull.failingClasses / 1000), scenarios: [0.3, 0.5, 0.7].map((red) => mcnemar(p0, p0 * (1 - red))), assumption: "independent failures between the two policies (conservative: positively associated failures need fewer classes)" };

  // ================= finite-sample selection bias
  const isC = IS.endpoints.C_UNION_INTRODUCTION, oobC = OOB.endpoints.C_UNION_INTRODUCTION, isCurve = curve(ER, (x) => x.inSample, 'exploration, in-sample'), oobCurve = curve(EO, (x) => x.outOfBag, 'exploration, out-of-bag'), valCurve = curve(VR, vView, 'historical validation');
  const selectionBias = { resubstitution: { note: 'the same frozen threshold, three readings of the same 1,000 exploration classes', inSample: { accepted: IS.acceptedDecisions, unionFailing: isC.uniqueAcceptedFailingClasses, rate: isC.SELECTIVE_FAILURE_RATE }, outOfFold: { accepted: oof.decided, unionFailing: oof.failingClasses, rate: r6(oof.rate) }, outOfBag: { eligible: OOB.eligibleClasses, accepted: OOB.acceptedDecisions, unionFailing: oobC.uniqueAcceptedFailingClasses, rate: oobC.SELECTIVE_FAILURE_RATE },
      reading: 'In-sample acceptance is larger and cleaner than out-of-fold acceptance of the same classes. Any acceptance rule must be judged on classes its model never saw.' },
    thresholdSelection: { note: 'the frozen threshold was itself picked from a grid by its out-of-fold rate', rule: arm.outOfFold.chosenTau.branch, gridPointsEligible: count(oofT, (x) => x.coverage >= 0.25), consequence: 'the out-of-fold rate at the chosen point is a minimum over eligible grid points and is mildly optimistic; validation (0.66%) did not contradict it' },
    failureFreePrefix: { label: 'POST_HOC_EXPLORATORY_ONLY', note: 'a cutoff placed just before the first observed failure is chosen by the outcome and carries no valid zero-event bound',
      probabilityOfAFailureFreePrefixOfThisLengthIfTheTrueRateWereConstant: Object.fromEntries([['validation_170_at_0.7pct', r4(Math.pow(1 - 0.007, 170))], ['validation_170_at_1pct', r4(Math.pow(1 - 0.01, 170))]]),
      prefixes: { historicalValidation: valCurve.longestFailureFreePrefix, explorationInSample: isCurve.longestFailureFreePrefix, explorationOutOfBag: oobCurve.longestFailureFreePrefix } } };

  // ================= Gate 3: risk-coverage evidence
  const capture = (rows, view) => { const fail = rows.filter((x) => view(x).union), acc = rows.filter((x) => view(x).accepted); return { classes: rows.length, accepted: acc.length, abstained: rows.length - acc.length, forcedChoiceFailing: fail.length, failingWithheld: count(fail, (x) => !view(x).accepted), failingAccepted: count(fail, (x) => view(x).accepted), noObservedIntroductionButWithheld: count(rows, (x) => !view(x).accepted && !view(x).union), failureCapture: r4(count(fail, (x) => !view(x).accepted) / fail.length), forcedFailureRateAtFullCoverage: r6(fail.length / rows.length) }; };
  const tab = (rows, key, view) => { const m = new Map(); for (const x of rows) { const k = String(key(x)), e = m.get(k) ?? m.set(k, { classes: 0, accepted: 0, forcedFailing: 0, acceptedFailing: 0 }).get(k), v = view(x); e.classes++; e.accepted += Number(v.accepted); e.forcedFailing += Number(v.union); e.acceptedFailing += Number(v.accepted && v.union); } return Object.fromEntries([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))); };
  const famSummary = (rows, view) => { const t = Object.values(tab(rows, (x) => x.family, view)); return { families: t.length, withAnyForcedFailure: count(t, (v) => v.forcedFailing > 0), withAnAcceptedFailure: count(t, (v) => v.acceptedFailing > 0), withNoAcceptedClass: count(t, (v) => v.accepted === 0), acceptanceRate: quant(t.map((v) => v.accepted / v.classes)), forcedFailureRate: quant(t.map((v) => v.forcedFailing / v.classes)) }; };
  const dists = (rows, view) => { const coh = { accepted: rows.filter((x) => view(x).accepted), abstained: rows.filter((x) => !view(x).accepted), forcedFailing: rows.filter((x) => view(x).union), acceptedFailing: rows.filter((x) => view(x).accepted && view(x).union) }; return Object.fromEntries(['estimate', 'spread', 'upper'].map((f) => [f, Object.fromEntries(Object.entries(coh).map(([k, v]) => [k, quant(v.map((x) => view(x)[f]))]))])); };
  const horizons = [...new Set([...ER.map((x) => x.horizon), ...VR.map((x) => x.horizon)])];
  const expFam = new Set(ER.map((x) => x.family)), valFam = new Set(VR.map((x) => x.family));
  const riskCoverage = { label: 'POST_HOC_EXPLORATORY_ONLY', warning: 'No point on any curve is a qualified or proposed operating point. The only acceptance rule ever applied is the frozen bound <= 0.2.',
    frozenRule: { explorationInSample: capture(ER, (x) => x.inSample), explorationOutOfBag: capture(EO, (x) => x.outOfBag), historicalValidation: capture(VR, vView), explorationOutOfFoldReference: { classes: 1000, accepted: oof.decided, forcedChoiceFailing: oofFull.failingClasses, failingAccepted: oof.failingClasses, failingWithheld: oofFull.failingClasses - oof.failingClasses, failureCapture: r4((oofFull.failingClasses - oof.failingClasses) / oofFull.failingClasses), forcedFailureRateAtFullCoverage: r6(oofFull.failingClasses / 1000) } },
    curves: { explorationInSample: isCurve, explorationOutOfBag: oobCurve, explorationOutOfFoldGrid: OOF.thresholdGrid, historicalValidation: valCurve },
    scoreDistributions: { explorationInSample: dists(ER, (x) => x.inSample), explorationOutOfBag: dists(EO, (x) => x.outOfBag) }, marginToCriterion: { explorationOutOfBagAccepted: quant(EO.filter((x) => x.outOfBag.accepted).map((x) => tau - x.outOfBag.upper)), explorationInSampleAccepted: quant(ER.filter((x) => x.inSample.accepted).map((x) => tau - x.inSample.upper)) },
    byTopActionType: { explorationOutOfBag: tab(EO, (x) => x.outOfBag.type, (x) => x.outOfBag), explorationInSample: tab(ER, (x) => x.inSample.type, (x) => x.inSample), historicalValidation: tab(VR, (x) => x.sk1.type, vView) },
    originFamilies: { explorationOutOfBag: famSummary(EO, (x) => x.outOfBag), explorationInSample: famSummary(ER, (x) => x.inSample), historicalValidation: famSummary(VR, vView) },
    horizon: { bandsPresent: horizons, H0_H2_variation: horizons.length === 1 ? 'NOT_ESTIMABLE: every exploration and validation class is ' + horizons[0] + ' by construction of the SK1 schedule' : 'see data' },
    distributionShift: { familiesExploration: expFam.size, familiesValidation: valFam.size, familiesShared: [...expFam].filter((f) => valFam.has(f)).length, acceptanceRate: { explorationInSample: IS.SELECTIVE_COVERAGE.value, explorationOutOfFold: oof.coverage, explorationOutOfBag: OOB.SELECTIVE_COVERAGE.value, historicalValidation: HV.SELECTIVE_COVERAGE.value },
      forcedFailureRateAtFullCoverage: { explorationInSample: r6(count(ER, (x) => x.inSample.union) / ER.length), explorationOutOfFold: r6(oofFull.failingClasses / 1000), explorationOutOfBag: r6(count(EO, (x) => x.outOfBag.union) / EO.length), historicalValidation: r6(39 / 600) },
      topActionBoundQuantiles: { explorationInSample: quant(ER.map((x) => x.inSample.upper)), explorationOutOfBag: quant(EO.map((x) => x.outOfBag.upper)), historicalValidation: quant(VR.map((x) => x.sk1.risk.upperBound)) },
      kolmogorovSmirnovOfBound: { inSampleVsValidation: ks(ER.map((x) => x.inSample.upper), VR.map((x) => x.sk1.risk.upperBound)), outOfBagVsValidation: ks(EO.map((x) => x.outOfBag.upper), VR.map((x) => x.sk1.risk.upperBound)) },
      menuSize: { exploration: quant(ER.map((x) => x.menuSize)), validation: quant(VR.map((x) => x.menuSize)) }, validationClassesOutsideNumericEnvelope: count(VR, (x) => x.sk1.ood > 0), novelCategoriesUnseenInDevelopment: arm.model.novelCategoriesUnseen,
      note: 'Validation families are disjoint from exploration families by design, so validation is family-out-of-distribution. Shift indicators are score-level; no per-feature shift test was run.' } };

  // ================= Gate 4: action discrimination
  const vFail = VR.filter((x) => x.failure !== null), vMech = vFail.map((x) => { const top = x.sk1.forcedSet[0], rows = x.actions, t = rows.find((a) => vcol(a, 'index') === top), safe = rows.filter((a) => vcol(a, 'selectable') === 1 && vcol(a, 'inForcedSet') === 0 && vcol(a, 'introS0') === 0 && vcol(a, 'introNexus') === 0);
    return { alias: x.alias, accepted: x.failure.accepted, mechanism: !safe.length ? 'NO_SAFE_ALTERNATIVE' : safe.some((a) => vcol(a, 'upper') < vcol(t, 'upper')) ? 'RANKING_CONTRACT_ERROR' : 'WITHIN_MENU_RISK_ORDERING_ERROR', sameTypeSafe: safe.some((a) => vcol(a, 'type') === vcol(t, 'type')), bagsBest: x.sk1.stability.bagsWhereBestSafeAlternativeHasLowerRisk, recorded: x.failure.rankingStage }; });
  const vOrd = vMech.filter((m) => m.mechanism === 'WITHIN_MENU_RISK_ORDERING_ERROR'), vRank = vMech.filter((m) => m.mechanism === 'RANKING_CONTRACT_ERROR');
  need('recordedAttribution34and5', vOrd.length === 34 && vRank.length === 5 && vRank.every((m) => m.recorded === 'SAME_TIER_SAFE_ALTERNATIVE_HAD_LOWER_BOUND_REGRET_ORDER_CHOSE_UNSAFE') && vOrd.every((m) => m.recorded !== 'SAME_TIER_SAFE_ALTERNATIVE_HAD_LOWER_BOUND_REGRET_ORDER_CHOSE_UNSAFE'));
  const hist = (a) => { const o = {}; for (const x of a) o[String(x)] = (o[String(x)] ?? 0) + 1; return Object.fromEntries(Object.entries(o).sort((x, y) => Number(x[0]) - Number(y[0]))); };
  const mechOf = (rows, view) => { const f = rows.filter((x) => view(x).failure).map((x) => view(x)); const ord = f.filter((v) => v.failure.mechanism === 'WITHIN_MENU_RISK_ORDERING_ERROR');
    const featFreq = {}; for (const v of f) for (const nm of v.failure.differingFeatures ?? []) featFreq[nm] = (featFreq[nm] ?? 0) + 1;
    const g = (name, pred) => count(f, (v) => v.failure.gradientContrast && pred(v.failure.gradientContrast[name]));
    return { forcedChoiceFailing: f.length, WITHIN_MENU_RISK_ORDERING_ERROR: ord.length, RANKING_CONTRACT_ERROR: count(f, (v) => v.failure.mechanism === 'RANKING_CONTRACT_ERROR'), NO_SAFE_ALTERNATIVE: count(f, (v) => v.failure.mechanism === 'NO_SAFE_ALTERNATIVE'), orderingShare: r4(ord.length / f.length),
      amongAccepted: { failing: count(f, (v) => v.accepted), orderingError: count(f, (v) => v.accepted && v.failure.mechanism === 'WITHIN_MENU_RISK_ORDERING_ERROR'), rankingContractError: count(f, (v) => v.accepted && v.failure.mechanism === 'RANKING_CONTRACT_ERROR') },
      orderingErrors: { unanimousAcrossBagsUsed: count(ord, (v) => v.failure.bagsWhereBestSafeAlternativeHasLowerRisk === 0), shareOfBagsPreferringTheSafeAlternative: quant(ord.map((v) => v.failure.bagsWhereBestSafeAlternativeHasLowerRisk / v.failure.bagsUsed)), boundGapInSpreads: quant(ord.map((v) => v.failure.boundGapInSpreads)) },
      safeAlternativeOfTheSameActionType: count(f, (v) => v.failure.sameTypeSafeAlternative), bestSafeAlternativeHasIdenticalFeatureVector: count(f, (v) => v.failure.identicalFeatureVector === true), chosenByType: hist(f.map((v) => v.type)).constructor === Object ? Object.fromEntries(Object.entries(f.reduce((o, v) => { o[v.type] = (o[v.type] ?? 0) + 1; return o; }, {})).sort()) : null,
      differingFeatureCount: quant(f.map((v) => v.failure.differingFeatures?.length ?? null)), mostFrequentDifferingFeatures: Object.entries(featFreq).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 15).map(([feature, classes]) => ({ feature, classes })),
      directionOfTheUnsafeChoiceRelativeToTheBestSafeAlternative: { chosenMovesAwayFromHostileWhileSafeMovesToward: g('gradient.hostile', (p) => p[0] > 0 && p[1] < 0), chosenMovesTowardHostileWhileSafeMovesAway: g('gradient.hostile', (p) => p[0] < 0 && p[1] > 0), sameHostileGradient: g('gradient.hostile', (p) => p[0] === p[1]),
        chosenMovesAwayFromObjectiveWhileSafeMovesToward: g('gradient.objective', (p) => p[0] > 0 && p[1] < 0), chosenMovesTowardObjectiveWhileSafeMovesAway: g('gradient.objective', (p) => p[0] < 0 && p[1] > 0), sameObjectiveGradient: g('gradient.objective', (p) => p[0] === p[1]) } }; };
  const within = (rows, est, lab) => { const per = rows.map((x) => { const xs = x.actions.filter((a) => est(a) !== null).map((a) => [est(a), lab(a)]); return { auc: auroc(xs), lowestUnsafe: xs.length ? [...xs].sort((a, b) => a[0] - b[0])[0][1] : null, anySafe: xs.some((p) => !p[1]) }; }), both = per.filter((m) => m.auc !== null);
    return { menus: per.length, menusWithBothLabels: both.length, meanWithinMenuAuroc: r4(mean(both.map((m) => m.auc))), menusWhereTheLowestEstimateActionIsUnsafe: count(per, (m) => m.lowestUnsafe === 1), menusWithASafeAction: count(per, (m) => m.anySafe) }; };
  const catLab = (a) => (col(a, 'cat') !== 'NONE' ? 1 : 0), introLab = (a) => Number(col(a, 'introS0') === 1 || col(a, 'introNexus') === 1), vCat = (a) => (vcol(a, 'cat') !== 'NONE' ? 1 : 0), vIntro = (a) => Number(vcol(a, 'introS0') === 1 || vcol(a, 'introNexus') === 1);
  const withinMenu = { note: 'Does the estimate order the actions of ONE menu? Label "catastrophe" is what the model was fit on; label "introduction" is the gated event.',
    catastropheLabel: { explorationInSample: within(ER, (a) => col(a, 'inSampleEstimate'), catLab), explorationOutOfBag: within(EO, (a) => col(a, 'oobEstimate'), catLab), historicalValidation: within(VR, (a) => vcol(a, 'estimate'), vCat) },
    introductionLabel: { explorationInSample: within(ER, (a) => col(a, 'inSampleEstimate'), introLab), explorationOutOfBag: within(EO, (a) => col(a, 'oobEstimate'), introLab), historicalValidation: within(VR, (a) => vcol(a, 'estimate'), vIntro) } };
  // subgroup reliability of the out-of-bag estimate for displacement actions, by direction relative to the nearest hostile
  const disp = EO.flatMap((x) => x.actions.filter((a) => (col(a, 'type') === 'MOVE' || col(a, 'type') === 'RETREAT') && col(a, 'selectable') === 1).map((a) => ({ g: Math.sign(col(a, 'gradientHostile')), est: col(a, 'oobEstimate'), up: col(a, 'oobUpper'), cat: catLab(a), intro: introLab(a) })));
  const sub = (set) => ({ actions: set.length, meanEstimate: r4(mean(set.map((a) => a.est))), observedCatastropheRate: r4(mean(set.map((a) => a.cat))), observedIntroductionRate: r4(mean(set.map((a) => a.intro))) });
  const byDir = (set) => ({ movesTowardNearestHostile: sub(set.filter((a) => a.g < 0)), noChange: sub(set.filter((a) => a.g === 0)), movesAwayFromNearestHostile: sub(set.filter((a) => a.g > 0)) });
  const coll = ER.reduce((o, x) => { for (const k of Object.keys(x.collisions)) o[k] = (o[k] ?? 0) + x.collisions[k]; return o; }, {});
  const discrimination = {
    definitions: { WITHIN_MENU_RISK_ORDERING_ERROR: 'a failing forced choice where no safe alternative has a lower risk bound than the chosen action: the risk order of the menu is itself wrong', RANKING_CONTRACT_ERROR: 'a failing forced choice where some safe alternative has a lower bound (necessarily in the same tier) and lost on the expected-regret order', RISK_ESTIMATION_ERROR: 'systematic miscalibration of the catastrophe estimate across menus', ABSTENTION_DECISION_ERROR: 'accepting a class whose forced choice fails (false accept), or withholding a forced choice with no observed introduction (false abstain)', safeAlternative: 'a selectable action outside the chosen set that introduces against neither comparator in any sampled member world' },
    historicalValidation: { failing: vFail.length, WITHIN_MENU_RISK_ORDERING_ERROR: vOrd.length, RANKING_CONTRACT_ERROR: vRank.length, recordedAttributionVerified: vOrd.length === 34 && vRank.length === 5, acceptedFailures: vMech.filter((m) => m.accepted).map((m) => ({ alias: m.alias, mechanism: m.mechanism, bagsOf10PreferringTheBestSafeAlternative: m.bagsBest, sameTypeSafeAlternativeExists: m.sameTypeSafe })),
      orderingErrorsBagsOf10PreferringTheBestSafeAlternative: hist(vOrd.map((m) => m.bagsBest)), orderingErrorsUnanimous: count(vOrd, (m) => m.bagsBest === 0), orderingErrorsWithAtMost2Of10: count(vOrd, (m) => m.bagsBest <= 2), safeAlternativeOfTheSameActionType: count(vMech, (m) => m.sameTypeSafe),
      abstentionDecisionErrors: { falseAccepts: count(vFail, (x) => x.failure.accepted), falseAbstains: count(VR, (x) => x.sk1.abstained && x.failure === null) }, featureContrastOfTheTwoAcceptedFailures: E.validationAcceptedFailureContrasts },
    exploration: { outOfBag: mechOf(EO, (x) => x.outOfBag), inSample: mechOf(ER, (x) => x.inSample), abstentionDecisionErrorsOutOfBag: { falseAccepts: count(EO, (x) => x.outOfBag.accepted && x.outOfBag.union), falseAbstains: count(EO, (x) => !x.outOfBag.accepted && !x.outOfBag.union) } },
    withinMenu, riskEstimationError: { status: 'NOT_SUPPORTED_AS_SYSTEMATIC_MISCALIBRATION', evidence: 'frozen run: expected calibration error 0.026 on 5,304 validation action estimates; conservative for selected actions (SK1.1). That calibration is on catastrophe, not on introduction.' },
    displacementActionsByDirection_outOfBag: { note: 'MOVE and RETREAT actions on exploration, out-of-bag estimate against observed labels. A subgroup whose observed rate exceeds its mean estimate is under-estimated.', all: byDir(disp), boundAtMostTau: byDir(disp.filter((a) => a.up <= tau)) },
    featureCollisions: { note: 'actions of one menu with IDENTICAL 144-feature rows. The featurisation cannot separate them, whatever is learned from it.', withinMenuGroups: coll.groupsOfIdenticalRows, withMixedCatastropheLabel: coll.mixedCatastropheLabel, withMixedIntroductionLabel: coll.mixedIntroductionLabel, inTheSameSymmetryOrbit: coll.sameSymmetryOrbit, menusAffectedByAMixedIntroductionCollision: count(ER, (x) => x.collisions.mixedIntroductionLabel > 0), crossClass: E.crossClassFeatureCollisions },
    safeActionExists: { explorationClassesWithASafeAction: count(ER, (x) => x.safeActions > 0), explorationClasses: ER.length, validationClassesWithASafeAction: count(VR, (x) => x.alternatives.safeCount > 0), validationClasses: VR.length },
    PUBLIC_SAFE_ACTION_IDENTIFIABILITY: { verdict: 'NOT_ESTABLISHED', for: ['a safe action exists in every exploration and every validation class', 'the frozen estimate orders actions within a menu well above chance on classes it never saw', 'in almost every failing class the chosen action and the best safe alternative differ in public features'], against: ['existence of a safe action is evaluator knowledge, not public knowledge', 'ordering errors are unanimous or near-unanimous across bags, so more resampling of the same learner on the same features would not correct them', 'a small number of menus contain actions the featurisation cannot tell apart yet have different outcomes'],
      whatWouldSettleIt: 'a prospective test of a learner built for within-menu discrimination, on fresh family-disjoint classes; nothing in existing evidence can' } };

  // ================= verdicts
  const best = requiredN(r, 0.05, 0.002, 0.8), point = OOF.endpoints.C_UNION_INTRODUCTION.pointEstimateAtMostTarget && OOF.SELECTIVE_COVERAGE.meetsMinimumCoveragePoint && HV.endpoints.C_UNION_INTRODUCTION.pointEstimateAtMostTarget && HV.SELECTIVE_COVERAGE.meetsMinimumCoveragePoint;
  const boundNow = [IS, OOB, HV].some((b) => b.endpoints.C_UNION_INTRODUCTION.supportsOnePercentUpperBound && b.SELECTIVE_COVERAGE.meetsMinimumCoveragePoint) || (OOF.endpoints.C_UNION_INTRODUCTION.supportsOnePercentUpperBound && OOF.SELECTIVE_COVERAGE.meetsMinimumCoveragePoint);
  const PRACTICAL_CEILING = 3000, statBound = boundNow || valNeeded <= PRACTICAL_CEILING, orderingPrincipal = vOrd.length / vFail.length > 0.5 && discrimination.exploration.outOfBag.orderingShare > 0.5;
  const p700 = passProbability(700, r, 0.05, 0.007), p1400 = passProbability(1400, r, 0.05, 0.007);
  const verdicts = { POINT_ESTIMATE_FEASIBLE: point, pointEstimateBasis: 'out-of-fold development and historical validation both show a point rate below 1% at coverage above 40% for the frozen rule; the pessimistic out-of-bag diagnostic does not',
    STATISTICAL_BOUND_FEASIBLE: statBound, practicalityRule: { rule: 'feasible only if an existing reading already supports the bound at the coverage target, or the eligible validation classes needed for 80% power at the planning rate do not exceed the practical ceiling', practicalCeilingEligibleValidationClasses: PRACTICAL_CEILING, ceilingBasis: 'five times the SK1 validation population, more than SK1 admitted in total (2,298); a disclosed planning assumption', conclusionHoldsForAnyCeilingBelow: valNeeded }, statisticalBoundBasis: { anyExistingReadingSupportsTheBoundAtTheCoverageTarget: boundNow, planningRateForTheFrozenRule: 0.007, passProbabilityWith700AcceptedDecisions: r4(p700), passProbabilityWith1400AcceptedDecisions: r4(p1400), acceptedDecisionsNeededFor80PercentPower: n80at07, eligibleValidationClassesNeeded: valNeeded, multipleOfSk1Validation: r4(valNeeded / 600), trueRateNeededFor80PercentPowerAt700AcceptedDecisions: powerAt(0.05).find((x) => x.acceptedDecisions === 700).largestTrueRateWith80PercentPower, acceptedDecisionsNeededIfTheTrueRateWere0_2Percent: best },
    PROSPECTIVE_QUALIFICATION_NOT_ESTABLISHED: true,
    classification: statBound ? 'A_SELECTIVE_ASSURANCE_FEASIBLE_FOR_PROSPECTIVE_TEST' : 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED', classificationScope: 'for the frozen SK1 policy, against the research targets 1% / 95% / 40%, at practical DEV sample sizes',
    nextScientificPriority: statBound ? 'SELECTIVE_ASSURANCE_PROSPECTIVE_EVALUATION' : orderingPrincipal ? 'WITHIN_MENU_ACTION_RISK_DISCRIMINATION' : 'REPRODUCIBILITY_AND_CUSTODY_RECOVERY',
    priorityRule: 'discrimination is recommended when the bound is not practically feasible and within-menu ordering errors are the majority of failing forced choices on both historical validation and out-of-bag exploration', orderingShare: { historicalValidation: r4(vOrd.length / vFail.length), explorationOutOfBag: discrimination.exploration.outOfBag.orderingShare }, targetsWeakened: false };

  const src = { explorationMatrixSha256: sha(expText), validationMatrixSha256: sha(valText), trainingRecordSha256: E.source.trainingRecordSha256, modelHash: E.source.modelHash, analyzerSha256: sha(readFileSync(fileURLToPath(import.meta.url))) };
  return { issues, out: { schema: 'SK2F_FEASIBILITY_V1', authority: 'R0', stage: 'STAGE3H-SK2-F', labels: ['READ_ONLY_DIAGNOSTIC', 'EXISTING_EVIDENCE_ONLY', 'NO_TRAINING', 'NO_NEW_POPULATION', 'POST_HOC_EXPLORATORY_ONLY', 'NOT_A_QUALIFICATION'], source: src, reconciliation: { exact: issues.length === 0, issues },
    target: TARGET, definitions: { A_INTRODUCTION_VS_S0: 'an accepted recommendation introduces a catastrophe relative to frozen S0', B_INTRODUCTION_VS_NEXUS: 'an accepted recommendation introduces a catastrophe relative to frozen effective Nexus-else-S0', C_UNION_INTRODUCTION: 'an accepted class triggers A or B or both; counted once (primary endpoint)',
      SELECTIVE_COVERAGE: 'accepted classes / all eligible classes', SELECTIVE_FAILURE_RATE: 'unique accepted introduction classes / accepted classes', FULL_POPULATION_INTRODUCTION_RATE: 'unique accepted introduction classes / all eligible classes', notTheSameAs: 'the risk model\'s catastrophe label (catastrophic in at least one member world). An introduction additionally requires the comparator not to be catastrophic in that member world.', abstention: 'no recommendation; never a safe native-world outcome; what happens next is outside the kernel' },
    baselinePreserved: { validationClasses: 600, acceptedClasses: 304, abstainedClasses: 296, uniqueAcceptedIntroductionClasses: 2, comparatorRelativeAcceptedIntroductions: 3, forcedChoiceFailureClasses: 39, abstainedForcedFailureClasses: 37, sk1ModelHash: E.source.modelHash },
    endpoints: { explorationOutOfFoldReference: OOF, explorationInSample: IS, explorationOutOfBag: OOB, historicalValidation: HV, pooledDescriptive: pooled }, sampleSize, selectionBias, riskCoverage, discrimination, verdicts } };
}
const text = (o) => JSON.stringify(o, null, 1) + '\n';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', res = analyse(), t = text(res.out);
  console.log(J({ mode, reconciliation: res.out.reconciliation, verdicts: res.out.verdicts, sha256: sha(t) }, null, 1));
  if (res.issues.length) { console.log('SK2F_FEASIBILITY_RECONCILIATION_FAILED'); process.exitCode = 1; }
  else if (mode === '--write') { const fd = openSync(OUT_FILE, 'wx'); writeSync(fd, t); closeSync(fd); console.log('written evidence/SK2F_FEASIBILITY.json'); }
  else if (mode === 'check') { const same = readFileSync(OUT_FILE, 'utf8') === t; console.log(same ? 'SK2F_FEASIBILITY_CHECK_PASS' : 'SK2F_FEASIBILITY_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode === 'print') { const path = (process.argv[3] ?? '').split('.').filter(Boolean); let v = res.out; for (const k of path) v = v?.[k]; console.log(JSON.stringify(v, null, 1)); }
  else if (mode !== 'dry') throw Error('USAGE: node diagnostics/feasibility.mjs [--write | check | print <dotted.path>]');
}
