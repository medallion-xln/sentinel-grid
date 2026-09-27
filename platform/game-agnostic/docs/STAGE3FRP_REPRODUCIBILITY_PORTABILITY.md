# Stage 3F-RP — certification reproducibility portability remediation

Infrastructure only. No expert, policy, Router, feature, threshold, objective, corpus, sealed partition, authority
or scientific conclusion is changed, and no historical certificate is edited. Authority remains **R0**,
non-dispatching, no live-world mutation, no online learning, no runtime promotion.

Certificate: `artifacts/stage3frp-reproducibility-portability/stage3frp-certification-result.json`
(see its `certificationHash`, `status`, `checks`, `requalification` and `conclusions`).

## Question

A fresh Linux x64 clone regenerated every Stage 3F data payload byte for byte, but the certificates that contain
fitted models (3F.6-C, 3F.6-T and everything downstream of the symmetric router) did not reproduce their stored
hashes. Why, does it matter scientifically, and what contract makes certificates byte-reproducible on every host?

## Root cause (demonstrated, not inferred)

`scripts/reproducibility/root-cause-experiments.mjs` refits the stored models under explicitly chosen arithmetic.
Recorded results: `artifacts/stage3frp-reproducibility-portability/root-cause/*.json`.

1. **`Math.exp`.** V8 evaluates it with a C++ port of fdlibm (`base::ieee754::exp`). Node's build does not disable
   floating-point contraction, so clang fuses `a*b + c` in that code into fused multiply-add on arm64 but cannot on
   x86-64. An exact JavaScript port of both variants shows they differ by 1 ULP on ~0.05% of inputs. The separately
   rounded port is bit-identical to Node 20/22/26 `Math.exp` on x86-64; the fused port reproduces the stored
   3F.6-C `coreRouterHash` and the stored T-SYM / D-SYM router hash **bit for bit, every coefficient**; nothing else
   tested does. Natively on x86-64 the coefficients differ by up to 26 ULP (3F.6-C) and 635 ULP (symmetric router).
2. **`**` / `Math.pow`.** From V8 14 (Node ≥ 25) V8 calls the C library's `std::pow` (`use_std_math_pow`, default on);
   V8 12 (Node 22) uses fdlibm `pow`. D-SYM's temperature-scaling grid (`p ** (1/T)`) is reproduced by correctly
   rounded `pow` (and by glibc under Node 26) but not by fdlibm `pow` — so D-SYM depends on the Node **major version**
   even on one machine. Node 22 and Node 26 only appeared to agree because the router assertion fails first.
3. **Certification design.** Stage 3F.6-C onwards let engine-approximated `Math.exp` / `**` results reach digests,
   contrary to the Stage 2G determinism doctrine (`src/experts/expert-contract.js`: "Floats never reach a digest"),
   and no certificate recorded its platform.

4. **Test-runner output.** Historical certifiers parse TAP summaries (`# pass N`) from `node --test` and record the
   counts. Node ≥ 23 defaults to the `spec` reporter even without a TTY, so the same checks record `pass: 0` on
   Node 26 unless `--test-reporter=tap` is set. The canonical runtime environment pins it.

Not causes: summation order, iteration order, key order, candidate order, stopping rules, serialisation and hashing
are fixed-order and exact — standardisation vectors and all corpora reproduce bit for bit on every host.

## Reproducibility contract (`stage3frp-reproducibility-contract.json`)

| Level | Meaning |
| --- | --- |
| A — scientific | same data hashes; identical discrete outputs (selections, routing, thresholds, tiers, rankings, classifications, conclusions); continuous metrics within the output tolerance |
| B — numerical | A, and coefficients within the relative coefficient tolerance, predictions/metrics within the output tolerance |
| C — byte | identical bytes and hashes, computed under `SENTINEL_CANONICAL_NUMERICS_V1` |

Every artifact class — raw evidence, sealed corpora, deterministic policies, trained diagnostic models,
certificates, the final Stage 3F freeze — requires **Level C**. That is the requirement each already had; it is
strengthened from "on the certifying host" to "on every host". A and B are diagnostic comparisons for host-native
runs and never certify.

Tolerances (B only) follow a predeclared rule from measured quantities: the coefficient tolerance is the power of ten
at or below the geometric midpoint of the observed platform noise (max relative coefficient difference, 1.15e-13)
and the smallest decision-relevant perturbation from the sensitivity study (1e-7), i.e. 1e-10: three decades from
each. The output tolerance is the next power of ten above the largest score/probability/metric shift measured at
that perturbation. No tolerance is used to accept any certificate.

### Decision sensitivity (`decision-sensitivity.json`)

Stored coefficients were perturbed by (1 + ε·u), u ~ U[−1, 1], 32 seeded trials per ε from 1e-16 to 1e-3:

- 3F.6-C logistic router: no routing decision, threshold-grid crossing, tier selection or routed count changes up to
  ε = 1e-6; the first AUROC tie-order change is at 1e-7; the first routing-relevant change at 1e-5.
- Symmetric policy router (T-SYM / D-SYM): no probability ranking, argmax, routing, selected policy, accuracy or regret
  change up to ε = 1e-5; the first changes at 1e-4 (analytic margins: top-1 − top-2 ≥ 9.7e-5, |confidence − τ| ≥ 2.4e-6).
- Observed platform divergence: ≤ 1.15e-13 relative — about 10⁶ below the first decision change.

