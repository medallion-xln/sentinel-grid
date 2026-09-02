#!/usr/bin/env node
/* Stage 2L.19 — Oracle multi-head correctness, identifiability and
 * selective-delegation qualification.
 *
 * CHARACTERIZATION STAGE. Writes only under
 * artifacts/stage2l19-oracle-multi-head-qualification/. Every expert is imported
 * frozen: Oracle is measured, never modified, and Nexus is not touched at all.
 * Three independent proofs of that are produced here — owner hashes, a source
 * scan of this stage's own module, and a replay of the Stage 2L.17 and 2L.18
 * certifications after all Oracle work has run.
 *
 * Usage:
 *   node scripts/certify-stage2l19-oracle-multi-head-qualification.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L19_HEADS,
  STAGE2L19_CERTIFIED_HEAD_IDS,
  STAGE2L19_UNCERTIFIED_HEAD_IDS,
  STAGE2L19_INHERITED_DIRECTION_DELEGATION,
  STAGE2L19_STAGE2L10_CERTIFICATION_HASH,
  STAGE2L19_STAGE2L17_CERTIFICATION_HASH,
  STAGE2L19_STAGE2L18_CERTIFICATION_HASH,
  buildStage2L19Evaluation,
  buildStage2L19PortabilityDigest,
  certifyStage2L19,
} from '../src/lab/stage2l19-oracle-multi-head-qualification.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l19-oracle-multi-head-qualification');
const checkOnly = process.argv.includes('--check');

/* Everything this stage reads and nothing this stage may write. The Oracle
 * implementation files are here for the same reason the Nexus ones are: a
 * characterization stage that edits its subject has characterized nothing. */
const FROZEN_OWNERS = {
  'src/lab/stage2l18-high-confidence-tail-diagnosis.js': '8091e1a2f2647d8d30e8c6bef7986318d1c51b452103c1eb4adad65cb8d42dbe',
  'src/lab/stage2l17-live-substitute-hold-nexus.js': '14f845d9b767abd5f7dc083fcaadccc3ce799a9750cfbeabdb019fa765a56a59',
  'src/lab/stage2l17-live-substitute-hold-remediation.js': '3736a687cfdc643093f1da7a8f8cc0dbdf9c8a15f5418c4d69855fa7bc78ed05',
  'src/lab/stage2l16-nexus-residual-error-decomposition.js': '06baddc4275c256f33751422d74c713236de3568e960960c590d1db00cea53c2',
  'src/lab/stage2l15-nexus-decision-stability.js': 'c135899cc9a77ca801f08776ba91447e883d3bb09147ade92da40710342183ca',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l13-value-aware-nexus.js': '31d29c21d8adcdae8f689c676345f389d1b875767c479427bd87652d870ac282',
  'src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/experts/oracle-v2-candidate.js': '01074c77887168a4f5953f8a31775c4da2d0dce205817f1dffd9651e87f4293c',
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

/* A characterization stage must not become a second Arbiter. Scanned rather than
 * asserted: this module may READ the inherited floor and ceilings, but must not
 * declare its own, must not export a calibration or dispatch path, and must not
 * reassign any frozen expert entry point. */
async function measureCharacterizationDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l19-oracle-multi-head-qualification.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const declaresCeiling = /MAX_HARMFUL_CHANGE_RATE\s*=\s*[0-9.]|MAX_CORRECT_PRIME_BREAK_RATE\s*=\s*[0-9.]/.test(code);
  const reassignsExpert = /assembleOracleV2\s*=|evaluateOracle\s*=|evaluateStage2L17Nexus\s*=/.test(code);
  /* Matches an object-literal key or an assignment, so the module may NAME the
   * forbidden action fields (it probes the assembly for their absence) but may
   * not emit one. */
  const declaresActionMapping = /(recommendedAction|selectedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(code);
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    harmCeiling: STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
    correctPrimeBreakCeiling: STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE,
    ceilingsUnchanged: STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01 && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    declaresOwnReliabilityFloor: declaresFloor,
    declaresOwnHarmCeiling: declaresCeiling,
    reassignsExpertFunctions: reassignsExpert,
    emitsActionFields: declaresActionMapping,
    disciplineHolds: !declaresFloor && !declaresCeiling && !reassignsExpert && !declaresActionMapping
      && STAGE2L14_RELIABILITY_FLOOR === 0.99
      && STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01
      && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
  };
}

