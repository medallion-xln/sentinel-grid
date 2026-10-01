// STAGE_3G_8 mechanism fixtures (population weight 0). Re-runs the Stage 3G.7 BYPASS and hidden-health collisions
// under CURRENT_COARSE_RELATION and PROSPECTIVE_TYPED_RELATION, and checks objective progress on a reachable
// COLLECT->TRANSFER trajectory with nonzero delivery. Kernel reads are audit-only.
import assert from 'node:assert/strict';
import {sha256,stableStringify} from '../src/core/determinism.js';
import {observableView,renameEntities,poisonPrivileged} from '../scripts/stage3g/evidence.mjs';
import {symmetricLegalActions,symmetricStep} from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {actionKey} from '../src/stage3g/observable-action-surface-v1.js';
import {fixtureWorld,bypassPair} from '../scripts/stage3g7/fixtures.mjs';
import {projectObjectiveProgress,projectionLoss,reconstructObjectives,OBJECTIVE_PROGRESS_SCHEMA_HASH} from './objective-progress-v1.mjs';
import {verifyDisclosure,typedSubstitute,coarseSubstitute,typedRelationColumns,typedRootLedger,TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,UNKNOWN} from './typed-relation-disclosure-v1.mjs';
import {discloseTypedRelations} from './typed-relation-source.mjs';

