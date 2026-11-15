// SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1 — contract, identities, request validation.
// Game-agnostic and pure: no file, network, clock, random or environment access; the only import is node:crypto.
// The kernel is an R0 ADVISORY component. It ranks a complete lawful action menu from PUBLIC information and returns a
// recommendation or an explicit abstention. It never executes, dispatches or mutates anything.
import { createHash } from 'node:crypto';

export const KERNEL_ID = 'SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V1', KERNEL_VERSION = '1.0.0';
export const REQUEST_CONTRACT = 'SENTINEL_PUBLIC_DECISION_REQUEST_V1', RECORD_CONTRACT = 'SENTINEL_SAFETY_DECISION_RECORD_V1';
export const AUTHORITY = Object.freeze({ state: 'R0', mode: 'OBSERVATION_AND_RECOMMENDATION_ONLY', canDispatch: false, canMutateLiveWorld: false, promotedToRuntime: false });

/** Deterministic canonical JSON (sorted object keys; arrays in order; non-finite numbers rejected). */
export function stable(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new KernelRejection('NON_FINITE_NUMBER'); return JSON.stringify(v); }
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  throw new KernelRejection('UNSERIALISABLE_VALUE');
}
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const digest = (v) => sha256(stable(v));

export class KernelRejection extends Error { constructor(code, detail = '') { super(detail ? `${code}:${detail}` : code); this.name = 'KernelRejection'; this.code = code; this.detail = detail; } }

// Keys that may never appear anywhere in a request: evaluator outputs, hidden quantities and integrity identities.
export const FORBIDDEN_KEY = /^(truth|truths|utility|utilities|regret|regrets|nreg|catastrophe|catastrophic|label|labels|outcome|outcomes|oracle|rollout|rollouts|evaluator|seed|seeds|worldHash|sourceStateHash|hiddenValue|hiddenHealth|hiddenState|members|counterfactual|counterfactuals)$/;
// Keys that ask for an effect on a world. The kernel recommends; it does not act.
export const EXECUTION_KEY = /^(execute|dispatch|mutate|apply|commit|act|actuate|sendToWorld|write)$/;

function scanKeys(v, path, depth = 0) {
  if (depth > 12) throw new KernelRejection('REQUEST_TOO_DEEP', path);
  if (Array.isArray(v)) { v.forEach((x, i) => scanKeys(x, `${path}[${i}]`, depth + 1)); return; }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) {
    if (FORBIDDEN_KEY.test(k)) throw new KernelRejection('PRIVILEGED_FIELD_IN_REQUEST', `${path}.${k}`);
    if (EXECUTION_KEY.test(k)) throw new KernelRejection('EXECUTION_OR_MUTATION_REQUESTED', `${path}.${k}`);
    scanKeys(v[k], `${path}.${k}`, depth + 1);
  }
}

/** Structural validation of recommend(state, legalActions, advisoryEvidence, options). Throws KernelRejection; never repairs. */
export function validateRequest(state, legalActions, advisoryEvidence, options = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new KernelRejection('STATE_NOT_AN_OBJECT');
  const oc = state.observationContract;
  if (!oc || typeof oc.id !== 'string' || !oc.id || typeof oc.version !== 'string' || !oc.version) throw new KernelRejection('OBSERVATION_CONTRACT_MISSING');
  if (!Array.isArray(legalActions)) throw new KernelRejection('LEGAL_ACTIONS_NOT_AN_ARRAY');
  if (legalActions.length === 0) throw new KernelRejection('EMPTY_LEGAL_MENU');
  if (legalActions.length > 4096) throw new KernelRejection('LEGAL_MENU_TOO_LARGE');
  legalActions.forEach((a, i) => { if (!a || typeof a !== 'object' || Array.isArray(a)) throw new KernelRejection('MALFORMED_ACTION', String(i)); if (typeof a.type !== 'string' || !a.type) throw new KernelRejection('ACTION_TYPE_MISSING', String(i)); });
  if (advisoryEvidence !== null && advisoryEvidence !== undefined && (typeof advisoryEvidence !== 'object' || Array.isArray(advisoryEvidence))) throw new KernelRejection('EVIDENCE_NOT_AN_OBJECT');
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new KernelRejection('OPTIONS_NOT_AN_OBJECT');
  if (options.mode !== undefined && options.mode !== 'RECOMMEND') throw new KernelRejection('EXECUTION_OR_MUTATION_REQUESTED', `mode=${String(options.mode)}`);
  scanKeys(state, 'state'); scanKeys(legalActions, 'legalActions'); scanKeys(advisoryEvidence ?? {}, 'advisoryEvidence'); scanKeys(options, 'options');
}

