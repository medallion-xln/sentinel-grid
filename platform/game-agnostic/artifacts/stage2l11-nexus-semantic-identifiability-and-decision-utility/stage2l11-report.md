# Stage 2L.11 — Nexus semantic identifiability and decision-utility certification

**Status: PASS** · `NEXUS_IDENTIFIABILITY_STATUS = NON_IDENTIFIABLE_CURRENT_TASK`
Authority R0 · `canDispatch=false` · `canMutateLiveWorld=false` · Prime remains the decision owner.

> **A PASS here does not mean Nexus is good.** It means the identifiability
> question was answered conclusively and reproducibly. The measured verdict on
> Nexus itself is negative and is stated as such.

## The question

Stage 2L.10 safely contained Nexus — 0 delegations, 0 harm — but did not establish
useful selective Nexus delegation. Every structural reliability bucket measured
0.52–0.54 against a 0.99 floor, and 1,849 correct Nexus opportunities were
abstained from.

Was that because Nexus correctness is genuinely unobservable, or because the
evidence contract discards a signal Nexus already computes?

Three outcomes were possible. None was assumed.

## Method

### The corpus had to be able to detect a signal

On the Stage 2L.10 Nexus corpus, 30 of 46 candidate features are **constant**
across delegation opportunities. A null result there would have shown only that
the features never varied — not that they carry no information.

Stage 2L.11 therefore generates **twelve topology families** that vary every axis
Stage 2L.10 held fixed: `SPARSE_CHAIN`, `DENSE_MESH`, `SINGLE_BRIDGE`,
`TANDEM_BRIDGES`, `REDUNDANT_PARALLEL`, `CYCLE_WITH_BRIDGE`, `WIDE_FAN_BRIDGE`,
`DISCONNECTED_COMPONENT`, `TYPED_RELATION_CONFLICT`, `INCOMPLETE_RELATIONS`,
`AMBIGUOUS_EQUIVALENT_PATHS`, `THREAT_SUPPORT_NETWORK`.

| | discovery | holdout |
|---|---|---|
| cases | 6,000 | 12,000 |
| delegation opportunities | 2,898 | 5,809 |
| overlap | 0 | 0 |

### The analysis was given more than the Arbiter may use

Deliberately. Four feature tiers, 60 features, 264 predicates:

| tier | contents |
|---|---|
| `TIER_EXPOSED` | exactly what the Stage 2L.10 attestation carries today |
| `TIER_COMPUTED` | what `analyzeRelationalDelta` / `relationalReference` compute but the attestation drops |
| `TIER_EXPERT` | the full 19-signal certified `evaluateNexus` contract, which is **not in the Arbiter path at all** |
| `TIER_CONTEXT` | legitimate Arbiter-visible decision context (margin, band, action count) |

This is the decisive design choice. If correctness cannot be predicted even from
the union of all four, then widening the evidence contract cannot help, and
`CONTRACT_INCOMPLETE` is **empirically excluded** rather than merely doubted.

### Chance was measured, not assumed

A search over 264 predicates will always find *something*. The identical search
was therefore re-run against permuted correctness labels — destroying any real
association while preserving every feature distribution and the size of the
search. That null distribution is the yardstick.

## Result 1 — no feature beats chance

| | value |
|---|---|
| best gap over all 264 predicates, all 4 tiers | **0.0520** (`expert.maxDependencyDepth==6`) |
| permutation null, median | 0.0593 |
| permutation null, p95 | 0.0766 |
| observed exceeds null p95? | **no** |
| any predicate reaching the 0.99 floor? | **no** |

The best signal a search over every legitimate Nexus field can find is **weaker
than what the same search finds on shuffled labels**.

Per-tier best gap:

| tier | best gap |
|---|---|
| `TIER_EXPOSED` | 0.0520 |
| `TIER_EXPERT` | 0.0520 |
| `TIER_COMPUTED` | 0.0433 |
| `TIER_CONTEXT` | 0.0433 |

No tier outside the exposed contract out-performs the exposed one.

## Result 2 — a frozen rule collapses out of sample

A generous search — 264 single predicates plus 780 pairwise conjunctions — was run
on discovery, the best rule frozen, and carried unchanged to the holdout.

| | |
|---|---|
| frozen rule | `(computed.declaredEntityCount==6) AND (expert.edgeCount==5)` |
| discovery reliability | 0.5947 (support 227) |
| **holdout reliability** | **0.5242** (support 454) |
| holdout base rate | 0.5338 |
| reliability lost | 0.0705 |
| reaches the 0.99 floor on holdout? | **no** |
| collapsed to base rate? | **yes** |

The rule performs *below* the holdout base rate. It was a dataset shortcut, and
the holdout said so.

## Result 3 — why, exactly

Nexus is correct precisely when:

```
expertCorrect = candidateIsSpof  AND  nexusAligned
                └─ observable ─┘       └─ hidden draw ─┘
```

Conditioning on a delegation opportunity fixes the first conjunct true. What
remains is **identically the hidden draw** — verified on every one of the 5,809
holdout opportunities, not asserted.

That draw comes from a seeded stream that is:

| | Nexus | Arbiter | Prime | available at real decision time |
|---|---|---|---|---|
| `nexusAligned` | no | no | no | **no** |

