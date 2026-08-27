import type { TermRow } from '../db/repositories/term-repository';
import type { CharacterRow } from '../db/repositories/character-repository';
import type { RelationshipRow } from '../db/repositories/relationship-repository';
import type { TermType } from '@shared/constants/term';

/** Footer metadata reserved from char budget — never slice mid-record to fit footer. */
export const KNOWLEDGE_METADATA_FOOTER_RESERVE = 280;

const CRITICAL_TERM_TYPES: readonly TermType[] = [
  'PERSON',
  'SECT',
  'LOCATION',
  'CULTIVATION_LEVEL',
  'TECHNIQUE',
  'SKILL',
  'ORGANIZATION',
  'TITLE',
  'WEAPON',
  'ITEM',
  'PILL',
  'HERB',
  'CREATURE',
  'IDIOM',
  'GENERAL',
  'OTHER',
];

const TERM_TYPE_RANK = new Map(CRITICAL_TERM_TYPES.map((t, i) => [t, i]));

const USER_VERIFIED_STATUSES = new Set([
  'PROJECT_VERIFIED',
  'GLOBAL_VERIFIED',
  'GENRE_VERIFIED',
  'LOCKED',
]);

export interface TermRankKey {
  tier: number;
  recentUsed: number;
  occurrence: number;
  typeRank: number;
  confidence: number;
  statusRank: number;
  id: string;
}

export function termRankKey(term: TermRow): TermRankKey {
  const locked = term.locked === 1 || term.status === 'LOCKED';
  const projectVerified = term.status === 'PROJECT_VERIFIED';
  const userVerified =
    term.scope === 'USER' && USER_VERIFIED_STATUSES.has(term.status);

  let tier: number;
  if (locked) tier = 0;
  else if (projectVerified && term.scope === 'PROJECT') tier = 1;
  else if (userVerified || term.status === 'GLOBAL_VERIFIED') tier = 2;
  else if (term.status === 'CANDIDATE' || term.status === 'DISCOVERED') tier = 7;
  else tier = 6;

  const typeRank = TERM_TYPE_RANK.get(term.term_type as TermType) ?? 99;
  const recentUsed = Date.parse(term.updated_at) || 0;
  const confidence = term.confidence ?? 0;

  const statusRank =
    term.status === 'LOCKED'
      ? 0
      : term.status === 'PROJECT_VERIFIED'
        ? 1
        : term.status === 'GLOBAL_VERIFIED'
          ? 2
          : term.status === 'GENRE_VERIFIED'
            ? 3
            : term.status === 'CANDIDATE'
              ? 5
              : 4;

  return {
    tier,
    recentUsed,
    occurrence: term.occurrence_count ?? 0,
    typeRank,
    confidence,
    statusRank,
    id: term.id,
  };
}

export function compareTermRank(a: TermRow, b: TermRow): number {
  const ka = termRankKey(a);
  const kb = termRankKey(b);
  if (ka.tier !== kb.tier) return ka.tier - kb.tier;
  if (ka.recentUsed !== kb.recentUsed) return kb.recentUsed - ka.recentUsed;
  if (ka.occurrence !== kb.occurrence) return kb.occurrence - ka.occurrence;
  if (ka.typeRank !== kb.typeRank) return ka.typeRank - kb.typeRank;
  if (ka.confidence !== kb.confidence) return kb.confidence - ka.confidence;
  if (ka.statusRank !== kb.statusRank) return ka.statusRank - kb.statusRank;
  return ka.id.localeCompare(kb.id);
}

export function sortTermsForKnowledge(terms: TermRow[]): TermRow[] {
  return [...terms].sort(compareTermRank);
}

export interface CharacterRankContext {
  currentChapter: number | null;
  recentWindowFrom: number | null;
}

function isMainCharacter(character: CharacterRow): boolean {
  if (character.locked === 1) return true;
  const role = (character.role ?? '').toLowerCase();
  return /protagonist|main|lead|hero|主角|nhân vật chính|chính/.test(role);
}

function isCurrentlyActive(
  character: CharacterRow,
  currentChapter: number | null,
): boolean {
  if (character.status !== 'active') return false;
  if (currentChapter == null) return true;
  const last = character.last_chapter;
  const first = character.first_chapter;
  if (last != null && last >= currentChapter - 3) return true;
  if (first != null && first <= currentChapter && (last == null || last >= currentChapter)) {
    return true;
  }
  return false;
}

