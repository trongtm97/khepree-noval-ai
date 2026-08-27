import type { TermType } from '@shared/constants/term';
import type { TermRow } from '../db/repositories/term-repository';

/** Suffix / prefix heuristics for xianxia terminology (V1, no AI). */
export const TERM_SUFFIX_HEURISTICS: readonly {
  suffixes: string[];
  type: TermType;
  tag: string;
}[] = [
  { suffixes: ['宗', '门', '派', '宫', '阁'], type: 'SECT', tag: 'sect' },
  { suffixes: ['城', '州', '山', '谷', '域'], type: 'LOCATION', tag: 'location' },
  { suffixes: ['剑', '刀', '枪', '鼎'], type: 'WEAPON', tag: 'weapon' },
  { suffixes: ['丹', '药', '草'], type: 'PILL', tag: 'pill' },
  { suffixes: ['诀', '经', '法', '功', '术'], type: 'TECHNIQUE', tag: 'technique' },
  { suffixes: ['境', '阶', '品'], type: 'CULTIVATION_LEVEL', tag: 'cultivation' },
  { suffixes: ['王', '帝', '尊', '圣', '神'], type: 'TITLE', tag: 'title' },
];

const CJK_RE = /[\u4e00-\u9fff]/;

export interface ExtractedCandidate {
  sourceText: string;
  suggestedType: TermType;
  confidence: number;
  frequency: number;
  heuristicTags: string[];
  contextSnippet: string;
}

export interface CandidateExtractionOptions {
  minLength?: number;
  maxLength?: number;
  minFrequency?: number;
  /** Skip strings that match existing vault terms. */
  knownSources?: Set<string>;
}

/**
 * Extract term candidates from Chinese text using n-grams + suffix heuristics.
 * Does NOT auto-promote to vault.
 */
export function extractTermCandidates(
  text: string,
  options: CandidateExtractionOptions = {},
): ExtractedCandidate[] {
  const minLen = options.minLength ?? 2;
  const maxLen = options.maxLength ?? 4;
  const minFreq = options.minFrequency ?? 2;
  const known = options.knownSources ?? new Set<string>();

  const segments = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  const freq = new Map<string, { count: number; snippet: string }>();

  for (const segment of segments) {
    for (let len = minLen; len <= maxLen; len += 1) {
      for (let i = 0; i <= segment.length - len; i += 1) {
        const gram = segment.slice(i, i + len);
        if (!isValidGram(gram)) continue;
        if (known.has(gram)) continue;
        const entry = freq.get(gram) ?? { count: 0, snippet: gram };
        entry.count += 1;
        freq.set(gram, entry);
      }
    }
  }

  const results: ExtractedCandidate[] = [];
  for (const [sourceText, { count, snippet }] of freq) {
    if (count < minFreq) continue;
    const { type, tags, confidence } = classifyByHeuristics(sourceText);
    if (confidence < 0.35 && count < 3) continue;
    results.push({
      sourceText,
      suggestedType: type,
      confidence: Math.min(0.95, confidence + count * 0.05),
      frequency: count,
      heuristicTags: tags,
      contextSnippet: snippet,
    });
  }

  return results.sort((a, b) => b.frequency - a.frequency || b.confidence - a.confidence);
}

function isValidGram(gram: string): boolean {
  if (!CJK_RE.test(gram)) return false;
  if (/^[的了在是有不人这中大来以个上们到说时地也子就道而出要于得可你年生自会那后能对着事其里所去行过家十用发天如然作方成者多日都三小军二无同么经法当起与好].+$/.test(gram)) {
    return false;
  }
  return true;
}

function classifyByHeuristics(source: string): {
  type: TermType;
  tags: string[];
  confidence: number;
} {
  const tags: string[] = [];
  let type: TermType = 'GENERAL';
  let confidence = 0.3;

  for (const rule of TERM_SUFFIX_HEURISTICS) {
    for (const suffix of rule.suffixes) {
      if (source.endsWith(suffix)) {
        type = rule.type;
        tags.push(rule.tag);
        confidence = Math.max(confidence, 0.55 + suffix.length * 0.05);
      }
    }
  }

  if (source.length === 2 && confidence < 0.5) {
    confidence = 0.35;
  }

  return { type, tags, confidence };
}

export function knownSourceSet(terms: TermRow[]): Set<string> {
  const set = new Set<string>();
  for (const t of terms) {
    if (t.source_text?.trim()) set.add(t.source_text.trim());
    set.add(t.source_simplified);
    if (t.source_traditional) set.add(t.source_traditional);
  }
  return set;
}
