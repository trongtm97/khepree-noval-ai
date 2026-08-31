import type { AiPreference } from './ai-preference';
import { isAiPreference, preferenceFromProviderId } from './ai-preference';

/** Fields stored in project_settings.style_config JSON. */
export interface ProjectStyleConfig {
  preset?: string;
  style?: string;
  retainRawResponses?: boolean;
  /** When true, Playwright translate uses NotebookLM (notebook_assisted pack mode). */
  preferNotebookPack?: boolean;
  /** Project override for primary translation AI provider; omit to inherit app default. */
  primaryProviderId?: string | null;
  /** Project override for user-facing AI preference; omit to inherit app default. */
  aiPreference?: string | null;
  [key: string]: unknown;
}

export function parseProjectStyleConfig(
  styleConfigJson: string | null | undefined,
): ProjectStyleConfig {
  if (!styleConfigJson?.trim()) return {};
  try {
    const parsed = JSON.parse(styleConfigJson) as ProjectStyleConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readPreferNotebookPack(styleConfigJson: string | null | undefined): boolean {
  return parseProjectStyleConfig(styleConfigJson).preferNotebookPack === true;
}

export function mergePreferNotebookPack(
  styleConfigJson: string | null | undefined,
  preferNotebookPack: boolean,
): string {
  const base = parseProjectStyleConfig(styleConfigJson);
  if (preferNotebookPack) {
    base.preferNotebookPack = true;
  } else {
    delete base.preferNotebookPack;
  }
  return JSON.stringify(base);
}

export function readProjectPrimaryProviderOverride(
  styleConfigJson: string | null | undefined,
): string | null {
  const cfg = parseProjectStyleConfig(styleConfigJson);
  if (!Object.prototype.hasOwnProperty.call(cfg, 'primaryProviderId')) {
    return null;
  }
  const value = cfg.primaryProviderId;
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function readProjectAiPreferenceOverride(
  styleConfigJson: string | null | undefined,
): AiPreference | null {
  const cfg = parseProjectStyleConfig(styleConfigJson);
  if (cfg.aiPreference && isAiPreference(cfg.aiPreference)) {
    return cfg.aiPreference;
  }
  const legacy = readProjectPrimaryProviderOverride(styleConfigJson);
  if (legacy) {
    const mapped = preferenceFromProviderId(legacy);
    if (mapped) return mapped;
  }
  return null;
}

export function projectUsesGlobalPrimary(
  styleConfigJson: string | null | undefined,
): boolean {
  const cfg = parseProjectStyleConfig(styleConfigJson);
  return (
    !Object.prototype.hasOwnProperty.call(cfg, 'aiPreference') &&
    !Object.prototype.hasOwnProperty.call(cfg, 'primaryProviderId')
  );
}

export function mergeProjectPrimaryProvider(
  styleConfigJson: string | null | undefined,
  input: { useGlobalPrimary: boolean; primaryProviderId?: string | null },
): string {
  const base = parseProjectStyleConfig(styleConfigJson);
  if (input.useGlobalPrimary) {
    delete base.primaryProviderId;
    delete base.aiPreference;
  } else if (input.primaryProviderId) {
    base.primaryProviderId = input.primaryProviderId;
    const mapped = preferenceFromProviderId(input.primaryProviderId);
    if (mapped) {
      base.aiPreference = mapped;
    }
  } else {
    delete base.primaryProviderId;
    delete base.aiPreference;
  }
  return JSON.stringify(base);
}

export function mergeProjectAiPreference(
  styleConfigJson: string | null | undefined,
  input: { useGlobalPreference: boolean; aiPreference?: AiPreference | null },
): string {
  const base = parseProjectStyleConfig(styleConfigJson);
  if (input.useGlobalPreference) {
    delete base.aiPreference;
    delete base.primaryProviderId;
  } else if (input.aiPreference) {
    base.aiPreference = input.aiPreference;
    delete base.primaryProviderId;
  } else {
    delete base.aiPreference;
    delete base.primaryProviderId;
  }
  return JSON.stringify(base);
}
