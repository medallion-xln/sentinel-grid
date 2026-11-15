// H-DISC-1 entry gate. Extends the inherited conditions; never promotes a draft or weakens a failure.
import {readFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateRepository,CONDITIONS} from '../../stage3h-hdisc0-design-v1/readiness/campaign-entry-gate.mjs';
import {validateIssuance} from './evidence-bundle-manifest.mjs';
import {REPO,LANE,committedAtHead,readJ,sha} from './lib.mjs';
import {runAudit} from '../audit/inference-graph-audit.mjs';
import {verifyFreeze} from './preregistration-freeze.mjs';
export const DECLARATION=resolve(LANE,'protocol/HDISC1_CAMPAIGN_DECLARATION.json');
const inside=p=>{const full=resolve(REPO,p),rel=relative(REPO,full);if(rel.startsWith('..')||!rel||rel.startsWith('/'))throw Error('RECORD_PATH_OUTSIDE_REPOSITORY');return full;};
export function requireEvidence(gate,id,ok,reason,evidence){
 const c=gate.conditions[id];if(!ok){c.status='FAIL';if(!c.reasons.includes(reason))c.reasons.push(reason);}c.evidence={inherited:c.evidence,additional:evidence};
 return gate;
}
export function finalize(gate){gate.failing=CONDITIONS.filter(k=>gate.conditions[k].status!=='PASS');gate.passed=7-gate.failing.length;gate.decision=gate.failing.length?'NO_GO':'GO';gate.statement=gate.decision==='GO'?'All seven provenance conditions passed. This is not a performance qualification or authority grant.':'NO_GO: scientific execution remains blocked by the listed conditions.';return gate;}
export async function evaluateCampaign({declarationFile=DECLARATION,probe=false}={}){
 let declaration=null,manifest=null,issuance=null,loadProblem=null;
 try{declaration=readJ(declarationFile);if(declaration.campaignId!=='STAGE3H-H-DISC-1')throw Error('WRONG_CAMPAIGN');
  if(declaration.evidenceBundle?.manifestFile)manifest=readJ(inside(declaration.evidenceBundle.manifestFile));
  if(declaration.evidenceBundle?.issuanceRecord)issuance=readJ(inside(declaration.evidenceBundle.issuanceRecord));
 }catch(e){loadProblem=e.message;}
 const bundlePath=declaration?.evidenceBundle?.manifestFile;
 const result=await evaluateRepository({declarationFile:existsSync(declarationFile)?declarationFile:null,bundleManifestFile:bundlePath?inside(bundlePath):null,probe});
 const g=result.gate,issue=validateIssuance(issuance,manifest),issuancePath=declaration?.evidenceBundle?.issuanceRecord;
 if(issue.ok && JSON.stringify([...issuance.recipients].sort())!==JSON.stringify([...(manifest.access?.recipients??[])].sort())){issue.ok=false;issue.problems.push('ISSUANCE_RECIPIENTS_DIFFER_FROM_MANIFEST');}
 const committed=issuancePath?committedAtHead(relative(REPO,inside(issuancePath))):null;
 requireEvidence(g,CONDITIONS[2],issue.ok&&committed?.equalsHead===true,'OWNER_ISSUANCE_NOT_VERIFIED',{validation:issue,committed,loadProblem});
 // A backup must cover this exact issued bundle, not an unrelated prior campaign.
 let backup=null;try{backup=readJ(inside(declaration.backupAcceptanceRecord));}catch{}
 const bound=Boolean(manifest&&backup?.evidenceBundle?.manifestSha256===manifest.manifestSha256&&backup?.evidenceBundle?.bundleId===manifest.bundleId);
 requireEvidence(g,CONDITIONS[3],bound,'BACKUP_DOES_NOT_BIND_ISSUED_BUNDLE',{bundleBound:bound});
 requireEvidence(g,CONDITIONS[4],committedAtHead(relative(REPO,declarationFile)).equalsHead,'CAMPAIGN_DECLARATION_NOT_COMMITTED',null);
 const protocol=verifyFreeze();
 requireEvidence(g,CONDITIONS[4],protocol.ok,'HDISC1_PREREGISTRATION_NOT_VERIFIED',protocol);
 const inference=await runAudit({committed:true});
 requireEvidence(g,CONDITIONS[6],inference.COMMITTED_SOURCE_AUDIT==='PASS','HDISC1_COMMITTED_INFERENCE_AUDIT_NOT_PASS',{status:inference.COMMITTED_SOURCE_AUDIT,sourceHash:inference.core.H_DISC_1_SOURCE_HASH,violations:inference.core.violations});
 // Missing campaign implementation is not hidden by declaring only the inference entry point.
 const required=['campaign/learner.mjs','campaign/dataset.mjs','campaign/train.mjs','campaign/analysis.mjs','campaign/evaluate.mjs','campaign/native.mjs','campaign/runner.mjs','campaign/population.mjs'];
 const declared=new Set(declaration?.sourceEntryPoints??[]),missing=required.filter(p=>!declared.has(relative(REPO,resolve(LANE,p)))||!existsSync(resolve(LANE,p)));
 requireEvidence(g,CONDITIONS[5],missing.length===0,'CAMPAIGN_SOURCE_ENTRIES_INCOMPLETE',{missing});
 if(g.conditions[CONDITIONS[2]].status!=='PASS'&&(result.facts.source.closure?.protectedFiles??0)>0)requireEvidence(g,CONDITIONS[5],false,'PROTECTED_EVALUATION_SOURCE_REQUIRES_VERIFIED_ISSUANCE',null);
 return {schema:'HDISC1_CAMPAIGN_ENTRY_GATE_V1',authority:'R0',gate:finalize(g),declarationSha256:existsSync(declarationFile)?sha(readFileSync(declarationFile)):null,fullStage3HCertified:false,delegationEnabled:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--declaration'),result=await evaluateCampaign({declarationFile:i<0?DECLARATION:resolve(process.argv[i+1]),probe:process.argv.includes('--probe')});
 console.log(JSON.stringify(result,null,2));process.exitCode=result.gate.decision==='GO'?0:2;
}
