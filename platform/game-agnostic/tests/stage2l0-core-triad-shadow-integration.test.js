import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/core/determinism.js';
import {
  assertNonPrimeEvidenceIsAdvisory,
  buildStage2L0TriadCorpus,
  buildStage2L0TriadEvaluation,
  evaluateTriadShadow,
  projectTriadInputs,
  STAGE2L0_CASE_COUNT,
  STAGE2L0_GATE_CONFIGURATIONS,
  STAGE2L0_INHERITED_CERTIFICATIONS,
  STAGE2L0_SCENARIOS,
} from '../src/lab/stage2l0-core-triad-shadow-integration.js';

let cached;
const build = () => cached ??= buildStage2L0TriadEvaluation();

test('the three exact inherited certification anchors are frozen', () => {
  assert.deepEqual(STAGE2L0_INHERITED_CERTIFICATIONS, {
    stage2j1: 'e7062db1d5fbb16f27dedae70269f182b14f2787d7c82e8e28f8c65f14b9b7ca',
    stage2i4: 'eccf9b419f61a8fa6cf2944e0c1f50b3a033d5adfe82959fb355dffb2090747b',
    stage2k0: '64337f1e5ac5829bdcabc6527bd1a1efdad289613ff670df6010fe7b4de14575',
  });
  assert.deepEqual(build().capabilityScores, { prime: 7, oracle: 7, nexus: 10, allCoreExpertsAtLeast7: true });
});

test('combined corpus uses honest source classifications', () => {
  assert.equal(build().corpus.totalCases, STAGE2L0_CASE_COUNT);
  assert.equal(build().corpus.syntheticCases, 80);
  assert.equal(build().corpus.referenceAdapterCases, 80);
  assert.equal(build().corpus.zeknovaShapedCases, 80);
  assert.equal(build().corpus.realZeknovaCases, 0);
});

test('all eight combined game-semantic scenarios are represented', () => {
  assert.equal(build().corpus.allScenariosCovered, true);
  assert.deepEqual(build().corpus.scenarios, STAGE2L0_SCENARIOS);
});

test('every expert envelope is bound to one canonical observation identity', () => {
  assert.equal(build().observation.sharedCanonicalObservation, true);
  assert.equal(build().observation.identityMatches, true);
  assert.equal(build().observation.identityMismatches, 0);
});

test('expert-local projections replay deterministically', () => {
  const record = buildStage2L0TriadCorpus()[37];
  const left = projectTriadInputs(record);
  const right = projectTriadInputs(record);
  assert.equal(left.prime.inputDigest, right.prime.inputDigest);
  assert.equal(left.oracle.historyDigest, right.oracle.historyDigest);
  assert.equal(left.nexus.graphDigest, right.nexus.graphDigest);
  assert.equal(build().projections.deterministic, true);
});

test('projections contain only their expert-local source domains', () => {
  const { prime, oracle, nexus } = projectTriadInputs(buildStage2L0TriadCorpus()[0]);
  assert.deepEqual(Object.keys(prime.input).sort(), ['adapter', 'budget', 'finalRule', 'observerId', 'seed', 'state']);
  assert.ok(!('canonicalState' in oracle.input));
  assert.ok(!('observationHistory' in nexus.input));
  assert.equal(build().isolation.expertCrossInfluence, 0);
});

test('canonical triad envelope contains complete digest-bound expert evidence', () => {
  const envelope = evaluateTriadShadow(buildStage2L0TriadCorpus()[0]);
  const { triadEvidenceDigest, ...body } = envelope;
  assert.equal(triadEvidenceDigest, `sha256:${sha256(body)}`);
  assert.ok(envelope.prime.implementationDigest && envelope.prime.inputDigest && envelope.prime.recommendationDigest);
  assert.ok(envelope.oracle.implementationDigest && envelope.oracle.historyDigest && envelope.oracle.assessmentDigest);
  assert.ok(envelope.nexus.implementationDigest && envelope.nexus.graphDigest && envelope.nexus.assessmentDigest);
  assert.equal(build().evidenceContract.canonical, true);
});

test('Prime integrates the exact bounded depth-2 action-sensitive contract', () => {
  assert.equal(build().prime.candidate, 'STEP_REWARD_BOUNDED_DEPTH2_MAX_Q');
  assert.equal(build().prime.depth, 2);
  assert.equal(build().prime.actionSensitiveValue, true);
  assert.equal(build().prime.rootActionTrajectoryBinding, true);
  assert.equal(build().prime.crossRootValueLeakage, false);
});

test('Oracle V2 remains modular temporal assessment without action mapping', () => {
  assert.equal(build().oracle.modular, true);
  assert.equal(build().oracle.actionMappingPresent, false);
  assert.equal(build().records[0].evidence.oracle.assessment.expertSelectionInfluence, 0);
});

