// Deployable observation-only closure. No filesystem, labels, kernel or state access.
import {validateInput} from './contract.mjs';
import {historyState,remember,cells,occupancyFeatures,actionFeatures,cardFeatures} from './features.mjs';
import {predict,select} from './model.mjs';
import {controllerState,decide} from '../v3/controllers.mjs';
import {DIRECTIONS,key,manhattan,hash} from '../v3/common.mjs';
const factoryRule=p=>{
  const o=p.observation,find=(type,test=()=>true)=>p.actions.find(a=>a.type===type&&test(a.parameters)),spec={SOURCE:1,FURNACE:2,ASSEMBLER:3,CUTTER:2};
  for(const n of o.nodes){const pending=o.pending.some(t=>t.id===n.id);if(n.broken&&!pending)return find('REPAIR',q=>q.id===n.id)??find('WAIT');if(!n.enabled&&spec[n.type])return find('SET_PRODUCTION',q=>q.id===n.id&&q.enabled);if(spec[n.type]&&n.power<spec[n.type])return find('ALLOCATE_POWER',q=>q.id===n.id&&q.amount===spec[n.type]);}
  for(const[from,to]of p.objective.requiredLinks)if(!o.edges.some(e=>e.from===from&&e.to===to))return find('CONNECT',q=>q.from===from&&q.to===to)??find('WAIT');
  const load=o.nodes.filter(n=>n.enabled).reduce((v,n)=>v+(spec[n.type]??0),0),supply=o.nodes.filter(n=>n.type==='POWER'&&!n.broken).reduce((v,n)=>v+6+3*(n.level-1),0);
  if(load>supply)return find('UPGRADE',q=>o.nodes.find(n=>n.id===q.id)?.type==='POWER')??find('WAIT');return find('WAIT');
};
export function makePolicy(kind,{model=null,config={},memory='EPISODIC',experience=[],episodeId='unknown',partner='RULE_BASELINE'}={}){
  const states=new Map(),histories=new Map(),buffers=new Map();
  const stats={inferences:0,fallbacks:0,changes:0,abstentions:0,memoryReads:0,memoryWrites:0,featureOperations:0,baselineInterfaceErrors:0,plannerExpansions:0,plannerCandidates:0,plannerModelTicks:0};
  function act(raw){
    const actor=raw.binding.actor,isPartner=raw.observation.game==='cards'&&actor!=='P0',effective=isPartner?partner:kind;
    const history=buffers.get(actor)??[];history.push(structuredClone(raw.observation));buffers.set(actor,history);
    let p=structuredClone(raw);const sensor=config.sensor??'NORMAL';
    if(sensor==='MISSING')p.observation={schema:'MISSING_PUBLIC_OBSERVATION_V1',game:raw.observation.game,tick:raw.receiptTick,missing:true};
    else if(sensor==='DELAYED'||sensor==='STALE'){const age=sensor==='DELAYED'?2:12;p.observation=structuredClone(history[Math.max(0,history.length-1-age)]);}
    else if(sensor==='PARTIAL'&&p.observation.tiles){p.observation.tiles=p.observation.tiles.filter(t=>(t.x+t.y)%2===0);p.observation.enemies=p.observation.enemies.filter(e=>(e.x+e.y)%2===0);p.observation.objects=(p.observation.objects??[]).filter(e=>(e.x+e.y)%2===0);p.observation.civilians=(p.observation.civilians??[]).filter(e=>(e.x+e.y)%2===0);p.observation.hazards=[];p.observation.traps=[];p.observation.doors=p.observation.doors.filter(e=>(e.x+e.y)%2===0);}
    else if(sensor==='PARTIAL'&&p.observation.game==='cards')for(const h of p.observation.hands)if(h.player===p.observation.viewer)for(const k of h.knowledge)k.evidence=[];
    // Fresh public legal descriptors explicitly remain available to all comparators.
    p.observationAge=raw.receiptTick-p.observation.tick;p.sensor=sensor;p.binding={...p.binding,tick:p.observation.tick,observationHash:hash(p.observation)};validateInput(p);
    const s=histories.get(actor)??historyState();s.experience=experience;histories.set(actor,s);
    const writes=remember(p.observation,s,{disabled:memory==='DISABLED',episodeId});stats.memoryWrites+=writes.length;
    if(p.observation.missing){const a=p.actions.find(a=>a.type==='WAIT'||a.type==='DISCARD_CARD')??p.actions[0];stats.fallbacks++;stats.abstentions++;return{action:a,source:'BOUNDED_PLANNER_FALLBACK',fallbackReason:'MISSING_OBSERVATION_FAIL_CLOSED_PUBLIC_LEGAL_FALLBACK',state:s,packet:p,memory:{reads:[],writes}};}
    const state=states.get(actor)??controllerState(effective==='EXPLORATION'?'RANDOM_LEGAL':effective==='RULE'?'RULE_BASELINE':effective==='RULE_BASELINE'||effective==='REACTIVE_BASELINE'?effective:'BOUNDED_PLANNER',{memoryMode:memory==='DISABLED'?'NO_MEMORY':'EPISODE_MEMORY_ONLY',seed:918273});
    let fallback;try{fallback=decide(p,state);}catch(e){if(sensor==='NORMAL')throw e;stats.baselineInterfaceErrors++;stats.abstentions++;const action=p.actions.find(a=>a.type==='WAIT'||a.type==='DISCARD_CARD')??p.actions[0];stats.fallbacks++;return{action,source:'BOUNDED_PLANNER_FALLBACK',fallbackReason:'SENSOR_CONTRACT_UNSUPPORTED_BY_INHERITED_PLANNER:'+e.message,state:s,packet:p,memory:{reads:[],writes},baselineError:e.message};}
    states.set(actor,fallback.state);stats.plannerExpansions+=fallback.work.expansions;stats.plannerCandidates+=fallback.work.candidates;stats.plannerModelTicks+=fallback.work.modelTicks;
    let a=(p.observation.game==='factory'&&!['EXPLORATION','RULE'].includes(effective)?factoryRule(p):fallback.action)??fallback.action;
    const fallbackAction=a;let source=isPartner?'RULE_BASED_PARTNER':effective==='RULE'?'BOUNDED_PLANNER_FALLBACK':'BOUNDED_PLANNER_FALLBACK',reason='EXPLICIT_STRONG_OR_RULE_COMPARATOR',beliefs=null,reads=[];
    if(!isPartner&&effective==='CANDIDATE'&&model){
      stats.inferences++;
      if(model.id.startsWith('RESCUE_HOSTILE')){
        const queries=cells(p.observation,s);beliefs=queries.map(cell=>({...cell,probability:predict(model,occupancyFeatures(p.observation,s,cell)),target:'HOSTILE_CELL_OCCUPANCY_NOT_HAZARD_RISK'}));
        reads=Object.values(s.enemies).map(e=>({store:'EPISODIC_ENEMY',key:e.id,tick:e.tick,level:s.level,uncertainty:'HISTORICAL_NOT_CURRENT_TRUTH'}));stats.featureOperations+=queries.length*model.weights.length;
        if(a.type.startsWith('MOVE_')){const[dx,dy]=DIRECTIONS[a.type.slice(5)],dest={x:p.observation.actor.x+dx,y:p.observation.actor.y+dy},risk=beliefs.find(c=>c.x===dest.x&&c.y===dest.y)?.probability??0;
          if(risk>config.beliefAvoidThreshold){const alternative=p.actions.filter(a=>a.type.startsWith('MOVE_')).find(a=>{const[dx,dy]=DIRECTIONS[a.type.slice(5)],x=p.observation.actor.x+dx,y=p.observation.actor.y+dy;return s.tiles[key(x,y)]?.glyph==='.'&&(beliefs.find(c=>c.x===x&&c.y===y)?.probability??1)<risk;});if(alternative)a=alternative;}
        }
      }else if(model.id.startsWith('CARDS_PLAYABILITY')){
        beliefs=p.observation.hands[p.observation.viewer].cards.map(c=>({slot:c.slot,probability:predict(model,cardFeatures(p.observation,c.slot)),target:'OWN_SLOT_LEGAL_PLAYABILITY'}));stats.featureOperations+=beliefs.length*model.weights.length;
        const best=[...beliefs].sort((a,b)=>b.probability-a.probability)[0];if(best?.probability>=config.cardPlayThreshold)a=p.actions.find(a=>a.type==='PLAY_CARD'&&a.parameters.slot===best.slot)??a;
      }else{
        const allReads=[];const xs=p.actions.map(a=>{const x=actionFeatures(p,s,a);allReads.push(...(s.lastReads??[]));return x;}),choice=select(model,xs,config.margin);reads=[...new Map(allReads.map(r=>[JSON.stringify(r),r])).values()];stats.featureOperations+=xs.length*model.weights.length;
        if(!choice.abstain)a=p.actions[choice.index];else{stats.abstentions++;reason='TRAINED_HEAD_LOW_MARGIN_UNCALIBRATED_ABSTENTION';}
      }
      // Equal actions do not prove trained contribution: attribute to comparator.
      if(a.id!==fallbackAction.id){source='EXPERIMENTAL_TRAINED_POLICY_ACTION';stats.changes++;reason=null;}else stats.fallbacks++;
    }
    stats.memoryReads+=reads.length;
    return{action:a,source,fallbackReason:reason,beliefs,state:s,packet:p,memory:{reads,writes},fallbackAction,uncertaintySemantics:'EXPERIMENTAL_UNCALIBRATED; HISTORICAL_POSITIONS_ARE_NOT_CURRENT_TRUTH',work:fallback.work};
  }
  return{act,stats,histories};
}
