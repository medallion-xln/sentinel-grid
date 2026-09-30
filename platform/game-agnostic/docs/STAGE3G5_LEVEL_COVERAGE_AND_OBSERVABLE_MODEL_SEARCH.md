# Stage 3G.5 — Level Coverage and Observable Model Search

```text
=== SENTINEL GRID STAGE 3G.5 LEVEL COVERAGE AND OBSERVABLE MODEL SEARCH ===
STATUS=PASS

=== INHERITANCE ===
STAGE3F=true, HASH=0fe5d3e24f71015b76f5997771f2474712d2764bc049fc2e90e0144f8d2a08ce
STAGE3G12=true, HASH=7f39253507a4219dac0a0c4a83cfe7d14b2d37fa1498ebb2767560bdea695100
STAGE3G3=true, HASH=6f58040133deae625e61c636f881b9283da62458581387b0dbe9afee6b4a8c69
STAGE3G4=true, HASH=259195ba9c2d223010d8302579c665c67fd20b666f43b35c9ae539e6e70cb4c8
STAGE3G4_TRANSITION_PREDICTION_NOW_JUSTIFIED=false
STAGE3G4_WORLD_MODEL_WORK_NOW_JUSTIFIED=false
STAGE3G4_DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT=true

=== LEVEL-BALANCED SCORER ===
FROZEN=A: n=6905, hit=86.13%, regret=8.1054, normalized regret=0.0693 | B: n=6929, hit=85.22%, regret=7.9401, normalized regret=0.0728
LEVEL_BALANCED_LINEAR=A: n=6905, hit=89.33%, regret=4.6809, normalized regret=0.0408 | B: n=6929, hit=88.76%, regret=4.4566, normalized regret=0.0404
LEVEL_BALANCED_INTERACTION=A: n=6905, hit=88.96%, regret=5.0402, normalized regret=0.0434 | B: n=6929, hit=88.28%, regret=4.9496, normalized regret=0.0448
LOW=A: hit delta=0.20 pp (95% CI [-0.48, 0.92] pp), regret reduction=0.3914, normalized regret delta=-0.0033, material=false | B: hit delta=1.04 pp (95% CI [0.44, 1.63] pp), regret reduction=0.6890, normalized regret delta=-0.0103, material=false
MID=A: hit delta=4.16 pp (95% CI [3.35, 5.16] pp), regret reduction=4.0319, normalized regret delta=-0.0367, material=false | B: hit delta=3.50 pp (95% CI [2.69, 4.38] pp), regret reduction=3.3149, normalized regret delta=-0.0326, material=false
HIGH=A: hit delta=5.97 pp (95% CI [4.92, 7.08] pp), regret reduction=6.7439, normalized regret delta=-0.0517, material=true | B: hit delta=7.04 pp (95% CI [5.78, 8.31] pp), regret reduction=7.5867, normalized regret delta=-0.0629, material=true

=== DEPLOYABLE ACTION MODEL ===
SCHEMA=DEPLOYABLE_ACTION_MODEL_V1
SCHEMA_HASH=e02f5b3f80b7ae5bf24c43e54f14a0cf47f0086d5b11bc4b8c3a88c353ae6d6f
KNOWN_EFFECTS=E1 actor displacement, declared energy change, tick advance, COLLECT service removal, PROTECT shield, TRANSFER delivery
UNKNOWN_EFFECTS=attacks, damage, future entity/resource/service state, successor legality/survival/terminal state, EU action magnitudes

=== DEPLOYABLE SEARCH ===
DEPTH0=A: n=6905, hit=89.33%, regret=4.6809, normalized regret=0.0408 | B: n=6929, hit=88.76%, regret=4.4566, normalized regret=0.0404
DEPTH1=A: n=4172, hit=87.43%, regret=7.1015, normalized regret=0.0537 | B: n=4204, hit=88.20%, regret=6.2959, normalized regret=0.0487
DEPTH2=A: n=4172, hit=87.19%, regret=7.3522, normalized regret=0.0557 | B: n=4204, hit=87.99%, regret=6.5614, normalized regret=0.0507
DEPTH3=A: n=172, hit=75.00%, regret=19.0523, normalized regret=0.1359 | B: n=173, hit=82.08%, regret=19.7168, normalized regret=0.1148

=== KNOWN-MODEL UPPER BOUND ===
DEPTH2=A: n=4172, hit=88.57%, regret=5.7553, normalized regret=0.0464 | B: n=4204, hit=88.70%, regret=5.4838, normalized regret=0.0452
DEPTH3=A: n=172, hit=79.07%, regret=11.6977, normalized regret=0.0933 | B: n=173, hit=84.39%, regret=14.2197, normalized regret=0.0928
RAW_ARGMAX_DEPTH2=A: n=4172, hit=88.45%, regret=5.9365, normalized regret=0.0474 | B: n=4204, hit=89.33%, regret=5.4687, normalized regret=0.0437
RAW_ARGMAX_DEPTH3=A: n=172, hit=82.07%, regret=9.0494, normalized regret=0.0663 | B: n=173, hit=87.09%, regret=10.8449, normalized regret=0.0660

=== ENVIRONMENT DYNAMICS VALUE ===
ALL=A: hit delta=1.38 pp (95% CI [0.81, 2.01] pp), regret reduction=1.5970, normalized regret delta=-0.0093, material=false | B: hit delta=0.71 pp (95% CI [0.02, 1.40] pp), regret reduction=1.0775, normalized regret delta=-0.0055, material=false
LOW=A: hit delta=1.99 pp (95% CI [0.66, 3.32] pp), regret reduction=2.4764, normalized regret delta=-0.0132, material=false | B: hit delta=0.13 pp (95% CI [-1.31, 1.57] pp), regret reduction=0.9739, normalized regret delta=-0.0027, material=false
MID=A: hit delta=1.21 pp (95% CI [0.45, 1.98] pp), regret reduction=1.1154, normalized regret delta=-0.0076, material=false | B: hit delta=1.02 pp (95% CI [0.13, 1.90] pp), regret reduction=0.8603, normalized regret delta=-0.0056, material=false
HIGH=A: hit delta=0.77 pp (95% CI [0.23, 1.32] pp), regret reduction=1.0797, normalized regret delta=-0.0063, material=false | B: hit delta=1.09 pp (95% CI [0.36, 1.82] pp), regret reduction=1.5342, normalized regret delta=-0.0092, material=false
RETREAT=A: hit delta=2.45 pp (95% CI [0.31, 4.59] pp), regret reduction=3.4441, normalized regret delta=-0.0268, material=false | B: hit delta=-0.14 pp (95% CI [-3.04, 2.32] pp), regret reduction=2.8362, normalized regret delta=-0.0112, material=false
NON_RETREAT=A: hit delta=1.18 pp (95% CI [0.64, 1.73] pp), regret reduction=1.2542, normalized regret delta=-0.0060, material=false | B: hit delta=0.88 pp (95% CI [0.28, 1.45] pp), regret reduction=0.7322, normalized regret delta=-0.0044, material=false
HORIZON_DEPENDENT=A: hit delta=0.49 pp (95% CI [-0.49, 1.43] pp), regret reduction=0.7284, normalized regret delta=-0.0031, material=false | B: hit delta=-0.39 pp (95% CI [-1.37, 0.64] pp), regret reduction=0.3045, normalized regret delta=0.0013, material=false

=== ENVIRONMENT DYNAMICS ATTRIBUTION ===
HOSTILE_ATTACK=frequency=60.88%, flips=1.44%, regret contribution=0.6622, retreat exposure concentration=25.75%; MATCHED_LEAVE_ONE_MECHANISM_OUT, all guarded rows; frequency is root exposure
HAZARD_DAMAGE=frequency=6.92%, flips=0.00%, regret contribution=0.0000, retreat exposure concentration=19.48%; MATCHED_LEAVE_ONE_MECHANISM_OUT, all guarded rows; frequency is root exposure
SERVICE_REVERSAL=frequency=0.00%, flips=NA, regret contribution=NA, retreat exposure concentration=NA; OVERLAPPING_OBSERVATIONAL_ROOT_STRATUM; noncausal, nonadditive
ENTITY_STATE_CHANGE=frequency=62.86%, flips=7.29%, regret contribution=1.7833, retreat exposure concentration=24.98%; OVERLAPPING_OBSERVATIONAL_ROOT_STRATUM; noncausal, nonadditive
RESOURCE_STATE_CHANGE=frequency=0.00%, flips=NA, regret contribution=NA, retreat exposure concentration=NA; OVERLAPPING_OBSERVATIONAL_ROOT_STRATUM; noncausal, nonadditive
OTHER=frequency=0.00%, flips=NA, regret contribution=NA, retreat exposure concentration=NA; OVERLAPPING_OBSERVATIONAL_ROOT_STRATUM; noncausal, nonadditive

=== RETREAT ===
BASELINE=A: n=1110, hit=65.23%, regret=27.3396, normalized regret=0.2325 | B: n=1141, hit=62.84%, regret=28.6310, normalized regret=0.2546
LEVEL_BALANCED=A: n=1110, hit=85.95%, regret=6.0586, normalized regret=0.0548 | B: n=1141, hit=86.24%, regret=6.6494, normalized regret=0.0568
DEPLOYABLE_SEARCH_D1=A: n=653, hit=81.93%, regret=11.7626, normalized regret=0.0872 | B: n=690, hit=81.74%, regret=12.5957, normalized regret=0.0949
DEPLOYABLE_SEARCH_D2=A: n=653, hit=80.40%, regret=13.4609, normalized regret=0.1012 | B: n=690, hit=79.86%, regret=14.6565, normalized regret=0.1091
DEPLOYABLE_SEARCH_D3=A: n=28, hit=57.14%, regret=39.0000, normalized regret=0.2246 | B: n=33, hit=60.61%, regret=43.1212, normalized regret=0.2323
KNOWN_MODEL_SEARCH_D2=A: n=653, hit=82.85%, regret=10.0168, normalized regret=0.0744 | B: n=690, hit=79.71%, regret=11.8203, normalized regret=0.0979
KNOWN_MODEL_SEARCH_D3=A: n=28, hit=75.00%, regret=14.5000, normalized regret=0.1259 | B: n=33, hit=69.70%, regret=30.2121, normalized regret=0.1669
DEPLOYABLE_SEARCH=primary D2; D1/D2/D3 above
KNOWN_MODEL_SEARCH=privileged D2/D3 above
SEARCH_GAP=A: hit delta=2.45 pp (95% CI [0.31, 4.59] pp), regret reduction=3.4441, normalized regret delta=-0.0268, material=false | B: hit delta=-0.14 pp (95% CI [-3.04, 2.32] pp), regret reduction=2.8362, normalized regret delta=-0.0112, material=false
ENVIRONMENT_DYNAMICS_VALUE=A: hit delta=3.22 pp (95% CI [1.84, 4.75] pp), regret reduction=2.3139, normalized regret delta=-0.0222, material=false | B: hit delta=1.30 pp (95% CI [-0.14, 2.61] pp), regret reduction=1.0217, normalized regret delta=-0.0107, material=false
REGRET_REDUCTION=A: 3.4441 | B: 2.8362
CLASSIFICATION=RETREAT_LEVEL_COVERAGE_LIMITED

=== SCIENTIFIC CONCLUSION ===
LEVEL_BALANCED_PRIMARY_REPLICATED=true
HIGH_LEVEL_GAP_CLOSED=true
DEPLOYABLE_ACTION_MODEL_IMPLEMENTED=true
DEPLOYABLE_BOUNDED_SEARCH_VALUE_MEASURED=true
DEPLOYABLE_BOUNDED_SEARCH_SUFFICIENT=true
ENVIRONMENT_DYNAMICS_VALUE_MEASURED=true
ENVIRONMENT_DYNAMICS_VALUE_MATERIAL=false
ENVIRONMENT_DYNAMICS_VALUE_OOD_STABLE=false
RETREAT_RESIDUAL_CLASSIFIED=true
TRANSITION_PREDICTION_NOW_JUSTIFIED=false
WORLD_MODEL_WORK_NOW_JUSTIFIED=false
ORACLE_TEMPORAL_CAPABILITY_NOW_REQUIRED=false

=== AUTHORITY ===
AUTHORITY=R0
CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false
ONLINE_LEARNING_ENABLED=false
PROMOTED_TO_LIVE_RUNTIME=false

=== ROADMAP ===
STAGE3G_STATUS=STAGE3G5_COMPLETE
READY_FOR_3G_COUNTERFACTUAL_PREDICTION=false
NEXT_RECOMMENDED_ACTION=Stage 3G.6 — Observable planning and action-surface sufficiency audit (no learned world model)
BLOCKERS=[]

=== CERTIFICATION ===
CERTIFICATION_HASH=d472f04f00560229f20020f030722fdf3981f91155424d0a7a2004662be768da
CERTIFICATION_REPRODUCED=true
```

