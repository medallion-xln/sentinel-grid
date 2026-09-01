# Stage 2L.10 — Arbiter correctness calibration and selective delegation

**Status: PASS** · Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the final decision owner.

## The failure this remediates

Stage 2L.9 established that the Stage 2L.7 Arbiter can prove an expert packet is
*authentic* — identity-bound, fresh, in-runtime, in-campaign, schema-legal,
causally certified, head-eligible — and still have no idea whether the expert is
*right*.

Measured over 20,500 cases, it delegated at essentially the same rate whether the
expert was correct or wrong:

| | delegation rate when correct | when wrong | discrimination |
|---|---|---|---|
| Oracle | 0.7155 | 0.7193 | **−0.0038** |
| Nexus | 0.7304 | 0.7274 | **+0.0030** |

Harm followed: a 4.46% harmful-change rate against an inherited 1.00% ceiling,
915 correct-Prime breaks, and Nexus delegation precision of 52.7% — barely better
than a coin toss.

The diagnosis is that *evidence validity* and *expert correctness confidence* are
different questions, and only the first was being asked.

## What Stage 2L.10 adds

### 1. Stage 2L.7 keeps its veto

The remediation is a **strict refinement**:

```
delegate(2L10)  ⊆  delegate(2L7)
```

The frozen Stage 2L.7 arbiter runs first, unmodified, on a pristine Stage 2L.7
input. When it returns Prime — through the ambiguity gate, the fail-closed
matrix, disagreement, consensus, or absence of valid evidence — Stage 2L.10
returns Prime. Stage 2L.10 can only ever turn one of its delegations into an
abstention, never the reverse. Every inherited protection therefore survives by
construction rather than by re-testing, and the property is asserted on every
holdout row (`delegationsNotAuthorisedByInheritedArbiter = 0`).

### 2. A correctness attestation, separate from the evidence packet

Stage 2L.7's validator matches its evidence key set *exactly*, so nothing can be
smuggled into it. Correctness signals therefore travel in a separate packet:

```
SENTINEL_GRID_EXPERT_CORRECTNESS_ATTESTATION_V1
  decisionBinding          the same eight fields Stage 2L.7 binds
  evidencePacketDigest     names the exact packet it speaks for
  measurementRuleIdentity  which measurement rule produced the signals
  signals                  expert self-reported, no outcome, no action
  attestationDigest        seals the whole body
```

Because it carries the identical decision binding, it inherits staleness,
cross-runtime, cross-campaign and cross-observation rejection for free.

**Oracle signals** are the direction head's own claim cross-checked against its
own two slope estimates: `claim`, `supported`, `confidence`, `fullSlopeMicro`,
`recentSlopeMicro`, `samples`, `historySufficiency`. Slopes are fixed-point
integers (×10⁶) so bucket boundaries are exact and platform-independent.

**Nexus signals** are its structural findings — criticality, path redundancy,
critical-set cardinality — plus the honest declaration
`semanticOptimalityCertified: false`: Nexus's relational analysis is exact, but
nothing in it certifies that the structurally critical entity is the
*utility-optimal* action.

### 3. Uncertainty buckets with measured reliability

Signals map to a deterministic bucket; each bucket carries an empirically
measured reliability drawn **only** from the calibration corpus. Delegation
requires *all* of:

```
evidenceValid (2L7)
  AND expertEligible (2L7)
  AND attestation valid and bound to the accepted packet
  AND bucket structurally eligible
  AND bucket calibrated (≥ 60 observations)
  AND bucket reliability ≥ 0.99
  AND Prime ambiguity margin within the calibrated protection band
      → DELEGATE
otherwise
      → ABSTAIN_FROM_DELEGATION
```

The 0.99 floor was fixed **a priori** from the inherited ≤1% harm ceiling, not
swept. What is calibrated is the *table*, not the floor.

## Calibration methodology

| | calibration | holdout |
|---|---|---|
| cases | 8,450 | 22,750 |
| seed domain | `SG2L10C` | `SG2L10H` |
| case-id prefix | `stage2l10c-` | `stage2l10h-` |
| corpus overlap | 0 | 0 |

Parameters were selected from calibration alone, by a rule declared in full
before any measurement was read:

1. keep candidates whose delegating bucket is calibrated and clears the floor;
2. among those, maximise recovered delegation opportunities;
3. break ties toward the **more conservative** candidate.

Selected: `recentSlope ≤ (3/2)·fullSlope`, `minFullSlope = 500` micro-units.

`deriveStage2L10Calibration` refuses holdout rows outright
(`STAGE2L10_CALIBRATION_SPLIT_VIOLATION`), and a test asserts that re-deriving
from the calibration corpus reproduces the frozen table byte-for-byte, so the
freeze cannot silently drift from its evidence.

