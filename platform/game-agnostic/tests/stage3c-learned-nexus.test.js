/* Stage 3C — learned Nexus candidate, entry gate, baselines and firewall.
 *
 * The tests that matter are the ones that would catch this stage claiming more
 * than it measured: a status it may not assign, a selector that selects nothing,
 * a rule that carries the filter while firing on every case, an illegal action
 * quietly repaired into a legal one, or a training result reported when nothing
 * was trained.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NEXUS_SELECTOR_NOTE, PARSE_FAILURE_CODES, RULE_INFORMATIVE_MAX, RULE_INFORMATIVE_MIN,
  STAGE3C_BASELINE_IDS, STAGE3C_BASE_MODEL_REQUIREMENTS, STAGE3C_FORBIDDEN_STATUSES,
  STAGE3C_PERMITTED_STATUSES, STAGE3C_SELECTION_DISCIPLINE, STAGE3C_SELECTION_RULES,
  STAGE3C_TASK_CONTRACT, STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS,
  assertCandidateStatus, buildTarget, classifyBlocker, classifyRuleMatches, classifySelection,
  evaluatePolicy, heuristicGreedyBaseline, measureRuleBaseRates, randomLegalBaseline,
  scoreAnswer, selectRelationalCases, validateAnswer,
} from '../src/lab/stage3c-learned-nexus.js';

const record = (overrides = {}) => ({
  recordHash: 'a'.repeat(64),
  entityCount: 10, relationCount: 12, legalActionCount: 4, energy: 20,
  utilitySpread: 30, optimalScalar: 100, horizonClass: 'HORIZON_DEPENDENT',
  tieClass: 'HORIZON_ALIASING', supervisionClass: 'UNIQUE_OPTIMUM',
  branches: [
    { actionKey: 'act-a', actionType: 'REPAIR', targetId: 'n1', scalarReward: 100, immediateScalar: 10, terminal: false },
    { actionKey: 'act-b', actionType: 'REINFORCE', targetId: 'n2', scalarReward: 80, immediateScalar: 40, terminal: false },
    { actionKey: 'act-c', actionType: 'PROTECT', targetId: 'n3', scalarReward: 70, immediateScalar: 5, terminal: false },
    { actionKey: 'act-d', actionType: 'WAIT', targetId: null, scalarReward: 70, immediateScalar: 1, terminal: false },
  ],
  ...overrides,
});

/* ---------------------------------------------------------------------------
 * The promotion firewall.
 * ------------------------------------------------------------------------- */

test('Stage 3C may not assign any runtime-promoting status', () => {
  for (const status of STAGE3C_FORBIDDEN_STATUSES) {
    const result = assertCandidateStatus(status);
    assert.equal(result.permitted, false, status);
    assert.match(result.reason, /MAY_NOT_ASSIGN/);
  }
  assert.deepEqual([...STAGE3C_FORBIDDEN_STATUSES], ['CERTIFIED_FOR_RUNTIME', 'PRODUCTION', 'LIVE', 'R1']);
});

test('Stage 3C may assign only candidate-level statuses, and rejects unknown ones', () => {
  for (const status of STAGE3C_PERMITTED_STATUSES) assert.equal(assertCandidateStatus(status).permitted, true, status);
  assert.equal(assertCandidateStatus('SOMETHING_ELSE').permitted, false);
  assert.equal(assertCandidateStatus('SOMETHING_ELSE').reason, 'UNKNOWN_CANDIDATE_STATUS');
});

test('the live decision path never imports the stage or a candidate', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['../src/experts/nexus.js', '../src/prime/root-puct.js', '../src/forge/adapter.js', '../src/forge/kernel.js']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const specifiers = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    assert.ok(!specifiers.some((entry) => /stage3c|soup|candidate|learned/i.test(entry)), `${file} references a candidate`);
  }
});

/* ---------------------------------------------------------------------------
 * Nothing was trained, and the stage says so.
 * ------------------------------------------------------------------------- */

