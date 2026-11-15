# H-W1 research contract (definition only)

Authority R0. Date 2026-10-30. DEV-only and prospective. Nothing here implements, trains or evaluates a selector.
No worlds were generated, no sealed world was consumed, no registration was opened, nothing was committed or pushed.
Machine-readable parameters: `H_W1_CONTRACT.json` (sha256 `d1e903d3655b3f06c0fbe8a6305202e138536d7b9e910d76d68c735fd1b83d2e`).
Where this file and the JSON differ, the JSON governs and the difference is a defect to report.

The name `STAGE3H_WIDER_ACTION_POLICY_W1` is a research artifact, not a tenth expert. The nine experts (Prime,
Vanguard, Oracle, Nexus, Horizon, Archimedes, Alexandria, Picasso, Forge) are unchanged. `FORGE_ACTION_SURFACE_SYMMETRIC_V1`
is the name of the native action menu, and Forge's coding/RSI role is not redefined.

## 1. Existing sources and evidence (Phase 2)

All paths are under `platform/game-agnostic/stage3h-wider-action-feasibility-v1/`. The lane is untracked: its provenance
is local until the owner authorizes a commit.

| Item | Status |
|---|---|
| `RESULT.md`, `contract.mjs`, `intersect.mjs`, `analyse.mjs`, `key-collisions.mjs`, `phase0.mjs` | present |
| `exclusion/strict-index.mjs`, `integrity.mjs`, `tests.mjs` (5/5 synthetic tests) | present |
| `evidence/WIDER_ACTION_FEASIBILITY.json`, `KEY_COLLISIONS.json`, `EXCLUSION_INTEGRITY.json`, `phase0.json` | present, read |
| `work/intersect/shard-{0..9}-of-10.jsonl` (gitignored) | present; **re-derive the aggregate exactly** |

**Preserved finding (offline, privileged, not a policy).** 341 public-observation equivalence classes (22,365 worlds):

- A common safe action exists in 341/341 classes (0 empty introduction-free or safe-all intersections).
- Hidden-state-dependent action safety in 224 classes (catastrophe status varies across the class).
- Offline in-class oracle mean normalized regret 0.034; S0 0.494; Nexus-else-S0 0.554.
- 145 arm-failing classes, 10 two-arm-conflict classes, 110 classes with more than one optimal set.
- No deployable policy was established. V4 remains `BOUNDED_SELECTOR_NOT_QUALIFIED`; this contract does not touch it.

**What this evidence is and is not.**

- The oracle sees hidden state and picks per class. A policy sees only public content, so per-class non-emptiness is
  exactly the condition under which a zero-introduction policy can exist on that class. It is an information ceiling on
  the tested classes. It says nothing about whether a policy can learn to find that action or generalize across classes.
- It is **not independent confirmation of any selector.** No selector existed. Nothing here counts as a replication.
- The 341 classes are a biased, hard-case sample (selection reasons NEAR_THRESHOLD 301, INTRO_AND_NEAR 28, INTRO 12),
  clustered by origin (150 distinct cells, about 97 topology/resource/objective families, up to 16 classes per family).
  Twin families are a finite sample (40 draws, median 67 twins per class) of the admissible hidden support.
- All 341 are spent. Their set labels `FRESH_EXPLORE` (block 951) and `FRESH_CHECK` (block 952) are legacy names and must
  never be read as fresh. Spent world identities are preserved and none is reused as fresh evidence.
- `RESULT.md` carries custody statements from 2026-10-22 (`BREACHED_LOCAL_UNRESOLVED`, head `ac9daeb5`). They are
  historical and superseded by A4/A4b and `stage3h-custody-audit-v1/STAGE3H_CLOSURE.md`.
- In `KEY_COLLISIONS.json`, catastrophe and introduction-free status are identical inside all three colliding groups;
  utilities are not identical in 2 of 3. Do not summarize the groups as outcome-identical.

## 2. The hypothesis (Phase 3)

