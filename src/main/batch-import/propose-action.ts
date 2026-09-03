import type { BatchImportProposedAction } from '@shared/constants/batch-import';
import type { BatchImportWarningDto } from '@shared/schemas/batch-import';
import type { AnalyzedCandidate } from './analyze-candidate';
import { candidateIdentityKey, normalizeSourcePathKey } from './source-identity';

export interface ExistingProjectMatch {
  id: string;
  title: string;
  sourceFolderPath: string | null;
  sourceIdentityKey: string | null;
  sourceContentFingerprint: string | null;
}

export interface ProposedActionResult {
  proposedAction: BatchImportProposedAction;
  matchedProjectId: string | null;
  matchedProjectTitle: string | null;
}

function isSkipWarning(code: string): boolean {
  return ['EMPTY_FILE', 'EMPTY_FOLDER', 'CORRUPT_OR_UNREADABLE', 'NO_CHAPTERS'].includes(code);
}

function isAttentionWarning(code: string): boolean {
  return [
    'UNCLEAR_CHAPTER_STRUCTURE',
    'ENCODING_UNCERTAIN',
    'DUPLICATE_CONTENT',
    'DUPLICATE_TITLE',
  ].includes(code);
}

/**
 * Suggest CREATE | UPDATE_EXISTING | SKIP | NEEDS_ATTENTION without writing DB.
 * Prefer source identity key + content fingerprint; never treat title alone as UPDATE.
 */
export function proposeCandidateAction(
  candidate: AnalyzedCandidate,
  existingProjects: ExistingProjectMatch[],
): ProposedActionResult {
  if (
    candidate.chapterCount === 0 ||
    candidate.warnings.some((w) => isSkipWarning(w.code))
  ) {
    return {
      proposedAction: 'SKIP',
      matchedProjectId: null,
      matchedProjectTitle: null,
    };
  }

  const identityKey = candidateIdentityKey(candidate.kind, candidate.absolutePath);
  const byIdentity = existingProjects.filter((p) => p.sourceIdentityKey === identityKey);
  if (byIdentity.length === 1) {
    return {
      proposedAction: 'UPDATE_EXISTING',
      matchedProjectId: byIdentity[0].id,
      matchedProjectTitle: byIdentity[0].title,
    };
  }

  const byFp = existingProjects.filter(
    (p) => p.sourceContentFingerprint === candidate.contentFingerprint,
  );
  if (byFp.length === 1) {
    return {
      proposedAction: 'UPDATE_EXISTING',
      matchedProjectId: byFp[0].id,
      matchedProjectTitle: byFp[0].title,
    };
  }
  if (byFp.length > 1) {
    return {
      proposedAction: 'NEEDS_ATTENTION',
      matchedProjectId: null,
      matchedProjectTitle: null,
    };
  }

  if (candidate.kind === 'folder') {
    const byPath = existingProjects.filter(
      (p) =>
        p.sourceFolderPath &&
        normalizeSourcePathKey(p.sourceFolderPath) ===
          normalizeSourcePathKey(candidate.absolutePath),
    );
    if (byPath.length === 1) {
      return {
        proposedAction: 'UPDATE_EXISTING',
        matchedProjectId: byPath[0].id,
        matchedProjectTitle: byPath[0].title,
      };
    }
  }

  const titleKey = candidate.predictedTitle.trim().toLowerCase();
  const byTitle = existingProjects.filter((p) => p.title.trim().toLowerCase() === titleKey);
  if (byTitle.length >= 1) {
    // Title alone is ambiguous — require human confirmation.
    return {
      proposedAction: 'NEEDS_ATTENTION',
      matchedProjectId: byTitle.length === 1 ? byTitle[0].id : null,
      matchedProjectTitle: byTitle.length === 1 ? byTitle[0].title : null,
    };
  }

  if (candidate.warnings.some((w) => isAttentionWarning(w.code))) {
    return {
      proposedAction: 'NEEDS_ATTENTION',
      matchedProjectId: null,
      matchedProjectTitle: null,
    };
  }

  return {
    proposedAction: 'CREATE',
    matchedProjectId: null,
    matchedProjectTitle: null,
  };
}

/** Cross-candidate duplicate title / content warnings (mutates warning lists). */
export function annotateCrossCandidateDuplicates(candidates: AnalyzedCandidate[]): void {
  const byTitle = new Map<string, AnalyzedCandidate[]>();
  const byFp = new Map<string, AnalyzedCandidate[]>();
  for (const c of candidates) {
    const tk = c.predictedTitle.trim().toLowerCase();
    const titleList = byTitle.get(tk) ?? [];
    titleList.push(c);
    byTitle.set(tk, titleList);
    const fpList = byFp.get(c.contentFingerprint) ?? [];
    fpList.push(c);
    byFp.set(c.contentFingerprint, fpList);
  }
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      if (!c.warnings.some((w) => w.code === 'DUPLICATE_TITLE')) {
        c.warnings.push({
          code: 'DUPLICATE_TITLE',
          message: 'Another candidate shares this predicted title',
        });
      }
    }
  }
  for (const group of byFp.values()) {
    if (group.length < 2) continue;
    for (const c of group) {
      if (!c.warnings.some((w) => w.code === 'DUPLICATE_CONTENT')) {
        c.warnings.push({
          code: 'DUPLICATE_CONTENT',
          message: 'Another candidate has identical content fingerprint',
        });
      }
    }
  }
}

export function friendlyLimitWarning(message: string): BatchImportWarningDto {
  return { code: 'LIMIT_EXCEEDED', message };
}
