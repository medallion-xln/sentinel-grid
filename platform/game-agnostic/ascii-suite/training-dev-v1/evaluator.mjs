// Privileged evaluator owner. No inference module may import this file.
import {occupancyFeatures,cells,cardFeatures,actionFeatures} from './features.mjs';
export function labels(w,p,s,teacher,transitionId){
  const record={schema:'EVALUATOR_OWNED_LABEL_V1',transitionId,teacherRecommendation:teacher.action.id,teacherIdentity:'OBSERVATION_ONLY_STRONG_PLANNER_NOT_CANONICAL_EXPERT',teacherLimitations:'No optimality or conditional-value guarantee',conditionalActionValues:null,conditionalRegret:null,optimalActionSet:null,counterfactualOutcomes:null,catastropheLabels:null,targets:[]};
  if(w.game==='rescue'||w.game==='roguelike')record.targets=cells(p.observation,s).map(cell=>({kind:'HOSTILE_OCCUPANCY',cell,x:occupancyFeatures(p.observation,s,cell),y:+w.enemies.some(e=>(e.health??1)>0&&e.x===cell.x&&e.y===cell.y)}));
  if(w.game==='cards')record.targets=w.hands[Number(p.binding.actor.slice(1))].filter((_,slot)=>p.observation.hands[p.observation.viewer].knowledge[slot]).map((c,slot)=>({kind:'CARD_PLAYABILITY',x:cardFeatures(p.observation,slot),y:+(c.rank===w.progress[c.category]+1)}));
  if(w.game==='factory'||w.game==='roguelike')record.ranking={xs:p.actions.map(a=>actionFeatures(p,s,a)),y:p.actions.findIndex(a=>a.id===teacher.action.id)};
  return record;
}
