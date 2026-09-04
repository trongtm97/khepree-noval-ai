/**
 * HARD REQUIREMENT 18 — do not break existing user data.
 *
 * NotebookLM binding lives in existing `notebook_resources` columns.
 * Never casually rename persisted keys (project_id, notebook_id, resource_url, …).
 * Schema extensions must ship defaults + migration and tolerate older DBs.
 * Missing binding must never block app / project open.
 *
 * Legacy story without binding = valid.
 * Binding created only when NotebookLM is actually needed, then reused.
 */
export const NOTEBOOK_BINDING_PERSISTED_KEYS = [
  'project_id',
  'google_account_id',
  'notebook_id',
  'resource_url',
  'notebook_name',
  'notebook_role',
  'status',
  'created_at',
  'last_verified_at',
  'deprecated_at',
] as const;

export type NotebookBindingPersistedKey =
  (typeof NOTEBOOK_BINDING_PERSISTED_KEYS)[number];