test('an absent training substrate is classified as environment, not as a pipeline or model defect', () => {
  const blocker = classifyBlocker({
    SOUP_INSTALLED: false, BASE_MODEL_WEIGHTS: false, TRAINING_RUNTIME: false, ACCELERATOR_OR_VIABLE_CPU_BUDGET: false,
  });
  assert.equal(blocker.blocked, true);
  assert.equal(blocker.outcome, 'G_BLOCKED');
  assert.equal(blocker.diagnosisClass, 'ENVIRONMENT_SUBSTRATE_UNAVAILABLE');
  assert.equal(blocker.notADatasetLimit, true);
  assert.equal(blocker.notAModelCapacityLimit, true);
  assert.equal(blocker.missing.length, STAGE3C_TRAINING_SUBSTRATE_REQUIREMENTS.length);
});

test('a complete substrate would not be blocked', () => {
  const blocker = classifyBlocker({
    SOUP_INSTALLED: true, BASE_MODEL_WEIGHTS: true, TRAINING_RUNTIME: true, ACCELERATOR_OR_VIABLE_CPU_BUDGET: true,
  });
  assert.equal(blocker.blocked, false);
  assert.equal(blocker.outcome, null);
});

test('no base model was selected, and the requirements say why', () => {
  assert.equal(STAGE3C_BASE_MODEL_REQUIREMENTS.selected, null);
  assert.equal(STAGE3C_BASE_MODEL_REQUIREMENTS.selectionBlocked, true);
  assert.equal(STAGE3C_BASE_MODEL_REQUIREMENTS.sizePolicy, 'SMALLEST_MODEL_CAPABLE_OF_SPECIALIST_PERFORMANCE');
  assert.ok(STAGE3C_BASE_MODEL_REQUIREMENTS.candidates.length >= 2);
});

test('the certification reports no trained candidate and no training result', async () => {
  const { readFile } = await import('node:fs/promises');
  const certification = JSON.parse(await readFile(
    new URL('../artifacts/stage3c-learned-nexus/stage3c-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(certification.status, 'BLOCKED');
  assert.equal(certification.stage3cOutcome, 'G_BLOCKED');
  assert.equal(certification.stage3cCertified, false);
  assert.equal(certification.training.sftCompleted, false);
  assert.equal(certification.training.candidateArtifactHash, null);
  assert.equal(certification.training.candidateStatus, 'NOT_TRAINED');
  assert.equal(certification.holdoutUntouched, true);
  assert.equal(certification.oodUntouched, true);
  /* No learned metric may appear anywhere in the body. */
  const body = JSON.stringify(certification);
  assert.ok(!/learnedNexusAccuracy|learnedHoldoutAccuracy|learnedOodAccuracy/.test(body));
});

test('training reproducibility is not claimed, because it was not measured', async () => {
  const { readFile } = await import('node:fs/promises');
  const reproducibility = JSON.parse(await readFile(
    new URL('../artifacts/stage3c-learned-nexus/stage3c-reproducibility.json', import.meta.url), 'utf8'));
  assert.equal(reproducibility.TRAINING_BITWISE_REPRODUCIBLE, null);
  assert.equal(reproducibility.TRAINING_STATISTICALLY_REPRODUCIBLE, null);
  assert.equal(reproducibility.DATASET_REPRODUCIBLE, true);
  assert.match(reproducibility.TRAINING_REPRODUCIBILITY_BASIS, /NOT_MEASURED/);
});

/* ---------------------------------------------------------------------------
 * Selection must actually select, and on structure rather than labels.
 * ------------------------------------------------------------------------- */

test('selection rules read measured quantities, never generator shape or role names', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/lab/stage3c-learned-nexus.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('export function classifyRuleMatches'), source.indexOf('export function classifySelection'));
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/record\.shape\s*===/.test(code), 'selection must not key on a shape name');
  assert.ok(!/record\.roles\s*===/.test(code), 'selection must not key on a role name');
});

