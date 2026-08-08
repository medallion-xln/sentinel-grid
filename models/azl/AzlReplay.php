<?php
/* AzlReplay: replay tuple ingest with strict validation, session-ownership
 * enforcement (no cross-session injection), per-client daily caps, and
 * idempotent inserts (unique tuple_id). Client-supplied outcomes/skill are stored
 * but treated as untrusted signals (bounded, and reweighted server-side by
 * reputation during aggregation - never as unquestioned truth).
 * AzlReputation: shared per-client counters/trust used by every POST endpoint. */
declare(strict_types=1);

final class AzlReputation
{
    public static function touch(PDO $db, string $clientUuid, ?int $userId): array
    {
        $db->prepare('INSERT IGNORE INTO azl_client_reputation (client_uuid, user_id, trust, tuples_today, updates_today, evals_today, tuples_total, updates_total, day_key, last_seen_at, created_at, updated_at) VALUES (?,?,?,0,0,0,0,0,CURDATE(),NOW(),NOW(),NOW())')
           ->execute([$clientUuid, $userId, 1.0]);
        $db->prepare('UPDATE azl_client_reputation SET tuples_today=IF(day_key=CURDATE(),tuples_today,0), updates_today=IF(day_key=CURDATE(),updates_today,0), evals_today=IF(day_key=CURDATE(),evals_today,0), day_key=CURDATE(), last_seen_at=NOW(), user_id=COALESCE(user_id,?), updated_at=NOW() WHERE client_uuid=?')
           ->execute([$userId, $clientUuid]);
        $st = $db->prepare('SELECT * FROM azl_client_reputation WHERE client_uuid=?');
        $st->execute([$clientUuid]);
        return $st->fetch() ?: [];
    }
    public static function bump(PDO $db, string $clientUuid, string $col, int $n = 1): void
    {
        $allowed = ['tuples_today' => 'tuples_total', 'updates_today' => 'updates_total', 'evals_today' => null];
        if (!array_key_exists($col, $allowed)) { return; }
        $total = $allowed[$col] !== null ? (', ' . $allowed[$col] . '=' . $allowed[$col] . '+' . $n) : '';
        $db->prepare('UPDATE azl_client_reputation SET ' . $col . '=' . $col . '+' . $n . $total . ', updated_at=NOW() WHERE client_uuid=?')
           ->execute([$clientUuid]);
    }
    public static function adjustTrust(PDO $db, string $clientUuid, float $delta): void
    {
        $db->prepare('UPDATE azl_client_reputation SET trust=GREATEST(0.1, LEAST(2.0, trust+?)), updated_at=NOW() WHERE client_uuid=?')
           ->execute([$delta, $clientUuid]);
    }
}

