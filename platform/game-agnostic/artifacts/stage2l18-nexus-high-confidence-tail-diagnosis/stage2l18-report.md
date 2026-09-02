# Stage 2L.18 — Nexus high-confidence tail error isolation and delegation-boundary diagnosis

**Status: PASS** (diagnostic) · `STAGE2L18_OUTCOME = D_REPRESENTATION_LIMIT_IDENTIFIED`
`NEXUS_TAIL_IDENTIFIABILITY_STATUS = REPRESENTATION_INSUFFICIENT`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.
**Nexus behaviour changed: no.** No expert edit, no new confidence rule, no threshold.

> The entire high-confidence wrong tail is **six cases** across all three splits —
> four in DEVELOPMENT, one in CALIBRATION, one in FINAL_HOLDOUT. A bounded search
> over 34 decision-time features did find a rule, and that rule is
> **indistinguishable from noise**: its lift of 0.2311 sits exactly at the
> permutation null's 95th percentile, below its 99th (0.2543), and it retains only
> a third of its lift out of sample. The tail is not separable with the
> information currently available to the expert.

## Baseline

All eight prior certifications reproduce byte-identically. Stage 2L.17 certified,
accuracy 0.829108, delegation precision 0.989474, one harmful change in 95
delegations. The frozen rule this stage reports on is checked against Stage
2L.17's own artifact and refuses to run if it differs.

## The tail population

| | count |
|---|---|
| decidable cases | 15,817 |
| structurally eligible | 7,918 |
| **confidence eligible** (frozen rule) | **310** |
| delegation candidates (rule ∧ moves Prime) | 266 |
| HIGH_CONF_CORRECT | 304 |
| **HIGH_CONF_WRONG** | **6** |
| Nexus correct / Prime wrong | 260 |
| Nexus wrong / Prime correct | 3 |
| both correct | 44 |
| both wrong | 3 |

By split: DEVELOPMENT 85 cases / 4 wrong · CALIBRATION 116 / 1 · FINAL_HOLDOUT 109 / 1.

**This is the stage.** Every subsequent number is computed on six positives, or on
a declared wider band, and is reported with its sample size attached. Shares over
six cases are sixths, and are labelled as counts rather than rates.

### Two populations, both declared in advance

- **PRIMARY_TAIL** — the frozen Stage 2L.17 rule, imported and never relaxed.
  310 cases, 6 wrong. Each wrong case is explained individually rather than
  summarised.
- **SECONDARY_BAND** — `risk>=400000 & margin>=100000`, the immediate superset
  obtained by dropping exactly one term: the marginVariance constraint, the newest
  and least supported of the three. Chosen by that principle before its numbers
  were seen. 1,649 cases, 35 wrong. It exists so the feature audit and separability
  search have enough positives to say anything at all.

## The six cases

| variant | split | topology / profile | Nexus | optimal | Prime right? | class | optimal rank |
|---|---|---|---|---|---|---|---|
| 1824 | DEV | PROTECTED_CRITICAL_NODE / RISK_DOMINATED | PROTECT | RESTORE | yes | COST_VALUE_TRADEOFF | 2 |
| 7822 | DEV | COMPETING_CRITICAL_PATHS / RISK_DOMINATED | PROTECT | RESTORE | no | SINGLE_PASS_APPROXIMATION | 5 |
| 7894 | DEV | MULTI_COMPONENT / RISK_DOMINATED | PROTECT | PROTECT | yes | SINGLE_PASS_APPROXIMATION | 2 |
| 10490 | DEV | DECOY_HIGH_DEGREE / RISK_DOMINATED | PROTECT | RESTORE | no | COST_VALUE_TRADEOFF | 5 |
| 21915 | CAL | COMPETING_CRITICAL_PATHS / RISK_DOMINATED | PROTECT | RESTORE | no | THRESHOLD_BOUNDARY | 5 |
| 39126 | HOLD | MULTI_COMPONENT / RISK_DOMINATED | PROTECT | RESTORE | yes | COST_VALUE_TRADEOFF | 4 |

