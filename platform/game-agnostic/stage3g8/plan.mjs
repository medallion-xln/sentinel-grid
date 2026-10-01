// STAGE_3G_8 preregistration. Frozen before any Stage 3G.8 sealed row exists.
import {deepFreeze,sha256} from '../src/core/determinism.js';
import {PLAN as G7,SEED_PLAN as G7_SEEDS} from '../scripts/stage3g7/plan.mjs';
import {OBJECTIVE_PROGRESS_SCHEMA_HASH,OBJECTIVE_PROGRESS_COLUMNS} from './objective-progress-v1.mjs';
import {TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,TYPED_RELATION_COLUMNS} from './typed-relation-disclosure-v1.mjs';
import {CURRENT_OBSERVATION_BOUNDARY_V2_HASH} from './observation-boundary-v2.mjs';
import {INHERITED,OUT,INHERITANCE_PATH} from './inherited.mjs';
export {INHERITED,OUT,INHERITANCE_PATH};
export const BUILD='build/stage3g8';
export const SEALED_PATH=BUILD+'/sealed-partitions.jsonl.gz',SEALED_MANIFEST_PATH=OUT+'/sealed-partitions-manifest.json',PLAN_PATH=OUT+'/stage3g8-analysis-plan.json',OPEN_REPORT_PATH=OUT+'/stage3g8-open-phase-report.json',RESULT_PATH=OUT+'/stage3g8-certification-result.json',SUITE_PATH=OUT+'/stage3g8-full-suite.json';
export const LEVELS=[0,1,2,3,4,5,6,7],HORIZON_BANDS=['H0','H1','H2','H3','H4'],COHORT_BANDS=['H2','H3','H4'];
const panel=s=>[0,1,2,3,4,5,6,7].map(k=>s+10000*k);
export const SEED_PLAN=deepFreeze({
 fit:{source:'Stage 3G.7 OPEN fit set (seed 8013, 320 rows), hash-verified by its committed manifest; reused unchanged so BASELINE_G7 is the certified Stage 3G.7 head. No Stage 3G.8 OPEN rows are generated.',seed:G7_SEEDS.fit},
 families:{A:panel(9061),B:panel(9071)},cohorts:{BYPASS_A:panel(9081),BYPASS_B:panel(9091)},
 quotas:{sealedPerFamilyLevelBand:96,objectivePerFamilyLevelBand:12,cohortPerLevelBand:9},
 reservedUntouched:[5023,5033],priorSeedSpaces:[...G7_SEEDS.priorSeedSpaces,G7_SEEDS.fit,...G7_SEEDS.familySeedPanels.A,...G7_SEEDS.familySeedPanels.B],
 admission:'Unmodified corpusRecord. Families A/B: equal level x horizon-band x objective quotas over fixed eight-seed panels in canonical combination order (Stage 3G.7 traversal), unit weights, no action or outcome oversampling; quota is checked before a record is built. Cohorts BYPASS_A/B: horizon bands H2-H4 only, admitted iff the offered menu contains BYPASS (screened on the rebuilt t0 world before labels), level x band quota 9, canonical order, shortfalls recorded; conditional descriptive cohorts with population weight 0. Record/world/topology hashes disjoint from all prior lineage and across partitions.',
 precision:'Population quota is 96 per family x level x band (Stage 3G.7 used 24) so that the registered noninferiority endpoints can resolve; methodology, margins and resampling are otherwise unchanged.'});
