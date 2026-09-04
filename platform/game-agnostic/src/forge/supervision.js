/* Sentinel Forge World — tie taxonomy, Pareto analysis, supervision classes.
 *
 * Stage 3B. Stage 3A left 416 of 504 cases with an exact tie at the optimum, and
 * the temptation is to treat that as a defect and engineer it away. It is not one
 * thing. A tie can be a reward that cannot see a real difference, or it can be a
 * world in which two actions genuinely are worth the same. Only the first is a
 * defect; erasing the second would be manufacturing labels, and a model trained on
 * a fabricated preference learns a fabricated world.
 *
 * So nothing here removes a tie. This module CLASSIFIES ties, and the
 * classification decides which exporter may use the case. That is the whole
 * design: supervision density comes from routing cases to the right dataset, not
 * from pretending equivalent actions differ.
 */

import { sha256 } from '../core/determinism.js';

export const FORGE_SUPERVISION_VERSION = 'FORGE_SUPERVISION_V1';

/* ---------------------------------------------------------------------------
 * Tie taxonomy
 * ------------------------------------------------------------------------- */

export const TIE_CLASSES = Object.freeze([
  'ACCIDENTAL_REWARD_COLLAPSE',
  'INSUFFICIENT_REWARD_RESOLUTION',
  'GENUINE_STRATEGIC_EQUIVALENCE',
  'SYMMETRIC_ACTIONS',
  'HORIZON_ALIASING',
  'OTHER',
]);

/* Only these two are defects. The rest are properties of the world, and the
 * certification refuses to count them as reward failures. */
export const TIE_CLASSES_INDICATING_REWARD_DEFECT = Object.freeze([
  'ACCIDENTAL_REWARD_COLLAPSE',
  'INSUFFICIENT_REWARD_RESOLUTION',
]);

/* Schema-agnostic.
 *
 * The first version compared only FORGE_REWARD_V1's component names. Applied to a
 * V2 vector that silently dropped the five components V2 exists for — both
 * potential terms among them — so every V2 tie looked like a vector match and the
 * taxonomy reported far more genuine equivalence than the corpus contained. A
 * comparison that only sees the components it was written against is not a
 * comparison of the vectors it was handed. */
const vectorKey = (vector) => Object.keys(vector ?? {}).sort()
  .map((id) => `${id}=${vector[id]}`).join(',');

/**
 * Classify one tied group — the set of branches sharing the optimal scalar.
 *
 * The decision tree, in order, and each step answers a different question:
 *
 *   1. Do the reward VECTORS differ while the scalars match? Then the
 *      scalarization is losing information the vector already has:
 *      ACCIDENTAL_REWARD_COLLAPSE. This is the one class a new weighting could
 *      legitimately fix.
 *   2. Vectors identical AND resulting worlds identical? The actions genuinely
 *      lead to the same place. If they are the same action type reaching it by
 *      symmetric routes it is SYMMETRIC_ACTIONS, otherwise
 *      GENUINE_STRATEGIC_EQUIVALENCE. Neither is a defect.
 *   3. Vectors identical, worlds differ, but the IMMEDIATE vectors differed and
 *      the horizon washed the difference out: HORIZON_ALIASING. A property of the
 *      horizon length, not of the reward.
 *   4. Vectors identical, worlds differ, immediate vectors also identical: the
 *      reward cannot see a difference the world contains.
 *      INSUFFICIENT_REWARD_RESOLUTION — the second real defect class.
 */
