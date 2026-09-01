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
| Sentinel Nexus | Relational graph-delta reasoning certified as exact. Stage 2L.13 made it **value-aware**: it now scores relational utility over structure, value, cost and risk, and measures **0.7826** on the grounded benchmark where Prime scores 0.3946 (was 0.0844). It **still abstains from all delegation**: Stages 2L.14 and 2L.15 calibrated its confidence and its decision stability across three disjoint splits and found no supported region reaching the inherited 0.99 floor (best delegation precision 0.9894). |
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

### The Nexus arc (Stages 2L.11 → 2L.15)

Five stages to move one expert, and the blocker moved three times.

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

Current stage: **2L.15 — FAIL** (a measured negative result, reported unremediated). Recent history:

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
