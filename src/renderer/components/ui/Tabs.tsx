import type { ReactNode } from 'react';

interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
}

export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div className="nt-tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          className={`nt-tab ${item.id === value ? 'active' : ''}`}
          onClick={() => {
            onChange(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return null;
  return <div role="tabpanel">{children}</div>;
}
