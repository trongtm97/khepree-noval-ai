import { describe, expect, it } from 'vitest';
import {
  assemblePackPrompt,
  extractOperationPrompt,
  isRepairOrContinuationOp,
  splitRepairChannelPrompt,
} from '@main/prompt/pack-operation';
import type { TranslationPackDto } from '@shared/schemas/translation-pack';
import { newId } from '@main/db/utils/uuid';

function repairPack(overrides: Partial<TranslationPackDto> = {}): TranslationPackDto {
  const repairBody =
    'Translate ONLY [C000001:P000002]\n玄星玉 → must keep paragraph target';
  const split = splitRepairChannelPrompt({
    repairBody,
    operationType: 'REPAIR',
    packMode: 'slim',
    notebookId: 'nb-translation-a',
    lockedTerms: [{ source: '王林', preferred: 'Vương Lâm' }],
  });
  return {
    projectId: newId(),
    chapterIds: [newId()],
    chapterNumbers: [1],
    style: 'balanced',
    prompt: split.prompt,
    baseContext: split.baseContext,
    operationPrompt: split.operationPrompt,
    operationType: 'REPAIR',
    sections: {
      taskHeader: 'Repair',
      criticalRules: '',
      hotMemoryDelta: '',
      activeProjectTerms: '',
      sourceParagraphs: '',
      outputProtocol: '',
    },
    size: {
      sourceChars: split.operationPrompt.length,
      contextChars: split.baseContext.length,
      totalChars: split.prompt.length,
      estimatedTokens: 10,
      activeTermCount: 0,
      activeCharacterCount: 0,
      relationshipCount: 0,
      recentMemoryCount: 0,
      paragraphCount: 1,
      chapterCount: 1,
    },
    promptHash: 'repair-abc',
    ...overrides,
  };
}

/**
 * Simulates adaptPackForProvider WebAPI path: rebuild FAT baseContext,
 * keep operationPrompt unchanged.
 */
