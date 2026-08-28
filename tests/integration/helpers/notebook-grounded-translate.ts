/**
 * Offline stand-in for Gemini Translation Notebook:
 * apply ONLY terms found in notebook knowledge docs (00–07).
 * Phase 4: local_context pack may also contain SQLite term mappings — that is expected.
 */

const TERM_LINE =
  /^[-*•]?\s*(.+?)\s*(?:→|->|=>)\s*(.+?)(?:\s*[（(]\s*[A-Za-z_/]+\s*[）)])?\s*$/;

export const GROUNDING_PROBE = {
  characterSource: '紫洛安',
  characterVi: 'Tử Lạc An',
  itemSource: '玄星玉',
  itemVi: 'Huyền Tinh Ngọc',
  itemViUpdated: 'Huyền Tinh Thạch',
} as const;

/** Parse term mappings from Notebook knowledge markdown (02 + character headers). */
export function extractNotebookTermMap(
  knowledgeDocs: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();

  const termsMd =
    knowledgeDocs['02_PROJECT_TERMS.md'] ||
    knowledgeDocs.project_terms ||
    '';
  for (const line of termsMd.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    const m = TERM_LINE.exec(t);
    if (!m) continue;
    const source = m[1].trim();
    const preferred = m[2].trim();
    if (source && preferred) map.set(source, preferred);
  }

  const charsMd =
    knowledgeDocs['03_CHARACTERS.md'] || knowledgeDocs.characters || '';
  const sections = charsMd.split(/\n(?=##\s+)/);
  for (const section of sections) {
    const header = /^##\s+(.+)\s*$/m.exec(section);
    if (!header) continue;
    const source = header[1].trim();
    const vi =
      /(?:Tên\s*Việt|preferred|translated)\s*:\s*(.+)\s*$/im.exec(section)?.[1]?.trim() ??
      null;
    if (source && vi) map.set(source, vi);
  }

  return map;
}

/**
 * Simulate Translation Notebook reply: substitute notebook terms into source.
 */
export function translateUsingNotebookKnowledge(input: {
  sourceParagraph: string;
  notebookKnowledgeDocs: Record<string, string>;
  probeSource: string;
  probeExpectedVi: string;
}): string {
  const map = extractNotebookTermMap(input.notebookKnowledgeDocs);
  const expected = map.get(input.probeSource);
  if (expected !== input.probeExpectedVi) {
    throw new Error(
      `Notebook knowledge missing expected mapping: ${input.probeSource} → ${input.probeExpectedVi} (got ${expected ?? 'none'})`,
    );
  }

  const sources = [...map.keys()].sort((a, b) => b.length - a.length);
  let out = input.sourceParagraph;
  for (const source of sources) {
    const vi = map.get(source);
    if (vi === undefined) continue;
    out = out.split(source).join(vi);
  }
  return out;
}

/** Assert local_context pack includes SQLite-selected term mapping. */
export function assertLocalPackContainsMapping(
  packPrompt: string,
  source: string,
  expectedVi: string,
): void {
  const pattern = new RegExp(
    `${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(→|->|=>)\\s*${expectedVi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
  );
  if (!pattern.test(packPrompt)) {
    throw new Error(
      `Expected local_context pack to contain mapping ${source} → ${expectedVi}`,
    );
  }
}
