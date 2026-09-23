# Stage 3F.6-P.1E — Symmetric Policy Requalification

Certification `11dcf65b79679ae8748eed0f5f9f3fdef38223524308aaa353c5b482eed8a031`
Analysis plan `53c05b3aa2f740e7ef5ba5c5f250354c1a30aa58825ab848cffcdc5f73e4366d` · Policy set `57e7c8f1b20e840264be10d4bdb682ce7ffab256af2f2d2e2a7300658273197f`
Open-phase report `a4035e155532c8b589989800d1751da7b6bb3e8752e1fbf6dd227efe78a5693f` · Freeze commit `5e1ea9a`
Corpus `FORGE_SYMMETRIC_V2_ROUTABILITY_CORPUS_V1` `4de383eb…e75e` (20,000 records)

## The question

After the benchmark's directional confound is removed, what policy competence and complementarity remain?
This is the Stage 3F.6-P rerun, the first stage of the Stage 3F.6-P.1D requalification sequence. It measures;
it does not remediate. No policy, router, feature, benchmark or corpus was changed.

## Answer

**PASS: the measurement is valid, and the result is mostly negative.** On sealed HOLDOUT, every deployable policy
lands between 0.17 and 0.37 accuracy. The uniform legal baseline is 0.21. RESOURCE's residual edge consists of the
zero-cost prior plus a fixed absolute-direction tie-break. Nothing in it is resource reasoning. NEXUS V1 is below
chance overall but distinct: it is the only broad-coverage policy that is right when a costly action is optimal.
A perfect selector over the historical routed set recovers **+0.141 accuracy**, which is material, yet it reaches
only **0.397**.

## Protocol

1. **Plan freeze.** The plan, the policy set (the source bytes of every action-deciding module) and all evaluation
   code were committed in `5e1ea9a` together with the DEV/CAL open-phase report. That was before any HOLDOUT or OOD
   policy evidence existed. The sealed evidence generator refuses to run unless those files are committed unchanged
   at HEAD. The certifier checks from git history that the freeze commit contains no sealed artifact and that the
   plan has not changed since.
2. **Open phase (DEV, CAL).** DEV set the regime medians (energy 44, legal actions 7, quartiles 6/7/8). CAL selected
   the best single policy (RESOURCE, the only one with coverage of at least 0.99), the cascade order
   (THREAT → OBJECTIVE → NEXUS V2 → RESOURCE) and each policy's strongest regime.
3. **Sealed phase.** HOLDOUT is the confirmatory partition. OOD (curriculum levels 6–7) tests robustness.
4. **Evidence.** Every corpus row was rebuilt, and the unmodified policies were re-run on exactly the surface that
   Stage 3F.6-P.1D presented. Fidelity is 20,000/20,000 on world, surface and every stored choice, and 820/820 on
   twin mapping. Deterministic replay matches 240/240.

## Results (sealed HOLDOUT, n = 6000)

| Policy | class | coverage | acc [95%] | − uniform [95%] | mean regret | norm. regret | regret ≥ 100 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RESOURCE_PRESERVING_V1 | deployable | 1.000 | 0.256 [0.245, 0.267] | +0.050 [0.039, 0.062] | 51.9 | 0.567 | 0.169 |
| NEXUS_SELECTOR_V1 | deployable | 0.874 | 0.170 [0.160, 0.180] | **−0.037** [−0.047, −0.028] | 47.0 | 0.544 | 0.097 |
| NEXUS_SELECTOR_V2_CANDIDATE | deployable (candidate) | 0.874 | 0.287 [0.275, 0.299] | +0.080 [0.068, 0.093] | 46.6 | 0.520 | 0.140 |
| OBJECTIVE_TARGETING_V1 | deployable | 0.079 | 0.268 [0.231, 0.310] | +0.088 [0.048, 0.125] | 52.7 | 0.502 | 0.201 |
| THREAT_COVERING_V1 | deployable | 0.026 | 0.367 [0.296, 0.445] | +0.222 [0.152, 0.295] | 26.1 | 0.275 | 0.032 |
| RANDOM_LEGAL_V1 | control | 1.000 | 0.202 | −0.004 | 51.6 | 0.579 | 0.151 |
| GREEDY | reference (simulator) | 1.000 | 0.213 | +0.007 | 45.5 | 0.530 | 0.097 |
| UNIFORM_LEGAL_EXPECTATION | control | — | 0.206 | — | 51.7 | — | — |
| CHEAPEST_CLASS_UNIFORM | diagnostic | — | 0.212 | — | 53.6 | — | — |
| FIXED_PRIORITY_CASCADE | diagnostic (untrained) | 1.000 | 0.287 | — | 47.6 | — | — |
| PERFECT_SELECTOR (historical set) | oracle | 1.000 | 0.397 | — | 32.4 | 0.371 | — |

