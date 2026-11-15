// Read-only binding and synthetic verification. No native world construction or sealed data access.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProtected } from '../stage3h-canonical-v1/guard.mjs';
import { verifyInheritanceBindings } from '../stage3h-canonical-v1/inheritance.mjs';
const here = dirname(fileURLToPath(import.meta.url)), ga = resolve(here, '..'), root = resolve(ga, '../..');
const hash = x => createHash('sha256').update(x).digest('hex');
const J = p => JSON.parse(readFileSync(resolve(here, p), 'utf8'));
const git = args => execFileSync('git', args, { cwd: root });
const assert = (v, m) => { if (!v) throw Error('ACTIVATION_V2_CHECK_FAILED:' + m); };
const inherited = J('inheritance.json');
assert(git(['branch', '--show-current']).toString().trim() === inherited.branch, 'branch ownership');
assert(hash(git(['diff', '--binary'])) === inherited.preExistingTrackedDiffSha256, 'prior tracked changes retained');
for (const [p, h] of Object.entries(inherited.sourceHashes)) assert(hash(readFileSync(resolve(ga, p))) === h, 'frozen/prior artifact bytes:' + p);
for (const [lane, commit] of Object.entries(inherited.predecessorEvidenceCommits)) assert(git(['log', '-1', '--format=%H', '--', 'platform/game-agnostic/' + lane + '/RESULT.txt']).toString().trim() === commit, 'predecessor commit:' + lane);
const c = J('contract-v2.json'), s = J('scope-disposition.json'), r = J('review-disposition.json');
assert(c.primaryFamily === 40 && c.secondaryRegimeFamily === 40 && c.nuisanceFamily === 120, 'corrected families');
assert(c.proposedWorlds === 25536 && c.seedNamespaces === null && c.scheduledCaseIdentities === null, 'proposed schedule, no allocation');
assert(!c.sealedRegistrationActive && !c.seedsAllocated && !c.outcomesAccessed && !c.campaignExecuted, 'no activation or execution');
assert(c.oraclePath === 'CLOSED_CONTRACT_NOT_TESTABLE' && !c.boundedQualificationImpliesFullCertification, 'Oracle closed; separate exit decisions');
assert(Object.values(s.proposals).every(p => p.status === 'PROPOSED_PENDING_AUTHORITY' && p.approved === false && p.approvalRecord.signatureOrTrustedApprovalReference === null), 'human approvals not inferred');
assert(r.status === 'REVIEW_PENDING' && r.reviewerIdentity === null && r.signedDisposition === null, 'independent review pending');
assert(J('exit-matrix-v2.json').rows.length === 7, 'seven dimensions');
const target = J('review-target.json');
// Python's sorted ASCII keys and these path keys share the same order; use explicit lexical sorting.
const asciiBindings = Object.fromEntries(Object.keys(target.bindings).sort().map(k => [k, target.bindings[k]]));
assert(hash(JSON.stringify(asciiBindings)) === target.reviewTargetHash, 'review target self-hash');
for (const [p, h] of Object.entries(target.bindings)) if (p !== 'LOCAL_ARCHIVE_SHA256') assert(hash(readFileSync(resolve(here, p))) === h, 'review target binding:' + p);
const requirements = J('activation-requirements.json');
assert(requirements.reviewTargetHash === target.reviewTargetHash && Object.values(requirements.prerequisites).every(v => v === false) && requirements.seedNamespace === null && !requirements.registrationActive, 'inert activation checklist');
assert(r.proposedReviewTargetHash === target.reviewTargetHash && r.reviewedProtocolHash === null, 'proposed target is not signed review');
const manifest = J('source-package-manifest.json'), record = J('local-package-record.json');
for (const [p, info] of Object.entries(manifest.files)) {
  const bytes = info.origin === 'PINNED_GIT_BLOB' ? git(['show', inherited.head + ':' + p]) : readFileSync(resolve(root, p));
  assert(hash(bytes) === info.sha256, 'package source correspondence:' + p);
}
assert(hash(readFileSync(resolve(here, record.archive))) === record.sha256, 'local archive identity');
assert(target.bindings.LOCAL_ARCHIVE_SHA256 === record.sha256, 'review target/archive identity');
assert(!record.sourcePackageCommitted && !record.published, 'no archive publication');
assert(git(['ls-files', '--', 'platform/game-agnostic/stage3h-activation-readiness-v2/local-source-package.tar.gz']).length === 0, 'archive never staged');
const clone = J('clean-clone-preflight.json');
assert(clone.status === 'PASS_PACKAGE_CLONE_SYNTHETIC_ONLY' && clone.sourceArchiveSha256 === record.sha256 && !clone.cloneUsesAlternates && !clone.nativeReplayOrPerformanceRun, 'clean package clone scope');
if (existsSync(resolve(here, 'artifact-manifest.json'))) for (const [p, h] of Object.entries(J('artifact-manifest.json').files)) assert(hash(readFileSync(resolve(here, p))) === h, 'additive artifact bytes:' + p);
const synthetic = JSON.parse(execFileSync(process.execPath, [resolve(here, 'synthetic-check.mjs')], { cwd: root, encoding: 'utf8' }).trim());
assert(synthetic.check === 'PASS' && synthetic.nativeWorldsInstantiated === 0, 'source-bound synthetic suite');
const protectedState = verifyProtected(), bindings = verifyInheritanceBindings();
let writer = 'LEASE_RELEASED';
if (existsSync(resolve(here, '.writer-lease.json'))) { const lease = J('.writer-lease.json'); process.kill(lease.pid, 0); writer = { pid: lease.pid, scope: lease.scope, liveAtCheck: true }; }
console.log(JSON.stringify({ check: 'PASS', protectedState, frozenBindingsVerified: true, historicalPerformanceReproduction: 'NOT_RERUN', priorArtifactsUnchanged: true, branch: inherited.branch, writer,
  sourceBindings: Object.keys(inherited.sourceHashes).length, packageFiles: Object.keys(manifest.files).length, packageCloneStatus: clone.status,
  synthetic, independentMethodReview: 'REVIEW_PENDING', humanScopeApproval: false, nativeWorldsInstantiated: 0, sealedSeedsAllocated: false, sealedOutcomesAccessed: false, sealedCampaignExecuted: false, authority: 'R0', freezeBindingNote: bindings.note }, null, 2));