export function classifyTiedGroup(branches) {
  if (branches.length < 2) return null;

  const totalKeys = new Set(branches.map((branch) => vectorKey(branch.totalRewardVector)));
  const immediateKeys = new Set(branches.map((branch) => vectorKey(branch.immediateRewardVector)));
  const stateHashes = new Set(branches.map((branch) => branch.resultingStateHash));
  const horizonHashes = new Set(branches.map((branch) => branch.horizonStateHash));
  const actionTypes = new Set(branches.map((branch) => branch.action.actionType));

  const evidence = {
    groupSize: branches.length,
    distinctTotalVectors: totalKeys.size,
    distinctImmediateVectors: immediateKeys.size,
    distinctResultingStates: stateHashes.size,
    distinctHorizonStates: horizonHashes.size,
    distinctActionTypes: actionTypes.size,
    actionTypes: [...actionTypes].sort(),
  };

  if (totalKeys.size > 1) {
    return {
      class: 'ACCIDENTAL_REWARD_COLLAPSE',
      rewardDefect: true,
      why: 'The branches have different reward vectors that the weighting maps to the same scalar. The information exists in the vector and is destroyed by scalarization.',
      evidence,
    };
  }

  if (stateHashes.size === 1) {
    /* Identical successor states. Nothing downstream could tell these apart, so
     * no reward function could either. */
    return {
      class: actionTypes.size === 1 ? 'SYMMETRIC_ACTIONS' : 'GENUINE_STRATEGIC_EQUIVALENCE',
      rewardDefect: false,
      why: actionTypes.size === 1
        ? 'Several instances of one action type reach a byte-identical successor state — symmetric routes to the same world.'
        : 'Different action types reach a byte-identical successor state. The actions are the same move by another name.',
      evidence,
    };
  }

  /* The convergence test comes BEFORE the immediate-difference test, and the
   * ordering is load-bearing.
   *
   * The first version of this classifier asked "did the immediate rewards
   * differ?" first and called every such case HORIZON_ALIASING — not a defect.
   * That put 397 of 416 ties beyond scrutiny. Checking convergence first showed
   * only 17 of those 397 actually merge: the other 380 end in materially
   * different worlds carrying identical accumulated reward, which is a reward
   * that cannot see where it ended up, not a horizon that absorbed a difference.
   *
   * Aliasing means the PATHS MERGE. If they do not merge, the equality of the
   * totals is the reward's problem. */
  if (horizonHashes.size === 1) {
    return immediateKeys.size > 1
      ? {
        class: 'HORIZON_ALIASING',
        rewardDefect: false,
        why: 'The branches differ on the immediate step and then genuinely converge: they reach a byte-identical world by the end of the horizon. A property of the horizon length, not of the reward.',
        evidence,
      }
      : {
        class: 'GENUINE_STRATEGIC_EQUIVALENCE',
        rewardDefect: false,
        why: 'The branches reach different successor states that converge to a byte-identical world by the end of the horizon, with identical reward at every step. Over the window being scored they are the same move.',
        evidence,
      };
  }

  return {
    class: 'INSUFFICIENT_REWARD_RESOLUTION',
    rewardDefect: true,
    why: 'The branches reach materially different worlds and are STILL different at the end of the horizon, yet every accumulated reward component is equal. FORGE_REWARD_V1 is a pure flow reward: it sums what happened along the way and carries no term for the value of the world it left behind, so two paths with the same flow score the same however differently they end.',
    evidence,
  };
}

/** Classify the tie in one counterfactual result. Returns null when unique. */
export function classifyTie(counterfactuals) {
  if (!counterfactuals.exactTie) return null;
  const tied = counterfactuals.branches.filter((branch) => branch.totalScalar === counterfactuals.optimalScalar);
  return classifyTiedGroup(tied);
}

/**
 * Aggregate a taxonomy over many cases, sliced the ways the brief asks for:
 * by class, by family, by level, by action type.
 */
export function buildTieTaxonomy(cases) {
  const byClass = Object.fromEntries(TIE_CLASSES.map((name) => [name, 0]));
  const byFamily = {};
  const byLevel = {};
  const byActionType = {};
  let tiedCases = 0;
  const samples = {};

  for (const entry of cases) {
    const { family, level, counterfactuals } = entry;
    byFamily[family] ??= { cases: 0, tied: 0, classes: {} };
    byLevel[level] ??= { cases: 0, tied: 0, classes: {} };
    byFamily[family].cases += 1;
    byLevel[level].cases += 1;

    const classification = classifyTie(counterfactuals);
    if (classification === null) continue;

    tiedCases += 1;
    byClass[classification.class] += 1;
    byFamily[family].tied += 1;
    byLevel[level].tied += 1;
    byFamily[family].classes[classification.class] = (byFamily[family].classes[classification.class] ?? 0) + 1;
    byLevel[level].classes[classification.class] = (byLevel[level].classes[classification.class] ?? 0) + 1;
    for (const actionType of classification.evidence.actionTypes) {
      byActionType[actionType] ??= { tiedGroupsContainingIt: 0, classes: {} };
      byActionType[actionType].tiedGroupsContainingIt += 1;
      byActionType[actionType].classes[classification.class] = (byActionType[actionType].classes[classification.class] ?? 0) + 1;
    }
    samples[classification.class] ??= { family, level, ...classification };
  }

  const defectCases = TIE_CLASSES_INDICATING_REWARD_DEFECT.reduce((total, name) => total + byClass[name], 0);
  return {
    taxonomyVersion: FORGE_SUPERVISION_VERSION,
    totalCases: cases.length,
    tiedCases,
    tieRate: cases.length === 0 ? 0 : Math.round((tiedCases * 10000) / cases.length) / 10000,
    byClass,
    byFamily,
    byLevel,
    byActionType,
    samples,
    rewardDefectCases: defectCases,
    rewardDefectRate: tiedCases === 0 ? 0 : Math.round((defectCases * 10000) / tiedCases) / 10000,
    genuineEquivalenceCases: byClass.GENUINE_STRATEGIC_EQUIVALENCE + byClass.SYMMETRIC_ACTIONS,
    horizonAliasingCases: byClass.HORIZON_ALIASING,
    complete: tiedCases === Object.values(byClass).reduce((a, b) => a + b, 0),
    note: 'Only ACCIDENTAL_REWARD_COLLAPSE and INSUFFICIENT_REWARD_RESOLUTION are reward defects. The rest are properties of the world and must survive any reward change.',
  };
}

