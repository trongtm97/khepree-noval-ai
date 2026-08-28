import type { ProjectDto } from '@shared/schemas/import';

export interface ProjectNextAction {
  id: string;
  messageKey: string;
  messageParams?: Record<string, string | number>;
  actionKey: string;
  route: string;
}

export function buildProjectNextActions(input: {
  project: ProjectDto;
  newChapterCount: number;
  termsReviewCount: number;
  termCandidateCount: number;
}): ProjectNextAction[] {
  const actions: ProjectNextAction[] = [];
  const { project, newChapterCount, termsReviewCount, termCandidateCount } = input;
  const base = `/projects/${project.id}`;

  if (project.nextUntranslatedChapter != null) {
    actions.push({
      id: 'continue-translate',
      messageKey: 'bookMetadata.nextContinueTranslate',
      messageParams: { chapter: project.nextUntranslatedChapter },
      actionKey: 'bookMetadata.nextActionTranslate',
      route: `${base}/translate`,
    });
  }

  if (newChapterCount > 0) {
    actions.push({
      id: 'new-chapters',
      messageKey: 'bookMetadata.nextNewChapters',
      messageParams: { count: newChapterCount },
      actionKey: 'bookMetadata.nextActionReview',
      route: `${base}/chapters`,
    });
  }

  const termsPending = termsReviewCount + termCandidateCount;
  if (termsPending > 0) {
    actions.push({
      id: 'terms-pending',
      messageKey: 'bookMetadata.nextTermsPending',
      messageParams: { count: termsPending },
      actionKey: 'bookMetadata.nextActionTerms',
      route: `${base}/terms`,
    });
  }

  return actions.slice(0, 3);
}
