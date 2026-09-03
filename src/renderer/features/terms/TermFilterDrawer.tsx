import type { TermScope, TermStatus, TermType } from '@shared/constants/term';
import { TERM_SCOPES, TERM_STATUSES, TERM_TYPES } from '@shared/constants/term';
import { Button, Drawer, Input, Select } from '../../components/ui';
import { useT } from '../../i18n';
import { termScopeLabel, termStatusLabel, termTypeLabel } from '../../i18n/enums';

export interface TermFiltersState {
  type: TermType | '';
  scope: TermScope | '';
  status: TermStatus | '';
  genre: string;
  pinyin: string;
}

interface TermFilterDrawerProps {
  open: boolean;
  filters: TermFiltersState;
  showTransliteration: boolean;
  transliterationLabel: string | null;
  onClose: () => void;
  onChange: (next: TermFiltersState) => void;
  onApply: () => void;
  onClear: () => void;
}

export function TermFilterDrawer({
  open,
  filters,
  showTransliteration,
  transliterationLabel,
  onClose,
  onChange,
  onApply,
  onClear,
}: TermFilterDrawerProps) {
  const t = useT();

  return (
    <Drawer open={open} title={t('terms.filterTitle')} onClose={onClose}>
      <div className="form-stack">
        <label className="form-field">
          <span className="form-field__label">{t('terms.type')}</span>
          <Select
            value={filters.type}
            onChange={(e) => { onChange({ ...filters, type: e.target.value as TermType | '' }); }}
          >
            <option value="">{t('terms.allTypes')}</option>
            {TERM_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {termTypeLabel(ty)}
              </option>
            ))}
          </Select>
        </label>
        <label className="form-field">
          <span className="form-field__label">{t('terms.scope')}</span>
          <Select
            value={filters.scope}
            onChange={(e) => { onChange({ ...filters, scope: e.target.value as TermScope | '' }); }}
          >
            <option value="">{t('terms.allScopes')}</option>
            {TERM_SCOPES.map((s) => (
              <option key={s} value={s}>
                {termScopeLabel(s)}
              </option>
            ))}
          </Select>
        </label>
        <label className="form-field">
          <span className="form-field__label">{t('terms.status')}</span>
          <Select
            value={filters.status}
            onChange={(e) => { onChange({ ...filters, status: e.target.value as TermStatus | '' }); }}
          >
            <option value="">{t('terms.allStatuses')}</option>
            {TERM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {termStatusLabel(s)}
              </option>
            ))}
          </Select>
        </label>
        <label className="form-field">
          <span className="form-field__label">{t('terms.genre')}</span>
          <Input
            value={filters.genre}
            onChange={(e) => { onChange({ ...filters, genre: e.target.value }); }}
          />
        </label>
        {showTransliteration && transliterationLabel ? (
          <label className="form-field">
            <span className="form-field__label">{transliterationLabel}</span>
            <Input
              value={filters.pinyin}
              onChange={(e) => { onChange({ ...filters, pinyin: e.target.value }); }}
            />
          </label>
        ) : null}
      </div>
      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <Button variant="primary" onClick={onApply}>
          {t('terms.filterApply')}
        </Button>
        <Button variant="secondary" onClick={onClear}>
          {t('terms.filterClear')}
        </Button>
      </div>
    </Drawer>
  );
}

export function countActiveTermFilters(filters: TermFiltersState): number {
  let n = 0;
  if (filters.type) n += 1;
  if (filters.scope) n += 1;
  if (filters.status) n += 1;
  if (filters.genre.trim()) n += 1;
  if (filters.pinyin.trim()) n += 1;
  return n;
}
