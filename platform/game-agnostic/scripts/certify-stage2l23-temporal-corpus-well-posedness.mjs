#!/usr/bin/env node
/* Stage 2L.23 — temporal corpus generator boundary validation and well-posedness.
 *
 * EVALUATION-INFRASTRUCTURE REMEDIATION. Writes only under
 * artifacts/stage2l23-temporal-corpus-well-posedness/. No Oracle head, no Nexus
 * module and no Arbiter file is edited, so every prior certification reproduces
 * byte-identically. Only corpus families PROVEN defective are regenerated.
 *
 * Usage:
 *   node scripts/certify-stage2l23-temporal-corpus-well-posedness.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import { STAGE2L21_PERSISTENCE_SEMANTICS_VERSION } from '../src/lab/stage2l21-oracle-persistence-semantics.js';
import {
  STAGE2L23_GENERATOR_PROPERTIES,
  STAGE2L23_REGENERATED_FAMILIES,
  STAGE2L23_STAGE2L19_CERTIFICATION_HASH,
  STAGE2L23_STAGE2L21_CERTIFICATION_HASH,
  STAGE2L23_STAGE2L22_CERTIFICATION_HASH,
  buildStage2L23Evaluation,
  buildStage2L23PortabilityDigest,
  certifyStage2L23,
} from '../src/lab/stage2l23-temporal-corpus-well-posedness.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l23-temporal-corpus-well-posedness');
const checkOnly = process.argv.includes('--check');

const FROZEN_OWNERS = {
  'src/lab/stage2l22-oracle-persistence-conflict-semantics.js': '964e685e6ebabe1b9b4da00265fba6e503ed4696b2280ec3bb8c08dbc795d187',
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

/* The scope fence. This stage repairs EVALUATION DATA. It may not touch an
 * expert, and — the load-bearing one — its validators may not call the head they
 * validate, or the corpus would be adjudicated by the thing it scores. */