### Calibrated Oracle reliability table

| bucket | opportunities | reliability | structurally eligible | delegates |
|---|---|---|---|---|
| `ORACLE_DIRECTIONAL_COHERENT` | 449 | 1.000 | yes | **yes** |
| `ORACLE_STABLE_EXACT` | 117 | 1.000 | yes | **yes** |
| `ORACLE_UNSUPPORTED_HEAD` | 82 | 1.000 | **no** | no |
| `ORACLE_DIRECTIONAL_RECENT_DOMINATED` | 265 | 0.208 | yes | no |
| `ORACLE_DIRECTIONAL_CONTRADICTED` | 207 | 0.121 | yes | no |
| `ORACLE_DIRECTIONAL_FULL_WINDOW_FLAT` | 202 | 0.000 | yes | no |
| `ORACLE_STABLE_UNSTEADY` | 148 | 0.000 | **no** | no |

`ORACLE_UNSUPPORTED_HEAD` measured **reliability 1.0 and is still refused**.
Delegating on a head the expert itself declares unsupported is not positive
justification; a high score on evidence the expert disowns is a coincidence. This
a-priori structural precondition only ever removes delegations.

### Calibrated Nexus reliability table

| bucket | opportunities | reliability | delegates |
|---|---|---|---|
| `NEXUS_WIDE_FAN_CRITICAL` | 371 | 0.544 | no |
| `NEXUS_MULTIPLE_CRITICAL_NODES` | 364 | 0.522 | no |
| `NEXUS_SOLE_CRITICAL_NODE` | 349 | 0.524 | no |
| `NEXUS_REDUNDANT_PATH` | 0 | — | no |
| `NEXUS_NO_STRUCTURAL_CRITICALITY` | 0 | — | no |

**No Nexus bucket clears the floor, so Nexus abstains entirely.** This is a
*measured* outcome, not a design preference. Nexus's structural analysis is
exact, but whether the structurally critical entity is also the utility-optimal
one is drawn from an independent stream — the declared corpus parameter inherited
verbatim from Stage 2L.9 — and moves with no signal Nexus can observe. Correlating
it with an observable would have manufactured the very signal this stage exists to
test for.

## Corpus honesty

The holdout deliberately contains regimes built to defeat the coherence signal in
both directions. A corpus containing only cases the gate handles would manufacture
its own pass.

| regime | holdout cases | Oracle correct | delegated | harmful |
|---|---|---|---|---|
| `LATE_REVERSAL_NET_RISE` — Oracle **right**, slopes look incoherent | 620 | 620 | **0** | 0 |
| `MEAN_REVERTING_LATE_DISPLACEMENT` — Oracle **wrong**, slopes agree | 579 | 0 | **0** | 0 |
| `STEP_LEVEL_SHIFT` — two stable levels read as a trend | 556 | 0 | 0 | 0 |
| `MICRO_DRIFT_UP` / `_DOWN` — drift below the noise floor | 1,193 | — | 53 | 0 |
| `NOISY_STRONG_RISE` — real trend buried in noise | 551 | 551 | 203 | 0 |
| `ZERO_DRIFT_OSCILLATION` — the Stage 2L.9 harm source | 623 | 0 | **0** | 0 |

`LATE_REVERSAL_NET_RISE` is the cost side of the ledger, paid visibly: Oracle is
correct on all 620 cases and the gate abstains on all 620, because its recent
window contradicts its own claim. That is a utility loss, not a safety loss, and
it is reported rather than tuned away.

`MEAN_REVERTING_LATE_DISPLACEMENT` was the intended trap — a case where Oracle is
confidently wrong *and* both slopes agree. The conservative 3/2 ratio chosen by
the calibration sweep caught it, because the late displacement still dominates the
full-window trend by more than 3/2.

## Holdout results — 22,750 cases

| metric | Stage 2L.9 | Stage 2L.10 |
|---|---|---|
| Prime-only accuracy | 0.4994 | 0.5481 |
| Arbiter accuracy | 0.6148 | 0.6066 |
| absolute improvement | +11.54 pp | **+5.85 pp** |
| beneficial changes | 3,281 | 1,332 |
| harmful changes | 915 | **0** |
| harmful-change rate | 0.0446 | **0.0000** |
| correct-Prime breaks | 915 | **0** |
| delegation precision | 0.635 | **1.000** |

Stage 2L.9's larger headline improvement was bought with 915 correct-Prime
breaks. Stage 2L.10 gives up roughly half the raw improvement and all of the harm.

Delegations 1,332 · abstentions 6,899 · abstention rate among inherited
delegations 0.838.

### Correctness discrimination — the question the stage exists to answer

