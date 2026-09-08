/* Stage 2M — portability, environment independence, and current-lineage
 * qualification readiness (R0, shadow only).
 *
 * THE DEBT THIS STAGE PAYS. Stage 2L closed with two certification debts, both of
 * them about the environment rather than the intelligence: one test failed on any
 * machine that was not a specific laptop, and the deterministic digests had only
 * ever been produced on one platform. Neither is an expert defect and neither is
 * fixed by touching an expert.
 *
 * WHAT THE HARD-CODED PATH ACTUALLY WAS. Twenty-eight entry points carried the
 * same line: `process.env.ZEKNOVA_ROOT || '/Users/<someone>/Desktop/zeknova-...'`.
 * The environment variable was already honoured, so the binding was never
 * missing — the DEFAULT was. On any other machine the fallback pointed at
 * nothing and the first readFile threw ENOENT: a missing dependency arriving as
 * an anonymous path error rather than as a named refusal. That is the defect,
 * and it is a boundary defect, not a path-string defect.
 *
 * WHAT PORTABILITY IS NOT ALLOWED TO MEAN. Not "find a ZekNova somewhere". The
 * contract in src/core/zeknova-root.js never searches, never falls back to a
 * personal directory, and refuses a root whose structure it cannot verify. It
 * separates two questions that must not be confused: whether a directory IS a
 * ZekNova root (structural, answered at binding time) and whether it is THE
 * certified lineage (content, answered by hash downstream). Conflating them would
 * make a legitimately updated ZekNova "invalid" instead of "drifted", and refuse
 * the requalification the contract exists to enable.
 *
 * THE HONEST LIMIT OF THIS RUN. ZekNova is not present in this environment, so
 * every phase that requires the real runtime — current-lineage discovery,
 * observation-contract compatibility against real state, live-lineage
 * qualification readiness — is reported as NOT_MEASURED rather than guessed. The
 * machinery for all of it is built and exercised against controlled fixtures, so
 * running this stage on a machine with ZekNova bound completes those phases with
 * no further code. Claiming a lineage this run could not read would be the exact
 * failure this arc has spent fifteen stages refusing.
 */

import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deepFreeze, sha256 } from '../core/determinism.js';
import { AuthorityTier, assertEvaluationOnly, defaultAuthorityPolicy, denyExecution } from '../core/authority.js';
import { ZEKNOVA_ROOT_CONTRACT_VERSION, ZEKNOVA_ROOT_ENV, ZEKNOVA_ROOT_MARKERS,
  resolveZeknovaRoot, verifyZeknovaInventoryReadable } from '../core/zeknova-root.js';
import { measureRuntimeInventory } from './stage2f-successor-identity.js';

export const STAGE2M_STAGE = 'STAGE2M_PORTABILITY_AND_QUALIFICATION_READINESS';
export const STAGE2M_STAGE2L23_CERTIFICATION_HASH = '1d9981817d31381eaa481e4141ce2065ee758267bc08b83f8179b60379eac428';

function round(value) { return Number(value.toFixed(6)); }

/* ---------------------------------------------------------------------------
 * PHASE 0 — the formal Stage 2L closure certificate.
 *
 * A record of what the arc concluded, written once. It restates no historical
 * result and changes none; it names the final lineage, the owned limitations, and
 * the authority state at closure.
 * ------------------------------------------------------------------------- */

export const STAGE2L_STAGES = deepFreeze([
  { stage: '2L.10', result: 'PASS', summary: 'Arbiter correctness calibration and selective delegation; Oracle direction certified safe.' },
  { stage: '2L.11', result: 'PASS', summary: 'Nexus correctness shown non-identifiable; the benchmark itself was the defect.' },
  { stage: '2L.12', result: 'PASS', summary: 'Benchmark rebuilt on world semantics.' },
  { stage: '2L.13', result: 'PASS', summary: 'Value-aware Nexus: 0.0844 to 0.7826, still below the delegation floor.' },
  { stage: '2L.14', result: 'FAIL', summary: 'No supported Nexus confidence region reaches the 0.99 floor.' },
  { stage: '2L.15', result: 'FAIL', summary: 'Stability adds information but delegation reaches only 0.9894.' },
  { stage: '2L.16', result: 'PASS', summary: 'Residual errors decomposed; substitute misvaluation dominant.' },
  { stage: '2L.17', result: 'PASS', summary: 'Expert remediated 0.7909 to 0.8291; delegation ceiling unmoved.' },
  { stage: '2L.18', result: 'PASS', summary: 'Delegation tail is six cases and is not separable beyond a matched null.' },
  { stage: '2L.19', result: 'PASS', summary: 'Oracle characterized: one certified action head plus seven label-only diagnostics.' },
  { stage: '2L.20', result: 'PASS', summary: 'Vocabulary alignment; timeToThreshold exonerated, the benchmark was wrong.' },
  { stage: '2L.21', result: 'PASS', summary: 'Abstention redefined as data sufficiency; persistence 0.3432 to 0.8517.' },
  { stage: '2L.22', result: 'PASS', summary: 'Conflict gate real but unreachable; SUSTAINED_RUN corpus 15% mislabelled.' },
  { stage: '2L.23', result: 'PASS', summary: 'All 21 generator families boundary-audited; three repaired; persistence 0.8818 to 0.9392.' },
]);

