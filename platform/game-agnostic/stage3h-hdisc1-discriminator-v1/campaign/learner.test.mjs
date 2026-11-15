import test from 'node:test';
import assert from 'node:assert/strict';
import {fit,GRID,familyFolds,selectSharedConfiguration} from './learner.mjs';
import {FAMILIES,ORIGINS,comparePair} from '../discriminator/pair-model.mjs';
const layout={descriptor:['risk'],relation:[],context:[]};
const config={bags:2,trees:12,depth:2,lr:.1,minLeaf:.1,lambda:.1,maxBins:8};
test('pair training optimises antisymmetric loss and reproduces exactly on synthetic examples',()=>{
 const groups=Array.from({length:10},(_,i)=>({family:'synthetic'+i,examples:[{x:[0,1],reverse:[1,0],y:1}]}));
 const args={groups,layout,family:FAMILIES.PAIR,origin:ORIGINS.SYNTHETIC,config,label:'SYNTHETIC_LOSS_CHECK'};
 const a=fit(args),b=fit(args);assert.deepEqual(a,b);
 const ab=comparePair(a,[0],[1],[],[],[]),ba=comparePair(a,[1],[0],[],[],[]);
 assert.ok(ab.probability>.8);assert.ok(Math.abs(ab.probability+ba.probability-1)<1e-12);
});
test('pointwise training learns risk while class contribution is invariant to repeated examples',()=>{
 const groups=Array.from({length:10},(_,i)=>({family:'synthetic'+i,examples:[{x:[0],y:0},{x:[1],y:1}]}));
 const args={groups,layout,family:FAMILIES.ADDITIVE,origin:ORIGINS.SYNTHETIC,config,label:'SYNTHETIC_CLASS_WEIGHT'};
 const a=fit(args);const duplicated=groups.map(g=>({...g,examples:[...g.examples,...g.examples]}));
 const b=fit({...args,groups:duplicated});
 assert.ok(comparePair(a,[0],[1],[],[],[]).probability>.8);
 assert.ok(Math.abs(comparePair(a,[0],[1],[],[],[]).probability-comparePair(b,[0],[1],[],[],[]).probability)<1e-12);
});
test('shared configuration uses the joint objective and specified tie order',()=>{
 assert.equal(GRID.length,18);const results=[{config:{trees:100,depth:2,lr:.1},unsafeSum:2},{config:{trees:50,depth:3,lr:.1},unsafeSum:2},{config:{trees:50,depth:3,lr:.05},unsafeSum:2}];
 assert.equal(selectSharedConfiguration(results),results[2]);
 assert.throws(()=>familyFolds(['one'],x=>x),/INSUFFICIENT/);
 const folds=familyFolds(['f','a','e','b','d','c','a'],x=>x);assert.equal(folds.size,6);assert.equal(folds.get('a'),0);
});
