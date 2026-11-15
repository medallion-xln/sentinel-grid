// H-DISC-1 readiness — DRAFT manifest of the SENTINEL_EVIDENCE_BUNDLE_V1 a campaign would need, and what ISSUING one means.
//   node readiness/evidence-bundle-manifest.mjs            build the draft in memory, verify the working tree against it, print
//   node readiness/evidence-bundle-manifest.mjs --write    also create evidence/HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT.json (exclusive)
//   node readiness/evidence-bundle-manifest.mjs verify     recompute; compare the state-independent core with the stored draft; writes nothing
//
// A bundle is the material a protected evaluation needs that git does not hold: the custody-protected source files,
// the gitignored scientific data, and the custody control files that live inside .git.
// THIS TOOL READS AND HASHES. It never copies, packs, moves or transmits a file, and it never issues a bundle.
// The draft is IDENTITIES ONLY (path, class, role, sha256, size, mode). It contains no file content, seed or world hash.
//
// DRAFT_NOT_ISSUED is not a formality. A draft describes what THIS working tree holds. An ISSUED bundle is an owner act:
// the listed files placed in an owner-held encrypted container on offline media, verified there, with named recipients,
// and recorded in a committed SENTINEL_EVIDENCE_BUNDLE_ISSUANCE_V1 record. Only an issued bundle can satisfy the
// campaign-entry condition "reproducible evaluation environment".
import { readFileSync, existsSync, openSync, writeSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectEntries, composeManifest, verifyBundle, recordedRuntime, currentRuntime, manifestSelfHash, BUNDLE_SCHEMA, CLASSES } from '../../stage3h-hdisc0-design-v1/readiness/bundle/evidence-bundle.mjs';
import { LANE, REPO, sha, stable, readJ, head } from './lib.mjs';

export const DRAFT_FILE = resolve(LANE, 'evidence/HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT.json'), DRAFT_SCHEMA = 'HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT_V1', DRAFT_STATUS = 'DRAFT_NOT_ISSUED';
export const ISSUANCE_SCHEMA = 'SENTINEL_EVIDENCE_BUNDLE_ISSUANCE_V1', RECIPIENT_PLACEHOLDER = 'TO_BE_NAMED_BY_THE_OWNER', ENCRYPTIONS = Object.freeze(['AES-256_SPARSEBUNDLE', 'ENCRYPTED_VOLUME']);
export const SUPERSESSION_RULE = 'bundleVersion is an integer starting at 1. A later bundle must carry a higher version and name the manifestSha256 it supersedes; a verifier given --minimum-version refuses an older one. A campaign that adds its own populations issues a new version; it never edits an issued one.';
export const WHAT_ISSUING_REQUIRES = Object.freeze([
  'The owner provides approved offline storage and creates an encrypted container on it (AES-256 sparsebundle, or an encrypted APFS volume).',
  'The owner places every listed file in the container at its listed path, from this working tree.',
  'The owner names the recipients. The placeholder is not a recipient.',
  'The owner builds the manifest with `evidence-bundle.mjs manifest --recipient <name> --out <path outside the repository>` and verifies the placed files with `evidence-bundle.mjs verify`.',
  'The owner writes a SENTINEL_EVIDENCE_BUNDLE_ISSUANCE_V1 record binding the manifest hash, the container, the recipients and the verification output, and commits that record.',
  'The campaign declaration then names the manifest hash. Until all of this exists the bundle is NOT issued.']);
export const ISSUANCE_FIELDS = Object.freeze({ schema: ISSUANCE_SCHEMA, manifestSha256: 'sha256 of the issued manifest', bundleId: 'as in the manifest', bundleVersion: 'integer', issuedBy: '{ role: "OWNER", name } — a human; a model or script may not issue', issuedAt: 'date of issue',
  container: '{ custody: "OWNER_HELD_ENCRYPTED_CONTAINER", encryption: one of ' + ENCRYPTIONS.join(' | ') + ', label, transport: "OFFLINE_MEDIA_ONLY" }', recipients: 'named recipients; at least one; no placeholder',
  placementVerification: '{ result: "EVIDENCE_BUNDLE_VERIFIED", outputSha256: sha256 of the exact verifier output }', recordSha256: 'self-hash' });

