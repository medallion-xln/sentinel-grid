// V3 candidate builder (O-2R.1 + O-5). Derived from register-candidate-v2.mjs by explicit substitutions; earlier files untouched.
// Builds REGISTRATION_CANDIDATE_V3 and OWNER_SCOPE_APPROVAL_RECORD_V3 (both written once), status pending owner approval.
// Status stays REGISTRATION_PENDING_OWNER_APPROVAL. Nothing here allocates or materializes a world, activates a
// registration, or authorizes execution. Seeds are a fixed namespace rule; the schedule is integers only.
import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { stableStringify, sha256 } from '../src/core/determinism.js';
import { runtimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { schedule, scheduleHash } from './connector.mjs';
import { CONNECTOR_V3_ID } from './connector-v3.mjs';
import { IDENTITY_VIEW_V2_ID } from './identity-view-v2.mjs';
import { PREFLIGHT } from './campaign-v3.mjs';
import { ANALYSIS_ID } from './analysis-native.mjs';
import { registrationHash } from './campaign.mjs';
import { verifyOwnerLane, LANE, GA, V3_AMENDMENT_HASH, V3_COMMIT } from './inherit.mjs';

const ROOT = resolve(GA, '../..'), fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex'), J = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const NAMESPACES = Object.freeze({ A: 731000000000, B: 732000000000 });

/** Transitive closure of relative ES-module imports from an entry file. */
export function importClosure(entry) {
  const seen = new Set(), stack = [resolve(entry)];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:import|export)\s[^'"`]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) stack.push(resolve(dirname(f), m[1]));
    for (const m of src.matchAll(/import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) stack.push(resolve(dirname(f), m[1]));
  }
  return [...seen].sort();
}
function scanForSeeds(dir, bases, span, hits = []) {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n); if (/node_modules|\.git$|stage3h-owner-governed-v1/.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) scanForSeeds(p, bases, span, hits);
    else if (/\.(mjs|js|json)$/.test(n) && s.size < 64 * 1024 * 1024) { const t = readFileSync(p, 'utf8'); for (const m of t.matchAll(/\b73[12]\d{9}\b/g)) { const v = Number(m[0]); if (bases.some((b) => v >= b && v < b + span)) hits.push(relative(GA, p) + ':' + m[0]); } }
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assertSoleWriter(); const inh = verifyOwnerLane();
  const sv = J(resolve(LANE, 'evidence/sampling-validity.json')); if (sv.verdict.FORGE_WORLD_SAMPLING !== 'VALID') throw Error('FORGE_WORLD_SAMPLING_BLOCKED');
  const contract = J(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'));
  const plans = Object.fromEntries(Object.entries(NAMESPACES).map(([r, b]) => [r, schedule(contract.populations, b)]));
  const perRep = plans.A.length;
  // Prior-world exclusions: executed 3H.1-D/F world hashes plus the 288 development OPEN world hashes.
  // Reuse the existing 9,407-world exclusion record unchanged (bound by 18ff522c).
  const exclusionsPath = resolve(LANE, 'evidence/prior-world-exclusions.json'), excl = J(exclusionsPath), executed = { priorSeeds: excl.priorSeeds }, priorWorldHashes = excl.priorWorldHashes;
  const v1 = J(resolve(LANE, 'registration/REGISTRATION_CANDIDATE.json')), v2 = J(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V2.json'));
  if (v1.bindings.priorExclusions.sha256 !== fileSha(exclusionsPath) || v2.bindings.priorExclusions.sha256 !== fileSha(exclusionsPath) || priorWorldHashes.length !== 9407) throw Error('EXCLUSION_RECORD_CHANGED');
  const priorSeeds = new Set([...executed.priorSeeds, 202610090101, 202610090102, 202610090103, 202610090201, 202610090202, 202610090203]);
  const collision = { priorSeedHits: [...priorSeeds].filter((s) => Object.values(NAMESPACES).some((b) => s >= b && s < b + perRep)), repositoryTextHits: scanForSeeds(GA, Object.values(NAMESPACES), perRep), aBDisjoint: NAMESPACES.B - NAMESPACES.A >= perRep };
  if (collision.priorSeedHits.length || collision.repositoryTextHits.length || !collision.aBDisjoint) throw Error('NAMESPACE_COLLISION:' + JSON.stringify(collision));
  const closure = importClosure(resolve(LANE, 'campaign-v3.mjs')).filter((f) => f.startsWith(GA)).map((f) => relative(GA, f));
  const data = ['stage3h-final-review-handoff/amendments/v3/contract-v3.json', 'artifacts/stage3g8-projection-disclosure/stage3g8-open-phase-report.json', 'stage3h-owner-governed-v1/amendment.json', 'stage3h-owner-governed-v1/amendment-v2.json', 'stage3h-owner-governed-v1/amendment-v3.json', 'stage3h-owner-governed-v1/evidence/o2r1-gate.json', 'stage3h-owner-governed-v1/evidence/o2r-gate-diagnosis.json', 'stage3h-owner-governed-v1/evidence/flake-audit.json', 'stage3h-owner-governed-v1/evidence/flake-audit-review.json', 'stage3h-owner-governed-v1/evidence/o3-acceptance.json', 'stage3h-owner-governed-v1/evidence/sampling-validity.json', 'stage3h-owner-governed-v1/evidence/feasibility.json', 'stage3h-owner-governed-v1/evidence/connector-validation.json', 'stage3h-owner-governed-v1/evidence/o2-gate.json', 'stage3h-owner-governed-v1/evidence/o2r-path-review.json', 'stage3h-owner-governed-v1/evidence/o3-verification.json', 'stage3h-owner-governed-v1/evidence/o3-catastrophe-feasibility.json', 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json'];
  const sources = Object.fromEntries([...closure, ...data].sort().map((f) => [f, fileSha(resolve(GA, f))]));
  const amendmentSha = fileSha(resolve(LANE, 'amendment-v3.json'));
  const body = {
    id: 'STAGE3H_OWNER_GOVERNED_REGISTRATION_V1', revision: 3, supersedesCandidates: [{ hash: v1.registrationHash, reason: 'NUISANCE_CONTRACT_BLOCKED (evidence/o2-gate.json)' }, { hash: v2.registrationHash, reason: 'O-2R gate point 5 failed: handles not opaque (evidence/o2r-gate.json, o2r-gate-diagnosis.json)' }], status: 'REGISTRATION_PENDING_OWNER_APPROVAL', reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false, authority: 'R0',
    governanceAmendment: { file: 'stage3h-owner-governed-v1/amendment-v3.json', revision: 3, sha256: amendmentSha },
    v3: { commit: V3_COMMIT, amendmentHash: V3_AMENDMENT_HASH, contractSha256: sources['stage3h-final-review-handoff/amendments/v3/contract-v3.json'], role: 'PRESERVED_INACTIVE_EXTERNAL_STANDARD' },
    frozenSelector: { rule: contract.rule, ruleHash: contract.ruleHash, arms: { R: 'frozen horizon rule', B: 'frozen S0 ' + contract.comparatorModelHash, N: 'frozen NEXUS_ELSE_S0 at both horizons' }, exactControls: contract.equalityControls },
    environment: { generator: 'FORGE_SCENARIO_GENERATOR_SYMMETRIC_V1 over frozen V3/V2', counterfactual: 'FORGE_COUNTERFACTUAL_SYMMETRIC_V1 / GREEDY_CONTINUATION_V1', worldIdentity: 'hashWorld semantic projection (seed excluded)' },
    connector: CONNECTOR_V3_ID, runner: 'stage3h-owner-governed-v1/campaign-v3.mjs', activeRegistrationPath: 'stage3h-owner-governed-v1/registration/ACTIVE_REGISTRATION_V3.json', analysis: ANALYSIS_ID, nuisance: { D4: 'NATIVE_WORLD_ORIENTATION', IDENTITY: IDENTITY_VIEW_V2_ID, ORDER: 'OBSERVATION_ONLY', function: 'V3 runner.nuisanceDependence (unchanged)' }, preflight: PREFLIGHT, executionEnvironment: J(resolve(LANE, 'amendment-v3.json')).permittedExecutionEnvironment, analysisLabel: 'STAGE3H_OWNER_GOVERNED_V1',
    bindings: { sources, runtime: runtimeIdentity(), priorExclusions: { file: 'stage3h-owner-governed-v1/evidence/prior-world-exclusions.json', sha256: fileSha(exclusionsPath), worlds: priorWorldHashes.length } },
    population: { design: 'V3 contract populations, unchanged', populations: Object.fromEntries(Object.entries(contract.populations).map(([k, p]) => [k, { cells: p.cells, repetitionsPerCell: p.repetitionsPerCell, scheduledPerReplication: p.scheduledPerReplication }])), proposedWorlds: contract.proposedWorlds },
    scheduledPerReplication: perRep, namespaces: NAMESPACES, seedRule: 'seed = namespace base + k, k = 0..12767 in populations x cells x repetition order; one unique integer per world; no seed shared across cells', scheduleHashes: { A: scheduleHash(plans.A), B: scheduleHash(plans.B) }, namespaceCollisionAudit: collision,
    samplingValidity: { verdict: sv.verdict.FORGE_WORLD_SAMPLING, sha256: sources['stage3h-owner-governed-v1/evidence/sampling-validity.json'] },
    amendments: { O1: 'ADOPTED_IN_CANDIDATE_PENDING_APPROVAL', O2: 'WITHDRAWN', O2R: 'WITHDRAWN_HANDLE_LEAK', O2R1: 'ADOPTED_IN_CANDIDATE_PENDING_APPROVAL', O3: { choice: 'MIN_TWO_PER_CELL', ownerWording: 'MIN_ACCEPTED_PER_CELL=2', status: 'OWNER_APPROVED_FOR_e70625d1_CONDITIONALLY_RENEWAL_REQUIRED', options: ['KEEP_V3_HALF_PER_CELL', 'MIN_TWO_PER_CELL'] }, O4: 'ADOPTED_IN_CANDIDATE_PENDING_APPROVAL', O5: 'ADOPTED_IN_CANDIDATE_PENDING_APPROVAL' },
    ownerApproval: null,
    stopConditions: ['execute replication A then B exactly once each; no interim analysis; no early stopping', 'abort as CAMPAIGN_INVALID on any integrity failure (duplicate world hash, menu/surface mismatch, mutated input, nonfinite truth, runtime or source mismatch); report all', 'rejections are recorded and never replaced', 'analysis only after both LOCK files exist and verify', 'no rerun, retry, resize, threshold change or new arm after any outcome'],
    executionRisks: ['V3 1,000 ms lock-time assertion aborts on exceedance (dev max 342 ms; 321 ms under induced load); O-5 preflight refuses a marginal start before consuming a replication'],
    blinding: ['runner stdout: counts and hashes only', 'outputs written once and chmod 0444', 'owner attests not to open row files before both locks (procedural)'],
    limitations: ['REVIEW_MODE=OWNER_GOVERNED; INDEPENDENT_METHOD_REVIEW=false; EXTERNAL_INDEPENDENT_CUSTODY=false', 'same-person design, custody and execution', 'canonical runtime numerics accepted by owner, not certified independently', 'TCA and incumbent Prime not testable; no surrogate', 'result cannot establish canonical Stage 3H certification or MoE gain'],
  };
  const candidate = { ...body, registrationHash: registrationHash(body) };
  if (!existsSync(resolve(LANE, 'registration'))) mkdirSync(resolve(LANE, 'registration'));
  writeExclusive(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V3.json'), candidate);
  const decision = (proposed) => ({ status: 'PENDING_OWNER_APPROVAL_FOR_THIS_REVISION', proposedDisposition: proposed, ownerDispositionGivenForE70625d1: proposed, actualDisposition: null, approved: false, ownerIdentity: null, date: null, signatureOrTrustedApprovalReference: null });
  writeExclusive(resolve(LANE, 'registration/OWNER_SCOPE_APPROVAL_RECORD_V3.json'), {
    id: 'STAGE3H_OWNER_GOVERNED_SCOPE_APPROVAL_V1', revision: 3, boundTo: { registrationCandidateHash: candidate.registrationHash, amendmentSha256: amendmentSha, v3AmendmentHash: V3_AMENDMENT_HASH },
    instructionIsApproval: false, recommendationIsApproval: false,
    decisions: {
      'SCOPE-DDV': decision('APPROVED: selector-specific downstream decision value; not incumbent Prime DDV or nine-expert collective intelligence.'),
      'SCOPE-TCA': decision('APPROVED_NOT_TESTABLE: canonical World-Model Trust Gate unavailable; limitation retained; no substitute gate; TCA not measured.'),
      'SCOPE-PRIME': decision('APPROVED_NOT_TESTABLE: incumbent Prime not qualified for matched-information evaluation; experimental synthesis zero-gain finding preserved separately.'),
      'SCOPE-REGIME': decision('APPROVED: OBSERVED_THREAT and NO_OBSERVED_THREAT only; other regimes outside the bounded claim.'),
      'SCOPE-THRESHOLDS': decision('CONDITIONAL APPROVAL: V3 thresholds and inference rules; O-3 MIN_ACCEPTED_PER_CELL=2; retain 0.9 global and per-horizon floors, effective-N floors, fixed cell weights, no replacement, multiplicity, materiality and catastrophe veto; no change after outcomes. Revision 3 uses O-2R.1 (observation-only IDENTITY with opaque handles everywhere) and the O-5 fail-closed preflight.'),
    },
    O3Choice: 'MIN_TWO_PER_CELL', intendedOutcome: 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION', fullCanonicalStage3hCertification: false, reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false, approvalRequiredBecause: 'the renewed approval was bound to e70625d1, whose O-2R failed gate point 5 (handle opacity)', intendedOutcomeOptions: ['BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION', 'FULL_CANONICAL_STAGE3H_CERTIFICATION'],
    registrationActivationApproved: false, executionAuthorized: false,
  });
  console.log(JSON.stringify({ candidateHash: candidate.registrationHash, sources: Object.keys(sources).length, priorWorlds: priorWorldHashes.length, collision, inheritanceHead: inh.head }, null, 1));
}
