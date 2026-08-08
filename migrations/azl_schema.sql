-- AZL schema for medallio_xln. Run once in phpMyAdmin.
-- InnoDB / utf8mb4. No JSON columns or CHECK constraints (MariaDB-safe).

CREATE TABLE IF NOT EXISTS azl_schema_versions (
  component VARCHAR(32) NOT NULL PRIMARY KEY,
  version INT NOT NULL,
  applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO azl_schema_versions (component, version, applied_at)
VALUES ('azl', 1, NOW())
ON DUPLICATE KEY UPDATE version=1;

CREATE TABLE IF NOT EXISTS azl_model_versions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  version INT NOT NULL,
  arch_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL,
  parent_version INT NULL,
  param_count INT NOT NULL,
  checksum_crc32 BIGINT UNSIGNED NOT NULL DEFAULT 0,
  promoted_at DATETIME NULL,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_model_version (model, version),
  KEY idx_model_status (model, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_weight_payloads (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  version INT NOT NULL,
  dtype VARCHAR(4) NOT NULL DEFAULT 'f32',
  byte_len INT NOT NULL,
  crc32 BIGINT UNSIGNED NOT NULL,
  payload LONGBLOB NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_payload (model, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_pending_updates (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  base_version INT NOT NULL,
  client_uuid CHAR(36) NOT NULL,
  idempotency_key CHAR(36) NOT NULL,
  sample_count INT NOT NULL DEFAULT 0,
  completeness FLOAT NOT NULL DEFAULT 0,
  delta_norm FLOAT NOT NULL DEFAULT 0,
  byte_len INT NOT NULL,
  payload LONGBLOB NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  reject_reason VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_idem (idempotency_key),
  KEY idx_model_status (model, status, base_version),
  KEY idx_client (client_uuid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_replay_sessions (
  session_id CHAR(36) NOT NULL PRIMARY KEY,
  client_uuid CHAR(36) NOT NULL,
  user_id INT NULL,
  game_v INT NOT NULL DEFAULT 0,
  scenario VARCHAR(64) NULL,
  started_at DATETIME NOT NULL,
  ended_at DATETIME NULL,
  terminal_value FLOAT NULL,
  tuple_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  KEY idx_client (client_uuid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_replay_tuples (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tuple_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  client_uuid CHAR(36) NOT NULL,
  schema_v INT NOT NULL DEFAULT 0,
  action_v INT NOT NULL DEFAULT 0,
  state_hash BIGINT UNSIGNED NOT NULL DEFAULT 0,
  tick INT NOT NULL,
  source VARCHAR(12) NOT NULL DEFAULT 'player',
  recommended_action SMALLINT NOT NULL,
  player_action SMALLINT NULL,
  followed TINYINT NULL,
  autonomous TINYINT NOT NULL DEFAULT 0,
  outcome_now FLOAT NULL,
  outcome_m5 FLOAT NULL,
  outcome_m30 FLOAT NULL,
  outcome_session FLOAT NULL,
  terminal FLOAT NULL,
  priority FLOAT NOT NULL DEFAULT 1,
  completeness FLOAT NOT NULL DEFAULT 0,
  novelty FLOAT NOT NULL DEFAULT 0,
  disagreement FLOAT NOT NULL DEFAULT 0,
  confident_wrong TINYINT NOT NULL DEFAULT 0,
  payload LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_tuple (tuple_id),
  KEY idx_session_tick (session_id, tick),
  KEY idx_client (client_uuid, created_at),
  KEY idx_hash (state_hash),
  KEY idx_completeness (completeness)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_evaluations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  candidate_version INT NOT NULL,
  base_version INT NOT NULL DEFAULT 0,
  client_uuid CHAR(36) NOT NULL,
  games INT NOT NULL,
  wins INT NOT NULL,
  losses INT NOT NULL,
  draws INT NOT NULL,
  cand_mean FLOAT NULL,
  prod_mean FLOAT NULL,
  device_tier VARCHAR(8) NULL,
  scenario_hash VARCHAR(32) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_cand (model, candidate_version),
  KEY idx_client (client_uuid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_client_reputation (
  client_uuid CHAR(36) NOT NULL PRIMARY KEY,
  user_id INT NULL,
  trust FLOAT NOT NULL DEFAULT 1.0,
  tuples_today INT NOT NULL DEFAULT 0,
  updates_today INT NOT NULL DEFAULT 0,
  evals_today INT NOT NULL DEFAULT 0,
  tuples_total BIGINT NOT NULL DEFAULT 0,
  updates_total INT NOT NULL DEFAULT 0,
  last_upload_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  day_key DATE NOT NULL,
  flags VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_aggregation_runs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  base_version INT NOT NULL,
  candidate_version INT NULL,
  updates_used INT NOT NULL DEFAULT 0,
  clients_distinct INT NOT NULL DEFAULT 0,
  total_weight FLOAT NOT NULL DEFAULT 0,
  trimmed INT NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL,
  detail VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_model (model, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS azl_canary_assignments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  model VARCHAR(24) NOT NULL,
  candidate_version INT NOT NULL,
  client_uuid CHAR(36) NOT NULL,
  assigned TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uq_canary (model, candidate_version, client_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
