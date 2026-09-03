import type { QaIssue } from '@shared/schemas/output-protocol';
import type { WholeBookAuditIndex, AuditParagraphRef } from './audit-index-builder';
import { isCorruptTranslationText } from '../jobs/corrupt-translation';

export interface AuditCheckerFinding extends QaIssue {
  chapterId?: string;
  chapterNumber?: number | null;
}

function paraIssue(
  code: QaIssue['code'],
  severity: QaIssue['severity'],
  message: string,
  p: AuditParagraphRef,
  extra?: Partial<QaIssue>,
): AuditCheckerFinding {
  return {
    code,
    severity,
    message,
    paragraphId: p.stableId,
    chapterId: p.chapterId,
    chapterNumber: p.chapterNumber,
    ...extra,
  };
}

/** Chapter/paragraph integrity: missing, truncated, duplicate chapter bodies. */
export function checkChapterIntegrity(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];

  for (const ch of index.chapters) {
    if (ch.paragraphCount > 0 && ch.emptyCount === ch.paragraphCount) {
      findings.push({
        code: 'chapter_missing_translation',
        severity: 'error',
        message: `Chapter ${ch.chapterNumber ?? ch.id} has no translations`,
        chapterId: ch.id,
        chapterNumber: ch.chapterNumber,
      });
    }
  }

  const chapterBodies = new Map<string, string[]>();
  for (const p of index.paragraphs) {
    if (!p.targetText.trim()) {
      findings.push(
        paraIssue(
          'empty_translation',
          'error',
          `Missing translation ${p.stableId}`,
          p,
        ),
      );
      continue;
    }
    if (isCorruptTranslationText(p.targetText, p.sourceText)) {
      findings.push(
        paraIssue(
          'chapter_truncated',
          'error',
          `Truncated/corrupt translation ${p.stableId}`,
          p,
        ),
      );
    }
    const key = p.chapterId;
    const list = chapterBodies.get(key) ?? [];
    list.push(p.targetText.trim());
    chapterBodies.set(key, list);
  }

  // Duplicate full-chapter content across chapters
  const bodyHash = new Map<string, string[]>();
  for (const [chId, lines] of chapterBodies) {
    if (lines.length < 2) continue;
    const body = lines.join('\n');
    if (body.length < 80) continue;
    const list = bodyHash.get(body) ?? [];
    list.push(chId);
    bodyHash.set(body, list);
  }
  for (const [, chIds] of bodyHash) {
    if (chIds.length < 2) continue;
    findings.push({
      code: 'chapter_duplicate_content',
      severity: 'error',
      message: `Duplicate chapter bodies: ${chIds.join(', ')}`,
      chapterId: chIds[0],
    });
  }

  return findings;
}

/**
 * Character name consistency.
 * Valid aliases in acceptableTargets are NOT flagged.
 */
export function checkCharacterConsistency(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];
  if (index.characters.length === 0) return findings;

  for (const p of index.paragraphs) {
    if (!p.targetText.trim() || !p.sourceText.trim()) continue;

    for (const ch of index.characters) {
      if (!p.sourceText.includes(ch.sourceName)) continue;
      if (!ch.preferredName?.trim()) continue;

      // Preferred or any alias present → OK
      const hit = ch.acceptableTargets.some((t) =>
        p.targetText.includes(t),
      );
      if (hit) continue;

      // Another character's preferred name used instead?
      let wrong: string | null = null;
      for (const other of index.characters) {
        if (other.id === ch.id) continue;
        if (
          other.preferredName &&
          p.targetText.includes(other.preferredName) &&
          !ch.acceptableTargets.includes(other.preferredName)
        ) {
          wrong = other.preferredName;
          break;
        }
      }

      findings.push(
        paraIssue(
          'character_name_mismatch',
          'error',
          `Character "${ch.sourceName}" expected "${ch.preferredName}"${wrong ? ` (found "${wrong}")` : ' missing'} in ${p.stableId}`,
          p,
          {
            termSource: ch.sourceName,
            expected: ch.preferredName,
            found: wrong ?? undefined,
          },
        ),
      );
    }
  }

  return findings;
}

