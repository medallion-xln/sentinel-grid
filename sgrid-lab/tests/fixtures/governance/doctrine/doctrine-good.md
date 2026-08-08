# Synthetic doctrine fixture — well-formed

    GUARDRAILS_V2_EFFECTIVE_AT = 2026-07-23T00:00:00.000Z

Reference lines that must NOT be parsed as declarations:
- If `T >= GUARDRAILS_V2_EFFECTIVE_AT`, M must carry an identity block.
- If `T < GUARDRAILS_V2_EFFECTIVE_AT`, M routes to grandfathering.
