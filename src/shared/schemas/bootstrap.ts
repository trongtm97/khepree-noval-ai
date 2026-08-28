import { z } from 'zod';

/** Legacy `preferred_vi` → core `preferred_target`. */
function resolvePreferredTarget(raw: Record<string, unknown>): unknown {
  if (typeof raw.preferred_target === 'string') return raw.preferred_target;
  if (typeof raw.preferred_target_name === 'string') return raw.preferred_target_name;
  if (typeof raw.preferredTargetName === 'string') return raw.preferredTargetName;
  if (typeof raw.targetText === 'string') return raw.targetText;
  if (typeof raw.preferred_vi === 'string') return raw.preferred_vi;
  return raw.preferred_target;
}

function normalizeGenderInput(raw: unknown): string | null | undefined {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'unknown' || s === 'null') return null;
  return String(raw).trim();
}

function normalizeCharacterInput(val: unknown): unknown {
  if (!val || typeof val !== 'object') return val;
  const o = { ...(val as Record<string, unknown>) };
  if (typeof o.canonical_source_name === 'string' && o.source_name == null) {
    o.source_name = o.canonical_source_name;
  }
  if (typeof o.canonicalSourceName === 'string' && o.source_name == null) {
    o.source_name = o.canonicalSourceName;
  }
  if (Array.isArray(o.source_aliases) && o.aliases == null) {
    o.aliases = o.source_aliases;
  }
  if (o.gender_if_explicit !== undefined && o.gender == null) {
    o.gender = o.gender_if_explicit;
  }
  o.gender = normalizeGenderInput(o.gender);
  o.preferred_target = resolvePreferredTarget(o);
  return o;
}

function normalizeTermInput(val: unknown): unknown {
  if (!val || typeof val !== 'object') return val;
  const o = { ...(val as Record<string, unknown>) };
  if (typeof o.sourceText === 'string' && o.source == null) {
    o.source = o.sourceText;
  }
  o.preferred_target = resolvePreferredTarget(o);
  if (o.transliteration == null && typeof o.reading === 'string') {
    o.transliteration = o.reading;
  }
  if (o.transliteration_system == null && typeof o.transliterationSystem === 'string') {
    o.transliteration_system = o.transliterationSystem;
  }
  return o;
}

export const BootstrapCharacterSchema = z.preprocess(
  normalizeCharacterInput,
  z.object({
    source_name: z.string().min(1),
    /** Preferred name in the project target edition language. */
    preferred_target: z.string().nullable().optional(),
    /** Prompt-facing alias of preferred_target. */
    preferred_target_name: z.string().nullable().optional(),
    /** Legacy input alias of preferred_target. */
    preferred_vi: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    gender_if_explicit: z.string().nullable().optional(),
    aliases: z.array(z.string()).optional().default([]),
    source_aliases: z.array(z.string()).optional(),
    first_seen_chapter: z.number().int().positive().nullable().optional(),
    discovered_from_chapter: z.number().int().positive().nullable().optional(),
    future_sensitive: z.boolean().optional().default(false),
    confidence: z.number().min(0).max(1).optional(),
    evidence: z.string().max(200).optional(),
    evidence_chapter: z.number().int().positive().nullable().optional(),
    evidence_source_name: z.string().max(120).optional(),
  }),
);

export const BootstrapRelationshipSchema = z.object({
  character_a: z.string().min(1),
  character_b: z.string().min(1),
  relationship_type: z.string().min(1),
  /** Language-neutral fact / description. */
  description: z.string().nullable().optional(),
  /** Edition-scoped forms of address for this target edition. */
  a_calls_b: z.string().nullable().optional(),
  b_calls_a: z.string().nullable().optional(),
  valid_from_chapter: z.number().int().positive().nullable().optional(),
  valid_to_chapter: z.number().int().positive().nullable().optional(),
  future_sensitive: z.boolean().optional().default(false),
  confidence: z.number().min(0).max(1).optional(),
});

