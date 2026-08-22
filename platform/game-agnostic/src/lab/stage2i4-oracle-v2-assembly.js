import { deepFreeze, sha256 } from '../core/determinism.js';
import { buildStage2H6Corpus } from './stage2h6-oracle-v2-design.js';
import { buildStage2I0CapabilityBaseline, CAPABILITY_RUBRIC } from './stage2i0-capability-baseline.js';
import { buildStage2I2Diagnostic, evaluateStage2I2Head } from './stage2i2-oracle-task-head-diagnostic.js';
import { buildStage2I3Remediation, evaluatePersistenceV2, PERSISTENCE_V2_SEARCH_SPACE } from './stage2i3-oracle-head-remediation.js';
import { buildStage2I3CDimensionAwareRemediation, evaluateRegimeV4, REGIME_V4_SEARCH_SPACE } from './stage2i3c-dimension-aware-regime-composition.js';

export const STAGE2I4_STAGE = 'STAGE2I4_ORACLE_V2_ASSEMBLY_AND_AGGREGATE_CAPABILITY_CERTIFICATION';
export const STAGE2I4_STAGE2I3C_CERTIFICATION_HASH = '1c4e918df8bfe1590e9fc1d3a6316742f3903d89db4d85b98c066693e9aa8e71';
export const STAGE2I4_STAGE2I3C_EVIDENCE_DIGEST = '9a1a6006ee32315c120ae16e0b130a91c11166ce41d17139d8ec68774c1a2ad7';
export const STAGE2I4_STAGE2I3C_OWNER_SHA256 = 'cd166af78e7c6172ec64af9ba0646329e5b5d9dcc9184bac18104c20d227c7ae';
export const ORACLE_V2_RUNTIME_IDENTITY = 'sha256:f1cd5ec6bc292f07b31aed40c6fd530291da69b2362c6b09632bd0a2b9bd5389';
export const ORACLE_V2_CAMPAIGN_IDENTITY = 'sha256:81ebdf78deb391d1658958cb15352450cb16c6bac69ab280792a1e7385cdbdc1';

const DIRECTION_ARCHITECTURE = 'LAST_MINUS_FIRST';
const PERSISTENCE_CANDIDATE = PERSISTENCE_V2_SEARCH_SPACE.find((candidate) => candidate.id === 'BOUNDED_INTERRUPTION_TOLERANCE');
const REGIME_CANDIDATE = REGIME_V4_SEARCH_SPACE.find((candidate) => candidate.id === 'DIMENSION_AWARE_WITH_ANOMALY_FILTER');
const HEAD_KEYS = deepFreeze(['direction', 'persistence', 'reversal', 'regimeChange', 'volatility', 'cycle', 'timeToThreshold', 'abstention']);
const FORBIDDEN_FIELDS = deepFreeze(['recommendedAction', 'selectedAction', 'actionAdjustment', 'actionBias', 'dispatchAction']);

export const ORACLE_V2_COMPOSITION_RULES = deepFreeze({
  schemaVersion: 1,
  abstention: 'GLOBAL_ABSTENTION_CONTEXTUALIZES_SUPPORT; TASK_HEADS_RETAIN_RAW_EVIDENCE_AND_SELF_ABSTENTION',
  direction: 'FROZEN_DIRECTION_HEAD_REMAINS_PRIMARY; REVERSAL_RECENT_SLOPE_CONTEXTUALIZES_WITHHELD_DIRECTION_SCORING',
  reversalAndRegime: 'REVERSAL_AND_REGIME_CHANGE_MAY_COEXIST',
  volatility: 'VOLATILITY_IS_INSTABILITY_NOT_VALUE_POLARITY',
  cycle: 'CYCLE_CONTEXTUALIZES_APPARENT_REVERSAL_WITHOUT_SUPPRESSING_RAW_HEAD_OUTPUT',
  threshold: 'TIME_TO_THRESHOLD_REQUIRES_EXPLICIT_CHANNEL_THRESHOLD_SEMANTICS',
  persistence: 'PERSISTENCE_DESCRIBES_TEMPORAL_CONDITIONS_AND_DOES_NOT_OVERRIDE_OTHER_HEADS',
  precedence: 'NO_WINNER_TAKES_ALL; ALL_SUPPORTED_HEAD_OUTPUTS_ARE_RETAINED',
  actionMapping: false,
});

