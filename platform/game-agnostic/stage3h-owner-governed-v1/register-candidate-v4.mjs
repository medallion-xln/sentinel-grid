// Successor candidate builder (revision 4: amendment O-6 STAGE3H_NATIVE_MENU_VALIDITY_V1 after the aborted registration
// 0364164c). Builds registration/REGISTRATION_CANDIDATE_V4.json and registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json
// (both written once). Status REGISTRATION_PENDING_OWNER_APPROVAL. Allocates NO namespace (procedure only), materializes
// no world, activates nothing, authorizes nothing. Earlier candidates, the predecessor registration and every file they
// bind are read, never edited. Unchanged design blocks are copied verbatim from candidate f1ba57b4.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { runtimeIdentity } from '../stage3h-final-review-handoff/amendments/v3/runner.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { importClosure } from './register-candidate-v3.mjs';
import { CONNECTOR_V4_ID } from './connector-v4.mjs';
import { PREFLIGHT, O6_DECISION } from './campaign-v4.mjs';
import { NATIVE_MENU_VALIDITY_ID, INVALID_REASON, CAUSES } from './menu-validity-v1.mjs';
import { BLOCK, FIRST_BLOCK, LAST_BLOCK, EXCLUDED_BLOCKS, PER_REPLICATION, ALLOCATION_FILE } from './allocate-namespaces-v4.mjs';
import { registrationHash } from './campaign.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex'), J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const L = (p) => 'stage3h-owner-governed-v1/' + p;
const filesUnder = (dir) => readdirSync(resolve(GA, dir)).flatMap((n) => { const p = dir + '/' + n; return statSync(resolve(GA, p)).isDirectory() ? filesUnder(p) : [p]; });
const PRED = '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f', PRED_COMMIT = 'e009344c2c973a329a4b88582f90b9e58e15abce';
const OPEN_SEEDS = [202610090101, 202610090102, 202610090103, 202610090201, 202610090202, 202610090203];
const PARITY_PARTS = ['OPEN', 'CONFIRM_A', 'CONFIRM_B', 'IN_DISTRIBUTION_CONTROL', 'OOD_LEVEL', 'OOD_ROLES', 'OOD_OBJECTIVES', 'OOD_SHAPES'];

assertSoleWriter(); const inh = verifyOwnerLane();
for (const p of ['registration/REGISTRATION_CANDIDATE_V4.json', 'registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json', ALLOCATION_FILE, 'registration/ACTIVE_REGISTRATION_V4.json', 'registration/EXECUTION_AUTHORIZATION_V4.json']) ok(!existsSync(resolve(LANE, p)), 'ALREADY_EXISTS:' + p);

// Predecessor identity and state: active, aborted in A, B never started, no results.
const pred = J(L('registration/ACTIVE_REGISTRATION_V3.json')), cand3 = J(L('registration/REGISTRATION_CANDIDATE_V3.json'));
ok(pred.registrationHash === PRED && registrationHash(pred) === PRED && pred.activatesCandidate === cand3.registrationHash, 'PREDECESSOR_IDENTITY');
ok(Object.entries(pred.bindings.sources).every(([p, h]) => fsha(p) === h), 'PREDECESSOR_BOUND_SOURCE_CHANGED');
const runs = resolve(LANE, 'runs', PRED.slice(0, 16));
ok(existsSync(resolve(runs, 'A')) && readdirSync(resolve(runs, 'A')).length === 0 && !existsSync(resolve(runs, 'B')), 'PREDECESSOR_RUN_STATE');
const consumption = J(L('evidence/execution-0364164c/replication-consumption.json'));
ok(consumption.registration === PRED && consumption.replicationA.status === 'CONSUMED_ABORTED' && consumption.replicationA.rowsWritten === 0 && consumption.replicationA.outcomesObserved === false && consumption.replicationB.status === 'NOT_STARTED_NOT_CONSUMED', 'PREDECESSOR_CONSUMPTION_RECORD');

