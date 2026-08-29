import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      {title ? <h2 className="settings-section__title">{title}</h2> : null}
      {description ? <p className="settings-section__desc muted">{description}</p> : null}
      <div className="settings-section__body">{children}</div>
    </section>
  );
}
