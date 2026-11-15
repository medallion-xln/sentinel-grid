// Evaluator-only constructive attempts. True spin/grip/track are NEVER supplied to game policies.
import {create,packet,step,terminal,metrics,verifyReplay} from './kernel.mjs';import {clone,hash} from '../v3/common.mjs';import {ruleDriver,previewFor,CAR,segmentAt} from '../worlds/racing.mjs';import {createPolicy} from './policy.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function intercept(ball){const b=clone(ball);for(let t=1;t<300;t++){b.vy=clamp(b.vy+b.spin,-2.8,2.8);b.spin*=.97;b.x+=b.vx;b.y+=b.vy;if(b.y<1||b.y>30){b.y=b.y<1?2-b.y:60-b.y;b.vy=-b.vy;b.spin=-b.spin;}if(b.x<=3)return{ticks:t,y:b.y};}return null;}
function oracleAction(w,p,variant){const s=w.inner,e=s.ext,find=t=>p.actions.find(a=>a.type===t);
 if(w.game==='pong'){
  const targets=e.balls.filter(b=>b.vx<0&&s.tick>=b.release).map(b=>({...intercept(b),id:b.id})).filter(x=>x.ticks).sort((a,b)=>a.ticks-b.ticks),v=targets[0];let aim=16;if(v){const sign=s.enemyY<16?-1:1,offset=variant===0?0:variant===1?sign*2.7:variant===2?-sign*2.7:(s.tick%2?1:-1)*2.3;aim=clamp(v.y-offset,4,27);}const error=aim-s.playerY-e.velocity*2;return find(error<-.25?'UP':error>.25?'DOWN':'HOLD');
 }
 if(w.game==='platformer'){
  if(find('TAKE_KEY'))return find('TAKE_KEY');if(find('ACTIVATE_SWITCH'))return find('ACTIVATE_SWITCH');
  if(!s.grounded)return find(s.jumpHeld&&s.vy<0?'JUMP_RIGHT':'MOVE_RIGHT')??find('MOVE_RIGHT');
  const gap=s.gaps.find(g=>g[1]>=s.x&&g[0]-s.x<=3.3),wall=s.walls.find(g=>g[1]>=s.x&&g[0]-s.x<3),hazard=s.spikes.some(x=>x>=s.x&&x-s.x<3)||s.enemies.some(n=>n.x>=s.x&&n.x-s.x<4);
  return find(gap||wall||hazard?'JUMP_RIGHT':'MOVE_RIGHT');
 }
 const c=s.player,grip=CAR.grip*(segmentAt(s.track,c.s).wet?s.track.wetGrip:1),traffic=s.rivals.map(r=>({id:r.id,ds:r.s-c.s,n:r.n,v:r.v})),a=ruleDriver(c,{preview:previewFor(s.track,c.s,300),traffic,grip},{skill:[.96,1,1.04,1.08][variant],brakeMargin:.95,line:.6,lane:0,gain:1,wetCaution:1,defend:false});return find(a);
}
export function constructive(spec,variant=0){let w=create(spec.game,spec.seed,spec.tier,{family:spec.family,sensor:'NORMAL'}),actions=[],hashes=[hash(w.inner)];while(!terminal(w)){const p=packet(w),a=oracleAction(w,p,variant)??p.actions[0];actions.push(a);w=step(w,p,a);hashes.push(hash(w.inner));}const r={schema:'V32_EVALUATOR_ONLY_REPLAY_V1',initial:{game:spec.game,seed:spec.seed,tier:spec.tier,family:spec.family,sensor:'NORMAL'},actions,hashes,final:metrics(w)};return{success:metrics(w).success,metrics:metrics(w),outcome:w.inner.result,ticks:w.inner.tick,variant,replay:r,verification:verifyReplay(r),scope:'PRIVATE_EVALUATOR_CONSTRUCTIVE_WITNESS_NOT_DEPLOYABLE_POLICY_OR_PERFORMANCE_EVIDENCE'};}
