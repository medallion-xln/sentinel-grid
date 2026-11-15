// OPEN evaluation lane. Simulation/truth stay here, NEVER in synthesis/adapters.
import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256,stableStringify } from '../src/core/determinism.js';
import { createWorld,cloneWorld,hashWorld,isTerminal } from '../src/forge/kernel.js';
import { generateScenarioSymmetricV1 } from '../src/forge-symmetric/scenarios-symmetric-v1.js';
import { runCalibratedWarmup } from '../src/forge/warmup.js';
import { validateScenarioV2 } from '../src/forge/validators-v2.js';
import { evaluateCounterfactualsSymmetricV1 } from '../src/forge-symmetric/counterfactual-symmetric-v1.js';
import { observableView } from '../scripts/stage3g/evidence.mjs';
import { nexusRelationalSelector as owner } from '../src/lab/stage3c-learned-nexus.js';
import { evaluateNexus } from '../src/experts/nexus.js';
import { decisionPacket,invokeNexus,invokeOracle,unavailable } from './adapters.mjs';
import { ROSTER } from './evidence.mjs';
import { synthesize,VARIANTS,CANDIDATE_ID } from './synthesis.mjs';
import { PLAN,PLAN_HASH,combinations } from './plan.mjs';
import { score,summary,paired,perturbation,mean } from './metrics.mjs';
import { currentBaseline,S0_HASH } from './baseline.mjs';
import { INVENTORY,legacySmoke } from './audit.mjs';
import { GA,LANE,verifyProtected,sourceClosure,rawHash } from './guard.mjs';
import { verifyInheritanceBindings } from './inheritance.mjs';

const stripTiming=x=>Array.isArray(x)?x.map(stripTiming):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([k])=>!['latency','latencyMs','totalWallMs'].includes(k)).map(([k,v])=>[k,stripTiming(v)])):x;
const keys=p=>p.legalActions.map(a=>a.actionId);
function qualified(view,task){const packet=decisionPacket(view.observation,view.surface,task),nexus=invokeNexus(packet),oracle=invokeOracle(packet);
  const other=ROSTER.filter(id=>!['Nexus','Oracle'].includes(id)).map(id=>unavailable(id,packet,INVENTORY.find(r=>r.expertId===id).status));
  return {packet,bundle:[nexus,oracle],unavailable:other,ledger:new Set([nexus.evidenceHash,oracle.evidenceHash])};}
function runVariants(q){return Object.fromEntries(VARIANTS.map(v=>[v,synthesize(q.packet,q.bundle,q.ledger,v)]));}
function fidelity(q){const raw=evaluateNexus({canonicalState:q.packet.canonicalState,legalActions:q.packet.legalActions.map(({actionId,targetEntityId})=>({actionId,targetEntityId}))}),output=owner({branches:q.packet.legalActions.map(a=>({actionKey:a.actionId,actionType:a.actionType}))},raw);
  if(stableStringify(output)!==stableStringify(q.bundle[0].payload.selected)||raw.outputDigest!==q.bundle[0].payload.raw.outputDigest)throw Error('NEXUS_ADAPTER_NOT_FAITHFUL');}

