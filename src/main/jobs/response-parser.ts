import { TRANSLATION_LINE_RE } from '@shared/constants/output-protocol';
import type { ParseStatus } from '@shared/constants/output-protocol';
import type {
  ParsedBatchResult,
  ParseWarning,
  TranslationLine,
} from '@shared/schemas/output-protocol';
import { TermDeltaSchema, type TermDeltaItem } from '@shared/schemas/term-delta';
import { MemoryDeltaSchema, type MemoryDeltaItem } from '@shared/schemas/memory-delta';
import { extractSections } from './output-recovery';
import { tryParseJson } from './json-repair';

export interface ResponseParserOptions {
  /** Prefer empty deltas when section missing (default true). */
  assumeEmptyDeltas?: boolean;
}

/**
 * Robust AI response parser.
 * Pipeline: strict → tolerant extraction → safe JSON repair → NEEDS_REPAIR if uncertain.
 * Never invents missing translation lines.
 */
export class ResponseParser {
  constructor(private readonly options: ResponseParserOptions = {}) {}

  parse(raw: string): ParsedBatchResult {
    const warnings: ParseWarning[] = [];
    const protocolVersion = detectProtocolVersion(raw);

    // --- Strict attempt ---
    const strict = this.tryStrict(raw);
    if (strict) {
      return {
        status: 'ok',
        translations: strict.translations,
        termDeltas: strict.termDeltas,
        memoryDeltas: strict.memoryDeltas,
        warnings: [],
        recoveryUsed: false,
        protocolVersion,
      };
    }

    // --- Tolerant extraction ---
    const sections = extractSections(raw);
    warnings.push(...sections.warnings);
    let recoveryUsed = sections.recoveryUsed;
    warnings.push({
      code: 'strict_failed_tolerant_used',
      message: 'Strict parse failed; using tolerant extraction',
      section: 'raw',
    });
    recoveryUsed = true;

    if (sections.translation === null) {
      // Gemini sometimes returns [C######:P######] lines without <TRANSLATION> tags.
      // Recover those lines — do not invent IDs that are absent.
      const loose = parseTranslationBody(sections.normalizedRaw);
      if (loose.ok && loose.lines.length > 0) {
        warnings.push({
          code: 'strict_failed_tolerant_used',
          message: 'Recovered paragraph ID lines without <TRANSLATION> tags',
          section: 'TRANSLATION',
        });
        recoveryUsed = true;
        return {
          status: 'recovered',
          translations: loose.lines,
          termDeltas: [],
          memoryDeltas: [],
          warnings: [
            ...warnings,
            {
              code: 'empty_delta_assumed',
              message: 'Missing <TERM_DELTA> — treating as []',
              section: 'TERM_DELTA',
            },
            {
              code: 'empty_delta_assumed',
              message: 'Missing <MEMORY_DELTA> — treating as []',
              section: 'MEMORY_DELTA',
            },
          ],
          recoveryUsed: true,
          protocolVersion,
        };
      }
      return this.needsRepair(warnings, recoveryUsed, protocolVersion, {
        message: 'TRANSLATION section not found — cannot invent paragraph lines',
      });
    }

    const translationParse = parseTranslationBody(sections.translation);
    if (!translationParse.ok) {
      return this.needsRepair(
        [...warnings, ...translationParse.warnings],
        true,
        protocolVersion,
        { message: translationParse.error ?? 'TRANSLATION body unrecoverable' },
      );
    }
    warnings.push(...translationParse.warnings);

    const assumeEmpty = this.options.assumeEmptyDeltas !== false;

    const termResult = this.parseDeltaSection(
      sections.termDelta,
      'TERM_DELTA',
      TermDeltaSchema,
      assumeEmpty,
    );
    warnings.push(...termResult.warnings);
    if (termResult.recoveryUsed) recoveryUsed = true;

    const memoryResult = this.parseDeltaSection(
      sections.memoryDelta,
      'MEMORY_DELTA',
      MemoryDeltaSchema,
      assumeEmpty,
    );
    warnings.push(...memoryResult.warnings);
    if (memoryResult.recoveryUsed) recoveryUsed = true;

    // Translations are the product. Invalid delta JSON must NOT block COMPLETE
    // or trigger deltas_only repair that drops <TRANSLATION> and loses all IDs.
    if (!termResult.ok || !memoryResult.ok) {
      if (translationParse.lines.length === 0) {
        return this.needsRepair(warnings, true, protocolVersion, {
          message:
            (!termResult.ok ? termResult.error : memoryResult.error) ??
            'Delta JSON unrecoverable',
        });
      }
      if (!termResult.ok) {
        warnings.push({
          code: 'delta_discarded',
          message: `Discarding invalid TERM_DELTA (${termResult.error}) — keeping translations`,
          section: 'TERM_DELTA',
        });
      }
      if (!memoryResult.ok) {
        warnings.push({
          code: 'delta_discarded',
          message: `Discarding invalid MEMORY_DELTA (${memoryResult.error}) — keeping translations`,
          section: 'MEMORY_DELTA',
        });
      }
      recoveryUsed = true;
      return {
        status: 'recovered',
        translations: translationParse.lines,
        termDeltas: termResult.ok ? (termResult.items as TermDeltaItem[]) : [],
        memoryDeltas: memoryResult.ok
          ? (memoryResult.items as MemoryDeltaItem[])
          : [],
        warnings,
        recoveryUsed: true,
        protocolVersion,
      };
    }

    return {
      status: 'recovered',
      translations: translationParse.lines,
      termDeltas: termResult.items as TermDeltaItem[],
      memoryDeltas: memoryResult.items as MemoryDeltaItem[],
      warnings,
      recoveryUsed: true,
      protocolVersion,
    };
  }

