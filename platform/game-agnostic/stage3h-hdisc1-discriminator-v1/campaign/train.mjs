// Pure offline development orchestration; the command runner supplies verified EXPLORATION records only.
import { makeForgeEncoder } from '../discriminator/forge-encoder.mjs';
import { createDiscriminator } from '../discriminator/index.mjs';
import { IDS } from '../discriminator/contract.mjs';
import { sha256,stable } from '../discriminator/canonical.mjs';
import { ORIGINS,capacityOf,hasCrossActionInteraction } from '../discriminator/pair-model.mjs';
import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { fit,GRID,familyFolds,selectSharedConfiguration } from './learner.mjs';
import { classExamples,encodeClass } from './dataset.mjs';
export const ARMS=Object.freeze(['M0','M1','M2','M3a','M3']);
export function provenance(parameters,encoder,binding){return {discriminatorId:IDS.discriminator,sourceHash:binding.sourceHash,modelHash:parameters.parametersHash,observationContract:encoder.observationContract,labelContract:IDS.labelContract,trainingPopulationDigest:binding.trainingPopulationDigest,exclusionRegistryHash:binding.exclusionRegistryHash,preregistrationHash:binding.preregistrationHash,qualification:{status:'NOT_QUALIFIED',statement:'Experimental H-DISC development model. R0 only.'}};}
export function modelRuntime(model,binding){
 const encoder=makeForgeEncoder(model.vocabulary),p=provenance(model.parameters,encoder,binding);
 return createDiscriminator({encoder,parameters:model.parameters,provenance:p,sourceIdentity:{sourceHash:binding.sourceHash}});
}
export function trainExploration(classes,binding){
 for(const field of ['sourceHash','trainingPopulationDigest','exclusionRegistryHash','preregistrationHash'])if(!/^[0-9a-f]{64}$/.test(binding?.[field]??''))throw Error('TRAINING_BINDING_MISSING:'+field);
 if(classes.length!==1000||classes.some(c=>c.population!=='EXPLORATION')||new Set(classes.map(c=>c.id)).size!==classes.length)throw Error('EXPLORATION_POPULATION_INVALID');
 if(sha256(stable(classes.map(c=>c.id)))!==binding.trainingPopulationDigest)throw Error('TRAINING_POPULATION_DIGEST_MISMATCH');
 const vocabulary={nexusCodes:[...new Set(classes.flatMap(c=>c.evidence.experts.NEXUS.rationaleCodes))].sort(),nexusReasons:[...new Set(classes.map(c=>c.evidence.experts.NEXUS.reason??'NONE'))].sort()};
 const encoder=makeForgeEncoder(vocabulary),folds=familyFolds(classes.map(c=>c.family),sha256),sets=Object.fromEntries(ARMS.map(arm=>[arm,classes.map(c=>classExamples(c,encoder,arm))]));
 const fitting=(arm,indices,config,label)=>{
  const groups=indices.map(i=>sets[arm][i]).filter(g=>g.examples.length);
  if(!groups.length)throw Error('NO_TRAINABLE_EXAMPLES:'+arm);
  return fit({groups,layout:encoder.featureSets[arm],family:sets[arm][0].familyId,origin:ORIGINS.LEARNED,config,label});
 };
 const cv=GRID.map((config,configuration)=>{
  const perArm={};
  for(const arm of ARMS){let unsafe=0;
   for(let fold=0;fold<5;fold++){
    const train=classes.map((_,i)=>i).filter(i=>folds.get(classes[i].family)!==fold),test=classes.map((_,i)=>i).filter(i=>folds.get(classes[i].family)===fold);
    const parameters=fitting(arm,train,config,`HDISC1|${arm}|configuration:${configuration}|fold:${fold}`),runtime=modelRuntime({parameters,vocabulary},binding);
    for(const i of test){const q=encodeClass(classes[i],encoder,arm).request,r=runtime.compare(q.state,q.legalActions,q.advisoryEvidence),set=r.decision.kind==='TOP_SET'?r.decision.topSet.map(a=>typeof a==='number'?a:a.index):[];
     if(!set.length)throw Error('DEVELOPMENT_FULL_COVERAGE_FAILED:'+arm);const outcome=evalClass(classes[i],set);if(outcome.illegal)throw Error('DEVELOPMENT_ILLEGAL_ACTION');unsafe+=Number(outcome.introB||outcome.introN);
    }
   }perArm[arm]=unsafe;
  }return {config,configuration,perArm,unsafeSum:Object.values(perArm).reduce((a,b)=>a+b,0)};
 });
 const selected=selectSharedConfiguration(cv),models={};
 for(const arm of ARMS){const parameters=fitting(arm,classes.map((_,i)=>i),selected.config,`HDISC1|${arm}|final`);models[arm]={parameters,vocabulary,capacity:capacityOf(parameters),structural:hasCrossActionInteraction(parameters)};}
 return {schema:'HDISC1_TRAINING_RESULT_V1',binding,validationOpened:false,cv,selected,models,mechanismNonVacuous:models.M3a.structural.crossActionPath};
}
