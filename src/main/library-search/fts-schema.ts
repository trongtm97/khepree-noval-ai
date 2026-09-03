export const LIBRARY_SEARCH_FTS_VIRTUAL_TABLE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS library_search_fts USING fts5(
  entity_key UNINDEXED,
  entity_type UNINDEXED,
  project_id UNINDEXED,
  series_id UNINDEXED,
  status UNINDEXED,
  language UNINDEXED,
  body,
  tokenize = 'unicode61'
);
`;
