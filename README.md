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
| Sentinel Nexus | Relational graph-delta reasoning certified as exact. **Abstains from all delegation.** Stage 2L.12 rebuilt the benchmark on real world semantics and measured Nexus at **0.0844**, where Prime scores 0.3946 and the best trivial policy scores 0.3931. The limitation is the expert's semantics: it reasons about structure while optimality is set by value, cost and risk. |
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

### Why Nexus contributes nothing (Stages 2L.11 → 2L.12)

This took two stages to pin down, and the answer moved.

**Stage 2L.11** found the *benchmark* was broken. Nexus correctness was decided by
an independent seeded draw, so no expert could be shown good or bad. An analysis
given **more** information than the Arbiter may use — every field Nexus computes
internally, plus the entire 19-signal certified expert contract that is not in the
Arbiter path — still found nothing above chance. That ruled out the evidence
contract as the culprit.

**Stage 2L.12** rebuilt the benchmark on deterministic world semantics: entity
value, capacity, availability, risk and cost across seven relation kinds, scored
by a versioned objective function over five action kinds. Ground truth is
*computed*, never drawn. Topology and semantics are sampled from independent
streams so structural attractiveness and objective utility can disagree — and
eight semantic profiles ensure they do.

Measured against that benchmark: **Nexus 0.0844, Prime 0.3946**, random 0.1667,
best trivial policy 0.3931. Nexus scores 0.1432 where structure carries the value
and 0.0225 where the value sits on a low-degree leaf.

Correctness is now partially predictable, but the signal is `baselineUtility` —
world state the Arbiter does not receive. Every feature Nexus itself emits falls
below the permutation null. The limitation is **expert semantics**: Nexus reasons
about structure while optimality is set by value, cost and risk, quantities that
are present in the canonical state but that its contract does not read.

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

Current stage: **2L.12 — PASS**. Recent history:

| Stage | Result |
|---|---|
| 2L.6 | FAIL — Arbiter failed adversarial evidence and trust-boundary testing |
| 2L.7 | PASS — evidence binding and agreement-safety remediation |
| 2L.8 | PASS — independent 20,020-case red-team replication |
| 2L.9 | FAIL — 4.46% harmful-change rate; no expert-correctness signal existed |
| 2L.10 | PASS — correctness calibration and selective delegation |
| 2L.11 | PASS — Nexus correctness non-identifiable; the benchmark itself was the defect |
| 2L.12 | PASS — benchmark rebuilt on world semantics; Nexus measured at 0.0844 vs Prime 0.3946 |

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
