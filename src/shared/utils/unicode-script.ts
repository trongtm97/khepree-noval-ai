/** Coarse Unicode script buckets for local QA (not language identification). */

export type ScriptBucket =
  | 'Latin'
  | 'Han'
  | 'Hiragana'
  | 'Katakana'
  | 'Hangul'
  | 'Arabic'
  | 'Cyrillic'
  | 'Thai'
  | 'Devanagari'
  | 'Hebrew'
  | 'Georgian'
  | 'Armenian'
  | 'Greek'
  | 'Other';

const SCRIPT_CLASSIFIERS: Array<{ bucket: ScriptBucket; re: RegExp }> = [
  { bucket: 'Han', re: /\p{Script=Han}/u },
  { bucket: 'Hiragana', re: /\p{Script=Hiragana}/u },
  { bucket: 'Katakana', re: /\p{Script=Katakana}/u },
  { bucket: 'Hangul', re: /\p{Script=Hangul}/u },
  { bucket: 'Arabic', re: /\p{Script=Arabic}/u },
  { bucket: 'Cyrillic', re: /\p{Script=Cyrillic}/u },
  { bucket: 'Thai', re: /\p{Script=Thai}/u },
  { bucket: 'Devanagari', re: /\p{Script=Devanagari}/u },
  { bucket: 'Hebrew', re: /\p{Script=Hebrew}/u },
  { bucket: 'Georgian', re: /\p{Script=Georgian}/u },
  { bucket: 'Armenian', re: /\p{Script=Armenian}/u },
  { bucket: 'Greek', re: /\p{Script=Greek}/u },
  { bucket: 'Latin', re: /\p{Script=Latin}/u },
];

const SKIP_CHAR_RE = /[\s\d\p{P}\p{S}]/u;

export function classifyScriptChar(ch: string): ScriptBucket {
  for (const { bucket, re } of SCRIPT_CLASSIFIERS) {
    if (re.test(ch)) return bucket;
  }
  return 'Other';
}

export function computeScriptHistogram(text: string): Map<ScriptBucket, number> {
  const hist = new Map<ScriptBucket, number>();
  for (const ch of text) {
    if (SKIP_CHAR_RE.test(ch)) continue;
    const bucket = classifyScriptChar(ch);
    hist.set(bucket, (hist.get(bucket) ?? 0) + 1);
  }
  return hist;
}

export function countScriptLetters(hist: Map<ScriptBucket, number>): number {
  let total = 0;
  for (const n of hist.values()) total += n;
  return total;
}

export function scriptLetterRatio(
  hist: Map<ScriptBucket, number>,
  buckets: ScriptBucket[],
): number {
  const total = countScriptLetters(hist);
  if (total === 0) return 0;
  let match = 0;
  for (const b of buckets) {
    match += hist.get(b) ?? 0;
  }
  return match / total;
}

/** Share of letters that are outside expected buckets (coarse mismatch signal). */
export function foreignScriptRatio(
  hist: Map<ScriptBucket, number>,
  expectedBuckets: ScriptBucket[],
): number {
  const total = countScriptLetters(hist);
  if (total === 0) return 0;
  let foreign = 0;
  for (const [bucket, count] of hist) {
    if (bucket !== 'Other' && !expectedBuckets.includes(bucket)) {
      foreign += count;
    }
  }
  return foreign / total;
}

/** Map catalog script tag → coarse buckets (script-aware, not language-specific). */
export function scriptTagToBuckets(scriptTag: string): ScriptBucket[] {
  switch (scriptTag) {
    case 'Latn':
      return ['Latin'];
    case 'Hans':
    case 'Hant':
      return ['Han'];
    case 'Jpan':
      return ['Hiragana', 'Katakana', 'Han'];
    case 'Kore':
      return ['Hangul'];
    case 'Arab':
      return ['Arabic'];
    case 'Cyrl':
      return ['Cyrillic'];
    case 'Thai':
      return ['Thai'];
    case 'Deva':
      return ['Devanagari'];
    case 'Hebr':
      return ['Hebrew'];
    case 'Geor':
      return ['Georgian'];
    case 'Armn':
      return ['Armenian'];
    case 'Grek':
      return ['Greek'];
    default:
      return ['Latin'];
  }
}

export const CJK_SOURCE_RUN_RE =
  /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]{4,}/gu;

export const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
