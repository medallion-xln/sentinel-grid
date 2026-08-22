import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import { analyzeRelationalDelta, buildStage2K0Corpus, buildStage2K0NexusDiagnostic, relationalReference, STAGE2K0_EXPECTED_NEXUS_CORPUS_DIGEST, STAGE2K0_STAGE2J1_CERTIFICATION_HASH } from '../src/lab/stage2k0-nexus-relational-diagnostic.js';

let cached;
const build = () => cached ??= buildStage2K0NexusDiagnostic();

test('inherited Stage 2I.0 Nexus and Stage 2J.1 certifications are exact', () => {
  assert.equal(build().inherited.stage2i0NexusBaselineReproduced, true);
  assert.equal(build().inherited.stage2i0NexusCorpusDigest, STAGE2K0_EXPECTED_NEXUS_CORPUS_DIGEST);
  assert.equal(build().inherited.stage2j1CertificationHash, STAGE2K0_STAGE2J1_CERTIFICATION_HASH);
});

test('baseline scores reproduce the asymmetric failure exactly', () => {
  assert.deepEqual(build().baseline, { graphDescriptionAccuracy: 0.9166666666666666, criticalDependencyAccuracy: 1, redundancyAccuracy: 0, bottleneckAccuracy: 1, decisionInterpretationAccuracy: 0, score: 4 });
});

test('pipeline audit identifies both literal missing owners', () => {
  assert.equal(build().pipeline.redundancyOwner, 'NONE_STAGE2I0_BENCHMARK_LITERAL_FALSE');
  assert.equal(build().pipeline.interpretationOwner, 'NONE_STAGE2I0_BENCHMARK_LITERAL_ZERO');
  assert.match(build().pipeline.outputOwner, /numeric signals only/);
});

test('relational task contracts exclude action selection', () => {
  assert.equal(build().taskContracts.redundancyBenchmarkCompatibleWithCurrentContract, false);
  assert.equal(build().taskContracts.decisionInterpretationBenchmarkCompatibleWithCurrentContract, false);
  assert.equal(build().taskContracts.nexusDecisionInterpretationIsRelational, true);
  assert.equal(build().taskContracts.nexusActionSelectionPresent, false);
});

test('baseline identity survives internally but is lost at aggregate output', () => {
  assert.equal(build().identityAudit.entityIdentityPreserved, false);
  assert.equal(build().identityAudit.entityIdentityPreservedInternallyUntilOutput, true);
  assert.equal(build().identityAudit.aggregateOnlyOutputLimitation, true);
  assert.equal(build().candidateIdentity.entityIdentityPreserved, true);
  assert.equal(build().candidateIdentity.edgeDirectionPreserved, true);
  assert.equal(build().candidateIdentity.edgeTypePreserved, true);
});

test('every redundancy and interpretation failure has one attribution', () => {
  assert.equal(build().diagnostic.redundancyFailuresAttributed, 50);
  assert.equal(build().diagnostic.unattributedRedundancyFailures, 0);
  assert.equal(build().diagnostic.decisionInterpretationFailuresAttributed, 600);
  assert.equal(build().diagnostic.unattributedDecisionInterpretationFailures, 0);
  assert.equal(build().diagnostic.primaryNexusFailureMode, 'MISSING_RELATIONAL_DELTA_AND_ENTITY_BOUND_OUTPUT');
});

test('exact relational references are deterministic and distinct from heuristics', () => {
  const sample = buildStage2K0Corpus()[731];
  assert.equal(sha256(relationalReference(sample)), sha256(relationalReference(sample)));
  assert.equal(build().references.redundancyReferenceDeterministic, true);
  assert.equal(build().references.decisionInterpretationReferenceDeterministic, true);
  assert.equal(build().references.relationalReferenceOraclesSeparatedFromSimpleBaselines, true);
});

test('corpus exceeds holdout and semantic diversity floors without leakage', () => {
  assert.equal(build().corpus.totalCases, 3600);
  assert.equal(build().corpus.finalHoldoutCases, 1200);
  assert.equal(build().corpus.effectiveSemanticGroups, 1200);
  assert.equal(build().corpus.semanticFamilyLeakage, false);
  assert.deepEqual(build().corpus.splits, { DEVELOPMENT: 1200, VALIDATION: 1200, FINAL_HOLDOUT: 1200 });
});

test('small candidate family freezes the shared relational delta engine', () => {
  assert.equal(build().remediation.candidateSearchSpace.length, 3);
  assert.equal(build().remediation.selectedNexusCandidate, 'RELATIONAL_DELTA_ENGINE');
  assert.equal(build().remediation.candidateSelectionFrozen, true);
  assert.equal(build().remediation.developmentTop1, 1);
  assert.equal(build().remediation.validationTop1, 1);
});

