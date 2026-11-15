// HDISC campaign-entry provenance gate — mechanical, fail-closed GO / NO_GO for a FUTURE campaign.
//   node readiness/campaign-entry-gate.mjs [--declaration <file>] [--bundle-manifest <file>] [--probe]     evaluate and print
//   node readiness/campaign-entry-gate.mjs --write        evaluate (with the clean-checkout probe) and create evidence/HDISC0_READINESS.json (exclusive)
//   node readiness/campaign-entry-gate.mjs verify         recompute and compare with the stored record; writes nothing
// Seven conditions. Each is COMPUTED from repository state; none can be asserted by a flag. A condition that fails, or
// that cannot be evaluated, makes the decision NO_GO. The gate authorizes nothing: GO means only that provenance is not
// the obstacle. A campaign still needs separate owner authorization.
//   G1 verified source custody                  G5 frozen scientific protocol
//   G2 verified excluded-population enforcement G6 no uncommitted source dependency
//   G3 reproducible evaluation environment      G7 no privileged inference leakage
//   G4 independently recoverable evidence
// This stage (H-DISC-0) writes a design and a DRAFT preregistration only, so G5 and G7 cannot pass here by construction.
import { readFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { loadPortableExclusions, contextIdentity, blockFailures, inputFiles, LOADER_ID } from './exclusions/portable-exclusions.mjs';
import { runSelfCheck } from './exclusions/selfcheck.mjs';
import { runEquivalence } from './exclusions/equivalence.mjs';
import { runCleanCheckoutProbe } from './exclusions/clean-checkout.mjs';
import { verifyPins, PINS_FILE } from './exclusions/pin-inputs.mjs';
import { collectEntries, composeManifest, verifyBundle, linkClosure, recordedRuntime, currentRuntime, manifestSelfHash, SK1_LINK_TARGETS, BUNDLE_SCHEMA } from './bundle/evidence-bundle.mjs';
import { validateRecord, RECORD_SCHEMA, FIELDS as BACKUP_RECORD_FIELDS } from './backup/acceptance-record.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..'), REPO = resolve(GA, '../..'), GIT = '/usr/bin/git';
export const READINESS_FILE = resolve(LANE, 'evidence/HDISC0_READINESS.json'), SCHEMA = 'HDISC0_READINESS_V1', DECLARATION_SCHEMA = 'SENTINEL_CAMPAIGN_DECLARATION_V1', FREEZE_SCHEMA = 'SENTINEL_PREREGISTRATION_FREEZE_V1';
export const CONDITIONS = Object.freeze(['G1_VERIFIED_SOURCE_CUSTODY', 'G2_VERIFIED_EXCLUDED_POPULATION_ENFORCEMENT', 'G3_REPRODUCIBLE_EVALUATION_ENVIRONMENT', 'G4_INDEPENDENTLY_RECOVERABLE_EVIDENCE', 'G5_FROZEN_SCIENTIFIC_PROTOCOL', 'G6_NO_UNCOMMITTED_SOURCE_DEPENDENCY', 'G7_NO_PRIVILEGED_INFERENCE_LEAKAGE']);
const sha = (b) => createHash('sha256').update(b).digest('hex'), posix = (p) => p.split(sep).join('/'), readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));
const stable = (v) => (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v));
const cleanEnv = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' });
const git = (...a) => execFileSync(GIT, ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 1 << 28, env: cleanEnv(), stdio: ['ignore', 'pipe', 'ignore'] });
/** Modules that must never be reachable from a policy's inference entry points. */
export const FORBIDDEN_IN_INFERENCE = Object.freeze([/(^|\/)hw1-eval\.mjs$/, /(^|\/)evaluate\.mjs$/, /counterfactual/, /(^|\/)infra\//, /(^|\/)work\//, /failure-diagnosis/, /scripts\/stage3g\/evidence/, /(^|\/)transforms\.mjs$/, /(^|\/)dataset\.mjs$/, /(^|\/)train\.mjs$/]);

// ----------------------------------------------------------------------------------------------------------------------
// Pure evaluation: facts -> decision. Every condition returns PASS only on positive evidence.
// ----------------------------------------------------------------------------------------------------------------------
const cond = (ok, reasons, evidence) => { const why = ok ? [] : reasons.filter(Boolean); return { status: ok ? 'PASS' : 'FAIL', reasons: ok || why.length ? why : ['CONDITION_NOT_MET'], evidence }; };
export function evaluateGate(f) {
  const c = {}, miss = (v, code) => (v ? null : code);
  { const x = f?.custody ?? {}; c.G1_VERIFIED_SOURCE_CUSTODY = cond(Boolean(x.listReadable && x.identities > 0 && x.present === x.identities && x.matching === x.identities && x.tracked === 0 && x.guardManifestIntact === true),
    [miss(x.listReadable, 'CUSTODY_IDENTITY_LIST_UNREADABLE'), miss(x.identities > 0, 'NO_PROTECTED_IDENTITIES_LISTED'), miss(x.present === x.identities, 'PROTECTED_FILE_MISSING'), miss(x.matching === x.identities, 'PROTECTED_FILE_DIFFERS_FROM_RECORDED_IDENTITY'), miss(x.tracked === 0, 'PROTECTED_PATH_TRACKED'), miss(x.guardManifestIntact === true, 'CUSTODY_GUARD_NOT_INTACT')], x); }
  { const x = f?.exclusions ?? {}, eq = x.equivalence ?? {}, pinsOk = x.pinsPresent === true && Array.isArray(x.pinProblems) && x.pinProblems.length === 0, self = x.selfcheck ?? {}, selfOk = self.ok === true && self.positiveOk === true && self.negativeTotal > 0 && self.negativePassed === self.negativeTotal, eqOk = eq.available === true ? eq.identical === true && eq.probeMismatches === 0 : eq.available === false;
    c.G2_VERIFIED_EXCLUDED_POPULATION_ENFORCEMENT = cond(Boolean(x.loaded === true && pinsOk && selfOk && eqOk),
      [miss(x.loaded === true, 'EXCLUSION_CONTEXT_DID_NOT_LOAD'), miss(x.pinsPresent === true, 'EXCLUSION_PINS_MISSING'), ...(x.pinProblems ?? []).map((p) => 'PIN:' + p), miss(self.positiveOk === true, 'POSITIVE_ENFORCEMENT_NOT_DEMONSTRATED'), miss(self.negativeTotal > 0 && self.negativePassed === self.negativeTotal, 'A_NEGATIVE_CONTROL_WAS_NOT_REJECTED'), miss(eqOk, eq.available === true ? 'PORTABLE_CONTEXT_DIFFERS_FROM_HISTORICAL_CONTEXT' : 'EQUIVALENCE_STATE_UNKNOWN')], x); }
  { const x = f?.environment ?? {}; c.G3_REPRODUCIBLE_EVALUATION_ENVIRONMENT = cond(Boolean(x.issuedManifest === true && x.manifestBoundByDeclaration === true && x.verify?.ok === true && x.runtimePinned === true && x.runtimeMatches === true),
    [miss(x.issuedManifest === true, 'NO_ISSUED_EVIDENCE_BUNDLE_MANIFEST'), miss(x.manifestBoundByDeclaration === true, 'BUNDLE_MANIFEST_NOT_BOUND_BY_A_CAMPAIGN_DECLARATION'), miss(x.verify?.ok === true, 'EVIDENCE_BUNDLE_NOT_VERIFIED'), ...(x.verify?.problems ?? []).slice(0, 8).map((p) => 'BUNDLE:' + p), miss(x.runtimePinned === true, 'RUNTIME_NOT_PINNED'), miss(x.runtimeMatches === true, 'RUNTIME_DIFFERS_FROM_PIN')], x); }
  { const x = f?.recovery ?? {}; c.G4_INDEPENDENTLY_RECOVERABLE_EVIDENCE = cond(Boolean(x.recordPresent === true && x.recordTrackedAndUnmodified === true && x.validation?.ok === true),
    [miss(x.recordPresent === true, 'NO_BACKUP_ACCEPTANCE_RECORD'), miss(x.recordTrackedAndUnmodified === true, 'BACKUP_ACCEPTANCE_RECORD_NOT_COMMITTED'), miss(x.validation?.ok === true, 'BACKUP_ACCEPTANCE_RECORD_NOT_VALID'), ...(x.validation?.problems ?? []).map((p) => 'RECORD:' + p)], x); }
  { const x = f?.protocol ?? {}; c.G5_FROZEN_SCIENTIFIC_PROTOCOL = cond(Boolean(x.declared === true && x.freezeRecordPresent === true && x.freezeRecordTrackedAndUnmodified === true && x.status === 'FROZEN' && x.protocolHashMatches === true && x.protocolTrackedAndUnmodified === true),
    [miss(x.declared === true, 'NO_CAMPAIGN_DECLARATION'), miss(x.freezeRecordPresent === true, 'NO_PREREGISTRATION_FREEZE_RECORD'), miss(x.freezeRecordTrackedAndUnmodified === true, 'FREEZE_RECORD_NOT_COMMITTED'), miss(x.status === 'FROZEN', 'PROTOCOL_STATUS_IS_NOT_FROZEN:' + String(x.status ?? 'none')), miss(x.protocolHashMatches === true, 'PROTOCOL_DOCUMENT_DOES_NOT_MATCH_THE_FREEZE_HASH'), miss(x.protocolTrackedAndUnmodified === true, 'PROTOCOL_DOCUMENT_NOT_COMMITTED')], x); }
  { const x = f?.source ?? {}, k = x.closure ?? {}; c.G6_NO_UNCOMMITTED_SOURCE_DEPENDENCY = cond(Boolean(x.declared === true && k.files > 0 && (k.trackedModified ?? [1]).length === 0 && (k.untrackedOther ?? [1]).length === 0 && (k.unresolved ?? [1]).length === 0 && (k.protectedNotBundleVerified ?? [1]).length === 0),
    [miss(x.declared === true, 'SOURCE_CLOSURE_NOT_DECLARED'), miss(k.files > 0, 'SOURCE_CLOSURE_EMPTY'), ...(k.trackedModified ?? []).slice(0, 5).map((p) => 'TRACKED_MODIFIED:' + p), ...(k.untrackedOther ?? []).slice(0, 5).map((p) => 'UNTRACKED_UNPROTECTED_SOURCE:' + p), ...(k.unresolved ?? []).slice(0, 5).map((p) => 'UNRESOLVED:' + p), (k.protectedNotBundleVerified ?? []).length ? `PROTECTED_SOURCE_NOT_BUNDLE_VERIFIED:${k.protectedNotBundleVerified.length} files` : null], x); }
  { const x = f?.inference ?? {}, a = x.audit ?? {}; c.G7_NO_PRIVILEGED_INFERENCE_LEAKAGE = cond(Boolean(x.declared === true && x.implemented === true && a.files > 0 && a.evaluatorFree === true && (a.violations ?? [1]).length === 0),
    [miss(x.declared === true, 'INFERENCE_CLOSURE_NOT_DECLARED'), miss(x.implemented === true, 'NOT_APPLICABLE_YET:no policy implementation exists'), ...(a.violations ?? []).slice(0, 8).map((p) => 'INFERENCE:' + p), miss(x.implemented !== true || a.files > 0, 'INFERENCE_CLOSURE_NOT_AUDITED'), miss(x.implemented !== true || a.evaluatorFree === true, 'INFERENCE_GRAPH_NOT_EVALUATOR_FREE')], x); }
  for (const k of CONDITIONS) if (!c[k] || (c[k].status !== 'PASS' && c[k].status !== 'FAIL')) c[k] = { status: 'FAIL', reasons: ['CONDITION_NOT_EVALUABLE'], evidence: null };
  const failing = CONDITIONS.filter((k) => c[k].status !== 'PASS');
  return { decision: failing.length === 0 ? 'GO' : 'NO_GO', passed: CONDITIONS.length - failing.length, of: CONDITIONS.length, failing, conditions: Object.fromEntries(CONDITIONS.map((k) => [k, c[k]])),
    statement: failing.length === 0 ? 'Provenance is not the obstacle. A campaign still requires separate owner authorization.' : 'NO_GO: a future campaign may not start. Every failing condition must be met by evidence, not by assertion.' };
}

// ----------------------------------------------------------------------------------------------------------------------
// Fact collection from the real repository
// ----------------------------------------------------------------------------------------------------------------------
const trackedUnmodified = (rel) => { try { git('cat-file', '-e', `HEAD:${rel}`); } catch { return false; } return existsSync(resolve(REPO, rel)) && git('status', '--porcelain', '--', rel).trim() === ''; };
function custodyFacts() {
  try { const common = git('rev-parse', '--path-format=absolute', '--git-common-dir').trim(), rows = readFileSync(resolve(common, 'custody/protected-identities.tsv'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')).filter((c) => c.length >= 5).map((c) => ({ path: c[1], sha256: c[3] }));
    const present = rows.filter((r) => existsSync(resolve(REPO, r.path))), matching = present.filter((r) => sha(readFileSync(resolve(REPO, r.path))) === r.sha256), tracked = rows.length ? git('ls-files', '-z', '--', ...rows.map((r) => r.path)).split('\0').filter(Boolean) : [];
    const guard = readFileSync(resolve(common, 'custody/GUARD_MANIFEST.sha256'), 'utf8').split('\n').filter(Boolean).map((l) => { const [h, file] = l.split(/\s+/); return existsSync(resolve(common, file)) && sha(readFileSync(resolve(common, file))) === h; });
    return { listReadable: true, identities: rows.length, present: present.length, matching: matching.length, tracked: tracked.length, guardManifestIntact: guard.length > 0 && guard.every(Boolean), guardFiles: guard.length, protectedPaths: rows.map((r) => r.path) };
  } catch (e) { return { listReadable: false, identities: 0, present: 0, matching: 0, tracked: 0, guardManifestIntact: false, error: String(e.message).split('\n')[0].slice(0, 120), protectedPaths: [] }; }
}
async function exclusionFacts({ probe }) {
  const out = { loader: LOADER_ID, loaded: false, pinsPresent: existsSync(PINS_FILE), pinProblems: null };
  try { const ctx = loadPortableExclusions(), id = contextIdentity(ctx); out.loaded = true; out.contextIdentitySha256 = id.identitySha256; out.forbiddenBlocks = id.forbiddenBlocks; out.registries = id.registries; out.strictCounts = { ...ctx.strict.counts, excludedBlocks: ctx.strict.counts.excludedBlocks }; out.inputs = inputFiles().length;
    const free = []; for (let b = 100; b <= 999; b++) if (blockFailures(ctx, b).length === 0) free.push(b); const ranges = []; for (const b of free) { const r = ranges[ranges.length - 1]; if (r && r[1] === b - 1) r[1] = b; else ranges.push([b, b]); }
    out.blocksNotRejectedByTheContext = { count: free.length, ranges, of: 900, note: 'Blocks 100-999 that this exclusion context does not reject. NOT an allocation and NOT a statement that they are unused: only a future, authorized allocator may reserve a namespace, after its own preflight.' };
  } catch (e) { out.error = String(e.message).slice(0, 160); }
  out.pinProblems = out.pinsPresent ? verifyPins(readJ(PINS_FILE)) : ['PINS_FILE_MISSING'];
  try { const s = runSelfCheck(); out.selfcheck = { ok: s.ok, positiveOk: s.positive.ok, positive: { candidateClasses: s.positive.candidateClasses, synthetic: true }, negativeTotal: s.negativeControls.total, negativePassed: s.negativeControls.passed, byGroup: s.negativeControls.byGroup, failed: s.negativeControls.failed }; } catch (e) { out.selfcheck = { ok: false, error: String(e.message).slice(0, 160) }; }
  const eq = await runEquivalence(); out.equivalence = eq.available ? { available: true, identical: eq.identical, constantsEqual: eq.constantsEqual, contextIdentityEqual: eq.contextIdentityEqual, probeVectors: eq.probeVectors, probeMismatches: eq.probeMismatches, byGroup: eq.byGroup, historicalIdentitySha256: eq.historicalIdentitySha256 } : { available: false, reason: eq.reason, note: 'not re-measured here; the pins bind the loader source, inputs and context identity that were shown identical when the pins were written' };
  if (probe) { try { const p = runCleanCheckoutProbe(); out.cleanCheckout = { ok: p.ok, exportedTrackedInputs: p.contents.trackedInputsExported, protectedFilesInExport: p.contents.protectedFilesPresent.length, workDataInExport: p.contents.workDataPresent.length, loaderImportsOnlyNodeBuiltins: p.closure.loaderImportsOnlyNodeBuiltins, selfcheckOk: p.selfcheck.ok, negativeControls: p.selfcheck.negativeControls && { total: p.selfcheck.negativeControls.total, passed: p.selfcheck.negativeControls.passed }, contextIdentitySha256: p.selfcheck.contextIdentitySha256, historicalLoaders: p.historicalLoadersInTheSameExport }; } catch (e) { out.cleanCheckout = { ok: false, error: String(e.message).slice(0, 160) }; } }
  return out;
}
function environmentFacts({ declaration, bundleManifestFile, custody }) {
  const pinned = (() => { try { return recordedRuntime(REPO); } catch { return null; } })(), now = currentRuntime(), out = { issuedManifest: false, manifestBoundByDeclaration: false, runtimePinned: Boolean(pinned?.node), runtimeMatches: Boolean(pinned && pinned.node === now.node && pinned.platform === now.platform), pinnedRuntime: pinned && { node: pinned.node, platform: pinned.platform }, currentRuntime: now, verify: null };
  if (bundleManifestFile && existsSync(bundleManifestFile)) { try { const m = readJ(bundleManifestFile); out.issuedManifest = m.schema === BUNDLE_SCHEMA && m.manifestSha256 === manifestSelfHash(m); out.bundleId = m.bundleId ?? null; out.manifestSha256 = m.manifestSha256 ?? null; out.manifestBoundByDeclaration = Boolean(declaration?.evidenceBundle?.manifestSha256) && declaration.evidenceBundle.manifestSha256 === m.manifestSha256; const v = verifyBundle(m, REPO); out.verify = { ok: v.ok, problems: v.problems, canLink: v.canLink }; } catch (e) { out.verify = { ok: false, problems: ['MANIFEST_UNREADABLE:' + String(e.message).slice(0, 60)] }; } }
  // informational only: what a manifest issued from THIS working tree would contain. It is not an issued bundle and does not satisfy the condition.
  if (custody.listReadable && custody.matching === custody.identities) { try { const c = collectEntries({ repo: REPO }), m = composeManifest({ entries: c.entries, baseCommit: c.head, runtime: pinned, linkTargets: c.linkTargets }), v = verifyBundle(m, REPO);
    out.informationalLocalScope = { note: 'computed in memory from this working tree; NOT an issued, owner-held bundle', counts: m.counts, bytes: m.bytes, entriesSha256: m.entriesSha256, sk1EvaluationClosureProtectedFiles: m.entries.filter((e) => e.class === 'PROTECTED_SOURCE' && e.role === 'SK1_EVALUATION_CLOSURE').length, localSelfVerification: { ok: v.ok, problems: v.problems.slice(0, 5), canLink: v.canLink, filesInLinkClosure: v.filesInLinkClosure }, entries: m.entries.map((e) => ({ path: e.path, class: e.class, role: e.role, sha256: e.sha256, size: e.size })) }; } catch (e) { out.informationalLocalScope = { error: String(e.message).slice(0, 160) }; } }
  return out;
}
function recoveryFacts({ declaration, protocol }) {
  const rel = declaration?.backupAcceptanceRecord ?? posix(relative(REPO, resolve(LANE, 'evidence/BACKUP_ACCEPTANCE_RECORD.json'))), abs = resolve(REPO, rel), out = { recordPath: rel, recordPresent: existsSync(abs), recordTrackedAndUnmodified: false, validation: null, schema: RECORD_SCHEMA };
  let volumes = []; try { volumes = execFileSync('/bin/ls', ['/Volumes'], { encoding: 'utf8' }).split('\n').filter(Boolean); } catch { /* not macOS */ }
  let tm = 'UNKNOWN'; try { tm = execFileSync('/usr/bin/tmutil', ['destinationinfo'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n')[0]; } catch (e) { tm = String(e.stderr ?? e.stdout ?? e.message).trim().split('\n')[0]; }
  out.currentFacts = { volumesMounted: volumes.length, externalVolumeCandidates: Math.max(0, volumes.length - 1), timeMachine: tm };
  if (out.recordPresent) { out.recordTrackedAndUnmodified = trackedUnmodified(rel); const head = git('rev-parse', 'HEAD').trim(), isAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
    try { out.validation = validateRecord(readJ(abs), { isAncestor, currentHead: head, mustContain: protocol?.freezeCommit ? [protocol.freezeCommit] : [] }); } catch (e) { out.validation = { ok: false, problems: ['UNREADABLE:' + String(e.message).slice(0, 60)] }; } }
  return out;
}
function protocolFacts({ declaration }) {
  const out = { declared: Boolean(declaration), campaignId: declaration?.campaignId ?? null, freezeRecordPresent: false, freezeRecordTrackedAndUnmodified: false, status: 'NONE', protocolHashMatches: false, protocolTrackedAndUnmodified: false, freezeSchema: FREEZE_SCHEMA };
  const draft = posix(relative(REPO, resolve(LANE, 'H_DISC_0_PREREGISTRATION_DRAFT.md'))); out.draft = { path: draft, present: existsSync(resolve(REPO, draft)), note: 'a draft is not a frozen protocol' }; if (out.draft.present) out.status = 'DRAFT';
  const rel = declaration?.preregistration?.freezeRecord; if (!rel) return out; const abs = resolve(REPO, rel); out.freezeRecordPresent = existsSync(abs); if (!out.freezeRecordPresent) return out;
  out.freezeRecordTrackedAndUnmodified = trackedUnmodified(rel);
  try { const fr = readJ(abs); out.status = fr.schema === FREEZE_SCHEMA && fr.campaignId === declaration.campaignId ? fr.status : 'UNKNOWN_FREEZE_SCHEMA'; const doc = fr.protocol?.file; if (doc && existsSync(resolve(REPO, doc))) { out.protocolHashMatches = sha(readFileSync(resolve(REPO, doc))) === fr.protocol.sha256; out.protocolTrackedAndUnmodified = trackedUnmodified(doc); }
    try { out.freezeCommit = git('log', '-1', '--format=%H', '--', rel).trim() || null; } catch { out.freezeCommit = null; } } catch { out.status = 'UNREADABLE_FREEZE_RECORD'; }
  return out;
}
function classifyClosure(entries, custody, bundleVerified) {
  const k = linkClosure(REPO, entries), prot = new Set(custody.protectedPaths), tracked = new Set(k.files.length ? git('ls-files', '-z', '--', ...k.files).split('\0').filter(Boolean) : []);
  const dirty = new Set(git('status', '--porcelain', '--', ...(k.files.length ? k.files : ['.'])).split('\n').filter((l) => l && !l.startsWith('??')).map((l) => l.slice(3)));
  const protectedFiles = k.files.filter((p) => prot.has(p));
  return { files: k.files.length, trackedEqualsHead: k.files.filter((p) => tracked.has(p) && !dirty.has(p)).length, trackedModified: k.files.filter((p) => tracked.has(p) && dirty.has(p)), untrackedOther: k.files.filter((p) => !tracked.has(p) && !prot.has(p)), unresolved: k.unresolved, protectedFiles: protectedFiles.length, protectedNotBundleVerified: bundleVerified ? [] : protectedFiles };
}
function sourceFacts({ declaration, custody, environment }) {
  const bundleVerified = environment.issuedManifest && environment.manifestBoundByDeclaration && environment.verify?.ok === true, out = { declared: Array.isArray(declaration?.sourceEntryPoints) && declaration.sourceEntryPoints.length > 0, closure: null };
  if (out.declared) out.closure = classifyClosure(declaration.sourceEntryPoints, custody, bundleVerified);
  // informational: the SK1 evaluation closure as it stands, to show what a declaration of the same shape would meet today
  try { const k = classifyClosure(SK1_LINK_TARGETS, custody, false); out.informationalSk1EvaluationClosure = { note: 'NOT a campaign declaration; the SK1 evaluation entry points, classified as a future declaration would be', files: k.files, trackedEqualsHead: k.trackedEqualsHead, trackedModified: k.trackedModified, untrackedOther: k.untrackedOther, unresolved: k.unresolved, protectedFiles: k.protectedFiles, protectedBundleVerified: false }; } catch (e) { out.informationalSk1EvaluationClosure = { error: String(e.message).slice(0, 120) }; }
  return out;
}
function inferenceFacts({ declaration, custody }) {
  const eps = declaration?.inferenceEntryPoints, out = { declared: Array.isArray(eps) && eps.length > 0, implemented: false, audit: null, forbiddenPatterns: FORBIDDEN_IN_INFERENCE.map(String) };
  if (!out.declared) return out; out.implemented = eps.every((e) => existsSync(resolve(REPO, e))); if (!out.implemented) return out;
  const k = classifyClosure(eps, custody, false), files = linkClosure(REPO, eps).files, violations = [...files.filter((p) => FORBIDDEN_IN_INFERENCE.some((re) => re.test(p))).map((p) => 'EVALUATOR_OR_PRIVILEGED_MODULE:' + p), ...files.filter((p) => custody.protectedPaths.includes(p)).map((p) => 'CUSTODY_PROTECTED_MODULE:' + p), ...k.unresolved.map((p) => 'UNRESOLVED:' + p), ...k.trackedModified.map((p) => 'UNCOMMITTED:' + p), ...k.untrackedOther.map((p) => 'UNTRACKED:' + p)];
  out.audit = { files: files.length, evaluatorFree: violations.length === 0, violations }; return out;
}
function loadDeclaration(file) { if (!file) return { declaration: null, problem: null }; try { const d = readJ(file); if (d.schema !== DECLARATION_SCHEMA || typeof d.campaignId !== 'string') return { declaration: null, problem: 'DECLARATION_UNKNOWN_SCHEMA' }; return { declaration: d, problem: null }; } catch (e) { return { declaration: null, problem: 'DECLARATION_UNREADABLE:' + String(e.message).slice(0, 60) }; } }

export async function collectFacts({ declarationFile = null, bundleManifestFile = null, probe = false } = {}) {
  const { declaration, problem } = loadDeclaration(declarationFile), custody = custodyFacts(), exclusions = await exclusionFacts({ probe }), environment = environmentFacts({ declaration, bundleManifestFile, custody }), protocol = protocolFacts({ declaration });
  const recovery = recoveryFacts({ declaration, protocol }), source = sourceFacts({ declaration, custody, environment }), inference = inferenceFacts({ declaration, custody });
  const { protectedPaths, ...custodyPublic } = custody;
  return { campaign: { declared: Boolean(declaration), campaignId: declaration?.campaignId ?? 'HDISC-1 (not declared; H-DISC-0 is design only)', declarationProblem: problem, declarationSchema: DECLARATION_SCHEMA }, custody: custodyPublic, exclusions, environment, recovery, protocol, source, inference };
}

/** The parts of a readiness record that do not depend on time or on which commit is checked out. */
export function coreOf(facts, gate) {
  const e = facts.exclusions, env = facts.environment;
  return { decision: gate.decision, conditionStatus: Object.fromEntries(CONDITIONS.map((k) => [k, gate.conditions[k].status])), failing: gate.failing,
    custody: { identities: facts.custody.identities, matching: facts.custody.matching, tracked: facts.custody.tracked, guardManifestIntact: facts.custody.guardManifestIntact },
    exclusions: { loader: e.loader, contextIdentitySha256: e.contextIdentitySha256 ?? null, forbiddenBlocks: e.forbiddenBlocks ?? null, registries: e.registries ?? null, pinProblems: e.pinProblems, selfcheck: e.selfcheck && { ok: e.selfcheck.ok, positiveOk: e.selfcheck.positiveOk, negativeTotal: e.selfcheck.negativeTotal, negativePassed: e.selfcheck.negativePassed }, equivalenceIdentical: e.equivalence?.available ? e.equivalence.identical : null },
    environment: { issuedManifest: env.issuedManifest, pinnedRuntime: env.pinnedRuntime, localScope: env.informationalLocalScope && { counts: env.informationalLocalScope.counts, entriesSha256: env.informationalLocalScope.entriesSha256 } },
    recovery: { recordPresent: facts.recovery.recordPresent }, protocolStatus: facts.protocol.status === 'DRAFT' || facts.protocol.status === 'NONE' ? 'NOT_FROZEN' : facts.protocol.status, inferenceImplemented: facts.inference.implemented };
}
export async function evaluateRepository(opts = {}) { const facts = await collectFacts(opts), gate = evaluateGate(facts); return { facts, gate, core: coreOf(facts, gate) }; }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; }, mode = a[0] === 'verify' ? 'verify' : a.includes('--write') ? 'write' : 'print';
  const { facts, gate, core } = await evaluateRepository({ declarationFile: opt('--declaration'), bundleManifestFile: opt('--bundle-manifest'), probe: mode === 'write' || a.includes('--probe') });
  const summary = { mode, campaign: facts.campaign.campaignId, decision: gate.decision, passed: `${gate.passed} of ${gate.of}`, conditions: Object.fromEntries(CONDITIONS.map((k) => [k, gate.conditions[k].status === 'PASS' ? 'PASS' : 'FAIL: ' + gate.conditions[k].reasons.join('; ')])), BACKUP_VERIFIED: gate.conditions.G4_INDEPENDENTLY_RECOVERABLE_EVIDENCE.status === 'PASS' };
  if (mode === 'verify') { const stored = existsSync(READINESS_FILE) ? readJ(READINESS_FILE) : null, same = Boolean(stored) && stored.schema === SCHEMA && stable(stored.core) === stable(core) && stored.coreSha256 === sha(stable(core));
    console.log(JSON.stringify({ ...summary, storedCoreSha256: stored?.coreSha256 ?? null, recomputedCoreSha256: sha(stable(core)), wroteAnything: false }, null, 1)); console.log(same ? 'HDISC0_READINESS_VERIFY_PASS' : 'HDISC0_READINESS_VERIFY_FAILED'); if (!same) process.exitCode = 1; }
  else { console.log(JSON.stringify(summary, null, 1)); console.log(gate.decision === 'GO' ? 'CAMPAIGN_ENTRY_GATE=GO' : 'CAMPAIGN_ENTRY_GATE=NO_GO');
    if (mode === 'write') { const rec = { schema: SCHEMA, authority: 'R0', stage: 'STAGE3H H-DISC-0 Gate 5', generatedAt: new Date().toISOString(), observedAtHead: git('rev-parse', 'HEAD').trim(), node: process.version,
      disclosure: 'Identities only: paths, sizes and sha256. No seed, world hash or evaluator truth. `core` is what `verify` recomputes; everything else is a dated observation. Nothing was copied, uploaded, allocated, generated, trained or evaluated.',
      BACKUP_VERIFIED: false, mustNotBeClaimed: ['that the historical exclusion loaders are importable from a clean checkout (only the new portable loader is)', 'that evaluation is reproducible from a clean checkout alone (the protected source and local data are still required)', 'that an evidence bundle or a backup exists (only the tooling and the acceptance procedure do)', 'that any block is allocated or free', 'that a campaign is authorized or ready'],
      backupAcceptanceRecordFields: BACKUP_RECORD_FIELDS, gate, coreSha256: sha(stable(core)), core, facts };
      const fd = openSync(READINESS_FILE, 'wx'); writeSync(fd, JSON.stringify(rec, null, 1) + '\n'); closeSync(fd); console.log('written evidence/HDISC0_READINESS.json'); } }
}
