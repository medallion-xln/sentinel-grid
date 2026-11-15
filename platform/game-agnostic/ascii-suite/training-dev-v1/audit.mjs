import {INVENTORY,legacySmoke} from '../../stage3h-canonical-v1/audit.mjs';
import {createWorld,packet,step,actorId,getMetrics} from '../v3/kernel.mjs';
import {controllerState,decide} from '../v3/controllers.mjs';
import {sentinelState,sentinelDecide,nativeEvidence} from '../v31/sentinel.mjs';
import {createGame,observe,stepGame,metricsOf,legalActions} from '../games.mjs';
import {createController} from '../controllers/index.mjs';
import {hash} from '../v3/common.mjs';
export function qualifications(){return{
  inventory:INVENTORY.map(r=>({...r,ASCII_STATUS:['Alexandria','Forge','Archimedes'].includes(r.expertId)?'NOT_QUALIFIED_MISSING_EXECUTABLE':r.expertId==='Picasso'?'NOT_APPLICABLE_CREATIVE_TASK_ABSENT':'NOT_QUALIFIED_ASCII_ACTION_INTERFACE',trainableParameters:r.expertId==='Vanguard'||r.expertId==='Horizon'?'NATIVE_NEURAL_PARAMETERS_EXIST; FROZEN_WEIGHTS_NOT_TRAINED_HERE':r.expertId==='Nexus'||r.expertId==='Oracle'?'DETERMINISTIC_ENGINE; NO_LEARNED_WEIGHTS':'NOT_ESTABLISHED',faithfulAdapter:r.expertId==='Vanguard'||r.expertId==='Horizon'?'NATIVE_COLONY_SMOKE_ONLY':r.expertId==='Nexus'?'INHERITED_FORGE_BINDING_RETAINED; ASCII_REPAIR_SELECTOR_UNQUALIFIED':r.expertId==='Oracle'?'PUBLIC_TEMPORAL_EVIDENCE_ONLY':'NONE_QUALIFIED_FOR_ASCII'})),
  nativeInterface:legacySmoke(),asciiTrainingDetected:false,canonicalWeightUpdates:false,existingOfflineTraining:'public_html/azl/azl-nn.js#trainExample/trainBatch and workers/azl-training.worker.js exist for native colony models; not wired to ASCII 3.1 and not executed or changed here',
  qualificationGate:'Native execution is not competence or ASCII action qualification. No qualified canonical expert demonstration population exists.',
};}
export function auditGame(game,difficulty,seed){
  const legacy=['pong','platformer','fighter','racing'].includes(game);let w=legacy?createGame(game,{seed,difficulty}):createWorld(game,seed,difficulty,{players:2});
  const initial=structuredClone(w),records=[],state=legacy?{history:[],calls:0}:sentinelState(),old=legacy?createController(game,'SENTINEL'):null,partners=new Map();
  const counts={NexusCalls:0,OracleCalls:0,qualifiedActions:0,nativeEvidenceConsumed:0,unqualifiedNativeActions:0,recommendationsChangedAction:0,PrimeActionChanges:0,plannerActions:0,partnerActions:0,learnedInference:0,memoryReads:null,memoryWrites:null,oracleHistoryWrites:0};
  const sources={};let oracleSufficient=0;
  while(!w.terminal){let action,source;const before=hash(w);
    if(legacy){const d=old.decide(w);if(!legalActions(w).includes(d.action))throw Error('LEGACY_CONTROLLER_ILLEGAL_ACTION');nativeEvidence(observe(w),state);action=d.action;source='LEGACY_GAME_PLANNER';counts.NexusCalls++;counts.OracleCalls++;counts.oracleHistoryWrites++;counts.plannerActions++;w=stepGame(w,action);}
    else{const actor=actorId(w),p=packet(w,actor);
      if(game==='cards'&&actor!=='P0'){const s=partners.get(actor)??controllerState('RULE_BASELINE'),d=decide(p,s);partners.set(actor,d.state);action=d.action;source='RULE_BASED_PARTNER';counts.partnerActions++;}
      else{const comparator=decide(p,state.planner),d=sentinelDecide(p,state);Object.assign(state,d.state);action=d.action;counts.NexusCalls++;counts.OracleCalls++;counts.oracleHistoryWrites++;
        if(d.integration.actionSource==='NEXUS_RELATIONAL_SELECTOR_V1'){counts.nativeEvidenceConsumed++;counts.unqualifiedNativeActions++;counts.recommendationsChangedAction+=+(action.id!==comparator.action.id);source='INVALID_OR_UNKNOWN_UNQUALIFIED_NATIVE_SELECTOR';}
        else{source='BOUNDED_PLANNER_FALLBACK';counts.plannerActions++;}
        oracleSufficient+=+(state.history.length>=3);
      }w=step(w,actor,action);
    }
    sources[source]=(sources[source]??0)+1;records.push({before,action,after:hash(w),source});
  }
  let r=initial;for(const rec of records){if(hash(r)!==rec.before)throw Error('AUDIT_REPLAY_BEFORE');r=legacy?stepGame(r,rec.action):step(r,actorId(r),rec.action);if(hash(r)!==rec.after)throw Error('AUDIT_REPLAY_AFTER');}
  return{game,difficulty,seed,terminal:w.result,ticks:w.tick,counts,sources,metrics:legacy?metricsOf(w):getMetrics(w),exactReplay:true,
    evidenceRoles:{Nexus:'FACTORY_REPAIR_SELECTOR_ONLY; OTHER_CALLS_ADVISORY',Oracle:'ADVISORY_NOT_CONSUMED_BY_ACTION_SELECTOR',OracleUsableHistoryInvocations:oracleSufficient,Prime:'NOT_INVOKED'},
    trainingEligibility:'OBSERVATION_ONLY_PLANNER_DEMONSTRATION_NOT_CANONICAL_EXPERT',memoryInstrumentation:'Selected-action memory reads/writes not instrumented in inherited planners; null, not zero. Oracle history append count is separately known.',
    failureCategory:w.result==='SUCCESS'||w.result==='WIN'?'NONE':w.result};
}
