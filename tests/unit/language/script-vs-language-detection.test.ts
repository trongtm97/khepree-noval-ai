import { describe, expect, it, vi } from 'vitest';
import {
  buildAiLanguageDetectPrompt,
  buildAiLanguageDetectPromptBody,
} from '@main/language/ai-language-detect';
import { scoreLexicalEvidence } from '@main/language/language-lexical';
import {
  detectLanguageHeuristic,
  detectSourceLanguage,
  LANGUAGE_HIGH_CONFIDENCE,
  SCRIPT_ONLY_MAX_CONFIDENCE,
} from '@main/language/language-detect';
import {
  detectScript,
  isAmbiguousCatalogScript,
} from '@main/language/script-detect';
import { listLanguageCatalogCodes } from '@shared/constants/language-profile';

const FA =
  'این یک رمان فارسی است. قهرمان داستان در تهران زندگی می‌کرد و هر روز به دانشگاه می‌رفت.';
const UR =
  'یہ ایک اردو ناول ہے۔ ہیرو کراچی میں رہتا ہے اور اسکول جاتا ہے۔ وہ نہیں جانتا تھا کہ آگے کیا ہوگا۔';
const UK =
  'Це український роман. Герой живе в Києві і ходить до школи щодня. Він не знав, що буде далі.';
const BG =
  'Това е български роман. Героят живее в София и ходи на училище всеки ден. Той не знаеше какво да прави.';
const IT =
  'Il protagonista camminava lentamente per la città. Non era la prima volta che vedeva quella piazza. La gente della città non lo guardava.';
const NL =
  'Het was een rustige ochtend in het dorp. De man liep naar de markt en kocht brood. Het was niet de eerste keer dat hij daar was.';
const PL =
  'Bohater wszedł do małego miasteczka. Nie było tam nikogo. Życie toczyło się powoli przy rzece.';
const KK =
  'Бұл қазақ романы. Кейіпкер Алматыда тұрады және мектепке барады. Қыс өте суық болды.';
const TH =
  'นี่คือนิยายภาษาไทย ตัวเอกอาศัยอยู่ในกรุงเทพฯ และไปโรงเรียนทุกวัน เขาไม่รู้ว่าจะเกิดอะไรขึ้น';
const GENERIC_CYRL = 'Ааа Ббб Ввв Ггг Ддд Еее Жжж Ззз Иии Ккк Ллл Ммм Ннн Ооо Ппп';
const GENERIC_ARAB = 'باب باب باب دار دار دار شمس شمس شمس ليل ليل ليل';
const GENERIC_LATN = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed eiusmod tempor';
const HE =
  'זה ספר עברי. הוא הלך אל הבית ברחוב ואחר כך ישב ליד השולחן.';

function mockAi(code: string) {
  return vi.fn(() =>
    Promise.resolve({
      code,
      confidence: 0.93,
      mixedLanguage: false,
      secondaryLanguages: [] as string[],
    }),
  );
}

describe('script detection ≠ language detection', () => {
  it('Cyrl / Arab / Latn / Hebr are ambiguous catalog scripts', () => {
    expect(isAmbiguousCatalogScript('Cyrl')).toBe(true);
    expect(isAmbiguousCatalogScript('Arab')).toBe(true);
    expect(isAmbiguousCatalogScript('Latn')).toBe(true);
    expect(isAmbiguousCatalogScript('Hebr')).toBe(true);
    expect(isAmbiguousCatalogScript('Thai')).toBe(false);
    expect(isAmbiguousCatalogScript('Kore')).toBe(false);
    expect(isAmbiguousCatalogScript('Jpan')).toBe(false);
  });

  it('Persian sample is Arab script, not automatically Arabic language', () => {
    const script = detectScript(FA);
    expect(script.catalogScript).toBe('Arab');
    expect(script.uniqueLanguage).toBeNull();
    expect(script.ambiguous).toBe(true);
  });

  it('Ukrainian sample is Cyrl script, not automatically Russian', () => {
    const script = detectScript(UK);
    expect(script.catalogScript).toBe('Cyrl');
    expect(script.uniqueLanguage).toBeNull();
  });

  it('script-only Cyrillic stays below high confidence', () => {
    const h = detectLanguageHeuristic(GENERIC_CYRL);
    expect(h.script).toBe('Cyrl');
    expect(h.languageSpecific).toBe(false);
    expect(h.confidence).toBeLessThan(LANGUAGE_HIGH_CONFIDENCE);
    expect(h.confidence).toBeLessThanOrEqual(SCRIPT_ONLY_MAX_CONFIDENCE);
  });

  it('script-only Arabic stays below high confidence', () => {
    const h = detectLanguageHeuristic(GENERIC_ARAB);
    expect(h.script).toBe('Arab');
    expect(h.languageSpecific).toBe(false);
    expect(h.confidence).toBeLessThan(LANGUAGE_HIGH_CONFIDENCE);
  });

  it('generic Latin does not become high-confidence English from script alone', () => {
    const h = detectLanguageHeuristic(GENERIC_LATN);
    expect(h.script).toBe('Latn');
    expect(h.languageSpecific).toBe(false);
    expect(h.confidence).toBeLessThan(LANGUAGE_HIGH_CONFIDENCE);
  });
});

