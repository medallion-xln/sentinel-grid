// Read-only integrity checks and existing synthetic verification only. No native performance execution.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyProtected } from '../stage3h-canonical-v1/guard.mjs';
import { verifyInheritanceBindings } from '../stage3h-canonical-v1/inheritance.mjs';
const here = dirname(fileURLToPath(import.meta.url)), ga = resolve(here, '..'), root = resolve(ga, '../..');
const J = p => JSON.parse(readFileSync(resolve(here, p), 'utf8'));
const sha = x => createHash('sha256').update(x).digest('hex');
const git = a => execFileSync('git', a, { cwd: root });
const ok = (v, m) => { if (!v) throw Error('FINAL_HANDOFF_INTEGRITY_FAILED:' + m); };
const inherited = J('inheritance.json');
ok(inherited.v2Commit === '250f51ad50046183b43c327ce59c89acce0a1147', 'V2 target');
ok(git(['branch', '--show-current']).toString().trim() === inherited.branch, 'branch');
ok(sha(git(['diff', '--binary'])) === inherited.preExistingTrackedDiffSha256, 'unrelated tracked changes');
for (const [p, h] of Object.entries(inherited.inputHashes)) ok(sha(readFileSync(resolve(ga, p))) === h, 'prior input bytes:' + p);
for (const [p, commit] of Object.entries(inherited.predecessorEvidenceCommits)) ok(git(['log', '-1', '--format=%H', '--', 'platform/game-agnostic/' + p + '/RESULT.txt']).toString().trim() === commit, 'evidence commit:' + p);
const v2Prefix = 'platform/game-agnostic/stage3h-activation-readiness-v2/';
const tracked = git(['ls-tree', '-r', '--name-only', inherited.v2Commit, '--', v2Prefix]).toString().trim().split('\n');
for (const p of tracked) ok(sha(git(['show', inherited.v2Commit + ':' + p])) === sha(readFileSync(resolve(root, p))), 'V2 committed blob:' + p);
const roster = JSON.parse(readFileSync(resolve(ga, 'stage3h2r-development/NINE_EXPERT_INVENTORY_V1.json'), 'utf8')).roster;
ok(roster.length === 9 && !roster.includes('S0'), 'nine canonical experts');
const decisions = J('scope-decisions.json');
ok(Object.keys(decisions.decisions).length === 5 && Object.values(decisions.decisions).every(d => d.status === 'PENDING_HUMAN_AUTHORITY' && d.actualDisposition === null && d.approved === false), 'pending scope decisions');
const reviewer = J('reviewer-response-template.json');
ok(reviewer.status === 'REVIEW_PENDING' && reviewer.reviewerIdentity === null && reviewer.conflictDeclaration === null && reviewer.signedDisposition === null, 'no invented reviewer');
ok(J('amendment-ledger.json').amendments.length === 0, 'no unapproved protocol amendments');
const inventory = J('scientific-inventory.json');
ok(inventory.totalProposedWorlds === 25536 && inventory.worldsAllocated === 0 && inventory.sevenDimensionMatrixRows === 7, 'fixed inventory');
ok(inventory.families.P40 === 40 && inventory.families.REGIME40 === 40 && inventory.families.SAFETY30 === 30 && inventory.families.NUISANCE120 === 120, 'family counts');
const fresh = J('fresh-package-preflight.json');
ok(fresh.status === 'PASS_PACKAGE_CLONE_SYNTHETIC_ONLY' && fresh.filesByteVerified === 75 && !fresh.nativeReplayOrPerformanceRun && fresh.syntheticChecks.nativeWorldsInstantiated === 0, 'fresh source package clone');
const proof = JSON.parse(execFileSync(process.execPath, [resolve(ga, 'stage3h-activation-readiness-v2/check.mjs')], { cwd: root, encoding: 'utf8' }));
ok(proof.check === 'PASS' && proof.protectedState.count === 14447 && !proof.sealedCampaignExecuted, 'existing V2 binding/synthetic checks');
const protectedState = verifyProtected(), bindings = verifyInheritanceBindings();
let writer = 'LEASE_RELEASED';
if (existsSync(resolve(here, '.writer-lease.json'))) { const lease = J('.writer-lease.json'); process.kill(lease.pid, 0); writer = { pid: lease.pid, scope: lease.scope, liveAtCheck: true }; }
console.log(JSON.stringify({ check: 'PASS', v2Commit: inherited.v2Commit, v2CommittedFilesVerified: tracked.length, protectedState, nineCanonicalExperts: roster, branch: inherited.branch, writer,
  freezeBindingsVerified: true, priorEvidenceCommitBindingsVerified: true, priorPerformanceCampaignsRerun: false, priorArtifactsUnchanged: true, unrelatedTrackedChangesUnchanged: true,
  sourcePackageFiles: fresh.filesByteVerified, cleanCloneStatus: fresh.status, runtimeProvenanceMatchesV2: J('runtime-provenance.json').matchesV2DesignHostVersions,
  syntheticChecks: proof.synthetic, humanScopeApproval: false, independentReview: 'REVIEW_PENDING', authorAuditIsIndependentReview: false,
  scientificAmendments: 0, sealedSeedsAllocated: false, sealedWorldsGenerated: 0, sealedOutcomesAccessed: false, sealedCampaignExecuted: false, authority: 'R0', historicalReproductionScope: bindings.note }, null, 2));
