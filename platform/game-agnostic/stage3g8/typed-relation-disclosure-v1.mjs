// STAGE_3G_8 TYPED_RELATION_DISCLOSURE_CANDIDATE_V1. PROSPECTIVE, AUDIT-ONLY. Not runtime-approved.
// Consumes an observable view plus a candidate disclosure object {relations:[{from,to,type}]}. It never reads a kernel
// world: the only producer of the candidate is typed-relation-source.mjs (audit side). No kernel/private/oracle imports.
import {deepFreeze,sha256,stableStringify} from '../src/core/determinism.js';
import {FORGE_RELATION_TYPES,FORGE_RELATION_TYPE_NAMES} from '../src/forge/contract.js';
import {DECLARED_ACTION_COST_MODEL} from '../src/stage3f/deployable-action-proposal-v1.js';
import {MOVE_DELTAS,pathDistances,ENTITY_CLASSES,ENTITY_CLASS_NAMES} from '../src/stage3g/observable-entity-state-v1.js';
import {TYPES,initialLedger,compose} from '../src/stage3g/observable-action-surface-v1.js';
import {maskInputs,eligibility,UNKNOWN} from '../src/stage3g7/target-eligibility-contract-v1.js';
export {UNKNOWN};

export const TYPED_RELATION_DISCLOSURE_ID='TYPED_RELATION_DISCLOSURE_CANDIDATE_V1';
/** Coarse Nexus kind -> canonical Forge relation types collapsed into it before adapter delivery. */
export const COLLAPSE_GROUPS=deepFreeze(Object.fromEntries([...new Set(Object.values(FORGE_RELATION_TYPES).map(x=>x.nexusKind))].sort().map(k=>[k,FORGE_RELATION_TYPE_NAMES.filter(t=>FORGE_RELATION_TYPES[t].nexusKind===k)])));
const audit=(field,o)=>({field,...o});
/** Phase 5 field-level safety declaration. Each claim is verified by tests and the certifier, not asserted alone. */
export const DISCLOSURE_FIELD_AUDIT=deepFreeze([
 audit('relation.from',{IS_CURRENTLY_OBSERVABLE_IN_ENVIRONMENT:true,IS_CURRENTLY_DROPPED_BEFORE_ADAPTER_OUTPUT:false,IS_PRIVILEGED:false,DOES_IT_REVEAL_HIDDEN_HEALTH:false,DOES_IT_REVEAL_FUTURE_STATE:false,DOES_IT_REVEAL_ORACLE_INFORMATION:false,basis:'canonicalState.relationships[].from is already delivered'}),
 audit('relation.to',{IS_CURRENTLY_OBSERVABLE_IN_ENVIRONMENT:true,IS_CURRENTLY_DROPPED_BEFORE_ADAPTER_OUTPUT:false,IS_PRIVILEGED:false,DOES_IT_REVEAL_HIDDEN_HEALTH:false,DOES_IT_REVEAL_FUTURE_STATE:false,DOES_IT_REVEAL_ORACLE_INFORMATION:false,basis:'canonicalState.relationships[].to is already delivered'}),
 audit('relation.type',{IS_CURRENTLY_OBSERVABLE_IN_ENVIRONMENT:true,IS_CURRENTLY_DROPPED_BEFORE_ADAPTER_OUTPUT:true,IS_PRIVILEGED:false,DOES_IT_REVEAL_HIDDEN_HEALTH:false,DOES_IT_REVEAL_FUTURE_STATE:false,DOES_IT_REVEAL_ORACLE_INFORMATION:false,basis:'Forge world.relations[].type is current structural state; the Forge presentation layer renders it (render.js renderRelations: "from --type--> to"); kernel observe() maps it to FORGE_RELATION_TYPES[type].nexusKind before the packet. Relations change only by BYPASS dependsOn rewiring of the current state; no value/health/flag/channel/oracle field is read.'}),
]);
export const TYPED_RELATION_COLUMNS=deepFreeze([...FORGE_RELATION_TYPE_NAMES.map(t=>'in:'+t),...FORGE_RELATION_TYPE_NAMES.map(t=>'out:'+t),'liveTypedSubstitutesIn','bypassSubstituteResolved','bypassSubstituteThreatened','bypassSubstituteCritical','bypassSubstituteDependentsAfter']);
export const TYPED_RELATION_DISCLOSURE_SCHEMA=deepFreeze({schemaId:TYPED_RELATION_DISCLOSURE_ID,schemaVersion:1,status:'PROSPECTIVE_AUDIT_ONLY',runtimeApproved:false,liveAdapterChanged:false,authority:'R0',
 record:{from:'opaque entity handle',to:'opaque entity handle',type:'canonical Forge relation type (FORGE_RELATION_TYPE_NAMES)'},canonicalTypes:FORGE_RELATION_TYPE_NAMES,collapseGroups:COLLAPSE_GROUPS,
 rule:'Exactly the current world.relations, with type retained. Mapping every record through FORGE_RELATION_TYPES[type].nexusKind must reproduce the delivered canonicalState.relationships multiset exactly; otherwise the candidate is rejected. Nothing is invented and no relation is added or removed.',
 fieldAudit:DISCLOSURE_FIELD_AUDIT,columns:TYPED_RELATION_COLUMNS,
 bypassRule:'Kernel substituteFor: substitutes edges into the failed target whose source is available && health>0, lexically lowest identity. available && health>0 is exactly the rendered in-service bit already observed, so typed edges plus observed service identify the substitute at t0.',
 searchRule:'Continuation BYPASS is generated only from typed dependsOn edges and only where a substitutes edge into the failed target exists. Relations change only by BYPASS rewiring dependsOn, so absence of a substitutes edge is exact current structure, not a prediction. Substitute liveness after t0 stays UNKNOWN.',
 notDisclosed:['individual health','available flag','planned flag','acceptsMaterial','protected flag','resource quantity/value','future survival','future eligibility','terminal state']});
