import { describe, it, expect } from 'vitest';
import { ResponseParser } from '@main/jobs/response-parser';
import { tryParseJson } from '@main/jobs/json-repair';
import { extractSections } from '@main/jobs/output-recovery';

const IDS = {
  p1: '[C000001:P000001]',
  p2: '[C000001:P000002]',
  p3: '[C000001:P000003]',
} as const;

function validBody(lines: string[]): string {
  return [
    '<TRANSLATION>',
    ...lines,
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

describe('tryParseJson (safe repair)', () => {
  it('parses valid JSON', () => {
    const r = tryParseJson('[{"action":"confirm","source":"a","target":"b"}]');
    expect(r.ok).toBe(true);
    expect(r.repaired).toBe(false);
  });

  it('removes trailing commas', () => {
    const r = tryParseJson('[{"action":"confirm","source":"a","target":"b",},]');
    expect(r.ok).toBe(true);
    expect(r.repairs).toContain('trailing_comma');
  });

  it('normalizes single quotes when no doubles', () => {
    const r = tryParseJson("[{'action':'confirm','source':'a','target':'b'}]");
    expect(r.ok).toBe(true);
    expect(r.repairs).toContain('single_quotes');
  });

  it('closes truncated array when safe', () => {
    const r = tryParseJson('[{"action":"confirm","source":"a","target":"b"}');
    expect(r.ok).toBe(true);
    expect(r.repairs).toContain('missing_array_close');
  });

  it('fails on severely broken JSON without inventing content', () => {
    const r = tryParseJson('{not json at all:::');
    expect(r.ok).toBe(false);
  });
});

describe('extractSections', () => {
  it('strips outer markdown fence', () => {
    const raw = '```xml\n' + validBody([`${IDS.p1} Xin chào.`]) + '\n```';
    const s = extractSections(raw);
    expect(s.translation).toContain(IDS.p1);
    expect(s.warnings.some((w) => w.code === 'markdown_fence_stripped')).toBe(true);
  });

  it('ignores intro prose', () => {
    const raw = `Sure! Here is the translation:\n\n${validBody([`${IDS.p1} Hi.`])}`;
    const s = extractSections(raw);
    expect(s.warnings.some((w) => w.code === 'intro_prose_ignored')).toBe(true);
    expect(s.translation).toContain('Hi.');
  });

  it('recovers missing closing TRANSLATION tag', () => {
    const raw = [
      '<TRANSLATION>',
      `${IDS.p1} A.`,
      '<TERM_DELTA>',
      '[]',
      '</TERM_DELTA>',
      '<MEMORY_DELTA>',
      '[]',
      '</MEMORY_DELTA>',
    ].join('\n');
    const s = extractSections(raw);
    expect(s.translation).toContain(IDS.p1);
    expect(s.warnings.some((w) => w.code === 'missing_closing_tag')).toBe(true);
  });
});

describe('ResponseParser', () => {
  const parser = new ResponseParser();

  it('strict-parses clean response', () => {
    const result = parser.parse(
      validBody([`${IDS.p1} Hắn bước vào.`, `${IDS.p2} Rừng sâu.`]),
    );
    expect(result.status).toBe('ok');
    expect(result.recoveryUsed).toBe(false);
    expect(result.translations).toHaveLength(2);
    expect(result.termDeltas).toEqual([]);
    expect(result.memoryDeltas).toEqual([]);
  });

  it('parses term + memory deltas', () => {
    const raw = [
      '<TRANSLATION>',
      `${IDS.p1} Linh khí tràn ngập.`,
      '</TRANSLATION>',
      '<TERM_DELTA>',
      JSON.stringify([
        {
          action: 'discover',
          source: '灵气',
          target: 'linh khí',
          category: 'skill',
          confidence: 'high',
        },
      ]),
      '</TERM_DELTA>',
      '<MEMORY_DELTA>',
      JSON.stringify([
        {
          action: 'upsert',
          category: 'plot',
          key: 'power',
          value: 'foundation',
        },
      ]),
      '</MEMORY_DELTA>',
    ].join('\n');
    const result = parser.parse(raw);
    expect(result.status).toBe('ok');
    expect(result.termDeltas).toHaveLength(1);
    expect(result.memoryDeltas).toHaveLength(1);
  });

  describe('malformed responses', () => {
    it('markdown fence around whole response → recovered', () => {
      const raw = '```\n' + validBody([`${IDS.p1} Ok.`]) + '\n```';
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.translations[0]?.text).toBe('Ok.');
    });

    it('intro chatter before tags → recovered', () => {
      const raw = `I'll translate carefully.\n\n${validBody([`${IDS.p1} X.`])}`;
      const result = parser.parse(raw);
      expect(['recovered', 'ok']).toContain(result.status);
      expect(result.translations).toHaveLength(1);
    });

    it('TERM_DELTA trailing comma → json repaired', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[{"action":"confirm","source":"李","target":"Lý",},]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.termDeltas).toHaveLength(1);
      expect(result.warnings.some((w) => w.code === 'json_repaired')).toBe(true);
    });

    it('TERM_DELTA single quotes → repaired', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        "[{'action':'confirm','source':'李','target':'Lý'}]",
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.termDeltas[0]).toMatchObject({ action: 'confirm' });
    });

    it('TERM_DELTA wrapped in json fence → recovered', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '```json',
        '[]',
        '```',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.termDeltas).toEqual([]);
    });

    it('missing MEMORY_DELTA section → assume []', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.memoryDeltas).toEqual([]);
      expect(result.warnings.some((w) => w.code === 'empty_delta_assumed')).toBe(
        true,
      );
    });

    it('missing closing TRANSLATION tag → recovered', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        `${IDS.p2} B.`,
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.translations).toHaveLength(2);
      expect(result.status).toBe('recovered');
    });

    it('truncated TERM_DELTA array → repaired close', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[{"action":"confirm","source":"a","target":"b"}',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.termDeltas).toHaveLength(1);
    });

    it('no TRANSLATION tags but paragraph ID lines → recover lines', () => {
      const raw = `${IDS.p1} Hắn đi.\n${IDS.p2} Rừng.`;
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.translations).toHaveLength(2);
      expect(result.translations[0]?.paragraphId).toBe(IDS.p1);
    });

    it('no TRANSLATION tags and no paragraph IDs → needs_repair (no invent)', () => {
      const raw = 'Hắn đi vào rừng sâu mà không có ID đoạn.';
      const result = parser.parse(raw);
      expect(result.status).toBe('needs_repair');
      expect(result.translations).toHaveLength(0);
    });

    it('TRANSLATION empty body → needs_repair', () => {
      const raw = validBody([]);
      const result = parser.parse(raw);
      expect(result.status).toBe('needs_repair');
    });

    it('prose lines inside TRANSLATION ignored; IDs kept', () => {
      const raw = [
        '<TRANSLATION>',
        'Here are the lines:',
        `${IDS.p1} A.`,
        '(note: good)',
        `${IDS.p2} B.`,
        '</TRANSLATION>',
        '<TERM_DELTA>[]</TERM_DELTA>',
        '<MEMORY_DELTA>[]</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.translations.map((t) => t.paragraphId)).toEqual([
        IDS.p1,
        IDS.p2,
      ]);
    });

    it('invalid TERM_DELTA schema → recovered (keep translations, discard delta)', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[{"action":"discover","source":"x"}]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.translations).toHaveLength(1);
      expect(result.termDeltas).toEqual([]);
      expect(result.warnings.some((w) => w.code === 'delta_discarded')).toBe(true);
    });

    it('garbage JSON in MEMORY_DELTA → recovered (keep translations)', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '{broken: true,,,}',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.translations).toHaveLength(1);
      expect(result.memoryDeltas).toEqual([]);
      expect(
        result.warnings.some(
          (w) => w.code === 'delta_discarded' && w.section === 'MEMORY_DELTA',
        ),
      ).toBe(true);
    });

    it('smart quotes in JSON → repaired', () => {
      const raw = [
        '<TRANSLATION>',
        `${IDS.p1} A.`,
        '</TRANSLATION>',
        '<TERM_DELTA>',
        '[{“action”:“confirm”,“source”:“a”,“target”:“b”}]',
        '</TERM_DELTA>',
        '<MEMORY_DELTA>',
        '[]',
        '</MEMORY_DELTA>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.termDeltas).toHaveLength(1);
    });

    it('does not invent missing paragraph IDs from source context', () => {
      const raw = validBody([`${IDS.p1} Only one.`]);
      const result = parser.parse(raw);
      expect(result.translations).toHaveLength(1);
      expect(result.translations.find((t) => t.paragraphId === IDS.p2)).toBeUndefined();
    });

    it('detects protocol version header', () => {
      const raw = `Output Protocol Version: 1\n\n${validBody([`${IDS.p1} A.`])}`;
      const result = parser.parse(raw);
      expect(result.protocolVersion).toBe(1);
    });

    it('HTML-ish wrong-case tags recovered via tolerant extract', () => {
      const raw = [
        '<translation>',
        `${IDS.p1} A.`,
        '</translation>',
        '<term_delta>[]</term_delta>',
        '<memory_delta>[]</memory_delta>',
      ].join('\n');
      const result = parser.parse(raw);
      expect(result.status).toBe('recovered');
      expect(result.translations[0]?.text).toBe('A.');
    });

    it('duplicate ID lines preserved for QA (parser does not drop)', () => {
      const raw = validBody([
        `${IDS.p1} First.`,
        `${IDS.p1} Second.`,
        `${IDS.p2} Other.`,
      ]);
      const result = parser.parse(raw);
      expect(result.translations.filter((t) => t.paragraphId === IDS.p1)).toHaveLength(
        2,
      );
    });

    it('empty translation text after ID kept as empty string', () => {
      const raw = validBody([`${IDS.p1} `, `${IDS.p2} Ok.`]);
      const result = parser.parse(raw);
      const empty = result.translations.find((t) => t.paragraphId === IDS.p1);
      expect(empty?.text).toBe('');
    });
  });
});
