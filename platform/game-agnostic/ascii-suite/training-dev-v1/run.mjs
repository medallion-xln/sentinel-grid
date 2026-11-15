import {resolve} from 'node:path';
import {existsSync,readFileSync} from 'node:fs';
import {PLAN} from './plan.mjs';
import {DIR,GA,digest,raw,read,save,manifest,checkManifest} from './io.mjs';
import {verify,read as frozenRead,checkSource} from '../v3/protect.mjs';
import {qualifications,auditGame} from './audit.mjs';
import {initial,topology,structuralSet,nearSibling} from './scenarios.mjs';
import {episode,summarize,paired} from './runner.mjs';
import {train} from './train.mjs';
export const OUT=resolve(DIR,'runs',PLAN.runId);
const source=()=>manifest(DIR,p=>!p.includes('/runs/')&&!p.includes('/screenshots/'));
const artifact=n=>resolve(OUT,n+'.json');
const registration=()=>read(artifact(existsSync(artifact('preregistration-amendment'))?'preregistration-amendment':'preregistration'));
function prepare(){
  if(existsSync(artifact('dataset-manifest')))return registration();
  let reg;
  if(existsSync(artifact('preregistration'))){
    if(existsSync(artifact('collection'))||existsSync(artifact('evaluation')))throw Error('CANNOT_AMEND_AFTER_OUTCOMES');
    const old=read(artifact('preregistration'));reg={...old,plan:PLAN,planHash:digest(PLAN),source:source(),amendment:PLAN.amendment,priorRegistrationHash:raw(artifact('preregistration')),amendedAt:new Date().toISOString()};
    if(!existsSync(artifact('preregistration-amendment')))save(artifact('preregistration-amendment'),reg);
  }else{
  const protectedV31=manifest(resolve(DIR,'../v31'));
  // Exactly one established nested inheritance check for this development run.
  const inherited=verify();checkSource(frozenRead('freeze.json').source);
  const protectedCanonical={};for(const p of ['sgrid-lab/weights/vanguard-v1.f32','sgrid-lab/weights/horizon-v1.f32'])protectedCanonical[p]=raw(resolve(GA,'../..',p));
  reg={plan:PLAN,planHash:digest(PLAN),source:source(),inherited,protectedV31,protectedCanonical,createdAt:new Date().toISOString(),sealedExecution:false};
  save(artifact('preregistration'),reg);save(artifact('expert-audit'),qualifications());
  }
  const specs=[],seen=new Map(),structural=new Map(),rejections=[];
  for(const split of ['TRAIN','DEVELOPMENT','VALIDATION','STRUCTURAL_OOD'])for(const game of PLAN.worlds){
    if(split==='STRUCTURAL_OOD'&&game!=='factory')continue;
    for(const difficulty of PLAN.difficulties)for(let index=0;index<PLAN.populations[split];index++){
      let admitted=null;
      for(let attempt=0;attempt<1000;attempt++){
        const seed=(PLAN.seeds[split]+PLAN.worlds.indexOf(game)*0x100000+difficulty*0x1000+index*17+attempt*7919)>>>0;
        const spec={split,game,difficulty,index,seed,family:split==='VALIDATION'?'B':'A',mapCurriculum:PLAN.mapFamilies[split]??null,curriculum:game==='factory'?PLAN.factoryFamilies[split]:null,lineageId:`${PLAN.runId}:${split}:${game}:D${difficulty}:G${index}:A${attempt}`};
        const w=initial(spec),top=topology(w),structure=structuralSet(w),key=game+':'+difficulty;
        const overlaps=(seen.get(key)??[]).some(v=>v.split!==split&&v.hash===top)||(structural.get(key)??[]).some(v=>v.split!==split&&nearSibling(v.structure,structure));
        if(overlaps){rejections.push({split,game,difficulty,index,attempt,reason:'CROSS_SPLIT_TOPOLOGY_OR_NEAR_SIBLING'});continue;}
        spec.topologyHash=top;admitted=spec;seen.set(key,[...(seen.get(key)??[]),{split,hash:top}]);structural.set(key,[...(structural.get(key)??[]),{split,structure}]);break;
      }
      if(!admitted)throw Error('PARTITION_NOT_ADMITTED:'+game+split+difficulty);specs.push(admitted);
    }
  }
  const reserved=PLAN.worlds.flatMap(game=>PLAN.difficulties.flatMap(difficulty=>Array.from({length:PLAN.populations.RESERVED_TEST},(_,index)=>({split:'RESERVED_TEST',game,difficulty,index,seed:(PLAN.seeds.RESERVED_TEST+PLAN.worlds.indexOf(game)*0x100000+difficulty*0x1000+index*17)>>>0,curriculum:game==='factory'?PLAN.factoryFamilies.RESERVED_TEST:null,status:'SPEC_ONLY_NOT_GENERATED_NOT_EXECUTED'}))));
  save(artifact('dataset-manifest'),{schema:'EPISODE_LINEAGE_MANIFEST_V1',specs,reserved,reservedCommitment:digest(reserved),rejections,manifestHash:digest(specs),splitLeakage:'No exact or >.94 structural Jaccard sibling across admitted initial populations; whole episodes grouped; map scenario families and factory families disjoint',limits:'Finite initial-layout audit, not universal independence proof. Later Rogue levels use the same split-specific generator but are not exhaustively pre-audited. Only factory custom graph receives the preregistered structural-OOD designation; dungeon validation uses separate random-cut diagnostic families.'});
  console.log('PREREGISTERED',reg.planHash,specs.length,'admitted specs; reserved unexecuted');return reg;
}
function collect(){
  if(existsSync(artifact('collection')))return read(artifact('collection'));
  const specs=read(artifact('dataset-manifest')).specs,results=[],examples=Object.fromEntries(PLAN.candidates.map(id=>[id,[]]));
  for(const spec of specs.filter(s=>['TRAIN','DEVELOPMENT'].includes(s.split)))for(const kind of PLAN.collectionPolicies){
    const r=episode(spec,kind,{root:OUT,config:PLAN.training,store:true,examples:spec.split==='TRAIN'?examples:null});results.push(r);
    console.log('COLLECT',spec.split,spec.game,'D'+spec.difficulty,spec.index,kind,r.terminal,r.ticks);
  }
  save(artifact('training-examples'),{schema:'EVALUATOR_OWNED_TRAINING_JOIN_V1',examples,publicStore:'public/',labelStore:'evaluator/',joinKey:'transitionId',limitations:'Observed imitation targets and offline hidden-state occupancy/playability labels, not qualified canonical demonstrations or optimal values'});
  const datasetHash=digest(results.map(r=>({id:r.id,public:r.publicArtifact.hash,labels:r.labelArtifact.hash})));save(artifact('collection'),{results,datasetHash,qualifiedCanonicalDemonstrations:0,failuresRetained:results.filter(r=>!r.metrics.success).length,train:summarize(results.filter(r=>r.spec.split==='TRAIN')),development:summarize(results.filter(r=>r.spec.split==='DEVELOPMENT'))});return{results,datasetHash};
}
function fit(){
  if(existsSync(artifact('model-freeze')))return read(artifact('model-freeze'));
  const {examples}=read(artifact('training-examples')),models={};
  for(const id of PLAN.candidates){const result=train(id,examples[id],PLAN.training),negative=train(id,examples[id],PLAN.training,{negative:true});
    save(resolve(OUT,'models',id+'.json'),result);save(resolve(OUT,'models',id+'-negative.json'),negative);models[id]={weightHash:result.weightHash,negativeWeightHash:negative.weightHash,examples:result.examples,losses:result.losses,updated:result.updated,identity:result.model.id};console.log('TRAINED',id,result.examples,result.losses.at(-1).meanLoss,result.weightHash);
  }
  const freeze={models,modelHash:digest(models),planHash:registration().planHash,selection:'Fixed preregistered epoch before first validation outcome; no validation tuning'};save(artifact('model-freeze'),freeze);return freeze;
}
function evaluate(){
  if(existsSync(artifact('evaluation')))return read(artifact('evaluation'));
  const specs=read(artifact('dataset-manifest')).specs,models=Object.fromEntries(PLAN.candidates.map(id=>[id,read(resolve(OUT,'models',id+'.json')).model])),neg=Object.fromEntries(PLAN.candidates.map(id=>[id,read(resolve(OUT,'models',id+'-negative.json')).model]));
  const worldModel={rescue:models.RESCUE_HOSTILE_OCCUPANCY_V1,cards:models.CARDS_PLAYABILITY_V1,factory:models.FACTORY_PUBLIC_ACTION_HEAD_V1,roguelike:models.ROGUE_EPISODIC_ACTION_HEAD_V1},results=[],comparisons={},transfer=[],negative=[],memory=[];
  for(const game of PLAN.worlds)for(const sensor of Object.keys(PLAN.sensors)){
    const pairs=[];for(const spec of specs.filter(s=>s.split==='VALIDATION'&&s.game===game&&(sensor==='NORMAL'||s.index<PLAN.sensorHoldoutSamples))){
      const config={...PLAN.training,sensor},partner=sensor==='PARTIAL'&&game==='cards'?'REACTIVE_BASELINE':'RULE_BASELINE';
      const beliefModels=(game==='rescue'||game==='cards')?{trained:worldModel[game],negative:neg[worldModel[game].id]}:{};
      const a=episode(spec,'STRONG',{config,partner,beliefModels}),b=episode(spec,'CANDIDATE',{model:worldModel[game],config,partner});results.push(a,b);pairs.push([a,b]);
      if(sensor==='NORMAL'){
        const n=episode(spec,'CANDIDATE',{model:neg[worldModel[game].id],config,partner});results.push(n);negative.push([a,n]);
        if(game==='roguelike'){
          const t=episode(spec,'CANDIDATE',{model:models.RESCUE_HOSTILE_OCCUPANCY_V1,config,beliefModels:{transferred:models.RESCUE_HOSTILE_OCCUPANCY_V1,negative:neg.RESCUE_HOSTILE_OCCUPANCY_V1}});results.push(t);transfer.push([a,t]);
          const no=episode(spec,'STRONG',{config,memory:'DISABLED'});
          results.push(no);memory.push({spec,disabled:no,episodic:a});
        }
      }
      console.log('EVALUATE',game,sensor,'D'+spec.difficulty,spec.index,a.terminal,b.terminal);
    }comparisons[game+':'+sensor]=paired(pairs);
  }
  const ood=[];for(const spec of specs.filter(s=>s.split==='STRUCTURAL_OOD')){const a=episode(spec,'STRONG',{config:PLAN.training}),b=episode(spec,'CANDIDATE',{model:worldModel.factory,config:PLAN.training});results.push(a,b);ood.push([a,b]);console.log('OOD_FACTORY','D'+spec.difficulty,spec.index,a.terminal,b.terminal);}
  const development=read(artifact('collection')).results.filter(r=>r.spec.game==='roguelike'&&r.spec.split==='DEVELOPMENT'&&r.kind==='STRONG');
  for(const m of memory){const experience=development.filter(r=>r.spec.difficulty===m.spec.difficulty).slice(-3).flatMap(r=>r.experience);
    m.crossEpisode=episode(m.spec,'STRONG',{config:PLAN.training,experience,memory:'CROSS_EPISODE_EXPERIENCE'});m.retrievalOnly=episode(m.spec,'STRONG',{config:PLAN.training,experience,memory:'RETRIEVAL_ONLY'});m.trainedConsumer=results.find(r=>r.spec.lineageId===m.spec.lineageId&&r.kind==='CANDIDATE'&&r.modelId===worldModel.roguelike.id&&r.sensor==='NORMAL');results.push(m.crossEpisode,m.retrievalOnly);
  }
  const result={results,comparisons,zeroShotTransfer:{source:'rescue',destination:'roguelike',model:models.RESCUE_HOSTILE_OCCUPANCY_V1.id,destinationRetuning:false,mapping:'Public LOS tiles, visible hostiles and same-episode last-seen hostile coordinates to current-cell occupancy. Excludes traps, attack range and future damage.',paired:paired(transfer),beliefEvidence:transfer.map(([a,b])=>({lineage:b.spec.lineageId,scores:b.beliefScores})),OOD_STATUS:'UNSEEN_DIAGNOSTIC_LAYOUT_FAMILY_NOT_RESERVED_STRUCTURAL_OOD'},negativeControls:Object.fromEntries(PLAN.worlds.map(g=>[g,paired(negative.filter(([a])=>a.spec.game===g))])),structuralOOD:{factory:paired(ood),others:'NOT_IMPLEMENTED'},memory:{disabledVsEpisodic:paired(memory.map(m=>[m.disabled,m.episodic])),episodicVsCrossEpisode:paired(memory.map(m=>[m.episodic,m.crossEpisode])),episodicVsRetrievalOnly:paired(memory.map(m=>[m.episodic,m.retrievalOnly])),episodicVsTrained:paired(memory.map(m=>[m.episodic,m.trainedConsumer])),limitation:'Cross-episode/retrieval stores are read by experimental action-head features only. Strong comparator does not consume them: these are intentional no-op controls, not learned Alexandria.'},regret:'NOT_SUPPORTED',promotion:false};
  save(artifact('evaluation'),result);return result;
}
function executionAudit(){
  if(existsSync(artifact('execution-audit')))return read(artifact('execution-audit'));
  const results=[];for(const game of [...PLAN.worlds,...PLAN.legacy])for(const difficulty of PLAN.difficulties)for(let i=0;i<PLAN.auditSamples;i++){const r=auditGame(game,difficulty,(0x7a010000+[...PLAN.worlds,...PLAN.legacy].indexOf(game)*0x100000+difficulty*0x1000+i*17)>>>0);results.push(r);console.log('AUDIT',game,'D'+difficulty,i,r.terminal,r.ticks);}
  save(artifact('execution-audit'),{results,scope:'Fresh isolated simulation reproduction of unchanged 3.1 action path; not live browser session telemetry',trainingDetected:false,canonicalActions:0,PrimeChanges:0});return results;
}
export function verifyLocal(){const r=registration();return{v31:checkManifest(resolve(DIR,'../v31'),r.protectedV31),canonical:checkManifest(resolve(GA,'../..'),r.protectedCanonical),source:checkManifest(DIR,r.source),frozenSource:(checkSource(frozenRead('freeze.json').source),true),inheritance:'Established nested predecessor check already passed once; not duplicated'};}
const phase=process.argv.find(a=>a.startsWith('--phase='))?.split('=')[1];
if(process.argv[1]===new URL(import.meta.url).pathname){
  if(phase==='prepare')prepare();else if(phase==='collect')collect();else if(phase==='train')fit();else if(phase==='evaluate')evaluate();else if(phase==='audit')executionAudit();else if(phase==='verify')console.log(JSON.stringify(verifyLocal()));
  else{prepare();executionAudit();collect();fit();evaluate();console.log(JSON.stringify(verifyLocal()));}
}
