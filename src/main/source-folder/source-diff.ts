import type { SourceDiffLineSchema } from '@shared/schemas/source-folder';
import type { z } from 'zod';

export type SourceDiffLine = z.infer<typeof SourceDiffLineSchema>;

export function computeLineDiff(oldText: string, newText: string): SourceDiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const lines: SourceDiffLine[] = [];
  let i = 0;
  let j = 0;
  let lineNumber = 1;

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({
        kind: 'unchanged',
        oldLine: oldLines[i],
        newLine: newLines[j],
        lineNumber,
      });
      i += 1;
      j += 1;
      lineNumber += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({
        kind: 'removed',
        oldLine: oldLines[i],
        lineNumber,
      });
      i += 1;
      lineNumber += 1;
    } else {
      lines.push({
        kind: 'added',
        newLine: newLines[j],
        lineNumber,
      });
      j += 1;
      lineNumber += 1;
    }
  }

  while (i < m) {
    lines.push({ kind: 'removed', oldLine: oldLines[i], lineNumber });
    i += 1;
    lineNumber += 1;
  }
  while (j < n) {
    lines.push({ kind: 'added', newLine: newLines[j], lineNumber });
    j += 1;
    lineNumber += 1;
  }

  return mergeChangedNeighbors(lines);
}

function mergeChangedNeighbors(lines: SourceDiffLine[]): SourceDiffLine[] {
  return lines.map((line) => {
    if (line.kind === 'unchanged') return line;
    if (line.kind === 'added' && line.newLine !== undefined) {
      return line;
    }
    if (line.kind === 'removed' && line.oldLine !== undefined) {
      return line;
    }
    return line;
  });
}
