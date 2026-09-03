import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseManager } from '../db/database-manager';
import type { TranslationRecipeConfig } from '@shared/constants/translation-recipe-defs';
import type { NovelExportFormat } from '@shared/constants/portability';
import { NOVEL_EXPORT_FORMATS } from '@shared/constants/portability';
import type {
  CampaignPipelineCheckpoint,
  CampaignPipelineSideEffects,
} from '@shared/schemas/campaign-pipeline';
import type {
  DeliveryManifest,
  ProductionCompletionEvent,
} from '@shared/schemas/delivery-completion';
import {
  buildDeliveryExportFingerprint,
  resolveUniqueExportFilePath,
} from '@shared/utils/delivery-export-path';
import { buildNovelExportFilename } from '@shared/utils/sanitize-filename';
import { writeFileAtomic } from './atomic-write';
import { getExportSettings } from './export-settings-service';
import {
  isPathWithinExportDirectory,
  resolveExportDirectory,
  resolveExportPath,
} from './export-path-resolver';
import { getPortabilityService } from '../services/portability-service-singleton';

const SECRETISH =
  /(cookie|authorization|api[_-]?key|password|token|secret|prompt|credential)/i;

function sanitizeWarning(raw: string): string {
  const trimmed = raw.trim().slice(0, 300);
  if (SECRETISH.test(trimmed)) return '[redacted]';
  return trimmed;
}

/** Resolve export formats from recipe hints; default txt. Invalid hints dropped. */
export function resolveDeliveryExportFormats(
  hints: string[] | undefined | null,
): NovelExportFormat[] {
  const allowed = new Set<string>(NOVEL_EXPORT_FORMATS);
  const picked: NovelExportFormat[] = [];
  for (const h of hints ?? []) {
    const key = h.trim().toLowerCase();
    if (allowed.has(key) && !picked.includes(key as NovelExportFormat)) {
      picked.push(key as NovelExportFormat);
    }
  }
  return picked.length > 0 ? picked : ['txt'];
}

function filesStillPresent(paths: string[]): boolean {
  return paths.length > 0 && paths.every((p) => fs.existsSync(p));
}

function sourceRevisionHint(db: DatabaseManager, projectId: string): string | null {
  const chapters = db.chapters.listByProject(projectId);
  if (chapters.length === 0) return null;
  let latest = '';
  for (const ch of chapters) {
    const stamp = ch.updated_at ?? ch.created_at ?? '';
    if (stamp > latest) latest = stamp;
  }
  return latest ? `chapters=${chapters.length};latest=${latest}` : `chapters=${chapters.length}`;
}

function auditSummaryFromRun(
  db: DatabaseManager,
  runId: string,
): string | null {
  const audit = db.campaignPipeline.getStage(runId, 'WHOLE_BOOK_AUDIT');
  if (!audit) return null;
  const cp = db.campaignPipeline.parseCheckpoint(audit);
  if (cp.consistencySummary) return sanitizeWarning(cp.consistencySummary);
  if (cp.auditSkippedReason) return `skipped:${sanitizeWarning(cp.auditSkippedReason)}`;
  if (typeof cp.auditCriticalCount === 'number') {
    return `critical=${cp.auditCriticalCount}`;
  }
  return null;
}

export interface DeliveryAutoExportResult {
  sideEffects: CampaignPipelineSideEffects;
  checkpoint: CampaignPipelineCheckpoint;
  event: ProductionCompletionEvent | null;
  warnings: string[];
}

/**
 * Auto-export on DELIVERY: atomic writes, collision versions, sanitized manifest.
 * Never uploads. Idempotent on fingerprint when files still exist.
 */
