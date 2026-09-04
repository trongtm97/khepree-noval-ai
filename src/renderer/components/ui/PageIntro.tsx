import type { ReactNode } from 'react';

/**
 * Concise page purpose line under the title.
 * Answers: Đây là gì? Tôi làm gì ở đây?
 */
export function PageIntro({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`page-intro ${className}`.trim()}>{children}</p>;
}