async function measureInfrastructureDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l23-temporal-corpus-well-posedness.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const emitsActionFields = /(recommendedAction|selectedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(code);
  const reassignsExpert = /assembleOracleV2\s*=|evaluatePersistenceV2\s*=|evaluateStage2I2Head\s*=/.test(code);
  const widensArbiterSchema = /ORACLE_SIGNAL|ORACLE_DIRECTION_SLOPE_COHERENCE|arbiterEligibility\s*[:=]\s*['"]CERTIFIED/.test(code);
  const nexusImports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    .filter((specifier) => /stage2l1[23678]-|experts\/nexus\.js/.test(specifier));
  /* The validator must be head-free. Extracted and scanned as a unit. */
  const validatorBody = /export function validateStage2L23Case\([\s\S]*?\n}\n/.exec(code)?.[0] ?? '';
  const validatorCallsHead = /assembleOracleV2|evaluatePersistenceV2|evaluateStage2I2Head/.test(validatorBody);
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    declaresOwnReliabilityFloor: declaresFloor,
    emitsActionFields,
    reassignsExpertFunctions: reassignsExpert,
    widensArbiterOracleSchema: widensArbiterSchema,
    importsNexusDecisionModules: nexusImports.length > 0,
    semanticValidatorCallsHeadUnderTest: validatorCallsHead,
    semanticsVersionReused: STAGE2L21_PERSISTENCE_SEMANTICS_VERSION,
    regeneratedFamilies: STAGE2L23_REGENERATED_FAMILIES,
    disciplineHolds: !declaresFloor && !emitsActionFields && !reassignsExpert && !widensArbiterSchema
      && nexusImports.length === 0 && !validatorCallsHead
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureInfrastructureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L23_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L23_BLOCKED=true reason=INFRASTRUCTURE_STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

async function readCertification(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}
const stage2l19 = await readCertification('artifacts/stage2l19-oracle-multi-head-qualification/stage2l19-certification-result.json');
const stage2l21 = await readCertification('artifacts/stage2l21-oracle-persistence-semantics/stage2l21-certification-result.json');
const stage2l22 = await readCertification('artifacts/stage2l22-oracle-persistence-conflict-semantics/stage2l22-certification-result.json');

const baseline = {
  stage2l22CertificationHashMatches: stage2l22.certificationHash === STAGE2L23_STAGE2L22_CERTIFICATION_HASH,
  stage2l21CertificationHashMatches: stage2l21.certificationHash === STAGE2L23_STAGE2L21_CERTIFICATION_HASH,
  stage2l19CertificationHashMatches: stage2l19.certificationHash === STAGE2L23_STAGE2L19_CERTIFICATION_HASH,
  stage2l22Certified: stage2l22.stage2l22Certified === true,
  stage2l21Certified: stage2l21.stage2l21Certified === true,
  stage2l19Certified: stage2l19.stage2l19Certified === true,
  sustainedRunStatusReproduced: stage2l22.sustainedRunCorpusStatus === 'PARTIALLY_MISLABELLED',
  sustainedRunMislabelledReproduced: stage2l22.sustainedRunAudit.semanticallyNotPersistentCases === 18,
  directionSafeSpecialist: stage2l19.classifications.find((head) => head.headId === 'direction')?.classification === 'SAFE_SPECIALIST',
  floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key !== 'allBaselinesReproduced').every(([, value]) => value === true);

if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2L23_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

const evaluation = buildStage2L23Evaluation();
const certification = certifyStage2L23({ evaluation });
const portability = buildStage2L23PortabilityDigest(certification);

for (const [condition, reason] of [
  [certification.oracleHeadsUnchanged, 'ORACLE_HEAD_CHANGED'],
  [certification.oracleActionPathsUnchanged, 'ORACLE_ACTION_PATH_EXPANDED'],
  [!certification.nexusBehaviorChanged, 'NEXUS_BEHAVIOUR_CHANGED'],
  [certification.lineage.carriedCasesByteIdentical, 'UNAFFECTED_CASES_NOT_CARRIED_BYTE_IDENTICALLY'],
  [certification.generatorPropertyTestsPass, 'GENERATOR_PROPERTIES_FAILED'],
  [!discipline.semanticValidatorCallsHeadUnderTest, 'VALIDATOR_CONSULTS_THE_HEAD_IT_VALIDATES'],
  [certification.authority === 'R0' && certification.canDispatch === false && certification.canMutateLiveWorld === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
]) {
  if (!condition) { console.error(`STAGE2L23_BLOCKED=true reason=${reason}`); process.exit(2); }
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-03', digest: 'bbb321a6a82394e4d71ac8b4b1eecdd0ceb7d4e5875a03e67d4aa15eddfd2663' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS' : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l23-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L23_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const persistenceBefore = certification.blindBefore.heads.find((head) => head.headId === 'persistence');
const persistenceAfter = certification.blindAfter.heads.find((head) => head.headId === 'persistence');
const report = [
  '# Stage 2L.23 — temporal corpus well-posedness',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.temporalCorpusOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## The pattern this stage exists to end',
  '',
  'Three generator defects of one shape have been found inside this project\'s own',
  'evaluation data — a clamped reversal (2L.19), a crossing family that had already',
  'crossed (2L.20), and jitter overwhelming slope (2L.22). Each was caught late, by',
  'a diagnostic stage puzzling over an expert that looked wrong. Each is the same',
  'mistake: the generator was validated at its nominal settings and never at its',
  'parameter extremes, and a family NAME was treated as ground truth.',
  '',
  '`family = "SUSTAINED_RUN"` is a statement of intent, not evidence that the',
  'series is persistent. So this stage builds a validator per family that reads the',
  'produced series and answers one question — is the intended label actually true? —',
  '**without ever calling the head under test**. The certify script scans the',
  'validator body and refuses to certify if it does.',
  '',
  '## What the sweep found',
  '',
  `${certification.temporalFamilyCount} families, all boundary-audited. Three were proven defective **on the certification corpus**:`,
  '',
  '| family | corpus cases | mislabelled before | after |',
  '| --- | --- | --- | --- |',
  ...certification.provenDefectiveFamilies.map((familyId) => {
    const before = certification.parentAudits.find((entry) => entry.familyId === familyId);
    const after = certification.repairedAudits.find((entry) => entry.familyId === familyId);
    return `| \`${familyId}\` | ${before.corpusCases} | **${before.mislabelled}** | ${after.mislabelled} |`;
  }),
  '',
  'A further six are well posed on the corpus but fail somewhere in their declared',
  `parameter range: \`${certification.boundaryFragileFamilies.join('`, `')}\`. The corpus never visits those points, so nothing`,
  'certified rests on them — the ranges are recorded rather than silently narrowed.',
  '',
  '## Two of my own validators were wrong first',
  '',
  'The first run reported 9 defects in `reversal/LATE_REVERSAL` and 17 in',
  '`abstention/SUFFICIENT_HISTORY`. Both were validator errors:',
  '',
  '- The reversal test looked only at the **midpoint** split. Searching every split',
  '  shows 8 of those 9 turn away from the middle and are perfectly well posed.',
  '  Only 1 was real.',
  '- Saturation was applied as a **universal** disqualifier. But clamping cannot',
  '  make a 24-frame window shorter, so it does not falsify a length-only label.',
  '  All 17 were fine; the saturation is recorded as a hygiene finding instead.',
  '',
  'A validator that is too strict manufactures corpus defects exactly as a generator',
  'that is too loose manufactures expert defects. Both were corrected before any',
  'repair was made.',
  '',
  '## The repair, and the law behind it',
  '',
  'All three real defects share one root cause: a **shape** parameter and a **noise**',
  'parameter sampled independently, so their extremes combine into a series that',
  'does not depict the intended shape. The repair makes noise a *fraction of* the',
  'shape parameter, which bounds the worst jitter swing below one step and puts',
  'every case strictly inside the semantic region by construction rather than by',
  'luck.',
  '',
  '| family | min realised margin | required margin |',
  '| --- | --- | --- |',
  ...Object.entries(certification.minSemanticMarginByFamily).map(([familyId, margin]) =>
    `| \`${familyId}\` | ${margin} | ${certification.safetyMarginByFamily[familyId]} |`),
  '',
  'Margins are per family in that family\'s own units — a consistency share for',
  'persistence, a segment slope for reversal — because a single global number would',
  'compare unlike quantities.',
  '',
  '## Lineage',
  '',
  `Parent \`${certification.lineage.parentCorpus}\` (\`${certification.lineage.parentCorpusDigest.slice(0, 12)}…\`) → \`${certification.lineage.corpusDigest.slice(0, 12)}…\`.`,
  `Carried ${certification.lineage.carriedCases} · removed ${certification.lineage.removedCases} · regenerated ${certification.lineage.regeneratedCases} · rejected at the admission gate ${certification.lineage.rejectedDuringGeneration}.`,
  `Carried cases byte-identical: **${certification.lineage.carriedCasesByteIdentical}**.`,
  '',
  '## Oracle re-evaluation — corpus movement, not expert improvement',
  '',
  'The heads are byte-identical: ' + certification.headsChecked + ' digest comparisons, ' + certification.headDrift + ' drift.',
  'Every score change below is the corpus becoming honest, and nothing else.',
  '',
  '| head | before | after | baseline | corpus changed |',
  '| --- | --- | --- | --- | --- |',
  ...certification.blindBefore.heads.map((head) => {
    const after = certification.blindAfter.heads.find((entry) => entry.headId === head.headId);
    const changed = ['persistence', 'reversal'].includes(head.headId);
    return `| \`${head.headId}\` | ${head.accuracy} | ${after.accuracy} | ${after.majorityBaseline} | ${changed} |`;
  }),
  '',
  `\`persistence\` moves ${persistenceBefore.accuracy} → **${persistenceAfter.accuracy}**, converging on the ${stage2l22.adjudicatedAfter.accuracy} that Stage 2L.22`,
  'measured by adjudicating the series instead of trusting the labels. That',
  'convergence is the check that the repair was the right one.',
  '',
  '## Identifiability, recertified',
  '',
  ...certification.identifiability.map((entry) =>
    `- \`${entry.headId}\`: ${entry.before.identifiabilityStatus} → **${entry.after.identifiabilityStatus}** (observed ${entry.after.observedDiscrimination ?? 'n/a'}, null p99 ${entry.after.nullP99 ?? 'n/a'})`),
  '',
  'Recertified with the Stage 2L.20 method reused verbatim — same splits, same',
  'search-space-matched null, same Bonferroni correction, same materiality margin.',
  '',
  '## Boundaries held',
  '',
  `Oracle heads unchanged: **${certification.oracleHeadsUnchanged}**. Action paths before \`${certification.actionPaths.before.join(', ')}\` · after \`${certification.actionPaths.after.join(', ')}\`.`,
  `Nexus behaviour changed: ${certification.nexusBehaviorChanged}. Floor: ${STAGE2L14_RELIABILITY_FLOOR}. Effective variation ${certification.effectiveVariationAfter.effectiveVariationCount} of ${certification.effectiveVariationAfter.rawCaseCount} raw cases.`,
  `Live dispatches ${certification.liveActionDispatches} · world mutations ${certification.worldMutations} · authority escalations ${certification.authorityEscalations}.`,
  '',
  `Portability: ${portabilityStatus}. ${certification.portabilityNote}`,
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
];

await mkdir(artifactRoot, { recursive: true });
for (const [name, value] of Object.entries({
  'stage2l23-certification-result.json': certification,
  'stage2l23-generator-inventory.json': { stage: certification.stage, ...certification.inventory },
  'stage2l23-semantic-validator-map.json': { stage: certification.stage, ...certification.validatorMap },
  'stage2l23-boundary-analysis.json': {
    stage: certification.stage,
    boundaryFragileFamilies: certification.boundaryFragileFamilies,
    perFamily: certification.sweeps.map((sweep) => ({
      familyId: sweep.familyId, swept: sweep.swept, valid: sweep.valid, mislabelled: sweep.mislabelled,
      ambiguous: sweep.ambiguous, minMargin: sweep.minMargin, failureReasons: sweep.failureReasons,
      extremeFailures: sweep.extremeFailures,
    })),
  },
  'stage2l23-parameter-sweep.json': { stage: certification.stage, sweeps: certification.sweeps },
  'stage2l23-family-classification.json': {
    stage: certification.stage,
    classifications: certification.classifications,
    parentAudits: certification.parentAudits,
    repairedAudits: certification.repairedAudits,
    provenDefectiveFamilies: certification.provenDefectiveFamilies,
  },
  'stage2l23-sustained-run-remediation.json': {
    stage: certification.stage,
    before: certification.sustainedRunBefore,
    after: certification.sustainedRunAfter,
    resolved: certification.sustainedRunResolved,
    regeneratedFamilies: certification.regeneratedFamilies,
    minSemanticMarginByFamily: certification.minSemanticMarginByFamily,
    safetyMarginByFamily: certification.safetyMarginByFamily,
    jointSamplingLaw: 'Jitter amplitude is a fraction of the shape parameter, so the worst jitter swing (2x amplitude) stays below one step and no step can oppose the trend.',
  },
  'stage2l23-floating-point-audit.json': { stage: certification.stage, ...certification.floatingPoint },
  'stage2l23-effective-variation-analysis.json': {
    stage: certification.stage,
    before: certification.effectiveVariationBefore,
    after: certification.effectiveVariationAfter,
  },
  'stage2l23-well-posedness-framework.json': {
    stage: certification.stage,
    architecture: 'generate -> semantic validator -> well-posedness assertion -> admit',
    admissionOutcomes: ['ADMITTED', 'REJECTED_ILL_POSED', 'REJECTED_INSIDE_MARGIN', 'ADMITTED_AS_BOUNDARY_PROBE'],
    properties: STAGE2L23_GENERATOR_PROPERTIES,
    propertyResults: certification.properties,
    validatorsCallHeadUnderTest: false,
  },
  'stage2l23-corpus-lineage.json': { stage: certification.stage, ...certification.lineage },
  'stage2l23-oracle-reevaluation.json': {
    stage: certification.stage,
    before: certification.blindBefore,
    after: certification.blindAfter,
    oracleHeadsUnchanged: certification.oracleHeadsUnchanged,
    headsChecked: certification.headsChecked,
    headDrift: certification.headDrift,
    attribution: 'CORPUS_ONLY_NO_EXPERT_CHANGE',
  },
  'stage2l23-identifiability-recertification.json': {
    stage: certification.stage,
    heads: certification.identifiability,
    methodology: 'STAGE2L20_MEASURE_IDENTIFIABILITY_REUSED_VERBATIM',
  },
  'stage2l23-security-regression.json': {
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
    infrastructureDiscipline: discipline,
    securityRegressionPass: certification.securityRegressionPass,
  },
  'stage2l23-portability-report.json': {
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
await writeFile(path.join(artifactRoot, 'stage2l23-report.md'), `${report.join('\n')}\n`);

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  infrastructureDisciplineHolds: discipline.disciplineHolds,
  baselinesReproduced: baseline.allBaselinesReproduced,
  temporalFamilyCount: certification.temporalFamilyCount,
  boundaryAuditedFamilyCount: certification.boundaryAuditedFamilyCount,
  familyClassifications: certification.classifications.map((entry) => `${entry.familyId}=${entry.classification}`),
  provenDefectiveFamilies: certification.provenDefectiveFamilies,
  boundaryFragileFamilies: certification.boundaryFragileFamilies,
  regeneratedFamilies: certification.regeneratedFamilies,
  sustainedRunBefore: { cases: certification.sustainedRunBefore.corpusCases, mislabelled: certification.sustainedRunBefore.mislabelled },
  sustainedRunAfter: { cases: certification.sustainedRunAfter.corpusCases, mislabelled: certification.sustainedRunAfter.mislabelled },
  sustainedRunDefectResolved: certification.sustainedRunDefectResolved,
  minSemanticMarginByFamily: certification.minSemanticMarginByFamily,
  safetyMarginByFamily: certification.safetyMarginByFamily,
  lineage: certification.lineage,
  generatorPropertyTestCount: STAGE2L23_GENERATOR_PROPERTIES.length,
  generatorPropertyTestsPass: certification.generatorPropertyTestsPass,
  effectiveVariationBefore: { raw: certification.effectiveVariationBefore.rawCaseCount, effective: certification.effectiveVariationBefore.effectiveVariationCount, nearDuplicateRate: certification.effectiveVariationBefore.nearDuplicateRate },
  effectiveVariationAfter: { raw: certification.effectiveVariationAfter.rawCaseCount, effective: certification.effectiveVariationAfter.effectiveVariationCount, nearDuplicateRate: certification.effectiveVariationAfter.nearDuplicateRate },
  floatingPointUnstableEdges: certification.floatingPoint.unstableEdgeCount,
  corpusCasesOnExactEdges: certification.floatingPoint.corpusCasesOnExactEdges,
  heads: certification.blindBefore.heads.map((head) => {
    const after = certification.blindAfter.heads.find((entry) => entry.headId === head.headId);
    return `${head.headId}: ${head.accuracy} -> ${after.accuracy} (base ${after.majorityBaseline}, abst ${after.abstentionRate}, n ${after.cases})`;
  }),
  persistenceAsLabelledBefore: persistenceBefore.accuracy,
  persistenceRepairedCorpus: persistenceAfter.accuracy,
  persistenceSemanticAdjudicatedBefore: stage2l22.adjudicatedAfter.accuracy,
  sustainedRunAccuracyBefore: persistenceBefore.byFamily.SUSTAINED_RUN?.accuracy,
  sustainedRunAccuracyAfter: persistenceAfter.byFamily.SUSTAINED_RUN?.accuracy,
  identifiability: certification.identifiability.map((entry) =>
    `${entry.headId}: ${entry.before.identifiabilityStatus} -> ${entry.after.identifiabilityStatus} (obs ${entry.after.observedDiscrimination}, p99 ${entry.after.nullP99})`),
  oracleHeadsUnchanged: certification.oracleHeadsUnchanged,
  headsChecked: certification.headsChecked,
  headDrift: certification.headDrift,
  oracleActionPathsUnchanged: certification.oracleActionPathsUnchanged,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  temporalCorpusOutcome: certification.temporalCorpusOutcome,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l23Certified: certification.stage2l23Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l23Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