## Remediation (option C: deterministic numerics; A, B, D evaluated and not adopted)

- `src/core/canonical-numerics-v1.js` — `SENTINEL_CANONICAL_NUMERICS_V1`: fused fdlibm `exp` (the arithmetic of
  record), fdlibm `log` and `log2`, correctly rounded `pow`; implemented only with exactly specified operations
  (`+ − × ÷ √`, bit operations, BigInt); pinned by 40 golden bit patterns.
- `scripts/reproducibility/canonical-runtime.mjs` — preload through `NODE_OPTIONS` (inherited by every predecessor
  check and test process): installs the profile, rewrites the single pinned `**` site in memory
  (`src/stage3f/decision-rule-v1.js`; its bytes are unchanged), fails closed on any other non-exact `**`, and with
  `SENTINEL_READONLY=1` refuses every change to a tracked file.
- `scripts/reproducibility/verify-stage3f.mjs` — the one canonical procedure (below).

Why not the others: platform pinning is not portable and is insufficient (Node major changes `pow` on one machine);
rounding before hashing cannot guarantee equal hashes at grid boundaries and would need edits to sealed certifiers;
dual hashing cannot be added to sealed certificates and is redundant once raw = canonical.

## Record profile for one historical stage

The historical record is not arithmetically uniform. Stage 3F.6-D was certified while its host still ran V8 ≤ 13, so
its temperature grid used fdlibm `pow`; Stage 3F.6-D-SYM was certified after the host moved to V8 14 (`std::pow`,
reproduced by correct rounding). No single `pow` reproduces both. The canonical profile (correctly rounded `pow`) is
the certification profile for every stage and for all future work; `stage3f-chain.mjs` declares one **record
profile** (`3F6D`: `pow = FDLIBM_FUSED`, fused `exp` as everywhere) used only to verify that sealed certificate byte
for byte. Under the pure canonical profile 3F.6-D differs in exactly one leaf — one temperature-grid cross-entropy,
1 ULP — with every decision identical (`CANONICALLY_EQUIVALENT`); `verify-stage3f.mjs --pure-canonical` shows it.

## Check-mode audit

Six historical certifiers rewrite a tracked freeze or plan file during `--check` (3F.6-A, -C, -D, -T freezes;
3F.6-P, -W plans); when the recomputation differed (any x86-64 host) the rewrite mutated the file — observed
directly in this remediation. Their bytes are sealed (their certificates hash their own source), so they are not
edited. Instead every verification runs under the read-only guard: an identical rewrite is skipped, a differing one
is blocked and reported, and each run ends by asserting `git status` is unchanged. The per-certifier result is in
the certificate's `checkModeAudit`. The new certifier writes nothing in `--check`.

## Historical artifact policy

No historical file is modified. `erratum-stage3f-portability.json` (additive, `STAGE3F-ERRATUM-002-PORTABILITY`)
records, per affected certificate: original hash, that the original platform was never recorded (arm64 fused `exp`
and V8 ≥ 14 `pow` are inferred from the reproduction, not recorded), the canonical-profile result, the host-native
result, and that historical byte reproducibility was platform-bound.

## Fresh-clone procedure

From a clean clone, with Node.js ≥ 20 and git (no network, no hidden local state):

```bash
cd platform/game-agnostic
node scripts/reproducibility/verify-stage3f.mjs --rebuild-evidence   # every gitignored payload, hash-verified
node scripts/reproducibility/verify-stage3f.mjs --check              # every Stage 3F certifier, read-only
node scripts/certify-stage3frp-reproducibility-portability.mjs --check
npm run test:stage3frp
```

`--rebuild-evidence` takes on the order of an hour of CPU; `--jobs=N` parallelises independent payloads.
Diagnostics: `--native` runs each check under host `Math` (its predecessors stay canonical) and `--capture` records
payloads for `scripts/reproducibility/certificate-diff.mjs`.

Stage 3F.5 and Stage 3F.6 (prediction reliability) remain `NOT_REPRODUCED` exactly as documented before this stage
(3F.6-R erratum and `STAGE3F6-ERRATUM-001`); this stage does not change that.

## Results

`stage3frp-certification-result.json` records every stage under each run. Summary:

- Canonical profile: all 25 reproducible Stage 3F checks BYTE_EXACT on Node 22 (a fresh GitHub clone that
  regenerated all 20 payloads from nothing) and Node 26; 3F.6-D byte-exact under its record profile; 3F.5 and 3F.6
  unchanged from their pre-existing errata.
- Host-native x86-64 numerics (diagnostic): 3F.6-C, -T, -W, T-SYM, P.1A-SYM, P.1-SYM, W-SYM CANONICALLY_EQUIVALENT
  (coefficients ≤ 1.15e-13 relative, metrics ≤ 2e-16; no data, decision, classification or conclusion changes — the
  SYM certificates differ only in their own open-phase byte-identity gate and the status it alone decides);
  3F.6-D, -P, P.1E byte-exact. D-SYM cannot run under host-native numerics: its code refuses to proceed unless the
  refitted router is byte-identical to T-SYM's stored router, so it is reported NOT_ASSESSABLE rather than passed.

## Limits

Only linux-x64 hosts were available (Node 20, 22, 26). The arm64 arithmetic of record is reproduced by exact
emulation and verified against every stored hash; no arm64 or macOS host was run.
