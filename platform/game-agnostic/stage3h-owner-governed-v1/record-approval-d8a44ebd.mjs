// Records the owner's session-based approval of successor candidate d8a44ebd (written once). No signature, reviewer or
// custodian identity is invented: the reference is the owner's conversation instruction of 2026-10-21, as directed.
// Requires the Phase 0 identity check (evidence/activation-d8a44ebd/identity-check.json) to have passed.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { LANE } from './inherit.mjs';

assertSoleWriter();
const ok = (v, m) => { if (!v) throw Error(m); };
const sha = (p) => createHash('sha256').update(readFileSync(resolve(LANE, p))).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const CANDIDATE = 'd8a44ebd19f6dc5b833462435385680dcf2c3541a543a0e18f3fb81067307aad', CANDIDATE_COMMIT = '5f54f234ce025b8833192fa5bd818657546e512b';
const OUT = resolve(LANE, 'registration/OWNER_APPROVAL_d8a44ebd.json'); ok(!existsSync(OUT), 'ALREADY_RECORDED');
const c = J('registration/REGISTRATION_CANDIDATE_V4.json'), idc = J('evidence/activation-d8a44ebd/identity-check.json');
ok(c.registrationHash === CANDIDATE && idc.candidate === CANDIDATE && idc.verdict === 'CANDIDATE_IDENTITY_VALID', 'IDENTITY_CHECK_NOT_PASSED');
const REF = 'SESSION_OWNER_AUTHORIZATION: owner instruction "SENTINEL GRID - STAGE 3H SUCCESSOR V4 REGISTRATION ACTIVATION" (MODE: OWNER APPROVAL + REGISTRATION ACTIVATION ONLY), Claude Code session, 2026-10-21; session-based owner authorization, NOT an independently verifiable cryptographic signature';
const d = (actual, conditions = []) => ({ approved: true, actualDisposition: actual, ownerConditions: conditions, ownerIdentity: 'PROJECT_OWNER (project scientific authority, self-identified in the session instruction; not independently verified)', date: '2026-10-21', signatureOrTrustedApprovalReference: REF });
writeExclusive(OUT, {
  id: 'STAGE3H_OWNER_GOVERNED_APPROVAL_d8a44ebd', OWNER_APPROVAL: true, approvalKind: 'CONDITIONAL_ACTIVATION (activation only if every identity and integrity gate passes)',
  boundTo: { registrationCandidateHash: CANDIDATE, candidateCommit: CANDIDATE_COMMIT, amendmentSha256: c.governanceAmendment.sha256, amendmentFile: c.governanceAmendment.file, scopeTemplateSha256: sha('registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json'), identityCheckSha256: sha('evidence/activation-d8a44ebd/identity-check.json'), predecessorRegistrationHash: c.predecessor.registrationHash },
  decisions: {
    'SCOPE-DDV': d('APPROVED_SELECTOR_SPECIFIC: only the frozen Nexus/S0 selector downstream decision value', ['no incumbent Prime DDV claim', 'no nine-expert collective-intelligence claim']),
    'SCOPE-TCA': d('APPROVED_NOT_TESTABLE_BOUNDED_SCOPE', ['canonical frozen World-Model Trust Gate unavailable', 'TCA preserved as an explicitly unmeasured limitation']),
    'SCOPE-PRIME': d('APPROVED_NOT_TESTABLE_BOUNDED_SCOPE', ['no matched-input incumbent Prime qualification', 'earlier experimental synthesis zero-gain result preserved separately']),
    'SCOPE-REGIME': d('OBSERVED_THREAT_AND_NO_OBSERVED_THREAT', ['no additional evaluated regimes']),
    'SCOPE-THRESHOLDS': d('V3_WITH_APPROVED_O3_AMENDMENT; O3_MIN_ACCEPTED_PER_CELL=2; every other registered admission, power, weighting, multiplicity, materiality, equivalence and catastrophe condition retained',
      ['90% population and per-horizon admission floors', 'effective sample size >= 2100 wherever the frozen contract requires', 'fixed population and cell weights', 'original DDV materiality', 'multiplicity and equivalence procedures', 'catastrophe and false-selection vetoes', 'correct uncertainty estimates', 'no rejected-world replacement', 'no outcome-driven changes', 'a sparse cell may block positive qualification; no requirement is weakened to prevent that']),
    'AMENDMENT-O6-NATIVE-MENU-VALIDITY': d('APPROVED: a world is rejected NATIVE_MENU_INVALID if any of its 11 policy-facing public action views has an empty native legal-action menu or duplicate canonical action ids; validated before any evaluation policy call or evaluator truth, identically for R, B and N; whole world rejected without repair, deduplication, scoring or replacement; rejections count against admission; Forge World mechanics unchanged',
      ['approved scope of change: 9,406/9,406 historical accepted rows identical, 49 historical validator rejections identical, one known malformed-menu world changes from abort to registered rejection', 'the old failure is preserved as immutable evidence', 'the historical rejection rate is not extrapolated into guaranteed future admission rates', 'actual prospective exclusion rates are reported during the later sealed analysis']),
    'SUCCESSOR-EXECUTION-SEMANTICS': d('APPROVED: new registration with fresh disjoint A and B namespaces from the approved procedure beginning at block 733; predecessor permanently exhausted for replication A',
      ['exclude all 9,407 previously recorded world identities', 'exclude all other previously spent seeds in the exclusion ledger', 'exclude all six OPEN development seeds', 'exclude the entire consumed predecessor A namespace, block 731', 'exclude the predecessor B namespace, block 732 (not a valid continuation)', 'verify actual allocation and collision results before binding them', 'A executes once; B executes once only after valid A locking, subject to the registered failure policy', 'an aborted or consumed replication cannot be rerun', 'statistical analysis begins only after both valid replications are locked', 'no registration changes after activation', 'authorizes execution semantics, not execution']),
  },
  O3Choice: 'MIN_TWO_PER_CELL', intendedOutcome: 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION',
  reviewMode: 'OWNER_GOVERNED', independentReviewClaim: false, independentMethodReview: false, externalIndependentCustody: false, canonicalStage3hCertificationAuthorized: false, fullCanonicalStage3hCertification: false,
  limitations: ['owner-governed: the same person designs, holds custody and executes; blinding is procedural', 'no independent method review and no external custody', 'approval provenance is a session instruction, not a cryptographic signature'],
  gateWaivers: 'NONE', rejectedCandidates: { '18ff522c238cd1e6ebec559229584fce28c31759883794a4a4e715811bcd2793': 'REJECTED (O-2 native identity twin)', 'e70625d137a93c5321dd96b53b59ec99b960811cbe67d2f699a01e7a5ed1f720': 'REJECTED (O-2R handle leak)' },
  exhaustedRegistrations: { '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f': 'EXECUTION_INVALID_OR_ABORTED (A consumed and aborted; B not started; not continued)' },
  sealedExecutionAuthorized: false, newCampaignAuthorized: false, approvalReference: REF });
console.log(JSON.stringify({ written: 'registration/OWNER_APPROVAL_d8a44ebd.json', sha256: sha('registration/OWNER_APPROVAL_d8a44ebd.json') }));
