#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const LAB=path.resolve(__dirname,'..'),ROOT=path.resolve(LAB,'..'),FROZEN=path.join(LAB,'results-v2.1/scenario-certification');
require('./_preflight').requireFrozen(FROZEN,'w0p3-live-parity-closure-contract.frozen.test.js');
function fingerprint(){const files=[];(function walk(d){for(const n of fs.readdirSync(d).sort()){const p=path.join(d,n);fs.statSync(p).isDirectory()?walk(p):files.push(p)}})(FROZEN);const h=crypto.createHash('sha256');for(const p of files){h.update(path.relative(FROZEN,p));h.update(fs.readFileSync(p))}return{count:files.length,digest:h.digest('hex')}}
const before=fingerprint(),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/w0p3-live-parity-closure-manifest.json'),'utf8')),registry=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/governance/live-parity-closure-registry.json'),'utf8'));
let checks=0;function test(n,fn){fn();checks++;console.log('  PASS '+n)}
test('W0-P.3 manifest phase',()=>assert.equal(manifest.phase,'W0-P.3'));
test('W0-P.3 manifest frozen',()=>assert.equal(manifest.status,'frozen'));
test('W0-P.3 Sentinel Linux/Darwin digests match',()=>assert.equal(manifest.verification.sentinel_linux_portability_digest,manifest.verification.sentinel_darwin_portability_digest));
test('W0-P.3 ZekNova Linux/Darwin digests match',()=>assert.equal(manifest.verification.zeknova_linux_portability_digest,manifest.verification.zeknova_darwin_portability_digest));
test('W0-P.3 Sentinel digest exact',()=>assert.equal(manifest.verification.sentinel_linux_portability_digest,'4451983b1fd49b10a3849c1fec14ea4a4686684158aee9d4985dc79f08645da5'));
test('W0-P.3 ZekNova digest exact',()=>assert.equal(manifest.verification.zeknova_linux_portability_digest,'430e1693d437e481db44576a8a9944656c5d796d8355abafbef7c8411e965dd1'));
test('registry has thirteen exact bindings',()=>assert.equal(registry.exact_binding_count,13));
test('registry has zero partial bindings',()=>assert.equal(registry.partial_binding_count,0));
test('registry has zero unbound actions',()=>assert.equal(registry.unbound_count,0));
test('registry denies Sentinel authority',()=>assert.equal(registry.sentinel_prime_authority,false));
test('registry preserves historical W0-P',()=>assert.equal(registry.historical_w0p_disposition,'preserved-as-historical-pre-command-runtime-measurement'));
const after=fingerprint();test('frozen file count unchanged',()=>assert.equal(after.count,before.count));test('frozen digest unchanged',()=>assert.equal(after.digest,before.digest));
console.log(`W0-P.3 LIVE PARITY CLOSURE FROZEN CERTIFICATION PASS (${checks}/${checks})`);
