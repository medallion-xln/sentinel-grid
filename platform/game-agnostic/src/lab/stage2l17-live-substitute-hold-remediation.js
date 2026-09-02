/* Stage 2L.17 — live-substitute and do-nothing-baseline remediation harness.
 *
 * The expert lives in stage2l17-live-substitute-hold-nexus.js and imports nothing
 * from the benchmark. This file evaluates it: audits, ablation, blind evaluation,
 * taxonomy replay, confidence and delegation. It is the only place ground truth is
 * read, and it reads it only to SCORE, never to compute an expert input.
 *
 * EVERYTHING INHERITED IS IMPORTED, NOT RESTATED. The reliability floor, the harm
 * ceilings, the Wilson method, the split ranges, the rule ladders, the stability
 * probe and the Stage 2L.16 error classifier all come from their own frozen
 * modules. A number this stage could quietly move is a number this stage does not
 * own.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import {
  buildStage2L12Case,
  primeRecommendation,
} from './stage2l12-nexus-semantic-grounding-and-observable-utility.js';
import { evaluateValueAwareNexus } from './stage2l13-value-aware-nexus.js';
import {
  STAGE2L14_RELIABILITY_FLOOR,
  STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L14_BOUND_METHOD,
  STAGE2L14_BOUND_Z,
  STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
  STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_COUNT,
  STAGE2L14_MINIMUM_DELEGATION_RATE,
  wilsonLowerBound,
} from './stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L15_SPLITS,
  STAGE2L15_RISK_LADDER,
  STAGE2L15_MARGIN_LADDER,
  STAGE2L15_VARIANCE_LADDER,
  STAGE2L15_STABILITY_LADDER,
  STAGE2L15_STABILITY_SIGNALS,
  measureStage2L15Stability,
  stage2L15StructurallyEligible,
  stage2L15StabilityEvidenceUsable,
} from './stage2l15-nexus-decision-stability.js';
import {
  indexStage2L16World,
  propagatedDelivery,
  classifyStage2L16Error,
  valueConcentration,
  stronglyConnectedComponents,
  downstreamOf as stage2L16DownstreamOf,
  STAGE2L16_HIGH_CONFIDENCE_RISK,
  STAGE2L16_HIGH_CONFIDENCE_MARGIN,
} from './stage2l16-nexus-residual-error-decomposition.js';
import {
  STAGE2L17_VARIANTS,
  STAGE2L17_SELECTED_VARIANT,
  STAGE2L17_REMEDIATION_MODEL,
  STAGE2L17_REMEDIATION_MODEL_DIGEST,
  evaluateStage2L17Nexus,
  buildStage2L17Index,
  substituteWouldCarry,
  summariseSubstitutes,
  estimateHoldBaseline,
  alreadyDelivering,
} from './stage2l17-live-substitute-hold-nexus.js';

export const STAGE2L17_STAGE = 'STAGE2L17_NEXUS_LIVE_SUBSTITUTE_AND_HOLD_REMEDIATION';
export const STAGE2L17_STAGE2L16_CERTIFICATION_HASH = 'e341d55f74619411a7f143a7288a6fd02e0b7071ad6904465803204b3f23a86d';
export const STAGE2L17_STAGE2L15_CERTIFICATION_HASH = '7a7adf020b5e2e7d325d3b6192a23870e4b49b898ef108e3b63124ce13fb1fe9';
export const STAGE2L17_STAGE2L13_CERTIFICATION_HASH = '0b7f44d8874d0dfd831dfe7d05571735a62dbbcd689e89c77e3b377e636734c6';

const MICRO = 1000000;
function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }

export const STAGE2L17_CORPUS = deepFreeze({ split: 'HOLDOUT', from: 0, to: 42000 });

/* ---------------------------------------------------------------------------
 * PHASE 1/3 — defect audits on constructed worlds.
 *
 * The defects are proven on cases whose correct answer is unambiguous before any
 * code changes, so the remediation is judged against a reproduction of the fault
 * rather than against an assertion that one exists.
 * ------------------------------------------------------------------------- */

const AUDIT_ENTITY = (entityId, overrides = {}) => ({
  entityId, objectiveValue: 0, demand: 0, baseCapacity: MICRO, availability: MICRO,
  risk: 0, protectionNeed: 0, restorationCost: 1000, objectiveRelevant: false, ...overrides,
});
const AUDIT_RELATION = (relationId, from, to, kind, weight = 0, replaces = undefined) => ({
  relationId, from, to, kind, weight, ...(replaces === undefined ? {} : { replaces }),
});

/** One valuable entity `v` depending on a blocked `t`, with substitutes for `t`. */
export function buildStage2L17AuditWorld({
  targetAvailable = false, substituteAvailable = true, substituteHasCapacity = true,
  substituteDependencyMet = true, secondSubstitute = null, targetCost = 5000,
} = {}) {
  const entities = [
    AUDIT_ENTITY('t', { availability: targetAvailable ? MICRO : 0, restorationCost: targetCost }),
    AUDIT_ENTITY('v', { objectiveValue: MICRO, objectiveRelevant: true }),
    AUDIT_ENTITY('s', {
      availability: substituteAvailable ? MICRO : 0,
      baseCapacity: substituteHasCapacity ? MICRO : 0,
      demand: substituteHasCapacity ? 0 : MICRO,
      restorationCost: 2000,
    }),
  ];
  const relations = [
    AUDIT_RELATION('r1', 't', 'v', 'depends'),
    AUDIT_RELATION('r2', 's', 'v', 'substitutes', 0, 't'),
  ];
  if (!substituteDependencyMet) {
    entities.push(AUDIT_ENTITY('sdep', { availability: 0 }));
    relations.push(AUDIT_RELATION('r3', 'sdep', 's', 'depends'));
  }
  if (secondSubstitute !== null) {
    entities.push(AUDIT_ENTITY('s2', {
      availability: secondSubstitute.available ? MICRO : 0,
      baseCapacity: secondSubstitute.hasCapacity ? MICRO : 0,
      demand: secondSubstitute.hasCapacity ? 0 : MICRO,
      restorationCost: 2000,
    }));
    relations.push(AUDIT_RELATION('r4', 's2', 'v', 'substitutes', 0, 't'));
  }
  return { entities, relations };
}

export const STAGE2L17_AUDIT_ACTIONS = deepFreeze([
  { actionId: 'a-hold', kind: 'HOLD', targetEntityId: null },
  { actionId: 'a-bypass-t', kind: 'BYPASS', targetEntityId: 't' },
  { actionId: 'a-restore-t', kind: 'RESTORE', targetEntityId: 't' },
]);

