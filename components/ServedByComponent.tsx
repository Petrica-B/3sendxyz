import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function ServedBy() {
  const h = await headers();
  const hostId = h?.get('x-vercel-id') ?? process.env.EE_HOST_ID ?? 'unknown';
  const isUnknown = hostId.toLowerCase() === 'unknown';
  const versionHash = process.env.NEXT_PUBLIC_VERSION_HASH ?? 'unknown';

  return (
    <div className="servedBy">
      <a
        href="https://ratio1.ai"
        target="_blank"
        rel="noreferrer"
        style={{ fontWeight: 600 }}
        className="accentLink"
      >
        Ratio1
      </a>
      <span className="label">Node serving this dApp:</span>
      <span className={isUnknown ? 'unknown' : 'nodeName'}>{hostId}</span>
      <span className="versionSuffix">
        <span className="label versionPill">
          v.
          <span className="versionValue">{versionHash}</span>
        </span>{' '}
      </span>
    </div>
  );
}
