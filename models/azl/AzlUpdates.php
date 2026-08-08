<?php
/* AzlUpdates: federated update ingest.
 * Delta path: base64 raw f32 delta, validated (byte length == param_count*4,
 * finite, norm <= clip*1.01, base version == current production) -> pending row.
 * Bootstrap path: full param vector accepted as production v1 only while no
 * production version exists AND AZL_ALLOW_BOOTSTRAP (then inert). */
declare(strict_types=1);

final class AzlUpdates
{
    public static function ingest(PDO $db, string $clientUuid, ?int $userId, array $b): array
    {
        $model = (string) ($b['model'] ?? '');
        if (!array_key_exists($model, AZL_MODELS)) { return ['ok' => false, 'code' => 'unknown-model']; }
        $key = (string) ($b['idempotencyKey'] ?? '');
        if (!preg_match('/^[0-9a-f-]{36}$/i', $key)) { return ['ok' => false, 'code' => 'bad-idempotency-key']; }
        $st = $db->prepare('SELECT id, status FROM azl_pending_updates WHERE idempotency_key=?');
        $st->execute([$key]);
        if ($st->fetch() !== false) { return ['ok' => true, 'code' => 'duplicate']; }

        $rep = AzlReputation::touch($db, $clientUuid, $userId);
        if ((int) ($rep['updates_today'] ?? 0) >= AZL_UPDATES_PER_CLIENT_PER_DAY) { return ['ok' => false, 'code' => 'daily-cap']; }
        if (!empty($rep['last_upload_at']) && (time() - strtotime((string) $rep['last_upload_at'])) < AZL_UPLOAD_MIN_INTERVAL_SEC) {
            return ['ok' => false, 'code' => 'too-frequent'];
        }

        $b64 = (string) ($b['deltaB64'] ?? '');
        if (strlen($b64) > (int) (AZL_MAX_DELTA_BYTES * 1.4)) { return ['ok' => false, 'code' => 'too-large']; }
        $bin = base64_decode($b64, true);
        if ($bin === false || $bin === '') { return ['ok' => false, 'code' => 'bad-base64']; }
        if (strlen($bin) > AZL_MAX_DELTA_BYTES) { return ['ok' => false, 'code' => 'too-large']; }

        $cfg = AZL_MODELS[$model];
        $expectedBytes = ((int) $cfg['param_count']) * 4;
        if (strlen($bin) !== $expectedBytes) { self::punish($db, $clientUuid); return ['ok' => false, 'code' => 'byte-length-mismatch']; }
        $scan = AzlWeights::scanF32($bin);
        if (!$scan['ok']) { self::punish($db, $clientUuid); return ['ok' => false, 'code' => (string) $scan['error']]; }

        $prod = AzlManifest::production($db, $model);
        $baseVersion = (int) ($b['baseVersion'] ?? -1);
        $declaredArch = (int) sprintf('%u', (int) ($b['archVersion'] ?? 0));

        if ($prod === null) {
            /* Bootstrap: full weights become production v1. */
            if (!AZL_ALLOW_BOOTSTRAP || $baseVersion !== 0 || empty($b['bootstrap'])) { return ['ok' => false, 'code' => 'no-production']; }
            if ($scan['norm'] <= 0.01 || $scan['norm'] > 100000.0) { return ['ok' => false, 'code' => 'implausible-norm']; }
            $arch = ((int) $cfg['arch_version']) !== 0 ? (int) $cfg['arch_version'] : $declaredArch;
            if ($arch !== 0 && ((int) $cfg['arch_version']) !== 0 && $declaredArch !== 0 && $arch !== $declaredArch) {
                return ['ok' => false, 'code' => 'arch-mismatch'];
            }
            $v = AzlWeights::createVersion($db, $model, $bin, $arch, (int) $cfg['param_count'], 'production', null, 'bootstrap by ' . $clientUuid);
            AzlReputation::bump($db, $clientUuid, 'updates_today');
            $db->prepare('UPDATE azl_client_reputation SET last_upload_at=NOW() WHERE client_uuid=?')->execute([$clientUuid]);
            return ['ok' => true, 'code' => 'bootstrapped', 'version' => $v];
        }

        if ($baseVersion !== (int) $prod['version']) { return ['ok' => false, 'code' => 'stale-base']; }
        if (((int) $prod['arch_version']) !== 0 && $declaredArch !== 0 && $declaredArch !== (int) $prod['arch_version']) {
            return ['ok' => false, 'code' => 'arch-mismatch'];
        }
        if ($scan['norm'] > AZL_DELTA_CLIP_NORM * 1.01) { self::punish($db, $clientUuid); return ['ok' => false, 'code' => 'norm-exceeds-clip']; }

        $samples = max(0, min(1000000, (int) ($b['sampleCount'] ?? 0)));
        $comp = max(0.0, min(1.0, (float) ($b['completeness'] ?? 0)));
        $db->prepare('INSERT INTO azl_pending_updates (model, base_version, client_uuid, idempotency_key, sample_count, completeness, delta_norm, byte_len, payload, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,\'pending\',NOW())')
           ->execute([$model, $baseVersion, $clientUuid, strtolower($key), $samples, $comp, $scan['norm'], strlen($bin), $bin]);
        AzlReputation::bump($db, $clientUuid, 'updates_today');
        AzlReputation::adjustTrust($db, $clientUuid, 0.01);
        $db->prepare('UPDATE azl_client_reputation SET last_upload_at=NOW() WHERE client_uuid=?')->execute([$clientUuid]);
        return ['ok' => true, 'code' => 'pending'];
    }
    private static function punish(PDO $db, string $clientUuid): void
    {
        AzlReputation::adjustTrust($db, $clientUuid, -0.1);
    }
}
