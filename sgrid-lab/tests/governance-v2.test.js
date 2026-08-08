/* governance-v2.test.js — GUARDRAILS-v2 conformance tests (W0-G)
   House style: plain node, no dependencies, prints a checks object, exits non-zero on failure.
   Usage: node tests/governance-v2.test.js   (run from sgrid-lab/)

   SAFETY: this suite never writes under results-v2.1/scenario-certification/.
   Mutation cases are run against a synthetic archive built in os.tmpdir(). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const G = require('../governance/verify-governance');
const CJ = require('../governance/canonical-json');
const WR = require('../governance/witness-root');

const ROOT = G.defaultRoot();
const FX = path.join(__dirname, 'fixtures', 'governance');
const FROZEN = path.join(ROOT, 'sgrid-lab/results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN, 'governance-v2.test.js');

const results = {};
let failures = 0;

function check(name, actual, expected) {
  const pass = actual === expected;
  results[name] = pass ? 'pass' : `FAIL(expected ${expected}, got ${actual})`;
  if (!pass) failures++;
}
const fx = f => JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8'));

/* ---------- frozen-directory fingerprint, taken before anything runs ---------- */
function frozenFingerprint() {
  const files = [];
  (function walk(d) {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      fs.statSync(p).isDirectory() ? walk(p) : files.push(p);
    }
  })(FROZEN);
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(path.relative(FROZEN, f).split(path.sep).join('/'));
    h.update(fs.readFileSync(f));
  }
  return { count: files.length, digest: h.digest('hex') };
}
const before = frozenFingerprint();

/* ---------- synthetic archive for mutation cases ---------- */
function buildSyntheticArchive() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-gov-'));
  const wdir = path.join(base, 'witnesses');
  fs.mkdirSync(wdir, { recursive: true });
  for (let i = 0; i < 5; i++) {
    fs.writeFileSync(path.join(wdir, `synthetic-${100000 + i}.json`),
      JSON.stringify({ seed: 100000 + i, outcome: i % 2 ? 'complete' : 'failed' }));
  }
  const manifest = { environment_id: 'synthetic', generatedAt: '2026-07-20T00:00:00.000Z' };
  fs.writeFileSync(path.join(base, 'certification.json'), JSON.stringify(manifest));
  const r = WR.witnessRoot(base);
  const att = {
    attestation_version: 1,
    historical_artifact: 'synthetic-v1',
    doctrine_hash: G.measuredDoctrineHash(ROOT),
    historical_manifest_source: path.relative(ROOT, path.join(base, 'certification.json')),
    historical_manifest_file_sha256:
      CJ.hashFileBytes(fs.readFileSync(path.join(base, 'certification.json'))),
    witness_path_base: path.relative(ROOT, base),
    witness_glob: 'witnesses/**/*.json',
    witness_root_algorithm: r.witness_root_algorithm,
    witness_count: r.witness_count,
    witness_root_hash: r.witness_root_hash,
    record_stream_bytes: r.record_stream_bytes,
    first_witness_path: r.first_witness_path,
    last_witness_path: r.last_witness_path,
    original_generated_at: '2026-07-20T00:00:00.000Z',
    original_evidence_modified: false
  };
  return { base, att };
}

/* =======================  POSITIVE CASES  ======================= */

const ctx = G.loadContext(ROOT);

// P1 doctrine manifest carries the correct measured hash
check('P1_doctrine_manifest_verifies', G.verifyDoctrineManifest(ctx).pass, true);

// P2 doctrine text does not contain its own hash
check('P2_doctrine_text_excludes_own_hash',
  fs.readFileSync(path.join(ROOT, G.DOCTRINE_FILE), 'utf8').includes(ctx.measured), false);

// P3 real Stage 1A attestation verifies against the untouched frozen archive
const realAtt = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'docs/governance/stage1a-v1-grandfathering-attestation.json'), 'utf8'));
check('P3_stage1a_attestation_verifies', G.verifyAttestation(realAtt, ctx).pass, true);

