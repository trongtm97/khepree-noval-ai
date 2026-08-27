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
  const primaryCount = actions?.filter((a) => a.primary).length ?? 0;
  return (
    <div className={`nt-error-panel nt-error-panel--${tone}`} role="alert">
      <h3 className="nt-error-panel__title">{title}</h3>
      <p className="nt-error-panel__desc">{description}</p>
      {children}
      {(actions && actions.length > 0) || helpArticleId ? (
        <div className="btn-row nt-error-panel__actions">
          {actions?.map((a, index) => (
            <Button
              key={a.label}
              variant={a.primary || (primaryCount === 0 && index === 0) ? 'primary' : 'secondary'}
              onClick={a.onClick}
            >
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