## Design and interpretation

OPEN seed 6012 supplied 2,400 raw rows. Sealed families A=7021 and B=7031 supplied 7,600 rows each, with 190 admitted rows per L0–L7 × H0–H4 cell. All data, definitions and models were frozen before sealed generation at b3d4c06b48ccf173cbd0e9afc1b08e75095d30f0. The first sealed performance evaluation was followed only by identical reproductions. There were no amendments to evaluation sources after sealing; result and verification artifacts were added afterward. Earlier stage conclusions remain unchanged.

Depth d includes a root action plus d continuations. Inferential comparisons require label horizon h+1 > d+1. D2 is primary. D3 uses the predeclared every-16th eligible row sample and is secondary. Hit rates above use the stated guarded depth-specific samples, so depth comparisons require the paired fields below. Unguarded scorer metrics use all eligible rows.

Deployable search uses certified action effects and conditional MOVE/WAIT paths on the observed t0 reference map. Future legality and survival remain UNKNOWN. It does not exhaust all deterministic target-action planners. Known search uses the unchanged Stage 3G.4 kernel and private reward scalars. KNOWN_D2/D3 rank roots using a level-balanced linear scorer augmented by the privileged cumulative scalar. RAW_ARGMAX_DEPTH2/3 use the direct scalar argmax; both are reported, and the registered inference uses the paired fitted scorers. Its gap against deployable search is an upper bound that also includes continuation-surface, scorer and value-access differences. The forecasting gate additionally requires a material matched dynamics intervention in both families. Seed-family B is OOD within known compositions; structural or unseen-mechanism OOD was not tested.

