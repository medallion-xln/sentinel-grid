# SENTINEL GRID — STAGE 3H H-W2 — SCIENTIFIC DECISION

AUTHORITY: R0 · MODE: DEV-only observation and recommendation · BASELINE: `d706b689`
DATE: 2026-11-02 · No selector built, no model trained, no validation reopened.

---

## PHASE 0 — BASELINE AND SCIENTIFIC INTEGRITY

| Check | Result |
|---|---|
| Branch / HEAD | `main` @ `d706b689` (H-W1 negative-result closure) |
| V4 final verdict | `BOUNDED_SELECTOR_NOT_QUALIFIED` — preserved |
| H-W1 final verdict | `H_W1_DEV_VALIDATION_NOT_QUALIFIED` — preserved |
| 13 failed validation candidates + evidence | intact (blob `88f89808` in index; hashes in `I5_CANDIDATE_FREEZE.json`) |
| Nine-expert canonical roster | unchanged (Prime, Vanguard, Oracle, Nexus, Horizon, Archimedes, Alexandria, Picasso, Forge) |
| S0 / Nexus comparator definitions | frozen (S0 = "B"; Nexus-else-S0 = "N") |
| Two-arm impossibility theorem domain | admissible native states only — preserved |
| Protected-source custody guard | PASS (stage-guard.sh exits 0 on current index) |
| R0 authority | `canDispatch=false`, `canMutateLiveWorld=false` |

**Import-cut inspection.** The uncommitted `public-projection.mjs` change replaces
`import { D4_ELEMENTS } from './transforms.mjs'` with `import { …, ORIENTATIONS } from
'../src/forge-symmetric/orientation-symmetric-v1.js'` + `const D4_ELEMENTS = ORIENTATIONS`.

- This **removes `transforms.mjs` and its evaluator-capable descendants** (`forge/kernel.js`
  via that edge, `stage3g/evidence.mjs`, `stage3h-failure-diagnosis-v1/lib.mjs`) from the
  public-projection static graph. `transforms.mjs` is still imported by the audit/PCD/fixture
  files for the relabel/menu/d4 transform families — correctly, since those need the world-view
  machinery; the *decision-path extractor* does not.
- **Public decision semantics unchanged.** Verified in this session: `D4_LINEAR` key sets match
  and all 8 maps are identical over a sampled grid against the committed blob; `D4_ELEMENTS` was
  already module-local (not exported) in HEAD, and the new binding is the same `deepFreeze`
  array. `i3-policy.mjs` (the decision-path entry) still loads.
- **Not retrofitted** into frozen H-W1 identities. The H-W1 candidate hashes (`I5_CANDIDATE_FREEZE.json`)
  still reference the old `public-projection.mjs` hash and are untouched.
- **Residual note:** the `STATIC_IMPORT_CONTRACT=FAIL` status is *not* automatically cleared by
  this cut, because `orientation-symmetric-v1.js` still reaches `forge/kernel.js`. That residual
  reach is inside the frozen strict-closure list, which is the fact a separate re-audit must
  record (§ below).

**Nine `sgrid-lab/results/*` files** — read-only inspection reconfirms `UNATTRIBUTED_WORKTREE_DRIFT`
(deterministic latency/`generatedAt`/`azl-federated`-hash refreshes). Preserved, not staged.

No protected source drifted. Baseline is clean. **Proceed.**

---

## PHASE 1 — H-W1 FAILURE DECOMPOSITION

Source: the lawful DEV exploration evidence (`I4_EXPLORATION_RESULTS.json`) and the frozen
H-W1 contract's prior "341-class" oracle study. This is **not** a re-open of I-5 validation.

**Per action family** (I-4 `hiddenSensitivity`, `hetThreshold=0.05`):

| Type | actions | catRate | hetRate | hidden-state sensitive? |
|---|---|---|---|---|
| ATTACK | 64 | 0.703 | 0.438 | yes |
| BYPASS | 77 | 0.221 | 0.208 | yes |
| MOVE | 3768 | 0.451 | 0.227 | yes |
| PROTECT | 2273 | 0.515 | 0.373 | yes |
| REINFORCE | 280 | 0.439 | 0.429 | yes |
| REPAIR | 280 | 0.439 | 0.436 | yes |
| RESTORE | 299 | 0.425 | 0.365 | yes |
| RETREAT | 771 | 0.455 | 0.239 | yes |
| WAIT | 1000 | 0.711 | 0.451 | yes |

