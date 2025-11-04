import React from 'react';

type LoaderProps = {
  rows?: number;
  blocks?: number;
};

export function RoundedLoader({ rows = 3, blocks = 14 }: LoaderProps) {
  return (
    <div className="transferItem retroLoader" aria-busy="true" aria-live="polite">
      <div className="rl-rows">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="rl-row">
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
  blocks = 14,
}: LoaderProps & { count?: number }) {
  return (
    <div className="col" style={{ gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <RoundedLoader key={i} rows={rows} blocks={blocks} />
      ))}
    </div>
  );
}

export default RoundedLoaderList;

