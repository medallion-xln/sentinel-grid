// Evaluator-owned initial configurations. Frozen worlds and scoring remain unchanged.
import {createWorld,packet,step,actorId} from '../v3/kernel.mjs';
import {clone,hash,rng,connected,key} from '../v3/common.mjs';
export function layout(w){
  if(!w.config.mapCurriculum||w.config.mapCurriculum==='FROZEN_VERTICAL_SCAFFOLD')return w;
  const r=rng(w.seed^Math.imul(w.level??1,170141)^0x235ab3),density=w.config.mapCurriculum==='SPARSE_RANDOM_CUTS_V1'?.10:.20;
  w.grid=Array.from({length:w.height},(_,y)=>Array.from({length:w.width},(_,x)=>x===0||y===0||x===w.width-1||y===w.height-1?'#':r()<density?'#':'.'));
  const actor=w.game==='rescue'?w.units[0]:w.actor,points=[actor,...(w.units??[]),...(w.civilians??[]),...(w.enemies??[]),...(w.enemies??[]).map(e=>e.home),...(w.hazards??[]),...(w.objects??[]),...(w.traps??[]),w.extraction,w.credential,w.exit].filter(Boolean);
  // Deterministic constructive reachability witness, evaluator-owned generation only.
  for(const p of points){let x=actor.x,y=actor.y;w.grid[y][x]='.';while(x!==p.x){x+=Math.sign(p.x-x);w.grid[y][x]='.';}while(y!==p.y){y+=Math.sign(p.y-y);w.grid[y][x]='.';}}
  w.lockedDoors=[];w.floors=w.grid.flatMap((row,y)=>row.flatMap((glyph,x)=>glyph==='.'?[{x,y}]:[]));
  const reach=connected(w.grid,actor);if(points.some(p=>!reach.has(key(p.x,p.y))))throw Error('DIAGNOSTIC_MAP_FEASIBILITY_FAILED');
  w.admission={attempts:1,method:'DIAGNOSTIC_RANDOM_CUTS_REACHABILITY_WITNESS_V1',solvability:'GEOMETRY_ONLY_NOT_COMBAT_OPTIMALITY'};return w;
}
export function curriculumStep(w,actor,a){const next=step(w,actor,a);return next.level!==w.level?layout(next):next;}
export function factoryLinks(w){return [['mine','furnace'],['furnace','assembler'],...(w.config.curriculum?.includes('DOGLEG')?[['assembler','relay'],['relay','storage']]:[['assembler','storage']]),['storage','delivery'],...(w.difficulty>=4?[['furnace','buffer'],['buffer','cutter'],['cutter','assembler']]:[])];}
export function initial(spec){
  if(spec.split==='RESERVED_TEST')throw Error('RESERVED_POPULATION_NOT_AUTHORIZED');
  const w=createWorld(spec.game,spec.seed,spec.difficulty,{family:spec.family??'A',players:2});
  if(w.grid){w.config.mapCurriculum=spec.mapCurriculum??'FROZEN_VERTICAL_SCAFFOLD';layout(w);}
  if(spec.game!=='factory'||!spec.curriculum)return w;
  if(spec.curriculum==='TWO_RELAY_RESERVED')throw Error('RESERVED_POPULATION_NOT_AUTHORIZED');
  w.config.curriculum=spec.curriculum;
  if(spec.curriculum.includes('DOGLEG')){
    const storage=w.nodes.find(n=>n.id==='storage'),delivery=w.nodes.find(n=>n.id==='delivery');storage.y=7;delivery.y=7;
    w.nodes.push({id:'relay',type:'BUFFER',glyph:'B',x:14,y:3,level:1,power:0,inventory:{ore:0,ingot:0,part:0,product:0},capacity:10,enabled:true,broken:false,ready:0,lastBlock:null,lastOutput:0});
  }
  if(spec.curriculum.startsWith('MIRRORED')){for(const n of w.nodes)n.x=22-n.x;w.actor.x=20;}
  w.edges=[];for(const n of w.nodes)if(['SOURCE','FURNACE','ASSEMBLER','CUTTER'].includes(n.type))n.power=1;
  w.nodes.find(n=>n.id==='assembler').enabled=false;
  if(w.difficulty>=3)w.nodes.find(n=>n.id==='furnace').broken=true;
  w.admission={method:'SEPARATE_FACTORY_ENGINEERING_CURRICULUM_V1',solvability:'RESOURCE_AND_LINK_WITNESS_PLUS_EXECUTED_STRONG_COMPARATOR',attempts:1};
  return w;
}
export function publicPacket(w){const p=clone(packet(w));p.receiptTick=w.tick;p.observationAge=0;p.sensor='NORMAL';p.objective=w.game==='factory'?{type:'DELIVER_REQUIRED_PRODUCTS',required:w.required,requiredLinks:factoryLinks(w),curriculum:w.config.curriculum??'STOCK_SMOKE'}:{type:w.game==='rescue'?'EXTRACT_REQUIRED_CIVILIANS':w.game==='cards'?'COMPLETE_PUBLIC_TEAM_TARGET':'COMPLETE_ALL_LEVELS'};return p;}
export function replay(spec,initialHash,records,finalHash){let w=initial(spec);if(hash(w)!==initialHash)throw Error('EXACT_INITIAL_MISMATCH');for(const r of records){if(hash(w)!==r.before)throw Error('EXACT_BEFORE_MISMATCH');w=curriculumStep(w,actorId(w),r.action);if(hash(w)!==r.after)throw Error('EXACT_AFTER_MISMATCH');}if(hash(w)!==finalHash)throw Error('EXACT_FINAL_MISMATCH');return{pass:true,steps:records.length};}
export function topology(w){
  if(w.game==='factory')return hash({nodes:w.nodes.map(({id,type,x,y})=>({id,type,x,y})),links:factoryLinks(w),recipes:w.productWeight});
  if(w.grid){const a=w.grid.map(row=>row.join('')).join('\n'),b=w.grid.slice().reverse().map(row=>row.slice().reverse().join('')).join('\n');return hash([a,b].sort()[0]);}
  if(w.game==='cards')return hash({hands:w.hands,deck:w.deck});
  return null;
}
export function structuralSet(w){return w.grid?new Set(w.grid.flatMap((row,y)=>row.flatMap((v,x)=>v==='#'||v==='D'?[x+','+y+':'+v]:[]))):null;}
export function nearSibling(a,b){if(!a||!b)return false;const common=[...a].filter(x=>b.has(x)).length;return common/(a.size+b.size-common)>.94;}
