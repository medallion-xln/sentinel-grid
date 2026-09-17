import { deepFreeze, sha256 } from '../core/determinism.js';
import { evaluateNexus } from '../experts/nexus.js';
import { observedThreatStructure } from './deployable-action-proposal-v1.js';

/* ===========================================================================
 * STAGE_3F_6_P_1 — NEXUS_SELECTOR_V2_CANDIDATE (candidate only; never promoted)
 *
 * Historical behaviour is preserved, not overwritten: NEXUS_SELECTOR_V1 remains
 * src/lab/stage3c-learned-nexus.js#nexusRelationalSelector, byte-identical and still the certified
 * policy. This module does not import it, because that module also imports simulator code (root
 * PUCT, counterfactual oracle, kernel); the candidate must be simulator-free even at import level.
 * V1's ranking is therefore carried here verbatim and proven equivalent: with the remediation gate
 * disabled, this module reproduces every certified V1 choice.
 *
 * The single remediation (derived on DEV only, Stage 3F.6-P defect: reflexive PROTECT):
 *   PROTECT is admissible only when its target entity is under OBSERVED threat
 *   (at least one `threatens` edge into it in the observed canonical state).
 * Everything else is V1: the Nexus diagnosis, the abstention rule, both type-preference orders,
 * the action-identity tie-break and the confidence formula.
 *
 * Decision-time inputs only: the observed canonical relational state and the legal action surface
 * (identity, type, target entity). No simulator, rollout, future state, outcome, regret, optimal
 * set or label is available to, or read by, this function.
 * ========================================================================= */

export const NEXUS_SELECTOR_V1_ID = 'NEXUS_SELECTOR_V1';
export const NEXUS_SELECTOR_V1_SOURCE = 'src/lab/stage3c-learned-nexus.js#nexusRelationalSelector';
export const NEXUS_SELECTOR_V2_CANDIDATE_ID = 'NEXUS_SELECTOR_V2_CANDIDATE';

const STRUCTURAL_CODES = ['NEXUS_CRITICAL_DEPENDENCY', 'NEXUS_BOTTLENECK', 'NEXUS_UNSUPPORTED_THREAT', 'NEXUS_CYCLE_DETECTED'];
const THREAT_CODES = ['NEXUS_UNSUPPORTED_THREAT', 'NEXUS_UNCOVERED_THREAT'];
const THREAT_ORDER = ['REINFORCE', 'PROTECT', 'REPAIR', 'SUBSTITUTE', 'ATTACK', 'TRANSFER', 'COLLECT', 'MOVE', 'RETREAT', 'WAIT'];
const STRUCTURE_ORDER = ['REPAIR', 'SUBSTITUTE', 'REINFORCE', 'TRANSFER', 'COLLECT', 'PROTECT', 'MOVE', 'ATTACK', 'RETREAT', 'WAIT'];