Materiality requires at least five percentage points of paired optimal-set-hit gain, a positive 95% bootstrap lower bound and no worse normalized regret. Forecasting also requires at least 100 rows, at least 20% relative regret reduction and a negative normalized-regret confidence interval in matching replicated strata. FPE and TCA are not measured because no environment predictor or trust gate was implemented. Known CAD and search are privileged upper bounds.

## Per-level primary evaluation

| Family | Level | n | Frozen hit | Balanced hit | Interaction hit | Balanced − frozen | 95% CI (pp) | Normalized regret delta |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| A | 0 | 809 | 78.99% | 78.00% | 77.13% | -0.99 pp | [-2.35, 0.25] pp | 0.0061 |
| A | 1 | 835 | 80.72% | 81.08% | 81.56% | 0.36 pp | [-0.72, 1.44] pp | -0.0017 |
| A | 2 | 855 | 84.15% | 85.32% | 84.85% | 1.17 pp | [-0.12, 2.46] pp | -0.0137 |
| A | 3 | 855 | 83.63% | 87.49% | 86.90% | 3.86 pp | [2.57, 5.26] pp | -0.0358 |
| A | 4 | 857 | 88.56% | 92.53% | 92.30% | 3.97 pp | [2.57, 5.60] pp | -0.0356 |
| A | 5 | 886 | 89.05% | 93.68% | 93.12% | 4.63 pp | [3.27, 6.32] pp | -0.0385 |
| A | 6 | 898 | 90.31% | 96.77% | 96.55% | 6.46 pp | [4.90, 8.13] pp | -0.0546 |
| A | 7 | 910 | 92.36% | 97.86% | 97.42% | 5.49 pp | [4.07, 7.03] pp | -0.0489 |
| B | 0 | 821 | 76.74% | 76.61% | 76.61% | -0.12 pp | [-1.22, 0.97] pp | -0.0036 |
| B | 1 | 843 | 83.75% | 84.10% | 83.99% | 0.36 pp | [-0.71, 1.42] pp | -0.0052 |
| B | 2 | 847 | 81.29% | 84.12% | 83.06% | 2.83 pp | [1.53, 4.13] pp | -0.0219 |
| B | 3 | 857 | 84.54% | 88.16% | 88.04% | 3.62 pp | [2.22, 5.13] pp | -0.0378 |
| B | 4 | 861 | 86.99% | 90.48% | 89.78% | 3.48 pp | [1.97, 4.99] pp | -0.0328 |
| B | 5 | 883 | 90.37% | 93.77% | 93.20% | 3.40 pp | [2.15, 4.76] pp | -0.0274 |
| B | 6 | 900 | 87.89% | 95.56% | 94.78% | 7.67 pp | [5.78, 9.44] pp | -0.0674 |
| B | 7 | 917 | 89.20% | 95.64% | 95.20% | 6.43 pp | [4.69, 8.29] pp | -0.0584 |

## Matched planning and dynamics comparisons

