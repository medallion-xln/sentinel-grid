// STAGE3H_DUAL_COMPARATOR_SAFETY_FEASIBILITY_V1: formal definitions. DEV-only; no selector is implemented.
// Frozen code is imported read-only. Policies (S0, Nexus) only ever receive the public view; evaluator truth is
// computed offline after both decisions are fixed and is never an input to any policy or to the selector class.
import { deepFreeze, stableStringify } from '../src/core/determinism.js';
import { potentialIntroduction } from '../stage3h-activation-readiness-v2/runner-design.mjs';

export const STUDY_ID = 'STAGE3H_DUAL_COMPARATOR_SAFETY_FEASIBILITY_V1';
export const BASE_COMMIT = '8d15408195b469b1ec5a7162e1bf6b16efb9b1aa';

/** Fields that are integrity digests of the PRIVATE world state, not observations. They are injective commitments to
 * hidden state (health, value, ...), so admitting them would admit the hidden state itself. No frozen decision
 * interface reads them: decisionPacket omits them and S0 deletes them (maskInputs). */
export const DIGEST_FIELDS = deepFreeze(['worldHash', 'sourceStateHash', 'provenance']);

export const PUBLIC_DECISION_INFORMATION = deepFreeze({
  id: 'STAGE3H_PUBLIC_DECISION_INFORMATION_V1',
  includes: {
    horizon: 'declared horizon band and evaluation steps (packet horizon; observation features maxTicks - tick)',
    observationValues: 'the complete ObservationPacket: contractVersion, gameId, schemaId, schemaVersion, observerId, sequence, features (incl. aggregate civilian health, unavailable count, live hostiles), featureShape, metadata.tick/scenarioFamily/scenarioLevel/objectives',
    entityRelations: 'metadata.canonicalState entities (id, kind, hostile, critical) and relationships (kind, from, to); Stage 3G observable entity state; visible map',
    legalActions: 'the complete offered menu: handles, types, targets, full action objects',
    actionSemantics: 'every deriveActionSemantics record (preconditions, deterministic immediate effects, spatial effects)',
    observableHistory: 'metadata.observationHistory AND, for witness verification, the complete public view at every warm-up tick',
    uncertaintySignals: 'any function of the above, e.g. Nexus rationale codes/confidence and S0 scores; nothing else',
  },
  excludes: { digests: DIGEST_FIELDS, privileged: 'seed, generator random state, entity health (non-actor), value, cost, risk, resource quantity, relation subtype, native simulator and evaluator access (decision packet contract; publicSimulatorCalls 0)' },
  identity: 'equivalence is modulo a bijection of entity identifiers and action handles; worlds built here share identifiers, so the bijection is the identity and equivalence also holds literally',
});

/** Canonical public content of a public view: everything except the digest fields, at any depth. */
export function publicContent(view) {
  const strip = (x) => (Array.isArray(x) ? x.map(strip) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).filter(([k]) => !DIGEST_FIELDS.includes(k)).map(([k, v]) => [k, strip(v)])) : x);
  return stableStringify(strip(view));
}

export const POLICY_CLASS = deepFreeze({
  id: 'TWO_ARM_PUBLIC_ONLY_V1',
  arms: { S0: 'frozen S0 (B): stage3h-canonical-v1/baseline.mjs currentBaseline, its full top set', NEXUS: 'frozen Nexus-else-S0 (N): invokeNexus recommendation, S0 fallback on abstention; lexical tie-break unchanged' },
  deterministic: 'sigma: public decision information -> {S0, NEXUS}; output R = B or R = N',
  randomized: 'sigma: public decision information -> distribution over {S0, NEXUS}',
  setValued: 'also covered: any nonempty subset of B union N',
  noThirdAction: 'no action outside B union N and no safety override exists in this class',
  lawful: 'sigma reads only public decision information; no seed, generator state, simulator, evaluator or privileged field',
});

export const CATASTROPHE = deepFreeze({
  evaluator: 'FORGE_COUNTERFACTUAL_SYMMETRIC_V1 (evaluateCounterfactualsSymmetricV1), GREEDY_CONTINUATION_V1, FORGE_REWARD_V2, horizon = declared decision horizon',
  catastrophic: 'regret = optimal totalScalar - action totalScalar >= 100 (stage3h-canonical-v1/metrics.mjs score)',
  introduction: 'runner-design.mjs potentialIntroduction(candidate, comparator, truth): candidate != comparator as sets, candidate contains a catastrophic action, comparator contains a non-catastrophic action',
  introVsB: 'potentialIntroduction(R, B)', introVsN: 'potentialIntroduction(R, N)',
});

/** Labels of one world for the two arms (evaluator-only). */
export function labels(sel, truth) {
  const tb = truth.map((u, i) => ({ id: i, utility: u })), max = Math.max(...truth), cat = (i) => max - truth[i] >= 100;
  return { Bcat: sel.B.some(cat), Bsafe: sel.B.some((i) => !cat(i)), Ncat: sel.N.some(cat), Nsafe: sel.N.some((i) => !cat(i)),
    choosingNIntroducesVsB: potentialIntroduction(sel.N, sel.B, tb), choosingBIntroducesVsN: potentialIntroduction(sel.B, sel.N, tb),
    regretB: Math.max(...sel.B.map((i) => max - truth[i])), regretN: Math.max(...sel.N.map((i) => max - truth[i])) };
}

/** Exhaustive check of the policy class on a set of observationally equivalent worlds: deterministic arms, every
 * nonempty subset of B u N, and the best achievable zero-introduction probability of a randomized choice. */
export function classVerdict(sel, worlds) {
  const union = [...new Set([...sel.B, ...sel.N])], subsets = [];
  for (let m = 1; m < 1 << union.length; m++) subsets.push(union.filter((_, k) => m & (1 << k)));
  const intro = (cand, w) => { const tb = w.truth.map((u, i) => ({ id: i, utility: u })); return potentialIntroduction(cand, sel.B, tb) || potentialIntroduction(cand, sel.N, tb); };
  const safeEverywhere = (cand) => worlds.every((w) => !intro(cand, w));
  // Randomized sigma picks S0 with probability p. Worst-case introduction probability = max over worlds of
  // p*iB(w) + (1-p)*iN(w); minimized over p in [0,1] (lines 0, p, 1-p, 1).
  const lines = worlds.map((w) => [intro(sel.B, w) ? 1 : 0, intro(sel.N, w) ? 1 : 0]);
  const worst = (p) => Math.max(...lines.map(([b, n]) => p * b + (1 - p) * n));
  const minWorst = Math.min(worst(0), worst(1), worst(0.5));
  return { worlds: worlds.length, deterministicS0Safe: safeEverywhere(sel.B), deterministicNexusSafe: safeEverywhere(sel.N),
    subsetsTested: subsets.length, subsetsSafeEverywhere: subsets.filter(safeEverywhere).length,
    randomizedMinWorstCaseIntroductionProbability: minWorst,
    anyClassMemberSafe: safeEverywhere(sel.B) || safeEverywhere(sel.N) || subsets.some(safeEverywhere) };
}
