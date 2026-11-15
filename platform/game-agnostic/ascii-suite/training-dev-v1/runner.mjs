// Dataset/evaluation owner. This is not part of the inference closure.
import {resolve} from 'node:path';
import {actorId,step,getMetrics,observe} from '../v3/kernel.mjs';
import {hash,clone} from '../v3/common.mjs';
import {initial,publicPacket,replay,curriculumStep} from './scenarios.mjs';
import {makePolicy} from './policy.mjs';
import {labels} from './evaluator.mjs';
import {transition} from './contract.mjs';
import {writer,save,digest} from './io.mjs';
import {predict} from './model.mjs';
export function episode(spec,kind,{root,model=null,config={},store=false,examples=null,experience=[],memory='EPISODIC',partner='RULE_BASELINE',beliefModels={}}={}){
  const id=[spec.split,spec.game,spec.difficulty,spec.index,kind,config.sensor??'NORMAL',memory,partner,model?.id??'none'].join('-');
  let w=initial(spec);const initialHash=hash(w),actions=[],policy=makePolicy(kind,{model,config,memory,experience,episodeId:id,partner}),teacher=makePolicy('STRONG',{config,episodeId:id+'-teacher',partner}),latencies=[],loss={};
  const publicWriter=store?writer(resolve(root,'public',id+'.jsonl')):null,labelWriter=store?writer(resolve(root,'evaluator',id+'.jsonl')):null;
  while(!w.terminal){
    const raw=publicPacket(w),start=performance.now(),d=policy.act(raw);latencies.push(performance.now()-start);
    // All comparators/teacher receive the same sensor condition; no fresh teacher under stale evaluation.
    const t=teacher.act(raw),before=hash(w),next=curriculumStep(w,actorId(w),d.action);
    const rec=transition({episodeId:id,worldId:w.game,environmentVersion:'ASCII3_ENGINEERING_AND_MAP_CURRICULA_V1+FROZEN_3.0.0',difficulty:w.difficulty,
      seedLineage:{population:spec.split,scenarioFamily:spec.curriculum??spec.mapCurriculum??spec.family,lineageId:spec.lineageId,topologyHash:spec.topologyHash},packet:d.packet,decision:d,next:observe(next,raw.binding.actor),terminal:{terminal:next.terminal,result:next.result},policyVersion:kind,modelWeightHash:model?digest(model.weights):null,memory:d.memory});
    if((store||Object.keys(beliefModels).length)&&!d.packet.observation.missing){
      const lab=labels(w,d.packet,d.state,t,rec.transitionId);lab.catastropheLabels={subsequentStepCatastrophic:getMetrics(next).catastrophic,scope:'CURRENT_EVALUATOR_STATUS_NOT_ACTION_CAUSAL_VALUE'};
      publicWriter?.push(rec);labelWriter?.push(lab);
      if(examples&&w.tick%4===0){
        if(w.game==='rescue')examples.RESCUE_HOSTILE_OCCUPANCY_V1.push(...lab.targets.filter(t=>t.kind==='HOSTILE_OCCUPANCY').map(({x,y})=>({x,y})));
        if(w.game==='cards')examples.CARDS_PLAYABILITY_V1.push(...lab.targets.map(({x,y})=>({x,y})));
        if(w.game==='factory'&&lab.ranking?.y>=0)examples.FACTORY_PUBLIC_ACTION_HEAD_V1.push(lab.ranking);
        if(w.game==='roguelike'&&lab.ranking?.y>=0)examples.ROGUE_EPISODIC_ACTION_HEAD_V1.push(lab.ranking);
      }
      for(const[id,m]of Object.entries(beliefModels)){
        const targets=lab.targets.filter(t=>t.kind===(w.game==='cards'?'CARD_PLAYABILITY':'HOSTILE_OCCUPANCY'));
        const z=loss[id]??{squared:0,logLoss:0,n:0,positives:0,bins:Array.from({length:10},()=>({p:0,y:0,n:0}))};
        for(const t of targets){const p=predict(m,t.x);z.squared+=(p-t.y)**2;z.logLoss-=t.y*Math.log(Math.max(1e-12,p))+(1-t.y)*Math.log(Math.max(1e-12,1-p));z.n++;z.positives+=t.y;const bin=z.bins[Math.min(9,Math.floor(p*10))];bin.p+=p;bin.y+=t.y;bin.n++;}loss[id]=z;
      }
    }
    actions.push({action:d.action,before,after:hash(next)});w=next;
  }
  const exact=replay(spec,initialHash,actions,hash(w));
  // Privileged deterministic kernel replay is deliberately kept out of public packets.
  if(store)save(resolve(root,'evaluator',id+'.replay.json'),{schema:'EVALUATOR_PRIVATE_CURRICULUM_REPLAY_V1',spec,initialHash,records:actions,finalHash:hash(w),verification:exact});
  const metrics=getMetrics(w);latencies.sort((a,b)=>a-b);
  const result={id,spec,kind,modelId:model?.id??null,modelWeightHash:model?digest(model.weights):null,sensor:config.sensor??'NORMAL',memory,partner,terminal:w.result,ticks:w.tick,metrics,stats:policy.stats,
    inferenceLatencyMs:{p50:latencies[Math.floor(latencies.length*.5)],p95:latencies[Math.floor(latencies.length*.95)],p99:latencies[Math.floor(latencies.length*.99)]},exactReplay:exact,beliefScores:Object.fromEntries(Object.entries(loss).map(([id,z])=>[id,{brier:z.squared/z.n,logLoss:z.logLoss/z.n,queries:z.n,positives:z.positives,calibration:z.bins.map(b=>({count:b.n,meanPrediction:b.n?b.p/b.n:null,frequency:b.n?b.y/b.n:null}))}])),
    publicArtifact:publicWriter?.close()??null,labelArtifact:labelWriter?.close()??null,
    experience:[...policy.histories.values()].flatMap(s=>Object.values(s.enemies).filter(e=>e.type).map(({type,damage,tick})=>({type,damage,tick,sourceEpisode:id,difficulty:w.difficulty,uncertainty:'HISTORICAL_TYPE_DAMAGE_RECHECK_CURRENT_EVIDENCE',expiry:'THREE_EPISODES',coordinatesIncluded:false})))};
  return result;
}
export function paired(rows){
  const ds=rows.map(([a,b])=>+b.metrics.success-+a.metrics.success),rs=rows.map(([a,b])=>b.metrics.episodeReturn-a.metrics.episodeReturn),newCat=rows.filter(([a,b])=>!a.metrics.catastrophic&&b.metrics.catastrophic).length;
  let rng=123456789;const next=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;},bs=[];
  for(let n=0;n<2000;n++){let sum=0;for(let i=0;i<ds.length;i++)sum+=ds[Math.floor(next()*ds.length)];bs.push(sum/ds.length);}bs.sort((a,b)=>a-b);
  const mean=a=>a.reduce((a,b)=>a+b,0)/a.length;
  return{episodes:rows.length,successDelta:mean(ds),returnDelta:mean(rs),successDelta95:[bs[50],bs[1950]],newCatastrophes:newCat,catastrophicDelta:mean(rows.map(([a,b])=>+b.metrics.catastrophic-+a.metrics.catastrophic)),computeDelta:mean(rows.map(([a,b])=>b.stats.featureOperations-a.stats.featureOperations)),regret:'NOT_SUPPORTED',acceptance:newCat===0&&mean(ds)>=.1&&bs[50]>0?'REQUIRES_INDEPENDENT_REPLICATION_AND_INTERFACE_QUALIFICATION':'REJECTED_OR_NO_MATERIAL_IMPROVEMENT'};
}
export function summarize(rows){const mean=k=>rows.reduce((v,r)=>v+r.metrics[k],0)/rows.length,n=rows.length,p=mean('success'),z=1.96,c=(p+z*z/(2*n))/(1+z*z/n),h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);return{episodes:n,successRate:p,successWilson95:[c-h,c+h],catastrophicRate:mean('catastrophic'),meanReturn:mean('episodeReturn'),completed:rows.filter(r=>r.terminal!=='IN_PROGRESS').length,ticks:rows.reduce((v,r)=>v+r.ticks,0),inferences:rows.reduce((v,r)=>v+r.stats.inferences,0),trainedActionChanges:rows.reduce((v,r)=>v+r.stats.changes,0),fallbacks:rows.reduce((v,r)=>v+r.stats.fallbacks,0),memoryReads:rows.reduce((v,r)=>v+r.stats.memoryReads,0),memoryWrites:rows.reduce((v,r)=>v+r.stats.memoryWrites,0)};}
