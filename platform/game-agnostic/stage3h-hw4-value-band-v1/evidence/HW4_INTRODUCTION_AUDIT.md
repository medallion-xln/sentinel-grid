# H-W4 catastrophe-introduction class audit (DEV validation, read-only)

Source: frozen one-pass validation `HW4_VALIDATION_RESULTS.json` (sha256 f24878df4c444635…,
600 classes, 39732 member worlds, 97 origin families, result `H_W4_V2_NO_MEANINGFUL_POLICY_ADVANTAGE`).
Chosen actions replayed from the frozen decision records; orbits rebuilt from the stored public projections; outcomes
scored with the FROZEN evaluator (`hw1-eval.mjs`). Recomputed failure sets match the sealed lists exactly
(CLASS_LEVEL_SOURCE_PARITY = true). No validation was re-executed; no policy was modified.
Research-only identities (alias ↔ worldHash/seed) live in gitignored `work/val/introduction-class-alias-map.json`.

Failure definition (frozen): potentialIntroduction(chosen orbit, comparator orbit, truth) — identical sets never
introduce; otherwise the chosen orbit holds a catastrophic action (regret ≥ 100 vs member best) while the comparator
orbit holds a non-catastrophic one, in ≥1 member world of the class. Class nreg = equal-weight member mean.

## Table A — all 32 S0 introduction classes

