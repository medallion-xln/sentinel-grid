# Sentinel Grid

A deterministic, game-agnostic **decision-intelligence kernel**. It observes a
game's canonical state and produces a ranked, replayable *recommendation*. It
does not act.

> **Authority: R0.** `canDispatch=false`, `canMutateLiveWorld=false`. There is no
> execution interface and no live-world mutation interface anywhere in the kernel.
> Sentinel Grid is not production-ready and does not play any game autonomously.
> In ZekNova, the scripted NPC AI remains the sole live executor.

## What it is

Most game AI couples "decide" to "act". Sentinel Grid separates them completely.
Every stage produces evidence — a certification artifact, a deterministic hash, a
reproducible corpus — and no stage may claim a capability it has not measured. A
stage that fails is recorded as a failure and remediated in a later stage; failed
certifications are never reinterpreted as passes.

Everything is deterministic and replayable: seeded randomness, canonical hashing,
fixed-point arithmetic on the portability-sensitive paths, and byte-equivalent
replay as a certification requirement.

## Architecture

```
            Canonical State
                  │
            Sentinel Prime            bounded depth-2 PUCT search
                  │                   ALWAYS the decision owner
     ┌────────────┴────────────┐
     │                         │
  Oracle                    Nexus     temporal / relational experts
  (7 heads)              (graph delta)  advisory only, cannot name an action
     │                         │
     └────────────┬────────────┘
                  │
          Bounded deterministic Arbiter
                  │
            ┌─────┴─────┐
            │           │
   evidence validity  correctness confidence
   (Stage 2L.7)       (Stage 2L.10)
            └─────┬─────┘
                  │
         final recommendation
                  │
          R0 authority boundary        ← nothing crosses this
```

**Prime** owns the decision. Experts are advisory: they can score legal actions,
never generate or legalize one.

**The Arbiter** may let a single expert move Prime, only inside a certified
ambiguity band, and only when *both* of these hold:

- **Evidence validity** (Stage 2L.7) — is this legitimate, identity-bound, fresh,
  in-runtime, in-campaign, schema-legal, causally certified evidence for this
  exact decision? Default deny; unknown state denies.
- **Expert correctness confidence** (Stage 2L.10) — given legitimate evidence, how
  justified are we in believing this expert should replace Prime? Answered from
  expert-emitted correctness attestations mapped to deterministic uncertainty
  buckets, each carrying a reliability measured on a calibration corpus that is
  disjoint from the certification holdout.

A valid expert that cannot establish decision-specific confidence yields
`ABSTAIN_FROM_DELEGATION` — never trust-by-default.

## Certified intelligence today

| Component | State |
|---|---|
| Sentinel Prime | Bounded depth-2 search, certified. Priors still uniform. |
| Sentinel Oracle | V2 head assembly certified. Only the **direction** head has a calibrated correctness signal. |
| Sentinel Nexus | Relational graph-delta reasoning certified as exact. Stage 2L.13 made it **value-aware**: it now scores relational utility over structure, value, cost and risk, and measures **0.7826** on the grounded benchmark where Prime scores 0.3946 (was 0.0844). Stage 2L.17 raised it to **0.8291** by requiring substitutes to be usable and counting only value not already flowing. It **still abstains from all delegation**: precision 0.989474 against the inherited 0.99 floor, essentially unmoved by the accuracy gain. |
| Arbiter | Certified at Stage 2L.10. Delegations are a strict subset of the Stage 2L.7 delegation set. |
| Router | Outside the certified Prime path. Not certified. |

### Stage 2L.10 holdout — 22,750 cases

| | |
|---|---|
| Prime-only accuracy | 0.5481 |
| Arbiter accuracy | 0.6066 (+5.85 pp) |
| Beneficial changes | 1,332 |
| Harmful changes | **0** (ceiling 1%) |
| Correct-Prime breaks | **0** (ceiling 1%) |
| Delegations / abstentions | 1,332 / 6,899 |
| Oracle correctness discrimination | **+0.5651** |
| Nexus correctness discrimination | 0.0000 (abstains) |

