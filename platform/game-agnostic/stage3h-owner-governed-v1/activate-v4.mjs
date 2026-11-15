// Activates successor candidate d8a44ebd (written once to registration/ACTIVE_REGISTRATION_V4.json). Derived from
// activate.mjs (0364164c) with the V4 additions: the owner approval of all seven decisions, the namespace allocation made
// by the approved procedure (re-verified here before binding), and the bound-log identity. Verifies every gate first.
// Creates no game world, runs no policy, opens no outcome, creates no execution authorization. Plain `node activate-v4.mjs`.
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { CONNECTOR_V4_ID } from './connector-v4.mjs';
import { loadV4, O6_DECISION } from './campaign-v4.mjs';
import { validateNamespacePlan, scanRepositoryText, BLOCK, PER_REPLICATION, EXCLUDED_BLOCKS } from './allocate-namespaces-v4.mjs';
import { registrationHash } from './campaign.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const CANDIDATE = 'd8a44ebd19f6dc5b833462435385680dcf2c3541a543a0e18f3fb81067307aad', CANDIDATE_COMMIT = '5f54f234ce025b8833192fa5bd818657546e512b';
const PRED = '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f';
const ROOT = resolve(GA, '../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), sha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex'), L = (p) => 'stage3h-owner-governed-v1/' + p;
const ok = (v, m) => { if (!v) throw Error(m); };
const OUT = resolve(LANE, 'registration/ACTIVE_REGISTRATION_V4.json');

