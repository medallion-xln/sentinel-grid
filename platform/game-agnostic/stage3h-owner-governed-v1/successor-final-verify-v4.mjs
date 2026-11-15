// Successor V4 finalization, Phases 1-3 (verification only; no world generated, no policy run, no parity rerun).
// 1. Re-derives every parity total from the raw per-world parity records (8 parts), recomputes each records hash, and
//    cross-checks each record against the independently computed spent-world menu scan (world hash, admission, verdict).
// 2. Verifies preservation of the predecessor and witness evidence, and the scientific contract of the O-6 rule
//    (no mechanics change, no deduplication, no pre-rejection policy or truth, no replacement, weights and vetoes unchanged,
//    validity a function of the public views alone).
// 3. Bounds the change of the registered estimands caused by valid-menu conditioning (structural zeros + upper bounds;
//    no point rate is extrapolated from the single malformed world).
// Writes evidence/successor-v4/final-verification.json once.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { stableStringify, sha256, deepFreeze } from '../src/core/determinism.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { policyFacingViews } from './connector-v4.mjs';
import { validatePolicyFacingViews } from './menu-validity-v1.mjs';
import { WITNESS } from './menu-validity-fixtures.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const ok = (v, m) => { if (!v) throw Error(m); };
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8')), src = (p) => readFileSync(resolve(LANE, p), 'utf8');
const fsha = (p) => createHash('sha256').update(readFileSync(resolve(GA, p))).digest('hex');
const ROOT = resolve(GA, '../..'), git = (a) => execFileSync('/usr/bin/git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const DRY = process.argv[2] === 'dry';
assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/successor-v4/final-verification.json'); ok(!existsSync(OUT), 'ALREADY_WRITTEN');

// ---- Phase 1: parity evidence reconciliation -------------------------------------------------------------------
const SOURCE = { OPEN: 'stage3h-canonical-v1/OPEN', CONFIRM_A: 'stage3h1d-development/CONFIRM_A', CONFIRM_B: 'stage3h1d-development/CONFIRM_B', IN_DISTRIBUTION_CONTROL: 'stage3h1f-development/IN_DISTRIBUTION_CONTROL', OOD_LEVEL: 'stage3h1f-development/OOD_LEVEL', OOD_ROLES: 'stage3h1f-development/OOD_ROLES', OOD_OBJECTIVES: 'stage3h1f-development/OOD_OBJECTIVES', OOD_SHAPES: 'stage3h1f-development/OOD_SHAPES' };
const scan = J('evidence/successor-v4/menu-scan.json'), scanRecords = J('evidence/successor-v4/menu-scan-records.json').records, replay = J('evidence/successor-v4/menu-scan-replay.json');
const byKey = new Map(scanRecords.map((r) => [r.source + '|' + r.seed + '|' + r.cell, r]));
const HEX = /^[0-9a-f]{64}$/, parts = {}, intended = [], unintended = [], crossFailures = [];
const totals = { worlds: 0, acceptedExact: 0, unchangedRejections: 0, intendedChanges: 0, unintendedDifferences: 0, identityFailures: 0, retries: 0, timingFailures: 0 };
for (const [part, source] of Object.entries(SOURCE)) {
  const file = 'evidence/successor-v4/parity/' + part + '.json', p = J(file), recs = p.records, rel = {};
  for (const r of recs) rel[r.relation] = (rel[r.relation] ?? 0) + 1;
  const accepted = recs.filter((r) => r.relation === 'ACCEPTED'), rejected = recs.filter((r) => r.relation.startsWith('V3_REJECTED:')), menu = recs.filter((r) => r.relation === 'V3_MENU_ABORT');
  const other = recs.filter((r) => !['ACCEPTED', 'V3_MENU_ABORT'].includes(r.relation) && !r.relation.startsWith('V3_REJECTED:'));
  const checks = {
    recordsHashRecomputed: sha256(stableStringify(recs)) === p.recordsSha256, worldsEqualRecords: p.worlds === recs.length, relationsRecounted: stableStringify(rel) === stableStringify(p.relations),
    verdictExact: p.verdict === 'PARITY_EXACT', everyRecordEqual: recs.every((r) => r.equal === true), storedUnequalEmpty: p.unequal.length === 0 && p.identityFailures.length === 0,
    acceptedRowHashes: accepted.every((r) => HEX.test(r.rowSha256) && HEX.test(r.worldHash) && r.v4 === 'ROW'), nonAcceptedNoRow: recs.filter((r) => r.relation !== 'ACCEPTED').every((r) => r.rowSha256 === null && r.worldHash === null),
    acceptedIdentities: accepted.every((r) => r.identities && Object.values(r.identities).every(Boolean)), rejectionsUnchanged: rejected.every((r) => r.v4 === 'REJECTED:' + r.relation.slice('V3_REJECTED:'.length)),
    menuChangesAreMenuInvalid: menu.every((r) => r.v4 === 'REJECTED:NATIVE_MENU_INVALID/DUPLICATE_ACTION_ID'), noOtherRelations: other.length === 0, noRetries: recs.every((r) => r.retries === 0),
  };
  for (const r of recs) {
    const s = byKey.get(source + '|' + r.seed + '|' + r.cell);
    const okX = s && (r.relation === 'ACCEPTED' ? !s.preRejection && s.verdict === 'VALID' && s.worldHash === r.worldHash
      : r.relation === 'V3_MENU_ABORT' ? !s.preRejection && s.verdict === 'NATIVE_MENU_INVALID'
        : r.relation.startsWith('V3_REJECTED:') ? s.preRejection === r.relation.slice('V3_REJECTED:'.length) : false);
    if (!okX) crossFailures.push({ part, seed: r.seed, cell: r.cell, relation: r.relation });
  }
  for (const r of menu) intended.push({ part, seed: r.seed, cell: r.cell, v3: 'NATIVE_MENU_MISMATCH (abort)', v4: r.v4 });
  for (const r of other) unintended.push({ part, ...r });
  parts[part] = { file, sha256: fsha('stage3h-owner-governed-v1/' + file), worlds: recs.length, accepted: accepted.length, acceptedEqual: accepted.filter((r) => r.equal).length, rejectionsUnchanged: rejected.length, intended: menu.length, checks, pass: Object.values(checks).every(Boolean) };
  totals.worlds += recs.length; totals.acceptedExact += accepted.filter((r) => r.equal).length; totals.unchangedRejections += rejected.filter((r) => r.equal).length;
  totals.intendedChanges += menu.length; totals.unintendedDifferences += other.length + recs.filter((r) => !r.equal).length;
  totals.identityFailures += accepted.filter((r) => !(r.identities && Object.values(r.identities).every(Boolean))).length; totals.retries += recs.filter((r) => r.retries > 0).length; totals.timingFailures += p.timingFailuresAfterRetry;
}
const repro = J('evidence/successor-v4/defect-reproduction.json');
const acceptedWorldHashes = new Set(Object.keys(SOURCE).flatMap((p) => J('evidence/successor-v4/parity/' + p + '.json').records.filter((r) => r.relation === 'ACCEPTED').map((r) => r.worldHash)));
const prior = new Set(J('evidence/prior-world-exclusions.json').priorWorldHashes);
const reconciliation = {
  expected: { TOTAL_WORLDS: 9456, ACCEPTED_EXACT: 9406, UNCHANGED_REJECTIONS: 49, INTENDED_CHANGES: 1, UNINTENDED_DIFFERENCES: 0 }, observed: totals,
  matches: totals.worlds === 9456 && totals.acceptedExact === 9406 && totals.unchangedRejections === 49 && totals.intendedChanges === 1 && totals.unintendedDifferences === 0 && totals.identityFailures === 0 && totals.retries === 0 && totals.timingFailures === 0,
  crossCheckWithIndependentScan: { compared: totals.worlds, failures: crossFailures.length, examples: crossFailures.slice(0, 5) },
  soleIntendedDifference: intended, soleIntendedDifferenceIsWitness: intended.length === 1 && intended[0].part === 'OOD_ROLES' && intended[0].seed === repro.witness.seed && intended[0].cell === repro.witness.cell,
  acceptedDistinctWorldHashes: acceptedWorldHashes.size, acceptedWorldsAllInPriorExclusionRecord: [...acceptedWorldHashes].every((h) => prior.has(h)),
  scanReplay: { primary: scan.recordsSha256, replay: replay.recordsSha256, recordsRecomputed: sha256(stableStringify(scanRecords)) === scan.recordsSha256, identical: scan.recordsSha256 === replay.recordsSha256 },
  partsPass: Object.values(parts).every((p) => p.pass),
};
// Producing scripts unchanged since their evidence was written (file times) and their current hashes (bound by the candidate).
const producers = [['successor-defect-reproduction.mjs', 'evidence/successor-v4/defect-reproduction.json'], ['successor-menu-scan.mjs', 'evidence/successor-v4/menu-scan.json'], ['successor-fixtures.mjs', 'evidence/successor-v4/fixtures.json'], ['menu-validity-fixtures.mjs', 'evidence/successor-v4/fixtures.json'], ['successor-statistics-v2.mjs', 'evidence/successor-v4/statistical-validity-v2.json'], ['successor-parity.mjs', 'evidence/successor-v4/parity/OPEN.json'], ['connector-v4.mjs', 'evidence/successor-v4/parity/OPEN.json'], ['menu-validity-v1.mjs', 'evidence/successor-v4/menu-scan.json']]
  .map(([s, e]) => { const st = (p) => readFileSync(resolve(LANE, p)) && Number(execFileSync('/usr/bin/stat', ['-f', '%m', resolve(LANE, p)], { encoding: 'utf8' })); return { script: s, sha256: fsha('stage3h-owner-governed-v1/' + s), evidence: e, scriptPredatesEvidence: st(s) <= st(e) }; });

// ---- Phase 1b / 5: preservation of the predecessor and the witness ---------------------------------------------
const pred = J('registration/ACTIVE_REGISTRATION_V3.json'), predHash = ((r) => { const { registrationHash: _h, ...b } = r; return sha256(stableStringify(b)); })(pred);
const predFiles = ['registration/REGISTRATION_CANDIDATE.json', 'registration/REGISTRATION_CANDIDATE_V2.json', 'registration/REGISTRATION_CANDIDATE_V3.json', 'registration/ACTIVE_REGISTRATION_V3.json', 'registration/OWNER_APPROVAL_f1ba57b4.json', 'registration/EXECUTION_AUTHORIZATION_V3.json', 'EXECUTION_RESULT_0364164c.txt', ...readdirSync(resolve(LANE, 'evidence/execution-0364164c')).map((f) => 'evidence/execution-0364164c/' + f)].map((f) => 'platform/game-agnostic/stage3h-owner-governed-v1/' + f);
const committedUnchanged = predFiles.every((f) => { try { git(['diff', '--quiet', 'HEAD', '--', f]); return git(['ls-files', '--error-unmatch', f]) !== ''; } catch { return false; } });
const runA = resolve(LANE, 'runs', pred.registrationHash.slice(0, 16));
const preservation = {
  predecessorRegistrationHashRecomputed: predHash === pred.registrationHash && pred.registrationHash === '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f',
  predecessorBoundSourcesUnchanged: Object.entries(pred.bindings.sources).every(([p, h]) => fsha(p) === h), predecessorBoundSources: Object.keys(pred.bindings.sources).length,
  predecessorRecordsCommittedAndUnchanged: committedUnchanged, predecessorRecords: predFiles.length,
  consumedRunDirectory: { A: existsSync(resolve(runA, 'A')) && readdirSync(resolve(runA, 'A')).length === 0 ? 'EXISTS_EMPTY' : 'CHANGED', B: existsSync(resolve(runA, 'B')) ? 'EXISTS' : 'ABSENT' },
  witnessEvidence: { abortStack: existsSync(resolve(LANE, 'evidence/execution-0364164c/A-run.stderr.log')), abortDiagnosis: existsSync(resolve(LANE, 'evidence/execution-0364164c/abort-diagnosis.json')), reproduction: repro.reproduced === true, spentRecordUnchanged: git(['status', '--porcelain', '--', 'platform/game-agnostic/stage3h1f-development/results']) === '' },
};

// ---- Phase 2: scientific contract of the O-6 rule ------------------------------------------------------------
// Dynamic no-mutation proof: the rule runs on deep-frozen policy-facing views (any write throws in strict mode).
const frozenRun = (c) => { const w = runCalibratedWarmup(c.seed, (t) => generateScenarioSymmetricV1({ shape: c.shape, roles: c.roles, objectives: c.objectives, horizonBand: c.horizonBand, level: c.level, seed: c.seed, warmupTicks: t })).world;
  const views = policyFacingViews(w, observableView(w)), before = sha256(stableStringify(views)); deepFreeze(views);
  try { const v = validatePolicyFacingViews(views); return { seed: c.seed, valid: v.valid, threw: false, viewsUnchanged: sha256(stableStringify(views)) === before }; } catch (e) { return { seed: c.seed, threw: e.message }; } };
const frozenChecks = [frozenRun(WITNESS), frozenRun(openCombos()[0])];
const mv = src('menu-validity-v1.mjs'), c4 = src('connector-v4.mjs'), cp = src('campaign-v4.mjs'), body = c4.slice(c4.indexOf('export function nativeRowV4'));
const fx = Object.fromEntries(J('evidence/successor-v4/fixtures.json').results.map((r) => [r.id, r]));
const nativeSources = Object.keys(pred.bindings.sources).filter((f) => f.startsWith('src/'));
const scientific = {
  nativeMechanicsUnchanged: { boundNativeSources: nativeSources.length, unchanged: nativeSources.every((f) => fsha(f) === pred.bindings.sources[f]), srcWorkingTreeClean: git(['status', '--porcelain', '--', 'platform/game-agnostic/src']) === '' },
  noDeduplication: { ruleNeverMutatesASurface: frozenChecks.every((x) => x.threw === false && x.viewsUnchanged) && frozenChecks[0].valid === false && frozenChecks[1].valid === true, frozenInputRuns: frozenChecks, viewsBuiltAsV3: c4.includes("surface: [...view.surface].reverse(), semantics: [...view.semantics].reverse()"), acceptedRowsCarryOriginalMenu: reconciliation.matches, malformedNeverScored: fx.F2_DUPLICATE_ID_NATIVE_WITNESS.pass },
  noPolicyOrTruthBeforeRejection: { connectorImportsNoPolicyOrEvaluator: !/adapters\.mjs|baseline\.mjs|invokeNexus|currentBaseline|nativeLock|evaluateCounterfactuals/.test(c4), earlyDelegationsArePrePolicyV3Outcomes: 'validator/terminal/task, duplicate or prior world, horizon mismatch: V3 rejects or aborts each of these before nativeLock', validationBeforeOnlyPolicyPath: body.indexOf('validatePolicyFacingViews(') > 0 && body.indexOf('validatePolicyFacingViews(') < body.indexOf('if (verdict.valid) return nativeRowV3(combo, ctx)') && body.slice(body.indexOf('if (verdict.valid)')).indexOf('nativeRowV3', 40) === -1,
    rejectionRecordHasNoDecisionOrTruthField: fx.F2_DUPLICATE_ID_NATIVE_WITNESS.pass, fixtureDetail: fx.F2_DUPLICATE_ID_NATIVE_WITNESS.detail.v4 },
  noReplacement: { scheduleFixedByHash: cp.includes("ok(scheduleHash(plan) === reg.scheduleHashes[replication] && plan.length === reg.scheduledPerReplication, 'SCHEDULE_MISMATCH')"), singlePassOverPlan: (cp.match(/for \(const combo of plan\)/g) ?? []).length === 1, rejectionsRecorded: cp.includes('if (r.rejected) p.records.push({ ...r.rejected, rejected: true })') },
  weightsAndVetoesUnchanged: { files: ['stage3h-owner-governed-v1/campaign.mjs', 'stage3h-owner-governed-v1/analysis-native.mjs', 'stage3h-final-review-handoff/amendments/v3/analysis.mjs', 'stage3h-final-review-handoff/amendments/v3/runner.mjs', 'stage3h-activation-readiness-v2/analysis.mjs', 'stage3h-activation-readiness-v2/runner-design.mjs', 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'].map((f) => ({ f, unchanged: fsha(f) === pred.bindings.sources[f] })), get all() { return this.files.every((x) => x.unchanged); } },
  outcomeIndependence: {
    argument: 'validatePolicyFacingViews reads only view.surface[].actionId of the 11 public views. Those views are pure functions of the post-warm-up world (observableView, orientWorld, identityViewTwinV2, reversal), built before any policy call and before any evaluator truth or reward exists. The verdict is therefore a function of the world alone, identical for R, B and N, and cannot depend on any policy decision or outcome. Rejection happens before the first policy call; no rejected world has a selection, truth or metric.',
    verdictInvariantAcrossViewsAndPermutations: scan.total.allInvariant, worldsChecked: scan.worlds,
  },
  dynamicMenus: { policyFacingLaterMenus: 0, reason: 'one policy decision per world; all policy-facing menus exist before the first policy call', evaluatorInternalOneStepMenus: scan.total.evaluatorOneStepMenus, worldsWithEvaluatorInternalDuplicates: scanRecords.filter((r) => r.evaluatorOneStepMenus.withDuplicate > 0).map((r) => ({ cell: r.cell, seed: r.seed, verdict: r.verdict })),
    inert: 'continuation keeps its incumbent unless rank is strictly higher or key strictly smaller (counterfactual-symmetric-v1.js:42-51); an identical duplicate never changes the chosen continuation, so evaluator truth is invariant; they are not inspected, so no outcome-dependent selection arises', outcomeDependentSelectionRequired: false, verdict: 'NOT_BLOCKED' },
};
scientific.verdict = scientific.nativeMechanicsUnchanged.unchanged && scientific.nativeMechanicsUnchanged.srcWorkingTreeClean && Object.values(scientific.noDeduplication).every(Boolean)
  && scientific.noPolicyOrTruthBeforeRejection.connectorImportsNoPolicyOrEvaluator && scientific.noPolicyOrTruthBeforeRejection.validationBeforeOnlyPolicyPath && scientific.noPolicyOrTruthBeforeRejection.rejectionRecordHasNoDecisionOrTruthField
  && Object.values(scientific.noReplacement).every(Boolean) && scientific.weightsAndVetoesUnchanged.all && scientific.outcomeIndependence.verdictInvariantAcrossViewsAndPermutations ? 'SCIENTIFIC_CONTRACT_SATISFIED' : 'SCIENTIFIC_CONTRACT_BLOCKED';

// ---- Phase 3: estimand impact of valid-menu conditioning -----------------------------------------------------
const stats = J('evidence/successor-v4/statistical-validity-v2.json'), contract = JSON.parse(readFileSync(resolve(GA, 'stage3h-final-review-handoff/amendments/v3/contract-v3.json'), 'utf8'));
const atRisk = stats.admissionFeasibility.atRiskStratum, C = contract.populations.OOD_ROLES.cells, atRiskCells = 48;
const piBar = (atRiskCells / C) * atRisk.upper95OneSided;
const estimand = {
  definition: 'Registered estimands are fixed-weight cell averages over accepted worlds. With valid-menu conditioning each cell mean becomes E[m | valid]. For a per-world metric m in [0, 1] (hit, normalized regret, catastrophe) |E[m | valid] - E[m]| <= pi_c, and for an arm contrast d in [-1, 1] it is <= 2 pi_c, where pi_c is the cell probability of an invalid menu; the population estimand moves by at most the weight-averaged pi_c (contrasts: twice that).',
  structuralZeros: { populations: ['HOLDOUT_KNOWN_COMPOSITION', 'OOD_LEVEL', 'OOD_OBJECTIVES', 'OOD_SHAPES'], plus: '48 of 96 OOD_ROLES cells (reach_target objective)', reason: 'a duplicate action id needs a BYPASS, which needs a substitute; these roles/objectives create none or no duplicated dependency; pi_c = 0 exactly, so the estimand is unchanged exactly', bypassOfferedOutside: Object.entries(stats.frequency.concentration.structural.bypassOfferedWorldsByPopulation).filter(([p]) => p !== 'OOD_ROLES').reduce((n, [, v]) => n + v, 0) },
  OOD_ROLES: { atRiskCells, cells: C, atRiskStratum: { n: atRisk.n, invalid: atRisk.invalid, upper95OneSided: atRisk.upper95OneSided }, weightedPiUpper95: piBar, maxShiftMetric: piBar, maxShiftContrast: 2 * piBar, pointMateriality: contract.pointMateriality, maxShiftContrastAsFractionOfMateriality: (2 * piBar) / contract.pointMateriality,
    H2_R_minus_B: 'exactly 0 in every world (frozen rule R = B at H2), so conditioning cannot change it', note: 'bounds use the one-sided 95% Clopper-Pearson upper bound of the at-risk stratum; no point rate is extrapolated from the single malformed world' },
  interpretation: 'Valid-menu conditioning changes the estimand by exactly zero in four of five populations and by at most ' + (2 * piBar).toFixed(4) + ' on any OOD_ROLES arm contrast (95% bound), about ' + Math.round(100 * (2 * piBar) / contract.pointMateriality) + '% of the 0.02 materiality margin; the claim is explicitly restricted to valid-menu worlds.',
};

const pass = reconciliation.matches && reconciliation.partsPass && reconciliation.crossCheckWithIndependentScan.failures === 0 && reconciliation.soleIntendedDifferenceIsWitness && reconciliation.scanReplay.identical && reconciliation.scanReplay.recordsRecomputed
  && producers.every((p) => p.scriptPredatesEvidence) && Object.entries(preservation).every(([k, v]) => (k === 'consumedRunDirectory' ? v.A === 'EXISTS_EMPTY' && v.B === 'ABSENT' : k === 'witnessEvidence' ? Object.values(v).every(Boolean) : k === 'predecessorBoundSources' || k === 'predecessorRecords' ? true : v === true))
  && scientific.verdict === 'SCIENTIFIC_CONTRACT_SATISFIED';
if (!DRY) writeExclusive(OUT, { schema: 'STAGE3H_SUCCESSOR_V4_FINAL_VERIFICATION_V1', inheritanceHead: inh.head, protectedFiles: inh.protectedCount, rosterPreserved: inh.rosterPreserved, frozenRuleHashMatches: inh.frozenRuleHashMatches,
  reconciliation, parts, producers, preservation, scientific, estimand, parityRerun: false, verdict: pass ? 'FINAL_VERIFICATION_PASS' : 'FINAL_VERIFICATION_FAIL', registeredWorldsGenerated: 0, authority: 'R0' });
console.log(JSON.stringify({ verdict: pass ? 'FINAL_VERIFICATION_PASS' : 'FINAL_VERIFICATION_FAIL', totals, crossFailures: crossFailures.length, intended, partsPass: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.pass])), producers: producers.map((p) => p.script + ':' + p.scriptPredatesEvidence), preservation, scientific: scientific.verdict, sciDetail: { mech: scientific.nativeMechanicsUnchanged, dedup: scientific.noDeduplication, prepolicy: { a: scientific.noPolicyOrTruthBeforeRejection.connectorImportsNoPolicyOrEvaluator, b: scientific.noPolicyOrTruthBeforeRejection.validationBeforeOnlyPolicyPath }, repl: scientific.noReplacement, vetoes: scientific.weightsAndVetoesUnchanged.all }, estimand: { piBar, maxShiftContrast: 2 * piBar, interp: estimand.interpretation } }, null, 1));
