import { useEffect, useState } from 'react';
import type { CharacterDto } from '@shared/schemas/memory';
import { Button, Drawer, Input } from '../../components/ui';
import { useT } from '../../i18n';
import { characterStatusLabel } from '../../i18n/enums';
import { formatCharacterChapterRange } from './format-chapter-range';

interface CharacterDetailDrawerProps {
  open: boolean;
  busy: boolean;
  projectId: string;
  character: CharacterDto | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function CharacterDetailDrawer({
  open,
  busy,
  projectId,
  character,
  onClose,
  onSaved,
  onError,
}: CharacterDetailDrawerProps) {
  const t = useT();
  const [draft, setDraft] = useState<CharacterDto | null>(character);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(character);
    setEditing(false);
  }, [character]);

  if (!draft) return null;

  const chapterDisplay = formatCharacterChapterRange(draft.firstChapter, draft.lastChapter);

  const save = async () => {
    try {
      await window.khepreeNovelAI.memory.upsertCharacter({
        id: draft.id,
        projectId,
        canonicalName: draft.canonicalName,
        translatedName: draft.translatedName,
        aliases: draft.aliases,
        role: draft.role,
        description: draft.description,
        firstChapter: draft.firstChapter,
        lastChapter: draft.lastChapter,
        status: draft.status,
        locked: draft.locked,
      });
      setEditing(false);
      onSaved();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  return (
    <Drawer
      open={open}
      title={draft.canonicalSourceName ?? draft.canonicalName}
      onClose={onClose}
    >
      {!editing ? (
        <div className="detail-drawer-read">
          <ReadRow label={t('characters.sourceName')} value={draft.canonicalSourceName ?? draft.canonicalName} />
          <ReadRow label={t('characters.targetName')} value={draft.preferredTargetName ?? draft.translatedName} />
          <ReadRow label={t('characters.aliases')} value={draft.aliases.join(', ') || '—'} />
          <ReadRow label={t('characters.role')} value={draft.role} />
          <ReadRow label={t('characters.description')} value={draft.description} multiline />
          <ReadRow
            label={t('characters.chapters')}
            value={
              chapterDisplay.isSingle
                ? t('characters.chapterSingle', { n: chapterDisplay.compact })
                : chapterDisplay.compact
            }
          />
          <ReadRow label={t('characters.status')} value={characterStatusLabel(draft.status)} />
          <ReadRow label={t('characters.locked')} value={draft.locked ? t('common.yes') : t('common.no')} />
          <div className="btn-row">
            <Button variant="primary" onClick={() => { setEditing(true); }}>
              {t('actions.edit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="form-stack">
          <label className="form-field">
            <span className="form-field__label">{t('characters.sourceName')}</span>
            <Input
              value={draft.canonicalName}
              disabled={busy}
              onChange={(e) => { setDraft({ ...draft, canonicalName: e.target.value }); }}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">{t('characters.targetName')}</span>
            <Input
              value={draft.translatedName ?? ''}
              disabled={busy}
              onChange={(e) => { setDraft({ ...draft, translatedName: e.target.value || null }); }}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">{t('characters.aliases')}</span>
            <Input
              value={draft.aliases.join(', ')}
              disabled={busy}
              onChange={(e) =>
                { setDraft({
                  ...draft,
                  aliases: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                }); }
              }
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">{t('characters.role')}</span>
            <Input
              value={draft.role ?? ''}
              disabled={busy}
              onChange={(e) => { setDraft({ ...draft, role: e.target.value || null }); }}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">{t('characters.description')}</span>
            <textarea
              className="nt-textarea"
              rows={4}
              value={draft.description ?? ''}
              disabled={busy}
              onChange={(e) => { setDraft({ ...draft, description: e.target.value || null }); }}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.locked}
              disabled={busy}
              onChange={(e) => { setDraft({ ...draft, locked: e.target.checked }); }}
            />
            {t('characters.lock')}
          </label>
          <div className="btn-row">
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {t('actions.save')}
            </Button>
            <Button disabled={busy} onClick={() => { setEditing(false); }}>
              {t('actions.cancel')}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function ReadRow({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  const t = useT();
  const text = value?.trim() ? value : t('bookMetadata.emptyValue');
  return (
    <div className="read-field">
      <span className="read-field__label muted">{label}</span>
      {multiline ? (
        <p className="read-text-block__body">{text}</p>
      ) : (
        <span className="read-field__value">{text}</span>
      )}
    </div>
  );
}
