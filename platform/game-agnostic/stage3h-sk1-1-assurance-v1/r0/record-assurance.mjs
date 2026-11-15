// SK1.1 Phase 6 — writes evidence/SK1_1_ENGINEERING_ASSURANCE.json (evidence side; never imported by the envelope).
//   /opt/homebrew/bin/node r0/record-assurance.mjs            run and print; write nothing
//   /opt/homebrew/bin/node r0/record-assurance.mjs --write    run and (re)write the record
// It runs the Phase 6 test files, maps every test to its verification item, replays the frozen validation requests
// through the envelope when the privileged class records are present, and checks that the frozen SK1 lane is untouched.
// It reads no outcome and no evaluator truth, generates no world and computes no scientific metric.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { sha256 } from '../../stage3h-sk1-safety-kernel-v1/kernel/contract.mjs';
import { PINS, ASSURED_API_VERSION, ENVELOPE_CONTRACT, LABELS, SK1_LANE } from './assured-api.mjs';
import { replayValidationThroughEnvelope } from './equivalence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), REPO = resolve(LANE, '../../..'), OUT = resolve(LANE, 'evidence/SK1_1_ENGINEERING_ASSURANCE.json'), GIT = '/usr/bin/git';
const CANDIDATE = 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1_1_CANDIDATE';

