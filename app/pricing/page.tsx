import PricingCta from '@/components/PricingCta';
import { TIER_CONFIG } from '@/lib/constants';
import type { TierConfig } from '@/lib/types';

function extractName(label: string): string {
  return label.split('—')[0]?.trim() ?? label;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

function formatBound(bytes: number): { value: string; unit: 'MB' | 'GB' } {
  if (bytes % GB === 0) return { value: String(bytes / GB), unit: 'GB' };
  if (bytes % MB === 0) return { value: String(bytes / MB), unit: 'MB' };
  // Fallback: round to MB
  return { value: String(Math.round(bytes / MB)), unit: 'MB' };
}

function formatRange(t: TierConfig): string {
  if (t.minBytes === 0) {
    // Upper is inclusive; use +1 trick when needed to snap to a clean bound
    const up =
      (t.maxBytes + 1) % MB === 0 || (t.maxBytes + 1) % GB === 0 ? t.maxBytes + 1 : t.maxBytes;
    const { value, unit } = formatBound(up);
    return `Up to ${value} ${unit}`;
  }
  // Inclusive upper bound; prefer clean snaps using +1
  const lower = formatBound(t.minBytes);
  const upper = formatBound(
    (t.maxBytes + 1) % MB === 0 || (t.maxBytes + 1) % GB === 0 ? t.maxBytes + 1 : t.maxBytes
  );
  if (lower.unit === upper.unit)
    return `${lower.value} ${lower.unit} – ${upper.value} ${upper.unit}`;
  return `${lower.value} ${lower.unit} – ${upper.value} ${upper.unit}`;
}

export default function PricingPage() {
  return (
    <main className="col" style={{ gap: 24 }}>
      <section className="hero">
        <div className="headline">Pricing</div>
        <div className="subhead">Simple, pay-as-you-send tiers for file size.</div>
      </section>

      <PricingCta />

      <div className="pricingGrid">
        {TIER_CONFIG.map((tier) => {
          const name = extractName(tier.label);
          const range = formatRange(tier);
          return (
            <div key={tier.id} className="card" style={{ display: 'grid', gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                <div className="pill">${tier.usd.toFixed(2)} burn</div>
              </div>
              {range && (
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div aria-label="size-range" style={{ color: 'var(--accent)', fontSize: 12 }}>
                    {range}
                  </div>
                </div>
              )}
              <div className="muted" style={{ fontSize: 12 }}>
                {tier.description}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
