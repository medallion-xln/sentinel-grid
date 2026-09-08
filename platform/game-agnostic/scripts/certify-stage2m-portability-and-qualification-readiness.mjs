#!/usr/bin/env node
/* Stage 2M — portability, environment independence and current-lineage
 * qualification readiness.
 *
 * ENVIRONMENT-BINDING STAGE. It changes how the repository FINDS its runtime and
 * nothing about how the repository REASONS. No expert, no Nexus module, no Oracle
 * head and no Arbiter policy is edited, so every Stage 2L certification
 * reproduces byte-identically. Writes only under
 * artifacts/stage2m-portability-and-qualification-readiness/.
 *
 * Usage:
 *   node scripts/certify-stage2m-portability-and-qualification-readiness.mjs [--check]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { STAGE2L14_RELIABILITY_FLOOR } from '../src/lab/stage2l14-nexus-confidence-calibration.js';
import {
  ZEKNOVA_ROOT_CONTRACT_VERSION,
  ZEKNOVA_ROOT_ENV,
  ZEKNOVA_ROOT_MARKERS,
  ZEKNOVA_ROOT_STATUSES,
  resolveZeknovaRoot,
} from '../src/core/zeknova-root.js';
import {
  STAGE2M_CONTRACT_SURFACES,
  STAGE2M_DEPENDENCY_CLASSES,
  STAGE2M_ENVIRONMENT_DEPENDENCIES,
  STAGE2M_LINEAGE_CLASSES,
  STAGE2M_STAGE,
  STAGE2M_STAGE2L23_CERTIFICATION_HASH,
  buildStage2LClosureCertificate,
  buildStage2MDependencyInventory,
  certifyStage2M,
  evaluateStage2MReadiness,
  measureStage2MAdversarialRoots,
  measureStage2MContractCompatibility,
  measureStage2MCurrentLineage,
  measureStage2MPathIndependence,
  runStage2MShadowDryRun,
} from '../src/lab/stage2m-portability-and-qualification-readiness.js';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifactRoot = path.join(root, 'artifacts', 'stage2m-portability-and-qualification-readiness');
const checkOnly = process.argv.includes('--check');
const sha256File = async (relative) =>
  createHash('sha256').update(await readFile(path.join(root, relative))).digest('hex');

/* Every module this stage may not touch. Stage 2L is CLOSED; a portability stage
 * that edited reasoning would silently reopen it. */
const FROZEN_OWNERS = {
  'src/lab/stage2l23-temporal-corpus-well-posedness.js': '6709b53c2f8d63586c1463bc6ccd8a1b013671c036d9da59eadaf0196b1ebd74',
  'src/lab/stage2l22-oracle-persistence-conflict-semantics.js': '964e685e6ebabe1b9b4da00265fba6e503ed4696b2280ec3bb8c08dbc795d187',
  'src/lab/stage2l21-oracle-persistence-semantics.js': '565110035789b51f4ecc99e2bbb4f04c19e49471f7ae209ce28a009b724f557b',
  'src/lab/stage2l20-oracle-vocabulary-alignment.js': 'ed60e2915e3346dab642db4dd94b3300129a4945bdbb8dd60c720d9fc42d328a',
  'src/lab/stage2l19-oracle-multi-head-qualification.js': '3ca39a3a4061eee5b78b05e878fe92cf77318126de60909c9b72b350758cc682',
  'src/lab/stage2l18-high-confidence-tail-diagnosis.js': '8091e1a2f2647d8d30e8c6bef7986318d1c51b452103c1eb4adad65cb8d42dbe',
  'src/lab/stage2l17-live-substitute-hold-nexus.js': '14f845d9b767abd5f7dc083fcaadccc3ce799a9750cfbeabdb019fa765a56a59',
  'src/lab/stage2l14-nexus-confidence-calibration.js': '0efbef966c7625675244b57a95e706c67c81ddd2c60b871ac3a48f4c07ceeb16',
  'src/lab/stage2l10-arbiter-correctness-calibration-and-selective-delegation.js': '7301bc34486f0ae72e310898cd162fb9bd41d7be943b5ada81a5785bcd18a00a',
  'src/lab/stage2l8-remediated-arbiter-independent-red-team-replication.js': '0e9e09c3d853237365ebbd42512ba3f18bb4ee6577db554bd9c15588eb7f70e0',
  'src/lab/stage2l7-arbiter-evidence-binding-and-agreement-safety-remediation.js': '5047dc0576b8242c00a1f73729c4b0bc49fc1d181eac22bc90896d2cf5cccc00',
  'src/experts/oracle.js': 'ce50bcc3a9d5c56f5c3d9986710609af5bc2c5e4ece9b73fc739a65f87b8373a',
  'src/experts/nexus.js': '7a6e194b1b97221fc9e2a15cc9f1885c0858ab50d784bdf81e5cbc58de70a144',
  'src/prime/root-puct.js': '93b62027a77088690027201d3ed05ead8f8f50f77e44a37bca6237070e2148fc',
  'src/core/authority.js': 'fa622b39e80fd8808aefa41b4f4525d28bc778f7c3c19db046ee72648e1f2ee8',
  'src/core/recommendation.js': '20cf8d3033d9dc9a75be947ec20ab51b1f722cc29f998d23a00e7095c4d2b4af',
};

async function measureFreeze() {
  const owners = [];
  for (const [relative, expected] of Object.entries(FROZEN_OWNERS)) {
    const measured = await sha256File(relative);
    owners.push({ path: relative, expected, measured, unchanged: measured === expected });
  }
  return { owners, ownerCount: owners.length, allUnchanged: owners.every((entry) => entry.unchanged) };
}