export function evaluateOpen({log=false}={}){
  const start=performance.now(),closure=sourceClosure(),protectedState=verifyProtected(),inheritance=verifyInheritanceBindings(),rows=[],rejected=[],worldHashes=new Set(),dri=[],drs=[],stress=[];
  const scheduled=combinations(),legacy=legacySmoke();let previous=null;
  for(const [i,combo]of scheduled.entries()){
    const warm=runCalibratedWarmup(combo.seed,warmupTicks=>generateScenarioSymmetricV1({...combo,warmupTicks})),config=warm.scenarioConfig;
    const initial=createWorld(combo.seed,config),validation=validateScenarioV2(initial,config),world=warm.world;
    if(!validation.valid||isTerminal(world)||!warm.taskPreserved){rejected.push({combo,validation,terminal:isTerminal(world),taskPreserved:warm.taskPreserved});continue;}
    const before=hashWorld(world);if(worldHashes.has(before))throw Error('DUPLICATE_OPEN_WORLD');worldHashes.add(before);
    const view=observableView(world),task={evaluationSteps:config.horizon+1},q=qualified(view,task);fidelity(q);
    const decisions=runVariants(q),baseline=currentBaseline(view);
    // ALL decisions fixed before evaluator truth. The label cannot reach q.
    const truth=evaluateCounterfactualsSymmetricV1(world,{horizon:config.horizon});
    if(stableStringify([...keys(q.packet)].sort())!==stableStringify(truth.branches.map(b=>b.actionKey).sort()))throw Error('ORACLE_ACTION_SURFACE_MISMATCH');
    const selections={Nexus:q.bundle[0].recommendedAction?[q.bundle[0].recommendedAction]:[],CURRENT_OBSERVABLE_S0:baseline.selected,
      ...Object.fromEntries(Object.entries(decisions).map(([v,d])=>[v,d.recommendedAction?[d.recommendedAction]:[]]))};
    const minus={};for(const id of ['Nexus','Oracle']){const other=q.bundle.filter(e=>e.expertId!==id),d=synthesize(q.packet,other,q.ledger);
      minus[id]={decision:d,otherEvidenceUnchanged:true,retainedEvidence:other.map(e=>e.evidenceHash),withheld:q.bundle.find(e=>e.expertId===id).evidenceHash};selections['MINUS_'+id]=d.recommendedAction?[d.recommendedAction]:[];}
    const row={recordId:sha256(combo),combo,worldHash:before,planHash:PLAN_HASH,packet:q.packet,evidence:q.bundle,unavailable:q.unavailable,decisions,ablations:minus,
      baseline,warmup:{ticks:warm.warmupTicks,frames:warm.frameCount,truncated:warm.truncated,stopReason:warm.stopReason,clamped:warm.channelClamped,taskPreserved:warm.taskPreserved},validation,
      truth:{oracleId:truth.oracleId,continuationPolicy:truth.continuationPolicy,horizon:truth.horizon,optimalActionKeys:truth.optimalActionKeys,utilitySpread:truth.utilitySpread,branches:truth.branches.map(({actionKey,totalScalar,regret})=>({actionKey,totalScalar,regret}))},
      scores:Object.fromEntries(Object.entries(selections).map(([v,ids])=>[v,score(ids,truth)]))};
    // Genuine stale and duplicate outputs, not fabricated expert policies.
    const dirty=previous?[...previous.bundle,...q.bundle,...q.bundle]:[...q.bundle,...q.bundle];
    const ledger=new Set([...q.ledger,...(previous?.ledger??[])]),filtered=synthesize(q.packet,dirty,ledger);
    stress.push({recordId:row.recordId,choiceUnchanged:filtered.recommendedAction===decisions[CANDIDATE_ID].recommendedAction,rejections:filtered.rejected});
    // Recompute truth independently for the prescribed perturbation subset.
    if(i%144<12){const reversed={...view,surface:[...view.surface].reverse()},rq=qualified(reversed,task),rd=runVariants(rq),rt=evaluateCounterfactualsSymmetricV1(cloneWorld(world),{horizon:config.horizon});
      for(const v of VARIANTS)dri.push({recordId:row.recordId,variant:v,...perturbation(row.scores[v],score(rd[v].recommendedAction?[rd[v].recommendedAction]:[],rt),truth.optimalActionKeys,rt.optimalActionKeys,selections[v],rd[v].recommendedAction?[rd[v].recommendedAction]:[])});
      const changed=cloneWorld(world),actor=changed.entities.find(e=>e.type==='ACTOR'&&e.faction==='sentinel');actor.health=Math.min(100,actor.health+10);
      const cv=observableView(changed),cq=qualified(cv,task),cd=runVariants(cq),ct=evaluateCounterfactualsSymmetricV1(changed,{horizon:config.horizon});
      const menuSame=stableStringify([...keys(cq.packet)].sort())===stableStringify([...keys(q.packet)].sort());
      for(const v of VARIANTS)drs.push({recordId:row.recordId,variant:v,menuSame,actorHealthBefore:world.entities.find(e=>e.id===actor.id).health,actorHealthAfter:actor.health,...perturbation(row.scores[v],score(cd[v].recommendedAction?[cd[v].recommendedAction]:[],ct),truth.optimalActionKeys,ct.optimalActionKeys,selections[v],cd[v].recommendedAction?[cd[v].recommendedAction]:[])});
    }
    if(hashWorld(world)!==before)throw Error('SOURCE_WORLD_MUTATED');rows.push(row);previous=q;
    if(log&&(i+1)%24===0)process.stderr.write(`[canonical OPEN] ${i+1}/${scheduled.length}; accepted ${rows.length}\n`);
  }
  const ids=['Nexus','CURRENT_OBSERVABLE_S0',...VARIANTS,'MINUS_Nexus','MINUS_Oracle'],panels=Object.fromEntries(Object.keys(PLAN.panels).map(panel=>{const r=rows.filter(x=>x.combo.panel===panel);return [panel,{n:r.length,metrics:Object.fromEntries(ids.map(id=>[id,summary(r,id)])),primeVsSingle:paired(r,CANDIDATE_ID,'Nexus'),nexusVsS0:paired(r,'Nexus','CURRENT_OBSERVABLE_S0'),ablations:{Nexus:{...paired(r,CANDIDATE_ID,'MINUS_Nexus'),coverageRemoved:summary(r,CANDIDATE_ID).coverage-summary(r,'MINUS_Nexus').coverage,reason:'No action remains: utility of abstention unspecified; do not call missing action zero MEV'},Oracle:{protocolEffect:paired(r,CANDIDATE_ID,'MINUS_Oracle'),reasoningMEV:'NOT_TESTABLE_NO_QUALIFIED_TEMPORAL_ACTION_CONSUMER'}}}];}));
  const latency=Object.fromEntries(['Nexus','Oracle',...VARIANTS,'CURRENT_OBSERVABLE_S0'].map(id=>[id,{n:rows.length,meanMs:mean(rows.map(r=>id==='CURRENT_OBSERVABLE_S0'?r.baseline.latencyMs:['Nexus','Oracle'].includes(id)?r.evidence.find(e=>e.expertId===id).latency.milliseconds:r.decisions[id].latency.milliseconds)),status:'LOCAL_OPEN_DIAGNOSTIC_NOT_COMPUTE_NORMALIZED'}]));
  const report={schema:'STAGE3H1_CANONICAL_ADVANCEMENT_OPEN_V1',status:'DEVELOPMENT_ONLY_QUALIFIED_NATIVE_BINDINGS_NO_MOE_GAIN',planHash:PLAN_HASH,sourceClosure:closure,protectedState,
    inheritance,
    inventory:INVENTORY,legacySmoke:legacy,scheduled:scheduled.length,accepted:rows.length,rejected,panels,
    fidelity:{nexusOwnerOutputsExact:rows.length,sourceWorldUnchanged:rows.length,otherAblationEvidenceUnchanged:rows.length*2},
    stress:{n:stress.length,choiceUnchanged:stress.filter(r=>r.choiceUnchanged).length,rejectionCounts:Object.fromEntries([...new Set(stress.flatMap(r=>r.rejections.map(e=>e.reason)))].map(k=>[k,stress.reduce((n,r)=>n+r.rejections.filter(e=>e.reason===k).length,0)])),scope:'SOFTWARE_FAITHFULNESS_NOT_REASONING_GAIN'},
    DRI:{pairs:dri.length,qualified:dri.filter(p=>p.truthInvariant).length,stable:dri.filter(p=>p.truthInvariant&&p.stable).length,scope:'candidate-order only, OPEN diagnostic, not semantic competence'},
    DRS:{pairs:drs.length,menuSame:drs.filter(p=>p.menuSame).length,truthChanged:drs.filter(p=>p.menuSame&&!p.truthInvariant).length,disjointTruth:drs.filter(p=>p.menuSame&&!p.truthInvariant&&!p.truthOverlap).length,correctResponse:drs.filter(p=>p.menuSame&&p.correctResponse).length,falseStability:drs.filter(p=>p.menuSame&&p.falseStability).length,scope:'prespecified health intervention; unqualified/no-op/overlap retained'},
    warmup:{truncated:rows.filter(r=>r.warmup.truncated).length,oracleTemporalAvailable:rows.filter(r=>r.evidence.find(e=>e.expertId==='Oracle').outputKind==='TEMPORAL_EVIDENCE').length},
    ASCII_TRANSFER_RESULTS:Object.fromEntries(['pong','platformer','fighter','racer'].map(w=>[w,{QUALIFIED_EXPERTS_AVAILABLE:[],MATCHED_EVIDENCE_VALID:false,PRIME_VALUE_MEASURED:false,GAIN_OVER_STRONG_CONTROLLER:'NOT_TESTABLE',COMPUTE_COST:null,GENERALIZATION_STATUS:'NOT_TESTABLE_NO_FAITHFUL_CANONICAL_ACTION_BINDING',worldUnchanged:true}])),
    gates:{STAGE3F_FREEZE_REPRODUCED:true,STAGE3G_FREEZE_REPRODUCED:true,QUALIFIED_EXPERT_SET_BOUND:true,MATCHED_EVIDENCE_BASELINE_VALID:true,EXPERT_INPUTS_LEAKAGE_SAFE:true,STRONG_COMPARISON_BASELINES_BOUND:true,PREREGISTRATION_COMPLETE:false,UNUSED_SEALED_LINEAGE_CONFIRMED:false},
    caveats:['Matched evidence is valid but degenerate: one qualified action binding plus nonaction Oracle without consumer. No nine-expert or complementarity claim.', 'Missing/unbound experts have NOT_TESTABLE marginal value, never zero.', 'Nexus selector is an inherited policy on top of Nexus, not the relational engine itself.', 'S0 is a frozen certified comparator; best universal single-policy champion remains unresolved.', 'Truth and regret are conditional on a fixed greedy continuation, not global strategic optimality.', 'No abstention utility, belief consumer, information-acquisition consumer, or structural OOD test.', 'No new reasoning candidate or routing fitted. No sealed evaluation or certification performed.'],
    latency,compute:{primaryExpertCalls:rows.length*2,expertCallsIncludingFidelityAndPerturbations:rows.length*3+4*dri.length/VARIANTS.length,legacyNeuralSmokeCalls:2,primarySynthesisCalls:rows.length*3,ablationsAndStressSynthesisCalls:rows.length*3,perturbationSynthesisCalls:dri.length+drs.length,simulationsInExpertsOrPrime:0,s0PrimaryCandidateScores:rows.reduce((n,r)=>n+r.baseline.candidatesScored,0),evaluatorPrimaryTruthBranches:rows.reduce((n,r)=>n+r.truth.branches.length,0),evaluatorTruthCalls:rows.length+2*dri.length/VARIANTS.length,baselineModelHash:S0_HASH,valuePerCompute:'NO_SYNTHESIS_DDV_GAIN; added Oracle+synthesis calls vs single Nexus; timings local diagnostic only'},totalWallMs:performance.now()-start,
    canonicalMoeImprovement:'NOT_ESTABLISHED',complementarity:'NOT_TESTABLE_ONLY_ONE_ACTION_BINDING',beliefCompetence:'NOT_TESTABLE',VOICompetence:'NOT_TESTABLE',authority:'R0',certification:'NOT_CERTIFIED_DEVELOPMENT_ONLY',
  };
  // Negative-result identity is a checked property, not a predetermined metric.
  if(Object.values(panels).some(p=>p.primeVsSingle.DELTA_DDV!==0||p.primeVsSingle.DELTA_REGRET!==0))throw Error('UNEXPECTED_SYNTHESIS_DIFFERENCE_REQUIRES_REVIEW');
  if(report.stress.choiceUnchanged!==rows.length)throw Error('STRESS_REJECTION_CHANGED_VALID_CHOICE');
  verifyProtected();return {report,rows,dri,drs,semanticHash:sha256(stripTiming({rows,dri,drs,stress}))};
}