| Family | Stratum | Depth | n | Deployable vs balanced | Known vs balanced | Known vs deployable upper bound | Matched environment intervention | Private action/value/surface residual |
|---|---|---:|---:|---|---|---|---|---|
| A | ALL | 2 | 4172 | hit delta=-0.74 pp (95% CI [-1.05, -0.43] pp), regret reduction=-0.8109, normalized regret delta=0.0061, material=false | hit delta=0.64 pp (95% CI [0.07, 1.15] pp), regret reduction=0.7861, normalized regret delta=-0.0031, material=false | hit delta=1.38 pp (95% CI [0.81, 2.01] pp), regret reduction=1.5970, normalized regret delta=-0.0093, material=false | hit delta=0.93 pp (95% CI [0.60, 1.27] pp), regret reduction=0.7505, normalized regret delta=-0.0070, material=false | hit delta=0.44 pp (95% CI [-0.16, 1.02] pp), regret reduction=0.8465, normalized regret delta=-0.0023, material=false |
| A | ALL | 3 | 172 | hit delta=-9.88 pp (95% CI [-15.12, -4.65] pp), regret reduction=-10.9244, normalized regret delta=0.0707, material=false | hit delta=-5.81 pp (95% CI [-10.47, -1.16] pp), regret reduction=-3.5698, normalized regret delta=0.0281, material=false | hit delta=4.07 pp (95% CI [-2.33, 9.30] pp), regret reduction=7.3547, normalized regret delta=-0.0426, material=false | hit delta=0.00 pp (95% CI [-1.74, 1.74] pp), regret reduction=0.2035, normalized regret delta=-0.0001, material=false | hit delta=4.07 pp (95% CI [-1.74, 9.30] pp), regret reduction=7.1512, normalized regret delta=-0.0425, material=false |
| A | LOW | 2 | 1505 | hit delta=-1.26 pp (95% CI [-1.93, -0.60] pp), regret reduction=-1.3169, normalized regret delta=0.0112, material=false | hit delta=0.73 pp (95% CI [-0.53, 1.99] pp), regret reduction=1.1595, normalized regret delta=-0.0020, material=false | hit delta=1.99 pp (95% CI [0.66, 3.32] pp), regret reduction=2.4764, normalized regret delta=-0.0132, material=false | hit delta=2.19 pp (95% CI [1.40, 2.99] pp), regret reduction=1.7867, normalized regret delta=-0.0172, material=false | hit delta=-0.20 pp (95% CI [-1.73, 1.33] pp), regret reduction=0.6897, normalized regret delta=0.0040, material=false |
| A | LOW | 3 | 62 | hit delta=-4.84 pp (95% CI [-12.90, 3.23] pp), regret reduction=-1.2903, normalized regret delta=0.0219, material=false | hit delta=-9.68 pp (95% CI [-20.97, 0.00] pp), regret reduction=-6.1129, normalized regret delta=0.0523, material=false | hit delta=-4.84 pp (95% CI [-16.13, 4.84] pp), regret reduction=-4.8226, normalized regret delta=0.0304, material=false | hit delta=-1.61 pp (95% CI [-4.84, 0.00] pp), regret reduction=-1.5000, normalized regret delta=0.0160, material=false | hit delta=-3.23 pp (95% CI [-12.90, 6.45] pp), regret reduction=-3.3226, normalized regret delta=0.0144, material=false |
| A | MID | 2 | 1569 | hit delta=-0.45 pp (95% CI [-0.96, -0.06] pp), regret reduction=-0.3607, normalized regret delta=0.0026, material=false | hit delta=0.76 pp (95% CI [-0.06, 1.53] pp), regret reduction=0.7546, normalized regret delta=-0.0050, material=false | hit delta=1.21 pp (95% CI [0.45, 1.98] pp), regret reduction=1.1154, normalized regret delta=-0.0076, material=false | hit delta=0.38 pp (95% CI [0.00, 0.83] pp), regret reduction=0.2817, normalized regret delta=-0.0022, material=false | hit delta=0.83 pp (95% CI [-0.06, 1.66] pp), regret reduction=0.8337, normalized regret delta=-0.0054, material=false |
| A | MID | 3 | 65 | hit delta=-10.77 pp (95% CI [-20.00, -1.54] pp), regret reduction=-13.1385, normalized regret delta=0.0822, material=false | hit delta=-6.15 pp (95% CI [-13.85, 0.00] pp), regret reduction=-3.6154, normalized regret delta=0.0246, material=false | hit delta=4.62 pp (95% CI [-4.62, 13.85] pp), regret reduction=9.5231, normalized regret delta=-0.0576, material=false | hit delta=1.54 pp (95% CI [0.00, 4.62] pp), regret reduction=1.9692, normalized regret delta=-0.0154, material=false | hit delta=3.08 pp (95% CI [-4.62, 10.77] pp), regret reduction=7.5538, normalized regret delta=-0.0422, material=false |
| A | HIGH | 2 | 1098 | hit delta=-0.46 pp (95% CI [-0.91, -0.09] pp), regret reduction=-0.7605, normalized regret delta=0.0042, material=false | hit delta=0.32 pp (95% CI [-0.09, 0.73] pp), regret reduction=0.3192, normalized regret delta=-0.0021, material=false | hit delta=0.77 pp (95% CI [0.23, 1.32] pp), regret reduction=1.0797, normalized regret delta=-0.0063, material=false | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=0.77 pp (95% CI [0.23, 1.37] pp), regret reduction=1.0797, normalized regret delta=-0.0063, material=false |
| A | HIGH | 3 | 45 | hit delta=-15.56 pp (95% CI [-26.67, -6.67] pp), regret reduction=-21.0000, normalized regret delta=0.1214, material=false | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=15.56 pp (95% CI [6.67, 26.67] pp), regret reduction=21.0000, normalized regret delta=-0.1214, material=true | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=15.56 pp (95% CI [4.44, 26.67] pp), regret reduction=21.0000, normalized regret delta=-0.1214, material=true |
| A | RETREAT_OPTIMAL | 2 | 653 | hit delta=-4.90 pp (95% CI [-6.74, -3.06] pp), regret reduction=-5.1715, normalized regret delta=0.0411, material=false | hit delta=-2.45 pp (95% CI [-4.44, -0.77] pp), regret reduction=-1.7274, normalized regret delta=0.0143, material=false | hit delta=2.45 pp (95% CI [0.31, 4.59] pp), regret reduction=3.4441, normalized regret delta=-0.0268, material=false | hit delta=3.22 pp (95% CI [1.84, 4.75] pp), regret reduction=2.3139, normalized regret delta=-0.0222, material=false | hit delta=-0.77 pp (95% CI [-3.37, 1.84] pp), regret reduction=1.1302, normalized regret delta=-0.0046, material=false |
| A | RETREAT_OPTIMAL | 3 | 28 | hit delta=-32.14 pp (95% CI [-53.57, -10.71] pp), regret reduction=-33.7857, normalized regret delta=0.1921, material=false | hit delta=-14.29 pp (95% CI [-28.57, -3.57] pp), regret reduction=-9.2857, normalized regret delta=0.0934, material=false | hit delta=17.86 pp (95% CI [-3.57, 35.71] pp), regret reduction=24.5000, normalized regret delta=-0.0987, material=false | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=17.86 pp (95% CI [-3.57, 35.71] pp), regret reduction=24.5000, normalized regret delta=-0.0987, material=false |
| A | NON_RETREAT | 2 | 3519 | hit delta=0.03 pp (95% CI [-0.17, 0.20] pp), regret reduction=-0.0017, normalized regret delta=-0.0004, material=false | hit delta=1.21 pp (95% CI [0.67, 1.76] pp), regret reduction=1.2525, normalized regret delta=-0.0064, material=false | hit delta=1.18 pp (95% CI [0.64, 1.73] pp), regret reduction=1.2542, normalized regret delta=-0.0060, material=false | hit delta=0.51 pp (95% CI [0.23, 0.85] pp), regret reduction=0.4604, normalized regret delta=-0.0042, material=false | hit delta=0.67 pp (95% CI [0.07, 1.28] pp), regret reduction=0.7938, normalized regret delta=-0.0018, material=false |
| A | NON_RETREAT | 3 | 144 | hit delta=-5.56 pp (95% CI [-10.42, -1.39] pp), regret reduction=-6.4792, normalized regret delta=0.0471, material=false | hit delta=-4.17 pp (95% CI [-9.03, 0.69] pp), regret reduction=-2.4583, normalized regret delta=0.0154, material=false | hit delta=1.39 pp (95% CI [-4.17, 6.94] pp), regret reduction=4.0208, normalized regret delta=-0.0317, material=false | hit delta=0.00 pp (95% CI [-2.08, 2.08] pp), regret reduction=0.2431, normalized regret delta=-0.0001, material=false | hit delta=1.39 pp (95% CI [-3.47, 6.94] pp), regret reduction=3.7778, normalized regret delta=-0.0316, material=false |
| A | HORIZON_DEPENDENT | 2 | 2029 | hit delta=-1.33 pp (95% CI [-1.97, -0.79] pp), regret reduction=-1.3593, normalized regret delta=0.0111, material=false | hit delta=-0.84 pp (95% CI [-1.68, 0.00] pp), regret reduction=-0.6309, normalized regret delta=0.0080, material=false | hit delta=0.49 pp (95% CI [-0.49, 1.43] pp), regret reduction=0.7284, normalized regret delta=-0.0031, material=false | hit delta=1.28 pp (95% CI [0.79, 1.77] pp), regret reduction=1.0138, normalized regret delta=-0.0088, material=false | hit delta=-0.79 pp (95% CI [-1.82, 0.15] pp), regret reduction=-0.2854, normalized regret delta=0.0057, material=false |
| A | HORIZON_DEPENDENT | 3 | 83 | hit delta=-9.64 pp (95% CI [-16.87, -3.61] pp), regret reduction=-12.3494, normalized regret delta=0.0727, material=false | hit delta=-7.23 pp (95% CI [-14.46, 0.00] pp), regret reduction=-3.1928, normalized regret delta=0.0260, material=false | hit delta=2.41 pp (95% CI [-7.23, 10.84] pp), regret reduction=9.1566, normalized regret delta=-0.0467, material=false | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=2.41 pp (95% CI [-6.02, 12.05] pp), regret reduction=9.1566, normalized regret delta=-0.0467, material=false |
| B | ALL | 2 | 4204 | hit delta=-0.71 pp (95% CI [-1.09, -0.33] pp), regret reduction=-0.7438, normalized regret delta=0.0070, material=false | hit delta=0.00 pp (95% CI [-0.59, 0.67] pp), regret reduction=0.3337, normalized regret delta=0.0015, material=false | hit delta=0.71 pp (95% CI [0.02, 1.40] pp), regret reduction=1.0775, normalized regret delta=-0.0055, material=false | hit delta=0.69 pp (95% CI [0.33, 1.07] pp), regret reduction=0.5747, normalized regret delta=-0.0055, material=false | hit delta=0.02 pp (95% CI [-0.67, 0.71] pp), regret reduction=0.5029, normalized regret delta=0.0000, material=false |
| B | ALL | 3 | 173 | hit delta=-9.25 pp (95% CI [-14.45, -4.62] pp), regret reduction=-11.0809, normalized regret delta=0.0658, material=false | hit delta=-6.94 pp (95% CI [-12.14, -2.31] pp), regret reduction=-5.5838, normalized regret delta=0.0438, material=false | hit delta=2.31 pp (95% CI [-3.47, 8.09] pp), regret reduction=5.4971, normalized regret delta=-0.0220, material=false | hit delta=1.73 pp (95% CI [-0.58, 4.62] pp), regret reduction=1.8208, normalized regret delta=-0.0142, material=false | hit delta=0.58 pp (95% CI [-5.20, 6.94] pp), regret reduction=3.6763, normalized regret delta=-0.0078, material=false |
| B | LOW | 2 | 1532 | hit delta=-0.91 pp (95% CI [-1.70, -0.13] pp), regret reduction=-0.8975, normalized regret delta=0.0105, material=false | hit delta=-0.78 pp (95% CI [-2.22, 0.78] pp), regret reduction=0.0764, normalized regret delta=0.0078, material=false | hit delta=0.13 pp (95% CI [-1.31, 1.57] pp), regret reduction=0.9739, normalized regret delta=-0.0027, material=false | hit delta=2.02 pp (95% CI [1.11, 2.81] pp), regret reduction=1.7050, normalized regret delta=-0.0152, material=false | hit delta=-1.89 pp (95% CI [-3.59, -0.33] pp), regret reduction=-0.7311, normalized regret delta=0.0125, material=false |
| B | LOW | 3 | 63 | hit delta=-12.70 pp (95% CI [-23.81, -1.59] pp), regret reduction=-16.7143, normalized regret delta=0.0948, material=false | hit delta=-9.52 pp (95% CI [-20.63, 0.00] pp), regret reduction=-6.4762, normalized regret delta=0.0535, material=false | hit delta=3.17 pp (95% CI [-7.94, 14.29] pp), regret reduction=10.2381, normalized regret delta=-0.0413, material=false | hit delta=6.35 pp (95% CI [1.59, 12.70] pp), regret reduction=6.6349, normalized regret delta=-0.0452, material=true | hit delta=-3.17 pp (95% CI [-15.87, 11.11] pp), regret reduction=3.6032, normalized regret delta=0.0039, material=false |
| B | MID | 2 | 1575 | hit delta=-0.63 pp (95% CI [-1.21, -0.19] pp), regret reduction=-0.6171, normalized regret delta=0.0053, material=false | hit delta=0.38 pp (95% CI [-0.44, 1.33] pp), regret reduction=0.2432, normalized regret delta=-0.0003, material=false | hit delta=1.02 pp (95% CI [0.13, 1.90] pp), regret reduction=0.8603, normalized regret delta=-0.0056, material=false | hit delta=0.00 pp (95% CI [-0.32, 0.25] pp), regret reduction=0.0762, normalized regret delta=-0.0007, material=false | hit delta=1.02 pp (95% CI [0.06, 2.03] pp), regret reduction=0.7841, normalized regret delta=-0.0049, material=false |
| B | MID | 3 | 65 | hit delta=-7.69 pp (95% CI [-15.38, -1.54] pp), regret reduction=-7.5385, normalized regret delta=0.0410, material=false | hit delta=-6.15 pp (95% CI [-13.85, 1.54] pp), regret reduction=-5.6769, normalized regret delta=0.0359, material=false | hit delta=1.54 pp (95% CI [-7.69, 10.77] pp), regret reduction=1.8615, normalized regret delta=-0.0051, material=false | hit delta=-1.54 pp (95% CI [-4.62, 0.00] pp), regret reduction=-1.5846, normalized regret delta=0.0059, material=false | hit delta=3.08 pp (95% CI [-6.15, 12.31] pp), regret reduction=3.4462, normalized regret delta=-0.0110, material=false |
| B | HIGH | 2 | 1097 | hit delta=-0.55 pp (95% CI [-1.09, -0.09] pp), regret reduction=-0.7110, normalized regret delta=0.0047, material=false | hit delta=0.55 pp (95% CI [0.00, 1.09] pp), regret reduction=0.8232, normalized regret delta=-0.0046, material=false | hit delta=1.09 pp (95% CI [0.36, 1.82] pp), regret reduction=1.5342, normalized regret delta=-0.0092, material=false | hit delta=-0.18 pp (95% CI [-0.55, 0.18] pp), regret reduction=-0.2881, normalized regret delta=0.0011, material=false | hit delta=1.28 pp (95% CI [0.64, 2.01] pp), regret reduction=1.8222, normalized regret delta=-0.0104, material=false |
| B | HIGH | 3 | 45 | hit delta=-6.67 pp (95% CI [-15.56, 0.00] pp), regret reduction=-8.3111, normalized regret delta=0.0611, material=false | hit delta=-4.44 pp (95% CI [-11.11, 0.00] pp), regret reduction=-4.2000, normalized regret delta=0.0416, material=false | hit delta=2.22 pp (95% CI [-4.44, 8.89] pp), regret reduction=4.1111, normalized regret delta=-0.0195, material=false | hit delta=0.00 pp (95% CI [0.00, 0.00] pp), regret reduction=0.0000, normalized regret delta=0.0000, material=false | hit delta=2.22 pp (95% CI [-4.44, 8.89] pp), regret reduction=4.1111, normalized regret delta=-0.0195, material=false |
| B | RETREAT_OPTIMAL | 2 | 690 | hit delta=-6.09 pp (95% CI [-8.12, -4.49] pp), regret reduction=-5.7043, normalized regret delta=0.0470, material=false | hit delta=-6.23 pp (95% CI [-8.41, -3.77] pp), regret reduction=-2.8681, normalized regret delta=0.0357, material=false | hit delta=-0.14 pp (95% CI [-3.04, 2.32] pp), regret reduction=2.8362, normalized regret delta=-0.0112, material=false | hit delta=1.30 pp (95% CI [-0.14, 2.61] pp), regret reduction=1.0217, normalized regret delta=-0.0107, material=false | hit delta=-1.45 pp (95% CI [-4.35, 1.16] pp), regret reduction=1.8145, normalized regret delta=-0.0006, material=false |
| B | RETREAT_OPTIMAL | 3 | 33 | hit delta=-18.18 pp (95% CI [-36.36, -3.03] pp), regret reduction=-17.2727, normalized regret delta=0.1055, material=false | hit delta=-9.09 pp (95% CI [-21.21, 3.03] pp), regret reduction=-4.3636, normalized regret delta=0.0400, material=false | hit delta=9.09 pp (95% CI [-9.09, 27.27] pp), regret reduction=12.9091, normalized regret delta=-0.0654, material=false | hit delta=3.03 pp (95% CI [0.00, 9.09] pp), regret reduction=1.3636, normalized regret delta=-0.0129, material=false | hit delta=6.06 pp (95% CI [-15.15, 24.24] pp), regret reduction=11.5455, normalized regret delta=-0.0526, material=false |
| B | NON_RETREAT | 2 | 3514 | hit delta=0.34 pp (95% CI [0.06, 0.60] pp), regret reduction=0.2302, normalized regret delta=-0.0008, material=false | hit delta=1.22 pp (95% CI [0.63, 1.76] pp), regret reduction=0.9624, normalized regret delta=-0.0052, material=false | hit delta=0.88 pp (95% CI [0.28, 1.45] pp), regret reduction=0.7322, normalized regret delta=-0.0044, material=false | hit delta=0.57 pp (95% CI [0.28, 0.91] pp), regret reduction=0.4869, normalized regret delta=-0.0045, material=false | hit delta=0.31 pp (95% CI [-0.34, 1.00] pp), regret reduction=0.2453, normalized regret delta=0.0002, material=false |
| B | NON_RETREAT | 3 | 140 | hit delta=-7.14 pp (95% CI [-12.14, -2.86] pp), regret reduction=-9.6214, normalized regret delta=0.0564, material=false | hit delta=-6.43 pp (95% CI [-11.43, -1.43] pp), regret reduction=-5.8714, normalized regret delta=0.0447, material=false | hit delta=0.71 pp (95% CI [-5.00, 6.43] pp), regret reduction=3.7500, normalized regret delta=-0.0118, material=false | hit delta=1.43 pp (95% CI [-1.43, 4.29] pp), regret reduction=1.9286, normalized regret delta=-0.0145, material=false | hit delta=-0.71 pp (95% CI [-6.43, 5.71] pp), regret reduction=1.8214, normalized regret delta=0.0028, material=false |
| B | HORIZON_DEPENDENT | 2 | 2046 | hit delta=-1.52 pp (95% CI [-2.15, -0.93] pp), regret reduction=-1.5210, normalized regret delta=0.0130, material=false | hit delta=-1.91 pp (95% CI [-2.88, -0.83] pp), regret reduction=-1.2165, normalized regret delta=0.0143, material=false | hit delta=-0.39 pp (95% CI [-1.37, 0.64] pp), regret reduction=0.3045, normalized regret delta=0.0013, material=false | hit delta=0.98 pp (95% CI [0.39, 1.61] pp), regret reduction=0.7590, normalized regret delta=-0.0072, material=false | hit delta=-1.37 pp (95% CI [-2.49, -0.24] pp), regret reduction=-0.4545, normalized regret delta=0.0085, material=false |
| B | HORIZON_DEPENDENT | 3 | 92 | hit delta=-10.87 pp (95% CI [-18.48, -4.35] pp), regret reduction=-12.4783, normalized regret delta=0.0722, material=false | hit delta=-11.96 pp (95% CI [-19.57, -5.43] pp), regret reduction=-10.4022, normalized regret delta=0.0735, material=false | hit delta=-1.09 pp (95% CI [-9.78, 7.61] pp), regret reduction=2.0761, normalized regret delta=0.0013, material=false | hit delta=2.17 pp (95% CI [-2.17, 6.52] pp), regret reduction=2.9674, normalized regret delta=-0.0222, material=false | hit delta=-3.26 pp (95% CI [-13.04, 5.43] pp), regret reduction=-0.8913, normalized regret delta=0.0235, material=false |

