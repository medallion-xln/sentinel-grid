import { deepFreeze, sha256 } from '../core/determinism.js';
import { OBSERVATION_BINDING } from './deployable-feature-contract-v1.js';

/* ===========================================================================
 * STAGE_3F_6_W — SENTINEL_DECISION_RISK_STATE_V1
 *
 * Candidate decision-time risk evidence, derived ONLY from the current observation packet and the
 * legal action surface offered at decision time.
 *
 *   PREDICTED_RISK != OBSERVED_FAILURE
 *   RISK_SIGNAL    != FUTURE_OUTCOME
 *   UNKNOWN != ZERO     MISSING != SAFE     NO_THREAT_EVIDENCE != NO_THREAT
 *
 * A risk field describes exposure visible NOW. It is never computed from whether the episode later
 * fails, from any transition, rollout, regret, optimal-policy label, or split metadata.
 *
 * Evidence semantics:
 *   - relationships ABSENT from the observation  -> UNKNOWN (no threat evidence; NOT "no threat")
 *   - relationships PRESENT and empty            -> AVAILABLE 0 (observed absence of threat relations)
 *   - foreign observation schema                 -> UNKNOWN for vector-bound fields
 *   - no legal action surface                    -> UNAVAILABLE for action-conditioned fields
 *   - ratio with no threatened entity            -> NOT_APPLICABLE (never imputed)
 * ========================================================================= */

export const DECISION_RISK_STATE_CONTRACT_ID = 'SENTINEL_DECISION_RISK_STATE_V1';

export const RiskFieldStatus = deepFreeze({
  AVAILABLE: 'AVAILABLE', UNKNOWN: 'UNKNOWN', UNAVAILABLE: 'UNAVAILABLE', NOT_APPLICABLE: 'NOT_APPLICABLE',
});

const field = (definition) => deepFreeze({
  decisionTimeOnly: true, usesFutureOutcome: false, usesTransition: false, usesRollout: false,
  usesRegret: false, usesOptimalPolicyLabel: false, usesSplitMetadata: false, ...definition,
});

const RELATIONAL = 'metadata.canonicalState (entities, relationships)';
const VECTOR = (name) => `features[${OBSERVATION_BINDING.vector[name]}] (${name})`;

