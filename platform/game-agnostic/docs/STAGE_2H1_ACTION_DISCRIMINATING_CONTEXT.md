# Stage 2H.1 — action-discriminating expert context (R0)

Stage 2H.1 proves that certified Oracle and Nexus signals can discriminate between
legal actions — deterministically, within the **inherited** Stage 2H bounds, and
without displacing Prime as decision owner.

Authority is unchanged: **R0**, `canDispatch=false`, `canMutateLiveWorld=false`.

**This stage makes no claim about improved play.** It measures whether action
discrimination exists, whether it is causally attributable to expert evidence, and
whether it stays inside its bounds.

## The Stage 2H limitation, measured

Stage 2H's envelope had no per-action structure. `resolveExpertContextAdjustment`
returned one scalar, added to every simulation regardless of which action was
selected:

```
ROOT_CONTEXT_ONLY = true
ACTION_DISCRIMINATION_IMPOSSIBLE_WITH_CURRENT_CONTRACT = true
```

That is why Stage 2H measured `SELECTIONS_CHANGED = 0`.

## What was added

| Path | Role |
|---|---|
| `src/experts/expert-action-context.js` | Per-action envelope, scoring, unified resolver |
| `src/lab/stage2h1-near-tie-adapter.js` | Deterministic near-tie / strong-preference fixture adapter |
| `src/lab/stage2h1-action-context-certification.js` | Fixtures, ablation, counterfactual, certification |
| `scripts/certify-stage2h1-action-context.mjs` | Certification entry point |
| `tests/stage2h1-action-context.test.js` | 27 deterministic tests |

Prime changed only in how it resolves the adjustment — from one scalar to a
per-action lookup. **The Stage 2H certification hash is unchanged**
(`c3236f1b…`), because a Stage 2H envelope resolves to the same constant for every
action.

## The contract

```js
{
  actionContextSchemaVersion, actionContextDigest,
  sentinelRuntimeId, stage2fCampaignId,        // Stage 2F provenance, verbatim
  oracleExpertId, oracleExpertVersion, oracleInputDigest, oracleOutputDigest,
  nexusExpertId, nexusExpertVersion, nexusInputDigest, nexusOutputDigest,
  global: { …the Stage 2H envelope, embedded verbatim… },
  legalActionKeys: [ …canonical keys… ],
  actions: {
    [canonicalActionKey]: {
      oracleAdjustmentMicro, nexusAdjustmentMicro,
      combinedAdjustmentMicro, rationaleCodes, link
    }
  }
}
```

An action with no declared link falls back to the Stage 2H global scalar, so
behaviour degrades to Stage 2H rather than to zero.

**Linkage is supplied by the caller**, not inferred: `actionLinks` maps a canonical
action key to `{ entityId, channels }`. Game-specific extraction stays at the
adapter / canonicalization boundary; the experts only consume a declared link.

## Scoring

**Oracle** scores an action by the channels it addresses. A persistently
deteriorating channel raises the score; a reversed or stabilized trend removes the
preference entirely, so Oracle cannot keep rewarding an obsolete response;
volatility subtracts; insufficient history scores exactly 0.

**Nexus** scores an action by the relational standing of its target. Criticality
(how much depends on it), unmet threat and bottleneck degree raise it; redundant
support paths halve apparent criticality; isolation lowers it; an unknown target or
absent graph scores exactly 0.

Nexus emits aggregates only and Stage 2G forbids changing it, so per-entity
measures are derived here from the same canonical state. That derivation is not
trusted on faith: `buildExpertActionContext` re-runs the certified experts over the
supplied inputs and rejects the build unless both output digests reproduce exactly,
so a per-action adjustment can never exist independently of its originating expert
evaluation.

## Bounds — unchanged

| Bound | Micro | Value |
|---|---|---|
| per expert | 20000 | 0.02 |
| per action, combined | 30000 | 0.03 |

**Disclosed explicitly:** a per-action bound of 0.03 permits an inter-action
*differential* of at most 0.06. That is a consequence of per-action bounding, not a
widening, and it is recorded in the artifact as
`maxInterActionDifferentialMicro`.

