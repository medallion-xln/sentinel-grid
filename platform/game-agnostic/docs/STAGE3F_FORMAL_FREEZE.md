# Stage 3F — formal freeze

The formal Stage 3F freeze turns the certified Stage 3F scientific record into the canonical, immutable inheritance
boundary for Stage 3G. It only verifies, binds, canonicalizes, freezes and certifies. It does not:

- measure anything, or create or change any scientific conclusion;
- retrain anything or generate data;
- redesign any expert or change Router behaviour;
- change authority;
- begin Stage 3G.

Every frozen value is read from a committed, certified artifact, and the build fails closed if any of them disagrees.

| Artifact | Role |
| --- | --- |
| `artifacts/stage3f-freeze/stage3f-freeze.json` | The freeze (`STAGE3F_FREEZE_V1`). |
| `artifacts/stage3f-freeze/stage3f-freeze-certification-result.json` | Its certificate. |
| `scripts/stage3f-freeze.mjs` | Builder; `--check` rebuilds and requires byte identity and never writes. |
| `scripts/stage3f-freeze-certify.mjs` | Certifier. |
| `scripts/certification/check-mode-guard.mjs` | Read-only check-mode guard for all future certifiers. |
| `tests/stage3f-freeze.test.js` | Tests. |

## Commands

| Command | Effect |
| --- | --- |
| `npm run stage3f-freeze:build` / `stage3f-freeze:build:check` | Builds, or byte-checks, the freeze artifact. |
| `npm run stage3f-freeze:certify` / `stage3f-freeze:check` | Certifies, or re-verifies read-only, the freeze. The check reproduces Stage 3F-RP and Stage 3F.6-CR, and through it the symmetric chain. |
| `npm run test:stage3f-freeze` | Runs the freeze tests. |

The certifier needs the gitignored Stage 3F payloads, which `npm run stage3f:evidence:rebuild` regenerates and verifies
against their committed manifests.

## Canonical lineage

| Commit | Content |
| --- | --- |
| `156f0ecdb3b3b90a06bf0dc4ea97b18e13c2410a` | Stage 3F.6-D-SYM certification (main before Stage 3F-RP) |
| `5415e1365c5a01c3802030121c80f0bf69f1005a` | Stage 3F-RP certification |
| `890aa208ee08dec402f208629042fca7af1336c7` | Stage 3F.6-CR plan, claim map and Decision Evaluation Contract v1 |
| `b5d195112243e88579f05a6f870139291e517ddc` | Stage 3F.6-CR certification: `CANONICAL_PARENT_COMMIT` of the freeze |

The history is linear and has no merge commits: `main` was fast-forwarded to `b5d1951`. The certifier checks that the
certified commit identities are unchanged, and that the freeze commit changes only freeze-stage files.

## Hash-type discipline

Every bound artifact carries two distinct, labelled identities. One is never substituted for the other.

- **`BOUND_SEMANTIC_HASH`**: the self-hash a certified document embeds (`certificationHash`, `claimMapHash`,
  `contractHash`, …). It is `sha256(JSON.stringify(document without that field))`. It is the scientific identifier the
  certificate chain binds, and the freeze recomputes it.
- **`RAW_FILE_SHA256`**: the sha256 of the committed file bytes. It establishes artifact integrity only.

| Artifact | `BOUND_SEMANTIC_HASH` | `RAW_FILE_SHA256` |
| --- | --- | --- |
| Stage 3F.6-CR certificate | `d78186b8b828171635d47ac5757d5ac6aa113aa1058c490e98395730c7cfb7e2` | `415faa50cbe5370beed1a36f2a40a5e3d5b97fdda238894c32665f73b9115d00` |
| Claim map | `97e556f502ea42d818f1764e17314ef6cc6f435214ba52fd3a9680e897026350` | `2bb6907bb6b86c6e79d37cfb10ec0335613a73ddc5f19d373196ccd32f4600e2` |
| Decision Evaluation Contract v1 | `10c301884539c5cfb21d95795191217b98762a98aacfab8eab4207c87cbec90e` | `32ce0312dc8bc09360d78c6153eedc045825c3e6fa8c814d30e763ad38f13599` |
| Stage 3F-RP certificate | `30f4fd3478da7097d309390dd64438026fe536a94ba18a07f9fe31e176d49b5a` | `6ec467a979ce594d7536039e24009800d44f5706af377adf6c5c928a71ef0239` |
| STAGE3F6-ERRATUM-001 | none embedded | `399817665bebda660ec73dc46ee9314764173d5b193efc0e3a500a1cfa19dbc9` |

