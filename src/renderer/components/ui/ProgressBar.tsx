interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      className="nt-progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="nt-progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}
