/**
 * LANGUAGE-specific evidence — characters and function words that identify a
 * language, not merely its script. Shared script letters never live here.
 */

export interface LexicalScores {
  scores: Record<string, number>;
  /** True when the leading language has distinctive (not script-generic) evidence. */
  languageSpecific: boolean;
  bestCode: string | null;
}

interface Marker {
  code: string;
  /** Characters unique (or nearly unique) to this language within its script family. */
  chars?: string;
  /** Distinctive function / novel words (lowercase). */
  words?: string[];
}

const MARKERS: Marker[] = [
  // Cyrillic — unique letters first
  { code: 'uk', chars: 'їєґЇЄҐ', words: ['це', 'що', 'він', 'вона', 'його', 'розділ', 'україн'] },
  { code: 'kk', chars: 'әғқңөұүһӘҒҚҢӨҰҮҺ' },
  { code: 'ky', chars: 'ңөүҢӨҮ' },
  { code: 'be', chars: 'ўЎ', words: ['гэта', 'яна', 'ён'] },
  { code: 'sr', chars: 'јљњџћђЈЉЊЏЋЂ' },
  { code: 'mk', chars: 'ѓќѕЃЌЅ' },
  { code: 'bg', chars: 'ъЪ', words: ['това', 'който', 'беше', 'българ', 'една'] },
  { code: 'ru', words: ['это', 'что', 'был', 'была', 'его', 'она', 'глава', 'который'] },

  // Arabic family — extra letters
  { code: 'fa', chars: 'پچژگ', words: ['که', 'این', 'است', 'برای', 'بود'] },
  { code: 'ur', chars: 'ٹڈڑںےھۃ', words: ['ہے', 'اور', 'میں', 'کے', 'کی'] },
  { code: 'ps', chars: 'ټډړږښېۍ' },
  { code: 'ug', chars: 'ەڭغۈۆ' },
  { code: 'ckb', chars: 'ڵڕێۆ' },
  { code: 'ar', words: ['في', 'من', 'على', 'هذا', 'التي', 'الفصل', 'كان'] },

  // Hebrew / Yiddish
  { code: 'yi', chars: 'װױײ' },

  // Latin — distinctive letters + words that do not map the whole alphabet to English
  { code: 'vi', chars: 'ăâêôơưđĂÂÊÔƠƯĐ' },
  { code: 'pl', chars: 'ąćęłńśźżĄĆĘŁŃŚŹŻ', words: ['się', 'że', 'jest', 'oraz', 'rozdział'] },
  { code: 'cs', chars: 'ěřůťďňĚŘŮŤĎŇ' },
  { code: 'sk', chars: 'ľĺŕĽĹŔ' },
  { code: 'hu', chars: 'őűŐŰ' },
  { code: 'tr', chars: 'ğışĞİŞ' },
  { code: 'ro', chars: 'ăâîșțĂÂÎȘȚ', words: ['și', 'sunt', 'pentru', 'capitol'] },
  { code: 'it', words: ['il', 'lo', 'gli', 'della', 'nel', 'che', 'una', 'questo', 'quella', 'non', 'per', 'capitolo', 'sono', 'era', 'città'] },
  { code: 'nl', words: ['het', 'een', 'niet', 'voor', 'zijn', 'naar', 'dit', 'als', 'bij', 'hoofdstuk', 'van'] },
  { code: 'de', chars: 'ß', words: ['der', 'die', 'das', 'und', 'nicht', 'ein', 'ist', 'kapitel'] },
  { code: 'fr', words: ['les', 'des', 'une', 'dans', 'pour', 'chapitre', 'est', 'que', 'avec'] },
  { code: 'es', chars: 'ñÑ', words: ['los', 'las', 'que', 'una', 'para', 'capítulo', 'está', 'del'] },
  { code: 'pt', words: ['não', 'uma', 'para', 'capítulo', 'os', 'as', 'está'] },
  { code: 'en', words: ['the', 'and', 'that', 'with', 'from', 'chapter', 'said', 'was', 'were', 'this', 'have', 'they'] },
  { code: 'sv', words: ['och', 'det', 'att', 'är', 'för', 'kapitel'] },
  { code: 'id', words: ['yang', 'dari', 'untuk', 'bab', 'ini', 'itu', 'tidak'] },
];

const MIN_SPECIFIC_SCORE = 6;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .filter((t) => t.length > 0);
}

function countChars(text: string, chars: string): number {
  let n = 0;
  const set = new Set(chars);
  for (const ch of text) {
    if (set.has(ch)) n += 1;
  }
  return n;
}

function countWords(tokens: string[], words: string[]): number {
  const want = new Set(words);
  let n = 0;
  for (const tok of tokens) {
    if (want.has(tok)) n += 1;
    else {
      for (const w of words) {
        if (w.length >= 5 && tok.includes(w)) {
          n += 1;
          break;
        }
      }
    }
  }
  return n;
}

export function scoreLexicalEvidence(text: string): LexicalScores {
  const tokens = tokenize(text);
  const scores: Record<string, number> = {};

  for (const marker of MARKERS) {
    let score = 0;
    if (marker.chars) score += countChars(text, marker.chars) * 5;
    if (marker.words) score += countWords(tokens, marker.words) * 3;
    if (score > 0) scores[marker.code] = (scores[marker.code] ?? 0) + score;
  }

  let bestCode: string | null = null;
  let best = 0;
  let second = 0;
  for (const [code, score] of Object.entries(scores)) {
    if (score > best) {
      second = best;
      best = score;
      bestCode = code;
    } else if (score > second) {
      second = score;
    }
  }

  const languageSpecific = bestCode != null && best >= MIN_SPECIFIC_SCORE && best - second >= 4;

  return { scores, languageSpecific, bestCode };
}
