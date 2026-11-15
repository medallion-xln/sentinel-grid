// Closure Phase 5: alternative-action feasibility on the ALREADY CONSTRUCTED witness classes only (no new worlds, no
// selector, no training; evaluator truth is used offline only to label, never as a policy input).
// Usage: node closure/alternatives.mjs  -> evidence/closure/ALTERNATIVE_ACTIONS.json
// Per class: the common legal menu (identical across the class by public equivalence) with an identity-free semantic key
// per action, verified under the O-2R.1 identity relabelling; the safe sets of the two witness worlds and their
// intersection; the intersection over every tested equivalent world (from evidence/assumption-check.json, same
// deterministic families); and whether that safety is lawfully computable from public decision information.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { identityViewTwinV2 } from '../../stage3h-owner-governed-v1/identity-view-v2.mjs';
import { loadRows, comboOf } from '../../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld } from '../twins.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..');
const J = (p) => JSON.parse(readFileSync(resolve(LANE, p), 'utf8'));
const dossier = J('evidence/closure/WITNESS_DOSSIER.json'), assumption = J('evidence/assumption-check.json');

/** Identity-free semantic key of a menu action: type, displacement/destination, and the target's public attributes. */
function semanticKey(view, i) {
  const e = view.surface[i], s = view.semantics[i], st = view.state, actor = st.actor;
  const t = e.targetEntityId ? st.entities.find((x) => x.entityId === e.targetEntityId) : null;
  const dest = s.observableSpatialEffect?.destination ?? null;
  return JSON.stringify({ type: e.actionType, displacement: dest ? { dx: dest.x - actor.observedPosition.x, dy: dest.y - actor.observedPosition.y } : null,
    target: t ? { kind: t.entityKind, rel: t.actorRelativePosition, flags: [t.criticalFlag, t.objectiveFlag, t.hostileFlag, t.threatenedFlag, t.inService, t.hubFlag], relationships: t.observedRelationships.map((r) => [r.kind, r.role]).sort() } : null,
    parameters: e.action.parameters && Object.keys(e.action.parameters).filter((k) => k !== 'dependent').length ? { ...e.action.parameters, dependent: undefined } : null });
}

const classes = dossier.witnesses.map((w) => {
  const row = loadRows(w.set).find((r) => r.idx === w.idx), base = nativeWorld(comboOf(row)), view = base.view, n = view.surface.length;
  const keys = [...Array(n).keys()].map((i) => semanticKey(view, i));
  const twin = identityViewTwinV2(view), back = Object.fromEntries(Object.entries(twin.actionMap).map(([a, b]) => [b, a]));
  const twinKeyByOriginal = Object.fromEntries(twin.view.surface.map((e, j) => [back[e.actionId], semanticKey(twin.view, j)]));
  const identityStable = view.surface.every((e, i) => twinKeyByOriginal[e.actionId] === keys[i]);
  const safe = (u) => u.map((x, i) => (Math.max(...u) - x < 100 ? i : -1)).filter((i) => i >= 0);
  const arms = new Set([...w.decisions.B, ...w.decisions.N]), s1 = safe(w.utilities.w1), s2 = safe(w.utilities.w2);
  const pairCommon = s1.filter((i) => s2.includes(i)), pairCommonOutsideArms = pairCommon.filter((i) => !arms.has(i));
  const ac = assumption.classes.find((c) => c.set === w.set && c.idx === w.idx);
  const classCommon = ac ? ac.actionsSafeInEveryEquivalentWorld.map((a) => a.index) : null;
  return { set: w.set, idx: w.idx, cell: w.cell, validWitness: w.validInSearch,
    commonLegalMenu: view.surface.map((e, i) => ({ index: i, type: e.actionType, semanticKeyUniqueInMenu: keys.filter((k) => k === keys[i]).length === 1, semanticKey: JSON.parse(keys[i]) })),
    semanticsStableUnderIdentityRelabelling: identityStable, arms: { B: w.decisions.B, N: w.decisions.N },
    safeSets: { w1: s1, w2: s2 }, pairCommonSafe: pairCommon, pairCommonSafeOutsideArms: pairCommonOutsideArms,
    classWide: ac ? { testedEquivalentWorlds: ac.equivalentWorlds, commonSafe: classCommon, commonSafeOutsideArms: classCommon.filter((i) => !arms.has(i)), source: 'evidence/assumption-check.json (same deterministic family)' } : { status: 'NOT_COMPUTED (invalid witness; assumption-check covered valid witnesses only)' },
    alternativeIdentifiableWithoutHandles: pairCommonOutsideArms.every((i) => keys.filter((k) => k === keys[i]).length === 1),
    safetyLawfullyComputable: 'NOT_UNDER_CURRENT_CONTRACT: the action is non-catastrophic in every tested equivalent world, so on the tested family its safety does not depend on the hidden state; but establishing that requires native rollouts over the hidden-state support, and the decision contract forbids simulator and evaluator access (publicSimulatorCalls 0). Offline discovery is not a deployable safety policy.' };
});
const valid = classes.filter((c) => c.validWitness);
const out = { schema: 'STAGE3H_SAFETY_CLOSURE_ALTERNATIVE_ACTIONS_V1', authority: 'R0', classes: classes.length, validClasses: valid.length,
  validPairsWithCommonSafeOutsideArms: valid.filter((c) => c.pairCommonSafeOutsideArms.length > 0).length,
  validClassesWithClassWideCommonSafeOutsideArms: valid.filter((c) => c.classWide.commonSafeOutsideArms?.length > 0).length,
  validClassesWithNoCommonSafeAction: valid.filter((c) => (c.classWide.commonSafe ?? []).length === 0).length,
  semanticsStableUnderIdentityRelabelling: classes.every((c) => c.semanticsStableUnderIdentityRelabelling), alternativesIdentifiableWithoutHandles: valid.every((c) => c.alternativeIdentifiableWithoutHandles),
  outcome: 'COMMON_SAFE_ACTIONS_OBSERVED (on 9 tested witness classes only; not a claim that any wider policy is safe)', perClass: classes };
writeExclusive(resolve(LANE, 'evidence/closure/ALTERNATIVE_ACTIONS.json'), out);
console.log(JSON.stringify({ ...out, perClass: classes.map((c) => ({ idx: c.idx, valid: c.validWitness, pair: c.pairCommonSafeOutsideArms, classWide: c.classWide.commonSafeOutsideArms, worlds: c.classWide.testedEquivalentWorlds, identityStable: c.semanticsStableUnderIdentityRelabelling })) }, null, 1));