// status vocabulary: VERIFIED_IN_FROZEN_KERNEL | VERIFIED_ONLY_WITH_V1_1_ENVELOPE | DEFECT_FOUND_NOT_PATCHED
const ITEMS = [
  { id: 'P6-01', item: 'Complete legal-action-menu integrity', status: 'VERIFIED_IN_FROZEN_KERNEL', note: 'The frozen kernel ranks every lawful action exactly once and never selects outside the menu (600/600 replayed records pass an independent output check). The envelope re-checks every response and refuses a malformed one.' },
  { id: 'P6-02', item: 'Explicit evidence-source provenance', status: 'VERIFIED_ONLY_WITH_V1_1_ENVELOPE', findings: [], note: 'The frozen record carries the evidence contract and validation status but no statement of who produced the evidence. The envelope requires a declared source per expert and records an evidence digest. Provenance is DECLARED_BY_CALLER_NOT_AUTHENTICATED: the envelope cannot prove the producer.' },
  { id: 'P6-03', item: 'Risk versus deterministic safety separation', status: 'VERIFIED_IN_FROZEN_KERNEL', note: 'Constraint outcomes and risk estimates are separate fields; every estimate is labelled EMPIRICAL_ESTIMATE and the record status is EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE. The envelope adds three disjoint sections and never words an estimate as an established property.' },
  { id: 'P6-04', item: 'Unknown-state handling', status: 'DEFECT_FOUND_NOT_PATCHED', findings: ['F3', 'F4'], note: 'Missing fields the frozen kernel reads as features are reported and lead to abstention. But an out-of-vocabulary action type or entity kind receives a SUPPORTED estimate, and several absent fields are silently imputed. The envelope refuses those requests.' },
  { id: 'P6-05', item: 'Malformed expert evidence rejection', status: 'DEFECT_FOUND_NOT_PATCHED', findings: ['F5'], note: 'Malformed or contradictory evidence is rated INVALID and the frozen kernel abstains. But the expert `kind` label and unknown extra fields are not validated. The envelope refuses every evidence object that is not structurally exact and VALID; absent evidence passes through to the frozen abstention.' },
  { id: 'P6-06', item: 'Stable action semantics', status: 'VERIFIED_IN_FROZEN_KERNEL', note: 'Per-action constraints, tier and estimates are exactly equal under menu reordering, entity relabelling and all eight D4 frames on both fixtures (and 0 violations in 13,200 transformed views in the committed SK1 audit).' },
  { id: 'P6-07', item: 'Deterministic tie handling', status: 'VERIFIED_IN_FROZEN_KERNEL', findings: ['F7'], note: 'Exactly tied actions are returned together and the set is equivariant under menu order. Finding F7 concerns only the `representative` field when the set holds distinct actions; the SK1 evaluation scored the whole set, so no result is affected.' },
  { id: 'P6-08', item: 'Confidence and uncertainty serialization', status: 'VERIFIED_IN_FROZEN_KERNEL', note: 'All numbers are finite, probabilities lie in [0,1], bounds are ordered and records are JSON-stable on 600/600 replayed records. The envelope asserts this on every response and labels the bound a heuristic, not a calibrated interval.' },
  { id: 'P6-09', item: 'Decision-hash reproduction', status: 'VERIFIED_IN_FROZEN_KERNEL', note: 'Replay reproduces the committed decision hash for both demo fixtures and all 600 validation classes. The envelope passes the hash through unchanged and adds an envelope hash and an offline verifier.' },
  { id: 'P6-10', item: 'Refusal of execute/mutate requests', status: 'DEFECT_FOUND_NOT_PATCHED', findings: ['F1', 'F2'], note: 'The frozen kernel has no code path that executes, so nothing can be executed. But its refusal of REQUESTS is incomplete: the key scans are exact and case-sensitive, and unknown options are silently ignored. The envelope refuses the variants.' },
  { id: 'P6-11', item: 'Fail-closed contract-version mismatch', status: 'VERIFIED_ONLY_WITH_V1_1_ENVELOPE', findings: ['F4'], note: 'The frozen kernel fails closed on an observation-contract mismatch (it abstains: no model applies) and on an evidence-contract mismatch (INVALID). A request carries no API or request-contract version, and projection.version is not compared. The envelope requires an explicit declaration and refuses any mismatch before the kernel is called.' },
  { id: 'P6-12', item: 'Output labels accurately reflecting NOT_QUALIFIED status', status: 'DEFECT_FOUND_NOT_PATCHED', findings: ['F6', 'F8'], note: 'With the committed model every frozen response is labelled NOT_QUALIFIED, R0, canDispatch=false. But the label and the abstention criterion are read from whatever model file is loaded, and the loader accepts any self-consistent file. The envelope serves the pinned bytes or nothing and asserts the labels on every response.' },
];
const FINDINGS = [
  { id: 'F1', title: 'Execution-request key scan is exact and case-sensitive; unknown options are silently ignored', component: 'kernel/contract.mjs EXECUTION_KEY, validateRequest',
    reproducer: "api.recommend(state, legalActions, evidence, { Execute: true })  — also executeAction, doDispatch, autoApply, mutation, commitAction, perform, run, enact, { tau: 0.9 }, { intent: 'EXECUTE' }", frozenBehaviour: 'Accepted; the normal record is returned with the same decision hash. Nothing is executed (no such code path exists).', envelopeBehaviour: 'EXECUTION_OR_MUTATION_REQUESTED, or UNKNOWN_DECLARATION_KEY for a non-effect key', fixWouldChangeSk1PolicyBehaviour: false },
  { id: 'F2', title: 'Privileged-field key scan is exact and case-sensitive', component: 'kernel/contract.mjs FORBIDDEN_KEY',
    reproducer: 'state.projection.actor.world_hash = 1  — also Truth, WorldHash, hidden_health, Seed, groundTruth, trueUtility, evaluatorTruth, rngSeed, privileged', frozenBehaviour: 'Accepted. The decision set is unchanged because the featurizer never reads the field (the SK1 audit traces reads against an allow-list), but the request is not refused and its hash changes.', envelopeBehaviour: 'PRIVILEGED_FIELD_IN_REQUEST', fixWouldChangeSk1PolicyBehaviour: false },
  { id: 'F3', title: 'Out-of-vocabulary action type or entity kind receives a SUPPORTED risk estimate', component: 'adapters/forge/features.mjs one-hot encoding; kernel/risk.mjs novelty check',
    reproducer: "legalActions[0].type = 'TELEPORT'   or   projection.nodes[t].kind = 'WORMHOLE'", frozenBehaviour: 'riskStatus ESTIMATED for that action: all one-hot columns are zero, and the novelty check fires only on a non-zero never-seen column.', envelopeBehaviour: 'INPUT_OUTSIDE_ADAPTER_VOCABULARY', fixWouldChangeSk1PolicyBehaviour: true, prospectiveIdentity: CANDIDATE,
    proposedCorrection: 'Report UNSUPPORTED_NOVEL_CATEGORY for an action whose type or target kind is outside the adapter vocabulary. Not implemented.' },
  { id: 'F4', title: 'Absent public fields are silently imputed; projection.version is not compared with the contract version', component: 'adapters/forge/features.mjs',
    reproducer: 'delete projection.terrainCounts | delete projection.history.channels | delete action.destTerrain | delete flags.threatened on an entity no action targets | projection.version = "HW1_PUBLIC_PROJECTION_V2"', frozenBehaviour: 'Estimates stay ESTIMATED: zero hazard cells, no history, non-hazard destination, flag counted as false; the version is not checked.', envelopeBehaviour: 'REQUIRED_PUBLIC_FIELD_MISSING / OBSERVATION_CONTRACT_MISMATCH', fixWouldChangeSk1PolicyBehaviour: true, prospectiveIdentity: CANDIDATE,
    proposedCorrection: 'Treat these absences as UNSUPPORTED_MISSING_INFORMATION, as the kernel already does for the other fields. Not implemented.' },
  { id: 'F5', title: 'Evidence validator ignores the expert `kind` label and unknown extra fields', component: 'adapters/forge/evidence.mjs validateEvidence',
    reproducer: "evidence.experts.S0.kind = 'ORACLE_ROLLOUT'   or   evidence.experts.S0.handles = ['E7']   or   delete evidence.experts.NEXUS.kind", frozenBehaviour: 'evidence.status VALID; the evidence is used.', envelopeBehaviour: 'MALFORMED_EVIDENCE', fixWouldChangeSk1PolicyBehaviour: true, prospectiveIdentity: CANDIDATE,
    proposedCorrection: 'Validate kinds and reject unknown fields in the evidence contract. Not implemented.' },
  { id: 'F6', title: 'Model loader accepts any self-consistent model file; the qualification label and risk criterion come from that file', component: 'api/host.mjs loadModel, api/recommend.mjs modelPath',
    reproducer: 'copy models/SK1_MODEL.json, set qualification.status = "QUALIFIED" and ranking.tau = 1, recompute modelHash, createRecommendationApi({ game: "forge", modelPath })', frozenBehaviour: 'Served. The response is labelled QUALIFIED and the committed abstain fixture becomes a recommendation.', envelopeBehaviour: 'MODEL_PIN_MISMATCH at construction', fixWouldChangeSk1PolicyBehaviour: false },
  { id: 'F7', title: '`representative` is a listing artefact when a decision set holds distinct actions', component: 'kernel/ranking.mjs selectedIndex, kernel/record.mjs representative',
    reproducer: 'a model that scores all actions equally (tests/helpers.mjs toyModel with empty trees) on the synthetic projection', frozenBehaviour: 'decisionSet holds all tied actions and indistinguishableDistinctActions is true, but `representative` still names the first in canonical-signature order. 4 of 600 validation classes have such a set; the evaluation scored the whole set.', envelopeBehaviour: 'assurance.tie.assuredRepresentative = null, singleActionIdentified = false', fixWouldChangeSk1PolicyBehaviour: false },
  { id: 'F8', title: 'The API host files are outside the source identity carried in a decision record', component: 'api/host.mjs sourceIdentity',
    reproducer: 'read api/host.mjs: kernelSourceHash covers kernel/*.mjs and adapterSourceHash covers adapters/<game>/*.mjs; api/host.mjs and api/recommend.mjs are in neither', frozenBehaviour: 'A change to the host layer does not change sourceIdentity or decisionHash. (The SK1 experiment freeze does hash both files.)', envelopeBehaviour: 'all twelve inference files are compared with the frozen hashes at construction', fixWouldChangeSk1PolicyBehaviour: false },
  { id: 'F9', title: 'legalActionMenu.identity is invariant to menu order and relabelling but not to the D4 frame', component: 'kernel/record.mjs menuIdentity (digest of frame-relative action keys)', severity: 'INFORMATIONAL',
    reproducer: 'frameProjection(P, "R90") on either demo fixture', frozenBehaviour: 'Decision, tiers and estimates are identical; the menu identity differs. It identifies the menu as presented, not its D4 orbit.', envelopeBehaviour: 'unchanged (passed through)', fixWouldChangeSk1PolicyBehaviour: false },
];