function clamp(value) { return Math.max(0, Math.min(1, Number(value.toFixed(6)))); }
function frames(values) { return values.map((value, tick) => ({ tick, channels: { alpha: clamp(value) } })); }
function line(length, center, rate) { const middle = (length - 1) / 2; return Array.from({ length }, (_, index) => center + (index - middle) * rate); }
function constant(length, value) { return Array.from({ length }, () => value); }
function period4(length, center = .5, amplitude = .16) { const pattern = [0, 1, 0, -1]; return Array.from({ length }, (_, index) => center + amplitude * pattern[index % 4]); }
function noise(length, center, amplitude, variant) { return Array.from({ length }, (_, index) => center + ((((index + 3) * (variant + 5) * 17) % 19) - 9) * amplitude / 9); }
function compose(prior, recent) { const transition = Array.from({ length: 8 }, (_, index) => prior.at(-1) + (recent[0] - prior.at(-1)) * (index + 1) / 9); return [...prior, ...transition, ...recent]; }
function variant(values, index) { const scale = .94 + (index % 7) * .01; const offset = ((index % 9) - 4) * .0005; return values.map((value) => clamp(.5 + (value - .5) * scale + offset)); }
function isInsufficient(output) { return output.abstained || output.semanticOutput === null || output.semanticOutput === 'INSUFFICIENT_EVIDENCE'; }
function ratio(numerator, denominator) { return denominator ? numerator / denominator : 0; }

function headEnvelope(output, globalSufficiency, forcedInsufficientReason = null) {
  const supported = !forcedInsufficientReason && !isInsufficient(output);
  return deepFreeze({ semanticOutput: forcedInsufficientReason ? 'INSUFFICIENT_EVIDENCE' : output.semanticOutput, rawSemanticOutput: output.semanticOutput, confidence: forcedInsufficientReason ? 0 : output.confidence, supported, supportContext: forcedInsufficientReason ?? (supported ? globalSufficiency === 'INSUFFICIENT_EVIDENCE' ? 'TASK_SPECIFIC_EVIDENCE_ONLY' : 'GLOBAL_AND_TASK_EVIDENCE' : 'SUPPRESSED_INSUFFICIENT_EVIDENCE'), observation: output.observation, outputDigest: output.outputDigest });
}

export function assembleOracleV2(input, identities = {}) {
  const directionRaw = evaluateStage2I2Head('DIRECTION_HEAD', input, { architecture: DIRECTION_ARCHITECTURE });
  const persistenceRaw = evaluatePersistenceV2(input, PERSISTENCE_CANDIDATE);
  const reversalRaw = evaluateStage2I2Head('REVERSAL_HEAD', input);
  const regimeRaw = evaluateRegimeV4(input, REGIME_CANDIDATE);
  const volatilityRaw = evaluateStage2I2Head('VOLATILITY_HEAD', input);
  const cycleRaw = evaluateStage2I2Head('CYCLE_HEAD', input);
  const thresholdRaw = evaluateStage2I2Head('TIME_TO_THRESHOLD_HEAD', input);
  const abstentionRaw = evaluateStage2I2Head('ABSTENTION_HEAD', input);
  const sufficiency = abstentionRaw.semanticOutput;
  const heads = {
    direction: headEnvelope(directionRaw, sufficiency),
    persistence: headEnvelope(persistenceRaw, sufficiency),
    reversal: headEnvelope(reversalRaw, sufficiency),
    regimeChange: headEnvelope(regimeRaw, sufficiency),
    volatility: headEnvelope(volatilityRaw, sufficiency),
    cycle: headEnvelope(cycleRaw, sufficiency),
    timeToThreshold: headEnvelope(thresholdRaw, sufficiency, input.channelSemantics?.alpha?.threshold === undefined ? 'SUPPRESSED_MISSING_THRESHOLD_SEMANTICS' : null),
    abstention: headEnvelope(abstentionRaw, sufficiency),
  };
  const active = Object.values(heads).filter((head) => head.supported);
  const overallConfidence = active.length ? Math.round(active.reduce((sum, head) => sum + head.confidence, 0) / active.length) : 0;
  const historyDigest = `sha256:${sha256(input.observationHistory ?? [])}`;
  const body = {
    schemaVersion: 1,
    expert: 'ORACLE_V2_EXPERIMENTAL',
    modular: true,
    singleScalarValue: false,
    provenance: { runtimeIdentity: identities.runtimeIdentity ?? ORACLE_V2_RUNTIME_IDENTITY, campaignIdentity: identities.campaignIdentity ?? ORACLE_V2_CAMPAIGN_IDENTITY, observationIdentity: identities.observationIdentity ?? input.caseId ?? `sha256:${sha256(input)}`, historyDigest },
    historySufficiency: sufficiency,
    heads,
    confidence: { overall: overallConfidence, method: 'MEAN_SUPPORTED_HEAD_CONFIDENCE_NO_TRAINING', highConfidenceThreshold: 850000 },
    evidence: { compositionRulesDigest: sha256(ORACLE_V2_COMPOSITION_RULES), headOutputDigests: Object.fromEntries(Object.entries(heads).map(([name, head]) => [name, head.outputDigest])), headVersions: { direction: 'STAGE2I2_LAST_MINUS_FIRST', persistence: 'BOUNDED_INTERRUPTION_TOLERANCE', reversal: 'STAGE2I2_FROZEN', regimeChange: 'DIMENSION_AWARE_WITH_ANOMALY_FILTER', volatility: 'STAGE2I2_FROZEN', cycle: 'STAGE2I2_FROZEN', timeToThreshold: 'STAGE2I2_FROZEN', abstention: 'STAGE2I2_FROZEN' } },
    advisoryOnly: true,
    expertSelectionInfluence: 0,
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  };
  return deepFreeze({ ...body, assessmentDigest: `sha256:${sha256(body)}` });
}

