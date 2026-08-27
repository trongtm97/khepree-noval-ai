import { describe, expect, it } from 'vitest';
import {
  mapNotebookServiceMessage,
  needsNotebookSync,
  resolveNotebookPanelHint,
} from '../../../src/renderer/utils/notebook-panel';

describe('notebook-panel utils', () => {
  const t = (key: string) => key;

  it('resolveNotebookPanelHint prefers sync states', () => {
    expect(
      resolveNotebookPanelHint({
        status: 'sync_pending',
        dirty: false,
        instructionsReady: true,
      }),
    ).toBe('stale');
    expect(
      resolveNotebookPanelHint({
        status: 'ready',
        dirty: true,
        instructionsReady: true,
      }),
    ).toBe('localChanges');
    expect(
      resolveNotebookPanelHint({
        status: 'ready',
        dirty: false,
        instructionsReady: false,
      }),
    ).toBe('instructions');
    expect(
      resolveNotebookPanelHint({
        status: 'ready',
        dirty: false,
        instructionsReady: true,
      }),
    ).toBeNull();
  });

  it('needsNotebookSync when dirty or pending', () => {
    expect(needsNotebookSync({ status: 'ready', dirty: true })).toBe(true);
    expect(needsNotebookSync({ status: 'stale', dirty: false })).toBe(true);
    expect(needsNotebookSync({ status: 'ready', dirty: false })).toBe(false);
  });

  it('mapNotebookServiceMessage maps known backend strings', () => {
    expect(mapNotebookServiceMessage('Notebook đã thiết lập và xác minh.', t)).toBe(
      'aiPanel.msgProvisioned',
    );
    expect(
      mapNotebookServiceMessage(
        'Automation stopped at set_instructions: missing UI',
        t,
      ),
    ).toBe('aiPanel.msgInstructionsAssisted');
    expect(mapNotebookServiceMessage('Unknown backend text', t)).toBe('Unknown backend text');
  });
});