The results replicate across partitions. RESOURCE scores 0.273 / 0.261 / 0.256 / 0.256 on DEV / CAL / HOLDOUT / OOD.
On the DEV/CAL-supported HOLDOUT levels (0–1, n = 5673) every policy moves by at most 0.005. On OOD, OBJECTIVE falls to
0.125 (n = 88, `OOD_DEGRADES`). Raw regret roughly doubles on OOD because of the environment's scale, while normalized
regret rises only from about 0.57 to 0.63. The regret ≥ 100 bar is inherited from the Stage 3F.6 contract, so it is on
the old raw scale.

**Confidence.** OBJECTIVE's confidence is informative (AUROC 0.80): accuracy is 0.09 below confidence 0.2 and 0.59
between 0.2 and 0.4. RESOURCE's confidence measures cost spread and carries no information about correctness
(AUROC 0.45). Both NEXUS selectors emit a constant confidence.

## Shortcut and invariance audit

Replicated flags require both CAL and HOLDOUT.

| Policy | orientation | direction accuracy | identity order | D4 twin | outcome |
| --- | --- | --- | --- | --- | --- |
| RESOURCE | **gap 0.42** | 0.02 | **0.256 vs 0.212 when tie-randomised** | equivariance 0.21 | NUISANCE_DEPENDENCE |
| NEXUS V1 | 0.03 | — | 0.170 vs 0.163 | equivariance 1.000 | clean |
| NEXUS V2 | **gap 0.44** | 0.05 | 0.287 vs 0.292 | equivariance 0.36 | NUISANCE_DEPENDENCE |
| OBJECTIVE | — | — | 0.268 vs 0.268 | 1.000 | clean |
| THREAT | — | — | 0.367 vs 0.363 | 1.000 | clean |

**The mechanism.** RESOURCE picks MOVE in 83% of episodes, EAST in 90% of those, because the MOVE-EAST action has the
lowest identity among the zero-cost actions. Its accuracy is 0.50–0.53 when the hidden world orientation keeps EAST as
EAST (R0, MY) and 0.11–0.23 otherwise. NEXUS V2's PROTECT gate leaves MOVE as the preferred type, so V2 shows the same
pattern (84% MOVE, 88% EAST). The symmetric benchmark removed the *average* payoff of moving EAST. It did not remove
the behaviour. These policies are not orientation-equivariant, so their competence depends on a nuisance variable that
no deployable policy can observe.

Seed family cannot be identified: each partition uses one seed.

Regime dependence (expected task structure, not a shortcut): RESOURCE depends on whether a zero-cost action is optimal
(gap 0.29) and on surface size. NEXUS V1 depends on the same zero-cost split (0.47), on curriculum level and on surface
size.

## RESOURCE: genuine or shortcut?

| HOLDOUT | accuracy |
| --- | --- |
| RESOURCE | 0.256 |
| RESOURCE with identity tie-break randomised (ID_PERMUTED_MEAN) | 0.212 |
| uniform choice among the cheapest actions (CHEAPEST_CLASS_UNIFORM) | 0.212 |
| uniform legal choice | 0.206 |