Twelve inherited evidence attacks and nine attacks on the new attestation surface
all fail closed. See
`platform/game-agnostic/artifacts/stage2l10-arbiter-correctness-calibration-and-selective-delegation/stage2l10-report.md`
for the full result including measured residual exposure.

### The Nexus arc (Stages 2L.11 → 2L.18)

Eight stages to move one expert: three to make it accurate, three to work out why
it still could not be trusted, one to fix what the diagnosis found, and one to
establish that the remaining gap cannot be closed with the information available.

**Stage 2L.11** found the *benchmark* was broken: Nexus correctness was an
independent seeded draw, so no expert could be shown good or bad. An analysis
given more information than the Arbiter may use still found nothing above chance,
which ruled out the evidence contract.

**Stage 2L.12** rebuilt the benchmark on deterministic world semantics — entity
value, capacity, availability, risk and cost across seven relation kinds, scored
by a versioned objective function. Ground truth is *computed*, never drawn.
Measured against it: Nexus 0.0844, Prime 0.3946. The limitation was located as
**expert semantics**.

**Stage 2L.13** acted on exactly that. A source audit confirmed the inherited
Nexus path read *none* of the eight quantitative semantic fields — recommendation
and confidence were functions of graph shape and two booleans. The remediated
expert reasons about relational *utility*: value reached through the dependency
graph, priced against cost and risk, discounted for redundancy, emitted as an
auditable decomposition.

| | inherited | remediated |
|---|---|---|
| accuracy | 0.0844 | **0.7826** |
| where structure and value **disagree** | 0.0469 | **0.7520** |
| abstention rate | 0.3899 | 0.0268 |

Prime scores 0.3946; random is 0.1667. The decisive check: identical topology with
the value moved now yields a *different* recommendation. Under the inherited
expert it never did.

**Stage 2L.14** asked whether that confidence gap could be closed by calibration
alone, with the inherited 0.99 floor held fixed. It could not — and the way it
failed is the point.

Three disjoint splits were carved from the frozen corpus: `DEVELOPMENT` (5,261
cases) for exploration, `CALIBRATION` (5,232) as the only split allowed to select,
and `FINAL_HOLDOUT` (5,324) scored once after freezing.

| region `R>=500k / M>=300k` | n | precision |
|---|---|---|
| DEVELOPMENT | 121 | **0.9917** |
| CALIBRATION | 162 | 0.9691 |
| FINAL_HOLDOUT | 136 | **0.9926** |

A conventional two-way split would have selected on the first row, scored the
third, and shipped a pass. The middle draw says otherwise, and the same pattern
holds for every cell on the 25-cell predeclared grid that cleared the floor on
DEVELOPMENT. Best precision anywhere on CALIBRATION: **0.9832**, against a floor of
0.99.

**Nexus still delegates nothing**, and the limitation is now named exactly. It is
not the expert, not the benchmark, not the Arbiter and not the expressiveness of
the confidence contract. It is that this expert's achievable reliability ceiling
on this corpus sits near 0.98. Prime keeps the recommendation on all 5,324 holdout
cases — 0 harmful changes, 0 correct-Prime breaks, 172/172 harmful opportunities
rejected, and 2,332 beneficial opportunities deliberately forgone.

The floor was not lowered. The certify script exits `2` before measuring anything
if it ever is.

**Stage 2L.15** asked whether *decision stability* could find the region 2L.14
could not: does a correct recommendation survive legitimate perturbation more
often than an incorrect one? Eight heterogeneous perturbation families, 15 probes
per case, seeded from world content alone and validated before use — the
benchmark's own optimum survives 99.30% of perturbations.

Stability turned out to be a real signal, lifting out-of-sample discrimination
from **0.6245 to 0.6744**. It was even enough to put one rule over the line on the
calibration split. Carried to the final holdout, that rule delegated **94 times at
0.9894** — one harmful change, and below the 0.99 floor. Every other gate passed.

The reason it fell short is the finding:

| high-confidence region (n=274, 4 wrong) | correct | wrong |
|---|---|---|
| mean margin variance | 31140 | **30074** |
| mean top-action stability | 999471 | **1000000** |

