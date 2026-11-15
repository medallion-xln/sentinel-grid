// SK1 evaluation core (evaluation side). A pure function of (class records, frozen policies, merged audit): it writes
// nothing and chooses nothing. Metrics use the FROZEN H-W1 evaluator definitions unchanged:
//   catastrophe = member regret >= 100; introduction = potentialIntroduction(decision set, comparator set, truth);
//   nreg = regret / menu utility spread, class value = equal-weight member mean; intervals = origin-family cluster bootstrap.
// Policies compared on identical public observations, menus and populations:
//   S0, NEXUS (frozen comparators; the class record's B and N sets), C10 (frozen H-W4 V1 C10), SK1 (the Safety Kernel),
//   SK1_NO_EVIDENCE (ablation, diagnostic only).
// SK1 is reported two ways: AS SPECIFIED (abstentions are not decisions) and FORCED CHOICE (its top-ranked set on every
// class). The primary gates and classification A use AS SPECIFIED. An abstention is never counted as a success.
import { evalClass, aggregate, zeroEventUpper, RESAMPLES, BOOTSTRAP_SEED, REGRET_THRESHOLD } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { prng } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { forgeRequest } from '../adapters/forge/features.mjs';
import { labelsOf } from './dataset.mjs';
import { TESTS } from './audit-class.mjs';
import { sha } from './common.mjs';

export const RULES = Object.freeze({ introductionsVsS0: 0, introductionsVsNexus: 0, illegalActions: 0, identityViolations: 0, minMeanNregImprovement: -REGRET_THRESHOLD, regretUpper95Below: 0, resamples: RESAMPLES, bootstrapSeed: BOOTSTRAP_SEED,
  decisionMedianMsMax: 100, decisionMaxMsMax: 1000, completeCoverage: true, catastropheRegret: 100 });
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; }, J = JSON.stringify;

/** Origin-family cluster bootstrap of a class-paired statistic; same generator, seed and resample count as the frozen evaluator; two-sided 95% as well. */
export function bootCI(values, clusters) {
  const by = new Map(); values.forEach((v, i) => { const e = by.get(clusters[i]) ?? by.set(clusters[i], { s: 0, n: 0 }).get(clusters[i]); e.s += v; e.n++; });
  const cl = [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([, e]) => e), rnd = prng(BOOTSTRAP_SEED), out = new Float64Array(RESAMPLES);
  for (let r = 0; r < RESAMPLES; r++) { let s = 0, n = 0; for (let k = 0; k < cl.length; k++) { const e = cl[Math.floor(rnd() * cl.length)]; s += e.s; n += e.n; } out[r] = s / n; }
  out.sort(); const at = (p) => out[Math.min(RESAMPLES - 1, Math.floor(p * RESAMPLES))];
  return { point: values.reduce((a, b) => a + b, 0) / values.length, lower025: at(0.025), upper975: at(0.975), upper95: at(0.95), clusters: cl.length };
}

function sk1Decide(kernel, cls) {
  const r = forgeRequest(cls.projection, cls.evidence), t0 = performance.now(), rec = kernel.recommend(r.state, r.legalActions, r.advisoryEvidence), ms = performance.now() - t0, d = rec.recommendedActionOrAbstention, n = r.legalActions.length;
  const claimed = (d.kind === 'RECOMMEND' ? d.decisionSet : d.bestEffortNotRecommended?.decisionSet ?? []).map((a) => a?.index);
  const bad = !Array.isArray(rec.rankedActions) || rec.rankedActions.length !== n || new Set(rec.rankedActions.map((a) => a.index)).size !== n || claimed.some((i) => !Number.isInteger(i) || i < 0 || i >= n) || new Set(claimed).size !== claimed.length || (d.kind === 'RECOMMEND' && !claimed.length) || !['RECOMMEND', 'ABSTAIN'].includes(d.kind) || rec.authority?.canDispatch !== false;
  // a malformed decision is never repaired or scored: it is recorded as illegal with no decision set
  if (bad) return { kind: 'ILLEGAL', set: [], forced: [], reason: 'MALFORMED_DECISION_OUTPUT', hash: rec.decisionHash ?? null, ms, illegal: true, type: null, upper: null, ood: 0, unsupported: 0, evidenceStatus: rec.evidence?.status ?? null, distinctInSet: 0, risks: [] };
  const forced = claimed, set = d.kind === 'RECOMMEND' ? forced : [];
  const top = forced.length ? rec.rankedActions.find((a) => a.index === forced[0]) : null;
  return { kind: d.kind, set, forced, reason: d.reason, hash: rec.decisionHash, ms, illegal: bad, type: top?.type ?? null, upper: top?.risk?.upperBound ?? null, ood: top?.outOfDistribution.numericFeaturesOutsideEnvelope ?? 0,
    unsupported: rec.uncertainty.unsupportedActions, evidenceStatus: rec.evidence.status, distinctInSet: new Set(forced.map((i) => rec.rankedActions.find((a) => a.index === i).key)).size,
    risks: rec.rankedActions.map((a) => [a.index, a.risk ? a.risk.estimate : null]) };
}
const c10Decide = (policy, cls) => { try { const d = policy.decideProjection(cls.projection); return { set: d.orbit, ms: d.ms, illegal: false, type: cls.projection.menu[d.index].type }; } catch (e) { if (e.message === 'POLICY_ILLEGAL_ACTION') return { set: [], ms: 0, illegal: true, type: null }; throw e; } };
const outcome = (cls, set) => (set.length ? evalClass(cls, set) : { illegal: true });
const typeOfSet = (cls, set) => [...new Set(set.map((i) => cls.projection.menu[i].type))].sort().join('+');