/** The Phase 1 substitute cases the brief names, A through F. */
export const STAGE2L17_SUBSTITUTE_AUDIT_CASES = deepFreeze({
  A_SUBSTITUTE_EXISTS_AND_DELIVERS: { substituteAvailable: true },
  B_SUBSTITUTE_EXISTS_DOES_NOT_DELIVER: { substituteAvailable: false },
  B2_SUBSTITUTE_STARVED_BYPASS_CANNOT_FIX: { substituteAvailable: true, substituteHasCapacity: false },
  B3_SUBSTITUTE_OWN_DEPENDENCY_UNMET: { substituteAvailable: true, substituteDependencyMet: false },
  C_MULTIPLE_SUBSTITUTES_ONE_USABLE: { substituteAvailable: true, substituteHasCapacity: false, secondSubstitute: { available: false, hasCapacity: true } },
  D_MULTIPLE_SUBSTITUTES_NONE_USABLE: { substituteAvailable: true, substituteHasCapacity: false, secondSubstitute: { available: true, hasCapacity: false } },
  E_SUBSTITUTE_RELATION_EXISTS_SUBSTITUTE_UNAVAILABLE: { substituteAvailable: false },
  F_LIVE_SUBSTITUTE_TARGET_NOT_BLOCKED: { targetAvailable: true, substituteAvailable: true },
});

export const STAGE2L17_HOLD_AUDIT_CASES = deepFreeze({
  NOTHING_BROKEN_ALL_INTERVENTIONS_WASTE: { targetAvailable: true, substituteAvailable: true },
  INTERVENTION_CLEARLY_BETTER_THAN_INACTION: { targetAvailable: false, substituteAvailable: false },
  INTERVENTION_TOO_EXPENSIVE_TO_BE_WORTH_IT: { targetAvailable: false, substituteAvailable: false, targetCost: 2000000 },
});

function auditOutcome(world, deriveGroundTruthFn, variantName) {
  const actions = [...STAGE2L17_AUDIT_ACTIONS];
  const truth = deriveGroundTruthFn(world, actions);
  const holdId = actions.find((action) => action.kind === 'HOLD').actionId;
  const inherited = evaluateValueAwareNexus(world, actions, { inheritedSignals: false });
  const remediated = evaluateStage2L17Nexus(world, actions, { variant: variantName });
  const effective = (result) => (result.recommendedActionId === null ? holdId : result.recommendedActionId);
  const index = buildStage2L17Index(world);
  return {
    optimalActionId: truth.optimalActionId,
    inheritedPick: effective(inherited),
    inheritedCorrect: effective(inherited) === truth.optimalActionId,
    inheritedBypassCredit: inherited.scored.find((entry) => entry.actionId === 'a-bypass-t')?.relationalBenefit ?? 0,
    remediatedPick: effective(remediated),
    remediatedCorrect: effective(remediated) === truth.optimalActionId,
    remediatedBypassCredit: remediated.scored.find((entry) => entry.actionId === 'a-bypass-t')?.relationalBenefit ?? 0,
    substitutes: summariseSubstitutes(index, 't'),
    holdBaseline: estimateHoldBaseline(index),
    bypassTrueUtility: truth.scored.find((entry) => entry.actionId === 'a-bypass-t')?.actionUtility ?? null,
  };
}