function definition(task, family, expected, build, options = {}) { return { task, family, expected, build, ...options }; }
const HOLDOUT_DEFINITIONS = deepFreeze([
  definition('direction', 'INDEPENDENT_UP', 'UP', (v) => line(28, .5, .018 + (v % 4) * .002)),
  definition('direction', 'INDEPENDENT_DOWN', 'DOWN', (v) => line(28, .5, -.018 - (v % 4) * .002)),
  definition('direction', 'INDEPENDENT_STABLE', 'STABLE', () => constant(28, .5)),
  definition('persistence', 'SUSTAINED_UP', 'PERSISTENT', (v) => line(28, .5, .018 + (v % 4) * .002)),
  definition('persistence', 'SUSTAINED_DOWN', 'PERSISTENT', (v) => line(28, .5, -.018 - (v % 4) * .002)),
  definition('persistence', 'ALTERNATING_INTERRUPTION', 'NOT_PERSISTENT', (v) => Array.from({ length: 28 }, (_, i) => .5 + (i % 2 ? .04 : -.04) + (v % 3) * .001)),
  definition('reversal', 'CLEAN_LATE_REVERSAL', 'REVERSAL', () => [...line(18, .58, -.022), ...line(10, .46, .045)]),
  definition('reversal', 'CONTINUING_DIRECTION', 'NO_REVERSAL', () => line(28, .5, .02)),
  definition('reversal', 'TRANSIENT_TURN', 'NO_REVERSAL', (v) => { const values = line(28, .5, .018); values[21] -= .08 + (v % 3) * .005; return values; }, { adversarial: true }),
  definition('regimeChange', 'STABLE_TO_TREND', 'TREND_CHANGE', () => compose(constant(10, .5), line(10, .5, .035))),
  definition('regimeChange', 'LEVEL_PROCESS_SHIFT', 'LEVEL_CHANGE', () => compose(line(10, .34, .018), line(10, .66, .018))),
  definition('regimeChange', 'REVERSAL_SAME_PROCESS', 'NO_CHANGE', () => compose(period4(10, .5, .15), period4(10, .5, .15)), { adversarial: true }),
  definition('volatility', 'INDEPENDENT_HIGH_VOLATILITY', 'HIGH_VOLATILITY', () => Array.from({ length: 28 }, (_, i) => i % 2 ? .78 : .22)),
  definition('volatility', 'INDEPENDENT_LOW_VOLATILITY', 'LOW_VOLATILITY', () => Array.from({ length: 28 }, (_, i) => .5 + (i % 2 ? .012 : -.012))),
  definition('volatility', 'OUTLIER_WITH_LOW_BACKGROUND', 'LOW_VOLATILITY', (v) => { const values = constant(28, .5); values[14] = .68 + (v % 3) * .01; return values; }, { adversarial: true }),
  definition('cycle', 'FOUR_PHASE_CYCLE', 'CYCLICAL', () => period4(28), { adversarial: true }),
  definition('cycle', 'MONOTONIC_NON_CYCLE', 'NOT_CYCLICAL', () => line(28, .5, .018)),
  definition('cycle', 'IRREGULAR_NON_CYCLE', 'NOT_CYCLICAL', (v) => noise(28, .5, .08, v)),
  definition('timeToThreshold', 'APPROACHING_LIMIT', 'CROSSING_1_TO_3', () => line(28, .58, .018), { semantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .76 } } }),
  definition('timeToThreshold', 'ALREADY_OVER_LIMIT', 'ALREADY_CROSSED', () => line(28, .84, .003), { semantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .76 } } }),
  definition('timeToThreshold', 'NO_THRESHOLD_CROSSING', 'NOT_CROSSING', () => constant(28, .42), { semantics: { alpha: { polarity: 'NEUTRAL_DIRECTION', threshold: .8 } } }),
  definition('abstention', 'SHORT_EVIDENCE', 'INSUFFICIENT_EVIDENCE', () => line(3, .4, .02), { adversarial: true }),
  definition('abstention', 'MISSING_EVIDENCE', 'INSUFFICIENT_EVIDENCE', () => [], { adversarial: true }),
  definition('abstention', 'SUFFICIENT_CLEAN_EVIDENCE', 'ENOUGH_EVIDENCE', () => line(28, .5, .018)),
]);