  private tryStrict(raw: string): {
    translations: TranslationLine[];
    termDeltas: TermDeltaItem[];
    memoryDeltas: MemoryDeltaItem[];
  } | null {
    try {
      const translationMatch =
        /<TRANSLATION>\s*([\s\S]*?)\s*<\/TRANSLATION>/.exec(raw);
      const termMatch = /<TERM_DELTA>\s*([\s\S]*?)\s*<\/TERM_DELTA>/.exec(raw);
      const memoryMatch =
        /<MEMORY_DELTA>\s*([\s\S]*?)\s*<\/MEMORY_DELTA>/.exec(raw);

      if (!translationMatch || !termMatch || !memoryMatch) return null;

      if (raw.includes('```')) return null;

      const translationBody = translationMatch[1];
      const termBody = termMatch[1];
      const memoryBody = memoryMatch[1];

      const translationParse = parseTranslationBody(translationBody, {
        strict: true,
      });
      if (!translationParse.ok || translationParse.lines.length === 0) return null;

      const termJson = JSON.parse(termBody.trim()) as unknown;
      const memoryJson = JSON.parse(memoryBody.trim()) as unknown;
      const termDeltas = TermDeltaSchema.parse(termJson);
      const memoryDeltas = MemoryDeltaSchema.parse(memoryJson);

      return {
        translations: translationParse.lines,
        termDeltas,
        memoryDeltas,
      };
    } catch {
      return null;
    }
  }

