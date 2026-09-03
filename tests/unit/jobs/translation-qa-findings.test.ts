import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, getDatabase, initializeDatabase } from '@main/db/connection';
import { pathsService } from '@main/services/paths-service';
import { ensureDefaultEdition } from '@main/services/edition-service';
import {
  checkDialoguePunctuation,
  checkLengthAnomaly,
  checkNumberUnitMismatch,
  checkRepeatedContent,
  checkUnverifiableContent,
  runExtendedLocalChecks,
} from '@main/jobs/extended-local-checks';
import {
  applyValidatedPatch,
  validateRepairPatch,
} from '@main/jobs/repair-patch-validate';
import {
  filterDismissedIssues,
  filterQaByRepairScope,
  findingDismissKey,
  runLocalQaWithPolicy,
} from '@main/jobs/qa-policy';
import { getTranslationQaFindingsService } from '@main/services/translation-qa-findings-service';
import { hashSourceText } from '@main/db/repositories/translation-qa-findings-repository';
import type { ParsedBatchResult, QaResult } from '@shared/schemas/output-protocol';

function emptyParsed(
  translations: { paragraphId: string; text: string }[],
): ParsedBatchResult {
  return {
    status: 'ok',
    translations,
    termDeltas: [],
    memoryDeltas: [],
    warnings: [],
    recoveryUsed: false,
    protocolVersion: 2,
  };
}

