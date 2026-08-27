interface ProgressBarProps {
  value?: number | null;
  max?: number;
  label?: string;
  indeterminate?: boolean;
}

export function ProgressBar({
  value = 0,
  max = 100,
  label,
  indeterminate = false,
}: ProgressBarProps) {
  const showIndeterminate =
    indeterminate || value == null || (typeof value === 'number' && Number.isNaN(value));
  const pct = showIndeterminate
    ? 0
    : max <= 0
      ? 0
      : Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={`nt-progress${showIndeterminate ? ' nt-progress--indeterminate' : ''}`}
      role="progressbar"
      aria-valuenow={showIndeterminate ? undefined : Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="nt-progress__bar"
        style={showIndeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}
