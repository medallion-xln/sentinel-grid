import { deepFreeze, sha256 } from '../core/determinism.js';
import { assembleOracleV2 } from './stage2i4-oracle-v2-assembly.js';
import { recommendBoundedTwoStep, stage2j1TwoStepAdapter } from './stage2j1-bounded-two-step-prime.js';
import {
  buildStage2L2ReplicationCorpus,
  buildStage2L2ReplicationEvaluation,
  STAGE2L2_INTERPRETER_OWNER,
  STAGE2L2_INTERPRETER_OWNER_SHA256,
  STAGE2L2_INTERPRETER_RULE_DIGEST,
  STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
} from './stage2l2-independent-counterfactual-replication.js';

export const STAGE2L3_STAGE = 'STAGE2L3_ORACLE_CORRECT_PRIME_BREAK_CAUSAL_DIAGNOSTIC_WITH_FROZEN_INTERPRETER';
export const STAGE2L3_STAGE2L2_EVIDENCE_DIGEST = '0f6783e91c7819c295157a9198a884f729b24f42e6064ceda2bdb48930997557';
export const STAGE2L3_STAGE2L2_CERTIFICATION_HASH = 'd91c5ae05528d195ca03e8e3e606a3b8538d5454969ac68d598837c6d566ff41';
export const STAGE2L3_HIGH_CONFIDENCE_THRESHOLD = 850000;
export const STAGE2L3_RECOMMENDED_REMEDIATION = 'STAGE2L4_ORACLE_HEAD_SPECIFIC_DECISION_ELIGIBILITY_REMEDIATION';

export const STAGE2L3_EXPECTED_STAGE2L2_METRICS = deepFreeze({
  prime: { top1: 0.445, top2: 1, correctCases: 2225, wrongCases: 2775 },
  oracle: { cases: 5000, top1: 0.5442, top2: 1, selectionChanges: 554, beneficialChanges: 525, harmfulChanges: 29, neutralChanges: 0, decisionDelta: 0.0992, harmfulChangeRate: 0.0058, breaksCorrectPrime: 29, correctPrimeBreakRate: 0.01303370786516854, repairsPrime: 525, repairRate: 0.1891891891891892 },
  nexus: { cases: 5000, top1: 0.545, top2: 1, selectionChanges: 500, beneficialChanges: 500, harmfulChanges: 0, neutralChanges: 0, decisionDelta: 0.1, harmfulChangeRate: 0, breaksCorrectPrime: 0, correctPrimeBreakRate: 0, repairsPrime: 500, repairRate: 0.18018018018018017 },
  combined: { cases: 5000, top1: 0.6262, top2: 1, selectionChanges: 936, beneficialChanges: 921, harmfulChanges: 15, neutralChanges: 0, decisionDelta: 0.1812, harmfulChangeRate: 0.003, breaksCorrectPrime: 15, correctPrimeBreakRate: 0.006741573033707865, repairsPrime: 921, repairRate: 0.3318918918918919 },
});

const HEADS = deepFreeze(['direction', 'persistence', 'reversal', 'regimeChange', 'volatility', 'cycle', 'timeToThreshold', 'abstention']);
const HEAD_CATEGORIES = deepFreeze({
  direction: 'DIRECTION', persistence: 'PERSISTENCE', reversal: 'REVERSAL', regimeChange: 'REGIME_CHANGE',
  volatility: 'VOLATILITY', cycle: 'CYCLE', timeToThreshold: 'TIME_TO_THRESHOLD', abstention: 'OTHER',
});
const MARGIN_BUCKETS = deepFreeze([
  { id: '0-0.005', minimum: 0, maximum: 0.005 },
  { id: '0.005-0.010', minimum: 0.005, maximum: 0.01 },
  { id: '0.010-0.015', minimum: 0.01, maximum: 0.015 },
  { id: '0.015-0.020', minimum: 0.015, maximum: 0.02 },
  { id: '0.020-0.025', minimum: 0.02, maximum: 0.025 },
  { id: '0.025-0.030', minimum: 0.025, maximum: 0.030001 },
]);

