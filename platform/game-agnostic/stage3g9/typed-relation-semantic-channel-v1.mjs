// STAGE_3G_9 TYPED_RELATION_SEMANTIC_CHANNEL_V1. Offline R0. Typed relations enter ONLY the deterministic
// semantic/search layer: BYPASS substitute resolution, dependency rewiring and conditional continuation branches.
// Root-scoring columns, objective columns, model dimensionality, training data and coefficients are untouched.
// Consumes an observable view and a verified TYPED_RELATION_DISCLOSURE_CANDIDATE_V1 object; never reads a kernel world.
import {deepFreeze,sha256,stableStringify} from '../src/core/determinism.js';
import {DECLARED_ACTION_COST_MODEL} from '../src/stage3f/deployable-action-proposal-v1.js';
import {MOVE_DELTAS,pathDistances,ENTITY_CLASSES,ENTITY_CLASS_NAMES} from '../src/stage3g/observable-entity-state-v1.js';
import {TYPES,initialLedger,compose} from '../src/stage3g/observable-action-surface-v1.js';
import {maskInputs,eligibility,UNKNOWN} from '../src/stage3g7/target-eligibility-contract-v1.js';
import {TYPED_RELATION_DISCLOSURE_SCHEMA_HASH} from '../stage3g8/typed-relation-disclosure-v1.mjs';
export {UNKNOWN};

export const SEMANTIC_CHANNEL_ID='TYPED_RELATION_SEMANTIC_CHANNEL_V1';
export const ROOT_COLUMN_COUNT=36,SEARCH_COLUMN_COUNT=18;
export const SEMANTIC_CHANNEL_SCHEMA=deepFreeze({schemaId:SEMANTIC_CHANNEL_ID,schemaVersion:1,authority:'R0',status:'OFFLINE_SEMANTIC_ONLY',runtimeApproved:false,liveAdapterChanged:false,
 input:{disclosure:'TYPED_RELATION_DISCLOSURE_CANDIDATE_V1 (prospective, audit-only), verified as an exact refinement of the delivered coarse relations',disclosureSchemaHash:TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,observed:'in-service bit and positions from the observable view'},
 mayAlter:['BYPASS substitute resolution','dependency rewiring in the conditional ledger','conditional continuation branch semantics (which BYPASS branches exist)'],
 mustNotAlter:['the 36 root-state scoring columns','objective-progress columns','state interactions','learned model dimensionality','training data','trained coefficients'],
 rules:{rootSubstitute:'Root BYPASS at t0: lexically lowest typed substitute of the failed target whose source is observed in service (= available && health>0, the kernel substituteFor predicate). Exact.',
  continuationSubstitute:'Continuation BYPASS: if exactly one typed substitutes edge enters the failed target, the substitute is that source conditional on the branch being legal; otherwise UNKNOWN. Future liveness is never asserted.',
  rewiring:'Every BYPASS removes the (dependent -> failed) dependsOn edges from the ledger graph (exact: the kernel removes them); when the substitute is known the (dependent -> substitute) edge is added.',
  branches:'A continuation BYPASS exists only for a ledger dependsOn edge into a target with at least one typed substitutes edge. Relations change only by BYPASS rewiring, so absence is exact current structure.',
  unknown:'Every continuation branch keeps UNKNOWN legality/survival/terminal status; guaranteedFutureBranches=0.'}});
export const SEMANTIC_CHANNEL_SCHEMA_HASH=sha256(SEMANTIC_CHANNEL_SCHEMA);