test('Nexus preserves entity and edge identity without action selection', () => {
  assert.equal(build().nexus.engine, 'RELATIONAL_DELTA_ENGINE');
  assert.equal(build().nexus.entityIdentityPreserved, true);
  assert.equal(build().nexus.edgeIdentityPreserved, true);
  assert.equal(build().nexus.actionSelectionPresent, false);
});

test('Prime selection and recommendation evidence are bit exact inside the triad', () => {
  assert.equal(build().prime.selectionCases, STAGE2L0_CASE_COUNT);
  assert.equal(build().prime.selectionChanges, 0);
  assert.equal(build().prime.recommendationDigestBitExact, true);
});

test('Oracle and Nexus outputs are bit exact inside the triad', () => {
  assert.equal(build().oracle.outputBitExact, true);
  assert.equal(build().oracle.outputMismatches, 0);
  assert.equal(build().nexus.outputBitExact, true);
  assert.equal(build().nexus.outputMismatches, 0);
});

test('decision temporal and relational roles remain disjoint', () => {
  assert.deepEqual(build().isolation, {
    primeReceivesOracle: false,
    primeReceivesNexus: false,
    oracleReceivesNexus: false,
    nexusReceivesOracle: false,
    expertCrossInfluence: 0,
    primeRoleViolations: 0,
    oracleRoleViolations: 0,
    nexusRoleViolations: 0,
  });
});

test('all three injected expert failures remain local', () => {
  assert.deepEqual(build().failureIsolation, {
    primeFailureIsolation: true,
    oracleFailureIsolation: true,
    nexusFailureIsolation: true,
    expertFailureCascade: false,
  });
});

test('independent gates cover all four authorized configurations', () => {
  assert.deepEqual(Object.keys(STAGE2L0_GATE_CONFIGURATIONS), ['PRIME_ONLY', 'PRIME_ORACLE', 'PRIME_NEXUS', 'PRIME_ORACLE_NEXUS']);
  assert.equal(build().featureGates.primeDepth2GatePresent, true);
  assert.equal(build().featureGates.oracleV2GatePresent, true);
  assert.equal(build().featureGates.nexusDeltaGatePresent, true);
  assert.equal(build().featureGates.primeInvariant, true);
});

test('complete canonical inputs and evidence replay bit exactly', () => {
  assert.equal(build().evidenceContract.completeRecordsCaptured, true);
  assert.equal(build().evidenceContract.recordCount, STAGE2L0_CASE_COUNT);
  assert.equal(build().replay.replayEquivalent, true);
});

test('per-case evidence memory remains below the explicit bound', () => {
  assert.equal(build().memory.measurement, 'MAXIMUM_CANONICAL_JSON_BYTES_PER_CASE');
  assert.ok(build().memory.primeStateBytes > 0);
  assert.ok(build().memory.oracleHistoryBytes > 0);
  assert.ok(build().memory.nexusGraphBytes > 0);
  assert.ok(build().memory.triadEvidenceBytes <= build().memory.triadMemoryBoundBytes);
  assert.equal(build().memory.triadMemoryBounded, true);
});

test('Oracle and Nexus authority-capable evidence fields are rejected', () => {
  assert.throws(() => assertNonPrimeEvidenceIsAdvisory({ canDispatch: true }, 'ORACLE'), /NON_PRIME_AUTHORITY_FIELD/);
  assert.throws(() => assertNonPrimeEvidenceIsAdvisory({ nested: { canMutateLiveWorld: true } }, 'NEXUS'), /NON_PRIME_AUTHORITY_FIELD/);
  assert.equal(build().security.nonPrimeAuthorityFieldsAccepted, 0);
});

test('triad remains R0 shadow-only with Prime as sole recommendation owner', () => {
  assert.deepEqual(build().authority, { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 });
  assert.deepEqual(build().production, { primeDepth2ShadowIntegrated: true, oracleV2ShadowIntegrated: true, nexusDeltaShadowIntegrated: true, liveAuthorityPromoted: false });
  assert.ok(build().records.every((record) => record.evidence.finalRecommendationOwner === 'PRIME' && record.evidence.oracleSelectionInfluence === 0 && record.evidence.nexusSelectionInfluence === 0));
});

test('aggregate evidence is canonical and makes no composition quality claim', () => {
  const { evidenceDigest, ...payload } = build();
  assert.equal(sha256(payload), evidenceDigest);
  assert.deepEqual(build().claims, { expertCompositionDecisionDeltaMeasured: false, realZeknovaGameplayImprovementClaimed: false });
});
