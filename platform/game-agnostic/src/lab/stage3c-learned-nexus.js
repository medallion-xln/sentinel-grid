/* Stage 3C — first learned Nexus candidate, offline generalization, and hybrid
 * intelligence evaluation.
 *
 * THE TRAINING SUBSTRATE IS NOT AVAILABLE IN THIS ENVIRONMENT, and that is
 * measured rather than assumed. Everything in this module that does not depend on
 * a trained model is built and run; everything that does is declared, hashed and
 * left unexecuted. The stage reports BLOCKED for the training-dependent surface
 * instead of inventing a candidate, because a fabricated accuracy number is worse
 * than no number: it would be indistinguishable from a real one in every artifact
 * downstream.
 *
 * What IS delivered here, all of it training-free:
 *
 *   - the entry gate, verified rather than asserted (Phase 0)
 *   - the task contract a learned specialist would have to satisfy (Phase 2)
 *   - Nexus-relevant case selection, with rules recorded BEFORE any training
 *     could use them (Phase 3)
 *   - targets from Forge counterfactual truth, with exact ties preserved as sets
 *     rather than collapsed into sorting artifacts (Phase 4)
 *   - the training distribution audit (Phase 5)
 *   - every baseline that needs no training: random-legal, heuristic, a
 *     Nexus-driven selector, and Prime (Phase 11)
 *   - the legality and parser gate any learned output must pass (Phase 26)
 *   - the promotion firewall, mutation-tested (Phase 27)
 *
 * ONE NAMING CORRECTION THE STAGE FORCES.
 *
 * The brief asks for "deterministic Nexus accuracy" on the pick-an-action task.
 * Deterministic Nexus does not pick actions. It emits GRAPH-LEVEL signals —
 * counts of bottlenecks, critical dependencies, threatened and unsupported nodes,
 * depth, density — and a confidence in how much structure it actually saw. It has
 * no per-action output at all. Comparing it directly with an action-picking
 * learned model would be comparing two different kinds of thing and reporting the
 * difference as a score.
 *
 * So this module builds NEXUS_RELATIONAL_SELECTOR_V1: a deterministic policy that
 * ranks legal actions by the relational structure Nexus reads, and it is labelled
 * as a selector BUILT ON Nexus rather than as Nexus itself. Nexus is not modified;
 * the selector is new, additive, and reported under its own name everywhere.
 */

import { deepFreeze, sha256 } from '../core/determinism.js';
import { assertEvaluationOnly, defaultAuthorityPolicy, denyExecution } from '../core/authority.js';
import { evaluateNexus } from '../experts/nexus.js';
import { recommend } from '../prime/root-puct.js';
import { forgeAdapterState, forgeWorldAdapter } from '../forge/adapter.js';
import { hashWorld, legalActions, forgeActionKey, observe } from '../forge/kernel.js';
import { generateScenarioV3 } from '../forge/scenarios-v3.js';
import { runCalibratedWarmup } from '../forge/warmup.js';
import { evaluateCounterfactualsV2 } from '../forge/counterfactual-v2.js';
import { FORGE_DATASET_V2_VERSION } from '../forge/dataset-v2.js';
import { SOUP_COMMIT, SOUP_VERSION } from '../forge/soup-bridge.js';

export const STAGE3C_STAGE = 'STAGE3C_LEARNED_NEXUS_CANDIDATE';
export const STAGE3C_STAGE3B1_CERTIFICATION_HASH = '1fd230523adbde9dc5e1971cb07637be9e9dc741b5a51b1d6f0e90b4966bab74';
export const STAGE3C_STAGE3B_CERTIFICATION_HASH = '61a8ab8d7769b3c09541d3cb2665d4451eba95513f08b6055390e6212236156d';
export const STAGE3C_STAGE3A_CERTIFICATION_HASH = 'c66b85d863d428d2da0e9d738f426e0b655124509bad04e0e7220f6eaf34898d';

export const STAGE3C_INHERITED = deepFreeze({
  datasetVersion: FORGE_DATASET_V2_VERSION,
  admittedRecords: 70804,
  topologyCount: 65307,
  effectiveDatasetSize: 62377,
  splits: { TRAIN: 50860, VALIDATION: 6509, HOLDOUT: 6291, OOD: 7144 },
  sftRows: 47683,
  preferenceRows: 33235,
  rlRows: 135045,
  routerAlignment: 0.932,
  authority: 'R0',
});

