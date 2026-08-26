import { z } from 'zod';

export const BootstrapCharacterSchema = z.object({
  source_name: z.string().min(1),
  preferred_vi: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional().default([]),
  first_seen_chapter: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const BootstrapRelationshipSchema = z.object({
  character_a: z.string().min(1),
  character_b: z.string().min(1),
  relationship_type: z.string().min(1),
  a_calls_b: z.string().nullable().optional(),
  b_calls_a: z.string().nullable().optional(),
  valid_from_chapter: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const BootstrapTermSchema = z.object({
  source: z.string().min(1),
  preferred_vi: z.string().min(1),
  category: z.string().optional(),
  first_seen_chapter: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

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
