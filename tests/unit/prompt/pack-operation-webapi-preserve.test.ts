import { describe, expect, it } from 'vitest';
import {
  assemblePackPrompt,
  extractOperationPrompt,
  isRepairOrContinuationOp,
  splitRepairChannelPrompt,
} from '@main/prompt/pack-operation';

const LOCAL_SNAPSHOT = [
  '## Critical Rules',
  '- Keep locked names exact.',
  '## Locked Terms',
  '- 王林 → Vương Lâm [LOCKED]',
  '## Active Characters',
  '- 王林 → Vương Lâm',
].join('\n');

describe('pack operation: provider-neutral local context', () => {
  it('split keeps repair body separable from local context snapshot', () => {
    const split = splitRepairChannelPrompt({
      repairBody: 'Translate ONLY [C000001:P000002] 玄星玉。',
      operationType: 'REPAIR',
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    expect(split.baseContext).toContain('Critical Rules');
    expect(split.baseContext).toContain('王林 → Vương Lâm');
    expect(split.baseContext).not.toContain('Translate ONLY');
    expect(split.operationPrompt).toContain('## Repair task');
    expect(split.operationPrompt).toContain('Translate ONLY [C000001:P000002]');
    expect(split.prompt).toBe(
      assemblePackPrompt({
        baseContext: split.baseContext,
        operationPrompt: split.operationPrompt,
      }),
    );
  });

  it('Browser and WebAPI receive same baseContext when snapshot frozen', () => {
    const repairBody = 'Translate ONLY [C000001:P000002]\n玄星玉 → must keep paragraph target';
    const browser = splitRepairChannelPrompt({
      repairBody,
      operationType: 'REPAIR',
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    const webApi = splitRepairChannelPrompt({
      repairBody,
      operationType: 'REPAIR',
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    expect(browser.baseContext).toBe(webApi.baseContext);
    expect(browser.operationPrompt).toBe(webApi.operationPrompt);
    expect(browser.prompt).toBe(webApi.prompt);
    expect(browser.prompt).toContain('玄星玉 → must keep paragraph target');
    expect(browser.prompt).not.toMatch(/## Source\n/);
  });

  it('continuation uses same snapshot + continuation instruction', () => {
    const contBody = [
      'Tiếp tục từ [C000001:P000010].',
      'Không lặp lại đoạn đã dịch.',
      'Source paragraphs (phần còn lại):',
      '[C000001:P000011] 下一句。',
    ].join('\n');
    const split = splitRepairChannelPrompt({
      repairBody: contBody,
      operationType: 'CONTINUATION',
      localContextSnapshot: LOCAL_SNAPSHOT,
    });
    expect(split.operationPrompt).toContain('## Continuation task');
    expect(split.prompt).toContain('Tiếp tục từ [C000001:P000010]');
    expect(split.prompt).toContain('[C000001:P000011]');
    expect(split.baseContext).toBe(LOCAL_SNAPSHOT);
    expect(split.prompt).not.toContain('full chapter dump');
  });

  it('isRepairOrContinuationOp guards adaptation', () => {
    expect(isRepairOrContinuationOp('REPAIR')).toBe(true);
    expect(isRepairOrContinuationOp('CONTINUATION')).toBe(true);
    expect(isRepairOrContinuationOp('TRANSLATE')).toBe(false);
  });

  it('extractOperationPrompt recovers body from legacy wrapped prompt', () => {
    const legacy = [
      '## Local Context (snapshot)',
      'noise',
      '',
      '## Repair task',
      'Translate ONLY [C000001:P000003]',
    ].join('\n');
    expect(extractOperationPrompt({ prompt: legacy, operationPrompt: '' })).toContain(
      'Translate ONLY [C000001:P000003]',
    );
  });
});
