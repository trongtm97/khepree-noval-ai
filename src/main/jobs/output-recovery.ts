import type { ParseWarning } from '@shared/schemas/output-protocol';
import type { OutputSectionTag } from '@shared/constants/output-protocol';

export interface ExtractedSections {
  translation: string | null;
  termDelta: string | null;
  memoryDelta: string | null;
  warnings: ParseWarning[];
  recoveryUsed: boolean;
  /** Raw after fence/intro strip (for diagnostics). */
  normalizedRaw: string;
}

/**
 * Normalize raw model output then extract tagged sections.
 * Tolerant: missing closing tags → scan to next tag or EOF.
 */
export function extractSections(raw: string): ExtractedSections {
  const warnings: ParseWarning[] = [];
  let recoveryUsed = false;
  let text = raw;

  // Strip whole-response markdown fence
  const outerFence = /^```(?:xml|html|markdown|txt)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(
    text.trim(),
  );
  if (outerFence?.[1]) {
    text = outerFence[1];
    warnings.push({
      code: 'markdown_fence_stripped',
      message: 'Stripped outer markdown fence around response',
      section: 'raw',
    });
    recoveryUsed = true;
  }

  // Drop leading prose before first known tag
  const firstTag = text.search(/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i);
  if (firstTag > 0) {
    const intro = text.slice(0, firstTag).trim();
    if (intro.length > 0) {
      warnings.push({
        code: 'intro_prose_ignored',
        message: `Ignored leading prose (${intro.length} chars)`,
        section: 'raw',
      });
      recoveryUsed = true;
    }
    text = text.slice(firstTag);
  }

  const translation = extractOne(text, 'TRANSLATION', warnings, () => {
    recoveryUsed = true;
  });
  const termDelta = extractOne(text, 'TERM_DELTA', warnings, () => {
    recoveryUsed = true;
  });
  const memoryDelta = extractOne(text, 'MEMORY_DELTA', warnings, () => {
    recoveryUsed = true;
  });

  return {
    translation,
    termDelta,
    memoryDelta,
    warnings,
    recoveryUsed,
    normalizedRaw: text,
  };
}

function extractOne(
  text: string,
  tag: OutputSectionTag,
  warnings: ParseWarning[],
  markRecovery: () => void,
): string | null {
  const openRe = new RegExp(`<${tag}>`, 'i');
  const closeRe = new RegExp(`</${tag}>`, 'i');
  const openMatch = openRe.exec(text);
  if (!openMatch) return null;

  const start = openMatch.index + openMatch[0].length;
  const afterOpen = text.slice(start);
  const closeMatch = closeRe.exec(afterOpen);

  if (closeMatch) {
    return afterOpen.slice(0, closeMatch.index).trim();
  }

  // Missing closing tag: take until next known open tag or EOF
  markRecovery();
  warnings.push({
    code: 'missing_closing_tag',
    message: `Missing </${tag}> — scanned to next section or EOF`,
    section: tag,
  });

  const nextTag = afterOpen.search(/<(TRANSLATION|TERM_DELTA|MEMORY_DELTA)>/i);
  if (nextTag >= 0) {
    return afterOpen.slice(0, nextTag).trim();
  }
  return afterOpen.trim();
}