| alias | class | origin family | horizon | chosen action | action id | orbit | intro members (S0) | base/twin | nreg chosen | nreg S0 | equals S0 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HW4-VAL-054 | VALIDATION:960:9844 | bridge/defended/restore_and_conserve | H2 | RESTORE | 842a4a7515e7… | 1 | 27/27 | base | 0.896 | 0.490 | no |
| HW4-VAL-091 | VALIDATION:989:2231 | bridge/defended/reach_target | H2 | RETREAT | 8b0d45070fe9… | 1 | 5/30 | twin-only | 0.553 | 0.353 | no |
| HW4-VAL-092 | VALIDATION:989:2409 | bridge/defended/restore_and_protect | H2 | RESTORE | 8cc2ff206ce3… | 1 | 1/18 | twin-only | 0.713 | 0.418 | no |
| HW4-VAL-111 | VALIDATION:989:5804 | chain/industrial/restore_and_protect | H2 | REPAIR | 6c2378270490… | 1 | 6/88 | twin-only | 0.847 | 0.724 | no |
| HW4-VAL-125 | VALIDATION:989:6307 | star/populated/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 42/63 | base | 0.555 | 0.354 | no |
| HW4-VAL-136 | VALIDATION:989:7958 | chain/defended/restore_infrastructure | H2 | RETREAT | 78ccaf941d4d… | 1 | 71/71 | base | 1.000 | 0.249 | no |
| HW4-VAL-158 | VALIDATION:989:10898 | multi_cycle/defended/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 33/71 | base | 0.883 | 0.362 | no |
| HW4-VAL-171 | VALIDATION:989:12529 | contested_bottleneck/defended/restore_and_protect | H2 | RESTORE | 8cc2ff206ce3… | 1 | 20/20 | base | 0.850 | 0.427 | no |
| HW4-VAL-174 | VALIDATION:990:521 | chain/defended/reach_target | H2 | RETREAT | 872558d0a078… | 1 | 1/30 | twin-only | 0.579 | 0.324 | no |
| HW4-VAL-175 | VALIDATION:990:558 | chain/defended/reach_target | H2 | RETREAT | f87b24a72360… | 1 | 47/66 | base | 0.868 | 0.350 | no |
| HW4-VAL-179 | VALIDATION:990:1226 | star/bare/restore_and_protect | H2 | REPAIR | 6c2378270490… | 1 | 7/84 | twin-only | 0.745 | 0.852 | no |
| HW4-VAL-183 | VALIDATION:990:2214 | bridge/defended/reach_target | H2 | RETREAT | da751cf86558… | 1 | 56/69 | base | 1.000 | 0.374 | no |
| HW4-VAL-208 | VALIDATION:990:7031 | bridge/scarce/restore_and_protect | H2 | BYPASS | d395e5245f6b… | 1 | 4/33 | twin-only | 0.079 | 0.545 | no |
| HW4-VAL-214 | VALIDATION:990:7248 | bridge/populated/restore_and_protect | H2 | BYPASS | 1ef8f6751a00… | 1 | 3/27 | twin-only | 0.095 | 0.796 | no |
| HW4-VAL-215 | VALIDATION:990:7251 | bridge/populated/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 70/70 | base | 0.618 | 0.227 | no |
| HW4-VAL-285 | VALIDATION:991:6411 | star/populated/restore_and_protect | H2 | BYPASS | 614c143e61ea… | 1 | 9/62 | twin-only | 0.839 | 0.461 | no |
| HW4-VAL-288 | VALIDATION:991:6842 | bridge/redundant/restore_and_protect | H2 | RESTORE | 52df2f1dcfac… | 1 | 52/92 | base | 0.459 | 0.369 | no |
| HW4-VAL-303 | VALIDATION:991:9049 | star/defended/supply_and_defend | H2 | REPAIR | f4a2a484a2d8… | 1 | 22/72 | twin-only | 0.875 | 0.724 | no |
| HW4-VAL-313 | VALIDATION:991:10630 | ring/bare/restore_and_protect | H2 | REPAIR | 1d7695733154… | 1 | 2/84 | twin-only | 0.318 | 0.335 | no |
| HW4-VAL-347 | VALIDATION:992:5469 | chain/populated/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 3/65 | twin-only | 0.716 | 0.781 | no |
| HW4-VAL-361 | VALIDATION:992:7963 | chain/defended/restore_infrastructure | H2 | RESTORE | 8cc2ff206ce3… | 1 | 66/66 | base | 0.796 | 0.516 | no |
| HW4-VAL-362 | VALIDATION:992:7964 | chain/defended/restore_infrastructure | H2 | MOVE | ba6697ebb6fa… | 1 | 2/22 | twin-only | 0.376 | 0.376 | no |
| HW4-VAL-369 | VALIDATION:992:8340 | chain/defended/multi_target_delivery | H2 | RESTORE | ddb44150ecd8… | 1 | 83/83 | base | 0.909 | 0.295 | no |
| HW4-VAL-376 | VALIDATION:992:8993 | star/defended/restore_and_conserve | H2 | RETREAT | a2b9cc5ff370… | 1 | 5/44 | twin-only | 0.099 | 0.248 | no |
| HW4-VAL-379 | VALIDATION:992:9258 | bridge/bare/restore_infrastructure | H2 | REPAIR | af8d117860ef… | 1 | 4/67 | twin-only | 0.824 | 0.840 | no |
| HW4-VAL-411 | VALIDATION:993:3284 | chain/defended/restore_and_protect | H2 | RETREAT | b9de2ec4a74f… | 1 | 86/118 | base | 1.000 | 0.730 | no |
| HW4-VAL-418 | VALIDATION:993:5380 | chain/scarce/restore_and_protect | H2 | MOVE | c5c63c223592… | 1 | 21/25 | base | 0.941 | 0.287 | no |
| HW4-VAL-486 | VALIDATION:993:11864 | nested_dependency/defended/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 4/41 | base | 0.969 | 0.883 | no |
| HW4-VAL-492 | VALIDATION:993:12517 | contested_bottleneck/defended/restore_and_protect | H2 | RETREAT | 43cc4cbee3ff… | 1 | 32/65 | base | 0.544 | 0.308 | no |
| HW4-VAL-565 | VALIDATION:994:11198 | hub_and_spoke/defended/restore_and_protect | H2 | MOVE | ba6697ebb6fa… | 1 | 31/40 | base | 0.949 | 0.597 | no |
| HW4-VAL-582 | VALIDATION:995:778 | chain/defended/restore_and_protect | H2 | RESTORE | 88f09ccc2cdd… | 1 | 20/67 | twin-only | 0.819 | 0.329 | no |
| HW4-VAL-594 | VALIDATION:995:3884 | star/defended/reach_target | H2 | RETREAT | 868414eb7b08… | 1 | 66/66 | base | 0.803 | 0.402 | no |

