/**
 * Offline stand-in for Gemini Translation Notebook:
 * apply ONLY terms found in notebook knowledge docs (00–07), never pack soft terms.
 * If the SLIM pack already contains the probe mapping, the test is INVALID.
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

export class NotebookGroundingTestInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotebookGroundingTestInvalidError';
  }
}

export function assertSlimPackDoesNotContainMapping(
  packPrompt: string,
  source: string,
  expectedVi: string,
): void {
  const hay = packPrompt.replace(/\s+/g, ' ');
  const arrowForms = [
    `${source} → ${expectedVi}`,
    `${source}->${expectedVi}`,
    `${source} => ${expectedVi}`,
  ];
  for (const form of arrowForms) {
    if (hay.includes(form.replace(/\s+/g, ' '))) {
      throw new NotebookGroundingTestInvalidError(
        `TEST INVALID: SLIM pack contains mapping "${form}" — cannot prove Notebook contributed.`,
      );
    }
  }
  // Also reject source+target adjacent in Active Overrides section
  if (
    /## Active Overrides[\s\S]*?## Source/.test(packPrompt) &&
    packPrompt.includes(source) &&
    packPrompt.includes(expectedVi)
  ) {
    const overrides = packPrompt.split('## Source')[0] ?? '';
    if (overrides.includes(source) && overrides.includes(expectedVi)) {
      throw new NotebookGroundingTestInvalidError(
        `TEST INVALID: SLIM Active Overrides leak "${source}" / "${expectedVi}".`,
      );
    }
  }
}

/** Parse term mappings from Notebook knowledge markdown (02 + character headers). */
export function extractNotebookTermMap(
  knowledgeDocs: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();

  const termsMd =
    knowledgeDocs['02_PROJECT_TERMS.md'] ??
    knowledgeDocs['project_terms'] ??
    '';
  for (const line of termsMd.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    const m = TERM_LINE.exec(t);
    if (!m) continue;
    const source = (m[1] ?? '').trim();
    const preferred = (m[2] ?? '').trim();
    if (source && preferred) map.set(source, preferred);
  }

  const charsMd =
    knowledgeDocs['03_CHARACTERS.md'] ?? knowledgeDocs['characters'] ?? '';
  const sections = charsMd.split(/\n(?=##\s+)/);
  for (const section of sections) {
    const header = /^##\s+(.+)\s*$/m.exec(section);
    if (!header) continue;
    const source = header[1]!.trim();
    const vi =
      /(?:Tên\s*Việt|preferred|translated)\s*:\s*(.+)\s*$/im.exec(section)?.[1]?.trim() ??
      null;
    if (source && vi) map.set(source, vi);
  }

  return map;
}

/**
 * Simulate Translation Notebook reply: substitute notebook terms into source.
 * Does not read pack Active Overrides — only knowledge docs.
 */
export function translateUsingNotebookKnowledge(input: {
  sourceParagraph: string;
  notebookKnowledgeDocs: Record<string, string>;
  packPrompt: string;
  probeSource: string;
  probeExpectedVi: string;
}): string {
  assertSlimPackDoesNotContainMapping(
    input.packPrompt,
    input.probeSource,
    input.probeExpectedVi,
  );

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
    const vi = map.get(source)!;
    out = out.split(source).join(vi);
  }
  return out;
}
