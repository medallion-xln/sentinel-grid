# GUARDRAILS v2 — Sentinel Grid Evidence Doctrine

Status: FROZEN on issue. Referenced, never edited.
Doctrine identity: `guardrails`, version `2`.
Supersedes: `guardrails-v1` (retained unchanged; see Section 3).

This document is the authoritative doctrine text. Its own SHA-256 is computed over
the raw bytes of this file and is recorded **outside** this file, in
`docs/governance/guardrails-v2-manifest.json`. The hash is deliberately absent from
this document: a document containing its own hash cannot be hashed.

---

## 1. Doctrine identity and effective-date enforcement

### 1.1 Identity block

Every artifact that claims certifiability under this doctrine MUST carry a doctrine
identity block:

```json
{
  "doctrine_id": "guardrails",
  "doctrine_version": 2,
  "doctrine_hash": "<sha256 of GUARDRAILS-v2.md raw bytes, lowercase hex>",
  "manifest_schema_version": 2
}
```

### 1.2 Effective timestamp

The effective commit timestamp of this doctrine is:

    GUARDRAILS_V2_EFFECTIVE_AT = 2026-07-23T00:00:00.000Z

### 1.3 Enforcement rule

For any manifest M with generation timestamp `T`:

- If `T >= GUARDRAILS_V2_EFFECTIVE_AT`, M MUST contain a complete and correct
  identity block per 1.1. A missing field, a `doctrine_hash` that does not equal the
  measured SHA-256 of `GUARDRAILS-v2.md`, a `doctrine_version` other than `2`, or a
  `manifest_schema_version` other than `2`, renders the run **non-certifiable**.
- If `T < GUARDRAILS_V2_EFFECTIVE_AT`, M is evaluated under Section 3
  (grandfathering). It is certifiable only if it is explicitly listed in a
  grandfathering attestation.

"Non-certifiable" means the run MUST NOT be used as a promotion gate, MUST NOT be
cited as certification evidence, and MUST NOT be entered into a locked challenge set.
It may still be retained and labelled as diagnostic.

### 1.4 No implicit inheritance

A doctrine hash is never inferred, defaulted, or copied forward from a sibling
artifact. Each manifest carries its own measured value or is non-certifiable.

---

## 2. Canonical serialization

### 2.1 Future artifacts

Every certification generated on or after `GUARDRAILS_V2_EFFECTIVE_AT` MUST emit a
standalone `manifest.json`. Its canonical hash is the SHA-256 of the canonical JSON
serialization defined in 2.2. A canonical hash MUST NOT be derived from Markdown,
from a manifest embedded inside a larger results document, or from an unspecified
serializer.

### 2.2 Canonical JSON procedure (`canonical-json-v1`)

