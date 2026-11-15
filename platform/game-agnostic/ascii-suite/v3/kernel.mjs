import * as rescue from './worlds/rescue.mjs';
import * as cards from './worlds/cards.mjs';
import * as factory from './worlds/factory.mjs';
import * as roguelike from './worlds/roguelike.mjs';
import {VERSION,clone,freeze,hash,stable} from './common.mjs';
export const WORLDS={rescue,cards,factory,roguelike};
export function createWorld(game,seed,difficulty,config={}){const m=WORLDS[game];if(!m)throw Error('UNKNOWN_WORLD');for(let attempt=0;attempt<16;attempt++){const w=m.create(seed,difficulty,{...config,attempt}),feasibility=m.validate(w);if(feasibility.valid){w.admission={attempts:attempt+1,method:feasibility.method,solvability:feasibility.solvability};return w;}}throw Error('GENERATION_REJECTED_AFTER_16_ATTEMPTS');}
export const observe=(w,actorId)=>WORLDS[w.game].observe(w,actorId);
export const legalActions=(w,actorId)=>WORLDS[w.game].legal(observe(w,actorId));
export const getTerminalStatus=w=>({terminal:w.terminal,result:w.result,tick:w.tick});
export const getMetrics=w=>WORLDS[w.game].metrics(w);
export const actorId=w=>w.game==='cards'?'P'+w.turn:w.game==='rescue'?w.units[w.active].id:'P0';
export function packet(w,actor=actorId(w)){const observation=observe(w,actor),actions=WORLDS[w.game].legal(observation),binding={version:VERSION,actor,tick:w.tick,observationHash:hash(observation),actionsHash:hash(actions)};return freeze({schema:'OBSERVED_CONTROLLER_PACKET_V1',binding,observation,actions});}
export function step(w,actor,a){if(w.terminal)throw Error('TERMINAL_WORLD');if(actor!==actorId(w))throw Error('ACTOR_NOT_ACTIVE');const offered=legalActions(w,actor).find(x=>x.id===a?.id&&stable(x.parameters)===stable(a.parameters)&&x.type===a.type);if(!offered)throw Error('ILLEGAL_ACTION');return WORLDS[w.game].step(w,offered);}
export function acceptProposal(w,p,decision){if(hash(packet(w,p.binding.actor).binding)!==hash(p.binding))throw Error('STALE_BINDING');if(!decision||decision.abstain)throw Error('EXPERT_ABSTAINED_USE_EXPLICIT_RULE_FALLBACK');return step(w,p.binding.actor,decision.action);}
export function serializeReplay(initial,actions){let w=clone(initial);const records=[];for(const a of actions){const actor=actorId(w),before=hash(w);w=step(w,actor,a);records.push({actor,action:a,before,after:hash(w)});}return{schema:'PRIVATE_EXACT_REPLAY_V1',version:VERSION,game:initial.game,seed:initial.seed,difficulty:initial.difficulty,config:initial.config,initialHash:hash(initial),records,finalHash:hash(w),terminal:getTerminalStatus(w)};}
export function verifyReplay(r){let w=createWorld(r.game,r.seed,r.difficulty,r.config);if(hash(w)!==r.initialHash)throw Error('REPLAY_INITIAL_MISMATCH');for(const rec of r.records){if(hash(w)!==rec.before)throw Error('REPLAY_BEFORE_MISMATCH');w=step(w,rec.actor,rec.action);if(hash(w)!==rec.after)throw Error('REPLAY_AFTER_MISMATCH');}if(hash(w)!==r.finalHash)throw Error('REPLAY_FINAL_MISMATCH');return{pass:true,steps:r.records.length,terminal:getTerminalStatus(w)};}
export function publicRecord(w,action=null,previous=null,viewer=w.game==='cards'?'P0':actorId(w)){const payload={version:VERSION,observation:observe(w,viewer),action:action?{type:action.type,parameters:action.parameters}:null,previous};return{...payload,hash:hash(payload)};}
export function verifyPublicReplay(records){let previous=null;for(const {hash:digest,...payload} of records){if(payload.previous!==previous||hash(payload)!==digest)throw Error('PUBLIC_REPLAY_INTEGRITY_MISMATCH');previous=digest;}return{pass:true,scope:'PUBLIC_OBSERVATION_INTEGRITY_ONLY_NOT_KERNEL_REPLAY',records:records.length};}