## Table B — all 65 Nexus-else-S0 introduction classes

Comparator semantics: Nexus abstention falls back to S0 (frozen Nexus-else-S0); the class record's N orbit already
encodes the effective comparator decision. No raw-Nexus comparison is made on abstention worlds.

| alias | class | origin family | horizon | chosen action | action id | orbit | intro members (Nexus) | base/twin | nreg chosen | nreg Nexus | equals Nexus |
|---|---|---|---|---|---|---|---|---|---|---|---|
| HW4-VAL-000 | VALIDATION:960:323 | chain/bare/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 14/66 | twin-only | 0.953 | 0.672 | no |
| HW4-VAL-001 | VALIDATION:960:772 | chain/defended/restore_and_protect | H2 | MOVE | ba6697ebb6fa… | 1 | 29/29 | base | 0.879 | 0.069 | no |
| HW4-VAL-009 | VALIDATION:960:5189 | chain/redundant/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 65/89 | base | 0.867 | 0.000 | no |
| HW4-VAL-034 | VALIDATION:960:7127 | bridge/populated/reach_target | H2 | RETREAT | d898c9962283… | 1 | 46/69 | base | 1.000 | 0.709 | no |
| HW4-VAL-046 | VALIDATION:960:8549 | star/bare/restore_and_conserve | H2 | MOVE | 3491a81feab1… | 1 | 11/68 | twin-only | 0.665 | 0.631 | no |
| HW4-VAL-049 | VALIDATION:960:9044 | star/defended/supply_and_defend | H2 | RETREAT | d17feaae1e57… | 1 | 35/35 | base | 0.653 | 0.306 | no |
| HW4-VAL-063 | VALIDATION:960:10520 | mesh/defended/restore_and_protect | H2 | RESTORE | 5b20e9665a34… | 1 | 14/80 | twin-only | 0.603 | 0.633 | no |
| HW4-VAL-075 | VALIDATION:960:12689 | layered_infrastructure/defended/reach_target | H2 | MOVE | c5c63c223592… | 1 | 64/70 | base | 0.994 | 0.047 | no |
| HW4-VAL-089 | VALIDATION:989:2057 | bridge/bare/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 47/84 | base | 0.440 | 0.076 | no |
| HW4-VAL-091 | VALIDATION:989:2231 | bridge/defended/reach_target | H2 | RETREAT | 8b0d45070fe9… | 1 | 5/30 | twin-only | 0.553 | 0.360 | no |
| HW4-VAL-110 | VALIDATION:989:5579 | chain/populated/restore_and_protect | H2 | RETREAT | a74170fdc577… | 1 | 12/66 | twin-only | 0.677 | 0.595 | no |
| HW4-VAL-115 | VALIDATION:989:6096 | star/scarce/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 26/61 | twin-only | 0.989 | 0.687 | no |
| HW4-VAL-117 | VALIDATION:989:6109 | star/scarce/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 22/69 | twin-only | 0.524 | 0.382 | no |
| HW4-VAL-123 | VALIDATION:989:6212 | star/scarce/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 65/65 | base | 0.507 | 0.306 | no |
| HW4-VAL-125 | VALIDATION:989:6307 | star/populated/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 42/63 | base | 0.555 | 0.381 | no |
| HW4-VAL-128 | VALIDATION:989:7028 | bridge/scarce/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 23/27 | base | 0.686 | 0.424 | no |
| HW4-VAL-136 | VALIDATION:989:7958 | chain/defended/restore_infrastructure | H2 | RETREAT | 78ccaf941d4d… | 1 | 71/71 | base | 1.000 | 0.273 | no |
| HW4-VAL-143 | VALIDATION:989:9909 | bridge/defended/supply_and_defend | H2 | RETREAT | 8e51b896f24c… | 1 | 32/69 | twin-only | 0.591 | 0.379 | no |
| HW4-VAL-156 | VALIDATION:989:10782 | multi_cycle/bare/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 65/70 | base | 0.993 | 0.000 | no |
| HW4-VAL-161 | VALIDATION:989:11365 | parallel_dependency/defended/reach_target | H2 | RETREAT | b4266ab233b9… | 1 | 46/86 | base | 0.465 | 0.380 | no |
| HW4-VAL-164 | VALIDATION:989:11789 | nested_dependency/defended/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 61/71 | base | 1.000 | 0.193 | no |
| HW4-VAL-174 | VALIDATION:990:521 | chain/defended/reach_target | H2 | RETREAT | 872558d0a078… | 1 | 1/30 | twin-only | 0.579 | 0.345 | no |
| HW4-VAL-175 | VALIDATION:990:558 | chain/defended/reach_target | H2 | RETREAT | f87b24a72360… | 1 | 4/66 | twin-only | 0.868 | 0.828 | no |
| HW4-VAL-178 | VALIDATION:990:1193 | star/bare/restore_and_protect | H2 | MOVE | c5c63c223592… | 1 | 51/67 | base | 0.850 | 0.619 | no |
| HW4-VAL-183 | VALIDATION:990:2214 | bridge/defended/reach_target | H2 | RETREAT | da751cf86558… | 1 | 56/69 | base | 1.000 | 0.357 | no |
| HW4-VAL-199 | VALIDATION:990:6199 | star/scarce/restore_and_protect | H2 | MOVE | ba6697ebb6fa… | 1 | 66/66 | base | 0.543 | 0.306 | no |
| HW4-VAL-207 | VALIDATION:990:6815 | bridge/redundant/restore_and_protect | H2 | MOVE | c5c63c223592… | 1 | 61/68 | base | 0.568 | 0.185 | no |
| HW4-VAL-210 | VALIDATION:990:7134 | bridge/populated/reach_target | H2 | MOVE | c5c63c223592… | 1 | 11/68 | twin-only | 0.931 | 0.822 | no |
| HW4-VAL-213 | VALIDATION:990:7234 | bridge/populated/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 39/61 | base | 0.454 | 0.376 | no |
| HW4-VAL-215 | VALIDATION:990:7251 | bridge/populated/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 70/70 | base | 0.618 | 0.263 | no |
| HW4-VAL-216 | VALIDATION:990:7439 | bridge/industrial/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 53/72 | base | 0.535 | 0.325 | no |
| HW4-VAL-249 | VALIDATION:990:12240 | disconnected_islands/defended/reach_target | H2 | RETREAT | 21394f8b5132… | 1 | 15/33 | base | 0.642 | 0.541 | no |
| HW4-VAL-277 | VALIDATION:991:6119 | star/scarce/reach_target | H2 | MOVE | c5c63c223592… | 1 | 33/89 | twin-only | 0.523 | 0.458 | no |
| HW4-VAL-285 | VALIDATION:991:6411 | star/populated/restore_and_protect | H2 | BYPASS | 614c143e61ea… | 1 | 2/62 | twin-only | 0.839 | 0.842 | no |
| HW4-VAL-300 | VALIDATION:991:8193 | chain/defended/supply_and_defend | H2 | MOVE | ba6697ebb6fa… | 1 | 46/46 | base | 0.619 | 0.302 | no |
| HW4-VAL-308 | VALIDATION:991:9831 | bridge/defended/restore_and_conserve | H2 | MOVE | 3491a81feab1… | 1 | 15/70 | twin-only | 0.985 | 0.798 | no |
| HW4-VAL-315 | VALIDATION:991:10916 | multi_cycle/defended/reach_target | H2 | MOVE | ba6697ebb6fa… | 1 | 44/48 | base | 0.849 | 0.077 | no |
| HW4-VAL-347 | VALIDATION:992:5469 | chain/populated/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 3/65 | twin-only | 0.716 | 0.822 | no |
| HW4-VAL-362 | VALIDATION:992:7964 | chain/defended/restore_infrastructure | H2 | MOVE | ba6697ebb6fa… | 1 | 2/22 | twin-only | 0.376 | 0.385 | no |
| HW4-VAL-368 | VALIDATION:992:8324 | chain/defended/multi_target_delivery | H2 | MOVE | 821eee491a4c… | 1 | 4/26 | twin-only | 0.987 | 0.784 | no |
| HW4-VAL-371 | VALIDATION:992:8617 | star/bare/supply_and_defend | H2 | MOVE | c5c63c223592… | 1 | 40/64 | twin-only | 1.000 | 0.637 | no |
| HW4-VAL-398 | VALIDATION:992:12237 | disconnected_islands/defended/reach_target | H2 | MOVE | c5c63c223592… | 1 | 35/72 | base | 0.675 | 0.066 | no |
| HW4-VAL-400 | VALIDATION:992:12469 | contested_bottleneck/defended/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 67/72 | base | 0.996 | 0.143 | no |
| HW4-VAL-401 | VALIDATION:992:12479 | contested_bottleneck/defended/reach_target | H2 | MOVE | ba6697ebb6fa… | 1 | 10/86 | twin-only | 0.990 | 0.832 | no |
| HW4-VAL-402 | VALIDATION:992:12480 | contested_bottleneck/defended/reach_target | H2 | RETREAT | 43cc4cbee3ff… | 1 | 62/87 | base | 0.635 | 0.509 | no |
| HW4-VAL-405 | VALIDATION:993:1429 | star/defended/reach_target | H2 | MOVE | ba6697ebb6fa… | 1 | 48/49 | base | 0.989 | 0.127 | no |
| HW4-VAL-411 | VALIDATION:993:3284 | chain/defended/restore_and_protect | H2 | RETREAT | b9de2ec4a74f… | 1 | 86/118 | base | 1.000 | 0.761 | no |
| HW4-VAL-418 | VALIDATION:993:5380 | chain/scarce/restore_and_protect | H2 | MOVE | c5c63c223592… | 1 | 21/25 | base | 0.941 | 0.372 | no |
| HW4-VAL-437 | VALIDATION:993:7135 | bridge/populated/reach_target | H2 | BYPASS | e81e2543d184… | 1 | 4/69 | twin-only | 0.678 | 0.660 | no |
| HW4-VAL-441 | VALIDATION:993:7167 | bridge/populated/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 20/89 | twin-only | 0.461 | 0.361 | no |
| HW4-VAL-480 | VALIDATION:993:11066 | hub_and_spoke/bare/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 47/65 | base | 0.970 | 0.705 | no |
| HW4-VAL-486 | VALIDATION:993:11864 | nested_dependency/defended/restore_and_protect | H2 | MOVE | 821eee491a4c… | 1 | 4/41 | twin-only | 0.969 | 0.882 | no |
| HW4-VAL-490 | VALIDATION:993:12365 | contested_bottleneck/bare/reach_target | H2 | MOVE | ba6697ebb6fa… | 1 | 81/90 | base | 0.943 | 0.028 | no |
| HW4-VAL-491 | VALIDATION:993:12484 | contested_bottleneck/defended/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 56/81 | base | 0.708 | 0.370 | no |
| HW4-VAL-496 | VALIDATION:994:620 | chain/defended/reach_target | H2 | RETREAT | f55e07ba6e90… | 1 | 3/45 | twin-only | 0.175 | 0.082 | no |
| HW4-VAL-523 | VALIDATION:994:6104 | star/scarce/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 29/69 | twin-only | 1.000 | 0.691 | no |
| HW4-VAL-537 | VALIDATION:994:7244 | bridge/populated/restore_and_protect | H2 | MOVE | 3491a81feab1… | 1 | 9/21 | twin-only | 0.498 | 0.326 | no |
| HW4-VAL-551 | VALIDATION:994:9548 | bridge/bare/repair_and_maintain_redundancy | H2 | MOVE | ba6697ebb6fa… | 1 | 10/63 | twin-only | 0.542 | 0.479 | no |
| HW4-VAL-553 | VALIDATION:994:9716 | bridge/defended/restore_infrastructure | H2 | RESTORE | ddb44150ecd8… | 1 | 5/86 | twin-only | 0.626 | 0.517 | no |
| HW4-VAL-555 | VALIDATION:994:10002 | bridge/defended/repair_and_maintain_redundancy | H2 | MOVE | 821eee491a4c… | 1 | 41/45 | base | 0.461 | 0.332 | no |
| HW4-VAL-558 | VALIDATION:994:10403 | mesh/bare/restore_and_protect | H2 | RESTORE | 52df2f1dcfac… | 1 | 43/86 | base | 0.868 | 0.636 | no |
| HW4-VAL-565 | VALIDATION:994:11198 | hub_and_spoke/defended/restore_and_protect | H2 | MOVE | ba6697ebb6fa… | 1 | 31/40 | base | 0.949 | 0.664 | no |
| HW4-VAL-574 | VALIDATION:994:12293 | disconnected_islands/defended/restore_and_protect | H2 | MOVE | c5c63c223592… | 1 | 17/19 | base | 0.798 | 0.379 | no |
| HW4-VAL-577 | VALIDATION:994:12701 | layered_infrastructure/defended/reach_target | H2 | MOVE | 821eee491a4c… | 1 | 61/87 | base | 0.964 | 0.740 | no |
| HW4-VAL-587 | VALIDATION:995:2207 | bridge/defended/reach_target | H2 | MOVE | 3491a81feab1… | 1 | 15/26 | base | 0.534 | 0.120 | no |

