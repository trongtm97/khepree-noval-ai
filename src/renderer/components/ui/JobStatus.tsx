import { statusLabel, statusTone } from '../../i18n/status';

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const tone = statusTone(status);
  const toneClass =
    tone === 'ready' || tone === 'completed'
      ? 'nt-badge--success'
      : tone === 'running'
        ? 'nt-badge--accent'
        : tone === 'warning'
          ? 'nt-badge--warning'
          : tone === 'error'
            ? 'nt-badge--error'
            : '';

  return (
    <span className={`nt-badge ${toneClass} ${className}`.trim()}>
      <span className={`nt-status-dot nt-status-dot--${tone}`} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}