function main(){const check=process.argv.includes('--check'),out=resolve(LANE,'results/open-v1');
  if(!check&&existsSync(out))throw Error('OPEN_OUTPUT_EXISTS_USE_CHECK; no result overwrite');
  const result=evaluateOpen({log:true});
  if(check){const prior=JSON.parse(readFileSync(resolve(out,'report.json')));if(prior.semanticHash!==result.semanticHash||prior.planHash!==PLAN_HASH||prior.sourceClosure.hash!==result.report.sourceClosure.hash)throw Error('OPEN_REPLAY_MISMATCH');console.log(JSON.stringify({status:'PASS_OPEN_REPLAY',rows:result.rows.length,semanticHash:result.semanticHash,protected:verifyProtected()}));return;}
  mkdirSync(out,{recursive:true});
  for(const [name,value]of Object.entries({registration:{PLAN,PLAN_HASH,sourceClosure:result.report.sourceClosure},report:{...result.report,semanticHash:result.semanticHash},rows:result.rows,perturbations:{dri:result.dri,drs:result.drs}}))writeFileSync(resolve(out,name+'.json'),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:result.report.status,accepted:result.report.accepted,rejected:result.report.rejected.length,panels:result.report.panels,DRI:result.report.DRI,DRS:result.report.DRS,semanticHash:result.semanticHash}));
}
if(process.argv[1]===fileURLToPath(import.meta.url))main();
