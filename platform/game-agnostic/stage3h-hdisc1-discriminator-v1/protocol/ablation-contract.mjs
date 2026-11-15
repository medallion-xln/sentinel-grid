// HDISC_MATCHED_ABLATION_CONTRACT_V1 — machine-checkable matched-ablation contract for the future campaign H-DISC-1.
// Authority R0. Pure: no import, no file, clock, random or environment access. Nothing here trains, evaluates or
// creates a parameter. It defines (1) the ablation ladder exactly as written in H-DISC-0, (2) how two FUTURE arm
// records are compared on nine controlled dimensions, (3) the structural check that keeps the pairwise arm from being
// an additive ranker under another name, and (4) what may be claimed from each outcome.
//
// The ladder text below is the H-DISC-0 text (H_DISC_0_PREREGISTRATION_DRAFT.md, section 4). A test compares it with
// the tracked document, so an arm cannot be redefined here unnoticed.

export const CONTRACT_ID = 'HDISC_MATCHED_ABLATION_CONTRACT_V1';
export const LEARNER_FAMILY = 'BAGGED_REGRESSION_TREE_ENSEMBLE';
export const FAMILIES = Object.freeze({ pair: 'HDISC_ANTISYMMETRISED_PAIR_TREE_ENSEMBLE_V1', additive: 'HDISC_ADDITIVE_POINTWISE_TREE_ENSEMBLE_V1' });
export const LABEL_FAMILIES = Object.freeze({ catastrophe: 'PER_ACTION_CATASTROPHE', introduction: 'COMPARATOR_RELATIVE_INTRODUCTION' });
export const OBJECTIVES = Object.freeze({ pointwise: 'POINTWISE_PER_ACTION', pairwise: 'PAIRWISE_ANTISYMMETRISED' });
export const PAIR_SAMPLING_RULE = 'HDISC_PAIR_SAMPLING_ALL_UNORDERED_PAIRS_CLASS_NORMALISED_V1';

/** The five ladder arms. label / information / objective / isolates are the H-DISC-0 wording, verbatim. */
export const LADDER = Object.freeze([
  { arm: 'M0', label: 'catastrophe in any member', information: 'SK1 feature set', objective: 'pointwise', isolates: 'new data only (against D)', against: 'D',
    family: FAMILIES.additive, labelFamily: LABEL_FAMILIES.catastrophe, objectiveId: OBJECTIVES.pointwise, perActionSet: 'SK1_FEATURE_SET', pairPresentation: false, pairRelationInputs: false },
  { arm: 'M1', label: 'union introduction', information: 'SK1 feature set', objective: 'pointwise', isolates: 'the label', against: 'M0',
    family: FAMILIES.additive, labelFamily: LABEL_FAMILIES.introduction, objectiveId: OBJECTIVES.pointwise, perActionSet: 'SK1_FEATURE_SET', pairPresentation: false, pairRelationInputs: false },
  { arm: 'M2', label: 'union introduction', information: "SK1 features plus per-action contrasts to the menu and to the comparators' public choices", objective: 'pointwise', isolates: 'relational information', against: 'M1',
    family: FAMILIES.additive, labelFamily: LABEL_FAMILIES.introduction, objectiveId: OBJECTIVES.pointwise, perActionSet: 'M2_PER_ACTION_DESCRIPTORS', pairPresentation: false, pairRelationInputs: false },
  { arm: 'M3a', label: 'union introduction', information: 'the same per-action descriptors as M2, presented as pairs', objective: 'pairwise, antisymmetrised', isolates: 'the pairwise objective', against: 'M2',
    family: FAMILIES.pair, labelFamily: LABEL_FAMILIES.introduction, objectiveId: OBJECTIVES.pairwise, perActionSet: 'M2_PER_ACTION_DESCRIPTORS', pairPresentation: true, pairRelationInputs: false },
  { arm: 'M3', label: 'union introduction', information: 'M3a plus explicit pair-contrast inputs', objective: 'pairwise', isolates: 'pair-specific inputs', against: 'M3a', equalsPolicyArm: 'F',
    family: FAMILIES.pair, labelFamily: LABEL_FAMILIES.introduction, objectiveId: OBJECTIVES.pairwise, perActionSet: 'M2_PER_ACTION_DESCRIPTORS', pairPresentation: true, pairRelationInputs: true },
].map(Object.freeze));
export const ESSENTIAL_CONTRAST = 'M2_vs_M3a';

