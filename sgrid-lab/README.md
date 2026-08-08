# Sentinel Grid Intelligence Lab v1 (local, standalone)

Phase 1 runner. Evaluates the SAME Grid Core modules the game ships (no
benchmark fork); every report carries module hashes + frozen weight hashes.

Sentinel -> module mapping (wire identifiers retained per renaming discipline):
Vanguard=azl-scout, Prime=azl-mcts, Horizon=azl-strategist, Oracle=azl-oracle,
Nexus=azl-relational, Arbiter=azl-router.

## Run order
    node lab.js freeze         # Step 1: baseline.json + frozen v1 weights
    node lab.js conformance    # Step 6: adapter conformance suite (platform deliverable)
    node lab.js health-check   # Step 2 proxy (HUMAN ranking on real ZekNova still required)
    node lab.js ladder --configs C0,C1,C2,C3,C4,C5 --seeds 28
    node lab.js sweep --config C2 ; node lab.js sweep --config C3
    node lab.js screen         # action-change first-pass screen
    node lab.js degraded       # ruler validation (must BLOCK a broken model)
    node lab.js inspect        # decision traces
    node lab.js aggregate      # gates + prereg comparison -> results/CAPABILITY_BASELINE_v1.md

## Pending (real environment / Dwayne)
1. ZekNova adapter feasibility (detached-clone tick loop) then binding
2. Human ranking of 50 real states vs health() composite
3. Browser device runs via /azl/bench.html (cold/warm P50-P99)
4. Shadow advising + real-vs-benchmark distribution comparison
5. environment_id schema partitioning before any second environment
