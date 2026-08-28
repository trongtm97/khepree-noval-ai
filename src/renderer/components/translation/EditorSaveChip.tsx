import { useEffect, useRef, useState } from 'react';
import type { SaveStatus } from '../../stores/editor-store';
import { useT } from '../../i18n';
import { Spinner } from '../ui/Spinner';

const SAVED_FADE_MS = 1600;

interface EditorSaveChipProps {
  status: SaveStatus;
}

/** Idle/dirty stay quiet. Saving = spinner. Error stays. Saved fades out. */
export function EditorSaveChip({ status }: EditorSaveChipProps) {
  const t = useT();
  const [showSaved, setShowSaved] = useState(false);
  const previousRef = useRef(status);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = status;
    if (status === 'saved' && previous === 'saving') {
      setShowSaved(true);
      const timer = window.setTimeout(() => {
        setShowSaved(false);
      }, SAVED_FADE_MS);
      return () => {
        window.clearTimeout(timer);
      };
    }
    if (status !== 'saved') {
      setShowSaved(false);
    }
    return undefined;
  }, [status]);

  if (status === 'saving') {
    return (
      <span className="editor-save-status editor-save-status--saving">
        <Spinner size={14} />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="editor-save-status editor-save-status--error">{t('status.failed')}</span>
    );
  }
  if (showSaved) {
    return (
      <span className="editor-save-status editor-save-status--saved editor-save-status--fade">
        {t('translation.saved')}
      </span>
    );
  }
  return null;
}
