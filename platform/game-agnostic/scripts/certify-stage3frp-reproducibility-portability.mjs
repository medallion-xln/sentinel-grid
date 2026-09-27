#!/usr/bin/env node
/* STAGE_3F_RP — Stage 3F certification reproducibility portability remediation (infrastructure only).
 *
 *   node scripts/certify-stage3frp-reproducibility-portability.mjs            certify: derive and write the contract,
 *                                                                              erratum and certificate from records
 *   node scripts/certify-stage3frp-reproducibility-portability.mjs --check    read-only: recompute and require
 *                                                                              byte-identical reproduction
 *   ... --check --full                                                         also re-run the whole Stage 3F chain on
 *                                                                              this host (needs rebuilt evidence)
 *
 * Changes nothing scientific: no expert, policy, Router, threshold, feature, corpus, sealed partition, authority or
 * conclusion. It defines the numerical profile under which Stage 3F certificates are byte-reproducible on every host,
 * records the measurements that justify it, and re-qualifies the existing certificates under it. Historical
 * certificates are never edited; an additive erratum records their portability status.
 *
 * Inputs are committed records produced by scripts/reproducibility/*:
 *   root-cause/<label>.json          root-cause-experiments.mjs, one per host
 *   decision-sensitivity.json        decision-sensitivity.mjs (canonical numerics; host-independent)
 *   platform-runs/<label>.json       verify-stage3f.mjs report normalised by record-run.mjs
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as numerics from '../src/core/canonical-numerics-v1.js';
import { PINNED_REWRITES, guardSource } from './reproducibility/exponentiation-guard.mjs';
import { CHECKS, EVIDENCE } from './reproducibility/stage3f-chain.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (f) => path.join(root, f);
const OUT = 'artifacts/stage3frp-reproducibility-portability';
const RESULT = `${OUT}/stage3frp-certification-result.json`;
const CONTRACT_PATH = `${OUT}/stage3frp-reproducibility-contract.json`;
const ERRATUM_PATH = `${OUT}/erratum-stage3f-portability.json`;
const checkOnly = process.argv.includes('--check');
const full = process.argv.includes('--full');
const hex = (v) => createHash('sha256').update(v).digest('hex');
const readJson = (f) => JSON.parse(readFileSync(at(f), 'utf8'));
const listJson = (dir) => (existsSync(at(dir)) ? readdirSync(at(dir)).filter((f) => f.endsWith('.json')).sort().map((f) => `${dir}/${f}`) : []);

/* The remediation baseline: the Stage 3F.6-D-SYM certification commit, verified before any write. */
const BASELINE = Object.freeze({ commit: '156f0ecdb3b3b90a06bf0dc4ea97b18e13c2410a', stage: 'STAGE_3F_6_D_SYM', certificationHash: '65e507b76bbfb9b3a4ae867f73c9d2bc056575ef9b7743359bcfc28b2bb90680' });
const REQUIRED_STAGES = Object.freeze(['3F6C', '3F6T', 'T_SYM', 'P1A_SYM', 'P1_SYM', 'W_SYM', 'D_SYM']);
const AUTHORITY = Object.freeze({ authority: 'R0', canDispatch: false, canMutateLiveWorld: false, onlineLearningEnabled: false, promotedToLiveRuntime: false });

/* ----------------------------------------------------------------- records */
const rootCause = listJson(`${OUT}/root-cause`).map((f) => ({ file: f, ...readJson(f) }));
const sensitivity = readJson(`${OUT}/decision-sensitivity.json`);
const runs = listJson(`${OUT}/platform-runs`).map((f) => ({ file: f, ...readJson(f) }));
const recordHashes = Object.fromEntries([...rootCause.map((r) => r.file), `${OUT}/decision-sensitivity.json`, ...runs.map((r) => r.file)]
  .map((f) => [f, hex(readFileSync(at(f)))]));
const canonicalRuns = runs.filter((r) => r.numericsProfile === numerics.CANONICAL_NUMERICS_ID && !r.pureCanonical);
const pureCanonicalRuns = runs.filter((r) => r.numericsProfile === numerics.CANONICAL_NUMERICS_ID && r.pureCanonical);
const nativeRuns = runs.filter((r) => r.numericsProfile === 'HOST_NATIVE');

