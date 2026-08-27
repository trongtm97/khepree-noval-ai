import {
  KNOWLEDGE_FILE_KEYS,
  type KnowledgeFileKey,
} from '@shared/constants/notebooklm-preprocess';

export type ParsedKnowledgeFiles = Partial<Record<KnowledgeFileKey, string>>;

const FENCE_RE =
  /```\s*file:([^\n`]+)\s*\n([\s\S]*?)```/gi;

/**
 * Split NotebookLM / model response into the 8 knowledge markdown files.
 */
export function parseFullNovelPreprocessResponse(text: string): {
  files: ParsedKnowledgeFiles;
  foundKeys: KnowledgeFileKey[];
  missingKeys: KnowledgeFileKey[];
} {
  const files: ParsedKnowledgeFiles = {};
  const found = new Set<KnowledgeFileKey>();

  for (const match of text.matchAll(FENCE_RE)) {
    const rawName = match[1].trim().replace(/^["']|["']$/g, '');
    const body = match[2].trim();
    const key = normalizeFileKey(rawName);
    if (!key || !body) continue;
    files[key] = body;
    found.add(key);
  }

  // Fallback: heading-style separators without fences
  if (found.size === 0) {
    for (const key of KNOWLEDGE_FILE_KEYS) {
      const alt = extractByHeading(text, key);
      if (alt) {
        files[key] = alt;
        found.add(key);
      }
    }
  }

  const foundKeys = KNOWLEDGE_FILE_KEYS.filter((k) => found.has(k));
  const missingKeys = KNOWLEDGE_FILE_KEYS.filter((k) => !found.has(k));

  return { files, foundKeys, missingKeys };
}

function normalizeFileKey(name: string): KnowledgeFileKey | null {
  const base = name.replace(/^.*[/\\]/, '').trim();
  const hit = KNOWLEDGE_FILE_KEYS.find(
    (k) => k === base || k.toLowerCase() === base.toLowerCase(),
  );
  return hit ?? null;
}

function extractByHeading(text: string, key: KnowledgeFileKey): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|\\n)\\s*(?:#+\\s*)?${escaped}\\s*\\n([\\s\\S]*?)(?=(?:\\n\\s*(?:#+\\s*)?(?:00_|01_|02_|03_|04_|05_|06_|07_)[^\\n]*\\n)|$)`,
    'i',
  );
  const m = re.exec(text);
  const body = m?.[1]?.trim();
  return body && body.length > 0 ? body : null;
}

export function assertMinimumKnowledgeFiles(
  files: ParsedKnowledgeFiles,
  minRequired = 6,
): void {
  const present = KNOWLEDGE_FILE_KEYS.filter((k) => (files[k]?.trim() ?? '').length > 0);
  if (present.length < minRequired) {
    throw new Error(
      `PREPROCESS_PARSE: only ${present.length}/8 knowledge files found (need ≥${minRequired}). Missing: ${
        KNOWLEDGE_FILE_KEYS.filter((k) => !present.includes(k)).join(', ')
      }`,
    );
  }
}
