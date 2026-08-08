<?php
/* AZL auth bridge - THE single integration point with Medallion XLN's existing
 * auth stack (OTP sessions / SecurityService / CSRF). Everything else in the AZL
 * PHP layer calls only these four functions.
 *
 * DEFAULT BEHAVIOR (works standalone, honest about what it is):
 *   - azl_db(): PDO from azl-config.php constants, ERRMODE_EXCEPTION, prepared stmts.
 *   - azl_current_user_id(): reads $_SESSION['user_id'] (int) after session_start.
 *   - azl_verify_csrf(): X-CSRF-Token header vs $_SESSION['csrf_token'] when the
 *     session has one; otherwise falls back to a same-origin Origin/Referer check.
 *     The fallback is weaker than platform CSRF - wire the real check below.
 *   - azl_client_ip(): REMOTE_ADDR.
 *
 * WIRE-UP (when integrating with the live platform):
 *   1. Replace azl_current_user_id() body with the platform session accessor.
 *   2. Replace azl_verify_csrf() body with SecurityService's CSRF validation.
 *   Nothing else needs to change. */
declare(strict_types=1);

require_once __DIR__ . '/azl-config.php';

function azl_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . AZL_DB_HOST . ';dbname=' . AZL_DB_NAME . ';charset=utf8mb4';
        $pdo = new PDO($dsn, AZL_DB_USER, AZL_DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function azl_current_user_id(): ?int
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    /* PLATFORM WIRING POINT: return the OTP-authenticated user id here. */
    if (isset($_SESSION['user_id']) && is_numeric($_SESSION['user_id'])) {
        return (int) $_SESSION['user_id'];
    }
    return null;
}

function azl_verify_csrf(): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        @session_start();
    }
    $hdr = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    /* PLATFORM WIRING POINT: call SecurityService CSRF validation here. */
    if (!empty($_SESSION['csrf_token'])) {
        return is_string($hdr) && hash_equals((string) $_SESSION['csrf_token'], $hdr);
    }
    /* Fallback: same-origin check (documented as weaker than token CSRF). */
    $host = $_SERVER['HTTP_HOST'] ?? '';
    foreach (['HTTP_ORIGIN', 'HTTP_REFERER'] as $k) {
        if (!empty($_SERVER[$k])) {
            $h = parse_url((string) $_SERVER[$k], PHP_URL_HOST);
            return is_string($h) && strcasecmp($h, (string) parse_url('http://' . $host, PHP_URL_HOST)) === 0;
        }
    }
    return false;
}

function azl_client_ip(): string
{
    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}
