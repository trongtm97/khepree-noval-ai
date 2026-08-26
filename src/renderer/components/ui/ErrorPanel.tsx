import type { ReactNode } from 'react';
import { useT } from '../../i18n';
import { Button } from './Button';
import { HelpLearnMoreButton } from '../../features/help/HelpContextButton';

interface ErrorPanelProps {
  title: string;
  description: string;
  technical?: string | null;
  tone?: 'error' | 'warning' | 'info';
  helpArticleId?: string;
  actions?: { label: string; onClick: () => void; primary?: boolean }[];
  children?: ReactNode;
}

export function ErrorPanel({
  title,
  description,
  technical,
  tone = 'error',
  helpArticleId,
  actions,
  children,
}: ErrorPanelProps) {
  const t = useT();
  return (
    <div className={`nt-error-panel nt-error-panel--${tone}`}>
      <h3 style={{ margin: '0 0 0.35rem', fontSize: 'var(--font-section)' }}>{title}</h3>
      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{description}</p>
      {children}
      {(actions && actions.length > 0) || helpArticleId ? (
        <div className="btn-row" style={{ marginTop: '0.75rem' }}>
          {actions?.map((a) => (
            <Button key={a.label} variant={a.primary ? 'primary' : 'secondary'} onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
          {helpArticleId ? <HelpLearnMoreButton articleId={helpArticleId} /> : null}
        </div>
      ) : null}
      {technical ? (
        <details>
          <summary>{t('errors.technicalDetails')}</summary>
          <pre>{technical}</pre>
        </details>
      ) : null}
    </div>
  );
}
