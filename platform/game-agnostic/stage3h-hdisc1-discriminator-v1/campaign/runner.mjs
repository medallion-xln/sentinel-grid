// Guarded scientific command entry. No command allocates, generates, trains or opens validation before GO.
import {existsSync,readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateCampaign} from '../readiness/campaign-entry-gate.mjs';
import {LANE,GA,REPO,committedAtHead,fileSha} from '../readiness/lib.mjs';
import {sourceIdentity} from '../api/host.mjs';
import {createCandidateKernel} from '../api/candidate-kernel.mjs';
import {loadForgeKernel} from '../../stage3h-sk1-safety-kernel-v1/api/host.mjs';
import {makeForgeEncoder} from '../discriminator/forge-encoder.mjs';
import {makePolicy} from '../../stage3h-hw4-value-band-v1/hw4-policy.mjs';
import {forgeRequest} from '../discriminator/forge-base/features.mjs';
import {evalClass} from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import {auditClass} from '../../stage3h-sk1-safety-kernel-v1/infra/audit-class.mjs';
import {allocation,buildPopulation,comboFor} from './native.mjs';
import {writePopulation,readPopulation,manifest,exclusive,checkDisjoint,digest} from './population.mjs';
import {trainExploration,modelRuntime} from './train.mjs';
import {evaluate} from './evaluate.mjs';
export const WORK=resolve(LANE,'work');
const read=name=>JSON.parse(readFileSync(resolve(WORK,name),'utf8'));
const path=name=>resolve(WORK,name),out=(name,value)=>exclusive(path(name),value);
const dpath=resolve(LANE,'protocol/HDISC1_CAMPAIGN_DECLARATION.json');
const inheritedModels={sk1:resolve(GA,'stage3h-sk1-safety-kernel-v1/models/SK1_MODEL.json'),c10:resolve(GA,'stage3h-hw4-value-band-v1/models/V1_PUBLIC_ONLY_C10_BASE_SAFE_FIRST.json')};
async function guard(){const r=await evaluateCampaign();if(r.gate.decision!=='GO')throw Error('CAMPAIGN_ENTRY_NO_GO:'+r.gate.failing.join(','));
 const d=JSON.parse(readFileSync(dpath,'utf8'));if(d.scientificExecutionReady!==true)throw Error('SCIENTIFIC_IMPLEMENTATION_REVIEW_REQUIRED');const name=d.campaignExecutionAuthorization;if(!name||!committedAtHead(name).equalsHead)throw Error('SEPARATE_CAMPAIGN_EXECUTION_RECORD_REQUIRED');
 const a=JSON.parse(readFileSync(resolve(REPO,name),'utf8'));if(a.campaignId!==d.campaignId||a.preregistrationSha256!==d.preregistration.protocolSha256||a.authority!=='R0'||a.authorized!==true||a.owner?.role!=='OWNER'||!a.owner?.name)throw Error('CAMPAIGN_EXECUTION_RECORD_INVALID');return r;}