export const BootstrapTermSchema = z.preprocess(
  normalizeTermInput,
  z.object({
    source: z.string().min(1),
    preferred_target: z.string().min(1),
    /** Legacy input alias of preferred_target. */
    preferred_vi: z.string().optional(),
    sourceText: z.string().optional(),
    targetText: z.string().optional(),
    /** Ignored at persist — application attaches pair from job/edition context. */
    sourceLanguage: z.string().optional(),
    targetLanguage: z.string().optional(),
    category: z.string().optional(),
    first_seen_chapter: z.number().int().positive().nullable().optional(),
    discovered_from_chapter: z.number().int().positive().nullable().optional(),
    future_sensitive: z.boolean().optional().default(false),
    confidence: z.number().min(0).max(1).optional(),
    transliteration: z.string().max(200).optional(),
    transliteration_system: z.string().max(64).optional(),
    transliterationSystem: z.string().max(64).optional(),
    reading: z.string().max(200).optional(),
    evidence_chapter: z.number().int().positive().nullable().optional(),
    evidence_source_name: z.string().max(120).optional(),
    notes: z.string().max(500).optional(),
  }),
);

export const BootstrapWorldKnowledgeSchema = z.object({
  cultivation_system: z.array(z.string()).optional().default([]),
  sects: z.array(z.string()).optional().default([]),
  locations: z.array(z.string()).optional().default([]),
  organizations: z.array(z.string()).optional().default([]),
  items: z.array(z.string()).optional().default([]),
  rules: z.array(z.string()).optional().default([]),
});

export const BootstrapStoryStateSchema = z.object({
  through_chapter: z.number().int().positive().nullable().optional(),
  current_locations: z.array(z.string()).optional().default([]),
  current_goals: z.array(z.string()).optional().default([]),
  current_conflicts: z.array(z.string()).optional().default([]),
  open_plot_threads: z.array(z.string()).optional().default([]),
  summary: z.string().optional().default(''),
});

export const BootstrapRecentContextSchema = z.object({
  through_chapter: z.number().int().positive().nullable().optional(),
  important_events: z.array(z.string()).optional().default([]),
});

export const BootstrapAnalysisOutputSchema = z.object({
  characters: z.array(BootstrapCharacterSchema).default([]),
  relationships: z.array(BootstrapRelationshipSchema).default([]),
  terms: z.array(BootstrapTermSchema).default([]),
  world_knowledge: BootstrapWorldKnowledgeSchema.default({}),
  story_state: BootstrapStoryStateSchema.default({}),
  recent_context: BootstrapRecentContextSchema.default({}),
});

export type BootstrapAnalysisOutput = z.infer<typeof BootstrapAnalysisOutputSchema>;

/** Extract first JSON object from model text; repair common trailing commas. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fence?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('BOOTSTRAP_PARSE: no JSON object found');
  }
  let raw = candidate.slice(start, end + 1);
  raw = raw.replace(/,\s*([\]}])/g, '$1');
  return JSON.parse(raw) as unknown;
}

export function parseBootstrapAnalysisOutput(text: string): BootstrapAnalysisOutput {
  const parsed = extractJsonObject(text);
  return BootstrapAnalysisOutputSchema.parse(parsed);
}

/** Resolve preferred target name from bootstrap character/term (legacy-safe). */
export function preferredTargetOf(
  row:
    | {
        preferred_target?: string | null;
        preferred_target_name?: string | null;
        preferred_vi?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!row) return null;
  return row.preferred_target ?? row.preferred_target_name ?? row.preferred_vi ?? null;
}

/** Canonical source name from character row (prompt or legacy field names). */
export function canonicalSourceNameOf(
  row: { source_name?: string } | null | undefined,
): string | null {
  if (!row?.source_name?.trim()) return null;
  return row.source_name.trim();
}
