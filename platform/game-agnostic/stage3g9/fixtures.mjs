// STAGE_3G_9 mechanism fixtures (population weight 0): CURRENT_COARSE_RELATION vs TYPED_RELATION_SEMANTIC_CHANNEL_V1.
import {sha256,stableStringify} from '../src/core/determinism.js';
import {observableView,renameEntities,poisonPrivileged} from '../scripts/stage3g/evidence.mjs';
import {symmetricLegalActions,symmetricStep} from '../src/forge-symmetric/action-surface-symmetric-v1.js';
import {actionKey} from '../src/stage3g/observable-action-surface-v1.js';
import {fixtureWorld,bypassPair} from '../scripts/stage3g7/fixtures.mjs';
import {fixtureEvidence as g8Fixtures} from '../stage3g8/fixtures.mjs';
import {coarseSubstitute,UNKNOWN} from '../stage3g8/typed-relation-disclosure-v1.mjs';
import {discloseTypedRelations} from '../stage3g8/typed-relation-source.mjs';
import {projectObjectiveProgress,objectiveProgressColumns} from '../stage3g8/objective-progress-v1.mjs';
import {semanticColumns,semanticRootBypass,SEMANTIC_CHANNEL_SCHEMA_HASH} from './typed-relation-semantic-channel-v1.mjs';
import {observableColumns} from '../src/stage3g7/target-eligibility-contract-v1.js';

const offered=w=>symmetricLegalActions(w),bypassOf=w=>offered(w).find(a=>a.actionType==='BYPASS'&&a.parameters.dependent==='actor');
const byFrom=(a,b)=>a.from<b.from?-1:a.from>b.from?1:a.to<b.to?-1:a.to>b.to?1:0;
const kernelAfter=(w,a)=>{const n=symmetricStep(w,a).state;return {substitute:n.relations.find(r=>r.type==='dependsOn'&&r.from===a.parameters.dependent&&!w.relations.some(x=>x.type==='dependsOn'&&x.from===a.parameters.dependent&&x.to===r.to))?.to??'NONE',dependsOn:n.relations.filter(r=>r.type==='dependsOn').map(r=>({from:r.from,to:r.to})).sort(byFrom)};};
/** S0 and S2 vectors for every offered candidate of a world. */
export function vectors(w){const v=observableView(w),d=discloseTypedRelations(w),p=projectObjectiveProgress(v.observation);return v.surface.map(e=>({S0:[...observableColumns(v,e.action).features,...objectiveProgressColumns(p,e.action)],S2:[...semanticColumns(v,e.action,{disclosure:d}).features,...objectiveProgressColumns(p,e.action)]}));}
export function fixtureEvidence(){
 const [w,v]=bypassPair(),a=bypassOf(w),b=bypassOf(v),x=observableView(w),y=observableView(v),t=a.target.id,ka=kernelAfter(w,a),kb=kernelAfter(v,b);
 const coarse={offeredMenuEqual:stableStringify(offered(w).map(actionKey))===stableStringify(offered(v).map(actionKey)),observationEqual:stableStringify([x.state,x.visibleMap,x.observation.metadata.canonicalState])===stableStringify([y.state,y.visibleMap,y.observation.metadata.canonicalState]),outcomesDiffer:ka.substitute!==kb.substitute,coarseSubstitute:[coarseSubstitute(x,t),coarseSubstitute(y,t)],s0VectorsEqual:stableStringify(vectors(w).map(z=>z.S0))===stableStringify(vectors(v).map(z=>z.S0))};
 coarse.COARSE_RELATION_IDENTIFIABLE=!(coarse.offeredMenuEqual&&coarse.observationEqual&&coarse.outcomesDiffer)&&coarse.coarseSubstitute.every(s=>s!==UNKNOWN);
 const pa=semanticRootBypass(x,discloseTypedRelations(w),a),pb=semanticRootBypass(y,discloseTypedRelations(v),b);
 const semantic={substitute:[pa.substitute,pb.substitute],kernel:[ka.substitute,kb.substitute],substituteExact:pa.substitute===ka.substitute&&pb.substitute===kb.substitute,rewireExact:stableStringify(pa.dependsOn)===stableStringify(ka.dependsOn)&&stableStringify(pb.dependsOn)===stableStringify(kb.dependsOn)};semantic.TYPED_SEMANTIC_IDENTIFIABLE=semantic.substituteExact&&semantic.rewireExact;
 const multi=structuredClone(w);for(const r of multi.relations)if(r.from==='g7-sub-b'&&r.to===t)r.type='substitutes';const rename=id=>id==='g7-sub-a'?'zz':id==='g7-sub-b'?'aa':id,renamed=renameEntities(multi,rename),ma=bypassOf(multi),ra=bypassOf(renamed);
 const lexical={before:kernelAfter(multi,ma).substitute,after:kernelAfter(renamed,ra).substitute,semanticBefore:semanticRootBypass(observableView(multi),discloseTypedRelations(multi),ma).substitute,semanticAfter:semanticRootBypass(observableView(renamed),discloseTypedRelations(renamed),ra).substitute};lexical.semanticFollowsKernel=lexical.before===lexical.semanticBefore&&lexical.after===lexical.semanticAfter;
 // Hidden-health collision: S0 and S2 vectors must be identical across the pair (the channel reveals no health).
 const hA=fixtureWorld(),ha=hA.entities.find(e=>e.type==='ACTOR'),ht=hA.entities.find(e=>e.id===hA.objectives[0].entityId);hA.relations=[];hA.grid.cells.fill(0);hA.constraints.energy=10;hA.entities.push({...structuredClone(ht),id:'g9-hidden-health',type:'HOSTILE',faction:'hostile',position:{...ha.position},available:true,health:20,flags:{protected:true},resources:{}});const hB=structuredClone(hA);hB.entities.find(e=>e.id==='g9-hidden-health').health=90;
 const atk=offered(hA).find(a=>a.actionType==='ATTACK'&&a.target.id==='g9-hidden-health'),survives=[hA,hB].map(q=>{const e=symmetricStep(q,atk).state.entities.find(e=>e.id==='g9-hidden-health');return e.available&&e.health>0;});
 const healthCollision={s2VectorsEqual:stableStringify(vectors(hA))===stableStringify(vectors(hB)),afterAttackService:survives};healthCollision.PRESERVED=healthCollision.s2VectorsEqual&&survives[0]!==survives[1];
 const poison={s2InvariantBypassPair:[w,v].every(q=>stableStringify(vectors(poisonPrivileged(q)))===stableStringify(vectors(q)))};
 const g8=g8Fixtures();
 const body={semanticChannel:SEMANTIC_CHANNEL_SCHEMA_HASH,CURRENT_COARSE_RELATION:coarse,TYPED_RELATION_SEMANTIC_CHANNEL:semantic,identitySensitiveLexicalRule:lexical,healthCollision,poison,inheritedStage3g8FixtureHash:g8.evidenceHash,populationWeight:0,scope:'Mechanism fixtures; no decision-value claim'};
 return {...body,evidenceHash:sha256(body)};}
