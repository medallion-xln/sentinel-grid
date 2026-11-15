// Successor preparation, Phase 1 (development-only; consumes and regenerates NO registered world). Reproduces the native
// duplicate-action defect on the one permitted already-spent witness (3H.1-F OOD_ROLES, seed 202610203007, cell
// star/industrial/restore_and_protect/H2/1) and traces it through generation, kernel menu, symmetric surface, public view,
// packet and every nuisance twin view. No policy is invoked (nativeLock refuses before S0/Nexus), no truth is computed;
// the historical 3H.1-F row for this world is read as already-published spent evidence. It does NOT identify, and must not
// be read as identifying, the sealed world on which registration 0364164c replication A aborted.
// Writes evidence/successor-v4/defect-reproduction.json (wx).
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorld, hashWorld, legalActions, forgeActionKey, step } from '../src/forge/kernel.js';
import { FORGE_ROLE_COMPOSITIONS } from '../src/forge/scenarios-v2.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { symmetricLegalActions } from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import { ORIENTATIONS, orientWorld, canonicalOrientation } from '../src/forge-symmetric/orientation-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { decisionPacket } from '../stage3h-canonical-v1/adapters.mjs';
import { nativeLock } from './connector.mjs';
import { identityViewTwinV2 } from './identity-view-v2.mjs';
import { writeExclusive, assertSoleWriter } from '../stage3h-ascii-competence-v1/guard.mjs';
import { verifyOwnerLane, LANE, GA } from './inherit.mjs';

const J = (p) => JSON.parse(readFileSync(resolve(GA, p), 'utf8'));
const counts = (ids) => { const c = {}; for (const id of ids) c[id] = (c[id] ?? 0) + 1; return { size: ids.length, distinct: Object.keys(c).length, duplicated: Object.entries(c).filter(([, n]) => n > 1).map(([id, n]) => ({ id, n })) }; };
const relKey = (r) => r.type + ' ' + r.from + ' ' + r.to;
const relDup = (rs) => counts(rs.map(relKey)).duplicated;

assertSoleWriter(); const inh = verifyOwnerLane();
const OUT = resolve(LANE, 'evidence/successor-v4/defect-reproduction.json');
if (!existsSync(resolve(LANE, 'evidence/successor-v4'))) mkdirSync(resolve(LANE, 'evidence/successor-v4'));
const axes = { shape: 'star', roles: 'industrial', objectives: 'restore_and_protect', horizonBand: 'H2', level: 1 }, seed = 202610203007;
const spent = J('stage3h1f-development/results/OOD_ROLES/rows.json'), spentRows = Array.isArray(spent) ? spent : spent.rows;
const hist = spentRows.find((x) => x.combo.seed === seed && Object.entries(axes).every(([k, v]) => x.combo[k] === v));
if (!hist) throw Error('WITNESS_NOT_IN_SPENT_RECORD');

