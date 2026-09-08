#!/usr/bin/env node
/* Stage 2L.21 — Oracle persistence abstention semantics and contract restoration.
 *
 * BOUNDED HEAD-SEMANTICS REMEDIATION. Writes only under
 * artifacts/stage2l21-oracle-persistence-semantics/. The repair supersedes rather
 * than edits, so every prior certification still reproduces byte-identically.
 *
 * Usage:
 *   node scripts/certify-stage2l21-oracle-persistence-semantics.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L21_ABSTENTION_CONTRACT,
  STAGE2L21_ADVERSARIAL_CASES,
  STAGE2L21_PERSISTENCE_SEMANTICS,
  STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  STAGE2L21_STAGE2L19_CERTIFICATION_HASH,
  STAGE2L21_STAGE2L20_CERTIFICATION_HASH,
  buildStage2L21Evaluation,
  buildStage2L21PortabilityDigest,
  certifyStage2L21,
} from '../src/lab/stage2l21-oracle-persistence-semantics.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l21-oracle-persistence-semantics');
const checkOnly = process.argv.includes('--check');

const FROZEN_OWNERS = {
  'src/lab/stage2l20-oracle-vocabulary-alignment.js': 'ed60e2915e3346dab642db4dd94b3300129a4945bdbb8dd60c720d9fc42d328a',
  'src/lab/stage2l19-oracle-multi-head-qualification.js': '3ca39a3a4061eee5b78b05e878fe92cf77318126de60909c9b72b350758cc682',
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/lab/stage2i3-oracle-head-remediation.js': 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9',
  'src/lab/stage2i3c-dimension-aware-regime-composition.js': 'cd166af78e7c6172ec64af9ba0646329e5b5d9dcc9184bac18104c20d227c7ae',
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

/* The scope fence. This stage may narrow ONE abstention reason code. It may not
 * add an action path, widen the Arbiter, restate a floor, or touch Nexus. */
