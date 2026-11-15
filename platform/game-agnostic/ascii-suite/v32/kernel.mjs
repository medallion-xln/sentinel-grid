import {clone,freeze,hash,stable,action} from '../v3/common.mjs';
import {createLegacy,observeLegacy,legalLegacy,stepLegacy,metricsLegacy,LEGACY} from './legacy-extension.mjs';
import {createStrategic,observeStrategic,legalStrategic,stepStrategic,metricsStrategic,actorStrategic} from './strategic-extension.mjs';
import {level,VERSION} from './catalog.mjs';
export function create(game,seed=1,tier=1,{family='V32_TRAIN_RECTILINEAR',sensor='NORMAL'}={}){
 if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('SEED_UINT32_REQUIRED');const scenario=level(game,tier);
 if(!['NORMAL','DELAYED','STALE','MISSING','PARTIAL'].includes(sensor))throw Error('UNKNOWN_SENSOR');
 const inner=LEGACY.includes(game)?createLegacy(game,seed,tier,family):createStrategic(game,seed,tier,family);
 if(game==='fighter'){inner.ext.externalDelay=sensor==='DELAYED'?2:sensor==='STALE'?10:0;inner.ext.externalMissing=sensor==='MISSING';}
 return{version:VERSION,scenario:scenario.id,game,seed,tier,family,sensor,inner,observationHistory:{}};
}
export const actor=w=>LEGACY.includes(w.game)?'P0':actorStrategic(w.inner);
export const terminal=w=>w.inner.terminal;
export const metrics=w=>LEGACY.includes(w.game)?metricsLegacy(w.inner):metricsStrategic(w.inner);
export function observe(w,viewer=actor(w)){const o=LEGACY.includes(w.game)?observeLegacy(w.inner):observeStrategic(w.inner,viewer);return freeze({...o,game:w.game,scenario:w.scenario,version:w.version,tier:w.tier,trainingStatus:'INACTIVE',authority:'R0'});}
export function legal(w,viewer=actor(w)){if(terminal(w)||viewer!==actor(w))return[];return LEGACY.includes(w.game)?legalLegacy(w.inner).map(type=>action(type)):legalStrategic(w.inner,viewer);}
export function packet(w,viewer=actor(w),{clean=false}={}){
 let o=observe(w,viewer),current=o,history=w.observationHistory[viewer]??[],age=w.sensor==='DELAYED'?2:w.sensor==='STALE'?10:0;
 if(!clean&&age)o=history[Math.max(0,history.length-age)]??o;
 if(!clean&&w.sensor==='PARTIAL'){o=clone(o);if(o.tiles)o.tiles=o.tiles.filter((_,i)=>i%3!==0);if(o.civilians)o.civilians=o.civilians.filter((_,i)=>i%2===0);if(o.enemies)o.enemies=o.enemies.filter((_,i)=>i%2===0);if(o.preview)o.preview=o.preview.slice(0,2);if(o.balls)o.balls=o.balls.filter((_,i)=>i%2===0);}
 const missing=!clean&&w.sensor==='MISSING'&&w.inner.tick%4===1;
 if(missing)o=null;
 const actions=legal(w,viewer),binding={version:VERSION,actor:viewer,tick:w.inner.tick,observationHash:hash(o),actionsHash:hash(actions)};
 return freeze({schema:'V32_PUBLIC_PACKET_V1',binding,observation:o,actions,sensor:{kind:clean?'NORMAL':w.sensor,age:o?w.inner.tick-o.tick:null,sourceTick:o?.tick??null,missing,legality:'FRESH_OFFERED_ACTIONS_SEPARATE_FROM_STALE_OBSERVATION; no future target oracle'}});
}
export function step(w,p,a){
 if(hash(packet(w,p.binding.actor).binding)!==hash(p.binding))throw Error('STALE_PACKET');
 const offered=p.actions.find(x=>x.id===a?.id&&x.type===a.type&&stable(x.parameters)===stable(a.parameters));if(!offered)throw Error('ILLEGAL_ACTION');
 const next=clone(w),who=actor(w);for(const viewer of w.game==='cards'?Array.from({length:w.inner.players},(_,i)=>'P'+i):[who]){next.observationHistory[viewer]??=[];next.observationHistory[viewer].push(observe(w,viewer));if(next.observationHistory[viewer].length>16)next.observationHistory[viewer].shift();}
 next.inner=LEGACY.includes(w.game)?stepLegacy(w.inner,a.type):stepStrategic(w.inner,a);return next;
}
export function replay(initial,actions){let w=create(initial.game,initial.seed,initial.tier,{family:initial.family,sensor:initial.sensor});const hashes=[hash(w.inner)];for(const a of actions){w=step(w,packet(w),a);hashes.push(hash(w.inner));}return{schema:'V32_EVALUATOR_ONLY_REPLAY_V1',initial:{game:initial.game,seed:initial.seed,tier:initial.tier,family:initial.family,sensor:initial.sensor},actions,hashes,final:metrics(w)};}
export function verifyReplay(r){const result=replay(r.initial,r.actions);if(hash(result)!==hash(r))throw Error('REPLAY_DIVERGED');return{pass:true,steps:r.actions.length};}