function failureBreakdown(classes, res, typeOf) {
  const out = { vsS0: {}, vsNexus: {}, comparatorVsS0: {}, comparatorVsNexus: {}, baseVsS0: 0, twinOnlyVsS0: 0, baseVsNexus: 0, twinOnlyVsNexus: 0, both: 0, s0Only: 0, nexusOnly: 0 }, add = (o, k) => { o[k] = (o[k] ?? 0) + 1; };
  res.forEach((r, i) => { if (!r || r.illegal) return; const t = typeOf(i);
    if (r.introB) { add(out.vsS0, t); add(out.comparatorVsS0, typeOfSet(classes[i], classes[i].B)); r.introBBase ? out.baseVsS0++ : out.twinOnlyVsS0++; }
    if (r.introN) { add(out.vsNexus, t); add(out.comparatorVsNexus, typeOfSet(classes[i], classes[i].N)); r.introNBase ? out.baseVsNexus++ : out.twinOnlyVsNexus++; }
    if (r.introB && r.introN) out.both++; else if (r.introB) out.s0Only++; else if (r.introN) out.nexusOnly++; });
  return out;
}
const auroc = (pairs) => { const pos = pairs.filter((x) => x[1]).length, neg = pairs.length - pos; if (!pos || !neg) return null; let rs = 0; [...pairs].sort((a, b) => a[0] - b[0]).forEach((x, i) => { if (x[1]) rs += i + 1; }); return (rs - (pos * (pos + 1)) / 2) / (pos * neg); };
const summary = (a) => ({ classes: a.classes, illegal: a.illegal, introVsS0: a.introVsS0, introVsNexus: a.introVsNexus, introVsS0BaseOnly: a.introVsS0BaseOnly, introVsNexusBaseOnly: a.introVsNexusBaseOnly, familiesWithIntroVsS0: a.familiesWithIntroVsS0, familiesWithIntroVsNexus: a.familiesWithIntroVsNexus,
  catastrophicClasses: a.catClasses, catastrophicOnBase: a.catBaseOnly, meanNreg: a.meanNreg, worstClassNreg: a.worstClassNreg, regretDeltaVsS0: a.deltaVsS0, regretDeltaVsNexus: a.deltaVsNexus, equalsS0: a.equalsS0, equalsNexus: a.equalsNexus });

