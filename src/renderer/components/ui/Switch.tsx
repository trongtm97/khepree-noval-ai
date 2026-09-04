interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <label className={`nt-switch-row${disabled ? ' nt-switch-row--disabled' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="nt-switch"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onChange(!checked);
        }}
      />
      {label ? <span className="nt-switch-label">{label}</span> : null}
    </label>
  );
}
