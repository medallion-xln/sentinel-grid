import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { forgeRequest } from '../discriminator/forge-base/features.mjs';
import { sha256,stable } from '../discriminator/canonical.mjs';
import {CONTROLS} from '../../stage3h-sk1-safety-kernel-v1/infra/audit-class.mjs';
import { paired,interval,holm } from './analysis.mjs';
const sum=a=>a.reduce((x,y)=>x+y,0),unsafe=r=>Number(r.introB||r.introN);
const setOf=r=>{const d=r.recommendedActionOrAbstention;return (d.kind==='RECOMMEND'?d.decisionSet:d.bestEffortNotRecommended?.decisionSet??[]).map(a=>a.index);};
export function evaluate({classes,sk1,c10,candidate,ladder,audit}){
 if(classes.length!==900||classes.some(c=>c.population!=='VALIDATION')||new Set(classes.map(c=>c.id)).size!==900)throw Error('VALIDATION_POPULATION_INVALID');
 const families=classes.map(c=>c.family),counts=new Map();for(const f of families)counts.set(f,(counts.get(f)||0)+1);
 if(counts.size<30||Math.max(...counts.values())>45)throw Error('VALIDATION_FAMILY_SUPPLY_INVALID');
 const rows=[],times=[];let replay=true,illegal=0,abstentions=0;
 for(const c of classes){const q=forgeRequest(c.projection,c.evidence),call=k=>k.recommend(q.state,q.legalActions,q.advisoryEvidence),d=call(sk1),start=performance.now(),f=call(candidate);times.push(performance.now()-start);
  const again=call(candidate);replay&&=f.decisionHash===again.decisionHash;
  if(f.authority?.canDispatch!==false||f.rankedActions?.length!==q.legalActions.length)throw Error('CANDIDATE_AUTHORITY_OR_MENU_CONTRACT_INVALID');
  const sets={A:c.B,B:c.N,C:c10.decideProjection(c.projection).orbit,D:setOf(d),E:d.recommendedActionOrAbstention.kind==='RECOMMEND'?setOf(d):[],F:setOf(f)};
  for(const [name,k] of Object.entries(ladder))sets[name]=setOf(call(k));
  const metrics={};for(const [name,s] of Object.entries(sets)){
   const valid=Array.isArray(s)&&s.length&&new Set(s).size===s.length&&s.every(i=>Number.isInteger(i)&&i>=0&&i<c.menu.length);
   metrics[name]=valid?evalClass(c,s):{illegal:true,abstained:name==='E'};
  }
  if(metrics.F.illegal)illegal++;if(f.recommendedActionOrAbstention.kind!=='RECOMMEND')abstentions++;
  rows.push({id:c.id,family:c.family,metrics,decisionHash:f.decisionHash});
 }
 const usable=rows.every(r=>['A','B','C','D','F',...Object.keys(ladder)].every(a=>!r.metrics[a].illegal));
 if(!usable)return {classification:'H_DISC_EXPERIMENT_BLOCKED_OR_INVALID',executionValid:false,reason:'INCOMPLETE_OR_ILLEGAL_DECISIONS',illegal,abstentions,rows};
 const vector=(arm,key)=>rows.map(r=>Number(r.metrics[arm][key])),primary=paired(rows.map(r=>unsafe(r.metrics.F)),rows.map(r=>unsafe(r.metrics.D)),families);
 const regret={vsS0:interval(rows.map(r=>r.metrics.F.nreg-r.metrics.A.nreg),families),vsNexus:interval(rows.map(r=>r.metrics.F.nreg-r.metrics.B.nreg),families)};
 const sorted=[...times].sort((a,b)=>a-b),compute={medianMs:sorted[Math.floor(sorted.length/2)],maxMs:Math.max(...times)};
 const requiredAudits=['RELABEL','MENU','D4','HIDDEN'];
 const auditComplete=Array.isArray(audit?.records)&&audit.records.length===900&&new Set(audit.records.map(r=>r.id)).size===900&&rows.every(r=>audit.records.some(a=>a.id===r.id));
 const invariance=auditComplete&&audit.records.every(a=>requiredAudits.every(k=>a.byTest?.[k]?.n>0&&a.byTest[k].bad===0&&a.kind?.[k]?.bad===0)&&a.features?.frames===8&&a.features.bad===0&&a.repeatMismatch===0&&a.poisonMismatch===0&&a.legality?.illegal===0&&a.evidenceNotValid===0&&Array.isArray(a.unallowed)&&a.unallowed.length===0&&Object.entries(CONTROLS).every(([name,c])=>c.expect.every(k=>a.controls?.[name]?.[k]?.n>0&&a.controls[name][k].bad>0)));
 const gates={fullCoverage:abstentions===0,legal:illegal===0,replay,invariance,compute:compute.medianMs<=100&&compute.maxMs<=1000,
  zeroIntroductionsVsS0:sum(vector('F','introB'))===0,zeroIntroductionsVsNexus:sum(vector('F','introN'))===0,
  regretVsS0:regret.vsS0.point<=-.02&&regret.vsS0.upper95<0,regretVsNexus:regret.vsNexus.point<=-.02&&regret.vsNexus.upper95<0};
 const executionValid=gates.fullCoverage&&gates.legal&&gates.replay&&gates.invariance;
 const absolute=Object.values(gates).every(Boolean),quality=gates.regretVsS0&&gates.regretVsNexus&&gates.compute;
 const classification=(!executionValid||primary.reject&&!absolute&&!quality)?'H_DISC_EXPERIMENT_BLOCKED_OR_INVALID':absolute?'H_DISC_DEV_QUALIFIED':primary.reject&&quality?'H_DISC_MATERIAL_IMPROVEMENT_NOT_QUALIFIED':'H_DISC_NO_SUPPORTED_ADVANTAGE';
 const comparatorSpecific=Object.fromEntries(['introB','introN','catAny'].map(key=>[key,paired(vector('F',key),vector('D',key),families)]));
 return {classification,executionValid,primary,regret,gates,compute,comparatorSpecific,comparatorSpecificHolm:holm(Object.fromEntries(Object.entries(comparatorSpecific).map(([k,v])=>[k,v.p]))),secondaryInferenceAllowed:primary.reject,
  rows,decisionDigest:sha256(stable(rows.map(r=>[r.id,r.decisionHash]))),authority:'R0',delegationEnabled:false,fullStage3HCertified:false};
}
