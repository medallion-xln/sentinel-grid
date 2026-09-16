# Stage 3F.6 — Prediction Reliability Baseline v1

`SENTINEL_PREDICTION_RELIABILITY_BASELINE_V1` measures what the certified Stage 3F.5 runtime actually predicts, how reliable those predictions are, and whether the Stage 3E routing precision ceiling is router-limited or world-understanding-limited. It is a measurement stage: nothing trains, fits, updates weights, retrains the router, dispatches, or mutates a world.

```text
GOOD_FINAL_OUTCOME != GOOD_WORLD_MODEL
GOOD_PREDICTION_FOR_WRONG_REASON != RELIABLE_PREDICTION
PREDICTED != OBSERVED
AUTHORITY=R0  CAN_DISPATCH=false  CAN_MUTATE_LIVE_WORLD=false  INCUMBENT_SOLE_EXECUTOR=true
MODEL_TRAINING_PERFORMED=false  WEIGHTS_UPDATED=false  ROUTER_RETRAINED=false  ONLINE_LEARNING_ENABLED=false
```

## Evidence bases

**Layer A — frozen Stage 3E decision points (n = 20,000).** `scripts/generate-stage3f6-evaluation-corpus.mjs` rebuilds every Stage 3E curriculum combination with the canonical record builder and keeps exactly the cases in the frozen `ROUTABILITY_DEV/CAL/HOLDOUT/OOD` matrices, joined by `recordHash`. Each compact case holds combination and world identity, World State v1 fact values, authoritative branch evidence (immediate V2 scalar, horizon total, regret), the contract and runtime greedy actions, and the Stage 3F.5 runtime feature values that differ from the frozen matrix row. It contains no labels, scores, or metrics. The gzip is content-addressed by `evaluation-corpus-manifest.json`, is byte-identical across worker counts, and is spot-replayed by the certifier.

**Layer B — governed integrated-runtime episodes.** A predeclared, hash-ordered subset (DEV 100, CAL 100, HOLDOUT 300, OOD 300) is executed through the unmodified Stage 3F.5 runtime. The incumbent is the runtime greedy action and executes exactly once. Experiences are evaluated for `PREDICTION_CALIBRATION` eligibility and frozen with the Stage 3F.4 `freezeExperienceSnapshot` into shards of 50, because buffer append re-verifies every entry and is quadratic. `SENTINEL_STAGE3F6_EVALUATION_SNAPSHOT_V1` binds the ordered shard snapshot IDs and digests into one snapshot identity.

## Discipline

Partitions are the Stage 3E splits. Leakage is checked on episode (`recordHash`), state (`worldHash`), and derived variant (`topologyHash`) identity across every partition pair, plus temporal and future-to-past ordering for every Layer B episode.

`STAGE3F6_METHODOLOGY` declares, before any sealed scoring:
- quality rules;
- confidence binning;
- high-confidence thresholds;
- tiers and the n ≥ 200 Wilson evidence floor;
- tier selection on CAL;
- novelty representation, with thresholds taken from CAL-to-DEV nearest-neighbour quantiles;
- proxy-fidelity buckets;
- the degradation set;
- calibration variants;
- attribution precedence;
- correct-for-wrong-reason and compensation definitions;
- diagnosis rules.

The methodology hash is bound into the contract hash and into the evaluation freeze. `createPartitionAccess` refuses HOLDOUT/OOD access without a verified freeze naming the exact partition identity, and it logs every access. Pre-freeze exposure is disclosed in the freeze record instead of being hidden.

## Prediction quality

The categories are `EXACT`, `APPROXIMATELY_CORRECT` (|error| ≤ max(1, 5% of |actual|)), `DIRECTIONALLY_CORRECT` (same sign of change from the decision-time value), `WRONG`, `INCOMPARABLE`, and `UNKNOWN`. Approximate predictions never count as exact.

`bindPredictionToOutcome` fails safely:
- **UNKNOWN:** missing prediction, malformed prediction record, missing outcome.
- **INCOMPARABLE:** malformed value, environment mismatch, non-decision-time prediction, prediction generated after the decision or outcome, conflicted outcome, insufficient calibration, identity facts.
- **Confidence:** missing or invalid confidence is counted, never scored.

## Router evidence: two equations, measured separately

The frozen Stage 3E logistic model stores its bias as the last weight. The Stage 3F.5 runtime evaluates `w[0]` as bias and `w[i+1]` as weights. The contract path uses the canonical equation over matrix features and must reproduce the published Stage 3E CAL, HOLDOUT, and OOD results exactly. The runtime path uses the runtime equation over runtime features, exactly as the certified runtime executes it.

Each case is decomposed into contract, full runtime, runtime-features-with-canonical-equation, derivation-only, candidate-only, and equation-only routes. This separates three intermediate errors:
- feature derivation;
- router equation;
- action binding (the runtime greedy action is not the labeled greedy action).

## Observatory

```sh
npm run observatory -- --view PREDICTION
npm run observatory -- --view PREDICTION --episodes 5 --index 0
npm run observatory -- --view WORLD        # legacy views unchanged
npm run observatory:v1 -- --view WORLD     # certified Stage 3F.5 CLI, untouched
```

The PREDICTION view shows the following for the current episode:
- the reference World State baseline's predicted and actual next state, with quality and attribution;
- decision-time one-step consequence components against the executed transition, clearly marked privileged;
- router confidence and its reliability bin;
- the predictor-evidence confidence, labeled a constant placeholder;
- router and recommendation abstention;
- state novelty and calibration condition;
- counterfactual kind, and whether it is scorable;
- World State domain coverage;
- certified aggregates read from the Stage 3F.6 artifact.

