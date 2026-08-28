import type { ProjectDto } from '@shared/schemas/import';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive } from '@shared/utils/job-progress';

export type ProjectDisplayStatus =
  | 'ready'
  | 'translating'
  | 'paused'
  | 'needs_setup'
  | 'error'
  | 'completed'
  | 'unknown';

export type ProjectBadgeTone =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'accent';

export interface ProjectDisplayState {
  status: ProjectDisplayStatus;
  labelKey: string;
  tone: ProjectBadgeTone;
  hintKey?: string;
  actionable?: boolean;
  actionKey?: string;
}

export interface ProjectHealthAlert {
  messageKey: string;
  actionKey?: string;
  actionRoute?: 'accounts' | 'chapters' | 'ai-memory' | 'jobs';
}

/** User-facing project readiness — not raw DB status. */
export function resolveProjectDisplayState(
  project: ProjectDto,
  activeJob?: JobDto | null,
): ProjectDisplayState {
  const health = project.health;
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;

  if (activeJob && isJobActive(activeJob.state)) {
    if (activeJob.state === 'PAUSED') {
      return {
        status: 'paused',
        labelKey: 'projects.statusPaused',
        tone: 'warning',
      };
    }
    return {
      status: 'translating',
      labelKey: 'projects.statusTranslating',
      tone: 'info',
    };
  }

  if (health?.google === 'missing' || health?.google === 'warn') {
    return {
      status: 'error',
      labelKey: 'projects.statusError',
      tone: 'error',
      hintKey: 'projects.hintGoogleLogin',
      actionable: true,
      actionKey: 'projects.actionViewError',
    };
  }

  if ((project.errorChapterCount ?? 0) > 0) {
    return {
      status: 'error',
      labelKey: 'projects.statusError',
      tone: 'error',
      hintKey: 'projects.hintChapterErrors',
      actionable: true,
      actionKey: 'projects.actionViewError',
    };
  }

  if (health?.source === 'missing') {
    return {
      status: 'needs_setup',
      labelKey: 'projects.statusNeedsSetup',
      tone: 'warning',
      hintKey: 'projects.hintNoSourceFolder',
    };
  }

  if (health?.source === 'warn') {
    return {
      status: 'needs_setup',
      labelKey: 'projects.statusNeedsSetup',
      tone: 'warning',
      hintKey: 'projects.hintSourceDisconnected',
    };
  }

  if (total > 0 && done >= total) {
    return {
      status: 'completed',
      labelKey: 'projects.statusCompleted',
      tone: 'success',
    };
  }

  const raw = (project.status ?? '').toLowerCase();
  if (raw === 'paused') {
    return {
      status: 'paused',
      labelKey: 'projects.statusPaused',
      tone: 'warning',
    };
  }
  if (raw === 'ready' || raw === 'active') {
    return {
      status: 'ready',
      labelKey: 'projects.statusReady',
      tone: 'success',
    };
  }
  if (raw === 'draft') {
    if (health?.source === 'ok') {
      return {
        status: 'ready',
        labelKey: 'projects.statusReady',
        tone: 'success',
      };
    }
    return {
      status: 'needs_setup',
      labelKey: 'projects.statusNeedsSetup',
      tone: 'warning',
      hintKey: 'projects.hintNoSourceFolder',
    };
  }

  return {
    status: 'unknown',
    labelKey: 'projects.statusUnknown',
    tone: 'default',
  };
}

/** Only surface health issues that need user action. */
export function resolveProjectHealthAlert(
  project: ProjectDto,
): ProjectHealthAlert | null {
  const health = project.health;
  if (!health) return null;

  if (health.google === 'missing' || health.google === 'warn') {
    return {
      messageKey: 'projects.alertGoogleLogin',
      actionKey: 'projects.actionHandle',
      actionRoute: 'accounts',
    };
  }
  if (health.source === 'missing') {
    return {
      messageKey: 'projects.alertNoSource',
      actionKey: 'projects.actionHandle',
      actionRoute: 'chapters',
    };
  }
  if (health.source === 'warn') {
    return {
      messageKey: 'projects.alertSourceDisconnected',
      actionKey: 'projects.actionHandle',
      actionRoute: 'chapters',
    };
  }
  if (health.memoryVersion != null && !health.memoryVerified) {
    return {
      messageKey: 'projects.alertMemoryStale',
      actionKey: 'projects.actionHandle',
      actionRoute: 'ai-memory',
    };
  }
  return null;
}

export function projectProgressPercent(project: ProjectDto): number {
  const total = project.sourceChapterCount ?? 0;
  const done = project.translatedChapterCount ?? 0;
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

export function sortProjectsByProgress(a: ProjectDto, b: ProjectDto): number {
  const pctA = projectProgressPercent(a);
  const pctB = projectProgressPercent(b);
  if (pctA !== pctB) return pctB - pctA;
  const totalA = a.sourceChapterCount ?? 0;
  const totalB = b.sourceChapterCount ?? 0;
  if (totalA !== totalB) return totalB - totalA;
  return b.updatedAt.localeCompare(a.updatedAt);
}