// 1. Generation: scenario config -> initial world -> warm-up (WAIT-only ticks).
const warm = runCalibratedWarmup(seed, (warmupTicks) => generateScenarioSymmetricV1({ ...axes, seed, warmupTicks })), cfg = warm.scenarioConfig;
const initial = createWorld(seed, cfg), world = warm.world, validation = validateScenarioV2(initial, cfg);
const primary = cfg.objectives?.find?.((o) => o.id === 'objective-primary') ?? world.objectives.find((o) => o.id === 'objective-primary');
const failedStructural = world.entities.filter((e) => /^n\d+$/.test(e.id) && !e.available).map((e) => e.id);
const dependsOn = cfg.relations.filter((r) => r.type === 'dependsOn');
const generation = {
  generatorChain: 'generateScenarioSymmetricV1 -> generateScenarioV3 -> generateScenarioV2 (src/forge/scenarios-v2.js)',
  topologyShape: cfg.topologyShape, topologyNodeCount: cfg.topologyNodeCount, topologyEdgeCount: cfg.topologyEdgeCount,
  dependsOnInConfig: dependsOn.length, nonTopologyDependsOn: dependsOn.length - cfg.topologyEdgeCount,
  primaryObjectiveEntity: primary?.entityId ?? null, failedStructuralNodes: failedStructural,
  substitutesFor: cfg.relations.filter((r) => r.type === 'substitutes').map(relKey),
  duplicatedRelations: { config: relDup(cfg.relations), initialWorld: relDup(initial.relations), afterWarmup: relDup(world.relations) },
  validatorValid: validation.valid, warmupTicks: warm.warmupTicks, taskPreserved: warm.taskPreserved,
  sourceSites: {
    topologyDedup: 'src/forge/topology.js generateTopology add(): skips an edge already present; star = add(dependsOn, n0, n_i) for every leaf',
    restorePush: "src/forge/scenarios-v2.js:218-222: if goals include 'restore', failed = random structural node; relations.push({type:'dependsOn', from: primaryNode.id, to: failed.id}) with NO existence check",
    bypassEnumeration: 'src/forge/kernel.js:277-288 legalActions: one BYPASS per dependsOn relation whose target is failed, in range (1) and has a live substitute, energy >= 3; no uniqueness check',
    warmup: 'src/forge/warmup.js runTemporalWarmup steps WAIT only, so warm-up neither creates nor removes the duplicate',
  },
};

// 2. Menus: kernel -> symmetric surface -> public view -> decision packet -> frozen nativeLock assertion (pre-policy).
const kernel = legalActions(world), sym = symmetricLegalActions(world, canonicalOrientation(world).orientation), view = observableView(world);
const packet = decisionPacket(view.observation, view.surface, { evaluationSteps: 4 });
let lockError = null; try { nativeLock(view, 'H2'); } catch (e) { lockError = e.message; }
const bypass = kernel.filter((a) => a.actionType === 'BYPASS');
const dupKernel = bypass.filter((a, i) => bypass.findIndex((b) => forgeActionKey(b) === forgeActionKey(a)) !== i);
const menus = {
  kernelLegalActions: counts(kernel.map(forgeActionKey)), symmetricSurface: counts(sym.map(forgeActionKey)),
  publicViewSurface: counts(view.surface.map((e) => e.actionId)), decisionPacket: counts(packet.legalActions.map((a) => a.actionId)),
  duplicatedDescriptor: dupKernel.map((a) => a), duplicatedDescriptorsDeepEqual: dupKernel.length === 1 && JSON.stringify(bypass.filter((a) => forgeActionKey(a) === forgeActionKey(dupKernel[0]))[0]) === JSON.stringify(dupKernel[0]),
  predecessorNativeLockError: lockError, policyInvoked: false,
};

// 3. Semantics: both copies are the same kernel transition (relation rewrite removes EVERY copy of n0->n5).
const copies = kernel.filter((a) => forgeActionKey(a) === forgeActionKey(dupKernel[0]));
const children = copies.map((a) => step(structuredClone(world), a).state);
const semantics = {
  copies: copies.length, childWorldHashes: children.map(hashWorld), identicalTransition: new Set(children.map(hashWorld)).size === 1,
  childDuplicatedRelations: relDup(children[0].relations), childDependsOnN0ToN5: children[0].relations.filter((r) => relKey(r) === 'dependsOn n0 n5').length,
  kernelRule: 'src/forge/kernel.js:440-459 BYPASS: filters out ALL dependsOn dependent->target relations, pushes one dependent->substitute',
};

// 4. Nuisance twin views (everything a policy would be shown for this world).
const twins = {};
for (const t of ORIENTATIONS) twins['D4:' + t] = counts(observableView(orientWorld(t, world)).surface.map((e) => e.actionId));
twins.IDENTITY = counts(identityViewTwinV2(view).view.surface.map((e) => e.actionId));
twins.ORDER = counts([...view.surface].reverse().map((e) => e.actionId));
const twinSummary = Object.fromEntries(Object.entries(twins).map(([k, v]) => [k, v.size + '/' + v.distinct]));

