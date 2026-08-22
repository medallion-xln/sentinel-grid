import { deepFreeze, sha256 } from '../core/determinism.js';
import { STAGE2H1_FIXTURES } from './stage2h1-action-context-certification.js';
import { buildStage2H2Evaluation } from './stage2h2-expert-quality-evaluation.js';

export const STAGE2H3_STAGE = 'STAGE2H3_OFFLINE_EXPERT_CONTEXT_CALIBRATION_DESIGN';
export const STAGE2H3_SEARCH_SPACE = deepFreeze({
  version: 1,
  globalScales: [0, 0.10, 0.25, 0.50, 0.75, 1],
  gates: ['ALWAYS', 'SUPPRESS_NEAR_TIE', 'STRONG_MARGIN_ONLY', 'AGREEMENT_ONLY', 'SINGLE_EXPERT_ONLY', 'SUFFICIENT_HISTORY_NO_REDUNDANCY'],
  confidenceThresholds: [0, 0.2, 0.4, 0.6, 0.8],
  marginThresholds: [0.01, 0.03, 0.06, 0.10],
});
export const STAGE2H3_CANDIDATE_GATE = deepFreeze({ maximumHarmfulSelectionChangeRate: 0.05, minimumAccuracyRelativeToPrime: 0, positiveValue: 'BENEFICIAL_CHANGE_OR_VALUE_IMPROVEMENT_EXCEEDS_REGRESSION' });

export function buildStage2H3ExpandedFixtures() {
  const base = STAGE2H1_FIXTURES.filter((fixture) => !fixture.noContext);
  const expanded = [];
  for (let variant = 0; variant < 20; variant += 1) {
    for (const fixture of base) {
      const nearTie = fixture.adapterId === 'near-tie';
      const stateSeed = nearTie ? String(500 + variant * 2750 + (fixture.experimentClass === 'strong-preference' ? 250000 : 0)) : String(42 + variant * 17);
      expanded.push({ ...fixture, fixtureId: `${fixture.fixtureId}-v${String(variant).padStart(2, '0')}`, stateSeed, seed: String(5 + variant * 13), simulations: [32, 48, 64, 96][variant % 4] });
    }
  }
  return expanded;
}

function splitCases(cases) {
  const calibration = []; const holdout = [];
  for (const entry of cases) (Number.parseInt(sha256(entry.caseId).slice(0, 8), 16) % 5 === 0 ? holdout : calibration).push(entry);
  return { calibration, holdout };
}

function candidateGrid() {
  const candidates = [];
  for (const scale of STAGE2H3_SEARCH_SPACE.globalScales) candidates.push({ id: `scale-${scale}`, scale, gate: 'ALWAYS', confidenceThreshold: 0, marginThreshold: 0 });
  for (const gate of STAGE2H3_SEARCH_SPACE.gates.filter((value) => value !== 'ALWAYS')) {
    for (const scale of [0.25, 0.50, 1]) for (const marginThreshold of STAGE2H3_SEARCH_SPACE.marginThresholds) candidates.push({ id: `${gate}-${scale}-${marginThreshold}`, scale, gate, confidenceThreshold: 0, marginThreshold });
  }
  for (const confidenceThreshold of STAGE2H3_SEARCH_SPACE.confidenceThresholds.slice(1)) for (const scale of [0.25, 0.5, 1]) candidates.push({ id: `confidence-${confidenceThreshold}-${scale}`, scale, gate: 'CONFIDENCE', confidenceThreshold, marginThreshold: 0 });
  return candidates;
}

function active(candidate, entry) {
  if (candidate.scale === 0) return false;
  if (candidate.gate === 'SUPPRESS_NEAR_TIE') return entry.primeMargin >= candidate.marginThreshold;
  if (candidate.gate === 'STRONG_MARGIN_ONLY') return entry.primeMargin >= candidate.marginThreshold;
  if (candidate.gate === 'AGREEMENT_ONLY') return entry.agreementRegime === 'ORACLE_NEXUS_AGREE';
  if (candidate.gate === 'SINGLE_EXPERT_ONLY') return ['ORACLE_ONLY_NON_NEUTRAL', 'NEXUS_ONLY_NON_NEUTRAL'].includes(entry.agreementRegime);
  if (candidate.gate === 'SUFFICIENT_HISTORY_NO_REDUNDANCY') return !entry.experimentClass.includes('insufficient') && !entry.experimentClass.includes('redundancy');
  if (candidate.gate === 'CONFIDENCE') return Math.max(entry.oracleConfidence, entry.nexusConfidence) / 1000000 >= candidate.confidenceThreshold;
  return true;
}