/* ---------------------------------------------------------------------------
 * PHASE 2 — the task contract.
 * ------------------------------------------------------------------------- */

export const STAGE3C_TASK_CONTRACT = deepFreeze({
  taskId: 'LEARNED_NEXUS_RELATIONAL_INTERVENTION_V1',
  framing: 'STRUCTURED_EXPERT_TASK_NOT_FREE_GENERATION',
  input: deepFreeze(['objective', 'canonicalEntities', 'relations', 'quantitativeState', 'legalActions']),
  output: deepFreeze({ actionId: 'string', confidence: 'number in [0,1]', abstain: 'boolean' }),
  optionalOutput: deepFreeze({ ranking: '[{actionId, score}]' }),
  hiddenChainOfThoughtRequired: false,
  schema: deepFreeze({
    type: 'object',
    required: ['actionId', 'confidence', 'abstain'],
    properties: {
      actionId: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      abstain: { type: 'boolean' },
      ranking: { type: 'array', items: { type: 'object', required: ['actionId', 'score'] } },
    },
  }),
  legalityRule:
    'Every emitted actionId is checked against the legal action set for that exact world before it is scored. A model output can never bypass legality: an illegal or unparseable answer is counted as such, never silently repaired into the nearest legal action.',
  abstentionRule:
    'Abstention is a first-class answer, which is why the selection rules deliberately include negative controls where relational reasoning is unnecessary. A specialist that cannot say "this one is not mine" is not a specialist.',
});

/* ---------------------------------------------------------------------------
 * PHASE 3 — Nexus-relevant case selection. Rules recorded before training.
 *
 * Selection is on STRUCTURE, measured off the world, never on the answer. A rule
 * that selected cases by whether some model got them right would be building the
 * exam around the candidate.
 * ------------------------------------------------------------------------- */

export const STAGE3C_SELECTION_RULES = deepFreeze([
  { id: 'DEPENDENCY_CHAIN', rule: 'at least one depends-edge and dependency depth >= 2' },
  { id: 'SUBSTITUTION', rule: 'at least one substitutes relation present' },
  { id: 'BOTTLENECK', rule: 'a node with degree >= 3 that is critical or threatened' },
  { id: 'BRIDGE', rule: 'a node whose removal disconnects reachable structure' },
  { id: 'CYCLE', rule: 'a directed cycle among depends-edges' },
  { id: 'REDUNDANCY', rule: 'two or more live substitutes for the same failed node' },
  { id: 'MULTI_HOP', rule: 'dependency depth >= 3' },
  { id: 'DISTRIBUTED_VALUE', rule: 'value spread across three or more structural nodes' },
  { id: 'CASCADING_FAILURE', rule: 'an unavailable node with two or more dependents' },
  { id: 'RESOURCE_ALLOCATION', rule: 'energy below the cost of the open work' },
  { id: 'INTERVENTION_CHOICE', rule: 'two or more distinct action types legal on structural targets' },
  { id: 'NEGATIVE_CONTROL_NO_RELATIONS', rule: 'no relations at all — relational reasoning cannot help', negativeControl: true },
  { id: 'NEGATIVE_CONTROL_SINGLE_ACTION', rule: 'exactly one legal action — nothing to choose', negativeControl: true },
  { id: 'NEGATIVE_CONTROL_NO_SEPARATION', rule: 'every legal action scores identically — no decision to make', negativeControl: true },
]);

export const STAGE3C_SELECTION_DISCIPLINE = deepFreeze({
  selectsOn: 'WORLD_STRUCTURE',
  neverSelectsOn: deepFreeze(['model output', 'candidate correctness', 'evaluation labels', 'split identity']),
  rulesRecordedBeforeTraining: true,
  negativeControlsIncluded: true,
  negativeControlPurpose: 'so the specialist can learn to abstain rather than always answering',
});

/**
 * Which selection rules a record satisfies.
 *
 * MEASURED OFF THE RECORD, NEVER OFF A LABEL. An earlier draft keyed these on the
 * generator's shape and role names — `shape === 'bridge'` meant BRIDGE — and that
 * is precisely the mistake this project has refused since the Stage 3A admission
 * gate: a family or shape NAME is never evidence. It also barely selected
 * anything, admitting 99.96% of TRAIN, because with fifteen shapes and six role
 * mixes almost every record matches some label. A filter that keeps everything is
 * not a filter.
 *
 * The rules below read quantities the record actually carries: how much relational
 * structure exists, whether there is a choice to make, whether the choice has
 * consequences, and how those consequences are distributed across action types.
 */