## Table C — overlapping classes (fail against BOTH comparators): 14

| alias | class | chosen action | intro members S0 | intro members Nexus | base/twin | note |
|---|---|---|---|---|---|---|
| HW4-VAL-091 | VALIDATION:989:2231 | RETREAT | 5/30 | 5/30 | twin-only | catastrophic for both comparators |
| HW4-VAL-125 | VALIDATION:989:6307 | MOVE | 42/63 | 42/63 | base | catastrophic for both comparators |
| HW4-VAL-136 | VALIDATION:989:7958 | RETREAT | 71/71 | 71/71 | base | catastrophic for both comparators |
| HW4-VAL-174 | VALIDATION:990:521 | RETREAT | 1/30 | 1/30 | twin-only | catastrophic for both comparators |
| HW4-VAL-175 | VALIDATION:990:558 | RETREAT | 47/66 | 4/66 | base | catastrophic for both comparators |
| HW4-VAL-183 | VALIDATION:990:2214 | RETREAT | 56/69 | 56/69 | base | catastrophic for both comparators |
| HW4-VAL-215 | VALIDATION:990:7251 | MOVE | 70/70 | 70/70 | base | catastrophic for both comparators |
| HW4-VAL-285 | VALIDATION:991:6411 | BYPASS | 9/62 | 2/62 | twin-only | catastrophic for both comparators |
| HW4-VAL-347 | VALIDATION:992:5469 | MOVE | 3/65 | 3/65 | twin-only | catastrophic for both comparators |
| HW4-VAL-362 | VALIDATION:992:7964 | MOVE | 2/22 | 2/22 | twin-only | catastrophic for both comparators |
| HW4-VAL-411 | VALIDATION:993:3284 | RETREAT | 86/118 | 86/118 | base | catastrophic for both comparators |
| HW4-VAL-418 | VALIDATION:993:5380 | MOVE | 21/25 | 21/25 | base | catastrophic for both comparators |
| HW4-VAL-486 | VALIDATION:993:11864 | MOVE | 4/41 | 4/41 | twin-only | catastrophic for both comparators |
| HW4-VAL-565 | VALIDATION:994:11198 | MOVE | 31/40 | 31/40 | base | catastrophic for both comparators |