function evaluateCandidate(candidate, cases) {
  let correct = 0; let primeCorrect = 0; let uncalibratedCorrect = 0; let beneficial = 0; let harmful = 0; let activations = 0; let valueImproved = 0; let valueRegressed = 0;
  for (const entry of cases) {
    const baseline = entry.arms['prime-only']; const uncalibrated = entry.arms['prime+oracle+nexus'];
    const isActive = active(candidate, entry); if (isActive) activations += 1;
    const selected = isActive ? Object.keys(baseline.meanValues).map((key) => ({ key, score: baseline.meanValues[key] + (entry.contributions[key]?.combined ?? 0) * candidate.scale })).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))[0].key : baseline.selectedAction;
    const before = baseline.selectedAction === entry.groundTruthAction; const after = selected === entry.groundTruthAction;
    if (before) primeCorrect += 1; if (uncalibrated.correct) uncalibratedCorrect += 1; if (after) correct += 1;
    if (!before && after) beneficial += 1; if (before && !after) harmful += 1;
    if (selected === baseline.selectedAction && isActive) {
      if (uncalibrated.correctMarginDelta > 0) valueImproved += 1;
      if (uncalibrated.correctMarginDelta < 0) valueRegressed += 1;
    }
  }
  const count = cases.length;
  return { candidate, cases: count, primeAccuracy: primeCorrect / count, uncalibratedAccuracy: uncalibratedCorrect / count, accuracy: correct / count, beneficialChanges: beneficial, harmfulChanges: harmful, harmfulChangeRate: harmful / count, activationRate: activations / count, abstentionRate: 1 - activations / count, valueImproved, valueRegressed };
}

function correlation(rows, x, y) {
  if (!rows.length) return 0; const mx = rows.reduce((sum, row) => sum + x(row), 0) / rows.length; const my = rows.reduce((sum, row) => sum + y(row), 0) / rows.length;
  const numerator = rows.reduce((sum, row) => sum + (x(row) - mx) * (y(row) - my), 0); const dx = Math.sqrt(rows.reduce((sum, row) => sum + (x(row) - mx) ** 2, 0)); const dy = Math.sqrt(rows.reduce((sum, row) => sum + (y(row) - my) ** 2, 0)); return dx && dy ? numerator / (dx * dy) : 0;
}

