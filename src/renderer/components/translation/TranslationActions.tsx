import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Play, Settings2 } from 'lucide-react';
import type { ChapterSummaryDto } from '@shared/schemas/translation-pack';
import type { JobDto } from '@shared/schemas/job';
import { isJobActive } from '@shared/utils/job-progress';
import { useT } from '../../i18n';
import { resolvePrimaryTranslateAction } from '../../utils/translation-primary-action';
import { DropdownMenu } from '../overlay';
import { Button, Input, Dialog } from '../ui';

export interface TranslationActionsProps {
  projectId: string;
  chapters: ChapterSummaryDto[];
  chapterIndex: number;
  nextUntranslatedChapter?: number | null;
  selectedCount: number;
  busy: boolean;
  preparing: boolean;
  activeJob: JobDto | null;
  onContinue: () => void;
  onTranslateCurrent: () => void;
  onTranslateNext3: () => void;
  onTranslateRemaining: () => void;
  onTranslateSelected: () => void;
  onTranslateRange: (from: number, to: number) => void;
  onResume?: () => void;
}

/**
 * Primary [Dịch tiếp] + translator translate menu.
 * High-frequency CTA — larger than secondary toolbar actions.
 */
export function TranslationActions({
  projectId,
  chapters,
  chapterIndex,
  nextUntranslatedChapter,
  selectedCount,
  busy,
  preparing,
  activeJob,
  onContinue,
  onTranslateCurrent,
  onTranslateNext3,
  onTranslateRemaining,
  onTranslateSelected,
  onTranslateRange,
  onResume,
}: TranslationActionsProps) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const chevronRef = useRef<HTMLButtonElement>(null);

  const primary = resolvePrimaryTranslateAction({
    chapters,
    chapterIndex,
    nextUntranslatedChapter,
    selectedCount,
    activeJob,
    preparing,
    busy,
  });

  const jobBlocksMenu = activeJob != null && isJobActive(activeJob.state);

  const handlePrimary = () => {
    if (primary.primaryHandler === 'resume') {
      onResume?.();
      return;
    }
    if (primary.primaryHandler === 'translateSelected') {
      onTranslateSelected();
      return;
    }
    if (primary.primaryHandler === 'translateCurrent') {
      onTranslateCurrent();
    }
  };

  const label = t(primary.labelKey, primary.labelParams);

  return (
    <div className="translation-actions">
      <div className="translation-action-split">
        <Button
          variant="primary"
          className="translation-action-split__main"
          loading={primary.loading}
          disabled={primary.disabled || !projectId}
          aria-label={label}
          title={t('translation.shortcutTranslateContinue')}
          onClick={handlePrimary}
        >
          {primary.showPlayIcon ? <Play size={16} aria-hidden /> : null}
          <span className="translation-action-split__label">{label}</span>
        </Button>
        <Button
          ref={chevronRef}
          variant="primary"
          className="translation-action-split__chevron"
          disabled={busy || !projectId || jobBlocksMenu}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t('translation.translateMenu')}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          <ChevronDown size={16} aria-hidden />
        </Button>
        <DropdownMenu
          open={open}
          onOpenChange={setOpen}
          anchorRef={chevronRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={240}
          maxHeight={400}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onTranslateCurrent();
            }}
          >
            {t('translation.translateCurrent')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onContinue();
            }}
          >
            {t('translation.continueAction')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onTranslateNext3();
            }}
          >
            {t('translation.translateNext3')}
          </button>
          {selectedCount > 0 ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onTranslateSelected();
              }}
            >
              {t('translation.translateSelectedMenu', { count: String(selectedCount) })}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setRangeOpen(true);
            }}
          >
            {t('translation.translateRangeMenu')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onTranslateRemaining();
            }}
          >
            {t('translation.translateRemaining')}
          </button>
          <hr className="translation-menu__sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          >
            <Settings2 size={14} aria-hidden /> {t('translation.translateSettings')}
          </button>
        </DropdownMenu>
      </div>

      <Dialog
        open={rangeOpen}
        title={t('translation.translateRangeMenu')}
        description={t('translation.novelMemoryHint')}
        confirmLabel={t('actions.start')}
        cancelLabel={t('actions.cancel')}
        busy={busy}
        onConfirm={() => {
          const from = Number.parseInt(rangeFrom.trim(), 10);
          const to = Number.parseInt(rangeTo.trim(), 10);
          if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) {
            return;
          }
          setRangeOpen(false);
          onTranslateRange(from, to);
        }}
        onCancel={() => {
          if (!busy) setRangeOpen(false);
        }}
      >
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          <label>
            {t('translation.novelRangeFrom')}
            <Input
              type="number"
              min={1}
              value={rangeFrom}
              onChange={(e) => {
                setRangeFrom(e.target.value);
              }}
            />
          </label>
          <label>
            {t('translation.novelRangeTo')}
            <Input
              type="number"
              min={1}
              value={rangeTo}
              onChange={(e) => {
                setRangeTo(e.target.value);
              }}
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
