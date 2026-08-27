import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseManager } from '../../../src/main/db/database-manager';
import {
  NotebookKnowledgeBuilder,
  hashKnowledgeContent,
} from '../../../src/main/notebook/knowledge-builder';
import { KnowledgeBudgetBuilder } from '../../../src/main/notebook/knowledge-budget-builder';
import {
  compareTermRank,
  sortTermsForKnowledge,
} from '../../../src/main/notebook/knowledge-ranking';
import { KNOWLEDGE_SIZE_CAPS } from '@shared/constants/knowledge';

describe('KnowledgeBudgetBuilder', () => {
  it('never truncates inside a record at budget boundary', () => {
    const records = Array.from({ length: 50 }, (_, i) => ({
      id: `r-${i}`,
      text: `- term-${i} ${'x'.repeat(80)}`,
    }));
    const result = new KnowledgeBudgetBuilder(records).build({
      header: '# Terms',
      charBudget: 2_000,
      unitLabel: 'terms',
      knowledgeVersion: '42',
      section: 'project_terms',
    });
    expect(result.content.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.project_terms + 50);
    for (const line of result.content.split('\n')) {
      if (line.startsWith('- term-')) {
        expect(line.endsWith('…')).toBe(false);
      }
    }
    expect(result.content).toContain('Included:');
    expect(result.content).toContain('Knowledge version: 42');
    expect(result.metadata.omittedCount).toBeGreaterThan(0);
  });

  it('includes metadata with omitted count, not omitted list', () => {
    const records = [{ id: 'a', text: '- alpha' }, { id: 'b', text: '- beta' }];
    const result = new KnowledgeBudgetBuilder(records).build({
      header: '# T',
      charBudget: 40,
      unitLabel: 'terms',
      knowledgeVersion: 'v1',
      section: 'project_terms',
    });
    expect(result.content).toMatch(/Included: \d+ terms/);
    expect(result.content).toMatch(/Omitted: \d+ lower-priority terms/);
    expect(result.content).not.toContain('- beta');
  });
});