export const RISK_STATE_FIELDS = deepFreeze([
  field({ fieldId: 'risk.threatRelationCount', candidateName: 'activeThreatCount',
    semantic: 'number of observed threatens relationships', source: RELATIONAL, epistemicCategory: 'OBSERVED',
    provenance: 'observation packet', requiredCalibration: 'OBSERVATION_SEMANTICS: relationship kind vocabulary',
    missingSemantics: 'UNKNOWN when relationships are absent; 0 only when observed and empty', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.hostileAliveCount', candidateName: 'activeThreatCount (alive)',
    semantic: 'observed count of living hostile entities', source: VECTOR('hostileAliveCount'), epistemicCategory: 'OBSERVED',
    provenance: 'observation packet', requiredCalibration: 'OBSERVATION_SEMANTICS: vector schema binding',
    missingSemantics: 'UNKNOWN on foreign or malformed observation schema', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.maxThreatPressure', candidateName: 'maxThreatSeverity',
    semantic: 'largest number of threatens relationships converging on a single observed entity', source: RELATIONAL,
    epistemicCategory: 'DERIVED', provenance: 'observation packet',
    requiredCalibration: 'OBSERVATION_SEMANTICS: relationship kind vocabulary',
    missingSemantics: 'UNKNOWN when relationships are absent', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.coveredThreatCount', candidateName: 'coveredThreatCount',
    semantic: 'threatened observed entities that at least one legal action targets', source: `${RELATIONAL} + legal action targets`,
    epistemicCategory: 'DERIVED', provenance: 'observation packet + legal action surface',
    requiredCalibration: 'ACTION_SEMANTICS: action target identity',
    missingSemantics: 'UNKNOWN when relationships are absent; UNAVAILABLE without a legal action surface', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.threatCoverageRatio', candidateName: 'threatCoverageRatio',
    semantic: 'covered threatened entities / threatened entities', source: `${RELATIONAL} + legal action targets`,
    epistemicCategory: 'DERIVED', provenance: 'observation packet + legal action surface',
    requiredCalibration: 'ACTION_SEMANTICS: action target identity',
    missingSemantics: 'NOT_APPLICABLE when no entity is observed as threatened — never imputed as covered or uncovered',
    mayBeNotApplicable: true }),
  field({ fieldId: 'risk.threatenedCriticalCount', candidateName: 'objectiveExposure',
    semantic: 'observed objective-bearing (critical) entities under threat', source: RELATIONAL, epistemicCategory: 'DERIVED',
    provenance: 'observation packet', requiredCalibration: 'OBJECTIVE_SEMANTICS: critical-entity flag',
    missingSemantics: 'UNKNOWN when entities or relationships are absent', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.threatenedDependencyCount', candidateName: 'dependencyExposure',
    semantic: 'threatened observed entities that at least one other entity depends on', source: RELATIONAL,
    epistemicCategory: 'DERIVED', provenance: 'observation packet',
    requiredCalibration: 'OBSERVATION_SEMANTICS: depends relationship direction',
    missingSemantics: 'UNKNOWN when relationships are absent', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.threatenedCivilianCount', candidateName: 'civilianExposure',
    semantic: 'threatened observed entities of civilian kind', source: RELATIONAL, epistemicCategory: 'DERIVED',
    provenance: 'observation packet', requiredCalibration: 'OBSERVATION_SEMANTICS: entity kind vocabulary',
    missingSemantics: 'UNKNOWN when entities or relationships are absent', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.actorHealth', candidateName: 'resourceExposure (actor)',
    semantic: 'observed health of the controlled actor', source: VECTOR('actorHealth'), epistemicCategory: 'OBSERVED',
    provenance: 'observation packet', requiredCalibration: 'RESOURCE_SEMANTICS: health scale',
    missingSemantics: 'UNKNOWN on foreign or malformed observation schema', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.civilianHealthTotal', candidateName: 'civilianExposure (health)',
    semantic: 'observed total civilian health', source: VECTOR('civilianHealthTotal'), epistemicCategory: 'OBSERVED',
    provenance: 'observation packet', requiredCalibration: 'RESOURCE_SEMANTICS: health scale',
    missingSemantics: 'UNKNOWN on foreign or malformed observation schema', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.retreatOptionCount', candidateName: 'escapeOptionCount',
    semantic: 'legal RETREAT actions available now', source: 'legal action surface', epistemicCategory: 'OBSERVED',
    provenance: 'legal action surface', requiredCalibration: 'ACTION_SEMANTICS: action type vocabulary',
    missingSemantics: 'UNAVAILABLE without a legal action surface', mayBeNotApplicable: false }),
  field({ fieldId: 'risk.unavailableEntityCount', candidateName: 'actionConstraintCount',
    semantic: 'observed entities currently unavailable (disabled)', source: VECTOR('unavailableEntityCount'),
    epistemicCategory: 'OBSERVED', provenance: 'observation packet', requiredCalibration: 'OBSERVATION_SEMANTICS: availability flag',
    missingSemantics: 'UNKNOWN on foreign or malformed observation schema', mayBeNotApplicable: false }),
]);

export const DECISION_RISK_STATE_CONTRACT = deepFreeze({
  contractId: DECISION_RISK_STATE_CONTRACT_ID,
  schemaVersion: 1,
  principles: ['PREDICTED_RISK != OBSERVED_FAILURE', 'RISK_SIGNAL != FUTURE_OUTCOME', 'UNKNOWN != ZERO',
    'MISSING != SAFE', 'NO_THREAT_EVIDENCE != NO_THREAT'],
  permittedSources: ['current observation packet', 'legal action surface at decision time', 'declared observation schema'],
  prohibitedSources: ['future outcome', 'state_t+1', 'rollout', 'regret', 'optimal policy label', 'sealed split metadata',
    'post-hoc trace evidence', 'authoritative world state not given to the observer', 'observation history'],
  observationSchema: { id: OBSERVATION_BINDING.schemaId, version: OBSERVATION_BINDING.schemaVersion },
  statuses: Object.values(RiskFieldStatus),
  fields: RISK_STATE_FIELDS,
  authority: { tier: 'R0', canDispatch: false, canMutateLiveWorld: false },
});
export const DECISION_RISK_STATE_CONTRACT_HASH = sha256(DECISION_RISK_STATE_CONTRACT);

const available = (value) => ({ value, status: RiskFieldStatus.AVAILABLE, reason: null });
const unknown = (reason) => ({ value: null, status: RiskFieldStatus.UNKNOWN, reason });
const unavailable = (reason) => ({ value: null, status: RiskFieldStatus.UNAVAILABLE, reason });
const notApplicable = (reason) => ({ value: null, status: RiskFieldStatus.NOT_APPLICABLE, reason });

