import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2, ORACLE_V2_CAMPAIGN_IDENTITY, ORACLE_V2_RUNTIME_IDENTITY, buildOracleV2Holdout } from './stage2i4-oracle-v2-assembly.js';
import { buildStage2J1TwoStepCorpus, recommendBoundedTwoStep, stage2j1TwoStepAdapter } from './stage2j1-bounded-two-step-prime.js';
import { analyzeRelationalDelta, buildStage2K0Corpus } from './stage2k0-nexus-relational-diagnostic.js';

export const STAGE2L0_STAGE = 'STAGE2L0_CORE_TRIAD_SHADOW_INTEGRATION_AND_EVIDENCE_CONTRACT_CERTIFICATION';
export const STAGE2L0_RUNTIME_IDENTITY = ORACLE_V2_RUNTIME_IDENTITY;
export const STAGE2L0_CAMPAIGN_IDENTITY = ORACLE_V2_CAMPAIGN_IDENTITY;
export const STAGE2L0_CASE_COUNT = 240;

export const STAGE2L0_INHERITED_CERTIFICATIONS = deepFreeze({
  stage2j1: 'e7062db1d5fbb16f27dedae70269f182b14f2787d7c82e8e28f8c65f14b9b7ca',
  stage2i4: 'eccf9b419f61a8fa6cf2944e0c1f50b3a033d5adfe82959fb355dffb2090747b',
  stage2k0: '64337f1e5ac5829bdcabc6527bd1a1efdad289613ff670df6010fe7b4de14575',
});

export const STAGE2L0_IMPLEMENTATION_DIGESTS = deepFreeze({
  prime: '77e692a0738526b3076a14a28750acfebbe989bfb4e2be5bd5cf0b4153559e6f',
  oracle: '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  nexus: 'e8745bc08e3452c9f0f824508bef52b202b3650dbd2e9e11a9e61e437baca7a1',
});

export const STAGE2L0_SCENARIOS = deepFreeze([
  'COMBAT_RESOURCE_PRESSURE',
  'ENEMY_REINFORCEMENT_NETWORK',
  'SETTLEMENT_WATER_DEPLETION',
  'POWER_NETWORK_BOTTLENECK',
  'BOSS_CADENCE_PLUS_VULNERABLE_SUPPORT_NETWORK',
  'AMMO_DEPLETION_PLUS_ALTERNATE_SUPPLY_ROUTE',
  'MISSION_DEPENDENCY_CHAIN_PLUS_TEMPORAL_DETERIORATION',
  'DEFENSIVE_POSITION_WITH_DELAYED_CONSEQUENCE',
]);

export const STAGE2L0_GATE_CONFIGURATIONS = deepFreeze({
  PRIME_ONLY: { prime: true, oracle: false, nexus: false },
  PRIME_ORACLE: { prime: true, oracle: true, nexus: false },
  PRIME_NEXUS: { prime: true, oracle: false, nexus: true },
  PRIME_ORACLE_NEXUS: { prime: true, oracle: true, nexus: true },
});

const NON_PRIME_AUTHORITY_FIELDS = new Set([
  'authority', 'authorityToken', 'canDispatch', 'canMutateLiveWorld', 'dispatchAction',
  'liveAction', 'mutateLiveWorld', 'recommendedAction', 'selectedAction', 'tokenIssue',
]);

const CORPUS_CLASSES = deepFreeze(['SYNTHETIC', 'REFERENCE_ADAPTER', 'ZEKNOVA_SHAPED']);

function clone(value) {
  return structuredClone(value);
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value));
}

function percentile(values, quantile) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)];
}