RESOURCE always chooses a zero-cost action. It is never right when no zero-cost action is optimal (13% of episodes).
When one is optimal, it is right 29% of the time, among about 5.1 cheapest candidates. The pre-registered verdict is
`GENUINE_RESOURCE_REASONING+ANOTHER_ARTIFACT`: the paired lower bound of RESOURCE minus the cost prior is +0.033,
above 0, and the nuisance flags replicate. Read together with the tie-randomised row, though, the verdict decomposes
fully. **Zero-cost prior + fixed-EAST tie-break = all of RESOURCE's accuracy. Resource reasoning contributes nothing
measurable.** The class is `SHORTCUT_DEPENDENT`.

## Complementarity

Perfect selector minus the best single policy (RESOURCE), paired bootstrap 95%:

| Set | HOLDOUT oracle acc | accuracy headroom | regret recovered | OOD accuracy headroom |
| --- | --- | --- | --- | --- |
| HISTORICAL_ROUTED (RESOURCE, V1, OBJECTIVE, THREAT) | 0.397 | **+0.141 [0.133, 0.150]** | 37.5% | +0.093 [0.086, 0.100] |
| CANDIDATE_ROUTED (V2 in place of V1) | 0.342 | +0.087 [0.080, 0.093] | 18.2% | +0.044 |
| ALL_DEPLOYABLE | 0.427 | +0.171 [0.162, 0.181] | 40.8% | +0.113 |
| FIXED_PRIORITY_CASCADE (untrained) | 0.287 | +0.031 [0.022, 0.040] | — | +0.009 |

`ROUTING_HEADROOM_MATERIAL = true` (lower bound ≥ 0.05). Replacing V1 with V2 **halves** the headroom. V2's
best-episode set overlaps RESOURCE's (Jaccard 0.48); V1's barely does (0.06).

On HOLDOUT, historical set: V1 is uniquely best in 2845 episodes, RESOURCE in 2465, OBJECTIVE in 83 and THREAT in 78.
The removal bars assign marginal oracle accuracy of +0.208 to RESOURCE, +0.114 to V1, +0.009 to OBJECTIVE and +0.008
to THREAT.

**Competence matrix (HOLDOUT accuracy / uniquely-best share; every cell is computed).**

| Regime | RESOURCE | NEXUS V1 | NEXUS V2 | OBJECTIVE | THREAT |
| --- | --- | --- | --- | --- | --- |
| all | 0.256 / 0.41 | 0.170 / 0.47 | 0.287 / 0.11 | 0.268 / 0.01 | 0.367 / 0.01 |
| a free action is optimal (87%) | 0.294 / 0.46 | 0.107 / 0.44 | 0.280 / 0.08 | 0.060 / 0.01 | 0.012 / 0.01 |
| a costly action is optimal (13%) | **0.000** / 0.12 | **0.572** / 0.68 | 0.330 / 0.35 | **0.754** / 0.07 | **0.750** / 0.06 |
| horizon-dependent | 0.285 / 0.49 | **0.000** / 0.43 | 0.270 / 0.08 | 0.009 / 0.01 | 0.248 / 0.01 |
| hostile present | 0.253 / 0.34 | 0.155 / 0.53 | 0.272 / 0.17 | 0.260 / 0.02 | 0.353 / 0.02 |
| no hostile | 0.259 / 0.50 | 0.196 / 0.40 | 0.313 / 0.04 | 0.279 / 0.01 | 0.625 / 0.00 |
| sparse surface | 0.290 / 0.45 | 0.148 / 0.46 | 0.297 / 0.06 | 0.117 / 0.00 | 0.424 / 0.01 |
| dense surface | 0.164 / 0.31 | 0.222 / 0.51 | 0.261 / 0.24 | 0.342 / 0.04 | 0.352 / 0.04 |
| OOD, costly action optimal | 0.000 | 0.597 | 0.460 | 0.714 | 1.000 (small n) |

