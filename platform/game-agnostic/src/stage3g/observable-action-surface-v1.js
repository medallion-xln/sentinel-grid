import {deepFreeze,sha256,stableStringify} from '../core/determinism.js';
import {ACTION_SEMANTICS_CONTRACT,ACTION_SEMANTICS_SCHEMA_HASH} from './action-semantics-v1.js';
import {ACTION_MODEL_SCHEMA_HASH} from './deployable-action-model-v1.js';
import {DECLARED_ACTION_COST_MODEL} from '../stage3f/deployable-action-proposal-v1.js';
import {MOVE_DELTAS,pathDistances,ENTITY_CLASS_NAMES,ENTITY_CLASSES,terrainAt} from './observable-entity-state-v1.js';
export const UNKNOWN='UNKNOWN';
export const TYPES=Object.freeze(Object.keys(ACTION_SEMANTICS_CONTRACT));
const implemented=new Set(['ACTOR_DISPLACEMENT','ENERGY_DELTA','TICK_ADVANCE','CARRIED_MATERIAL_TO_ZERO','TARGET_LEAVES_SERVICE','TARGET_PROTECTED','OBJECTIVE_DELIVERY']);
export const ACTION_SURFACE_SCHEMA=deepFreeze({schemaId:'ACTION_SURFACE_V1',actionSemanticsHash:ACTION_SEMANTICS_SCHEMA_HASH,inheritedProjectionHash:ACTION_MODEL_SCHEMA_HASH,
 actions:Object.fromEntries(TYPES.map(t=>[t,{...ACTION_SEMANTICS_CONTRACT[t],declaredCost:DECLARED_ACTION_COST_MODEL.cost[t],inheritedRoot:DECLARED_ACTION_COST_MODEL.cost[t]===0,inheritedContinuation:['MOVE','WAIT'].includes(t),fullRoot:true,fullConditionalContinuation:true,missingInheritedE1:ACTION_SEMANTICS_CONTRACT[t].effects.filter(e=>e.class==='E1'&&!implemented.has(e.effect)).map(e=>e.effect)}])),
 provenance:['OBSERVED','OFFERED_LEGALITY','CERTIFIED_CONTRACT','PRIVILEGED_AUDIT_ONLY','UNAVAILABLE'],effectClasses:['E1','UNKNOWN/EU'],
 root:'All offered symmetric adapter actions; evaluation only at R0. Adapter legalActions exposes target flags through offered metadata. No private legality imported by this module.',
 continuation:'Conditional t0 reference geometry plus E1 ledger, never an actual successor world. Every future action has UNKNOWN legality/survival/terminal status. False reference preconditions prune; unknown metadata branches retained with explicit assumptions.',
 budget:'Whole BFS layers up to 512 sequences per root. If a whole next layer exceeds budget, retain the preceding layer and mark truncation, never select an ordered subset. No merges.',
 identity:'Opaque handles only in relationships except BYPASS substitute lexical contract rule. Nonunique substitution resolution remains UNKNOWN (Nexus relation vocabulary cannot identify all substitutes).',
 features:['nearestReferenceDistanceGain (six classes)','retainedSequences','meanDeclaredCost','maxDeclaredCost','meanEnergyRemaining','collectionCount','deliveryCount','protectionCount','dependencyCount','unknownCarriedFraction','targetActionFraction','truncated','conditionalFraction'],
 unknownPolicy:'CONDITIONAL_DESCRIPTOR; EU remains UNKNOWN; certified finite constraint bounds only. STRICT_ROOT_FALLBACK is fixed sensitivity diagnostic. No dispatch.',authority:'R0'});