const offered=w=>symmetricLegalActions(w),bypassOf=w=>offered(w).find(a=>a.actionType==='BYPASS'&&a.parameters.dependent==='actor');
const rewired=(w,a)=>symmetricStep(w,a).state.relations.find(r=>r.type==='dependsOn'&&r.from==='actor').to;
const sameObservation=(x,y)=>stableStringify([x.observation.features,x.observation.metadata.canonicalState,x.observation.metadata.objectives,x.observation.metadata.observationHistory,x.visibleMap,x.state])===stableStringify([y.observation.features,y.observation.metadata.canonicalState,y.observation.metadata.objectives,y.observation.metadata.observationHistory,y.visibleMap,y.state]);
/** The Stage 3G.7 COLLECT->TRANSFER world: resource co-located with an acceptsMaterial objective entity. */
export function deliveryWorld(){const w=fixtureWorld(),actor=w.entities.find(e=>e.type==='ACTOR'),target=w.entities.find(e=>e.id===w.objectives[0].entityId);w.relations=[];w.grid.cells.fill(0);w.entities.push({...structuredClone(target),id:'g8-resource',type:'RESOURCE',position:{...actor.position},health:100,available:true,value:7,flags:{protected:true},resources:{}});target.position={...actor.position};target.flags.acceptsMaterial=true;actor.resources.material=0;w.constraints.energy=0;return w;}
export function fixtureEvidence(){
 // Phase 6: the inherited collision pair.
 const [w,v]=bypassPair(),a=bypassOf(w),b=bypassOf(v),x=observableView(w),y=observableView(v),t=a.target.id;assert.ok(a&&b);
 const outcomes=[rewired(w,a),rewired(v,b)],dw=discloseTypedRelations(w),dv=discloseTypedRelations(v);
 const coarse={currentObservableEqual:sameObservation(x,y),currentOfferedMenuEqual:stableStringify(offered(w).map(actionKey))===stableStringify(offered(v).map(actionKey)),outcomesDiffer:outcomes[0]!==outcomes[1],coarseSubstitute:[coarseSubstitute(x,t),coarseSubstitute(y,t)],runtimeLedgerSubstitute:[typedRootLedger(x,null,a).rewiring[0].substitute,typedRootLedger(y,null,b).rewiring[0].substitute]};
 coarse.identifiable=!(coarse.currentObservableEqual&&coarse.currentOfferedMenuEqual&&coarse.outcomesDiffer)&&coarse.coarseSubstitute.every(s=>s!==UNKNOWN);
 const typed={consistent:[verifyDisclosure(x.observation,dw).consistent,verifyDisclosure(y.observation,dv).consistent],disclosuresDiffer:stableStringify(dw)!==stableStringify(dv),predicted:[typedSubstitute(x,dw,t),typedSubstitute(y,dv,t)],outcomes,bypassColumnsDiffer:stableStringify(typedRelationColumns(x,dw,a))!==stableStringify(typedRelationColumns(y,dv,b)),ledgerSubstitute:[typedRootLedger(x,dw,a).rewiring[0].substitute,typedRootLedger(y,dv,b).rewiring[0].substitute]};
 typed.identifiable=typed.consistent.every(Boolean)&&typed.disclosuresDiffer&&stableStringify(typed.predicted)===stableStringify(outcomes)&&stableStringify(typed.ledgerSubstitute)===stableStringify(outcomes);
 // Two live typed substitutes: a non-monotone identity rename legitimately changes the environment's lexical choice; the typed rule follows it.
 const multi=structuredClone(w);for(const r of multi.relations)if(r.from==='g7-sub-b'&&r.to===t)r.type='substitutes';const rename=id=>id==='g7-sub-a'?'zz':id==='g7-sub-b'?'aa':id,renamed=renameEntities(multi,rename),ma=bypassOf(multi),ra=bypassOf(renamed);
 const lexical={before:rewired(multi,ma),after:rewired(renamed,ra),typedBefore:typedSubstitute(observableView(multi),discloseTypedRelations(multi),t),typedAfter:typedSubstitute(observableView(renamed),discloseTypedRelations(renamed),ra.target.id)};lexical.typedFollowsKernel=lexical.before===lexical.typedBefore&&lexical.after===lexical.typedAfter&&lexical.after!==rename(lexical.before);
 // Hidden-health collision: the typed candidate must not separate it (no health leakage).
 const hA=fixtureWorld(),ha=hA.entities.find(e=>e.type==='ACTOR'),ht=hA.entities.find(e=>e.id===hA.objectives[0].entityId);hA.relations=[];hA.grid.cells.fill(0);hA.constraints.energy=10;hA.entities.push({...structuredClone(ht),id:'g8-hidden-health',type:'HOSTILE',faction:'hostile',position:{...ha.position},available:true,health:20,flags:{protected:true},resources:{}});const hB=structuredClone(hA);hB.entities.find(e=>e.id==='g8-hidden-health').health=90;
 const atk=offered(hA).find(a=>a.actionType==='ATTACK'&&a.target.id==='g8-hidden-health'),survives=[hA,hB].map(q=>{const e=symmetricStep(q,atk).state.entities.find(e=>e.id==='g8-hidden-health');return e.available&&e.health>0;});
 const healthCollision={currentObservableEqual:sameObservation(observableView(hA),observableView(hB)),typedDisclosureEqual:stableStringify(discloseTypedRelations(hA))===stableStringify(discloseTypedRelations(hB)),afterAttackService:survives,stillCollidedWithDisclosure:true,cause:'UNAVAILABLE_CURRENT_INDIVIDUAL_HEALTH_ACTION_INDUCED_OUTCOME',futureDynamicsRequired:false};healthCollision.stillCollidedWithDisclosure=healthCollision.currentObservableEqual&&healthCollision.typedDisclosureEqual&&survives[0]!==survives[1];
 const poisonInvariant=[w,v,hA].every(q=>stableStringify(discloseTypedRelations(poisonPrivileged(q)))===stableStringify(discloseTypedRelations(q)));
 // Objective progress on a reachable trajectory with nonzero delivery, replayed twice.
 const trajectory=()=>{let s=deliveryWorld();const steps=[];const record=q=>{const o=observableView(q).observation,p=projectObjectiveProgress(o);steps.push({packetEqualsWorld:stableStringify(o.metadata.objectives)===stableStringify(q.objectives.map(z=>({...z}))),noLoss:!projectionLoss(o),roundTrip:stableStringify(reconstructObjectives(p))===stableStringify(o.metadata.objectives),remainingMatchesFeature:p.totals.remaining===o.features[12],delivered:p.totals.delivered,remaining:p.totals.remaining,completion:p.totals.completionFraction,progress:sha256(p)});};record(s);
  const c=offered(s).find(a=>a.actionType==='COLLECT'&&a.target.id==='g8-resource');s=symmetricStep(s,c).state;record(s);const tr=offered(s).find(a=>a.actionType==='TRANSFER'&&a.target.id===s.objectives[0].entityId);s=symmetricStep(s,tr).state;record(s);return steps;};
 const first=trajectory(),second=trajectory(),objectiveTrajectory={steps:first.map(({progress,...r})=>r),replayDeterministic:stableStringify(first)===stableStringify(second),deliveredAfterTransfer:first[2].delivered,exact:first.every(s=>s.packetEqualsWorld&&s.noLoss&&s.roundTrip&&s.remainingMatchesFeature)&&first[2].delivered===7};
 const body={schemas:{objectiveProgress:OBJECTIVE_PROGRESS_SCHEMA_HASH,typedRelation:TYPED_RELATION_DISCLOSURE_SCHEMA_HASH},bypassCollision:{CURRENT_COARSE_RELATION:coarse,PROSPECTIVE_TYPED_RELATION:typed},identitySensitiveLexicalRule:lexical,healthCollision,disclosurePoisonInvariant:poisonInvariant,objectiveTrajectory,populationWeight:0,scope:'Mechanism fixtures, not population or decision-value evidence'};
 return {...body,evidenceHash:sha256(body)};}