async function measureRemediationDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l21-oracle-persistence-semantics.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const emitsActionFields = /(recommendedAction|selectedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(code);
  const reassignsExpert = /assembleOracleV2\s*=|evaluatePersistenceV2\s*=|evaluateStage2I2Head\s*=/.test(code);
  const widensArbiterSchema = /ORACLE_SIGNAL|ORACLE_DIRECTION_SLOPE_COHERENCE|arbiterEligibility\s*[:=]\s*['"]CERTIFIED/.test(code);
  const nexusImports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    .filter((specifier) => /stage2l1[23678]-|experts\/nexus\.js/.test(specifier));
  /* Only ONE abstention reason may be narrowed away. */
  const narrowedList = /STAGE2L21_NARROWED_AWAY_REASONS = deepFreeze\(\[([^\]]*)\]\)/.exec(code);
  const narrowedCount = narrowedList ? narrowedList[1].split(',').filter((entry) => entry.trim()).length : -1;
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    ceilingsUnchanged: STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01 && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    declaresOwnReliabilityFloor: declaresFloor,
    emitsActionFields,
    reassignsExpertFunctions: reassignsExpert,
    widensArbiterOracleSchema: widensArbiterSchema,
    importsNexusDecisionModules: nexusImports.length > 0,
    nexusDecisionImports: nexusImports,
    abstentionReasonsNarrowed: narrowedCount,
    boundedToSingleReasonCode: narrowedCount === 1,
    disciplineHolds: !declaresFloor && !emitsActionFields && !reassignsExpert && !widensArbiterSchema
      && nexusImports.length === 0 && narrowedCount === 1
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureRemediationDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L21_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L21_BLOCKED=true reason=REMEDIATION_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

async function readCertification(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}
const stage2l19 = await readCertification('artifacts/stage2l19-oracle-multi-head-qualification/stage2l19-certification-result.json');
const stage2l20 = await readCertification('artifacts/stage2l20-oracle-vocabulary-alignment/stage2l20-certification-result.json');

const stage2l20Persistence = stage2l20.blindAfter.heads.find((head) => head.headId === 'persistence');
const stage2l20Threshold = stage2l20.blindAfter.heads.find((head) => head.headId === 'timeToThreshold');
const baseline = {
  stage2l20CertificationHashMatches: stage2l20.certificationHash === STAGE2L21_STAGE2L20_CERTIFICATION_HASH,
  stage2l19CertificationHashMatches: stage2l19.certificationHash === STAGE2L21_STAGE2L19_CERTIFICATION_HASH,
  stage2l20Certified: stage2l20.stage2l20Certified === true,
  stage2l19Certified: stage2l19.stage2l19Certified === true,
  persistenceAccuracyReproduced: stage2l20Persistence.accuracy === 0.34322,
  timeToThresholdAccuracyReproduced: stage2l20Threshold.accuracy === 1,
  directionSafeSpecialist: stage2l19.classifications.find((head) => head.headId === 'direction')?.classification === 'SAFE_SPECIALIST',
  residualDefectRecorded: stage2l20.interpretation.measuredRemainingLimitation === 'ABSTENTION_SEMANTICS_DIVERGENCE',
  floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key !== 'allBaselinesReproduced').every(([, value]) => value === true);

if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2L21_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

const evaluation = buildStage2L21Evaluation({ stage2l19Identifiability: stage2l19.identifiability });
const certification = certifyStage2L21({ evaluation });
const portability = buildStage2L21PortabilityDigest(certification);

for (const [condition, reason] of [
  [certification.unrelatedHeadsPreserved, 'UNRELATED_ORACLE_HEAD_CHANGED'],
  [certification.oracleActionPathsUnchanged, 'ORACLE_ACTION_PATH_EXPANDED'],
  [!certification.nexusBehaviorChanged, 'NEXUS_BEHAVIOUR_CHANGED'],
  [certification.timeToThresholdAccuracy === 1, 'TIME_TO_THRESHOLD_REGRESSED'],
  [certification.authority === 'R0' && certification.canDispatch === false && certification.canMutateLiveWorld === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
  [!certification.persistenceHeadChanged || certification.correctAbstentionEvidenceAvailable, 'ABSTENTION_PRESERVATION_UNPROVEN'],
]) {
  if (!condition) { console.error(`STAGE2L21_BLOCKED=true reason=${reason}`); process.exit(2); }
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-03', digest: '548cfe4fa833dee6c465b194c6b19aa58cebf5ad3ec118d111dab88de3bb4917' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS' : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l21-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L21_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const frozenBefore = certification.frozenCorpusBefore;
const frozenAfter = certification.frozenCorpusAfter;
const report = [
  '# Stage 2L.21 — Oracle persistence abstention semantics',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.persistenceSemanticsOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## The archaeology changes the question',
  '',
  'Stage 2L.20 pointed at the Stage 2I.3 `INDETERMINATE_DIRECTION` gate. The gate is',
  'real, but Stage 2I.3 did not introduce it in isolation — it changed the head and',
  'its own benchmark in the same step, and the two agree with each other:',
  '',
  '| stage | flat / alternating series expected | head behaviour |',
  '| --- | --- | --- |',
  '| 2I.2 | `NOT_PERSISTENT` (STABLE family) | answers |',
  '| 2I.3 | `INSUFFICIENT_EVIDENCE` (STABLE_NO_TREND, ALTERNATING_DIRECTION) | abstains |',
  '| 2I.4 | `NOT_PERSISTENT` (ALTERNATING_INTERRUPTION) | **wires the 2I.3 head** |',
  '',
  'Neither contract is internally broken. Stage 2I.4 composed Stage 2I.3\'s head with',
  'Stage 2I.2\'s label expectation, and every stage since has scored that',
  'inconsistency as head error. The gate was `' + certification.archaeology.gateIntent + '`;',
  'the defect origin is `' + certification.archaeology.defectOrigin + '`.',
  '',
  'So "is the gate wrong?" is not answerable on its own — it is right against one',
  'contract and wrong against the other. What had to be decided is which contract',
  'the architecture intends, and that is an architecture question, not an accuracy one.',
  '',
  '## What abstention means, derived from the system',
  '',
  `\`${STAGE2L21_PERSISTENCE_SEMANTICS_VERSION}\`. Four independent pieces of the system say abstention is about DATA`,
  'SUFFICIENCY, and none of them is a benchmark:',
  '',
  ...STAGE2L21_PERSISTENCE_SEMANTICS.derivedFrom.map((line) => `1. ${line}`),
  '',
  `**${STAGE2L21_PERSISTENCE_SEMANTICS.coreRule}**`,
  '',
  'A 28-frame alternating square wave is not short of evidence. There is abundant',
  'evidence and it says plainly that nothing is sustained. Calling that "insufficient',
  'evidence" confuses DIRECTION_CERTAINTY with DATA_SUFFICIENCY.',
  '',
  '## 2I.2 versus 2I.3 on 18 declared semantic cases',
  '',
  'Expectations were written from the definition above and fixed before either head',
  'was run.',
  '',
  `| | 2I.2 | 2I.3 | repaired |`,
  '| --- | --- | --- | --- |',
  `| semantic accuracy | **${certification.stage2i2SemanticAccuracy}** | ${certification.stage2i3SemanticAccuracy} | **${certification.repairedSemanticAccuracy}** |`,
  '',
  `Agreement ${certification.comparison.agreementCases}/${certification.comparison.cases}, disagreement ${certification.comparison.disagreementCases}. Every disagreement is the same shape:`,
  `2I.3 abstains where the semantics gives an answer, and 2I.2 is correct in **all ${certification.comparison.validAnswersConvertedToAbstention}**.`,
  '',
  `**False assertions prevented by the gate: ${certification.comparison.falseAssertionsPreventedByGate}.** The gate does not guard against anything`,
  'on this table; it converts valid answers into abstentions. Classification:',
  `\`${certification.abstentionSemantics}\`.`,
  '',
  '## The repair',
  '',
  certification.changeDescription,
  '',
  '## Measured effect',
  '',
  '| corpus | accuracy before | after | abstention before | after | trivial baseline |',
  '| --- | --- | --- | --- | --- | --- |',
  `| Stage 2L.20 frozen corpus | ${frozenBefore.accuracy} | **${frozenAfter.accuracy}** | ${frozenBefore.abstentionRate} | ${frozenAfter.abstentionRate} | ${frozenAfter.majorityBaseline} |`,
  `| Stage 2L.21 corpus (+ abstention cases) | ${certification.blindBefore.accuracy} | **${certification.blindAfter.accuracy}** | ${certification.blindBefore.abstentionRate} | ${certification.blindAfter.abstentionRate} | ${certification.blindAfter.majorityBaseline} |`,
  `| inherited Stage 2I.4 holdout | ${certification.inheritedBefore.accuracy} | **${certification.inheritedAfter.accuracy}** | ${certification.inheritedBefore.abstentionRate} | ${certification.inheritedAfter.abstentionRate} | ${certification.inheritedAfter.majorityBaseline} |`,
  '',
  'By category, on the Stage 2L.21 corpus:',
  '',
  '| category | before | after |',
  '| --- | --- | --- |',
  ...Object.keys(certification.blindAfter.byCategory).map((key) =>
    `| ${key} | ${certification.blindBefore.byCategory[key]?.accuracy ?? 'n/a'} | ${certification.blindAfter.byCategory[key].accuracy} |`),
  '',
  '## The abstention tradeoff, and why the corpus had to be extended',
  '',
  'The Stage 2L.19/2L.20 persistence corpus contains **zero** cases expecting',
  '`INSUFFICIENT_EVIDENCE`. On it, "correct abstentions removed = 0" is true by',
  'construction and proves nothing. A `SHORT_HISTORY` family below the head\'s own',
  'minimum sample count was added — the one place abstention is the only correct',
  'answer — so the claim can actually be tested:',
  '',
  `- abstentions removed: **${certification.tradeoff.abstentionsRemoved}**`,
  `- of those, correct abstentions removed: **${certification.tradeoff.correctAbstentionsRemoved}**; incorrect: ${certification.tradeoff.incorrectAbstentionsRemoved}`,
  `- false PERSISTENT introduced: **${certification.tradeoff.falsePersistentIntroduced}**`,
  `- false NOT_PERSISTENT introduced: ${certification.tradeoff.falseNotPersistentIntroduced} (all on cases that were already wrong as abstentions)`,
  `- cases expecting abstention: ${certification.tradeoff.casesExpectingAbstention}; correctly retained: **${certification.tradeoff.abstentionsCorrectlyRetained}** (rate ${certification.tradeoff.abstentionRetentionRate})`,
  `- errors introduced by the narrowing: **${certification.residual.errorsIntroducedByNarrowing}**`,
  '',
  '## What is still wrong, and why it was not touched',
  '',
  `${certification.residual.remainingErrors} persistence cases remain wrong, all of one shape:`,
  `\`${certification.residual.dominantShape}\`.`,
  '',
  certification.residual.cause,
  '',
  certification.interpretation.residualNote,
  '',
  '## Boundaries held',
  '',
  `Cross-head isolation: ${certification.isolationChecked} head comparisons, **${certification.isolationViolations}** violations. \`timeToThreshold\` remains ${certification.timeToThresholdAccuracy}.`,
  `Action paths before \`${certification.actionPaths.before.join(', ')}\` · after \`${certification.actionPaths.after.join(', ')}\` · unchanged **${certification.oracleActionPathsUnchanged}**.`,
  `Nexus behaviour changed: ${certification.nexusBehaviorChanged}. Reliability floor: ${STAGE2L14_RELIABILITY_FLOOR} (unchanged). No frozen module edited.`,
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
  'stage2l21-certification-result.json': certification,
  'stage2l21-contract-archaeology.json': { stage: certification.stage, ...certification.archaeology },
  'stage2l21-semantic-matrix.json': { stage: certification.stage, ...certification.semanticMatrix },
  'stage2l21-abstention-analysis.json': {
    stage: certification.stage,
    contract: STAGE2L21_ABSTENTION_CONTRACT,
    classification: certification.abstentionSemantics,
    narrowedReasons: certification.narrowedReasons,
    retainedAbstentionReasons: certification.retainedAbstentionReasons,
    leftAloneReasons: certification.leftAloneReasons,
    tradeoff: certification.tradeoff,
  },
  'stage2l21-adversarial-cases.json': {
    stage: certification.stage,
    declaredCases: STAGE2L21_ADVERSARIAL_CASES.map((entry) => ({
      id: entry.id, category: entry.category, samples: entry.values.length,
      dataSufficiency: entry.sufficient, directionCertainty: entry.directionDeterminable,
      persistenceStrength: entry.persistentBehaviourPresent, expected: entry.expected, rationale: entry.why,
    })),
    repairedResults: certification.adversarialCaseResults,
    expectationsDeclaredBeforeExecution: true,
  },
  'stage2l21-2i2-vs-2i3-comparison.json': { stage: certification.stage, ...certification.comparison },
  'stage2l21-remediation-decision.json': {
    stage: certification.stage,
    options: ['A_2I2_SEMANTICS_RESTORED', 'B_2I3_ABSTENTION_CONFIRMED', 'C_ABSTENTION_NARROWED',
      'D_NEW_PERSISTENCE_RULE_REQUIRED', 'E_SEMANTICS_VALID_BUT_HEAD_WEAK', 'F_INCONCLUSIVE', 'G_BLOCKED'],
    decision: certification.remediationDecision,
    persistenceHeadChanged: certification.persistenceHeadChanged,
    changeDescription: certification.changeDescription,
    semanticsVersion: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
    semantics: STAGE2L21_PERSISTENCE_SEMANTICS,
    decidedOnSemanticsNotAccuracy: true,
    residual: certification.residual,
  },
  'stage2l21-blind-evaluation.json': {
    stage: certification.stage,
    stage2l21Corpus: { before: certification.blindBefore, after: certification.blindAfter },
    stage2l20FrozenCorpus: { before: frozenBefore, after: frozenAfter },
    inheritedHoldout: { before: certification.inheritedBefore, after: certification.inheritedAfter },
    unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
    isolationChecked: certification.isolationChecked,
    isolationViolations: certification.isolationViolations,
    timeToThresholdAccuracy: certification.timeToThresholdAccuracy,
  },
  'stage2l21-identifiability-analysis.json': {
    stage: certification.stage,
    before: certification.identifiabilityBefore,
    after: certification.identifiability,
    methodology: 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM',
  },
  'stage2l21-security-regression.json': {
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
    remediationDiscipline: discipline,
    securityRegressionPass: certification.securityRegressionPass,
  },
  'stage2l21-portability-report.json': {
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
await writeFile(path.join(artifactRoot, 'stage2l21-report.md'), `${report.join('\n')}\n`);

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  remediationDisciplineHolds: discipline.disciplineHolds,
  baselinesReproduced: baseline.allBaselinesReproduced,
  contractArchaeologyComplete: certification.contractArchaeologyComplete,
  gateIntroducedAt: certification.archaeology.gateIntroducedAt,
  gateIntent: certification.archaeology.gateIntent,
  defectOrigin: certification.archaeology.defectOrigin,
  semanticsVersion: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
  abstentionSemantics: certification.abstentionSemantics,
  comparisonCases: certification.comparison.cases,
  agreementCases: certification.comparison.agreementCases,
  disagreementCases: certification.comparison.disagreementCases,
  stage2i2CorrectStage2i3Abstains: certification.comparison.stage2i2CorrectStage2i3Abstains,
  stage2i3CorrectStage2i2Wrong: certification.comparison.stage2i3CorrectStage2i2Wrong,
  falseAssertionsPreventedByGate: certification.comparison.falseAssertionsPreventedByGate,
  stage2i2SemanticAccuracy: certification.stage2i2SemanticAccuracy,
  stage2i3SemanticAccuracy: certification.stage2i3SemanticAccuracy,
  repairedSemanticAccuracy: certification.repairedSemanticAccuracy,
  remediationDecision: certification.remediationDecision,
  persistenceHeadChanged: certification.persistenceHeadChanged,
  frozenCorpusAccuracyBefore: frozenBefore.accuracy,
  frozenCorpusAccuracyAfter: frozenAfter.accuracy,
  frozenCorpusAbstentionBefore: frozenBefore.abstentionRate,
  frozenCorpusAbstentionAfter: frozenAfter.abstentionRate,
  stage2l21CorpusAccuracyBefore: certification.blindBefore.accuracy,
  stage2l21CorpusAccuracyAfter: certification.blindAfter.accuracy,
  inheritedAccuracyBefore: certification.inheritedBefore.accuracy,
  inheritedAccuracyAfter: certification.inheritedAfter.accuracy,
  categoryAccuracyAfter: certification.blindAfter.byCategory,
  tradeoff: certification.tradeoff,
  residualErrors: certification.residual.remainingErrors,
  errorsIntroducedByNarrowing: certification.residual.errorsIntroducedByNarrowing,
  identifiabilityStatus: certification.identifiability.identifiabilityStatus,
  observedDiscrimination: certification.identifiability.observedDiscrimination,
  nullP99: certification.identifiability.nullP99,
  unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
  isolationChecked: certification.isolationChecked,
  timeToThresholdAccuracy: certification.timeToThresholdAccuracy,
  oracleActionPathsUnchanged: certification.oracleActionPathsUnchanged,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  persistenceSemanticDefectReduced: certification.persistenceSemanticDefectReduced,
  persistenceSemanticsOutcome: certification.persistenceSemanticsOutcome,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l21Certified: certification.stage2l21Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l21Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
