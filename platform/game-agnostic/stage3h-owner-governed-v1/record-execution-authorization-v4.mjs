// Records the owner's once-only execution authorization for registration 7c41ba89 (written once to
// registration/EXECUTION_AUTHORIZATION_V4.json), after the pre-execution gates and the recount validation have passed.
// It also fixes, before any registered world exists, the supplemental recount (file, hash, invocation) and the mapping from
// the registered disposition to the owner's four verdict labels. No signature is invented.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { LANE } from './inherit.mjs';

assertSoleWriter();
const ok = (v, m) => { if (!v) throw Error(m); };
const sha = (p) => createHash('sha256').update(readFileSync(resolve(LANE, p))).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const REG = '7c41ba89c5c63489b4b4b6351716889460996b688e8ab897197a64a6fb7014cc', REG_COMMIT = '01d4cc34cdee7f498f413396708f14acf13e2d33';
const OUT = resolve(LANE, 'registration/EXECUTION_AUTHORIZATION_V4.json'); ok(!existsSync(OUT), 'ALREADY_RECORDED');
const reg = J('registration/ACTIVE_REGISTRATION_V4.json'), gates = J('evidence/execution-7c41ba89/preexecution-gates.json'), rv = J('evidence/execution-7c41ba89/recount-validation.json');
ok(reg.registrationHash === REG && gates.registrationHash === REG && gates.verdict === 'PREEXECUTION_GATES_PASS' && rv.verdict === 'RECOUNT_REPRODUCES_REGISTERED_ADMISSION', 'GATES_NOT_PASSED');
ok(!existsSync(resolve(LANE, 'runs', REG.slice(0, 16))), 'REPLICATION_ALREADY_STARTED');
const REF = 'SESSION_OWNER_AUTHORIZATION: owner instruction "SENTINEL GRID - STAGE 3H V4 SCIENTIFIC CAMPAIGN / Once-Only Owner-Governed Execution Authorization", Claude Code session, 2026-10-21; session-based owner authorization, NOT an independently verifiable cryptographic signature';
writeExclusive(OUT, {
  type: 'EXECUTE_ONCE', registrationHash: REG, registrationCommit: REG_COMMIT, approvedCandidate: reg.activatesCandidate, replications: ['A', 'B'],
  ownerIdentity: 'PROJECT_OWNER (project scientific authority, self-identified in the session instruction; not independently verified)', date: '2026-10-21', signatureOrTrustedApprovalReference: REF,
  scope: 'replication A, then replication B only after A is locked without an abort record, then the exact registered analysis (node campaign-v4.mjs analyse); subject to every scientific and machine-integrity preflight gate',
  conditions: ['no change to the registration, frozen methods, source identities, thresholds or policy definitions', 'the 1,000 ms decision limit and the O-5 preflight are unchanged', 'a refused start consumes nothing; a started replication is never retried', 'no inspection of A outcomes before B is locked', 'no external independent review is claimed', 'full canonical Stage 3H certification remains unauthorized'],
  preexecutionGates: { file: 'stage3h-owner-governed-v1/evidence/execution-7c41ba89/preexecution-gates.json', sha256: sha('evidence/execution-7c41ba89/preexecution-gates.json'), verdict: gates.verdict },
  supplementalRecount: { role: 'supplemental admission audit and exclusion-rate reporting; never replaces the registered runner admission counts or the registered analysis; a material reconciliation failure prevents a positive verdict',
    file: 'stage3h-owner-governed-v1/exclusion-recount-v4.mjs', sha256: sha('exclusion-recount-v4.mjs'), invocation: 'node exclusion-recount-v4.mjs reconcile, only after A and B are locked with no ABORT record',
    reads: ['LOCK.json', '<population>.admission.json', '<population>.ledger.json'], neverReads: ['<population>.rows.json (hashed as bytes for the lock check only, never parsed)', 'ANALYSIS.json'],
    validation: { file: 'stage3h-owner-governed-v1/evidence/execution-7c41ba89/recount-validation.json', sha256: sha('evidence/execution-7c41ba89/recount-validation.json'), verdict: rv.verdict, spentWorldsReproduced: rv.compared } },
  verdictMapping: { BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFIED_POSITIVE: 'BOUNDED_SELECTOR_QUALIFIED (only if the recount reconciles exactly; otherwise BOUNDED_SELECTOR_INCONCLUSIVE)', BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_HARM: 'BOUNDED_SELECTOR_NOT_QUALIFIED', BOUNDED_OWNER_GOVERNED_QUALIFIED_NEGATIVE_NO_MATERIAL_VALUE: 'BOUNDED_SELECTOR_NOT_QUALIFIED', BOUNDED_OWNER_GOVERNED_INCONCLUSIVE: 'BOUNDED_SELECTOR_INCONCLUSIVE', UNMEASURED: 'BOUNDED_SELECTOR_INCONCLUSIVE (registered admission floors not met)', CONTRACT_BLOCKED: 'EXECUTION_INVALID_OR_ABORTED', 'any replication aborted or not locked': 'EXECUTION_INVALID_OR_ABORTED' },
  launch: { launcher: { file: 'stage3h-owner-governed-v1/execution/launch-replication-v4.sh', sha256: sha('execution/launch-replication-v4.sh') }, chain: { file: 'stage3h-owner-governed-v1/execution/run-campaign-v4.sh', sha256: sha('execution/run-campaign-v4.sh') } },
  independentMethodReview: false, externalIndependentCustody: false, fullCanonicalStage3hCertificationAuthorized: false, newRegistrationAuthorized: false,
});
console.log(JSON.stringify({ written: 'registration/EXECUTION_AUTHORIZATION_V4.json', sha256: sha('registration/EXECUTION_AUTHORIZATION_V4.json') }));
