import type { ReactNode } from 'react';

interface KhepreeInfoRowProps {
  label: string;
  value: ReactNode;
  stacked?: boolean;
}

export function KhepreeInfoRow({ label, value, stacked = false }: KhepreeInfoRowProps) {
  return (
    <div className={`khepree-info-row${stacked ? ' khepree-info-row--stacked' : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