function isRecentlySeen(
  character: CharacterRow,
  ctx: CharacterRankContext,
): boolean {
  if (ctx.currentChapter == null) return false;
  const last = character.last_chapter;
  if (last == null) return false;
  const windowFrom = ctx.recentWindowFrom ?? Math.max(1, ctx.currentChapter - 20);
  return last >= windowFrom;
}

function isImportantPersistent(character: CharacterRow): boolean {
  if (character.locked === 1) return true;
  if (character.first_chapter != null && character.last_chapter != null) {
    return character.last_chapter - character.first_chapter >= 10;
  }
  return false;
}

export interface CharacterRankKey {
  tier: number;
  lastChapter: number;
  span: number;
  id: string;
}

export function characterRankKey(
  character: CharacterRow,
  ctx: CharacterRankContext,
): CharacterRankKey {
  let tier: number;
  if (isMainCharacter(character)) tier = 0;
  else if (isCurrentlyActive(character, ctx.currentChapter)) tier = 1;
  else if (isRecentlySeen(character, ctx)) tier = 2;
  else if (isImportantPersistent(character)) tier = 3;
  else tier = 4;

  const lastChapter = character.last_chapter ?? 0;
  const span =
    character.first_chapter != null && character.last_chapter != null
      ? character.last_chapter - character.first_chapter
      : 0;

  return { tier, lastChapter, span, id: character.id };
}

export function compareCharacterRank(
  a: CharacterRow,
  b: CharacterRow,
  ctx: CharacterRankContext,
): number {
  const ka = characterRankKey(a, ctx);
  const kb = characterRankKey(b, ctx);
  if (ka.tier !== kb.tier) return ka.tier - kb.tier;
  if (ka.lastChapter !== kb.lastChapter) return kb.lastChapter - ka.lastChapter;
  if (ka.span !== kb.span) return kb.span - ka.span;
  return ka.id.localeCompare(kb.id);
}

export function sortCharactersForKnowledge(
  characters: CharacterRow[],
  ctx: CharacterRankContext,
): CharacterRow[] {
  return [...characters].sort((a, b) => compareCharacterRank(a, b, ctx));
}

export function isCurrentRelationship(
  rel: RelationshipRow,
  currentChapter: number | null,
): boolean {
  if (currentChapter == null) return rel.valid_to_chapter == null;
  if (rel.valid_to_chapter != null && rel.valid_to_chapter < currentChapter) return false;
  if (rel.valid_from_chapter != null && rel.valid_from_chapter > currentChapter) return false;
  return true;
}

export function compareRelationshipRank(
  a: RelationshipRow,
  b: RelationshipRow,
  currentChapter: number | null,
): number {
  const aCurrent = isCurrentRelationship(a, currentChapter) ? 0 : 1;
  const bCurrent = isCurrentRelationship(b, currentChapter) ? 0 : 1;
  if (aCurrent !== bCurrent) return aCurrent - bCurrent;
  const aFrom = a.valid_from_chapter ?? 0;
  const bFrom = b.valid_from_chapter ?? 0;
  if (aFrom !== bFrom) return bFrom - aFrom;
  if ((a.locked ?? 0) !== (b.locked ?? 0)) return (b.locked ?? 0) - (a.locked ?? 0);
  return a.id.localeCompare(b.id);
}

export function sortRelationshipsForKnowledge(
  relationships: RelationshipRow[],
  currentChapter: number | null,
): RelationshipRow[] {
  return [...relationships].sort((a, b) =>
    compareRelationshipRank(a, b, currentChapter),
  );
}

export function worldEntryPriority(key: string): number {
  const k = key.toLowerCase();
  if (/rule|law|system|realm|cultivation|currency|important|critical|core|canon/.test(k)) {
    return 0;
  }
  if (/sect|faction|country|region|power|level|境界/.test(k)) return 1;
  if (/trivia|note|misc|other|flavor|detail/.test(k)) return 3;
  return 2;
}

export function sortWorldKnowledgeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = worldEntryPriority(a);
    const pb = worldEntryPriority(b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}
