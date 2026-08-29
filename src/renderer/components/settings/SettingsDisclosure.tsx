import { useId, useState, type ReactNode } from 'react';

export function SettingsDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className="settings-disclosure">
      <button
        type="button"
        className="settings-disclosure__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <span className="settings-disclosure__title">{title}</span>
        {description ? (
          <span className="settings-disclosure__desc muted">{description}</span>
        ) : null}
        <span className="settings-disclosure__chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="settings-disclosure__panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}
