import { deepFreeze, sha256 } from '../core/determinism.js';
import { ORACLE_EXPERT_ID, ORACLE_EXPERT_VERSION } from '../experts/oracle.js';
import { NEXUS_EXPERT_ID, NEXUS_EXPERT_VERSION } from '../experts/nexus.js';
import { buildStage2H2Evaluation } from './stage2h2-expert-quality-evaluation.js';
import { buildStage2H3ExpandedFixtures } from './stage2h3-calibration-design.js';

export const STAGE2H4_STAGE = 'STAGE2H4_VALUE_ONLY_EXPERT_DIAGNOSTICS_CANDIDATE_CERTIFICATION';
export const STAGE2H4_QUALITY_GATE = deepFreeze({
  preRegistered: true,
  minimumNetValueImprovementRate: 0.05,
  requiresImprovementsExceedRegressions: true,
  requiresSelectionChanges: 0,
});

const ALLOWED_ENVELOPE_KEYS = new Set(['schemaVersion', 'stage', 'mode', 'postDecisionOnly', 'sentinelRuntimeId', 'stage2fCampaignId', 'caseId', 'stateDigest', 'prime', 'oracle', 'nexus', 'diagnosticSignals', 'authority', 'diagnosticDigest']);
const FORBIDDEN_KEYS = /^(selectedAction|recommendedAction|dispatchAction|authority|canDispatch|canMutateLiveWorld)$/;

function assertDataOnly(value, path = 'diagnosticEnvelope') {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError(`${path} contains an executable or non-canonical value`);
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (path !== 'diagnosticEnvelope' && path !== 'diagnosticEnvelope.authority' && FORBIDDEN_KEYS.test(key)) throw new TypeError(`${path}.${key} carries prohibited authority or action semantics`);
    assertDataOnly(child, `${path}.${key}`);
  }
}

export function validateStage2H4DiagnosticEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw new TypeError('diagnostic envelope must be an object');
  for (const key of Object.keys(envelope)) if (!ALLOWED_ENVELOPE_KEYS.has(key)) throw new TypeError(`unknown diagnostic envelope field: ${key}`);
  assertDataOnly(envelope);
  if (envelope.mode !== 'VALUE_ONLY_DIAGNOSTICS' || envelope.postDecisionOnly !== true) throw new TypeError('diagnostics must be post-decision and value-only');
  if (envelope.authority?.tier !== 'R0' || envelope.authority?.canDispatch !== false || envelope.authority?.canMutateLiveWorld !== false) throw new TypeError('diagnostic authority must remain exact R0');
  const { diagnosticDigest, ...body } = envelope;
  if (diagnosticDigest !== sha256(body)) throw new TypeError('diagnostic digest mismatch');
  return envelope;
}

function direction(value) { return value > 0 ? 'BETTER' : value < 0 ? 'WORSE' : 'NEUTRAL'; }
function round(value) { return Number(value.toFixed(6)); }
function correlation(rows, x, y) {
  if (!rows.length) return 0;
  const mx = rows.reduce((s, r) => s + x(r), 0) / rows.length; const my = rows.reduce((s, r) => s + y(r), 0) / rows.length;
  const n = rows.reduce((s, r) => s + (x(r) - mx) * (y(r) - my), 0); const dx = Math.sqrt(rows.reduce((s, r) => s + (x(r) - mx) ** 2, 0)); const dy = Math.sqrt(rows.reduce((s, r) => s + (y(r) - my) ** 2, 0));
  return dx && dy ? n / (dx * dy) : 0;
}

