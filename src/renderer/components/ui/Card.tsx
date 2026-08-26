import type { CSSProperties, ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  as?: 'article' | 'section' | 'div';
  style?: CSSProperties;
}

export function Card({ children, className = '', as: Tag = 'article', style }: CardProps) {
  return (
    <Tag className={`nt-card ${className}`.trim()} style={style}>
      {children}
    </Tag>
  );
}
