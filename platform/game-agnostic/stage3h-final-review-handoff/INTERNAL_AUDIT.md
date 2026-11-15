# Author consistency audit for independent review — no protocol changes

This is a same-author verification of the existing V2 target, not an independent methodological review. No scientific redesign, new analysis implementation, threshold/sample change, reviewer disposition or amendment is made.

## Structurally consistent items

- R=N at H0 and R=B at H2 hold by the frozen selector assignment and fixed abstention fallback. Uniform tied-set metrics preserve the equalities.
- The four primary estimands are logically feasible. At balanced target-cell weights C=A/2 and D=B/2, so local point materiality does not imply full-mixture materiality. The supplied synthetic counterexample and all-four-pass example remain demonstrations, not performance results.
- P40, REGIME40, SAFETY30 and NUISANCE120 counts match the declared contrasts, populations and replications. Exact equality controls are excluded from directional superiority families.
- The proposed 25,536-world schedule sums correctly and retains H0/H2 only. Published power formulas and nominal-power tables reproduce arithmetically. Limited horizon power is disclosed; no uniform 90% power claim is justified.
- Paired cell resampling, common draws, ratio weighting, nearest-rank quantiles and nonzero finite p convention match the supplied pure analysis code. The p-values remain approximate diagnostics, not substituted significance gates.
- The catastrophe upper-bound argument is conditional on independent same-law draws within admitted cells and equal target-cell weights. With zero introductions, probability of no events is bounded by the equal-cell mixture using C*min(n_c); the bound is nonzero. It does not certify universal zero catastrophe risk.
- False-selection harm is nonnegative and separate from signed regret improvement. Safety30's best-of quantity is privileged attribution, not an available action policy.

## Findings to be dispositioned by the actual reviewer

### AUTHOR-01 — stale exit-matrix prose versus V2 claim mapping

In V2 `exit-matrix-v2.json`, the horizon row's inherited `positiveNegativeCriteria` still says “H0 material benefit under subgroup-family correction ... and H2 equality/primary safety”, while `v2ClaimMapping` includes A_H0_SPECIALIST, B_H2_AVOIDANCE and E_EXACT_IDENTITIES. V2's main protocol explicitly puts A and B in P40. The complementarity row likewise retains “both fixed primary contrasts” while its V2 mapping enumerates A/B/C/D.

The main V2 protocol supplies the intended four-claim logic, but the matrix's inherited prose is not a fully consistent standalone adjudicator. This is a confirmed documentation inconsistency, not evidence that the frozen rule or four primary estimands are mathematically impossible. Before activation the reviewer should decide whether an explicit versioned editorial/adjudication amendment is required. No precedence rule or matrix edit is silently invented here.

### AUTHOR-02 — REGIME40 directional versus bidirectional error interpretation

V2 uses alpha=0.05/40 in each tail of each regime contrast, and can label benefit (upper<0) or material harm (lower>0). Each one-sided family can be interpreted at its own 0.05 Bonferroni budget. A central interval using both those tails has per-contrast nominal error 0.0025; scanning both signs over 40 contrasts is not automatically a simultaneous two-sided familywise 0.05 claim (the simple union bound is 0.10).

V2 already disclaims a global simultaneous envelope across all diagnostics, and a harm veto is conservative for positive qualification. Thus this observation does not by itself establish an inflated primary-positive qualification error rate or invalidate P40. The reviewer must resolve precisely which regime signed/coverage claims are intended and whether labels or an explicitly versioned methodological amendment are required. No alpha, family size, confidence construction or outcome is changed by this handoff.

## Known activation limits, not new discoveries or waivers

The runner is a synthetic-only prototype with an execution-denying entry point. Its admission helper does not implement every native/per-band admission gate; native nuisance adapters, hardened custody, full end-to-end registered safety/adjudication and canonical runtime preflight remain unimplemented or unapproved. The existing audit discloses these limits. The 75-file closure passes static dependency/module-load/byte checks and synthetic clone checks; unexercised native/dynamic dependencies and actual performance are not proven by module loading.

The zero-introduction support veto uses declared shared tie coupling when the action sets are identical; it is not a statement about independently sampled tie draws. Its statistical coverage and all proposed harm/accuracy/nuisance thresholds still require independent review. Sparse subgroup/Monte Carlo tail resolution and conditional power assumptions also remain review topics rather than silently accepted properties.

TCA has no qualified canonical trust gate; incumbent Prime has no matched deployable interface. Their proposed bounded NOT_TESTABLE dispositions are human scope decisions. None is waived here, and bounded selector success cannot be relabeled full Stage 3H certification.

Current conclusion: the primary mean estimands and equality controls are source-grounded and synthetically consistent. Scientific acceptance of the complete contract is **PENDING**, including the findings above. No independent review finding, approved correction or amended experiment exists yet.
