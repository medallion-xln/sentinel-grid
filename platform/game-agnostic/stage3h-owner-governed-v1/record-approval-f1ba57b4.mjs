// Records the owner's session-based approval of candidate f1ba57b4 (written once). No signature, reviewer or custodian
// identity is invented: the reference is the owner's conversation instruction of 2026-10-20, as the owner directed.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { LANE } from './inherit.mjs';
assertSoleWriter();
const sha = (p) => createHash('sha256').update(readFileSync(resolve(LANE, p))).digest('hex');
const CANDIDATE = 'f1ba57b46ceedc3ab22a859d51245ed353b1aaa570ec914ebaa3f8fec4c3e984';
const c = JSON.parse(readFileSync(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V3.json'), 'utf8'));
if (c.registrationHash !== CANDIDATE) throw Error('CANDIDATE_MISMATCH');
const REF = 'SESSION_OWNER_AUTHORIZATION: owner instruction "SENTINEL GRID - STAGE 3H REGISTRATION ACTIVATION / Final Corrected Candidate f1ba57b4", Claude Code session, 2026-10-20; session-based owner authorization, NOT an independently verifiable cryptographic signature';
const d = (actual) => ({ approved: true, actualDisposition: actual, ownerIdentity: 'PROJECT_OWNER (project scientific authority, self-identified in the session instruction; not independently verified)', date: '2026-10-20', signatureOrTrustedApprovalReference: REF });
writeExclusive(resolve(LANE, 'registration/OWNER_APPROVAL_f1ba57b4.json'), {
  id: 'STAGE3H_OWNER_GOVERNED_APPROVAL_f1ba57b4', boundTo: { registrationCandidateHash: CANDIDATE, amendmentSha256: sha('amendment-v3.json'), scopeTemplateSha256: sha('registration/OWNER_SCOPE_APPROVAL_RECORD_V3.json') },
  decisions: {
    'SCOPE-DDV': d('APPROVED_SELECTOR_SPECIFIC'),
    'SCOPE-TCA': d('APPROVED_NOT_TESTABLE_BOUNDED_SCOPE'),
    'SCOPE-PRIME': d('APPROVED_NOT_TESTABLE_BOUNDED_SCOPE'),
    'SCOPE-REGIME': d('OBSERVED_THREAT_AND_NO_OBSERVED_THREAT'),
    'SCOPE-THRESHOLDS': d('V3_WITH_APPROVED_O3_AMENDMENT; O3_MIN_ACCEPTED_PER_CELL=2; every other registered admission, power, weighting, multiplicity, materiality, equivalence and catastrophe condition retained'),
  },
  O3Choice: 'MIN_TWO_PER_CELL', intendedOutcome: 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION',
  reviewMode: 'OWNER_GOVERNED', independentReviewClaim: false, independentMethodReview: false, externalIndependentCustody: false, canonicalStage3hCertificationAuthorized: false, fullCanonicalStage3hCertification: false,
  gateWaivers: 'NONE (owner: NO GATE WAIVERS ARE AUTHORIZED)', rejectedCandidates: { '18ff522c238cd1e6ebec559229584fce28c31759883794a4a4e715811bcd2793': 'REJECTED (O-2 native identity twin)', 'e70625d137a93c5321dd96b53b59ec99b960811cbe67d2f699a01e7a5ed1f720': 'REJECTED (O-2R handle leak)' },
  sealedExecutionAuthorized: false, approvalReference: REF });
console.log('written');