Legacy views are delegated to the unmodified certified v1 observatory. The surface is read-only, frames are bounded, and a disconnected or slow consumer only drops frames.

## Commands

```sh
npm run stage3f6:generate   # rebuild the evaluation corpus (~10 min, 8 workers)
npm run stage3f6:certify    # certify and write artifacts
npm run stage3f6:check      # reproduce the certification byte-for-byte
npm run test:stage3f6
```

## Results (certified run, freeze `14548e37…`)

Full evidence is in `artifacts/stage3f6-prediction-reliability/stage3f6-certification-result.json`. Status is `PARTIAL`: every measurement exit criterion holds, but predecessor `--check` commands do not reproduce in the current environment. The cause is an ephemeral foreign-session scratch adapter directory that is present without weight files. In-repo canonical bytes are identical.

**What Sentinel predicts.**
- **Router P(GREEDY_SAFE).** Available, with confidence but no uncertainty interval.
- **Decision-time one-step consequence vectors.** Available but privileged: they come from simulator lookahead, not a learned model.
- **Candidate action.** Carries a constant 0.5 placeholder confidence.
- **Not available:** next-state, failure-probability, transition-identity, counterfactual value/risk, and multi-step predictions.
- **Nexus confidence:** insufficient evidence, because it measures observed structure, not correctness.

**One-step (sealed Layer B, 428 episodes, 4,280 comparable components).**
- Exact accuracy is 1.000 (Wilson lower 0.9991).
- Relationships and spatial state have no predictions at all.
- Constraints are INCOMPARABLE, because constraint semantics are uncalibrated.
- This is exact by construction: the predictor reads the authoritative simulator.

**Reference World State baseline.**
- Exact accuracy on non-identity facts is 0.80; approximate-or-better is 0.992.
- Energy is never exact, because the calibration declares no resource costs. All of its errors are attributed to `CALIBRATION_ERROR`.

**Router, contract path (canonical equation).** Stage 3E replay is exact.

| Metric | HOLDOUT (quarantined) | OOD |
|---|---|---|
| Precision at τ=0.9 | 0.780 (n=341, Wilson lower 0.733, coverage 0.058) | 0.910 (n=881, Wilson lower 0.890) |
| Brier | 0.097 | — |
| ECE | 0.049 | — |
| High-confidence wrong at 0.90 | 0.220 | 0.090 |

**Router, Stage 3F.5 runtime path.**
- Precision is 0.245 on HOLDOUT (n=3,959), with ECE 0.575 and high-confidence-wrong at 0.90 of 0.755.
- The route disagrees with the contract route in 66% of cases. 99.5% of runtime false-safes are attributed to `RUNTIME_ROUTER_EQUATION_DIVERGENCE`.
- Among correct runtime routes, 99.4% are correct for the wrong reason.

**Reliability tiers.** No tier is evidence-supported on any path, because no CAL operating point reaches Wilson lower ≥ 0.80 at n ≥ 200.

**Novelty.** Contract reliability falls with novelty while confidence rises. Over HOLDOUT+OOD, false-safe rate goes from 0.098 (familiar) to 0.203 (strongly novel), and mean confidence goes from 0.19 to 0.43.

**Uncertainty.**
- **Observation degradation.** Removing threat, objective, or relationship evidence lowers runtime confidence, while resource, spatial, and one-step-stale observation changes are invisible, because the features read privileged state.
- **Calibration.** No prediction changes under any calibration variant; calibration gates comparability and eligibility only.

**Router/prediction relationship.** Contract false-safe rate is 0.300 when one-step proxy fidelity is high and 0.205 when it is low (HOLDOUT). On OOD it is 0.151 versus 0.087. Errors are not concentrated in prediction-uncertain states. No case has a complete World State, so the complete-state comparison is not evidenced.

**Representation.**
- World State v1 is an information subset of the Stage 3E features (100% of cases).
- It is highly ambiguous: 92% of cases in evidenced classes carry mixed labels.
- The full world state determines the label with zero ambiguity.

**Diagnosis (corrected wording, prospective).** The certified PARTIAL artifact (`399f71c9…`) is preserved unchanged as evidence of the discovery process. Its recorded share-rule output (primary C_PREDICTION_LIMITED, secondary A_ROUTER_LIMITED) overstated what was isolated:
- the runtime path was confounded by the router equation misbinding;
- the conditional rates contradict the C share;
- one-step evidence is simulator-exact, so no prediction error was measured;
- the contract-path features include horizon rollout information.

```text
PRIMARY_DIAGNOSIS=G_MIXED_LIMITATION_RUNTIME_PARITY_CONFOUNDED
ROUTER_VS_REPRESENTATION_DIAGNOSIS=H_INSUFFICIENT_EVIDENCE
CAPABILITY_GAP=NO_NON_PRIVILEGED_CONSEQUENCE_PREDICTOR
WORLD_STATE_RESULT=NO_MEASURED_IMPROVEMENT
WORLD_STATE_CANNOT_HELP=NOT_ESTABLISHED
```

No World State predictor exists and World State reliability was never directly tested. Only the thin 5-of-8-domain runtime projection was measured, and it is an information subset of the Stage 3E features.

**Follow-up.** Runtime parity defects are handled by `STAGE_3F_6_R_RUNTIME_PARITY_REMEDIATION`, a remediation gate rather than a new architectural stage (see `docs/STAGE3F6R_RUNTIME_PARITY_REMEDIATION.md`). A confirmatory Stage 3F.6 requires new topology-disjoint HOLDOUT and OOD splits from a disjoint seed space. Stage 3G remains blocked.