  private parseDeltaSection(
    body: string | null,
    section: 'TERM_DELTA' | 'MEMORY_DELTA',
    schema: typeof TermDeltaSchema | typeof MemoryDeltaSchema,
    assumeEmpty: boolean,
  ): {
    ok: boolean;
    items: unknown[];
    warnings: ParseWarning[];
    recoveryUsed: boolean;
    error?: string;
  } {
    const warnings: ParseWarning[] = [];
    if (body === null) {
      if (assumeEmpty) {
        warnings.push({
          code: 'empty_delta_assumed',
          message: `Missing <${section}> — treating as []`,
          section,
        });
        return { ok: true, items: [], warnings, recoveryUsed: true };
      }
      return {
        ok: false,
        items: [],
        warnings,
        recoveryUsed: false,
        error: `Missing <${section}>`,
      };
    }

    let jsonText = body.trim();
    // Strip fences inside section
    const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(jsonText);
    if (fence?.[1]) {
      jsonText = fence[1].trim();
      warnings.push({
        code: 'markdown_fence_stripped',
        message: `Stripped markdown fence inside ${section}`,
        section,
      });
    }

    const repaired = tryParseJson(jsonText);
    if (!repaired.ok) {
      return {
        ok: false,
        items: [],
        warnings,
        recoveryUsed: repaired.repaired,
        error: `${section} JSON parse failed: ${repaired.error}`,
      };
    }

    if (repaired.repaired) {
      warnings.push({
        code: 'json_repaired',
        message: `${section} JSON repaired (${repaired.repairs.join(', ')})`,
        section,
      });
      if (repaired.repairs.includes('trailing_comma')) {
        warnings.push({
          code: 'trailing_comma_removed',
          message: 'Removed trailing comma(s)',
          section,
        });
      }
      if (repaired.repairs.includes('single_quotes')) {
        warnings.push({
          code: 'single_quotes_normalized',
          message: 'Normalized single quotes to double',
          section,
        });
      }
    }

    try {
      const items = schema.parse(repaired.value);
      return {
        ok: true,
        items,
        warnings,
        recoveryUsed: repaired.repaired,
      };
    } catch (error) {
      return {
        ok: false,
        items: [],
        warnings,
        recoveryUsed: repaired.repaired,
        error: `${section} schema validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  private needsRepair(
    warnings: ParseWarning[],
    recoveryUsed: boolean,
    protocolVersion: number | null,
    opts: {
      message: string;
      translations?: TranslationLine[];
      termDeltas?: TermDeltaItem[];
      memoryDeltas?: MemoryDeltaItem[];
    },
  ): ParsedBatchResult {
    return {
      status: 'needs_repair' satisfies ParseStatus,
      translations: opts.translations ?? [],
      termDeltas: opts.termDeltas ?? [],
      memoryDeltas: opts.memoryDeltas ?? [],
      warnings: [
        ...warnings,
        {
          code: 'strict_failed_tolerant_used',
          message: opts.message,
          section: 'raw',
        },
      ],
      recoveryUsed,
      protocolVersion,
    };
  }
}

export function parseTranslationBody(
  body: string,
  options?: { strict?: boolean },
): {
  ok: boolean;
  lines: TranslationLine[];
  warnings: ParseWarning[];
  error?: string;
} {
  const warnings: ParseWarning[] = [];
  const lines: TranslationLine[] = [];
  const rawLines = body.split(/\r?\n/);
  let lineNumber = 0;

  for (const rawLine of rawLines) {
    lineNumber += 1;
    const line = rawLine.trim();
    if (!line) continue;

    const match = TRANSLATION_LINE_RE.exec(line);
    if (!match) {
      if (options?.strict) {
        return {
          ok: false,
          lines: [],
          warnings,
          error: `Strict: invalid translation line ${lineNumber}: ${line.slice(0, 80)}`,
        };
      }
      // Tolerant: skip non-ID lines (prose) — do NOT invent IDs
      continue;
    }

    const idToken = match[1];
    const textPart = match[2];
    const paragraphId = `[${idToken}]`;
    const text = textPart.trim();
    lines.push({ paragraphId, text, lineNumber });
  }

  if (lines.length === 0) {
    return {
      ok: false,
      lines: [],
      warnings,
      error: 'No translation lines with paragraph IDs found',
    };
  }

  return { ok: true, lines, warnings };
}

function detectProtocolVersion(raw: string): number | null {
  const match = /Output Protocol Version:\s*(\d+)/i.exec(raw);
  if (!match?.[1]) return null;
  return Number.parseInt(match[1], 10);
}

export const responseParser = new ResponseParser();
