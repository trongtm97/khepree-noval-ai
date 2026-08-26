import { useEffect, useState } from 'react';
import { Button, Card } from '../ui';
import { useT } from '../../i18n';

export interface SourceDiffModalProps {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  onClose: () => void;
  onKeepTranslation: () => void;
  onMarkRetranslate: () => void;
}

export function SourceDiffModal({
  projectId,
  chapterId,
  chapterNumber,
  onClose,
  onKeepTranslation,
  onMarkRetranslate,
}: SourceDiffModalProps) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<
    { kind: string; lineNumber: number; oldLine?: string; newLine?: string }[]
  >([]);

  useEffect(() => {
    void window.novelTrans.sourceFolder
      .getSourceDiff({ projectId, chapterId })
      .then((res) => { setLines(res.lines); })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('sourceFolder.diffFailed'));
      })
      .finally(() => { setLoading(false); });
  }, [projectId, chapterId, t]);

  return (
    <div className="modal-backdrop">
      <Card className="modal-panel modal-panel-wide">
        <h3>{t('sourceFolder.diffTitle', { chapter: chapterNumber })}</h3>
        {loading ? <p>{t('app.loading')}</p> : null}
        {error ? <p className="banner banner-error">{error}</p> : null}
        <div className="source-diff-view">
          {lines.map((line) => (
            <div key={`${line.kind}-${line.lineNumber}`} className={`diff-line diff-${line.kind}`}>
              <span className="diff-line-no">{line.lineNumber}</span>
              {line.oldLine !== undefined ? <pre>{line.oldLine}</pre> : null}
              {line.newLine !== undefined ? <pre>{line.newLine}</pre> : null}
            </div>
          ))}
        </div>
        <div className="btn-row">
          <Button onClick={onKeepTranslation}>{t('sourceFolder.keepTranslation')}</Button>
          <Button variant="primary" onClick={onMarkRetranslate}>
            {t('sourceFolder.markRetranslate')}
          </Button>
          <Button onClick={onClose}>{t('actions.close')}</Button>
        </div>
      </Card>
    </div>
  );
}
