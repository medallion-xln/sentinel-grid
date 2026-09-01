import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { sha256 } from '../src/core/determinism.js';
import {
  STAGE2L10_FROZEN_CALIBRATION,
  STAGE2L10_MIN_BUCKET_RELIABILITY,
  STAGE2L10_MIN_BUCKET_SAMPLES,
} from '../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js';
import {
  STAGE2L11_DISCOVERY_CASES,
  STAGE2L11_FEATURE_TIERS,
  STAGE2L11_HOLDOUT_CASES,
  STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE,
  STAGE2L11_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L11_MIN_BUCKET_RELIABILITY,
  STAGE2L11_MIN_BUCKET_SAMPLES,
  STAGE2L11_NEXUS_ALIGNMENT_RATE,
  STAGE2L11_STAGE,
  STAGE2L11_STAGE2L10_OWNER_SHA256,
  STAGE2L11_STATUSES,
  STAGE2L11_TOPOLOGY_FAMILIES,
  analyzeStage2L11Identifiability,
  buildStage2L11Case,
  buildStage2L11Evaluation,
  buildStage2L11PortabilityDigest,
  certifyStage2L11,
  classifyStage2L11,
  discoverStage2L11Rule,
  flattenFeatures,
  runStage2L11,
  runStage2L11SecurityRegression,
  stage2L11Alignment,
  stage2L11Context,
  testStage2L11Generalization,
} from '../src/lab/stage2l11-nexus-semantic-identifiability-and-decision-utility.js';

const evaluation = buildStage2L11Evaluation();
const certification = certifyStage2L11({ evaluation });

/* ---------------------------------------------------------------------------
 * Freeze — a measurement stage that re-measured a mutated subject is worthless
 * ------------------------------------------------------------------------- */