// Reason codes. Every statement in a decision record is one of these; none of them is a guarantee of safety.
export const REASON = Object.freeze({
  SELECTED_LOWEST_RISK_TIER: 'SELECTED_LOWEST_RISK_TIER', SELECTED_BEST_EXPECTED_REGRET_IN_TIER: 'SELECTED_BEST_EXPECTED_REGRET_IN_TIER',
  ABSTAIN_NO_ACTION_MEETS_RISK_CRITERION: 'ABSTAIN_NO_ACTION_MEETS_RISK_CRITERION', ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE: 'ABSTAIN_NO_SUPPORTED_RISK_ESTIMATE',
  ABSTAIN_EVIDENCE_REQUIRED_BUT_INVALID: 'ABSTAIN_EVIDENCE_REQUIRED_BUT_INVALID', ABSTAIN_NO_RISK_MODEL_FOR_OBSERVATION_CONTRACT: 'ABSTAIN_NO_RISK_MODEL_FOR_OBSERVATION_CONTRACT',
  ABSTAIN_ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT: 'ABSTAIN_ALL_ACTIONS_EXCLUDED_BY_PUBLIC_CONSTRAINT', ABSTAIN_UNRESOLVED_SUBSTANTIVE_TIE: 'ABSTAIN_UNRESOLVED_SUBSTANTIVE_TIE',
  EXCLUDED_BY_PUBLIC_CONSTRAINT: 'EXCLUDED_BY_PUBLIC_CONSTRAINT', NOT_SELECTABLE_SYMMETRIC_ORBIT: 'NOT_SELECTABLE_SYMMETRIC_ORBIT',
  RISK_ESTIMATED: 'RISK_ESTIMATED', RISK_UNSUPPORTED_NOVEL_CATEGORY: 'RISK_UNSUPPORTED_NOVEL_CATEGORY', RISK_UNSUPPORTED_MISSING_INFORMATION: 'RISK_UNSUPPORTED_MISSING_INFORMATION',
  RISK_UNSUPPORTED_NO_MODEL: 'RISK_UNSUPPORTED_NO_MODEL', RISK_OUT_OF_DISTRIBUTION_NUMERIC: 'RISK_OUT_OF_DISTRIBUTION_NUMERIC', RISK_ABOVE_CRITERION: 'RISK_ABOVE_CRITERION',
  EVIDENCE_VALID: 'EVIDENCE_VALID', EVIDENCE_ABSENT: 'EVIDENCE_ABSENT', EVIDENCE_INVALID: 'EVIDENCE_INVALID', EVIDENCE_PARTIALLY_UNSUPPORTED: 'EVIDENCE_PARTIALLY_UNSUPPORTED',
  TIE_RESOLVED_WITHIN_EQUIVALENT_ACTIONS: 'TIE_RESOLVED_WITHIN_EQUIVALENT_ACTIONS',
});
export const EPISTEMIC = Object.freeze({
  status: 'EMPIRICAL_ESTIMATE_NOT_A_GUARANTEE',
  statement: 'Risk values are empirical estimates learned from finite development data under one observation contract. They are not guarantees of safety. A recommendation is advice; an abstention means no action met the frozen risk criterion.',
});
