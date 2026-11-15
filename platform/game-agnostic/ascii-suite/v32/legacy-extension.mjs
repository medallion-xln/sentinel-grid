// Explicit V3.2 mechanics. Imports frozen public physics, never edits their constants.
import {createGame,observe as oldObserve,legalActions as oldLegal,stepGame,metricsOf} from '../games.mjs';
import {stepPlatformer} from '../worlds/platformer.mjs';
import {stepRacing} from '../worlds/racing.mjs';
import {fightTick,newFighter,fighterLegalActions,phaseOf,MOVES} from '../worlds/fighter.mjs';
import {rng,clone,manhattan} from '../v3/common.mjs';
import {foldY} from '../worlds/pong.mjs';
export const LEGACY=['pong','platformer','fighter','racing'];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const STYLES=['AGGRESSIVE','TURTLE','COUNTER','ANTI_AIR','ADAPTIVE','MIRROR'];
export function createLegacy(game,seed,tier,family){
 const w=createGame(game,{seed,difficulty:tier+2}),r=rng(seed^0x320123),e={tier,family,round:1,rounds:game==='fighter'?(tier===1?1:tier===2?6:12):game==='racing'&&tier===3?3:game==='platformer'&&tier===3?3:1,completed:0,roundResults:[],return:0,catastrophes:0,repeated:0};w.ext=e;
 if(game==='pong'){
  e.velocity=0;e.enemyVelocity=0;e.history=[];e.opponentHistory=[];e.sideCounts=[1,1];e.points=[0,0];e.returns=0;e.misses=0;e.shots=[];e.sensorRng=seed^0xabc320;e.sensorDelay=2;e.balls=Array.from({length:tier===2?2:1},(_,i)=>({id:'ball-'+i,x:48+i*30,y:7+r()*17,vx:-1.3-i*.05,vy:(r()-.5)*2,spin:(r()-.5)*.03,release:i*35}));e.limit=5000;e.half=3;
 }else if(game==='platformer')configurePlatform(w,r);
 else if(game==='fighter'){
  w.fighters=[newFighter(40,1),newFighter(76,-1)];e.styles=STYLES;e.roundTick=0;e.history=[[],[]];e.habits=[{},{}];e.lastOpponent='WAIT';e.hits=0;e.taken=0;e.blocks=0;e.whiffs=0;e.limit=900*e.rounds;e.reaction=2;
 }else{
  // New order of sharp corners and added alternating chicanes changes braking/overtaking demands.
  const segs=w.track.segments;for(const s of segs)if(s.name==='STRAIGHT')s.length=35+Math.floor(r()*40);
  if(family.includes('MIRROR'))for(const s of segs)s.kappa=-s.kappa;
  if(family.includes('DOGLEG')||family.includes('OOD'))segs.splice(2,0,{name:'V32_CHICANE_A',kappa:.055,length:25,wet:false},{name:'V32_CHICANE_B',kappa:-.055,length:25,wet:false});
  let at=0;for(const[i,s]of segs.entries()){s.id=i;s.start=at;at+=s.length;}w.track.lapLength=at;e.baseWet=segs.map(s=>s.wet);e.weather='DRY';e.weatherPeriod=180;e.limit=6000*e.rounds;e.startGrid=seed%4;rotateGrid(w,e.startGrid);
 }
 return w;
}
function rotateGrid(w,slot){const cars=[w.player,...w.rivals];for(let i=0;i<cars.length;i++){const p=(i+slot)%4;cars[i].s=-p*7;cars[i].n=p%2?-3:3;}w.startPlace=slot+1;}
function configurePlatform(w,r){
 const e=w.ext;w.health=e.tier===1?4:3;w.lives=w.health;
 // Multi-route topology: ground gated route or exposed elevated bypass. Keys and switch must BOTH be visited.
 const offset=e.family.includes('OFFSET')?8:e.family.includes('DOGLEG')?14:0;
 w.gaps=[[34+offset,40+offset],[77+offset,84+offset],[125+offset,130+offset]];w.walls=[];w.ceilings=[];w.platforms=[[35+offset,39+offset,25],[78+offset,82+offset,25],[109+offset,121+offset,24]];w.spikes=[];w.wind=e.tier===3?[{x0:76+offset,x1:87+offset,strength:.18}]:[];
 w.exit=152+offset;w.width=w.exit+10;w.checkpoints=e.tier===3?[4,62+offset]:[4,61+offset,108+offset];w.sections=[{id:0,type:'MOVING_PLATFORM',x0:25+offset,x1:47+offset},{id:1,type:'TIMED_HAZARD',x0:51+offset,x1:70+offset},{id:2,type:'MOVING_PLATFORM',x0:73+offset,x1:92+offset},{id:3,type:'DEPENDENCY_GATE',x0:109+offset,x1:124+offset}];
 w.enemies=[{a:52+offset,b:64+offset,x:52+offset,dir:1,speed:.25},{a:138+offset,b:147+offset,x:138+offset,dir:-1,speed:.3}];w.coins=[];
 e.platformBases=clone(w.platforms);e.moving=[0,1];e.hazardXs=[60+offset,61+offset];e.hazardPeriod=30;e.key={x:19+offset,taken:false};e.switch={x:94+offset,enabled:false};e.gate={x:116+offset,open:e.tier===1};e.resources={keys:0,switch:false};e.limit=1500*e.rounds;e.movingPhase=Math.floor(r()*30);e.lastDamage=null;e.failureKeys=[];e.finalObjective=e.tier===3?'FINAL_TIMED_HAZARD_AND_EXIT':'EXIT';
}
export function observeLegacy(w){
 const e=w.ext;let o=oldObserve(w);
 if(w.game==='pong'){
  const h=e.history[Math.max(0,e.history.length-e.sensorDelay-1)]??e.balls.map(({id,x,y})=>({id,x,y,tick:w.tick}));
  o={...o,ball:h[0]??null,balls:h,playerY:w.playerY,enemyY:w.enemyY,score:e.points,paddleHalf:e.half,sensor:{delayTicks:e.sensorDelay,noise:'BOUNDED_POSITION_NOISE_BOTH_PLAYERS'},lastContact:w.lastContact,events:w.events};
 }else if(w.game==='platformer')o={...o,dependencies:{key:Math.abs(e.key.x-w.x)<72?clone(e.key):null,switch:Math.abs(e.switch.x-w.x)<72?clone(e.switch):null,gate:Math.abs(e.gate.x-w.x)<72?clone(e.gate):null,inventory:clone(e.resources)},movingPlatforms:w.platforms.filter(p=>p[1]>=w.x-24&&p[0]<=w.x+72),hazardPhase:{active:w.tick%30<12,nextChange:12-w.tick%30},stage:e.round,stages:e.rounds,finalObjective:e.finalObjective};
 else if(w.game==='fighter')o={...(e.history[0][0]??o),terminal:w.terminal,result:w.result,timeLeft:900-e.roundTick,round:e.round,rounds:e.rounds,opponentCapabilities:{samePhysics:true,equalObservationAge:true,reactionTicks:e.reaction,privateStyle:'WITHHELD'}};
 else o={...o,race:e.round,races:e.rounds,weather:e.weather,gridSlot:e.startGrid};
 return o;
}
export function legalLegacy(w){const a=oldLegal(w);if(w.game==='platformer'&&w.ext.tier>=2){if(!w.ext.key.taken&&Math.abs(w.x-w.ext.key.x)<2)a.push('TAKE_KEY');if(!w.ext.switch.enabled&&Math.abs(w.x-w.ext.switch.x)<2)a.push('ACTIVATE_SWITCH');}return a;}
export function fighterOpponent(publicObservation,style,habits,last){
 const o=publicObservation,d=o.distance,me=o.me,op=o.opponent,pick=a=>o.legalActions.includes(a)?a:'WAIT';
 if(o.legalActions.length===1)return'WAIT';if(!me.grounded)return pick(d<5?'AIR_ATTACK':'WAIT');
 const repeated=Object.entries(habits).sort((a,b)=>b[1]-a[1])[0]?.[0];
 if(style==='MIRROR')return pick(last);
 if(op.move&&d<13&&['STARTUP','ACTIVE'].includes(op.move.phase))return pick(op.move.name==='LOW_ATTACK'?'BLOCK_LOW':'BLOCK_HIGH');
 if(!op.grounded&&style!=='AGGRESSIVE')return pick(d<12?'HEAVY_ATTACK':'WALK_BACK');
 if(op.phase==='RECOVERY'&&d<11)return pick(d<8?'LIGHT_ATTACK':'HEAVY_ATTACK');
 if(d>11)return pick('WALK_FORWARD');
 if(style==='TURTLE')return pick(repeated==='LOW_ATTACK'?'BLOCK_LOW':o.tick%18<12?'BLOCK_HIGH':'LOW_ATTACK');
 if(style==='COUNTER')return pick(d<7?'WALK_BACK':o.tick%23<8?'LOW_ATTACK':'BLOCK_HIGH');
 if(style==='ANTI_AIR')return pick(o.tick%19<8?'LOW_ATTACK':'HEAVY_ATTACK');
 if(style==='ADAPTIVE')return pick((habits.BLOCK_HIGH??0)>(habits.LOW_ATTACK??0)?'LOW_ATTACK':(habits.LIGHT_ATTACK??0)>5?'BLOCK_HIGH':'HEAVY_ATTACK');
 return pick(d<7?'LIGHT_ATTACK':'LOW_ATTACK');
}
function fighterStep(w,a){
 const e=w.ext;e.roundTick++;const po={...oldObserve(w),tick:w.tick-1},eo={...po,me:po.opponent,opponent:po.me,legalActions:fighterLegalActions(w.fighters[1])};e.history[0].push(po);e.history[1].push(eo);if(e.history[0].length>e.reaction+1)e.history[0].shift();if(e.history[1].length>e.reaction+(e.externalDelay??0)+1)e.history[1].shift();
 const seen={...e.history[1][0],legalActions:fighterLegalActions(w.fighters[1])},style=e.tier===1?'COUNTER':STYLES[(e.round-1)%6];const op=e.externalMissing&&(w.tick-1)%4===1?'WAIT':fighterOpponent(seen,style,e.habits[0],e.lastPlayer??'WAIT');e.lastPlayer=a;e.lastOpponent=op;if(MOVES[a])e.habits[0][a]=(e.habits[0][a]??0)+1;else if(a.startsWith('BLOCK')||a.startsWith('JUMP'))e.habits[0][a]=(e.habits[0][a]??0)+1;
 const ev=fightTick(w,[a,op]);w.events=ev.map(x=>x.type+' '+(x.move??''));for(const x of ev){if(x.type==='HIT'){if(x.who===0){e.hits+=x.damage;w.reward+=x.damage/10;}else{e.taken+=x.damage;w.reward-=x.damage/10;const k=x.move;e.habits[1][k]=(e.habits[1][k]??0)+1;if(e.habits[1][k]>2)e.repeated++;}}if(x.type==='BLOCKED')e.blocks++;if(x.type==='WHIFF'&&x.who===0)e.whiffs++;}
 if(w.fighters.some(f=>f.health<=0)||e.roundTick>=900){const [p,q]=w.fighters,win=p.health>q.health;e.roundResults.push({style,round:e.round,win,tick:e.roundTick,playerHealth:p.health,opponentHealth:q.health});if(p.health<=0)e.catastrophes++;if(!win){w.terminal=true;w.result='LOSS';}else if(e.round===e.rounds){w.terminal=true;w.result='WIN';e.completed++;}else{e.completed++;e.round++;e.roundTick=0;e.history=[[],[]];e.habits=[{},{}];w.fighters=[newFighter(40,1),newFighter(76,-1)];w.events.push('NEXT_OPPONENT');}}
}
function pongStep(w,a){
 const e=w.ext,dir=a==='UP'?-1:a==='DOWN'?1:0,acc=.35;e.velocity=clamp(e.velocity+dir*acc,-1.5,1.5);if(!dir)e.velocity*=.6;w.playerY=clamp(w.playerY+e.velocity,4,27);
 const hist=e.opponentHistory,previous=hist[Math.max(0,hist.length-e.sensorDelay-1)]??e.balls.map(({x,y,id})=>({id,x,y,tick:w.tick-1})),older=hist[Math.max(0,hist.length-e.sensorDelay-2)];let target=16,soon=Infinity;
 for(const b of previous){const prev=older?.find(p=>p.id===b.id),vx=prev?(b.x-prev.x)/Math.max(1,b.tick-prev.tick):0,vy=prev?(b.y-prev.y)/Math.max(1,b.tick-prev.tick):0;if(vx>0){const t=(92-b.x)/vx;if(t>=0&&t<soon){soon=t;target=foldY(b.y+vy*t);}}}
 e.enemyVelocity=clamp(e.enemyVelocity+clamp(target-w.enemyY,-1,1)*acc,-1.5,1.5);if(Math.abs(target-w.enemyY)<1)e.enemyVelocity*=.6;w.enemyY=clamp(w.enemyY+e.enemyVelocity,4,27);
 for(const b of e.balls){if(w.tick<b.release)continue;b.vy=clamp(b.vy+b.spin,-2.8,2.8);b.spin*=.97;const px=b.x;b.x+=b.vx;b.y+=b.vy;
  if(b.y<1||b.y>30){b.y=b.y<1?2-b.y:60-b.y;b.vy=-b.vy;b.spin=-b.spin;w.events.push('WALL_BOUNCE '+b.id);}
  if(b.vx<0&&px>3&&b.x<=3){if(Math.abs(b.y-w.playerY)<=e.half+.5){const offset=(b.y-w.playerY)/(e.half+.5);b.x=3.01;b.vx=Math.min(2.2,Math.abs(b.vx)+.03);b.vy=clamp(offset*2+e.velocity*.25,-2.8,2.8);b.spin=clamp(e.velocity*.03+offset*.02,-.06,.06);e.returns++;e.shots.push({tick:w.tick,offset,ball:b.id});w.lastContact={tick:w.tick,y:b.y,paddleY:w.playerY,offset};w.events.push('PLAYER_RETURN '+b.id);}}
  if(b.vx>0&&px<92&&b.x>=92&&Math.abs(b.y-w.enemyY)<=e.half+.5){const away=w.playerY<16?1:-1;const aim=e.tier===3?(e.sideCounts[0]>e.sideCounts[1]?1:-1)*.7:((b.y-w.enemyY)/(e.half+.5));b.x=91.99;b.vx=-Math.min(2.2,Math.abs(b.vx)+.02);b.vy=clamp(aim*2,-2.8,2.8);b.spin=aim*.03;w.events.push('OPPONENT_RETURN '+b.id);}
  if(b.x<1||b.x>94){const win=b.x>94;e.points[win?0:1]++;if(!win){e.misses++;if(e.misses>1)e.repeated++;}w.reward+=win?5:-5;b.x=48;b.y=8+((w.tick*7+(b.id==='ball-1'?11:0))%16);b.vx=win?1.3:-1.3;b.vy=(w.tick%2?1:-1)*.7;b.spin=0;b.release=w.tick+20;w.events.push(win?'POINT_WON':'POINT_LOST');}
 }
 e.sideCounts[w.playerY<16?0:1]++;const noise=()=>{e.sensorRng=(Math.imul(e.sensorRng,1664525)+1013904223)>>>0;return(e.sensorRng/4294967296-.5)*.5;};const sample=e.tier===3&&w.tick%29===1?[]:e.balls.map(({id,x,y})=>({id,x:x+noise(),y:y+noise(),tick:w.tick}));e.history.push(sample);e.opponentHistory.push(sample);if(e.history.length>32)e.history.shift();if(e.opponentHistory.length>32)e.opponentHistory.shift();w.score=e.points;
 if(Math.max(...e.points)>=7){w.terminal=true;w.result=e.points[0]>e.points[1]?'WIN':'LOSS';}
}
export function stepLegacy(state,a){
 let w=clone(state),e=w.ext;w.tick++;w.events=[];w.reward=0;
 if(w.game==='pong')pongStep(w,a);
 else if(w.game==='fighter')fighterStep(w,a);
 else if(w.game==='platformer'){
  for(const i of e.moving){const b=e.platformBases[i],delta=Math.round(Math.sin((w.tick+e.movingPhase)/12));w.platforms[i]=[b[0]+delta,b[1]+delta,b[2]];}
  w.spikes=w.tick%30<12?e.hazardXs:[];
  if(a==='TAKE_KEY'){e.key.taken=true;e.resources.keys=1;w.events.push('KEY_COLLECTED');}
  else if(a==='ACTIVATE_SWITCH'){e.switch.enabled=true;e.resources.switch=true;w.events.push('SWITCH_ON');}
  if(e.resources.keys&&e.resources.switch)e.gate.open=true;
  w.walls=e.gate.open?[]:[[e.gate.x,e.gate.x,24]]; // Elevated bypass cannot substitute for the exit dependency.
  stepPlatformer(w,['TAKE_KEY','ACTIVATE_SWITCH'].includes(a)?'WAIT':a);e=w.ext;
  if(w.result==='WIN'&&e.tier>=2&&!e.gate.open){w.terminal=false;w.result='IN_PROGRESS';w.x=w.exit-1;w.vx=0;w.events.push('EXIT_REQUIRES_KEY_AND_SWITCH');}
  if(w.lastDeath&&w.lastDeath.tick===w.tick){const k=w.lastDeath.cause+':'+w.lastDeath.section;if(e.failureKeys.includes(k))e.repeated++;e.failureKeys.push(k);}
  if(w.result==='WIN'&&e.round<e.rounds){const health=w.health;e.roundResults.push({stage:e.round,tick:w.tick,health});e.completed++;e.round++;w.terminal=false;w.result='IN_PROGRESS';configurePlatform(w,rng(w.seed^Math.imul(e.round,9973)));w.health=health;w.x=4;w.y=28;w.vx=0;w.vy=0;w.grounded=true;w.checkpoint=4;w.events.push('NEXT_STAGE');}
 }else{
  if(e.tier>=2){const wet=Math.floor(w.tick/e.weatherPeriod)%3!==0;e.weather=wet?'RAIN':'DRY';for(let i=0;i<w.track.segments.length;i++)w.track.segments[i].wet=wet||e.baseWet[i];}
  stepRacing(w,a);e=w.ext;
  if(w.terminal&&w.result.startsWith('FINISH_PLACE_')&&e.round<e.rounds){e.roundResults.push({race:e.round,placement:Number(w.result.at(-1)),offTrack:w.metrics.offTrack,barrierHits:w.metrics.barrierHits,repeatedOfftrack:metricsOf(w).repeatedFailureRate,grid:w.startPlace});e.completed++;const fresh=createLegacy('racing',(w.seed+e.round*7919)>>>0,e.tier,e.family);fresh.ext={...fresh.ext,round:e.round+1,completed:e.completed,roundResults:e.roundResults,return:e.return,limit:e.limit};fresh.tick=w.tick;fresh.terminal=false;fresh.events=['NEXT_RACE'];w=fresh;e=w.ext;}
 }
 e.return+=w.reward;if(!w.terminal&&w.tick>=e.limit){w.terminal=true;w.result='TIMEOUT';}
 return w;
}
export function metricsLegacy(w){const e=w.ext;let m=metricsOf(w);const success=w.game==='racing'?w.result==='FINISH_PLACE_1'&&e.roundResults.every(r=>r.placement===1):w.result==='WIN';const catastrophic=w.game==='platformer'?w.health<=0:w.game==='fighter'?e.catastrophes>0:w.game==='racing'?w.metrics.barrierHits+e.roundResults.reduce((n,r)=>n+(r.barrierHits??0),0)>=3:false;
 if(w.game==='pong')m={scoreDifference:e.points[0]-e.points[1],returns:e.returns,misses:e.misses,shotCount:e.shots.length};
 if(w.game==='fighter')m={damageDealt:e.hits,damageTaken:e.taken,blocks:e.blocks,whiffs:e.whiffs};
 return{...m,success,episodeReturn:e.return,catastrophic,repeatedFailures:e.repeated,objectiveCompletion:Math.max(0,Math.min(1,w.game==='pong'?e.points[0]/7:w.game==='platformer'?(e.completed+w.x/w.exit)/e.rounds:w.game==='fighter'?e.completed/e.rounds:(e.completed+w.player.s/(3*w.track.lapLength))/e.rounds)),roundResults:e.roundResults};}
