import type { DatabaseManager } from '../db/database-manager';
import {
  resolveCharacterPreferredName,
  resolveRelationshipAddressTerms,
} from '../memory/edition-memory';

export interface AuditCharacterEntity {
  id: string;
  sourceName: string;
  preferredName: string | null;
  aliases: string[];
  gender: string | null;
  /** All acceptable target forms (preferred + aliases that look like targets). */
  acceptableTargets: string[];
}

export interface AuditTermEntity {
  source: string;
  preferred: string;
  locked: boolean;
  category: string | null;
}

export interface AuditParagraphRef {
  paragraphUuid: string;
  stableId: string;
  chapterId: string;
  chapterNumber: number | null;
  sourceText: string;
  targetText: string;
  humanLocked: boolean;
}

export interface WholeBookAuditIndex {
  projectId: string;
  editionId: string | null;
  characters: AuditCharacterEntity[];
  /** sourceName lower → character */
  characterBySource: Map<string, AuditCharacterEntity>;
  /** All acceptable target name forms → character id (aliases OK). */
  acceptableNameToCharacter: Map<string, string>;
  terms: AuditTermEntity[];
  lockedTerms: AuditTermEntity[];
  addressForms: { from: string; to: string; aCallsB: string | null; bCallsA: string | null }[];
  placesOrgs: AuditTermEntity[];
  skillsRanks: AuditTermEntity[];
  paragraphs: AuditParagraphRef[];
  chapters: {
    id: string;
    chapterNumber: number | null;
    paragraphCount: number;
    translatedCount: number;
    emptyCount: number;
  }[];
  storyStateSummary: string | null;
}

function classifyTermCategory(raw: string | null | undefined): string {
  return (raw ?? '').toLowerCase();
}

/**
 * Build local aggregate index for whole-book audit.
 * Project-scoped only — never pulls other novels.
 */
export function buildWholeBookAuditIndex(
  db: DatabaseManager,
  projectId: string,
  editionId?: string | null,
): WholeBookAuditIndex {
  const project = db.projects.getById(projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  const ed = editionId ?? project.active_edition_id;

  const characters: AuditCharacterEntity[] = [];
  const characterBySource = new Map<string, AuditCharacterEntity>();
  const acceptableNameToCharacter = new Map<string, string>();

  for (const row of db.characters.listByProject(projectId)) {
    const preferred = ed
      ? resolveCharacterPreferredName(db, row, ed)
      : row.translated_name;
    const aliases = db.characters.listAliases(row.id).map((a) => a.alias);
    const acceptableTargets = [
      ...(preferred?.trim() ? [preferred.trim()] : []),
      ...aliases.map((a) => a.trim()).filter(Boolean),
    ];
    const entity: AuditCharacterEntity = {
      id: row.id,
      sourceName: row.canonical_name,
      preferredName: preferred,
      aliases,
      gender: row.gender,
      acceptableTargets,
    };
    characters.push(entity);
    characterBySource.set(row.canonical_name.toLowerCase(), entity);
    for (const t of acceptableTargets) {
      acceptableNameToCharacter.set(t.toLowerCase(), row.id);
    }
  }

  const terms: AuditTermEntity[] = [];
  const lockedTerms: AuditTermEntity[] = [];
  const placesOrgs: AuditTermEntity[] = [];
  const skillsRanks: AuditTermEntity[] = [];

  for (const t of db.terms.listAllForProject(projectId)) {
    const sourceRaw =
      t.source_text != null && t.source_text.length > 0
        ? t.source_text
        : t.source_simplified;
    const target = db.terms.getPrimaryTranslation(t.id);
    if (!sourceRaw?.trim() || !target?.trim()) continue;
    const entity: AuditTermEntity = {
      source: sourceRaw,
      preferred: target,
      locked: t.locked === 1,
      category: t.term_type ?? null,
    };
    terms.push(entity);
    if (entity.locked) lockedTerms.push(entity);
    const cat = classifyTermCategory(t.term_type);
    if (
      cat.includes('place') ||
      cat.includes('location') ||
      cat.includes('org') ||
      cat.includes('faction') ||
      cat.includes('sect')
    ) {
      placesOrgs.push(entity);
    }
    if (
      cat.includes('skill') ||
      cat.includes('technique') ||
      cat.includes('rank') ||
      cat.includes('cultivation') ||
      cat.includes('realm')
    ) {
      skillsRanks.push(entity);
    }
  }

  const addressForms: WholeBookAuditIndex['addressForms'] = [];
  if (ed) {
    for (const rel of db.relationships.listByProject(projectId)) {
      const forms = resolveRelationshipAddressTerms(db, rel, ed);
      addressForms.push({
        from: rel.from_character_id,
        to: rel.to_character_id,
        aCallsB: forms.aCallsB,
        bCallsA: forms.bCallsA,
      });
    }
  }

  const paragraphs: AuditParagraphRef[] = [];
  const chapters: WholeBookAuditIndex['chapters'] = [];

  for (const ch of db.chapters.listByProject(projectId)) {
    let translatedCount = 0;
    let emptyCount = 0;
    let paragraphCount = 0;
    for (const para of db.paragraphs.listByChapter(ch.id)) {
      paragraphCount += 1;
      const tr = db.translations.getByParagraphId(para.id, ed);
      const targetText = tr?.translated_text ?? '';
      const humanLocked = tr?.human_locked === 1;
      if (targetText.trim()) translatedCount += 1;
      else emptyCount += 1;
      paragraphs.push({
        paragraphUuid: para.id,
        stableId: para.paragraph_id,
        chapterId: ch.id,
        chapterNumber: ch.chapter_number,
        sourceText: para.source_text ?? '',
        targetText,
        humanLocked,
      });
    }
    chapters.push({
      id: ch.id,
      chapterNumber: ch.chapter_number,
      paragraphCount,
      translatedCount,
      emptyCount,
    });
  }

  const story = db.storyStates.getByProject(projectId);
  const storyStateSummary = story
    ? [
        story.summary_text,
        story.cultivation_state,
        story.location_state,
        story.current_chapter_number != null
          ? `ch=${story.current_chapter_number}`
          : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : null;

  return {
    projectId,
    editionId: ed,
    characters,
    characterBySource,
    acceptableNameToCharacter,
    terms,
    lockedTerms,
    addressForms,
    placesOrgs,
    skillsRanks,
    paragraphs,
    chapters,
    storyStateSummary,
  };
}