/* The scope fence.
 *
 * Two properties are load-bearing here and neither is obvious from the diff.
 *
 * 1. The stage may not change reasoning. Same shape as every prior fence.
 * 2. The root contract may not SEARCH. "Portable" is not "finds the runtime
 *    somewhere"; a resolver that walked the filesystem, read a home directory or
 *    carried a fallback path would be reintroducing exactly the defect this stage
 *    exists to remove, while passing every behavioural test. So the resolver
 *    source is scanned for directory traversal, home-directory reads and absolute
 *    developer paths. */
async function measureDiscipline() {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /* A fence that reads prose cannot tell a defect from a description of one, and
   * this stage's own sources are mostly descriptions of the defect. So string
   * literals collapse to a single canonical token: what a file SAYS disappears and
   * what it DOES survives. `ZEKNOVA_ROOT || '/some/path'` still reads as a
   * fallback because the operator and the quote remain; the same words inside a
   * report string do not. */
  const stripToCode = (text) => strip(text)
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '"S"');
  const stageSource = strip(await readFile(path.join(root, 'src/lab/stage2m-portability-and-qualification-readiness.js'), 'utf8'));
  const contractRaw = await readFile(path.join(root, 'src/core/zeknova-root.js'), 'utf8');
  /* Two views of the resolver, because two different questions are being asked.
   * "Does it CARRY a developer path?" is about text, and a hardcoded path lives in
   * a string, so that one reads the strings. "Does it SEARCH, or resolve from a
   * home directory or a fallback?" is about behaviour, so that one reads code with
   * the strings collapsed. Using one view for both would either miss a literal
   * path or flag a comment describing one. */
  const contractSource = strip(contractRaw);
  const contractCode = stripToCode(contractRaw);

  const declaresFloor = /RELIABILITY_FLOOR\s*=\s*[0-9.]/.test(stageSource);
  const emitsActionFields = /(recommendedAction|actionAdjustment|actionBias|dispatchAction)\s*[:=][^=]/.test(stageSource);
  const reassignsExpert = /(assembleOracleV2|evaluatePersistenceV2|evaluateStage2I2Head|evaluateNexus)\s*=[^=]/.test(stageSource);
  const widensArbiterSchema = /arbiterEligibility\s*[:=]\s*['"]CERTIFIED/.test(stageSource);
  const editsExpertModules = /from\s+'\.\.\/experts\/(oracle|nexus)\.js'/.test(stageSource);

  /* Search prohibitions, applied to the resolver itself. */
  const searchesDirectories = /\breaddir\b|\bopendir\b|\bglob\b|\bwalk\b/.test(contractCode);
  const readsHomeDirectory = /homedir\s*\(|process\.env\.HOME\b|process\.env\.USERPROFILE\b/.test(contractCode);
  const carriesDeveloperPath = /\/Users\/|\/home\/[a-z]+\/|C:\\\\/.test(contractSource);
  const carriesFallbackDefault = /ZEKNOVA_ROOT[A-Z_]*\s*\]?\s*(?:\|\||\?\?)\s*"S"/.test(contractCode);

  /* And to the whole REPOSITORY, not just this workspace and not just the two
   * files this stage wrote. Two scans, because the defect has two shapes:
   *
   *   - the literal Desktop path, which a text search finds; and
   *   - os.homedir()/Desktop/..., which it does not. The second is the more
   *     dangerous one precisely because it looks like a default rather than a
   *     machine assumption, and it survived every previous audit for that reason.
   *
   * Recorded install markers and stale scratch are excluded by classification,
   * not by accident: they are data about where a past install lived, and are on
   * no execution path. Every exclusion is declared in the dependency inventory. */
  /* The scan needs a git checkout. Unpacked from a distribution bundle there is
   * none, and the first version of this script died there on a raw
   * "not a git repository" — the exact anonymous failure this stage exists to
   * remove, reintroduced by the script enforcing its removal. It is now a named
   * status: measurable or not, said out loud, never guessed. */
  let repositoryRoot = null;
  let repositoryScanAvailable = true;
  let repositoryScanUnavailableReason = null;
  try {
    repositoryRoot = (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: root })).stdout.trim();
  } catch {
    repositoryScanAvailable = false;
    repositoryScanUnavailableReason = 'REPOSITORY_SCAN_UNAVAILABLE_NOT_A_GIT_CHECKOUT: the repository-wide hardcoded-path scan needs a git checkout and this tree is not one.';
  }
  const EXCLUDED_FROM_EXECUTION_PATHS = [
    /^\.tmp-/,                              // stale scratch from an earlier runtime rebuild
    /^ $/,                                  // WHITESPACE_NAMED_FORENSIC_SCRIPT — see the dependency inventory
    /^NEXT_CHAT_HANDOFF_PLAIN\.txt$/,        // prose
    /^integration\/mainline-integration\.json$/, // recorded install marker
    /^integration\/targets\/[^/]+\.json$/,    // recorded install markers
    /evidence-portability\.test\.js$/,       // the fixture that asserts paths are never leaked
    /^docs\//,                               // prose
    /^platform\/game-agnostic\/docs\//,      // prose
    /^platform\/game-agnostic\/artifacts\//, // historical certification artifacts, never rewritten
    /^platform\/game-agnostic\/src\/lab\/stage2m-portability-and-qualification-readiness\.js$/,
    /^platform\/game-agnostic\/scripts\/certify-stage2m-portability-and-qualification-readiness\.mjs$/,
  ];
  const gitGrep = async (args) => {
    if (!repositoryScanAvailable) return null;
    try {
      const { stdout } = await execFileAsync('git', ['grep', '-l', ...args], { cwd: repositoryRoot });
      return stdout.split('\n').filter(Boolean);
    } catch (error) {
      /* git grep exits 1 with no output when nothing matches. That is the pass. */
      if (error.code === 1) return [];
      throw error;
    }
  };
  const onExecutionPath = (file) => !EXCLUDED_FROM_EXECUTION_PATHS.some((pattern) => pattern.test(file));
  const literalSurvivors = (await gitGrep(['-F', 'Desktop/zeknova-shared-gaming-experience']))?.filter(onExecutionPath) ?? null;
  const homedirSurvivors = (await gitGrep(['-E', String.raw`homedir\(\).{0,40}Desktop`]))?.filter(onExecutionPath) ?? null;
  const hardcodedSurvivors = repositoryScanAvailable
    ? [...new Set([...literalSurvivors, ...homedirSurvivors])].sort()
    : null;

  /* The last two exclusions above are this stage's OWN sources, and they are the
   * only exclusions that would be dangerous if left at that. They match because
   * they quote the defect — in the scan pattern itself, in the dependency
   * descriptions, and in the report prose. Excluding them from a text search and
   * stopping there would put the blind spot exactly where a defect could hide
   * best, so they are checked more strictly instead of less: not "do they mention
   * the path" but "do they RESOLVE anything from it". A mention is documentation;
   * an assignment is the defect.
   *
   * Written to tolerate any quoting and any fallback operator, so a survivor
   * cannot slip through on formatting. */
  const stage2mCode = [
    stripToCode(await readFile(path.join(root, 'src/lab/stage2m-portability-and-qualification-readiness.js'), 'utf8')),
    stripToCode(await readFile(path.join(root, 'scripts/certify-stage2m-portability-and-qualification-readiness.mjs'), 'utf8')),
  ];
  const RESOLUTION_FALLBACK = /ZEKNOVA_ROOT[A-Z_]*\s*\]?\s*(?:\|\||\?\?)\s*"S"/;
  const HOMEDIR_RESOLUTION = /(?:os\.)?homedir\s*\(\s*\)/;
  const stage2mSourcesResolveFromAFallback = stage2mCode.some((source) =>
    RESOLUTION_FALLBACK.test(source) || HOMEDIR_RESOLUTION.test(source));

  return {
    inheritedFloor: STAGE2L14_RELIABILITY_FLOOR,
    floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
    declaresOwnReliabilityFloor: declaresFloor,
    emitsActionFields,
    reassignsExpertFunctions: reassignsExpert,
    widensArbiterOracleSchema: widensArbiterSchema,
    importsExpertModules: editsExpertModules,
    resolverSearchesDirectories: searchesDirectories,
    resolverReadsHomeDirectory: readsHomeDirectory,
    resolverCarriesDeveloperPath: carriesDeveloperPath,
    resolverCarriesFallbackDefault: carriesFallbackDefault,
    repositoryRoot: repositoryRoot === null ? null : path.relative(root, repositoryRoot) || '.',
    repositoryScanAvailable,
    repositoryScanUnavailableReason,
    literalPathSurvivors: literalSurvivors,
    homeDirectoryAssumptionSurvivors: homedirSurvivors,
    hardcodedZeknovaPathSurvivors: hardcodedSurvivors,
    excludedByClassification: EXCLUDED_FROM_EXECUTION_PATHS.map(String),
    stage2mOwnSourcesExcludedFromTextScan: true,
    stage2mSourcesResolveFromAFallback,
    stage2mOwnSourceBasis: 'This stage\'s two sources quote the defect in prose and in the scan pattern, so a text search flags them by construction. They are checked for an actual resolution fallback instead, which is the property that matters.',
    disciplineHolds: !declaresFloor && !emitsActionFields && !reassignsExpert && !widensArbiterSchema
      && !editsExpertModules && !searchesDirectories && !readsHomeDirectory && !carriesDeveloperPath
      && !carriesFallbackDefault
      /* An unavailable scan is not a passed scan. It cannot block a --check,
       * which only re-derives a stored hash, but it blocks certification below. */
      && (repositoryScanAvailable ? hardcodedSurvivors.length === 0 : true)
      && !stage2mSourcesResolveFromAFallback
      && STAGE2L14_RELIABILITY_FLOOR === 0.99,
  };
}

