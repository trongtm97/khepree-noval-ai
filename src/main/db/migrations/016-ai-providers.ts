export const MIGRATION_016_AI_PROVIDERS = `
CREATE TABLE IF NOT EXISTS ai_providers (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'DISABLED',
  priority          INTEGER NOT NULL DEFAULT 100,
  enabled           INTEGER NOT NULL DEFAULT 0,
  fallback_allowed  INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON ai_providers(priority ASC);
CREATE INDEX IF NOT EXISTS idx_ai_providers_type ON ai_providers(type);

CREATE TABLE IF NOT EXISTS ai_accounts (
  id                  TEXT PRIMARY KEY,
  provider_id         TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  google_account_id   TEXT REFERENCES google_accounts(id) ON DELETE SET NULL,
  google_email        TEXT,
  session_location    TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'LOGIN_REQUIRED',
  last_used_at        TEXT,
  last_error          TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_accounts_provider ON ai_accounts(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_accounts_status ON ai_accounts(status);
CREATE INDEX IF NOT EXISTS idx_ai_accounts_google ON ai_accounts(google_account_id);

CREATE TABLE IF NOT EXISTS ai_models (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  capabilities    TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (provider_id, model_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_models_provider ON ai_models(provider_id);

-- Seed providers (Web API higher priority by default; Official disabled)
INSERT OR IGNORE INTO ai_providers (
  id, name, type, status, priority, enabled, fallback_allowed, created_at, updated_at
) VALUES
  (
    'prov-gemini-web-api',
    'Gemini Web API',
    'GEMINI_WEB_API',
    'LOGIN_REQUIRED',
    1,
    1,
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  ),
  (
    'prov-playwright-gemini',
    'Gemini Browser',
    'PLAYWRIGHT_GEMINI',
    'READY',
    2,
    1,
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  ),
  (
    'prov-gemini-official',
    'Gemini Official API',
    'GEMINI_OFFICIAL',
    'DISABLED',
    3,
    0,
    0,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  );

INSERT OR IGNORE INTO ai_models (
  id, provider_id, model_name, display_name, capabilities, enabled, created_at, updated_at
) VALUES
  (
    'model-webapi-flash',
    'prov-gemini-web-api',
    'gemini-flash',
    'Gemini Flash',
    '{"streaming":true,"files":true}',
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  ),
  (
    'model-webapi-pro',
    'prov-gemini-web-api',
    'gemini-pro',
    'Gemini Pro',
    '{"streaming":true,"files":true,"thinking":true}',
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  ),
  (
    'model-browser-default',
    'prov-playwright-gemini',
    'browser-default',
    'Gemini (Browser UI)',
    '{"streaming":false,"notebook":true}',
    1,
    '2026-08-24T00:00:00.000Z',
    '2026-08-24T00:00:00.000Z'
  );

INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES
  ('ai.fallback.enabled', '1', '2026-08-24T00:00:00.000Z'),
  ('ai.fallback.on_statuses', '["RATE_LIMIT","SERVICE_UNAVAILABLE"]', '2026-08-24T00:00:00.000Z');
`;
