// Evaluator owner: seeds, replay state and outcomes NEVER enter inference.
import {resolve} from 'node:path';
import {create,packet,step,terminal,metrics,verifyReplay} from './kernel.mjs';
import {hash} from '../v3/common.mjs';
import {save,writer} from '../training-dev-v1/io.mjs';
import {createPolicy} from './policy.mjs';
export const percentile=(a,p)=>a.length?[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
export function episode(spec,{model=null,out=null,verify=true,decisionLimit=Infinity}={}){
 const id=spec.id??spec.game+'-'+spec.tier+'-'+spec.seed+'-'+spec.policy+'-'+spec.sensor,initial={game:spec.game,tier:spec.tier,seed:spec.seed,family:spec.family,sensor:spec.sensor??'NORMAL'};
 let w=create(initial.game,initial.seed,initial.tier,{family:initial.family,sensor:initial.sensor}),policies=Array.from({length:spec.game==='cards'?w.inner.players:1},(_,i)=>createPolicy(spec.game,i===0?spec.policy:'STRONG',{model:i===0?model:null,seed:74123+i*7919,partnerStyle:i>0?w.inner.ext.partnerStyle:null}));
 const actions=[],hashes=[hash(w.inner)],latencies=[],sourceCounts={},errors=[],reads=[];let changes=0,invocations=0,ops=0,abstentions=0,round=1;
 const publicWriter=out?writer(resolve(out,'public',id+'.jsonl')):null;
 while(!terminal(w)&&actions.length<decisionLimit){
  const p=packet(w),index=spec.game==='cards'?w.inner.turn:0;
  if(w.inner.ext.round!==round){round=w.inner.ext.round;policies=policies.map((_,i)=>createPolicy(spec.game,i===0?spec.policy:'STRONG',{model:i===0?model:null,seed:74123+i*7919,partnerStyle:i>0?w.inner.ext.partnerStyle:null}));}
  const d=policies[index].decide(p);latencies.push(d.latencyMs);sourceCounts[d.actionSource]=(sourceCounts[d.actionSource]??0)+1;ops+=d.work??0;abstentions+=+d.abstain;if(d.reason?.includes('EXCEPTION'))errors.push({tick:w.inner.tick,error:d.reason});if(d.contribution?.changed)changes++;if(d.contribution?.modelId)invocations++;
  publicWriter?.push({schema:'V32_PUBLIC_DECISION_V1',packet:p,decision:d,actor:p.binding.actor});
  actions.push(d.action);w=step(w,p,d.action);hashes.push(hash(w.inner));
 }
 const m=metrics(w),r={schema:'V32_EVALUATOR_ONLY_REPLAY_V1',initial,actions,hashes,final:m};
 const replayStatus=verify?verifyReplay(r):{pass:null,reason:'NOT_REQUESTED'};
 const result={id,spec,status:terminal(w)?'COMPLETED':'INCOMPLETE_DECISION_BUDGET',ticks:w.inner.tick,terminal:terminal(w),outcome:w.inner.result,metrics:m,sourceCounts,actionChanges:changes,modelInvocations:invocations,canonicalExpertInvocations:0,abstentions,errors,computePerDecision:ops/Math.max(1,actions.length),latencyMs:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),p99:percentile(latencies,.99)},replay:replayStatus,public:publicWriter?.close()??null};
 if(out){save(resolve(out,'evaluator',id+'.replay.json'),r);save(resolve(out,'evaluator',id+'.result.json'),result);}return result;
}