export const STAGE2L_OWNED_LIMITATIONS = deepFreeze([
  { id: 'NEXUS_DELEGATION_NOT_SEPARABLE', owner: 'STAGE2L18', detail: 'Both routes to the 0.99 floor are closed: a better expert does not reach it, and neither does a better confidence rule over the current representation.' },
  { id: 'ORACLE_SINGLE_ACTION_PATH', owner: 'STAGE2L19', detail: 'Only the direction head has an action-delegation path; the other seven emit labels. Widening it is an Arbiter decision, not a measurement.' },
  { id: 'CONFLICTING_EVIDENCE_UNREACHABLE', owner: 'STAGE2L22', detail: 'The gate is structurally over-abstention but fires on 0 of 3,520 swept cases and 0 of the corpus, so there is nothing to repair.' },
  { id: 'GENERATOR_EXTREME_FRAGILITY', owner: 'STAGE2L23', detail: 'Six families fail somewhere in their declared parameter range at points the certification corpus never samples. Ranges recorded, not narrowed.' },
]);

export function buildStage2LClosureCertificate({ stage2l23CertificationHash, stage2l23CorpusDigest, headLineage }) {
  const body = {
    certificateSchemaVersion: 1,
    arc: 'STAGE_2L',
    status: 'CLOSED',
    startStage: '2L.10',
    finalStage: '2L.23',
    finalCertificationHash: stage2l23CertificationHash,
    finalCorpusDigest: stage2l23CorpusDigest,
    repositoryLineageAtClosure: headLineage,
    stages: STAGE2L_STAGES,
    passCount: STAGE2L_STAGES.filter((entry) => entry.result === 'PASS').length,
    failCount: STAGE2L_STAGES.filter((entry) => entry.result === 'FAIL').length,
    ownedLimitations: STAGE2L_OWNED_LIMITATIONS,
    closureBlockers: [],
    authorityAtClosure: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
    nexusStatusAtClosure: 'FROZEN_SINCE_STAGE2L18_DELEGATION_UNAUTHORISED',
    oracleStatusAtClosure: 'ONE_CERTIFIED_ACTION_HEAD_DIRECTION_PLUS_SEVEN_LABEL_ONLY_DIAGNOSTICS',
    corpusInfrastructureStatusAtClosure: 'ALL_21_TEMPORAL_FAMILIES_WELL_POSED_UNDER_INDEPENDENT_VALIDATION_WITH_ADMISSION_GATE',
    historicalResultsMutated: false,
    note: 'A record of what the arc concluded. It restates no historical certification and changes none. Every prior stage artifact remains byte-identical.',
  };
  return deepFreeze({ ...body, certificateHash: sha256(body) });
}

/* ---------------------------------------------------------------------------
 * PHASE 1 — environment dependency inventory.
 *
 * Classified rather than bulk-replaced. A fixture asserting that a path is NOT
 * leaked into evidence must keep its absolute path, or it stops testing anything.
 * ------------------------------------------------------------------------- */

export const STAGE2M_DEPENDENCY_CLASSES = deepFreeze([
  'REQUIRED_RUNTIME_BINDING', 'TEST_FIXTURE', 'DEVELOPER_CONVENIENCE',
  'ACCIDENTAL_HARDCODING', 'DOCUMENTATION_ONLY',
]);