describe('Prompt 09 — local QA findings + targeted patch', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nts-qa09-'));
    pathsService.initializeAt(tempRoot);
    initializeDatabase({
      dataDir: pathsService.getPath('data'),
      backupsDir: pathsService.getPath('backups'),
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('fixture: missing / extra / out-of-order structure', () => {
    const sources = [
      { paragraphId: '[C000001:P000001]', sourceText: '第一段内容很长足够。' },
      { paragraphId: '[C000001:P000002]', sourceText: '第二段内容很长足够。' },
    ];
    const parsed = emptyParsed([
      { paragraphId: '[C000001:P000002]', text: 'Đoạn hai' },
      { paragraphId: '[C000001:P000001]', text: 'Đoạn một' },
      { paragraphId: '[C000001:P009999]', text: 'Thừa' },
    ]);
    const qa = runLocalQaWithPolicy({
      parsed,
      sourceParagraphIds: sources.map((s) => s.paragraphId),
      sourceParagraphs: sources,
      qaLevel: 'basic',
    });
    expect(qa.unknownParagraphIds).toContain('[C000001:P009999]');
    expect(qa.outOfOrder).toBe(true);
    expect(
      qa.errors.some((e) => e.code === 'unknown_paragraph') ||
        qa.unknownParagraphIds.length > 0,
    ).toBe(true);
  });

  it('fixture: length anomaly, repeated content, number mismatch, dialogue', () => {
    const sources = [
      {
        paragraphId: '[C000001:P000001]',
        sourceText: '他花了100元买了2斤苹果。'.repeat(3),
      },
      {
        paragraphId: '[C000001:P000002]',
        sourceText: '「你好」他说。'.repeat(5),
      },
    ];
    const same = 'Đây là bản dịch lặp lại rất dài để kích hoạt check.';
    const translations = [
      {
        paragraphId: '[C000001:P000001]',
        text: 'x', // truncated
      },
      {
        paragraphId: '[C000001:P000002]',
        text: same,
      },
    ];
    // length
    expect(
      checkLengthAnomaly(sources, translations).some((i) => i.code === 'length_anomaly'),
    ).toBe(true);

    // repeated
    const repeated = checkRepeatedContent([
      { paragraphId: '[C000001:P000001]', text: same },
      { paragraphId: '[C000001:P000002]', text: same },
    ]);
    expect(repeated[0]?.code).toBe('repeated_content');

    // numbers: invent many numbers not in source
    const numIssues = checkNumberUnitMismatch(
      [{ paragraphId: '[C000001:P000001]', sourceText: '他有100元和2斤。' }],
      [
        {
          paragraphId: '[C000001:P000001]',
          text: 'Anh ta có 100 đồng và 999 cùng 888 và 777 đơn vị lạ.',
        },
      ],
    );
    expect(numIssues.some((i) => i.code === 'number_unit_mismatch')).toBe(true);

    // dialogue
    const dlg = checkDialoguePunctuation([
      { paragraphId: '[C000001:P000001]', text: '「Xin chào anh ấy nói' },
    ]);
    expect(dlg[0]?.code).toBe('dialogue_punctuation');

    // unverifiable latin in CJK source
    const hall = checkUnverifiableContent(
      [{ paragraphId: '[C000001:P000001]', sourceText: '他走进了房间看见桌子。' }],
      [
        {
          paragraphId: '[C000001:P000001]',
          text: 'He walked into Xenomorph Chamber with Hyperion Blaster.',
        },
      ],
      'en',
    );
    expect(hall.some((i) => i.code === 'unverifiable_content')).toBe(true);
  });

  it('fixture: glossary mismatch via locked term', () => {
    const sources = [
      { paragraphId: '[C000001:P000001]', sourceText: '李明走了过来。' },
    ];
    const parsed = emptyParsed([
      { paragraphId: '[C000001:P000001]', text: 'Lý Minh đã tới.' },
    ]);
    const qa = runLocalQaWithPolicy({
      parsed,
      sourceParagraphIds: ['[C000001:P000001]'],
      sourceParagraphs: sources,
      lockedTerms: [
        { source: '李明', preferred: 'Lý Minh Chính', forbiddenVariants: ['Lý Minh'] },
      ],
      qaLevel: 'basic',
    });
    expect(
      qa.errors.some(
        (e) =>
          e.code === 'locked_term_missing' ||
          e.code === 'locked_term_forbidden_variant',
      ),
    ).toBe(true);
  });

  it('patch does not change out-of-scope paragraphs', () => {
    const before = [
      { paragraphId: 'A', text: 'keep-a' },
      { paragraphId: 'B', text: 'fix-me' },
      { paragraphId: 'C', text: 'keep-c' },
    ];
    const patch = [
      { paragraphId: 'B', text: 'fixed-b' },
      { paragraphId: 'C', text: 'evil-change-c' },
      { paragraphId: 'D', text: 'invented' },
    ];
    const validation = validateRepairPatch({
      before,
      after: [
        { paragraphId: 'A', text: 'keep-a' },
        { paragraphId: 'B', text: 'fixed-b' },
        { paragraphId: 'C', text: 'evil-change-c' },
        { paragraphId: 'D', text: 'invented' },
      ],
      allowedIds: ['B'],
    });
    expect(validation.ok).toBe(false);
    expect(validation.violatedIds).toContain('C');
    expect(validation.unexpectedIds).toContain('D');

    const applied = applyValidatedPatch({
      base: before,
      patch,
      allowedIds: ['B'],
    });
    expect(applied.validation.ok).toBe(true);
    expect(applied.applied.find((l) => l.paragraphId === 'A')?.text).toBe('keep-a');
    expect(applied.applied.find((l) => l.paragraphId === 'B')?.text).toBe('fixed-b');
    expect(applied.applied.find((l) => l.paragraphId === 'C')?.text).toBe('keep-c');
  });

  it('dismiss false positive does not return while source unchanged', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'QA-Dismiss' });
    ensureDefaultEdition(db, project.id);
    const svc = getTranslationQaFindingsService(db);
    const source = '他花了100元。';
    const sourceHash = hashSourceText(source);

    const qa: QaResult = {
      verdict: 'PASS_WITH_WARNINGS',
      passed: true,
      errors: [],
      warnings: [
        {
          code: 'number_unit_mismatch',
          severity: 'warning',
          message: 'fp',
          paragraphId: '[C000001:P000001]',
          found: '999',
        },
      ],
      infos: [],
      missingParagraphIds: [],
      duplicateParagraphIds: [],
      unknownParagraphIds: [],
      emptyParagraphIds: [],
      corruptParagraphIds: [],
      outOfOrder: false,
    };

    svc.upsertFromQaResult({
      projectId: project.id,
      editionId: project.active_edition_id,
      qa,
      sourceByParagraphId: new Map([['[C000001:P000001]', source]]),
    });
    const listed = svc.list(project.id, { status: 'OPEN' });
    expect(listed.length).toBe(1);
    svc.dismiss(listed[0]!.id, 'false positive');

    // Re-upsert same source → stays dismissed
    svc.upsertFromQaResult({
      projectId: project.id,
      editionId: project.active_edition_id,
      qa,
      sourceByParagraphId: new Map([['[C000001:P000001]', source]]),
    });
    expect(svc.list(project.id, { status: 'OPEN' }).length).toBe(0);
    expect(svc.list(project.id, { status: 'DISMISSED' }).length).toBe(1);

    const filtered = filterDismissedIssues(
      qa,
      new Set([
        findingDismissKey('number_unit_mismatch', '[C000001:P000001]'),
      ]),
    );
    expect(filtered.warnings.length).toBe(0);
    expect(filtered.verdict).toBe('PASS');
    void sourceHash;
  });

  it('does not mix glossary/findings across projects', () => {
    const db = getDatabase();
    const a = db.projects.create({ title: 'ProjA' });
    const b = db.projects.create({ title: 'ProjB' });
    ensureDefaultEdition(db, a.id);
    ensureDefaultEdition(db, b.id);
    const svc = getTranslationQaFindingsService(db);

    const mkQa = (msg: string): QaResult => ({
      verdict: 'REPAIR_REQUIRED',
      passed: false,
      errors: [
        {
          code: 'locked_term_missing',
          severity: 'error',
          message: msg,
          paragraphId: '[C000001:P000001]',
          termSource: '李明',
          expected: 'Lý Minh',
        },
      ],
      warnings: [],
      infos: [],
      missingParagraphIds: [],
      duplicateParagraphIds: [],
      unknownParagraphIds: [],
      emptyParagraphIds: [],
      corruptParagraphIds: [],
      outOfOrder: false,
    });

    svc.upsertFromQaResult({
      projectId: a.id,
      qa: mkQa('A'),
      sourceByParagraphId: new Map([['[C000001:P000001]', '李明来了']]),
    });
    svc.upsertFromQaResult({
      projectId: b.id,
      qa: mkQa('B'),
      sourceByParagraphId: new Map([['[C000001:P000001]', '李明来了']]),
    });

    expect(svc.list(a.id).every((f) => f.projectId === a.id)).toBe(true);
    expect(svc.list(b.id).every((f) => f.projectId === b.id)).toBe(true);
    expect(svc.list(a.id)[0]?.message).toBe('A');
    expect(svc.list(b.id)[0]?.message).toBe('B');
  });

  it('repairScope structure_only blocks TERM_VIOLATION', () => {
    expect(filterQaByRepairScope('TERM_VIOLATION', 'structure_only').allowed).toBe(
      false,
    );
    expect(filterQaByRepairScope('MISSING_PARAGRAPH', 'structure_only').allowed).toBe(
      true,
    );
    expect(filterQaByRepairScope('TERM_VIOLATION', 'targeted').allowed).toBe(true);
  });

  it('human_locked findings go to ATTENTION not auto-repair action', () => {
    const db = getDatabase();
    const project = db.projects.create({ title: 'LockedQA' });
    ensureDefaultEdition(db, project.id);
    const editionId = db.projects.getById(project.id)!.active_edition_id!;
    const ch = db.chapters.create({
      project_id: project.id,
      chapter_number: 1,
      sequence_order: 1,
      source_text: '李明来了。',
      source_status: 'SOURCE_READY',
    });
    const para = db.paragraphs.create({
      chapter_id: ch.id,
      paragraph_id: '[C000001:P000001]',
      sequence: 1,
      source_text: '李明来了。',
    });
    db.translations.upsert({
      paragraph_id: para.id,
      edition_id: editionId,
      translated_text: 'wrong',
      version_source: 'HUMAN_EDIT',
      human_locked: true,
    });

    const svc = getTranslationQaFindingsService(db);
    svc.upsertFromQaResult({
      projectId: project.id,
      editionId,
      qa: {
        verdict: 'REPAIR_REQUIRED',
        passed: false,
        errors: [
          {
            code: 'empty_translation',
            severity: 'error',
            message: 'bad',
            paragraphId: '[C000001:P000001]',
          },
        ],
        warnings: [],
        infos: [],
        missingParagraphIds: [],
        duplicateParagraphIds: [],
        unknownParagraphIds: [],
        emptyParagraphIds: ['[C000001:P000001]'],
        corruptParagraphIds: [],
        outOfOrder: false,
      },
      humanLockedIds: new Set(['[C000001:P000001]']),
      sourceByParagraphId: new Map([['[C000001:P000001]', '李明来了。']]),
    });

    const rows = svc.list(project.id, { status: 'ATTENTION' });
    expect(rows.length).toBe(1);
    expect(rows[0]?.suggestedAction).toBe('attention_inbox');
  });

  it('extended checks skipped on basic qaLevel', () => {
    const sources = [
      {
        paragraphId: '[C000001:P000001]',
        sourceText: '他花了100元买了东西然后回家了。'.repeat(2),
      },
    ];
    const parsed = emptyParsed([
      { paragraphId: '[C000001:P000001]', text: 'x' },
    ]);
    const basic = runLocalQaWithPolicy({
      parsed,
      sourceParagraphIds: sources.map((s) => s.paragraphId),
      sourceParagraphs: sources,
      qaLevel: 'basic',
    });
    expect(basic.errors.some((e) => e.code === 'length_anomaly')).toBe(false);

    const standard = runLocalQaWithPolicy({
      parsed,
      sourceParagraphIds: sources.map((s) => s.paragraphId),
      sourceParagraphs: sources,
      qaLevel: 'standard',
    });
    expect(standard.errors.some((e) => e.code === 'length_anomaly')).toBe(true);

    const ext = runExtendedLocalChecks({
      parsed,
      sourceParagraphIds: sources.map((s) => s.paragraphId),
      sourceParagraphs: sources,
      includeExtended: true,
    });
    expect(ext.errors.length + ext.warnings.length).toBeGreaterThan(0);
  });
});
