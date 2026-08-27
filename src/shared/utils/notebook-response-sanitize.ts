/**
 * Strip NotebookLM / Gemini UI chrome that leaks into assistant innerText
 * (e.g. "Thoughts expand_more") so the protocol parser sees real content.
 */
export function sanitizeNotebookAssistantText(raw: string): string {
  let text = raw;
  // Thinking accordion labels (EN / VI UI variants)
  text = text.replace(/^\s*Thoughts?\s*(expand[_ ]?more|collapse[_ ]?more)?\s*/gim, '');
  text = text.replace(/^\s*(Suy nghĩ|Đang suy nghĩ)\s*(expand[_ ]?more)?\s*/gim, '');
  text = text.replace(/\bexpand[_ ]?more\b/gi, '');
  text = text.replace(/\bcollapse[_ ]?more\b/gi, '');
  return text.trim();
}

/** Appended only on Playwright/NotebookLM submits — model often greets instead of tags. */
export const PLAYWRIGHT_PROTOCOL_NUDGE = `
CRITICAL OUTPUT RULE (NotebookLM):
Reply with ONLY these sections — no greeting, no explanation, no markdown outside tags:
<TRANSLATION>
[Cxxxxxx:Pxxxxxx] TARGET_LANGUAGE_TRANSLATION…
</TRANSLATION>
<TERM_DELTA>[]</TERM_DELTA>
<MEMORY_DELTA>[]</MEMORY_DELTA>
`.trim();

export function appendPlaywrightProtocolNudge(prompt: string): string {
  const base = prompt.trimEnd();
  if (!base) return PLAYWRIGHT_PROTOCOL_NUDGE;
  if (/CRITICAL OUTPUT RULE \(NotebookLM\)/i.test(base)) return base;
  return `${base}\n\n${PLAYWRIGHT_PROTOCOL_NUDGE}`;
}