export const SEED_PLAN_HASH=sha256(SEED_PLAN);
const cols=(...x)=>x.reduce((a,b)=>a+b,0);
export const HEADS=deepFreeze({
 BASELINE_G7:{columns:'G7 QUALIFIED_512 (54)',n:54,fit:'FROZEN: Stage 3G.7 OPEN QUALIFIED_512 weights; refit on reused OPEN evidence must reproduce its model hash'},
 OBJECTIVE_PROGRESS_ONLY:{columns:'G7 54 + OBJECTIVE_PROGRESS 6',n:cols(54,OBJECTIVE_PROGRESS_COLUMNS.length),fit:'OPEN horizon>2'},
 TYPED_RELATION_ONLY:{columns:'G7 54 with typed continuation pruning + TYPED_RELATION 27',n:cols(54,TYPED_RELATION_COLUMNS.length),fit:'OPEN horizon>2'},
 OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION:{columns:'typed G7 54 + 6 + 27',n:cols(54,6,TYPED_RELATION_COLUMNS.length),fit:'OPEN horizon>2'},
 TYPED_SEARCH_ONLY:{columns:'G7 54 with typed continuation pruning only',n:54,fit:'OPEN horizon>2',role:'descriptive decomposition of TYPED_RELATION_ONLY'},
 RUNTIME_PLUS_CURRENT_PRIVATE:{columns:'OBJECTIVE_PROGRESS_ONLY + 6 hidden current target facts',n:cols(54,6,6),fit:'OPEN horizon>2',role:'AUDIT_ONLY diagnostic: individual health, available, planned, acceptsMaterial, protected, value/quantity of the root target'},
 DISCLOSURE_PLUS_CURRENT_PRIVATE:{columns:'OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION + 6 hidden current target facts',n:cols(54,6,27,6),fit:'OPEN horizon>2',role:'AUDIT_ONLY diagnostic'},
 BASELINE_LEVEL_FIT:{columns:'G7 54',n:54,fit:'OPEN horizon>2 and level<=3',role:'OOD probe'},
 OBJECTIVE_PROGRESS_LEVEL_FIT:{columns:'G7 54 + 6',n:60,fit:'OPEN horizon>2 and level<=3',role:'OOD probe'}});
export const STRATA=deepFreeze({population:['ALL','LOW','MID','HIGH','RETREAT','HORIZON_DEPENDENT','TARGET_BEARING','BYPASS'],cohort:['ALL'],
 definitions:{ALL:'horizon>2',LOW:'level 0-2',MID:'level 3-5',HIGH:'level 6-7',RETREAT:'a RETREAT root is in the optimal set (Stage 3G.7 definition)',HORIZON_DEPENDENT:'label.horizonClass = HORIZON_DEPENDENT',TARGET_BEARING:'offered menu contains a targeted root other than PROTECT (observable, pre-decision)',BYPASS:'offered menu contains BYPASS',OOD:'sealed rows with level>=4 and horizon>2 for heads fit on OPEN level<=3'}});
export const COMPARISONS=deepFreeze({
 C1_OBJECTIVE_PROGRESS:['OBJECTIVE_PROGRESS_ONLY','BASELINE_G7'],C2_TYPED_RELATION:['TYPED_RELATION_ONLY','BASELINE_G7'],C3_BOTH:['OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION','BASELINE_G7'],
 C4_DISCLOSURE_INCREMENT:['OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION','OBJECTIVE_PROGRESS_ONLY'],C5_TYPED_SEARCH:['TYPED_SEARCH_ONLY','BASELINE_G7'],
 C6_RUNTIME_PRIVATE_GAP:['RUNTIME_PLUS_CURRENT_PRIVATE','OBJECTIVE_PROGRESS_ONLY'],C7_DISCLOSURE_PRIVATE_GAP:['DISCLOSURE_PLUS_CURRENT_PRIVATE','OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION']});
// [reference, primary]: is primary noninferior to reference?
export const NI_ENDPOINTS=deepFreeze({S1_RUNTIME_VS_PRIVATE:['RUNTIME_PLUS_CURRENT_PRIVATE','OBJECTIVE_PROGRESS_ONLY','ALL'],S2_DISCLOSURE_VS_PRIVATE:['DISCLOSURE_PLUS_CURRENT_PRIVATE','OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION','ALL'],S3_RUNTIME_VS_DISCLOSURE:['OBJECTIVE_PROGRESS_PLUS_TYPED_RELATION','OBJECTIVE_PROGRESS_ONLY','ALL'],OOD_OBJECTIVE_PROGRESS:['BASELINE_LEVEL_FIT','OBJECTIVE_PROGRESS_LEVEL_FIT','OOD']});
export const STATISTICS=deepFreeze({resamples:40000,descriptiveResamples:2000,alpha:.05,niEndpointFamily:Object.keys(NI_ENDPOINTS).length*2,hitMargin:.05,nregMargin:.01,minN:100,
 material:'Stage 3G.7 rule: mean hit gain >= .05, paired 95% percentile lower bound > 0 and normalized regret not worse. A claim requires both families (replication); n<100 in either family is NOT_TESTABLE. HARMFUL is the mirror rule.',
 noninferiority:'One-sided, Bonferroni over the registered NI family, deterministic paired percentile bootstrap with 40,000 resamples: PASS iff hit-deficit upper < .05 and nreg-excess upper < .01; FAIL iff a lower bound reaches a margin; else NOT_TESTABLE.',bootstrap:'deterministic paired percentile, unit row weights, seed STAGE3G8:<key>'});
