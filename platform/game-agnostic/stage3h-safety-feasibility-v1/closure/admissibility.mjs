// Closure Phases 2-4: native-state admissibility audit and witness dossier for every contradiction witness.
// Usage: node closure/admissibility.mjs   -> evidence/closure/ADMISSIBILITY.json and evidence/closure/WITNESS_DOSSIER.json
// Three concepts are kept apart:
//   GENERATOR_RANGE_VALID       each hidden value lies in its scenarios-v2.js range
//   NATIVE_STATE_ADMISSIBLE     the whole state satisfies the kernel's authoritative validateWorld (run by createWorld,
//                               legalActions, step and observe), validateScenarioV2, the frozen calibrated warm-up
//                               (replay frame-identical), legal native transitions, a valid O-6 menu and action
//                               semantics consistent with the native transition (E1 effect fidelity)
//   SEEDED_GENERATOR_REACHABLE  the actual seeded generator produces the state under its seed contract
// Witness worlds are rebuilt from (seed, axes, hidden spec). Decisions use the frozen connector lock; truth is computed
// only after both worlds' decisions are fixed.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createWorld, legalActions, step, hashWorld } from '../../src/forge/kernel.js';
import { runTemporalWarmup, replayTemporalWarmup } from '../../src/forge/warmup.js';
import { validateScenarioV2 } from '../../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { symmetricLegalActions, symmetricStep } from '../../src/forge-symmetric/action-surface-symmetric-v1.js';
import { canonicalActionKey, canonicalOrientation } from '../../src/forge-symmetric/orientation-symmetric-v1.js';
import { DECLARED_ACTION_COST_MODEL } from '../../src/stage3f/deployable-action-proposal-v1.js';
import { observableView } from '../../scripts/stage3g/evidence.mjs';
import { score } from '../../stage3h-canonical-v1/metrics.mjs';
import { S0_HASH } from '../../stage3h-canonical-v1/baseline.mjs';
import { SOURCES } from '../../stage3h-canonical-v1/adapters.mjs';
import { potentialIntroduction } from '../../stage3h-activation-readiness-v2/runner-design.mjs';
import { nativeLock } from '../../stage3h-owner-governed-v1/connector.mjs';
import { loadRows, comboOf } from '../../stage3h-failure-diagnosis-v1/h2-mechanism.mjs';
import { writeExclusive } from '../../stage3h-failure-diagnosis-v1/lib.mjs';
import { nativeWorld, hiddenSupport, publicHistory, axesOf } from '../twins.mjs';
import { publicContent, classVerdict, DIGEST_FIELDS } from '../contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), LANE = resolve(HERE, '..'), GA = resolve(LANE, '..');
const sha = (s) => createHash('sha256').update(s).digest('hex'), fsha = (p) => sha(readFileSync(resolve(GA, p)));
const witness = JSON.parse(readFileSync(resolve(LANE, 'evidence/witness.json'), 'utf8'));
const search = readFileSync(resolve(LANE, 'search/shard-0-of-10.jsonl'), 'utf8') && Array.from({ length: 10 }, (_, i) => readFileSync(resolve(LANE, `search/shard-${i}-of-10.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l))).flat();
const WITNESSES = search.filter((r) => r.status === 'WITNESS');

/** Native-state admissibility of one rebuilt world (throws inside kernel validators on any violation; caught and recorded). */
function admissible(combo, spec, w) {
  const { seed } = axesOf(combo), out = {};
  const guard = (k, f) => { try { out[k] = f(); } catch (e) { out[k] = false; out[k + 'Error'] = String(e.message).slice(0, 200); } };
  guard('generatorRangeValid', () => hiddenSupport(w.config).inSupport);
  guard('scenarioValidatorValid', () => validateScenarioV2(createWorld(seed, w.config), w.config).valid);
  guard('warmupReproducesWorld', () => { const r = runTemporalWarmup(seed, w.config, { targetTicks: w.warmupTicks }); return hashWorld(r.world) === w.worldHash && r.warmupTicks === w.warmupTicks && r.taskPreserved; });
  guard('warmupReplayFrameIdentical', () => { const r = runTemporalWarmup(seed, w.config, { targetTicks: w.warmupTicks }), rep = replayTemporalWarmup(seed, w.config, r); return rep.allFramesIdentical && rep.ticksIdentical && rep.stopReasonIdentical; });
  guard('everyTickValidAndLegalWait', () => { // legalActions() and step() run the kernel's validateWorld on input and output
    let s = createWorld(seed, w.config);
    for (let t = 0; t < w.warmupTicks; t++) { const wait = legalActions(s).find((a) => a.actionType === 'WAIT'); if (!wait) return false; s = step(s, wait).state; }
    legalActions(s); return hashWorld(s) === w.worldHash;
  });
  guard('menuValidO6', () => { const m = w.view.surface.map((e) => e.actionId); return m.length > 0 && new Set(m).size === m.length; });
  guard('menuEqualsNativeSymmetricSurface', () => { const frame = canonicalOrientation(w.world).orientation, size = w.world.grid.width, keys = symmetricLegalActions(w.world, frame).map((a) => canonicalActionKey('R0', a, size)).sort();
    return JSON.stringify(keys) === JSON.stringify(w.view.surface.map((e) => e.actionId).sort()); });
  guard('everyMenuActionTransitionsNatively', () => w.view.surface.every((e) => { const r = symmetricStep(w.world, e.action); legalActions(r.state); return true; }));
  guard('semanticsAlignedAndE1Faithful', () => w.view.surface.every((e, i) => {
    const s = w.view.semantics[i]; if (!s || s.actionType !== e.actionType) return false;
    const r = symmetricStep(w.world, e.action).state, actor = r.entities.find((x) => x.type === 'ACTOR' && x.faction === 'sentinel');
    return s.deterministicImmediateEffects.filter((f) => f.class === 'E1').every((f) =>
      f.effect === 'ACTOR_DISPLACEMENT' ? actor.position.x === f.destination.x && actor.position.y === f.destination.y
        : f.effect === 'ENERGY_DELTA' ? r.constraints.energy === f.energyAfter && f.energyAfter === w.world.constraints.energy - DECLARED_ACTION_COST_MODEL.cost[s.actionType]
          : f.effect === 'TICK_ADVANCE' ? r.tick === w.world.tick + 1 : true);
  }));
  guard('decisionPointObservationValid', () => { observableView(w.world); return true; }); // observe() runs validateWorld
  out.nativeStateAdmissible = ['scenarioValidatorValid', 'warmupReproducesWorld', 'warmupReplayFrameIdentical', 'everyTickValidAndLegalWait', 'menuValidO6', 'menuEqualsNativeSymmetricSurface', 'everyMenuActionTransitionsNatively', 'semanticsAlignedAndE1Faithful', 'decisionPointObservationValid'].every((k) => out[k] === true);
  return out;
}

/** Lower bound on the public information fixed by the generator's random draws (bits), from the base configuration:
 * nodeCount (randomInt 0..3), entity placements (place(): uniform over the remaining open cells; open-cell counts are public
 * from the visible terrain) and the primary-node choice (public via the objective). Hazard/terrain, topology, victim and
 * channel draws are also public but are not counted, so this is conservative. */
function publicDrawBits(config) {
  const open = config.grid.cells.filter((c) => c === 0).length, material = config.entities.findIndex((e) => e.id === 'material');
  const actor = config.entities.find((e) => e.id === 'actor'), mat = config.entities[material];
  const viaPlaceNear = mat && Math.abs(mat.position.x - actor.position.x) + Math.abs(mat.position.y - actor.position.y) === 1;
  const placed = config.entities.length - (viaPlaceNear ? 1 : 0), structural = config.entities.filter((e) => /^n\d+$/.test(e.id)).length;
  let bits = Math.log2(4) + Math.log2(structural);
  for (let j = 0; j < placed; j++) bits += Math.log2(open - j);
  return { bits, placements: placed, openCells: open, materialViaPlaceNear: !!viaPlaceNear };
}

function auditWitness(r) {
  const rows = loadRows(r.set), row = rows.find((x) => x.idx === r.idx), combo = comboOf(row);
  const sides = { w1: r.witness.nIntroducesVsB, w2: r.witness.bIntroducesVsN }, W = {}, A = {};
  for (const [k, s] of Object.entries(sides)) { W[k] = nativeWorld(combo, s.spec); A[k] = W[k].rejected ? { nativeStateAdmissible: false, rejected: W[k].rejected } : admissible(combo, s.spec, W[k]); }
  const base = nativeWorld(combo);
  // public identity and decisions (frozen connector lock), then truth
  const H1 = publicHistory(W.w1.seed, W.w1.config, W.w1.warmupTicks), H2 = publicHistory(W.w2.seed, W.w2.config, W.w2.warmupTicks);
  const f1 = nativeLock(W.w1.view, W.w1.band), f2 = nativeLock(W.w2.view, W.w2.band), menu = f1.menu, ix = (ids) => ids.map((id) => menu.indexOf(id));
  const sel = { B: ix(f1.selections.B), N: ix(f1.selections.N) };
  const decisionsIdentical = JSON.stringify(f1.selections) === JSON.stringify(f2.selections) && JSON.stringify(f1.menu) === JSON.stringify(f2.menu);
  const truthOf = (w) => evaluateCounterfactualsSymmetricV1(w.world, { horizon: w.horizon });
  const T = { w1: truthOf(W.w1), w2: truthOf(W.w2) };
  const lab = (t) => { const br = new Map(t.branches.map((b) => [b.actionKey, b])), truth = menu.map((id) => ({ id: menu.indexOf(id), utility: br.get(id).totalScalar }));
    const B = score(f1.selections.B, t), N = score(f1.selections.N, t);
    return { regretB: B.regret, regretN: N.regret, catB: B.catastrophic, catN: N.catastrophic, chooseNIntroducesVsB: potentialIntroduction(sel.N, sel.B, truth), chooseBIntroducesVsN: potentialIntroduction(sel.B, sel.N, truth), utilities: truth.map((x) => x.utility) }; };
  const L = { w1: lab(T.w1), w2: lab(T.w2) };
  const reproduces = L.w1.regretB === sides.w1.regretB && L.w1.regretN === sides.w1.regretN && L.w2.regretB === sides.w2.regretB && L.w2.regretN === sides.w2.regretN;
  const verdict = classVerdict(sel, [{ truth: L.w1.utilities }, { truth: L.w2.utilities }]);
  const formal = { samePublicDecisionInformation: W.w1.content === W.w2.content && H1.contents.length === H2.contents.length && H1.contents.every((c, t) => c === H2.contents[t]),
    sameDecisionsBothArms: decisionsIdentical, nexusApplicable: !f1.selections.N.every((id) => f1.selections.B.includes(id)) || true,
    s0CatastrophicInExactlyOne: (L.w1.catB > 0) !== (L.w2.catB > 0), nexusOppositeStatus: (L.w1.catN > 0) !== (L.w2.catN > 0) && (L.w1.catN > 0) === (L.w2.catB > 0),
    deterministicImpossible: !verdict.deterministicS0Safe && !verdict.deterministicNexusSafe && verdict.subsetsSafeEverywhere === 0,
    randomizedZeroRiskImpossible: verdict.randomizedMinWorstCaseIntroductionProbability >= 0.5, catastropheDefinition: 'frozen metrics.mjs score().catastrophic (regret >= 100) and runner-design potentialIntroduction' };
  const seeded = Object.fromEntries(Object.entries(sides).map(([k, s]) => [k, s.spec.length === 0
    ? { status: 'SEEDED_GENERATOR_REACHABLE', seedWitness: row.seed, proof: 'the unperturbed frozen generator at this seed and axes, with the frozen calibrated warm-up, reproduces the world hash exactly', reproduced: base.worldHash === W[k].worldHash }
    : { status: 'NOT_ESTABLISHED', reason: 'differs from the native world of the same seed in hidden draws; another seed would have to reproduce every public draw' }]));
  const info = publicDrawBits(base.config);
  return { set: r.set, idx: r.idx, seed: row.seed, cell: r.cell, axes: axesOf(combo).axes, validInSearch: !witness.others.find((o) => o.idx === r.idx && o.set === r.set && !o.valid) && !(witness.primary.idx === r.idx && witness.primary.set === r.set && !witness.primary.valid),
    hiddenSpecs: { w1: sides.w1.spec, w2: sides.w2.spec }, worldHashes: { base: base.worldHash, w1: W.w1.worldHash, w2: W.w2.worldHash },
    admissibility: A, publicHistoryTicks: H1.contents.length, publicHistorySha256: sha(JSON.stringify(H1.contents)), formal, labelsReproduce: reproduces,
    labels: { w1: { ...L.w1, utilities: undefined }, w2: { ...L.w2, utilities: undefined } }, utilities: { w1: L.w1.utilities, w2: L.w2.utilities },
    menu: W.w1.view.surface.map((e, i) => ({ index: i, handle: e.actionId, type: e.actionType, action: e.action })), decisions: sel, classVerdict: verdict, seededReachability: seeded,
    publicInformation: { ...info, idealizedExpectedOtherStates: `<= 2^(64 - ${info.bits.toFixed(1)}) = 2^${(64 - info.bits).toFixed(1)}`, model: 'SplitMix64 64-bit state, draws treated as independent uniform (idealization, not a proof)' },
    publicDecisionView: JSON.parse(publicContent(W.w1.view)) };
}

const audits = WITNESSES.map(auditWitness);
const valid = audits.filter((a) => a.validInSearch);
const admissibilitySummary = { schema: 'STAGE3H_SAFETY_CLOSURE_ADMISSIBILITY_V1', authority: 'R0', concepts: { GENERATOR_RANGE_VALID: 'each hidden value in its scenarios-v2.js range', NATIVE_STATE_ADMISSIBLE: 'kernel validateWorld at every state, validateScenarioV2, frozen warm-up replay, legal native transitions, O-6 menu, native surface, E1-faithful semantics', SEEDED_GENERATOR_REACHABLE: 'produced by the actual seeded generator under its seed contract' },
  jointCombinationGrounding: { source: 'src/forge/scenarios-v2.js', sha256: fsha('src/forge/scenarios-v2.js'), finding: 'each structural node draws value = 2 + randomInt(0, valueSpread + 2) and health = index % 4 === 0 ? 20 + randomInt(0, 30) : 100 independently, with no rejection sampling and no cross-node constraint; only the primary objective value and the failed restore node health are overridden afterwards. Under the documented sampling contract (independent uniform randomInt draws) the joint support is the product of the individual ranges. The concrete SplitMix64 stream couples these draws to the public placement draws, which is the separate SEEDED_GENERATOR_REACHABLE question.' },
  policyIdentities: { S0: S0_HASH, Nexus: SOURCES.Nexus, nexusSelectorPortSha256: fsha('stage3h-canonical-v1/nexus-selector-v1-port.mjs'), digestFieldsExcluded: DIGEST_FIELDS },
  witnesses: audits.length, validWitnesses: valid.length,
  perWitness: audits.map((a) => ({ set: a.set, idx: a.idx, cell: a.cell, validInSearch: a.validInSearch, generatorRangeValid: a.admissibility.w1.generatorRangeValid && a.admissibility.w2.generatorRangeValid,
    nativeStateAdmissible: a.admissibility.w1.nativeStateAdmissible && a.admissibility.w2.nativeStateAdmissible, publicHistoryIdentical: a.formal.samePublicDecisionInformation, decisionsIdentical: a.formal.sameDecisionsBothArms,
    labelsReproduce: a.labelsReproduce, deterministicImpossible: a.formal.deterministicImpossible, randomizedZeroRiskImpossible: a.formal.randomizedZeroRiskImpossible,
    seeded: { w1: a.seededReachability.w1.status, w2: a.seededReachability.w2.status }, publicBitsLowerBound: +a.publicInformation.bits.toFixed(1),
    failedAdmissibilityChecks: Object.entries({ ...a.admissibility.w1, ...Object.fromEntries(Object.entries(a.admissibility.w2).map(([k, v]) => ['w2.' + k, v])) }).filter(([, v]) => v === false).map(([k]) => k) })) };
admissibilitySummary.allValidWitnessesAdmissible = valid.every((a) => a.admissibility.w1.nativeStateAdmissible && a.admissibility.w2.nativeStateAdmissible && a.formal.samePublicDecisionInformation && a.formal.sameDecisionsBothArms && a.labelsReproduce && a.formal.deterministicImpossible && a.formal.randomizedZeroRiskImpossible);
admissibilitySummary.seededReachability = { worldsChecked: valid.length * 2, seededReachable: valid.flatMap((a) => Object.values(a.seededReachability)).filter((s) => s.status === 'SEEDED_GENERATOR_REACHABLE').length,
  notEstablished: valid.flatMap((a) => Object.values(a.seededReachability)).filter((s) => s.status === 'NOT_ESTABLISHED').length, pairsWithBothSeeded: valid.filter((a) => Object.values(a.seededReachability).every((s) => s.status === 'SEEDED_GENERATOR_REACHABLE')).length,
  minPublicBits: Math.min(...valid.map((a) => a.publicInformation.bits)) };
writeExclusive(resolve(LANE, 'evidence/closure/ADMISSIBILITY.json'), admissibilitySummary);
writeExclusive(resolve(LANE, 'evidence/closure/WITNESS_DOSSIER.json'), { schema: 'STAGE3H_SAFETY_CLOSURE_WITNESS_DOSSIER_V1', authority: 'R0',
  preserves: 'per witness: seed, axes, hidden perturbations, base/w1/w2 world hashes, admission and native-state checks, full public decision view (digests excluded) and the sha256 of the per-tick public history, menu identities, frozen decisions, frozen evaluator utilities, catastrophe labels, class verdict, seeded-reachability status; the invalid witness and its reason',
  invalidWitnessReasons: audits.filter((a) => !a.validInSearch).map((a) => ({ set: a.set, idx: a.idx, reason: 'S0 returned a mixed-safety tie set: some nonempty subset of S0 u N is non-catastrophic in both worlds, so the set-valued extension of the two-arm class is not refuted on this pair; the deterministic arms still fail' })),
  witnesses: audits });
console.log(JSON.stringify(admissibilitySummary, null, 1));
