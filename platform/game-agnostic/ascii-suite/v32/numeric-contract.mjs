// Postflight repair contract. Original V1 sources/checkpoints remain immutable.
import {relationalFeatures} from './relational-features.mjs';
import {train} from '../training-dev-v1/train.mjs';
export const NUMERIC_CONTRACT='V32_FINITE_FEATURE_AND_CHECKPOINT_CONTRACT_V1';
export function invalidNumbers(values){return values.flat(Infinity).filter(v=>typeof v!=='number'||!Number.isFinite(v)).length;}
export function auditExamples(examples){let invalid=0;const columns={};for(const ex of examples)for(const row of ex.xs??[ex.x])row.forEach((v,i)=>{if(typeof v!=='number'||!Number.isFinite(v)){invalid++;columns[i]=(columns[i]??0)+1;}});return{valid:invalid===0,invalid,columns};}
export function auditCheckpoint(fit){const weights=fit.model?.weights??[],invalidWeights=invalidNumbers(weights),invalidLosses=(fit.losses??[]).filter(l=>typeof l.meanLoss!=='number'||!Number.isFinite(l.meanLoss)).length;return{valid:weights.length>0&&invalidWeights===0&&invalidLosses===0,invalidWeights,invalidLosses};}
export function trainFinite(id,examples,config,options){if(!auditExamples(examples).valid)throw Error('INVALID_TRAINING_FEATURES');const fit=train(id,examples,config,options);if(!auditCheckpoint(fit).valid)throw Error('INVALID_CHECKPOINT');return fit;}
export function guardedRelationalFeatures(p,state){
 const encoded=relationalFeatures(p,state);if(encoded.abstain)return encoded;
 // V1 +undefined was NaN for actions without a node id. Explicit Boolean is zero.
 const nodes=Object.fromEntries((p.observation.nodes??[]).map(n=>[n.id,n]));
 const rows=encoded.rows.map((r,i)=>{const features=[...r.features],q=p.actions[i].parameters;features[features.length-12+6]=Number(Boolean(nodes[q.id]?.enabled&&q.enabled===false));return{...r,features};});
 if(rows.some(r=>invalidNumbers(r.features)))return{abstain:true,reason:'NONFINITE_RELATIONAL_FEATURES',rows:[],codec:'EXPERIMENTAL_V32_PUBLIC_DEPENDENCY_ACTION_FEATURES_V2_GUARDED_UNTRAINED'};
 return{...encoded,rows,codec:'EXPERIMENTAL_V32_PUBLIC_DEPENDENCY_ACTION_FEATURES_V2_GUARDED_UNTRAINED'};
}