const freeze = await measureFreeze();
const discipline = await measureDiscipline();

if (!freeze.allUnchanged) {
  console.error('STAGE2M_BLOCKED=true reason=FROZEN_OWNER_MUTATION_DETECTED');
  for (const owner of freeze.owners.filter((entry) => !entry.unchanged)) {
    console.error(`  ${owner.path}\n    expected ${owner.expected}\n    measured ${owner.measured}`);
  }
  process.exit(2);
}
if (!discipline.disciplineHolds) {
  console.error('STAGE2M_BLOCKED=true reason=PORTABILITY_STAGE_EXCEEDED_ITS_SCOPE');
  console.error(`  ${JSON.stringify(discipline, null, 2)}`);
  process.exit(2);
}
if (!discipline.repositoryScanAvailable && !checkOnly) {
  console.error('STAGE2M_BLOCKED=true reason=REPOSITORY_SCAN_UNAVAILABLE_NOT_A_GIT_CHECKOUT');
  console.error(`  ${discipline.repositoryScanUnavailableReason}`);
  console.error('  Certification asserts that no hardcoded runtime path survives anywhere in the');
  console.error('  repository. That assertion cannot be made from a tree the scan cannot read.');
  process.exit(2);
}

/* Stage 2L closure is asserted against the stored 2L.23 artifact, not against a
 * remembered number. A closure certificate built over a certification that no
 * longer reproduces would be a fiction. */
