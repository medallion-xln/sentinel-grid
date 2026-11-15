# STAGE 3H H-DISC-0 — Architecture: `SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1`

AUTHORITY: R0 · BASE HEAD `eb75dff8` · status: **SPECIFICATION. Nothing is trained, evaluated or deployed.**

Executable contract reference: `contract/pairwise-contract.mjs` (no learned parameter, no game feature, no import),
with 19 synthetic tests in `contract/pairwise-contract.test.mjs`. The reference fixes interfaces and invariants. It is
not a model and shows no decision competence.

## 1. What the component is

A new, versioned, prospective policy component that orders the actions of **one** legal menu by relative safety.

| property | value |
|---|---|
| identity | `SENTINEL_WITHIN_MENU_ACTION_DISCRIMINATOR_V1` |
| contracts | `HDISC_PAIRWISE_COMPARATOR_CONTRACT_V1`, `HDISC_SAFETY_LABEL_CONTRACT_V1`, `HDISC_MENU_RANKING_CONTRACT_V1` |
| authority | R0: observation and recommendation only; cannot dispatch or mutate |
| relation to SK1 | separate identity; SK1's kernel, model, thresholds and results are untouched and not replaced |
| output | relative-risk evidence and a ranking of the complete menu, for a kernel to use; it recommends nothing by itself |
| claim | an empirical estimate that one action is safer than another; never a safety guarantee |

It is not an additional expert. The nine-expert roster and the Prime / Arbiter boundaries are unchanged.

## 2. Public-information boundary

**Consumes**

| input | source |
|---|---|
| the frozen public observation | `STAGE3H_PUBLIC_DECISION_INFORMATION_V1` / `HW1_PUBLIC_PROJECTION_V1`, unchanged |
| the complete native legal-action menu | every lawful action, identified by canonical identity-free keys |
| lawful action semantics | declared preconditions, deterministic and uncertain effects, public destination terrain |
| permitted public decision history | the history channel already in the projection |
| explicitly valid expert evidence | `SK1_ADVISORY_EVIDENCE_V1`: S0 public scores and top set; Nexus recommended *type*, codes and reason |

**Never consumes** — refused at the interface, with tests:

- hidden health, hidden value, evaluator truth, utilities, regret, catastrophe or introduction labels, member worlds,
  counterfactuals, privileged rollouts;
- seeds, world hashes, source-state hashes;
- arbitrary identifiers: ids, handles, names, menu positions, ordinals;
- unknown experts, unknown evidence contracts or unknown projection kinds (refused, not ignored — this closes SK1
  finding F5 for the new component);
- any request to execute, dispatch or mutate.

No new hidden-state disclosure is introduced. Nexus's specific action is still not used, because its choice among
equally scored actions is decided by a lexical handle and changes under relabelling.

## 3. Component A — relative action comparison

### Semantics

For actions *a* and *b* of one decision state, with L(·) the offline unsafe indicator (section 4):

> p(a, b) = P( L(a) < L(b) ) + ½ · P( L(a) = L(b) )

"The probability that *a* is safer than *b*, counting an indistinguishable pair as one half." Two identities follow
and are **required exactly**, not approximately:

> p(a, b) + p(b, a) = 1  p(a, a) = ½

### Form

- A raw pair scorer g(φ_a, φ_b, c) reads the two actions' public descriptors and the shared menu context c.
- The comparator is the antisymmetrised scorer: ℓ(a, b) = ½ · [ g(φ_a, φ_b, c) − g(φ_b, φ_a, c) ], p(a, b) = σ(ℓ(a, b)).
  Antisymmetry then holds by construction for any g.
