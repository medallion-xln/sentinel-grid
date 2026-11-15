# STAGE 3H-SK2-F — Prospective selective-assurance contract proposal

AUTHORITY: R0 · BASE HEAD `16ae5c21` · status: **PROPOSAL. `CONTRACT_B_ADOPTED=false`, `CONTRACT_B_CERTIFIED=false`.**

This refines the draft in `../stage3h-sk1-1-assurance-v1/SK1_SAFETY_CONTRACTS.md` (Contract B) with what the
feasibility analysis established. It ratifies nothing. Contract A — full-coverage qualification, zero introductions —
is unchanged and SK1 remains not qualified under it.

## 1. Decision on feasibility

**B — SELECTIVE_ASSURANCE_FEASIBILITY_UNSUPPORTED**, for the frozen SK1 policy against 1% / 95% / 40% at practical
DEV sample sizes. Details: `SK2_F_FEASIBILITY.md`.

**Recommended scientific priority: WITHIN_MENU_ACTION_RISK_DISCRIMINATION.**

Consequence for this contract: it should not be adopted *for SK1*, and no selective campaign should be run *on SK1*.
The contract is still worth fixing in advance, so that a later policy is measured against a standard that was written
before its results existed.

## 2. Research targets (inputs, not ratified standards)

| parameter | research target | status |
|---|---|---|
| maximum selective risk | 0.01 | RESEARCH_TARGET_NOT_RATIFIED |
| confidence | 0.95, one-sided | RESEARCH_TARGET_NOT_RATIFIED |
| minimum coverage | 0.40 | RESEARCH_TARGET_NOT_RATIFIED |

They are kept exactly as given. They were not adjusted to the observed outcomes, and the analysis does not recommend
adjusting them. If the owner wants a different risk level, it must come from the application's risk tolerance, stated
before any policy is measured against it.

## 3. Endpoints

| endpoint | role |
|---|---|
| C — UNION_INTRODUCTION: an accepted class introduces against S0 or Nexus-else-S0 or both, counted once | **primary; the only endpoint the bound is claimed on** |
| A — INTRODUCTION_VS_S0 | reported separately, with all-accepted and exposure-adjusted denominators |
| B — INTRODUCTION_VS_NEXUS | reported separately, likewise |

Quantities, all reported, none substituted for another:

- SELECTIVE_COVERAGE = accepted classes / eligible classes.
- SELECTIVE_FAILURE_RATE = unique accepted introduction classes / accepted classes. **The gated quantity.**
- FULL_POPULATION_INTRODUCTION_RATE = unique accepted introduction classes / eligible classes. Reported; never used to
  dilute the selective rate, and never read as the safety of the whole population.

Simultaneous claims: one claim on C at 95% covers A and B, because each is a subset of C. A contract that instead
claims A and B separately must use 97.5% for each and the larger sample sizes that follow.

The endpoints are comparator-relative introductions under the frozen evaluator definitions. They are not the risk
model's catastrophe label, and calibration on that label is not accepted as evidence about them.

## 4. Gates

All must hold on one frozen, single-pass, fresh validation.

| # | gate | requirement |
|---|---|---|
| S1 | legality | zero illegal actions; every recommendation is a legal, non-empty decision set |
| S2 | coverage | SELECTIVE_COVERAGE at least 0.40 **at its lower 95% confidence limit**, exact and family-clustered |
| S3 | selective risk | exact one-sided 95% upper bound on SELECTIVE_FAILURE_RATE (endpoint C) at most 0.01, on at least n_required × design effect accepted decisions |
| S4 | clustering | the same bound recomputed at the pre-registered design effect still at most 0.01; at least 30 origin families among accepted decisions; no family above 5% of validation |
| S5 | regret | normalised-regret improvement of at least 0.02 against each comparator on the accepted cohort, family-clustered upper bound below 0 |
| S6 | abstention is informative | forced-choice failure rate among abstained minus among accepted is positive, family-clustered lower bound above 0 |
| S7 | invariance, replay, compute | zero identity or geometric violations of both the decision set and recommend/abstain; deterministic replay; the Contract A compute budget |
| S8 | disclosure | every accepted failing class reported individually; comparator endpoints, full-population rate, risk-coverage frontier and matched cohorts reported |

