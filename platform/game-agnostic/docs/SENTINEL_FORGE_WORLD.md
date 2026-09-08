# Sentinel Forge World

A deterministic simulation environment that owns world truth, so Sentinel Grid can
be measured against exact answers instead of against another model's opinion.

Introduced in **Stage 3A**. It belongs primarily to **Stage 5 — Learning &
Adaptation**; Stage 3A records it as an early foundational capability, built ahead
of the stage that will use it.

> **Sentinel Forge World** is the simulation and training environment.
> **Sentinel Forge** is the branded expert/agent. They are different things and
> share only a name.

## What it is

A pure, seeded simulation kernel: `createWorld`, `cloneWorld`, `observe`,
`legalActions`, `step`, `isTerminal`, `score`, `hashWorld`. No module-level mutable
state, no wall-clock read, no unseeded randomness. Same seed plus same actions
gives a byte-identical world, every time, on any invocation path.

`step` is **pure** — it returns a new world and never touches the one it was given.
That is stronger than the Sentinel adapter contract asks for, and it is the
property the whole counterfactual apparatus rests on: branch A cannot contaminate
branch B if no branch can write to its parent at all.

## Why ASCII

Because a training environment nobody can read is a training environment nobody
can debug. A rendered world shows, at a glance, what a JSON dump makes you
reconstruct:

```
tick 0/12  energy 36  family nexus/live_substitute  L2
###########
#.........#
#..FPTi...#
#.........#
#.....~...#
#....S.E#.#
#.........#
###########
```

`P` is the actor, `T` an objective-bearing node, `i` a **failed** infrastructure
node (lower case means present but out of service), `S` a live substitute, `F` a
resource, `E` a hostile, `~` an environmental hazard. The dependency that has
broken and the substitute that could carry it are both visible without reading a
single field.

## Why structured state is authoritative

ASCII is a **presentation layer**, and the arrangement makes that testable rather
than merely intended:

- the renderer is a pure read of structured state;
- nothing in the simulation path imports it;
- `hashWorld` covers a semantic projection that excludes presentation, version
  banners and the event log.

A test renders a world, changes the render options, renders again, and requires
the world hash to be identical. Changing a symbol changes what a human sees and
nothing a certification depends on. The certify script separately checks that
neither the kernel nor the adapter imports the renderer, because the moment the
display can influence the simulation, the display is part of the simulation.

## Everything is integer arithmetic

No floating point appears in any transition or reward path. Values, costs, risks,
health, every reward component and the scalarized reward are exact integers.

This is not fastidiousness. It means determinism is a property of the arithmetic
rather than a hope about it, and it means an exact tie is *exactly* a tie — which
turned out to matter more than expected (see below).

## How counterfactual truth works

For a state `S`, the oracle clones `S` once per legal action, steps each branch,
rolls it forward for a bounded horizon, and computes the reward vector exactly.
`utility(A)`, `utility(B)` and `utility(C)` therefore all come from the same
starting state, with no estimator standing between the world and the answer.

**No learned model may define these values.** The roll-forward uses a named,
declared continuation policy — `GREEDY_IMMEDIATE_SCALAR_TIEBREAK_ACTION_KEY_V1` —
so a horizon utility is a property of the world plus a policy that is written
down, never of a model's opinion.

Three properties are measured rather than asserted, on every case:

1. the source state is unchanged after branching;
2. branches are isolated from one another;
3. the order branches are evaluated in changes nothing.

The third is earned by actually varying the order: `evaluateCounterfactuals`
accepts a shuffle seed, and the certification compares digests across orders.

Because the optimum is a *set* when several actions tie, "the optimal action" is
the tie-broken representative, and anything that scores it must say which question
it is asking. Stage 3A's first run got this wrong; see below.

## The admission gate

`generate → validate → assert → admit`.

A generator declaration is **not** ground truth. That is the lesson of Stage
2L.23, where three separate corpus defects turned out to be one mistake: a family
*name* treated as evidence that the produced case had the named property. So every
generated scenario is checked by an independent validator that reads the produced
world, and two rules make it a gate rather than a decoration:

- **No validator may call the expert it validates for.** A "cycle" validator that
  asked Nexus whether there was a cycle would be scoring the corpus with the thing
  the corpus scores. The validator module imports nothing from `src/experts/`, and
  the certify script checks the import graph.