describe('NotebookKnowledgeBuilder semantic budget', () => {
  let db: DatabaseManager;
  let tmp: string;
  let projectId: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nt-kbb-'));
    db = new DatabaseManager({ dataDir: tmp, backupsDir: path.join(tmp, 'bak') });
    projectId = db.projects.create({ title: 'Budget Novel' }).id;
  });

  afterEach(() => {
    db.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('deterministic: same DB state → identical output', () => {
    for (let i = 0; i < 50; i += 1) {
      db.terms.create({
        source_simplified: `词${String(i).padStart(4, '0')}`,
        term_type: 'OTHER',
        scope: 'PROJECT',
        scope_ref: projectId,
        target_text: `từ ${i}`,
      });
    }
    const builder = new NotebookKnowledgeBuilder(db);
    const a = builder.buildProjectTerms(projectId);
    const b = builder.buildProjectTerms(projectId);
    expect(a).toBe(b);
    expect(hashKnowledgeContent(a)).toBe(hashKnowledgeContent(b));
  });

  it('includes locked term last in DB but first in output (10k terms)', () => {
    for (let i = 0; i < 10_000; i += 1) {
      db.terms.create({
        source_simplified: `批量${String(i).padStart(5, '0')}`,
        term_type: 'OTHER',
        scope: 'PROJECT',
        scope_ref: projectId,
        target_text: `bulk ${i}`,
        status: 'DISCOVERED',
      });
    }
    const locked = db.terms.create({
      source_simplified: '锁定词',
      term_type: 'PERSON',
      scope: 'PROJECT',
      scope_ref: projectId,
      target_text: 'Thuật LOCKED',
      locked: true,
      status: 'LOCKED',
    });

    const content = new NotebookKnowledgeBuilder(db).buildProjectTerms(projectId);
    expect(content).toContain('锁定词 → Thuật LOCKED');
    expect(content).toContain('[LOCKED]');
    expect(content.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.project_terms + 100);
    expect(content).toMatch(/Included: \d+ terms/);
    expect(content).toMatch(/Omitted: [\d,]+ lower-priority terms/);

    const lockedPos = content.indexOf('锁定词');
    const firstBulk = content.indexOf('批量');
    if (firstBulk >= 0) {
      expect(lockedPos).toBeLessThan(firstBulk);
    }
    expect(sortTermsForKnowledge(db.terms.listAllForProject(projectId))[0]?.id).toBe(locked.id);
  });

  it('respects character budget with 500 characters without mid-record cut', () => {
    for (let i = 0; i < 500; i += 1) {
      const ch = db.characters.create({
        project_id: projectId,
        canonical_name: `角色${String(i).padStart(3, '0')}`,
        translated_name: `Nhân ${i}`,
        role: i === 0 ? 'protagonist' : 'minor',
        first_chapter: 1,
        last_chapter: i === 0 ? 500 : 5,
      });
      if (i === 0) {
        db.characters.update(ch.id, { locked: true });
      }
    }

    const content = new NotebookKnowledgeBuilder(db).buildCharacters(projectId);
    expect(content.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.characters + 200);
    expect(content).toContain('角色000');
    expect(content).toMatch(/Included: \d+ characters/);
    expect(content).toMatch(/Omitted: [\d,]+ lower-priority characters/);
    for (const block of content.split('\n## ')) {
      expect(block.includes('…') && block.length < 20).toBe(false);
    }
  });

  it('recent context uses rolling window — size stable as chapters grow', () => {
    db.storyStates.patch(projectId, { currentChapterNumber: 100, summaryText: 'State' });
    for (let ch = 1; ch <= 100; ch += 1) {
      db.memoryEvents.upsert({
        project_id: projectId,
        category: 'plot',
        event_key: `event-${ch}`,
        event_value: `value-${ch}`,
        chapter_number: ch,
      });
    }
    const at100 = new NotebookKnowledgeBuilder(db).buildRecentContext(projectId);
    db.storyStates.patch(projectId, { currentChapterNumber: 200 });
    for (let ch = 101; ch <= 200; ch += 1) {
      db.memoryEvents.upsert({
        project_id: projectId,
        category: 'plot',
        event_key: `event-${ch}`,
        event_value: `value-${ch}`,
        chapter_number: ch,
      });
    }
    const at200 = new NotebookKnowledgeBuilder(db).buildRecentContext(projectId);
    expect(at100.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.recent_context + 100);
    expect(at200.length).toBeLessThanOrEqual(KNOWLEDGE_SIZE_CAPS.recent_context + 100);
    expect(Math.abs(at200.length - at100.length)).toBeLessThan(500);
    expect(at200).not.toMatch(/\n### Chương 1\n/);
    expect(at200).not.toContain('event-1=value');
  });

  it('term ranking order: LOCKED before PROJECT_VERIFIED before candidates', () => {
    const candidate = db.terms.create({
      source_simplified: '候选',
      scope: 'PROJECT',
      scope_ref: projectId,
      target_text: 'ứng viên',
      status: 'CANDIDATE',
    });
    const verified = db.terms.create({
      source_simplified: '已确认',
      scope: 'PROJECT',
      scope_ref: projectId,
      target_text: 'xác nhận',
      status: 'PROJECT_VERIFIED',
    });
    const locked = db.terms.create({
      source_simplified: '锁定',
      scope: 'PROJECT',
      scope_ref: projectId,
      target_text: 'khoá',
      locked: true,
      status: 'LOCKED',
    });
    const sorted = sortTermsForKnowledge(db.terms.listAllForProject(projectId));
    expect(sorted.map((t) => t.id)).toEqual([locked.id, verified.id, candidate.id]);
    expect(compareTermRank(candidate, verified)).toBeGreaterThan(0);
  });
});
