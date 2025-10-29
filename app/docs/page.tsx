export default function DocsPage() {
  return (
    <main className="col" style={{ gap: 24 }}>
      <section className="hero">
        <div className="headline">3send Documentation. Learn More About How It Works.</div>
        <div className="subhead">
          Send files wallet-to-wallet on Base via Ratio1 End‑to‑end encrypted, decentralized file
          transfer. You hold the keys.
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5, maxWidth: 640 }}>
          It exists for the moments when speed and privacy both matter: shipping production builds
          to a distributed team, delivering legal evidence to counsel, or dropping a stealth launch
          asset to investors. Ratio1 provides the neutral rails; 3send wraps them in an interface
          anyone with a wallet can use.
        </div>
      </section>

      <section className="card col" style={{ gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Send Anything, Stay Sovereign</div>
        <div className="muted" style={{ fontSize: 12 }}>
          3send lets any wallet owner send end-to-end encrypted files. Pick a recipient address, pay
          the burn fee, and the app handles encryption, upload, and inbox delivery. No extra
          accounts, no seed phrase required to get going.
        </div>
        <ul className="muted" style={{ fontSize: 12, display: 'grid', gap: 4 }}>
          <li>Easy mode: connect a wallet, choose a file, click &quot;Pay &amp; Send&quot;.</li>
          <li>
            Privacy upgrades: switch to passkeys or a recovery phrase when you want to hold your own
            decryption keys.
          </li>
          <li>
            Fully on-chain accountability: every send emits a burn event on the Ratio1 manager
            contract.
          </li>
          <li>
            Time-boxed inboxes: Ratio1 edge nodes retain encrypted payloads for seven days before
            they are purged, keeping the network lean and minimizing data linger.
          </li>
        </ul>
      </section>

      <section className="card col" style={{ gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>How 3send Fits Inside Ratio1</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Under the hood 3send is a Ratio1 dapp. Each transfer uses two primitives exposed by the
          Ratio1 Edge SDK:
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              <code>cstore</code> — encrypted control plane
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Think of cstore as a decentralized key-value map that Ratio1 nodes replicate. 3send
              hashes each recipient into a namespaced hash key (for example{' '}
              <code>3sendxyz_received_files_0xabc…</code>) and stores the send record under the
              payment transaction hash. The record includes the CID, encrypted metadata, payment
              amounts, and timestamps. Because cstore entries are authenticated and append-only,
              recipients can reconstruct their inbox from any Ratio1 edge node with a single lookup.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              <code>r1fs</code> — payload storage
            </div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              r1fs is Ratio1’s content-addressed file store. After a file is encrypted in the
              browser, 3send uploads the base64 payload together with the original filename. The SDK
              returns a CID that is saved in cstore. Recipients download the ciphertext by
              presenting the CID plus their wallet-derived secret, so only the intended address can
              resolve the blob.
            </div>
          </div>
        </div>
      </section>

      <section className="card col" style={{ gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Fueling the Ratio1 Economy</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Every transfer routes through the 3send Manager contract. You can pay with ETH, USDC, or
          R1. Whatever you submit is auto-swapped behind the scenes into the exact R1 amount for the
          chosen tier. That R1 is then burned — permanently removed from supply — and the contract
          emits a <code>PaymentProcessed</code> event. 3send watches the event to validate the tier,
          the sender, and both the USDC equivalent and R1 burn totals before any data touches Ratio1
          storage.
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          The result: every file you send tightens R1 scarcity while compensating edge nodes through
          protocol rewards. Power users can audit the burn trail directly on-chain via the manager
          address published in <code>lib/constants.ts</code>.
        </div>
      </section>

      <section className="card col" style={{ gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Deep Dive: Encryption Pipeline</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Want to know more about the protocol? Here is how each transfer is sealed, transported,
          and expired. Every step lives in this repo, so you can verify or fork the exact
          implementation.
        </div>
        <ol className="muted" style={{ fontSize: 12, display: 'grid', gap: 8 }}>
          <li>
            <strong>Session handshake.</strong> The sender fetches the recipient’s X25519 public key
            (vault, passkey, or seed-derived). It generates an ephemeral X25519 pair and computes a
            shared secret with <code>x25519.getSharedSecret</code>. The 32-byte secret is hashed
            with SHA-256 to become the AES-GCM key (see <code>lib/encryption.ts</code>).
          </li>
          <li>
            <strong>Payload sealing.</strong> Files are encrypted with AES-GCM using random 12-byte
            IVs from <code>crypto.getRandomValues</code>. Optional notes reuse the same symmetric
            key but get fresh IVs. Plaintext and ciphertext lengths are recorded in the envelope for
            size verification.
          </li>
          <li>
            <strong>Metadata envelope.</strong> The envelope bundles the ephemeral public key,
            recipient address, IVs, and optional note ciphertext. During download,
            <code>decryptFileFromEnvelope</code> recomputes the shared secret from the recipient’s
            private key—whether it was unlocked from the vault, derived from a passkey PRF, or
            hashed from a mnemonic.
          </li>
          <li>
            <strong>Transport &amp; expiry.</strong> Ciphertext is persisted to Ratio1 r1fs under
            the returned CID, while the envelope and payment proof land in <code>cstore</code>. Edge
            nodes enforce a seven-day retention window; after that, fetches fail because the blob is
            gone.
          </li>
        </ol>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Dig into <code>lib/encryption.ts</code>, <code>lib/passkeyClient.ts</code>,{' '}
          <code>lib/keys.ts</code>, and the API routes under <code>app/api</code>. Everything is
          open source and reviewable in the 3send repository.
        </div>
      </section>

      <section className="card col" style={{ gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>Encryption Modes for Every Profile</div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          Files are always encrypted client-side with AES-GCM keys derived from a Ratio1 session.
          What changes between modes is where the long-term private key lives:
        </div>
        <div className="col" style={{ gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Light Mode (Vault)</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Ideal for newcomers. 3send generates an X25519 key pair and stores the encrypted
              private key in Ratio1 cstore using a server-held secret. Any of your connected devices
              can fetch and decrypt it after you sign a wallet challenge. Convenience comes first,
              while still keeping raw files encrypted at rest.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Passkey Mode</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              Hardware-backed WebAuthn credentials keep the private key on your device’s secure
              enclave. 3send registers only the public key and a PRF salt, so decryption requires
              your biometric or device PIN. When you fetch a file the browser evaluates the WebAuthn
              PRF extension with that salt, runs the output through HKDF-SHA256 with info{' '}
              <code>3send:x25519:sk:v1</code>, clamps the 32-byte result into an X25519 scalar, and
              derives the private key entirely inside the secure element. Use this when you want
              phishing-resistant security with minimal friction.
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Recovery Phrase Mode</div>
            <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
              For privacy maximalists, a 24-word seed deterministically derives the decryption key.
              The normalized phrase is hashed with SHA-256 client-side to produce the X25519 key
              (see <code>lib/keys.ts</code>), and the mnemonic only ever sits in your device’s local
              storage if you opt to save it. 3send never transmits the phrase or private key. Write
              it down or stash it in a hardware vault so you can import it on other devices. Lose
              the phrase and the inbox is gone forever, and nobody else — including 3send — can
              unlock your archived files.
            </div>
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          You can swap modes at any time from the Profile page. Switching rotates the key material,
          so re-download anything important before promoting yourself from Light to Pro.
        </div>
      </section>
    </main>
  );
}
