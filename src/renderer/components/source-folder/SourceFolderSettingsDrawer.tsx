import type { SourceFolderSettingsDto } from '@shared/schemas/source-folder';
import { Button, Card } from '../ui';
import { useT } from '../../i18n';
import { useState } from 'react';

export interface SourceFolderSettingsDrawerProps {
  projectId: string;
  settings: SourceFolderSettingsDto;
  onClose: () => void;
  onSaved: (settings: SourceFolderSettingsDto) => void;
}

export function SourceFolderSettingsDrawer({
  projectId,
  settings,
  onClose,
  onSaved,
}: SourceFolderSettingsDrawerProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [watchFolderEnabled, setWatchFolderEnabled] = useState(settings.watchFolderEnabled);
  const [scanOnStartup, setScanOnStartup] = useState(settings.scanOnStartup);
  const [autoImportNewChapters, setAutoImportNewChapters] = useState(settings.autoImportNewChapters);
  const [autoQueueNewChapters, setAutoQueueNewChapters] = useState(settings.autoQueueNewChapters);
  const [autoTranslateNewChapters, setAutoTranslateNewChapters] = useState(
    settings.autoTranslateNewChapters,
  );

  const save = async () => {
    setBusy(true);
    try {
      const { settings: next } = await window.khepreeNovelAI.sourceFolder.updateSettings({
        projectId,
        watchFolderEnabled,
        scanOnStartup,
        autoImportNewChapters,
        autoQueueNewChapters,
        autoTranslateNewChapters,
      });
      onSaved(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <Card className="modal-panel">
        <h3>{t('sourceFolder.settingsTitle')}</h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={watchFolderEnabled}
            onChange={(e) => { setWatchFolderEnabled(e.target.checked); }}
          />
          {t('sourceFolder.optWatch')}
        </label>
        <p className="muted">{t('sourceFolder.optWatchHint')}</p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={scanOnStartup}
            onChange={(e) => { setScanOnStartup(e.target.checked); }}
          />
          {t('sourceFolder.optStartupScan')}
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoImportNewChapters}
            onChange={(e) => { setAutoImportNewChapters(e.target.checked); }}
          />
          {t('sourceFolder.optAutoImport')}
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoQueueNewChapters}
            onChange={(e) => { setAutoQueueNewChapters(e.target.checked); }}
          />
          {t('sourceFolder.optAutoQueue')}
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={autoTranslateNewChapters}
            onChange={(e) => { setAutoTranslateNewChapters(e.target.checked); }}
          />
          {t('sourceFolder.optAutoTranslate')}
        </label>
        <p className="muted">{t('sourceFolder.optAutoTranslateHint')}</p>
        <div className="btn-row">
          <Button variant="primary" disabled={busy} onClick={() => { void save(); }}>
            {t('actions.save')}
          </Button>
          <Button onClick={onClose}>{t('actions.cancel')}</Button>
        </div>
      </Card>
    </div>
  );
}