STAGE3F6-ERRATUM-001 embeds no self-hash. Its raw file hash is the identity Stage 3F.6-CR binds (`erratumSha256`), and
the freeze labels it `RAW_FILE_SHA256`.

The freeze's own section hashes (`IMMUTABLE_FACTS_HASH`, `STAGE3G_ENTRY_REQUIREMENTS_HASH`, and so on) are
`sha256(JSON.stringify(section))`.

## Immutable Stage 3F facts

The freeze binds exactly the 18 facts the Stage 3F.6-CR certificate confirms (`immutableFactsCandidate`, each
`supported: true`). For each fact:

- every evidence binding is re-verified;
- the fact must share an evidence binding with its claim in the canonical claim map.

| Fact | Value |
| --- | --- |
| `RESOURCE_SHORTCUT_DEPENDENT` | true |
| `NEXUS_V1_REPRESENTATION_BLOCKED` | true |
| `NEXUS_V1_POLICY_LIMITED` | true |
| `NEXUS_V2_SHORTCUT_DEPENDENT` | true |
| `GENUINE_RELATIONAL_VALUE_MEASURED` | false |
| `EXPERT_COMPLEMENTARITY_EXISTS` | true |
| `EXPERT_COMPLEMENTARITY_ROUTABLE` | false |
| `ROUTER_VALUE_MATERIAL` | false |
| `ROUTER_2_0_JUSTIFIED` | false |
| `RISK_SIGNAL_VALUE_MATERIAL` | false |
| `DECISION_RULE_VALUE_MATERIAL` | false |
| `STATE_REPRESENTATION_SUFFICIENT` | false |
| `SPATIAL_STATE_REQUIRED` | true |
| `ACTION_SEMANTICS_REQUIRED` | true |
| `TRANSITION_PREDICTION_REQUIRED` | false |
| `POLICY_QUALITY_PRIMARY_BOTTLENECK` | true |
| `FALSE_SELECTION_HARM_ACCEPTABLE` | false |
| `AUTHORITY` | R0 |

The qualifications below are part of the frozen fact set.

- **`TRANSITION_PREDICTION_REQUIRED=false`** means: "transition prediction is not the first demonstrated bottleneck;
  only one-step successor value has been measured." It does **not** mean that multistep predictive world models have
  been disproven.
- **`POLICY_QUALITY_PRIMARY_BOTTLENECK=true`** means: "policy quality dominates selection/routing limitations on the
  certified corpus." It is not generalized beyond that evidence.

## Decision Evaluation Contract v1

`SENTINEL_DECISION_EVALUATION_CONTRACT_V1` is bound unchanged. The freeze checks its bytes against the confirmatory plan
commit and against its builder. It remains specification only: no world model is implemented here.

| Metric | Name | Role |
| --- | --- | --- |
| DDV | Downstream Decision Value | Primary future model-selection criterion. |
| TCA | Trust-Conditioned Advantage | Primary future trust-gated decision-value criterion. |
| CR | Counterfactual Regret | Value lost through incorrect counterfactual ranking. |
| CAD | Counterfactual Action Discrimination | Whether candidate futures remain distinguishable. |
| FPE | Factual Prediction Error | Diagnostic only; does not establish useful planning competence on its own. |