| | Oracle | Nexus | combined |
|---|---|---|---|
| delegation opportunities | 4,741 | 3,422 | 8,163 |
| expert correct, delegated | 1,332 | 0 | 1,332 |
| expert correct, abstained | 1,025 | 1,849 | 2,874 |
| expert wrong, delegated | **0** | **0** | **0** |
| expert wrong, abstained | 2,384 | 1,573 | 3,957 |
| rate when correct | 0.5651 | 0.0000 | 0.3167 |
| rate when wrong | 0.0000 | 0.0000 | 0.0000 |
| **discrimination** | **+0.5651** | 0.0000 | **+0.3167** |
| Stage 2L.9 baseline | −0.0038 | +0.0030 | — |

The signal separates correct from wrong expert evidence. Nexus's exact zero is the
correct outcome for an expert whose correctness is not identifiable from anything
it can report: it abstains rather than guessing.

## Prime protection

Prime protection was **measured, not assumed**. Across every ambiguity band, no
gate-passing calibration delegation was harmful, so no margin restriction beyond
the inherited 0.03 ambiguity threshold is warranted, and the frozen protection
margin is exactly that threshold.

The honest finding is that harm is driven by *expert correctness*, not by Prime's
margin — the two are independent by construction in this corpus. The protection
that actually works is the correctness gate itself: when a bucket is uncalibrated,
structurally ineligible, or below the floor, Prime is protected absolutely. On
holdout that produced **zero** correct-Prime breaks.

## Security regression

All twelve inherited evidence attacks still fail closed with zero evidence
accepted and zero selection changes: stale, cross-runtime, cross-observation,
cross-campaign, malformed, missing, illegal-action, unknown-schema, unknown-rule,
conflicting-duplicate, ambiguous action binding, ambiguous channel/entity binding.

Nine **new** attacks target the attestation surface itself. On every one the
inherited Arbiter wanted to delegate, and every one abstains:

| attack | abstention reason |
|---|---|
| `AT_MISSING_ATTESTATION` | `oracle_correctness_attestation_absent` |
| `AT_MALFORMED_ATTESTATION` | `..._attestation_schema_fields_unknown` |
| `AT_STALE_ATTESTATION` | `..._attestation_decision_binding_mismatch` |
| `AT_CROSS_RUNTIME_ATTESTATION` | `..._attestation_decision_binding_mismatch` |
| `AT_UNBOUND_EVIDENCE_DIGEST` | `..._not_bound_to_accepted_evidence` |
| `AT_FORGED_SIGNALS` | `..._attestation_digest_invalid` |
| `AT_DUPLICATE_ATTESTATION` | `..._duplicate_attestation` |
| `AT_WRONG_EXPERT_ATTESTATION` | `oracle_correctness_attestation_absent` |
| `AT_UNKNOWN_SIGNAL_KIND` | `..._oracle_signal_kind_unknown` |

Replay is byte-equivalent; evidence order, attestation order and legal-action
order are invariant; failures in the arbiter, the calibration table, the
attestation or the expert all isolate to Prime and authorise nothing.

## No label leakage

Three independent checks:

- **Structural** — no key anywhere in a Stage 2L.10 input names an outcome, truth
  action, case identity, corpus index or split. 78 distinct keys inspected, 0 hits
  against the forbidden list.
- **Behavioural** — across all 22,750 holdout rows, the disposition is a function
  of (uncertainty bucket, margin band, inherited delegation) **alone**. All 68
  groups are single-valued; 0 are correctness-sensitive. If knowing whether the
  expert was right could change the decision, some group would have to split.
- **Procedural** — `deriveStage2L10Calibration` throws on holdout rows; the
  runtime arbiter reads only the frozen table and never touches a corpus.

## Residual exposure

Stated plainly, because a harmful-change rate of exactly zero invites
over-reading:

- Zero harm is measured **on this corpus**. The corpus includes a regime designed
  to be coherent-and-wrong, and the calibrated ratio caught it — but a
  displacement slower than 3/2 of the full-window trend would pass the gate and
  be wrong. The mechanism bounds risk; it does not eliminate it.
- The Oracle signal covers the **direction head only**. Six other Oracle heads
  have no calibrated correctness signal and cannot currently justify a delegation.
- Nexus contributes **no** utility at present. 1,849 correct Nexus delegation
  opportunities were abstained from. Recovering them requires Nexus to be able to
  certify semantic optimality, which is a Nexus contract question, not an Arbiter
  one.
- Portability is recorded on a **single** platform (linux/x64, Node v22.22.2).
  Status is `DIGEST_PRODUCED_SINGLE_PLATFORM`, not `PASS`.
- No live ZekNova decision delta is measured or claimed.

## Reproduction

```
npm run arbiter:stage2l10:certify   # regenerate every artifact
npm run arbiter:stage2l10:check     # verify the stored certification reproduces
npm run test:stage2l10-selective-delegation
```