- **No validator may read the family label** to decide whether the claim holds.
  The label picks *which* validator runs; it is never evidence.

The gate also has a control, because a 100% admission rate is equally consistent
with a gate that cannot reject anything. Seven scenarios are generated under one
family and validated against a *different* family's claim; the honest claim must
hold and the false one must be refused.

It earned its place during construction: `prime/resource_constrained_planning` was
rejected on all eighteen of its first cases, because the generator placed
repairable nodes by entity count and the energy budget always covered every
repair. The family claimed a constraint that was not in the world it produced. The
generator was wrong and the validator was right.

## Effective variation, not raw count

504 generated cases rest on 105 distinct topologies and 334 distinct outcome
rankings. The reportable sample size is the smallest of the distinct-state,
distinct-topology and distinct-ranking counts — never the raw count. A corpus that
reports 504 independent cases when it holds 105 structures is overstating itself
by a factor of five.

## How training data is generated

One replay record per decision: the state, what was legal, what Sentinel said,
what the world says is true, and the provenance binding them. Two identity rules:

- **no absolute filesystem path** may appear in semantic identity — a dataset
  outlives the machine that made it;
- the record hash is **self-excluding**, because a document cannot contain its own
  hash.

Four exporters — JSONL replay, SFT, preference pairs, RL episodes — each a pure
function of the records, each canonically ordered so the same records export
byte-identically in any order.

Two exclusions are counted rather than hidden. A record with an **exact tie** at
the optimum produces no SFT row: there is no single correct completion, and
training on one would teach the tie-breaking rule instead of the task. A
preference pair with a **zero utility gap** is not emitted: it is not a
preference, it is noise wearing a label.

## How Soup fits

```
Forge World ──► replay records ──► dataset export ──► [bridge] ──► Soup
                      │                                              │
                      ▼                                              ▼
              Sentinel Lab evaluation                     candidate expert / LoRA
                      │                                              │
                      └──────────────► offline → shadow → reject/promote ◄─┘
                                          (Sentinel only)
```

Soup (v0.74.0, Apache-2.0) consumes exported datasets and produces candidate
artifacts. Audited capabilities: SFT, preference training (DPO/ORPO/IPO/SimPO/
KTO/BCO/online-DPO), GRPO, PPO, reward models, custom rewards, LoRA, QLoRA, Qwen
recipes, checkpointing, adapter and GGUF export.

One capability is **partial** and recorded as such: no single global training seed
was found that would make a full run bit-reproducible. Per-feature seeds exist.
That is a limitation of the training engine, and it is why `SEED` is mandatory in
the provenance envelope but not by itself sufficient to reproduce a checkpoint.

**The bridge is a translation, not a pass-through**, and the audit is what proved
it. Forge SFT rows are `{prompt, completion}`, which matches *no* Soup format
signature — `kto` is the only signature containing both keys and it additionally
requires `label`. Handing Soup the raw export would fail detection. Preference
rows are the opposite case: `{prompt, chosen, rejected}` is Soup's `dpo` signature
exactly, and passes through untouched.

Every translated row is run through Soup's own detection rule, and the
**untranslated** row is run through it too as a control: it must detect as
nothing, which is what proves the translation does work rather than decorating a
row that already passed.

## Why Soup is isolated from runtime authority

Nothing in the Sentinel runtime imports the bridge, and the bridge imports nothing
from Soup. The certify script checks the import graph of every runtime file —
kernel, adapter, contract, renderer, scenarios, validators, counterfactual oracle,
Prime, both experts, the contract layer — and blocks if any of them so much as
mentions Soup.

The direction of the arrow is one-way by construction rather than by policy: the
bridge can *write* a dataset and *describe* a candidate, and has no function
returning anything Sentinel would act on.

## How candidate experts are promoted

```
GENERATED ──► TRAINED ──► CANDIDATE ──► OFFLINE_EVALUATED ──► SHADOW_EVALUATED ──► CERTIFIED
(Forge)      (Soup)      (Sentinel Lab)   (Sentinel Lab)        (Sentinel Lab)    (Sentinel certification only)
```

Soup may reach `TRAINED`. It may never reach `CERTIFIED`: no transition into that
state names any actor but Sentinel certification, `CERTIFIED` is terminal, and the
certify script blocks if either ever stops being true.

