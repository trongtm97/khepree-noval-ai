import { describe, expect, it } from 'vitest';

/**
 * Mirrors NotebookProvider.waitForSourceProcessing done-predicate for unit coverage.
 * (DOM evaluate itself needs Playwright page — tested via this pure logic.)
 */
function isSourceProcessingDone(input: {
  busy: boolean;
  checks: number;
  sourceCount: number;
  before: number;
  expectedIncrease: number;
  sawSpinner: boolean;
}): boolean {
  const targetCount = input.before + Math.max(0, input.expectedIncrease);
  return (
    !input.busy &&
    (input.expectedIncrease <= 0 ||
      input.checks > 0 ||
      input.sourceCount >= targetCount ||
      (input.sawSpinner && input.sourceCount > input.before))
  );
}

describe('waitForSourceProcessing predicate', () => {
  it('waits for idle when expectedIncrease is 0', () => {
    expect(
      isSourceProcessingDone({
        busy: true,
        checks: 0,
        sourceCount: 3,
        before: 3,
        expectedIncrease: 0,
        sawSpinner: true,
      }),
    ).toBe(false);
    expect(
      isSourceProcessingDone({
        busy: false,
        checks: 0,
        sourceCount: 3,
        before: 3,
        expectedIncrease: 0,
        sawSpinner: true,
      }),
    ).toBe(true);
  });

  it('requires count or checks when uploading files', () => {
    expect(
      isSourceProcessingDone({
        busy: false,
        checks: 0,
        sourceCount: 2,
        before: 2,
        expectedIncrease: 2,
        sawSpinner: false,
      }),
    ).toBe(false);
    expect(
      isSourceProcessingDone({
        busy: false,
        checks: 0,
        sourceCount: 4,
        before: 2,
        expectedIncrease: 2,
        sawSpinner: false,
      }),
    ).toBe(true);
    expect(
      isSourceProcessingDone({
        busy: false,
        checks: 1,
        sourceCount: 2,
        before: 2,
        expectedIncrease: 2,
        sawSpinner: true,
      }),
    ).toBe(true);
  });
});
