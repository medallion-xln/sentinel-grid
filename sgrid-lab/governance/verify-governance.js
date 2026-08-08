/* verify-governance.js — guardrails-v2 conformance verifier (GUARDRAILS-v2 §8)
   Recomputes every value it checks. A recorded value is never accepted on trust.
   Usage: node verify-governance.js [all|doctrine|grandfathering|partitions|leaf] [--root DIR] */
'use strict';
const fs = require('fs');
const path = require('path');
const CJ = require('./canonical-json');
const WR = require('./witness-root');

const DOCTRINE_ID = 'guardrails';
const DOCTRINE_VERSION = 2;
const MANIFEST_SCHEMA_VERSION = 2;
const DOCTRINE_FILE = 'docs/governance/GUARDRAILS-v2.md';
const DOCTRINE_MANIFEST = 'docs/governance/guardrails-v2-manifest.json';
const ATTESTATION_GLOB_DIR = 'docs/governance';

const ok = () => 'pass';
const bad = r => 'FAIL(' + r + ')';
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

/* Repo root defaults to the parent of sgrid-lab/. */
function defaultRoot() { return path.resolve(__dirname, '..', '..'); }

function measuredDoctrineHash(root) {
  return CJ.hashFileBytes(fs.readFileSync(path.join(root, DOCTRINE_FILE)));
}

/* ---------- §1.2 effective-date: doctrine text is authoritative ----------
   The doctrine file is hash-bound; the manifest merely repeats the value and
   never independently defines it. Exactly one declaration line is permitted. */

const EFFECTIVE_DECL = /^[ \t]*GUARDRAILS_V2_EFFECTIVE_AT[ \t]*=[ \t]*(\S+)[ \t]*$/gm;
const ISO_STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/* Returns {ok, value, reason}. Never throws — callers report rather than crash. */
function parseDoctrineEffectiveAt(text) {
  EFFECTIVE_DECL.lastIndex = 0;
  const found = [...text.matchAll(EFFECTIVE_DECL)].map(m => m[1]);
  if (found.length === 0) return { ok: false, value: null, reason: 'no GUARDRAILS_V2_EFFECTIVE_AT declaration in doctrine text' };
  if (found.length > 1) return { ok: false, value: null, reason: 'duplicate declarations (' + found.length + ') in doctrine text' };
  const v = found[0];
  if (!ISO_STRICT.test(v)) return { ok: false, value: v, reason: 'declaration is not strict ISO-8601 UTC millis: ' + v };
  if (!Number.isFinite(Date.parse(v))) return { ok: false, value: v, reason: 'declaration is not a parseable instant: ' + v };
  return { ok: true, value: v, reason: null };
}

function verifyEffectiveDate(doctrineText, manifest) {
  const c = {};
  const p = parseDoctrineEffectiveAt(doctrineText);
  c.doctrineDeclarationWellFormed = p.ok ? ok() : bad(p.reason);
  if (!p.ok) return finish(c);
  const m = manifest.effective_at;
  c.manifestRepeatsDeclaration = typeof m === 'string' && m.length > 0 ? ok() : bad('manifest effective_at missing');
  c.doctrineManifestByteEquality = m === p.value
    ? ok() : bad('doctrine "' + p.value + '" != manifest "' + m + '"');
  return finish(c);
}

function loadContext(root) {
  root = root || defaultRoot();
  const dm = readJSON(path.join(root, DOCTRINE_MANIFEST));
  const text = fs.readFileSync(path.join(root, DOCTRINE_FILE), 'utf8');
  const decl = parseDoctrineEffectiveAt(text);
  /* Authoritative source is the hash-bound doctrine text (GUARDRAILS-v2 1.2).
     The manifest value is used only if the doctrine declaration is unusable, and
     verifyDoctrineManifest reports that condition as a failure. */
  return {
    root, doctrineManifest: dm, doctrineText: text,
    measured: measuredDoctrineHash(root),
    effectiveAt: decl.ok ? decl.value : dm.effective_at,
    effectiveAtSource: decl.ok ? 'doctrine-text' : 'manifest-fallback'
  };
}

/* ---------- §1 doctrine identity + effective date ---------- */