A candidate whose training provenance envelope is incomplete is **rejected**, not
accepted with a warning. Fifteen mandatory fields, each naming an input that
changes what the artifact is. An artifact whose inputs cannot be named cannot be
evaluated, only trusted — and trust is not a certification.

## What Forge World measured about Sentinel

Prime produced a legal recommendation on 100% of 504 cases, through ordinary
contracts, with no Forge-specific branch anywhere in its path.

Agreement with the exact optimum, decomposed:

| | cases | agreement |
| --- | --- | --- |
| horizon-aligned (one-step optimum **is** the horizon optimum) | 319 | 94.04% |
| horizon-dependent (they differ) | 86 | 0% |

Prime scores an action over **one** step; the oracle scores it over three under
the declared continuation policy. Where those objectives agree, Prime reaches the
optimum almost always. Where they disagree, it reaches it never — because a
one-step objective structurally cannot. That is an objective mismatch, measured;
it is not a search defect and not a claim that Prime is wrong.

Those 86 horizon-dependent cases are the first precisely characterised target this
substrate has produced.

### The metric that had to be corrected

The first run reported **0%** agreement across all 144 Oracle-surface cases. Zero
across a whole surface is a claim about a systematic effect, so it was inspected
rather than reported — and the defect was in the metric. Prime was choosing
`PROTECT target`, which **tied** at the optimum, and losing a lexicographic
tie-break to a `MOVE`. The metric was measuring agreement with a sorting rule.

Agreement now means regret zero — an action *of optimal utility*. The tie-break
match is reported separately, as the far less interesting number it is.

## Limitations

- **No learned candidate exists.** Soup was audited and format-bridged, never
  invoked. Nothing is claimed about what a trained candidate would do.
- **The continuation policy is a choice.** Horizon utilities are exact *under a
  named policy*. A different declared policy would give different, equally exact
  utilities, so the optimum is optimal with respect to something written down
  rather than in the abstract.
- **416 of 504 cases have an exact tie at the optimum**, capping SFT yield at 88
  rows. A reward vector this coarse leaves many actions genuinely
  indistinguishable. Sharpening it is scenario-design work, not a defect in the
  arithmetic.
- **Single platform.** The inherited `DIGEST_PRODUCED_SINGLE_PLATFORM` limitation
  is unchanged.

## Running it

```bash
cd platform/game-agnostic
npm run forge:stage3a:certify     # regenerate Stage 3A artifacts
npm run forge:stage3a:check       # verify the stored certification reproduces
npm run test:stage3a-forge-world  # 49 tests
```

---

# Stage 3B — MicroWorld curriculum

Stage 3A produced a working substrate with two measured limits: 82.5% of cases
had an exact tie at the optimum, and 504 cases rested on only 105 topologies.
Stage 3B addresses both — and the way it addresses the first is the more
interesting half.

## Ties are not one thing

The obvious move is to engineer ties away. That is forbidden without a taxonomy,
and the taxonomy is what changed the plan. Every tie is classified:

| class | reward defect? |
| --- | --- |
| `ACCIDENTAL_REWARD_COLLAPSE` | yes — different vectors, same scalar |
| `INSUFFICIENT_REWARD_RESOLUTION` | yes — different worlds, same reward |
| `GENUINE_STRATEGIC_EQUIVALENCE` | no — the actions genuinely are the same move |
| `SYMMETRIC_ACTIONS` | no |
| `HORIZON_ALIASING` | no — the paths actually converge |
| `OTHER` | — |

Only the first two may be removed. A genuine equivalence that gets "fixed" is a
fabricated label, and a model trained on it learns a fabricated world.

**The first classifier got this wrong.** It asked "did the immediate rewards
differ?" first and called every such case horizon aliasing, putting 397 of 416
ties beyond scrutiny. Checking whether the paths actually *converge* first showed
only 17 of those 397 merge. The other 380 end in materially different worlds
carrying identical accumulated reward.

## FORGE_REWARD_V2, and why it is not tie-breaking

V1 is a pure **flow** reward: it sums what happened along the way and has no term
for the value of the world it left behind. Two paths with the same flow score the
same however differently they end. That is a missing dimension.

V2 adds two **potential** terms:

- `futureObjectivePotential` — how much closer the world is to satisfying its
  objectives, counting shortfall, material in hand, and distance to the bearer.
- `optionValue` — how much room to act survives: live substitutes, redundant
  supply, unbroken structure.

Each is a difference Φ(after) − Φ(before) of a function of world state. Because
they are differences of a potential they **telescope**: over a complete trajectory
their sum collapses to Φ(end) − Φ(start), so they cannot reorder complete
trajectories. They separate only truncated horizons — exactly the case the
taxonomy found and exactly the case the oracle scores. That is the argument for
their admissibility, and it is why they are potentials rather than bonuses.

V1 is frozen. V2 is a superseding module computed from the V1 vector plus the two
worlds, so every Stage 3A certification still reproduces.

## Supervision is routed, not forced

Five classes decide which exporter may use a case:

| class | SFT | preference | RL |
| --- | --- | --- | --- |
| `UNIQUE_OPTIMUM` | yes | yes | yes |
| `NEAR_TIE` | no | only above the declared gap | yes |
| `EXACT_EQUIVALENCE` | as an explicit set of equal optima | **no** | yes |
| `PARETO_TRADEOFF` | no | **no** | yes |
| `INSUFFICIENTLY_RESOLVED` | no | no | yes |

Supervision density rises because cases go to the dataset that can represent them
truthfully — not because any distinction was invented. An exact equivalence
produces an SFT completion naming **every** equal optimum; a lexicographic
tie-break is never taught as world truth. A Pareto-incomparable pair never
becomes chosen/rejected, because preferring one is a statement about weights.

## Topology by composition

Fifteen procedural shapes × six role mixes × eight objective compositions × five
horizon bands × six levels. Composition is what buys structural diversity: a star
and a mesh of the same size fail differently, and that difference is what the
relational experts are asked to see.

### A validator that was too strict

The gate's first run rejected 3,403 cases concentrated in three shapes. The cause
was not the generator: depth and cut analysis were anchored at the objective node,
and the objective is often attached *below* the structure being sought. Both
anchors are now canonical and label-free — depth is the deepest run anywhere, cuts
are computed from the node that reaches the most.

A second defect surfaced immediately after: `longestDependencyDepth` enumerated
every simple path, which is exponential, and the gate stopped making progress on
dense meshes. It is now a memoized DFS in O(V+E) that reports the node count for a
cycle, since "at least this deep" answers every threshold correctly without
claiming a precision that does not exist.

## Continuation policies are named assumptions

Stage 3A had one. Stage 3B has three — `GREEDY_CONTINUATION_V1`,
`OBJECTIVE_PRIORITY_V1`, `RISK_CONSERVATIVE_V1` — because a dataset whose optimal
actions are all artefacts of one roll-forward rule is a dataset about that rule.
No policy is "the true future". Cases where all three agree are marked
`POLICY_INVARIANT_OPTIMUM` and are stronger supervision than those where they do
not.

## Splits by structure

Assignment is by **topology hash**, so a structure appears in exactly one split by
construction. Splitting records at random would put near-identical structures on
both sides and let a model score well by having memorised the shape.

The OOD set is **constructed, not sampled**: levels above the training curriculum,
with larger graphs and longer horizons. It is not used during tuning.

## Running it

```bash
cd platform/game-agnostic
npm run forge:stage3b:generate    # deterministic corpus, sharded across processes
npm run forge:stage3b:certify     # measure and certify
npm run forge:stage3b:check       # verify the stored certification reproduces
npm run test:stage3b-curriculum   # 47 tests
```

The corpus is a build product: deterministic from pinned seeds, kept out of the
repository by size, with its sha256 recorded in the dataset manifest.

---

# Stage 3B.1 — temporal warm-up and Oracle reachability

Stage 3B certified a large, diverse, leakage-free corpus and recorded, in the same
certification, the defect that made one of its axes useless:

> `ORACLE_AXIS_UNREACHABLE` — decisions were captured at tick 0, where
> `world.history` holds one frame, against an Oracle that needs three. Every Oracle
> case abstained; router usefulness alignment fell to 0.0268.

That was never an Oracle deficiency. The signal was in the world state — every
world carried a temporal channel — and the expert could not reach it. Stage 3B.1
repairs that one defect and recertifies as a new lineage, `FORGE_DATASET_V2`.
`FORGE_DATASET_V1` is immutable and still reproduces from its own artifacts.