> An identity-invariant, public-only, deterministic policy over the **complete** native legal-action menu achieves
> **zero observed catastrophe introductions against both frozen comparators** (S0, and Nexus-else-S0) **and** reduces mean
> normalized regret by **at least 0.02 relative to each**, on genuinely fresh, exclusion-aware DEV validation populations.

Definitions are those of `contract.mjs` and are not changed: catastrophe = frozen evaluator regret >= 100;
introduction = `potentialIntroduction({a}, comparator)`; nreg = regret / menu utility spread. The policy returns exactly one
legal menu action. It never abstains and never randomizes, so every claim is about one reproducible decision per view.

Regret evidence rule, for each comparator separately: class-paired delta = policy minus comparator, point estimate
<= -0.02 **and** the one-sided 95% cluster-bootstrap upper bound < 0. The thresholds (0 and 0.02) are the originals; the
upper-bound rule is the one in the lane's own sketch and adds evidence, not slack.

## 3. Public input contract

**Permitted:** public observation history (the complete `ObservationPacket` sequence of
`STAGE3H_PUBLIC_DECISION_INFORMATION_V1`); the complete native menu; public action semantics (`deriveActionSemantics`);
lawfully observable entity attributes and relations; the frozen S0 top set and the frozen Nexus recommendation and
rationale codes.

**Forbidden:** hidden node health or value, cost, risk, resource quantity, relation subtype; native evaluator regret or
catastrophe labels (at decision time, or as a lookup keyed by public content); recovered or inferred seeds and generator
random state; privileged native rollouts and any native simulator call at decision time (`publicSimulatorCalls = 0`); offline
oracle recommendations and anything derived from them; integrity digests (`worldHash`, `sourceStateHash`, `provenance`);
entity ids, action handles, handle order, menu position, or lexical order of any identifier.

**Comparator-input rule.** S0 and Nexus use a lexical tie-break, so their single outputs are not identity-invariant. The
policy therefore takes them only as identity-free projections (is this action key in the S0 top set; which key is the
Nexus recommendation; rationale codes) and both are **re-run on every transformed view** in the invariance tests. A
projection that changes under relabelling is counted against the policy.

**Identity-invariant action features** (all computed from keys, never from handles):

1. action type; actor-relative displacement and destination (magnitude, direction);
2. target block: kind, relative position and distance, critical / objective / hostile / threatened / in-service / hub /
   resource flags, multiset of `(relationship kind, role)`;
3. for an action carrying a dependent entity (BYPASS), the same attribute block for the dependent;
4. comparator projections: S0 top-set membership by key, S0 per-action public score and rank, Nexus recommendation
   match, Nexus rationale codes (the S0 public-score claim is verified at I-0, not assumed);
5. public history: aggregate civilian health, unavailable count, live hostiles and their trend, steps to horizon;
6. menu aggregates: size, count per type, counts of critical and threatened targets, menu-relative ranks computed by
   sorting on keys only.

## 4. Action identity contract and the BYPASS collisions

`keyV1` (type, displacement, target block, params excluding `dependent`, `toX`, `toY`) leaves 3 non-unique keys, all
BYPASS: indices 6236 and 6198 (`FRESH_CHECK`) and 5593 (`FRESH_EXPLORE`). Two BYPASS actions on one target differ only
in the omitted `dependent`. In all three groups the dependents differ in public kind, relative position, flags and
relationships, so no lexical handle is needed.

`keyV2` adds the dependent's public attribute block (and actor-relative `toX/toY`). Before `keyV2` is used:

- **Field audit.** `resourceFlag`, `observationTimestamp`, `provenance` and `sequence` are in the public entity record but
  are not in `keyV1`. Each must be shown identifier-free (equal across a relabelled twin, carrying no id-derived value)
  before inclusion. A field that fails is left out and the residual collision is handled as an orbit.
- **Residual-collision check.** Recompute keys on all 341 classes. Zero exact duplicates is the goal.
- **Residual duplicates are a symmetric orbit.** The policy selects an orbit, not a member. The evaluator scores
  catastrophe as the **worst case** over the orbit and regret as the **uniform expectation** (worst case also reported).
  Nothing is broken by lexical order, handle order, list position or hash.

## 5. Populations and leakage control (Phase 4)

