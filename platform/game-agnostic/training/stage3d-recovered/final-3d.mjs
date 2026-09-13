/* Stage 3D final scoring on a sealed split: all experts + oracle ceilings + frozen
 * runtime router, paired changes, and routing error taxonomy. */
import { writeFileSync } from 'node:fs';
import { extract } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/features.mjs';
import { wilsonLower } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/router-family.mjs';
import { loadSplit, learnedFor, selectorFor, greedy, random } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/score3d.mjs';
import { scoreAnswer } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';
const SPLIT=process.argv[2];
const recs=loadSplit(SPLIT); const learned=learnedFor(SPLIT); const selPol=selectorFor();
const w=(x)=>({ok:x.scored&&x.inOptimalSet?1:0, reg:x.scored?x.regret:null, scored:x.scored?1:0, valid:x.valid?1:0});
const C=recs.map(r=>({r, f:extract(r,learned(r)), aligned:r.horizonClass==='HORIZON_ALIGNED'?1:0,
  L:w(scoreAnswer(r,learned(r))), G:w(scoreAnswer(r,greedy(r))),
  N:w(scoreAnswer(r,selPol(r))),  R:w(scoreAnswer(r,random(r)))}));
const agg=(pick)=>{let ok=0,s=0,reg=0,ill=0;
  for(const c of C){const p=pick(c); if(p.scored){s++;ok+=p.ok;reg+=p.reg;} if(!p.valid) ill++;}
  return {acc:s?+(ok/s).toFixed(4):null, regret:s?+(reg/s).toFixed(2):null, scored:s, coverage:+(s/C.length).toFixed(4), invalid:ill};};
const ROUTE=(c)=>c.f.immediateMargin>=20;                       // frozen R1_margin_20
const out={split:SPLIT,n:C.length,
  NEXUS:agg(c=>c.N), LEARNED_V2B:agg(c=>c.L), GREEDY:agg(c=>c.G), RANDOM:agg(c=>c.R),
  ORACLE_NEXUS:agg(c=>c.aligned?c.N:c.L), ORACLE_GREEDY:agg(c=>c.aligned?c.G:c.L),
  RUNTIME_HYBRID:agg(c=>ROUTE(c)?c.G:c.L)};
let k=0,n=0; for(const c of C) if(ROUTE(c)){n++; if(c.aligned)k++;}
out.router={routed:n,coverage:+(n/C.length).toFixed(4),alignedPrecision:+(k/Math.max(1,n)).toFixed(4),
  wilsonLower:+wilsonLower(k,n).toFixed(4),falseAlignedRate:+((n-k)/Math.max(1,n)).toFixed(4)};
const paired=(a,b)=>{let ben=0,harm=0,unch=0;
  for(const c of C){const x=a(c),y=b(c); if(!x.scored||!y.scored){unch++;continue;}
    if(x.ok&&!y.ok)ben++; else if(!x.ok&&y.ok)harm++; else unch++;}
  return {beneficialChanges:ben,harmfulChanges:harm,unchanged:unch};};
out.hybridVsLearned=paired(c=>ROUTE(c)?c.G:c.L, c=>c.L);
out.hybridVsNexus  =paired(c=>ROUTE(c)?c.G:c.L, c=>c.N);
out.hybridVsGreedy =paired(c=>ROUTE(c)?c.G:c.L, c=>c.G);
const tax={};const bump=(k2)=>tax[k2]=(tax[k2]??0)+1;
for(const c of C){const routed=ROUTE(c); const pick=routed?c.G:c.L;
  if(routed&&!c.aligned) bump('FALSE_ALIGNED');
  if(!routed&&c.aligned) bump('FALSE_DEPENDENT');
  if(pick.scored&&!pick.ok){
    if(c.G.ok&&!c.L.ok) bump('NEXUS_OR_GREEDY_RIGHT_LEARNED_WRONG');
    else if(c.L.ok&&!c.G.ok) bump('LEARNED_RIGHT_GREEDY_WRONG');
    else bump('EXPERT_BOTH_WRONG');}}
out.routingErrorTaxonomy=tax;
out.byHorizon={};
for(const cls of ['HORIZON_ALIGNED','HORIZON_DEPENDENT']){
  const S=C.filter(c=>c.r.horizonClass===cls);
  const a=(pick)=>{let ok=0,s=0;for(const c of S){const p=pick(c);if(p.scored){s++;ok+=p.ok;}}return s?+(ok/s).toFixed(4):null;};
  out.byHorizon[cls]={n:S.length,NEXUS:a(c=>c.N),LEARNED:a(c=>c.L),GREEDY:a(c=>c.G),HYBRID:a(c=>ROUTE(c)?c.G:c.L)};}
writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/final-'+SPLIT+'.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,1));