const targetId=a=>a.targetEntityId??a.target?.id??null;
const byFrom=(a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:0;
const serviceMap=view=>new Map(view.visibleMap.entities.map(e=>[e.id,e.inService]));
/** t0 root substitute (exact) under the kernel rule. */
export function rootSubstitute(disclosure,service,failed){return disclosure.relations.filter(r=>r.type==='substitutes'&&r.to===failed&&service.get(r.from)===true).map(r=>r.from).sort()[0]??UNKNOWN;}
function continuationSubstitute(disclosure,failed){const s=[...new Set(disclosure.relations.filter(r=>r.type==='substitutes'&&r.to===failed).map(r=>r.from))];return s.length===1?s[0]:UNKNOWN;}
/** Apply one BYPASS to the ledger dependency graph. */
function rewire(edges,dependent,failed,substitute){const out=edges.filter(e=>!(e.from===dependent&&e.to===failed));if(substitute!==UNKNOWN)out.push({from:dependent,to:substitute});return out.sort(byFrom);}
export function initialSemanticLedger(state,disclosure){const l=initialLedger(state);l.dependsOn=disclosure.relations.filter(r=>r.type==='dependsOn').map(r=>({from:r.from,to:r.to})).sort(byFrom);return l;}
/** One semantic transition: declared-cost E1 compose plus exact rewiring. */
export function semanticCompose(l,a,state,disclosure,service){const n=compose(l,a,state);if(a.actionType==='BYPASS'){const failed=targetId(a),dependent=a.parameters?.dependent,s=l.steps===0?rootSubstitute(disclosure,service,failed):continuationSubstitute(disclosure,failed),last=n.rewiring.length-1;n.rewiring[last]={...n.rewiring[last],substitute:s,provenance:s===UNKNOWN?'UNKNOWN':l.steps===0?'SEMANTIC_T0_EXACT':'SEMANTIC_CONDITIONAL_ON_LEGALITY'};n.dependsOn=rewire(n.dependsOn,dependent,failed,s);}return n;}
function conditionalSurface(state,map,l,disclosure){if(l.remaining<=0)return [];const out=[],put=(type,id=null,parameters={})=>{const a={actionType:type,actorId:state.actor.entityId,targetEntityId:id,parameters};const q=eligibility(state,a,[],{future:true,ledger:l});if(q.referenceStatus!=='INELIGIBLE')out.push({...a,eligibility:'UNKNOWN'});};put('WAIT');const d=pathDistances(map,l.position);for(const [name,[dx,dy]]of Object.entries(MOVE_DELTAS)){const p={x:l.position.x+dx,y:l.position.y+dy};if(p.x>=0&&p.y>=0&&p.x<map.width&&p.y<map.height&&d[p.y*map.width+p.x]===1){put('MOVE',null,{direction:name});if(state.entities.some(e=>e.entityKind==='HOSTILE'))put('RETREAT',null,{toX:p.x,toY:p.y});}}
 for(const e of state.entities){for(const type of ['COLLECT','TRANSFER','PROTECT','RESTORE','REINFORCE','REPAIR','ATTACK','BUILD'])put(type,e.entityId);
  if(disclosure===null){for(const r of e.observedRelationships.filter(r=>r.role==='TO'&&r.kind==='depends'))put('BYPASS',e.entityId,{dependent:r.otherEntityId});}
  else if(disclosure.relations.some(r=>r.type==='substitutes'&&r.to===e.entityId)){for(const r of l.dependsOn.filter(r=>r.to===e.entityId))put('BYPASS',e.entityId,{dependent:r.from});}}
 return out;}
/** Stage 3G.7 qualifiedSearch (ablation=null) with the semantic channel; disclosure=null reproduces the frozen search exactly. */
export function semanticSearch(view,state,map,root,depth,{budget=512,disclosure=null}={}){
 if(!Number.isInteger(depth)||depth<0||depth>3||budget<1)throw Error('SEARCH_LIMIT');const service=serviceMap(view);
 const transition=(l,a)=>disclosure===null?compose(l,a,state):semanticCompose(l,a,state,disclosure,service);const start0=disclosure===null?initialLedger(state):initialSemanticLedger(state,disclosure);
 let leaves=[transition(start0,root)],generated=1,truncated=false,expandedDepth=0;const layers=[1];
 for(let i=0;i<depth;i++){const next=[];for(const l of leaves){const acts=conditionalSurface(state,map,l,disclosure);if(!acts.length)next.push(l);for(const a of acts){next.push(transition(l,a));if(next.length>budget)break;}if(next.length>budget)break;}generated+=next.length;layers.push(next.length);if(next.length>budget){truncated=true;break;}if(!next.length)break;leaves=next;expandedDepth=i+1;}
 const cache=new Map(),dist=l=>{const key=stableStringify([l.position,Object.keys(l.service).filter(k=>l.service[k]===false).sort()]);if(!cache.has(key)){const rm={...map,entities:map.entities.map(e=>({...e,inService:l.service[e.id]===false?false:e.inService}))};cache.set(key,pathDistances(rm,l.position));}return cache.get(key);};
 const nearest=l=>ENTITY_CLASS_NAMES.map(k=>{const ds=dist(l),v=state.entities.filter(e=>ENTITY_CLASSES[k](e)&&l.service[e.entityId]!==false).map(e=>ds[e.observedPosition.y*map.width+e.observedPosition.x]).filter(x=>x>=0);return v.length?Math.min(...v):map.width*map.height;});
 const start=nearest(initialLedger(state)),ends=leaves.map(nearest),mean=f=>leaves.map(f).sort((a,b)=>a-b).reduce((a,b)=>a+b,0)/leaves.length;
 const f=[...ENTITY_CLASS_NAMES.map((k,i)=>k==='HOSTILE'?Math.max(...ends.map(x=>x[i]))-start[i]:start[i]-Math.min(...ends.map(x=>x[i]))),Math.log(1+leaves.length),mean(l=>l.costSum),Math.max(...leaves.map(l=>l.costSum)),mean(l=>l.energy),mean(l=>l.collectionCount),mean(l=>l.deliveryCount),mean(l=>l.protectionCount),mean(l=>l.dependencyCount),mean(l=>l.carried===UNKNOWN?1:0),mean(l=>l.targetCount/l.steps),truncated?1:0,mean(l=>l.steps>1?1:0)];
 return {features:f,audit:{generated,retained:leaves.length,expandedDepth,truncated,layers,merges:0,guaranteedFutureBranches:0,unknownFutureBranches:Math.max(0,generated-1)}};}
/** The established 54 G7 columns: 36 root-state columns (never touched) + 18 search columns from the semantic search. */
export function semanticColumns(view,root,{disclosure=null,depth=2,budget=512}={}){
 const z=maskInputs(view.state,view.visibleMap,view.surface.map(x=>x.action),null),s=z.state,e=s.entities.find(e=>e.entityId===targetId(root));
 const base=[...TYPES.map(t=>root.actionType===t?1:0),DECLARED_ACTION_COST_MODEL.cost[root.actionType],s.actor.energy,s.actor.carriedMaterial,s.actor.ticksRemaining,e?.criticalFlag?1:0,e?.objectiveFlag?1:0,e?.hostileFlag?1:0,e?.inService?1:0,0,e?.relativeDistance.manhattan??0,e?.relativeDistance.path??0,e?.observedRelationships.length??0,...(z.derived[targetId(root)]??Array(12).fill(0))];
 if(base.length!==ROOT_COLUMN_COUNT)throw Error('ROOT_COLUMN_COUNT');const plan=semanticSearch(view,s,z.map,root,depth,{budget,disclosure});if(plan.features.length!==SEARCH_COLUMN_COUNT)throw Error('SEARCH_COLUMN_COUNT');return {features:[...base,...plan.features],audit:plan.audit};}
/** Root BYPASS semantics for audit: exact substitute and the rewired dependsOn graph after the root. */
export function semanticRootBypass(view,disclosure,root){const l=semanticCompose(initialSemanticLedger(view.state,disclosure),root,view.state,disclosure,serviceMap(view));return {substitute:l.rewiring[0].substitute,dependsOn:l.dependsOn};}
