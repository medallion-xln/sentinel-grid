# AZL Model Lifecycle + Security

## Lifecycle

```
client train -> delta (clip norm 5.0) -> POST updates -> azl_pending_updates
   -> lazy FedAvg on manifest reads (GET_LOCK azl_agg_<model>, no cron):
      >=3 distinct clients on the current base, newest update per client,
      max 8 per run, weights sqrt(min(samples,2000)) * completeness * trust,
      trim max+min norm when n>=5, streaming 64KB chunks
   -> candidate version (parent = production)
   -> clients fetch candidate, run paired-seed eval vs production, POST results
   -> gate: >=40 games AND winRate > 0.53 AND Wilson LCB > 0.50 -> canary
      (fail hard: 2x games with LCB < 0.45 -> rejected)
   -> canary serves 10% of clients (deterministic crc32 bucket) for >=12h,
      still passing -> production; regressing -> rejected + assignments cleared
   -> old production -> archived (rollback target)
```

Bootstrap: while a model has no production version and `AZL_ALLOW_BOOTSTRAP`,
an authenticated client may upload FULL weights with baseVersion 0 -> becomes
production v1 (bench.html button). Inert afterward.

Rollback: POST `?action=rollback` `{clientId, model}` as `AZL_ADMIN_USER_ID`
-> current production becomes `rolled_back`, latest archived version becomes
production. Clients pick it up on the next manifest refresh (<=5 min).

Wire format: server stores/serves RAW little-endian f32 param vectors
(azl_weight_payloads LONGBLOB) with metadata headers (X-AZL-Version/Arch/
Params/CRC32/Status), so PHP can do delta arithmetic. Clients validate length,
architecture hash, CRC32, and finiteness before atomic activation. The AZLW
container (magic/tensor table/CRC32/f16) is the client-side cache format.

## Poisoning + abuse defenses

- Deltas: exact byte length vs pinned param_count, chunked finite scan, norm
  re-verified server-side (<= clip * 1.01), base version must equal current
  production (stale bases rejected), architecture hash checked.
- Aggregation: trimmed weighted mean; per-client trust (0.1-2.0) learned from
  accept/reject history multiplies weights; one update per client per run.
- Replay: session ownership enforced (no cross-client injection), every field
  bounds-checked and RE-ENCODED (raw client JSON is never stored), tuple_id
  idempotency, 5000 tuples/client/day.
- Rates: 24 updates/client/day + 540s server floor, 50 evals/client/day,
  8MB JSON cap, 4MB delta cap, uuid-format client ids.
- Promotion: statistical gates + canary mean a poisoned candidate must beat
  production on paired frozen seeds across many clients before full rollout,
  and rollback is one POST away.
- Bootstrap is the trusted moment: it requires auth + config flag and should
  be done by you from bench.html immediately after deploy.
- Known residual risks: a coordinated set of >=3 authenticated accounts could
  bias a candidate (mitigated by eval gate, not eliminated); evaluation
  reports are client-claimed (bounded + capped + candidate-existence-checked,
  but self-reported). Both are documented tradeoffs of serverless-GPU
  federated learning on shared hosting.