function policies(training){return {sk1:loadForgeKernel(inheritedModels.sk1).kernel,c10:makePolicy(JSON.parse(readFileSync(inheritedModels.c10,'utf8'))),ladder:Object.fromEntries(Object.entries(training.models).map(([k,m])=>[k,createCandidateKernel(modelRuntime(m,training.binding))]))};}
export async function runCommand(command,args=[]){
 const gate=await guard();
 if(command==='allocate'){const a=allocation(args.map(Number));out('allocation.json',a);return {allocatedBlocks:a.blocks.length,digest:a.digest};}
 if(command==='generate'){
  const p=args[0];if(!['EXPLORATION','VALIDATION'].includes(p))throw Error('UNKNOWN_POPULATION');
  if(p==='VALIDATION'&&read('development-stop.json').pass!==true)throw Error('STOP_DEVELOPMENT');
  const a=read('allocation.json');
  // An interrupted generation consumes its reservation. It cannot be resumed or silently replaced.
  out(`generation-${p}-start.json`,{allocationDigest:a.digest,conservativelySpentBlocks:a.blocks,startedAt:new Date().toISOString()});
  const result=buildPopulation(a,p),m=writePopulation(WORK,result);out(`generation-${p}-result.json`,{population:p,classes:m.classes,funnel:result.funnel,spent:result.spent});return {population:p,classes:m.classes};
 }
 if(command==='train'){
  if(existsSync(path('generation-VALIDATION-start.json')))throw Error('VALIDATION_ALREADY_STARTED_TRAINING_REFUSED');
  const classes=readPopulation(WORK,'EXPLORATION','DEVELOPMENT'),a=read('allocation.json'),declaration=JSON.parse(readFileSync(dpath,'utf8'));
  const binding={sourceHash:sourceIdentity().sourceHash,trainingPopulationDigest:digest(classes.map(c=>c.id)),exclusionRegistryHash:a.exclusionContext,preregistrationHash:declaration.preregistration.protocolSha256};
  out('training-start.json',{binding,gateDigest:digest(gate)});
  const training=trainExploration(classes,binding);out('training.json',training);
  const sk1=loadForgeKernel(inheritedModels.sk1).kernel;let frozenDUnsafe=0;
  for(const c of classes){const q=forgeRequest(c.projection,c.evidence),r=sk1.recommend(q.state,q.legalActions,q.advisoryEvidence),d=r.recommendedActionOrAbstention,set=(d.kind==='RECOMMEND'?d.decisionSet:d.bestEffortNotRecommended?.decisionSet??[]).map(a=>a.index);if(!set.length)throw Error('FROZEN_SK1_COVERAGE_FAILED');const e=evalClass(c,set);frozenDUnsafe+=Number(e.introB||e.introN);}
  const candidateUnsafe=training.selected.perArm.M3,pass=candidateUnsafe<frozenDUnsafe;out('development-stop.json',{pass,candidateUnsafe,frozenDUnsafe,trainingSha256:fileSha(path('training.json'))});return {pass,candidateUnsafe,frozenDUnsafe};
 }
 if(command==='freeze'){
  checkDisjoint(WORK);if(read('development-stop.json').pass!==true)throw Error('STOP_DEVELOPMENT');const v=manifest(WORK,'VALIDATION'),e=manifest(WORK,'EXPLORATION');
  if((statSync(v.file).mode&0o777)!==0)throw Error('VALIDATION_OUTCOMES_OPEN');
  const fr={schema:'HDISC1_EXPERIMENT_FREEZE_V1',declarationSha256:fileSha(dpath),gateDigest:digest(gate),trainingSha256:fileSha(path('training.json')),populations:{EXPLORATION:e.m.digest,VALIDATION:v.m.digest},inheritedModels:Object.fromEntries(Object.entries(inheritedModels).map(([k,p])=>[k,fileSha(p)])),inferenceSourceHash:sourceIdentity().sourceHash};out('experiment-freeze.json',fr);return {frozen:true,digest:digest(fr)};
 }
 const freeze=read('experiment-freeze.json'),training=read('training.json');
 if(freeze.trainingSha256!==fileSha(path('training.json'))||freeze.declarationSha256!==fileSha(dpath)||freeze.inferenceSourceHash!==sourceIdentity().sourceHash||Object.entries(inheritedModels).some(([k,p])=>freeze.inheritedModels[k]!==fileSha(p)))throw Error('EXPERIMENT_FREEZE_CHANGED');
 for(const p of ['EXPLORATION','VALIDATION'])if(manifest(WORK,p).m.digest!==freeze.populations[p])throw Error('FROZEN_POPULATION_CHANGED');
 const p=policies(training),candidate=p.ladder.M3;
 if(command==='audit'){
  const a=read('allocation.json'),m=manifest(WORK,'VALIDATION').m,encoder=makeForgeEncoder(training.models.M3.vocabulary);
  const feat=(s,actions,evidence)=>{const encoded=encoder(s,actions,evidence);return {rows:encoded.descriptors.map(row=>[...row,...encoded.context])};};
  const records=m.entries.map(entry=>auditClass(entry,comboFor(a,entry),candidate,feat));out('audit.json',{records,experimentFreezeDigest:digest(freeze)});return {audited:records.length};
 }
 if(command==='run'||command==='check'){
  const check=command==='check',v=manifest(WORK,'VALIDATION'),audit=read('audit.json');if(audit.experimentFreezeDigest!==digest(freeze))throw Error('AUDIT_FREEZE_MISMATCH');
  if(!check){if((statSync(v.file).mode&0o777)!==0)throw Error('VALIDATION_OPENED_BEFORE_RUN');out('validation-start.json',{populationDigest:v.m.digest,experimentFreezeDigest:digest(freeze),startedAt:new Date().toISOString()});}
  if(read('validation-start.json').experimentFreezeDigest!==digest(freeze))throw Error('RUN_FREEZE_MISMATCH');
  const classes=readPopulation(WORK,'VALIDATION',check?'CHECK':'RUN'),result=evaluate({classes,...p,candidate,audit});
  if(check){const previous=read('validation-result.json');if(previous.decisionDigest!==result.decisionDigest||digest(previous.rows)!==digest(result.rows))throw Error('DECISION_REPLAY_MISMATCH');return {reproduced:true,decisions:classes.length};}
  out('validation-result.json',result);return {classification:result.classification,executionValid:result.executionValid};
 }
 throw Error('USAGE: runner.mjs allocate <blocks> | generate EXPLORATION|VALIDATION | train | freeze | audit | run | check');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(await runCommand(process.argv[2],process.argv.slice(3)),null,2));}catch(e){console.error(e.message);process.exitCode=2;}
}
