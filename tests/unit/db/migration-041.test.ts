import { describe, expect, it } from 'vitest';
import { MIGRATION_041_MULTI_AI_PROVIDERS } from '../../../src/main/db/migrations/041-multi-ai-providers';

describe('migration 041 multi ai providers', () => {
  it('seeds ChatGPT and Meta AI providers', () => {
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('prov-playwright-chatgpt');
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('PLAYWRIGHT_CHATGPT');
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('prov-playwright-meta-ai');
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('PLAYWRIGHT_META_AI');
  });

  it('extends ai_accounts with browser profile columns', () => {
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('display_name TEXT');
    expect(MIGRATION_041_MULTI_AI_PROVIDERS).toContain('profile_dir_name TEXT');
  });
});