const readArtifact = async (relative) => JSON.parse(await readFile(path.join(root, relative), 'utf8'));
const stage2l23 = await readArtifact('artifacts/stage2l23-temporal-corpus-well-posedness/stage2l23-certification-result.json');
const baseline = {
  stage2l23CertificationHashMatches: stage2l23.certificationHash === STAGE2M_STAGE2L23_CERTIFICATION_HASH,
  stage2l23Certified: stage2l23.stage2l23Certified === true,
  stage2l23StatusPass: stage2l23.status === 'PASS',
  floorUnchanged: STAGE2L14_RELIABILITY_FLOOR === 0.99,
};
baseline.allBaselinesReproduced = Object.entries(baseline)
  .filter(([key]) => key !== 'allBaselinesReproduced').every(([, value]) => value === true);
if (!baseline.allBaselinesReproduced) {
  console.error('STAGE2M_BLOCKED=true reason=STAGE2L_CLOSURE_BASELINE_NOT_REPRODUCED');
  console.error(`  ${JSON.stringify(baseline, null, 2)}`);
  process.exit(2);
}

const closure = buildStage2LClosureCertificate({
  stage2l23CertificationHash: stage2l23.certificationHash,
  stage2l23CorpusDigest: stage2l23.corpusDigest,
  headLineage: 'ORACLE_V2_STAGE2L23_WELL_POSED_CORPUS',
});

/* -------------------------------------------------------------------------
 * Phases 1-7 — dependency inventory, root contract, path independence,
 * adversarial roots.
 * ----------------------------------------------------------------------- */

/* 28 workspace entry points carrying the literal Desktop fallback, plus the two
 * mainline shell entry points, plus integration/status.mjs and its os.homedir()
 * defaults. Counted as entry points that would not run on another machine. */
const HARDCODED_ZEKNOVA_PATHS_BEFORE = 31;
/* Pinned, and verified against the live scan whenever the scan can run. The
 * certified body may not depend on whether the tree it is verified from happens
 * to be a git checkout — that is the same class of hidden environment dependency
 * this stage exists to remove, and it would make the certification unverifiable
 * from the very bundle it ships in. */
const HARDCODED_ZEKNOVA_PATHS_AFTER = 0;
if (discipline.repositoryScanAvailable
  && discipline.hardcodedZeknovaPathSurvivors.length !== HARDCODED_ZEKNOVA_PATHS_AFTER) {
  console.error('STAGE2M_BLOCKED=true reason=HARDCODED_PATH_SURVIVOR_COUNT_DRIFTED');
  console.error(`  pinned ${HARDCODED_ZEKNOVA_PATHS_AFTER}, measured ${discipline.hardcodedZeknovaPathSurvivors.length}`);
  console.error(`  ${JSON.stringify(discipline.hardcodedZeknovaPathSurvivors, null, 2)}`);
  process.exit(2);
}
const dependencies = buildStage2MDependencyInventory({
  hardcodedBefore: HARDCODED_ZEKNOVA_PATHS_BEFORE,
  hardcodedAfter: HARDCODED_ZEKNOVA_PATHS_AFTER,
});

const rootContract = {
  defined: true,
  contractVersion: ZEKNOVA_ROOT_CONTRACT_VERSION,
  variable: ZEKNOVA_ROOT_ENV,
  statuses: ZEKNOVA_ROOT_STATUSES,
  structuralMarkers: ZEKNOVA_ROOT_MARKERS,
  markerCount: ZEKNOVA_ROOT_MARKERS.length,
  defaultValue: null,
  searchesFilesystem: discipline.resolverSearchesDirectories,
  readsHomeDirectory: discipline.resolverReadsHomeDirectory,
  failClosed: true,
  sourceHash: await sha256File('src/core/zeknova-root.js'),
  note: 'One variable, no default, no search. Structural validity (is this a ZekNova root) is decided separately from lineage identity (is it the certified one), because a resolver that answered both would refuse a legitimate root for having drifted.',
};

const pathIndependence = await measureStage2MPathIndependence();
const adversarial = await measureStage2MAdversarialRoots();

/* -------------------------------------------------------------------------
 * Phases 8/9 — the suite, measured rather than asserted.
 *
 * The suite is executed here as a subprocess with ZEKNOVA_ROOT explicitly unset.
 * That is the honest portable configuration: the ZekNova-dependent test must SKIP
 * with a named reason, not fail with an anonymous ENOENT, which is what it did
 * before this stage.
 * ----------------------------------------------------------------------- */

/* The suite result is PINNED, then re-verified.
 *
 * A number recorded once and never checked again is exactly the failure this arc
 * keeps catching, so the certify script re-runs the suite on every real
 * certification and refuses if the result has moved. But the pinned values — not
 * the live ones — go into the certification body, so `--check` reproduces the
 * hash byte-identically without paying for a second full suite run, and so the
 * hash does not silently depend on the machine that produced it. */
const MEASURED_SUITE = {
  command: 'node --test (ZEKNOVA_ROOT unset)',
  passing: 1257,
  failing: 0,
  skipped: 1,
  todo: 0,
  zeknovaDependentSkipObserved: true,
  measuredAt: '2026-09-04',
};

/* One platform, several invocation roots and several runtime roots. Pinned for
 * the same reason: a certification hash that changed with the Node patch version
 * of whoever ran it would not be a certification. */
const MEASURED_PLATFORMS = [
  { platform: 'linux', arch: 'x64', nodeVersion: 'v22.22.2', measuredAt: '2026-09-04' },
];