## Table D — failure breakdown

Sets: S0_ONLY=18, NEXUS_ONLY=51, BOTH=14, UNIQUE=83, PASS_BOTH=517 (checks: 18+14=32 ✓; 51+14=65 ✓; 83+517=600 ✓).

Chosen-action family (counts of classes):

| action family | vs S0 | vs Nexus |
|---|---|---|
| RESTORE | 7 | 3 |
| RETREAT | 9 | 14 |
| REPAIR | 5 | 0 |
| MOVE | 8 | 46 |
| BYPASS | 3 | 2 |

Base-world vs twin-only: base failures S0 16/32, Nexus 38/65; twin-only S0 16, Nexus 27. Horizon split: S0 {"H2":32}, Nexus {"H2":65}.

## Interpretation

1. **Native action selection failure (the gate failure itself).** In every audited class the C10 chosen orbit holds at
   least one catastrophic action (member regret ≥ 100) while the comparator's orbit does not, in the listed member
   count. This is the frozen introduction predicate — no interpretation beyond it is claimed.
2. **Hidden-state-dependent safety.** Classes marked twin-only are safe on the base world and catastrophic only on
   public-content-equivalent twins: the introduced catastrophe depends on hidden state the public contract cannot
   distinguish. Base-failure classes are unsafe at the decision time base world itself.
