import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {DIR} from './io.mjs';
import {PLAN} from './plan.mjs';
import {initial,publicPacket,topology,nearSibling} from './scenarios.mjs';
import {validateInput,noPrivate} from './contract.mjs';
import {makePolicy} from './policy.mjs';
import {episode,paired} from './runner.mjs';
import {historyState,remember,occupancyFeatures} from './features.mjs';
import {train} from './train.mjs';
import {predict} from './model.mjs';
import {step,actorId,getMetrics,observe} from '../v3/kernel.mjs';
import {hash} from '../v3/common.mjs';
const spec=(game,difficulty=1,curriculum=null)=>({game,difficulty,seed:2099876137,split:'TEST_FIXTURE',index:0,family:'A',curriculum,lineageId:'UNIT_FIXTURE'});
test('inference closure has no evaluator, replay, filesystem or kernel import',()=>{
  const seen=new Set();function trace(file){if(seen.has(file))return;seen.add(file);const text=readFileSync(file,'utf8');for(const m of text.matchAll(/(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]/g)){const p=m[1];assert.ok(!/evaluator|runner|scenarios|kernel|worlds\/|node:fs|train\.mjs|io\.mjs/.test(p),p);if(p.startsWith('.'))trace(resolve(dirname(file),p));}}
  trace(resolve(DIR,'policy.mjs'));assert.ok(seen.size>=6);
});
test('label and private-state injection blocked, including nested payloads',()=>{
  const p=publicPacket(initial(spec('cards')));validateInput(p);
  for(const field of ['teacherRecommendation','conditionalRegret','deck','seed','grid'])assert.throws(()=>validateInput({...p,observation:{...p.observation,nested:{[field]:1}}}),/PRIVILEGED_FIELD/);
  assert.throws(()=>validateInput({...p,evaluator:{}}),/UNKNOWN_INFERENCE_FIELD/);
});
test('own cards cannot leak through a forged observation',()=>{const p=publicPacket(initial(spec('cards')));p.observation.hands[p.observation.viewer].cards[0].rank=1;p.binding.observationHash=hash(p.observation);assert.throws(()=>validateInput(p),/OWN_CARD_IDENTITY_LEAK/);});
test('public observation and action-set hashes bound',()=>{const p=publicPacket(initial(spec('rescue')));p.observation.tick++;assert.throws(()=>validateInput(p),/HASH_MISMATCH/);});
test('memory maps reset by level and fresh episode; historical location not current truth',()=>{
  const s=historyState(),o=observe(initial(spec('roguelike')));remember({...o,enemies:[{id:'e',x:4,y:4,type:'HUNTER',damage:5}]},s);assert.ok(Object.keys(s.enemies).length);remember({...o,level:2},s);assert.deepEqual(s.enemies,{});assert.deepEqual(historyState().tiles,{});
});
test('disabled memory does not retain past enemies',()=>{const s=historyState(),o=observe(initial(spec('rescue')));remember({...o,enemies:[{id:'x',x:4,y:4}]},s);remember({...o,enemies:[]},s,{disabled:true});assert.deepEqual(s.enemies,{});});
test('same public history yields same cross-world occupancy encoder',()=>{const s=historyState(),o={tick:3,actor:{x:2,y:2},tiles:[{x:3,y:2,glyph:'.'}],enemies:[]};assert.deepEqual(occupancyFeatures({...o,game:'rescue'},s,{x:3,y:2}),occupancyFeatures({...o,game:'roguelike'},s,{x:3,y:2}));});
test('supervised weights genuinely update reproducibly and reduce loss',()=>{const ex=[{x:[1,0],y:0},{x:[1,1],y:1}],a=train('TEST',ex,PLAN.training),b=train('TEST',ex,PLAN.training);assert.deepEqual(a,b);assert.ok(a.updated);assert.ok(a.losses.at(-1).meanLoss<a.losses[0].meanLoss);assert.ok(predict(a.model,[1,1])>predict(a.model,[1,0]));});
test('reserved population creation is blocked',()=>assert.throws(()=>initial(spec('factory',2,'TWO_RELAY_RESERVED')),/NOT_AUTHORIZED/));
test('engineering curriculum cannot earn success from WAIT',()=>{let w=initial(spec('factory',1,'STRAIGHT'));while(!w.terminal){const p=publicPacket(w);w=step(w,actorId(w),p.actions.find(a=>a.type==='WAIT'));}assert.equal(getMetrics(w).success,false);assert.equal(w.delivered,0);});
for(const d of PLAN.difficulties)test('engineering comparator/replay D'+d,()=>{const r=episode(spec('factory',d,'MIRRORED_DOGLEG'),'STRONG',{config:PLAN.training});assert.equal(r.metrics.success,true);assert.ok(r.metrics.conservationPass);assert.ok(r.exactReplay.pass);});
test('factory held-out geometry/graph family differs',()=>assert.notEqual(topology(initial(spec('factory',3,'STRAIGHT'))),topology(initial(spec('factory',3,'MIRRORED_DOGLEG')))));
test('near sibling detector rejects duplicate structure',()=>assert.ok(nearSibling(new Set(['1,1:#']),new Set(['1,1:#']))));
for(const sensor of Object.keys(PLAN.sensors))test('sensor condition remains public/legal: '+sensor,()=>{const w=initial(spec('cards',2)),p=makePolicy('STRONG',{config:{...PLAN.training,sensor}}),d=p.act(publicPacket(w));validateInput(d.packet);assert.ok(publicPacket(w).actions.some(a=>a.id===d.action.id));});
for(const game of PLAN.worlds)test('multiturn stale/partial/missing controls stay legal: '+game,()=>{for(const sensor of ['DELAYED','STALE','MISSING','PARTIAL']){let w=initial(spec(game,4,game==='factory'?'MIRRORED_DOGLEG':null));const policy=makePolicy('STRONG',{config:{...PLAN.training,sensor}});for(let i=0;i<40&&!w.terminal;i++){const d=policy.act(publicPacket(w));assert.ok(publicPacket(w).actions.some(a=>a.id===d.action.id));w=step(w,actorId(w),d.action);}}});
test('paired new catastrophes reject even improved mean return',()=>{const a={metrics:{success:false,episodeReturn:0,catastrophic:false},stats:{featureOperations:0}},b={metrics:{success:true,episodeReturn:100,catastrophic:true},stats:{featureOperations:1}},r=paired([[a,b]]);assert.equal(r.newCatastrophes,1);assert.equal(r.acceptance,'REJECTED_OR_NO_MATERIAL_IMPROVEMENT');});
test('no-op combination does not generate incremental value',()=>{const a={metrics:{success:true,episodeReturn:3,catastrophic:false},stats:{featureOperations:0}},r=paired([[a,a]]);assert.equal(r.returnDelta,0);assert.equal(r.successDelta,0);});
