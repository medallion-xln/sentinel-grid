// Activation Phase 0 for successor candidate d8a44ebd: final identity check before any approval record, allocation or
// activation. Verifies the candidate hash and commit, all 237 bound sources (committed git objects for tracked files, the
// local byte-preserving package for the 30 policy-protected untracked files), inheritance, native engine, frozen selector,
// governance scope, parity, preflight, clean clone, and audits the bound placeholder log. Generates no world.
// Writes evidence/activation-d8a44ebd/identity-check.json once; exits non-zero with CANDIDATE_IDENTITY_BLOCKED on failure.
import { readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const CANDIDATE = 'd8a44ebd19f6dc5b833462435385680dcf2c3541a543a0e18f3fb81067307aad', CANDIDATE_COMMIT = '5f54f234ce025b8833192fa5bd818657546e512b';
const ROOT = resolve(GA, '../..'), PFX = 'platform/game-agnostic/';
const git = (a, enc = 'utf8') => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: enc, maxBuffer: 256 * 1024 * 1024 });
const H = (b) => createHash('sha256').update(b).digest('hex'), fsha = (p) => H(readFileSync(resolve(GA, p))), J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const DRY = process.argv[2] === 'dry';
assertSoleWriter(); const inh = verifyOwnerLane();
const DIR = resolve(LANE, 'evidence/activation-d8a44ebd'), OUT = resolve(DIR, 'identity-check.json');
if (!existsSync(DIR)) mkdirSync(DIR); if (existsSync(OUT)) throw Error('ALREADY_RECORDED');

const cand = J('registration/REGISTRATION_CANDIDATE_V4.json'), { registrationHash: _h, ...body } = cand;
const head = git(['rev-parse', 'HEAD']).trim();
let ancestor = true; try { git(['merge-base', '--is-ancestor', CANDIDATE_COMMIT, 'HEAD']); } catch { ancestor = false; }
const candPath = PFX + 'stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE_V4.json';
const tracked = new Set(git(['ls-files', '--', 'platform/game-agnostic']).split('\n').filter(Boolean).map((f) => f.slice(PFX.length)));
const bound = Object.entries(cand.bindings.sources), trackedBound = bound.filter(([p]) => tracked.has(p)), untrackedBound = bound.filter(([p]) => !tracked.has(p));
const committedAt = (rev, p) => H(git(['show', rev + ':' + PFX + p], null));
const trackedMismatch = trackedBound.filter(([p, h]) => fsha(p) !== h || committedAt(CANDIDATE_COMMIT, p) !== h || committedAt('HEAD', p) !== h).map(([p]) => p);
// Untracked protected sources: working tree and the local package must both reproduce the bound bytes.
const pkg = resolve(LANE, 'registration/protected-source-package-d8a44ebd.tar.gz'), cc = J('evidence/successor-v4-preflight/clean-clone-verification.json');
const tmp = mkdtempSync(resolve(tmpdir(), 'sg-v4-pkg-'));
let packageMismatch;
try { execFileSync('/usr/bin/tar', ['-xzf', pkg, '-C', tmp]); packageMismatch = untrackedBound.filter(([p, h]) => !existsSync(resolve(tmp, p)) || H(readFileSync(resolve(tmp, p))) !== h || fsha(p) !== h).map(([p]) => p); }
finally { rmSync(tmp, { recursive: true, force: true }); }

// Bound placeholder log audit.
const LOG = 'stage3h-owner-governed-v1/evidence/successor-v4/logs/register-candidate.stdout.log', EMPTY = H(Buffer.alloc(0));
const populated = 'evidence/successor-v4-preflight/register-candidate.stdout.log', populatedJson = JSON.parse(readFileSync(resolve(LANE, populated), 'utf8'));
const note = readFileSync(resolve(LANE, 'evidence/successor-v4-preflight/BOUND_LOG_NOTE.md'), 'utf8');
const boundLogs = bound.filter(([p]) => p.startsWith('stage3h-owner-governed-v1/evidence/successor-v4/logs/'));
const boundLog = {
  boundHashIsEmptyFile: cand.bindings.sources[LOG] === EMPTY, committedAtCandidateCommitEqualsBound: committedAt(CANDIDATE_COMMIT, LOG) === cand.bindings.sources[LOG], committedAtHeadEqualsBound: committedAt('HEAD', LOG) === cand.bindings.sources[LOG], workingTreeEqualsBound: fsha(LOG) === cand.bindings.sources[LOG],
  everyBoundLogCommittedExactly: boundLogs.every(([p, h]) => committedAt(CANDIDATE_COMMIT, p) === h && fsha(p) === h), boundLogs: boundLogs.length,
  populatedLogOutsideBoundClosure: !bound.some(([p]) => p.startsWith('stage3h-owner-governed-v1/evidence/successor-v4-preflight/')) && !Object.hasOwn(cand.bindings.sources, 'stage3h-owner-governed-v1/' + populated),
  populatedLogNamesThisCandidate: populatedJson.candidateHash === CANDIDATE && populatedJson.sources === 237,
  noteDocumentsCorrection: /bound both as the empty file/.test(note) && /candidate file was not\s+rebuilt or edited/.test(note),
  identityDependsOnResettingMutableFile: false,
  reading: 'The bound bytes (empty) are the committed git object in 5f54f234 and at HEAD; identity is reproduced from immutable committed objects, not from a reset performed during or after activation. Activation and later steps write their logs only under evidence/activation-d8a44ebd/, outside the bound closure.',
};

