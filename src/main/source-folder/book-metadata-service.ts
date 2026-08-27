import type { MetadataSource } from '@shared/constants/book-metadata';
import fs from 'node:fs';
import type { ProjectMetadataDto } from '@shared/schemas/book-metadata';
import type { FolderScanResultDto } from '@shared/schemas/source-folder';
import { getDatabase } from '../db/connection';
import {
  buildMetadataFieldsFromSource,
  type MetadataFieldsMap,
  type ParsedBookMetadata,
} from './book-info-parser';
import { metadataFromParsed } from './book-profile-builder';
import type { ProjectMetadataPatch } from '../db/repositories/project-repository';
import { logger } from '../logging/logger';

const METADATA_PRIORITY: MetadataSource[] = [
  'USER_EDIT',
  'PROJECT_CONFIRMED',
  'BOOK_INFO_FILE',
  'AUTO_DETECTED',
];

function sourceRank(source: MetadataSource | null | undefined): number {
  if (!source) return -1;
  return METADATA_PRIORITY.indexOf(source);
}

function parseMetadataFields(raw: string | null): MetadataFieldsMap {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MetadataFieldsMap;
  } catch {
    return {};
  }
}

function shouldApplyField(
  field: keyof ParsedBookMetadata,
  incomingSource: MetadataSource,
  existingFields: MetadataFieldsMap,
): boolean {
  const existing = existingFields[field];
  if (!existing) return true;
  if (existing.locked) return false;
  return sourceRank(incomingSource) >= sourceRank(existing.source);
}

export function projectRowToMetadataDto(
  project: ReturnType<ReturnType<typeof getDatabase>['projects']['getById']>,
): ProjectMetadataDto | null {
  if (!project) return null;
  let alternativeTitles: string[] = [];
  let subgenres: string[] = [];
  try {
    if (project.alternative_titles) {
      alternativeTitles = JSON.parse(project.alternative_titles) as string[];
    }
  } catch {
    alternativeTitles = [];
  }
  try {
    if (project.subgenres) {
      subgenres = JSON.parse(project.subgenres) as string[];
    }
  } catch {
    subgenres = [];
  }

  return {
    title: project.title,
    sourceTitle: project.source_title ?? project.title_cn,
    targetTitle: project.target_title ?? project.title_vi,
    titleCn: project.title_cn ?? project.source_title,
    titleVi: project.title_vi ?? project.target_title,
    titleOriginal: project.title_original,
    alternativeTitles,
    authorName: project.author_name,
    authorNameCn: project.author_name_cn,
    genre: project.genre,
    subgenres,
    publicationStatus: project.publication_status,
    expectedChapterCount: project.expected_chapter_count,
    description: project.description,
    introduction: project.introduction,
    officialSummary: project.official_summary,
    notes: project.notes,
    metadataSource: project.metadata_source,
  };
}

export function applyBookMetadataFromScan(
  projectId: string,
  scanResult: FolderScanResultDto,
  source: MetadataSource = 'BOOK_INFO_FILE',
): void {
  if (!scanResult.bookMetadata?.parsed) return;

  const db = getDatabase();
  const project = db.projects.getById(projectId);
  if (!project) return;

  const parsed = scanResult.bookMetadata.parsed;
  const mapped = metadataFromParsed(parsed);
  const existingFields = parseMetadataFields(project.metadata_fields);
  const patch: ProjectMetadataPatch = { book_profile_dirty: true, metadata_source: source };

  const tryField = (
    key: keyof ParsedBookMetadata,
    dbKey: keyof ProjectMetadataPatch,
    value: string | number | null | undefined,
  ): void => {
    if (value == null || value === '') return;
    if (!shouldApplyField(key, source, existingFields)) return;
    (patch as Record<string, unknown>)[dbKey as string] = value;
    existingFields[key] = { source, confidence: 0.9, locked: false };
  };

  tryField('sourceTitle', 'source_title', mapped.source_title);
  tryField('targetTitle', 'target_title', mapped.target_title);
  tryField('titleCn', 'title_cn', mapped.title_cn);
  tryField('titleVi', 'title_vi', mapped.title_vi);
  tryField('titleOriginal', 'title_original', mapped.title_original);
  tryField('authorName', 'author_name', mapped.author_name);
  tryField('authorNameCn', 'author_name_cn', mapped.author_name_cn);
  tryField('genre', 'genre', mapped.genre);
  tryField('description', 'description', mapped.description);
  tryField('introduction', 'introduction', mapped.introduction);
  tryField('officialSummary', 'official_summary', mapped.official_summary);
  tryField('notes', 'notes', mapped.notes);

  if (mapped.alternative_titles && shouldApplyField('alternativeTitles', source, existingFields)) {
    patch.alternative_titles = mapped.alternative_titles;
    existingFields.alternativeTitles = { source, confidence: 0.9, locked: false };
  }
  if (mapped.subgenres && shouldApplyField('subgenres', source, existingFields)) {
    patch.subgenres = mapped.subgenres;
    existingFields.subgenres = { source, confidence: 0.9, locked: false };
  }
  if (
    mapped.expected_chapter_count &&
    shouldApplyField('expectedChapterCount', source, existingFields)
  ) {
    patch.expected_chapter_count = mapped.expected_chapter_count;
    existingFields.expectedChapterCount = { source, confidence: 0.9, locked: false };
  }
  if (
    mapped.publication_status &&
    shouldApplyField('publicationStatus', source, existingFields)
  ) {
    patch.publication_status = mapped.publication_status;
    existingFields.publicationStatus = { source, confidence: 0.9, locked: false };
  }

  if (
    !patch.title &&
    mapped.target_title &&
    shouldApplyField('targetTitle', source, existingFields)
  ) {
    patch.title = mapped.target_title;
  } else if (!patch.title && mapped.source_title) {
    patch.title = project.title;
  }

  patch.metadata_fields = JSON.stringify({ ...parseMetadataFields(project.metadata_fields), ...existingFields });
  db.projects.updateMetadata(projectId, patch);

  db.projectDocuments.upsert({
    project_id: projectId,
    document_type: 'BOOK_INFO',
    title: scanResult.bookMetadata.sourceFileName,
    source_file_path: scanResult.bookMetadata.sourceFilePath,
    source_file_name: scanResult.bookMetadata.sourceFileName,
    source_text: JSON.stringify(parsed),
    classification: 'BOOK_METADATA',
  });

  logger.info('BOOK_METADATA_DETECTED', { projectId, module: 'book-metadata' });
}

