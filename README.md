# W0-A' canonical portability report + a correction

Two files. Both **replace** existing ones.

```bash
cd ~/Desktop/sentinel-grid
cp /path/to/w0a-portability/sgrid-lab/tests/. sgrid-lab/tests/ -R

cd sgrid-lab
node tests/w0a-action-legality.test.js        # W0-A' A1-A10 TESTS PASS (118/118)
node tests/w0a-portability-report.js --digest
```

**Expected W0-A' digest (Linux baseline):**

```
880ff1b5770d60cdd96a47d65cb571d99169315244f5a8d7357f5e9be0b8b7fd
```

Node version, platform, arch and endianness are excluded from the digest.

## A correction: the mobility claim was wrong

Three previous deliverables stated *"no reference action mutates s.mobility."*
That is false. `azl-ref-adapter-v2.js` line 128, outside the action switch:

```js
s.mobility = U.clamp(0.9 - Math.max(0, s.threat - s.defense) / 120
                         - (s.constructionQ > 6 ? 0.15 : 0), 0.05, 1);
```

Mobility is recomputed **every tick** from threat, defense and construction queue.
Every one of the twelve actions moves it.

The conclusion happens to survive, for a different reason. Measured over 444
quantum-boundary samples across 20 seeds x 40 quanta:

```
minimum mobility observed      0.6513
mobility-caused 1 -> 0 flips   0
gate threshold                 0.2
```

The raid mechanic pulls threat back toward `defense + 12` fast enough that mobility
never approaches the gate. So bit 10's mobility condition is **live code that never
fires** in reference-colony v2 — not a constant field, as previously claimed.

This is now measured in both the suite (`MOB1`–`MOB3`) and the report, rather than
asserted in a comment. `min_mobility_observed` is carried at full precision in the
digest, which makes it a second cross-platform float witness alongside
`mean_non_boundary_leaf_value`.

The native witness set stays at five. A sixth is not constructible without changing
environment dynamics.

## What the digest binds

**Implementation** — raw SHA-256 of `action-lifecycle-registry.json`,
`azl-ref-adapter-v4.js`, `w0a-action-legality.test.js`, `_preflight.js`,
`check-install.js`.

**Frozen dependencies** — `azl-ref-adapter-v2.js`, `azl-ref-adapter-v3.js`,
`w0s-search-semantics-manifest.json`, the W0-S portability digest, the guardrails-v2
doctrine hash, the Stage 1A witness root, and the 480-file frozen-set digest.

**Semantic witnesses** — registry id and status, action count, full action order,
the `defend` exec-1/cool-1 fixture with legal/execution/cooldown timelines, all five
native mask witnesses with hex and hashes, target-freshness semantics, resource-cost
timing and realization, declared interrupts, the five-rule mask precedence, the
mobility probe, and the test count.

## Non-circularity, verified experimentally

The report never reads `w0a-action-legality-manifest.json`. Confirmed by creating a
manifest and re-running:

```
digest before manifest creation   880ff1b5…
digest after  manifest creation   880ff1b5…   identical
```

## After macOS matches

Create `docs/governance/w0a-action-legality-manifest.json` with
`portability_digest: 880ff1b5…`, `platforms_passed: [linux node v22.22.2,
darwin node v22.22.2]`, and the semantics block. Record the manifest's own SHA-256
externally — it must not contain its own hash.

Also confirm the superseded file is gone:

```bash
test ! -e sgrid-lab/tests/w0a-clone-mask.test.js && echo absent
node sgrid-lab/tests/check-install.js
```