export const TYPED_RELATION_DISCLOSURE_SCHEMA_HASH=sha256(TYPED_RELATION_DISCLOSURE_SCHEMA);

const targetId=a=>a.targetEntityId??a.target?.id??null;
const sortRel=(a,b)=>{const ka=`${a.kind} ${a.from} ${a.to}`,kb=`${b.kind} ${b.from} ${b.to}`;return ka<kb?-1:ka>kb?1:0;};
/** Reject a candidate that is not an exact refinement of the delivered coarse relationships. */
export function verifyDisclosure(observation,disclosure){
 if(!disclosure||!Array.isArray(disclosure.relations))return {consistent:false,reason:'MISSING'};
 for(const r of disclosure.relations){if(!FORGE_RELATION_TYPE_NAMES.includes(r.type))return {consistent:false,reason:'UNKNOWN_TYPE'};if(Object.keys(r).sort().join()!=='from,to,type')return {consistent:false,reason:'EXTRA_FIELD'};}
 const coarse=disclosure.relations.map(r=>({from:r.from,to:r.to,kind:FORGE_RELATION_TYPES[r.type].nexusKind})).sort(sortRel);
 const delivered=[...observation.metadata.canonicalState.relationships].map(r=>({from:r.from,to:r.to,kind:r.kind})).sort(sortRel);
 return stableStringify(coarse)===stableStringify(delivered)?{consistent:true}:{consistent:false,reason:'NOT_A_REFINEMENT'};
}
const serviceOf=view=>new Map(view.visibleMap.entities.map(e=>[e.id,e.inService]));
/** t0 substitute under the disclosed types: lexical lowest in-service typed substitute, or UNKNOWN when none. */
export function typedSubstitute(view,disclosure,failedId){const svc=serviceOf(view);return disclosure.relations.filter(r=>r.type==='substitutes'&&r.to===failedId&&svc.get(r.from)===true).map(r=>r.from).sort()[0]??UNKNOWN;}
/** Coarse identifiability: the delivered contract determines the substitute only if exactly one in-service supports source exists. */
export function coarseSubstitute(view,failedId){const svc=serviceOf(view),c=[...new Set(view.observation.metadata.canonicalState.relationships.filter(r=>r.kind==='supports'&&r.to===failedId&&svc.get(r.from)===true).map(r=>r.from))].sort();return c.length===1?c[0]:UNKNOWN;}