## Why a purpose-built near-tie fixture exists

A scan of **2560** (state, simulations, seed) combinations across both certified
reference adapters found a minimum baseline mean-value gap of **0.1** — far outside
the 0.06 reachable differential. With the real evidence applied, visits moved
(19/13 → 17/15) but no ranking ever crossed:

```
SELECTION FLIPS: 0        RANK-ORDER CHANGES: 0
```

Those adapters have structurally separated actions; they are not near-ties. Rather
than widen a bound to manufacture a flip, Stage 2H.1 adds a fixture adapter whose
baseline gap is an explicit parameter, per §10's near-tie requirement. It certifies
**both** directions:

- `epsilon = 0.004` → a genuine near-tie; bounded evidence tips it.
- `epsilon = 0.5` → a strong preference; the same evidence must **not** tip it.

The second is the guard against manufacturing a pass.

## Measured results

15 fixtures. `packetsChanged=14`, `decisionsChanged=12`, `rankingsChanged=5`,
`selectionsChanged=5`, `unattributedSelectionChanges=0`.

| Fixture | Class | Ranking | Selection | Cause |
|---|---|---|---|---|
| control-no-context | control | – | – | NONE |
| neutral-context | neutral | no | no | NONE |
| oracle-aligned | oracle-aligned | no | no | NONE |
| oracle-opposed | oracle-opposed | **yes** | **yes** | ORACLE |
| nexus-aligned | nexus-aligned | no | no | NONE |
| nexus-opposed | nexus-opposed | **yes** | **yes** | NEXUS |
| experts-agree | both-agree | **yes** | **yes** | EITHER_SUFFICIENT |
| experts-disagree | both-disagree | no | no | NONE |
| near-tie-flip | near-tie | **yes** | **yes** | EITHER_SUFFICIENT |
| strong-preference | strong-preference | no | no | NONE |
| oracle-reversal | reversal | no | no | NONE |
| oracle-insufficient-history | insufficient | no | no | NONE |
| nexus-redundant-support | redundancy | **yes** | **yes** | NEXUS |
| oracle-volatility-risk | volatility | no | no | NONE |
| unlinked-fallback | fallback | no | no | NONE |

Every flip is attributed by counterfactual: each expert is neutralized in turn and
the arm that reproduces the flip identifies the cause. A flip that could not be
attributed would not count as certification evidence — there were none.

Note `experts-disagree` does **not** flip: when Oracle favours one action and Nexus
the other, they partially cancel and Prime remains arbiter.

## Ablation

Every contextual fixture is measured across `prime+oracle`, `prime+nexus`, and
`prime+oracle+nexus`. Neutralizing an expert means feeding it neutral evidence
(flat history / empty graph): the expert still runs and stays digest-bound, it
simply has nothing to say.

## Gates

Legal-action set identical before and after in all fixtures; priors still
`uniform`; 17 negative gates all rejecting — nonexistent action id, illegal action,
duplicate key, reordered list, missing action, forged adjustment, out-of-bound
adjustment, widened bounds, substituted runtime / campaign / expert digest, forged
authority, forged decision ownership, executable callback, unknown schema,
legal-set mismatch, and an adjustment detached from its expert evidence.

## Portability

```
digest cc7ff03a25d899f607c2f13624736ee3cf41e96bb18c23a2b41c78c1922284bd
```

| platform | arch | tests | digest |
|---|---|---|---|
| darwin | arm64 | 27/27 | `cc7ff03a…2284bd` |
| linux | arm64 | 27/27 | `cc7ff03a…2284bd` |
| linux | x64 | 27/27 | `cc7ff03a…2284bd` |

## Commands

```bash
npm run test:stage2h1-action-context
npm run prime:stage2h1:certify
npm run prime:stage2h1:check
```

## Out of scope

Priors remain `uniform` — expert signals adjust bounded leaf evaluation per action,
never the prior. The Router stays outside the certified Prime path. No learned
weighting, no multistep search, no authority change. Whether action discrimination
improves decision quality is an evaluation question for a later stage.
