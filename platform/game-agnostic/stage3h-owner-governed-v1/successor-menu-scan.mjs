// Successor preparation, Phase 3 (development-only; consumes and regenerates NO registered world). Applies
// STAGE3H_NATIVE_MENU_VALIDITY_V1 retrospectively to all 9,456 already-spent worlds (3H.1-D/F executed and rejected
// combos plus the 288 OPEN development worlds) and writes one record per world. Per world: V3 pre-policy admission
// (validator / terminal / task), every policy-facing view (original, 8 D4, IDENTITY, ORDER) and three fixed permutations
// of the original surface, the latent relation structure behind the defect, and the one-step successor menus that the
// evaluator (not any policy) would enumerate. Generation, public views and kernel transitions only: no policy, no
// truth, no reward. Usage: node successor-menu-scan.mjs primary | replay | dry
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorld, hashWorld, isTerminal, forgeActionKey } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { symmetricLegalActions, symmetricStep } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { canonicalOrientation } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { combinations as openCombos } from '../stage3h-canonical-v1/plan.mjs';
import { stableStringify, sha256, createSeededRandom, deriveSeed } from '../src/core/determinism.js';
import { policyFacingViews } from './connector-v4.mjs';
import { validatePolicyFacingViews, surfaceVerdict, menuVerdict } from './menu-validity-v1.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const mode = process.argv[2];
if (!['primary', 'replay', 'dry'].includes(mode)) throw Error('USAGE: successor-menu-scan.mjs primary|replay|dry');
const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json');
const TRACK_A = { CONFIRM_A: 'HOLDOUT_KNOWN_COMPOSITION', CONFIRM_B: 'HOLDOUT_KNOWN_COMPOSITION', IN_DISTRIBUTION_CONTROL: 'HOLDOUT_KNOWN_COMPOSITION', OPEN: 'HOLDOUT_KNOWN_COMPOSITION', OOD_LEVEL: 'OOD_LEVEL', OOD_ROLES: 'OOD_ROLES', OOD_OBJECTIVES: 'OOD_OBJECTIVES', OOD_SHAPES: 'OOD_SHAPES' };
const cellsOf = (pop) => { const a = contract.populations[pop].axes, s = new Set(); for (const sh of a.shapes) for (const ro of a.roles) for (const ob of a.objectives) for (const hb of a.horizonBands) for (const lv of a.levels) s.add([sh, ro, ob, hb, lv].join('/')); return s; };
const trackCells = Object.fromEntries(Object.keys(contract.populations).map((p) => [p, cellsOf(p)]));
const prior = new Set(J('stage3h-owner-governed-v1/evidence/prior-world-exclusions.json').priorWorldHashes);

const combos = [];
for (const d of ['stage3h1d-development', 'stage3h1f-development']) for (const pop of readdirSync(resolve(GA, d, 'results')).sort()) {
  const p = resolve(GA, d, 'results', pop); if (!statSync(p).isDirectory()) continue;
  const r = JSON.parse(readFileSync(resolve(p, 'rows.json'), 'utf8')), s = JSON.parse(readFileSync(resolve(p, 'summary.json'), 'utf8'));
  for (const x of [...(Array.isArray(r) ? r : r.rows).map((y) => y.combo), ...s.rejections.map((y) => y.combo)]) combos.push({ source: d + '/' + pop, spentPopulation: pop, ...x });
}
for (const c of openCombos()) combos.push({ source: 'stage3h-canonical-v1/OPEN', spentPopulation: 'OPEN', ...c });
const todo = mode === 'dry' ? combos.filter((_, i) => i % 47 === 0) : combos;