test('a rule that fires on every record is excluded from carrying the selection', () => {
  const constantRecords = Array.from({ length: 200 }, (unused, index) =>
    record({ recordHash: String(index).padStart(64, '0') }));
  const baseRates = measureRuleBaseRates(constantRecords);
  const constant = baseRates.rules.filter((rule) => rule.baseRate >= RULE_INFORMATIVE_MAX);
  assert.ok(constant.length > 0, 'the fixture should contain at least one constant rule');
  for (const rule of constant) {
    assert.equal(rule.informative, false);
    assert.equal(rule.excludedReason, 'CONSTANT_ON_THIS_CORPUS_FIRES_ON_ALMOST_EVERY_RECORD');
    assert.ok(!baseRates.informativeRuleIds.includes(rule.id));
  }
});

test('a rule that fires on nothing is also excluded', () => {
  const baseRates = measureRuleBaseRates([record()]);
  const empty = baseRates.rules.filter((rule) => rule.baseRate <= RULE_INFORMATIVE_MIN);
  assert.ok(empty.length > 0);
  for (const rule of empty) assert.equal(rule.excludedReason, 'NEARLY_EMPTY_ON_THIS_CORPUS');
});

test('selection needs two INFORMATIVE matches, so constants cannot admit everything', () => {
  const baseRates = { informativeRuleIds: ['DEPENDENCY_CHAIN', 'CYCLE'] };
  const one = selectRelationalCases([record({ tieClass: 'GENUINE_STRATEGIC_EQUIVALENCE' })], baseRates)[0];
  assert.equal(one.informativeMatches.length, 1);
  assert.equal(one.relationallyMeaningful, false);
  const two = selectRelationalCases([record()], baseRates)[0];
  assert.equal(two.informativeMatches.length, 2);
  assert.equal(two.relationallyMeaningful, true);
});

test('a negative control is never selected as relationally meaningful', () => {
  const baseRates = { informativeRuleIds: ['DEPENDENCY_CHAIN', 'CYCLE', 'BRIDGE'] };
  const flat = selectRelationalCases([record({ utilitySpread: 0 })], baseRates)[0];
  assert.equal(flat.negativeControl, true);
  assert.equal(flat.relationallyMeaningful, false);
  assert.ok(classifyRuleMatches(record({ relationCount: 0 })).includes('NEGATIVE_CONTROL_NO_RELATIONS'));
  assert.ok(classifyRuleMatches(record({ legalActionCount: 1 })).includes('NEGATIVE_CONTROL_SINGLE_ACTION'));
});

test('the selection actually reduces the corpus rather than passing it through', async () => {
  const { readFile } = await import('node:fs/promises');
  const selection = JSON.parse(await readFile(
    new URL('../artifacts/stage3c-learned-nexus/stage3c-training-selection.json', import.meta.url), 'utf8'));
  assert.ok(selection.selectionRate > 0.02, 'selection must keep something');
  assert.ok(selection.selectionRate < 0.9, 'a selector that keeps almost everything is not selecting');
  assert.equal(STAGE3C_SELECTION_DISCIPLINE.selectsOn, 'WORLD_STRUCTURE');
  assert.ok(STAGE3C_SELECTION_DISCIPLINE.neverSelectsOn.includes('model output'));
  assert.ok(STAGE3C_SELECTION_RULES.some((rule) => rule.negativeControl === true));
});

/* ---------------------------------------------------------------------------
 * Targets keep the optimal set.
 * ------------------------------------------------------------------------- */

