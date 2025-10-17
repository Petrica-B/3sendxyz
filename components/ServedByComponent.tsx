import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default function ServedBy() {
  const h = headers();
  const hostId = h.get("x-vercel-id") ?? process.env.EE_HOST_ID ?? "unknown";
  const isUnknown = hostId.toLowerCase() === "unknown";

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
      <span className="label">Edge node proudly serving this site:</span>
      <span className={isUnknown ? "unknown" : "nodeName"}>{hostId}</span>
    </div>
  );
}