3. **Comparator-specific differences.** 14 classes are catastrophic against both comparators (the chosen
   action is regret-dominated in some member regardless of comparator); 18 fail only against S0 and
   51 only against Nexus-else-S0 — comparator identity matters for the residual tail.
4. **Horizon effects.** H0 vs H2 splits are recorded in Table D; the failure counts are dominated by the H2 screen rule
   population (the screen admitted stress classes primarily at H2), so horizon comparisons are confounded with
   population composition and are NOT causal claims.
5. **Base vs twin risk.** Twin-only failures dominate or not as recorded above; where twin-only, the base world is safe
   and the failure is a twin risk — consistent with prior stages (H-W1/H-W3) and chaotic member outcomes.
6. **Action tie handling.** orbit_size > 1 marks classes where the chosen action's keyV2 tie-set (equivalent
   actions) was non-trivial; the frozen rule scores the whole orbit (worst case for catastrophe, uniform expectation for
   regret). equals_s0/equals_nexus mark classes where the chosen orbit is identical to the comparator's (never
   introducing by definition — none appear in these tables by construction unless tie-adjacent members differ).
7. **Candidate fallback behavior.** None: V1 and V2 have ZERO decision differences (600/600 identical chosen actions,
   0 flips), so no candidate-fallback asymmetry exists. Every failure below is a property of the shared C10
   policy, NOT of the value band — none of this is evidence of a V2-specific safety benefit or harm.