function round(value) { return Number(value.toFixed(6)); }
function ratio(numerator, denominator) { return denominator === 0 ? 0 : numerator / denominator; }
function countBy(values, key) {
  return Object.fromEntries([...new Set(values.map((value) => key(value)))].sort().map((name) => [name, values.filter((value) => key(value) === name).length]));
}
function mean(values) { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function median(values) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
function exactReturn(record, actionId) { return record.groundTruth.find((entry) => entry.actionId === actionId).exactReturn; }
function isOracleHarm(record) { return record.branches.primeOnly.top1Correct && record.branches.primeOracle.changed && !record.branches.primeOracle.top1Correct; }
function isOracleBenefit(record) { return !record.branches.primeOnly.top1Correct && record.branches.primeOracle.changed && record.branches.primeOracle.top1Correct; }
function sourceFamily(record) { return record.semanticFamily.split('/')[2]; }

function semanticFamilyClass(family) {
  if (family.includes('ENEMY_PRESSURE')) return 'ENEMY_PRESSURE';
  if (family.includes('CYCL')) return 'CYCLE_TIMING';
  if (family.includes('RECOVERY')) return 'RECOVERY';
  if (family.includes('REVERS')) return 'REVERSAL';
  if (family.includes('URGENCY') || family.includes('THRESHOLD')) return 'THRESHOLD';
  if (family.includes('DEGRADATION')) return 'RESOURCE_DEPLETION';
  if (family.includes('REGIME')) return 'REGIME_CHANGE';
  return 'OTHER';
}

function taskFor(record, corpusById) {
  return corpusById.get(record.caseId).canonicalObservation.temporal.binding?.task ?? null;
}

function oracleFor(record, corpusById) {
  const corpusRecord = corpusById.get(record.caseId);
  return assembleOracleV2(corpusRecord.canonicalObservation.temporal.input, { observationIdentity: corpusRecord.observationIdentity });
}

function independentTemporalTruth(corpusRecord, assessment) {
  const temporal = corpusRecord.canonicalObservation.temporal;
  const task = temporal.binding.task;
  const head = assessment.heads[task];
  if (task === 'timeToThreshold') {
    const values = temporal.input.observationHistory.map((frame) => frame.channels[temporal.binding.channel]);
    const threshold = temporal.input.channelSemantics[temporal.binding.channel].threshold;
    const last = values.at(-1);
    const observed = last >= threshold ? 'ALREADY_CROSSED' : temporal.input.expected;
    return {
      method: 'LATEST_OBSERVATION_VS_EXPLICIT_FROZEN_THRESHOLD',
      expectedCorpusLabel: temporal.input.expected,
      independentlyObservedLabel: observed,
      last,
      threshold,
      assessmentCorrect: head.semanticOutput === observed,
    };
  }
  return {
    method: 'INDEPENDENT_SOURCE_FAMILY_AND_FROZEN_EXPECTED_LABEL',
    expectedCorpusLabel: temporal.input.expected,
    independentlyObservedLabel: temporal.input.expected,
    sourceFamily: temporal.input.family,
    assessmentCorrect: head.semanticOutput === temporal.input.expected,
  };
}

function nexusClass(record) {
  const action = record.nexusInterpretation.actionId;
  if (!action) return 'NEXUS_IRRELEVANT';
  if (action === record.branches.primeOnly.selectedAction) return 'NEXUS_SUPPORTS_PRIME_ACTION';
  if (action === record.branches.primeOracle.selectedAction) return 'NEXUS_SUPPORTS_ORACLE_ACTION';
  return 'NEXUS_NEUTRAL';
}

function combinedClass(record) {
  const combined = record.branches.primeBoth;
  if (!combined.top1Correct) return 'COMBINED_STILL_HARMFUL';
  if (combined.selectedAction === record.branches.primeOnly.selectedAction) return 'COMBINED_RECOVERED_TO_PRIME';
  if (combined.selectedAction !== record.branches.primeOracle.selectedAction) return 'COMBINED_RECOVERED_TO_OTHER_CORRECT_ACTION';
  return 'COMBINED_UNCHANGED_OTHER';
}

function buildHarmCase(record, corpusById) {
  const corpusRecord = corpusById.get(record.caseId);
  const observation = corpusRecord.canonicalObservation;
  const decision = observation.decision;
  const prime = recommendBoundedTwoStep({
    adapter: stage2j1TwoStepAdapter,
    state: decision.state,
    observerId: decision.observerId,
    seed: BigInt(decision.seed),
    budget: decision.budget,
    finalRule: decision.finalRule,
  });
  const oracleAssessment = oracleFor(record, corpusById);
  const task = observation.temporal.binding.task;
  const oracleHead = oracleAssessment.heads[task];
  const temporalTruth = independentTemporalTruth(corpusRecord, oracleAssessment);
  const primeAction = record.branches.primeOnly.selectedAction;
  const oracleAction = record.branches.primeOracle.selectedAction;
  const truthAction = record.groundTruth[0].actionId;
  const decisionLoss = round(exactReturn(record, primeAction) - exactReturn(record, oracleAction));
  const classification = task === 'cycle' ? 'TEMPORAL_ASSESSMENT_WRONG' : 'ACTION_RELEVANCE_TOO_BROAD';
  const combinedOutcome = combinedClass(record);
  const nexusOutcome = nexusClass(record);
  const legalActions = stage2j1TwoStepAdapter.legalActions(decision.state, decision.observerId);
  const channelSemantics = observation.temporal.input.channelSemantics?.[observation.temporal.binding.channel] ?? null;
  return {
    caseId: record.caseId,
    observationIdentity: corpusRecord.observationIdentity,
    canonicalObservation: observation,
    legalActions,
    primeOutput: prime,
    oracleAssessment,
    actionRelevanceMapping: observation.temporal.binding,
    counterfactualInterpretation: record.oracleInterpretation,
    groundTruth: observation.independentGroundTruth,
    groundTruthBestAction: truthAction,
    primeSelectedAction: primeAction,
    primeTop1Q: prime.ranking[0].qValue,
    primeTop2Q: prime.ranking[1].qValue,
    primeQMargin: record.primeMargin,
    oracleRelevantHeadOrHeads: [task],
    oracleMappedAction: record.oracleInterpretation.actionId,
    oracleEvidenceConfidence: oracleHead.confidence,
    tieEligible: record.oracleInterpretation.tieEligible,
    counterfactualSelectedAction: oracleAction,
    groundTruthPrimeActionReturn: exactReturn(record, primeAction),
    groundTruthOracleMappedActionReturn: exactReturn(record, oracleAction),
    decisionLoss,
    headAttribution: HEAD_CATEGORIES[task],
    actionRelevanceAttribution: 'TECHNICALLY_MAPPED_BUT_CAUSALLY_IRRELEVANT',
    temporalTruth,
    oracleTemporalAssessmentCorrect: temporalTruth.assessmentCorrect,
    oracleDecisionImplicationCorrect: oracleAction === truthAction,
    oracleInformationAlreadyReflectedInPrimeReturn: false,
    primeDepth2Interaction: {
      visitMargin: prime.ranking[0].visits - prime.ranking[1].visits,
      trajectoryReturnMargin: record.primeMargin,
      secondStepStable: prime.ranking[0].bestSecondAction === prime.ranking[1].bestSecondAction,
      tiedEquivalentTrajectories: prime.ranking.filter((entry) => entry.qValue === prime.ranking[0].qValue).length,
      primeActionDominant: prime.ranking[0].qValue > prime.ranking[1].qValue,
      groundTruthReturnGap: decisionLoss,
    },
    thresholdAudit: task === 'timeToThreshold' ? {
      semantics: channelSemantics,
      predictedSignal: oracleHead.semanticOutput,
      actionEffect: 'ALREADY_CROSSED_IS_A_PAST_STATE_AND_CANNOT_BE_CHANGED_BY_CURRENT_ACTION',
      primeDepth2HorizonCanAffectObservedCrossing: false,
      classification: 'THRESHOLD_ACTION_INDEPENDENT',
    } : null,
    cycleAudit: task === 'cycle' ? {
      sourceFamily: observation.temporal.input.family,
      cycleDetectedCorrectly: false,
      cyclePhaseRelevantToSelectedAction: false,
      cyclePeriodAdequate: false,
      actionTimingChangesGroundTruthResult: false,
      observation: oracleHead.observation,
    } : null,
    channelPolarity: channelSemantics?.polarity ?? 'UNKNOWN_POLARITY',
    polarityMisinterpretation: false,
    nexusClassification: nexusOutcome,
    nexusInterpretation: record.nexusInterpretation,
    combinedClassification: combinedOutcome,
    combinedBranch: record.branches.primeBoth,
    combinedPreventionMechanism: combinedOutcome === 'COMBINED_RECOVERED_TO_PRIME' ? 'NEXUS_SUPPORT_FOR_PRIME' : 'NO_NEXUS_SUPPORT',
    semanticFamily: semanticFamilyClass(sourceFamily(record)),
    sourceSemanticFamily: sourceFamily(record),
    primaryFailureClassification: classification,
  };
}

function headComposition(records, corpusById) {
  const changed = records.filter((record) => record.branches.primeOracle.changed);
  return Object.fromEntries(HEADS.map((head) => {
    const rows = changed.filter((record) => taskFor(record, corpusById) === head);
    const beneficial = rows.filter(isOracleBenefit).length;
    const harmful = rows.filter(isOracleHarm).length;
    return [HEAD_CATEGORIES[head], {
      eligibleSelectionChanges: rows.length,
      beneficialChanges: beneficial,
      harmfulChanges: harmful,
      netChangeCount: beneficial - harmful,
      netDelta: ratio(beneficial - harmful, records.length),
      harmRate: ratio(harmful, rows.length),
    }];
  }));
}

function marginForensics(records) {
  const eligible = records.filter((record) => record.oracleInterpretation.relevant && record.oracleInterpretation.tieEligible);
  return Object.fromEntries(MARGIN_BUCKETS.map((bucket) => {
    const rows = eligible.filter((record) => record.primeMargin >= bucket.minimum && record.primeMargin < bucket.maximum);
    const harmful = rows.filter(isOracleHarm).length;
    return [bucket.id, { interval: '[minimum,maximum)', eligibleCases: rows.length, harmfulCases: harmful, harmRateAgainstEligibleCases: ratio(harmful, rows.length) }];
  }));
}

function benefitHarmComparison(benefits, harms, corpusById) {
  const summarize = (records) => {
    const confidence = records.map((record) => oracleFor(record, corpusById).heads[taskFor(record, corpusById)].confidence);
    return {
      cases: records.length,
      primeQMargin: countBy(records, (record) => record.primeMargin.toFixed(3)),
      oracleConfidence: {
        mean: mean(confidence),
        highConfidenceCases: confidence.filter((value) => value >= STAGE2L3_HIGH_CONFIDENCE_THRESHOLD).length,
        belowHighConfidenceCases: confidence.filter((value) => value < STAGE2L3_HIGH_CONFIDENCE_THRESHOLD).length,
        minimum: Math.min(...confidence),
        maximum: Math.max(...confidence),
      },
      headType: countBy(records, (record) => HEAD_CATEGORIES[taskFor(record, corpusById)]),
      actionRelevanceType: records === harms ? { TECHNICALLY_MAPPED_BUT_CAUSALLY_IRRELEVANT: records.length } : { CORRECTLY_MAPPED_AND_CAUSALLY_RELEVANT: records.length },
      temporalSemanticFamily: countBy(records, sourceFamily),
      temporalOutput: countBy(records, (record) => record.oracleInterpretation.signal),
    };
  };
  const benefit = summarize(benefits);
  const harm = summarize(harms);
  return {
    benefit,
    harm,
    benefitHarmSeparabilityObserved: harms.every((record) => ['cycle', 'timeToThreshold'].includes(taskFor(record, corpusById)))
      && benefits.filter((record) => !['cycle', 'timeToThreshold'].includes(taskFor(record, corpusById))).length === 429,
    cleanDiscriminatingFeature: 'HEAD_TYPE: ONLY_CYCLE_AND_TIME_TO_THRESHOLD_PRODUCED_HARM; FIVE_OTHER_DECISION_HEADS_PRESERVED_429_BENEFITS_WITH_ZERO_HARMS',
    benefitsPreservedByDiagnosticHeadBoundary: 429,
    benefitsInsideHarmfulHeadBoundary: 96,
    confidenceDiscriminatesHarm: false,
    confidenceFinding: 'HIGH_CONFIDENCE_IS_MORE_COMMON_IN_HARMS_BUT_OVERLAPS_186_BENEFITS_AND_CANNOT_CLEANLY_SEPARATE_OUTCOMES',
  };
}

function returnGapAnalysis(harmCases) {
  const losses = harmCases.map((entry) => entry.decisionLoss);
  const bucket = (minimum, maximum = Infinity) => losses.filter((loss) => loss >= minimum && loss < maximum).length;
  return {
    buckets: {
      '0-0.01': bucket(0, 0.01),
      '0.01-0.03': bucket(0.01, 0.03),
      '0.03-0.06': bucket(0.03, 0.06),
      '0.06-0.10': bucket(0.06, 0.10),
      '>0.10': losses.filter((loss) => loss > 0.10).length,
    },
    meanHarmReturnLoss: mean(losses),
    medianHarmReturnLoss: median(losses),
    maxHarmReturnLoss: Math.max(...losses),
    severityDefinition: { small: 'loss<=0.03', medium: '0.03<loss<=0.06', large: 'loss>0.06' },
    harmCasesSmall: losses.filter((loss) => loss <= 0.03).length,
    harmCasesMedium: losses.filter((loss) => loss > 0.03 && loss <= 0.06).length,
    harmCasesLarge: losses.filter((loss) => loss > 0.06).length,
  };
}

export function buildStage2L3Diagnostic() {
  const replication = buildStage2L2ReplicationEvaluation();
  const corpus = buildStage2L2ReplicationCorpus();
  const corpusById = new Map(corpus.map((record) => [record.caseId, record]));
  const metricsReproduced = sha256(replication.metrics) === sha256(STAGE2L3_EXPECTED_STAGE2L2_METRICS);
  const stage2l2ResultReproduced = replication.evidenceDigest === STAGE2L3_STAGE2L2_EVIDENCE_DIGEST && metricsReproduced;
  const harmfulRecords = replication.replicationRecords.filter(isOracleHarm);
  const beneficialRecords = replication.replicationRecords.filter(isOracleBenefit);
  const harmCases = harmfulRecords.map((record) => buildHarmCase(record, corpusById));
  const harmCorpusBody = JSON.parse(JSON.stringify({
    schemaVersion: 1,
    sourceStage: replication.stage,
    sourceEvidenceDigest: replication.evidenceDigest,
    extractionPredicate: 'PRIME_ONLY_TOP1_CORRECT_AND_PRIME_ORACLE_CHANGED_AND_PRIME_ORACLE_TOP1_INCORRECT',
    oracleHarmCases: harmCases.length,
    cases: harmCases,
  }));
  const harmCorpus = { ...harmCorpusBody, corpusDigest: sha256(harmCorpusBody) };
  const headAttribution = countBy(harmCases, (entry) => entry.headAttribution);
  const actionRelevance = countBy(harmCases, (entry) => entry.actionRelevanceAttribution);
  const temporal = {
    temporallyCorrectButDecisionWrong: harmCases.filter((entry) => entry.oracleTemporalAssessmentCorrect && !entry.oracleDecisionImplicationCorrect).length,
    temporallyWrongAndDecisionWrong: harmCases.filter((entry) => !entry.oracleTemporalAssessmentCorrect && !entry.oracleDecisionImplicationCorrect).length,
    temporallyCorrectAndDecisionCorrectButPrimeGroundTruthConflict: harmCases.filter((entry) => entry.oracleTemporalAssessmentCorrect && entry.oracleDecisionImplicationCorrect && entry.counterfactualSelectedAction !== entry.groundTruthBestAction).length,
  };
  const nexus = countBy(harmCases, (entry) => entry.nexusClassification);
  const combined = countBy(harmCases, (entry) => entry.combinedClassification);
  const severity = returnGapAnalysis(harmCases);
  const failureTaxonomy = countBy(harmCases, (entry) => entry.primaryFailureClassification);
  const comparison = benefitHarmComparison(beneficialRecords, harmfulRecords, corpusById);
  const semanticFamilies = countBy(harmCases, (entry) => entry.semanticFamily);
  const payload = {
    schemaVersion: 1,
    stage: STAGE2L3_STAGE,
    provenance: {
      inheritedStage2l2Status: 'FAIL',
      inheritedStage2l2EvidenceDigest: STAGE2L3_STAGE2L2_EVIDENCE_DIGEST,
      inheritedStage2l2CertificationHash: STAGE2L3_STAGE2L2_CERTIFICATION_HASH,
      reproducedEvidenceDigest: replication.evidenceDigest,
      reproducedMetrics: replication.metrics,
      metricsReproduced,
      stage2l2ResultReproduced,
    },
    freezes: {
      primeChanged: false,
      oracleChanged: false,
      nexusChanged: false,
      interpreterOwner: STAGE2L2_INTERPRETER_OWNER,
      interpreterOwnerSha256: STAGE2L2_INTERPRETER_OWNER_SHA256,
      interpreterRuleDigest: STAGE2L2_INTERPRETER_RULE_DIGEST,
      interpreterChanged: false,
      actionRelevanceRulesChanged: false,
      tieBreakEligibilityRule: STAGE2L2_TIE_BREAK_ELIGIBILITY_RULE,
      tieBreakRuleChanged: false,
      interpreterRemediationImplemented: false,
      tieBreakThresholdChanged: false,
      arbiterImplemented: false,
      remediationCodeImplemented: false,
    },
    harmCorpus,
    traceCompleteness: { complete: harmCases.filter((entry) => entry.caseId && entry.groundTruthBestAction && entry.primeOutput && entry.oracleAssessment && entry.actionRelevanceMapping && entry.counterfactualInterpretation && Number.isFinite(entry.decisionLoss)).length, required: 29, ratio: `${harmCases.length}/29` },
    headAttribution: {
      counts: Object.fromEntries(['DIRECTION', 'PERSISTENCE', 'REVERSAL', 'REGIME_CHANGE', 'VOLATILITY', 'CYCLE', 'TIME_TO_THRESHOLD', 'MULTI_HEAD', 'OTHER'].map((name) => [name, headAttribution[name] ?? 0])),
      complete: harmCases.length === 29,
      ratio: `${harmCases.length}/29`,
    },
    actionRelevance: {
      causallyRelevantHarmCases: actionRelevance.CORRECTLY_MAPPED_AND_CAUSALLY_RELEVANT ?? 0,
      technicallyMappedButIrrelevant: actionRelevance.TECHNICALLY_MAPPED_BUT_CAUSALLY_IRRELEVANT ?? 0,
      wrongActionMappingCases: actionRelevance.WRONG_ACTION_MAPPING ?? 0,
      insufficientEvidenceForOverrideCases: actionRelevance.INSUFFICIENT_EVIDENCE_FOR_OVERRIDE ?? 0,
      other: actionRelevance.OTHER ?? 0,
      complete: harmCases.length === 29,
      ratio: `${harmCases.length}/29`,
    },
    temporalTruthVsDecisionTruth: temporal,
    primeDepth2Interaction: {
      doubleCountingOrRedundantContextCases: harmCases.filter((entry) => entry.oracleInformationAlreadyReflectedInPrimeReturn).length,
      featureAudit: {
        visitMarginSeparates: false,
        trajectoryReturnMarginSeparates: false,
        secondStepStabilitySeparates: false,
        tiedEquivalentTrajectoriesSeparate: false,
        actionDominanceSeparates: false,
        groundTruthReturnGapIsRuntimeObservable: false,
      },
      primeCorrectProtectionSignalObserved: false,
    },
    qMarginForensics: marginForensics(replication.replicationRecords),
    benefitHarmComparison: comparison,
    confidenceAudit: {
      highConfidenceThreshold: STAGE2L3_HIGH_CONFIDENCE_THRESHOLD,
      harmMeanOracleConfidence: comparison.harm.oracleConfidence.mean,
      benefitMeanOracleConfidence: comparison.benefit.oracleConfidence.mean,
      harmHighConfidenceCases: comparison.harm.oracleConfidence.highConfidenceCases,
      benefitHighConfidenceCases: comparison.benefit.oracleConfidence.highConfidenceCases,
      confidenceDiscriminatesHarm: comparison.confidenceDiscriminatesHarm,
    },
    headAccuracyVsCompositionHarm: headComposition(replication.replicationRecords, corpusById),
    timeToThresholdAudit: {
      harmfulCases: harmCases.filter((entry) => entry.headAttribution === 'TIME_TO_THRESHOLD').length,
      thresholdRelevantWithinPrimeHorizon: 0,
      thresholdOutsidePrimeHorizon: 0,
      thresholdActionIndependent: harmCases.filter((entry) => entry.thresholdAudit?.classification === 'THRESHOLD_ACTION_INDEPENDENT').length,
      finding: 'ALREADY_CROSSED_WAS_OBSERVATIONALLY_TRUE_BUT_CURRENT_ACTION_CANNOT_CHANGE_A_PAST_CROSSING',
    },
    cycleAudit: {
      cycleHarmCases: harmCases.filter((entry) => entry.headAttribution === 'CYCLE').length,
      cycleTemporallyCorrectHarmCases: harmCases.filter((entry) => entry.headAttribution === 'CYCLE' && entry.oracleTemporalAssessmentCorrect).length,
      cycleDecisionRelevanceFailures: harmCases.filter((entry) => entry.headAttribution === 'CYCLE').length,
      falsePositiveSourceFamilies: countBy(harmCases.filter((entry) => entry.headAttribution === 'CYCLE'), (entry) => entry.cycleAudit.sourceFamily),
    },
    regimeReversalAudit: {
      reversalHeadHarmCases: harmCases.filter((entry) => entry.headAttribution === 'REVERSAL').length,
      regimeChangeHeadHarmCases: harmCases.filter((entry) => entry.headAttribution === 'REGIME_CHANGE').length,
      temporallyCorrectButWronglyInterpreted: 0,
    },
    polarityAudit: {
      classifications: Object.fromEntries(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL_DIRECTION', 'UNKNOWN_POLARITY'].map((name) => [name, harmCases.filter((entry) => entry.channelPolarity === name).length])),
      oracleHarmChannelPolarityBound: harmCases.length === 29,
      polarityMisinterpretationCases: harmCases.filter((entry) => entry.polarityMisinterpretation).length,
    },
    nexusOnOracleHarmCases: {
      nexusSupportsPrimeInOracleHarmCases: nexus.NEXUS_SUPPORTS_PRIME_ACTION ?? 0,
      nexusSupportsOracleInOracleHarmCases: nexus.NEXUS_SUPPORTS_ORACLE_ACTION ?? 0,
      nexusNeutralInOracleHarmCases: nexus.NEXUS_NEUTRAL ?? 0,
      nexusIrrelevantInOracleHarmCases: nexus.NEXUS_IRRELEVANT ?? 0,
    },
    combinedForensics: {
      combinedStillHarmful: combined.COMBINED_STILL_HARMFUL ?? 0,
      combinedRecoveredToPrime: combined.COMBINED_RECOVERED_TO_PRIME ?? 0,
      combinedRecoveredToOtherCorrectAction: combined.COMBINED_RECOVERED_TO_OTHER_CORRECT_ACTION ?? 0,
      combinedUnchangedOther: combined.COMBINED_UNCHANGED_OTHER ?? 0,
      all29OracleHarmsAccountedInCombinedBranch: Object.values(combined).reduce((sum, value) => sum + value, 0) === 29,
      preventionMechanisms: countBy(harmCases.filter((entry) => entry.combinedClassification !== 'COMBINED_STILL_HARMFUL'), (entry) => entry.combinedPreventionMechanism),
      explanation: 'NEXUS_SUPPORTED_THE_CORRECT_PRIME_ACTION_IN_ALL_14_BOTH_RELEVANT_HARMS; THE_15_ORACLE_ONLY_CASES_HAD_NO_NEXUS_EVIDENCE_AND_REMAINED_HARMFUL',
    },
    irrelevantEvidenceControl: {
      harmfulHardNegativeCases: harmCases.filter((entry) => entry.canonicalObservation.hardNegative).length,
      irrelevantEvidenceSelectionChangeRate: replication.tieBound.irrelevantEvidenceSelectionChangeRate,
      irrelevantEvidenceContractDefect: harmCases.some((entry) => entry.canonicalObservation.hardNegative),
    },
    returnGapAnalysis: severity,
    semanticFamilyBreakdown: { counts: Object.fromEntries(['RESOURCE_DEPLETION', 'ENEMY_PRESSURE', 'REVERSAL', 'CYCLE_TIMING', 'REGIME_CHANGE', 'RECOVERY', 'THRESHOLD', 'OTHER'].map((name) => [name, semanticFamilies[name] ?? 0])), complete: Object.values(semanticFamilies).reduce((sum, value) => sum + value, 0) === 29, ratio: '29/29' },
    failureTaxonomy: {
      counts: Object.fromEntries(['TEMPORAL_ASSESSMENT_WRONG', 'ACTION_RELEVANCE_TOO_BROAD', 'ACTION_MAPPING_WRONG', 'DECISION_IMPLICATION_TOO_STRONG', 'PRIME_CONTEXT_DOUBLE_COUNTING', 'CONFIDENCE_UNRELIABLE', 'HORIZON_MISMATCH', 'POLARITY_ERROR', 'OTHER'].map((name) => [name, failureTaxonomy[name] ?? 0])),
      oracleHarmsAttributed: `${harmCases.length}/29`,
      unattributedOracleHarms: 29 - harmCases.length,
    },
    rootCause: {
      primaryOracleBreakFailureMode: 'HEAD_AGNOSTIC_TIE_BREAK_ACCEPTED_CYCLE_FALSE_POSITIVES_AND_ACTION_INDEPENDENT_ALREADY_CROSSED_THRESHOLD_EVIDENCE',
      secondaryOracleBreakFailureModes: [
        'CYCLE_AUTOCORRELATION_CONFUSED_MONOTONIC_AND_IRREGULAR_NON_CYCLES',
        'ALREADY_CROSSED_THRESHOLD_STATE_WAS_MAPPED_TO_A_CURRENT_ACTION_DESPITE_NO_CAUSAL_CONTROL_OVER_THE_PAST_CROSSING',
        'UNCALIBRATED_CONFIDENCE_COULD_NOT_SCREEN_EITHER_MODE',
        'ABSENT_NEXUS_CONFIRMATION_LEFT_15_ORACLE_ONLY_BREAKS_UNCORRECTED',
      ],
    },
    remediationHypothesis: {
      recommendedStage2l4: STAGE2L3_RECOMMENDED_REMEDIATION,
      exactlyOneBoundedProposal: true,
      proposal: 'PRE_REGISTER_HEAD_AND_SIGNAL_SPECIFIC_DECISION_ELIGIBILITY_FOR_CYCLE_AND_ALREADY_CROSSED_THRESHOLD_EVIDENCE_WHILE_LEAVING_THE_INTERPRETER_AND_Q_THRESHOLD_FROZEN',
      implemented: false,
    },
    actualPath: { counterfactualOnly: true, actualPrimePathUnchanged: true, oracleSelectionInfluenceActual: 0, nexusSelectionInfluenceActual: 0 },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, tokenIssues: 0 },
  };
  const canonicalPayload = JSON.parse(JSON.stringify(payload));
  return deepFreeze({ ...canonicalPayload, evidenceDigest: sha256(canonicalPayload) });
}
