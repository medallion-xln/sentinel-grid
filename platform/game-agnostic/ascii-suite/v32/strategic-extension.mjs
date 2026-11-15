import {createWorld,observe as oldObserve,actorId as oldActor,getMetrics as oldMetrics,WORLDS} from '../v3/kernel.mjs';
import {clone,rng,shuffle,connected,key,visible,manhattan,action} from '../v3/common.mjs';
import {connectedCoordinates,mass} from '../v3/factory-model.mjs';
import {factoryStep,FLOW_VERSION} from './factory-flow.mjs';
export function map32(seed,tier,family,stage=1){
 const r=rng(seed^Math.imul(stage,104729)),width=25+tier*4,height=15+tier*2,grid=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>x===0||y===0||x===width-1||y===height-1?'#':'.'));
 const horizontal=family.includes('OFFSET')||family.includes('DOGLEG');
 const barriers=horizontal?Array.from({length:Math.floor((height-4)/6)},(_,i)=>6+i*6):Array.from({length:Math.floor((width-4)/8)},(_,i)=>8+i*8);
 for(const b of barriers){const span=horizontal?width:height,gap=3+Math.floor(r()*(span-6)),gap2=2+Math.floor(r()*(span-4));for(let q=1;q<span-1;q++){const x=horizontal?q:b,y=horizontal?b:q;grid[y][x]=Math.abs(q-gap)<=1||q===gap2?'.':'#';}const x=horizontal?gap:b,y=horizontal?b:gap;grid[y][x]='D';}
 // Reserve an open initial role/key corridor and a traversable exit landing, not a policy solution path.
 for(let y=1;y<=3;y++)for(let x=1;x<=5;x++)grid[y][x]='.';
 if(family.includes('MIRROR'))for(let y=4;y<height-1;y++)grid[y]=[...grid[y]].reverse();
 const floors=[];for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++)if(grid[y][x]!== '#')floors.push({x,y});
 return{width,height,grid,floors};
}
function configureDungeon(w,seed,tier,family,stage=1){
 Object.assign(w,map32(seed,tier,family,stage));const r=rng(seed^Math.imul(stage,17389)),far=shuffle(r,w.floors.filter(p=>p.x>8&&p.y>3&&p.x<w.width-2&&p.y<w.height-2));
 w.contact=[];w.lockedDoors=[];for(let y=1;y<w.height-1;y++)for(let x=1;x<w.width-1;x++)if(w.grid[y][x]==='D'&&x<12)w.lockedDoors.push(key(x,y));
 if(w.game==='rescue'){
  w.civilians=far.slice(0,tier+1).map((p,i)=>({id:'civilian-'+i,...p,injured:i%2===0,stabilized:false,state:'WAITING',deadline:220+tier*80+i*35,priority:i===0?'URGENT':'STANDARD'}));w.required=tier+1;w.extracted=0;w.supplies=7+tier;w.limit=480+tier*120;
  w.enemies=far.slice(tier+3,tier+3+tier).map((p,i)=>({id:'patrol-'+i,...p,home:{...p},phase:i%4,containedUntil:-1}));w.hazards=far.slice(12,12+tier*2).map((p,i)=>({...p,id:'hazard-'+i,known:false,disabled:false}));
  w.ext.extractions=[{x:3,y:2},...(tier>=2?[{x:w.width-3,y:2}]:[])];w.ext.intel=[];w.ext.relocations=0;w.ext.closures=0;
 }else{
  w.exit={x:w.width-3,y:w.height-3};w.grid[w.exit.y][w.exit.x]='.';w.objects=[{id:'key-'+stage,x:4,y:2,type:'KEY'},...far.slice(20,22).map((p,i)=>({...p,id:'item-'+stage+'-'+i,type:i?'TREASURE':'POTION'}))];
  if(tier===3&&stage===w.levelsTotal)w.objects.push({id:'FINAL_ARTIFACT',x:w.width-4,y:w.height-3,type:'ARTIFACT'});
  w.enemies=far.slice(0,tier+2).map((p,i)=>({id:`L${stage}-enemy-${i}`,...p,type:['GUARDIAN','HUNTER','SENTRY','PATROLLER'][i%4],health:22+tier*2,damage:4+tier,phase:i%3,home:{...p}}));w.traps=far.slice(tier+4,tier+4+tier*3).map((p,i)=>({...p,id:`L${stage}-trap-${i}`,known:false,disabled:false,kind:i%2?'SNARE':'SPIKES'}));w.inspectUntil=-1;
  w.ext.cyclicHazards=tier===3?far.slice(28,31).map(p=>({...p,period:18,activeFor:5})):[];
 }
}
function configureFactory(w,tier,family){
 const count=tier===1?1:tier===2?2:3;w.width=25;w.height=20;w.nodes=[];w.edges=[];w.pending=[];w.credits=27+count*18;w.productWeight=tier===3?3:2;w.required=count*(6+tier*2);w.mineRemaining=w.required*w.productWeight+40;w.initialOre=w.mineRemaining;w.firstDisruption=null;w.difficulty=3;w.limit=360+tier*120;
 w.ext.orders=[];w.ext.relations=[];w.ext.actionCosts=0;w.ext.failures=[];
 for(let i=0;i<count;i++){
  const y=3+i*6,prefix='L'+i+'-',ids=[['mine','SOURCE',2,y],['furnace','FURNACE',6,y],['assembler','ASSEMBLER',10,y],['storage','STORAGE',14,y],['delivery','DELIVERY',18,y],['power','POWER',2,y+4],...(tier===3?[['buffer','BUFFER',6,y+4],['cutter','CUTTER',10,y+4]]:[])];
  for(const[id,type,x,py]of ids)w.nodes.push({id:prefix+id,type,glyph:{SOURCE:'O',FURNACE:'F',ASSEMBLER:'A',STORAGE:'S',DELIVERY:'X',POWER:'P',BUFFER:'B',CUTTER:'C'}[type],x:family.includes('MIRROR')?22-x:x,y:py,level:1,power:1,inventory:{ore:0,ingot:0,part:0,product:0},capacity:type==='STORAGE'?16:8,enabled:type!=='ASSEMBLER',broken:type==='FURNACE',ready:0,lastBlock:null,lastOutput:0});
  const links=[['mine','furnace'],['furnace','assembler'],['assembler','storage'],['storage','delivery'],...(tier===3?[['furnace','buffer'],['buffer','cutter'],['cutter','assembler']]:[])];
  for(const[from,to]of links)w.ext.relations.push({from:prefix+from,to:prefix+to,kind:'RECIPE_DEPENDENCY'});
  w.ext.orders.push({id:'ORDER-'+i,delivery:prefix+'delivery',required:6+tier*2,delivered:0,deadline:w.limit-30*i});
 }
 if(family.includes('DOGLEG')||family.includes('OOD')){
  for(const order of w.ext.orders){const s=w.nodes.find(n=>n.id===order.delivery.replace('delivery','storage')),d=w.nodes.find(n=>n.id===order.delivery),oldX=s.x,oldY=s.y; s.y+=2;d.y+=2;
   const relay={...clone(s),id:s.id+'-relay',type:'BUFFER',glyph:'B',x:oldX,y:oldY};w.nodes.push(relay);
   const edge=w.ext.relations.find(e=>e.to===s.id);edge.to=relay.id;w.ext.relations.push({from:relay.id,to:s.id,kind:'RECIPE_DEPENDENCY'});
  }
 }
 w.ext.sharedResources={ore:true,power:true,constructionCredits:true};
}
export function createStrategic(game,seed,tier,family){
 const w=createWorld(game,seed,tier+2,{family:'A',players:game==='cards'&&tier>=2?3:2});w.ext={tier,family,round:1,rounds:game==='cards'&&tier===3?3:1,roundResults:[],completed:0,return:0,catastrophes:0,repeated:0,failureKeys:[],artifact:false};
 if(game==='rescue'||game==='roguelike'){
  if(game==='roguelike'){w.levelsTotal=tier===1?2:tier===2?4:5;w.inventory.potions=tier===1?2:1;w.inventory.rations=1;w.limit=600+tier*400;}
  configureDungeon(w,seed,tier,family);
 }else if(game==='factory')configureFactory(w,tier,family);
 else{w.clueMax=tier===3?2:3;w.clues=w.clueMax;w.errors=2;w.initialErrors=2;w.target=Math.ceil(w.categories.length*w.ranks*.8);w.ext.partnerStyle=['RANK_FIRST','CATEGORY_FIRST','RISK_TOLERANT'][seed%3];w.ext.limit=160*w.ext.rounds;}
 return w;
}
export function actorStrategic(w){return oldActor(w);}
export function observeStrategic(w,actor=oldActor(w)){
 const o=oldObserve(w,actor),e=w.ext;
 if(w.game==='rescue'){
  o.extractions=clone(e.extractions);o.civilians=o.civilians.map(c=>({...c,priority:w.civilians.find(x=>x.id===c.id).priority,observedAt:w.tick}));o.intel=clone(e.intel);o.publicMetrics.relocations=e.relocations;o.publicMetrics.closures=e.closures;
 }else if(w.game==='factory'){o.orders=clone(e.orders);o.relations=clone(e.relations);o.sharedResources=clone(e.sharedResources);o.required=w.required;o.flowVersion=FLOW_VERSION;o.publicMetrics.orderCompletion=e.orders.map(q=>q.delivered/q.required);}
 else if(w.game==='cards'){o.round=e.round;o.rounds=e.rounds;o.partnerStyle='WITHHELD';o.roundScores=e.roundResults.map(x=>x.score);}
 else{
  o.cyclicHazards=e.cyclicHazards.filter(h=>o.tiles.some(t=>t.x===h.x&&t.y===h.y)).map(h=>({...h,active:w.tick%h.period<h.activeFor,observedAt:w.tick}));o.finalArtifact=e.artifact;o.finalObjective=e.tier===3&&w.level===w.levelsTotal?'COLLECT_ARTIFACT_THEN_EXIT':'EXIT';
 }
 return o;
}
export function legalStrategic(w,actor=oldActor(w)){
 const o=observeStrategic(w,actor),a=WORLDS[w.game].legal(o),e=w.ext;
 if(w.game==='rescue'&&o.actor.carrying&&e.extractions.some(p=>manhattan(o.actor,p)<=1)&&!a.some(a=>a.type==='EXTRACT'))a.push(action('EXTRACT'));
 if(w.game==='roguelike'&&e.tier===3&&w.level===w.levelsTotal&&!e.artifact)return a.filter(a=>a.type!=='DESCEND');
 return a;
}
export function stepStrategic(state,a){
 let w=clone(state),e=w.ext;const priorReturn=w.episodeReturn,priorLevel=w.level,priorCredits=w.credits;let artifact=false;
 if(w.game==='rescue'&&a.type==='EXTRACT'){const p=e.extractions.find(p=>manhattan(w.units[w.active],p)<=1);if(p)w.extraction=clone(p);}
 if(w.game==='roguelike'&&a.type==='PICKUP'&&a.parameters.id==='FINAL_ARTIFACT'){artifact=true;w.objects.find(x=>x.id==='FINAL_ARTIFACT').type='TREASURE';}
 const oldDelivery=w.game==='factory'?Object.fromEntries(w.nodes.filter(n=>n.type==='DELIVERY').map(n=>[n.id,n.inventory.product])):null;
 w=w.game==='factory'?factoryStep(w,a):WORLDS[w.game].step(w,a);e=w.ext;if(artifact)e.artifact=true;e.return+=w.episodeReturn-priorReturn;
 if(w.game==='rescue'){
  const o=oldObserve(w);for(const c of o.civilians){const old=e.intel.find(i=>i.id===c.id);if(old)Object.assign(old,{x:c.x,y:c.y,observedAt:w.tick,status:'LAST_OBSERVED_NOT_CURRENT_GROUND_TRUTH'});else e.intel.push({...c,observedAt:w.tick,status:'LAST_OBSERVED_NOT_CURRENT_GROUND_TRUTH'});}
  if(e.tier>=2&&w.tick%35===0){for(const c of w.civilians.filter(c=>c.state==='WAITING'&&!c.stabilized)){const choices=[[1,0],[-1,0],[0,1],[0,-1]],d=choices[(w.tick/35+c.id.length)%4],x=c.x+d[0],y=c.y+d[1];if(w.grid[y]?.[x]==='.'){c.x=x;c.y=y;e.relocations++;}}}
  // A bounded closure away from units/targets; two gap openings per wall retain alternatives.
  if(e.tier===3&&w.tick%60===0){const eligible=w.floors.filter(p=>p.x>8&&w.grid[p.y][p.x]==='.'&&w.units.every(u=>manhattan(u,p)>2)&&w.civilians.every(c=>manhattan(c,p)>1));const p=eligible[(w.tick*13)%Math.max(1,eligible.length)];if(p){const before=w.grid[p.y][p.x];w.grid[p.y][p.x]='#';const reach=connected(w.grid,w.units[w.active]);if(w.civilians.every(c=>c.state!=='WAITING'||reach.has(key(c.x,c.y)))&&e.extractions.some(x=>reach.has(key(x.x,x.y))))e.closures++;else w.grid[p.y][p.x]=before;}}
 }else if(w.game==='roguelike'){
  if(w.level!==priorLevel){configureDungeon(w,w.seed,e.tier,e.family,w.level);e.artifact=false;}
  if(!w.terminal){for(const h of e.cyclicHazards)if(manhattan(h,w.actor)===0&&w.tick%h.period<h.activeFor){w.actor.health=Math.max(0,w.actor.health-12);w.metrics.damageTaken+=12;w.events.push({type:'CYCLIC_HAZARD',message:'Visible periodic hazard damage'});}
   for(const n of w.enemies.filter(n=>n.type==='PATROLLER'&&n.health>0)){const dirs=[[1,0],[0,1],[-1,0],[0,-1]],d=dirs[(Math.floor(w.tick/3)+n.phase)%4],x=n.x+d[0],y=n.y+d[1];if(w.grid[y]?.[x]==='.'&&manhattan({x,y},n.home)<4){n.x=x;n.y=y;}}
   if(w.actor.health===0){w.terminal=true;w.result='FAILURE';}
  }
  for(const ev of w.events)if(['TRAP','BLOCKED','CYCLIC_HAZARD'].includes(ev.type)){const k=w.level+':'+w.actor.x+','+w.actor.y+':'+ev.type;if(e.failureKeys.includes(k))e.repeated++;e.failureKeys.push(k);}
 }else if(w.game==='factory'){
  e.actionCosts+=Math.max(0,priorCredits-w.credits);
  for(const order of e.orders){const delivery=w.nodes.find(n=>n.id===order.delivery),inflow=w.edges.filter(x=>x.to===delivery.id).reduce((s,x)=>s+x.lastFlow,0);order.delivered+=oldDelivery[delivery.id]+inflow;}
  if(e.tier>=2&&[15,45,...(e.tier===3?[90,145,210,290]:[])].includes(w.tick)){
   const production=w.nodes.filter(n=>['FURNACE','CUTTER','ASSEMBLER'].includes(n.type));const n=production[(w.seed+w.tick)%production.length];n.broken=true;n.failedAt=w.tick;w.metrics.disruptions++;e.failures.push({id:n.id,tick:w.tick});w.events.push({type:'FAILURE',message:n.id+' equipment failure'});
  }
  const success=e.orders.every(q=>q.delivered>=q.required),miss=e.orders.some(q=>w.tick>=q.deadline&&q.delivered<q.required);
  if(success){w.terminal=true;w.result='SUCCESS';}else if(miss){w.terminal=true;w.result='DEADLINE_FAILURE';}else if(w.result==='SUCCESS'){w.terminal=false;w.result='IN_PROGRESS';}
 }else if(w.terminal){
  e.roundResults.push({round:e.round,score:w.score,success:w.result==='SUCCESS',errorsUsed:w.initialErrors-w.errors});if(w.errors<=0)e.catastrophes++;
  if(w.result==='SUCCESS'&&e.round<e.rounds){const fresh=createStrategic('cards',(w.seed+e.round*104729)>>>0,e.tier,e.family);fresh.ext={...fresh.ext,round:e.round+1,roundResults:e.roundResults,completed:e.completed+1,return:e.return,catastrophes:e.catastrophes,limit:e.limit};fresh.tick=w.tick;fresh.limit=e.limit;fresh.events=[{type:'NEXT_ROUND',message:'New deal and new partner convention; no prior coordinates/cards retained'}];w=fresh;}
 }
 return w;
}
export function metricsStrategic(w){const m=oldMetrics(w),e=w.ext;return{...m,episodeReturn:e.return,repeatedFailures:e.repeated,...(w.game==='factory'?{success:w.result==='SUCCESS',objectiveCompletion:e.orders.reduce((s,q)=>s+Math.min(1,q.delivered/q.required),0)/e.orders.length,orders:clone(e.orders),actionCosts:e.actionCosts}:{}),...(w.game==='cards'?{catastrophic:e.catastrophes>0,roundResults:e.roundResults}:{}),...(w.game==='rescue'?{civilianDeaths:w.metrics.civilianDeaths,relocations:e.relocations,closures:e.closures}:{}),...(w.game==='roguelike'?{finalArtifact:e.artifact}:{})};}
