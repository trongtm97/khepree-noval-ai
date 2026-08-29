import { Button } from '../ui';

export function StoragePathRow({
  path,
  notConfiguredLabel,
  changeLabel,
  openLabel,
  busy,
  onChange,
  onOpen,
}: {
  path: string | null;
  notConfiguredLabel: string;
  changeLabel: string;
  openLabel: string;
  busy?: boolean;
  onChange: () => void;
  onOpen?: () => void;
}) {
  const display = path ?? notConfiguredLabel;

  return (
    <div className="settings-path-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <span
        className="path-value muted"
        title={path ?? undefined}
        style={{ flex: '1 1 12rem', minWidth: 0, maxWidth: '100%' }}
      >
        {display}
      </span>
      <div className="btn-row" style={{ flex: '0 0 auto' }}>
        <Button variant="secondary" disabled={busy} onClick={onChange}>
          {changeLabel}
        </Button>
        {path && onOpen ? (
          <Button variant="secondary" disabled={busy} onClick={onOpen}>
            {openLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
