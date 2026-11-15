// Activates the owner-governed registration for candidate f1ba57b4 (written once to registration/ACTIVE_REGISTRATION_V3.json).
// Verifies every gate and binding first. Creates no game world, runs no policy, opens no outcome, creates no execution
// authorization. Must be launched as plain `node activate.mjs` so the bound runtime identity (no launch flags) matches.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertRuntimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { CONNECTOR_V3_ID } from './connector-v3.mjs';
import { registrationHash, loadActiveRegistration } from './campaign.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const CANDIDATE = 'f1ba57b46ceedc3ab22a859d51245ed353b1aaa570ec914ebaa3f8fec4c3e984', LANE_COMMIT = '15da78b74a0d709ca26dfa996dad9f5bfc385dbe';
const ROOT = resolve(GA, '../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), sha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const ok = (v, m) => { if (!v) throw Error(m); };
const OUT = resolve(LANE, 'registration/ACTIVE_REGISTRATION_V3.json');

assertSoleWriter(); ok(!existsSync(OUT), 'ALREADY_ACTIVATED');
const inh = verifyOwnerLane();
let ancestor = true; try { git(['merge-base', '--is-ancestor', LANE_COMMIT, 'HEAD']); } catch { ancestor = false; }
ok(ancestor && git(['status', '--porcelain', '--untracked-files=all', '--', 'platform/game-agnostic/stage3h-owner-governed-v1']) === '', 'LANE_NOT_COMMITTED_OR_DIRTY');
const cand = J('registration/REGISTRATION_CANDIDATE_V3.json');
ok(cand.registrationHash === CANDIDATE && registrationHash(cand) === CANDIDATE && cand.status === 'REGISTRATION_PENDING_OWNER_APPROVAL' && cand.connector === CONNECTOR_V3_ID, 'CANDIDATE_IDENTITY');
ok(Object.entries(cand.bindings.sources).every(([p, h]) => sha(p) === h), 'BOUND_SOURCE_CHANGED');
assertRuntimeIdentity(cand.bindings.runtime);
const appr = J('registration/OWNER_APPROVAL_f1ba57b4.json');
ok(appr.boundTo.registrationCandidateHash === CANDIDATE && appr.boundTo.amendmentSha256 === cand.governanceAmendment.sha256, 'APPROVAL_NOT_BOUND_TO_CANDIDATE');
ok(Object.values(appr.decisions).length === 5 && Object.values(appr.decisions).every((d) => d.approved === true && d.signatureOrTrustedApprovalReference), 'APPROVAL_INCOMPLETE');
ok(appr.O3Choice === cand.amendments.O3.choice && appr.intendedOutcome === 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION' && appr.independentMethodReview === false && appr.externalIndependentCustody === false, 'APPROVAL_SCOPE');
const g = J('evidence/o2r1-gate.json'), fr = J('evidence/flake-audit-review.json'), oa = J('evidence/o3-acceptance.json'), oc = J('evidence/o3-catastrophe-feasibility.json');
ok(g.verdict === 'O2R1_GATE_PASS' && g.worlds === 288 && Object.values(g.passCounts).every((v) => v === 288) && g.failures.length === 0 && g.droppedCases === 0, 'O2R1_GATE');
ok(fr.testIntegrityVerdict.startsWith('NOT_INTEGRITY_BLOCKED') && fr.timingLimitMs === 1000 && fr.timingLimitChanged === false, 'INTEGRITY');
ok(oa.behaviour.startsWith('CONFIRMED') && oc.verdict === 'O3_SAFETY_BOUND_UNCHANGED_AND_FEASIBILITY_NOT_REDUCED', 'O3');
const contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const plans = Object.fromEntries(['A', 'B'].map((r) => [r, schedule(contract.populations, cand.namespaces[r])]));
ok(['A', 'B'].every((r) => scheduleHash(plans[r]) === cand.scheduleHashes[r] && plans[r].length === cand.scheduledPerReplication), 'SCHEDULE_MISMATCH');
const seedsA = new Set(plans.A.map((x) => x.seed)), prior = new Set(J('evidence/prior-world-exclusions.json').priorSeeds);
ok(plans.B.every((x) => !seedsA.has(x.seed)) && [...plans.A, ...plans.B].every((x) => !prior.has(x.seed)), 'SEED_COLLISION');

const { registrationHash: _c, status: _s, ...body } = cand;
const historical = ['registration/REGISTRATION_CANDIDATE.json', 'registration/REGISTRATION_CANDIDATE_V2.json', 'registration/OWNER_CONDITIONAL_APPROVAL_18ff522c.json', 'registration/OWNER_CONDITIONAL_APPROVAL_e70625d1.json', 'evidence/o2-gate.json', 'evidence/o2r-gate.json', 'evidence/o2r-gate-diagnosis.json', 'evidence/flake-audit.json', 'evidence/o3-verification.json'];
const active = {
  ...body, status: 'ACTIVE_OWNER_GOVERNED', activatesCandidate: CANDIDATE, laneCommit: LANE_COMMIT,
  ownerApproval: { decisions: appr.decisions, O3Choice: appr.O3Choice, intendedOutcome: appr.intendedOutcome, reference: appr.approvalReference, record: { file: 'stage3h-owner-governed-v1/registration/OWNER_APPROVAL_f1ba57b4.json', sha256: sha('stage3h-owner-governed-v1/registration/OWNER_APPROVAL_f1ba57b4.json') }, gateWaivers: 'NONE' },
  activation: { date: '2026-10-20', authority: 'R0', mode: 'OWNER_GOVERNED_REGISTRATION_ACTIVATION_ONLY', inheritanceHead: inh.head, activationToolingCommit: git(['rev-parse', 'HEAD']), activationScriptSha256: sha('stage3h-owner-governed-v1/activate.mjs'), cloneVerifierSha256: sha('stage3h-owner-governed-v1/clone-verify.mjs'), worldsGenerated: 0, policiesEvaluated: 0, outcomesAccessed: false },
  governanceLabels: { REVIEW_MODE: 'OWNER_GOVERNED', INDEPENDENT_REVIEW_CLAIM: false, EXTERNAL_INDEPENDENT_CUSTODY: false, CANONICAL_STAGE3H_CERTIFICATION_AUTHORIZED: false, FULL_CANONICAL_STAGE3H_CERTIFICATION: false },
  seedReservation: { namespaces: cand.namespaces, perReplication: cand.scheduledPerReplication, rule: cand.seedRule, scheduleHashes: cand.scheduleHashes, seedLevelDisjointFromPriorAndEachOther: true, materialized: false },
  worldLevelExclusion: 'Enforced at execution: a generated world whose semantic hash is among the 9,407 prior world hashes is rejected with PRIOR_WORLD_EXCLUDED and never replaced; a within-run duplicate aborts the replication.',
  outcomeLocking: 'Each replication writes rows, ledger and admission once (read-only) plus LOCK.json; runner output is counts and hashes only; analysis refuses until both A and B LOCK files exist and verify.',
  onceOnly: 'Each replication executes at most once: an existing replication directory refuses a rerun; no retry, resize, threshold change, seed substitution or new arm after any outcome.',
  replayEquivalence: 'Independent replay must reproduce every row field except the wall-clock fields row.compute.elapsedMs, LOCK.wallMs and LOCK.preflight; the analysis never reads those fields.',
  executionAuthorization: { required: true, file: 'stage3h-owner-governed-v1/registration/EXECUTION_AUTHORIZATION_V3.json', fields: { type: 'EXECUTE_ONCE', registrationHash: '<this registrationHash>', replications: ['A', 'B'], ownerIdentity: '<owner>', date: '<date>', signatureOrTrustedApprovalReference: '<reference>' }, createdByActivation: false, command: 'node campaign-v3.mjs run A, then node campaign-v3.mjs run B, then node campaign-v3.mjs analyse' },
  historicalEvidence: Object.fromEntries(historical.map((p) => [p, sha('stage3h-owner-governed-v1/' + p)])),
};
active.registrationHash = registrationHash(active);
writeExclusive(OUT, active);
const loaded = loadActiveRegistration(OUT);
ok(loaded.registrationHash === active.registrationHash && loaded.connector === CONNECTOR_V3_ID, 'RUNNER_WOULD_NOT_ACCEPT');
console.log(JSON.stringify({ registrationHash: active.registrationHash, activatesCandidate: CANDIDATE, laneCommit: LANE_COMMIT, boundSources: Object.keys(active.bindings.sources).length, runnerAccepts: true, scheduleHashes: active.scheduleHashes, worldsGenerated: 0 }, null, 1));
