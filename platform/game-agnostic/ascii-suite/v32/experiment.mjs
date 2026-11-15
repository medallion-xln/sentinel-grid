// Isolated offline experiment owner. No OPEN/RESERVED feedback can enter train().
import {resolve} from 'node:path';
import {DIR,verifyLocal} from './inheritance.mjs';import {PLAN} from './plan.mjs';import {manifest,digest,save,read,writer,checkManifest} from '../training-dev-v1/io.mjs';
import {create,packet,step,terminal} from './kernel.mjs';import {createPolicy} from './policy.mjs';import {historyState,remember,actionFeatures} from '../training-dev-v1/features.mjs';import {encodePacket} from './codec-v2.mjs';import {relationalFeatures} from './relational-features.mjs';import {train} from '../training-dev-v1/train.mjs';import {episode} from './runner.mjs';import {witness,structural} from './feasibility.mjs';
const mode=process.argv[2]??'codec',out=resolve(DIR,'runs',mode+'-pilot-001');if(!['codec','relational'].includes(mode))throw Error('UNKNOWN_EXPERIMENT');
const source=manifest(DIR,p=>/\.(mjs|html|js|css)$/.test(p));save(resolve(out,'registration.json'),{plan:PLAN,experiment:mode,source,sourceHash:digest(source),protected:verifyLocal(),beforeData:true,trainingSplit:'TRAIN',teacher:'PUBLIC_EXISTING_PLANNER_UNQUALIFIED_CANONICAL_DEMONSTRATION; Imitation not regret or proof of expert advancement',pairedSamplesPerCell:4,qualification:'DESCRIPTIVE_PILOT_ONLY_UNDERPOWERED; no promotion'});
const games=mode==='codec'?['rescue','cards','factory','roguelike']:['factory'],models={},trainingRecords=[];
for(const [gi,game]of games.entries()){
 const examples=[],legacyExamples=[],feasible=[];
 for(let i=0;i<3;i++){
  const tier=mode==='codec'?1:i+1,seed=(PLAN.splits.TRAIN.seedBase+gi*100000+i*7919)>>>0,spec={game,tier,seed,family:PLAN.splits.TRAIN.lineage},proof=structural(spec),attempt=witness(spec);feasible.push({spec,structural:proof,witnessSuccess:attempt.success,witnessTicks:attempt.ticks});
  // Rejected/unresolved worlds cannot enter training. Preserve the failed witness separately.
  save(resolve(out,'evaluator',game+'-witness-'+i+'.json'),attempt);if(!proof.pass||!attempt.success){trainingRecords.push({spec,status:'REJECTED_UNRESOLVED_SOLVABILITY'});continue;}
  let w=create(game,seed,tier,{family:spec.family}),policies=Array.from({length:game==='cards'?w.inner.players:1},(_,j)=>createPolicy(game,'STRONG',{partnerStyle:j>0?w.inner.ext.partnerStyle:null})),state=historyState(),ticks=0;
  const publicLog=writer(resolve(out,'public',game+'-TRAIN-'+i+'.jsonl')),labels=writer(resolve(out,'evaluator',game+'-labels-'+i+'.jsonl'));
  while(!terminal(w)){
   const p=packet(w),j=game==='cards'?w.inner.turn:0,d=policies[j].decide(p);publicLog.push({packet:p,action:d.action,actionSource:d.actionSource});
   if(j===0){remember(p.observation,state);const enc=mode==='relational'?relationalFeatures(p,state):encodePacket(p,state),y=p.actions.findIndex(a=>a.id===d.action.id);if(!enc.abstain){examples.push({xs:enc.rows.map(r=>r.features),y});legacyExamples.push({xs:p.actions.map(a=>actionFeatures(p,state,a)),y});labels.push({tick:p.binding.tick,target:y,targetProvenance:'PUBLIC_PLANNER_IMITATION_NOT_OPTIMALITY',codec:enc.codec});}}
   w=step(w,p,d.action);ticks++;
  }
  trainingRecords.push({spec,status:'COMPLETED',ticks,teacherSuccess:w.inner.result==='SUCCESS',public:publicLog.close(),labels:labels.close()});
 }
 save(resolve(out,'evaluator',game+'-feasibility.json'),feasible);if(!examples.length){models[game]={status:'NO_ELIGIBLE_TRAINING_DATA'};continue;}
 const cfg={epochs:PLAN.training.epochs,learningRate:PLAN.training.lr,l2:PLAN.training.l2},id=mode==='codec'?'EXPERIMENTAL_V32_'+game.toUpperCase()+'_ACTION_V2':'EXPERIMENTAL_FACTORY_RELATIONAL_ACTION_V1',fit=train(id,examples,cfg),negative=train(id,examples,cfg,{negative:true}),v1=mode==='codec'?train(id+'_MATCHED_V1_CONTROL',legacyExamples,cfg):null;
 fit.model.featureSpace=mode==='relational'?'RELATIONAL':'V2';fit.model.weightHash=fit.weightHash;negative.model.featureSpace=fit.model.featureSpace;negative.model.weightHash=negative.weightHash;
 const reproduced=train(id,examples,cfg);if(reproduced.weightHash!==fit.weightHash)throw Error('CHECKPOINT_REPRODUCIBILITY_FAILED');
 save(resolve(out,'evaluator',game+'-training-examples.json'),examples);save(resolve(out,'models',game+'.json'),fit);save(resolve(out,'models',game+'-negative.json'),negative);if(v1)save(resolve(out,'models',game+'-v1-control.json'),v1);models[game]={id,weightHash:fit.weightHash,negativeWeightHash:negative.weightHash,examples:examples.length,losses:fit.losses,reproduced:true};
}
save(resolve(out,'model-freeze.json'),{models,trainingRecords,sourceHash:digest(source),beforeOpenValidation:true,validationUpdatesWeights:false,reservedUntouched:true});
const evaluations=[];
for(const [gi,game]of games.entries()){
 if(!models[game].id)continue;const fit=read(resolve(out,'models',game+'.json')),negative=read(resolve(out,'models',game+'-negative.json'));
 for(const split of ['OPEN_VALIDATION_A','OPEN_VALIDATION_B'])for(let i=0;i<4;i++){
  const tier=mode==='codec'?1:1+i%3,seed=(PLAN.splits[split].seedBase+gi*100000+i*7919)>>>0;
  for(const [kind,model]of [['STRONG',null],['V2_CANDIDATE',fit.model],['NEGATIVE',negative.model],...(mode==='relational'?[['FACTORY_NONRELATIONAL',null]]:[])]){
   const policy=kind==='NEGATIVE'?'V2_CANDIDATE':kind,id=game+'-'+split+'-'+i+'-'+kind,spec={id,game,tier,seed,family:PLAN.splits[split].lineage,sensor:'NORMAL',policy};const r=episode(spec,{model,out,verify:true});r.split=split;r.comparison=kind;evaluations.push(r);console.log(JSON.stringify({mode,game,split,i,policy:kind,success:r.metrics.success,cat:r.metrics.catastrophic,changes:r.actionChanges}));
  }
 }
}
save(resolve(out,'evaluation.json'),{evaluations,qualified:false,reason:'Pilot n=4 per cell cannot satisfy preregistered lower-bound and independent qualification gates; results are retained without promotion.',canonicalExpertContributions:0,expertComplementarity:'NOT_TESTABLE',inheritedNegativeTransfer:'Rescue→Rogue V1 zero gain, retained separately; not new confirmatory evidence'});
save(resolve(out,'postflight.json'),{source:checkManifest(DIR,source),protected:verifyLocal(),reservedAccess:false,modelsReproduced:true});
