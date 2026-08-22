/* Stage 2G — Oracle + Nexus R0 expert certification.
 *
 * Stage 2G EXTENDS Stage 2F provenance; it never replaces it. Every expert
 * evaluation record is bound to the existing Stage 2F qualification identity
 * (runtime id, generated provenance id, campaign id, session, sampling identity)
 * produced by zeknova-stage2f-identity.js. No second campaign identity system is
 * introduced here.
 *
 * Certification fixtures are explicitly NOT live campaign evidence: they carry
 * evidenceClass STAGE2G_CERTIFICATION_FIXTURE and countsTowardStage2FQualification
 * false, so they can never inflate a Stage 2F qualification threshold.
 */

import { sha256, deepFreeze } from '../core/determinism.js';
import { ContractError } from '../core/errors.js';
import { assertEvaluationOnly, defaultAuthorityPolicy } from '../core/authority.js';
import {
  EXPERT_CONTRACT_VERSION,
  SIGNAL_SCALE,
  validateExpertOutput,
} from '../experts/expert-contract.js';
import { ORACLE_EXPERT_ID, ORACLE_EXPERT_VERSION, evaluateOracle, oracleManifest } from '../experts/oracle.js';
import { NEXUS_EXPERT_ID, NEXUS_EXPERT_VERSION, evaluateNexus, nexusManifest } from '../experts/nexus.js';
import {
  buildStage2FQualificationIdentity,
  validateStage2FQualificationIdentity,
} from './zeknova-stage2f-identity.js';

export const STAGE2G_STAGE_ID = 'STAGE2G_ORACLE_NEXUS_R0';
export const STAGE2G_EVIDENCE_VERSION = 1;
export const STAGE2G_CERTIFICATION_VERSION = 1;

function assert(condition, message, code = 'STAGE2G_CONTRACT_ERROR') {
  if (!condition) {
    const error = new ContractError(message);
    error.code = code;
    throw error;
  }
}

const R0_AUTHORITY = deepFreeze({
  tier: 'R0',
  canDispatch: false,
  canMutateLiveWorld: false,
  canIssueAuthorityTokens: false,
});

/* ---------------------------------------------------------------------------
 * Canonical certification fixtures
 * Shared by the test suite and the certifier so the portability digest covers
 * exactly the cases that were measured.
 * ------------------------------------------------------------------------- */

function series(values, channel = 'supply') {
  return values.map((value, index) => ({ tick: index, channels: { [channel]: value } }));
}

export const STAGE2G_ORACLE_CASES = deepFreeze([
  { caseId: 'oracle-rising', input: { observationHistory: series([0.1, 0.2, 0.3, 0.4, 0.5]) } },
  { caseId: 'oracle-falling', input: { observationHistory: series([0.9, 0.7, 0.5, 0.3, 0.1]) } },
  { caseId: 'oracle-flat', input: { observationHistory: series([0.4, 0.4, 0.4, 0.4, 0.4]) } },
  { caseId: 'oracle-volatile', input: { observationHistory: series([0.1, 0.9, 0.15, 0.85, 0.2, 0.8]) } },
  { caseId: 'oracle-accelerating', input: { observationHistory: series([0.05, 0.1, 0.2, 0.4, 0.8]) } },
  { caseId: 'oracle-insufficient', input: { observationHistory: series([0.3, 0.4]) } },
  { caseId: 'oracle-empty', input: { observationHistory: [] } },
  { caseId: 'oracle-absent-history', input: {} },
  {
    caseId: 'oracle-multichannel',
    input: {
      observationHistory: [
        { tick: 0, channels: { supply: 0.2, pressure: 0.8 } },
        { tick: 1, channels: { supply: 0.3, pressure: 0.6 } },
        { tick: 2, channels: { supply: 0.4, pressure: 0.4 } },
        { tick: 3, channels: { supply: 0.5, pressure: 0.2 } },
      ],
    },
  },
  {
    caseId: 'oracle-partial-channel',
    input: {
      observationHistory: [
        { tick: 0, channels: { supply: 0.2 } },
        { tick: 1, channels: { supply: 0.3, pressure: 0.5 } },
        { tick: 2, channels: { supply: 0.4, pressure: 0.4 } },
        { tick: 3, channels: { supply: 0.5, pressure: 0.3 } },
      ],
    },
  },
  {
    caseId: 'oracle-unordered-ticks',
    input: {
      observationHistory: [
        { tick: 3, channels: { supply: 0.5 } },
        { tick: 1, channels: { supply: 0.3 } },
        { tick: 0, channels: { supply: 0.2 } },
        { tick: 2, channels: { supply: 0.4 } },
      ],
    },
  },
]);