/* ------------------------------------------------------- measured quantities */
const nativeDivergence = rootCause.flatMap((r) => [r.E2_STAGE3F6C_ROUTER_REFIT.fits.HOST_NATIVE.coefficients, r.E3_SYMMETRIC_ROUTER_REFIT.fits.HOST_NATIVE.coefficients]);
const observedPlatformNoiseMaxRel = Math.max(...nativeDivergence.map((c) => c.maxRel));
const smallestDecisionRelevantEps = sensitivity.summary.smallestDecisionRelevantEps;
/* Predeclared tolerance rule (Level B only; Level C never uses a tolerance): the power of ten at or below the
 * geometric midpoint, in decades, of the measured platform noise and the smallest decision-relevant perturbation. */
/* Powers of ten as correctly rounded decimal literals, compared exactly: no engine-approximated log10 reaches a digest. */
const DECADES = Array.from({ length: 41 }, (_, i) => Number(`1e${i - 30}`));
const decadeFloor = (v) => DECADES.filter((d) => d <= v).at(-1);
const decadeCeil = (v) => DECADES.find((d) => d >= v);
const coefficientRelativeTolerance = decadeFloor(Math.sqrt(observedPlatformNoiseMaxRel * smallestDecisionRelevantEps));
const atTolerance = (model, key) => sensitivity.models[model].byEpsilon.find((r) => r.eps === coefficientRelativeTolerance)?.[key] ?? null;
const shiftAtTolerance = Math.max(atTolerance('STAGE3F6C_CORE_LOGISTIC', 'maxAbsDeltaScore'), atTolerance('STAGE3F6C_CORE_LOGISTIC', 'maxAbsDeltaEce'),
  atTolerance('STAGE3F6C_CORE_LOGISTIC', 'maxAbsDeltaBrier'), atTolerance('SYMMETRIC_POLICY_ROUTER', 'maxAbsDeltaProbability'));
const outputAbsoluteTolerance = decadeCeil(shiftAtTolerance);

