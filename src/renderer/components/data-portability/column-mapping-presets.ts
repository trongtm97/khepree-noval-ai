import type { DataSectionId } from '@shared/constants/data-portability';
import { COLUMN_MAPPING_PRESET_STORAGE_KEY } from '@shared/constants/data-portability';

export type ColumnMappingPreset = Record<string, string>;

export function loadMappingPreset(sectionId: DataSectionId): ColumnMappingPreset {
  try {
    const raw = localStorage.getItem(COLUMN_MAPPING_PRESET_STORAGE_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, ColumnMappingPreset>;
    return all[sectionId] ?? {};
  } catch {
    return {};
  }
}

export function saveMappingPreset(sectionId: DataSectionId, mapping: ColumnMappingPreset): void {
  try {
    const raw = localStorage.getItem(COLUMN_MAPPING_PRESET_STORAGE_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ColumnMappingPreset>) : {};
    all[sectionId] = mapping;
    localStorage.setItem(COLUMN_MAPPING_PRESET_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}