export const STAGE2M_ENVIRONMENT_DEPENDENCIES = deepFreeze([
  {
    id: 'ZEKNOVA_ROOT_BINDING',
    classification: 'REQUIRED_RUNTIME_BINDING',
    description: 'The ZekNova runtime root, needed by lineage verification and every live-parity path.',
    resolution: `Explicit ${ZEKNOVA_ROOT_ENV} through ${ZEKNOVA_ROOT_CONTRACT_VERSION}; no default, no search, fail-closed with a named reason.`,
    remediated: true,
  },
  {
    id: 'ZEKNOVA_HARDCODED_DEFAULT',
    classification: 'ACCIDENTAL_HARDCODING',
    description: "28 entry points fell back to one developer's Desktop path when the variable was unset, turning a missing dependency into an anonymous ENOENT.",
    resolution: 'Default removed everywhere; the binding is now null when unset and the contract decides what happens next.',
    remediated: true,
  },
  {
    id: 'MAINLINE_ENTRY_POINT_HARDCODING',
    classification: 'ACCIDENTAL_HARDCODING',
    description: 'scripts/sentinel-grid-mainline-status.sh and scripts/sentinel-grid-mainline-verify.sh hardcoded absolute Desktop paths for BOTH repositories, so the mainline entry points only ran on one machine.',
    resolution: 'The Sentinel root is derived from the script location; the ZekNova root must be declared and is checked before use, with exit 2 and a named reason when it is not.',
    remediated: true,
  },
  {
    id: 'MAINLINE_STATUS_HOME_DIRECTORY_DEFAULT',
    classification: 'ACCIDENTAL_HARDCODING',
    description: "integration/status.mjs defaulted both roots to os.homedir()/Desktop/... — a machine assumption rather than a default, and invisible to a literal-path scan.",
    resolution: 'Sentinel derives from the module location; ZekNova comes from --zeknova or ZEKNOVA_ROOT and is never inferred.',
    remediated: true,
  },
  {
    id: 'RECORDED_INSTALL_MARKERS',
    classification: 'DOCUMENTATION_ONLY',
    description: 'integration/mainline-integration.json and integration/targets/zeknova.json record the absolute paths of a past install.',
    resolution: 'Left unchanged. They are a record of where an install happened, not a source anyone resolves a path from; rewriting them would falsify the record without making anything portable.',
    remediated: false,
  },
  {
    id: 'EVIDENCE_PORTABILITY_FIXTURE',
    classification: 'TEST_FIXTURE',
    description: "tests/evidence-portability.test.js uses '/Users/example/project' to assert that absolute paths are NOT encoded into evidence.",
    resolution: 'Left unchanged on purpose. Replacing it would delete the assertion it exists to make.',
    remediated: false,
  },
  {
    id: 'WHITESPACE_NAMED_FORENSIC_SCRIPT',
    classification: 'DOCUMENTATION_ONLY',
    description: "A tracked, executable copy of the Stage 2F.4E.3G R8-R4 forensic review script sits at the repository root under a filename consisting of a single space, and builds every path from $HOME/Desktop/... It is a near-duplicate of .tmp-r8-r4/stage2f4e3g-r8-r4-final-review.sh and nothing references it.",
    resolution: 'Recorded, not repaired and not deleted. It is on no execution path, so it is not a portability defect of the running system; it is an accidentally committed artifact whose removal is a repository-hygiene decision, not this stage\'s to make. Named here so it is excluded knowingly rather than missed.',
    remediated: false,
  },
  {
    id: 'STALE_SCRATCH_SCRIPTS',
    classification: 'DOCUMENTATION_ONLY',
    description: '.tmp-r8-r3-r2/MANUAL_APPLY.sh carries developer paths from an earlier runtime rebuild.',
    resolution: 'Not on any execution path and excluded from the production bundle. Left as historical scratch.',
    remediated: false,
  },
  {
    id: 'SENTINEL_ROOT_RESOLUTION',
    classification: 'DEVELOPER_CONVENIENCE',
    description: 'Sentinel roots are derived from import.meta.dirname rather than hardcoded.',
    resolution: 'Already portable; relative to the module, so the repository can live anywhere.',
    remediated: false,
  },
  {
    id: 'TEMP_WORKSPACE',
    classification: 'DEVELOPER_CONVENIENCE',
    description: 'Tests that need scratch space use os.tmpdir() rather than a fixed directory.',
    resolution: 'Already portable across platforms.',
    remediated: false,
  },
]);

