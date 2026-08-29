export const MIGRATION_041_MULTI_AI_PROVIDERS = `
ALTER TABLE ai_accounts ADD COLUMN display_name TEXT;
ALTER TABLE ai_accounts ADD COLUMN profile_dir_name TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_accounts_provider_status
  ON ai_accounts(provider_id, status);

INSERT OR IGNORE INTO ai_providers (
  id, name, type, status, priority, enabled, fallback_allowed, created_at, updated_at
) VALUES
  (
    'prov-playwright-chatgpt',
    'ChatGPT Browser',
    'PLAYWRIGHT_CHATGPT',
    'LOGIN_REQUIRED',
    3,
    0,
    1,
    '2026-08-29T00:00:00.000Z',
    '2026-08-29T00:00:00.000Z'
  ),
  (
    'prov-playwright-meta-ai',
    'Meta AI Browser',
    'PLAYWRIGHT_META_AI',
    'LOGIN_REQUIRED',
    4,
    0,
    1,
    '2026-08-29T00:00:00.000Z',
    '2026-08-29T00:00:00.000Z'
  );

INSERT OR IGNORE INTO ai_models (
  id, provider_id, model_name, display_name, capabilities, enabled, created_at, updated_at
) VALUES
  (
    'model-chatgpt-browser-default',
    'prov-playwright-chatgpt',
    'browser-default',
    'ChatGPT (Browser UI)',
    '{"streaming":false}',
    1,
    '2026-08-29T00:00:00.000Z',
    '2026-08-29T00:00:00.000Z'
  ),
  (
    'model-meta-ai-browser-default',
    'prov-playwright-meta-ai',
    'browser-default',
    'Meta AI (Browser UI)',
    '{"streaming":false}',
    1,
    '2026-08-29T00:00:00.000Z',
    '2026-08-29T00:00:00.000Z'
  );
`;
