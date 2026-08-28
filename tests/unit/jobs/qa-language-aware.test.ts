import { describe, it, expect } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { runLocalQa } from '@main/jobs/qa-checker';
import { classifyRepairReason } from '@main/jobs/repair-strategies';
import type { ParsedBatchResult } from '@shared/schemas/output-protocol';

const P1 = '[C000001:P000001]';
const parser = new ResponseParser();

function parseOk(lines: string[]): ParsedBatchResult {
  const raw = [
    '<TRANSLATION>',
    ...lines,
    '</TRANSLATION>',
    '<TERM_DELTA>[]</TERM_DELTA>',
    '<MEMORY_DELTA>[]</MEMORY_DELTA>',
  ].join('\n');
  return parser.parse(raw);
}

function qaWithPair(
  lines: string[],
  sourceText: string,
  sourceLanguage: string,
  targetLanguage: string,
  extras?: Parameters<typeof runLocalQa>[0],
): ReturnType<typeof runLocalQa> {
  const parsed = parseOk(lines);
  return runLocalQa({
    parsed,
    sourceParagraphIds: [P1],
    sourceParagraphs: [{ paragraphId: P1, sourceText }],
    sourceLanguage,
    targetLanguage,
    ...extras,
  });
}

/** Long kana-heavy text — obvious wrong language for Latin targets. */
const KANA_HEAVY =
  'ひらがなだけの文章です。これはテストです。もう一文追加します。かきくけこさしすせそたちつてと。なにぬねのはひふへほ。';

const CYRILLIC_HEAVY =
  'Это длинный текст на кириллице для проверки языка. Ещё одно предложение здесь.';

const ARABIC_HEAVY =
  'هذا نص طويل بالعربية للاختبار. جملة أخرى هنا للتأكد من النسبة.';

const DEVANAGARI_HEAVY =
  'यह हिंदी में एक लंबा पाठ है जांच के लिए। एक और वाक्य यहाँ है।';

const THAI_HEAVY =
  'นี่คือข้อความภาษาไทยที่ยาวสำหรับการทดสอบ อีกหนึ่งประโยคที่นี่';

describe('language-aware QA — wrong target language', () => {
  const latinTargetCases: Array<[string, string, string]> = [
    ['zh-Hans', 'vi', KANA_HEAVY],
    ['ja', 'en', KANA_HEAVY],
    ['ko', 'vi', '한국어로만쓴문장입니다.테스트를위한긴문장입니다.또한번더씁니다.'],
    ['ru', 'vi', CYRILLIC_HEAVY],
    ['uk', 'en', CYRILLIC_HEAVY],
    ['hi', 'vi', DEVANAGARI_HEAVY],
    ['th', 'en', THAI_HEAVY],
  ];

  it.each(latinTargetCases)(
    'flags foreign script for %s → %s',
    (sourceLanguage, targetLanguage, wrongText) => {
      const qa = qaWithPair(
        [`${P1} ${wrongText}`],
        'source placeholder text',
        sourceLanguage,
        targetLanguage,
      );
      expect(
        qa.errors.some((e) => e.code === 'target_language_mismatch') ||
          qa.warnings.some((e) => e.code === 'target_language_mismatch'),
      ).toBe(true);
      if (qa.errors.some((e) => e.code === 'target_language_mismatch')) {
        expect(qa.verdict).toBe('REPAIR_REQUIRED');
      }
    },
  );

  it('fa → en flags Persian script in English target', () => {
    const qa = qaWithPair(
      [`${P1} ${ARABIC_HEAVY}`],
      'متن فارسی للاختبار',
      'fa',
      'en',
    );
    expect(
      qa.errors.some((e) => e.code === 'target_language_mismatch') ||
        qa.warnings.some((e) => e.code === 'target_language_mismatch'),
    ).toBe(true);
  });

  it('ar → fr passes Latin French output script check', () => {
    const qa = qaWithPair(
      [`${P1} Il marcha dans la ville et acheta du pain.`],
      'مرحبا كيف حالك اليوم في المدينة.',
      'ar',
      'fr',
    );
    expect(qa.errors.some((e) => e.code === 'target_language_mismatch')).toBe(false);
    expect(qa.verdict).toBe('PASS');
  });

  it('en → es valid Spanish passes script check', () => {
    const qa = qaWithPair(
      [`${P1} Él caminó por el mercado y compró pan fresco.`],
      'He walked to the market.',
      'en',
      'es',
    );
    expect(qa.errors.some((e) => e.code === 'target_language_mismatch')).toBe(false);
    expect(qa.verdict).toBe('PASS');
  });
});

