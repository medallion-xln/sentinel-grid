# Stage 3D/3E recovery canonicalization

This directory tree preserves the certified Stage 3D and Stage 3E lineage recovered from Claude's local certification workspace. It is a provenance-preserving repository promotion, not a new architecture stage and not a replacement certification.

The complete recovered workspace is retained read-only at:

`/Users/dwaynecampbell/Desktop/SentinelGrid_Forensic_Stage3D_3E_20260913.tar`

Its SHA-256 digest is `82d672157a45491c4edc214f3a19ed6dca609078b52aa5117dd1a1b9b7e9fa6b`. The archive contains 118 files, 125 tar entries, and 1,927,373,312 bytes. The recovered `3d`, `3e`, and `v2` directories contain 116 files totaling 1,922,531,382 bytes. The recovered source was not deleted or modified.

The Git payload is intentionally bounded:

- `training/stage3d-recovered` and `training/stage3e-recovered` preserve the recovered source and certification scripts byte-for-byte. Their historical absolute paths are evidence and are not rewritten.
- `artifacts/stage3d-hybrid-shadow-qualification` and `artifacts/stage3e-routability-intelligence` preserve frozen evidence and the minimal deterministic replay fixtures.
- V2B identity and result artifacts already present in the Stage 3C-R.3 owners were byte-identical and were not duplicated.
- Raw corpora, generation outputs, prompts, model weights, caches, logs, worker shards, and transient scratch remain in the permanent archive rather than Git.

The machine-readable inventory, per-file hashes, dispositions, and provenance statement are in `artifacts/stage3de-recovery-canonicalization/lineage-record.json`. Run `node scripts/certify-stage3de-recovery-canonicalization.mjs` to verify canonical byte identity, all frozen hashes, split isolation, Stage 3E HOLDOUT/OOD behavior, determinism, fail-closed behavior, Stage 3D replay behavior, and R0 authority.

No recovered frozen artifact was regenerated to fit the repository.