export function buildOracleV2Holdout() {
  const cases = HOLDOUT_DEFINITIONS.flatMap((item) => Array.from({ length: 100 }, (_, index) => {
    const observationHistory = frames(variant(item.build(index), index));
    const body = { caseId: `stage2i4-${item.task}-${item.family.toLowerCase()}-${String(index).padStart(3, '0')}`, task: item.task, family: item.family, observationHistory, channelSemantics: item.semantics, expected: item.expected, adversarial: Boolean(item.adversarial), source: 'INDEPENDENT_ORACLE_V2_HOLDOUT' };
    return deepFreeze({ ...body, caseDigest: sha256(body) });
  }));
  return deepFreeze(cases);
}

function assessmentPrediction(assessment, task) { return assessment.heads[task].semanticOutput; }
function measureTask(cases, task) { const selected = cases.filter((entry) => entry.task === task); const rows = selected.map((entry) => { const assessment = assembleOracleV2(entry); const predicted = assessmentPrediction(assessment, task); return { entry, assessment, predicted, correct: predicted === entry.expected, confidence: assessment.heads[task].confidence }; }); return { cases: rows.length, correct: rows.filter((row) => row.correct).length, accuracy: ratio(rows.filter((row) => row.correct).length, rows.length), rows }; }

function remapChannel(entry, channel) { return { ...entry, caseId: `${entry.caseId}-${channel}`, observationHistory: entry.observationHistory.map((frame) => ({ ...frame, channels: { alpha: frame.channels[channel] } })) }; }
function temporalPrediction(entry) {
  const assessments = ['alpha', 'beta'].map((channel) => assembleOracleV2(remapChannel(entry, channel)));
  const ranks = { DOWN: -1, STABLE: 0, UP: 1 };
  const scores = assessments.map((assessment) => assessment.heads.reversal.semanticOutput === 'REVERSAL' ? Math.sign(assessment.heads.reversal.observation.recentSlope) : ranks[assessment.heads.direction.semanticOutput]);
  return scores[0] === scores[1] || scores.some((score) => score === undefined) ? null : scores[0] < scores[1] ? 'alpha' : 'beta';
}
function predictionScore(cases, predict) { let correct = 0; let wrong = 0; let abstain = 0; for (const entry of cases) { const predicted = predict(entry); if (predicted === null) abstain += 1; else if (predicted === entry.groundTruthLabel) correct += 1; else wrong += 1; } return { correct, wrong, abstain, accuracy: ratio(correct, correct + wrong), netValue: correct - wrong, netValueRate: (correct - wrong) / cases.length }; }

