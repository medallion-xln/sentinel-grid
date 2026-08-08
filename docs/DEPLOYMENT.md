# AZL Deployment (cPanel, no CLI)

## 1. Upload + extract

Upload `azl-deploy.zip` to the DOMAIN ROOT (`/home2/medallio/domains/medallionxln.com/`)
via File Manager and extract there. It merges:

```
public_html/azl/...            client engine + workers + bench.html
public_html/api/azl/index.php  API proxy
api/azl/handler.php            router (outside web root)
api/azl/azl-auth-bridge.php    auth integration point
api/azl/azl-config.sample.php  config template
models/azl/Azl*.php            six models
migrations/azl_schema.sql
docs/  tests/
```

Nothing overwrites existing files (all paths are new `azl` directories).

## 2. Config

Copy `api/azl/azl-config.sample.php` -> `api/azl/azl-config.php`, fill the
`medallio_xln` credentials, set `AZL_ADMIN_USER_ID` to your user id.

## 3. Database

phpMyAdmin -> medallio_xln -> SQL -> paste `migrations/azl_schema.sql` -> Go.
Creates 10 `azl_*` tables. `SHOW TABLES LIKE 'azl_%'` should list all ten.

## 4. Smoke checks

- `https://medallionxln.com/api/azl/index.php?action=manifest&clientId=00000000-0000-4000-8000-000000000000`
  -> `{"ok":true,...}` with both models' `serving: null` (no weights yet).
- `https://medallionxln.com/azl/bench.html` -> "Run benchmarks" (browser numbers),
  then "Test workers" (full advisor round trip on the reference simulator).

## 5. Bootstrap weights (one time)

While logged in, open bench.html -> "Publish bootstrap weights". This distills
Scout from the heuristic and publishes v1 of both models as production
(guarded by `AZL_ALLOW_BOOTSTRAP` + auth; inert once production exists).
Re-check the manifest URL: both models should now show `version: 1`.

## 6. Wire into ZekNova

Load order (with `?v=` bumped on EVERY change - platform rule):

```html
<script src="/azl/azl-config.js?v=1"></script>
<script src="/azl/azl-util.js?v=1"></script>
<script src="/azl/azl-state.js?v=1"></script>
<script src="/azl/azl-nn.js?v=1"></script>
<script src="/azl/azl-scout.js?v=1"></script>
<script src="/azl/azl-strategist.js?v=1"></script>
<script src="/azl/azl-oracle.js?v=1"></script>
<script src="/azl/azl-relational.js?v=1"></script>
<script src="/azl/azl-mcts.js?v=1"></script>
<script src="/azl/azl-router.js?v=1"></script>
<script src="/azl/azl-weights.js?v=1"></script>
<script src="/azl/azl-replay.js?v=1"></script>
<script src="/azl/azl-federated.js?v=1"></script>
<script src="/azl/azl-governor.js?v=1"></script>
<script src="/azl/azl-eval.js?v=1"></script>
<script src="/azl/azl-advisor.js?v=1"></script>
<script src="/azl/zeknova-adapter.js?v=1"></script> <!-- your adapter -->
```

```js
AZL.Advisor.init({
  adapter: window.AZL_ADAPTER,          // your adapter object
  adapterUrl: '/azl/zeknova-adapter.js',// workers importScripts this
  csrf: window.MEDALLION_CSRF || null,
  onRecommendation: d => renderAdvice(d) // d.actionIdx, d.forecast, d.weights, d.level
}).then(adv => {
  adv.startSession({ scenario: 'campaign-1' });
  setInterval(() => adv.observe(), 1000);                    // feed Oracle ring
  setInterval(() => adv.attachOutcomes(game.tick, game.health()), 5000);
  // on advice request: adv.decide()
  // on player action:  adv.recordPlayerAction(actionId)
  // on session end:    adv.endSession(finalHealth)
});
```

## 7. ZekNovaAdapter binding (~20 lines against the contract)

The full contract is documented at the top of `azl-ref-adapter.js`. Skeleton:

```js
(function (g) {
  var real = g.ZekNova; // your game object
  g.AZL_ADAPTER = {
    id: 'zeknova', version: 1,
    actions: [...],                     // ordered action list {key,label}
    baseFeatureSpec: [...],             // {key,min,max,def} per feature
    safeActionIndex: <idx of stabilize>,
    oracleGroups: {...}, relationalConfig: {...},
    captureSearchState: () => real.snapshotForSearch(),
    sim: {
      init: seed => real.simInit(seed),
      clone: s => real.simClone(s),
      step: (s, a, rng) => real.simStep(s, a, rng), // {terminal, terminalValue}
      legalMask: (s, out) => real.legalMask(s, out),
      toBaseFeatures: (s, out) => real.features(s, out),
      heuristicValue: s => real.evalHand(s),
      actionScores: (s, out) => real.scoreActions(s, out),
      entities: s => real.entities(s),
      health: s => real.health(s),
      tick: s => s.tick
    }
  };
})(globalThis);
```

Paste your real state object shape into a chat and the exact binding can be
written line-for-line.

## 8. CSRF / auth wiring

`api/azl/azl-auth-bridge.php` is the ONLY integration point: two clearly marked
functions to point at the platform OTP session and SecurityService CSRF. The
shipped defaults ($_SESSION['user_id'], X-CSRF-Token vs $_SESSION['csrf_token'],
same-origin fallback) work standalone but the fallback is weaker - wire the
real check before opening to untrusted users.

## Platform rules honored

Full file replacements; `?v=` cache busting; proxy -> handler -> model layout;
prepared statements everywhere; `DESCRIBE`/`SHOW TABLES` before touching any
unfamiliar table still applies to future edits; ASCII-clean sources.
