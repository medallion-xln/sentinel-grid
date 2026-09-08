#!/usr/bin/env node
/* Stage 2L.20 — Oracle benchmark vocabulary alignment, head contract repair and
 * requalification.
 *
 * BOUNDED REMEDIATION STAGE. Writes only under
 * artifacts/stage2l20-oracle-vocabulary-alignment/. The repair supersedes rather
 * than edits: every Oracle and Nexus module stays frozen and every prior
 * certification still reproduces byte-identically, which this script proves by
 * owner hash, by source scan, and by replaying Stage 2L.10, 2L.17, 2L.18 and
 * 2L.19 after all Stage 2L.20 work has run.
 *
 * Usage:
 *   node scripts/certify-stage2l20-oracle-vocabulary-alignment.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR, STAGE2L14_MAX_HARMFUL_CHANGE_RATE,
  STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  STAGE2L20_CANONICAL_LABEL_SETS,
  STAGE2L20_PERSISTENCE_CANONICAL_LABEL,
  STAGE2L20_PERSISTENCE_LEGACY_LABEL,
  STAGE2L20_SEMANTIC_ALIASES,
  STAGE2L20_STAGE2L10_CERTIFICATION_HASH,
  STAGE2L20_STAGE2L19_CERTIFICATION_HASH,
  buildStage2L20Evaluation,
  buildStage2L20PortabilityDigest,
  certifyStage2L20,
} from '../src/lab/stage2l20-oracle-vocabulary-alignment.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2l20-oracle-vocabulary-alignment');
const checkOnly = process.argv.includes('--check');

/* Every module this stage reads and none it may write. The Oracle producers are
 * pinned first: a "contract repair" that quietly edits the head it is auditing
 * has proved nothing, and would break Stage 2L.10 and 2L.19 by rewriting
 * assessmentDigest for every head. */
