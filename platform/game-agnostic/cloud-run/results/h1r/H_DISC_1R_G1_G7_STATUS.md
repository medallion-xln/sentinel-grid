# H-DISC-1R — G1–G7 status (Phase 2)

**STATUS: NOT_RECOMPUTED ON THE MAC.** The Mac was not reachable from this session. No gate was rerun for this document.

The directive says not to assume a gate still passes because it passed earlier. Each row below gives the last value recorded on each side, not a current result.

| Gate | Last Mac record (`7b8c2edd`, `HDISC1_G4_G7_RECHECK.json`) | Cloud key-less run (`7512aab2`, Linux x64, Node v26.7.0) | Current |
|---|---|---|---|
| G1 custody | PASS | FAIL: list unreadable, no identities, guard not intact | UNKNOWN |
| G2 exclusions | PASS | PASS | UNKNOWN |
| G3 environment | FAIL: no issued manifest, not bound, not verified, owner issuance missing | FAIL: the same, plus RUNTIME_DIFFERS_FROM_PIN | UNKNOWN |
| G4 recovery | FAIL: no committed, valid acceptance record bound to the issued bundle | FAIL: same | UNKNOWN |
| G5 protocol | PASS | FAIL: 12 protected dependencies unresolved | UNKNOWN |
| G6 source | FAIL: 29 protected files not bundle-verified; issuance missing | FAIL: 12 unresolved | UNKNOWN |
| G7 inference | PASS | PASS | UNKNOWN |

## Differences that depend on the operating system, and are expected

- **G3:** the runtime is pinned to `darwin-arm64`, so G3 always fails on Linux, whatever else is in place.
- **hdisc1 tests:** 83 of 87 on Linux against 84 of 87 on macOS. `custody/machine-identity.test.mjs:73` is declared `skip: process.platform !== 'darwin'`.
- **G1 without custody files:** the gate always reports all three reasons (`custodyFacts` sets identities to 0 and `guardManifestIntact` to false). The Mac's own key-less clean clone recorded the same three.

## Commands for the Mac

Use the pinned `/opt/homebrew/bin/node` v26.7.0 and run from `stage3h-hdisc1-discriminator-v1`:

```sh
/opt/homebrew/bin/node readiness/campaign-entry-gate.mjs --probe
/opt/homebrew/bin/node readiness/preregistration-freeze.mjs
/opt/homebrew/bin/node readiness/evidence-bundle-manifest.mjs verify
/opt/homebrew/bin/node custody/machine-identity.mjs self
/opt/homebrew/bin/node audit/inference-graph-audit.mjs committed
/opt/homebrew/bin/node --test campaign/*.test.mjs readiness/entry-gate.test.mjs discriminator/*.test.mjs protocol/*.test.mjs audit/*.test.mjs custody/*.test.mjs
```

**Expected if nothing has regressed:** 4 of 7 (G1, G2, G5, G7 PASS); freeze `ok: true`; draft bundle `HDISC1_BUNDLE_DRAFT_VERIFY_PASS`; machine identity `established: true`. If any of G1, G2, G5 or G7 fails, stop the work that depends on it and record the cause.