function runTests() {
  const files = readdirSync(HERE).filter((n) => n.endsWith('.test.mjs')).sort().map((n) => resolve(HERE, n));
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const tests = [...r.stdout.matchAll(/^(not ok|ok) \d+ - (.+?)(?: # (SKIP|TODO)\b.*)?$/gm)].map((m) => ({ name: m[2].trim(), result: m[3] === 'SKIP' ? 'SKIPPED' : m[1] === 'ok' ? 'PASS' : 'FAIL' })).filter((t) => t.name.startsWith('[P6-'));
  const count = (k) => Number((r.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm')) ?? [0, NaN])[1]);
  return { exit: r.status, tests, summary: { tests: count('tests'), pass: count('pass'), fail: count('fail'), skipped: count('skipped') }, files: files.map((f) => relative(LANE, f)) };
}

const run = runTests(), eq = replayValidationThroughEnvelope();
const byItem = (id) => run.tests.filter((t) => t.name.startsWith(`[${id} `));
const frozenLaneStatus = execFileSync(GIT, ['-C', REPO, 'status', '--porcelain', '--', relative(REPO, SK1_LANE)], { encoding: 'utf8' }).trim();
const record = {
  schema: 'SK1_1_ENGINEERING_ASSURANCE_V1', authority: 'R0', stage: 'STAGE3H-SK1.1 Phase 6', labels: [...LABELS], qualification: 'NOT_QUALIFIED',
  statement: 'Engineering hardening only. The frozen SK1 kernel, adapters, API, model, thresholds and results are unchanged. The assured envelope is a pure wrapper: it serves the frozen decision unchanged or refuses the request. Nothing here is evidence of decision competence and nothing supports a qualification claim.',
  recordedAt: new Date().toISOString(), node: process.version, repoHead: execFileSync(GIT, ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  envelope: { apiVersion: ASSURED_API_VERSION, contract: ENVELOPE_CONTRACT, file: 'r0/assured-api.mjs', wraps: 'stage3h-sk1-safety-kernel-v1/api/recommend.mjs (SK1_R0_API_V1)', containsEstimator: false, changesDecisions: false },
  sources: Object.fromEntries(readdirSync(HERE).filter((n) => n.endsWith('.mjs')).sort().map((n) => [`r0/${n}`, sha256(readFileSync(resolve(HERE, n)))])),
  pins: { freezeRecord: PINS.freezeRecord, freezeSha256: PINS.freezeSha256, kernelSourceHash: PINS.kernelSourceHash, adapterSourceHash: { ...PINS.adapterSourceHash }, model: { file: PINS.model.file, sha256: PINS.model.sha256, modelHash: PINS.model.modelHash, qualification: PINS.model.qualification, ranking: { ...PINS.model.ranking } }, inferenceFiles: { ...PINS.files } },
  frozenSk1Lane: { path: relative(REPO, SK1_LANE), uncommittedChanges: frozenLaneStatus === '' ? [] : frozenLaneStatus.split('\n'), unchanged: frozenLaneStatus === '',
    validationResultsSha256: sha256(readFileSync(resolve(SK1_LANE, 'evidence/SK1_VALIDATION_RESULTS.json'))), experimentFreezeSha256: sha256(readFileSync(resolve(SK1_LANE, PINS.freezeRecord))) },
  tests: { command: 'node --test r0/*.test.mjs', ...run.summary, exit: run.exit, files: run.files, cleanCheckout: 'In an export of the committed SK1 lane plus r0/, 40 tests pass and the 600-class replay is skipped with an explicit message (the class records are privileged local data).' },
  items: ITEMS.map((it) => { const ts = byItem(it.id); return { id: it.id, item: it.item, status: it.status, findings: it.findings ?? [], note: it.note, tests: ts.map((t) => t.name), testsPassed: ts.filter((t) => t.result === 'PASS').length, testsTotal: ts.length }; }),
  supportingTests: { pinning: byItem('P6-PIN').map((t) => ({ ...t })), negativeControls: byItem('P6-NC').map((t) => ({ ...t })), equivalence: byItem('P6-EQ').map((t) => ({ ...t })) },
  statusCounts: ITEMS.reduce((o, it) => { o[it.status] = (o[it.status] ?? 0) + 1; return o; }, {}),
  findings: FINDINGS.map((f) => ({ severity: 'ENGINEERING', patchedInFrozenKernel: false, ...f })),
  prospectiveIdentity: { name: CANDIDATE, implemented: false, qualificationClaim: 'NONE', covers: FINDINGS.filter((f) => f.fixWouldChangeSk1PolicyBehaviour).map((f) => f.id),
    statement: 'Correcting F3, F4 or F5 inside the kernel would change what the policy returns for the affected inputs, so it cannot be done under the SK1 identity. None of the three is triggered by any of the 600 validation requests (the envelope refuses none of them), so no SK1 result depends on them. A corrected kernel would be a new source and model identity and would need its own fresh, pre-registered evaluation before any claim.' },
  equivalence: eq.available ? { scope: 'all frozen SK1 VALIDATION classes, public requests replayed through the envelope; no outcome read, no metric computed', resultFileSha256: eq.resultSha256, classes: eq.classes, served: eq.served, refusedByEnvelope: eq.refusedByEnvelope, decisionHashEqual: eq.decisionHashEqual, kindEqual: eq.kindEqual, forcedSetEqual: eq.forcedSetEqual, envelopeVerified: eq.envelopeVerified, recommend: eq.recommend, abstain: eq.abstain, equivalent: eq.equivalent }
    : { scope: 'not run', available: false, reason: eq.reason },
  notDone: ['no change to any frozen SK1 file', 'no new or substituted risk estimator', 'no retraining, no threshold change', 'no new validation, no world generation, no evaluator label read', 'no authentication of evidence producers (provenance is declared, not proven)', 'no protection against a file changing between construction-time verification and module load', 'no connection to the Prime / Arbiter path, no dispatch, no deployment'],
};
const ok = run.exit === 0 && run.summary.fail === 0 && record.frozenSk1Lane.unchanged && record.items.every((i) => i.testsTotal > 0 && i.testsPassed === i.testsTotal) && (!eq.available || eq.equivalent);
record.phase6 = ok ? 'COMPLETE' : 'INCOMPLETE';
console.log(JSON.stringify({ phase6: record.phase6, tests: record.tests, statusCounts: record.statusCounts, items: record.items.map((i) => `${i.id} ${i.status} ${i.testsPassed}/${i.testsTotal}`), equivalence: record.equivalence, frozenLaneUnchanged: record.frozenSk1Lane.unchanged }, null, 1));
if (process.argv.includes('--write')) { if (!ok) { console.error('NOT WRITTEN: Phase 6 checks incomplete'); process.exit(1); } writeFileSync(OUT, JSON.stringify(record, null, 1) + '\n'); console.log('written ' + relative(REPO, OUT)); }
if (!ok) process.exitCode = 1;