// Successor evidence gates.
const repro = J(L('evidence/successor-v4/defect-reproduction.json')), scan = J(L('evidence/successor-v4/menu-scan.json')), replay = J(L('evidence/successor-v4/menu-scan-replay.json'));
const fixtures = J(L('evidence/successor-v4/fixtures.json')), stats = J(L('evidence/successor-v4/statistical-validity-v2.json'));
const parity = Object.fromEntries(PARITY_PARTS.map((p) => [p, J(L('evidence/successor-v4/parity/' + p + '.json'))]));
ok(repro.reproduced === true && repro.sealedAWorldIdentified === false, 'DEFECT_NOT_REPRODUCED');
ok(scan.worlds === 9456 && scan.recordsSha256 === replay.recordsSha256 && replay.worlds === 9456 && scan.total.allInvariant && scan.total.cellsOutsideTrackA === 0, 'SCAN_GATE');
ok(fixtures.verdict === 'ALL_FIXTURES_PASS' && fixtures.requiredCategoriesCovered, 'FIXTURE_GATE');
ok(stats.verdict === 'STATISTICALLY_VALID_CONDITIONAL_ON_VALID_MENU_POPULATION' && stats.scanRecordsSha256 === scan.recordsSha256, 'STATISTICS_GATE');
const pw = Object.values(parity).reduce((n, p) => n + p.worlds, 0), menuAborts = Object.values(parity).reduce((n, p) => n + (p.relations.V3_MENU_ABORT ?? 0), 0);
ok(Object.values(parity).every((p) => p.verdict === 'PARITY_EXACT') && pw === 9456 && menuAborts === scan.total.invalid, 'PARITY_GATE');
const fv = J(L('evidence/successor-v4/final-verification.json'));
ok(fv.verdict === 'FINAL_VERIFICATION_PASS' && fv.scientific.verdict === 'SCIENTIFIC_CONTRACT_SATISFIED' && fv.reconciliation.matches && fv.reconciliation.soleIntendedDifferenceIsWitness, 'FINAL_VERIFICATION_GATE');
const sv = J(L('evidence/sampling-validity.json')); ok(sv.verdict.FORGE_WORLD_SAMPLING === 'VALID', 'FORGE_WORLD_SAMPLING_BLOCKED');
const excl = J(L('evidence/prior-world-exclusions.json')); ok(excl.priorWorldHashes.length === 9407 && fsha(L('evidence/prior-world-exclusions.json')) === pred.bindings.priorExclusions.sha256, 'EXCLUSION_RECORD_CHANGED');
const reachedHashes = new Set(J(L('evidence/successor-v4/menu-scan-records.json')).records.filter((r) => !r.preRejection).map((r) => r.worldHash));
ok(excl.priorWorldHashes.every((h) => reachedHashes.has(h)) && reachedHashes.size === 9407, 'EXCLUSIONS_NOT_EQUAL_TO_SCANNED_ADMITTED_WORLDS');

// Bound sources: import closures of every successor entry point, plus data and evidence.
const entries = ['campaign-v4.mjs', 'allocate-namespaces-v4.mjs', 'tests-v4.mjs', 'clone-verify-v4.mjs', 'register-candidate-v4.mjs', 'successor-defect-reproduction.mjs', 'successor-menu-scan.mjs', 'successor-fixtures.mjs', 'successor-statistics.mjs', 'successor-statistics-v2.mjs', 'successor-parity.mjs', 'successor-preflight-v4.mjs', 'successor-clean-clone-v4.mjs', 'successor-final-verify-v4.mjs'];
const closure = [...new Set(entries.flatMap((e) => importClosure(resolve(LANE, e))))].filter((f) => f.startsWith(GA)).map((f) => relative(GA, f));
const predData = Object.keys(cand3.bindings.sources).filter((f) => !f.endsWith('.mjs') && !f.endsWith('.js'));
const spentInputs = ['stage3h1d-development', 'stage3h1f-development'].flatMap((d) => filesUnder(d + '/results').filter((f) => /\/(rows|summary)\.json$/.test(f)));
const data = [...predData, L('amendment-v4.json'), L('registration/REGISTRATION_CANDIDATE_V3.json'), L('registration/ACTIVE_REGISTRATION_V3.json'), L('registration/OWNER_APPROVAL_f1ba57b4.json'),
  L('registration/EXECUTION_AUTHORIZATION_V3.json'), L('EXECUTION_RESULT_0364164c.txt'), ...filesUnder(L('evidence/execution-0364164c')), ...filesUnder(L('evidence/successor-v4')), ...spentInputs];
const sources = Object.fromEntries([...new Set([...closure, ...data])].sort().map((f) => [f, fsha(f)]));
const amendmentSha = sources[L('amendment-v4.json')], amendment = J(L('amendment-v4.json'));

