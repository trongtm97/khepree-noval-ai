import type { ReactNode } from 'react';

export function SettingsStatus({
  tone = 'info',
  children,
  live,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  children: ReactNode;
  live?: 'polite' | 'assertive';
}) {
  return (
    <p
      className={`settings-status settings-status--${tone}`}
      role={live ? 'status' : undefined}
      aria-live={live}
    >
      {children}
    </p>
  );
}