## History is state, so it has to be lived

The warm-up does not append frames. A scenario is initialized, the frozen kernel
is stepped, each state is observed, and the decision is captured only once the
required temporal context exists. Nothing outside `step()` writes to
`world.history`, and the warm-up never consults a Sentinel expert — a recommendation
shaping the world the recommendation is later scored in would be exactly the
pathway from advice to simulator authority that R0 forbids.

## Why 24 ticks, and not 18

Every Oracle head's history requirement was read off its implementation, not
guessed. The longest guard — `regimeChange` — opens at 18 frames, so a 17-tick
warm-up would clear every documented minimum. It would also be a fake fix: the
head's comparison window is `min(8, floor(n/3))`, which at 18 frames is 6, so the
head would answer on windows narrower than the eight samples it is built around.
`floor(n/3)` reaches 8 at n = 24. The warm-up targets 24.

| head | guard opens at | measurable at |
| --- | --- | --- |
| `direction` | 3 | 3 |
| `volatility` | 4 | 4 |
| `timeToThreshold` | 4 | 5 |
| `abstention` | 5 | 5 |
| `persistence` | 6 | 6 |
| `reversal` | 8 | 9 |
| `cycle` | 8 | 18 |
| `regimeChange` | 18 | 24 |

## A warm-up that changes the task is invalid

Measured, not assumed. A naive 24-tick WAIT on the Stage 3B generator terminates
45% of worlds on `HORIZON_EXHAUSTED` and kills entities in 43% — so it was rejected.
Two things fix it, both decided at **scenario construction**, before any world
exists, and neither of them history:

1. **The horizon is calibrated.** The safe warm-up length is measured on a probe
   run first, and the scenario is then declared with exactly that much extra
   `maxTicks`. The horizon remaining at the decision point equals the horizon
   Stage 3B gave the decision — not less, and not more. Extra horizon is as much a
   task change as too little.
2. **The channel spans the whole timeline.** Stage 3B declared 8 to 22 samples,
   shorter than the warm-up, and `currentFrame()` clamps past the end of a series.
   A warm-up running off the end observes the same value forever — length without
   information, and a flat history the Oracle would correctly read as stable.

What remains is truncation: the one dynamic that ends a warm-up early is hostile
degradation through an `attacks` relation crossing an availability threshold. Role
mixes that declare hostiles support shorter warm-ups, so the heads needing the
longest history are measurable disproportionately in worlds without them. That is
reported as `ORACLE_HEAD_REACHABILITY_CONFOUNDED_BY_ROLE_MIX` rather than tuned
away.

## The second defect

Repairing the first surfaced a second, which would have hidden the repair:

> `ORACLE_HEAD_CHANNEL_VOCABULARY_UNMAPPED` — the eight-head assembly reads
> `frame.channels.alpha` and nothing else. Forge declares `primary`. Every head
> computed over an empty series, reported coverage zero and abstained — at any
> history length.

The remedy is a declared channel mapping at the adapter layer, exactly as the
Oracle's own contract says it should be ("mapping a game's state onto channels is
adapter work"). No head was modified. Normalization is against the **declared**
domain, never the observed range: letting the series set its own scale would make
two worlds of different volatility normalize to the same spread.

## Families are validated by measurement, never by name

The V3 generator names a temporal family. A name is not evidence — the same rule
the semantic admission gate has enforced since Stage 3A. Each realized series is
measured head-free (monotonicity, net change, alternation ratio, mean absolute
step, split-level shift) and the family is only treated as ground truth where the
observed window actually exhibits it.

This also caught a real construction defect: placing a reversal or a level shift at
the midpoint of the *whole* timeline puts it after the warm-up ends, so the observed
history is a plain ramp and the family name is a claim about frames nobody looked
at. Structural events are now placed inside the observed prefix.

One measured head property is reported rather than corrected: the cycle head picks
the lag with the highest autocorrelation, and a smooth monotonic ramp is strongly
autocorrelated at every lag, so it reports `CYCLICAL` on monotone histories. The
head is frozen; the declared family is not used as its ground truth.

## Every difference is a corpus effect

