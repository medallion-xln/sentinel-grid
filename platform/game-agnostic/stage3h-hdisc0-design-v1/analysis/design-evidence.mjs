// STAGE 3H H-DISC-0 — failure-mechanism evidence and statistical planning (READ-ONLY DESIGN ANALYSIS, authority R0).
//   node analysis/design-evidence.mjs            recompute and print a summary
//   node analysis/design-evidence.mjs --write    create evidence/HDISC0_DESIGN_EVIDENCE.json (exclusive)
//   node analysis/design-evidence.mjs check      recompute and compare byte-for-byte; writes nothing
// Inputs are TRACKED evidence only: the SK1.1 validation matrix and the SK2-F exploration matrix and feasibility record.
// Node built-ins only; runs from a clean checkout. Nothing is trained, fitted, tuned or selected, and no world is read.
//
// What the two populations are allowed to do here
//   * SK1 VALIDATION (600 classes) is SPENT. It is used to verify recorded attribution and to describe the frozen
//     policy. No candidate, feature, parameter or threshold is chosen from it.
//   * SK1 EXPLORATION (1,000 classes) is development data. "Out of bag" is a diagnostic reading of the frozen ensemble.
//   * Planning values taken from either (baseline rates, failure co-occurrence, clustering) are PLANNING ASSUMPTIONS for
//     a future fresh campaign. They must be re-estimated on fresh exploration data before any freeze.
import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..');
const VAL_FILE = resolve(GA, 'stage3h-sk1-1-assurance-v1/evidence/SK1_1_DECISION_FAILURE_MATRIX.json'), EXP_FILE = resolve(GA, 'stage3h-sk2f-feasibility-v1/evidence/SK2F_EXPLORATION_MATRIX.json'), FEAS_FILE = resolve(GA, 'stage3h-sk2f-feasibility-v1/evidence/SK2F_FEASIBILITY.json');
export const OUT_FILE = resolve(LANE, 'evidence/HDISC0_DESIGN_EVIDENCE.json');
export const PLAN = Object.freeze({ explorationClasses: 1000, validationClasses: 600, holdoutClasses: 0, alpha: 0.05, power: 0.8, status: 'PLANNING_VALUES_NOT_AN_ALLOCATION' });
const sha = (b) => createHash('sha256').update(b).digest('hex'), J = JSON.stringify;
const r4 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e4) / 1e4), r6 = (x) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 1e6) / 1e6);
const sum = (a) => a.reduce((x, y) => x + y, 0), mean = (a) => (a.length ? sum(a) / a.length : null), count = (a, f) => a.filter(f).length;
const hist = (a) => Object.fromEntries(Object.entries(a.reduce((o, x) => { o[String(x)] = (o[String(x)] ?? 0) + 1; return o; }, {})).sort((x, y) => (isNaN(x[0]) || isNaN(y[0]) ? (x[0] < y[0] ? -1 : 1) : Number(x[0]) - Number(y[0]))));

// ---------------- exact binomial machinery
const logFact = (() => { const c = [0]; return (n) => { for (let i = c.length; i <= n; i++) c.push(c[i - 1] + Math.log(i)); return c[n]; }; })();
const binPmf = (k, n, p) => (p <= 0 ? (k === 0 ? 1 : 0) : p >= 1 ? (k === n ? 1 : 0) : Math.exp(logFact(n) - logFact(k) - logFact(n - k) + k * Math.log(p) + (n - k) * Math.log1p(-p)));
/** Smallest b for which the exact one-sided sign test rejects with D discordant pairs: P(B >= b | D, 1/2) <= alpha. */
export const criticalB = (D, alpha) => { let tail = 0; for (let b = D; b >= 0; b--) { tail += binPmf(b, D, 0.5); if (tail > alpha) return b + 1; } return 0; };
/** Exact power of the one-sided conditional (McNemar / sign) test with N paired classes.
 *  pb = P(reference fails, candidate does not), pc = P(candidate fails, reference does not). H1: pb > pc. */