/* ---------------------------------------------------------------------------
 * Pareto analysis (Phase 4)
 *
 * Run BEFORE scalar tie-breaking. Two actions with the same scalar may be
 * identical in vector space, or may be incomparable — one better on safety, the
 * other better on cost. Calling the second "wrong" because a chosen weighting
 * prefers its rival is a decision about the weighting, and it has to be recorded
 * as one rather than presented as world truth.
 * ------------------------------------------------------------------------- */

export const PARETO_RELATIONS = Object.freeze(['PARETO_DOMINATED', 'PARETO_EQUIVALENT', 'PARETO_INCOMPARABLE', 'PARETO_DOMINATING']);

/* Cost components are better when smaller. Comparing them in the raw direction
 * would call a cheaper action worse. Both reward vocabularies are listed, because
 * this function is handed vectors from either. */
const COST_COMPONENTS = new Set([
  'resourceCost', 'riskExposure', 'timeCost',
  'illegalActionPenalty', 'terminalFailure',
]);

function orientedValue(id, value) {
  return COST_COMPONENTS.has(id) ? -value : value;
}

export function paretoCompare(a, b) {
  let better = 0;
  let worse = 0;
  /* The union of both vectors' own keys, so a component present in one and absent
   * from the other still counts rather than being invisible. */
  for (const id of [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort()) {
    const left = orientedValue(id, a[id] ?? 0);
    const right = orientedValue(id, b[id] ?? 0);
    if (left > right) better += 1;
    else if (left < right) worse += 1;
  }
  if (better === 0 && worse === 0) return 'PARETO_EQUIVALENT';
  if (better > 0 && worse === 0) return 'PARETO_DOMINATING';
  if (worse > 0 && better === 0) return 'PARETO_DOMINATED';
  return 'PARETO_INCOMPARABLE';
}

/** Pareto structure of one tied group. */
export function analysePareto(counterfactuals) {
  const tied = counterfactuals.branches.filter((branch) => branch.totalScalar === counterfactuals.optimalScalar);
  if (tied.length < 2) {
    return { tied: false, groupSize: tied.length, relations: {}, vectorIdentical: null, scalarizationCollapse: false };
  }
  const relations = Object.fromEntries(PARETO_RELATIONS.map((name) => [name, 0]));
  let incomparablePairs = 0;
  for (let i = 0; i < tied.length; i += 1) {
    for (let j = i + 1; j < tied.length; j += 1) {
      const relation = paretoCompare(tied[i].totalRewardVector, tied[j].totalRewardVector);
      relations[relation] += 1;
      if (relation === 'PARETO_INCOMPARABLE') incomparablePairs += 1;
    }
  }
  const vectorIdentical = relations.PARETO_EQUIVALENT === (tied.length * (tied.length - 1)) / 2;
  return {
    tied: true,
    groupSize: tied.length,
    relations,
    vectorIdentical,
    /* Scalar-equal but vector-different is exactly the loss the scalarization
     * introduced. It is the measurable form of "collapse". */
    scalarizationCollapse: !vectorIdentical,
    incomparablePairs,
    /* A genuine multi-objective tradeoff: neither action dominates, so preferring
     * one is a statement about weights, not about the world. */
    paretoTradeoff: incomparablePairs > 0,
  };
}

/* ---------------------------------------------------------------------------
 * Supervision classes (Phase 5)
 *
 * Thresholds are declared HERE, before generation, so a class boundary cannot be
 * quietly moved afterwards to make a yield target look met.
 * ------------------------------------------------------------------------- */

export const SUPERVISION_CLASSES = Object.freeze([
  'UNIQUE_OPTIMUM',
  'NEAR_TIE',
  'EXACT_EQUIVALENCE',
  'PARETO_TRADEOFF',
  'INSUFFICIENTLY_RESOLVED',
]);

/* Predeclared, in the integer units the reward is measured in. */
export const NEAR_TIE_MARGIN = 3;          // gap to the runner-up, below which a win is "near".
export const PREFERENCE_MINIMUM_GAP = 5;   // a preference pair needs a gap a model can learn.

export const SUPERVISION_EXPORT_ELIGIBILITY = Object.freeze({
  UNIQUE_OPTIMUM: { sft: true, preference: true, rl: true },
  NEAR_TIE: { sft: false, preference: 'IF_GAP_AT_LEAST_PREFERENCE_MINIMUM_GAP', rl: true },
  EXACT_EQUIVALENCE: { sft: 'AS_AN_EXPLICIT_SET_OF_EQUAL_OPTIMA', preference: false, rl: true },
  PARETO_TRADEOFF: { sft: false, preference: false, rl: true },
  INSUFFICIENTLY_RESOLVED: { sft: false, preference: false, rl: true },
});

/**
 * Assign one case to exactly one supervision class.
 *
 * Order matters and is deliberate: a genuinely equivalent case must never fall
 * through into INSUFFICIENTLY_RESOLVED, because that would count a property of
 * the world as a defect of the reward and inflate the apparent need to change it.
 */
export function classifySupervision(counterfactuals) {
  const branches = counterfactuals.branches;
  if (branches.length < 2) {
    return { supervisionClass: 'EXACT_EQUIVALENCE', reason: 'fewer than two legal actions, so there is nothing to choose between', margin: 0, tieClass: null, pareto: null };
  }

  const pareto = analysePareto(counterfactuals);

  if (!counterfactuals.exactTie) {
    const sorted = [...branches].sort((a, b) => b.totalScalar - a.totalScalar);
    const margin = sorted[0].totalScalar - sorted[1].totalScalar;
    return margin >= NEAR_TIE_MARGIN
      ? { supervisionClass: 'UNIQUE_OPTIMUM', reason: `a single optimum clear of the runner-up by ${margin}`, margin, tieClass: null, pareto }
      : { supervisionClass: 'NEAR_TIE', reason: `a single optimum but only ${margin} clear of the runner-up`, margin, tieClass: null, pareto };
  }

  const tieClass = classifyTie(counterfactuals);
  if (tieClass.class === 'GENUINE_STRATEGIC_EQUIVALENCE' || tieClass.class === 'SYMMETRIC_ACTIONS') {
    return { supervisionClass: 'EXACT_EQUIVALENCE', reason: tieClass.why, margin: 0, tieClass: tieClass.class, pareto };
  }
  if (pareto.paretoTradeoff) {
    return { supervisionClass: 'PARETO_TRADEOFF', reason: 'the tied actions are Pareto-incomparable: preferring one is a statement about weights, not about the world', margin: 0, tieClass: tieClass.class, pareto };
  }
  if (tieClass.class === 'HORIZON_ALIASING') {
    return { supervisionClass: 'EXACT_EQUIVALENCE', reason: tieClass.why, margin: 0, tieClass: tieClass.class, pareto };
  }
  return { supervisionClass: 'INSUFFICIENTLY_RESOLVED', reason: tieClass.why, margin: 0, tieClass: tieClass.class, pareto };
}

export function summariseSupervision(classifications) {
  const counts = Object.fromEntries(SUPERVISION_CLASSES.map((name) => [name, 0]));
  for (const entry of classifications) counts[entry.supervisionClass] += 1;
  const total = classifications.length;
  return {
    supervisionVersion: FORGE_SUPERVISION_VERSION,
    total,
    counts,
    uniqueOptimumRate: total === 0 ? 0 : Math.round((counts.UNIQUE_OPTIMUM * 10000) / total) / 10000,
    denseSupervisionRate: total === 0 ? 0
      : Math.round(((counts.UNIQUE_OPTIMUM + counts.NEAR_TIE) * 10000) / total) / 10000,
    thresholds: { NEAR_TIE_MARGIN, PREFERENCE_MINIMUM_GAP },
    eligibility: SUPERVISION_EXPORT_ELIGIBILITY,
    digest: sha256(counts),
  };
}
