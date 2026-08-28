import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header page-header-row">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="btn-row">{actions}</div> : null}
    </div>
  );
}

export function SectionHeader({
  id,
  title,
  description,
  actions,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header-row section-header" style={{ marginBottom: '0.75rem' }}>
      <div>
        <h3 id={id} style={{ margin: 0, fontSize: 'var(--font-section)' }}>
          {title}
        </h3>
        {description ? <p className="muted section-header__desc">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}