test('the Stage 2L.10 arbiter is imported byte-for-byte frozen', async () => {
  const source = await readFile(new URL('../src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), STAGE2L11_STAGE2L10_OWNER_SHA256);
});

test('no inherited threshold is loosened', () => {
  assert.equal(STAGE2L11_MIN_BUCKET_RELIABILITY, STAGE2L10_MIN_BUCKET_RELIABILITY);
  assert.equal(STAGE2L11_MIN_BUCKET_SAMPLES, STAGE2L10_MIN_BUCKET_SAMPLES);
  assert.equal(STAGE2L11_MAX_HARMFUL_CHANGE_RATE, 0.01);
  assert.equal(STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE, 0.01);
  assert.equal(certification.freeze.thresholdsUnchanged, true);
  assert.equal(certification.freeze.nexusChanged, false);
  assert.equal(certification.freeze.arbiterChanged, false);
  assert.equal(certification.freeze.calibrationChanged, false);
  assert.equal(certification.freeze.stage2l10CalibrationDigest, STAGE2L10_FROZEN_CALIBRATION.calibrationDigest);
});

test('the declared alignment rate is inherited unchanged from Stage 2L.9 and 2L.10', () => {
  assert.equal(STAGE2L11_NEXUS_ALIGNMENT_RATE, 0.7);
  assert.equal(evaluation.corpus.declaredAlignmentRate, 0.7);
});

/* ---------------------------------------------------------------------------
 * The semantic generation audit
 * ------------------------------------------------------------------------- */

test('the semantic truth variable is a hidden draw no decision-time actor can see', () => {
  const audit = evaluation.audit;
  assert.equal(audit.semanticTruthSource, 'INDEPENDENT_SEEDED_DRAW');
  assert.equal(audit.semanticTruthDecisionTimeObservable, false);
  assert.equal(audit.hiddenRandomnessInvolved, true);
  assert.equal(audit.hiddenRandomnessIndependentOfObservables, true);
  for (const source of audit.randomnessSources.filter((entry) => entry.drives.startsWith('nexusAligned'))) {
    assert.equal(source.visibleToNexus, false);
    assert.equal(source.visibleToArbiter, false);
    assert.equal(source.visibleToPrime, false);
    assert.equal(source.availableAtRealDecisionTime, false);
  }
});

test('among delegation opportunities, Nexus correctness reduces exactly to the hidden draw', () => {
  assert.equal(evaluation.audit.correctnessReducesToHiddenDrawAmongOpportunities, true);
  for (const row of evaluation.rows.filter((entry) => entry.delegationOpportunity)) {
    assert.equal(row.expertCorrect, row.aligned, `${row.caseId} broke the identity`);
  }
});

test('the alignment draw is on a stream separate from topology', () => {
  // Same index, different derived streams: changing one cannot move the other.
  const alignments = Array.from({ length: 400 }, (unused, i) => stage2L11Alignment('HOLDOUT', i));
  const families = Array.from({ length: 400 }, (unused, i) => stage2L11Context('HOLDOUT', i).familyIndex);
  const byFamily = new Map();
  for (let i = 0; i < alignments.length; i += 1) {
    if (!byFamily.has(families[i])) byFamily.set(families[i], []);
    byFamily.get(families[i]).push(alignments[i]);
  }
  // No family may be degenerate in alignment — that would be a leaked correlation.
  for (const [family, values] of byFamily) {
    if (values.length < 20) continue;
    const rate = values.filter(Boolean).length / values.length;
    assert.ok(rate > 0.4 && rate < 0.95, `family ${family} alignment rate ${rate} looks correlated with topology`);
  }
});

/* ---------------------------------------------------------------------------
 * Corpus adequacy — a null result only means something if the test could detect
 * ------------------------------------------------------------------------- */

test('the corpus spans twelve topology families and every attainable stress cell is populated', () => {
  assert.equal(STAGE2L11_TOPOLOGY_FAMILIES.length, 12);
  const coverage = evaluation.coverage;
  assert.equal(coverage.allAttainableCellsPopulated, true);
  for (const cell of ['denseNexusCorrect', 'denseNexusWrong', 'sparseNexusCorrect', 'sparseNexusWrong',
    'highSupportNexusWrong', 'lowSupportNexusCorrect', 'primeCorrectNexusWrong', 'primeWrongNexusCorrect',
    'conflictingRelations', 'incompleteRelations', 'ambiguousCriticalityTopology', 'cyclicTopology',
    'multiComponentTopology', 'multipleCriticalNodes']) {
    assert.ok(coverage[cell] > 0, `stress cell ${cell} is empty`);
  }
});

test('the two empty cells are empty by logic, not by omission', () => {
  const coverage = evaluation.coverage;
  // A correct Nexus and a correct Prime would pick the same action, so there is
  // no delegation opportunity to observe.
  assert.equal(coverage.logicallyEmptyCells.primeCorrectNexusCorrect, 0);
  // Families with no single point of failure give Nexus nothing to recommend.
  assert.equal(coverage.logicallyEmptyCells.noCriticalityFamilyOpportunities, 0);
  assert.ok(coverage.corpusLevel.denseMeshCases > 0);
  assert.ok(coverage.corpusLevel.ambiguousEquivalentPathCases > 0);
  assert.ok(coverage.corpusLevel.redundantParallelCases > 0);
  assert.ok(coverage.corpusLevel.noCriticalitySilentCases > 0);
});

test('the analysis searches all four feature tiers, not just what the Arbiter sees', () => {
  assert.deepEqual(evaluation.analysis.tiersInspected, [...STAGE2L11_FEATURE_TIERS]);
  const tiers = new Set(evaluation.analysis.perFeature.map((entry) => entry.tier));
  for (const tier of STAGE2L11_FEATURE_TIERS) assert.ok(tiers.has(tier), `${tier} absent from the search`);
  assert.ok(evaluation.analysis.featuresVarying >= 20, 'too few varying features to conclude anything');
  assert.ok(evaluation.analysis.predicatesEvaluable >= 50);
});

test('features constant under conditioning are reported rather than silently counted as null results', () => {
  const constant = evaluation.analysis.featuresConstantUnderConditioning;
  assert.ok(Array.isArray(constant));
  // candidateIsSpof must be constant: being an opportunity requires it true.
  assert.ok(constant.includes('exposed.candidateIsSpof'));
  assert.ok(constant.includes('exposed.redundantPathPresent'));
});

/* ---------------------------------------------------------------------------
 * Identifiability
 * ------------------------------------------------------------------------- */

test('no legitimate feature beats the permutation null', () => {
  const analysis = evaluation.analysis;
  assert.equal(analysis.observedExceedsPermutationP95, false);
  assert.ok(analysis.observedBestGap < analysis.permutationNull.p95);
  // The strong form: shuffled labels produce a LARGER apparent signal.
  assert.ok(analysis.observedBestGap < analysis.permutationNull.median);
});

test('no predicate anywhere reaches the inherited reliability floor', () => {
  assert.equal(evaluation.analysis.anyPredicateReachesReliabilityFloor, false);
  for (const entry of evaluation.analysis.topByReliability) {
    assert.ok(entry.bestSideReliability < STAGE2L11_MIN_BUCKET_RELIABILITY);
  }
});

test('a rule frozen on discovery collapses on holdout', () => {
  const generalization = evaluation.generalization;
  assert.equal(generalization.applicable, true);
  assert.equal(generalization.holdoutReachesFloor, false);
  assert.equal(generalization.collapsedToBaseRate, true);
  assert.ok(generalization.reliabilityLostFromDiscoveryToHoldout > 0,
    'a genuine signal would not lose reliability out of sample');
  assert.ok(Math.abs(generalization.holdoutReliability - generalization.holdoutBaseRate) < 0.05);
});

test('the discovery search was generous, not a token effort', () => {
  const space = evaluation.ruleSearch.searchSpace;
  assert.ok(space.singles > 100, 'too few single predicates searched');
  assert.ok(space.conjunctions > 500, 'too few conjunctions searched');
  assert.ok(space.conjunctionsEvaluable > 0);
});

test('the classification is NON_IDENTIFIABLE_CURRENT_TASK with stated reasons', () => {
  assert.ok(STAGE2L11_STATUSES.includes(certification.identifiability.status));
  assert.equal(certification.identifiability.status, 'NON_IDENTIFIABLE_CURRENT_TASK');
  assert.ok(certification.identifiability.reasons.length >= 3);
  for (const reason of certification.identifiability.reasons) assert.ok(reason.length > 20);
});

test('CONTRACT_INCOMPLETE is empirically excluded, not merely doubted', () => {
  const perTier = certification.identifiability.perTierBestGap;
  const exposed = perTier.TIER_EXPOSED;
  const widest = Math.max(perTier.TIER_COMPUTED, perTier.TIER_EXPERT, perTier.TIER_CONTEXT);
  // Fields outside the exposed contract carry no more signal than the exposed
  // ones, so widening the contract cannot help.
  assert.ok(widest <= exposed + 0.001, 'a wider tier out-performed the exposed tier');
  assert.ok(widest < certification.identifiability.permutationNull.p95);
  assert.equal(certification.identifiability.internalSignalExists, false);
  assert.equal(certification.identifiability.internalSignalExposed, false);
  assert.equal(certification.interpretation.remediationClass, 'CORPUS_SEMANTICS');
});

test('the classifier would return IDENTIFIABLE if a rule actually generalized', () => {
  const result = classifyStage2L11({
    analysis: evaluation.analysis,
    generalization: { ...evaluation.generalization, holdoutReachesFloor: true, holdoutReliability: 0.995, holdoutSelected: 500 },
    coverage: evaluation.coverage,
    audit: evaluation.audit,
  });
  assert.equal(result.status, 'IDENTIFIABLE');
});

test('the classifier returns INCONCLUSIVE when the search lacked power', () => {
  const result = classifyStage2L11({
    analysis: { ...evaluation.analysis, opportunities: 100, featuresVarying: 2, predicatesEvaluable: 3 },
    generalization: evaluation.generalization,
    coverage: evaluation.coverage,
    audit: evaluation.audit,
  });
  assert.equal(result.status, 'INCONCLUSIVE');
});

/* ---------------------------------------------------------------------------
 * Methodology
 * ------------------------------------------------------------------------- */

test('discovery and holdout are disjoint', () => {
  assert.equal(evaluation.corpus.corpusOverlap, 0);
  assert.equal(evaluation.corpus.calibrationHoldoutSeparate, true);
  assert.equal(evaluation.corpus.discoveryCases, STAGE2L11_DISCOVERY_CASES);
  assert.equal(evaluation.corpus.holdoutCases, STAGE2L11_HOLDOUT_CASES);
});

test('rule discovery refuses holdout rows and generalization refuses discovery rows', () => {
  const holdoutRows = evaluation.rows.slice(0, 5);
  assert.throws(() => discoverStage2L11Rule(holdoutRows), /STAGE2L11_DISCOVERY_SPLIT_VIOLATION/);
  const discovery = discoverStage2L11Rule(runStage2L11([buildStage2L11Case('DISCOVERY', 0)]));
  assert.throws(() => testStage2L11Generalization(discovery, runStage2L11([buildStage2L11Case('DISCOVERY', 1)])), /STAGE2L11_HOLDOUT_SPLIT_VIOLATION/);
});

test('no outcome label reaches the arbiter input', () => {
  assert.equal(evaluation.labelLeakage.labelLeakageDetected, false);
  assert.deepEqual(evaluation.labelLeakage.forbiddenKeysPresent, []);
  assert.deepEqual(evaluation.labelLeakage.correctnessSensitiveGroups, []);
});

test('the feature vector handed to the analysis contains no outcome', () => {
  const record = buildStage2L11Case('HOLDOUT', 17);
  const [row] = runStage2L11([record]);
  const features = flattenFeatures(row);
  for (const forbidden of ['expertCorrect', 'aligned', 'truthAction', 'primeCorrect', 'selectedCorrect', 'caseId']) {
    assert.ok(!(forbidden in features), `${forbidden} leaked into the feature vector`);
  }
});

test('replay is byte-equivalent', () => {
  assert.equal(evaluation.replay.replayEquivalent, true);
  assert.equal(evaluation.replay.rowDigest, evaluation.replay.replayDigest);
});

test('the identifiability analysis is deterministic', () => {
  const rows = runStage2L11(Array.from({ length: 400 }, (unused, v) => buildStage2L11Case('HOLDOUT', v)));
  const first = analyzeStage2L11Identifiability(rows, { permutations: 5 });
  const second = analyzeStage2L11Identifiability(rows, { permutations: 5 });
  assert.equal(sha256(first), sha256(second));
});

/* ---------------------------------------------------------------------------
 * Delegation and inherited security, on topology the calibration never saw
 * ------------------------------------------------------------------------- */

test('Nexus still delegates nothing under the unmodified Stage 2L.10 calibration', () => {
  assert.equal(certification.delegation.nexusDelegations, 0);
  assert.equal(certification.delegation.nexusCorrectnessDiscrimination, 0);
  assert.ok(certification.delegation.inheritedDelegations > 0,
    'the inherited Arbiter must have wanted to delegate, or the abstention proves nothing');
});

test('zero harm and zero correct-Prime breaks on twelve unseen topology families', () => {
  assert.equal(certification.delegation.nexusHarmfulChanges, 0);
  assert.equal(certification.delegation.nexusCorrectPrimeBreaks, 0);
  assert.ok(certification.delegation.nexusHarmRate <= STAGE2L11_MAX_HARMFUL_CHANGE_RATE);
  assert.ok(certification.delegation.nexusCorrectPrimeBreakRate <= STAGE2L11_MAX_CORRECT_PRIME_BREAK_RATE);
  assert.equal(certification.delegation.harmCeilingRespected, true);
  assert.equal(certification.delegation.correctPrimeBreakCeilingRespected, true);
});

test('the abstention is measured, not assumed: correct Nexus opportunities were declined', () => {
  assert.ok(certification.delegation.expertCorrectAbstained > 0);
  assert.equal(certification.delegation.expertCorrectDelegated, 0);
  assert.equal(certification.delegation.expertWrongDelegated, 0);
});

test('every inherited protection holds on the new topology', () => {
  const security = runStage2L11SecurityRegression();
  for (const [name, passed] of Object.entries(security)) {
    assert.equal(passed, true, `${name} regressed`);
  }
  assert.equal(certification.securityRegressionPass, true);
});

test('authority stays R0 and nothing is dispatched or mutated', () => {
  assert.equal(certification.authority, 'R0');
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.arbiterShadowOnly, true);
  assert.equal(certification.finalRecommendationOwner, 'PRIME');
  assert.equal(certification.liveActionDispatches, 0);
  assert.equal(certification.worldMutations, 0);
  assert.equal(certification.authorityEscalations, 0);
  assert.equal(certification.security.r0Boundary, true);
});

test('no live ZekNova decision delta is claimed and portability is not overstated', () => {
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
  assert.match(certification.portabilityNote, /DIGEST_PRODUCED_SINGLE_PLATFORM/);
});

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

test('the stage passes because it answered the question, not because Nexus is useful', () => {
  assert.equal(certification.stageKind, 'MEASUREMENT_AND_CERTIFICATION');
  assert.equal(certification.identifiabilityQuestionAnswered, true);
  assert.equal(certification.conclusionReproducible, true);
  assert.equal(certification.stage2l11Certified, true);
  assert.equal(certification.status, 'PASS');
  // ...while the measured verdict on Nexus itself is negative.
  assert.equal(certification.interpretation.currentNexusSafeForSelectiveDelegation, false);
  assert.equal(certification.interpretation.currentContractSufficient, false);
  assert.equal(certification.interpretation.nexusRemediationRequired, true);
});

test('the certification is self-consistent and reproducible', () => {
  const { certificationHash, ...body } = certification;
  assert.equal(sha256(body), certificationHash);
  assert.equal(certification.stage, STAGE2L11_STAGE);
  const portability = buildStage2L11PortabilityDigest(certification);
  assert.equal(portability.digest, buildStage2L11PortabilityDigest(certification).digest);
});

test('the stored certification artifact reproduces the recomputed certification', async () => {
  const stored = JSON.parse(await readFile(new URL('../artifacts/stage2l11-nexus-semantic-identifiability-and-decision-utility/stage2l11-certification-result.json', import.meta.url), 'utf8'));
  assert.equal(stored.certificationHash, certification.certificationHash);
  assert.equal(stored.status, 'PASS');
  assert.equal(stored.identifiability.status, 'NON_IDENTIFIABLE_CURRENT_TASK');
});

test('the contract map separates computed, exposed and consumed information', () => {
  const map = certification.contractMap;
  assert.ok(map.counts.nexusDerivedSignalCount > map.counts.nexusExposedSignalCount);
  assert.ok(map.counts.nexusExposedSignalCount > map.counts.arbiterConsumedSignalCount);
  assert.equal(map.informationLoss.internalInformationLossDetected, true);
  assert.ok(map.informationLoss.computedButNotExposed.length > 0);
  assert.ok(map.informationLoss.expertContractNotInArbiterPath.length > 0);
  // Loss exists, but the identifiability result shows it is loss of
  // uninformative fields — which is why the verdict is not CONTRACT_INCOMPLETE.
  assert.equal(certification.identifiability.status, 'NON_IDENTIFIABLE_CURRENT_TASK');
});

test('the defect is located in corpus semantics and world-state observability', () => {
  assert.equal(certification.interpretation.defectLocus, 'CORPUS_SEMANTICS_AND_WORLD_STATE_OBSERVABILITY');
  assert.match(certification.interpretation.minimumContractChangeRequired, /cannot help/);
  assert.ok(certification.interpretation.whatWouldMakeItObservable.length >= 3);
});
