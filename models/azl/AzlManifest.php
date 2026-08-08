<?php
/* AzlManifest: model version lifecycle + serving resolution.
 * Statuses: production | candidate | canary | rejected | archived | rolled_back.
 * tickLifecycle() runs lazily on manifest reads (no cron on shared hosting):
 *   candidate --evals pass gate--> canary --min hours + still passing--> production
 *   candidate/canary --evals fail hard--> rejected
 * Old production becomes archived (rollback target). */
declare(strict_types=1);

final class AzlManifest
{
    public static function production(PDO $db, string $model): ?array
    {
        $st = $db->prepare("SELECT * FROM azl_model_versions WHERE model=? AND status='production' ORDER BY version DESC LIMIT 1");
        $st->execute([$model]);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }
    public static function candidate(PDO $db, string $model): ?array
    {
        $st = $db->prepare("SELECT * FROM azl_model_versions WHERE model=? AND status IN ('candidate','canary') ORDER BY version DESC LIMIT 1");
        $st->execute([$model]);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }
    public static function evalAggregate(PDO $db, string $model, int $candidateVersion): array
    {
        $st = $db->prepare('SELECT COALESCE(SUM(games),0) g, COALESCE(SUM(wins),0) w, COALESCE(SUM(losses),0) l, COALESCE(SUM(draws),0) d FROM azl_evaluations WHERE model=? AND candidate_version=?');
        $st->execute([$model, $candidateVersion]);
        $r = $st->fetch();
        $decisive = (int) $r['w'] + (int) $r['l'];
        $wr = $decisive > 0 ? ((int) $r['w']) / $decisive : 0.5;
        return [
            'games' => (int) $r['g'], 'wins' => (int) $r['w'], 'losses' => (int) $r['l'], 'draws' => (int) $r['d'],
            'winRate' => $wr, 'lcb' => self::wilsonLcb((int) $r['w'], $decisive),
        ];
    }
    public static function wilsonLcb(int $wins, int $n, float $z = 1.96): float
    {
        if ($n <= 0) { return 0.0; }
        $p = $wins / $n; $z2 = $z * $z;
        $center = $p + $z2 / (2 * $n);
        $rad = $z * sqrt(($p * (1 - $p) + $z2 / (4 * $n)) / $n);
        return max(0.0, ($center - $rad) / (1 + $z2 / $n));
    }
    public static function tickLifecycle(PDO $db, string $model): void
    {
        $cand = self::candidate($db, $model);
        if ($cand === null) { return; }
        $ev = self::evalAggregate($db, $model, (int) $cand['version']);
        $failHard = $ev['games'] >= AZL_PROMOTE_MIN_GAMES * 2 && $ev['lcb'] < 0.45;
        $passes = $ev['games'] >= AZL_PROMOTE_MIN_GAMES && $ev['winRate'] > AZL_PROMOTE_WINRATE && $ev['lcb'] > AZL_PROMOTE_LCB;
        if ($cand['status'] === 'candidate') {
            if ($failHard) { self::setStatus($db, (int) $cand['id'], 'rejected'); return; }
            if ($passes) {
                $db->prepare("UPDATE azl_model_versions SET status='canary', promoted_at=NOW(), updated_at=NOW() WHERE id=?")->execute([(int) $cand['id']]);
            }
            return;
        }
        /* canary */
        if ($failHard || ($ev['games'] >= AZL_PROMOTE_MIN_GAMES && $ev['lcb'] <= AZL_PROMOTE_LCB && $ev['winRate'] <= 0.5)) {
            self::setStatus($db, (int) $cand['id'], 'rejected');
            $db->prepare('DELETE FROM azl_canary_assignments WHERE model=? AND candidate_version=?')->execute([$model, (int) $cand['version']]);
            return;
        }
        $st = $db->prepare('SELECT TIMESTAMPDIFF(HOUR, promoted_at, NOW()) h FROM azl_model_versions WHERE id=?');
        $st->execute([(int) $cand['id']]);
        $h = (int) ($st->fetch()['h'] ?? 0);
        if ($h >= AZL_CANARY_MIN_HOURS && $passes) {
            $prod = self::production($db, $model);
            $db->beginTransaction();
            try {
                if ($prod !== null) {
                    $db->prepare("UPDATE azl_model_versions SET status='archived', updated_at=NOW() WHERE id=?")->execute([(int) $prod['id']]);
                }
                $db->prepare("UPDATE azl_model_versions SET status='production', promoted_at=NOW(), updated_at=NOW() WHERE id=?")->execute([(int) $cand['id']]);
                $db->commit();
            } catch (Throwable $e) {
                $db->rollBack();
                throw $e;
            }
            $db->prepare('DELETE FROM azl_canary_assignments WHERE model=? AND candidate_version=?')->execute([$model, (int) $cand['version']]);
        }
    }
    private static function setStatus(PDO $db, int $id, string $status): void
    {
        $db->prepare('UPDATE azl_model_versions SET status=?, updated_at=NOW() WHERE id=?')->execute([$status, $id]);
    }
    public static function canaryServe(PDO $db, string $model, array $cand, string $clientUuid): bool
    {
        $bucket = (int) (sprintf('%u', crc32($clientUuid . '|' . $model . '|' . $cand['version'])) % 100);
        $in = $bucket < AZL_CANARY_PCT;
        if ($in) {
            $db->prepare('INSERT IGNORE INTO azl_canary_assignments (model, candidate_version, client_uuid, assigned, created_at) VALUES (?,?,?,1,NOW())')
               ->execute([$model, (int) $cand['version'], $clientUuid]);
        }
        return $in;
    }
    /* Full manifest for a client. Also runs the lazy lifecycle + aggregation. */
    public static function build(PDO $db, string $clientUuid): array
    {
        $models = [];
        $agg = null;
        foreach (array_keys(AZL_MODELS) as $model) {
            $agg = AzlAggregation::maybeRun($db, $model) ?? $agg;
            self::tickLifecycle($db, $model);
            $prod = self::production($db, $model);
            $cand = self::candidate($db, $model);
            $serving = $prod;
            $servingStatus = 'production';
            if ($cand !== null && $cand['status'] === 'canary' && $prod !== null && self::canaryServe($db, $model, $cand, $clientUuid)) {
                $serving = $cand;
                $servingStatus = 'canary';
            }
            $models[$model] = [
                'serving' => $serving === null ? null : [
                    'version' => (int) $serving['version'], 'archVersion' => (int) $serving['arch_version'],
                    'paramCount' => (int) $serving['param_count'], 'crc32' => (int) $serving['checksum_crc32'],
                    'status' => $servingStatus,
                ],
                'candidate' => ($cand !== null && ($prod === null || (int) $cand['version'] !== (int) ($serving['version'] ?? 0))) ? [
                    'version' => (int) $cand['version'], 'status' => $cand['status'],
                ] : null,
            ];
        }
        $st = $db->query("SELECT COUNT(*) c FROM azl_replay_tuples WHERE completeness >= 0.75");
        $validated = (int) ($st->fetch()['c'] ?? 0);
        return [
            'models' => $models,
            'stats' => ['validatedSamples' => $validated],
            'aggregation' => $agg,
            'promotion' => ['minGames' => AZL_PROMOTE_MIN_GAMES, 'winRateGate' => AZL_PROMOTE_WINRATE, 'lcbGate' => AZL_PROMOTE_LCB, 'canaryPct' => AZL_CANARY_PCT, 'canaryMinHours' => AZL_CANARY_MIN_HOURS],
            'serverTime' => gmdate('c'),
        ];
    }
    public static function rollback(PDO $db, string $model): array
    {
        $prod = self::production($db, $model);
        if ($prod === null) { return ['ok' => false, 'error' => 'no-production']; }
        $st = $db->prepare("SELECT * FROM azl_model_versions WHERE model=? AND status='archived' AND version < ? ORDER BY version DESC LIMIT 1");
        $st->execute([$model, (int) $prod['version']]);
        $prev = $st->fetch();
        if ($prev === false) { return ['ok' => false, 'error' => 'no-rollback-target']; }
        $db->beginTransaction();
        try {
            $db->prepare("UPDATE azl_model_versions SET status='rolled_back', updated_at=NOW() WHERE id=?")->execute([(int) $prod['id']]);
            $db->prepare("UPDATE azl_model_versions SET status='production', updated_at=NOW() WHERE id=?")->execute([(int) $prev['id']]);
            $db->commit();
        } catch (Throwable $e) {
            $db->rollBack();
            return ['ok' => false, 'error' => 'rollback-failed'];
        }
        return ['ok' => true, 'production' => (int) $prev['version'], 'rolledBack' => (int) $prod['version']];
    }
}
