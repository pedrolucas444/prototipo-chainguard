-- ChainGuard: Entities (camada Dados).
-- Datas em ISO-8601 UTC (texto). Endereços sempre em minúsculas.

CREATE TABLE IF NOT EXISTS users (
  id                 INTEGER PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name               TEXT NOT NULL,
  password_hash      TEXT NOT NULL,
  role               TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('admin', 'customer')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  totp_secret_enc    TEXT,
  totp_pending_enc   TEXT,
  totp_enabled       INTEGER NOT NULL DEFAULT 0,
  totp_last_step     INTEGER NOT NULL DEFAULT -1,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at      TEXT
);

-- Sessões e desafios de 2FA (guardamos só o hash do token).
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'session' CHECK (kind IN ('session', 'challenge')),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  used_at    TEXT
);

CREATE TABLE IF NOT EXISTS wallets (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address           TEXT NOT NULL,
  label             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'monitored' CHECK (status IN ('monitored', 'paused')),
  is_contract       INTEGER NOT NULL DEFAULT 0,
  onchain_verified  INTEGER NOT NULL DEFAULT 0,
  last_synced_block INTEGER,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, address)
);
CREATE INDEX IF NOT EXISTS idx_wallets_address ON wallets(address);

CREATE TABLE IF NOT EXISTS transactions (
  id                INTEGER PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id         INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  dedup_key         TEXT NOT NULL,
  hash              TEXT NOT NULL,
  direction         TEXT NOT NULL CHECK (direction IN ('in', 'out', 'self')),
  from_address      TEXT NOT NULL,
  to_address        TEXT,
  counterparty      TEXT,
  value             REAL NOT NULL DEFAULT 0,
  value_raw         TEXT,
  asset             TEXT NOT NULL DEFAULT 'ETH',
  category          TEXT NOT NULL DEFAULT 'external',
  contract_address  TEXT,
  input_data        TEXT,
  block_number      INTEGER,
  occurred_at       TEXT NOT NULL,
  source            TEXT NOT NULL CHECK (source IN ('alchemy', 'sync')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'analyzed', 'failed', 'removed')),
  risk_level        TEXT CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score        INTEGER,
  risk_factors      TEXT,
  risk_notes        TEXT,
  whitelisted       INTEGER NOT NULL DEFAULT 0,
  analyzed_at       TEXT,
  alert_seen        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (wallet_id, dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_tx_user_time ON transactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON transactions(hash);

CREATE TABLE IF NOT EXISTS whitelist (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, address)
);

-- Envios feitos pelo Send Modal (o ChainGuard só registra; quem assina é a carteira).
CREATE TABLE IF NOT EXISTS sends (
  id                   INTEGER PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hash                 TEXT NOT NULL,
  from_address         TEXT NOT NULL,
  to_address           TEXT NOT NULL,
  amount               REAL NOT NULL,
  asset                TEXT NOT NULL,
  risk_level           TEXT,
  whitelisted          INTEGER NOT NULL DEFAULT 0,
  confirmed_high_risk  INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_number         INTEGER,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT,
  UNIQUE (user_id, hash)
);

-- Base de endereços maliciosos (lacuna apontada no documento: "Endereço Malicioso").
CREATE TABLE IF NOT EXISTS malicious_addresses (
  id          INTEGER PRIMARY KEY,
  address     TEXT NOT NULL UNIQUE,
  label       TEXT,
  category    TEXT NOT NULL DEFAULT 'scam',
  source      TEXT NOT NULL DEFAULT 'manual',
  source_id   INTEGER REFERENCES list_sources(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS list_sources (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL UNIQUE,
  category        TEXT NOT NULL DEFAULT 'scam',
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_sync_at    TEXT,
  last_status     TEXT,
  last_count      INTEGER
);

-- Configurações (pesos e limiares do motor de risco etc.).
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Tabela de taxas estática e versionada.
CREATE TABLE IF NOT EXISTS fee_tables (
  id          INTEGER PRIMARY KEY,
  version     INTEGER NOT NULL UNIQUE,
  data        TEXT NOT NULL,
  note        TEXT,
  active      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS exchanges (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  note      TEXT
);

CREATE TABLE IF NOT EXISTS assets (
  symbol            TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  decimals          INTEGER NOT NULL,
  contract_address  TEXT,
  enabled           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS snapshots (
  id           INTEGER PRIMARY KEY,
  exchange_id  TEXT NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
  base         TEXT NOT NULL,
  quote        TEXT NOT NULL,
  bids         TEXT NOT NULL,
  asks         TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_latest ON snapshots(exchange_id, base, quote, fetched_at DESC);

CREATE TABLE IF NOT EXISTS simulations (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_asset  TEXT NOT NULL,
  to_asset    TEXT NOT NULL,
  amount      REAL NOT NULL,
  result      TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY,
  actor_id     INTEGER,
  actor_email  TEXT,
  action       TEXT NOT NULL,
  entity       TEXT NOT NULL,
  entity_id    TEXT,
  details      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Fila de mensagens persistente (com fila de mensagens mortas: status = 'dead').
CREATE TABLE IF NOT EXISTS queue_messages (
  id            INTEGER PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'dead')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 5,
  available_at  INTEGER NOT NULL,
  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_next ON queue_messages(status, available_at);