**Every populated action type is hidden-state-sensitive** (hetRate 0.21–0.45, all >> 0.05). The
catastrophe status of a fixed action flips across member worlds of one public-equivalence class
for the most numerous types, not an isolated corner.

**Where the introductions concentrate** (I-5 aggregated across all 13 candidates):

| Type | total introductory actions |
|---|---|
| MOVE | 433 |
| RETREAT | 87 |
| RESTORE | 64 |
| REPAIR | 29 |
| BYPASS | 23 |

MOVE dominates (5× the next type) primarily because it is also the most frequent action; no type
is immune.

**Ten decomposition questions, answered:**

1. **Catastrophe sensitivity to hidden state** — universal and large (above).
2. **Public features associated with safety** — weak: best catastrophe head AUC ≈ 0.79,
   `catWithinR2` 0.171–0.178.
3. **Public features associated with regret** — stronger: `nregWithinR2` 0.198–0.209, and the
   regret leg passed for all 13 (delta vs S0 −0.11 to −0.23, vs Nexus −0.15 to −0.27, upper95 < 0).
4. **False-safe / false-unsafe** — the safety head systematically over-credits MOVE/WAIT actions
   that are only safe in *some* hidden states; this is the exact signature of unobservable
   within-class variation, not of mislabeled examples.
5. **Safer legal alternative available** — yes in 341/341 tested classes (oracle).
6. **S0 or Nexus proposed it** — in 145 arm-failing and 10 two-arm-conflict classes the frozen
   arms themselves fail; neither is a reliable fallback in exactly the cases that matter.
7. **Correlate with observation-history length** — the I-1 projection uses the full public history
   and the safety signal did not improve; no evidence that longer history resolves within-class
   hidden variation (it does not, because the history is public and the flipping variable is not).
8. **Persist under relabeling** — the policy is identity-invariant, so this is not an id/handle
   artifact; the failure survives invariance.
9. **Ambiguous action semantics** — keyV2 residual collisions were resolved as symmetric orbits;
   the residual collisions are not the dominant cause of MOVE introductions.
10. **Insufficient information vs. inadequate expressiveness** — **predominantly insufficient
   information.** The decisive fact: within a single public-equivalence class, the *same* action is
   sometimes catastrophic and sometimes not (`hetRate >> 0.05` for all types). No deterministic
   function of the public projection can distinguish those two member worlds — they are
   byte-identical to the projection — so the zero-introduction requirement is unachievable by
   *any* model of that projection, not just by the 13 linear candidates.

**Correlation vs. causation is preserved.** The above is the I-4 decomposition as prior evidence;
it is not re-derived as independent confirmation.

---

## PHASE 2 — PUBLIC OBSERVATION SUFFICIENCY

The public decision information is `STAGE3H_PUBLIC_DECISION_INFORMATION_V1`: full public history,
the complete native menu, public action semantics, observable spatial/graph relations, resource
availability, public risk indicators, and frozen expert proposals — **excluding** hidden health /
node value, evaluator truth, seeds, privileged rollouts, oracle output, and arbitrary identifiers.
The `I1_PUBLIC_INPUT_AUDIT` attests `allPass=true`: the projection carries none of the excluded fields.

The prior 341-class offline study (biased hard-case sample, now spent) established the three-way
distinction directly:

- **COMMON_SAFE_ACTION_EXISTS** — TRUE: `emptyIntersectionClasses = []` (341/341 classes). A
  hidden-state-aware oracle always finds an action safe across the whole class.
- **COMMON_SAFE_ACTION_PUBLICLY_IDENTIFIABLE** — NOT ESTABLISHED. The
  distinguishing evidence is **individual-action heterogeneity**, not an empty intersection:
  224 classes contain at least one action whose catastrophe status differs *across member worlds*
  (`hiddenRisk.classesWithAnyVaryingCatastropheStatus = 224`; mean 2.38 such actions per class),
  and 222 have intro-free status that varies. Because the public projection is identical across
  those member worlds, no public feature can tell, for the affected actions, *which* member world
  the current decision is in. This is why a fixed "pick this key" rule is at risk on those actions —
  but it does **not** by itself prove the common safe action is unidentifiable; it shows only that
  unidentifiable *individual* actions exist.
