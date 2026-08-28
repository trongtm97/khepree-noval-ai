import type { ProjectDto } from '@shared/schemas/import';

export interface PriorityProjectInput {
  projects: ProjectDto[];
  lastTranslationProjectId: string | null;
  currentProjectId: string | null;
}

/** Deterministic priority project — never projects[0] blindly. */
export function resolvePriorityProject(input: PriorityProjectInput): ProjectDto | null {
  const active = input.projects.filter((p) => p.status !== 'archived');
  if (active.length === 0) return null;

  if (input.lastTranslationProjectId) {
    const last = active.find((p) => p.id === input.lastTranslationProjectId);
    if (last) return last;
  }

  if (input.currentProjectId) {
    const current = active.find((p) => p.id === input.currentProjectId);
    if (current) return current;
  }

  const incomplete = active.filter((p) => {
    const total = p.sourceChapterCount ?? 0;
    const done = p.translatedChapterCount ?? 0;
    return total === 0 || done < total;
  });

  if (incomplete.length > 0) {
    return [...incomplete].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  }

  return [...active].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

export function isProjectComplete(project: ProjectDto): boolean {
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  return total > 0 && done >= total;
}

export function countUntranslatedChapters(project: ProjectDto): number {
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  return Math.max(0, total - done);
}
