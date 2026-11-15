// Presentation overlay only: every value comes from the permitted observation.
// Frozen V3 mechanics/rendering and benchmark results remain untouched.
import {render as inheritedRender,objective,LEGENDS as inheritedLegends} from '../v3/render.mjs';
export {objective};
export const LEGENDS={...inheritedLegends,
  cards:'[??] your hidden card | clues narrow its possible identity | partner cards are visible | slots start at 0 | mistakes = lives lost',
  factory:'* transfer pulse this tick (not a simulated travelling item) | ! broken | O mine | F furnace | A assembler | S storage | X delivery | P power | C cutter | B buffer'};
const bar=(value,total)=>'['+'#'.repeat(Math.min(12,Math.max(0,Math.floor(12*value/Math.max(1,total)))))+'.'.repeat(12-Math.min(12,Math.max(0,Math.floor(12*value/Math.max(1,total)))))+']';
const wrap=(text,width=56)=>{
  const words=String(text).split(/\s+/),lines=[];let line='';
  for(const word of words){if(line&&line.length+word.length+1>width){lines.push(line);line='';}line+=(line?' ':'')+word;}
  if(line)lines.push(line);return lines;
};
const actionOf=d=>typeof d?.action==='string'?{type:d.action,parameters:d.parameters??{}}:d?.action;
function orderText(d) {
  const a=actionOf(d);if(!a)return 'Controller connecting; first order pending';
  const p=a.parameters??{};
  if(a.type==='WAIT')return 'WAIT - machines continue producing';
  if(a.type==='CONNECT'||a.type==='DISCONNECT'||a.type==='REROUTE')return `${a.type} ${p.from} -> ${p.to}`;
  if(a.type==='ALLOCATE_POWER')return `POWER ${p.id} = ${p.amount}`;
  return `${a.type}${p.id?' '+p.id:''}`;
}
function renderCards(o) {
  const lines=[`SIGNAL CARDS | TURN ${o.tick} | ${o.result}`,
    `TEAM ${bar(o.score,o.target)} ${o.score}/${o.target}`,
    `CLUES ${o.clues}/${o.clueMax} | LIVES ${o.errors} | DECK ${o.deckRemaining}`,
    o.terminal?'ROUND COMPLETE - Replay deal to play again':`>>> P${o.turn} TO ACT ${o.turn===o.viewer?'(your / Sentinel turn)':'(partner turn)'}`,
    '', 'PUBLIC SEQUENCES - play the next rank'];
  for(const category of o.categories)lines.push(category+' '+Array.from({length:o.ranks},(_,i)=>`[${i<o.progress[category]?category+(i+1):'..'}]`).join('')+
    (o.progress[category]<o.ranks?` next ${category}${o.progress[category]+1}`:' COMPLETE'));
  lines.push('', 'LATEST PUBLIC ACTION');
  if(o.events.length)for(const event of o.events)lines.push(...wrap(event.message));
  else lines.push('Waiting for the first clue or card play.');
  for(const hand of o.hands) {
    lines.push('',`${!o.terminal&&hand.player===o.turn?'>>> ':''}P${hand.player} ${hand.player===o.viewer?'YOU - IDENTITIES HIDDEN':'PARTNER - VISIBLE CARDS'}`);
    if(!hand.cards.length){lines.push('(empty hand)');continue;}
    lines.push(hand.cards.map(()=>'+----+').join(' '));
    lines.push(hand.cards.map(c=>`| ${c.concealed?'??':c.category+c.rank} |`).join(' '));
    lines.push(hand.cards.map(()=>'+----+').join(' '));
    lines.push(hand.cards.map((c,i)=>`slot ${i}`).join('  '));
    if(hand.player===o.viewer)for(const [i,k]of hand.knowledge.entries())
      lines.push(`  ${i}: ${k.categories.join('/')} ; ranks ${k.ranks.join('/')}`);
  }
  if(o.finalTurns!==null&&!o.terminal)lines.push(`DECK EMPTY - ${o.finalTurns} final turns left`);
  return lines.join('\n');
}
function renderFactory(o,d) {
  const map=inheritedRender(o).split('\n').map(row=>row.split(''));
  const pulses=[];
  for(const edge of o.edges) {
    if(!edge.lastFlow)continue;
    const from=o.nodes.find(n=>n.id===edge.from),to=o.nodes.find(n=>n.id===edge.to);
    if(!from||!to)continue;
    // Only draw a pulse along an actual aligned public transport edge.
    if(from.x!==to.x&&from.y!==to.y)continue;
    const distance=Math.abs(to.x-from.x)+Math.abs(to.y-from.y);
    if(distance<2)continue;
    const offset=1+o.tick%(distance-1),x=from.x+Math.sign(to.x-from.x)*offset,y=from.y+Math.sign(to.y-from.y)*offset;
    if(map[y]?.[x]!==undefined)map[y][x]='*';
    pulses.push(`${edge.from}>${edge.to}:${edge.lastFlow}`);
  }
  const lines=[`FACTORY | TICK ${o.tick} | ${o.result}`,
    `DELIVERED ${bar(o.delivered,o.required)} ${o.delivered}/${o.required}`,
    `ORE LEFT ${o.mineRemaining} | CREDITS ${o.credits}`,
    ...map.map(row=>row.join('')), '',
    'MACHINE      ORE ING PART PROD  ACTIVITY'];
  for(const node of o.nodes) {
    const inv=node.inventory;
    const activity=node.broken?'BROKEN':node.ready>o.tick?'BUILDING':!node.enabled?'OFF':
      node.lastOutput>0?`MADE ${node.lastOutput}`:node.lastBlock==='POWER'?'NEEDS POWER':
      node.lastBlock==='INPUT'?'WAIT INPUT':node.lastBlock==='OUTPUT_FULL'?'FULL':node.lastBlock??'READY';
    lines.push(node.id.padEnd(12)+[inv.ore,inv.ingot,inv.part,inv.product].map(n=>String(n??0).padStart(3)).join(' ')+'  '+activity);
  }
  lines.push('',...wrap('FLOW THIS TICK: '+(pulses.length?pulses.join(' | '):'none - check power, inputs or links')),
    ...wrap('LAST ORDER: '+orderText(d)));
  for(const event of o.events)lines.push(...wrap(event.message));
  if(o.pending.length)lines.push(...wrap('PENDING: '+o.pending.map(p=>`${p.type} ${p.id} completes t${p.ready}`).join(' | ')));
  if(o.terminal)lines.push(o.result==='SUCCESS'?'TARGET DELIVERED - factory completed':'ROUND OVER - Replay factory to try again');
  return lines.join('\n');
}
export function render(o,d=null) {
  return o.game==='cards'?renderCards(o):o.game==='factory'?renderFactory(o,d):inheritedRender(o);
}