export function typedRelationColumns(view,disclosure,root){
 const id=targetId(root),R=disclosure.relations,svc=serviceOf(view),byId=new Map(view.state.entities.map(e=>[e.entityId,e]));
 const counts=dir=>FORGE_RELATION_TYPE_NAMES.map(t=>id===null?0:R.filter(r=>r.type===t&&(dir==='in'?r.to:r.from)===id).length);
 const live=id===null?0:R.filter(r=>r.type==='substitutes'&&r.to===id&&svc.get(r.from)===true).length;
 let sub=[0,0,0,0];if(root.actionType==='BYPASS'){const s=typedSubstitute(view,disclosure,id);if(s!==UNKNOWN){const e=byId.get(s);sub=[1,e?.threatenedFlag?1:0,e?.criticalFlag?1:0,R.filter(r=>r.type==='dependsOn'&&r.to===s).length+1];}}
 return [...counts('in'),...counts('out'),live,...sub];
}

// The two functions below reproduce Stage 3G.7 conditionalSurface/qualifiedSearch (ablation=null) exactly when
// disclosure is null; tests and the certifier verify that parity against the frozen module on every evidence row.
function conditionalSurface(state,map,l,disclosure){if(l.remaining<=0)return [];const out=[],put=(type,id=null,parameters={})=>{const a={actionType:type,actorId:state.actor.entityId,targetEntityId:id,parameters};const q=eligibility(state,a,[],{future:true,ledger:l});if(q.referenceStatus!=='INELIGIBLE')out.push({...a,eligibility:'UNKNOWN'});};put('WAIT');const d=pathDistances(map,l.position);for(const [name,[dx,dy]]of Object.entries(MOVE_DELTAS)){const p={x:l.position.x+dx,y:l.position.y+dy};if(p.x>=0&&p.y>=0&&p.x<map.width&&p.y<map.height&&d[p.y*map.width+p.x]===1){put('MOVE',null,{direction:name});if(state.entities.some(e=>e.entityKind==='HOSTILE'))put('RETREAT',null,{toX:p.x,toY:p.y});}}
 for(const e of state.entities){for(const type of ['COLLECT','TRANSFER','PROTECT','RESTORE','REINFORCE','REPAIR','ATTACK','BUILD'])put(type,e.entityId);
  if(disclosure===null){for(const r of e.observedRelationships.filter(r=>r.role==='TO'&&r.kind==='depends'))put('BYPASS',e.entityId,{dependent:r.otherEntityId});}
  else if(disclosure.relations.some(r=>r.type==='substitutes'&&r.to===e.entityId)){for(const r of disclosure.relations.filter(r=>r.type==='dependsOn'&&r.to===e.entityId).sort((a,b)=>a.from<b.from?-1:a.from>b.from?1:0))put('BYPASS',e.entityId,{dependent:r.from});}}
 return out;}