All six are `RISK_DOMINATED`. Five of six choose PROTECT where RESTORE was
optimal. Full component scores, both rankings, substitute state and the objective
decomposition of why the optimum won are in `stage2l18-tail-corpus.json`.

## A structural fact that constrains the whole question

**The delegation region contains only PROTECT actions — 310 of 310.**

This is not a finding about the errors; it is arithmetic. The frozen rule gates on
`nexusTopRiskAdjustment >= 400000`, and the expert assigns a non-zero risk
adjustment *only* to PROTECT:

```js
const riskAdjustment = action.kind === 'PROTECT' ? exposure : 0;
```

So the region is PROTECT-only by construction. "Which action carries the tail
errors" therefore has exactly one possible answer and no contrast to measure it
against: `ACTION_SPECIFIC_DEFECT` is structurally unanswerable here, and the
certification records it as such rather than reporting PROTECT at 100% as though
it were evidence.

| action | n | correct | wrong | precision | Wilson LB |
|---|---|---|---|---|---|
| PROTECT | 310 | 304 | 6 | 0.980645 | 0.963013 |
| RESTORE / REINFORCE / BYPASS / HOLD | 0 | — | — | — | — |

## Tail taxonomy — and it is not the global one

Stage 2L.16's classifier, unchanged.

| class | tail (n=6) | secondary band (n=35) | global (n=2,703) |
|---|---|---|---|
| COST_VALUE_TRADEOFF | **3** | 16 (45.7%) | — |
| SINGLE_PASS_APPROXIMATION | 2 | **17 (48.6%)** | **dominant** |
| THRESHOLD_BOUNDARY | 1 | 1 | — |
| CYCLE_PROPAGATION | 0 | 1 | — |

`TAIL_EXPLAINED_SHARE = 1.0`; nothing falls to OTHER. The tail's leading class
(`COST_VALUE_TRADEOFF`) is **not** the global leader (`SINGLE_PASS_APPROXIMATION`),
which is exactly why the brief asked for both — but with three cases against two,
that ordering is a coin toss and is reported as counts.

## Propagation is not the tail mechanism

| | wrong | correct |
|---|---|---|
| cases with a propagation disagreement | 0.8333 | 0.8783 |
| mean disagreements per case | 3.83 | 2.65 |

The wrong cases are *less* likely to show a propagation disagreement, not more.
And the Stage 2L.16 iterative probe applied to this region **fixes 0 and breaks 0**
— it does not touch the tail at all. `PROPAGATION_LIMIT_DETECTED = false`. This is
consistent with Stage 2L.17, which measured the same probe at net −93 globally.

## Value diffusion is absent from this region

Every case in the tail — correct and wrong alike — has value concentration
1,000,000 and exactly one value-bearing entity. The feature has **no variance
here**, so it cannot separate anything. `VALUE_MODEL_LIMIT_DETECTED = false`, and
the reason is absence of contrast rather than a measured null result.

## Matched controls

Reported at three declared tiers, because strict matching on six cases matches
almost nothing:

| tier | dropped | matched |
|---|---|---|
| STRICT | — | 1 / 6 |
| NO_TOPOLOGY | family | 4 / 6 |
| COARSE | family, value band, risk band | 5 / 6 |

`poweredForInference = false` at every tier. This is a description of six cases,
not a test.

## The separability test, and the null that judges it

Search: bounded interpretable rules, one to three feature thresholds, discovered
on DEVELOPMENT only, carried unchanged to CALIBRATION and FINAL_HOLDOUT. Run on
the secondary band (14 development positives; the primary tail's four would be
pure noise).

Best rule found:

`nexusTopRiskAdjustment <= 526975 & positiveUtilityCandidateCount <= 2`

| split | n | wrong | wrong-rate | complement | lift | retention |
|---|---|---|---|---|---|---|
| DEVELOPMENT | 20 | 5 | 0.2500 | 0.0189 | **0.2311** | — |
| CALIBRATION | 31 | 3 | 0.0968 | 0.0200 | 0.0768 | 33.2% |
| FINAL_HOLDOUT | 25 | 2 | 0.0800 | 0.0091 | 0.0709 | 30.7% |

