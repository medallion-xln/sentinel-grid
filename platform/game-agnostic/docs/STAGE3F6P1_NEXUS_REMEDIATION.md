# Stage 3F.6-P.1 — NEXUS Risk-Response Remediation

Certification `48462a169c88337a9f27315c3e10b83f615e077a8ba2dc6751fdf437351d31e4`
Candidate freeze `fb649ba894f5f51b1e9acb7523ea23c7b6feb1dbe00673fe6ab147df11550369`
Candidate `NEXUS_SELECTOR_V2_CANDIDATE`, hash `8c658bfa…a900`, source `965cb36f…1577`

This is a narrow substage of Stage 3F.6-P, not a new roadmap stage.

## The question

Can a minimal, deployable change to NEXUS's action-type mapping materially improve its absolute quality
while preserving its relational role?

## Answer

**Only by giving up that role.** Result: **`D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION`**
(`NEXUS_REMEDIATION_BLOCKED_BY_REPRESENTATION=true`).

Removing reflexive PROTECT makes NEXUS far better standalone. On CAL, regret falls from 52.1 to 21.5 and
accuracy rises from 0.22 to 0.64. But almost all of that gain comes from choosing MOVE. The candidate then
makes the same decision as RESOURCE 76.9% of the time, and the policy set gets **worse** (oracle regret
15.82 → 18.56). No entity-targeted relational action can close the gap. The gain lies in *which direction to
move*, and NEXUS's inputs contain no positions.

## Discipline

- **V1 preserved.** `NEXUS_SELECTOR_V1` (`src/lab/stage3c-learned-nexus.js#nexusRelationalSelector`) is
  byte-identical to HEAD and still reproduces every certified Stage 3F.6-A choice: 0 fidelity mismatches
  on DEV and on CAL.
- **Candidate is separate and simulator-free.** V2 lives in `src/stage3f/nexus-selector-v2-candidate.js`.
  It does not import V1, because V1's module imports simulator code. Its full transitive import graph
  contains only `core/`, `experts/nexus.js` and `stage3f/deployable-action-proposal-v1.js`. V1's ranking is
  carried verbatim, and with the gate disabled the candidate reproduces V1 on every DEV and CAL row.
- **DEV built, CAL evaluated once.** DEV evidence was generated first and used alone for the audit and the
  design. The candidate, its source hash and every CAL rule were then written to an immutable freeze.
  The CAL generator refuses to run without that freeze, and the CAL manifest binds the freeze hash. CAL
  was evaluated exactly once. Nothing was changed after CAL.
- **Decision inputs are separated from labels.** Each evidence row stores `decisionInput` (observed
  relational state + legal action surface) apart from `labels`. Only `decisionInput` reaches either policy.
- **Diagnostic only.** The evaluation used DEV and CAL. Prior HOLDOUT and OOD splits were not read.
  `CONFIRMATORY_CLAIMS=false`.

## V1 audit (DEV)

**Decision table.**

| Branch | Condition | Selected | Target | Tie-break |
| --- | --- | --- | --- | --- |
| V1-0 | no legal actions | abstain | — | — |
| V1-1 | no structural code, or no relationships | abstain | — | — |
| V1-2 threat-driven | UNSUPPORTED or UNCOVERED threat | first legal of REINFORCE > PROTECT > REPAIR > SUBSTITUTE > ATTACK > TRANSFER > COLLECT > MOVE > RETREAT > WAIT | not consulted | smallest action identity |
| V1-3 structure-driven | structural code, no threat | first legal of REPAIR > SUBSTITUTE > REINFORCE > TRANSFER > COLLECT > PROTECT > MOVE > ATTACK > RETREAT > WAIT | not consulted | smallest action identity |

**Why PROTECT dominates.** PROTECT is legal in every DEV row: it needs only energy ≥ 1 and any adjacent
non-hostile entity. The types ranked above it are rarely legal: REINFORCE and REPAIR in 8% of rows, and
SUBSTITUTE is not a Forge action type at all. The target is never consulted. V1 therefore picks PROTECT in
91.7% of its decisions, and PROTECT carries **95.2%** of V1's regret. Of the legal PROTECT actions, 73% target
never-threatened RESOURCE pickups.

**PROTECT evidence behind the remediation.** PROTECT on an observed-threatened target: n = 79, optimal
48.1%, regret 25.3. PROTECT on an unthreatened target: n = 4674, optimal 17.4%, regret 53.8.

**Action-type confusion** (V1 selected × primary optimal type, DEV, n = 3337 proposing):

| selected \ optimal | MOVE | PROTECT | REINFORCE | REPAIR | RESTORE | BYPASS |
| --- | --- | --- | --- | --- | --- | --- |
| PROTECT (3061) | 2888 | 130 | 0 | 0 | 31 | 12 |
| REINFORCE (169) | 53 | 42 | 25 | 48 | 1 | 0 |
| REPAIR (107) | 41 | 23 | 23 | 19 | 0 | 1 |

| Type | selected | precision | recall | mean regret | optimal present |
| --- | --- | --- | --- | --- | --- |
| MOVE | 0 | — | 0.000 | — | 89.7% |
| PROTECT | 3061 | 0.231 | 0.912 | 52.2 | 23.2% |
| RETREAT | 0 | — | 0.000 | — | 18.5% |
| REINFORCE | 169 | 0.231 | 0.534 | 31.8 | 2.2% |
| REPAIR | 107 | 0.608 | 0.389 | 24.4 | 5.0% |
| TRANSFER / BUILD / COLLECT | 0 | — | — | — | 0% (never legal in these rows) |

