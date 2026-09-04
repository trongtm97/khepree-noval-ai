/**
 * HARD REQUIREMENT 15 — NotebookLM ownership follows story/project.
 *
 * Series/World knowledge may be shared across related stories.
 * NotebookLM binding owner is NEVER series, campaign, job, or chapter.
 */
export const NOTEBOOK_BINDING_OWNER_KIND = 'story_project' as const;

/** IDs that must not be used as notebook_resources.project_id / binding owner. */
export const NOTEBOOK_BINDING_FORBIDDEN_OWNER_KINDS = [
  'seriesId',
  'campaignId',
  'jobId',
  'chapterId',
] as const;

export type NotebookBindingForbiddenOwnerKind =
  (typeof NOTEBOOK_BINDING_FORBIDDEN_OWNER_KINDS)[number];

export const NOTEBOOK_BINDING_OWNER_ERROR =
  'NotebookLM binding owner must be story/projectId — not seriesId, campaignId, jobId, or chapterId';
