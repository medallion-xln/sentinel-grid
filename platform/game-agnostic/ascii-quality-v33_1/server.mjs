// ASCII Worlds v33.1 local server — additive copy of ascii-quality-v33/server.mjs (protected, unchanged) with the v33.1 policy
// registry: adds the versioned candidate controllers STRONG_V33_1 (platformer) and STRONG_RESCUE_V33_1 (rescue). Mechanics (v32),
// presentation (v33 render/UI, served read-only from the v33 lane) and every inherited controller are unchanged. R0.
// ASCII Worlds v33 local server (corrective presentation lane). Uses the UNCHANGED v32 kernel, policies and mechanics;
// only rendering, HUD and controller attribution differ. R0: no dispatch, no training, no promotion.
import http from 'node:http';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {create,packet,observe,step,terminal,metrics,actor} from '../ascii-suite/v32/kernel.mjs';import {createPolicyV331} from './policy-v33_1.mjs';import {LEVELS} from '../ascii-suite/v32/catalog.mjs';import {hash} from '../ascii-suite/v3/common.mjs';
import {render} from '../ascii-quality-v33/render-v33.mjs';import {observeFighter} from '../ascii-suite/worlds/fighter.mjs';
// Operator display for Fighter: the CURRENT arena (symmetric public information), not P0's 2-tick-delayed perception, so KO
// and round-boundary frames are visible. Controllers still receive only their own delayed packet.
export function operatorFighterView(w,o){const e=w.inner.ext,cur=observeFighter(w.inner);return{...o,...cur,round:e.round,rounds:e.rounds,timeLeft:900-e.roundTick,terminal:w.inner.terminal,result:w.inner.result,displayBasis:'CURRENT_ARENA_OPERATOR_VIEW'};}
const lastRound=w=>{const r=w.inner.ext?.roundResults?.at(-1);return r?`last round R${r.round} ${r.opponentHealth<=0?'KO_WIN':r.playerHealth<=0?'KO_LOSS':r.win?'TIME_WIN':'TIME_LOSS'} (P0 ${r.playerHealth} / OPP ${r.opponentHealth})`:'';};

// Attribution taxonomy. Every inherited controller here is a game planner or control; none is a Sentinel expert.
export const CONTROLLERS={STRONG:{label:'Baseline game planner (inherited)',owner:'BASELINE_GAME_PLANNER'},STRONG_V33_1:{label:'v33.1 candidate: platformer planner V2 (APPROACH_UNTIL_CLEARABLE); platformer only',owner:'EXPERIMENTAL_POLICY'},STRONG_RESCUE_V33_1:{label:'v33.1 candidate: rescue controller with stale-packet guard; rescue only',owner:'EXPERIMENTAL_POLICY'},RULE:{label:'Rule baseline (inherited)',owner:'BASELINE_GAME_PLANNER'},NO_MEMORY:{label:'No-memory baseline planner',owner:'BASELINE_GAME_PLANNER'},RANDOM:{label:'Random legal control',owner:'BASELINE_GAME_PLANNER'},WAIT:{label:'Wait control',owner:'BASELINE_GAME_PLANNER'},SPAM:{label:'Single-action spam control',owner:'BASELINE_GAME_PLANNER'}};
export const OWNERS=['BASELINE_GAME_PLANNER','EXPERIMENTAL_POLICY','CANONICAL_SENTINEL_EXPERT','HUMAN_MANUAL'];
function objective(o){if(o.game==='platformer'){const d=o.dependencies??{},inv=d.inventory??{};return{goal:'Reach the exit',exit:o.exit??'ahead (not yet in view)',stage:`${o.stage}/${o.stages}`,prerequisites:o.tier>=2?{key:inv.keys?'COLLECTED':'REQUIRED',switch:inv.switch?'ON':'REQUIRED',gate:d.gate?.open?'OPEN':'CLOSED'}:'NONE (gate open at Advanced)'};}
 if(o.game==='fighter')return{goal:'Win every round by KO or by health at time-out',round:`${o.round}/${o.rounds}`,timeLeft:o.timeLeft,timeoutRule:'At 900 round ticks the higher health wins; equal health is a DRAW (not a win)',perception:`P0 view delayed ${o.opponentCapabilities?.reactionTicks??0} ticks (reaction model)`};
 return{goal:o.finalObjective??'See game rules',note:'Presentation unchanged from v32 for this game (shallow regression only)'};}
