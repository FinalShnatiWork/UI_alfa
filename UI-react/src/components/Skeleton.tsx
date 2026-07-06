import type { CSSProperties } from 'react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Simple atomic shimmer skeleton loading visual.
 *
 * @param props styling options (width, height, borderRadius)
 * @returns Shimmering placeholder box element
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = 6, style, className }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--bg-alt) 25%, var(--border-light) 50%, var(--bg-alt) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.4s infinite',
        ...style,
      }}
    />
  );
}

/**
 * Shimmering placeholder representing a content card.
 *
 * @param props rows count and height options
 * @returns Loading placeholder card
 */
export function SkeletonCard({ rows = 3, height = 120 }: { rows?: number; height?: number }) {
  return (
    <div className="card" style={{ height, display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={16} width={i === 0 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

/**
 * Shimmering placeholder representing a table row.
 *
 * @returns Loading placeholder row table layout
 */
export function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} style={{ padding: '10px 12px' }}>
          <Skeleton height={14} />
        </td>
      ))}
    </tr>
  );
}