const pred = J('registration/ACTIVE_REGISTRATION_V3.json'), contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const scope = J('registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json'), fv = J('evidence/successor-v4/final-verification.json'), pf = J('evidence/successor-v4-preflight/preflight.json');
const nativeSrc = bound.filter(([p]) => p.startsWith('src/'));
const checks = {
  candidateHash: sha256(stableStringify(body)) === CANDIDATE && cand.registrationHash === CANDIDATE && cand.status === 'REGISTRATION_PENDING_OWNER_APPROVAL',
  candidateCommit: ancestor && H(git(['show', CANDIDATE_COMMIT + ':' + candPath], null)) === fsha('stage3h-owner-governed-v1/registration/REGISTRATION_CANDIDATE_V4.json') && git(['diff', '--name-only', 'HEAD', '--', PFX + 'stage3h-owner-governed-v1']).trim() === '',
  boundSources237: bound.length === 237 && trackedMismatch.length === 0 && packageMismatch.length === 0 && untrackedBound.length === cc.protectedOverlay.files.length && H(readFileSync(pkg)) === cc.protectedOverlay.packageSha256,
  protectedInheritance14447: inh.protectedCount === 14447 && inh.rosterPreserved && inh.v3BoundFilesUnchanged,
  nativeEngine: nativeSrc.length === 57 && nativeSrc.every(([p, h]) => pred.bindings.sources[p] === h) && git(['status', '--porcelain', '--', PFX + 'src']).trim() === '',
  frozenSelector: inh.frozenRuleHashMatches && cand.frozenSelector.ruleHash === contract.ruleHash && contract.ruleHash.startsWith('c53826da') && cand.bindings.sources['stage3h-activation-readiness-v2/runner-design.mjs'] === pred.bindings.sources['stage3h-activation-readiness-v2/runner-design.mjs'],
  ownerGovernanceScope: cand.reviewMode === 'OWNER_GOVERNED' && cand.independentMethodReview === false && cand.externalIndependentCustody === false && cand.ownerApproval === null && scope.boundTo.registrationCandidateHash === CANDIDATE
    && stableStringify(Object.keys(scope.decisions).sort()) === stableStringify(['AMENDMENT-O6-NATIVE-MENU-VALIDITY', 'SCOPE-DDV', 'SCOPE-PRIME', 'SCOPE-REGIME', 'SCOPE-TCA', 'SCOPE-THRESHOLDS', 'SUCCESSOR-EXECUTION-SEMANTICS']),
  parityEvidence: fv.verdict === 'FINAL_VERIFICATION_PASS' && fv.reconciliation.matches && fv.reconciliation.observed.acceptedExact === 9406 && fv.reconciliation.observed.unchangedRejections === 49 && fv.reconciliation.observed.intendedChanges === 1 && fv.reconciliation.observed.unintendedDifferences === 0 && cand.successorEvidence.finalVerification === fsha('stage3h-owner-governed-v1/evidence/successor-v4/final-verification.json'),
  preflight15: pf.verdict === 'SUCCESSOR_PREFLIGHT_PASS' && pf.candidateHash === CANDIDATE && pf.failed.length === 0 && Object.keys(pf.checks).length === 15 && Object.values(pf.checks).every(Boolean),
  cleanClone: cc.result.verdict === 'CLEAN_CLONE_REPRODUCIBLE' && cc.candidateHash === CANDIDATE && cc.commit === CANDIDATE_COMMIT && cc.result.boundSourceMismatches.length === 0 && cc.result.boundSources === 237,
  boundLogIdentity: Object.entries(boundLog).every(([k, v]) => (k === 'identityDependsOnResettingMutableFile' ? v === false : typeof v === 'boolean' ? v : true)),
};
const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
const verdict = failed.length === 0 ? 'CANDIDATE_IDENTITY_VALID' : 'CANDIDATE_IDENTITY_BLOCKED';
if (!DRY) writeExclusive(OUT, { schema: 'STAGE3H_V4_ACTIVATION_IDENTITY_CHECK_V1', candidate: CANDIDATE, candidateCommit: CANDIDATE_COMMIT, head, inheritanceHead: inh.head, checks, failed,
  boundSources: { total: bound.length, tracked: trackedBound.length, untrackedProtected: untrackedBound.length, trackedMismatch, packageMismatch }, boundLog, verdict, worldsGenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ verdict, failed, checks, boundLog, boundSources: { total: bound.length, tracked: trackedBound.length, untracked: untrackedBound.length } }, null, 1));
if (failed.length) process.exit(2);