- **COMMON_SAFE_ACTION_LEARNABLE** — not established. The I-4 head quality (cat `R²≈0.17`,
  AUC ≈ 0.79) and the universal per-action `hetRate` are evidence the tested model families did
  not learn the safe set. They are **not** a proof of generic non-learnability, and they must not
  be read as one.

**Reconciliation (the point this document must not blur).** *Individual-action safety
heterogeneity* (a fixed action safe on some members and catastrophic on others) is **not** the
same as an *empty class-wide safe-action intersection*. The two are different measurements over
different objects:

- The class-wide **safe-action intersection** is **non-empty in 341/341 classes** (a common safe
  action always exists — `emptyIntersectionClasses = []`).
- The per-action **heterogeneity** (`hetRate`, `actionsWithVaryingCatastropheStatus`) is
  **pervasive**, which is why *identifying* that common safe action from public content is hard.

Consequently the evidence supports only a **provisional** observability hypothesis: the public
projection is *lossy on the exact quantity that flips individual actions between safe and unsafe*
(the hidden node health/value), which is a plausible — but not yet demonstrated — reason a public-only
selector cannot reach zero introductions. The stronger claim that this loss **proves** an
information-theoretic impossibility for all public-only mechanisms is **not** established and is
withdrawn from the earlier wording.

---

## PHASE 3 — FULL-MENU INFORMATION LIMIT

The H-W1 policy domain is the **complete** native menu (`FORGE_ACTION_SURFACE_SYMMETRIC_V1`), not the
two-arm reduction of the earlier theorem. The two-arm impossibility was proven only on the
admissible native-state domain and is not extended here.

On the full menu, the relevant question is whether some public class has an **empty safe-action
intersection** (nothing safe across the whole class). The measure is `introFreeAllEmpty` /
`safeAllEmpty` from `intersect.mjs`, computed as "is there an action that is introduction-free /
non-catastrophic on **every** member world." The existing DEV evidence says the opposite:
non-empty in all 341 tested classes (`emptyIntersectionClasses = []`, with
`safetyCostClasses = 0` — the unconstrained minimax-regret action is already introduction-free in
every class). **No full-menu empty-intersection witness was found.**

- Therefore `FULL_MENU_IMPOSSIBILITY_PROVEN = false`, and the stronger classification **C
  (impossibility proven) is not warranted.** An in-class oracle always finds *something* safe; the
  problem is the public nature of the selector, not the emptiness of the safe set.
- This is the correct landing point: the non-emptiness of the safe intersection is a *ceiling*, not
  a *policy*. It says a zero-introduction policy *can* in principle select correctly class-by-class,
  but (per the Phase 2 heterogeneity) whether the public projection can *identify* that action is
  an open, prospective question — not a settled result in either direction.

No new exploratory DEV worlds were generated in this phase, so no fresh namespaces were consumed
and no witness needs a formal admissibility proof. `FULL_MENU_IMPOSSIBILITY_PROVEN = false` is the
honest report, not an inference from finite samples.

---

## PHASE 4 — INFORMATION VS. MODEL LIMITATION

Interpretable diagnostic comparison, not a candidate campaign:

- **A. Existing H-W1 public features** — regret leg fits well (`R²≈0.20`), catastrophe leg weakly
  (`R²≈0.17`, AUC 0.79). The feature set is expressive enough for regret but not for zero-risk.
- **B. Richer representations of the same public information** — the 13 candidates span
  `BASE`/`FULL` feature families and `plain`/`within` aggregation, plus three scoring rules
  (NEG_NREG / SAFE_FIRST / RISK_WEIGHTED) and a type-prior. They all land in the same place:
  introductions 13–58 (S0) and 29–47 (Nexus) on validation. Richer public representations did
  **not** close the gap, consistent with an information ceiling rather than a representation
  ceiling.