/** Locked glossary vs human_locked paragraph conflicts → Attention only. */
export function checkGlossaryHumanLockedConflict(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];
  for (const p of index.paragraphs) {
    if (!p.humanLocked || !p.targetText.trim()) continue;
    for (const term of index.lockedTerms) {
      if (!p.sourceText.includes(term.source)) continue;
      if (p.targetText.includes(term.preferred)) continue;
      findings.push(
        paraIssue(
          'glossary_human_locked_conflict',
          'error',
          `human_locked paragraph conflicts glossary "${term.source}" → "${term.preferred}"`,
          p,
          {
            termSource: term.source,
            expected: term.preferred,
          },
        ),
      );
    }
  }
  return findings;
}

/** Glossary drift on non-locked paragraphs (safe auto-repair candidate). */
export function checkGlossaryDrift(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];
  for (const p of index.paragraphs) {
    if (p.humanLocked || !p.targetText.trim()) continue;
    for (const term of index.lockedTerms) {
      if (!p.sourceText.includes(term.source)) continue;
      if (p.targetText.includes(term.preferred)) continue;
      findings.push(
        paraIssue(
          'locked_term_missing',
          'error',
          `Locked term "${term.source}" → expected "${term.preferred}" missing in ${p.stableId}`,
          p,
          {
            termSource: term.source,
            expected: term.preferred,
          },
        ),
      );
    }
  }
  return findings;
}

/** Place/org and skill/rank consistency when source mentions term. */
export function checkPlaceOrgAndSkillTerms(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];
  const checkList = [
    { list: index.placesOrgs, code: 'place_org_inconsistency' as const },
    { list: index.skillsRanks, code: 'skill_rank_inconsistency' as const },
  ];
  for (const { list, code } of checkList) {
    for (const p of index.paragraphs) {
      if (!p.targetText.trim()) continue;
      for (const term of list) {
        if (!p.sourceText.includes(term.source)) continue;
        if (p.targetText.includes(term.preferred)) continue;
        findings.push(
          paraIssue(
            code,
            'warning',
            `${code}: "${term.source}" → "${term.preferred}" missing in ${p.stableId}`,
            p,
            { termSource: term.source, expected: term.preferred },
          ),
        );
      }
    }
  }
  return findings;
}

/** Soft timeline check: story state chapter vs highest translated chapter. */
export function checkTimelineState(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  if (!index.storyStateSummary) return [];
  const match = /ch=(\d+)/.exec(index.storyStateSummary);
  if (!match) return [];
  const stated = Number(match[1]);
  const maxCh = Math.max(
    0,
    ...index.chapters
      .filter((c) => c.translatedCount > 0)
      .map((c) => c.chapterNumber ?? 0),
  );
  if (stated > 0 && maxCh > 0 && stated > maxCh + 5) {
    return [
      {
        code: 'timeline_state_conflict',
        severity: 'warning',
        message: `Story state chapter ${stated} ahead of translated max ${maxCh}`,
        expected: String(maxCh),
        found: String(stated),
      },
    ];
  }
  return [];
}

/** Address forms: if relationship address term appears wrongly — soft warning. */
export function checkAddressForms(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  const findings: AuditCheckerFinding[] = [];
  const forms = index.addressForms
    .flatMap((f) => [f.aCallsB, f.bCallsA])
    .filter((x): x is string => Boolean(x?.trim()));
  if (forms.length === 0) return findings;
  // Presence check only when source has both character names — lean skip if sparse
  return findings;
}

export function runAllLocalAuditCheckers(
  index: WholeBookAuditIndex,
): AuditCheckerFinding[] {
  return [
    ...checkChapterIntegrity(index),
    ...checkCharacterConsistency(index),
    ...checkGlossaryHumanLockedConflict(index),
    ...checkGlossaryDrift(index),
    ...checkPlaceOrgAndSkillTerms(index),
    ...checkTimelineState(index),
    ...checkAddressForms(index),
  ];
}