/** Deterministic decision table of the historical V1 selector (read from its source, not changed). */
export const NEXUS_V1_DECISION_TABLE = deepFreeze([
  { branch: 'V1-0', RELATIONAL_SIGNAL: 'any', THREAT_SIGNAL: 'any', DEPENDENCY_SIGNAL: 'any', TARGET_TYPE: 'not considered',
    ACTION_TYPE_SELECTED: 'none', TIE_BREAK_RULE: 'n/a', ABSTENTION_RULE: 'ABSTAIN NO_LEGAL_ACTIONS when the legal action surface is empty' },
  { branch: 'V1-1', RELATIONAL_SIGNAL: 'no structural code (CRITICAL_DEPENDENCY, BOTTLENECK, UNSUPPORTED_THREAT, CYCLE_DETECTED), or NO_RELATIONSHIPS, or EMPTY_GRAPH',
    THREAT_SIGNAL: 'any', DEPENDENCY_SIGNAL: 'any', TARGET_TYPE: 'not considered', ACTION_TYPE_SELECTED: 'none', TIE_BREAK_RULE: 'n/a',
    ABSTENTION_RULE: 'ABSTAIN NO_RELATIONAL_STRUCTURE_TO_READ' },
  { branch: 'V1-2 THREAT_DRIVEN', RELATIONAL_SIGNAL: 'structural code present', THREAT_SIGNAL: 'UNSUPPORTED_THREAT or UNCOVERED_THREAT present',
    DEPENDENCY_SIGNAL: 'not consulted beyond the structural gate', TARGET_TYPE: 'not considered: any legal target, threatened or not',
    ACTION_TYPE_SELECTED: `first legal type in ${THREAT_ORDER.join(' > ')}; unlisted types (RESTORE, BYPASS, BUILD) rank last`,
    TIE_BREAK_RULE: 'lexicographically smallest action identity within the type', ABSTENTION_RULE: 'never abstains past V1-1' },
  { branch: 'V1-3 STRUCTURE_DRIVEN', RELATIONAL_SIGNAL: 'structural code present', THREAT_SIGNAL: 'no UNSUPPORTED/UNCOVERED threat',
    DEPENDENCY_SIGNAL: 'not consulted beyond the structural gate', TARGET_TYPE: 'not considered',
    ACTION_TYPE_SELECTED: `first legal type in ${STRUCTURE_ORDER.join(' > ')}; unlisted types (RESTORE, BYPASS, BUILD) rank last`,
    TIE_BREAK_RULE: 'lexicographically smallest action identity within the type', ABSTENTION_RULE: 'never abstains past V1-1' },
]);

export const NEXUS_V2_REMEDIATION = deepFreeze({
  candidateId: NEXUS_SELECTOR_V2_CANDIDATE_ID,
  basedOn: NEXUS_SELECTOR_V1_ID,
  hypothesis: 'NEXUS_ACTION_TYPE_MAPPING_IS_TOO_PROTECT_BIASED',
  change: 'PROTECT is admissible only when its target has at least one observed threatens edge; inadmissible PROTECT actions are removed before the unchanged V1 ranking',
  unchanged: ['Nexus relational diagnosis (evaluateNexus over the full legal surface)', 'abstention rule', 'threat-driven and structure-driven type orders',
    'action-identity tie-break', 'confidence formula'],
  derivedFrom: 'DEV only: PROTECT on an observed-threatened target is optimal far more often than PROTECT on an unthreatened one',
  decisionTimeInputs: ['canonicalState.entities[id,kind,hostile,critical]', 'canonicalState.relationships[from,to,kind]', 'legalActions[actionId,actionType,targetEntityId]'],
  prohibited: ['simulator', 'rollout', 'future state', 'outcome', 'regret', 'optimal set', 'labels', 'new features'],
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false, promotedToLiveRuntime: false, candidateOnly: true },
});

export const NEXUS_V2_CANDIDATE_HASH = sha256({ decisionTableV1: NEXUS_V1_DECISION_TABLE, remediation: NEXUS_V2_REMEDIATION,
  orders: { threat: THREAT_ORDER, structure: STRUCTURE_ORDER } });

export class NexusCandidateInputError extends Error {}

function validate(decisionInput) {
  const legalActions = decisionInput?.legalActions;
  if (!Array.isArray(legalActions)) throw new NexusCandidateInputError('legalActions must be an array');
  for (const action of legalActions) {
    if (typeof action?.actionId !== 'string' || typeof action?.actionType !== 'string') throw new NexusCandidateInputError('malformed legal action');
  }
  return { canonicalState: decisionInput.canonicalState ?? {}, legalActions };
}

