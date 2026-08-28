import type { ReactNode } from 'react';
import { useT } from '../../i18n';

export function ReadField({ label, value }: { label: string; value: ReactNode }) {
  const t = useT();
  const empty = value == null || value === '';
  return (
    <div className="read-field">
      <span className="read-field__label muted">{label}</span>
      <span className="read-field__value">{empty ? t('bookMetadata.emptyValue') : value}</span>
    </div>
  );
}

export function ReadTextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  const t = useT();
  const empty = !value?.trim();
  return (
    <section className="read-text-block">
      <h3 className="read-text-block__label">{label}</h3>
      {empty ? (
        <p className="read-text-block__empty muted">{t('bookMetadata.emptyValue')}</p>
      ) : (
        <p className="read-text-block__body">{value}</p>
      )}
    </section>
  );
}