export const DIMENSIONS = Object.freeze(['TRAINING_INFORMATION', 'FEATURE_ACCESS', 'NATIVE_ACTION_MENU', 'LABEL_DEFINITIONS', 'MODEL_CAPACITY', 'TRAINING_OBJECTIVE', 'OPTIMISATION_BUDGET', 'RANDOMISATION', 'INFERENCE_BUDGET']);
export const STATUS = Object.freeze({ MATCHED: 'MATCHED', BY_DESIGN: 'DIFFERS_BY_DESIGN', UNAVOIDABLE: 'UNAVOIDABLE_DIFFERENCE', MISMATCH: 'MISMATCH' });
export const VERDICT = Object.freeze({ FULL: 'FULLY_MATCHED', PARTIAL: 'PARTIALLY_MATCHED', NOT_TESTABLE: 'NOT_TESTABLE' });

/** Each ladder contrast: the ONE dimension that differs by design, and the dimensions whose difference cannot be removed. */
export const CONTRASTS = Object.freeze({
  D_vs_M0: { upper: 'D', lower: 'M0', designed: 'TRAINING_INFORMATION', isolates: 'new data only (against D)',
    unavoidable: { TRAINING_OBJECTIVE: 'D is the frozen SK1 kernel: a risk head ranked by risk tier and then a separate regret head. M0 is the additive control ranked by the H-DISC ranking contract. The ranking contract therefore changes together with the data.' } },
  M0_vs_M1: { upper: 'M0', lower: 'M1', designed: 'LABEL_DEFINITIONS', isolates: 'the label', unavoidable: {} },
  M1_vs_M2: { upper: 'M1', lower: 'M2', designed: 'FEATURE_ACCESS', isolates: 'relational information', unavoidable: {} },
  M2_vs_M3a: { upper: 'M2', lower: 'M3a', designed: 'TRAINING_OBJECTIVE', isolates: 'the pairwise objective',
    unavoidable: {
      MODEL_CAPACITY: '(c) the pair model reads 2d+k inputs against d+k with the same tree budget, and (d) antisymmetrisation uses every tree twice with opposite sign, which removes its symmetric part: equal tree budgets are not equal function classes',
      OPTIMISATION_BUDGET: '(b) the pair model is fitted on pairs, the control on actions. The matched unit is fixed instead: same classes, same actions, every unordered pair of selectable actions once, class weights normalised so each class carries the same total weight in both arms, equal leaf-update budget',
      INFERENCE_BUDGET: '(a) the pair model evaluates n(n-1) ordered pairs per menu against n actions. The ceiling is shared; consumption cannot be equal. Median and maximum milliseconds per decision and scorer evaluations per menu are both reported' } },
  M3a_vs_M3: { upper: 'M3a', lower: 'M3', designed: 'FEATURE_ACCESS', isolates: 'pair-specific inputs', unavoidable: {} },
});

// ---------------------------------------------------------------- structural non-vacuity
// Declared input layout of a pair-family tree, for d per-action descriptors, r pair-relation inputs and k context inputs:
//     [0, d)            phi_a      the first action's descriptors
//     [d, 2d)           phi_b      the second action's descriptors
//     [2d, 2d + r)      rho_ab     explicit pair-relation inputs (r = 0 for M3a)
//     [2d + r, 2d+r+k)  c          shared menu context
// Tree format {f, t, l, r, v}: f[n] >= 0 is the split input of node n (f[n] < 0 marks a leaf), l[n] / r[n] its children.
export const inputWidth = (family, { d, r = 0, k }) => (family === FAMILIES.pair ? 2 * d + r + k : d + k);
const layoutOk = (L) => L && Number.isInteger(L.d) && L.d > 0 && Number.isInteger(L.k) && L.k >= 0 && Number.isInteger(L.r ?? 0) && (L.r ?? 0) >= 0;
function pathsUse(parameters, layout, wanted) {
  if (!parameters || !Array.isArray(parameters.bags) || !layoutOk(layout)) throw Error('PARAMETERS_OR_LAYOUT_MALFORMED');
  const { d, r = 0 } = layout, region = (j) => (j < d ? 'A' : j < 2 * d ? 'B' : j < 2 * d + r ? 'RHO' : 'C');
  for (const bag of parameters.bags) for (const tree of bag.trees ?? []) {
    if (!['f', 'l', 'r'].every((key) => Array.isArray(tree[key]))) throw Error('TREE_MALFORMED');
    const walk = (node, seen, depth) => { if (depth > 64) throw Error('TREE_TOO_DEEP_OR_CYCLIC'); if (tree.f[node] < 0) return wanted(seen); const s = new Set(seen); s.add(region(tree.f[node])); return walk(tree.l[node], s, depth + 1) || walk(tree.r[node], s, depth + 1); };
    if (tree.f.length && walk(0, new Set(), 0)) return true;
  }
  return false;
}
/** True when at least one root-to-leaf path splits on an input of the first action AND on an input of the second. */
export const hasCrossActionInteraction = (parameters, layout = parameters?.layout) => pathsUse(parameters, layout, (seen) => seen.has('A') && seen.has('B'));
/** True when at least one path splits on an explicit pair-relation input. */
export const hasPairRelationSplit = (parameters, layout = parameters?.layout) => pathsUse(parameters, layout, (seen) => seen.has('RHO'));

