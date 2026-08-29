import type { ReactNode } from 'react';

export function SettingsRow({
  label,
  description,
  control,
  htmlFor,
}: {
  label: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row__text">
        {htmlFor ? (
          <label className="settings-row__label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="settings-row__label">{label}</span>
        )}
        {description ? <p className="settings-row__desc muted">{description}</p> : null}
      </div>
      <div className="settings-row__control">{control}</div>
    </div>
  );
}
