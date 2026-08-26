/**
 * Safe, conservative JSON repair for common LLM typos.
 * Never invents missing keys/values — only fixes punctuation/wrapping.
 */

export interface JsonRepairResult {
  ok: boolean;
  value: unknown;
  repaired: boolean;
  repairs: string[];
  error?: string;
}

export function tryParseJson(raw: string): JsonRepairResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, value: [], repaired: false, repairs: [] };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) as unknown, repaired: false, repairs: [] };
  } catch {
    // fall through to repair
  }

  const repairs: string[] = [];
  let candidate = trimmed;

  // Strip markdown fences leftover inside section
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(candidate);
  if (fenceMatch?.[1]) {
    candidate = fenceMatch[1].trim();
    repairs.push('stripped_inner_fence');
  }

  // Remove trailing commas before } or ]
  const withoutTrailing = candidate.replace(/,\s*([}\]])/g, '$1');
  if (withoutTrailing !== candidate) {
    candidate = withoutTrailing;
    repairs.push('trailing_comma');
  }

  // Normalize smart quotes → straight
  const straightQuotes = candidate
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
  if (straightQuotes !== candidate) {
    candidate = straightQuotes;
    repairs.push('smart_quotes');
  }

  // Single-quoted keys/strings → double (simple cases only)
  const doubleQuoted = repairSimpleSingleQuotes(candidate);
  if (doubleQuoted !== candidate) {
    candidate = doubleQuoted;
    repairs.push('single_quotes');
  }

  // Truncated array: missing closing ] — only if starts with [ and brace depth ok
  if (candidate.startsWith('[') && !candidate.endsWith(']')) {
    const open = (candidate.match(/\[/g) ?? []).length;
    const close = (candidate.match(/]/g) ?? []).length;
    if (open === close + 1) {
      candidate = `${candidate}]`;
      repairs.push('missing_array_close');
    }
  }

  try {
    return {
      ok: true,
      value: JSON.parse(candidate) as unknown,
      repaired: repairs.length > 0,
      repairs,
    };
  } catch (error) {
    return {
      ok: false,
      value: null,
      repaired: repairs.length > 0,
      repairs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Convert `'key': 'value'` patterns to double quotes — avoid complex nested cases. */
function repairSimpleSingleQuotes(input: string): string {
  // Only when no double quotes present (ambiguous otherwise)
  if (input.includes('"')) return input;
  return input.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner: string) => {
    const escaped = inner.replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
}
