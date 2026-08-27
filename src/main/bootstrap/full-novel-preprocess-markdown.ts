import type { BootstrapAnalysisOutput } from '@shared/schemas/bootstrap';
import { BootstrapAnalysisOutputSchema } from '@shared/schemas/bootstrap';
import type { ParsedKnowledgeFiles } from './full-novel-preprocess-parser';

/**
 * Best-effort markdown → bootstrap JSON shape for persistBootstrapAnalysis.
 */
export function knowledgeMarkdownToBootstrapOutput(
  files: ParsedKnowledgeFiles,
): BootstrapAnalysisOutput {
  const terms = parseTerms(files['02_PROJECT_TERMS.md'] ?? '');
  const characters = parseCharacters(files['03_CHARACTERS.md'] ?? '');
  const relationships = parseRelationships(files['04_RELATIONSHIPS.md'] ?? '');
  const story = parseStory(files['05_STORY_STATE.md'] ?? '');
  const world = parseWorld(files['06_WORLD_KNOWLEDGE.md'] ?? '');
  const recent = parseRecent(files['07_RECENT_CONTEXT.md'] ?? '');

  return BootstrapAnalysisOutputSchema.parse({
    characters,
    relationships,
    terms,
    world_knowledge: world,
    story_state: story,
    recent_context: recent,
  });
}

/** Extract bullet/rule lines from 01 for style_config.rules */
export function extractStyleRulesFromMarkdown(md: string): string[] {
  return bulletLines(md)
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter((l) => l.length > 3 && !l.startsWith("#"))
    .slice(0, 80);
}

function bulletLines(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-*•]/.test(l) || /^[0-9]+\./.test(l));
}

function parseTerms(md: string): BootstrapAnalysisOutput['terms'] {
  const out: BootstrapAnalysisOutput['terms'] = [];
  const re =
    /^[-*•]?\s*(.+?)\s*(?:→|->|=>)\s*(.+?)(?:\s*[（(]\s*([A-Za-z_/]+)\s*[）)])?(?:\s*(?:ch\.?|chương)\s*\d+)?\s*$/i;
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    const m = re.exec(t);
    if (!m) continue;
    const source = m[1].trim();
    const preferred = m[2].trim();
    if (!source || !preferred) continue;
    out.push({
      source,
      preferred_vi: preferred,
      category: m[3] ? m[3].toUpperCase() : undefined,
      first_seen_chapter: parseChapterNum(
        /ch\.?\s*(\d+)/i.exec(t)?.[1] ?? /chương\s*(\d+)/i.exec(t)?.[1] ?? null,
      ),
      future_sensitive: /future|spoiler/i.test(t),
      confidence: 0.7,
    });
  }
  return out;
}