const createPolicy=(game,kind,opts)=>createPolicyV331(game,kind,opts);
export function createServer(){const sessions=new Map();
 const view=(s,id)=>{const viewer=s.w.game==='cards'?'P0':actor(s.w),p=packet(s.w,viewer),o=observe(s.w,viewer),last=s.last;
  const actionLine=last?`last action ${last.type} by ${last.owner}`:'no action yet';
  return{session:id,game:s.w.game,tier:s.w.tier,observation:o,binding:p.binding,actions:p.actions,frame:render(s.w.game==='fighter'?operatorFighterView(s.w,o):o,{owner:CONTROLLERS[s.kind].owner,actionLine:s.w.game==='fighter'&&lastRound(s.w)?actionLine+' | '+lastRound(s.w):actionLine}),metrics:metrics(s.w),objective:objective(o),
   attribution:{selectedController:s.kind,controllerLabel:CONTROLLERS[s.kind].label,controllerOwner:CONTROLLERS[s.kind].owner,lastAction:last,canonicalSentinelExpertContribution:0,canonicalExpertsInvoked:[]},
   operatorContext:{seed:s.w.seed,note:'Operator session control only; never controller input. The seed plus the public generator can reveal hidden state to the operator.'},terminal:terminal(s.w),result:s.w.inner.result,authority:'R0',renderVersion:'ASCII_V33_RENDER',mechanicsVersion:'ASCII_V32_UNCHANGED'};};
 return http.createServer(async(req,res)=>{const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
  try{const u=new URL(req.url,'http://127.0.0.1');
   if(req.method==='GET'&&u.pathname==='/api/catalog')return json(200,{levels:LEVELS,controllers:CONTROLLERS,owners:OWNERS});
   const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};if(req.method==='GET'&&files[u.pathname]){const f=files[u.pathname];res.writeHead(200,{'Content-Type':f.endsWith('html')?'text/html':f.endsWith('js')?'text/javascript':'text/css','Cache-Control':'no-store'});return res.end(await readFile(new URL('../ascii-quality-v33/ui/'+f,import.meta.url)));}
   if(req.method!=='POST'||!['/api/reset','/api/step','/api/replay'].includes(u.pathname))return json(404,{error:'NOT_FOUND'});
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'CROSS_ORIGIN_REFUSED'});
   let body='';for await(const c of req){body+=c;if(body.length>16384)return json(413,{error:'REQUEST_TOO_LARGE'});}const b=JSON.parse(body||'{}');
   if(u.pathname==='/api/reset'){const kind=b.controller??'STRONG';if(!CONTROLLERS[kind])throw Error('UNKNOWN_CONTROLLER');
    const w=create(b.game,Number(b.seed),Number(b.tier),{family:'V32_DEV_OFFSET',sensor:b.sensor??'NORMAL'}),id=randomUUID(),policies=Array.from({length:w.game==='cards'?w.inner.players:1},(_,i)=>createPolicy(w.game,i===0?kind:'STRONG',{partnerStyle:i>0?w.inner.ext.partnerStyle:null}));
    if(b.session)sessions.delete(b.session);if(sessions.size>=8)sessions.delete(sessions.keys().next().value);const s={w,kind,policies,round:1,actions:[],last:null};sessions.set(id,s);return json(200,view(s,id));}
   const s=sessions.get(b.session);if(!s)return json(404,{error:'RESET_REQUIRED'});
   if(u.pathname==='/api/replay')return json(200,{scope:'PUBLIC_ACTION_LOG',actions:s.actions});
   const viewer=s.w.game==='cards'?'P0':actor(s.w);if(hash(packet(s.w,viewer).binding)!==hash(b.binding))throw Error('STALE_BINDING');if(terminal(s.w))throw Error('EPISODE_TERMINAL_RESET_REQUIRED');
   const count=b.auto?Math.min(24,Math.max(1,Number(b.batch??8))):1;
   for(let i=0;i<count&&!terminal(s.w);i++){if(s.round!==s.w.inner.ext.round){s.round=s.w.inner.ext.round;s.policies=s.policies.map((_,i)=>createPolicy(s.w.game,i===0?s.kind:'STRONG',{partnerStyle:i>0?s.w.inner.ext.partnerStyle:null}));}
    const p=packet(s.w),index=s.w.game==='cards'?s.w.inner.turn:0,partner=s.w.game==='cards'&&index!==0,manual=!b.auto&&!partner;
    const d=manual?{action:p.actions.find(a=>a.id===b.actionId)}:s.policies[index].decide(p);if(!d.action)throw Error('ILLEGAL_MANUAL_ACTION');
    const owner=manual?'HUMAN_MANUAL':partner?'BASELINE_GAME_PLANNER':CONTROLLERS[s.kind].owner; /* v33.1: candidate controllers are attributed to EXPERIMENTAL_POLICY, never to the inherited baseline */s.w=step(s.w,p,d.action);s.last={actor:p.binding.actor,type:d.action.type,owner,tick:p.binding.tick};s.actions.push(s.last);if(s.actions.length>4000)s.actions.shift();}
   return json(200,view(s,b.session));}catch(e){json(400,{error:e.message});}});}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createServer(),port=Number(process.env.ASCII_V33_1_PORT??4186);server.listen(port,'127.0.0.1',()=>console.log(`ASCII Worlds v33.1 (candidate controllers; v33 presentation; v32 mechanics unchanged): http://127.0.0.1:${port}`));for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>process.exit(0)));}