export const STAGE2G_NEXUS_CASES = deepFreeze([
  {
    caseId: 'nexus-single-critical-dependency',
    input: {
      canonicalState: {
        entities: [{ id: 'core', critical: true }, { id: 'alpha' }, { id: 'beta' }],
        relationships: [
          { from: 'alpha', to: 'core', kind: 'depends' },
          { from: 'beta', to: 'core', kind: 'depends' },
        ],
      },
    },
  },
  {
    caseId: 'nexus-disconnected',
    input: { canonicalState: { entities: [{ id: 'lone-a' }, { id: 'lone-b' }, { id: 'lone-c' }], relationships: [] } },
  },
  {
    caseId: 'nexus-multiple-paths',
    input: {
      canonicalState: {
        entities: [{ id: 'sink' }, { id: 'mid-a' }, { id: 'mid-b' }, { id: 'root' }],
        relationships: [
          { from: 'root', to: 'mid-a', kind: 'depends' },
          { from: 'root', to: 'mid-b', kind: 'depends' },
          { from: 'mid-a', to: 'sink', kind: 'depends' },
          { from: 'mid-b', to: 'sink', kind: 'depends' },
        ],
      },
    },
  },
  {
    caseId: 'nexus-cycle',
    input: {
      canonicalState: {
        entities: [{ id: 'p' }, { id: 'q' }, { id: 'r' }],
        relationships: [
          { from: 'p', to: 'q', kind: 'depends' },
          { from: 'q', to: 'r', kind: 'depends' },
          { from: 'r', to: 'p', kind: 'depends' },
        ],
      },
    },
  },
  {
    caseId: 'nexus-unresolved-dependency',
    input: {
      canonicalState: {
        entities: [{ id: 'present' }],
        relationships: [{ from: 'present', to: 'absent', kind: 'depends' }],
      },
    },
  },
  {
    caseId: 'nexus-threat-and-support',
    input: {
      canonicalState: {
        entities: [{ id: 'outpost' }, { id: 'raider', hostile: true }, { id: 'garrison' }, { id: 'exposed' }],
        relationships: [
          { from: 'raider', to: 'outpost', kind: 'threatens' },
          { from: 'garrison', to: 'outpost', kind: 'supports' },
          { from: 'raider', to: 'exposed', kind: 'threatens' },
        ],
      },
      legalActions: [{ actionId: 'reinforce', targetEntityId: 'outpost' }],
    },
  },
  {
    caseId: 'nexus-missing-relationships',
    input: { canonicalState: { entities: [{ id: 'solo' }] } },
  },
  { caseId: 'nexus-empty-state', input: { canonicalState: {} } },
  { caseId: 'nexus-absent-state', input: {} },
  {
    caseId: 'nexus-malformed-relationships',
    input: {
      canonicalState: {
        entities: [{ id: 'ok' }, { id: 'ok' }, { id: '' }],
        relationships: [{ from: 'ok', kind: 'depends' }, { from: 'ok', to: 'ok', kind: 'teleports' }],
      },
    },
  },
  {
    caseId: 'nexus-deep-chain',
    input: {
      canonicalState: {
        entities: Array.from({ length: 24 }, (unused, index) => ({ id: `node-${String(index).padStart(3, '0')}` })),
        relationships: Array.from({ length: 23 }, (unused, index) => ({
          from: `node-${String(index).padStart(3, '0')}`,
          to: `node-${String(index + 1).padStart(3, '0')}`,
          kind: 'depends',
        })),
      },
    },
  },
]);

/** The expert entry points, keyed by expert id. */
const EXPERT_EVALUATORS = Object.freeze({
  [ORACLE_EXPERT_ID]: evaluateOracle,
  [NEXUS_EXPERT_ID]: evaluateNexus,
});

/* ---------------------------------------------------------------------------
 * Stage 2F provenance inheritance
 * ------------------------------------------------------------------------- */

/**
 * Bind one expert output to the inherited Stage 2F qualification identity.
 * evidenceHash is self-excluding, matching repository convention.
 */
