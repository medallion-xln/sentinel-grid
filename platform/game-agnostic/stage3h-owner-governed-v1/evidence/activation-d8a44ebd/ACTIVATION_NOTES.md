# Activation notes for registration 7c41ba89 (candidate d8a44ebd)

1. Field label (my naming error; the registration is not edited). In
   `namespaceAllocation.collisionAudit.activationRecheck`, `repositoryTextHitsInAllocatedRanges: 11` is the number of
   12-digit repository-text hits in the whole re-scanned span [733000000000, 734000012768), excluding the allocation
   record itself. None of them lies inside either allocated range: the recheck `failures` list is empty and
   `ok` is true. A post-activation scan finds, inside [733000000000, 733000012768) and [734000000000, 734000012768),
   only the base values written by NAMESPACE_ALLOCATION_V4.json and ACTIVE_REGISTRATION_V4.json themselves.
2. Activation output was written to a temporary file and copied here afterwards, so that no file appeared in the lane
   before activate-v4.mjs checked that the lane was committed and clean.
3. Prospective exclusion reporting (owner condition in decision O-6): the bound runner writes per-cell accepted and
   rejected counts but not the rejection reason. The registration declares, before any execution, how the by-reason
   breakdown will be obtained (`prospectiveExclusionReporting`): an outcome-blind deterministic recount over the
   registered schedule whose per-cell totals must equal the locked counts.
