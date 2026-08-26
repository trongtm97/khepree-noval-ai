import type { ReactNode } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Highlight search terms in plain text (local, no HTML injection). */
export function highlightText(text: string, query?: string): ReactNode {
  const q = query?.trim();
  if (!q) return text;

  const terms = [...new Set(q.split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const matched = terms.some((term) => part.toLowerCase() === term.toLowerCase());
    if (matched) {
      return <mark key={`${part}-${i}`}>{part}</mark>;
    }
    return part;
  });
}
