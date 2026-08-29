import { describe, expect, it } from 'vitest';
import { parseSettingsTab } from '../../../src/renderer/components/settings/settings-tabs';

describe('parseSettingsTab', () => {
  it('defaults to general', () => {
    expect(parseSettingsTab(null)).toBe('general');
    expect(parseSettingsTab('')).toBe('general');
    expect(parseSettingsTab('unknown')).toBe('general');
  });

  it('accepts canonical tab ids', () => {
    expect(parseSettingsTab('general')).toBe('general');
    expect(parseSettingsTab('language')).toBe('language');
    expect(parseSettingsTab('translation')).toBe('translation');
    expect(parseSettingsTab('ai')).toBe('ai');
    expect(parseSettingsTab('storage')).toBe('storage');
    expect(parseSettingsTab('advanced')).toBe('advanced');
  });

  it('maps legacy tab ids', () => {
    expect(parseSettingsTab('appearance')).toBe('general');
    expect(parseSettingsTab('export')).toBe('storage');
    expect(parseSettingsTab('aiProviders')).toBe('ai');
    expect(parseSettingsTab('aiDiagnostics')).toBe('advanced');
    expect(parseSettingsTab('googleAi')).toBe('ai');
  });
});