- **C. Counterfactual additional signals (offline only)** — the physically meaningful candidates
  (damaged-node severity, public health bands, maintenance urgency, criticality, resource-risk
  telemetry, uncertainty indicators) are exactly the hidden fields the public contract excludes:
  hidden node health/value/cost/risk/quantity. Adding them would **change the observation
  contract** (to an *augmented* public observation that exposes a currently-hidden but not
  identity-bearing variable), and would be the minimum lawful change — *not* something the current
  contract authorizes the policy to read.

**Ranking potential observations by safety information added** (not predictive accuracy): a
well-formed public *health/risk severity band* (a coarse, identity-free quantile of the currently
hidden node health/risk) is the smallest observable delta that would plausibly resolve the
demonstrated within-class catastrophe ambiguity. It adds no privileged *identity* information, is
generator-agnostic enough to remain game-portable, and would not on its own expose seeds or
evaluator truth. Risks to weigh: it is a *new* observability contract, could leak generator
state if defined too finely, and adds decision latency (one more field to project).

**Conclusion: the limitation is *provisionally* informational, not *proven* architectural.** The
public projection is lossy on the hidden node health/value that flips individual actions between
safe and unsafe, which is a plausible explanation of the observed model failures — but that loss is
not yet demonstrated to be the decisive limit, nor is a stronger public-only model excluded.

---

## PHASE 5 — ROBUST ACTION-SELECTION FEASIBILITY

The conceptual mechanisms (conservative safe-action classification, uncertainty sets, safety-
constrained ranking, set-valued risk, ambiguity-aware abstention) all share one property: they
must output one executable action or an explicitly permitted abstention, and none may read
hidden state at inference.

- **Expressible under current public info** — a safe-action *classifier* or *abstaining* selector is
  expressible. But its error is governed by the same information ceiling: a conservative
  classifier that returns "safe" only when sure must, on a class where safe status is hidden-state
  dependent, either (a) abstain essentially everywhere, or (b) be wrong sometimes. Neither meets the
  frozen **zero-introduction, no-abstention** criterion (the H-W1 contract forbids abstention).
- **Identity-invariant** — yes, achievable (keys, not handles).
- **Deterministic replay** — yes, achievable.
- **Compute** — yes, well within budget.
- **Meet the frozen safety requirement in principle** — **no**, because the requirement pairs
  "zero introductions" with "no abstention," and the public information cannot separate safe from
  unsafe within a class. A set-valued / abstention mechanism would *relax* the criterion by encoding
  "I don't know," which the frozen requirement does not allow.

So the robust-selector family does **not** rescue the requirement under the current public contract.
It would help only in combination with an augmented observation contract (Phase 4-C).

---

## PHASE 6 — SCIENTIFIC DECISION

**PRIMARY CLASSIFICATION: B_PROVISIONAL_OBSERVABILITY_RESEARCH_DIRECTION.**

The word "provisional" is deliberate. The evidence separates cleanly into what is *observed* and
what is only *hypothesized*:

- **Observed (established).** (a) The class-wide safe-action intersection is non-empty in all 341
  tested classes. (b) The 13 H-W1 model families all fail the zero-introduction gate while passing
  the regret leg, with the catastrophe head fitting at only `R²≈0.17` / AUC 0.79. (c) Individual-action
  catastrophe status is hidden-state-dependent across every populated action type (`hetRate`
  0.21–0.45). These are finite-sample observations, not theorems.
- **Not observed (hypothesis only).** (a) That this heterogeneity *proves* the public projection is
  information-theoretically insufficient for all mechanisms. (b) That a severity band would
  *actually* resolve the ambiguity — no experiment has evaluated the information that band would
  provide. (c) That a stronger public-only model cannot close the gap.

**Why not A (new policy mechanism) as the primary claim:** the regretted-signal asymmetry is
suggestive (regret is learned from the public view, catastrophe is not), but it does not rule out a
better mechanism over the same public view — 13 linear/ridge candidates do not span the space of
public-only policies.

**Why not C (impossibility):** `FULL_MENU_IMPOSSIBILITY_PROVEN=false`; the non-empty intersection
directly precludes a claim of impossibility, and no empty-intersection witness exists.

