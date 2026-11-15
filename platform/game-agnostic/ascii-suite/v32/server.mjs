import http from 'node:http';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {create,packet,observe,step,terminal,metrics,actor} from './kernel.mjs';import {createPolicy,POLICIES} from './policy.mjs';import {LEVELS} from './catalog.mjs';import {hash} from '../v3/common.mjs';import {render} from './render.mjs';
export function createServer(){
 const sessions=new Map();const view=(s,id)=>{const viewer=s.w.game==='cards'?'P0':actor(s.w),p=packet(s.w,viewer),o=observe(s.w,viewer);return{session:id,observation:o,binding:p.binding,actions:p.actions,frame:render(o),metrics:metrics(s.w),decision:s.decision??null,controller:s.kind,trainingStatus:'INACTIVE',activeController:s.kind==='STRONG'?'EXISTING_PLANNER':s.kind,trainedCandidate:'AVAILABLE_EXPERIMENTAL_NOT_ACTIVE_UNLESS_EXPLICITLY_LOADED',authority:{tier:'R0',canDispatch:false,canMutateLiveWorld:false,onlineLearning:false,promoted:false},seed:s.w.seed,sensor:s.w.sensor,terminal:terminal(s.w),result:s.w.inner.result,levelStatus:'DEVELOPMENT_SCENARIO — see qualification artifacts; not scientific certification'};};
 return http.createServer(async(req,res)=>{
  const json=(code,v)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(v));};
  try{
   const u=new URL(req.url,'http://127.0.0.1');if(req.method==='GET'&&u.pathname==='/api/catalog')return json(200,{levels:LEVELS,policies:POLICIES.filter(p=>!['V2_CANDIDATE','EXPERIMENTAL_TRAINED_MEMORY'].includes(p))});
   const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};if(req.method==='GET'&&files[u.pathname]){const f=files[u.pathname];res.writeHead(200,{'Content-Type':f.endsWith('html')?'text/html':f.endsWith('js')?'text/javascript':'text/css','Cache-Control':'no-store'});return res.end(await readFile(new URL('./ui/'+f,import.meta.url)));}
   if(req.method!=='POST'||!['/api/reset','/api/step','/api/replay'].includes(u.pathname))return json(404,{error:'NOT_FOUND_NO_PRIVATE_STATE_OR_TRAINING_ENDPOINT'});
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'CROSS_ORIGIN_REFUSED'});
   let body='';for await(const c of req){body+=c;if(body.length>16384)return json(413,{error:'REQUEST_TOO_LARGE'});}const b=JSON.parse(body||'{}');
   if(u.pathname==='/api/reset'){
    const kind=b.controller??'STRONG';if(!POLICIES.includes(kind)||['V2_CANDIDATE','EXPERIMENTAL_TRAINED_MEMORY'].includes(kind))throw Error('MODEL_NOT_LOADED_OR_CONTROLLER_UNKNOWN');
    const w=create(b.game,Number(b.seed),Number(b.tier),{family:'V32_DEV_OFFSET',sensor:b.sensor??'NORMAL'}),id=randomUUID(),policies=Array.from({length:w.game==='cards'?w.inner.players:1},(_,i)=>createPolicy(w.game,i===0?kind:'STRONG',{partnerStyle:i>0?w.inner.ext.partnerStyle:null}));if(b.session)sessions.delete(b.session);if(sessions.size>=8)sessions.delete(sessions.keys().next().value);const s={w,kind,policies,round:1,actions:[],initial:{game:w.game,seed:w.seed,tier:w.tier,family:w.family,sensor:w.sensor},sourceCounts:{}};sessions.set(id,s);return json(200,view(s,id));
   }
   const s=sessions.get(b.session);if(!s)return json(404,{error:'RESET_REQUIRED'});
   if(u.pathname==='/api/replay')return json(200,{scope:'PUBLIC_ACTION_LOG_ONLY; evaluator exact replay artifacts are not exposed',actions:s.actions,sourceCounts:s.sourceCounts});
   const viewer=s.w.game==='cards'?'P0':actor(s.w);if(hash(packet(s.w,viewer).binding)!==hash(b.binding))throw Error('STALE_BINDING');if(terminal(s.w))throw Error('EPISODE_TERMINAL_RESET_REQUIRED');
   const count=b.auto?Math.min(24,Math.max(1,Number(b.batch??8))):1;
   for(let i=0;i<count&&!terminal(s.w);i++){
    if(s.round!==s.w.inner.ext.round){s.round=s.w.inner.ext.round;s.policies=s.policies.map((_,i)=>createPolicy(s.w.game,i===0?s.kind:'STRONG',{partnerStyle:i>0?s.w.inner.ext.partnerStyle:null}));}
    const p=packet(s.w),index=s.w.game==='cards'?s.w.inner.turn:0,partner=s.w.game==='cards'&&index!==0;
    const d=b.auto||partner?s.policies[index].decide(p):{action:p.actions.find(a=>a.id===b.actionId),actionSource:'MANUAL_ACTION',canonicalExpertsInvoked:[],memoryStatus:'NOT_APPLICABLE',reason:'Explicit manual legal action'};if(!d.action)throw Error('ILLEGAL_MANUAL_ACTION');s.w=step(s.w,p,d.action);s.actions.push({actor:p.binding.actor,type:d.action.type,parameters:d.action.parameters,actionSource:d.actionSource});s.sourceCounts[d.actionSource]=(s.sourceCounts[d.actionSource]??0)+1;
    s.decision=partner?{action:d.action,actionSource:'RULE_BASED_ACTION',canonicalExpertsInvoked:[],reason:'Partner public action; private rationale withheld',modelId:null}:d;
   }
   return json(200,view(s,b.session));
  }catch(e){json(400,{error:e.message});}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const server=createServer(),port=Number(process.env.ASCII_V32_PORT??4178);server.listen(port,'127.0.0.1',()=>console.log(`Sentinel ASCII Worlds 3.2: http://127.0.0.1:${port}\nIsolated R0 development; existing planners active, TRAINING_STATUS=INACTIVE.`));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));}
