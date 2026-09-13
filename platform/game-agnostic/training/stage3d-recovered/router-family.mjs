/* STAGE3D_ROUTER_FAMILY_V1 — finite, low-complexity, predeclared before CAL selection.
 * Asymmetric per Phase 10: the aligned route is SELECTIVE and high-precision; Learned
 * Nexus V2B is the default fallback, so every state gets a deterministic
 * recommendation (Phase 20 full coverage). */
import { extract } from '/private/tmp/claude-501/-Users-dwaynecampbell-Desktop-sentinel-grid/fca13857-1355-448a-9b36-7ac8e5352d38/scratchpad/3d/features.mjs';
export const ROUTER_FAMILY_V1 = Object.freeze([
  {id:'R0_no_routing', rule:'always V2B'},
  ...[10,15,20,25,28,35,50].map(t=>({id:'R1_margin_'+t, rule:'immediateMargin>='+t+' -> greedy'})),
  ...[10,15,20,25,30].map(t=>({id:'R2_spread_'+t, rule:'immediateSpread>='+t+' -> greedy'})),
  ...[20,28,35].map(t=>({id:'R3_margin_'+t+'_noties', rule:'immediateMargin>='+t+' AND topTieCount==1 -> greedy'})),
  ...[20,25,30].map(t=>({id:'R4_spread_'+t+'_earlytick', rule:'immediateSpread>='+t+' AND tickProgress<0.5 -> greedy'})),
  {id:'R5_nexus_when_unstructured', rule:'nexusStructural==0 -> nexus'},
]);
export function buildRouter(id, {learned, greedyPol, selPol}) {
  const toGreedy = (pred) => (r) => { const f = extract(r, learned(r)); return pred(f) ? greedyPol(r) : learned(r); };
  if (id==='R0_no_routing') return { pol: learned, routes: () => false };
  let m;
  if ((m=id.match(/^R1_margin_(\d+)$/))) { const t=+m[1];
    return { pol: toGreedy(f=>f.immediateMargin>=t), routes:(f)=>f.immediateMargin>=t }; }
  if ((m=id.match(/^R2_spread_(\d+)$/))) { const t=+m[1];
    return { pol: toGreedy(f=>f.immediateSpread>=t), routes:(f)=>f.immediateSpread>=t }; }
  if ((m=id.match(/^R3_margin_(\d+)_noties$/))) { const t=+m[1];
    return { pol: toGreedy(f=>f.immediateMargin>=t&&f.immediateTopTieCount===1),
             routes:(f)=>f.immediateMargin>=t&&f.immediateTopTieCount===1 }; }
  if ((m=id.match(/^R4_spread_(\d+)_earlytick$/))) { const t=+m[1];
    return { pol: toGreedy(f=>f.immediateSpread>=t&&f.tickProgress<0.5),
             routes:(f)=>f.immediateSpread>=t&&f.tickProgress<0.5 }; }
  if (id==='R5_nexus_when_unstructured')
    return { pol:(r)=>{const f=extract(r,learned(r)); return f.nexusStructural===0 ? (selPol(r)??learned(r)) : learned(r);},
             routes:(f)=>f.nexusStructural===0 };
  throw new Error('unknown router '+id);
}
export function wilsonLower(k,n,z=1.96){
  if(n===0) return 0; const p=k/n, d=1+z*z/n;
  return Math.max(0,((p+z*z/(2*n)) - z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/d);
}
