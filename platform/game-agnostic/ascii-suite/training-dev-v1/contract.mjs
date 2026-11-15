// Pure inference boundary: never imports filesystem, simulator or evaluator.
import {hash,clone} from '../v3/common.mjs';
export const SCHEMA='SENTINEL_EXPERIENCE_TRANSITION_V1';
export const SOURCES=['CANONICAL_EXPERT_ACTION','CANONICAL_EXPERT_EVIDENCE_CONSUMED','EXPERIMENTAL_TRAINED_POLICY_ACTION','PRIME_SYNTHESIS_ACTION','BOUNDED_PLANNER_FALLBACK','LEGACY_GAME_PLANNER','RULE_BASED_PARTNER','MANUAL_ACTION','INVALID_OR_UNKNOWN'];
const forbidden=new Set(['seed','rng','deck','grid','conditionalActionValues','conditionalRegret','optimalActionSet','counterfactualOutcomes','catastropheLabels','teacherRecommendation','labels','evaluator']);
export function noPrivate(v,path='input'){
  if(!v||typeof v!=='object')return;
  for(const[k,x]of Object.entries(v)){if(forbidden.has(k))throw Error('PRIVILEGED_FIELD:'+path+'.'+k);noPrivate(x,path+'.'+k);}
}
export function validateInput(p){
  if(Object.keys(p).some(k=>!['schema','binding','observation','actions','receiptTick','observationAge','sensor','objective'].includes(k)))throw Error('UNKNOWN_INFERENCE_FIELD');
  noPrivate(p);if(!p.observation||!Array.isArray(p.actions)||!p.binding)throw Error('INVALID_PUBLIC_PACKET');
  if(hash(p.observation)!==p.binding.observationHash||hash(p.actions)!==p.binding.actionsHash)throw Error('PUBLIC_PACKET_HASH_MISMATCH');
  if(p.observation.game==='cards'&&!p.observation.missing)for(const c of p.observation.hands[p.observation.viewer].cards)if(!c.concealed||'category'in c||'rank'in c)throw Error('OWN_CARD_IDENTITY_LEAK');
  return true;
}
export function transition({episodeId,worldId,environmentVersion,difficulty,seedLineage,packet:p,decision:d,next,terminal,policyVersion,modelWeightHash=null,memory}){
  validateInput(p);noPrivate(next);
  if(!SOURCES.includes(d.source)||!p.actions.some(a=>a.id===d.action.id))throw Error('UNATTRIBUTED_OR_ILLEGAL_ACTION');
  return {schema:SCHEMA,transitionId:hash([episodeId,p.receiptTick,p.binding.actor]),episodeId,worldId,environmentVersion,difficulty,seedLineage,
    observationId:hash([episodeId,p.binding.actor,p.binding.tick]),observationHash:p.binding.observationHash,observationTick:p.binding.tick,receiptTick:p.receiptTick,observationAge:p.observationAge,
    legalActionSet:clone(p.actions),objective:clone(p.objective??null),qualifiedExpertOutputs:[],evidenceReferences:d.evidenceReferences??[],
    observation:clone(p.observation),beliefState:d.beliefs??null,uncertaintySemantics:d.uncertaintySemantics??'NOT_CALIBRATED',
    selectedAction:clone(d.action),selectedActionSource:d.source,fallbackReason:d.fallbackReason??null,
    memoryReadReferences:memory?.reads??null,memoryWriteReferences:memory?.writes??null,
    subsequentObservation:clone(next),observedOutcome:clone(next.events??[]),terminalStatus:terminal,riskEvents:null,
    policyVersion,modelWeightHash};
}