function verifyDoctrineManifest(ctx) {
  const c = {}, dm = ctx.doctrineManifest;
  c.doctrineIdentity = (dm.doctrine_id === DOCTRINE_ID && dm.doctrine_version === DOCTRINE_VERSION)
    ? ok() : bad('identity mismatch');
  c.doctrineHashMatchesFile = dm.doctrine_hash === ctx.measured
    ? ok() : bad('recorded ' + dm.doctrine_hash + ' != measured ' + ctx.measured);
  c.doctrineHashAbsentFromDoctrineText = (() => {
    const txt = fs.readFileSync(path.join(ctx.root, DOCTRINE_FILE), 'utf8');
    return txt.includes(ctx.measured) ? bad('doctrine text contains its own hash') : ok();
  })();
  c.effectiveAtPresent = /^\d{4}-\d{2}-\d{2}T/.test(String(dm.effective_at || '')) ? ok() : bad('missing effective_at');
  Object.assign(c, verifyEffectiveDate(ctx.doctrineText, dm).checks);
  c.effectiveAtSource = ctx.effectiveAtSource === 'doctrine-text' ? ok() : bad('fell back to manifest effective_at');
  return finish(c);
}

/* Route a manifest to enforcement or grandfathering by its generation timestamp. */
function verifyManifest(m, ctx, grandfathered) {
  const c = {};
  const t = m.generatedAt || m.generated_at || (m.manifest && m.manifest.timestamp);
  c.hasTimestamp = t ? ok() : bad('no generation timestamp');
  if (!t) return finish(c);

  const future = Date.parse(t) >= Date.parse(ctx.effectiveAt);
  c.route = future ? 'enforced' : 'grandfathered';

  if (future) {
    c.doctrineIdPresent = m.doctrine_id === DOCTRINE_ID ? ok() : bad('missing/incorrect doctrine_id');
    c.doctrineVersionPresent = m.doctrine_version === DOCTRINE_VERSION ? ok() : bad('missing/incorrect doctrine_version');
    c.manifestSchemaVersion = m.manifest_schema_version === MANIFEST_SCHEMA_VERSION ? ok() : bad('missing/incorrect manifest_schema_version');
    c.doctrineHashPresent = typeof m.doctrine_hash === 'string' && m.doctrine_hash.length === 64
      ? ok() : bad('missing doctrine_hash');
    c.doctrineHashMatches = m.doctrine_hash === ctx.measured
      ? ok() : bad('doctrine_hash mismatch');
  } else {
    // §3.2 — date alone never grandfathers; the artifact must be attestation-listed.
    c.attestationListed = grandfathered && grandfathered.has(m.__id)
      ? ok() : bad('pre-effective artifact not listed in any attestation');
  }
  return finish(c);
}

/* ---------- §3 + §4 grandfathering ---------- */

function verifyAttestation(att, ctx) {
  const c = {};
  const src = path.join(ctx.root, att.historical_manifest_source);
  c.historicalSourceExists = fs.existsSync(src) ? ok() : bad('missing ' + att.historical_manifest_source);
  if (fs.existsSync(src)) {
    const h = CJ.hashFileBytes(fs.readFileSync(src));
    c.historicalManifestUnmutated = h === att.historical_manifest_file_sha256
      ? ok() : bad('recomputed ' + h + ' != recorded ' + att.historical_manifest_file_sha256);
  }
  c.canonicalSourceNotMarkdown = /\.md$/i.test(att.historical_manifest_source)
    ? bad('markdown used as canonical source (§3.3)') : ok();

  const base = path.join(ctx.root, att.witness_path_base);
  c.witnessBaseExists = fs.existsSync(base) ? ok() : bad('missing ' + att.witness_path_base);
  if (fs.existsSync(base)) {
    const r = WR.witnessRoot(base, att.witness_glob);
    c.witnessAlgorithm = r.witness_root_algorithm === att.witness_root_algorithm ? ok() : bad('algorithm mismatch');
    c.witnessCount = r.witness_count === att.witness_count
      ? ok() : bad('recomputed ' + r.witness_count + ' != recorded ' + att.witness_count);
    c.witnessRootUnmutated = r.witness_root_hash === att.witness_root_hash
      ? ok() : bad('recomputed ' + r.witness_root_hash + ' != recorded ' + att.witness_root_hash);
    c.recordStreamBytes = r.record_stream_bytes === att.record_stream_bytes
      ? ok() : bad('recomputed ' + r.record_stream_bytes + ' != recorded ' + att.record_stream_bytes);
    c.firstWitnessPath = r.first_witness_path === att.first_witness_path ? ok() : bad('first path mismatch');
    c.lastWitnessPath = r.last_witness_path === att.last_witness_path ? ok() : bad('last path mismatch');
  }
  c.evidenceUnmodifiedFlag = att.original_evidence_modified === false ? ok() : bad('original_evidence_modified is not false');
  c.doctrineHashMatches = att.doctrine_hash === ctx.measured ? ok() : bad('attestation doctrine_hash mismatch');
  return finish(c);
}

