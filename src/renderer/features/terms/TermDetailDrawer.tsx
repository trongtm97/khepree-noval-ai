import { useEffect, useState } from 'react';
import type { TermDto } from '@shared/schemas/term';
import { Lock } from 'lucide-react';
import { Button, Drawer, Input } from '../../components/ui';
import { useT } from '../../i18n';
import { termScopeLabel, termStatusLabel, termTypeLabel } from '../../i18n/enums';

interface TermDetailDrawerProps {
  open: boolean;
  busy: boolean;
  term: TermDto | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function TermDetailDrawer({
  open,
  busy,
  term,
  onClose,
  onSaved,
  onError,
}: TermDetailDrawerProps) {
  const t = useT();
  const [draft, setDraft] = useState<TermDto | null>(term);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(term);
    setEditing(false);
  }, [term]);

  if (!draft) return null;

  const save = async () => {
    try {
      await window.novelTrans.terms.upsert({
        id: draft.id,
        sourceText: draft.sourceText,
        preferredTranslation: draft.preferredTranslation ?? undefined,
        pinyin: draft.pinyin,
        type: draft.type,
        scope: draft.scope,
        scopeRef: draft.scopeRef,
        genre: draft.genre,
        status: draft.status,
        notes: draft.notes,
        locked: draft.locked,
      });
      setEditing(false);
      onSaved();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('errors.UNKNOWN.title'));
    }
  };

  return (
    <Drawer open={open} title={draft.sourceText} onClose={onClose}>
      {!editing ? (
        <div className="detail-drawer-read">
          <ReadRow label={t('terms.colSource')} value={draft.sourceText} />
          <ReadRow label={t('terms.colTarget')} value={draft.preferredTranslation} />
          {draft.pinyin ? <ReadRow label={t('terms.transliteration')} value={draft.pinyin} /> : null}
          <ReadRow label={t('terms.type')} value={termTypeLabel(draft.type)} />
          <ReadRow label={t('terms.scope')} value={termScopeLabel(draft.scope)} />
          <ReadRow label={t('terms.status')} value={termStatusLabel(draft.status)} />
          <ReadRow label={t('terms.genre')} value={draft.genre} />
          <ReadRow label={t('terms.colOccurrences')} value={String(draft.occurrences)} />
          <ReadRow label={t('terms.notes')} value={draft.notes} multiline />
          <p className="muted">
            {draft.locked ? <Lock size={12} aria-hidden /> : null}{' '}
            {draft.locked ? t('terms.lockedLabel') : t('terms.unlockedLabel')}
          </p>
          <div className="btn-row">
            <Button variant="primary" onClick={() => setEditing(true)}>
              {t('actions.edit')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="form-stack">
          <label className="form-field">
            <span className="form-field__label">{t('terms.colSource')}</span>
            <Input
              value={draft.sourceText}
              disabled={busy || draft.locked}
              onChange={(e) => setDraft({ ...draft, sourceText: e.target.value })}
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">{t('terms.colTarget')}</span>
            <Input
              value={draft.preferredTranslation ?? ''}
              disabled={busy}
              onChange={(e) =>
                setDraft({ ...draft, preferredTranslation: e.target.value || null })
              }
            />
          </label>
          {draft.pinyin != null || draft.transliteration ? (
            <label className="form-field">
              <span className="form-field__label">{t('terms.transliteration')}</span>
              <Input
                value={draft.pinyin ?? draft.transliteration ?? ''}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, pinyin: e.target.value || null })}
              />
            </label>
          ) : null}
          <label className="form-field">
            <span className="form-field__label">{t('terms.notes')}</span>
            <textarea
              className="nt-textarea"
              rows={3}
              value={draft.notes ?? ''}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value || null })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.locked}
              disabled={busy}
              onChange={(e) => setDraft({ ...draft, locked: e.target.checked })}
            />
            {t('terms.lock')}
          </label>
          <div className="btn-row">
            <Button variant="primary" disabled={busy} onClick={() => void save()}>
              {t('actions.save')}
            </Button>
            <Button disabled={busy} onClick={() => setEditing(false)}>
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