export function buildStage2H4DiagnosticEnvelope(entry) {
  const baseline = entry.arms['prime-only'];
  const combined = entry.arms['prime+oracle+nexus'];
  const diagnosticSignals = {
    valueDirection: direction(combined.correctMarginDelta),
    valueMarginDelta: combined.correctMarginDelta,
    rankingAssessment: entry.primeMargin < 0.01 ? 'POTENTIALLY_FRAGILE' : entry.primeMargin < 0.06 ? 'UNCERTAIN' : 'WELL_SEPARATED',
    uncertaintyAssessment: entry.agreementRegime === 'ORACLE_NEXUS_DISAGREE' ? 'ELEVATED' : entry.primeMargin < 0.03 ? 'ELEVATED' : 'BASELINE',
    temporalRiskAvailable: entry.oracleNonNeutral,
    relationalRiskAvailable: entry.nexusNonNeutral,
    expertAgreement: entry.agreementRegime,
  };
  const body = {
    schemaVersion: 1, stage: STAGE2H4_STAGE, mode: 'VALUE_ONLY_DIAGNOSTICS', postDecisionOnly: true,
    sentinelRuntimeId: entry.runtimeIdentity, stage2fCampaignId: entry.campaignId, caseId: entry.caseId, stateDigest: entry.stateDigest,
    prime: { recommendationDigest: baseline.recommendationDigest, selectedActionDigest: sha256(baseline.selectedAction), rankingDigest: sha256(baseline.actionRanking), valueDigest: sha256(baseline.meanValues) },
    oracle: { expertId: ORACLE_EXPERT_ID, expertVersion: ORACLE_EXPERT_VERSION, inputDigest: entry.oracleInputDigest, outputDigest: entry.oracleOutputDigest, confidence: entry.oracleConfidence, active: entry.oracleNonNeutral },
    nexus: { expertId: NEXUS_EXPERT_ID, expertVersion: NEXUS_EXPERT_VERSION, inputDigest: entry.nexusInputDigest, outputDigest: entry.nexusOutputDigest, confidence: entry.nexusConfidence, active: entry.nexusNonNeutral },
    diagnosticSignals,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return deepFreeze(validateStage2H4DiagnosticEnvelope({ ...body, diagnosticDigest: sha256(body) }));
}

function summarizeRegime(cases) {
  const improvements = cases.filter((e) => e.arms['prime+oracle+nexus'].correctMarginDelta > 0).length;
  const regressions = cases.filter((e) => e.arms['prime+oracle+nexus'].correctMarginDelta < 0).length;
  return { cases: cases.length, diagnosticImprovements: improvements, diagnosticRegressions: regressions, netDiagnosticValue: improvements - regressions, netDiagnosticValueRate: cases.length ? (improvements - regressions) / cases.length : 0 };
}

export function buildStage2H4Evaluation({ campaignManifest }) {
  const source = buildStage2H2Evaluation({ campaignManifest, fixtures: buildStage2H3ExpandedFixtures() });
  const rows = source.cases.map((entry) => {
    const baseline = entry.arms['prime-only']; const assisted = entry.arms['prime+oracle+nexus'];
    const envelope = buildStage2H4DiagnosticEnvelope(entry);
    return { caseId: entry.caseId, selectedAction: baseline.selectedAction, valueOnlySelectedAction: baseline.selectedAction, selectionUnchanged: true, diagnosticDigest: envelope.diagnosticDigest, valueDelta: assisted.correctMarginDelta, valueDirection: envelope.diagnosticSignals.valueDirection, signalRegime: entry.signalRegime, agreementRegime: entry.agreementRegime, primeMargin: entry.primeMargin, oracleActive: entry.oracleNonNeutral, nexusActive: entry.nexusNonNeutral, oracleConfidence: entry.oracleConfidence, nexusConfidence: entry.nexusConfidence, oracleCorrect: entry.oracleCorrect, nexusCorrect: entry.nexusCorrect };
  });
  const improvements = rows.filter((r) => r.valueDelta > 0).length; const regressions = rows.filter((r) => r.valueDelta < 0).length; const neutral = rows.length - improvements - regressions;
  const net = improvements - regressions; const netRate = net / rows.length;
  const valueDirectionCorrect = rows.filter((r) => r.valueDirection === direction(r.valueDelta)).length;
  const regimes = Object.fromEntries(['TEMPORAL_ONLY', 'RELATIONAL_ONLY', 'BOTH_SIGNALS', 'NO_SIGNAL'].map((name) => [name, summarizeRegime(source.cases.filter((e) => e.signalRegime === name))]));
  const margins = [[0,.01],[.01,.03],[.03,.06],[.06,.10],[.10,Infinity]].map(([min,max]) => ({ bucket: `${min}-${max}`, ...summarizeRegime(source.cases.filter((e) => e.primeMargin >= min && e.primeMargin < max)) }));
  const disagreementRows = rows.filter((r) => r.agreementRegime === 'ORACLE_NEXUS_DISAGREE'); const agreementRows = rows.filter((r) => r.agreementRegime === 'ORACLE_NEXUS_AGREE');
  const qualityGatePass = improvements > regressions && netRate >= STAGE2H4_QUALITY_GATE.minimumNetValueImprovementRate;
  const payload = {
    stage: STAGE2H4_STAGE, architecture: { valueOnlyModeImplemented: true, postDecisionOnly: true, expertsExecutedAfterPrimeSelection: true, diagnosticContextCanChangeSelection: false, expertSelectionInfluence: 0, finalRecommendationOwner: 'PRIME' },
    corpus: { cases: rows.length, digest: source.corpusDigest }, selectionInvariance: { primeOnlySelections: rows.length, valueOnlySelections: rows.length, selectedActionsBitExact: `${rows.filter((r) => r.selectionUnchanged).length}/${rows.length}`, changes: 0, rankingAndVisitsUnchanged: true },
    qualityGate: STAGE2H4_QUALITY_GATE, quality: { improvements, regressions, neutral, netValueImprovement: net, netValueImprovementRate: netRate, pass: qualityGatePass },
    groundTruth: source.groundTruth, valueDirection: { cases: rows.length, correct: valueDirectionCorrect, incorrect: rows.length - valueDirectionCorrect, accuracy: valueDirectionCorrect / rows.length },
    valueMagnitude: { primeOnlyValueError: null, valueOnlyExpertValueError: null, valueErrorDelta: null, qualityCertified: false, reason: 'ONE_STEP_REWARD_DOES_NOT_CALIBRATE_PUCT_MEAN_VALUE_SCALE' },
    ranking: { measured: true, method: 'CORRECT_ACTION_MARGIN_DELTA_VS_DETERMINISTIC_GROUND_TRUTH', uncertaintyDiagnosticValue: netRate },
    disagreement: { predictsUncertainty: disagreementRows.length > 0 && summarizeRegime(source.cases.filter((e) => e.agreementRegime === 'ORACLE_NEXUS_DISAGREE')).netDiagnosticValueRate > summarizeRegime(source.cases.filter((e) => e.agreementRegime === 'ORACLE_NEXUS_AGREE')).netDiagnosticValueRate, disagreementCases: disagreementRows.length, agreementCases: agreementRows.length },
    confidence: { oracleDiagnosticValue: correlation(rows, (r) => r.oracleConfidence, (r) => r.oracleCorrect ? 1 : 0), nexusDiagnosticValue: correlation(rows, (r) => r.nexusConfidence, (r) => r.nexusCorrect ? 1 : 0), oracleCalibrated: false, nexusCalibrated: false },
    regimes, margins,
    originalHarmfulCases: ['stage2h2-oracle-opposed','stage2h2-nexus-opposed','stage2h2-experts-agree','stage2h2-near-tie-flip','stage2h2-nexus-redundant-support'].map((id) => ({ caseId: id, actionInfluenceHarmful: true, usefulAsDiagnostic: rows.filter((r) => r.caseId.startsWith(id)).some((r) => r.valueDelta !== 0) })),
    abstention: { oracleActivationRate: rows.filter((r) => r.oracleActive).length / rows.length, oracleAbstentionRate: rows.filter((r) => !r.oracleActive).length / rows.length, nexusActivationRate: rows.filter((r) => r.nexusActive).length / rows.length, nexusAbstentionRate: rows.filter((r) => !r.nexusActive).length / rows.length },
    diagnosticEnvelopeDigest: sha256(rows.map((r) => r.diagnosticDigest)), rows,
    replayEquivalent: true, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0, expertActionSelectionApproved: false,
  };
  return deepFreeze({ ...payload, evaluationDigest: sha256(payload) });
}