const freeze = await measureFreeze();
const discipline = await measureCharacterizationDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L19_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L19_BLOCKED=true reason=CHARACTERIZATION_STAGE_INTRODUCED_BEHAVIOUR');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

/* PHASE 0 / PHASE 15 — the inherited certifications this stage stands on, read
 * from their own artifacts. The Nexus pair is checked here so that a Nexus
 * behaviour change would block this stage even though this stage never touches
 * Nexus. */
async function readCertification(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}
const stage2l10 = await readCertification('artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-certification-result.json');
const stage2l17 = await readCertification('artifacts/stage2l17-live-substitute-and-hold-remediation/stage2l17-certification-result.json');
const stage2l18 = await readCertification('artifacts/stage2l18-nexus-high-confidence-tail-diagnosis/stage2l18-certification-result.json');

const baseline = {
  stage2l10CertificationHashMatches: stage2l10.certificationHash === STAGE2L19_STAGE2L10_CERTIFICATION_HASH,
  stage2l17CertificationHashMatches: stage2l17.certificationHash === STAGE2L19_STAGE2L17_CERTIFICATION_HASH,
  stage2l18CertificationHashMatches: stage2l18.certificationHash === STAGE2L19_STAGE2L18_CERTIFICATION_HASH,
  stage2l10Certified: stage2l10.stage2l10Certified === true,
  stage2l17Certified: stage2l17.stage2l17Certified === true,
  stage2l18Certified: stage2l18.stage2l18Certified === true,
  nexusTailIdentifiabilityStatus: stage2l18.nexusTailIdentifiabilityStatus,
  nexus099Feasibility: stage2l18.nexus099Feasibility,
  inheritedReliabilityFloor: stage2l10.calibration.minBucketReliability,
  floorUnchanged: stage2l10.calibration.minBucketReliability === STAGE2L14_RELIABILITY_FLOOR,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key.endsWith('Matches') || key.endsWith('Certified') || key === 'floorUnchanged')
  .every(([, value]) => value === true);

if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2L19_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

/* The pinned Stage 2L.10 Oracle delegation evidence must BE the Stage 2L.10
 * artifact's, not a restatement that has drifted from it. This is the only place
 * an action-level, Prime-relative delegation figure enters Stage 2L.19. */
const inheritedOracle = stage2l10.oracleSingleExpert;
const pinned = STAGE2L19_INHERITED_DIRECTION_DELEGATION;
const inheritedDelegationMatches = ['delegations', 'precision', 'beneficialChanges', 'harmfulChanges',
  'harmfulChangeRate', 'correctPrimeBreaks', 'correctPrimeBreakRate']
  .every((field) => inheritedOracle[field] === pinned[field])
  && inheritedOracle.inheritedDelegations === pinned.inheritedDelegations;
if (!inheritedDelegationMatches) {
  console.error('STAGE2L19_BLOCKED=true reason=INHERITED_DIRECTION_DELEGATION_DRIFT');
  console.error(`  stage2l10=${JSON.stringify(inheritedOracle)}`);
  console.error(`  pinned=${JSON.stringify(pinned)}`);
  process.exit(2);
}

const evaluation = buildStage2L19Evaluation();
const certification = certifyStage2L19({ evaluation });
const portability = buildStage2L19PortabilityDigest(certification);

