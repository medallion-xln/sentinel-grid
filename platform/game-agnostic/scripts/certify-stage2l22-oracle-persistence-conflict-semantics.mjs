#!/usr/bin/env node
/* Stage 2L.22 — Oracle persistence conflicting-evidence semantics and
 * SUSTAINED_RUN corpus well-posedness audit.
 *
 * SEMANTIC COMPLETION PLUS CORPUS DIAGNOSIS. Writes only under
 * artifacts/stage2l22-oracle-persistence-conflict-semantics/. No frozen module is
 * edited and no corpus is regenerated, so every prior certification reproduces
 * byte-identically.
 *
 * Usage:
 *   node scripts/certify-stage2l22-oracle-persistence-conflict-semantics.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L21_PERSISTENCE_SEMANTICS_VERSION } from '../src/lab/stage2l21-oracle-persistence-semantics.js';
import {
  STAGE2L22_CONFLICT_OWNER,
  STAGE2L22_CONFLICT_TAXONOMY,
  STAGE2L22_MINIMUM_CONFLICT_POPULATION,
  STAGE2L22_STAGE2L20_CERTIFICATION_HASH,
  STAGE2L22_STAGE2L21_CERTIFICATION_HASH,
  buildStage2L22Evaluation,
  buildStage2L22PortabilityDigest,
  certifyStage2L22,
} from '../src/lab/stage2l22-oracle-persistence-conflict-semantics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l22-oracle-persistence-conflict-semantics');
const checkOnly = process.argv.includes('--check');

const FROZEN_OWNERS = {
  'src/lab/stage2l21-oracle-persistence-semantics.js': '565110035789b51f4ecc99e2bbb4f04c19e49471f7ae209ce28a009b724f557b',
  'src/lab/stage2l20-oracle-vocabulary-alignment.js': 'ed60e2915e3346dab642db4dd94b3300129a4945bdbb8dd60c720d9fc42d328a',
  'src/lab/stage2l19-oracle-multi-head-qualification.js': '3ca39a3a4061eee5b78b05e878fe92cf77318126de60909c9b72b350758cc682',
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/lab/stage2i3-oracle-head-remediation.js': 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9',
  'src/lab/stage2i2-oracle-task-head-diagnostic.js': 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf',
  'src/lab/stage2l18-high-confidence-tail-diagnosis.js': '8091e1a2f2647d8d30e8c6bef7986318d1c51b452103c1eb4adad65cb8d42dbe',
  'src/lab/stage2l17-live-substitute-hold-nexus.js': '14f845d9b767abd5f7dc083fcaadccc3ce799a9750cfbeabdb019fa765a56a59',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return { owners, allUnchanged: owners.every((entry) => entry.unchanged) };
}

/* The scope fence. This stage diagnoses. It may narrow at most one reason code
 * and it may NOT regenerate the corpus it is auditing — a stage that rewrites the
 * cases it just judged has judged nothing. */
