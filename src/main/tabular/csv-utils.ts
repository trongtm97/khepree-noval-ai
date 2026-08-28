export type CsvDelimiter = ',' | ';' | '\t';

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '_');
}

export function detectCsvDelimiter(sample: string): CsvDelimiter {
  const lines = sample.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  if (lines.length === 0) return ',';

  const scores: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const line of lines) {
    for (const delim of [',', ';', '\t'] as const) {
      scores[delim] += countDelimitersOutsideQuotes(line, delim);
    }
  }
  const ranked = (Object.entries(scores) as [CsvDelimiter, number][]).sort(
    (a, b) => b[1] - a[1],
  );
  return ranked[0]?.[1] ? ranked[0][0] : ',';
}

function countDelimitersOutsideQuotes(line: string, delim: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delim) count += 1;
  }
  return count;
}

export function parseCsvRows(text: string, delimiter: CsvDelimiter): Record<string, string>[] {
  const lines = splitCsvLines(text);
  if (lines.length < 1) return [];
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCsvLine(lines[i], delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) row[h] = (cols[idx] ?? '').trim();
    });
    if (Object.values(row).some((v) => v.length > 0)) rows.push(row);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  const lines: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      cur += ch;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      if (cur.length > 0) lines.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

export function parseCsvLine(line: string, delimiter: CsvDelimiter): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function serializeCsvRow(values: string[], delimiter: CsvDelimiter = ','): string {
  return values
    .map((v) => {
      if (v.includes('"') || v.includes(delimiter) || v.includes('\n') || v.includes('\r')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    })
    .join(delimiter);
}