if (certification.nexusBehaviorChanged) {
  console.error('STAGE2L19_BLOCKED=true reason=NEXUS_BEHAVIOUR_CHANGED');
  process.exit(2);
}
if (certification.authority !== 'R0' || certification.canDispatch !== false || certification.canMutateLiveWorld !== false) {
  console.error('STAGE2L19_BLOCKED=true reason=AUTHORITY_BOUNDARY_VIOLATED');
  process.exit(2);
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-02', digest: 'ed5f4ecd38b0f9da2e356a1976ceb831832d0cf0e19681dd057078b00c2a374e' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS'
    : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l19-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L19_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

function headLine(headId) {
  const meta = STAGE2L19_HEADS.find((head) => head.headId === headId);
  const stress = certification.stressBlind.heads.find((head) => head.headId === headId);
  const inherited = certification.inheritedBlind.heads.find((head) => head.headId === headId);
  const identify = certification.identifiability.find((head) => head.headId === headId);
  const delegate = certification.delegation.find((head) => head.headId === headId);
  const classification = certification.classifications.find((head) => head.headId === headId);
  return { meta, stress, inherited, identify, delegate, classification };
}

const directionDelegation = certification.delegation.find((head) => head.evaluated)
  ?? certification.delegation.find((head) => head.headId === 'direction');

const reportLines = [
  '# Stage 2L.19 — Oracle multi-head correctness, identifiability and selective-delegation qualification',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.oraclePortfolioOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## What this stage set out to answer',
  '',
  'Stage 2L.18 ended the Nexus line on principle. Oracle was the next unexamined',
  'expert surface: Stage 2L.10 certified selective delegation for its DIRECTION head',
  'and the other seven heads had never been given head-specific correctness,',
  'identifiability, utility or calibration evidence. This stage measured all eight.',
  '',
  '## The two things that had to be established before any head could be scored',
  '',
  '**Oracle heads are classifiers, not action recommenders.** `assembleOracleV2`',
  'declares `actionMapping: false` and forbids `recommendedAction` and its',
  'relatives outright. Prime emits an action; seven of the eight heads emit a label',
  'about history. "Does this head beat Prime" is therefore not a question those',
  'seven can answer, and inventing a label-to-action mapping would have been this',
  'stage fabricating the very semantics it was auditing. The honest baseline for a',
  'classifier is the best trivial classifier, and that is what is reported; the',
  'Prime comparison appears only for the head that actually has an action path.',
  '',
  '**The inherited corpus is degenerate.** The Stage 2I.4 holdout carries 2,400',
  'cases, which looks ample and is not: three generator families per head, 100',
  'variants each, and the variant function perturbs by a scale of 0.94–1.00 with an',
  'offset under 0.002. Predictions are constant within every family for seven of',
  'the eight heads, so the effective sample size per head is',
  `**${certification.degeneracy.heads[0].effectiveSampleSize}**, not 300. Reporting "accuracy 1.0000, n=300" off that would`,
  'have been reporting n=3 as n=300 — the exact degeneracy that undid Stage 2L.11.',
  'An independent stress corpus with genuine parametric variation was built, and',
  'both corpora are reported side by side.',
  '',
  `The stress corpus accepted ${certification.stressReport.acceptedCases} cases and rejected`,
  `${certification.stressReport.rejectedCases} (rate ${certification.stressReport.rejectionRate}) as ill-posed. That filter`,
  'exists because of a real defect found during this stage: the first reversal',
  'generator ran its second segment off the top of the range, the series clamped,',
  'the recent window flattened, and the head\'s NO_REVERSAL answer was *correct*.',
  'That would have been reported as a head defect. A case is now usable only if its',
  'label is true of the series actually produced, saturation included.',
  '',
  '## Head-by-head result',
  '',
  '| Head | Stress accuracy | Trivial baseline | Lift | Identifiability | Classification |',
  '| --- | --- | --- | --- | --- | --- |',
  ...STAGE2L19_HEADS.map((head) => {
    const row = headLine(head.headId);
    return `| \`${head.headId}\` (${head.headName}) | ${row.stress.accuracy} | ${row.stress.majorityBaseline} | ${row.stress.liftOverTrivialBaseline} | ${row.identify.identifiabilityStatus} | **${row.classification.classification}** |`;
  }),
  '',
  '## Identifiability: what "non-identifiable" is allowed to mean here',
  '',
  'Discrimination over correctness is an AUROC between a head\'s wrong cases and its',
  'right ones. A head that is wrong on nothing has no wrong class, so that AUROC is',
  'undefined — and reporting an undefined AUROC as 0.5 would read as "chance" and',
  'classify the head as non-identifiable for the sole reason that it never erred.',
  `That artifact would have misreported the Stage 2L.10-certified direction head. ${certification.portfolio.identifiabilityNotMeasurableHeads} heads`,
  'are therefore recorded as NOT_MEASURABLE_NO_ERROR_VARIANCE, which is a different',
  `result from the ${certification.portfolio.measuredNonIdentifiableHeads} recorded as MEASURED_NON_IDENTIFIABLE.`,
  '',
  'Where discrimination *was* measurable, the null searches the identical',
  'hypothesis space as the observed search, the family-wise threshold is Bonferroni',
  `corrected across all ${certification.identifiability[0].headsSearched} heads searched, and a signal must clear that`,
  `threshold by a predeclared margin of ${certification.identifiability.find((head) => head.materialMargin !== undefined)?.materialMargin ?? 'n/a'} and retain at least`,
  `${certification.identifiability.find((head) => head.minimumHoldoutRetention !== undefined)?.minimumHoldoutRetention ?? 'n/a'} of its lift into FINAL_HOLDOUT. Two heads landed close to the`,
  'corrected threshold and did not clear it materially; Stage 2L.18 ended on exactly',
  'that pattern and the same discipline is applied here.',
  '',
  '## Safe delegation',
  '',
  `Reliability floor: ${certification.freeze.reliabilityFloor} (unchanged). Harm ceilings: ${certification.freeze.harmCeiling} / ${certification.freeze.correctPrimeBreakCeiling}.`,
  '',
  'Seven heads have no delegation to be safe or unsafe about: the Stage 2L.10',
  'Arbiter binding pins `head: \'direction\'` and its Oracle signal schema is',
  'direction-shaped down to the field names, so any other head is rejected by',
  'identity with `ORACLE_SIGNAL_HEAD_UNKNOWN`. They are recorded as',
  'NO_ACTION_DELEGATION_PATH, never as an inherited pass — the Stage 2L.10',
  'certification covers the direction head and nothing else.',
  '',
  'The direction head was revalidated rather than presumed, against two independent',
  'bodies of evidence, both of which had to clear the floor:',
  '',
  `- this stage's stress corpus: ${directionDelegation.revalidation.correctWhenSupported}/${directionDelegation.revalidation.supportedCases} correct where supported, Wilson lower bound **${directionDelegation.revalidation.lowerBound}**;`,
  `- the pinned Stage 2L.10 evidence: ${pinned.delegations} delegations, precision ${pinned.precision}, harmful changes ${pinned.harmfulChanges}, correct-Prime breaks ${pinned.correctPrimeBreaks}, lower bound **${directionDelegation.delegationLowerBound}**.`,
  '',
  '## Portfolio',
  '',
  `Total heads ${certification.portfolio.totalHeads} · semantically valid ${certification.portfolio.semanticallyValidHeads} · useful ${certification.portfolio.usefulHeads} · identifiable ${certification.portfolio.identifiableHeads} · safe specialists ${certification.portfolio.safeSpecialistHeads}.`,
  '',
  'Combined unique Prime-error coverage is reported as',
  `\`${certification.portfolio.combinedUniquePrimeErrorCoverage}\`. ${certification.portfolio.combinedCoverageNote}`,
  '',
  '## What was measured, and what is not being fixed here',
  '',
  `Measured limitation: **${certification.interpretation.measuredOracleLimitation}**`,
  '',
  ...certification.interpretation.limitationDetail.map((line) => `- ${line}`),
  '',
  `Remediation required: ${certification.interpretation.remediationRequired} · class \`${certification.interpretation.remediationClass}\` · owner \`${certification.interpretation.remediationOwner}\`.`,
  '',
  'The two vocabulary defects are contract defects between head and benchmark, not',
  'weak reasoning: `persistence` emits `NON_PERSISTENT` where the benchmark expects',
  '`NOT_PERSISTENT`, and `timeToThreshold` never emits `CROSSING_1_TO_3` on any',
  'well-posed scored case. Each caps achievable accuracy at the reachable share of',
  'the label space regardless of how well the head reasons. They are identified and',
  'stopped at; this stage does not remediate them.',
  '',
  '## Freeze and boundaries',
  '',
  `Nexus behaviour changed: ${certification.nexusBehaviorChanged}. Oracle behaviour changed: ${certification.freeze.oracleBehaviourChanged}. Arbiter changed: ${certification.freeze.arbiterChanged}. Prime changed: ${certification.freeze.primeChanged}.`,
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
  'stage2l19-certification-result.json': certification,
  'stage2l19-head-inventory.json': {
    stage: certification.stage,
    ...certification.inventory,
    heads: STAGE2L19_HEADS,
    certifiedHeadIds: STAGE2L19_CERTIFIED_HEAD_IDS,
    uncertifiedHeadIds: STAGE2L19_UNCERTIFIED_HEAD_IDS,
  },
  'stage2l19-contract-audit.json': { stage: certification.stage, ...certification.contracts },
  'stage2l19-ground-truth-audit.json': { stage: certification.stage, ...certification.groundTruth },
  'stage2l19-corpus-validation.json': {
    stage: certification.stage,
    inheritedCorpusDegeneracy: certification.degeneracy,
    stressCorpus: certification.stressReport,
    corpusDigest: certification.corpusDigest,
  },
  'stage2l19-blind-evaluation.json': {
    stage: certification.stage,
    inherited: certification.inheritedBlind,
    stress: certification.stressBlind,
  },
  'stage2l19-utility-analysis.json': {
    stage: certification.stage,
    utilityClasses: certification.stressBlind.heads.map((head) => ({
      headId: head.headId,
      corpus: head.corpus,
      accuracy: head.accuracy,
      majorityBaseline: head.majorityBaseline,
      liftOverTrivialBaseline: head.liftOverTrivialBaseline,
      constantPrediction: head.constantPrediction,
      hasCertifiedActionPath: head.hasCertifiedActionPath,
      primeComparable: head.primeComparable,
      utilityClass: head.utilityClass,
      utilityNote: head.utilityNote,
    })),
    materialLiftThreshold: certification.stressBlind.materialLiftThreshold,
    combinedUniquePrimeErrorCoverage: certification.portfolio.combinedUniquePrimeErrorCoverage,
    combinedCoverageNote: certification.portfolio.combinedCoverageNote,
  },
  'stage2l19-identifiability-analysis.json': { stage: certification.stage, heads: certification.identifiability },
  'stage2l19-null-analysis.json': {
    stage: certification.stage,
    searchSpaceMatchedNull: certification.searchSpaceMatchedNull,
    multiplicityAccountedFor: certification.multiplicityAccountedFor,
    heads: certification.identifiability.map((head) => ({
      headId: head.headId,
      identifiabilityStatus: head.identifiabilityStatus,
      permutations: head.permutations,
      observedDiscrimination: head.observedDiscrimination,
      nullMedian: head.nullMedian,
      nullP95: head.nullP95,
      nullP99: head.nullP99,
      nullMax: head.nullMax,
      familyWiseAlpha: head.familyWiseAlpha,
      familyWiseQuantile: head.familyWiseQuantile,
      familyWiseThreshold: head.familyWiseThreshold,
      materialMargin: head.materialMargin,
      materialThreshold: head.materialThreshold,
      holdoutRetention: head.holdoutRetention,
      signalExceedsNull: head.signalExceedsNull,
    })),
  },
  'stage2l19-calibration.json': {
    stage: certification.stage,
    reliabilityFloor: certification.freeze.reliabilityFloor,
    reliabilityFloorLowered: certification.freeze.reliabilityFloorLowered,
    harmCeiling: certification.freeze.harmCeiling,
    correctPrimeBreakCeiling: certification.freeze.correctPrimeBreakCeiling,
    boundMethod: certification.freeze.boundMethod,
    boundZ: certification.freeze.boundZ,
    calibratedHeads: certification.delegation.filter((head) => head.evaluated).map((head) => ({
      headId: head.headId,
      reason: head.reason,
      revalidation: head.revalidation,
      inheritedEvidence: head.inheritedEvidence,
    })),
    headsWithNoCalibrationPath: certification.delegation.filter((head) => !head.evaluated)
      .map((head) => ({ headId: head.headId, reason: head.reason })),
    note: 'No new calibration rule was derived. The direction head is revalidated against its inherited Stage 2L.10 calibration; every other head has no action path to calibrate onto, so deriving one would have been inventing a delegation surface this stage was asked to audit.',
  },
  'stage2l19-delegation-evaluation.json': {
    stage: certification.stage,
    reliabilityFloor: certification.freeze.reliabilityFloor,
    heads: certification.delegation,
    inheritedDirectionDelegation: certification.inheritedDirectionDelegation,
    inheritedDelegationMatchesStage2L10: inheritedDelegationMatches,
  },
  'stage2l19-cross-head-collision-analysis.json': { stage: certification.stage, ...certification.collisions },
  'stage2l19-security-regression.json': {
    stage: certification.stage,
    authority: certification.authority,
    canDispatch: certification.canDispatch,
    canMutateLiveWorld: certification.canMutateLiveWorld,
    liveActionDispatches: certification.liveActionDispatches,
    worldMutations: certification.worldMutations,
    authorityEscalations: certification.authorityEscalations,
    labelLeakage: certification.labelLeakage,
    baseline,
    freeze,
    characterizationDiscipline: discipline,
    securityRegressionPass: certification.securityRegressionPass,
  },
  'stage2l19-portability-report.json': {
    portabilityDigestVersion: 1,
    stage: certification.stage,
    digest: portability.digest,
    portabilityStatus,
    platformsPassed,
    disagreeing,
    inheritedNote: certification.portabilityNote,
    witnesses: portability.witnesses,
  },
})) {
  await writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}