test('an exact tie is preserved as a set and never collapsed into one label', () => {
  const target = buildTarget(record({
    supervisionClass: 'EXACT_EQUIVALENCE',
    branches: [
      { actionKey: 'act-a', actionType: 'REPAIR', targetId: 'n1', scalarReward: 100, immediateScalar: 5, terminal: false },
      { actionKey: 'act-b', actionType: 'REINFORCE', targetId: 'n2', scalarReward: 100, immediateScalar: 9, terminal: false },
    ],
  }));
  assert.equal(target.exactTie, true);
  assert.deepEqual(target.optimalSet, ['act-a', 'act-b']);
  assert.equal(target.singleTargetSftEligible, false);
  assert.equal(target.setTargetEligible, true);
  assert.equal(target.tieHandling, 'OPTIMAL_SET_PRESERVED_NEVER_COLLAPSED');
});

test('unresolved and tradeoff classes are excluded from single-target SFT', () => {
  for (const cls of ['INSUFFICIENTLY_RESOLVED', 'NEAR_TIE', 'PARETO_TRADEOFF']) {
    assert.equal(buildTarget(record({ supervisionClass: cls })).excludedFromSft, true, cls);
  }
});

/* ---------------------------------------------------------------------------
 * Legality can never be bypassed.
 * ------------------------------------------------------------------------- */

test('an illegal action is counted as illegal, never repaired into a legal one', () => {
  const scored = scoreAnswer(record(), { actionId: 'not-a-real-action', confidence: 0.9, abstain: false });
  assert.equal(scored.valid, false);
  assert.equal(scored.code, 'UNKNOWN_ACTION_ID');
  assert.equal(scored.inOptimalSet, false);
  assert.equal(scored.regret, null);
  assert.equal(scored.scored, false);
});

test('every parse failure mode is named and detected', () => {
  assert.equal(validateAnswer(record(), null).code, 'MALFORMED_RESPONSE');
  assert.equal(validateAnswer(record(), {}).code, 'MISSING_ACTION_ID');
  assert.equal(validateAnswer(record(), { actionId: 'act-a', confidence: 5, abstain: false }).code, 'CONFIDENCE_OUT_OF_RANGE');
  assert.equal(validateAnswer(record(), { actionId: 'act-a', confidence: 1, abstain: true }).code, 'ABSTAIN_WITH_ACTION');
  assert.equal(validateAnswer(record(), { actionId: null, confidence: 0, abstain: true }).valid, true);
  for (const code of ['MALFORMED_RESPONSE', 'MISSING_ACTION_ID', 'UNKNOWN_ACTION_ID', 'CONFIDENCE_OUT_OF_RANGE', 'ABSTAIN_WITH_ACTION']) {
    assert.ok(PARSE_FAILURE_CODES.includes(code), code);
  }
});

test('an abstention is not scored as a wrong answer', () => {
  const scored = scoreAnswer(record(), { actionId: null, confidence: 0, abstain: true });
  assert.equal(scored.valid, true);
  assert.equal(scored.abstained, true);
  assert.equal(scored.scored, false);
  assert.equal(scored.regret, null);
});

test('a correct answer scores zero regret and lands in the optimal set', () => {
  const scored = scoreAnswer(record(), { actionId: 'act-a', confidence: 0.8, abstain: false });
  assert.equal(scored.valid, true);
  assert.equal(scored.inOptimalSet, true);
  assert.equal(scored.regret, 0);
});

/* ---------------------------------------------------------------------------
 * Baselines.
 * ------------------------------------------------------------------------- */

test('the random baseline is deterministic in the record hash', () => {
  const first = randomLegalBaseline(record());
  const second = randomLegalBaseline(record());
  assert.equal(first.actionId, second.actionId);
});

test('the greedy heuristic takes the best immediate step, which is not the optimum here', () => {
  const answer = heuristicGreedyBaseline(record());
  assert.equal(answer.actionId, 'act-b');
  assert.equal(scoreAnswer(record(), answer).inOptimalSet, false);
});

