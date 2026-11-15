const $=id=>document.getElementById(id);
let session=null,data=null,running=true,timer=null,trace=[],generation=0,queue=Promise.resolve(),pendingResets=0;
async function api(path,body) {
  const response=await fetch('/api/'+path,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const value=await response.json();
  if(!response.ok)throw Error(value.error??response.statusText);
  return value;
}
function playLabel() {$('play').textContent=running?'Pause':data?.observation.terminal?'Play again':'Play';}
function stop() {running=false;clearTimeout(timer);playLabel();}
function schedule() {
  clearTimeout(timer);playLabel();
  if(running&&!pendingResets&&data&&!data.observation.terminal)
    timer=setTimeout(()=>advance(),Number($('speed').value));
}
function fail(error) {
  stop();$('status').className='error';
  $('status').textContent=`${error.message}. Use Restart & Play to reconnect.`;
}
function serial(work) {
  const result=queue.then(work);
  queue=result.catch(fail);
  return queue;
}
function fitWorld() {
  const field=$('world'),width=field.clientWidth,height=field.clientHeight;
  if(!width||!height)return;
  const lines=field.textContent.split('\n'),columns=Math.max(...lines.map(line=>line.length),1);
  const minimum=['cards','factory'].includes(data?.observation.game)?12:8;
  // Mobile has an auto-height field: fitting its height back into font size
  // creates ResizeObserver feedback that repeatedly shrinks readable text.
  const fixedHeight=typeof matchMedia==='function'&&matchMedia('(min-width:801px)').matches;
  const heightLimit=fixedHeight?(height-8)/(lines.length*1.12):18;
  field.style.fontSize=Math.max(minimum,Math.min(28,(width-8)/(columns*.62),heightLimit))+'px';
}
function actionLabel(action) {
  const p=action.parameters??{};
  if(action.type==='PLAY_CARD')return `Play slot ${p.slot}`;
  if(action.type==='DISCARD_CARD')return `Discard slot ${p.slot} (+1 clue)`;
  if(action.type==='GIVE_CATEGORY_CLUE')return `Tell P${p.target}: ${p.category}`;
  if(action.type==='GIVE_RANK_CLUE')return `Tell P${p.target}: rank ${p.rank}`;
  if(action.type==='ALLOCATE_POWER')return `Power ${p.id}: ${p.amount}`;
  if(action.type==='SET_PRODUCTION')return `${p.enabled?'Start':'Stop'} production: ${p.id}`;
  if(action.type==='BUILD')return `BUILD ${p.type} at (${p.x},${p.y})`;
  if(['CONNECT','DISCONNECT','REROUTE'].includes(action.type))return `${action.type}: ${p.from} -> ${p.to}${p.capacity?' capacity '+p.capacity:''}`;
  return action.type+(p.id?' '+p.id:'')+(p.type?' '+p.type:'');
}
function manualButton(label,callback) {
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.onclick=()=>{stop();callback();};return button;
}
function gameControls(value) {
  const o=value.observation,panel=$('game-controls'),controls=$('quick-controls');
  panel.hidden=!['cards','factory'].includes(o.game);
  if(panel.hidden)return;
  $('controls-title').textContent=o.game==='cards'?'Manual cards & clues':'Factory engineering controls';
  $('game-help').textContent=o.game==='cards'?
    'Your cards are intentionally hidden. Give clues to a partner, play from known clues, or discard to restore a clue. Opening these controls pauses autoplay.':
    'Machines work on every tick, including WAIT. The builder can stay still. Connect transport, allocate power and repair broken machines. Opening these controls pauses autoplay.';
  const previous=controls.querySelector?.('select')?.value;
  controls.replaceChildren();
  if(o.terminal) {
    controls.append(manualButton(o.game==='cards'?'Replay deal':'Replay factory',()=>reset()));return;
  }
  if(value.partnerTurn) {
    controls.append(manualButton('Run partner turn',()=>advance()));return;
  }
  if(o.game==='cards') {
    const slots=document.createElement('div');slots.className='quick-row';
    const clues=document.createElement('div');clues.className='quick-row';
    for(const action of value.actions)
      (action.type.startsWith('GIVE_')?clues:slots).append(manualButton(actionLabel(action),()=>advance(false,action.id)));
    controls.append(slots,clues);
  } else {
    const label=document.createElement('label'),select=document.createElement('select');
    label.textContent='Engineering order';select.id='factory-order';select.setAttribute('aria-label','Engineering order');
    const orders=value.actions.filter(a=>!a.type.startsWith('MOVE_')&&a.type!=='WAIT');
    select.replaceChildren(...orders.map(a=>{const option=document.createElement('option');option.value=a.id;option.textContent=actionLabel(a);return option;}));
    if(orders.some(a=>a.id===previous))select.value=previous;
    label.append(select);controls.append(label);
    const apply=manualButton('Apply order',()=>advance(false,select.value));apply.disabled=!orders.length;
    controls.append(apply);
    const wait=value.actions.find(a=>a.type==='WAIT');
    if(wait)controls.append(manualButton('Run production tick',()=>advance(false,wait.id)));
  }
}
function paint(value) {
  data=value;session=value.session;
  const o=value.observation,integration=value.decision?.integration;
  for(const[id,text]of Object.entries({world:value.frame,legend:value.legend,objective:value.objective,
    state:JSON.stringify(value.state,null,2),decision:JSON.stringify(value.decision??'Waiting for first controller decision',null,2),
    metrics:JSON.stringify(value.metrics,null,2)}))$(id).textContent=text;
  gameControls(value);
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(fitWorld);
  const previous=$('actions').value;
  $('actions').replaceChildren(...value.actions.map(action=>{
    const option=document.createElement('option');option.value=action.id;
    option.textContent=['cards','factory'].includes(o.game)?actionLabel(action):action.type+' '+JSON.stringify(action.parameters);return option;
  }));
  if(value.actions.some(a=>a.id===previous))$('actions').value=previous;
  $('manual').disabled=!value.actions.length||o.terminal;$('step').disabled=o.terminal;
  $('play').disabled=false;
  const native=integration?` | Native calls: Nexus ${integration.invocationCounts.Nexus}, Oracle ${integration.invocationCounts.Oracle} | Action: ${integration.actionSource}`:'';
  $('status').className='';
  const progress=o.game==='cards'?` | Team ${o.score}/${o.target} | Lives ${o.errors}`:
    o.game==='factory'?` | Delivered ${o.delivered}/${o.required}`:'';
  $('status').textContent=`${o.game.toUpperCase()} | Tick ${o.tick} | ${o.result}${progress} | ${value.scope}${native}`;
  if(value.lastAction) {trace.push(`t${o.tick} ${(o.events??[]).map(e=>e.message).join(' | ')||value.lastAction}`);trace=trace.slice(-30);}
  $('trace').textContent=trace.join('\n');
  if(o.terminal)stop();else playLabel();
}
function settings() {return {game:$('game').value,seed:Number($('seed').value),difficulty:Number($('difficulty').value),
  controller:$('controller').value,memoryMode:$('memory').value,partnerPolicy:$('partner').value,players:Number($('players').value)};}
function reset(event) {
  event?.preventDefault();clearTimeout(timer);running=true;playLabel();
  const wanted=settings(),token=++generation;pendingResets++;
  if(wanted.game==='cards'&&data?.observation.game!=='cards')$('speed').value='1000';
  $('game-controls').open=false;
  $('status').textContent=`Loading ${wanted.game} and connecting ${wanted.controller}…`;
  return serial(async()=>{
    try {
      if(token!==generation)return;
      const value=await api('reset',{...wanted,session});
      // Retain the returned handle even for a superseded reset, so the next reset
      // disposes its workers. Never paint a world superseded by a newer selection.
      session=value.session;
      if(token!==generation)return;
      trace=[];paint(value);
    } finally {pendingResets--;schedule();}
  });
}
function advance(auto=true,actionId=null) {
  clearTimeout(timer);const token=generation;
  return serial(async()=>{
    if(token!==generation||pendingResets||!session||data?.observation.terminal)return;
    try {
      const value=await api('step',{session,auto,actionId:actionId??$('actions').value,binding:data.binding});
      if(token===generation)paint(value);
    } finally {schedule();}
  });
}
$('settings').addEventListener('submit',reset);
$('settings').addEventListener('change',reset);
$('play').onclick=()=>{
  if(running)stop();
  else if(data?.observation.terminal)reset();
  else {running=true;schedule();}
};
$('step').onclick=()=>{stop();advance();};
$('manual').onclick=()=>{stop();advance(false);};
$('speed').onchange=schedule;
$('game-controls').addEventListener('toggle',()=>{if($('game-controls').open)stop();});
$('panels').onclick=()=>{
  const collapsed=document.querySelector('main').classList.toggle('collapsed');
  $('panels').textContent=collapsed?'Show telemetry':'Hide telemetry';
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(fitWorld);
};
$('replay').onclick=()=>serial(async()=>{
  if(!session)return;
  const replay=await api('replay',{session}),blob=new Blob([JSON.stringify(replay,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='public-observation-replay.json';link.click();URL.revokeObjectURL(url);
});
document.addEventListener('keydown',event=>{
  if(['INPUT','SELECT','BUTTON'].includes(event.target.tagName))return;
  if(event.key===' ') {event.preventDefault();$('play').click();return;}
  const type={ArrowUp:'MOVE_NORTH',w:'MOVE_NORTH',ArrowDown:'MOVE_SOUTH',s:'MOVE_SOUTH',
    ArrowRight:'MOVE_EAST',d:'MOVE_EAST',ArrowLeft:'MOVE_WEST',a:'MOVE_WEST'}[event.key];
  const found=data?.actions.find(action=>action.type===type);
  if(found) {event.preventDefault();stop();advance(false,found.id);}
});
if(typeof ResizeObserver==='function')new ResizeObserver(fitWorld).observe($('world'));
await reset();