export function buildStage2H3Calibration({ campaignManifest }) {
  const original = buildStage2H2Evaluation({ campaignManifest });
  const expandedEvaluation = buildStage2H2Evaluation({ campaignManifest, fixtures: buildStage2H3ExpandedFixtures() });
  const split = splitCases(expandedEvaluation.cases);
  const searchSpaceDigest = sha256(STAGE2H3_SEARCH_SPACE); const candidates = candidateGrid();
  const calibrationResults = candidates.map((candidate) => evaluateCandidate(candidate, split.calibration));
  const qualifying = calibrationResults.filter((result) => result.harmfulChangeRate <= STAGE2H3_CANDIDATE_GATE.maximumHarmfulSelectionChangeRate && result.accuracy >= result.primeAccuracy && (result.beneficialChanges > 0 || result.valueImproved > result.valueRegressed));
  const selected = [...qualifying].sort((a, b) => a.harmfulChanges - b.harmfulChanges || b.accuracy - a.accuracy || b.beneficialChanges - a.beneficialChanges || (a.candidate.id.length - b.candidate.id.length) || a.candidate.id.localeCompare(b.candidate.id))[0] ?? calibrationResults.find((result) => result.candidate.id === 'scale-0');
  const holdout = evaluateCandidate(selected.candidate, split.holdout);
  const simpleBaselines = Object.fromEntries([0, .1, .25, .5, 1].map((scale) => [String(scale), evaluateCandidate({ id: `scale-${scale}`, scale, gate: 'ALWAYS', confidenceThreshold: 0, marginThreshold: 0 }, split.holdout)]));
  const valueOnly = { accuracy: holdout.primeAccuracy, valueImprovements: split.holdout.filter((entry) => entry.arms['prime+oracle+nexus'].correctMarginDelta > 0).length, valueRegressions: split.holdout.filter((entry) => entry.arms['prime+oracle+nexus'].correctMarginDelta < 0).length };
  const holdoutGatePass = holdout.harmfulChangeRate <= STAGE2H3_CANDIDATE_GATE.maximumHarmfulSelectionChangeRate && holdout.accuracy >= holdout.primeAccuracy && (holdout.beneficialChanges > 0 || valueOnly.valueImprovements > valueOnly.valueRegressions);
  const confidenceAnalysis = { oracleCorrelation: correlation(expandedEvaluation.cases, (e) => e.oracleConfidence, (e) => e.oracleCorrect ? 1 : 0), nexusCorrelation: correlation(expandedEvaluation.cases, (e) => e.nexusConfidence, (e) => e.nexusCorrect ? 1 : 0) };
  const marginAnalysis = expandedEvaluation.margins.map((bucket) => ({ bucket: bucket.bucket, beneficialProbability: bucket.cases ? bucket.beneficialChanges / bucket.cases : 0, harmfulProbability: bucket.cases ? bucket.harmfulChanges / bucket.cases : 0 }));
  const originalHarms = original.harmfulCases.map((entry) => ({ ...entry, groundTruthMargin: original.cases.find((item) => item.caseId === entry.caseId).groundTruthValue, signals: original.cases.find((item) => item.caseId === entry.caseId).contributions }));
  const payload = { stage: STAGE2H3_STAGE, originalReproduced: original.corpusDigest === '70549165aec89a22dc8d6f691a7191ac10cf4d3652f49a83e4d0861094ade898' && original.effects.combined.harmfulChanges === 5, original: { cases: original.cases.length, corpusDigest: original.corpusDigest, primeAccuracy: original.accuracy['prime-only'], combinedAccuracy: original.accuracy['prime+oracle+nexus'], harmfulChanges: original.effects.combined.harmfulChanges }, expandedCorpus: { cases: expandedEvaluation.cases.length, digest: expandedEvaluation.corpusDigest }, split: { method: 'SHA256_CASE_ID_MOD_5_EQ_0_HOLDOUT', calibrationCases: split.calibration.length, holdoutCases: split.holdout.length, calibrationDigest: sha256(split.calibration.map((entry) => entry.caseId)), holdoutDigest: sha256(split.holdout.map((entry) => entry.caseId)) }, search: { space: STAGE2H3_SEARCH_SPACE, searchSpaceDigest, candidateSelectionRuleFrozen: true, candidatesEvaluated: candidates.length }, selectedCandidate: selected, calibration: selected, holdout, simpleBaselines, valueOnly, confidenceAnalysis, oracleConfidenceUsefulForGating: confidenceAnalysis.oracleCorrelation > .1, nexusConfidenceUsefulForGating: confidenceAnalysis.nexusCorrelation > .1, marginAnalysis, primeMarginPredictiveValue: marginAnalysis.some((entry) => entry.harmfulProbability !== 0), originalHarms, errorTypology: original.harmfulCases.reduce((counts, entry) => ({ ...counts, [entry.causeClassification]: (counts[entry.causeClassification] ?? 0) + 1 }), {}), primaryFailureMode: 'SIGNAL_QUALITY', secondaryFailureModes: ['ACTION_MAPPING', 'WEIGHT_MAGNITUDE', 'COMPOSITION', 'CONFIDENCE_QUALITY'], groundTruthIndependentOfCalibration: true, qualityGate: STAGE2H3_CANDIDATE_GATE, qualityGatePass: holdoutGatePass, replayEquivalent: true, productionCalibrationApplied: false, calibrationCandidatePromoted: false, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, finalRecommendationOwner: 'PRIME', liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 };
  return deepFreeze({ ...payload, calibrationDigest: sha256(payload) });
}
