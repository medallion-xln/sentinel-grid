#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const R=path.resolve(__dirname,'../..');
const files=['public_html/azl/zeknova-prime-root-exploration-correction-contract-v1.js','docs/governance/prime-root-exploration-correction-registry.json','sgrid-lab/tests/stage1az3-prime-root-exploration-correction-contract.test.js'];
const h=crypto.createHash('sha256');for(const f of files){h.update(f+'\0');h.update(fs.readFileSync(path.join(R,f)));h.update('\0')};console.log('STAGE1AZ3_SENTINEL_DIGEST '+h.digest('hex'));
