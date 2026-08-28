import type { CharacterDto, MemoryConflictDto, RelationshipDto, StoryStateDto } from '@shared/schemas/memory';
import type { TermDto } from '@shared/schemas/term';
import { Drawer } from '../../components/ui';
import { useT } from '../../i18n';

interface MemoryDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  characters: CharacterDto[];
  terms: TermDto[];
  relationships: RelationshipDto[];
  storyState: StoryStateDto | null;
  conflicts: MemoryConflictDto[];
}

function topBy<T>(items: T[], limit: number, score: (item: T) => number): T[] {
  return [...items].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export function MemoryDetailDrawer({
  open,
  onClose,
  characters,
  terms,
  relationships,
  storyState,
  conflicts,
}: MemoryDetailDrawerProps) {
  const t = useT();

  const recentCharacters = topBy(characters, 8, (c) => c.lastChapter ?? c.firstChapter ?? 0);
  const keyTerms = topBy(terms, 12, (term) => (term.locked ? 1000 : 0) + term.occurrences);
  const recentRelationships = relationships.slice(0, 8);
  const recentChanges = conflicts.slice(0, 6);

  return (
    <Drawer open={open} title={t('aiMemory.detailDrawerTitle')} onClose={onClose}>
      <div className="memory-detail-sections">
        <section>
          <h3 className="memory-detail-section__title">{t('aiMemory.detailRecentCharacters')}</h3>
          {recentCharacters.length === 0 ? (
            <p className="muted">{t('aiMemory.detailEmpty')}</p>
          ) : (
            <ul className="memory-detail-list">
              {recentCharacters.map((c) => (
                <li key={c.id}>
                  <strong>{c.canonicalSourceName ?? c.canonicalName}</strong>
                  {c.preferredTargetName ?? c.translatedName ? (
                    <span className="muted"> → {c.preferredTargetName ?? c.translatedName}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="memory-detail-section__title">{t('aiMemory.detailKeyTerms')}</h3>
          {keyTerms.length === 0 ? (
            <p className="muted">{t('aiMemory.detailEmpty')}</p>
          ) : (
            <ul className="memory-detail-list">
              {keyTerms.map((term) => (
                <li key={term.id}>
                  <strong>{term.sourceText}</strong>
                  {term.preferredTranslation ? (
                    <span className="muted"> → {term.preferredTranslation}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="memory-detail-section__title">{t('aiMemory.detailRelationships')}</h3>
          {recentRelationships.length === 0 ? (
            <p className="muted">{t('aiMemory.detailEmpty')}</p>
          ) : (
            <ul className="memory-detail-list">
              {recentRelationships.map((r) => (
                <li key={r.id}>
                  {r.fromName} — {r.relationshipType} — {r.toName}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="memory-detail-section__title">{t('aiMemory.detailStoryContext')}</h3>
          {storyState?.summaryText ? (
            <p className="memory-detail-story">{storyState.summaryText}</p>
          ) : (
            <p className="muted">{t('aiMemory.detailEmpty')}</p>
          )}
          {storyState?.currentChapterNumber != null ? (
            <p className="muted">
              {t('aiMemory.detailStoryChapter', { n: storyState.currentChapterNumber })}
            </p>
          ) : null}
        </section>

        <section>
          <h3 className="memory-detail-section__title">{t('aiMemory.detailRecentChanges')}</h3>
          {recentChanges.length === 0 ? (
            <p className="muted">{t('aiMemory.detailNoChanges')}</p>
          ) : (
            <ul className="memory-detail-list">
              {recentChanges.map((c) => (
                <li key={c.id}>
                  <span>{c.existingValue ?? '—'}</span>
                  <span className="muted"> → {c.proposedValue ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
