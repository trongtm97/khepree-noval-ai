/** Automation diagnostics — provider identity + versions (bump when selectors change). */

export const AUTOMATION_PROVIDERS = ['google-gemini', 'google-notebook'] as const;
export type AutomationProviderId = (typeof AUTOMATION_PROVIDERS)[number];

export const PROVIDER_DIAGNOSTICS_META: Record<
  AutomationProviderId,
  { providerVersion: string; selectorRegistryVersion: string; label: string }
> = {
  'google-gemini': {
    providerVersion: '1.0.0',
    selectorRegistryVersion: '1.0.0',
    label: 'Google Gemini',
  },
  'google-notebook': {
    providerVersion: '1.0.0',
    selectorRegistryVersion: '1.0.0',
    label: 'Google NotebookLM',
  },
};

/** app_meta key: last successful provider run ISO timestamp */
export function providerLastSuccessMetaKey(providerId: AutomationProviderId): string {
  return `automation.provider.${providerId}.lastSuccessAt`;
}

export const SELECTOR_OVERRIDE_FILENAME = 'selector-overrides.json';
export const SELECTOR_OVERRIDE_SCHEMA_VERSION = 1;

export const DIAGNOSTICS_EXPORT_EXCLUDE = [
  'cookies',
  'oauth',
  'token',
  'localStorage',
  'sessionStorage',
  'password',
  'credential',
] as const;
