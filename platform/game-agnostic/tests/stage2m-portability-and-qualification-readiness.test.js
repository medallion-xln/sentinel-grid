import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ZEKNOVA_ROOT_CONTRACT_VERSION,
  ZEKNOVA_ROOT_ENV,
  ZEKNOVA_ROOT_MARKERS,
  ZEKNOVA_ROOT_STATUSES,
  ZeknovaRootError,
  requireZeknovaRoot,
  resolveZeknovaRoot,
  zeknovaAvailable,
} from '../src/core/zeknova-root.js';
import {
  STAGE2L_OWNED_LIMITATIONS,
  STAGE2L_STAGES,
  STAGE2M_CONTRACT_SURFACES,
  STAGE2M_ENVIRONMENT_DEPENDENCIES,
  STAGE2M_STAGE2L23_CERTIFICATION_HASH,
  buildStage2LClosureCertificate,
  buildStage2MDependencyInventory,
  certifyStage2M,
  evaluateStage2MReadiness,
  materialiseZeknovaFixture,
  measureStage2MAdversarialRoots,
  measureStage2MContractCompatibility,
  measureStage2MCurrentLineage,
  measureStage2MPathIndependence,
  runStage2MShadowDryRun,
} from '../src/lab/stage2m-portability-and-qualification-readiness.js';

/* ---------------------------------------------------------------------------
 * The root contract.
 * ------------------------------------------------------------------------- */

test('the contract declares one variable, no default and named statuses', () => {
  assert.equal(ZEKNOVA_ROOT_ENV, 'ZEKNOVA_ROOT');
  assert.equal(ZEKNOVA_ROOT_CONTRACT_VERSION, 'ZEKNOVA_ROOT_CONTRACT_V1');
  assert.ok(ZEKNOVA_ROOT_MARKERS.length >= 3, 'one marker would let any directory with one file bind');
  assert.deepEqual([...ZEKNOVA_ROOT_STATUSES].sort(), [
    'BOUND', 'INVALID_MISSING_MARKERS', 'INVALID_NOT_A_DIRECTORY', 'INVALID_UNREADABLE', 'UNBOUND',
  ]);
});

test('an unset variable refuses with a named reason rather than a guess', async () => {
  const resolution = await resolveZeknovaRoot({ env: {} });
  assert.equal(resolution.bound, false);
  assert.equal(resolution.status, 'UNBOUND');
  assert.equal(resolution.root, null);
  assert.match(resolution.reason, /never inferred/);
});

test('requireZeknovaRoot throws a typed error carrying the status', async () => {
  await assert.rejects(
    () => requireZeknovaRoot({ env: {} }),
    (error) => error instanceof ZeknovaRootError && error.status === 'UNBOUND',
  );
});

test('zeknovaAvailable reports false without throwing', async () => {
  assert.equal(await zeknovaAvailable({ env: {} }), false);
});

