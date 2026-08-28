/**
 * SCRIPT detection — not language detection.
 * A script hit (Cyrl / Arab / Latn / Hebr / …) is not a language identity.
 */

import { listLanguageProfiles } from '@shared/constants/language-profile';

export type UnicodeScript =
  | 'Latn'
  | 'Cyrl'
  | 'Arab'
  | 'Hebr'
  | 'Thai'
  | 'Hang'
  | 'Hira'
  | 'Kana'
  | 'Hani'
  | 'Deva'
  | 'Beng'
  | 'Guru'
  | 'Gujr'
  | 'Orya'
  | 'Taml'
  | 'Telu'
  | 'Knda'
  | 'Mlym'
  | 'Sinh'
  | 'Khmr'
  | 'Laoo'
  | 'Mymr'
  | 'Ethi'
  | 'Geor'
  | 'Armn'
  | 'Grek'
  | 'Tibt'
  | 'Other';

/** Unicode script → LanguageProfile.script (Hang/Hira/Kana/Hani are special-cased). */
const UNICODE_TO_CATALOG_SCRIPT: Partial<Record<UnicodeScript, string>> = {
  Latn: 'Latn',
  Cyrl: 'Cyrl',
  Arab: 'Arab',
  Hebr: 'Hebr',
  Thai: 'Thai',
  Hang: 'Kore',
  Hira: 'Jpan',
  Kana: 'Jpan',
  Deva: 'Deva',
  Beng: 'Beng',
  Guru: 'Guru',
  Gujr: 'Gujr',
  Orya: 'Orya',
  Taml: 'Taml',
  Telu: 'Telu',
  Knda: 'Knda',
  Mlym: 'Mlym',
  Sinh: 'Sinh',
  Khmr: 'Khmr',
  Laoo: 'Laoo',
  Mymr: 'Mymr',
  Ethi: 'Ethi',
  Geor: 'Geor',
  Armn: 'Armn',
  Grek: 'Grek',
  Tibt: 'Tibt',
};

const SCRIPT_RANGES: [number, number, UnicodeScript][] = [
  [0x0041, 0x005a, 'Latn'],
  [0x0061, 0x007a, 'Latn'],
  [0x00c0, 0x00d6, 'Latn'],
  [0x00d8, 0x00f6, 'Latn'],
  [0x00f8, 0x024f, 'Latn'],
  [0x1e00, 0x1eff, 'Latn'],
  [0x0400, 0x052f, 'Cyrl'],
  [0x2de0, 0x2dff, 'Cyrl'],
  [0xa640, 0xa69f, 'Cyrl'],
  [0x0600, 0x06ff, 'Arab'],
  [0x0750, 0x077f, 'Arab'],
  [0x08a0, 0x08ff, 'Arab'],
  [0xfb50, 0xfdff, 'Arab'],
  [0xfe70, 0xfeff, 'Arab'],
  [0x0590, 0x05ff, 'Hebr'],
  [0xfb1d, 0xfb4f, 'Hebr'],
  [0x0e00, 0x0e7f, 'Thai'],
  [0xac00, 0xd7af, 'Hang'],
  [0x1100, 0x11ff, 'Hang'],
  [0x3130, 0x318f, 'Hang'],
  [0x3040, 0x309f, 'Hira'],
  [0x30a0, 0x30ff, 'Kana'],
  [0x31f0, 0x31ff, 'Kana'],
  [0x4e00, 0x9fff, 'Hani'],
  [0x3400, 0x4dbf, 'Hani'],
  [0x0900, 0x097f, 'Deva'],
  [0x0980, 0x09ff, 'Beng'],
  [0x0a00, 0x0a7f, 'Guru'],
  [0x0a80, 0x0aff, 'Gujr'],
  [0x0b00, 0x0b7f, 'Orya'],
  [0x0b80, 0x0bff, 'Taml'],
  [0x0c00, 0x0c7f, 'Telu'],
  [0x0c80, 0x0cff, 'Knda'],
  [0x0d00, 0x0d7f, 'Mlym'],
  [0x0d80, 0x0dff, 'Sinh'],
  [0x1780, 0x17ff, 'Khmr'],
  [0x0e80, 0x0eff, 'Laoo'],
  [0x1000, 0x109f, 'Mymr'],
  [0x1200, 0x137f, 'Ethi'],
  [0x10a0, 0x10ff, 'Geor'],
  [0x0530, 0x058f, 'Armn'],
  [0x0370, 0x03ff, 'Grek'],
  [0x1f00, 0x1fff, 'Grek'],
  [0x0f00, 0x0fff, 'Tibt'],
];

export type ScriptCounts = Record<UnicodeScript, number>;