test('structural critical and bottleneck strengths do not regress', () => {
  assert.equal(build().finalHoldout.graphDescriptionAccuracy, 1);
  assert.equal(build().finalHoldout.criticalDependencyAccuracy, 1);
  assert.equal(build().finalHoldout.bottleneckAccuracy, 1);
});

test('redundancy precision recall and F1 are exact on holdout', () => {
  assert.equal(build().finalHoldout.redundancyAccuracy, 1);
  assert.equal(build().finalHoldout.redundancyPrecision, 1);
  assert.equal(build().finalHoldout.redundancyRecall, 1);
  assert.equal(build().finalHoldout.redundancyF1, 1);
  assert.equal(build().finalHoldout.falseRedundancyRate, 0);
});

test('node edge removal and SPOF analyses match exact references', () => {
  assert.equal(build().finalHoldout.nodeRemovalReachabilityAccuracy, 1);
  assert.equal(build().finalHoldout.edgeRemovalReachabilityAccuracy, 1);
  assert.equal(build().finalHoldout.alternatePathDetectionAccuracy, 1);
  assert.equal(build().finalHoldout.spofNodeAccuracy, 1);
  assert.equal(build().finalHoldout.spofEdgeAccuracy, 1);
});

test('decision interpretation is exact isolated relational counterfactual reasoning', () => {
  assert.equal(build().finalHoldout.decisionInterpretationAccuracy, 1);
  assert.equal(build().invariance.counterfactualCloneIsolated, true);
  assert.equal(build().invariance.counterfactualGraphMutationLiveWorld, false);
  assert.equal(build().invariance.liveGraphMutations, 0);
});

test('candidate provides entity-bound critical bottleneck and redundancy results', () => {
  assert.equal(build().finalHoldout.criticalEntityIdentificationAccuracy, 1);
  assert.equal(build().finalHoldout.bottleneckEntityIdentificationAccuracy, 1);
  assert.equal(build().finalHoldout.redundancyEntityIdentificationAccuracy, 1);
  assert.equal(build().finalHoldout.entityLevelRelationalAccuracy, 1);
});

test('candidate beats every measured simple graph baseline', () => {
  assert.equal(build().baselines.nexusBeatsGraphBaselines, true);
  assert.ok(build().baselines.bestSimple.accuracy < 1);
  assert.ok(build().baselines.nexusCandidateVsSimpleBaseline > 0);
  assert.equal(build().referenceComparison.redundancyVsReferenceDelta, 0);
  assert.equal(build().referenceComparison.counterfactualVsReferenceDelta, 0);
});

test('paired graph causality and insertion ordering controls pass', () => {
  assert.equal(build().causality.nexusRelationalCausalityValid, true);
  assert.equal(build().invariance.nodeOrderingInvariant, true);
  assert.equal(build().invariance.edgeOrderingInvariant, true);
});

test('all twelve adversarial relational families are exact', () => {
  assert.equal(build().adversarial.cases, 600);
  assert.equal(Object.keys(build().adversarial.byType).length, 12);
  assert.ok(Object.values(build().adversarial.byType).every((result) => result.accuracy === 1));
  assert.equal(build().adversarial.accuracy, 1);
});

test('game-shaped relational cases are exact without real gameplay claims', () => {
  assert.equal(build().gameSemantics.cases, 1200);
  assert.equal(build().gameSemantics.accuracy, 1);
  assert.equal(build().gameSemantics.realZeknovaGameplayImprovementClaimed, false);
});

test('7 and 9 maturity gates pass under the frozen measured requirements', () => {
  assert.equal(build().capability.nexusCandidateScore, 10);
  assert.equal(build().capability.nexus7Of10GatePass, true);
  assert.equal(build().capability.nexus9Of10GatePass, true);
  assert.deepEqual(build().capability.nexus9Of10RemainingGaps, []);
  assert.ok(Object.values(build().capability.gateChecks).every(Boolean));
});

test('production experts selection authority and aggregate digest remain isolated', () => {
  assert.equal(build().freezes.primeChanged, false);
  assert.equal(build().freezes.oracleV2Changed, false);
  assert.equal(build().freezes.nexusChanged, false);
  assert.equal(build().freezes.nexusSelectionInfluence, 0);
  assert.equal(build().production.nexusProductionReplaced, false);
  assert.equal(build().production.nexusCandidatePromoted, false);
  assert.deepEqual(build().safety.authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false });
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
});
