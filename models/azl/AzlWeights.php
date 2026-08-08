<?php
/* AzlWeights: payload storage (LONGBLOB) + version row creation + binary serving.
 * Payload = raw little-endian Float32 param vector in the client Net's canonical
 * tensor-table order. Metadata (versions, arch, checksum, param count) lives in
 * azl_model_versions; payload bytes are opaque here. Encapsulated so object/file
 * storage can replace the BLOB later without touching callers. */
declare(strict_types=1);

final class AzlWeights
{
    public static function fetchPayload(PDO $db, string $model, int $version): ?array
    {
        $st = $db->prepare('SELECT p.payload, p.byte_len, p.crc32, v.arch_version, v.param_count, v.status FROM azl_weight_payloads p JOIN azl_model_versions v ON v.model=p.model AND v.version=p.version WHERE p.model=? AND p.version=?');
        $st->execute([$model, $version]);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }
    /* Create version N (payload + metadata row) atomically. Returns new version. */
    public static function createVersion(PDO $db, string $model, string $payload, int $archVersion, int $paramCount, string $status, ?int $parentVersion, string $notes): int
    {
        $crc = (int) sprintf('%u', crc32($payload));
        $db->beginTransaction();
        try {
            $st = $db->prepare('SELECT COALESCE(MAX(version),0)+1 v FROM azl_model_versions WHERE model=? FOR UPDATE');
            $st->execute([$model]);
            $version = (int) $st->fetch()['v'];
            $db->prepare('INSERT INTO azl_weight_payloads (model, version, dtype, byte_len, crc32, payload, created_at) VALUES (?,?,?,?,?,?,NOW())')
               ->execute([$model, $version, 'f32', strlen($payload), $crc, $payload]);
            $db->prepare('INSERT INTO azl_model_versions (model, version, arch_version, status, parent_version, param_count, checksum_crc32, notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())')
               ->execute([$model, $version, $archVersion, $status, $parentVersion, $paramCount, $crc, $notes]);
            $db->commit();
            return $version;
        } catch (Throwable $e) {
            $db->rollBack();
            throw $e;
        }
    }
    /* Stream a version to the client with metadata headers. Exits. */
    public static function serve(PDO $db, string $model, int $version): void
    {
        $row = self::fetchPayload($db, $model, $version);
        if ($row === null) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['ok' => false, 'error' => ['code' => 'no-weights', 'message' => 'version not found']]);
            exit;
        }
        if (!in_array($row['status'], ['production', 'canary', 'candidate', 'archived'], true)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['ok' => false, 'error' => ['code' => 'version-not-servable', 'message' => 'status ' . $row['status']]]);
            exit;
        }
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . strlen($row['payload']));
        header('X-AZL-Model: ' . $model);
        header('X-AZL-Version: ' . $version);
        header('X-AZL-Arch: ' . (int) $row['arch_version']);
        header('X-AZL-Params: ' . (int) $row['param_count']);
        header('X-AZL-CRC32: ' . (int) $row['crc32']);
        header('X-AZL-Status: ' . $row['status']);
        header('Cache-Control: private, max-age=86400');
        echo $row['payload'];
        exit;
    }
    /* Chunked scan of a raw f32 payload: finiteness + L2 norm. */
    public static function scanF32(string $bin): array
    {
        $len = strlen($bin);
        if ($len % 4 !== 0) { return ['ok' => false, 'error' => 'byte-alignment']; }
        $sum = 0.0;
        for ($off = 0; $off < $len; $off += 65536) {
            $chunk = substr($bin, $off, min(65536, $len - $off));
            $vals = unpack('g*', $chunk);
            if ($vals === false) { return ['ok' => false, 'error' => 'unpack-failed']; }
            foreach ($vals as $v) {
                if (!is_finite($v)) { return ['ok' => false, 'error' => 'non-finite']; }
                $sum += $v * $v;
            }
        }
        return ['ok' => true, 'norm' => sqrt($sum), 'count' => intdiv($len, 4)];
    }
}
