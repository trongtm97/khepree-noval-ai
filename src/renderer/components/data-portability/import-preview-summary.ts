import type { TabularPreviewResponse } from '@shared/schemas/tabular';

export function summarizeImportPreview(preview: TabularPreviewResponse): {
  willAdd: number;
  willUpdate: number;
  willSkip: number;
} {
  let willAdd = 0;
  let willUpdate = 0;
  let willSkip = 0;

  for (const row of preview.rows) {
    if (row.status === 'error') {
      willSkip += 1;
      continue;
    }
    if (row.duplicateOfTermId || row.duplicateAction === 'MERGE' || row.duplicateAction === 'REPLACE_TARGET') {
      willUpdate += 1;
      continue;
    }
    if (row.duplicateAction === 'SKIP') {
      willSkip += 1;
      continue;
    }
    if (row.status === 'valid' || row.status === 'warning') {
      willAdd += 1;
    } else {
      willSkip += 1;
    }
  }

  return { willAdd, willUpdate, willSkip };
}