V1_V2_DECISION_FLIPS=0; V1_V2_SAFETY_EFFECT=0; ZERO_ILLEGAL_ACTIONS=true (0/28,800 audit decisions; 600/600 replay decisions legal).

## Source identities

- HW4_VALIDATION_RESULTS.json sha256: f24878df4c444635f6edcfa8ac8feed7a70fa4bb9e4f377bec7c618bea2df6c0
- HW4_CANDIDATE_FREEZE.json sha256: d7222f2b2c84406911453b43537b727de3ca369ddbedcfb19a91a8dae8118294
- HW4_REGISTRY_EXPLORATION.json sha256: 327ca410de87cf1183c867ab0e6baa700696d7bcfdc84c97411f352439c205d7
- HW4_REGISTRY_VALIDATION.json sha256: 7c030fd42d5fe76c92cec05780408d028c7a18e4b23da1b2914e2c277af83422
- HW4_NAMESPACE_ALLOCATION.json sha256: d66c2c01f0ff92723b90987557f7880bf77cb6a249947739b02f919ee683f466
- Freeze record sha256 (self-recorded): d7222f2b2c84406911453b43537b727de3ca369ddbedcfb19a91a8dae8118294
- Validation class records: work/classes/VALIDATION range-0-600-shard-{0..7}-of-8.json (privileged, gitignored; sha256 per shard in HW4_INTRODUCTION_AUDIT_MANIFEST.json)
- Member worlds: 39,732 across 600 classes; truths are offline evaluator releases and are NOT reproduced in this report.