function vectorBound(observation) {
  return Boolean(observation) && observation.schemaId === OBSERVATION_BINDING.schemaId
    && observation.schemaVersion === OBSERVATION_BINDING.schemaVersion
    && Array.isArray(observation.features) && observation.features.length === OBSERVATION_BINDING.vectorLength;
}

/** Extract candidate risk state from decision-time evidence only. */
export function extractDecisionRiskState({ observation = null, legalActions = null } = {}) {
  const out = {};
  const bound = vectorBound(observation);
  const vectorField = (id, name) => {
    out[id] = bound ? available(observation.features[OBSERVATION_BINDING.vector[name]])
      : unknown('observation does not match the bound observation schema');
  };
  vectorField('risk.hostileAliveCount', 'hostileAliveCount');
  vectorField('risk.actorHealth', 'actorHealth');
  vectorField('risk.civilianHealthTotal', 'civilianHealthTotal');
  vectorField('risk.unavailableEntityCount', 'unavailableEntityCount');

  const canonical = bound ? observation?.metadata?.canonicalState : null;
  const entities = Array.isArray(canonical?.entities) ? canonical.entities : null;
  const relationships = Array.isArray(canonical?.relationships) ? canonical.relationships : null;
  const hasActions = Array.isArray(legalActions);

  const relationalIds = ['risk.threatRelationCount', 'risk.maxThreatPressure', 'risk.threatenedCriticalCount',
    'risk.threatenedDependencyCount', 'risk.threatenedCivilianCount', 'risk.coveredThreatCount', 'risk.threatCoverageRatio'];
  if (entities === null || relationships === null) {
    const reason = 'no relational threat evidence in the observation (absence of evidence, not absence of threat)';
    for (const id of relationalIds) out[id] = unknown(reason);
  } else {
    const byId = new Map(entities.map((e) => [e.id, e]));
    const threatIn = new Map(); const dependents = new Map();
    let threatRelations = 0;
    for (const r of relationships) {
      if (r.kind === 'threatens') { threatRelations += 1; threatIn.set(r.to, (threatIn.get(r.to) ?? 0) + 1); }
      if (r.kind === 'depends') dependents.set(r.to, (dependents.get(r.to) ?? 0) + 1);
    }
    const threatened = [...threatIn.keys()].filter((id) => byId.has(id));
    out['risk.threatRelationCount'] = available(threatRelations);
    out['risk.maxThreatPressure'] = available(threatIn.size ? Math.max(...threatIn.values()) : 0);
    out['risk.threatenedCriticalCount'] = available(threatened.filter((id) => byId.get(id).critical === true).length);
    out['risk.threatenedDependencyCount'] = available(threatened.filter((id) => (dependents.get(id) ?? 0) > 0).length);
    out['risk.threatenedCivilianCount'] = available(threatened.filter((id) => byId.get(id).kind === 'CIVILIAN').length);
    if (!hasActions) {
      out['risk.coveredThreatCount'] = unavailable('LEGAL_ACTION_SURFACE not declared');
      out['risk.threatCoverageRatio'] = unavailable('LEGAL_ACTION_SURFACE not declared');
    } else {
      const targeted = new Set(legalActions.map((a) => a.targetEntityId).filter((t) => typeof t === 'string'));
      const covered = threatened.filter((id) => targeted.has(id)).length;
      out['risk.coveredThreatCount'] = available(covered);
      out['risk.threatCoverageRatio'] = threatened.length === 0
        ? notApplicable('no entity is observed as threatened; coverage is undefined and is not imputed')
        : available(covered / threatened.length);
    }
  }
  out['risk.retreatOptionCount'] = hasActions
    ? available(legalActions.filter((a) => a.actionType === 'RETREAT').length)
    : unavailable('LEGAL_ACTION_SURFACE not declared');

  const fields = {};
  for (const def of RISK_STATE_FIELDS) {
    if (!Object.hasOwn(out, def.fieldId)) throw new Error(`risk extractor produced no value for ${def.fieldId}`);
    fields[def.fieldId] = deepFreeze({ fieldId: def.fieldId, ...out[def.fieldId] });
  }
  return deepFreeze({ contractId: DECISION_RISK_STATE_CONTRACT_ID, contractHash: DECISION_RISK_STATE_CONTRACT_HASH, fields });
}
