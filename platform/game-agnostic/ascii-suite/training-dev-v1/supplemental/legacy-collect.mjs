// Supplementary DEVELOPMENT-only public corpus. Never used to fit frozen candidates.
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createGame,observe,legalActions,stepGame,metricsOf} from '../../games.mjs';
import {createController,PRIMARY_BASELINE} from '../../controllers/index.mjs';
import {transition} from '../contract.mjs';
import {hash} from '../../v3/common.mjs';
import {DIR,save,writer,digest,raw} from '../io.mjs';
const ROOT=resolve(DIR,'runs/ascii3-offline-dev-001/legacy-development');
const plan={schema:'LEGACY_PUBLIC_CORPUS_DEV_SUPPLEMENT_V1',worlds:['pong','platformer','fighter','racing'],difficulties:[1,2,3,4,5],samplesPerCell:1,policies:['STRONG','RULE','EXPLORATION'],seedBase:0x792a0000,split:'DEVELOPMENT_ONLY',trainingUse:false,validationUse:false,canonicalUse:false,reason:'Faithful canonical expert/action codecs do not exist for these worlds. Collect public provenance without inventing a neural transfer mapping.',legacyRiskLabels:'NOT_SUPPORTED_NO_REGISTERED_CATASTROPHE_CONTRACT'};
function run(){
  if(existsSync(resolve(ROOT,'collection.json')))throw Error('IMMUTABLE_SUPPLEMENT_ALREADY_EXISTS');
  save(resolve(ROOT,'preregistration.json'),{plan,planHash:digest(plan),sourceHash:raw(fileURLToPath(import.meta.url)),registeredAt:new Date().toISOString(),modelFreezeHash:raw(resolve(DIR,'runs/ascii3-offline-dev-001/model-freeze.json'))});
  const results=[];
  for(const game of plan.worlds)for(const difficulty of plan.difficulties)for(const kind of plan.policies){
    const seed=(plan.seedBase+plan.worlds.indexOf(game)*0x100000+difficulty*0x1000)>>>0,id=`LEGACY-DEVELOPMENT-${game}-D${difficulty}-${kind}`,version=kind==='STRONG'?'SENTINEL':kind==='RULE'?PRIMARY_BASELINE[game]:'UNIFORM_RANDOM';
    let w=createGame(game,{seed,difficulty}),replay=createGame(game,{seed,difficulty}),totalReturn=0;const controller=createController(game,version,{seed:918273}),teacher=createController(game,'SENTINEL'),pub=writer(resolve(ROOT,'public',id+'.jsonl')),labels=writer(resolve(ROOT,'evaluator',id+'.jsonl')),actions=[];
    if(controller.access!=='OBSERVATION_ONLY'||teacher.access!=='OBSERVATION_ONLY')throw Error('PRIVILEGED_LEGACY_CONTROLLER');
    while(!w.terminal){
      const o={schema:'LEGACY_ASCII_PUBLIC_OBSERVATION_V1',game,...observe(w)},offered=legalActions(w).map(type=>({id:type,type,parameters:{}})),p={schema:'OBSERVED_CONTROLLER_PACKET_V1',observation:o,actions:offered,binding:{version:w.engine,actor:'P0',tick:w.tick,observationHash:hash(o),actionsHash:hash(offered)},receiptTick:w.tick,observationAge:0,sensor:'NATIVE_LEGACY_SENSOR',objective:{type:'FROZEN_LEGACY_GAME_OBJECTIVE'}};
      const d=controller.decide(w,{observation:o}),t=teacher.decide(w,{observation:o}),before=hash(w),next=stepGame(w,d.action);totalReturn+=next.reward;
      const rec=transition({episodeId:id,worldId:game,environmentVersion:w.engine,difficulty,seedLineage:{population:'DEVELOPMENT_ONLY',lineageId:`LEGACY-SUPPLEMENT:${game}:D${difficulty}`},packet:p,decision:{action:offered.find(a=>a.id===d.action),source:kind==='STRONG'?'LEGACY_GAME_PLANNER':kind==='RULE'?'BOUNDED_PLANNER_FALLBACK':'INVALID_OR_UNKNOWN',fallbackReason:kind==='EXPLORATION'?'CONTROLLED_RANDOM_LEGAL_EXPLORATION_NOT_EXPERT':null},next:{schema:'LEGACY_ASCII_PUBLIC_OBSERVATION_V1',game,...observe(next)},terminal:{terminal:next.terminal,result:next.result},policyVersion:version});
      pub.push(rec);labels.push({schema:'EVALUATOR_OWNED_LABEL_V1',transitionId:rec.transitionId,teacherRecommendation:t.action,teacherIdentity:'LEGACY_OBSERVATION_ONLY_GAME_PLANNER',teacherLimitations:'No optimality, canonical expertise or conditional regret guarantee',catastropheLabels:null,conditionalActionValues:null,conditionalRegret:null});actions.push({action:d.action,before,after:hash(next)});w=next;
    }
    for(const r of actions){if(hash(replay)!==r.before)throw Error('LEGACY_EXACT_BEFORE');replay=stepGame(replay,r.action);if(hash(replay)!==r.after)throw Error('LEGACY_EXACT_AFTER');}
    const row={id,game,difficulty,kind,policyVersion:version,terminal:w.result,ticks:w.tick,evaluatorReturn:totalReturn,metrics:metricsOf(w),exactReplay:true,publicArtifact:pub.close(),labelArtifact:labels.close(),modelInference:0,canonicalExpertActions:0,memoryReads:null,memoryWrites:null};results.push(row);console.log('LEGACY_PUBLIC_CORPUS',game,'D'+difficulty,kind,w.result,w.tick);
  }
  save(resolve(ROOT,'collection.json'),{schema:plan.schema,planHash:digest(plan),results,episodes:results.length,decisions:results.reduce((v,r)=>v+r.ticks,0),datasetHash:digest(results.map(r=>[r.id,r.publicArtifact.hash,r.labelArtifact.hash])),scope:'DEVELOPMENT_ONLY_EXCLUDED_FROM_TRAINING_AND_VALIDATION'});
}
if(process.argv[1]===fileURLToPath(import.meta.url))run();
