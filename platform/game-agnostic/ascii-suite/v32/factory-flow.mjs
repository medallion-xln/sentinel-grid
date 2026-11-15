// Explicit extension: recipe consumption precedes the capacity test. Frozen V3 flow is unchanged.
import {clone} from '../v3/common.mjs';
import {WORLDS} from '../v3/kernel.mjs';
export const FLOW_VERSION='V32_TRANSPORT_THEN_RECIPE_CAPACITY_V1';
export function factoryStep(state,a){
 // Frozen flow tests capacity before consuming a recipe. A full furnace input stalls forever.
 // In this extension, temporarily reserve exactly the consumed inputs' slots for its production stage,
 // then restore declared capacities. Transport must not use that reservation.
 // Rather than duplicate engineering semantics, frozen step is invoked with flow-ready conversions
 // accounted independently and production disabled for the transport-only tick.
 const w=clone(state),enabled=new Map(),before=w.delivered;
 let energy=w.nodes.filter(n=>n.type==='POWER'&&!n.broken&&n.ready<=w.tick+1).reduce((s,n)=>s+6+3*(n.level-1),0),used=0;
 // Apply action in the frozen transaction, without automatic production: preserves credits/pending/build/transport.
 for(const n of w.nodes){enabled.set(n.id,n.enabled);if(['SOURCE','FURNACE','ASSEMBLER','CUTTER'].includes(n.type))n.enabled=false;}
 const next=WORLDS.factory.step(w,a.type==='SET_PRODUCTION'?{...a,parameters:{...a.parameters,enabled:false}}:a);
 for(const n of next.nodes)if(enabled.has(n.id))n.enabled=a.type==='SET_PRODUCTION'&&a.parameters.id===n.id?a.parameters.enabled:enabled.get(n.id);
 energy=next.nodes.filter(n=>n.type==='POWER'&&!n.broken&&n.ready<=next.tick).reduce((s,n)=>s+6+3*(n.level-1),0);
 const need={SOURCE:1,FURNACE:2,ASSEMBLER:3,CUTTER:2},out={SOURCE:'ore',FURNACE:'ingot',ASSEMBLER:'product',CUTTER:'part'};
 for(const n of next.nodes){n.lastOutput=0;if(!need[n.type]||!n.enabled)continue;
  if(n.broken){n.lastBlock='BROKEN';continue;}if(n.ready>next.tick){n.lastBlock='CONSTRUCTION';continue;}if(n.power<need[n.type]||energy<need[n.type]){n.lastBlock='POWER';continue;}energy-=need[n.type];used+=need[n.type];
  for(let k=0;k<n.level;k++){
   const recipe=n.type==='SOURCE'?{}:n.type==='FURNACE'?{ore:1}:n.type==='CUTTER'?{ingot:1}:next.productWeight===3?{ingot:2,part:1}:{ingot:2};
   if(Object.entries(recipe).some(([item,amount])=>(n.inventory[item]??0)<amount)){n.lastBlock='INPUT';break;}
   const size=Object.values(n.inventory).reduce((a,b)=>a+b,0)-Object.values(recipe).reduce((a,b)=>a+b,0)+1;if(size>n.capacity){n.lastBlock='OUTPUT_FULL';break;}
   if(n.type==='SOURCE'){if(next.mineRemaining<=0){n.lastBlock='DEPLETED';break;}next.mineRemaining--;next.extracted++;}for(const[item,amount]of Object.entries(recipe))n.inventory[item]-=amount;n.inventory[out[n.type]]++;n.lastOutput++;n.lastBlock=null;
  }
 }
 next.metrics.energyUsed+=used;next.metrics.energyAvailable=state.metrics.energyAvailable+used+energy;
 // V32 order/deadline owner, not the aggregate frozen finish predicate, owns terminal status.
 next.terminal=false;next.result='IN_PROGRESS';return next;
}