test('every policy is summarised by the same function, so baselines are comparable', () => {
  const records = [record(), record({ recordHash: 'b'.repeat(64) })];
  const summary = evaluatePolicy(records, heuristicGreedyBaseline);
  assert.equal(summary.cases, 2);
  assert.equal(summary.legalActionRate, 1);
  assert.equal(summary.parseSuccessRate, 1);
  assert.equal(summary.illegalActionCount, 0);
  assert.equal(typeof summary.optimalSetAccuracy, 'number');
  assert.equal(typeof summary.meanRegret, 'number');
});

test('the Nexus-based selector is labelled a selector, not deterministic Nexus itself', () => {
  assert.ok(STAGE3C_BASELINE_IDS.includes('NEXUS_RELATIONAL_SELECTOR_V1'));
  assert.ok(!STAGE3C_BASELINE_IDS.includes('DETERMINISTIC_NEXUS'));
  assert.match(NEXUS_SELECTOR_NOTE, /BUILT ON deterministic Nexus, not Nexus itself/);
  assert.match(NEXUS_SELECTOR_NOTE, /no per-action output/);
});

/* ---------------------------------------------------------------------------
 * The task contract.
 * ------------------------------------------------------------------------- */

test('the task contract is a structured expert task with abstention, not free generation', () => {
  assert.equal(STAGE3C_TASK_CONTRACT.framing, 'STRUCTURED_EXPERT_TASK_NOT_FREE_GENERATION');
  assert.equal(STAGE3C_TASK_CONTRACT.hiddenChainOfThoughtRequired, false);
  assert.deepEqual(STAGE3C_TASK_CONTRACT.schema.required, ['actionId', 'confidence', 'abstain']);
  assert.match(STAGE3C_TASK_CONTRACT.legalityRule, /never silently repaired/);
});

/* ---------------------------------------------------------------------------
 * The distribution audit must not report a number it cannot compute.
 * ------------------------------------------------------------------------- */

test('the distribution audit omits selection counts rather than reporting them as zero', async () => {
  const { auditTrainingDistribution } = await import('../src/lab/stage3c-learned-nexus.js');
  const audit = auditTrainingDistribution([record(), record({ recordHash: 'c'.repeat(64) })]);
  /* relationallyMeaningful depends on corpus-wide rule informativeness, so it
   * cannot be recomputed per record. An earlier version called the per-record
   * classifier and reported 0 on a subset that was entirely meaningful. */
  assert.ok(!Object.hasOwn(audit, 'relationallyMeaningful'));
  assert.ok(!Object.hasOwn(audit, 'negativeControls'));
  assert.equal(audit.selectionCountsReportedIn, 'stage3c-training-selection.json');
});

test('domination is checked on topology as well as level', async () => {
  const { auditTrainingDistribution } = await import('../src/lab/stage3c-learned-nexus.js');
  const skewed = [
    ...Array.from({ length: 9 }, (unused, index) => record({ shape: 'mesh', recordHash: `${index}`.padStart(64, '0') })),
    record({ shape: 'chain', recordHash: 'f'.repeat(64) }),
  ];
  const audit = auditTrainingDistribution(skewed);
  assert.equal(audit.domination.topologyDominated, true);
  assert.ok(audit.domination.topTwoTopologyShare > 0.5);
  assert.match(audit.domination.topologyFinding, /SELECTION_SKEWED_TOWARD_DENSE_TOPOLOGIES/);
  assert.equal(audit.domination.topTwoTopologies[0].shape, 'mesh');
});

test('the shipped distribution reports its own topology skew rather than hiding it', async () => {
  const { readFile } = await import('node:fs/promises');
  const audit = JSON.parse(await readFile(
    new URL('../artifacts/stage3c-learned-nexus/stage3c-training-distribution.json', import.meta.url), 'utf8'));
  assert.equal(audit.domination.levelDominated, false, 'no single curriculum level should dominate');
  assert.equal(typeof audit.domination.topTwoTopologyShare, 'number');
  if (audit.domination.topologyDominated) {
    assert.ok(audit.domination.topologyFinding !== null, 'a dominated selection must say so');
  }
});