| Population | Role | Minimum classes | Twin family |
|---|---|---|---|
| Exploration | development and training | 1,000 | 40 draws |
| Validation | candidate selection; each candidate evaluated once; at most 20 candidates | 300 (target 600) | 40 draws |
| Holdout | frozen one-time assessment | 300 (target 600) | 40 standard + 120 independently salted + up to 64 hidden-support corner settings |

- **Disjoint three ways.** Seed blocks, base-world lineage, and public-class digests (section 6). Splits happen at
  class level. The hard leakage unit is the base-world lineage: every twin, hidden-value perturbation, D4 or relabel
  image and every world with equal public content stays in one population.
- **Frames.** Primary is arm-stressed: the feasibility lane's selection rule (H2, Nexus applicable, N != B, and S0
  introducing or both regrets in [40,160]). The rule is located in the lane's selection source and hashed at I-0; it is
  not paraphrased here. Secondary is an unselected no-harm frame (no arm-stress filter) where zero introductions is
  required and regret is report-only. Both frame choices are owner-adjustable (section 10).
- **Statistical unit is the class**, not the world. Mean regret is the equal-weight mean over the class's twins (as in
  the feasibility lane); base-world-only and worst-case values are reported beside it.
- **Origin-family cap.** No topology x resource x objective family exceeds 5% of any population. A family-disjoint
  stress holdout is secondary, non-gating, and evaluable only if at least 20 families are absent from exploration and
  validation.
- **The 341 inspected classes** are development fixtures only. They are not used in any gating statistic.
  Their oracle statistics informed this contract, which is a design-leak risk (section 9).
- **Holdout generation happens after the freeze.** Its seed block is reserved (recorded as open in the index) but not
  generated, digested or labelled until the freeze record binds the policy hash, code hashes, contract hash and
  population-plan hash. It is evaluated once. A failed holdout is spent and cannot be tuned against and re-run.
- Seed blocks are not assigned by this document. They are allocated at implementation time under `preflightNamespace`.

## 6. Structured exclusion binding

**Layer 1: seeds and world hashes.** `exclusion/strict-index.mjs` (`loadStrictIndex`, `preflightNamespace({base,count})`,
`preflightWorlds(hashes)`) is mandatory, fail-closed, and replaces the closure `validateSeedRange` endpoint-only block
check (a recorded defect in `EXCLUSION_INTEGRITY.json`). It covers 109,082 distinct world hashes (288 multi-source), spent
blocks 731-734, 951, 952 and 6 open seeds.

**Why layer 1 is not enough.** It works on world hashes and seed blocks. A fresh world with different hidden state
but identical public content passes `preflightWorlds` while being observation-equivalent to a spent class. H-W1
decides on public content, so exclusion must work at that level too.

**Layer 2: public-class digest (PCD), built and tested at I-2.**

- Digest fields stripped (`publicContent`); entities canonically relabelled; menu sorted by `keyV2` with handles removed;
  D4-canonical (minimum over the 8 transforms).
- Required direction: **equivalent views always give equal digests.** Collisions between non-equivalent views are
  accepted because they only over-exclude. A refinement-based canonical form (colour refinement) has this property.
- Exclusion uses a coarser form (key multiset, comparator projections, public aggregates; sequence and timestamps
  dropped). Equality of the exact form defines a class; equality of the coarse form triggers exclusion.
- Every class of every H-W1 population registers its PCD before the next population is generated, and exclusion
  also runs against the 341 inspected classes.
- **Spent-source coverage.** Regenerate-and-digest only DEV and diagnostic sources whose public views are already
  unsealed. Every sealed or non-regenerable source is excluded at whole-seed-block level and is **never regenerated**.
  V4 sealed worlds and labels are never used. Report the coverage percentage. A source that can be neither digested
  nor excluded by block stops the run.
- Any failure, exception or ambiguity refuses to generate.

## 7. The four claims

