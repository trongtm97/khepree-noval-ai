import { useRef, useState } from 'react';
import { Copy, History, Lock, MoreHorizontal, RotateCcw } from 'lucide-react';
import { useT } from '../../i18n';
import { DropdownMenu } from '../overlay';
import { IconButton } from '../ui';

interface EditorParagraphMenuProps {
  visible: boolean;
  humanLocked: boolean;
  onCopyTranslation: () => void;
  onOpenHistory: () => void;
  onRetranslate: () => void;
  onToggleLock?: () => void;
}

export function EditorParagraphMenu({
  visible,
  humanLocked: _humanLocked,
  onCopyTranslation,
  onOpenHistory,
  onRetranslate,
  onToggleLock,
}: EditorParagraphMenuProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  if (!visible && !open) return null;

  return (
    <div className={`editor-row-menu ${visible || open ? 'editor-row-menu--visible' : ''}`}>
      <IconButton
        ref={anchorRef}
        label={t('translation.paragraphMenu')}
        active={open}
        className="editor-row-menu-btn"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={14} aria-hidden />
      </IconButton>
      <DropdownMenu
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        className="translation-menu"
        placement="bottom-end"
        minWidth={200}
        maxHeight={240}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onRetranslate();
          }}
        >
          <RotateCcw size={14} aria-hidden /> {t('translation.retranslateParagraph')}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onCopyTranslation();
          }}
        >
          <Copy size={14} aria-hidden /> {t('translation.copyParagraphTranslation')}
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!onToggleLock}
          title={onToggleLock ? undefined : t('translation.lockParagraphUnavailable')}
          onClick={() => {
            setOpen(false);
            onToggleLock?.();
          }}
        >
          <Lock size={14} aria-hidden /> {t('translation.lockParagraph')}
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onOpenHistory();
          }}
        >
          <History size={14} aria-hidden /> {t('editor.versionHistory')}
        </button>
      </DropdownMenu>
    </div>
  );
}