export function buildStage2GEvidenceRecord({
  qualificationIdentity,
  observationId,
  recordId,
  expertOutput,
  evidenceClass = 'STAGE2G_CERTIFICATION_FIXTURE',
}) {
  assert(qualificationIdentity && typeof qualificationIdentity === 'object', 'qualificationIdentity is required', 'MISSING_RUNTIME_BINDING');
  assert(typeof observationId === 'string' && observationId.length > 0, 'observationId is required');
  assert(typeof recordId === 'string' && recordId.length > 0, 'recordId is required');
  const output = validateExpertOutput(expertOutput);
  assert(['STAGE2G_CERTIFICATION_FIXTURE', 'STAGE2G_SHADOW_EVALUATION'].includes(evidenceClass), 'Unknown Stage 2G evidence class');

  const body = {
    stage2gEvidenceVersion: STAGE2G_EVIDENCE_VERSION,
    stage: STAGE2G_STAGE_ID,
    evidenceClass,
    // Inherited Stage 2F envelope — copied verbatim, never regenerated.
    sentinelRuntimeId: qualificationIdentity.sentinelRuntimeId,
    generatedRuntimeProvenanceId: qualificationIdentity.generatedRuntimeProvenanceId,
    stage2fCampaignId: qualificationIdentity.stage2fCampaignId,
    sessionId: qualificationIdentity.sessionId,
    samplingIdentity: qualificationIdentity.samplingIdentity,
    recordSchemaVersion: qualificationIdentity.recordSchemaVersion,
    collectorSchemaVersion: qualificationIdentity.collectorSchemaVersion,
    evidenceMode: qualificationIdentity.evidenceMode,
    qualificationEligible: qualificationIdentity.qualificationEligible,
    // Stage 2G binding.
    observationId,
    recordId,
    expertId: output.expertId,
    expertVersion: output.expertVersion,
    expertContractVersion: output.expertContractVersion,
    expertInputDigest: output.inputDigest,
    expertOutputDigest: output.outputDigest,
    signalScale: output.signalScale,
    signals: output.signals,
    confidence: output.confidence,
    rationaleCodes: output.rationaleCodes,
    authority: R0_AUTHORITY,
    advisoryOnly: true,
    consumedBy: 'shadow-evaluation-only',
    countsTowardStage2FQualification: false,
  };
  return deepFreeze({ ...body, evidenceHash: sha256(body) });
}

/**
 * Re-verify an evidence record end to end: inherited identity against the campaign
 * manifest, expert output digest, and the self-excluding evidence hash.
 */
export function validateStage2GEvidenceRecord(record, { campaignManifest } = {}) {
  assert(record && typeof record === 'object' && !Array.isArray(record), 'Stage 2G evidence record is required', 'MISSING_RUNTIME_BINDING');
  assert(record.stage2gEvidenceVersion === STAGE2G_EVIDENCE_VERSION, 'Unknown Stage 2G evidence version', 'UNKNOWN_SCHEMA');
  assert(record.stage === STAGE2G_STAGE_ID, 'Unknown Stage 2G stage identifier', 'UNKNOWN_SCHEMA');
  assert(record.countsTowardStage2FQualification === false, 'Stage 2G evidence must never count toward Stage 2F qualification', 'STAGE2F_PROVENANCE_VIOLATION');
  assert(record.advisoryOnly === true, 'Stage 2G evidence must be advisory only', 'AUTHORITY_MISMATCH');
  assert(record.consumedBy === 'shadow-evaluation-only', 'Stage 2G evidence must be shadow-consumed only', 'AUTHORITY_MISMATCH');
  assert(record.authority?.tier === 'R0'
    && record.authority?.canDispatch === false
    && record.authority?.canMutateLiveWorld === false
    && record.authority?.canIssueAuthorityTokens === false, 'Stage 2G evidence authority must remain exact R0', 'AUTHORITY_MISMATCH');

  // Inherited Stage 2F identity is re-validated by the Stage 2F owner, not re-implemented.
  if (campaignManifest) {
    validateStage2FQualificationIdentity({
      identityEnvelopeVersion: 1,
      sentinelRuntimeId: record.sentinelRuntimeId,
      generatedRuntimeProvenanceId: record.generatedRuntimeProvenanceId,
      stage2fCampaignId: record.stage2fCampaignId,
      sessionId: record.sessionId,
      samplingIdentity: record.samplingIdentity,
      recordSchemaVersion: record.recordSchemaVersion,
      collectorSchemaVersion: record.collectorSchemaVersion,
      authorityTier: 'R0',
      evidenceMode: record.evidenceMode,
      qualificationEligible: record.qualificationEligible,
      canonicalStateSchemaVersion: campaignManifest.canonicalStateSchemaVersion,
      primeVersion: campaignManifest.primeVersion,
      routerVersion: campaignManifest.routerVersion,
      authorityPolicyVersion: campaignManifest.authorityPolicyVersion,
      certificationPolicyVersion: campaignManifest.certificationPolicyVersion,
    }, {
      campaignManifest,
      sessionId: record.sessionId,
      samplingIdentity: record.samplingIdentity,
    });
  }

  const { evidenceHash, ...body } = record;
  assert(sha256(body) === evidenceHash, 'Stage 2G evidence hash does not match its body', 'TAMPERED');
  return record;
}