async function measureDiagnosticDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l22-oracle-persistence-conflict-semantics.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const emitsActionFields = /(recommendedAction|selectedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(code);
  const reassignsExpert = /assembleOracleV2\s*=|evaluatePersistenceV2\s*=|evaluateStage2I2Head\s*=/.test(code);
  const widensArbiterSchema = /ORACLE_SIGNAL|ORACLE_DIRECTION_SLOPE_COHERENCE|arbiterEligibility\s*[:=]\s*['"]CERTIFIED/.test(code);
  const nexusImports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    .filter((specifier) => /stage2l1[23678]-|experts\/nexus\.js/.test(specifier));
  /* The corpus audit must not consult Oracle: a label adjudicated by the head
   * under test cannot then be used to judge that head. */
  const auditBody = /export function auditStage2L22SustainedRun\(\)[\s\S]*?\n}\n/.exec(code)?.[0] ?? '';
  const auditUsesOracle = /assembleOracleV2|evaluatePersistenceV2|evaluateStage2I2Head/.test(auditBody);
  const regeneratesCorpus = /buildStage2L22[A-Za-z]*Corpus\s*\(/.test(code);
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    ceilingsUnchanged: STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01 && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    declaresOwnReliabilityFloor: declaresFloor,
    emitsActionFields,
    reassignsExpertFunctions: reassignsExpert,
    widensArbiterOracleSchema: widensArbiterSchema,
    importsNexusDecisionModules: nexusImports.length > 0,
    sustainedRunAuditConsultsOracle: auditUsesOracle,
    regeneratesAuditedCorpus: regeneratesCorpus,
    minimumConflictPopulation: STAGE2L22_MINIMUM_CONFLICT_POPULATION,
    disciplineHolds: !declaresFloor && !emitsActionFields && !reassignsExpert && !widensArbiterSchema
      && nexusImports.length === 0 && !auditUsesOracle && !regeneratesCorpus
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiagnosticDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L22_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L22_BLOCKED=true reason=DIAGNOSTIC_STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

async function readCertification(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}
const stage2l20 = await readCertification('artifacts/stage2l20-oracle-vocabulary-alignment/stage2l20-certification-result.json');
const stage2l21 = await readCertification('artifacts/stage2l21-oracle-persistence-semantics/stage2l21-certification-result.json');

const baseline = {
  stage2l21CertificationHashMatches: stage2l21.certificationHash === STAGE2L22_STAGE2L21_CERTIFICATION_HASH,
  stage2l20CertificationHashMatches: stage2l20.certificationHash === STAGE2L22_STAGE2L20_CERTIFICATION_HASH,
  stage2l21Certified: stage2l21.stage2l21Certified === true,
  stage2l20Certified: stage2l20.stage2l20Certified === true,
  persistenceAccuracyReproduced: stage2l21.blindAfter.accuracy === 0.881757,
  frozenCorpusAccuracyReproduced: stage2l21.frozenCorpusAfter.accuracy === 0.851695,
  outcomeReproduced: stage2l21.persistenceSemanticsOutcome === 'C_ABSTENTION_NARROWED',
  timeToThresholdReproduced: stage2l21.timeToThresholdAccuracy === 1,
  semanticsVersionUnchanged: stage2l21.semanticsVersion === STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  conflictResidualRecorded: stage2l21.leftAloneReasons.includes('CONFLICTING_EVIDENCE'),
  floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key !== 'allBaselinesReproduced').every(([, value]) => value === true);

if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2L22_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

const evaluation = buildStage2L22Evaluation();
const certification = certifyStage2L22({ evaluation });
const portability = buildStage2L22PortabilityDigest(certification);

for (const [condition, reason] of [
  [certification.unrelatedHeadsPreserved, 'UNRELATED_ORACLE_HEAD_CHANGED'],
  [certification.oracleActionPathsUnchanged, 'ORACLE_ACTION_PATH_EXPANDED'],
  [!certification.nexusBehaviorChanged, 'NEXUS_BEHAVIOUR_CHANGED'],
  [certification.timeToThresholdAccuracy === 1, 'TIME_TO_THRESHOLD_REGRESSED'],
  [certification.semanticsUnchanged, 'SEMANTIC_DEFINITION_SILENTLY_REVISED'],
  [certification.freeze.sustainedRunCorpusRegenerated === false, 'AUDITED_CORPUS_REGENERATED_IN_SAME_RUN'],
  [certification.authority === 'R0' && certification.canDispatch === false && certification.canMutateLiveWorld === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
  [!certification.persistenceHeadChanged || certification.persistenceSemanticDefectReduced, 'HEAD_CHANGED_WITHOUT_DEMONSTRATED_REDUCTION'],
]) {
  if (!condition) { console.error(`STAGE2L22_BLOCKED=true reason=${reason}`); process.exit(2); }
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-03', digest: '4677b3e2f4438e2fe105b7a8c4589fc9dca92d7049c861b1074691a178ad7239' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS' : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l22-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L22_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const audit = certification.sustainedRunAudit;
const report = [
  '# Stage 2L.22 — persistence conflict semantics and SUSTAINED_RUN well-posedness',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.persistenceConflictOutcome}** · Authority: R0 (advisory only)`,
  '',
  'Two independent questions. Neither verdict was allowed to stand in for the other:',
  'the semantic verdict comes from a declared table, and the corpus verdict from',
  'descriptive statistics computed without running Oracle at all.',
  '',
  '## Question A — is CONFLICTING_EVIDENCE an abstention or a label?',
  '',
  'The control flow settles what the reason code can possibly mean. It is gate',
  `**${STAGE2L22_CONFLICT_OWNER.gateOrdinal}** of five:`,
  '',
  '```',
  '1. values.length < 6 || historyCoverage < .8   -> SHORT_OR_MISSING_HISTORY',
  '2. dominantSign === 0 || |slope| < .003 || ... -> INDETERMINATE_DIRECTION',
  '3. support / tolerance / opposing-run satisfied -> PERSISTENT',
  '4. directionalConsistency < .62                -> CONFLICTING_EVIDENCE',
  '5. otherwise                                   -> NOT_PERSISTENT',
  '```',
  '',
  'It is unreachable until sufficiency has passed, and the only outcome below it is',
  '`NOT_PERSISTENT`. In position, it says: *this answer would be NOT_PERSISTENT, but',
  'consistency is low, so abstain instead.* That is a behaviour-classification gate',
  `wearing an epistemic label — measured as \`${certification.conflictGateKind}\`, with`,
  `\`CONFLICTING_EVIDENCE_REQUIRES_SUFFICIENT_HISTORY=${certification.conflictingEvidenceRequiresSufficientHistory}\`.`,
  '',
  `On the ten declared taxonomy cases the gate fires ${certification.conflictSemantics.conflictCases} times, and`,
  `${certification.conflictSemantics.conflictIncorrectAbstentions} of those are abstentions the semantics says should have been answers.`,
  `Classification: \`${certification.conflictSemanticsClassification}\`.`,
  '',
  '### And yet the head is not being changed',
  '',
  `A sweep of **${certification.conflictReachability.sweepCases}** deterministic cases — slope, jitter amplitude, window`,
  'length and variant, swept independently — reaches the gate',
  `**${certification.conflictReachability.conflictGateHits}** times. So does the Stage 2L.21 corpus:`,
  `**${certification.corpusConflictCases}** of its persistence cases. The reason is structural:`,
  '',
  `> ${certification.conflictReachability.shadowingExplanation}`,
  '',
  'So the structural argument stands and there is nothing to repair with it. A head',
  'change justified by two hand-built cases, altering nothing on any real corpus,',
  'is not a repair — and certifying a defect "reduced" on it would be false. This',
  'arc has declined to act on thin populations three times before (2L.15 on 0.0006',
  'of precision, 2L.18 on six cases, 2L.19 on a bucket with no error variance); the',
  'same discipline applies here.',
  '',
  `Decision: \`${certification.remediationDecision}\` — reason \`${certification.remediationRationale.reason}\`,`,
  `population ${certification.remediationRationale.population} against a required ${STAGE2L22_MINIMUM_CONFLICT_POPULATION}.`,
  'Recorded as a documentation-level defect in the frozen head: owned, not patched.',
  '',
  '## Question B — do the SUSTAINED_RUN cases depict a sustained run?',
  '',
  'Adjudicated from the produced series against `' + STAGE2L21_PERSISTENCE_SEMANTICS_VERSION + '`,',
  `with Oracle never consulted (\`${audit.adjudicationMethod}\`).`,
  '',
  `| | count |`,
  '| --- | --- |',
  `| cases labelled PERSISTENT | ${audit.totalCases} |`,
  `| semantically persistent | ${audit.semanticallyPersistentCases} |`,
  `| **semantically NOT persistent** | **${audit.semanticallyNotPersistentCases}** |`,
  `| within ${audit.boundaryBand} of the consistency threshold | ${audit.boundaryAmbiguousCases} |`,
  '',
  `Status: **${certification.sustainedRunCorpusStatus}** (mislabelled share ${audit.mislabelledShare}).`,
  '',
  'The cause is signal-to-noise. The generator sweeps slope 0.004–0.028 against',
  'jitter 0–0.024, and a jitter swing can move a step by twice its amplitude:',
  '',
  `| median SNR | min | max | noise-free cases |`,
  '| --- | --- | --- | --- |',
  `| **${audit.medianSignalToNoise}** | ${audit.minSignalToNoise} | ${audit.maxSignalToNoise} | ${audit.noiseFreeCases} |`,
  '',
  'A median of 0.5 means the typical case has jitter swings twice the intended',
  'per-step advance. The phase map confirms the operating box straddles the',
  `boundary: ${certification.phaseMap.persistentCells} cells hold PERSISTENT, ${certification.phaseMap.notPersistentCells} do not, and the lowest`,
  `signal-to-noise ratio that still holds is ${certification.phaseMap.minimumSignalToNoiseHoldingPersistent}.`,
  '',
  '**The corpus is not regenerated here.** The brief asks for the defect to be',
  'diagnosed and owned rather than silently rewritten in the same run, and it does',
  'not block the semantic analysis, which never consults a label.',
  '',
  '## Two scorecards, not one',
  '',
  '| | accuracy | abstention |',
  '| --- | --- | --- |',
  `| as-labelled | ${certification.asLabelledAfter.accuracy} | ${certification.asLabelledAfter.abstentionRate} |`,
  `| semantically adjudicated | **${certification.adjudicatedAfter.accuracy}** | ${certification.adjudicatedAfter.abstentionRate} |`,
  '',
  `The gap is the corpus defect: ${certification.adjudicatedAfter.casesWhereLabelDisagreesWithSeries} cases where the label disagrees with the series it`,
  'labels. Collapsing these into one number would hide exactly the thing this stage',
  'was sent to find.',
  '',
  '## Boundaries held',
  '',
  `Cross-head isolation: ${certification.isolationChecked} comparisons, **${certification.isolationViolations}** violations. \`timeToThreshold\` remains ${certification.timeToThresholdAccuracy}.`,
  `Action paths before \`${certification.actionPaths.before.join(', ')}\` · after \`${certification.actionPaths.after.join(', ')}\` · unchanged **${certification.oracleActionPathsUnchanged}**.`,
  `Nexus behaviour changed: ${certification.nexusBehaviorChanged}. Semantics version unchanged: ${certification.semanticsUnchanged}. Floor: ${STAGE2L14_RELIABILITY_FLOOR}.`,
  `Live dispatches ${certification.liveActionDispatches} · world mutations ${certification.worldMutations} · authority escalations ${certification.authorityEscalations}.`,
  '',
  `Portability: ${portabilityStatus}. ${certification.portabilityNote}`,
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  `Evidence digest: \`${certification.evidenceDigest}\``,
  '',
];

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l22-certification-result.json': certification,
  'stage2l22-conflict-owner-audit.json': {
    stage: certification.stage, ...certification.conflictOwner,
    reachability: certification.conflictReachability,
    corpusConflictCases: certification.corpusConflictCases,
  },
  'stage2l22-conflict-taxonomy.json': {
    stage: certification.stage,
    declaredCases: STAGE2L22_CONFLICT_TAXONOMY.map((entry) => ({
      id: entry.id, category: entry.category, samples: entry.values.length,
      observedFrames: entry.present === null ? entry.values.length : entry.present.filter(Boolean).length,
      dataSufficient: entry.sufficient, dominantDirection: entry.dominantDirection,
      consistency: entry.consistency, netMovement: entry.netMovement,
      expected: entry.expected, rationale: entry.why,
    })),
    measured: certification.conflictSemantics.rows,
  },
  'stage2l22-semantic-table.json': { stage: certification.stage, ...certification.semanticTable },
  'stage2l22-remediation-decision.json': {
    stage: certification.stage,
    classification: certification.conflictSemanticsClassification,
    decision: certification.remediationDecision,
    rationale: certification.remediationRationale,
    persistenceHeadChanged: certification.persistenceHeadChanged,
    changeDescription: certification.changeDescription,
    separationRule: certification.separationRule,
    minimumConflictPopulation: STAGE2L22_MINIMUM_CONFLICT_POPULATION,
    adversarialTableResults: certification.adversarialTableResults,
    priorTableAccuracy: certification.priorTableAccuracy,
    repairedTableAccuracyIfApplied: certification.repairedTableAccuracy,
    decidedOnSemanticsAndReachabilityNotAccuracy: true,
  },
  'stage2l22-sustained-run-audit.json': { stage: certification.stage, ...certification.sustainedRunAudit },
  'stage2l22-signal-noise-analysis.json': { stage: certification.stage, ...certification.phaseMap },
  'stage2l22-corpus-classification.json': {
    stage: certification.stage,
    family: 'SUSTAINED_RUN',
    corpusStatus: certification.sustainedRunCorpusStatus,
    totalCases: certification.sustainedRunAudit.totalCases,
    semanticallyPersistentCases: certification.sustainedRunAudit.semanticallyPersistentCases,
    semanticallyNotPersistentCases: certification.sustainedRunAudit.semanticallyNotPersistentCases,
    boundaryAmbiguousCases: certification.sustainedRunAudit.boundaryAmbiguousCases,
    boundaryUnstable: certification.sustainedRunAudit.boundaryUnstable,
    mislabelledShare: certification.sustainedRunAudit.mislabelledShare,
    regeneratedInThisStage: false,
    ownershipEstablished: 'STAGE2L19_STRESS_CORPUS_SUSTAINED_RUN_GENERATOR',
    note: certification.interpretation.corpusRegenerationNote,
  },
  'stage2l22-blind-evaluation.json': {
    stage: certification.stage,
    asLabelled: { before: certification.asLabelledBefore, after: certification.asLabelledAfter },
    semanticallyAdjudicated: { before: certification.adjudicatedBefore, after: certification.adjudicatedAfter },
    tradeoff: certification.tradeoff,
    unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
    isolationChecked: certification.isolationChecked,
    isolationViolations: certification.isolationViolations,
    timeToThresholdAccuracy: certification.timeToThresholdAccuracy,
  },
  'stage2l22-identifiability-analysis.json': {
    stage: certification.stage,
    before: certification.identifiabilityBefore,
    after: certification.identifiability,
    methodology: 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM',
  },
  'stage2l22-security-regression.json': {
    stage: certification.stage,
    authority: certification.authority,
    canDispatch: certification.canDispatch,
    canMutateLiveWorld: certification.canMutateLiveWorld,
    liveActionDispatches: certification.liveActionDispatches,
    worldMutations: certification.worldMutations,
    authorityEscalations: certification.authorityEscalations,
    actionPaths: certification.actionPaths,
    labelLeakage: certification.labelLeakage,
    baseline, freeze,
    diagnosticDiscipline: discipline,
    securityRegressionPass: certification.securityRegressionPass,
  },
  'stage2l22-portability-report.json': {
    portabilityDigestVersion: 1,
    stage: certification.stage,
    digest: portability.digest,
    portabilityStatus, platformsPassed, disagreeing,
    inheritedNote: certification.portabilityNote,
    witnesses: portability.witnesses,
  },
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}
await writeFile(path.join(artifactRoot, 'stage2l22-report.md'), `${report.join('\n')}\n`);

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  diagnosticDisciplineHolds: discipline.disciplineHolds,
  baselinesReproduced: baseline.allBaselinesReproduced,
  conflictOwner: STAGE2L22_CONFLICT_OWNER.implementationOwner,
  conflictingEvidenceRequiresSufficientHistory: certification.conflictingEvidenceRequiresSufficientHistory,
  conflictGateKind: certification.conflictGateKind,
  conflictSemantics: certification.conflictSemanticsClassification,
  conflictCases: certification.conflictSemantics.conflictCases,
  conflictCorrectAbstentions: certification.conflictSemantics.conflictCorrectAbstentions,
  conflictIncorrectAbstentions: certification.conflictSemantics.conflictIncorrectAbstentions,
  conflictSweepCases: certification.conflictReachability.sweepCases,
  conflictGateHitsInSweep: certification.conflictReachability.conflictGateHits,
  conflictGateHitsInCorpus: certification.corpusConflictCases,
  remediationDecision: certification.remediationDecision,
  remediationReason: certification.remediationRationale.reason,
  persistenceHeadChanged: certification.persistenceHeadChanged,
  sustainedRunCases: certification.sustainedRunAudit.totalCases,
  semanticallyPersistentCases: certification.sustainedRunAudit.semanticallyPersistentCases,
  semanticallyNotPersistentCases: certification.sustainedRunAudit.semanticallyNotPersistentCases,
  boundaryAmbiguousCases: certification.sustainedRunAudit.boundaryAmbiguousCases,
  sustainedRunCorpusStatus: certification.sustainedRunCorpusStatus,
  medianSignalToNoise: certification.sustainedRunAudit.medianSignalToNoise,
  minSignalToNoise: certification.sustainedRunAudit.minSignalToNoise,
  maxSignalToNoise: certification.sustainedRunAudit.maxSignalToNoise,
  asLabelledAccuracyBefore: certification.asLabelledBefore.accuracy,
  asLabelledAccuracyAfter: certification.asLabelledAfter.accuracy,
  adjudicatedAccuracyBefore: certification.adjudicatedBefore.accuracy,
  adjudicatedAccuracyAfter: certification.adjudicatedAfter.accuracy,
  abstentionRateBefore: certification.adjudicatedBefore.abstentionRate,
  abstentionRateAfter: certification.adjudicatedAfter.abstentionRate,
  labelDisagreements: certification.adjudicatedAfter.casesWhereLabelDisagreesWithSeries,
  tradeoff: certification.tradeoff,
  identifiabilityStatus: certification.identifiability.identifiabilityStatus,
  observedDiscrimination: certification.identifiability.observedDiscrimination,
  nullP99: certification.identifiability.nullP99,
  unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
  timeToThresholdAccuracy: certification.timeToThresholdAccuracy,
  oracleActionPathsUnchanged: certification.oracleActionPathsUnchanged,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  persistenceSemanticDefectReduced: certification.persistenceSemanticDefectReduced,
  persistenceConflictOutcome: certification.persistenceConflictOutcome,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l22Certified: certification.stage2l22Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l22Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
