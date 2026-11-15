# STAGE 3H-SK2-F — Sample-size plan

AUTHORITY: R0 · BASE HEAD `16ae5c21` · **planning arithmetic only; no campaign is authorized or implied**

Machine record: `evidence/SK2F_FEASIBILITY.json`, section `sampleSize`. Functions: `diagnostics/feasibility.mjs`
(`passCount`, `passProbability`, `requiredN`), tested against closed-form values.

## 1. The test being sized

- Claim: SELECTIVE_FAILURE_RATE on the union endpoint is at most **r = 1%**, at **95%** one-sided confidence.
- Test: exact binomial. With n accepted decisions the claim is met when the observed count of unique accepted
  introduction classes is at most k, the largest count whose Clopper–Pearson upper bound stays at or below 1%.
- Unit: an accepted decision. Eligible classes needed = accepted decisions × design effect ÷ coverage.

Assumptions, all disclosed:

- Decisions are treated as independent and then inflated by a design effect for origin-family clustering.
- The design effect is not estimable from accepted cohorts (2 to 8 events). The planning value 1.11 comes from the
  forced-choice failure indicator on all 600 validation classes; 1.5 and 2 are shown as sensitivity.
- Coverage is taken as 0.40 (the target), 0.434 (out-of-fold development) or 0.507 (historical validation).
- The power target is 80%.

## 2. How many failures a campaign may show and still pass

| accepted decisions | largest passing count |
|---|---|
| 298 or fewer | cannot pass at all |
| 299 | 0 |
| 473 | 1 |
| 700 | 2 |
| 1,000 | 4 |
| 1,400 | 7 |
| 3,000 | 20 |
| 6,000 | 47 |

## 3. Probability of passing, by true rate

| accepted decisions | true rate 0.1% | 0.2% | 0.33% | 0.5% | 0.7% | largest true rate with 80% power |
|---|---|---|---|---|---|---|
| 300 | 0.74 | 0.55 | 0.37 | 0.22 | 0.12 | 0.07% |
| 500 | 0.91 | 0.74 | 0.51 | 0.29 | 0.14 | 0.16% |
| 700 | 0.97 | 0.83 | 0.59 | 0.32 | 0.13 | 0.22% |
| 1,000 | 1.00 | 0.95 | 0.76 | 0.44 | 0.17 | 0.31% |
| 1,400 | 1.00 | 0.99 | 0.90 | 0.60 | 0.24 | 0.40% |
| 2,000 | 1.00 | 1.00 | 0.98 | 0.79 | 0.36 | 0.50% |
| 3,000 | 1.00 | 1.00 | 1.00 | 0.92 | 0.47 | 0.57% |
| 6,000 | 1.00 | 1.00 | 1.00 | 1.00 | 0.80 | 0.70% |

## 4. Minimum sizes to distinguish a plausible rate from 1%

| true rate | accepted decisions, 80% power | 90% power | eligible classes at coverage 0.434, design effect 1.11 | at design effect 1.5 | at 2 |
|---|---|---|---|---|---|
| 0.7% | 6,434 | 8,643 | 16,456 | 22,238 | 29,650 |
| 0.5% | 2,185 | 2,784 | 5,589 | 7,552 | 10,070 |
| 0.33% | 1,049 | 1,441 | 2,683 | 3,626 | 4,835 |
| 0.2% | 773 | 913 | 1,978 | 2,672 | 3,563 |
| 0.1% | 473 | 628 | 1,210 | 1,635 | 2,180 |

If the two comparator endpoints were claimed separately rather than through the union, each at 97.5%:

| true rate | accepted decisions, 80% power | 90% power |
|---|---|---|
| 0.7% | 8,052 | 10,501 |
| 0.5% | 2,717 | 3,446 |
| 0.33% | 1,439 | 1,705 |
| 0.2% | 874 | 1,022 |
| 0.1% | 555 | 720 |

A single claim on the union is both stricter in substance and cheaper in sample size. It is the recommended primary.

## 5. What that means at SK1's scale

Reference: SK1 screened 26 blocks, admitted 2,298 classes and used 600 for validation.

| case | eligible validation classes needed | multiple of SK1's validation |
|---|---|---|
| a policy at the rate SK1 shows (0.7%) | 16,456 | 27× |
| a policy at 0.5% | 5,589 | 9× |
| a policy at 0.33% | 2,683 | 4.5× |
| a policy at 0.2% | 1,978 | 3.3× |
| a policy at 0.1% | 1,210 | 2× |

At 0.7% the validation population alone would need about 187 screened blocks even if every admitted class went to
validation. That is not a practical DEV campaign.

## 6. Plan, if a selective test is ever authorized

A selective-assurance campaign is worth running only for a policy whose development evidence points to a true rate of
about 0.2% or lower. For such a policy:

| item | value |
|---|---|
| primary endpoint | UNION_INTRODUCTION among accepted decisions |
| accepted decisions | at least 773 × design effect (858 at 1.11) |
| passing count | at most 3 unique accepted failing classes at n = 773 |
| eligible validation classes | about 2,150 at the 40% coverage target; about 1,980 if coverage is 43% |
| design effect | re-estimated on fresh exploration data before the freeze; not reused from here |
| development evidence required first | out-of-fold selective failure rate consistent with 0.2%: at most one failure among at least 400 accepted decisions |
| families | at least 30 among accepted decisions; no family above 5% of validation |

For the frozen SK1 policy the development-evidence line already fails: 3 failures among 434 accepted out of fold.

## 7. A paired design for a discrimination hypothesis

The recommended next priority is action discrimination (`SK2_F_ACTION_DISCRIMINATION.md`). Its natural primary measure
is the **top-1 unsafe rate**: the union introduction rate of the first-ranked action at full coverage, compared with
frozen SK1 on the same fresh classes. SK1's planning baseline is 6.5% (validation) to 7.3% (out of fold).

Classes needed for 80% power, one-sided 5%, paired, assuming the two policies fail independently (conservative):

| relative reduction of the top-1 unsafe rate | candidate rate | classes | with design effect 1.11 |
|---|---|---|---|
| 30% | 4.55% | 1,699 | 1,886 |
| 50% | 3.25% | 544 | 604 |
| 70% | 1.95% | 243 | 270 |

A halving is testable on a validation population the size of SK1's. That is two orders of magnitude cheaper than
certifying SK1's selective rate against 1%, because it measures a large effect on every class instead of a rare event
on half of them.

## 8. For information only: what a 0.7% policy could demonstrate

Not a recommendation and not a proposed target. A policy with a true rate of 0.7% would have 80% power to show an upper
bound of about 2.1% with 434 accepted decisions, 1.9% with 700 and 1.4% with 1,400. Choosing a target because an
existing policy would meet it is exactly what the mandate rules out; any change to the 1% target has to come from the
owner's risk tolerance.