// 5. Historical admission (published 3H.1-F row; no recomputation of truth).
const d = (x) => x.scores.HORIZON_ROUTED.normalizedRegret - x.scores.S0.normalizedRegret, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const others = spentRows.filter((x) => x.recordId !== hist.recordId), sign = (rs) => ({ better: rs.filter((x) => d(x) < 0).length, worse: rs.filter((x) => d(x) > 0).length, ties: rs.filter((x) => d(x) === 0).length });
const cat = (rs) => ({ S0: rs.filter((x) => x.scores.S0.catastrophic > 0).length, routed: rs.filter((x) => x.scores.HORIZON_ROUTED.catastrophic > 0).length });
const historical = {
  record: { stage: '3H.1-F', population: 'OOD_ROLES', recordId: hist.recordId, worldHash: hist.worldHash, worldHashReproduced: hashWorld(world) === hist.worldHash, menuSize: hist.menuSize },
  admittedAndScored: true, uniquenessCheckInConfirmCore: false,
  biasedFields: { optimalActionKeys: hist.truth.optimalActionKeys, tieCount: hist.truth.tieCount, tieCountDistinct: new Set(hist.truth.optimalActionKeys).size, uniformRandomHitRecorded: hist.scores.UNIFORM_RANDOM.hit, uniformRandomHitOverDistinct: hist.truth.optimalActionKeys.length ? new Set(hist.truth.optimalActionKeys).size / menus.publicViewSurface.distinct : null },
  deterministicArmsAffectedByDuplicateInScoring: false,
  why: 'scoreSet takes max/min utility and the first truth entry per selected id; a duplicated identical branch changes neither, so R/B/N regret, hit and catastrophe are unchanged by the duplicate entry. Whether S0/Nexus would have SELECTED differently on a 9-entry menu is not testable without deduplicating native actions (prohibited) and is not tested.',
  oodRolesPrimaryContrast: { published: { n: spentRows.length, deltaNormalizedRegret: mean(spentRows.map(d)), sign: sign(spentRows), catastrophes: cat(spentRows) },
    witnessRowContrast: d(hist), withoutWitness: { n: others.length, deltaNormalizedRegret: mean(others.map(d)), sign: sign(others), catastrophes: cat(others) },
    note: 'At H2 the frozen rule selects S0, so the witness row contributes exactly 0 to routed-minus-S0; excluding it changes the mean by 1.1e-4, removes one tie, and changes no catastrophe count. STRUCTURAL_OOD_CONFIRMED is unaffected.' },
};

