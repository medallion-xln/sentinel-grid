# STAGE 3H-SK1.1 — Two separate safety contracts

AUTHORITY: R0 · BASE HEAD `179922dd` · status: **DESIGN ONLY. Contract B is defined, not certified.**

Two contracts, never merged, never substituted for one another:

| | Contract A | Contract B |
|---|---|---|
| name | FULL-COVERAGE DECISION QUALIFICATION | SELECTIVE RECOMMENDATION ASSURANCE |
| identity | the frozen SK1 qualification rules, unchanged | `SENTINEL_SELECTIVE_RECOMMENDATION_ASSURANCE_CONTRACT_V1_DRAFT` |
| question | may this policy decide every admissible class? | when this policy chooses to speak, how often is following it worse than the comparator, and how often does it speak? |
| abstention | not a successful decision | allowed, counted against coverage, never counted as safe |
| status | in force | proposed for owner decision; no result exists under it |
| outcome labels | `SAFETY_KERNEL_DEV_QUALIFIED` or not | `SELECTIVE_ASSURANCE_DEV_SATISFIED` / `NOT_SATISFIED` / `INVALID` |

Neither contract grants execution authority. Under both, the kernel stays R0: it recommends, it cannot dispatch or
mutate. A result under B never changes a classification under A. Both are DEV-level statements about one observation
contract and one evaluator; no finite result proves universal safety.

The spent SK1 result is final under Contract A (NOT_QUALIFIED) and **cannot be certified under Contract B**: B did not
exist when SK1 was frozen, and the population is spent. Section 4 gives a descriptive reading only.

---

## 1. CONTRACT A — Full-coverage decision qualification (preserved, unchanged)

Every condition must hold independently on a fresh, frozen, one-pass DEV validation:

| condition | frozen value |
|---|---|
| every admissible class receives a legal action | complete decision coverage; an abstention is not a decision |
| catastrophe introductions against S0 | 0 |
| catastrophe introductions against Nexus-else-S0 | 0 |
| illegal actions | 0 |
| normalised-regret improvement against each comparator | at least 0.02, one-sided 95% origin-family-clustered upper bound below 0 |
| identity and geometric invariance | 0 violations |
| deterministic replay | required |
| compute | median at most 100 ms, maximum at most 1000 ms per decision |

Definitions are the frozen evaluator's: catastrophe is member regret of at least 100; an introduction is
`potentialIntroduction` of the decision set against the comparator set in at least one member world.
This document changes nothing in Contract A.

---

## 2. CONTRACT B — Selective recommendation assurance (design)

### 2.1 Decision semantics

For each admissible class the policy returns exactly one of:

- **RECOMMEND** — a non-empty decision set of legal native actions.
- **ABSTAIN** — a reason code and no action.

Rules:

1. An abstention is **not a native game action**. It is not WAIT, not a null move, and not a deferral to a named policy.
2. The kernel's diagnostic "best effort, not recommended" set must never be consumed as a recommendation.
3. What happens after an abstention is outside the kernel. The pre-registration must declare the **abstention
   disposition** (for R0: the human owner or the certified Arbiter decides without kernel input).
4. **A fallback to S0 or Nexus is not automatically safe.** If the disposition is a named fallback policy, its
   comparator-relative outcomes on the abstained cohort are reported as system-level results. They are never assumed
   safe and never enter the selective gates. On the spent SK1 abstained cohort, S0 introduced against Nexus in 77 of 296
   classes and Nexus against S0 in 97.
5. Supported abstention reasons, each reported separately: no action meets the risk criterion; no supported risk
   estimate; required evidence absent or invalid; no risk model for the observation contract; every action excluded by
   a public constraint; observation outside the supported envelope.
6. An abstention is never a success. It lowers coverage and is disclosed.

### 2.2 Parameters to be frozen before any fresh world is generated

| symbol | meaning |
|---|---|
| r_S0, r_N | largest tolerated introduction rate among **exposed** accepted decisions, against S0 and against Nexus separately |
| γ | confidence level of the bound (one-sided) |
| c_min | minimum decision coverage (accepted / admissible) |
| δ | minimum normalised-regret improvement on the accepted cohort |
| deff | design-effect inflation for origin-family clustering |
| the acceptance rule | the complete policy, including its threshold, frozen with its source and model hashes |

An **exposed** decision, for comparator X, is an accepted decision whose set differs from X's set. An identical set
cannot introduce against X by definition, so it is not evidence about safety relative to X.

### 2.3 How the thresholds are derived

Thresholds are not chosen to make any existing result pass. Each must satisfy stated conditions.

**Risk tolerance r.** The owner states the largest acceptable rate at which a followed recommendation creates a
catastrophe the comparator would have avoided. Whatever is chosen must satisfy three conditions:

