import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,statSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writePopulation,readPopulation,manifest,exclusive,checkDisjoint} from './population.mjs';
test('validation labels require a bound run marker and remain locked after reads',()=>{const root=mkdtempSync(join(tmpdir(),'hdisc-synthetic-'));try{
 writePopulation(root,{population:'VALIDATION',allocationDigest:'synthetic',classes:[{id:'synthetic-v',family:'v',population:'VALIDATION',privateLabel:1}]});
 const {m,file}=manifest(root,'VALIDATION');assert.equal(statSync(file).mode&0o777,0);
 assert.throws(()=>readPopulation(root,'VALIDATION','DEVELOPMENT'),/LOCKED/);assert.throws(()=>readPopulation(root,'VALIDATION','RUN'),/LIFECYCLE/);
 exclusive(join(root,'validation-start.json'),{populationDigest:m.digest});assert.equal(readPopulation(root,'VALIDATION','RUN').length,1);assert.equal(statSync(file).mode&0o777,0);
 exclusive(join(root,'validation-result.json'),{});assert.throws(()=>readPopulation(root,'VALIDATION','RUN'),/LIFECYCLE/);assert.equal(readPopulation(root,'VALIDATION','CHECK').length,1);
 writePopulation(root,{population:'EXPLORATION',allocationDigest:'synthetic',classes:[{id:'synthetic-e',family:'v',population:'EXPLORATION'}]});assert.throws(()=>checkDisjoint(root),/SHARE/);
}finally{rmSync(root,{recursive:true,force:true});}});
