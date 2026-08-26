import { Button, Card } from '../ui';
import { useT } from '../../i18n';

export interface SourceConflictModalProps {
  chapterNumber: number;
  files: { sourceFilePath: string; contentHash: string }[];
  onChoose: (filePath: string) => void;
  onClose: () => void;
}

export function SourceConflictModal({
  chapterNumber,
  files,
  onChoose,
  onClose,
}: SourceConflictModalProps) {
  const t = useT();

  return (
    <div className="modal-backdrop">
      <Card className="modal-panel">
        <h3>{t('sourceFolder.conflictTitle', { chapter: chapterNumber })}</h3>
        <p className="muted">{t('sourceFolder.conflictBody')}</p>
        <ul>
          {files.map((file) => (
            <li key={file.sourceFilePath}>
              <Button onClick={() => { onChoose(file.sourceFilePath); }}>
                {file.sourceFilePath.split(/[/\\]/).pop()}
              </Button>
            </li>
          ))}
        </ul>
        <Button onClick={onClose}>{t('actions.cancel')}</Button>
      </Card>
    </div>
  );
}