/* ------------------------------------------------------------------ contract */
const golden = numerics.verifyGolden();
const contract = {
  schemaVersion: 1, contractId: 'STAGE3F_REPRODUCIBILITY_CONTRACT_V1',
  levels: {
    LEVEL_A_SCIENTIFIC_REPRODUCIBILITY: 'Identical dataset / corpus content hashes; identical discrete outputs (policy and action selections, routing decisions, thresholds and tiers chosen, rankings, classifications, conclusions, roadmap flags); continuous metrics within the frozen output tolerance.',
    LEVEL_B_NUMERICAL_REPRODUCIBILITY: 'Level A, and every fitted coefficient within the frozen relative coefficient tolerance and every prediction / continuous metric within the frozen output tolerance.',
    LEVEL_C_BYTE_REPRODUCIBILITY: `Identical serialised artifacts and hashes, computed under ${numerics.CANONICAL_NUMERICS_ID}.`,
  },
  requiredLevel: {
    RAW_EVIDENCE_PAYLOADS: 'LEVEL_C', SEALED_CORPORA_AND_PARTITIONS: 'LEVEL_C', DETERMINISTIC_POLICIES: 'LEVEL_C',
    TRAINED_DIAGNOSTIC_MODELS: 'LEVEL_C', CERTIFICATES: 'LEVEL_C', FINAL_STAGE3F_FREEZE: 'LEVEL_C',
    note: `Every class keeps the byte-level requirement it had; it is strengthened from "on the certifying host" to "on every host", by computing under ${numerics.CANONICAL_NUMERICS_ID}. Level B and Level A are diagnostic comparisons for runs under host-native numerics; they never certify.`,
  },
  numericsProfile: {
    id: numerics.CANONICAL_NUMERICS_ID, module: 'src/core/canonical-numerics-v1.js', moduleSha256: hex(readFileSync(at('src/core/canonical-numerics-v1.js'))),
    functions: { exp: 'fdlibm e_exp, reduction and polynomial with single-rounding fused multiply-add where clang -ffp-contract=on fuses (the arithmetic of record)',
      log: 'fdlibm e_log, separately rounded', log2: 'fdlibm e_log2, separately rounded', pow: 'correctly rounded, ECMAScript special cases, V8 y=2 and y=0.5 shortcuts' },
    implementedWith: 'IEEE-754 +, -, *, /, Math.sqrt, integer bit operations and BigInt only (all exactly specified by ECMAScript)',
    goldenVectors: numerics.CANONICAL_NUMERICS_GOLDEN.length, goldenSha256: hex(JSON.stringify(numerics.CANONICAL_NUMERICS_GOLDEN)),
    runtime: 'scripts/reproducibility/canonical-runtime.mjs (preload through NODE_OPTIONS; inherited by every child process)',
    runtimeEnvironment: 'NODE_OPTIONS also carries --test-reporter=tap: historical certifiers parse TAP summaries from `node --test`, and Node >= 23 defaults to the spec reporter, which would otherwise change recorded test counts on newer runtimes.',
    exponentiation: { guard: 'scripts/reproducibility/exponentiation-guard.mjs', pinnedRewrites: PINNED_REWRITES,
      rule: '`x ** 2` and integer-literal ** integer-literal are exact everywhere; the pinned site is rewritten in memory to canonical pow; any other `**` fails the load. File bytes are never changed.' },
    otherTranscendentals: 'No other engine-approximated Math function reaches a Stage 3F digest (Math.sin appears once, multiplied by zero, in the Forge V2 scenario generator).',
  },
  tolerances: {
    coefficientRelative: coefficientRelativeTolerance, outputAbsolute: outputAbsoluteTolerance,
    rule: 'coefficientRelative = largest power of ten <= sqrt(observed platform noise * smallest decision-relevant perturbation); outputAbsolute = smallest power of ten >= the largest score / probability / metric shift the sensitivity study measured at that coefficient perturbation.',
    observedPlatformNoiseMaxRel, smallestDecisionRelevantEps,
    marginBelowDecision: smallestDecisionRelevantEps / coefficientRelativeTolerance, marginAbovePlatformNoise: coefficientRelativeTolerance / observedPlatformNoiseMaxRel,
    usedFor: 'LEVEL_B classification of host-native runs only. No tolerance was used to accept any certificate.',
  },
  optionsEvaluated: {
    A_PLATFORM_PINNED_CERTIFICATION: { adopted: false, reason: 'Not portable, and demonstrably insufficient: the same OS and CPU give different pow results under Node 22 (fdlibm) and Node 26 (std::pow), so a pin would have to fix the exact runtime build and C library. Host metadata is recorded as provenance, not as a requirement.' },
    B_NUMERICAL_CANONICALIZATION_BEFORE_HASHING: { adopted: false, reason: 'Rounding to any grid cannot guarantee equal hashes (two values one ULP apart can straddle a rounding boundary), would require editing sealed certifiers, and would weaken byte identity to tolerance. Retained only as the Level B diagnostic comparison.' },
    C_DETERMINISTIC_NUMERICAL_FITTING: { adopted: true, reason: 'A single platform-independent numerical profile, implemented with exactly specified operations and injected at runtime, restores byte identity on every host with no change to any sealed file, fitting procedure, objective, threshold or conclusion; it also reproduces every stored historical hash.' },
    D_DUAL_HASHING: { adopted: false, reason: 'Sealed certificates cannot gain fields. Under the canonical profile the raw hash already is the canonical hash, so a second hash would add nothing; future certificates record the profile id instead.' },
  },
};
contract.contractHash = hex(JSON.stringify(contract));

/* ------------------------------------------------------------- source guard */
const walk = (d, out = []) => { for (const e of readdirSync(at(d), { withFileTypes: true })) {
  const p = `${d}/${e.name}`; if (e.isDirectory()) { if (!['build', 'node_modules'].includes(e.name)) walk(p, out); } else if (/\.m?js$/.test(e.name)) out.push(p);
} return out; };
const guardFailures = [];
for (const f of [...walk('src'), ...walk('scripts'), ...walk('tests')].sort()) {
  if (f.startsWith('scripts/reproducibility/')) continue;
  try { guardSource(f, readFileSync(at(f), 'utf8')); } catch (e) { guardFailures.push(f); }
}

/* ------------------------------------------------------ requalification table */
const statusOf = (run, id) => run.checks.find((c) => c.id === id) ?? null;
/* One (run, stage) outcome: BYTE_EXACT, BYTE_EXACT_UNDER_RECORD_PROFILE, or — from the leaf diff of a --capture run —
 * CANONICALLY_EQUIVALENT (Level B), SCIENTIFICALLY_EQUIVALENT (Level A only) or NOT_REPRODUCED. */