const body = {
  id: 'STAGE3H_OWNER_GOVERNED_REGISTRATION_V1', revision: 4, kind: 'SUCCESSOR_REGISTRATION_CANDIDATE', status: 'REGISTRATION_PENDING_OWNER_APPROVAL',
  reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false, authority: 'R0',
  predecessor: { registrationHash: PRED, registrationCommit: PRED_COMMIT, activatedCandidate: cand3.registrationHash, status: { A: 'CONSUMED_ABORTED', B: 'NOT_STARTED', results: 'NONE', verdict: 'EXECUTION_INVALID_OR_ABORTED' },
    abortCause: 'NATIVE_MENU_MISMATCH in nativeLock (native duplicate action id; defect class reproduced on spent worlds; the sealed A world is not identified)', consumedRunDirectory: L('runs/' + PRED.slice(0, 16) + '/A') + ' (empty; retained; never rerun)',
    consumptionRecord: { file: L('evidence/execution-0364164c/replication-consumption.json'), sha256: sources[L('evidence/execution-0364164c/replication-consumption.json')], replicationA: consumption.replicationA.status, replicationB: consumption.replicationB.status }, continuation: false, predecessorBReused: false },
  supersedesCandidates: [...cand3.supersedesCandidates, { hash: cand3.registrationHash, reason: 'activated as ' + PRED + '; replication A aborted on NATIVE_MENU_MISMATCH (EXECUTION_INVALID_OR_ABORTED)' }],
  governanceAmendment: { file: L('amendment-v4.json'), revision: 4, sha256: amendmentSha },
  v3: cand3.v3, frozenSelector: cand3.frozenSelector, environment: cand3.environment,
  connector: CONNECTOR_V4_ID, runner: L('campaign-v4.mjs'), activeRegistrationPath: L('registration/ACTIVE_REGISTRATION_V4.json'), executionAuthorizationPath: L('registration/EXECUTION_AUTHORIZATION_V4.json'),
  analysis: cand3.analysis, analysisLabel: cand3.analysisLabel, nuisance: cand3.nuisance, preflight: PREFLIGHT, executionEnvironment: amendment.permittedExecutionEnvironment,
  menuValidity: { id: NATIVE_MENU_VALIDITY_ID, module: L('menu-validity-v1.mjs'), invalidReason: INVALID_REASON, causes: CAUSES, policyFacingViewsPerWorld: 11, validationPoint: amendment['O-6'].validationPoint, ownerDecision: O6_DECISION },
  bindings: { sources, runtime: runtimeIdentity(), priorExclusions: pred.bindings.priorExclusions },
  population: cand3.population, scheduledPerReplication: cand3.scheduledPerReplication, seedRule: cand3.seedRule,
  namespaces: null, scheduleHashes: null,
  namespaceAllocation: { status: 'NOT_ALLOCATED', allocatedBy: 'owner-approved procedure, after approval of this exact candidate', procedure: { file: L('allocate-namespaces-v4.mjs'), sha256: sources[L('allocate-namespaces-v4.mjs')], command: 'node allocate-namespaces-v4.mjs <this registrationHash>', output: L(ALLOCATION_FILE) + ' (written once; bound at activation with the schedule hashes)' },
    rule: { BLOCK, FIRST_BLOCK, LAST_BLOCK, PER_REPLICATION, order: 'A = first passing block from FIRST_BLOCK, B = next passing block', checks: ['no prior executed or development seed in [base, base + 12768)', 'no 12-digit integer of that range in repository .mjs/.js/.json text', 'block not excluded', 'A and B disjoint'] },
    excludedBlocks: EXCLUDED_BLOCKS, excludedPredecessorNamespaces: { A: { base: pred.namespaces.A, status: 'CONSUMED_ABORTED', excluded: 'ENTIRE_10^9_BLOCK' }, B: { base: pred.namespaces.B, status: 'NOT_STARTED', excluded: 'ENTIRE_10^9_BLOCK; not a continuation' } },
    additionalPriorSeeds: OPEN_SEEDS, worldLevel: 'At execution every world whose semantic hash is among the 9,407 prior world hashes is rejected PRIOR_WORLD_EXCLUDED and never replaced. Consumed A worlds were never recorded and may not be regenerated, so they are excluded at seed level (the whole 731 block) only; no outcome of any A world was observed.' },
  samplingValidity: cand3.samplingValidity,
  estimandImpact: { evidence: L('evidence/successor-v4/final-verification.json'), structuralZeroPopulations: fv.estimand.structuralZeros.populations, OOD_ROLES: { maxShiftMetric95: fv.estimand.OOD_ROLES.maxShiftMetric, maxShiftContrast95: fv.estimand.OOD_ROLES.maxShiftContrast, fractionOfMateriality: fv.estimand.OOD_ROLES.maxShiftContrastAsFractionOfMateriality }, statement: fv.estimand.interpretation },
  successorEvidence: { defectReproduction: sources[L('evidence/successor-v4/defect-reproduction.json')], spentWorldScan: { summary: sources[L('evidence/successor-v4/menu-scan.json')], records: sources[L('evidence/successor-v4/menu-scan-records.json')], recordsSha256: scan.recordsSha256, replay: sources[L('evidence/successor-v4/menu-scan-replay.json')] },
    fixtures: sources[L('evidence/successor-v4/fixtures.json')], finalVerification: sources[L('evidence/successor-v4/final-verification.json')], statisticalValidity: { v2: sources[L('evidence/successor-v4/statistical-validity-v2.json')], v1Preserved: sources[L('evidence/successor-v4/statistical-validity.json')], verdict: stats.verdict },
    connectorParity: Object.fromEntries(PARITY_PARTS.map((p) => [p, sources[L('evidence/successor-v4/parity/' + p + '.json')]])),
    summary: { spentWorlds: scan.worlds, reachedRule: scan.total.reachedMenuRule, invalid: scan.total.invalid, emptyMenu: scan.total.emptyMenu, duplicateActionId: scan.total.duplicateActionId, parityWorlds: pw, parityAcceptedEqual: Object.values(parity).reduce((n, p) => n + p.acceptedEqual, 0), parityAccepted: Object.values(parity).reduce((n, p) => n + p.accepted, 0) } },
  amendments: { O1: 'CARRIED_UNCHANGED_RENEWAL_REQUIRED', O2: 'WITHDRAWN', O2R: 'WITHDRAWN_HANDLE_LEAK', O2R1: 'CARRIED_UNCHANGED_RENEWAL_REQUIRED', O3: { choice: 'MIN_TWO_PER_CELL', ownerWording: 'MIN_ACCEPTED_PER_CELL=2', status: 'CARRIED_UNCHANGED_RENEWAL_REQUIRED', options: cand3.amendments.O3.options }, O4: 'CARRIED_UNCHANGED_RENEWAL_REQUIRED', O5: 'CARRIED_UNCHANGED_RENEWAL_REQUIRED', O6: 'PROPOSED_PENDING_OWNER_APPROVAL' },
  ownerApproval: null, ownerApprovalRequired: true,
  stopConditions: ['execute replication A then B exactly once each; no interim analysis; no early stopping', 'a NATIVE_MENU_INVALID world is a pre-policy rejection: never scored, never replaced, counted in admission', 'abort as CAMPAIGN_INVALID on any integrity failure (duplicate world hash, malformed or mismatched menu, mutated input, nonfinite truth, runtime or source mismatch, lock-time limit); ABORT.json is written; the replication is consumed', 'replication B never starts unless A locked without an abort record', 'rejections are recorded and never replaced', 'analysis only after both LOCK files exist and verify and no ABORT record exists', 'no rerun, retry, resize, threshold change or new arm after any outcome; a further successor needs new owner approval'],
  abortSemantics: 'Any exception after the replication directory exists writes ABORT.json (error code only; no world identity; no rows) and re-throws. The replication is consumed and never rerun; B never starts after an A abort; analysis refuses while any ABORT record exists; the registration is then EXECUTION_INVALID_OR_ABORTED and only a new owner-approved successor may follow. A NATIVE_MENU_INVALID world is a rejection, not an abort.',
  disjointness: 'A and B occupy different 10^9 blocks allocated after approval; each 12,768-seed range is disjoint from every prior executed and development seed, from blocks 731 and 732 and from repository text; at execution the 9,407 prior world hashes are excluded (PRIOR_WORLD_EXCLUDED, never replaced) and a within-run duplicate world aborts the replication.',
  admissionAndCatastrophe: { O3: 'MIN_ACCEPTED_PER_CELL=2 with 0.9 population and per-horizon floors and Kish effective-N >= 2100 (ownerAdmission, unchanged)', catastropheVeto: 'zeroIntroductionUpper(cells, 40) <= 0.02 and the false-selection veto, unchanged', menuRejections: 'counted as rejections in their own cell; fixed cell weights; no replacement', feasibility: 'evidence/successor-v4/statistical-validity-v2.json: admission and bound-attainability probabilities equal to the reproduced predecessor in every population, including two stress variants' },
  onceOnly: 'An existing replication directory refuses a rerun; a refused preflight consumes nothing; a started replication is consumed whether it locks or aborts.',
  outcomeLocking: 'Each replication writes rows, ledger and admission once (read-only) plus LOCK.json; runner output is counts and hashes only; analysis refuses until both A and B LOCK files exist and verify.',
  executionRisks: [...cand3.executionRisks, 'native duplicate-action worlds are now pre-policy rejections, not aborts; they are structurally impossible in four of five populations and in the 48 OOD_ROLES reach_target cells; in the 48 at-risk OOD_ROLES cells the one-sided 95% upper bound is 0.52% per world (1/912 spent at-risk worlds); no point rate is extrapolated from that single world'],
  blinding: cand3.blinding,
  limitations: [...cand3.limitations, 'inference is conditional on the valid-menu population; no claim for worlds whose native menu repeats an action', 'duplicated dependency relationships without menu effect (222/9,456 spent worlds) are native generator behaviour, neither rejected nor repaired', 'consumed A worlds are excluded at seed level only (never recorded; regeneration prohibited)', 'the 1,000 ms lock-time abort risk is unchanged (O-5 preflight mitigates a marginal start only)'],
};
const candidate = { ...body, registrationHash: registrationHash(body) };
writeExclusive(resolve(LANE, 'registration/REGISTRATION_CANDIDATE_V4.json'), candidate);
const decision = (proposed) => ({ status: 'PENDING_OWNER_APPROVAL_FOR_THIS_SUCCESSOR', proposedDisposition: proposed, actualDisposition: null, approved: false, ownerIdentity: null, date: null, signatureOrTrustedApprovalReference: null });
const prev = J(L('registration/OWNER_APPROVAL_f1ba57b4.json')).decisions;
writeExclusive(resolve(LANE, 'registration/OWNER_SCOPE_APPROVAL_RECORD_V4.json'), {
  id: 'STAGE3H_OWNER_GOVERNED_SCOPE_APPROVAL_V1', revision: 4, boundTo: { registrationCandidateHash: candidate.registrationHash, amendmentSha256: amendmentSha, predecessorRegistrationHash: PRED },
  instructionIsApproval: false, recommendationIsApproval: false, approvalOfPredecessorCarriesOver: false,
  decisions: {
    ...Object.fromEntries(Object.entries(prev).map(([k, d]) => [k, decision((d.actualDisposition ?? d.proposedDisposition ?? 'AS APPROVED FOR f1ba57b4') + ' [renewal for successor ' + candidate.registrationHash.slice(0, 8) + ']')])),
    [O6_DECISION]: decision('APPROVE STAGE3H_NATIVE_MENU_VALIDITY_V1: a world with an EMPTY policy-facing menu or a DUPLICATE action id in any of its 11 policy-facing views is rejected NATIVE_MENU_INVALID before any policy call, atomically, never repaired, scored or replaced; inference is conditional on the valid-menu population.'),
    'SUCCESSOR-EXECUTION-SEMANTICS': decision('APPROVE: new A/B namespaces allocated only after this approval by allocate-namespaces-v4.mjs (blocks from 733; 731 consumed-A block and 732 predecessor-B block excluded entirely); prior exclusions unchanged; abort record and consumption on any integrity failure; B only after A locked without abort; no continuation of 0364164c.'),
  },
  O3Choice: 'MIN_TWO_PER_CELL', intendedOutcome: 'BOUNDED_OWNER_GOVERNED_SELECTOR_QUALIFICATION', fullCanonicalStage3hCertification: false, reviewMode: 'OWNER_GOVERNED', independentMethodReview: false, externalIndependentCustody: false,
  approvalRequiredBecause: 'registration 0364164c aborted (EXECUTION_INVALID_OR_ABORTED); the successor adds amendment O-6 and new execution semantics, so every decision needs new explicit approval bound to this candidate',
  registrationActivationApproved: false, namespaceAllocationApproved: false, executionAuthorized: false,
});
console.log(JSON.stringify({ candidateHash: candidate.registrationHash, sources: Object.keys(sources).length, closure: closure.length, data: data.length, parityWorlds: pw, invalid: scan.total.invalid, inheritanceHead: inh.head }, null, 1));