function attestationFiles(ctx) {
  const dir = path.join(ctx.root, ATTESTATION_GLOB_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('-grandfathering-attestation.json'))
    .map(f => path.join(dir, f));
}

function grandfatheredSet(ctx) {
  const s = new Set();
  attestationFiles(ctx).forEach(f => { const a = readJSON(f); if (a.historical_artifact) s.add(a.historical_artifact); });
  return s;
}

/* ---------- §5 partitions ---------- */

function verifyPartitions(reg) {
  const c = {};
  const names = ['development', 'certification', 'locked-challenge'];
  const sets = {};
  names.forEach(n => sets[n] = new Set((reg[n] || []).map(String)));
  const pairs = [['development', 'certification'], ['certification', 'locked-challenge'], ['development', 'locked-challenge']];
  for (const [a, b] of pairs) {
    const overlap = [...sets[a]].filter(x => sets[b].has(x));
    c['disjoint:' + a + '|' + b] = overlap.length === 0
      ? ok() : bad('overlap on ' + overlap.slice(0, 5).join(',') + (overlap.length > 5 ? ' +' + (overlap.length - 5) : ''));
  }
  // §5.2 — a nested bank is an overlap even when declared as a "tier".
  c.noNestedTierDeclaration = reg.seed_bank_scheme && /nested/i.test(reg.seed_bank_scheme)
    ? bad('nested seed-bank scheme declared (§5.2)') : ok();
  return finish(c);
}

/* ---------- §6 leaf / search revision ---------- */

function verifyLeafRegistry(reg) {
  const c = {};
  (reg.leaves || []).forEach(L => {
    const h = CJ.hashObject(L.definition);
    c['contentHash:' + L.leaf_version] = h === L.leaf_hash
      ? ok() : bad('definition hash ' + h.slice(0, 12) + ' != recorded ' + String(L.leaf_hash).slice(0, 12));
  });
  const seen = new Map();
  (reg.leaves || []).forEach(L => {
    const prev = seen.get(L.leaf_version);
    if (prev !== undefined && prev !== CJ.hashObject(L.definition)) {
      c['uniqueVersion:' + L.leaf_version] = bad('same version, differing definitions (§6.2)');
    }
    seen.set(L.leaf_version, CJ.hashObject(L.definition));
  });
  return finish(c);
}

/* §6.4 — a promotion run may not use evidence exposed during that leaf's development. */
function verifyPromotionRun(run, reg) {
  const c = {};
  const L = (reg.leaves || []).find(x => x.leaf_version === run.leaf_version);
  c.leafKnown = L ? ok() : bad('unknown leaf_version ' + run.leaf_version);
  if (!L) return finish(c);
  const exposed = new Set((L.exposed_evidence || []).map(String));
  const used = (run.evidence || []).map(String);
  const hit = used.filter(x => exposed.has(x));
  c.noExposedEvidence = hit.length === 0
    ? ok() : bad('promotion used exposed evidence ' + hit.slice(0, 5).join(','));
  c.partitionIsPromotable = run.partition === 'certification' || run.partition === 'locked-challenge'
    ? ok() : bad('promotion run on partition "' + run.partition + '" (§5.1)');
  return finish(c);
}

/* §6.2 extended — a leaf's identity binds its executable closure, not just its
   registry record. Recompute the primary module AND every declared dependency
   from disk; drift in a dependency invalidates the leaf even when the primary
   module is byte-unchanged. */
