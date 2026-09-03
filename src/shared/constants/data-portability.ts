import type { TabularDataType } from './tabular';

export const DATA_SECTION_IDS = [
  'translations',
  'terms',
  'characters',
  'knowledge',
  'source',
  'reports',
] as const;
export type DataSectionId = (typeof DATA_SECTION_IDS)[number];

export interface DataSectionDef {
  id: DataSectionId;
  /** Primary tabular data type for import/export. */
  dataType: TabularDataType;
  importable: boolean;
  exportable: boolean;
  templateDownload?: boolean;
  /** Expected canonical columns for external file mapping (subset). */
  mappingFields: { key: string; required?: boolean }[];
}

export const DATA_SECTIONS: Record<DataSectionId, DataSectionDef> = {
  translations: {
    id: 'translations',
    dataType: 'translations',
    importable: true,
    exportable: true,
    mappingFields: [
      { key: 'paragraph_id', required: true },
      { key: 'source_text' },
      { key: 'translated_text', required: true },
      { key: 'translation_status' },
      { key: 'human_locked' },
      { key: 'notes' },
    ],
  },
  terms: {
    id: 'terms',
    dataType: 'terms',
    importable: true,
    exportable: true,
    templateDownload: true,
    mappingFields: [
      { key: 'source_text', required: true },
      { key: 'target_text', required: true },
      { key: 'term_type' },
      { key: 'status' },
      { key: 'notes' },
    ],
  },
  characters: {
    id: 'characters',
    dataType: 'characters',
    importable: true,
    exportable: true,
    mappingFields: [
      { key: 'canonical_source_name', required: true },
      { key: 'preferred_name' },
      { key: 'character_id' },
    ],
  },
  knowledge: {
    id: 'knowledge',
    dataType: 'project_data',
    importable: true,
    exportable: true,
    mappingFields: [
      { key: 'project_id' },
      { key: 'source_title' },
      { key: 'rule_text' },
      { key: 'key' },
      { key: 'value' },
    ],
  },
  source: {
    id: 'source',
    dataType: 'source_workbook',
    importable: true,
    exportable: true,
    mappingFields: [
      { key: 'chapter_id' },
      { key: 'paragraph_id', required: true },
      { key: 'source_text', required: true },
      { key: 'title' },
    ],
  },
  reports: {
    id: 'reports',
    dataType: 'operational_workbook',
    importable: false,
    exportable: true,
    mappingFields: [],
  },
};

export const COLUMN_MAPPING_PRESET_STORAGE_KEY = 'nts-column-mapping-presets';
