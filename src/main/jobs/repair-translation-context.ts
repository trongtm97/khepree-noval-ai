import {
  TranslationLanguagePairMissingError,
} from '@shared/constants/translation-language';
import { normalizeLanguageCode } from '@shared/constants/language-profile';
import type { DatabaseManager } from '../db/database-manager';
import type { LockedTermForQa } from './qa-checker';

/** Frozen translation context for repair / continuation — must match initial job send. */
export interface RepairTranslationContext {
  projectId: string;
  editionId: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  /** Hash of style policy / critical rules from initial pack (promptHash). */
  stylePolicyHash: string | null;
  knowledgeVersion: number | null;
  lockedTerms: LockedTermForQa[];
}

export interface RepairNeighborTranslation {
  paragraphId: string;
  targetText: string;
}

export function readRepairTranslationContextFromProgress(
  progressRaw: string | null | undefined,
): Partial<RepairTranslationContext> | null {
  if (!progressRaw) return null;
  try {
    const p = JSON.parse(progressRaw) as Record<string, unknown>;
    const sourceLanguage =
      typeof p.repairSourceLanguage === 'string'
        ? p.repairSourceLanguage
        : typeof p.sourceLanguage === 'string'
          ? p.sourceLanguage
          : undefined;
    const targetLanguage =
      typeof p.repairTargetLanguage === 'string'
        ? p.repairTargetLanguage
        : typeof p.targetLanguage === 'string'
          ? p.targetLanguage
          : undefined;
    if (!sourceLanguage || !targetLanguage) return null;

    const lockedRaw = p.repairLockedTerms;
    const lockedTerms: LockedTermForQa[] =
      Array.isArray(lockedRaw)
        ? lockedRaw
            .filter((t): t is Record<string, unknown> => t && typeof t === 'object')
            .map((t) => ({
              source: String(t.source ?? ''),
              preferred: String(t.preferred ?? ''),
              forbiddenVariants: Array.isArray(t.forbiddenVariants)
                ? t.forbiddenVariants.map(String)
                : undefined,
            }))
            .filter((t) => t.source && t.preferred)
        : [];

    return {
      projectId: typeof p.repairProjectId === 'string' ? p.repairProjectId : undefined,
      editionId:
        typeof p.repairEditionId === 'string'
          ? p.repairEditionId
          : p.repairEditionId === null
            ? null
            : typeof p.editionId === 'string'
              ? p.editionId
              : undefined,
      sourceLanguage: normalizeLanguageCode(sourceLanguage),
      targetLanguage: normalizeLanguageCode(targetLanguage),
      stylePolicyHash:
        typeof p.stylePolicyHash === 'string'
          ? p.stylePolicyHash
          : typeof p.promptHash === 'string'
            ? p.promptHash
            : null,
      knowledgeVersion:
        typeof p.knowledgeVersion === 'number'
          ? p.knowledgeVersion
          : typeof p.localKnowledgeVersion === 'number'
            ? p.localKnowledgeVersion
            : null,
      lockedTerms,
    };
  } catch {
    return null;
  }
}

export function repairContextSnapshot(
  ctx: RepairTranslationContext,
): Record<string, unknown> {
  return {
    repairProjectId: ctx.projectId,
    repairEditionId: ctx.editionId,
    repairSourceLanguage: ctx.sourceLanguage,
    repairTargetLanguage: ctx.targetLanguage,
    sourceLanguage: ctx.sourceLanguage,
    targetLanguage: ctx.targetLanguage,
    stylePolicyHash: ctx.stylePolicyHash,
    promptHash: ctx.stylePolicyHash,
    repairLockedTerms: ctx.lockedTerms,
    knowledgeVersion: ctx.knowledgeVersion,
    localKnowledgeVersion: ctx.knowledgeVersion,
  };
}

