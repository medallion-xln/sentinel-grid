<?php
/* AZL server configuration SAMPLE.
 * Deploy step: copy this file to azl-config.php in the same directory and fill in
 * the medallio_xln credentials. azl-config.php is gitignore-able and never public. */
declare(strict_types=1);

const AZL_DB_HOST = 'localhost';
const AZL_DB_NAME = 'medallio_xln';
const AZL_DB_USER = 'FILL_ME';
const AZL_DB_PASS = 'FILL_ME';

/* Require a logged-in platform user for POST endpoints (recommended true). */
const AZL_REQUIRE_AUTH = true;
/* User id allowed to call action=rollback (set to Dwayne's user id). 0 disables. */
const AZL_ADMIN_USER_ID = 0;
/* Allow first-version bootstrap uploads while a model has no production version. */
const AZL_ALLOW_BOOTSTRAP = true;

/* Hard input caps (bytes). */
const AZL_MAX_JSON_BODY = 8388608;      /* 8 MB JSON (replay batches, update payloads) */
const AZL_MAX_DELTA_BYTES = 4194304;    /* must match CONFIG.FEDERATED.maxUploadBytes */
const AZL_DELTA_CLIP_NORM = 5.0;        /* must match CONFIG.FEDERATED.deltaClipNorm */
const AZL_MIN_CLIENTS_AGG = 3;
const AZL_MAX_UPDATES_PER_RUN = 8;
const AZL_TUPLES_PER_CLIENT_PER_DAY = 5000;
const AZL_EVALS_PER_CLIENT_PER_DAY = 50;
const AZL_UPDATES_PER_CLIENT_PER_DAY = 24;
const AZL_UPLOAD_MIN_INTERVAL_SEC = 540; /* ~9 min server floor under 10 min client cooldown */

/* Promotion gates (mirror CONFIG.PROMOTION). */
const AZL_PROMOTE_MIN_GAMES = 40;
const AZL_PROMOTE_WINRATE = 0.53;
const AZL_PROMOTE_LCB = 0.50;
const AZL_CANARY_PCT = 10;
const AZL_CANARY_MIN_HOURS = 12;

/* Known model architectures: param counts + arch versions are validated server-side
 * against these values (client-reported numbers are never trusted). Fill archVersion
 * from bench.html "versions" output after first load (AZL.Fed.archVersion). 0 = accept
 * and pin on first bootstrap upload. */
const AZL_MODELS = [
    'scout' => ['param_count' => 47629, 'arch_version' => 0],
    'strategist' => ['param_count' => 340497, 'arch_version' => 0],
];
