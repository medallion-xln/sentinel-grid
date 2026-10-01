// STAGE_3G_8 OBJECTIVE_PROGRESS_V1. Offline R0 projection of already-delivered observation content.
// Reads only ObservationPacket.metadata.objectives. No kernel, successor, reward, oracle or private import.
import {deepFreeze,sha256,stableStringify} from '../src/core/determinism.js';

export const OBJECTIVE_PROGRESS_ID='OBJECTIVE_PROGRESS_V1';
const f=(field,provenance,source,derivation=null)=>({field,provenance,source,derivation});
/** Every projected field, with its epistemic class (E0 observed, E1 deterministic derivation of E0 fields only). */
export const OBJECTIVE_PROGRESS_FIELDS=deepFreeze([
 f('OBJECTIVE_HANDLE','E0','ObservationPacket.metadata.objectives[].id (opaque handle; no derivation reads its characters)'),
 f('OBJECTIVE_ENTITY','E0','ObservationPacket.metadata.objectives[].entityId (opaque handle)'),
 f('OBJECTIVE_REQUIRED_AMOUNT','E0','ObservationPacket.metadata.objectives[].requiredValue'),
 f('OBJECTIVE_DELIVERED_AMOUNT','E0','ObservationPacket.metadata.objectives[].deliveredValue'),
 f('OBJECTIVE_REMAINING_AMOUNT','E1','required - min(required, delivered)',['OBJECTIVE_REQUIRED_AMOUNT','OBJECTIVE_DELIVERED_AMOUNT']),
 f('OBJECTIVE_COMPLETION_FRACTION','E1','min(required, delivered) / required; 1 when required <= 0',['OBJECTIVE_REQUIRED_AMOUNT','OBJECTIVE_DELIVERED_AMOUNT']),
 f('OBJECTIVE_COMPLETE','E1','remaining = 0',['OBJECTIVE_REMAINING_AMOUNT']),
]);
/** Candidate-relative columns appended to the frozen Stage 3G.7 head. Row-constant aggregates cancel in a per-row softmax and are not columns. */
export const OBJECTIVE_PROGRESS_COLUMNS=deepFreeze(['targetRequired','targetDelivered','targetRemaining','targetCompletionFraction','targetRemainingShare','targetIncompleteObjective']);
export const OBJECTIVE_PROGRESS_SCHEMA=deepFreeze({schemaId:OBJECTIVE_PROGRESS_ID,schemaVersion:1,authority:'R0',
 input:'ObservationPacket.metadata.objectives only: the packet the live adapter already delivers. No new disclosure.',
 fields:OBJECTIVE_PROGRESS_FIELDS,columns:OBJECTIVE_PROGRESS_COLUMNS,
 perEntity:'Objectives are aggregated by entity handle: required, delivered and remaining sum; completion = min(required,delivered) summed over required summed.',
 notInferred:['future delivery','collected quantity','delivery success of any future action','objective completion at any future tick'],
 replaces:'Stage 3G.7 entity projection kept only objectiveFlag. Every metadata.objectives field is now projected; reconstructObjectives() is its exact inverse.',
 equivariance:'Invariant under the D4 presentation transforms and consistent identity renaming; independent of candidate order.'});
export const OBJECTIVE_PROGRESS_SCHEMA_HASH=sha256(OBJECTIVE_PROGRESS_SCHEMA);

const num=v=>{if(typeof v!=='number'||!Number.isFinite(v))throw Error('OBJECTIVE_PROGRESS: non-finite observed amount');return v;};
const completion=(r,d)=>r<=0?1:Math.min(r,d)/r;
/** Project metadata.objectives. Fails closed on malformed entries; never fabricates a missing objective. */
export function projectObjectiveProgress(observation){
 const raw=observation?.metadata?.objectives;if(!Array.isArray(raw))throw Error('OBJECTIVE_PROGRESS: objectives not observed');
 const objectives=raw.map(o=>{if(typeof o.id!=='string'||typeof o.entityId!=='string')throw Error('OBJECTIVE_PROGRESS: malformed handle');const required=num(o.requiredValue),delivered=num(o.deliveredValue),remaining=required-Math.min(required,delivered);
  return {objectiveHandle:o.id,objectiveEntity:o.entityId,required,delivered,remaining,completionFraction:completion(required,delivered),complete:remaining===0,provenance:{required:'E0',delivered:'E0',remaining:'E1',completionFraction:'E1',complete:'E1'}};});
 const byEntity={};for(const o of objectives){const e=byEntity[o.objectiveEntity]??={required:0,delivered:0,remaining:0,counted:0,objectives:0};e.required+=o.required;e.delivered+=o.delivered;e.remaining+=o.remaining;e.counted+=Math.min(o.required,o.delivered);e.objectives++;}
 for(const e of Object.values(byEntity)){e.completionFraction=e.required<=0?1:e.counted/e.required;delete e.counted;}
 const totals={required:objectives.reduce((a,o)=>a+o.required,0),delivered:objectives.reduce((a,o)=>a+o.delivered,0),remaining:objectives.reduce((a,o)=>a+o.remaining,0),incomplete:objectives.filter(o=>!o.complete).length,count:objectives.length};
 totals.completionFraction=totals.required<=0?1:objectives.reduce((a,o)=>a+Math.min(o.required,o.delivered),0)/totals.required;
 return deepFreeze({schemaId:OBJECTIVE_PROGRESS_ID,objectives,byEntity,totals});
}
/** Exact inverse: the projection loses no metadata.objectives content. */
export function reconstructObjectives(p){return p.objectives.map(o=>({id:o.objectiveHandle,entityId:o.objectiveEntity,requiredValue:o.required,deliveredValue:o.delivered}));}
export function projectionLoss(observation){const raw=observation.metadata.objectives,back=reconstructObjectives(projectObjectiveProgress(observation));return stableStringify(raw)!==stableStringify(back);}
/** Candidate-relative columns for a root action (targetEntityId or target.id). Zero for untargeted or non-objective targets. */
export function objectiveProgressColumns(progress,root){const id=root.targetEntityId??root.target?.id??null,e=id===null?null:progress.byEntity[id];if(!e)return [0,0,0,0,0,0];return [e.required,e.delivered,e.remaining,e.completionFraction,progress.totals.remaining>0?e.remaining/progress.totals.remaining:0,e.remaining>0?1:0];}
