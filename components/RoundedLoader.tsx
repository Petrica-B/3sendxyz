'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

type LoaderProps = {
  rows?: number;
  blocks?: number; // approximate columns; will auto-fill width
  full?: boolean; // fill parent height
};

function useResponsiveCols(
  ref: React.RefObject<HTMLElement>,
  opts: { minBlockPx?: number; gapPx?: number; minCols?: number; maxCols?: number }
): number {
  const { minBlockPx = 12, gapPx = 6, minCols = 6, maxCols = 48 } = opts || {};
  const [cols, setCols] = useState<number>(minCols);
  useEffect(() => {
    if (!ref.current || typeof window === 'undefined') return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const width = cr?.width ?? el.clientWidth;
      if (!width || !Number.isFinite(width)) return;
      const fullWidth = Math.max(0, width);
      const col = Math.max(
        minCols,
        Math.min(maxCols, Math.floor((fullWidth + gapPx) / (minBlockPx + gapPx)))
      );
      setCols(col);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, minBlockPx, gapPx, minCols, maxCols]);
  return cols;
}

export function RoundedLoader({ rows = 3, blocks = 28, full = false }: LoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const responsiveCols = useResponsiveCols(containerRef, {
    minBlockPx: 12,
    gapPx: 6,
    minCols: 6,
    maxCols: 60,
  });
  const cols = useMemo(() => responsiveCols || blocks, [responsiveCols, blocks]);
  return (
    <div
      className="transferItem retroLoader"
      aria-busy="true"
      aria-live="polite"
      style={{ height: full ? '100%' : undefined }}
    >
      <div
        ref={containerRef}
        className="rl-rows"
        style={full ? ({ height: '100%', display: 'grid', gridTemplateRows: `repeat(${rows}, 1fr)` } as React.CSSProperties) : undefined}
      >
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="rl-row"
            style={{ ['--rl-cols' as any]: String(cols) }}
          >
            {Array.from({ length: cols }).map((_, c) => (
              <span
                key={c}
                className="rl-block"
                style={{ animationDelay: `${(r * 0.2 + c * 0.07).toFixed(2)}s` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoundedLoaderList({
  count = 5,
  rows = 3,
  blocks = 28,
  full,
}: LoaderProps & { count?: number }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <RoundedLoader key={i} rows={rows} blocks={blocks} full={full} />
      ))}
    </div>
  );
}

export default RoundedLoaderList;