The real complementarity sits on one axis: **whether the optimal action costs anything**. RESOURCE covers the free
case weakly. V1, OBJECTIVE and THREAT cover the costly case well. That axis comes from the oracle, so whether any
decision-time feature can predict it is exactly what the Router-value audit must measure. V1's strongest CAL regime,
not horizon-dependent, replicates on HOLDOUT: 0.788 accuracy (n = 1128). V1 is never right when the horizon matters.

## Classification (HOLDOUT, pre-registered decision list)

| Policy | class | CAL | Stage 3F.6-P | historical conclusion |
| --- | --- | --- | --- | --- |
| RESOURCE_PRESERVING_V1 | **SHORTCUT_DEPENDENT** | same | KEEP | **INVALIDATED** |
| NEXUS_SELECTOR_V1 | **REDESIGN_CANDIDATE** | same | REDESIGN_CANDIDATE | **SURVIVES** (re-derived, not carried) |
| NEXUS_SELECTOR_V2_CANDIDATE | **SHORTCUT_DEPENDENT** | same | — | its apparent gain over V1 is the fixed-EAST MOVE |
| OBJECTIVE_TARGETING_V1 | **KEEP_BUT_LIMIT** (LOW_COVERAGE, OOD_DEGRADES) | same | INSUFFICIENT_EVIDENCE | changed: now has evidence (n = 473) |
| THREAT_COVERING_V1 | **INSUFFICIENT_EVIDENCE** (n = 158) | same | INSUFFICIENT_EVIDENCE | **SURVIVES** |

Historical Forge V1 accuracy is descriptive only (different worlds): RESOURCE 0.612 → 0.256, the historical oracle
0.701 → 0.397.

## Integrity

All 16 checks pass. They cover predecessors (P.1C, P.1D and 3F.6-P reproduce), corpus binding, zero overlap, symmetry
(4100/4100), plan binding, frozen-before-holdout, open-phase reproduction, unchanged policy sources, evidence binding,
fidelity and replay, metric verification identities, no router training or tuning, R0, and 15/15 stage tests.

## Disclosures

- **Post-freeze code correction.** The first sealed run crashed: the shortcut audit read ID-relabel and twin
  evidence for the RANDOM_LEGAL control, and that evidence exists only for deployable policies. The control now
  reports those two factors as `NOT_APPLICABLE`. No metric, threshold or rule changed, and the change is visible in
  the diff against `5e1ea9a`. Two disclosure strings were also added to the certificate.
- **Level coverage.** The corpus plan declared levels 0–5, but DEV/CAL contain levels 0–1 only and HOLDOUT contains
  0–2. The admission quotas fill before higher levels are reached. The OOD shift is therefore 0–2 → 6–7.
- **Prior exposure.** Stage 3F.6-P.1D's frozen integrity diagnostics already implied RESOURCE's sealed accuracy
  (about 0.26). No threshold depends on it.
- **Predecessors.** Stage 3F.5 (documented as superseded) and Stage 3F.6 prediction reliability no longer
  reproduce, because 3F.6-R changed the runtime they certified. Stage 3F.6 has no erratum. Neither is an input here.
- **Post-hoc, not in the certificate.** The routing headroom does not depend on the hidden orientation. It is +0.114
  in EAST-preserving worlds and +0.151 elsewhere, and +0.144 when RESOURCE is tie-randomised.

## Roadmap

`SYMMETRY_CERTIFIED`, `CORPUS_LINEAGE_CLEAN`, `POLICY_RESULTS_REPRODUCIBLE`, `AFFECTED_POLICIES_REQUALIFIED`,
`EXPERT_DIVERSITY_READY` and `ROUTER_VALUE_AUDIT_READY` are all true. `READY_FOR_STAGE3G` is false. Stage 3F stays
open until the rest of the requalification sequence (3F.6-P.1, T, P.1A, W, D) is rerun on this lineage.

Authority: R0, non-dispatching, no online learning, nothing promoted.

## Reproduce

```bash
npm run stage3f6p1e:generate:open
npm run stage3f6p1e:open
npm run stage3f6p1e:generate:sealed
npm run stage3f6p1e:certify
npm run stage3f6p1e:check
npm run test:stage3f6p1e
```