// P4 correct doctrine hash on a post-effective manifest
const good = fx('manifest-good.json'); good.doctrine_hash = ctx.measured;
check('P4_correct_doctrine_hash_accepted', G.verifyManifest(good, ctx, new Set()).pass, true);

// P5 pre-effective artifact that IS attestation-listed
check('P5_listed_grandfathering_accepted',
  G.verifyManifest(fx('manifest-pre-effective-listed.json'), ctx, G.grandfatheredSet(ctx)).pass, true);

// P6 disjoint partitions
check('P6_disjoint_partitions_accepted', G.verifyPartitions(fx('partitions-good.json')).pass, true);

// P7 leaf registry whose recorded hash matches its definition
check('P7_leaf_content_hash_accepted', G.verifyLeafRegistry(fx('leaf-registry-good.json')).pass, true);

// P8 promotion run using only certification evidence
check('P8_clean_promotion_run_accepted',
  G.verifyPromotionRun(fx('promotion-run-good.json'), fx('leaf-registry-good.json')).pass, true);

// P9 witness root reproduces the recorded Stage 1A values
const live = WR.witnessRoot(FROZEN);
check('P9_witness_root_reproduces', live.witness_root_hash === realAtt.witness_root_hash, true);
check('P9_witness_count_reproduces', live.witness_count === realAtt.witness_count, true);
check('P9_record_stream_bytes_reproduces', live.record_stream_bytes === realAtt.record_stream_bytes, true);

// P10 canonical JSON is key-order independent and rejects non-finite numbers
check('P10_canonical_json_key_order_independent',
  CJ.hashObject({ b: 1, a: [2, 3] }) === CJ.hashObject({ a: [2, 3], b: 1 }), true);
check('P10_canonical_json_rejects_nonfinite',
  (() => { try { CJ.hashObject({ x: Infinity }); return false; } catch { return true; } })(), true);

// P11 full aggregate verification
check('P11_verify_all_passes', G.verifyAll(ROOT).pass, true);

/* =======================  NEGATIVE CASES  ======================= */

// N1 missing doctrine hash
check('N1_missing_doctrine_hash_rejected',
  G.verifyManifest(fx('manifest-missing-hash.json'), ctx, new Set()).pass, false);

// N2 wrong doctrine hash
check('N2_wrong_doctrine_hash_rejected',
  G.verifyManifest(fx('manifest-wrong-hash.json'), ctx, new Set()).pass, false);

// N3 pre-effective artifact absent from every attestation
check('N3_unlisted_grandfathering_rejected',
  G.verifyManifest(fx('manifest-pre-effective-unlisted.json'), ctx, G.grandfatheredSet(ctx)).pass, false);

// N4 historical manifest mutated (synthetic archive)
{
  const { base, att } = buildSyntheticArchive();
  check('N4a_synthetic_attestation_verifies_before_mutation', G.verifyAttestation(att, ctx).pass, true);
  fs.appendFileSync(path.join(base, 'certification.json'), ' ');
  const r = G.verifyAttestation(att, ctx);
  check('N4b_historical_manifest_mutation_rejected', r.pass, false);
  check('N4c_mutation_detected_on_manifest_check',
    String(r.checks.historicalManifestUnmutated).startsWith('FAIL'), true);
}

// N5 witness file mutated (synthetic archive)
{
  const { base, att } = buildSyntheticArchive();
  const victim = path.join(base, 'witnesses', 'synthetic-100002.json');
  const orig = fs.readFileSync(victim);
  fs.writeFileSync(victim, JSON.stringify({ seed: 100002, outcome: 'complete' })); // flipped
  const r = G.verifyAttestation(att, ctx);
  check('N5a_witness_mutation_rejected', r.pass, false);
  check('N5b_mutation_detected_on_witness_root',
    String(r.checks.witnessRootUnmutated).startsWith('FAIL'), true);
  fs.writeFileSync(victim, orig);
  check('N5c_restoring_bytes_restores_root', G.verifyAttestation(att, ctx).pass, true);
}

// N6 development / certification overlap
check('N6_dev_cert_overlap_rejected',
  G.verifyPartitions(fx('partitions-dev-cert-overlap.json')).pass, false);

