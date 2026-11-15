import test from 'node:test';import assert from 'node:assert/strict';
import {createCandidateKernel} from '../api/candidate-kernel.mjs';
import {createDiscriminator,MODES} from '../discriminator/index.mjs';
import {makeSyntheticEncoder} from '../discriminator/encoder.mjs';
import {fit} from './learner.mjs';import {FAMILIES,ORIGINS} from '../discriminator/pair-model.mjs';
test('candidate integration preserves a trained synthetic top set and denies execution',()=>{
 const encoder=makeSyntheticEncoder({id:'SYNTHETIC_KERNEL',descriptor:['risk']}),layout={descriptor:['risk'],relation:[],context:[]};
 const groups=Array.from({length:5},(_,i)=>({family:'synthetic'+i,examples:[{x:[0],y:0},{x:[1],y:1}]}));
 const parameters=fit({groups,layout,family:FAMILIES.ADDITIVE,origin:ORIGINS.SYNTHETIC,label:'SYNTHETIC_KERNEL',config:{bags:1,trees:5,depth:2,lr:.1,minLeaf:.1,lambda:.1,maxBins:8}});
 const d=createDiscriminator({encoder,parameters,mode:MODES.SYNTHETIC}),k=createCandidateKernel(d),state={observationContract:{id:'SYNTHETIC_KERNEL',version:'1'}},actions=[{key:'a',type:'MOVE',descriptor:{risk:0}},{key:'b',type:'WAIT',descriptor:{risk:1}}];
 const r=k.recommend(state,actions);assert.equal(r.recommendedActionOrAbstention.kind,'RECOMMEND');assert.deepEqual(r.recommendedActionOrAbstention.decisionSet,[{index:0}]);assert.equal(r.authority.canDispatch,false);assert.throws(()=>k.execute(),/EXECUTION/);
 const untrained=createCandidateKernel(createDiscriminator({encoder,mode:MODES.SYNTHETIC}));assert.equal(untrained.recommend(state,actions).recommendedActionOrAbstention.kind,'ABSTAIN');
});

test('cached additive comparisons match uncached inference exactly',async()=>{
 const {additiveMenuScores,summariseLogits,comparePair}=await import('../discriminator/pair-model.mjs');
 const groups=Array.from({length:8},(_,i)=>({family:'synthetic'+i,examples:[{x:[0],y:0},{x:[1],y:1}]}));
 const p=fit({groups,layout:{descriptor:['risk'],relation:[],context:[]},family:FAMILIES.ADDITIVE,origin:ORIGINS.SYNTHETIC,label:'SYNTHETIC_CACHE',config:{bags:3,trees:5,depth:2,lr:.1,minLeaf:.1,lambda:.1,maxBins:8}});
 const phi=[[0],[.3],[.7],[1]],scores=additiveMenuScores(p,phi,[]);
 for(let i=0;i<phi.length;i++)for(let j=0;j<phi.length;j++)assert.deepEqual(summariseLogits(scores[i].map((s,b)=>scores[j][b]-s)),comparePair(p,phi[i],phi[j],[],[],[]));
 assert.equal(additiveMenuScores(p,[[NaN]],[])[0],null);
});