const bandOf = (steps) => (steps === 1 ? 'H0' : steps === 4 ? 'H2' : null);
const dupIds = (ids) => { const c = {}; for (const id of ids) c[id] = (c[id] ?? 0) + 1; return Object.keys(c).filter((k) => c[k] > 1).sort(); };
const relKey = (r) => r.type + ' ' + r.from + ' ' + r.to;
function permute(list, seed) { const rnd = createSeededRandom(seed), a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const records = [], t0 = Date.now();
for (const c of todo) {
  const { source, spentPopulation, panel, ...axes } = c, cell = [axes.shape, axes.roles, axes.objectives, axes.horizonBand, axes.level].join('/');
  const trackA = TRACK_A[spentPopulation];
  const warm = runCalibratedWarmup(axes.seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, warmupTicks })), cfg = warm.scenarioConfig;
  const initial = createWorld(axes.seed, cfg), validation = validateScenarioV2(initial, cfg), world = warm.world, worldHash = hashWorld(world);
  const preRejection = !validation.valid ? 'VALIDATOR_INVALID' : isTerminal(world) ? 'TERMINAL_AFTER_WARMUP' : !warm.taskPreserved ? 'TASK_NOT_PRESERVED' : null;
  const view = observableView(world), ids = view.surface.map((e) => e.actionId);
  const views = policyFacingViews(world, view), verdict = validatePolicyFacingViews(views);
  const per = views.map(({ label, view: v }) => ({ label, ...surfaceVerdict(v) })), orig = per[0];
  const same = (v) => v.valid === orig.valid && v.cause === orig.cause && v.size === orig.size && v.distinct === orig.distinct;
  const perms = [1, 2, 3].map((k) => menuVerdict(permute(ids, deriveSeed(axes.seed, 'stage3h-o6-permutation', String(k)))));
  const depends = world.relations.filter((r) => r.type === 'dependsOn'), relCount = {};
  for (const r of depends) relCount[relKey(r)] = (relCount[relKey(r)] ?? 0) + 1;
  const dupRelations = Object.keys(relCount).filter((k) => relCount[k] > 1).sort();
  const bypass = view.surface.filter((e) => e.actionType === 'BYPASS');
  const frame = canonicalOrientation(world).orientation;
  let childChecked = 0, childDup = 0, childEmpty = 0;
  if (!isTerminal(world)) for (const e of view.surface) {
    const child = symmetricStep(structuredClone(world), e.action).state;
    if (isTerminal(child)) continue;
    const keys = symmetricLegalActions(child, frame).map(forgeActionKey); childChecked++;
    if (keys.length === 0) childEmpty++; else if (new Set(keys).size !== keys.length) childDup++;
  }
  if (hashWorld(world) !== worldHash) throw Error('SCAN_MUTATED_WORLD');
  records.push({
    source, spentPopulation, trackAPopulation: trackA, cellInTrackAPopulation: trackCells[trackA].has(cell), cell, band: axes.horizonBand, seed: axes.seed, worldHash,
    inPriorExclusionRecord: prior.has(worldHash), preRejection, bandMatchesPacket: bandOf(cfg.horizon + 1) === axes.horizonBand,
    menuSize: orig.size, distinctIds: orig.distinct, duplicatedIds: dupIds(ids), verdict: verdict.valid ? 'VALID' : verdict.reason, cause: verdict.valid ? null : verdict.cause,
    firstInvalidView: verdict.valid ? null : verdict.firstInvalidView, invalidViews: verdict.invalidViews, views: verdict.views,
    invariance: { d4: per.filter((v) => v.label.startsWith('D4:')).every(same), identity: same(per.find((v) => v.label === 'IDENTITY')), order: same(per.find((v) => v.label === 'ORDER')), permutations: perms.every(same) },
    latent: { dependsOnDuplicated: dupRelations, selfDependency: depends.filter((r) => r.from === r.to).length, bypassOffered: bypass.length, bypassTargetsOnDuplicatedRelation: bypass.filter((e) => dupRelations.includes('dependsOn ' + e.action.parameters.dependent + ' ' + e.targetEntityId)).length },
    evaluatorOneStepMenus: { checked: childChecked, withDuplicate: childDup, empty: childEmpty },
  });
}
const wallMs = Date.now() - t0, recordsSha256 = sha256(stableStringify(records));
const tally = (rs) => {
  const reached = rs.filter((r) => !r.preRejection);
  return { scanned: rs.length, preRejected: rs.length - reached.length, preRejectionReasons: Object.fromEntries([...new Set(rs.map((r) => r.preRejection).filter(Boolean))].sort().map((k) => [k, rs.filter((r) => r.preRejection === k).length])),
    reachedMenuRule: reached.length, invalid: reached.filter((r) => r.verdict !== 'VALID').length, invalidAmongPreRejected: rs.filter((r) => r.preRejection && r.verdict !== 'VALID').length,
    emptyMenu: rs.filter((r) => r.cause === 'EMPTY_MENU').length, duplicateActionId: rs.filter((r) => r.cause === 'DUPLICATE_ACTION_ID').length,
    allInvariant: rs.every((r) => r.invariance.d4 && r.invariance.identity && r.invariance.order && r.invariance.permutations), cellsOutsideTrackA: rs.filter((r) => !r.cellInTrackAPopulation).length,
    latentDuplicatedDependsOnWorlds: rs.filter((r) => r.latent.dependsOnDuplicated.length).length, selfDependencyWorlds: rs.filter((r) => r.latent.selfDependency).length, bypassOfferedWorlds: rs.filter((r) => r.latent.bypassOffered).length,
    evaluatorOneStepMenus: { checked: rs.reduce((s, r) => s + r.evaluatorOneStepMenus.checked, 0), withDuplicate: rs.reduce((s, r) => s + r.evaluatorOneStepMenus.withDuplicate, 0), empty: rs.reduce((s, r) => s + r.evaluatorOneStepMenus.empty, 0) } };
};
const group = (key) => Object.fromEntries([...new Set(records.map((r) => r[key]))].sort().map((k) => [k, tally(records.filter((r) => r[key] === k))]));
const summary = {
  schema: 'STAGE3H_SUCCESSOR_SPENT_WORLD_MENU_SCAN_V1', rule: 'STAGE3H_NATIVE_MENU_VALIDITY_V1', mode, worlds: records.length, recordsSha256, wallMs,
  total: tally(records), bySource: group('source'), byTrackAPopulation: group('trackAPopulation'),
  invalidWorlds: records.filter((r) => r.verdict !== 'VALID'), registeredWorldsGenerated: 0, policiesInvoked: 0, truthComputed: false, authority: 'R0',
};
if (mode === 'dry') { console.log(JSON.stringify({ dry: true, worlds: records.length, wallMs, total: summary.total, invalid: summary.invalidWorlds.map((r) => r.cell + ' ' + r.seed) }, null, 1)); process.exit(0); }
assertSoleWriter(); const inh = verifyOwnerLane();
if (mode === 'primary') {
  if (records.length !== 9456) throw Error('SCAN_INCOMPLETE:' + records.length);
  writeExclusive(resolve(LANE, 'evidence/successor-v4/menu-scan-records.json'), { schema: 'STAGE3H_SUCCESSOR_SPENT_WORLD_MENU_RECORDS_V1', recordsSha256, records });
  writeExclusive(resolve(LANE, 'evidence/successor-v4/menu-scan.json'), { ...summary, inheritanceHead: inh.head });
} else {
  writeExclusive(resolve(LANE, 'evidence/successor-v4/menu-scan-replay.json'), { schema: 'STAGE3H_SUCCESSOR_SPENT_WORLD_MENU_SCAN_REPLAY_V1', worlds: records.length, recordsSha256, wallMs, inheritanceHead: inh.head, authority: 'R0' });
}
console.log(JSON.stringify({ mode, worlds: records.length, recordsSha256, wallMs, total: summary.total, invalid: summary.invalidWorlds.map((r) => r.source + ' ' + r.cell + ' ' + r.seed + ' ' + r.cause) }, null, 1));