## Testing and reproduction

    {
      "checks": {
        "CANONICAL_NUMERICS": true,
        "INHERITANCE_BOUND": true,
        "OPEN_PHASE_BOUND": true,
        "FROZEN_BEFORE_SEALED": true,
        "SEALED_INTEGRITY": true,
        "INTEGRITY": true,
        "TESTS_PASS": true,
        "FULL_SUITE_PASS": true,
        "AUTHORITY_R0": true
      },
      "integrity": {
        "evidenceFidelity": true,
        "unknownPropagation": true,
        "D4": true,
        "identityRenaming": true,
        "observableBoundary": true,
        "poisonInvariant": true,
        "candidateOrder": {
          "FROZEN": true,
          "LINEAR": true,
          "INTERACTION": true,
          "DEPLOYABLE_D0": true,
          "DEPLOYABLE_D1": true,
          "DEPLOYABLE_D2": true,
          "DEPLOYABLE_D3": true,
          "KNOWN_D2": true,
          "KNOWN_D3": true,
          "NO_ENV_D2": true,
          "NO_HOSTILE_D2": true,
          "NO_HAZARD_D2": true,
          "NO_ENV_D3": true,
          "NO_HOSTILE_D3": true,
          "NO_HAZARD_D3": true
        },
        "symmetrySample": 542
      },
      "tests": {
        "exitCode": 0,
        "pass": 6,
        "fail": 0
      },
      "suite": {
        "inheritance": {
          "stage3g12": {
            "exitCode": 0,
            "reproduced": true,
            "script": "scripts/certify-stage3g-predictive-integrity.mjs"
          },
          "stage3g3": {
            "exitCode": 0,
            "reproduced": true,
            "script": "scripts/stage3g3/certify.mjs"
          },
          "stage3f": {
            "exitCode": 0,
            "reproduced": true,
            "script": "scripts/stage3f-freeze-certify.mjs"
          },
          "stage3g4": {
            "exitCode": 0,
            "reproduced": true,
            "script": "scripts/stage3g4/certify.mjs"
          }
        },
        "platform": {
          "exitCode": 0,
          "pass": 2337,
          "fail": 0,
          "skipped": 1
        },
        "lab": {
          "exitCode": 1,
          "pass": 33,
          "fail": 7,
          "skipped": 0
        },
        "overlay": {
          "exitCode": 0,
          "pass": 23,
          "fail": 0,
          "cause": null
        },
        "policy": "Platform and inheritance gating; historical lab/root overlay outcomes fully disclosed, unchanged from inherited stages."
      },
      "data": {
        "rows": 15200,
        "contentHash": "2430e1f03b965600469016f8e9ec332c34f4642952f70b9d195957816d4e5d57",
        "overlaps": {
          "recordHash": 0,
          "worldHash": 0,
          "topologyHash": 0
        },
        "duplicates": {
          "recordHash": 0,
          "worldHash": 0,
          "topologyHash": 0
        },
        "balance": {
          "STAGE3G5_A:L0:H0": 190,
          "STAGE3G5_A:L0:H1": 190,
          "STAGE3G5_A:L0:H2": 190,
          "STAGE3G5_A:L0:H3": 190,
          "STAGE3G5_A:L0:H4": 190,
          "STAGE3G5_A:L1:H0": 190,
          "STAGE3G5_A:L1:H1": 190,
          "STAGE3G5_A:L1:H2": 190,
          "STAGE3G5_A:L1:H3": 190,
          "STAGE3G5_A:L1:H4": 190,
          "STAGE3G5_A:L2:H0": 190,
          "STAGE3G5_A:L2:H1": 190,
          "STAGE3G5_A:L2:H2": 190,
          "STAGE3G5_A:L2:H3": 190,
          "STAGE3G5_A:L2:H4": 190,
          "STAGE3G5_A:L3:H0": 190,
          "STAGE3G5_A:L3:H1": 190,
          "STAGE3G5_A:L3:H2": 190,
          "STAGE3G5_A:L3:H3": 190,
          "STAGE3G5_A:L3:H4": 190,
          "STAGE3G5_A:L4:H0": 190,
          "STAGE3G5_A:L4:H1": 190,
          "STAGE3G5_A:L4:H2": 190,
          "STAGE3G5_A:L4:H3": 190,
          "STAGE3G5_A:L4:H4": 190,
          "STAGE3G5_A:L5:H0": 190,
          "STAGE3G5_A:L5:H1": 190,
          "STAGE3G5_A:L5:H2": 190,
          "STAGE3G5_A:L5:H3": 190,
          "STAGE3G5_A:L5:H4": 190,
          "STAGE3G5_A:L6:H0": 190,
          "STAGE3G5_A:L6:H1": 190,
          "STAGE3G5_A:L6:H2": 190,
          "STAGE3G5_A:L6:H3": 190,
          "STAGE3G5_A:L6:H4": 190,
          "STAGE3G5_A:L7:H0": 190,
          "STAGE3G5_A:L7:H1": 190,
          "STAGE3G5_A:L7:H2": 190,
          "STAGE3G5_A:L7:H3": 190,
          "STAGE3G5_A:L7:H4": 190,
          "STAGE3G5_B:L0:H0": 190,
          "STAGE3G5_B:L0:H1": 190,
          "STAGE3G5_B:L0:H2": 190,
          "STAGE3G5_B:L0:H3": 190,
          "STAGE3G5_B:L0:H4": 190,
          "STAGE3G5_B:L1:H0": 190,
          "STAGE3G5_B:L1:H1": 190,
          "STAGE3G5_B:L1:H2": 190,
          "STAGE3G5_B:L1:H3": 190,
          "STAGE3G5_B:L1:H4": 190,
          "STAGE3G5_B:L2:H0": 190,
          "STAGE3G5_B:L2:H1": 190,
          "STAGE3G5_B:L2:H2": 190,
          "STAGE3G5_B:L2:H3": 190,
          "STAGE3G5_B:L2:H4": 190,
          "STAGE3G5_B:L3:H0": 190,
          "STAGE3G5_B:L3:H1": 190,
          "STAGE3G5_B:L3:H2": 190,
          "STAGE3G5_B:L3:H3": 190,
          "STAGE3G5_B:L3:H4": 190,
          "STAGE3G5_B:L4:H0": 190,
          "STAGE3G5_B:L4:H1": 190,
          "STAGE3G5_B:L4:H2": 190,
          "STAGE3G5_B:L4:H3": 190,
          "STAGE3G5_B:L4:H4": 190,
          "STAGE3G5_B:L5:H0": 190,
          "STAGE3G5_B:L5:H1": 190,
          "STAGE3G5_B:L5:H2": 190,
          "STAGE3G5_B:L5:H3": 190,
          "STAGE3G5_B:L5:H4": 190,
          "STAGE3G5_B:L6:H0": 190,
          "STAGE3G5_B:L6:H1": 190,
          "STAGE3G5_B:L6:H2": 190,
          "STAGE3G5_B:L6:H3": 190,
          "STAGE3G5_B:L6:H4": 190,
          "STAGE3G5_B:L7:H0": 190,
          "STAGE3G5_B:L7:H1": 190,
          "STAGE3G5_B:L7:H2": 190,
          "STAGE3G5_B:L7:H3": 190,
          "STAGE3G5_B:L7:H4": 190
        },
        "seedAudit": {
          "seeds": [
            7021,
            7031,
            6012
          ],
          "priorRowOverlap": [],
          "stillReservedTouched": [],
          "fitInPriorSeedSpaces": false,
          "familiesDistinct": true
        },
        "planBound": true,
        "seedPlanBound": true,
        "balanced": true
      },
      "freeze": {
        "generationCommit": "b3d4c06b48ccf173cbd0e9afc1b08e75095d30f0",
        "planOpenFitAtGeneration": true,
        "drift": [],
        "FROZEN_BEFORE_SEALED": true
      }
    }

