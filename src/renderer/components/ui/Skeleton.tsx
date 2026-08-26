interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, className = '' }: SkeletonProps) {
  return (
    <div
      className={`nt-skeleton ${className}`.trim()}
      style={{ width, height }}
      aria-hidden
    />
  );
}
