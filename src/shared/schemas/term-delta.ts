import { z } from 'zod';

/** Categories allowed in AI TERM_DELTA (protocol contract). */
export const TERM_DELTA_CATEGORIES = [
  'name',
  'place',
  'item',
  'skill',
  'other',
] as const;

export const TERM_DELTA_CONFIDENCES = ['low', 'medium', 'high'] as const;

export const TermDeltaDiscoverSchema = z.object({
  action: z.literal('discover'),
  source: z.string().min(1),
  target: z.string().min(1),
  reading: z.string().optional(),
  category: z.enum(TERM_DELTA_CATEGORIES),
  confidence: z.enum(TERM_DELTA_CONFIDENCES).optional(),
  notes: z.string().optional(),
});

export const TermDeltaUpdateSchema = z.object({
  action: z.literal('update'),
  source: z.string().min(1),
  target: z.string().min(1),
  category: z.enum(TERM_DELTA_CATEGORIES).optional(),
  notes: z.string().optional(),
});

export const TermDeltaConfirmSchema = z.object({
  action: z.literal('confirm'),
  source: z.string().min(1),
  target: z.string().min(1),
});

export const TermDeltaItemSchema = z.discriminatedUnion('action', [
  TermDeltaDiscoverSchema,
  TermDeltaUpdateSchema,
  TermDeltaConfirmSchema,
]);

export type TermDeltaItem = z.infer<typeof TermDeltaItemSchema>;

export const TermDeltaSchema = z.array(TermDeltaItemSchema);

export function parseTermDelta(raw: unknown): TermDeltaItem[] {
  const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  return TermDeltaSchema.parse(parsed);
}

/** JSON Schema–like descriptors for prompt/docs (offline, no network). */
export const TERM_DELTA_JSON_SCHEMA = {
  $id: 'noveltrans.term_delta',
  type: 'array',
  items: {
    oneOf: [
      {
        type: 'object',
        required: ['action', 'source', 'target', 'category'],
        properties: {
          action: { const: 'discover' },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          reading: { type: 'string' },
          category: { enum: [...TERM_DELTA_CATEGORIES] },
          confidence: { enum: [...TERM_DELTA_CONFIDENCES] },
          notes: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['action', 'source', 'target'],
        properties: {
          action: { const: 'update' },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
          category: { enum: [...TERM_DELTA_CATEGORIES] },
          notes: { type: 'string' },
        },
      },
      {
        type: 'object',
        required: ['action', 'source', 'target'],
        properties: {
          action: { const: 'confirm' },
          source: { type: 'string', minLength: 1 },
          target: { type: 'string', minLength: 1 },
        },
      },
    ],
  },
} as const;

export const MEMORY_DELTA_JSON_SCHEMA = {
  $id: 'noveltrans.memory_delta',
  type: 'array',
  items: {
    oneOf: [
      {
        type: 'object',
        required: ['action', 'category', 'key', 'value'],
        properties: {
          action: { const: 'upsert' },
          category: {
            enum: [
              'plot',
              'world',
              'glossary',
              'character',
              'custom',
              'cultivation',
              'location',
              'item',
              'plot_point',
            ],
          },
          key: { type: 'string', minLength: 1 },
          value: {
            oneOf: [{ type: 'string' }, { type: 'object' }],
          },
          chapterNumber: { type: 'integer', minimum: 1 },
        },
      },
      {
        type: 'object',
        required: ['action', 'category', 'key'],
        properties: {
          action: { const: 'delete' },
          category: { type: 'string', minLength: 1 },
          key: { type: 'string', minLength: 1 },
        },
      },
      {
        type: 'object',
        required: ['action', 'from', 'to', 'type'],
        properties: {
          action: { const: 'relationship' },
          from: { type: 'string', minLength: 1 },
          to: { type: 'string', minLength: 1 },
          type: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          aCallsB: { type: 'string' },
          bCallsA: { type: 'string' },
          validFromChapter: { type: 'integer', minimum: 1 },
          validToChapter: { type: 'integer', minimum: 1 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      {
        type: 'object',
        required: ['action'],
        properties: {
          action: { const: 'story_state' },
          summaryText: { type: 'string' },
          cultivationState: { type: 'object' },
          locationState: { type: 'object' },
          importantItems: { type: 'array', items: { type: 'object' } },
          unresolvedPlotPoints: { type: 'array', items: { type: 'string' } },
          currentChapterNumber: { type: 'integer', minimum: 1 },
        },
      },
    ],
  },
} as const;