final class AzlReplay
{
    private static function num($v, float $lo, float $hi): ?float
    {
        if ($v === null) { return null; }
        if (!is_numeric($v)) { return null; }
        $f = (float) $v;
        if (!is_finite($f)) { return null; }
        return max($lo, min($hi, $f));
    }
    private static function floatArr($a, int $maxLen): ?array
    {
        if (!is_array($a) || count($a) > $maxLen) { return null; }
        $out = [];
        foreach ($a as $v) {
            if (!is_numeric($v) || !is_finite((float) $v)) { return null; }
            $out[] = (float) $v;
        }
        return $out;
    }
    public static function ingest(PDO $db, string $clientUuid, ?int $userId, array $tuples): array
    {
        $rep = AzlReputation::touch($db, $clientUuid, $userId);
        $budget = AZL_TUPLES_PER_CLIENT_PER_DAY - (int) ($rep['tuples_today'] ?? 0);
        $accepted = 0; $duplicates = 0; $rejected = 0; $capped = 0;
        $sessOwner = $db->prepare('SELECT client_uuid FROM azl_replay_sessions WHERE session_id=?');
        $sessUpsert = $db->prepare('INSERT INTO azl_replay_sessions (session_id, client_uuid, user_id, game_v, scenario, started_at, terminal_value, tuple_count, created_at) VALUES (?,?,?,?,?,NOW(),?,1,NOW()) ON DUPLICATE KEY UPDATE tuple_count=tuple_count+1, terminal_value=COALESCE(VALUES(terminal_value), terminal_value), ended_at=IF(VALUES(terminal_value) IS NULL, ended_at, NOW())');
        $ins = $db->prepare('INSERT IGNORE INTO azl_replay_tuples (tuple_id, session_id, client_uuid, schema_v, action_v, state_hash, tick, source, recommended_action, player_action, followed, autonomous, outcome_now, outcome_m5, outcome_m30, outcome_session, terminal, priority, completeness, novelty, disagreement, confident_wrong, payload, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())');
        foreach ($tuples as $t) {
            if (!is_array($t)) { $rejected++; continue; }
            if ($capped + $accepted >= $budget) { $capped++; continue; }
            $tupleId = (string) ($t['tupleId'] ?? '');
            $sessionId = (string) ($t['sessionId'] ?? '');
            if (!preg_match('/^[0-9a-f-]{36}$/i', $tupleId) || !preg_match('/^[0-9a-f-]{36}$/i', $sessionId)) { $rejected++; continue; }
            $tick = $t['tick'] ?? -1;
            if (!is_numeric($tick) || $tick < 0 || $tick > 10000000) { $rejected++; continue; }
            $rec = $t['recommendedAction'] ?? null;
            if (!is_numeric($rec) || $rec < 0 || $rec > 63) { $rejected++; continue; }
            $play = $t['playerAction'] ?? null;
            if ($play !== null && (!is_numeric($play) || $play < 0 || $play > 63)) { $rejected++; continue; }
            $base = self::floatArr($t['baseVec'] ?? null, 512);
            if ($base === null) { $rejected++; continue; }
            $source = in_array($t['source'] ?? '', ['player', 'selfplay', 'auto'], true) ? $t['source'] : 'player';
            $sessOwner->execute([$sessionId]);
            $owner = $sessOwner->fetch();
            if ($owner !== false && $owner['client_uuid'] !== $clientUuid) { $rejected++; continue; }
            $o = is_array($t['outcomes'] ?? null) ? $t['outcomes'] : [];
            $terminal = self::num($t['terminal'] ?? null, -1.5, 1.5);
            $sessUpsert->execute([
                $sessionId, $clientUuid, $userId, (int) ($t['gameV'] ?? 0),
                is_string($t['scenario'] ?? null) ? substr($t['scenario'], 0, 64) : null,
                $terminal,
            ]);
            $payload = json_encode([
                'baseVec' => $base,
                'mask' => self::floatArr($t['mask'] ?? null, 64),
                'scoutPolicy' => self::floatArr($t['scoutPolicy'] ?? null, 64),
                'strategistPolicy' => self::floatArr($t['strategistPolicy'] ?? null, 64),
                'mctsVisits' => self::floatArr($t['mctsVisits'] ?? null, 64),
                'routerWeights' => is_array($t['routerWeights'] ?? null) ? $t['routerWeights'] : null,
                'reactionMs' => self::num($t['reactionMs'] ?? null, 0, 3600000),
                'skillBucket' => is_string($t['skillBucket'] ?? null) ? substr($t['skillBucket'], 0, 16) : null,
                'modelVersions' => is_array($t['modelVersions'] ?? null) ? $t['modelVersions'] : null,
                'ts' => self::num($t['ts'] ?? null, 0, 4102444800000),
            ]);
            $ok = $ins->execute([
                strtolower($tupleId), $sessionId, $clientUuid,
                (int) ($t['schemaV'] ?? 0), (int) ($t['actionV'] ?? 0),
                (int) sprintf('%u', (int) ($t['stateHash'] ?? 0)), (int) $tick, $source,
                (int) $rec, $play === null ? null : (int) $play,
                isset($t['followedAdvisor']) && $t['followedAdvisor'] !== null ? (int) (bool) $t['followedAdvisor'] : null,
                (int) (bool) ($t['autonomous'] ?? false),
                self::num($o['now'] ?? null, -1.5, 1.5), self::num($o['m5'] ?? null, -1.5, 1.5),
                self::num($o['m30'] ?? null, -1.5, 1.5), self::num($o['session'] ?? null, -1.5, 1.5),
                $terminal,
                self::num($t['priority'] ?? 1, 0, 50.0) ?? 1.0, self::num($t['completeness'] ?? 0, 0, 1) ?? 0.0,
                self::num($t['novelty'] ?? 0, 0, 1) ?? 0.0, self::num($t['disagreement'] ?? 0, 0, 1) ?? 0.0,
                (int) (bool) ($t['confidentWrong'] ?? false),
                $payload,
            ]);
            if ($ok && $ins->rowCount() > 0) { $accepted++; } else { $duplicates++; }
        }
        if ($accepted > 0) { AzlReputation::bump($db, $clientUuid, 'tuples_today', $accepted); }
        return ['accepted' => $accepted, 'duplicates' => $duplicates, 'rejected' => $rejected, 'capped' => $capped];
    }
}