export const AUDITS=deepFreeze({
 objectiveFidelity:'Per row: packet metadata.objectives equals kernel world.objectives (audit read); reconstructObjectives(project(packet)) equals the packet exactly; summed remaining equals packet feature[12].',
 bypass:'Per offered BYPASS root on every row: coarse identifiability (exactly one in-service supports source), typed t0 prediction, and the actual kernel rewiring from symmetricStep (audit only).',
 subtypeVOI:'Oracle value-of-information audit, audit-only: permute canonical types within each coarse collapse group (multiset preserving, seeded by record hash, at most 8 attempts); accept the first permutation that changes a type and leaves the delivered observation (features, canonicalState, objectives, history, visible map) and the offered menu identical. Evaluate the unchanged frozen counterfactual oracle on that world. decisionRelevant = optimal set differs; misbeliefHitLoss = 1 - mean actual optimality of the alternative optimal set. Rows with no consistent alternative contribute 0.',
 materiallyRelevantPath:'In both population families: share of inferential rows with BYPASS offered and coarse-ambiguous substitute >= .05, OR mean subtype misbelief hit loss >= .05 with paired 95% lower > 0.',
 integrity:'Every 25th row (stored equivariance sample): D4 twins, order-preserving identity renaming with reversed candidate order, Stage 3G.7-style non-monotone renaming for identity-independent columns, privileged poisoning, recomputation determinism, privileged key scan; and frozen Stage 3G.7 observableColumns parity on every row and candidate.'});
export const DECISION_RULES=deepFreeze({
 OBJECTIVE_PROGRESS_VALUE_MATERIAL:'C1 MATERIAL replicated in A and B on ALL',OBJECTIVE_PROGRESS_OOD_STABLE:'OOD_OBJECTIVE_PROGRESS NI PASS in A and B -> true; FAIL in either -> false; otherwise NOT_TESTABLE',
 TYPED_RELATION_DECISION_VALUE_MATERIAL:'C2 or C4 MATERIAL replicated on ALL or TARGET_BEARING, or in both BYPASS cohorts',
 TYPED_RELATION_DISCLOSURE_JUSTIFIED:'eligible safety audit AND real collision (fixture pair + natural coarse-ambiguous BYPASS > 0) AND (decision value material OR (exact semantics required AND materially relevant path)) AND no leakage AND replication',
 TYPED_RELATION_SCHEMA_SUPPORT_JUSTIFIED:'eligible safety audit AND real collision AND typed prediction exact on every natural and fixture BYPASS AND no leakage (mechanistic; not decision value)',
 TARGET_SEMANTICS_SUFFICIENT:'objective projection complete AND every unavailable target predicate explicitly UNKNOWN with zero false certainty AND S1 NI PASS in A and B AND no replicated material C6 gap in any testable population stratum. Sufficiency is relative to the environment observation boundary and the demonstrated population; absent action cells are reported NOT_DEMONSTRATED.',
 DEPENDENCY_SEMANTICS_SUFFICIENT:'Exact dependency effect identifiable on the surface (Stage 3G.7 meaning). Current runtime: requires coarse identifiability on every natural BYPASS. With disclosure: typed prediction exact on every natural and fixture BYPASS.',
 SCIENTIFICALLY_SUFFICIENT_WITH_DISCLOSURE:'TARGET_SEMANTICS_SUFFICIENT AND DEPENDENCY_SEMANTICS_SUFFICIENT_WITH_DISCLOSURE AND S2 NI PASS in A and B AND no replicated material C7 gap AND root legality parity AND UNKNOWN safety',
 CURRENT_RUNTIME_SUFFICIENT:'TARGET_SEMANTICS_SUFFICIENT AND current-runtime DEPENDENCY_SEMANTICS_SUFFICIENT AND S1 NI PASS AND root legality parity AND UNKNOWN safety. Audit-only fields never make it true.',
 ACTION_SURFACE_SUFFICIENT:'= CURRENT_RUNTIME_SUFFICIENT',DEPLOYABLE_PLANNING_SUFFICIENT:'ACTION_SURFACE_SUFFICIENT AND inherited SEARCH_BUDGET_SUFFICIENT passes on the full domain (inherited NOT_TESTABLE_ON_FULL_REQUIRED_DOMAIN; not re-tested here)',
 STAGE3G_CLOSURE:['C1 epistemic integrity certified (3G.1/3G.2 reproduced; Stage 3G.8 integrity all pass)','C2 observable current state sufficient for demonstrated tasks = SCIENTIFICALLY_SUFFICIENT_WITH_DISCLOSURE','C3 remaining unavailable fields explicitly UNKNOWN (boundary V2 audit)','C4 prediction lifecycle safe (3G.3 reproduced)','C5 environment-dynamics value non-material (Stage 3G.7 replicated environment gate false in every testable stratum; reproduced)','C6 no learned world model justified (C5 and C8)','C7 remaining adapter-contract improvements understood and scoped (typed disclosure eligible, collision resolved prospectively, its decision value measured; objective projection complete)','C8 no unresolved issue requires counterfactual prediction (hidden-health collision is current information; C5)'],
 blocker:'If closure fails, name exactly the first failing condition in C1..C8 order.'});