| Claim | What it says | What it needs | Status |
|---|---|---|---|
| C1 observed zero | zero introductions in the finite DEV data | counts only | the only claim a pass supports directly |
| C2 statistical bound | class-level introduction rate <= `1 - 0.05^(1/n)` (95%, one-sided) | n classes, zero events | n=299 gives <= 1.0%; 300: 0.99%; 341: 0.87%; 600: 0.50% |
| C3 universal guarantee | no admissible native state introduces | proof over the admissible hidden-state domain | **not claimed**; finite zero counts never establish it |
| C4 generalization | holds for the seeded population | fresh, excluded, in-frame holdout | limited to the stated frame, generator version, rule hash and namespace |

Cautions that go with the numbers:

- The C2 bound is on classes that contain at least one introduction among their **labelled** twins. It is not a bound on a
  per-world probability. For one class, zero events in 67 twins bounds that class's hidden-state rate only at about 4.4%
  (1.8% at 161 twins), and 224 of 341 classes have catastrophe status that varies with hidden state. This is why the
  holdout carries a larger and corner-biased twin family than training.
- Classes cluster by origin, so n overstates independent evidence. The cluster-level bound over origin families is
  reported beside the class-level bound and the **larger** is the headline.
- A pass on the arm-stressed frame says nothing about the unselected frame, and the reverse.

## 8. Evaluation procedures

**Identity invariance (tolerance 0, on exploration, validation and holdout).**

- Relabel: apply the O-2R.1 relabelling `identityViewTwinV2` plus 5 random relabellings per class, recompute both
  comparators, and require an equal chosen key.
- Menu order: 5 random permutations plus the reverse; equal chosen key.
- D4: 7 non-identity transforms; the chosen key must equal the transformed key. D4 is claimed only if evaluator labels
  are first shown D4-equivariant on a sample (I-0). The D4 and order test code in `stage3h21-*` targets earlier public views
  and is not part of `identity-view-v2.mjs`, so a transform tool for this view must be built and tested.
- Public-only: twins of one class must give bit-identical output; the policy runs with hidden accessors made to throw;
  static field audit of the input.
- **Test the tests.** A handle-order-dependent policy and a hidden-state-dependent policy must be detected. A suite that
  cannot fail does not count.

**Legality.** The chosen action is in the complete native menu and passes the native legality check. Zero illegal
selections, no abstention.

**Catastrophe risk.** Per world and per class, against S0 and against Nexus-else-S0, over base plus twins. Base-only
counts are reported separately. Both counts must be zero. Plain catastrophe rate (regardless of comparator) is reported.

**Regret.** Per class, equal-weight mean over the twin family; class-paired delta against each comparator; cluster
bootstrap over origin families (10,000 resamples, seeded). Base-only and worst-case reported.

**Compute budget.** Decision time: zero native simulator calls; median <= 100 ms and max <= 1 s per decision on the reference
machine. Offline: at most 300,000 labelled worlds across all phases; at most 2 GiB of work files; start only with at
least 8 GiB free (the internal disk was 97% full when last measured). No network.

**Reproducibility.** Seeds derived by hash from registered labels; single-threaded deterministic aggregation; node
version recorded; no wall clock in any decision; write-once evidence (`writeExclusive`). Two independent runs must
give byte-identical per-class decisions and aggregate digests. The freeze record binds policy artifact hash, code hashes,
contract hash and population-plan hash.

## 9. Failure and stop conditions (fixed before any implementation)

| Condition | Consequence |
|---|---|
| Exclusion preflight failure or ambiguity; forbidden input found; any illegal action; any access to sealed worlds or V4 labels; reproducibility mismatch; custody audit not passing at the start of a phase | **run invalid; stop** |
| Any introduction on validation; any invariance violation; regret rule unmet on validation | candidate rejected (no post-hoc exceptions); holdout not touched |
| All candidates (<= 20) rejected | `H_W1_NOT_SUPPORTED_ON_VALIDATION`; stop |
| Any introduction on holdout, against either comparator | H-W1 **refuted** for the frozen policy; holdout spent; a new policy needs new namespaces |
| Holdout safe but regret rule unmet | H-W1 not supported (regret leg) |
| A population below its minimum after the allocated namespace is exhausted | `INSUFFICIENT_POPULATION`; the rule and minimum n are **not** relaxed |
| Budget exceeded | stop; partial results are exploratory only |