// N7 certification / locked-challenge overlap
check('N7_cert_locked_overlap_rejected',
  G.verifyPartitions(fx('partitions-cert-locked-overlap.json')).pass, false);

// N8 nested seed-bank scheme declared
check('N8_nested_seed_bank_scheme_rejected',
  G.verifyPartitions(fx('partitions-nested.json')).pass, false);

// N9 leaf definition changed, version and recorded hash unchanged
check('N9_changed_leaf_unchanged_version_rejected',
  G.verifyLeafRegistry(fx('leaf-registry-changed-unchanged-version.json')).pass, false);

// N10 promotion run reusing evidence exposed during leaf development
check('N10_exposed_evidence_reuse_rejected',
  G.verifyPromotionRun(fx('promotion-run-exposed-evidence.json'), fx('leaf-registry-good.json')).pass, false);

// N11 promotion attempted on the development partition
check('N11_promotion_on_development_partition_rejected',
  G.verifyPromotionRun(fx('promotion-run-development-partition.json'), fx('leaf-registry-good.json')).pass, false);

/* ===============  W0-G.1: EFFECTIVE-DATE CROSS-CHECK (§1.2)  =============== */
{
  const D = path.join(FX, 'doctrine');
  const md = f => fs.readFileSync(path.join(D, f), 'utf8');
  const mf = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

  // live doctrine parses to exactly one well-formed declaration
  const liveDecl = G.parseDoctrineEffectiveAt(fs.readFileSync(path.join(ROOT, G.DOCTRINE_FILE), 'utf8'));
  check('E1_live_doctrine_declaration_parses', liveDecl.ok, true);
  check('E1_live_declaration_value', liveDecl.value, '2026-07-23T00:00:00.000Z');
  check('E1_context_uses_doctrine_text', ctx.effectiveAtSource, 'doctrine-text');

  // reference mentions of the symbol are not parsed as declarations
  check('E2_good_fixture_single_declaration', G.parseDoctrineEffectiveAt(md('doctrine-good.md')).ok, true);
  check('E3_doctrine_manifest_equality_accepted',
    G.verifyEffectiveDate(md('doctrine-good.md'), mf('manifest-timestamp-match.json')).pass, true);

  // four required negatives
  check('E4_timestamps_differing_rejected',
    G.verifyEffectiveDate(md('doctrine-good.md'), mf('manifest-timestamp-mismatch.json')).pass, false);
  check('E5_missing_declaration_rejected',
    G.verifyEffectiveDate(md('doctrine-missing.md'), mf('manifest-timestamp-match.json')).pass, false);
  check('E6_duplicate_declarations_rejected',
    G.verifyEffectiveDate(md('doctrine-duplicate.md'), mf('manifest-timestamp-match.json')).pass, false);
  check('E7_invalid_timestamp_format_rejected',
    G.verifyEffectiveDate(md('doctrine-badformat.md'), mf('manifest-timestamp-match.json')).pass, false);

  // §1.3 audit: no certifiable artifact generated after the boundary lacks an identity block
  const boundary = Date.parse(liveDecl.value);
  const late = [];
  for (const f of G.attestationFiles(ctx)) {
    const a = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.parse(a.original_generated_at) >= boundary) late.push(path.basename(f));
  }
  check('E8_no_post_boundary_artifact_silently_grandfathered', late.length, 0);
}

