import type { DatabaseManager } from '../db/database-manager';
import type { ParsedBookMetadata } from '../source-folder/book-info-parser';
import { DEFAULT_BOOK_PROFILE_CHAR_BUDGET } from '@shared/constants/book-metadata';

export interface BookProfileOptions {
  charBudget?: number;
  mainCharacter?: string;
  setting?: string;
  translationStyle?: string;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function joinGenres(genre: string | null, subgenres: string | null): string {
  const parts: string[] = [];
  if (genre?.trim()) parts.push(genre.trim());
  if (subgenres?.trim()) {
    try {
      const parsed = JSON.parse(subgenres) as string[];
      if (Array.isArray(parsed)) parts.push(...parsed.filter(Boolean));
    } catch {
      parts.push(subgenres);
    }
  }
  return [...new Set(parts)].join(', ');
}

/** Build compact book profile for AI prompts — not full metadata dump. */
export function buildBookProfile(
  db: DatabaseManager,
  projectId: string,
  options: BookProfileOptions = {},
): string {
  const project = db.projects.getById(projectId);
  if (!project) return '';

  const budget = options.charBudget ?? DEFAULT_BOOK_PROFILE_CHAR_BUDGET;
  const lines: string[] = ['[BOOK PROFILE]', ''];

  const push = (label: string, value: string | null | undefined): void => {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  push('Tên gốc', project.title_cn);
  push('Tên Việt', project.title_vi ?? project.title);
  push('Tác giả', project.author_name ?? project.author_name_cn);
  push('Thể loại', joinGenres(project.genre, project.subgenres));

  if (options.mainCharacter) push('Nhân vật chính', options.mainCharacter);
  if (options.setting) push('Bối cảnh', options.setting);
  if (options.translationStyle) push('Phong cách dịch', options.translationStyle);

  const descParts: string[] = [];
  if (project.description?.trim()) descParts.push(project.description.trim());
  if (project.introduction?.trim()) descParts.push(project.introduction.trim());
  if (project.official_summary?.trim()) descParts.push(project.official_summary.trim());

  const combined = descParts.join('\n\n');
  if (combined) {
    lines.push('');
    lines.push(truncate(combined, Math.max(200, budget - lines.join('\n').length - 20)));
  }

  return truncate(lines.join('\n'), budget);
}

export function buildBookProfileMarkdown(
  db: DatabaseManager,
  projectId: string,
): string {
  const project = db.projects.getById(projectId);
  if (!project) return '# Thông tin truyện\n';

  const lines: string[] = ['# Thông tin truyện', ''];

  const push = (label: string, value: string | null | undefined): void => {
    if (value?.trim()) {
      lines.push(`${label}:`);
      lines.push(value.trim());
      lines.push('');
    }
  };

  push('Tên gốc', project.title_cn);
  push('Tên Việt', project.title_vi ?? project.title);
  push('Tác giả', project.author_name ?? project.author_name_cn);
  push('Thể loại', joinGenres(project.genre, project.subgenres));

  if (project.description?.trim()) {
    lines.push('## Mô tả', '', project.description.trim(), '');
  }
  if (project.official_summary?.trim()) {
    lines.push('## Tóm tắt chính thức', '', project.official_summary.trim(), '');
  }
  if (project.notes?.trim()) {
    lines.push('## Ghi chú quan trọng', '', project.notes.trim(), '');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function metadataFromParsed(parsed: ParsedBookMetadata): {
  title_cn?: string | null;
  title_vi?: string | null;
  title_original?: string | null;
  alternative_titles?: string | null;
  author_name?: string | null;
  author_name_cn?: string | null;
  genre?: string | null;
  subgenres?: string | null;
  publication_status?: string | null;
  expected_chapter_count?: number | null;
  description?: string | null;
  introduction?: string | null;
  official_summary?: string | null;
  notes?: string | null;
} {
  return {
    title_cn: parsed.titleCn ?? null,
    title_vi: parsed.titleVi ?? null,
    title_original: parsed.titleOriginal ?? null,
    alternative_titles: parsed.alternativeTitles?.length
      ? JSON.stringify(parsed.alternativeTitles)
      : null,
    author_name: parsed.authorName ?? null,
    author_name_cn: parsed.authorNameCn ?? null,
    genre: parsed.genre ?? null,
    subgenres: parsed.subgenres?.length ? JSON.stringify(parsed.subgenres) : null,
    publication_status: parsed.publicationStatus ?? null,
    expected_chapter_count: parsed.expectedChapterCount ?? null,
    description: parsed.description ?? null,
    introduction: parsed.introduction ?? null,
    official_summary: parsed.officialSummary ?? null,
    notes: parsed.notes ?? null,
  };
}