function parseCharacters(md: string): BootstrapAnalysisOutput['characters'] {
  const out: BootstrapAnalysisOutput['characters'] = [];
  const sections = md.split(/\n(?=##\s+)/);
  for (const section of sections) {
    const header = /^##\s+(.+)\s*$/m.exec(section);
    if (!header) continue;
    const source_name = header[1].trim();
    if (!source_name || /^nhân vật/i.test(source_name)) continue;
    const field = (label: RegExp): string | null => {
      const m = fieldLine(section, label);
      return m;
    };
    const aliasesRaw = field(/bí\s*danh|aliases?/i);
    out.push({
      source_name,
      preferred_vi: field(/tên\s*việt|preferred|translated/i),
      gender: field(/giới\s*tính|gender/i),
      role: field(/vai\s*trò|role/i),
      aliases: aliasesRaw
        ? aliasesRaw.split(/[,;/|]/).map((a) => a.trim()).filter(Boolean)
        : [],
      first_seen_chapter: parseChapterNum(field(/first[_\s-]?seen|chương\s*đầu|xuất\s*hiện/i)),
      discovered_from_chapter: parseChapterNum(
        field(/discovered[_\s-]?from|phát\s*hiện/i),
      ),
      future_sensitive: /future|spoiler|nhạy\s*cảm\s*tương\s*lai/i.test(section),
      confidence: 0.7,
    });
  }
  return out;
}

function parseChapterNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const m = /(\d+)/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fieldLine(section: string, label: RegExp): string | null {
  for (const line of section.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    const m = new RegExp(`^(?:${label.source})\\s*[:：]\\s*(.+)$`, 'i').exec(t);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function parseRelationships(md: string): BootstrapAnalysisOutput['relationships'] {
  const out: BootstrapAnalysisOutput['relationships'] = [];
  const re =
    /^[-*•]?\s*(.+?)\s*[—–-]\s*(.+?)\s*[:：]\s*(.+)$/;
  for (const line of md.split(/\r?\n/)) {
    const t = line.trim().replace(/^[-*•]\s*/, '');
    const m = re.exec(t);
    if (!m) continue;
    out.push({
      character_a: m[1].trim(),
      character_b: m[2].trim(),
      relationship_type: m[3].trim().slice(0, 80),
      valid_from_chapter: parseChapterNum(
        /from\s*ch\.?\s*(\d+)/i.exec(t)?.[1] ??
          /từ\s*chương\s*(\d+)/i.exec(t)?.[1] ??
          null,
      ),
      future_sensitive: /future|spoiler/i.test(t),
      confidence: 0.6,
    });
  }
  return out;
}

function parseStory(md: string): BootstrapAnalysisOutput['story_state'] {
  const bullets = bulletLines(md).map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim());
  return {
    summary: md.trim().slice(0, 8000) || 'Imported from NotebookLM preprocess.',
    current_locations: pickLabeled(md, /location|địa\s*điểm|vị\s*trí/i, bullets).slice(0, 20),
    current_goals: pickLabeled(md, /goal|mục\s*tiêu/i, bullets).slice(0, 20),
    current_conflicts: pickLabeled(md, /conflict|xung\s*đột/i, bullets).slice(0, 20),
    open_plot_threads: pickLabeled(md, /thread|cốt\s*truyện|mở/i, bullets).slice(0, 30),
  };
}

function parseWorld(md: string): BootstrapAnalysisOutput['world_knowledge'] {
  const bullets = bulletLines(md).map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim());
  return {
    cultivation_system: sectionBullets(md, /cultivation|tu\s*luyện|cảnh\s*giới/i, bullets),
    sects: sectionBullets(md, /sect|tông|môn\s*phái/i, bullets),
    locations: sectionBullets(md, /location|địa\s*điểm|place/i, bullets),
    organizations: sectionBullets(md, /org|tổ\s*chức/i, bullets),
    items: sectionBullets(md, /item|vật\s*phẩm/i, bullets),
    rules: sectionBullets(md, /rule|quy\s*tắc/i, bullets.length ? bullets : [md.trim().slice(0, 500)]),
  };
}

function parseRecent(md: string): BootstrapAnalysisOutput['recent_context'] {
  const events = bulletLines(md)
    .map((l) => l.replace(/^[-*•\d.]+\s*/, '').trim())
    .filter((e) => e.length > 2);
  if (events.length === 0 && md.trim()) {
    events.push(...md.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean).slice(0, 20));
  }
  return { important_events: events.slice(0, 40) };
}

function pickLabeled(md: string, label: RegExp, fallback: string[]): string[] {
  const fromSection = sectionBullets(md, label, []);
  return fromSection.length > 0 ? fromSection : fallback.slice(0, 15);
}

function sectionBullets(md: string, heading: RegExp, fallback: string[]): string[] {
  const lines = md.split(/\r?\n/);
  let capturing = false;
  const out: string[] = [];
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line)) {
      capturing = heading.test(line);
      continue;
    }
    if (capturing && /^[-*•]/.test(line.trim())) {
      out.push(line.trim().replace(/^[-*•]\s*/, ''));
    }
  }
  if (out.length > 0) return out.slice(0, 40);
  return fallback.slice(0, 15);
}
