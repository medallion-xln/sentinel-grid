#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LAB=path.resolve(__dirname,'..'),ROOT=path.resolve(LAB,'..'),FROZEN=path.join(LAB,'results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN,'w0p2-forest-defensive-command-contract.frozen.test.js');
function fingerprint(){const files=[];(function walk(d){for(const n of fs.readdirSync(d).sort()){const p=path.join(d,n);fs.statSync(p).isDirectory()?walk(p):files.push(p)}})(FROZEN);const h=crypto.createHash('sha256');for(const p of files){h.update(path.relative(FROZEN,p));h.update(fs.readFileSync(p))}return{count:files.length,digest:h.digest('hex')}}
const before=fingerprint(),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/w0p2-forest-defensive-command-manifest.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/forest-defensive-command-registry-v2.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
test('W0-P.2 manifest phase',()=>assert.equal(manifest.phase,'W0-P.2'));
test('W0-P.2 manifest frozen',()=>assert.equal(manifest.status,'frozen'));
test('W0-P.2 Sentinel Linux/Darwin digests match',()=>assert.equal(manifest.verification.sentinel_linux_portability_digest,manifest.verification.sentinel_darwin_portability_digest));
test('W0-P.2 ZekNova Linux/Darwin digests match',()=>assert.equal(manifest.verification.zeknova_linux_portability_digest,manifest.verification.zeknova_darwin_portability_digest));
test('W0-P.2 Sentinel digest exact',()=>assert.equal(manifest.verification.sentinel_linux_portability_digest,'ec577db285975bab76a3349aeb90b986000a9e1a2012550053359ff79378769d'));
test('W0-P.2 ZekNova digest exact',()=>assert.equal(manifest.verification.zeknova_linux_portability_digest,'6beace24991fe086ef7a543249e51185e8dd787dc1f40c4923a01bb33db70ab1'));
test('registry has thirteen bindings',()=>assert.equal(registry.bindings.length,13));
test('registry bindings exact lifecycle',()=>assert.equal(registry.bindings.every(x=>x.parityStatus==='exact-command-lifecycle'),true));
test('registry denies Prime authority',()=>assert.equal(registry.sentinel_prime_authority,false));
test('registry denies Router authority',()=>assert.equal(registry.router_authority,false));
const after=fingerprint();test('frozen file count unchanged',()=>assert.equal(after.count,before.count));test('frozen digest unchanged',()=>assert.equal(after.digest,before.digest));
console.log(`W0-P.2 FOREST DEFENSIVE COMMAND FROZEN CERTIFICATION PASS (${checks}/${checks})`);
