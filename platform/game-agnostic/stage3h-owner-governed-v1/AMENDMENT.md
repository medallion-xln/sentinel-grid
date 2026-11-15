# STAGE3H_OWNER_GOVERNED_QUALIFICATION_V1 (proposed, pending owner approval)

Every result produced under this amendment carries `REVIEW_MODE=OWNER_GOVERNED`, `INDEPENDENT_METHOD_REVIEW=false` and `EXTERNAL_INDEPENDENT_CUSTODY=false`. The human project owner is the sole scientific authority. The externally reviewed V3 contract (commit 320a07da, amendment 525a0047) is preserved unchanged as a separate inactive standard. Owner-governed evidence does not satisfy its independent-review requirement.

## What is unchanged

The frozen rule (H0 to Nexus-else-S0, H2 to S0), the R/B/N arms, the exact H0 and H2 equality controls and the V3 estimands are all unchanged. So are the family sizes (P40, REGIME40, SAFETY30, NUISANCE120), materiality, resamples, tails, the strict-TOST proposal, the catastrophe rules, the 25,536-world population design, the population, band and effective-N admission floors, and the compute and analysis ceilings.

## What native execution required (found by development-only native replay)

1. **O-1, native analysis.** V3's analysis refuses non-synthetic rows. `analysis-native.mjs` is a verbatim copy with a native-provenance validator and an owner-governed label. It is numerically identical to V3.
2. **O-2, identity nuisance.** D4 and order twins keep native truth exactly. Entity renaming does not. It changed native utilities in 88 of 288 development worlds and the offered retreat destination in 66. The identity nuisance is therefore measured with the original truth held fixed. Retreat maps to the twin's unique retreat. The result equals V3 wherever truth is identity-invariant.
3. **O-3, cell admission floor (owner choice required).** Using rejection metadata only, V3's per-cell floor fails in an OOD_SHAPES cell with probability about 0.41 per replication. A failure makes the whole campaign unmeasured. The choices are to keep V3, with about a 70% risk of an unmeasured campaign, or to require at least 2 accepted worlds per cell, with a risk below 0.1%.
4. **O-4, disposition.** The owner-governed disposition can be positive, negative-harm, negative-no-material-value or inconclusive. It can never be canonical certification.

## Custody

The same person designs and executes. The runner prints only counts and hashes, writes outputs once as read-only, and refuses analysis until both replications are locked. Blinding is procedural only.