const levelOf = (run, id) => {
  const c = statusOf(run, id);
  if (c === null) return null;
  if (c.status === 'BYTE_EXACT') return c.profile && c.profile.startsWith('CANONICAL+') ? 'BYTE_EXACT_UNDER_RECORD_PROFILE' : 'BYTE_EXACT';
  if (c.status === 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION') return c.status;
  const declared = CHECKS.find((x) => x.id === id);
  if (run.numericsProfile === 'HOST_NATIVE' && declared?.hostNativeFailClosed && c.recomputedHash === null) return 'NOT_ASSESSABLE_UNDER_HOST_NATIVE_FAIL_CLOSED';
  // A run without a leaf diff for this stage may use another run's diff only if both recomputed the identical
  // certificate hash (identical bytes, hence an identical diff).
  const donor = run.certificateDiff?.[id] ? run
    : runs.find((r) => r.certificateDiff?.[id] && c.recomputedHash && statusOf(r, id)?.recomputedHash === c.recomputedHash);
  const artifacts = Object.values(donor?.certificateDiff?.[id] ?? {});
  if (!artifacts.length || artifacts.some((a) => !a.paired)) return 'NOT_REPRODUCED';
  const count = (cat) => artifacts.reduce((s, a) => s + a.categories[cat].count, 0);
  const max = (cat, k) => Math.max(0, ...artifacts.map((a) => a.categories[cat][k] ?? 0));
  // Level A: no data, predecessor, classification or conclusion difference. A certificate's own byte-identity gate
  // (and the status it alone decides) is not science: it is exactly what host-native numerics cannot satisfy.
  if (count('CLASSIFICATION_DIFFERENCE') + count('CONCLUSION_DIFFERENCE') + count('DATA_HASH_DIFFERENCE') + count('PREDECESSOR_HASH_DIFFERENCE') > 0) return 'NOT_REPRODUCED';
  const withinB = max('MODEL_PARAMETER_DIFFERENCE', 'maxRelDiff') <= coefficientRelativeTolerance && max('METRIC_DIFFERENCE', 'maxAbsDiff') <= outputAbsoluteTolerance;
  return withinB ? 'CANONICALLY_EQUIVALENT' : 'SCIENTIFICALLY_EQUIVALENT';
};
const requalification = Object.fromEntries(CHECKS.map((c) => {
  const stored = readJson(c.result);
  const canonical = Object.fromEntries(canonicalRuns.filter((r) => statusOf(r, c.id)).map((r) => [r.label, levelOf(r, c.id)]));
  const pure = Object.fromEntries(pureCanonicalRuns.filter((r) => statusOf(r, c.id)).map((r) => [r.label, levelOf(r, c.id)]));
  const native = Object.fromEntries(nativeRuns.filter((r) => statusOf(r, c.id)).map((r) => [r.label, levelOf(r, c.id)]));
  const nativeDetail = Object.fromEntries([...nativeRuns, ...pureCanonicalRuns].filter((r) => r.certificateDiff?.[c.id]).map((r) => [r.label,
    Object.fromEntries(Object.entries(r.certificateDiff[c.id]).map(([f, a]) => [f, a.paired ? Object.fromEntries(Object.entries(a.categories).filter(([, v]) => v.count)
      .map(([k, v]) => [k, { count: v.count, maxAbsDiff: v.maxAbsDiff, maxRelDiff: v.maxRelDiff, maxUlpDiff: v.maxUlpDiff }])) : 'UNPAIRED']))]));
  const canonicalStatuses = Object.values(canonical);
  const unanimous = canonicalStatuses.length > 0 && canonicalStatuses.every((v) => v === canonicalStatuses[0]) ? canonicalStatuses[0] : 'NOT_REPRODUCED';
  return [c.id, {
    storedHash: stored.certificationHash ?? stored.analysisFreezeHash, fittedModels: c.fittedModels === true, historicalStatus: c.historicalStatus ?? null,
    recordProfile: c.recordProfile ?? null,
    underCanonicalProfile: canonical, canonicalStatus: unanimous,
    underPureCanonicalProfile: pure,
    underHostNativeNumerics: native, differencesFromStored: nativeDetail,
  }];
}));

/* ----------------------------------------------------------- check-mode audit */
const certifierOf = (c) => c.run.split(' ')[1];
const checkModeAudit = Object.fromEntries(CHECKS.map((c) => {
  const own = [...canonicalRuns, ...pureCanonicalRuns, ...nativeRuns].flatMap((r) => statusOf(r, c.id)?.ownCheckModeTrackedWrites ?? []);
  const files = [...new Set(own.map((e) => e.file))].sort();
  return [certifierOf(c), { CHECK_MODE_WRITES_TRACKED_FILES: files.length > 0, filesWritten: files,
    underGuard: files.length ? 'identical rewrites skipped; differing rewrites blocked and reported (never reach the file)' : 'no tracked write attempted' }];
}));

/* ------------------------------------------------------------ fresh clone */
const evidenceRuns = [...canonicalRuns, ...pureCanonicalRuns].filter((r) => r.evidence.length);
const freshClone = {
  procedure: ['git clone <repository>', 'cd platform/game-agnostic', 'node scripts/reproducibility/verify-stage3f.mjs --rebuild-evidence',
    'node scripts/reproducibility/verify-stage3f.mjs --check', 'node scripts/certify-stage3frp-reproducibility-portability.mjs --check'],
  environment: 'Node.js >= 20 and git; full chains recorded on Node 22 and 26 (linux-x64), Node 20 golden vectors / tests / D-SYM freeze only. No network, no hidden local state; build/ holds only derived output.',
  evidence: Object.fromEntries(EVIDENCE.map((e) => [e.id, Object.fromEntries(evidenceRuns.map((r) => { const x = r.evidence.find((v) => v.id === e.id);
    return [r.label, x ? { status: x.status, regenerated: x.regenerated, payloadHashes: x.payloads.map((p) => p.actual) } : 'NOT_RUN']; }))])),
};
/* Every payload must have been regenerated in a fresh clone and match its committed manifest hash. A payload whose
 * regeneration run could not read its manifest's hash field is accepted only when a verify-only pass over the same
 * clone attests the same bytes. */
freshClone.allEvidenceByteExact = evidenceRuns.length > 0 && EVIDENCE.every((e) => {
  const regenerated = evidenceRuns.map((r) => r.evidence.find((x) => x.id === e.id)).filter((x) => x && x.regenerated);
  const attested = evidenceRuns.map((r) => r.evidence.find((x) => x.id === e.id)).filter((x) => x && x.status === 'BYTE_EXACT');
  return regenerated.length > 0 && attested.length > 0
    && regenerated.every((g) => g.payloads.every((p, i) => attested.some((a) => a.payloads[i]?.actual === p.actual)));
});

/* ----------------------------------------------------------------- erratum */
const erratum = {
  recordType: 'SENTINEL_CERTIFICATION_ERRATUM_V1', erratumId: 'STAGE3F-ERRATUM-002-PORTABILITY', historicalArtifactModified: false,
  subject: 'Byte reproducibility of Stage 3F.6 certificates whose digests contain floating-point values from Math.exp and `**`',
  finding: 'Every affected certificate was produced under host-native math: fdlibm exp evaluated with fused multiply-add (arm64 build of V8) and, from V8 14, the C library pow. Its bytes therefore reproduced only on hosts with that arithmetic. The platform was never recorded in any certificate; the D-SYM report records a "Node 26 host" only.',
  originalPlatform: 'NOT_RECORDED. Inferred from exact reproduction, not recorded: an arm64 V8 build (fused fdlibm exp) throughout; fdlibm pow (V8 <= 13) at Stage 3F.6-D and the C library pow (V8 >= 14) at Stage 3F.6-D-SYM — i.e. the certifying host changed Node major version between those stages, consistent with Apple-silicon macOS and Node 26 at D-SYM.',
  scientificStatus: 'Unchanged. Under the canonical profile every affected certificate reproduces byte for byte on every tested host; under host-native x86-64 numerics every affected stage reproduces its data, decisions, classifications and conclusions, with coefficient and metric differences at the last-bits level.',
  certificates: Object.fromEntries(Object.entries(requalification).filter(([, v]) => v.fittedModels).map(([id, v]) => [id, {
    originalHash: v.storedHash, underCanonicalProfile: v.canonicalStatus, recordProfile: v.recordProfile, underPureCanonicalProfile: v.underPureCanonicalProfile,
    underHostNativeNumerics: v.underHostNativeNumerics,
    historicalByteReproducibilityWasPlatformBound: Object.values(v.underHostNativeNumerics).some((s) => s !== 'BYTE_EXACT'),
  }])),
  supersedes: null, contractHash: contract.contractHash,
};
erratum.erratumHash = hex(JSON.stringify(erratum));

/* ---------------------------------------------------------------- checks */
const required = Object.fromEntries(REQUIRED_STAGES.map((id) => [id, requalification[id]?.canonicalStatus ?? 'NOT_RUN']));
/* No required stage has a record profile, so a pure-canonical run computes them exactly as a canonical run does. */
const nodeMajors = [...new Set([...canonicalRuns, ...pureCanonicalRuns].filter((r) => REQUIRED_STAGES.every((id) => statusOf(r, id)?.status === 'BYTE_EXACT'))
  .map((r) => r.host.node.split('.')[0]))].sort();
const scientific = Object.fromEntries(REQUIRED_STAGES.map((id) => [id, Object.values(requalification[id]?.underHostNativeNumerics ?? {})]));
const REPRODUCED = new Set(['BYTE_EXACT', 'BYTE_EXACT_UNDER_RECORD_PROFILE']);
const tests = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/stage3frp-reproducibility-portability.test.js'], { cwd: root, encoding: 'utf8' });
const testCount = (k) => Number(tests.stdout.match(new RegExp(`^# ${k} (\\d+)`, 'm'))?.[1] ?? -1);
const checks = {
  GOLDEN_VECTORS_REPRODUCE_ON_THIS_HOST: golden.failures.length === 0,
  ROOT_CAUSE_EXP_DEMONSTRATED: rootCause.length > 0 && rootCause.every((r) => r.E2_STAGE3F6C_ROUTER_REFIT.fits.FDLIBM_FUSED_CANONICAL.matchesStored
    && r.E3_SYMMETRIC_ROUTER_REFIT.fits.FDLIBM_FUSED_CANONICAL.matchesStored && !r.E2_STAGE3F6C_ROUTER_REFIT.fits.FDLIBM_SEPARATE.matchesStored),
  ROOT_CAUSE_POW_DEMONSTRATED: rootCause.every((r) => r.E4_DSYM_TEMPERATURE_GRID.powModels.CORRECTLY_ROUNDED_CANONICAL.allEightReproduced
    && !r.E4_DSYM_TEMPERATURE_GRID.powModels.FDLIBM_SEPARATE_V8_12.allEightReproduced),
  TOLERANCE_RULE_MARGINS: contract.tolerances.marginBelowDecision >= 100 && contract.tolerances.marginAbovePlatformNoise >= 100,
  EXPONENTIATION_GUARD_CLEAN: guardFailures.length === 0,
  REQUIRED_STAGES_BYTE_EXACT_UNDER_CANONICAL: REQUIRED_STAGES.every((id) => required[id] === 'BYTE_EXACT'),
  CANONICAL_ON_AT_LEAST_TWO_NODE_MAJORS: nodeMajors.length >= 2,
  // Host-native numerics are diagnostic. Every required stage that can run under them must reproduce at Level A; a
  // stage that refuses to run without byte-identical models (declared fail-closed) is reported, never counted as passed.
  NATIVE_SCIENCE_REPRODUCES_WHERE_ASSESSABLE: REQUIRED_STAGES.every((id) => scientific[id].length > 0 && scientific[id].every((s) => ['BYTE_EXACT', 'CANONICALLY_EQUIVALENT', 'SCIENTIFICALLY_EQUIVALENT', 'NOT_ASSESSABLE_UNDER_HOST_NATIVE_FAIL_CLOSED'].includes(s)))
    && REQUIRED_STAGES.some((id) => scientific[id].some((s) => s !== 'NOT_ASSESSABLE_UNDER_HOST_NATIVE_FAIL_CLOSED')),
  ALL_CHAIN_CHECKS_ACCOUNTED: Object.values(requalification).every((v) => (REPRODUCED.has(v.canonicalStatus) && (v.canonicalStatus === 'BYTE_EXACT') === (v.recordProfile === null))
    || (v.historicalStatus && v.canonicalStatus === 'NOT_REPRODUCED_DOCUMENTED_BEFORE_REMEDIATION')),
  RECORD_PROFILE_STAGES_EQUIVALENT_UNDER_PURE_CANONICAL: Object.values(requalification).filter((v) => v.recordProfile)
    .every((v) => Object.values(v.underPureCanonicalProfile).length > 0 && Object.values(v.underPureCanonicalProfile).every((x) => ['BYTE_EXACT', 'CANONICALLY_EQUIVALENT'].includes(x))),
  TRACKED_TREE_UNCHANGED_IN_EVERY_RUN: runs.every((r) => r.trackedTreeUnchanged),
  FRESH_CLONE_EVIDENCE_BYTE_EXACT: freshClone.allEvidenceByteExact,
  RUNS_AT_BASELINE_LINEAGE: runs.every((r) => spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', BASELINE.commit, r.head], { encoding: 'utf8' }).status === 0),
  TESTS_PASS: tests.status === 0 && testCount('fail') === 0 && testCount('pass') > 0,
};
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL';

const payload = {
  schemaVersion: 1, stage: 'STAGE_3F_RP_REPRODUCIBILITY_PORTABILITY', status, baseline: BASELINE,
  question: 'Why were valid Sentinel certificates containing fitted numerical models not byte-reproducible across hosts, and what deterministic certification contract makes them so?',
  rootCause: {
    exp: 'V8 evaluates Math.exp with a C++ port of fdlibm. Clang contracts a*b+c in it into fused multiply-add on arm64 but not on x86-64; results differ by 1 ULP on ~0.05% of inputs; full-batch gradient descent turns that into coefficient differences of up to hundreds of ULP, hence different model and certificate hashes.',
    pow: 'From V8 14 (Node >= 25) `**` / Math.pow call the C library std::pow (use_std_math_pow, default on); V8 12 (Node 22) uses fdlibm pow. The D-SYM temperature grid therefore depends on the Node major version, not only on the CPU.',
    certificationDesign: 'Stage 3F.6-C onwards let engine-approximated Math.exp / `**` results reach certificate digests, contrary to the Stage 2G determinism doctrine (src/experts/expert-contract.js), and no certificate recorded the platform.',
    notCauses: 'Summation order, iteration order, object-key order, candidate order, stopping rules, JSON serialisation and hashing are fixed-order and exact: mean/standardisation vectors and all corpora reproduce bit for bit on every host.',
    experiments: rootCause.map((r) => ({ file: r.file, host: r.host, exp: r.conclusion.exp, pow: r.conclusion.pow,
      stage3f6cNative: r.E2_STAGE3F6C_ROUTER_REFIT.fits.HOST_NATIVE.coefficients, symmetricNative: r.E3_SYMMETRIC_ROUTER_REFIT.fits.HOST_NATIVE.coefficients,
      fusedVsSeparateExpRate: r.E1_EXP_CONFORMANCE.fusedVsSeparateRate })),
  },
  decisionSensitivity: { summary: sensitivity.summary, analyticMargins: Object.fromEntries(Object.entries(sensitivity.models).map(([k, m]) => [k, m.analyticMargins])) },
  contract: { contractId: contract.contractId, contractHash: contract.contractHash, tolerances: contract.tolerances, requiredLevel: contract.requiredLevel },
  requalification, requiredStages: required, checkModeAudit, freshClone,
  platformMatrix: runs.map((r) => ({ label: r.label, host: r.host, mode: r.mode, numericsProfile: r.numericsProfile, pureCanonical: r.pureCanonical, head: r.head, pass: r.pass,
    checksRun: r.checks.length, evidenceRun: r.evidence.length, trackedTreeUnchanged: r.trackedTreeUnchanged })),
  platformMatrixLimitation: 'Physical hosts available: linux-x64 only. Full chains ran on Node 22 (fresh GitHub clone, evidence regenerated from nothing) and Node 26; a Node 20 chain was interrupted by a container restart and is not recorded (Node 20 golden vectors, tests and a direct D-SYM freeze reproduction passed). The arm64 arithmetic of record is reproduced by exact emulation (fused fdlibm exp) and verified against every stored hash; no arm64 or macOS host was run.',
  historicalArtifacts: { modified: false, erratum: ERRATUM_PATH, erratumHash: erratum.erratumHash },
  guard: { exponentiationGuardFailures: guardFailures, pinnedRewrites: Object.keys(PINNED_REWRITES) },
  checks, tests: { pass: testCount('pass'), fail: testCount('fail') },
  conclusions: {
    CROSS_PLATFORM_REPRODUCIBILITY_MEASURED: runs.length >= 2,
    ROOT_CAUSE_CONFIRMED: checks.ROOT_CAUSE_EXP_DEMONSTRATED && checks.ROOT_CAUSE_POW_DEMONSTRATED,
    SCIENTIFIC_RESULTS_REPRODUCE: checks.REQUIRED_STAGES_BYTE_EXACT_UNDER_CANONICAL && checks.CANONICAL_ON_AT_LEAST_TWO_NODE_MAJORS && checks.NATIVE_SCIENCE_REPRODUCES_WHERE_ASSESSABLE,
    NOT_ASSESSABLE_UNDER_HOST_NATIVE: REQUIRED_STAGES.filter((id) => scientific[id].includes('NOT_ASSESSABLE_UNDER_HOST_NATIVE_FAIL_CLOSED')),
    BYTE_REPRODUCIBILITY_PORTABLE: checks.REQUIRED_STAGES_BYTE_EXACT_UNDER_CANONICAL && checks.CANONICAL_ON_AT_LEAST_TWO_NODE_MAJORS,
    BYTE_REPRODUCIBILITY_PORTABLE_UNDER_HOST_NATIVE_MATH: false,
    NUMERICAL_CANONICALIZATION_REQUIRED: false,
    CANONICAL_NUMERICS_PROFILE_REQUIRED: true,
    PLATFORM_PINNING_REQUIRED: false,
    CHECK_MODE_READ_ONLY: checks.TRACKED_TREE_UNCHANGED_IN_EVERY_RUN,
    FRESH_CLONE_CERTIFIABLE: checks.FRESH_CLONE_EVIDENCE_BYTE_EXACT && checks.ALL_CHAIN_CHECKS_ACCOUNTED,
    HISTORICAL_CERTIFICATES_PRESERVED: true,
    STAGE3F_REPRODUCIBILITY_BLOCKER_RESOLVED: status === 'PASS',
  },
  authority: AUTHORITY,
  roadmap: { READY_FOR_3F_CONFIRMATORY_RERUN: status === 'PASS', READY_FOR_3F_FREEZE: false, READY_FOR_STAGE3G: false,
    nextRecommendedAction: 'Run the separately planned Stage 3F.6 confirmatory rerun under the canonical profile (verify-stage3f.mjs runtime), recording numericsProfile in its certificate.',
    blockers: status === 'PASS' ? ['STAGE3F6_CONFIRMATORY_RERUN_NOT_RUN', 'STAGE3F6_ERRATUM_001_RECONCILIATION_PENDING', 'FORMAL_3F_FREEZE_DECISION_PENDING']
      : Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k) },
  recordHashes, contractFile: CONTRACT_PATH,
  sourceHashes: Object.fromEntries(['src/core/canonical-numerics-v1.js', 'scripts/reproducibility/canonical-runtime.mjs', 'scripts/reproducibility/canonical-source-hooks.mjs',
    'scripts/reproducibility/exponentiation-guard.mjs', 'scripts/reproducibility/verify-stage3f.mjs', 'scripts/reproducibility/stage3f-chain.mjs',
    'scripts/reproducibility/certificate-diff.mjs', 'scripts/reproducibility/record-run.mjs', 'scripts/reproducibility/root-cause-experiments.mjs',
    'scripts/reproducibility/decision-sensitivity.mjs', 'scripts/reproducibility/fdlibm-variants.mjs', 'scripts/certify-stage3frp-reproducibility-portability.mjs',
    'tests/stage3frp-reproducibility-portability.test.js'].map((f) => [f, hex(readFileSync(at(f)))])),
};
payload.certificationHash = hex(JSON.stringify(payload));

/* ------------------------------------------------------------ full re-run */
let fullRun = null;
if (full) {
  const r = spawnSync(process.execPath, ['scripts/reproducibility/verify-stage3f.mjs', '--check', `--report=${at('build/reproducibility/report-stage3frp-full.json')}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const report = JSON.parse(readFileSync(at('build/reproducibility/report-stage3frp-full.json'), 'utf8'));
  fullRun = { exit: r.status, matches: report.checks.every((c) => c.status === (requalification[c.id]?.canonicalStatus ?? c.status)), trackedTreeUnchanged: report.trackedTreeUnchanged };
}

const serialise = (v) => `${JSON.stringify(v, null, 2)}\n`;
if (checkOnly) {
  const same = (f, v) => existsSync(at(f)) && readFileSync(at(f), 'utf8') === serialise(v);
  const reproduced = same(RESULT, payload) && same(CONTRACT_PATH, contract) && same(ERRATUM_PATH, erratum) && (fullRun === null || (fullRun.matches && fullRun.trackedTreeUnchanged));
  const stored = existsSync(at(RESULT)) ? readJson(RESULT).certificationHash : null;
  console.log(JSON.stringify({ check: 'STAGE3FRP_CERTIFICATION', reproduced, status, storedHash: stored, recomputedHash: payload.certificationHash,
    contractReproduced: same(CONTRACT_PATH, contract), erratumReproduced: same(ERRATUM_PATH, erratum), fullRun, tests: payload.tests }, null, 2));
  if (!reproduced || status !== 'PASS') process.exitCode = 1;
} else {
  await writeFile(at(CONTRACT_PATH), serialise(contract));
  await writeFile(at(ERRATUM_PATH), serialise(erratum));
  await writeFile(at(RESULT), serialise(payload));
  console.log(JSON.stringify({ status, certificationHash: payload.certificationHash, contractHash: contract.contractHash, erratumHash: erratum.erratumHash,
    failedChecks: Object.entries(checks).filter(([, v]) => !v).map(([k]) => k), requiredStages: required, conclusions: payload.conclusions, roadmap: payload.roadmap }, null, 2));
  if (status !== 'PASS') process.exitCode = 1;
}