export const PLAN=deepFreeze({stage:'STAGE3G8',title:'Existing-observation projection and prospective disclosure value qualification',
 inheritance:{checks:INHERITED,STAGE3G7_CERTIFICATION_HASH:INHERITED.stage3g7.hash,inheritedConclusions:{TARGET_ELIGIBILITY_OBSERVABLE:'OFFERED_CURRENT_LEGALITY_PASS_HIDDEN_PREDICATES_PARTIAL',DEPENDENCY_SUBTYPE_OBSERVABLE:false,BYPASS_EXACT_SUBSTITUTE_IDENTIFIABLE:'NOT_IDENTIFIABLE_UNDER_CURRENT_CONTRACT',FUTURE_TARGET_ELIGIBILITY_COMPLETE:false,TARGET_SEMANTICS_SUFFICIENT:false,DEPENDENCY_SEMANTICS_SUFFICIENT:false,SEARCH_BUDGET_SUFFICIENT:'NOT_TESTABLE_ON_FULL_REQUIRED_DOMAIN',ACTION_SURFACE_SUFFICIENT:false,DEPLOYABLE_PLANNING_SUFFICIENT:false,READY_FOR_3G_COUNTERFACTUAL_PREDICTION:false,WORLD_MODEL_WORK_NOW_JUSTIFIED:false,AUTHORITY:'R0'}},
 schemas:{OBJECTIVE_PROGRESS_V1:OBJECTIVE_PROGRESS_SCHEMA_HASH,TYPED_RELATION_DISCLOSURE_CANDIDATE_V1:TYPED_RELATION_DISCLOSURE_SCHEMA_HASH,CURRENT_OBSERVATION_BOUNDARY_V2:CURRENT_OBSERVATION_BOUNDARY_V2_HASH},
 g7:{planHash:'bound at OPEN phase from artifacts/stage3g7-target-contract/stage3g7-analysis-plan.json',primary:G7.primary,fitting:G7.fitting,depth:G7.depth,searchCaps:[512]},
 seeds:SEED_PLAN,heads:HEADS,strata:STRATA,comparisons:COMPARISONS,niEndpoints:NI_ENDPOINTS,statistics:STATISTICS,audits:AUDITS,decisionRules:DECISION_RULES,
 fixtures:'Stage 3G.7 BYPASS collision pair, multi-substitute lexical renaming and hidden-health collision re-run under CURRENT_COARSE_RELATION and PROSPECTIVE_TYPED_RELATION; reachable COLLECT->TRANSFER trajectory for nonzero delivered objective fidelity and replay. Population weight 0.',
 feasibility:{maxSecondsPerRow:120,evidenceParts:8,limitOutcome:'UNRESOLVED; no post-seal tuning'},
 authority:{AUTHORITY:'R0',CAN_DISPATCH:false,CAN_MUTATE_LIVE_WORLD:false,ONLINE_LEARNING_ENABLED:false,PROMOTED_TO_LIVE_RUNTIME:false},
 scope:{liveAdapterChanged:false,learnedWorldModel:false,environmentPredictor:false,stage3I:false,oracleOrRouterRedesign:false,expert10:false,stage3H:'not begun'},
 codeLocation:'Stage-local code lives in stage3g8/ because the frozen Stage 3G.7 source hash scans every .js/.mjs under src/ and scripts/; adding files there would invalidate its reproduction.'});
export const PLAN_HASH=sha256(PLAN);