// ---------------------------------------------------------------- comparison of two future arm records
const J = JSON.stringify, eq = (a, b) => J(a) === J(b), isSubsetPrefix = (small, big) => small.length < big.length && small.every((x) => big.includes(x));
const treeBudget = (c) => [c.bags, c.treesPerBag, c.maxDepth], maxNodes = (c) => c.bags * c.treesPerBag * (2 ** (c.maxDepth + 1) - 1);
const REQUIRED = ['arm', 'learnerFamily', 'trainingInformation', 'featureAccess', 'nativeActionMenu', 'labelDefinitions', 'capacity', 'objective', 'optimisationBudget', 'randomisation', 'inferenceBudget'];
function wellFormed(rec) {
  if (!rec || typeof rec !== 'object') return ['RECORD_MISSING']; const issues = REQUIRED.filter((key) => rec[key] === undefined || rec[key] === null).map((key) => `MISSING:${key}`); if (issues.length) return issues;
  const c = rec.capacity, f = rec.featureAccess, L = f.inputLayout;
  if (!['bags', 'treesPerBag', 'maxDepth', 'totalNodes', 'totalLeaves', 'inputWidth'].every((key) => Number.isInteger(c[key]) && c[key] > 0)) issues.push('CAPACITY_RECORD_INCOMPLETE');
  if (!layoutOk(L) || !Array.isArray(f.perActionNames) || !Array.isArray(f.contextNames) || !Array.isArray(f.pairRelationNames)) issues.push('FEATURE_ACCESS_INCOMPLETE');
  else { if (f.perActionNames.length !== L.d || f.contextNames.length !== L.k || f.pairRelationNames.length !== (L.r ?? 0)) issues.push('INPUT_LAYOUT_DOES_NOT_MATCH_NAMES'); if (c.inputWidth !== inputWidth(c.family, L)) issues.push('INPUT_WIDTH_DOES_NOT_MATCH_LAYOUT'); }
  if (c.totalNodes > maxNodes(c)) issues.push('NODE_COUNT_EXCEEDS_TREE_BUDGET'); if (c.family !== rec.objective.family) issues.push('CAPACITY_FAMILY_DIFFERS_FROM_OBJECTIVE_FAMILY');
  return issues;
}
const spec = (arm) => LADDER.find((x) => x.arm === arm);
function conforms(rec) { // does the record describe the arm it claims to be?
  const s = spec(rec.arm), out = []; if (!s) return ['UNKNOWN_ARM'];
  if (rec.learnerFamily !== LEARNER_FAMILY) out.push('LEARNER_FAMILY'); if (rec.objective.family !== s.family) out.push('MODEL_FAMILY'); if (rec.objective.id !== s.objectiveId) out.push('OBJECTIVE'); if (rec.labelDefinitions.labelFamily !== s.labelFamily) out.push('LABEL_FAMILY');
  if (rec.featureAccess.perActionSet !== s.perActionSet) out.push('PER_ACTION_SET'); if ((rec.featureAccess.pairRelationNames.length > 0) !== s.pairRelationInputs) out.push('PAIR_RELATION_INPUTS');
  if (rec.objective.antisymmetrised !== s.pairPresentation || rec.objective.unit !== (s.pairPresentation ? 'PAIR' : 'ACTION')) out.push('PAIR_PRESENTATION');
  return out;
}