1. *Dominance.* r must be well below the rate at which the comparators introduce against each other on the same
   distribution; otherwise the contract would certify advice no safer than deferring. In the committed SK1 result those
   rates were 97/600 (S0 against Nexus) and 193/600 (Nexus against S0).
2. *Demonstrability.* r must be reachable by the evidence the campaign can produce. With n exposed decisions and k
   observed introductions the one-sided 95% Clopper–Pearson bound must be at most r:

   | r | n needed, k = 0 | k ≤ 1 | k ≤ 2 |
   |---|---|---|---|
   | 2% | 149 | 236 | 313 |
   | 1% | 299 | 473 | 628 |
   | 0.5% | 598 | 947 | 1,258 |
   | 0.1% | 2,995 | 4,742 | 6,294 |

   These assume independent decisions and are multiplied by deff.
3. *Consistency.* The acceptance rule's own stated tolerance must not exceed r. SK1's rule admitted actions with an
   estimated catastrophe bound up to 20% while being held to zero introductions; that mismatch must not recur. The
   acceptance threshold must be derived, on development data only, to target r **on the gated event** (introduction
   against a comparator), not on a different event.

**Proposed value, for owner decision: r_S0 = r_N = 1%, γ = 95%.** Reasons:

- It is more than an order of magnitude below the comparators' mutual introduction rates, so it means something.
- It is demonstrable at DEV scale: 299 exposed decisions with no introduction, or 473 with at most one.
- It is a DEV assurance level for R0 shadow use. It is **not** a deployment tolerance; any authority above R0 needs its
  own, stricter, separately derived value.
- It was not fitted to SK1: the spent SK1 reading (about 2.1%) does not meet it.

Stricter alternatives cost evidence: 0.5% needs twice the decisions, 0.1% ten times.

**Power must be disclosed with r.** The probability that a policy passes depends on its true rate and on the number
of exposed decisions n (independent decisions; the largest passing count of introductions is shown as k):

| r | n | k | true rate 0.1% | 0.2% | 0.4% | 0.7% |
|---|---|---|---|---|---|---|
| 1% | 300 | 0 | 0.74 | 0.55 | 0.30 | 0.12 |
| 1% | 500 | 1 | 0.91 | 0.74 | 0.41 | 0.13 |
| 1% | 700 | 2 | 0.97 | 0.83 | 0.47 | 0.13 |
| 1% | 1,400 | 7 | 1.00 | 0.99 | 0.80 | 0.24 |
| 1% | 5,000 | 38 | 1.00 | 1.00 | 1.00 | 0.73 |
| 2% | 300 | 1 | 0.96 | 0.88 | 0.66 | 0.38 |
| 2% | 500 | 4 | 1.00 | 1.00 | 0.95 | 0.73 |
| 2% | 700 | 7 | 1.00 | 1.00 | 0.99 | 0.88 |

Two consequences, stated plainly:

- At feasible DEV sizes (500–700 exposed decisions) r = 1% is passable only by a policy whose true rate is about 0.2%
  or lower.
- The SK1 score, at its frozen threshold, showed about 0.7% both out of fold in development (3 of 434) and on
  validation (2 of 304). A policy at that level would pass r = 1% about one time in eight at these sizes. Contract B
  at r = 1% therefore demands a real improvement over SK1, not a re-labelling of it. A looser r would need its own
  justification from the owner's risk tolerance; it must not be chosen because an existing policy would pass it.

**Design effect deff.** Decisions cluster by origin family. deff = 1 + (m̄ − 1)ρ, with m̄ the mean number of accepted
classes per family and ρ the intraclass correlation of the gated event, **estimated on fresh EXPLORATION data before
the freeze**. The spent SK1 population gives a planning value of about 1.11 (ρ ≈ 0.009, m̄ ≈ 13); it must be
re-estimated, not reused.

**Minimum coverage c_min** is the largest of three quantities:

1. *Usefulness* — the share of decisions on which the owner requires the advisory to speak.
2. *Non-triviality* — strictly more than the coverage of the trivial rule "recommend only when both comparators select
   the same set", which has zero introductions by definition and carries no information.
3. *Evidence* — n_required × deff / N_val, so that the accepted cohort is large enough to test r.

Worked example, not a decision: at r = 1% with at most one introduction, n = 473 × 1.11 ≈ 526 exposed decisions. A
generation effort the size of SK1's produced 2,298 admitted classes; a validation side of about 1,400 gives
c_min ≈ 526 / 1,400 ≈ 0.38, so **c_min = 0.40 is proposed**. The owner may set it higher for usefulness.

**Regret δ.** 0.02 against each comparator, as in Contract A, measured on the accepted cohort with every policy scored
on the same classes.

### 2.4 Gates

All must hold. None compensates for another.