export function pairedPower(N, pb, pc, alpha = PLAN.alpha) {
  const pd = pb + pc; if (pd <= 0) return 0; let power = 0;
  for (let D = 1; D <= N; D++) { const pD = binPmf(D, N, pd); if (pD < 1e-14) { if (D > N * pd) break; continue; } const crit = criticalB(D, alpha); if (crit > D) continue; let rej = 0; for (let b = crit; b <= D; b++) rej += binPmf(b, D, pb / pd); power += pD * rej; }
  return Math.min(1, power);
}
/** Discordance probabilities for a reference failure rate p0 and candidate rate p1 under a failure-association model. */
export function discordance(p0, p1, model, phi = 0) {
  const lo = Math.max(0, p0 + p1 - 1), hi = Math.min(p0, p1);
  const both = model === 'INDEPENDENT' ? p0 * p1 : model === 'NESTED' ? hi : Math.min(hi, Math.max(lo, p0 * p1 + phi * Math.sqrt(p0 * (1 - p0) * p1 * (1 - p1))));
  return { pb: p0 - both, pc: p1 - both, both };
}
export const smallestN = (p0, p1, model, phi, power = PLAN.power, cap = 6000) => { const { pb, pc } = discordance(p0, p1, model, phi); let last = 0; for (let n = 20; n <= cap; n += 1) { if (pairedPower(n, pb, pc) < power) last = n; else if (n - last > 60) return last + 1; } return null; };

function designEffect(values, clusters) {
  const g = new Map(); values.forEach((v, i) => (g.get(clusters[i]) ?? g.set(clusters[i], []).get(clusters[i])).push(v)); const gs = [...g.values()], N = values.length, K = gs.length, gm = mean(values);
  const ssb = sum(gs.map((v) => v.length * (mean(v) - gm) ** 2)), ssw = sum(gs.map((v) => sum(v.map((x) => (x - mean(v)) ** 2)))), msb = ssb / (K - 1), msw = ssw / (N - K), m0 = (N - sum(gs.map((v) => v.length ** 2)) / N) / (K - 1);
  const icc = msb + (m0 - 1) * msw > 0 ? Math.max(0, (msb - msw) / (msb + (m0 - 1) * msw)) : 0, mbar = N / K, cv2 = sum(gs.map((v) => (v.length - mbar) ** 2)) / K / mbar ** 2;
  return { clusters: K, meanClusterSize: r4(mbar), largestCluster: Math.max(...gs.map((v) => v.length)), icc: r6(icc), designEffect: r4(1 + (mbar * (1 + cv2) - 1) * icc) };
}

/** Pairwise ordering of safe against unsafe actions inside each menu by a score (lower = safer). */
function pairwise(menus) {
  // menus: [{ acts: [{ score, unsafe, type }] }]
  const acc = { all: [0, 0], sameType: [0, 0], crossType: [0, 0] }, perMenu = []; let menusWithPairs = 0, sameTypeMenus = 0;
  for (const m of menus) { const S = m.acts.filter((a) => !a.unsafe && a.score !== null), U = m.acts.filter((a) => a.unsafe && a.score !== null); if (!S.length || !U.length) continue; menusWithPairs++; let c = 0, n = 0, hasSame = false;
    for (const s of S) for (const u of U) { const v = s.score < u.score ? 1 : s.score === u.score ? 0.5 : 0, k = s.type === u.type ? 'sameType' : 'crossType'; if (k === 'sameType') hasSame = true; acc.all[0] += v; acc.all[1]++; acc[k][0] += v; acc[k][1]++; c += v; n++; }
    perMenu.push(c / n); if (hasSame) sameTypeMenus++; }
  const f = (x) => ({ pairs: x[1], correctlyOrdered: r4(x[0] / x[1]) });
  return { menusWithASafeAndAnUnsafeAction: menusWithPairs, menusWithASameTypeSafeUnsafePair: sameTypeMenus, pooled: f(acc.all), sameActionType: f(acc.sameType), differentActionType: f(acc.crossType), meanOverMenus: r4(mean(perMenu)), menusWithEveryPairCorrect: count(perMenu, (x) => x === 1), safeUnsafePairsPerMenuMean: r4(acc.all[1] / menusWithPairs) };
}

