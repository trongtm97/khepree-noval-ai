export type NotebookPanelHint = 'stale' | 'localChanges' | 'instructions' | null;

export function resolveNotebookPanelHint(input: {
  status: string | null;
  dirty: boolean;
  instructionsReady: boolean;
}): NotebookPanelHint {
  const status = (input.status ?? '').toLowerCase();
  if (status === 'sync_pending' || status === 'stale') return 'stale';
  if (status === 'ready' && input.dirty) return 'localChanges';
  if (status === 'ready' && !input.instructionsReady) return 'instructions';
  return null;
}

export function needsNotebookSync(input: {
  status: string | null;
  dirty: boolean;
}): boolean {
  const status = (input.status ?? '').toLowerCase();
  return input.dirty || status === 'sync_pending' || status === 'stale';
}

const MESSAGE_SNIPPETS: readonly { match: string; key: string }[] = [
  { match: 'Notebook đã thiết lập và xác minh', key: 'aiPanel.msgProvisioned' },
  { match: 'Notebook provisioned and verified', key: 'aiPanel.msgProvisioned' },
  {
    match: 'Assisted setup complete',
    key: 'aiPanel.msgAssistedComplete',
  },
  {
    match: 'Bộ nhớ AI sẵn sàng',
    key: 'aiPanel.msgMemoryReady',
  },
  {
    match: 'Đã chuẩn bị bộ nhớ AI',
    key: 'aiPanel.msgPrepareDone',
  },
  {
    match: 'Automation stopped at set_instructions',
    key: 'aiPanel.msgInstructionsAssisted',
  },
  {
    match: 'Custom instructions',
    key: 'aiPanel.msgInstructionsAssisted',
  },
  {
    match: 'Notebook cần thao tác trên trình duyệt',
    key: 'aiPanel.msgNeedsAssisted',
  },
];

export function mapNotebookServiceMessage(
  message: string,
  t: (key: string) => string,
): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  for (const { match, key } of MESSAGE_SNIPPETS) {
    if (trimmed.includes(match)) return t(key);
  }
  return trimmed;
}
