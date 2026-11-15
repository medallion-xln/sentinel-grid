import test from 'node:test';import assert from 'node:assert/strict';
import {requireEvidence,finalize} from './campaign-entry-gate.mjs';
import {CONDITIONS} from '../../stage3h-hdisc0-design-v1/readiness/campaign-entry-gate.mjs';
import {validateIssuance,RECIPIENT_PLACEHOLDER,composeIssuance} from './evidence-bundle-manifest.mjs';
import {composeManifest} from '../../stage3h-hdisc0-design-v1/readiness/bundle/evidence-bundle.mjs';
const fixture=()=>({conditions:Object.fromEntries(CONDITIONS.map(k=>[k,{status:'PASS',reasons:[],evidence:{}}]))});
test('additional evidence can fail a gate but cannot overwrite an inherited failure',()=>{const g=fixture();requireEvidence(g,CONDITIONS[2],false,'NO_ISSUANCE',{});assert.equal(finalize(g).passed,6);requireEvidence(g,CONDITIONS[2],true,'NO_ISSUANCE',{});assert.equal(finalize(g).decision,'NO_GO');});
test('a draft manifest is never an issued evidence bundle',()=>{
 const m=composeManifest({entries:[],baseCommit:'a'.repeat(40),runtime:{node:process.version,platform:'darwin-arm64'},linkTargets:[],recipients:[RECIPIENT_PLACEHOLDER]});
 const rec=composeIssuance({manifest:m,ownerName:'SYNTHETIC OWNER',issuedAt:'2026-01-01T00:00:00Z',encryption:'ENCRYPTED_VOLUME',containerLabel:'SYNTHETIC',recipients:['SYNTHETIC'],verifyOutputText:'EVIDENCE_BUNDLE_VERIFIED'});
 assert.equal(validateIssuance(rec,m).ok,false);assert.equal(validateIssuance(null,m).ok,false);
});