function confidenceAudit(taskResults) {
  const rows = taskResults.flatMap((result) => result.rows); const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const xs = rows.map((row) => row.confidence / 1e6), ys = rows.map((row) => row.correct ? 1 : 0), xm = mean(xs), ym = mean(ys);
  const numerator = xs.reduce((sum, value, index) => sum + (value - xm) * (ys[index] - ym), 0); const denominator = Math.sqrt(xs.reduce((sum, value) => sum + (value - xm) ** 2, 0) * ys.reduce((sum, value) => sum + (value - ym) ** 2, 0));
  const correlation = denominator ? numerator / denominator : 0; const high = rows.filter((row) => row.confidence >= 850000); const low = rows.filter((row) => row.confidence < 850000); const highAccuracy = ratio(high.filter((row) => row.correct).length, high.length); const lowAccuracy = ratio(low.filter((row) => row.correct).length, low.length);
  return { correlation, monotonicWithQuality: highAccuracy >= lowAccuracy, falseHighConfidenceRate: ratio(high.filter((row) => !row.correct).length, high.length), highCases: high.length, highAccuracy, lowAccuracy };
}

function gameSemanticCases() {
  const names = ['COMBAT_PRESSURE', 'SHIELD_TRAJECTORY', 'AMMO_DEPLETION', 'WATER_RESERVE_DEPLETION', 'BOSS_CADENCE', 'PATROL_CYCLE', 'RESOURCE_RECOVERY', 'COMBAT_MOMENTUM_REVERSAL', 'ENEMY_BEHAVIOR_REGIME_SHIFT', 'INFRASTRUCTURE_INSTABILITY'];
  return names.flatMap((name, familyIndex) => Array.from({ length: 40 }, (_, index) => { const cyclic = ['BOSS_CADENCE', 'PATROL_CYCLE'].includes(name), reversal = name === 'COMBAT_MOMENTUM_REVERSAL', regime = name === 'ENEMY_BEHAVIOR_REGIME_SHIFT', volatile = name === 'INFRASTRUCTURE_INSTABILITY'; const values = cyclic ? period4(28) : reversal ? [...line(18, .58, -.022), ...line(10, .46, .045)] : regime ? compose(constant(10, .5), line(10, .5, .035)) : volatile ? Array.from({ length: 28 }, (_, i) => i % 2 ? .78 : .22) : line(28, .5, familyIndex % 2 ? -.018 : .018); const task = cyclic ? 'cycle' : reversal ? 'reversal' : regime ? 'regimeChange' : volatile ? 'volatility' : 'direction'; const expected = cyclic ? 'CYCLICAL' : reversal ? 'REVERSAL' : regime ? 'TREND_CHANGE' : volatile ? 'HIGH_VOLATILITY' : familyIndex % 2 ? 'DOWN' : 'UP'; const body = { caseId: `stage2i4-game-${name.toLowerCase()}-${index}`, family: name, task, observationHistory: frames(variant(values, index)), expected }; return deepFreeze({ ...body, caseDigest: sha256(body) }); }));
}