Where delegation would actually happen, the errors are *more* stable than the
successes. They are not unstable, not contradicted, not low-margin. They are
simply wrong, and confidently so — so no confidence rule built from these signals
can exclude them. Estimated ceiling **0.9606**, limitation class
`RESIDUAL_EXPERT_ERROR`.

**Nexus still delegates nothing.** The blocker has moved three times now: accuracy
(fixed at 2L.13), confidence calibration (measured at 2L.14), and now residual
expert error that carries no observable instability. That is reachable by improving
the expert, not by measuring it better.

**Stage 2L.16** stopped measuring confidence and diagnosed the expert. Its first
result contradicts the previous stage's hypothesis: risk is not the problem. Nexus
is 17 points *better* in risk-dominated worlds (0.9022 vs 0.7353), and pricing risk
conditionally measures **net −309**. `RISK_UNDERESTIMATION` appears in 84.6% of
errors and explains none of them — prevalence is not causation.

The dominant defect is one line of reasoning:

> Nexus credits a `BYPASS` whenever a substitute **exists**. The world honours a
> substitute only when it is itself **delivering**.

That is 41.9% of the 3,308 residual errors. A bounded probe correcting only it
lifts accuracy **0.7909 → 0.8130**; aligning the expert's operational threshold
(500,000) with the world's availability threshold (600,000) adds more.

A second finding explains the shape of the errors. The true optimum sits second in
Nexus's ranking 52% of the time — which sounds like near-miss error — yet **73.5%
of its errors choose an action worse than doing nothing**. Both hold because Nexus
*never ranks HOLD*: it orders interventions only and acts whenever its own score
clears zero, a threshold on a private scale never calibrated against the true
do-nothing baseline.

Nothing was remediated. The stage identifies what to fix and stops.

**Stage 2L.17** implemented the fix. A BYPASS is now credited only when some
substitute could actually carry the dependency, and benefit counts only value that
is not already flowing. Both are local edits in a new expert file; the 2L.13
expert is imported frozen and its hash is checked.

| | inherited | remediated |
|---|---|---|
| accuracy | 0.790858 | **0.829108** (+3.83 pp) |
| total errors | 3,308 | **2,703** |
| dead-substitute region | 0.8046 | **0.9193** |
| BYPASS→RESTORE errors | 925 | **417** |

657 errors fixed, 52 broken, 605 net. `SUBSTITUTE_MISVALUATION` falls 1,385 → 517
on the unchanged 2L.16 classifier.

The ablation refused to switch everything on. The abstention half of the
do-nothing baseline measures **net −934 with zero fixes** — because the corpus is
decidability-filtered, so holding is never the right answer in it. That is a limit
of the benchmark, not a refutation of the idea, and it was recorded rather than
shipped.

**And the delegation ceiling did not move.** Precision went from 0.989362 to
**0.989474** against a 0.99 floor — one ten-thousandth, from an expert 3.83 points
more accurate. Still one harmful change, now out of 95 delegations. Whatever
governs that ceiling, it is not the expert's average accuracy.

**Stage 2L.18** went looking for what does. The answer is a population too small
to interrogate: the entire high-confidence wrong tail is **six cases** across all
three splits, against 304 correct.

A bounded search over 34 decision-time features did produce a rule. It is noise:

| | lift |
|---|---|
| observed (development) | **0.2311** |
| permutation null p95 | **0.2311** |
| permutation null p99 | 0.2543 |
| retained on calibration / holdout | 33% / 31% |

The observed lift lands exactly on the null's 95th percentile — the same search
finds a rule this good on *shuffled labels* one time in twenty — and it keeps a
third of its strength out of sample. It fails both criteria independently.

Three candidate mechanisms were ruled out for three different reasons: propagation
fixes **zero** cases here, value diffusion has **no variance** in the region, and
action type has **no contrast** because the region is 310/310 PROTECT by
construction (the rule gates on a risk adjustment the expert assigns only to
PROTECT).

The limit is information, not mechanism — and stated honestly it cuts both ways:
nothing separating was found, and at six positives nothing moderate *could* have
been found. Both routes to the 0.99 floor are now closed: a better expert does not
reach it, and neither does a better confidence rule over the current state.

### The Oracle portfolio (Stage 2L.19)