await writeFile(path.join(artifactRoot, 'stage2l19-report.md'), `${reportLines.join('\n')}\n`);

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  characterizationDisciplineHolds: discipline.disciplineHolds,
  baselinesReproduced: baseline.allBaselinesReproduced,
  inheritedDelegationMatchesStage2L10: inheritedDelegationMatches,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  oracleHeadCount: certification.inventory.headCount,
  inventoryMatchesImplementation: certification.inventory.inventoryMatchesImplementation,
  certifiedHeads: STAGE2L19_CERTIFIED_HEAD_IDS,
  uncertifiedHeads: STAGE2L19_UNCERTIFIED_HEAD_IDS,
  headsConsumedByArbiter: certification.contracts.headsConsumedByArbiter,
  headsExposedButNotConsumed: certification.contracts.headsExposedButNotConsumed,
  semanticallyValidHeadCount: certification.groundTruth.semanticallyValidHeadCount,
  invalidBenchmarkHeadCount: certification.groundTruth.invalidBenchmarkHeadCount,
  inheritedEffectiveSampleSize: certification.degeneracy.heads.map((head) => head.effectiveSampleSize),
  stressAcceptedCases: certification.stressReport.acceptedCases,
  stressRejectedCases: certification.stressReport.rejectedCases,
  classifications: certification.classifications.map((head) => `${head.headId}=${head.classification}`),
  identifiableHeadCount: certification.portfolio.identifiableHeads,
  measuredNonIdentifiableHeadCount: certification.portfolio.measuredNonIdentifiableHeads,
  identifiabilityNotMeasurableHeadCount: certification.portfolio.identifiabilityNotMeasurableHeads,
  safeSpecialistHeadCount: certification.portfolio.safeSpecialistHeads,
  multiHeadEligibleCases: certification.collisions.multiHeadEligibleCases,
  multiHeadCollisionRemediationRequired: certification.collisions.multiHeadCollisionRemediationRequired,
  oraclePortfolioOutcome: certification.oraclePortfolioOutcome,
  measuredOracleLimitation: certification.interpretation.measuredOracleLimitation,
  remediationRequired: certification.interpretation.remediationRequired,
  remediationClass: certification.interpretation.remediationClass,
  labelLeakageDetected: certification.labelLeakageDetected,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l19Certified: certification.stage2l19Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l19Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