The platform and inherited certificate checks gate certification. The full lab and root overlay suites were also run; their historical failures are disclosed in the suite record and were not changed by this stage. Two local read-only certificate checks and a fresh clone independently rebuilding all Stage 3G.5 fit, sealed and evidence payloads reproduce the certificate. Only earlier-stage hash-bound input payloads were imported to the clone. Check mode may not mutate tracked state.

## Plain-language findings

1. **Level-balanced training closed the registered high-level gap.** HIGH optimal-set hit rose from 91.34% to 97.32% in A and 88.55% to 95.60% in B: +5.97 pp (95% CI 4.92–7.08) and +7.04 pp (5.78–8.31). Normalized regret fell in both families. The remaining fitted known-D2 advantage over balanced scoring did not reach the registered materiality threshold. “Closed” means this criterion passed; it is not proof of zero error or formal equivalence. The interaction diagnostic was worse than the linear model overall, so no nonlinear promotion is justified.

2. **Deployable search preserves most of the measured hit performance but adds no overall gain beyond balanced scoring.** On matched guarded D2 rows, deployable/known hit was 87.19%/88.57% in A (n=4,172) and 87.99%/88.70% in B (n=4,204). Deployable D2 was 0.74/0.71 pp worse than the balanced root scorer; mean regret rose by 0.811/0.744. Its 1.38/0.71 pp known-model deficit was below the registered five-point threshold. DEPLOYABLE_BOUNDED_SEARCH_SUFFICIENT=true therefore means no registered material residual, not that deeper search improves decisions. Depth3 is secondary and sparse, especially retreat (28/33 rows), and does not support a broad sufficiency claim across all horizons or action surfaces.