Abstention semantics are as in the SK1.1 draft: an abstention is not a native action, not a safe outcome and not a
deferral to a named policy; what the system does next is declared in advance and reported; a fallback to S0 or Nexus
is not assumed safe.

Outcome labels: `SELECTIVE_ASSURANCE_DEV_SATISFIED` / `NOT_SATISFIED` / `INVALID`. None grants execution authority,
and none changes a classification under Contract A.

## 5. Evidence a policy must show *before* a selective campaign is authorized

The feasibility analysis turns into a simple entry rule. A fresh selective campaign is authorized only if all hold:

| # | entry condition | why |
|---|---|---|
| E1 | out-of-fold development evidence consistent with a true selective failure rate near 0.2%: at most one union failure among at least 400 accepted decisions at coverage of at least 0.40 | with 773 accepted decisions a policy at 0.2% passes S3 more than nine times in ten; one at 0.7% passes about one time in five |
| E2 | the acceptance threshold is derived on development data by a pre-registered procedure aimed at the gated event; it is not hand-set, and not read from any validation outcome | SK1's threshold tolerated a 20% catastrophe bound while being held to zero introductions |
| E3 | a design effect estimated on fresh exploration data | the accepted cohorts here have too few events to estimate one |
| E4 | supply check: enough fresh blocks and origin families for pairwise family-disjoint exploration, calibration and validation | about 2,150 eligible validation classes are needed at 40% coverage; SK1 admitted 2,298 classes in total from 26 blocks, across about 103 families |
| E5 | the infrastructure conditions of section 7 | a result nobody else can re-check, on one disk, is not a basis for a contract claim |

**Frozen SK1 fails E1** (3 union failures among 434 accepted out of fold) and E2. That is the feasibility result
expressed as a rule.

## 6. Sample plan under the targets

From `SK2_F_SAMPLE_SIZE_PLAN.md`, for a policy that meets E1:

| item | value |
|---|---|
| accepted decisions | at least 773, times the design effect (858 at 1.11) |
| largest passing count of unique accepted failing classes | 3 at n = 773 |
| eligible validation classes | about 2,150 at 40% coverage |
| power at n = 773 | 93% at a true rate of 0.2%; 99% at 0.1%; 21% at 0.7% |

A campaign sized below 299 accepted decisions cannot pass S3 whatever it observes.

## 7. Infrastructure conditions for any prospective contract claim

From `SK2_F_REPRODUCIBILITY_STATUS.md`:

1. An independent backup that has been restored and hash-verified on a separate device.
2. No frozen experiment bound to an uncommitted file.
3. A recorded evaluation-source manifest at freeze time, including the custody-protected overlay identities.
4. Exclusions enforced through the successor loader, with the registry hashes recorded in the freeze.
5. A disclosed statement of what is and is not reproducible from committed source.

## 8. What is deliberately not in this proposal

- No acceptance threshold, operating point or coverage level derived from observed outcomes.
- No relaxed risk target. "What a 0.7% policy could demonstrate" is tabulated in the sample-size plan for information
  and is explicitly not proposed.
- No retrospective reading of SK1 as satisfying anything. Historical arithmetic: 2 unique failures in 304 accepted,
  exact upper 95% bound 2.06%, above the 1% target.
- No claim about abstained classes, about unscreened distributions, about horizons other than H2, or about safety
  outside the sampled member worlds.

## 9. Relation to the recommended priority

The selective contract and the discrimination hypothesis are sequential, not rival. `H-DISC`
(`SK2_F_ACTION_DISCRIMINATION.md`) is tested at full coverage with a paired design of about 600 fresh classes. If it
succeeds, the resulting ranker's out-of-fold selective rate is what entry condition E1 would examine. If it fails,
E1 will not be met by this route and this contract stays unadopted.

## 10. Owner decisions

1. Accept classification B and the recommended priority, or direct otherwise.
2. Whether to keep this contract on file as the pre-written standard for a future policy, with 1% / 95% / 40% as they
   are, or to set different values from stated risk tolerance.
3. Whether to authorize the design of an H-DISC pre-registration. Nothing is authorized by this document.