export function importProjectDocumentsFromScan(
  projectId: string,
  scanResult: FolderScanResultDto,
  folderPath: string,
): number {
  const db = getDatabase();
  let count = 0;

  for (const doc of scanResult.projectDocuments) {
    if (doc.status !== 'new') continue;
    const fullPath = doc.sourceFilePath.startsWith(folderPath)
      ? doc.sourceFilePath
      : `${folderPath}/${doc.sourceFileName}`;
    let text = '';
    try {
      text = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }
    db.projectDocuments.upsert({
      project_id: projectId,
      document_type: doc.documentType,
      title: doc.sourceFileName,
      source_file_path: fullPath,
      source_file_name: doc.sourceFileName,
      source_text: text,
      content_hash: doc.contentHash,
      classification: 'PROJECT_DOCUMENT',
    });
    count += 1;
  }

  if (count > 0) {
    db.projects.updateMetadata(projectId, { book_profile_dirty: true });
    logger.info('PROJECT_DOCUMENT_DETECTED', { projectId, count, module: 'book-metadata' });
  }

  return count;
}

export function updateMetadataFromUserEdit(
  projectId: string,
  dto: Partial<ProjectMetadataDto>,
): ProjectMetadataDto | null {
  const db = getDatabase();
  const existingFields = parseMetadataFields(db.projects.getById(projectId)?.metadata_fields ?? null);
  const mergedFields = { ...existingFields, ...buildMetadataFieldsFromSource('USER_EDIT', 1) };

  for (const key of Object.keys(dto) as (keyof ProjectMetadataDto)[]) {
    if (key in mergedFields || key === 'title') {
      const fieldKey = key as keyof MetadataFieldsMap;
      if (mergedFields[fieldKey]) {
        mergedFields[fieldKey] = { source: 'USER_EDIT', confidence: 1, locked: true };
      }
    }
  }

  const patch: ProjectMetadataPatch = {
    title: dto.title,
    source_title: dto.sourceTitle ?? dto.titleCn,
    target_title: dto.targetTitle ?? dto.titleVi,
    title_cn: dto.titleCn ?? dto.sourceTitle,
    title_vi: dto.titleVi ?? dto.targetTitle,
    title_original: dto.titleOriginal,
    alternative_titles: dto.alternativeTitles ? JSON.stringify(dto.alternativeTitles) : undefined,
    author_name: dto.authorName,
    author_name_cn: dto.authorNameCn,
    genre: dto.genre,
    subgenres: dto.subgenres ? JSON.stringify(dto.subgenres) : undefined,
    publication_status: dto.publicationStatus,
    expected_chapter_count: dto.expectedChapterCount,
    description: dto.description,
    introduction: dto.introduction,
    official_summary: dto.officialSummary,
    notes: dto.notes,
    metadata_source: 'USER_EDIT',
    metadata_fields: JSON.stringify(mergedFields),
    book_profile_dirty: true,
  };

  db.projects.updateMetadata(projectId, patch);
  return projectRowToMetadataDto(db.projects.getById(projectId));
}

export function detectMetadataConflict(
  projectId: string,
  scanResult: FolderScanResultDto,
): { hasConflict: boolean; changedFields: string[] } {
  if (!scanResult.bookMetadata?.parsed) return { hasConflict: false, changedFields: [] };

  const db = getDatabase();
  const project = db.projects.getById(projectId);
  if (!project) return { hasConflict: false, changedFields: [] };

  const fields = parseMetadataFields(project.metadata_fields);
  const parsed = scanResult.bookMetadata.parsed;
  const mapped = metadataFromParsed(parsed);
  const changedFields: string[] = [];

  const check = (field: keyof ParsedBookMetadata, label: string, current: string | null | undefined, incoming: string | null | undefined): void => {
    if (!incoming || !current || incoming === current) return;
    const state = fields[field];
    if (state?.locked || sourceRank(state?.source) >= sourceRank('BOOK_INFO_FILE')) {
      changedFields.push(label);
    }
  };

  check('sourceTitle', 'source_title', project.source_title ?? project.title_cn, mapped.source_title);
  check('targetTitle', 'target_title', project.target_title ?? project.title_vi, mapped.target_title);
  check('authorName', 'author_name', project.author_name, mapped.author_name);
  check('genre', 'genre', project.genre, mapped.genre);
  check('description', 'description', project.description, mapped.description);
  check('officialSummary', 'official_summary', project.official_summary, mapped.official_summary);

  return { hasConflict: changedFields.length > 0, changedFields };
}