- Descriptors φ are identity-free and invariant to relabelling, menu order and the D4 frame, as SK1's features are.
- **Relational inputs** are the substantive change from SK1: differences and contrasts between the two actions (and
  against the comparators' public choices), not only each action described alone.
- **The pair model must be able to be non-additive.** If g decomposes as h(φ_b) − h(φ_a), the comparator is a
  per-action score in disguise: pairwise training then searches the same family of rankings as pointwise training.
  H-W1 saw exactly that — within-menu fitting of linear policies changed nothing (see the failure-mechanism report).
  Any benefit specific to pairwise learning must come from interactions between the two actions, which is why
  explicit contrasts are part of the input and why the ablation ladder isolates this step.
- Transitivity is **not** imposed. A genuinely pairwise model can be intransitive; that is information, and the ranking
  contract handles it.

At inference both directions are computed and must sum to one. A pair that fails this is reported and **withheld**; it
is never averaged into shape.

### What a value means and does not mean

- It is relative: it says nothing about whether either action is safe in absolute terms.
- It is an estimate from finite development data under one observation contract.
- For pairs whose difference depends on state that is not publicly observable, the honest value is near ½. The design
  must be able to say "not separated" (sections 5 and 6), and must not manufacture an order.

## 4. Component B — offline supervision

Labels come from the frozen native evaluator on the member worlds of one public-equivalence class. They are permitted
in future **authorized offline training and evaluation only**, never at inference.

Five families, kept distinct. No scalar mixes catastrophe with regret.

| family | definition | role |
|---|---|---|
| per-action catastrophe | member regret of at least 100 in any member; also in every member; member fraction | secondary target; what SK1 was fit on |
| per-action regret | member-mean normalised regret | a separate head; used only after safety ordering |
| comparator-relative introduction | the action introduces against S0; against Nexus-else-S0; union | **primary** label |
| within-menu relative order | for a pair: A safer / B safer / tied, derived from the union introduction | the training target |
| tied or indistinguishable | both safe, or both unsafe; target ½ | explicit, never broken by regret |

**Comparator conditioning.** An introduction is defined against a comparator's decision set, so the label depends on
the frozen comparators' recommendations for that class. Every label record must name the comparator sets it was
conditioned on, and a pair may only be formed from labels with the same conditioning (enforced in the reference).
Consequences to disclose:

- An action in a comparator's own set can never introduce against that comparator. The label therefore carries
  information about what the comparators chose. That is lawful — S0's scores and Nexus's type are already public
  advisory evidence — but a model could learn "copy the comparator" for one endpoint. The union label and the regret
  gate against *both* comparators are what prevent that from being a solution.
- Nexus's specific action is unstable under relabelling. The class record fixes one effective Nexus set; the label
  against Nexus inherits that choice. This is a known source of label noise and must be measured, not hidden.

**Why the introduction label and not the catastrophe label.** SK1 was fit on catastrophe and gated on introduction.
On validation, 52 top choices were catastrophic and 39 were introductions. The target must be the gated event.

**Robustness to hidden state.** The primary label is "in any member world". It asks for an action that is safe across
all sampled public-equivalent worlds, which is the only question public information could answer. A model is not asked
to predict the outcome in the world being played.

## 5. Component C — menu-level ranking

`HDISC_MENU_RANKING_CONTRACT_V1`. The **complete** menu is ranked. Precedence, most important first:

| step | rule |
|---|---|
| 1 | public deterministic constraints: an excluded action ranks last and is never in the top set (unchanged from SK1 Component A) |
| 2 | support: an action lacking a supported comparison against a supported candidate ranks below every supported one |
| 3 | relative safety score S(a) = mean over the other supported candidates b of p(a, b); higher is safer |
| 4 | worst-case comparison R(a) = minimum over b of p(a, b); higher is safer |

How each difficulty is handled:

| difficulty | handling |
|---|---|
| contradictory pairwise comparisons | both directions computed; p(a,b) + p(b,a) ≠ 1 is reported and the pair withheld; both actions lose support |
| cycles | S is always a total preorder, so a ranking always exists. Cycles in the strict majority relation are detected and reported; a top set that touches a cycle is flagged `TOP_SET_IN_A_COMPARISON_CYCLE` and is not a strict order |
| ties | actions exactly equal on steps 1–4 are returned **together** as one set |
| deterministic tie handling | the canonical signature fixes only the order in which a set is *listed*. No id, handle, menu position or lexical order prefers one member |
| risk uncertainty | reported as the margin to the runner-up, the worst-case comparison, cycle membership and (when an ensemble is used) disagreement; none is called a confidence interval unless separately verified |
| missing evidence | an unsupported action or pair is demoted and reported; nothing is imputed |
| variable-size menus | S is a mean, R a minimum; a one-action menu has S = R = ½ |
| identity invariance | scores are bit-identical under every reordering and renaming (order-independent summation; tested on all 120 orderings of a five-action menu) |
| D4 equivariance | descriptors are frame-invariant, so the ranking is frame-equivariant; a frame-dependent descriptor is detectable (negative control) |

A set-valued top is costly under the frozen evaluator, which scores a decision set by its worst member. Returning a set
is therefore honest, not free: an indistinguishable pair containing one unsafe action counts as unsafe.

## 6. Component D — integration with the Safety Kernel

The discriminator does not replace the SK1 estimator silently or otherwise. It enters a **new kernel identity**, for
example `SENTINEL_PUBLIC_ACTION_SAFETY_KERNEL_V2_CANDIDATE`, which is a separate source and model identity from SK1
and from the `V1_1_CANDIDATE` name reserved for the SK1 defect fixes (which it should include).

Proposed ranking contract for that kernel, to be frozen in a pre-registration:

| step | source | status |
|---|---|---|
| 1. public deterministic constraints | kernel Component A | unchanged |
| 2. support | discriminator and estimators | unchanged in spirit |
| 3. relative safety order | **the discriminator** (S, then R) | new; replaces the SK1 risk-tier step in this identity only |
| 4. expected regret | a separate regret head | only among actions the discriminator does not separate |
| 5. exact ties | returned as a set | unchanged |

What stays fixed whatever the discriminator says:

- deterministic constraints are never overridden by a learned comparison;
- the authority block is R0, with `canDispatch=false` and `canMutateLiveWorld=false`;
- the decision record carries model, source, label-contract and pre-registration hashes, and a qualification label
  that may only read `NOT_TRAINED` or `NOT_QUALIFIED` (the reference refuses anything else);
- absolute risk statements, if any, still come from a calibrated absolute estimator and are labelled as such. The
  discriminator's output is relative and must not be presented as an absolute risk.

**When the evidence is insufficient.** The component reports it: `NO_SUPPORTED_COMPARISON`, a cycle at the top, an
indistinguishable top set, or a small margin. Under the full-coverage contract the kernel must still name a decision
set, and such classes are counted against it. Under a selective contract, were one ever adopted, these are natural
abstention reasons. No safety guarantee is invented in either case.

## 7. What is deliberately not specified

- The learner family, capacity, feature list and hyper-parameters. They belong in the pre-registration, chosen by
  rules fixed in advance on fresh exploration data only.
- Any threshold. None is derived from spent validation outcomes.
- Any claim that the design works. Whether public information supports within-menu discrimination is the hypothesis.

## 8. Contract tests (synthetic, deterministic)

| area | tested |
|---|---|
| action-pair symmetry | p(a,b) + p(b,a) = 1 and p(a,a) = ½ exactly; a biased raw scorer is consistent after antisymmetrisation and withheld if used raw |
| identity permutation, menu order | bit-identical scores and ranks under all orderings and renamings |
| cycle handling | an intransitive fixture is ranked, the cycle reported, a top set inside it flagged; a dominant action above a cycle is strictly ordered |
| tie handling | distinct inseparable actions returned together whatever they are named; equivalent actions tie without that flag |
| missing or inconsistent estimates | demoted and reported, never repaired; no order when nothing is supported |
| invalid action identities | missing keys, types or descriptors; ids, handles and positions refused |
| unsupported expert evidence | unknown contract, expert or kind refused |
| R0 execution refusal | every execution method and request variant refused; privileged and label fields refused |
| source provenance | no discriminator without complete, well-formed provenance; a "qualified" label is refused |
| label contract | five families separate; union introduction is the pair target; regret never breaks a safety tie; conditioning required |
| frame invariance | invariant descriptors rank identically in all eight D4 frames; a signed coordinate does not |

19 tests, 19 pass. They show the contract is implementable and checkable. They do not show a learned model can
satisfy it usefully.

```
H_DISC_ARCHITECTURE=SPECIFIED (four components; contract reference with 19 synthetic tests; nothing trained)
PAIRWISE_ACTION_COMPARATOR_CONTRACT=HDISC_PAIRWISE_COMPARATOR_CONTRACT_V1 (antisymmetric by construction; transitivity not assumed)
SAFETY_LABEL_CONTRACT=HDISC_SAFETY_LABEL_CONTRACT_V1 (five separate families; primary = comparator-relative union introduction in any member; offline only)
MENU_RANKING_CONTRACT=HDISC_MENU_RANKING_CONTRACT_V1 (constraints, support, relative safety, worst case; set-valued ties; cycles reported)
PUBLIC_INFORMATION_BOUNDARY=frozen observation contract + complete legal menu + lawful semantics + public history + SK1_ADVISORY_EVIDENCE_V1; no hidden state, labels, seeds, hashes or identifiers
```