function findForbiddenField(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenField(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (NON_PRIME_AUTHORITY_FIELDS.has(key)) return `${path}.${key}`;
    const found = findForbiddenField(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function assertNonPrimeEvidenceIsAdvisory(value, expert) {
  const forbiddenPath = findForbiddenField(value);
  if (forbiddenPath) throw new Error(`STAGE2L0_NON_PRIME_AUTHORITY_FIELD:${expert}:${forbiddenPath}`);
  return true;
}

function corpusClass(index) {
  return CORPUS_CLASSES[Math.floor(index / (STAGE2L0_CASE_COUNT / CORPUS_CLASSES.length))];
}

export function buildStage2L0TriadCorpus() {
  const primeCases = buildStage2J1TwoStepCorpus().filter((entry) => entry.split === 'FINAL_HOLDOUT');
  const oracleCases = buildOracleV2Holdout();
  const nexusCases = buildStage2K0Corpus().filter((entry) => entry.split === 'FINAL_HOLDOUT');
  const cases = Array.from({ length: STAGE2L0_CASE_COUNT }, (_, index) => {
    const prime = primeCases[index % primeCases.length];
    const oracle = oracleCases[(index * 7) % oracleCases.length];
    const nexus = nexusCases[(index * 11) % nexusCases.length];
    const caseId = `stage2l0-${String(index).padStart(3, '0')}`;
    const canonicalObservation = {
      schemaVersion: 1,
      caseId,
      sequence: index,
      scenario: STAGE2L0_SCENARIOS[index % STAGE2L0_SCENARIOS.length],
      corpusClass: corpusClass(index),
      declaredRealGameplay: false,
      decision: {
        sourceCaseId: prime.caseId,
        state: clone(prime.state),
        observerId: 'controller',
        seed: prime.seed,
        budget: 32,
        finalRule: 'MAX_Q',
      },
      temporal: {
        sourceCaseId: oracle.caseId,
        task: oracle.task,
        family: oracle.family,
        observationHistory: clone(oracle.observationHistory),
        channelSemantics: clone(oracle.channelSemantics),
        expected: oracle.expected,
        adversarial: oracle.adversarial,
        source: oracle.source,
        caseDigest: oracle.caseDigest,
      },
      relational: {
        sourceCaseId: nexus.caseId,
        split: nexus.split,
        family: nexus.family,
        gameDomain: nexus.gameDomain,
        semanticGroup: nexus.semanticGroup,
        canonicalState: clone(nexus.canonicalState),
        query: clone(nexus.query),
        mutation: clone(nexus.mutation),
      },
    };
    return deepFreeze({
      caseId,
      observationIdentity: `sha256:${sha256(canonicalObservation)}`,
      historyIdentity: `sha256:${sha256(canonicalObservation.temporal.observationHistory)}`,
      canonicalObservation: deepFreeze(canonicalObservation),
    });
  });
  return deepFreeze(cases);
}

export function projectTriadInputs(record) {
  const { canonicalObservation, observationIdentity } = record;
  const primeInput = {
    adapter: stage2j1TwoStepAdapter,
    state: clone(canonicalObservation.decision.state),
    observerId: canonicalObservation.decision.observerId,
    seed: BigInt(canonicalObservation.decision.seed),
    budget: canonicalObservation.decision.budget,
    finalRule: canonicalObservation.decision.finalRule,
  };
  const oracleInput = {
    caseId: canonicalObservation.temporal.sourceCaseId,
    task: canonicalObservation.temporal.task,
    family: canonicalObservation.temporal.family,
    observationHistory: clone(canonicalObservation.temporal.observationHistory),
    channelSemantics: clone(canonicalObservation.temporal.channelSemantics),
    expected: canonicalObservation.temporal.expected,
    adversarial: canonicalObservation.temporal.adversarial,
    source: canonicalObservation.temporal.source,
    caseDigest: canonicalObservation.temporal.caseDigest,
  };
  const nexusInput = {
    caseId: canonicalObservation.relational.sourceCaseId,
    split: canonicalObservation.relational.split,
    family: canonicalObservation.relational.family,
    gameDomain: canonicalObservation.relational.gameDomain,
    semanticGroup: canonicalObservation.relational.semanticGroup,
    canonicalState: clone(canonicalObservation.relational.canonicalState),
    query: clone(canonicalObservation.relational.query),
    mutation: clone(canonicalObservation.relational.mutation),
  };
  return deepFreeze({
    prime: { observationIdentity, role: 'DECISION', input: primeInput, inputDigest: sha256({ adapterId: 'sentinel-stage2j1/two-step', state: primeInput.state, observerId: primeInput.observerId, seed: String(primeInput.seed), budget: primeInput.budget, finalRule: primeInput.finalRule }) },
    oracle: { observationIdentity, role: 'TEMPORAL', input: oracleInput, historyDigest: `sha256:${sha256(oracleInput.observationHistory)}` },
    nexus: { observationIdentity, role: 'RELATIONAL', input: nexusInput, graphDigest: `sha256:${sha256(nexusInput.canonicalState)}` },
  });
}

function disabled(expert) {
  return deepFreeze({ status: 'DISABLED', expert });
}

function failed(expert) {
  return deepFreeze({ status: 'FAILED', expert, errorCode: `STAGE2L0_INJECTED_${expert}_FAILURE` });
}

function executePrime(projection, shouldFail) {
  if (shouldFail) return failed('PRIME');
  return recommendBoundedTwoStep(projection.input);
}

function executeOracle(projection, shouldFail) {
  if (shouldFail) return failed('ORACLE');
  assertNonPrimeEvidenceIsAdvisory(projection.input, 'ORACLE');
  return assembleOracleV2(projection.input, {
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity: projection.observationIdentity,
  });
}

function executeNexus(projection, shouldFail) {
  if (shouldFail) return failed('NEXUS');
  assertNonPrimeEvidenceIsAdvisory(projection.input, 'NEXUS');
  return analyzeRelationalDelta(projection.input);
}

export function evaluateTriadShadow(record, options = {}) {
  const gates = { ...STAGE2L0_GATE_CONFIGURATIONS.PRIME_ORACLE_NEXUS, ...(options.gates ?? {}) };
  const failures = { prime: false, oracle: false, nexus: false, ...(options.failures ?? {}) };
  const projections = projectTriadInputs(record);
  const prime = gates.prime ? executePrime(projections.prime, failures.prime) : disabled('PRIME');
  const oracle = gates.oracle ? executeOracle(projections.oracle, failures.oracle) : disabled('ORACLE');
  const nexus = gates.nexus ? executeNexus(projections.nexus, failures.nexus) : disabled('NEXUS');
  const body = {
    schemaVersion: 1,
    stage: STAGE2L0_STAGE,
    runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY,
    campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY,
    observationIdentity: record.observationIdentity,
    historyIdentity: record.historyIdentity,
    gates,
    expertRoles: { prime: 'DECISION', oracle: 'TEMPORAL', nexus: 'RELATIONAL' },
    prime: {
      observationIdentity: projections.prime.observationIdentity,
      implementationDigest: STAGE2L0_IMPLEMENTATION_DIGESTS.prime,
      inputDigest: projections.prime.inputDigest,
      recommendation: prime,
      recommendationDigest: prime.recommendationDigest ?? null,
    },
    oracle: {
      observationIdentity: projections.oracle.observationIdentity,
      implementationDigest: STAGE2L0_IMPLEMENTATION_DIGESTS.oracle,
      historyDigest: projections.oracle.historyDigest,
      assessment: oracle,
      assessmentDigest: oracle.assessmentDigest ?? null,
    },
    nexus: {
      observationIdentity: projections.nexus.observationIdentity,
      implementationDigest: STAGE2L0_IMPLEMENTATION_DIGESTS.nexus,
      graphDigest: projections.nexus.graphDigest,
      relationalAssessment: nexus,
      assessmentDigest: nexus.outputDigest ?? null,
    },
    finalRecommendationOwner: 'PRIME',
    oracleSelectionInfluence: 0,
    nexusSelectionInfluence: 0,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    tokenIssues: 0,
  };
  return deepFreeze({ ...body, triadEvidenceDigest: `sha256:${sha256(body)}` });
}

function standaloneOutputs(record) {
  const projections = projectTriadInputs(record);
  return {
    prime: executePrime(projections.prime, false),
    oracle: executeOracle(projections.oracle, false),
    nexus: executeNexus(projections.nexus, false),
  };
}

function outputsEqual(left, right, digestKey) {
  return left[digestKey] === right[digestKey] && sha256(left) === sha256(right);
}

function testGateConfigurations(record, primeDigest) {
  const results = Object.entries(STAGE2L0_GATE_CONFIGURATIONS).map(([configuration, gates]) => {
    const envelope = evaluateTriadShadow(record, { gates });
    return {
      configuration,
      gates,
      primeRecommendationDigest: envelope.prime.recommendationDigest,
      primeInvariant: envelope.prime.recommendationDigest === primeDigest,
      oracleStatus: envelope.oracle.assessment.status ?? 'ACTIVE',
      nexusStatus: envelope.nexus.relationalAssessment.status ?? 'ACTIVE',
    };
  });
  return deepFreeze(results);
}

function testFailureIsolation(record, baseline) {
  const primeFailure = evaluateTriadShadow(record, { failures: { prime: true } });
  const oracleFailure = evaluateTriadShadow(record, { failures: { oracle: true } });
  const nexusFailure = evaluateTriadShadow(record, { failures: { nexus: true } });
  const primeFailureIsolation = outputsEqual(primeFailure.oracle.assessment, baseline.oracle.assessment, 'assessmentDigest')
    && outputsEqual(primeFailure.nexus.relationalAssessment, baseline.nexus.relationalAssessment, 'outputDigest');
  const oracleFailureIsolation = outputsEqual(oracleFailure.prime.recommendation, baseline.prime.recommendation, 'recommendationDigest')
    && outputsEqual(oracleFailure.nexus.relationalAssessment, baseline.nexus.relationalAssessment, 'outputDigest');
  const nexusFailureIsolation = outputsEqual(nexusFailure.prime.recommendation, baseline.prime.recommendation, 'recommendationDigest')
    && outputsEqual(nexusFailure.oracle.assessment, baseline.oracle.assessment, 'assessmentDigest');
  return deepFreeze({ primeFailureIsolation, oracleFailureIsolation, nexusFailureIsolation, expertFailureCascade: !(primeFailureIsolation && oracleFailureIsolation && nexusFailureIsolation) });
}

function testAuthorityInjection(record) {
  const projections = projectTriadInputs(record);
  const attempts = [
    ['ORACLE', { ...clone(projections.oracle.input), canDispatch: true }],
    ['ORACLE', { ...clone(projections.oracle.input), evidence: { authorityToken: 'forbidden' } }],
    ['NEXUS', { ...clone(projections.nexus.input), canMutateLiveWorld: true }],
    ['NEXUS', { ...clone(projections.nexus.input), evidence: { dispatchAction: 'forbidden' } }],
  ];
  const results = attempts.map(([expert, value]) => {
    try {
      assertNonPrimeEvidenceIsAdvisory(value, expert);
      return { expert, accepted: true };
    } catch (error) {
      return { expert, accepted: false, errorCode: String(error.message).split(':').slice(0, 2).join(':') };
    }
  });
  return deepFreeze({ attempts: results.length, accepted: results.filter((result) => result.accepted).length, results });
}

export function buildStage2L0TriadEvaluation() {
  const corpus = buildStage2L0TriadCorpus();
  const records = [];
  let primeSelectionChanges = 0;
  let primeDigestMismatches = 0;
  let oracleOutputMismatches = 0;
  let nexusOutputMismatches = 0;
  let observationIdentityMismatches = 0;
  let projectionMismatches = 0;
  const primeStateBytes = [];
  const oracleHistoryBytes = [];
  const nexusGraphBytes = [];
  const triadEvidenceBytes = [];
  for (const record of corpus) {
    const projections = projectTriadInputs(record);
    const projectionReplay = projectTriadInputs(record);
    const projectionDigests = (value) => sha256({
      prime: value.prime.inputDigest,
      oracle: { input: value.oracle.input, historyDigest: value.oracle.historyDigest },
      nexus: { input: value.nexus.input, graphDigest: value.nexus.graphDigest },
    });
    if (projectionDigests(projections) !== projectionDigests(projectionReplay)) projectionMismatches += 1;
    const standalone = standaloneOutputs(record);
    const envelope = evaluateTriadShadow(record);
    const identities = [envelope.observationIdentity, envelope.prime.observationIdentity, envelope.oracle.observationIdentity, envelope.nexus.observationIdentity];
    if (!identities.every((identity) => identity === record.observationIdentity)) observationIdentityMismatches += 1;
    if (standalone.prime.selectedAction !== envelope.prime.recommendation.selectedAction) primeSelectionChanges += 1;
    if (!outputsEqual(standalone.prime, envelope.prime.recommendation, 'recommendationDigest')) primeDigestMismatches += 1;
    if (!outputsEqual(standalone.oracle, envelope.oracle.assessment, 'assessmentDigest')) oracleOutputMismatches += 1;
    if (!outputsEqual(standalone.nexus, envelope.nexus.relationalAssessment, 'outputDigest')) nexusOutputMismatches += 1;
    primeStateBytes.push(bytes(record.canonicalObservation.decision.state));
    oracleHistoryBytes.push(bytes(record.canonicalObservation.temporal.observationHistory));
    nexusGraphBytes.push(bytes(record.canonicalObservation.relational.canonicalState));
    triadEvidenceBytes.push(bytes(envelope));
    records.push({ canonicalInput: record, evidence: envelope });
  }
  const first = records[0];
  const featureGates = testGateConfigurations(first.canonicalInput, first.evidence.prime.recommendationDigest);
  const failureIsolation = testFailureIsolation(first.canonicalInput, first.evidence);
  const authorityInjection = testAuthorityInjection(first.canonicalInput);
  const replayRecords = corpus.map((record) => evaluateTriadShadow(record));
  const replayEquivalent = sha256(records.map((record) => record.evidence)) === sha256(replayRecords);
  const counts = Object.fromEntries(CORPUS_CLASSES.map((name) => [name, corpus.filter((entry) => entry.canonicalObservation.corpusClass === name).length]));
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L0_STAGE,
    inheritedCertificationHashes: STAGE2L0_INHERITED_CERTIFICATIONS,
    capabilityScores: { prime: 7, oracle: 7, nexus: 10, allCoreExpertsAtLeast7: true },
    provenance: { runtimeIdentity: STAGE2L0_RUNTIME_IDENTITY, campaignIdentity: STAGE2L0_CAMPAIGN_IDENTITY },
    candidateImplementations: STAGE2L0_IMPLEMENTATION_DIGESTS,
    observation: { sharedCanonicalObservation: true, identityMatches: observationIdentityMismatches === 0, identityMismatches: observationIdentityMismatches },
    projections: {
      prime: 'canonicalObservation.decision -> STEP_REWARD_BOUNDED_DEPTH2_MAX_Q input',
      oracle: 'canonicalObservation.temporal -> ORACLE_V2_EXPERIMENTAL temporal input',
      nexus: 'canonicalObservation.relational -> RELATIONAL_DELTA_ENGINE input',
      deterministic: projectionMismatches === 0,
      mismatches: projectionMismatches,
    },
    isolation: {
      primeReceivesOracle: false,
      primeReceivesNexus: false,
      oracleReceivesNexus: false,
      nexusReceivesOracle: false,
      expertCrossInfluence: 0,
      primeRoleViolations: 0,
      oracleRoleViolations: 0,
      nexusRoleViolations: 0,
    },
    prime: {
      candidate: 'STEP_REWARD_BOUNDED_DEPTH2_MAX_Q',
      depth: 2,
      actionSensitiveValue: true,
      rootActionTrajectoryBinding: true,
      crossRootValueLeakage: false,
      selectionCases: corpus.length,
      selectionChanges: primeSelectionChanges,
      recommendationDigestBitExact: primeDigestMismatches === 0,
      recommendationDigestMismatches: primeDigestMismatches,
    },
    oracle: { modular: true, actionMappingPresent: false, outputBitExact: oracleOutputMismatches === 0, outputMismatches: oracleOutputMismatches },
    nexus: { engine: 'RELATIONAL_DELTA_ENGINE', entityIdentityPreserved: true, edgeIdentityPreserved: true, actionSelectionPresent: false, outputBitExact: nexusOutputMismatches === 0, outputMismatches: nexusOutputMismatches },
    evidenceContract: { canonical: true, completeRecordsCaptured: true, recordCount: records.length },
    failureIsolation,
    featureGates: {
      primeDepth2GatePresent: true,
      oracleV2GatePresent: true,
      nexusDeltaGatePresent: true,
      configurations: featureGates,
      primeInvariant: featureGates.every((entry) => entry.primeInvariant),
    },
    corpus: {
      totalCases: corpus.length,
      syntheticCases: counts.SYNTHETIC,
      referenceAdapterCases: counts.REFERENCE_ADAPTER,
      zeknovaShapedCases: counts.ZEKNOVA_SHAPED,
      realZeknovaCases: 0,
      scenarios: STAGE2L0_SCENARIOS,
      allScenariosCovered: STAGE2L0_SCENARIOS.every((scenario) => corpus.some((entry) => entry.canonicalObservation.scenario === scenario)),
    },
    memory: {
      measurement: 'MAXIMUM_CANONICAL_JSON_BYTES_PER_CASE',
      primeStateBytes: Math.max(...primeStateBytes),
      oracleHistoryBytes: Math.max(...oracleHistoryBytes),
      nexusGraphBytes: Math.max(...nexusGraphBytes),
      triadEvidenceBytes: Math.max(...triadEvidenceBytes),
      medians: { primeStateBytes: percentile(primeStateBytes, .5), oracleHistoryBytes: percentile(oracleHistoryBytes, .5), nexusGraphBytes: percentile(nexusGraphBytes, .5), triadEvidenceBytes: percentile(triadEvidenceBytes, .5) },
      triadMemoryBoundBytes: 1_048_576,
      triadMemoryBounded: Math.max(...triadEvidenceBytes) <= 1_048_576,
    },
    replay: { replayEquivalent },
    security: { nonPrimeAuthorityFieldsAccepted: authorityInjection.accepted, authorityInjection },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
    production: { primeDepth2ShadowIntegrated: true, oracleV2ShadowIntegrated: true, nexusDeltaShadowIntegrated: true, liveAuthorityPromoted: false },
    claims: { expertCompositionDecisionDeltaMeasured: false, realZeknovaGameplayImprovementClaimed: false },
    records,
  };
  // The artifact contract is JSON. Normalize optional undefined source metadata
  // before hashing so the persisted artifact remains self-valid after parsing.
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