Prime, Nexus, Oracle, the Arbiter and the router are byte-identical across the two
lineages, and no training was run in either. Every V1-to-V2 difference is caused by
which world state the decision was captured in. Describing any of it as a model
improvement would be false.

## Running it

```bash
cd platform/game-agnostic
npm run forge:stage3b1:pilot      # 2k-5k records; gates the full run
npm run forge:stage3b1:generate   # deterministic corpus, sharded across processes
npm run forge:stage3b1:certify    # measure and certify
npm run forge:stage3b1:check      # verify the stored certification reproduces
npm run test:stage3b1-temporal-warmup
```

The pilot is a gate, not a warm-up lap: if the Oracle had still been unreachable at
pilot scale, generating seventy thousand more records of the same defect would have
been the wrong answer.

---

# Stage 3C — first learned Nexus candidate — BLOCKED

Stage 3C is the first stage in Sentinel Grid that would train a model. This
environment cannot train one, and that is measured rather than assumed:

| requirement | present |
| --- | --- |
| `SOUP_INSTALLED` | no |
| `BASE_MODEL_WEIGHTS` | no |
| `TRAINING_RUNTIME` | no |
| `ACCELERATOR_OR_VIABLE_CPU_BUDGET` | no |

The decisive one is the base model: `huggingface.co` is refused by the
environment's egress policy with a 403 to CONNECT. The proxy documentation states
that organization policy denials are to be reported rather than routed around, so
no alternate host was attempted.

No candidate exists, so no accuracy, regret, complementarity, hybrid or
generalization figure is reported anywhere in the artifacts. A plausible number
written there would be indistinguishable, in every stage that later reads it, from
one that was measured. The blocker is classified
`ENVIRONMENT_SUBSTRATE_UNAVAILABLE` — explicitly not `DATASET_LIMIT`,
`MODEL_CAPACITY` or `F_TRAINING_PIPELINE_DEFECT`, because no pipeline was
exercised and no model was built.

## What was delivered anyway

Everything that does not need a trained model:

- **The entry gate**, verified rather than asserted. Stage 3A, 3B and 3B.1 all
  reproduce; FORGE_DATASET_V2 is frozen; all four split hashes recorded; zero
  record-level and zero topology-level leakage from TRAIN into VALIDATION, HOLDOUT
  or OOD; training exports drawn from TRAIN only. HOLDOUT and OOD were counted and
  hashed and never evaluated against any policy.
- **The task contract** a learned specialist would have to satisfy — structured
  output with `actionId`, `confidence` and `abstain`, no hidden chain-of-thought,
  and a legality rule that an illegal answer is counted as illegal and never
  silently repaired into the nearest legal one.
- **Case selection, targets and the distribution audit.**
- **Four baselines** a candidate would have had to beat, measured now so the
  comparison exists before the candidate does.
- **The legality gate and a mutation-tested promotion firewall.**

## Deterministic Nexus does not pick actions

The brief asks for "deterministic Nexus accuracy" on a pick-an-action task. Nexus
emits **graph-level signals** — counts of bottlenecks, critical dependencies,
threatened and unsupported nodes, depth, density — and has no per-action output at
all. Scoring it directly against an action-picking model would be comparing two
different kinds of thing and reporting the difference as a result.

So Stage 3C builds `NEXUS_RELATIONAL_SELECTOR_V1`, a deterministic policy on top
of those signals, and reports it under that name everywhere. Nexus is unmodified.
On 400 VALIDATION cases the selector reaches 0.2462 optimal-set accuracy while
abstaining on 16.75%, which does **not** beat a greedy immediate-reward heuristic
at 0.275. That is worth stating plainly: the relational signal, turned into a
policy this way, is not currently better than taking the best next step.

## A selection rule with base rate 1.0 selects nothing

The first draft of the case selector keyed on the generator's shape and role
**names** — `shape === 'bridge'` meant BRIDGE — which is the mistake this project
has refused since the Stage 3A admission gate, and it admitted 99.96% of TRAIN.

Rewriting the rules to measure the record did not fix it, because two of them are
constants on this corpus: every Forge world affords at least three action types
and at least one of PROTECT or REINFORCE. Requiring "two relational rules" while
two rules always fire admits everything.

