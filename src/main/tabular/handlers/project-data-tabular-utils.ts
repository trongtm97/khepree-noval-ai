import type { DatabaseManager } from '../../db/database-manager';
import { DEFAULT_NOTEBOOK_SETTINGS } from '@shared/constants/knowledge';

export interface WorkbookRuleRow {
  rule_id: string;
  priority: number;
  category: string;
  rule_text: string;
  enabled: boolean;
  locked: boolean;
}

export interface WorldFactRow {
  fact_id: string;
  category: string;
  source_key: string;
  target_label: string;
  description: string;
  first_seen_chapter: number | null;
  valid_from_chapter: number | null;
  confidence: number | null;
  locked: boolean;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) return v.trim();
  }
  return '';
}

export function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function parseOptionalInt(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function loadWorkbookRules(db: DatabaseManager, projectId: string): WorkbookRuleRow[] {
  const config = db.projects.getStyleConfig(projectId);
  if (!config) return [];
  try {
    const parsed = JSON.parse(config) as {
      workbookRules?: WorkbookRuleRow[];
      rules?: string[];
      criticalRules?: string[];
    };
    if (Array.isArray(parsed.workbookRules) && parsed.workbookRules.length > 0) {
      return parsed.workbookRules;
    }
    const rows: WorkbookRuleRow[] = [];
    for (let i = 0; i < (parsed.criticalRules ?? []).length; i += 1) {
      const text = parsed.criticalRules![i]!;
      rows.push({
        rule_id: `critical-${i + 1}`,
        priority: i + 1,
        category: 'critical',
        rule_text: text,
        enabled: true,
        locked: false,
      });
    }
    for (let i = 0; i < (parsed.rules ?? []).length; i += 1) {
      const text = parsed.rules![i]!;
      rows.push({
        rule_id: `rule-${i + 1}`,
        priority: 100 + i,
        category: 'general',
        rule_text: text,
        enabled: true,
        locked: false,
      });
    }
    return rows;
  } catch {
    return [];
  }
}

export function saveWorkbookRules(
  db: DatabaseManager,
  projectId: string,
  rules: WorkbookRuleRow[],
): void {
  const existing = db.projects.getStyleConfig(projectId);
  let base: Record<string, unknown> = {};
  if (existing) {
    try {
      base = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  const enabled = rules.filter((r) => r.enabled);
  const criticalRules = enabled
    .filter((r) => r.category.toLowerCase() === 'critical')
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.rule_text);
  const normalRules = enabled
    .filter((r) => r.category.toLowerCase() !== 'critical')
    .sort((a, b) => a.priority - b.priority)
    .map((r) => r.rule_text);
  base.workbookRules = rules;
  base.rules = normalRules;
  base.criticalRules = criticalRules;
  if (!base.notebook) base.notebook = { ...DEFAULT_NOTEBOOK_SETTINGS };
  db.projects.setStyleConfig(projectId, JSON.stringify(base));
}

export function loadWorldFacts(db: DatabaseManager, projectId: string): WorldFactRow[] {
  const row = db.storyStates.getByProject(projectId);
  if (!row?.world_knowledge_json) return [];
  try {
    const parsed = JSON.parse(row.world_knowledge_json) as {
      _workbook_facts?: WorldFactRow[];
    };
    return Array.isArray(parsed._workbook_facts) ? parsed._workbook_facts : [];
  } catch {
    return [];
  }
}

export function mergeWorldFactsIntoJson(
  existingJson: string | null,
  facts: WorldFactRow[],
): string {
  let base: Record<string, unknown> = {};
  if (existingJson) {
    try {
      base = JSON.parse(existingJson) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  base._workbook_facts = facts;
  for (const fact of facts) {
    if (!fact.source_key) continue;
    base[fact.source_key] = {
      target_label: fact.target_label,
      description: fact.description,
      category: fact.category,
      fact_id: fact.fact_id,
      first_seen_chapter: fact.first_seen_chapter,
      valid_from_chapter: fact.valid_from_chapter,
      confidence: fact.confidence,
      locked: fact.locked,
    };
  }
  return JSON.stringify(base);
}
