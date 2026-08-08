<?php
/* AZL API handler. Routed from /public_html/api/azl/index.php.
 * Actions: manifest(GET) weights(GET) replay(POST) updates(POST)
 *          evaluations(POST) heartbeat(POST) rollback(POST, admin).
 * Envelope: {ok:true,data:...} | {ok:false,error:{code,message}}. */
declare(strict_types=1);

if (!is_file(__DIR__ . '/azl-config.php')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => ['code' => 'config-missing', 'message' => 'Copy azl-config.sample.php to azl-config.php and fill in credentials.']]);
    exit;
}
require_once __DIR__ . '/azl-auth-bridge.php';
$azlDomainRoot = dirname(__DIR__, 2);
require_once $azlDomainRoot . '/models/azl/AzlManifest.php';
require_once $azlDomainRoot . '/models/azl/AzlWeights.php';
require_once $azlDomainRoot . '/models/azl/AzlReplay.php';
require_once $azlDomainRoot . '/models/azl/AzlUpdates.php';
require_once $azlDomainRoot . '/models/azl/AzlAggregation.php';
require_once $azlDomainRoot . '/models/azl/AzlEvaluations.php';

set_error_handler(function (int $no, string $msg, string $file, int $line): bool {
    error_log("[AZL] php $no $msg @ $file:$line");
    return true;
});
set_exception_handler(function (Throwable $e): void {
    error_log('[AZL] exception: ' . $e->getMessage());
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => ['code' => 'internal', 'message' => 'internal error']]);
    exit;
});

function azl_ok(array $data): void
{
    header('Content-Type: application/json');
    echo json_encode(['ok' => true, 'data' => $data]);
    exit;
}
function azl_err(string $code, string $msg, int $http = 400): void
{
    http_response_code($http);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => ['code' => $code, 'message' => $msg]]);
    exit;
}
function azl_body(): array
{
    $raw = file_get_contents('php://input', false, null, 0, AZL_MAX_JSON_BODY + 1);
    if ($raw === false || strlen($raw) > AZL_MAX_JSON_BODY) { azl_err('body-too-large', 'request body exceeds cap', 413); }
    $j = json_decode($raw, true);
    if (!is_array($j)) { azl_err('bad-json', 'invalid JSON body'); }
    return $j;
}
function azl_client_uuid(array $src): string
{
    $c = (string) ($src['clientId'] ?? '');
    if (!preg_match('/^[0-9a-f-]{36}$/i', $c)) { azl_err('bad-client-id', 'clientId must be a UUID'); }
    return strtolower($c);
}
function azl_gate_post(): ?int
{
    $uid = azl_current_user_id();
    if (AZL_REQUIRE_AUTH && $uid === null) { azl_err('auth-required', 'login required', 401); }
    if (!azl_verify_csrf()) { azl_err('csrf', 'CSRF check failed', 403); }
    return $uid;
}

$action = (string) ($_GET['action'] ?? '');
$method = (string) ($_SERVER['REQUEST_METHOD'] ?? 'GET');
$db = azl_db();

switch ($action) {
    case 'manifest':
        if ($method !== 'GET') { azl_err('method', 'GET required', 405); }
        azl_ok(AzlManifest::build($db, azl_client_uuid($_GET)));
        break;
    case 'weights':
        if ($method !== 'GET') { azl_err('method', 'GET required', 405); }
        $model = (string) ($_GET['model'] ?? '');
        if (!array_key_exists($model, AZL_MODELS)) { azl_err('unknown-model', 'unknown model'); }
        AzlWeights::serve($db, $model, (int) ($_GET['version'] ?? 0));
        break;
    case 'replay': {
        if ($method !== 'POST') { azl_err('method', 'POST required', 405); }
        $uid = azl_gate_post();
        $b = azl_body();
        $tuples = is_array($b['tuples'] ?? null) ? $b['tuples'] : [];
        if (count($tuples) > 500) { azl_err('too-many-tuples', 'max 500 tuples per batch'); }
        azl_ok(AzlReplay::ingest($db, azl_client_uuid($b), $uid, $tuples));
        break;
    }
    case 'updates': {
        if ($method !== 'POST') { azl_err('method', 'POST required', 405); }
        $uid = azl_gate_post();
        $b = azl_body();
        $r = AzlUpdates::ingest($db, azl_client_uuid($b), $uid, $b);
        if (!$r['ok']) { azl_err((string) $r['code'], 'update rejected'); }
        azl_ok($r);
        break;
    }
    case 'evaluations': {
        if ($method !== 'POST') { azl_err('method', 'POST required', 405); }
        $uid = azl_gate_post();
        $b = azl_body();
        $r = AzlEvaluations::ingest($db, azl_client_uuid($b), $uid, $b);
        if (!$r['ok']) { azl_err((string) $r['code'], 'evaluation rejected'); }
        azl_ok($r);
        break;
    }
    case 'heartbeat': {
        if ($method !== 'POST') { azl_err('method', 'POST required', 405); }
        $b = azl_body();
        AzlReputation::touch($db, azl_client_uuid($b), azl_current_user_id());
        azl_ok(['serverTime' => gmdate('c')]);
        break;
    }
    case 'rollback': {
        if ($method !== 'POST') { azl_err('method', 'POST required', 405); }
        $uid = azl_current_user_id();
        if (AZL_ADMIN_USER_ID === 0 || $uid !== AZL_ADMIN_USER_ID) { azl_err('forbidden', 'admin only', 403); }
        if (!azl_verify_csrf()) { azl_err('csrf', 'CSRF check failed', 403); }
        $b = azl_body();
        $model = (string) ($b['model'] ?? '');
        if (!array_key_exists($model, AZL_MODELS)) { azl_err('unknown-model', 'unknown model'); }
        $r = AzlManifest::rollback($db, $model);
        if (!$r['ok']) { azl_err((string) $r['error'], 'rollback failed'); }
        azl_ok($r);
        break;
    }
    default:
        azl_err('unknown-action', 'unknown action', 404);
}
