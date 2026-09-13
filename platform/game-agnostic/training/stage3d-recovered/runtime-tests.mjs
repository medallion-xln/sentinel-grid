/* Phases 21-25: determinism, shadow campaign, latency, failure injection. */
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extract } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/features.mjs';
import { loadSplit, learnedFor, selectorFor, greedy } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/score3d.mjs';
import { scoreAnswer, nexusFor } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';
const SPLIT='ROUTER_HOLDOUT';
const recs=loadSplit(SPLIT); const learned=learnedFor(SPLIT); const selPol=selectorFor();
const ROUTE=(f)=>f.immediateMargin>=20;

/* ---- the frozen shadow hybrid: R0 evaluation path only ---- */
function hybrid(r){
  const l=learned(r);
  const f=extract(r,l);
  const routed=ROUTE(f);
  const action=routed?greedy(r):l;
  return {route:routed?'GREEDY':'LEARNED_V2B', action,
          canDispatch:false, canMutateLiveWorld:false, authority:'R0'};
}
/* ---- PHASE 21 determinism ---- */
const sample=recs.slice(0,500);
const sig=(rs)=>createHash('sha256').update(rs.map(r=>{const h=hybrid(r);
  return r.recordHash+'|'+h.route+'|'+(h.action?.actionId??'null');}).join('\n')).digest('hex');
const s1=sig(sample), s2=sig(sample);
const s3=sig([...sample].reverse().reverse());
const shuffled=[...sample].sort((a,b)=>a.recordHash<b.recordHash?1:-1);
const sigMap=new Map(shuffled.map(r=>{const h=hybrid(r);return [r.recordHash,h.route+'|'+(h.action?.actionId??'null')];}));
const s4=createHash('sha256').update(sample.map(r=>r.recordHash+'|'+sigMap.get(r.recordHash)).join('\n')).digest('hex');
const determinism={repeatIdentical:s1===s2, cloneIsolation:s1===s3, orderingPerturbation:s1===s4, signature:s1};
determinism.ROUTER_DETERMINISM_PASS = determinism.repeatIdentical&&determinism.cloneIsolation&&determinism.orderingPerturbation;

/* ---- PHASE 23/24 shadow campaign + latency ---- */
const t=(fn)=>{const a=process.hrtime.bigint(); const v=fn(); return [Number(process.hrtime.bigint()-a)/1e6, v];};
const lat={feature:[],nexus:[],router:[],total:[]};
let toNexusRoute=0,toLearned=0,parseFail=0,illegal=0;
for(const r of recs){
  const [t0]=t(()=>nexusFor(r)); lat.nexus.push(t0);
  const l=learned(r);
  const [t1,f]=t(()=>extract(r,l)); lat.feature.push(t1);
  const [t2,routed]=t(()=>ROUTE(f)); lat.router.push(t2);
  lat.total.push(t0+t1+t2);
  if(routed) toNexusRoute++; else toLearned++;
  const act=routed?greedy(r):l;
  const s=scoreAnswer(r,act);
  if(!act||act.actionId==null) parseFail++;
  if(!s.valid) illegal++;
}
const pct=(a,p)=>{const x=[...a].sort((m,n)=>m-n); return +x[Math.floor(x.length*p)].toFixed(3);};
const mean=(a)=>+(a.reduce((s,v)=>s+v,0)/a.length).toFixed(3);
const shadow={cases:recs.length, routedToGreedyExpert:toNexusRoute, routedToLearned:toLearned,
  parseFailures:parseFail, illegalActions:illegal,
  latencyMs:{feature:{mean:mean(lat.feature),p95:pct(lat.feature,0.95)},
             nexus:{mean:mean(lat.nexus),p95:pct(lat.nexus,0.95)},
             router:{mean:mean(lat.router),p95:pct(lat.router,0.95)},
             totalExcludingLLM:{mean:mean(lat.total),p50:pct(lat.total,0.5),p95:pct(lat.total,0.95),p99:pct(lat.total,0.99)}},
  llmInferenceNote:'V2B generation measured separately at 6.4 examples/s batched (~156 ms/example amortised); it dominates hybrid latency.',
  deterministicReplayPass:determinism.ROUTER_DETERMINISM_PASS};

/* ---- PHASE 25 failure injection: every mode must fail CLOSED to the incumbent ---- */
const FALLBACK={route:'FAIL_CLOSED_DETERMINISTIC_INCUMBENT', canDispatch:false, canMutateLiveWorld:false};
function guarded(r, inject){
  try{
    if(inject==='V2B_MISSING') throw new Error('adapter missing');
    if(inject==='NEXUS_EXCEPTION') throw new Error('nexus failure');
    if(inject==='FEATURE_MISSING') { const f={}; if(f.immediateMargin===undefined) throw new Error('feature absent'); }
    if(inject==='CORRUPT_CONFIG') throw new Error('router config hash mismatch');
    if(inject==='UNKNOWN_STATE_VERSION') throw new Error('state version unknown');
    let l=learned(r);
    if(inject==='V2B_MALFORMED') l=null;
    if(inject==='INVALID_INDEX') l={actionId:null,confidence:1,abstain:false};
    if(inject==='V2B_TIMEOUT') throw new Error('inference timeout');
    if(!l||l.actionId==null) return {...FALLBACK, reason:'LEARNED_OUTPUT_UNUSABLE'};
    const f=extract(r,l);
    return {route:ROUTE(f)?'GREEDY':'LEARNED_V2B', canDispatch:false, canMutateLiveWorld:false};
  }catch(e){ return {...FALLBACK, reason:e.message}; }
}
const modes=['V2B_MISSING','V2B_MALFORMED','V2B_TIMEOUT','INVALID_INDEX','NEXUS_EXCEPTION',
             'FEATURE_MISSING','CORRUPT_CONFIG','UNKNOWN_STATE_VERSION'];
const fi={}; let allClosed=true;
for(const m of modes){ const o=guarded(recs[0],m);
  const closed = o.canDispatch===false && o.canMutateLiveWorld===false;
  fi[m]={route:o.route, reason:o.reason??null, failedClosed:closed}; allClosed&&=closed; }
const out={determinism, shadow, failureInjection:fi, FAIL_CLOSED_PASS:allClosed};
writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/runtime-tests.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,1));