Rules are now measured for informativeness before they may carry the selection —
only a base rate strictly inside (0.02, 0.98) qualifies — which brings selection
to 23.3% and surfaces two further corpus facts: `SUBSTITUTION` and `BOTTLENECK`
never fire at all, and the corpus contains only 20 negative controls in 50,860
TRAIN records, so a specialist trained on it would get almost no signal for when
to abstain.

Selecting for relational density also skews the subset: mesh and
redundant_network supply 55% of it. Reported as
`SELECTION_SKEWED_TOWARD_DENSE_TOPOLOGIES` rather than left for a later reader to
discover in a per-topology table.

## Running it

```bash
cd platform/game-agnostic
npm run forge:stage3c:certify
npm run forge:stage3c:check
npm run test:stage3c-learned-nexus
```

---

# Stage 3C-R — training environment provisioning — BLOCKED on one requirement

Stage 3C was blocked on four things. Three of them are now false.

| requirement | Stage 3C | Stage 3C-R | why it changed |
| --- | --- | --- | --- |
| `SOUP_INSTALLED` | no | **yes** | Stage 3C's probe was wrong |
| `TRAINING_RUNTIME` | no | **yes** | installed by this stage |
| `ACCELERATOR_OR_VIABLE_CPU_BUDGET` | no | **yes** | the CPU budget was measured, not assumed |
| `BASE_MODEL_WEIGHTS` | no | no | still denied by organizational egress policy |

## One of those is a correction, not a change in the world

Stage 3C probed for Soup with `which soup` and concluded it was absent. That
answers "is there an installed executable on PATH", not "is Soup available". A
clean git checkout of Soup at exactly the pinned commit
`f07e07ed7edd548a4d1d9143f77af9027b1b7036` was sitting one directory above the
repository the whole time.

Stage 3C's **result** is not rewritten — it was BLOCKED, and it would have been
BLOCKED on the base model alone, so the corrected line does not change its
outcome. But the line was wrong, and a stage that quietly dropped it while
re-reporting the rest would be laundering its own error.

## What now works

- Soup at the pinned commit, clean tree, CLI runs, `soup doctor` green on every
  required dependency
- torch 2.14.0, transformers 5.16.1, peft 0.20.0, trl 0.29.1; CPU backend
  recognized by both Soup and torch
- environment class `CPU_SMALL_MODEL_ONLY` — four cores and 16 GB will not train a
  7B model, but a sub-billion-parameter LoRA run is genuinely inside this budget,
  which is why it is not `UNSUITABLE`
- Soup's own `detect_format` reads **all 4,459 rows** of the real
  FORGE_DATASET_V2 export as `alpaca` — every row, not just the first
- a full train loop completes on this machine: load, LoRA, gradient, checkpoint,
  adapter reload, inference

## The Soup bridge drift check finally ran

Stage 3A transcribed Soup's twelve format signatures into `soup-bridge.js` as
DATA rather than reimplementing them, on the reasoning that a drift check should
be a comparison rather than an argument about whether two implementations agree.
That comparison had never actually been run against live Soup, because Soup was
believed absent. It runs now, and the twelve signatures match **exactly**.

## What is still blocked

`BASE_MODEL_AVAILABLE`. `huggingface_hub.snapshot_download` returns a
`ProxyError` 403 through the installed stack — the same organizational egress
denial `curl` saw. The stage brief forbids bypassing it, using an undocumented
proxy, or pulling weights from an untrusted mirror to make the stage pass, and
none of those was attempted. Every alternate host probed — modelscope.cn,
hf-mirror.com, download.pytorch.org, ollama.com, registry.ollama.ai, kaggle.com —
was unreachable, and no local cache, Ollama installation or GGUF artifact exists.

So no candidate exists, and no accuracy, regret, complementarity, hybrid or
generalization figure appears in these artifacts.

## The pipeline harness is not a candidate

To test the checkpoint writer without weights, this stage builds a tiny model that
is randomly initialised locally from a Llama architecture config, with a BPE
tokenizer trained on the Sentinel corpus itself. It has no pretrained knowledge,
and it is never scored. Reporting its loss as a result would be reporting the
arithmetic of a random model.

It exists to prove one thing: Soup can load a model, compute a gradient, write a
checkpoint and reload an adapter here. It can.

## Decisions taken that need no weights

