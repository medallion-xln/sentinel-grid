#!/usr/bin/env node
// STAGE_3G_9 Phase 10: write the PROPOSED Stage 3G closure bindings. Prepares; does not create a Stage 3G freeze.
import {readFileSync,writeFileSync} from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {sha256} from '../src/core/determinism.js';import {OUT,RESULT_PATH} from './plan.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),c=JSON.parse(readFileSync(path.join(root,RESULT_PATH),'utf8'));
if(!c.science.CLOSURE.STAGE3G_SCIENTIFICALLY_COMPLETE||!c.closureCandidate)throw Error('C2_NOT_PASSED_NO_CANDIDATE');
const body={stage:'STAGE3G',status:'PROPOSED_NOT_FROZEN',note:'Closure bindings proposed by Stage 3G.9. Creating a formal Stage 3G freeze is a separate, explicitly authorized step (as Stage 3F had its own freeze stage).',
 certificates:{...c.closureCandidate.certificates,stage3g9:c.certificationHash},observationBoundary:c.closureCandidate.observationBoundary,predictionLifecycle:c.closureCandidate.predictionLifecycle,actionSemantics:c.closureCandidate.actionSemantics,
 closureFacts:{...c.closureCandidate.closureFacts,STAGE3G_SCIENTIFICALLY_COMPLETE:true,READY_FOR_STAGE3H:true,READY_FOR_3G_COUNTERFACTUAL_PREDICTION:false,WORLD_MODEL_WORK_NOW_JUSTIFIED:false,STRUCTURAL_OOD:'NOT_TESTED'},authority:c.closureCandidate.authority};
const doc={...body,candidateHash:sha256(body)};writeFileSync(path.join(root,OUT,'stage3g-closure-candidate.json'),JSON.stringify(doc,null,2)+'\n');console.log(JSON.stringify({candidateHash:doc.candidateHash,certificates:doc.certificates},null,2));
