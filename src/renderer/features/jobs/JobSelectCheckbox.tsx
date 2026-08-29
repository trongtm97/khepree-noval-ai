export interface JobSelectCheckboxProps {
  jobId: string;
  checked: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onToggle: (jobId: string) => void;
}

export function JobSelectCheckbox({
  jobId,
  checked,
  disabled,
  ariaLabel,
  onToggle,
}: JobSelectCheckboxProps) {
  return (
    <label className="jobs-select-checkbox">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={() => {
          onToggle(jobId);
        }}
      />
    </label>
  );
}