/* ---------------------------------------------------------------------------
 * Gates
 * ------------------------------------------------------------------------- */

function runCases(expertId, cases) {
  const evaluate = EXPERT_EVALUATORS[expertId];
  assert(typeof evaluate === 'function', `Unknown expert ${expertId}`);
  return cases.map((testCase) => {
    const first = evaluate(structuredClone(testCase.input));
    const second = evaluate(structuredClone(testCase.input));
    validateExpertOutput(first);
    validateExpertOutput(second);
    return {
      caseId: testCase.caseId,
      deterministic: first.outputDigest === second.outputDigest,
      inputDigest: first.inputDigest,
      outputDigest: first.outputDigest,
      output: first,
    };
  });
}

/** Gate B/C: byte-stable output and replay equivalence over the canonical cases. */
export function runExpertDeterminismGate(expertId, cases) {
  const first = runCases(expertId, cases);
  // Gate C replays the identical certified inputs in a separate pass.
  const replay = runCases(expertId, cases);
  const deterministic = first.every((entry) => entry.deterministic);
  const replayEquivalent = first.every((entry, index) => entry.outputDigest === replay[index].outputDigest);
  return {
    expertId,
    caseCount: first.length,
    deterministic,
    replayEquivalent,
    cases: first.map(({ caseId, inputDigest, outputDigest }) => ({ caseId, inputDigest, outputDigest })),
    outputs: first.map((entry) => entry.output),
  };
}

function expectRejection(name, action) {
  try {
    action();
    return { name, rejected: false, code: null };
  } catch (error) {
    return { name, rejected: true, code: error?.code ?? 'UNKNOWN' };
  }
}

/**
 * Gate F: malformed or hostile expert output must not be able to manufacture a
 * dispatch path, bypass a legal mask, mutate state, invent authority, or
 * substitute another runtime or campaign identity.
 */
export function runStage2GNegativeGates({ qualificationIdentity, campaignManifest, baselineOutput }) {
  const validOutput = validateExpertOutput(baselineOutput);
  const clone = () => structuredClone(validOutput);
  const record = buildStage2GEvidenceRecord({
    qualificationIdentity,
    observationId: 'negative-gate-observation',
    recordId: 'negative-gate-record',
    expertOutput: validOutput,
  });

  return [
    expectRejection('tampered-signal-value', () => {
      const forged = clone();
      const firstKey = Object.keys(forged.signals)[0];
      forged.signals[firstKey] = (forged.signals[firstKey] ?? 0) + 1;
      validateExpertOutput(forged);
    }),
    expectRejection('forged-authority-dispatch', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, canDispatch: true };
      validateExpertOutput(forged);
    }),
    expectRejection('manufactured-authority-token', () => {
      const forged = clone();
      forged.authority = { ...forged.authority, canIssueAuthorityTokens: true };
      validateExpertOutput(forged);
    }),
    expectRejection('injected-dispatch-surface', () => {
      const forged = clone();
      forged.dispatchAction = { actionId: 'attack' };
      validateExpertOutput(forged);
    }),
    expectRejection('injected-world-mutation-surface', () => {
      const forged = clone();
      forged.mutateWorld = { target: 'colony' };
      validateExpertOutput(forged);
    }),
    expectRejection('executable-callback', () => {
      const forged = clone();
      forged.signals = { ...forged.signals };
      forged.onApply = () => 'executed';
      validateExpertOutput(forged);
    }),
    expectRejection('out-of-range-signal', () => {
      const forged = clone();
      forged.signals = { ...forged.signals, injected: SIGNAL_SCALE * 10 };
      validateExpertOutput(forged);
    }),
    expectRejection('non-integer-signal', () => {
      const forged = clone();
      forged.signals = { ...forged.signals, injected: 0.5 };
      validateExpertOutput(forged);
    }),
    expectRejection('substituted-runtime-identity', () => {
      const forged = structuredClone(record);
      forged.sentinelRuntimeId = `sha256:${'0'.repeat(64)}`;
      validateStage2GEvidenceRecord(forged, { campaignManifest });
    }),
    expectRejection('substituted-campaign-identity', () => {
      const forged = structuredClone(record);
      forged.stage2fCampaignId = `sha256:${'1'.repeat(64)}`;
      validateStage2GEvidenceRecord(forged, { campaignManifest });
    }),
    expectRejection('substituted-provenance-identity', () => {
      const forged = structuredClone(record);
      forged.generatedRuntimeProvenanceId = `sha256:${'2'.repeat(64)}`;
      validateStage2GEvidenceRecord(forged, { campaignManifest });
    }),
    expectRejection('qualification-inflation', () => {
      const forged = structuredClone(record);
      forged.countsTowardStage2FQualification = true;
      validateStage2GEvidenceRecord(forged, { campaignManifest });
    }),
    expectRejection('escalated-evidence-authority', () => {
      const forged = structuredClone(record);
      forged.authority = { ...forged.authority, canMutateLiveWorld: true };
      validateStage2GEvidenceRecord(forged, { campaignManifest });
    }),
  ];
}