assertSoleWriter(); ok(!existsSync(OUT), 'ALREADY_ACTIVATED');
const inh = verifyOwnerLane();
let ancestor = true; try { git(['merge-base', '--is-ancestor', CANDIDATE_COMMIT, 'HEAD']); } catch { ancestor = false; }
ok(ancestor && git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-owner-governed-v1']) === '', 'LANE_NOT_COMMITTED_OR_DIRTY');

// Candidate, sources, runtime, Phase 0 identity.
const cand = J('registration/REGISTRATION_CANDIDATE_V4.json');
ok(cand.registrationHash === CANDIDATE && registrationHash(cand) === CANDIDATE && cand.status === 'REGISTRATION_PENDING_OWNER_APPROVAL' && cand.connector === CONNECTOR_V4_ID && cand.namespaces === null, 'CANDIDATE_IDENTITY');
ok(Object.entries(cand.bindings.sources).every(([p, h]) => sha(p) === h), 'BOUND_SOURCE_CHANGED');
assertRuntimeIdentity(cand.bindings.runtime);
const idc = J('evidence/activation-d8a44ebd/identity-check.json');
ok(idc.verdict === 'CANDIDATE_IDENTITY_VALID' && idc.candidate === CANDIDATE && idc.boundLog.identityDependsOnResettingMutableFile === false, 'PHASE0_IDENTITY_NOT_VALID');

// Owner approval: seven decisions, bound to this candidate, commit and amendment.
const appr = J('registration/OWNER_APPROVAL_d8a44ebd.json'), scope = J('registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json');
ok(appr.OWNER_APPROVAL === true && appr.boundTo.registrationCandidateHash === CANDIDATE && appr.boundTo.candidateCommit === CANDIDATE_COMMIT && appr.boundTo.amendmentSha256 === cand.governanceAmendment.sha256 && appr.boundTo.identityCheckSha256 === sha(L('evidence/activation-d8a44ebd/identity-check.json')), 'APPROVAL_NOT_BOUND_TO_CANDIDATE');
ok(JSON.stringify(Object.keys(appr.decisions).sort()) === JSON.stringify(Object.keys(scope.decisions).sort()) && Object.keys(appr.decisions).length === 7 && Object.values(appr.decisions).every((d) => d.approved === true && d.signatureOrTrustedApprovalReference), 'APPROVAL_INCOMPLETE');
ok(appr.decisions[O6_DECISION]?.approved === true && appr.O3Choice === cand.amendments.O3.choice && appr.intendedOutcome === 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION' && appr.independentMethodReview === false && appr.externalIndependentCustody === false && appr.fullCanonicalStage3hCertification === false && appr.sealedExecutionAuthorized === false, 'APPROVAL_SCOPE');

// Allocation: produced by the approved procedure, re-verified independently before binding.
const allocFile = 'registration/NAMESPACE_ALLOCATION_V4.json', alloc = J(allocFile);
ok(alloc.candidateHash === CANDIDATE && alloc.status === 'ALLOCATED_AFTER_OWNER_APPROVAL' && alloc.collisionAudit.ok === true, 'ALLOCATION_RECORD');
ok(sha(cand.namespaceAllocation.procedure.file) === cand.namespaceAllocation.procedure.sha256, 'ALLOCATION_PROCEDURE_CHANGED');
const ns = alloc.namespaces, excl = J('evidence/prior-world-exclusions.json');
ok(ns.A === 733 * BLOCK || ns.A > 733 * BLOCK, 'ALLOCATION_BELOW_733');
const priorSeeds = [...excl.priorSeeds, ...cand.namespaceAllocation.additionalPriorSeeds];
const rescan = scanRepositoryText(GA, Math.min(ns.A, ns.B), Math.max(ns.A, ns.B) + PER_REPLICATION).filter((h) => !h.file.startsWith('stage3h-owner-governed-v1/registration/NAMESPACE_ALLOCATION_V4.json'));
const recheck = validateNamespacePlan(ns, { priorSeeds, textHits: rescan, excludedBlocks: Object.keys(EXCLUDED_BLOCKS).map(Number) });
ok(recheck.ok && Object.keys(cand.namespaceAllocation.excludedBlocks).every((b) => ![ns.A, ns.B].some((x) => x / BLOCK === Number(b))), 'ALLOCATION_RECHECK_FAILED:' + JSON.stringify(recheck.failures));
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const plans = Object.fromEntries(['A', 'B'].map((r) => [r, schedule(contract.populations, ns[r])]));
ok(['A', 'B'].every((r) => scheduleHash(plans[r]) === alloc.scheduleHashes[r] && plans[r].length === cand.scheduledPerReplication), 'SCHEDULE_MISMATCH');
const seedsA = new Set(plans.A.map((x) => x.seed)), prior = new Set(priorSeeds), pred = J('registration/ACTIVE_REGISTRATION_V3.json');
const predRanges = ['A', 'B'].map((r) => [pred.namespaces[r], pred.namespaces[r] + PER_REPLICATION]);
ok(plans.B.every((x) => !seedsA.has(x.seed)) && [...plans.A, ...plans.B].every((x) => !prior.has(x.seed) && !predRanges.some(([lo, hi]) => x.seed >= lo && x.seed < hi) && ![731, 732].includes(Math.floor(x.seed / BLOCK))), 'SEED_COLLISION');
ok(!existsSync(resolve(LANE, 'runs', PRED.slice(0, 16), 'B')) && existsSync(resolve(LANE, 'runs', PRED.slice(0, 16), 'A')), 'PREDECESSOR_RUN_STATE_CHANGED');

const { registrationHash: _c, status: _s, ...body } = cand;
const active = {
  ...body, status: 'ACTIVE_OWNER_GOVERNED', activatesCandidate: CANDIDATE, candidateCommit: CANDIDATE_COMMIT,
  namespaces: ns, scheduleHashes: alloc.scheduleHashes,
  namespaceAllocation: { ...cand.namespaceAllocation, status: 'ALLOCATED_AFTER_OWNER_APPROVAL', record: { file: L(allocFile), sha256: sha(L(allocFile)) }, allocated: ns, scheduleHashes: alloc.scheduleHashes,
    collisionAudit: { procedure: alloc.collisionAudit, activationRecheck: { ...recheck, priorSeedsChecked: priorSeeds.length, repositoryTextHitsInAllocatedRanges: rescan.length, predecessorRangesDisjoint: true, excludedBlocksDisjoint: true, abDisjoint: true } } },
  ownerApproval: { decisions: appr.decisions, O3Choice: appr.O3Choice, intendedOutcome: appr.intendedOutcome, reference: appr.approvalReference, approvalKind: appr.approvalKind, record: { file: L('registration/OWNER_APPROVAL_d8a44ebd.json'), sha256: sha(L('registration/OWNER_APPROVAL_d8a44ebd.json')) }, gateWaivers: 'NONE' },
  activation: { date: '2026-10-21', authority: 'R0', mode: 'OWNER_GOVERNED_REGISTRATION_ACTIVATION_ONLY', inheritanceHead: inh.head, activationToolingCommit: git(['rev-parse', 'HEAD']), activationScriptSha256: sha(L('activate-v4.mjs')),
    cloneVerifierSha256: sha(L('clone-verify-activation-v4.mjs')), identityCheck: { file: L('evidence/activation-d8a44ebd/identity-check.json'), sha256: sha(L('evidence/activation-d8a44ebd/identity-check.json')) }, worldsGenerated: 0, policiesEvaluated: 0, outcomesAccessed: false },
  governanceLabels: { REVIEW_MODE: 'OWNER_GOVERNED', INDEPENDENT_REVIEW_CLAIM: false, EXTERNAL_INDEPENDENT_CUSTODY: false, CANONICAL_STAGE3H_CERTIFICATION_AUTHORIZED: false, FULL_CANONICAL_STAGE3H_CERTIFICATION: false },
  seedReservation: { namespaces: ns, perReplication: cand.scheduledPerReplication, rule: cand.seedRule, scheduleHashes: alloc.scheduleHashes, seedLevelDisjointFromPriorAndEachOther: true, materialized: false },
  worldLevelExclusion: 'Enforced at execution: a generated world whose semantic hash is among the 9,407 prior world hashes is rejected PRIOR_WORLD_EXCLUDED and never replaced; a within-run duplicate world aborts the replication. Consumed predecessor-A worlds are excluded at seed level (the whole 731 block).',
  menuValidity: { ...cand.menuValidity, ownerApproved: true },
  prospectiveExclusionReporting: 'Owner condition (O-6): actual prospective exclusion rates are reported in the later sealed analysis, and the historical rate is not extrapolated. The bound runner writes per-cell accepted and rejected counts (population, band and cell) in the locked admission files; it does not write the rejection reason. The sealed analysis report therefore states total exclusion rates from the locked admission files and obtains the by-reason breakdown (NATIVE_MENU_INVALID vs the V3 reasons) by an outcome-blind deterministic recount over the registered schedule: generation, the V3 pre-policy gates and the O-6 rule only, with no policy, truth or outcome; its per-cell totals must equal the locked counts exactly, and it cannot change any locked file, admission result or verdict.',
  outcomeLocking: 'Each replication writes rows, ledger and admission once (read-only) plus LOCK.json; runner output is counts and hashes only; analysis refuses until both A and B LOCK files exist and verify and no ABORT record exists.',
  onceOnly: 'Each replication executes at most once: an existing replication directory refuses a rerun; B refuses unless A locked without an abort record; an aborted or consumed replication is never rerun; no retry, resize, threshold change, seed substitution or new arm after any outcome; no registration change after activation.',
  replayEquivalence: 'Independent replay must reproduce every row field except the wall-clock fields row.compute.elapsedMs, LOCK.wallMs and LOCK.preflight; the analysis never reads those fields.',
  executionAuthorization: { required: true, file: L('registration/EXECUTION_AUTHORIZATION_V4.json'), fields: { type: 'EXECUTE_ONCE', registrationHash: '<this registrationHash>', replications: ['A', 'B'], ownerIdentity: '<owner>', date: '<date>', signatureOrTrustedApprovalReference: '<reference>' }, createdByActivation: false, command: 'node campaign-v4.mjs run A, then node campaign-v4.mjs run B (only after A locked without abort), then node campaign-v4.mjs analyse' },
  predecessorPreservation: { registrationHash: PRED, status: cand.predecessor.status, consumedRunDirectory: cand.predecessor.consumedRunDirectory, continued: false },
  historicalEvidence: Object.fromEntries(['registration/REGISTRATION_CANDIDATE_V3.json', 'registration/ACTIVE_REGISTRATION_V3.json', 'registration/EXECUTION_AUTHORIZATION_V3.json', 'EXECUTION_RESULT_0364164c.txt', 'evidence/execution-0364164c/A-run.stderr.log', 'evidence/execution-0364164c/abort-diagnosis.json', 'evidence/execution-0364164c/replication-consumption.json', 'SUCCESSOR_RESULT_d8a44ebd.txt', 'evidence/successor-v4-preflight/preflight.json', 'evidence/successor-v4-preflight/clean-clone-verification.json', 'evidence/successor-v4-preflight/BOUND_LOG_NOTE.md'].map((p) => [p, sha(L(p))])),
};
active.registrationHash = registrationHash(active);
// Prove runner acceptance on a temporary copy before the write-once registration exists.
const probe = resolve(tmpdir(), 'sg-v4-active-probe-' + process.pid + '.json'); writeFileSync(probe, JSON.stringify(active, null, 1) + '\n');
let pre; try { pre = loadV4(probe); } finally { rmSync(probe, { force: true }); }
ok(pre.registrationHash === active.registrationHash && pre.connector === CONNECTOR_V4_ID, 'RUNNER_WOULD_NOT_ACCEPT');
writeExclusive(OUT, active);
const loaded = loadV4(OUT);
ok(loaded.registrationHash === active.registrationHash && loaded.connector === CONNECTOR_V4_ID, 'RUNNER_WOULD_NOT_ACCEPT');
console.log(JSON.stringify({ registrationHash: active.registrationHash, activatesCandidate: CANDIDATE, namespaces: ns, scheduleHashes: alloc.scheduleHashes, boundSources: Object.keys(active.bindings.sources).length, runnerAccepts: true, worldsGenerated: 0 }, null, 1));