/** audit: merged identity audit of SK1 (or null in tests). c10: a frozen hw4 policy object. */
export function evaluate({ classes, kernel, kernelNoEvidence, c10, audit }) {
  const n = classes.length, fam = classes.map((c) => c.family);
  const d1 = classes.map((c) => sk1Decide(kernel, c)), d2 = classes.map((c) => sk1Decide(kernel, c)), abl = classes.map((c) => sk1Decide(kernelNoEvidence, c)), cx = classes.map((c) => c10Decide(c10, c));
  const digest = (d) => sha(J(d.map((x) => [x.kind, x.set, x.forced, x.hash]))), deterministic = digest(d1) === digest(d2);
  const R = { S0: classes.map((c) => outcome(c, c.B)), NEXUS: classes.map((c) => outcome(c, c.N)), C10: classes.map((c, i) => outcome(c, cx[i].set)), SK1_FORCED: classes.map((c, i) => outcome(c, d1[i].forced)), SK1_NO_EVIDENCE_FORCED: classes.map((c, i) => outcome(c, abl[i].forced)) };
  const A = Object.fromEntries(Object.entries(R).map(([k, r]) => [k, aggregate(r, fam)]));
  // SK1 as specified: decided classes only
  const decided = d1.map((d, i) => (d.kind === 'RECOMMEND' ? i : -1)).filter((i) => i >= 0), abstained = n - decided.length;
  const decRes = decided.map((i) => R.SK1_FORCED[i]), aDec = decided.length ? aggregate(decRes, decided.map((i) => fam[i])) : null;
  const reasons = {}; for (const d of d1) if (d.kind === 'ABSTAIN') reasons[d.reason] = (reasons[d.reason] ?? 0) + 1;
  const illegalSk1 = d1.filter((d) => d.illegal).length, ms = d1.map((d) => d.ms), compute = { decisions: ms.length, medianMs: q(ms, 0.5), p95Ms: q(ms, 0.95), maxMs: Math.max(...ms), c10MedianMs: q(cx.map((x) => x.ms), 0.5), c10MaxMs: Math.max(...cx.map((x) => x.ms)) };
  // paired contrasts, class by class, clustered by origin family
  const ind = (r, k) => Number(!r.illegal && Boolean(r[k])), pair = (a, b, k) => bootCI(R[a].map((r, i) => ind(r, k) - ind(R[b][i], k)), fam);
  const pairNreg = (a, b) => { const ok = R[a].map((r, i) => (!r.illegal && !R[b][i].illegal ? i : -1)).filter((i) => i >= 0); return { ...bootCI(ok.map((i) => R[a][i].nreg - R[b][i].nreg), ok.map((i) => fam[i])), classesCompared: ok.length }; };
  const paired = { SK1_FORCED_minus_C10: { introVsS0: pair('SK1_FORCED', 'C10', 'introB'), introVsNexus: pair('SK1_FORCED', 'C10', 'introN'), catastrophicClass: pair('SK1_FORCED', 'C10', 'catAny'), nreg: pairNreg('SK1_FORCED', 'C10') },
    SK1_FORCED_minus_NO_EVIDENCE: { introVsS0: pair('SK1_FORCED', 'SK1_NO_EVIDENCE_FORCED', 'introB'), introVsNexus: pair('SK1_FORCED', 'SK1_NO_EVIDENCE_FORCED', 'introN'), nreg: pairNreg('SK1_FORCED', 'SK1_NO_EVIDENCE_FORCED'),
      decisionDifferences: d1.filter((d, i) => J(d.forced) !== J(abl[i].forced)).length } };
  // risk calibration on every (class, action) with a supported estimate
  const cal = []; classes.forEach((c, i) => { const L = labelsOf(c); for (const [a, p] of d1[i].risks) if (p !== null) cal.push([p, L.catAny[a]]); });
  const bins = Array.from({ length: 10 }, (_, b) => { const lo = b / 10, hi = b === 9 ? 1.0000001 : (b + 1) / 10, in_ = cal.filter((x) => x[0] >= lo && x[0] < hi); return { lo, hi: Math.min(1, hi), n: in_.length, meanPredicted: in_.length ? in_.reduce((s, x) => s + x[0], 0) / in_.length : null, observedRate: in_.length ? in_.filter((x) => x[1]).length / in_.length : null }; });
  const calibration = { actions: cal.length, auroc: auroc(cal), brier: cal.reduce((s, x) => s + (x[0] - x[1]) ** 2, 0) / cal.length, baseRate: cal.filter((x) => x[1]).length / cal.length, bins, expectedCalibrationError: bins.reduce((s, b) => s + (b.n ? (b.n / cal.length) * Math.abs(b.meanPredicted - b.observedRate) : 0), 0) };
  // uncertainty quality: does the bound of the top-ranked action identify the classes where the forced choice introduces?
  const fail = R.SK1_FORCED.map((r) => Number(Boolean(r.introB || r.introN))), ub = d1.map((d) => d.upper ?? 1), order = [...Array(n).keys()].sort((a, b) => ub[a] - ub[b]);
  const uncertainty = { aurocBoundPredictsIntroduction: auroc(ub.map((u, i) => [u, fail[i]])), failingClassesForcedChoice: fail.reduce((a, b) => a + b, 0),
    selective: [0.1, 0.25, 0.5, 0.75, 1].map((c) => { const k = Math.max(1, Math.floor(c * n)), sub = order.slice(0, k); return { coverage: c, classes: k, failingClasses: sub.reduce((s, i) => s + fail[i], 0), maxBound: ub[sub[k - 1]] }; }),
    failingAmongAbstained: d1.reduce((s, d, i) => s + (d.kind === 'ABSTAIN' ? fail[i] : 0), 0), failingAmongDecided: d1.reduce((s, d, i) => s + (d.kind === 'RECOMMEND' ? fail[i] : 0), 0),
    setsWithIndistinguishableDistinctActions: d1.filter((d) => d.distinctInSet > 1).length };
  const oodIdx = d1.map((d, i) => (d.ood > 0 ? i : -1)).filter((i) => i >= 0);
  const ood = { classesWhereChosenActionIsOutsideNumericEnvelope: oodIdx.length, failingAmongThem: oodIdx.reduce((s, i) => s + fail[i], 0), failingAmongInEnvelope: fail.reduce((a, b) => a + b, 0) - oodIdx.reduce((s, i) => s + fail[i], 0),
    classesWithAnyUnsupportedAction: d1.filter((d) => d.unsupported > 0).length, evidenceNotValid: d1.filter((d) => d.evidenceStatus !== 'VALID').length };
  // ---- gates
  const idBad = audit ? TESTS.reduce((s, t) => s + (audit.identity.set[t]?.bad ?? 0) + (audit.identity.kind[t]?.bad ?? 0), 0) : null, idExercised = audit ? TESTS.every((t) => (audit.identity.set[t]?.n ?? 0) > 0) : null;
  const regretGate = (b) => b.point <= -RULES.minMeanNregImprovement && b.upper95 < RULES.regretUpper95Below;
  const gatesFor = (a, coverageOk, illegal) => a === null ? null : { ZERO_INTRODUCTIONS_VS_S0: a.introVsS0 === 0, ZERO_INTRODUCTIONS_VS_NEXUS: a.introVsNexus === 0, ZERO_ILLEGAL_ACTIONS: illegal === 0, REGRET_IMPROVEMENT_VS_S0: regretGate(a.deltaVsS0), REGRET_IMPROVEMENT_VS_NEXUS: regretGate(a.deltaVsNexus),
    IDENTITY_AND_GEOMETRIC_INVARIANCE: audit ? idBad === 0 && idExercised : null, DETERMINISTIC_REPLAY: deterministic && (audit ? audit.totals.repeatMismatch === 0 : true), COMPUTE_WITHIN_BUDGET: compute.medianMs <= RULES.decisionMedianMsMax && compute.maxMs <= RULES.decisionMaxMsMax, COMPLETE_DECISION_COVERAGE: coverageOk };
  const gatesAsSpecified = decided.length ? gatesFor(aDec, abstained === 0, illegalSk1) : { ZERO_INTRODUCTIONS_VS_S0: null, ZERO_INTRODUCTIONS_VS_NEXUS: null, ZERO_ILLEGAL_ACTIONS: illegalSk1 === 0, REGRET_IMPROVEMENT_VS_S0: null, REGRET_IMPROVEMENT_VS_NEXUS: null, IDENTITY_AND_GEOMETRIC_INVARIANCE: audit ? idBad === 0 && idExercised : null, DETERMINISTIC_REPLAY: deterministic, COMPUTE_WITHIN_BUDGET: compute.medianMs <= RULES.decisionMedianMsMax && compute.maxMs <= RULES.decisionMaxMsMax, COMPLETE_DECISION_COVERAGE: false };
  const noForcedChoice = d1.filter((d) => !d.forced.length).length, gatesForcedChoice = gatesFor(A.SK1_FORCED, noForcedChoice === 0, illegalSk1);
  const executionGates = audit ? { ALLOWLISTED_READS_ONLY: audit.totals.unallowedReads.length === 0 && audit.totals.maxReadPaths > 0, POISONED_VIEW_IDENTICAL: audit.totals.poisonMismatch === 0, NO_ILLEGAL_ACTIONS_IN_AUDIT: audit.totals.illegal === 0, FEATURES_INVARIANT_UNDER_D4: audit.totals.featureFrameMismatch === 0,
    EVERY_TEST_EXERCISED: idExercised, NEGATIVE_CONTROLS_DETECTED: Object.values(audit.controls).every((c) => c.detectedOn.every((d) => d.bad > 0)), AUDIT_COVERS_EVERY_CLASS: audit.totals.classes === n, CLASS_COUNT_MEETS_MINIMUM: n >= 300 } : null;
  const executionValid = executionGates ? Object.values(executionGates).every(Boolean) : null, qualified = executionValid === true && Object.values(gatesAsSpecified).every((v) => v === true);
  // supported material improvement (classification B), evaluated on the forced choice
  const pc = paired.SK1_FORCED_minus_C10, below = (b) => b.upper975 < 0, above = (b) => b.lower025 > 0;
  const improvement = { regretGatesPassVsBothComparators: gatesForcedChoice.REGRET_IMPROVEMENT_VS_S0 && gatesForcedChoice.REGRET_IMPROVEMENT_VS_NEXUS, supportedSafetyGainOverC10: (below(pc.introVsS0) && !above(pc.introVsNexus)) || (below(pc.introVsNexus) && !above(pc.introVsS0)),
    noIllegalAction: illegalSk1 === 0, identityHolds: audit ? idBad === 0 && idExercised : null };
  const material = improvement.regretGatesPassVsBothComparators && improvement.supportedSafetyGainOverC10 && improvement.noIllegalAction && improvement.identityHolds === true;
  const classification = executionValid === false ? 'D_EXPERIMENT_BLOCKED_OR_INVALID' : qualified ? 'A_SAFETY_KERNEL_DEV_QUALIFIED' : material ? 'B_SAFETY_KERNEL_MATERIAL_IMPROVEMENT_NOT_QUALIFIED' : 'C_SAFETY_KERNEL_NO_SUPPORTED_ADVANTAGE';
  return { classes: n, families: new Set(fam).size, memberWorlds: classes.reduce((s, c) => s + c.members.length, 0), rules: RULES, classification, safetyKernelDevQualified: qualified, executionValid, executionGates,
    policies: { S0: summary(A.S0), NEXUS: summary(A.NEXUS), C10: { ...summary(A.C10), illegalDecisions: cx.filter((x) => x.illegal).length }, SK1_AS_SPECIFIED: { decidedClasses: decided.length, abstentions: abstained, abstentionRate: abstained / n, decisionCoverage: decided.length / n, abstentionReasons: reasons, illegalDecisions: illegalSk1, ...(aDec ? summary(aDec) : {}) },
      SK1_FORCED_CHOICE: { note: 'top-ranked decision set on every class, including classes where the kernel abstained; a diagnostic reading, not the policy as specified', classesWithNoForcedChoice: noForcedChoice, ...summary(A.SK1_FORCED) }, SK1_NO_EVIDENCE_FORCED_CHOICE: { note: 'ablation model without advisory expert evidence; diagnostic only', ...summary(A.SK1_NO_EVIDENCE_FORCED) } },
    gatesAsSpecified, gatesForcedChoice, materialImprovement: { ...improvement, holds: material }, paired, calibration, uncertainty, outOfDistribution: ood, compute,
    failureBreakdown: { SK1_AS_SPECIFIED: failureBreakdown(classes, d1.map((d, i) => (d.kind === 'RECOMMEND' ? R.SK1_FORCED[i] : null)), (i) => d1[i].type), SK1_FORCED_CHOICE: failureBreakdown(classes, R.SK1_FORCED, (i) => d1[i].type), C10: failureBreakdown(classes, R.C10, (i) => cx[i].type) },
    reproducibility: { independentPasses: 2, decisionDigest: digest(d1), identical: deterministic }, zeroEventBounds: { classLevelUpper95: zeroEventUpper(n), familyLevelUpper95: zeroEventUpper(new Set(fam).size) },
    perClass: classes.map((c, i) => ({ id: c.id, family: c.family, sk1: { kind: d1[i].kind, forcedSet: d1[i].forced, type: d1[i].type, riskUpperBound: d1[i].upper, introS0: Boolean(R.SK1_FORCED[i].introB), introNexus: Boolean(R.SK1_FORCED[i].introN), decisionHash: d1[i].hash },
      c10: { set: cx[i].set, type: cx[i].type, introS0: Boolean(R.C10[i].introB), introNexus: Boolean(R.C10[i].introN) } })) };
}
