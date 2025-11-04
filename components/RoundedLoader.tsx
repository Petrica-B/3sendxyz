import React from 'react';

type LoaderProps = {
  rows?: number;
  blocks?: number; // approximate columns; will auto-fill width
  full?: boolean; // fill parent height
};

export function RoundedLoader({ rows = 3, blocks = 28, full = false }: LoaderProps) {
  return (
    <div
      className="transferItem retroLoader"
      aria-busy="true"
      aria-live="polite"
      style={{ height: full ? '100%' : undefined }}
    >
      <div
        className="rl-rows"
        style={full ? ({ height: '100%', display: 'grid', gridTemplateRows: `repeat(${rows}, 1fr)` } as React.CSSProperties) : undefined}
      >
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="rl-row"
            style={{ ['--rl-cols' as any]: String(blocks) }}
          >
            {Array.from({ length: blocks }).map((_, c) => (
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
