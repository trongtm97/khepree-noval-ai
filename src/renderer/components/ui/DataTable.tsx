import type { ReactNode } from 'react';
import { statusLabel, statusTone } from '../../i18n/status';

interface WorkerStatusProps {
  email?: string | null;
  status?: string | null;
}

export function WorkerStatus({ email, status }: WorkerStatusProps) {
  const tone = statusTone(status);
  return (
    <div className="topbar-meta" title={email ?? undefined}>
      <span className={`nt-status-dot nt-status-dot--${tone}`} aria-hidden />
      <span>{statusLabel(status)}</span>
      {email ? <span className="muted">{email}</span> : null}
    </div>
  );
}

export function AccountBadge({ email, plan }: { email: string; plan?: string }) {
  return (
    <span className="nt-badge nt-badge--accent">
      {email}
      {plan ? ` · ${plan}` : ''}
    </span>
  );
}

export function ChapterStatus({ done }: { done: boolean; current?: boolean }) {
  return <span aria-hidden>{done ? '✓' : '○'}</span>;
}

interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectedKey?: string | null;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, rowKey, selectedKey, onRowClick }: DataTableProps<T>) {
  return (
    <div className="nt-table-wrap">
      <table className="nt-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                className={selectedKey === key ? 'selected' : undefined}
                onClick={onRowClick ? () => { onRowClick(row); } : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key}>{col.render(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