export function typedSearch(state,map,root,depth,{budget=512,disclosure=null}={}){
 if(!Number.isInteger(depth)||depth<0||depth>3||budget<1)throw Error('SEARCH_LIMIT');const transition=(l,a)=>compose(l,a,state);let leaves=[transition(initialLedger(state),root)],generated=1,truncated=false,expandedDepth=0,pruned=0;const layers=[1];
 for(let i=0;i<depth;i++){const next=[];for(const l of leaves){const acts=conditionalSurface(state,map,l,disclosure);if(disclosure!==null)pruned+=conditionalSurface(state,map,l,null).length-acts.length;if(!acts.length)next.push(l);for(const a of acts){next.push(transition(l,a));if(next.length>budget)break;}if(next.length>budget)break;}generated+=next.length;layers.push(next.length);if(next.length>budget){truncated=true;break;}if(!next.length)break;leaves=next;expandedDepth=i+1;}
 const cache=new Map(),dist=l=>{const key=stableStringify([l.position,Object.keys(l.service).filter(k=>l.service[k]===false).sort()]);if(!cache.has(key)){const rm={...map,entities:map.entities.map(e=>({...e,inService:l.service[e.id]===false?false:e.inService}))};cache.set(key,pathDistances(rm,l.position));}return cache.get(key);};
 const nearest=l=>ENTITY_CLASS_NAMES.map(k=>{const ds=dist(l),v=state.entities.filter(e=>ENTITY_CLASSES[k](e)&&l.service[e.entityId]!==false).map(e=>ds[e.observedPosition.y*map.width+e.observedPosition.x]).filter(x=>x>=0);return v.length?Math.min(...v):map.width*map.height;});
 const start=nearest(initialLedger(state)),ends=leaves.map(nearest),mean=f=>leaves.map(f).sort((a,b)=>a-b).reduce((a,b)=>a+b,0)/leaves.length;
 const f=[...ENTITY_CLASS_NAMES.map((k,i)=>k==='HOSTILE'?Math.max(...ends.map(x=>x[i]))-start[i]:start[i]-Math.min(...ends.map(x=>x[i]))),Math.log(1+leaves.length),mean(l=>l.costSum),Math.max(...leaves.map(l=>l.costSum)),mean(l=>l.energy),mean(l=>l.collectionCount),mean(l=>l.deliveryCount),mean(l=>l.protectionCount),mean(l=>l.dependencyCount),mean(l=>l.carried===UNKNOWN?1:0),mean(l=>l.targetCount/l.steps),truncated?1:0,mean(l=>l.steps>1?1:0)];
 return {features:f,audit:{generated,retained:leaves.length,expandedDepth,truncated,layers,merges:0,guaranteedFutureBranches:0,unknownFutureBranches:Math.max(0,generated-1),prunedBypassBranches:pruned}};
}
/** Stage 3G.7 QUALIFIED_512 columns (disclosure=null: identical to the frozen observableColumns) or the typed-search variant. */
export function baseColumns(view,root,{disclosure=null,depth=2,budget=512}={}){
 const z=maskInputs(view.state,view.visibleMap,view.surface.map(x=>x.action),null),s=z.state,e=s.entities.find(e=>e.entityId===targetId(root));
 const base=[...TYPES.map(t=>root.actionType===t?1:0),DECLARED_ACTION_COST_MODEL.cost[root.actionType],s.actor.energy,s.actor.carriedMaterial,s.actor.ticksRemaining,e?.criticalFlag?1:0,e?.objectiveFlag?1:0,e?.hostileFlag?1:0,e?.inService?1:0,0,e?.relativeDistance.manhattan??0,e?.relativeDistance.path??0,e?.observedRelationships.length??0,...(z.derived[targetId(root)]??Array(12).fill(0))];
 const plan=typedSearch(s,z.map,root,depth,{budget,disclosure});return {features:[...base,...plan.features],audit:plan.audit};
}
/** Root ledger with the disclosed t0 substitute recorded for BYPASS (audit; never a feature beyond typedRelationColumns). */
export function typedRootLedger(view,disclosure,root){const l=compose(initialLedger(view.state),root,view.state);if(root.actionType==='BYPASS'&&disclosure){const s=typedSubstitute(view,disclosure,targetId(root));l.rewiring[0]={...l.rewiring[0],substitute:s,provenance:s===UNKNOWN?'UNKNOWN':'PROSPECTIVE_TYPED_RELATION_PLUS_OBSERVED_SERVICE_T0'};}return l;}