function verifyLeafClosure(reg, engDir) {
  const c = {};
  for (const L of reg.leaves || []) {
    const impl = L.implementation;
    if (!impl) { c['closureDeclared:' + L.leaf_version] = bad('no implementation block'); continue; }
    const tag = L.leaf_version;
    const mp = path.join(engDir, impl.module);
    if (!fs.existsSync(mp)) { c['module:' + tag] = bad('missing ' + impl.module); continue; }
    const mh = CJ.hashFileBytes(fs.readFileSync(mp));
    c['module:' + tag] = mh === impl.module_sha256
      ? ok() : bad(impl.module + ' drifted: ' + mh.slice(0, 12) + ' != ' + String(impl.module_sha256).slice(0, 12));
    const deps = impl.dependency_hashes || {};
    if (Object.keys(deps).length === 0) c['closureNonEmpty:' + tag] = bad('empty dependency closure');
    for (const [f, recorded] of Object.entries(deps)) {
      const p = path.join(engDir, f);
      if (!fs.existsSync(p)) { c['dep:' + tag + ':' + f] = bad('missing ' + f); continue; }
      const h = CJ.hashFileBytes(fs.readFileSync(p));
      c['dep:' + tag + ':' + f] = h === recorded
        ? ok() : bad(f + ' drifted: ' + h.slice(0, 12) + ' != ' + String(recorded).slice(0, 12));
    }
    c['closureAudited:' + tag] = impl.closure_audit && impl.closure_audit.performed === true
      ? ok() : bad('closure never audited (§6.2)');
  }
  return finish(c);
}

function finish(c) { return { checks: c, pass: Object.values(c).every(v => v === 'pass' || v === 'enforced' || v === 'grandfathered') }; }

/* ---------- aggregate ---------- */

function verifyAll(root) {
  const ctx = loadContext(root);
  const out = {};
  out.doctrine = verifyDoctrineManifest(ctx);
  out.attestations = {};
  attestationFiles(ctx).forEach(f => { out.attestations[path.basename(f)] = verifyAttestation(readJSON(f), ctx); });
  const pass = out.doctrine.pass && Object.values(out.attestations).every(a => a.pass);
  return { measuredDoctrineHash: ctx.measured, effectiveAt: ctx.effectiveAt, results: out, pass };
}

module.exports = {
  DOCTRINE_ID, DOCTRINE_VERSION, MANIFEST_SCHEMA_VERSION, DOCTRINE_FILE,
  defaultRoot, measuredDoctrineHash, loadContext, verifyDoctrineManifest,
  parseDoctrineEffectiveAt, verifyEffectiveDate,
  verifyManifest, verifyAttestation, attestationFiles, grandfatheredSet,
  verifyPartitions, verifyLeafRegistry, verifyLeafClosure, verifyPromotionRun, verifyAll
};

/* ---------- CLI ---------- */
if (require.main === module) {
  const cmd = process.argv[2] || 'all';
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const root = arg('root', defaultRoot());
  if (cmd === 'all') {
    const r = verifyAll(root);
    console.log('measured doctrine hash:', r.measuredDoctrineHash);
    console.log('effective at          :', r.effectiveAt);
    console.log(JSON.stringify(r.results, null, 2));
    console.log(r.pass ? 'GOVERNANCE VERIFY PASS' : 'GOVERNANCE VERIFY FAIL');
    process.exit(r.pass ? 0 : 1);
  } else if (cmd === 'doctrine') {
    const ctx = loadContext(root); const r = verifyDoctrineManifest(ctx);
    console.log(r.checks); console.log(r.pass ? 'DOCTRINE PASS' : 'DOCTRINE FAIL'); process.exit(r.pass ? 0 : 1);
  } else if (cmd === 'grandfathering') {
    const ctx = loadContext(root); let pass = true;
    attestationFiles(ctx).forEach(f => { const r = verifyAttestation(readJSON(f), ctx); pass = pass && r.pass;
      console.log(path.basename(f)); console.log(r.checks); });
    console.log(pass ? 'GRANDFATHERING PASS' : 'GRANDFATHERING FAIL'); process.exit(pass ? 0 : 1);
  } else if (cmd === 'partitions') {
    const r = verifyPartitions(readJSON(arg('registry', path.join(root, 'docs/governance/evidence-partitions.json'))));
    console.log(r.checks); console.log(r.pass ? 'PARTITIONS PASS' : 'PARTITIONS FAIL'); process.exit(r.pass ? 0 : 1);
  } else if (cmd === 'leaf') {
    const reg = readJSON(arg('registry', path.join(root, 'docs/governance/leaf-registry.json')));
    const r = verifyLeafRegistry(reg);
    const cl = verifyLeafClosure(reg, arg('engine', path.join(root, 'public_html/azl')));
    console.log(r.checks); console.log(cl.checks);
    const pass = r.pass && cl.pass;
    console.log(pass ? 'LEAF PASS' : 'LEAF FAIL'); process.exit(pass ? 0 : 1);
  } else console.log('all | doctrine | grandfathering | partitions | leaf  [--root DIR]');
}
