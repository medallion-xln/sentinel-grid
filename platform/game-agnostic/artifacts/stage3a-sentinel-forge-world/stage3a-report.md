# Stage 3A — Sentinel Forge World

Status: **PASS** · Outcome: **A_FORGE_WORLD_AND_SOUP_FOUNDATION_CERTIFIED** · Authority: R0 (advisory only)

## What this is

A deterministic simulation environment that owns world truth: dynamics, legal
actions, canonical state, exact counterfactual outcomes, and a versioned reward.
It renders as ASCII for humans and is authoritative as structured state — the
renderer is never read back, never enters world identity, and is checked by the
certify script for exactly that.

```
tick 0/8  energy 40  family nexus/dependency_chain  L0
#########
#...FPT.#
#......I#
#.......#
#.......#
#.......#
#.......#
#.....I.#
#########
```

12 entity types · 11 relation types · 12 action types · 11 reward components under `FORGE_REWARD_V1`.

## It is an ordinary Sentinel adapter

Forge World implements the existing Adapter SDK contract. Prime, the router and
both experts run against it with no Forge-specific branch anywhere in their path,
and Prime produced a legal recommendation on **100.0%** of 504 cases
(0 illegal). The counterfactual oracle is deliberately unreachable from
the adapter: an adapter that could hand Sentinel the answer would turn the shadow
evaluation into a copying exercise.

## Everything is integer arithmetic

No floating point appears in any transition or reward path. Determinism is then a
property of the arithmetic rather than a hope about it, and an exact tie is exactly
a tie — which turns out to matter more than expected.

## The admission gate, and its own control

504 scenarios generated, 504 admitted, 0 rejected.

A 100% admission rate is not evidence that a gate works — it is equally consistent
with a gate that cannot reject anything. So the gate is given a control: seven
scenarios are generated under one family and validated against a **different**
family's claim. All 7 were refused, and the honest claim held in every case.

The gate also earned its place during construction. `prime/resource_constrained_planning`
was rejected on all eighteen of its first cases: the generator placed repairable
nodes by entity count, so the energy budget always covered every repair and the
family claimed a constraint that was not in the world it produced. The generator
was wrong and the validator was right.

## Effective variation, not raw count

| measure | value |
| --- | --- |
| raw case count | 504 |
| unique canonical states | 499 |
| unique topologies | 105 |
| unique outcome rankings | 334 |
| **reportable sample size** | **334** |

504 cases rest on 105 distinct topologies. The reportable figure is the smallest
of the distinct-state, distinct-topology and distinct-ranking counts; quoting the
raw count as independent sample size would overstate the corpus.

## The measurement that had to be corrected

The first run reported **0%** agreement between Prime and the counterfactual
optimum on all 144 Oracle-surface cases. Zero across a whole surface is a claim
about a systematic effect, so it was inspected rather than reported — and the
defect was in the metric. Prime was choosing `PROTECT target`, which **tied** at
the optimum, and losing a lexicographic tie-break to a `MOVE`. The metric was
measuring agreement with a sorting rule.

Agreement now means regret zero — an action *of optimal utility* — and the
tie-break match is reported separately as the far less interesting number it is.

## What Forge World measured about Sentinel

| measure | value |
| --- | --- |
| decisive cases (utility spread > 0) | 405 |
| agreement with the optimal set | 74.07% |
| match with the tie-break winner | 46.17% |
| cases with a **unique** optimum | 88 |
| agreement where the optimum is unique | 3.41% |

The headline 74% is carried almost entirely by cases where several actions tie at
the optimum. The decomposition says why:

| | cases | agreement |
| --- | --- | --- |
| horizon-aligned (one-step optimum **is** the horizon optimum) | 319 | 94.04% |
| horizon-dependent (they differ) | 86 | 0.00% |

Prime scores an action over **one** step; the oracle scores it over three under a
declared continuation policy. Where those objectives agree Prime reaches the
optimum 94% of the time; where they disagree it reaches it never, because a
one-step objective structurally cannot. That is an objective mismatch, measured —
not a search defect, and not a claim that Prime is wrong.

Those 86 horizon-dependent cases are the first precisely characterised target this
substrate has produced.

## Soup

Audited at `f07e07ed7edd` (v0.74.0, Apache-2.0), cloned to an isolated
training-tools location. No Soup file is imported by, vendored into or referenced
from Sentinel runtime source, and the certify script checks the import graph of
every runtime file for exactly that.

The bridge is a **translation**, and the audit is what proved it: Forge SFT rows
are `{prompt, completion}`, which matches no Soup format signature at all — `kto`
is the only signature containing both keys and it additionally requires `label`.
Handing Soup the raw export would fail detection. Preference rows are the opposite
case: `{prompt, chosen, rejected}` is Soup's `dpo` signature exactly.

Every translated row is run through Soup's own detection rule, and the
**untranslated** row is run through it too as a control — it must detect as
nothing, which is what proves the translation does work rather than decorating a
row that already passed.

## Governance

Soup may reach `TRAINED`. It may never reach `CERTIFIED`: no transition into that
state names any actor but Sentinel certification, and the certify script blocks if
that ever becomes false. `SOUP_CAN_CERTIFY_EXPERT=false`.

No model was trained. No candidate exists. Nothing was promoted.

## Measured remaining limitations

- NO_LEARNED_CANDIDATE_EXISTS: Soup was audited and format-bridged but never invoked, so no statement is made about what a trained candidate would do.
- CONTINUATION_POLICY_IS_A_CHOICE: horizon utilities are exact under the declared greedy continuation policy. A different declared policy would produce different — equally exact — utilities, so the optimum is optimal with respect to a named policy rather than in the abstract.
- SINGLE_PLATFORM: performance figures and the run itself come from one platform; the inherited DIGEST_PRODUCED_SINGLE_PLATFORM limitation is unchanged.
- **416 of 504 cases have an exact tie at the optimum**, which caps SFT yield at 88 rows. A reward vector this coarse leaves many actions genuinely indistinguishable; sharpening it is scenario-design work, not a defect in the arithmetic.

Certification hash: `c66b85d863d428d2da0e9d738f426e0b655124509bad04e0e7220f6eaf34898d`