function adaptRepairToWebApiFat(
  pack: TranslationPackDto,
  fatSections: {
    criticalRules: string;
    hotMemoryDelta: string;
    activeProjectTerms: string;
    sourceParagraphs: string;
  },
): TranslationPackDto {
  const preservedOp =
    pack.operationPrompt.trim() || extractOperationPrompt(pack);
  const operationType = pack.operationType === 'CONTINUATION' ? 'CONTINUATION' : 'REPAIR';
  const repairBody = preservedOp
    .replace(/^## (?:Repair \/ continuation|Continuation) task\s*/i, '')
    .trim();
  const split = splitRepairChannelPrompt({
    repairBody,
    operationType,
    packMode: 'fat',
    webApiFat: true,
    fatSections,
  });
  const operationPrompt = pack.operationPrompt.trim() || split.operationPrompt;
  return {
    ...pack,
    baseContext: split.baseContext,
    operationPrompt,
    operationType,
    prompt: assemblePackPrompt({
      baseContext: split.baseContext,
      operationPrompt,
    }),
    sections: {
      ...pack.sections,
      criticalRules: fatSections.criticalRules,
      hotMemoryDelta: fatSections.hotMemoryDelta,
      activeProjectTerms: fatSections.activeProjectTerms,
      // FAT translate dump must NOT become the operation
      sourceParagraphs: '',
      outputProtocol: '',
    },
  };
}

describe('pack operation: baseContext + operationPrompt', () => {
  it('split keeps repair body separable from Notebook context', () => {
    const split = splitRepairChannelPrompt({
      repairBody: 'Translate ONLY [C000001:P000002] 玄星玉。',
      operationType: 'REPAIR',
      packMode: 'slim',
      notebookId: 'nb-a',
    });
    expect(split.baseContext).toContain('Translation Notebook');
    expect(split.baseContext).not.toContain('Translate ONLY');
    expect(split.operationPrompt).toContain('## Repair / continuation task');
    expect(split.operationPrompt).toContain('Translate ONLY [C000001:P000002]');
    expect(split.prompt).toBe(
      assemblePackPrompt({
        baseContext: split.baseContext,
        operationPrompt: split.operationPrompt,
      }),
    );
  });

  it('Playwright → WebAPI FAT keeps repair target paragraph (never normal translate)', () => {
    const pack = repairPack();
    const adapted = adaptRepairToWebApiFat(pack, {
      criticalRules: '## Critical Rules\n- keep tone',
      hotMemoryDelta: '## Hot Memory\nstory: cliff',
      activeProjectTerms: '## Active Project Terms\n玄星玉 → Huyền Tinh Ngọc',
      // Dangerous: full-chapter source that would turn repair into translate
      sourceParagraphs: '## Source\n[C000001:P000001] 整章原文…\n[C000001:P000002] 玄星玉。',
    });

    expect(adapted.operationType).toBe('REPAIR');
    expect(adapted.operationPrompt).toBe(pack.operationPrompt);
    expect(adapted.prompt).toContain('Translate ONLY [C000001:P000002]');
    expect(adapted.prompt).toContain('玄星玉 → must keep paragraph target');
    expect(adapted.prompt).toContain('GEMINI_WEB_API');
    expect(adapted.prompt).toContain('Notebook knowledge is NOT available');
    expect(adapted.prompt).toContain('Huyền Tinh Ngọc');
    // Must not look like a fresh full-chapter translate
    expect(adapted.prompt).not.toContain('整章原文');
    expect(adapted.sections.sourceParagraphs).toBe('');
    expect(adapted.prompt).not.toMatch(/## Source\n/);
  });

  it('Playwright → WebAPI FAT keeps continuation instruction', () => {
    const contBody = [
      'Tiếp tục từ [C000001:P000010].',
      'Không lặp lại đoạn đã dịch.',
      'Source paragraphs (phần còn lại):',
      '[C000001:P000011] 下一句。',
    ].join('\n');
    const split = splitRepairChannelPrompt({
      repairBody: contBody,
      operationType: 'CONTINUATION',
      packMode: 'slim',
      notebookId: 'nb-a',
    });
    const pack = repairPack({
      prompt: split.prompt,
      baseContext: split.baseContext,
      operationPrompt: split.operationPrompt,
      operationType: 'CONTINUATION',
    });

    const adapted = adaptRepairToWebApiFat(pack, {
      criticalRules: '## Critical Rules\n- x',
      hotMemoryDelta: '## Hot Memory\ny',
      activeProjectTerms: '## Terms\nz',
      sourceParagraphs: '## Source\n[C000001:P000001] full chapter dump',
    });

    expect(adapted.operationType).toBe('CONTINUATION');
    expect(adapted.operationPrompt).toBe(pack.operationPrompt);
    expect(adapted.prompt).toContain('## Continuation task');
    expect(adapted.prompt).toContain('Tiếp tục từ [C000001:P000010]');
    expect(adapted.prompt).toContain('Không lặp lại đoạn đã dịch');
    expect(adapted.prompt).toContain('[C000001:P000011]');
    expect(adapted.prompt).not.toContain('full chapter dump');
  });

  it('isRepairOrContinuationOp guards adaptation', () => {
    expect(isRepairOrContinuationOp('REPAIR')).toBe(true);
    expect(isRepairOrContinuationOp('CONTINUATION')).toBe(true);
    expect(isRepairOrContinuationOp('TRANSLATE')).toBe(false);
  });

  it('extractOperationPrompt recovers body from legacy wrapped prompt', () => {
    const legacy = [
      '## Repair channel: Playwright Translation Notebook (SLIM)',
      'noise',
      '',
      '## Repair / continuation task',
      'Translate ONLY [C000001:P000003]',
    ].join('\n');
    expect(extractOperationPrompt({ prompt: legacy, operationPrompt: '' })).toContain(
      'Translate ONLY [C000001:P000003]',
    );
  });
});