/* ---------------------------------------------------------------------------
 * Certification
 * ------------------------------------------------------------------------- */

/**
 * Run every Stage 2G gate against the inherited Stage 2F campaign manifest and
 * produce the deterministic certification artifact body (self-excluding hash).
 */
export function certifyStage2GExperts({ campaignManifest, sessionId = null, samplingIdentity = null }) {
  assert(campaignManifest && typeof campaignManifest === 'object', 'campaignManifest is required', 'MISSING_CAMPAIGN_ID');

  // Gate E precondition: the kernel authority policy must still be exact R0.
  const authorityPolicy = defaultAuthorityPolicy();
  assertEvaluationOnly(authorityPolicy);

  const caseCorpus = { oracle: STAGE2G_ORACLE_CASES, nexus: STAGE2G_NEXUS_CASES };
  const corpusDigest = sha256(caseCorpus);
  const resolvedSampling = samplingIdentity ?? corpusDigest;
  const resolvedSession = sessionId ?? `stage2g-certification-${corpusDigest.slice(0, 16)}`;

  const qualificationIdentity = buildStage2FQualificationIdentity({
    campaignManifest,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
  });

  const oracle = runExpertDeterminismGate(ORACLE_EXPERT_ID, STAGE2G_ORACLE_CASES);
  const nexus = runExpertDeterminismGate(NEXUS_EXPERT_ID, STAGE2G_NEXUS_CASES);

  const records = [];
  for (const [expert, gate] of [['oracle', oracle], ['nexus', nexus]]) {
    gate.outputs.forEach((output, index) => {
      records.push(buildStage2GEvidenceRecord({
        qualificationIdentity,
        observationId: `${expert}-observation-${String(index).padStart(3, '0')}`,
        recordId: `${expert}-record-${String(index).padStart(3, '0')}`,
        expertOutput: output,
      }));
    });
  }
  for (const record of records) validateStage2GEvidenceRecord(record, { campaignManifest });

  const negativeGates = runStage2GNegativeGates({
    qualificationIdentity,
    campaignManifest,
    baselineOutput: oracle.outputs[0],
  });
  const negativeGatesPassed = negativeGates.every((gate) => gate.rejected);

  const runtimeIdentityBound = records.every((record) => record.sentinelRuntimeId === campaignManifest.sentinelRuntimeId)
    && records.every((record) => record.generatedRuntimeProvenanceId === campaignManifest.generatedRuntimeProvenanceId);
  const campaignBound = records.every((record) => record.stage2fCampaignId === campaignManifest.stage2fCampaignId);
  const expertOutputDigestBound = records.every((record) => /^sha256:[a-f0-9]{64}$/.test(record.expertOutputDigest)
    && /^sha256:[a-f0-9]{64}$/.test(record.expertInputDigest));
  const stage2fProvenanceInherited = runtimeIdentityBound && campaignBound
    && records.every((record) => record.countsTowardStage2FQualification === false);

  const oracleCertified = oracle.deterministic && oracle.replayEquivalent && negativeGatesPassed
    && runtimeIdentityBound && campaignBound && expertOutputDigestBound;
  const nexusCertified = nexus.deterministic && nexus.replayEquivalent && negativeGatesPassed
    && runtimeIdentityBound && campaignBound && expertOutputDigestBound;

  const evidenceDigest = sha256(records.map((record) => record.evidenceHash));

  const body = {
    certificationSchemaVersion: STAGE2G_CERTIFICATION_VERSION,
    stage: STAGE2G_STAGE_ID,
    authority: R0_AUTHORITY.tier,
    expertContractVersion: EXPERT_CONTRACT_VERSION,
    signalScale: SIGNAL_SCALE,

    sentinelRuntimeId: campaignManifest.sentinelRuntimeId,
    generatedRuntimeProvenanceId: campaignManifest.generatedRuntimeProvenanceId,
    stage2fCampaignId: campaignManifest.stage2fCampaignId,
    sessionId: resolvedSession,
    samplingIdentity: resolvedSampling,
    evidenceMode: qualificationIdentity.evidenceMode,
    qualificationEligible: qualificationIdentity.qualificationEligible,

    experts: [oracleManifest, nexusManifest],
    oracleCertified,
    nexusCertified,
    oracleDeterministic: oracle.deterministic,
    nexusDeterministic: nexus.deterministic,
    oracleReplayEquivalent: oracle.replayEquivalent,
    nexusReplayEquivalent: nexus.replayEquivalent,
    oracleCaseCount: oracle.caseCount,
    nexusCaseCount: nexus.caseCount,
    oracleExpertVersion: ORACLE_EXPERT_VERSION,
    nexusExpertVersion: NEXUS_EXPERT_VERSION,

    stage2fProvenanceInherited,
    runtimeIdentityBound,
    campaignBound,
    expertOutputDigestBound,
    evidenceRecordCount: records.length,
    evidenceDigest,
    caseCorpusDigest: corpusDigest,

    negativeGateCount: negativeGates.length,
    negativeGatesPassed,
    negativeGates,

    primeIntegration: 'none-prime-unmodified',
    routerIntegration: 'none-shadow-envelope-only',
    consumedBy: 'shadow-evaluation-only',

    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    authorityTokenIssues: 0,
    incumbentScriptedExecutorPreserved: true,
    canDispatch: false,
    canMutateLiveWorld: false,

    stage2gCertified: oracleCertified && nexusCertified && stage2fProvenanceInherited
      && runtimeIdentityBound && campaignBound && negativeGatesPassed,
  };

  return {
    certification: deepFreeze({ ...body, certificationHash: sha256(body) }),
    records,
    qualificationIdentity,
  };
}