/* ===============  W0-G.1: FX-FROZEN-WRITE (§7)  =============== */
{
  const FG = require('../governance/frozen-guard');
  const gctx = FG.loadGovernanceContext(ROOT);
  const W = p => FG.checkWritableEvidenceTarget(p, gctx).writable;

  check('FXFW0_registry_derived_from_attestation', gctx.attestation_sources.length > 0, true);
  check('FXFW0_frozen_roots_nonempty', gctx.frozenRoots.length > 0, true);

  // direct, nested, and not-yet-existing children
  check('FXFW1_direct_write_rejected', W(FROZEN), false);
  check('FXFW2_nested_write_rejected', W(path.join(FROZEN, 'witnesses', 'deadline-C0-112682.json')), false);
  check('FXFW3_nonexistent_child_rejected', W(path.join(FROZEN, 'no', 'such', 'file.json')), false);
  check('FXFW3b_marker_file_rejected', W(path.join(FROZEN, '.sentinel-frozen')), false);

  // symlink pointing into frozen territory
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sg-link-'));
  const link = path.join(tmp, 'looks-innocent');
  fs.symlinkSync(FROZEN, link, 'dir');
  check('FXFW4_symlink_into_frozen_rejected', W(path.join(link, 'x.json')), false);
  check('FXFW4b_symlink_nonexistent_child_rejected', W(path.join(link, 'deep', 'x.json')), false);

  // scratch is allowed; reads are unaffected
  check('FXFW5_scratch_write_allowed', W(path.join(tmp, 'out', 'run.json')), true);
  check('FXFW6_read_access_unaffected',
    fs.readFileSync(path.join(FROZEN, 'certification.json')).length > 0, true);

  // the throwing form must not mutate anything
  const pre = frozenFingerprint();
  let threw = false, code = null;
  try { FG.assertWritableEvidenceTarget(path.join(FROZEN, 'attempt.json'), gctx); }
  catch (e) { threw = true; code = e.code; }
  const post = frozenFingerprint();
  check('FXFW7_assert_throws', threw, true);
  check('FXFW7_error_code', code, 'FROZEN_WRITE_REFUSED');
  check('FXFW8_no_content_change_after_rejection', post.digest === pre.digest, true);
  check('FXFW8_no_file_count_change_after_rejection', post.count === pre.count, true);
}

/* ===============  W0-S.1: LEAF CLOSURE DRIFT (§6.2)  =============== */
{
  const ENGDIR = path.join(ROOT, 'public_html/azl');
  const liveReg = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/governance/leaf-registry.json'), 'utf8'));
  check('D1_live_leaf_closure_verifies', G.verifyLeafClosure(liveReg, ENGDIR).pass, true);
  check('D1_closure_audit_declared',
    liveReg.leaves[0].implementation.closure_audit.performed, true);

  // adapter UNCHANGED, one dependency drifted -> must still be rejected
  const drift = JSON.parse(JSON.stringify(liveReg));
  drift.leaves[0].implementation.dependency_hashes['azl-util.js'] =
    '0000000000000000000000000000000000000000000000000000000000000000';
  const dr = G.verifyLeafClosure(drift, ENGDIR);
  check('D2_dependency_drift_rejected_with_adapter_unchanged', dr.pass, false);
  check('D2_module_check_still_passes',
    dr.checks['module:reference-heuristic-v1'], 'pass');

  // empty closure is rejected
  const empty = JSON.parse(JSON.stringify(liveReg));
  empty.leaves[0].implementation.dependency_hashes = {};
  check('D3_empty_closure_rejected', G.verifyLeafClosure(empty, ENGDIR).pass, false);

  // undeclared audit is rejected
  const unaudited = JSON.parse(JSON.stringify(liveReg));
  delete unaudited.leaves[0].implementation.closure_audit;
  check('D4_unaudited_closure_rejected', G.verifyLeafClosure(unaudited, ENGDIR).pass, false);
}

/* ---------- frozen directory must be byte-identical afterwards ---------- */
const after = frozenFingerprint();
check('Z1_frozen_file_count_unchanged', after.count === before.count, true);
check('Z2_frozen_digest_unchanged', after.digest === before.digest, true);

/* ---------- report ---------- */
console.log(results);
console.log('measured doctrine hash :', ctx.measured);
console.log('frozen set             :', after.count, 'files, digest', after.digest.slice(0, 16));
console.log(failures === 0
  ? `GOVERNANCE V2 TESTS PASS (${Object.keys(results).length}/${Object.keys(results).length})`
  : `GOVERNANCE V2 TESTS FAIL (${failures}/${Object.keys(results).length})`);
process.exit(failures === 0 ? 0 : 1);