/** V1 ranking, verbatim, over a supplied branch list. */
function rankV1(branches, nexus) {
  if (branches.length === 0) return { action: null, reason: 'NO_LEGAL_ACTIONS', confidence: 0 };
  const codes = new Set(nexus.rationaleCodes);
  const structural = STRUCTURAL_CODES.some((code) => codes.has(code));
  if (!structural || codes.has('NEXUS_NO_RELATIONSHIPS') || codes.has('NEXUS_EMPTY_GRAPH')) {
    return { action: null, reason: 'NO_RELATIONAL_STRUCTURE_TO_READ', confidence: 0 };
  }
  const threatDriven = THREAT_CODES.some((code) => codes.has(code));
  const preference = threatDriven ? THREAT_ORDER : STRUCTURE_ORDER;
  const rank = (type) => { const index = preference.indexOf(type); return index === -1 ? preference.length : index; };
  const ranked = [...branches].sort((a, b) => rank(a.actionType) - rank(b.actionType)
    || (a.actionId < b.actionId ? -1 : a.actionId > b.actionId ? 1 : 0));
  const density = nexus.signals?.graphDensity ?? 0;
  const confidence = Math.min(1, Math.round((nexus.confidence / 1000 + density / 2000) * 100) / 100);
  return { action: ranked[0], reason: threatDriven ? 'THREAT_DRIVEN_PREFERENCE' : 'STRUCTURE_DRIVEN_PREFERENCE',
    confidence: Number.isFinite(confidence) ? confidence : 0 };
}

function decide(decisionInput, { protectGate }) {
  const { canonicalState, legalActions } = validate(decisionInput);
  const nexus = evaluateNexus({ canonicalState, legalActions: legalActions.map((a) => ({ actionId: a.actionId, targetEntityId: a.targetEntityId ?? null })) });
  let admissible = legalActions;
  let excludedProtect = 0;
  if (protectGate) {
    const structure = observedThreatStructure(canonicalState);
    admissible = legalActions.filter((a) => a.actionType !== 'PROTECT' || (structure.threatenedBy.get(a.targetEntityId) ?? 0) > 0);
    excludedProtect = legalActions.length - admissible.length;
  }
  const ranked = rankV1(admissible, nexus);
  const reason = ranked.action === null && legalActions.length > 0 && admissible.length === 0 ? 'NO_ADMISSIBLE_ACTION' : ranked.reason;
  return { ...ranked, reason, excludedProtect, rationaleCodes: [...nexus.rationaleCodes].sort() };
}

/** The candidate. Returns a Stage 3F.6-A-shaped proposal. */
export function nexusSelectorV2Candidate(decisionInput) {
  const d = decide(decisionInput, { protectGate: true });
  const action = d.action === null ? null
    : { actionId: d.action.actionId, actionType: d.action.actionType, targetEntityId: d.action.targetEntityId ?? null };
  const provenance = 'observed canonical relational state (Nexus diagnosis + observed threatens edges) + legal action surface';
  return deepFreeze({
    proposalId: sha256({ producerId: NEXUS_SELECTOR_V2_CANDIDATE_ID, actionId: action?.actionId ?? null, provenance }),
    producerId: NEXUS_SELECTOR_V2_CANDIDATE_ID,
    status: action === null ? 'ABSTAIN' : 'PROPOSED',
    action,
    confidence: action === null ? 0 : d.confidence,
    provenance,
    evidence: { rationaleCodes: d.rationaleCodes, preference: d.reason, protectActionsExcludedByGate: d.excludedProtect },
    requiredCapabilities: ['LEGAL_ACTION_SURFACE', 'OBSERVATION_SCHEMA_BOUND', 'RELATIONAL_EXPERT'],
    decisionTime: true,
    epistemicBasis: 'OBSERVED',
    objective: 'RESPOND_TO_OBSERVED_RELATIONAL_STRUCTURE',
    abstainReason: action === null ? d.reason : null,
    candidateHash: NEXUS_V2_CANDIDATE_HASH,
    candidateOnly: true,
    promotedToLiveRuntime: false,
    usesSimulator: false,
    usesMultiStepRollout: false,
    usesV2B: false,
    usesFutureInformation: false,
  });
}

/** Equivalence probe only: the same code path with the remediation gate disabled must reproduce V1. */
export function nexusV1RankingEquivalent(decisionInput) {
  return decide(decisionInput, { protectGate: false }).action?.actionId ?? null;
}
