#!/usr/bin/env node
/* STAGE_3G_FREEZE_V1 certifier. (default) writes the freeze certificate once; --check reproduces it read-only.
 * Certifies: the committed freeze rebuilds byte for byte from CANONICAL_PARENT_COMMIT; the freeze commit is a direct
 * first-parent child of that parent; no frozen Stage 3F/3G path changed since; all nine certificates were reproduced;
 * every required binding holds. No experiment is run.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256} from '../src/core/determinism.js';
import {exp} from '../src/core/canonical-numerics-v1.js';
import {enforceCheckModeReadOnly} from '../scripts/certification/check-mode-guard.mjs';
import {buildFreeze} from './freeze.mjs';
import * as P from './plan.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),top=path.resolve(root,'../..'),GA='platform/game-agnostic/';process.chdir(root);
const check=process.argv.includes('--check');enforceCheckModeReadOnly({checkOnly:check});if(Math.exp!==exp)throw Error('CANONICAL_RUNTIME_REQUIRED');
const hex=b=>createHash('sha256').update(b).digest('hex'),git=(...a)=>{const r=spawnSync('git',['-C',top,...a],{encoding:'utf8',maxBuffer:1<<28});return {ok:r.status===0,out:r.stdout.trim()};};
const parent=P.CANONICAL_PARENT_COMMIT,freezeFile=GA+P.FREEZE_PATH;
const committed=readFileSync(P.FREEZE_PATH,'utf8'),doc=buildFreeze(),rebuilt=JSON.stringify(doc,null,2)+'\n';
const freezeCommit=git('log','--diff-filter=A','--format=%H','--',freezeFile).out.split('\n').at(-1),freezeCommitParent=git('rev-parse',`${freezeCommit}^`).out,firstParent=new Set(git('rev-list','--first-parent','HEAD').out.split('\n'));
const protectedChanged=git('diff','--name-only',parent,'HEAD','--',...P.PROTECTED_PATHS).out.split('\n').filter(Boolean),protectedDirty=git('status','--porcelain','--untracked-files=no','--',...P.PROTECTED_PATHS).out.split('\n').filter(Boolean);
const freezeAtHead=git('show',`HEAD:${freezeFile}`),reproAtHead=git('show',`HEAD:${GA+P.INHERITANCE_PATH}`);
// Amendment 001: run-canonical already sets --test-reporter=tap in NODE_OPTIONS; a second reporter flag aborts node --test.
const env={...process.env};delete env.NODE_TEST_CONTEXT;const reporter=/--test-reporter/.test(env.NODE_OPTIONS??'')?[]:['--test-reporter=tap'];const t=spawnSync(process.execPath,['--test',...reporter,'tests/stage3g-freeze.test.js'],{cwd:root,env,encoding:'utf8'}),n=k=>Number(new RegExp(`^# ${k} (\\d+)$`,'m').exec(t.stdout)?.[1]??-1);
const tests={exitCode:t.status,pass:n('pass'),fail:n('fail')};
const verification={FREEZE_REBUILT_BYTE_IDENTICAL:committed===rebuilt,FREEZE_COMMITTED_AT_HEAD:freezeAtHead.ok&&freezeAtHead.out+'\n'===committed,REPRODUCTION_RECORD_COMMITTED:reproAtHead.ok&&hex(reproAtHead.out+'\n')===doc.sections.reproduction.RAW_FILE_SHA256,
 FREEZE_COMMIT_IS_DIRECT_CHILD_OF_PARENT:freezeCommitParent===parent,PARENT_ON_CANONICAL_FIRST_PARENT_LINEAGE:firstParent.has(parent)&&firstParent.has(freezeCommit),NO_FROZEN_PATH_CHANGED_SINCE_PARENT:protectedChanged.length===0&&protectedDirty.length===0,protectedChanged,TESTS_PASS:tests.exitCode===0&&tests.fail===0&&tests.pass>0,tests};
const S=doc.sections,cond=S.closure.conditions;
const required={CANONICAL_STAGE3G_LINEAGE_VALID:S.lineage.CANONICAL_STAGE3G_LINEAGE_VALID&&verification.PARENT_ON_CANONICAL_FIRST_PARENT_LINEAGE&&verification.FREEZE_COMMIT_IS_DIRECT_CHILD_OF_PARENT&&verification.NO_FROZEN_PATH_CHANGED_SINCE_PARENT,
 ALL_STAGE3G_CERTIFICATES_REPRODUCED:S.reproduction.ALL_STAGE3G_CERTIFICATES_REPRODUCED&&verification.REPRODUCTION_RECORD_COMMITTED,C1_C8_BOUND:P.CLOSURE.conditions.every(k=>cond[k]===true)&&S.closure.qualification===P.QUALIFICATION,
 OBSERVATION_BOUNDARY_BOUND:doc.bound.OBSERVATION_BOUNDARY_HASH===sha256(S.observationBoundary)&&S.observationBoundary.promotedUnknownFields.length===0,PREDICTION_LIFECYCLE_BOUND:doc.bound.PREDICTION_LIFECYCLE_HASH===S.predictionLifecycle.schemaHash,ACTION_SEMANTICS_BOUND:Object.keys(S.actionSemantics.schemas).length===5,
 DECISION_EVALUATION_CONTRACT_INHERITED:S.decisionEvaluationContract.modifiedByStage3G===false&&['FPE','CAD','CR','DDV','TCA'].every(k=>S.decisionEvaluationContract.metrics[k]),LIMITATIONS_BOUND:doc.bound.LIMITATIONS_HASH===sha256(S.limitations),STAGE3H_ENTRY_REQUIREMENTS_BOUND:doc.bound.STAGE3H_ENTRY_REQUIREMENTS_HASH===sha256(P.STAGE3H_ENTRY)&&S.stage3hEntryRequirements.status==='NOT_BEGUN',
 AUTHORITY_BOUND:S.authorityState.AUTHORITY==='R0'&&!S.authorityState.CAN_DISPATCH&&!S.authorityState.CAN_MUTATE_LIVE_WORLD&&!S.authorityState.ONLINE_LEARNING_ENABLED&&!S.authorityState.PROMOTED_TO_LIVE_RUNTIME,ARCHITECTURE_ROSTER_BOUND:S.architectureRoster.EXPERT_COUNT===9&&S.architectureRoster.EXPERT_10_ADDED===false,
 CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE:S.reproduction.CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE,FREEZE_REBUILT_BYTE_IDENTICAL:verification.FREEZE_REBUILT_BYTE_IDENTICAL&&verification.FREEZE_COMMITTED_AT_HEAD,TESTS_PASS:verification.TESTS_PASS};
const pass=Object.values(required).every(v=>v===true);
const body={stage:'STAGE3G_FREEZE',STAGE3G_FREEZE_VERSION:P.FREEZE_VERSION,status:pass?'PASS':'FAIL',freezeFile:P.FREEZE_PATH,STAGE3G_FREEZE_HASH:doc.freezeHash,FREEZE_RAW_FILE_SHA256:hex(committed),freezeCommit,canonicalParentCommit:parent,bound:doc.bound,required,verification,
 result:pass?{...P.ON_PASS}:{STAGE3G_STATUS:'COMPLETE_NOT_FROZEN',READY_FOR_STAGE3H:false},authority:{tier:'R0',canDispatch:false,canMutateLiveWorld:false,onlineLearningEnabled:false,promotedToLiveRuntime:false},newScientificEvidence:false,stage3hStarted:false};
const cert={...body,certificationHash:sha256(body)};
if(check){const stored=JSON.parse(readFileSync(P.RESULT_PATH,'utf8')),ok=JSON.stringify(stored)===JSON.stringify(cert);console.log(JSON.stringify({check:'STAGE3G_FREEZE_CERTIFICATION',CERTIFICATION_REPRODUCED:ok,status:cert.status,storedHash:stored.certificationHash,recomputedHash:cert.certificationHash,freezeHash:cert.STAGE3G_FREEZE_HASH},null,2));if(!ok||!pass)process.exitCode=1;}
else{if(existsSync(P.RESULT_PATH))throw Error('FREEZE_CERTIFICATE_EXISTS: use --check');writeFileSync(P.RESULT_PATH,JSON.stringify(cert,null,2)+'\n');console.log(JSON.stringify({status:cert.status,certificationHash:cert.certificationHash,freezeHash:cert.STAGE3G_FREEZE_HASH,required},null,2));if(!pass)process.exitCode=1;}
