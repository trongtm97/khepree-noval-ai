import { describe, expect, it } from 'vitest';
import {
  OUTPUT_PROTOCOL_BLOCK,
  OUTPUT_PROTOCOL_VERSION,
} from '@shared/constants/translation-pack';
import { ResponseParser } from '@main/jobs/response-parser';

const parser = new ResponseParser();

const IDS = {
  p1: '[C000001:P000001]',
  p2: '[C000001:P000002]',
} as const;

function v2Body(translationLines: string[]): string {
  return [
    'Output Protocol Version: 2',
    '',
    '<TRANSLATION>',
    ...translationLines,
    '</TRANSLATION>',
    '',
    '<TERM_DELTA>',
    '[]',
    '</TERM_DELTA>',
    '',
    '<MEMORY_DELTA>',
    '[]',
    '</MEMORY_DELTA>',
  ].join('\n');
}

describe('Output Protocol v2', () => {
  it('exports version 2', () => {
    expect(OUTPUT_PROTOCOL_VERSION).toBe(2);
  });

  it('OUTPUT_PROTOCOL_BLOCK snapshot', () => {
    expect(OUTPUT_PROTOCOL_BLOCK).toMatchSnapshot();
  });

  it('block contains version header and delta guardrails', () => {
    expect(OUTPUT_PROTOCOL_BLOCK).toMatch(/Output Protocol Version:\s*2/i);
    expect(OUTPUT_PROTOCOL_BLOCK).toContain('do not manufacture');
    expect(OUTPUT_PROTOCOL_BLOCK).not.toContain('```');
  });

  const multilingualSamples: { lang: string; lines: string[]; text: string }[] = [
    {
      lang: 'Arabic RTL',
      lines: [`${IDS.p1} مرحبًا بالعالم.`],
      text: 'مرحبًا بالعالم.',
    },
    {
      lang: 'Japanese',
      lines: [`${IDS.p1} こんにちは世界。`],
      text: 'こんにちは世界。',
    },
    {
      lang: 'Vietnamese',
      lines: [`${IDS.p1} Xin chào thế giới.`],
      text: 'Xin chào thế giới.',
    },
    {
      lang: 'English',
      lines: [`${IDS.p1} Hello world.`],
      text: 'Hello world.',
    },
    {
      lang: 'French',
      lines: [`${IDS.p1} Bonjour le monde.`],
      text: 'Bonjour le monde.',
    },
  ];

  for (const { lang, lines, text } of multilingualSamples) {
    it(`ResponseParser parses v2 ${lang} translation`, () => {
      const result = parser.parse(v2Body(lines));
      expect(result.status).toBe('ok');
      expect(result.protocolVersion).toBe(2);
      expect(result.translations).toHaveLength(1);
      expect(result.translations[0]?.paragraphId).toBe(IDS.p1);
      expect(result.translations[0]?.text).toBe(text);
    });
  }

  it('v1 responses without version header still parse', () => {
    const raw = [
      '<TRANSLATION>',
      `${IDS.p1} Legacy line.`,
      '</TRANSLATION>',
      '<TERM_DELTA>',
      '[]',
      '</TERM_DELTA>',
      '<MEMORY_DELTA>',
      '[]',
      '</MEMORY_DELTA>',
    ].join('\n');
    const result = parser.parse(raw);
    expect(result.status).toBe('ok');
    expect(result.protocolVersion).toBeNull();
    expect(result.translations[0]?.text).toBe('Legacy line.');
  });

  it('v2 multi-line batch across IDs', () => {
    const raw = v2Body([
      `${IDS.p1} Première ligne.`,
      `${IDS.p2} Deuxième ligne.`,
    ]);
    const result = parser.parse(raw);
    expect(result.translations).toHaveLength(2);
    expect(result.protocolVersion).toBe(2);
  });
});
