/* Precompute features + expert answers ONCE per record, then evaluate every rule
 * against the cache. extract() regenerates world state via nexusFor, so calling it
 * per rule per record is ~19x more work than needed. */
import { writeFileSync } from 'node:fs';
import { extract } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/features.mjs';
import { ROUTER_FAMILY_V1, wilsonLower } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/router-family.mjs';
import { loadSplit, learnedFor, selectorFor, greedy } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/score3d.mjs';
import { scoreAnswer } from '/Users/dwaynecampbell/Desktop/sentinel-grid/platform/game-agnostic/src/lab/stage3c-learned-nexus.js';
const SPLIT=process.argv[2];
const recs=loadSplit(SPLIT); const learned=learnedFor(SPLIT); const selPol=selectorFor();
const cache=recs.map(r=>{
  const l=learned(r), g=greedy(r), s=selPol(r);
  const w=(x)=>({ok:x.scored&&x.inOptimalSet?1:0, reg:x.scored?x.regret:null, scored:x.scored?1:0});
  return { r, f:extract(r,l), aligned:r.horizonClass==='HORIZON_ALIGNED'?1:0,
           L:w(scoreAnswer(r,l)), G:w(scoreAnswer(r,g)), N:w(scoreAnswer(r,s)) };
});
writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/cache-'+SPLIT+'.json', JSON.stringify(cache.map(c=>({
  recordHash:c.r.recordHash, aligned:c.aligned, f:c.f, L:c.L, G:c.G, N:c.N}))));
const PRED={
  R0_no_routing:()=>false, R5_nexus_when_unstructured:(f)=>f.nexusStructural===0,
};
for(const t of [10,15,20,25,28,35,50]) PRED['R1_margin_'+t]=(f)=>f.immediateMargin>=t;
for(const t of [10,15,20,25,30])       PRED['R2_spread_'+t]=(f)=>f.immediateSpread>=t;
for(const t of [20,28,35])             PRED['R3_margin_'+t+'_noties']=(f)=>f.immediateMargin>=t&&f.immediateTopTieCount===1;
for(const t of [20,25,30])             PRED['R4_spread_'+t+'_earlytick']=(f)=>f.immediateSpread>=t&&f.tickProgress<0.5;
const rows=[];
console.log('=== '+SPLIT+' (n='+recs.length+') router family ===');
console.log('  id                          acc      regret   alignedPrec  wilsonLB  coverage');
for(const {id} of ROUTER_FAMILY_V1){
  const pred=PRED[id]; const useNexus=id==='R5_nexus_when_unstructured';
  let ok=0,scored=0,reg=0,k=0,n=0;
  for(const c of cache){
    const routed=pred(c.f);
    const pick = routed ? (useNexus ? c.N : c.G) : c.L;
    if(routed){ n++; if(c.aligned) k++; }
    if(pick.scored){ scored++; ok+=pick.ok; reg+=pick.reg; }
  }
  const acc=scored?ok/scored:0, mr=scored?reg/scored:0, prec=n?k/n:0;
  rows.push({id,acc,regret:mr,alignedPrecision:prec,wilsonLB:wilsonLower(k,n),coverage:n/cache.length,routed:n,scored});
  console.log('  '+id.padEnd(26)+' '+acc.toFixed(4).padEnd(8)+' '+mr.toFixed(2).padEnd(8)+' '
    +prec.toFixed(4).padStart(10)+' '+wilsonLower(k,n).toFixed(4).padStart(9)+' '+(n/cache.length).toFixed(4).padStart(9));
}
writeFileSync('/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/family-'+SPLIT+'.json', JSON.stringify(rows,null,2));
