/**
 * Opt-in Real Notebook grounding smoke suite.
 * Skips unless KHEPREE_NOVEL_AI_NOTEBOOK_GROUNDING_SMOKE=1 (or KHEPREE_NOVEL_AI_GOOGLE_SMOKE=1).
 * Never included in default `npm test`.
 */

import { describe, expect, it } from 'vitest';
import { isNotebookGroundingSmokeEnvEnabled } from '@main/notebook-grounding-smoke/grounding-smoke-config';
import { runNotebookGroundingSmoke } from '@main/notebook-grounding-smoke/grounding-smoke-runner';

const enabled = isNotebookGroundingSmokeEnvEnabled();

describe.skipIf(!enabled)('Real Notebook grounding smoke (opt-in)', () => {
  it(
    'proves STATIC + LIVE + SLIM + learning loop against live NotebookLM',
    async () => {
      const report = await runNotebookGroundingSmoke();
      expect(report.overall).toBe('PASS');
    },
    45 * 60_000,
  );
});

describe.skipIf(enabled)('Real Notebook grounding smoke gate', () => {
  it('documents that suite is disabled without env', () => {
    expect(isNotebookGroundingSmokeEnvEnabled()).toBe(false);
  });
});