- **Abstention** — option A, action selection without claiming abstention. The
  corpus has 20 negative controls in 50,860 TRAIN records; a model trained on that
  which emitted an abstention would be guessing. The task contract drops the
  `abstain` field rather than carrying one nothing taught it to use.
- **Topology skew** — a sampler caps any shape at 12% of the sample, taking the
  largest share from **0.2798** to **0.1749**. TRAIN only: reshaping VALIDATION,
  HOLDOUT or OOD would be choosing the exam.
- **Task** — `LEARNED_NEXUS_ACTION_SELECTION_V1`, structured output, no
  natural-language explanation, no hidden chain of thought.
- **Targets** — accept any member of the optimal set at evaluation; exclude exact
  ties from single-target SFT. A tie is the world saying two actions are worth the
  same, and training the sort order as the answer teaches the sorting function.

## Running it

```bash
cd platform/game-agnostic
npm run forge:stage3cr:probe      # measures the environment, writes evidence
npm run forge:stage3cr:certify
npm run forge:stage3cr:check
npm run test:stage3cr-training-environment
```

## Stage 3C-R.1 — trusted base model acquisition

Stage 3C-R stopped on one requirement: SFT adapts a base model, and no base model
could be obtained. Stage 3C-R.1 asks whether one can be supplied through an
authorized path, and answers **no** — `E_NO_AUTHORIZED_BASE_MODEL_AVAILABLE`.

The container was reprovisioned between the two stages, so the pipeline was
re-executed rather than inherited. Every step passed again and the LoRA adapter
came back with the identical sha256 `21550fad0b01099b…`. The pipeline has now been
shown sound on two different machines.

### The channels that are actually open

| channel | status | what it means |
| --- | --- | --- |
| PyPI | authorized | full simple index (886,683 packages) searched; no trainable causal LM |
| GitHub anonymous git | authorized | works, but Git LFS objects are not served, so weights arrive as pointer stubs |
| GitHub HTTP / releases | 403 | release assets are not a channel at all |
| GCS / S3 | authorized | object stores reachable; no authorized model bucket is declared anywhere |
| model hosts | denied / unreachable | huggingface.co and CDN, mirrors, PyTorch, Ollama, Kaggle |
| artifact archives | unreachable | Zenodo, archive.org, figshare |

No proxy bypass, URL rewriting, undocumented proxy, unauthorized mirror or
third-party archive was used. An HF-owned alternate endpoint would have been the
same evasion wearing a different hostname, and was not used either.

### A bucket name is not provenance

`gs://gpt-2` — the bucket OpenAI's own `download_model.py` once fetched from — is
reachable, and now holds a single unrelated HTML file uploaded by a third party in
2026. A stage that had matched on the bucket *name* would have pulled an
attacker-controlled object into a training pipeline labelled "GPT-2, official".
Nothing was downloaded from it. This is the Stage 3B admission-gate lesson arriving
from a new direction: **the name of a container is never evidence of its contents.**

### What is built and waiting

The model-shaped hole is the only thing missing. Acquisition is complete and tested:

- **Provenance envelope** — 10 required fields, no optional ones. The aggregate
  hash is derived from the per-file hashes, so two envelopes agreeing on the
  aggregate cannot disagree on the parts.
- **Supplied model path** — `SENTINEL_BASE_MODEL_PATH` or `SENTINEL_BASE_MODEL`,
  validated for format, causal-LM architecture, tokenizer and complete provenance.
  The declared path is the *only* place it looks; there is no fallback search.
- **Format classification** — 8 classes, with inference-only formats decided
  before trainable ones so a stray `config.json` cannot promote a GGUF.
- **Trainability contract** — 9 steps, from `from_pretrained` to inference.
- **Activation gate** — 7 requirements opening directly into the frozen Stage 3C-R
  campaign, with no stage in between.

The one HF-format artifact on this machine is this project's own randomly
initialised harness. The gate rejects it on provenance — which is the outcome that
proves the gate does something. A model this project generated is not a model this
project acquired, so it is excluded from the candidate count by origin.

## Running Stage 3C-R.1

```bash
cd platform/game-agnostic
npm run forge:stage3cr1:probe     # inventory, channels, pipeline re-execution
npm run forge:stage3cr1:certify
npm run forge:stage3cr1:check
npm run test:stage3cr1-base-model-acquisition
```