test('a directory carrying only some markers never binds', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'stage2m-test-'));
  try {
    const decoy = path.join(base, 'decoy');
    await mkdir(decoy, { recursive: true });
    await materialiseZeknovaFixture(decoy, { omit: [ZEKNOVA_ROOT_MARKERS[1]] });
    const resolution = await resolveZeknovaRoot({ env: { [ZEKNOVA_ROOT_ENV]: decoy } });
    assert.equal(resolution.bound, false);
    assert.equal(resolution.status, 'INVALID_MISSING_MARKERS');
    assert.match(resolution.reason, /structural markers are missing/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a valid root binds even when its path contains a space or padding', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'stage2m-test-'));
  try {
    const valid = path.join(base, 'zeknova valid');
    await mkdir(valid, { recursive: true });
    await materialiseZeknovaFixture(valid);
    for (const declared of [valid, `  ${valid}  `]) {
      const resolution = await resolveZeknovaRoot({ env: { [ZEKNOVA_ROOT_ENV]: declared } });
      assert.equal(resolution.bound, true, `refused a legitimate root: ${JSON.stringify(declared)}`);
      assert.equal(resolution.root, valid);
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('a file is refused as NOT_A_DIRECTORY rather than surfacing an ENOENT', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'stage2m-test-'));
  try {
    const file = path.join(base, 'a-file');
    await writeFile(file, 'not a directory');
    const resolution = await resolveZeknovaRoot({ env: { [ZEKNOVA_ROOT_ENV]: file } });
    assert.equal(resolution.status, 'INVALID_NOT_A_DIRECTORY');
    assert.doesNotMatch(String(resolution.reason), /ENOENT/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

/* The property that makes this a contract rather than a lookup. A resolver that
 * searched would pass every test above while reintroducing the defect. */
test('the resolver never searches the filesystem or reads a home directory', async () => {
  const source = await import('node:fs/promises')
    .then((fs) => fs.readFile(new URL('../src/core/zeknova-root.js', import.meta.url), 'utf8'));
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\breaddir\b|\bopendir\b|\bglob\b/, 'the resolver walks the filesystem');
  assert.doesNotMatch(code, /os\.homedir|process\.env\.HOME|process\.env\.USERPROFILE/, 'the resolver reads a home directory');
  assert.doesNotMatch(code, /\/Users\/|C:\\\\/, 'the resolver carries a developer path');
});

/* ---------------------------------------------------------------------------
 * Path independence — both halves.
 * ------------------------------------------------------------------------- */

test('identical content at unrelated roots produces one identity, and one changed byte breaks it', async () => {
  const measured = await measureStage2MPathIndependence();
  assert.equal(measured.identicalContentSameIdentity, true);
  assert.equal(measured.mutatedContentDifferentIdentity, true);
  assert.equal(measured.contentIdentityPathIndependent, true);
  assert.equal(measured.rootBContainsSpace, true);
  assert.ok(measured.rootDepthB > measured.rootDepthA, 'the two roots must sit at different depths');
  /* Neither half alone is evidence: a constant digest passes the first, a
   * path-dependent digest passes the second. */
  assert.notEqual(measured.contentIdentityA, measured.contentIdentityC);
});

test('the path-independence measurement carries no absolute temp paths', async () => {
  const measured = await measureStage2MPathIndependence();
  assert.equal(JSON.stringify(measured).includes(os.tmpdir()), false,
    'volatile paths in the result would make the certification hash unreproducible');
});

/* ---------------------------------------------------------------------------
 * Adversarial roots.
 * ------------------------------------------------------------------------- */

test('every adversarial root behaves as specified and the decoy never binds', async () => {
  const measured = await measureStage2MAdversarialRoots();
  assert.ok(measured.caseCount >= 8);
  assert.equal(measured.allBehaveAsSpecified, true);
  assert.equal(measured.wrongRepositoryNeverBinds, true);
  assert.ok(measured.refusedCount >= 6, 'six invalid shapes must be refused');
  assert.ok(measured.boundCount >= 2, 'legitimate shapes must not be refused either');
  for (const entry of measured.cases) {
    assert.ok(entry.status !== null && entry.status !== undefined, `${entry.id} produced no status`);
    if (!entry.bound) assert.ok(entry.reason, `${entry.id} refused without saying why`);
    assert.doesNotMatch(String(entry.reason ?? ''), /ENOENT/, `${entry.id} leaked a raw filesystem error`);
  }
});

test('adversarial cases are reproducible across runs', async () => {
  const first = JSON.stringify(await measureStage2MAdversarialRoots());
  const second = JSON.stringify(await measureStage2MAdversarialRoots());
  assert.equal(first, second);
});

/* ---------------------------------------------------------------------------
 * Shadow dry run — fail-closed, proven by invocation.
 * ------------------------------------------------------------------------- */

test('the shadow dry run reaches a recommendation, reproduces it, and refuses to dispatch', async () => {
  const dryRun = await runStage2MShadowDryRun();
  assert.equal(dryRun.pass, true);
  assert.equal(dryRun.observationAccepted, true);
  assert.equal(dryRun.canonicalizationPass, true);
  assert.equal(dryRun.primeRecommendationProduced, true);
  assert.equal(dryRun.replayReproduced, true, 'one sample is not evidence of determinism');
  assert.equal(dryRun.authorityTier, 'R0');
  assert.equal(dryRun.dispatches, 0);
  assert.equal(dryRun.worldMutations, 0);
  assert.equal(dryRun.authorityTokensIssued, 0);
  /* The zero above is only meaningful because the path was actually taken. */
  assert.equal(dryRun.dispatchProbeAttempted, true);
  assert.equal(dryRun.dispatchRefused, true);
  assert.equal(dryRun.zeknovaInvolved, false);
});

/* ---------------------------------------------------------------------------
 * Unmeasured is not passed.
 * ------------------------------------------------------------------------- */

test('with no root bound, lineage is UNKNOWN and explicitly not measured', async () => {
  const lineage = await measureStage2MCurrentLineage({
    predecessorBaseline: { inventory: [] },
    predecessorIdentity: {},
    sentinelRoot: process.cwd(),
    env: {},
  });
  assert.equal(lineage.measured, false);
  assert.equal(lineage.classification, 'UNKNOWN');
  assert.equal(lineage.classificationBasis, 'NOT_MEASURED_ZEKNOVA_ROOT_UNBOUND');
  assert.notEqual(lineage.classification, 'EXACT_CERTIFIED_LINEAGE');
});

test('with no root bound, every contract surface is null rather than compatible', async () => {
  const contract = await measureStage2MContractCompatibility({ env: {} });
  assert.equal(contract.measured, false);
  assert.equal(contract.allCompatible, null);
  assert.equal(contract.surfaces.length, STAGE2M_CONTRACT_SURFACES.length);
  for (const surface of contract.surfaces) {
    assert.equal(surface.compatible, null, `${surface.surface} was assumed compatible without measurement`);
  }
});

test('readiness cannot be granted while lineage and contract are unmeasured', () => {
  const readiness = evaluateStage2MReadiness({
    portability: {
      contentIdentityPathIndependent: true, hardcodedZeknovaPathRemoved: true,
      invalidRootFailsClosed: true, zeknovaRootContractDefined: true,
    },
    suite: { failing: 0 },
    lineage: { measured: false },
    contract: { allCompatible: null },
    dryRun: { canonicalizationPass: true, evidencePacketProduced: true },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  });
  assert.equal(readiness.currentLineageLiveQualificationReady, false);
  assert.ok(readiness.blockers.includes('CURRENT_LINEAGE_IDENTIFIED'));
  assert.ok(readiness.blockers.includes('OBSERVATION_CONTRACT_COMPATIBLE'));
});

test('readiness is granted only when every gate is measured true', () => {
  const readiness = evaluateStage2MReadiness({
    portability: {
      contentIdentityPathIndependent: true, hardcodedZeknovaPathRemoved: true,
      invalidRootFailsClosed: true, zeknovaRootContractDefined: true,
    },
    suite: { failing: 0 },
    lineage: { measured: true },
    contract: { allCompatible: true },
    dryRun: { canonicalizationPass: true, evidencePacketProduced: true },
    authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  });
  assert.equal(readiness.currentLineageLiveQualificationReady, true);
  assert.deepEqual(readiness.blockers, []);
});

test('an escalated authority tier blocks readiness', () => {
  const readiness = evaluateStage2MReadiness({
    portability: {
      contentIdentityPathIndependent: true, hardcodedZeknovaPathRemoved: true,
      invalidRootFailsClosed: true, zeknovaRootContractDefined: true,
    },
    suite: { failing: 0 },
    lineage: { measured: true },
    contract: { allCompatible: true },
    dryRun: { canonicalizationPass: true, evidencePacketProduced: true },
    authority: { tier: 'R1', canDispatch: true, canMutateLiveWorld: false },
  });
  assert.ok(readiness.blockers.includes('AUTHORITY_R0_CONFIRMED'));
});

/* ---------------------------------------------------------------------------
 * Dependency inventory.
 * ------------------------------------------------------------------------- */

test('the dependency inventory classifies rather than merely counts absolute paths', () => {
  const inventory = buildStage2MDependencyInventory({ hardcodedBefore: 28, hardcodedAfter: 0 });
  assert.equal(inventory.dependencyCount, STAGE2M_ENVIRONMENT_DEPENDENCIES.length);
  assert.equal(inventory.hardcodedZeknovaPathRemoved, true);
  assert.equal(inventory.complete, true);
  /* Not every absolute path is a defect: the evidence-portability fixture must
   * keep its path, because the path is the thing it asserts is never leaked. */
  const fixture = inventory.dependencies.find((entry) => entry.id === 'EVIDENCE_PORTABILITY_FIXTURE');
  assert.equal(fixture.classification, 'TEST_FIXTURE');
  assert.equal(fixture.remediated, false);
});

test('a surviving hardcoded path fails the inventory', () => {
  const inventory = buildStage2MDependencyInventory({ hardcodedBefore: 28, hardcodedAfter: 1 });
  assert.equal(inventory.hardcodedZeknovaPathRemoved, false);
});

/* ---------------------------------------------------------------------------
 * Closure and certification.
 * ------------------------------------------------------------------------- */

test('the Stage 2L closure certificate records the arc without restating it', () => {
  const closure = buildStage2LClosureCertificate({
    stage2l23CertificationHash: STAGE2M_STAGE2L23_CERTIFICATION_HASH,
    stage2l23CorpusDigest: 'x'.repeat(64),
    headLineage: 'TEST',
  });
  assert.equal(closure.status, 'CLOSED');
  assert.equal(closure.stages.length, STAGE2L_STAGES.length);
  assert.equal(closure.passCount + closure.failCount, STAGE2L_STAGES.length);
  assert.equal(closure.historicalResultsMutated, false);
  assert.equal(closure.ownedLimitations.length, STAGE2L_OWNED_LIMITATIONS.length);
  assert.ok(closure.ownedLimitations.length > 0, 'a closure claiming no limitations would be the overclaim');
  assert.equal(closure.certificateHash.length, 64);
});

test('the closure certificate is a pure function of its inputs', () => {
  const args = {
    stage2l23CertificationHash: STAGE2M_STAGE2L23_CERTIFICATION_HASH,
    stage2l23CorpusDigest: 'x'.repeat(64),
    headLineage: 'TEST',
  };
  assert.equal(
    buildStage2LClosureCertificate(args).certificateHash,
    buildStage2LClosureCertificate(args).certificateHash,
  );
});

function certificationFixture(overrides = {}) {
  return {
    closure: buildStage2LClosureCertificate({
      stage2l23CertificationHash: STAGE2M_STAGE2L23_CERTIFICATION_HASH,
      stage2l23CorpusDigest: 'x'.repeat(64), headLineage: 'TEST',
    }),
    dependencies: buildStage2MDependencyInventory({ hardcodedBefore: 28, hardcodedAfter: 0 }),
    rootContract: { defined: true },
    pathIndependence: { contentIdentityPathIndependent: true, contentIdentityA: 'a'.repeat(64) },
    adversarial: { allBehaveAsSpecified: true, wrongRepositoryNeverBinds: true },
    lineage: { measured: false, classification: 'UNKNOWN' },
    contract: { measured: false, allCompatible: null },
    dryRun: { pass: true, canonicalizationPass: true, evidencePacketProduced: true },
    suite: { failing: 0, gameAgnosticPortable: true, zeknovaDependentFailureExplicit: true, fullSuiteWithValidRootPass: null },
    portabilityStatus: { claim: 'MULTI_ROOT_SAME_PLATFORM_CERTIFIED', note: 'n/a' },
    leanBundle: { overwritten: false },
    ...overrides,
  };
}

test('with no reachable runtime the outcome is D, never A', () => {
  const evaluation = certificationFixture();
  evaluation.readiness = evaluateStage2MReadiness({
    portability: {
      contentIdentityPathIndependent: true, hardcodedZeknovaPathRemoved: true,
      invalidRootFailsClosed: true, zeknovaRootContractDefined: true,
    },
    suite: evaluation.suite, lineage: evaluation.lineage, contract: evaluation.contract,
    dryRun: evaluation.dryRun, authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
  });
  const certification = certifyStage2M({ evaluation });
  assert.equal(certification.status, 'PASS');
  assert.equal(certification.stage2mOutcome, 'D_PORTABILITY_REPAIRED_ZEKNOVA_UNAVAILABLE');
  assert.equal(certification.currentZeknovaLineageIdentified, false);
  assert.equal(certification.canDispatch, false);
  assert.equal(certification.canMutateLiveWorld, false);
  assert.equal(certification.realZeknovaDecisionDeltaMeasured, false);
});

test('a surviving portability defect fails certification outright', () => {
  const evaluation = certificationFixture({
    pathIndependence: { contentIdentityPathIndependent: false, contentIdentityA: 'a'.repeat(64) },
  });
  evaluation.readiness = { gates: {}, blockers: ['PORTABILITY_CERTIFIED'], currentLineageLiveQualificationReady: false };
  const certification = certifyStage2M({ evaluation });
  assert.equal(certification.status, 'FAIL');
  assert.equal(certification.stage2mOutcome, 'E_PORTABILITY_DEFECT_REMAINS');
});

test('certification never asserts a Stage 2L change', () => {
  const evaluation = certificationFixture();
  evaluation.readiness = { gates: {}, blockers: [], currentLineageLiveQualificationReady: false };
  const certification = certifyStage2M({ evaluation });
  assert.equal(certification.freeze.nexusChanged, false);
  assert.equal(certification.freeze.oracleChanged, false);
  assert.equal(certification.freeze.arbiterChanged, false);
  assert.equal(certification.freeze.expertActionPathsWidened, false);
  assert.equal(certification.freeze.stage2l23CertificationHash, STAGE2M_STAGE2L23_CERTIFICATION_HASH);
  assert.equal(certification.freeze.repairShape, 'ENVIRONMENT_BINDING_ONLY_NO_EXPERT_CHANGE');
});

test('certification is deterministic', () => {
  const build = () => {
    const evaluation = certificationFixture();
    evaluation.readiness = { gates: {}, blockers: [], currentLineageLiveQualificationReady: false };
    return certifyStage2M({ evaluation }).certificationHash;
  };
  assert.equal(build(), build());
});