/** Production repair — requires frozen pair from initial send (job progress). */
export function requireRepairTranslationContext(
  db: DatabaseManager,
  jobId: string,
): RepairTranslationContext {
  const job = db.jobs.getById(jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const partial = readRepairTranslationContextFromProgress(job.progress);
  if (!partial?.sourceLanguage || !partial?.targetLanguage) {
    throw new TranslationLanguagePairMissingError(
      'Repair requires frozen language pair from the initial translation send.',
    );
  }

  const configLocked = parseLockedTermsFromJobConfig(job.config);

  return {
    projectId: job.project_id,
    editionId: partial.editionId ?? job.edition_id ?? null,
    sourceLanguage: partial.sourceLanguage,
    targetLanguage: partial.targetLanguage,
    stylePolicyHash: partial.stylePolicyHash ?? null,
    knowledgeVersion: partial.knowledgeVersion ?? null,
    lockedTerms:
      partial.lockedTerms.length > 0 ? partial.lockedTerms : configLocked,
  };
}

export function buildRepairTranslationContext(input: {
  projectId: string;
  editionId: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  stylePolicyHash: string | null;
  knowledgeVersion: number | null;
  lockedTerms?: LockedTermForQa[];
}): RepairTranslationContext {
  const sourceLanguage = input.sourceLanguage?.trim();
  const targetLanguage = input.targetLanguage?.trim();
  if (!sourceLanguage || !targetLanguage) {
    throw new TranslationLanguagePairMissingError();
  }
  return {
    projectId: input.projectId,
    editionId: input.editionId,
    sourceLanguage: normalizeLanguageCode(sourceLanguage),
    targetLanguage: normalizeLanguageCode(targetLanguage),
    stylePolicyHash: input.stylePolicyHash,
    knowledgeVersion: input.knowledgeVersion,
    lockedTerms: input.lockedTerms ?? [],
  };
}

function parseLockedTermsFromJobConfig(raw: string | null): LockedTermForQa[] {
  if (!raw) return [];
  try {
    const config = JSON.parse(raw) as { lockedTerms?: LockedTermForQa[] };
    return config.lockedTerms ?? [];
  } catch {
    return [];
  }
}

export function collectNeighborTargetTranslations(
  batchParagraphs: { paragraphId: string; sourceText: string }[],
  missingParagraphIds: string[],
  acceptedTranslations: { paragraphId: string; text: string }[],
  radius = 1,
): RepairNeighborTranslation[] {
  const missingSet = new Set(missingParagraphIds);
  const byId = new Map(
    acceptedTranslations
      .filter((t) => t.text.trim())
      .map((t) => [t.paragraphId, t.text]),
  );
  const missingIndices = batchParagraphs
    .map((p, i) => (missingSet.has(p.paragraphId) ? i : -1))
    .filter((i) => i >= 0);

  const include = new Set<number>();
  for (const i of missingIndices) {
    for (let d = -radius; d <= radius; d += 1) {
      const j = i + d;
      if (j < 0 || j >= batchParagraphs.length) continue;
      include.add(j);
    }
  }

  const out: RepairNeighborTranslation[] = [];
  for (const i of [...include].sort((a, b) => a - b)) {
    const para = batchParagraphs[i];
    if (missingSet.has(para.paragraphId)) continue;
    const targetText = byId.get(para.paragraphId)?.trim();
    if (!targetText) continue;
    out.push({ paragraphId: para.paragraphId, targetText });
  }
  return out;
}

export function lastAcceptedTargetParagraphs(
  sourceOrder: string[],
  translations: { paragraphId: string; text: string }[],
  maxCount = 2,
): RepairNeighborTranslation[] {
  const byId = new Map(translations.map((t) => [t.paragraphId, t.text]));
  const accepted: RepairNeighborTranslation[] = [];
  for (const id of sourceOrder) {
    const text = byId.get(id)?.trim();
    if (text) accepted.push({ paragraphId: id, targetText: text });
  }
  return accepted.slice(-maxCount);
}