1. Object keys are sorted by bytewise ascending order of their UTF-8 encoding.
2. No insignificant whitespace: no spaces, no newlines, no indentation.
3. Arrays retain their given order.
4. Numbers MUST be finite. `NaN`, `Infinity` and `-Infinity` are rejected.
5. Integer-valued numbers serialize without a decimal point or exponent.
6. `undefined` values and function values are rejected, not skipped.
7. Strings are serialized as JSON with `"` and `\` escaped and control characters
   below `U+0020` escaped in lowercase `\u00XX` form.
8. The result is encoded UTF-8 before hashing.

Implementation: `sgrid-lab/governance/canonical-json.js`.

---

## 3. Stage 1A v1 grandfathering

### 3.1 Preservation rule

The frozen Stage 1A v1 certification artifacts predate the doctrine-hash
requirement. They remain valid under their original certification lineage despite
lacking a doctrine identity block.

**No byte of a grandfathered manifest or witness file may be changed.** Amending a
historical artifact to add a doctrine hash is prohibited and voids its grandfathered
status.

### 3.2 Identification

A grandfathered artifact is identified by, and only by, an attestation recording:

- `historical_manifest_source` — repository path of the canonical historical file
- `historical_manifest_file_sha256` — SHA-256 over that file's raw bytes
- `witness_root_algorithm`, `witness_count`, `witness_root_hash` (Section 4)
- `original_generated_at` — the artifact's own recorded generation timestamp
- `original_evidence_modified` — MUST be `false`

Only artifacts named in an attestation are grandfathered. An artifact predating the
effective timestamp but absent from every attestation is **non-certifiable**. There
is no implicit grandfathering by date alone.

### 3.3 Canonical historical manifest source

For Stage 1A v1, the canonical historical file is the raw bytes of:

    sgrid-lab/results-v2.1/scenario-certification/certification.json

The manifest copy embedded in `SCENARIO_CERTIFICATION.md` is a rendering, not a
source, and MUST NOT be used to compute the historical hash.

### 3.4 Regeneration

Any regenerated, modified, or revised Stage 1A artifact is a new artifact. It MUST
use `manifest_schema_version` 2, MUST carry the guardrails-v2 doctrine hash, and MUST
NOT reuse the grandfathered identity. The historical set remains in place unchanged
alongside it.

---

## 4. Witness-root construction (`sha256-path-null-hash-lf-v1`)

The witness root fixes an entire witness set with a single hash.

1. Select every file matching the declared witness glob, default `witnesses/**/*.json`,
   relative to the declared `witness_path_base`.
2. Normalize each relative path to UTF-8, POSIX separators (`/`), no leading `./`.
3. Sort the paths by bytewise ascending order of their UTF-8 encoding.
4. For each file in that order, compute SHA-256 over the file's raw bytes and render
   it as lowercase hex.
5. Emit one record per file, with no separator between records:

       <relative-path-utf8> 0x00 <lowercase-sha256-hex> 0x0A

6. Concatenate the records into a single byte stream.
7. The witness root is the SHA-256 of that stream, lowercase hex.

An attestation SHOULD also record `record_stream_bytes`, `first_witness_path` and
`last_witness_path` as redundant cross-checks. A mismatch in any of them is a
verification failure even when the root itself matches.

Implementation: `sgrid-lab/governance/witness-root.js`.

---

## 5. Evidence partitions

### 5.1 The three partitions

Every scenario, seed bank, replay set, and state bank belongs to exactly one
partition:

| Partition | Purpose | May be inspected during design? | May gate promotion? |
|---|---|---|---|
| `development` | feature, term and weight design | yes | **no** |
| `certification` | promotion gates after freeze | no | yes |
| `locked-challenge` | held-out regression evidence | no | yes, no-regression only |

### 5.2 Disjointness

The three partitions MUST be pairwise disjoint at the level of individual evidence
identifiers — scenario instance IDs and seeds, not scenario class names.

**Nested seed banks do not satisfy this rule.** A development bank formed as a prefix
or subset of a certification bank contaminates the certification bank by
construction, because every development seed is also a certification seed. Each
partition requires its own disjoint base offset.

This supersedes the `nested smoke ⊂ dev ⊂ cert` seed-bank scheme recorded in the
Stage 1A v1 manifest. That scheme remains valid for the grandfathered Stage 1A v1
artifacts, which used tiering only to shorten runs and did not use the development
tier to select any evaluator parameter. It MUST NOT be used for any partition that
informs leaf or search design under this doctrine.

### 5.3 Locked challenge

The locked challenge set is never used for tuning, threshold selection, or threshold
revision. Reuse of a locked bank in a new context requires exact semantic parity with
its original use, declared and verified.

---

## 6. Leaf and search revision

### 6.1 Versioned identity

Every leaf evaluator and every search-semantics configuration carries a unique
version string and a hash over its definition. A change to any of the following
creates a **new** version and hash:

- terms or term set
- weights
- normalization or clamping
- terminal values or terminal predicates
- horizon
- control quantum
- backup semantics
- discounting

### 6.2 Content-hash binding

A changed definition with an unchanged version string is a doctrine violation. A
verifier MUST recompute the definition hash and reject any registry entry whose
recorded hash does not match its recorded content.

### 6.3 Freeze ordering

A leaf MUST be frozen and hashed **before** any certification or locked-challenge run
that uses it. A leaf MUST NOT be revised after its certification results have been
viewed. Development-partition evidence is the only evidence admissible for selecting
terms, normalization, or weights.

### 6.4 Evidence retirement

Any scenario, replay set, or state bank inspected to motivate a leaf or search
revision becomes **ineligible** for promotion testing of that revised leaf, and is
marked `exposed` in the evidence registry. A verifier MUST reject a promotion run
whose evidence set intersects the exposed set for that leaf version.

### 6.5 Successor requirements

A successor leaf (`leaf-vN+1`) requires a new development set, a new hash, a fresh
certification run, and a recorded comparison against its predecessor. Evidence
exposed during the predecessor's development MUST NOT be reintroduced as hidden
evidence.

---

## 7. Invariants carried forward from guardrails-v1

These rules are restated, not weakened:

- The benchmark score never becomes the leaf evaluator.
- Scenario labels never leak into runtime behavior.
- Penalty bounds derive from Lab-only tables; production uses observable state or a
  conservative global bound.
- Frozen evidence is never mutated. Tooling that writes into a frozen results
  directory as a side effect of a read-shaped command is a defect and MUST be
  repaired or run against a scratch copy.
- One documented threshold revision maximum per instrument, then freeze.
- Degenerate controls (RND / STAB / SPAM-k) remain in every ladder permanently.
- Claims are labelled `[M]easured`, `[D]esign`, `[U]nknown`, or `[C]onceded`.

---

## 8. Verification

Conformance with this doctrine is machine-checked by
`sgrid-lab/governance/verify-governance.js`. The verifier MUST implement, at minimum:

- doctrine hash presence, match, and version match (Section 1)
- effective-date routing between enforcement and grandfathering (Section 1.3)
- attestation-listed grandfathering only (Section 3.2)
- historical manifest hash recomputation from raw bytes (Section 3.3)
- witness-root recomputation (Section 4)
- pairwise partition disjointness (Section 5.2)
- leaf definition content-hash binding (Section 6.2)
- exposed-evidence intersection rejection (Section 6.4)

A verifier that cannot recompute a value MUST report failure rather than accept a
recorded value on trust.
