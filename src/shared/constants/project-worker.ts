/** Project-scoped Google worker resolution — never pick first READY blindly. */

export const PROJECT_WORKER_PURPOSES = [
  'translation',
  'notebook',
  'research',
  'drive_sync',
  'preprocess',
  'diagnostics',
] as const;

export type ProjectWorkerPurpose = (typeof PROJECT_WORKER_PURPOSES)[number];

export const PROJECT_WORKER_SOURCES = [
  'active_job',
  'translation_notebook',
  'project_assigned',
  'explicit_preferred',
  'ready_fallback',
  'none',
] as const;

export type ProjectWorkerSource = (typeof PROJECT_WORKER_SOURCES)[number];