No failed result is repaired by editing thresholds, frames or exclusion after the data is seen. Each candidate is evaluated
on validation once. Candidates and hyperparameter configurations are declared before validation, and the feature
families here are fixed. The feature families were chosen after the oracle's action-type mix on the 341 classes was
inspected (MOVE 265, RETREAT 28, RESTORE 28, PROTECT 15, REPAIR 4, BYPASS 1), which is a design-leak risk. The cap on candidates and the
frozen feature list are the mitigation.

## 10. Generalization limitations

1. No universal guarantee (C3). Finite zeros bound a class-level rate only for the sampled frame.
2. The twin family is a finite sample of hidden support. Rare hidden states can be missed, and the holdout reduces
   but does not remove that risk.
3. The primary frame is selected by comparator behaviour, so it does not represent the unselected population.
4. Classes cluster by origin; effective sample size is below n.
5. Results are valid for the generator version and rule hash (`c53826da…`), the stated seed namespace and the DEV
   evaluator. They do not carry to live worlds, other generators or other evaluators.
6. The oracle ceiling was computed on 341 spent classes and does not show a policy is learnable.
7. Public equivalence is exact under relabelling and D4 only if labels are D4-equivariant, which is untested.
8. DEV evidence is not a live-world certification. `CAN_DISPATCH` and `CAN_MUTATE_LIVE_WORLD` stay false.

**Owner-adjustable parameters, with defaults:** primary frame (arm-stressed); secondary frame gates zero introductions
(or report-only); minimum class counts (1,000 / 300 / 300); maximum candidates (20); origin-family cap (5%);
whether the family-disjoint stress holdout is attempted; whether the two untracked lanes are committed locally.

## 11. Readiness (Phase 5)

**Classification A: `H_W1_CONTRACT_READY_FOR_DEV_IMPLEMENTATION`.**

- Not D: the information contract is not infeasible on the evidence. The safe intersection is non-empty on 341/341 tested
  classes. That is a ceiling on tested classes, not a policy, and learnability is the open scientific question.
- Not C: sources and evidence exist, agree with their shards, and are reproducible.
- Not B: every open choice has a default above and none blocks the definition.
- A is conditional on I-0 to I-2 passing. Those are stop conditions, not owner decisions: the identifier audit, the
  residual-collision check, comparator public-only and relabel-stability checks, D4 label-equivariance, and the PCD index.

**Bounded implementation plan, for a separate authorization.** Nothing below starts until the owner says so.

| Step | Deliverable | Gate |
|---|---|---|
| I-0 | rerun the closure audit; locate and hash the selection rule; verify menu equality across a class, hiddenSupport structure, comparator public-only and relabel behaviour, S0 public score; D4 label-equivariance on a fixture sample; build D4, relabel and order transform tools with negative controls | all checks pass |
| I-1 | `keyV2`, field audit, residual-collision check on the 341, static no-hidden-fields feature extractor | zero unresolved collisions or orbit handling proven |
| I-2 | PCD exclusion index with synthetic positive and negative tests, fail-closed behaviour, spent-source coverage report | tests pass; coverage reported |
| I-3 | allocate three fresh blocks under `preflightNamespace`; reserve the holdout block ungenerated; write-once population plan and hash | preflight clean |
| I-4 | generate and label exploration and validation (not holdout); exploration statistics only | budgets respected |
| I-5 | develop <= 20 declared candidates on exploration; one validation evaluation each; freeze one policy and its record | section 9 conditions |
| I-6 | **separate authorization:** generate the holdout, run the one-time assessment, report C1-C4 | the freeze record is intact |

Not authorized anywhere in this plan: a push, a mirror, a bundle of all refs, A5, `gc`, deleting any ref, any sealed
campaign, any registration, any live action, any change to V4 or to the expert roster.

**Next exact owner decision:** authorize, change or decline I-0 to I-5 as bounded above, and say whether the two
untracked lanes (`stage3h-custody-audit-v1`, `stage3h-wider-action-feasibility-v1`) may be committed to local `main` under the
active guards before any code is added.