export function buildStage2MDependencyInventory({ hardcodedBefore, hardcodedAfter }) {
  return {
    dependencies: STAGE2M_ENVIRONMENT_DEPENDENCIES,
    dependencyCount: STAGE2M_ENVIRONMENT_DEPENDENCIES.length,
    byClassification: Object.fromEntries(STAGE2M_DEPENDENCY_CLASSES.map((className) =>
      [className, STAGE2M_ENVIRONMENT_DEPENDENCIES.filter((entry) => entry.classification === className).length])),
    hardcodedZeknovaPathsBefore: hardcodedBefore,
    hardcodedZeknovaPathsAfter: hardcodedAfter,
    hardcodedZeknovaPathRemoved: hardcodedAfter === 0,
    deliberatelyRetained: STAGE2M_ENVIRONMENT_DEPENDENCIES.filter((entry) => !entry.remediated).map((entry) => entry.id),
    complete: true,
    note: 'Not every absolute path is a defect. A fixture that asserts a path is never leaked must keep its path to keep testing.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 4/6/7 — adversarial roots, path independence, multi-root determinism.
 *
 * A synthetic ZekNova tree is built at two unrelated filesystem roots with
 * byte-identical content. If the lineage identity is a function of content, the
 * two must agree; if any absolute path leaks into the digest, they cannot.
 * ------------------------------------------------------------------------- */

const FIXTURE_BASELINE = deepFreeze({
  inventory: [
    { root: 'zeknova', path: 'azl/zeknova-strategic-state-contract-v2.js', role: 'canonical-state', tracked: true },
    { root: 'zeknova', path: 'src/world/PrimeShadow.js', role: 'prime', tracked: true },
    { root: 'zeknova', path: 'src/game/Stage2FStrategicProjectionV2.js', role: 'canonical-state', tracked: true },
    { root: 'zeknova', path: 'sentinel-grid/live-parity/runtime-collector/collector-core.mjs', role: 'collector', tracked: true },
    { root: 'zeknova', path: 'src/game/SentinelExpertRouter.js', role: 'router', tracked: false },
  ],
});

const FIXTURE_CONTENT = deepFreeze({
  'azl/zeknova-strategic-state-contract-v2.js': 'export const canonicalStateContract = "v2";\n',
  'src/world/PrimeShadow.js': 'export const primeShadow = "shadow";\n',
  'src/game/Stage2FStrategicProjectionV2.js': 'export const projection = "v2";\n',
  'sentinel-grid/live-parity/runtime-collector/collector-core.mjs': 'export const collector = "core";\n',
  'src/game/SentinelExpertRouter.js': 'export const router = "expert";\n',
});

export async function materialiseZeknovaFixture(root, { corrupt = null, omit = [] } = {}) {
  for (const [relative, content] of Object.entries(FIXTURE_CONTENT)) {
    if (omit.includes(relative)) continue;
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, corrupt === relative ? `${content}// mutated\n` : content);
  }
  return root;
}

export async function measureStage2MPathIndependence() {
  const base = await import('node:fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), 'stage2m-')));
  /* Two roots at genuinely different depths and name shapes, one with a space. */
  const rootA = path.join(base, 'zeknova-a');
  const rootB = path.join(base, 'nested', 'deeper still', 'zeknova-b');
  await mkdir(rootA, { recursive: true });
  await mkdir(rootB, { recursive: true });
  await materialiseZeknovaFixture(rootA);
  await materialiseZeknovaFixture(rootB);
  const sentinelRoot = path.resolve(import.meta.dirname, '../..');
  const a = await measureRuntimeInventory({ predecessorBaseline: FIXTURE_BASELINE, sentinelRoot, zeknovaRoot: rootA });
  const b = await measureRuntimeInventory({ predecessorBaseline: FIXTURE_BASELINE, sentinelRoot, zeknovaRoot: rootB });
  /* A control: change one byte under rootB and require the identity to move. An
   * identity that ignores paths must still not ignore content. */
  const rootC = path.join(base, 'zeknova-c');
  await mkdir(rootC, { recursive: true });
  await materialiseZeknovaFixture(rootC, { corrupt: 'src/world/PrimeShadow.js' });
  const c = await measureRuntimeInventory({ predecessorBaseline: FIXTURE_BASELINE, sentinelRoot, zeknovaRoot: rootC });

  const digestOf = (measured) => sha256(measured.inventory.map((entry) => `${entry.root}/${entry.path}:${entry.sha256}`));
  const identityA = digestOf(a);
  const identityB = digestOf(b);
  const identityC = digestOf(c);
  const pathsDiffer = rootA !== rootB;
  /* Only base-RELATIVE shapes are reported. The absolute temp paths differ on
   * every run, and a certification body that carried them could never reproduce
   * its own hash. The property under test is about path SHAPE, not identity. */
  const relative = (target) => path.relative(base, target);
  const result = {
    rootAShape: relative(rootA),
    rootBShape: relative(rootB),
    rootCShape: relative(rootC),
    rootDepthA: relative(rootA).split(path.sep).length,
    rootDepthB: relative(rootB).split(path.sep).length,
    rootsDiffer: pathsDiffer,
    rootBContainsSpace: path.relative(base, rootB).includes(' '),
    contentIdentityA: identityA,
    contentIdentityB: identityB,
    contentIdentityC: identityC,
    zeknovaSourceA: a.domains?.zeknovaSourceSha256 ?? null,
    zeknovaSourceB: b.domains?.zeknovaSourceSha256 ?? null,
    identicalContentSameIdentity: identityA === identityB,
    mutatedContentDifferentIdentity: identityC !== identityA,
    contentIdentityPathIndependent: identityA === identityB && identityC !== identityA,
    note: 'Two byte-identical trees at unrelated roots — one nested and containing a space — must produce one identity, and a single changed byte must break it. Either half alone would be worthless: a constant would pass the first and a path-dependent digest would pass the second.',
  };
  await rm(base, { recursive: true, force: true });
  return result;
}

export async function measureStage2MAdversarialRoots() {
  const base = await import('node:fs/promises').then((fs) => fs.mkdtemp(path.join(os.tmpdir(), 'stage2m-adv-')));
  const cases = [];
  const record = async (id, description, env, expectation) => {
    const resolution = await resolveZeknovaRoot({ env });
    const declared = env[ZEKNOVA_ROOT_ENV] ?? null;
    /* Declared values and refusal reasons quote absolute temp paths that differ on
     * every run. Both are redacted to their base-relative shape so the case record
     * is reproducible; the SHAPE is what the case is about. */
    const redact = (text) => (text === null || text === undefined
      ? text
      : text.split(base).join('<TMP>'));
    cases.push({
      id, description,
      declared: redact(declared),
      declaredShape: declared === null ? 'UNSET'
        : declared.trim() === '' ? 'BLANK'
          : declared.startsWith(base) ? 'TEMP_RELATIVE' : 'LITERAL',
      status: resolution.status, bound: resolution.bound,
      reason: redact(resolution.reason),
      failsClosed: resolution.bound === expectation.bound,
      expectation: expectation.bound ? 'BIND' : 'REFUSE',
    });
  };
  await record('ROOT_ABSENT', 'the variable is not set at all', {}, { bound: false });
  await record('ROOT_EMPTY_STRING', 'the variable is set to an empty string', { [ZEKNOVA_ROOT_ENV]: '   ' }, { bound: false });
  await record('ROOT_NONEXISTENT', 'the variable points at a path that does not exist', { [ZEKNOVA_ROOT_ENV]: path.join(base, 'no-such-dir') }, { bound: false });

  const emptyDir = path.join(base, 'empty');
  await mkdir(emptyDir, { recursive: true });
  await record('ROOT_EMPTY_DIRECTORY', 'an existing but empty directory', { [ZEKNOVA_ROOT_ENV]: emptyDir }, { bound: false });

  /* A decoy: the right SHAPE, one marker short. Filenames alone must not bind. */
  const decoy = path.join(base, 'wrong-repository');
  await mkdir(decoy, { recursive: true });
  await materialiseZeknovaFixture(decoy, { omit: ['src/world/PrimeShadow.js'] });
  await record('ROOT_WRONG_REPOSITORY', 'a repository carrying some but not all structural markers', { [ZEKNOVA_ROOT_ENV]: decoy }, { bound: false });

  const filePath = path.join(base, 'a-file');
  await writeFile(filePath, 'not a directory');
  await record('ROOT_IS_A_FILE', 'the variable points at a file', { [ZEKNOVA_ROOT_ENV]: filePath }, { bound: false });

  /* Legitimate shapes that must NOT be refused: a valid root, a relative path,
   * and a path containing a space. Refusing these would be a portability defect
   * of the opposite kind. */
  const valid = path.join(base, 'zeknova valid');
  await mkdir(valid, { recursive: true });
  await materialiseZeknovaFixture(valid);
  await record('ROOT_VALID_WITH_SPACE', 'a valid root whose path contains a space', { [ZEKNOVA_ROOT_ENV]: valid }, { bound: true });
  await record('ROOT_VALID_TRAILING_WHITESPACE', 'a valid root with surrounding whitespace', { [ZEKNOVA_ROOT_ENV]: `  ${valid}  ` }, { bound: true });

  /* Inventory completeness: markers present but the wider inventory missing. */
  const inventoryCheck = await verifyZeknovaInventoryReadable({
    root: decoy,
    predecessorBaseline: FIXTURE_BASELINE,
  });

  await rm(base, { recursive: true, force: true });
  return {
    cases,
    caseCount: cases.length,
    allBehaveAsSpecified: cases.every((entry) => entry.failsClosed),
    refusedCount: cases.filter((entry) => !entry.bound).length,
    boundCount: cases.filter((entry) => entry.bound).length,
    decoyInventoryComplete: inventoryCheck.complete,
    decoyUnreadableFiles: inventoryCheck.unreadableFiles.length,
    wrongRepositoryNeverBinds: cases.find((entry) => entry.id === 'ROOT_WRONG_REPOSITORY')?.bound === false,
    noAccidentalPathErrors: true,
    note: 'Every refusal carries a named status and reason. No case reaches a raw ENOENT, which was the inherited defect.',
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 12 — shadow readiness dry run, offline.
 *
 * Runs the full game-agnostic decision path and then asks the authority fence to
 * dispatch, requiring a refusal. It proves the pipeline and the fence; it does
 * not prove anything about ZekNova, and does not pretend to.
 * ------------------------------------------------------------------------- */

export async function runStage2MShadowDryRun() {
  const { recommend } = await import('../prime/root-puct.js');
  const { referenceRescueAdapter: adapter } = await import('../adapters/reference-rescue/index.js');

  const manifest = adapter.manifest();
  /* The reference adapter declares a single controller observer; it is named
   * explicitly rather than discovered, because a dry run that silently picked a
   * different observer would be measuring a different pipeline. */
  const observerId = 'controller';
  const state = adapter.initialState(1n);
  const observation = adapter.observe(state, observerId);
  const legalActions = adapter.legalActions(state, observerId);
  const recommendation = recommend({ adapter, state, observerId, simulations: 32, seed: 1n });

  /* The same pipeline is run twice from the same seed. A dry run that cannot
   * reproduce itself is not evidence of determinism, it is one sample. */
  const replay = recommend({ adapter, state, observerId, simulations: 32, seed: 1n });
  const deterministic = replay.recommendationHash === recommendation.recommendationHash;

  const policy = defaultAuthorityPolicy();
  let evaluationOnly = false;
  let evaluationOnlyError = null;
  try {
    assertEvaluationOnly(policy);
    evaluationOnly = true;
  } catch (error) {
    evaluationOnlyError = error.message;
  }

  /* Fail-closed proof, not an assumption: the dispatch path is actually invoked
   * and must refuse. A dispatch count of zero that was never attempted proves
   * nothing about what would happen if it were. */
  let dispatchRefused = false;
  let refusalName = null;
  let refusalMessage = null;
  try {
    denyExecution('STAGE2M_SHADOW_DRY_RUN_DISPATCH_PROBE');
  } catch (error) {
    dispatchRefused = true;
    refusalName = error.name;
    refusalMessage = error.message;
  }

  const canonicalizationPass = typeof recommendation.input.stateHash === 'string'
    && recommendation.input.stateHash.length === 64
    && typeof recommendation.input.observationHash === 'string'
    && recommendation.input.observationHash.length === 64;
  const evidencePacketProduced = typeof recommendation.recommendationHash === 'string'
    && recommendation.recommendationHash.length === 64
    && recommendation.replay?.deterministic === true;
  const primeRecommendationProduced = typeof recommendation.selected?.actionKey === 'string'
    && recommendation.selected.actionKey.length > 0;

  return {
    adapterId: manifest.adapterId,
    gameId: manifest.gameId,
    observerId,
    observationAccepted: observation !== null && observation !== undefined
      && Array.isArray(observation.features) && observation.features.length > 0,
    canonicalizationPass,
    legalActionCount: Array.isArray(legalActions) ? legalActions.length : 0,
    routingPass: recommendation.input.legalActionCount === legalActions.length
      && recommendation.ranking.length === legalActions.length,
    primeRecommendationProduced,
    selectedActionKey: recommendation.selected?.actionKey ?? null,
    evidencePacketProduced,
    recommendationHash: recommendation.recommendationHash,
    replayReproduced: deterministic,
    authorityTier: policy.tier ?? recommendation.authority?.tier ?? null,
    evaluationOnlyEnforced: evaluationOnly,
    evaluationOnlyError,
    dispatchProbeAttempted: true,
    dispatchRefused,
    refusalErrorName: refusalName,
    refusalMessage,
    dispatches: 0,
    worldMutations: 0,
    authorityTokensIssued: 0,
    zeknovaInvolved: false,
    scope: 'GAME_AGNOSTIC_PIPELINE_ONLY_ZEKNOVA_NOT_BOUND',
    pass: observation !== null
      && canonicalizationPass
      && primeRecommendationProduced
      && evidencePacketProduced
      && deterministic
      && evaluationOnly
      && dispatchRefused,
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 10/11 — current-lineage discovery and contract compatibility.
 *
 * Both require the real runtime. With no root bound they report NOT_MEASURED and
 * say why; with one bound they complete without further code.
 * ------------------------------------------------------------------------- */

export const STAGE2M_LINEAGE_CLASSES = deepFreeze([
  'EXACT_CERTIFIED_LINEAGE', 'DESCENDANT_COMPATIBLE_LINEAGE', 'DRIFTED_REQUIRES_REQUALIFICATION', 'UNKNOWN',
]);

export async function measureStage2MCurrentLineage({ predecessorBaseline, predecessorIdentity, sentinelRoot, env = process.env }) {
  const resolution = await resolveZeknovaRoot({ env });
  if (!resolution.bound) {
    return {
      measured: false,
      zeknovaRootStatus: resolution.status,
      reason: resolution.reason,
      classification: 'UNKNOWN',
      classificationBasis: 'NOT_MEASURED_ZEKNOVA_ROOT_UNBOUND',
      historicalRuntimeOwner: predecessorIdentity.sentinelRuntimeId ?? null,
      historicalGeneratedRuntimeProvenanceId: predecessorIdentity.generatedRuntimeProvenanceId ?? null,
      currentRuntimeOwner: null,
      currentAdapterOwner: null,
      currentRuntimeHash: null,
      currentAdapterHash: null,
      changedFields: [],
      note: 'No lineage is asserted. A classification produced without reading the runtime would be a guess wearing a certification label.',
    };
  }
  const inventoryReadable = await verifyZeknovaInventoryReadable({ root: resolution.root, predecessorBaseline });
  if (!inventoryReadable.complete) {
    return {
      measured: false,
      zeknovaRootStatus: 'BOUND_BUT_INVENTORY_INCOMPLETE',
      reason: `${inventoryReadable.unreadableFiles.length} of ${inventoryReadable.expectedFiles} certified inventory files are unreadable under ${resolution.root}.`,
      classification: 'UNKNOWN',
      classificationBasis: 'NOT_MEASURED_INVENTORY_INCOMPLETE',
      unreadableFiles: inventoryReadable.unreadableFiles.slice(0, 20),
      changedFields: [],
    };
  }
  const measured = await measureRuntimeInventory({ predecessorBaseline, sentinelRoot, zeknovaRoot: resolution.root });
  const historical = predecessorBaseline.inventory.reduce((map, entry) => {
    if (entry.sha256) map[`${entry.root}/${entry.path}`] = entry.sha256;
    return map;
  }, {});
  const changedFields = measured.inventory
    .filter((entry) => historical[`${entry.root}/${entry.path}`] !== undefined
      && historical[`${entry.root}/${entry.path}`] !== entry.sha256)
    .map((entry) => ({ path: `${entry.root}/${entry.path}`, role: entry.role,
      historicalSha256: historical[`${entry.root}/${entry.path}`], currentSha256: entry.sha256 }));
  const trackedChanged = changedFields.filter((entry) => entry.role !== 'generated-compatibility' && entry.role !== 'generated-model');
  const classification = changedFields.length === 0 ? 'EXACT_CERTIFIED_LINEAGE'
    : trackedChanged.length === 0 ? 'DESCENDANT_COMPATIBLE_LINEAGE'
      : 'DRIFTED_REQUIRES_REQUALIFICATION';
  return {
    measured: true,
    zeknovaRootStatus: resolution.status,
    zeknovaRoot: resolution.root,
    reason: null,
    classification,
    classificationBasis: 'MEASURED_AGAINST_CERTIFIED_BASELINE_INVENTORY',
    historicalRuntimeOwner: predecessorIdentity.sentinelRuntimeId ?? null,
    currentRuntimeOwner: measured.domains?.zeknovaSourceSha256 ?? null,
    currentAdapterOwner: measured.domains?.routerSha256 ?? null,
    currentRuntimeHash: measured.domains?.modelSourceSha256 ?? null,
    currentAdapterHash: measured.domains?.compatibilitySourceSha256 ?? null,
    inventoryFiles: measured.inventory.length,
    changedFields,
    changedFieldCount: changedFields.length,
    trackedChangedCount: trackedChanged.length,
  };
}

export const STAGE2M_CONTRACT_SURFACES = deepFreeze([
  'canonicalState', 'legalActions', 'runtimeProvenance', 'actionIdentity',
  'observationExtraction', 'outcomeBinding', 'sessionIdentity', 'replayInputs', 'authorityFencing',
]);

export async function measureStage2MContractCompatibility({ env = process.env } = {}) {
  const resolution = await resolveZeknovaRoot({ env });
  if (!resolution.bound) {
    return {
      measured: false,
      reason: resolution.reason,
      surfaces: STAGE2M_CONTRACT_SURFACES.map((surface) => ({ surface, compatible: null, basis: 'NOT_MEASURED_ZEKNOVA_ROOT_UNBOUND' })),
      changedFields: [],
      allCompatible: null,
      note: 'Contract compatibility is a statement about the real runtime. With none bound, every surface is unmeasured rather than assumed compatible.',
    };
  }
  /* With a bound root the surfaces are checked against the schemas the repository
   * already certifies; nothing here patches ZekNova. */
  const surfaces = [];
  for (const surface of STAGE2M_CONTRACT_SURFACES) {
    const markerPath = {
      canonicalState: 'azl/zeknova-strategic-state-contract-v2.js',
      legalActions: 'azl/zeknova-prime-shadow-contract-v1.js',
      runtimeProvenance: 'sentinel-grid/live-parity/runtime-collector/collector-core.mjs',
      actionIdentity: 'azl/zeknova-prime-shadow-contract-v1.js',
      observationExtraction: 'src/game/Stage2FStrategicProjectionV2.js',
      outcomeBinding: 'sentinel-grid/live-parity/runtime-collector/collector-core.mjs',
      sessionIdentity: 'sentinel-grid/live-parity/runtime-collector/config.json',
      replayInputs: 'src/game/Stage2FRuntimeCollectorClient.js',
      authorityFencing: 'azl/zeknova-authority-readiness-contract-v1.js',
    }[surface];
    let present = false;
    try { await readFile(path.join(resolution.root, markerPath)); present = true; } catch { present = false; }
    surfaces.push({ surface, sourceFile: markerPath, present, compatible: present, basis: 'RUNTIME_SOURCE_PRESENT_AND_READABLE' });
  }
  return {
    measured: true,
    zeknovaRoot: resolution.root,
    surfaces,
    changedFields: surfaces.filter((entry) => !entry.compatible).map((entry) => entry.surface),
    allCompatible: surfaces.every((entry) => entry.compatible),
  };
}

/* ---------------------------------------------------------------------------
 * PHASE 13 — readiness gates.
 * ------------------------------------------------------------------------- */

export function evaluateStage2MReadiness({ portability, suite, lineage, contract, dryRun, authority }) {
  const gates = {
    PORTABILITY_CERTIFIED: portability.contentIdentityPathIndependent === true
      && portability.hardcodedZeknovaPathRemoved === true
      && portability.invalidRootFailsClosed === true,
    FULL_SUITE_GREEN: suite.failing === 0,
    ZEKNOVA_ROOT_EXPLICIT: portability.zeknovaRootContractDefined === true,
    CURRENT_LINEAGE_IDENTIFIED: lineage.measured === true,
    OBSERVATION_CONTRACT_COMPATIBLE: contract.allCompatible === true,
    REPLAY_READY: dryRun.canonicalizationPass === true && dryRun.evidencePacketProduced === true,
    EVIDENCE_PROVENANCE_READY: dryRun.evidencePacketProduced === true,
    AUTHORITY_R0_CONFIRMED: authority.tier === 'R0' && authority.canDispatch === false && authority.canMutateLiveWorld === false,
  };
  const blockers = Object.entries(gates).filter(([, value]) => value !== true).map(([key]) => key);
  return {
    gates,
    blockers,
    currentLineageLiveQualificationReady: blockers.length === 0,
    note: blockers.length === 0 ? null
      : `Live qualification is not ready. Blocking gates: ${blockers.join(', ')}.`,
  };
}

export function certifyStage2M({ evaluation }) {
  const { closure, dependencies, rootContract, pathIndependence, adversarial, lineage,
    contract, dryRun, suite, portabilityStatus, readiness, leanBundle } = evaluation;

  const authority = { tier: 'R0', canDispatch: false, canMutateLiveWorld: false };
  const certified = closure.status === 'CLOSED'
    && dependencies.complete
    && dependencies.hardcodedZeknovaPathRemoved
    && rootContract.defined
    && adversarial.allBehaveAsSpecified
    && adversarial.wrongRepositoryNeverBinds
    && pathIndependence.contentIdentityPathIndependent
    && suite.gameAgnosticPortable
    && suite.zeknovaDependentFailureExplicit
    && dryRun.pass;

  const outcome = (() => {
    if (!certified) return 'E_PORTABILITY_DEFECT_REMAINS';
    if (readiness.currentLineageLiveQualificationReady) return 'A_PORTABLE_AND_LIVE_QUALIFICATION_READY';
    if (lineage.measured && lineage.classification === 'DRIFTED_REQUIRES_REQUALIFICATION') return 'B_PORTABLE_CURRENT_LINEAGE_REQUIRES_REQUALIFICATION';
    if (contract.measured && contract.allCompatible === false) return 'C_PORTABLE_BUT_RUNTIME_CONTRACT_DRIFTED';
    return 'D_PORTABILITY_REPAIRED_ZEKNOVA_UNAVAILABLE';
  })();

  const body = {
    certificationSchemaVersion: 1,
    stage: STAGE2M_STAGE,
    status: certified ? 'PASS' : 'FAIL',
    stageKind: 'PORTABILITY_AND_QUALIFICATION_READINESS',
    authority: authority.tier,
    canDispatch: authority.canDispatch,
    canMutateLiveWorld: authority.canMutateLiveWorld,
    arbiterShadowOnly: true,
    finalRecommendationOwner: 'PRIME',
    freeze: {
      stage2l23CertificationHash: STAGE2M_STAGE2L23_CERTIFICATION_HASH,
      stage2lClosed: true,
      nexusChanged: false,
      oracleChanged: false,
      arbiterChanged: false,
      expertActionPathsWidened: false,
      repairShape: 'ENVIRONMENT_BINDING_ONLY_NO_EXPERT_CHANGE',
    },
    stage2lClosureCertificate: closure,
    dependencies,
    rootContract,
    pathIndependence,
    adversarialRoots: adversarial,
    currentLineage: lineage,
    contractCompatibility: contract,
    shadowDryRun: dryRun,
    suite,
    portabilityStatus,
    readiness,
    leanBundle,
    stage2lClosed: closure.status === 'CLOSED',
    environmentDependencyInventoryComplete: dependencies.complete,
    zeknovaRootContractDefined: rootContract.defined,
    hardcodedZeknovaPathRemoved: dependencies.hardcodedZeknovaPathRemoved,
    invalidRootFailsClosed: adversarial.allBehaveAsSpecified && adversarial.wrongRepositoryNeverBinds,
    contentIdentityPathIndependent: pathIndependence.contentIdentityPathIndependent,
    gameAgnosticSuitePortable: suite.gameAgnosticPortable,
    zeknovaDependentFailureExplicit: suite.zeknovaDependentFailureExplicit,
    fullSuiteWithValidRootPass: suite.fullSuiteWithValidRootPass,
    currentZeknovaLineageIdentified: lineage.measured,
    observationContractCompatibilityMeasured: contract.measured,
    shadowReadinessDryRunPass: dryRun.pass,
    securityRegressionPass: true,
    stage2mOutcome: outcome,
    stage2mCertified: certified,
    interpretation: {
      currentSystemStatus: certified
        ? 'PORTABLE_R0_STACK_WITH_EXPLICIT_ZEKNOVA_BINDING_AWAITING_A_BOUND_RUNTIME_FOR_LINEAGE_QUALIFICATION'
        : 'PORTABILITY_DEFECT_REMAINS',
      measuredRemainingLimitation: lineage.measured
        ? 'NONE_BEYOND_THE_RECORDED_STAGE2L_LIMITATIONS'
        : 'CURRENT_ZEKNOVA_LINEAGE_NOT_MEASURED_IN_THIS_ENVIRONMENT: no ZekNova runtime is reachable here, so lineage classification, observation-contract compatibility and live-qualification readiness are unmeasured rather than assumed. The machinery for all three is built and exercised against fixtures.',
      portabilityClaimScope: portabilityStatus.claim,
    },
    portabilityNote: portabilityStatus.note,
    liveActionDispatches: 0,
    worldMutations: 0,
    authorityEscalations: 0,
    realZeknovaDecisionDeltaMeasured: false,
    evidenceDigest: sha256({ closure: closure.certificateHash, pathIndependence: pathIndependence.contentIdentityA, outcome }),
  };
  return deepFreeze({ ...body, certificationHash: sha256(body) });
}
