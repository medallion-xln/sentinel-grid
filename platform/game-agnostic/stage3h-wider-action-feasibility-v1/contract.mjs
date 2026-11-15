// STAGE3H_WIDER_NATIVE_ACTION_FEASIBILITY_V1: definitions. DEV-only; no policy, selector or model is implemented.
// Owner decisions (2026-10-22): primary safety domain = ADMISSIBLE_NATIVE_STATE_DOMAIN; secondary performance domain =
// ACTUAL_SEEDED_GENERATOR_POPULATION (no seeded-domain impossibility inferred); PUBLIC_OBSERVATIONS_ONLY; no hidden node
// health or value; no seed recovery; no privileged rollouts at decision time; S0 and Nexus frozen comparators.
import { deepFreeze } from '../src/core/determinism.js';
import { potentialIntroduction } from '../stage3h-activation-readiness-v2/runner-design.mjs';
export { PUBLIC_DECISION_INFORMATION, publicContent, DIGEST_FIELDS } from '../stage3h-safety-feasibility-v1/contract.mjs';

export const STUDY_ID = 'STAGE3H_WIDER_NATIVE_ACTION_FEASIBILITY_V1';
export const QUESTION = 'Can a public-only policy choose an action from the complete native legal-action menu that never introduces a catastrophe against either frozen comparator (S0, Nexus-else-S0) while retaining material decision value?';
export const DEFINITIONS = deepFreeze({
  publicInformation: 'STAGE3H_PUBLIC_DECISION_INFORMATION_V1 (complete public view incl. full public history; integrity digests excluded); no hidden node health/value, no seed recovery, no simulator/evaluator at decision time',
  actionIdentity: 'an action is identified by its identity-free semantic key: type, actor displacement/destination relative to the actor, the target entity\'s public attributes (kind, relative position, critical/objective/hostile/threatened/in-service/hub flags, observed relationships) and remaining non-identifier parameters; handles and entity ids are not part of it',
  relabelEquivalence: 'two actions are the same under entity relabelling iff their semantic keys are equal; verified per class by applying the O-2R.1 opaque relabelling to the public view',
  comparators: { S0: 'frozen S0 top set (B)', NEXUS: 'frozen Nexus recommendation, S0 on abstention (N); lexical tie-break unchanged' },
  menu: 'the complete native legal-action menu = FORGE_ACTION_SURFACE_SYMMETRIC_V1 (policySurface), identical across a public-equivalence class',
  policyClass: 'pi: public decision information -> one menu action (deterministic) or a distribution over menu actions',
  catastrophe: 'frozen evaluator regret >= 100 (FORGE_COUNTERFACTUAL_SYMMETRIC_V1, metrics.mjs score)',
  introduction: 'runner-design potentialIntroduction({a}, comparator): a catastrophic while the comparator contains a non-catastrophic action',
  introductionFree: 'action a is introduction-free in world w iff it introduces against neither B nor N in w; a class admits a zero-introduction public policy (on its tested worlds) iff the intersection of introduction-free sets over the class is non-empty',
  regret: 'nreg = regret / menu utility spread; best-of gap = nreg(chosen) - min(nreg(B), nreg(N))',
  hiddenRisk: 'risk that varies across a public-equivalence class (because hidden node health/value vary) is hidden risk; risk constant across the class is publicly determined on the tested family',
});

/** Per-world labels for every menu action (offline only). */
export function worldLabels(u, B, N) {
  const max = Math.max(...u), spread = max - Math.min(...u), regret = u.map((x) => max - x), cat = regret.map((r) => r >= 100);
  const truth = u.map((x, i) => ({ id: i, utility: x }));
  const introFree = u.map((_, i) => !potentialIntroduction([i], B, truth) && !potentialIntroduction([i], N, truth));
  return { regret, nreg: regret.map((r) => (spread ? r / spread : 0)), cat, introFree };
}
