// Freeze the prospective scientific plan separately from the later post-training experiment freeze.
// No population or model is created; future execution still requires every provenance gate and a separate run record.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build as draft,validate,serialise,seal,PROTOCOL_FILE} from '../protocol/protocol.mjs';
import {linkClosure} from '../../stage3h-hdisc0-design-v1/readiness/bundle/evidence-bundle.mjs';
import {REPO,LANE,sha,stable,fileSha,committedAtHead} from './lib.mjs';
export const PROSPECTIVE=resolve(LANE,'protocol/HDISC1_FROZEN_PREREGISTRATION.json'),FREEZE=resolve(LANE,'protocol/HDISC1_PREREGISTRATION_FREEZE.json');
export const SOURCE_ENTRIES=['campaign/learner.mjs','campaign/dataset.mjs','campaign/train.mjs','campaign/analysis.mjs','campaign/evaluate.mjs','campaign/native.mjs','campaign/runner.mjs','campaign/population.mjs','api/discriminator-api.mjs','api/candidate-kernel.mjs','readiness/campaign-entry-gate.mjs','readiness/preregistration-freeze.mjs'].map(p=>relative(REPO,resolve(LANE,p)));
export function prospective(){
 const original=draft();if(validate(original).length||readFileSync(PROTOCOL_FILE,'utf8')!==serialise(original))throw Error('DRAFT_PROTOCOL_DRIFT');
 const closure=linkClosure(REPO,SOURCE_ENTRIES);if(closure.unresolved.length)throw Error('SOURCE_DEPENDENCY_UNRESOLVED:'+closure.unresolved.join(','));
 const scientific=structuredClone(original);
 scientific.status='PREREGISTRATION_FROZEN_EXECUTION_GATED';scientific.frozen=true;
 scientific.learnerConfiguration.status='FIXED_BY_PREREGISTRATION';
 scientific.identities.familySplitRule={...scientific.identities.familySplitRule,m:19,t:9};
 scientific.readiness.PREREGISTRATION_FROZEN=true;
 scientific.protocolSha256=seal(scientific).protocolSha256;
 // Keep original pending model/population identities as explicit later experiment-freeze obligations.
 return {schema:'HDISC1_FROZEN_PREREGISTRATION_V1',campaignId:original.campaignId,authority:'R0',status:'FROZEN',scope:'Prospective design and implementation source freeze; not the post-training experiment freeze.',
  authorizationBasis:{kind:'USER_INSTRUCTION',text:"work on passing all 7 conditions don't stop until completed",scope:'Local implementation, verification and preregistration/source commits necessary for the entry conditions. No owner backup attestation, distribution or scientific execution is asserted.'},
  predecessorDraftSha256:fileSha(PROTOCOL_FILE),scientific,
  sourceEntryPoints:SOURCE_ENTRIES,sourceHashes:Object.fromEntries(closure.files.sort().map(p=>[p,fileSha(resolve(REPO,p))])),
  resolution:{familySplit:{m:19,t:9,basis:'Matches the fixed validation/exploration planning ratio 900/1900. No family outcome was inspected to select these values.'},sharedConfiguration:'The existing 18-configuration grid and joint five-arm selection rule are fixed unchanged.'},
  experimentFreezeRequired:true,executionAuthorized:false,delegationEnabled:false,fullStage3HCertified:false};
}
export function verifyFreeze(){
 const problems=[];let plan,fr;
 try{plan=JSON.parse(readFileSync(PROSPECTIVE,'utf8'));fr=JSON.parse(readFileSync(FREEZE,'utf8'));}catch{return {ok:false,problems:['PREREGISTRATION_FREEZE_MISSING']};}
 try{if(stable(plan)!==stable(prospective()))problems.push('FROZEN_PLAN_OR_SOURCE_DRIFT');}catch(e){problems.push(e.message);}
 if(fr.schema!=='SENTINEL_PREREGISTRATION_FREEZE_V1'||fr.status!=='FROZEN'||fr.campaignId!==plan.campaignId||fr.protocol?.file!==relative(REPO,PROSPECTIVE)||fr.protocol.sha256!==fileSha(PROSPECTIVE))problems.push('FREEZE_RECORD_INVALID');
 for(const p of [PROSPECTIVE,FREEZE])if(!committedAtHead(relative(REPO,p)).equalsHead)problems.push('FREEZE_NOT_COMMITTED:'+relative(REPO,p));
 return {ok:problems.length===0,problems};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='prepare'){
  if(existsSync(PROSPECTIVE)||existsSync(FREEZE))throw Error('FREEZE_ALREADY_EXISTS');const plan=prospective();
  writeFileSync(PROSPECTIVE,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  writeFileSync(FREEZE,JSON.stringify({schema:'SENTINEL_PREREGISTRATION_FREEZE_V1',campaignId:plan.campaignId,status:'FROZEN',protocol:{file:relative(REPO,PROSPECTIVE),sha256:fileSha(PROSPECTIVE)},scope:plan.scope,experimentFreezeRequired:true,executionAuthorized:false},null,2)+'\n',{flag:'wx'});
  console.log('Prepared prospective freeze; committed-source verification is still required.');
 }else{const result=verifyFreeze();console.log(JSON.stringify(result,null,2));process.exitCode=result.ok?0:2;}
}