/** Compare two arm records on the nine dimensions for a named ladder contrast. Fails closed: anything unverifiable is a MISMATCH. */
export function assertMatchedContrast(armA, armB, records) {
  const id = `${armA}_vs_${armB}`, C = CONTRASTS[id]; if (!C) return { contract: CONTRACT_ID, contrast: id, verdict: VERDICT.NOT_TESTABLE, reasons: ['NOT_A_LADDER_CONTRAST'], dimensions: {} };
  const A = records?.[armA], B = records?.[armB], reasons = [], dims = {}, set = (dim, status, detail) => { dims[dim] = { status, detail }; };
  if (armA === 'D') return compareWithFrozenReference(id, C, A, B);
  for (const [name, rec] of [[armA, A], [armB, B]]) { const w = wellFormed(rec); if (w.length) reasons.push(...w.map((x) => `${name}:${x}`)); else { const c = conforms(rec); if (c.length) reasons.push(...c.map((x) => `${name}:DOES_NOT_CONFORM_TO_ITS_ARM:${x}`)); } }
  if (reasons.length) return { contract: CONTRACT_ID, contrast: id, isolates: C.isolates, verdict: VERDICT.NOT_TESTABLE, reasons, dimensions: Object.fromEntries(DIMENSIONS.map((dim) => [dim, { status: STATUS.MISMATCH, detail: 'record malformed or not the declared arm' }])) };
  const designed = (dim) => C.designed === dim, unavoidable = (dim) => C.unavoidable[dim], mark = (dim, same, designedOk, designedDetail, unavoidableOk = true) => {
    if (designed(dim)) return set(dim, designedOk ? STATUS.BY_DESIGN : STATUS.MISMATCH, designedOk ? designedDetail : `the isolated factor is not the declared one: ${designedDetail}`);
    if (unavoidable(dim)) return set(dim, unavoidableOk ? STATUS.UNAVOIDABLE : STATUS.MISMATCH, unavoidableOk ? unavoidable(dim) : 'the part of this dimension that CAN be equalised is not equal');
    return set(dim, same ? STATUS.MATCHED : STATUS.MISMATCH, same ? 'equal' : 'differs although this contrast does not isolate it'); };

  // 1. training information: the same exploration classes, the same folds
  mark('TRAINING_INFORMATION', eq(A.trainingInformation, B.trainingInformation), false, 'ladder arms must share the exploration population');
  // 2. feature access: which public inputs each arm may read
  const fa = A.featureAccess, fb = B.featureAccess, ctxSame = eq(fa.contextNames, fb.contextNames), perSame = eq(fa.perActionNames, fb.perActionNames), rhoSame = eq(fa.pairRelationNames, fb.pairRelationNames);
  const featDesigned = id === 'M1_vs_M2' ? ctxSame && rhoSame && isSubsetPrefix(fa.perActionNames, fb.perActionNames) : id === 'M3a_vs_M3' ? ctxSame && perSame && fa.pairRelationNames.length === 0 && fb.pairRelationNames.length > 0 : false;
  mark('FEATURE_ACCESS', ctxSame && perSame && rhoSame, featDesigned, id === 'M1_vs_M2' ? 'M2 reads every M1 descriptor plus per-action contrasts; same context; no pair-relation input' : 'M3 reads the same descriptors and context plus explicit pair-relation inputs');
  // 3. native-action menu
  mark('NATIVE_ACTION_MENU', eq(A.nativeActionMenu, B.nativeActionMenu) && A.nativeActionMenu.completeMenu === true, false, 'the menu contract is never an isolated factor');
  // 4. label definitions
  const la = A.labelDefinitions, lb = B.labelDefinitions, restSame = eq({ ...la, labelFamily: 0 }, { ...lb, labelFamily: 0 });
  mark('LABEL_DEFINITIONS', eq(la, lb), restSame && la.labelFamily === LABEL_FAMILIES.catastrophe && lb.labelFamily === LABEL_FAMILIES.introduction, 'catastrophe in any member is replaced by the union introduction; same label contract, evaluator definitions and comparator conditioning');
  // 5. model capacity: one learner family, an equal tree budget; node counts inside that budget
  const ca = A.capacity, cb = B.capacity, budgetSame = eq(treeBudget(ca), treeBudget(cb)) && A.learnerFamily === B.learnerFamily, widthFollowsDesign = designed('FEATURE_ACCESS') || designed('TRAINING_OBJECTIVE');
  mark('MODEL_CAPACITY', budgetSame && (ca.inputWidth === cb.inputWidth || widthFollowsDesign), false, 'capacity is never an isolated factor', budgetSame);
  // 6. training objective
  const oa = A.objective, ob = B.objective, lossSame = oa.loss === ob.loss && oa.link === ob.link;
  mark('TRAINING_OBJECTIVE', eq(oa, ob), lossSame && oa.id === OBJECTIVES.pointwise && ob.id === OBJECTIVES.pairwise && ob.antisymmetrised === true, 'the pointwise per-action objective is replaced by the antisymmetrised pairwise objective; same loss and link');
  // 7. optimisation budget
  const pa = A.optimisationBudget, pb = B.optimisationBudget, core = (p) => [p.configurationsTried, p.tuningRuleId, p.earlyStoppingRule, p.treeBudget, p.leafUpdateBudget, p.totalTrainingWeight];
  const pairRuleOk = (p, rec) => (rec.objective.unit === 'PAIR' ? p.pairSamplingRule === PAIR_SAMPLING_RULE : p.pairSamplingRule === null);
  mark('OPTIMISATION_BUDGET', eq(core(pa), core(pb)) && eq(pa.pairSamplingRule, pb.pairSamplingRule) && pairRuleOk(pa, A) && pairRuleOk(pb, B), false, 'optimisation budget is never an isolated factor', eq(core(pa), core(pb)) && pairRuleOk(pa, A) && pairRuleOk(pb, B));
  // 8. randomisation
  mark('RANDOMISATION', eq(A.randomisation, B.randomisation), false, 'randomisation is never an isolated factor');
  // 9. inference budget: a shared ceiling, both arms measured and inside it
  const ia = A.inferenceBudget, ib = B.inferenceBudget, measured = (i) => [i.medianMs, i.maxMs].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) && Number.isInteger(i.scorerEvaluationsAtReferenceMenu) && i.scorerEvaluationsAtReferenceMenu > 0;
  const inside = (i) => measured(i) && i.medianMs <= i.ceiling.medianMsMax && i.maxMs <= i.ceiling.maxMsMax, ceilingSame = eq(ia.ceiling, ib.ceiling) && ia.referenceMenuSize === ib.referenceMenuSize, scaling = (rec) => (rec.objective.unit === 'PAIR' ? 'QUADRATIC_n(n-1)' : 'LINEAR_n');
  const scalingOk = ia.pairEvaluationsPerMenu === scaling(A) && ib.pairEvaluationsPerMenu === scaling(B);
  mark('INFERENCE_BUDGET', ceilingSame && inside(ia) && inside(ib) && scalingOk && ia.pairEvaluationsPerMenu === ib.pairEvaluationsPerMenu, false, 'inference budget is never an isolated factor', ceilingSame && inside(ia) && inside(ib) && scalingOk);

  // structural non-vacuity of the pair arms
  const structural = {};
  for (const [name, rec] of [[armA, A], [armB, B]]) if (spec(name).pairPresentation) { const st = rec.structural ?? {};
    structural[name] = { hasCrossActionInteraction: st.hasCrossActionInteraction ?? null, hasPairRelationSplit: st.hasPairRelationSplit ?? null };
    if (st.hasCrossActionInteraction !== true) reasons.push(st.hasCrossActionInteraction === false ? `${name}:VACUOUS_NO_CROSS_ACTION_PATH` : `${name}:STRUCTURE_NOT_VERIFIED`);
    if (spec(name).pairRelationInputs && st.hasPairRelationSplit !== true) reasons.push(st.hasPairRelationSplit === false ? `${name}:VACUOUS_PAIR_RELATION_INPUTS_UNUSED` : `${name}:STRUCTURE_NOT_VERIFIED`); }
  const statuses = DIMENSIONS.map((dim) => dims[dim].status); for (const dim of DIMENSIONS) if (dims[dim].status === STATUS.MISMATCH) reasons.push(`MISMATCH:${dim}`);
  const designedCount = statuses.filter((s) => s === STATUS.BY_DESIGN).length; if (designedCount !== 1 && !reasons.some((r) => r.startsWith('MISMATCH'))) reasons.push('EXACTLY_ONE_DIMENSION_MUST_DIFFER_BY_DESIGN');
  const verdict = reasons.length ? VERDICT.NOT_TESTABLE : statuses.includes(STATUS.UNAVOIDABLE) ? VERDICT.PARTIAL : VERDICT.FULL;
  return { contract: CONTRACT_ID, contrast: id, isolates: C.isolates, verdict, vacuous: reasons.some((r) => r.includes('VACUOUS')), reasons, dimensions: dims, structural,
    unavoidableDifferences: DIMENSIONS.filter((dim) => dims[dim].status === STATUS.UNAVOIDABLE).map((dim) => ({ dimension: dim, reason: dims[dim].detail })) };
}
/** D is frozen and has no arm record of this kind; the D-to-M0 step can never be more than partially matched. */
function compareWithFrozenReference(id, C, D, M0) {
  const reasons = [], w = wellFormed(M0); if (w.length) reasons.push(...w.map((x) => `M0:${x}`)); else reasons.push(...conforms(M0).map((x) => `M0:DOES_NOT_CONFORM_TO_ITS_ARM:${x}`));
  if (!D || D.frozen !== true || typeof D.modelHash !== 'string' || !D.riskHeadCapacity || !Array.isArray(D.featureNames)) reasons.push('D:FROZEN_REFERENCE_RECORD_INCOMPLETE');
  const dims = Object.fromEntries(DIMENSIONS.map((dim) => [dim, { status: STATUS.MISMATCH, detail: 'not evaluated' }])); if (reasons.length) return { contract: CONTRACT_ID, contrast: id, isolates: C.isolates, verdict: VERDICT.NOT_TESTABLE, reasons, dimensions: dims };
  const set = (dim, ok, okStatus, detail) => { dims[dim] = { status: ok ? okStatus : STATUS.MISMATCH, detail: ok ? detail : `not equal to the frozen reference: ${detail}` }; };
  set('TRAINING_INFORMATION', M0.trainingInformation.explorationClassListDigest !== D.explorationClassListDigest, STATUS.BY_DESIGN, 'M0 is fitted on the fresh exploration population; D on the SK1 exploration population');
  set('FEATURE_ACCESS', JSON.stringify(M0.featureAccess.perActionNames.concat(M0.featureAccess.contextNames)) === JSON.stringify(D.featureNames), STATUS.MATCHED, 'the SK1 feature set, name for name');
  set('NATIVE_ACTION_MENU', JSON.stringify(M0.nativeActionMenu.observationContract) === JSON.stringify(D.observationContract), STATUS.MATCHED, 'same observation contract and complete menu');
  set('LABEL_DEFINITIONS', M0.labelDefinitions.labelFamily === LABEL_FAMILIES.catastrophe, STATUS.MATCHED, 'catastrophe in any member, as the SK1 risk head');
  set('MODEL_CAPACITY', JSON.stringify(treeBudget(M0.capacity)) === JSON.stringify(treeBudget(D.riskHeadCapacity)), STATUS.MATCHED, 'the SK1 risk-head tree budget');
  set('TRAINING_OBJECTIVE', M0.objective.id === OBJECTIVES.pointwise, STATUS.UNAVOIDABLE, C.unavoidable.TRAINING_OBJECTIVE);
  set('OPTIMISATION_BUDGET', true, STATUS.UNAVOIDABLE, 'D was tuned once, on other data, by the SK1 rules; its tuning effort cannot be replayed on the fresh population');
  set('RANDOMISATION', M0.randomisation.bagBootstrapScheme === D.bagBootstrapScheme, STATUS.MATCHED, 'family bootstrap of bags');
  set('INFERENCE_BUDGET', M0.inferenceBudget.medianMs <= M0.inferenceBudget.ceiling.medianMsMax && M0.inferenceBudget.maxMs <= M0.inferenceBudget.ceiling.maxMsMax, STATUS.MATCHED, 'both linear in the menu size and inside the shared ceiling');
  for (const dim of DIMENSIONS) if (dims[dim].status === STATUS.MISMATCH) reasons.push(`MISMATCH:${dim}`);
  return { contract: CONTRACT_ID, contrast: id, isolates: C.isolates, verdict: reasons.length ? VERDICT.NOT_TESTABLE : VERDICT.PARTIAL, vacuous: false, reasons, dimensions: dims, structural: {},
    unavoidableDifferences: DIMENSIONS.filter((dim) => dims[dim].status === STATUS.UNAVOIDABLE).map((dim) => ({ dimension: dim, reason: dims[dim].detail })) };
}
/** The best verdict each contrast can reach when both arms are built correctly. */
export const BEST_REACHABLE = Object.freeze(Object.fromEntries(Object.entries(CONTRASTS).map(([id, c]) => [id, Object.keys(c.unavoidable).length ? VERDICT.PARTIAL : VERDICT.FULL])));