/** Build the draft from the working tree. Reads and hashes only. */
export function buildDraft() {
  const c = collectEntries({ repo: REPO }), optional = collectEntries({ repo: REPO, includeOptional: true }).entries.filter((e) => !c.entries.some((x) => x.path === e.path));
  if (c.problems.length) throw Error('WORKING_TREE_NOT_BUNDLEABLE:' + c.problems.slice(0, 3).join(','));
  const runtime = recordedRuntime(REPO), manifest = composeManifest({ entries: c.entries, baseCommit: c.head, bundleVersion: 1, supersedes: null, recipients: [RECIPIENT_PLACEHOLDER], runtime, linkTargets: c.linkTargets, purpose: 'inputs of a protected Stage 3H evaluation (SK1 check and the future H-DISC-1 campaign) that are not in git' });
  const v = verifyBundle(manifest, REPO), prot = manifest.entries.filter((e) => e.class === 'PROTECTED_SOURCE');
  // everything that does not depend on which commit is checked out or on when the draft was built
  const core = { bundleSchema: BUNDLE_SCHEMA, status: DRAFT_STATUS, bundleVersion: manifest.bundleVersion, supersedes: null, supersessionRule: SUPERSESSION_RULE, access: manifest.access, runtime: { node: runtime.node, platform: runtime.platform }, counts: manifest.counts, bytes: manifest.bytes, entriesSha256: manifest.entriesSha256,
    protectedSource: { entries: prot.length, inTheSk1EvaluationClosure: prot.filter((e) => e.role === 'SK1_EVALUATION_CLOSURE').length, outsideIt: prot.filter((e) => e.role !== 'SK1_EVALUATION_CLOSURE').length },
    linkTargets: manifest.linkTargets, entries: manifest.entries, optionalDataNotInThisDraft: { entries: optional.length, bytes: optional.reduce((s, e) => s + e.size, 0), what: 'SK1 EXPLORATION class shards, read only by the SK1.1 and SK2-F extraction checks; a bundle built with --include-optional adds them' } };
  return { manifest, core, verification: { ok: v.ok, problems: v.problems, entries: v.entries, entriesPresentAndMatching: v.entriesPresentAndMatching, canLink: v.canLink, filesInLinkClosure: v.filesInLinkClosure, linkTargets: v.linkTargets, checkout: v.checkout, note: 'the working tree verified IN PLACE against the draft. This shows the identities are recoverable and the tooling works. It is not an issued bundle: nothing was placed in a container and nothing left this disk.' } };
}
export function draftRecord() {
  const d = buildDraft();
  return { schema: DRAFT_SCHEMA, authority: 'R0', stage: 'STAGE3H-H-DISC-1', status: DRAFT_STATUS, issued: false, issuedBy: null, generatedAt: new Date().toISOString(), observedAtHead: head(), node: process.version,
    disclosure: 'Identities only: paths, classes, roles, sizes, modes and sha256. No file content, seed, world hash or evaluator truth. Nothing was copied, packed, moved or transmitted.',
    whatIssuingRequires: WHAT_ISSUING_REQUIRES, issuanceRecordSchema: ISSUANCE_SCHEMA, issuanceRecordFields: ISSUANCE_FIELDS, coreSha256: sha(stable(d.core)), core: d.core,
    manifestDraft: { note: 'the manifest as it would be composed from this working tree, with the recipient placeholder. baseCommit and manifestSha256 change with the checked-out commit; the core above does not.', ...d.manifest }, inPlaceVerification: d.verification };
}