export function analyse() {
  const valText = readFileSync(VAL_FILE, 'utf8'), expText = readFileSync(EXP_FILE, 'utf8'), feasText = readFileSync(FEAS_FILE, 'utf8'), V = JSON.parse(valText), E = JSON.parse(expText), FZ = JSON.parse(feasText);
  const issues = [], need = (name, ok) => { if (!ok) issues.push(name); };
  need('inputsReconciled', V.reconciliation.exact === true && E.reconciliation.exact === true && FZ.reconciliation.exact === true); need('sameFrozenModel', V.source.modelHash === E.source.modelHash && E.source.modelHash === 'b479972a3445ccb9d3cf42ac9821aee2f69431e4101b6dbdfdcd76e777968c6b');
  need('sk2fClassification', FZ.verdicts.classification === 'B_SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED' && FZ.verdicts.nextScientificPriority === 'WITHIN_MENU_ACTION_RISK_DISCRIMINATION');
  const VR = V.rows, ER = E.rows, EO = ER.filter((r) => r.outOfBag), VC = V.actionColumns, AC = E.actionColumns, vc = (a, k) => a[VC.indexOf(k)], ec = (a, k) => a[AC.indexOf(k)];
  const vUnsafe = (a) => vc(a, 'introS0') === 1 || vc(a, 'introNexus') === 1, eUnsafe = (a) => ec(a, 'introS0') === 1 || ec(a, 'introNexus') === 1;

  // ================= Gate 1: recorded attribution, re-derived
  const vFail = VR.filter((r) => r.failure !== null), mech = (r) => { const top = r.actions.find((a) => vc(a, 'index') === r.sk1.forcedSet[0]), safe = r.actions.filter((a) => vc(a, 'selectable') === 1 && vc(a, 'inForcedSet') === 0 && !vUnsafe(a)); return !safe.length ? 'NO_SAFE_ALTERNATIVE' : safe.some((a) => vc(a, 'upper') < vc(top, 'upper')) ? 'RANKING_CONTRACT_ERROR' : 'WITHIN_MENU_RISK_ORDERING_ERROR'; };
  const vMech = vFail.map((r) => ({ r, m: mech(r) })), vOrd = vMech.filter((x) => x.m === 'WITHIN_MENU_RISK_ORDERING_ERROR'), vAcc = vFail.filter((r) => r.failure.accepted);
  const eoFail = EO.filter((r) => r.outOfBag.failure), eoOrd = eoFail.filter((r) => r.outOfBag.failure.mechanism === 'WITHIN_MENU_RISK_ORDERING_ERROR');
  const attribution = {
    validationForcedChoiceFailures: vFail.length, validationWithinMenuOrdering: vOrd.length, validationRankingContract: count(vMech, (x) => x.m === 'RANKING_CONTRACT_ERROR'), validationNoSafeAlternative: count(vMech, (x) => x.m === 'NO_SAFE_ALTERNATIVE'),
    uniqueAcceptedValidationFailures: vAcc.length, acceptedValidationFailuresThatAreOrderingErrors: count(vMech, (x) => x.r.failure.accepted && x.m === 'WITHIN_MENU_RISK_ORDERING_ERROR'),
    explorationOutOfBagFailures: eoFail.length, explorationOutOfBagOrdering: eoOrd.length, explorationOutOfBagRankingContract: count(eoFail, (r) => r.outOfBag.failure.mechanism === 'RANKING_CONTRACT_ERROR'),
    validationClassesWithAnEvaluatorSafeLegalAction: count(VR, (r) => r.actions.some((a) => !vUnsafe(a))), validationClasses: VR.length, explorationClassesWithAnEvaluatorSafeLegalAction: count(ER, (r) => r.actions.some((a) => !eUnsafe(a))), explorationClasses: ER.length };
  need('recordedAttribution', attribution.validationForcedChoiceFailures === 39 && attribution.validationWithinMenuOrdering === 34 && attribution.validationRankingContract === 5 && attribution.uniqueAcceptedValidationFailures === 2 && attribution.acceptedValidationFailuresThatAreOrderingErrors === 2 && attribution.explorationOutOfBagFailures === 55 && attribution.explorationOutOfBagOrdering === 48 && attribution.validationClassesWithAnEvaluatorSafeLegalAction === 600);

  // ================= baselines for the mechanism endpoints (frozen SK1; describes, selects nothing)
  const vMenus = (lab) => VR.map((r) => ({ acts: r.actions.map((a) => ({ score: vc(a, 'estimate'), unsafe: lab(a), type: vc(a, 'type') })) })), eMenus = (rows, scoreCol, lab) => rows.map((r) => ({ acts: r.actions.map((a) => ({ score: ec(a, scoreCol), unsafe: lab(a), type: ec(a, 'type') })) }));
  const vCat = (a) => vc(a, 'cat') !== 'NONE', eCat = (a) => ec(a, 'cat') !== 'NONE';
  const topChoice = { definition: 'the first-ranked decision set at full coverage (the forced choice); unsafe = introduces against S0 or Nexus-else-S0 in at least one member world',
    historicalValidation: { classes: VR.length, topChoiceUnsafe: vFail.length, rate: r6(vFail.length / VR.length), topChoiceCatastrophic: count(VR, (r) => r.policies.SK1_FORCED.catAny), catastropheRate: r6(count(VR, (r) => r.policies.SK1_FORCED.catAny) / VR.length), vsS0: count(VR, (r) => r.policies.SK1_FORCED.introS0), vsNexus: count(VR, (r) => r.policies.SK1_FORCED.introNexus), meanNreg: r4(mean(VR.map((r) => r.policies.SK1_FORCED.nreg))) },
    explorationOutOfBag: { classes: EO.length, topChoiceUnsafe: eoFail.length, rate: r6(eoFail.length / EO.length), topChoiceCatastrophic: count(EO, (r) => r.outOfBag.catAny), catastropheRate: r6(count(EO, (r) => r.outOfBag.catAny) / EO.length) },
    explorationOutOfFoldReference: { classes: 1000, topChoiceUnsafe: FZ.endpoints.explorationOutOfFoldReference.fullCoverage.forcedChoiceFailingClasses, rate: r6(FZ.endpoints.explorationOutOfFoldReference.fullCoverage.forcedChoiceFailingClasses / 1000) },
    comparatorsOnHistoricalValidation: { S0: { unsafeAgainstNexus: count(VR, (r) => r.policies.S0.introNexus), meanNreg: r4(mean(VR.map((r) => r.policies.S0.nreg))) }, NEXUS: { unsafeAgainstS0: count(VR, (r) => r.policies.NEXUS.introS0), meanNreg: r4(mean(VR.map((r) => r.policies.NEXUS.nreg))) }, C10: { unsafe: count(VR, (r) => r.policies.C10.introS0 || r.policies.C10.introNexus), meanNreg: r4(mean(VR.map((r) => r.policies.C10.nreg))) } } };
  const pairBaseline = { definition: 'for every menu, every (safe, unsafe) action pair; correctly ordered when the frozen estimate of the safe action is strictly lower; equal estimates count one half', note: 'SK1 was never trained on pairs or on the introduction label. These are the frozen-policy baselines a discriminator would have to beat.',
    introductionLabel: { historicalValidation: pairwise(vMenus(vUnsafe)), explorationOutOfBag: pairwise(eMenus(EO, 'oobEstimate', eUnsafe)), explorationInSample_optimistic: pairwise(eMenus(ER, 'inSampleEstimate', eUnsafe)) },
    catastropheLabel: { historicalValidation: pairwise(vMenus(vCat)), explorationOutOfBag: pairwise(eMenus(EO, 'oobEstimate', eCat)) } };

  // ================= candidate explanations A, B, C
  const pat = (rows, isUnsafe, catOf) => { const acts = rows.flatMap((r) => r.actions); const cats = acts.map(catOf); return { actions: acts.length, neverCatastrophic: count(cats, (c) => c === 'NONE'), catastrophicInSomeMembersOnly: count(cats, (c) => c === 'SOME_MEMBERS'), catastrophicInEveryMember: count(cats, (c) => c === 'ALL_MEMBERS'), shareOfCatastrophicActionsThatAreHiddenStateDependent: r4(count(cats, (c) => c === 'SOME_MEMBERS') / count(cats, (c) => c !== 'NONE')) }; };
  const vBags = vOrd.map((x) => x.r.sk1.stability.bagsWhereBestSafeAlternativeHasLowerRisk), eBagShare = eoOrd.map((r) => r.outOfBag.failure.bagsWhereBestSafeAlternativeHasLowerRisk / r.outOfBag.failure.bagsUsed);
  const explanations = {
    A_incorrectRiskDifferencesBetweenLegalActions: { status: 'SUPPORTED', kind: 'LEARNED_MODEL_ERROR (observed against OFFLINE_EVALUATOR_FACT labels)', evidence: { orderingErrorsValidation: `${vOrd.length} of ${vFail.length}`, orderingErrorsExplorationOutOfBag: `${eoOrd.length} of ${eoFail.length}`, pairwiseCorrectlyOrderedValidation: pairBaseline.introductionLabel.historicalValidation.pooled.correctlyOrdered, pairwiseCorrectlyOrderedSameTypeValidation: pairBaseline.introductionLabel.historicalValidation.sameActionType.correctlyOrdered },
      reading: 'The frozen estimate assigns a lower risk to an unsafe action than to every safe alternative in most failing menus. This is an observation about the model, not an explanation of why.' },
    B_sharedModellingBiasAmongBags: { status: 'SUPPORTED_AS_COMMON_MODE_ERROR; CAUSE_NOT_IDENTIFIED', kind: 'OBSERVATION about the ensemble',
      evidence: { validationOrderingErrorsByBagsOf10PreferringTheSafeAlternative: hist(vBags), validationUnanimous: count(vBags, (b) => b === 0), validationAtMost2Of10: count(vBags, (b) => b <= 2), validationMajorityOfBagsPreferTheSafeAlternative: count(vBags, (b) => b > 5), explorationOutOfBagUnanimousAmongBagsUsed: count(eBagShare, (s) => s === 0), explorationOutOfBagOrderingErrors: eBagShare.length, explorationMedianBoundGapInSpreads: FZ.discrimination.exploration.outOfBag.orderingErrors.boundGapInSpreads.p50 },
      reading: 'The bags share one learner, one feature set, one label and overlapping families, so their agreement does not make an estimate more likely to be right. Common-mode error is established. Whether its source is the learner and objective (correctable) or the features (not correctable by any learner on them) is NOT distinguishable from existing evidence.' },
    C_publicObservationEquivalenceHidingSafetyRelevantDifferences: { status: 'ESTABLISHED_FOR_OUTCOMES_OF_SINGLE_WORLDS; NOT_ESTABLISHED_FOR_CHOOSING_A_ROBUSTLY_SAFE_ACTION', kind: 'OFFLINE_EVALUATOR_FACT for the outcome dependence; PUBLIC_IDENTIFIABILITY unresolved',
      evidence: { validationFailingChoiceCatastrophicInSomeMembersOnly: count(vFail, (r) => r.failure.chosenCatastrophicIn === 'SOME_MEMBERS'), validationFailingChoiceCatastrophicInEveryMember: count(vFail, (r) => r.failure.chosenCatastrophicIn === 'ALL_MEMBERS'), validationFailuresOnTwinWorldsOnly: count(vFail, (r) => !r.failure.onBase), validationFailuresOnTheBaseWorld: count(vFail, (r) => r.failure.onBase),
        explorationOutOfBagFailingChoiceCatastrophicInSomeMembersOnly: count(eoFail, (r) => r.outOfBag.failure.chosenCatastrophicIn === 'SOME_MEMBERS'), explorationOutOfBagFailuresOnTwinWorldsOnly: count(eoFail, (r) => !r.outOfBag.failure.onBase),
        allActionsValidation: pat(VR, vUnsafe, (a) => vc(a, 'cat')), allActionsExploration: pat(ER, eUnsafe, (a) => ec(a, 'cat')),
        menusWithIdenticalFeatureRowsAndDifferentIntroductionOutcome: FZ.discrimination.featureCollisions.menusAffectedByAMixedIntroductionCollision, explorationMenus: ER.length, crossClassIdenticalRows: FZ.discrimination.featureCollisions.crossClass.groups,
        classesWithARobustlySafeAction: `${attribution.validationClassesWithAnEvaluatorSafeLegalAction} of ${VR.length} validation; ${attribution.explorationClassesWithAnEvaluatorSafeLegalAction} of ${ER.length} exploration` },
      reading: 'Hidden state decides the outcome of a given action in a given world: most catastrophic actions are catastrophic in some public-equivalent worlds and not others. That makes the per-world outcome publicly unpredictable. It does not by itself make the robust question unanswerable: every class contains an action that is safe in all sampled members. Whether that action can be told apart from public information is the open question. A demonstrated limit exists only for the few menus whose actions have identical feature rows.' },
    distinguishability: { A_from_B: 'not separate hypotheses: B describes how the errors in A are distributed across the ensemble', B_from_C: 'NOT_DISTINGUISHABLE_FROM_EXISTING_EVIDENCE. Both predict confident, unanimous, wrong within-menu orderings. Separating them needs a different learner evaluated on fresh classes (B predicts it can improve; a strict C predicts a ceiling) and a twin-consistency measurement.', whatExistingEvidenceCannotDo: 'show that an evaluator-safe action is publicly identifiable; show that it is not' } };

  // ================= planning inputs measured on existing evidence
  const fS = VR.map((r) => Number(r.failure !== null)), fC = VR.map((r) => Number(r.policies.C10.introS0 || r.policies.C10.introNexus)), fam = VR.map((r) => r.family), n = VR.length;
  const both = count(VR, (_, i) => fS[i] && fC[i]), b10 = count(VR, (_, i) => fC[i] && !fS[i]), c10 = count(VR, (_, i) => fS[i] && !fC[i]), pS = sum(fS) / n, pC = sum(fC) / n, phi = (both / n - pS * pC) / Math.sqrt(pS * (1 - pS) * pC * (1 - pC));
  const eoF = EO.map((r) => Number(r.outOfBag.union));
  const planningInputs = { note: 'measured on spent or development data; PLANNING ASSUMPTIONS only',
    failureCoOccurrenceOfTwoPublicPolicies: { pair: 'frozen C10 (reference) and frozen SK1 forced choice (candidate), historical validation', bothFail: both, onlyC10Fails: b10, onlySk1Fails: c10, neitherFails: n - both - b10 - c10, phi: r4(phi), reading: 'failures of two different public policies on the same classes are positively associated; independence is therefore a conservative planning assumption for a paired test' },
    clustering: { forcedChoiceFailureValidation: designEffect(fS, fam), forcedChoiceFailureExplorationOutOfBag: designEffect(eoF, EO.map((r) => r.family)), pairedDifferenceC10MinusSk1Validation: designEffect(fC.map((v, i) => v - fS[i]), fam), planningDesignEffect: 1.5, planningDesignEffectBasis: 'the design effect of a PAIRED failure difference between two public policies on the same classes (C10 minus SK1) estimates to about 1.46; the single-policy failure indicator gives 1.15 to 1.31. 1.5 is used for planning; 1.11 (the earlier SK1.1 figure, from a formula that ignores unequal family sizes) is shown as the optimistic case', sensitivity: [1, 1.11, 1.5, 2] },
    baselineTopChoiceUnsafeRate: { historicalValidation: r6(pS), explorationOutOfBag: r6(mean(eoF)), explorationOutOfFold: topChoice.explorationOutOfFoldReference.rate, planningValue: 0.065 },
    originFamilies: { exploration: new Set(ER.map((r) => r.family)).size, validation: new Set(fam).size, total: new Set([...ER.map((r) => r.family), ...fam]).size } };

  // ================= Gate 4: explicit power calculation for the paired primary test
  const p0 = planningInputs.baselineTopChoiceUnsafeRate.planningValue, REDS = [0.3, 0.4, 0.5, 0.6, 0.7], NS = [300, 400, 500, 600, 800, 1000, 1500], MODELS = [['INDEPENDENT', 0], ['EMPIRICAL_ASSOCIATION', r4(phi)], ['NESTED', 0]];
  const eff = (N, d) => Math.floor(N / d), cell = (N, red, model, ph) => { const { pb, pc } = discordance(p0, p0 * (1 - red), model, ph); return r4(pairedPower(N, pb, pc)); };
  const powerAtPlan = Object.fromEntries(MODELS.map(([m, ph]) => [m, Object.fromEntries([1, 1.11, 1.5, 2].map((d) => [`designEffect_${d}`, Object.fromEntries(REDS.map((red) => [`reduction_${red}`, cell(eff(PLAN.validationClasses, d), red, m, ph)]))]))]));
  const powerBySize = Object.fromEntries(NS.map((N) => [String(N), Object.fromEntries(REDS.map((red) => [`reduction_${red}`, { independent: cell(eff(N, 1.11), red, 'INDEPENDENT', 0), empiricalAssociation: cell(eff(N, 1.11), red, 'EMPIRICAL_ASSOCIATION', r4(phi)) }]))]));
  const classesFor80 = Object.fromEntries(REDS.map((red) => [`reduction_${red}`, Object.fromEntries(MODELS.map(([m, ph]) => { const e = smallestN(p0, p0 * (1 - red), m, ph); return [m, e === null ? null : { effectiveClasses: e, classesAtDesignEffect1_11: Math.ceil(e * 1.11), classesAtDesignEffect1_5: Math.ceil(e * 1.5) }]; }))]));
  const mdr = (N, d, model, ph) => { let lo = 0, hi = 0.999; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, { pb, pc } = discordance(p0, p0 * (1 - mid), model, ph); if (pairedPower(eff(N, d), pb, pc) >= PLAN.power) hi = mid; else lo = mid; } return r4(hi); };
  const halving = discordance(p0, p0 / 2, 'INDEPENDENT', 0), nEff = eff(PLAN.validationClasses, 1.11);
  const baselineSens = Object.fromEntries([0.055, 0.065, 0.073].map((b) => { const d = discordance(b, b / 2, 'INDEPENDENT', 0); return [String(b), r4(pairedPower(nEff, d.pb, d.pc))]; }));
  const zeroProb = (p, N) => Math.exp(N * Math.log1p(-p));
  const power = { plan: PLAN, primaryTest: 'paired, one-sided exact sign (McNemar) test on discordant classes: H0 the candidate\'s top-choice unsafe rate is not lower than frozen SK1\'s; alpha 0.05. The pre-registered interval is the origin-family cluster bootstrap of the paired difference; the exact test is the power model.',
    assumptions: { baselineTopChoiceUnsafeRate: p0, clustering: 'effective classes = classes / design effect', associationModels: { INDEPENDENT: 'the two policies fail independently (conservative)', EMPIRICAL_ASSOCIATION: `failures associated with phi = ${r4(phi)}, as observed between C10 and SK1`, NESTED: 'the candidate fails only where SK1 fails (most favourable; an upper limit on power)' } },
    powerAt600ValidationClasses: powerAtPlan, powerByValidationSize_designEffect1_11: powerBySize, validationClassesFor80PercentPower: classesFor80,
    smallestDetectableRelativeReductionAt600: { independent_designEffect1_11: mdr(600, 1.11, 'INDEPENDENT', 0), empiricalAssociation_designEffect1_11: mdr(600, 1.11, 'EMPIRICAL_ASSOCIATION', r4(phi)), independent_designEffect1_5: mdr(600, 1.5, 'INDEPENDENT', 0) },
    theHalvingClaimExamined: { claim: '600 fresh validation classes detect a halving of the top-choice unsafe rate', effectiveClasses: nEff, discordanceUnderIndependence: { pb: r6(halving.pb), pc: r6(halving.pc) }, expectedDiscordantClasses: r4(nEff * (halving.pb + halving.pc)), exactPowerIndependent: r4(pairedPower(nEff, halving.pb, halving.pc)), exactPowerEmpiricalAssociation: cell(nEff, 0.5, 'EMPIRICAL_ASSOCIATION', r4(phi)), exactPowerNested: cell(nEff, 0.5, 'NESTED', 0), exactPowerIndependentAtDesignEffect1_5: cell(eff(600, 1.5), 0.5, 'INDEPENDENT', 0), sensitivityToBaseline_independent: baselineSens,
      verdict: 'see reading' },
    relativeImprovementIsNotQualification: { note: 'Contract A requires ZERO introductions on every class. The probability of observing zero union introductions in 600 classes, by true top-choice unsafe rate:', probabilityOfZeroIntroductionsIn600: Object.fromEntries([0.065, 0.0325, 0.01, 0.005, 0.002, 0.001, 0.0005].map((p) => [String(p), r6(zeroProb(p, 600))])), rateNeededForEvenOddsOfZero: r6(1 - Math.pow(0.5, 1 / 600)), rateNeededFor80PercentChanceOfZero: r6(1 - Math.pow(0.8, 1 / 600)) },
    expectedCounts: { formerSk1FailureClassesIn600: r4(600 * p0), safeUnsafePairsIn600Menus: Math.round(600 * pairBaseline.introductionLabel.historicalValidation.safeUnsafePairsPerMenuMean * (pairBaseline.introductionLabel.historicalValidation.menusWithASafeAndAnUnsafeAction / VR.length)) } };
  const DE = planningInputs.clustering.planningDesignEffect, need80 = smallestN(p0, p0 / 2, "INDEPENDENT", 0), recommended = Math.ceil((need80 * DE) / 50) * 50, at = (N, model, ph, red = 0.5) => cell(eff(N, DE), red, model, ph);
  power.recommendedPlan = { status: "PLANNING_RECOMMENDATION_NOT_AN_ALLOCATION", rule: "smallest validation size, rounded up to 50, with at least 80% exact power for a halving under independent failures at the planning design effect", planningDesignEffect: DE, effectiveClassesNeeded: need80, recommendedValidationClasses: recommended,
    powerAtRecommended: { halving_independent: at(recommended, "INDEPENDENT", 0), halving_empiricalAssociation: at(recommended, "EMPIRICAL_ASSOCIATION", r4(phi)), reduction40_independent: at(recommended, "INDEPENDENT", 0, 0.4), reduction40_empiricalAssociation: at(recommended, "EMPIRICAL_ASSOCIATION", r4(phi), 0.4), reduction60_independent: at(recommended, "INDEPENDENT", 0, 0.6) },
    powerAtTheProposed600: { halving_independent: at(600, "INDEPENDENT", 0), halving_empiricalAssociation: at(600, "EMPIRICAL_ASSOCIATION", r4(phi)), reduction60_independent: at(600, "INDEPENDENT", 0, 0.6), smallestDetectableReduction_independent: mdr(600, DE, "INDEPENDENT", 0), smallestDetectableReduction_empiricalAssociation: mdr(600, DE, "EMPIRICAL_ASSOCIATION", r4(phi)) },
    totalClasses: { exploration: PLAN.explorationClasses, validation: recommended, holdout: 0, total: PLAN.explorationClasses + recommended, sk1AdmittedFrom26Blocks: 2298 } };
  power.theHalvingClaimExamined.atPlanningDesignEffect = { designEffect: DE, effectiveClasses: eff(600, DE), exactPowerIndependent: at(600, "INDEPENDENT", 0), exactPowerEmpiricalAssociation: at(600, "EMPIRICAL_ASSOCIATION", r4(phi)) };
  power.theHalvingClaimExamined.verdict = power.theHalvingClaimExamined.atPlanningDesignEffect.exactPowerIndependent >= 0.8 ? 'SUPPORTED_UNDER_CONSERVATIVE_ASSUMPTIONS' : power.theHalvingClaimExamined.exactPowerEmpiricalAssociation >= 0.8 ? 'NOT_SUPPORTED_UNDER_CONSERVATIVE_ASSUMPTIONS: 600 classes reach 80% only with small clustering AND positively associated failures' : 'NOT_SUPPORTED_AT_80_PERCENT';

  const src = { validationMatrixSha256: sha(valText), explorationMatrixSha256: sha(expText), sk2fFeasibilitySha256: sha(feasText), modelHash: E.source.modelHash, analyzerSha256: sha(readFileSync(fileURLToPath(import.meta.url))) };
  return { issues, out: { schema: 'HDISC0_DESIGN_EVIDENCE_V1', authority: 'R0', stage: 'STAGE3H-H-DISC-0', labels: ['READ_ONLY_DESIGN_ANALYSIS', 'EXISTING_EVIDENCE_ONLY', 'NO_TRAINING', 'NO_NEW_POPULATION', 'PLANNING_ASSUMPTIONS_NOT_RESULTS', 'NOT_AN_H_DISC_PERFORMANCE_RESULT'], source: src, reconciliation: { exact: issues.length === 0, issues },
    evidenceKinds: { OBSERVATION: 'what the frozen policy did', OFFLINE_EVALUATOR_FACT: 'an outcome computed by the frozen evaluator on sampled member worlds; not available at inference', LEARNED_MODEL_ERROR: 'a disagreement between the frozen model\'s ordering and evaluator facts', PUBLIC_IDENTIFIABILITY: 'whether a public-information rule can recover the evaluator fact on unseen classes', CAUSAL_EXPLANATION: 'why the error occurs' },
    attribution, topChoice, pairBaseline, explanations, planningInputs, power } };
}
const text = (o) => JSON.stringify(o, null, 1) + '\n';
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'dry', res = analyse(), t = text(res.out);
  console.log(J({ mode, reconciliation: res.out.reconciliation, halving: res.out.power.theHalvingClaimExamined, sha256: sha(t) }, null, 1));
  if (res.issues.length) { console.log('HDISC0_DESIGN_EVIDENCE_RECONCILIATION_FAILED'); process.exitCode = 1; }
  else if (mode === '--write') { const fd = openSync(OUT_FILE, 'wx'); writeSync(fd, t); closeSync(fd); console.log('written evidence/HDISC0_DESIGN_EVIDENCE.json'); }
  else if (mode === 'check') { const same = readFileSync(OUT_FILE, 'utf8') === t; console.log(same ? 'HDISC0_DESIGN_EVIDENCE_CHECK_PASS' : 'HDISC0_DESIGN_EVIDENCE_CHECK_FAILED'); if (!same) process.exitCode = 1; }
  else if (mode === 'print') { let v = res.out; for (const k of (process.argv[3] ?? '').split('.').filter(Boolean)) v = v?.[k]; console.log(JSON.stringify(v, null, 1)); }
  else if (mode !== 'dry') throw Error('USAGE: node analysis/design-evidence.mjs [--write | check | print <dotted.path>]');
}