export function classifyRuleMatches(record) {
  const entities = record.entityCount ?? 0;
  const relations = record.relationCount ?? 0;
  const actions = record.legalActionCount ?? 0;
  const branches = record.branches ?? [];
  const spread = record.utilitySpread ?? 0;
  const actionTypes = new Set(branches.map((branch) => branch.actionType));
  const targeted = new Set(branches.map((branch) => branch.targetId).filter((id) => id !== null));
  const density = entities > 0 ? relations / entities : 0;

  const matched = [];

  /* Negative controls: relational reasoning cannot help, so the right answer for a
   * relational specialist is to abstain. */
  if (relations === 0) matched.push('NEGATIVE_CONTROL_NO_RELATIONS');
  if (actions <= 1) matched.push('NEGATIVE_CONTROL_SINGLE_ACTION');
  if (spread === 0) matched.push('NEGATIVE_CONTROL_NO_SEPARATION');

  /* Relational substance, each measured. */
  if (relations >= 2 && density >= 1) matched.push('DEPENDENCY_CHAIN');
  if (relations >= entities && entities >= 6) matched.push('MULTI_HOP');
  if (targeted.size >= 3) matched.push('DISTRIBUTED_VALUE');
  if (actionTypes.size >= 3) matched.push('INTERVENTION_CHOICE');
  if (actionTypes.has('SUBSTITUTE')) matched.push('SUBSTITUTION');
  if (actionTypes.has('REPAIR') && actionTypes.has('REINFORCE')) matched.push('REDUNDANCY');
  if (actionTypes.has('PROTECT') || actionTypes.has('REINFORCE')) matched.push('CASCADING_FAILURE');
  if (branches.some((branch) => branch.terminal)) matched.push('BOTTLENECK');
  if (record.horizonClass === 'HORIZON_DEPENDENT' && spread > 0) matched.push('BRIDGE');
  if (record.tieClass === 'HORIZON_ALIASING') matched.push('CYCLE');
  if ((record.energy ?? 0) < actions * 2) matched.push('RESOURCE_ALLOCATION');

  return [...new Set(matched)].sort();
}

/** Rule matches for one record, without the corpus-level informativeness filter. */
export function classifySelection(record) {
  const matched = classifyRuleMatches(record);
  const negativeControl = matched.some((id) => id.startsWith('NEGATIVE_CONTROL'));
  return {
    matched,
    relationalRuleCount: matched.filter((id) => !id.startsWith('NEGATIVE_CONTROL')).length,
    negativeControl,
  };
}

/**
 * Rule informativeness, measured on the corpus the rules will be applied to.
 *
 * A criterion that fires on every case is not a criterion. Two of the rules above
 * turned out to be exactly that: on FORGE_DATASET_V2 every single record offers at
 * least three distinct action types and at least one of PROTECT or REINFORCE, so
 * INTERVENTION_CHOICE and CASCADING_FAILURE have a base rate of 1.0 and separate
 * nothing. Requiring "two relational rules" while two rules are constants admits
 * everything, which is what the first two drafts of this selector did.
 *
 * So the rules are measured before they are used, and only the ones that actually
 * vary are allowed to carry the selection. The constant ones are still reported —
 * "every Forge world affords a protective action" is a true and useful fact about
 * the corpus — they simply cannot be evidence that a case is relationally rich.
 */
export const RULE_INFORMATIVE_MIN = 0.02;
export const RULE_INFORMATIVE_MAX = 0.98;

export function measureRuleBaseRates(records) {
  const counts = {};
  for (const rule of STAGE3C_SELECTION_RULES) counts[rule.id] = 0;
  for (const record of records) for (const id of classifyRuleMatches(record)) counts[id] += 1;

  const total = records.length;
  const rules = STAGE3C_SELECTION_RULES.map((rule) => {
    const baseRate = total === 0 ? 0 : Math.round((counts[rule.id] * 10000) / total) / 10000;
    const informative = baseRate > RULE_INFORMATIVE_MIN && baseRate < RULE_INFORMATIVE_MAX;
    return {
      id: rule.id,
      negativeControl: rule.negativeControl === true,
      count: counts[rule.id],
      baseRate,
      informative,
      excludedReason: informative ? null
        : baseRate >= RULE_INFORMATIVE_MAX ? 'CONSTANT_ON_THIS_CORPUS_FIRES_ON_ALMOST_EVERY_RECORD'
          : 'NEARLY_EMPTY_ON_THIS_CORPUS',
    };
  });
  return {
    records: total,
    rules,
    informativeRuleIds: rules.filter((rule) => rule.informative && !rule.negativeControl).map((rule) => rule.id),
    nonInformativeRuleIds: rules.filter((rule) => !rule.informative).map((rule) => rule.id),
    method: 'A rule is informative only if its base rate lies strictly inside (0.02, 0.98) on the records it will select from. Measured before selection, so a constant rule cannot silently carry the filter.',
  };
}

