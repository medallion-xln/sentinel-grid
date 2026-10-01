# Stage 3G formal freeze (STAGE3G_FREEZE_V1)

The freeze is the canonical, immutable Stage 3G inheritance boundary for Stage 3H. It only verifies, binds, canonicalizes, freezes and certifies. It runs no experiment, produces no new scientific conclusion, and does not start Stage 3H.

The freeze artifact is `artifacts/stage3g-freeze/stage3g-freeze.json` and its certificate is `stage3g-freeze-certification-result.json`. Both are built by `stage3g-freeze/freeze.mjs` and `stage3g-freeze/certify.mjs`. The code lives outside `src/` and `scripts/` so it cannot disturb the frozen Stage 3G.7 source hash.

## How it binds

- **Canonical inputs.** Every input is read at `CANONICAL_PARENT_COMMIT` (`25a7f80`) through git.
- **Certificates.** For each of the eight Stage 3G certificates, the freeze records:
  - its `certificationHash` (the bound semantic hash) and the sha256 of its raw bytes;
  - the commit that certified it, which must lie on the first-parent lineage of `main`;
  - proof that the file has not changed since certification.
- **Stage 3F freeze.** It is bound by hash and is not modified.
- **Conclusions.** Every frozen conclusion is resolved from its certified source and must equal the requested value. A mismatch aborts the build.
  - **Certificate fields:** most conclusions come from a named certificate field.
  - **Stage document rows:** a few Stage 3G.1/3G.2 conclusions come from rows in that certified stage document, together with the certificate field that binds the schema.
  - **Schema rule:** `PREDICTIONS_CANNOT_BECOME_AUTHORITATIVE_SILENTLY` comes from the certified prediction-lifecycle isolation rule. It is not a named flag in any certificate, and the freeze records that.
- **Scoping.**
  - `DETERMINISTIC_BOUNDED_SEARCH_SUFFICIENT=true` is Stage 3G.4's privileged known-model depth-2 result. Deployable-planning sufficiency stays `false` and the search budget stays `NOT_TESTABLE_ON_FULL_REQUIRED_DOMAIN`; both are bound as scope notes.
  - `LEARNED_TYPED_RELATION_FEATURES_HARMFUL` covers only the certified Stage 3G.8 typed-root-column design.
- **Live schemas.** Live schema modules must hash to their certified values: action semantics, deployable action model, action surface, target-eligibility contract, semantic channel, prediction lifecycle, epistemic schema and observable state.
- **Observation boundary.** The final boundary is Stage 3G.8 V2 plus the derivation of Stage 3G.9 semantic effects. No UNKNOWN field is promoted, and typed relations remain prospective and audit-only.
- **Inherited contracts.** The Decision Evaluation Contract, reproducibility contract, nine-expert roster and R0 authority are inherited from the Stage 3F freeze by section hash. The roster has no Expert #10, and Forge remains an expert.
- **Disclosed amendments.** Historical disclosed amendments are bound by raw hash and are not retrofitted.

## How it is certified

The certifier checks the following:

- the committed freeze rebuilds byte for byte;
- the freeze commit is a direct first-parent child of the parent;
- no frozen Stage 3F/3G path has changed since the parent;
- all nine certificates were reproduced read-only, with the tracked tree unchanged (`stage3g-freeze-reproduction.json`);
- the freeze tests pass;
- every Phase 14 binding holds.

On PASS: `STAGE3G_STATUS=FROZEN`, `STAGE3G_COMPLETION=100%`, `READY_FOR_STAGE3H=true`, with authority at R0 and Stage 3H not started.