/**
 * Portability digest over the measured Stage 2G surface, following the repository
 * convention: implementation identity plus semantic witnesses, excluding platform,
 * Node version, architecture and endianness.
 */
export function buildStage2GPortabilityDigest() {
  const oracle = runExpertDeterminismGate(ORACLE_EXPERT_ID, STAGE2G_ORACLE_CASES);
  const nexus = runExpertDeterminismGate(NEXUS_EXPERT_ID, STAGE2G_NEXUS_CASES);
  const witnesses = {
    portabilityDigestVersion: 1,
    stage: STAGE2G_STAGE_ID,
    expertContractVersion: EXPERT_CONTRACT_VERSION,
    signalScale: SIGNAL_SCALE,
    oracleExpertId: ORACLE_EXPERT_ID,
    oracleExpertVersion: ORACLE_EXPERT_VERSION,
    nexusExpertId: NEXUS_EXPERT_ID,
    nexusExpertVersion: NEXUS_EXPERT_VERSION,
    oracleCases: oracle.cases,
    nexusCases: nexus.cases,
    oracleSignalNames: Object.keys(oracle.outputs[0].signals).sort(),
    nexusSignalNames: Object.keys(nexus.outputs[0].signals).sort(),
    caseCorpusDigest: sha256({ oracle: STAGE2G_ORACLE_CASES, nexus: STAGE2G_NEXUS_CASES }),
  };
  return { digest: sha256(witnesses), witnesses };
}