With the Nexus line closed on principle, Stage 2L.19 turned to the one expert
surface that had never been examined head by head. `assembleOracleV2` composes
**eight** heads — `direction`, `persistence`, `reversal`, `regimeChange`,
`volatility`, `cycle`, `timeToThreshold`, `abstention` — and Stage 2L.10 had
certified exactly one.

Two things had to be settled before a single head could be scored, and both
changed what the question even means.

**Seven of the eight emit labels, not actions.** The assembly declares
`actionMapping: false` and forbids `recommendedAction` and its relatives outright.
Prime emits an action; those seven emit a claim about history. "Does this head beat
Prime" is not a question they can answer, and inventing a label-to-action mapping
would have been this stage fabricating the semantics it was auditing. The honest
baseline for a classifier is the best trivial classifier, and that is what was
used.

**The inherited corpus is degenerate.** 2,400 cases looks ample. It is three
generator families per head, 100 near-identical variants each, with predictions
constant inside every family — so the effective sample size is **3 per head**, not
300. Reporting it as 300 would have repeated the exact failure Stage 2L.11 was
undone by. An independent stress corpus was built instead, and it caught a defect
in its own generator first: a reversal series ran off the top of the range,
clamped, flattened the recent window, and the head's "no reversal" answer was
*correct*. That would have shipped as a head defect. A case is now usable only if
its label is true of the series actually produced, saturation included — 153 of
2,160 were rejected on that test.

The result:

| Head | Stress accuracy | Trivial baseline | Verdict |
|---|---|---|---|
| `direction` | 1.0000 | 0.3429 | **SAFE_SPECIALIST** |
| `volatility` | 1.0000 | 0.5714 | useful, no action path |
| `abstention` | 0.9952 | 0.5714 | useful, no action path |
| `regimeChange` | 0.9167 | 0.5000 | non-identifiable |
| `reversal` | 0.6625 | 0.5000 | non-identifiable |
| `cycle` | 0.5212 | 0.5085 | identifiable but weak |
| `persistence` | 0.3432 | 0.5085 | benchmark cannot score it |
| `timeToThreshold` | 0.8421 | 0.4211 | benchmark cannot score it |

`direction` was revalidated rather than presumed, and had to clear the 0.99 floor
on two independent bodies of evidence: **350/350** on the new stress corpus
(Wilson lower bound 0.992329) and the inherited Stage 2L.10 evidence of 1,332
delegations at precision 1.0 with zero harmful changes (lower bound 0.997973).

The other seven are recorded as `NO_ACTION_DELEGATION_PATH` — never as an
inherited pass. The Stage 2L.10 Arbiter binding pins `head: 'direction'` and its
Oracle signal schema is direction-shaped down to the field names, so any other
head is rejected by identity. Extending that certification to `volatility`
because it also scores 1.0000 would have been borrowing a result that was never
measured.

Two heads cannot be scored at all: `persistence` emits `NON_PERSISTENT` where the
benchmark expects `NOT_PERSISTENT`, and `timeToThreshold` never emits
`CROSSING_1_TO_3`. Each caps achievable accuracy at 0.6667 no matter how well the
head reasons. That is a contract defect between head and benchmark, identified and
left alone.

One measurement artifact was caught before it became a finding. Three heads have
**no wrong cases** on a measurable split, so an AUROC over their correctness is
undefined. Reporting that as 0.5 would read as "chance" and would have classified
the certified `direction` head as non-identifiable. "No errors to predict" and
"the errors cannot be predicted" are different results and are reported as
different results.

So Oracle is **one certified action head plus seven label-only diagnostics** —
architecture, not quality. Nothing says the other seven reason badly; there is
simply no delegation for them to be safe or unsafe about.

### Repairing the contracts (Stage 2L.20)

Stage 2L.19 filed both broken heads under one label: a benchmark vocabulary
problem. Tracing each to its owner showed they were different defects, and that
**one of them had been blamed on the wrong party**.

`persistence` was a real naming drift, and the producer was at fault.
`NOT_PERSISTENT` is canonical by ownership, not by being the benchmark's word for
it: the original head emits it, that head's own corpus expects it, and three
independent stage label schemas declare it. `NON_PERSISTENT` appears in exactly
one place — the remediation that introduced it.

