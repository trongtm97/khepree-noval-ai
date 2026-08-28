import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Settings2 } from 'lucide-react';
import { useT } from '../../i18n';
import { DropdownMenu } from '../overlay';
import { Button, Input, Dialog } from '../ui';

export interface TranslationActionsProps {
  projectId: string;
  busy: boolean;
  preparing: boolean;
  onContinue: () => void;
  onTranslateCurrent: () => void;
  onTranslateNext3: () => void;
  onTranslateRemaining: () => void;
  onTranslateRange: (from: number, to: number) => void;
}

/**
 * Primary [Dịch tiếp] + translator translate menu.
 * Advanced links → Settings / Jobs (not a developer console).
 */
export function TranslationActions({
  projectId,
  busy,
  preparing,
  onContinue,
  onTranslateCurrent,
  onTranslateNext3,
  onTranslateRemaining,
  onTranslateRange,
}: TranslationActionsProps) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const chevronRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="translation-actions">
      <div className="translation-action-split">
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={busy || !projectId}
          onClick={onContinue}
        >
          {preparing ? t('translation.ensuringReady') : t('translation.continueAction')}
        </Button>
        <Button
          ref={chevronRef}
          variant="primary"
          size="sm"
          className="translation-action-split__chevron"
          disabled={busy || !projectId}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t('translation.translateMenu')}
          onClick={() => {
            setOpen((v) => !v);
            setAdvancedOpen(false);
          }}
        >
          <ChevronDown size={16} aria-hidden />
        </Button>
        <DropdownMenu
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setAdvancedOpen(false);
          }}
          anchorRef={chevronRef}
          className="translation-menu"
          placement="bottom-end"
          minWidth={220}
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
              onTranslateNext3();
            }}
          >
            {t('translation.translateNext3')}
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setRangeOpen(true);
            }}
          >
            {t('translation.translateOptions')}
          </button>
          <hr className="translation-menu__sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setAdvancedOpen((v) => !v);
            }}
          >
            <Settings2 size={14} aria-hidden /> {t('translation.advancedOptions')}
          </button>
          {advancedOpen ? (
            <div className="translation-menu__advanced" role="group">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/jobs');
                }}
              >
                {t('translation.advancedWorker')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                {t('translation.advancedProvider')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                {t('translation.advancedBatch')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                {t('translation.advancedWaves')}
              </button>
            </div>
          ) : null}
        </DropdownMenu>
      </div>

      <Dialog
        open={rangeOpen}
        title={t('translation.translateOptions')}
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