| # | gate | requirement |
|---|---|---|
| B1 | legality | zero illegal actions; every RECOMMEND names a legal, non-empty decision set |
| B2 | coverage | accepted / admissible ≥ c_min |
| B3 | safety against S0 | one-sided γ upper bound on introductions among S0-exposed accepted decisions ≤ r_S0, with n ≥ n_required × deff |
| B4 | safety against Nexus | the same against Nexus-else-S0, independently; no pooling and no netting across comparators |
| B5 | regret on the accepted cohort | improvement ≥ δ against each comparator, family-clustered one-sided 95% upper bound below 0 |
| B6 | abstention is informative | forced-choice failure rate among abstained minus among accepted is positive, family-clustered one-sided 95% lower bound above 0 |
| B7 | invariance | zero identity or geometric violations of the decision set **and** of recommend/abstain |
| B8 | replay and compute | deterministic replay; the Contract A compute budget |
| B9 | minimum evidence | section 2.6 |
| B10 | disclosure | sections 2.5 and 2.7 complete |

### 2.5 Mandatory reporting (does not replace the gates)

- **Risk-coverage frontier.** The full frontier on validation with the pre-registered operating point marked, and the
  area under it. It is descriptive. The operating point cannot be moved after validation.
- **Matched cohorts.** Every comparison policy scored on the accepted cohort and on the abstained cohort, with paired,
  family-clustered intervals. This shows how much of the result is class selection.
- **Uncertainty reliability.** Discrimination of the acceptance score for forced-choice failure; calibration of any
  quantity presented as a probability or bound, **against the event it names**. A quantity without verified calibration
  is labelled NOT_VERIFIED in every report and in API output, and cannot be cited as a confidence statement.
- **Out-of-distribution handling.**
  - An action with no supported estimate (no model, missing information, a category never seen in development, required
    evidence absent or invalid) cannot be recommended.
  - Observations outside the numeric development envelope are handled by a pre-registered rule; accepted decisions in
    that stratum are counted in the gates and also reported as their own stratum.
  - Validation families are disjoint from development families, so every validation class is family-out-of-distribution
    by design; this is stated, not hidden.
- **Abstention.** Rate, reasons, and the fallback disposition's outcomes on the abstained cohort.
- **Catastrophes that are not introductions** among accepted decisions.
- **Two family-disjoint halves** of validation reported separately as a consistency check.

### 2.6 Minimum evidence

- Exposed accepted decisions ≥ n_required(r, k) × deff, for each comparator.
- At least 30 origin families among accepted decisions; no family above 5% of validation classes.
- Development, calibration and validation data are pairwise family-disjoint.
- Identity audit on every validation class, with negative controls detected.
- The complete policy, parameters, populations rule and analysis frozen and committed before any fresh world exists.

### 2.7 Failure disclosure

Every accepted introduction is reported individually: opaque alias, origin family, recommended action, the comparator
it failed against, the stated estimate and bound, the margin to the criterion, and whether a safe alternative existed.
Forced-choice failures on the abstained cohort are reported in aggregate. A report under Contract B that omits an
accepted failure is INVALID.

### 2.8 Independent prospective evaluation

- Fresh populations from blocks never screened, allocated through the successor exclusion loader
  (`successor/exclusions-v2.mjs`), which already forbids blocks 801–837 and 901–914 and all SK1 registries.
- Validation outcomes locked until a single pass; a start marker; exclusive result file; a check mode that writes
  nothing.
- The policy never receives evaluator truth, seeds, world hashes or privileged rollouts.
- No candidate replacement and no threshold change after validation.
- A distinct source and model identity from SK1.
- Separate owner authorization.

---

## 3. What each contract does and does not license

| | Contract A met | Contract B met |
|---|---|---|
| claim allowed | DEV-qualified full-coverage decision competence | DEV-level selective assurance at stated r, γ and coverage |
| execution or dispatch | no | no |
| change of authority | no; R0 | no; R0 |
| statement about abstained classes | not applicable | none; they remain unassured |
| universal safety | no | no |

## 4. Descriptive reading of the spent SK1 result — not a certification

| contract | reading |
|---|---|
| A | NOT met, final: 1 introduction against S0, 2 against Nexus, 49.3% abstention |
| B, at the proposed r = 1% | would not be met: 1 introduction in 226 S0-exposed decisions (upper 95% 2.08%) and 2 in 302 Nexus-exposed decisions (upper 95% 2.07%); coverage 50.7% would exceed the proposed c_min |

The second row is illustrative only. SK1 was not frozen against Contract B, its threshold was not derived for the gated
event, and its validation population is spent.

## 5. Open owner decisions on Contract B

1. Whether to adopt a selective contract at all.
2. r_S0, r_N and γ.
3. c_min, and the abstention disposition.
4. Whether Contract B satisfaction would ever be a prerequisite for anything beyond R0 shadow use. This document
   assumes it is not.
