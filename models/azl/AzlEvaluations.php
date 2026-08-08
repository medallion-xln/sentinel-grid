<?php
/* AzlEvaluations: client paired-eval report ingest with bounds + daily caps.
 * Feeds AzlManifest::evalAggregate -> promotion gates. */
declare(strict_types=1);

final class AzlEvaluations
{
    public static function ingest(PDO $db, string $clientUuid, ?int $userId, array $b): array
    {
        $model = (string) ($b['model'] ?? '');
        if (!array_key_exists($model, AZL_MODELS)) { return ['ok' => false, 'code' => 'unknown-model']; }
        $candV = (int) ($b['candidateVersion'] ?? 0);
        $st = $db->prepare("SELECT id FROM azl_model_versions WHERE model=? AND version=? AND status IN ('candidate','canary')");
        $st->execute([$model, $candV]);
        if ($st->fetch() === false) { return ['ok' => false, 'code' => 'not-a-candidate']; }
        $rep = AzlReputation::touch($db, $clientUuid, $userId);
        if ((int) ($rep['evals_today'] ?? 0) >= AZL_EVALS_PER_CLIENT_PER_DAY) { return ['ok' => false, 'code' => 'daily-cap']; }
        $games = (int) ($b['games'] ?? 0);
        $wins = (int) ($b['wins'] ?? 0);
        $losses = (int) ($b['losses'] ?? 0);
        $draws = (int) ($b['draws'] ?? 0);
        if ($games < 1 || $games > 200 || $wins < 0 || $losses < 0 || $draws < 0 || ($wins + $losses + $draws) !== $games) {
            return ['ok' => false, 'code' => 'bad-counts'];
        }
        $cm = (float) ($b['candMean'] ?? 0);
        $pm = (float) ($b['prodMean'] ?? 0);
        if (!is_finite($cm) || !is_finite($pm) || abs($cm) > 1.5 || abs($pm) > 1.5) { return ['ok' => false, 'code' => 'bad-means']; }
        $db->prepare('INSERT INTO azl_evaluations (model, candidate_version, base_version, client_uuid, games, wins, losses, draws, cand_mean, prod_mean, device_tier, scenario_hash, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW())')
           ->execute([
               $model, $candV, (int) ($b['baseVersion'] ?? 0), $clientUuid, $games, $wins, $losses, $draws, $cm, $pm,
               in_array($b['deviceTier'] ?? '', ['low', 'mid', 'high'], true) ? $b['deviceTier'] : null,
               is_string($b['scenarioHash'] ?? null) ? substr($b['scenarioHash'], 0, 32) : null,
           ]);
        AzlReputation::bump($db, $clientUuid, 'evals_today');
        return ['ok' => true, 'code' => 'recorded'];
    }
}
