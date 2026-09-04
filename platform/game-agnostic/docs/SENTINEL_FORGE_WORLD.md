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
