import {render as strategic} from '../v31/render.mjs';
const canvas=(width=96,height=30)=>Array.from({length:height},()=>Array(width).fill(' '));
export function render(o){
 if(!o)return 'OBSERVATION MISSING — controller must abstain or use an explicitly labeled fallback.';
 if(['rescue','cards','factory','roguelike'].includes(o.game)){
  let text=strategic(o);if(o.orders)text+='\nORDERS '+o.orders.map(q=>`${q.id}: ${q.delivered}/${q.required} by t${q.deadline}`).join(' | ');
  if(o.intel)text+='\nLAST-SEEN INTEL (NOT CURRENT TRUTH) '+o.intel.map(c=>`${c.id} @${c.x},${c.y} t${c.observedAt}`).join(' | ');
  if(o.finalObjective)text+='\nOBJECTIVE '+o.finalObjective+' | artifact='+o.finalArtifact;
  return text;
 }
 const c=canvas(),put=(x,y,s)=>{x=Math.round(x);y=Math.round(y);if(y<0||y>=c.length)return;for(const [i,ch]of [...s].entries())if(x+i>=0&&x+i<c[y].length)c[y][x+i]=ch;};
 put(0,0,o.game.toUpperCase()+' | '+o.scenario+' | t'+o.tick+' | '+o.result);
 if(o.game==='pong'){
  for(let y=2;y<30;y++){put(0,y,'|');put(95,y,'|');}
  for(let k=-3;k<=3;k++){put(3,o.playerY+k,'#');put(92,o.enemyY+k,'#');}
  for(const [i,b]of (o.balls??[o.ball]).entries())put(b.x,b.y,i?'o':'O');put(37,1,'SCORE '+o.score.join(' : '));
 }else if(o.game==='platformer'){
  const ox=Math.max(0,Math.floor(o.body.x)-20),px=x=>x-ox;
  for(let x=0;x<96;x++)if(!o.terrain.gaps.some(g=>x+ox>=g[0]&&x+ox<=g[1]))put(x,28,'#');
  for(const p of o.terrain.platforms)for(let x=p[0];x<=p[1];x++)put(px(x),p[2],'=');for(const p of o.terrain.walls)for(let y=p[2];y<28;y++)for(let x=p[0];x<=p[1];x++)put(px(x),y,'#');
  for(const x of o.spikes)put(px(x),27,'^');for(const e of o.enemies)put(px(e.x),27,'E');if(o.exit)put(px(o.exit),27,'X');
  for(const [n,g]of Object.entries(o.dependencies??{}))if(g?.x&&!g.taken&&!g.enabled)put(px(g.x),26,n==='key'?'K':n==='switch'?'S':g.open?'/':'D');
  put(px(o.body.x),o.body.y-2,'O');put(px(o.body.x)-1,o.body.y-1,'/|\\');put(px(o.body.x)-1,o.body.y,'/ \\');put(0,2,'HEALTH '+o.health+' | STAGE '+o.stage+'/'+o.stages+' | key/switch '+JSON.stringify(o.dependencies?.inventory));
 }else if(o.game==='fighter'){
  for(const [i,f]of [o.me,o.opponent].entries()){
   const x=f.x*.76,feet=27-f.y,y=feet-9,dir=f.facing;put(x,y,i?'@':'O');put(x-1,y+1,'/|\\');put(x,y+2,'|');put(x,y+3,'|');
   const attack=f.move&&['STARTUP','ACTIVE'].includes(f.move.phase);put(x-1,y+4,attack?(dir>0?' |---->':'<----| '):'/|\\');put(x,y+5,'|');put(x-1,y+6,'/ \\');put(x-2,y+7,'/   \\');put(x-2,y+8,'|   |');put(x-2,y+9,'_   _');put(i?64:2,2,(i?'OPPONENT':'SENTINEL PLANNER')+' HP '+f.health);put(i?64:2,3,f.phase+' '+(f.move?.name??f.lastAction));
  }for(let x=0;x<96;x++)put(x,29,'=');put(32,2,'ROUND '+o.round+'/'+o.rounds);
 }else{
  for(let y=5;y<29;y++){const curvature=o.preview[0]?.kappa??0,center=48+Math.round(curvature*(29-y)**2*.25);put(center-10,y,'|');put(center+10,y,'|');if(y%3===0)put(center,y,':');}
  put(48+o.me.n,26,'A');for(const car of o.cars)put(48+car.n,26-car.ds/3,car.id);put(0,2,'RACE '+o.race+'/'+o.races+' | '+o.weather+' | LAP '+o.me.lap+'/'+o.laps+' | SPEED '+o.me.v.toFixed(2));put(0,3,o.standings.map(s=>s.place+':'+s.id).join(' '));
 }
 return c.map(r=>r.join('').trimEnd()).join('\n');
}
