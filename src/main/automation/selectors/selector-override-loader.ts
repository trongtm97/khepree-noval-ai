import fs from 'node:fs';
import path from 'node:path';
import {
  SELECTOR_OVERRIDE_FILENAME,
  type AutomationProviderId,
} from '@shared/constants/diagnostics';
import {
  SelectorOverrideFileSchema,
  type SelectorOverrideFile,
  type SelectorStrategyOverride,
  type SelectorOverrideMode,
} from '@shared/schemas/selector-override';
import { pathsService } from '../../services/paths-service';

let cached: SelectorOverrideFile | null = null;
let cachedPath: string | null = null;

export function resetSelectorOverrideCacheForTests(): void {
  cached = null;
  cachedPath = null;
}

export function defaultSelectorOverridesPath(): string {
  return path.join(pathsService.getPath('data'), SELECTOR_OVERRIDE_FILENAME);
}

export function emptySelectorOverrideFile(): SelectorOverrideFile {
  return { version: 1, providers: {} };
}

export function loadSelectorOverridesFromDisk(
  filePath?: string,
): { file: SelectorOverrideFile; filePath: string; errors: string[] } {
  const target = filePath ?? defaultSelectorOverridesPath();
  if (!fs.existsSync(target)) {
    const empty = emptySelectorOverrideFile();
    cached = empty;
    cachedPath = target;
    return { file: empty, filePath: target, errors: [] };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(target, 'utf8')) as unknown;
    const parsed = SelectorOverrideFileSchema.safeParse(raw);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      return {
        file: emptySelectorOverrideFile(),
        filePath: target,
        errors,
      };
    }
    cached = parsed.data;
    cachedPath = target;
    return { file: parsed.data, filePath: target, errors: [] };
  } catch (error) {
    return {
      file: emptySelectorOverrideFile(),
      filePath: target,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function getCachedSelectorOverrides(): SelectorOverrideFile {
  if (cached) {
    return cached;
  }
  // Avoid forcing Electron app paths during unit tests / early boot
  if (!pathsService.isInitialized()) {
    return emptySelectorOverrideFile();
  }
  return loadSelectorOverridesFromDisk().file;
}

export function saveSelectorOverridesToDisk(
  file: SelectorOverrideFile,
  filePath?: string,
): string {
  const target = filePath ?? defaultSelectorOverridesPath();
  const validated = SelectorOverrideFileSchema.parse({
    ...file,
    updatedAt: new Date().toISOString(),
  });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  cached = validated;
  cachedPath = target;
  return target;
}

export function reloadSelectorOverrides(): {
  file: SelectorOverrideFile;
  filePath: string;
  errors: string[];
  overrideCount: number;
} {
  const loaded = loadSelectorOverridesFromDisk(cachedPath ?? undefined);
  return {
    ...loaded,
    overrideCount: countOverrides(loaded.file),
  };
}

export function countOverrides(file: SelectorOverrideFile): number {
  let n = 0;
  for (const provider of Object.values(file.providers)) {
    n += Object.keys(provider.selectors).length;
  }
  return n;
}

export function getOverrideForSelector(
  providerId: AutomationProviderId,
  selectorKey: string,
): { strategies: SelectorStrategyOverride[]; mode: SelectorOverrideMode } | null {
  const file = getCachedSelectorOverrides();
  const provider = Object.prototype.hasOwnProperty.call(file.providers, providerId)
    ? file.providers[providerId]
    : undefined;
  if (!provider) return null;
  const entry = Object.prototype.hasOwnProperty.call(provider.selectors, selectorKey)
    ? provider.selectors[selectorKey]
    : undefined;
  if (!entry) return null;
  return { strategies: entry.strategies, mode: entry.mode };
}

export function upsertSelectorOverride(input: {
  providerId: AutomationProviderId;
  selectorKey: string;
  strategies: SelectorStrategyOverride[];
  mode?: SelectorOverrideMode;
  description?: string;
}): string {
  const file = structuredClone(getCachedSelectorOverrides());
  if (!Object.prototype.hasOwnProperty.call(file.providers, input.providerId)) {
    file.providers[input.providerId] = { selectors: {} };
  }
  file.providers[input.providerId].selectors[input.selectorKey] = {
    strategies: input.strategies,
    mode: input.mode ?? 'prepend',
    description: input.description,
  };
  return saveSelectorOverridesToDisk(file);
}

export function countOverridesForProvider(providerId: AutomationProviderId): number {
  const file = getCachedSelectorOverrides();
  const provider = Object.prototype.hasOwnProperty.call(file.providers, providerId)
    ? file.providers[providerId]
    : undefined;
  if (!provider) return 0;
  return Object.keys(provider.selectors).length;
}