const roleTable = FORGE_ROLE_COMPOSITIONS.map((r) => ({ id: r.id, substitutes: r.substitutes }));
const contract = J('stage3h-final-review-handoff/amendments/v3/contract-v3.json');
const bypassCapable = Object.fromEntries(Object.entries(contract.populations).map(([k, p]) => [k, p.axes.roles.filter((ro) => roleTable.find((r) => r.id === ro).substitutes > 0)]));
const out = {
  schema: 'STAGE3H_SUCCESSOR_DEFECT_REPRODUCTION_V1', predecessorRegistration: '0364164cb05e140da6265c89d830388b84dafed7ef5f3abf47ad6afb2833b01f', inheritanceHead: inh.head,
  witness: { source: 'stage3h1f-development/results/OOD_ROLES (spent; in the 9,407-world prior exclusion record)', seed, cell: Object.values(axes).join('/'), registeredWorld: false },
  sealedAWorldIdentified: false, sealedAWorldInferred: false,
  reproduced: menus.publicViewSurface.distinct < menus.publicViewSurface.size && lockError === 'NATIVE_MENU_MISMATCH',
  generation, menus, semantics, twinViews: twinSummary, historical, roleTable, bypassCapableRolesByRegisteredPopulation: bypassCapable,
  answers: {
    Q1_cause: 'Generator defect, not kernel or policy: for a restore objective scenarios-v2 appends dependsOn(primary -> failed) without checking that the topology already contains that edge. In this star world primary = hub n0 and failed = leaf n5, and the star topology already has n0 -> n5, so the relation exists twice. The kernel enumerates BYPASS once per dependsOn relation (n5 failed, in range 1, two live substitutes, energy 40), producing two identical BYPASS(n5, dependent n0) descriptors. Warm-up (WAIT-only), the symmetric surface, the public view and the decision packet each carry the list 1:1, so the menu has 10 entries and 9 distinct ids; the predecessor nativeLock assertion reproduces NATIVE_MENU_MISMATCH before any policy call.',
    Q2_semantics: 'The two entries are one action listed twice: identical type, actor, target and parameters, identical id, and executing either yields the identical child world (both relation copies are removed and one dependent -> substitute edge is added). They are not two distinct actions that happen to share an id.',
    Q3_identity: "Action identity is forgeActionKey = sha256(stableStringify([actionType, actorId, target, parameters])) (key-order invariant); the public surface actionId is canonicalActionKey('R0', action) = the same key. The descriptor label actionId ('forge/bypass') is not identity. Two entries are the same action iff their ids are equal; legitimately distinct actions always differ in type, actor, target or parameters (e.g. REINFORCE vs REPAIR of one target, BYPASS with different dependents). Twin handles: D4 = key of the oriented action; IDENTITY = opaque handle, bijective on distinct originals (both copies of a duplicate receive the same opaque handle); ORDER = original handles.",
    Q4_emptyMenus: 'Not observed (0/9,456) and not producible for an admitted world: the kernel always appends WAIT when a controlled actor exists and the world is non-terminal, and terminal-after-warm-up worlds are rejected earlier. The rule still covers EMPTY_MENU defensively.',
    Q5_laterStepMenus: 'No later policy-facing menu exists: every Forge world in this protocol is exactly one decision; all policy-facing menus (original + 8 D4 + IDENTITY + ORDER) are built from the post-warm-up world before any policy call. Evaluator-internal continuation menus (H2 greedy steps) are not policy-facing; a duplicate there is decision-inert because the continuation replaces its incumbent only on a strictly higher rank or strictly smaller key (src/forge-symmetric/counterfactual-symmetric-v1.js:42-51), and an empty continuation menu simply ends the continuation. The rule therefore validates policy-facing menus only and never inspects evaluator internals (which would not be outcome-blind).',
    Q6_silentAdmission: 'Yes. 3H.1-D/F confirm-core has no menu-uniqueness check (its only uniqueness guard is DUPLICATE_WORLD_HASH). This world was admitted and scored in 3H.1-F OOD_ROLES; its recorded truth lists the duplicated optimal id twice (tieCount 2, true 1) and the UNIFORM_RANDOM expectation counted 10 entries (hit 0.2, distinct-menu value 1/9). 3H.1-D (1,152 worlds), the 3H.1-F control and other OOD strata, and the 288 development worlds contain no malformed menu. The predecessor connector was the first component to check and it aborted rather than admitting.',
    Q7_historicalImpact: 'None on any conclusion. One of 9,456 spent worlds; its routed-minus-S0 contrast is exactly 0 (H2: rule = S0); excluding it moves OOD_ROLES delta-nreg from -0.20950 to -0.20962, sign 641/27/1156 -> 641/27/1155, catastrophes 3/3 unchanged. Diagnostic fields of that one row (tie count, uniform-random expectation) were biased. Registration 0364164c produced no results, so nothing there is affected.',
  },
  authority: 'R0',
};
writeExclusive(OUT, out);
console.log(JSON.stringify({ reproduced: out.reproduced, menus: { kernel: menus.kernelLegalActions.size + '/' + menus.kernelLegalActions.distinct, view: menus.publicViewSurface.size + '/' + menus.publicViewSurface.distinct, packet: menus.decisionPacket.size + '/' + menus.decisionPacket.distinct, lockError }, generation: { dup: generation.duplicatedRelations, nonTopologyDependsOn: generation.nonTopologyDependsOn, primary: generation.primaryObjectiveEntity, failed: failedStructural }, semantics: { identical: semantics.identicalTransition, childDup: semantics.childDuplicatedRelations }, twins: twinSummary, historical: historical.oodRolesPrimaryContrast, bypassCapable }, null, 1));