- **Canonical rule:** LOWER FACTUAL PREDICTION LOSS DOES NOT IMPLY BETTER DECISION VALUE.
- **Stage 3I rule:** a Stage 3I world model may not win solely because it achieves lower reconstruction, latent, or
  factual prediction loss.
- **Ranking, as frozen in the contract:** DDV on sealed HOLDOUT and OOD first, then TCA, then CR. FPE and CAD never
  decide a ranking on their own.

## Reproducibility contract

- **Canonical numerics:** `SENTINEL_CANONICAL_NUMERICS_V1_REQUIRED=true`. The profile module and its golden vectors are
  bound by hash.
- **Two kinds of reproducibility, kept distinct:**
  - Scientific reproducibility (identical data, decisions, classifications and conclusions) holds, including under
    host-native numerics.
  - Byte reproducibility holds **only** under `SENTINEL_CANONICAL_NUMERICS_V1`.
  - `HOST_NATIVE_MATH_BYTE_CANONICAL=false`. Host-native math changes no scientific conclusion in the Stage 3F-RP
    evidence, and it never certifies.
- **Certified Node majors:** `NODE22_CERTIFIED=true` and `NODE26_CERTIFIED=true`. These come from the Stage 3F-RP
  platform matrix, where every required stage is BYTE_EXACT under the canonical profile.
- **Bound Stage 3F-RP records:**
  - reproducibility contract;
  - certificate (`30f4fd34…`);
  - portability erratum (`STAGE3F-ERRATUM-002-PORTABILITY`).

## Read-only check invariant

`CHECK_MODE_MAY_NOT_MUTATE_TRACKED_STATE=true` for every certification or verification `--check` path introduced from
this freeze onward.

| A check may | A check may not |
| --- | --- |
| Read tracked state. | Rewrite tracked plans. |
| Rebuild explicitly gitignored ephemeral payloads. | Rewrite tracked freeze artifacts. |
| Recompute results. | Rewrite tracked manifests. |
| Compare hashes. | Change source, or alter tracked certification artifacts. |

**Enforcement.** Every script matching `FUTURE_CERTIFIER_PATTERN` calls `enforceCheckModeReadOnly({ checkOnly })` from
`scripts/certification/check-mode-guard.mjs`. The pattern covers `stage3f-freeze*`, `stage3g*` to `stage3z*`, and
`stage4*` onward, with or without a `certify-` prefix.

- In check mode, any write to a tracked path throws: write, append, rename, copy-over, truncation, deletion or
  open-for-write.
- Identical rewrites are refused too. The Stage 3F-RP runtime guard skips identical rewrites, but that tolerance was
  for historical certifiers and is not extended.
- A tracked tree that changes by any route fails the process with exit code 3.
- The tests fail if a matching script does not install the guard.

**Historical exceptions** are documented, not retrofitted, because retrofitting would change their certified source
hashes. Six frozen Stage 3F certifiers rewrite tracked freeze or plan artifacts in `--check`:

- 3F.6-C
- 3F.6-A
- 3F.6-T
- 3F.6-W
- 3F.6-D
- 3F.6-P

This comes from the Stage 3F-RP `checkModeAudit`. Under the Stage 3F-RP guard, identical rewrites are skipped and
differing rewrites are blocked.

## Certifier-chain exception

`CR_CERTIFIER=scripts/stage3f6cr-certify.mjs`, and `CERTIFIER_CHAIN_EXCEPTION_DOCUMENTED=true`.

Stage 3F-RP seals the Stage 3F chain in `scripts/reproducibility/stage3f-chain.mjs`. Its chain-coverage test requires
every `certify-stage3f*` measurement certifier to be a link in that chain. The Stage 3F.6-CR certifier *executes* the
chain, so it cannot be a link, and it is intentionally named outside the pattern. It is not renamed: renaming it would
break the certified Stage 3F-RP chain rule.

The freeze builder and certifier are likewise named outside the pattern.

## Epistemic provenance

`EPISTEMIC_PROVENANCE_REQUIRED=true`: every input and prediction must declare its provenance (deployable,
privileged/simulator or oracle).

