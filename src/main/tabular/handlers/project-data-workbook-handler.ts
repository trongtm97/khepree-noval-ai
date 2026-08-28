import type { ProjectDataWorkbookSheet } from '@shared/constants/project-data-tabular';
import {
  PROJECT_DATA_COMMIT_ORDER,
  PROJECT_DATA_WARNINGS,
  PROJECT_SAFE_IMPORT_FIELDS,
} from '@shared/constants/project-data-tabular';
import type { MemoryEventCategory } from '@shared/constants/memory';
import type { TabularCommitContext, TabularRowValidation, TabularUndoEntry } from '../types';
import {
  isUuid,
  loadWorkbookRules,
  loadWorldFacts,
  mergeWorldFactsIntoJson,
  parseBool,
  parseOptionalInt,
  pick,
  saveWorkbookRules,
  type WorkbookRuleRow,
  type WorldFactRow,
} from './project-data-tabular-utils';
import { randomUUID } from 'node:crypto';

export function workbookSheetOrder(): ProjectDataWorkbookSheet[] {
  return [...PROJECT_DATA_COMMIT_ORDER];
}

export function validateProjectDataRow(
  sheet: ProjectDataWorkbookSheet,
  row: Record<string, string>,
  _rowIndex: number,
  ctx: TabularCommitContext,
): TabularRowValidation {
  switch (sheet) {
    case 'PROJECT':
      return validateProjectRow(row, ctx);
    case 'RULES':
      return validateRuleRow(row, ctx);
    case 'WORLD_KNOWLEDGE':
      return validateWorldRow(row, ctx);
    case 'STORY_FACTS':
      return validateStoryFactRow(row, ctx);
    default:
      return { status: 'error', messages: [`Unknown sheet ${sheet}`], normalized: {} };
  }
}

export function commitProjectDataRow(
  sheet: ProjectDataWorkbookSheet,
  row: Record<string, string>,
  ctx: TabularCommitContext,
): { action: 'insert' | 'update' | 'skip'; undo?: TabularUndoEntry } {
  switch (sheet) {
    case 'PROJECT':
      return commitProjectRow(row, ctx);
    case 'RULES':
      return commitRuleRow(row, ctx);
    case 'WORLD_KNOWLEDGE':
      return commitWorldRow(row, ctx);
    case 'STORY_FACTS':
      return commitStoryFactRow(row, ctx);
    default:
      throw new Error(`Unknown sheet ${sheet}`);
  }
}

function validateProjectRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [];
  const projectId = pick(row, 'project_id');
  if (!ctx.projectId) messages.push('projectId required');
  if (projectId && ctx.projectId && projectId !== ctx.projectId) {
    messages.push(PROJECT_DATA_WARNINGS.PROJECT_ID_MISMATCH);
  }
  if (pick(row, 'source_language') || pick(row, 'target_language')) {
    messages.push(PROJECT_DATA_WARNINGS.UNSAFE_PROJECT_FIELD);
  }
  const normalized: Record<string, string> = {
    _sheet: 'PROJECT',
    project_id: projectId || ctx.projectId || '',
    source_title: pick(row, 'source_title'),
    edition_title: pick(row, 'edition_title'),
    source_language: pick(row, 'source_language'),
    target_language: pick(row, 'target_language'),
    author: pick(row, 'author'),
    genre: pick(row, 'genre'),
    status: pick(row, 'status'),
    description: pick(row, 'description'),
    official_summary: pick(row, 'official_summary'),
  };
  return finalize(messages, normalized);
}

function validateRuleRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [];
  const ruleText = pick(row, 'rule_text');
  if (!ruleText) messages.push('rule_text required');
  const ruleId = pick(row, 'rule_id') || randomUUID();
  if (pick(row, 'rule_id') && !isUuid(ruleId) && !ruleId.startsWith('rule-') && !ruleId.startsWith('critical-')) {
    // allow stable string ids from export
  }
  const normalized: Record<string, string> = {
    _sheet: 'RULES',
    rule_id: ruleId,
    priority: pick(row, 'priority') || '100',
    category: pick(row, 'category') || 'general',
    rule_text: ruleText,
    enabled: parseBool(pick(row, 'enabled', '1')) ? '1' : '0',
    locked: parseBool(pick(row, 'locked')) ? '1' : '0',
  };
  if (ctx.projectId && normalized.locked === '1') {
    const existing = loadWorkbookRules(ctx.db, ctx.projectId).find((r) => r.rule_id === ruleId);
    if (existing?.locked && existing.rule_text !== ruleText) {
      messages.push(PROJECT_DATA_WARNINGS.RULE_LOCKED);
    }
  }
  return finalize(messages, normalized);
}

function validateWorldRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [];
  const sourceKey = pick(row, 'source_key');
  if (!sourceKey) messages.push('source_key required');
  const factId = pick(row, 'fact_id') || sourceKey || randomUUID();
  const normalized: Record<string, string> = {
    _sheet: 'WORLD_KNOWLEDGE',
    fact_id: factId,
    category: pick(row, 'category') || 'world',
    source_key: sourceKey,
    target_label: pick(row, 'target_label'),
    description: pick(row, 'description'),
    first_seen_chapter: pick(row, 'first_seen_chapter'),
    valid_from_chapter: pick(row, 'valid_from_chapter'),
    confidence: pick(row, 'confidence'),
    locked: parseBool(pick(row, 'locked')) ? '1' : '0',
  };
  if (ctx.projectId && normalized.locked === '0') {
    const existing = loadWorldFacts(ctx.db, ctx.projectId).find(
      (f) => f.fact_id === factId || f.source_key === sourceKey,
    );
    if (existing?.locked) messages.push(PROJECT_DATA_WARNINGS.WORLD_FACT_LOCKED);
  }
  return finalize(messages, normalized);
}

function validateStoryFactRow(row: Record<string, string>, ctx: TabularCommitContext): TabularRowValidation {
  const messages: string[] = [PROJECT_DATA_WARNINGS.STORY_FACTS_ADVANCED];
  const key = pick(row, 'key');
  const category = pick(row, 'category') || 'custom';
  if (!key) messages.push('key required');
  const memoryId = pick(row, 'memory_id');
  if (memoryId && isUuid(memoryId)) {
    const existing = ctx.db
      .getConnection()
      .prepare(`SELECT * FROM memory_events WHERE id = ?`)
      .get(memoryId);
    if (existing && (existing as { locked: number }).locked === 1) {
      messages.push(PROJECT_DATA_WARNINGS.MEMORY_LOCKED);
    }
  }
  const normalized: Record<string, string> = {
    _sheet: 'STORY_FACTS',
    memory_id: memoryId,
    category,
    key,
    value: pick(row, 'value'),
    chapter: pick(row, 'chapter'),
    valid_from: pick(row, 'valid_from'),
    valid_to: pick(row, 'valid_to'),
  };
  return finalize(messages, normalized, true);
}

function commitProjectRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const projectId = ctx.projectId!;
  const db = ctx.db;
  const prior = db.projects.getById(projectId);
  if (!prior) throw new Error(`Project not found: ${projectId}`);

  const patch: Record<string, string | null> = {};
  if (row.source_title) {
    patch.source_title = row.source_title;
    patch.title_cn = row.source_title;
  }
  if (row.edition_title) {
    patch.target_title = row.edition_title;
    patch.title_vi = row.edition_title;
    if (ctx.editionId) {
      db.getConnection()
        .prepare(`UPDATE translation_editions SET name = ? WHERE id = ?`)
        .run(row.edition_title, ctx.editionId);
    }
  }
  if (row.author) patch.author_name = row.author;
  if (row.genre) patch.genre = row.genre;
  if (row.description) patch.description = row.description;
  if (row.official_summary) patch.official_summary = row.official_summary;

  for (const key of Object.keys(row)) {
    if (!PROJECT_SAFE_IMPORT_FIELDS.has(key) && key !== '_sheet' && key !== 'project_id' && row[key]) {
      // blocked unsafe fields already warned at validate
    }
  }

  db.projects.updateMetadata(projectId, patch);
  return {
    action: 'update' as const,
    undo: {
      entityType: 'project_metadata',
      entityId: projectId,
      action: 'update' as const,
      prior: { project: prior },
    },
  };
}

function commitRuleRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const projectId = ctx.projectId!;
  const priorRules = loadWorkbookRules(ctx.db, projectId);
  const rule: WorkbookRuleRow = {
    rule_id: row.rule_id,
    priority: parseOptionalInt(row.priority) ?? 100,
    category: row.category || 'general',
    rule_text: row.rule_text,
    enabled: row.enabled === '1',
    locked: row.locked === '1',
  };
  const existingIdx = priorRules.findIndex((r) => r.rule_id === rule.rule_id);
  const next = [...priorRules];
  if (existingIdx >= 0) {
    if (priorRules[existingIdx]!.locked && !rule.locked) {
      return { action: 'skip' as const };
    }
    next[existingIdx] = rule;
  } else {
    next.push(rule);
  }
  saveWorkbookRules(ctx.db, projectId, next);
  return {
    action: existingIdx >= 0 ? ('update' as const) : ('insert' as const),
    undo: {
      entityType: 'project_rules',
      entityId: projectId,
      action: 'update' as const,
      prior: { rules: priorRules },
    },
  };
}

function commitWorldRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const projectId = ctx.projectId!;
  const db = ctx.db;
  const story = db.storyStates.ensure(projectId);
  const priorFacts = loadWorldFacts(db, projectId);
  const fact: WorldFactRow = {
    fact_id: row.fact_id,
    category: row.category || 'world',
    source_key: row.source_key,
    target_label: row.target_label,
    description: row.description,
    first_seen_chapter: parseOptionalInt(row.first_seen_chapter),
    valid_from_chapter: parseOptionalInt(row.valid_from_chapter),
    confidence: parseOptionalInt(row.confidence),
    locked: row.locked === '1',
  };
  const idx = priorFacts.findIndex(
    (f) => f.fact_id === fact.fact_id || f.source_key === fact.source_key,
  );
  const next = [...priorFacts];
  if (idx >= 0) {
    if (priorFacts[idx]!.locked && !fact.locked) return { action: 'skip' as const };
    next[idx] = fact;
  } else {
    next.push(fact);
  }
  const merged = mergeWorldFactsIntoJson(story.world_knowledge_json, next);
  db.storyStates.patch(projectId, {
    worldKnowledge: JSON.parse(merged) as Record<string, unknown>,
  });
  return {
    action: idx >= 0 ? ('update' as const) : ('insert' as const),
    undo: {
      entityType: 'world_knowledge',
      entityId: projectId,
      action: 'update' as const,
      prior: { world_knowledge_json: story.world_knowledge_json, facts: priorFacts },
    },
  };
}

function commitStoryFactRow(row: Record<string, string>, ctx: TabularCommitContext) {
  const projectId = ctx.projectId!;
  const db = ctx.db;
  const category = row.category as MemoryEventCategory;
  const key = row.key;
  const valuePayload = JSON.stringify({
    value: row.value,
    valid_from: parseOptionalInt(row.valid_from),
    valid_to: parseOptionalInt(row.valid_to),
  });
  const existingByKey = db.memoryEvents.getByKey(projectId, category, key);
  const prior = existingByKey ? { ...existingByKey } : null;

  if (existingByKey?.locked === 1) return { action: 'skip' as const };

  const upserted = db.memoryEvents.upsert({
    project_id: projectId,
    category,
    event_key: key,
    event_value: valuePayload,
    source: 'import',
    chapter_number: parseOptionalInt(row.chapter),
  });

  return {
    action: prior ? ('update' as const) : ('insert' as const),
    undo: {
      entityType: 'memory_event',
      entityId: upserted.id,
      action: prior ? ('update' as const) : ('insert' as const),
      prior: prior ? { event: prior } : null,
    },
  };
}

function finalize(
  messages: string[],
  normalized: Record<string, string>,
  advancedOnly = false,
): TabularRowValidation {
  const blocking = messages.filter(
    (m) =>
      m.includes('required') ||
      m === PROJECT_DATA_WARNINGS.PROJECT_ID_MISMATCH ||
      m === PROJECT_DATA_WARNINGS.WORLD_FACT_LOCKED ||
      m === PROJECT_DATA_WARNINGS.RULE_LOCKED ||
      m === PROJECT_DATA_WARNINGS.MEMORY_LOCKED,
  );
  const status =
    blocking.length > 0 ? 'error' : messages.length > 0 ? 'warning' : 'valid';
  if (advancedOnly && status === 'valid') {
    return { status: 'warning', messages, normalized };
  }
  return { status, messages, normalized };
}