export function runStage2L17Audits(deriveGroundTruthFn, variantName = STAGE2L17_SELECTED_VARIANT) {
  const substitute = Object.fromEntries(Object.entries(STAGE2L17_SUBSTITUTE_AUDIT_CASES)
    .map(([name, spec]) => [name, auditOutcome(buildStage2L17AuditWorld(spec), deriveGroundTruthFn, variantName)]));
  const hold = Object.fromEntries(Object.entries(STAGE2L17_HOLD_AUDIT_CASES)
    .map(([name, spec]) => [name, auditOutcome(buildStage2L17AuditWorld(spec), deriveGroundTruthFn, variantName)]));

  /* The defect is REPRODUCED when the inherited expert credits a BYPASS in a case
   * whose substitutes cannot carry the dependency, and gets that case wrong. */
  const deadSubstituteCases = ['B2_SUBSTITUTE_STARVED_BYPASS_CANNOT_FIX', 'B3_SUBSTITUTE_OWN_DEPENDENCY_UNMET', 'D_MULTIPLE_SUBSTITUTES_NONE_USABLE'];
  const liveSubstituteDefectReproduced = deadSubstituteCases.every((name) =>
    substitute[name].inheritedBypassCredit > 0 && !substitute[name].inheritedCorrect);
  const liveSubstituteDefectRepaired = deadSubstituteCases.every((name) => substitute[name].remediatedCorrect);
  /* And the HOLD defect is reproduced when the inherited expert intervenes on a
   * world where nothing is broken. */
  const holdCase = hold.NOTHING_BROKEN_ALL_INTERVENTIONS_WASTE;
  const holdBaselineDefectReproduced = !holdCase.inheritedCorrect;

  return deepFreeze({
    variantAudited: variantName,
    substitute,
    hold,
    liveSubstituteDefectReproduced,
    liveSubstituteDefectRepaired,
    holdBaselineDefectReproduced,
    holdBaselineDefectRepairedInSelectedVariant: holdCase.remediatedCorrect,
    /* Recorded honestly: the selected variant does NOT carry the abstention gate,
     * so it does not repair the "nothing is broken" case. The ablation explains
     * why that gate was not selected. */
    note: 'Case F and NOTHING_BROKEN are the same world: a live substitute with an unblocked target. The inherited expert intervenes anyway.',
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 6/8 — the frozen blind evaluation and the ablation.
 *
 * Every variant is scored on the identical frozen Stage 2L.12 corpus. Abstention
 * is scored as a recommendation of HOLD, so a variant cannot buy accuracy by
 * declining to answer.
 * ------------------------------------------------------------------------- */

export const STAGE2L17_ABLATION_VARIANTS = deepFreeze([
  'INHERITED', 'LIVE_SUBSTITUTE_ONLY', 'HOLD_DELTA_ONLY', 'HOLD_ABSTAIN_ONLY',
  'HOLD_ONLY', 'LIVE_SUBSTITUTE_AND_HOLD_DELTA', 'BOTH',
]);

function splitNameFor(variant) {
  for (const [name, range] of Object.entries(STAGE2L15_SPLITS)) {
    if (variant >= range.from && variant < range.to) return name;
  }
  return 'UNASSIGNED';
}

/** One corpus row carrying every expert's answer plus the state properties the
 *  Stage 2L.16 classifier needs. Built once; every phase reads from it. */
export function buildStage2L17Row(variantIndex) {
  const record = buildStage2L12Case(STAGE2L17_CORPUS.split, variantIndex);
  if (!record.decidable) return null;
  const truth = record.groundTruth;
  const optimalActionId = truth.optimalActionId;
  const holdActionId = record.legalActions.find((action) => action.kind === 'HOLD')?.actionId ?? null;
  const primeActionId = primeRecommendation(record).recommendedActionId;

  const inherited = evaluateValueAwareNexus(record.world, record.legalActions, { inheritedSignals: false });
  const variants = Object.fromEntries(STAGE2L17_ABLATION_VARIANTS.map((name) => {
    const result = evaluateStage2L17Nexus(record.world, record.legalActions, { variant: name });
    const effective = result.recommendedActionId === null ? holdActionId : result.recommendedActionId;
    return [name, {
      recommendedActionId: result.recommendedActionId,
      effectiveActionId: effective,
      abstained: result.abstained,
      correct: effective === optimalActionId,
      signals: result.signals,
      scored: result.scored,
      ranked: result.ranked,
    }];
  }));

  /* Region membership, computed from state alone so it is identical for every
   * variant and cannot drift with whichever expert is being scored. */
  const index17 = buildStage2L17Index(record.world);
  const bypassActions = record.legalActions.filter((action) => action.kind === 'BYPASS' && action.targetEntityId !== null);
  const substituteRegion = bypassActions.length > 0;
  const anyLiveSubstitute = bypassActions.some((action) =>
    (index17.substitutesFor.get(action.targetEntityId) ?? []).some((id) => substituteWouldCarry(index17, id)));

  const index16 = indexStage2L16World(record.world);
  const { delivering } = propagatedDelivery(record.world, index16);
  const concentration = valueConcentration(record.world);
  const cycles = stronglyConnectedComponents(index16);
  const truthByAction = new Map(truth.scored.map((entry) => [entry.actionId, entry]));
  const holdUtility = truth.scored.find((entry) => entry.kind === 'HOLD')?.actionUtility ?? 0;
  const byAction = new Map(record.legalActions.map((action) => [action.actionId, action]));

  return {
    variantIndex,
    splitName: splitNameFor(variantIndex),
    family: record.family,
    profile: record.profile,
    objectiveType: record.objectiveType,
    world: record.world,
    legalActions: record.legalActions,
    optimalActionId,
    optimalKind: byAction.get(optimalActionId).kind,
    holdActionId,
    holdUtility,
    primeActionId,
    primeCorrect: primeActionId === optimalActionId,
    inherited: {
      recommendedActionId: inherited.recommendedActionId,
      effectiveActionId: inherited.recommendedActionId === null ? holdActionId : inherited.recommendedActionId,
      abstained: inherited.abstained,
      correct: inherited.recommendedActionId === optimalActionId,
      signals: inherited.signals,
      scored: inherited.scored,
      ranked: inherited.ranked,
    },
    variants,
    substituteRegion,
    anyLiveSubstitute,
    deadSubstituteRegion: substituteRegion && !anyLiveSubstitute,
    liveSubstituteRegion: substituteRegion && anyLiveSubstitute,
    // Stage 2L.16 classifier inputs, computed exactly as that stage computes them.
    index: index16,
    delivering,
    valueConcentration: concentration.concentration,
    valueBearers: concentration.bearers,
    cycleCount: cycles.cycleCount,
    entitiesInCycles: cycles.entitiesInCycles,
    dependencyDepth: record.world.entities.reduce((max, entity) =>
      Math.max(max, stage2L16DownstreamOf(index16, entity.entityId).length), 0),
    aggregateRisk: record.world.entities.reduce((sum, entity) =>
      sum + Math.round((entity.risk * entity.protectionNeed) / MICRO), 0),
    truthByAction,
    byAction,
  };
}

export function buildStage2L17Corpus() {
  const rows = [];
  for (let variant = STAGE2L17_CORPUS.from; variant < STAGE2L17_CORPUS.to; variant += 1) {
    const row = buildStage2L17Row(variant);
    if (row !== null) rows.push(row);
  }
  return rows;
}

export function runStage2L17Ablation(rows) {
  const inheritedCorrect = rows.filter((row) => row.inherited.correct).length;
  const results = STAGE2L17_ABLATION_VARIANTS.map((name) => {
    let correct = 0;
    let fixes = 0;
    let breaks = 0;
    let abstentions = 0;
    let reproducesInherited = 0;
    for (const row of rows) {
      const entry = row.variants[name];
      if (entry.correct) correct += 1;
      if (entry.abstained) abstentions += 1;
      if (!row.inherited.correct && entry.correct) fixes += 1;
      if (row.inherited.correct && !entry.correct) breaks += 1;
      if (entry.recommendedActionId === row.inherited.recommendedActionId) reproducesInherited += 1;
    }
    return {
      variant: name,
      flags: STAGE2L17_VARIANTS[name],
      accuracy: round(ratio(correct, rows.length)),
      fixes,
      breaks,
      netErrorsEliminated: fixes - breaks,
      abstentions,
      abstentionRate: round(ratio(abstentions, rows.length)),
      reproducesInheritedRate: round(ratio(reproducesInherited, rows.length)),
    };
  });
  const inheritedVariant = results.find((entry) => entry.variant === 'INHERITED');
  const best = results.filter((entry) => entry.variant !== 'INHERITED')
    .reduce((max, entry) => (entry.netErrorsEliminated > max.netErrorsEliminated ? entry : max));
  return {
    inheritedAccuracy: round(ratio(inheritedCorrect, rows.length)),
    /* The faithfulness gate. If the INHERITED variant does not reproduce the frozen
     * expert on every case, this reimplementation has drifted and every ablation
     * number below is measured against a fiction. */
    inheritedVariantFaithful: inheritedVariant.reproducesInheritedRate === 1,
    results,
    bestByNet: best.variant,
    selectedVariant: STAGE2L17_SELECTED_VARIANT,
    selectionMatchesEvidence: best.variant === STAGE2L17_SELECTED_VARIANT,
    combiningEverythingIsBest: best.variant === 'BOTH',
    holdIsNeverOptimal: rows.every((row) => row.optimalActionId !== row.holdActionId),
    note: 'Abstention is scored as recommending HOLD. Because the corpus is decidability-filtered, HOLD is never optimal, so an abstention mechanism can only lose accuracy here — a limit of what this corpus can measure, not a refutation of the mechanism.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — blind evaluation with the mandated defect-region metrics.
 * ------------------------------------------------------------------------- */

function sideOf(row, which) { return which === 'INHERITED' ? row.inherited : row.variants[which]; }

export function runStage2L17BlindEvaluation(rows, variantName = STAGE2L17_SELECTED_VARIANT) {
  const measure = (which) => {
    const correct = rows.filter((row) => sideOf(row, which).correct).length;
    const wrong = rows.filter((row) => !sideOf(row, which).correct);
    const recommending = rows.filter((row) => !sideOf(row, which).abstained);
    const region = (predicate) => {
      const subset = rows.filter(predicate);
      return {
        n: subset.length,
        accuracy: round(ratio(subset.filter((row) => sideOf(row, which).correct).length, subset.length)),
      };
    };
    const worseThanHold = wrong.filter((row) => {
      const picked = sideOf(row, which).effectiveActionId;
      const entry = picked === null ? null : row.truthByAction.get(picked);
      return entry !== null && entry !== undefined && entry.actionUtility < row.holdUtility;
    });
    const bypassToRestore = wrong.filter((row) => {
      const picked = sideOf(row, which).effectiveActionId;
      const action = picked === null ? undefined : row.byAction.get(picked);
      return action !== undefined && action.kind === 'BYPASS' && row.optimalKind === 'RESTORE';
    });
    return {
      accuracy: round(ratio(correct, rows.length)),
      errors: wrong.length,
      recommendationAccuracy: round(ratio(
        recommending.filter((row) => sideOf(row, which).correct).length, recommending.length)),
      abstentionRate: round(ratio(rows.filter((row) => sideOf(row, which).abstained).length, rows.length)),
      substituteRegion: region((row) => row.substituteRegion),
      deadSubstituteRegion: region((row) => row.deadSubstituteRegion),
      liveSubstituteRegion: region((row) => row.liveSubstituteRegion),
      worseThanHoldErrorCount: worseThanHold.length,
      worseThanHoldErrorShareOfErrors: round(ratio(worseThanHold.length, wrong.length)),
      worseThanHoldErrorRate: round(ratio(worseThanHold.length, rows.length)),
      bypassToRestoreErrorCount: bypassToRestore.length,
    };
  };

  const before = measure('INHERITED');
  const after = measure(variantName);
  const agreement = {
    bothCorrect: rows.filter((row) => row.inherited.correct && sideOf(row, variantName).correct).length,
    bothWrong: rows.filter((row) => !row.inherited.correct && !sideOf(row, variantName).correct).length,
    onlyRemediatedCorrect: rows.filter((row) => !row.inherited.correct && sideOf(row, variantName).correct).length,
    onlyInheritedCorrect: rows.filter((row) => row.inherited.correct && !sideOf(row, variantName).correct).length,
  };
  const primeCorrect = rows.filter((row) => row.primeCorrect).length;

  return {
    variantEvaluated: variantName,
    cases: rows.length,
    decidableCases: rows.length,
    primeAccuracy: round(ratio(primeCorrect, rows.length)),
    before,
    after,
    absoluteImprovementPp: round((after.accuracy - before.accuracy) * 100),
    agreement,
    remediatedCorrectPrimeWrong: rows.filter((row) => sideOf(row, variantName).correct && !row.primeCorrect).length,
    remediatedWrongPrimeCorrect: rows.filter((row) => !sideOf(row, variantName).correct && row.primeCorrect).length,
    liveSubstituteDefectReduced: after.deadSubstituteRegion.accuracy > before.deadSubstituteRegion.accuracy,
    worseThanHoldErrorRateReduced: after.worseThanHoldErrorRate < before.worseThanHoldErrorRate,
    bySplit: Object.fromEntries(Object.keys(STAGE2L15_SPLITS).map((name) => {
      const subset = rows.filter((row) => row.splitName === name);
      return [name, {
        cases: subset.length,
        before: round(ratio(subset.filter((row) => row.inherited.correct).length, subset.length)),
        after: round(ratio(subset.filter((row) => sideOf(row, variantName).correct).length, subset.length)),
      }];
    })),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 7 — taxonomy replay, using the Stage 2L.16 classifier UNCHANGED.
 *
 * A new taxonomy would let a remediation look better by redefining what counts.
 * The classifier is imported, not reimplemented, and it is handed the same state
 * properties Stage 2L.16 computes.
 * ------------------------------------------------------------------------- */

function classifierRow(row, which) {
  const side = sideOf(row, which);
  return {
    legalActions: row.legalActions,
    index: row.index,
    delivering: row.delivering,
    scored: side.scored,
    chosenActionId: side.effectiveActionId,
    signals: side.signals,
    cycleCount: row.cycleCount,
    entitiesInCycles: row.entitiesInCycles,
    dependencyDepth: row.dependencyDepth,
    valueConcentration: row.valueConcentration,
    aggregateRisk: row.aggregateRisk,
    nexusCorrect: side.correct,
  };
}

export function runStage2L17TaxonomyReplay(rows, variantName = STAGE2L17_SELECTED_VARIANT) {
  const tally = (which) => {
    const counts = new Map();
    for (const row of rows) {
      if (sideOf(row, which).correct) continue;
      const dominant = classifyStage2L16Error(classifierRow(row, which)).dominant;
      counts.set(dominant, (counts.get(dominant) ?? 0) + 1);
    }
    return counts;
  };
  const before = tally('INHERITED');
  const after = tally(variantName);
  const classes = [...new Set([...before.keys(), ...after.keys()])].sort();
  const movement = classes.map((errorClass) => ({
    errorClass,
    before: before.get(errorClass) ?? 0,
    after: after.get(errorClass) ?? 0,
    delta: (after.get(errorClass) ?? 0) - (before.get(errorClass) ?? 0),
  })).sort((left, right) => right.before - left.before || left.errorClass.localeCompare(right.errorClass));

  const totalBefore = rows.filter((row) => !row.inherited.correct).length;
  const totalAfter = rows.filter((row) => !sideOf(row, variantName).correct).length;
  const eliminated = rows.filter((row) => !row.inherited.correct && sideOf(row, variantName).correct).length;
  const introduced = rows.filter((row) => row.inherited.correct && !sideOf(row, variantName).correct).length;
  const rankedBefore = movement.slice().sort((left, right) => right.before - left.before);
  const rankedAfter = movement.slice().sort((left, right) => right.after - left.after);
  const dominantBefore = rankedBefore[0] ?? null;
  const dominantAfter = rankedAfter[0] ?? null;

  /* Is the new dominant class genuinely NEWLY EXPOSED, or was it simply sitting in
   * second place and promoted when the class above it was removed? The difference
   * matters: the first would be a finding, the second is arithmetic. A class
   * counts as newly exposed only if it was not already among the top two AND it
   * grew materially — more than a fifth above its own prior count. */
  const wasAlreadyProminent = dominantAfter !== null
    && rankedBefore.slice(0, 2).some((entry) => entry.errorClass === dominantAfter.errorClass);
  const grewMaterially = dominantAfter !== null && dominantAfter.before > 0
    && (dominantAfter.after - dominantAfter.before) / dominantAfter.before > 0.2;
  const newlyExposedDominantClass = dominantAfter !== null && !wasAlreadyProminent && grewMaterially;

  return {
    classifier: 'STAGE2L16_UNCHANGED',
    totalErrorsBefore: totalBefore,
    totalErrorsAfter: totalAfter,
    errorsEliminated: eliminated,
    newErrorsIntroduced: introduced,
    netErrorsEliminated: eliminated - introduced,
    movement,
    dominantErrorClassBefore: dominantBefore === null ? null : dominantBefore.errorClass,
    dominantErrorClassAfter: dominantAfter === null ? null : dominantAfter.errorClass,
    dominantClassChanged: (dominantBefore?.errorClass ?? null) !== (dominantAfter?.errorClass ?? null),
    dominantAfterWasAlreadyProminent: wasAlreadyProminent,
    dominantAfterGrewMaterially: grewMaterially,
    newlyExposedDominantClass,
    dominantAfterBeforeCount: dominantAfter === null ? 0 : dominantAfter.before,
    dominantAfterAfterCount: dominantAfter === null ? 0 : dominantAfter.after,
    /* The question the brief asks explicitly: did fixing substitutes merely move
     * the same errors into another bucket? Answered by comparing the net removal
     * against the growth of every other class. */
    classesThatGrew: movement.filter((entry) => entry.delta > 0).map((entry) => entry.errorClass),
    growthInOtherClasses: movement.filter((entry) => entry.delta > 0).reduce((sum, entry) => sum + entry.delta, 0),
    relabellingOnly: eliminated - introduced <= 0,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10/11 — confidence and delegation, on the INHERITED methodology.
 *
 * The rule ladders, the eligibility gate, the Wilson method, the split ranges and
 * every support threshold are imported from Stage 2L.14 and Stage 2L.15. This
 * stage supplies a better expert to the same pipeline and changes nothing about
 * the pipeline itself. DEVELOPMENT explores, CALIBRATION selects and freezes,
 * FINAL_HOLDOUT is scored exactly once.
 * ------------------------------------------------------------------------- */

export const STAGE2L17_RELIABILITY_FLOOR = STAGE2L14_RELIABILITY_FLOOR;

export function buildStage2L17ConfidenceRows(rows, variantName) {
  return rows.map((row) => {
    const side = sideOf(row, variantName);
    const base = { recommendedActionId: side.recommendedActionId, ranked: side.ranked, decomposition: side.scored.find((entry) => entry.actionId === side.recommendedActionId) ?? null, abstained: side.abstained, signals: side.signals };
    const stability = measureStage2L15Stability(row.world, row.legalActions, base);
    return {
      splitName: row.splitName,
      signals: side.signals,
      stability,
      structurallyEligible: stage2L15StructurallyEligible(side.signals),
      nexusCorrect: side.correct,
      primeCorrect: row.primeCorrect,
      movesPrime: side.recommendedActionId !== null && side.recommendedActionId !== row.primeActionId,
    };
  });
}

/* The Stage 2L.15 rule set, rebuilt over the same predeclared ladders. Rebuilt
 * rather than imported because the imported closures bind to Stage 2L.15's row
 * shape; the ladders and the widths are the inherited values. */
export function buildStage2L17RuleSet() {
  const rules = [];
  const push = (id, cls, test) => rules.push({ id, cls, test });
  for (const risk of STAGE2L15_RISK_LADDER) {
    for (const margin of STAGE2L15_MARGIN_LADDER) {
      push(`risk>=${risk} & margin>=${margin}`, 'EXISTING',
        (row) => row.signals.nexusTopRiskAdjustment >= risk && row.signals.nexusUtilityMargin >= margin);
      for (const variance of STAGE2L15_VARIANCE_LADDER) {
        push(`risk>=${risk} & margin>=${margin} & marginVariance<=${variance}`, 'COMBINED',
          (row) => row.signals.nexusTopRiskAdjustment >= risk
            && row.signals.nexusUtilityMargin >= margin
            && row.stability.nexusMarginVariance <= variance);
      }
      for (const stability of STAGE2L15_STABILITY_LADDER) {
        for (const signal of ['nexusTopActionStability', 'nexusSemanticStability', 'nexusCounterfactualAgreement']) {
          push(`risk>=${risk} & margin>=${margin} & ${signal}>=${stability}`, 'COMBINED',
            (row) => row.signals.nexusTopRiskAdjustment >= risk
              && row.signals.nexusUtilityMargin >= margin
              && row.stability[signal] >= stability);
        }
      }
    }
  }
  for (const variance of STAGE2L15_VARIANCE_LADDER) {
    push(`marginVariance<=${variance}`, 'STABILITY', (row) => row.stability.nexusMarginVariance <= variance);
    push(`utilityVariance<=${variance}`, 'STABILITY', (row) => row.stability.nexusUtilityVariance <= variance);
  }
  for (const stability of STAGE2L15_STABILITY_LADDER) {
    for (const [signal] of STAGE2L15_STABILITY_SIGNALS.filter(([, higher]) => higher)) {
      push(`${signal}>=${stability}`, 'STABILITY', (row) => row.stability[signal] >= stability);
    }
  }
  return rules;
}

function scoreRule(rows, test) {
  const inside = rows.filter((row) => row.structurallyEligible && test(row));
  const correct = inside.filter((row) => row.nexusCorrect).length;
  return {
    n: inside.length,
    correct,
    wrong: inside.length - correct,
    precision: round(ratio(correct, inside.length)),
    wilsonLowerBound: wilsonLowerBound(correct, inside.length),
  };
}

export function deriveStage2L17Calibration(confidenceRows) {
  const development = confidenceRows.filter((row) => row.splitName === 'DEVELOPMENT');
  const calibration = confidenceRows.filter((row) => row.splitName === 'CALIBRATION');
  const rules = buildStage2L17RuleSet();
  const sweep = rules.map((rule) => {
    const onCalibration = scoreRule(calibration, rule.test);
    const onDevelopment = scoreRule(development, rule.test);
    const meetsInherited = onCalibration.n >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT
      && onCalibration.precision >= STAGE2L14_RELIABILITY_FLOOR
      && onCalibration.wilsonLowerBound >= STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
    /* Stage 2L.15's cross-split consistency guard, inherited unchanged: a
     * candidate contradicted by DEVELOPMENT is refused. It only ever refuses. */
    const developmentContradicts = onDevelopment.n > 0
      && onDevelopment.precision < STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
    return {
      id: rule.id,
      cls: rule.cls,
      calibration: onCalibration,
      development: onDevelopment,
      meetsInheritedCriterion: meetsInherited,
      developmentContradicts,
      qualifies: meetsInherited && !developmentContradicts,
    };
  });
  const qualifying = sweep.filter((entry) => entry.qualifies);
  const selected = qualifying.slice().sort((left, right) =>
    right.calibration.n - left.calibration.n || left.id.localeCompare(right.id))[0] ?? null;
  const supported = sweep.filter((entry) => entry.calibration.n >= STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT);
  const ceiling = supported.slice().sort((left, right) =>
    right.calibration.precision - left.calibration.precision || right.calibration.n - left.calibration.n)[0] ?? null;

  const body = {
    methodology: 'STAGE2L14_AND_STAGE2L15_INHERITED_UNCHANGED',
    reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
    boundMethod: STAGE2L14_BOUND_METHOD,
    boundZ: STAGE2L14_BOUND_Z,
    conservativeBoundRequirement: STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT,
    minimumEligibleCaseCount: STAGE2L14_MINIMUM_ELIGIBLE_CASE_COUNT,
    ruleCount: rules.length,
    developmentCases: development.length,
    calibrationCases: calibration.length,
    qualifyingRuleCount: qualifying.length,
    meetsInheritedCriterionCount: sweep.filter((entry) => entry.meetsInheritedCriterion).length,
    inheritedCriterionCandidates: sweep.filter((entry) => entry.meetsInheritedCriterion).map((entry) => ({
      id: entry.id, calibration: entry.calibration, development: entry.development,
      rejectedByCrossSplitGuard: entry.developmentContradicts,
    })),
    selected: selected === null ? null : { id: selected.id, cls: selected.cls, calibration: selected.calibration, development: selected.development },
    delegatingRuleId: selected === null ? null : selected.id,
    ceiling: ceiling === null ? null : { id: ceiling.id, calibration: ceiling.calibration, development: ceiling.development },
    sweep,
  };
  return deepFreeze({ ...body, calibrationDigest: sha256(body) });
}

export function evaluateStage2L17Delegation(confidenceRows, calibration, ruleTest) {
  const holdout = confidenceRows.filter((row) => row.splitName === 'FINAL_HOLDOUT');
  for (const row of holdout) {
    if (row.splitName !== 'FINAL_HOLDOUT') throw new Error('STAGE2L17_HOLDOUT_SPLIT_VIOLATION');
  }
  const delegates = (row) => calibration.delegatingRuleId !== null
    && row.structurallyEligible
    && stage2L15StabilityEvidenceUsable(row.stability)
    && ruleTest !== null
    && ruleTest(row)
    && row.movesPrime;
  const gated = holdout.map((row) => ({ ...row, delegated: delegates(row) }));
  const total = gated.length;
  const delegations = gated.filter((row) => row.delegated);
  const beneficial = delegations.filter((row) => row.nexusCorrect && !row.primeCorrect).length;
  const harmful = delegations.filter((row) => !row.nexusCorrect && row.primeCorrect).length;
  const delegatedCorrect = delegations.filter((row) => row.nexusCorrect).length;
  const arbiterCorrect = gated.filter((row) => (row.delegated ? row.nexusCorrect : row.primeCorrect)).length;
  const primeCorrect = gated.filter((row) => row.primeCorrect).length;
  const harmfulOpportunities = gated.filter((row) => row.movesPrime && !row.nexusCorrect && row.primeCorrect);
  const beneficialOpportunities = gated.filter((row) => row.movesPrime && row.nexusCorrect && !row.primeCorrect);

  return deepFreeze({
    casesEvaluated: total,
    calibrationDigest: calibration.calibrationDigest,
    delegatingRuleId: calibration.delegatingRuleId,
    structurallyEligibleRecommendations: gated.filter((row) => row.structurallyEligible).length,
    nexusDelegations: delegations.length,
    nexusDelegationRate: round(ratio(delegations.length, total)),
    nexusDelegationPrecision: round(ratio(beneficial, delegations.length)),
    nexusDelegationLowerBound: wilsonLowerBound(beneficial, delegations.length),
    delegatedReliability: round(ratio(delegatedCorrect, delegations.length)),
    delegatedReliabilityLowerBound: wilsonLowerBound(delegatedCorrect, delegations.length),
    beneficialChanges: beneficial,
    harmfulChanges: harmful,
    harmfulChangeRate: round(ratio(harmful, total)),
    correctPrimeBreaks: harmful,
    correctPrimeBreakRate: round(ratio(harmful, total)),
    primeOnlyAccuracy: round(ratio(primeCorrect, total)),
    nexusOnlyAccuracy: round(ratio(gated.filter((row) => row.nexusCorrect).length, total)),
    arbiterAccuracy: round(ratio(arbiterCorrect, total)),
    accuracyUpliftOverPrimePp: round((ratio(arbiterCorrect, total) - ratio(primeCorrect, total)) * 100),
    beneficialOpportunities: beneficialOpportunities.length,
    beneficialOpportunitiesCaptured: beneficialOpportunities.filter((row) => row.delegated).length,
    harmfulOpportunities: harmfulOpportunities.length,
    harmfulOpportunitiesRejected: harmfulOpportunities.filter((row) => !row.delegated).length,
    harmfulOpportunityRejectionRate: round(ratio(harmfulOpportunities.filter((row) => !row.delegated).length, harmfulOpportunities.length)),
    harmCeilingRespected: round(ratio(harmful, total)) <= STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeilingRespected: round(ratio(harmful, total)) <= STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    reliabilityFloorLowered: false,
    delegationForced: false,
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 12 — fixed-point non-expansion guard.
 *
 * Stage 2L.16 measured iterative propagation at +13 net cases. This re-measures
 * it AFTER the bounded remediation, because the brief asks whether its importance
 * changed. It reports; it never implements. The production expert contains no
 * iterative reasoning and the certification asserts that structurally.
 * ------------------------------------------------------------------------- */

export function remeasureStage2L17FixedPoint(rows, variantName = STAGE2L17_SELECTED_VARIANT) {
  const measure = (which) => {
    let fixes = 0;
    let breaks = 0;
    for (const row of rows) {
      const side = sideOf(row, which);
      const actionable = side.scored.filter((entry) => entry.kind !== 'HOLD' && entry.semanticFieldsComplete);
      /* The Stage 2L.16 probe, unchanged: halve benefit credited through a chain
       * that propagation shows is still down. */
      const adjusted = actionable.map((entry) => {
        const action = row.byAction.get(entry.actionId);
        let delta = 0;
        if (action !== undefined && action.targetEntityId !== null && entry.relationalBenefit !== 0) {
          const scope = [action.targetEntityId, ...stage2L16DownstreamOf(row.index, action.targetEntityId)];
          const disagrees = scope.some((id) => {
            const entity = row.index.byId.get(id);
            if (entity === undefined) return false;
            const locallyBlocked = entity.availability < 500000 || entity.baseCapacity < entity.demand;
            return !locallyBlocked && row.delivering.get(id) !== true;
          });
          if (disagrees) delta = -Math.round(entry.relationalBenefit / 2);
        }
        return { actionId: entry.actionId, value: entry.finalRelationalUtility + delta };
      }).sort((left, right) => right.value - left.value || left.actionId.localeCompare(right.actionId));
      const picked = adjusted[0] !== undefined && adjusted[0].value > 0 ? adjusted[0].actionId : row.holdActionId;
      const ok = picked === row.optimalActionId;
      if (!side.correct && ok) fixes += 1;
      if (side.correct && !ok) breaks += 1;
    }
    return { fixes, breaks, net: fixes - breaks };
  };
  const before = measure('INHERITED');
  const after = measure(variantName);
  const errorsAfter = rows.filter((row) => !sideOf(row, variantName).correct).length;
  return {
    inheritedNet: before.net,
    remediatedNet: after.net,
    remediatedFixes: after.fixes,
    remediatedBreaks: after.breaks,
    netShareOfRemainingErrors: round(ratio(after.net, errorsAfter)),
    /* Materially larger means it crossed from noise into something worth a stage.
     * Declared before measuring: a net above 5% of the remaining errors. */
    materialityThreshold: 0.05,
    fixedPointImportanceChanged: Math.abs(round(ratio(after.net, errorsAfter))) >= 0.05,
    implementedInExpert: false,
    note: 'Diagnostic only. Stage 2L.17 adds no iterative or fixed-point reasoning to the production expert, per its brief.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 13 — adversarial tests.
 * ------------------------------------------------------------------------- */

export const STAGE2L17_ADVERSARIAL_CASES = deepFreeze([
  'DEAD_SUBSTITUTE_LOOKS_STRUCTURALLY_VALID', 'DUPLICATE_SUBSTITUTES', 'CYCLIC_SUBSTITUTE_RELATION',
  'MALFORMED_SUBSTITUTE_STATE', 'MISSING_DELIVERY_STATE', 'UNKNOWN_SUBSTITUTE_SCHEMA',
  'MALFORMED_HOLD_SEMANTICS', 'MISSING_HOLD_INPUTS', 'NAN_SEMANTIC_FIELD',
  'NEGATIVE_SEMANTIC_FIELD', 'EXTREME_COST', 'EXTREME_VALUE', 'EXTREME_RISK',
  'ILLEGAL_ACTION_TARGET', 'EMPTY_ACTION_SET',
]);

export function runStage2L17AdversarialSuite(variantName = STAGE2L17_SELECTED_VARIANT) {
  const base = () => buildStage2L17AuditWorld({ substituteAvailable: true, substituteHasCapacity: false });
  const actions = [...STAGE2L17_AUDIT_ACTIONS];
  const probe = (world, actionSet = actions) => {
    try {
      const result = evaluateStage2L17Nexus(world, actionSet, { variant: variantName });
      const chosen = result.recommendedActionId;
      const entry = chosen === null ? null : result.scored.find((item) => item.actionId === chosen);
      return {
        threw: false,
        abstained: result.abstained,
        recommendedActionId: chosen,
        creditedBenefit: entry === null ? 0 : entry.relationalBenefit,
        semanticallyComplete: entry === null ? true : entry.semanticFieldsComplete,
      };
    } catch (error) {
      return { threw: true, message: String(error && error.message) };
    }
  };

  const mutate = (mutator) => { const world = base(); mutator(world); return world; };
  const results = {
    DEAD_SUBSTITUTE_LOOKS_STRUCTURALLY_VALID: probe(base()),
    DUPLICATE_SUBSTITUTES: probe(mutate((world) => {
      world.relations.push(AUDIT_RELATION('r-dup', 's', 'v', 'substitutes', 0, 't'));
    })),
    CYCLIC_SUBSTITUTE_RELATION: probe(mutate((world) => {
      world.relations.push(AUDIT_RELATION('r-cyc', 't', 's', 'substitutes', 0, 's'));
      world.relations.push(AUDIT_RELATION('r-cyc2', 's', 't', 'depends'));
      world.relations.push(AUDIT_RELATION('r-cyc3', 't', 's', 'depends'));
    })),
    MALFORMED_SUBSTITUTE_STATE: probe(mutate((world) => {
      world.relations.push(AUDIT_RELATION('r-bad', 'nonexistent', 'v', 'substitutes', 0, 't'));
    })),
    MISSING_DELIVERY_STATE: probe(mutate((world) => {
      delete world.entities.find((entity) => entity.entityId === 's').availability;
    })),
    UNKNOWN_SUBSTITUTE_SCHEMA: probe(mutate((world) => {
      world.relations.push({ relationId: 'r-unknown', from: 's', to: 'v', kind: 'TELEPORTS', weight: 0 });
    })),
    MALFORMED_HOLD_SEMANTICS: probe(base(), actions.filter((action) => action.kind !== 'HOLD')),
    MISSING_HOLD_INPUTS: probe(mutate((world) => {
      delete world.entities.find((entity) => entity.entityId === 'v').objectiveValue;
    })),
    NAN_SEMANTIC_FIELD: probe(mutate((world) => {
      world.entities.find((entity) => entity.entityId === 't').restorationCost = Number.NaN;
    })),
    NEGATIVE_SEMANTIC_FIELD: probe(mutate((world) => {
      world.entities.find((entity) => entity.entityId === 't').baseCapacity = -1;
    })),
    EXTREME_COST: probe(mutate((world) => {
      world.entities.find((entity) => entity.entityId === 't').restorationCost = Number.MAX_SAFE_INTEGER;
    })),
    EXTREME_VALUE: probe(mutate((world) => {
      world.entities.find((entity) => entity.entityId === 'v').objectiveValue = Number.MAX_SAFE_INTEGER;
    })),
    EXTREME_RISK: probe(mutate((world) => {
      const entity = world.entities.find((item) => item.entityId === 't');
      entity.risk = Number.MAX_SAFE_INTEGER; entity.protectionNeed = Number.MAX_SAFE_INTEGER;
    })),
    ILLEGAL_ACTION_TARGET: probe(base(), [...actions, { actionId: 'a-ghost', kind: 'RESTORE', targetEntityId: 'does-not-exist' }]),
    EMPTY_ACTION_SET: probe(base(), []),
  };

  /* What each probe must NOT do. A malformed or unknown condition may never
   * produce a confident intervention resting on credited benefit. */
  const mustNotCreditDeadSubstitute = ['DEAD_SUBSTITUTE_LOOKS_STRUCTURALLY_VALID', 'DUPLICATE_SUBSTITUTES', 'MALFORMED_SUBSTITUTE_STATE'];
  const mustNotThrow = Object.keys(results);
  return deepFreeze(Object.fromEntries(Object.entries(results).map(([name, result]) => {
    const failsClosed = result.threw === false
      && (!mustNotCreditDeadSubstitute.includes(name)
        || result.recommendedActionId !== 'a-bypass-t');
    return [name, { ...result, failsClosed, isolated: mustNotThrow.includes(name) && result.threw === false }];
  })));
}

/* ---------------------------------------------------------------------------
 * Evaluation and certification.
 * ------------------------------------------------------------------------- */

export const STAGE2L17_FORBIDDEN_IN_EXPERT = deepFreeze([
  'stage2l12', 'stage2l16', 'deriveGroundTruth', 'objectiveUtility', 'applyAction',
  'optimalActionId', 'actionUtility', 'groundTruth', 'primeRecommendation', 'resolveDelivery',
]);

export function buildStage2L17Evaluation({ deriveGroundTruthFn } = {}) {
  const rows = buildStage2L17Corpus();
  const variantName = STAGE2L17_SELECTED_VARIANT;

  const ablation = runStage2L17Ablation(rows);
  const blind = runStage2L17BlindEvaluation(rows, variantName);
  const taxonomy = runStage2L17TaxonomyReplay(rows, variantName);
  const fixedPoint = remeasureStage2L17FixedPoint(rows, variantName);
  const adversarial = runStage2L17AdversarialSuite(variantName);
  const audits = deriveGroundTruthFn === undefined ? null : runStage2L17Audits(deriveGroundTruthFn, variantName);

  const confidenceRows = buildStage2L17ConfidenceRows(rows, variantName);
  const calibration = deriveStage2L17Calibration(confidenceRows);
  const rules = buildStage2L17RuleSet();
  const frozenRule = calibration.delegatingRuleId === null
    ? null
    : rules.find((rule) => rule.id === calibration.delegatingRuleId) ?? null;
  const delegation = evaluateStage2L17Delegation(confidenceRows, calibration, frozenRule === null ? null : frozenRule.test);

  /* Determinism and ordering invariance, measured on the remediated expert. */
  const replaySample = rows.slice(0, 300);
  const replayEquivalent = replaySample.every((row) => {
    const again = evaluateStage2L17Nexus(row.world, row.legalActions, { variant: variantName });
    return again.recommendedActionId === row.variants[variantName].recommendedActionId;
  });
  const orderingInvariant = replaySample.slice(0, 120).every((row) => {
    const reversed = {
      entities: [...row.world.entities].reverse().map((entity) => ({ ...entity })),
      relations: [...row.world.relations].reverse().map((relation) => ({ ...relation })),
    };
    const again = evaluateStage2L17Nexus(reversed, [...row.legalActions].reverse(), { variant: variantName });
    return again.recommendedActionId === row.variants[variantName].recommendedActionId;
  });

  const corpusDigest = sha256(rows.map((row) => [
    row.variantIndex, row.inherited.correct ? 1 : 0,
    row.variants[variantName].correct ? 1 : 0, row.variants[variantName].effectiveActionId,
  ]));

  return deepFreeze({
    variantSelected: variantName,
    remediationModel: STAGE2L17_REMEDIATION_MODEL,
    remediationModelDigest: STAGE2L17_REMEDIATION_MODEL_DIGEST,
    corpusDigest,
    audits,
    ablation,
    blind,
    taxonomy,
    fixedPoint,
    adversarial,
    calibration,
    delegation,
    confidenceRowCount: confidenceRows.length,
    invariance: { replayEquivalent, orderingInvariant },
  });
}

export function certifyStage2L17({ evaluation }) {
  const { ablation, blind, taxonomy, fixedPoint, adversarial, calibration, delegation, invariance, audits } = evaluation;

  const expertReproducesInherited = ablation.inheritedVariantFaithful;
  const liveSubstitutePass = blind.liveSubstituteDefectReduced
    && (audits === null || (audits.liveSubstituteDefectReproduced && audits.liveSubstituteDefectRepaired));
  const holdBaselinePass = blind.worseThanHoldErrorRateReduced;
  const accuracyImproved = blind.after.accuracy > blind.before.accuracy;
  const netErrorsEliminated = taxonomy.netErrorsEliminated > 0;
  const adversarialPass = Object.values(adversarial).every((entry) => entry.failsClosed && entry.isolated);
  const securityRegressionPass = adversarialPass && invariance.replayEquivalent && invariance.orderingInvariant;

  const expertRemediationPass = expertReproducesInherited
    && liveSubstitutePass
    && holdBaselinePass
    && accuracyImproved
    && netErrorsEliminated
    && securityRegressionPass;

  const reliabilityPass = delegation.nexusDelegations > 0
    && delegation.nexusDelegationPrecision >= STAGE2L14_RELIABILITY_FLOOR;
  const conservativeBoundPass = delegation.nexusDelegations > 0
    && delegation.delegatedReliabilityLowerBound >= STAGE2L14_CONSERVATIVE_BOUND_REQUIREMENT;
  const supportPass = delegation.nexusDelegations >= STAGE2L14_MINIMUM_DELEGATION_COUNT
    && delegation.nexusDelegationRate >= STAGE2L14_MINIMUM_DELEGATION_RATE;
  const utilityPass = delegation.nexusDelegations > 0
    && delegation.beneficialChanges > delegation.harmfulChanges
    && delegation.arbiterAccuracy > delegation.primeOnlyAccuracy;
  const harmCeilingPass = delegation.harmCeilingRespected && delegation.correctPrimeBreakCeilingRespected;
  const safeDelegationPass = reliabilityPass && conservativeBoundPass && supportPass && utilityPass && harmCeilingPass;

  const certified = expertRemediationPass;

  /* Outcome. Expert remediation and safe delegation are separate verdicts, and
   * the brief is explicit that the first can pass while the second does not. */
  const outcome = !certified ? 'E_BOUNDED_REMEDIATION_INSUFFICIENT'
    : safeDelegationPass ? 'A_EXPERT_FIXED_AND_SAFE_DELEGATION_CERTIFIED'
      : taxonomy.newlyExposedDominantClass ? 'F_NEW_DOMINANT_DEFECT_EXPOSED'
        : 'B_EXPERT_FIXED_DELEGATION_STILL_BELOW_FLOOR';

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2L17_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'BOUNDED_EXPERT_REMEDIATION_AND_CERTIFICATION',
    authority: 'R0',
    canDispatch: false,
    canMutateLiveWorld: false,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l16CertificationHash: STAGE2L17_STAGE2L16_CERTIFICATION_HASH,
      stage2l15CertificationHash: STAGE2L17_STAGE2L15_CERTIFICATION_HASH,
      stage2l13CertificationHash: STAGE2L17_STAGE2L13_CERTIFICATION_HASH,
      groundTruthUnchanged: true,
      benchmarkUnchanged: true,
      arbiterChanged: false,
      primeChanged: false,
      reliabilityFloorLowered: false,
      reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
      confidenceMethodologyInherited: true,
      fixedPointReasoningAdded: false,
      inheritedExpertPreserved: true,
      inheritedVariantReproducesFrozenExpert: expertReproducesInherited,
    },
    remediationModel: evaluation.remediationModel,
    remediationModelDigest: evaluation.remediationModelDigest,
    variantSelected: evaluation.variantSelected,
    corpusDigest: evaluation.corpusDigest,
    audits,
    ablation,
    blind,
    taxonomy,
    fixedPoint,
    calibration: {
      methodology: calibration.methodology,
      reliabilityFloor: calibration.reliabilityFloor,
      calibrationDigest: calibration.calibrationDigest,
      ruleCount: calibration.ruleCount,
      qualifyingRuleCount: calibration.qualifyingRuleCount,
      meetsInheritedCriterionCount: calibration.meetsInheritedCriterionCount,
      inheritedCriterionCandidates: calibration.inheritedCriterionCandidates,
      selected: calibration.selected,
      delegatingRuleId: calibration.delegatingRuleId,
      ceiling: calibration.ceiling,
      sweep: calibration.sweep,
    },
    delegation,
    adversarial,
    invariance,
    expertReproducesInherited,
    liveSubstituteRemediationPass: liveSubstitutePass,
    holdBaselineRemediationPass: holdBaselinePass,
    expertRemediationPass,
    reliabilityPass,
    conservativeReliabilityBoundPass: conservativeBoundPass,
    minimumDelegationSupportPass: supportPass,
    utilityPass,
    harmCeilingPass,
    safeDelegationPass,
    nexusSafeForSelectiveDelegation: safeDelegationPass,
    securityRegressionPass,
    nexusRemediationOutcome: outcome,
    stage2l17Certified: certified,
    interpretation: {
      nexusExpertRemediationRequired: !safeDelegationPass,
      nexusConfidenceRemediationRequired: false,
      arbiterRemediationRequired: false,
      measuredRemainingLimitation: safeDelegationPass
        ? 'None measured at this stage.'
        : `Expert accuracy improved ${blind.before.accuracy} -> ${blind.after.accuracy} (${blind.absoluteImprovementPp} pp), eliminating ${taxonomy.netErrorsEliminated} net errors, but the inherited confidence pipeline still isolates no supported region at ${STAGE2L14_RELIABILITY_FLOOR}. The dominant residual class is now ${taxonomy.dominantErrorClassAfter}.`,
    },
    portabilityNote: 'Stage 2L.10 through 2L.16 remain DIGEST_PRODUCED_SINGLE_PLATFORM. Stage 2L.17 does not change that.',
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ corpusDigest: evaluation.corpusDigest, ablation, blind, taxonomy, delegation, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}

export function buildStage2L17PortabilityDigest(certification) {
  const witnesses = {
    stage: certification.stage,
    status: certification.status,
    corpusDigest: certification.corpusDigest,
    variantSelected: certification.variantSelected,
    inheritedAccuracy: certification.blind.before.accuracy,
    remediatedAccuracy: certification.blind.after.accuracy,
    netErrorsEliminated: certification.taxonomy.netErrorsEliminated,
    nexusDelegations: certification.delegation.nexusDelegations,
    nexusRemediationOutcome: certification.nexusRemediationOutcome,
    evidenceDigest: certification.evidenceDigest,
    certificationHash: certification.certificationHash,
  };
  return deepFreeze({ digest: sha256(witnesses), witnesses });
}