`EPISTEMIC_LEVEL_SCHEMA=TO_BE_DEFINED_IN_STAGE3G`. No E0–E5, or equivalent, level scale exists in the repository, and
none is frozen here. Stage 3G must define one before using it.

## Stage 3G entry requirements

The entry requirements are adopted from the Stage 3F.6-CR inherited-requirements candidate.

**Required:**

- `OBSERVABLE_ENTITY_STATE_REQUIRED`
- `ACTOR_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED`
- `ACTION_RELATIVE_SPATIAL_REPRESENTATION_REQUIRED`
- `STRUCTURED_ACTION_SEMANTICS_REQUIRED`
- `PREDICTION_LIFECYCLE_REQUIRED`
- `COUNTERFACTUAL_DISCRIMINATION_EVALUATION_REQUIRED`
- `COUNTERFACTUAL_REGRET_EVALUATION_REQUIRED`
- `DOWNSTREAM_DECISION_VALUE_EVALUATION_REQUIRED`
- `STAGE_WISE_FAILURE_ATTRIBUTION_REQUIRED`
- `EPISTEMIC_PROVENANCE_REQUIRED`

The actor-relative and action-relative requirements are the two named components of the single CR requirement
`ACTOR_AND_ACTION_RELATIVE_SPATIAL_REPRESENTATION`. No requirement is added.

**Planned, not mandatory implementations:**

- `WORLD_MODEL_TRUST_GATE`
- `TASK_STATE_CONTAMINATION_TRACKING`

**Explicitly not required:**

- `LARGE_LEARNED_WORLD_MODEL`
- `JEPA_REQUIRED`
- `GENERATIVE_WORLD_MODEL_REQUIRED`
- `ROUTER_2_0_REQUIRED`
- `EXPERT_10_REQUIRED`
- `AUTHORITY_INCREASE_REQUIRED`

Stage 3G inherits requirements, not implementations.

## Architecture

`EXPERT_COUNT=9`: Prime, Vanguard, Oracle, Nexus, Horizon, Archimedes, Alexandria, Picasso and Forge.

The following are infrastructure, not experts:

- Router/Arbiter
- world models
- Forge World
- evaluation/certification
- memory stores
- the authority system

No Expert #10 is added and Forge is not reclassified.

No machine-readable roster existed before this freeze, so the roster is bound as a governance declaration, labelled as
such. It is consistent with Stage 3F.6-CR, which keeps `EXPERT_10` outside the inheritance. The pre-Stage-3F roadmap
(`docs/TEN_STAGE_ROADMAP.md`) mentions a "Strategist" expert packet. That is recorded as a documented discrepancy; it is
not added to the roster.

## Authority

Authority stays R0:

- `AUTHORITY=R0`
- `CAN_DISPATCH=false`
- `CAN_MUTATE_LIVE_WORLD=false`
- `ONLINE_LEARNING_ENABLED=false`
- `PROMOTED_TO_LIVE_RUNTIME=false`

Stage 3F completion does not imply authority promotion. The authority program is separate.

## Certification

The certifier (`--check` never writes) requires all of the following:

- the canonical lineage;
- the freeze artifact rebuilt byte for byte and committed unchanged;
- every bound hash recomputed, with the hash types unambiguous;
- Stage 3F-RP `--check` reproduced;
- Stage 3F.6-CR `--check` reproduced.

The CR check re-runs W-SYM, the D-SYM freeze and D-SYM under the canonical profile. Each stored certificate records its
predecessor gate, so a byte-exact W-SYM implies that P.1-SYM, P.1A-SYM, T-SYM, P.1E, P.1D and P.1C also reproduced. The
historical Stage 3F.6 certificate is not re-run as though it were reproducible: STAGE3F6-ERRATUM-001 is part of the
frozen record.

On PASS, the certificate sets `STAGE3F_STATUS=FROZEN`, `STAGE3F_COMPLETION=100%` and `READY_FOR_STAGE3G=true`. Stage 3G
is not started.
