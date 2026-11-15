// Evaluator-side boundary: outcomes never enter the encoder or inference request.
import { evalClass } from '../../stage3h-hw1-dev-v1/hw1-eval.mjs';
import { forgeRequest } from '../discriminator/forge-base/features.mjs';
import { project } from '../discriminator/encoder.mjs';
import { FAMILIES } from '../discriminator/pair-model.mjs';
export function encodeClass(cls,encoder,arm){
 const request=forgeRequest(cls.projection,cls.evidence),encoding=encoder(request.state,request.legalActions,request.advisoryEvidence);
 const layout=encoder.featureSets[arm],p=project(encoding,layout),selectable=request.legalActions.map((_,i)=>i).filter(i=>!encoding.excluded[i]);
 if(!selectable.length || selectable.some(i=>!encoding.supported[i]))throw Error('CLASS_HAS_UNSUPPORTED_OR_EMPTY_SELECTABLE_MENU');
 return {request,encoding,layout,p,selectable};
}
export function classExamples(cls,encoder,arm){
 if(cls.population!=='EXPLORATION')throw Error('TRAINING_REQUIRES_EXPLORATION');
 const {p,selectable,layout}=encodeClass(cls,encoder,arm),pair=arm==='M3a'||arm==='M3';
 const labels=cls.projection.menu.map((_,i)=>{const r=evalClass(cls,[i]);if(r.illegal)throw Error('INVALID_TRAINING_LABEL');return Number(arm==='M0'?r.catAny:r.introB||r.introN);});
 const examples=[];
 if(pair){for(let a=0;a<selectable.length;a++)for(let b=a+1;b<selectable.length;b++){
  const i=selectable[a],j=selectable[b],ab=p.relation(i,j),ba=p.relation(j,i);if(!ab||!ba)throw Error('PAIR_INPUT_UNSUPPORTED');
  examples.push({x:[...p.descriptor(i),...p.descriptor(j),...ab,...p.context],reverse:[...p.descriptor(j),...p.descriptor(i),...ba,...p.context],y:labels[i]<labels[j]?1:labels[i]>labels[j]?0:.5});
 }}else for(const i of selectable)examples.push({x:[...p.descriptor(i),...p.context],y:labels[i]});
 // Singleton menus carry no pair training information; they still remain in all decision/evaluation denominators.
 return {family:cls.family,examples,layout,familyId:pair?FAMILIES.PAIR:FAMILIES.ADDITIVE};
}