3. **Environment knowledge has a small measured benefit, not a material replicated benefit.** The matched environment intervention added 0.93/0.69 pp hit and reduced regret by 11.54%/9.49% in A/B. These fail the five-point hit and 20% regret gates. The larger raw known-versus-deployable gap also contains private values, scorer differences and incomplete continuation coverage; it cannot all be assigned to forecasting. ENVIRONMENT_DYNAMICS_VALUE_OOD_STABLE=false means no material effect replicated under the gate, not an absence of every small effect. B tests fresh seeds within known compositions; unseen-mechanism OOD remains untested.

4. **Hostile attacks account for a small causal decision benefit in the fixed search intervention.** Their pooled ablation changed 1.44% of decisions and reduced mean regret by 0.662; matched hazard removal changed none. Frequencies (60.88% attack, 6.92% hazard) are root-exposure frequencies, not counts of all future transitions. Entity-state-change rows cover 62.86% and show an associated upper-bound gap, but that overlapping observational analysis is noncausal and nonadditive. Service reversal, resource state change and OTHER have no qualifying root exposure here; their decision effects are not estimable rather than proved absent. Each effect’s exposure concentration in retreat is reported above and is not causal regret allocation.

5. **Retreat remains a harder regime, but is not the dominant remaining regret mass.** Balanced retreat hit is 85.95%/86.24%, below non-retreat’s 89.97%/89.25%. Retreat accounts for 20.81%/24.57% of balanced total regret, and 43.13% of pooled positive known-versus-deployable regret advantage, below the preregistered 80% specialist concentration gate. The largest replicated improvement came from level coverage: retreat hit gained 20.72/23.40 pp and regret fell 77.84%/76.78%.

