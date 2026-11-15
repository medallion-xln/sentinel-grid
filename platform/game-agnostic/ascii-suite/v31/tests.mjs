import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createServer} from './server.mjs';
import {createWorld,packet,actorId,step} from '../v3/kernel.mjs';
import {sentinelState,sentinelDecide,publicGraph} from './sentinel.mjs';
import {evaluateNexus} from '../../src/experts/nexus.js';
import {evaluateOracle} from '../../src/experts/oracle.js';
import {render} from './render.mjs';
import {controllerState,decide} from '../v3/controllers.mjs';

function fakeElement(tag='DIV') {
  return {tagName:tag.toUpperCase(),value:'',textContent:'',disabled:false,hidden:false,open:false,children:[],style:{},
    append(...items){this.children.push(...items);},
    replaceChildren(...items){this.children=[...items];if(this.tagName==='SELECT'&&items.length)this.value=items[0].value;},
    setAttribute(name,value){this[name]=value;},
    querySelector(tag){return this.children.find(c=>c.tagName===tag.toUpperCase())??this.children.map(c=>c.querySelector?.(tag)).find(Boolean);},
    classList:{toggle(){return false;}},click(){if(!this.disabled)this.onclick?.();}};
}

test('real unchanged native expert outputs match direct invocation',()=>{
  let w=createWorld('rescue',9001000,1),s=sentinelState();
  for(let i=0;i<6;i++) {
    const p=packet(w),d=sentinelDecide(p,s);s=d.state;
    assert.deepEqual(d.integration.nexus,evaluateNexus({canonicalState:publicGraph(p.observation),
      legalActions:p.actions.map(a=>({actionId:a.id,targetEntityId:a.parameters?.id??null}))}));
    assert.deepEqual(d.integration.oracle,evaluateOracle({observationHistory:s.history}));
    assert.equal(d.integration.invocationCounts.Nexus,i+1);
    assert.equal(d.integration.authority.canDispatch,false);
    assert.ok(p.actions.some(a=>a.id===d.action.id));
    assert.equal(d.integration.actionSource,'BOUNDED_PLANNER_FALLBACK');
    w=step(w,actorId(w),d.action);
  }
});
test('factory native Nexus owns an actual legal repair, not a relabeled fallback',()=>{
  const w=createWorld('factory',100,4);w.nodes.find(n=>n.id==='furnace').broken=true;
  const p=packet(w),d=sentinelDecide(p,sentinelState());
  assert.equal(d.integration.actionSource,'NEXUS_RELATIONAL_SELECTOR_V1');
  assert.equal(d.action.type,'REPAIR');
  assert.equal(d.integration.selection.actionId,d.action.id);
});
test('cards evidence uses only current permitted view, no own card identities',()=>{
  const w=createWorld('cards',100,1),p=packet(w),d=sentinelDecide(p,sentinelState());
  assert.deepEqual(publicGraph(p.observation),{entities:[],relationships:[]});
  assert.equal(d.integration.nexus.signals.entityCount,0);
  assert.equal(d.integration.actionSource,'BOUNDED_PLANNER_FALLBACK');
  assert.equal(d.integration.oracle.signals.historyFrameCount,1);
});
test('all eight worlds advance through HTTP with Sentinel selected; reject stale actions',async()=>{
  const server=createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const post=async(path,body)=>{const r=await fetch(origin+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,value:await r.json()};};
  let session;
  try {
    assert.equal((await fetch(origin)).status,200);
    for(const game of ['rescue','cards','factory','roguelike','pong','platformer','fighter','racing']) {
      const initial=await post('reset',{session,game,seed:9001000,difficulty:1,controller:'SENTINEL'});
      assert.equal(initial.status,200,JSON.stringify(initial.value));session=initial.value.session;
      let current=initial.value;
      for(let i=0;i<12&&!current.observation.terminal;i++) {
        const result=await post('step',{session,auto:true,binding:current.binding});
        assert.equal(result.status,200,JSON.stringify(result.value));current=result.value;
        assert.ok(current.observation.tick>0);
        if(current.decision.source!=='PARTNER_PUBLIC_ACTION_ONLY') {
          assert.ok(current.decision.integration,game);
          assert.equal(current.decision.integration.invocationCounts.Nexus,game==='cards'?Math.floor(i/2)+1:i+1);
        } else assert.equal(current.decision.integration,undefined,'partner private rationale must not leak');
      }
      const stale=await post('step',{session,auto:true,binding:initial.value.binding});
      assert.notEqual(stale.status,200);
      console.log(`${game}: advanced to tick ${current.observation.tick}`);
    }
    const base=await post('reset',{session,game:'rescue',controller:'RULE_BASELINE',seed:12,difficulty:1});session=base.value.session;
    const result=await post('step',{session,auto:true,binding:base.value.binding});
    assert.equal(result.value.decision.integration,undefined);
    assert.equal(result.value.decision.source,'RULE_BASELINE');
    const invalid=await post('reset',{game:'rescue',controller:'FAKE'});assert.equal(invalid.status,400);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

// Exercise the real UI module with a tiny DOM/fetch harness and controlled timers,
// including selection changes and pause/play while a step request is in flight.
test('UI autoplays, loads selection immediately, serializes rapid resets, and survives busy Play',async()=>{
  const elements=new Map(),listeners={},timers=new Map();let counter=0,requests=[],releaseStep=null;
  const values={game:'rescue',seed:'9001000',difficulty:'1',controller:'SENTINEL',memory:'CAMPAIGN_MEMORY',partner:'RULE_BASED',players:'2',speed:'250'};
  const element=id=>elements.get(id)??elements.set(id,{...fakeElement(),value:values[id]??'',
    addEventListener(name,fn){listeners[id+':'+name]=fn;}}).get(id);
  const reply=(game,tick,session)=>({session,observation:{game,tick,result:'IN_PROGRESS',terminal:false},binding:{tick},actions:[],state:{},metrics:{},frame:'frame '+game,scope:'TEST'});
  let game='rescue',tick=0;
  const fetch=async(url,options)=>{
    const body=JSON.parse(options.body);requests.push({url,body});
    if(url==='/api/reset') {game=body.game;tick=0;return{ok:true,json:async()=>reply(game,tick,'s'+requests.length)};}
    if(releaseStep===false)await new Promise(resolve=>releaseStep=resolve);
    tick++;return{ok:true,json:async()=>reply(game,tick,body.session)};
  };
  const context=vm.createContext({document:{getElementById:element,createElement:tag=>fakeElement(tag),querySelector:()=>element('main'),addEventListener(){}},
    fetch,AbortSignal,JSON,Number,Error,Blob,URL,setTimeout(fn){const id=++counter;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  const source=readFileSync(new URL('./ui/app.js',import.meta.url),'utf8');
  await vm.runInContext('(async()=>{'+source+'})()',context);
  const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
  assert.equal(timers.size,1,'startup schedules autoplay');
  const fire=async()=>{const[id,fn]=timers.entries().next().value;timers.delete(id);fn();await flush();};
  await fire();assert.equal(tick,1);
  element('game').value='racing';await listeners['settings:change']();
  assert.equal(game,'racing');assert.equal(element('world').textContent,'frame racing');
  element('game').value='cards';const first=listeners['settings:change']();
  element('game').value='factory';const second=listeners['settings:change']();await first;await second;
  assert.equal(game,'factory');assert.equal(timers.size,1);
  releaseStep=false;await fire();assert.equal(typeof releaseStep,'function');
  element('play').click();assert.equal(timers.size,0);
  element('play').click();releaseStep();await flush();
  assert.equal(timers.size,1,'in-flight request completion must preserve new Play intent');
  await fire();assert.ok(tick>=2);
});

test('factory renderer changes with real flow even while the builder stands still',()=>{
  const w=createWorld('factory',9001000,1),p=packet(w),wait=p.actions.find(a=>a.type==='WAIT');
  const next=step(w,actorId(w),wait),o=packet(next).observation;
  assert.deepEqual(next.actor,w.actor);
  const first=render(p.observation),second=render(o,{action:wait});
  assert.notEqual(first,second);
  assert.match(second,/O>\*>F/);assert.match(second,/mine>furnace:1/);
  assert.match(second,/MADE 1/);assert.match(second,/DELIVERED \[.*\] 0\/12/);
  assert.ok(/^[\x20-\x7e\n]+$/.test(second));
});
test('mobile auto-height sizing does not repeatedly shrink card/factory text',()=>{
  const source=readFileSync(new URL('./ui/app.js',import.meta.url),'utf8');
  const functionSource=source.slice(source.indexOf('function fitWorld()'),source.indexOf('function actionLabel('));
  const field={clientWidth:544,clientHeight:400,textContent:Array(30).fill('x'.repeat(50)).join('\n'),style:{}};
  for(const game of ['cards','factory']) {
    const context=vm.createContext({$:()=>field,data:{observation:{game}},matchMedia:()=>({matches:false})});
    vm.runInContext(functionSource+'fitWorld();',context);
    const first=field.style.fontSize;field.clientHeight=500;
    vm.runInContext('fitWorld();',context);assert.equal(field.style.fontSize,first);
    assert.ok(parseFloat(first)>=12);
  }
});
test('cards renderer shows turn, public clue/play events, target and concealed own cards',()=>{
  const w=createWorld('cards',9001000,1),p=packet(w),a=p.actions.find(a=>a.type==='GIVE_RANK_CLUE');
  const next=step(w,actorId(w),a),o=packet(next,'P0').observation;
  const frame=render(o);
  assert.match(frame,/>>> P1 TO ACT \(partner turn\)/);
  assert.match(frame,/P0 told P1 rank/);assert.match(frame,/CLUES 7\/8/);
  assert.equal((frame.match(/\| \?\? \|/g)??[]).length,4);
  assert.ok(/^[\x20-\x7e\n]+$/.test(frame));
});
test('presentation remains identical after permissible hidden truth swaps',()=>{
  const cards=createWorld('cards',9001000,1),changed=structuredClone(cards);
  [changed.hands[0][0],changed.deck[0]]=[changed.deck[0],changed.hands[0][0]];
  assert.equal(render(packet(cards,'P0').observation),render(packet(changed,'P0').observation));
  const factory=createWorld('factory',9205000,5),future=structuredClone(factory);
  future.firstDisruption+=20;future.seed++;
  assert.equal(render(packet(factory).observation),render(packet(future).observation));
});
test('full Cards/Factory Sentinel episodes visibly complete without changing mechanics',()=>{
  for(const game of ['cards','factory']) {
    let w=createWorld(game,9001000,1),s=sentinelState(),partner=controllerState('RULE_BASELINE'),previous='';
    while(!w.terminal) {
      const p=packet(w),actor=actorId(w),isPartner=game==='cards'&&w.turn!==0;
      const d=isPartner?decide(p,partner):sentinelDecide(p,s);
      if(isPartner)partner=d.state;else s=d.state;
      w=step(w,actor,d.action);
      const frame=render(packet(w,'P0').observation,d);
      assert.notEqual(frame,previous);previous=frame;
    }
    assert.equal(w.result,'SUCCESS');
    assert.match(previous,game==='cards'?/ROUND COMPLETE/:/TARGET DELIVERED/);
  }
});
test('manual card clues, partner turn and factory power/production controls dispatch real legal actions',async()=>{
  const elements=new Map(),listeners={},timers=new Map(),requests=[];
  const values={game:'cards',seed:'9001000',difficulty:'1',controller:'SENTINEL',memory:'CAMPAIGN_MEMORY',partner:'RULE_BASED',players:'2',speed:'250'};
  const element=id=>elements.get(id)??elements.set(id,{...fakeElement(),value:values[id]??'',
    addEventListener(name,fn){listeners[id+':'+name]=fn;}}).get(id);
  let w,serial=0;
  const response=()=>{const p=packet(w,'P0');return {session:'test',observation:p.observation,binding:p.binding,frame:render(p.observation),
    partnerTurn:w.game==='cards'&&w.turn!==0,actions:p.actions,state:{},metrics:p.observation.publicMetrics,scope:'TEST'};};
  const fetch=async(url,options)=>{
    const b=JSON.parse(options.body);requests.push({url,body:b});
    if(url==='/api/reset')w=createWorld(b.game,b.seed,b.difficulty,{players:b.players});
    else {
      const p=packet(w),isPartner=w.game==='cards'&&w.turn!==0;
      const a=b.auto||isPartner?decide(p,controllerState('RULE_BASELINE')).action:p.actions.find(a=>a.id===b.actionId);
      assert.ok(a,'UI must offer an actually legal action');w=step(w,actorId(w),a);
    }
    return {ok:true,json:async()=>response()};
  };
  const context=vm.createContext({document:{getElementById:element,createElement:fakeElement,querySelector:()=>element('main'),addEventListener(){}},
    fetch,AbortSignal,JSON,Number,Error,Blob,URL,setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
  await vm.runInContext('(async()=>{'+readFileSync(new URL('./ui/app.js',import.meta.url),'utf8')+'})()',context);
  const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
  element('game-controls').open=true;listeners['game-controls:toggle']();assert.equal(timers.size,0);
  const clue=element('quick-controls').children[1].children.find(b=>b.textContent==='Tell P1: rank 1');
  assert.ok(clue);clue.click();await flush();assert.equal(w.clues,7);assert.equal(w.turn,1);
  assert.equal(requests.at(-1).body.auto,false);assert.match(element('world').textContent,/P0 told P1 rank 1/);
  const partner=element('quick-controls').children[0];assert.equal(partner.textContent,'Run partner turn');
  partner.click();await flush();assert.equal(w.turn,0);assert.equal(w.tick,2);
  element('game').value='factory';await listeners['settings:change']();
  element('game-controls').open=true;listeners['game-controls:toggle']();
  const select=element('quick-controls').querySelector('select');
  select.value=packet(w).actions.find(a=>a.type==='ALLOCATE_POWER'&&a.parameters.id==='furnace'&&a.parameters.amount===3).id;
  element('quick-controls').children.find(b=>b.textContent==='Apply order').click();await flush();
  assert.equal(w.nodes.find(n=>n.id==='furnace').power,3);
  const prior=w.tick;const production=element('quick-controls').children.find(b=>b.textContent==='Run production tick');
  production.click();await flush();assert.equal(w.tick,prior+1);assert.equal(requests.at(-1).body.actionId,'WAIT:{}');
  assert.match(element('status').textContent,/Delivered/);
});