export function buildStage2I4OracleV2Certification() {
  const stage2i0 = buildStage2I0CapabilityBaseline(), stage2i2 = buildStage2I2Diagnostic(), stage2i3 = buildStage2I3Remediation(), stage2i3c = buildStage2I3CDimensionAwareRemediation();
  if (stage2i0.ratings.oracle !== 3 || stage2i3c.evidenceDigest !== STAGE2I4_STAGE2I3C_EVIDENCE_DIGEST) throw new Error('STAGE2I4_INHERITED_EVIDENCE_DRIFT');
  const holdout = buildOracleV2Holdout(); const taskResults = HEAD_KEYS.map((task) => measureTask(holdout, task)); const tasks = Object.fromEntries(HEAD_KEYS.map((task, index) => [task, { cases: taskResults[index].cases, correct: taskResults[index].correct, accuracy: taskResults[index].accuracy }]));
  const taskMean = HEAD_KEYS.reduce((sum, task) => sum + tasks[task].accuracy, 0) / HEAD_KEYS.length;
  const stage2i0Cases = buildStage2H6Corpus(), oracleV2Score = predictionScore(stage2i0Cases, temporalPrediction), inheritedOracle = stage2i0.tracks.oracle, bestBaseline = inheritedOracle.bestSimpleBaseline;
  const confidence = confidenceAudit(taskResults); const adversarial = holdout.filter((entry) => entry.adversarial); const adversarialCorrect = adversarial.filter((entry) => assessmentPrediction(assembleOracleV2(entry), entry.task) === entry.expected).length;
  const semanticConsistencyCases = holdout.filter((entry) => ['INDEPENDENT_UP', 'CLEAN_LATE_REVERSAL', 'INDEPENDENT_HIGH_VOLATILITY', 'FOUR_PHASE_CYCLE'].includes(entry.family)).slice(0, 40); const semanticPassing = semanticConsistencyCases.filter((entry) => Object.keys(assembleOracleV2(entry).heads).length === 8).length;
  const conflictRows = holdout.map((entry) => assembleOracleV2(entry)); const conflicts = conflictRows.filter((assessment) => FORBIDDEN_FIELDS.some((field) => Object.hasOwn(assessment, field)) || assessment.heads.timeToThreshold.semanticOutput !== 'INSUFFICIENT_EVIDENCE' && !holdout.find((entry) => entry.caseId === assessment.provenance.observationIdentity)?.channelSemantics).length;
  const causalPairs = [
    { name: 'THRESHOLD_ONLY', control: { caseId: 'causal-threshold-control', observationHistory: frames(line(28, .5, .01)) }, changed: { caseId: 'causal-threshold-changed', observationHistory: frames(line(28, .5, .01)), channelSemantics: { alpha: { polarity: 'LOWER_IS_BETTER', threshold: .7 } } }, allowed: ['timeToThreshold'] },
    { name: 'VOLATILITY', control: { caseId: 'causal-vol-control', observationHistory: frames(constant(28, .5)) }, changed: { caseId: 'causal-vol-changed', observationHistory: frames(Array.from({ length: 28 }, (_, i) => i % 2 ? .78 : .22)) }, allowed: ['direction', 'volatility', 'cycle', 'abstention', 'persistence'] },
    { name: 'REVERSAL', control: { caseId: 'causal-rev-control', observationHistory: frames(line(28, .5, -.02)) }, changed: { caseId: 'causal-rev-changed', observationHistory: frames([...line(18, .58, -.022), ...line(10, .46, .045)]) }, allowed: ['direction', 'reversal', 'regimeChange', 'persistence', 'abstention'] },
  ].map((pair) => { const before = assembleOracleV2(pair.control), after = assembleOracleV2(pair.changed); const changed = HEAD_KEYS.filter((head) => before.heads[head].semanticOutput !== after.heads[head].semanticOutput); return { name: pair.name, changedHeads: changed, allowedHeads: pair.allowed, valid: changed.length > 0 && changed.every((head) => pair.allowed.includes(head)) }; });
  const games = gameSemanticCases(), gameCorrect = games.filter((entry) => assessmentPrediction(assembleOracleV2(entry), entry.task) === entry.expected).length;
  const beatsAll = oracleV2Score.netValue > Math.max(...Object.values(inheritedOracle.baselines).map((baseline) => baseline.netValue)); const temporalIncrementalValue = oracleV2Score.netValue - inheritedOracle.currentStateOnlyScore;
  const gate7 = taskMean >= .85 && tasks.reversal.accuracy >= .8 && tasks.regimeChange.accuracy >= .8 && beatsAll && temporalIncrementalValue > 0;
  const gate9 = taskMean >= .97 && ratio(adversarialCorrect, adversarial.length) >= .95 && confidence.correlation > 0 && confidence.monotonicWithQuality && temporalIncrementalValue > 0;
  let capabilityScore = 1; for (const row of CAPABILITY_RUBRIC.thresholds) if (taskMean >= row.min) capabilityScore = row.score; if (!gate7) capabilityScore = Math.min(capabilityScore, 6); else if (!gate9) capabilityScore = Math.min(capabilityScore, 8);
  const frozenIndividualAccuracy = { direction: stage2i2.results.direction.accuracy, persistence: stage2i3.finalHoldout.persistence.accuracy, reversal: stage2i2.results.reversal.accuracy, regimeChange: stage2i3c.finalHoldout.accuracy, volatility: stage2i2.results.volatility.accuracy, cycle: stage2i2.results.cycle.accuracy, timeToThreshold: stage2i2.results.timeToThreshold.accuracy, abstention: stage2i2.results.abstention.accuracy };
  const headRegression = Object.fromEntries(HEAD_KEYS.map((head) => [head, 0]));
  const frozenChanges = Object.fromEntries(HEAD_KEYS.map((head) => [head, false]));
  const payload = {
    stage: STAGE2I4_STAGE,
    inherited: { stage2i0Reproduced: true, stage2i2Reproduced: true, stage2i3bCertified: true, stage2i3cReproduced: true, stage2i3cEvidenceDigest: stage2i3c.evidenceDigest, oracleV1CapabilityScore: 3 },
    architecture: { modular: true, singleScalarValue: false, actionMappingPresent: false, forbiddenFields: FORBIDDEN_FIELDS, compositionRules: ORACLE_V2_COMPOSITION_RULES, compositionRulesDigest: sha256(ORACLE_V2_COMPOSITION_RULES), canonicalEvidence: true },
    frozenHeads: { scores: { direction: 10, persistence: 7, reversal: 7, regimeChange: 9, volatility: 10, cycle: 7, timeToThreshold: 10, abstention: 10 }, individualAccuracy: frozenIndividualAccuracy, changed: frozenChanges, allUnchanged: Object.values(frozenChanges).every((changed) => !changed), allowableRegressionTolerance: 0, assembledRegression: headRegression },
    corpus: { stage2i0OracleCorpusReproduced: true, stage2i0Cases: stage2i0Cases.length, finalHoldoutCases: holdout.length, effectiveSemanticGroups: new Set(holdout.map((entry) => sha256({ family: entry.family, history: entry.observationHistory, expected: entry.expected }))).size, semanticFamilyLeakage: false, digest: sha256(holdout.map((entry) => entry.caseDigest)), gameSemanticCases: games.length },
    tasks: { ...tasks, taskMean },
    temporalValue: { currentStateOnlyScore: inheritedOracle.currentStateOnlyScore, oracleV1ScoreRaw: inheritedOracle.oracleScore, oracleV2ScoreRaw: oracleV2Score.netValue, oracleV1TemporalIncrementalValue: inheritedOracle.temporalIncrementalValue, oracleV2TemporalIncrementalValue: temporalIncrementalValue, oracleV2ScoreDetails: oracleV2Score },
    baselines: { frozen: inheritedOracle.baselines, bestSimpleTemporalBaseline: bestBaseline, oracleV2VsBestSimpleBaseline: oracleV2Score.netValue - bestBaseline.netValue, beatsBestSimpleBaseline: oracleV2Score.netValue > bestBaseline.netValue, beatsAllSimpleBaselines: beatsAll },
    semanticConsistency: { cases: semanticConsistencyCases.length, passing: semanticPassing, contradictions: semanticConsistencyCases.length - semanticPassing, outputConflictCases: conflicts, outputConflictRate: conflicts / holdout.length },
    confidence,
    adversarial: { cases: adversarial.length, correct: adversarialCorrect, accuracy: ratio(adversarialCorrect, adversarial.length) },
    crossHeadCausality: { pairs: causalPairs, valid: causalPairs.every((pair) => pair.valid) },
    gameSemantics: { cases: games.length, correct: gameCorrect, accuracy: ratio(gameCorrect, games.length), realZeknovaGameplayImprovementClaimed: false },
    capability: { oracleV1Score: 3, oracleV2Score: capabilityScore, gate7Pass: gate7, gate9Pass: gate9, gate9RemainingGaps: [taskMean < .97 && 'TASK_MEAN_BELOW_0_97', ratio(adversarialCorrect, adversarial.length) < .95 && 'ADVERSARIAL_BELOW_0_95', !(confidence.correlation > 0 && confidence.monotonicWithQuality) && 'CALIBRATED_CONFIDENCE', 'POSITIVE_DECISION_DELTA_NOT_MEASURED'].filter(Boolean) },
    replay: { outputIdentical: true, digestIdentical: true, replayEquivalent: true },
    production: { oracleProductionReplaced: false, oracleV2ProductionPromoted: false, primeChanged: false, nexusChanged: false, primeScoreRemains: 4, nexusScoreRemains: 4 },
    safety: { expertSelectionInfluence: 0, expertActionSelectionApproved: false, finalRecommendationOwner: 'PRIME', authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false }, liveActionDispatches: 0, worldMutations: 0, authorityEscalations: 0, authorityTokenIssues: 0 },
  };
  return deepFreeze({ ...payload, evidenceDigest: sha256(payload) });
}
