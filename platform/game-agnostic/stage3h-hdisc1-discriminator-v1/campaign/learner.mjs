// Offline training only. No inference module imports this file.
import { prng, binColumns } from '../../stage3h-sk1-safety-kernel-v1/infra/gbdt.mjs';
import { FAMILIES, PARAMETER_SCHEMA, parametersHash, validateParameters, treeValue } from '../discriminator/pair-model.mjs';
export const GRID = Object.freeze([50,100,200].flatMap(trees => [2,3,4].flatMap(depth => [0.05,0.1].map(lr => Object.freeze({bags:10,trees,depth,lr,minLeaf:20,lambda:1,maxBins:32})))));
const sigmoid = x => x >= 0 ? 1/(1+Math.exp(-x)) : Math.exp(x)/(1+Math.exp(x));
const fail = s => { throw Error(s); };

// A diagonal Newton tree step. Pair loss derivatives are computed AFTER antisymmetrisation.
function treeStep(B, gradient, hessian, weight, cfg) {
 const t={f:[],t:[],l:[],r:[],v:[]};
 function grow(ids, depth) {
  const n=t.f.length; t.f.push(-1); t.t.push(0); t.l.push(-1); t.r.push(-1); t.v.push(0);
  let g=0,h=0,w=0; for(const i of ids){g+=gradient[i];h+=hessian[i];w+=weight[i];}
  t.v[n]=-cfg.lr*g/(h+cfg.lambda);
  if(depth>=cfg.depth || w<2*cfg.minLeaf) return n;
  let best=null; const parent=g*g/(h+cfg.lambda);
  for(let j=0;j<B.d;j++){
   const size=B.thr[j].length+1,G=new Float64Array(size),H=new Float64Array(size),W=new Float64Array(size);
   for(const i of ids){const b=B.bins[j][i];G[b]+=gradient[i];H[b]+=hessian[i];W[b]+=weight[i];}
   let gl=0,hl=0,wl=0;
   for(let b=0;b<size-1;b++){
    gl+=G[b];hl+=H[b];wl+=W[b]; if(wl<cfg.minLeaf || w-wl<cfg.minLeaf)continue;
    const gain=gl*gl/(hl+cfg.lambda)+(g-gl)*(g-gl)/(h-hl+cfg.lambda)-parent;
    if(gain>1e-9 && (!best || gain>best.gain))best={j,b,gain};
   }
  }
  if(best){const left=[],right=[];for(const i of ids)(B.bins[best.j][i]<=best.b?left:right).push(i);
   t.f[n]=best.j;t.t[n]=B.thr[best.j][best.b];t.l[n]=grow(left,depth+1);t.r[n]=grow(right,depth+1);}
  return n;
 }
 grow(weight.map((w,i)=>w>0?i:-1).filter(i=>i>=0),0);return t;
}

/** Groups are classes, each with an origin family and class-normalised action/pair examples.
 * Pair examples contain x and reverse; y = 1 if the first action is safer, 0 if worse, .5 if tied.
 * Both orders are evaluated, but every unordered pair contributes exactly once to the objective.
 */
export function fit({groups,layout,family,origin,config,label}) {
 const c=config;
 if(!groups?.length || !Object.values(FAMILIES).includes(family))fail('TRAINING_INPUT_INVALID');
 if(![c?.bags,c?.trees,c?.depth,c?.maxBins].every(x=>Number.isInteger(x)&&x>0) || c.maxBins>255 || !(c.lr>0&&c.lr<=1) || !(c.lambda>0) || !(c.minLeaf>0))fail('TRAINING_CONFIG_INVALID');
 const width=family===FAMILIES.PAIR?2*layout.descriptor.length+layout.relation.length+layout.context.length:layout.descriptor.length+layout.context.length;
 const rows=[],examples=[],families=[...new Set(groups.map(g=>g.family))].sort();
 for(const g of groups){
  if(typeof g.family!=='string'||!g.family||!g.examples?.length)fail('TRAINING_GROUP_INVALID');
  for(const e of g.examples){
   const valid=x=>Array.isArray(x)&&x.length===width&&x.every(Number.isFinite);
   if(!valid(e.x)||![0,.5,1].includes(e.y)||(family===FAMILIES.PAIR&&!valid(e.reverse)))fail('TRAINING_EXAMPLE_INVALID');
   const i=rows.length;rows.push(e.x);if(family===FAMILIES.PAIR)rows.push(e.reverse);
   examples.push({i,y:e.y,family:g.family,w:1/g.examples.length});
  }
 }
 const B=binColumns(rows,c.maxBins),bags=[];
 for(let bag=0;bag<c.bags;bag++){
  const random=prng(`${label}|bag:${bag}`),counts=new Map();
  for(let k=0;k<families.length;k++){const f=families[Math.floor(random()*families.length)];counts.set(f,(counts.get(f)||0)+1);}
  const score=new Float64Array(rows.length),trees=[];
  for(let step=0;step<c.trees;step++){
   const gradient=new Float64Array(rows.length),hessian=new Float64Array(rows.length),weight=Array(rows.length).fill(0);
   for(const e of examples){
    const w=e.w*(counts.get(e.family)||0),pair=family===FAMILIES.PAIR,z=pair?(score[e.i]-score[e.i+1])/2:score[e.i],p=sigmoid(z),g=w*(p-e.y),h=w*Math.max(1e-6,p*(1-p));
    gradient[e.i]=pair?g/2:g;hessian[e.i]=pair?h/4:h;weight[e.i]=pair?w/2:w;
    if(pair){gradient[e.i+1]=-g/2;hessian[e.i+1]=h/4;weight[e.i+1]=w/2;}
   }
   const t=treeStep(B,gradient,hessian,weight,c);trees.push(t);rows.forEach((x,i)=>{score[i]+=treeValue(t,x);});
  }
  bags.push({trees});
 }
 const parameters={schema:PARAMETER_SCHEMA,family,origin,layout:structuredClone(layout),bags};parameters.parametersHash=parametersHash(parameters);validateParameters(parameters);return parameters;
}

export function familyFolds(families,hash,n=5){
 const unique=[...new Set(families)].sort((a,b)=>hash(a).localeCompare(hash(b))||a.localeCompare(b));
 if(unique.length<n)fail('INSUFFICIENT_ORIGIN_FAMILIES_FOR_CV');return new Map(unique.map((f,i)=>[f,i%n]));
}
export function selectSharedConfiguration(results){
 if(!results.length || results.some(r=>!Number.isInteger(r.unsafeSum)||r.unsafeSum<0))fail('CV_RESULTS_INVALID');
 return [...results].sort((a,b)=>a.unsafeSum-b.unsafeSum || a.config.trees*a.config.depth-b.config.trees*b.config.depth || a.config.lr-b.config.lr || a.config.trees-b.config.trees || a.config.depth-b.config.depth)[0];
}