`timeToThreshold` was never broken at all. The head emits `CROSSING_1_TO_3`
correctly whenever that state occurs. What no benchmark ever did was present the
state:

| corpus | cases claiming "about to cross" | already past the threshold |
|---|---|---|
| inherited (2I.4) | 100 | **100** |
| Stage 2L.19 stress corpus | 45 | **45** |

The second row is our own. Stage 2L.19 built a well-posedness filter *specifically*
to stop a generator bug being scored as a head defect — and then wrote a rule that
required the crossing to fall inside the observed window, which for a rising line
guarantees it ends above the threshold. The rule enforced the negation of the
label it was guarding. It caught the reversal family and missed this one.

Repaired, with the producer untouched:

| head | before | after | trivial baseline |
|---|---|---|---|
| `timeToThreshold` | 0.8421 | **1.0000** | 0.2308 |
| `persistence` | 0.3432 | 0.3432 | 0.5085 |

The second row is the more interesting one. Fixing the vocabulary moved
`persistence` by **exactly zero**, on both corpora. The rename was real and is
fixed, but it was never what capped the head: on the inherited corpus the head
does not emit the misnamed label either — it *abstains*. One earlier change had
renamed the label and added an indeterminate-direction abstention at the same
time, and only the second one mattered. That gate lives inside a frozen head, so
it is named, owned, and left alone rather than patched wider.

Nothing frozen was edited. The repair wraps the existing assembly and regenerates
one corpus family, so every prior certification still reproduces byte-identically,
`direction` remains the only head with an action path, and the Arbiter schema is
untouched.

### What "insufficient evidence" means (Stage 2L.21)

That left one question: `persistence` abstained on 60% of cases, and the fix for
that was not a rename. Tracing it back turned up something more interesting than
a bug.

| stage | flat / alternating series expected | head behaviour |
|---|---|---|
| 2I.2 | `NOT_PERSISTENT` | answers |
| 2I.3 | `INSUFFICIENT_EVIDENCE` | abstains |
| 2I.4 | `NOT_PERSISTENT` | **wires the 2I.3 head** |

Neither contract is broken. 2I.3 changed the head *and* its own tests together,
and they agree with each other. 2I.4 then paired that head with the older corpus,
and every stage since scored the mismatch as head error. Nobody had ever
adjudicated which contract was intended.

Doing so needed a rule the project had never written down. Four independent parts
of the system — the original head, the newer head's own reason codes, the Oracle
expert's contract, and the assembly's dedicated abstention head — all treat
abstention as meaning *not enough data*. Three separate label schemas declare
persistence with two labels and no abstention member at all. So:

> Direction certainty and data sufficiency are different things. "No stable
> direction" measured over an adequate window is a **finding** — `NOT_PERSISTENT` —
> not an admission that the question could not be answered.

A 28-frame alternating square wave is not short of evidence. There is plenty, and
it says clearly that nothing is sustained.

On 18 cases written from that definition before either head was run, the original
head scores **1.0000** and the newer one **0.5000** — and the gate prevents
**zero** false assertions. It converts correct answers into abstentions, nine
times out of nine.

Narrowing just that one reason code, leaving the sufficiency check and every
threshold alone:

| corpus | before | after | abstention |
|---|---|---|---|
| frozen 2L.20 corpus | 0.3432 | **0.8517** | 0.6059 → 0 |
| inherited 2I.4 holdout | 0.6667 | **1.0000** | 0.3333 → 0 |

One more thing had to be built first. The existing corpus contains **no case that
expects an abstention**, so "correct abstentions removed: 0" was true by
construction and proved nothing about whether the change was safe. Sixty cases
that genuinely require one were added; all sixty abstentions survive, no false
`PERSISTENT` appears, and no case moves from right to wrong.

## ZekNova status

ZekNova is the first production adapter. Frozen-corpus behavioural parity,
real-state capture, and the sustained-shadow and campaign frameworks are all
certified.

**Live qualification under the current runtime lineage is NOT certified:**

```
accepted records      0
accepted sessions     0
accepted simulations  0
thresholdsPass        false
certified             false
```