export const ACTION_SURFACE_HASH=sha256(ACTION_SURFACE_SCHEMA);
const md=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const actionKey=a=>stableStringify([a.actionType,a.actorId,a.targetEntityId??a.target?.id??null,a.parameters??{}]);
export function rootSurface(offered){const m=new Map();for(const a of offered){if(!TYPES.includes(a.actionType))throw Error('UNSUPPORTED_ACTION_TYPE');m.set(actionKey(a),a);}return [...m.values()];}
export function initialLedger(state){return {position:{...state.actor.observedPosition},energy:state.actor.energy,tick:state.observationTimestamp,carried:state.actor.carriedMaterial,remaining:state.actor.ticksRemaining,service:{},shield:{},delivery:{},rewiring:[],costSum:0,targetCount:0,collectionCount:0,deliveryCount:0,protectionCount:0,dependencyCount:0,steps:0,assumptions:[],actual:{survival:UNKNOWN,terminal:UNKNOWN,legality:UNKNOWN,entityService:UNKNOWN,entityPositions:UNKNOWN}};}
export function compose(ledger,a,state,{ablate=null}={}){const n=structuredClone(ledger),type=a.actionType,id=a.targetEntityId??a.target?.id??null,cost=DECLARED_ACTION_COST_MODEL.cost[type];if(cost===undefined)throw Error('UNKNOWN_COST');
 n.energy=ablate==='cost'?n.energy:n.energy-cost;n.costSum+=ablate==='cost'?0:cost;n.tick++;n.remaining--;n.steps++;
 if(type==='MOVE'&&ablate!=='spatial'){const [dx,dy]=MOVE_DELTAS[a.parameters.direction];n.position={x:n.position.x+dx,y:n.position.y+dy};}
 if(type==='RETREAT'&&ablate!=='spatial')n.position={x:a.parameters.toX,y:a.parameters.toY};
 if(id){n.targetCount++;if(type==='COLLECT'){n.collectionCount++;if(ablate!=='service')n.service[id]=false;if(ablate!=='resource')n.carried=UNKNOWN;}
 if(type==='TRANSFER'&&ablate!=='resource'){n.deliveryCount++;n.delivery[id]=n.carried===UNKNOWN||n.delivery[id]===UNKNOWN?UNKNOWN:(n.delivery[id]??0)+n.carried;n.carried=0;}
 if(type==='PROTECT'&&ablate!=='service'){n.protectionCount++;n.shield[id]=true;}
 if(['RESTORE','BUILD'].includes(type)&&ablate!=='service')n.service[id]=UNKNOWN;
 if(['ATTACK','REPAIR','REINFORCE'].includes(type)&&ablate!=='service')n.service[id]=UNKNOWN;
 if(type==='BYPASS'&&ablate!=='dependency'){n.dependencyCount++;n.rewiring.push({dependent:a.parameters?.dependent??UNKNOWN,failed:id,substitute:UNKNOWN,provenance:'E1_REWIRING_EXISTS_BUT_SPECIFIC_SUBSTITUTE_UNAVAILABLE_FROM_NEXUS_RELATION_KIND'});}}
 if(ledger.steps>0)n.assumptions.push('UNKNOWN_FUTURE_LEGALITY_AND_SURVIVAL');return n;}
function referenceMap(state,map,l){return {...map,entities:map.entities.map(e=>({...e,inService:l.service[e.id]===false?false:e.inService}))};}
export function continuationSurface(state,map,l,{ablate=null}={}){if(l.remaining<=0)return [];const out=[],actorId=state.actor.entityId;const put=(type,target=null,parameters={},checks=[])=>{if(checks.includes(false))return;out.push({actionType:type,actorId,targetEntityId:target,parameters,preconditions:checks.map(x=>x===UNKNOWN?UNKNOWN:x?'TRUE':'FALSE'),legality:UNKNOWN});};
 put('WAIT');const distances=referenceDistances(state,map,l);for(const [dir,[dx,dy]]of Object.entries(MOVE_DELTAS)){const q={x:l.position.x+dx,y:l.position.y+dy};if(q.x>=0&&q.y>=0&&q.x<map.width&&q.y<map.height&&distances[q.y*map.width+q.x]===1)put('MOVE',null,{direction:dir});}
 // RETREAT destinations are all conditional adjacent MOVE equivalents; the actual symmetric metadata tie rule is not predicted.
 if(state.entities.some(e=>e.hostileFlag&&e.inService))for(const a of [...out].filter(a=>a.actionType==='MOVE')){const [dx,dy]=MOVE_DELTAS[a.parameters.direction];put('RETREAT',null,{toX:l.position.x+dx,toY:l.position.y+dy},[UNKNOWN]);}
 for(const e of state.entities){const range=md(l.position,e.observedPosition)<=1,id=e.entityId,s=l.service[id]??e.inService;
 if(e.entityKind==='RESOURCE')put('COLLECT',id,{},[md(l.position,e.observedPosition)===0,s===UNKNOWN?UNKNOWN:s]);
 if(!range)continue;
 for(const t of ['TRANSFER','PROTECT','RESTORE','REINFORCE','REPAIR','ATTACK','BUILD']){const cost=DECLARED_ACTION_COST_MODEL.cost[t];let checks=[l.energy>=cost,UNKNOWN];if(t==='TRANSFER')checks.push(l.carried===UNKNOWN?UNKNOWN:l.carried>0);if(t==='ATTACK')checks.push(e.hostileFlag);if(['PROTECT','REINFORCE','REPAIR','RESTORE'].includes(t))checks.push(!e.hostileFlag);if(t==='PROTECT')checks.push(l.shield[id]===true?false:UNKNOWN);if(t==='RESTORE')checks.push(s===UNKNOWN?UNKNOWN:!s);put(t,id,{},checks);}
 // Nexus depends relationships are observable; precise substitutes/planned/damaged flags remain unavailable.
 for(const rel of e.observedRelationships.filter(r=>r.role==='TO'&&r.kind==='depends'))put('BYPASS',id,{dependent:rel.otherEntityId},[l.energy>=3,s===UNKNOWN?UNKNOWN:!s,UNKNOWN]);}
 return out;}