### The null — same search, shuffled labels

An earlier draft of this stage compared a *conjunction* search against a
*single-term* null. That is a rigged comparison: the observed search explores a
strictly larger space, so its best lift is inflated relative to the threshold it
is judged against, and it manufactured a signal. Corrected, the null re-runs the
**identical greedy conjunction search** over 200 label permutations.

| | lift |
|---|---|
| null median | 0.1789 |
| **null p95** | **0.2311** |
| null p99 | 0.2543 |
| null max | 0.2895 |
| **observed** | **0.2311** |

The observed lift lands **exactly on the null's 95th percentile**. The search
finds a rule this good on shuffled labels one time in twenty.

### The verdict, on two criteria declared in advance

A signal counts only if it (1) clears the null **p99**, not p95 — at this
multiplicity p95 is routinely reached by chance — and (2) retains at least half
its development lift on both later splits, the same discipline Stages 2L.14 and
2L.15 applied.

| criterion | result |
|---|---|
| exceeds null p95 | yes (by a hair — it ties it) |
| **exceeds null p99** | **no** (0.2311 vs 0.2543) |
| **retains ≥50% of lift** | **no** (33.2% / 30.7%) |

It fails **both**, independently. `SEPARABLE_SIGNAL = false`.

## Counterfactual diagnosis

Every one of the six is fixable by a bounded single-field edit — none is a
structural modelling failure:

| classification | count |
|---|---|
| BOUNDARY_ERROR (flips at ≤10%) | 3 |
| RISK_MODEL_ERROR (flips on a risk edit >10%) | 3 |
| STRUCTURAL_MODEL_ERROR | **0** |

Half the tail sits within 10% of a decision boundary. That is consistent with the
separability result: these are not cases with a distinguishing property the expert
failed to look at, they are cases sitting close to the line.

## Diagnosis

`NEXUS_TAIL_IDENTIFIABILITY_STATUS = REPRESENTATION_INSUFFICIENT`
`NEXUS_099_FEASIBILITY = NOT_SEPARABLE_WITH_CURRENT_REPRESENTATION`

The measured root cause is **not a missing mechanism**. Propagation is ruled out
(fixes zero), value diffusion has no variance in the region, and action type has
no contrast by construction. What is missing is **discriminating information**:
across 34 decision-time features, nothing separates six wrong cases from 304
correct ones better than chance does over the same search.

An honest statement of the limit cuts both ways, and both halves matter:

- No separating property was found in the expert-visible state.
- At six positives, a real but moderate effect **could not have been detected** if
  one existed. This is a characterised absence of evidence, not evidence of
  absence.

`RECOMMENDED_REMEDIATION_CLASS = NONE_SUPPORTED_BY_EVIDENCE`. Proposing a fix here
would mean fitting to six cases, which is what every gate in this arc exists to
prevent.

## Safety

Behaviour replay identical on every compared case; ordering invariance holds; no
label leakage; frozen owners unchanged; the diagnostic-discipline scan confirms
this module declares no reliability floor, exports no delegation path and
reassigns no expert function; the frozen rule is verified against Stage 2L.17's
artifact.

## Conclusion

The delegation ceiling is governed by six cases, and six cases cannot be told
apart from the 304 they sit among. Stage 2L.17 already established that the
ceiling does not move with expert accuracy; this stage establishes that it also
does not yield to better confidence rules over the current state representation —
not because the search was too weak, but because at this population size no search
could distinguish a rule from noise.

Per the brief, the tail is characterised and the stage **stops**. Nothing was
remediated.

## Reproduction

```
npm run nexus:stage2l18:certify
npm run nexus:stage2l18:check     # byte-identical reproduction
npm run test:stage2l18-tail-diagnosis
```

`CERTIFICATION_HASH = 9c4c07d5fead5fe80f7895b49c204e0f42d767079f71658d52d7b35f21862ee7`
`EVIDENCE_DIGEST = bfa93936b5c955ed2fe450e2d762c950ad39c017e67f4cbd7e9cb01e582f0c08`

Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM`, inherited from Stages
2L.10–2L.17 and recorded unchanged.