It awaits provenance-verified live records under the current lineage. No authority
promotion is available or planned before Stage 10.

## Roadmap position

Current stage: **2L.21 — PASS** (bounded head-semantics remediation; two consistent contracts had been spliced, and abstention was doing the wrong job). Recent history:

| Stage | Result |
|---|---|
| 2L.6 | FAIL — Arbiter failed adversarial evidence and trust-boundary testing |
| 2L.7 | PASS — evidence binding and agreement-safety remediation |
| 2L.8 | PASS — independent 20,020-case red-team replication |
| 2L.9 | FAIL — 4.46% harmful-change rate; no expert-correctness signal existed |
| 2L.10 | PASS — correctness calibration and selective delegation |
| 2L.11 | PASS — Nexus correctness non-identifiable; the benchmark itself was the defect |
| 2L.12 | PASS — benchmark rebuilt on world semantics; Nexus measured at 0.0844 vs Prime 0.3946 |
| 2L.13 | PASS — value-aware Nexus: 0.0844 → 0.7826, still below the delegation floor |
| 2L.14 | FAIL — no supported Nexus confidence region reaches the 0.99 floor; best 0.9832, and the regions that cleared it did not generalize |
| 2L.15 | FAIL — decision stability is a real signal (+0.0499 AUROC) but delegation reaches only 0.9894; ceiling 0.9606, limited by residual expert error |
| 2L.16 | PASS — residual errors decomposed: dominant defect is crediting a BYPASS to a non-delivering substitute (41.9%); risk was ruled out |
| 2L.17 | PASS — live-substitute and do-nothing-delta fixes: 0.7909 → 0.8291, 605 net errors gone; delegation still 0.9894 vs the 0.99 floor |
| 2L.18 | PASS — the delegation tail is six cases; the best rule found sits exactly on the permutation null's p95 and does not generalize |
| 2L.19 | PASS — Oracle's eight heads characterized: `direction` revalidated safe at the 0.99 floor, seven have no action path, two cannot be scored by the current benchmark |
| 2L.20 | PASS — contract repair: `timeToThreshold` 0.8421 → 1.0000 (the benchmark was wrong, not the head); `persistence` vocabulary fixed but accuracy unmoved, exposing a deeper abstention defect |
| 2L.21 | PASS — abstention redefined as data sufficiency rather than direction certainty; `persistence` 0.3432 → 0.8517, with abstention preservation proven on 60 cases added for the purpose |

Full detail in [`platform/game-agnostic/docs/TEN_STAGE_ROADMAP.md`](platform/game-agnostic/docs/TEN_STAGE_ROADMAP.md).

## Layout

```
platform/game-agnostic/     the kernel — start here
  src/core/                 contracts, determinism, authority, recommendations
  src/prime/                Sentinel Prime search
  src/experts/              Oracle and Nexus expert contracts
  src/lab/                  per-stage certification implementations
  scripts/                  certify-*.mjs, one per stage
  tests/                    node:test suites
  artifacts/                certification results and evidence, per stage
  docs/TEN_STAGE_ROADMAP.md the authoritative stage ledger
sgrid-lab/                  earlier ZekNova-specific lab lineage
docs/                       repository-level design and historical notes
```

## Running it

```bash
cd platform/game-agnostic

npm test                              # full suite
npm run arbiter:stage2l10:certify     # regenerate Stage 2L.10 artifacts
npm run arbiter:stage2l10:check       # verify the stored certification reproduces
./verify.sh                           # mainline verifier
```

### Two different things called "verification"

Keep these separate; they are not interchangeable.

- **`FUNCTIONAL_TESTS_PASS`** — the `node:test` suite passes. One test,
  `stage2f-successor-identity`, additionally requires a sibling ZekNova
  repository on disk and is skipped-by-failure when absent; set `ZEKNOVA_ROOT`
  to point at it.
- **`REPOSITORY_CERTIFICATION_PASS`** — `npm run sha256:check` and
  `npm run evidence:check` both reproduce, meaning the committed deterministic
  evidence and file inventory match the current lineage.

Green tests do not imply a certified repository, and a stale inventory does not
imply broken code.
