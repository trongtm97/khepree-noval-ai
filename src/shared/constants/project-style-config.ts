/** Fields stored in project_settings.style_config JSON. */
export interface ProjectStyleConfig {
  preset?: string;
  style?: string;
  retainRawResponses?: boolean;
  /** When true, Playwright translate uses NotebookLM (notebook_assisted pack mode). */
  preferNotebookPack?: boolean;
  /** Project override for primary translation AI provider; omit to inherit app default. */
  primaryProviderId?: string | null;
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

export function projectUsesGlobalPrimary(
  styleConfigJson: string | null | undefined,
): boolean {
  return !Object.prototype.hasOwnProperty.call(
    parseProjectStyleConfig(styleConfigJson),
    'primaryProviderId',
  );
}

export function mergeProjectPrimaryProvider(
  styleConfigJson: string | null | undefined,
  input: { useGlobalPrimary: boolean; primaryProviderId?: string | null },
): string {
  const base = parseProjectStyleConfig(styleConfigJson);
  if (input.useGlobalPrimary) {
    delete base.primaryProviderId;
  } else if (input.primaryProviderId) {
    base.primaryProviderId = input.primaryProviderId;
  } else {
    delete base.primaryProviderId;
  }
  return JSON.stringify(base);
}