**Target mapping.** P(correct target | correct type) = **0.936** (n = 810), so target choice is not the main
defect. The exception is the 79 rows where a threatened target can be protected. There V1 picks the right
target only 4% of the time (n = 25), because the lowest action identity wins, not the threatened entity.

**Threat regimes.** V1 regret barely moves across regimes: hostile present 50.4 vs none 50.0; dependency
bottleneck 50.5 vs none 49.3. MOVE is optimal in about 89–90% of rows in every regime. No actor was ever
directly threatened (n = 0).

**Representation audit.** Perfect choice among entity-targeted actions reaches only 48.1 regret, 2.1 better
than V1 and not material. MOVE is optimal in 89.7% of rows, but the best and worst MOVE directions differ
by 101.9 regret on average, and the directions are never all equivalent. NEXUS's inputs carry no positions.

## Candidate

One change: **PROTECT is admissible only when its target has at least one observed `threatens` edge.**
Inadmissible PROTECT actions are removed before V1's unchanged ranking. Diagnosis, abstention, both
orders, the tie-break and confidence are unchanged, so coverage is identical to V1.

DEV screening of six variants happened before the freeze in exploratory scripts, not certification
inputs; the freeze discloses it. Every variant that cut PROTECT improved standalone quality, raised RESOURCE
agreement (0.60–0.80) and worsened the policy-set oracle. The distinctiveness and policy-set rules were
written after those DEV values were seen, and CAL is their first evaluation.

## CAL (n = 4000; NEXUS proposes in 3370)

| | V1 | V2 | Δ (95% CI) |
| --- | --- | --- | --- |
| accuracy | 0.2223 | **0.6424** | +0.4202 (+0.399, +0.440) |
| mean regret | 52.09 | **21.51** | −30.59 (−32.42, −28.70) |
| p95 / p99 | 147 / 213 | 122 / 190 | better |
| P(regret > 100) | 0.155 | 0.069 | better |
| worst | 389 | **438** | worse (single episode) |
| PROTECT / MOVE rate | 0.910 / 0.000 | 0.017 / 0.872 | |

Materiality (Δregret ≤ −5, Δacc ≥ +0.05, CIs exclude 0, p95 and P(>100) not worse): **met**.

**Conditioned on NEXUS being best**
- *V1-best episodes (n = 1436):* V1 0.522 / 28.86 vs V2 0.459 / **37.60**. V2 is worse exactly where V1
  added value.
- *V2-best episodes (n = 3146):* V2 0.688 / 18.13. P(≤5) 0.711, P(≤10) 0.747, P(≤25) 0.796, P(>50) 0.133,
  P(>100) 0.058. This is above the Stage 3F.6-P KEEP bar of 15.

**Distinctiveness.**

| | agreement with RESOURCE | agreement with GREEDY |
| --- | --- | --- |
| V1 | 0.000 | **0.808** |
| V2 | **0.769** | 0.039 |

V1 and V2 agree on 9.2% of decisions. Agreement ≥ 0.5 means `HIGH_RESOURCE_COLLINEARITY`. It stays below
the 0.8 policy-collapse flag, but most of V2's decisions are RESOURCE's.

**Policy-set oracle.**

| | accuracy | mean regret |
| --- | --- | --- |
| with V1 | 0.6995 | 15.82 |
| with V2 | 0.6823 | **18.56** (+2.74) |
| without NEXUS | 0.6240 | 24.13 |

## Leakage

Static audits of the candidate find no future outcome, regret, optimal label, simulator or rollout access.
A dynamic probe ran 400 CAL rows with poisoned `optimalSet`, `regret`, `labels`, `outcome`, `nextState`,
`scalarReward`, `branches`, `correct` and `futureState` fields: 0 accesses, 0 output changes. Decision
inputs contain only observed relational state and the legal action surface.

## Diagnosis

- **Primary:** `D_REMEDIATION_REQUIRES_MISSING_REPRESENTATION`.
- **Secondary:** `STANDALONE_MATERIAL_IMPROVEMENT` + `HIGH_RESOURCE_COLLINEARITY` + `POLICY_SET_VALUE_REDUCED`
  + `V1_WAS_GREEDY_COLLINEAR`.

The PROTECT bias is real and is the main cause of V1's poor absolute quality. It cannot be repaired inside
NEXUS's relational role with its current inputs. The better responses are not relational actions: they are
movement, whose value depends on spatial direction. V1's policy-set value came from behaving like a
deployable greedy proxy, not from relational reasoning. This does **not** show that adding spatial
information would yield a good, distinct NEXUS. It shows only that the current representation cannot.

## Roadmap

`READY_FOR_FRESH_NEXUS_CONFIRMATION=false` · `READY_FOR_ROUTER_RETRAIN=false` · `READY_FOR_STAGE3G=false`.
R0, non-dispatching, no online learning, candidate not promoted.

## Reproduce

```bash
npm run stage3f6p1:generate:dev
npm run stage3f6p1:freeze
npm run stage3f6p1:generate:cal
npm run stage3f6p1:certify
npm run stage3f6p1:check
npm run test:stage3f6p1
```

`stage3f6p1:freeze` refuses if a freeze or CAL evidence already exists. To reproduce from a clean checkout,
regenerate DEV and CAL: the committed freeze is re-derived and must match byte-for-byte.
