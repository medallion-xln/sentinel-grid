// A separate candidate, never the inherited root-PUCT engine. Evidence only.
import { sha256, deepFreeze } from '../src/core/determinism.js';
import { validateEvidence } from './evidence.mjs';
import { SOURCES } from './adapters.mjs';
export const CANDIDATE_ID = 'EXPERIMENTAL_PRIME_SYNTHESIS_V1';
export const VARIANTS = ['BEST_QUALIFIED_SINGLE_EXPERT','FIXED_QUALIFIED_EXPERT_COMBINATION',CANDIDATE_ID];
export function synthesize(packet, bundle, ledger, variant=CANDIDATE_ID) {
  if (!VARIANTS.includes(variant)) throw Error('UNKNOWN_PRIME_VARIANT');
  const start = performance.now(), ids = packet.legalActions.map(a=>a.actionId), rejected=[], seen=new Map(), proposals=[];
  let contradictory=false;
  for (const out of bundle) {
    let reason=null;
    try { validateEvidence(out,ids); } catch { reason='INVALID_EVIDENCE'; }
    if (!reason && !ledger.has(out.evidenceHash)) reason='UNQUALIFIED_INVOCATION';
    if (!reason && ['observationId','stateHash','actionSetHash'].some(k=>out[k]!==packet[k])) reason='STALE_OR_DIFFERENT_DECISION';
    if (!reason && SOURCES[out.expertId]?.id !== out.sourceIdentity) reason='UNQUALIFIED_SOURCE';
    if (!reason && SOURCES[out.expertId]?.modelVersion !== out.modelVersion) reason='UNQUALIFIED_MODEL_VERSION';
    const meaning=out.expertId==='Nexus'?'UNCALIBRATED_STRUCTURAL_HEURISTIC_NOT_PROBABILITY':'HISTORY_SUFFICIENCY_MICRO_UNITS_NOT_ACTION_CORRECTNESS';
    if (!reason && out.confidenceMeaning!==meaning) reason='UNSUPPORTED_CONFIDENCE_SEMANTICS';
    if (!reason && out.epistemicProvenance.some(p=>['COUNTERFACTUAL','PREDICTION','BELIEF_STATE'].includes(p.informationClass))) reason='UNSUPPORTED_INFORMATION_CONSUMER';
    if (!reason && (out.applicability!=='APPLICABLE' || ['ERROR','NOT_APPLICABLE','ABSTAIN'].includes(out.outputKind))) reason='NO_APPLICABLE_OUTPUT';
    if (!reason && seen.has(out.expertId)) {
      if (seen.get(out.expertId).recommendedAction!==out.recommendedAction) contradictory=true;
      reason=contradictory?'CONTRADICTORY_EXPERT_OUTPUT':'DUPLICATE_EXPERT';
    }
    if (reason) { rejected.push({ hash:out.evidenceHash??null,reason }); continue; }
    seen.set(out.expertId,out);
    if (out.outputKind==='ACTION_PROPOSAL' && out.expertId==='Nexus') proposals.push(out);
    else rejected.push({hash:out.evidenceHash,reason:'NONACTION_WITHOUT_QUALIFIED_CONSUMER'});
  }
  // One action specialist. No invented temporal-to-action map or confidence sum.
  // A future multi-action binding must qualify conflict resolution separately.
  contradictory ||= new Set(proposals.map(p=>p.recommendedAction)).size>1;
  const action = contradictory || !proposals.length ? null : proposals[0].recommendedAction;
  const body = { candidateId:variant, inheritedPrime:false, recommendedAction:action,
    abstain:action===null, abstainReason:action===null?(contradictory?'CONTRADICTORY_QUALIFIED_PROPOSALS':'NO_QUALIFIED_ACTION_PROPOSAL'):null,
    availableEvidence:bundle.map(p=>p.evidenceHash).sort(), usedEvidence:action===null?[]:[proposals[0].evidenceHash],
    rejected, temporalConsumer:'NOT_TESTABLE_NO_QUALIFIED_FORGE_ACTION_CHANNEL_MAPPING',
    authority:'R0', canDispatch:false, canMutateLiveWorld:false, simulations:0 };
  return deepFreeze({...body,decisionHash:sha256(body),latency:{milliseconds:performance.now()-start,status:'DIAGNOSTIC'}});
}

export function sealedGate(gates) {
  const required=['STAGE3F_FREEZE_REPRODUCED','STAGE3G_FREEZE_REPRODUCED','QUALIFIED_EXPERT_SET_BOUND','MATCHED_EVIDENCE_BASELINE_VALID','EXPERT_INPUTS_LEAKAGE_SAFE','STRONG_COMPARISON_BASELINES_BOUND','PREREGISTRATION_COMPLETE','UNUSED_SEALED_LINEAGE_CONFIRMED'];
  const blockers=required.filter(k=>gates[k]!==true);
  if(blockers.length) throw Error('SEALED_GENERATION_FORBIDDEN: '+blockers.join(', '));
  return true;
}