In Stage 2L.11 it is placed on a stream *separately derived* from the topology
stream, so the two cannot share structure even incidentally.

## Classification

**`NON_IDENTIFIABLE_CURRENT_TASK`**

- `IDENTIFIABLE` — ruled out: the frozen rule collapsed to below base rate.
- `CONTRACT_INCOMPLETE` — ruled out: the fuller tiers, including the entire
  certified expert contract, carry no more signal than the exposed one, and none
  beats chance.
- `INCONCLUSIVE` — ruled out: 5,809 opportunities, 40 varying features, 205
  evaluable predicates, and every attainable stress cell populated.

### Where the defect actually lives

**`CORPUS_SEMANTICS_AND_WORLD_STATE_OBSERVABILITY` — not Nexus.**

Nexus's relational computation is exact and is not at fault. The corpus models
semantic alignment as an independent coin flip at a declared 0.7 rate, rather than
as a function of latent world state. And the observation stream carries no utility
information from which any expert could recover it.

What would make it observable:

1. Objective or utility weights over entities in the canonical observation stream.
2. Per-entity value, threat cost, or mission-criticality scoring the adapter does
   not currently emit.
3. An outcome channel linking structural criticality to realised utility, which no
   current corpus provides.

**The minimum contract change required is: none.** Widening the evidence contract
cannot help. This is not a plumbing problem.

## Stress-cell coverage (holdout opportunities)

| cell | count |
|---|---|
| dense + Nexus correct / wrong | 1,359 / 1,220 |
| sparse + Nexus correct / wrong | 1,742 / 1,488 |
| high support + Nexus wrong | 911 |
| low support + Nexus correct | 2,026 |
| Prime correct / Nexus wrong | 1,298 |
| Prime wrong / Nexus correct | 3,101 |
| conflicting relations | 666 |
| incomplete relations | 640 |
| ambiguous criticality topology | 3,350 |
| cyclic topology | 1,355 |
| multi-component topology | 646 |
| multiple critical nodes | 1,925 |

Two cells are empty **by logic, not omission**, and are reported as such:

- `primeCorrectNexusCorrect = 0` — a delegation opportunity requires Nexus to
  point somewhere other than Prime's pick. If Nexus is correct its pick *is* the
  truth action, so a correct Prime would already have chosen it.
- `noCriticalityFamilyOpportunities = 0` — `DENSE_MESH`,
  `AMBIGUOUS_EQUIVALENT_PATHS` and `REDUNDANT_PARALLEL` have no single point of
  failure, so Nexus has nothing to recommend. Those cases are still generated and
  measured; they exercise the silent path, which is correct behaviour.

## Delegation evaluation — unmodified Stage 2L.10 machinery

The corpus was run through the **real** Stage 2L.10 arbiter with its **real**
frozen calibration. No threshold was lowered to create Nexus traffic.

| | |
|---|---|
| inherited (Stage 2L.7) delegations | 4,246 |
| Nexus delegations | **0** |
| Nexus delegation rate / precision | 0 / n/a |
| Nexus beneficial / harmful changes | 0 / **0** |
| Nexus harm rate | **0.000000** |
| Nexus correct-Prime breaks | **0** |
| Nexus correctness discrimination | **0.000000** |
| expert correct, abstained | 3,101 |
| expert wrong, abstained | 2,708 |

Twelve topology families the Stage 2L.10 calibration never saw are a genuine
out-of-distribution test, and the inherited protections held: zero harm, zero
correct-Prime breaks, zero delegations. The abstention is *measured* — the
inherited Arbiter wanted to delegate 4,246 times and the correctness gate
declined every one.

## Security regression

All inherited protections re-tested on the new topology, all PASS: stale evidence,
cross-runtime, cross-campaign, malformed, unknown schema, duplicate handling,
illegal action, ambiguous binding, ordering invariance, replay determinism,
failure isolation, R0 boundary.

## Methodology guarantees

- Discovery and holdout disjoint (overlap 0); `discoverStage2L11Rule` throws on
  holdout rows, `testStage2L11Generalization` throws on discovery rows.
- No label leakage: no forbidden key in any arbiter input; disposition is a
  function of (bucket, band, inherited delegation) alone; the feature vector
  handed to the analysis contains no outcome.
- Replay byte-equivalent; the identifiability analysis is deterministic including
  its permutation null.
- Nexus, the Stage 2L.10 arbiter, and the frozen calibration are byte-frozen and
  verified before any case is measured.
- No inherited threshold loosened: 0.99 reliability floor, 60-sample minimum, 1%
  harm ceiling, 1% correct-Prime-break ceiling, all unchanged.

## Limitations

- Portability remains `DIGEST_PRODUCED_SINGLE_PLATFORM` (linux/x64, Node
  v22.22.2). Stage 2L.11 does not change that and claims no cross-platform
  deterministic certification.
- The conclusion is scoped to the **current task**: the SPOF-vs-utility-optimal
  semantics as the corpus defines them. It is not a claim that relational
  reasoning can never be useful — it is a claim that under this semantic model, no
  decision-time observable predicts correctness.
- No live ZekNova decision delta is measured or claimed.

## Reproduction

```
npm run nexus:stage2l11:certify
npm run nexus:stage2l11:check
npm run test:stage2l11-nexus-identifiability
```