async function runSuiteWithoutZeknova() {
  const env = { ...process.env };
  delete env[ZEKNOVA_ROOT_ENV];
  let stdout = '';
  let exitCode = 0;
  try {
    ({ stdout } = await execFileAsync('node', ['--test'], { cwd: root, env, maxBuffer: 128 * 1024 * 1024 }));
  } catch (error) {
    stdout = error.stdout ?? '';
    exitCode = error.code ?? 1;
  }
  const field = (name) => {
    const match = new RegExp(`^# ${name} (\\d+)$`, 'm').exec(stdout);
    return match ? Number(match[1]) : null;
  };
  return {
    command: MEASURED_SUITE.command,
    exitCode,
    passing: field('pass'),
    failing: field('fail'),
    skipped: field('skipped'),
    todo: field('todo'),
    /* The whole point of the repair: the ZekNova-dependent test must now say why
     * it is not running, rather than die on a path that does not exist. */
    zeknovaDependentSkipObserved: /ZEKNOVA_ROOT not bound/.test(stdout),
  };
}

if (!checkOnly) {
  const live = await runSuiteWithoutZeknova();
  const drifted = ['passing', 'failing', 'skipped', 'todo', 'zeknovaDependentSkipObserved']
    .filter((key) => live[key] !== MEASURED_SUITE[key]);
  if (drifted.length > 0) {
    console.error('STAGE2M_BLOCKED=true reason=SUITE_MEASUREMENT_DRIFTED');
    console.error(`  drifted fields: ${drifted.join(', ')}`);
    console.error(`  pinned  ${JSON.stringify(MEASURED_SUITE)}`);
    console.error(`  measured ${JSON.stringify(live)}`);
    process.exit(2);
  }
}

/* Cheap, real, and NOT a platform claim: the whole measurement block is re-run
 * from a different working directory. A repository that behaved differently
 * depending on where it was invoked from would not be portable no matter how
 * clean its paths looked. */
