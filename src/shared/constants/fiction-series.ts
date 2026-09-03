/** Knowledge scope layers — nearest wins (chapter > project > series > genre > global). */
export const KNOWLEDGE_SCOPE_LAYERS = [
  'GLOBAL',
  'GENRE',
  'SERIES',
  'PROJECT',
  'CHAPTER',
] as const;

export type KnowledgeScopeLayer = (typeof KNOWLEDGE_SCOPE_LAYERS)[number];

export const SERIES_STYLE_RULE_KINDS = ['style', 'critical'] as const;
export type SeriesStyleRuleKind = (typeof SERIES_STYLE_RULE_KINDS)[number];
