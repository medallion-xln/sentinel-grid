# Stage 2M — portability, environment independence and qualification readiness

Status: **PASS** · Outcome: **D_PORTABILITY_REPAIRED_ZEKNOVA_UNAVAILABLE** · Authority: R0 (advisory only)

## What this stage changed, and what it deliberately did not

It changed how the repository **finds** its runtime. It changed nothing about how
the repository **reasons**. Every frozen owner — both experts, Prime, the
authority core, and every Stage 2L lab module — is byte-identical, and the
certify script exits 2 rather than proceed if any of them moves.

## The defect

31 entry points would not run on a machine other than the one they were
written on, in two shapes.

**28 workspace entry points** resolved the runtime as
`process.env.ZEKNOVA_ROOT || '/Users/<developer>/Desktop/zeknova-shared-gaming-experience'`.
On the machine where that path exists, everything worked. Anywhere else the
fallback silently produced a path that did not exist, and the failure surfaced as
an anonymous `ENOENT` several layers away from its cause. A missing dependency was
being reported as a broken file read.

**Three repository entry points** carried the same assumption in a form no
literal-path search finds: two mainline shell scripts hardcoded absolute paths
for *both* repositories, and `integration/status.mjs` defaulted both roots to
`os.homedir()/Desktop/...`. That last one is the more dangerous shape, because it
reads as a default rather than as a machine assumption — it is why the certify
script now scans for `homedir()` as well as for the literal path.

Survivors on execution paths after this stage: **0**.
Recorded install markers, prose and stale scratch are excluded by declared
classification, not by oversight; each exclusion is listed in the dependency
inventory with a reason.

## The contract

`ZEKNOVA_ROOT` (ZEKNOVA_ROOT_CONTRACT_V1) — one variable, no default,
no search, 4 structural markers, 5 named statuses.

Portability here does **not** mean accepting whatever runtime happens to be
lying around. The resolver never walks the filesystem, never reads a home
directory and never falls back. The certify script scans the resolver source for
all three and refuses to certify if it finds them, because a resolver that
searched would pass every behavioural test while reintroducing the defect.

### Adversarial roots

| case | declared | status | outcome |
| --- | --- | --- | --- |
| `ROOT_ABSENT` | _unset_ | `UNBOUND` | refused |
| `ROOT_EMPTY_STRING` | `   ` | `UNBOUND` | refused |
| `ROOT_NONEXISTENT` | `<TMP>/no-such-dir` | `INVALID_NOT_A_DIRECTORY` | refused |
| `ROOT_EMPTY_DIRECTORY` | `<TMP>/empty` | `INVALID_MISSING_MARKERS` | refused |
| `ROOT_WRONG_REPOSITORY` | `<TMP>/wrong-repository` | `INVALID_MISSING_MARKERS` | refused |
| `ROOT_IS_A_FILE` | `<TMP>/a-file` | `INVALID_NOT_A_DIRECTORY` | refused |
| `ROOT_VALID_WITH_SPACE` | `<TMP>/zeknova valid` | `BOUND` | bound |
| `ROOT_VALID_TRAILING_WHITESPACE` | `  <TMP>/zeknova valid  ` | `BOUND` | bound |

All 8 behaved as specified. Six refused, two bound. The
decoy — the right directory shape with one marker missing — never binds, and no
case reaches a raw `ENOENT`.

## Path independence

Two byte-identical trees at unrelated roots, one nested three deep with a space
in its name, produce **one** identity:

- `8d9a2f02d444cbd77cc59a98e8e8d006ebeaeadbed5ca2c9ace64f1414ff7321` (root A)
- `8d9a2f02d444cbd77cc59a98e8e8d006ebeaeadbed5ca2c9ace64f1414ff7321` (root B, nested, contains a space)
- `86436d12a5a1aa56d61d59e2f1082478ca098f1cf5e5577c380a62ee227f015d` (root C, one byte changed)

Both halves are load-bearing and neither is sufficient alone. A constant would
pass the first test; a path-dependent digest would pass the second. Only a
content-addressed identity passes both.

## What was NOT measured

No ZekNova runtime is reachable from this environment. Three phases therefore
report `NOT_MEASURED`, not `PASS`:

| phase | result | why |
| --- | --- | --- |
| current lineage | `UNKNOWN` (NOT_MEASURED_ZEKNOVA_ROOT_UNBOUND) | ZEKNOVA_ROOT is not set. ZekNova-dependent certification cannot run without an explicit binding; it is never inferred. |
| observation contract | `NOT_MEASURED` | ZEKNOVA_ROOT is not set. ZekNova-dependent certification cannot run without an explicit binding; it is never inferred. |
| full suite with a valid root | `NOT_MEASURED` | a fixture root is not a runtime |

The machinery for all three is built and exercised against fixtures; it is the
runtime that is absent, not the capability. A lineage classification produced
without reading the runtime would be a guess wearing a certification label.

## Readiness

| gate | result |
| --- | --- |
| `PORTABILITY_CERTIFIED` | ✅ pass |
| `FULL_SUITE_GREEN` | ✅ pass |
| `ZEKNOVA_ROOT_EXPLICIT` | ✅ pass |
| `CURRENT_LINEAGE_IDENTIFIED` | ⛔ blocked |
| `OBSERVATION_CONTRACT_COMPATIBLE` | ⛔ blocked |
| `REPLAY_READY` | ✅ pass |
| `EVIDENCE_PROVENANCE_READY` | ✅ pass |
| `AUTHORITY_R0_CONFIRMED` | ✅ pass |

`CURRENT_LINEAGE_LIVE_QUALIFICATION_READY=false`.
Live qualification was **not** begun.

## Portability claim

**MULTI_ROOT_SAME_PLATFORM_CERTIFIED** — and specifically not `MULTI_PLATFORM_CERTIFIED`.

Measured on linux/x64 v22.22.2
across multiple invocation directories and multiple runtime roots. No second
operating system was available to this run, so the inherited
`DIGEST_PRODUCED_SINGLE_PLATFORM` limitation is carried forward unchanged.
Environment independence and platform diversity are different claims, and this
stage earned only the first.

## Shadow dry run

Adapter `reference-grid-rescue-adapter`, observer `controller`, 3 legal actions,
recommendation `61319734ca4f8861…`, replay reproduced: true.

Dispatches 0, world mutations 0, authority tokens 0.
The dispatch path was actually invoked and refused with `AuthorityError` — a
zero that was never attempted would prove nothing about what happens when it is.

## The delivered lean bundle

`sentinel-grid-2l19-production-lean-91ec243.zip` is pinned to `91ec243`, **4 commits behind** the head it was audited against,
and **carries the defect this stage removed** in 33 files. Unpacked on any machine but the
build machine it fails in exactly the way this stage exists to stop.

It is left byte-identical. Overwriting the artifact an earlier delivery refers
to would destroy the object being certified; a portable bundle is a **new** file
under a new name. "Lean" describes packaging, not authority — the bundled system
is R0 advisory-only and shipping it promotes nothing.

## Stage 2L closure

Stage 2L is **CLOSED** at 2L.23 (`1d9981817d31381e…`):
12 passing stages, 2 failing, 4 owned limitations carried forward.
No historical certification was restated, reinterpreted or modified.

Certification hash: `9a44f6bc6803b2d32ff53203d9eb8fd56ff4a77809e7d7d7a1bfc72ca09af463`