const distanceMemo=new WeakMap();
function referenceDistances(state,map,l){let memo=distanceMemo.get(state);if(!memo){memo=new Map();distanceMemo.set(state,memo);}const key=stableStringify([l.position,Object.entries(l.service).filter(([,v])=>v===false).sort()]);if(!memo.has(key))memo.set(key,pathDistances(referenceMap(state,map,l),l.position));return memo.get(key);}
function features(state,map,root,leaves,truncated){const entities=state.entities;const values=l=>{const ds=referenceDistances(state,map,l);return ENTITY_CLASS_NAMES.map(k=>{const vals=entities.filter(e=>ENTITY_CLASSES[k](e)&&l.service[e.entityId]!==false).map(e=>ds[e.observedPosition.y*map.width+e.observedPosition.x]).filter(x=>x>=0);return vals.length?Math.min(...vals):map.width*map.height;});};const start=values(initialLedger(state)),ends=leaves.map(values),mean=f=>leaves.map(f).sort((a,b)=>a-b).reduce((s,x)=>s+x,0)/leaves.length;
 const gains=ENTITY_CLASS_NAMES.map((k,i)=>k==='HOSTILE'?Math.max(...ends.map(x=>x[i]))-start[i]:start[i]-Math.min(...ends.map(x=>x[i])));
 return [...gains,Math.log(1+leaves.length),mean(l=>l.costSum),Math.max(...leaves.map(l=>l.costSum)),mean(l=>l.energy),mean(l=>l.collectionCount),mean(l=>l.deliveryCount),mean(l=>l.protectionCount),mean(l=>l.dependencyCount),mean(l=>l.carried===UNKNOWN?1:0),mean(l=>l.targetCount/l.steps),truncated?1:0,mean(l=>l.steps>1?1:0)];}

export function fullContractSearch(state,map,root,depth,{ablate=null,budget=512,policy='CONDITIONAL_DESCRIPTOR'}={}){if(!Number.isInteger(depth)||depth<0||depth>3)throw Error('DEPTH');let frontier=[compose(initialLedger(state),root,state,{ablate})],generated=1,truncated=false,expandedDepth=0;const counts=[1];
 for(let d=0;d<depth;d++){if(policy==='STRICT_ROOT_FALLBACK')break;const next=[];for(const l of frontier){const actions=continuationSurface(state,map,l,{ablate});if(!actions.length)next.push(l);for(const a of actions){next.push(compose(l,a,state,{ablate}));if(next.length>budget)break;}if(next.length>budget)break;}generated+=next.length;counts.push(next.length);if(next.length>budget){truncated=true;break;}if(!next.length)break;frontier=next;expandedDepth=d+1;}
 const x=features(state,map,root,frontier,truncated);if(ablate==='target')x[15]=0;if(ablate==='legality')x[17]=0;
 return {features:x,audit:{depth,expandedDepth,generated,retained:frontier.length,distinctSequences:frontier.length,distinctEndpoints:new Set(frontier.map(l=>`${l.position.x},${l.position.y}`)).size,merges:0,truncated,layerCounts:counts,unknownBranches:depth>0?generated-1:0,guaranteedFutureBranches:0,firstActions:1},rootLedger:frontier[0],futureLegality:depth>0?UNKNOWN:'OFFERED_LEGALITY'};}
export function targetRootFeatures(state,s){const e=state.entities.find(e=>e.entityId===s.target);return [...TYPES.map(t=>t===s.actionType?1:0),s.declaredCost,state.actor.energy,state.actor.carriedMaterial,state.actor.ticksRemaining,e?.criticalFlag?1:0,e?.objectiveFlag?1:0,e?.hostileFlag?1:0,e?.inService?1:0,e?.relativeDistance.manhattan??0,e?.relativeDistance.path??0,e?.observedRelationships.length??0];}
