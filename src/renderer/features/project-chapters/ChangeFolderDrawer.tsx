import { useState } from 'react';
import { Button, Drawer, Input } from '../../components/ui';
import { useT } from '../../i18n';

interface ChangeFolderDrawerProps {
  open: boolean;
  busy: boolean;
  projectId: string;
  currentPath: string | null;
  onClose: () => void;
  onApplied: () => void;
  onError: (message: string) => void;
}

export function ChangeFolderDrawer({
  open,
  busy,
  projectId,
  currentPath,
  onClose,
  onApplied,
  onError,
}: ChangeFolderDrawerProps) {
  const t = useT();
  const [newPath, setNewPath] = useState('');
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const reset = () => {
    setNewPath('');
    setPreviewCount(null);
    setPreviewPath(null);
  };

  const pickFolder = async () => {
    const pick = await window.khepreeNovelAI.sourceFolder.selectFolder();
    if (!pick.canceled && pick.folderPath) {
      setNewPath(pick.folderPath);
      setPreviewCount(null);
      setPreviewPath(null);
    }
  };

  const runPreview = async () => {
    if (!projectId || !newPath.trim()) return;
    setLocalBusy(true);
    try {
      const preview = await window.khepreeNovelAI.sourceFolder.changeFolder({
        projectId,
        newFolderPath: newPath.trim(),
        confirm: false,
      });
      setPreviewPath(newPath.trim());
      setPreviewCount(
        preview.preview.newChapters.length + preview.preview.modifiedChapters.length,
      );
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('sourceFolder.changeFailed'));
    } finally {
      setLocalBusy(false);
    }
  };

  const confirm = async () => {
    if (!projectId || !previewPath) return;
    setLocalBusy(true);
    try {
      await window.khepreeNovelAI.sourceFolder.changeFolder({
        projectId,
        newFolderPath: previewPath,
        confirm: true,
      });
      reset();
      onApplied();
      onClose();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : t('sourceFolder.changeFailed'));
    } finally {
      setLocalBusy(false);
    }
  };

  const working = busy || localBusy;

  return (
    <Drawer
      open={open}
      title={t('chaptersPage.changeFolderTitle')}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <div className="form-stack">
        <div className="read-field">
          <span className="read-field__label muted">{t('chaptersPage.currentFolder')}</span>
          <span className="read-field__value path-ellipsis" title={currentPath ?? undefined}>
            {currentPath ?? '—'}
          </span>
        </div>
        <label className="form-field">
          <span className="form-field__label">{t('chaptersPage.newFolder')}</span>
          <div className="btn-row">
            <Input
              value={newPath}
              disabled={working}
              onChange={(e) => {
                setNewPath(e.target.value);
                setPreviewCount(null);
                setPreviewPath(null);
              }}
              placeholder={t('chaptersPage.newFolderPlaceholder')}
            />
            <Button type="button" variant="secondary" disabled={working} onClick={() => void pickFolder()}>
              {t('chaptersPage.browseFolder')}
            </Button>
          </div>
        </label>
        {previewPath && previewCount != null ? (
          <div className="banner banner-warn">
            <p>{t('sourceFolder.changeConfirm', { count: previewCount })}</p>
            <p className="path-ellipsis muted" title={previewPath}>
              {previewPath}
            </p>
          </div>
        ) : null}
      </div>
      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <Button
          variant="secondary"
          disabled={working || !newPath.trim()}
          onClick={() => {
            void runPreview();
          }}
        >
          {t('chaptersPage.previewChanges')}
        </Button>
        <Button
          variant="primary"
          disabled={working || !previewPath}
          onClick={() => {
            void confirm();
          }}
        >
          {t('actions.confirm')}
        </Button>
      </div>
    </Drawer>
  );
}