describe('language-specific local evidence', () => {
  it('Persian text → fa, not ar', async () => {
    const r = await detectSourceLanguage({ sampleText: FA });
    expect(r.detectedLanguage).toBe('fa');
    expect(r.detectedLanguage).not.toBe('ar');
  });

  it('Urdu → ur', async () => {
    const r = await detectSourceLanguage({ sampleText: UR });
    expect(r.detectedLanguage).toBe('ur');
  });

  it('Ukrainian → uk, not ru', async () => {
    const r = await detectSourceLanguage({ sampleText: UK });
    expect(r.detectedLanguage).toBe('uk');
    expect(r.detectedLanguage).not.toBe('ru');
  });

  it('Bulgarian → bg', async () => {
    const r = await detectSourceLanguage({ sampleText: BG });
    expect(r.detectedLanguage).toBe('bg');
  });

  it('Italian → it, not en', async () => {
    const r = await detectSourceLanguage({ sampleText: IT });
    expect(r.detectedLanguage).toBe('it');
    expect(r.detectedLanguage).not.toBe('en');
  });

  it('Dutch → nl', async () => {
    const r = await detectSourceLanguage({ sampleText: NL });
    expect(r.detectedLanguage).toBe('nl');
  });

  it('Polish → pl', async () => {
    const r = await detectSourceLanguage({ sampleText: PL });
    expect(r.detectedLanguage).toBe('pl');
  });

  it('Kazakh Cyrillic → kk', async () => {
    const r = await detectSourceLanguage({ sampleText: KK });
    expect(r.detectedLanguage).toBe('kk');
  });

  it('Thai script can be high-confidence th', async () => {
    const h = detectLanguageHeuristic(TH);
    expect(h.code).toBe('th');
    expect(h.languageSpecific).toBe(true);
    expect(h.confidence).toBeGreaterThanOrEqual(LANGUAGE_HIGH_CONFIDENCE);
    const aiDetect = vi.fn();
    await detectSourceLanguage({ sampleText: TH, aiDetect });
    expect(aiDetect).not.toHaveBeenCalled();
  });

  it('user hint is non-authoritative: hint ar + Persian → fa + mismatch', async () => {
    const r = await detectSourceLanguage({ sampleText: FA, hintCode: 'ar' });
    expect(r.detectedLanguage).toBe('fa');
    expect(r.hintMismatch).toBe(true);
    expect(r.hintCode).toBe('ar');
  });
});

describe('ambiguous script MUST call AI', () => {
  it('generic Cyrillic calls AI (mock uk)', async () => {
    const aiDetect = mockAi('uk');
    const r = await detectSourceLanguage({ sampleText: GENERIC_CYRL, aiDetect });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).toBe('uk');
    expect(r.method).toBe('AI');
  });

  it('generic Arabic calls AI (mock fa)', async () => {
    const aiDetect = mockAi('fa');
    const r = await detectSourceLanguage({ sampleText: GENERIC_ARAB, aiDetect });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).toBe('fa');
  });

  it('generic Latin calls AI (mock it)', async () => {
    const aiDetect = mockAi('it');
    const r = await detectSourceLanguage({ sampleText: GENERIC_LATN, aiDetect });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).toBe('it');
  });

  it('Hebrew script without Yiddish letters calls AI (he/yi ambiguity)', async () => {
    const aiDetect = mockAi('he');
    const r = await detectSourceLanguage({ sampleText: HE, aiDetect });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).toBe('he');
  });

  it('Bulgarian with AI mock still bg when local already identified', async () => {
    const aiDetect = mockAi('bg');
    const r = await detectSourceLanguage({ sampleText: BG, aiDetect });
    expect(r.detectedLanguage).toBe('bg');
    if (!detectLanguageHeuristic(BG).languageSpecific) {
      expect(aiDetect).toHaveBeenCalled();
    }
  });
});

describe('AI result validates through LanguageProfile registry', () => {
  it('rejects unknown AI codes and keeps local fallback', async () => {
    const aiDetect = mockAi('zz-not-a-language');
    const r = await detectSourceLanguage({ sampleText: GENERIC_CYRL, aiDetect });
    expect(aiDetect).toHaveBeenCalled();
    expect(r.detectedLanguage).not.toBe('zz-not-a-language');
    expect(listLanguageCatalogCodes()).toContain(r.detectedLanguage);
  });

  it('accepts catalog AI codes including fa', async () => {
    const aiDetect = mockAi('fa');
    const r = await detectSourceLanguage({ sampleText: GENERIC_ARAB, aiDetect });
    expect(r.detectedLanguage).toBe('fa');
    expect(r.profileMissing).not.toBe(true);
  });
});

describe('AI prompt uses World Language Catalog', () => {
  it('includes catalog codes, not the obsolete short BCP-47 list only', () => {
    const body = buildAiLanguageDetectPromptBody();
    expect(body).toContain('World Language Catalog');
    for (const code of ['fa', 'ur', 'uk', 'bg', 'it', 'nl', 'pl', 'kk', 'zh-Hans', 'sr-Cyrl']) {
      expect(body).toContain(code);
    }
    expect(body).not.toMatch(
      /Use BCP-47 codes \(en, ja, ko, zh-Hans, zh-Hant, vi, th, ar, ru, es, fr, de, pt, id\)/,
    );
    const prompt = buildAiLanguageDetectPrompt('sample');
    expect(prompt.startsWith(body)).toBe(true);
    expect(listLanguageCatalogCodes().every((c) => body.includes(c))).toBe(true);
  });
});

describe('lexical markers do not fire on the wrong language', () => {
  it('Persian lexical winner is fa', () => {
    const lex = scoreLexicalEvidence(FA);
    expect(lex.bestCode).toBe('fa');
    expect(lex.languageSpecific).toBe(true);
  });

  it('Ukrainian lexical winner is uk', () => {
    const lex = scoreLexicalEvidence(UK);
    expect(lex.bestCode).toBe('uk');
    expect(lex.languageSpecific).toBe(true);
  });
});