/** Selection using only the rules measured as informative. */
export function selectRelationalCases(records, baseRates) {
  const informative = new Set(baseRates.informativeRuleIds);
  return records.map((record) => {
    const matched = classifyRuleMatches(record);
    const negativeControl = matched.some((id) => id.startsWith('NEGATIVE_CONTROL'));
    const informativeMatches = matched.filter((id) => informative.has(id));
    return {
      record,
      matched,
      informativeMatches,
      relationallyMeaningful: !negativeControl && informativeMatches.length >= 2,
      negativeControl,
    };
  });
}

/* ---------------------------------------------------------------------------
 * PHASE 4 — targets from Forge counterfactual truth.
 *
 * The optimal SET is preserved. Collapsing an exact tie into one label would teach
 * the sorting function rather than the world — the same rule Stage 3B established
 * when it separated genuine equivalence from reward defects.
 * ------------------------------------------------------------------------- */

export function buildTarget(record) {
  const branches = record.branches ?? [];
  const optimalScalar = record.optimalScalar;
  const optimalSet = branches.filter((branch) => branch.scalarReward === optimalScalar).map((branch) => branch.actionKey).sort();
  const exactTie = optimalSet.length > 1;
  return {
    recordHash: record.recordHash,
    optimalSet,
    optimalSetSize: optimalSet.length,
    exactTie,
    supervisionClass: record.supervisionClass,
    rewardGap: branches.length === 0 ? 0
      : optimalScalar - Math.min(...branches.map((branch) => branch.scalarReward)),
    singleTargetSftEligible: !exactTie && record.supervisionClass === 'UNIQUE_OPTIMUM',
    setTargetEligible: exactTie && record.supervisionClass === 'EXACT_EQUIVALENCE',
    excludedFromSft: record.supervisionClass === 'INSUFFICIENTLY_RESOLVED'
      || record.supervisionClass === 'NEAR_TIE' || record.supervisionClass === 'PARETO_TRADEOFF',
    tieHandling: 'OPTIMAL_SET_PRESERVED_NEVER_COLLAPSED',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 5 — training distribution audit.
 * ------------------------------------------------------------------------- */

export function auditTrainingDistribution(records) {
  const bucket = (keyOf) => records.reduce((counts, record) => {
    const key = String(keyOf(record));
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  const band = (value, edges) => {
    for (const edge of edges) if (value <= edge) return `<=${edge}`;
    return `>${edges[edges.length - 1]}`;
  };
  const ruleCounts = {};
  for (const rule of STAGE3C_SELECTION_RULES) ruleCounts[rule.id] = 0;
  for (const record of records) for (const id of classifyRuleMatches(record)) ruleCounts[id] += 1;

  return {
    records: records.length,
    byTopology: bucket((record) => record.shape),
    byRoles: bucket((record) => record.roles),
    byObjectives: bucket((record) => record.objectives),
    byLevel: bucket((record) => record.level),
    byHorizonBand: bucket((record) => record.horizonBand),
    byHorizonClass: bucket((record) => record.horizonClass),
    bySupervision: bucket((record) => record.supervisionClass),
    byEntityCount: bucket((record) => band(record.entityCount ?? 0, [8, 16, 24, 32])),
    byRelationCount: bucket((record) => band(record.relationCount ?? 0, [8, 16, 24, 32])),
    byLegalActionCount: bucket((record) => band(record.legalActionCount ?? 0, [2, 4, 8, 16])),
    byRewardGap: bucket((record) => band(record.utilitySpread ?? 0, [0, 5, 20, 60])),
    bySelectionRule: ruleCounts,
    /* These two are deliberately absent rather than zero.
     *
     * `relationallyMeaningful` is a property of a SELECTION, not of a record: it
     * depends on which rules were measured informative across the whole corpus, so
     * it cannot be recomputed from a record in isolation. An earlier version called
     * the per-record classifier here and reported 0 for both fields on a subset
     * that was, by construction, entirely relationally meaningful — a silently
     * wrong number, which is worse than an absent one. The counts live in the
     * selection block, where the base rates that produced them also live. */
    selectionCountsReportedIn: 'stage3c-training-selection.json',
    domination: (() => {
      const total = records.length;
      const share = (counts) => {
        const largest = Math.max(...Object.values(counts), 0);
        return total === 0 ? 0 : Math.round((largest * 10000) / total) / 10000;
      };
      const levelShare = share(bucket((record) => record.level));
      const topologyCounts = bucket((record) => record.shape);
      const topologyShare = share(topologyCounts);
      const topTwo = Object.entries(topologyCounts).sort((a, b) => b[1] - a[1]).slice(0, 2);
      const topTwoShare = total === 0 ? 0
        : Math.round((topTwo.reduce((sum, [, count]) => sum + count, 0) * 10000) / total) / 10000;
      return {
        largestSingleLevelShare: levelShare,
        levelDominated: levelShare > 0.5,
        largestSingleTopologyShare: topologyShare,
        topTwoTopologies: topTwo.map(([shape, count]) => ({ shape, count })),
        topTwoTopologyShare: topTwoShare,
        topologyDominated: topTwoShare > 0.5,
        note: 'A subset dominated by one curriculum level would measure that level rather than relational reasoning. The same is true of topology, which the first version of this check did not look at.',
        topologyFinding: topTwoShare > 0.5
          ? 'SELECTION_SKEWED_TOWARD_DENSE_TOPOLOGIES: the informative rules key on relational density, so mesh and redundant_network — the two densest shapes — supply most of the selected subset. This is a property of selecting for relational richness, and it means a specialist trained on this subset would see sparse topologies far less often than dense ones. Reported so that any later per-topology result is read against it.'
          : null,
      };
    })(),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 11 — baselines that need no trained model.
 * ------------------------------------------------------------------------- */

export const STAGE3C_BASELINE_IDS = deepFreeze([
  'RANDOM_LEGAL', 'HEURISTIC_GREEDY_IMMEDIATE', 'NEXUS_RELATIONAL_SELECTOR_V1', 'PRIME_FROZEN',
]);

export const NEXUS_SELECTOR_NOTE =
  'NEXUS_RELATIONAL_SELECTOR_V1 is a deterministic policy BUILT ON deterministic Nexus, not Nexus itself. Nexus emits graph-level signals — bottleneck, critical-dependency, threatened and unsupported counts, depth, density — and no per-action output whatsoever. Ranking legal actions therefore needs a policy on top of those signals, and it is reported under its own name so no reader mistakes it for the certified expert. Nexus is unmodified.';

/** Deterministic pseudo-random draw from the record hash. No wall clock, no RNG state. */
function seededIndex(recordHash, modulo) {
  return modulo <= 0 ? 0 : parseInt(recordHash.slice(0, 8), 16) % modulo;
}

/**
 * The relational selector.
 *
 * Nexus's read of the world says WHAT KIND of structure is present. The selector
 * turns that into a preference over action types: where the graph reports
 * unsupported threats it prefers actions that address a threatened node; where it
 * reports critical dependencies or bottlenecks it prefers restoring structure;
 * with no relational signal it abstains rather than guessing, which is the whole
 * point of giving the task an abstain output.
 */
export function nexusRelationalSelector(record, nexusOutput) {
  const branches = record.branches ?? [];
  if (branches.length === 0) return { actionId: null, confidence: 0, abstain: true, reason: 'NO_LEGAL_ACTIONS' };

  const codes = new Set(nexusOutput.rationaleCodes);
  const signals = nexusOutput.signals ?? {};
  const structural = codes.has('NEXUS_CRITICAL_DEPENDENCY') || codes.has('NEXUS_BOTTLENECK')
    || codes.has('NEXUS_UNSUPPORTED_THREAT') || codes.has('NEXUS_CYCLE_DETECTED');

  if (!structural || codes.has('NEXUS_NO_RELATIONSHIPS') || codes.has('NEXUS_EMPTY_GRAPH')) {
    return { actionId: null, confidence: 0, abstain: true, reason: 'NO_RELATIONAL_STRUCTURE_TO_READ' };
  }

  /* Preference order over action TYPES, from what the graph reports. This is the
   * selector's whole content: Nexus supplies the diagnosis, the order supplies the
   * response, and neither consults the reward the case is scored by. */
  const threatDriven = codes.has('NEXUS_UNSUPPORTED_THREAT') || codes.has('NEXUS_UNCOVERED_THREAT');
  const preference = threatDriven
    ? ['REINFORCE', 'PROTECT', 'REPAIR', 'SUBSTITUTE', 'ATTACK', 'TRANSFER', 'COLLECT', 'MOVE', 'RETREAT', 'WAIT']
    : ['REPAIR', 'SUBSTITUTE', 'REINFORCE', 'TRANSFER', 'COLLECT', 'PROTECT', 'MOVE', 'ATTACK', 'RETREAT', 'WAIT'];

  const ranked = [...branches].sort((a, b) => {
    const pa = preference.indexOf(a.actionType);
    const pb = preference.indexOf(b.actionType);
    const ra = pa === -1 ? preference.length : pa;
    const rb = pb === -1 ? preference.length : pb;
    if (ra !== rb) return ra - rb;
    return a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0;
  });

  const density = signals.graphDensity ?? 0;
  const confidence = Math.min(1, Math.round((nexusOutput.confidence / 1000 + density / 2000) * 100) / 100);
  return {
    actionId: ranked[0].actionKey,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    abstain: false,
    reason: threatDriven ? 'THREAT_DRIVEN_PREFERENCE' : 'STRUCTURE_DRIVEN_PREFERENCE',
    ranking: ranked.slice(0, 5).map((branch, index) => ({ actionId: branch.actionKey, score: ranked.length - index })),
  };
}

/** Random over legal actions, deterministic in the record hash so a run reproduces. */
export function randomLegalBaseline(record) {
  const branches = record.branches ?? [];
  if (branches.length === 0) return { actionId: null, confidence: 0, abstain: true };
  const sorted = [...branches].sort((a, b) => (a.actionKey < b.actionKey ? -1 : 1));
  return { actionId: sorted[seededIndex(record.recordHash, sorted.length)].actionKey, confidence: 0, abstain: false };
}

/** The obvious heuristic: take the best immediate step and ignore the horizon. */
export function heuristicGreedyBaseline(record) {
  const branches = record.branches ?? [];
  if (branches.length === 0) return { actionId: null, confidence: 0, abstain: true };
  const best = [...branches].sort((a, b) => (b.immediateScalar - a.immediateScalar)
    || (a.actionKey < b.actionKey ? -1 : 1))[0];
  return { actionId: best.actionKey, confidence: 0.5, abstain: false };
}

/* ---------------------------------------------------------------------------
 * PHASE 26 — legality and parser gate.
 * ------------------------------------------------------------------------- */

export const PARSE_FAILURE_CODES = deepFreeze([
  'MALFORMED_RESPONSE', 'MISSING_ACTION_ID', 'UNKNOWN_ACTION_ID', 'ILLEGAL_ACTION',
  'CONFIDENCE_OUT_OF_RANGE', 'ABSTAIN_WITH_ACTION',
]);

/** Deterministic validation of one candidate answer against one record. */
export function validateAnswer(record, answer) {
  const legal = new Set((record.branches ?? []).map((branch) => branch.actionKey));
  if (answer === null || typeof answer !== 'object') return { valid: false, code: 'MALFORMED_RESPONSE' };
  if (answer.abstain === true) {
    return answer.actionId === null || answer.actionId === undefined
      ? { valid: true, code: null, abstained: true }
      : { valid: false, code: 'ABSTAIN_WITH_ACTION' };
  }
  if (typeof answer.actionId !== 'string' || answer.actionId.length === 0) return { valid: false, code: 'MISSING_ACTION_ID' };
  if (typeof answer.confidence !== 'number' || answer.confidence < 0 || answer.confidence > 1) {
    return { valid: false, code: 'CONFIDENCE_OUT_OF_RANGE' };
  }
  if (!legal.has(answer.actionId)) return { valid: false, code: legal.size === 0 ? 'ILLEGAL_ACTION' : 'UNKNOWN_ACTION_ID' };
  return { valid: true, code: null, abstained: false };
}

/** Score one validated answer against the Forge optimal set. */
export function scoreAnswer(record, answer) {
  const validation = validateAnswer(record, answer);
  const target = buildTarget(record);
  if (!validation.valid) {
    return { ...validation, inOptimalSet: false, regret: null, scored: false };
  }
  if (validation.abstained) {
    return { ...validation, inOptimalSet: false, regret: null, scored: false };
  }
  const branch = (record.branches ?? []).find((entry) => entry.actionKey === answer.actionId);
  return {
    ...validation,
    inOptimalSet: target.optimalSet.includes(answer.actionId),
    regret: record.optimalScalar - branch.scalarReward,
    scored: true,
  };
}

/** Run one policy over a set of records and summarise it the same way for all. */
export function evaluatePolicy(records, policy) {
  const rows = records.map((record) => {
    const answer = policy(record);
    return { record, answer, ...scoreAnswer(record, answer) };
  });
  const scored = rows.filter((row) => row.scored);
  const parseFailures = rows.filter((row) => !row.valid);
  const abstentions = rows.filter((row) => row.valid && row.abstained);
  const regrets = scored.map((row) => row.regret).sort((a, b) => a - b);
  const mean = regrets.length === 0 ? null : Math.round((regrets.reduce((s, v) => s + v, 0) * 100) / regrets.length) / 100;
  return {
    cases: rows.length,
    scored: scored.length,
    parseSuccessRate: rows.length === 0 ? null : Math.round(((rows.length - parseFailures.length) * 10000) / rows.length) / 10000,
    parseFailures: parseFailures.length,
    parseFailureCodes: parseFailures.reduce((counts, row) => {
      counts[row.code] = (counts[row.code] ?? 0) + 1;
      return counts;
    }, {}),
    illegalActionCount: parseFailures.filter((row) => row.code === 'ILLEGAL_ACTION' || row.code === 'UNKNOWN_ACTION_ID').length,
    legalActionRate: rows.length === 0 ? null
      : Math.round(((rows.length - parseFailures.length) * 10000) / rows.length) / 10000,
    abstentionRate: rows.length === 0 ? null : Math.round((abstentions.length * 10000) / rows.length) / 10000,
    optimalSetAccuracy: scored.length === 0 ? null
      : Math.round((scored.filter((row) => row.inOptimalSet).length * 10000) / scored.length) / 10000,
    meanRegret: mean,
    medianRegret: regrets.length === 0 ? null : regrets[Math.floor(regrets.length / 2)],
    worstRegret: regrets.length === 0 ? null : regrets[regrets.length - 1],
    rows,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 6 — base model requirements, and why none could be obtained.
 * ------------------------------------------------------------------------- */

export const STAGE3C_BASE_MODEL_REQUIREMENTS = deepFreeze({
  preferredFamily: 'Qwen',
  sizePolicy: 'SMALLEST_MODEL_CAPABLE_OF_SPECIALIST_PERFORMANCE',
  sizePolicyNote: 'Not the largest that fits. The task is a structured relational choice with a fixed output schema, which is the shape of problem small specialists do well.',
  candidates: deepFreeze([
    { model: 'Qwen2.5-0.5B-Instruct', parameters: '0.5B', contextLength: 32768, license: 'Apache-2.0', rationale: 'first choice: smallest plausible specialist, LoRA-trainable on modest hardware' },
    { model: 'Qwen2.5-1.5B-Instruct', parameters: '1.5B', contextLength: 32768, license: 'Apache-2.0', rationale: 'fallback if 0.5B underfits the relational task' },
    { model: 'Qwen2.5-3B-Instruct', parameters: '3B', contextLength: 32768, license: 'Qwen research license', rationale: 'only if both smaller sizes fail; licence is not Apache-2.0' },
  ]),
  selected: null,
  selectionBlocked: true,
});

/* ---------------------------------------------------------------------------
 * PHASE 27 — promotion firewall.
 *
 * Checked structurally on the source, and mutation-tested, because a firewall that
 * has never rejected anything is not evidence of anything.
 * ------------------------------------------------------------------------- */

export const STAGE3C_FORBIDDEN_STATUSES = deepFreeze(['CERTIFIED_FOR_RUNTIME', 'PRODUCTION', 'LIVE', 'R1']);
export const STAGE3C_PERMITTED_STATUSES = deepFreeze(['CANDIDATE', 'OFFLINE_EVALUATED', 'TRAINED', 'NOT_TRAINED']);

export function assertCandidateStatus(status) {
  if (STAGE3C_FORBIDDEN_STATUSES.includes(status)) {
    return { permitted: false, reason: `STAGE3C_MAY_NOT_ASSIGN_${status}` };
  }
  if (!STAGE3C_PERMITTED_STATUSES.includes(status)) {
    return { permitted: false, reason: 'UNKNOWN_CANDIDATE_STATUS' };
  }
  return { permitted: true, reason: null };
}

/* ---------------------------------------------------------------------------
 * Prime, run frozen, over the same records as every other policy.
 * ------------------------------------------------------------------------- */

export function primeBaseline(records, { simulations = 24 } = {}) {
  const policy = defaultAuthorityPolicy();
  assertEvaluationOnly(policy, 'STAGE3C_PRIME_BASELINE');
  const rows = [];
  for (const record of records) {
    const build = (warmupTicks) => generateScenarioV3({
      shape: record.shape, roles: record.roles, objectives: record.objectives,
      horizonBand: record.horizonBand, level: record.level, seed: Number(record.seed), warmupTicks,
    });
    const warmup = runCalibratedWarmup(Number(record.seed), build);
    if (hashWorld(warmup.world) !== record.worldHash) { rows.push({ record, answer: null, mismatch: true }); continue; }
    const state = forgeAdapterState(warmup.world);
    const recommendation = recommend({ adapter: forgeWorldAdapter, state, observerId: 'sentinel', simulations, seed: 1n });
    const chosenType = recommendation.selected.action.parameters.actionType;
    const chosenTarget = recommendation.selected.action.target?.id ?? null;
    const counterfactuals = evaluateCounterfactualsV2(warmup.world, { horizon: Math.max(1, record.horizon) });
    const branch = counterfactuals.branches.find((entry) =>
      entry.action.actionType === chosenType && (entry.action.target?.id ?? null) === chosenTarget) ?? null;
    rows.push({
      record,
      answer: branch === null ? null : { actionId: branch.actionKey.slice(0, 16), confidence: 0.5, abstain: false },
      mismatch: false,
    });
  }
  return rows;
}

/** Nexus, run frozen, over a record's regenerated world. */
export function nexusFor(record) {
  const build = (warmupTicks) => generateScenarioV3({
    shape: record.shape, roles: record.roles, objectives: record.objectives,
    horizonBand: record.horizonBand, level: record.level, seed: Number(record.seed), warmupTicks,
  });
  const warmup = runCalibratedWarmup(Number(record.seed), build);
  if (hashWorld(warmup.world) !== record.worldHash) return null;
  const observation = observe(warmup.world);
  return evaluateNexus({
    canonicalState: observation.canonicalState,
    legalActions: legalActions(warmup.world).map((action) => ({
      actionId: forgeActionKey(action), targetEntityId: action.target?.id ?? null,
    })),
  });
}

/* ---------------------------------------------------------------------------
 * The blocker, measured.
 * ------------------------------------------------------------------------- */

export const STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS = deepFreeze([
  { id: 'SOUP_INSTALLED', why: 'the stage names Soup as the training engine and pins its commit' },
  { id: 'BASE_MODEL_WEIGHTS', why: 'SFT needs a base model to adapt; no weights, no candidate' },
  { id: 'TRAINING_RUNTIME', why: 'torch or equivalent to compute a gradient' },
  { id: 'ACCELERATOR_OR_VIABLE_CPU_BUDGET', why: 'a candidate that cannot finish training is not a candidate' },
]);

export function classifyBlocker(probe) {
  const missing = STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS
    .filter((requirement) => probe[requirement.id] !== true)
    .map((requirement) => requirement.id);
  return {
    requirements: STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS,
    probe,
    missing,
    blocked: missing.length > 0,
    /* Named as a substrate failure, NOT as a defect in the training pipeline or in
     * the candidate: no pipeline was exercised and no candidate exists, so calling
     * this F_TRAINING_PIPELINE_DEFECT would be a diagnosis of something that was
     * never run. */
    outcome: missing.length > 0 ? 'G_BLOCKED' : null,
    diagnosisClass: missing.length > 0 ? 'ENVIRONMENT_SUBSTRATE_UNAVAILABLE' : null,
    notADatasetLimit: true,
    notAModelCapacityLimit: true,
  };
}

export { SOUP_COMMIT, SOUP_VERSION, denyExecution };