6. **The evidence classifies retreat as level-coverage limited; it does not establish a forecasting bottleneck.** RETREAT_LEVEL_COVERAGE_LIMITED is the only replicated registered attribution flag. Navigation search actually worsened retreat versus balanced scoring. The matched dynamics gain was 3.22 pp in A and 1.30 pp in B; neither passed materiality, and B’s interval includes zero. Deterministic target-action continuation alternatives are still open, so an observable planning and action-surface audit is warranted before forecasting work. This stage did not repair retreat.

7. **Transition prediction is not justified now.** No matching stratum passes the complete replicated environment-dynamics gate after level balancing.

8. **A learned world model is not justified now.** Material replicated dynamics value is absent under the registered rule, structural OOD is untested, and deterministic target-action alternatives were not exhausted. No world model was trained.

9. **Oracle is not established as required on the critical path.** ORACLE_TEMPORAL_CAPABILITY_NOW_REQUIRED=false. This experiment did not test the architectural placement or fitness of the existing Oracle expert. Oracle, Router and the expert roster were not redesigned.

10. **Run next: Stage 3G.6 — Observable planning and action-surface sufficiency audit (no learned world model).** This is the registered recommendation; it has not been started. Stage 3I remains unstarted. R0 authority and all four runtime prohibitions remain unchanged.

## Reproduction evidence

The certificate hash is `d472f04f00560229f20020f030722fdf3981f91155424d0a7a2004662be768da`. All nine certification checks pass. The stage’s six fidelity/invariance tests pass. The platform suite has 2,337 passes, zero failures and one skip. The root overlay has 23 passes and zero failures. The full legacy lab suite has 33 passes and seven failures; it is not an all-repository-green result.

- [Stored certificate](../artifacts/stage3g5-observable-model-search/stage3g5-certification-result.json)
- [Two read-only checks](../artifacts/stage3g5-observable-model-search/stage3g5-two-checks.json)
- [Independent clone proof](../artifacts/stage3g5-observable-model-search/stage3g5-reproduction-proof.json)
- [Inherited command proofs](../artifacts/stage3g5-observable-model-search/stage3g5-inheritance-reproduction.json)
- [Full-suite results](../artifacts/stage3g5-observable-model-search/stage3g5-full-suite.json)
- [Seed quotas and sealed manifest](../artifacts/stage3g5-observable-model-search/sealed-partitions-manifest.json)

All inherited checks returned exit zero and reproduced=true. Two sequential local checks and the independent clone check returned PASS and reproduced the entire certificate. The clone independently rebuilt the OPEN fit/report, the 15,200-row sealed corpus and all 13,834 eligible sealed search-evidence records. Only ancestor payloads were imported. Sealed corpus hash: `2430e1f03b965600469016f8e9ec332c34f4642952f70b9d195957816d4e5d57`. Evidence hashes: A `e357254a75ad7acd48a0e59d262c3fec86c5e24fbcdd71ce4becf3c48108132b`, B `ddfafefc7a96e975c4065d9bd37e94e8d39766a89898704d048944efe5bf075f`. OPEN fitting/report bytes matched independently. Check mode did not mutate tracked state. Execution checkpoints and partitioning preserved frozen per-row evidence and the preregistered D3 sample; there was exactly one sealed performance evaluation, followed by identical reproduction checks.

From the platform/game-agnostic directory, the certificate reproduction command is:

```sh
node scripts/reproducibility/run-canonical.mjs scripts/stage3g5/certify.mjs --check
```

The clone additionally ran the frozen `generate.mjs --verify` and rebuilt evidence using the unchanged row-evidence function. The proof records imported ancestor paths, input/evidence hashes, checkpoint-helper hash and independent OPEN cache namespace verification. The staged source/manifest freeze is checked against the pre-generation commit, not inferred from file dates.

## Legacy lab failure disclosure

The seven failing files are:

- `tests/stage1az1-recovered-lineage-certification.test.js`
- `tests/stage1az1-sentinel-prime-policy-evaluation-contract.frozen.test.js`
- `tests/w0af-forest-defensive-action-contract.test.js`
- `tests/w0p-live-parity-contract.test.js`
- `tests/w0p1-forest-defensive-command-contract.test.js`
- `tests/w0p2-forest-defensive-command-contract.test.js`
- `tests/w0p3-live-parity-closure-contract.test.js`

The recovered-lineage test has a stored ZekNova digest mismatch; the other six have frozen-versus-provisional manifest-status expectations. The entire tracked `sgrid-lab` tree is unchanged from Stage 3G.4. These results are preserved, not repaired in this stage. [Failure disclosure](../artifacts/stage3g5-observable-model-search/stage3g5-legacy-lab-disclosure.json) records the canonical diagnostic log hash and unchanged-tree comparison.
