export const MIGRATION_003_SECURITY = `
-- Generic encrypted secrets (OAuth tokens, app tokens). Never plaintext.
CREATE TABLE IF NOT EXISTS secrets (
  id              TEXT PRIMARY KEY,
  secret_key      TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL,
  owner_type      TEXT,
  owner_id        TEXT,
  encrypted_blob  BLOB NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_secrets_owner ON secrets(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_secrets_kind ON secrets(kind);

-- Security / compliance audit trail (no secrets in payload)
CREATE TABLE IF NOT EXISTS audit_events (
  id           TEXT PRIMARY KEY,
  event_type   TEXT NOT NULL,
  actor        TEXT NOT NULL DEFAULT 'system',
  resource_type TEXT,
  resource_id  TEXT,
  summary      TEXT NOT NULL,
  metadata     TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);

-- Diagnostic content logging preference (default off for sensitive AI payloads)
INSERT OR IGNORE INTO app_meta (key, value, updated_at)
VALUES ('security.diagnostic_content_logging', 'false', datetime('now'));
`;
