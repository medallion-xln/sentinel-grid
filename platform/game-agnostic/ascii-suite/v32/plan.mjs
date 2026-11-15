export const PLAN=Object.freeze({
 id:'SENTINEL_ASCII_EXTREME_CURRICULUM_V1',version:'3.2.0',authority:'R0',canDispatch:false,canMutateLiveWorld:false,onlineLearning:false,promotion:false,
 games:['pong','platformer','fighter','racing','rescue','cards','factory','roguelike'],tiers:[1,2,3],labels:['Advanced','Expert','Extreme'],
 baseline:'Original D1–D5 unchanged; new ADVANCED_1–3 IDs are separately versioned extension configurations, not certified D6–8.',
 firstExperiment:'Fresh V2 codec action-ranking pilot; no reuse of old training/validation/reserved outcomes as fresh confirmation.',secondExperiment:'Separate Factory relational consumer; no inherited Nexus/Prime credit.',
 splits:{TRAIN:{lineage:'V32_TRAIN_RECTILINEAR',seedBase:0xa1200000},DEV:{lineage:'V32_DEV_OFFSET',seedBase:0xa2300000},OPEN_VALIDATION_A:{lineage:'V32_OPEN_MIRRORED',seedBase:0xa3400000},OPEN_VALIDATION_B:{lineage:'V32_OPEN_DOGLEG',seedBase:0xa4500000},STRUCTURAL_OOD:{lineage:'V32_OOD_MULTI_BRANCH',seedBase:0xa5600000},RESERVED_TEST:{status:'UNMATERIALIZED_UNACCESSED'}},
 smoke:{seeds:2,policies:['STRONG','WAIT','SPAM','RANDOM'],sensors:['NORMAL','DELAYED','STALE','MISSING','PARTIAL'],budget:'Finite per-world; every scheduled episode, rejection, timeout and failure retained.'},
 training:{epochs:80,lr:.12,l2:.0001,margin:.1,selection:'Fixed last epoch; no OPEN-based weight update',codec:'EXPERIMENTAL_PUBLIC_ACTION_CODEC_V2_NOT_TRAINED'},
 gates:{minimumSuccessDelta:.1,newCatastrophes:0,lower95PairedDeltaAbove:0,replicationRequired:true,newRepeatedOfftrackFailures:0,qualifiedReachabilityRequired:true},
 power:{pilotPairsPerCell:4,qualificationPairsPerCell:200,reason:'Pilot cells are descriptive only. Conservative worst-case paired Bernoulli SE ≤1/sqrt(n); detecting 0.2 at 80% two-sided 5% power requires ~196 pairs. Do not certify small pilots.',fullScheduleAuthorizedButNotImplicitlyCompleted:true},
 curriculum:['FOUNDATIONAL','ADVANCED','EXPERT','EXTREME','STRUCTURAL_OOD'],advance:'TRAIN+DEV gate only; frozen candidate before OPEN; no reserved materialization',
 unqualified:'No canonical expert action binding or Prime complementarity unless independently demonstrated. Teacher agreement is not regret; missing metrics null, not invented.',
 safety:'Rogue new deaths veto; racing repeated off-track veto; Rescue new casualties veto; fighter equal latency/style-separated; Cards own-hand hidden; Factory WAIT must fail; Pong strategic shot candidates need outcome gain.'
});