const FROZEN_OWNERS = {
  'src/lab/stage2l19-oracle-multi-head-qualification.js': '3ca39a3a4061eee5b78b05e878fe92cf77318126de60909c9b72b350758cc682',
  'src/lab/stage2i4-oracle-v2-assembly.js': '975fb97b8099d40d3a1bc6aa3f83bb704b76d5e806b63368e0a7f57f93164f5d',
  'src/lab/stage2i3-oracle-head-remediation.js': 'd334e768f2ab559a04c3906f53d37b588a265e39c7c79821d086fedf0b96fcf9',
  'src/lab/stage2i3c-dimension-aware-regime-composition.js': 'cd166af78e7c6172ec64af9ba0646329e5b5d9dcc9184bac18104c20d227c7ae',
  'src/lab/stage2i2-oracle-task-head-diagnostic.js': 'bc908a23dd595376deb7ef39a81b7d95fbfb7da118bb65989e05a12165d51bdf',
  'src/lab/stage2l18-high-confidence-tail-diagnosis.js': '8091e1a2f2647d8d30e8c6bef7986318d1c51b452103c1eb4adad65cb8d42dbe',
  'src/lab/stage2l17-live-substitute-hold-nexus.js': '14f845d9b767abd5f7dc083fcaadccc3ce799a9750cfbeabdb019fa765a56a59',
  'src/lab/stage2l17-live-substitute-hold-remediation.js': '3736a687cfdc643093f1da7a8f8cc0dbdf9c8a15f5418c4d69855fa7bc78ed05',
  'src/lab/stage2l16-nexus-residual-error-decomposition.js': '06baddc4275c256f33751422d74c713236de3568e960960c590d1db00cea53c2',
  'src/lab/stage2l15-nexus-decision-stability.js': 'c135899cc9a77ca801f08776ba91447e883d3bb09147ade92da40710342183ca',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l13-value-aware-nexus.js': '31d29c21d8adcdae8f689c676345f389d1b875767c479427bd87652d870ac282',
  'src/lab/stage2l12-nexus-semantic-grounding-and-observable-utility.js': '2c54345aabedcd3e2e913fb7b4d5d5cbf9dd1ece99f2cf211c3dd76deaea0143',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
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

/* The scope fence. This stage may rename a label and regenerate one corpus
 * family. It may NOT add an action path, widen the Arbiter's Oracle schema,
 * restate a floor or ceiling, or reach into a head's decision logic. */
async function measureRemediationDiscipline() {
  const source = await readFile(path.join(root, 'src/lab/stage2l20-oracle-vocabulary-alignment.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(code);
  const declaresCeiling = /MAX_HARMFUL_CHANGE_RATE\s*=\s*[0-9.]|MAX_CORRECT_PRIME_BREAK_RATE\s*=\s*[0-9.]/.test(code);
  const emitsActionFields = /(recommendedAction|selectedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(code);
  const reassignsExpert = /assembleOracleV2\s*=|evaluateStage2I2Head\s*=|evaluatePersistenceV2\s*=/.test(code);
  const widensArbiterSchema = /ORACLE_SIGNAL|ORACLE_DIRECTION_SLOPE_COHERENCE|arbiterEligibility\s*[:=]\s*['"]CERTIFIED/.test(code);
  /* Nexus DECISION modules are forbidden; a pure statistical helper is not. Stage
   * 2L.19 imports `auroc` from the Stage 2L.15 module for the same reason, and
   * importing a shared AUROC is not touching Nexus. The check names the decision
   * surfaces explicitly rather than pattern-matching every file whose name
   * happens to contain "nexus". */
  const nexusDecisionImports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    .filter((specifier) => /stage2l1[237]-(value-aware-nexus|nexus-semantic-grounding|live-substitute)|experts\/nexus\.js|stage2l1[68]-/.test(specifier));
  const touchesNexus = nexusDecisionImports.length > 0;
  const statisticalHelperImports = [...code.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1])
    .filter((specifier) => specifier.includes('stage2l15-nexus-decision-stability'));
  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    ceilingsUnchanged: STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01 && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
    declaresOwnReliabilityFloor: declaresFloor,
    declaresOwnHarmCeiling: declaresCeiling,
    emitsActionFields,
    reassignsExpertFunctions: reassignsExpert,
    widensArbiterOracleSchema: widensArbiterSchema,
    importsNexusDecisionModules: touchesNexus,
    nexusDecisionImports,
    statisticalHelperImports,
    statisticalHelperImportsAllowed: 'auroc from stage2l15 is a pure function with no Nexus state; Stage 2L.19 imports it identically.',
    aliasTable: STAGE2L20_SEMANTIC_ALIASES,
    canonicalLabelSets: STAGE2L20_CANONICAL_LABEL_SETS,
    disciplineHolds: !declaresFloor && !declaresCeiling && !emitsActionFields && !reassignsExpert
      && !widensArbiterSchema && !touchesNexus
      && STAGE2L14_RELIABILITY_FLOOR === 0.99
      && STAGE2L14_MAX_HARMFUL_CHANGE_RATE === 0.01
      && STAGE2L14_MAX_CORRECT_PRIME_BREAK_RATE === 0.01,
  };
}

const freeze = await measureFreeze();
const discipline = await measureRemediationDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2L20_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2L20_BLOCKED=true reason=REMEDIATION_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline)}`);
  process.exit(2);
}

async function readCertification(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'));
}
const stage2l10 = await readCertification('artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-certification-result.json');
const stage2l19 = await readCertification('artifacts/stage2l19-oracle-multi-head-qualification/stage2l19-certification-result.json');

const baseline = {
  stage2l19CertificationHashMatches: stage2l19.certificationHash === STAGE2L20_STAGE2L19_CERTIFICATION_HASH,
  stage2l10CertificationHashMatches: stage2l10.certificationHash === STAGE2L20_STAGE2L10_CERTIFICATION_HASH,
  stage2l19Certified: stage2l19.stage2l19Certified === true,
  stage2l10Certified: stage2l10.stage2l10Certified === true,
  /* The two inherited defects must still be present as Stage 2L.19 recorded them,
   * or this stage is repairing something other than what it was sent for. */
  persistenceRecordedInvalid: stage2l19.groundTruth.heads
    .find((head) => head.headId === 'persistence')?.unreachableExpectedLabels.includes('NOT_PERSISTENT') === true,
  timeToThresholdRecordedInvalid: stage2l19.groundTruth.heads
    .find((head) => head.headId === 'timeToThreshold')?.unreachableExpectedLabels.includes('CROSSING_1_TO_3') === true,
  directionSafeSpecialist: stage2l19.classifications
    .find((head) => head.headId === 'direction')?.classification === 'SAFE_SPECIALIST',
  floorUnchanged: stage2l10.calibration.minBucketReliability === STAGE2L14_RELIABILITY_FLOOR,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key !== 'allBaselinesReproduced').every(([, value]) => value === true);

if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2L20_BLOCKED=true reason=BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

const evaluation = buildStage2L20Evaluation({ stage2l19Identifiability: stage2l19.identifiability });
const certification = certifyStage2L20({ evaluation });
const portability = buildStage2L20PortabilityDigest(certification);

/* The reimplemented identifiability method must reproduce Stage 2L.19 exactly on
 * untouched inputs. Stage 2L.16 shipped a reimplementation that agreed on 98.5%
 * of cases and had to be discarded; that cannot recur silently. */
if (!certification.faithfulness.methodologyFaithful) {
  console.error('STAGE2L20_BLOCKED=true reason=IDENTIFIABILITY_METHOD_DRIFTED_FROM_STAGE2L19');
  console.error(`  ${JSON.stringify(certification.faithfulness.heads.filter((head) => !head.faithful), null, 2)}`);
  process.exit(2);
}
if (!certification.oracleActionPathsUnchanged) {
  console.error('STAGE2L20_BLOCKED=true reason=ORACLE_ACTION_PATH_EXPANDED');
  process.exit(2);
}
if (!certification.unrelatedHeadsPreserved) {
  console.error('STAGE2L20_BLOCKED=true reason=UNRELATED_ORACLE_HEAD_CHANGED');
  process.exit(2);
}
if (certification.nexusBehaviorChanged) {
  console.error('STAGE2L20_BLOCKED=true reason=NEXUS_BEHAVIOUR_CHANGED');
  process.exit(2);
}
if (certification.authority !== 'R0' || certification.canDispatch !== false || certification.canMutateLiveWorld !== false) {
  console.error('STAGE2L20_BLOCKED=true reason=AUTHORITY_BOUNDARY_VIOLATED');
  process.exit(2);
}

const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-03', digest: '7662c6af8fb67b20b6b4eda8b3c30616b46b22fed6d01113066b382327595f5c' },
];
const recorded = MEASURED_PLATFORMS.filter((entry) => !entry.digest.startsWith('__'));
const disagreeing = recorded.filter((entry) => entry.digest !== portability.digest);
const platformsPassed = [...new Set(recorded.filter((entry) => entry.digest === portability.digest).map((entry) => entry.platform))].sort();
const portabilityStatus = disagreeing.length > 0 ? 'FAIL'
  : platformsPassed.length >= 2 ? 'PASS' : 'DIGEST_PRODUCED_SINGLE_PLATFORM';

if (checkOnly) {
  const stored = JSON.parse(await readFile(path.join(artifactRoot, 'stage2l20-certification-result.json'), 'utf8'));
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({ check: 'STAGE2L20_CERTIFICATION', reproduced: match, storedHash: stored.certificationHash, recomputedHash: certification.certificationHash }, null, 2));
  process.exit(match ? 0 : 1);
}

const persistenceBefore = certification.blindBefore.heads.find((head) => head.headId === 'persistence');
const persistenceAfter = certification.blindAfter.heads.find((head) => head.headId === 'persistence');
const thresholdBefore = certification.blindBefore.heads.find((head) => head.headId === 'timeToThreshold');
const thresholdAfter = certification.blindAfter.heads.find((head) => head.headId === 'timeToThreshold');

const report = [
  '# Stage 2L.20 — Oracle vocabulary alignment and head contract repair',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.oracleVocabularyOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## What Stage 2L.19 got wrong',
  '',
  'Stage 2L.19 recorded both heads as `INVALID_BENCHMARK_SEMANTICS` and filed both',
  'under one remediation class. Tracing each to its owner shows they are not the',
  'same defect, and one of them was misattributed to the wrong party.',
  '',
  '| | Stage 2L.19 said | What the audit found | Owner |',
  '| --- | --- | --- | --- |',
  '| `persistence` | producer emits the wrong label | correct — `NON_PERSISTENT` vs canonical `NOT_PERSISTENT` | producer (Stage 2I.3) |',
  '| `timeToThreshold` | head never emits `CROSSING_1_TO_3` | **wrong** — the head emits it correctly; no benchmark case ever presents the state | benchmark corpus |',
  '',
  '`NOT_PERSISTENT` is canonical on authoritative ownership, not on the benchmark',
  "being the benchmark: the original Stage 2I.2 head emits it, that head's own",
  'corpus expects it, and the Stage 2L.1, 2L.2 and 2L.4 label schemas all declare',
  'it. `NON_PERSISTENT` appears in exactly one place — the Stage 2I.3 remediation',
  'that introduced the drift.',
  '',
  '## The timeToThreshold finding, and Stage 2L.19\'s own part in it',
  '',
  'Every benchmark case claiming `CROSSING_1_TO_3` generates a series whose **last',
  'observed value is already past the threshold**, so `ALREADY_CROSSED` is the',
  'correct answer and the head was right every time:',
  '',
  '| corpus | cases claiming the label | already past threshold |',
  '| --- | --- | --- |',
  ...certification.timeToThreshold.benchmarkFamilies.map((entry) =>
    `| ${entry.corpus} | ${entry.casesClaimingLabel} | **${entry.casesWhoseLastValueIsAlreadyPastThreshold}** (${entry.shareIllPosed}) |`),
  '',
  'The second row is Stage 2L.19\'s own corpus. Its well-posedness rule required',
  'the crossing to occur **inside** the observed window, which for a monotone ramp',
  'guarantees the series ends above the threshold — it enforced the negation of the',
  'label it was guarding. Defect class: `' + certification.timeToThreshold.defectClass + '`.',
  '',
  '## The repair',
  '',
  `- **persistence** — canonical label \`${STAGE2L20_PERSISTENCE_CANONICAL_LABEL}\`, legacy \`${STAGE2L20_PERSISTENCE_LEGACY_LABEL}\` accepted and canonicalised before evaluation. No threshold, branch or abstention rule touched.`,
  '- **timeToThreshold** — the producer is not changed at all. The corpus family is',
  '  regenerated so the last observed value sits below the threshold with the',
  '  crossing genuinely ahead, and a `CROSSING_4_TO_8` family is added because the',
  '  producer emits that label and no benchmark had ever exercised it.',
  '',
  'Nothing frozen was edited. The canonical view wraps the frozen assembly and',
  "preserves each head's own `outputDigest`, so Stage 2L.10 and Stage 2L.19 still",
  'reproduce byte-identically.',
  '',
  '## Measured effect',
  '',
  '| head | accuracy before | accuracy after | trivial baseline | abstention |',
  '| --- | --- | --- | --- | --- |',
  `| \`persistence\` | ${persistenceBefore.accuracy} | ${persistenceAfter.accuracy} | ${persistenceAfter.majorityBaseline} | ${persistenceAfter.abstentionRate} |`,
  `| \`timeToThreshold\` | ${thresholdBefore.accuracy} | **${thresholdAfter.accuracy}** | ${thresholdAfter.majorityBaseline} | ${thresholdAfter.abstentionRate} |`,
  '',
  `Unrelated heads changed: **${!certification.unrelatedHeadsPreserved}**. All six were re-scored and every`,
  'semantic output and output digest is identical.',
  '',
  '## The part that is not vocabulary',
  '',
  '`persistence` accuracy moved by exactly',
  `${certification.residual.renameAccuracyDeltaOnStressCorpus} on the stress corpus and`,
  `${certification.residual.renameAccuracyDeltaOnInheritedCorpus} on the inherited one. The rename was real and is fixed, but it was`,
  'never what capped the head. On the inherited corpus the head does not emit the',
  'misnamed label either — it **abstains**, at a rate of',
  `${certification.residual.abstentionRateOnInheritedCorpus}.`,
  '',
  'Stage 2I.3 changed two things at once. It renamed the label, and it added an',
  'indeterminate-direction abstention the original head did not have',
  '(`dominantSign === 0 || |slope| < .003 || support < .28`). The original Stage 2I.2',
  'head answers `NOT_PERSISTENT` on a flat or alternating series — its own `STABLE`',
  'family is labelled exactly that — where the remediated head abstains. The',
  'inherited `ALTERNATING_INTERRUPTION` family is a pure square wave, so it abstains',
  'on every case.',
  '',
  `That is \`${certification.residual.deeperDefectClass}\`, owned by`,
  `\`${certification.residual.deeperDefectOwner}\`. Fixing it means changing an abstention gate inside a frozen`,
  'head, which is an Oracle algorithm redesign and out of scope here. It is',
  'identified, owned, and stopped at — which is why the outcome is',
  `\`${certification.oracleVocabularyOutcome}\` rather than "both contracts repaired", even though both contracts were.`,
  '',
  '## Reachability and boundaries',
  '',
  ...certification.reachability.heads.map((head) =>
    `- \`${head.headId}\`: ${head.reachableCount}/${head.labelCount} canonical labels reachable${head.unreachableCount ? ` (unreachable: ${head.unreachableLabels.join(', ')})` : ''}`),
  '',
  `Boundary probes: ${certification.boundaries.timeToThresholdBoundaryAgreements}/${certification.boundaries.timeToThresholdBoundaryCases} agree, with`,
  `${certification.boundaries.exactEdgeFloatSensitiveCases.length} exact-edge float-sensitive case(s) and`,
  `${certification.boundaries.insideBucketDisagreements.length} inside-bucket disagreement(s).`,
  certification.boundaries.exactEdgeFloatSensitivityNote ?? '',
  'The mapping stays single-valued and deterministic; only the edge placement',
  'moves. The repaired corpus therefore targets bucket interiors, not edges — a',
  'corpus that generates edge cases and then scores the head wrong for them is the',
  'defect this stage exists to repair.',
  '',
  '## Boundaries held',
  '',
  `Action paths before: \`${certification.actionPaths.actionPathsBefore.join(', ')}\` · after: \`${certification.actionPaths.actionPathsAfter.join(', ')}\` · unchanged: **${certification.oracleActionPathsUnchanged}**.`,
  `Nexus behaviour changed: ${certification.nexusBehaviorChanged}. Reliability floor: ${STAGE2L14_RELIABILITY_FLOOR} (unchanged).`,
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
  'stage2l20-certification-result.json': certification,
  'stage2l20-contract-owner-audit.json': { stage: certification.stage, ...certification.contracts },
  'stage2l20-vocabulary-map.json': {
    stage: certification.stage,
    aliasTable: STAGE2L20_SEMANTIC_ALIASES,
    canonicalLabelSets: STAGE2L20_CANONICAL_LABEL_SETS,
    persistenceCanonicalLabel: STAGE2L20_PERSISTENCE_CANONICAL_LABEL,
    persistenceLegacyLabel: STAGE2L20_PERSISTENCE_LEGACY_LABEL,
    persistenceLegacyAliasSupported: certification.persistenceLegacyAliasSupported,
    ...certification.bijection,
  },
  'stage2l20-label-reachability.json': {
    stage: certification.stage,
    repairedCorpus: certification.reachability,
    inheritedCorpus: evaluation.inheritedReachability,
    corpusReport: certification.corpusReport,
  },
  'stage2l20-boundary-tests.json': { stage: certification.stage, ...certification.boundaries },
  'stage2l20-blind-evaluation.json': {
    stage: certification.stage,
    before: certification.blindBefore,
    after: certification.blindAfter,
    inheritedBefore: certification.inheritedBefore,
    inheritedAfter: certification.inheritedAfter,
    unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
  },
  'stage2l20-identifiability-analysis.json': {
    stage: certification.stage,
    heads: certification.identifiability,
    methodologyFaithfulness: certification.faithfulness,
  },
  'stage2l20-utility-reclassification.json': {
    stage: certification.stage,
    diagnostics: certification.diagnostics,
    residual: certification.residual,
    note: 'These heads remain label-only. Diagnostic quality is measured against the best trivial classifier; no Prime-relative action utility is fabricated.',
  },
  'stage2l20-security-regression.json': {
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
  'stage2l20-portability-report.json': {
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
await writeFile(path.join(artifactRoot, 'stage2l20-report.md'), `${report.join('\n')}\n`);

console.log(JSON.stringify({
  stage: certification.stage,
  status: certification.status,
  authority: certification.authority,
  frozenOwnersUnchanged: freeze.allUnchanged,
  remediationDisciplineHolds: discipline.disciplineHolds,
  baselinesReproduced: baseline.allBaselinesReproduced,
  contractOwnerAuditComplete: certification.contractOwnerAuditComplete,
  vocabularyBijectionValid: certification.vocabularyBijectionValid,
  persistenceCanonicalLabel: STAGE2L20_PERSISTENCE_CANONICAL_LABEL,
  persistenceLegacyAliasSupported: certification.persistenceLegacyAliasSupported,
  persistenceDefectResolved: certification.persistenceDefectResolved,
  timeToThresholdDefectClass: certification.timeToThreshold.defectClass,
  timeToThresholdDefectResolved: certification.timeToThresholdDefectResolved,
  allCanonicalLabelsReachable: certification.allCanonicalLabelsReachable,
  persistenceAccuracyBefore: persistenceBefore.accuracy,
  persistenceAccuracyAfter: persistenceAfter.accuracy,
  timeToThresholdAccuracyBefore: thresholdBefore.accuracy,
  timeToThresholdAccuracyAfter: thresholdAfter.accuracy,
  unrelatedHeadsPreserved: certification.unrelatedHeadsPreserved,
  methodologyFaithful: certification.faithfulness.methodologyFaithful,
  carriedCasesByteIdentical: certification.corpusReport.carriedCasesByteIdentical,
  oracleActionPathsBefore: certification.actionPaths.actionPathsBefore,
  oracleActionPathsAfter: certification.actionPaths.actionPathsAfter,
  oracleActionPathsUnchanged: certification.oracleActionPathsUnchanged,
  nexusBehaviorChanged: certification.nexusBehaviorChanged,
  identifiability: certification.identifiability.map((head) => `${head.headId}=${head.identifiabilityStatus}`),
  diagnostics: certification.diagnostics.map((head) => `${head.headId}:${head.before}->${head.after}`),
  bothContractsRepaired: certification.bothContractsRepaired,
  measuredRemainingLimitation: certification.interpretation.measuredRemainingLimitation,
  oracleVocabularyOutcome: certification.oracleVocabularyOutcome,
  securityRegressionPass: certification.securityRegressionPass,
  stage2l20Certified: certification.stage2l20Certified,
  evidenceDigest: certification.evidenceDigest,
  certificationHash: certification.certificationHash,
  portabilityDigest: portability.digest,
  portabilityStatus,
}, null, 2));

process.exit(certification.stage2l20Certified && portabilityStatus !== 'FAIL' ? 0 : 1);
