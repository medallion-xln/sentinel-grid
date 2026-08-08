<?php
/* AzlAggregation: lazy, GET_LOCK-protected trimmed weighted FedAvg.
 * Triggered on manifest reads (no cron). One candidate pipeline per model at a
 * time. candidate = base + sum(w_i * delta_i) / sum(w_i), computed in 64KB
 * streaming chunks. w_i = sqrt(min(samples,2000)) * clamp(completeness,.1,1)
 * * clamp(trust,.1,2); with n>=5 the max- and min-norm deltas are trimmed. */
declare(strict_types=1);

final class AzlAggregation
{
    public static function maybeRun(PDO $db, string $model): ?array
    {
        $prod = AzlManifest::production($db, $model);
        if ($prod === null) { return null; }
        if (AzlManifest::candidate($db, $model) !== null) { return null; }
        $st = $db->prepare("SELECT COUNT(DISTINCT client_uuid) c FROM azl_pending_updates WHERE model=? AND base_version=? AND status='pending'");
        $st->execute([$model, (int) $prod['version']]);
        if ((int) $st->fetch()['c'] < AZL_MIN_CLIENTS_AGG) { return null; }

        $lock = 'azl_agg_' . $model;
        $st = $db->prepare('SELECT GET_LOCK(?, 0) l');
        $st->execute([$lock]);
        if ((int) $st->fetch()['l'] !== 1) { return null; }
        try {
            return self::run($db, $model, $prod);
        } catch (Throwable $e) {
            error_log('[AZL] aggregation failed: ' . $e->getMessage());
            $db->prepare('INSERT INTO azl_aggregation_runs (model, base_version, updates_used, clients_distinct, total_weight, trimmed, status, detail, created_at) VALUES (?,?,0,0,0,0,\'failed\',?,NOW())')
               ->execute([$model, (int) $prod['version'], substr($e->getMessage(), 0, 255)]);
            return ['model' => $model, 'status' => 'failed'];
        } finally {
            $db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lock]);
        }
    }
    private static function run(PDO $db, string $model, array $prod): array
    {
        $baseVersion = (int) $prod['version'];
        $st = $db->prepare("SELECT p.* FROM azl_pending_updates p JOIN (SELECT client_uuid, MAX(id) mid FROM azl_pending_updates WHERE model=? AND base_version=? AND status='pending' GROUP BY client_uuid) x ON p.id=x.mid ORDER BY p.id ASC LIMIT " . (int) AZL_MAX_UPDATES_PER_RUN);
        $st->execute([$model, $baseVersion]);
        $updates = $st->fetchAll();
        if (count($updates) < AZL_MIN_CLIENTS_AGG) { return ['model' => $model, 'status' => 'skipped']; }

        $trimmed = 0;
        if (count($updates) >= 5) {
            usort($updates, fn ($a, $b) => $a['delta_norm'] <=> $b['delta_norm']);
            array_shift($updates); array_pop($updates);
            $trimmed = 2;
        }
        $trustSt = $db->prepare('SELECT trust FROM azl_client_reputation WHERE client_uuid=?');
        $weights = []; $sumW = 0.0;
        foreach ($updates as $i => $u) {
            $trustSt->execute([$u['client_uuid']]);
            $trust = (float) ($trustSt->fetch()['trust'] ?? 1.0);
            $w = sqrt(min((int) $u['sample_count'], 2000))
               * max(0.1, min(1.0, (float) $u['completeness']))
               * max(0.1, min(2.0, $trust));
            $weights[$i] = max($w, 0.0001);
            $sumW += $weights[$i];
        }
        $base = AzlWeights::fetchPayload($db, $model, $baseVersion);
        if ($base === null) { throw new RuntimeException('base payload missing'); }
        $baseBin = (string) $base['payload'];
        $len = strlen($baseBin);
        foreach ($updates as $u) {
            if (strlen((string) $u['payload']) !== $len) { throw new RuntimeException('delta length drift'); }
        }
        $cand = '';
        for ($off = 0; $off < $len; $off += 65536) {
            $n = min(65536, $len - $off);
            $bv = unpack('g*', substr($baseBin, $off, $n));
            $count = intdiv($n, 4);
            $acc = array_fill(1, $count, 0.0);
            foreach ($updates as $i => $u) {
                $dv = unpack('g*', substr((string) $u['payload'], $off, $n));
                $w = $weights[$i];
                for ($j = 1; $j <= $count; $j++) { $acc[$j] += $w * $dv[$j]; }
            }
            $outChunk = [];
            for ($j = 1; $j <= $count; $j++) {
                $v = $bv[$j] + $acc[$j] / $sumW;
                if (!is_finite($v)) { throw new RuntimeException('non-finite candidate value'); }
                $outChunk[] = $v;
            }
            $cand .= pack('g*', ...$outChunk);
        }
        $newV = AzlWeights::createVersion($db, $model, $cand, (int) $prod['arch_version'], (int) $prod['param_count'], 'candidate', $baseVersion, 'fedavg of ' . count($updates) . ' clients');
        $ids = array_map(fn ($u) => (int) $u['id'], $updates);
        $in = implode(',', array_fill(0, count($ids), '?'));
        $db->prepare("UPDATE azl_pending_updates SET status='aggregated' WHERE id IN ($in)")->execute($ids);
        $db->prepare('INSERT INTO azl_aggregation_runs (model, base_version, candidate_version, updates_used, clients_distinct, total_weight, trimmed, status, detail, created_at) VALUES (?,?,?,?,?,?,?,\'completed\',NULL,NOW())')
           ->execute([$model, $baseVersion, $newV, count($updates), count($updates), $sumW, $trimmed]);
        return ['model' => $model, 'status' => 'completed', 'candidate' => $newV, 'clients' => count($updates)];
    }
}