**Why not D (inconclusive), narrowly:** the decompositions are specific enough to *direct* further
research, but that direction is an engineering hypothesis (`B_PROVISIONAL`), not an established
information-theoretic limit. Plain `B` (as "established information limitation") would overclaim
exactly what the owner's reconciliation flags: `R²` values and 13 candidate failures are
**model-family evidence**, not a proof of information-theoretic insufficiency.

So the recorded classification is provisional: addn observability is the **most plausible next
direction**, pending an evaluation of what a coarse severity band actually provides (§ Phase 4-C,
§ Phase 7).

---

## PHASE 7 — H-W3 RECOMMENDATION (NOT IMPLEMENTED)

**Minimal proposed lawful telemetry extension (Phase 4-C, for owner consideration only):** a coarse,
identity-free **public severity/risk band** over each node's currently-hidden health/risk, expressed
as a small ordinal (e.g. a 3–5 level band), added to the public observation. This keeps the
identity-free, seed-free, evaluator-free discipline. **It is not claimed to resolve the ambiguity —
that is precisely what an H-W3 proposal must establish** before anything is built. Consequences for
game-agnostic design: a new versioned observation packet (`STAGE3H_PUBLIC_DECISION_INFORMATION_V2`)
and a re-provenance of every projection consuming it; it does **not** change native world mechanics.

Any H-W3 must carry: a distinct hypothesis ("an identity-free public severity band makes the
zero-introduction action *publicly identifiable*"), a new policy/model identity, a frozen V2
information contract, fresh exploration/validation/holdout populations with strict structured
exclusions and fresh PCD registrations, the frozen safety/regret criteria unchanged (do not relax
zero introductions), identity invariance, and separate owner authorization. A future proposal must
also first establish (§ H-W2 Phase 4): which specific ambiguity the band resolves, whether the band
is legitimately available from the native world, whether it generalizes beyond Forge World, whether
it introduces privileged inference or seed leakage, whether identity invariance is preserved, whether
the original criteria are unchanged, and **whether additional observability is actually necessary
compared with stronger public-only models** — none of which is established here.

**None of this is implemented or registered.** No selector, no model, no validation, no sealed
campaign.

---

## REQUIRED RESULT

```
=== SENTINEL GRID STAGE 3H H-W2 CLOSURE ===

STATUS=COMPLETE

H_W2_DECISION=B_PROVISIONAL_OBSERVABILITY_RESEARCH_DIRECTION
EVIDENCE_RECONCILED=TRUE
DISJOINT_SAFE_SET_FINDING=WITHDRAWN (individual-action heterogeneity, not empty intersection)
341_CLASS_INTERSECTION_FINDING=NONEMPTY (341/341; evidence WIDER_ACTION_FEASIBILITY.json sha256 a2b3ffd2…)
POPULATION_DIFFERENCE_EXPLAINED=TRUE (hetRate/actionsWithVaryingCatastropheStatus measure per-action heterogeneity; introFreeAllEmpty/safeAllEmpty measure class-wide intersection; non-contradiction)
FULL_MENU_IMPOSSIBILITY_PROVEN=false

ADDITIONAL_OBSERVABILITY_NECESSITY=PROVISIONAL (not established)
SEVERITY_BAND_FEASIBILITY=UNTESTED
H_W3_RESEARCH_HYPOTHESIS=identity_free_severity_band_makes_safe_action_publicly_identifiable

STATIC_IMPORT_CONTRACT=REQUIRES_RE_AUDIT
UNATTRIBUTED_DRIFT_FILES_PRESERVED=9

STAGED_FILES=H_W2_DECISION.md
LOCAL_COMMIT=TBD
REMOTE_PUSH=false

NEW_OBSERVATION_CONTRACT=false
NEW_SELECTOR=false
NEW_MODEL_TRAINED=false
NEW_VALIDATION=false
SEALED_CAMPAIGN=false

V4_NEGATIVE_VERDICT_FINAL=true
H_W1_NEGATIVE_VERDICT_FINAL=true
FULL_STAGE3H_CERTIFIED=false
STAGE3I_STARTED=false

CAN_DISPATCH=false
CAN_MUTATE_LIVE_WORLD=false

NEXT_EXACT_OWNER_DECISION=authorize_or_decline_hw3_proposal
```
