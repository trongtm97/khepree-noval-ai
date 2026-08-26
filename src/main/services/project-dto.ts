import type { ProjectRow } from '../db/repositories/project-repository';
import type { ProjectDto } from '@shared/schemas/import';

export function toProjectDto(
  row: ProjectRow,
  chapterCount?: number,
): ProjectDto {
  return {
    id: row.id,
    title: row.title,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    genre: row.genre,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chapterCount,
  };
}
