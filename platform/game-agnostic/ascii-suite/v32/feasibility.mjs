// Evaluator-only reachability/witness owner. Never imported by policies or the web server.
import {connected,key,manhattan,pathfind,DIRECTIONS,hash} from '../v3/common.mjs';
import {create,packet,step,terminal,metrics} from './kernel.mjs';
import {createPolicy} from './policy.mjs';
import {offlineGapSolvability} from '../worlds/platformer.mjs';
export function structural(spec){
 const w=create(spec.game,spec.seed,spec.tier,{family:spec.family,sensor:'NORMAL'}),s=w.inner;let pass=true,scope,details;
 if(s.grid){const reach=connected(s.grid,s.game==='rescue'?s.units[0]:s.actor),targets=s.game==='rescue'?[...s.civilians,...s.ext.extractions,s.credential]:[s.exit,...s.objects];pass=targets.every(t=>reach.has(key(t.x,t.y)));details={reachableCells:reach.size,targetCount:targets.length};scope='GEOMETRIC_KEY_AND_OBJECTIVE_REACHABILITY_NOT_SURVIVAL_PROOF';}
 else if(s.game==='platformer'){details=offlineGapSolvability(s);pass=details.every(d=>d.solvable);scope='NOMINAL_GAP_PHYSICS_REACHABILITY_NOT_TIMED_HAZARD_FULL_EPISODE_PROOF';}
 else if(s.game==='factory'){pass=s.ext.relations.every(e=>{const a=s.nodes.find(n=>n.id===e.from),b=s.nodes.find(n=>n.id===e.to);return a&&b&&(a.x===b.x||a.y===b.y)&&manhattan(a,b)<=4;})&&s.mineRemaining>=s.required*s.productWeight;scope='RECIPE_RESOURCE_GRAPH_REACHABILITY';details={orders:s.ext.orders.length,sharedOre:s.mineRemaining,minimumOre:s.required*s.productWeight};}
 else if(s.game==='cards'){pass=s.target<=s.categories.length*s.ranks;scope='FULL_DECK_SEQUENCE_EXISTS_NOT_HIDDEN_HAND_TEAM_GUARANTEE';details={target:s.target,maximum:s.categories.length*s.ranks};}
 else{scope='BOUNDED_PHYSICS_ONLY_NO_STRATEGIC_WIN_PROOF';details={budget:s.ext.limit};}
 return{pass,scope,details,initialHash:hash(s)};
}
function navigate(w,p,target,avoid=new Set()){
 const s=w.inner,u=s.game==='rescue'?s.units[s.active]:s.actor,tiles=Object.fromEntries(s.grid.flatMap((row,y)=>row.map((glyph,x)=>[key(x,y),glyph]))),route=pathfind({width:s.width,height:s.height,start:u,goals:[target],tiles,unknown:false,avoid,maxExpansions:10000});if(!route.direction)return null;
 const [dx,dy]=DIRECTIONS[route.direction],x=u.x+dx,y=u.y+dy;
 return s.grid[y][x]==='D'?p.actions.find(a=>['USE_KEY','OPEN_DOOR'].includes(a.type)&&a.parameters.x===x&&a.parameters.y===y&&(a.type==='USE_KEY'||!s.lockedDoors.includes(key(x,y))||s.inventory?.key)):p.actions.find(a=>a.type==='MOVE_'+route.direction);
}
function oracleGrid(w,p){
 const s=w.inner,u=s.game==='rescue'?s.units[s.active]:s.actor,find=(type,pred=()=>true)=>p.actions.find(a=>a.type===type&&pred(a.parameters));
 if(s.game==='rescue'){
  if(u.carrying)return find('EXTRACT')??navigate(w,p,[...s.ext.extractions].sort((a,b)=>manhattan(u,a)-manhattan(u,b))[0]);
  if(!s.haveKey)return navigate(w,p,s.credential);
  const civ=s.civilians.filter(c=>c.state==='WAITING').sort((a,b)=>a.deadline-b.deadline||manhattan(a,u)-manhattan(b,u))[0];if(!civ)return find('WAIT');
  if(manhattan(civ,u)<=1)return civ.injured&&!civ.stabilized?find('STABILIZE_CIVILIAN',q=>q.id===civ.id):find('RESCUE_CIVILIAN',q=>q.id===civ.id);
  const avoid=new Set(s.enemies.filter(e=>e.containedUntil<s.tick).flatMap(e=>[key(e.x,e.y),...Object.values(DIRECTIONS).map(([dx,dy])=>key(e.x+dx,e.y+dy))]));
  return navigate(w,p,civ,avoid)??navigate(w,p,civ);
 }
 if(u.health<=60&&s.inventory.potions)return find('USE_ITEM');if(u.health<45&&s.inventory.rations)return find('REST');
 const adjacent=s.enemies.filter(e=>e.health>0&&manhattan(e,u)<=1);if(adjacent.length)return u.stamina?find('ATTACK',q=>q.id===adjacent[0].id):find('DEFEND');
 if(find('PICKUP'))return find('PICKUP');if(find('DESCEND'))return find('DESCEND');
 let target=!s.inventory.key?s.objects.find(o=>o.type==='KEY'):s.ext.tier===3&&s.level===s.levelsTotal&&!s.ext.artifact?s.objects.find(o=>o.type==='ARTIFACT'):s.exit;
 const avoid=new Set([...s.traps.filter(t=>!t.disabled).map(t=>key(t.x,t.y)),...s.enemies.filter(e=>e.health>0).flatMap(e=>Object.values(DIRECTIONS).map(([dx,dy])=>key(e.x+dx,e.y+dy)))]);
 return navigate(w,p,target,avoid)??navigate(w,p,target)??find('INSPECT');
}
function oracleCards(w,p){const s=w.inner,hand=s.hands[s.turn];let slot=hand.findIndex(c=>c.rank===s.progress[c.category]+1);if(slot>=0)return p.actions.find(a=>a.type==='PLAY_CARD'&&a.parameters.slot===slot);
 const counts={};for(const c of [...s.deck,...s.hands.flat()])counts[c.category+c.rank]=(counts[c.category+c.rank]??0)+1;
 slot=hand.findIndex(c=>c.rank<=s.progress[c.category]||counts[c.category+c.rank]>1);if(slot<0)slot=0;return p.actions.find(a=>a.type==='DISCARD_CARD'&&a.parameters.slot===slot);
}
export function witness(spec){
 let w=create(spec.game,spec.seed,spec.tier,{family:spec.family,sensor:'NORMAL'}),controller=createPolicy(spec.game),actions=[],hashes=[hash(w.inner)];
 while(!terminal(w)){
  const p=packet(w);let a=['rescue','roguelike'].includes(w.game)?oracleGrid(w,p):w.game==='cards'?oracleCards(w,p):controller.decide(p).action;a??=p.actions.find(a=>a.type==='WAIT')??p.actions[0];w=step(w,p,a);actions.push(a);hashes.push(hash(w.inner));
 }
 return{scope:['rescue','roguelike','cards'].includes(spec.game)?'EVALUATOR_ONLY_PRIVILEGED_CONSTRUCTIVE_WITNESS_NEVER_POLICY_INPUT':'PUBLIC_PLANNER_CONSTRUCTIVE_ATTEMPT',success:metrics(w).success,outcome:w.inner.result,ticks:w.inner.tick,metrics:metrics(w),actions,hashes,notLimitedInformationGuarantee:true};
}