export async function runDeliveryAutoExport(input: {
  db: DatabaseManager;
  campaignId: string;
  projectId: string;
  runId: string;
  startToken: string;
  recipeMode: string;
  recipeConfig: TranslationRecipeConfig;
  existingEffects: CampaignPipelineSideEffects;
  startedAt?: string | null;
}): Promise<DeliveryAutoExportResult> {
  const warnings: string[] = [];
  const formats = resolveDeliveryExportFormats(input.recipeConfig.exportFormatHints);
  const fingerprint = buildDeliveryExportFingerprint({
    campaignId: input.campaignId,
    projectId: input.projectId,
    startToken: input.startToken,
    formats,
    recipeMode: input.recipeMode,
  });

  const existing = input.existingEffects;
  if (
    existing.deliveryExported &&
    existing.deliveryExportFingerprint === fingerprint &&
    existing.deliveryFilePaths &&
    filesStillPresent(existing.deliveryFilePaths)
  ) {
    const project = input.db.projects.getById(input.projectId);
    return {
      sideEffects: existing,
      checkpoint: {
        deliveryReady: true,
        message: 'Delivery export reused (idempotent)',
        humanLockedCount: 0,
      },
      warnings: [],
      event: existing.completionNotified
        ? null
        : buildProjectDeliveredEvent({
            fingerprint,
            campaignId: input.campaignId,
            projectId: input.projectId,
            projectTitle: project?.title ?? 'Project',
            outputDirectory: existing.deliveryOutputDirectory ?? null,
            primaryFilePath: existing.deliveryPrimaryPath ?? null,
            manifestPath: existing.deliveryManifestPath ?? null,
            formats,
            warnings: [],
          }),
    };
  }

  const baseResolved = resolveExportDirectory(input.db, { projectId: input.projectId });
  if (baseResolved.status === 'missing') {
    return failDelivery(existing, fingerprint, 'EXPORT_DIRECTORY_MISSING', warnings);
  }
  if (baseResolved.status === 'inaccessible') {
    return failDelivery(
      existing,
      fingerprint,
      `EXPORT_DIRECTORY_INACCESSIBLE:${baseResolved.configuredPath}`,
      warnings,
    );
  }

  const settings = getExportSettings(input.db);
  const project = input.db.projects.getById(input.projectId);
  const projectTitle = project?.title ?? 'Project';
  const portability = getPortabilityService();
  const exportedFiles: DeliveryManifest['exportedFiles'] = [];
  const writtenPaths: string[] = [];
  let primaryFilePath: string | null = null;
  let outputDirectory = baseResolved.directory;
  let chaptersExported = 0;
  let paragraphsExported = 0;

  for (const format of formats) {
    const formatResolved = resolveExportPath(input.db, {
      projectId: input.projectId,
      format,
      category: 'BOOK',
    });
    if (formatResolved.status !== 'ok') {
      warnings.push(`format ${format}: directory unavailable`);
      continue;
    }

    const fileName = buildNovelExportFilename(projectTitle, format);
    let unique;
    try {
      unique = resolveUniqueExportFilePath({
        directory: formatResolved.directory,
        fileName,
        policy: settings.existingFilePolicy,
        unattended: true,
      });
    } catch (err) {
      warnings.push(
        `format ${format}: ${err instanceof Error ? err.message : 'COLLISION'}`,
      );
      continue;
    }

    if (!isPathWithinExportDirectory(unique.filePath, formatResolved.directory)) {
      warnings.push(`format ${format}: path escaped export directory`);
      continue;
    }

    try {
      const result = await portability.exportNovel({
        projectId: input.projectId,
        format,
        outputPath: unique.filePath,
        translatedOnly: true,
        skipHistory: false,
      });
      writtenPaths.push(result.filePath);
      if (!primaryFilePath) primaryFilePath = result.filePath;
      outputDirectory = path.dirname(result.filePath);
      chaptersExported = result.chapterCount;
      paragraphsExported = result.paragraphCount;
      exportedFiles.push({
        format,
        fileName: path.basename(result.filePath),
        relativePath: path.basename(result.filePath),
      });
      if (unique.skippedOverwrite) {
        warnings.push(`versioned ${path.basename(result.filePath)} (collision)`);
      }
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      warnings.push(`format ${format}: ${sanitizeWarning(code)}`);
    }
  }

  if (writtenPaths.length === 0) {
    return failDelivery(
      existing,
      fingerprint,
      warnings[0] ?? 'DELIVERY_EXPORT_FAILED',
      warnings,
    );
  }

  const completedAt = new Date().toISOString();
  const manifest: DeliveryManifest = {
    schemaVersion: 1,
    kind: 'khepree-delivery-manifest',
    campaignId: input.campaignId,
    projectId: input.projectId,
    projectTitle,
    chaptersExported,
    paragraphsExported,
    sourceRevisionHint: sourceRevisionHint(input.db, input.projectId),
    recipe: {
      recipeId: input.recipeConfig.mode,
      mode: input.recipeMode,
      configVersion: input.recipeConfig.configVersion,
      qaLevel: input.recipeConfig.qaLevel,
      repairScope: input.recipeConfig.repairScope,
      wholeBookAudit: input.recipeConfig.wholeBookAudit,
      exportFormatHints: [...formats],
    },
    auditSummary: auditSummaryFromRun(input.db, input.runId),
    warnings: warnings.map(sanitizeWarning),
    exportedFiles,
    startedAt: input.startedAt ?? null,
    completedAt,
    fingerprint,
  };

  const manifestName = buildNovelExportFilename(
    `${projectTitle} — delivery-report`,
    'json',
  ).replace(/\.json$/i, '.manifest.json');
  const manifestUnique = resolveUniqueExportFilePath({
    directory: outputDirectory,
    fileName: manifestName,
    policy: settings.existingFilePolicy,
    unattended: true,
  });
  if (!isPathWithinExportDirectory(manifestUnique.filePath, outputDirectory)) {
    warnings.push('manifest path escaped export directory');
  } else {
    writeFileAtomic(
      manifestUnique.filePath,
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }

  const sideEffects: CampaignPipelineSideEffects = {
    ...existing,
    deliveryMarked: true,
    deliveryExported: true,
    deliveryExportFingerprint: fingerprint,
    deliveryFilePaths: writtenPaths,
    deliveryPrimaryPath: primaryFilePath,
    deliveryManifestPath: fs.existsSync(manifestUnique.filePath)
      ? manifestUnique.filePath
      : null,
    deliveryOutputDirectory: outputDirectory,
    completionNotified: false,
  };

  return {
    sideEffects,
    checkpoint: {
      deliveryReady: true,
      message: `Exported ${writtenPaths.length} file(s)`,
      humanLockedCount: 0,
    },
    warnings,
    event: buildProjectDeliveredEvent({
      fingerprint,
      campaignId: input.campaignId,
      projectId: input.projectId,
      projectTitle,
      outputDirectory,
      primaryFilePath,
      manifestPath: sideEffects.deliveryManifestPath ?? null,
      formats,
      warnings,
    }),
  };
}

function failDelivery(
  existing: CampaignPipelineSideEffects,
  fingerprint: string,
  errorMessage: string,
  warnings: string[],
): DeliveryAutoExportResult {
  return {
    sideEffects: {
      ...existing,
      deliveryMarked: true,
      deliveryExported: false,
      deliveryExportFingerprint: fingerprint,
    },
    checkpoint: {
      deliveryReady: false,
      message: sanitizeWarning(errorMessage),
    },
    warnings,
    event: null,
  };
}

function buildProjectDeliveredEvent(input: {
  fingerprint: string;
  campaignId: string;
  projectId: string;
  projectTitle: string;
  outputDirectory: string | null;
  primaryFilePath: string | null;
  manifestPath: string | null;
  formats: NovelExportFormat[];
  warnings: string[];
}): ProductionCompletionEvent {
  return {
    id: `delivery:${input.fingerprint}`,
    kind: 'PROJECT_DELIVERED',
    title: 'Xuất bản hoàn tất',
    description: `${input.projectTitle} — ${input.formats.join(', ')}`,
    campaignId: input.campaignId,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    route: `/jobs/campaigns/${input.campaignId}`,
    outputDirectory: input.outputDirectory,
    primaryFilePath: input.primaryFilePath,
    manifestPath: input.manifestPath,
    formats: input.formats,
    warnings: input.warnings.map(sanitizeWarning).slice(0, 20),
    desktopNotify: true,
    openTarget: false,
  };
}

export function buildCampaignCompletionEvent(input: {
  campaignId: string;
  title: string;
  kind: 'CAMPAIGN_COMPLETED' | 'CAMPAIGN_NEEDS_ATTENTION';
  description: string;
}): ProductionCompletionEvent {
  return {
    id: `campaign:${input.kind}:${input.campaignId}`,
    kind: input.kind,
    title: input.title,
    description: input.description,
    campaignId: input.campaignId,
    projectId: null,
    projectTitle: null,
    route: `/jobs/campaigns/${input.campaignId}`,
    outputDirectory: null,
    primaryFilePath: null,
    manifestPath: null,
    formats: [],
    warnings: [],
    desktopNotify: true,
    openTarget: false,
  };
}