async function measureInvocationIndependence() {
  const script = [
    "import { createHash } from 'node:crypto';",
    `import * as M from ${JSON.stringify(path.join(root, 'src/lab/stage2m-portability-and-qualification-readiness.js'))};`,
    'const h = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex");',
    'process.stdout.write(JSON.stringify({',
    '  pathIndependence: h(await M.measureStage2MPathIndependence()),',
    '  adversarial: h(await M.measureStage2MAdversarialRoots()),',
    '  dryRun: h(await M.runStage2MShadowDryRun()),',
    '}));',
  ].join('\n');
  const scriptDir = await import('node:fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), 'stage2m-cwd-')));
  const scriptPath = path.join(scriptDir, 'probe.mjs');
  await writeFile(scriptPath, script);
  const runFrom = async (cwd) => JSON.parse((await execFileAsync('node', [scriptPath], { cwd })).stdout);
  const fromRepository = await runFrom(root);
  const fromElsewhere = await runFrom(os.tmpdir());
  const identical = JSON.stringify(fromRepository) === JSON.stringify(fromElsewhere);
  return {
    invocationDirectories: ['<repository root>', '<system temp>'],
    measurements: fromRepository,
    identical,
    claim: identical ? 'MULTI_ROOT_SAME_PLATFORM_CERTIFIED' : 'INVOCATION_DEPENDENT',
    note: 'One platform, several invocation roots. This is NOT a multi-platform claim and must never be reported as one; no second operating system was available to this run.',
  };
}

const invocation = await measureInvocationIndependence();
if (!invocation.identical) {
  console.error('STAGE2M_BLOCKED=true reason=INVOCATION_DEPENDENT_BEHAVIOUR');
  process.exit(2);
}

const livePlatform = { platform: process.platform, arch: process.arch, nodeVersion: process.version };
const platformRecorded = MEASURED_PLATFORMS.some((entry) =>
  entry.platform === livePlatform.platform && entry.arch === livePlatform.arch && entry.nodeVersion === livePlatform.nodeVersion);
if (!platformRecorded) {
  console.error('STAGE2M_BLOCKED=true reason=PLATFORM_NOT_RECORDED');
  console.error(`  running on ${JSON.stringify(livePlatform)}, which is not in MEASURED_PLATFORMS.`);
  console.error('  Extend the pin deliberately after inspecting the result. Widening a portability');
  console.error('  claim must be an act, not a side effect of running the script somewhere new.');
  process.exit(2);
}

const suite = {
  withoutZeknova: MEASURED_SUITE,
  failing: MEASURED_SUITE.failing,
  passing: MEASURED_SUITE.passing,
  skipped: MEASURED_SUITE.skipped,
  gameAgnosticPortable: MEASURED_SUITE.failing === 0,
  zeknovaDependentFailureExplicit: MEASURED_SUITE.zeknovaDependentSkipObserved === true && MEASURED_SUITE.skipped >= 1,
  /* Not measured, and not quietly asserted. A fixture root is not a ZekNova
   * runtime; running the suite against one and calling the result "the full suite
   * with a valid root" would be exactly the overclaim this stage forbids. */
  fullSuiteWithValidRootPass: null,
  fullSuiteWithValidRootBasis: 'NOT_MEASURED_NO_ZEKNOVA_RUNTIME_REACHABLE_IN_THIS_ENVIRONMENT',
  invocationIndependence: invocation,
  note: 'Before this stage the ZekNova-dependent test failed on a missing developer path. It now skips with a named reason. A skip that says why is a measurement; a failure that says ENOENT is not.',
};

/* -------------------------------------------------------------------------
 * Phases 10/11/12 — lineage, contract compatibility, shadow dry run.
 * ----------------------------------------------------------------------- */

const predecessorBaseline = await readArtifact('artifacts/r0-runtime-identity/baseline-manifest.json');
const predecessorIdentity = await readArtifact('artifacts/r0-runtime-identity/canonical-runtime-identity.json');

const lineage = await measureStage2MCurrentLineage({
  predecessorBaseline, predecessorIdentity, sentinelRoot: root,
});
const contract = await measureStage2MContractCompatibility();
const dryRun = await runStage2MShadowDryRun();

const portabilityStatus = {
  claim: invocation.claim,
  multiPlatformCertified: false,
  platformsMeasured: MEASURED_PLATFORMS,
  distinctPlatformCount: new Set(MEASURED_PLATFORMS.map((entry) => entry.platform)).size,
  inheritedLimitation: 'DIGEST_PRODUCED_SINGLE_PLATFORM',
  inheritedLimitationRemediated: false,
  note: 'MULTI_ROOT_SAME_PLATFORM_CERTIFIED. The repository is invocation-independent and root-independent on this platform. No second operating system was reachable, so the inherited DIGEST_PRODUCED_SINGLE_PLATFORM limitation is carried forward unchanged rather than closed. Environment independence and platform diversity are different claims and this stage only earned the first.',
};

const readiness = evaluateStage2MReadiness({
  portability: {
    contentIdentityPathIndependent: pathIndependence.contentIdentityPathIndependent,
    hardcodedZeknovaPathRemoved: dependencies.hardcodedZeknovaPathRemoved,
    invalidRootFailsClosed: adversarial.allBehaveAsSpecified && adversarial.wrongRepositoryNeverBinds,
    zeknovaRootContractDefined: rootContract.defined,
  },
  suite,
  lineage,
  contract,
  dryRun,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});

/* -------------------------------------------------------------------------
 * Phase 14 — the lean bundle, audited rather than rebuilt.
 * ----------------------------------------------------------------------- */

/* The delivered bundle is a BUILD PRODUCT, not a repository artifact, so it is
 * audited from recorded measurements rather than re-derived. The finding matters:
 * it was built before this stage and therefore carries the defect this stage
 * removed. It is left byte-identical — overwriting the artifact a certification
 * refers to would destroy the thing being certified — and a rebuild, if wanted,
 * is a new file under a new name. */
const LEAN_BUNDLE_AUDIT = {
  artifactName: 'sentinel-grid-2l19-production-lean-91ec243.zip',
  isRepositoryArtifact: false,
  sha256: '7ec6fa1ef8d865dd429ba22541068d441d3096926e6c4eca6a8381645440b6f9',
  bytes: 5940264,
  fileCount: 1508,
  pinnedCommit: '91ec243',
  auditedAt: '2026-09-04',
};
/* Pinned, like the suite and the platform list, and for the same reason: a
 * certification body that could only be re-derived inside a git checkout would
 * not reproduce from the very bundle this section is about. */
const LEAN_BUNDLE_COMMITS_BEHIND_AT_AUDIT = 4;
const leanBundle = {
  ...LEAN_BUNDLE_AUDIT,
  commitsBehindHeadAtAudit: LEAN_BUNDLE_COMMITS_BEHIND_AT_AUDIT,
  currentWithRespectToHead: LEAN_BUNDLE_COMMITS_BEHIND_AT_AUDIT === 0 ? 'CURRENT' : 'STALE_PINNED_TO_AN_EARLIER_COMMIT',
  /* The audit finding. Not a footnote: the bundle predates the portability
   * repair, so anyone unpacking it on a machine that is not the build machine
   * gets the original ENOENT. */
  containsHardcodedZeknovaPath: true,
  filesCarryingHardcodedZeknovaPath: 33,
  carriesPortabilityDefectRepairedByThisStage: true,
  rebuiltByThisStage: false,
  overwritten: false,
  impliesProductionAuthority: false,
  authorityOfBundledSystem: 'R0_ADVISORY_ONLY',
  recommendation: 'Rebuild as a NEW artifact pinned to this stage if a portable bundle is wanted. Do not overwrite the 2L.19 bundle: it is the object an earlier delivery refers to.',
  note: '"Lean" describes packaging, not authority. The bundled system is R0 advisory-only, confers no dispatch capability, and shipping it does not promote anything.',
};

const evaluation = {
  closure, dependencies, rootContract, pathIndependence, adversarial,
  lineage, contract, dryRun, suite, portabilityStatus, readiness, leanBundle,
};
const certification = certifyStage2M({ evaluation });

for (const [condition, reason] of [
  [freeze.allUnchanged, 'FROZEN_OWNER_MUTATION_DETECTED'],
  [discipline.disciplineHolds, 'SCOPE_FENCE_BREACHED'],
  [certification.authority === 'R0' && certification.canDispatch === false && certification.canMutateLiveWorld === false, 'AUTHORITY_BOUNDARY_VIOLATED'],
  [certification.freeze.nexusChanged === false && certification.freeze.oracleChanged === false && certification.freeze.arbiterChanged === false, 'REASONING_CHANGED_BY_A_PORTABILITY_STAGE'],
  [portabilityStatus.multiPlatformCertified === false, 'MULTI_PLATFORM_OVERCLAIM'],
  [!(certification.stage2mOutcome === 'A_PORTABLE_AND_LIVE_QUALIFICATION_READY' && !lineage.measured), 'LIVE_READINESS_CLAIMED_WITHOUT_A_MEASURED_LINEAGE'],
  [leanBundle.overwritten === false, 'LEAN_BUNDLE_OVERWRITTEN'],
]) {
  if (!condition) { console.error(`STAGE2M_BLOCKED=true reason=${reason}`); process.exit(2); }
}

if (checkOnly) {
  const stored = await readArtifact('artifacts/stage2m-portability-and-qualification-readiness/stage2m-certification-result.json');
  const match = stored.certificationHash === certification.certificationHash;
  console.log(JSON.stringify({
    check: 'STAGE2M_CERTIFICATION', reproduced: match,
    storedHash: stored.certificationHash, recomputedHash: certification.certificationHash,
  }, null, 2));
  process.exit(match ? 0 : 1);
}

await mkdir(artifactRoot, { recursive: true });
const write = async (name, value) =>
  writeFile(path.join(artifactRoot, name), `${JSON.stringify(value, null, 2)}\n`);

await write('stage2l-closure-certificate.json', closure);
await write('stage2m-certification-result.json', certification);
await write('stage2m-environment-dependency-inventory.json', {
  classes: STAGE2M_DEPENDENCY_CLASSES,
  declared: STAGE2M_ENVIRONMENT_DEPENDENCIES,
  ...dependencies,
});
await write('stage2m-zeknova-root-contract.json', rootContract);
await write('stage2m-runtime-lineage-manifest.json', {
  historicalBaselineEntries: predecessorBaseline.inventory.length,
  historicalRuntimeOwner: lineage.historicalRuntimeOwner,
  historicalGeneratedRuntimeProvenanceId: lineage.historicalGeneratedRuntimeProvenanceId,
  contentAddressed: true,
  pathIndependentByConstruction: true,
  note: 'The manifest hashes file BYTES. It records where a file was found only as a domain label, never as an absolute path, which is why two identical trees at unrelated roots produce one identity.',
});
await write('stage2m-path-independence-analysis.json', pathIndependence);
await write('stage2m-portability-evaluation.json', {
  rootContract, dependencies, adversarialRoots: adversarial,
  pathIndependence, suite, portabilityStatus,
});
await write('stage2m-current-lineage-comparison.json', { lineageClasses: STAGE2M_LINEAGE_CLASSES, ...lineage });
await write('stage2m-contract-compatibility.json', { surfaces: STAGE2M_CONTRACT_SURFACES, ...contract });
await write('stage2m-shadow-readiness-dry-run.json', dryRun);
await write('stage2m-qualification-readiness.json', {
  ...readiness,
  currentLineageLiveQualificationReady: readiness.currentLineageLiveQualificationReady,
  liveQualificationAuthorised: false,
  authorisationNote: 'Live qualification is not authorised and was not begun. Three of its gates cannot be evaluated in an environment with no reachable ZekNova runtime, and an unevaluated gate is not a passed gate.',
});
await write('stage2m-security-regression.json', {
  frozenOwners: freeze,
  discipline,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  dispatchProbeRefused: dryRun.dispatchRefused,
  refusalErrorName: dryRun.refusalErrorName,
  liveActionDispatches: 0,
  worldMutations: 0,
  authorityEscalations: 0,
  evidenceProtectionsWeakened: false,
  reliabilityFloor: STAGE2L14_RELIABILITY_FLOOR,
  pass: freeze.allUnchanged && discipline.disciplineHolds && dryRun.dispatchRefused,
});
await write('stage2m-lean-bundle-audit.json', leanBundle);

const report = [
  '# Stage 2M — portability, environment independence and qualification readiness',
  '',
  `Status: **${certification.status}** · Outcome: **${certification.stage2mOutcome}** · Authority: R0 (advisory only)`,
  '',
  '## What this stage changed, and what it deliberately did not',
  '',
  'It changed how the repository **finds** its runtime. It changed nothing about how',
  'the repository **reasons**. Every frozen owner — both experts, Prime, the',
  'authority core, and every Stage 2L lab module — is byte-identical, and the',
  'certify script exits 2 rather than proceed if any of them moves.',
  '',
  '## The defect',
  '',
  `${HARDCODED_ZEKNOVA_PATHS_BEFORE} entry points would not run on a machine other than the one they were`,
  'written on, in two shapes.',
  '',
  '**28 workspace entry points** resolved the runtime as',
  '`process.env.ZEKNOVA_ROOT || \'/Users/<developer>/Desktop/zeknova-shared-gaming-experience\'`.',
  'On the machine where that path exists, everything worked. Anywhere else the',
  'fallback silently produced a path that did not exist, and the failure surfaced as',
  'an anonymous `ENOENT` several layers away from its cause. A missing dependency was',
  'being reported as a broken file read.',
  '',
  '**Three repository entry points** carried the same assumption in a form no',
  'literal-path search finds: two mainline shell scripts hardcoded absolute paths',
  'for *both* repositories, and `integration/status.mjs` defaulted both roots to',
  '`os.homedir()/Desktop/...`. That last one is the more dangerous shape, because it',
  'reads as a default rather than as a machine assumption — it is why the certify',
  'script now scans for `homedir()` as well as for the literal path.',
  '',
  `Survivors on execution paths after this stage: **${HARDCODED_ZEKNOVA_PATHS_AFTER}**.`,
  'Recorded install markers, prose and stale scratch are excluded by declared',
  'classification, not by oversight; each exclusion is listed in the dependency',
  'inventory with a reason.',
  '',
  '## The contract',
  '',
  `\`${ZEKNOVA_ROOT_ENV}\` (${ZEKNOVA_ROOT_CONTRACT_VERSION}) — one variable, no default,`,
  `no search, ${ZEKNOVA_ROOT_MARKERS.length} structural markers, ${ZEKNOVA_ROOT_STATUSES.length} named statuses.`,
  '',
  'Portability here does **not** mean accepting whatever runtime happens to be',
  'lying around. The resolver never walks the filesystem, never reads a home',
  'directory and never falls back. The certify script scans the resolver source for',
  'all three and refuses to certify if it finds them, because a resolver that',
  'searched would pass every behavioural test while reintroducing the defect.',
  '',
  '### Adversarial roots',
  '',
  '| case | declared | status | outcome |',
  '| --- | --- | --- | --- |',
  ...adversarial.cases.map((entry) =>
    `| \`${entry.id}\` | ${entry.declared === null ? '_unset_' : `\`${entry.declared}\``} | \`${entry.status}\` | ${entry.bound ? 'bound' : 'refused'} |`),
  '',
  `All ${adversarial.caseCount} behaved as specified. Six refused, two bound. The`,
  'decoy — the right directory shape with one marker missing — never binds, and no',
  'case reaches a raw `ENOENT`.',
  '',
  '## Path independence',
  '',
  'Two byte-identical trees at unrelated roots, one nested three deep with a space',
  'in its name, produce **one** identity:',
  '',
  `- \`${pathIndependence.contentIdentityA}\` (root A)`,
  `- \`${pathIndependence.contentIdentityB}\` (root B, nested, contains a space)`,
  `- \`${pathIndependence.contentIdentityC}\` (root C, one byte changed)`,
  '',
  'Both halves are load-bearing and neither is sufficient alone. A constant would',
  'pass the first test; a path-dependent digest would pass the second. Only a',
  'content-addressed identity passes both.',
  '',
  '## What was NOT measured',
  '',
  'No ZekNova runtime is reachable from this environment. Three phases therefore',
  'report `NOT_MEASURED`, not `PASS`:',
  '',
  '| phase | result | why |',
  '| --- | --- | --- |',
  `| current lineage | \`${lineage.classification}\` (${lineage.classificationBasis}) | ${lineage.reason} |`,
  `| observation contract | ${contract.allCompatible === null ? '`NOT_MEASURED`' : contract.allCompatible} | ${contract.reason} |`,
  '| full suite with a valid root | `NOT_MEASURED` | a fixture root is not a runtime |',
  '',
  'The machinery for all three is built and exercised against fixtures; it is the',
  'runtime that is absent, not the capability. A lineage classification produced',
  'without reading the runtime would be a guess wearing a certification label.',
  '',
  '## Readiness',
  '',
  '| gate | result |',
  '| --- | --- |',
  ...Object.entries(readiness.gates).map(([gate, value]) => `| \`${gate}\` | ${value === true ? '✅ pass' : '⛔ blocked'} |`),
  '',
  `\`CURRENT_LINEAGE_LIVE_QUALIFICATION_READY=${readiness.currentLineageLiveQualificationReady}\`.`,
  'Live qualification was **not** begun.',
  '',
  '## Portability claim',
  '',
  `**${portabilityStatus.claim}** — and specifically not \`MULTI_PLATFORM_CERTIFIED\`.`,
  '',
  `Measured on ${portabilityStatus.platformsMeasured.map((entry) => `${entry.platform}/${entry.arch} ${entry.nodeVersion}`).join(', ')}`,
  'across multiple invocation directories and multiple runtime roots. No second',
  'operating system was available to this run, so the inherited',
  '`DIGEST_PRODUCED_SINGLE_PLATFORM` limitation is carried forward unchanged.',
  'Environment independence and platform diversity are different claims, and this',
  'stage earned only the first.',
  '',
  '## Shadow dry run',
  '',
  `Adapter \`${dryRun.adapterId}\`, observer \`${dryRun.observerId}\`, ${dryRun.legalActionCount} legal actions,`,
  `recommendation \`${dryRun.recommendationHash.slice(0, 16)}…\`, replay reproduced: ${dryRun.replayReproduced}.`,
  '',
  `Dispatches ${dryRun.dispatches}, world mutations ${dryRun.worldMutations}, authority tokens ${dryRun.authorityTokensIssued}.`,
  `The dispatch path was actually invoked and refused with \`${dryRun.refusalErrorName}\` — a`,
  'zero that was never attempted would prove nothing about what happens when it is.',
  '',
  '## The delivered lean bundle',
  '',
  `\`${leanBundle.artifactName}\` is pinned to \`${leanBundle.pinnedCommit}\`, **${leanBundle.commitsBehindHeadAtAudit} commits behind** the head it was audited against,`,
  `and **carries the defect this stage removed** in ${leanBundle.filesCarryingHardcodedZeknovaPath} files. Unpacked on any machine but the`,
  'build machine it fails in exactly the way this stage exists to stop.',
  '',
  'It is left byte-identical. Overwriting the artifact an earlier delivery refers',
  'to would destroy the object being certified; a portable bundle is a **new** file',
  'under a new name. "Lean" describes packaging, not authority — the bundled system',
  'is R0 advisory-only and shipping it promotes nothing.',
  '',
  '## Stage 2L closure',
  '',
  `Stage 2L is **CLOSED** at 2L.23 (\`${closure.finalCertificationHash.slice(0, 16)}…\`):`,
  `${closure.passCount} passing stages, ${closure.failCount} failing, ${closure.ownedLimitations.length} owned limitations carried forward.`,
  'No historical certification was restated, reinterpreted or modified.',
  '',
  `Certification hash: \`${certification.certificationHash}\``,
  '',
].join('\n');
await writeFile(path.join(artifactRoot, 'stage2m-report.md'), `${report}\n`);

console.log(JSON.stringify({
  stage: STAGE2M_STAGE,
  status: certification.status,
  outcome: certification.stage2mOutcome,
  stage2lClosed: certification.stage2lClosed,
  hardcodedZeknovaPathRemoved: certification.hardcodedZeknovaPathRemoved,
  contentIdentityPathIndependent: certification.contentIdentityPathIndependent,
  invalidRootFailsClosed: certification.invalidRootFailsClosed,
  gameAgnosticSuitePortable: certification.gameAgnosticSuitePortable,
  zeknovaDependentFailureExplicit: certification.zeknovaDependentFailureExplicit,
  currentZeknovaLineageIdentified: certification.currentZeknovaLineageIdentified,
  shadowReadinessDryRunPass: certification.shadowReadinessDryRunPass,
  portabilityClaim: portabilityStatus.claim,
  currentLineageLiveQualificationReady: readiness.currentLineageLiveQualificationReady,
  readinessBlockers: readiness.blockers,
  certificationHash: certification.certificationHash,
}, null, 2));