export interface ScriptDetection {
  counts: ScriptCounts;
  /** Letters counted toward any script bucket. */
  letterCount: number;
  /** Dominant Unicode script (raw). */
  dominantUnicode: UnicodeScript;
  /**
   * Catalog script tag after CJK folding:
   * kana → Jpan, hangul → Kore, han-only → Hani, else UNICODE_TO_CATALOG.
   */
  catalogScript: string;
  /** Catalog language when this script has exactly one language family. */
  uniqueLanguage: string | null;
  /** True when catalog has 2+ language families on this script. */
  ambiguous: boolean;
}

const EMPTY_COUNTS = (): ScriptCounts => ({
  Latn: 0,
  Cyrl: 0,
  Arab: 0,
  Hebr: 0,
  Thai: 0,
  Hang: 0,
  Hira: 0,
  Kana: 0,
  Hani: 0,
  Deva: 0,
  Beng: 0,
  Guru: 0,
  Gujr: 0,
  Orya: 0,
  Taml: 0,
  Telu: 0,
  Knda: 0,
  Mlym: 0,
  Sinh: 0,
  Khmr: 0,
  Laoo: 0,
  Mymr: 0,
  Ethi: 0,
  Geor: 0,
  Armn: 0,
  Grek: 0,
  Tibt: 0,
  Other: 0,
});

function scriptOf(code: number): UnicodeScript {
  for (const [lo, hi, script] of SCRIPT_RANGES) {
    if (code >= lo && code <= hi) return script;
  }
  return 'Other';
}

function languageBase(code: string): string {
  return code.split('-')[0].toLowerCase();
}

/** Distinct language families in the catalog for a LanguageProfile.script tag. */
export function catalogLanguageBasesForScript(catalogScript: string): string[] {
  const bases = new Set<string>();
  for (const profile of listLanguageProfiles()) {
    if (profile.script === catalogScript) bases.add(languageBase(profile.code));
  }
  return [...bases];
}

/**
 * If catalog script maps to exactly one language family, return that family's
 * preferred catalog code (unsuffixed when present).
 */
export function uniqueCatalogLanguageForScript(catalogScript: string): string | null {
  const profiles = listLanguageProfiles().filter((p) => p.script === catalogScript);
  const bases = new Set(profiles.map((p) => languageBase(p.code)));
  if (bases.size !== 1) return null;
  const base = [...bases][0];
  const exact = profiles.find((p) => p.code.toLowerCase() === base);
  return exact?.code ?? profiles[0].code;
}

export function isAmbiguousCatalogScript(catalogScript: string): boolean {
  return catalogLanguageBasesForScript(catalogScript).length > 1;
}

function foldCatalogScript(counts: ScriptCounts): {
  catalogScript: string;
  uniqueLanguage: string | null;
} {
  const kana = counts.Hira + counts.Kana;
  if (counts.Hang > 0 && counts.Hang >= kana) {
    return { catalogScript: 'Kore', uniqueLanguage: uniqueCatalogLanguageForScript('Kore') };
  }
  if (kana > 0) {
    return { catalogScript: 'Jpan', uniqueLanguage: uniqueCatalogLanguageForScript('Jpan') };
  }
  if (counts.Hani > 0 && kana < 3 && counts.Hang < 3) {
    // Han without kana/hangul → Chinese family; Hans vs Hant is lexical, not unique-script.
    return { catalogScript: 'Hani', uniqueLanguage: null };
  }

  let best: UnicodeScript = 'Other';
  let bestN = -1;
  for (const [script, n] of Object.entries(counts) as [UnicodeScript, number][]) {
    if (script === 'Other' || script === 'Hani' || script === 'Hira' || script === 'Kana' || script === 'Hang') {
      continue;
    }
    if (n > bestN) {
      bestN = n;
      best = script;
    }
  }

  const catalogScript = UNICODE_TO_CATALOG_SCRIPT[best] ?? best;
  if (bestN <= 0) {
    return { catalogScript: 'Latn', uniqueLanguage: null };
  }
  return {
    catalogScript,
    uniqueLanguage: uniqueCatalogLanguageForScript(catalogScript),
  };
}

export function detectScript(text: string): ScriptDetection {
  const counts = EMPTY_COUNTS();
  let letterCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null || code <= 0x20) continue;
    const script = scriptOf(code);
    if (script === 'Other') continue;
    counts[script] += 1;
    letterCount += 1;
  }

  const folded = foldCatalogScript(counts);
  let dominantUnicode: UnicodeScript = 'Other';
  let dominantN = -1;
  for (const [script, n] of Object.entries(counts) as [UnicodeScript, number][]) {
    if (n > dominantN) {
      dominantN = n;
      dominantUnicode = script;
    }
  }

  const ambiguous =
    folded.uniqueLanguage == null &&
    folded.catalogScript !== 'Hani' &&
    isAmbiguousCatalogScript(folded.catalogScript);

  return {
    counts,
    letterCount,
    dominantUnicode,
    catalogScript: folded.catalogScript,
    uniqueLanguage: folded.uniqueLanguage,
    ambiguous: folded.catalogScript === 'Hani' ? false : ambiguous,
  };
}
