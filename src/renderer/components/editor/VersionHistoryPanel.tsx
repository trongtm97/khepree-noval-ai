import { useEffect, useState } from 'react';
import type { EditorVersionDtoSchema } from '@shared/schemas/translation-editor';
import type { z } from 'zod';
import { useT, t as i18nT } from '../../i18n';

type EditorVersion = z.infer<typeof EditorVersionDtoSchema>;

interface VersionHistoryPanelProps {
  translationId: string | null;
  projectId: string;
  chapterId: string;
  onReverted: () => void;
  /** When false, skip IPC. Closed history consumes no editor height. */
  active?: boolean;
}

export function VersionHistoryPanel({
  translationId,
  projectId,
  chapterId,
  onReverted,
  active = true,
}: VersionHistoryPanelProps) {
  const t = useT();
  const [versions, setVersions] = useState<EditorVersion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!translationId) {
      setVersions([]);
      return;
    }
    void window.khepreeNovelAI.editor
      .listVersions(translationId)
      .then((result) => { setVersions(result.versions); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : i18nT('editor.loadVersionsFailed'));
      });
  }, [active, translationId]);

  const revert = async (version: number) => {
    if (!translationId) return;
    setBusy(true);
    setError(null);
    try {
      await window.khepreeNovelAI.editor.revertVersion({
        projectId,
        chapterId,
        translationId,
        version,
      });
      onReverted();
      const result = await window.khepreeNovelAI.editor.listVersions(translationId);
      setVersions(result.versions);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('editor.revertFailed'));
    } finally {
      setBusy(false);
    }
  };

  if (!translationId) {
    return (
      <section className="editor-versions">
        <h4>{t('editor.versionHistory')}</h4>
        <p className="muted">{t('editor.selectParagraph')}</p>
      </section>
    );
  }

  return (
    <section className="editor-versions">
      <h4>{t('editor.versionHistory')}</h4>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <ul className="editor-version-list">
        {versions.map((v) => (
          <li key={v.version}>
            <div>
              <strong>v{v.version}</strong>{' '}
              <span className="editor-badge">{v.versionSource}</span>
              <span className="muted"> · {new Date(v.createdAt).toLocaleString()}</span>
            </div>
            <p className="muted editor-version-preview">
              {(v.translatedText ?? '').slice(0, 120)}
              {(v.translatedText?.length ?? 0) > 120 ? '…' : ''}
            </p>
            {v.version > 1 ? (
              <button type="button" disabled={busy} onClick={() => void revert(v.version)}>
                {t('editor.revert')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
