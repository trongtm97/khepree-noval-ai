/** Term Vault scope priority — higher wins when matching same source text. */
export const TERM_SCOPES = [
  'GLOBAL',
  'GENRE',
  'SERIES',
  'USER',
  'PROJECT',
  'CHAPTER',
  'CONTEXT',
] as const;

export type TermScope = (typeof TERM_SCOPES)[number];

/** Numeric priority for resolution (higher = preferred). Nearest scope wins. */
export const TERM_SCOPE_PRIORITY: Record<TermScope, number> = {
  CHAPTER: 600,
  PROJECT: 500,
  SERIES: 450,
  CONTEXT: 400,
  USER: 300,
  GENRE: 200,
  GLOBAL: 100,
};

/** Locked terms at PROJECT or CHAPTER beat inherited series/genre/global. */
export const LOCKED_PROJECT_BOOST = 1000;

export const TERM_STATUSES = [
  'DISCOVERED',
  'CANDIDATE',
  'PROJECT_VERIFIED',
  'GENRE_VERIFIED',
  'GLOBAL_VERIFIED',
  'LOCKED',
  'REJECTED',
] as const;

export type TermStatus = (typeof TERM_STATUSES)[number];

export const TERM_TYPES = [
  'PERSON',
  'SECT',
  'LOCATION',
  'CULTIVATION_LEVEL',
  'TECHNIQUE',
  'SKILL',
  'WEAPON',
  'ITEM',
  'PILL',
  'HERB',
  'TITLE',
  'ORGANIZATION',
  'CREATURE',
  'IDIOM',
  'GENERAL',
  'OTHER',
] as const;

export type TermType = (typeof TERM_TYPES)[number];

export const CANDIDATE_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'MERGED'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const REVIEW_ACTIONS = [
  'accept',
  'reject',
  'edit',
  'merge',
  'promote',
  'lock',
] as const;

export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** Map legacy DB values → Phase 7 types. */
export const LEGACY_TERM_TYPE_MAP: Record<string, TermType> = {
  name: 'PERSON',
  place: 'LOCATION',
  item: 'ITEM',
  skill: 'SKILL',
  organization: 'ORGANIZATION',
  title: 'TITLE',
  other: 'OTHER',
};

export function normalizeTermType(raw: string): TermType {
  const upper = raw.toUpperCase();
  if ((TERM_TYPES as readonly string[]).includes(upper)) {
    return upper as TermType;
  }
  return LEGACY_TERM_TYPE_MAP[raw] ?? 'OTHER';
}
