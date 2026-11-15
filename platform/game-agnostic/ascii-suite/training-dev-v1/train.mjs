// Offline-only trainer. Evaluator labels can enter here, never inference.
import {predict,distribution} from './model.mjs';
import {digest} from './io.mjs';
export function train(id,examples,config,{negative=false}={}){
  if(!examples.length)throw Error('NO_TRAINING_EXAMPLES:'+id);
  const dimension=examples[0].xs?.[0]?.length??examples[0].x.length;
  const model={schema:'EXPERIMENTAL_OFFLINE_LINEAR_MODEL_V1',id:negative?id+'_NEGATIVE_CONTROL':id,version:1,weights:Array(dimension).fill(0),canonical:false,trainingOnly:true,method:examples[0].xs?'SOFTMAX_TEACHER_IMITATION':'LOGISTIC_EVALUATOR_TARGET',negativeControl:negative};
  const initialHash=digest(model.weights),losses=[];
  for(let epoch=0;epoch<config.epochs;epoch++){
    const grad=Array(dimension).fill(0);let loss=0;
    for(let i=0;i<examples.length;i++){
      const ex=examples[i];
      if(ex.xs){const target=negative?(ex.y+1)%ex.xs.length:ex.y,ps=distribution(model,ex.xs);loss-=Math.log(Math.max(1e-12,ps[target]));for(let k=0;k<ps.length;k++)for(let j=0;j<dimension;j++)grad[j]+=(ps[k]-(k===target?1:0))*ex.xs[k][j];}
      else {const y=negative?examples[(i+17)%examples.length].y:ex.y,p=predict(model,ex.x);loss-=y*Math.log(Math.max(1e-12,p))+(1-y)*Math.log(Math.max(1e-12,1-p));for(let j=0;j<dimension;j++)grad[j]+=(p-y)*ex.x[j];}
    }
    for(let j=0;j<dimension;j++)model.weights[j]-=config.learningRate*(grad[j]/examples.length+config.l2*model.weights[j]);
    if(epoch===0||epoch===config.epochs-1||epoch%10===0)losses.push({epoch,meanLoss:loss/examples.length});
  }
  return {model,weightHash:digest(model.weights),initialHash,examples:examples.length,losses,updated:digest(model.weights)!==initialHash,teacherLimitations:'Supervised targets are not optimal actions or valid conditional regret. Hostile occupancy excludes hidden hazards. No canonical expert demonstrations.'};
}