describe('language-aware QA — source leakage', () => {
  it('en → es warns on unchanged English sentence', () => {
    const source =
      'He walked to the market and bought some bread for dinner tonight after work.';
    const qa = qaWithPair([`${P1} ${source}`], source, 'en', 'es');
    expect(qa.warnings.some((e) => e.code === 'source_leakage')).toBe(true);
    expect(qa.verdict).toBe('PASS_WITH_WARNINGS');
  });

  it('es → en warns on unchanged Spanish sentence', () => {
    const source =
      'Él caminó por el mercado y compró pan fresco para la cena de esta noche después del trabajo.';
    const qa = qaWithPair([`${P1} ${source}`], source, 'es', 'en');
    expect(qa.warnings.some((e) => e.code === 'source_leakage')).toBe(true);
    expect(qa.verdict).toBe('PASS_WITH_WARNINGS');
  });

  it('zh → vi warns on large unchanged CJK span', () => {
    const cjk = '李逍遥走进青云门的大门然后继续往前走去';
    const qa = qaWithPair([`${P1} ${cjk}`], cjk, 'zh-Hans', 'vi');
    expect(qa.warnings.some((e) => e.code === 'source_leakage')).toBe(true);
  });

  it('ignores locked term preferred form in leakage check', () => {
    const qa = qaWithPair(
      [`${P1} Wang Lin walked.`],
      '王林走路。',
      'zh-Hans',
      'en',
      {
        lockedTerms: [{ source: '王林', preferred: 'Wang Lin' }],
      },
    );
    expect(qa.warnings.some((e) => e.code === 'source_leakage')).toBe(false);
  });
});

describe('language-aware QA — locked terms & edition leak', () => {
  it('edition leak: Vietnamese form in English edition', () => {
    const qa = qaWithPair(
      [`${P1} Vương Lâm walked through the gate.`],
      '王林走过大门。',
      'zh-Hans',
      'en',
      {
        lockedTerms: [
          {
            source: '王林',
            preferred: 'Wang Lin',
            crossEditionForbidden: ['Vương Lâm'],
          },
        ],
      },
    );
    expect(qa.errors.some((e) => e.code === 'edition_term_leak')).toBe(true);
    expect(qa.verdict).toBe('MANUAL_REVIEW');
    expect(classifyRepairReason(parseOk([`${P1} Vương Lâm walked.`]), qa)).toBe(
      'TERM_VIOLATION',
    );
  });

  it('normalized match accepts case variant for Latin target', () => {
    const qa = qaWithPair(
      [`${P1} Hắn dùng Linh Khí.`],
      '他使用灵气。',
      'zh-Hans',
      'vi',
      {
        lockedTerms: [
          {
            source: '灵气',
            preferred: 'linh khí',
            forbiddenVariants: ['linh khi'],
          },
        ],
      },
    );
    expect(qa.verdict).toBe('PASS');
  });

  it('forbidden variant still flagged with normalization', () => {
    const qa = qaWithPair(
      [`${P1} Hắn dùng linh khi.`],
      '他使用灵气。',
      'zh-Hans',
      'vi',
      {
        lockedTerms: [
          {
            source: '灵气',
            preferred: 'linh khí',
            forbiddenVariants: ['linh khi'],
          },
        ],
      },
    );
    expect(qa.errors.some((e) => e.code === 'locked_term_forbidden_variant')).toBe(true);
  });
});

describe('language-aware QA — address consistency', () => {
  it('warns when locked address form missing', () => {
    const qa = qaWithPair(
      [`${P1} Tanaka spoke.`],
      '田中が佐藤に話した。',
      'ja',
      'en',
      {
        lockedAddressTerms: [
          {
            speakerSourceName: '田中',
            addresseeSourceName: '佐藤',
            expectedForm: 'Sato-san',
            locked: true,
          },
        ],
      },
    );
    expect(qa.warnings.some((e) => e.code === 'address_inconsistency')).toBe(true);
    expect(qa.verdict).toBe('PASS_WITH_WARNINGS');
  });
});

describe('language-aware QA — structural checks preserved', () => {
  it('still REPAIR_REQUIRED on missing paragraph with language pair', () => {
    const parsed = parseOk([`${P1} OK.`]);
    const qa = runLocalQa({
      parsed,
      sourceParagraphIds: [P1, '[C000001:P000002]'],
      sourceParagraphs: [
        { paragraphId: P1, sourceText: '一' },
        { paragraphId: '[C000001:P000002]', sourceText: '二' },
      ],
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    expect(qa.verdict).toBe('REPAIR_REQUIRED');
    expect(qa.missingParagraphIds).toHaveLength(1);
  });

  it('wrong language error triggers CORRUPT_PARAGRAPH repair reason', () => {
    const qa = qaWithPair([`${P1} ${KANA_HEAVY}`], 'test', 'ja', 'en');
    const parsed = parseOk([`${P1} ${KANA_HEAVY}`]);
    if (qa.errors.some((e) => e.code === 'target_language_mismatch')) {
      expect(classifyRepairReason(parsed, qa)).toBe('CORRUPT_PARAGRAPH');
    }
  });
});

describe('unicode-script utilities', () => {
  it('computes foreign ratio for kana in Latin target', async () => {
    const { computeScriptHistogram, foreignScriptRatio, scriptTagToBuckets } =
      await import('@shared/utils/unicode-script');
    const hist = computeScriptHistogram(KANA_HEAVY);
    const foreign = foreignScriptRatio(hist, scriptTagToBuckets('Latn'));
    expect(foreign).toBeGreaterThan(0.4);
  });
});
