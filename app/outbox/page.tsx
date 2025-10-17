"use client";

import { useAccount } from "wagmi";
import { useEffect, useState } from "react";
import { SendFileCard } from "@/components/SendFileCard";
import { getPacket, listOutbox, OutboxItem, subscribe } from "@/lib/store";
import {
  shortAddress,
  shortHex,
  formatBytes,
  formatDate,
  formatDateShort,
  daysLeft,
} from "@/lib/format";
import { AddressLink, TxLink, NodeLinks } from "@/components/Links";
import { seedMockForAddress } from "@/lib/mock";

export default function OutboxPage() {
  const { address, isConnected } = useAccount();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!address) return;
    const load = () => setItems(listOutbox(address));
    load();
    // Seed mock data on first visit if empty
    if (listOutbox(address).length === 0) {
      seedMockForAddress(address)
        .then(load)
        .catch(() => {});
    }
    return subscribe(load);
  }, [address]);

  // Auto-expand mock items so their dummy details are visible
  useEffect(() => {
    if (items.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const it of items) {
        if (it.isMock && next[it.id] === undefined) next[it.id] = true;
      }
      return next;
    });
  }, [items]);

  if (!isConnected || !address) {
    return (
      <main className="col" style={{ gap: 16 }}>
        <div className="hero">
          <div className="headline">Outbox</div>
          <div className="subhead">Connect your wallet to send files.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="col" style={{ gap: 24 }}>
      <div className="hero">
        <div className="headline">Outbox</div>
        <div className="subhead">Send encrypted files to another wallet.</div>
      </div>
      <SendFileCard />

      <section className="col" style={{ gap: 12 }}>
        <div style={{ fontWeight: 700 }}>Sent items</div>
        {items.length === 0 ? (
          <div className="muted" style={{ fontSize: 12 }}>
            No sent files yet.
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {items.map((t) => (
              <div key={t.id} className="transferItem">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }} className="mono">
                    {t.name}
                  </div>
                  <div className="muted mono" style={{ fontSize: 12 }}>
                    {" "}
                    {formatBytes(t.size)} · {formatDate(t.createdAt)}
                  </div>
                  {!t.isMock && t.viaNodes && t.viaNodes.length > 0 && (
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      via <NodeLinks aliases={t.viaNodes} />
                    </div>
                  )}
                  {expanded[t.id] && (
                    <div className="details mono" style={{ fontSize: 12 }}>
                      {t.isMock ? (
                        <>
                          <div>
                            to:{" "}
                            <AddressLink
                              address={t.details?.peer || t.to}
                              size={5}
                            />
                          </div>
                          <div>
                            tx: <TxLink tx={t.details?.tx || ""} size={5} />
                          </div>
                          <div>
                            via:{" "}
                            <NodeLinks
                              aliases={
                                t.details?.via || ["draco", "lyra", "aether"]
                              }
                            />
                          </div>
                          <div>
                            encrypted message: {t.details?.encMsg || "message"}{" "}
                            (0 bytes)
                          </div>
                          <div>
                            received:{" "}
                            {t.details?.received
                              ? formatDateShort(t.details.received)
                              : "—"}
                          </div>
                          <div>
                            expiring:{" "}
                            {t.details?.expiring
                              ? `${formatDateShort(
                                  t.details.expiring
                                )} (${daysLeft(t.details.expiring)})`
                              : "—"}
                          </div>
                        </>
                      ) : (
                        (() => {
                          const p = getPacket(t.packetId);
                          const cipherPreview =
                            p?.ciphertext?.slice(0, 24) || "";
                          const clen = p?.ciphertext
                            ? typeof atob !== "undefined"
                              ? atob(p.ciphertext).length
                              : p.ciphertext.length
                            : 0;
                          return (
                            <>
                              <div>
                                to: <AddressLink address={t.to} size={5} />
                              </div>
                              <div>
                                tx:{" "}
                                {p?.sendTxHash ? (
                                  <TxLink tx={p.sendTxHash} size={5} />
                                ) : (
                                  "—"
                                )}
                              </div>
                              <div>
                                via:{" "}
                                <NodeLinks
                                  aliases={
                                    t.viaNodes && t.viaNodes.length
                                      ? t.viaNodes
                                      : p?.viaNodes || []
                                  }
                                />
                              </div>
                              <div>
                                encrypted message: {cipherPreview}… ({clen}{" "}
                                bytes)
                              </div>
                              <div>received: —</div>
                              <div>expiring: —</div>
                            </>
                          );
                        })()
                      )}
                    </div>
                  )}
                </div>
                <div className="col" style={{ alignItems: "flex-end", gap: 8 }}>
                  <button
                    className="button secondary"
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [t.id]: !e[t.id] }))
                    }
                  >
                    {expanded[t.id] ? "Hide Details" : "Details"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