/** Is an issuance record valid for a manifest? Pure. A draft, a placeholder recipient or a script as issuer never validates. */
export function validateIssuance(rec, manifest) {
  const problems = [], add = (p) => problems.push(p);
  if (!rec || rec.schema !== ISSUANCE_SCHEMA) return { ok: false, problems: ['ISSUANCE_RECORD_MISSING_OR_UNKNOWN_SCHEMA'] };
  const { recordSha256, ...rest } = rec; if (recordSha256 !== sha(stable(rest))) add('ISSUANCE_RECORD_TAMPERED');
  if (!manifest || manifest.schema !== BUNDLE_SCHEMA) add('MANIFEST_MISSING_OR_UNKNOWN_SCHEMA'); else { if (manifest.manifestSha256 !== manifestSelfHash(manifest)) add('MANIFEST_TAMPERED'); if (rec.manifestSha256 !== manifest.manifestSha256) add('ISSUANCE_DOES_NOT_BIND_THIS_MANIFEST'); if (rec.bundleId !== manifest.bundleId || rec.bundleVersion !== manifest.bundleVersion) add('ISSUANCE_BUNDLE_IDENTITY_MISMATCH');
    if ((manifest.access?.recipients ?? []).includes(RECIPIENT_PLACEHOLDER)) add('MANIFEST_IS_A_DRAFT:recipient placeholder'); if (manifest.status === DRAFT_STATUS) add('MANIFEST_IS_A_DRAFT'); }
  if (rec.issuedBy?.role !== 'OWNER' || typeof rec.issuedBy?.name !== 'string' || !rec.issuedBy.name.trim()) add('ISSUER_IS_NOT_A_NAMED_OWNER'); if (typeof rec.issuedAt !== 'string' || Number.isNaN(Date.parse(rec.issuedAt))) add('ISSUE_DATE_MISSING');
  const c = rec.container ?? {}; if (c.custody !== 'OWNER_HELD_ENCRYPTED_CONTAINER') add('CONTAINER_NOT_OWNER_HELD'); if (!ENCRYPTIONS.includes(c.encryption)) add('CONTAINER_NOT_ENCRYPTED'); if (typeof c.label !== 'string' || !c.label.trim()) add('CONTAINER_LABEL_MISSING'); if (c.transport !== 'OFFLINE_MEDIA_ONLY') add('TRANSPORT_NOT_OFFLINE_ONLY');
  if (!Array.isArray(rec.recipients) || !rec.recipients.length || rec.recipients.some((r) => typeof r !== 'string' || !r.trim() || r === RECIPIENT_PLACEHOLDER)) add('RECIPIENTS_NOT_NAMED');
  const p = rec.placementVerification ?? {}; if (p.result !== 'EVIDENCE_BUNDLE_VERIFIED' || !/^[0-9a-f]{64}$/.test(p.outputSha256 ?? '')) add('PLACEMENT_NOT_VERIFIED');
  return { ok: problems.length === 0, problems };
}
/** Pure composer for the owner's issuance record (used by the tests; the owner fills every argument). */
export function composeIssuance({ manifest, ownerName, issuedAt, encryption, containerLabel, recipients, verifyOutputText }) {
  const rest = { schema: ISSUANCE_SCHEMA, manifestSha256: manifest.manifestSha256, bundleId: manifest.bundleId, bundleVersion: manifest.bundleVersion, issuedBy: { role: 'OWNER', name: ownerName }, issuedAt,
    container: { custody: 'OWNER_HELD_ENCRYPTED_CONTAINER', encryption, label: containerLabel, transport: 'OFFLINE_MEDIA_ONLY' }, recipients: [...recipients].sort(), placementVerification: { result: /EVIDENCE_BUNDLE_VERIFIED\s*$/.test(String(verifyOutputText)) ? 'EVIDENCE_BUNDLE_VERIFIED' : 'NOT_VERIFIED', outputSha256: sha(String(verifyOutputText)) } };
  return { ...rest, recordSha256: sha(stable(rest)) };
}
export { CLASSES, currentRuntime };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2] ?? 'print', rec = draftRecord(), c = rec.core;
  const summary = { mode, status: rec.status, issued: false, entries: c.entries.length, counts: c.counts, bytes: c.bytes, protectedInTheSk1EvaluationClosure: c.protectedSource.inTheSk1EvaluationClosure, entriesSha256: c.entriesSha256, coreSha256: rec.coreSha256, runtime: c.runtime, recipients: c.access.recipients, inPlaceVerification: { ok: rec.inPlaceVerification.ok, entriesPresentAndMatching: rec.inPlaceVerification.entriesPresentAndMatching, canLink: rec.inPlaceVerification.canLink, filesInLinkClosure: rec.inPlaceVerification.filesInLinkClosure, problems: rec.inPlaceVerification.problems } };
  if (mode === 'verify') { const stored = existsSync(DRAFT_FILE) ? readJ(DRAFT_FILE) : null, same = Boolean(stored) && stored.schema === DRAFT_SCHEMA && stored.status === DRAFT_STATUS && stored.coreSha256 === rec.coreSha256 && stable(stored.core) === stable(c) && rec.inPlaceVerification.ok === true;
    console.log(JSON.stringify({ ...summary, storedCoreSha256: stored?.coreSha256 ?? null, wroteAnything: false }, null, 1)); console.log(same ? 'HDISC1_BUNDLE_DRAFT_VERIFY_PASS' : 'HDISC1_BUNDLE_DRAFT_VERIFY_FAILED'); if (!same) process.exitCode = 1; }
  else { console.log(JSON.stringify(summary, null, 1)); console.log('EVIDENCE_BUNDLE=DRAFT_NOT_ISSUED');
    if (mode === '--write') { if (!rec.inPlaceVerification.ok) { console.log('REFUSING_TO_WRITE: the working tree does not verify against its own draft'); process.exitCode = 1; } else { const fd = openSync(DRAFT_FILE, 'wx'); writeSync(fd, JSON.stringify(rec, null, 1) + '\n'); closeSync(fd); console.log('written evidence/HDISC1_EVIDENCE_BUNDLE_MANIFEST_DRAFT.json'); } } }
}