// ---------------------------------------------------------------- what may be claimed
export const ATTRIBUTION = Object.freeze({ SUPPORTED: 'SUPPORTED', NOT_SUPPORTED: 'NOT_SUPPORTED', UNRESOLVED: 'UNRESOLVED', NOT_TESTABLE: 'NOT_TESTABLE', NO_TOTAL_EFFECT: 'NOT_APPLICABLE_NO_TOTAL_EFFECT' });
export const NEVER_LICENSED = 'An improvement of F over D, however large, never licenses the statement that pairwise learning caused it. F differs from D in data, label, information, objective and pair-specific inputs at once. Only the matched M2-against-M3a contrast speaks to the pairwise objective, and only at the strength its verdict allows.';
/**
 * Attribution outcome for one ladder contrast.
 *   difference   lower arm's top-choice unsafe rate minus the upper arm's (negative = the isolated factor helped)
 *   interval     two-sided 95% origin-family cluster-bootstrap interval of that difference, [low, high]
 *   rejected     the pre-registered paired test for this contrast rejected its null (Holm-adjusted within the mechanism family)
 *   totalEffect  F's rate minus D's rate, point estimate (negative = F is better)
 */
export function attributionOutcome({ contrastVerdict, vacuous = false, rejected, interval, totalEffect }) {
  if (vacuous || contrastVerdict === VERDICT.NOT_TESTABLE || ![VERDICT.FULL, VERDICT.PARTIAL].includes(contrastVerdict)) return { outcome: ATTRIBUTION.NOT_TESTABLE, qualifier: null };
  if (!Array.isArray(interval) || interval.length !== 2 || !interval.every(Number.isFinite) || interval[0] > interval[1] || typeof rejected !== 'boolean' || !Number.isFinite(totalEffect)) return { outcome: ATTRIBUTION.NOT_TESTABLE, qualifier: 'ANALYSIS_INPUT_INCOMPLETE' };
  const qualifier = contrastVerdict === VERDICT.PARTIAL ? 'WITH_DECLARED_UNAVOIDABLE_DIFFERENCES' : null;
  if (rejected && interval[1] < 0) return { outcome: ATTRIBUTION.SUPPORTED, qualifier };
  if (!(totalEffect < 0)) return { outcome: ATTRIBUTION.NO_TOTAL_EFFECT, qualifier };
  const half = totalEffect / 2, includesZero = interval[0] <= 0 && interval[1] >= 0, includesHalf = interval[0] <= half && interval[1] >= half;
  if (includesZero && includesHalf) return { outcome: ATTRIBUTION.UNRESOLVED, qualifier };       // cannot tell "no contribution" from "half of everything"
  if (includesZero && !includesHalf) return { outcome: ATTRIBUTION.NOT_SUPPORTED, qualifier };  // a contribution as large as half the total effect is excluded
  return { outcome: ATTRIBUTION.UNRESOLVED, qualifier };
}
export const LICENSED_CLAIMS = Object.freeze({
  SUPPORTED: 'On fresh classes, with the same label, the same per-action information, the same tree budget and the same tuning effort, replacing the pointwise objective by the antisymmetrised pairwise objective lowered the top-choice unsafe rate. If the contrast is PARTIALLY_MATCHED the claim must list the unavoidable differences beside it.',
  NOT_SUPPORTED: 'The pairwise objective, with the same information, did not lower the top-choice unsafe rate, and a contribution as large as half of the total F-against-D effect is excluded. Any F-against-D gain is then attributed to the other rungs or left unattributed.',
  UNRESOLVED: 'The contrast cannot tell no contribution from a contribution of half the total effect. This is not a negative finding and not a positive one.',
  NOT_TESTABLE: 'No statement about the pairwise objective may be made: the arms were not matched, could not be built, or the trained pair model has no path that splits on both actions and is therefore an additive ranker in pair form.',
  NOT_APPLICABLE_NO_TOTAL_EFFECT: 'F did not improve on D, so there is no effect to attribute.',
});
